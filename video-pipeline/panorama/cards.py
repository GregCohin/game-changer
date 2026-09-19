"""Cartes de revue : une piste du panoramique + les vignettes haute résolution de la vidéo suiveuse prises au même endroit
au même instant. Gregory reconnaît la personne sur les vignettes (silhouette, chaussures, gants) et donne son numéro.

Usage : python -m panorama.cards [durée_min_s] -> output/panorama/cards.json (images en base64)
"""
import base64
import collections
import json
import pickle
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T, label as Lb
from panorama.config import load_numbers
from panorama.identify import load_tracklets

MAX_DIST = 2.0          # m : la vignette doit être à moins de cette distance de la piste (image non recalée)
MIN_MARGIN = 1.5        # m : et la piste suivante au moins ce plus loin
REG_DIST, REG_MARGIN = 1.2, 1.0      # idem quand l'image suiveuse a été recalée (panorama.register)
MAX_CROPS = 3
CROP_H = 150


def attach_crops(tracklets, crops, shifts=None, offset=0.0):
    by_frame = collections.defaultdict(list)
    for k, t in enumerate(tracklets):
        for i, ti in enumerate(np.round(t.t * 10).astype(int)):
            by_frame[ti].append((k, t.X[i], t.Y[i]))
    per = collections.defaultdict(list)
    for c in crops:
        cand = by_frame.get(int(round(c["t"] * 10)))
        if not cand:
            continue
        sh = (shifts or {}).get(int(round((c["t"] - offset) * 2)))
        X, Y = (c["X"] + sh["dx"], c["Y"] + sh["dy"]) if sh else (c["X"], c["Y"])
        max_d, margin = (REG_DIST, REG_MARGIN) if sh else (MAX_DIST, MIN_MARGIN)
        d = np.array([np.hypot(x[1] - X, x[2] - Y) for x in cand])
        o = np.argsort(d)
        if d[o[0]] > max_d or (len(o) > 1 and d[o[1]] - d[o[0]] < margin):
            continue
        per[cand[o[0]][0]].append(dict(c, dist=float(d[o[0]]), registered=bool(sh)))
    return per


def encode(jpeg):
    im = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        return None
    h, w = im.shape[:2]
    if h > CROP_H:
        im = cv2.resize(im, (max(1, int(w * CROP_H / h)), CROP_H), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def encode_bgr(im):
    if im is None or im.size == 0:
        return None
    h, w = im.shape[:2]
    if h > CROP_H:
        im = cv2.resize(im, (max(1, int(w * CROP_H / h)), CROP_H), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def pick_spread(cs, n=MAX_CROPS):
    """Jusqu'à n vignettes étalées dans le temps, les plus grandes d'abord dans chaque tiers."""
    cs = sorted(cs, key=lambda c: c["t"])
    if len(cs) <= n:
        return cs
    edges = np.linspace(0, len(cs), n + 1).astype(int)
    return [max(cs[a:b], key=lambda c: c["h"]) for a, b in zip(edges[:-1], edges[1:]) if b > a]


def main(min_duration=8.0):
    tracklets = load_tracklets()
    horizon = max(t.t1 for t in tracklets)
    crops = [c for c in pickle.load(open(T.OUT / "crops.pkl", "rb")) if c["t"] <= horizon]
    S = pickle.load(open(T.OUT / "sync.pkl", "rb"))
    shifts = pickle.load(open(T.OUT / "register.pkl", "rb")) if (T.OUT / "register.pkl").exists() else None
    per = attach_crops(tracklets, crops, shifts, S["offset"])
    print(f"vignettes rattachées : {sum(len(v) for v in per.values())} sur {len(crops)} (dont sur image recalée : {sum(1 for v in per.values() for c in v if c['registered'])})")
    # suggestion : joueurs identifiés sur la vidéo suiveuse (votes)
    pts = [p for p in Lb.followcam_points() if p[0] <= horizon]
    votes, *_ = Lb.vote(tracklets, pts)
    names = {v["id"]: k for k, v in load_numbers().items()}
    cards = []
    for k, cs in per.items():
        t = tracklets[k]
        dur = t.t1 - t.t0
        if dur < min_duration or len(cs) < 2:
            continue
        chosen = pick_spread(cs)
        imgs = [encode(c["jpeg"]) for c in chosen]
        imgs = [(i, c) for i, c in zip(imgs, chosen) if i]
        if len(imgs) < 2:
            continue
        step = max(1, len(t.t) // 14)
        path = [[round(float(x / 105.0 + 0.5), 3), round(float(y / 68.0 + 0.5), 3)] for x, y in zip(t.X[::step], t.Y[::step])]
        sug = None
        if k in votes:
            (p, n), = votes[k].most_common(1)
            if n >= 3 and p in names:
                sug = dict(number=names[p], votes=n)
        cards.append(dict(id=f"{t.id[0]}-{t.id[1]}", t0=round(float(t.t0), 1), t1=round(float(t.t1), 1), dur=round(float(dur), 1),
                          images=[i for i, _ in imgs], imgTimes=[round(float(c["t"]), 1) for _, c in imgs], path=path, suggestion=sug))
    cards.sort(key=lambda c: -c["dur"])
    json.dump(cards, open(T.OUT / "cards.json", "w"))
    size = sum(len(i) for c in cards for i in c["images"]) / 1e6
    print(f"horizon {horizon:.0f} s : {len(cards)} cartes (durée totale {sum(c['dur'] for c in cards):.0f} s, images {size:.1f} Mo en base64) ; avec suggestion : {sum(1 for c in cards if c['suggestion'])}")
    print("durées : médiane %.0f s, max %.0f s ; cartes ≥20 s : %d, ≥40 s : %d" % (np.median([c["dur"] for c in cards]), max(c["dur"] for c in cards), sum(c["dur"] >= 20 for c in cards), sum(c["dur"] >= 40 for c in cards)))


if __name__ == "__main__":
    main(float(sys.argv[1]) if len(sys.argv) > 1 else 8.0)
