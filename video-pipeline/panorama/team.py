"""Métriques d'équipe (équipe sombre) sur tout le match, sans identification individuelle : forme d'équipe,
charge physique par tranche de 5 minutes.

Usage : python -m panorama.team
"""
import collections
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from metrics import TEAM_SHAPE_MIN_PLAYERS, SPRINT_SPEED_MS, HIGH_INTENSITY_SPEED_MS
from panorama import track as T
from panorama.identify import load_tracklets

FPS = 10.0
PITCH_L, PITCH_W = 105.0, 68.0


def team_shape_series(tracklets, min_players=TEAM_SHAPE_MIN_PLAYERS):
    """Par image (0,1 s) : positions des joueurs sombres suivis. Retourne (instants, hauteur, largeur, profondeur) en mètres,
    pour les images où au moins min_players sont suivis simultanément."""
    frames = collections.defaultdict(list)
    for tl in tracklets:
        for t, X, Y in zip(tl.t, tl.X, tl.Y):
            frames[int(round(t * 10))].append((X, Y))
    ts, mean_x, width, depth, n = [], [], [], [], []
    for f in sorted(frames):
        pts = np.array(frames[f])
        if len(pts) < min_players:
            continue
        ts.append(f / 10.0)
        mean_x.append(pts[:, 0].mean())
        width.append(pts[:, 1].max() - pts[:, 1].min())
        depth.append(pts[:, 0].max() - pts[:, 0].min())
        n.append(len(pts))
    return np.array(ts), np.array(mean_x), np.array(width), np.array(depth), np.array(n)


def load_dark():
    return [t for t in load_tracklets() if t.side == "D"]


if __name__ == "__main__":
    tl = load_dark()
    ts, mx, w, d, n = team_shape_series(tl)
    horizon = max(t.t1 for t in tl)
    print(f"{len(tl)} pistes sombres jusqu'à {horizon:.0f} s ; images avec ≥{TEAM_SHAPE_MIN_PLAYERS} joueurs sombres suivis : {len(ts)} sur {int(horizon * FPS)} ({100 * len(ts) / (horizon * FPS):.0f} %)")
    print(f"largeur moyenne {w.mean():.1f} m (68 m de terrain), profondeur moyenne {d.mean():.1f} m, X moyen du bloc {mx.mean():+.1f} m, joueurs suivis simultanément {n.mean():.1f}")
