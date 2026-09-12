#!/usr/bin/env python3
"""Pipeline d'extraction — vidéo de match -> JSON conforme à emptyAdvancedAnalytics() (src/App.jsx).

Portée phase 1 (cf. plan) : physique par joueur, heatmap, forme d'équipe uniquement — pas
d'événements, pas de xG, pas de réseau de passes, pas de PPDA. Conçu pour une caméra qui bouge/
zoome (follow cam), pas un plan large fixe : calibration terrain refaite à chaque frame, joueurs
hors champ une partie du match (cf. visibleCoverage par joueur en sortie).

Usage :
  python extract.py --video match.mp4 --out resultat.json
  python extract.py --video extrait.mp4 --out test.json --max-seconds 180 --device mps

Sans --roster : identités anonymes ("A#3", "B#11", ...) — étape 1a du plan (valider détection +
tracking + calibration avant d'investir dans le rattachement aux vrais joueurs).
Avec --roster mapping.json : fichier {"A": {"<numero>": "<playerId>"}, "B": {...}} — le camp "A"
se construit directement à partir de match.playerAssignments (Studio -> Composition, tel que déjà
saisi dans le site) — étape 1b, sortie indexée par player.id réel.
"""
import argparse
import json
from collections import defaultdict

import cv2
from tqdm import tqdm

from calibration import Calibrator, image_to_pitch_norm
from tracking import Tracker
from metrics import TrackAccumulator, compute_player_physical, compute_heatmap_points, compute_team_shape
from overlay import draw_debug_frame


def _label(team, track_id):
    return f"{team or '?'}#{track_id}"


def run(video_path, sample_fps, device, max_seconds=None, debug_overlay_path=None, start_seconds=0.0):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise SystemExit(f"Impossible d'ouvrir la vidéo : {video_path}")
    native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_step = max(1, round(native_fps / sample_fps))

    if start_seconds:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_seconds * 1000)
    frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))  # position réelle après seek (keyframe le plus proche)
    max_frames = frame_idx + int(max_seconds * native_fps) if max_seconds else total_frames

    calibrator = Calibrator(width, height, device=device)
    # frame_rate décrit la base de temps des `timestamp=` passés à chaque update() (le fps natif de
    # la vidéo), pas la fréquence à laquelle on appelle update() (fréquence d'échantillonnage,
    # généralement plus basse) — les deux sont indépendants une fois qu'on fournit un timestamp
    # explicite. Les confondre fait échouer la confirmation de toute trace (vérifié empiriquement).
    tracker = Tracker(device=device, frame_rate=native_fps)

    accumulators = {}  # label -> TrackAccumulator
    team_frame_positions = defaultdict(list)  # "A"/"B" -> [[(x,y), ...], ...] par frame échantillonnée
    total_sampled = 0
    calibrated_sampled = 0  # nb de frames échantillonnées où la calibration a réussi (diagnostic)
    pbar = tqdm(total=min(total_frames, max_frames - frame_idx) // frame_step, desc="Extraction")

    overlay_writer = None
    if debug_overlay_path:
        overlay_writer = cv2.VideoWriter(
            debug_overlay_path, cv2.VideoWriter_fourcc(*"mp4v"), sample_fps, (width, height)
        )

    while True:
        ret, frame = cap.read()
        if not ret or frame_idx >= max_frames:
            break
        if frame_idx % frame_step != 0:
            frame_idx += 1
            continue

        t = frame_idx / native_fps
        total_sampled += 1

        players, _ball_xy = tracker.process_frame(frame, t)
        homography = calibrator.homography_pitch_to_image(frame)
        if homography is not None:
            calibrated_sampled += 1

        frame_positions_by_team = defaultdict(list)
        for p in players:
            key = _label(p["team"], p["track_id"])
            acc = accumulators.setdefault(key, TrackAccumulator())
            acc.add_seen(p["team"])
            if homography is not None:
                pos = image_to_pitch_norm(homography, p["px"], p["py"])
                if pos is not None:
                    acc.add_position(t, *pos)
                    if p["team"] in ("A", "B"):
                        frame_positions_by_team[p["team"]].append(pos)
        for team, positions in frame_positions_by_team.items():
            team_frame_positions[team].append(positions)

        if overlay_writer is not None:
            overlay_writer.write(draw_debug_frame(frame, players, homography is not None, frame_positions_by_team))

        frame_idx += 1
        pbar.update(1)

    pbar.close()
    cap.release()
    if overlay_writer is not None:
        overlay_writer.release()
    return accumulators, team_frame_positions, total_sampled, calibrated_sampled, tracker.reid


def build_analytics(accumulators, team_frame_positions, total_sampled, roster_map):
    players_out = {}
    for key, acc in accumulators.items():
        physical = compute_player_physical(acc.samples)
        if physical is None:
            continue
        team_prefix, num = key.split("#", 1)
        player_id = roster_map.get(team_prefix, {}).get(num) if roster_map else None
        out_key = player_id or key
        # Couverture = fraction du match (échantillonné) où CE joueur a pu être positionné —
        # pas fraction de ses seules apparitions à l'écran. Un joueur souvent hors champ doit
        # ressortir avec une couverture basse, pas 1.0 juste parce que les frames où on l'a vu
        # étaient toutes calibrables.
        coverage = round(len(acc.samples) / total_sampled, 3) if total_sampled else 0.0
        players_out[out_key] = {
            **physical,
            "heatmapPoints": compute_heatmap_points(acc.samples),
            "visibleCoverage": coverage,
        }

    # Forme d'équipe : uniquement l'équipe "A" (la tienne, roster connu) — comme le reste du
    # schéma existant (team = ton équipe, pas l'adversaire, cf. emptyAdvancedAnalytics()).
    team = compute_team_shape(team_frame_positions.get("A", []))

    return {
        "source": "Pipeline vidéo (auto) — phase 1, portée réduite (physique, heatmap, forme d'équipe)",
        "importedAt": None,
        "players": players_out,
        "team": team,
        "passNetwork": [],
        "preciseEvents": [],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--video", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--sample-fps", type=float, default=5.0,
                         help="Fréquence d'échantillonnage en images/s (def. 5) — pas besoin du "
                              "25-30 im/s natif pour ces métriques.")
    parser.add_argument("--device", default="cpu", help="'cpu' (fiable partout), 'cuda:0', ou "
                         "'mps' (Apple Silicon — plus rapide en local mais couverture d'opérateurs "
                         "PyTorch parfois incomplète selon la version).")
    parser.add_argument("--max-seconds", type=float, default=None,
                         help="Limite la durée traitée, pour un test rapide sur un extrait avant "
                              "de lancer un match complet.")
    parser.add_argument("--start-seconds", type=float, default=0.0,
                         help="Démarre le traitement à ce point de la vidéo (pour un test sur un "
                              "extrait qui évite l'avant-match).")
    parser.add_argument("--roster", default=None,
                         help="Chemin vers un JSON {'A': {'<numero>': '<playerId>'}, 'B': {...}}. "
                              "Omis -> sortie en identités anonymes (étape 1a).")
    parser.add_argument("--debug-overlay", default=None,
                         help="Chemin d'une vidéo de contrôle (points suivis + mini-terrain calibré) "
                              "à générer en plus du JSON — pour le sanity-check visuel sur un extrait "
                              "court avant de lancer un match complet.")
    args = parser.parse_args()

    roster_map = None
    if args.roster:
        with open(args.roster) as fh:
            roster_map = json.load(fh)

    accumulators, team_frame_positions, total_sampled, calibrated_sampled, reid = run(
        args.video, args.sample_fps, args.device, args.max_seconds, args.debug_overlay, args.start_seconds
    )
    analytics = build_analytics(accumulators, team_frame_positions, total_sampled, roster_map)

    with open(args.out, "w") as fh:
        json.dump(analytics, fh, ensure_ascii=False, indent=2)

    print(f"Ré-identification : {reid.merges} fusion(s) sur {reid.opportunities} occasion(s) "
          f"(trace jamais vue avec un candidat récent de la même équipe disponible).")
    calib_pct = round(100 * calibrated_sampled / total_sampled) if total_sampled else 0
    print(f"OK — {len(analytics['players'])} joueur(s) suivi(s) sur {total_sampled} frames "
          f"échantillonnées ({calib_pct}% calibrées) -> {args.out}")
