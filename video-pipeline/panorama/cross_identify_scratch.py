"""Identifie des pistes du fichier brut (2 objectifs) PAR RECOUPEMENT avec les pistes DEJA
certifiees de pano.mov (meme joueur, meme instant, meme position -- apres decalage temporel
sync_cross_panorama.pkl) -- aucune nouvelle revue de Gregory necessaire pour celles-ci.

Reutilise telles quelles les fenetres CERTIFIEES de pano.mov (celles qui ont survecu a
certify_run.window_conflicts -- le meme controle de contradiction que d'habitude), pas les pistes
entieres : si pano.mov a deja un doute sur une fenetre, elle n'est pas utilisee comme verite ici.
"""
import collections
import pickle
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)
import os
os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc"
os.environ["PANORAMA_TRACK_MODEL"] = "v2"
os.environ["PANORAMA_PITCH"] = "101.1,65.1"
os.environ["PANORAMA_CHAIN_ISOLATION_M"] = "3.0"  # valeur reellement utilisee pour la certification livree de pano.mov (env_pmrc.sh, accord de Gregory 2026-10-02) -- reproduire EXACTEMENT ce qui est deja en production, pas une variante
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import identify as I
from panorama import track as T
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts, slice_meas
from panorama.config import chain_isolation_m, load_numbers
from panorama.certify_run import inherit_via_chains
import json


def load_tracklets_from(match_dir, min_hits=8):
    """Comme panorama.identify.load_tracklets, mais sur un dossier explicite -- T.OUT/I.MATCH sont
    figes a l'import du module (valeur de PANORAMA_OUT a ce moment-la), donc inutilisables pour
    charger DEUX jeux de pistes differents dans le meme script."""
    out = []
    for p in sorted(Path(match_dir).glob("trk2_*.pkl")):
        for rec in pickle.load(open(p, "rb"))["tracks"]:
            if len(rec["meas"]) >= min_hits:
                out.append(I.Tracklet(rec))
    return out

RADIUS = 4.0
MATCH_RADIUS_M = 2.5     # tolerance de correspondance position fichier_brut <-> pano.mov (deux calages independants)
MATCH_MARGIN_M = 1.0

SYNC = pickle.load(open("/private/tmp/claude-501/-Users-gregorycohin-code-game-changer/5083b96c-5ee7-42e5-bb69-0d19504d4784/scratchpad/sync_cross_panorama.pkl", "rb"))
OFFSET = SYNC["offset"]  # temps pano.mov = temps fichier_brut + OFFSET
print("decalage utilise :", OFFSET, "s,", SYNC["z"], "sigma")


def pano_kept_windows():
    """Reproduit la logique de certify_run.main() pour PANO.MOV, mais retourne les fenetres
    CERTIFIEES (cid, num, t0, t1, tracklet) au lieu de les agreger en metriques."""
    tls = load_tracklets_from(f"{VP}/output/panorama_pmrc/match")
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = {}
    for p in Path(f"{VP}/output/panorama_pmrc/review_db_export/pistes").glob("*.json"):
        d = json.load(open(p))
        labels[p.stem] = d
    cards = {c["id"]: c for c in json.load(open(f"{VP}/output/panorama_pmrc/cards.json"))}
    numbers = load_numbers(required=True)
    todo = {cid: str(d["assignedNumber"]) for cid, d in labels.items() if d.get("assignedNumber") and str(d["assignedNumber"]) in numbers}
    isolation_m = chain_isolation_m()
    inherited = inherit_via_chains(tls, todo, isolation_m) if isolation_m is not None else {}
    all_todo = {**todo, **inherited}
    nb = Neighbours(tls)
    items = []
    for cid, num in all_todo.items():
        tl = tls[idx[cid]]
        if cid in todo:
            cache = nb.nearest(idx[cid], tl)
            wins = card_windows(tl, cache, cards[cid]["imgTimes"], RADIUS, None)
        else:
            cache = nb.nearest(idx[cid], tl)
            wins = whole_track_windows(tl, cache, RADIUS)
        for w in wins:
            items.append((cid, num, tuple(w)))
    bad, notes = window_conflicts(items, {f"{t.id[0]}-{t.id[1]}": t for t in tls})
    kept = [it for i, it in enumerate(items) if i not in bad]
    print(f"pano.mov : {len(kept)} fenetres certifiees (sur {len(items)}), {len(set(c for c,_,_ in kept))} pistes")
    out = []
    for cid, num, (a, b) in kept:
        tl = tls[idx[cid]]
        mask = (tl.t >= a) & (tl.t <= b)
        out.append((num, tl.t[mask], tl.X[mask], tl.Y[mask]))
    return out, numbers


def main():
    pano_windows, numbers = pano_kept_windows()
    new_tls = load_tracklets_from(f"{VP}/output/panorama_pmrc_2lens/match")
    print(f"fichier brut : {len(new_tls)} pistes chargees")

    by_frame = collections.defaultdict(list)
    for k, t in enumerate(new_tls):
        for i, ti in enumerate(np.round(t.t * 10).astype(int)):
            by_frame[ti].append((k, t.X[i], t.Y[i]))

    votes = collections.defaultdict(collections.Counter)
    used = missing = ambig = 0
    for num, ts, Xs, Ys in pano_windows:
        t_new = ts - OFFSET
        for t, X, Y in zip(t_new, Xs, Ys):
            cand = by_frame.get(int(round(t * 10)))
            if not cand:
                missing += 1
                continue
            d = np.array([np.hypot(c[1] - X, c[2] - Y) for c in cand])
            o = np.argsort(d)
            if d[o[0]] > MATCH_RADIUS_M:
                missing += 1
                continue
            if len(o) > 1 and d[o[1]] - d[o[0]] < MATCH_MARGIN_M:
                ambig += 1
                continue
            votes[cand[o[0]][0]][num] += 1
            used += 1
    print(f"echantillons : utilises {used}, ambigus {ambig}, sans piste proche {missing}")

    names = {v["id"]: k for k, v in numbers.items()}
    strong = {}
    for k, c in votes.items():
        (num, n), rest = c.most_common(1)[0], c.most_common()[1:]
        if n >= 5 and (not rest or n >= 3 * rest[0][1]):
            strong[k] = num
    print(f"pistes du fichier brut avec vote net (>=5 votes, >=3x le suivant) : {len(strong)} sur {len(votes)} votees")
    per_player = collections.Counter(strong.values())
    for num, n in sorted(per_player.items(), key=lambda kv: -kv[1]):
        pid = names.get(num)
        dur = sum(new_tls[k].t1 - new_tls[k].t0 for k, v in strong.items() if v == num)
        print(f"  #{num:>2}  {n:3d} pistes, {dur:6.0f} s")

    out = {f"{new_tls[k].id[0]}-{new_tls[k].id[1]}": num for k, num in strong.items()}
    json.dump(out, open("/private/tmp/claude-501/-Users-gregorycohin-code-game-changer/5083b96c-5ee7-42e5-bb69-0d19504d4784/scratchpad/cross_identified.json", "w"))
    print("->", "cross_identified.json")


if __name__ == "__main__":
    main()
