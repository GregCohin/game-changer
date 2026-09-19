"""Modèle géométrique du panorama Veo, version 2 : panorama cylindrique + corrections de forme, ajusté sur un terrain RÉGLEMENTAIRE
(105 x 68 m, confirmé sur la vue satellite du stade : rapport 1,544, cercle de 18,3 m, surfaces de 16,5 x 40,32 m).

  dx = X - Xc, dy = Y - Yc ;  a = dx cos(phi) - dy sin(phi) ;  b = -(dx sin(phi) + dy cos(phi))     (phi : lacet de la caméra par rapport au terrain)
  th = atan2(a, b), rho = hypot(a, b)
  u  = u0 + fx * (th + k3 th^3 + k5 th^5)     (non-linéarité horizontale de l'assemblage des deux objectifs)
  v  = vh + s*(u-u0) + c2*(u-u0)^2 + A/rho + B/rho^2     (horizon incliné et courbe, élévation non hyperbolique)
Repère : X le long du terrain (gauche -> droite dans l'image), Y en travers (Y>0 côté proche), origine au point central, mètres réels.
"""
import json
import numpy as np

PARAMS = ["Xc", "Yc", "fx", "A", "u0", "vh", "s", "k3", "c2", "B", "phi", "k5"]


class PanoramaModel2:
    def __init__(self, Xc, Yc, fx, A, u0, vh, s=0.0, k3=0.0, c2=0.0, B=0.0, phi=0.0, k5=0.0):
        self.Xc, self.Yc, self.fx, self.A, self.u0, self.vh, self.s = Xc, Yc, fx, A, u0, vh, s
        self.k3, self.c2, self.B, self.phi, self.k5 = k3, c2, B, phi, k5

    def _ab(self, XY):
        dx, dy = XY[:, 0] - self.Xc, XY[:, 1] - self.Yc
        c, s_ = np.cos(self.phi), np.sin(self.phi)
        return dx * c - dy * s_, -(dx * s_ + dy * c)

    def project(self, XY):
        XY = np.asarray(XY, float)
        a, b = self._ab(XY)
        rho = np.hypot(a, b)
        th = np.arctan2(a, b)
        u = self.u0 + self.fx * (th + self.k3 * th ** 3 + self.k5 * th ** 5)
        du = u - self.u0
        return np.c_[u, self.vh + self.s * du + self.c2 * du ** 2 + self.A / rho + self.B / rho ** 2]

    def unproject(self, uv):
        uv = np.asarray(uv, float)
        du = uv[:, 0] - self.u0
        y = du / self.fx
        th = y.copy()
        for _ in range(12):                                      # th + k3 th^3 + k5 th^5 = y (Newton)
            th -= (th + self.k3 * th ** 3 + self.k5 * th ** 5 - y) / (1 + 3 * self.k3 * th ** 2 + 5 * self.k5 * th ** 4)
        w = uv[:, 1] - self.vh - self.s * du - self.c2 * du ** 2
        if abs(self.B) < 1e-9:
            x = w / self.A
        else:
            x = (-self.A + np.sqrt(np.maximum(self.A ** 2 + 4 * self.B * w, 1e-12))) / (2 * self.B)   # x = 1/rho : B x^2 + A x = w
        rho = 1.0 / x
        a, b = rho * np.sin(th), rho * np.cos(th)
        c, s_ = np.cos(self.phi), np.sin(self.phi)
        dx = a * c - b * s_                                       # inverse de la rotation (a, b) <- (dx, dy)
        dy = -(a * s_ + b * c)
        return np.c_[self.Xc + dx, self.Yc + dy], rho

    def to_json(self, path):
        json.dump({k: float(getattr(self, k)) for k in PARAMS}, open(path, "w"), indent=2)

    @classmethod
    def from_json(cls, path):
        return cls(**json.load(open(path)))

    @classmethod
    def from_vector(cls, x):
        return cls(**dict(zip(PARAMS, [float(v) for v in x])))

    def vector(self):
        return np.array([getattr(self, k) for k in PARAMS], float)
