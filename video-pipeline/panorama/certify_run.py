"""Chiffres par joueur à partir des seules fenêtres d'identité certifiées.

python -m panorama.certify_run <dossier_export_db> [lecture_verifiee.json]
- sans 2e argument : toutes les cartes attribuées par Gregory (un seul lecteur) ;
- avec : seulement les vignettes dont le numéro a aussi été relu et confirmé (deux lecteurs).
"""
import collections
import json
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import identify as I
from panorama import track as T
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts, slice_meas
from panorama.config import chain_isolation_m, load_numbers
from panorama.finalize import load_labels, REFERENCE_S
from panorama.identify import load_tracklets
from panorama.player_metrics import player_metrics
from panorama.reproject import reproject_tracklets

RADIUS = 4.0
CARDS = T.OUT / "cards.json"
CACHE = T.OUT / "dmin_cartes_v2.pkl"          # distances aux voisins, en vrais mètres (calage v2)


def inherit_via_chains(tls, todo, isolation_m):
    """Pistes sans carte propre qui héritent du numéro d'une carte déjà étiquetée, via un raccord de chaîne (panorama.identify)
    jugé sûr (aucune autre piste compatible à moins de isolation_m pendant le trou). Une chaîne où deux cartes étiquetées
    donnent des numéros différents n'hérite rien (conflit entre les étiquettes de Gregory elles-mêmes, pas à trancher ici)."""
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


def main(folder, verified_path=None, out_name=None):
    tls = reproject_tracklets(load_tracklets())          # positions en vrais mètres (calage réglementaire v2)
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = load_labels(folder)
    cards = {c["id"]: c for c in json.load(open(CARDS))}
    numbers = load_numbers(required=True)
    verified = json.load(open(verified_path)) if verified_path else None
    todo = {cid: str(d["assignedNumber"]) for cid, d in labels.items() if d.get("assignedNumber") and str(d["assignedNumber"]) in numbers}
    if verified is not None:
        todo = {cid: n for cid, n in todo.items() if cid in verified and verified[cid]["number"] == n}
    isolation_m = chain_isolation_m()
    inherited = inherit_via_chains(tls, todo, isolation_m) if isolation_m is not None else {}
    all_todo = {**todo, **inherited}
    cache = pickle.load(open(CACHE, "rb")) if CACHE.exists() else {}
    nb = None
    for cid in all_todo:
        if cid not in cache:
            nb = nb or Neighbours(tls)
            cache[cid] = nb.nearest(idx[cid], tls[idx[cid]])
    pickle.dump(cache, open(CACHE, "wb"))

    items, tls_by_key = [], {}
    for cid, num in all_todo.items():
        tl = tls[idx[cid]]
        tls_by_key[cid] = tl
        if cid in todo:
            only = set(verified[cid]["crops"]) if verified is not None else None
            wins = card_windows(tl, cache[cid], cards[cid]["imgTimes"], RADIUS, only)
        else:
            wins = whole_track_windows(tl, cache[cid], RADIUS)
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
        m = player_metrics(meas, contacts, REFERENCE_S)
        players[pid] = m
        lines.append(f"#{num:>2} {name:20s} {len(per[num]):3d} fenêtres ({secs:5.0f} s) ; visible {100 * m['visibleCoverage']:.2f} % ; {m['distanceCovered']} m ; {m['sprints']} sprints ; pointe {m['topSpeed']} km/h ; HI {m['highIntensityDistance']} m")
    out = {"source": "Pipeline vidéo (panoramique Veo, identités relues sur vignettes, fenêtres isolées)", "importedAt": None, "players": players,
           "team": {"avgBlockHeight": None, "avgWidth": None, "avgDepth": None, "ppda": None}, "passNetwork": [], "preciseEvents": []}
    dest = T.OUT / (out_name or "resultat_panorama.json")
    json.dump(out, open(dest, "w"), ensure_ascii=False, indent=1)
    print(f"cartes retenues : {len({c for c, _, _ in kept})} ; fenêtres {len(kept)} ; écartées pour contradiction : {len(bad)}")
    for n in notes:
        print("  contradiction :", n)
    print("\n".join(lines))
    print("->", dest)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None, sys.argv[3] if len(sys.argv) > 3 else None)
