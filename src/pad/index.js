// Primitives du Tactical Pad — dessin sur canvas, détection de clic, interpolation d'animation.
// Extrait de App.jsx (séparation des fichiers, sans changement de comportement).
// Note : drawArrowHead(Only)/drawWavyArrow sont aussi réutilisés par la Feuille de match et
// l'annotation de clips vidéo dans App.jsx — d'où leur export ici plutôt qu'un usage 100% interne.

export const PAD_ELEMENT_TYPES = [
  { key: "playerA", label: "Équipe A", shape: "disc", color: "#E3B23C" },
  { key: "playerB", label: "Équipe B", shape: "disc", color: "#D6483F" },
  { key: "playerC", label: "Équipe C", shape: "disc", color: "#4CAF7D" },
  { key: "playerD", label: "Équipe D", shape: "disc", color: "#5B8FD6" },
  { key: "keeper", label: "Gardien", shape: "disc", color: "#B98FE0" },
  { key: "cone", label: "Plot", shape: "triangle", color: "#FF8C00" },
  { key: "ball", label: "Ballon", shape: "ball", color: "#FFFFFF" },
  { key: "goal", label: "But", shape: "goalrect", color: "#FFFFFF" },
  { key: "zone", label: "Zone délimitée", shape: "zone", color: "#E3B23C" },
  { key: "ladder", label: "Échelle de rythme", shape: "ladder", color: "#FFFFFF" },
  { key: "pole", label: "Jalon", shape: "pole", color: "#FF8C00" },
  { key: "hurdle", label: "Haie", shape: "hurdle", color: "#FFFFFF" },
  { key: "hoop", label: "Cerceau", shape: "hoop", color: "#E3B23C" },
];

export function drawArrowHeadOnly(ctx, fromX, fromY, tipX, tipY, s) {
  s = s == null ? 1 : s;
  const headLen = 14 * s;
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function drawArrowHead(ctx, x1, y1, x2, y2, s) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  drawArrowHeadOnly(ctx, x1, y1, x2, y2, s);
}

export function quadPoint(x1, y1, cx, cy, x2, y2, t) {
  const mt = 1 - t;
  return { x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2, y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2 };
}

export function drawWavyArrow(ctx, x1, y1, x2, y2, curved, cx, cy, s) {
  s = s == null ? 1 : s;
  const segments = 24;
  const amplitude = 4 * s;
  const baseAngle = curved && cx != null ? Math.atan2(y2 - cy, x2 - cx) : Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const base = curved && cx != null ? quadPoint(x1, y1, cx, cy, x2, y2, t) : { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    const localAngle = curved && cx != null
      ? Math.atan2(2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy), 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx))
      : baseAngle;
    const perp = localAngle + Math.PI / 2;
    const wig = t < 0.92 ? Math.sin(t * Math.PI * 6) * amplitude : Math.sin(0.92 * Math.PI * 6) * amplitude * ((1 - t) / 0.08);
    const px = base.x + Math.cos(perp) * wig;
    const py = base.y + Math.sin(perp) * wig;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  drawArrowHeadOnly(ctx, x2 - Math.cos(baseAngle) * 14 * s, y2 - Math.sin(baseAngle) * 14 * s, x2, y2, s);
}

export function drawPadElement(ctx, el, w, h) {
  const s = w / 600; // facteur d'échelle : les tailles ci-dessous sont calibrées pour un canevas de 600px de large
  if (el.type === "arrowMove" || el.type === "arrowPass" || el.type === "arrowDribble") {
    const x1 = el.x1 * w, y1 = el.y1 * h, x2 = el.x2 * w, y2 = el.y2 * h;
    const cx = el.cx != null ? el.cx * w : null, cy = el.cy != null ? el.cy * h : null;
    ctx.strokeStyle = el.color; ctx.fillStyle = el.color; ctx.lineWidth = Math.max(1, 3 * s);
    ctx.setLineDash(el.type === "arrowMove" ? [8 * s, 6 * s] : []);
    if (el.type === "arrowDribble") {
      drawWavyArrow(ctx, x1, y1, x2, y2, el.curved, cx, cy, s);
    } else if (el.curved && cx != null) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(cx, cy, x2, y2); ctx.stroke();
      drawArrowHeadOnly(ctx, cx, cy, x2, y2, s);
    } else {
      drawArrowHead(ctx, x1, y1, x2, y2, s);
    }
    ctx.setLineDash([]);
    return;
  }
  if (el.type === "zone") {
    const x1 = el.x1 * w, y1 = el.y1 * h, x2 = el.x2 * w, y2 = el.y2 * h;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    ctx.save();
    if (el.rotation) { ctx.translate(cx, cy); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-cx, -cy); }
    ctx.setLineDash([6 * s, 4 * s]); ctx.strokeStyle = el.color || "#E3B23C"; ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  const x = el.x * w, y = el.y * h;
  ctx.save();
  if (el.rotation) { ctx.translate(x, y); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-x, -y); }
  if (el.type === "text") {
    ctx.fillStyle = el.color || "#ffffff"; ctx.font = `bold ${Math.max(9, Math.round(15 * s))}px sans-serif`;
    ctx.fillText(el.text, x, y);
    ctx.restore();
    return;
  }
  const def = PAD_ELEMENT_TYPES.find((t) => t.key === el.type);
  if (!def) { ctx.restore(); return; }
  const c = el.color || def.color; // couleur choisie pour cette instance, sinon couleur par défaut du type
  ctx.fillStyle = c; ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = Math.max(0.75, 1.5 * s);
  if (def.shape === "disc") {
    ctx.beginPath(); ctx.arc(x, y, 11 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (el.number) { ctx.fillStyle = "#1a1a1a"; ctx.font = `bold ${Math.max(7, Math.round(10 * s))}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(el.number, x, y); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }
  } else if (def.shape === "triangle") {
    ctx.beginPath(); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x + 8 * s, y + 7 * s); ctx.lineTo(x - 8 * s, y + 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (def.shape === "ball") {
    ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (def.shape === "goalrect") {
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.strokeRect(x - 12 * s, y - 8 * s, 24 * s, 16 * s);
  } else if (def.shape === "ladder") {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath(); ctx.moveTo(x - 10 * s, y - 16 * s); ctx.lineTo(x - 10 * s, y + 16 * s); ctx.moveTo(x + 10 * s, y - 16 * s); ctx.lineTo(x + 10 * s, y + 16 * s); ctx.stroke();
    for (let i = -14; i <= 14; i += 7) { ctx.beginPath(); ctx.moveTo(x - 10 * s, y + i * s); ctx.lineTo(x + 10 * s, y + i * s); ctx.stroke(); }
  } else if (def.shape === "pole") {
    ctx.fillStyle = c;
    ctx.fillRect(x - 2 * s, y - 15 * s, 4 * s, 24 * s);
    ctx.beginPath(); ctx.arc(x, y - 15 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
  } else if (def.shape === "hurdle") {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 2.5 * s);
    ctx.beginPath();
    ctx.moveTo(x - 12 * s, y + 8 * s); ctx.lineTo(x - 6 * s, y - 6 * s);
    ctx.moveTo(x + 12 * s, y + 8 * s); ctx.lineTo(x + 6 * s, y - 6 * s);
    ctx.moveTo(x - 8 * s, y - 6 * s); ctx.lineTo(x + 8 * s, y - 6 * s);
    ctx.stroke();
  } else if (def.shape === "hoop") {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 2.5 * s);
    ctx.beginPath(); ctx.arc(x, y, 10 * s, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function findNearestRotatable(pos, elements, threshold = 0.05) {
  let closest = null, closestDist = Infinity;
  elements.forEach((el) => {
    let ex, ey;
    if (el.type === "zone") { ex = (el.x1 + el.x2) / 2; ey = (el.y1 + el.y2) / 2; }
    else if (el.x != null && el.y != null) { ex = el.x; ey = el.y; }
    else return;
    const d = Math.hypot(pos.x - ex, pos.y - ey);
    if (d < threshold && d < closestDist) { closest = el; closestDist = d; }
  });
  return closest;
}

// Comme findNearestRotatable, mais couvre aussi les flèches (via leur point médian) — utilisé par
// les outils Déplacer / Recolorer / Supprimer, qui doivent pouvoir cibler n'importe quel élément.
export function findNearestElement(pos, elements, threshold = 0.05) {
  let closest = null, closestDist = Infinity;
  elements.forEach((el) => {
    let ex, ey;
    if (el.type === "zone" || el.type === "arrowMove" || el.type === "arrowPass" || el.type === "arrowDribble") {
      ex = (el.x1 + el.x2) / 2; ey = (el.y1 + el.y2) / 2;
    } else if (el.x != null && el.y != null) {
      ex = el.x; ey = el.y;
    } else return;
    const d = Math.hypot(pos.x - ex, pos.y - ey);
    if (d < threshold && d < closestDist) { closest = el; closestDist = d; }
  });
  return closest;
}

export function lerpAngle(a, b, t) {
  const diff = ((b - a + 540) % 360) - 180; // plus court chemin, y compris à travers 360°/0°
  return (a + diff * t + 360) % 360;
}

// Interpole un élément entre sa version dans l'image A et sa version dans l'image B (même id,
// typiquement dupliqué par "+ Ajouter une image" puis déplacé avec l'outil "Déplacer"). Le trajet
// peut comporter des points de passage intermédiaires (elA.movePath, posés avec l'outil "Points de
// passage") ; chaque segment (départ -> 1er point, ..., dernier point -> arrivée) est parcouru à
// vitesse égale et peut être individuellement courbé (cx/cy sur le point de passage, ou moveCx/
// moveCy sur elA pour le tout dernier segment). Sans point de passage ni courbure, comportement
// strictement identique à une ligne droite classique.
export function interpolatePadElement(elA, elB, t) {
  const lerpAt = (a, b, tt) => a + (b - a) * tt;
  if (elA.x1 != null && elB.x1 != null) {
    const next = { ...elB, x1: lerpAt(elA.x1, elB.x1, t), y1: lerpAt(elA.y1, elB.y1, t), x2: lerpAt(elA.x2, elB.x2, t), y2: lerpAt(elA.y2, elB.y2, t) };
    if (elA.cx != null && elB.cx != null) { next.cx = lerpAt(elA.cx, elB.cx, t); next.cy = lerpAt(elA.cy, elB.cy, t); }
    if (elA.rotation != null && elB.rotation != null) next.rotation = lerpAngle(elA.rotation, elB.rotation, t);
    return next;
  }
  if (elA.x != null && elB.x != null) {
    const waypoints = elA.movePath || [];
    const points = [{ x: elA.x, y: elA.y }, ...waypoints, { x: elB.x, y: elB.y }];
    const curves = [...waypoints.map((w) => (w.cx != null && w.cy != null ? w : null)), (elA.moveCx != null && elA.moveCy != null ? { cx: elA.moveCx, cy: elA.moveCy } : null)];
    const nbSegments = points.length - 1; // >= 1 (au minimum : départ -> arrivée)
    const scaled = t * nbSegments;
    const segIdx = Math.min(Math.floor(scaled), nbSegments - 1);
    const localT = scaled - segIdx;
    const p1 = points[segIdx], p2 = points[segIdx + 1], curve = curves[segIdx];
    let x, y;
    if (curve) {
      const p = quadPoint(p1.x, p1.y, curve.cx, curve.cy, p2.x, p2.y, localT);
      x = p.x; y = p.y;
    } else {
      x = lerpAt(p1.x, p2.x, localT); y = lerpAt(p1.y, p2.y, localT);
    }
    const next = { ...elB, x, y };
    if (elA.rotation != null && elB.rotation != null) next.rotation = lerpAngle(elA.rotation, elB.rotation, t);
    return next;
  }
  return elB;
}

// Fusionne deux images consécutives à l'instant t (0 à 1) : les éléments présents dans les deux
// glissent d'une position à l'autre ; ceux propres à une seule image apparaissent/disparaissent
// à cette transition (cas d'un élément ajouté ou supprimé entre deux images).
export function interpolateFrames(frameA, frameB, t) {
  const aIds = new Set(frameA.map((e) => e.id));
  const result = [];
  frameA.forEach((elA) => {
    const elB = frameB.find((e) => e.id === elA.id);
    result.push(elB ? interpolatePadElement(elA, elB, t) : elA);
  });
  frameB.forEach((elB) => { if (!aIds.has(elB.id)) result.push(elB); });
  return result;
}
