"""Fichiers locaux du pipeline panoramique, indiqués par variables d'environnement.

Ils ne sont jamais dans le dépôt (public) : vidéos de match, et export des numéros de maillot du site, qui contient les noms des joueurs.

  PANORAMA_VIDEO   capture d'écran du lecteur Veo en mode panorama (mp4, m4v...) : garder l'enregistrement d'origine, ne pas le recompresser
  PANORAMA_CROP    x,y,largeur,hauteur : zone du panorama dans la capture (le lecteur Veo entoure le panorama d'interface) ; sans lui, image entière
  PANORAMA_OUT     dossier des résultats (défaut : video-pipeline/output/panorama) : permet de traiter une autre source sans rien écraser
  FOLLOWCAM_VIDEO  vidéo de la caméra suiveuse Veo (mp4)
  NUMBERS_EXPORT   export « numéros de maillot » du site (numeros-joueurs-<match>.json)
"""
import json
import os

PANORAMA_VIDEO = os.environ.get("PANORAMA_VIDEO", "")
PANORAMA_CROP = os.environ.get("PANORAMA_CROP", "")
PANORAMA_OUT = os.environ.get("PANORAMA_OUT", "")
FOLLOWCAM_VIDEO = os.environ.get("FOLLOWCAM_VIDEO", "")
NUMBERS_EXPORT = os.environ.get("NUMBERS_EXPORT", "")


def require(path, var):
    """Chemin d'un fichier local indiqué par variable d'environnement ; message clair s'il manque."""
    if not path or not os.path.exists(path):
        raise SystemExit(f"Fichier introuvable : définir la variable d'environnement {var} avec le chemin du fichier (voir panorama/config.py).")
    return path


def load_numbers(required=False):
    """Numéro de maillot -> {id, name} de notre équipe (bloc « A » de l'export du site) ; {} si l'export n'est pas fourni (sauf required)."""
    if not NUMBERS_EXPORT or not os.path.exists(NUMBERS_EXPORT):
        if required:
            require(NUMBERS_EXPORT, "NUMBERS_EXPORT")
        return {}
    return json.load(open(NUMBERS_EXPORT))["A"]


def panorama_crop():
    """(x, y, largeur, hauteur) demandés par PANORAMA_CROP, ou None."""
    if not PANORAMA_CROP:
        return None
    try:
        x, y, w, h = (int(v) for v in PANORAMA_CROP.split(","))
    except ValueError:
        raise SystemExit('PANORAMA_CROP doit valoir "x,y,largeur,hauteur", par exemple 130,14,1660,960.')
    return x, y, w, h


class PanoramaCapture:
    """cv2.VideoCapture qui ne rend que la zone du panorama : mêmes coordonnées d'image que la capture recadrée sur laquelle le calage a été fait."""

    def __init__(self, path, crop):
        import cv2
        self._cv2 = cv2
        self._cap = cv2.VideoCapture(path)
        self._x, self._y, self._w, self._h = crop

    def isOpened(self):
        return self._cap.isOpened()

    def get(self, prop):
        if prop == self._cv2.CAP_PROP_FRAME_WIDTH:
            return float(self._w)
        if prop == self._cv2.CAP_PROP_FRAME_HEIGHT:
            return float(self._h)
        return self._cap.get(prop)

    def set(self, prop, value):
        return self._cap.set(prop, value)

    def grab(self):
        return self._cap.grab()

    def _crop(self, frame):
        out = frame[self._y:self._y + self._h, self._x:self._x + self._w]
        if out.shape[0] != self._h or out.shape[1] != self._w:
            raise SystemExit(f"PANORAMA_CROP dépasse l'image ({frame.shape[1]}x{frame.shape[0]}) : {self._x},{self._y},{self._w},{self._h}")
        return out.copy()

    def retrieve(self):
        ok, frame = self._cap.retrieve()
        return (ok, self._crop(frame)) if ok else (ok, frame)

    def read(self):
        ok, frame = self._cap.read()
        return (ok, self._crop(frame)) if ok else (ok, frame)

    def release(self):
        self._cap.release()


def open_panorama():
    """Ouvre la capture panoramique (PANORAMA_VIDEO), recadrée si PANORAMA_CROP est défini."""
    import cv2
    path = require(PANORAMA_VIDEO, "PANORAMA_VIDEO")
    crop = panorama_crop()
    return cv2.VideoCapture(path) if crop is None else PanoramaCapture(path, crop)
