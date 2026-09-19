"""Fichiers locaux du pipeline panoramique, indiqués par variables d'environnement.

Ils ne sont jamais dans le dépôt (public) : vidéos de match, et export des numéros de maillot du site, qui contient les noms des joueurs.

  PANORAMA_VIDEO   capture d'écran du lecteur Veo en mode panorama (mp4)
  FOLLOWCAM_VIDEO  vidéo de la caméra suiveuse Veo (mp4)
  NUMBERS_EXPORT   export « numéros de maillot » du site (numeros-joueurs-<match>.json)
"""
import json
import os

PANORAMA_VIDEO = os.environ.get("PANORAMA_VIDEO", "")
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
