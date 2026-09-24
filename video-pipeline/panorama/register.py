"""Recale image par image la vidéo suiveuse sur le panoramique.

Le calage terrain de la vidéo suiveuse (PnLCalib) se trompe de plusieurs mètres, de façon SYSTÉMATIQUE pour toute
une image : les joueurs vus ensemble gardent leurs positions relatives. On cherche donc, pour chaque image suiveuse
qui montre au moins 3 joueurs, la translation qui superpose au mieux ces joueurs aux joueurs du panoramique au même
instant, puis on rattache chacun à sa piste avec beaucoup plus de sûreté.

Usage : python -m panorama.register   (bilan sur les tranches déjà traitées)
"""
import collections
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.label import affine_of
from panorama.identify import load_tracklets

SEARCH = 6.0
STEP = 0.5
MATCH_R = 1.5


def followcam_by_time():
    S = pickle.load(open(T.OUT / "sync.pkl", "rb"))
    AFFINE = affine_of(S)
    fc = pickle.load(open(T.OUT / "followcam.pkl", "rb"))
    by_t = collections.defaultdict(list)
    for tr in fc["traces"]:
        if tr["team"] not in ("A", "B"):
            continue
        for (t, xw, yl) in tr["samples"]:
            X = S["s1"] * (yl - 0.5) * 105.0 * AFFINE["ax"] + AFFINE["bx"]
            Y = S["s2"] * (xw - 0.5) * 68.0 * AFFINE["ay"] + AFFINE["by"]
            by_t[int(round(t * 2))].append((tr["key"], tr["team"], X, Y, t))
    return by_t, S["offset"]


def panorama_frames(tracklets):
    fr = collections.defaultdict(list)
    for tl in tracklets:
        for t, X, Y in zip(tl.t, tl.X, tl.Y):
            fr[int(round(t * 10))].append((X, Y))
    return {k: np.array(v) for k, v in fr.items()}


def register(by_t, offset, pano, horizon):
    shifts = {}
    grid = np.arange(-SEARCH, SEARCH + 1e-9, STEP)
    for k2, pts in by_t.items():
        t_fc = k2 / 2.0
        if t_fc + offset > horizon or len(pts) < 3:
            continue
        Q = pano.get(int(round((t_fc + offset) * 10)))
        if Q is None or len(Q) < 3:
            continue
        P = np.array([[p[2], p[3]] for p in pts])
        best = []
        for dx in grid:
            for dy in grid:
                d = np.hypot((P[:, None, 0] + dx) - Q[None, :, 0], (P[:, None, 1] + dy) - Q[None, :, 1])
                score = int((d.min(1) <= MATCH_R).sum())
                best.append((score, -abs(dx) - abs(dy), dx, dy))
        best.sort(reverse=True)
        s1, s2 = best[0][0], next((b[0] for b in best if np.hypot(b[2] - best[0][2], b[3] - best[0][3]) > 2.0), 0)
        shifts[k2] = dict(dx=best[0][2], dy=best[0][3], matched=s1, total=len(P), second=s2)
    return shifts


if __name__ == "__main__":
    tl = load_tracklets()
    horizon = max(t.t1 for t in tl)
    by_t, offset = followcam_by_time()
    pano = panorama_frames(tl)
    shifts = register(by_t, offset, pano, horizon)
    good = {k: s for k, s in shifts.items() if s["matched"] >= max(3, 0.6 * s["total"]) and s["matched"] - s["second"] >= 1}
    print(f"horizon {horizon:.0f} s : {len(shifts)} images suiveuse avec ≥3 joueurs, dont {len(good)} recalées avec confiance")
    dx = np.array([s["dx"] for s in good.values()]); dy = np.array([s["dy"] for s in good.values()])
    print(f"translation trouvée : dx médian {np.median(dx):+.2f} m (écart-type {dx.std():.2f}), dy médian {np.median(dy):+.2f} m (écart-type {dy.std():.2f}) ; |translation| médiane {np.median(np.hypot(dx, dy)):.2f} m, 90e centile {np.percentile(np.hypot(dx, dy), 90):.2f} m")
    print(f"joueurs retrouvés par image recalée : {np.mean([s['matched'] / s['total'] for s in good.values()]) * 100:.0f} % (avant recalage global : cf. ci-dessous)")
    pickle.dump(good, open(T.OUT / "register.pkl", "wb"))
