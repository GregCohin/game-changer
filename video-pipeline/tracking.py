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
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform
from ultralytics import YOLO
from trackers import ByteTrackTracker
from torchreid.reid.utils import FeatureExtractor

from metrics import (
    TrackAccumulator, MAX_PLAUSIBLE_SPEED_MS, PITCH_WIDTH_M, PITCH_LENGTH_M, THUMBNAIL_CANDIDATES_MAX,
)

DEFAULT_DETECTION_WEIGHTS = Path(__file__).parent / "weights" / "yolov8m-640-football-players.pt"
# Classes du modèle football dédié (Darkmyter/Football-Players-Tracking, YOLOv8m réentraîné sur le
# jeu "football-players-detection" de Roboflow) — vérifiées directement via model.names, PAS l'ordre
# du README. Détecte nettement plus de joueurs que YOLO générique + classe COCO "person" (jusqu'à
# +60-70% sur des frames réelles testées) et sépare nativement arbitre/gardien/joueur/ballon, ce qui
# permet d'exclure les arbitres du suivi plutôt que de les compter comme des joueurs.
BALL_CLASS = 0
GOALKEEPER_CLASS = 1
PLAYER_CLASSES = [1, 2]  # goalkeeper, player — les deux comptent pour les stats physiques
REFEREE_CLASS = 3        # explicitement exclu du tracking

REID_WEIGHTS = Path(__file__).parent / "weights" / "osnet_x0_25_msmt17.pt"
REID_MAX_GAP_SECONDS = 90.0    # signal bien plus fiable que la couleur -> fenêtre élargie
# Regroupement global (cluster_tracks_globally) : seuil plus strict que la ré-id en flux ci-dessous.
# La validation initiale (0.88 même trace / 0.59 traces différentes) mélangeait des paires de
# n'importe quelle équipe — beaucoup faciles à distinguer par la seule couleur de maillot. Le
# regroupement global ne compare QUE des joueurs de la MÊME équipe (le maillot ne différencie donc
# plus rien), une tâche plus dure où deux joueurs différents peuvent être plus proches que prévu.
# Repéré concrètement : avec 0.75 ici, plusieurs joueurs réels différents ont été fusionnés en une
# seule trace (couverture résultante > 1.0, mathématiquement impossible — bug corrigé).
REID_GLOBAL_MIN_SIM = 0.88
# Ré-id EN FLUX (ReIdentifier.resolve, cf. classe ci-dessous) : laissé à 0.75 par erreur alors que
# resolve() ne compare QUE des candidats de la MÊME équipe (cf. `info["team"] != team` plus bas) —
# exactement le cas "plus dur" décrit ci-dessus pour REID_GLOBAL_MIN_SIM, jamais corrigé ici. Repéré
# le 2026-09-15 en repassant en revue les vignettes : sur un échantillon de 8 traces prises au hasard
# sur le match complet, 5 mélangeaient des images de personnes différentes (parfois même
# gardien/arbitre vs joueur de champ, quand leur couleur de maillot a été mal classée une frame
# donnée). Un follow-cam qui recadre/zoome en continu fait sortir et rentrer les joueurs du cadre très
# souvent (~19000 tentatives de ré-id sur un seul match), largement assez d'occasions pour qu'un seuil
# trop permissif contamine une bonne partie des traces. Comparé sur un même extrait de 8 min : 0.75
# seul (314 traces finales, 2-5/8 mélanges observés) vs 0.88 seul (1030 traces, 1/8) vs 0.80 combiné
# aux critères multi-facteurs ci-dessous (673 traces, 2/8) — ce dernier retenu comme défaut, propreté
# proche de 0.88 seul avec un tiers de traces en moins à revoir. --reid-min-sim reste configurable en
# CLI pour retester si besoin (le filet de sécurité et le bouton "ignorer" de l'outil de revue restent
# nécessaires quel que soit le seuil : une partie de la contamination vient du tracker lui-même, qui
# peut changer d'identité en interne avant même d'atteindre ce code).
REID_EMBEDDING_MIN_SIM = 0.80

# Signature couleur complémentaire à l'embedding (cf. ReIdentifier.resolve, _appearance_color) :
# cheveux + peau + chaussures, PAS le maillot (déjà utilisé séparément pour l'équipe, ne
# différencierait rien de plus entre coéquipiers). Idée de Gregory le 2026-09-15, suite au constat
# que l'embedding seul confond trop souvent deux coéquipiers qui se ressemblent (cf. plus haut).
# Distance euclidienne HSV brute (même principe que TeamAssigner.assign, pas une similarité cosinus
# comme l'embedding) : candidat rejeté si la distance dépasse ce seuil, MÊME si l'embedding est
# proche - un filtre supplémentaire, pas un remplacement. Valeur de départ raisonnable, pas calibrée
# avec la même rigueur empirique que les seuils ci-dessus faute de temps le 2026-09-15 - à affiner si
# les faux rejets (deux mêmes traces jamais reliées) semblent trop fréquents.
REID_COLOR_MAX_DIST = 60.0
# Bandes verticales (fraction de la hauteur de boîte) où échantillonner chaque signal - tête en haut,
# pieds en bas, comme un corps humain debout. Approximatif (pas de détection de visage dédiée) mais
# suffisant pour un signal d'appoint à l'embedding, pas le signal principal.
HAIR_Y_RANGE = (0.0, 0.12)
SKIN_Y_RANGE = (0.12, 0.22)   # sous la ligne de cheveux ~ visage/cou
SHOE_Y_RANGE = (0.92, 1.0)

# Part supérieure de la boîte exclue du crop envoyé à l'embedding de ré-identification (0.0 = boîte
# entière). Hypothèse validée par test comparatif direct (2026-09-14, même extrait de 12 min) :
# OSNet (entraîné sur des piétons en vêtements variés) était dominé par la couleur/texture du
# maillot, qui ne différencie RIEN entre deux coéquipiers - contrairement à un contexte piéton où le
# vêtement est justement le signal le plus discriminant. Exclure le maillot (tête+épaules+torse) et
# ne garder que hanches/jambes force le modèle à s'appuyer sur des traits plus individuels
# (morphologie, démarche) : 490 -> 398 traces après regroupement sur le même extrait (-19%), premier
# levier de cette soirée à réduire réellement la fragmentation plutôt que de la déplacer.
REID_CROP_Y_START_FRAC = 0.4


def _region_color(frame_bgr, box, y_range):
    """Couleur moyenne (HSV) d'une bande horizontale de la boîte, à la fraction de hauteur y_range
    (0=haut, 1=bas) — brique commune à _shirt_color et aux signaux de ré-identification complémentaires
    (_hair_color, _skin_color, _shoe_color)."""
    x1, y1, x2, y2 = [float(v) for v in box]
    h = y2 - y1
    ys, ye = int(y1 + h * y_range[0]), int(y1 + h * y_range[1])
    x1, ys = max(0, int(x1)), max(0, ys)
    x2, ye = min(frame_bgr.shape[1], int(x2)), min(frame_bgr.shape[0], ye)
    if x2 <= x1 or ye <= ys:
        return None
    crop = frame_bgr[ys:ye, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    return hsv.reshape(-1, 3).mean(axis=0)


def _shirt_color(frame_bgr, box):
    """Couleur moyenne (HSV) du tiers supérieur de la boîte — approxime le maillot plutôt que le short.
    Sert uniquement à l'affectation d'équipe (TeamAssigner), pas à la ré-identification individuelle."""
    return _region_color(frame_bgr, box, (0.0, 1 / 3))


def _appearance_color(frame_bgr, box):
    """Signature couleur individuelle (cheveux + peau + chaussures) pour la ré-identification - cf.
    REID_COLOR_MAX_DIST. Concatène 3 lectures HSV (9 valeurs) plutôt qu'une seule pour couvrir 3
    zones indépendantes du maillot (déjà utilisé ailleurs) ; None si l'une des 3 zones sort du cadre
    ou est trop petite (boîte tronquée en bord d'image) - un signal partiel serait trompeur pour une
    distance euclidienne sur des dimensions manquantes."""
    hair = _region_color(frame_bgr, box, HAIR_Y_RANGE)
    skin = _region_color(frame_bgr, box, SKIN_Y_RANGE)
    shoe = _region_color(frame_bgr, box, SHOE_Y_RANGE)
    if hair is None or skin is None or shoe is None:
        return None
    return np.concatenate([hair, skin, shoe])


def _iou_matrix(a, b):
    """IoU entre chaque paire de boîtes (xyxy) de a (N,4) et b (M,4) -> matrice (N,M)."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = np.clip(a[:, 2] - a[:, 0], 0, None) * np.clip(a[:, 3] - a[:, 1], 0, None)
    area_b = np.clip(b[:, 2] - b[:, 0], 0, None) * np.clip(b[:, 3] - b[:, 1], 0, None)
    union = area_a[:, None] + area_b[None, :] - inter
    return np.where(union > 0, inter / union, 0.0)


def _match_class_ids(tracked_xyxy, people_xyxy, people_class_id):
    """Associe chaque boîte suivie à la classe YOLO (gardien/joueur) de la détection d'origine la
    plus proche (IoU) sur cette même frame. Nécessaire car ByteTrackTracker.update() ne fait PAS
    suivre class_id sur sa sortie - vérifié directement dans le code installé (trackers/core/base.py,
    la propriété tracked_objects documente explicitement que class_id y reste None ; update() ne le
    mentionne pas non plus en sortie). Retourne {indice dans tracked_xyxy: class_id} - absent si
    aucune détection d'origine ne recouvre assez la boîte suivie (IoU <= 0.5, rare : boîte lissée par
    le filtre de Kalman entre deux détections réelles)."""
    if len(people_xyxy) == 0 or len(tracked_xyxy) == 0:
        return {}
    ious = _iou_matrix(tracked_xyxy, people_xyxy)
    best = ious.argmax(axis=1)
    best_iou = ious[np.arange(len(tracked_xyxy)), best]
    return {i: int(people_class_id[best[i]]) for i in range(len(tracked_xyxy)) if best_iou[i] > 0.5}


def _crop(frame_bgr, box):
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(frame_bgr.shape[1], x2), min(frame_bgr.shape[0], y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame_bgr[y1:y2, x1:x2]


def _reid_crop(frame_bgr, box):
    """Crop envoyé à l'embedding de ré-identification — cf. REID_CROP_Y_START_FRAC ci-dessus."""
    x1, y1, x2, y2 = box
    y1 = y1 + (y2 - y1) * REID_CROP_Y_START_FRAC
    return _crop(frame_bgr, (x1, y1, x2, y2))


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

    def __init__(self, min_sim=REID_EMBEDDING_MIN_SIM, color_max_dist=REID_COLOR_MAX_DIST):
        self.min_sim = min_sim
        self.color_max_dist = color_max_dist
        self.lost = {}    # canonical_id -> {"embedding", "team", "is_gk", "color", "t"}
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

    def mark_lost(self, track_id, embedding, team, is_gk, color, t):
        if embedding is None:
            return
        self.lost[self.canonical(track_id)] = {
            "embedding": embedding, "team": team, "is_gk": is_gk, "color": color, "t": t,
        }

    def resolve(self, track_id, embedding, team, is_gk, color, t):
        """Trace ByteTrack jamais vue jusqu'ici : cherche un candidat perdu récemment, même équipe,
        même statut gardien/joueur (véto absolu, cf. GOALKEEPER_CLASS - un gardien ne redevient pas
        joueur de champ), embedding proche ET signature couleur cheveux/peau/chaussures proche quand
        les deux sont disponibles (cf. REID_COLOR_MAX_DIST - filtre supplémentaire, pas un
        remplacement de l'embedding qui reste le signal principal). Sinon la trace reste nouvelle
        (nouveau joueur, ou ré-identification ratée)."""
        if track_id in self.remap:
            return self.remap[track_id]
        candidate_seen = False
        best_cid, best_sim = None, self.min_sim
        for cid, info in list(self.lost.items()):
            if t - info["t"] > REID_MAX_GAP_SECONDS:
                del self.lost[cid]
                continue
            if embedding is None or info["team"] != team:
                continue
            if info["is_gk"] is not None and is_gk is not None and info["is_gk"] != is_gk:
                continue
            if info["color"] is not None and color is not None:
                color_dist = float(np.linalg.norm(color - info["color"]))
                if color_dist > self.color_max_dist:
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
    def __init__(self, model_path=None, device="cpu", confidence=0.3, frame_rate=25.0,
                 reid_min_sim=REID_EMBEDDING_MIN_SIM, reid_color_max_dist=REID_COLOR_MAX_DIST):
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
        self.reid = ReIdentifier(min_sim=reid_min_sim, color_max_dist=reid_color_max_dist)
        self._last_seen = {}  # track_id ByteTrack -> (embedding, team, is_gk, color), pour "lost"
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
            c = _reid_crop(frame_bgr, boxes[i])
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
                             "px": float, "py": float, "box": (x1,y1,x2,y2), "embedding": array ou None,
                             "is_goalkeeper": bool ou None, "color": array ou None}
                             (px, py = pieds au sol, en pixels image ; box = boîte détectée brute)
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
        # ByteTrackTracker ne fait pas suivre class_id (cf. _match_class_ids) - retrouvé par IoU avec
        # les détections d'origine de cette même frame pour distinguer gardien/joueur de champ.
        class_ids = _match_class_ids(tracked.xyxy[confirmed] if confirmed else [], people.xyxy, people.class_id)

        active_now = set()
        out_players = []
        for idx, i in enumerate(confirmed):
            box, track_id = tracked.xyxy[i], int(tracked.tracker_id[i])
            embedding = embeddings.get(i)
            shirt = _shirt_color(frame_bgr, box)
            self.team_assigner.observe(shirt)
            team = self.team_assigner.assign(shirt)
            is_gk = (class_ids.get(idx) == GOALKEEPER_CLASS) if idx in class_ids else None
            color = _appearance_color(frame_bgr, box)

            canonical_id = self.reid.resolve(track_id, embedding, team, is_gk, color, t_seconds)
            if canonical_id in self._known_team:
                team = self._known_team[canonical_id]
            elif team is not None:
                self._known_team[canonical_id] = team
            active_now.add(track_id)
            self._last_seen[track_id] = (embedding, team, is_gk, color)

            out_players.append({
                "track_id": canonical_id,
                "team": team,
                "px": float((box[0] + box[2]) / 2),
                "py": float(box[3]),
                "box": tuple(float(v) for v in box),
                "embedding": embedding,  # pour le regroupement global final (cf. cluster_tracks_globally)
                "is_goalkeeper": is_gk,
                "color": color,
            })

        for lost_id in self._active_last_frame - active_now:
            embedding, team, is_gk, color = self._last_seen.get(lost_id, (None, None, None, None))
            self.reid.mark_lost(lost_id, embedding, team, is_gk, color, t_seconds)
        self._active_last_frame = active_now

        ball_xy = None
        if len(balls) > 0:
            best = int(np.argmax(balls.confidence))
            bx = balls.xyxy[best]
            ball_xy = (float((bx[0] + bx[2]) / 2), float((bx[1] + bx[3]) / 2))

        return out_players, ball_xy


def _boundary_transition_plausible(acc_earlier, acc_later):
    """Le passage direct entre le dernier point de la trace la plus ancienne et le premier point
    de l'autre doit rester physiquement possible pour un humain (même limite que celle qui filtre
    déjà les segments à l'intérieur d'une trace, cf. metrics.MAX_PLAUSIBLE_SPEED_MS) — sinon les
    deux traces ne peuvent pas être le même joueur, quelle que soit la ressemblance d'apparence.

    Repéré concrètement sur le premier match complet traité : une trace déjà passée par ce
    regroupement affichait des sauts à 27-40 m/s entre deux points, largement au-dessus du possible
    humain (record du monde ~10,4 m/s) — la seule similarité d'embedding ne suffit pas, deux joueurs
    différents de la même équipe peuvent se ressembler assez pour dépasser le seuil."""
    t0, x0, y0 = acc_earlier.samples[-1]
    t1, x1, y1 = acc_later.samples[0]
    dt = t1 - t0
    if dt <= 0:
        return False
    dist_m = (((x1 - x0) * PITCH_WIDTH_M) ** 2 + ((y1 - y0) * PITCH_LENGTH_M) ** 2) ** 0.5
    return dist_m / dt <= MAX_PLAUSIBLE_SPEED_MS


def split_implausible_tracks(accumulators):
    """À appeler AVANT cluster_tracks_globally() : coupe une trace en plusieurs morceaux partout où
    un déplacement interne dépasse la vitesse humaine plausible. Une telle rupture signifie presque
    certainement que la ré-identification EN FLUX (ReIdentifier, dans Tracker.process_frame) a déjà
    relié à tort deux joueurs réels différents avant même d'atteindre le regroupement global — cette
    étape-là ne peut décider que de fusionner ou non des traces déjà propres, pas réparer une trace
    déjà contaminée à la source. Repéré concrètement sur le premier match complet traité : des sauts
    de 27-40 m/s subsistaient dans des traces jamais passées par le regroupement global (donc jamais
    vues par _boundary_transition_plausible), preuve que la contamination venait d'en amont.

    Chaque morceau hérite du même embedding moyen que la trace d'origine — conserver un embedding
    précis par morceau demanderait de garder celui de chaque frame individuellement plutôt qu'une
    simple somme courante. Approximation acceptée : cluster_tracks_globally() revalidera de toute
    façon chaque paire de morceaux avec la même contrainte physique avant de les refusionner."""
    result = {}
    for key, acc in accumulators.items():
        if len(acc.samples) < 2:
            result[key] = acc
            continue

        segments, current = [], [acc.samples[0]]
        for prev, cur in zip(acc.samples, acc.samples[1:]):
            dt = cur[0] - prev[0]
            dist_m = (((cur[1] - prev[1]) * PITCH_WIDTH_M) ** 2
                      + ((cur[2] - prev[2]) * PITCH_LENGTH_M) ** 2) ** 0.5
            if dt > 0 and dist_m / dt > MAX_PLAUSIBLE_SPEED_MS:
                segments.append(current)
                current = []
            current.append(cur)
        segments.append(current)

        if len(segments) == 1:
            result[key] = acc
            continue
        for i, seg in enumerate(segments):
            piece = TrackAccumulator()
            piece.team = acc.team
            piece.is_goalkeeper = acc.is_goalkeeper
            piece.samples = seg
            piece._embedding_sum = acc._embedding_sum
            piece._embedding_count = acc._embedding_count
            piece._color_sum = acc._color_sum
            piece._color_count = acc._color_count
            piece.jersey_readings = acc.jersey_readings
            # Uniquement les candidats DANS la plage de ce morceau — un candidat hérité tel quel
            # pourrait montrer un instant appartenant en réalité à un autre morceau (potentiellement
            # un autre joueur, cf. update_thumbnail dans metrics.py).
            t_start, t_end = seg[0][0], seg[-1][0]
            piece.thumbnail_candidates = [c for c in acc.thumbnail_candidates if t_start <= c[0] <= t_end]
            result[f"{key}~{i}"] = piece
    return result


def cluster_tracks_globally(accumulators, min_sim=REID_GLOBAL_MIN_SIM):
    """Regroupe après coup les traces qui appartiennent probablement au même joueur réel, en
    comparant TOUTES les paires de traces du match (pas seulement celles proches dans le temps,
    contrairement à ReIdentifier en flux). Nécessaire car la probabilité qu'AU MOINS UNE
    ré-identification en flux échoue augmente avec le nombre de fois qu'un joueur sort du cadre —
    sur un match complet, même un taux de réussite correct par tentative (~50-60%, mesuré) laisse
    presque certainement passer au moins un échec (0.6^5 ≈ 8% de réussir 5 fois d'affilée). Un
    passage global ne dépend plus de ce cumul : une seule comparaison finale par paire suffit,
    indépendamment du nombre de ruptures survenues en flux.

    Clustering à liaison complète (scipy), pas un simple union-find : un union-find fusionne dès
    qu'une CHAÎNE de paires similaires existe (A~B, B~C -> A,C regroupés même si A et C sont très
    différents), ce qui a produit en pratique des couvertures > 1.0 (plusieurs joueurs réels
    fusionnés en une trace, détecté et corrigé). La liaison complète exige que TOUS les membres
    d'un groupe restent proches les uns des autres, pas juste chaînés.

    Deux véto absolus avant même de regarder la similarité d'apparence : chevauchement temporel
    (impossible d'être la même personne à deux endroits en même temps), et transition physiquement
    impossible entre la fin d'une trace et le début de l'autre (cf. _boundary_transition_plausible)
    — repéré sur un vrai match complet : la seule similarité d'embedding, même à un seuil strict,
    laisse passer des fusions entre deux joueurs différents mais qui se ressemblent.

    accumulators : dict label -> TrackAccumulator (label du type "A#18" — le préfixe avant "#" sert
    de clé d'équipe, on ne regroupe jamais entre équipes différentes ; le maillot ne différencie
    plus rien à l'intérieur d'une équipe, d'où un seuil plus strict que la ré-id en flux, cf.
    REID_GLOBAL_MIN_SIM). Retourne un nouveau dict, même format, traces fusionnées quand pertinent."""
    clusterable = [k for k, acc in accumulators.items()
                   if acc.mean_embedding is not None and acc.time_range is not None]

    by_team = {}
    for k in clusterable:
        by_team.setdefault(k.split("#", 1)[0], []).append(k)

    merged = {}
    for keys in by_team.values():
        if len(keys) == 1:
            merged[keys[0]] = accumulators[keys[0]]
            continue

        embeddings = np.stack([accumulators[k].mean_embedding for k in keys])
        dist = 1.0 - embeddings @ embeddings.T  # cosine -> distance, embeddings déjà normalisés
        # Deux morceaux issus d'un même split_implausible_tracks() héritent du même embedding
        # exact (cf. ce module) : leur similarité peut ressortir infinitésimalement au-dessus de 1.0
        # par imprécision flottante, ce qui produirait une distance négative — scipy refuse
        # catégoriquement (ValueError) plutôt que de tolérer ce bruit numérique habituel.
        dist = np.clip(dist, 0.0, None)
        ranges = [accumulators[k].time_range for k in keys]
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                (t1_min, t1_max), (t2_min, t2_max) = ranges[i], ranges[j]
                if t1_min <= t2_max and t2_min <= t1_max:
                    dist[i, j] = dist[j, i] = 10.0  # chevauchement temporel -> jamais le même joueur
                    continue
                acc_i, acc_j = accumulators[keys[i]], accumulators[keys[j]]
                earlier, later = (acc_i, acc_j) if t1_max <= t2_min else (acc_j, acc_i)
                if not _boundary_transition_plausible(earlier, later):
                    dist[i, j] = dist[j, i] = 10.0  # transition physiquement impossible -> jamais fusionner

        # Gardien/joueur de champ (cf. GOALKEEPER_CLASS, add_class) : même véto absolu que l'équipe -
        # un gardien ne redevient pas joueur de champ en cours de match. Puis signature couleur
        # cheveux/peau/chaussures (cf. REID_COLOR_MAX_DIST) : filtre supplémentaire à l'embedding
        # plutôt qu'un remplacement, même principe qu'en ré-id en flux (cf. ReIdentifier.resolve).
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                if dist[i, j] >= 10.0:
                    continue
                gk_i, gk_j = accumulators[keys[i]].is_goalkeeper, accumulators[keys[j]].is_goalkeeper
                if gk_i is not None and gk_j is not None and gk_i != gk_j:
                    dist[i, j] = dist[j, i] = 10.0
                    continue
                color_i, color_j = accumulators[keys[i]].mean_color, accumulators[keys[j]].mean_color
                if color_i is not None and color_j is not None:
                    if float(np.linalg.norm(color_i - color_j)) > REID_COLOR_MAX_DIST:
                        dist[i, j] = dist[j, i] = 10.0

        # Numéro de maillot (vote majoritaire, cf. TrackAccumulator.majority_jersey) : contrainte
        # complémentaire à l'apparence, forte précisément là où l'apparence est aveugle (deux
        # coéquipiers en maillot identique mais numéros différents, cf. jersey_ocr.py). Deux numéros
        # confiants différents -> jamais le même joueur, quelle que soit la similarité d'embedding.
        # Deux numéros confiants identiques -> fusion forcée (dist=0) SAUF si déjà vétoée ci-dessus
        # (temps/physique restent prioritaires : un OCR d'accord des deux côtés ne rend pas une
        # téléportation possible).
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                if dist[i, j] >= 10.0:
                    continue
                num_i = accumulators[keys[i]].majority_jersey
                num_j = accumulators[keys[j]].majority_jersey
                if num_i is None or num_j is None:
                    continue
                dist[i, j] = dist[j, i] = 0.0 if num_i == num_j else 10.0
        np.fill_diagonal(dist, 0.0)

        condensed = squareform(dist, checks=False)
        tree = linkage(condensed, method="complete")
        labels = fcluster(tree, t=1.0 - min_sim, criterion="distance")

        groups = {}
        for key, label in zip(keys, labels):
            groups.setdefault(label, []).append(key)
        for members in groups.values():
            if len(members) == 1:
                merged[members[0]] = accumulators[members[0]]
                continue
            combined = TrackAccumulator()
            combined.team = accumulators[members[0]].team
            combined.is_goalkeeper = accumulators[members[0]].is_goalkeeper
            for m in members:
                combined.samples.extend(accumulators[m].samples)
                combined.add_color(accumulators[m].mean_color)
            combined.samples.sort(key=lambda s: s[0])
            # Ces morceaux sont ici confirmés comme le même joueur (contrainte physique déjà
            # validée plus haut) - contrairement au découpage, tous leurs candidats restent valides
            # pour la trace fusionnée.
            for m in members:
                combined.thumbnail_candidates.extend(accumulators[m].thumbnail_candidates)
            combined.thumbnail_candidates.sort(key=lambda c: -c[1])
            del combined.thumbnail_candidates[THUMBNAIL_CANDIDATES_MAX:]
            merged[members[0]] = combined

    # Traces sans embedding exploitable (rare : tous les recadrages de cette trace ont échoué) —
    # laissées telles quelles, non regroupables faute de signal.
    for k, acc in accumulators.items():
        if k not in clusterable:
            merged[k] = acc

    return merged
