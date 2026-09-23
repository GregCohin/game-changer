"""Calage du panorama à partir des lignes blanches du terrain (une seule fois : caméra fixe).

Usage : python -m panorama.calibrate [variante] (depuis video-pipeline/, venv activé)
Compare plusieurs modèles / niveaux de contraintes et écrit output/panorama/calibration_<variante>.json
+ une image de contrôle.
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama.geometry import PanoramaModel, CROP_Y0, CROP_Y1
from panorama.config import PANORAMA_OUT, open_panorama

OUT = Path(PANORAMA_OUT) if PANORAMA_OUT else Path(__file__).parent.parent / "output" / "panorama"
TIMES = (900, 1800, 3600)
REG = dict(L=105.0, W=68.0, Dp=16.5, Wp=40.32, Rc=9.15)   # dimensions réglementaires (11 contre 11)

# Repères approximatifs (pixels du recadrage) pour amorcer le calage : ceux du 1er match (ALDM-FCSN). Un autre
# match (cadrage différent) doit fournir output/calib_seed.json (dans son propre PANORAMA_OUT) avec les clés
# qui diffèrent ; les autres gardent ce défaut. Revu à l'œil sur une image de la nouvelle capture à chaque match.
DEFAULT_SEED = {
    "mediane": [[971, 232], [945, 550]],
    "surfD_avant": [[1213, 258], [1415, 343]],
    "surfD_cote": [[1415, 343], [1503, 325]],
    "surfG_avant": [[525, 307], [690, 253]],
    "surfG_cote": [[525, 307], [450, 287]],
    "circle": [967.5, 287.0, 94.0, 25.0],          # cx, cy, rx, ry (ellipse du rond central dans l'image)
    "touchline_x": [420, 1600],                     # colonnes où chercher la touche proche
    "end_left": [[329.5, 309.5], [418, 362], [518, 416]],     # touche proche à gauche, du coin vers le milieu
    "end_right": [[1619, 354], [1542, 394], [1465, 438]],
    "corners": {"proche-gauche": [[-52.5, 34.0], [329.5, 309.5]], "proche-droit": [[52.5, 34.0], [1619.0, 354.0]]},
}


def load_seed():
    """Repères d'amorçage du calage pour le match courant : output/calib_seed.json s'il existe, sinon DEFAULT_SEED (1er match)."""
    path = OUT / "calib_seed.json"
    if not path.exists():
        return DEFAULT_SEED
    seed = dict(DEFAULT_SEED)
    seed.update(json.load(open(path)))
    return seed


def grab_crops():
    cap = open_panorama()
    crops = []
    for t in TIMES:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, f = cap.read()
        crops.append(f[CROP_Y0:CROP_Y1, :].copy())
    return crops


def tophat(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))


def static_lines(crops):
    ms = [tophat(c) > 28 for c in crops]
    k = np.ones((3, 3), np.uint8)
    return ms[0] & cv2.dilate(ms[1].astype(np.uint8), k).astype(bool) & cv2.dilate(ms[2].astype(np.uint8), k).astype(bool)


def pitch_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    g = ((hsv[..., 0] >= 40) & (hsv[..., 0] <= 95) & (hsv[..., 1] > 55) & (hsv[..., 2] > 30)).astype(np.uint8)
    g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(g)
    return lab == (1 + np.argmax(st[1:, cv2.CC_STAT_AREA]))


def near_touchline(th, pit, x0=420, x1=1600, step=4):
    pts = []
    for x in range(x0, x1, step):
        ys = np.where(pit[:, x])[0]
        if not len(ys):
            continue
        yb = ys.max()
        lo, hi = max(0, yb - 95), yb - 12
        col = th[lo:hi, x].astype(float)
        if len(col) < 5 or col.max() < 30:
            continue
        pts.append((x, lo + int(np.argmax(col))))
    p = np.array(pts, float)
    ys = np.array([np.median(p[max(0, i - 7):i + 8, 1]) for i in range(len(p))])
    return np.stack([p[:, 0], ys], 1)


def roi(static, poly, r):
    ys, xs = np.nonzero(static)
    P = np.stack([xs, ys], 1).astype(float)
    keep = np.zeros(len(P), bool)
    poly = np.array(poly, float)
    for a, b in zip(poly[:-1], poly[1:]):
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab ** 2).sum(), 0, 1)
        keep |= np.linalg.norm(P - (a + t[:, None] * ab), axis=1) < r
    return P[keep]


def circle_pixels(static, cx=967.5, cy=287.0, rx=94.0, ry=25.0):
    ys, xs = np.nonzero(static)
    P = np.stack([xs, ys], 1).astype(float)
    q = ((P[:, 0] - cx) / rx) ** 2 + ((P[:, 1] - cy) / ry) ** 2
    return P[(q > 0.78) & (q < 1.28)]


def model_lines(g):
    hx, hy = g["L"] / 2, g["W"] / 2
    s = np.linspace
    th = np.linspace(0, 2 * math.pi, 900)
    return {
        "mediane": np.c_[np.zeros(900), s(-hy, hy, 900)],
        "touche_proche": np.c_[s(-hx, hx, 2500), np.full(2500, hy)],
        "rond": np.c_[g["Rc"] * np.cos(th), g["Rc"] * np.sin(th)],
        "surfD_avant": np.c_[np.full(900, hx - g["Dp"]), s(-g["Wp"] / 2, g["Wp"] / 2, 900)],
        "surfD_cote": np.c_[s(hx - g["Dp"], hx, 500), np.full(500, g["Wp"] / 2)],
        "surfG_avant": np.c_[np.full(900, -hx + g["Dp"]), s(-g["Wp"] / 2, g["Wp"] / 2, 900)],
        "surfG_cote": np.c_[s(-hx, -hx + g["Dp"], 500), np.full(500, g["Wp"] / 2)],
    }


# variante de modèle -> (noms des paramètres caméra, valeurs de départ, bornes)
KINDS = {
    "tan": (["Xc", "Yc", "fx", "A", "u0", "vh", "s"], [1.2, 55.0, 590.0, 8000.0, 979.0, 138.0, 0.034],
            [-80, 25, 150, 500, 300, -400, -0.3], [80, 200, 3000, 60000, 1800, 300, 0.3]),
    "eq": (["Xc", "Yc", "fx", "fy", "Zc", "u0", "vh", "s"], [1.2, 55.0, 590.0, 700.0, 11.0, 979.0, 138.0, 0.034],
           [-80, 25, 150, 150, 2, 300, -400, -0.3], [80, 200, 3000, 4000, 80, 1800, 300, 0.3]),
}
# niveau de contraintes -> dimensions imposées (les autres sont ajustées)
MODES = {
    "libre": {},
    "L105_W68": dict(L=105.0, W=68.0),
    "reglementaire": dict(L=105.0, W=68.0, Dp=16.5, Wp=40.32),
    "reglementaire_rond_libre": dict(L=105.0, W=68.0, Dp=16.5, Wp=40.32, Rc=None),
}
GEO_BOUNDS = dict(L=(80, 130), W=(45, 90), Dp=(6, 25), Wp=(15, 60), Rc=(5, 12))


def build(kind, x):
    names = KINDS[kind][0]
    p = dict(zip(names, x[:len(names)]))
    return PanoramaModel(p["Xc"], p["Yc"], p["fx"], p["u0"], p["vh"], p["s"], kind=kind,
                         A=p.get("A"), fy=p.get("fy"), Zc=p.get("Zc"))


def fit(obs, kind, mode, tie_fy=False, cam_x0=None, touche_weight=0.5):
    fixed = {k: v for k, v in MODES[mode].items() if v is not None}
    free = [k for k in ("L", "W", "Dp", "Wp", "Rc") if k not in fixed]
    ncam = len(KINDS[kind][0])
    weight = {k: 1.0 for k in obs}
    weight["touche_proche"] = touche_weight

    def unpack(x):
        g = dict(REG); g.update(fixed)
        for i, k in enumerate(free):
            g[k] = x[ncam + i]
        xc = np.array(x[:ncam], float)
        if kind == "eq" and tie_fy:
            xc[3] = xc[2]
        return build(kind, xc), g

    def residuals(x):
        m, g = unpack(x)
        return np.concatenate([weight[k] * cKDTree(m.project(XY)).query(obs[k])[0] for k, XY in model_lines(g).items()])

    lo = np.r_[KINDS[kind][2], [GEO_BOUNDS[k][0] for k in free]]
    hi = np.r_[KINDS[kind][3], [GEO_BOUNDS[k][1] for k in free]]
    x0 = np.r_[cam_x0 if cam_x0 is not None else KINDS[kind][1], [REG[k] for k in free]]
    sol = least_squares(residuals, x0, bounds=(lo, hi), loss="soft_l1", f_scale=3.0, max_nfev=500)
    m, g = unpack(sol.x)
    per = {k: (float(np.median(d)), float(np.percentile(d, 90)))
           for k, XY in model_lines(g).items() for d in [cKDTree(m.project(XY)).query(obs[k])[0]]}
    return m, g, sol.cost, per


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    seed = load_seed()
    crops = grab_crops()
    static = static_lines(crops)
    th, pit = tophat(crops[0]), pitch_mask(crops[0])
    tx0, tx1 = seed["touchline_x"]
    r_cote = seed.get("cote_radius", 5)
    # repères lus à l'œil sur l'image couleur (touchline_points), quand la détection automatique de la
    # pelouse (pitch_mask) échoue à isoler le terrain du reste du décor (couleur d'herbe hors de son réglage habituel)
    touche = np.array(seed["touchline_points"], float) if "touchline_points" in seed else near_touchline(th, pit, x0=tx0, x1=tx1)
    obs = {
        "mediane": roi(static, seed["mediane"], 6),
        "touche_proche": touche,
        "rond": circle_pixels(static, *seed["circle"]),
        "surfD_avant": roi(static, seed["surfD_avant"], 5),
        "surfD_cote": roi(static, seed["surfD_cote"], r_cote),
        "surfG_avant": roi(static, seed["surfG_avant"], 5),
        "surfG_cote": roi(static, seed["surfG_cote"], r_cote),
    }
    combos = [(k, m, tie) for k in ("tan", "eq") for m in MODES for tie in ((False, True) if k == "eq" else (False,))]
    if len(sys.argv) > 1 and sys.argv[1] != "toutes":
        combos = [c for c in combos if f"{c[0]}{'_iso' if c[2] else ''}__{c[1]}" == sys.argv[1]]
    cam_x0 = seed.get("cam_x0", {})   # point de départ caméra par variante ("tan"/"eq"), sinon celui du 1er match (KINDS)
    best = {}
    for kind, mode, tie in combos:
        name = f"{kind}{'_iso' if tie else ''}__{mode}"
        m, g, cost, per = fit(obs, kind, mode, tie, cam_x0=cam_x0.get(kind), touche_weight=seed.get("touche_weight", 0.5))
        best[name] = (m, g)
        camtxt = f"fx={m.fx:.0f}" + (f" A={m.A:.0f}" if kind == "tan" else f" fy={m.fy:.0f} Zc={m.Zc:.1f}") + f" Yc={m.Yc:.1f} s={m.s:+.3f}"
        print(f"[{name:34s}] coût {cost:8.0f} | L={g['L']:.0f} W={g['W']:.1f} surface {g['Dp']:.1f}x{g['Wp']:.1f} rond {g['Rc']:.2f} | {camtxt}")
        print("      écart médian px : " + "  ".join(f"{k} {a:.1f}" for k, (a, b) in per.items()), flush=True)
        m.L, m.W = g["L"], g["W"]
        m.to_json(OUT / f"calibration_{name}.json")


if __name__ == "__main__":
    main()
