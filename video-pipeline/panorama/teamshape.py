"""Forme d'équipe (hauteur du bloc, largeur, profondeur) de l'équipe noire sur tout le match, sans identifier les joueurs.

Chaque mesure de piste reçoit une équipe (teamclass) ; on retire les gardiens (classe YOLO « gardien » ou maillot vert / rouge),
on borne à 10 joueurs de champ par image, et on ne calcule la forme que sur les images où au moins N_MIN joueurs de champ
sont suivis (sinon les étendues sont sous-estimées).

Usage : python -m panorama.teamshape
"""
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import teamclass as C
from panorama import track as T
from panorama.config import half_cut_s, noir_own_right_h1, pitch_dims
from panorama.match import sample_hz

MATCH = T.OUT / "match"
FPS = sample_hz()                   # cadence réelle des images (10 Hz pour le 1er match ; 9,36 Hz pour une capture à 56,17 im/s)
HALF_CUT_S = half_cut_s()           # coupure de mi-temps dans l'enregistrement (fin/début simultanés de toutes les pistes) ; PANORAMA_HALF_CUT_S
NOIR_OWN_RIGHT_H1 = noir_own_right_h1()
# Terrain du match (PANORAMA_PITCH ; 1er match : RÉGLEMENTAIRE 105 x 68 m, confirmé sur la vue satellite du stade : rapport longueur/largeur 1,544, cercle
# 18,3 m, surfaces 16,5 x 40,32 m), coordonnées en vrais mètres depuis le calage v2 (panorama.calibrate2 / calibrate3). Les personnes hors du terrain
# (staff, spectateurs) sont écartées.
L_HALF = pitch_dims()[0] / 2       # demi-longueur : lignes de but en X = +/- L_HALF
Y_FAR, Y_NEAR = -pitch_dims()[1] / 2, pitch_dims()[1] / 2        # touches (m)
PITCH_MARGIN = 1.0                 # tolérance autour des lignes (m)
GK_SHARE_MAX = 0.20                # au-delà : piste de gardien (classe YOLO 1 sur >20 % de ses mesures)
AUTRE_MAX = 0.30                   # probabilité moyenne « autre » (gardien, arbitre) au-delà de laquelle la piste est écartée
N_MIN = 9                          # joueurs de champ suivis minimum pour calculer la forme d'une image
MAX_TEAM = 10
DEDUP_M = 1.5                      # deux mesures de la même équipe à moins de ça dans une image : même personne (piste fantôme), on garde la plus sûre


def load_measurements(half_s=2.0):
    """Toutes les mesures (t, X, Y, indice de piste) avec les probabilités lissées et les indicateurs de piste."""
    model = C.load_model()
    cols = {k: [] for k in ("t", "X", "Y", "tid", "PN", "PW", "PA")}
    tk = []
    n_chunks = len(list(MATCH.glob("trk2_*.pkl")))   # pas 20 en dur : un montage dur (PANORAMA_CUTS) peut ajouter une tranche
    for k in range(n_chunks):
        feat = pickle.load(open(MATCH / f"feat_{k:03d}.pkl", "rb"))
        for rec in pickle.load(open(MATCH / f"trk2_{k:03d}.pkl", "rb"))["tracks"]:
            if len(rec["meas"]) < 8:
                continue
            m = np.array(rec["meas"])
            P = C.proba(model, feat[(rec["chunk"], rec["id"])])
            Ps = C.smooth(m[:, 0], P, half_s)
            ok = ~np.isnan(P[:, 0])
            cls = np.array([e[1] for e in rec["extra"]])
            tid = len(tk)
            tk.append(dict(id=f'{rec["chunk"]}-{rec["id"]}', gk=float((cls == 1).mean()), pa=float(np.nanmean(P[ok, 2])) if ok.any() else np.nan, n=len(m)))
            cols["t"].append(m[:, 0]); cols["X"].append(m[:, 1]); cols["Y"].append(m[:, 2]); cols["tid"].append(np.full(len(m), tid))
            cols["PN"].append(Ps[:, 0]); cols["PW"].append(Ps[:, 1]); cols["PA"].append(Ps[:, 2])
    out = {k: np.concatenate(v) for k, v in cols.items()}
    out["tracklets"] = tk
    return out


def team_members(D, team, thr=0.9, max_team=MAX_TEAM, use_gk_filter=True, dedup_m=DEDUP_M):
    """Indices des mesures retenues pour l'équipe (0 noir, 1 clair) : probabilité >= thr, hors gardiens/arbitres, <= max_team par image."""
    P = D["PN"] if team == 0 else D["PW"]
    ok = (P >= thr) & (np.abs(D["X"]) <= L_HALF + PITCH_MARGIN) & (D["Y"] >= Y_FAR - PITCH_MARGIN) & (D["Y"] <= Y_NEAR + PITCH_MARGIN)
    if use_gk_filter:
        gk = np.array([tk["gk"] for tk in D["tracklets"]])[D["tid"]]
        pa = np.array([tk["pa"] for tk in D["tracklets"]])[D["tid"]]
        ok &= (gk < GK_SHARE_MAX) & ~(pa >= AUTRE_MAX)
    idx = np.where(ok)[0]
    fr = np.rint(D["t"][idx] * FPS).astype(np.int64)
    order = np.lexsort((-P[idx], fr))                 # par image, probabilité décroissante
    idx, fr = idx[order], fr[order]
    keep = np.zeros(len(idx), bool)
    X, Y = D["X"], D["Y"]
    ub, st = np.unique(fr, return_index=True)
    en = np.r_[st[1:], len(fr)]
    for a, b in zip(st, en):
        chosen = []
        for k in range(a, b):                          # ordre de probabilité décroissante
            if len(chosen) >= max_team:
                break
            i = idx[k]
            if all(np.hypot(X[i] - X[idx[c]], Y[i] - Y[idx[c]]) >= dedup_m for c in chosen):
                chosen.append(k)
        keep[chosen] = True
    return idx[keep]


def shape_series(D, members, team=0, n_min=N_MIN):
    """Par image : (temps, hauteur du bloc, largeur, profondeur, n joueurs, écart-type long., écart-type larg., joueur le plus reculé, le plus avancé) en MÈTRES ; la hauteur est la distance moyenne à sa propre ligne de but, les deux derniers champs sont les distances à cette ligne du plus reculé et du plus avancé."""
    t, X, Y = D["t"][members], D["X"][members], D["Y"][members]
    fr = np.rint(t * FPS).astype(np.int64)
    order = np.argsort(fr, kind="stable")
    t, X, Y, fr = t[order], X[order], Y[order], fr[order]
    ub, start = np.unique(fr, return_index=True)
    end = np.r_[start[1:], len(fr)]
    rows = []
    for f, a, b in zip(ub, start, end):
        if b - a < n_min:
            continue
        tt = t[a]
        # équipe noire : défend la droite (X > 0) en 1re période (NOIR_OWN_RIGHT_H1) ; l'équipe claire l'inverse. Après la coupure, tout est inversé.
        own_right = ((team == 0) == (tt < HALF_CUT_S)) == NOIR_OWN_RIGHT_H1
        d = (L_HALF - X[a:b]) if own_right else (X[a:b] + L_HALF)             # distance à sa propre ligne de but (m)
        rows.append((tt, d.mean(), Y[a:b].max() - Y[a:b].min(), d.max() - d.min(), b - a, d.std(), Y[a:b].std(), d.min(), d.max()))
    return np.array(rows)


if __name__ == "__main__":
    D = load_measurements()
    pickle.dump(D, open(T.OUT / "match" / "meas_team.pkl", "wb"))
    for team, name in ((0, "noir"), (1, "clair")):
        m = team_members(D, team)
        fr = np.rint(D["t"][m] * FPS).astype(np.int64)
        cnt = np.bincount(fr, minlength=int(D["t"].max() * FPS) + 2)
        h = np.bincount(cnt[cnt > 0], minlength=13)
        S = shape_series(D, m, team)
        print(f"{name} : {len(m)} mesures retenues ; joueurs de champ par image : moyenne {cnt[cnt > 0].mean():.2f} ; répartition {[round(100 * x / h.sum(), 1) for x in h[:12]]} %")
        if len(S) == 0:
            print(f"   images avec >= {N_MIN} joueurs : 0 (0 % du match) — classement d'équipe trop peu sûr pour cette équipe sur ce match, forme non calculable")
        else:
            print(f"   images avec >= {N_MIN} joueurs : {len(S)} ({100 * len(S) / (D['t'].max() * FPS):.0f} % du match)  hauteur {S[:, 1].mean():.1f} m  largeur {S[:, 2].mean():.1f} m  profondeur {S[:, 3].mean():.1f} m")
