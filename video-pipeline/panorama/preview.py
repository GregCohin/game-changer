"""Images de contrôle : traînées des joueurs suivis, sur le panorama et vues de dessus (mètres).

Usage : python -m panorama.preview <detections.pkl> <instant_s>
"""
import pickle
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama.geometry import PanoramaModel, VIDEO
from panorama.config import require
from panorama import track as T

OUT = T.OUT


def main(path, t0, trail_s=6.0):
    D = pickle.load(open(path, "rb"))
    model = PanoramaModel.from_json(OUT / "calibration_finale.json")
    prepared = T.prepare(D["frames"], model)
    T.assign_sides(prepared)
    tracks, _ = T.run_tracking(prepared, D["fps"])
    live = []
    for tr in tracks:
        if tr.hits < 8:
            continue
        pts = [(t, X, Y) for (t, X, Y, _) in tr.meas if t0 - trail_s <= t <= t0]
        if len(pts) >= 3 and abs(pts[-1][0] - t0) <= 0.35:
            live.append((tr, pts))
    print(f"{len(live)} joueurs suivis à t={t0:.0f} s")

    cap = cv2.VideoCapture(require(VIDEO, "PANORAMA_VIDEO"))
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    ok, frame = cap.read()
    img = frame[190:640, :].copy()
    rng = np.random.RandomState(3)
    colors = {tr.id: tuple(int(c) for c in rng.randint(80, 255, 3)) for tr, _ in live}
    for tr, pts in live:
        px = model.project(np.array([[p[1], p[2]] for p in pts])) - [0, 190]
        cv2.polylines(img, [px.astype(np.int32)], False, colors[tr.id], 1)
        cv2.circle(img, tuple(int(v) for v in px[-1]), 3, colors[tr.id], -1)
    img = cv2.resize(img, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(str(OUT / f"apercu_panorama_{int(t0)}.jpg"), img)

    S = 12
    W, H = 110, 84
    top = np.full((H * S, W * S, 3), (40, 70, 40), np.uint8)
    def P(x, y): return (int((x + W / 2) * S), int((y + H / 2) * S))
    for gx in range(-50, 51, 10):
        cv2.line(top, P(gx, -H / 2), P(gx, H / 2), (60, 95, 60), 1)
    for gy in range(-40, 41, 10):
        cv2.line(top, P(-W / 2, gy), P(W / 2, gy), (60, 95, 60), 1)
    cv2.line(top, P(0, -model.W / 2), P(0, model.W / 2), (230, 230, 230), 2)
    cv2.circle(top, P(0, 0), int(9.15 * S), (230, 230, 230), 2)
    cv2.line(top, P(-50, model.W / 2), P(50, model.W / 2), (230, 230, 230), 2)
    cv2.line(top, P(-50, -model.W / 2), P(50, -model.W / 2), (230, 230, 230), 1)
    for tr, pts in live:
        xy = np.array([P(p[1], p[2]) for p in pts], np.int32)
        cv2.polylines(top, [xy], False, colors[tr.id], 2)
        cv2.circle(top, tuple(xy[-1]), 7, colors[tr.id], -1)
        cv2.circle(top, tuple(xy[-1]), 7, (0, 0, 0), 1)
    cv2.putText(top, "vue de dessus (metres, 10 m par carre) - cote loin en haut", (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.imwrite(str(OUT / f"apercu_dessus_{int(t0)}.jpg"), top)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]))
