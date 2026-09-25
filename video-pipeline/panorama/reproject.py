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

OLD = T.load_model()
NEW = PanoramaModel2.from_json(T.OUT / "calibration_v2.json")


def convert(X, Y):
    """Positions de l'ancien repère -> vrais mètres du modèle v2 : (X, Y, rho)."""
    XY, rho = NEW.unproject(OLD.project(np.c_[np.asarray(X, float), np.asarray(Y, float)]))
    return XY[:, 0], XY[:, 1], rho


def reproject_tracklets(tracklets):
    for tl in tracklets:
        tl.X, tl.Y, tl.rho = convert(tl.X, tl.Y)
    return tracklets


def to_v2(D):
    """Mesures du match (repère de l'ancien calage, sortie de teamshape) -> mêmes mesures en vrais mètres du calage v2 ; associations de pistes inchangées."""
    X, Y, _ = convert(D["X"], D["Y"])
    return {**D, "X": X, "Y": Y}


if __name__ == "__main__":
    import pickle
    D = pickle.load(open(T.OUT / "match" / "meas_team.pkl", "rb"))
    pickle.dump(to_v2(D), open(T.OUT / "match" / "meas_team_v2.pkl", "wb"))
    print("écrit", T.OUT / "match" / "meas_team_v2.pkl")
