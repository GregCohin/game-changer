// Habillage du personnage 3D : maillot, short, chaussettes et chaussures, ajoutés en « coques »
// recopiées sur le maillage du corps (mêmes os, mêmes poids de peau, décalées vers l'extérieur).
// Chaque pièce est une boîte (plans horizontaux/verticaux calés sur les os du modèle, en T-pose)
// dans laquelle les triangles du corps sont découpés exactement : ourlets et col parfaitement droits.
// Le corps livré porte des sous-vêtements peints dans sa texture (retirés à la conversion, voir
// src/assets/models/README.md) : ce module est ce qui rend le personnage présentable — l'appelant
// ne doit ajouter le modèle à la scène qu'après son succès.

import * as THREE from "three";

export const KIT_COLORS = { maillot: 0x2f6fbf, short: 0x20263a, chaussettes: 0x2f6fbf, chaussures: 0x20232a };

function boneWorld(bones, name) {
  const bone = bones[name];
  if (!bone) throw new Error(`os manquant : ${name}`);
  return bone.getWorldPosition(new THREE.Vector3());
}

// Découpe un polygone (sommets { p, n, nl, i, w }) par le demi-espace sign·(p[axis] − value) ≥ 0.
// Les points créés sur le plan reprennent les os et poids du sommet le plus proche.
function clipPolygon(polygon, axis, sign, value) {
  const out = [];
  for (let k = 0; k < polygon.length; k++) {
    const a = polygon[k], b = polygon[(k + 1) % polygon.length];
    const da = sign * (a.p[axis] - value), db = sign * (b.p[axis] - value);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      const near = t < 0.5 ? a : b;
      out.push({
        p: a.p.clone().lerp(b.p, t),
        n: a.n.clone().lerp(b.n, t).normalize(),
        nl: a.nl.clone().lerp(b.nl, t).normalize(),
        i: near.i,
        w: near.w,
      });
    }
  }
  return out;
}

// Construit une coque : les triangles du corps découpés par la boîte `limits` ({ axis, min, max }),
// décalés de `offset` mètres le long de leur normale.
function buildShell(body, source, { limits, offset, color }) {
  const positions = [], normals = [], skinIdx = [], skinW = [];
  const inverse = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const local = new THREE.Vector3();

  for (const triangle of source.triangles) {
    // rejet rapide : les trois sommets du même côté d'un plan
    let outside = false;
    for (const { axis, min, max } of limits) {
      if (triangle.every((v) => v.p[axis] < min) || triangle.every((v) => v.p[axis] > max)) { outside = true; break; }
    }
    if (outside) continue;
    let polygon = triangle;
    for (const { axis, min, max } of limits) {
      polygon = clipPolygon(polygon, axis, 1, min);
      if (polygon.length) polygon = clipPolygon(polygon, axis, -1, max);
      if (!polygon.length) break;
    }
    if (polygon.length < 3) continue;
    for (let k = 1; k < polygon.length - 1; k++) {
      for (const v of [polygon[0], polygon[k], polygon[k + 1]]) {
        local.copy(v.p).addScaledVector(v.n, offset).applyMatrix4(inverse);
        positions.push(local.x, local.y, local.z);
        normals.push(v.nl.x, v.nl.y, v.nl.z);
        skinIdx.push(...v.i);
        skinW.push(...v.w);
      }
    }
  }
  if (positions.length < 9 * 30) throw new Error("habillage : zone vide (modèle inattendu)");

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIdx, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinW, 4));
  const shell = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 }));
  shell.position.copy(body.position);
  shell.quaternion.copy(body.quaternion);
  shell.scale.copy(body.scale);
  shell.bind(body.skeleton, body.bindMatrix);
  shell.frustumCulled = false;
  return { shell, triangles: positions.length / 9 };
}

// Lit le maillage du corps une fois (positions/normales en repère monde, T-pose ; os et poids par
// accesseurs — les attributs du corps sont entrelacés et normalisés, jamais lus dans `.array`).
function readBody(body) {
  body.updateWorldMatrix(true, false);
  const g = body.geometry;
  const position = g.attributes.position, normal = g.attributes.normal, skinIndex = g.attributes.skinIndex, skinWeight = g.attributes.skinWeight;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(body.matrixWorld);
  const vertices = [];
  for (let i = 0; i < position.count; i++) {
    vertices.push({
      p: new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(body.matrixWorld),
      nl: new THREE.Vector3().fromBufferAttribute(normal, i),
      n: new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize(),
      i: [skinIndex.getX(i), skinIndex.getY(i), skinIndex.getZ(i), skinIndex.getW(i)],
      w: [skinWeight.getX(i), skinWeight.getY(i), skinWeight.getZ(i), skinWeight.getW(i)],
    });
  }
  const index = g.index.array;
  const triangles = [];
  for (let t = 0; t < index.length; t += 3) triangles.push([vertices[index[t]], vertices[index[t + 1]], vertices[index[t + 2]]]);
  return { vertices, triangles };
}

// Habille `body` (SkinnedMesh du corps, en T-pose, matrices monde à jour). Renvoie les coques
// ajoutées ; lève une erreur si une zone est vide (le personnage ne doit alors pas être affiché).
export function dressBody(body, bones) {
  const source = readBody(body);

  // Repères tirés des os et du maillage du modèle (T-pose, mètres).
  const pelvis = boneWorld(bones, "pelvis").y;
  const shoulder = boneWorld(bones, "upperarm_l");
  const elbow = boneWorld(bones, "lowerarm_l");
  const thigh = boneWorld(bones, "thigh_l").y;
  const knee = boneWorld(bones, "calf_l").y;
  const ankle = boneWorld(bones, "foot_l").y;
  // Haut des épaules : le point le plus haut du maillage entre le cou et le bout de l'épaule.
  let shoulderTop = -Infinity;
  for (const v of source.vertices) {
    const ax = Math.abs(v.p.x);
    if (ax >= 0.13 && ax <= 0.245 && v.p.y > shoulderTop && v.p.y < shoulder.y + 0.2) shoulderTop = v.p.y;
  }

  const yCollar = shoulderTop - 0.01;
  const yShirtHem = pelvis + 0.02;
  const yShortTop = pelvis + 0.09;
  const yShortHem = thigh - 0.55 * (thigh - knee);
  const yBootTop = ankle + 0.035;
  const ySockTop = knee - 0.09;
  const xSleeve = Math.abs(shoulder.x) + 0.45 * Math.abs(elbow.x - shoulder.x);

  const specs = [
    { color: KIT_COLORS.maillot, offset: 0.011, limits: [{ axis: "y", min: yShirtHem, max: yCollar }, { axis: "x", min: -xSleeve, max: xSleeve }] },
    { color: KIT_COLORS.short, offset: 0.008, limits: [{ axis: "y", min: yShortHem, max: yShortTop }] },
    { color: KIT_COLORS.chaussettes, offset: 0.007, limits: [{ axis: "y", min: yBootTop, max: ySockTop }] },
    { color: KIT_COLORS.chaussures, offset: 0.011, limits: [{ axis: "y", min: -1, max: yBootTop }] },
  ];
  const shells = specs.map((spec) => buildShell(body, source, spec));
  shells.forEach(({ shell }) => body.parent.add(shell));
  return shells;
}
