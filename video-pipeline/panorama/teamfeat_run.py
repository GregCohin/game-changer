"""Calcule les descripteurs d'équipe (teamfeat.features) pour chaque mesure de chaque piste du match.

Usage : python -m panorama.teamfeat_run     # reprenable ; écrit output/panorama/match/feat_XXX.pkl
"""
import pickle
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))
from panorama import track as T
from panorama import teamfeat as TF
from panorama.config import open_panorama
from panorama.config import PANORAMA_BOX_MATCH_PX
from panorama.match import CHUNK_S, FPS, MATCH, chunk_bounds, video_info


def run():
    native, total, per_chunk, _ = video_info()
    bounds = chunk_bounds()
    step = round(native / FPS)
    model = T.load_model()
    cap = open_panorama()
    for k, (start, end) in enumerate(bounds):
        path = MATCH / f"feat_{k:03d}.pkl"
        trk = MATCH / f"trk2_{k:03d}.pkl"
        if path.exists() or not trk.exists():
            continue
        t_start = time.time()
        tracks = pickle.load(open(trk, "rb"))["tracks"]
        det = pickle.load(open(MATCH / f"det_{k:03d}.pkl", "rb"))["frames"]
        times = np.array([f["t"] for f in det])
        # mesures par image : image -> [(piste, indice, u, v)]
        by_frame = {}
        for ti, rec in enumerate(tracks):
            m = np.array(rec["meas"])
            if len(m) == 0:
                continue
            uv = model.project(m[:, 1:3])
            hi = np.clip(np.searchsorted(times, m[:, 0]), 1, len(times) - 1)             # image détectée la plus proche EN TEMPS : la cadence réelle n'est pas
            fi = np.where(np.abs(times[hi] - m[:, 0]) < np.abs(times[hi - 1] - m[:, 0]), hi, hi - 1)      # toujours FPS (9,36 Hz pour une capture à 56,17 im/s)
            for j in range(len(m)):
                by_frame.setdefault(int(fi[j]), []).append((ti, j, uv[j, 0], uv[j, 1]))
        out = {(rec["chunk"], rec["id"]): np.full((len(rec["meas"]), len(TF.FEATURE_NAMES)), np.nan, np.float32) for rec in tracks}
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        idx, fnum = start, 0
        while idx < end and cap.grab():
            if (idx - start) % step == 0:
                if fnum in by_frame:
                    ok, f = cap.retrieve()
                    dets = det[fnum]["dets"] if fnum < len(det) else []
                    feet = np.array([[(d["box"][0] + d["box"][2]) / 2, d["box"][3]] for d in dets]) if dets else np.zeros((0, 2))
                    for ti, j, u, v in by_frame[fnum]:
                        if len(feet) == 0:
                            continue
                        dd = np.hypot(feet[:, 0] - u, feet[:, 1] - v)
                        b = int(np.argmin(dd))
                        if dd[b] > PANORAMA_BOX_MATCH_PX:
                            continue
                        fe = TF.features(f, dets[b]["box"])
                        if fe is not None:
                            rec = tracks[ti]
                            out[(rec["chunk"], rec["id"])][j] = fe
                fnum += 1
            idx += 1
        tmp = path.with_suffix(".tmp")
        pickle.dump(out, open(tmp, "wb"))
        tmp.rename(path)
        got = sum(int((~np.isnan(v[:, 0])).sum()) for v in out.values())
        allm = sum(len(v) for v in out.values())
        print(f"tranche {k + 1}/{len(bounds)} : {got}/{allm} mesures décrites en {time.time() - t_start:.0f} s", flush=True)
    print("descripteurs terminés", flush=True)


if __name__ == "__main__":
    run()
