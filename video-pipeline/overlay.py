"""Rendu d'un aperçu annoté (joueurs suivis + mini-terrain calibré) pour valider visuellement
détection/tracking/calibration sur un extrait court avant de lancer un match complet — cf. étape
de vérification du plan phase 1."""
import av
import cv2

TEAM_COLORS = {"A": (60, 180, 255), "B": (255, 120, 60), "autre": (200, 200, 200), None: (140, 140, 140)}

PITCH_INSET_W, PITCH_INSET_H = 220, 150
PITCH_MARGIN = 14


def _draw_pitch_inset(frame, positions_by_team):
    h, w = frame.shape[:2]
    x0, y0 = w - PITCH_INSET_W - PITCH_MARGIN, h - PITCH_INSET_H - PITCH_MARGIN
    overlay = frame.copy()
    cv2.rectangle(overlay, (x0, y0), (x0 + PITCH_INSET_W, y0 + PITCH_INSET_H), (30, 110, 30), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, dst=frame)
    cv2.rectangle(frame, (x0, y0), (x0 + PITCH_INSET_W, y0 + PITCH_INSET_H), (255, 255, 255), 1)
    cv2.line(frame, (x0 + PITCH_INSET_W // 2, y0), (x0 + PITCH_INSET_W // 2, y0 + PITCH_INSET_H),
             (255, 255, 255), 1)
    for team, positions in positions_by_team.items():
        color = TEAM_COLORS.get(team, (200, 200, 200))
        for x_norm, y_norm in positions:
            px, py = int(x0 + x_norm * PITCH_INSET_W), int(y0 + y_norm * PITCH_INSET_H)
            cv2.circle(frame, (px, py), 3, color, -1)


def draw_debug_frame(frame, players, homography_found, positions_by_team):
    """players : sortie de Tracker.process_frame (px, py = pieds au sol, en pixels image).
    positions_by_team : {"A"/"B": [(x_norm, y_norm), ...]} pour ce même instant, déjà calibrées.
    Retourne une NOUVELLE frame annotée (ne modifie pas l'originale)."""
    frame = frame.copy()
    for p in players:
        color = TEAM_COLORS.get(p["team"], (200, 200, 200))
        x, y = int(p["px"]), int(p["py"])
        cv2.circle(frame, (x, y), 4, color, -1)
        cv2.putText(frame, str(p["track_id"]), (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    status = "calibration OK" if homography_found else "calibration ECHEC (frame ignoree)"
    status_color = (80, 220, 80) if homography_found else (60, 60, 230)
    cv2.putText(frame, status, (14, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)

    _draw_pitch_inset(frame, positions_by_team)
    return frame


class DebugVideoWriter:
    """Remplace cv2.VideoWriter (fourcc 'mp4v') : ce codec produit un .mp4 valide mais illisible par
    QuickTime/Photos sur macOS (écran vert constaté sur le run complet) — H.264/yuv420p via PyAV
    (déjà présent, dépendance transitive de `supervision`) est lisible nativement partout."""

    def __init__(self, path, fps, width, height):
        self.container = av.open(path, mode="w")
        self.stream = self.container.add_stream("libx264", rate=max(1, round(fps)))
        self.stream.width = width
        self.stream.height = height
        self.stream.pix_fmt = "yuv420p"
        self.stream.options = {"crf": "23", "preset": "fast"}

    def write(self, frame_bgr):
        frame = av.VideoFrame.from_ndarray(frame_bgr, format="bgr24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)

    def release(self):
        for packet in self.stream.encode():
            self.container.mux(packet)
        self.container.close()
