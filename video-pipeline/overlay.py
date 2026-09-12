"""Rendu d'un aperçu annoté (joueurs suivis + mini-terrain calibré) pour valider visuellement
détection/tracking/calibration sur un extrait court avant de lancer un match complet — cf. étape
de vérification du plan phase 1."""
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
