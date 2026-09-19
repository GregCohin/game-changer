"""Rattache les pistes du panoramique aux joueurs de Gregory (équipe sombre).

1. charge toutes les pistes ;  2. chaîne les pistes consécutives sans ambiguïté (raccords courts) ;
3. étiquette les chaînes avec les identifications de la vidéo suiveuse (recalées par panorama.sync) ;
4. calcule les métriques par joueur sur les seuls moments sûrs.
"""
import collections
import math
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T

MATCH = T.OUT / "match"
GAP_MAX_S = 4.0            # trou maximal d'un raccord entre deux pistes
LINK_MARGIN_M = 1.0        # marge de position d'un raccord
LINK_MAX_COST = 6.0        # coût maximal accepté
AMBIGUITY_GAP = 1.5        # 2e meilleur candidat à moins de ce coût -> raccord refusé (ambigu)
ISOLATION_M = None         # si défini : raccord refusé quand une autre piste compatible démarre/finit à moins de ce rayon pendant le trou


class Tracklet:
    def __init__(self, rec):
        self.id = (rec["chunk"], rec["id"])
        self.side = rec["side"]
        m = np.array(rec["meas"])
        self.t, self.X, self.Y, self.rho = m[:, 0], m[:, 1], m[:, 2], m[:, 3]
        self.contacts = np.array(sorted(set(rec["contacts"])))
        self.color = np.array([e[2][:3] if e[2] else [np.nan] * 3 for e in rec["extra"]], float)
        self.t0, self.t1 = self.t[0], self.t[-1]
        ts, xs, Ps = T.kf_smooth([tuple(r) for r in m])
        self.state0, self.state1 = xs[0], xs[-1]            # (X, Y, vX, vY) lissés aux extrémités
        self.sigv0, self.sigv1 = math.sqrt(max(Ps[0][2, 2], Ps[0][3, 3])), math.sqrt(max(Ps[-1][2, 2], Ps[-1][3, 3]))
        self.next = self.prev = None
        self.chain = None


def track_files():
    v2 = sorted(MATCH.glob("trk2_*.pkl"))
    return v2 if v2 else sorted(MATCH.glob("trk_*.pkl"))


def load_tracklets(min_hits=8):
    out = []
    for p in track_files():
        for rec in pickle.load(open(p, "rb"))["tracks"]:
            if len(rec["meas"]) >= min_hits:
                out.append(Tracklet(rec))
    return out


def compatible(a, b):
    return not (a.side and b.side and a.side != b.side)


SIGMA_P0, SIGMA_P1 = 0.4, 0.8      # tolérance de position : SIGMA_P0 + SIGMA_P1 * trou (m)
SIGMA_V0, SIGMA_V1 = 1.0, 1.0      # tolérance de vitesse : SIGMA_V0 + SIGMA_V1 * trou (m/s)
W_VEL = 0.0                        # poids de la cohérence de vitesse
BIDIR = False                      # prédiction dans les deux sens (fin de a -> début de b et début de b -> fin de a)
W_COLOR = 1.0


def link_cost(a, b):
    """Coût d'un raccord a -> b (fin de a, début de b) ; None si impossible."""
    g = b.t0 - a.t1
    if not (0 < g <= GAP_MAX_S) or not compatible(a, b):
        return None
    xa, va = a.state1[:2], a.state1[2:]
    xb, vb = b.state0[:2], b.state0[2:]
    if np.hypot(*(xb - xa)) > T.VMAX * g + LINK_MARGIN_M:
        return None
    gg = min(g, 1.0)
    sigma = SIGMA_P0 + SIGMA_P1 * g
    d1 = float(np.hypot(*(xb - (xa + va * gg))))
    if BIDIR:
        d2 = float(np.hypot(*(xa - (xb - vb * gg))))
        cost = ((d1 / sigma) ** 2 + (d2 / sigma) ** 2) / 2
    else:
        cost = (d1 / sigma) ** 2
    if W_VEL:
        sv = SIGMA_V0 + SIGMA_V1 * g
        cost += W_VEL * (float(np.hypot(*(vb - va))) / sv) ** 2
    cost += 0.3 * g
    ca, cb = np.nanmedian(a.color[-15:], axis=0), np.nanmedian(b.color[:15], axis=0)
    if W_COLOR and not (np.isnan(ca).any() or np.isnan(cb).any()):
        cost += W_COLOR * (abs(ca[2] - cb[2]) / 255 * 3) ** 2
    return cost if cost <= LINK_MAX_COST else None


def build_chains(tracklets):
    """Raccords mutuellement meilleurs et non ambigus. Retourne (liste de chaînes, nombre de raccords refusés pour ambiguïté)."""
    order = sorted(tracklets, key=lambda t: t.t0)
    starts = np.array([t.t0 for t in order])
    start_pos = np.array([t.state0[:2] for t in order])
    by_end = sorted(range(len(order)), key=lambda i: order[i].t1)
    ends = np.array([order[i].t1 for i in by_end])
    end_pos = np.array([order[i].state1[:2] for i in by_end])
    cands = collections.defaultdict(list)     # successeurs possibles de a
    preds = collections.defaultdict(list)     # prédécesseurs possibles de b
    for i, a in enumerate(order):
        lo = np.searchsorted(starts, a.t1, side="right")
        hi = np.searchsorted(starts, a.t1 + GAP_MAX_S, side="right")
        for j in range(lo, hi):
            c = link_cost(a, order[j])
            if c is not None:
                cands[i].append((c, j)); preds[j].append((c, i))
    refused = 0
    for i, lst in cands.items():
        lst.sort()
        c, j = lst[0]
        best_pred = min(preds[j])
        alt_succ = lst[1][0] if len(lst) > 1 else 1e9
        alt_pred = sorted(preds[j])[1][0] if len(preds[j]) > 1 else 1e9
        if best_pred[1] != i:
            continue
        if alt_succ - c < AMBIGUITY_GAP or alt_pred - c < AMBIGUITY_GAP:
            refused += 1
            continue
        if ISOLATION_M is not None:
            a, b = order[i], order[j]
            g = b.t0 - a.t1
            # autre piste qui démarre près de la fin de a pendant le trou (et jusqu'au début de b)
            lo, hi = np.searchsorted(starts, a.t1, side="right"), np.searchsorted(starts, b.t0 + 0.5, side="right")
            near_s = [k for k in range(lo, hi) if k != j and np.hypot(*(start_pos[k] - a.state1[:2])) <= ISOLATION_M and compatible(a, order[k])]
            # autre piste qui finit près du début de b pendant le trou
            lo, hi = np.searchsorted(ends, a.t1 - 0.5, side="left"), np.searchsorted(ends, b.t0, side="left")
            near_e = [k for k in range(lo, hi) if by_end[k] != i and np.hypot(*(end_pos[k] - b.state0[:2])) <= ISOLATION_M and compatible(b, order[by_end[k]])]
            if near_s or near_e:
                refused += 1
                continue
        order[i].next, order[j].prev = order[j], order[i]
    chains = []
    for t in order:
        if t.prev is None:
            ch, cur = [], t
            while cur is not None:
                ch.append(cur); cur.chain = len(chains); cur = cur.next
            chains.append(ch)
    return chains, refused


def chain_stats(chains):
    n = [len(c) for c in chains]
    span = [c[-1].t1 - c[0].t0 for c in chains]
    return f"{len(chains)} chaînes ; pistes par chaîne : médiane {np.median(n):.0f}, max {max(n)} ; durée : médiane {np.median(span):.1f} s, ≥30 s : {sum(s >= 30 for s in span)}, ≥60 s : {sum(s >= 60 for s in span)}, ≥120 s : {sum(s >= 120 for s in span)}"


if __name__ == "__main__":
    tl = load_tracklets()
    dark = [t for t in tl if t.side == "D"]
    print(f"{len(tl)} pistes, dont {len(dark)} de l'équipe sombre")
    chains, refused = build_chains(dark)
    print(chain_stats(chains), f"; raccords refusés (ambigus) : {refused}")
