"""Détection (YOLO), tracking (ByteTrack via le package `trackers`) et affectation d'équipe
(couleur de maillot) par frame.

Note API : `supervision.ByteTrack` est déprécié depuis la 0.28 (retrait en 0.31) au profit du
package `trackers` (`ByteTrackTracker`, méthode `update()` au lieu de `update_with_detections()`)
— vérifié directement dans le code installé plutôt que supposé, l'un ne redirige pas vers l'autre.
"""
import cv2
import numpy as np
import supervision as sv
from ultralytics import YOLO
from trackers import ByteTrackTracker

PERSON_CLASS = 0
BALL_CLASS = 32  # "sports ball" COCO — modèle générique pour la V1, à remplacer par un modèle
                  # football dédié (ex. Roboflow Universe) une fois la mécanique validée.

REID_MAX_GAP_SECONDS = 45.0  # au-delà, on ne tente plus de relier une nouvelle trace à une ancienne
REID_COLOR_MAX_DIST = 40.0   # distance HSV (0-255/canal) en dessous de laquelle on relie deux traces


def _shirt_color(frame_bgr, box):
    """Couleur moyenne (HSV) du tiers supérieur de la boîte — approxime le maillot plutôt que le short."""
    x1, y1, x2, y2 = [int(v) for v in box]
    y2_shirt = y1 + max(1, (y2 - y1) // 3)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2_shirt = min(frame_bgr.shape[1], x2), min(frame_bgr.shape[0], y2_shirt)
    if x2 <= x1 or y2_shirt <= y1:
        return None
    crop = frame_bgr[y1:y2_shirt, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    return hsv.reshape(-1, 3).mean(axis=0)


class TeamAssigner:
    """Calibre les deux couleurs d'équipe sur les premières détections rencontrées, puis affecte
    chaque trace à l'équipe la plus proche ('autre' si trop loin des deux — arbitre probable)."""

    def __init__(self, calibration_samples=60):
        self.calibration_samples = calibration_samples
        self._samples = []
        self.centers = None  # (2, 3) HSV

    def observe(self, color):
        if color is not None and self.centers is None:
            self._samples.append(color)
            if len(self._samples) >= self.calibration_samples:
                self._fit()

    def _fit(self):
        data = np.array(self._samples, dtype=np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
        _, _, centers = cv2.kmeans(data, 2, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
        self.centers = centers

    def assign(self, color):
        if self.centers is None or color is None:
            return None
        d0 = float(np.linalg.norm(color - self.centers[0]))
        d1 = float(np.linalg.norm(color - self.centers[1]))
        if min(d0, d1) > 80:  # trop loin des deux équipes -> probablement un arbitre
            return "autre"
        return "A" if d0 < d1 else "B"


class ReIdentifier:
    """Ré-identification par apparence : relie une trace qui réapparaît après être sortie du cadre à
    son identité précédente plutôt que de lui en attribuer une nouvelle. Approximatif par construction
    (couleur de maillot + dernière équipe connue) — marge d'erreur assumée pour le cas follow cam."""

    def __init__(self):
        self.lost = {}    # canonical_id -> {"color", "team", "t"}
        self.remap = {}   # id ByteTrack -> canonical_id déjà résolu

    def canonical(self, track_id):
        return self.remap.get(track_id, track_id)

    def mark_lost(self, track_id, color, team, t):
        if color is None:
            return
        self.lost[self.canonical(track_id)] = {"color": color, "team": team, "t": t}

    def resolve(self, track_id, color, team, t):
        """Trace ByteTrack jamais vue jusqu'ici : cherche un candidat perdu récemment, même équipe,
        couleur proche. Sinon la trace reste nouvelle (nouveau joueur, ou ré-identification ratée)."""
        if track_id in self.remap:
            return self.remap[track_id]
        best_cid, best_dist = None, REID_COLOR_MAX_DIST
        for cid, info in list(self.lost.items()):
            if t - info["t"] > REID_MAX_GAP_SECONDS:
                del self.lost[cid]
                continue
            if color is None or info["team"] != team:
                continue
            dist = float(np.linalg.norm(color - info["color"]))
            if dist < best_dist:
                best_dist, best_cid = dist, cid
        if best_cid is not None:
            self.remap[track_id] = best_cid
            del self.lost[best_cid]
            return best_cid
        return track_id


class Tracker:
    def __init__(self, model_path="yolov8n.pt", device="cpu", confidence=0.3, frame_rate=25.0):
        self.model = YOLO(model_path)
        self.device = device
        self.confidence = confidence
        self.byte_track = ByteTrackTracker(frame_rate=frame_rate, lost_track_buffer=int(frame_rate * 3))
        self.team_assigner = TeamAssigner()
        self.reid = ReIdentifier()
        self._last_seen = {}  # track_id ByteTrack -> (color, team), pour marquer "lost" au bon moment
        self._active_last_frame = set()

    def process_frame(self, frame_bgr, t_seconds):
        """Retourne (joueurs, position_ballon).
        joueurs = liste de {"track_id": id stable ré-identifié, "team": "A"/"B"/"autre"/None,
                             "px": float, "py": float}  (px, py = pieds au sol, en pixels image)
        position_ballon = (px, py) en pixels, ou None si aucun ballon détecté cette frame."""
        result = self.model(frame_bgr, device=self.device, verbose=False,
                             classes=[PERSON_CLASS, BALL_CLASS])[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = detections[detections.confidence > self.confidence]

        people = detections[detections.class_id == PERSON_CLASS]
        balls = detections[detections.class_id == BALL_CLASS]
        # `frame=` n'est pas utilisé par l'estimateur d'état par défaut (avertissement sinon) —
        # notre ReIdentifier gère la ré-identification par apparence séparément.
        tracked = self.byte_track.update(people, timestamp=t_seconds)

        active_now = set()
        out_players = []
        for box, track_id in zip(tracked.xyxy, tracked.tracker_id):
            if track_id is None or track_id < 0:
                continue  # trace pas encore confirmée par ByteTrack (minimum_consecutive_frames)
            track_id = int(track_id)
            color = _shirt_color(frame_bgr, box)
            self.team_assigner.observe(color)
            team = self.team_assigner.assign(color)

            canonical_id = self.reid.resolve(track_id, color, team, t_seconds)
            active_now.add(track_id)
            self._last_seen[track_id] = (color, team)

            out_players.append({
                "track_id": canonical_id,
                "team": team,
                "px": float((box[0] + box[2]) / 2),
                "py": float(box[3]),
            })

        for lost_id in self._active_last_frame - active_now:
            color, team = self._last_seen.get(lost_id, (None, None))
            self.reid.mark_lost(lost_id, color, team, t_seconds)
        self._active_last_frame = active_now

        ball_xy = None
        if len(balls) > 0:
            best = int(np.argmax(balls.confidence))
            bx = balls.xyxy[best]
            ball_xy = (float((bx[0] + bx[2]) / 2), float((bx[1] + bx[3]) / 2))

        return out_players, ball_xy
