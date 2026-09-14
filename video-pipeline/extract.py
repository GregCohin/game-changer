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
import os
import pickle
from collections import defaultdict

import cv2
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform
from tqdm import tqdm

from calibration import Calibrator, image_to_pitch_norm
from tracking import (
    Tracker, cluster_tracks_globally, split_implausible_tracks, _boundary_transition_plausible,
)
from metrics import (
    TrackAccumulator, compute_player_physical, compute_heatmap_points, compute_team_shape,
    smooth_track_samples,
)
from overlay import draw_debug_frame, DebugVideoWriter
from jersey_ocr import JerseyReader

# Taux de détection réel mesuré sur extrait (seuils EasyOCR assouplis, cf. jersey_ocr.py) : ~1-2%
# des tentatives seulement aboutissent à une lecture exploitable (numéro rarement visible/net -
# joueur de dos, en mouvement, loin caméra). Testé sur deux extraits (3 min et 12 min) : à ce taux,
# la fusion automatique par numéro n'a quasiment aucune occasion de jouer (490 -> 492 traces, effet
# net nul voire négatif) - contrairement au recadrage de l'embedding (cf. REID_CROP_Y_START_FRAC
# dans tracking.py), qui lui réduit vraiment la fragmentation. L'OCR reste utile pour la REVUE
# assistée (suggestion affichée à l'humain, cf. --review-out) mais coûte ~60-75% de temps de calcul
# en plus à débit 1 - pas justifié sur un run complet (13h+) pour un gain automatique non confirmé.
# D'où un débit configurable : élevé (quasi désactivé) par défaut sur un run long, réduit
# explicitement (--jersey-ocr-every-n 1) sur un run court dédié à la revue.
JERSEY_OCR_EVERY_N_DEFAULT = 1000000


def _label(team, track_id):
    return f"{team or '?'}#{track_id}"


def _save_checkpoint(path, state):
    """Écriture atomique (fichier temporaire puis renommage) pour ne jamais laisser un checkpoint
    à moitié écrit si le process s'arrête pendant la sauvegarde — un run long (match complet sur
    Colab) peut se faire couper à tout moment (déconnexion de session, mise en veille de la machine
    qui héberge le navigateur)."""
    tmp = f"{path}.tmp"
    with open(tmp, "wb") as fh:
        pickle.dump(state, fh)
    os.replace(tmp, path)


def _load_checkpoint(path):
    with open(path, "rb") as fh:
        return pickle.load(fh)


def run(video_path, sample_fps, device, max_seconds=None, debug_overlay_path=None, start_seconds=0.0,
        checkpoint_path=None, checkpoint_every=300, resume=False, jersey_ocr_every_n=JERSEY_OCR_EVERY_N_DEFAULT):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise SystemExit(f"Impossible d'ouvrir la vidéo : {video_path}")
    native_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_step = max(1, round(native_fps / sample_fps))

    # Reprise après coupure (déconnexion Colab, mise en veille de la machine qui héberge le
    # navigateur — vécu deux fois en local pendant ce chantier) : un run long doit pouvoir repartir
    # d'un checkpoint plutôt que de tout refaire depuis le début.
    accumulators = {}
    team_frame_positions = defaultdict(list)
    total_sampled = 0
    calibrated_sampled = 0
    reid_merges = reid_opportunities = 0
    resume_frame_idx = None
    if resume and checkpoint_path and os.path.isfile(checkpoint_path):
        state = _load_checkpoint(checkpoint_path)
        accumulators = state["accumulators"]
        team_frame_positions = defaultdict(list, state["team_frame_positions"])
        total_sampled = state["total_sampled"]
        calibrated_sampled = state["calibrated_sampled"]
        reid_merges = state["reid_merges"]
        reid_opportunities = state["reid_opportunities"]
        resume_frame_idx = state["frame_idx"]
        print(f"Reprise depuis le checkpoint : {total_sampled} frames déjà traitées, "
              f"{len(accumulators)} traces en cours.")

    if resume_frame_idx is not None:
        cap.set(cv2.CAP_PROP_POS_FRAMES, resume_frame_idx)
    elif start_seconds:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_seconds * 1000)
    frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES))  # position réelle après seek (keyframe le plus proche)
    max_frames = frame_idx + int(max_seconds * native_fps) if max_seconds else total_frames

    calibrator = Calibrator(width, height, device=device)
    # frame_rate décrit la base de temps des `timestamp=` passés à chaque update() (le fps natif de
    # la vidéo), pas la fréquence à laquelle on appelle update() (fréquence d'échantillonnage,
    # généralement plus basse) — les deux sont indépendants une fois qu'on fournit un timestamp
    # explicite. Les confondre fait échouer la confirmation de toute trace (vérifié empiriquement).
    tracker = Tracker(device=device, frame_rate=native_fps)
    jersey_reader = JerseyReader(device=device)
    # Repartir d'un checkpoint perd l'état interne du tracker (couleurs d'équipe calibrées, galerie
    # de traces "perdues" récemment) — recalibré en quelques secondes, effet secondaire mineur
    # accepté plutôt que de sérialiser des modèles PyTorch entiers à chaque checkpoint.
    tracker.reid.merges, tracker.reid.opportunities = reid_merges, reid_opportunities

    pbar = tqdm(total=min(total_frames, max_frames - frame_idx) // frame_step, desc="Extraction")

    overlay_writer = None
    if debug_overlay_path:
        overlay_writer = DebugVideoWriter(debug_overlay_path, sample_fps, width, height)

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
            acc.add_embedding(p["embedding"])
            acc.update_thumbnail(t, frame, p["box"])
            if total_sampled % jersey_ocr_every_n == 0:
                acc.add_jersey_reading(jersey_reader.read(frame, p["box"]))
            if homography is not None:
                pos = image_to_pitch_norm(homography, p["px"], p["py"])
                if pos is not None:
                    acc.add_position(t, *pos)
                    if p["team"] in ("A", "B"):
                        frame_positions_by_team[p["team"]].append(pos)
        for team, positions in frame_positions_by_team.items():
            team_frame_positions[team].append(positions)

        if checkpoint_path and total_sampled % checkpoint_every == 0:
            _save_checkpoint(checkpoint_path, {
                "accumulators": accumulators,
                "team_frame_positions": dict(team_frame_positions),
                "total_sampled": total_sampled,
                "calibrated_sampled": calibrated_sampled,
                "reid_merges": tracker.reid.merges,
                "reid_opportunities": tracker.reid.opportunities,
                "frame_idx": frame_idx + 1,
            })

        if overlay_writer is not None:
            overlay_writer.write(draw_debug_frame(frame, players, homography is not None, frame_positions_by_team))

        frame_idx += 1
        pbar.update(1)

    pbar.close()
    cap.release()
    if overlay_writer is not None:
        overlay_writer.release()
    return accumulators, team_frame_positions, total_sampled, calibrated_sampled, tracker.reid


def _resolve_roster_merges(accumulators, roster_map):
    """Regroupe les traces qui pointent vers le MÊME joueur une fois le roster appliqué. Nécessaire
    depuis l'outil de revue assistée : il attribue un numéro par trace indépendamment, donc
    plusieurs traces différentes reçoivent légitimement le même numéro dès que Gregory identifie
    deux fragments comme le même joueur — c'est précisément comme ça que la revue comble ce que le
    regroupement automatique n'a pas fusionné. Sans ce passage, ces traces s'écraseraient l'une
    l'autre dans players_out au lieu de s'additionner. Fusionne les échantillons bruts (même
    logique que cluster_tracks_globally) plutôt que de recombiner des stats déjà agrégées —
    topSpeed/sprints/etc. ne s'additionnent pas correctement après coup.

    Revalide chaque groupe avec la MÊME contrainte physique que le regroupement automatique
    (chevauchement temporel / transition impossible) avant de fusionner — une identité humaine
    reste une entrée sujette à erreur (numéro mal lu, ou vignettes identiques trompeuses avant le
    correctif du 2026-09-14 qui faisait hériter la même image à des morceaux différents). Repéré
    concrètement ce soir-là : un même numéro assigné à 13 traces qui se chevauchaient massivement
    dans le temps (70 conflits sur 78 paires) — sans cette vérification, ç'aurait produit un
    "joueur" à 9km parcourus et 136 sprints, statistiquement impossible."""
    if not roster_map:
        return accumulators
    groups = {}
    for key, acc in accumulators.items():
        team_prefix, num = key.split("#", 1)
        player_id = roster_map.get(team_prefix, {}).get(num)
        groups.setdefault(player_id or key, []).append((key, acc))

    merged = {}
    for out_key, items in groups.items():
        if len(items) == 1:
            merged[out_key] = items[0][1]
            continue

        n = len(items)
        dist = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                acc_i, acc_j = items[i][1], items[j][1]
                if acc_i.time_range is None or acc_j.time_range is None:
                    continue
                (t0i, t1i), (t0j, t1j) = acc_i.time_range, acc_j.time_range
                if t0i <= t1j and t0j <= t1i:
                    incompatible = True
                else:
                    earlier, later = (acc_i, acc_j) if t1i <= t0j else (acc_j, acc_i)
                    incompatible = not _boundary_transition_plausible(earlier, later)
                dist[i, j] = dist[j, i] = 10.0 if incompatible else 0.0

        labels = fcluster(linkage(squareform(dist, checks=False), method="complete"),
                           t=5.0, criterion="distance")
        subgroups = {}
        for (key, acc), label in zip(items, labels):
            subgroups.setdefault(label, []).append((key, acc))

        if len(subgroups) > 1:
            print(f"ATTENTION — \"{out_key}\" assigné à {n} traces mais {len(subgroups)} "
                  f"sous-ensembles physiquement incompatibles entre eux détectés (tailles "
                  f"{[len(g) for g in subgroups.values()]}) — probable confusion entre plusieurs "
                  f"joueurs réels. Séparés plutôt que fusionnés à tort ; à vérifier manuellement.")

        for i, sub_items in enumerate(subgroups.values()):
            sub_key = out_key if len(subgroups) == 1 else f"{out_key}~conflit{i}"
            if len(sub_items) == 1:
                merged[sub_key] = sub_items[0][1]
                continue
            combined = TrackAccumulator()
            combined.team = sub_items[0][1].team
            for _, acc in sub_items:
                combined.samples.extend(acc.samples)
            combined.samples.sort(key=lambda s: s[0])
            merged[sub_key] = combined
    return merged


def build_analytics(accumulators, team_frame_positions, total_sampled, roster_map):
    accumulators = _resolve_roster_merges(accumulators, roster_map)
    players_out = {}
    for key, acc in accumulators.items():
        physical = compute_player_physical(acc.samples)
        if physical is None:
            continue
        # Couverture = fraction du match (échantillonné) où CE joueur a pu être positionné —
        # pas fraction de ses seules apparitions à l'écran. Un joueur souvent hors champ doit
        # ressortir avec une couverture basse, pas 1.0 juste parce que les frames où on l'a vu
        # étaient toutes calibrables.
        coverage = round(len(acc.samples) / total_sampled, 3) if total_sampled else 0.0
        if coverage > 1.0:
            # Mathématiquement impossible sauf fusion incorrecte (deux joueurs réels fusionnés en
            # un seul, déjà rencontré) — mieux vaut le signaler bruyamment que livrer silencieusement
            # une donnée fausse.
            print(f"ATTENTION — couverture impossible ({coverage}) pour {key}, "
                  f"probable fusion incorrecte de deux joueurs distincts.")
            coverage = min(coverage, 1.0)
        players_out[key] = {
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


MIN_SAMPLES_FOR_REVIEW = 5  # trace en dessous -> fragment trop court pour valoir une revue humaine


def export_review_manifest(accumulators, out_dir, total_sampled):
    """Écrit une vignette + une fiche par trace assez couverte pour valoir une revue humaine —
    matière première de l'outil de rattachement assisté (cf. discussion du 2026-09-14 : l'auto à
    100% a une limite réelle sur cette vidéo, ceci sert à s'en rapprocher via confirmation humaine
    plutôt qu'à continuer d'aveugler l'automatique)."""
    thumb_dir = os.path.join(out_dir, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    entries = []
    for key, acc in accumulators.items():
        if len(acc.samples) < MIN_SAMPLES_FOR_REVIEW:
            continue
        team_prefix = key.split("#", 1)[0]
        thumb_name = None
        if acc.thumbnail_candidates:
            best = max(acc.thumbnail_candidates, key=lambda c: c[1])
            thumb_name = f"{key.replace('#', '_').replace('~', '-')}.jpg"
            with open(os.path.join(thumb_dir, thumb_name), "wb") as fh:
                fh.write(best[2])
        entries.append({
            "key": key,
            "team": team_prefix if team_prefix in ("A", "B") else None,
            "samples": len(acc.samples),
            "coverage": round(len(acc.samples) / total_sampled, 3) if total_sampled else 0.0,
            "timeRange": list(acc.time_range) if acc.time_range else None,
            "majorityJersey": acc.majority_jersey,
            "jerseyReadings": [[n, round(c, 2)] for n, c in acc.jersey_readings],
            "thumbnail": f"thumbnails/{thumb_name}" if thumb_name else None,
        })
    entries.sort(key=lambda e: -e["samples"])
    with open(os.path.join(out_dir, "manifest.json"), "w") as fh:
        json.dump(entries, fh, ensure_ascii=False, indent=2)
    return len(entries)


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
    parser.add_argument("--checkpoint", default=None,
                         help="Chemin d'un fichier de reprise, sauvegardé régulièrement pendant le "
                              "traitement — utile pour un run long (match complet) qui risque d'être "
                              "coupé (déconnexion Colab, mise en veille de la machine). Idéalement "
                              "sur un stockage qui survit à la session (ex. Google Drive monté).")
    parser.add_argument("--checkpoint-every", type=int, default=300,
                         help="Sauvegarde le checkpoint tous les N échantillons traités (def. 300).")
    parser.add_argument("--resume", action="store_true",
                         help="Reprend depuis --checkpoint s'il existe, au lieu de repartir de zéro.")
    parser.add_argument("--jersey-ocr-every-n", type=int, default=JERSEY_OCR_EVERY_N_DEFAULT,
                         help="Lit le numéro de maillot 1 frame échantillonnée sur N (par joueur). "
                              "Par défaut quasi désactivé (coûte ~60-75%% de temps de calcul à N=1, "
                              "cf. commentaire plus haut) - mettre 1 pour un run court dédié à la "
                              "revue assistée (--review-out), où la suggestion affichée à l'humain "
                              "vaut le coût sur une durée courte.")
    parser.add_argument("--review-out", default=None,
                         help="Dossier où écrire vignettes + manifest.json pour l'outil de "
                              "rattachement assisté (une entrée par trace d'au moins "
                              f"{MIN_SAMPLES_FOR_REVIEW} échantillons). Omis -> pas d'export.")
    args = parser.parse_args()

    roster_map = None
    if args.roster:
        with open(args.roster) as fh:
            roster_map = json.load(fh)

    accumulators, team_frame_positions, total_sampled, calibrated_sampled, reid = run(
        args.video, args.sample_fps, args.device, args.max_seconds, args.debug_overlay, args.start_seconds,
        args.checkpoint, args.checkpoint_every, args.resume, args.jersey_ocr_every_n
    )
    # Lissage AVANT toute détection de saut implausible : la calibration recalcule chaque frame
    # indépendamment (nécessaire pour une caméra qui bouge), donc même un joueur immobile peut
    # sauter d'une frame à l'autre par simple instabilité du calage terrain, pas par confusion
    # d'identité — repéré concrètement sur un match complet (cf. discussion avec Gregory). Lisser en
    # premier réduit les faux positifs des étapes suivantes (découpage, regroupement), qui restent
    # un filet de sécurité utile pour les vraies confusions d'identité, pas le problème principal.
    for acc in accumulators.values():
        acc.samples = smooth_track_samples(acc.samples)

    n_before = len(accumulators)
    accumulators = split_implausible_tracks(accumulators)
    n_after_split = len(accumulators)
    accumulators = cluster_tracks_globally(accumulators)
    n_after_cluster = len(accumulators)
    # Filet de sécurité : le regroupement (fusions à 3+ morceaux, cas de transitivité pas encore
    # entièrement tracé) peut réintroduire un saut interne implausible même après le découpage
    # initial. Redécouper ici ne fait que séparer, jamais fusionner — sans risque, et garantit un
    # résultat final propre par construction plutôt que de dépendre d'avoir trouvé la cause exacte.
    accumulators = split_implausible_tracks(accumulators)
    analytics = build_analytics(accumulators, team_frame_positions, total_sampled, roster_map)

    with open(args.out, "w") as fh:
        json.dump(analytics, fh, ensure_ascii=False, indent=2)

    print(f"Ré-identification en flux : {reid.merges} fusion(s) sur {reid.opportunities} occasion(s) "
          f"(trace jamais vue avec un candidat récent de la même équipe disponible).")
    print(f"Découpage (traces contaminées par la ré-id en flux) : {n_before} -> {n_after_split} traces.")
    print(f"Regroupement global : {n_after_split} -> {n_after_cluster} traces.")
    print(f"Redécoupage final (filet de sécurité) : {n_after_cluster} -> {len(accumulators)} traces.")
    calib_pct = round(100 * calibrated_sampled / total_sampled) if total_sampled else 0
    print(f"OK — {len(analytics['players'])} joueur(s) suivi(s) sur {total_sampled} frames "
          f"échantillonnées ({calib_pct}% calibrées) -> {args.out}")

    if args.review_out:
        n_review = export_review_manifest(accumulators, args.review_out, total_sampled)
        print(f"Revue assistée : {n_review} trace(s) exportée(s) (vignettes + manifest.json) "
              f"-> {args.review_out}")
