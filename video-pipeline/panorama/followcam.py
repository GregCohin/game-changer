"""Positions de la vidéo suiveuse (checkpoint v4) rattachées aux joueurs que Gregory a identifiés.

Écrit output/panorama/followcam.pkl : liste de traces {key, team, player, samples[(t, largeur_norm, longueur_norm)]}.
Usage : python -m panorama.followcam
"""
import json
import pickle
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
import extract   # noqa: E402  (rejoue exactement le post-traitement du run v4)

OUT = ROOT / "output" / "panorama"


def main():
    acc, _, total = extract._replay_from_checkpoint(str(ROOT / "output" / "checkpoint_local_v4.pkl"))
    roster = json.load(open(ROOT / "output" / "roster_v4.json"))
    traces = []
    for key, a in acc.items():
        team, suffix = key.split("#", 1)
        traces.append(dict(key=key, team=team, player=roster.get(team, {}).get(suffix), samples=[tuple(s) for s in a.samples]))
    pickle.dump(dict(traces=traces, total_sampled=total), open(OUT / "followcam.pkl", "wb"))
    ident = [t for t in traces if t["player"]]
    print(f"{len(traces)} traces, dont {len(ident)} identifiées ({sum(len(t['samples']) for t in ident)} échantillons) ; "
          f"équipe A : {sum(len(t['samples']) for t in traces if t['team'] == 'A')} échantillons au total")


if __name__ == "__main__":
    main()
