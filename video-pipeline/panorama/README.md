# Pipeline panoramique (caméra fixe Veo)

Suivi de tous les joueurs à partir de la capture d'écran du lecteur Veo en mode panorama, puis chiffres d'équipe (hauteur du bloc, largeur, profondeur) au format du site (`AdvancedAnalyticsPanel`, Statistiques → Tracking vidéo).

## Configuration

Les fichiers locaux sont donnés par variables d'environnement (`config.py`) : jamais dans le dépôt, qui est public.

- `PANORAMA_VIDEO` : capture du lecteur Veo en mode panorama (mp4)
- `FOLLOWCAM_VIDEO` : vidéo de la caméra suiveuse (uniquement pour les vignettes d'identification)
- `NUMBERS_EXPORT` : export « numéros de maillot » du site (contient les noms des joueurs)

Toutes les sorties vont dans `video-pipeline/output/panorama/` (ignoré par git : elles contiennent des données de joueurs, ne jamais les commiter).

## Ordre de travail (depuis `video-pipeline/`, venv activé)

1. Calage : `python -m panorama.calibrate2` → `calibration_v2.json`. Terrain réglementaire 105 × 68 m, lignes blanches ajustées avec `geometry2.PanoramaModel2`. Le premier modèle (`geometry.py`, `calibration_finale.json`) sous-estimait les longueurs près des buts : ne l'utiliser que via `reproject.py`.
2. Détection et suivi : `python -m panorama.match detect` puis `track` (par tranches de 5 min, reprenable).
3. Chiffres d'équipe : `teamfeat_run` (descripteurs), `teamclass` (noir / clair / autre, entraîné sur des vignettes étiquetées à l'œil avec `teamlabel`), `teamshape`, `teamreport` → `resultat_equipe.json`, à importer dans le rapport du match.
4. Identité des joueurs (couverture faible, ~1 %) : `make_cards`, `build_review` (page de revue), `certify_run` (chiffres par joueur sur les seuls tronçons certifiés).

Les mesures sont en mètres réels du modèle v2. Toute valeur publiée doit indiquer la part du match réellement mesurée.
