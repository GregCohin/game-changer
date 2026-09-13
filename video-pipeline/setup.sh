#!/usr/bin/env bash
# Prépare l'environnement du pipeline : clone PnLCalib (calibration terrain, vendored,
# non versionné — voir .gitignore), télécharge ses poids single-view, crée le venv et
# installe les dépendances. À relancer tel quel sur Colab ou une autre machine.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d vendor/PnLCalib ]; then
  mkdir -p vendor
  git clone --depth 1 https://github.com/mguti97/PnLCalib.git vendor/PnLCalib
fi

mkdir -p vendor/PnLCalib/weights
for f in SV_kp SV_lines; do
  if [ ! -f "vendor/PnLCalib/weights/$f" ]; then
    curl -fL -o "vendor/PnLCalib/weights/$f" \
      "https://github.com/mguti97/PnLCalib/releases/download/v1.0.0/$f"
  fi
done

python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# Poids de ré-identification (OSNet x0.25, réentraîné MSMT17) — via gdown car hébergés sur Google
# Drive par le zoo de modèles torchreid, pas de release GitHub classique pour ce modèle.
mkdir -p weights
if [ ! -f weights/osnet_x0_25_msmt17.pt ]; then
  .venv/bin/python -c "
import gdown
gdown.download('https://drive.google.com/uc?id=1Kkx2zW89jq_NETu4u42CFZTMVD5Hwm6e', 'weights/osnet_x0_25_msmt17.pt', quiet=False)
"
fi

# Détecteur football dédié (YOLOv8m réentraîné sur le jeu "football-players-detection" de Roboflow,
# poids partagés par Darkmyter/Football-Players-Tracking) — détecte nettement plus de joueurs que
# YOLO générique (COCO "person") sur des vidéos de match réelles, et sépare arbitre/gardien/joueur/
# ballon nativement. Là aussi via gdown, pas de release GitHub.
if [ ! -f weights/yolov8m-640-football-players.pt ]; then
  .venv/bin/python -c "
import gdown
gdown.download('https://drive.google.com/uc?id=1GWvf50u4yTep9pcF_ReDajnISsUtzvln', 'weights/yolov8m-640-football-players.pt', quiet=False)
"
fi

echo "Prêt. Active l'environnement avec : source video-pipeline/.venv/bin/activate"
