# Pipeline panoramique (caméra fixe Veo)

Suivi de tous les joueurs à partir de la capture d'écran du lecteur Veo en mode panorama, puis chiffres d'équipe (hauteur du bloc, largeur, profondeur) au format du site (`AdvancedAnalyticsPanel`, Statistiques → Tracking vidéo).

## Configuration

Les fichiers locaux sont donnés par variables d'environnement (`config.py`) : jamais dans le dépôt, qui est public.

- `PANORAMA_VIDEO` : capture du lecteur Veo en mode panorama. Garder l'enregistrement d'origine et ne pas le recompresser : un mp4 recadré à 0,6 Mb/s (au lieu de 8,9 Mb/s) a fait perdre environ 5 % des détections et de la certitude sur l'équipe des joueurs lointains
- `PANORAMA_CROP` : `x,y,largeur,hauteur` de la zone du panorama dans la capture, si elle contient aussi l'interface du lecteur (par exemple `130,14,1660,960` pour une capture 1920x1080). Le recadrage est fait à la lecture, sans réencoder ; sans lui, l'image entière est lue
- `PANORAMA_OUT` : dossier des résultats (défaut `video-pipeline/output/panorama`). Permet de traiter une autre source sans rien écraser ; y copier `calibration_finale.json`, `calibration_v2.json` et `team_model.json`
- `FOLLOWCAM_VIDEO` : vidéo de la caméra suiveuse (uniquement pour les vignettes d'identification)
- `NUMBERS_EXPORT` : export « numéros de maillot » du site (contient les noms des joueurs)

Toutes les sorties vont dans `video-pipeline/output/panorama/` (ignoré par git : elles contiennent des données de joueurs, ne jamais les commiter).

## Ordre de travail (depuis `video-pipeline/`, venv activé)

1. Calage : `python -m panorama.calibrate2` → `calibration_v2.json`. Terrain réglementaire 105 × 68 m, lignes blanches ajustées avec `geometry2.PanoramaModel2`. Le premier modèle (`geometry.py`, `calibration_finale.json`) sous-estimait les longueurs près des buts : ne l'utiliser que via `reproject.py`.
2. Détection et suivi : `python -m panorama.match detect` puis `retrack` (par tranches de 5 min, reprenable ; c'est le suivi v2 qui écrit les `trk2_XXX.pkl` lus ensuite).
3. Chiffres d'équipe : `teamfeat_run` (descripteurs), `teamclass` (noir / clair / autre, entraîné sur des vignettes étiquetées à l'œil avec `teamlabel`), `teamshape` (mesures, ancien repère), `reproject` (`python -m panorama.reproject` : même mesures en mètres du calage v2), `teamreport` → `resultat_equipe.json`, à importer dans le rapport du match.
4. Charge physique d'équipe : `teamload` (plusieurs minutes) → `resultat_charge_detail.json`, puis relancer `teamreport` pour l'ajouter à `resultat_equipe.json` (bloc `team.detail.load`). Distance, haute intensité et sprint par joueur de champ et par minute réellement suivie, nous contre l'adversaire, plus l'évolution de la 1re à la 2e mi-temps (rééchantillonnage apparié des blocs de 5 min entre les deux équipes : l'écart entre les deux évolutions est bien plus précis que chacune seule). L'équipe est décidée par piste, jamais par mesure (un seuil par mesure ne garde que les moments lents) ; la marge de méthode est la dispersion des résultats sur les réglages du lissage, des contacts et du classement.
5. Identité des joueurs (couverture faible, ~1 %) : `make_cards`, `build_review` (page de revue), `certify_run` (chiffres par joueur sur les seuls tronçons certifiés).

Tests sur données synthétiques (aucun fichier du match) : `python -m panorama.test_teamload` et `python -m panorama.test_capture`.

Les mesures sont en mètres réels du modèle v2. Toute valeur publiée doit indiquer la part du match réellement mesurée.
