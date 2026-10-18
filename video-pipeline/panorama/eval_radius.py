"""Évalue le rayon d'isolement spatial (RADIUS, certify.py : un instant n'est certifié que si aucun
AUTRE joueur suivi n'est à moins de ce rayon) par un test synthétique construit sur le même principe
que eval_linker.py (coupure artificielle d'une piste réelle et longue), mais pour la panne qu'il est
censé empêcher ici : une piste JAMAIS interrompue (pas de trou, donc jamais vue par eval_linker) qui
permute silencieusement d'identité au moment où elle croise un autre joueur de très près.

Construction : on prend deux pistes réelles longues et confiantes A et B qui se croisent réellement
(distance mesurée minimale sous D_CLOSE à un instant t*), et on fabrique une piste synthétique = A
avant t*, B à partir de t* -- EXACTEMENT ce que produirait un vrai suivi qui se serait trompé de
joueur à ce croisement précis (le raccord à t* est physiquement plausible, puisque A et B sont alors
très proches l'un de l'autre). Le temps "après t*" est donc une IDENTITÉ CONNUE COMME FAUSSE (ce
n'est pas A, c'est B) : tout ce que whole_track_windows() certifie dans cette zone, pour un rayon R
donné, est une permutation non détectée.

Usage : python -m panorama.eval_radius [graine]
"""
import collections
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import identify as I
from panorama.certify import Neighbours, whole_track_windows

D_CLOSE = 2.0          # m : approche jugée "croisement serré" pour servir de point de greffe
MIN_TAIL_S = 2.5       # s : il faut au moins ça de piste de chaque côté du greffon pour mesurer quelque chose
N_TRIALS = 200


def closest_approach(a, b):
    """Instant t* et distance minimale sur le chevauchement temporel de deux pistes (échantillon 0.1 s)."""
    lo, hi = max(a.t0, b.t0), min(a.t1, b.t1)
    if hi - lo < 2 * MIN_TAIL_S:
        return None
    ts = np.arange(lo, hi, 0.1)
    d = np.hypot(np.interp(ts, a.t, a.X) - np.interp(ts, b.t, b.X), np.interp(ts, a.t, a.Y) - np.interp(ts, b.t, b.Y))
    k = int(np.argmin(d))
    if d[k] > D_CLOSE or ts[k] - a.t0 < MIN_TAIL_S or a.t1 - ts[k] < MIN_TAIL_S or ts[k] - b.t0 < MIN_TAIL_S or b.t1 - ts[k] < MIN_TAIL_S:
        return None
    return float(ts[k]), float(d[k])


HORIZON_S = 15.0   # borne la piste greffee a +-15s autour de t* : sinon whole_track_windows() remonte
                   # des fenetres isolees bien plus tard, sans rapport avec LE croisement teste ici,
                   # et gonfle artificiellement le temps "faux" avec du temps qui n'a jamais ete en danger


def splice(a, b, t_star, horizon_s=HORIZON_S):
    ma = [(t, x, y, r) for t, x, y, r in zip(a.t, a.X, a.Y, a.rho) if t_star - horizon_s <= t < t_star]
    mb = [(t, x, y, r) for t, x, y, r in zip(b.t, b.X, b.Y, b.rho) if t_star <= t < t_star + horizon_s]
    m = np.array(ma + mb)
    contacts = [c for c in a.contacts if t_star - horizon_s <= c < t_star] + [c for c in b.contacts if t_star <= c < t_star + horizon_s]
    return SimpleNamespace(t=m[:, 0], X=m[:, 1], Y=m[:, 2], rho=m[:, 3], contacts=np.array(sorted(contacts))), len(ma)


def dmin_with_partner(nb, tl, exclude_ids, partner, fps=10.0):
    """Distance au plus proche AUTRE joueur suivi, population réelle (sans a/b, "repris" par tl et
    son complémentaire) PLUS le complémentaire lui-même (`partner` = B avant t*, A après t* -- l'autre
    moitié du swap simulé, qui doit rester un voisin légitime, sinon le signal qu'on veut mesurer
    disparaît)."""
    d = np.full(len(tl.t), np.inf)
    fr = np.rint(tl.t * fps).astype(np.int64)
    for k, f in enumerate(fr):
        lo, hi = np.searchsorted(nb.F, [f, f + 1])
        xs, ys, ids = nb.X[lo:hi], nb.Y[lo:hi], nb.ID[lo:hi]
        m = ~np.isin(ids, exclude_ids)
        d[k] = float(np.min(np.hypot(xs[m] - tl.X[k], ys[m] - tl.Y[k]))) if m.any() else np.inf
    dp = np.hypot(np.interp(tl.t, partner.t, partner.X) - tl.X, np.interp(tl.t, partner.t, partner.Y) - tl.Y)
    return np.minimum(d, dp)


def evaluate(match_dir, seed, radii, min_hits=8, long_min=80):
    all_tls = []
    for p in sorted(Path(match_dir).glob("trk2_*.pkl")):
        import pickle
        for rec in pickle.load(open(p, "rb"))["tracks"]:
            if len(rec["meas"]) >= min_hits:
                all_tls.append(I.Tracklet(rec))
    long_idx = [i for i, t in enumerate(all_tls) if len(t.t) >= long_min]
    print(f"{len(all_tls)} pistes (>= {min_hits} hits) ; {len(long_idx)} longues (>= {long_min}) candidates au greffon")
    nb = Neighbours(all_tls)

    rng = np.random.RandomState(seed)
    rng.shuffle(long_idx)
    trials = []
    for i_rank in range(len(long_idx)):
        if len(trials) >= N_TRIALS:
            break
        ia = long_idx[i_rank]
        a = all_tls[ia]
        # voisins de a au sens du temps : on cherche un croisement réel parmi quelques candidats proches en indice
        for ib in long_idx[max(0, i_rank - 40):i_rank + 40]:
            if ib == ia:
                continue
            b = all_tls[ib]
            if b.t0 > a.t1 or a.t0 > b.t1:
                continue
            r = closest_approach(a, b)
            if r:
                trials.append((ia, ib, *r))
                break
    print(f"{len(trials)} croisements réels trouvés (distance <= {D_CLOSE} m, >= {MIN_TAIL_S}s de piste de chaque côté)")

    per_r = {r: [0.0, 0.0] for r in radii}   # [secondes "fausses" certifiées après t*, secondes certifiées totales]
    dists = []
    for ia, ib, t_star, d_closest in trials:
        a, b = all_tls[ia], all_tls[ib]
        synth, n_pre = splice(a, b, t_star)
        partner, _ = splice(b, a, t_star)      # l'autre moitié du swap : B avant t*, A après -- doit rester un voisin visible
        dists.append(d_closest)
        d = dmin_with_partner(nb, synth, (ia, ib), partner)
        for r in radii:
            wins = whole_track_windows(synth, d, r)
            for wa, wb in wins:
                total = wb - wa
                wrong = max(0.0, wb - max(wa, t_star))
                per_r[r][0] += wrong
                per_r[r][1] += total
    return trials, per_r, dists


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    match_dir = sys.argv[2] if len(sys.argv) > 2 else f"{Path(__file__).parent.parent}/output/panorama_pmrc_2lens/match"
    radii = [4.0, 3.5, 3.0, 2.5, 2.0, 1.5]
    trials, per_r, dists = evaluate(match_dir, seed, radii)
    print(f"distance de croisement : médiane {np.median(dists):.2f} m, 90e centile {np.percentile(dists, 90):.2f} m")
    label = "taux d'erreur"
    print(f"\n{'rayon':>6} {'s. certifiées totales':>22} {'s. FAUSSES certifiées':>22} {label:>14}")
    for r in radii:
        wrong, total = per_r[r]
        rate = 100 * wrong / total if total > 0 else float("nan")
        print(f"{r:>6.1f} {total:>22.1f} {wrong:>22.1f} {rate:>13.2f}%")
