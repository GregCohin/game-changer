"""OBSOLÈTE — attribue des pistes ENTIÈRES aux joueurs, or une longue piste peut permuter deux joueurs (voir certify.py).
Utiliser `python -m panorama.certify_run` (fenêtres d'identité certifiées) à la place.

Des identifications de Gregory (revue du panoramique) aux métriques physiques par joueur, au format du site.

Usage : python -m panorama.finalize <dossier_export_db>   (dossier écrit par read_db out_dir, contenant pistes/*.json)
Écrit output/panorama/resultat_panorama.json (importable dans Studio -> Analyse avancée) et un rapport texte.
"""
import collections
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.config import MATCH_DURATION_S, load_numbers
from panorama.identify import load_tracklets
from panorama.player_metrics import player_metrics

REFERENCE_S = MATCH_DURATION_S      # durée de l'enregistrement (min. jouées : la pause de mi-temps est déjà coupée) ; propre à chaque match, voir config.py


def load_labels(folder):
    labels = {}
    for f in sorted(Path(folder).rglob("*.json")):
        d = json.load(open(f))
        d = d.get("data", d)
        cid = d.get("cardId")
        if cid:
            labels[cid] = d
    return labels


def same_place_conflicts(tls):
    """Paires de pistes du même joueur qui se chevauchent >1 s à plus de 3 m l'une de l'autre (impossible)."""
    bad = []
    for a in range(len(tls)):
        for b in range(a + 1, len(tls)):
            A, B = tls[a], tls[b]
            lo, hi = max(A.t0, B.t0), min(A.t1, B.t1)
            if hi - lo > 1.0:
                ta = (A.t >= lo) & (A.t <= hi)
                d = np.hypot(np.interp(A.t[ta], B.t, B.X) - A.X[ta], np.interp(A.t[ta], B.t, B.Y) - A.Y[ta]).mean()
                if d > 3.0:
                    bad.append((A, B, float(d)))
    return bad


def main(folder):
    labels = load_labels(folder)
    numbers = load_numbers(required=True)
    by_id = {f"{t.id[0]}-{t.id[1]}": t for t in load_tracklets()}
    per_player = collections.defaultdict(list)
    skipped = collections.Counter()
    for cid, d in labels.items():
        if cid not in by_id:
            skipped["piste introuvable"] += 1
        elif d.get("assignedNumber") and str(d["assignedNumber"]) in numbers:
            per_player[str(d["assignedNumber"])].append(by_id[cid])
        elif d.get("mixed"):
            skipped["mélange"] += 1
        elif d.get("unsure"):
            skipped["pas sûr"] += 1
    players, lines = {}, []
    for num in sorted(per_player, key=int):
        tls = per_player[num]
        conflicts = same_place_conflicts(tls)
        bad = {id(x) for a, b, _ in conflicts for x in (a, b)}
        good = [t for t in tls if id(t) not in bad]
        pid, name = numbers[num]["id"], numbers[num]["name"].strip()
        if not good:
            lines.append(f"#{num} {name} : {len(tls)} pistes, toutes en conflit -> aucune retenue")
            continue
        m = player_metrics([list(zip(t.t, t.X, t.Y, t.rho)) for t in good], [c for t in good for c in t.contacts], REFERENCE_S)
        players[pid] = m
        lines.append(f"#{num:>2} {name:20s} {len(good):3d} pistes ({sum(t.t1 - t.t0 for t in good):5.0f} s) ; conflits écartés {len(tls) - len(good)} ; "
                     f"visible {100 * m['visibleCoverage']:.1f} % ; {m['distanceCovered']} m, {m['sprints']} sprints, pointe {m['topSpeed']} km/h, HI {m['highIntensityDistance']} m")
    out = {"source": "Pipeline vidéo (panoramique Veo, identités vérifiées par revue)", "importedAt": None, "players": players,
           "team": {"avgBlockHeight": None, "avgWidth": None, "avgDepth": None, "ppda": None}, "passNetwork": [], "preciseEvents": []}
    json.dump(out, open(T.OUT / "resultat_panorama.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(labels)} cartes lues ; écartées : {dict(skipped)}")
    print("\n".join(lines))
    print(f"-> {T.OUT / 'resultat_panorama.json'}")


if __name__ == "__main__":
    main(sys.argv[1])
