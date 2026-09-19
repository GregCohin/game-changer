"""Repère les coups d'envoi (et remises en jeu) : les deux équipes sont chacune dans leur moitié de terrain.

Usage : python -m panorama.kickoff
"""
import collections
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T

MATCH = T.OUT / "match"
BIN = 2.0


def separation_series():
    pos = collections.defaultdict(lambda: {"D": [], "L": []})
    for p in sorted(MATCH.glob("trk_*.pkl")):
        for tr in pickle.load(open(p, "rb"))["tracks"]:
            if tr["side"] not in ("D", "L"):
                continue
            for (t, X, Y, _) in tr["meas"]:
                pos[int(t // BIN)][tr["side"]].append(X)
    rows = []
    for b in sorted(pos):
        d, l = np.array(pos[b]["D"]), np.array(pos[b]["L"])
        if len(d) < 5 * BIN * 10 * 0.5 or len(l) < 5 * BIN * 10 * 0.5:      # au moins ~5 joueurs de chaque côté (10 Hz)
            continue
        f = max((d < 0).mean() * (l > 0).mean(), (d > 0).mean() * (l < 0).mean())
        rows.append((b * BIN, f, float(d.mean()), float(l.mean()), len(d) / (BIN * 10), len(l) / (BIN * 10)))
    return rows


if __name__ == "__main__":
    rows = separation_series()
    print(f"{len(rows)} tranches de {BIN:.0f} s exploitables")
    good = [r for r in rows if r[1] >= 0.85]
    # regroupe les instants consécutifs
    groups, cur = [], []
    for r in good:
        if cur and r[0] - cur[-1][0] > 6:
            groups.append(cur); cur = []
        cur.append(r)
    if cur:
        groups.append(cur)
    print("instants où chaque équipe est dans sa moitié (indice >= 0,85), regroupés :")
    for g in groups:
        if len(g) >= 2:
            print(f"  de {g[0][0]:.0f} s à {g[-1][0] + BIN:.0f} s ({len(g) * BIN:.0f} s) : indice moyen {np.mean([r[1] for r in g]):.2f} ; joueurs sombres ~{np.mean([r[4] for r in g]):.0f} (X moyen {np.mean([r[2] for r in g]):+.0f} m), clairs ~{np.mean([r[5] for r in g]):.0f} (X moyen {np.mean([r[3] for r in g]):+.0f} m)")
