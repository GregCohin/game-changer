// Recalage des poses 2D du pantin (coordonnées x,y normalisées par articulation) sur un squelette 3D.
// Principe : chaque os est tourné pour que sa direction (articulation → articulation suivante)
// prenne la direction 2D de la pose, en repère monde (x droite, y haut, z vers la caméra) — les
// longueurs d'os du modèle 3D sont respectées, seules les directions viennent de la pose 2D.
// Ce que la pose 2D ne dit pas (profondeur, torsion des os) est laissé à l'arc le plus court.
// Fichier volontairement sans JSX ni accès au DOM : il n'est chargé qu'avec three, à la demande.

import * as THREE from "three";

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _world = new THREE.Quaternion();
const _parentInv = new THREE.Quaternion();

// Orientation du personnage selon la vue du mouvement : "front" = de face (la pose 2D est un
// dessin de face, bras/jambes écartés vers les côtés de l'écran), "right"/"left" = de profil,
// tourné vers la droite/gauche de l'écran.
const YAW_BY_FACING = { front: 0, right: Math.PI / 2, left: -Math.PI / 2 };

// Quel côté du personnage porte les membres "avant" (proches de la caméra, ou à droite de
// l'écran en vue de face) et "arrière" du dessin 2D. Personnage glTF de face : sa gauche est du
// côté +x (à droite de l'écran) ; tourné vers +x, sa droite est côté caméra (+z).
const SIDES_BY_FACING = {
  front: { avant: "left", arriere: "right" },
  right: { avant: "right", arriere: "left" },
  left: { avant: "left", arriere: "right" },
};

// Direction monde d'un segment 2D : y de l'écran pointe vers le bas, y du monde vers le haut.
function direction2D(from, to, out) {
  return out.set(to.x - from.x, -(to.y - from.y), 0).normalize();
}

// Tourne `bone` (rotation la plus courte, en repère monde) pour que la direction bone → child
// devienne `targetDir`. Renvoie false si l'os et son enfant sont confondus (rien à viser).
export function aimBone(bone, child, targetDir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_p0);
  child.getWorldPosition(_p1);
  _dir.subVectors(_p1, _p0);
  if (_dir.lengthSq() < 1e-12 || targetDir.lengthSq() < 1e-12) return false;
  _dir.normalize();
  _delta.setFromUnitVectors(_dir, targetDir);
  bone.getWorldQuaternion(_world);
  _world.premultiply(_delta);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_parentInv).invert();
    _world.premultiply(_parentInv);
  }
  bone.quaternion.copy(_world);
  bone.updateWorldMatrix(false, true);
  return true;
}

// Repère les os d'un personnage « Universal » de Quaternius (noms de style Unreal : pelvis,
// spine_01, thigh_l…) et photographie sa pose de repos. `root` : la scène glTF du personnage.
export function detectRig(root) {
  const bones = {};
  root.traverse((object) => { if (object.isBone) bones[object.name] = object; });
  const need = (name) => { if (!bones[name]) throw new Error(`os manquant : ${name}`); return bones[name]; };
  const arm = (s) => ({ upper: need(`upperarm_${s}`), fore: need(`lowerarm_${s}`), hand: need(`hand_${s}`) });
  const leg = (s) => ({ upper: need(`thigh_${s}`), lower: need(`calf_${s}`), foot: need(`foot_${s}`), toe: need(`ball_${s}`) });
  root.updateMatrixWorld(true);
  const rig = {
    root,
    bones,
    hips: need("pelvis"),
    spine: ["spine_01", "spine_02", "spine_03"].map(need),
    neck: need("neck_01"),
    head: need("Head"),
    arm: { left: arm("l"), right: arm("r") },
    leg: { left: leg("l"), right: leg("r") },
  };
  rig.rest = captureSnapshot(rig);
  // Longueurs des segments (m), mesurées en pose de repos : servent au calcul des jambes à deux segments.
  const dist = (a, b) => a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
  rig.lengths = {
    leg: { upper: dist(rig.leg.left.upper, rig.leg.left.lower), lower: dist(rig.leg.left.lower, rig.leg.left.foot) },
    arm: { upper: dist(rig.arm.left.upper, rig.arm.left.fore), lower: dist(rig.arm.left.fore, rig.arm.left.hand) },
  };
  // « Devant » du personnage dans le repère de son bassin (il regarde +z au repos) : sert à plier
  // les genoux du bon côté quel que soit l'angle du corps (debout, sur le dos, sur le ventre).
  rig.forwardLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.hips.getWorldQuaternion(new THREE.Quaternion()).invert());
  // Parties du corps pouvant toucher le sol, avec leur rayon approximatif (mètres) : le plus bas
  // d'entre eux pose le personnage au sol. Rayons pour un adulte de ~1,8 m.
  rig.contacts = [
    [rig.arm.left.hand, 0.045], [rig.arm.right.hand, 0.045],
    [rig.arm.left.fore, 0.05], [rig.arm.right.fore, 0.05],
    [rig.arm.left.upper, 0.08], [rig.arm.right.upper, 0.08],
    [rig.leg.left.foot, 0.09], [rig.leg.right.foot, 0.09],
    [rig.leg.left.toe, 0.02], [rig.leg.right.toe, 0.02],
    [rig.leg.left.lower, 0.07], [rig.leg.right.lower, 0.07],
    [rig.leg.left.upper, 0.09], [rig.leg.right.upper, 0.09],
    [rig.hips, 0.11], [rig.spine[2], 0.13], [rig.head, 0.1],
  ];
  return rig;
}

// Les os que le recalage pilote, dans l'ordre (parent avant enfant).
export function rigBones(rig) {
  const list = [rig.hips, ...rig.spine, rig.neck, rig.head];
  for (const side of ["left", "right"]) {
    const a = rig.arm[side], l = rig.leg[side];
    list.push(a.upper, a.fore, a.hand, l.upper, l.lower, l.foot);
    if (l.toe) list.push(l.toe);
  }
  return list.filter(Boolean);
}

// Photographie l'état des os pilotés (rotations locales + position du bassin) : sert de pose de
// repos avant recalage, et de point de départ/arrivée pour fondre d'une pose-clé à l'autre.
export function captureSnapshot(rig) {
  return {
    hipsPosition: rig.hips.position.clone(),
    rotations: rigBones(rig).map((bone) => bone.quaternion.clone()),
  };
}

export function applySnapshot(rig, snapshot) {
  rig.hips.position.copy(snapshot.hipsPosition);
  rigBones(rig).forEach((bone, i) => bone.quaternion.copy(snapshot.rotations[i]));
  rig.root.updateMatrixWorld(true);
}

// Fond deux photographies (t de 0 à 1) directement dans les os du personnage.
export function applyBlend(rig, a, b, t) {
  rig.hips.position.lerpVectors(a.hipsPosition, b.hipsPosition, t);
  rigBones(rig).forEach((bone, i) => bone.quaternion.slerpQuaternions(a.rotations[i], b.rotations[i], t));
  rig.root.updateMatrixWorld(true);
}

// Milieu (genou/coude) d'un membre à deux segments : `root` (hanche), `target` (cheville), longueurs
// l1/l2, plié vers `pole`. La distance racine-cible est bornée aux valeurs atteignables.
function twoBoneMiddle(root, target, l1, l2, pole, distance) {
  const toTarget = target.clone().sub(root);
  const u = toTarget.lengthSq() > 1e-12 ? toTarget.normalize() : new THREE.Vector3(0, -1, 0);
  const d = Math.min(Math.max(distance, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const side = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
  if (side.lengthSq() < 1e-9) side.set(u.y, -u.x, 0);
  side.normalize();
  return { middle: root.clone().addScaledVector(u, a).addScaledVector(side, h), end: root.clone().addScaledVector(u, d) };
}

// Hauteur (m) à laquelle le dessin place le personnage au-dessus du sol : 0 pour les poses debout
// ou allongées (le plus bas des points de contact touche le sol), positive pour un saut — repéré
// à des pieds dessinés nettement au-dessus de la ligne de sol alors que le corps est debout.
export function guessAirHeight(pose, scale) {
  const lean = Math.abs(Math.atan2(pose.epaule.x - pose.hanche.x, -(pose.epaule.y - pose.hanche.y)));
  if (lean > (55 * Math.PI) / 180) return 0;
  const lowestFoot = Math.max(pose.pied_avant?.y ?? 0, pose.pied_arriere?.y ?? 0, pose.cheville_avant?.y ?? 0, pose.cheville_arriere?.y ?? 0);
  return lowestFoot < 0.895 ? (0.96 - lowestFoot) * scale * 0.8 : 0;
}

// Pose le personnage sur le sol : le plus bas des points de contact (moins son rayon) est ramené à
// la hauteur `height` (0 = au sol), en translatant tout le corps par le bassin.
function placeOnGround(rig, height) {
  rig.root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  let lowest = Infinity;
  for (const [bone, radius] of rig.contacts) lowest = Math.min(lowest, bone.getWorldPosition(p).y - radius);
  const world = rig.hips.getWorldPosition(new THREE.Vector3());
  world.y += height - lowest;
  rig.hips.position.copy(rig.hips.parent ? rig.hips.parent.worldToLocal(world) : world);
  rig.root.updateMatrixWorld(true);
}

// Suspension : le corps est placé pour que la hauteur moyenne des mains soit `handsHeight` (mains
// accrochées à une barre) au lieu de poser le point le plus bas au sol.
function placeByHands(rig, handsHeight) {
  rig.root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const mean = (rig.arm.left.hand.getWorldPosition(p).y + rig.arm.right.hand.getWorldPosition(p).y) / 2;
  const world = rig.hips.getWorldPosition(new THREE.Vector3());
  world.y += handsHeight - mean;
  rig.hips.position.copy(rig.hips.parent ? rig.hips.parent.worldToLocal(world) : world);
  rig.root.updateMatrixWorld(true);
}

// Position moyenne des mains en repère monde (pour poser une barre à leur hauteur).
export function handsCenter(rig) {
  rig.root.updateMatrixWorld(true);
  const a = rig.arm.left.hand.getWorldPosition(new THREE.Vector3()), b = rig.arm.right.hand.getWorldPosition(new THREE.Vector3());
  return a.add(b).multiplyScalar(0.5);
}

// Pose le personnage comme la pose 2D. `rig` : { root, hips, spine[], neck, head, arm:{left,right},
// leg:{left,right}, rest, forwardLocal, contacts } (voir detectRig). `scale` : mètres par unité 2D.
// `restHips2D` : hauteur du bassin (y 2D) dans la pose debout de référence. `height` : hauteur du
// point le plus bas au-dessus du sol (par défaut, déduite du dessin ; 0 = au sol). `handsHeight` :
// pour une suspension, hauteur des mains (remplace le placement au sol).
export function poseRig(rig, pose, { facing = "front", scale, restHips2D = 0.52, height, handsHeight } = {}) {
  applySnapshot(rig, rig.rest);
  rig.root.rotation.y = YAW_BY_FACING[facing];
  rig.root.updateMatrixWorld(true);

  // Bassin : déplacement horizontal par rapport au repos ; la hauteur est réglée à la fin (sol).
  const restHipsWorld = rig.hips.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Vector3(restHipsWorld.x + (pose.hanche.x - 0.5) * scale, restHipsWorld.y + (restHips2D - pose.hanche.y) * scale, restHipsWorld.z);
  rig.hips.position.copy(rig.hips.parent ? rig.hips.parent.worldToLocal(target.clone()) : target);
  rig.root.updateMatrixWorld(true);

  const dir = new THREE.Vector3();

  // Colonne : toute droite, de la hanche vers l'épaule du dessin.
  direction2D(pose.hanche, pose.epaule, dir);
  const chain = [rig.hips, ...rig.spine, rig.neck];
  for (let i = 0; i < chain.length - 1; i++) aimBone(chain[i], chain[i + 1], dir);
  // Cou : de l'épaule vers la tête.
  direction2D(pose.epaule, pose.tete, dir);
  if (rig.head) aimBone(rig.neck, rig.head, dir);

  // Corps allongé (torse à plus de 55° de la verticale) : pompe, abdos, planche…
  const lying = Math.abs(Math.atan2(pose.epaule.x - pose.hanche.x, -(pose.epaule.y - pose.hanche.y))) > (55 * Math.PI) / 180;

  // « Devant » du bassin dans le plan de l'écran : sert à décider de quel côté un genou peut plier.
  const forward = rig.forwardLocal.clone().applyQuaternion(rig.hips.getWorldQuaternion(new THREE.Quaternion()));
  const forward2D = new THREE.Vector2(forward.x, forward.y);

  // Côté du personnage qui porte chaque membre dessiné. De face, on suit l'ordre à l'écran (le
  // membre le plus à droite de l'écran est le côté gauche du personnage) plutôt que « avant/arrière ».
  const sideOf = (drawing, kind) => {
    if (facing !== "front") return SIDES_BY_FACING[facing][drawing];
    const a = kind === "arm" ? pose.main_avant : (pose.cheville_avant || pose.pied_avant);
    const r = kind === "arm" ? pose.main_arriere : (pose.cheville_arriere || pose.pied_arriere);
    const swapped = a && r && a.x < r.x;
    return (drawing === "avant") !== !!swapped ? "left" : "right";
  };

  for (const drawing of ["avant", "arriere"]) {
    const arm = rig.arm[sideOf(drawing, "arm")], leg = rig.leg[sideOf(drawing, "leg")];
    // Membre absent du dessin (poses à un seul côté) : on reprend l'autre côté plutôt que de
    // laisser un bras en croix issu de la pose de repos.
    const has = (n) => pose[`${n}_${drawing}`];
    const from = (n) => (has(n) ? drawing : "avant");
    const j = (n) => pose[`${n}_${from(n)}`];

    if (j("coude") && j("main")) {
      direction2D(pose.epaule, j("coude"), dir); aimBone(arm.upper, arm.fore, dir);
      direction2D(j("coude"), j("main"), dir); aimBone(arm.fore, arm.hand, dir);
    }
    if (j("genou") && j("cheville")) {
      // Un genou dessiné du mauvais côté de la ligne hanche-cheville (jambe pliée « à l'envers »)
      // n'est pas réalisable : on recalcule alors la jambe à deux segments, pliée vers l'avant du
      // corps, avec le même degré d'extension que le dessin (jambe tendue reste tendue).
      let bentBackwards = false;
      if (forward2D.length() > 0.35) {
        const hip = new THREE.Vector2(pose.hanche.x, -pose.hanche.y), k = new THREE.Vector2(j("genou").x, -j("genou").y), ankle = new THREE.Vector2(j("cheville").x, -j("cheville").y);
        const chord = ankle.clone().sub(hip);
        if (chord.lengthSq() > 1e-6) {
          chord.normalize();
          const v = k.clone().sub(hip);
          const perp = v.clone().sub(chord.clone().multiplyScalar(v.dot(chord)));
          bentBackwards = perp.lengthSq() > 1e-6 && perp.dot(forward2D) < 0;
        }
      }
      if (bentBackwards) {
        const drawnLength = Math.hypot(j("genou").x - pose.hanche.x, j("genou").y - pose.hanche.y) + Math.hypot(j("cheville").x - j("genou").x, j("cheville").y - j("genou").y);
        const drawnChord = Math.hypot(j("cheville").x - pose.hanche.x, j("cheville").y - pose.hanche.y);
        const ratio = drawnLength > 1e-6 ? Math.min(1, drawnChord / drawnLength) : 0.9;
        const { leg: lengths } = rig.lengths;
        const hipWorld = leg.upper.getWorldPosition(new THREE.Vector3());
        direction2D(pose.hanche, j("cheville"), dir);
        const target = hipWorld.clone().addScaledVector(dir, ratio * (lengths.upper + lengths.lower));
        const pole = rig.forwardLocal.clone().applyQuaternion(rig.hips.getWorldQuaternion(new THREE.Quaternion()));
        const { middle, end } = twoBoneMiddle(hipWorld, target, lengths.upper, lengths.lower, pole, ratio * (lengths.upper + lengths.lower));
        aimBone(leg.upper, leg.lower, middle.clone().sub(hipWorld).normalize());
        aimBone(leg.lower, leg.foot, end.clone().sub(middle).normalize());
      } else {
        direction2D(pose.hanche, j("genou"), dir); aimBone(leg.upper, leg.lower, dir);
        direction2D(j("genou"), j("cheville"), dir); aimBone(leg.lower, leg.foot, dir);
      }
      if (j("pied") && leg.toe) {
        // Le petit trait dessiné au bout de la jambe prolonge souvent le tibia sans rien dire du pied :
        // on ne vise alors l'orteil que pour un coup de pied (jambe tendue hors de la verticale),
        // sinon le pied reste naturel (à plat debout, orteils au sol en planche).
        const shank = new THREE.Vector3(), foot = new THREE.Vector3();
        direction2D(j("genou"), j("cheville"), shank);
        direction2D(j("cheville"), j("pied"), foot);
        const continuation = shank.angleTo(foot) < 0.7;
        const shankVertical = Math.abs(shank.y) > 0.82;
        if (!continuation || (!lying && !shankVertical)) aimBone(leg.foot, leg.toe, foot);
      }
    }
  }
  if (handsHeight !== undefined) placeByHands(rig, handsHeight);
  else placeOnGround(rig, height === undefined ? guessAirHeight(pose, scale) : height);
}
