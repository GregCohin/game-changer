"""Charge physique d'équipe : distance, haute intensité et sprint par joueur de champ et par minute suivie, équipe noire (la nôtre) contre équipe claire.

Aucune identité de joueur. Méthode :
- l'équipe est décidée PAR PISTE (probabilité moyenne de teamclass sur toute la piste >= TRACK_THR), hors gardiens, hors arbitres, sur le terrain. Un seuil par
  mesure fausserait le résultat : la confiance du classement dépend de la posture, les mesures très sûres sont nettement plus lentes que les autres
  (l'adversaire passait de 79 à 128 m/min selon la bande de confiance) ;
- la vitesse vient du lissage de Kalman / Rauch-Tung-Striebel de chaque tronçon continu (track.kf_smooth, réglage FINAL) ; les instants proches d'un contact
  et les bords incertains d'un tronçon sont écartés ;
- un pas peut enjamber des images manquantes (jusqu'à MAX_GAP_S) : les moments rapides perdent plus souvent des images (jusqu'à 28 % contre 2 % à faible
  vitesse), garder seulement les pas contigus sous-estimerait la haute intensité d'environ 13 % ;
- les taux sont rapportés au TEMPS RÉELLEMENT MESURÉ (somme des pas retenus), jamais à la durée du match ; la part du temps-joueur mesurée est donnée
  à côté (10 joueurs de champ x durée) ; fourchette = rééchantillonnage de blocs de 5 min ; marge de méthode = dispersion sur les variantes de réglage.

Usage : python -m panorama.teamload       # plusieurs minutes ; écrit output/panorama/resultat_charge_detail.json, repris par python -m panorama.teamreport
"""
import pickle
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from metrics import SPRINT_SPEED_MS, HIGH_INTENSITY_SPEED_MS, SPRINT_MIN_DURATION_S
from panorama import teamshape as S
from panorama import track as T

MATCH = T.OUT / "match"
FPS = 10.0
MAX_GAP_S = 0.6                      # un pas peut enjamber des images manquantes jusqu'à la limite d'un tronçon (track.segments)
STEP_MAX_S = 1.5 / FPS               # variante stricte (sensibilité seulement) : un pas n'est retenu que si deux mesures se suivent, sans image manquante


def measurements_with_rho():
    """Mesures de tout le match en vrais mètres (calage v2) avec la distance à la caméra (rho) que le lissage de Kalman utilise."""
    from panorama.reproject import convert                            # charge les deux calages : importé ici pour que le reste du module se teste sans données
    D = pickle.load(open(MATCH / "meas_team_v2.pkl", "rb"))
    old = pickle.load(open(MATCH / "meas_team.pkl", "rb"))            # mêmes mesures, ancien repère
    X, Y, rho = convert(old["X"], old["Y"])
    assert np.array_equal(old["t"], D["t"]) and np.array_equal(old["tid"], D["tid"]) and np.allclose(X, D["X"]) and np.allclose(Y, D["Y"])
    D["rho"] = rho
    return D


def tracklet_contacts(D):
    """Instants de contact (deux pistes vivantes à moins de track.CONTACT_M) de chaque piste de D, dans l'ordre des indices de piste."""
    by_id = {}
    for k in range(20):
        for rec in pickle.load(open(MATCH / f"trk2_{k:03d}.pkl", "rb"))["tracks"]:
            if len(rec["meas"]) >= 8:
                by_id[f'{rec["chunk"]}-{rec["id"]}'] = np.array(sorted(set(rec["contacts"])), float)
    return [by_id[tk["id"]] for tk in D["tracklets"]]


def kinematics(D, params=None, contact_margin=T.CONTACT_MARGIN_S, restrict=None):
    """Lissage de chaque tronçon continu de chaque piste. Retourne des tableaux alignés sur les mesures de D (NaN hors tronçon exploitable) :
    xs, ys (position lissée), vx, vy (vitesse lissée), sigv (incertitude de vitesse), seg (numéro de tronçon, -1 hors tronçon), okc (aucun contact à moins de contact_margin s)."""
    params = params or T.FINAL
    n = len(D["t"])
    out = {k: np.full(n, np.nan) for k in ("xs", "ys", "vx", "vy", "sigv")}
    out["seg"] = np.full(n, -1, np.int64)
    out["okc"] = np.zeros(n, bool)
    contacts = tracklet_contacts(D)
    tid = D["tid"]
    starts = np.r_[0, np.where(np.diff(tid) > 0)[0] + 1]
    ends = np.r_[starts[1:], n]
    seg_id = 0
    for a, b in zip(starts, ends):
        if b - a < 8 or (restrict is not None and not restrict[a:b].any()):
            continue
        c = contacts[tid[a]]
        meas = [(D["t"][i], D["X"][i], D["Y"][i], D["rho"][i], i) for i in range(a, b)]
        for sg in T.segments(meas):
            idx = np.array([m[4] for m in sg])
            ts, xs, Ps = T.kf_smooth([m[:4] for m in sg], params)
            out["xs"][idx], out["ys"][idx] = xs[:, 0], xs[:, 1]
            out["vx"][idx], out["vy"][idx] = xs[:, 2], xs[:, 3]
            out["sigv"][idx] = np.sqrt(np.maximum(Ps[:, 2, 2], Ps[:, 3, 3]))
            out["seg"][idx] = seg_id
            out["okc"][idx] = True if len(c) == 0 else np.array([np.min(np.abs(c - t)) > contact_margin for t in ts])
            seg_id += 1
    return out


def track_probabilities(D):
    """Probabilité moyenne (noir, clair) d'appartenance à une équipe de chaque piste, sur toutes ses mesures classées."""
    tid, n = D["tid"], len(D["tracklets"])
    out = []
    for key in ("PN", "PW"):
        P = D[key]
        ok = ~np.isnan(P)
        out.append(np.bincount(tid[ok], weights=P[ok], minlength=n) / np.maximum(1, np.bincount(tid[ok], minlength=n)))
    return out


def member_masks(D, thr=0.8, gk_max=S.GK_SHARE_MAX, autre_max=S.AUTRE_MAX):
    """Masques booléens (équipe noire, équipe claire) des mesures retenues pour la charge physique.

    L'équipe est décidée PAR PISTE (probabilité moyenne sur toute la piste >= thr), pas mesure par mesure : la confiance du classement
    d'une mesure dépend de la posture et de la vitesse (les mesures sûres à >= 99 % sont nettement plus lentes que les autres), donc un seuil
    par mesure surreprésenterait les moments lents et fausserait la charge. Sont écartés : gardiens et arbitres (part de détections
    « gardien » >= gk_max, probabilité moyenne « autre » >= autre_max) et toute mesure hors des lignes du terrain."""
    PN, PW = track_probabilities(D)
    tk = D["tracklets"]
    gk = np.array([x["gk"] for x in tk])
    pa = np.array([x["pa"] for x in tk])
    field = (gk < gk_max) & ~(pa >= autre_max)
    inside = (np.abs(D["X"]) <= S.L_HALF + S.PITCH_MARGIN) & (D["Y"] >= S.Y_FAR - S.PITCH_MARGIN) & (D["Y"] <= S.Y_NEAR + S.PITCH_MARGIN)
    return [(P >= thr)[D["tid"]] & field[D["tid"]] & inside for P in (PN, PW)]


def team_steps(D, K, member, sigv_max=T.EDGE_SIGMA_V, step_max_s=MAX_GAP_S):
    """Pas de 0,1 s retenus pour une équipe : deux mesures consécutives du même tronçon, toutes deux de l'équipe, hors contacts et hors bords incertains.
    Retourne les indices de début de pas (i), l'instant, la durée, la distance lissée et la vitesse."""
    t, seg = D["t"], K["seg"]
    use = member & (seg >= 0) & K["okc"] & (K["sigv"] < sigv_max)
    i = np.where(use[:-1] & use[1:] & (seg[:-1] == seg[1:]) & (t[1:] - t[:-1] <= step_max_s + 1e-9))[0]
    dt = t[i + 1] - t[i]
    dist = np.hypot(K["xs"][i + 1] - K["xs"][i], K["ys"][i + 1] - K["ys"][i])
    return {"i": i, "t": t[i], "dt": dt, "dist": dist, "v": dist / dt}


def _runs(mask):
    """(début, fin exclus) des séquences vraies consécutives d'un tableau booléen."""
    if not mask.any():
        return []
    d = np.diff(np.r_[0, mask.astype(int), 0])
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def sprint_starts(st, sprint=SPRINT_SPEED_MS, min_s=SPRINT_MIN_DURATION_S):
    """Position (dans st) du premier pas de chaque sprint : pas consécutifs (indices qui se suivent) à vitesse >= sprint pendant au moins min_s secondes."""
    if len(st["i"]) == 0:
        return []
    broken = np.r_[True, np.diff(st["i"]) != 1]                        # un trou d'échantillons coupe la séquence
    starts = []
    for a, b in _runs(st["v"] >= sprint):
        cut = np.where(broken[a:b])[0]
        for piece in np.split(np.arange(a, b), cut[cut > 0]):
            if len(piece) and st["dt"][piece].sum() >= min_s - 1e-6:
                starts.append(piece[0])
    return starts


def block_sums(st, block_ids, n_blocks, hi=HIGH_INTENSITY_SPEED_MS, sprint=SPRINT_SPEED_MS):
    """Sommes par bloc de temps : [secondes, distance, distance >= hi, distance >= sprint, secondes >= hi, secondes >= sprint, sprints]."""
    out = np.zeros((n_blocks, 7))
    b = block_ids(st["t"])
    for j, col in enumerate((st["dt"], st["dist"], st["dist"] * (st["v"] >= hi), st["dist"] * (st["v"] >= sprint), st["dt"] * (st["v"] >= hi), st["dt"] * (st["v"] >= sprint))):
        out[:, j] = np.bincount(b, weights=col, minlength=n_blocks)
    for k in sprint_starts(st, sprint):
        out[b[k], 6] += 1
    return out


def rates(s):
    """Taux par joueur et par minute mesurée à partir d'un vecteur de sommes (voir block_sums)."""
    sec = s[0]
    if sec <= 0:
        return None
    m = 60.0 / sec
    return {"seconds": sec, "distance_m_min": s[1] * m, "hi_m_min": s[2] * m, "sprint_m_min": s[3] * m,
            "hi_time_share": s[4] / sec, "sprint_time_share": s[5] / sec, "sprints_per_min": s[6] * m}


def rate_columns(s):
    """Taux par joueur et par minute mesurée, pour un vecteur de sommes (voir block_sums) ou un tableau de tels vecteurs (dernier axe)."""
    sec = np.asarray(s)[..., 0]
    m = np.where(sec > 0, 60.0 / np.maximum(sec, 1e-9), np.nan)
    return {"seconds": sec, "distancePerMin": s[..., 1] * m, "hiPerMin": s[..., 2] * m, "sprintPerMin": s[..., 3] * m,
            "hiTimeShare": s[..., 4] / np.maximum(sec, 1e-9), "sprintTimeShare": s[..., 5] / np.maximum(sec, 1e-9), "sprintsPerMin": s[..., 6] * m}


BLOCK_S = 300.0                        # blocs de 5 min pour le rééchantillonnage (le temps est corrélé)
HALF2_OFFSET = 100                     # les blocs de la 2e mi-temps sont numérotés à partir de 100
N_BLOCKS = 120
BOOT = 4000
N_OUTFIELD = 10                        # joueurs de champ d'une équipe : base de la part de temps-joueur mesurée
METRICS = ("distancePerMin", "hiPerMin", "sprintPerMin")


def block_index(t):
    return np.floor(np.asarray(t) / BLOCK_S).astype(int) + HALF2_OFFSET * (np.asarray(t) >= S.HALF_CUT_S)


def team_block_sums(D, K, mem, **kw):
    """Sommes par bloc de temps pour chaque équipe : [noir, clair] (voir block_sums)."""
    return [block_sums(team_steps(D, K, mem[k], **kw), block_index, N_BLOCKS) for k in (0, 1)]


def period_blocks(bs, period):
    have = (bs[0][:, 0] + bs[1][:, 0]) > 0
    ids = np.arange(N_BLOCKS)
    return ids[have & {"match": ids >= 0, "half1": ids < HALF2_OFFSET, "half2": ids >= HALF2_OFFSET}[period]]


def period_seconds(D, period):
    end = float(D["t"].max())
    return {"match": end, "half1": S.HALF_CUT_S, "half2": end - S.HALF_CUT_S}[period]


def _num(x, digits=1):
    """Nombre arrondi, ou None si non fini (le JSON du site n'accepte pas NaN)."""
    return round(float(x), digits) if np.isfinite(x) else None


def _ci(x):
    x = np.asarray(x)[np.isfinite(x)]
    if len(x) == 0:
        return None
    lo, hi = np.percentile(x, [2.5, 97.5])
    return [round(float(lo), 1), round(float(hi), 1)]


def summarize(D, bs, period, seed=1):
    """Taux des deux équipes sur une période, avec l'IC 95 % obtenu en rééchantillonnant les blocs de 5 min, et l'écart nous / adversaire (%).
    None si aucun bloc de la période n'a de mesure (vidéo partielle)."""
    blocks = period_blocks(bs, period)
    if len(blocks) == 0:
        return None
    est = [rate_columns(b[blocks].sum(0)) for b in bs]
    draws = np.random.default_rng(seed).integers(0, len(blocks), (BOOT, len(blocks)))
    with np.errstate(invalid="ignore", divide="ignore"):                    # une équipe sans aucun sprint sur une période : rapport indéfini -> None
        boot = [rate_columns(b[blocks][draws].sum(axis=1)) for b in bs]
        out = {}
        nominal = N_OUTFIELD * period_seconds(D, period)
        for name, e, bt in (("ours", est[0], boot[0]), ("opponent", est[1], boot[1])):
            out[name] = {**{k: _num(e[k]) for k in METRICS}, "sprintsPer10Min": _num(e["sprintsPerMin"] * 10, 2),
                         "hiTimeShare": _num(e["hiTimeShare"], 4), "sprintTimeShare": _num(e["sprintTimeShare"], 4),
                         "measuredPlayerMin": _num(e["seconds"] / 60), "coverage": _num(e["seconds"] / nominal, 3),
                         "ci95": {k: _ci(bt[k]) for k in METRICS}}
        out["diffPct"] = {k: _num((est[0][k] / est[1][k] - 1) * 100) for k in METRICS}
        out["diffPct"]["ci95"] = {k: _ci((boot[0][k] / boot[1][k] - 1) * 100) for k in METRICS}
    return out


PERIODS = ("match", "half1", "half2")


def load_report(D, bs):
    rep = {p: summarize(D, bs, p) for p in PERIODS}
    return {p: r for p, r in rep.items() if r is not None}


def half_change(bs, seed=1):
    """Évolution de la 1re à la 2e mi-temps (%) de chaque équipe, et écart entre les deux évolutions (nous par rapport à l'adversaire), avec IC 95 %.
    Les blocs de 5 min sont rééchantillonnés séparément dans chaque mi-temps et de façon appariée entre les deux équipes : le rythme de jeu commun
    (arrêts, temps forts) s'annule dans l'écart, bien plus précis que chaque évolution prise seule. None si une mi-temps n'a aucune mesure."""
    halves = [period_blocks(bs, "half1"), period_blocks(bs, "half2")]
    if any(len(h) == 0 for h in halves):
        return None
    rng = np.random.default_rng(seed)
    draws = [rng.integers(0, len(h), (BOOT, len(h))) for h in halves]                 # mêmes tirages pour les deux équipes
    est = [[rate_columns(b[h].sum(0)) for b in bs] for h in halves]
    boot = [[rate_columns(b[h][d].sum(axis=1)) for b in bs] for h, d in zip(halves, draws)]
    out = {"ours": {}, "opponent": {}, "relative": {}}
    with np.errstate(invalid="ignore", divide="ignore"):
        for k in METRICS:
            change = [(est[1][t][k] / est[0][t][k] - 1) * 100 for t in (0, 1)]
            boot_change = [(boot[1][t][k] / boot[0][t][k] - 1) * 100 for t in (0, 1)]
            relative = ((1 + change[0] / 100) / (1 + change[1] / 100) - 1) * 100
            boot_relative = ((1 + boot_change[0] / 100) / (1 + boot_change[1] / 100) - 1) * 100
            for name, v, bv in (("ours", change[0], boot_change[0]), ("opponent", change[1], boot_change[1]), ("relative", relative, boot_relative)):
                out[name][k] = {"value": _num(v), "ci95": _ci(bv)}
    return out


def corner_zone(D, radius=12.0):
    """Mesures à moins de `radius` m d'un poteau de corner : le calage y est le moins sûr."""
    return np.hypot(np.abs(D["X"]) - S.L_HALF, np.abs(D["Y"]) - S.Y_NEAR) < radius


def sensitivity(D, K, mem, restrict):
    """Charge de match entier selon les réglages du classement, du lissage, des contacts et de la sélection des pas ; pour chaque variante : nous, adversaire, écart (%)."""
    def row(bs):
        blocks = period_blocks(bs, "match")
        e = [rate_columns(b[blocks].sum(0)) for b in bs]
        r = {"ours": {k: round(float(e[0][k]), 1) for k in METRICS}, "opponent": {k: round(float(e[1][k]), 1) for k in METRICS}}
        r["ours"]["measuredPlayerMin"], r["opponent"]["measuredPlayerMin"] = round(float(e[0]["seconds"]) / 60), round(float(e[1]["seconds"]) / 60)
        r["diffPct"] = {k: round(float((e[0][k] / e[1][k] - 1) * 100), 1) for k in METRICS}
        halves = [period_blocks(bs, "half1"), period_blocks(bs, "half2")]
        if all(len(h) for h in halves):                                               # évolution 1re -> 2e mi-temps de nous par rapport à l'adversaire
            a = [[rate_columns(b[h].sum(0)) for b in bs] for h in halves]
            with np.errstate(invalid="ignore", divide="ignore"):
                r["halfRelative"] = {k: _num(((a[1][0][k] / a[0][0][k]) / (a[1][1][k] / a[0][1][k]) - 1) * 100) for k in METRICS}
        return r

    out = {"base": row(team_block_sums(D, K, mem))}
    for thr in (0.6, 0.7, 0.9):
        out[f"appartenance de piste >= {thr}"] = row(team_block_sums(D, K, member_masks(D, thr=thr)))
    out["pas sans image manquante (0,1 s)"] = row(team_block_sums(D, K, mem, step_max_s=STEP_MAX_S))
    out["incertitude de vitesse <= 0,5 m/s"] = row(team_block_sums(D, K, mem, sigv_max=0.5))
    zone = corner_zone(D)
    out["hors des coins (12 m)"] = row(team_block_sums(D, K, [m & ~zone for m in mem]))
    for label, params, cm in (("lissage plus souple (accélération 1,5 m/s²)", dict(T.FINAL, sig_a=1.5), T.CONTACT_MARGIN_S),
                              ("lissage plus nerveux (accélération 6 m/s²)", dict(T.FINAL, sig_a=6.0), T.CONTACT_MARGIN_S),
                              ("bruit de mesure supposé x2", dict(T.FINAL, rx=0.2, ry0=0.2, ry_slope=0.008), T.CONTACT_MARGIN_S),
                              ("bruit de mesure supposé /2", dict(T.FINAL, rx=0.05, ry0=0.05, ry_slope=0.002), T.CONTACT_MARGIN_S),
                              ("contacts : marge 0 s", None, 0.0), ("contacts : marge 2 s", None, 2.0)):
        Kv = kinematics(D, params, cm, restrict=restrict)
        out[label] = row(team_block_sums(D, Kv, mem))
    return out


TRACK_THR = 0.8                        # probabilité moyenne d'équipe sur une piste au-delà de laquelle la piste compte pour l'équipe
KMH = {"highIntensity": round(HIGH_INTENSITY_SPEED_MS * 3.6, 1), "sprint": round(SPRINT_SPEED_MS * 3.6, 1)}


def method_range_pct(sens):
    """Demi-étendue (en % de la valeur de base) des chiffres de match entier sur toutes les variantes de méthode, sauf la sélection stricte des pas
    (biais connu et de sens connu, rapporté à part). Pour l'écart nous / adversaire : demi-étendue en points de pourcentage."""
    variants = [v for k, v in sens.items() if k not in ("base", "pas sans image manquante (0,1 s)")]
    base = sens["base"]
    out = {"ours": {}, "opponent": {}}
    for team in ("ours", "opponent"):
        for k in METRICS:
            vals = [v[team][k] for v in variants] + [base[team][k]]
            out[team][k] = round(float((max(vals) - min(vals)) / 2 / base[team][k] * 100), 1)
    out["diffPoints"] = {k: round(float((max(v["diffPct"][k] for v in variants + [base]) - min(v["diffPct"][k] for v in variants + [base])) / 2), 1) for k in METRICS}
    out["halfChangePoints"] = {}
    for k in METRICS:                                                                # marge de l'évolution 1re -> 2e mi-temps (points de pourcentage)
        vals = [v["halfRelative"][k] for v in variants + [base] if v.get("halfRelative") and v["halfRelative"].get(k) is not None]
        out["halfChangePoints"][k] = round(float((max(vals) - min(vals)) / 2), 1) if vals else None
    strict = sens["pas sans image manquante (0,1 s)"]
    out["strictStepsPct"] = {k: round(float((strict["ours"][k] / base["ours"][k] - 1) * 100), 1) for k in METRICS}
    return out


def by_zone(D, K, mem):
    """Distance par minute selon la distance à la caméra (rho) : un bruit qui gonflerait la vitesse se verrait ici (elle croîtrait avec rho)."""
    rows = {}
    for team, name in ((0, "ours"), (1, "opponent")):
        st = team_steps(D, K, mem[team], step_max_s=MAX_GAP_S)
        rho = D["rho"][st["i"]]
        rows[name] = {}
        for lo, hi in ((25, 55), (55, 65), (65, 72), (72, 110)):
            s = (rho >= lo) & (rho < hi)
            rows[name][f"rho {lo}-{hi} m"] = {"distancePerMin": round(float(60 * st["dist"][s].sum() / st["dt"][s].sum()), 1), "playerMin": round(float(st["dt"][s].sum() / 60))}
    return rows


def site_block(rep, spread, half=None):
    """Bloc `team.detail.load` du fichier d'import du site (voir AdvancedAnalyticsPanel)."""
    def team_part(name):
        return {p: {"distancePerMin": rep[p][name]["distancePerMin"], "hiPerMin": rep[p][name]["hiPerMin"], "sprintPerMin": rep[p][name]["sprintPerMin"],
                    "measuredPlayerMin": rep[p][name]["measuredPlayerMin"], "coverage": rep[p][name]["coverage"], "ci95": rep[p][name]["ci95"]}
                for p in PERIODS if p in rep}

    d, h, s = (max(1, int(np.ceil(max(spread["ours"][k], spread["opponent"][k])))) for k in METRICS)
    strict = spread["strictStepsPct"]
    note = (f"Chiffres par joueur de champ suivi et par minute réellement suivie (pas par minute de match). Marge de méthode, en plus de la fourchette d'échantillonnage : "
            f"environ ±{d} % sur la distance, ±{h} % sur la haute intensité, ±{s} % sur le sprint (réglage du lissage, exclusion des contacts, classement des équipes). "
            f"Les moments rapides sont ceux où le suivi perd le plus souvent le joueur : les pas qui enjambent une image manquante sont gardés (sans eux, la haute intensité "
            f"serait sous-estimée d'environ {abs(round(strict['hiPerMin']))} %), mais un léger biais à la baisse reste possible.")
    block = {"thresholdsKmh": KMH, "note": note, "ours": team_part("ours"), "opponent": team_part("opponent"),
             "diffPct": {p: rep[p]["diffPct"] for p in PERIODS if p in rep},
             "methodPct": {"distancePerMin": d, "hiPerMin": h, "sprintPerMin": s, "diffPoints": spread["diffPoints"], "halfChangePoints": spread.get("halfChangePoints")}}
    if half is not None:
        block["halfChangePct"] = half
    return block


def main():
    import json
    D = measurements_with_rho()
    mem = member_masks(D, thr=TRACK_THR)
    low = member_masks(D, thr=0.6)
    restrict = low[0] | low[1]
    K = kinematics(D, restrict=restrict)
    bs = team_block_sums(D, K, mem)
    rep = load_report(D, bs)
    sens = sensitivity(D, K, mem, restrict)
    spread = method_range_pct(sens)
    half = half_change(bs)
    out = {"periodes": rep, "evolutionMiTemps": half, "sensibilite": sens, "etendueMethode": spread, "parDistanceCamera": by_zone(D, K, mem),
           "reglages": {"seuilPiste": TRACK_THR, "seuilHauteIntensiteMs": HIGH_INTENSITY_SPEED_MS, "seuilSprintMs": SPRINT_SPEED_MS, "sprintDureeMinS": SPRINT_MIN_DURATION_S,
                        "contactMargeS": T.CONTACT_MARGIN_S, "incertitudeVitesseMax": T.EDGE_SIGMA_V, "trouMaxS": MAX_GAP_S, "lissage": T.FINAL}}
    json.dump(out, open(T.OUT / "resultat_charge_detail.json", "w"), ensure_ascii=False, indent=1)
    for period, r in rep.items():
        print(f"{period:6s} nous {r['ours']['distancePerMin']:6.1f} m/min {r['ours']['ci95']['distancePerMin']} (HI {r['ours']['hiPerMin']}, sprint {r['ours']['sprintPerMin']}, {r['ours']['measuredPlayerMin']:.0f} min-joueur, {100 * r['ours']['coverage']:.0f} %) | "
              f"adversaire {r['opponent']['distancePerMin']:6.1f} {r['opponent']['ci95']['distancePerMin']} (HI {r['opponent']['hiPerMin']}, sprint {r['opponent']['sprintPerMin']}, {r['opponent']['measuredPlayerMin']:.0f} min-joueur, {100 * r['opponent']['coverage']:.0f} %) | écart {r['diffPct']['distancePerMin']:+.1f} % {r['diffPct']['ci95']['distancePerMin']}")
    print(json.dumps(spread, ensure_ascii=False))
    if half:
        for name in ("ours", "opponent", "relative"):
            print(f"évolution 1re -> 2e mi-temps, {name:9s} : distance {half[name]['distancePerMin']}")
    print(site_block(rep, spread, half)["note"])


if __name__ == "__main__":
    main()
