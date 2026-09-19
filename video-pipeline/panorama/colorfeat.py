"""Descripteurs d'équipe robustes à l'éclairage : contraste du maillot / du short avec la pelouse voisine.

Sur un joueur de ~23 px la couleur moyenne est trompeuse (ombre, pelouse qui déteint) ; la luminosité du
tronc et des jambes MESURÉE PAR RAPPORT à l'herbe des marges de la boîte, elle, sépare clair et sombre.
"""
import cv2
import numpy as np


def _region(V, rows, cols_core, cols_margin):
    core = V[rows][:, cols_core].ravel()
    marg = V[rows][:, cols_margin].ravel()
    if core.size < 4 or marg.size < 4:
        return None
    m = float(np.median(marg))
    c = float(np.median(core))
    return [c - m, float((core > m + 25).mean()), float((core < m - 15).mean()), c / (m + 1.0)]


def crop_features(frame_bgr, box):
    x1, y1, x2, y2 = [int(round(v)) for v in box]
    h, w = y2 - y1, x2 - x1
    if h < 8 or w < 5 or x1 < 0 or y1 < 0 or y2 > frame_bgr.shape[0] or x2 > frame_bgr.shape[1]:
        return None
    V = cv2.cvtColor(frame_bgr[y1:y2, x1:x2], cv2.COLOR_BGR2HSV)[..., 2].astype(np.float32)
    cs, ce = int(round(0.30 * w)), max(int(round(0.70 * w)), int(round(0.30 * w)) + 1)
    ml, mr = max(1, int(round(0.18 * w))), max(1, int(round(0.18 * w)))
    core = np.arange(cs, ce)
    margin = np.r_[np.arange(0, ml), np.arange(w - mr, w)]
    torso = np.arange(int(0.10 * h), max(int(0.50 * h), int(0.10 * h) + 2))
    legs = np.arange(int(0.55 * h), max(int(0.92 * h), int(0.55 * h) + 2))
    a, b = _region(V, torso, core, margin), _region(V, legs, core, margin)
    return None if a is None or b is None else a + b
