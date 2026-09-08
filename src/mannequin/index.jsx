// Pantin articulé animé (Vestiaire → Préparation physique → Mouvements animés) — extrait de
// App.jsx (séparation des fichiers, sans changement de comportement).

import { useState, useEffect, useRef } from "react";
import { newId } from "../lib/utils.js";

// --- Pantin articulé : bibliothèque de mouvements animés ---
// Silhouette vue de profil, coordonnées normalisées (0-1). Chaque mouvement est une suite de 1 à 3
// poses-clés ; la lecture bascule simplement d'une pose à l'autre (pas d'interpolation lissée pour
// cette première version — volontairement plus simple à construire et à vérifier).
// Référence de structure du squelette (quelle articulation se relie à quelle autre) — utile pour
// s'y retrouver et pour un futur éditeur libre. Le rendu réel (drawMannequin, plus bas) ne boucle
// plus dessus directement : chaque segment y a sa propre épaisseur (bras/jambe, avant/arrière),
// ce qu'une boucle générique à largeur unique ne permettait pas.
const MANNEQUIN_BONES = [
  ["tete", "cou"], ["cou", "epaule"], ["epaule", "hanche"], ["cou", "hanche"],
  ["epaule", "coude_avant"], ["coude_avant", "main_avant"],
  ["epaule", "coude_arriere"], ["coude_arriere", "main_arriere"],
  ["hanche", "genou_avant"], ["genou_avant", "cheville_avant"], ["cheville_avant", "pied_avant"],
  ["hanche", "genou_arriere"], ["genou_arriere", "cheville_arriere"], ["cheville_arriere", "pied_arriere"],
];

// Complète un membre avant déjà posé par son double arrière, décalé d'un petit delta constant —
// pour les mouvements symétriques (les deux bras/jambes font le même geste), où recalculer chaque
// coordonnée à la main serait une source d'erreur inutile pour un simple effet de profondeur.
function withBackLimb(pose, dx = 0.015, dy = -0.025) {
  return {
    ...pose,
    coude_arriere: { x: pose.coude_avant.x + dx, y: pose.coude_avant.y + dy },
    main_arriere: { x: pose.main_avant.x + dx, y: pose.main_avant.y + dy },
    genou_arriere: { x: pose.genou_avant.x + dx, y: pose.genou_avant.y + dy },
    cheville_arriere: { x: pose.cheville_avant.x + dx, y: pose.cheville_avant.y + dy },
    pied_arriere: { x: pose.pied_avant.x + dx, y: pose.pied_avant.y + dy },
  };
}

// Dessine un segment de membre comme une ellipse orientée le long de l'os (axe long = longueur
// du segment, axe court = épaisseur) plutôt qu'un simple trait épais — c'est ce qui donne l'aspect
// "pantin en bois articulé" avec des masses ovales pleines, comme le pantin de dessin de référence.
function drawLimbEllipse(ctx, from, to, width, alpha) {
  if (!from || !to) return;
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 0.001;
  const angle = Math.atan2(dy, dx);
  const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, length / 2, width / 2, angle, 0, Math.PI * 2);
  ctx.fill();
}

function drawJointCircle(ctx, pt, radius, alpha) {
  if (!pt) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
}

// Toutes les proportions du pantin, réglables depuis l'onglet "Mouvements animés" plutôt que
// codées en dur — pour que ce soit toi qui ajustes en voyant le résultat en direct, plutôt que
// moi qui devine à l'aveugle à travers des allers-retours de captures d'écran.
const DEFAULT_MANNEQUIN_PROPORTIONS = {
  // Réglages finaux de Gregory, ajustés lui-même en direct avec l'aperçu via le panneau de
  // réglages — remplace la base mesurée sur l'image de référence, qui a servi de point de départ
  // mais a ensuite été affinée à l'usage. Ce sont les valeurs qui font foi maintenant.
  armWidth: 0.048, forearmWidth: 0.036, elbowSize: 0.024,
  thighWidth: 0.066, shinWidth: 0.05, kneeSize: 0.028,
  footWidth: 0.041, ankleSize: 0.022,
  chestWidth: 0.185, chestLength: 0.5, chestPosition: 0.37,
  pelvisWidth: 0.17, pelvisLength: 0.225, pelvisPosition: 0.95,
  neckWidth: 0.02,
  headWidth: 0.052, headHeight: 0.072,
  backLimbOpacity: 1,
};

function drawMannequin(ctx, pose, w, h, proportions = DEFAULT_MANNEQUIN_PROPORTIONS) {
  if (!pose) return;
  const P = (name) => ({ x: pose[name].x * w, y: pose[name].y * h });
  ctx.save();
  ctx.fillStyle = "#2B2235";
  ctx.strokeStyle = "#2B2235";

  const tete = P("tete"), cou = P("cou"), epaule = P("epaule"), hanche = P("hanche");
  const coudeA = pose.coude_avant ? P("coude_avant") : null, mainA = pose.main_avant ? P("main_avant") : null;
  const genouA = pose.genou_avant ? P("genou_avant") : null, chevilleA = pose.cheville_avant ? P("cheville_avant") : null, piedA = pose.pied_avant ? P("pied_avant") : null;
  const coudeR = pose.coude_arriere ? P("coude_arriere") : null, mainR = pose.main_arriere ? P("main_arriere") : null;
  const genouR = pose.genou_arriere ? P("genou_arriere") : null, chevilleR = pose.cheville_arriere ? P("cheville_arriere") : null, piedR = pose.pied_arriere ? P("pied_arriere") : null;

  const scale = Math.min(w, h);
  const backAlpha = proportions.backLimbOpacity;

  // Membres arrière d'abord (derrière visuellement, opacité réduite)
  drawLimbEllipse(ctx, epaule, coudeR, scale * proportions.armWidth, backAlpha);
  drawLimbEllipse(ctx, coudeR, mainR, scale * proportions.forearmWidth, backAlpha);
  drawJointCircle(ctx, coudeR, scale * proportions.elbowSize, backAlpha);
  drawLimbEllipse(ctx, hanche, genouR, scale * proportions.thighWidth, backAlpha);
  drawLimbEllipse(ctx, genouR, chevilleR, scale * proportions.shinWidth, backAlpha);
  drawJointCircle(ctx, genouR, scale * proportions.kneeSize, backAlpha);
  drawLimbEllipse(ctx, chevilleR, piedR, scale * proportions.footWidth, backAlpha);
  drawJointCircle(ctx, chevilleR, scale * proportions.ankleSize, backAlpha);

  // Torse : deux masses ovales qui se chevauchent (poitrine + bassin) le long de l'axe
  // épaule-hanche, plutôt qu'un simple quadrilatère. Tailles proportionnelles à la longueur
  // réelle épaule-hanche de la pose (pas une taille fixe).
  ctx.globalAlpha = 1;
  const spineX = hanche.x - epaule.x, spineY = hanche.y - epaule.y;
  const spineLen = Math.hypot(spineX, spineY) || 0.001;
  const spineAngle = Math.atan2(spineY, spineX);
  const chestCx = epaule.x + spineX * proportions.chestPosition, chestCy = epaule.y + spineY * proportions.chestPosition;
  const pelvisCx = epaule.x + spineX * proportions.pelvisPosition, pelvisCy = epaule.y + spineY * proportions.pelvisPosition;
  ctx.beginPath(); ctx.ellipse(chestCx, chestCy, spineLen * proportions.chestWidth, spineLen * proportions.chestLength, spineAngle - Math.PI / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(pelvisCx, pelvisCy, spineLen * proportions.pelvisWidth, spineLen * proportions.pelvisLength, spineAngle - Math.PI / 2, 0, Math.PI * 2); ctx.fill();

  // Cou : jusqu'à l'épaule directement (pas jusqu'au point "cou" intermédiaire) pour qu'il n'y ait
  // aucun espace visible entre la base du cou et le haut du torse.
  ctx.beginPath(); ctx.ellipse((tete.x + epaule.x) / 2, (tete.y + epaule.y) / 2, Math.hypot(epaule.x - tete.x, epaule.y - tete.y) / 2 || 0.001, scale * proportions.neckWidth, Math.atan2(epaule.y - tete.y, epaule.x - tete.x), 0, Math.PI * 2); ctx.fill();

  // Membres avant (par-dessus, pleine opacité)
  drawLimbEllipse(ctx, epaule, coudeA, scale * proportions.armWidth, 1);
  drawLimbEllipse(ctx, coudeA, mainA, scale * proportions.forearmWidth, 1);
  drawJointCircle(ctx, coudeA, scale * proportions.elbowSize, 1);
  drawLimbEllipse(ctx, hanche, genouA, scale * proportions.thighWidth, 1);
  drawLimbEllipse(ctx, genouA, chevilleA, scale * proportions.shinWidth, 1);
  drawJointCircle(ctx, genouA, scale * proportions.kneeSize, 1);
  drawLimbEllipse(ctx, chevilleA, piedA, scale * proportions.footWidth, 1);
  drawJointCircle(ctx, chevilleA, scale * proportions.ankleSize, 1);

  // Épaule et hanche : disques qui comblent l'espace entre le cou/cuisse et le torse. Le rayon
  // se calcule automatiquement à partir de l'espace réel laissé par la poitrine/le bassin (leur
  // position et leur longueur), plutôt que d'être un réglage séparé à garder synchronisé à la
  // main — deux curseurs qui pouvaient se décaler l'un de l'autre et rouvrir le vide déjà corrigé.
  const shoulderGap = Math.max(0, proportions.chestPosition - proportions.chestLength);
  const hipGap = Math.max(0, (1 - proportions.pelvisPosition) - proportions.pelvisLength);
  drawJointCircle(ctx, epaule, spineLen * (shoulderGap + 0.05), 1);
  drawJointCircle(ctx, hanche, spineLen * (hipGap + 0.05), 1);

  // Tête : légèrement ovale plutôt qu'un cercle parfait
  ctx.globalAlpha = 1;
  const headAngle = Math.atan2(epaule.y - tete.y, epaule.x - tete.x) - Math.PI / 2;
  ctx.beginPath(); ctx.ellipse(tete.x, tete.y, scale * proportions.headWidth, scale * proportions.headHeight, headAngle, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ============================================================================
// PROPOSITION : second style de rendu, plus proche d'une silhouette humaine.
// Réutilise exactement les mêmes données de pose (aucune coordonnée d'articulation
// retouchée) — seule la façon de les DESSINER change. Deux différences principales
// avec le style actuel : les membres sont effilés (plus larges près du tronc, plus
// fins vers l'extrémité, comme un vrai bras ou une vraie jambe) au lieu d'une
// épaisseur uniforme ; et le torse est une seule silhouette en quatre sections
// (épaule/poitrine/taille/bassin) au lieu de deux ovales superposés — ce qui
// élimine par construction le problème de "vide" rencontré avec l'ancien torse,
// puisque la silhouette part exactement de l'épaule et rejoint exactement la hanche.
// ============================================================================
const REALISTIC_PROPORTIONS = {
  shoulderWidth: 0.09, chestWidth: 0.115, waistWidth: 0.07, hipWidth: 0.1,
  chestPosition: 0.32, waistPosition: 0.62,
  armWidthNear: 0.052, forearmWidthNear: 0.04,
  thighWidthNear: 0.078, shinWidthNear: 0.052,
  taperFactor: 0.62,
  headWidth: 0.048, headHeight: 0.066,
  neckWidth: 0.032,
  handSize: 0.034, footSize: 0.042,
  elbowSize: 0.024, kneeSize: 0.03, shoulderJointSize: 0.03, hipJointSize: 0.034, wristAnkleSize: 0.02,
  backLimbOpacity: 0.5,
};

// Trapèze plein entre deux points, plus large à "from" qu'à "to" — le principe de
// base de l'effilement. Une forme simple (4 points, pas d'arc de cercle) volontairement
// choisie pour rester robuste à vérifier, plutôt qu'une capsule à bouts arrondis dont le
// sens de tracé serait plus délicat à garantir correct sans pouvoir voir le résultat.
function drawTaperedLimb(ctx, from, to, widthNear, widthFar, alpha) {
  if (!from || !to) return;
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const perpX = -dy / dist, perpY = dx / dist;
  const rNear = widthNear / 2, rFar = widthFar / 2;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(from.x + perpX * rNear, from.y + perpY * rNear);
  ctx.lineTo(to.x + perpX * rFar, to.y + perpY * rFar);
  ctx.lineTo(to.x - perpX * rFar, to.y - perpY * rFar);
  ctx.lineTo(from.x - perpX * rNear, from.y - perpY * rNear);
  ctx.closePath();
  ctx.fill();
}

// Torse en une seule silhouette (polygone à 8 points) traversant quatre largeurs le
// long de l'axe épaule-hanche, plutôt que deux ovales séparés. Les coins "épaule"
// (t=0) et "hanche" (t=1) tombent exactement sur les points épaule/hanche eux-mêmes
// — donc aucun vide possible avec le cou ou les cuisses par construction, contrairement
// à l'ancien système où deux ellipses positionnées indépendamment pouvaient se
// désolidariser si on changeait leur taille ou leur position.
function drawTorsoRealiste(ctx, epaule, hanche, proportions) {
  const spineX = hanche.x - epaule.x, spineY = hanche.y - epaule.y;
  const spineLen = Math.hypot(spineX, spineY) || 0.001;
  const perpX = -spineY / spineLen, perpY = spineX / spineLen;
  function crossSection(t, widthFactor) {
    const cx = epaule.x + spineX * t, cy = epaule.y + spineY * t;
    const r = (spineLen * widthFactor) / 2;
    return { left: { x: cx + perpX * r, y: cy + perpY * r }, right: { x: cx - perpX * r, y: cy - perpY * r } };
  }
  const shoulder = crossSection(0, proportions.shoulderWidth);
  const chest = crossSection(proportions.chestPosition, proportions.chestWidth);
  const waist = crossSection(proportions.waistPosition, proportions.waistWidth);
  const hip = crossSection(1, proportions.hipWidth);
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(shoulder.left.x, shoulder.left.y);
  ctx.lineTo(chest.left.x, chest.left.y);
  ctx.lineTo(waist.left.x, waist.left.y);
  ctx.lineTo(hip.left.x, hip.left.y);
  ctx.lineTo(hip.right.x, hip.right.y);
  ctx.lineTo(waist.right.x, waist.right.y);
  ctx.lineTo(chest.right.x, chest.right.y);
  ctx.lineTo(shoulder.right.x, shoulder.right.y);
  ctx.closePath();
  ctx.fill();
}

// Petite forme ovale distincte pour la main ou le pied, orientée dans le prolongement
// de l'avant-bras ou du mollet — plutôt que de laisser le membre effilé se terminer
// brutalement sur l'articulation du poignet/de la cheville.
function drawHandFoot(ctx, jointBefore, joint, size, alpha) {
  if (!jointBefore || !joint) return;
  const angle = Math.atan2(joint.y - jointBefore.y, joint.x - jointBefore.x);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(joint.x, joint.y, size, size * 0.7, angle, 0, Math.PI * 2);
  ctx.fill();
}

function drawMannequinRealiste(ctx, pose, w, h, proportions = REALISTIC_PROPORTIONS) {
  if (!pose) return;
  const P = (name) => ({ x: pose[name].x * w, y: pose[name].y * h });
  ctx.save();
  ctx.fillStyle = "#2B2235";
  ctx.strokeStyle = "#2B2235";

  const tete = P("tete"), epaule = P("epaule"), hanche = P("hanche");
  const coudeA = pose.coude_avant ? P("coude_avant") : null, mainA = pose.main_avant ? P("main_avant") : null;
  const genouA = pose.genou_avant ? P("genou_avant") : null, chevilleA = pose.cheville_avant ? P("cheville_avant") : null, piedA = pose.pied_avant ? P("pied_avant") : null;
  const coudeR = pose.coude_arriere ? P("coude_arriere") : null, mainR = pose.main_arriere ? P("main_arriere") : null;
  const genouR = pose.genou_arriere ? P("genou_arriere") : null, chevilleR = pose.cheville_arriere ? P("cheville_arriere") : null, piedR = pose.pied_arriere ? P("pied_arriere") : null;

  const scale = Math.min(w, h);
  const backAlpha = proportions.backLimbOpacity;
  const taper = proportions.taperFactor;
  const armFar = scale * proportions.armWidthNear * taper, forearmFar = scale * proportions.forearmWidthNear * taper;
  const thighFar = scale * proportions.thighWidthNear * taper, shinFar = scale * proportions.shinWidthNear * taper;

  // Membres arrière
  drawTaperedLimb(ctx, epaule, coudeR, scale * proportions.armWidthNear, armFar, backAlpha);
  drawTaperedLimb(ctx, coudeR, mainR, scale * proportions.forearmWidthNear, forearmFar, backAlpha);
  drawJointCircle(ctx, coudeR, scale * proportions.elbowSize, backAlpha);
  drawJointCircle(ctx, chevilleR, scale * proportions.wristAnkleSize, backAlpha);
  drawTaperedLimb(ctx, hanche, genouR, scale * proportions.thighWidthNear, thighFar, backAlpha);
  drawTaperedLimb(ctx, genouR, chevilleR, scale * proportions.shinWidthNear, shinFar, backAlpha);
  drawJointCircle(ctx, genouR, scale * proportions.kneeSize, backAlpha);
  drawHandFoot(ctx, chevilleR, piedR, scale * proportions.footSize, backAlpha);
  drawHandFoot(ctx, coudeR, mainR, scale * proportions.handSize, backAlpha);

  // Torse (silhouette pleine, une seule forme)
  drawTorsoRealiste(ctx, epaule, hanche, proportions);

  // Cou : trapèze effilé de la tête vers l'épaule
  drawTaperedLimb(ctx, tete, epaule, scale * proportions.neckWidth * 0.85, scale * proportions.neckWidth * 1.15, 1);

  // Membres avant
  drawTaperedLimb(ctx, epaule, coudeA, scale * proportions.armWidthNear, armFar, 1);
  drawTaperedLimb(ctx, coudeA, mainA, scale * proportions.forearmWidthNear, forearmFar, 1);
  drawJointCircle(ctx, coudeA, scale * proportions.elbowSize, 1);
  drawJointCircle(ctx, chevilleA, scale * proportions.wristAnkleSize, 1);
  drawTaperedLimb(ctx, hanche, genouA, scale * proportions.thighWidthNear, thighFar, 1);
  drawTaperedLimb(ctx, genouA, chevilleA, scale * proportions.shinWidthNear, shinFar, 1);
  drawJointCircle(ctx, genouA, scale * proportions.kneeSize, 1);
  drawHandFoot(ctx, chevilleA, piedA, scale * proportions.footSize, 1);
  drawHandFoot(ctx, coudeA, mainA, scale * proportions.handSize, 1);

  // Épaule et hanche : lissent la jonction membre/torse (plus une histoire de largeur
  // à raccorder que de vide à combler, la silhouette du torse touchant déjà ces points).
  drawJointCircle(ctx, epaule, scale * proportions.shoulderJointSize, 1);
  drawJointCircle(ctx, hanche, scale * proportions.hipJointSize, 1);

  // Tête, orientée selon l'angle du cou comme dans le style actuel
  ctx.globalAlpha = 1;
  const headAngle = Math.atan2(epaule.y - tete.y, epaule.x - tete.x) - Math.PI / 2;
  ctx.beginPath(); ctx.ellipse(tete.x, tete.y, scale * proportions.headWidth, scale * proportions.headHeight, headAngle, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}


const MANNEQUIN_MOVEMENTS = {
  reference: {
    label: "Position de référence", category: "Référence",
    poses: [
      { tete: { x: 0.5, y: 0.08 }, cou: { x: 0.5, y: 0.14 }, epaule: { x: 0.5, y: 0.2 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.74, y: 0.19 }, main_avant: { x: 0.95, y: 0.17 }, coude_arriere: { x: 0.26, y: 0.19 }, main_arriere: { x: 0.05, y: 0.17 }, genou_avant: { x: 0.63, y: 0.75 }, cheville_avant: { x: 0.7, y: 0.95 }, pied_avant: { x: 0.75, y: 0.98 }, genou_arriere: { x: 0.37, y: 0.75 }, cheville_arriere: { x: 0.3, y: 0.95 }, pied_arriere: { x: 0.25, y: 0.98 } },
    ],
  },
  pompe: {
    label: "Pompe", category: "Musculation",
    poses: [
      withBackLimb({ tete: { x: 0.78, y: 0.36 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.4 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.6, y: 0.55 }, main_avant: { x: 0.55, y: 0.68 }, genou_avant: { x: 0.35, y: 0.55 }, cheville_avant: { x: 0.15, y: 0.62 }, pied_avant: { x: 0.1, y: 0.65 } }),
      withBackLimb({ tete: { x: 0.72, y: 0.58 }, cou: { x: 0.68, y: 0.6 }, epaule: { x: 0.65, y: 0.62 }, hanche: { x: 0.5, y: 0.58 }, coude_avant: { x: 0.58, y: 0.55 }, main_avant: { x: 0.55, y: 0.68 }, genou_avant: { x: 0.35, y: 0.6 }, cheville_avant: { x: 0.15, y: 0.63 }, pied_avant: { x: 0.1, y: 0.65 } }),
    ],
  },
  abdos: {
    label: "Abdos (crunch)", category: "Musculation",
    poses: [
      withBackLimb({ tete: { x: 0.87, y: 0.75 }, cou: { x: 0.8, y: 0.75 }, epaule: { x: 0.72, y: 0.75 }, hanche: { x: 0.5, y: 0.75 }, coude_avant: { x: 0.75, y: 0.68 }, main_avant: { x: 0.82, y: 0.65 }, genou_avant: { x: 0.35, y: 0.65 }, cheville_avant: { x: 0.18, y: 0.72 }, pied_avant: { x: 0.15, y: 0.75 } }),
      withBackLimb({ tete: { x: 0.73, y: 0.45 }, cou: { x: 0.68, y: 0.5 }, epaule: { x: 0.62, y: 0.55 }, hanche: { x: 0.5, y: 0.75 }, coude_avant: { x: 0.58, y: 0.48 }, main_avant: { x: 0.65, y: 0.42 }, genou_avant: { x: 0.35, y: 0.65 }, cheville_avant: { x: 0.18, y: 0.72 }, pied_avant: { x: 0.15, y: 0.75 } }),
    ],
  },
  squat: {
    label: "Squat", category: "Musculation",
    poses: [
      withBackLimb({ tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.45, y: 0.35 }, main_avant: { x: 0.42, y: 0.45 }, genou_avant: { x: 0.52, y: 0.68 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 } }),
      withBackLimb({ tete: { x: 0.52, y: 0.38 }, cou: { x: 0.5, y: 0.45 }, epaule: { x: 0.48, y: 0.5 }, hanche: { x: 0.42, y: 0.75 }, coude_avant: { x: 0.6, y: 0.45 }, main_avant: { x: 0.68, y: 0.48 }, genou_avant: { x: 0.38, y: 0.72 }, cheville_avant: { x: 0.48, y: 0.88 }, pied_avant: { x: 0.5, y: 0.95 } }),
    ],
  },
  fente: {
    label: "Fente", category: "Musculation",
    poses: [
      withBackLimb({ tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.45, y: 0.35 }, main_avant: { x: 0.42, y: 0.45 }, genou_avant: { x: 0.52, y: 0.68 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 } }),
      { tete: { x: 0.47, y: 0.22 }, cou: { x: 0.46, y: 0.3 }, epaule: { x: 0.45, y: 0.35 }, hanche: { x: 0.45, y: 0.65 }, coude_avant: { x: 0.38, y: 0.42 }, main_avant: { x: 0.32, y: 0.5 }, coude_arriere: { x: 0.4, y: 0.38 }, main_arriere: { x: 0.34, y: 0.46 }, genou_avant: { x: 0.58, y: 0.68 }, cheville_avant: { x: 0.63, y: 0.88 }, pied_avant: { x: 0.65, y: 0.95 }, genou_arriere: { x: 0.3, y: 0.78 }, cheville_arriere: { x: 0.22, y: 0.92 }, pied_arriere: { x: 0.18, y: 0.95 } },
    ],
  },
  gainage: {
    label: "Gainage (planche)", category: "Musculation",
    poses: [
      withBackLimb({ tete: { x: 0.78, y: 0.36 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.4 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.62, y: 0.58 }, main_avant: { x: 0.58, y: 0.62 }, genou_avant: { x: 0.35, y: 0.55 }, cheville_avant: { x: 0.15, y: 0.62 }, pied_avant: { x: 0.1, y: 0.65 } }),
    ],
  },
  grimpeur: {
    label: "Grimpeur (mountain climber)", category: "Musculation",
    poses: [
      { tete: { x: 0.78, y: 0.36 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.4 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.62, y: 0.58 }, main_avant: { x: 0.58, y: 0.62 }, coude_arriere: { x: 0.64, y: 0.55 }, main_arriere: { x: 0.6, y: 0.59 }, genou_avant: { x: 0.48, y: 0.42 }, cheville_avant: { x: 0.42, y: 0.48 }, pied_avant: { x: 0.38, y: 0.5 }, genou_arriere: { x: 0.3, y: 0.58 }, cheville_arriere: { x: 0.15, y: 0.62 }, pied_arriere: { x: 0.1, y: 0.65 } },
      { tete: { x: 0.78, y: 0.36 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.4 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.62, y: 0.58 }, main_avant: { x: 0.58, y: 0.62 }, coude_arriere: { x: 0.64, y: 0.55 }, main_arriere: { x: 0.6, y: 0.59 }, genou_avant: { x: 0.3, y: 0.58 }, cheville_avant: { x: 0.15, y: 0.62 }, pied_avant: { x: 0.1, y: 0.65 }, genou_arriere: { x: 0.48, y: 0.42 }, cheville_arriere: { x: 0.42, y: 0.48 }, pied_arriere: { x: 0.38, y: 0.5 } },
    ],
  },
  etoile: {
    label: "Étoile (jumping jack)", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.1 }, cou: { x: 0.5, y: 0.16 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.52, y: 0.35 }, main_avant: { x: 0.54, y: 0.48 }, coude_arriere: { x: 0.48, y: 0.35 }, main_arriere: { x: 0.46, y: 0.48 }, genou_avant: { x: 0.51, y: 0.72 }, cheville_avant: { x: 0.51, y: 0.92 }, pied_avant: { x: 0.54, y: 0.96 }, genou_arriere: { x: 0.49, y: 0.72 }, cheville_arriere: { x: 0.49, y: 0.92 }, pied_arriere: { x: 0.46, y: 0.96 } },
      { tete: { x: 0.5, y: 0.1 }, cou: { x: 0.5, y: 0.16 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.74, y: 0.12 }, main_avant: { x: 0.92, y: 0.06 }, coude_arriere: { x: 0.26, y: 0.12 }, main_arriere: { x: 0.08, y: 0.06 }, genou_avant: { x: 0.63, y: 0.75 }, cheville_avant: { x: 0.7, y: 0.95 }, pied_avant: { x: 0.75, y: 0.98 }, genou_arriere: { x: 0.37, y: 0.75 }, cheville_arriere: { x: 0.3, y: 0.95 }, pied_arriere: { x: 0.25, y: 0.98 } },
    ],
  },
  pont_fessier: {
    label: "Pont fessier (glute bridge)", category: "Musculation",
    poses: [
      { tete: { x: 0.87, y: 0.75 }, cou: { x: 0.8, y: 0.75 }, epaule: { x: 0.72, y: 0.75 }, hanche: { x: 0.5, y: 0.78 }, coude_avant: { x: 0.78, y: 0.7 }, main_avant: { x: 0.82, y: 0.78 }, coude_arriere: { x: 0.76, y: 0.72 }, main_arriere: { x: 0.8, y: 0.8 }, genou_avant: { x: 0.35, y: 0.62 }, cheville_avant: { x: 0.2, y: 0.72 }, pied_avant: { x: 0.18, y: 0.75 }, genou_arriere: { x: 0.35, y: 0.58 }, cheville_arriere: { x: 0.2, y: 0.68 }, pied_arriere: { x: 0.18, y: 0.71 } },
      { tete: { x: 0.87, y: 0.72 }, cou: { x: 0.8, y: 0.72 }, epaule: { x: 0.72, y: 0.72 }, hanche: { x: 0.5, y: 0.62 }, coude_avant: { x: 0.78, y: 0.67 }, main_avant: { x: 0.82, y: 0.75 }, coude_arriere: { x: 0.76, y: 0.69 }, main_arriere: { x: 0.8, y: 0.77 }, genou_avant: { x: 0.35, y: 0.6 }, cheville_avant: { x: 0.2, y: 0.72 }, pied_avant: { x: 0.18, y: 0.75 }, genou_arriere: { x: 0.35, y: 0.56 }, cheville_arriere: { x: 0.2, y: 0.68 }, pied_arriere: { x: 0.18, y: 0.71 } },
    ],
  },
  traction: {
    label: "Traction (pull-up)", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.25 }, cou: { x: 0.5, y: 0.3 }, epaule: { x: 0.5, y: 0.35 }, hanche: { x: 0.5, y: 0.65 }, coude_avant: { x: 0.58, y: 0.2 }, main_avant: { x: 0.62, y: 0.05 }, coude_arriere: { x: 0.42, y: 0.2 }, main_arriere: { x: 0.38, y: 0.05 }, genou_avant: { x: 0.52, y: 0.82 }, cheville_avant: { x: 0.54, y: 0.95 }, pied_avant: { x: 0.56, y: 0.98 }, genou_arriere: { x: 0.48, y: 0.82 }, cheville_arriere: { x: 0.46, y: 0.95 }, pied_arriere: { x: 0.44, y: 0.98 } },
      { tete: { x: 0.5, y: 0.12 }, cou: { x: 0.5, y: 0.17 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.6, y: 0.15 }, main_avant: { x: 0.62, y: 0.05 }, coude_arriere: { x: 0.4, y: 0.15 }, main_arriere: { x: 0.38, y: 0.05 }, genou_avant: { x: 0.52, y: 0.72 }, cheville_avant: { x: 0.54, y: 0.88 }, pied_avant: { x: 0.56, y: 0.92 }, genou_arriere: { x: 0.48, y: 0.72 }, cheville_arriere: { x: 0.46, y: 0.88 }, pied_arriere: { x: 0.44, y: 0.92 } },
    ],
  },
  gainage_lateral: {
    label: "Gainage latéral (side plank)", category: "Musculation",
    poses: [
      { tete: { x: 0.85, y: 0.3 }, cou: { x: 0.78, y: 0.33 }, epaule: { x: 0.7, y: 0.38 }, hanche: { x: 0.45, y: 0.55 }, coude_avant: { x: 0.62, y: 0.55 }, main_avant: { x: 0.65, y: 0.68 }, coude_arriere: { x: 0.72, y: 0.25 }, main_arriere: { x: 0.8, y: 0.15 }, genou_avant: { x: 0.28, y: 0.65 }, cheville_avant: { x: 0.12, y: 0.7 }, pied_avant: { x: 0.08, y: 0.72 }, genou_arriere: { x: 0.3, y: 0.63 }, cheville_arriere: { x: 0.14, y: 0.68 }, pied_arriere: { x: 0.1, y: 0.7 } },
    ],
  },
  sortie_aerienne: {
    label: "Sortie aérienne (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.2 }, cou: { x: 0.5, y: 0.27 }, epaule: { x: 0.5, y: 0.32 }, hanche: { x: 0.48, y: 0.55 }, coude_avant: { x: 0.42, y: 0.42 }, main_avant: { x: 0.38, y: 0.52 }, coude_arriere: { x: 0.435, y: 0.395 }, main_arriere: { x: 0.395, y: 0.495 }, genou_avant: { x: 0.48, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.88 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.495, y: 0.675 }, cheville_arriere: { x: 0.515, y: 0.855 }, pied_arriere: { x: 0.515, y: 0.925 } },
      { tete: { x: 0.5, y: 0.12 }, cou: { x: 0.5, y: 0.17 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.5, y: 0.45 }, coude_avant: { x: 0.58, y: 0.08 }, main_avant: { x: 0.64, y: 0.02 }, coude_arriere: { x: 0.42, y: 0.08 }, main_arriere: { x: 0.36, y: 0.02 }, genou_avant: { x: 0.54, y: 0.65 }, cheville_avant: { x: 0.56, y: 0.85 }, pied_avant: { x: 0.58, y: 0.92 }, genou_arriere: { x: 0.46, y: 0.65 }, cheville_arriere: { x: 0.44, y: 0.85 }, pied_arriere: { x: 0.42, y: 0.92 } },
    ],
  },
  une_contre_un_gardien: {
    label: "Position une-contre-un (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.18 }, cou: { x: 0.5, y: 0.24 }, epaule: { x: 0.5, y: 0.3 }, hanche: { x: 0.48, y: 0.58 }, coude_avant: { x: 0.68, y: 0.42 }, main_avant: { x: 0.82, y: 0.45 }, coude_arriere: { x: 0.32, y: 0.44 }, main_arriere: { x: 0.2, y: 0.5 }, genou_avant: { x: 0.62, y: 0.78 }, cheville_avant: { x: 0.68, y: 0.93 }, pied_avant: { x: 0.72, y: 0.97 }, genou_arriere: { x: 0.36, y: 0.76 }, cheville_arriere: { x: 0.3, y: 0.92 }, pied_arriere: { x: 0.26, y: 0.96 } },
    ],
  },
  frappe_but: {
    label: "Frappe au but", category: "Football",
    poses: [
      { tete: { x: 0.52, y: 0.15 }, cou: { x: 0.51, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.45 }, coude_arriere: { x: 0.58, y: 0.35 }, main_arriere: { x: 0.65, y: 0.3 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.35, y: 0.68 }, cheville_arriere: { x: 0.22, y: 0.62 }, pied_arriere: { x: 0.15, y: 0.6 } },
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.45 }, coude_arriere: { x: 0.58, y: 0.4 }, main_arriere: { x: 0.62, y: 0.5 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.62, y: 0.62 }, cheville_arriere: { x: 0.78, y: 0.68 }, pied_arriere: { x: 0.85, y: 0.7 } },
    ],
  },
  tacle_glisse: {
    label: "Tacle glissé", category: "Football",
    poses: [
      { tete: { x: 0.7, y: 0.42 }, cou: { x: 0.64, y: 0.44 }, epaule: { x: 0.58, y: 0.46 }, hanche: { x: 0.4, y: 0.58 }, coude_avant: { x: 0.5, y: 0.55 }, main_avant: { x: 0.42, y: 0.62 }, coude_arriere: { x: 0.55, y: 0.4 }, main_arriere: { x: 0.62, y: 0.32 }, genou_avant: { x: 0.22, y: 0.62 }, cheville_avant: { x: 0.08, y: 0.58 }, pied_avant: { x: 0.02, y: 0.56 }, genou_arriere: { x: 0.32, y: 0.75 }, cheville_arriere: { x: 0.28, y: 0.9 }, pied_arriere: { x: 0.26, y: 0.96 } },
    ],
  },
  fente_laterale: {
    label: "Fente latérale", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.45, y: 0.35 }, main_avant: { x: 0.42, y: 0.45 }, coude_arriere: { x: 0.515, y: 0.325 }, main_arriere: { x: 0.435, y: 0.425 }, genou_avant: { x: 0.52, y: 0.68 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.535, y: 0.655 }, cheville_arriere: { x: 0.515, y: 0.875 }, pied_arriere: { x: 0.515, y: 0.925 } },
      { tete: { x: 0.45, y: 0.15 }, cou: { x: 0.46, y: 0.22 }, epaule: { x: 0.48, y: 0.28 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.35, y: 0.35 }, main_avant: { x: 0.25, y: 0.4 }, coude_arriere: { x: 0.4, y: 0.32 }, main_arriere: { x: 0.32, y: 0.38 }, genou_avant: { x: 0.3, y: 0.68 }, cheville_avant: { x: 0.15, y: 0.85 }, pied_avant: { x: 0.1, y: 0.92 }, genou_arriere: { x: 0.62, y: 0.55 }, cheville_arriere: { x: 0.78, y: 0.6 }, pied_arriere: { x: 0.85, y: 0.65 } },
    ],
  },
  rowing: {
    label: "Rowing (tirage buste penché)", category: "Musculation",
    poses: [
      { tete: { x: 0.75, y: 0.35 }, cou: { x: 0.68, y: 0.38 }, epaule: { x: 0.62, y: 0.42 }, hanche: { x: 0.42, y: 0.55 }, coude_avant: { x: 0.55, y: 0.58 }, main_avant: { x: 0.52, y: 0.72 }, coude_arriere: { x: 0.35, y: 0.48 }, main_arriere: { x: 0.3, y: 0.42 }, genou_avant: { x: 0.35, y: 0.72 }, cheville_avant: { x: 0.3, y: 0.9 }, pied_avant: { x: 0.32, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.72 }, cheville_arriere: { x: 0.5, y: 0.9 }, pied_arriere: { x: 0.52, y: 0.95 } },
      { tete: { x: 0.75, y: 0.35 }, cou: { x: 0.68, y: 0.38 }, epaule: { x: 0.62, y: 0.42 }, hanche: { x: 0.42, y: 0.55 }, coude_avant: { x: 0.58, y: 0.48 }, main_avant: { x: 0.5, y: 0.5 }, coude_arriere: { x: 0.35, y: 0.48 }, main_arriere: { x: 0.3, y: 0.42 }, genou_avant: { x: 0.35, y: 0.72 }, cheville_avant: { x: 0.3, y: 0.9 }, pied_avant: { x: 0.32, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.72 }, cheville_arriere: { x: 0.5, y: 0.9 }, pied_arriere: { x: 0.52, y: 0.95 } },
    ],
  },
  reception_basse: {
    label: "Réception basse (smother/plongeon au sol)", category: "Gardien",
    poses: [
      { tete: { x: 0.68, y: 0.5 }, cou: { x: 0.6, y: 0.48 }, epaule: { x: 0.52, y: 0.46 }, hanche: { x: 0.3, y: 0.55 }, coude_avant: { x: 0.7, y: 0.55 }, main_avant: { x: 0.85, y: 0.62 }, coude_arriere: { x: 0.48, y: 0.35 }, main_arriere: { x: 0.55, y: 0.22 }, genou_avant: { x: 0.2, y: 0.65 }, cheville_avant: { x: 0.1, y: 0.75 }, pied_avant: { x: 0.06, y: 0.8 }, genou_arriere: { x: 0.18, y: 0.6 }, cheville_arriere: { x: 0.08, y: 0.65 }, pied_arriere: { x: 0.03, y: 0.68 } },
    ],
  },
  renvoi_main: {
    label: "Renvoi à la main (throw)", category: "Gardien",
    poses: [
      { tete: { x: 0.55, y: 0.15 }, cou: { x: 0.53, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.48, y: 0.5 }, coude_avant: { x: 0.65, y: 0.15 }, main_avant: { x: 0.7, y: 0.05 }, coude_arriere: { x: 0.42, y: 0.32 }, main_arriere: { x: 0.35, y: 0.4 }, genou_avant: { x: 0.55, y: 0.7 }, cheville_avant: { x: 0.58, y: 0.9 }, pied_avant: { x: 0.6, y: 0.95 }, genou_arriere: { x: 0.4, y: 0.7 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.48, y: 0.5 }, coude_avant: { x: 0.6, y: 0.35 }, main_avant: { x: 0.72, y: 0.42 }, coude_arriere: { x: 0.42, y: 0.32 }, main_arriere: { x: 0.35, y: 0.4 }, genou_avant: { x: 0.58, y: 0.7 }, cheville_avant: { x: 0.62, y: 0.9 }, pied_avant: { x: 0.65, y: 0.95 }, genou_arriere: { x: 0.4, y: 0.7 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
    ],
  },
  tete_football: {
    label: "Tête (heading)", category: "Football",
    poses: [
      { tete: { x: 0.52, y: 0.12 }, cou: { x: 0.51, y: 0.18 }, epaule: { x: 0.5, y: 0.23 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.62, y: 0.35 }, main_avant: { x: 0.7, y: 0.42 }, coude_arriere: { x: 0.38, y: 0.35 }, main_arriere: { x: 0.3, y: 0.42 }, genou_avant: { x: 0.55, y: 0.68 }, cheville_avant: { x: 0.58, y: 0.88 }, pied_avant: { x: 0.6, y: 0.93 }, genou_arriere: { x: 0.45, y: 0.68 }, cheville_arriere: { x: 0.42, y: 0.88 }, pied_arriere: { x: 0.4, y: 0.93 } },
      { tete: { x: 0.62, y: 0.15 }, cou: { x: 0.56, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.45, y: 0.42 }, coude_avant: { x: 0.62, y: 0.35 }, main_avant: { x: 0.7, y: 0.42 }, coude_arriere: { x: 0.38, y: 0.35 }, main_arriere: { x: 0.3, y: 0.42 }, genou_avant: { x: 0.5, y: 0.62 }, cheville_avant: { x: 0.48, y: 0.85 }, pied_avant: { x: 0.46, y: 0.92 }, genou_arriere: { x: 0.4, y: 0.62 }, cheville_arriere: { x: 0.38, y: 0.85 }, pied_arriere: { x: 0.36, y: 0.92 } },
    ],
  },
  controle_oriente: {
    label: "Contrôle orienté (première touche)", category: "Football",
    poses: [
      { tete: { x: 0.52, y: 0.15 }, cou: { x: 0.51, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.45 }, coude_arriere: { x: 0.58, y: 0.38 }, main_arriere: { x: 0.65, y: 0.35 }, genou_avant: { x: 0.62, y: 0.65 }, cheville_avant: { x: 0.7, y: 0.75 }, pied_avant: { x: 0.75, y: 0.78 }, genou_arriere: { x: 0.4, y: 0.7 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
      { tete: { x: 0.45, y: 0.15 }, cou: { x: 0.46, y: 0.2 }, epaule: { x: 0.48, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.4, y: 0.35 }, main_avant: { x: 0.35, y: 0.45 }, coude_arriere: { x: 0.55, y: 0.4 }, main_arriere: { x: 0.6, y: 0.38 }, genou_avant: { x: 0.55, y: 0.68 }, cheville_avant: { x: 0.58, y: 0.88 }, pied_avant: { x: 0.6, y: 0.93 }, genou_arriere: { x: 0.42, y: 0.7 }, cheville_arriere: { x: 0.38, y: 0.9 }, pied_arriere: { x: 0.35, y: 0.95 } },
    ],
  },
  dips: {
    label: "Dips (triceps)", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.28 }, cou: { x: 0.5, y: 0.33 }, epaule: { x: 0.5, y: 0.38 }, hanche: { x: 0.5, y: 0.58 }, coude_avant: { x: 0.62, y: 0.42 }, main_avant: { x: 0.68, y: 0.55 }, coude_arriere: { x: 0.38, y: 0.42 }, main_arriere: { x: 0.32, y: 0.55 }, genou_avant: { x: 0.55, y: 0.75 }, cheville_avant: { x: 0.58, y: 0.92 }, pied_avant: { x: 0.6, y: 0.96 }, genou_arriere: { x: 0.45, y: 0.75 }, cheville_arriere: { x: 0.42, y: 0.92 }, pied_arriere: { x: 0.4, y: 0.96 } },
      { tete: { x: 0.5, y: 0.35 }, cou: { x: 0.5, y: 0.4 }, epaule: { x: 0.5, y: 0.45 }, hanche: { x: 0.5, y: 0.62 }, coude_avant: { x: 0.65, y: 0.5 }, main_avant: { x: 0.68, y: 0.55 }, coude_arriere: { x: 0.35, y: 0.5 }, main_arriere: { x: 0.32, y: 0.55 }, genou_avant: { x: 0.55, y: 0.78 }, cheville_avant: { x: 0.58, y: 0.93 }, pied_avant: { x: 0.6, y: 0.97 }, genou_arriere: { x: 0.45, y: 0.78 }, cheville_arriere: { x: 0.42, y: 0.93 }, pied_arriere: { x: 0.4, y: 0.97 } },
    ],
  },
  superman: {
    label: "Superman (extension dorsale)", category: "Musculation",
    poses: [
      { tete: { x: 0.85, y: 0.5 }, cou: { x: 0.78, y: 0.5 }, epaule: { x: 0.7, y: 0.5 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.9, y: 0.45 }, main_avant: { x: 0.98, y: 0.42 }, coude_arriere: { x: 0.88, y: 0.55 }, main_arriere: { x: 0.96, y: 0.58 }, genou_avant: { x: 0.3, y: 0.5 }, cheville_avant: { x: 0.12, y: 0.48 }, pied_avant: { x: 0.05, y: 0.47 }, genou_arriere: { x: 0.3, y: 0.52 }, cheville_arriere: { x: 0.12, y: 0.53 }, pied_arriere: { x: 0.05, y: 0.54 } },
      { tete: { x: 0.85, y: 0.4 }, cou: { x: 0.78, y: 0.42 }, epaule: { x: 0.7, y: 0.44 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.9, y: 0.32 }, main_avant: { x: 0.98, y: 0.25 }, coude_arriere: { x: 0.88, y: 0.4 }, main_arriere: { x: 0.96, y: 0.35 }, genou_avant: { x: 0.3, y: 0.44 }, cheville_avant: { x: 0.12, y: 0.38 }, pied_avant: { x: 0.05, y: 0.35 }, genou_arriere: { x: 0.3, y: 0.47 }, cheville_arriere: { x: 0.12, y: 0.42 }, pied_arriere: { x: 0.05, y: 0.4 } },
    ],
  },
  degagement_pied: {
    label: "Dégagement au pied (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.52, y: 0.15 }, cou: { x: 0.51, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.4, y: 0.4 }, main_avant: { x: 0.35, y: 0.5 }, coude_arriere: { x: 0.6, y: 0.4 }, main_arriere: { x: 0.65, y: 0.5 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.35, y: 0.68 }, cheville_arriere: { x: 0.22, y: 0.62 }, pied_arriere: { x: 0.15, y: 0.6 } },
      { tete: { x: 0.52, y: 0.18 }, cou: { x: 0.51, y: 0.23 }, epaule: { x: 0.5, y: 0.28 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.42, y: 0.42 }, main_avant: { x: 0.38, y: 0.52 }, coude_arriere: { x: 0.58, y: 0.42 }, main_arriere: { x: 0.62, y: 0.52 }, genou_avant: { x: 0.5, y: 0.72 }, cheville_avant: { x: 0.5, y: 0.92 }, pied_avant: { x: 0.5, y: 0.97 }, genou_arriere: { x: 0.68, y: 0.5 }, cheville_arriere: { x: 0.85, y: 0.42 }, pied_arriere: { x: 0.95, y: 0.38 } },
    ],
  },
  repli_defensif: {
    label: "Repli défensif (déplacement latéral)", category: "Gardien",
    poses: [
      { tete: { x: 0.55, y: 0.18 }, cou: { x: 0.54, y: 0.24 }, epaule: { x: 0.52, y: 0.3 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.62, y: 0.42 }, main_avant: { x: 0.7, y: 0.48 }, coude_arriere: { x: 0.42, y: 0.42 }, main_arriere: { x: 0.35, y: 0.48 }, genou_avant: { x: 0.62, y: 0.75 }, cheville_avant: { x: 0.68, y: 0.92 }, pied_avant: { x: 0.72, y: 0.96 }, genou_arriere: { x: 0.4, y: 0.72 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
      { tete: { x: 0.45, y: 0.18 }, cou: { x: 0.46, y: 0.24 }, epaule: { x: 0.48, y: 0.3 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.38, y: 0.42 }, main_avant: { x: 0.3, y: 0.48 }, coude_arriere: { x: 0.58, y: 0.42 }, main_arriere: { x: 0.65, y: 0.48 }, genou_avant: { x: 0.38, y: 0.75 }, cheville_avant: { x: 0.32, y: 0.92 }, pied_avant: { x: 0.28, y: 0.96 }, genou_arriere: { x: 0.6, y: 0.72 }, cheville_arriere: { x: 0.65, y: 0.9 }, pied_arriere: { x: 0.68, y: 0.95 } },
    ],
  },
  passe: {
    label: "Passe", category: "Football",
    poses: [
      { tete: { x: 0.51, y: 0.15 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.44, y: 0.38 }, main_avant: { x: 0.4, y: 0.48 }, coude_arriere: { x: 0.56, y: 0.38 }, main_arriere: { x: 0.6, y: 0.48 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.4, y: 0.66 }, cheville_arriere: { x: 0.32, y: 0.62 }, pied_arriere: { x: 0.27, y: 0.6 } },
      { tete: { x: 0.5, y: 0.16 }, cou: { x: 0.5, y: 0.21 }, epaule: { x: 0.5, y: 0.26 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.44, y: 0.4 }, main_avant: { x: 0.4, y: 0.5 }, coude_arriere: { x: 0.56, y: 0.4 }, main_arriere: { x: 0.6, y: 0.5 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.58, y: 0.62 }, cheville_arriere: { x: 0.7, y: 0.58 }, pied_arriere: { x: 0.78, y: 0.56 } },
    ],
  },
  volee: {
    label: "Volée", category: "Football",
    poses: [
      { tete: { x: 0.55, y: 0.2 }, cou: { x: 0.54, y: 0.25 }, epaule: { x: 0.52, y: 0.3 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.62, y: 0.42 }, main_avant: { x: 0.68, y: 0.35 }, coude_arriere: { x: 0.4, y: 0.4 }, main_arriere: { x: 0.35, y: 0.3 }, genou_avant: { x: 0.5, y: 0.6 }, cheville_avant: { x: 0.5, y: 0.78 }, pied_avant: { x: 0.5, y: 0.85 }, genou_arriere: { x: 0.35, y: 0.68 }, cheville_arriere: { x: 0.25, y: 0.65 }, pied_arriere: { x: 0.18, y: 0.62 } },
      { tete: { x: 0.5, y: 0.22 }, cou: { x: 0.5, y: 0.27 }, epaule: { x: 0.5, y: 0.32 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.6, y: 0.42 }, main_avant: { x: 0.65, y: 0.35 }, coude_arriere: { x: 0.4, y: 0.42 }, main_arriere: { x: 0.35, y: 0.35 }, genou_avant: { x: 0.5, y: 0.62 }, cheville_avant: { x: 0.5, y: 0.8 }, pied_avant: { x: 0.5, y: 0.85 }, genou_arriere: { x: 0.55, y: 0.42 }, cheville_arriere: { x: 0.68, y: 0.3 }, pied_arriere: { x: 0.78, y: 0.22 } },
    ],
  },
  squat_saute: {
    label: "Squat sauté", category: "Musculation",
    poses: [
      { tete: { x: 0.52, y: 0.38 }, cou: { x: 0.5, y: 0.45 }, epaule: { x: 0.48, y: 0.5 }, hanche: { x: 0.42, y: 0.75 }, coude_avant: { x: 0.6, y: 0.45 }, main_avant: { x: 0.68, y: 0.48 }, coude_arriere: { x: 0.615, y: 0.425 }, main_arriere: { x: 0.695, y: 0.455 }, genou_avant: { x: 0.38, y: 0.72 }, cheville_avant: { x: 0.48, y: 0.88 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.395, y: 0.695 }, cheville_arriere: { x: 0.495, y: 0.855 }, pied_arriere: { x: 0.515, y: 0.925 } },
      { tete: { x: 0.5, y: 0.1 }, cou: { x: 0.5, y: 0.17 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.5, y: 0.45 }, coude_avant: { x: 0.42, y: 0.28 }, main_avant: { x: 0.36, y: 0.35 }, coude_arriere: { x: 0.435, y: 0.255 }, main_arriere: { x: 0.375, y: 0.325 }, genou_avant: { x: 0.53, y: 0.65 }, cheville_avant: { x: 0.56, y: 0.8 }, pied_avant: { x: 0.58, y: 0.85 }, genou_arriere: { x: 0.545, y: 0.625 }, cheville_arriere: { x: 0.575, y: 0.775 }, pied_arriere: { x: 0.595, y: 0.825 } },
    ],
  },
  developpe_militaire: {
    label: "Développé militaire", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.58, y: 0.3 }, main_avant: { x: 0.6, y: 0.22 }, coude_arriere: { x: 0.42, y: 0.3 }, main_arriere: { x: 0.4, y: 0.22 }, genou_avant: { x: 0.52, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.7 }, cheville_arriere: { x: 0.5, y: 0.9 }, pied_arriere: { x: 0.5, y: 0.95 } },
      { tete: { x: 0.5, y: 0.16 }, cou: { x: 0.5, y: 0.22 }, epaule: { x: 0.5, y: 0.27 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.58, y: 0.1 }, main_avant: { x: 0.6, y: 0.02 }, coude_arriere: { x: 0.42, y: 0.1 }, main_arriere: { x: 0.4, y: 0.02 }, genou_avant: { x: 0.52, y: 0.72 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.72 }, cheville_arriere: { x: 0.5, y: 0.9 }, pied_arriere: { x: 0.5, y: 0.95 } },
    ],
  },
  parade_haute: {
    label: "Parade haute (dévier au-dessus de la barre)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.12 }, cou: { x: 0.5, y: 0.18 }, epaule: { x: 0.5, y: 0.23 }, hanche: { x: 0.5, y: 0.46 }, coude_avant: { x: 0.6, y: 0.1 }, main_avant: { x: 0.68, y: 0.02 }, coude_arriere: { x: 0.4, y: 0.1 }, main_arriere: { x: 0.32, y: 0.02 }, genou_avant: { x: 0.53, y: 0.65 }, cheville_avant: { x: 0.55, y: 0.85 }, pied_avant: { x: 0.57, y: 0.92 }, genou_arriere: { x: 0.47, y: 0.65 }, cheville_arriere: { x: 0.45, y: 0.85 }, pied_arriere: { x: 0.43, y: 0.92 } },
      { tete: { x: 0.55, y: 0.1 }, cou: { x: 0.53, y: 0.16 }, epaule: { x: 0.5, y: 0.21 }, hanche: { x: 0.42, y: 0.44 }, coude_avant: { x: 0.66, y: 0.08 }, main_avant: { x: 0.76, y: 0.0 }, coude_arriere: { x: 0.36, y: 0.1 }, main_arriere: { x: 0.28, y: 0.04 }, genou_avant: { x: 0.48, y: 0.62 }, cheville_avant: { x: 0.46, y: 0.82 }, pied_avant: { x: 0.45, y: 0.9 }, genou_arriere: { x: 0.4, y: 0.62 }, cheville_arriere: { x: 0.38, y: 0.82 }, pied_arriere: { x: 0.36, y: 0.9 } },
    ],
  },
  remise_pied: {
    label: "Remise sur pied (après plongeon)", category: "Gardien",
    poses: [
      { tete: { x: 0.75, y: 0.6 }, cou: { x: 0.68, y: 0.58 }, epaule: { x: 0.6, y: 0.56 }, hanche: { x: 0.4, y: 0.62 }, coude_avant: { x: 0.7, y: 0.68 }, main_avant: { x: 0.78, y: 0.75 }, coude_arriere: { x: 0.55, y: 0.5 }, main_arriere: { x: 0.5, y: 0.42 }, genou_avant: { x: 0.25, y: 0.68 }, cheville_avant: { x: 0.15, y: 0.72 }, pied_avant: { x: 0.1, y: 0.74 }, genou_arriere: { x: 0.28, y: 0.72 }, cheville_arriere: { x: 0.2, y: 0.8 }, pied_arriere: { x: 0.16, y: 0.85 } },
      { tete: { x: 0.6, y: 0.35 }, cou: { x: 0.56, y: 0.4 }, epaule: { x: 0.52, y: 0.45 }, hanche: { x: 0.45, y: 0.62 }, coude_avant: { x: 0.62, y: 0.55 }, main_avant: { x: 0.68, y: 0.68 }, coude_arriere: { x: 0.45, y: 0.4 }, main_arriere: { x: 0.4, y: 0.32 }, genou_avant: { x: 0.35, y: 0.72 }, cheville_avant: { x: 0.3, y: 0.88 }, pied_avant: { x: 0.28, y: 0.93 }, genou_arriere: { x: 0.42, y: 0.75 }, cheville_arriere: { x: 0.42, y: 0.92 }, pied_arriere: { x: 0.42, y: 0.97 } },
    ],
  },
  dribble_crochet: {
    label: "Dribble / crochet", category: "Football",
    poses: [
      { tete: { x: 0.58, y: 0.15 }, cou: { x: 0.56, y: 0.2 }, epaule: { x: 0.54, y: 0.25 }, hanche: { x: 0.52, y: 0.5 }, coude_avant: { x: 0.65, y: 0.4 }, main_avant: { x: 0.72, y: 0.45 }, coude_arriere: { x: 0.4, y: 0.4 }, main_arriere: { x: 0.32, y: 0.35 }, genou_avant: { x: 0.62, y: 0.68 }, cheville_avant: { x: 0.7, y: 0.85 }, pied_avant: { x: 0.75, y: 0.9 }, genou_arriere: { x: 0.42, y: 0.72 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
      { tete: { x: 0.42, y: 0.15 }, cou: { x: 0.44, y: 0.2 }, epaule: { x: 0.46, y: 0.25 }, hanche: { x: 0.48, y: 0.5 }, coude_avant: { x: 0.35, y: 0.4 }, main_avant: { x: 0.28, y: 0.45 }, coude_arriere: { x: 0.6, y: 0.4 }, main_arriere: { x: 0.68, y: 0.35 }, genou_avant: { x: 0.38, y: 0.68 }, cheville_avant: { x: 0.3, y: 0.85 }, pied_avant: { x: 0.25, y: 0.9 }, genou_arriere: { x: 0.58, y: 0.72 }, cheville_arriere: { x: 0.65, y: 0.9 }, pied_arriere: { x: 0.68, y: 0.95 } },
    ],
  },
  sprint: {
    label: "Sprint (foulée de course)", category: "Football",
    poses: [
      { tete: { x: 0.55, y: 0.15 }, cou: { x: 0.53, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.48, y: 0.48 }, coude_avant: { x: 0.4, y: 0.35 }, main_avant: { x: 0.32, y: 0.3 }, coude_arriere: { x: 0.58, y: 0.4 }, main_arriere: { x: 0.65, y: 0.48 }, genou_avant: { x: 0.6, y: 0.55 }, cheville_avant: { x: 0.68, y: 0.42 }, pied_avant: { x: 0.72, y: 0.38 }, genou_arriere: { x: 0.42, y: 0.68 }, cheville_arriere: { x: 0.4, y: 0.9 }, pied_arriere: { x: 0.42, y: 0.96 } },
      { tete: { x: 0.5, y: 0.12 }, cou: { x: 0.5, y: 0.17 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.48, y: 0.42 }, coude_avant: { x: 0.42, y: 0.3 }, main_avant: { x: 0.35, y: 0.22 }, coude_arriere: { x: 0.56, y: 0.35 }, main_arriere: { x: 0.62, y: 0.42 }, genou_avant: { x: 0.62, y: 0.42 }, cheville_avant: { x: 0.72, y: 0.35 }, pied_avant: { x: 0.78, y: 0.32 }, genou_arriere: { x: 0.35, y: 0.6 }, cheville_arriere: { x: 0.25, y: 0.75 }, pied_arriere: { x: 0.2, y: 0.82 } },
    ],
  },
  developpe_couche: {
    label: "Développé couché", category: "Musculation",
    poses: [
      { tete: { x: 0.85, y: 0.65 }, cou: { x: 0.78, y: 0.65 }, epaule: { x: 0.7, y: 0.65 }, hanche: { x: 0.42, y: 0.68 }, coude_avant: { x: 0.75, y: 0.5 }, main_avant: { x: 0.78, y: 0.42 }, coude_arriere: { x: 0.73, y: 0.55 }, main_arriere: { x: 0.76, y: 0.47 }, genou_avant: { x: 0.28, y: 0.6 }, cheville_avant: { x: 0.15, y: 0.7 }, pied_avant: { x: 0.1, y: 0.75 }, genou_arriere: { x: 0.28, y: 0.65 }, cheville_arriere: { x: 0.15, y: 0.75 }, pied_arriere: { x: 0.1, y: 0.8 } },
      { tete: { x: 0.85, y: 0.65 }, cou: { x: 0.78, y: 0.65 }, epaule: { x: 0.7, y: 0.65 }, hanche: { x: 0.42, y: 0.68 }, coude_avant: { x: 0.78, y: 0.42 }, main_avant: { x: 0.82, y: 0.25 }, coude_arriere: { x: 0.76, y: 0.44 }, main_arriere: { x: 0.8, y: 0.28 }, genou_avant: { x: 0.28, y: 0.6 }, cheville_avant: { x: 0.15, y: 0.7 }, pied_avant: { x: 0.1, y: 0.75 }, genou_arriere: { x: 0.28, y: 0.65 }, cheville_arriere: { x: 0.15, y: 0.75 }, pied_arriere: { x: 0.1, y: 0.8 } },
    ],
  },
  squat_bulgare: {
    label: "Squat bulgare", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.22 }, epaule: { x: 0.5, y: 0.27 }, hanche: { x: 0.48, y: 0.52 }, coude_avant: { x: 0.42, y: 0.38 }, main_avant: { x: 0.38, y: 0.48 }, coude_arriere: { x: 0.55, y: 0.4 }, main_arriere: { x: 0.6, y: 0.48 }, genou_avant: { x: 0.5, y: 0.72 }, cheville_avant: { x: 0.5, y: 0.92 }, pied_avant: { x: 0.5, y: 0.97 }, genou_arriere: { x: 0.32, y: 0.58 }, cheville_arriere: { x: 0.22, y: 0.5 }, pied_arriere: { x: 0.15, y: 0.48 } },
      { tete: { x: 0.52, y: 0.28 }, cou: { x: 0.51, y: 0.34 }, epaule: { x: 0.5, y: 0.4 }, hanche: { x: 0.48, y: 0.62 }, coude_avant: { x: 0.4, y: 0.48 }, main_avant: { x: 0.35, y: 0.58 }, coude_arriere: { x: 0.55, y: 0.5 }, main_arriere: { x: 0.6, y: 0.58 }, genou_avant: { x: 0.48, y: 0.78 }, cheville_avant: { x: 0.5, y: 0.95 }, pied_avant: { x: 0.5, y: 0.98 }, genou_arriere: { x: 0.3, y: 0.68 }, cheville_arriere: { x: 0.22, y: 0.5 }, pied_arriere: { x: 0.15, y: 0.48 } },
    ],
  },
  souleve_terre: {
    label: "Soulevé de terre", category: "Musculation",
    poses: [
      { tete: { x: 0.72, y: 0.55 }, cou: { x: 0.66, y: 0.5 }, epaule: { x: 0.6, y: 0.45 }, hanche: { x: 0.42, y: 0.5 }, coude_avant: { x: 0.58, y: 0.62 }, main_avant: { x: 0.55, y: 0.78 }, coude_arriere: { x: 0.595, y: 0.595 }, main_arriere: { x: 0.565, y: 0.755 }, genou_avant: { x: 0.32, y: 0.68 }, cheville_avant: { x: 0.28, y: 0.88 }, pied_avant: { x: 0.3, y: 0.95 }, genou_arriere: { x: 0.335, y: 0.655 }, cheville_arriere: { x: 0.295, y: 0.855 }, pied_arriere: { x: 0.315, y: 0.925 } },
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.22 }, epaule: { x: 0.5, y: 0.28 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.52, y: 0.45 }, main_avant: { x: 0.53, y: 0.62 }, coude_arriere: { x: 0.535, y: 0.425 }, main_arriere: { x: 0.545, y: 0.595 }, genou_avant: { x: 0.5, y: 0.72 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.515, y: 0.695 }, cheville_arriere: { x: 0.515, y: 0.875 }, pied_arriere: { x: 0.515, y: 0.925 } },
    ],
  },
  gainage_rotation: {
    label: "Gainage avec rotation", category: "Musculation",
    poses: [
      { tete: { x: 0.78, y: 0.36 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.4 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.62, y: 0.58 }, main_avant: { x: 0.58, y: 0.62 }, coude_arriere: { x: 0.6, y: 0.35 }, main_arriere: { x: 0.65, y: 0.15 }, genou_avant: { x: 0.35, y: 0.55 }, cheville_avant: { x: 0.15, y: 0.62 }, pied_avant: { x: 0.1, y: 0.65 }, genou_arriere: { x: 0.365, y: 0.525 }, cheville_arriere: { x: 0.165, y: 0.595 }, pied_arriere: { x: 0.115, y: 0.625 } },
      { tete: { x: 0.75, y: 0.3 }, cou: { x: 0.7, y: 0.32 }, epaule: { x: 0.66, y: 0.35 }, hanche: { x: 0.48, y: 0.42 }, coude_avant: { x: 0.6, y: 0.55 }, main_avant: { x: 0.56, y: 0.6 }, coude_arriere: { x: 0.62, y: 0.2 }, main_arriere: { x: 0.7, y: 0.05 }, genou_avant: { x: 0.33, y: 0.5 }, cheville_avant: { x: 0.13, y: 0.58 }, pied_avant: { x: 0.08, y: 0.6 }, genou_arriere: { x: 0.35, y: 0.47 }, cheville_arriere: { x: 0.15, y: 0.55 }, pied_arriere: { x: 0.1, y: 0.57 } },
    ],
  },
  position_base_gardien: {
    label: "Position de base (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.21 }, epaule: { x: 0.5, y: 0.26 }, hanche: { x: 0.5, y: 0.52 }, coude_avant: { x: 0.58, y: 0.38 }, main_avant: { x: 0.62, y: 0.48 }, coude_arriere: { x: 0.42, y: 0.38 }, main_arriere: { x: 0.38, y: 0.48 }, genou_avant: { x: 0.52, y: 0.72 }, cheville_avant: { x: 0.53, y: 0.9 }, pied_avant: { x: 0.54, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.72 }, cheville_arriere: { x: 0.47, y: 0.9 }, pied_arriere: { x: 0.46, y: 0.95 } },
    ],
  },
  rattrapage_rebond: {
    label: "Rattrapage de rebond", category: "Gardien",
    poses: [
      { tete: { x: 0.65, y: 0.48 }, cou: { x: 0.58, y: 0.46 }, epaule: { x: 0.5, y: 0.44 }, hanche: { x: 0.28, y: 0.5 }, coude_avant: { x: 0.65, y: 0.52 }, main_avant: { x: 0.78, y: 0.58 }, coude_arriere: { x: 0.45, y: 0.35 }, main_arriere: { x: 0.5, y: 0.22 }, genou_avant: { x: 0.18, y: 0.58 }, cheville_avant: { x: 0.08, y: 0.62 }, pied_avant: { x: 0.03, y: 0.64 }, genou_arriere: { x: 0.2, y: 0.55 }, cheville_arriere: { x: 0.1, y: 0.58 }, pied_arriere: { x: 0.05, y: 0.6 } },
      { tete: { x: 0.8, y: 0.55 }, cou: { x: 0.72, y: 0.52 }, epaule: { x: 0.62, y: 0.5 }, hanche: { x: 0.35, y: 0.58 }, coude_avant: { x: 0.78, y: 0.6 }, main_avant: { x: 0.92, y: 0.65 }, coude_arriere: { x: 0.55, y: 0.42 }, main_arriere: { x: 0.62, y: 0.3 }, genou_avant: { x: 0.22, y: 0.65 }, cheville_avant: { x: 0.1, y: 0.7 }, pied_avant: { x: 0.04, y: 0.72 }, genou_arriere: { x: 0.25, y: 0.62 }, cheville_arriere: { x: 0.12, y: 0.66 }, pied_arriere: { x: 0.06, y: 0.68 } },
    ],
  },
  talonnade: {
    label: "Talonnade", category: "Football",
    poses: [
      { tete: { x: 0.52, y: 0.15 }, cou: { x: 0.51, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.45 }, coude_arriere: { x: 0.58, y: 0.38 }, main_arriere: { x: 0.62, y: 0.42 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.45, y: 0.68 }, cheville_arriere: { x: 0.42, y: 0.85 }, pied_arriere: { x: 0.4, y: 0.88 } },
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.45 }, coude_arriere: { x: 0.58, y: 0.4 }, main_arriere: { x: 0.65, y: 0.45 }, genou_avant: { x: 0.5, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.42, y: 0.6 }, cheville_arriere: { x: 0.3, y: 0.55 }, pied_arriere: { x: 0.22, y: 0.58 } },
    ],
  },
  remise_en_jeu: {
    label: "Remise en jeu (touche)", category: "Football",
    poses: [
      { tete: { x: 0.55, y: 0.18 }, cou: { x: 0.52, y: 0.24 }, epaule: { x: 0.5, y: 0.3 }, hanche: { x: 0.45, y: 0.5 }, coude_avant: { x: 0.62, y: 0.15 }, main_avant: { x: 0.58, y: 0.05 }, coude_arriere: { x: 0.38, y: 0.15 }, main_arriere: { x: 0.42, y: 0.05 }, genou_avant: { x: 0.55, y: 0.7 }, cheville_avant: { x: 0.58, y: 0.9 }, pied_avant: { x: 0.6, y: 0.95 }, genou_arriere: { x: 0.4, y: 0.7 }, cheville_arriere: { x: 0.35, y: 0.9 }, pied_arriere: { x: 0.32, y: 0.95 } },
      { tete: { x: 0.48, y: 0.15 }, cou: { x: 0.49, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.58, y: 0.28 }, main_avant: { x: 0.65, y: 0.15 }, coude_arriere: { x: 0.42, y: 0.28 }, main_arriere: { x: 0.35, y: 0.15 }, genou_avant: { x: 0.55, y: 0.68 }, cheville_avant: { x: 0.58, y: 0.88 }, pied_avant: { x: 0.6, y: 0.93 }, genou_arriere: { x: 0.45, y: 0.68 }, cheville_arriere: { x: 0.42, y: 0.88 }, pied_arriere: { x: 0.4, y: 0.93 } },
    ],
  },
  fente_arriere: {
    label: "Fente arrière", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.45, y: 0.35 }, main_avant: { x: 0.42, y: 0.45 }, coude_arriere: { x: 0.515, y: 0.325 }, main_arriere: { x: 0.435, y: 0.425 }, genou_avant: { x: 0.52, y: 0.68 }, cheville_avant: { x: 0.5, y: 0.9 }, pied_avant: { x: 0.5, y: 0.95 }, genou_arriere: { x: 0.535, y: 0.655 }, cheville_arriere: { x: 0.515, y: 0.875 }, pied_arriere: { x: 0.515, y: 0.925 } },
      { tete: { x: 0.55, y: 0.2 }, cou: { x: 0.53, y: 0.27 }, epaule: { x: 0.52, y: 0.33 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.42, y: 0.42 }, main_avant: { x: 0.35, y: 0.48 }, coude_arriere: { x: 0.42, y: 0.38 }, main_arriere: { x: 0.35, y: 0.44 }, genou_avant: { x: 0.55, y: 0.72 }, cheville_avant: { x: 0.55, y: 0.92 }, pied_avant: { x: 0.55, y: 0.97 }, genou_arriere: { x: 0.4, y: 0.85 }, cheville_arriere: { x: 0.28, y: 0.95 }, pied_arriere: { x: 0.2, y: 0.97 } },
    ],
  },
  montees_genoux: {
    label: "Montées de genoux", category: "Musculation",
    poses: [
      { tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.42, y: 0.35 }, main_avant: { x: 0.38, y: 0.42 }, coude_arriere: { x: 0.58, y: 0.4 }, main_arriere: { x: 0.62, y: 0.5 }, genou_avant: { x: 0.55, y: 0.35 }, cheville_avant: { x: 0.52, y: 0.5 }, pied_avant: { x: 0.5, y: 0.55 }, genou_arriere: { x: 0.45, y: 0.68 }, cheville_arriere: { x: 0.4, y: 0.9 }, pied_arriere: { x: 0.38, y: 0.96 } },
      { tete: { x: 0.5, y: 0.13 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.5, y: 0.48 }, coude_avant: { x: 0.58, y: 0.4 }, main_avant: { x: 0.62, y: 0.5 }, coude_arriere: { x: 0.42, y: 0.35 }, main_arriere: { x: 0.38, y: 0.42 }, genou_avant: { x: 0.45, y: 0.68 }, cheville_avant: { x: 0.4, y: 0.9 }, pied_avant: { x: 0.38, y: 0.96 }, genou_arriere: { x: 0.55, y: 0.35 }, cheville_arriere: { x: 0.52, y: 0.5 }, pied_arriere: { x: 0.5, y: 0.55 } },
    ],
  },
  renvoi_poing: {
    label: "Renvoi du poing (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.48, y: 0.48 }, coude_avant: { x: 0.58, y: 0.28 }, main_avant: { x: 0.55, y: 0.15 }, coude_arriere: { x: 0.42, y: 0.35 }, main_arriere: { x: 0.38, y: 0.45 }, genou_avant: { x: 0.53, y: 0.68 }, cheville_avant: { x: 0.55, y: 0.88 }, pied_avant: { x: 0.57, y: 0.94 }, genou_arriere: { x: 0.45, y: 0.68 }, cheville_arriere: { x: 0.43, y: 0.88 }, pied_arriere: { x: 0.41, y: 0.94 } },
      { tete: { x: 0.5, y: 0.12 }, cou: { x: 0.5, y: 0.17 }, epaule: { x: 0.5, y: 0.22 }, hanche: { x: 0.48, y: 0.45 }, coude_avant: { x: 0.6, y: 0.12 }, main_avant: { x: 0.65, y: 0.02 }, coude_arriere: { x: 0.42, y: 0.32 }, main_arriere: { x: 0.38, y: 0.42 }, genou_avant: { x: 0.53, y: 0.65 }, cheville_avant: { x: 0.55, y: 0.85 }, pied_avant: { x: 0.57, y: 0.92 }, genou_arriere: { x: 0.45, y: 0.65 }, cheville_arriere: { x: 0.43, y: 0.85 }, pied_arriere: { x: 0.41, y: 0.92 } },
    ],
  },
  communication_defensive: {
    label: "Communication défensive (gardien)", category: "Gardien",
    poses: [
      { tete: { x: 0.5, y: 0.15 }, cou: { x: 0.5, y: 0.21 }, epaule: { x: 0.5, y: 0.26 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.68, y: 0.28 }, main_avant: { x: 0.85, y: 0.22 }, coude_arriere: { x: 0.42, y: 0.38 }, main_arriere: { x: 0.38, y: 0.48 }, genou_avant: { x: 0.52, y: 0.7 }, cheville_avant: { x: 0.53, y: 0.9 }, pied_avant: { x: 0.54, y: 0.95 }, genou_arriere: { x: 0.48, y: 0.7 }, cheville_arriere: { x: 0.47, y: 0.9 }, pied_arriere: { x: 0.46, y: 0.95 } },
    ],
  },
  conduite_balle: {
    label: "Conduite de balle", category: "Football",
    poses: [
      { tete: { x: 0.53, y: 0.15 }, cou: { x: 0.52, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.49, y: 0.48 }, coude_avant: { x: 0.42, y: 0.38 }, main_avant: { x: 0.36, y: 0.35 }, coude_arriere: { x: 0.56, y: 0.4 }, main_arriere: { x: 0.6, y: 0.46 }, genou_avant: { x: 0.56, y: 0.62 }, cheville_avant: { x: 0.6, y: 0.52 }, pied_avant: { x: 0.64, y: 0.5 }, genou_arriere: { x: 0.44, y: 0.68 }, cheville_arriere: { x: 0.42, y: 0.88 }, pied_arriere: { x: 0.42, y: 0.94 } },
      { tete: { x: 0.53, y: 0.15 }, cou: { x: 0.52, y: 0.2 }, epaule: { x: 0.5, y: 0.25 }, hanche: { x: 0.49, y: 0.48 }, coude_avant: { x: 0.56, y: 0.4 }, main_avant: { x: 0.6, y: 0.46 }, coude_arriere: { x: 0.42, y: 0.38 }, main_arriere: { x: 0.36, y: 0.35 }, genou_avant: { x: 0.44, y: 0.68 }, cheville_avant: { x: 0.42, y: 0.88 }, pied_avant: { x: 0.42, y: 0.94 }, genou_arriere: { x: 0.56, y: 0.62 }, cheville_arriere: { x: 0.6, y: 0.52 }, pied_arriere: { x: 0.64, y: 0.5 } },
    ],
  },
  marquage_individuel: {
    label: "Marquage individuel", category: "Football",
    poses: [
      { tete: { x: 0.42, y: 0.18 }, cou: { x: 0.44, y: 0.24 }, epaule: { x: 0.46, y: 0.3 }, hanche: { x: 0.5, y: 0.55 }, coude_avant: { x: 0.35, y: 0.42 }, main_avant: { x: 0.28, y: 0.48 }, coude_arriere: { x: 0.6, y: 0.42 }, main_arriere: { x: 0.68, y: 0.4 }, genou_avant: { x: 0.42, y: 0.75 }, cheville_avant: { x: 0.38, y: 0.93 }, pied_avant: { x: 0.35, y: 0.97 }, genou_arriere: { x: 0.58, y: 0.72 }, cheville_arriere: { x: 0.62, y: 0.9 }, pied_arriere: { x: 0.65, y: 0.95 } },
    ],
  },
  plongeon_gardien: {
    label: "Plongeon gardien", category: "Gardien",
    poses: [
      withBackLimb({ tete: { x: 0.5, y: 0.2 }, cou: { x: 0.5, y: 0.27 }, epaule: { x: 0.5, y: 0.32 }, hanche: { x: 0.48, y: 0.55 }, coude_avant: { x: 0.42, y: 0.42 }, main_avant: { x: 0.38, y: 0.52 }, genou_avant: { x: 0.48, y: 0.7 }, cheville_avant: { x: 0.5, y: 0.88 }, pied_avant: { x: 0.5, y: 0.95 } }),
      { tete: { x: 0.68, y: 0.25 }, cou: { x: 0.63, y: 0.3 }, epaule: { x: 0.6, y: 0.35 }, hanche: { x: 0.52, y: 0.52 }, coude_avant: { x: 0.68, y: 0.4 }, main_avant: { x: 0.75, y: 0.35 }, coude_arriere: { x: 0.55, y: 0.45 }, main_arriere: { x: 0.48, y: 0.55 }, genou_avant: { x: 0.45, y: 0.68 }, cheville_avant: { x: 0.4, y: 0.85 }, pied_avant: { x: 0.42, y: 0.92 }, genou_arriere: { x: 0.58, y: 0.62 }, cheville_arriere: { x: 0.62, y: 0.78 }, pied_arriere: { x: 0.65, y: 0.85 } },
      { tete: { x: 0.75, y: 0.32 }, cou: { x: 0.72, y: 0.38 }, epaule: { x: 0.68, y: 0.42 }, hanche: { x: 0.5, y: 0.5 }, coude_avant: { x: 0.82, y: 0.3 }, main_avant: { x: 0.92, y: 0.25 }, coude_arriere: { x: 0.78, y: 0.35 }, main_arriere: { x: 0.85, y: 0.32 }, genou_avant: { x: 0.35, y: 0.52 }, cheville_avant: { x: 0.2, y: 0.55 }, pied_avant: { x: 0.15, y: 0.55 }, genou_arriere: { x: 0.33, y: 0.49 }, cheville_arriere: { x: 0.18, y: 0.51 }, pied_arriere: { x: 0.13, y: 0.51 } },
    ],
  },
};

function MannequinPreview({ movementKey, large, proportions, style, onCanvasReady, movementOverride }) {
  const canvasRef = useRef(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const movement = movementOverride || MANNEQUIN_MOVEMENTS[movementKey];

  useEffect(() => { setFrameIdx(0); }, [movementKey]);
  useEffect(() => {
    if (!movement || movement.poses.length < 2) return;
    const interval = setInterval(() => setFrameIdx((i) => (i + 1) % movement.poses.length), 800);
    return () => clearInterval(interval);
  }, [movement]);

  useEffect(() => {
    if (onCanvasReady && canvasRef.current) onCanvasReady(canvasRef.current);
  }, [onCanvasReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !movement) return;
    const w = canvas.clientWidth || (large ? 400 : 200), h = Math.round(w * (2 / 3));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#E3D5EF";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h * 0.97); ctx.lineTo(w, h * 0.97); ctx.stroke();
    if (style === "realiste") {
      drawMannequinRealiste(ctx, movement.poses[frameIdx], w, h, REALISTIC_PROPORTIONS);
    } else {
      drawMannequin(ctx, movement.poses[frameIdx], w, h, proportions || DEFAULT_MANNEQUIN_PROPORTIONS);
    }
  }, [movement, frameIdx, large, proportions, style]);

  if (!movement) return null;
  return <canvas ref={canvasRef} style={{ width: "100%", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)" }} />;
}

const MANNEQUIN_JOINTS = [...new Set(MANNEQUIN_BONES.flat())];

// Éditeur de pose par pointeur-cliquer — fait glisser chaque articulation directement sur un
// squelette simplifié (segments + points), plutôt que d'écrire des coordonnées normalisées à la
// main. Rendu volontairement en traits simples, pas le style "réaliste" complet : ce qui compte
// ici, c'est la position exacte de chaque articulation, pas l'esthétique finale.
function PoseCanvasEditor({ pose, onChange }) {
  const canvasRef = useRef(null);
  const draggingRef = useRef(null);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 320, h = Math.round(w * (2 / 3));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#E3D5EF";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h * 0.97); ctx.lineTo(w, h * 0.97); ctx.stroke();
    ctx.strokeStyle = "#8B6FA8";
    ctx.lineWidth = 3;
    MANNEQUIN_BONES.forEach(([a, b]) => {
      const pa = pose[a], pb = pose[b];
      if (!pa || !pb) return;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    });
    MANNEQUIN_JOINTS.forEach((j) => {
      const p = pose[j];
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 7, 0, Math.PI * 2);
      ctx.fillStyle = draggingRef.current === j ? "#D9704F" : "#8B6FA8";
      ctx.fill();
    });
  }

  useEffect(() => { draw(); });

  function jointAt(clientX, clientY) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const w = canvas.width, h = canvas.height;
    const x = clientX - rect.left, y = clientY - rect.top;
    let closest = null, closestDist = 20; // rayon de sélection, en pixels
    MANNEQUIN_JOINTS.forEach((j) => {
      const p = pose[j];
      if (!p) return;
      const dx = p.x * w - x, dy = p.y * h - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closest = j; closestDist = dist; }
    });
    return closest;
  }

  function handlePointerDown(e) {
    const joint = jointAt(e.clientX, e.clientY);
    if (joint) { draggingRef.current = joint; e.target.setPointerCapture(e.pointerId); draw(); }
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange({ ...pose, [draggingRef.current]: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } });
  }
  function handlePointerUp() {
    draggingRef.current = null;
    draw();
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ width: "100%", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", touchAction: "none", cursor: "crosshair" }}
    />
  );
}

// Fait tourner un enchaînement : un minuteur d'une seconde avance le temps écoulé, dont
// computeSequenceState déduit l'étape et la phase (mouvement ou repos) — l'affichage de
// l'animation elle-même réutilise MannequinPreview telle quelle, sans dupliquer sa boucle.
function SequenceRunner({ sequence, proportions, style, onStop }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const state = computeSequenceState(sequence, elapsed);

  if (state.phase === "termine") {
    return (
      <div className="empty-state">
        Enchaînement terminé — {sequence.length} mouvement{sequence.length > 1 ? "s" : ""} réalisé{sequence.length > 1 ? "s" : ""}.
        <div style={{ marginTop: 10 }}><button className="btn btn-ghost" onClick={onStop}>Retour au constructeur</button></div>
      </div>
    );
  }

  const currentStep = sequence[state.stepIndex];
  const movement = MANNEQUIN_MOVEMENTS[currentStep.movementKey];
  const nextStep = sequence[state.stepIndex + 1];
  const nextMovement = nextStep ? MANNEQUIN_MOVEMENTS[nextStep.movementKey] : null;

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>Mouvement {state.stepIndex + 1} / {sequence.length}{state.phase === "repos" ? " — Repos" : ""}</p>
      <div style={{ textAlign: "center", fontSize: 40, fontWeight: 700, marginBottom: 10 }}>{state.remaining}s</div>
      {state.phase === "mouvement" && (
        <>
          <p className="panel-heading" style={{ textAlign: "center" }}>{movement.label}</p>
          <MannequinPreview movementKey={currentStep.movementKey} large proportions={proportions} style={style} />
        </>
      )}
      {state.phase === "repos" && (
        <div className="empty-state">Repos{nextMovement ? ` — ensuite : ${nextMovement.label}` : ""}</div>
      )}
      <div className="form-actions" style={{ marginTop: 14, justifyContent: "center" }}>
        <button className="btn btn-ghost" onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Reprendre"}</button>
        <button className="btn btn-ghost" onClick={onStop}>Arrêter</button>
      </div>
    </div>
  );
}

// Constructeur d'enchaînement : compose une liste de mouvements avec durée et repos, à
// enregistrer pour la réutiliser, puis à lancer via SequenceRunner ci-dessus.
function SequenceBuilder({ proportions, renderStyle }) {
  const [circuit, setCircuit] = useState([]);
  const [savedCircuits, setSavedCircuits] = useState([]);
  const [pickMovement, setPickMovement] = useState("reference");
  const [running, setRunning] = useState(false);
  const [circuitName, setCircuitName] = useState("");

  useEffect(() => {
    try { setSavedCircuits(JSON.parse(localStorage.getItem("tf_mannequin_circuits") || "[]")); } catch (e) {}
  }, []);

  function persistCircuits(next) {
    setSavedCircuits(next);
    try { localStorage.setItem("tf_mannequin_circuits", JSON.stringify(next)); } catch (e) {}
  }
  function addStep() {
    setCircuit((c) => [...c, emptyCircuitStep(pickMovement)]);
  }
  function removeStep(id) {
    setCircuit((c) => c.filter((s) => s.id !== id));
  }
  function updateStep(id, field, value) {
    setCircuit((c) => c.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  }
  function moveStep(id, dir) {
    setCircuit((c) => {
      const idx = c.findIndex((s) => s.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= c.length) return c;
      const next = [...c];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }
  function saveCircuit() {
    if (!circuitName.trim()) { alert("Donne un nom à cet enchaînement."); return; }
    if (circuit.length === 0) { alert("Ajoute au moins un mouvement."); return; }
    persistCircuits([...savedCircuits, { id: newId(), name: circuitName.trim(), steps: circuit }]);
    setCircuitName("");
    alert("Enchaînement enregistré.");
  }
  function loadCircuit(saved) {
    setCircuit(saved.steps.map((s) => ({ ...s, id: newId() })));
  }
  function deleteCircuit(id) {
    if (!confirm("Supprimer cet enchaînement enregistré ?")) return;
    persistCircuits(savedCircuits.filter((c) => c.id !== id));
  }

  const totalSeconds = circuit.reduce((s, step) => s + step.durationSeconds + step.restSeconds, 0);

  if (running) {
    return <SequenceRunner sequence={circuit} proportions={proportions} style={renderStyle} onStop={() => setRunning(false)} />;
  }

  return (
    <div>
      <p className="radar-note">Enchaîne plusieurs mouvements à la suite avec une durée et un repos entre chacun — utile pour un circuit training projeté ou filmé pendant une séance, plutôt qu'un mouvement isolé.</p>

      {savedCircuits.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Enchaînements enregistrés</div>
          <div className="scouting-list">
            {savedCircuits.map((c) => (
              <div className="scouting-card" key={c.id}>
                <div className="scouting-info">
                  <div className="scouting-name">{c.name} <span className="scouting-club">{c.steps.length} mouvement{c.steps.length > 1 ? "s" : ""}</span></div>
                </div>
                <button className="btn btn-ghost btn-small" onClick={() => loadCircuit(c)}>Charger</button>
                <button className="btn btn-ghost btn-small" onClick={() => deleteCircuit(c.id)}>Supprimer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="new-match-card" style={{ marginBottom: 16 }}>
        <label>Ajouter un mouvement
          <select value={pickMovement} onChange={(e) => setPickMovement(e.target.value)}>
            {Object.entries(MANNEQUIN_MOVEMENTS).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
          </select>
        </label>
        <button className="btn btn-ghost btn-small" onClick={addStep} style={{ marginTop: 8 }}>+ Ajouter à l'enchaînement</button>
      </div>

      {circuit.length === 0 && <div className="empty-state">Aucun mouvement dans l'enchaînement pour l'instant — ajoutes-en depuis la liste ci-dessus.</div>}
      {circuit.map((step, idx) => {
        const movement = MANNEQUIN_MOVEMENTS[step.movementKey];
        return (
          <div className="scouting-card" key={step.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className="scouting-name">{idx + 1}. {movement.label}</div>
            <div className="roster-physical-grid">
              <label>Durée (secondes)<input type="number" min="5" step="5" value={step.durationSeconds} onChange={(e) => updateStep(step.id, "durationSeconds", Number(e.target.value) || 0)} /></label>
              <label>Repos après (secondes)<input type="number" min="0" step="5" value={step.restSeconds} onChange={(e) => updateStep(step.id, "restSeconds", Number(e.target.value) || 0)} /></label>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost btn-small" onClick={() => moveStep(step.id, -1)} disabled={idx === 0}>↑ Monter</button>
              <button className="btn btn-ghost btn-small" onClick={() => moveStep(step.id, 1)} disabled={idx === circuit.length - 1}>↓ Descendre</button>
              <button className="btn btn-ghost btn-small" onClick={() => removeStep(step.id)}>Retirer</button>
            </div>
          </div>
        );
      })}

      {circuit.length > 0 && (
        <>
          <p className="hint">Durée totale : {Math.floor(totalSeconds / 60)} min {totalSeconds % 60}s.</p>
          <div className="form-actions">
            <input type="text" placeholder="Nom de l'enchaînement (pour l'enregistrer)" value={circuitName} onChange={(e) => setCircuitName(e.target.value)} style={{ maxWidth: 260 }} />
            <button className="btn btn-ghost" onClick={saveCircuit}>Enregistrer</button>
            <button className="btn btn-primary btn-large" onClick={() => setRunning(true)}>Lancer</button>
          </div>
        </>
      )}
    </div>
  );
}

// Un curseur avec son étiquette et sa valeur affichée — brique de base du panneau de réglages.
// Mode enchaînement : détermine, à partir du temps écoulé depuis le lancement, où on en est dans
// la séquence — quel mouvement, phase (mouvement ou repos), et temps restant dans cette phase.
// Fonction pure, indépendante du minuteur React qui l'appelle chaque seconde, pour rester simple
// à vérifier : donner un temps écoulé, obtenir un état, sans dépendre de setInterval pour tester.
function computeSequenceState(sequence, elapsedSeconds) {
  let cursor = 0;
  for (let i = 0; i < sequence.length; i++) {
    const step = sequence[i];
    const moveEnd = cursor + step.durationSeconds;
    if (elapsedSeconds < moveEnd) return { stepIndex: i, phase: "mouvement", remaining: moveEnd - elapsedSeconds };
    const restEnd = moveEnd + step.restSeconds;
    if (step.restSeconds > 0 && elapsedSeconds < restEnd) return { stepIndex: i, phase: "repos", remaining: restEnd - elapsedSeconds };
    cursor = restEnd;
  }
  return { stepIndex: sequence.length, phase: "termine", remaining: 0 };
}
function emptyCircuitStep(movementKey) {
  return { id: newId(), movementKey, durationSeconds: 30, restSeconds: 10 };
}

function ProportionSlider({ label, value, min, max, step, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>{label}</span>
        <span className="hint" style={{ margin: 0 }}>{value.toFixed(3)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </label>
  );
}

const PROPORTION_SLIDER_GROUPS = [
  { title: "Torse", fields: [
    { key: "chestWidth", label: "Largeur poitrine", min: 0.08, max: 0.4, step: 0.005 },
    { key: "chestLength", label: "Longueur poitrine", min: 0.1, max: 0.5, step: 0.005 },
    { key: "chestPosition", label: "Position poitrine", min: 0.1, max: 0.6, step: 0.01 },
    { key: "pelvisWidth", label: "Largeur bassin", min: 0.08, max: 0.4, step: 0.005 },
    { key: "pelvisLength", label: "Longueur bassin", min: 0.1, max: 0.5, step: 0.005 },
    { key: "pelvisPosition", label: "Position bassin", min: 0.5, max: 0.95, step: 0.01 },
  ]},
  { title: "Tête et cou", fields: [
    { key: "headWidth", label: "Largeur tête", min: 0.02, max: 0.08, step: 0.002 },
    { key: "headHeight", label: "Hauteur tête", min: 0.02, max: 0.1, step: 0.002 },
    { key: "neckWidth", label: "Épaisseur cou", min: 0.01, max: 0.08, step: 0.002 },
  ]},
  { title: "Bras", fields: [
    { key: "armWidth", label: "Épaisseur bras", min: 0.02, max: 0.12, step: 0.002 },
    { key: "forearmWidth", label: "Épaisseur avant-bras", min: 0.02, max: 0.1, step: 0.002 },
    { key: "elbowSize", label: "Taille coude", min: 0.01, max: 0.06, step: 0.002 },
  ]},
  { title: "Jambes", fields: [
    { key: "thighWidth", label: "Épaisseur cuisse", min: 0.03, max: 0.14, step: 0.002 },
    { key: "shinWidth", label: "Épaisseur mollet", min: 0.02, max: 0.12, step: 0.002 },
    { key: "kneeSize", label: "Taille genou", min: 0.01, max: 0.07, step: 0.002 },
    { key: "footWidth", label: "Épaisseur pied", min: 0.015, max: 0.09, step: 0.002 },
    { key: "ankleSize", label: "Taille cheville", min: 0.01, max: 0.06, step: 0.002 },
  ]},
  { title: "Profondeur", fields: [
    { key: "backLimbOpacity", label: "Opacité membre arrière", min: 0.1, max: 1, step: 0.05 },
  ]},
];

function emptyEditingPose() {
  const pose = {};
  MANNEQUIN_JOINTS.forEach((j) => { pose[j] = { x: 0.5, y: 0.5 }; });
  return pose;
}

// Onglet "Éditeur de pose" — crée et modifie des mouvements personnalisés en faisant glisser les
// articulations, stockés à part (tf_mannequin_custom_movements) plutôt que mélangés à la
// bibliothèque intégrée en dur dans le code. Chaque mouvement a 1 ou 2 poses, comme la plupart de
// ceux déjà construits à la main.
function PoseEditorTab() {
  const [customMovements, setCustomMovements] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ label: "", category: "Personnalisé" });
  const [editingPoses, setEditingPoses] = useState(null);
  const [activePoseIdx, setActivePoseIdx] = useState(0);

  useEffect(() => {
    try { setCustomMovements(JSON.parse(localStorage.getItem("tf_mannequin_custom_movements") || "{}")); } catch (e) {}
  }, []);

  function persistCustomMovements(next) {
    setCustomMovements(next);
    try { localStorage.setItem("tf_mannequin_custom_movements", JSON.stringify(next)); } catch (e) {}
  }
  function startNew() {
    setEditingId(null);
    setEditForm({ label: "", category: "Personnalisé" });
    setEditingPoses([{ ...MANNEQUIN_MOVEMENTS.reference.poses[0] }]);
    setActivePoseIdx(0);
  }
  function startEdit(id) {
    const m = customMovements[id];
    if (!m) return;
    setEditingId(id);
    setEditForm({ label: m.label, category: m.category });
    setEditingPoses(m.poses.map((p) => ({ ...p })));
    setActivePoseIdx(0);
  }
  function deleteMovement(id) {
    if (!confirm("Supprimer ce mouvement personnalisé ?")) return;
    const next = { ...customMovements };
    delete next[id];
    persistCustomMovements(next);
    if (editingId === id) { setEditingId(null); setEditingPoses(null); }
  }
  function duplicatePose1() {
    setEditingPoses((prev) => [prev[0], { ...prev[0] }]);
    setActivePoseIdx(1);
  }
  function removeSecondPose() {
    setEditingPoses((prev) => [prev[0]]);
    setActivePoseIdx(0);
  }
  function updateActivePose(newPose) {
    setEditingPoses((prev) => prev.map((p, i) => (i === activePoseIdx ? newPose : p)));
  }
  function save() {
    if (!editForm.label.trim()) { alert("Donne un nom à ce mouvement."); return; }
    const id = editingId || newId();
    const next = { ...customMovements, [id]: { label: editForm.label.trim(), category: editForm.category.trim() || "Personnalisé", poses: editingPoses } };
    persistCustomMovements(next);
    setEditingId(id);
    alert("Mouvement enregistré.");
  }

  if (editingPoses) {
    return (
      <div>
        <button className="btn btn-ghost btn-small" onClick={() => setEditingPoses(null)} style={{ marginBottom: 12 }}>‹ Mes mouvements personnalisés</button>
        <p className="radar-note">Fais glisser chaque point directement sur le squelette pour positionner l'articulation. Pars de la position de référence et ajuste — plus simple que de partir de zéro.</p>
        <div className="roster-physical-grid">
          <label>Nom du mouvement<input type="text" value={editForm.label} onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))} placeholder="ex. Fente latérale" autoFocus /></label>
          <label>Catégorie<input type="text" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} /></label>
        </div>
        <div className="qcm-options" style={{ marginBottom: 10 }}>
          <button className={`qcm-option ${activePoseIdx === 0 ? "selected" : ""}`} onClick={() => setActivePoseIdx(0)}>Pose 1</button>
          {editingPoses.length > 1 && <button className={`qcm-option ${activePoseIdx === 1 ? "selected" : ""}`} onClick={() => setActivePoseIdx(1)}>Pose 2</button>}
        </div>
        <div style={{ maxWidth: 420 }}>
          <PoseCanvasEditor pose={editingPoses[activePoseIdx]} onChange={updateActivePose} />
        </div>
        <div className="form-actions" style={{ marginTop: 10 }}>
          {editingPoses.length === 1 && <button className="btn btn-ghost btn-small" onClick={duplicatePose1}>+ Ajouter une 2e pose (mouvement animé)</button>}
          {editingPoses.length > 1 && <button className="btn btn-ghost btn-small" onClick={removeSecondPose}>Retirer la 2e pose</button>}
        </div>
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-primary btn-large" onClick={save}>Enregistrer</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="radar-note">Crée tes propres mouvements en positionnant les articulations directement sur le squelette, sans dépendre de coordonnées écrites à la main. Viennent s'ajouter à la bibliothèque intégrée, dans leur propre espace.</p>
      <button className="btn btn-primary btn-large" onClick={startNew} style={{ marginBottom: 16 }}>+ Nouveau mouvement</button>
      {Object.keys(customMovements).length === 0 && <div className="empty-state">Aucun mouvement personnalisé pour l'instant.</div>}
      <div className="scouting-list">
        {Object.entries(customMovements).map(([id, m]) => (
          <div className="scouting-card" key={id}>
            <div style={{ width: 90 }}>
              <MannequinPreview key={id} movementOverride={m} style="actuel" />
            </div>
            <div className="scouting-info">
              <div className="scouting-name">{m.label} <span className="scouting-club">{m.category}</span></div>
              <div className="scouting-meta">{m.poses.length > 1 ? "2 poses, en boucle" : "Pose statique"}</div>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => startEdit(id)}>Modifier</button>
            <button className="btn btn-ghost btn-small" onClick={() => deleteMovement(id)}>Supprimer</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MouvementsAnimesTab() {
  const [selected, setSelected] = useState("reference");
  const [proportions, setProportions] = useState(DEFAULT_MANNEQUIN_PROPORTIONS);
  const [showSettings, setShowSettings] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [renderStyle, setRenderStyle] = useState("actuel");
  const [screenMode, setScreenMode] = useState("bibliotheque");
  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoExportUnsupported, setVideoExportUnsupported] = useState(false);
  const canvasElRef = useRef(null);
  const categories = [...new Set(Object.values(MANNEQUIN_MOVEMENTS).map((m) => m.category))];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tf_mannequin_proportions") || "null");
      if (saved) setProportions({ ...DEFAULT_MANNEQUIN_PROPORTIONS, ...saved });
    } catch (e) {}
  }, []);

  function updateProportion(key, value) {
    setProportions((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem("tf_mannequin_proportions", JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }
  function resetProportions() {
    if (!confirm("Revenir aux proportions par défaut ? Tes réglages actuels seront perdus.")) return;
    setProportions(DEFAULT_MANNEQUIN_PROPORTIONS);
    try { localStorage.removeItem("tf_mannequin_proportions"); } catch (e) {}
  }
  function toggleGroup(title) {
    setCollapsedGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  }
  // Export vidéo — s'appuie sur MediaRecorder + canvas.captureStream, natifs au navigateur, plutôt
  // que d'ajouter une dépendance d'encodage GIF. Le mouvement tourne en boucle pendant l'enregistrement,
  // capturé tel quel puis proposé au téléchargement au format webm, lisible et partageable en dehors
  // de l'app (contrairement à l'aperçu, qui n'existe que dans la page).
  function exportVideo() {
    const canvas = canvasElRef.current;
    if (!canvas || typeof canvas.captureStream !== "function" || typeof window.MediaRecorder === "undefined") {
      setVideoExportUnsupported(true);
      return;
    }
    setVideoExportUnsupported(false);
    setExportingVideo(true);
    const movement = MANNEQUIN_MOVEMENTS[selected];
    const cycleMs = (movement.poses.length > 1 ? movement.poses.length : 1) * 800;
    const durationMs = Math.min(8000, Math.max(2500, cycleMs * 3));

    const stream = canvas.captureStream(24);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${movement.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportingVideo(false);
    };
    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  }

  return (
    <div>
      <div className="qcm-options" style={{ marginBottom: 12 }}>
        <button className={`qcm-option ${screenMode === "bibliotheque" ? "selected" : ""}`} onClick={() => setScreenMode("bibliotheque")}>Bibliothèque</button>
        <button className={`qcm-option ${screenMode === "enchainement" ? "selected" : ""}`} onClick={() => setScreenMode("enchainement")}>Enchaînement</button>
        <button className={`qcm-option ${screenMode === "editeur" ? "selected" : ""}`} onClick={() => setScreenMode("editeur")}>Éditeur de pose</button>
      </div>

      {screenMode === "enchainement" && <SequenceBuilder proportions={proportions} renderStyle={renderStyle} />}
      {screenMode === "editeur" && <PoseEditorTab />}

      {screenMode === "bibliotheque" && (
        <>
      <p className="radar-note">Une bibliothèque de mouvements animés par pantin articulé — utile pour visualiser un geste (musculation ou gardien) sans avoir besoin d'une vidéo. La position de référence, bras et jambes écartés, est utile pour régler les proportions : rien ne se chevauche, donc chaque partie du corps reste bien visible.</p>
      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <div className="hint" style={{ marginBottom: 4 }}>{cat}</div>
          <div className="qcm-options">
            {Object.entries(MANNEQUIN_MOVEMENTS).filter(([, m]) => m.category === cat).map(([key, m]) => (
              <button key={key} className={`qcm-option ${selected === key ? "selected" : ""}`} onClick={() => setSelected(key)}>{m.label}</button>
            ))}
          </div>
        </div>
      ))}

      <div className="qcm-options" style={{ marginBottom: 12 }}>
        <button className={`qcm-option ${renderStyle === "actuel" ? "selected" : ""}`} onClick={() => setRenderStyle("actuel")}>Style actuel</button>
        <button className={`qcm-option ${renderStyle === "realiste" ? "selected" : ""}`} onClick={() => setRenderStyle("realiste")}>Nouveau style (proposition)</button>
      </div>
      {renderStyle === "realiste" && <p className="hint" style={{ marginBottom: 12 }}>Membres effilés (plus larges près du tronc) et torse en une seule silhouette, plutôt que deux ovales superposés. Pas encore de réglages pour cette version — dis-moi ce qui te semble aller ou non, et j'ajusterai.</p>}
      {renderStyle === "actuel" && <button className="btn btn-ghost btn-small" onClick={() => setShowSettings((s) => !s)} style={{ marginBottom: 12 }}>{showSettings ? "Masquer les réglages" : "Régler les proportions"}</button>}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: 420, position: "sticky", top: 10 }}>
          <MannequinPreview movementKey={selected} large proportions={proportions} style={renderStyle} onCanvasReady={(c) => { canvasElRef.current = c; }} />
          <p className="hint" style={{ marginTop: 10 }}>{MANNEQUIN_MOVEMENTS[selected].poses.length > 1 ? `${MANNEQUIN_MOVEMENTS[selected].poses.length} poses-clés, en boucle.` : "Pose statique (mouvement isométrique)."}</p>
          <button className="btn btn-ghost btn-small" onClick={exportVideo} disabled={exportingVideo}>{exportingVideo ? "Enregistrement en cours…" : "Exporter en vidéo"}</button>
          {videoExportUnsupported && <p className="hint" style={{ color: "var(--crimson)" }}>L'enregistrement vidéo n'est pas pris en charge par ce navigateur.</p>}
        </div>

        {showSettings && renderStyle === "actuel" && (
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <div className="new-match-card">
              <p className="hint" style={{ marginTop: 0 }}>L'aperçu à côté se met à jour en temps réel. Replie un groupe une fois qu'il te convient pour te concentrer sur le reste. Tes réglages sont sauvegardés et s'appliquent à tous les mouvements.</p>
              {PROPORTION_SLIDER_GROUPS.map((group) => {
                const isCollapsed = !!collapsedGroups[group.title];
                return (
                  <div key={group.title} style={{ marginBottom: 10, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                    <button
                      onClick={() => toggleGroup(group.title)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                    >
                      <span className="panel-heading" style={{ margin: 0, fontSize: 14 }}>{group.title}</span>
                      <span className="hint" style={{ margin: 0 }}>{isCollapsed ? "▶ afficher" : "▼ replier"}</span>
                    </button>
                    {!isCollapsed && group.fields.map((f) => (
                      <ProportionSlider key={f.key} label={f.label} value={proportions[f.key]} min={f.min} max={f.max} step={f.step} onChange={(v) => updateProportion(f.key, v)} />
                    ))}
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-small" onClick={resetProportions}>Réinitialiser les proportions par défaut</button>
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
