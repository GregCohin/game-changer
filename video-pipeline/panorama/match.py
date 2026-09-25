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
from panorama.config import open_panorama, panorama_cuts

MATCH = T.OUT / "match"
CHUNK_S = 300
FPS = 10.0


_HZ = []


def sample_hz():
    """Cadence RÉELLE des images échantillonnées (Hz), lue dans la 1re tranche détectée : native / round(native / FPS). Égale à FPS seulement quand le
    fps natif est un multiple de FPS (30 -> 10 Hz ; 56,17 -> 9,36 Hz) : supposer FPS décale l'indice d'image de plus en plus au fil d'une tranche.
    Repli sur FPS si aucune tranche n'est encore détectée."""
    if not _HZ:
        hz = FPS
        p = MATCH / "det_000.pkl"
        if p.exists():
            fr = pickle.load(open(p, "rb"))["frames"]
            if len(fr) > 10 and fr[-1]["t"] > fr[0]["t"]:
                hz = (len(fr) - 1) / (fr[-1]["t"] - fr[0]["t"])
                if abs(hz - FPS) < 1e-3:
                    hz = FPS
        _HZ.append(hz)
    return _HZ[0]


def video_info():
    cap = open_panorama()
    native = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    per_chunk = int(CHUNK_S * native)
    return native, total, per_chunk, math.ceil(total / per_chunk)


def chunk_bounds():
    """Tranches (début, fin) en images, ~CHUNK_S s chacune, jamais à cheval sur un montage dur (PANORAMA_CUTS) :
    une piste ne peut donc jamais enjamber un saut de temps de match sans saut d'image (voir config.py)."""
    native, total, per_chunk, _ = video_info()
    cuts = sorted(int(round(s * native)) for s in panorama_cuts())
    bounds, start = [], 0
    while start < total:
        end = min(total, start + per_chunk)
        for c in cuts:
            if start < c < end:
                end = c
                break
        if end > start:
            bounds.append((start, end))
        start = end
    return bounds


def detect_all():
    MATCH.mkdir(parents=True, exist_ok=True)
    native, total, per_chunk, _ = video_info()
    bounds = chunk_bounds()
    step = round(native / FPS)
    model = YOLO(str(D.WEIGHTS))
    cap = open_panorama()
    print(f"{total} images vidéo, {len(bounds)} tranches (~{CHUNK_S} s, coupées aux montages s'il y en a)", flush=True)
    for k, (start, end) in enumerate(bounds):
        path = MATCH / f"det_{k:03d}.pkl"
        if path.exists():
            continue
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
        print(f"tranche {k + 1}/{len(bounds)} : {len(frames)} images en {time.time() - t0:.0f} s", flush=True)
    print("détection terminée", flush=True)


def track_all(version="v1", wait=True):
    bounds = chunk_bounds()
    model = T.load_model()
    prefix, run = ("trk", T.run_tracking) if version == "v1" else ("trk2", T.run_tracking_v2)
    for k in range(len(bounds)):
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
            print(f"tranche {k + 1}/{len(bounds)} suivie en {time.time() - t0:.0f} s : {qa}", flush=True)
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
