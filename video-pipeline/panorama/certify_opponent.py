"""Chiffres par numéro adverse à partir des seules fenêtres d'identité certifiées (symétrique de certify_run.py).

Diffère de certify_run.py sur un point : il n'existe pas de fiche joueur adverse dans le site (voir config.py), donc
la sortie est indexée par numéro de maillot brut, avec un identifiant synthétique ("pmrc-7"), pas par identifiant réel
du site — ce fichier n'est pas fait pour être importé dans Studio, seulement lu.

python -m panorama.certify_opponent <dossier_export_db> <fichier_cartes.json> [sortie.json]
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
from panorama.certify_run import inherit_via_chains
from panorama.config import chain_isolation_m
from panorama.finalize import load_labels, REFERENCE_S
from panorama.identify import load_tracklets
from panorama.player_metrics import player_metrics
from panorama.reproject import reproject_tracklets

RADIUS = 4.0


def main(folder, cards_path, out_name=None):
    tls = reproject_tracklets(load_tracklets())
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = load_labels(folder)
    cards = {c["id"]: c for c in json.load(open(cards_path))}
    todo = {cid: str(d["assignedNumber"]) for cid, d in labels.items() if d.get("assignedNumber")}
    numbers_seen = sorted(set(todo.values()), key=int)
    numbers = {n: {"id": f"pmrc-{n}", "name": f"PMRC #{n}"} for n in numbers_seen}
    print(f"cartes étiquetées : {len(todo)} ; numéros distincts : {numbers_seen}")

    isolation_m = chain_isolation_m()
    inherited = inherit_via_chains(tls, todo, isolation_m) if isolation_m is not None else {}
    all_todo = {**todo, **inherited}
    cache = {}
    nb = None
    for cid in all_todo:
        if cid not in cache:
            nb = nb or Neighbours(tls)
            cache[cid] = nb.nearest(idx[cid], tls[idx[cid]])

    items, tls_by_key = [], {}
    for cid, num in all_todo.items():
        tl = tls[idx[cid]]
        tls_by_key[cid] = tl
        if cid in todo:
            wins = card_windows(tl, cache[cid], cards[cid]["imgTimes"], RADIUS, None)
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
        pid, name = numbers[num]["id"], numbers[num]["name"]
        meas, contacts = [], []
        for cid, a, b in per[num]:
            m, c = slice_meas(tls_by_key[cid], a, b)
            meas.append(m); contacts += c
        secs = sum(b - a for _, a, b in per[num])
        m = player_metrics(meas, contacts, REFERENCE_S)
        players[pid] = {**m, "number": num}
        lines.append(f"PMRC #{num:>2} {len(per[num]):3d} fenêtres ({secs:5.0f} s) ; visible {100 * m['visibleCoverage']:.2f} % ; {m['distanceCovered']} m ; {m['sprints']} sprints ; pointe {m['topSpeed']} km/h ; HI {m['highIntensityDistance']} m")
    out = {"source": "Pipeline vidéo (panoramique Veo, numéros adverses relus sur vignettes, fenêtres isolées)", "note": "Pas de roster PMRC connu : identifiants synthétiques par numéro, non importable dans Studio.",
           "players": players}
    dest = T.OUT / (out_name or "resultat_panorama_pmrc.json")
    json.dump(out, open(dest, "w"), ensure_ascii=False, indent=1)
    print(f"cartes retenues : {len({c for c, _, _ in kept})} ; fenêtres {len(kept)} ; écartées pour contradiction : {len(bad)}")
    for n in notes:
        print("  contradiction :", n)
    print("\n".join(lines))
    print("->", dest)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
