"""Détection des joueurs sur le panorama, mise en cache pour itérer sur le suivi sans relancer le modèle.

Usage : python -m panorama.detect <début_s> <durée_s> <images_par_s>
"""
import pickle
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama.config import PANORAMA_OUT, open_panorama, panorama_band

ROOT = Path(__file__).parent.parent
OUT = Path(PANORAMA_OUT) if PANORAMA_OUT else ROOT / "output" / "panorama"
BAND_Y0, BAND_Y1 = panorama_band()   # bande de l'image (pixels bruts) où se trouve le terrain, ligne de touche proche comprise ; PANORAMA_BAND
WEIGHTS = ROOT / "weights" / "yolov8m-640-football-players.pt"


def torso_color(band, b):
    """Médiane HSV des pixels non-herbe du torse (centre de la boîte, 8-45 % de la hauteur) : les
    joueurs font ~23 px, la moyenne de la boîte entière serait dominée par la pelouse."""
    x1, y1, x2, y2 = b
    w, h = x2 - x1, y2 - y1
    xa, xb = int(round(x1 + 0.25 * w)), int(round(x2 - 0.25 * w))
    ya, yb = int(round(y1 + 0.08 * h)), int(round(y1 + 0.45 * h))
    if xb <= xa or yb <= ya:
        return None
    reg = band[max(0, ya):yb, max(0, xa):xb]
    if reg.size == 0:
        return None
    hsv = cv2.cvtColor(reg, cv2.COLOR_BGR2HSV).reshape(-1, 3)
    keep = hsv[~((hsv[:, 0] >= 40) & (hsv[:, 0] <= 95) & (hsv[:, 1] > 50))]
    if len(keep) < 3:
        return None
    return [float(np.median(keep[:, 0])), float(np.median(keep[:, 1])), float(np.median(keep[:, 2])), float(len(keep))]


def detect_frame(model, frame):
    band = frame[BAND_Y0:BAND_Y1, :]
    r = model(band, imgsz=1664, conf=0.2, device="mps", verbose=False, classes=[1, 2, 3])[0]
    dets = []
    for b, c, cl in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.conf.cpu().numpy(), r.boxes.cls.cpu().numpy().astype(int)):
        dets.append(dict(box=[float(b[0]), float(b[1] + BAND_Y0), float(b[2]), float(b[3] + BAND_Y0)],
                         conf=float(c), cls=int(cl), color=torso_color(band, b)))
    return dets


def detect(start, dur, fps):
    model = YOLO(str(WEIGHTS))
    cap = open_panorama()
    native = cap.get(cv2.CAP_PROP_FPS)
    step = round(native / fps)
    cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
    idx0 = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
    end = idx0 + int(dur * native)
    frames = []
    t0 = time.time()
    idx = idx0
    while idx < end and cap.grab():
        if (idx - idx0) % step == 0:
            ok, f = cap.retrieve()
            frames.append(dict(t=idx / native, dets=detect_frame(model, f)))
            if len(frames) % 300 == 0:
                print(f"{len(frames)} images, {time.time() - t0:.0f} s", flush=True)
        idx += 1
    path = OUT / f"det_{int(start)}_{int(dur)}_{int(fps)}.pkl"
    pickle.dump(dict(frames=frames, fps=fps), open(path, "wb"))
    print(f"terminé : {len(frames)} images en {time.time() - t0:.0f} s -> {path.name}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    detect(float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]))
