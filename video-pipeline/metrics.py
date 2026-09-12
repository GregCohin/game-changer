"""Accumulation des trajectoires par trace et calcul des métriques du schéma
emptyAdvancedAnalytics() (src/App.jsx:24349) — physique par joueur, heatmap, forme d'équipe.
Unités alignées sur generateMockAdvancedAnalytics() (src/App.jsx:24362) : distances en mètres,
vitesse en km/h.
"""
SPRINT_SPEED_MS = 6.0          # m/s (~21.6 km/h) - seuil usuel pour compter un "sprint"
HIGH_INTENSITY_SPEED_MS = 4.5  # m/s (~16.2 km/h) - seuil "haute intensité"
ACCEL_THRESHOLD_MS2 = 2.5      # m/s^2 - seuil pour compter une accélération/décélération
SPRINT_MIN_DURATION_S = 1.0    # un pic de vitesse isolé d'un seul échantillon ne compte pas
# Vitesse humaine max plausible (record de sprint élite ~12.4 m/s) — au-delà, la variation de
# position entre deux échantillons vient presque certainement d'une calibration ponctuellement
# mauvaise (position "téléportée"), pas d'un vrai déplacement. Repéré concrètement en testant sur
# une vraie vidéo de match : sans ce filtre, une seule frame mal calibrée peut produire des
# vitesses de pointe à plusieurs centaines de km/h. Le segment est ignoré (ni distance ni vitesse),
# pas juste plafonné, pour ne pas fausser la distance totale non plus.
MAX_PLAUSIBLE_SPEED_MS = 10.5
TEAM_SHAPE_MIN_PLAYERS = 8     # nb mini de joueurs d'une même équipe visibles simultanément pour
                                # que la forme d'équipe de cette frame soit prise en compte

PITCH_WIDTH_M = 68.0
PITCH_LENGTH_M = 105.0


class TrackAccumulator:
    """Une instance par trace (un joueur suivi/ré-identifié sur tout le match)."""

    def __init__(self):
        self.samples = []  # [(t_seconds, x_norm, y_norm), ...] triés par t, positions calibrées
        self.team = None

    def add_seen(self, team):
        if team and self.team is None:
            self.team = team

    def add_position(self, t, x_norm, y_norm):
        self.samples.append((t, x_norm, y_norm))


def _speed_series_ms(samples):
    """Vitesse (m/s) entre échantillons successifs, à partir de positions normalisées 0-1
    reconverties en mètres (convention du site : x=largeur 68m, y=longueur 105m)."""
    speeds = []
    for (t0, x0, y0), (t1, x1, y1) in zip(samples, samples[1:]):
        dt = t1 - t0
        if dt <= 0:
            continue
        dx_m = (x1 - x0) * PITCH_WIDTH_M
        dy_m = (y1 - y0) * PITCH_LENGTH_M
        dist_m = (dx_m ** 2 + dy_m ** 2) ** 0.5
        v = dist_m / dt
        if v > MAX_PLAUSIBLE_SPEED_MS:
            continue  # position "téléportée" (calibration ponctuellement mauvaise) - segment ignoré
        speeds.append((t1, v, dist_m))
    return speeds  # [(t, vitesse_m_s, distance_segment_m), ...]


def compute_player_physical(samples):
    """samples : [(t_seconds, x_norm, y_norm), ...] pour une trace. Retourne le sous-objet
    'players[id]' du schéma (hors heatmapPoints/visibleCoverage, ajoutés séparément), ou None si
    la trace n'a pas assez de positions pour calculer quoi que ce soit d'utile."""
    if len(samples) < 2:
        return None
    speed_series = _speed_series_ms(samples)
    if not speed_series:
        return None

    distance_m = sum(d for _, _, d in speed_series)
    top_speed_ms = max(v for _, v, _ in speed_series)
    high_intensity_m = sum(d for _, v, d in speed_series if v >= HIGH_INTENSITY_SPEED_MS)

    sprints = 0
    in_sprint = False
    sprint_start = speed_series[0][0]
    for t, v, _ in speed_series:
        if v >= SPRINT_SPEED_MS:
            if not in_sprint:
                in_sprint = True
                sprint_start = t
        else:
            if in_sprint and (t - sprint_start) >= SPRINT_MIN_DURATION_S:
                sprints += 1
            in_sprint = False
    if in_sprint and (speed_series[-1][0] - sprint_start) >= SPRINT_MIN_DURATION_S:
        sprints += 1

    accelerations = decelerations = 0
    for (t0, v0, _), (t1, v1, _) in zip(speed_series, speed_series[1:]):
        dt = t1 - t0
        if dt <= 0:
            continue
        a = (v1 - v0) / dt
        if a >= ACCEL_THRESHOLD_MS2:
            accelerations += 1
        elif a <= -ACCEL_THRESHOLD_MS2:
            decelerations += 1

    return {
        "distanceCovered": round(distance_m),
        "sprints": sprints,
        "topSpeed": round(top_speed_ms * 3.6, 1),
        "highIntensityDistance": round(high_intensity_m),
        "accelerations": accelerations,
        "decelerations": decelerations,
    }


def compute_heatmap_points(samples, max_points=200):
    """Sous-échantillonne si besoin — le site n'a pas besoin de milliers de points pour une
    heatmap lisible (generateMockAdvancedAnalytics() en génère ~20-30 par joueur)."""
    if not samples:
        return []
    step = max(1, len(samples) // max_points)
    return [{"x": round(x, 3), "y": round(y, 3), "t": round(t)} for t, x, y in samples[::step]]


def compute_team_shape(frame_team_positions):
    """frame_team_positions : une entrée par frame échantillonnée où AU MOINS UN joueur de cette
    équipe a été positionné, chaque entrée étant la liste de ses (x_norm, y_norm) ce coup-ci. Les
    frames avec trop peu de joueurs visibles ensemble sont ignorées (cf. TEAM_SHAPE_MIN_PLAYERS) —
    sur une vidéo follow cam, la majorité des frames n'ont pas toute l'équipe à l'écran, donc cette
    métrique est échantillonnée sur les moments où le plan est assez large, pas continue."""
    heights, widths, depths = [], [], []
    for positions in frame_team_positions:
        if len(positions) < TEAM_SHAPE_MIN_PLAYERS:
            continue
        xs = [x for x, _ in positions]
        ys = [y for _, y in positions]
        heights.append(sum(ys) / len(ys))
        widths.append(max(xs) - min(xs))
        depths.append(max(ys) - min(ys))
    if not heights:
        return {"avgBlockHeight": None, "avgWidth": None, "avgDepth": None, "ppda": None}
    return {
        "avgBlockHeight": round(sum(heights) / len(heights), 3),
        "avgWidth": round(sum(widths) / len(widths), 3),
        "avgDepth": round(sum(depths) / len(depths), 3),
        "ppda": None,  # nécessite une détection d'actions défensives - hors scope de cette V1
    }
