"""Chiffres d'équipe finaux (forme d'équipe) avec leur incertitude, au format du site.

Les mesures sont en mètres du modèle ; les fractions du site (0-1) les rapportent à l'étendue du terrain LUE sur les positions
des joueurs (teamshape.L_HALF, Y_FAR, Y_NEAR), pas à des dimensions supposées.

Usage : python -m panorama.teamreport      # écrit output/panorama/resultat_equipe_detail.json et resultat_equipe.json
"""
import json
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import teamshape as S
from panorama import track as T

BOOT = 3000
COLS = {"hauteur": 1, "largeur": 2, "profondeur": 3}


def series(D, team, **kw):
    m = S.team_members(D, team, **{k: v for k, v in kw.items() if k in ("thr", "max_team", "use_gk_filter", "dedup_m")})
    return S.shape_series(D, m, team, kw.get("n_min", S.N_MIN))


def block_boot(R, seed=1):
    """Moyennes (m) et IC 95 % par bootstrap sur des blocs de 5 min (le temps est corrélé)."""
    blocks = (R[:, 0] // 300).astype(int)
    ub = [b for b in np.unique(blocks) if (blocks == b).sum() >= 50]
    sums = np.array([[R[blocks == b, j].sum() for j in (1, 2, 3)] + [(blocks == b).sum()] for b in ub])
    rng = np.random.default_rng(seed)
    means = np.array([sums[p].sum(0)[:3] / sums[p].sum(0)[3] for p in (rng.integers(0, len(ub), len(ub)) for _ in range(BOOT))])
    return sums[:, :3].sum(0) / sums[:, 3].sum(), np.percentile(means, 2.5, axis=0), np.percentile(means, 97.5, axis=0)


def frac(v, L=2 * S.L_HALF, W=S.Y_NEAR - S.Y_FAR):
    return {"hauteur": v[0] / L, "largeur": v[1] / W, "profondeur": v[2] / L}


def block(R, half=None):
    if half == 1:
        R = R[R[:, 0] < S.HALF_CUT_S]
    elif half == 2:
        R = R[R[:, 0] >= S.HALF_CUT_S]
    est, lo, hi = block_boot(R)
    f, flo, fhi = frac(est), frac(lo), frac(hi)
    return {"metres": {k: round(float(est[i]), 1) for k, i in (("hauteur", 0), ("largeur", 1), ("profondeur", 2))},
            "extremes_m": {"plus_recule": round(float(R[:, 7].mean()), 1), "plus_avance": round(float(R[:, 8].mean()), 1)},
            "fraction": {k: round(float(v), 3) for k, v in f.items()},
            "ic95_fraction": {k: [round(float(flo[k]), 3), round(float(fhi[k]), 3)] for k in f},
            "images": int(len(R))}


def main():
    D = pickle.load(open(T.OUT / "match" / "meas_team_v2.pkl", "rb"))
    n_all = float(D["t"].max() * S.FPS)
    out = {"etendue_terrain": {"longueur_m": 2 * S.L_HALF, "largeur_m": S.Y_NEAR - S.Y_FAR, "touche_loin_Y": S.Y_FAR, "touche_proche_Y": S.Y_NEAR}}
    for team, name in ((0, "noir"), (1, "clair")):
        R = series(D, team)
        out[name] = {"match": block(R), "mi_temps_1": block(R, 1), "mi_temps_2": block(R, 2), "part_du_match": round(len(R) / n_all, 3)}
        full = series(D, team, n_min=10)
        v = [full[:, 1].mean(), full[:, 2].mean(), full[:, 3].mean()]
        out[name]["dix_joueurs"] = {"metres": {k: round(float(v[i]), 1) for k, i in (("hauteur", 0), ("largeur", 1), ("profondeur", 2))},
                                    "fraction": {k: round(float(x), 3) for k, x in frac(v).items()}, "part_du_match": round(len(full) / n_all, 3)}
    # sensibilité de l'équipe noire aux réglages de classement / de sélection (mètres)
    sens = {}
    for label, kw in (("seuil 0,8", dict(thr=0.8)), ("seuil 0,95", dict(thr=0.95)), (">=8 joueurs", dict(n_min=8)), (">=10 joueurs", dict(n_min=10)), ("sans dédoublonnage", dict(dedup_m=0.0))):
        R = series(D, 0, **kw)
        sens[label] = [round(float(R[:, j].mean()), 1) for j in (1, 2, 3)]
    out["sensibilite_noir_metres"] = sens
    # sensibilité aux dimensions du terrain retenues : fractions de l'équipe noire (match) pour d'autres étendues
    R = series(D, 0)
    est = [R[:, j].mean() for j in (1, 2, 3)]
    out["sensibilite_etendue_fraction"] = {f"L={L:.0f} m, l={W:.0f} m": {k: round(float(v), 3) for k, v in frac(est, L, W).items()} for L, W in ((100, 64), (105, 68), (110, 72))}
    json.dump(out, open(T.OUT / "resultat_equipe_detail.json", "w"), ensure_ascii=False, indent=1)

    ours, opp = out["noir"], out["clair"]

    def blk(b):
        return {"blockHeight": b["fraction"]["hauteur"], "width": b["fraction"]["largeur"], "depth": b["fraction"]["profondeur"],
                "blockHeightM": b["metres"]["hauteur"], "widthM": b["metres"]["largeur"], "depthM": b["metres"]["profondeur"],
                "rearM": b["extremes_m"]["plus_recule"], "frontM": b["extremes_m"]["plus_avance"]}
    team = {
        "avgBlockHeight": ours["match"]["fraction"]["hauteur"], "avgWidth": ours["match"]["fraction"]["largeur"], "avgDepth": ours["match"]["fraction"]["profondeur"], "ppda": None,
        "detail": {
            "minPlayers": S.N_MIN, "coverage": ours["part_du_match"],
            "note": "précision d'environ ±4 points ; mètres réels sur un terrain de 105 × 68 m.",
            "pitch": {"lengthM": out["etendue_terrain"]["longueur_m"], "widthM": out["etendue_terrain"]["largeur_m"], "basis": "terrain réglementaire 105 x 68 m (vue satellite du stade) ; calage vérifié contre la caméra suiveuse (pente 1,00)"},
            "ours": {"match": blk(ours["match"]), "half1": blk(ours["mi_temps_1"]), "half2": blk(ours["mi_temps_2"])},
            "opponent": {"match": blk(opp["match"]), "half1": blk(opp["mi_temps_1"]), "half2": blk(opp["mi_temps_2"]), "coverage": opp["part_du_match"]},
            "ci95": {"blockHeight": ours["match"]["ic95_fraction"]["hauteur"], "width": ours["match"]["ic95_fraction"]["largeur"], "depth": ours["match"]["ic95_fraction"]["profondeur"]},
            "fullTeam": {"blockHeight": ours["dix_joueurs"]["fraction"]["hauteur"], "width": ours["dix_joueurs"]["fraction"]["largeur"], "depth": ours["dix_joueurs"]["fraction"]["profondeur"], "coverage": ours["dix_joueurs"]["part_du_match"]},
        },
    }
    site = {"source": "Pipeline vidéo (panoramique Veo) — forme d'équipe", "importedAt": None, "players": {}, "team": team, "passNetwork": [], "preciseEvents": []}
    json.dump(site, open(T.OUT / "resultat_equipe.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
