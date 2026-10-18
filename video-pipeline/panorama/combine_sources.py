"""Combine deux fichiers de métriques individuelles déjà certifiées pour un même match filmé par
deux caméras différentes, SANS double compter le temps que les deux auraient isolé/certifié au
même instant réel.

Les deux caméras filment le même match en même temps : si un joueur est isolé (pas de voisin
proche) à un instant réel donné, cet instant peut être certifié par les DEUX pipelines indépendamment
-- une simple addition des métriques compterait ce morceau de temps deux fois. On résout ça en
ramenant les fenêtres certifiées de chaque source sur une horloge commune (celle de la vidéo
suiveuse, via les offsets déjà mesurés par chaque `sync.pkl`), puis en RETIRANT de la source
secondaire (ici le fichier brut 2 objectifs fisheye) toute portion de temps déjà certifiée par la
source primaire (ici pano.mov+Veo.mov, le pipeline le plus mûr -- plusieurs rounds de relecture,
bouton Adversaire déjà passé) avant de recalculer ses métriques sur les fenêtres ainsi découpées.
Le résultat n'est alors plus un majorant : c'est une vraie addition, sans recouvrement.

Suppose que les fenêtres d'UNE MÊME source pour UN MÊME joueur ne se recouvrent pas entre elles
(chaque piste/chaîne est un segment de temps disjoint par construction du suivi) -- seul le
recouvrement ENTRE les deux sources est traité ici.

Usage : lancer deux fois dump_windows_sept.py (process séparé, voir ce fichier) puis ce script.
"""
import json
import os
import sys

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)

os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc_2lens"
os.environ["PANORAMA_CHAIN_ISOLATION_M"] = "3.0"  # valide par eval_linker + accord de Gregory 2026-10-18
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import identify as I
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts, slice_meas, merge
from panorama.config import chain_isolation_m, load_numbers
from panorama.player_metrics import player_metrics
from panorama.certify_run_fisheye import load_tracklets_from, inherit_via_chains, MATCH_DIR

RADIUS = 4.0
REFERENCE_S = 5877.0
OFFSET_SEPT = -6.45    # sync.pkl de panorama_pmrc : t_followcam = t_pano_sept + 6.45  =>  t_common = t_sept - OFFSET_SEPT
OFFSET_FISH = 653.65   # sync.pkl de panorama_pmrc_2lens : t_followcam = t_fisheye - 653.65  =>  t_common = t_fish - OFFSET_FISH


def to_common_sept(a, b):
    return a - OFFSET_SEPT, b - OFFSET_SEPT


def to_common_fish(a, b):
    return a - OFFSET_FISH, b - OFFSET_FISH


def subtract(window, cuts):
    """[a,b] moins l'union des intervalles de `cuts` (déjà triés/fusionnés) -- liste de sous-intervalles restants."""
    a, b = window
    pieces = [(a, b)]
    for ca, cb in cuts:
        nxt = []
        for pa, pb in pieces:
            if cb <= pa or ca >= pb:
                nxt.append((pa, pb))
                continue
            if ca > pa:
                nxt.append((pa, ca))
            if cb < pb:
                nxt.append((cb, pb))
        pieces = nxt
    return [(a, b) for a, b in pieces if b - a > 0.05]


def kept_fisheye():
    tls = load_tracklets_from(MATCH_DIR)
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = {}
    for p in __import__("pathlib").Path(f"{VP}/output/panorama_pmrc_2lens/review_db_export/pistes/pistes").glob("*.json"):
        labels[p.stem] = json.load(open(p))
    cards = {c["id"]: c for c in json.load(open(f"{VP}/output/panorama_pmrc_2lens/cards.json"))}
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
    print(f"fisheye : cartes retenues {len({c for c,_,_ in kept})} ; fenêtres {len(kept)} ; écartées pour contradiction {len(bad)}")
    return kept, tls_by_key, numbers


def main(sept_windows_path, sept_result_path, out_path):
    sept_windows = json.load(open(sept_windows_path))
    kept_fish, tls_fish_by_key, numbers = kept_fisheye()

    # fenêtres Sept, par joueur, horloge commune -- jamais modifiées (source primaire)
    sept_common_by_pid = {}
    for w in sept_windows:
        sept_common_by_pid.setdefault(w["pid"], []).append(to_common_sept(w["a"], w["b"]))
    for pid in sept_common_by_pid:
        sept_common_by_pid[pid] = merge(sept_common_by_pid[pid])

    pid_by_num = {num: numbers[num]["id"] for num in numbers}
    trimmed_meas_by_pid, trimmed_contacts_by_pid = {}, {}
    overlap_s_by_pid = {}
    for cid, num, (a, b) in kept_fish:
        pid = pid_by_num[num]
        ca, cb = to_common_fish(a, b)
        cuts = sept_common_by_pid.get(pid, [])
        pieces_common = subtract((ca, cb), cuts)
        overlap_s_by_pid[pid] = overlap_s_by_pid.get(pid, 0.0) + (cb - ca) - sum(pb - pa for pa, pb in pieces_common)
        tl = tls_fish_by_key[cid]
        for pa, pb in pieces_common:
            na, nb = pa + OFFSET_FISH, pb + OFFSET_FISH   # retour en temps natif fisheye
            m, c = slice_meas(tl, na, nb)
            trimmed_meas_by_pid.setdefault(pid, []).append(m)
            trimmed_contacts_by_pid.setdefault(pid, []).extend(c)

    sept_result = json.load(open(sept_result_path))
    players = dict(sept_result["players"])  # copie : la part Sept n'est jamais modifiée
    print()
    for pid in sorted(set(trimmed_meas_by_pid) | set(overlap_s_by_pid), key=lambda p: -overlap_s_by_pid.get(p, 0)):
        ov = overlap_s_by_pid.get(pid, 0.0)
        if ov > 0.05:
            print(f"  recouvrement retiré pour {pid[:8]}… : {ov:.1f} s")
    total_overlap = sum(overlap_s_by_pid.values())
    print(f"recouvrement total retiré (toutes pistes) : {total_overlap:.1f} s sur {REFERENCE_S:.0f} s de match")

    for pid, meas in trimmed_meas_by_pid.items():
        fm = player_metrics(meas, trimmed_contacts_by_pid.get(pid, []), REFERENCE_S)
        sm = players.get(pid)
        if sm:
            heat = sm["heatmapPoints"] + fm["heatmapPoints"]
            step = max(1, len(heat) // 300)
            players[pid] = {
                "distanceCovered": sm["distanceCovered"] + fm["distanceCovered"],
                "sprints": sm["sprints"] + fm["sprints"],
                "topSpeed": round(max(sm["topSpeed"], fm["topSpeed"]), 1),
                "highIntensityDistance": sm["highIntensityDistance"] + fm["highIntensityDistance"],
                "accelerations": sm["accelerations"] + fm["accelerations"],
                "decelerations": sm["decelerations"] + fm["decelerations"],
                "heatmapPoints": heat[::step],
                "visibleCoverage": round(sm["visibleCoverage"] + fm["visibleCoverage"], 4),
            }
        else:
            players[pid] = fm

    out = {
        "source": f"{sept_result['source']} + Pipeline vidéo (fichier brut, 2 objectifs fisheye, identités relues sur vignettes, "
                   f"fenêtres isolées, recouvrement temporel avec la source ci-dessus retiré avant addition)",
        "importedAt": None, "players": players,
        "team": sept_result.get("team") or {"avgBlockHeight": None, "avgWidth": None, "avgDepth": None, "ppda": None},
        "passNetwork": sept_result.get("passNetwork") or [], "preciseEvents": sept_result.get("preciseEvents") or [],
    }
    json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
    print("->", out_path)

    names = {v["id"]: k for k, v in numbers.items()}  # pid -> numéro, juste pour trier l'affichage
    for pid, m in sorted(players.items(), key=lambda kv: -kv[1]["visibleCoverage"]):
        num = names.get(pid, "?")
        print(f"#{num:>2} {pid[:8]}…  {100*m['visibleCoverage']:.2f}%  {m['distanceCovered']} m  {m['sprints']} sprints  pointe {m['topSpeed']} km/h")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
