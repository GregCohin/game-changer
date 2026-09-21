"""Vérité terrain de l'équipe (sombre / claire) par observation humaine : planches de vignettes du panoramique
tirées au hasard parmi les pistes, à étiqueter à l'œil, puis comparées au classement automatique.

Usage : python -m panorama.teamlabel sample [n]     # tire n pistes et écrit les planches dans output/panorama/teamlabel/
"""
import json
import pickle
import random
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama.geometry import PanoramaModel
from panorama.config import open_panorama
from panorama.identify import load_tracklets

DIR = T.OUT / "teamlabel"
CAL = T.OUT / "calibration_finale.json"
OUT_W, OUT_H = 150, 108       # taille d'une vignette de la planche (px)
COLS, ROWS = 6, 8
HFRAC = 0.21                  # hauteur d'un joueur en px ~ HFRAC x (distance du pied à l'horizon)


def sample(n, seed=7, subdir=None):
    out = DIR if subdir is None else DIR / subdir
    rnd = random.Random(seed)
    tls = [t for t in load_tracklets(min_hits=20)]
    w = np.array([t.t1 - t.t0 for t in tls], float)
    idx = list(np.random.default_rng(seed).choice(len(tls), size=n, replace=False, p=w / w.sum()))
    model = PanoramaModel.from_json(CAL)
    cap = open_panorama()
    items = []
    for i in idx:
        tl = tls[int(i)]
        k = rnd.randrange(len(tl.t))
        items.append(dict(id=f"{tl.id[0]}-{tl.id[1]}", t=float(tl.t[k]), X=float(tl.X[k]), Y=float(tl.Y[k]), dur=float(tl.t1 - tl.t0)))
    items.sort(key=lambda d: d["t"])
    out.mkdir(exist_ok=True, parents=True)
    cells = []
    for d in items:
        cap.set(cv2.CAP_PROP_POS_MSEC, d["t"] * 1000)
        ok, f = cap.read()
        u, v = model.project(np.array([[d["X"], d["Y"]]]))[0]
        h = HFRAC * (v - (model.vh + model.s * (u - model.u0)))
        x0, x1, y0, y1 = u - 0.9 * h, u + 0.9 * h, v - 1.15 * h, v + 0.15 * h
        M = np.array([[OUT_W / (x1 - x0), 0, -x0 * OUT_W / (x1 - x0)], [0, OUT_H / (y1 - y0), -y0 * OUT_H / (y1 - y0)]])
        big = cv2.warpAffine(f, M, (OUT_W, OUT_H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
        bx0, bx1 = (u - 0.22 * h - x0) * OUT_W / (x1 - x0), (u + 0.22 * h - x0) * OUT_W / (x1 - x0)
        by0, by1 = (v - h - y0) * OUT_H / (y1 - y0), (v - y0) * OUT_H / (y1 - y0)
        cv2.rectangle(big, (int(bx0), int(by0)), (int(bx1), int(by1)), (0, 0, 255), 1)
        cells.append(big)
    for s in range(0, len(cells), COLS * ROWS):
        chunk = cells[s:s + COLS * ROWS]
        sheet = np.full((ROWS * (OUT_H + 14), COLS * OUT_W, 3), 30, np.uint8)
        for j, c in enumerate(chunk):
            r, cc = divmod(j, COLS)
            y, x = r * (OUT_H + 14), cc * OUT_W
            sheet[y + 14:y + 14 + OUT_H, x:x + OUT_W] = c
            cv2.putText(sheet, str(s + j), (x + 3, y + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        cv2.imwrite(str(out / f"planche_{s // (COLS * ROWS):02d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 92])
    json.dump(items, open(out / "echantillon.json", "w"), indent=1)
    print(len(items), "pistes tirées ;", (len(items) + COLS * ROWS - 1) // (COLS * ROWS), "planches dans", out)


if __name__ == "__main__":
    if sys.argv[1] == "sample":
        sample(int(sys.argv[2]) if len(sys.argv) > 2 else 240, int(sys.argv[3]) if len(sys.argv) > 3 else 7, sys.argv[4] if len(sys.argv) > 4 else None)
