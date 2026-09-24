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

// Pose le personnage comme la pose 2D. `rig` : { root, hips, spine[], neck, head, arm:{left,right},
// leg:{left,right}, rest } où arm/leg contiennent { upper, fore|lower, hand|foot, toe? } et `rest` est
// le snapshot de la pose de repos. `scale` : unités monde par unité 2D. `restHips2D` : hauteur du
// bassin (y 2D) dans la pose debout de référence — le bassin est placé relativement à elle.
export function poseRig(rig, pose, { facing = "front", scale, restHips2D = 0.52 } = {}) {
  applySnapshot(rig, rig.rest);
  rig.root.rotation.y = YAW_BY_FACING[facing];
  rig.root.updateMatrixWorld(true);

  // Bassin : déplacement par rapport au repos, dans le plan de l'écran (x, y).
  const restHipsWorld = rig.hips.getWorldPosition(new THREE.Vector3());
  const target = new THREE.Vector3(
    restHipsWorld.x + (pose.hanche.x - 0.5) * scale,
    restHipsWorld.y + (restHips2D - pose.hanche.y) * scale,
    restHipsWorld.z,
  );
  const local = rig.hips.parent ? rig.hips.parent.worldToLocal(target.clone()) : target;
  rig.hips.position.copy(local);
  rig.root.updateMatrixWorld(true);

  const dir = new THREE.Vector3();

  // Colonne : toute droite, de la hanche vers l'épaule du dessin.
  direction2D(pose.hanche, pose.epaule, dir);
  const chain = [rig.hips, ...rig.spine, rig.neck];
  for (let i = 0; i < chain.length - 1; i++) aimBone(chain[i], chain[i + 1], dir);
  // Cou : de l'épaule vers la tête.
  direction2D(pose.epaule, pose.tete, dir);
  if (rig.head) aimBone(rig.neck, rig.head, dir);

  const sides = SIDES_BY_FACING[facing];
  for (const drawing of ["avant", "arriere"]) {
    const side = sides[drawing];
    const arm = rig.arm[side], leg = rig.leg[side];
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
      direction2D(pose.hanche, j("genou"), dir); aimBone(leg.upper, leg.lower, dir);
      direction2D(j("genou"), j("cheville"), dir); aimBone(leg.lower, leg.foot, dir);
      if (j("pied") && leg.toe) { direction2D(j("cheville"), j("pied"), dir); aimBone(leg.foot, leg.toe, dir); }
    }
  }
  rig.root.updateMatrixWorld(true);
}
