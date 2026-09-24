"""Positions de la vidéo suiveuse (checkpoint extract.py) rattachées aux joueurs identifiés (si un roster certifié existe déjà).

Écrit <PANORAMA_OUT>/followcam.pkl : liste de traces {key, team, player, samples[(t, largeur_norm, longueur_norm)]}.
Chemins pris sur FOLLOWCAM_CHECKPOINT / FOLLOWCAM_ROSTER (défaut : les fichiers du 1er match) — voir panorama/config.py.
Sans roster (pas encore de revue certifiée pour ce match) : traces écrites non identifiées (player=None, étape 1a) ;
rejouer une fois FOLLOWCAM_ROSTER disponible pour les rattacher, sans retraiter la vidéo.
Usage : python -m panorama.followcam
"""
import pickle
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
import extract   # noqa: E402  (rejoue exactement le post-traitement du run d'origine)
import json

from panorama import track as T   # noqa: E402
from panorama.config import FOLLOWCAM_TEAM, followcam_checkpoint, followcam_roster   # noqa: E402

OUT = T.OUT


def main():
    checkpoint, roster_path = followcam_checkpoint(), followcam_roster()
    acc, _, total = extract._replay_from_checkpoint(checkpoint)
    roster = json.load(open(roster_path)) if Path(roster_path).exists() else {}
    if not roster:
        print(f"pas de roster à {roster_path} : traces écrites non identifiées (étape 1a).")
    traces = []
    for key, a in acc.items():
        team, suffix = key.split("#", 1)
        traces.append(dict(key=key, team=team, player=roster.get(team, {}).get(suffix), samples=[tuple(s) for s in a.samples]))
    OUT.mkdir(parents=True, exist_ok=True)
    pickle.dump(dict(traces=traces, total_sampled=total), open(OUT / "followcam.pkl", "wb"))
    ident = [t for t in traces if t["player"]]
    print(f"{len(traces)} traces, dont {len(ident)} identifiées ({sum(len(t['samples']) for t in ident)} échantillons) ; "
          f"équipe {FOLLOWCAM_TEAM} (la nôtre) : {sum(len(t['samples']) for t in traces if t['team'] == FOLLOWCAM_TEAM)} échantillons au total")


if __name__ == "__main__":
    main()
