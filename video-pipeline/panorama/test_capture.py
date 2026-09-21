"""Tests du recadrage de la capture panoramique (config.PanoramaCapture) sur une vidéo synthétique.

Usage (depuis video-pipeline/, venv activé) : python -m panorama.test_capture
"""
import os
import tempfile

import cv2
import numpy as np

from panorama import config as C

W, H, N = 320, 200, 6
SQ = (140, 90)                                   # coin haut-gauche d'un carré blanc de 30 x 30 px dans l'image entière


def make_video(path):
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 30.0, (W, H))
    for _ in range(N):
        f = np.zeros((H, W, 3), np.uint8)
        f[SQ[1]:SQ[1] + 30, SQ[0]:SQ[0] + 30] = 255
        w.write(f)
    w.release()


def white_corner(frame):
    """Coin haut-gauche du carré blanc : premier pixel très clair, en ordre ligne puis colonne."""
    ys, xs = np.where(frame[..., 0] > 200)
    return int(xs.min()), int(ys.min())


with tempfile.TemporaryDirectory() as tmp:
    path = os.path.join(tmp, "test.mp4")
    make_video(path)

    # le recadrage rend la zone demandée, dans les mêmes coordonnées que la capture recadrée
    cap = C.PanoramaCapture(path, (100, 50, 180, 120))
    assert cap.isOpened()
    assert cap.get(cv2.CAP_PROP_FRAME_WIDTH) == 180 and cap.get(cv2.CAP_PROP_FRAME_HEIGHT) == 120
    assert cap.get(cv2.CAP_PROP_FRAME_COUNT) == N and abs(cap.get(cv2.CAP_PROP_FPS) - 30.0) < 1e-6      # le reste est transmis tel quel
    ok, f = cap.read()
    assert ok and f.shape == (120, 180, 3)
    cx, cy = white_corner(f)
    assert abs(cx - (SQ[0] - 100)) <= 2 and abs(cy - (SQ[1] - 50)) <= 2, (cx, cy)                    # (140, 90) devient (40, 40)
    assert f.flags["C_CONTIGUOUS"]                                                                    # exploitable directement par cv2 / YOLO

    # grab + retrieve, comme le pipeline, et déplacement dans la vidéo
    cap.set(cv2.CAP_PROP_POS_FRAMES, 2)
    assert cap.grab()
    ok, g = cap.retrieve()
    assert ok and g.shape == (120, 180, 3) and abs(white_corner(g)[0] - 40) <= 2
    # fin de vidéo : pas de recadrage sur une image absente
    cap.set(cv2.CAP_PROP_POS_FRAMES, N)
    assert not cap.grab()
    ok, g = cap.retrieve()
    assert not ok
    cap.release()

    # un recadrage qui dépasse l'image est refusé avec un message clair, jamais tronqué en silence
    cap = C.PanoramaCapture(path, (200, 100, 180, 120))
    try:
        cap.read()
        raise AssertionError("un recadrage hors image doit être refusé")
    except SystemExit as e:
        assert "PANORAMA_CROP dépasse l'image" in str(e)

    # open_panorama : sans recadrage, un cv2.VideoCapture ordinaire ; avec, la version recadrée
    saved = (C.PANORAMA_VIDEO, C.PANORAMA_CROP)
    try:
        C.PANORAMA_VIDEO, C.PANORAMA_CROP = path, ""
        cap = C.open_panorama()
        assert isinstance(cap, cv2.VideoCapture) and cap.get(cv2.CAP_PROP_FRAME_WIDTH) == W
        assert C.panorama_crop() is None
        C.PANORAMA_CROP = "100,50,180,120"
        assert C.panorama_crop() == (100, 50, 180, 120)
        cap = C.open_panorama()
        assert isinstance(cap, C.PanoramaCapture) and cap.read()[1].shape == (120, 180, 3)
        for bad in ("100,50,180", "a,b,c,d", "100;50;180;120", "1,2,3,4,5"):
            C.PANORAMA_CROP = bad
            try:
                C.panorama_crop()
                raise AssertionError(f"{bad!r} doit être refusé")
            except SystemExit as e:
                assert "PANORAMA_CROP" in str(e)
        # fichier absent : message clair
        C.PANORAMA_CROP, C.PANORAMA_VIDEO = "", os.path.join(tmp, "absent.mp4")
        try:
            C.open_panorama()
            raise AssertionError("fichier absent")
        except SystemExit as e:
            assert "PANORAMA_VIDEO" in str(e)
    finally:
        C.PANORAMA_VIDEO, C.PANORAMA_CROP = saved

print("tous les tests passent")
