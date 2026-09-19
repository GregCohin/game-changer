"""Calage v2 du panorama sur le terrain RÉGLEMENTAIRE (105 x 68 m) avec toutes ses lignes visibles (buts, surfaces, arcs, rond central, touche proche).

Les pixels blancs observés sont associés aux lignes du modèle par proximité (rayon décroissant) puis le modèle géométrique 2 est ajusté.
Usage : python -m panorama.calibrate2      # écrit output/panorama/calibration_v2.json et un aperçu
Repère : pixels du recadrage (y - CROP_Y0) ; le fichier écrit est converti en pixels de l'image complète.
"""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import calibrate as C1
from panorama.geometry2 import PanoramaModel2, PARAMS
from panorama.geometry import CROP_Y0

OUT = C1.OUT
L, W, DP, WP, RC = 105.0, 68.0, 16.5, 40.32, 9.15
GA_D, GA_W = 5.5, 18.32


def reg_lines():
    hx, hy = L / 2, W / 2
    s = np.linspace
    lines = {"mediane": np.c_[np.zeros(800), s(-hy, hy, 800)], "touche_proche": np.c_[s(-hx, hx, 2500), np.full(2500, hy)]}
    th = s(0, 2 * math.pi, 900)
    lines["rond"] = np.c_[RC * np.cos(th), RC * np.sin(th)]
    for sg, n in ((-1, "G"), (1, "D")):
        xb = sg * hx                                                                  # ligne de but
        lines[f"but_{n}"] = np.c_[np.full(800, xb), s(-hy, hy, 800)]
        xa = sg * (hx - DP)                                                           # surface de réparation
        lines[f"surf_avant_{n}"] = np.c_[np.full(600, xa), s(-WP / 2, WP / 2, 600)]
        for yy, m in ((WP / 2, "p"), (-WP / 2, "l")):
            lines[f"surf_cote_{m}_{n}"] = np.c_[s(xa, xb, 300), np.full(300, yy)]
        xg = sg * (hx - GA_D)                                                         # petite surface
        lines[f"pet_avant_{n}"] = np.c_[np.full(300, xg), s(-GA_W / 2, GA_W / 2, 300)]
        for yy, m in ((GA_W / 2, "p"), (-GA_W / 2, "l")):
            lines[f"pet_cote_{m}_{n}"] = np.c_[s(xg, xb, 150), np.full(150, yy)]
        xs = sg * (hx - 11.0)                                                         # arc de la surface (côté terrain)
        lim = math.acos((DP - 11.0) / RC)
        ph = s(-lim, lim, 300)
        lines[f"arc_{n}"] = np.c_[xs - sg * RC * np.cos(ph), RC * np.sin(ph)]
    return lines


def load_obs():
    crops = C1.grab_crops()
    global STATIC
    static = np.load(OUT / "static_lines.npy") if (OUT / "static_lines.npy").exists() else C1.static_lines(crops)
    STATIC = static
    th, pit = C1.tophat(crops[0]), C1.pitch_mask(crops[0])
    pit_in = cv2.erode(pit.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    ys, xs = np.nonzero(static & pit_in)
    P = np.stack([xs, ys], 1).astype(float)
    return crops, P, C1.near_touchline(th, pit)


STATIC = None
END_LEFT = [(329.5, 309.5), (418, 362), (518, 416)]          # touche proche à gauche, du coin vers le milieu (pixels du recadrage, lus sur l'image)
END_RIGHT = [(1619, 354), (1542, 394), (1465, 438)]
CORNERS = {"proche-gauche": ((-52.5, 34.0), (329.5, 309.5)), "proche-droit": ((52.5, 34.0), (1619.0, 354.0))}


def assign(model, lines, P, touche, r):
    """Pixels observés -> ligne du modèle la plus proche (dans un rayon r px). La touche proche garde sa détection dédiée."""
    trees, names = [], []
    for k, XY in lines.items():
        if k == "touche_proche":
            continue
        trees.append(cKDTree(model.project(XY)))
        names.append(k)
    D = np.stack([t.query(P)[0] for t in trees], 1)
    best = D.argmin(1)
    obs = {}
    for i, k in enumerate(names):
        sel = (best == i) & (D[np.arange(len(P)), i] < r)
        if sel.sum() >= 15:
            obs[k] = P[sel]
    ends = np.vstack([C1.roi(STATIC, END_LEFT, 7.0), C1.roi(STATIC, END_RIGHT, 7.0)])          # bouts de la touche proche, jusqu'aux coins
    obs["touche_proche"] = np.vstack([touche, ends])
    return obs


def fit(x0, lines, obs, free, bounds):
    idx = [PARAMS.index(k) for k in free]
    base = np.array(x0, float)

    def residuals(z):
        x = base.copy(); x[idx] = z
        m = PanoramaModel2.from_vector(x)
        res = []
        for k, P in obs.items():
            d = cKDTree(m.project(lines[k])).query(P)[0]
            res.append((0.5 if k == "touche_proche" else 1.0) * d / math.sqrt(max(1.0, len(P) / 150.0)))   # évite qu'une ligne longue écrase les autres
        for XY, uv in CORNERS.values():
            res.append(0.5 * (m.project(np.array([XY]))[0] - np.array(uv)))                           # coins : repères ponctuels de coordonnées connues
        return np.concatenate(res)

    lo = np.array([bounds[k][0] for k in free]); hi = np.array([bounds[k][1] for k in free])
    sol = least_squares(residuals, base[idx], bounds=(lo, hi), loss="soft_l1", f_scale=3.0, max_nfev=400, x_scale="jac")
    x = base.copy(); x[idx] = sol.x
    return x, sol.cost


def report(m, lines, obs):
    out = {}
    for k, P in obs.items():
        d = cKDTree(m.project(lines[k])).query(P)[0]
        out[k] = (len(P), float(np.median(d)), float(np.percentile(d, 90)))
    return out


BOUNDS = dict(Xc=(-30, 30), Yc=(30, 120), fx=(300, 1500), A=(3000, 30000), u0=(700, 1200), vh=(-600, 300), s=(-0.2, 0.2), k3=(-0.5, 0.5), c2=(-5e-4, 5e-4), B=(-3e5, 3e5), phi=(-0.3, 0.3), k5=(-0.3, 0.3))


def main():
    crops, P, touche = load_obs()
    lines = reg_lines()
    j = __import__("json").load(open(OUT / "calibration_tan__reglementaire.json"))
    x = PanoramaModel2(j["Xc"], j["Yc"], j["fx"], j["A"], j["u0"], j["vh"], j["s"]).vector()
    print("pixels blancs candidats (dans le terrain) :", len(P))
    free_sets = [
        (["Xc", "Yc", "fx", "A", "u0", "vh", "s"], 30.0),
        (["Xc", "Yc", "fx", "A", "u0", "vh", "s", "k3"], 20.0),
        (["Xc", "Yc", "fx", "A", "u0", "vh", "s", "k3", "c2", "phi"], 12.0),
        (PARAMS, 8.0),
        (PARAMS, 5.0),
        (PARAMS, 4.0),
    ]
    for free, r in free_sets:
        m = PanoramaModel2.from_vector(x)
        obs = assign(m, lines, P, touche, r)
        x, cost = fit(x, lines, obs, free, BOUNDS)
        m = PanoramaModel2.from_vector(x)
        rep = report(m, lines, obs)
        med = np.median([v[1] for v in rep.values()])
        print(f"r={r:4.0f} px libres={len(free):2d}  lignes {len(obs):2d}  pixels {sum(len(v) for v in obs.values()):6d}  coût {cost:9.0f}  médiane des écarts {med:.2f} px")
    print("paramètres :", {k: round(float(v), 5) for k, v in zip(PARAMS, x)})
    m0 = PanoramaModel2.from_vector(x)
    for k, (XY, uv) in CORNERS.items():
        print(f"coin {k}: prédit {np.round(m0.project(np.array([XY]))[0], 1)} observé {uv}")
    print("écarts par ligne (n, médiane px, p90 px) :")
    for k, v in rep.items():
        print(f"  {k:18s} n={v[0]:5d}  médiane {v[1]:5.2f}  p90 {v[2]:5.2f}")
    m = PanoramaModel2.from_vector(x)
    np.save(OUT / "calib2_x_crop.npy", x)
    full = PanoramaModel2.from_vector(np.r_[x[:5], x[5] + CROP_Y0, x[6:]])              # vh en pixels de l'image complète
    full.to_json(OUT / "calibration_v2.json")
    return m, lines, obs, crops


if __name__ == "__main__":
    main()
