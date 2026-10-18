"""Dump des fenetres certifiees (cid, numero, a, b -- temps NATIF pano.mov) pour la source Sept
(PMRC-FCSN, pano.mov+Veo.mov), sans toucher a resultat_panorama.json deja livre -- juste pour
connaitre les intervalles de temps reellement retenus, afin de les comparer a ceux de la 3e camera
(fisheye) sur une horloge commune et eviter un double comptage. DOIT tourner dans son propre
processus : panorama.reproject importe T.load_model() au niveau module, qui lit PANORAMA_OUT/
PANORAMA_TRACK_MODEL figes a l'import -- jamais dans le meme processus que la config fisheye.
"""
import json
import os
import sys

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)

os.environ["PANORAMA_VIDEO"] = "/Users/gregorycohin/Documents/football/PMRC FCSN pano.mov"
os.environ["PANORAMA_CROP"] = "0,352,2940,1373"
os.environ["PANORAMA_INNER_CROP"] = "0,1200"
os.environ["PANORAMA_BAND"] = "340,1200"
os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc"
os.environ["PANORAMA_CUTS"] = "2840"
os.environ["PANORAMA_TRACK_MODEL"] = "v2"
os.environ["PANORAMA_PITCH"] = "101.1,65.1"
os.environ["PANORAMA_HALF_CUT_S"] = "2840"
os.environ["PANORAMA_CHAIN_ISOLATION_M"] = "3.0"  # reglage reel de ce match (env_pmrc.sh), PAS 5.0
os.environ["MATCH_DURATION_S"] = "5877"
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import identify as I
from panorama import track as T
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts
from panorama.config import chain_isolation_m, load_numbers
from panorama.finalize import load_labels
from panorama.identify import load_tracklets
from panorama.certify_run import inherit_via_chains
from panorama.reproject import reproject_tracklets

RADIUS = 4.0


def main(out_path):
    tls = reproject_tracklets(load_tracklets())
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = load_labels(f"{VP}/output/panorama_pmrc/review_db_export/pistes")
    cards = {c["id"]: c for c in json.load(open(f"{VP}/output/panorama_pmrc/cards.json"))}
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
    print(f"sept : cartes retenues {len({c for c,_,_ in kept})} ; fenêtres {len(kept)} ; écartées pour contradiction {len(bad)}")
    pid_by_num = {num: numbers[num]["id"] for num in numbers}
    out = [{"cid": cid, "num": num, "pid": pid_by_num[num], "a": a, "b": b} for cid, num, (a, b) in kept]
    json.dump(out, open(out_path, "w"))
    print(f"-> {out_path} ({len(out)} fenêtres)")


if __name__ == "__main__":
    main(sys.argv[1])
