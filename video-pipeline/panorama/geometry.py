"""Modèle géométrique du panorama Veo (caméra fixe) : image <-> sol du terrain, en mètres.

Panorama cylindrique : u = u0 + fx * atan2(a, b), avec a = X - Xc (latéral), b = Yc - Y (profondeur),
rho = hypot(a, b). Deux variantes pour l'axe vertical, avec s l'inclinaison de l'horizon :
  "tan" : v = vh + s * (u - u0) + A / rho
  "eq"  : v = vh + s * (u - u0) + fy * atan(Zc / rho)   (linéaire en angle d'élévation, Zc = hauteur caméra)
Repère terrain : X le long du terrain (gauche -> droite dans l'image), Y en travers (Y<0 côté loin,
Y>0 côté proche), origine au point central. Pixels de l'image vidéo brute.
"""
import json
import numpy as np

from panorama.config import PANORAMA_VIDEO as VIDEO      # chemin fourni par la variable d'environnement PANORAMA_VIDEO
CROP_Y0, CROP_Y1 = 184, 900   # zone utile de la vidéo (au-dessus/au-dessous : barres et commandes du lecteur)


class PanoramaModel:
    def __init__(self, Xc, Yc, fx, u0, vh, s=0.0, kind="tan", A=None, fy=None, Zc=None, L=None, W=None, scale=1.0, scale_range=None):
        self.Xc, self.Yc, self.fx, self.u0, self.vh, self.s = Xc, Yc, fx, u0, vh, s
        self.kind, self.A, self.fy, self.Zc = kind, A, fy, Zc
        self.L, self.W = L, W
        self.scale = scale                # facteur métrique appliqué autour du centre du terrain (cf. calibration)
        self.scale_range = scale_range

    def _elev(self, rho):
        return self.A / rho if self.kind == "tan" else self.fy * np.arctan(self.Zc / rho)

    def project(self, XY):
        XY = np.asarray(XY, float) / self.scale
        a = XY[:, 0] - self.Xc
        b = self.Yc - XY[:, 1]
        rho = np.hypot(a, b)
        u = self.u0 + self.fx * np.arctan2(a, b)
        return np.c_[u, self.vh + self.s * (u - self.u0) + self._elev(rho)]

    def unproject(self, uv):
        uv = np.asarray(uv, float)
        th = (uv[:, 0] - self.u0) / self.fx
        w = uv[:, 1] - self.vh - self.s * (uv[:, 0] - self.u0)
        rho = self.A / w if self.kind == "tan" else self.Zc / np.tan(w / self.fy)
        return np.c_[self.Xc + rho * np.sin(th), self.Yc - rho * np.cos(th)] * self.scale, rho * self.scale

    def to_json(self, path):
        json.dump({k: v for k, v in self.__dict__.items()}, open(path, "w"), indent=2)

    @classmethod
    def from_json(cls, path):
        d = json.load(open(path))
        return cls(**d)
