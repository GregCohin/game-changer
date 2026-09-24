"""Fichiers locaux du pipeline panoramique, indiqués par variables d'environnement.

Ils ne sont jamais dans le dépôt (public) : vidéos de match, et export des numéros de maillot du site, qui contient les noms des joueurs.

  PANORAMA_VIDEO      capture d'écran du lecteur Veo en mode panorama (mp4, m4v...) : garder l'enregistrement d'origine, ne pas le recompresser
  PANORAMA_CROP       x,y,largeur,hauteur : zone du panorama dans la capture (le lecteur Veo entoure le panorama d'interface) ; sans lui, image entière
  PANORAMA_OUT        dossier des résultats (défaut : video-pipeline/output/panorama) : permet de traiter une autre source sans rien écraser
  PANORAMA_INNER_CROP y0,y1 : zone utile dans le recadrage panorama, sans les barres du lecteur Veo restantes ; défaut 184,900 (capture du 1er match)
  PANORAMA_BAND       y0,y1 : bande où se trouve le terrain, pour la détection ; défaut 360,800 (capture du 1er match)
  PANORAMA_CUTS       secondes brutes (virgules) où la capture saute du temps de match sans saut d'image (montage/pause) :
                       aucune tranche de traitement ne les enjambe, pour ne jamais faire suivre une piste à travers
  PANORAMA_BOX_MATCH_PX  tolérance (pixels) pour associer une mesure de piste à sa boîte détectée (couleur d'équipe,
                       vignettes d'étiquetage) ; défaut 2.0 (capture du 1er match, calage très précis). Un calage moins
                       précis (revoir calibration_finale.json) laisse passer moins de mesures à 2 px : élargir ici perd
                       en précision par mesure individuelle mais le classement d'équipe moyenne sur toute la piste
  FOLLOWCAM_VIDEO     vidéo de la caméra suiveuse Veo (mp4)
  FOLLOWCAM_CHECKPOINT  checkpoint extract.py pour ce match (défaut : output/checkpoint_local_v4.pkl, capture du 1er match)
  FOLLOWCAM_ROSTER    roster certifié pour ce match, produit par la revue assistée (défaut : output/roster_v4.json,
                       capture du 1er match) ; absent -> traces non identifiées (étape 1a)
  FOLLOWCAM_TEAM      étiquette (A ou B) que le suivi de la vidéo suiveuse a donnée à l'équipe de Gregory ; défaut A.
                       Ces étiquettes sortent d'un k-means sur les couleurs de maillot : arbitraires d'un run à l'autre,
                       à vérifier sur des vignettes à chaque nouveau match
  MATCH_DURATION_S    durée jouée de l'enregistrement en secondes (mi-temps déjà coupée) : référence de la couverture par joueur ;
                       défaut 5958 (1er match) — à régler pour chaque match
  NUMBERS_EXPORT      export « numéros de maillot » du site (numeros-joueurs-<match>.json)

Ces deux dernières et les repères de calage (panorama/calibrate.py, output/calib_seed.json du match) dépendent du
cadrage exact de la capture d'écran : à revérifier par un coup d'œil sur une image quand le cadrage change de match en match.
"""
import json
import os
from pathlib import Path

PANORAMA_VIDEO = os.environ.get("PANORAMA_VIDEO", "")
PANORAMA_CROP = os.environ.get("PANORAMA_CROP", "")
PANORAMA_OUT = os.environ.get("PANORAMA_OUT", "")
PANORAMA_INNER_CROP = os.environ.get("PANORAMA_INNER_CROP", "")
PANORAMA_BAND = os.environ.get("PANORAMA_BAND", "")
PANORAMA_CUTS = os.environ.get("PANORAMA_CUTS", "")
PANORAMA_BOX_MATCH_PX = float(os.environ.get("PANORAMA_BOX_MATCH_PX", "2.0"))
FOLLOWCAM_VIDEO = os.environ.get("FOLLOWCAM_VIDEO", "")
FOLLOWCAM_CHECKPOINT = os.environ.get("FOLLOWCAM_CHECKPOINT", "")
FOLLOWCAM_ROSTER = os.environ.get("FOLLOWCAM_ROSTER", "")
FOLLOWCAM_TEAM = os.environ.get("FOLLOWCAM_TEAM", "A")
MATCH_DURATION_S = float(os.environ.get("MATCH_DURATION_S", "5958"))
NUMBERS_EXPORT = os.environ.get("NUMBERS_EXPORT", "")
_PIPELINE = Path(__file__).parent.parent


def followcam_checkpoint():
    """Checkpoint extract.py du match (FOLLOWCAM_CHECKPOINT) ; défaut : celui du 1er match."""
    return FOLLOWCAM_CHECKPOINT or str(_PIPELINE / "output" / "checkpoint_local_v4.pkl")


def followcam_roster():
    """Roster certifié du match (FOLLOWCAM_ROSTER) ; défaut : celui du 1er match."""
    return FOLLOWCAM_ROSTER or str(_PIPELINE / "output" / "roster_v4.json")


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


def _pair(value, var, default):
    """(a, b) demandés par une variable d'environnement "a,b", ou le défaut (capture du 1er match)."""
    if not value:
        return default
    try:
        a, b = (int(v) for v in value.split(","))
    except ValueError:
        raise SystemExit(f'{var} doit valoir "a,b", par exemple "{default[0]},{default[1]}".')
    return a, b


def panorama_inner_crop():
    return _pair(PANORAMA_INNER_CROP, "PANORAMA_INNER_CROP", (184, 900))


def panorama_band():
    return _pair(PANORAMA_BAND, "PANORAMA_BAND", (360, 800))


def panorama_cuts():
    """Secondes brutes des montages durs (PANORAMA_CUTS), triées ; [] s'il n'y en a pas."""
    if not PANORAMA_CUTS:
        return []
    try:
        return sorted(float(v) for v in PANORAMA_CUTS.split(","))
    except ValueError:
        raise SystemExit('PANORAMA_CUTS doit valoir des secondes séparées par des virgules, par exemple "2840".')


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
