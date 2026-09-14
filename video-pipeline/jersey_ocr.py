"""Lecture de numéro de maillot par OCR (EasyOCR) — PAS comme identité principale image par image
(rejeté après test initial : lecture peu fiable frame à frame, ex. un "7" net lu comme "1" à 94% de
confiance). Utilisé ici uniquement comme signal complémentaire de VOTE MAJORITAIRE sur l'ensemble
des frames d'une trace (cf. TraceJerseyVotes dans metrics.py) : un bruit ponctuel s'efface dans un
vote sur des dizaines de lectures, là où il faussait une lecture unique. Sert de contrainte pour le
regroupement global (tracking.cluster_tracks_globally) — pas de couleur de maillot, déjà utilisée
séparément pour l'équipe (TeamAssigner), et pas discriminant entre coéquipiers."""
import re

import cv2
import easyocr

_NUMBER_RE = re.compile(r"^\d{1,2}$")
_MIN_RAW_CONFIDENCE = 0.3  # sous ce seuil, une lecture EasyOCR individuelle est ignorée d'emblée


class JerseyReader:
    def __init__(self, device="cpu"):
        # EasyOCR (torch) ne sait accélérer que via CUDA - MPS (Mac) n'est pas supporté, traité
        # comme cpu plutôt que de risquer un chemin GPU inexistant.
        self.reader = easyocr.Reader(["en"], gpu=(device not in (None, "cpu", "mps")), verbose=False)

    def read(self, frame_bgr, box):
        """box : (x1, y1, x2, y2) en pixels image. Cherche le numéro sur le tiers supérieur à
        60% de la boîte (torse — dos ou face selon l'angle caméra à cet instant), zoomé x3 pour
        l'OCR (les crops sources sont petits sur un plan large follow-cam). Retourne (numero:str,
        confiance:float) ou None si rien de net n'est lu."""
        x1, y1, x2, y2 = [int(v) for v in box]
        h = y2 - y1
        y2_torso = y1 + int(h * 0.6)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2_torso = min(frame_bgr.shape[1], x2), min(frame_bgr.shape[0], y2_torso)
        if x2 <= x1 or y2_torso <= y1:
            return None
        crop = frame_bgr[y1:y2_torso, x1:x2]
        crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)

        # Seuils de détection par défaut d'EasyOCR (text_threshold=0.7, low_text=0.4) manquaient la
        # majorité des numéros pourtant nets à l'œil sur ces crops vidéo (constaté concrètement :
        # 2/8 détectés sur un échantillon réel) — plus sensibles ici, quitte à plus de bruit, absorbé
        # par le vote majoritaire (TrackAccumulator.majority_jersey) plutôt que par la précision d'une
        # lecture isolée.
        best = None
        for _, text, conf in self.reader.readtext(
            crop, allowlist="0123456789",
            text_threshold=0.4, low_text=0.3, link_threshold=0.3, mag_ratio=1.5,
        ):
            if conf < _MIN_RAW_CONFIDENCE or not _NUMBER_RE.match(text):
                continue
            if best is None or conf > best[1]:
                best = (text, conf)
        return best
