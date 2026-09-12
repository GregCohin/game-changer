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

echo "Prêt. Active l'environnement avec : source video-pipeline/.venv/bin/activate"
