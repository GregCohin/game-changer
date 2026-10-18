"""Valide (ou pas) la ré-identification de la vidéo suiveuse (tracking.cluster_tracks_globally,
appariement par embedding d'apparence OSNet + couleur cheveux/peau/chaussures) contre des paires de
JOUEURS RÉELS DÉJÀ CONNUS COMME DIFFÉRENTS -- établi par un signal complètement INDÉPENDANT (le
recoupement position+temps avec les pistes fisheye déjà certifiées par Gregory), pas par une coupure
synthétique comme eval_linker/eval_radius : ici on a une vraie vérité de terrain disponible, autant
s'en servir directement plutôt que d'en fabriquer une approximation.

Principe : deux pistes de la vidéo suiveuse rattachées (par position+temps) à deux cartes fisheye
confirmées portant des numéros DIFFÉRENTS sont, par construction, deux joueurs réels différents.
Si le critère de fusion de cluster_tracks_globally (similarité d'embedding >= seuil ET couleur
proche ET même équipe ET même statut gardien ET transition physiquement plausible) dit pourtant
"même joueur" sur une telle paire, c'est une fusion erronée bien réelle, pas hypothétique.

Usage : python -m panorama.eval_followcam_reid
"""
import json
import os
import sys
from pathlib import Path

import numpy as np

VP = "/Users/gregorycohin/code/game-changer/video-pipeline"
sys.path.insert(0, VP)
sys.path.insert(0, VP)  # extract.py / tracking.py / metrics.py sont a la racine, pas dans panorama/

os.environ["PANORAMA_OUT"] = f"{VP}/output/panorama_pmrc_2lens"
os.environ["PANORAMA_CHAIN_ISOLATION_M"] = "3.0"
os.environ["FOLLOWCAM_TEAM"] = "B"
os.environ["FOLLOWCAM_VIDEO"] = "/Users/gregorycohin/Documents/Football/PMRC - FCSN/PMRC FCSN Veo.mov"
os.environ["NUMBERS_EXPORT"] = f"{VP}/output/panorama_pmrc/numeros-joueurs-pmrc.json"

from panorama import track as T, register as R
from panorama.config import FOLLOWCAM_TEAM, load_numbers, chain_isolation_m
from panorama import identify as I
from panorama.certify import Neighbours, card_windows, whole_track_windows, window_conflicts
from panorama.certify_run_fisheye import load_tracklets_from, inherit_via_chains
from panorama.make_cards import spread
import pickle

import extract
from tracking import (
    _boundary_transition_plausible, REID_GLOBAL_MIN_SIM, REID_COLOR_MAX_DIST,
)

RADIUS = 4.0
SHIFT_THR, MAX_DIST, MARGIN = 0.3, 2.5, 0.4   # seuils round 4 (les plus larges utilises)
FOLLOWCAM_CHECKPOINT = f"{VP}/output/checkpoint_local_pmrc.pkl"


def certified_cid_to_pid():
    """Reprend exactement la logique de certify_run_fisheye.main() jusqu'a all_todo (cid -> numero),
    sans aller jusqu'aux metriques -- seul le mapping identite nous interesse ici."""
    tls = load_tracklets_from(f"{VP}/output/panorama_pmrc_2lens/match")
    idx = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    labels = {}
    for p in Path(f"{VP}/output/panorama_pmrc_2lens/review_db_export/pistes/pistes").glob("*.json"):
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
    kept_cids = {cid for i, (cid, num, w) in enumerate(items) if i not in bad}
    pid_by_num = {num: numbers[num]["id"] for num in numbers}
    return {cid: pid_by_num[all_todo[cid]] for cid in kept_cids}, tls, idx


def followcam_keys_per_tracklet(tls):
    """Reproduit exactement le calcul de pairs{} de make_cards_round4.py (seuils les plus larges
    utilises) -- pour chaque piste fisheye (par index), la liste des cles de la video suiveuse
    qu'on lui a associees par position+temps."""
    import collections
    by_cid = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    horizon = max(t.t1 for t in tls)
    by_t, offset = R.followcam_by_time()
    pano = R.panorama_frames(tls)
    shifts_raw = R.register(by_t, offset, pano, horizon)
    shifts = {k: s for k, s in shifts_raw.items() if s["matched"] >= max(3, SHIFT_THR * s["total"]) and s["matched"] - s["second"] >= 0}
    by_frame = collections.defaultdict(list)
    for k, t in enumerate(tls):
        for i, ti in enumerate(np.round(t.t * 10).astype(int)):
            by_frame[ti].append((k, t.X[i], t.Y[i]))
    pairs = collections.defaultdict(set)
    for k2, sh in shifts.items():
        for (key, tm, X, Y, t) in by_t[k2]:
            if tm != FOLLOWCAM_TEAM:
                continue
            cand = by_frame.get(int(round((t + offset) * 10)))
            if not cand:
                continue
            d = np.array([np.hypot(c[1] - (X + sh["dx"]), c[2] - (Y + sh["dy"])) for c in cand])
            o = np.argsort(d)
            if d[o[0]] > MAX_DIST or (len(o) > 1 and d[o[1]] - d[o[0]] < MARGIN):
                continue
            pairs[cand[o[0]][0]].add(key)
    return pairs


def would_merge(a, b):
    """Reimplementation EXACTE des veto + criteres de tracking.cluster_tracks_globally, en lecture
    seule (jamais modifie la fonction d'origine) -- paire par paire, pour pouvoir l'interroger sur
    des pistes qu'on choisit nous-memes plutot que sur tout le match d'un coup."""
    t1, t2 = a.time_range, b.time_range
    if t1 is None or t2 is None:
        return None  # pas assez de donnees pour trancher
    if t1[0] <= t2[1] and t2[0] <= t1[1]:
        return False  # chevauchement temporel -> jamais fusionnes
    earlier, later = (a, b) if t1[1] <= t2[0] else (b, a)
    if not _boundary_transition_plausible(earlier, later):
        return False
    if a.is_goalkeeper is not None and b.is_goalkeeper is not None and a.is_goalkeeper != b.is_goalkeeper:
        return False
    if a.mean_color is not None and b.mean_color is not None:
        if float(np.linalg.norm(a.mean_color - b.mean_color)) > REID_COLOR_MAX_DIST:
            return False
    if a.mean_embedding is None or b.mean_embedding is None:
        return None
    sim = float(np.dot(a.mean_embedding, b.mean_embedding))
    return sim >= REID_GLOBAL_MIN_SIM


def main():
    print("1/3 -- pistes fisheye certifiees -> numero reel...")
    cid_to_pid, tls, idx = certified_cid_to_pid()
    print(f"   {len(cid_to_pid)} cartes certifiees (toutes contradictions ecartees)")

    print("2/3 -- rattachement aux cles de la video suiveuse (meme calcul que make_cards)...")
    pairs = followcam_keys_per_tracklet(tls)
    by_cid = {f"{t.id[0]}-{t.id[1]}": i for i, t in enumerate(tls)}
    pid_per_key = {}
    ambiguous = set()
    for cid, pid in cid_to_pid.items():
        k = by_cid.get(cid)
        if k is None:
            continue
        for key in pairs.get(k, ()):
            if key in pid_per_key and pid_per_key[key] != pid:
                ambiguous.add(key)
            else:
                pid_per_key[key] = pid
    for key in ambiguous:
        del pid_per_key[key]
    print(f"   {len(pid_per_key)} cles suiveuse avec un joueur reel connu (sans ambiguite) ; {len(ambiguous)} ecartees (ambigues)")

    print("3/3 -- chargement des accumulateurs (rejeu du checkpoint, aucune inference a refaire)...")
    accumulators, _, _ = extract._replay_from_checkpoint(FOLLOWCAM_CHECKPOINT)
    print(f"   {len(accumulators)} pistes au total apres pipeline complet")

    known = [(key, pid) for key, pid in pid_per_key.items() if key in accumulators]
    print(f"   {len(known)} de ces cles existent bien dans l'etat final des accumulateurs")

    diff_total = diff_merge = same_total = same_merge = inconclusive = 0
    examples = []
    same_sims, diff_sims = [], []
    for i in range(len(known)):
        for j in range(i + 1, len(known)):
            (ka, pa), (kb, pb) = known[i], known[j]
            a, b = accumulators[ka], accumulators[kb]
            r = would_merge(a, b)
            if a.mean_embedding is not None and b.mean_embedding is not None:
                sim = float(np.dot(a.mean_embedding, b.mean_embedding))
                (same_sims if pa == pb else diff_sims).append(sim)
            if r is None:
                inconclusive += 1
                continue
            if pa != pb:
                diff_total += 1
                if r:
                    diff_merge += 1
                    examples.append((ka, kb, pa, pb))
            else:
                same_total += 1
                if r:
                    same_merge += 1

    if diff_total:
        print(f"\n[seuil reel de production, 0.88] paires JOUEURS DIFFERENTS testees : {diff_total} ; auraient ete fusionnees A TORT : {diff_merge} ({100*diff_merge/diff_total:.2f}%)")
    else:
        print("\naucune paire de joueurs differents testable")
    if same_total:
        print(f"[seuil reel de production, 0.88] paires MEME joueur testees (cles differentes, meme pid) : {same_total} ; auraient ete recollees : {same_merge} ({100*same_merge/same_total:.0f}%)")
    print(f"paires non tranchables (embedding manquant d'un cote -- cf. bug cluster_tracks_globally ci-dessous) : {inconclusive}")
    for ka, kb, pa, pb in examples[:10]:
        print(f"  FUSION A TORT : {ka} (joueur {pa[:8]}…) <-> {kb} (joueur {pb[:8]}…)")

    same_sims, diff_sims = np.array(same_sims), np.array(diff_sims)
    print(f"\n--- la vraie question : CE SEUIL EST-IL LE PROBLEME, ou le signal lui-meme ? ---")
    print(f"similarite d'embedding, MEME joueur (n={len(same_sims)}) : moyenne {same_sims.mean():.3f} mediane {np.median(same_sims):.3f}")
    print(f"similarite d'embedding, joueurs DIFFERENTS (n={len(diff_sims)}) : moyenne {diff_sims.mean():.3f} mediane {np.median(diff_sims):.3f}")
    print("balayage de seuil (rappel = vrais recollements retrouves ; fausses fusions = joueurs differents merges a tort) :")
    for thr in [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.88]:
        recall = (same_sims >= thr).mean() if len(same_sims) else float("nan")
        false_merge = (diff_sims >= thr).mean() if len(diff_sims) else float("nan")
        print(f"  seuil {thr}: rappel {100*recall:.1f}% ; fausses fusions {100*false_merge:.1f}%")
    print("si rappel et fausses-fusions montent/descendent quasiment ensemble a chaque seuil : le signal "
          "ne separe PAS les coequipiers, aucun reglage de seuil ne resoudra ca -- pas un probleme du seuil 0.88 choisi.")

    print("\n--- BUG trouve en cours de route (lecture seule, pas corrige ici) ---")
    print("tracking.cluster_tracks_globally() ne rappelle jamais combined.add_embedding(...) ni ne copie")
    print("jersey_readings lors d'une fusion : toute piste deja fusionnee perd definitivement son embedding")
    print("(mean_embedding -> None) et ses votes de numero de maillot, donc devient non-regroupable au tour")
    print("suivant et illisible pour tout calcul ulterieur qui s'appuie dessus.")


if __name__ == "__main__":
    main()
