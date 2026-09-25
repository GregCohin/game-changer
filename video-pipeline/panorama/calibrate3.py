"""Calage v2 à dimensions de terrain LIBRES (longueur et largeur ajustées), à partir de repères pointés sur une image médiane sans joueurs.

Pourquoi ce module : calibrate2 impose un terrain 105 x 68 m et s'amorce sur des repères lus à l'œil. Sur un terrain aux dimensions différentes,
avec des repères posés à côté de la peinture, il converge « parfaitement » sur de fausses lignes (clôture, arbres) et donne des positions compressées
d'un facteur ~0,6 sans que les résidus en pixels le montrent (match 2, 2026-09-23). Ici la demi-longueur G et la demi-largeur H sont des paramètres
ajustés, les repères se lisent sur des vues quadrillées, et le résultat se contrôle sur une image (controle.jpg) ET sur des mesures indépendantes :
vitesses des joueurs (médiane ~4,5 km/h, p99 ~20-24) et étendue de leurs positions (~ la longueur du terrain).

Usage (variables d'environnement du match, dont PANORAMA_VIDEO, PANORAMA_CROP, PANORAMA_OUT) :
  python -m panorama.calibrate3 vues     # image médiane (sans joueurs) + vues quadrillées dans <OUT>/calib3/ : y lire les repères
  python -m panorama.calibrate3 ajuste   # lit <OUT>/calib3_reperes.json ; écrit calibration_v2.json, pitch.json et calib3/controle.jpg

calib3_reperes.json : {"points": {"L1": [u, v], ...}} — pixels du recadrage PANORAMA_CROP. Repères (X, Y en mètres, origine au centre, Y > 0 côté
caméra ; G, H : demi-longueur et demi-largeur du terrain, ajustées) :
  C1 / C2  rond central, extrémités gauche / droite (sert seulement à cadrer l'anneau du rond)
  C3 / C4  rond central x ligne médiane, côté loin / proche          (0, -9,15) / (0, +9,15)
  L1 / L2  but gauche, pied des poteaux, côté proche / loin          (-G, +3,66) / (-G, -3,66)
  L3       petite surface gauche, coin sur la ligne de but, proche   (-G, +9,16)
  L4 / L5  petite surface gauche, coins avant, proche / loin         (-G+5,5, +9,16) / (-G+5,5, -9,16)
  L6       surface gauche, coin sur la ligne de but, proche          (-G, +20,16)
  L7 / L8  surface gauche, coins avant, proche / loin                (-G+16,5, +20,16) / (-G+16,5, -20,16)
  L9       coin proche gauche (pied du piquet)                       (-G, +H)
  R1..R9   idem à droite (X = +G, +G-5,5, +G-16,5)
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
from panorama.config import PANORAMA_OUT, open_panorama
from panorama.geometry import CROP_Y0, CROP_Y1
from panorama.geometry2 import PARAMS, PanoramaModel2

OUT = Path(PANORAMA_OUT) if PANORAMA_OUT else Path(__file__).parent.parent / "output" / "panorama"
DIR = OUT / "calib3"
# nom -> (a, b) pour X = a + b*G, (c, d) pour Y = c + d*H
METRIC = {"C3": ((0, 0), (-9.15, 0)), "C4": ((0, 0), (9.15, 0)),
          **{f"{s}{i}": ((a, b), (c, d)) for s, b in (("L", -1), ("R", 1)) for i, a, c, d in (
              (1, 0, 3.66, 0), (2, 0, -3.66, 0), (3, 0, 9.16, 0), (4, 5.5 * -b, 9.16, 0), (5, 5.5 * -b, -9.16, 0),
              (6, 0, 20.16, 0), (7, 16.5 * -b, 20.16, 0), (8, 16.5 * -b, -20.16, 0), (9, 0, 0, 1))}}
BOUNDS = dict(Xc=(-10, 10), Yc=(15, 140), fx=(300, 3500), A=(2000, 80000), u0=(0, 1), vh=(-800, 600), s=(-0.3, 0.3), k3=(-0.6, 0.6),
              c2=(-5e-4, 5e-4), B=(-4e5, 4e5), phi=(-0.15, 0.15), k5=(-0.4, 0.4))     # u0 en fraction de la largeur d'image (remplacé plus bas)


def median_image(n=10):
    """Médiane de n images réparties sur la capture : les joueurs disparaissent, la peinture reste (caméra fixe)."""
    cap = open_panorama()
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    for t in np.linspace(0.08, 0.92, n) * total / fps:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, f = cap.read()
        if ok:
            frames.append(f[CROP_Y0:CROP_Y1])
    return np.median(np.stack(frames), axis=0).astype(np.uint8)


def grid_view(img, u0, u1, v0, v1, zoom, path, step=50):
    view = cv2.resize(img[v0:v1, u0:u1], None, fx=zoom, fy=zoom, interpolation=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(view, cv2.COLOR_BGR2LAB)
    lab[..., 0] = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4)).apply(lab[..., 0])
    view = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    for u in range((u0 // step + 1) * step, u1, step):
        x = int((u - u0) * zoom)
        cv2.line(view, (x, 0), (x, view.shape[0]), (0, 255, 255) if u % 100 == 0 else (0, 140, 140), 1)
        if u % 100 == 0:
            cv2.putText(view, str(u), (x + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
    for v in range((v0 // step + 1) * step, v1, step):
        y = int((v - v0) * zoom)
        cv2.line(view, (0, y), (view.shape[1], y), (255, 255, 0) if v % 100 == 0 else (140, 140, 0), 1)
        if v % 100 == 0:
            cv2.putText(view, str(v), (2, y - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)
    cv2.imwrite(str(path), view)


def vues():
    DIR.mkdir(parents=True, exist_ok=True)
    med = median_image()
    cv2.imwrite(str(DIR / "mediane.png"), med)
    W = med.shape[1]
    grid_view(med, int(0.10 * W), int(0.41 * W), 380, 720, 1.7, DIR / "vue_gauche.png")
    grid_view(med, int(0.60 * W), int(0.92 * W), 380, 720, 1.6, DIR / "vue_droite.png")
    grid_view(med, int(0.41 * W), int(0.61 * W), 400, 700, 2.4, DIR / "vue_centre.png")
    cv2.imwrite(str(DIR / "mediane_reduite.jpg"), cv2.resize(med[300:], None, fx=0.55, fy=0.55, interpolation=cv2.INTER_AREA))
    print(f"écrit dans {DIR} : mediane.png, vue_gauche/droite/centre.png (quadrillage en pixels du recadrage), mediane_reduite.jpg")


def lines(G, H):
    s = np.linspace
    th = s(0, 2 * math.pi, 900)
    L = {"mediane": np.c_[np.zeros(900), s(-H, H, 900)], "touche_proche": np.c_[s(-G, G, 3000), np.full(3000, H)], "rond": np.c_[9.15 * np.cos(th), 9.15 * np.sin(th)]}
    for sg, n in ((-1, "G"), (1, "D")):
        xb, xa, xg = sg * G, sg * (G - 16.5), sg * (G - 5.5)
        L[f"but_{n}"] = np.c_[np.full(900, xb), s(-H, H, 900)]
        L[f"surf_avant_{n}"] = np.c_[np.full(500, xa), s(-20.16, 20.16, 500)]
        L[f"surf_cote_p_{n}"] = np.c_[s(xa, xb, 300), np.full(300, 20.16)]
        L[f"pet_avant_{n}"] = np.c_[np.full(300, xg), s(-9.16, 9.16, 300)]
        L[f"pet_cote_p_{n}"] = np.c_[s(xg, xb, 150), np.full(150, 9.16)]
    return L


def observations(med, pt):
    """Pixels de peinture (top-hat de l'image médiane) rattachés à chaque ligne : couloirs étroits autour des segments entre repères, anneau du rond,
    ligne médiane, et grandes composantes de la moitié basse pour la touche proche (hors bords de l'image : buts de fortune, clôture)."""
    gray = cv2.cvtColor(med, cv2.COLOR_BGR2GRAY)
    th = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    static = th > 20
    ys, xs = np.nonzero(static)
    ALL = np.c_[xs, ys].astype(float)

    def near(poly, r):
        poly = np.array(poly, float)
        keep = np.zeros(len(ALL), bool)
        for a, b in zip(poly[:-1], poly[1:]):
            ab = b - a
            t = np.clip(((ALL - a) @ ab) / (ab ** 2).sum(), 0, 1)
            keep |= np.linalg.norm(ALL - (a + t[:, None] * ab), axis=1) < r
        return ALL[keep]

    P = {k: np.array(v, float) for k, v in pt.items()}
    obs = {}
    for s, n in (("L", "G"), ("R", "D")):
        obs[f"but_{n}"] = near([P[s + "9"], P[s + "6"], P[s + "3"], P[s + "1"], P[s + "2"]], 7)
        obs[f"surf_avant_{n}"] = near([P[s + "7"], P[s + "8"]], 6)
        obs[f"surf_cote_p_{n}"] = near([P[s + "6"], P[s + "7"]], 6)
        obs[f"pet_avant_{n}"] = near([P[s + "4"], P[s + "5"]], 5)
        obs[f"pet_cote_p_{n}"] = near([P[s + "3"], P[s + "4"]], 5)
    cx, cy = (P["C1"] + P["C2"])[0] / 2, (P["C3"][1] + P["C4"][1]) / 2
    rx, ry = (P["C2"][0] - P["C1"][0]) / 2, (P["C4"][1] - P["C3"][1]) / 2
    q = ((ALL[:, 0] - cx) / rx) ** 2 + ((ALL[:, 1] - cy) / ry) ** 2
    obs["rond"] = ALL[(q > 0.86) & (q < 1.16)]
    u_of = lambda v: P["C3"][0] + (v - P["C3"][1]) * (P["C4"][0] - P["C3"][0]) / (P["C4"][1] - P["C3"][1])
    sel = (np.abs(ALL[:, 0] - u_of(ALL[:, 1])) < 5) & (ALL[:, 1] > P["C3"][1] - 90) & (ALL[:, 1] < med.shape[0] - 5) & ~((ALL[:, 1] > P["C3"][1] - 15) & (ALL[:, 1] < P["C4"][1] + 15))
    obs["mediane"] = ALL[sel]
    n_, lab, st, _ = cv2.connectedComponentsWithStats(static.astype(np.uint8), connectivity=8)
    row0 = min(P["L9"][1], P["R9"][1]) - 20
    tp = [np.c_[np.nonzero(lab == i)[1], np.nonzero(lab == i)[0]].astype(float) for i in range(1, n_)
          if st[i, cv2.CC_STAT_AREA] > 200 and st[i, cv2.CC_STAT_TOP] > row0 and 250 < st[i, cv2.CC_STAT_LEFT] < med.shape[1] - 180
          and not (abs(st[i, cv2.CC_STAT_LEFT] - P["C3"][0]) < 25 and st[i, cv2.CC_STAT_WIDTH] < 15)]
    obs["touche_proche"] = np.vstack(tp)
    return obs


def ajuste():
    med = cv2.imread(str(DIR / "mediane.png"))
    if med is None:
        raise SystemExit(f"Lancer d'abord : python -m panorama.calibrate3 vues (image médiane absente de {DIR}).")
    pts = json.load(open(OUT / "calib3_reperes.json"))["points"]
    W = med.shape[1]
    bounds = dict(BOUNDS, u0=(0.3 * W, 0.7 * W))
    names = [k for k in METRIC if k in pts]
    UV = np.array([pts[k] for k in names], float)
    AB = np.array([[*METRIC[k][0], *METRIC[k][1]] for k in names], float)
    xy = lambda G, H: np.c_[AB[:, 0] + AB[:, 1] * G, AB[:, 2] + AB[:, 3] * H]

    def resid_pts(z, idx, base):
        x = base.copy(); x[idx] = z[:-2]
        return (PanoramaModel2.from_vector(x).project(xy(*z[-2:])) - UV).ravel()

    rng = np.random.default_rng(0)
    best = None
    for _ in range(300):                                    # départs aléatoires : le calage manuel seul est bon marché
        x0 = np.array([rng.uniform(-8, 8), rng.uniform(25, 100), rng.uniform(600, 1800), rng.uniform(5000, 40000), rng.uniform(0.4 * W, 0.6 * W), rng.uniform(-200, 250),
                       rng.uniform(-0.08, 0.08), rng.uniform(0, 0.4), 0.0, 0.0, 0.0, 0.0])
        G0, H0 = rng.uniform(35, 55), rng.uniform(22, 38)
        for free in (PARAMS[:8], PARAMS):
            idx = [PARAMS.index(k) for k in free]
            lo, hi = np.r_[[bounds[k][0] for k in free], 25, 15], np.r_[[bounds[k][1] for k in free], 70, 50]
            try:
                sol = least_squares(resid_pts, np.clip(np.r_[x0[idx], G0, H0], lo + 1e-6, hi - 1e-6), args=(idx, x0), bounds=(lo, hi), loss="soft_l1", f_scale=6.0, max_nfev=600, x_scale="jac")
            except Exception:
                break
            x0 = x0.copy(); x0[idx] = sol.x[:-2]; G0, H0 = sol.x[-2:]
        if best is None or sol.cost < best[0]:
            best = (sol.cost, x0.copy(), G0, H0)
    _, x, G, H = best
    print(f"repères seuls : terrain {2 * G:.1f} x {2 * H:.1f} m")

    obs = observations(med, pts)
    print("pixels de peinture par ligne :", {k: len(v) for k, v in obs.items()})

    def resid_all(z, idx, base):
        xx = base.copy(); xx[idx] = z[:-2]
        m = PanoramaModel2.from_vector(xx)
        G_, H_ = z[-2:]
        res = [0.7 * (m.project(xy(G_, H_)) - UV).ravel()]
        Ls = lines(G_, H_)
        for k, Pk in obs.items():
            res.append(cKDTree(m.project(Ls[k])).query(Pk)[0] / math.sqrt(max(1.0, len(Pk) / 150.0)))
        return np.concatenate(res)

    for free in (PARAMS[:6] + ["s", "k3", "phi", "B"], PARAMS):
        idx = [PARAMS.index(k) for k in free]
        lo, hi = np.r_[[bounds[k][0] for k in free], 40, 25], np.r_[[bounds[k][1] for k in free], 60, 45]
        sol = least_squares(resid_all, np.clip(np.r_[x[idx], G, H], lo + 1e-6, hi - 1e-6), args=(idx, x), bounds=(lo, hi), loss="soft_l1", f_scale=4.0, max_nfev=800, x_scale="jac")
        x = x.copy(); x[idx] = sol.x[:-2]; G, H = sol.x[-2:]
    m = PanoramaModel2.from_vector(x)
    print(f"terrain ajusté : {2 * G:.1f} x {2 * H:.1f} m ; paramètres", {k: round(float(v), 5) for k, v in zip(PARAMS, x)})
    if abs(x[PARAMS.index("phi")]) > 0.14:
        print("  (lacet de caméra au bord de sa borne : c'est une direction mal déterminée, sans effet sur les positions si l'écart aux repères reste petit)")
    Ls = lines(G, H)
    for k, Pk in obs.items():
        d = cKDTree(m.project(Ls[k])).query(Pk)[0]
        print(f"  {k:16s} n={len(Pk):5d}  médiane {np.median(d):5.2f} px  p90 {np.percentile(d, 90):6.2f} px")
    err = np.hypot(*(m.project(xy(G, H)) - UV).T)
    print(f"repères pointés : écart médian {np.median(err):.1f} px, max {err.max():.1f} px ({names[int(err.argmax())]}) — un écart > 8 px est en général une erreur de lecture du repère")
    m.to_json(OUT / "calibration_v2.json")                 # vh en pixels du recadrage utile : CROP_Y0 vaut 0 avec PANORAMA_INNER_CROP=0,...
    json.dump({"length_m": round(2 * G, 1), "width_m": round(2 * H, 1)}, open(OUT / "pitch.json", "w"), indent=1)
    controle(m, G, H, med)
    print(f"écrit calibration_v2.json, pitch.json ; à utiliser : PANORAMA_PITCH={2 * G:.1f},{2 * H:.1f} PANORAMA_TRACK_MODEL=v2")


def controle(m, G, H, med):
    img = med.copy()

    def poly(pts, color, w=2):
        cv2.polylines(img, [m.project(np.array(pts, float)).astype(np.int32)], False, color, w, cv2.LINE_AA)

    seg = lambda p, q, n=80: [(p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s) for s in np.linspace(0, 1, n)]
    RED, CYAN, YEL = (60, 60, 255), (255, 255, 0), (0, 255, 255)
    poly(seg((-G, -H), (G, -H), 200) + seg((G, -H), (G, H), 200) + seg((G, H), (-G, H), 200) + seg((-G, H), (-G, -H), 200), RED, 2)
    poly(seg((0, -H), (0, H), 100), RED, 1)
    poly([(9.15 * math.cos(a), 9.15 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 120)], RED, 1)
    for s in (-1, 1):
        xa, xg = s * (G - 16.5), s * (G - 5.5)
        poly(seg((s * G, -20.16), (xa, -20.16)) + seg((xa, -20.16), (xa, 20.16)) + seg((xa, 20.16), (s * G, 20.16)), CYAN, 1)
        poly(seg((s * G, -9.16), (xg, -9.16)) + seg((xg, -9.16), (xg, 9.16)) + seg((xg, 9.16), (s * G, 9.16)), CYAN, 1)
        poly(seg((s * G, -3.66), (s * G + s * 0.01, 3.66)), YEL, 3)
    cv2.imwrite(str(DIR / "controle.jpg"), cv2.resize(img[300:], None, fx=0.55, fy=0.55, interpolation=cv2.INTER_AREA))


if __name__ == "__main__":
    {"vues": vues, "ajuste": ajuste}[sys.argv[1] if len(sys.argv) > 1 else "ajuste"]()
