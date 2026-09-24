"""Fabrique les cartes de revue à partir du match entier : pour les pistes du panoramique les plus longues, des vignettes
haute résolution prises dans la vidéo suiveuse aux instants où la piste a été rattachée avec certitude.

Usage : python -m panorama.make_cards [nb_cartes_max]    -> output/panorama/cards.json
"""
import base64
import collections
import json
import pickle
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T, register as R, label as Lb
from panorama.config import FOLLOWCAM_TEAM, load_numbers
from panorama.crops2 import FrameCropper
from panorama.identify import load_tracklets
from panorama.cards import encode_bgr

MIN_DUR = 8.0
PER_TRACKLET = 3


def registered_pairs(tl, shifts, by_t, offset):
    by_frame = collections.defaultdict(list)
    for k, t in enumerate(tl):
        for i, ti in enumerate(np.round(t.t * 10).astype(int)):
            by_frame[ti].append((k, t.X[i], t.Y[i]))
    pairs = collections.defaultdict(list)
    for k2, sh in shifts.items():
        conf = sh["matched"] / sh["total"]
        for (key, team, X, Y, t) in by_t[k2]:
            if team != FOLLOWCAM_TEAM:
                continue
            cand = by_frame.get(int(round((t + offset) * 10)))
            if not cand:
                continue
            d = np.array([np.hypot(c[1] - (X + sh["dx"]), c[2] - (Y + sh["dy"])) for c in cand])
            o = np.argsort(d)
            if d[o[0]] > 1.2 or (len(o) > 1 and d[o[1]] - d[o[0]] < 1.0):
                continue
            pairs[cand[o[0]][0]].append(dict(t=t, key=key, conf=conf, dist=float(d[o[0]])))
    return pairs


def spread(ps, n=PER_TRACKLET):
    ps = sorted(ps, key=lambda p: p["t"])
    if len(ps) <= n:
        return ps
    edges = np.linspace(0, len(ps), n + 1).astype(int)
    return [max(ps[a:b], key=lambda p: p["conf"]) for a, b in zip(edges[:-1], edges[1:]) if b > a]


def main(max_cards=250):
    tl = load_tracklets()
    horizon = max(t.t1 for t in tl)
    by_t, offset = R.followcam_by_time()
    pano = R.panorama_frames(tl)
    shifts = R.register(by_t, offset, pano, horizon)
    shifts = {k: s for k, s in shifts.items() if s["matched"] >= max(3, 0.6 * s["total"]) and s["matched"] - s["second"] >= 1}
    pairs = registered_pairs(tl, shifts, by_t, offset)
    fc = pickle.load(open(T.OUT / "followcam.pkl", "rb"))
    samples = {(tr["key"], round(t, 2)): (xw, yl) for tr in fc["traces"] if tr["team"] == FOLLOWCAM_TEAM for (t, xw, yl) in tr["samples"]}
    order = sorted((k for k in pairs if tl[k].t1 - tl[k].t0 >= MIN_DUR), key=lambda k: -(tl[k].t1 - tl[k].t0))[:max_cards]
    print(f"horizon {horizon:.0f} s ; {len(shifts)} images recalées ; {len(order)} pistes candidates (≥{MIN_DUR:.0f} s avec au moins une vignette possible)", flush=True)
    pts = [p for p in Lb.followcam_points() if p[0] <= horizon]
    votes, *_ = Lb.vote(tl, pts)
    names = {v["id"]: k for k, v in load_numbers().items()}
    fcp = FrameCropper()
    cards, t0 = [], time.time()
    for n, k in enumerate(order):
        t = tl[k]
        imgs, times = [], []
        for p in spread(pairs[k]) + [q for q in sorted(pairs[k], key=lambda q: -q["conf"]) if q not in spread(pairs[k])][:2]:
            if len(imgs) >= PER_TRACKLET:
                break
            xw, yl = samples[(p["key"], round(p["t"], 2))]
            res = fcp.crop_for_sample(p["t"], xw, yl)
            if res is None:
                continue
            enc = encode_bgr(res[0])
            if enc:
                imgs.append(enc); times.append(round(float(p["t"] + offset), 1))
        if not imgs:
            continue
        step = max(1, len(t.t) // 14)
        path = [[round(float(x / 105.0 + 0.5), 3), round(float(y / 68.0 + 0.5), 3)] for x, y in zip(t.X[::step], t.Y[::step])]
        sug = None
        if k in votes:
            (pl, nv), = votes[k].most_common(1)
            if nv >= 3 and pl in names:
                sug = dict(number=names[pl], votes=nv)
        cards.append(dict(id=f"{t.id[0]}-{t.id[1]}", t0=round(float(t.t0), 1), t1=round(float(t.t1), 1), dur=round(float(t.t1 - t.t0), 1),
                          images=imgs, imgTimes=times, path=path, suggestion=sug))
        if (n + 1) % 10 == 0:
            print(f"  {n + 1}/{len(order)} pistes traitées, {len(cards)} cartes ({time.time() - t0:.0f} s)", flush=True)
            json.dump(cards, open(T.OUT / "cards.json", "w"))
    cards.sort(key=lambda c: -c["dur"])
    json.dump(cards, open(T.OUT / "cards.json", "w"))
    print(f"{len(cards)} cartes, durée totale {sum(c['dur'] for c in cards):.0f} s, {sum(len(c['images']) for c in cards)} vignettes, dont {sum(1 for c in cards if len(c['images']) >= 2)} cartes avec ≥2 vignettes ; suggestions : {sum(1 for c in cards if c['suggestion'])}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 250)
