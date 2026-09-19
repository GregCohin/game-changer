"""Recalage des positions déjà mesurées : ancien modèle (panorama.geometry, calibration_finale) -> modèle réglementaire v2 (panorama.geometry2).

Les pixels ne changent pas : on repasse par l'image (projection exacte de l'ancien modèle) puis on relève le sol avec le nouveau.
Les associations de pistes restent celles du suivi d'origine.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.geometry import PanoramaModel
from panorama.geometry2 import PanoramaModel2

OLD = PanoramaModel.from_json(T.OUT / "calibration_finale.json")
NEW = PanoramaModel2.from_json(T.OUT / "calibration_v2.json")


def convert(X, Y):
    """Positions de l'ancien repère -> vrais mètres du modèle v2 : (X, Y, rho)."""
    XY, rho = NEW.unproject(OLD.project(np.c_[np.asarray(X, float), np.asarray(Y, float)]))
    return XY[:, 0], XY[:, 1], rho


def reproject_tracklets(tracklets):
    for tl in tracklets:
        tl.X, tl.Y, tl.rho = convert(tl.X, tl.Y)
    return tracklets
