"""Vignettes haute résolution de la vidéo suiveuse rattachées aux pistes du panoramique (pour la revue de Gregory).

Une vignette suiveuse (joueur de son équipe, bien visible, horodatée) est rattachée à la piste panoramique
qui se trouvait au même endroit au même instant. Elle montre la personne de cette piste, pas un jugement
sur toute une trace suiveuse (qui peut mélanger plusieurs joueurs).

Usage : python -m panorama.crops     -> output/panorama/crops.pkl
"""
import collections
import pickle
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
import extract   # noqa: E402
from panorama import track as T          # noqa: E402
from panorama.config import FOLLOWCAM_TEAM, followcam_checkpoint      # noqa: E402
from panorama.label import affine_of     # noqa: E402

OUT = T.OUT


def followcam_crops(team=FOLLOWCAM_TEAM):
    S = pickle.load(open(OUT / "sync.pkl", "rb"))
    AFFINE = affine_of(S)
    acc, _, _ = extract._replay_from_checkpoint(followcam_checkpoint())
    out = []
    for key, a in acc.items():
        if not key.startswith(team + "#") or not a.thumbnail_candidates or not a.samples:
            continue
        st = np.array([s[0] for s in a.samples])
        for (t, h, jpeg) in a.thumbnail_candidates:
            j = int(np.argmin(np.abs(st - t)))
            if abs(st[j] - t) > 0.6:
                continue
            _, xw, yl = a.samples[j]
            X = S["s1"] * (yl - 0.5) * 105.0 * AFFINE["ax"] + AFFINE["bx"]
            Y = S["s2"] * (xw - 0.5) * 68.0 * AFFINE["ay"] + AFFINE["by"]
            out.append(dict(key=key, t=t + S["offset"], X=X, Y=Y, h=h, jpeg=jpeg))
    return out


if __name__ == "__main__":
    crops = followcam_crops()
    print(f"{len(crops)} vignettes suiveuse (équipe {FOLLOWCAM_TEAM}) avec position")
    pickle.dump(crops, open(OUT / "crops.pkl", "wb"))
