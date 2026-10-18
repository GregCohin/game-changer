"""Cartes round 4 : seuils de correspondance encore desserres (shift_thr=0.3, dist=2.5m, marge=0.4m
au lieu de 0.4/2.0/0.6 du round 3) -- meme principe : sans risque pour la fiabilite puisque c'est
toujours Gregory qui juge l'image a l'oeil ensuite (le controle de contradiction en aval reste
inchange)."""
import collections
import json
import sys
import time
from pathlib import Path

import numpy as np

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)
import os
os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc_2lens"
os.environ["FOLLOWCAM_TEAM"] = "B"
os.environ["FOLLOWCAM_VIDEO"] = "/Users/gregorycohin/Documents/Football/PMRC - FCSN/PMRC FCSN Veo.mov"
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import track as T, register as R
from panorama.config import FOLLOWCAM_TEAM
from panorama import identify as I
from panorama.make_cards import spread
from panorama.crops2 import FrameCropper
from panorama.cards import encode_bgr
import pickle

PER_TRACKLET = 3
SHIFT_THR, SHIFT_MARGIN, MAX_DIST, MARGIN = 0.3, 0, 2.5, 0.4


def load_tracklets_from(match_dir, min_hits=8):
    out = []
    for p in sorted(Path(match_dir).glob("trk2_*.pkl")):
        for rec in pickle.load(open(p, "rb"))["tracks"]:
            if len(rec["meas"]) >= min_hits:
                out.append(I.Tracklet(rec))
    return out


def registered_pairs_loose(tl, shifts, by_t, offset, team):
    by_frame = collections.defaultdict(list)
    for k, t in enumerate(tl):
        for i, ti in enumerate(np.round(t.t * 10).astype(int)):
            by_frame[ti].append((k, t.X[i], t.Y[i]))
    pairs = collections.defaultdict(list)
    for k2, sh in shifts.items():
        conf = sh["matched"] / sh["total"]
        for (key, tm, X, Y, t) in by_t[k2]:
            if tm != team:
                continue
            cand = by_frame.get(int(round((t + offset) * 10)))
            if not cand:
                continue
            d = np.array([np.hypot(c[1] - (X + sh["dx"]), c[2] - (Y + sh["dy"])) for c in cand])
            o = np.argsort(d)
            if d[o[0]] > MAX_DIST or (len(o) > 1 and d[o[1]] - d[o[0]] < MARGIN):
                continue
            pairs[cand[o[0]][0]].append(dict(t=t, key=key, conf=conf, dist=float(d[o[0]])))
    return pairs


def main():
    chains = json.load(open(f"{VP}/output/panorama_pmrc_2lens/resultat_panorama_brut_chaines_non_couvertes.json"))
    uncovered_cids = {cid for c in chains for cid in c["cids"]}
    tl = load_tracklets_from(f"{VP}/output/panorama_pmrc_2lens/match")
    by_cid = {f"{t.id[0]}-{t.id[1]}": (i, t) for i, t in enumerate(tl)}

    horizon = max(t.t1 for t in tl)
    by_t, offset = R.followcam_by_time()
    pano = R.panorama_frames(tl)
    shifts_raw = R.register(by_t, offset, pano, horizon)
    shifts = {k: s for k, s in shifts_raw.items() if s["matched"] >= max(3, SHIFT_THR * s["total"]) and s["matched"] - s["second"] >= SHIFT_MARGIN}
    pairs = registered_pairs_loose(tl, shifts, by_t, offset, FOLLOWCAM_TEAM)

    candidates = sorted(by_cid[cid][0] for cid in uncovered_cids if cid in by_cid and by_cid[cid][0] in pairs)
    print(f"{len(candidates)} pistes non couvertes avec correspondance (seuils round 4)")

    fc = pickle.load(open(f"{VP}/output/panorama_pmrc_2lens/followcam.pkl", "rb"))
    samples = {(tr["key"], round(t, 2)): (xw, yl) for tr in fc["traces"] if tr["team"] == FOLLOWCAM_TEAM for (t, xw, yl) in tr["samples"]}

    fcp = FrameCropper()
    existing = {c["id"] for c in json.load(open(f"{VP}/output/panorama_pmrc_2lens/cards.json"))}
    cards, t0 = [], time.time()
    tried = 0
    for n, k in enumerate(candidates):
        t = tl[k]
        cid = f"{t.id[0]}-{t.id[1]}"
        if cid in existing:
            continue
        tried += 1
        imgs, times = [], []
        for p in spread(pairs[k]) + [q for q in sorted(pairs[k], key=lambda q: -q["conf"]) if q not in spread(pairs[k])][:2]:
            if len(imgs) >= PER_TRACKLET:
                break
            xw, yl = samples.get((p["key"], round(p["t"], 2)), (None, None))
            if xw is None:
                continue
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
        cards.append(dict(id=cid, t0=round(float(t.t0), 1), t1=round(float(t.t1), 1), dur=round(float(t.t1 - t.t0), 1),
                          images=imgs, imgTimes=times, path=path, suggestion=None))
        if tried % 50 == 0:
            print(f"  {tried} essayees ({n + 1}/{len(candidates)} parcourues), {len(cards)} cartes ({time.time() - t0:.0f}s)", flush=True)
    print(f"{len(cards)} nouvelles cartes round 4 (sur {tried} pistes essayees, {len(candidates)} candidates)")

    all_cards = json.load(open(f"{VP}/output/panorama_pmrc_2lens/cards.json")) + cards
    all_cards.sort(key=lambda c: -c["dur"])
    json.dump(all_cards, open(f"{VP}/output/panorama_pmrc_2lens/cards.json", "w"))
    print(f"total cards.json : {len(all_cards)}")


if __name__ == "__main__":
    main()
