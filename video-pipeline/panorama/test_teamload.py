"""Tests de panorama.teamload sur des données synthétiques (aucun fichier du match n'est nécessaire).

Usage (depuis video-pipeline/, venv activé) : python -m panorama.test_teamload
"""
import json

import numpy as np

from panorama import teamload as L
from panorama import track as T


def approx(a, b, tol):
    assert abs(a - b) <= tol, f"{a} != {b} (±{tol})"


# ---------------------------------------------------------------- séquences et index de blocs
assert L._runs(np.array([0, 1, 1, 0, 1], bool)) == [(1, 3), (4, 5)]
assert L._runs(np.zeros(3, bool)) == []
assert list(L.block_index(np.array([0.0, 299.9, 300.0, 2860.9, 2861.0, 5956.9]))) == [0, 0, 1, 9, 109, 119]   # la mi-temps coupe le bloc 9
assert L.N_BLOCKS > L.block_index(np.array([5956.9]))[0]


# ---------------------------------------------------------------- pas retenus (team_steps)
def fake(n=12, gap_after=None, gap=0.3):
    t = 0.1 * np.arange(n)
    if gap_after is not None:
        t[gap_after + 1:] += gap - 0.1                           # un trou de `gap` secondes après l'échantillon gap_after
    D = {"t": t}
    K = {"xs": 2.0 * t, "ys": np.zeros(n), "seg": np.zeros(n, np.int64), "okc": np.ones(n, bool), "sigv": np.full(n, 0.2)}   # 2 m/s en ligne droite
    return D, K, np.ones(n, bool)


D, K, mem = fake()
st = L.team_steps(D, K, mem)
assert len(st["i"]) == 11 and np.allclose(st["dt"], 0.1) and np.allclose(st["dist"], 0.2) and np.allclose(st["v"], 2.0)
# un trou de 0,3 s : exclu des pas stricts (0,15 s), gardé avec la tolérance par défaut ; la vitesse est celle de l'intervalle entier
D, K, mem = fake(gap_after=5, gap=0.3)
assert len(L.team_steps(D, K, mem, step_max_s=L.STEP_MAX_S)["i"]) == 10
st = L.team_steps(D, K, mem)
assert len(st["i"]) == 11
k = list(st["i"]).index(5)
approx(st["dt"][k], 0.3, 1e-9)
approx(st["v"][k], 2.0, 1e-9)
# un trou plus long que la tolérance coupe
D, K, mem = fake(gap_after=5, gap=0.8)
assert len(L.team_steps(D, K, mem)["i"]) == 10
# les deux extrémités doivent être valides : équipe, contact, incertitude de vitesse, tronçon
for name, patch in (("équipe", lambda D, K, m: m.__setitem__(4, False)), ("contact", lambda D, K, m: K["okc"].__setitem__(4, False)),
                    ("incertitude", lambda D, K, m: K["sigv"].__setitem__(4, 1.0)), ("tronçon", lambda D, K, m: K["seg"].__setitem__(slice(6, None), 1))):
    D, K, mem = fake()
    patch(D, K, mem)
    st = L.team_steps(D, K, mem)
    expected = 10 if name == "tronçon" else 9           # un échantillon invalide retire ses deux pas voisins ; un changement de tronçon en retire un
    assert len(st["i"]) == expected, (name, len(st["i"]))
D, K, mem = fake()
K["seg"][:] = -1                                          # hors tronçon exploitable
assert len(L.team_steps(D, K, mem)["i"]) == 0


# ---------------------------------------------------------------- sprints
def steps(v, di=None, dt=0.1):
    n = len(v)
    return {"i": np.arange(n) if di is None else np.asarray(di), "dt": np.full(n, dt), "v": np.asarray(v, float), "dist": np.asarray(v, float) * dt, "t": np.zeros(n)}


assert L.sprint_starts(steps([6.5] * 12 + [1.0] * 3)) == [0]
assert L.sprint_starts(steps([6.5] * 9 + [1.0] * 3)) == []                                    # 0,9 s : trop court
assert L.sprint_starts(steps([6.5] * 10)) == [0]                                              # exactement 1,0 s
assert L.sprint_starts(steps([6.5] * 10 + [3.0] + [6.5] * 11)) == [0, 11]                     # deux sprints séparés par un pas lent
assert L.sprint_starts(steps([6.5] * 6 + [6.5] * 6, di=list(range(6)) + list(range(9, 15)))) == []   # un trou d'échantillons coupe la séquence : 2 x 0,6 s
assert L.sprint_starts(steps([3.0] * 20)) == []
assert L.sprint_starts({"i": np.array([], int), "dt": np.array([]), "v": np.array([]), "dist": np.array([]), "t": np.array([])}) == []


# ---------------------------------------------------------------- sommes par bloc et taux
def blk(t):
    return np.zeros(len(t), int)


# 60 s à 2 m/s, dont 10 s à 5 m/s (haute intensité) et 2 s à 7 m/s (sprint, d'un seul tenant)
v = np.r_[np.full(480, 2.0), np.full(100, 5.0), np.full(20, 7.0)]
st = steps(v)
st["t"] = 0.1 * np.arange(len(v))
bs = L.block_sums(st, blk, 1)
r = L.rate_columns(bs[0])
approx(r["seconds"], 60.0, 1e-6)
approx(r["distancePerMin"], (480 * 0.2 + 100 * 0.5 + 20 * 0.7), 1e-6)         # m par minute mesurée = m sur ces 60 s
approx(r["hiPerMin"], 100 * 0.5 + 20 * 0.7, 1e-6)
approx(r["sprintPerMin"], 20 * 0.7, 1e-6)
approx(r["hiTimeShare"], 12 / 60, 1e-9)
approx(r["sprintTimeShare"], 2 / 60, 1e-9)
approx(r["sprintsPerMin"], 1.0, 1e-9)
# les taux ne dépendent que du temps mesuré : mêmes pas répétés sur deux blocs -> mêmes taux, deux fois plus de secondes
bs2 = np.zeros((2, 7)); bs2[0] = bs[0]; bs2[1] = bs[0]
r2 = L.rate_columns(bs2.sum(0))
approx(r2["distancePerMin"], r["distancePerMin"], 1e-9)
approx(r2["seconds"], 120.0, 1e-9)
# aucun temps mesuré : NaN plutôt qu'une division par zéro
assert np.isnan(L.rate_columns(np.zeros(7))["distancePerMin"])
# vectorisé sur plusieurs tirages
many = L.rate_columns(np.stack([bs[0], bs2.sum(0)]))
assert many["distancePerMin"].shape == (2,)


# ---------------------------------------------------------------- appartenance d'équipe par piste
def fake_tracks():
    # 4 pistes de 20 mesures : A noire, B claire, C noire mais gardien (part de détections gardien), D noire mais « autre » (arbitre)
    n = 20
    tid = np.repeat(np.arange(4), n)
    D = {"tid": tid, "X": np.zeros(4 * n), "Y": np.zeros(4 * n), "t": np.tile(0.1 * np.arange(n), 4),
         "PN": np.r_[np.full(n, 0.95), np.full(n, 0.02), np.full(n, 0.95), np.full(n, 0.9)],
         "PW": np.r_[np.full(n, 0.02), np.full(n, 0.95), np.full(n, 0.02), np.full(n, 0.05)],
         "tracklets": [dict(id="0-1", gk=0.0, pa=0.02, n=n), dict(id="0-2", gk=0.0, pa=0.03, n=n), dict(id="0-3", gk=0.6, pa=0.02, n=n), dict(id="0-4", gk=0.0, pa=0.5, n=n)]}
    return D


D = fake_tracks()
black, light = L.member_masks(D)
assert black.reshape(4, -1).all(axis=1).tolist() == [True, False, False, False]      # ni gardien ni arbitre
assert light.reshape(4, -1).all(axis=1).tolist() == [False, True, False, False]
# une piste dont la probabilité moyenne est sous le seuil n'est retenue pour aucune équipe
D = fake_tracks()
D["PN"][:20] = 0.6
black, _ = L.member_masks(D, thr=0.8)
assert not black[:20].any()
assert L.member_masks(D, thr=0.5)[0][:20].all()
# la décision est PAR PISTE : quelques mesures peu sûres au milieu d'une piste sûre ne la font pas sortir (ni ne retirent les mesures)
D = fake_tracks()
D["PN"][5:8] = 0.3
assert L.member_masks(D)[0][:20].all()
# une mesure hors des lignes du terrain est écartée, pas la piste entière
D = fake_tracks()
D["X"][3], D["Y"][7] = 60.0, 40.0
black, _ = L.member_masks(D)
assert not black[3] and not black[7] and black[:20].sum() == 18
# mesures non classées (NaN) : ignorées dans la moyenne de la piste
D = fake_tracks()
D["PN"][:5] = np.nan
assert L.member_masks(D)[0][5:20].all()
# taux moyens de piste
pn, pw = L.track_probabilities(fake_tracks())
approx(pn[0], 0.95, 1e-9); approx(pw[1], 0.95, 1e-9)


# ---------------------------------------------------------------- lissage sur une trajectoire connue (kinematics)
def synthetic_track(speed, seconds=60.0, noise=0.0, drop=0.0, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(0, seconds, 0.1)
    keep = rng.random(len(t)) >= drop
    keep[0] = keep[-1] = True
    t = t[keep]
    X = -30 + speed * t + rng.normal(0, noise, len(t))
    Y = 5 + rng.normal(0, noise, len(t))
    rho = np.full(len(t), 60.0)
    return {"t": t, "X": X, "Y": Y, "rho": rho, "tid": np.zeros(len(t), np.int64), "tracklets": [dict(id="0-1", gk=0.0, pa=0.0, n=len(t))]}


def run(D, contacts=None, **kw):
    L.tracklet_contacts = lambda D_: [np.array([] if contacts is None else contacts, float)]      # pas de lecture des fichiers de suivi
    K = L.kinematics(D, **kw)
    mem = [np.ones(len(D["t"]), bool), np.zeros(len(D["t"]), bool)]
    st = L.team_steps(D, K, mem[0])
    return K, st, L.rate_columns(L.block_sums(st, L.block_index, L.N_BLOCKS).sum(0))


true_speed = 3.0                                                     # 180 m/min
D = synthetic_track(true_speed)
K, st, r = run(D)
approx(r["distancePerMin"], 60 * true_speed, 1.0)                    # sans bruit : distance exacte
# avec un bruit de mesure de 0,25 m : la distance brute est gonflée de plus de 50 %, la distance lissée reste à 2 % de la vérité
D = synthetic_track(true_speed, noise=0.25)
raw = 60 * np.hypot(np.diff(D["X"]), np.diff(D["Y"])).sum() / (D["t"][-1] - D["t"][0])
K, st, r = run(D)
assert raw > 1.5 * 60 * true_speed, raw
approx(r["distancePerMin"] / (60 * true_speed), 1.0, 0.02)
# un joueur immobile : le bruit ne laisse qu'un petit parasite (< 0,35 m/s), très en dessous de la marche (1,2 m/s)
D = synthetic_track(0.0, noise=0.15)
K, st, r = run(D)
assert r["distancePerMin"] < 0.35 * 60, r["distancePerMin"]
# des images manquantes ne changent pas la vitesse mesurée (tolérance aux trous) ; les pas stricts perdraient du temps mesuré
D = synthetic_track(true_speed, noise=0.05, drop=0.15)
K, st, r = run(D)
approx(r["distancePerMin"] / (60 * true_speed), 1.0, 0.05)
L.tracklet_contacts = lambda D_: [np.array([])]
strict = L.team_steps(D, K, [np.ones(len(D["t"]), bool)][0], step_max_s=L.STEP_MAX_S)
assert strict["dt"].sum() < st["dt"].sum()
# un contact à t = 30 s écarte les instants à moins de 1 s de part et d'autre, et eux seuls
D = synthetic_track(true_speed)
K, st, r = run(D, contacts=[30.0])
assert not K["okc"][np.abs(D["t"] - 30.0) < T.CONTACT_MARGIN_S - 0.05].any()
assert K["okc"][np.abs(D["t"] - 30.0) > T.CONTACT_MARGIN_S + 0.05].all()
assert st["dt"].sum() < 60 - 1.5
# restriction : une piste sans aucune mesure retenue n'est pas lissée
D = synthetic_track(true_speed)
L.tracklet_contacts = lambda D_: [np.array([])]
K = L.kinematics(D, restrict=np.zeros(len(D["t"]), bool))
assert (K["seg"] == -1).all()


# ---------------------------------------------------------------- période, IC et écart
def fake_sums(sec_per_block, dist_factor):
    bs = np.zeros((L.N_BLOCKS, 7))
    for b in list(range(0, 10)) + list(range(109, 120)):
        bs[b, 0] = sec_per_block
        bs[b, 1] = sec_per_block * dist_factor
    return bs


D = {"t": np.array([0.0, 5956.9])}
same = [fake_sums(200, 1.8), fake_sums(200, 1.8)]
res = L.summarize(D, same, "match")
assert res["ours"]["distancePerMin"] == res["opponent"]["distancePerMin"] == 108.0        # 1,8 m/s = 108 m/min
assert res["diffPct"]["distancePerMin"] == 0.0
lo, hi = res["diffPct"]["ci95"]["distancePerMin"]
assert lo <= 0.0 <= hi and hi - lo < 1e-6                                                # blocs identiques : aucune dispersion
assert res["ours"]["ci95"]["distancePerMin"] == [108.0, 108.0]
approx(res["ours"]["coverage"], 200 * 21 / (10 * 5956.9), 1e-3)
assert res["ours"]["measuredPlayerMin"] == round(200 * 21 / 60, 1)
double = [fake_sums(200, 3.6), fake_sums(200, 1.8)]
res = L.summarize(D, double, "match")
assert res["diffPct"]["distancePerMin"] == 100.0
# des blocs hétérogènes donnent une fourchette non nulle qui contient l'estimation
het = fake_sums(200, 1.8)
het[3, 1] *= 1.5; het[115, 1] *= 0.5
res = L.summarize(D, [het, fake_sums(200, 1.8)], "match")
lo, hi = res["ours"]["ci95"]["distancePerMin"]
assert lo < res["ours"]["distancePerMin"] < hi and hi - lo > 1.0
# mi-temps : seuls les blocs de la mi-temps comptent ; la durée nominale est celle de la mi-temps
h1 = L.summarize(D, [fake_sums(200, 1.8), fake_sums(200, 1.8)], "half1")
assert h1["ours"]["measuredPlayerMin"] == round(200 * 10 / 60, 1)
approx(h1["ours"]["coverage"], 200 * 10 / (10 * 2861.0), 1e-3)
h2 = L.summarize(D, [fake_sums(200, 1.8), fake_sums(200, 1.8)], "half2")
assert h2["ours"]["measuredPlayerMin"] == round(200 * 11 / 60, 1)
approx(h2["ours"]["coverage"], 200 * 11 / (10 * (5956.9 - 2861.0)), 1e-3)
assert list(L.period_blocks(same, "half1")) == list(range(10)) and list(L.period_blocks(same, "half2")) == list(range(109, 120))
# résultat reproductible (graine fixe)
assert L.summarize(D, [het, fake_sums(200, 1.8)], "match") == res


# ---------------------------------------------------------------- marge de méthode et bloc du site
def variant(o, p):
    return {"ours": {"distancePerMin": o, "hiPerMin": o / 5, "sprintPerMin": o / 20}, "opponent": {"distancePerMin": p, "hiPerMin": p / 5, "sprintPerMin": p / 20},
            "diffPct": {"distancePerMin": (o / p - 1) * 100, "hiPerMin": (o / p - 1) * 100, "sprintPerMin": (o / p - 1) * 100}}


sens = {"base": variant(100, 100), "a": variant(104, 100), "b": variant(96, 100), "pas sans image manquante (0,1 s)": variant(80, 100)}
spread = L.method_range_pct(sens)
approx(spread["ours"]["distancePerMin"], 4.0, 1e-9)                      # (104 - 96) / 2 / 100
approx(spread["opponent"]["distancePerMin"], 0.0, 1e-9)
approx(spread["diffPoints"]["distancePerMin"], 4.0, 1e-9)               # demi-étendue de l'écart, en points ; la variante stricte est exclue
approx(spread["strictStepsPct"]["distancePerMin"], -20.0, 1e-9)
rep = {p: L.summarize(D, [fake_sums(200, 1.8), fake_sums(200, 1.7)], p) for p in ("match", "half1", "half2")}
site = L.site_block(rep, spread)
assert set(site) == {"thresholdsKmh", "note", "ours", "opponent", "diffPct", "methodPct"}
assert site["thresholdsKmh"] == {"highIntensity": 16.2, "sprint": 21.6}
assert set(site["ours"]) == {"match", "half1", "half2"}
assert set(site["ours"]["match"]) == {"distancePerMin", "hiPerMin", "sprintPerMin", "measuredPlayerMin", "coverage", "ci95"}
assert site["methodPct"]["distancePerMin"] == 4 and site["methodPct"]["diffPoints"]["distancePerMin"] == 4.0
assert "±4 % sur la distance" in site["note"] and "environ 20 %" in site["note"]     # marge de méthode et effet des pas stricts, tirés des variantes
json.dumps(site)                                                          # sérialisable tel quel


# vidéo partielle (1re mi-temps seule) : la période absente est omise, sans erreur ni NaN dans le JSON du site
first = np.zeros((L.N_BLOCKS, 7)); first[:10, 0] = 200.0; first[:10, 1] = 360.0
assert L.summarize(D, [first, first.copy()], "half2") is None
rep_part = L.load_report(D, [first, first.copy()])
assert set(rep_part) == {"match", "half1"}
site_part = L.site_block(rep_part, spread)
assert set(site_part["ours"]) == {"match", "half1"} and set(site_part["diffPct"]) == {"match", "half1"}
json.dumps(site_part, allow_nan=False)
# rapport indéfini (aucune distance rapide dans les deux équipes : 0 / 0) : None, jamais NaN
undefined = L.summarize(D, [fake_sums(200, 1.8), fake_sums(200, 1.8)], "match")
assert undefined["diffPct"]["hiPerMin"] is None and undefined["diffPct"]["ci95"]["hiPerMin"] is None
json.dumps(undefined, allow_nan=False)
# une équipe sans aucun temps mesuré : taux absents (None), l'autre équipe intacte
one = [fake_sums(200, 1.8), np.zeros((L.N_BLOCKS, 7))]
res = L.summarize(D, one, "match")
assert res["opponent"]["distancePerMin"] is None and res["diffPct"]["distancePerMin"] is None and res["ours"]["distancePerMin"] == 108.0
json.dumps(res, allow_nan=False)


print("tous les tests passent")
