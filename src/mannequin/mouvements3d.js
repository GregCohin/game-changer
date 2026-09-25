// Comment chaque mouvement du pantin est joué par le personnage 3D. Les poses viennent du dessin 2D
// (MANNEQUIN_MOVEMENTS) ; ici on ne dit que ce que le dessin ne dit pas : la vue.
//   front : dessin de face (jumping jack, traction…) — le personnage regarde l'écran.
//   right / left : dessin de profil, personnage tourné vers la droite / la gauche de l'écran. Pour
//   un mouvement allongé, c'est ce sens qui décide du ventre ou du dos : tourné du côté de la tête,
//   le personnage est sur le ventre (pompe) ; tourné à l'opposé, sur le dos (abdos).
// Un mouvement absent de cette table (ou dont le personnage ne se charge pas) montre le personnage
// au repos avec un bandeau explicite : jamais une fausse animation.

// --- Poses écrites pour la 3D ---------------------------------------------------------------
// Certains dessins d'origine ne sont pas exploitables tels quels en 3D (jambe avant tendue dans une
// fente, dessin debout pour des dips, pas de barre pour une traction). Pour ceux-là, la pose est
// reconstruite à partir d'angles cohérents : chaque segment est décrit par sa direction (degrés,
// 0 = vers la droite de l'écran, 90 = vers le haut, -90 = vers le bas) et non par des coordonnées
// dessinées à la main. Le recalage n'utilise que les directions.
const LENGTHS = { torso: 0.3, neck: 0.11, thigh: 0.23, shin: 0.23, foot: 0.07, upper: 0.13, fore: 0.12 };
const step = (from, degrees, length) => {
  const a = (degrees * Math.PI) / 180;
  return { x: from.x + Math.cos(a) * length, y: from.y - Math.sin(a) * length };
};
function poseFromAngles({ hip = { x: 0.5, y: 0.5 }, torso = 90, neck = 90, avant, arriere = avant }) {
  const hanche = { ...hip };
  const epaule = step(hanche, torso, LENGTHS.torso);
  const tete = step(epaule, neck, LENGTHS.neck);
  const pose = { tete, cou: { x: (tete.x + epaule.x) / 2, y: (tete.y + epaule.y) / 2 }, epaule, hanche };
  for (const [drawing, limb] of [["avant", avant], ["arriere", arriere]]) {
    const coude = step(epaule, limb.upper, LENGTHS.upper), main = step(coude, limb.fore, LENGTHS.fore);
    const genou = step(hanche, limb.thigh, LENGTHS.thigh), cheville = step(genou, limb.shin, LENGTHS.shin);
    pose[`coude_${drawing}`] = coude; pose[`main_${drawing}`] = main;
    pose[`genou_${drawing}`] = genou; pose[`cheville_${drawing}`] = cheville;
    pose[`pied_${drawing}`] = step(cheville, limb.foot ?? limb.shin, LENGTHS.foot);
  }
  return pose;
}

// Par mouvement : `facing` (voir plus haut) ; facultatif : `poses` (poses écrites pour la 3D, à la
// place du dessin), `heights` (hauteur du point le plus bas au-dessus du sol pour chaque pose, en
// mètres — sauts et plongeons), `hang` (suspension : mains accrochées à une barre, pieds à
// `feetAboveGround` m du sol dans la première pose) et `props` (accessoires à afficher).
export const MOUVEMENTS_3D = {
  reference: { facing: "front" },
  pompe: { facing: "right" },
  abdos: { facing: "left" },
  squat: { facing: "right" },
  fente: { facing: "right" },
  gainage: { facing: "right" },
  grimpeur: { facing: "right" },
  etoile: { facing: "front" },
  pont_fessier: { facing: "left" },
  traction: {
    facing: "front", hang: { feetAboveGround: 0.35 }, props: ["bar"],
    poses: [
      poseFromAngles({ avant: { upper: 72, fore: 78, thigh: -86, shin: -86 }, arriere: { upper: 108, fore: 102, thigh: -94, shin: -94 } }),
      poseFromAngles({ avant: { upper: -50, fore: 95, thigh: -86, shin: -80 }, arriere: { upper: -130, fore: 85, thigh: -94, shin: -100 } }),
    ],
  },
  gainage_lateral: { facing: "front" },
  sortie_aerienne: { facing: "front", heights: [0, 0.3] },
  une_contre_un_gardien: { facing: "front" },
  frappe_but: { facing: "right" },
  tacle_glisse: {
    facing: "left",
    poses: [
      poseFromAngles({ torso: 25, neck: 40, avant: { upper: -20, fore: -60, thigh: 170, shin: 175 }, arriere: { upper: 60, fore: 70, thigh: 215, shin: 110 } }),
    ],
  },
  fente_laterale: { facing: "front" },
  rowing: { facing: "right" },
  reception_basse: { facing: "right" },
  renvoi_main: { facing: "right" },
  tete_football: { facing: "right" },
  controle_oriente: { facing: "right" },
  dips: {
    facing: "right", hang: { feetAboveGround: 0.3 }, props: ["parallelBars"],
    poses: [
      poseFromAngles({ torso: 88, avant: { upper: -95, fore: -95, thigh: -100, shin: 170 } }),
      poseFromAngles({ torso: 70, neck: 78, avant: { upper: 200, fore: -25, thigh: -100, shin: 170 } }),
    ],
  },
  superman: { facing: "right" },
  degagement_pied: { facing: "right" },
  repli_defensif: { facing: "front" },
  passe: { facing: "right" },
  volee: { facing: "right" },
  squat_saute: { facing: "right" },
  developpe_militaire: { facing: "front" },
  parade_haute: { facing: "front" },
  remise_pied: { facing: "right" },
  dribble_crochet: { facing: "right" },
  sprint: { facing: "right" },
  developpe_couche: { facing: "left" },
  squat_bulgare: {
    facing: "right", props: ["benchBehind"],
    poses: [
      poseFromAngles({ hip: { x: 0.5, y: 0.5 }, avant: { upper: -100, fore: -95, thigh: -88, shin: -90 }, arriere: { upper: -100, fore: -95, thigh: -100, shin: 190 } }),
      poseFromAngles({ hip: { x: 0.5, y: 0.62 }, avant: { upper: -100, fore: -95, thigh: -15, shin: -100 }, arriere: { upper: -100, fore: -95, thigh: -92, shin: 147 } }),
    ],
  },
  souleve_terre: { facing: "right" },
  gainage_rotation: { facing: "right" },
  position_base_gardien: { facing: "right" },
  rattrapage_rebond: { facing: "right" },
  talonnade: { facing: "right" },
  remise_en_jeu: { facing: "right" },
  fente_arriere: {
    facing: "right",
    poses: [
      poseFromAngles({ avant: { upper: -95, fore: -90, thigh: -88, shin: -90 }, arriere: { upper: -95, fore: -90, thigh: -92, shin: -90 } }),
      poseFromAngles({ hip: { x: 0.5, y: 0.6 }, avant: { upper: -95, fore: -90, thigh: -10, shin: -95 }, arriere: { upper: -95, fore: -90, thigh: -108, shin: -170 } }),
    ],
  },
  montees_genoux: { facing: "right" },
  renvoi_poing: { facing: "right" },
  communication_defensive: { facing: "right" },
  conduite_balle: { facing: "right" },
  marquage_individuel: { facing: "left" },
  plongeon_gardien: { facing: "right", heights: [0, 0, 0.45] },
};

// Mouvements couverts par une animation toute faite plutôt que par les poses dessinées.
export const CLIPS_3D = { sprint: { clip: "Sprint_Loop", yaw: Math.PI / 2 } };
