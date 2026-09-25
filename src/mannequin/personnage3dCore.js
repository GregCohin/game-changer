// Chargement du personnage 3D (modèle, habillage, cheveux, animations, calage du rig), partagé entre
// le composant d'aperçu et les outils de vérification. Ce fichier importe three : il n'est chargé
// qu'avec le chunk du personnage 3D, jamais dans le bundle principal.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { detectRig, poseRig, captureSnapshot, applySnapshot, handsCenter } from "./retarget3d.js";
import { dressBody } from "./habillage3d.js";

// Les modèles vivent dans src/assets/models/ ; import.meta.glob ne plante pas le build si un
// fichier manque (le composant affiche alors le repli 2D au lieu de casser toute l'app).
const MODEL_URLS = import.meta.glob("../assets/models/*.glb", { query: "?url", import: "default", eager: true });
const modelUrl = (file) => MODEL_URLS[`../assets/models/${file}`] || null;

export const CHARACTERS = {
  garcon: { body: "superhero-male.glb", hair: "hair-simpleparted.glb", hairColor: 0x3b2a1e },
  fille: { body: "superhero-female.glb", hair: "hair-long.glb", hairColor: 0x7a4a25 },
};
const ANIMATIONS_FILE = "animations.glb";

export function hasCharacterAssets(gender) {
  const character = CHARACTERS[gender] || CHARACTERS.garcon;
  return !!(modelUrl(character.body) && modelUrl(character.hair) && modelUrl(ANIMATIONS_FILE));
}

// Charge et prépare un personnage. Il n'est renvoyé qu'entièrement habillé : le corps livré porte des
// sous-vêtements, il ne doit jamais être ajouté à une scène dans cet état (dressBody lève une erreur
// si une zone est vide). Renvoie { model, rig, body, scale, clips }.
export async function loadCharacter(gender) {
  const character = CHARACTERS[gender] || CHARACTERS.garcon;
  const urls = { body: modelUrl(character.body), hair: modelUrl(character.hair), animations: modelUrl(ANIMATIONS_FILE) };
  if (!urls.body || !urls.hair || !urls.animations) throw new Error("Le modèle 3D n'est pas installé dans cette version.");

  const loader = new GLTFLoader();
  const [characterGltf, animationsGltf, hairGltf] = await Promise.all([loader.loadAsync(urls.body), loader.loadAsync(urls.animations), loader.loadAsync(urls.hair)]);

  const model = characterGltf.scene;
  model.updateMatrixWorld(true);
  const rig = detectRig(model);
  let body = null;
  model.traverse((object) => { if (object.isSkinnedMesh && /superhero/i.test(object.name)) body = object; });
  if (!body) throw new Error("corps introuvable dans le modèle");
  model.traverse((object) => { if (object.isSkinnedMesh) object.frustumCulled = false; });
  const bounds = new THREE.Box3().setFromObject(model);
  const scale = (bounds.max.y - bounds.min.y) / 0.97; // mètres par unité de dessin 2D (dessin debout ≈ 0,97 de haut)
  dressBody(body, rig.bones);

  // La texture des cheveux est en niveaux de gris (la couleur vient du moteur de jeu dans le pack
  // d'origine) : on la teinte, et les sourcils avec.
  const hairColor = new THREE.Color(character.hairColor);
  hairGltf.scene.traverse((object) => { if (object.isMesh) object.material.color.copy(hairColor); });
  model.traverse((object) => { if (object.isSkinnedMesh && /eyebrow/i.test(object.name)) object.material.color.copy(hairColor); });
  rig.head.attach(hairGltf.scene);
  model.updateMatrixWorld(true);

  const clips = Object.fromEntries(animationsGltf.animations.map((clip) => [clip.name, clip]));
  return { model, rig, body, scale, clips };
}

// --- Accessoires : barre de traction, barres parallèles, banc --------------------------------
const STEEL = 0x9aa0b0;
const WOOD = 0x5b4a3a;
const material = (color, metalness = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness });
function cylinder(radius, length, color, position, alongX = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material(color));
  if (alongX) mesh.rotation.z = Math.PI / 2;
  mesh.position.copy(position);
  return mesh;
}

// Accessoires d'un mouvement, calés sur les mains ou les pieds de sa première pose.
function createProps(kinds, { handsHeight, hands, backToe }) {
  const group = new THREE.Group();
  const barY = (handsHeight ?? 1.9) + 0.03;
  for (const kind of kinds) {
    if (kind === "bar") {
      const z = (hands[0].z + hands[1].z) / 2, x = (hands[0].x + hands[1].x) / 2;
      group.add(cylinder(0.02, 1.5, STEEL, new THREE.Vector3(x, barY, z), true));
      for (const side of [-1, 1]) group.add(cylinder(0.025, barY, STEEL, new THREE.Vector3(x + side * 0.75, barY / 2, z)));
    } else if (kind === "parallelBars") {
      const x = (hands[0].x + hands[1].x) / 2;
      for (const hand of hands) {
        group.add(cylinder(0.02, 1.0, STEEL, new THREE.Vector3(x, barY, hand.z), true));
        for (const side of [-1, 1]) group.add(cylinder(0.025, barY, STEEL, new THREE.Vector3(x + side * 0.5, barY / 2, hand.z)));
      }
    } else if (kind === "benchBehind" && backToe) {
      const top = backToe.y - 0.03;
      if (top > 0.08) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, top, 0.34), material(WOOD, 0.05));
        bench.position.set(backToe.x - 0.1 * Math.sign(backToe.x || 1), top / 2, backToe.z);
        group.add(bench);
      }
    }
  }
  return group;
}

// Prépare un mouvement : une photographie du personnage par pose (recalée sur le dessin, ou sur les
// poses écrites pour la 3D si le mouvement en a), et ses accessoires. `config` : entrée de
// MOUVEMENTS_3D ; `drawnPoses` : les poses du dessin 2D. Renvoie { snapshots, props } (props : un
// THREE.Group ou null, à ajouter à la scène et à libérer par l'appelant).
export function buildMovement(rig, scale, config, drawnPoses) {
  const poses = config.poses || drawnPoses;
  const base = { facing: config.facing, scale };
  let handsHeight;
  if (config.hang) {
    poseRig(rig, poses[0], { ...base, height: config.hang.feetAboveGround });
    handsHeight = handsCenter(rig).y;
  }
  const optionsFor = (i) => (handsHeight !== undefined ? { ...base, handsHeight } : { ...base, height: config.heights ? config.heights[i] : undefined });
  const snapshots = poses.map((pose, i) => { poseRig(rig, pose, optionsFor(i)); return captureSnapshot(rig); });

  let props = null;
  if (config.props && config.props.length) {
    poseRig(rig, poses[0], optionsFor(0));
    const p = new THREE.Vector3();
    const hands = [rig.arm.left.hand.getWorldPosition(p).clone(), rig.arm.right.hand.getWorldPosition(p).clone()];
    const toes = [rig.leg.left.toe.getWorldPosition(p).clone(), rig.leg.right.toe.getWorldPosition(p).clone()];
    const backToe = (config.facing === "left" ? toes[0].x > toes[1].x : toes[0].x < toes[1].x) ? toes[0] : toes[1];
    props = createProps(config.props, { handsHeight, hands, backToe });
  }
  return { snapshots, props };
}

// Cadrage d'un mouvement : centre et distance de caméra pour que toutes ses poses (et ses
// accessoires) tiennent dans l'image, calculés une fois sur les os principaux de chaque pose.
export function computeFraming(rig, snapshots, props, aspect = 1.5, fovDegrees = 35) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const p = new THREE.Vector3();
  const bones = [rig.head, rig.hips, rig.spine[2], rig.arm.left.hand, rig.arm.right.hand, rig.arm.left.fore, rig.arm.right.fore, rig.leg.left.foot, rig.leg.right.foot, rig.leg.left.toe, rig.leg.right.toe, rig.leg.left.lower, rig.leg.right.lower];
  for (const snapshot of snapshots) {
    applySnapshot(rig, snapshot);
    for (const bone of bones) { bone.getWorldPosition(p); min.min(p); max.max(p); }
    rig.head.getWorldPosition(p); p.y += 0.22; max.max(p); // dessus de la tête
  }
  if (props) { const box = new THREE.Box3().setFromObject(props); min.min(box.min); max.max(box.max); }
  min.y = Math.min(min.y, 0);
  const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, 0);
  const halfHeight = (max.y - min.y) / 2 + 0.2, halfWidth = (max.x - min.x) / 2 + 0.25;
  const t = Math.tan((fovDegrees * Math.PI) / 360);
  const distance = Math.min(8, Math.max(3.4, (halfHeight * 1.08) / t, (halfWidth * 1.08) / (aspect * t)));
  return { center, distance };
}
