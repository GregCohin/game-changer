"""Extraction du match entier, par tranches de 5 min, reprenable : détection puis suivi.

Usage (deux processus en parallèle, depuis video-pipeline/, venv activé) :
  python -m panorama.match detect     # détection -> output/panorama/match/det_XXX.pkl
  python -m panorama.match track      # suivi     -> output/panorama/match/trk_XXX.pkl
"""
import math
import pickle
import sys
import time
import traceback
from pathlib import Path

import cv2
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import detect as D
from panorama import track as T
from panorama.geometry import PanoramaModel
from panorama.config import open_panorama

MATCH = T.OUT / "match"
CHUNK_S = 300
FPS = 10.0


def video_info():
    cap = open_panorama()
    native = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    per_chunk = int(CHUNK_S * native)
    return native, total, per_chunk, math.ceil(total / per_chunk)


def detect_all():
    MATCH.mkdir(parents=True, exist_ok=True)
    native, total, per_chunk, nchunks = video_info()
    step = round(native / FPS)
    model = YOLO(str(D.WEIGHTS))
    cap = open_panorama()
    print(f"{total} images vidéo, {nchunks} tranches de {CHUNK_S} s", flush=True)
    for k in range(nchunks):
        path = MATCH / f"det_{k:03d}.pkl"
        if path.exists():
            continue
        start, end = k * per_chunk, min(total, (k + 1) * per_chunk)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        frames, idx, t0 = [], start, time.time()
        while idx < end and cap.grab():
            if (idx - start) % step == 0:
                ok, f = cap.retrieve()
                if ok:
                    frames.append(dict(t=idx / native, dets=D.detect_frame(model, f)))
            idx += 1
        tmp = path.with_suffix(".tmp")
        pickle.dump(dict(frames=frames, fps=FPS, chunk=k), open(tmp, "wb"))
        tmp.rename(path)
        print(f"tranche {k + 1}/{nchunks} : {len(frames)} images en {time.time() - t0:.0f} s", flush=True)
    print("détection terminée", flush=True)


def track_all(version="v1", wait=True):
    native, total, per_chunk, nchunks = video_info()
    model = PanoramaModel.from_json(T.OUT / "calibration_finale.json")
    prefix, run = ("trk", T.run_tracking) if version == "v1" else ("trk2", T.run_tracking_v2)
    for k in range(nchunks):
        out = MATCH / f"{prefix}_{k:03d}.pkl"
        if out.exists():
            continue
        det = MATCH / f"det_{k:03d}.pkl"
        while not det.exists():
            if not wait:
                break
            time.sleep(20)
        if not det.exists():
            continue
        try:
            data = pickle.load(open(det, "rb"))
            t0 = time.time()
            prepared = T.prepare(data["frames"], model)
            T.assign_sides(prepared)
            tracks, per_frame = run(prepared, data["fps"])
            kept = [dict(chunk=k, id=t.id, side=t.side, meas=t.meas, extra=t.extra, contacts=t.contacts)
                    for t in tracks if t.hits >= 8]
            qa = dict(frames=len(prepared), tracks=len(tracks), kept=len(kept),
                      dets_per_frame=sum(len(f["dets"]) for f in prepared) / max(1, len(prepared)),
                      tracked_per_frame=sum(per_frame) / max(1, len(per_frame)))
            tmp = out.with_suffix(".tmp")
            pickle.dump(dict(tracks=kept, qa=qa, t_start=data["frames"][0]["t"] if data["frames"] else None), open(tmp, "wb"))
            tmp.rename(out)
            print(f"tranche {k + 1}/{nchunks} suivie en {time.time() - t0:.0f} s : {qa}", flush=True)
        except Exception:
            print(f"ERREUR tranche {k} :\n{traceback.format_exc()}", flush=True)
    print("suivi terminé", flush=True)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "detect":
        detect_all()
    elif cmd == "track":
        track_all("v1", wait=True)
    elif cmd == "retrack":
        track_all("v2", wait=False)
