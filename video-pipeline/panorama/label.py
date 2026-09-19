"""Étiquette les pistes du panoramique avec les identifications de Gregory sur la vidéo suiveuse.

Chaque échantillon d'une trace identifiée (recalé en temps et en coordonnées, cf. panorama.sync) vote pour
la piste sombre la plus proche au même instant, si elle est assez proche et assez isolée.

Usage : python -m panorama.label
"""
import collections
import json
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.config import load_numbers
from panorama.identify import load_tracklets

ROOT = Path(__file__).parent.parent
RADIUS = 2.5          # m : distance maximale entre l'échantillon suiveuse et la piste panoramique
MARGIN = 1.0          # m : la piste retenue doit être au moins ce plus proche que la suivante
AFFINE = dict(ax=0.950, bx=0.01, ay=0.974, by=0.18)     # suiveuse -> panoramique, mesuré par panorama.sync refine


def followcam_points():
    S = pickle.load(open(T.OUT / "sync.pkl", "rb"))
    fc = pickle.load(open(T.OUT / "followcam.pkl", "rb"))
    pts = []
    for tr in fc["traces"]:
        if not tr["player"]:
            continue
        for (t, xw, yl) in tr["samples"]:
            X = S["s1"] * (yl - 0.5) * 105.0 * AFFINE["ax"] + AFFINE["bx"]
            Y = S["s2"] * (xw - 0.5) * 68.0 * AFFINE["ay"] + AFFINE["by"]
            pts.append((t + S["offset"], X, Y, tr["player"], tr["key"]))
    return pts


def vote(tracklets, pts):
    by_frame = collections.defaultdict(list)
    for k, tl in enumerate(tracklets):
        for i, t in enumerate(np.round(tl.t * 10).astype(int)):
            by_frame[t].append((k, tl.X[i], tl.Y[i]))
    votes = collections.defaultdict(collections.Counter)
    used = skipped = missing = 0
    for (t, X, Y, player, key) in pts:
        cand = by_frame.get(int(round(t * 10)))
        if not cand:
            missing += 1
            continue
        d = np.array([np.hypot(c[1] - X, c[2] - Y) for c in cand])
        order = np.argsort(d)
        if d[order[0]] > RADIUS:
            missing += 1
            continue
        if len(order) > 1 and d[order[1]] - d[order[0]] < MARGIN:
            skipped += 1
            continue
        votes[cand[order[0]][0]][player] += 1
        used += 1
    return votes, used, skipped, missing


if __name__ == "__main__":
    tracklets = load_tracklets()
    horizon = max(t.t1 for t in tracklets)
    pts = [p for p in followcam_points() if p[0] <= horizon]
    votes, used, skipped, missing = vote(tracklets, pts)
    print(f"{len(tracklets)} pistes candidates (toutes couleurs : le classement clair/sombre est trop peu fiable), horizon {horizon:.0f} s ; échantillons identifiés dans l'horizon : {len(pts)}")
    print(f"votes retenus {used}, ambigus écartés {skipped}, sans piste proche {missing}")
    names = {v["id"]: f"#{k} {v['name'].strip()}" for k, v in load_numbers().items()}
    per_player = collections.defaultdict(lambda: [0, 0, 0.0])
    strong = 0
    for k, c in votes.items():
        (p, n), rest = c.most_common(1)[0], c.most_common()[1:]
        if n >= 3 and (not rest or n >= 2 * rest[0][1]):
            strong += 1
            per_player[p][0] += 1
            per_player[p][1] += n
            per_player[p][2] += tracklets[k].t1 - tracklets[k].t0
    print(f"pistes avec un vote net (≥3 votes, ≥2× le suivant) : {strong} sur {len(votes)} pistes votées")
    for p, (nt, nv, dur) in sorted(per_player.items(), key=lambda kv: -kv[1][2]):
        print(f"  {names.get(p, p[:8]):28s} {nt:3d} pistes, {nv:4d} votes, {dur:6.0f} s étiquetées")
    conflicts = [(k, c) for k, c in votes.items() if len(c) > 1 and c.most_common()[1][1] >= 2]
    print(f"pistes avec votes contradictoires (≥2 votes pour un second joueur) : {len(conflicts)}")
    pickle.dump({k: dict(c) for k, c in votes.items()}, open(T.OUT / "votes.pkl", "wb"))
