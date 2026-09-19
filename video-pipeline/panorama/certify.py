"""Fenêtres d'identité certifiées : une identification faite sur une vignette ne vaut que pour la portion de piste
qui est sûrement la même personne que sur la vignette.

Une piste peut permuter deux joueurs (a) quand ils passent près l'un de l'autre, (b) quand elle est perdue puis
ré-accrochée (trou > 0,6 s). Autour de l'instant de chaque vignette on ne certifie donc que l'intervalle continu
(sans trou) et sans autre joueur suivi à moins de R mètres.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.identify import load_tracklets

FPS = 10.0
GAP_S = 0.6            # trou maximal dans une piste certifiée


class Neighbours:
    """Index temporel de toutes les pistes : distance au voisin le plus proche à chaque instant."""

    def __init__(self, tls):
        F, X, Y, ID = [], [], [], []
        for i, t in enumerate(tls):
            F.append(np.rint(t.t * FPS).astype(np.int64)); X.append(t.X); Y.append(t.Y); ID.append(np.full(len(t.t), i))
        F, X, Y, ID = map(np.concatenate, (F, X, Y, ID))
        o = np.argsort(F, kind="stable")
        self.F, self.X, self.Y, self.ID = F[o], X[o], Y[o], ID[o]

    def at(self, f):
        lo, hi = np.searchsorted(self.F, [f, f + 1])
        return self.X[lo:hi], self.Y[lo:hi], self.ID[lo:hi]

    def nearest(self, tl_index, tl):
        """Pour chaque mesure de la piste : distance au plus proche autre joueur suivi au même instant (inf si aucun)."""
        d = np.full(len(tl.t), np.inf)
        fr = np.rint(tl.t * FPS).astype(np.int64)
        for k, f in enumerate(fr):
            xs, ys, ids = self.at(f)
            m = ids != tl_index
            if m.any():
                d[k] = float(np.min(np.hypot(xs[m] - tl.X[k], ys[m] - tl.Y[k])))
        return d


def window_around(tl, dmin, c, radius):
    """Intervalle (t_debut, t_fin) continu autour de l'instant c, sans trou > GAP_S et sans voisin < radius ; None si c n'est pas sûr."""
    t = tl.t
    if c < t[0] - 0.05 or c > t[-1] + 0.05:
        return None
    k = int(np.argmin(np.abs(t - c)))
    if abs(t[k] - c) > 0.5 or dmin[k] < radius:
        return None
    a = k
    while a > 0 and t[a] - t[a - 1] <= GAP_S and dmin[a - 1] >= radius:
        a -= 1
    b = k
    while b < len(t) - 1 and t[b + 1] - t[b] <= GAP_S and dmin[b + 1] >= radius:
        b += 1
    return float(t[a]), float(t[b])


def merge(wins, eps=0.05):
    out = []
    for a, b in sorted(wins):
        if out and a <= out[-1][1] + eps:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def card_windows(tl, dmin, crop_times, radius, only=None):
    """Fenêtres certifiées d'une carte : autour de chaque vignette (ou seulement celles de `only`)."""
    wins = []
    for k, c in enumerate(crop_times):
        if only is not None and k not in only:
            continue
        w = window_around(tl, dmin, c, radius)
        if w:
            wins.append(w)
    return merge(wins)


def window_conflicts(items, tls_by_key, max_dist=3.0):
    """items : liste de (cle_piste, numero, (a, b)). Renvoie les indices d'items en contradiction :
    même numéro à plus de max_dist m pendant > 0,5 s, ou deux numéros différents à moins de 1,5 m pendant > 3 s."""
    bad, notes = set(), []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            ki, ni, (a0, a1) = items[i]
            kj, nj, (b0, b1) = items[j]
            lo, hi = max(a0, b0), min(a1, b1)
            if hi - lo <= 0.5 or ki == kj:
                continue
            ts = np.arange(lo, hi, 0.1)
            A, B = tls_by_key[ki], tls_by_key[kj]
            d = float(np.hypot(np.interp(ts, A.t, A.X) - np.interp(ts, B.t, B.X), np.interp(ts, A.t, A.Y) - np.interp(ts, B.t, B.Y)).mean())
            if ni == nj and d > max_dist:
                bad.update((i, j)); notes.append(f"#{ni} : {ki} / {kj} recouvrement {hi - lo:.1f} s à {d:.1f} m")
            elif ni != nj and d < 1.5 and hi - lo > 3.0:
                bad.update((i, j)); notes.append(f"#{ni}/#{nj} : {ki} / {kj} au même endroit ({d:.1f} m) pendant {hi - lo:.1f} s")
    return bad, notes


def slice_meas(tl, a, b):
    m = (tl.t >= a - 1e-6) & (tl.t <= b + 1e-6)
    return list(zip(tl.t[m], tl.X[m], tl.Y[m], tl.rho[m])), [c for c in tl.contacts if a - 1e-6 <= c <= b + 1e-6]
