"""Évalue le chaîneur de pistes par coupures artificielles : une piste longue est coupée avec un trou de
0,6 à 3 s ; le chaîneur doit recoller les deux morceaux sans se tromper de voisin.

Usage : python -m panorama.eval_linker [graine]
"""
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import identify as I

MATCH = I.MATCH


def load_records(sides=("D", None)):
    recs = []
    for p in sorted(MATCH.glob("trk_*.pkl")):
        recs += [r for r in pickle.load(open(p, "rb"))["tracks"] if r["side"] in sides and len(r["meas"]) >= 8]
    return recs


def make_split(recs, seed, n_split=150):
    rng = np.random.RandomState(seed)
    cand = [i for i, r in enumerate(recs) if len(r["meas"]) >= 80]
    rng.shuffle(cand)
    chosen = set(cand[:n_split])
    out, truth = [], {}
    for i, r in enumerate(recs):
        if i not in chosen:
            out.append(r)
            continue
        n = len(r["meas"])
        gap = rng.uniform(0.6, 3.0)
        cut = rng.randint(25, n - 25 - int(gap * 10) - 1)
        t_cut = r["meas"][cut][0]
        end = next((k for k in range(cut, n) if r["meas"][k][0] >= t_cut + gap), None)
        if end is None or n - end < 20:
            out.append(r)
            continue
        pre = dict(r, id=("pre", i), meas=r["meas"][:cut], extra=r["extra"][:cut])
        post = dict(r, id=("post", i), meas=r["meas"][end:], extra=r["extra"][end:])
        out += [pre, post]
        truth[i] = (("pre", i), ("post", i), gap)
    return out, truth


def evaluate(seed, **params):
    for k, v in params.items():
        setattr(I, k, v)
    recs = load_records()
    out, truth = make_split(recs, seed)
    tl = [I.Tracklet(dict(r, chunk=r["id"][0] if isinstance(r["id"], tuple) else r["chunk"], id=r["id"][1] if isinstance(r["id"], tuple) else r["id"])) for r in out]
    key = {}
    for t, r in zip(tl, out):
        key[(r["id"] if isinstance(r["id"], tuple) else (r["chunk"], r["id"]))] = t
    chains, refused = I.build_chains(tl)
    ok = wrong = missed = 0
    for i, (kpre, kpost, gap) in truth.items():
        pre, post = key[kpre], key[kpost]
        if pre.next is post:
            ok += 1
        elif pre.next is None:
            missed += 1
        else:
            wrong += 1
    wrong_post = sum(1 for i, (kpre, kpost, gap) in truth.items() if key[kpost].prev is not None and key[kpost].prev is not key[kpre])
    n = len(truth)
    links = sum(1 for t in tl if t.next is not None)
    return n, ok, missed, wrong, wrong_post, links, len(tl), refused


if __name__ == "__main__":
    seeds = [int(sys.argv[1])] if len(sys.argv) > 1 else [1, 2, 3]
    tot = np.zeros(8)
    for s in seeds:
        tot += np.array(evaluate(s), float)
    n, ok, missed, wrong, wrong_post, links, ntl, refused = tot
    print(f"coupures évaluées : {n:.0f} ; recollées correctement {100*ok/n:.0f} % ; ratées {100*missed/n:.0f} % ; MAUVAIS voisin {100*wrong/n:.1f} % (côté aval : {100*wrong_post/n:.1f} %) ; raccords totaux {links:.0f}/{ntl:.0f} pistes ; refus d'ambiguïté {refused:.0f}")
