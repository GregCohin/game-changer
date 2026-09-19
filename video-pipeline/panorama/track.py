"""Suivi des joueurs du panorama en coordonnées terrain (mètres).

Deux temps : (1) association permissive (filtre de Kalman + association à deux étages, détections
sûres puis douteuses) qui décide quelle détection appartient à quelle piste ; (2) lissage final de
chaque piste (Kalman + Rauch-Tung-Striebel) avec des réglages plus fins, d'où sortent vitesses et
distances. Les moments où deux joueurs se touchent (risque de confusion) sont exclus des statistiques.

Usage : python -m panorama.track <detections.pkl> [--tracks sortie.pkl] [--no-veto]
"""
import argparse
import collections
import math
import pickle
import statistics
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama.geometry import PanoramaModel

OUT = Path(__file__).parent.parent / "output" / "panorama"
VMAX = 10.0              # m/s : vitesse maximale plausible d'un joueur
CONF_HIGH, CONF_LOW = 0.45, 0.20
MAX_MISSED_S = 0.5       # une piste sans détection depuis plus longtemps est abandonnée (pas de raccrochage après un long trou : risque de confusion d'identité)
MAX_STEP_SPEED = 11.0    # m/s : un saut plus rapide entre deux mesures coupe la piste en segments
CONTACT_M = 1.5          # deux joueurs plus proches que ça : risque de confusion d'identité
CONTACT_MARGIN_S = 1.0   # marge exclue des statistiques autour d'un contact
EDGE_SIGMA_V = 0.8       # m/s : au-delà, la vitesse lissée est trop incertaine pour être retenue
PITCH_HALF_W_MARGIN = 0.5
PITCH_HALF_L = 55.0
USE_SIDE_VETO = False    # la couleur du maillot à 23 px est trop instable pour servir de veto strict

ASSOC = dict(sig_a=5.0, rx=0.25, ry0=0.25, ry_slope=0.006)   # association : permissive
FINAL = dict(sig_a=3.0, rx=0.10, ry0=0.10, ry_slope=0.004)   # lissage final : plus fin
H_MEAS = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)


def R_of(rho, p):
    return np.diag([p["rx"] ** 2, (p["ry0"] + p["ry_slope"] * max(0.0, rho - 30.0)) ** 2])


def F_of(dt):
    return np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], float)


def Q_of(dt, p):
    q = p["sig_a"] ** 2
    return q * np.array([[dt**4 / 4, 0, dt**3 / 2, 0], [0, dt**4 / 4, 0, dt**3 / 2], [dt**3 / 2, 0, dt**2, 0], [0, dt**3 / 2, 0, dt**2]])


class Track:
    _n = 0

    def __init__(self, t, det):
        Track._n += 1
        self.id = Track._n
        self.x = np.array([det["X"], det["Y"], 0.0, 0.0])
        self.P = np.diag([0.4, 0.4, 9.0, 9.0])
        self.t = t
        self.meas = [(t, det["X"], det["Y"], det["rho"])]
        self.extra = [(det["conf"], det["cls"], det["color"])]
        self.side_votes = collections.Counter()
        if det["side"]:
            self.side_votes[det["side"]] += 1
        self.hits, self.missed = 1, 0
        self.contacts = []

    @property
    def side(self):
        n = sum(self.side_votes.values())
        if n < 5:
            return None
        s, k = self.side_votes.most_common(1)[0]
        return s if k >= 0.8 * n else None

    def predict(self, t):
        dt = t - self.t
        F = F_of(dt)
        return F @ self.x, F @ self.P @ F.T + Q_of(dt, ASSOC)

    def update(self, t, det, xp, Pp):
        S = H_MEAS @ Pp @ H_MEAS.T + R_of(det["rho"], ASSOC)
        K = Pp @ H_MEAS.T @ np.linalg.inv(S)
        self.x = xp + K @ (np.array([det["X"], det["Y"]]) - H_MEAS @ xp)
        self.P = (np.eye(4) - K @ H_MEAS) @ Pp
        self.meas.append((t, det["X"], det["Y"], det["rho"]))
        self.extra.append((det["conf"], det["cls"], det["color"]))
        self.t = t
        self.hits += 1
        self.missed = 0
        if det["side"]:
            self.side_votes[det["side"]] += 1


def kf_smooth(meas, p=FINAL):
    """Kalman + Rauch-Tung-Striebel sur les mesures (t, X, Y, rho) d'une piste. Retourne t, états, covariances."""
    x = np.array([meas[0][1], meas[0][2], 0.0, 0.0])
    P = np.diag([0.3, 0.3, 9.0, 9.0])
    t_prev = meas[0][0]
    xs, Ps, xps, Pps, Fs, ts = [x.copy()], [P.copy()], [None], [None], [None], [t_prev]
    for (t, X, Y, rho) in meas[1:]:
        dt = t - t_prev
        F = F_of(dt)
        xp, Pp = F @ x, F @ P @ F.T + Q_of(dt, p)
        S = H_MEAS @ Pp @ H_MEAS.T + R_of(rho, p)
        K = Pp @ H_MEAS.T @ np.linalg.inv(S)
        x = xp + K @ (np.array([X, Y]) - H_MEAS @ xp)
        P = (np.eye(4) - K @ H_MEAS) @ Pp
        xs.append(x.copy()); Ps.append(P.copy()); xps.append(xp); Pps.append(Pp); Fs.append(F); ts.append(t)
        t_prev = t
    xsm, Psm = xs[:], Ps[:]
    for k in range(len(xs) - 2, -1, -1):
        C = Ps[k] @ Fs[k + 1].T @ np.linalg.inv(Pps[k + 1])
        xsm[k] = xs[k] + C @ (xsm[k + 1] - xps[k + 1])
        Psm[k] = Ps[k] + C @ (Psm[k + 1] - Pps[k + 1]) @ C.T
    return np.array(ts), np.array(xsm), np.array(Psm)


def prepare(frames, model):
    """Détections -> coordonnées terrain, filtre terrain, doublons, classe de couleur (clair / sombre)."""
    W2 = model.W / 2 + PITCH_HALF_W_MARGIN
    out = []
    for f in frames:
        cand = []
        for d in f["dets"]:
            if d["cls"] not in (1, 2) or d["conf"] < CONF_LOW:
                continue
            u, v = (d["box"][0] + d["box"][2]) / 2, d["box"][3]
            (X, Y), rho = [a[0] for a in model.unproject(np.array([[u, v]]))]
            if not (5 < rho < 130 and abs(X) <= PITCH_HALF_L and abs(Y) <= W2):
                continue
            cand.append(dict(X=float(X), Y=float(Y), rho=float(rho), conf=d["conf"], cls=d["cls"], color=d["color"], side=None))
        cand.sort(key=lambda c: -c["conf"])
        keep = []
        for c in cand:
            if all(math.hypot(c["X"] - k["X"], c["Y"] - k["Y"]) > 0.7 for k in keep):
                keep.append(c)
        out.append(dict(t=f["t"], dets=keep))
    return out


def assign_sides(prepared):
    def feat(s):
        hh = s[0] * 2 * math.pi / 180
        return [s[2] / 255 * 2, s[1] / 255, math.cos(hh) * s[1] / 255, math.sin(hh) * s[1] / 255]
    refs = [(i, j) for i, f in enumerate(prepared) for j, d in enumerate(f["dets"]) if d["color"] and d["conf"] >= 0.3]
    X = np.array([feat(prepared[i]["dets"][j]["color"]) for i, j in refs], dtype=np.float32)
    cv2.setRNGSeed(0)
    _, labels, centers = cv2.kmeans(X, 3, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.001), 10, cv2.KMEANS_PP_CENTERS)
    dark = int(np.argmin(centers[:, 0]))
    for (i, j), l in zip(refs, labels.ravel()):
        prepared[i]["dets"][j]["side"] = "D" if int(l) == dark else "L"


def match(tracks, dets, t, gate_m2, margin):
    """Hongrois sur la distance de Mahalanobis, avec porte de vitesse (et veto d'équipe si activé)."""
    if not tracks or not dets:
        return [], set(range(len(tracks))), set(range(len(dets)))
    C = np.full((len(tracks), len(dets)), 1e9)
    preds = []
    for i, tr in enumerate(tracks):
        xp, Pp = tr.predict(t)
        preds.append((xp, Pp))
        dt = t - tr.t
        for j, d in enumerate(dets):
            if USE_SIDE_VETO and tr.side and d["side"] and tr.side != d["side"]:
                continue
            S = H_MEAS @ Pp @ H_MEAS.T + R_of(d["rho"], ASSOC)
            r = np.array([d["X"], d["Y"]]) - H_MEAS @ xp
            m2 = float(r @ np.linalg.solve(S, r))
            if m2 <= gate_m2 and math.hypot(d["X"] - tr.x[0], d["Y"] - tr.x[1]) <= VMAX * dt + margin:
                C[i, j] = m2
    ri, ci = linear_sum_assignment(C)
    pairs = [(i, j) for i, j in zip(ri, ci) if C[i, j] < 1e8]
    for i, j in pairs:
        tracks[i].update(t, dets[j], *preds[i])
    return pairs, set(range(len(tracks))) - {p[0] for p in pairs}, set(range(len(dets))) - {p[1] for p in pairs}


def run_tracking(prepared, fps, spawn_log=None):
    Track._n = 0
    active, all_tracks, per_frame = [], [], []
    max_missed = int(MAX_MISSED_S * fps)
    for f in prepared:
        t = f["t"]
        high = [d for d in f["dets"] if d["conf"] >= CONF_HIGH]
        low = [d for d in f["dets"] if d["conf"] < CONF_HIGH]
        pairs, un_t, un_h = match(active, high, t, 11.83, 0.8)
        rest = [active[i] for i in sorted(un_t) if active[i].missed <= 3]
        p2, _, _ = match(rest, low, t, 9.21, 0.6)
        matched_ids = {active[i].id for i, _ in pairs} | {rest[i].id for i, _ in p2}
        for tr in active:
            if tr.id not in matched_ids:
                tr.missed += 1
        for j in sorted(un_h):
            d = high[j]
            guard = lambda tr: 2.0 if tr.missed <= 5 else 1.0
            if all(math.hypot(d["X"] - tr.x[0], d["Y"] - tr.x[1]) > guard(tr) for tr in active):
                if spawn_log is not None and active:
                    near = min(active, key=lambda a: math.hypot(d["X"] - a.x[0], d["Y"] - a.x[1]))
                    spawn_log.append((t, math.hypot(d["X"] - near.x[0], d["Y"] - near.x[1]), near.missed))
                tr = Track(t, d)
                active.append(tr)
                all_tracks.append(tr)
        live = [tr for tr in active if tr.missed == 0 and tr.hits >= 3]
        for a in range(len(live)):
            for b in range(a + 1, len(live)):
                if math.hypot(live[a].x[0] - live[b].x[0], live[a].x[1] - live[b].x[1]) < CONTACT_M:
                    live[a].contacts.append(t)
                    live[b].contacts.append(t)
        active = [tr for tr in active if tr.missed <= max_missed]
        per_frame.append(sum(1 for tr in active if tr.missed == 0 and tr.hits >= 5))
    return all_tracks, per_frame


def segments(meas, max_gap_s=0.6):
    """Découpe une piste en segments continus : plus de trou de 0,6 s ni de saut plus rapide que MAX_STEP_SPEED."""
    segs, cur = [], [meas[0]]
    for a, b in zip(meas, meas[1:]):
        dt = b[0] - a[0]
        if dt > max_gap_s or math.hypot(b[1] - a[1], b[2] - a[2]) > MAX_STEP_SPEED * dt + 0.5:
            segs.append(cur)
            cur = []
        cur.append(b)
    segs.append(cur)
    return [sg for sg in segs if len(sg) >= 8]


LOST_FROM = 3            # images manquées avant qu'une piste soit considérée comme perdue (v2)
LOST_MAX_S = 2.0         # v2 : une piste perdue peut être reprise jusqu'à ce délai
ISO_R = 2.0              # v2 : une reprise exige qu'aucune autre détection / piste récente ne soit à moins de ce rayon


def lost_gate(g):
    return 0.8 + 1.0 * g


def run_tracking_v2(prepared, fps, spawn_log=None):
    """Comme run_tracking, avec reprise des pistes perdues (jusqu'à LOST_MAX_S) quand la détection est proche et isolée."""
    Track._n = 0
    active, all_tracks, per_frame = [], [], []
    max_missed = int(LOST_MAX_S * fps)
    for f in prepared:
        t = f["t"]
        high = [d for d in f["dets"] if d["conf"] >= CONF_HIGH]
        low = [d for d in f["dets"] if d["conf"] < CONF_HIGH]
        recent = [tr for tr in active if tr.missed <= LOST_FROM]
        lost = [tr for tr in active if tr.missed > LOST_FROM]
        pairs, un_t, un_h = match(recent, high, t, 11.83, 0.8)
        rest = [recent[i] for i in sorted(un_t)]
        p2, _, _ = match(rest, low, t, 9.21, 0.6)
        matched_ids = {recent[i].id for i, _ in pairs} | {rest[i].id for i, _ in p2}
        remaining = [j for j in sorted(un_h)]
        # reprise des pistes perdues : détection proche (portes de distance serrées) et isolée
        if lost and remaining:
            allpos = [(d["X"], d["Y"]) for d in f["dets"]]
            recentpos = [(tr.x[0], tr.x[1]) for tr in active if tr.missed <= LOST_FROM]
            C = np.full((len(lost), len(remaining)), 1e9)
            for a, tr in enumerate(lost):
                g = t - tr.t
                anchor = tr.x[:2] + tr.x[2:] * min(g, 0.5) * 0.5
                R = lost_gate(g)
                for b, j in enumerate(remaining):
                    d = high[j]
                    dist = math.hypot(d["X"] - anchor[0], d["Y"] - anchor[1])
                    if dist > R or (tr.side and d["side"] and USE_SIDE_VETO and tr.side != d["side"]):
                        continue
                    crowd = sum(1 for (X, Y) in allpos if 0.05 < math.hypot(X - d["X"], Y - d["Y"]) <= ISO_R)
                    crowd += sum(1 for (X, Y) in recentpos if math.hypot(X - d["X"], Y - d["Y"]) <= ISO_R)
                    if crowd == 0:
                        C[a, b] = dist / R
            ri, ci = linear_sum_assignment(C)
            used = set()
            for a, b in zip(ri, ci):
                if C[a, b] < 1e8:
                    tr, j = lost[a], remaining[b]
                    xp, Pp = tr.predict(t)
                    tr.update(t, high[j], xp, Pp)
                    matched_ids.add(tr.id)
                    used.add(j)
            remaining = [j for j in remaining if j not in used]
        for tr in active:
            if tr.id not in matched_ids:
                tr.missed += 1
        for j in remaining:
            d = high[j]
            guard = lambda tr: 2.0 if tr.missed <= 5 else 1.0
            if all(math.hypot(d["X"] - tr.x[0], d["Y"] - tr.x[1]) > guard(tr) for tr in active):
                tr = Track(t, d)
                active.append(tr)
                all_tracks.append(tr)
        live = [tr for tr in active if tr.missed == 0 and tr.hits >= 3]
        for a in range(len(live)):
            for b in range(a + 1, len(live)):
                if math.hypot(live[a].x[0] - live[b].x[0], live[a].x[1] - live[b].x[1]) < CONTACT_M:
                    live[a].contacts.append(t)
                    live[b].contacts.append(t)
        active = [tr for tr in active if tr.missed <= max_missed]
        per_frame.append(sum(1 for tr in active if tr.missed == 0 and tr.hits >= 5))
    return all_tracks, per_frame


def final_states(tr):
    """Lissage final de chaque segment continu + masque des instants exploitables (hors contacts, hors bords incertains)."""
    contact = np.array(sorted(set(tr.contacts)))
    out = []
    for sg in segments(tr.meas):
        ts, xs, Ps = kf_smooth(sg)
        ok = np.array([(len(contact) == 0 or np.min(np.abs(contact - t)) > CONTACT_MARGIN_S) for t in ts])
        ok &= np.sqrt(np.maximum(Ps[:, 2, 2], Ps[:, 3, 3])) < EDGE_SIGMA_V
        out.append((ts, xs, ok))
    return out


def metrics(tracks, fps, min_hits=8):
    rows, speeds = [], []
    for tr in tracks:
        if tr.hits < min_hits:
            continue
        for ts, xs, ok in final_states(tr):
            sp = np.hypot(xs[:, 2], xs[:, 3])
            dt = np.diff(ts)
            seg = np.hypot(np.diff(xs[:, 0]), np.diff(xs[:, 1]))
            good = (dt <= 1.5 / fps) & ok[1:] & ok[:-1]
            rows.append(dict(id=tr.id, hits=len(ts), span=ts[-1] - ts[0], dist=float(seg[good].sum()), dur=float(dt[good].sum()),
                             sp=sp[ok], contact_frac=1 - ok.mean()))
            speeds.append(sp[ok])
    return rows, (np.concatenate(speeds) * 3.6 if speeds else np.array([]))


def report(tracks, per_frame, fps, nframes):
    conf = [t for t in tracks if t.hits >= 8]
    span = [t.meas[-1][0] - t.meas[0][0] for t in conf]
    print(f"pistes créées {len(tracks)}, retenues (≥0,8 s de détections) {len(conf)} ; suivies simultanément par image : moyenne {statistics.mean(per_frame):.1f}, médiane {statistics.median(per_frame):.0f}")
    print(f"durée des pistes : médiane {statistics.median(span):.1f} s, moyenne {statistics.mean(span):.1f} s ; ≥30 s : {sum(s >= 30 for s in span)}, ≥60 s : {sum(s >= 60 for s in span)}, ≥100 s : {sum(s >= 100 for s in span)}")
    print(f"couverture du temps-joueur (détections dans des pistes retenues / (images×22)) : {100 * sum(t.hits for t in conf) / (nframes * 22):.0f} %")
    hit = [t.hits / max(1, round((t.meas[-1][0] - t.meas[0][0]) * fps) + 1) for t in conf if t.hits >= 30]
    print(f"taux de détection le long d'une piste (≥3 s) : médian {100 * statistics.median(hit):.0f} %")
    rows, sp = metrics(tracks, fps)
    print(f"segments continus exploitables : {len(rows)}, durée mesurable (hors contacts et bords) {sum(r['dur'] for r in rows):.0f} s ; part exclue pour contact/bords : {100 * statistics.mean(r['contact_frac'] for r in rows):.0f} %")
    print(f"vitesse lissée : médiane {np.median(sp):.1f} km/h ; 95e {np.percentile(sp, 95):.1f} ; 99e {np.percentile(sp, 99):.1f} ; 99,9e {np.percentile(sp, 99.9):.1f} ; max {sp.max():.1f}")
    print(f"part du temps ≥21,6 km/h (sprint) : {100 * np.mean(sp >= 21.6):.1f} % ; ≥27 : {100 * np.mean(sp >= 27):.2f} % ; ≥32 : {100 * np.mean(sp >= 32):.2f} %")
    per_min = [60 * r["dist"] / r["dur"] for r in rows if r["dur"] >= 15]
    if per_min:
        print(f"distance mesurée par minute (segments ≥15 s, n={len(per_min)}) : médiane {np.median(per_min):.0f} m/min ({np.median(per_min) * 0.06:.1f} km/h) ; 10e-90e centiles {np.percentile(per_min, 10):.0f}-{np.percentile(per_min, 90):.0f}")
    tops = [np.percentile(r["sp"], 99) * 3.6 for r in rows if len(r["sp"]) >= 100]
    if tops:
        print(f"vitesse de pointe (99e centile) par segment ≥10 s (n={len(tops)}) : médiane {np.median(tops):.1f} km/h, 90e centile {np.percentile(tops, 90):.1f}, max {max(tops):.1f}")
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("detections")
    ap.add_argument("--tracks", default=None)
    ap.add_argument("--veto", action="store_true")
    args = ap.parse_args()
    USE_SIDE_VETO = args.veto
    D = pickle.load(open(args.detections, "rb"))
    model = PanoramaModel.from_json(OUT / "calibration_finale.json")
    prepared = prepare(D["frames"], model)
    assign_sides(prepared)
    tracks, per_frame = run_tracking(prepared, D["fps"])
    report(tracks, per_frame, D["fps"], len(prepared))
    if args.tracks:
        pickle.dump([dict(id=t.id, side=t.side, meas=t.meas, contacts=t.contacts) for t in tracks if t.hits >= 8], open(args.tracks, "wb"))
