// Primitives du Tactical Pad — dessin sur canvas, détection de clic, interpolation d'animation.
// Extrait de App.jsx (séparation des fichiers, sans changement de comportement).
// Note : drawArrowHead(Only)/drawWavyArrow sont aussi réutilisés par la Feuille de match et
// l'annotation de clips vidéo dans App.jsx — d'où leur export ici plutôt qu'un usage 100% interne.

// "shape" est un identifiant de rendu interne (résolu dans drawPadElement), jamais persisté tel quel :
// seul "key" est écrit dans les schémas sauvegardés (tf_exercices, starterContent.js). Renommer ou
// affiner un "shape" est donc sans risque pour les données existantes ; retirer ou renommer une "key"
// ne l'est pas (goal/hurdle référencés par 158/4 schémas de départ) — d'où l'ajout de clés supplémentaires
// (goalU8, goalMini, hurdleLow, hurdleHigh) plutôt que le remplacement de "goal"/"hurdle".
export const PAD_ELEMENT_TYPES = [
  { key: "playerA", label: "Équipe A", shape: "jersey", color: "#E3B23C" },
  { key: "playerB", label: "Équipe B", shape: "jersey", color: "#D6483F" },
  { key: "playerC", label: "Équipe C", shape: "jersey", color: "#4CAF7D" },
  { key: "playerD", label: "Équipe D", shape: "jersey", color: "#5B8FD6" },
  { key: "keeper", label: "Gardien", shape: "jersey", color: "#B98FE0" },
  { key: "cone", label: "Plot", shape: "triangle", color: "#FF8C00" },
  { key: "ball", label: "Ballon", shape: "ball", color: "#FFFFFF" },
  { key: "goal", label: "But foot à 11", shape: "goalrect", color: "#FFFFFF" },
  { key: "goalU8", label: "But foot à 8", shape: "goalrect_u8", color: "#FFFFFF" },
  { key: "goalMini", label: "Mini but", shape: "goalrect_mini", color: "#FFFFFF" },
  { key: "zone", label: "Zone délimitée", shape: "zone", color: "#E3B23C" },
  { key: "ladder", label: "Échelle de rythme", shape: "ladder", color: "#FFFFFF" },
  { key: "pole", label: "Jalon", shape: "pole", color: "#FF8C00" },
  { key: "hurdle", label: "Haie moyenne", shape: "hurdle", color: "#FFFFFF" },
  { key: "hurdleLow", label: "Haie basse", shape: "hurdle_low", color: "#FFFFFF" },
  { key: "hurdleHigh", label: "Haie haute", shape: "hurdle_high", color: "#FFFFFF" },
  { key: "hoop", label: "Cerceau", shape: "hoop", color: "#E3B23C" },
];

// Ombre plate au sol pour tout ce qui est planté debout (joueur, ballon, plot, jalon, haie) — pas pour
// un tracé au sol (zone, échelle, cerceau, but) qui n'a pas de hauteur dans ce diagramme stylisé.
function drawGroundShadow(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const GOAL_SIZES = {
  goalrect: { hw: 14, hh: 13, pt: 4, net: 3 },
  goalrect_u8: { hw: 11, hh: 9.5, pt: 3, net: 2 },
  // hw/hh agrandis le 01/10/2026 (8/6.5 → 9.5/8) : à la taille d'un canevas mobile, l'original
  // était difficile à distinguer/viser au doigt — reste nettement plus petit que goalrect_u8.
  goalrect_mini: { hw: 9.5, hh: 8, pt: 2.5, net: 1 },
};

const HURDLE_HEIGHTS = { hurdle_low: 6, hurdle: 10, hurdle_high: 14 };

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
    const rx1 = Math.min(x1, x2), ry1 = Math.min(y1, y2), rx2 = Math.max(x1, x2), ry2 = Math.max(y1, y2);
    ctx.save();
    if (el.rotation) { ctx.translate(cx, cy); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-cx, -cy); }
    ctx.setLineDash([6 * s, 4 * s]); ctx.strokeStyle = el.color || "#E3B23C"; ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
    ctx.setLineDash([]);
    // Poignées de coin (traits pleins) pour distinguer un rectangle "zone" d'un simple contour pointillé.
    const tick = Math.min(9 * s, (rx2 - rx1) / 4, (ry2 - ry1) / 4);
    ctx.lineWidth = Math.max(1.2, 2.5 * s);
    ctx.beginPath();
    ctx.moveTo(rx1, ry1 + tick); ctx.lineTo(rx1, ry1); ctx.lineTo(rx1 + tick, ry1);
    ctx.moveTo(rx2 - tick, ry1); ctx.lineTo(rx2, ry1); ctx.lineTo(rx2, ry1 + tick);
    ctx.moveTo(rx1, ry2 - tick); ctx.lineTo(rx1, ry2); ctx.lineTo(rx1 + tick, ry2);
    ctx.moveTo(rx2 - tick, ry2); ctx.lineTo(rx2, ry2); ctx.lineTo(rx2, ry2 - tick);
    ctx.stroke();
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
  if (def.shape === "jersey") {
    drawGroundShadow(ctx, x, y + 18 * s, 13 * s, 4 * s);
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y - 13 * s);
    ctx.lineTo(x - 14 * s, y - 9 * s);
    ctx.lineTo(x - 10 * s, y - 1 * s);
    ctx.lineTo(x - 10 * s, y + 14 * s);
    ctx.lineTo(x + 10 * s, y + 14 * s);
    ctx.lineTo(x + 10 * s, y - 1 * s);
    ctx.lineTo(x + 14 * s, y - 9 * s);
    ctx.lineTo(x + 5 * s, y - 13 * s);
    ctx.quadraticCurveTo(x, y - 9 * s, x - 5 * s, y - 13 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 7 * s); ctx.lineTo(x - 5 * s, y - 7 * s); ctx.lineTo(x - 8 * s, y + 10 * s); ctx.lineTo(x - 10 * s, y + 10 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (el.number) { ctx.fillStyle = "#1a1a1a"; ctx.font = `bold ${Math.max(7, Math.round(10 * s))}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(el.number, x, y + 4 * s); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; }
  } else if (def.shape === "triangle") {
    drawGroundShadow(ctx, x, y + 15 * s, 8 * s, 2.2 * s);
    ctx.beginPath(); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x + 8 * s, y + 7 * s); ctx.lineTo(x - 8 * s, y + 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.moveTo(x, y - 9 * s); ctx.lineTo(x - 4 * s, y + 7 * s); ctx.lineTo(x - 6 * s, y + 7 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (def.shape === "ball") {
    const R = 8 * s;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const pr = R * 0.38;
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (2 * Math.PI / 5); const px = x + pr * Math.cos(a), py = y + pr * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = Math.max(0.5, 1 * s);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (2 * Math.PI / 5); ctx.moveTo(x + pr * Math.cos(a), y + pr * Math.sin(a)); ctx.lineTo(x + R * Math.cos(a), y + R * Math.sin(a)); }
    ctx.stroke();
  } else if (def.shape === "goalrect" || def.shape === "goalrect_u8" || def.shape === "goalrect_mini") {
    const cfg = GOAL_SIZES[def.shape];
    const hw = cfg.hw * s, hh = cfg.hh * s, pt = cfg.pt * s;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - hw, y - hh, pt, 2 * hh);
    ctx.fillRect(x + hw - pt, y - hh, pt, 2 * hh);
    ctx.fillRect(x - hw, y - hh, 2 * hw, pt);
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.4, 0.6 * s);
    ctx.beginPath();
    const ix1 = x - hw + pt, ix2 = x + hw - pt, iy1 = y - hh + pt, iy2 = y + hh, netN = cfg.net;
    for (let i = 1; i <= netN; i++) { const vx = ix1 + (ix2 - ix1) * (i / (netN + 1)); ctx.moveTo(vx, iy1); ctx.lineTo(vx, iy2); }
    for (let j = 1; j <= netN; j++) { const hy = iy1 + (iy2 - iy1) * (j / (netN + 1)); ctx.moveTo(ix1, hy); ctx.lineTo(ix2, hy); }
    ctx.stroke();
    ctx.restore();
  } else if (def.shape === "ladder") {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath(); ctx.moveTo(x - 10 * s, y - 16 * s); ctx.lineTo(x - 10 * s, y + 16 * s); ctx.moveTo(x + 10 * s, y - 16 * s); ctx.lineTo(x + 10 * s, y + 16 * s); ctx.stroke();
    for (let i = -14; i <= 14; i += 7) { ctx.beginPath(); ctx.moveTo(x - 10 * s, y + i * s); ctx.lineTo(x + 10 * s, y + i * s); ctx.stroke(); }
  } else if (def.shape === "pole") {
    drawGroundShadow(ctx, x, y + 17 * s, 6 * s, 2 * s);
    ctx.fillStyle = c;
    ctx.fillRect(x - 2 * s, y - 15 * s, 4 * s, 24 * s);
    ctx.beginPath(); ctx.arc(x, y - 15 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = "#fff";
    ctx.fillRect(x - 1.2 * s, y - 13 * s, 0.6 * s, 20 * s);
    ctx.restore();
  } else if (def.shape === "hurdle" || def.shape === "hurdle_low" || def.shape === "hurdle_high") {
    drawGroundShadow(ctx, x, y + 13 * s, 14 * s, 3 * s);
    const barH = HURDLE_HEIGHTS[def.shape] * s, legX = 8 * s, footY = 12 * s;
    ctx.strokeStyle = c; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(x - legX, y - barH); ctx.lineTo(x - legX, y + footY);
    ctx.moveTo(x + legX, y - barH); ctx.lineTo(x + legX, y + footY);
    ctx.moveTo(x - legX - 5 * s, y + footY); ctx.lineTo(x - legX + 5 * s, y + footY);
    ctx.moveTo(x + legX - 5 * s, y + footY); ctx.lineTo(x + legX + 5 * s, y + footY);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 3.2 * s);
    ctx.beginPath(); ctx.moveTo(x - legX, y - barH); ctx.lineTo(x + legX, y - barH); ctx.stroke();
    ctx.lineCap = "butt";
  } else if (def.shape === "hoop") {
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, 3 * s);
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

// Slalom automatique (01/10/2026, premier pilote d'animation "selon les règles" demandé par
// Gregory) : à partir d'un schéma statique où des plots sont disposés à peu près en ligne, calcule
// un trajet en zigzag passant par chaque plot dans l'ordre et produit une deuxième image où le
// porteur (et le ballon, s'il y en a un) en est sorti — `diagram`/`diagramFrames` au format déjà lu
// par ExerciseDetailModal/ExerciseAnimationPlayer (via getExerciseFrames), aucun changement de ce
// côté n'est nécessaire. Pas d'analyse du texte de la consigne : uniquement la géométrie déjà
// dessinée, ce qui reste fiable quel que soit le nom ou le thème de l'exercice — voir CLAUDE.md pour
// pourquoi ce choix ne se généralise pas à un exercice tactique (rondo, possession...), où le
// mouvement dépend de décisions, pas d'un trajet fixe. Renvoie null si le schéma ne ressemble pas à
// un slalom (moins de 2 plots, ou aucun joueur à proximité du premier).
export function generateSlalomAnimation(elements) {
  const cones = elements.filter((e) => e.type === "cone");
  if (cones.length < 2) return null;
  const xSpread = Math.max(...cones.map((c) => c.x)) - Math.min(...cones.map((c) => c.x));
  const ySpread = Math.max(...cones.map((c) => c.y)) - Math.min(...cones.map((c) => c.y));
  const axis = xSpread >= ySpread ? "x" : "y"; // trie les plots le long de leur axe dominant, pas l'ordre du tableau
  const sorted = [...cones].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0], last = sorted[sorted.length - 1];
  let avgGap = 0;
  for (let i = 1; i < sorted.length; i++) avgGap += Math.hypot(sorted[i].x - sorted[i - 1].x, sorted[i].y - sorted[i - 1].y);
  avgGap = avgGap / (sorted.length - 1);
  // Rayon de recherche généreux (validé sur les 11 genSlalom() réels de starterContent.js, 2 à 8
  // plots) : assez large pour attraper un joueur posé juste avant le premier plot, assez restreint
  // pour ignorer des joueurs sans rapport posés ailleurs sur un schéma plus complexe.
  const threshold = Math.max(avgGap * 2.5, 0.2);
  const candidates = elements.filter((e) => e.x != null && (e.type === "ball" || (e.type && (e.type.startsWith("player") || e.type === "keeper"))));
  const movers = candidates.filter((e) => Math.hypot(e.x - first.x, e.y - first.y) <= threshold);
  if (movers.filter((e) => e.type !== "ball").length === 0) return null; // un ballon seul, sans porteur, ne définit pas un trajet
  const dx = last.x - first.x, dy = last.y - first.y;
  const dirLen = Math.hypot(dx, dy) || 1;
  // Plafonnée : avec seulement 2 plots, l'unique "espacement" couvre tout le slalom, et la moitié
  // de sa valeur dépasserait largement le terrain (trouvé en testant genSlalom(2), ligne réelle de
  // starterContent.js — le point de sortie tombait hors cadre et se retrouvait plaqué au bord).
  const exitExt = Math.min(avgGap * 0.5, 0.08);
  const endX = Math.min(1, Math.max(0, last.x + (dx / dirLen) * exitExt));
  const endY = Math.min(1, Math.max(0, last.y + (dy / dirLen) * exitExt));
  const movePath = sorted.map((c) => ({ x: c.x, y: c.y }));
  const moverIds = new Set(movers.map((e) => e.id));
  const frame1 = elements.map((e) => (moverIds.has(e.id) ? { ...e, movePath } : e));
  const frame2 = elements.map((e) => (moverIds.has(e.id) ? { ...e, x: endX, y: endY } : e));
  return { diagram: frame1, diagramFrames: [frame2] };
}

// Sprint en ligne (01/10/2026, même principe pour genSprintLanes()). Contrairement au slalom, pas de
// tri par position : chaque couloir est une paire de plots consécutifs dans le tableau (départ,
// arrivée — toujours poussés dans cet ordre, couloir par couloir), et une ligne droite n'a de toute
// façon aucun zigzag à reconstituer. Chaque joueur rejoint le plot d'arrivée de son propre couloir
// (le plus proche de son plot de départ) en ligne droite, sans movePath. Renvoie null si le nombre
// de plots est impair ou si aucun couloir n'a de joueur à proximité de son plot de départ.
export function generateSprintAnimation(elements) {
  const cones = elements.filter((e) => e.type === "cone");
  if (cones.length < 2 || cones.length % 2 !== 0) return null;
  const players = elements.filter((e) => e.x != null && e.type && (e.type.startsWith("player") || e.type === "keeper"));
  const targets = new Map();
  for (let i = 0; i < cones.length; i += 2) {
    const a = cones[i], b = cones[i + 1];
    const start = a.x <= b.x ? a : b, end = a.x <= b.x ? b : a;
    let mover = null, bestDist = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.x - start.x, p.y - start.y);
      if (d < bestDist) { bestDist = d; mover = p; }
    }
    if (mover && bestDist <= 0.15) targets.set(mover.id, { x: end.x, y: end.y });
  }
  if (targets.size === 0) return null;
  const frame2 = elements.map((e) => (targets.has(e.id) ? { ...e, ...targets.get(e.id) } : e));
  return { diagram: elements, diagramFrames: [frame2] };
}

// Parcours d'agilité (01/10/2026, même principe pour genAgilityPattern()). Contrairement au slalom,
// les plots ne sont pas alignés sur un axe (schéma en étoile, qui repasse deux fois par le centre) :
// les trier par position mélangerait le trajet voulu. L'ordre de création du tableau EST l'ordre du
// trajet (toujours le même, fixé par genAgilityPattern()) : le joueur le plus proche du premier plot
// les traverse dans cet ordre exact. Pas de recherche de ballon : ce type d'exercice (changements
// d'appuis/direction) n'en a jamais dans la bibliothèque actuelle.
export function generateAgilityAnimation(elements) {
  const cones = elements.filter((e) => e.type === "cone");
  if (cones.length < 2) return null;
  const first = cones[0], last = cones[cones.length - 1];
  const players = elements.filter((e) => e.x != null && e.type && (e.type.startsWith("player") || e.type === "keeper"));
  let mover = null, bestDist = Infinity;
  for (const p of players) {
    const d = Math.hypot(p.x - first.x, p.y - first.y);
    if (d < bestDist) { bestDist = d; mover = p; }
  }
  if (!mover || bestDist > 0.5) return null;
  const movePath = cones.map((c) => ({ x: c.x, y: c.y }));
  const frame1 = elements.map((e) => (e.id === mover.id ? { ...e, movePath } : e));
  const frame2 = elements.map((e) => (e.id === mover.id ? { ...e, x: last.x, y: last.y } : e));
  return { diagram: frame1, diagramFrames: [frame2] };
}

// Feinte de dribble (01/10/2026, même principe pour genDribbleMove()). Reprend la courbe déjà posée
// à la main sur la flèche décorative qu'on lui passe (x1/y1 -> x2/y2 via cx/cy) comme SEUL segment du
// trajet, via moveCx/moveCy sur l'image de départ plutôt qu'un movePath : il n'y a aucun point de
// passage intermédiaire, juste un départ et une arrivée courbés — exactement le cas prévu pour
// moveCx/moveCy (voir interpolatePadElement). Appliquée au porteur et au ballon par la même
// translation, pour qu'ils restent ensemble comme au contrôle. La flèche n'est là que pour donner sa
// courbe : elle est retirée du résultat (devenue redondante une fois le trajet réellement animé,
// même choix que pour le slalom et le reste de cette fiche). Renvoie null si le schéma n'a pas la
// forme attendue (pas de plot, ou pas de flèche de dribble courbée pour en déduire le contournement).
export function generateDribbleAnimation(elements) {
  const cone = elements.find((e) => e.type === "cone");
  const arrow = elements.find((e) => e.type === "arrowDribble" && e.curved && e.cx != null && e.cy != null);
  if (!cone || !arrow) return null;
  const dx = arrow.x2 - arrow.x1, dy = arrow.y2 - arrow.y1;
  const cdx = arrow.cx - arrow.x1, cdy = arrow.cy - arrow.y1;
  const movers = elements.filter((e) => e.x != null && (e.type === "ball" || (e.type && (e.type.startsWith("player") || e.type === "keeper"))));
  if (movers.length === 0) return null;
  const moverIds = new Set(movers.map((e) => e.id));
  const withoutArrow = elements.filter((e) => e.id !== arrow.id);
  const frame1 = withoutArrow.map((e) => (moverIds.has(e.id) ? { ...e, moveCx: e.x + cdx, moveCy: e.y + cdy } : e));
  const frame2 = withoutArrow.map((e) => (moverIds.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
  return { diagram: frame1, diagramFrames: [frame2] };
}

// Trajet simple le long d'une flèche déjà posée (01/10/2026, suite du pilote slalom, pour
// genLine()/genShooting()/genPassingGrid()). Contrairement au slalom, la flèche existante décrit déjà
// sans ambiguïté le trajet voulu (un seul segment droit, jamais courbé dans ces trois fonctions) :
// pas besoin de déduire un ordre depuis des plots, juste rejouer x1/y1 -> x2/y2. Toujours le ballon,
// jamais un joueur même s'il se trouve par hasard plus près du départ de la flèche (cas réel sur
// genLine(3, 1) : l'unique attaquant tombe exactement sur le départ de la flèche, un peu plus près que
// le ballon — l'animer aurait pu vouloir dire "l'attaquant démarque" ou "le ballon est joué devant
// lui", deux lectures différentes d'un même schéma ; rester sur le ballon évite ce choix). Seuil de
// proximité volontairement plus serré que pour le slalom (0,08, pas 2,5x l'espacement moyen) : il ne
// s'agit pas de capturer un porteur posé à quelque distance d'un premier plot, mais de confirmer que
// LE ballon dessiné est bien celui que la flèche décrit, pas un simple repère sans rapport avec elle.
// Renvoie null si aucun ballon n'est à cette distance : la flèche reste alors affichée telle quelle.
export function generateArrowPathAnimation(elements) {
  const arrow = elements.find((e) => (e.type === "arrowMove" || e.type === "arrowPass") && !e.curved);
  if (!arrow) return null;
  const ball = elements.find((e) => e.type === "ball" && e.x != null);
  if (!ball || Math.hypot(ball.x - arrow.x1, ball.y - arrow.y1) > 0.08) return null;
  const dx = arrow.x2 - arrow.x1, dy = arrow.y2 - arrow.y1;
  const withoutArrow = elements.filter((e) => e.id !== arrow.id);
  const frame2 = withoutArrow.map((e) => (e.id === ball.id ? { ...e, x: e.x + dx, y: e.y + dy } : e));
  return { diagram: withoutArrow, diagramFrames: [frame2] };
}

// Animation générique, pour N'IMPORTE QUEL schéma de la bibliothèque qui contient une ou plusieurs
// flèches de mouvement (01/10/2026, chantier large demandé par Gregory après les 7 fonctions
// ci-dessus ; généralisée le jour même aux schémas à PLUSIEURS flèches sur sa demande explicite
// « j'aimerais que l'ensemble avec schéma où il y a des mouvements annoncés le soit »). Contrairement
// à generateArrowPathAnimation (réservée à 3 générateurs connus, où le ballon est le SEUL choix
// possible, vérifié au cas par cas) : ici, sans rien savoir à l'avance de la forme du schéma, les
// règles sont volontairement plus prudentes qu'ambitieuses — préférer ne rien animer plutôt
// qu'animer le mauvais élément, cf. les cas réels ci-dessous, tous trouvés par un script d'analyse
// jetable sur la bibliothèque réelle avant d'écrire cette fonction, pas après.
//
// Chaque flèche a un « mobile indépendant » : le ballon s'il est à moins de 0,08 de son départ,
// sinon le joueur/gardien le plus proche à la même distance (un schéma sans ballon, ex. "Pliométrie,
// détente et puissance", a besoin qu'un JOUEUR bouge). Les flèches sont ensuite regroupées en
// CHAÎNES : la flèche A s'enchaîne dans la flèche B si la fin de A touche le départ de B (à 0,08)
// ET qu'aucun ballon dédié n'attend déjà à cet endroit — un ballon déjà présent au départ de B
// signifie que B a son PROPRE mobile indépendant (deux mouvements simultanés, pas un seul qui
// continue). Exemple réel qui a motivé cette distinction : "La traversée magique" a deux dribbles
// qui se croisent en sens opposé, chacun avec son propre ballon déjà posé au départ de sa flèche —
// leurs flèches se touchent par coïncidence au milieu du terrain, mais ce sont deux mouvements
// indépendants, pas une chaîne ; alors que "Le troisième homme joué" (passe puis remise, un seul
// ballon dans tout le schéma) n'a qu'un joueur RECEVEUR au départ de la 2e flèche, jamais de ballon
// dédié : la bonne lecture est que le même ballon continue sa course. Chaque groupe (chaîne ou
// flèche seule) anime le mobile indépendant de sa PREMIÈRE flèche sur tout le trajet du groupe
// (movePath = la fin de chaque flèche sauf la dernière, qui devient la position finale) ; un
// compagnon (ballon + un seul joueur/gardien à moins de 0,08 DU BALLON lui-même, même règle que pour
// une flèche seule) suit le même trajet avec un décalage constant tout au long de la chaîne, jamais
// recalé flèche par flèche. Courbes (cx/cy) gérées par segment, y compris au milieu d'une chaîne.
//
// Sécurité, dans l'ordre : (1) un groupe sans mobile indépendant (aucun ballon ni joueur à portée du
// départ de sa première flèche) annule TOUT le schéma, pas seulement ce groupe — ex. "La fractale du
// troisième homme", où une 4e flèche isolée n'a personne à proximité. (2) deux groupes qui
// réclament le MÊME élément annulent aussi tout le schéma — ex. "Le une-deux simple" (un joueur sans
// ballon dessiné est à la fois le départ d'une passe ET d'une course, deux actions divergentes,
// impossible de savoir laquelle est la vraie) et "Passer les ponts" (même joueur au départ d'un
// dribble ET d'une course en sens opposé — deux variantes alternatives illustrées côte à côte, pas
// une seule action). (3) jamais de reconstruction de trajet à partir des plots environnants
// (contrairement au slalom) : un schéma avec des plots a souvent des plots-OBJECTIF (quilles de
// bowling, cage) plutôt que des plots-JALON, les distinguer demanderait de comprendre l'exercice, pas
// seulement sa géométrie — un schéma au vrai zigzag non annoncé par une flèche n'anime donc que ce
// que ses flèches décrivent réellement, ni plus ni moins fidèle que le schéma statique d'origine.
// Renvoie null si rien d'exploitable n'est trouvé (aucune flèche, ou une des sécurités ci-dessus) :
// le schéma reste alors affiché tel quel. N'est appelée qu'à l'affichage (voir
// getExerciseDisplayFrames, App.jsx), jamais dans le formulaire d'édition : un exercice qu'un coach
// anime lui-même à la main dans l'éditeur garde exactement ses propres images, jamais recalculées
// par-dessus au moment de les modifier.
export function deriveArrowAnimation(elements) {
  const arrowTypes = new Set(["arrowMove", "arrowPass", "arrowDribble"]);
  const arrows = elements.filter((e) => arrowTypes.has(e.type));
  if (arrows.length === 0) return null;
  const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

  function independentMover(arrow) {
    const ball = elements.find((e) => e.type === "ball" && e.x != null && dist(e.x, e.y, arrow.x1, arrow.y1) <= 0.08);
    if (ball) return ball;
    const players = elements.filter((e) => e.x != null && e.type && (e.type.startsWith("player") || e.type === "keeper") && dist(e.x, e.y, arrow.x1, arrow.y1) <= 0.08);
    return players.reduce((best, p) => (!best || dist(p.x, p.y, arrow.x1, arrow.y1) < dist(best.x, best.y, arrow.x1, arrow.y1) ? p : best), null);
  }
  const movers = arrows.map(independentMover);

  // Regroupement en chaînes : voir le commentaire au-dessus de la fonction pour la règle exacte.
  const chainsTo = arrows.map((a, i) => {
    for (let j = 0; j < arrows.length; j++) {
      if (j === i || dist(a.x2, a.y2, arrows[j].x1, arrows[j].y1) > 0.08) continue;
      const ballAtStart = elements.find((e) => e.type === "ball" && e.x != null && dist(e.x, e.y, arrows[j].x1, arrows[j].y1) <= 0.08);
      if (ballAtStart) continue;
      return j;
    }
    return -1;
  });
  const isChainTarget = new Array(arrows.length).fill(false);
  chainsTo.forEach((j) => { if (j >= 0) isChainTarget[j] = true; });
  const groups = [];
  const visited = new Array(arrows.length).fill(false);
  for (let i = 0; i < arrows.length; i++) {
    if (isChainTarget[i] || visited[i]) continue;
    const chain = [i]; visited[i] = true; let cur = i;
    while (chainsTo[cur] >= 0 && !visited[chainsTo[cur]]) { cur = chainsTo[cur]; chain.push(cur); visited[cur] = true; }
    groups.push(chain);
  }
  for (let i = 0; i < arrows.length; i++) if (!visited[i]) groups.push([i]); // sécurité (cycle improbable)

  const groupMovers = groups.map((g) => movers[g[0]]);
  if (groupMovers.some((m) => !m)) return null;
  const idCounts = new Map();
  groupMovers.forEach((m) => idCounts.set(m.id, (idCounts.get(m.id) || 0) + 1));
  if ([...idCounts.values()].some((c) => c > 1)) return null;

  const frame1Patch = new Map();
  const frame2Patch = new Map();
  groups.forEach((group, gi) => {
    const primary = groupMovers[gi];
    const chainArrows = group.map((i) => arrows[i]);
    // Vecteur cumulé de déplacement segment après segment, courbure incluse — toujours exprimé en
    // RELATIF (par rapport au départ de son propre segment), jamais en absolu, pour rester juste
    // quel que soit le mobile (principal ou compagnon, décalé du ballon) appliqué dessus ensuite.
    let cumDx = 0, cumDy = 0;
    const segments = chainArrows.map((a) => {
      const seg = {
        dx: a.x2 - a.x1, dy: a.y2 - a.y1,
        curveDx: a.curved && a.cx != null ? a.cx - a.x1 : null,
        curveDy: a.curved && a.cy != null ? a.cy - a.y1 : null,
        cumDxBefore: cumDx, cumDyBefore: cumDy,
      };
      cumDx += seg.dx; cumDy += seg.dy;
      return seg;
    });
    let companion = null;
    if (primary.type === "ball") {
      const candidates = elements.filter((e) => e.id !== primary.id && e.x != null && e.type && (e.type.startsWith("player") || e.type === "keeper") && dist(e.x, e.y, primary.x, primary.y) <= 0.08);
      if (candidates.length === 1) companion = candidates[0];
    }
    (companion ? [primary, companion] : [primary]).forEach((mv) => {
      const movePath = segments.slice(0, -1).map((seg) => {
        const pt = { x: mv.x + seg.cumDxBefore + seg.dx, y: mv.y + seg.cumDyBefore + seg.dy };
        if (seg.curveDx != null) { pt.cx = mv.x + seg.cumDxBefore + seg.curveDx; pt.cy = mv.y + seg.cumDyBefore + seg.curveDy; }
        return pt;
      });
      const lastSeg = segments[segments.length - 1];
      const patch1 = {};
      if (movePath.length > 0) patch1.movePath = movePath;
      if (lastSeg.curveDx != null) { patch1.moveCx = mv.x + lastSeg.cumDxBefore + lastSeg.curveDx; patch1.moveCy = mv.y + lastSeg.cumDyBefore + lastSeg.curveDy; }
      frame1Patch.set(mv.id, patch1);
      frame2Patch.set(mv.id, { x: mv.x + lastSeg.cumDxBefore + lastSeg.dx, y: mv.y + lastSeg.cumDyBefore + lastSeg.dy });
    });
  });

  const withoutArrows = elements.filter((e) => !arrowTypes.has(e.type));
  const frame1 = withoutArrows.map((e) => (frame1Patch.has(e.id) ? { ...e, ...frame1Patch.get(e.id) } : e));
  const frame2 = withoutArrows.map((e) => (frame2Patch.has(e.id) ? { ...e, ...frame2Patch.get(e.id) } : e));
  return { diagram: frame1, diagramFrames: [frame2] };
}
