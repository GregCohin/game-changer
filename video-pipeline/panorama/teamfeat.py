"""Descripteurs d'équipe calculés sur les pixels du panoramique, mesurés par rapport à la pelouse voisine.

Sur un joueur de 15-45 px, la couleur absolue est trompeuse (flou, ombre, reflets) ; ce qui sépare le maillot noir du
maillot clair, c'est sa luminosité par rapport à l'herbe qui l'entoure et la part de pixels nettement plus clairs
ou plus sombres que cette herbe.
"""
import pickle
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T

MATCH = T.OUT / "match"
CHUNK_S = 300.0
FEATURE_NAMES = ["dV_med", "dV_p10", "dV_p90", "bright", "dark", "sat", "blueness", "torso_minus_legs", "height", "bright_torso", "dark_torso", "dV_legs", "green_frac", "red_frac", "blue_frac", "white_frac"]


def load_boxes(chunk, cache={}):
    if chunk not in cache:
        cache.clear()
        d = pickle.load(open(MATCH / f"det_{chunk:03d}.pkl", "rb"))
        cache[chunk] = (d["frames"][0]["t"], d["frames"])
    return cache[chunk]


def box_at(t, foot_uv, max_px=4.0):
    """Boîte détectée (px plein cadre) dont le pied est le plus proche de foot_uv à l'instant t."""
    chunk = int(t // CHUNK_S)
    t0, frames = load_boxes(chunk)
    i = int(round((t - t0) * 10.0))
    if not (0 <= i < len(frames)):
        return None
    best = None
    for d in frames[i]["dets"]:
        b = d["box"]
        dist = np.hypot((b[0] + b[2]) / 2 - foot_uv[0], b[3] - foot_uv[1])
        if best is None or dist < best[0]:
            best = (dist, d)
    return best[1] if best and best[0] <= max_px else None


def _ring(V, hsv, x1, y1, x2, y2):
    """Herbe de référence : pixels verts juste à gauche/à droite de la boîte (même lignes) et sous les pieds."""
    H, W = V.shape
    w, h = x2 - x1, y2 - y1
    m = max(2, int(round(0.35 * w)))
    parts = []
    for xa, xb, ya, yb in ((x1 - m, x1, y1, y2), (x2, x2 + m, y1, y2), (x1, x2, y2, y2 + max(2, int(0.1 * h)))):
        xa, xb, ya, yb = max(0, xa), min(W, xb), max(0, ya), min(H, yb)
        if xb > xa and yb > ya:
            parts.append(hsv[ya:yb, xa:xb].reshape(-1, 3))
    if not parts:
        return None
    g = np.concatenate(parts)
    g = g[(g[:, 0] >= 35) & (g[:, 0] <= 95) & (g[:, 1] > 40)]
    return g if len(g) >= 6 else None


def features(frame_bgr, box):
    x1, y1, x2, y2 = [int(round(v)) for v in box]
    h, w = y2 - y1, x2 - x1
    if h < 8 or w < 4 or x1 < 3 or y1 < 0 or y2 > frame_bgr.shape[0] - 2 or x2 > frame_bgr.shape[1] - 3:
        return None
    pad = max(2, int(round(0.35 * w)))
    xa, xb = max(0, x1 - pad), min(frame_bgr.shape[1], x2 + pad)
    ya, yb = max(0, y1), min(frame_bgr.shape[0], y2 + max(2, int(0.1 * h)))
    sub = frame_bgr[ya:yb, xa:xb]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV).astype(np.float32)
    V = hsv[..., 2]
    grass = _ring(V, hsv, x1 - xa, y1 - ya, x2 - xa, y2 - ya)
    if grass is None:
        return None
    Vg = float(np.median(grass[:, 2]))
    cs, ce = int(round(0.25 * w)), max(int(round(0.75 * w)), int(round(0.25 * w)) + 1)
    body = hsv[y1 - ya:y2 - ya, x1 - xa + cs:x1 - xa + ce]
    bgr = sub[y1 - ya:y2 - ya, x1 - xa + cs:x1 - xa + ce].astype(np.float32)
    rows = np.arange(body.shape[0])
    torso = (rows >= 0.08 * h) & (rows < 0.48 * h)
    legs = (rows >= 0.55 * h) & (rows < 0.92 * h)
    bt, bl = body[torso].reshape(-1, 3), body[legs].reshape(-1, 3)             # boîte serrée : pas de filtre « herbe » (un maillot noir flouté avec l'herbe paraît vert sombre)
    if len(bt) < 3:
        return None
    dV = bt[:, 2] - Vg
    bgrt = bgr[torso].reshape(-1, 3)
    dvl = (np.median(bl[:, 2]) - Vg) if len(bl) >= 3 else np.median(dV)
    hh, ss, vv = bt[:, 0], bt[:, 1], bt[:, 2]
    green = float(((hh >= 35) & (hh <= 95) & (ss > 70) & (vv >= Vg + 5)).mean())
    red = float((((hh <= 12) | (hh >= 165)) & (ss > 90) & (vv > 60)).mean())
    blue = float(((hh >= 95) & (hh <= 125) & (ss > 50) & (vv > Vg + 20)).mean())
    white = float(((ss < 40) & (vv > Vg + 40)).mean())
    return [float(np.median(dV)), float(np.percentile(dV, 10)), float(np.percentile(dV, 90)), float((dV > 30).mean()), float((dV < -20).mean()),
            float(np.mean(bt[:, 1])), float(np.median(bgrt[:, 0] - bgrt[:, 2])), float(np.median(dV) - dvl), float(h),
            float((dV > 45).mean()), float((dV < -35).mean()), float(dvl), green, red, blue, white]
