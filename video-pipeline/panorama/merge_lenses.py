"""Fusionne les pistes des 2 objectifs du fichier brut (chacun déjà suivi séparément, même
horloge puisqu'ils viennent du même fichier) dans un seul dossier `match/`, pour que le chaînage
(panorama.identify) et l'identification (panorama.certify_run) voient les deux objectifs ensemble
-- une piste qui change d'objectif doit pouvoir être reliée, pas traitée comme deux joueurs.

Les numéros de tranche des 2 objectifs se chevauchent (000-026 chacun) : ceux de l'objectif B sont
décalés de +1000 (fichier ET champ "chunk" interne) pour ne jamais entrer en collision avec ceux de
l'objectif A -- (chunk, id) doit rester un identifiant global unique (panorama.identify.Tracklet).

Usage : python -m panorama.merge_lenses output/panorama_pmrc_lensA output/panorama_pmrc_lensB output/panorama_pmrc_2lens
"""
import pickle
import shutil
import sys
from pathlib import Path


def merge(dir_a, dir_b, out_dir, offset_b=1000):
    out = Path(out_dir) / "match"
    out.mkdir(parents=True, exist_ok=True)
    n_a = n_b = 0
    for p in sorted((Path(dir_a) / "match").glob("trk2_*.pkl")):
        shutil.copy(p, out / p.name)
        n_a += 1
    for p in sorted((Path(dir_b) / "match").glob("trk2_*.pkl")):
        d = pickle.load(open(p, "rb"))
        k = int(p.stem.split("_")[1]) + offset_b
        for t in d["tracks"]:
            t["chunk"] = k
        pickle.dump(d, open(out / f"trk2_{k:03d}.pkl", "wb"))
        n_b += 1
    print(f"fusionné : {n_a} tranches objectif A (telles quelles) + {n_b} tranches objectif B (chunk +{offset_b}) -> {out}")


if __name__ == "__main__":
    merge(sys.argv[1], sys.argv[2], sys.argv[3])
