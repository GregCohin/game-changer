"""Détection (YOLO), tracking (ByteTrack via le package `trackers`) et affectation d'équipe
(couleur de maillot) par frame.

Note API : `supervision.ByteTrack` est déprécié depuis la 0.28 (retrait en 0.31) au profit du
package `trackers` (`ByteTrackTracker`, méthode `update()` au lieu de `update_with_detections()`)
— vérifié directement dans le code installé plutôt que supposé, l'un ne redirige pas vers l'autre.

Ré-identification (ReIdentifier) : par embedding d'apparence (torchreid/OSNet), pas par couleur
brute. Validé empiriquement sur un vrai extrait (ALDM-FCSN) avant intégration : similarité cosinus
moyenne ~0.88 entre crops d'un même joueur, ~0.59 entre joueurs différents — nette séparation. La
couleur de maillot reste utilisée séparément pour l'affectation d'équipe (TeamAssigner), qui est un
problème plus simple (2 classes déséquilibrées par les couleurs, pas une identité individuelle).
"""
from pathlib import Path

import cv2
import numpy as np
import torch
import supervision as sv
from ultralytics import YOLO
from trackers import ByteTrackTracker
from torchreid.reid.utils import FeatureExtractor

DEFAULT_DETECTION_WEIGHTS = Path(__file__).parent / "weights" / "yolov8m-640-football-players.pt"
# Classes du modèle football dédié (Darkmyter/Football-Players-Tracking, YOLOv8m réentraîné sur le
# jeu "football-players-detection" de Roboflow) — vérifiées directement via model.names, PAS l'ordre
# du README. Détecte nettement plus de joueurs que YOLO générique + classe COCO "person" (jusqu'à
# +60-70% sur des frames réelles testées) et sépare nativement arbitre/gardien/joueur/ballon, ce qui
# permet d'exclure les arbitres du suivi plutôt que de les compter comme des joueurs.
BALL_CLASS = 0
PLAYER_CLASSES = [1, 2]  # goalkeeper, player — les deux comptent pour les stats physiques
REFEREE_CLASS = 3        # explicitement exclu du tracking

REID_WEIGHTS = Path(__file__).parent / "weights" / "osnet_x0_25_msmt17.pt"
REID_MAX_GAP_SECONDS = 90.0    # signal bien plus fiable que la couleur -> fenêtre élargie
REID_EMBEDDING_MIN_SIM = 0.75  # similarité cosinus mini pour relier deux traces (cf. validation ci-dessus)


def _shirt_color(frame_bgr, box):
    """Couleur moyenne (HSV) du tiers supérieur de la boîte — approxime le maillot plutôt que le short.
    Sert uniquement à l'affectation d'équipe (TeamAssigner), pas à la ré-identification individuelle."""
    x1, y1, x2, y2 = [int(v) for v in box]
    y2_shirt = y1 + max(1, (y2 - y1) // 3)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2_shirt = min(frame_bgr.shape[1], x2), min(frame_bgr.shape[0], y2_shirt)
    if x2 <= x1 or y2_shirt <= y1:
        return None
    crop = frame_bgr[y1:y2_shirt, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    return hsv.reshape(-1, 3).mean(axis=0)


def _crop(frame_bgr, box):
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame_bgr.shape[1], x2), min(frame_bgr.shape[0], y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame_bgr[y1:y2, x1:x2]


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
    """Ré-identification par embedding d'apparence (OSNet) : relie une trace qui réapparaît après
    être sortie du cadre à son identité précédente plutôt que de lui en attribuer une nouvelle.
    Reste imparfait (deux joueurs très similaires d'apparence peuvent se confondre), mais nettement
    plus fiable qu'un simple appariement de couleur moyenne — cf. validation en tête de fichier."""

    def __init__(self):
        self.lost = {}    # canonical_id -> {"embedding", "team", "t"}
        self.remap = {}   # id ByteTrack -> canonical_id déjà résolu
        # Diagnostic : combien de fois resolve() a effectivement retrouvé un candidat, vs combien de
        # fois une trace ByteTrack jamais vue avait au moins un candidat récent de la même équipe
        # disponible (donc une vraie occasion de fusionner, ratée ou réussie) — permet de savoir si
        # la ré-identification est le facteur limitant ou si le décrochage se produit ailleurs
        # (perte interne à ByteTrack, trop rapide pour même atteindre cette logique).
        self.merges = 0
        self.opportunities = 0

    def canonical(self, track_id):
        return self.remap.get(track_id, track_id)

    def mark_lost(self, track_id, embedding, team, t):
        if embedding is None:
            return
        self.lost[self.canonical(track_id)] = {"embedding": embedding, "team": team, "t": t}

    def resolve(self, track_id, embedding, team, t):
        """Trace ByteTrack jamais vue jusqu'ici : cherche un candidat perdu récemment, même équipe,
        embedding proche. Sinon la trace reste nouvelle (nouveau joueur, ou ré-identification ratée)."""
        if track_id in self.remap:
            return self.remap[track_id]
        candidate_seen = False
        best_cid, best_sim = None, REID_EMBEDDING_MIN_SIM
        for cid, info in list(self.lost.items()):
            if t - info["t"] > REID_MAX_GAP_SECONDS:
                del self.lost[cid]
                continue
            if embedding is None or info["team"] != team:
                continue
            candidate_seen = True
            sim = float(np.dot(embedding, info["embedding"]))  # vecteurs déjà normalisés
            if sim > best_sim:
                best_sim, best_cid = sim, cid
        if candidate_seen:
            self.opportunities += 1
        if best_cid is not None:
            self.merges += 1
            self.remap[track_id] = best_cid
            del self.lost[best_cid]
            return best_cid
        return track_id


class Tracker:
    def __init__(self, model_path=None, device="cpu", confidence=0.3, frame_rate=25.0):
        model_path = model_path or str(DEFAULT_DETECTION_WEIGHTS)
        if model_path == str(DEFAULT_DETECTION_WEIGHTS) and not DEFAULT_DETECTION_WEIGHTS.exists():
            raise FileNotFoundError(
                f"Poids de détection football manquants : {DEFAULT_DETECTION_WEIGHTS} — lance setup.sh."
            )
        self.model = YOLO(model_path)
        self.device = device
        self.confidence = confidence
        self.byte_track = ByteTrackTracker(frame_rate=frame_rate, lost_track_buffer=int(frame_rate * 3))
        self.team_assigner = TeamAssigner()
        self.reid = ReIdentifier()
        self._last_seen = {}  # track_id ByteTrack -> (embedding, team), pour marquer "lost" au bon moment
        self._active_last_frame = set()
        # Équipe verrouillée par identité canonique dès la 1re classification réussie : un maillot ne
        # change pas de couleur en cours de match, donc on ne veut pas qu'un même joueur soit reclassé
        # différemment (et donc fragmenté dans les accumulateurs) si une frame donnée classe mal sa
        # couleur — repéré concrètement en testant sur un match réel noir/blanc, où la teinte HSV est
        # peu fiable pour distinguer deux couleurs proches de l'achromatique.
        self._known_team = {}
        if not REID_WEIGHTS.exists():
            raise FileNotFoundError(
                f"Poids de ré-identification manquants : {REID_WEIGHTS} — lance setup.sh."
            )
        self.reid_extractor = FeatureExtractor(
            model_name="osnet_x0_25", model_path=str(REID_WEIGHTS), device=device, verbose=False
        )

    def _embeddings(self, frame_bgr, boxes, indices):
        """Extrait un embedding normalisé par boîte (indices = positions dans `boxes` à traiter),
        en un seul appel batché — nettement plus rapide que boîte par boîte."""
        crops, valid = [], []
        for i in indices:
            c = _crop(frame_bgr, boxes[i])
            if c is not None:
                crops.append(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))
                valid.append(i)
        if not crops:
            return {}
        with torch.no_grad():
            feats = self.reid_extractor(crops)
            feats = feats / feats.norm(dim=1, keepdim=True)
        return {i: feats[k].cpu().numpy() for k, i in enumerate(valid)}

    def process_frame(self, frame_bgr, t_seconds):
        """Retourne (joueurs, position_ballon).
        joueurs = liste de {"track_id": id stable ré-identifié, "team": "A"/"B"/"autre"/None,
                             "px": float, "py": float}  (px, py = pieds au sol, en pixels image)
        position_ballon = (px, py) en pixels, ou None si aucun ballon détecté cette frame."""
        # Arbitre volontairement absent de `classes` : jamais suivi comme joueur.
        result = self.model(frame_bgr, device=self.device, verbose=False,
                             classes=PLAYER_CLASSES + [BALL_CLASS])[0]
        detections = sv.Detections.from_ultralytics(result)
        detections = detections[detections.confidence > self.confidence]

        people = detections[np.isin(detections.class_id, PLAYER_CLASSES)]
        balls = detections[detections.class_id == BALL_CLASS]
        # `frame=` n'est pas utilisé par l'estimateur d'état par défaut (avertissement sinon) —
        # notre ReIdentifier gère la ré-identification par apparence séparément.
        tracked = self.byte_track.update(people, timestamp=t_seconds)

        confirmed = [i for i, tid in enumerate(tracked.tracker_id) if tid is not None and tid >= 0]
        embeddings = self._embeddings(frame_bgr, tracked.xyxy, confirmed)

        active_now = set()
        out_players = []
        for i in confirmed:
            box, track_id = tracked.xyxy[i], int(tracked.tracker_id[i])
            embedding = embeddings.get(i)
            color = _shirt_color(frame_bgr, box)
            self.team_assigner.observe(color)
            team = self.team_assigner.assign(color)

            canonical_id = self.reid.resolve(track_id, embedding, team, t_seconds)
            if canonical_id in self._known_team:
                team = self._known_team[canonical_id]
            elif team is not None:
                self._known_team[canonical_id] = team
            active_now.add(track_id)
            self._last_seen[track_id] = (embedding, team)

            out_players.append({
                "track_id": canonical_id,
                "team": team,
                "px": float((box[0] + box[2]) / 2),
                "py": float(box[3]),
            })

        for lost_id in self._active_last_frame - active_now:
            embedding, team = self._last_seen.get(lost_id, (None, None))
            self.reid.mark_lost(lost_id, embedding, team, t_seconds)
        self._active_last_frame = active_now

        ball_xy = None
        if len(balls) > 0:
            best = int(np.argmax(balls.confidence))
            bx = balls.xyxy[best]
            ball_xy = (float((bx[0] + bx[2]) / 2), float((bx[1] + bx[3]) / 2))

        return out_players, ball_xy
