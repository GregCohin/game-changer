"""Métriques physiques d'un joueur à partir de ses mesures panoramiques sûres (schéma emptyAdvancedAnalytics du site).

Seuils repris de metrics.py (sprint 6 m/s pendant ≥ 1 s, haute intensité 4,5 m/s, accélération 2,5 m/s²).
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from metrics import SPRINT_SPEED_MS, HIGH_INTENSITY_SPEED_MS, ACCEL_THRESHOLD_MS2, SPRINT_MIN_DURATION_S
from panorama import track as T

FPS = 10.0
PITCH_L, PITCH_W = 105.0, 68.0


def _runs(mask):
    """Indices (début, fin exclus) des séquences vraies consécutives."""
    if not mask.any():
        return []
    d = np.diff(np.r_[0, mask.astype(int), 0])
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def player_metrics(measurement_lists, contacts, reference_duration_s, max_points=200):
    """measurement_lists : liste de listes de mesures (t, X, Y, rho), une par piste rattachée au joueur.
    contacts : instants (s) où la piste était trop proche d'un autre joueur (exclus)."""
    contact = np.array(sorted(set(contacts)))
    dist = hi_dist = measured = 0.0
    sprints = accels = decels = 0
    speeds, pts = [], []
    for meas in measurement_lists:
        for sg in T.segments(meas):
            ts, xs, Ps = T.kf_smooth(sg)
            ok = np.array([(len(contact) == 0 or np.min(np.abs(contact - t)) > T.CONTACT_MARGIN_S) for t in ts])
            ok &= np.sqrt(np.maximum(Ps[:, 2, 2], Ps[:, 3, 3])) < T.EDGE_SIGMA_V
            v = np.hypot(xs[:, 2], xs[:, 3])
            dt = np.diff(ts)
            good = (dt <= 1.5 / FPS) & ok[1:] & ok[:-1]
            step = np.hypot(np.diff(xs[:, 0]), np.diff(xs[:, 1]))
            dist += float(step[good].sum())
            hi_dist += float(step[good & (v[1:] >= HIGH_INTENSITY_SPEED_MS)].sum())
            measured += float(dt[good].sum())
            # séquences continues exploitables (pour sprints / accélérations)
            for a, b in _runs(ok):
                if b - a < 3:
                    continue
                vv, tt = v[a:b], ts[a:b]
                for s, e in _runs(vv >= SPRINT_SPEED_MS):
                    if tt[e - 1] - tt[s] >= SPRINT_MIN_DURATION_S:
                        sprints += 1
                acc = np.gradient(vv, tt) if len(vv) > 2 else np.zeros_like(vv)
                for s, e in _runs(acc >= ACCEL_THRESHOLD_MS2):
                    if tt[e - 1] - tt[s] >= 0.4:
                        accels += 1
                for s, e in _runs(acc <= -ACCEL_THRESHOLD_MS2):
                    if tt[e - 1] - tt[s] >= 0.4:
                        decels += 1
                w = 5                                        # moyenne glissante 0,5 s : un pic isolé ne fait pas la vitesse de pointe
                if len(vv) >= w:
                    speeds.append(np.convolve(vv, np.ones(w) / w, mode="valid"))
                pts.extend((float(t), float(x), float(y)) for t, x, y in zip(tt, xs[a:b, 0], xs[a:b, 1]))
    top = float(np.max(np.concatenate(speeds)) * 3.6) if speeds else 0.0
    stepn = max(1, len(pts) // max_points)
    heat = [{"x": round(min(1, max(0, y / PITCH_W + 0.5)), 3), "y": round(min(1, max(0, x / PITCH_L + 0.5)), 3), "t": round(t)}
            for t, x, y in pts[::stepn]]
    return {
        "distanceCovered": round(dist), "sprints": sprints, "topSpeed": round(top, 1),
        "highIntensityDistance": round(hi_dist), "accelerations": accels, "decelerations": decels,
        "heatmapPoints": heat, "visibleCoverage": round(measured / reference_duration_s, 3),
    }
