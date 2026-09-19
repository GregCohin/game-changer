"""Classement d'équipe de chaque mesure de piste : noir (notre équipe), clair (adversaire) ou autre (gardien, arbitre...).

Modèle : régression logistique multiclasse sur les descripteurs de teamfeat (luminosité du maillot mesurée par rapport à
l'herbe voisine + part de pixels verts / rouges / bleus / blancs), entraînée sur des vignettes étiquetées à l'œil
(output/panorama/teamlabel/). Les décisions sont lissées le long de la piste, et rejetées quand la probabilité < seuil.
"""
import json
import pickle
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama import teamfeat as TF

LABELS = ["noir", "clair", "autre"]
CLASS_OF = {"K": 0, "W": 1, "G": 2, "R": 2}
MODEL_PATH = T.OUT / "team_model.json"
L2 = 2.0


def fit(X, y, l2=L2):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = np.c_[np.ones(len(X)), (X - mu) / sd]
    Y = np.eye(3)[y]

    def f(w):
        W = w.reshape(Z.shape[1], 3)
        S = Z @ W
        S -= S.max(1, keepdims=True)
        P = np.exp(S)
        P /= P.sum(1, keepdims=True)
        loss = -np.log(P[np.arange(len(y)), y] + 1e-12).sum() + 0.5 * l2 * (W[1:] ** 2).sum()
        g = Z.T @ (P - Y)
        g[1:] += l2 * W[1:]
        return loss, g.ravel()

    r = minimize(f, np.zeros(Z.shape[1] * 3), jac=True, method="L-BFGS-B", options={"maxiter": 1000})
    return dict(mu=mu.tolist(), sd=sd.tolist(), W=r.x.reshape(Z.shape[1], 3).tolist(), names=TF.FEATURE_NAMES, l2=l2, n=len(X))


def proba(model, X):
    X = np.asarray(X, float)
    out = np.full((len(X), 3), np.nan)
    ok = ~np.isnan(X).any(1)
    if ok.any():
        Z = np.c_[np.ones(ok.sum()), (X[ok] - np.array(model["mu"])) / np.array(model["sd"])]
        S = Z @ np.array(model["W"])
        S -= S.max(1, keepdims=True)
        P = np.exp(S)
        out[ok] = P / P.sum(1, keepdims=True)
    return out


def training_set():
    items = json.load(open(T.OUT / "teamlabel" / "echantillon_etiquete.json"))
    rows = pickle.load(open(T.OUT / "teamlabel" / "feat240.pkl", "rb"))
    idx = [i for i, it in enumerate(items) if it["label"] in CLASS_OF and rows[i] is not None]
    return np.array([rows[i] for i in idx], float), np.array([CLASS_OF[items[i]["label"]] for i in idx])


def smooth(t, P, half_s=2.0, gap_s=0.6):
    """Moyenne des probabilités sur ±half_s secondes, dans la même séquence continue (trou <= gap_s) ; lignes sans descripteur ignorées."""
    n = len(t)
    out = np.full_like(P, np.nan)
    brk = np.r_[0, np.where(np.diff(t) > gap_s)[0] + 1, n]
    for a, b in zip(brk[:-1], brk[1:]):
        tt, PP = t[a:b], P[a:b]
        ok = ~np.isnan(PP[:, 0])
        cs = np.vstack([np.zeros(3), np.cumsum(np.where(ok[:, None], PP, 0), 0)])
        cn = np.r_[0, np.cumsum(ok)]
        lo = np.searchsorted(tt, tt - half_s, "left")
        hi = np.searchsorted(tt, tt + half_s, "right")
        cnt = cn[hi] - cn[lo]
        with np.errstate(invalid="ignore", divide="ignore"):
            out[a:b] = np.where(cnt[:, None] > 0, (cs[hi] - cs[lo]) / cnt[:, None], np.nan)
    return out


def decide(P, thr=0.9):
    """0 noir, 1 clair, 2 autre, -1 sans décision."""
    lab = np.full(len(P), -1)
    ok = ~np.isnan(P[:, 0])
    best = np.nanargmax(np.where(np.isnan(P), -1, P), 1)
    sure = ok & (P[np.arange(len(P)), best] >= thr)
    lab[sure] = best[sure]
    return lab


def load_model():
    return json.load(open(MODEL_PATH))


if __name__ == "__main__":
    X, y = training_set()
    m = fit(X, y)
    json.dump(m, open(MODEL_PATH, "w"))
    P = proba(m, X)
    print(f"modèle entraîné sur {len(X)} vignettes (noir {int((y == 0).sum())}, clair {int((y == 1).sum())}, autre {int((y == 2).sum())}) -> {MODEL_PATH.name}")
    print("exactitude sur l'entraînement (optimiste) :", round(float((P.argmax(1) == y).mean()), 3))
