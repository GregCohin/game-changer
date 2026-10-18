"""Modele de camera fisheye (projection equidistante), pour UN objectif brut du fichier transcode
(2 objectifs empiles, chacun calibre separement par panorama.calibrate_fisheye).

Convention (verifiee algebriquement auto-coherente par validation aller-retour) :
D = (X - Xc, Y - Yc, +Zc) -- utilisee de maniere identique dans project() ET unproject(), pas la
convention physique "vraie" (-Zc), mais coherente tant que les deux sens l'utilisent pareil.

Projection equidistante : r = f * theta * (1 + k1 * theta**2)

Piege deja rencontre et corrige : le clip de theta dans unproject() a np.pi/2 est trop restrictif
pour une camera basse filmant un terrain large (theta depasse reellement 90 deg pour les points
lointains) -- le clip correct est 0.97*pi.
"""
import json

import numpy as np


def rot_matrix(yaw, pitch, roll):
    """Matrice de rotation monde -> camera, Euler yaw (Z) puis pitch (X) puis roll (Y).
    roll est l'angle qui controle l'inclinaison principale depuis le nadir vers le fond du terrain
    (pas pitch) -- piege deja rencontre : mes premieres bornes avaient les roles inverses, trouve
    par un balayage grossier pitch x roll."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cr, sr = np.cos(roll), np.sin(roll)
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Ry = np.array([[cr, 0, sr], [0, 1, 0], [-sr, 0, cr]])
    return Ry @ Rx @ Rz


class FisheyeModel:
    def __init__(self, Xc, Yc, Zc, yaw, pitch, roll, f, u0, v0, k1):
        self.Xc, self.Yc, self.Zc = Xc, Yc, Zc
        self.yaw, self.pitch, self.roll = yaw, pitch, roll
        self.f, self.u0, self.v0, self.k1 = f, u0, v0, k1
        self.R = rot_matrix(yaw, pitch, roll)

    def to_dict(self):
        return dict(Xc=self.Xc, Yc=self.Yc, Zc=self.Zc, yaw=self.yaw, pitch=self.pitch,
                    roll=self.roll, f=self.f, u0=self.u0, v0=self.v0, k1=self.k1)

    @classmethod
    def from_dict(cls, d):
        return cls(**{k: d[k] for k in ("Xc", "Yc", "Zc", "yaw", "pitch", "roll", "f", "u0", "v0", "k1")})

    def to_json(self, path):
        json.dump(self.to_dict(), open(path, "w"), indent=2)

    @classmethod
    def from_json(cls, path):
        return cls.from_dict(json.load(open(path)))

    def project(self, XY):
        """XY: (N,2) points terrain (metres) -> (N,2) pixels (u,v)."""
        XY = np.asarray(XY, float)
        X, Y = XY[:, 0], XY[:, 1]
        D = np.stack([X - self.Xc, Y - self.Yc, np.full_like(X, self.Zc)], axis=1)
        Dc = D @ self.R.T
        rxy = np.hypot(Dc[:, 0], Dc[:, 1])
        theta = np.arctan2(rxy, Dc[:, 2])
        r = self.f * theta * (1 + self.k1 * theta**2)
        safe = np.where(rxy > 1e-9, rxy, 1.0)
        u = self.u0 + r * Dc[:, 0] / safe
        v = self.v0 + r * Dc[:, 1] / safe
        return np.stack([u, v], axis=1)

    def unproject(self, uv, Z=0.0):
        """uv: (N,2) pixels -> (N,2) points terrain (metres) au plan Z (par defaut sol), + rho (distance camera)."""
        uv = np.asarray(uv, float)
        u, v = uv[:, 0] - self.u0, uv[:, 1] - self.v0
        r = np.hypot(u, v)

        def solve_theta(r_target):
            th = r_target / max(self.f, 1e-6)
            for _ in range(50):
                f_th = self.f * th * (1 + self.k1 * th**2) - r_target
                fp_th = self.f * (1 + 3 * self.k1 * th**2)
                fp_th = np.where(np.abs(fp_th) > 1e-9, fp_th, 1e-9)
                th = th - f_th / fp_th
                th = np.clip(th, 0, 0.97 * np.pi - 1e-4)
            return th

        theta = solve_theta(r)
        safe_r = np.where(r > 1e-9, r, 1.0)
        dir_cx = np.sin(theta) * u / safe_r
        dir_cy = np.sin(theta) * v / safe_r
        dir_cz = np.cos(theta)
        dir_cam = np.stack([dir_cx, dir_cy, dir_cz], axis=1)   # vecteur unitaire, repere camera
        dir_world = dir_cam @ self.R                            # vecteur unitaire, repere monde (R orthonormale: inverse = transposee)

        # D = (X-Xc, Y-Yc, Zc) est un vecteur MONDE (avant rotation) : sa 3e composante vaut Zc par
        # construction (cf. project()), jamais dir_world[:,2] * Zc ni cos(theta) (ca c'est la 3e
        # composante en repere CAMERA, apres rotation -- piege qui a fait echouer une 1re version).
        # D est colineaire a dir_world, donc D = dir_world * (Zc / dir_world[:,2]).
        denom = np.where(np.abs(dir_world[:, 2]) > 1e-9, dir_world[:, 2], 1e-9)
        magnitude = self.Zc / denom
        D = dir_world * magnitude[:, None]
        X = D[:, 0] + self.Xc
        Y = D[:, 1] + self.Yc
        rho = np.hypot(D[:, 0], D[:, 1])
        return np.stack([X, Y], axis=1), rho
