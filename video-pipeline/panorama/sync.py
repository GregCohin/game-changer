"""Cale la vidéo suiveuse sur le panoramique : décalage temporel et repère terrain.

Principe : chaque échantillon de la vidéo suiveuse (équipe de Gregory) doit retrouver, au bon décalage,
un joueur de l'équipe sombre à moins de quelques mètres dans le panoramique. On accumule les décalages
candidats de toutes les paires proches ; le vrai décalage ressort comme un pic net.

Usage : python -m panorama.sync
"""
import itertools
import pickle
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.config import FOLLOWCAM_TEAM

MATCH = T.OUT / "match"
L, W = 105.0, 68.0
RADIUS = 3.0
BIN = 0.5
SPAN = 1500.0


def load_panorama(side="D"):
    ts, xs, ys = [], [], []
    n = 0
    for p in sorted(MATCH.glob("trk_*.pkl")) or sorted(MATCH.glob("trk2_*.pkl")):      # 1er match : pistes v1 ; matchs suivants : v2 seules
        n += 1
        for tr in pickle.load(open(p, "rb"))["tracks"]:
            if tr["side"] == side:
                for (t, X, Y, _rho) in tr["meas"]:
                    ts.append(t); xs.append(X); ys.append(Y)
    return np.array(ts), np.array(xs), np.array(ys), n


def load_followcam(team=FOLLOWCAM_TEAM):
    fc = pickle.load(open(T.OUT / "followcam.pkl", "rb"))
    rows = [(s[0], s[1], s[2]) for tr in fc["traces"] if tr["team"] == team for s in tr["samples"]]
    a = np.array(rows)
    return a[:, 0], a[:, 1], a[:, 2]


def to_pitch(xw, yl, s1, s2):
    return np.c_[s1 * (yl - 0.5) * L, s2 * (xw - 0.5) * W]


def offset_histogram(tree, Tp, t_fc, pts):
    nb = int(2 * SPAN / BIN)
    h = np.zeros(nb)
    for i0 in range(0, len(pts), 300):
        lists = tree.query_ball_point(pts[i0:i0 + 300], r=RADIUS)
        for i, idx in enumerate(lists):
            if not idx:
                continue
            d = Tp[idx] - t_fc[i0 + i]
            b = np.floor((d + SPAN) / BIN).astype(int)
            h += np.bincount(b[(b >= 0) & (b < nb)], minlength=nb)
    return h


def main():
    Tp, Xp, Yp, n = load_panorama("D")
    t_fc, xw, yl = load_followcam()
    print(f"panoramique : {n} tranches, {len(Tp)} mesures de l'équipe sombre ; vidéo suiveuse : {len(t_fc)} échantillons de l'équipe {FOLLOWCAM_TEAM}")
    tree = cKDTree(np.c_[Xp, Yp])
    results = []
    for s1, s2 in itertools.product((1, -1), repeat=2):
        h = offset_histogram(tree, Tp, t_fc, to_pitch(xw, yl, s1, s2))
        k = int(np.argmax(h))
        far = np.ones(len(h), bool); far[max(0, k - 20):k + 20] = False
        z = (h[k] - h[far].mean()) / (h[far].std() + 1e-9)
        results.append((z, s1, s2, k * BIN - SPAN, h[k], h[far].mean()))
        print(f"  signes (longueur {s1:+d}, largeur {s2:+d}) : pic à {k * BIN - SPAN + BIN / 2:+.1f} s, {h[k]:.0f} paires (fond {h[far].mean():.0f}), écart {z:.1f} sigma", flush=True)
    best = max(results)
    print(f"\nmeilleur : signes ({best[1]:+d}, {best[2]:+d}), décalage {best[3] + BIN / 2:+.1f} s (temps panoramique = temps suiveuse + décalage), {best[0]:.1f} sigma")
    pickle.dump(dict(s1=best[1], s2=best[2], offset=best[3] + BIN / 2, z=best[0]), open(T.OUT / "sync.pkl", "wb"))


if __name__ == "__main__":
    main()


def refine(offset0=None, s1=None, s2=None, radius=4.0):
    """Affine le décalage (pas de 0,1 s) et mesure la correspondance de coordonnées suiveuse -> panoramique."""
    from scipy.optimize import least_squares
    S = pickle.load(open(T.OUT / "sync.pkl", "rb"))
    offset0, s1, s2 = offset0 or S["offset"], s1 or S["s1"], s2 or S["s2"]
    Tp, Xp, Yp, n = load_panorama("D")
    t_fc, xw, yl = load_followcam()
    P = to_pitch(xw, yl, s1, s2)
    frame_of = {}
    for i, t in enumerate(np.round(Tp * 10).astype(int)):
        frame_of.setdefault(t, []).append(i)
    best = None
    for off in np.arange(offset0 - 3, offset0 + 3.01, 0.1):
        hits = 0
        for i in range(len(t_fc)):
            idx = frame_of.get(int(round((t_fc[i] + off) * 10)))
            if idx:
                d = np.hypot(Xp[idx] - P[i, 0], Yp[idx] - P[i, 1])
                hits += int(d.min() <= 3.0)
        if best is None or hits > best[1]:
            best = (off, hits)
        print(f"  décalage {off:+.1f} s : {hits} échantillons retrouvés à ≤3 m", flush=True) if abs(off - offset0) < 0.05 or hits == best[1] else None
    off = best[0]
    print(f"\ndécalage affiné : {off:+.1f} s ({best[1]} / {len(t_fc)} échantillons de l'équipe {FOLLOWCAM_TEAM} retrouvés à ≤3 m dans les {n} premières tranches)")
    pairs = []
    for i in range(len(t_fc)):
        idx = frame_of.get(int(round((t_fc[i] + off) * 10)))
        if idx:
            d = np.hypot(Xp[idx] - P[i, 0], Yp[idx] - P[i, 1])
            j = int(np.argmin(d))
            if d[j] <= radius:
                pairs.append((P[i, 0], P[i, 1], Xp[idx[j]], Yp[idx[j]]))
    A = np.array(pairs)
    print(f"{len(A)} paires (rayon {radius} m)")
    fit = []
    for axis, name in ((0, "X (longueur)"), (1, "Y (largeur)")):
        f = lambda p: p[0] * A[:, axis] + p[1] - A[:, 2 + axis]
        sol = least_squares(f, [1.0, 0.0], loss="soft_l1", f_scale=1.0)
        r = f(sol.x)
        fit.append(sol.x)
        print(f"  {name} : panoramique = {sol.x[0]:.3f} × suiveuse {sol.x[1]:+.2f} m ; écart résiduel médian {np.median(np.abs(r)):.2f} m, 90e centile {np.percentile(np.abs(r), 90):.2f} m")
    affine = dict(ax=float(fit[0][0]), bx=float(fit[0][1]), ay=float(fit[1][0]), by=float(fit[1][1]))
    pickle.dump(dict(s1=s1, s2=s2, offset=off, affine=affine), open(T.OUT / "sync.pkl", "wb"))       # label.py / crops.py relisent ce calage (propre à chaque match)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "refine":
    refine()
