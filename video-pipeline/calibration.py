"""Calibration terrain image par image — wrapper autour de PnLCalib (vendored dans vendor/PnLCalib,
voir setup.sh). Une vidéo follow cam n'a pas d'homographie fixe : chaque frame est recalibrée
indépendamment à partir des lignes du terrain visibles à cet instant précis.
"""
import sys
from pathlib import Path

VENDOR = Path(__file__).parent / "vendor" / "PnLCalib"
sys.path.insert(0, str(VENDOR))

import cv2
import yaml
import torch
import numpy as np
from PIL import Image
import torchvision.transforms.functional as tvf
import torchvision.transforms as T

from model.cls_hrnet import get_cls_net
from model.cls_hrnet_l import get_cls_net as get_cls_net_l
from utils.utils_calib import FramebyFrameCalib
from utils.utils_heatmap import (
    get_keypoints_from_heatmap_batch_maxpool,
    get_keypoints_from_heatmap_batch_maxpool_l,
    complete_keypoints,
    coords_to_dict,
)

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0

_RESIZE = T.Resize((540, 960))


class Calibrator:
    """Calibre chaque frame indépendamment (adapté à une caméra qui bouge/zoome, type follow cam)."""

    def __init__(self, frame_width, frame_height, device="cpu",
                 kp_threshold=0.3434, line_threshold=0.7867, pnl_refine=True):
        cfg = yaml.safe_load(open(VENDOR / "config" / "hrnetv2_w48.yaml"))
        cfg_l = yaml.safe_load(open(VENDOR / "config" / "hrnetv2_w48_l.yaml"))

        self.device = device
        self.kp_threshold = kp_threshold
        self.line_threshold = line_threshold
        self.pnl_refine = pnl_refine

        self.model = get_cls_net(cfg)
        self.model.load_state_dict(torch.load(VENDOR / "weights" / "SV_kp", map_location=device))
        self.model.to(device).eval()

        self.model_l = get_cls_net_l(cfg_l)
        self.model_l.load_state_dict(torch.load(VENDOR / "weights" / "SV_lines", map_location=device))
        self.model_l.to(device).eval()

        self.cam = FramebyFrameCalib(iwidth=frame_width, iheight=frame_height, denormalize=True)

    def _cam_params(self, frame_bgr):
        frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        frame = Image.fromarray(frame)
        frame = tvf.to_tensor(frame).float().unsqueeze(0)
        frame = frame if frame.size()[-1] == 960 else _RESIZE(frame)
        frame = frame.to(self.device)
        _, _, h, w = frame.size()

        with torch.no_grad():
            heatmaps = self.model(frame)
            heatmaps_l = self.model_l(frame)

        kp_coords = get_keypoints_from_heatmap_batch_maxpool(heatmaps[:, :-1, :, :])
        line_coords = get_keypoints_from_heatmap_batch_maxpool_l(heatmaps_l[:, :-1, :, :])
        kp_dict = coords_to_dict(kp_coords, threshold=self.kp_threshold)
        lines_dict = coords_to_dict(line_coords, threshold=self.line_threshold)
        kp_dict, lines_dict = complete_keypoints(kp_dict[0], lines_dict[0], w=w, h=h, normalize=True)

        self.cam.update(kp_dict, lines_dict)
        return self.cam.heuristic_voting(refine_lines=self.pnl_refine)

    def homography_pitch_to_image(self, frame_bgr):
        """3x3 : [Xc, Yc, 1] (mètres, origine au centre du terrain) -> [u, v, w] (pixels homogènes).
        None si le terrain n'est pas assez visible dans cette frame pour calibrer (fréquent en follow
        cam lors d'un plan serré sur un duel loin de toute ligne)."""
        params = self._cam_params(frame_bgr)
        if params is None:
            return None
        cp = params["cam_params"]
        rotation = np.array(cp["rotation_matrix"])
        position = np.array(cp["position_meters"])
        Q = np.array([[cp["x_focal_length"], 0, cp["principal_point"][0]],
                      [0, cp["y_focal_length"], cp["principal_point"][1]],
                      [0, 0, 1]])
        it = np.eye(4)[:-1]
        it[:, -1] = -position
        p = Q @ (rotation @ it)  # 3x4, monde -> image, origine centre terrain
        return p[:, [0, 1, 3]]  # plan Z=0 (sol) uniquement : colonnes X, Y, translation


def image_to_pitch_norm(homography_pitch_to_image, px, py):
    """Pixel (px, py) -> position terrain normalisée (0-1, convention du site : x=largeur, y=longueur
    dans le sens d'attaque, cf. BAND dans generateMockAdvancedAnalytics côté App.jsx). None si le point
    ne correspond à aucune position plausible sur le terrain (calibration probablement mauvaise)."""
    try:
        h_inv = np.linalg.inv(homography_pitch_to_image)
    except np.linalg.LinAlgError:
        return None
    world = h_inv @ np.array([px, py, 1.0])
    if abs(world[2]) < 1e-9:
        return None
    xc, yc = world[0] / world[2], world[1] / world[2]
    x_m, y_m = xc + PITCH_LENGTH_M / 2, yc + PITCH_WIDTH_M / 2
    if not (-5 <= x_m <= PITCH_LENGTH_M + 5 and -5 <= y_m <= PITCH_WIDTH_M + 5):
        return None  # projection hors terrain -> calibration probablement mauvaise pour ce point
    # PnLCalib : X = longueur (0-105, but-à-but), Y = largeur (0-68) -> site : x=largeur, y=longueur.
    # Sens d'attaque (quelle moitié = "y proche de 0") non résolu ici : simplification connue de la V1,
    # à corriger via --flip si la heatmap ressort inversée sur un match donné.
    return max(0.0, min(1.0, y_m / PITCH_WIDTH_M)), max(0.0, min(1.0, x_m / PITCH_LENGTH_M))
