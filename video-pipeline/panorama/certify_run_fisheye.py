"""Equivalent de panorama.certify_run.main() pour le fichier brut (2 objectifs fisheye) --
memes briques (Neighbours, card_windows, whole_track_windows, window_conflicts,
inherit_via_chains, player_metrics), mais SANS passer par panorama.reproject (pensee pour
convertir un ANCIEN modele vers v2 ; nos pistes sont deja en vrais metres, directement issues du
calage fisheye -- confirme par tout ce qui a deja marche sans reprojection : sync, register,
cross_identify)."""
import collections
import json
import pickle
import sys
from pathlib import Path

import numpy as np

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)
import os
os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc_2lens"
os.environ["PANORAMA_CHAIN_ISOLATION_M"] = "3.0"  # valide par eval_linker + accord de Gregory 2026-10-18 (0.67%/0.67%, 70% recollement vs 0.44%/0.22%, 63% a 5.0)
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import identify as I
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts, slice_meas
from panorama.config import chain_isolation_m, load_numbers
from panorama.player_metrics import player_metrics


def inherit_via_chains(tls, todo, isolation_m):
    """Copie de panorama.certify_run.inherit_via_chains -- importer ce module declenche
    panorama.reproject a l'import (OLD = T.load_model(), pense pour un ancien calage, plante sans
    calibration_finale.json). Logique identique, verifiee contre la source au moment de l'ecriture."""
    I.ISOLATION_M = isolation_m
    chains, refused = I.build_chains(tls)
    inherited, conflicts = {}, 0
    for ch in chains:
        cids = [f"{tl.id[0]}-{tl.id[1]}" for tl in ch]
        direct_here = {cid: todo[cid] for cid in cids if cid in todo}
        if not direct_here:
            continue
        nums = set(direct_here.values())
        if len(nums) > 1:
            conflicts += 1
            continue
        num = next(iter(nums))
        for cid in cids:
            if cid not in todo and cid not in inherited:
                inherited[cid] = num
    print(f"chaînes de pistes (isolement {isolation_m} m) : {len(chains)} ; refus d'ambiguïté {refused} ; "
          f"pistes héritant d'un numéro {len(inherited)} ; chaînes en conflit (ignorées) {conflicts}")
    return inherited

MATCH_DIR = f"{VP}/output/panorama_pmrc_2lens/match"
RADIUS = 4.0


def load_tracklets_from(match_dir, min_hits=8):
    out = []
    for p in sorted(Path(match_dir).glob("trk2_*.pkl")):
        for rec in pickle.load(open(p, "rb"))["tracks"]:
            if len(rec["meas"]) >= min_hits:
                out.append(I.Tracklet(rec))
    return out


def main(labels_dir, cards_path, out_path):
    tls = load_tracklets_from(MATCH_DIR)
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = {}
    for p in Path(labels_dir).glob("*.json"):
        labels[p.stem] = json.load(open(p))
    cards = {c["id"]: c for c in json.load(open(cards_path))}
    numbers = load_numbers(required=True)
    todo = {cid: str(d["assignedNumber"]) for cid, d in labels.items() if d.get("assignedNumber") and str(d["assignedNumber"]) in numbers}
    isolation_m = chain_isolation_m()
    inherited = inherit_via_chains(tls, todo, isolation_m) if isolation_m is not None else {}
    all_todo = {**todo, **inherited}
    nb = Neighbours(tls)
    items, tls_by_key = [], {}
    for cid, num in all_todo.items():
        tl = tls[idx[cid]]
        tls_by_key[cid] = tl
        cache = nb.nearest(idx[cid], tl)
        if cid in todo:
            wins = card_windows(tl, cache, cards[cid]["imgTimes"], RADIUS, None)
        else:
            wins = whole_track_windows(tl, cache, RADIUS)
        for w in wins:
            items.append((cid, num, tuple(w)))
    bad, notes = window_conflicts(items, tls_by_key)
    kept = [it for i, it in enumerate(items) if i not in bad]
    per = collections.defaultdict(list)
    for cid, num, (a, b) in kept:
        per[num].append((cid, a, b))
    players, lines = {}, []
    for num in sorted(per, key=int):
        pid, name = numbers[num]["id"], numbers[num]["name"].strip()
        meas, contacts = [], []
        for cid, a, b in per[num]:
            m, c = slice_meas(tls_by_key[cid], a, b)
            meas.append(m); contacts += c
        secs = sum(b - a for _, a, b in per[num])
        # 5877s = duree de pano.mov, deja la reference etablie pour CE match (env_pmrc.sh) -- jamais
        # la duree brute du fichier transcode (inclut avant-match + mi-temps, piege deja trouve et
        # corrige dans ce meme chantier, cf. analyse-avancee-pmrc.json)
        m = player_metrics(meas, contacts, 5877.0)
        players[pid] = m
        lines.append(f"#{num:>2} {name:20s} {len(per[num]):3d} fenêtres ({secs:5.0f} s) ; visible {100*m['visibleCoverage']:.2f}% ; {m['distanceCovered']} m ; {m['sprints']} sprints ; pointe {m['topSpeed']} km/h ; HI {m['highIntensityDistance']} m")
    out = {"source": "Pipeline vidéo (fichier brut, 2 objectifs fisheye, identités relues sur vignettes, fenêtres isolées)",
           "importedAt": None, "players": players,
           "team": {"avgBlockHeight": None, "avgWidth": None, "avgDepth": None, "ppda": None}, "passNetwork": [], "preciseEvents": []}
    json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(f"chaînage (isolement {isolation_m} m) : pistes héritant d'un numéro {len(inherited)}")
    print(f"cartes retenues : {len({c for c,_,_ in kept})} ; fenêtres {len(kept)} ; écartées pour contradiction : {len(bad)}")
    for n in notes:
        print("  contradiction :", n)
    print("\n".join(lines))
    print("->", out_path)
    # pour la suite : pistes AVEC chaine mais SANS aucun numero (ni direct ni herite) -- candidats a une 2e revue
    chained_keys = set()
    I.ISOLATION_M = isolation_m
    chains, _ = I.build_chains(tls)
    uncovered_chains = []
    for ch in chains:
        cids = [f"{t.id[0]}-{t.id[1]}" for t in ch]
        if not any(c in all_todo for c in cids):
            dur = sum(t.t1 - t.t0 for t in ch)
            uncovered_chains.append((dur, cids, ch[0].t0))
    uncovered_chains.sort(reverse=True)
    print(f"\nchaînes sans AUCUN numéro (ni direct ni hérité) : {len(uncovered_chains)}")
    for dur, cids, t0 in uncovered_chains[:20]:
        print(f"  {dur:6.0f}s  {len(cids)} piste(s)  debut={t0:.0f}s  ex: {cids[0]}")
    json.dump([{"dur": d, "cids": c, "t0": t0} for d, c, t0 in uncovered_chains], open(out_path.replace(".json", "_chaines_non_couvertes.json"), "w"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
