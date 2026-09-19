"""Vignettes haute résolution prises directement dans la vidéo suiveuse, à l'instant et à l'endroit exacts où une piste
du panoramique a été rattachée (par recalage image par image). On rejoue le calage et la détection sur l'image
pour retrouver la boîte du joueur dont la position correspond à l'échantillon.

Usage : python -m panorama.crops2 test    # 3 images de contrôle
"""
import pickle
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
from calibration import Calibrator, image_to_pitch_norm      # noqa: E402
from tracking import DEFAULT_DETECTION_WEIGHTS               # noqa: E402
from ultralytics import YOLO                                 # noqa: E402

from panorama.config import FOLLOWCAM_VIDEO as FC_VIDEO, require      # chemin fourni par la variable d'environnement FOLLOWCAM_VIDEO
OUT = ROOT / "output" / "panorama"


class FrameCropper:
    def __init__(self, device="cpu"):
        self.cap = cv2.VideoCapture(require(FC_VIDEO, "FOLLOWCAM_VIDEO"))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.calib = Calibrator(int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), device=device)
        self.model = YOLO(str(DEFAULT_DETECTION_WEIGHTS))

    def frame_at(self, t):
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * self.fps)))
        ok, f = self.cap.read()
        return f if ok else None

    def detections(self, frame):
        """[(boîte, (largeur_norm, longueur_norm) ou None)] pour chaque joueur détecté (mêmes réglages que le run v4)."""
        H = self.calib.homography_pitch_to_image(frame)
        if H is None:
            return None
        r = self.model(frame, verbose=False, classes=[1, 2])[0]
        out = []
        for b, c in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.conf.cpu().numpy()):
            if c < 0.3:
                continue
            pos = image_to_pitch_norm(H, (b[0] + b[2]) / 2, b[3])
            out.append((b, pos))
        return out

    @staticmethod
    def crop(frame, box, margin=10):
        x1, y1, x2, y2 = [int(v) for v in box]
        x1c, y1c, x2c, y2c = max(0, x1 - margin), max(0, y1 - margin), min(frame.shape[1], x2 + margin), min(frame.shape[0], y2 + margin)
        return frame[y1c:y2c, x1c:x2c]

    def crop_for_sample(self, t, xw, yl, tol_m=1.5):
        """Recadrage du joueur dont la position calée est la plus proche de l'échantillon (xw, yl), ou None."""
        frame = self.frame_at(t)
        if frame is None:
            return None
        dets = self.detections(frame)
        if not dets:
            return None
        best = None
        for box, pos in dets:
            if pos is None:
                continue
            d = np.hypot((pos[0] - xw) * 68.0, (pos[1] - yl) * 105.0)
            if best is None or d < best[0]:
                best = (d, box)
        if best is None or best[0] > tol_m:
            return None
        return self.crop(frame, best[1]), best[0], float(best[1][3] - best[1][1])


if __name__ == "__main__":
    fc = pickle.load(open(OUT / "followcam.pkl", "rb"))
    samples = {}
    for tr in fc["traces"]:
        if tr["team"] == "A":
            for (t, xw, yl) in tr["samples"]:
                samples[(tr["key"], t)] = (xw, yl)
    keys = sorted(samples, key=lambda k: k[1])[300:1200:300]
    fcp = FrameCropper()
    for i, (key, t) in enumerate(keys):
        xw, yl = samples[(key, t)]
        res = fcp.crop_for_sample(t, xw, yl)
        print(key, f"t={t:.1f}", "->", "échec" if res is None else f"boîte trouvée à {res[1]:.2f} m, hauteur {res[2]:.0f} px")
        if res:
            cv2.imwrite(str(OUT / f"test_crop_{i}.jpg"), res[0])
