"""Calage d'un objectif fisheye brut (projection équidistante, panorama.fisheye_model.FisheyeModel)
à partir de LIGNES tracées à plusieurs points (outil calib_click_2cam.html) -- pas des repères
ponctuels : sur une image fisheye brute, un seul clic de coin est peu fiable (ligne très courbée,
coin ambigu à l'œil), donc Gregory trace chaque ligne du terrain avec plusieurs points le long de
sa courbe réelle, et on ajuste le modèle pour que la ligne PROJETÉE passe au plus près de ces points
-- même principe que calibrate3.py (observations/lines), mais ici les points viennent d'un tracé
manuel (image jamais filtrée automatiquement) et non d'une détection de peinture automatique.

Contrairement à calibrate3.py (pensé pour le panorama déjà assemblé par Veo, PanoramaModel2), ce
module calibre UN objectif fisheye brut à la fois -- le fichier transcode contient 2 objectifs
empilés (A en haut, B en bas), chacun nécessite son propre calage, à lancer séparément.

Usage :
  python -m panorama.calibrate_fisheye lignes.json A video-pipeline/output/panorama_pmrc_lensA
  python -m panorama.calibrate_fisheye lignes.json B video-pipeline/output/panorama_pmrc_lensB

lignes.json : export de l'outil de clics, forme {"A": {"cle_ligne": {"points": [[u,v], ...]}, ...}, "B": {...}}
Les 18 lignes et leurs tracés réels (pitch_lines) doivent rester cohérents avec calib_click_2cam.html.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama.fisheye_model import FisheyeModel

G, H = 50.55, 32.55  # demi-longueur / demi-largeur du terrain (101.1 x 65.1 m, déjà établies pour ce match)

BOUNDS = dict(
    Xc=(-70, 70), Yc=(-50, 50), Zc=(2, 20),
    yaw=(-np.pi, np.pi), pitch=(-np.pi, np.pi), roll=(-np.pi, np.pi),
    f=(150, 2500), u0=(0, 4096), v0=(0, 4096), k1=(-1.2, 1.2),
)
ORDER = ["Xc", "Yc", "Zc", "yaw", "pitch", "roll", "f", "u0", "v0", "k1"]

# Vecteur d'OPTIMISATION : yaw remplacé par (cy, sy) = (cos, sin) -- une caméra postée près d'un
# bout du terrain (notre cas : chaque objectif regarde vers l'autre bout) a un yaw réel proche de
# +-pi, pile la coupure de l'angle borné -- piege trouve en testant (cf. historique du fichier) :
# l'optimiseur restait bloque juste a cote de -pi/+pi au lieu de converger. (cy, sy) n'a pas de
# coupure ; l'angle est retrouve par atan2 seulement a la toute fin, dans model_from_opt().
ORDER_OPT = ["Xc", "Yc", "Zc", "cy", "sy", "pitch", "roll", "f", "u0", "v0", "k1"]
BOUNDS_OPT = dict(BOUNDS, cy=(-1.3, 1.3), sy=(-1.3, 1.3))
del BOUNDS_OPT["yaw"]


def model_from_opt(z):
    Xc, Yc, Zc, cy, sy, pitch, roll, f, u0, v0, k1 = z
    return FisheyeModel(Xc, Yc, Zc, np.arctan2(sy, cy), pitch, roll, f, u0, v0, k1)


def pitch_lines(G=G, H=H):
    """Même 18 lignes que calib_click_2cam.html (à garder cohérent si l'une des deux évolue) :
    échantillon dense (X, Y) le long du tracé réel de chaque ligne du terrain."""
    s = np.linspace
    lines = {
        "touche_proche": np.c_[s(-G, G, 400), np.full(400, H)],
        "touche_lointaine": np.c_[s(-G, G, 400), np.full(400, -H)],
        "mediane": np.c_[np.zeros(300), s(-H, H, 300)],
        "cercle": np.c_[9.15 * np.cos(s(0, 2 * np.pi, 300)), 9.15 * np.sin(s(0, 2 * np.pi, 300))],
    }
    for sg, n in ((-1, "G"), (1, "D")):
        xb, xa, xg = sg * G, sg * (G - 16.5), sg * (G - 5.5)
        lines[f"but_{n}"] = np.c_[np.full(300, xb), s(-H, H, 300)]
        lines[f"surf_rep_avant_{n}"] = np.c_[np.full(200, xa), s(-20.16, 20.16, 200)]
        lines[f"surf_rep_cote_p_{n}"] = np.c_[s(xb, xa, 150), np.full(150, 20.16)]
        lines[f"surf_rep_cote_l_{n}"] = np.c_[s(xb, xa, 150), np.full(150, -20.16)]
        lines[f"surf_but_avant_{n}"] = np.c_[np.full(100, xg), s(-9.16, 9.16, 100)]
        lines[f"surf_but_cote_p_{n}"] = np.c_[s(xb, xg, 80), np.full(80, 9.16)]
        lines[f"surf_but_cote_l_{n}"] = np.c_[s(xb, xg, 80), np.full(80, -9.16)]
    return lines


def line_constraint(key, ideal_pts):
    """('X'|'Y'|'circle', valeur) déduit des points déjà générés par pitch_lines -- pas besoin de
    redupliquer axis/value, l'axe constant de la ligne les porte déjà."""
    if key == "cercle":
        return "circle", 9.15
    xs, ys = ideal_pts[:, 0], ideal_pts[:, 1]
    return ("X", float(xs[0])) if np.std(xs) < 1e-6 else ("Y", float(ys[0]))


def fast_unproject(m, uv):
    """Comme FisheyeModel.unproject, mais theta = r/f direct (k1 ignoré, donc pas de boucle de
    Newton) -- approximation volontaire réservée à l'étape 1 de fit() (trouver le bon bassin, pas
    la précision finale) : unproject() fait une boucle Python de 50 itérations par appel, bien trop
    coûteux répété des dizaines de milliers de fois dans un ajustement à départs multiples."""
    uv = np.asarray(uv, float)
    u, v = uv[:, 0] - m.u0, uv[:, 1] - m.v0
    r = np.hypot(u, v)
    theta = np.clip(r / max(m.f, 1e-6), 0, 0.97 * np.pi - 1e-4)
    safe_r = np.where(r > 1e-9, r, 1.0)
    dir_cam = np.stack([np.sin(theta) * u / safe_r, np.sin(theta) * v / safe_r, np.cos(theta)], axis=1)
    dir_world = dir_cam @ m.R
    denom = np.where(np.abs(dir_world[:, 2]) > 1e-9, dir_world[:, 2], 1e-9)
    D = dir_world * (m.Zc / denom)[:, None]
    return np.stack([D[:, 0] + m.Xc, D[:, 1] + m.Yc], axis=1)


def make_fast_residuals(todo, constraints):
    """Étape 1 (nombreux redémarrages) : contrainte en MÈTRES via fast_unproject(), pas de cKDTree
    -- reconstruire un arbre par ligne et par évaluation, répété des dizaines de milliers de fois,
    est beaucoup trop coûteux. Moins précis que l'étape 2, mais ça n'a besoin que de trouver le bon
    bassin (k1 ignoré ici, affiné seulement à l'étape 2)."""
    def residuals(x):
        m = model_from_opt(x)
        out = []
        for key, pts in todo.items():
            XY = fast_unproject(m, pts)
            kind, val = constraints[key]
            if kind == "circle":
                out.append(np.hypot(XY[:, 0], XY[:, 1]) - val)
            elif kind == "X":
                out.append(XY[:, 0] - val)
            else:
                out.append(XY[:, 1] - val)
        return np.concatenate(out)
    return residuals


def make_precise_residuals(todo, ideal):
    """Étape 2 (un seul ajustement, à partir du meilleur résultat de l'étape 1) : vraie distance en
    PIXELS entre le point cliqué et la ligne idéale projetée (même principe que calibrate3.py)."""
    def residuals(x):
        m = model_from_opt(x)
        out = []
        for key, pts in todo.items():
            proj = m.project(ideal[key])
            d, _ = cKDTree(proj).query(pts)
            out.append(d / np.sqrt(max(1.0, len(pts) / 4.0)))
        return np.concatenate(out)
    return residuals


def fit(lines_clicked, img_w, img_h, n_starts=250, seed=0):
    """lines_clicked : {cle_ligne: {"points": [[u,v], ...]}}, au moins ~6 lignes avec >=2 points.
    Retourne (FisheyeModel, {cle_ligne: residus_px array}, nb_points_total).

    Deux étapes, comme calibrate3.py (jamais l'ajustement complet répété à chaque redémarrage,
    beaucoup trop coûteux avec un cKDTree par ligne et par évaluation) : 1) beaucoup de départs
    aléatoires sur une version allégée des lignes (peu de points par ligne) pour trouver le bon
    bassin ; 2) un seul ajustement fin, complet, à partir du meilleur résultat de l'étape 1."""
    ideal_fine = pitch_lines()
    todo = {k: np.array(v["points"], float) for k, v in lines_clicked.items() if len(v["points"]) >= 2 and k in ideal_fine}
    n_total = sum(len(v) for v in todo.values())
    if n_total < 12 or len(todo) < 5:
        raise SystemExit(f"Pas assez de données : {len(todo)} lignes exploitables, {n_total} points -- tracer davantage de lignes avec >= 2 points.")
    constraints = {k: line_constraint(k, ideal_fine[k]) for k in todo}
    resid_fast = make_fast_residuals(todo, constraints)

    rng = np.random.default_rng(seed)
    lo = np.array([BOUNDS_OPT[k][0] for k in ORDER_OPT])
    hi = np.array([BOUNDS_OPT[k][1] for k in ORDER_OPT])
    best = None
    for _ in range(n_starts):
        yaw0 = rng.uniform(-np.pi, np.pi)
        x0 = np.array([
            rng.uniform(-40, 40), rng.uniform(-30, 30), rng.uniform(4, 12),
            np.cos(yaw0), np.sin(yaw0), rng.uniform(-1.6, 0.0), rng.uniform(-0.3, 0.3),
            rng.uniform(300, 1200), rng.uniform(0.3, 0.7) * img_w, rng.uniform(0.3, 0.7) * img_h,
            rng.uniform(-0.3, 0.3),
        ])
        try:
            sol = least_squares(resid_fast, x0, bounds=(lo, hi), loss="soft_l1", f_scale=2.0, max_nfev=200, x_scale="jac")
        except Exception:
            continue
        if best is None or sol.cost < best.cost:
            best = sol
    if best is None:
        raise SystemExit("Aucun ajustement n'a convergé -- vérifier les données (lignes cohérentes, pas de point aberrant).")

    resid_fine = make_precise_residuals(todo, ideal_fine)
    sol2 = least_squares(resid_fine, best.x, bounds=(lo, hi), loss="soft_l1", f_scale=8.0, max_nfev=3000, x_scale="jac")
    sol3 = least_squares(resid_fine, sol2.x, bounds=(lo, hi), loss="linear", max_nfev=1000, x_scale="jac")  # polissage final, sans repondération robuste
    m = model_from_opt(sol3.x if sol3.cost <= sol2.cost else sol2.x)
    per_line = {}
    for key, pts in todo.items():
        proj = m.project(ideal_fine[key])
        d, _ = cKDTree(proj).query(pts)
        per_line[key] = d
    return m, per_line, n_total


def main(lignes_path, lens, out_dir):
    data = json.load(open(lignes_path))[lens]
    img_w, img_h = 2048, 1024  # un objectif = moitié du cadre carre 2048x2048 (haut ou bas)
    m, per_line, n_total = fit(data, img_w, img_h)
    all_err = np.concatenate(list(per_line.values()))
    print(f"objectif {lens} : {len(per_line)} lignes, {n_total} points -- écart médian {np.median(all_err):.1f} px, max {all_err.max():.1f} px")
    for key, d in sorted(per_line.items(), key=lambda kv: -kv[1].max()):
        print(f"  {key:22s} n={len(d):3d}  médiane {np.median(d):5.2f} px  max {d.max():6.2f} px")
    print("  un écart > 8 px médian sur une ligne suggère un tracé imprécis ou une ligne mal identifiée")
    print("  paramètres :", {k: round(float(v), 4) for k, v in zip(ORDER, m.to_dict().values())})
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    m.to_json(out / "calibration_fisheye.json")
    print("->", out / "calibration_fisheye.json")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
