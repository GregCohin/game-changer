"""Accumulation des trajectoires par trace et calcul des métriques du schéma
emptyAdvancedAnalytics() (src/App.jsx:24349) — physique par joueur, heatmap, forme d'équipe.
Unités alignées sur generateMockAdvancedAnalytics() (src/App.jsx:24362) : distances en mètres,
vitesse en km/h.
"""
from collections import Counter

import cv2
import numpy as np

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

SMOOTH_WINDOW = 7  # nb d'échantillons (centré) pour le filtre médian anti-bruit de calibration -
                    # valeur choisie empiriquement (3/5/7/9 testés sur le même extrait réel de 90s) :
                    # meilleur résultat obtenu à 7 (couverture max 38%, vitesses redescendues à des
                    # niveaux plausibles), gains marginaux/mitigés au-delà.

THUMBNAIL_CANDIDATES_MAX = 8  # nb de vignettes candidates gardées par trace (cf. TrackAccumulator.
                               # update_thumbnail) - assez pour qu'un découpage ultérieur retrouve
                               # presque toujours un candidat dans la plage de temps de chaque
                               # morceau, sans faire grossir le checkpoint de façon excessive.

PITCH_WIDTH_M = 68.0
PITCH_LENGTH_M = 105.0

# Vote majoritaire du numéro de maillot (jersey_ocr.JerseyReader) - seuils pour qu'une trace obtienne
# un numéro "confiant" utilisable comme contrainte de regroupement (tracking.cluster_tracks_globally).
# Une seule lecture, même à confiance individuelle correcte, ne suffit jamais (cf. jersey_ocr.py) :
# il faut un vrai consensus sur plusieurs lectures indépendantes.
JERSEY_MIN_CONFIDENT_READS = 3
JERSEY_MIN_READ_CONFIDENCE = 0.5
JERSEY_MIN_AGREEMENT = 0.6  # part des lectures confiantes qui doivent tomber sur le même numéro


def smooth_track_samples(samples, window=SMOOTH_WINDOW):
    """Filtre médian (par axe, fenêtre glissante centrée) sur une trace continue — corrige le
    vrai problème trouvé en testant sur un match complet : la calibration recalcule chaque frame
    indépendamment (nécessaire pour une caméra qui bouge, cf. calibration.py), donc même un joueur
    immobile peut voir sa position projetée sauter d'une frame à l'autre par simple instabilité du
    calage terrain — PAS une confusion d'identité. Vérifié concrètement : une trace jamais fusionnée
    ni découpée montrait des vitesses oscillant entre 0,9 et 42 m/s frame à frame ; un simple filtre
    médian sur fenêtre 3 fait tomber l'écrasante majorité des segments sous le seuil humain plausible
    (MAX_PLAUSIBLE_SPEED_MS), qui reste comme filet de sécurité pour ce qu'il en reste.

    Ne suppose pas un échantillonnage régulier (un index-based, pas time-based) — approximation
    acceptée : les trous (frames sans calibration) sont déjà rares individuellement dans une trace
    continue, la fenêtre glissante par index reste une bonne approximation d'une fenêtre temporelle."""
    if len(samples) < 3 or window < 3:
        return samples
    half = window // 2
    smoothed = []
    for i in range(len(samples)):
        lo, hi = max(0, i - half), min(len(samples), i + half + 1)
        window_slice = samples[lo:hi]
        xs = sorted(s[1] for s in window_slice)
        ys = sorted(s[2] for s in window_slice)
        mid = len(window_slice) // 2
        smoothed.append((samples[i][0], xs[mid], ys[mid]))
    return smoothed


class TrackAccumulator:
    """Une instance par trace (un joueur suivi/ré-identifié en flux sur tout le match — avant le
    regroupement global final, cf. tracking.cluster_tracks_globally)."""

    def __init__(self):
        self.samples = []  # [(t_seconds, x_norm, y_norm), ...] triés par t, positions calibrées
        self.team = None
        self.is_goalkeeper = None  # cf. add_class - signal quasi-sûr (classe YOLO dédiée), pas deviné
        self._embedding_sum = None  # somme courante -> moyenne robuste, pas juste le dernier vu
        self._embedding_count = 0
        self._color_sum = None  # idem pour la signature couleur cheveux/peau/chaussures - cf. add_color
        self._color_count = 0
        self.jersey_readings = []  # [(numero:str, confiance:float), ...] cf. jersey_ocr.JerseyReader
        self.thumbnail_candidates = []  # [(t, box_height, jpeg_bytes), ...] cf. update_thumbnail

    def add_seen(self, team):
        if team and self.team is None:
            self.team = team

    def add_class(self, is_goalkeeper):
        """Verrouille gardien/joueur de champ dès la 1re lecture, comme add_seen pour l'équipe - un
        gardien ne redevient pas joueur de champ en cours de match (cf. tracking._match_class_ids :
        classe YOLO dédiée, pas une couleur devinée)."""
        if is_goalkeeper is not None and self.is_goalkeeper is None:
            self.is_goalkeeper = is_goalkeeper

    def add_position(self, t, x_norm, y_norm):
        self.samples.append((t, x_norm, y_norm))

    def add_embedding(self, embedding):
        if embedding is None:
            return
        if self._embedding_sum is None:
            self._embedding_sum = embedding.copy()
        else:
            self._embedding_sum += embedding
        self._embedding_count += 1

    def add_color(self, color_vec):
        """Signature couleur (cheveux+peau+chaussures, cf. tracking._appearance_color) - moyenne
        courante comme add_embedding, pour la même raison (moins sensible à un angle/une frame
        ponctuellement mal exposée qu'une seule lecture)."""
        if color_vec is None:
            return
        if self._color_sum is None:
            self._color_sum = color_vec.copy()
        else:
            self._color_sum += color_vec
        self._color_count += 1

    def add_jersey_reading(self, reading):
        if reading is not None:
            self.jersey_readings.append(reading)

    def update_thumbnail(self, t, frame_bgr, box):
        """Garde jusqu'à THUMBNAIL_CANDIDATES_MAX vignettes candidates (plan le plus large = boîte
        la plus haute en pixels), chacune horodatée. Nécessaire pour survivre à un découpage
        ultérieur (split_implausible_tracks) : un seul "meilleur" global, hérité tel quel par
        chaque morceau, montrerait la MÊME image sur des morceaux qui peuvent être des joueurs
        différents (c'est justement pour ça qu'ils sont découpés) - repéré concrètement le
        2026-09-14 : Gregory a cohéremment donné le même numéro à des traces qui partageaient une
        vignette identique héritée, alors que ces traces se chevauchaient dans le temps (donc ne
        pouvaient pas être la même personne). Garder plusieurs candidats horodatés permet à chaque
        morceau de reprendre la meilleure vignette DANS SA PROPRE plage de temps."""
        x1, y1, x2, y2 = box
        h = y2 - y1
        cands = self.thumbnail_candidates
        if len(cands) >= THUMBNAIL_CANDIDATES_MAX and h <= min(c[1] for c in cands):
            return
        x1c, y1c = max(0, int(x1) - 10), max(0, int(y1) - 10)
        x2c, y2c = min(frame_bgr.shape[1], int(x2) + 10), min(frame_bgr.shape[0], int(y2) + 10)
        if x2c <= x1c or y2c <= y1c:
            return
        ok, buf = cv2.imencode(".jpg", frame_bgr[y1c:y2c, x1c:x2c], [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            return
        cands.append((t, h, buf.tobytes()))
        cands.sort(key=lambda c: -c[1])
        del cands[THUMBNAIL_CANDIDATES_MAX:]

    def best_thumbnail_in_range(self, t_start, t_end):
        """Meilleure vignette (plus grosse boîte) parmi celles dont l'horodatage tombe dans
        [t_start, t_end] - None si aucun candidat n'est tombé dans cette plage précise (préférable à
        une vignette empruntée à une autre plage, potentiellement trompeuse)."""
        in_range = [c for c in self.thumbnail_candidates if t_start <= c[0] <= t_end]
        if not in_range:
            return None
        return max(in_range, key=lambda c: c[1])[2]

    def composite_review_thumbnail(self, n=3):
        """Vignette de revue = jusqu'à n crops étalés dans le temps, assemblés côte à côte en UNE
        seule image (un seul fichier à stocker/uploader par trace, pas n) - une seule vignette ne
        suffit pas toujours à distinguer deux joueurs qui se ressemblent : cf. revue du 2026-09-15,
        aucun numéro de maillot n'est lisible par OCR sur cette vidéo, donc la revue humaine reposait
        sur la seule reconnaissance visuelle d'une image isolée par trace, ce qui a produit un
        regroupement massif de traces en réalité différentes sous les numéros des joueurs les plus
        reconnaissables. Répartition par plage de TEMPS (pas juste les n meilleures par qualité de
        boîte) : les meilleures vignettes par qualité peuvent toutes venir d'un même passage proche
        caméra et se ressembler autant qu'une seule image - inutile pour la revue. Retourne None si
        la trace n'a aucun candidat (jamais censé arriver pour une trace assez longue pour être
        proposée à la revue, mais pas de raison de planter dessus)."""
        cands = self.thumbnail_candidates
        if not cands:
            return None
        if len(cands) <= n:
            chosen = sorted(cands, key=lambda c: c[0])
        else:
            t_min = min(c[0] for c in cands)
            t_max = max(c[0] for c in cands)
            span = t_max - t_min
            if span <= 0:
                chosen = [max(cands, key=lambda c: c[1])]
            else:
                buckets = [[] for _ in range(n)]
                for c in cands:
                    idx = min(n - 1, int((c[0] - t_min) / span * n))
                    buckets[idx].append(c)
                chosen = sorted((max(b, key=lambda c: c[1]) for b in buckets if b), key=lambda c: c[0])

        imgs = [im for im in (cv2.imdecode(np.frombuffer(c[2], dtype=np.uint8), cv2.IMREAD_COLOR)
                               for c in chosen) if im is not None]
        if not imgs:
            return None
        if len(imgs) == 1:
            composite = imgs[0]
        else:
            target_h = min(im.shape[0] for im in imgs)
            resized = [cv2.resize(im, (max(1, int(im.shape[1] * target_h / im.shape[0])), target_h))
                       for im in imgs]
            sep = np.full((target_h, 3, 3), 255, dtype=np.uint8)
            parts = []
            for i, im in enumerate(resized):
                if i:
                    parts.append(sep)
                parts.append(im)
            composite = np.hstack(parts)
        ok, buf = cv2.imencode(".jpg", composite, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes() if ok else None

    @property
    def majority_jersey(self):
        """Numéro de maillot si un consensus net se dégage sur cette trace, sinon None (pas assez
        de lectures confiantes, ou lectures trop partagées entre plusieurs numéros pour trancher) —
        cf. JERSEY_MIN_* ci-dessus. Volontairement conservateur : ce champ sert de contrainte dure
        au regroupement (deux numéros confiants différents -> jamais le même joueur), une fausse
        confiance coûterait plus cher qu'une trace laissée sans numéro."""
        confident = [(n, c) for n, c in self.jersey_readings if c >= JERSEY_MIN_READ_CONFIDENCE]
        if len(confident) < JERSEY_MIN_CONFIDENT_READS:
            return None
        counts = Counter(n for n, _ in confident)
        number, count = counts.most_common(1)[0]
        if count / len(confident) < JERSEY_MIN_AGREEMENT:
            return None
        return number

    @property
    def mean_embedding(self):
        """Embedding moyen sur toute la durée de la trace — plus robuste qu'un embedding pris sur
        une seule frame pour le regroupement global (moins sensible à un angle/une occlusion
        ponctuelle)."""
        if self._embedding_sum is None:
            return None
        mean = self._embedding_sum / self._embedding_count
        norm = np.linalg.norm(mean)
        return mean / norm if norm > 0 else None

    @property
    def mean_color(self):
        """Signature couleur moyenne (cheveux+peau+chaussures, cf. tracking._appearance_color) sur
        toute la durée de la trace — même raisonnement que mean_embedding. Pas normalisée (contrairement
        à mean_embedding) : ce sont des valeurs HSV brutes comparées par distance euclidienne, pas par
        similarité cosinus, cf. TeamAssigner.assign qui suit déjà ce même principe."""
        if self._color_sum is None:
            return None
        return self._color_sum / self._color_count

    @property
    def time_range(self):
        if not self.samples:
            return None
        return self.samples[0][0], self.samples[-1][0]


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


def _drop_implausible_points(samples):
    """Écarte un point si le déplacement vers OU depuis un voisin immédiat dépasse la vitesse
    humaine plausible — le même filtre que _speed_series_ms applique déjà aux stats agrégées
    (distance, vitesse), mais qui ne touchait jusqu'ici pas la heatmap : un point "téléporté"
    pouvait rester affiché même une fois exclu du calcul de distance/vitesse. Repéré concrètement
    sur le premier match complet traité (des sauts à 27-40 m/s dans les points bruts d'une trace
    par ailleurs déjà fusionnée par le regroupement global — signe probable d'une fusion encore
    incorrecte de deux joueurs différents, cf. discussion avec Gregory)."""
    if len(samples) < 2:
        return samples
    n = len(samples)
    keep = [True] * n
    for i in range(n - 1):
        t0, x0, y0 = samples[i]
        t1, x1, y1 = samples[i + 1]
        dt = t1 - t0
        if dt <= 0:
            continue
        dist_m = (((x1 - x0) * PITCH_WIDTH_M) ** 2 + ((y1 - y0) * PITCH_LENGTH_M) ** 2) ** 0.5
        if dist_m / dt > MAX_PLAUSIBLE_SPEED_MS:
            keep[i] = keep[i + 1] = False
    return [s for s, k in zip(samples, keep) if k]


def compute_heatmap_points(samples, max_points=200):
    """Sous-échantillonne si besoin — le site n'a pas besoin de milliers de points pour une
    heatmap lisible (generateMockAdvancedAnalytics() en génère ~20-30 par joueur)."""
    samples = _drop_implausible_points(samples)
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
