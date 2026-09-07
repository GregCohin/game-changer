// Contenu de démarrage fourni avec l'application : les exercices pré-construits (banque de
// départ, toutes fédérations/formats/tranches d'âge confondus) et quelques exemples de séances
// types qui les enchaînent. Pure donnée + les générateurs de schéma qui la construisent — aucune
// logique d'interface ici, rien d'autre dans l'app n'en dépend à part les deux exports en bas
// de fichier (ALL_STARTER_EXERCISES, STARTER_SESSIONS).
//
// Extrait de App.jsx (refactor de séparation des fichiers, sans aucun changement de comportement).

import { FORMATION_LAYOUTS } from "./formations.js";

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const SYSTEM_POSITIONAL_NOTES = {
  "4-3-3": "ligne de 4, triangle médian (souvent 1 sentinelle + 2 relayeurs), ailiers écartés",
  "4-4-2": "ligne de 4, ligne de 4 au milieu compacte, deux attaquants en soutien mutuel",
  "4-2-3-1": "ligne de 4, double pivot bas, meneur devant les 2 pivots, ailiers rentrants",
  "3-5-2": "ligne de 3 centraux, pistons montants sur les côtés, triangle médian, deux attaquants",
  "5-3-2": "ligne de 5 (3 centraux + 2 pistons bas), triangle médian, deux attaquants",
  "3-4-3": "ligne de 3 centraux, ligne de 4 au milieu, trio offensif large",
  "4-1-4-1": "ligne de 4, sentinelle seule devant la défense, ligne de 4 au-dessus, un attaquant",
  "4-3-1-2": "ligne de 4, triangle médian bas, meneur en soutien, deux attaquants",
  "3-4-1-2": "ligne de 3 centraux, ligne de 4 au milieu, meneur en soutien, deux attaquants",
  "5-4-1": "ligne de 5, ligne de 4 au milieu compacte, un seul attaquant en pointe",
};

// Génération de schémas tactiques — convention : x = axe but-à-but (0 = but gauche, 1 = but droit), y = axe touche-à-touche (0 = haut, 1 = bas).
function pel(type, x, y, extra) { return { id: newId(), type, x, y, ...(extra || {}) }; }
function zel(x1, y1, x2, y2, color) { return { id: newId(), type: "zone", x1, y1, x2, y2, color: color || "#E3B23C" }; }
function ael(type, x1, y1, x2, y2, extra) { return { id: newId(), type, x1, y1, x2, y2, color: "#EEF3EC", ...(extra || {}) }; }

function genFromFormation(system) {
  const layout = FORMATION_LAYOUTS[system] || FORMATION_LAYOUTS["4-3-3"];
  return layout.map((p) => pel(p.role === "Gardien" ? "keeper" : "playerA", Math.round(p.y * 100) / 100, Math.round(p.x * 100) / 100));
}

// nbA attaque de gauche à droite vers une zone/but à droite ; nbB défend. hasGoal/hasKeeper ajoutent le but droit.
// Répartit n joueurs en 1 à 3 lignes de profondeur autour de baseX (comme une vraie organisation d'équipe), plutôt qu'une seule colonne.
function teamShape(n, baseX, depthDir) {
  const positions = [];
  const nbRows = n <= 4 ? 1 : n <= 8 ? 2 : 3;
  const perRow = [];
  let remaining = n;
  for (let r = 0; r < nbRows; r++) { const count = Math.round(remaining / (nbRows - r)); perRow.push(count); remaining -= count; }
  const rowDepthSpread = nbRows <= 1 ? [0] : nbRows === 2 ? [-0.055, 0.055] : [-0.09, 0, 0.09];
  perRow.forEach((count, r) => {
    for (let i = 0; i < count; i++) {
      const y = count <= 1 ? 0.5 : 0.16 + (0.68 * i) / (count - 1);
      positions.push({ x: baseX + rowDepthSpread[r] * depthDir, y });
    }
  });
  return positions;
}

function genVs(nbA, nbB, opts) {
  opts = opts || {};
  const els = [];
  const baseXA = opts.xA != null ? opts.xA : 0.22;
  const baseXB = opts.xB != null ? opts.xB : 0.55;
  teamShape(nbA, baseXA, 1).forEach((p, i) => els.push(pel("playerA", p.x, p.y, { number: i + 1 })));
  teamShape(nbB, baseXB, -1).forEach((p, i) => els.push(pel("playerB", p.x, p.y, { number: i + 1 })));
  if (opts.hasKeeper) els.push(pel("keeper", 0.9, 0.5));
  els.push(pel("ball", baseXA + 0.04, 0.5));
  if (opts.zone) els.push(zel(opts.zone[0], opts.zone[1], opts.zone[2], opts.zone[3]));
  return els;
}

// Rondo/possession : joueurs en cercle autour d'une zone centrale, défenseurs à l'intérieur.
function genRondo(nbOuter, nbInner) {
  const els = [];
  for (let i = 0; i < nbOuter; i++) {
    const angle = (2 * Math.PI * i) / nbOuter - Math.PI / 2;
    els.push(pel("playerA", 0.5 + 0.32 * Math.cos(angle), 0.5 + 0.38 * Math.sin(angle), { number: i + 1 }));
  }
  for (let i = 0; i < nbInner; i++) {
    const angle = (2 * Math.PI * i) / Math.max(nbInner, 1) - Math.PI / 2 + 0.4;
    els.push(pel("playerB", 0.5 + 0.1 * Math.cos(angle) * (nbInner > 1 ? 1 : 0), 0.5 + 0.1 * Math.sin(angle) * (nbInner > 1 ? 1 : 0), { number: i + 1 }));
  }
  els.push(pel("ball", 0.5, 0.12));
  els.push(zel(0.18, 0.12, 0.82, 0.88));
  return els;
}

// Ligne défensive (nbDef) face à une ligne d'attaquants qui progresse depuis la droite.
function genLine(nbDef, nbAtt) {
  const els = [];
  teamShape(nbDef, 0.35, -1).forEach((p, i) => els.push(pel("playerB", p.x, p.y, { number: i + 1 })));
  teamShape(nbAtt, 0.65, 1).forEach((p, i) => els.push(pel("playerA", p.x, p.y, { number: i + 1 })));
  els.push(pel("keeper", 0.1, 0.5));
  els.push(pel("ball", 0.62, 0.5));
  els.push(ael("arrowMove", 0.65, 0.5, 0.45, 0.5));
  return els;
}

// Finition : attaquants proches de la surface droite, ballon(s) en approche.
function genShooting(nbAtt, opts) {
  opts = opts || {};
  const els = [];
  const spreadY = (n, i) => (n <= 1 ? 0.5 : 0.32 + (0.36 * i) / (n - 1));
  for (let i = 0; i < nbAtt; i++) els.push(pel("playerA", 0.68, spreadY(nbAtt, i), { number: i + 1 }));
  els.push(pel("keeper", 0.9, 0.5));
  els.push(pel("ball", opts.ballX != null ? opts.ballX : 0.55, opts.ballY != null ? opts.ballY : 0.5));
  if (opts.arrow) els.push(ael("arrowPass", opts.ballX != null ? opts.ballX : 0.55, opts.ballY != null ? opts.ballY : 0.5, 0.75, 0.5));
  return els;
}

function genCorner(side) {
  const y = side === "haut" ? 0.05 : 0.95;
  const els = [];
  els.push(pel("ball", 0.95, y));
  els.push(pel("playerA", 0.95, y, { number: 1 }));
  const spots = [[0.85, 0.35], [0.87, 0.5], [0.85, 0.65], [0.8, 0.45], [0.8, 0.55], [0.75, 0.5]];
  spots.forEach((s, i) => els.push(pel("playerA", s[0], s[1], { number: i + 2 })));
  els.push(pel("playerB", 0.87, 0.4)); els.push(pel("playerB", 0.87, 0.6)); els.push(pel("playerB", 0.82, 0.5));
  els.push(pel("keeper", 0.9, 0.5));
  return els;
}

function genFreeKick(zone) {
  const x = zone === "def" ? 0.3 : zone === "med" ? 0.5 : 0.75;
  const els = [];
  els.push(pel("ball", x, 0.5));
  els.push(pel("playerA", x - 0.06, 0.5, { number: 1 }));
  if (zone === "off") {
    els.push(pel("playerB", x + 0.05, 0.44)); els.push(pel("playerB", x + 0.05, 0.48)); els.push(pel("playerB", x + 0.05, 0.52)); els.push(pel("playerB", x + 0.05, 0.56));
    els.push(pel("playerA", 0.85, 0.4)); els.push(pel("playerA", 0.87, 0.55));
    els.push(pel("keeper", 0.94, 0.5));
  } else {
    els.push(pel("keeper", 0.06, 0.5));
    els.push(pel("playerA", x - 0.15, 0.42)); els.push(pel("playerA", x - 0.15, 0.58));
  }
  return els;
}

function genThrowIn(zone) {
  const x = zone === "def" ? 0.22 : zone === "med" ? 0.5 : 0.78;
  const els = [];
  els.push(pel("playerA", x, 0.03, { number: 1 }));
  els.push(pel("ball", x, 0.03));
  els.push(pel("playerA", x + 0.06, 0.14, { number: 2 }));
  els.push(pel("playerA", x - 0.08, 0.2, { number: 3 }));
  els.push(pel("playerB", x + 0.04, 0.2)); els.push(pel("playerB", x - 0.04, 0.24));
  return els;
}

function genPenalty() {
  return [pel("ball", 0.79, 0.5), pel("playerA", 0.7, 0.5, { number: 1 }), pel("keeper", 0.94, 0.5)];
}

// Slalom de plots pour conduite de balle / dribble, en ligne de gauche à droite.
function genSlalom(nbCones) {
  const els = [];
  els.push(pel("playerA", 0.08, 0.5, { number: 1 }));
  els.push(pel("ball", 0.13, 0.5));
  for (let i = 0; i < nbCones; i++) els.push(pel("cone", 0.22 + (0.6 * i) / Math.max(nbCones - 1, 1), 0.5 + (i % 2 === 0 ? -0.06 : 0.06)));
  els.push(ael("arrowDribble", 0.13, 0.5, 0.88, 0.5, { curved: true, cx: 0.5, cy: 0.35 }));
  return els;
}

// Grille de passes : joueurs en carré/losange, ballon au centre.
function genPassingGrid(nbPlayers) {
  const els = [];
  for (let i = 0; i < nbPlayers; i++) {
    const angle = (2 * Math.PI * i) / nbPlayers - Math.PI / 2;
    els.push(pel("playerA", 0.5 + 0.28 * Math.cos(angle), 0.5 + 0.36 * Math.sin(angle), { number: i + 1 }));
  }
  els.push(pel("ball", 0.5, 0.5));
  els.push(ael("arrowPass", 0.5 + 0.28 * Math.cos(-Math.PI / 2), 0.5 + 0.36 * Math.sin(-Math.PI / 2), 0.5 + 0.28 * Math.cos(-Math.PI / 2 + (2 * Math.PI) / nbPlayers), 0.5 + 0.36 * Math.sin(-Math.PI / 2 + (2 * Math.PI) / nbPlayers)));
  return els;
}

// Couloirs de sprint parallèles avec plots de départ/arrivée.
function genSprintLanes(nbLanes) {
  const els = [];
  for (let i = 0; i < nbLanes; i++) {
    const y = nbLanes <= 1 ? 0.5 : 0.2 + (0.6 * i) / (nbLanes - 1);
    els.push(pel("playerA", 0.12, y, { number: i + 1 }));
    els.push(pel("cone", 0.12, y));
    els.push(pel("cone", 0.85, y));
    els.push(ael("arrowMove", 0.15, y, 0.82, y));
  }
  return els;
}

// Parcours d'agilité : plots en losange/étoile pour changements de direction.
function genAgilityPattern() {
  const els = [];
  els.push(pel("playerA", 0.15, 0.5, { number: 1 }));
  const points = [[0.35, 0.3], [0.5, 0.5], [0.35, 0.7], [0.65, 0.3], [0.5, 0.5], [0.65, 0.7]];
  points.forEach((p) => els.push(pel("cone", p[0], p[1])));
  els.push(ael("arrowMove", 0.15, 0.5, 0.35, 0.3));
  return els;
}

// Frappe/technique de tir isolée, sans opposition tactique — accent sur le geste.
function genTechniqueShot(opts) {
  opts = opts || {};
  const els = [];
  els.push(pel("playerA", 0.6, 0.5, { number: 1 }));
  els.push(pel("ball", 0.65, 0.5));
  els.push(pel("keeper", 0.9, 0.5));
  if (opts.cones) els.push(pel("cone", 0.75, 0.35), pel("cone", 0.75, 0.65));
  return els;
}

// Geste de dribble en un contre un : attaquant, ballon, et un plot/défenseur passif juste en face, au moment de la feinte.
function genDribbleMove() {
  return [
    pel("playerA", 0.35, 0.5, { number: 1 }),
    pel("ball", 0.42, 0.5),
    pel("cone", 0.55, 0.5),
    ael("arrowDribble", 0.42, 0.5, 0.7, 0.5, { curved: true, cx: 0.55, cy: 0.35 }),
  ];
}

const STARTER_EXERCISES = [
  ...Object.entries(SYSTEM_POSITIONAL_NOTES).map(([system, note]) => ({
    name: `Rondo positionnel ${system}`, gameplanSection: "system", gameplanChoice: system,
    objectif: "Intérioriser les repères de position du système déclaré", duree: 15, nbJoueurs: "11 (+ 2 joueurs au pressing)",
    materiel: "Plots pour délimiter les zones, chasubles",
    description: `Les 11 joueurs se placent selon le ${system} (repères de zone : ${note}), chacun dans sa zone délimitée par des plots. Jeu de conservation à thème (ex. 8 touches max) contre 2 joueurs qui pressent en rotation. Objectif : que chacun retrouve rapidement sa zone après un mouvement, et comprenne les distances de soutien avec ses partenaires les plus proches dans le système. Cet exercice s'adapte à n'importe quel système en ajustant simplement les plots de zone — la mécanique de conservation reste la même.`,
    diagram: genFromFormation(system),
  })),
  {
    name: "Sortie de balle à 4 contre pressing à 3", gameplanSection: "offensive.construction", gameplanChoice: "Construction courte depuis le gardien",
    objectif: "Dépasser la première ligne de pressing en conservant le ballon", duree: 20, nbJoueurs: "4 + gardien contre 3 pressants",
    materiel: "Plots, mini-buts ou ligne à franchir",
    description: "Le gardien et 4 défenseurs doivent construire et franchir une ligne de pressing à 3 joueurs. Une franchise de ligne en conservant le ballon = point. Variante : limiter à 2 touches pour accélérer la circulation, ou autoriser le gardien à sortir comme relais.",
    diagram: genVs(4, 3, { hasKeeper: true, xA: 0.15, xB: 0.45 }),
  },
  {
    name: "Lecture du pressing, court ou long", gameplanSection: "offensive.construction", gameplanChoice: "Construction mixte (courte puis longue selon pression)",
    objectif: "Apprendre à choisir entre jeu court et jeu long selon la pression subie", duree: 20, nbJoueurs: "6 (+gardien) contre pressing variable (3 à 5 joueurs)",
    materiel: "Plots, chasubles, ballons",
    description: "Le nombre de pressants change toutes les 3-4 séquences (3, puis 5, puis 4) sans prévenir. En dessous d'un seuil de pression, l'équipe doit construire court ; au-dessus, elle doit basculer sur un jeu long ciblé. Débriefer après chaque séquence sur la pertinence du choix fait.",
    diagram: genVs(6, 4, { hasKeeper: true, xA: 0.15, xB: 0.5 }),
  },
  {
    name: "Jeu long ciblé sur point de fixation", gameplanSection: "offensive.construction", gameplanChoice: "Jeu direct/long systématique",
    objectif: "Automatiser la relance longue vers un point de fixation et son soutien immédiat", duree: 15, nbJoueurs: "Défense + gardien contre attaque avec un pivot cible",
    materiel: "Cages, ballons, plots",
    description: "Le gardien ou un défenseur relance systématiquement long vers un attaquant pivot qui doit remiser en une touche vers un soutien arrivant en soutien rapide. Travailler la qualité de la frappe longue (trajectoire, puissance) autant que le timing du soutien.",
    diagram: genVs(4, 4, { hasKeeper: true, xA: 0.2, xB: 0.55 }),
  },
  {
    name: "Relance adaptée selon le profil de pressing adverse", gameplanSection: "offensive.construction", gameplanChoice: "Relance variable selon l'adversaire",
    objectif: "Préparer plusieurs plans de relance selon le pressing rencontré en match", duree: 20, nbJoueurs: "Effectif complet en 2 groupes",
    materiel: "Plots, chasubles pour simuler différents pressings adverses",
    description: "Faire tourner 2-3 profils de pressing différents (individuel homme à homme, collectif à déclenchement, pressing orienté sur un côté) et demander à l'équipe qui construit d'identifier le profil puis d'adapter sa relance en conséquence. Utile la semaine d'un match contre un adversaire au profil connu.",
    diagram: genVs(6, 5, { hasKeeper: true, xA: 0.15, xB: 0.5 }),
  },
  {
    name: "Sortie de balle en losange, double pivot", gameplanSection: "offensive.construction", gameplanChoice: "Construction en losange (double pivot)",
    objectif: "Utiliser un double pivot pour offrir des solutions de relance permanentes", duree: 20, nbJoueurs: "5 + gardien contre pressing à 3-4",
    materiel: "Plots, ballons",
    description: "Construction organisée en losange avec deux milieux relayeurs bas qui alternent leurs appuis pour toujours offrir une solution au porteur. Travailler les déplacements en miroir des deux pivots (l'un se rapproche quand l'autre s'écarte) pour ne jamais se marcher dessus.",
    diagram: genVs(5, 4, { hasKeeper: true, xA: 0.15, xB: 0.45 }),
  },
  {
    name: "Construction prioritaire par les latéraux", gameplanSection: "offensive.construction", gameplanChoice: "Sortie de balle prioritaire par les latéraux",
    objectif: "Faire des latéraux les premiers relais de la construction", duree: 20, nbJoueurs: "6 + gardien contre pressing à 4",
    materiel: "Plots, ballons",
    description: "Les centraux ont pour consigne prioritaire de chercher les latéraux largement écartés avant toute autre option, pour étirer le bloc adverse horizontalement. Travailler l'ouverture rapide du jeu et la disponibilité permanente des latéraux sur la largeur.",
    diagram: genVs(6, 4, { hasKeeper: true, xA: 0.15, xB: 0.5 }),
  },
  {
    name: "Débordements et centres en supériorité 3v2", gameplanSection: "offensive.progression", gameplanChoice: "Jeu dans les couloirs (débordements)",
    gameplanLinks: [{ section: "offensive.finition", choice: "Jeu de combinaisons et centres" }],
    objectif: "Exploiter la largeur pour créer des situations de centre", duree: 20, nbJoueurs: "3 attaquants contre 2 défenseurs, par couloir",
    materiel: "Plots, ballons, cages",
    description: "Un ailier et deux soutiens attaquent une zone excentrée à 3 contre 2. L'objectif est de fixer puis déborder pour centrer, avec un ou deux joueurs qui arrivent dans la surface pour conclure. Alterner les côtés, chronométrer la vitesse d'exécution.",
    diagram: genVs(3, 2, { hasGoal: true, hasKeeper: true, xA: 0.5, xB: 0.75 }),
  },
  {
    name: "Conservation patiente au sol", gameplanSection: "offensive.progression", gameplanChoice: "Jeu au sol, construction patiente",
    objectif: "Progresser par passes courtes successives sans précipitation", duree: 20, nbJoueurs: "8 contre 6 en zone délimitée",
    materiel: "Plots, chasubles",
    description: "Jeu de possession en supériorité où l'équipe en possession doit atteindre un nombre minimum de passes (ex. 10) avant d'être autorisée à progresser vers la zone de marque. Sanctionner les pertes de balle précipitées par un temps de récupération pour l'adversaire.",
    diagram: genVs(8, 6, { zone: [0.15, 0.1, 0.85, 0.9] }),
  },
  {
    name: "Combinaisons courtes dans l'axe", gameplanSection: "offensive.progression", gameplanChoice: "Jeu dans l'axe (combinaisons courtes)",
    objectif: "Progresser par combinaisons rapprochées au centre du jeu", duree: 20, nbJoueurs: "5 contre 5 en couloir central resserré",
    materiel: "Plots pour délimiter un couloir central étroit",
    description: "Jeu à effectif réduit dans un couloir central resserré, qui oblige les combinaisons courtes (une-deux, remises, appuis) plutôt que le jeu large. Travailler la vitesse d'exécution et la prise d'information avant de recevoir.",
    diagram: genVs(5, 5, { zone: [0.3, 0.2, 0.7, 0.8] }),
  },
  {
    name: "Jeu direct vers l'attaquant de pointe", gameplanSection: "offensive.progression", gameplanChoice: "Jeu direct vers l'attaquant de pointe",
    objectif: "Automatiser la remise du pivot pour faire progresser rapidement l'équipe", duree: 15, nbJoueurs: "6 contre 5 avec un pivot cible fixe",
    materiel: "Plots, ballons",
    description: "Un attaquant pivot reçoit systématiquement en première intention et doit remiser vers un soutien qui arrive en profondeur ou en soutien court selon la lecture du jeu. Varier le sens et la vitesse des soutiens pour rendre l'exercice imprévisible pour le pivot.",
    diagram: genVs(6, 5, { hasGoal: true, hasKeeper: true, xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Transition rapide après récupération, priorité progression", gameplanSection: "offensive.progression", gameplanChoice: "Contre-attaque rapide après récupération",
    objectif: "Progresser rapidement vers le but dès la récupération du ballon", duree: 15, nbJoueurs: "6 contre 6, départ sur perte de balle simulée",
    materiel: "Plots, cages, chasubles",
    description: "Départ sur une récupération de balle en zone médiane. L'équipe qui récupère doit chercher la profondeur en un minimum de touches, avant que l'adversaire ne se réorganise. Distinct de l'exercice de transition offensive pur : ici l'accent est mis sur le chemin de progression choisi, pas seulement la vitesse d'exécution.",
    diagram: genVs(6, 6, { hasKeeper: true, xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Triangles de soutien multiples", gameplanSection: "offensive.progression", gameplanChoice: "Jeu en triangle (soutiens courts multiples)",
    objectif: "Toujours offrir plusieurs angles de soutien au porteur de balle", duree: 20, nbJoueurs: "6 contre 4 en possession",
    materiel: "Plots, chasubles",
    description: "Jeu de possession où chaque porteur doit avoir au minimum 2 soutiens formant un triangle avec lui à tout moment. Un coach peut siffler pour vérifier que les triangles sont bien formés et corriger les positionnements en temps réel.",
    diagram: genVs(6, 4, { zone: [0.2, 0.15, 0.8, 0.85] }),
  },
  {
    name: "Chevauchements latéral-ailier", gameplanSection: "offensive.progression", gameplanChoice: "Chevauchements latéraux systématiques",
    objectif: "Automatiser le timing de chevauchement entre latéral et ailier", duree: 20, nbJoueurs: "4 attaquants contre 3 défenseurs, par couloir",
    materiel: "Plots, ballons, cages",
    description: "Travail répété du mouvement de chevauchement (overlap) : l'ailier fixe puis remet au latéral qui monte dans son dos pour centrer ou prolonger l'action. Insister sur le timing de départ du latéral, ni trop tôt (hors-jeu) ni trop tard (perte de la supériorité).",
    diagram: genVs(4, 3, { hasGoal: true, hasKeeper: true, xA: 0.5, xB: 0.75 }),
  },
  {
    name: "Ateliers tournants de finition dans la surface", gameplanSection: "offensive.finition", gameplanChoice: "Recherche systématique de la surface",
    objectif: "Multiplier les répétitions de frappe en situation réaliste", duree: 20, nbJoueurs: "8 à 12, répartis sur 3 ateliers",
    materiel: "Cages, ballons, plots, chasubles",
    description: "Trois ateliers en rotation toutes les 5-6 minutes : (1) centre et reprise de volée, (2) une-deux avec un appui puis frappe, (3) remise en retrait et frappe de première intention. Chaque atelier débouche systématiquement sur une conclusion dans la surface.",
    diagram: genShooting(3, { arrow: true }),
  },
  {
    name: "Un-contre-un face au gardien", gameplanSection: "offensive.finition", gameplanChoice: "Recherche du un-contre-un",
    objectif: "Répéter la prise de décision et l'exécution technique en duel face au gardien", duree: 15, nbJoueurs: "1 attaquant contre 1 défenseur + gardien, en rotation",
    materiel: "Cage, ballons, plots",
    description: "Duels répétés attaquant contre défenseur avec départ variable (de face, de côté, en course). Travailler les feintes de corps, le crochet et la finition dans des situations variées de un-contre-un plutôt que dans un contexte de match ouvert.",
    diagram: genVs(1, 1, { hasKeeper: true, hasGoal: true, xA: 0.58, xB: 0.72 }),
  },
  {
    name: "Combinaisons débouchant sur un centre", gameplanSection: "offensive.finition", gameplanChoice: "Jeu de combinaisons et centres",
    gameplanLinks: [{ section: "offensive.progression", choice: "Jeu dans les couloirs (débordements)" }],
    objectif: "Enchaîner une combinaison collective jusqu'au centre et à la finition", duree: 20, nbJoueurs: "5 contre 4 dans le dernier tiers",
    materiel: "Plots, cages, ballons",
    description: "Situations de jeu dans le dernier tiers où l'équipe attaquante doit enchaîner au moins une combinaison (une-deux, remise) avant de centrer. Varier les zones de centre (proche, retrait, second poteau) et les types d'appels dans la surface.",
    diagram: genVs(5, 4, { hasGoal: true, hasKeeper: true, xA: 0.55, xB: 0.75 }),
  },
  {
    name: "Frappes de loin en rafale", gameplanSection: "offensive.finition", gameplanChoice: "Tirs de loin privilégiés",
    objectif: "Développer la qualité et la confiance sur les frappes à distance", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Cage, nombreux ballons, plots pour marquer les distances de frappe",
    description: "Séries de frappes depuis l'extérieur de la surface, avec variation de la distance et de l'angle. Ajouter une contrainte de contrôle orienté avant frappe pour rapprocher l'exercice d'une situation de match plutôt qu'un travail de tir statique.",
    diagram: genShooting(1, { ballX: 0.45, ballY: 0.5 }),
  },
  {
    name: "Appels et courses dans le dos de la défense", gameplanSection: "offensive.finition", gameplanChoice: "Course dans le dos de la défense",
    objectif: "Automatiser le timing d'appel en profondeur et la passe qui l'accompagne", duree: 15, nbJoueurs: "3 attaquants contre une ligne défensive de 3-4",
    materiel: "Plots pour marquer la ligne défensive, cage, ballons",
    description: "Une ligne défensive avance et recule à intervalle irrégulier pendant qu'un passeur cherche à trouver un attaquant qui déclenche sa course au bon moment pour ne pas être hors-jeu. Travailler autant le timing de l'appelant que la précision de la passe en profondeur.",
    diagram: genVs(3, 4, { hasGoal: true, hasKeeper: true, xA: 0.55, xB: 0.72 }),
  },
  {
    name: "Frappes enroulées depuis les côtés", gameplanSection: "offensive.finition", gameplanChoice: "Frappes enroulées excentrées",
    objectif: "Travailler la finition enroulée depuis des positions excentrées de la surface", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Cage, ballons, plots pour marquer les zones de frappe excentrées",
    description: "Séries de frappes depuis les côtés de la surface (angle fermé), avec consigne d'enrouler la trajectoire vers la lucarne opposée plutôt que de chercher la puissance pure. Ajouter une course de replacement avant la frappe pour se rapprocher d'une situation de match.",
    diagram: genShooting(1, { ballX: 0.62, ballY: 0.22 }),
  },
  {
    name: "Maintien du bloc médian face à progression", gameplanSection: "defensive.hauteurBloc", gameplanChoice: "Bloc médian",
    objectif: "Rester compact sans se faire étirer par la progression adverse", duree: 20, nbJoueurs: "8 défenseurs contre 6 attaquants + 2 jokers",
    materiel: "Plots pour marquer les lignes du bloc, chasubles",
    description: "Une équipe en infériorité tente de progresser vers le but ; le bloc défensif doit garder ses lignes resserrées (distance maximale fixée entre chaque ligne) et ne monter/descendre que collectivement. Un coach ou un joueur extérieur signale les écarts trop importants entre les lignes.",
    diagram: genLine(8, 6),
  },
  {
    name: "Piège du hors-jeu en bloc haut", gameplanSection: "defensive.hauteurBloc", gameplanChoice: "Bloc haut (pressing tout terrain)",
    objectif: "Monter le bloc collectivement pour presser haut et piéger le hors-jeu", duree: 20, nbJoueurs: "4-5 défenseurs contre attaquants en soutien",
    materiel: "Plots pour marquer la ligne de hors-jeu, chasubles",
    description: "La ligne défensive démarre haute (proche de la médiane) et doit monter comme un seul homme dès que le ballon recule ou qu'une passe latérale/en retrait est jouée côté adverse. Sanctionner les montées désynchronisées (un joueur qui monte seul) en signalant le hors-jeu manqué.",
    diagram: genLine(4, 4),
  },
  {
    name: "Regroupement collectif en bloc bas", gameplanSection: "defensive.hauteurBloc", gameplanChoice: "Bloc bas (regroupé)",
    objectif: "Densifier la zone devant le but sans se faire déborder par le nombre", duree: 20, nbJoueurs: "8 défenseurs contre 8 attaquants sur le dernier tiers",
    materiel: "Plots pour délimiter la zone de regroupement, chasubles",
    description: "L'équipe défensive se regroupe densément devant sa surface, laissant sciemment de l'espace loin du but. Travailler les concessions acceptées (perte sur les extérieurs) contre celles refusées (l'axe et la surface), et la discipline collective pour ne pas sortir individuellement du bloc.",
    diagram: genLine(8, 8),
  },
  {
    name: "Défense basse totale sous étranglement", gameplanSection: "defensive.hauteurBloc", gameplanChoice: "Bloc très bas (défense basse totale)",
    objectif: "Tenir un score ou une situation en resserrant au maximum autour du but", duree: 15, nbJoueurs: "10 défenseurs (quasi effectif complet) contre attaque libre",
    materiel: "Plots, chasubles",
    description: "Situation de fin de match simulée où l'équipe défend à 10 joueurs quasiment tous regroupés dans et autour de la surface. Travailler la communication constante, les dégagements collectifs sur les ballons chauds, et la discipline pour ne jamais laisser un intervalle central.",
    diagram: genLine(10, 6),
  },
  {
    name: "Changement de hauteur de bloc sur signal", gameplanSection: "defensive.hauteurBloc", gameplanChoice: "Variable selon l'adversaire",
    objectif: "Passer collectivement d'une hauteur de bloc à une autre selon un signal donné", duree: 20, nbJoueurs: "8 à 10 défenseurs face à une attaque",
    materiel: "Plots pour marquer 2-3 hauteurs de bloc possibles, chasubles",
    description: "Le coach (ou un joueur désigné) donne un signal (score fictif annoncé, temps de jeu restant) qui impose un changement immédiat de hauteur de bloc à toute l'équipe. Travailler la rapidité de réaction collective et la clarté de la communication du signal sur le terrain.",
    diagram: genLine(9, 6),
  },
  {
    name: "Déclenchement de pressing sur passe latérale", gameplanSection: "defensive.pressing", gameplanChoice: "Pressing collectif à déclenchement",
    objectif: "Reconnaître le signal et presser à plusieurs au bon moment", duree: 20, nbJoueurs: "8 contre 8 sur demi-terrain",
    materiel: "Plots pour délimiter la zone, chasubles",
    description: "Jeu à thème sur demi-terrain : dès qu'une passe latérale ou un contrôle orienté vers l'extérieur est détecté, 2 à 3 joueurs déclenchent un pressing coordonné pour couper les lignes de passe. Insister sur la lecture collective du signal plutôt que sur une course individuelle isolée.",
    diagram: genVs(8, 8, { zone: [0.05, 0.05, 0.55, 0.95] }),
  },
  {
    name: "Suivi individuel homme à homme sur tout le terrain", gameplanSection: "defensive.pressing", gameplanChoice: "Pressing individuel homme à homme",
    gameplanLinks: [{ section: "defensive.organisation", choice: "Marquage individuel strict" }],
    objectif: "Ne jamais lâcher son vis-à-vis, où qu'il aille sur le terrain", duree: 20, nbJoueurs: "8 contre 8, chaque joueur avec un adversaire désigné",
    materiel: "Chasubles numérotées pour désigner les duels, plots",
    description: "Chaque joueur reçoit un adversaire direct à suivre partout, y compris hors de sa zone habituelle. Jeu libre où l'objectif défensif est de ne jamais perdre son vis-à-vis de vue. Travailler la communication pour gérer les croisements de trajectoires entre plusieurs duels.",
    diagram: genVs(8, 8),
  },
  {
    name: "Pressing orienté, pièges sur le côté", gameplanSection: "defensive.pressing", gameplanChoice: "Pressing orienté (pièges sur les côtés)",
    objectif: "Orienter volontairement le jeu adverse vers un couloir pour y piéger le porteur", duree: 20, nbJoueurs: "8 contre 8 sur demi-terrain avec couloirs marqués",
    materiel: "Plots pour marquer les couloirs, chasubles",
    description: "Le pressing initial ferme volontairement le jeu central et laisse une ouverture apparente sur le côté. Dès que le ballon y est joué, plusieurs joueurs referment le piège pour couper tout retour possible. Travailler la coordination entre le joueur qui oriente et ceux qui referment.",
    diagram: genVs(8, 8, { zone: [0.05, 0.05, 0.55, 0.95] }),
  },
  {
    name: "Pressing différé, laisser venir puis presser", gameplanSection: "defensive.pressing", gameplanChoice: "Pressing différé (laisser venir puis presser)",
    objectif: "Attendre le bon moment avant de déclencher, plutôt que presser immédiatement", duree: 20, nbJoueurs: "8 contre 8 sur terrain complet",
    materiel: "Plots, chasubles",
    description: "L'équipe défensive doit laisser l'adversaire avancer sans presser jusqu'à une zone ou un signal défini (ex. passage de la ligne médiane), puis déclenche un pressing collectif intense. Travailler la patience collective et la clarté du signal de déclenchement.",
    diagram: genVs(8, 8),
  },
  {
    name: "Bloc stable sans chasse au ballon", gameplanSection: "defensive.pressing", gameplanChoice: "Attentiste, pas de pressing structuré",
    objectif: "Maintenir une structure défensive stable sans se précipiter sur le ballon", duree: 20, nbJoueurs: "8 contre 8 sur terrain complet",
    materiel: "Plots, chasubles",
    description: "L'équipe défensive doit rester organisée et éviter toute course individuelle vers le ballon tant que le bloc n'est pas directement menacé. Travailler la discipline positionnelle et la patience — utile pour une équipe qui préfère economiser son énergie et défendre en bloc plutôt que courir après le ballon.",
    diagram: genLine(8, 8),
  },
  {
    name: "Glissades collectives en bloc de zone", gameplanSection: "defensive.organisation", gameplanChoice: "Défense de zone",
    objectif: "Faire glisser la ligne défensive ensemble selon la position du ballon", duree: 15, nbJoueurs: "4 à 5 défenseurs face à des circulations de ballon",
    materiel: "Plots, ballons",
    description: "Les défenseurs se placent en ligne. Le ballon circule côté attaque (sans opposition dans un premier temps) et la ligne doit glisser collectivement pour rester alignée par rapport au ballon, en resserrant du côté fort et en s'ouvrant du côté faible. Ajouter une opposition progressive une fois les automatismes acquis.",
    diagram: genLine(5, 4),
  },
  {
    name: "Marquage individuel strict sur tout le terrain", gameplanSection: "defensive.organisation", gameplanChoice: "Marquage individuel strict",
    gameplanLinks: [{ section: "defensive.pressing", choice: "Pressing individuel homme à homme" }],
    objectif: "Ne jamais lâcher son adversaire direct, quelle que soit sa zone", duree: 20, nbJoueurs: "8 contre 8 avec duels désignés",
    materiel: "Chasubles pour désigner les duels, plots",
    description: "Chaque défenseur suit son adversaire direct dans tous ses déplacements, y compris hors de sa zone habituelle. Travailler la communication pour gérer les croisements de courses adverses destinés à perturber les duels, et la discipline pour ne jamais déléguer son marquage sans le signaler clairement.",
    diagram: genVs(8, 8),
  },
  {
    name: "Bascule zone/individuel sur points chauds", gameplanSection: "defensive.organisation", gameplanChoice: "Marquage mixte (zone + individuel sur points chauds)",
    objectif: "Défendre en zone par défaut, en basculant en individuel sur les joueurs dangereux", duree: 20, nbJoueurs: "8 contre 8, avec un ou deux attaquants désignés comme dangereux",
    materiel: "Chasubles distinctives pour les joueurs à marquer individuellement, plots",
    description: "L'équipe défend en zone classique, mais dès qu'un joueur adverse désigné comme dangereux entre dans une zone dangereuse, un défenseur bascule sur lui en marquage individuel strict le temps de l'action. Travailler la clarté de la communication du changement de consigne.",
    diagram: genVs(8, 8),
  },
  {
    name: "Ligne à quatre, surveillances croisées", gameplanSection: "defensive.organisation", gameplanChoice: "Ligne à quatre avec surveillances croisées",
    objectif: "Gérer les croisements offensifs par un échange clair de surveillance entre défenseurs", duree: 20, nbJoueurs: "4 défenseurs contre 3-4 attaquants qui croisent leurs courses",
    materiel: "Plots, chasubles",
    description: "Les attaquants croisent volontairement leurs courses pour perturber les repères de marquage. Les 4 défenseurs doivent communiquer et échanger leur surveillance (\"je le prends, tu prends le mien\") sans perdre le fil ni laisser un attaquant libre pendant l'échange.",
    diagram: genLine(4, 4),
  },
  {
    name: "Couverture des pistons en défense à trois", gameplanSection: "defensive.organisation", gameplanChoice: "Défense à trois centraux avec pistons",
    objectif: "Organiser la couverture défensive quand les pistons sont hauts et l'espace dans leur dos est exposé", duree: 20, nbJoueurs: "3 centraux + 2 pistons contre attaque à 5-6",
    materiel: "Plots, chasubles",
    description: "Les pistons montent haut comme en match puis doivent revenir défendre ; pendant leur absence, les 3 centraux doivent glisser pour couvrir temporairement leur couloir. Travailler la rapidité de repli des pistons et la gestion de la largeur par les 3 centraux en leur absence.",
    diagram: genLine(5, 5),
  },
  {
    name: "Transition offensive rapide 4 contre 3", gameplanSection: "transitionOff", gameplanChoice: "Contre-attaque immédiate (verticalité)",
    gameplanLinks: [{ section: "offensive.progression", choice: "Contre-attaque rapide après récupération" }],
    objectif: "Exploiter la supériorité numérique immédiatement après récupération", duree: 15, nbJoueurs: "4 attaquants contre 3 défenseurs + gardien",
    materiel: "Cage, ballons, chasubles",
    description: "Départ sur une récupération de balle (interception ou tacle simulé). Les 4 joueurs doivent jouer vers l'avant le plus vite possible, avant que la défense adverse (qui démarre en retard) ne se réorganise. Limiter le nombre de passes autorisées pour forcer la verticalité.",
    diagram: genVs(4, 3, { hasGoal: true, hasKeeper: true, xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Sécuriser la possession après récupération", gameplanSection: "transitionOff", gameplanChoice: "Conservation du ballon / temporisation",
    gameplanLinks: [{ section: "offensive.progression", choice: "Jeu au sol, construction patiente" }],
    objectif: "Résister à l'envie de jouer vite pour sécuriser d'abord la possession", duree: 15, nbJoueurs: "6 contre 6, départ sur récupération simulée",
    materiel: "Plots, chasubles",
    description: "Départ sur une récupération de balle. Contrairement à un exercice de contre-attaque, la consigne est ici de faire au moins 3-4 passes de sécurisation avant toute tentative de progression rapide. Travailler la lecture du moment où la possession est vraiment sécurisée avant d'accélérer.",
    diagram: genVs(6, 6),
  },
  {
    name: "Décision selon le nombre de soutiens disponibles", gameplanSection: "transitionOff", gameplanChoice: "Selon le nombre de joueurs disponibles à la récupération",
    objectif: "Adapter la décision (jouer vite ou temporiser) au nombre réel de soutiens présents", duree: 20, nbJoueurs: "Variable, groupes de 4 à 7 selon la séquence",
    materiel: "Plots, chasubles",
    description: "Le nombre de coéquipiers disponibles pour la récupération change à chaque séquence (parfois 2 soutiens, parfois 5). Le joueur qui récupère doit lire rapidement la situation et décider s'il joue vite (beaucoup de soutiens) ou temporise (peu de soutiens, risque de perte immédiate).",
    diagram: genVs(5, 4),
  },
  {
    name: "Relance longue immédiate après récupération", gameplanSection: "transitionOff", gameplanChoice: "Jeu long direct vers un point de fixation",
    gameplanLinks: [{ section: "offensive.construction", choice: "Jeu direct/long systématique" }],
    objectif: "Jouer long et direct dès la récupération vers un point de fixation", duree: 15, nbJoueurs: "6 contre 6 avec un pivot cible",
    materiel: "Cage, ballons, plots",
    description: "Départ sur récupération de balle en zone défensive ou médiane. Le joueur qui récupère doit chercher immédiatement le point de fixation (attaquant pivot) par une passe longue directe, sans phase de construction intermédiaire. Travailler la qualité et la rapidité d'exécution de cette passe sous pression.",
    diagram: genVs(6, 6, { hasGoal: true, hasKeeper: true, xA: 0.25, xB: 0.6 }),
  },
  {
    name: "Contre-pressing 6 secondes", gameplanSection: "transitionDef", gameplanChoice: "Contre-pressing immédiat pour récupérer",
    gameplanLinks: [{ section: "defensive.pressing", choice: "Pressing collectif à déclenchement" }],
    objectif: "Presser collectivement dans les toutes premières secondes après la perte", duree: 15, nbJoueurs: "6 contre 6 en espace réduit",
    materiel: "Plots pour délimiter l'espace, chronomètre",
    description: "Jeu en espace réduit. Dès la perte de balle, l'équipe qui vient de perdre a 6 secondes pour presser collectivement et tenter de récupérer immédiatement. Passé ce délai, elle se replie normalement. Comptabiliser le taux de récupération dans les 6 secondes pour objectiver la progression.",
    diagram: genVs(6, 6, { zone: [0.25, 0.1, 0.75, 0.9] }),
  },
  {
    name: "Repli défensif rapide et regroupement", gameplanSection: "transitionDef", gameplanChoice: "Repli défensif rapide et regroupement",
    gameplanLinks: [{ section: "defensive.hauteurBloc", choice: "Bloc bas (regroupé)" }],
    objectif: "Se replier collectivement et vite dès la perte de balle plutôt que de presser", duree: 15, nbJoueurs: "6 contre 6, départ sur perte de balle simulée",
    materiel: "Plots, chasubles",
    description: "Départ sur une perte de balle en zone haute. Plutôt que de presser immédiatement, l'équipe doit se replier collectivement et rapidement pour se regrouper devant son but avant que l'adversaire n'attaque. Chronométrer le temps de regroupement complet et travailler à le réduire.",
    diagram: genLine(6, 6),
  },
  {
    name: "Reconnaître la situation de faute tactique justifiée", gameplanSection: "transitionDef", gameplanChoice: "Faute tactique si besoin",
    objectif: "Développer le discernement sur quand une faute tactique protège l'équipe et quand elle est superflue ou dangereuse", duree: 15, nbJoueurs: "6 contre 6 avec situations de transition variées",
    materiel: "Plots, chasubles",
    description: "Situations de transition défensive répétées où le défenseur en retard doit décider s'il peut revenir proprement ou s'il doit stopper l'action par une faute tactique. Débriefer systématiquement chaque décision : la zone (jamais dans sa propre surface), le contexte (dernier homme ou non), et le risque de carton. L'objectif est le discernement, pas l'automatisme de faute.",
    diagram: genVs(6, 6),
  },
  {
    name: "Retour athlétique organisé, chacun dans son couloir", gameplanSection: "transitionDef", gameplanChoice: "Retour athlétique organisé par couloir",
    objectif: "Organiser le repli individuel de chaque joueur dans son propre couloir", duree: 15, nbJoueurs: "6 contre 6 sur grand espace",
    materiel: "Plots pour marquer les couloirs, chasubles",
    description: "Départ sur perte de balle en zone haute, sur un grand espace divisé en couloirs marqués au sol. Chaque joueur doit repérer et revenir défendre dans son propre couloir plutôt que de se regrouper au hasard, pour garantir une couverture homogène de la largeur du terrain pendant le repli.",
    diagram: genLine(6, 6),
  },
  {
    name: "Touche défensive sous pression", gameplanSection: "cpa.touchesDef", gameplanChoice: "Dégagement / jeu long sécurisé",
    gameplanLinks: [{ section: "offensive.construction", choice: "Jeu direct/long systématique" }],
    objectif: "Sécuriser la remise en jeu en zone défensive face à un pressing adverse", duree: 10, nbJoueurs: "6 contre 4 (avantage à l'équipe qui remet en jeu)",
    materiel: "Ballons, plots",
    description: "Reproduction d'une touche en zone défensive avec un adversaire qui presse le lanceur et les receveurs proches. Travailler les courses de déblocage (un joueur qui vient chercher le ballon court, un autre qui appelle en profondeur pour le jeu long) et la décision rapide du lanceur.",
    diagram: genThrowIn("def"),
  },
  {
    name: "Touche défensive courte vers le gardien", gameplanSection: "cpa.touchesDef", gameplanChoice: "Jeu court vers le gardien ou un défenseur proche",
    objectif: "Sécuriser la remise en jeu par une passe courte plutôt qu'un dégagement", duree: 10, nbJoueurs: "5 contre 3",
    materiel: "Ballons, plots",
    description: "Touche défensive où le lanceur cherche systématiquement une remise courte vers le gardien ou un défenseur proche disponible, pour relancer une possession construite plutôt que de dégager. Travailler le placement du receveur proche pour toujours offrir cette option sûre.",
    diagram: genThrowIn("def"),
  },
  {
    name: "Touche défensive, décision selon la pression", gameplanSection: "cpa.touchesDef", gameplanChoice: "Selon la pression adverse",
    objectif: "Lire la pression adverse pour choisir entre jeu court et jeu long à la touche", duree: 15, nbJoueurs: "6 contre 4-6 (pression variable)",
    materiel: "Ballons, plots",
    description: "Le nombre de joueurs adverses proches de la touche change à chaque répétition. Le lanceur doit lire rapidement s'il a une option courte sûre ou s'il doit dégager long, sans consigne fixée à l'avance. Débriefer chaque décision pour affiner la lecture.",
    diagram: genThrowIn("def"),
  },
  {
    name: "Touche médiane, jouer vite vers l'avant", gameplanSection: "cpa.touchesMed", gameplanChoice: "Jeu rapide vers l'avant",
    objectif: "Profiter d'un déséquilibre défensif juste après la touche", duree: 10, nbJoueurs: "6 contre 5",
    materiel: "Ballons, plots",
    description: "Touche en zone médiane où l'équipe qui remet en jeu doit chercher à jouer vers l'avant en 1 ou 2 passes maximum, avant que la défense adverse ne se réorganise complètement après le temps mort de la touche.",
    diagram: genThrowIn("med"),
  },
  {
    name: "Touche médiane, conservation courte", gameplanSection: "cpa.touchesMed", gameplanChoice: "Jeu court pour conserver",
    objectif: "Utiliser la touche médiane pour relancer une possession patiente", duree: 10, nbJoueurs: "6 contre 4",
    materiel: "Ballons, plots",
    description: "Touche médiane où le lanceur remet systématiquement court vers un appui proche, pour engager une phase de conservation plutôt qu'une recherche de vitesse immédiate. Travailler la disponibilité de plusieurs appuis courts autour du lanceur.",
    diagram: genThrowIn("med"),
  },
  {
    name: "Touche médiane longue pour étirer le bloc", gameplanSection: "cpa.touchesMed", gameplanChoice: "Touche longue pour étirer le bloc adverse",
    gameplanLinks: [{ section: "offensive.construction", choice: "Jeu direct/long systématique" }],
    objectif: "Utiliser la touche longue pour déséquilibrer horizontalement le bloc adverse", duree: 10, nbJoueurs: "6 contre 5",
    materiel: "Ballons, plots",
    description: "Le lanceur envoie une touche longue vers le couloir opposé pour étirer le bloc adverse et créer de l'espace ailleurs sur le terrain. Travailler la précision et la distance de la touche longue, ainsi que le timing de l'appel du receveur loin du ballon.",
    diagram: genThrowIn("med"),
  },
  {
    name: "Touche médiane, décision selon le contexte de match", gameplanSection: "cpa.touchesMed", gameplanChoice: "Selon la situation de match",
    objectif: "Adapter le choix de touche médiane au contexte annoncé (score, temps de jeu)", duree: 15, nbJoueurs: "6 contre 5",
    materiel: "Ballons, plots",
    description: "Un contexte de match est annoncé avant chaque touche (ex. \"vous menez 1-0, 10 minutes à jouer\" ou \"vous êtes menés, il faut absolument avancer\"). Le lanceur doit adapter son choix de touche (conservation, jeu long, jeu rapide) à ce contexte plutôt que de répéter toujours la même option.",
    diagram: genThrowIn("med"),
  },
  {
    name: "Touche offensive, bloc dans la surface", gameplanSection: "cpa.touchesOff", gameplanChoice: "Touche organisée comme un corner (bloc dans la surface)",
    objectif: "Créer un danger direct depuis une touche proche du but adverse", duree: 15, nbJoueurs: "8 contre 8 (zone de surface)",
    materiel: "Ballons, plots pour marquer les postes de départ",
    description: "Touche haute et excentrée près de la surface adverse. Organiser un vrai bloc dans la surface comme sur un corner : joueurs au premier poteau, au second poteau, en retrait pour une remise. Le lanceur peut jouer long directement dans le bloc ou en relais courte pour recentrer l'angle.",
    diagram: genThrowIn("off"),
  },
  {
    name: "Touche offensive jouée rapidement", gameplanSection: "cpa.touchesOff", gameplanChoice: "Touche rapidement jouée",
    objectif: "Profiter du temps de réaction de la défense adverse en jouant très vite", duree: 10, nbJoueurs: "6 contre 5",
    materiel: "Ballons, plots",
    description: "Touche offensive où l'objectif est de remettre en jeu le plus rapidement possible, avant que la défense adverse ne soit repositionnée. Travailler la disponibilité immédiate d'un appui proche du lanceur et la rapidité de prise de décision.",
    diagram: genThrowIn("off"),
  },
  {
    name: "Touche offensive, combinaison courte préparée", gameplanSection: "cpa.touchesOff", gameplanChoice: "Combinaison courte préparée",
    objectif: "Exploiter une combinaison répétée près du but sur une touche offensive", duree: 15, nbJoueurs: "3-4 joueurs impliqués contre une défense organisée",
    materiel: "Ballons, plots",
    description: "Combinaison à 2 ou 3 joueurs préparée et répétée (remise en retrait, jeu en triangle, ou feinte de touche longue suivie d'une touche courte) pour créer une ouverture près de la surface adverse. Automatiser les timings de course avant de l'intégrer en situation de match.",
    diagram: genThrowIn("off"),
  },
  {
    name: "Organisation défensive sur coup franc adverse", gameplanSection: "cpa.cfDef", gameplanChoice: "Repli collectif avant dégagement",
    objectif: "Se replacer collectivement et dégager proprement sur coup franc subi", duree: 15, nbJoueurs: "11 contre 11 ou effectif complet",
    materiel: "Ballons, mur de joueurs si besoin",
    description: "Coup franc concédé en zone médiane/défensive. Travailler le repli collectif (mur si nécessaire, couverture des zones dangereuses) et la clarté du dégagement une fois le ballon récupéré, pour éviter une perte de balle immédiate en zone dangereuse.",
    diagram: genFreeKick("def"),
  },
  {
    name: "Coup franc défensif, dégagement direct", gameplanSection: "cpa.cfDef", gameplanChoice: "Dégagement direct",
    objectif: "Dégager immédiatement sans phase de repli prolongée", duree: 10, nbJoueurs: "Effectif complet",
    materiel: "Ballons, mur si besoin",
    description: "Coup franc concédé en zone dangereuse. Le gardien ou le défenseur le plus proche dégage immédiatement dès récupération, sans chercher à construire. Travailler la rapidité d'exécution et le choix de la zone de dégagement (éviter de dégager vers un espace dangereux).",
    diagram: genFreeKick("def"),
  },
  {
    name: "Coup franc défensif, relance courte sécurisée", gameplanSection: "cpa.cfDef", gameplanChoice: "Relance courte sécurisée",
    objectif: "Relancer court et sûr après récupération sur coup franc subi", duree: 15, nbJoueurs: "6 contre 4",
    materiel: "Ballons, plots",
    description: "Après récupération du ballon sur un coup franc subi, l'équipe relance courte vers un appui sûr plutôt que de dégager loin, pour engager une possession contrôlée. Travailler la disponibilité des appuis proches et la lecture du pressing adverse résiduel.",
    diagram: genFreeKick("def"),
  },
  {
    name: "Coup franc médian, relance construite", gameplanSection: "cpa.cfMed", gameplanChoice: "Jeu construit, conservation",
    gameplanLinks: [{ section: "offensive.progression", choice: "Jeu au sol, construction patiente" }],
    objectif: "Conserver le ballon plutôt que de le jouer long après un coup franc médian", duree: 10, nbJoueurs: "6 contre 4",
    materiel: "Ballons, plots",
    description: "Coup franc en zone médiane joué court vers un partenaire proche pour relancer une possession construite, plutôt que de chercher le jeu direct. Travailler les appuis courts disponibles et l'orientation du jeu après la remise.",
    diagram: genFreeKick("med"),
  },
  {
    name: "Coup franc médian, jeu rapide vers l'avant", gameplanSection: "cpa.cfMed", gameplanChoice: "Jeu rapide vers l'avant",
    objectif: "Jouer vite après un coup franc médian pour surprendre une défense pas repositionnée", duree: 10, nbJoueurs: "6 contre 5",
    materiel: "Ballons, plots",
    description: "Coup franc en zone médiane joué rapidement vers l'avant, en 1-2 passes maximum, avant que la défense adverse ne soit complètement replacée. Travailler la disponibilité immédiate d'un appui offensif et la rapidité d'exécution du botteur.",
    diagram: genFreeKick("med"),
  },
  {
    name: "Coup franc offensif à deux", gameplanSection: "cpa.cfOff", gameplanChoice: "Combinaison courte préparée",
    objectif: "Exploiter une combinaison préparée près de la surface adverse", duree: 15, nbJoueurs: "2 tireurs + partenaires contre un mur/une défense organisée",
    materiel: "Ballons, mannequins pour simuler le mur",
    description: "Coup franc excentré ou proche de la surface. Combinaison à deux répétée (un-deux, décalage, ou feinte de frappe suivie d'une passe) pour créer une ouverture avant la frappe ou le centre final. Répéter jusqu'à automatisation des timings de course.",
    diagram: genFreeKick("off"),
  },
  {
    name: "Coup franc offensif, frappe directe", gameplanSection: "cpa.cfOff", gameplanChoice: "Tir direct si possible",
    objectif: "Travailler la frappe directe sur coup franc à différentes distances et angles", duree: 15, nbJoueurs: "1-2 tireurs contre un mur simulé",
    materiel: "Ballons, mannequins pour le mur, cage",
    description: "Séries de frappes directes sur coup franc, avec mur de mannequins à distance réglementaire. Varier la position (axe, angle) et le type de frappe (enroulée, appuyée) pour préparer les tireurs désignés à différentes situations rencontrées en match.",
    diagram: genFreeKick("off"),
  },
  {
    name: "Coup franc offensif, centre dans la surface", gameplanSection: "cpa.cfOff", gameplanChoice: "Centre dans la surface",
    gameplanLinks: [{ section: "offensive.finition", choice: "Jeu de combinaisons et centres" }],
    objectif: "Organiser un bloc dans la surface sur un coup franc centré", duree: 15, nbJoueurs: "6-8 attaquants contre défense organisée",
    materiel: "Ballons, plots, cage",
    description: "Coup franc excentré centré directement dans la surface, avec organisation d'un bloc attaquant similaire à un corner (premier poteau, second poteau, en retrait). Travailler la qualité du centre et les courses d'appel synchronisées des attaquants.",
    diagram: genFreeKick("off"),
  },
  {
    name: "Coup franc offensif, un-deux rapide", gameplanSection: "cpa.cfOff", gameplanChoice: "Un-deux rapide avec un appui",
    objectif: "Exploiter un une-deux rapide pour percer un mur adverse", duree: 15, nbJoueurs: "2 joueurs + appuis contre mur simulé",
    materiel: "Ballons, mannequins",
    description: "Le tireur joue rapidement avec un appui proche (un-deux) pour se retrouver en position de frappe favorable avant que le mur et le gardien ne se réorganisent. Travailler la vitesse d'exécution et la synchronisation entre le tireur et son appui.",
    diagram: genFreeKick("off"),
  },
  {
    name: "Corner offensif joué au sol", gameplanSection: "cpa.cornerOff", gameplanChoice: "Combinaison courte au sol",
    objectif: "Varier les corners par une combinaison au sol plutôt qu'un centre aérien systématique", duree: 15, nbJoueurs: "5 attaquants contre 5-6 défenseurs",
    materiel: "Ballons, plots",
    description: "Variante de corner jouée courte avec un ou deux appuis proches du corner, pour recentrer l'angle de centre ou tenter une frappe depuis un angle plus favorable. Utile en complément du corner classique pour surprendre une défense organisée sur le jeu aérien.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner offensif, tous au marquage du ballon", gameplanSection: "cpa.cornerOff", gameplanChoice: "Tous au marquage/attaque du ballon",
    gameplanLinks: [{ section: "offensive.finition", choice: "Recherche systématique de la surface" }],
    objectif: "Maximiser la présence offensive dans la surface sur chaque corner", duree: 15, nbJoueurs: "8-9 attaquants contre défense organisée",
    materiel: "Ballons, plots, cage",
    description: "Sur chaque corner, l'ensemble des joueurs disponibles (hormis le tireur) attaque le ballon dans la surface, sans joueur laissé en couverture. Travailler les courses croisées pour créer de la confusion dans le marquage adverse et maximiser les occasions de reprise.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner offensif avec joueurs en couverture", gameplanSection: "cpa.cornerOff", gameplanChoice: "Quelques joueurs restent en couverture",
    objectif: "Équilibrer l'attaque du corner et la prévention d'une contre-attaque adverse", duree: 15, nbJoueurs: "6-7 attaquants dans la surface, 2-3 en couverture",
    materiel: "Ballons, plots, cage",
    description: "Sur chaque corner, 2 à 3 joueurs restent volontairement hors de la surface pour couvrir une éventuelle contre-attaque adverse en cas de dégagement. Travailler leur placement (couloirs de relance probables de l'adversaire) sans qu'ils soient totalement passifs.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner offensif, ballon systématique au premier poteau", gameplanSection: "cpa.cornerOff", gameplanChoice: "Ballon au premier poteau systématique",
    objectif: "Automatiser une routine de corner ciblant systématiquement le premier poteau", duree: 15, nbJoueurs: "5-6 attaquants contre défense organisée",
    materiel: "Ballons, plots, cage",
    description: "Chaque corner cible systématiquement le premier poteau, avec un ou deux joueurs qui s'y engagent en course croisée pour une déviation ou une reprise directe. Travailler la précision du tireur sur cette zone précise et le timing des courses vers le premier poteau.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner offensif joué en retrait", gameplanSection: "cpa.cornerOff", gameplanChoice: "Ballon en retrait hors de la surface",
    objectif: "Exploiter une variante de corner jouée en retrait pour une frappe de loin", duree: 15, nbJoueurs: "5-6 attaquants contre défense organisée",
    materiel: "Ballons, plots, cage",
    description: "Le corner est joué en retrait vers un joueur positionné à l'extérieur de la surface, qui frappe directement ou récentre le jeu. Utile contre une défense qui monopolise l'espace aérien dans la surface — travailler la qualité de la frappe de loin qui s'ensuit.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner défensif en marquage mixte", gameplanSection: "cpa.cornerDef", gameplanChoice: "Mixte (individuel + zone sur points clés)",
    objectif: "Répartir les responsabilités entre joueurs en zone et au marquage individuel", duree: 15, nbJoueurs: "6-7 défenseurs contre 5-6 attaquants",
    materiel: "Ballons, plots pour marquer les zones",
    description: "Organisation défensive sur corner avec des joueurs positionnés en zone sur les postes clés (premier poteau, second poteau, devant le but) et d'autres au marquage individuel sur les attaquants les plus dangereux aérien. Répéter avec des corners variés (fort, faible, en retrait).",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner défensif en marquage individuel strict", gameplanSection: "cpa.cornerDef", gameplanChoice: "Marquage individuel strict",
    objectif: "Chaque défenseur suit son attaquant désigné sur toute la phase de corner", duree: 15, nbJoueurs: "6-7 défenseurs contre 5-6 attaquants",
    materiel: "Ballons, chasubles pour désigner les duels",
    description: "Chaque défenseur reçoit un attaquant à marquer individuellement sur le corner, y compris dans ses déplacements avant la frappe. Travailler l'anticipation de la course de l'attaquant et le duel physique au moment de la frappe, plutôt que la simple occupation d'une zone.",
    diagram: genCorner("bas"),
  },
  {
    name: "Corner défensif en marquage de zone", gameplanSection: "cpa.cornerDef", gameplanChoice: "Marquage de zone",
    objectif: "Occuper des zones fixes dans la surface plutôt que suivre un attaquant précis", duree: 15, nbJoueurs: "6-7 défenseurs contre 5-6 attaquants",
    materiel: "Ballons, plots pour marquer les zones fixes",
    description: "Chaque défenseur occupe une zone fixe de la surface (premier poteau, second poteau, ligne de six mètres, sortie de surface) quel que soit le déplacement des attaquants. Travailler la couverture complète de la surface et la communication entre zones adjacentes.",
    diagram: genCorner("bas"),
  },
  {
    name: "Séance de tirs au but, gestion de la pression", gameplanSection: "cpa.penalty", gameplanChoice: "Tireur unique désigné",
    objectif: "Préparer techniquement et mentalement le tireur désigné", duree: 15, nbJoueurs: "1 tireur + gardien, groupe en spectateur",
    materiel: "Ballons, cage",
    description: "Le tireur désigné s'entraîne dans un contexte simulant la pression du match (spectateurs, enjeu annoncé, fatigue préalable via un effort court avant chaque tir). Travailler la routine personnelle avant frappe et la gestion du contact visuel avec le gardien.",
    diagram: genPenalty(),
  },
  {
    name: "Séance de tirs au but, plusieurs tireurs dans l'ordre", gameplanSection: "cpa.penalty", gameplanChoice: "Ordre de plusieurs tireurs prédéfini",
    objectif: "Préparer plusieurs tireurs désignés dans un ordre fixé à l'avance", duree: 15, nbJoueurs: "3-5 tireurs + gardien",
    materiel: "Ballons, cage",
    description: "Les tireurs désignés s'entraînent dans l'ordre exact prévu pour une séance de tirs au but réelle, dans les mêmes conditions de pression simulée. Travailler la régularité de chacun et la gestion de l'attente pour ceux qui tirent plus tard dans l'ordre.",
    diagram: genPenalty(),
  },
  {
    name: "Séance de tirs au but, plusieurs tireurs potentiels", gameplanSection: "cpa.penalty", gameplanChoice: "Décision au moment du match",
    objectif: "Maintenir plusieurs joueurs prêts à tirer sans ordre fixé à l'avance", duree: 20, nbJoueurs: "6-8 tireurs potentiels + gardien",
    materiel: "Ballons, cage",
    description: "Un groupe plus large de joueurs s'entraîne régulièrement au tir au but, pour que la décision du moment (qui tire, dans quel ordre) puisse se faire librement en fonction de la forme du jour et de la confiance de chacun, plutôt que de dépendre d'un seul tireur préparé.",
    diagram: genPenalty(),
  },
];

const STARTER_EXERCISES_TECHNIQUE = [
  {
    name: "Conduite de balle en slalom", category: "technique",
    objectif: "Améliorer la maîtrise de balle en course et le changement d'appui", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plots, ballons",
    description: "Slalom entre 5-6 plots resserrés, à conduire balle au pied en alternant les surfaces de contact (intérieur/extérieur). Chronométrer les passages pour ajouter un objectif de progression, sans sacrifier la qualité de touche de balle à la vitesse.",
    diagram: genSlalom(6),
  },
  {
    name: "Passes courtes en grille (rondo technique)", category: "technique",
    objectif: "Automatiser la qualité de passe courte et le contrôle orienté", duree: 15, nbJoueurs: "5-6 joueurs en cercle",
    materiel: "Plots pour délimiter le cercle, ballons",
    description: "Joueurs disposés en cercle, échange de passes courtes à une ou deux touches. Insister sur la qualité technique pure (surface de contact, puissance juste, contrôle orienté vers le prochain geste) plutôt que sur la vitesse d'exécution, contrairement à un rondo tactique classique.",
    diagram: genPassingGrid(6),
  },
  {
    name: "Contrôle orienté sous contrainte de temps", category: "technique",
    objectif: "Automatiser le contrôle orienté vers l'espace libre avant la prochaine action", duree: 15, nbJoueurs: "3-4 joueurs par groupe",
    materiel: "Plots, ballons",
    description: "Un passeur envoie le ballon à des angles variés vers un receveur qui doit contrôler en un temps orienté vers une zone ou un plot cible désigné à l'avance, puis relancer immédiatement. Varier la vitesse et l'angle des passes reçues pour complexifier progressivement.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Frappe de balle, technique du coup de pied", category: "technique",
    objectif: "Travailler la technique pure de frappe (surface de contact, position du pied d'appui, geste)", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes statiques puis en mouvement, avec un accent sur le geste technique (position du pied d'appui, verrouillage de la cheville, accompagnement du geste) plutôt que sur la puissance ou le contexte tactique. Filmer si possible pour un retour visuel immédiat au joueur.",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Jeu de tête, centre et reprise", category: "technique",
    objectif: "Travailler la technique du jeu de tête en frappe et en remise", duree: 15, nbJoueurs: "Groupes de 2-3 en rotation",
    materiel: "Ballons, cage",
    description: "Séries de centres à reprendre de la tête, en variant la trajectoire (centre tendu, en cloche, en retrait) et la position du réceptionneur. Travailler le timing de l'impact et l'orientation du cou/du regard vers la cible avant la frappe de tête.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "Feintes et gestes techniques (crochets, roulettes)", category: "technique",
    objectif: "Élargir le répertoire de gestes techniques individuels pour éliminer un adversaire", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plots, ballons",
    description: "Répétition de gestes techniques isolés (crochet intérieur/extérieur, roulette, petit pont) face à un plot ou un partenaire passif, avant de les intégrer progressivement en opposition réelle. Travailler chaque geste lentement puis à vitesse de match.",
    diagram: genSlalom(4),
  },
  {
    name: "Jonglerie et maîtrise de balle", category: "technique",
    objectif: "Développer la sensibilité et la maîtrise générale du ballon", duree: 10, nbJoueurs: "Individuel",
    materiel: "Un ballon par joueur",
    description: "Séries de jonglage (pied, cuisse, tête, en alternance) et d'exercices de maîtrise (contrôles amortis, passages du ballon entre les jambes en statique). Utile en échauffement ou en travail complémentaire individuel, pas comme fondement d'une séance collective.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.4)],
  },
  {
    name: "Passe longue, précision et trajectoire", category: "technique",
    objectif: "Travailler la précision et la qualité de trajectoire sur la passe longue", duree: 15, nbJoueurs: "Binômes ou petits groupes",
    materiel: "Ballons, plots pour marquer les cibles",
    description: "Passes longues répétées vers une cible fixe (cerceau, zone marquée au sol) à distance croissante. Varier entre trajectoire tendue et trajectoire en cloche selon le contexte visé (jeu direct rapide vs. changement d'aile pour temporiser).",
    diagram: genSprintLanes(2),
  },
];

const STARTER_EXERCISES_ATHLETIQUE = [
  {
    name: "Sprint linéaire, développement de la vitesse", category: "athletique",
    objectif: "Développer la vitesse pure sur des efforts courts et maximaux", duree: 15, nbJoueurs: "Groupes de 3-4 par couloir",
    materiel: "Plots, chronomètre",
    description: "Séries de sprints linéaires (10 à 30 mètres) à intensité maximale, avec récupération complète entre les répétitions pour préserver la qualité de vitesse pure. Travailler la phase d'accélération (les premiers appuis) autant que la vitesse de pointe.",
    diagram: genSprintLanes(4),
  },
  {
    name: "Fractionné, développement de la VMA", category: "athletique",
    objectif: "Développer la capacité aérobie via un travail fractionné", duree: 20, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Plots pour marquer les distances, chronomètre",
    description: "Alternance d'efforts courts à haute intensité (ex. 30 secondes à intensité élevée) et de récupération active (30 secondes de course lente), répétée sur plusieurs séries. Ajuster l'intensité et la durée des blocs selon le niveau de forme et la période de la saison.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Changements de direction, agilité", category: "athletique",
    objectif: "Développer la capacité à changer rapidement de direction sans perte d'équilibre", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plots",
    description: "Parcours de plots imposant des changements de direction à angles variés (droit, en épingle, en diagonale), effectué à vitesse maximale une fois le schéma moteur acquis à vitesse modérée. Travailler la position basse du centre de gravité dans les changements d'appui.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Pliométrie, détente et puissance", category: "athletique",
    objectif: "Développer la puissance des membres inférieurs via des exercices de saut", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plots ou haies basses, tapis si disponible",
    description: "Séries de sauts (bipodaux puis unipodaux, par-dessus des plots ou haies basses) avec accent sur la qualité de réception (amorti, stabilité) autant que sur la hauteur/puissance du saut. Espacer suffisamment les répétitions pour préserver la qualité d'exécution.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("cone", 0.45, 0.5), pel("cone", 0.55, 0.5), pel("cone", 0.65, 0.5), ael("arrowMove", 0.3, 0.5, 0.7, 0.5)],
  },
  {
    name: "Gainage et renforcement du tronc", category: "athletique",
    objectif: "Renforcer la ceinture abdominale et lombaire pour la stabilité générale", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Tapis si disponible",
    description: "Série d'exercices de gainage statique et dynamique (planche, gainage latéral, mountain climbers) en circuit, avec des temps de travail/repos adaptés au niveau du groupe. Utile en fin de séance ou en complément individuel régulier.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Répétition de sprints (RSA)", category: "athletique",
    objectif: "Développer la capacité à répéter des efforts sprintés avec récupération courte", duree: 15, nbJoueurs: "Groupes de 3-4 par couloir",
    materiel: "Plots, chronomètre",
    description: "Séries de sprints courts (15-20 mètres) répétés avec un temps de récupération volontairement court et incomplet, pour développer la capacité à maintenir la vitesse malgré la fatigue accumulée — qualité directement transférable aux efforts répétés en match.",
    diagram: genSprintLanes(4),
  },
  {
    name: "Récupération active et étirements", category: "athletique",
    objectif: "Favoriser la récupération après un effort intense", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Tapis si disponible",
    description: "Course très légère suivie d'étirements doux non forcés, en fin de séance ou le lendemain d'un match. Un moment calme pour clôturer une séance intense, sans objectif de performance.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.5, { number: 3 })],
  },
  {
    name: "Musculation fonctionnelle bas du corps", category: "athletique",
    objectif: "Renforcer les membres inférieurs pour la performance et la prévention des blessures", duree: 15, nbJoueurs: "Groupe complet, en parallèle ou en circuit",
    materiel: "Élastiques ou charges légères si disponibles",
    description: "Circuit d'exercices de renforcement (squats, fentes, ponts fessiers) à charge légère à modérée, avec accent sur la qualité d'exécution du mouvement. Particulièrement pertinent en prévention des blessures aux ischio-jambiers et aux genoux.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
];

const STARTER_EXERCISES_RECUPERATION = [
  {
    name: "Retour au calme cardio-vasculaire", category: "athletique",
    objectif: "Faire redescendre progressivement la fréquence cardiaque après un effort intense", duree: 8, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Course très légère puis marche, sur 6 à 8 minutes, en réduisant progressivement l'intensité. Permet d'évacuer une partie des déchets métaboliques accumulés et d'amorcer la transition vers un état de repos, plutôt que de s'arrêter net après un effort à haute intensité.",
    diagram: [pel("playerA", 0.2, 0.5, { number: 1 }), pel("playerA", 0.35, 0.5, { number: 2 }), pel("playerA", 0.5, 0.5, { number: 3 }), pel("playerA", 0.65, 0.5, { number: 4 }), pel("playerA", 0.8, 0.5, { number: 5 })],
  },
  {
    name: "Étirements statiques ciblés", category: "athletique",
    objectif: "Restaurer l'amplitude articulaire et relâcher les groupes musculaires les plus sollicités", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Tapis si disponible",
    description: "Série d'étirements statiques tenus 20 à 30 secondes par groupe musculaire (ischio-jambiers, quadriceps, mollets, fessiers, adducteurs), sans forcer au-delà d'une tension légère. En fin de séance, une fois la fréquence cardiaque redescendue — jamais à froid en début de séance.",
    diagram: [pel("playerA", 0.3, 0.4, { number: 1 }), pel("playerA", 0.5, 0.4, { number: 2 }), pel("playerA", 0.7, 0.4, { number: 3 }), pel("playerA", 0.3, 0.6, { number: 4 }), pel("playerA", 0.5, 0.6, { number: 5 }), pel("playerA", 0.7, 0.6, { number: 6 })],
  },
  {
    name: "Auto-massage au rouleau (relâchement myofascial)", category: "athletique",
    objectif: "Relâcher les tensions musculaires et faciliter la récupération tissulaire", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Rouleaux de massage (foam roller) ou balles de tennis/lacrosse",
    description: "Passage du rouleau sur les principaux groupes musculaires des membres inférieurs (mollets, quadriceps, ischio-jambiers, fessiers, bande ilio-tibiale), 30 à 45 secondes par zone, pression modérée. Marquer une pause plus longue sur les points sensibles sans aller jusqu'à la douleur vive.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Mobilité articulaire (hanches, chevilles, dos)", category: "athletique",
    objectif: "Entretenir l'amplitude de mouvement des articulations les plus sollicitées dans le jeu", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Tapis si disponible",
    description: "Circuit d'exercices de mobilité dynamique et contrôlée (cercles de hanches, fentes avec rotation du buste, mobilité de cheville en charge, chat-vache pour le dos), en dehors de tout contexte de fatigue extrême. Utile en routine régulière plutôt qu'en réaction ponctuelle à une gêne.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.5, { number: 3 })],
  },
  {
    name: "Respiration et relâchement post-effort", category: "athletique",
    objectif: "Favoriser le retour à un état de repos via la respiration contrôlée", duree: 6, nbJoueurs: "Groupe complet, allongé ou assis",
    materiel: "Tapis si disponible",
    description: "Respirations amples et lentes (inspiration 4 secondes, expiration 6-8 secondes), allongé ou assis, dans le calme. Court mais utile en clôture d'une séance ou d'un match à forte charge émotionnelle — la dimension mentale de la récupération compte autant que la dimension physique.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.5, { number: 3 })],
  },
  {
    name: "Circuit récupération lendemain de match (J+1)", category: "athletique",
    objectif: "Favoriser la récupération sans ajouter de charge, le lendemain d'un match", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Ballons, plots, tapis si disponible",
    description: "Séance très basse intensité : jeu libre à faible allure ou vélo léger (5-8 min), suivi d'étirements statiques et de mobilité. Aucun exercice à visée de performance ce jour-là — l'objectif est exclusivement de favoriser la récupération, à distinguer nettement d'une séance de travail.",
    diagram: [pel("playerA", 0.25, 0.4, { number: 1 }), pel("playerA", 0.45, 0.4, { number: 2 }), pel("playerA", 0.65, 0.4, { number: 3 }), pel("playerA", 0.35, 0.6, { number: 4 }), pel("playerA", 0.55, 0.6, { number: 5 }), pel("ball", 0.45, 0.5)],
  },
];

const STARTER_EXERCISES_TECHNIQUE_PASSES = [
  {
    name: "Passe intérieur du pied, précision courte", category: "technique",
    objectif: "Maîtriser la surface de passe la plus fiable pour la précision courte", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots pour marquer les cibles",
    description: "Passes répétées à l'intérieur du pied sur une cible précise (entre deux plots resserrés), à distance progressive. Travailler le verrouillage de la cheville et l'accompagnement du geste, la base technique la plus fiable avant d'aborder les autres surfaces de passe.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Passe extérieur du pied, surprise en espace réduit", category: "technique",
    objectif: "Utiliser l'extérieur du pied pour une passe rapide sans changer l'orientation du corps", duree: 15, nbJoueurs: "3-4 joueurs en rotation",
    materiel: "Ballons, plots",
    description: "Passes à l'extérieur du pied, qui permettent de jouer sans ouvrir le corps et donc de surprendre l'adversaire sur la direction. Travailler d'abord à l'arrêt puis en mouvement, en insistant sur la disponibilité de cette surface dans les espaces réduits où le temps de préparation manque.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Passe piquée par-dessus une ligne", category: "technique",
    objectif: "Maîtriser la passe piquée pour franchir une ligne défensive proche", duree: 15, nbJoueurs: "Binômes ou trios, avec ligne défensive simulée",
    materiel: "Ballons, plots ou mannequins pour simuler la ligne",
    description: "Passe piquée (contact sous le ballon pour un effet rétro) exécutée par-dessus une ligne de plots ou de mannequins représentant une défense proche, pour retomber dans les pieds d'un partenaire situé juste derrière. Technique utile quand la passe au sol est coupée mais que la distance ne justifie pas un centre ou une longue balle en cloche.",
    diagram: genLine(3, 1),
  },
  {
    name: "Passe en retrait vers un relais", category: "technique",
    objectif: "Maîtriser la passe orientée vers l'arrière pour sécuriser la possession", duree: 15, nbJoueurs: "Trios en rotation",
    materiel: "Ballons, plots",
    description: "Le joueur reçoit orienté vers l'avant mais choisit de remettre en retrait vers un relais (souvent un gardien ou un défenseur libre) plutôt que de forcer une action risquée vers l'avant. Travailler la qualité et la sécurité de cette passe, ainsi que la disponibilité constante du relais en soutien.",
    diagram: [pel("playerA", 0.6, 0.5, { number: 1 }), pel("playerA", 0.35, 0.5, { number: 2 }), pel("ball", 0.5, 0.5), ael("arrowPass", 0.6, 0.5, 0.35, 0.5)],
  },
  {
    name: "Passe latérale de sécurisation", category: "technique",
    objectif: "Maîtriser la passe latérale pour temporiser et changer le point d'attaque", duree: 15, nbJoueurs: "4-5 joueurs alignés latéralement",
    materiel: "Ballons, plots",
    description: "Les joueurs sont alignés latéralement (même hauteur sur le terrain) et se font des passes strictement latérales, sans jamais chercher la profondeur. Travailler la qualité de cette passe souvent négligée à l'entraînement mais très fréquente en match pour temporiser ou rééquilibrer le jeu.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.5, { number: 3 }), pel("ball", 0.4, 0.5)],
  },
  {
    name: "Passe croisée, changement d'aile en diagonale longue", category: "technique",
    objectif: "Maîtriser la longue diagonale pour changer le point d'attaque d'un couloir à l'autre", duree: 15, nbJoueurs: "Binômes espacés en diagonale",
    materiel: "Ballons, plots pour marquer les zones de départ et réception",
    description: "Passes longues en diagonale d'un couloir à l'autre du terrain, à travailler en trajectoire tendue puis en cloche selon la distance. Insister sur la qualité du contrôle du réceptionneur à l'arrivée, souvent le point faible de cette passe en match plutôt que la frappe elle-même.",
    diagram: [pel("playerA", 0.2, 0.2, { number: 1 }), pel("playerA", 0.8, 0.8, { number: 2 }), pel("ball", 0.28, 0.24), ael("arrowPass", 0.2, 0.2, 0.8, 0.8)],
  },
  {
    name: "Passe verticale entre les lignes", category: "technique",
    objectif: "Maîtriser la passe tranchante dans un couloir de jeu étroit entre deux lignes adverses", duree: 15, nbJoueurs: "1 passeur, 1 receveur entre deux lignes de plots, 1 joueur cible",
    materiel: "Ballons, plots pour marquer les deux lignes adverses",
    description: "Un couloir étroit est délimité par deux lignes de plots représentant une ligne défensive et une ligne médiane adverses. Le passeur doit trouver un partenaire positionné exactement entre les deux lignes, une passe à risque mais à haute valeur si elle est réussie, techniquement exigeante en précision et en timing.",
    diagram: [pel("playerA", 0.15, 0.5, { number: 1 }), pel("playerA", 0.55, 0.5, { number: 2 }), pel("ball", 0.22, 0.5), zel(0.4, 0.3, 0.7, 0.7)],
  },
  {
    name: "Passe amortie en mouvement", category: "technique",
    objectif: "Enchaîner fluidement un amorti et une passe sans temps mort", duree: 15, nbJoueurs: "3-4 joueurs en rotation, en mouvement continu",
    materiel: "Ballons, plots",
    description: "Le joueur reçoit un ballon qui arrive avec de la vitesse ou en hauteur modérée, l'amortit en un geste fluide qui oriente déjà vers le prochain partenaire, puis enchaîne la passe sans marquer de temps d'arrêt entre les deux gestes. Travailler la fluidité de l'enchaînement plutôt que chaque geste isolément.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Passe en une touche sous angle fermé", category: "technique",
    objectif: "Maîtriser la passe technique quand l'angle de réception est très fermé", duree: 15, nbJoueurs: "Trios, proche d'une ligne de touche simulée",
    materiel: "Ballons, plots pour marquer la ligne de touche",
    description: "Le receveur se positionne proche d'une ligne de touche simulée, avec un angle de passe très fermé vers son partenaire. Travailler la surface de contact adaptée (souvent l'extérieur du pied ou une ouverture du pied plus prononcée) pour réussir la passe malgré la contrainte d'angle, une situation fréquente en match sur les couloirs.",
    diagram: [pel("playerA", 0.85, 0.15, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("ball", 0.8, 0.2)],
  },
  {
    name: "Passe tendue rasante sous pression de temps", category: "technique",
    objectif: "Automatiser la passe rasante rapide pour éviter l'interception dans les couloirs de passe encombrés", duree: 15, nbJoueurs: "4-5 joueurs en possession contre 2 intercepteurs",
    materiel: "Ballons, plots, chasubles",
    description: "Jeu de passes où les couloirs de passe sont partiellement obstrués par des intercepteurs, obligeant des passes rasantes et rapides plutôt que des trajectoires plus hautes et plus lentes, plus facilement interceptées. Travailler la vitesse d'exécution du geste technique sous cette contrainte de temps.",
    diagram: genVs(5, 2, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
];

const STARTER_EXERCISES_TECHNIQUE_AUTRES = [
  {
    name: "Contrôle orienté vers l'extérieur sous pression", category: "technique",
    objectif: "Automatiser le contrôle qui échappe au marquage en s'orientant vers l'espace libre extérieur", duree: 15, nbJoueurs: "Trios (1 receveur, 1 défenseur dans le dos, 1 passeur)",
    materiel: "Ballons, plots",
    description: "Le receveur est suivi de près par un défenseur placé dans son dos au moment de la réception. Il doit contrôler orienté vers l'extérieur du défenseur (pas vers l'axe où le défenseur peut intervenir) pour créer immédiatement de la distance. Travailler la première touche comme une véritable action offensive, pas seulement une préparation.",
    diagram: [pel("playerB", 0.52, 0.5), pel("playerA", 0.45, 0.5, { number: 1 }), pel("ball", 0.35, 0.5)],
  },
  {
    name: "Contrôle en pivot, orientation à 180 degrés", category: "technique",
    objectif: "Maîtriser le contrôle qui retourne complètement l'orientation du jeu", duree: 15, nbJoueurs: "Trios en triangle",
    materiel: "Ballons, plots",
    description: "Le receveur reçoit dos à la direction qu'il veut prendre et doit, en un ou deux contacts, retourner complètement son orientation pour repartir dans la direction opposée. Geste technique exigeant qui demande un travail des appuis autant que du contact de balle lui-même.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("playerA", 0.7, 0.3, { number: 2 }), pel("playerA", 0.3, 0.7, { number: 3 })],
  },
  {
    name: "Frappe extérieur du pied", category: "technique",
    objectif: "Maîtriser la frappe à l'extérieur du pied pour surprendre le gardien sans changer d'appui", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes à l'extérieur du pied, une surface qui permet de frapper sans ouvrir le corps ni changer d'appui, utile en espace réduit près de la surface. Travailler la précision plutôt que la puissance, cette surface étant naturellement moins puissante que l'intérieur du pied ou le coup de pied classique.",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Frappe enroulée courte vers la lucarne", category: "technique",
    objectif: "Travailler la frappe enroulée à courte-moyenne distance", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage, plots pour marquer les zones de frappe",
    description: "Séries de frappes enroulées (contact excentré du pied pour donner de l'effet) depuis des positions de mi-distance, avec la cible orientée vers la lucarne opposée à la surface de frappe. Distinct des frappes enroulées excentrées déjà travaillées en tactique — ici l'accent est purement sur la maîtrise technique du geste, indépendamment de la position sur le terrain.",
    diagram: genTechniqueShot({ cones: false }),
  },
];

const STARTER_EXERCISES_FOOT5_TACTIQUE = [
  {
    name: "Le bon but (orientation du jeu)", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Reconnaître son propre but à défendre et le but adverse à attaquer", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "2 petits buts ou cages, chasubles",
    description: "Match libre à 5 contre 5 avec une seule consigne : courir vers le bon but quand on a le ballon. Le coach félicite chaque fois qu'un enfant s'oriente correctement, sans reprocher les erreurs. À cet âge, la simple compréhension \"je cours vers CE but-là\" est déjà un vrai apprentissage, pas un acquis évident.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le copain démarqué (jeu de la passe qui compte)", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de faire une passe à un copain libre", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles, un objet bruyant ou visuel (sifflet, foulard) pour féliciter",
    description: "Match libre où chaque passe réussie vers un copain non-marqué est immédiatement célébrée bruyamment par le coach (applaudissement, cri de joie). L'objectif n'est pas la performance mais l'association émotionnelle positive entre \"passer le ballon\" et \"faire plaisir\", pour donner envie de recommencer plutôt que de toujours vouloir garder le ballon seul.",
    diagram: genVs(5, 5, { zone: [0.15, 0.1, 0.85, 0.9] }),
  },
  {
    name: "Ne pas être tous en grappe autour du ballon", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir progressivement l'idée d'occuper l'espace plutôt que de suivre le ballon en groupe", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Plots de couleurs pour marquer des zones larges, chasubles",
    description: "Le terrain est divisé en 2-3 grandes zones de couleur, et chaque enfant reçoit la consigne ludique de rester principalement \"dans sa couleur\" pendant le jeu. Approche très simplifiée et concrète (visuelle, par la couleur) de la notion d'occupation de l'espace, bien plus adaptée à cet âge qu'une explication verbale abstraite de \"il faut s'écarter\".",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Tout le monde gardien à son tour", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Familiariser chaque enfant avec le poste de gardien, sans spécialisation précoce", duree: 15, nbJoueurs: "5 contre 5, gardien tournant",
    materiel: "Petits buts, chasubles, un moyen simple de faire tourner le poste (foulard porté par le gardien du moment)",
    description: "Le poste de gardien change toutes les 3-4 minutes entre tous les enfants de l'équipe, y compris ceux qui n'aiment pas spontanément ce poste. À cet âge, la spécialisation précoce sur un poste est déconseillée — chacun doit découvrir toutes les facettes du jeu, y compris le gardien de but.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le retour rapide après avoir perdu le ballon", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement l'idée de revenir vers son but après une perte de balle", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Match libre où le coach signale positivement (sans jamais gronder) chaque enfant qui repart vers son propre but après une perte de balle. Une notion présentée comme un jeu (\"qui revient le plus vite vers notre but ?\") plutôt que comme une obligation défensive abstraite, pour rester dans le plaisir plutôt que la contrainte.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le petit relais (1 passe avant de marquer)", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Introduire très simplement la notion de jeu collectif avant la finition", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Règle du jeu simplifiée : chaque but marqué doit être précédé d'au moins une passe à un copain (même ratée, l'intention suffit). Encourage la recherche du copain plutôt que la course solitaire systématique vers le but, sans pour autant complexifier le jeu par des consignes tactiques abstraites.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
];

const STARTER_EXERCISES_FOOT8_TECHNIQUE = [
  {
    name: "Passe et contrôle en mouvement", category: "technique", ageFormat: "foot_a_8",
    objectif: "Consolider la passe et le contrôle de base, cette fois en mouvement", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots",
    description: "Passes échangées entre deux joueurs qui se déplacent en continu, avec une consigne de qualité un peu plus exigeante que la simple découverte du Foot à 5 (précision sur le partenaire, contrôle qui prépare la passe suivante). Premier pas vers une exigence technique plus construite, sans perdre le plaisir du jeu.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Le slalom technique chronométré", category: "technique", ageFormat: "foot_a_8",
    objectif: "Introduire un objectif de précision et de vitesse dans la conduite de balle", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots resserrés, ballons, chronomètre",
    description: "Slalom plus resserré que celui du Foot à 5, avec un chronométrage introduit comme un défi personnel à améliorer (pas une comparaison entre enfants). Premier pas vers l'exigence technique du slalom \"standard\", tout en gardant un cadre bienveillant sur le classement des temps.",
    diagram: genSlalom(6),
  },
  {
    name: "Première frappe technique", category: "technique", ageFormat: "foot_a_8",
    objectif: "Introduire une première correction technique simple sur la frappe", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes où le coach introduit une consigne technique simple et unique à la fois (ex. \"le pied d'appui à côté du ballon\", \"regarde le ballon au contact\"), contrairement au Foot à 5 où aucune consigne technique n'était donnée. Une seule correction à la fois, jamais plusieurs simultanément à cet âge.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "Le jeu à deux touches", category: "technique", ageFormat: "foot_a_8",
    objectif: "Accélérer la prise de décision par une contrainte simple de touches", duree: 15, nbJoueurs: "6 contre 6 en possession",
    materiel: "Plots, chasubles",
    description: "Jeu de possession avec la règle des deux touches maximum par joueur (contrôle puis passe). Introduit une contrainte technique et cognitive nouvelle à cet âge, qui prépare progressivement aux exigences plus fortes des exercices techniques \"standard\" tout en restant accessible.",
    diagram: genVs(6, 6, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Découvrir le crochet simple", category: "technique", ageFormat: "foot_a_8",
    objectif: "Introduire un premier geste technique d'élimination", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Introduction d'un seul geste technique (le crochet intérieur, le plus simple à assimiler) décomposé lentement puis répété à vitesse progressive. Contrairement au catalogue complet de gestes de dribble travaillé en standard, ici on se concentre sur un seul geste bien maîtrisé avant d'en introduire un second plus tard dans la saison.",
    diagram: genDribbleMove(),
  },
  {
    name: "Le contrôle orienté, première approche", category: "technique", ageFormat: "foot_a_8",
    objectif: "Introduire la notion de contrôle qui prépare l'action suivante", duree: 15, nbJoueurs: "Trios en rotation",
    materiel: "Ballons, plots pour marquer une direction cible",
    description: "Le receveur doit contrôler le ballon en le dirigeant vers un plot cible plutôt que de le contrôler simplement devant lui. Introduction simple et concrète de la notion de contrôle orienté, avant la version plus exigeante (sous pression défensive) travaillée dans les exercices techniques standard.",
    diagram: genPassingGrid(3),
  },
  {
    name: "La passe précise sur cible mobile", category: "technique", ageFormat: "foot_a_8",
    objectif: "Développer la précision de passe vers un partenaire en mouvement", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots",
    description: "Le receveur se déplace latéralement pendant que le passeur doit ajuster sa passe pour qu'elle arrive dans les pieds malgré le mouvement. Plus exigeant que la passe à l'arrêt du Foot à 5, introduit la notion d'anticipation du mouvement du partenaire.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Ateliers techniques tournants", category: "technique", ageFormat: "foot_a_8",
    objectif: "Multiplier les répétitions sur plusieurs gestes techniques de base en un minimum de temps mort", duree: 20, nbJoueurs: "8-12, répartis sur 3-4 ateliers",
    materiel: "Plots, ballons, cages si disponibles",
    description: "Plusieurs ateliers en rotation (passe, conduite, frappe, contrôle) sur des durées courtes (4-5 minutes chacun) pour maintenir l'engagement et la variété, une organisation qui convient bien à la capacité d'attention encore limitée mais grandissante de cet âge.",
    diagram: genPassingGrid(4),
  },
];

const STARTER_EXERCISES_NATIONS2_TACTIQUE_11 = [
  {
    name: "Jeu excentré et brio individuel à l'aile", category: "tactique", ageFormat: "standard",
    objectif: "Développer le brio technique individuel dans les couloirs", duree: 20, nbJoueurs: "1 ailier contre 1-2 défenseurs, avec soutiens",
    materiel: "Plots, petites cages, ballons",
    description: "Situations répétées d'ailier isolé face à un ou deux défenseurs dans le couloir, avec liberté totale de prise de risque individuelle (dribble, crochet, centre) avant une conclusion.",
    diagram: genVs(1, 2, { xA: 0.55, xB: 0.75, hasKeeper: true }),
  },
  {
    name: "Bloc compact et combativité collective", category: "tactique", ageFormat: "standard",
    objectif: "Développer la solidité défensive collective et la combativité", duree: 20, nbJoueurs: "6 défenseurs contre 5 attaquants",
    materiel: "Plots, chasubles",
    description: "Travail défensif insistant sur la compacité du bloc et l'engagement total dans chaque duel, sans jamais céder facilement un espace ou un ballon.",
    diagram: genLine(6, 5),
  },
  {
    name: "Circulation précise et discipline collective", category: "tactique", ageFormat: "standard",
    objectif: "Développer la discipline tactique et l'harmonie collective", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Jeu à thème où chaque joueur doit respecter strictement son rôle et sa position pendant la circulation du ballon, avec une exigence de précision technique élevée et de discipline collective.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
];

const STARTER_EXERCISES_NATIONS2_TECHNIQUE_11 = [
  {
    name: "Feinte de corps à vitesse maximale", category: "technique", ageFormat: "standard",
    objectif: "Développer la feinte technique exécutée à pleine vitesse", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Répétition de feintes de corps (stepovers) enchaînées à vitesse de course maximale, plutôt qu'à vitesse modérée.",
    diagram: genDribbleMove(),
  },
  {
    name: "Dégagement et jeu de tête défensif puissant", category: "technique", ageFormat: "standard",
    objectif: "Développer la solidité technique défensive, notamment aérienne", duree: 15, nbJoueurs: "Binômes ou petits groupes en rotation",
    materiel: "Ballons",
    description: "Travail technique du jeu de tête défensif (dégagement puissant, timing du saut, contact frontal) et du dégagement au pied sous pression.",
    diagram: [pel("playerA", 0.35, 0.5, { number: 1 }), pel("ball", 0.5, 0.3), pel("playerB", 0.45, 0.5)],
  },
  {
    name: "Passe précise sous contrainte technique stricte", category: "technique", ageFormat: "standard",
    objectif: "Développer l'exigence technique et la discipline", duree: 15, nbJoueurs: "4-5 joueurs en rotation",
    materiel: "Plots pour marquer des cibles précises, ballons",
    description: "Passes devant impérativement atteindre une cible précise et étroite (entre deux plots rapprochés), avec sanction immédiate et bienveillante en cas d'imprécision (reprendre la série).",
    diagram: genPassingGrid(4),
  },
];

const STARTER_EXERCISES_NATIONS2_ATHLETIQUE_11 = [
  {
    name: "Vitesse et agilité de couloir", category: "athletique", ageFormat: "standard",
    objectif: "Développer un profil athlétique adapté au jeu rapide de couloir", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots, chronomètre",
    description: "Enchaînement de sprints courts et de changements de direction rapides simulant les courses répétées d'un ailier en couloir.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Puissance de contact et duels physiques", category: "athletique", ageFormat: "standard",
    objectif: "Développer la combativité physique dans les duels", duree: 15, nbJoueurs: "Binômes en opposition",
    materiel: "Plots, ballons",
    description: "Exercices de duels physiques encadrés (protection de balle épaule contre épaule, luttes pour la possession en zone réduite) développant la puissance de contact.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerB", 0.55, 0.5), pel("ball", 0.43, 0.5)],
  },
  {
    name: "Endurance et discipline de course", category: "athletique", ageFormat: "standard",
    objectif: "Développer l'endurance et le travail incessant sur le terrain", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Course continue à allure soutenue et constante sur une durée prolongée, avec une exigence de régularité et de discipline dans l'effort plutôt que des pointes de vitesse.",
    diagram: genSprintLanes(2),
  },
];

const STARTER_EXERCISES_FFF_SENIORS = [
  {
    name: "Créer l'espace par le mouvement collectif permanent", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Créer et utiliser des espaces",
    objectif: "Maîtriser la création d'espace par des mouvements collectifs coordonnés et permanents", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où la création d'espace ne dépend plus d'un placement statique mais d'un mouvement collectif permanent (rotations, appels contradictoires, occupation dynamique des couloirs), exigeant une lecture de jeu totalement automatisée à ce niveau.",
    diagram: genVs(10, 10, { zone: [0.03, 0.03, 0.97, 0.97] }),
  },
  {
    name: "Percer les lignes d'un bloc compact et discipliné", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Jouer dans les intervalles et entre les lignes",
    objectif: "Réussir la passe dans l'intervalle face à un bloc adulte compact et disciplin", duree: 20, nbJoueurs: "9 contre 9",
    materiel: "Plots, chasubles",
    description: "Jeu complet face à un bloc défensif organisé selon les standards adultes (compacité maximale, couverture mutuelle systématique), où trouver l'intervalle demande une combinaison de patience collective et de rupture soudaine.",
    diagram: genVs(9, 9, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Change d'aile instantané sur bloc orienté", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Jouer à l'opposé après avoir fixé collectivement",
    objectif: "Exploiter instantanément un bloc adverse orienté d'un côté", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où l'équipe doit reconnaître le moment exact où le bloc adverse est maximalement orienté d'un côté pour déclencher le changement d'aile, une décision collective fine plutôt qu'une exécution mécanique.",
    diagram: genVs(10, 10, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Surnombre exploité par automatismes collectifs", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Jouer combiné pour créer un surnombre",
    objectif: "Exploiter un surnombre par des automatismes de combinaison pleinement intégrés", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où les combinaisons créant un surnombre local doivent être exécutées comme des automatismes déjà travaillés à l'entraînement, avec une vitesse d'exécution qui ne laisse plus de place à l'hésitation.",
    diagram: genVs(10, 10, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Finir vite après le démarquage décisif", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Se démarquer pour fixer et éliminer, passer ou finir",
    objectif: "Automatiser totalement l'enchaînement démarquage-décision-exécution", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où l'enchaînement démarquage puis action finale (élimination, passe décisive, tir) doit être quasi instantané et exécuté avec la qualité technique attendue au niveau senior, sans marge d'apprentissage supplémentaire.",
    diagram: genVs(10, 10, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Réorganisation collective à pleine vitesse de jeu", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Freiner la progression de l'adversaire, organiser et réorganiser les alignements",
    objectif: "Maîtriser le ralentissement et la réorganisation à la vitesse réelle du jeu senior", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet à pleine vitesse où le ralentissement de la progression adverse et la réorganisation des lignes doivent s'exécuter sans délai, avec une communication collective déjà rodée plutôt qu'en construction.",
    diagram: genVs(10, 10, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Gérer une infériorité prolongée en match", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "S'organiser en déséquilibre",
    objectif: "Maintenir une organisation défensive solide en infériorité sur une durée prolongée", duree: 20, nbJoueurs: "9 défenseurs contre 10 attaquants",
    materiel: "Plots, chasubles",
    description: "Simulation d'une situation d'exclusion en match (infériorité numérique prolongée), exigeant une réorganisation tactique complète et maintenue sur la durée, une situation typiquement rencontrée au niveau senior en compétition.",
    diagram: genVs(10, 9, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Moduler la densité de l'axe selon le plan de jeu", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Densifier et être actif dans le CJD (axe ballon-but)",
    objectif: "Adapter la densité défensive de l'axe selon le plan de jeu et l'adversaire du jour", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où la densité de l'axe ballon-but n'est plus une simple lecture ponctuelle du danger mais s'inscrit dans un plan de jeu réfléchi en amont selon les forces de l'adversaire du jour, intégrant l'analyse tactique au geste défensif.",
    diagram: genLine(10, 10),
  },
  {
    name: "Décider sous pression maximale en fin de match", category: "tactique", ageFormat: "standard",
    fffBracket: "seniors", fffCategory: "Défendre son but, récupérer ou dégager le ballon",
    objectif: "Maintenir la qualité de décision entre dégagement et relance sous fatigue et enjeu", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Petites cages, chasubles, ballons",
    description: "Situation de fin de match simulée (fatigue accumulée, enjeu du résultat) où la décision entre dégager en sécurité et relancer construit doit rester juste malgré la pression physique et mentale, une exigence propre au haut niveau senior.",
    diagram: genLine(10, 10),
  },
];

const STARTER_EXERCISES_FFF_U16_19 = [
  {
    name: "Étirer le bloc dans les trois dimensions du jeu", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Créer et utiliser des espaces",
    objectif: "Maîtriser la création d'espace combinant largeur, profondeur et mobilité", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Jeu à thème exigeant l'occupation simultanée de la largeur et de la profondeur, avec en plus des permutations de poste ponctuelles pour désorganiser les repères défensifs adverses. Niveau proche de l'exigence adulte, avec un accompagnement encore présent sur la lecture collective.",
    diagram: genVs(8, 8, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Jouer entre les lignes face à un bloc organisé", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Jouer dans les intervalles et entre les lignes",
    objectif: "Réussir la passe entre les lignes face à un bloc défensif complet et organisé", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Contrairement aux versions plus jeunes travaillées en surnombre ou en situation isolée, ici l'exercice se joue en jeu complet à effectif égal face à un bloc défensif organisé, se rapprochant des conditions réelles de match à ce niveau.",
    diagram: genVs(8, 8, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Changer de côté en une touche de balle", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Jouer à l'opposé après avoir fixé collectivement",
    objectif: "Exécuter le changement de côté à très haute vitesse d'exécution", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Exigence maximale de vitesse d'exécution : une fois la défense fixée, le ballon doit être changé de côté en une seule touche de balle par relais, pour exploiter l'espace avant toute réorganisation défensive adverse.",
    diagram: genVs(8, 8, { zone: [0.08, 0.08, 0.92, 0.92] }),
  },
  {
    name: "Surnombre construit en jeu complet", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Jouer combiné pour créer un surnombre",
    objectif: "Créer et exploiter un surnombre local en situation de jeu complet", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Contrairement aux situations isolées de surnombre travaillées plus jeune, ici le surnombre doit être créé par le mouvement collectif au sein d'un jeu à effectif complet, une compétence plus proche des exigences tactiques adultes.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Enchaîner démarquage et prise de décision experte", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Se démarquer pour fixer et éliminer, passer ou finir",
    objectif: "Automatiser la prise de décision rapide après démarquage en jeu réel", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Jeu complet où chaque démarquage doit déboucher sur une décision quasi instantanée, sans le temps de réflexion encore accordé aux catégories plus jeunes — le rythme se rapproche de celui exigé en match senior.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Freiner et réorganiser en jeu complet", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Freiner la progression de l'adversaire, organiser et réorganiser les alignements",
    objectif: "Maîtriser le ralentissement collectif et la réorganisation en situation réelle", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Contrairement aux situations à effectif réduit travaillées plus jeune, ici le ralentissement de la progression adverse et la réorganisation des lignes se travaillent en jeu complet à onze proche, avec une communication collective de haut niveau attendue.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "S'organiser en infériorité en jeu réel", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "S'organiser en déséquilibre",
    objectif: "Gérer l'infériorité numérique dans un contexte de jeu complet", duree: 20, nbJoueurs: "7 défenseurs contre 8 attaquants",
    materiel: "Plots, chasubles",
    description: "Situation d'infériorité numérique proche de l'effectif complet, exigeant une gestion collective sophistiquée (concessions choisies, communication permanente) plutôt qu'un simple ajustement à petite échelle.",
    diagram: genVs(8, 7, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Adapter la densité de l'axe selon le danger réel", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Densifier et être actif dans le CJD (axe ballon-but)",
    objectif: "Maîtriser la lecture fine du danger pour moduler la densité défensive", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Jeu complet où les défenseurs doivent lire en continu le niveau de danger réel (position du ballon, joueurs adverses disponibles) pour ajuster finement leur densité dans l'axe ballon-but, une compétence proche de l'exigence tactique adulte.",
    diagram: genLine(8, 8),
  },
  {
    name: "Décider entre dégagement et relance en contexte réel", category: "tactique", ageFormat: "standard",
    fffBracket: "u16_19", fffCategory: "Défendre son but, récupérer ou dégager le ballon",
    objectif: "Automatiser la décision entre sécurité et relance selon le contexte de jeu réel", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Petites cages, chasubles, ballons",
    description: "Jeu complet où la décision entre dégager en sécurité et relancer construit doit se prendre en une fraction de seconde selon la pression réelle, sans la simplification encore présente dans les catégories plus jeunes.",
    diagram: genLine(8, 8),
  },
];

const STARTER_EXERCISES_FFF_U12_13 = [
  {
    name: "Jouer sur toute la surface du terrain", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Créer et utiliser des espaces",
    objectif: "Combiner largeur et profondeur pour maximiser l'espace utile", duree: 15, nbJoueurs: "7 contre 7",
    materiel: "Plots pour marquer les limites, chasubles",
    description: "Jeu à thème où l'équipe doit occuper à la fois la largeur (couloirs) et la profondeur (une joueuse ou un joueur haut, un bas) pour étirer le bloc adverse dans les deux dimensions. Va plus loin que la version U10-U11 centrée uniquement sur la largeur.",
    diagram: genVs(7, 7, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Passer entre les lignes sous pression", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Jouer dans les intervalles et entre les lignes",
    objectif: "Réussir la passe dans l'intervalle malgré une défense active", duree: 15, nbJoueurs: "2 passeurs, 1 receveur entre deux lignes, 2 défenseurs actifs",
    materiel: "Ballons, plots",
    description: "Même principe que la version U10-U11, mais avec des défenseurs actifs qui tentent réellement de couper la passe plutôt que des lignes de plots statiques. Exige une meilleure lecture du timing et de l'angle de passe.",
    diagram: [pel("playerA", 0.15, 0.4, { number: 1 }), pel("playerA", 0.15, 0.6, { number: 2 }), pel("playerA", 0.55, 0.5, { number: 3 }), pel("playerB", 0.35, 0.45), pel("playerB", 0.35, 0.55)],
  },
  {
    name: "Changer de côté en deux passes maximum", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Accélérer le changement de côté après avoir fixé", duree: 20, nbJoueurs: "7 contre 7",
    fffBracket: "u12_13", fffCategory: "Jouer à l'opposé après avoir fixé collectivement",
    materiel: "Plots, chasubles",
    description: "Même principe que la version U10-U11, avec une contrainte supplémentaire : une fois la défense fixée d'un côté, le changement de côté doit se faire en deux passes maximum pour rester réellement dangereux plutôt que trop lent.",
    diagram: genVs(7, 7, { zone: [0.08, 0.08, 0.92, 0.92] }),
  },
  {
    name: "Surnombre à quatre contre trois", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Jouer combiné pour créer un surnombre",
    objectif: "Exploiter une combinaison à plus grande échelle qu'en U10-U11", duree: 15, nbJoueurs: "4 contre 3",
    materiel: "Plots, petites cages, ballons",
    description: "Situation à 4 contre 3 (plutôt que 3 contre 2 en U10-U11), qui demande une coordination entre davantage de joueurs pour exploiter le surnombre efficacement, avec plus de solutions possibles mais aussi plus de complexité de lecture.",
    diagram: genVs(4, 3, { xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Décider vite après le démarquage", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Se démarquer pour fixer et éliminer, passer ou finir",
    objectif: "Accélérer la prise de décision après un démarquage réussi", duree: 15, nbJoueurs: "7 contre 7",
    materiel: "Plots, chasubles, chronomètre",
    description: "Même principe que la version U10-U11, avec une contrainte de temps introduite : une fois démarqué, le joueur doit décider (éliminer, passer, tirer) en un temps limité plutôt que de réfléchir longuement, pour se rapprocher du rythme réel du match.",
    diagram: genVs(7, 7, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Communiquer pour ralentir et se replacer", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Freiner la progression de l'adversaire, organiser et réorganiser les alignements",
    objectif: "Ajouter la communication explicite au ralentissement défensif", duree: 15, nbJoueurs: "5 défenseurs contre 6 attaquants",
    materiel: "Plots, chasubles",
    description: "Même principe que la version U10-U11 mais à plus grande échelle, avec une exigence de communication verbale explicite entre défenseurs (qui freine, qui couvre, qui replace) pendant l'action, pas seulement après.",
    diagram: genVs(6, 5, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "S'organiser à cinq contre six", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "S'organiser en déséquilibre",
    objectif: "Gérer l'infériorité numérique à plus grande échelle qu'en U10-U11", duree: 15, nbJoueurs: "5 défenseurs contre 6 attaquants",
    materiel: "Plots, chasubles",
    description: "Même principe que la version U10-U11, mais à une échelle plus large (5 contre 6 plutôt que 3 contre 4), ce qui complexifie la communication et les choix collectifs nécessaires pour limiter les dégâts.",
    diagram: genVs(6, 5, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Basculer entre densité et largeur", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Densifier et être actif dans le CJD (axe ballon-but)",
    objectif: "Apprendre à alterner entre densifier l'axe et couvrir la largeur selon le danger", duree: 20, nbJoueurs: "6 défenseurs contre 6 attaquants",
    materiel: "Plots pour marquer l'axe et les couloirs, chasubles",
    description: "Contrairement à la version U10-U11 qui reste concentrée sur l'axe en permanence, ici les défenseurs doivent lire le danger réel pour choisir entre se concentrer dans l'axe ou glisser vers la largeur, une nuance plus avancée du même principe.",
    diagram: genLine(6, 6),
  },
  {
    name: "Choisir entre dégager et relancer", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u12_13", fffCategory: "Défendre son but, récupérer ou dégager le ballon",
    objectif: "Développer la prise de décision entre sécurité et relance après récupération", duree: 15, nbJoueurs: "6 contre 6",
    materiel: "Petites cages, chasubles, ballons",
    description: "Même principe que la version U10-U11, avec une exigence de lecture plus fine : selon la pression adverse restante après la récupération, choisir consciemment entre dégager en sécurité ou relancer construit, plutôt qu'un choix systématique.",
    diagram: genLine(6, 6),
  },
];

const STARTER_EXERCISES_FFF_U10_11 = [
  {
    name: "Écarter le jeu pour ouvrir l'espace", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Créer et utiliser des espaces",
    objectif: "Découvrir comment la largeur du jeu crée des espaces exploitables", duree: 15, nbJoueurs: "6 contre 6",
    materiel: "Plots pour marquer les limites, chasubles",
    description: "Jeu à thème où l'équipe en possession doit occuper les couloirs extérieurs avant de chercher à progresser dans les espaces ainsi créés.",
    diagram: genVs(6, 6, { zone: [0.1, 0.08, 0.9, 0.92] }),
  },
  {
    name: "Trouver le couloir entre deux lignes", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Jouer dans les intervalles et entre les lignes",
    objectif: "Découvrir la passe et le déplacement dans les intervalles adverses", duree: 15, nbJoueurs: "1 passeur, 1 receveur entre deux lignes de plots, 1 cible",
    materiel: "Ballons, plots pour marquer deux lignes",
    description: "Un couloir est délimité par deux lignes de plots représentant une ligne défensive et médiane adverses. Le passeur doit trouver un partenaire positionné entre les deux lignes.",
    diagram: [pel("playerA", 0.15, 0.5, { number: 1 }), pel("playerA", 0.55, 0.5, { number: 2 }), pel("ball", 0.22, 0.5), zel(0.4, 0.3, 0.7, 0.7)],
  },
  {
    name: "Fixer puis changer de côté", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Jouer à l'opposé après avoir fixé collectivement",
    objectif: "Découvrir le changement de côté après avoir attiré la défense d'un côté", duree: 20, nbJoueurs: "6 contre 6",
    materiel: "Plots, chasubles",
    description: "Jeu à thème où l'équipe doit faire circuler le ballon d'un côté pour attirer la défense, puis changer rapidement de côté pour exploiter l'espace laissé libre.",
    diagram: genVs(6, 6, { zone: [0.1, 0.08, 0.9, 0.92] }),
  },
  {
    name: "Se combiner pour être plus nombreux", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Jouer combiné pour créer un surnombre",
    objectif: "Découvrir comment une combinaison à deux ou trois crée un surnombre local", duree: 15, nbJoueurs: "3 contre 2",
    materiel: "Plots, petites cages, ballons",
    description: "Situation à 3 contre 2 où les attaquants doivent se combiner (une-deux, appel-remise) pour créer une supériorité locale et exploiter l'espace ainsi ouvert.",
    diagram: genVs(3, 2, { xA: 0.4, xB: 0.6 }),
  },
  {
    name: "Se démarquer pour aider son équipe", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Se démarquer pour fixer et éliminer, passer ou finir",
    objectif: "Découvrir les différentes façons d'utiliser un démarquage réussi", duree: 15, nbJoueurs: "6 contre 6",
    materiel: "Plots, chasubles",
    description: "Jeu à thème où chaque démarquage réussi doit déboucher sur une des trois options possibles : éliminer un adversaire, passer à un partenaire, ou tirer au but.",
    diagram: genVs(6, 6, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Ralentir et se réorganiser", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Freiner la progression de l'adversaire, organiser et réorganiser les alignements",
    objectif: "Découvrir comment retarder l'attaque adverse pour laisser le temps de se replacer", duree: 15, nbJoueurs: "4 défenseurs contre 5 attaquants",
    materiel: "Plots, chasubles",
    description: "Situation où les défenseurs en infériorité doivent freiner la progression adverse (sans forcément récupérer immédiatement) pour laisser le temps au reste de l'équipe de se réorganiser.",
    diagram: genVs(5, 4, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "S'organiser quand on est moins nombreux", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "S'organiser en déséquilibre",
    objectif: "Découvrir comment s'organiser collectivement en infériorité numérique", duree: 15, nbJoueurs: "3 défenseurs contre 4 attaquants",
    materiel: "Plots, chasubles",
    description: "Situation où les défenseurs doivent s'organiser collectivement (qui presse, qui couvre) malgré le désavantage numérique.",
    diagram: genVs(4, 3, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Rester actif dans l'axe ballon-but", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Densifier et être actif dans le CJD (axe ballon-but)",
    objectif: "Découvrir l'importance de densifier l'axe entre le ballon et son propre but", duree: 15, nbJoueurs: "5 défenseurs contre 4 attaquants",
    materiel: "Plots pour marquer l'axe central, chasubles",
    description: "Les défenseurs doivent rester particulièrement actifs et nombreux dans l'axe direct entre le ballon et leur propre but (le \"couloir de jeu direct\"), plutôt que de se disperser sur toute la largeur.",
    diagram: genLine(5, 4),
  },
  {
    name: "Défendre, récupérer, dégager", category: "tactique", ageFormat: "foot_a_8",
    fffBracket: "u10_11", fffCategory: "Défendre son but, récupérer ou dégager le ballon",
    objectif: "Découvrir l'enchaînement complet de la défense jusqu'à la récupération", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petites cages, chasubles, ballons",
    description: "Jeu à thème qui valorise l'enchaînement complet : défendre son but, récupérer le ballon, puis choisir de dégager en sécurité ou de relancer selon la situation.",
    diagram: genLine(5, 5),
  },
];

const STARTER_EXERCISES_FFF_U8_9 = [
  {
    name: "Conduis et élimine ton plot", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u8_9", fffCategory: "J'attaque individuellement",
    objectif: "Développer la conduite de balle avec un objectif simple à atteindre", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots, ballons",
    description: "L'enfant conduit son ballon en évitant des plots placés sur son chemin, avec un objectif clair (rejoindre une zone, marquer un but) à la fin du parcours. Version un peu plus structurée que la simple familiarisation U6-U7, avec un vrai petit défi individuel à la clé.",
    diagram: genSlalom(4),
  },
  {
    name: "On joue à plusieurs vers le but", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u8_9", fffCategory: "J'attaque collectivement",
    objectif: "Découvrir le jeu collectif avec plusieurs partenaires", duree: 15, nbJoueurs: "3 contre 3",
    materiel: "Petits buts, chasubles",
    description: "Petit match où le coach encourage les passes entre plusieurs copains avant de chercher le but, plutôt que le jeu à un seul partenaire de la catégorie U6-U7. Premier pas vers une vraie coordination collective à plusieurs joueurs.",
    diagram: genVs(3, 3, { xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Empêche-le de passer", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u8_9", fffCategory: "Je défends individuellement",
    objectif: "Développer la défense individuelle face à un adversaire qui progresse", duree: 15, nbJoueurs: "1 contre 1, en rotation",
    materiel: "Plots, ballons",
    description: "Duel 1 contre 1 où le défenseur essaie d'empêcher l'attaquant d'atteindre une ligne ou un petit but, avec une consigne un peu plus précise que la simple découverte de l'opposition en U6-U7. Célébrer chaque tentative défensive, réussie ou non.",
    diagram: genVs(1, 1, { xA: 0.3, xB: 0.55, hasKeeper: false }),
  },
  {
    name: "On défend ensemble à deux", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u8_9", fffCategory: "Je défends collectivement",
    objectif: "Découvrir la toute première entraide défensive", duree: 15, nbJoueurs: "2 contre 2",
    materiel: "Plots, petits buts, chasubles",
    description: "Petit jeu à 2 contre 2 où le coach félicite chaque fois que les deux défenseurs s'aident mutuellement plutôt que d'agir chacun de leur côté. Première graine de la défense collective, avant les concepts plus élaborés des catégories suivantes.",
    diagram: genVs(2, 2, { xA: 0.35, xB: 0.6 }),
  },
];

const STARTER_EXERCISES_RBFA = [
  // U6-U7 — "Ik en de bal" (moi et le ballon), format 2v2/3v3
  {
    name: "Moi et mon ballon, en mini-matchs", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u67", fffCategory: "Ik en de bal (2v2/3v3)",
    objectif: "Découvrir le jeu à très petit effectif, centré sur la relation joueur-ballon", duree: 15, nbJoueurs: "2 contre 2 ou 3 contre 3",
    materiel: "Petits buts ou plots, ballons",
    description: "Aucune notion de poste ou de système, uniquement la relation directe entre l'enfant et le ballon.",
    diagram: genVs(2, 2, { hasKeeper: false, zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Premiers contacts de balle en liberté", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u67", fffCategory: "Ik en de bal (2v2/3v3)",
    objectif: "Multiplier les contacts de balle individuels dans un cadre libre", duree: 15, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant, plots",
    description: "",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.42)],
  },
  {
    name: "Bouge et coordonne-toi en t'amusant", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u67", fffCategory: "Ik en de bal (2v2/3v3)",
    objectif: "Développer la coordination générale dans un cadre ludique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, cerceaux",
    description: "",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le plaisir avant tout : FUN = apprendre en jouant", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u67", fffCategory: "Ik en de bal (2v2/3v3)",
    objectif: "Ancrer le plaisir comme moteur principal de l'apprentissage", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque enfant est encouragé dans toutes ses initiatives et peut jouer librement, un principe jugé aussi important que tout contenu technique à cet âge.",
    diagram: [],
  },
  // U8-U9 — "Collectief spel dichtbij" (jeu collectif de proximité), format 5v5
  {
    name: "Jeu collectif de proximité à cinq", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u89", fffCategory: "Collectief spel dichtbij (5v5)",
    objectif: "Découvrir le jeu collectif rapproché avec des partenaires proches", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Première étape de la dimension collective après le \"moi et le ballon\".",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Passes et contrôles en mouvement", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u89", fffCategory: "Collectief spel dichtbij (5v5)",
    objectif: "Développer les techniques de base dans un contexte de jeu à cinq", duree: 15, nbJoueurs: "5 contre 5 ou ateliers en petits groupes",
    materiel: "Ballons, plots",
    description: "",
    diagram: genPassingGrid(4),
  },
  {
    name: "Vitesse et agilité par le jeu", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u89", fffCategory: "Collectief spel dichtbij (5v5)",
    objectif: "Développer la vitesse et l'agilité de façon ludique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots",
    description: "",
    diagram: genSprintLanes(3),
  },
  {
    name: "Construire sa confiance et sa motivation", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "RBFA", fffBracket: "be_u89", fffCategory: "Collectief spel dichtbij (5v5)",
    objectif: "Développer la motivation et la confiance en soi de base", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "",
    diagram: [],
  },
  // U10-U11 — 8v8 fase 1, dubbele ruit (double losange)
  {
    name: "Ouvrir large pour créer l'espace", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1011", fffCategory: "8v8 fase 1 — TeamTactics",
    objectif: "Découvrir le principe d'ouverture large en phase de possession", duree: 15, nbJoueurs: "8 contre 8 en double losange",
    materiel: "Plots, chasubles",
    description: "",
    diagram: genVs(8, 8, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
  {
    name: "Circulation en losange, passe de premier degré", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1011", fffCategory: "8v8 fase 1 — TeamTactics",
    objectif: "Automatiser la passe courte de progression entre les deux losanges", duree: 15, nbJoueurs: "8 contre 8 ou ateliers en losange",
    materiel: "Ballons, plots",
    description: "",
    diagram: genPassingGrid(4),
  },
  {
    name: "Pressing proactif sur le porteur", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1011", fffCategory: "8v8 fase 1 — TeamTactics",
    objectif: "Développer l'intensité physique du pressing individuel proactif", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "",
    diagram: genVs(8, 8, { zone: [0.2, 0.1, 0.8, 0.9] }),
  },
  {
    name: "Communication et relations interpersonnelles en losange", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1011", fffCategory: "8v8 fase 1 — TeamTactics",
    objectif: "Développer la communication entre partenaires dans le système en losange", duree: 10, nbJoueurs: "8 contre 8, intégré au jeu",
    materiel: "Aucun",
    description: "",
    diagram: [],
  },
  // U12-U13 — 8v8 fase 2, principes plus avancés
  {
    name: "Le challenge en dribble pour déséquilibrer", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1213", fffCategory: "8v8 fase 2 — TeamTactics",
    objectif: "Utiliser le dribble comme outil collectif pour déséquilibrer la défense", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Voir juste avant de recevoir, passe diagonale", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1213", fffCategory: "8v8 fase 2 — TeamTactics",
    objectif: "Maîtriser la passe diagonale qui prépare le contrôle orienté", duree: 15, nbJoueurs: "6 joueurs en rotation",
    materiel: "Ballons, plots",
    description: "",
    diagram: [pel("playerA", 0.2, 0.2, { number: 1 }), pel("playerA", 0.6, 0.6, { number: 2 }), pel("ball", 0.28, 0.24), ael("arrowPass", 0.2, 0.2, 0.6, 0.6)],
  },
  {
    name: "Duels physiques entre groupes homogènes", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1213", fffCategory: "8v8 fase 2 — TeamTactics",
    objectif: "Introduire prudemment le travail de force via des duels équilibrés", duree: 15, nbJoueurs: "Binômes de niveau physique proche",
    materiel: "Ballons, plots",
    description: "",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerB", 0.55, 0.5), pel("ball", 0.43, 0.5)],
  },
  {
    name: "Ne jamais perdre le duel : responsabilité individuelle", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "RBFA", fffBracket: "be_u1213", fffCategory: "8v8 fase 2 — TeamTactics",
    objectif: "Développer la responsabilité individuelle dans le duel défensif", duree: 10, nbJoueurs: "8 contre 8, intégré au jeu",
    materiel: "Aucun",
    description: "Une notion de responsabilité individuelle envers le collectif, propre à cet âge.",
    diagram: [],
  },
];

const STARTER_EXERCISES_FIGC = [
  // PICCOLI AMICI / PRIMI CALCI (5-8 ans) — les 6 stations réelles de l'eserciziario CFT
  {
    name: "Match modulaire, sans étiquette de poste", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Partita",
    objectif: "Jouer sans étiquettes de poste, en pure lecture de l'espace", duree: 15, nbJoueurs: "2v2 à 5v5 selon l'espace modulaire",
    materiel: "Plots, petites cages ou dossards pour les buts",
    description: "Aucun terme \"défenseur/milieu/attaquant\" n'est utilisé — les joueurs choisissent librement où se placer, avec un gardien qui change à chaque but.",
    diagram: genVs(3, 3, { zone: [0.1, 0.15, 0.9, 0.85] }),
  },
  {
    name: "La cage aux lions (collaboration)", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Collaborazione",
    objectif: "Découvrir le moment où l'aide d'un copain devient utile", duree: 15, nbJoueurs: "7 joueurs (5 avec ballon, 2 en soutien extérieur)",
    materiel: "Ballons, chasuble pour le \"lion\"",
    description: "Développe la lecture du moment où appeler à l'aide plutôt que forcer seul.",
    diagram: [pel("playerA", 0.4, 0.4, { number: 1 }), pel("playerB", 0.5, 0.5), pel("playerA", 0.7, 0.3, { number: 2 }), pel("ball", 0.38, 0.4)],
  },
  {
    name: "Les statues (duel)", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Duello",
    objectif: "Découvrir le duel 1 contre 1 sous une forme imprévisible et ludique", duree: 15, nbJoueurs: "10 joueurs (5 avec ballon, 5 \"statues\")",
    materiel: "Ballons",
    description: "Le camp d'arrivée du duel n'est jamais prévisible, ce qui développe l'adaptabilité plutôt que des repères figés.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, hasKeeper: false }),
  },
  {
    name: "Chacun pour soi (foot de rue)", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Calcio di strada",
    objectif: "Développer l'autonomie et l'auto-organisation, comme dans le foot de rue", duree: 15, nbJoueurs: "3-4 par groupe, plusieurs groupes en parallèle",
    materiel: "Objets du quotidien pour délimiter les buts (sacs, chaussures)",
    description: "L'objectif explicite est de transposer l'autonomie du foot de rue (\"au jardin de mamie\", \"à la récré\") dans un cadre structuré.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.5, { number: 3 }), pel("ball", 0.5, 0.4)],
  },
  {
    name: "Le passage à gué (motricité)", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Scoprire il movimento",
    objectif: "Découvrir des schémas moteurs variés dans un environnement imaginaire", duree: 15, nbJoueurs: "10 joueurs",
    materiel: "Plots, cerceaux, petits obstacles type haies, cordes à sauter",
    description: "Trois temps successifs : exploration libre, forme organisée, puis petit défi collectif.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le zoo (technique)", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "FIGC", fffBracket: "piccoli_primi", fffCategory: "Giochi di tecnica",
    objectif: "Développer la conduite de balle sous surveillance légère", duree: 15, nbJoueurs: "8 joueurs (6 avec ballon, 2 \"animaux en cage\")",
    materiel: "Ballons, plots pour délimiter deux secteurs",
    description: "Développe le regard périphérique et le changement de rythme en conduite, avec une opposition volontairement légère.",
    diagram: genSlalom(4),
  },
  // PULCINI / ESORDIENTI (9-12 ans) — mêmes six ateliers, version plus exigeante
  {
    name: "Partita à contraintes techniques", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Partita",
    objectif: "Jouer un match complet avec une première exigence tactique et technique", duree: 20, nbJoueurs: "7 contre 7",
    materiel: "Petites cages, chasubles, ballons",
    description: "Version plus exigeante du même principe de match modulaire pour les plus âgés : le match complet à 7 contre 7 introduit une consigne technique ou tactique du jour (ex.",
    diagram: genVs(7, 7, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Collaboration à surnombre réduit", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Collaborazione",
    objectif: "Approfondir la collaboration dans un surnombre plus resserré qu'en Piccoli Amici", duree: 15, nbJoueurs: "5 contre 3",
    materiel: "Ballons, plots, chasubles",
    description: "Version plus exigeante du principe \"Collaborazione\" : le surnombre est réduit (5 contre 3 plutôt qu'un jeu très favorable), obligeant une collaboration plus précise et plus rapide pour conserver le ballon.",
    diagram: genVs(5, 3, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Duel chronométré, trois secondes pour décider", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Duello",
    objectif: "Ajouter une contrainte de temps au duel individuel pour accélérer la décision", duree: 15, nbJoueurs: "1 contre 1, en rotation",
    materiel: "Ballons, chronomètre",
    description: "Version plus exigeante du \"Duello\" : le porteur de balle a un temps limité pour éliminer son adversaire avant l'arrivée d'un défenseur supplémentaire, reprenant l'esprit d'imprévisibilité du \"Le Statue\" mais avec une pression temporelle accrue adaptée à cet âge.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, hasKeeper: false }),
  },
  {
    name: "Foot de rue en autogestion complète", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Calcio di strada",
    objectif: "Pousser l'autonomie jusqu'à l'auto-arbitrage complet d'un vrai petit match", duree: 20, nbJoueurs: "4 contre 4",
    materiel: "Objets du quotidien pour délimiter le terrain et les buts",
    description: "Version plus poussée du \"Calcio di strada\" : les enfants choisissent eux-mêmes les équipes, fixent leurs propres règles de départ, gèrent les litiges sans intervention adulte. L'entraîneur observe sans intervenir, sauf incident de sécurité, pour développer une autonomie complète du jeu.",
    diagram: genVs(4, 4, { zone: [0.15, 0.15, 0.85, 0.85], hasKeeper: false }),
  },
  {
    name: "Parcours moteur complexe et rapide", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Scoprire il movimento",
    objectif: "Complexifier les enchaînements moteurs avec une exigence de rapidité", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots, cerceaux, haies, échelle de rythme si disponible",
    description: "Version plus exigeante d'\"Il Guado\" : le parcours combine davantage d'obstacles enchaînés avec une exigence de rapidité d'exécution, tout en conservant la phase de défi par équipes du parcours d'origine.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Jeux de technique avec opposition accrue", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "FIGC", fffBracket: "pulcini_esord", fffCategory: "Giochi di tecnica",
    objectif: "Développer la technique de conduite face à une opposition plus dense qu'en Piccoli Amici", duree: 15, nbJoueurs: "6 joueurs avec ballon, 3 opposants",
    materiel: "Ballons, plots",
    description: "Version plus exigeante de \"Lo Zoo\" : le ratio d'opposants augmente (environ 1 pour 2 plutôt que 1 pour 5), obligeant une lecture plus fréquente de l'environnement pendant la conduite de balle, tout en gardant l'esprit ludique de l'atelier original.",
    diagram: genSlalom(6),
  },
];

const STARTER_EXERCISES_DFB_2 = [
  // D-JUNIOREN (U12-U13) — Fußballspezifisches Grundlagentraining, "goldenes Lernalter"
  {
    name: "Entraînement technique systématique", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "d_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Structurer systématiquement le travail technique dans le \"golden age\" de l'apprentissage", duree: 15, nbJoueurs: "Petits groupes",
    materiel: "Plots, ballons",
    description: "Séries techniques structurées et répétées avec exigence de qualité croissante.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Fondations de la tactique individuelle", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "d_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Construire les bases de la tactique individuelle en attaque et en défense", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Premier pas systématique vers la tactique de groupe qui sera approfondie en C-Junioren.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Conditionnement physique par le jeu", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "d_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Développer la condition physique principalement à travers des formes jouées", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, chasubles",
    description: "",
    diagram: genVs(6, 6, { zone: [0.15, 0.1, 0.85, 0.9] }),
  },
  {
    name: "Initiative personnelle et motivation de performance", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "d_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Encourager l'engagement personnel et la motivation à progresser", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque joueur formule un objectif personnel de progression pour la période à venir.",
    diagram: [],
  },
  // C-JUNIOREN (U14-U15) — passage à 11 contre 11, puberté
  {
    name: "Techniques dynamiques sous pression", category: "technique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "c_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Exécuter les techniques avec rythme et sous la pression de l'adversaire", duree: 15, nbJoueurs: "Petits groupes en opposition",
    materiel: "Plots, ballons",
    description: "Travail technique intensif avec opposition active et contrainte de rythme.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Approfondir la tactique individuelle et collective", category: "tactique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "c_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Approfondir la tactique de groupe en attaque et en défense, passage progressif au 11 contre 11", duree: 20, nbJoueurs: "9 contre 9 ou 11 contre 11",
    materiel: "Plots, chasubles",
    description: "Jeu complet approfondissant la tactique de groupe en attaque et en défense, avec une exigence de compréhension collective plus poussée qu'aux âges précédents.",
    diagram: genVs(9, 9, { zone: [0.08, 0.08, 0.92, 0.92] }),
  },
  {
    name: "Compenser les déficits coordinatifs de la puberté", category: "athletique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "c_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Rééquilibrer la coordination temporairement perturbée par la poussée de croissance", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, échelle de rythme si disponible",
    description: "Travail spécifique de coordination et de fitness football, ciblant les déficits temporaires liés à la croissance rapide de cet âge.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Responsabilité personnelle sur et hors du terrain", category: "mental", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "c_junioren", fffCategory: "Fußballspezifisches Grundlagentraining",
    objectif: "Développer le sens des responsabilités individuelles et collectives", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur les responsabilités de chacun envers le groupe, dans une tranche d'âge où le passage de l'enfant à l'adolescent rend cette question particulièrement pertinente.",
    diagram: [],
  },
  // B/A-JUNIOREN (U16-U19) — Beginnendes Spezialisierungstraining
  {
    name: "Technique spécifique au poste", category: "technique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "ba_junioren", fffCategory: "Beginnendes Spezialisierungstraining",
    objectif: "Adapter le travail technique aux exigences précises de chaque poste", duree: 15, nbJoueurs: "Individuel ou petits groupes par poste",
    materiel: "Ballons, plots, cage",
    description: "",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Tactique de groupe et d'équipe en système structuré", category: "tactique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "ba_junioren", fffCategory: "Beginnendes Spezialisierungstraining",
    objectif: "Appliquer un système de jeu structuré avec des tâches précises par ligne", duree: 20, nbJoueurs: "11 contre 11",
    materiel: "Plots, chasubles",
    description: "Jeu complet appliquant un système précis avec des tâches définies par ligne et par joueur, où chaque secteur du terrain (défense, milieu, attaque) a un rôle clair dans l'organisation collective.",
    diagram: genFromFormation("4-3-3"),
  },
  {
    name: "Conditionnement physique systématique et spécifique", category: "athletique", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "ba_junioren", fffCategory: "Beginnendes Spezialisierungstraining",
    objectif: "Structurer systématiquement la préparation physique spécifique au football", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "",
    diagram: genSprintLanes(3),
  },
  {
    name: "Sérieux et volonté de performance", category: "mental", ageFormat: "standard",
    curriculumFederation: "DFB", fffBracket: "ba_junioren", fffCategory: "Beginnendes Spezialisierungstraining",
    objectif: "Développer le sérieux et la volonté de performance propres au haut niveau junior", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur les exigences mentales du football de haut niveau junior, à l'approche de la transition vers le football senior.",
    diagram: [],
  },
];

const STARTER_EXERCISES_DFB_1 = [
  // BAMBINI (jusqu'à U7) — Umfassende Bewegungsschulung
  {
    name: "Découverte du ballon qui roule, rebondit, vole", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "bambini", fffCategory: "Umfassende Bewegungsschulung",
    objectif: "Découvrir le ballon sous toutes ses formes de déplacement", duree: 10, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant",
    description: "Exploration libre du ballon roulant, rebondissant, volant, dans un cadre totalement ludique.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.4)],
  },
  {
    name: "Petits jeux avec et sans règles strictes", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "bambini", fffCategory: "Umfassende Bewegungsschulung",
    objectif: "Découvrir les toutes premières règles simples du jeu à deux équipes", duree: 15, nbJoueurs: "4 contre 4 (sans gardien)",
    materiel: "Petits buts ou plots, chasubles",
    description: "Petit match à 4 contre 4 sans gardien, sur un espace réduit, avec des règles minimales.",
    diagram: genVs(4, 4, { hasKeeper: false, zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Bouge et joue de mille façons", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "bambini", fffCategory: "Umfassende Bewegungsschulung",
    objectif: "Développer un socle moteur large par des activités variées", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, cerceaux, petits obstacles",
    description: "",
    diagram: genAgilityPattern(),
  },
  {
    name: "Un cœur et une oreille ouverte pour chaque enfant", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "bambini", fffCategory: "Umfassende Bewegungsschulung",
    objectif: "Créer un attachement affectif positif avec le club et le jeu", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Moment d'accueil individuel où chaque enfant est salué personnellement par le coach en début de séance.",
    diagram: [],
  },
  // F-JUNIOREN (U8-U9) — Technisch-spielerische Vielseitigkeitsschulung
  {
    name: "Le foot de rue transposé au club", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "f_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Découvrir les techniques de base dans un esprit de foot de rue", duree: 15, nbJoueurs: "Petits groupes libres",
    materiel: "Plots, ballons",
    description: "Jeu libre en petits groupes où les techniques de base (dribble, passe, contrôle) émergent naturellement du jeu plutôt que d'exercices dirigés.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Petits conseils tactiques : marquer, empêcher de marquer", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "f_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Découvrir des repères tactiques très simples liés au but", duree: 15, nbJoueurs: "5 contre 5 avec gardien",
    materiel: "Petits buts, chasubles",
    description: "Match libre où le coach ne donne que quelques conseils tactiques très simples liés directement à l'objectif du jeu.",
    diagram: genVs(5, 5, { hasKeeper: true, zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Courir et bouger sous toutes ses formes", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "f_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Développer la motricité générale par des activités sportives variées", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, petits obstacles",
    description: "",
    diagram: genSprintLanes(3),
  },
  {
    name: "Patience et modèle de l'entraîneur", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "DFB", fffBracket: "f_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Développer la confiance par l'exemple et l'absence de pression temporelle", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "",
    diagram: [],
  },
  // E-JUNIOREN (U10-U11) — Technisch-spielerische Vielseitigkeitsschulung (approfondi)
  {
    name: "Techniques adaptées à l'âge, en situation de jeu", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "e_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Approfondir les techniques de base dans des formes organisées mais motivantes", duree: 15, nbJoueurs: "Petits groupes",
    materiel: "Plots, ballons",
    description: "Exercices techniques un peu plus organisés qu'en F-Junioren, mais toujours dans un esprit attractif.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Le petit abécédaire tactique", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "e_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Découvrir les toutes premières règles d'occupation de l'espace", duree: 15, nbJoueurs: "7 contre 7",
    materiel: "Plots, chasubles",
    description: "Jeu à thème introduisant les repères d'orientation dans l'espace et d'occupation du terrain.",
    diagram: genVs(7, 7, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Adresse et vitesse avec le ballon", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "e_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Développer l'adresse et la vitesse spécifiquement liées au ballon", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots, ballons",
    description: "",
    diagram: genSlalom(6),
  },
  {
    name: "Apprendre à gagner et à perdre", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "DFB", fffBracket: "e_junioren", fffCategory: "Technisch-spielerische Vielseitigkeitsschulung",
    objectif: "Découvrir la gestion émotionnelle de la victoire et de la défaite", duree: 10, nbJoueurs: "Groupe complet, après un jeu à enjeu",
    materiel: "Aucun",
    description: "Discussion après un petit tournoi interne, où le coach accompagne explicitement la réaction à la victoire et à la défaite.",
    diagram: [],
  },
];

const STARTER_EXERCISES_FA = [
  // FOUNDATION PHASE (5-11 ans)
  {
    name: "Le plaisir du ballon et du jeu", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "FA", fffBracket: "foundation", fffCategory: "Social",
    objectif: "Créer un environnement positif où l'enfant développe un amour durable du ballon et du jeu", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque séance démarre par un moment où les enfants disent ce qu'ils aiment dans le foot, sans jugement. L'objectif à cet âge est de construire une relation affective durable avec le jeu, pas seulement des compétences.",
    diagram: [],
  },
  {
    name: "Jouer avec liberté, sans peur de l'erreur", category: "mental", ageFormat: "foot_a_5",
    curriculumFederation: "FA", fffBracket: "foundation", fffCategory: "Psychological",
    objectif: "Développer la confiance à essayer sans crainte du jugement", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu",
    materiel: "Aucun",
    description: "Le coach célèbre explicitement les tentatives audacieuses (dribble risqué, passe originale), qu'elles réussissent ou non.",
    diagram: [],
  },
  {
    name: "Parcours multi-habiletés", category: "athletique", ageFormat: "foot_a_5",
    curriculumFederation: "FA", fffBracket: "foundation", fffCategory: "Physical",
    objectif: "Développer un socle moteur large avant toute spécialisation", duree: 15, nbJoueurs: "Groupe complet en rotation",
    materiel: "Plots, cerceaux, petits obstacles",
    description: "Parcours varié combinant courir, sauter, ramper, changer de direction, dans un cadre ludique.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Maîtrise du ballon en liberté", category: "technique", ageFormat: "foot_a_5",
    curriculumFederation: "FA", fffBracket: "foundation", fffCategory: "Technical/Tactical",
    objectif: "Développer la confiance et la maîtrise technique de base avec le ballon", duree: 15, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant, plots",
    description: "Exploration libre du ballon (conduite, petits jonglages, contrôles) avec des défis simples proposés par le coach. Reflète le volet technique du corner \"technical/tactical\" de la Foundation Phase, où la maîtrise individuelle du ballon précède la compréhension tactique.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.42)],
  },
  {
    name: "Stop and Score", category: "tactique", ageFormat: "foot_a_5",
    curriculumFederation: "FA", fffBracket: "foundation", fffCategory: "Technical/Tactical",
    objectif: "Comprendre simplement l'objectif du jeu : marquer et empêcher de marquer", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Match libre où le coach met simplement en avant les deux notions fondamentales du jeu : essayer de marquer, essayer d'empêcher l'adversaire de marquer.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  // YOUTH DEVELOPMENT PHASE (12-16 ans)
  {
    name: "Gérer la pression de la compétition adolescente", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "FA", fffBracket: "youth_dev", fffCategory: "Psychological",
    objectif: "Développer la résilience psychologique face à l'enjeu grandissant du jeu", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion et mise en situation sur la gestion du stress de compétition, qui devient plus présent à cet âge.",
    diagram: [],
  },
  {
    name: "Développer l'individu dans le collectif", category: "mental", ageFormat: "foot_a_8",
    curriculumFederation: "FA", fffBracket: "youth_dev", fffCategory: "Social",
    objectif: "Équilibrer développement individuel et appartenance au groupe", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur la place de chacun dans le collectif, où chaque adolescent identifie sa contribution unique à l'équipe. Reflète le principe \"developing the individual within the team\" du corner social de la Youth Development Phase.",
    diagram: [],
  },
  {
    name: "Développement physique adapté à la puberté", category: "athletique", ageFormat: "foot_a_8",
    curriculumFederation: "FA", fffBracket: "youth_dev", fffCategory: "Physical",
    objectif: "Adapter le travail physique aux transformations corporelles de l'adolescence", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, élastiques légers si disponibles",
    description: "Circuit de renforcement et de coordination tenant compte des poussées de croissance qui perturbent temporairement la coordination à cet âge. Reflète l'attention du corner physique de la Youth Development Phase aux changements corporels rapides et parfois déstabilisants de la puberté.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Technique en situation de match réaliste", category: "technique", ageFormat: "foot_a_8",
    curriculumFederation: "FA", fffBracket: "youth_dev", fffCategory: "Technical/Tactical",
    objectif: "Transférer la technique individuelle vers des contextes proches du match", duree: 15, nbJoueurs: "4-5 joueurs avec opposition modérée",
    materiel: "Plots, ballons, chasubles",
    description: "Exercices techniques (passe, contrôle, frappe) intégrant une opposition modérée et réaliste, plutôt que des répétitions isolées sans pression. Reflète l'évolution du corner technique de la Youth Development Phase vers un transfert plus direct au jeu.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Principes d'équipe, forme et occupation de l'espace", category: "tactique", ageFormat: "foot_a_8",
    curriculumFederation: "FA", fffBracket: "youth_dev", fffCategory: "Technical/Tactical",
    objectif: "Introduire des principes tactiques collectifs plus structurés", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Jeu à thème introduisant des principes de forme d'équipe et d'occupation de l'espace plus structurés qu'en Foundation Phase.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  // PROFESSIONAL DEVELOPMENT PHASE (17-21 ans)
  {
    name: "Développer un état d'esprit professionnel", category: "mental", ageFormat: "standard",
    curriculumFederation: "FA", fffBracket: "pro_dev", fffCategory: "Psychological",
    objectif: "Construire les habitudes mentales et le professionnalisme attendus au haut niveau", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur les exigences mentales du football professionnel (régularité, gestion de la pression médiatique, résilience face à la concurrence pour une place).",
    diagram: [],
  },
  {
    name: "Conditionnement physique de haut niveau", category: "athletique", ageFormat: "standard",
    curriculumFederation: "FA", fffBracket: "pro_dev", fffCategory: "Physical",
    objectif: "Atteindre les standards physiques exigés par le football professionnel", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Correspond au corner physique de la Professional Development Phase, où la marge de progression individuelle se réduit et la constance devient clé.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Perfectionnement technique par poste", category: "technique", ageFormat: "standard",
    curriculumFederation: "FA", fffBracket: "pro_dev", fffCategory: "Technical/Tactical",
    objectif: "Affiner la technique selon les exigences précises de chaque poste", duree: 15, nbJoueurs: "Individuel ou petits groupes selon le poste",
    materiel: "Ballons, cage, plots",
    description: "Travail technique individualisé selon les exigences précises du poste occupé (frappe pour un attaquant, relance longue pour un défenseur central, centre pour un latéral). Reflète le volet technique du corner \"technical/tactical\" en Professional Development Phase, où la technique générale cède la place à la spécialisation positionnelle.",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Mise en œuvre du modèle de jeu complet", category: "tactique", ageFormat: "standard",
    curriculumFederation: "FA", fffBracket: "pro_dev", fffCategory: "Technical/Tactical",
    objectif: "Appliquer un modèle de jeu complet et cohérent en situation réelle", duree: 20, nbJoueurs: "10 contre 10",
    materiel: "Plots, chasubles",
    description: "Jeu complet où l'équipe applique un modèle de jeu structuré (principes offensifs et défensifs cohérents), avec un niveau d'exigence tactique proche du football senior. Reflète l'aboutissement du corner tactique en Professional Development Phase, dernière étape avant le football professionnel.",
    diagram: genVs(10, 10, { zone: [0.05, 0.05, 0.95, 0.95] }),
  },
];

const STARTER_EXERCISES_FFF_U6_7 = [
  {
    name: "Mon terrain et mon ballon", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u6_7", fffCategory: "J'attaque individuellement",
    objectif: "Découvrir l'espace de jeu en gardant le ballon avec soi", duree: 15, nbJoueurs: "Individuel, un ballon chacun, dans un espace commun",
    materiel: "Plots pour délimiter l'espace, un ballon par enfant",
    description: "Chaque enfant se déplace librement dans l'espace avec son ballon, en le gardant toujours proche de lui, un peu comme s'il explorait son terrain de jeu personnel.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.42)],
  },
  {
    name: "Mon ballon dans les filets", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u6_7", fffCategory: "J'attaque individuellement",
    objectif: "Découvrir le plaisir de mettre le ballon dans le but", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, petit but",
    description: "Chaque enfant essaie de mettre son ballon dans le but, d'où il veut et comme il veut, sans consigne technique.",
    diagram: genShooting(1, { ballX: 0.6, ballY: 0.5 }),
  },
  {
    name: "Mon adversaire et moi", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u6_7", fffCategory: "Je défends individuellement",
    objectif: "Découvrir la présence d'un adversaire face à soi", duree: 15, nbJoueurs: "1 contre 1, en rotation",
    materiel: "Plots, ballons",
    description: "Petit jeu où l'enfant doit simplement essayer de reprendre le ballon à un copain, dans un cadre amical et sans notion technique de tacle.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, hasKeeper: false }),
  },
  {
    name: "Mon partenaire et moi", category: "tactique", ageFormat: "foot_a_5",
    fffBracket: "u6_7", fffCategory: "J'attaque collectivement",
    objectif: "Découvrir le jeu à deux avec un copain", duree: 15, nbJoueurs: "2 enfants",
    materiel: "Ballons, petit but",
    description: "Deux enfants jouent ensemble vers un petit but, en se faisant des passes quand l'envie vient naturellement, sans consigne stricte.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.4, { number: 2 }), pel("ball", 0.35, 0.5)],
  },
];

const STARTER_EXERCISES_NATIONS2_MENTAL_5 = [
  {
    name: "Je suis content de ce que je sais faire", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement la fierté de ses propres qualités", duree: 5, nbJoueurs: "Groupe complet, en cercle",
    materiel: "Aucun",
    description: "Chaque enfant dit une chose qu'il aime faire avec le ballon, avec un encouragement du groupe.",
    diagram: [],
  },
  {
    name: "On est tous ensemble, une petite famille", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir le sentiment tout simple d'appartenir à un groupe", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit rituel joyeux (cri collectif, ronde, tape de main générale) avant de commencer à jouer.",
    diagram: [],
  },
  {
    name: "On dit merci et bravo", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement la politesse et le respect envers les autres", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit rituel de fin de séance où chaque enfant dit merci ou bravo à un copain, dans un esprit de politesse et de gentillesse.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS2_ATHLETIQUE_5 = [
  {
    name: "Le petit jeu des virages", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir les changements de direction dans un jeu amusant", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots",
    description: "Petit parcours de plots où l'enfant tourne et change de direction en suivant un chemin rigolo, présenté comme un jeu plutôt qu'un travail d'agilité. Graine ludique de la vivacité recherchée pour les joueurs de couloir.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Pousse le ballon, pas ton copain", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir en douceur la notion de contact léger et contrôlé", duree: 10, nbJoueurs: "Binômes",
    materiel: "Ballons",
    description: "Deux enfants épaule contre épaule très légèrement essaient chacun de garder le ballon proche de soi, dans un jeu doux et surveillé, sans intensité physique. Introduction toute douce et ludique de la notion de contact, très en dessous de ce qui sera travaillé plus tard.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerB", 0.55, 0.5), pel("ball", 0.43, 0.5)],
  },
  {
    name: "Cours sans t'arrêter, c'est rigolo", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir très brièvement le plaisir de courir sans s'arrêter", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Plots",
    description: "Très courte course collective et joyeuse (1 à 2 minutes) où tout le monde court ensemble sans s'arrêter, dans une ambiance de jeu plutôt que d'endurance sérieuse.",
    diagram: genSprintLanes(2),
  },
];

const STARTER_EXERCISES_NATIONS2_TECHNIQUE_5 = [
  {
    name: "La petite feinte du couloir", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir un geste de feinte simple dans le plaisir", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Découverte très simple d'un petit geste de feinte (faire semblant d'un côté puis partir de l'autre), présenté comme un jeu amusant.",
    diagram: genDribbleMove(),
  },
  {
    name: "Le bon coup de pied pour dégager", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le geste de dégagement au pied, sans jeu de tête à cet âge", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons",
    description: "L'enfant s'entraîne à dégager le ballon loin devant lui au pied, dans un cadre ludique. Le jeu de tête n'est volontairement pas abordé à cet âge — cette version se concentre uniquement sur le dégagement au pied, contrairement à la version pour joueurs un peu plus âgés.",
    diagram: [pel("playerA", 0.35, 0.5, { number: 1 }), pel("ball", 0.42, 0.5)],
  },
  {
    name: "Vise bien les pieds du copain", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de faire une passe qui arrive bien", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons",
    description: "Petit jeu de passes entre deux copains avec un encouragement joyeux à chaque fois que le ballon arrive bien dans les pieds.",
    diagram: genPassingGrid(2),
  },
];

const STARTER_EXERCISES_NATIONS2_TACTIQUE_5 = [
  {
    name: "Le petit défi du couloir", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir du duel dans un couloir vers une mini-cage", duree: 15, nbJoueurs: "1 contre 1, en rotation",
    materiel: "Plots, mini-cage, ballons",
    description: "Petits duels 1 contre 1 dans un couloir tracé au sol, célébrés joyeusement quelle que soit l'issue.",
    diagram: genVs(1, 1, { xA: 0.55, xB: 0.7, hasKeeper: false }),
  },
  {
    name: "Tous ensemble pour défendre", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de défendre en groupe et serrés", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Le coach félicite chaque fois que plusieurs enfants restent groupés pour empêcher l'équipe adverse d'avancer, présenté comme un jeu de \"mur qui bouge ensemble\".",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "La petite passe bien placée", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de faire une passe qui arrive bien dans les pieds", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Le coach félicite chaque passe qui arrive bien dans les pieds d'un copain, en insistant gentiment sur le geste propre plutôt que la vitesse.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
];

const STARTER_EXERCISES_NATIONS2_MENTAL_8 = [
  {
    name: "Je crois en ce que je sais faire", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir la confiance en ses propres qualités, sans excès", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque enfant nomme une chose qu'il sait bien faire avec le ballon, avec un encouragement du groupe à chaque fois.",
    diagram: [],
  },
  {
    name: "On est une petite équipe soudée", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir simplement le sentiment d'appartenance à un groupe uni", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit rituel d'équipe (cri collectif, geste commun) avant un match, pour renforcer le sentiment d'appartenance au groupe.",
    diagram: [],
  },
  {
    name: "Se respecter les uns les autres", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir le respect mutuel envers coéquipiers, adversaires et staff", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rituel simple de salutation et de remerciement avant et après chaque séance ou match, expliqué comme une marque de respect envers tout le monde.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS2_ATHLETIQUE_8 = [
  {
    name: "Agilité de couloir, version accessible", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir les changements de direction rapides en couloir", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots",
    description: "Parcours d'agilité simple simulant les courses d'un joueur de couloir, avec une attention du coach portée aux appuis plutôt qu'à la vitesse pure.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Contacts contrôlés, protection de balle", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir le contact physique encadré et contrôlé", duree: 15, nbJoueurs: "Binômes en opposition légère",
    materiel: "Plots, ballons",
    description: "Exercices de protection de balle avec un contact épaule contre épaule léger et contrôlé, sous supervision attentive, pour introduire progressivement la notion de duel physique sans intensité excessive.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerB", 0.55, 0.5), pel("ball", 0.43, 0.5)],
  },
  {
    name: "Endurance de course courte et régulière", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir la régularité de l'effort sur une durée courte", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Course continue à allure modérée sur une durée courte (5 minutes maximum, bien moins que la version adulte), avec un encouragement sur la régularité plutôt que la vitesse.",
    diagram: genSprintLanes(2),
  },
];

const STARTER_EXERCISES_NATIONS2_TECHNIQUE_8 = [
  {
    name: "Feinte de corps à vitesse progressive", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir la feinte de corps avec une accélération progressive du rythme", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Répétition de la feinte de corps à un rythme d'abord modéré, augmenté progressivement à mesure que le geste devient plus naturel, plutôt que la vitesse maximale immédiate travaillée à onze.",
    diagram: genDribbleMove(),
  },
  {
    name: "Dégagement et contact de tête prudent", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir prudemment le contact de tête défensif et le dégagement au pied", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons plus légers si disponibles",
    description: "Introduction prudente et en faible volume du contact de tête défensif sur ballon léger, en insistant sur la technique (front, yeux ouverts, cou légèrement tendu) plutôt que la puissance, en parallèle d'un travail plus développé du dégagement au pied. Toujours à ne jamais forcer si l'enfant est mal à l'aise.",
    diagram: [pel("playerA", 0.4, 0.5, { number: 1 }), pel("ball", 0.5, 0.35)],
  },
  {
    name: "Passe précise, cible un peu plus large", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'exigence de précision technique avec une marge un peu plus généreuse", duree: 15, nbJoueurs: "4-5 joueurs en rotation",
    materiel: "Plots pour marquer des cibles, ballons",
    description: "Passes devant atteindre une cible précise mais un peu plus large qu'à onze, avec un encouragement bienveillant à recommencer en cas d'imprécision plutôt qu'une sanction stricte.",
    diagram: genPassingGrid(4),
  },
];

const STARTER_EXERCISES_NATIONS2_TACTIQUE_8 = [
  {
    name: "Duel au couloir, initiative individuelle", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'initiative individuelle dans le couloir face à un défenseur", duree: 15, nbJoueurs: "1 contre 1 dans le couloir, en rotation",
    materiel: "Plots, petites cages, ballons",
    description: "Duel simple 1 contre 1 dans le couloir vers une petite cage, où l'enfant est encouragé à tenter sa chance (dribble, accélération) plutôt qu'à chercher systématiquement une passe de sécurité.",
    diagram: genVs(1, 1, { xA: 0.55, xB: 0.7, hasKeeper: false }),
  },
  {
    name: "Défendre serrés, tous ensemble", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la solidité défensive collective à effectif réduit", duree: 15, nbJoueurs: "3 défenseurs contre 3 attaquants",
    materiel: "Plots, chasubles",
    description: "Situation défensive à 3 contre 3 où les défenseurs doivent rester groupés et combatifs sur chaque ballon, sans céder facilement.",
    diagram: genLine(3, 3),
  },
  {
    name: "Circulation précise, chacun sa place", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la discipline de position pendant la circulation du ballon", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots pour marquer des zones souples, chasubles",
    description: "Jeu de circulation où chaque enfant garde une zone de référence souple pendant que le ballon circule, avec une attention portée à la propreté technique des passes.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
];

const STARTER_EXERCISES_NATIONS2_MENTAL_11 = [
  {
    name: "Confiance individuelle assumée", category: "mental", ageFormat: "standard",
    objectif: "Développer une confiance individuelle affirmée", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque joueur exprime devant le groupe une qualité personnelle dont il est fier, sans fausse modestie mais sans arrogance envers les autres.",
    diagram: [],
  },
  {
    name: "L'unité d'un petit pays uni", category: "mental", ageFormat: "standard",
    objectif: "S'inspirer de la fraternité et de l'unité collective d'une petite communauté footballistique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur le sentiment d'appartenir à un groupe soudé où chaque joueur se bat autant pour ses coéquipiers que pour lui-même.",
    diagram: [],
  },
  {
    name: "Respect et harmonie collective", category: "mental", ageFormat: "standard",
    objectif: "Développer le respect mutuel et l'harmonie de groupe", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rituel de respect explicite envers les partenaires, le staff et l'adversaire (salutation, remerciement) intégré systématiquement avant et après chaque séance.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS_MENTAL_5 = [
  {
    name: "Je suis content de jouer avec mes copains", category: "mental", ageFormat: "foot_a_5",
    objectif: "Associer le jeu au plaisir d'être avec les autres", duree: 5, nbJoueurs: "Groupe complet, en cercle",
    materiel: "Aucun",
    description: "En fin de séance, chaque enfant dit un copain avec qui il a aimé jouer aujourd'hui.",
    diagram: [],
  },
  {
    name: "On continue à faire des passes, c'est rigolo", category: "mental", ageFormat: "foot_a_5",
    objectif: "Associer la passe à un plaisir simple, sans frustration", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rappel joyeux que rater une passe n'est pas grave, l'important étant de continuer à essayer d'en faire avec les copains.",
    diagram: [],
  },
  {
    name: "On s'amuse même si ça ne va pas comme on veut", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir que le plaisir continue même quand le jeu ne va pas bien", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Le coach rappelle avec le sourire que même si le jeu ne se passe pas comme espéré, on continue à s'amuser.",
    diagram: [],
  },
  {
    name: "Regarde bien le ballon un petit moment", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir très brièvement l'attention portée à quelque chose", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit jeu où les enfants doivent suivre des yeux le ballon que le coach fait rouler, pendant quelques secondes seulement, présenté comme un jeu d'observation amusant. Graine toute simple de la concentration, sans rapport avec la discipline tactique de la version adulte.",
    diagram: [],
  },
  {
    name: "On s'aide entre copains", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement l'entraide entre copains d'équipe", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit rituel où chaque enfant reçoit un check ou un tape de main d'un copain avant de commencer à jouer.",
    diagram: [],
  },
  {
    name: "Cours avec plein d'énergie", category: "mental", ageFormat: "foot_a_5",
    objectif: "Encourager l'énergie et l'enthousiasme dans le jeu", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu",
    materiel: "Aucun",
    description: "Le coach valorise et célèbre bruyamment l'énergie et l'enthousiasme mis dans le jeu par chaque enfant, sans jamais comparer les enfants entre eux.",
    diagram: [],
  },
  {
    name: "Essaie des trucs rigolos avec le ballon", category: "mental", ageFormat: "foot_a_5",
    objectif: "Encourager l'expérimentation joyeuse avec le ballon", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Le coach encourage explicitement chaque tentative créative avec le ballon, même ratée, en la présentant comme une belle idée à retenter. Version la plus proche possible de l'esprit \"jogo bonito\" pour cet âge, où la liberté d'essayer prime sur tout le reste.",
    diagram: [],
  },
  {
    name: "On peut être forts même en étant petits", category: "mental", ageFormat: "foot_a_5",
    objectif: "Développer une petite confiance collective simple", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit message positif avant de jouer contre une équipe qui semble plus grande ou plus impressionnante : \"on peut bien jouer nous aussi\".",
    diagram: [],
  },
  {
    name: "On joue comme on aime jouer", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement le plaisir de jouer à sa manière", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rappel joyeux qu'il n'y a pas une seule bonne façon de jouer, et que chacun peut jouer comme il aime le faire.",
    diagram: [],
  },
  {
    name: "Chacun est content pour soi", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir la fierté personnelle sans se comparer aux copains", duree: 5, nbJoueurs: "Groupe complet, en cercle",
    materiel: "Aucun",
    description: "Chaque enfant dit une chose qu'il a aimé faire aujourd'hui, sans jamais se comparer à un copain.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS_ATHLETIQUE_5 = [
  {
    name: "Les petits bonds rigolos", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir le saut et le bond dans un cadre ludique", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Plots ou cerceaux",
    description: "Jeu de sauts variés (à pieds joints, en avant, sur le côté) par-dessus de petits obstacles ou dans des cerceaux, présenté comme un jeu plutôt qu'un travail de puissance. Aucune notion d'explosivité ou de performance, juste le plaisir de sauter.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("cone", 0.5, 0.5), pel("cone", 0.65, 0.5)],
  },
  {
    name: "Le jeu des petits pas malins", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir les changements de direction dans un jeu d'agilité simple", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots colorés",
    description: "Petit parcours de plots colorés où l'enfant change de direction en suivant les couleurs annoncées par le coach, présenté comme un jeu de réaction amusant. Version ludique et sans enjeu de l'agilité en espace réduit.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le chat et la souris", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir l'effort intense et bref dans un jeu de poursuite", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots pour délimiter l'espace, chasubles",
    description: "Jeu de poursuite classique où les rôles de chat et de souris changent régulièrement, sans aucun chronométrage ni comparaison entre enfants. Version ludique et pure de l'intensité intermittente, à des années-lumière de la rigueur de la version pour joueurs plus âgés.",
    diagram: [pel("playerB", 0.5, 0.5), pel("playerA", 0.2, 0.3, { number: 1 }), pel("playerA", 0.8, 0.7, { number: 2 })],
  },
  {
    name: "Reste bien droit comme un arbre", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir l'équilibre et la concentration corporelle dans un jeu calme", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Jeu d'équilibre où chaque enfant essaie de tenir immobile comme un arbre le plus longtemps possible, sur un pied puis sur l'autre. Version très simplifiée et ludique de l'idée de concentration corporelle prolongée, adaptée à la capacité d'attention de cet âge plutôt qu'un maintien tactique.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.3, { number: 2 }), pel("playerA", 0.7, 0.6, { number: 3 })],
  },
  {
    name: "Le parcours rigolo par étapes", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir un enchaînement d'étapes ludiques dans un parcours", duree: 15, nbJoueurs: "Individuel en rotation, ou plusieurs parcours en parallèle",
    materiel: "Plots, cerceaux, petits obstacles",
    description: "Parcours en plusieurs étapes amusantes (sauter, ramper, courir en zigzag), présenté comme une aventure plutôt qu'un circuit structuré et chronométré.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le jeu de la poursuite joyeuse", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir l'engagement physique dans un jeu de poursuite plaisant", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots pour délimiter l'espace",
    description: "Jeu de poursuite où les enfants sont encouragés à mettre de l'énergie et de l'enthousiasme, avec des cris de joie plutôt qu'une pression de performance.",
    diagram: [pel("playerA", 0.3, 0.3, { number: 1 }), pel("playerA", 0.7, 0.4, { number: 2 }), pel("playerA", 0.5, 0.7, { number: 3 })],
  },
  {
    name: "Bouge en rythme", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir la coordination par le rythme et la musique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Musique en option",
    description: "Purement ludique, identique dans l'esprit à la version pour joueurs plus âgés puisque cette approche convient naturellement à tout âge.",
    diagram: [pel("playerA", 0.3, 0.4, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("playerA", 0.7, 0.6, { number: 3 })],
  },
  {
    name: "Encore un petit effort, on y est presque", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir très brièvement l'idée de continuer un effort jusqu'au bout", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Plots",
    description: "Très courte course collective (30 secondes maximum) où le coach encourage chacun à continuer jusqu'au bout dans une ambiance joyeuse et collective. Version extrêmement courte et douce de l'idée de ténacité, adaptée à la capacité physique de cet âge.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Le petit étirement rigolo", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir la mobilité corporelle de façon ludique", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petits jeux de mobilité présentés comme des imitations amusantes (\"fais comme un chat qui s'étire\", \"deviens tout petit puis tout grand\"), plutôt qu'une routine de prévention structurée.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Cours vite jusqu'au plot", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir la course rapide sur une courte distance dans un jeu de défi", duree: 10, nbJoueurs: "Groupes de 2-3 en petit défi amical",
    materiel: "Plots",
    description: "Petites courses amicales entre copains sur une très courte distance, présentées comme un jeu plutôt qu'un chronométrage comparatif sérieux. Version ludique et bienveillante de l'accélération rapide, où l'important reste le plaisir de courir ensemble.",
    diagram: genSprintLanes(3),
  },
];

const STARTER_EXERCISES_NATIONS_TECHNIQUE_5 = [
  {
    name: "Tape fort dans le ballon", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de frapper le ballon, sans consigne de précision", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, petit but",
    description: "Chaque enfant frappe le ballon vers le but, sans consigne technique — juste le plaisir de voir le ballon partir loin ou vite. Version purement ludique, bien avant la combinaison puissance-précision travaillée à un âge plus avancé.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "Le petit jeu de la passe qui tourne", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de faire des passes en groupe", duree: 15, nbJoueurs: "4-5 enfants en petit groupe",
    materiel: "Ballons",
    description: "Petit groupe qui se fait des passes librement sans consigne de nombre de touches ni de précision stricte, juste pour le plaisir de faire circuler le ballon entre copains.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Le centre pour un copain", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le geste du centre, sans jeu de tête à cet âge", duree: 15, nbJoueurs: "Groupes de 2-3 en rotation",
    materiel: "Ballons",
    description: "Centres doux vers un copain qui contrôle au pied, sans aucune reprise de tête à cet âge — le jeu de tête n'est pas recommandé pour les enfants aussi jeunes et n'est introduit que plus tard. Se concentre uniquement sur le geste du centre lui-même.",
    diagram: [pel("playerA", 0.7, 0.2, { number: 1 }), pel("playerA", 0.5, 0.5, { number: 2 }), pel("ball", 0.68, 0.22)],
  },
  {
    name: "Attrape le ballon du copain", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir de façon ludique l'idée de récupérer un ballon, sans tacle formel", duree: 15, nbJoueurs: "Binômes",
    materiel: "Ballons",
    description: "Jeu où un enfant essaie gentiment de toucher le ballon d'un copain qui le conduit, sans notion de tacle glissé (technique non enseignée à cet âge pour des raisons de sécurité). Reste un jeu de poursuite amical plutôt qu'un geste défensif technique.",
    diagram: [pel("playerB", 0.55, 0.5), pel("playerA", 0.35, 0.5, { number: 1 }), pel("ball", 0.42, 0.5)],
  },
  {
    name: "Vise et tire", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la frappe de près avec un objectif simple à viser", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, petit but, plots pour marquer une cible dans le but",
    description: "Frappes de près avec une petite cible amusante à viser dans le but (un plot, un cerceau). Version ludique et rapprochée, bien avant le travail de frappe à distance des catégories plus âgées.",
    diagram: genShooting(1, { ballX: 0.6, ballY: 0.5 }),
  },
  {
    name: "La petite feinte pour rigoler", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir un geste de feinte très simple dans le plaisir", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Découverte très simple d'un geste de feinte (faire semblant d'aller à droite puis partir à gauche) présenté comme un jeu amusant, sans recherche de vitesse ni de perfection du geste.",
    diagram: genDribbleMove(),
  },
  {
    name: "Jongle avec tes pieds", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le contact du ballon avec différentes parties du pied", duree: 10, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant",
    description: "",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.42)],
  },
  {
    name: "Attrape le ballon qui arrive", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la réception du ballon dans un cadre simple et sans pression", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons",
    description: "Un copain envoie le ballon et l'autre essaie de bien le recevoir avant de le relancer, sans aucune pression défensive. Découverte simple et bienveillante du contrôle de balle, préparant les exigences plus poussées des catégories plus âgées.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Le bon copain qui arrête le ballon", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le premier contact avec le ballon qui arrive", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons",
    description: "Jeu simple où l'enfant doit arrêter le ballon envoyé par un copain avant de le relancer, avec des encouragements sur la qualité du contrôle sans jamais critiquer un raté.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Cours et tire", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la frappe après une petite course amusante", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, petit but",
    description: "L'enfant conduit le ballon sur une courte distance en courant puis tire vers le but, présenté comme un petit défi amusant plutôt qu'un exercice de finition en transition. Première graine du style rapide et direct qui se développera avec l'âge.",
    diagram: genShooting(1, { arrow: true }),
  },
];

const STARTER_EXERCISES_NATIONS_TACTIQUE_5 = [
  {
    name: "Le petit duel rigolo", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir du duel 1 contre 1, sans autre attente", duree: 15, nbJoueurs: "1 contre 1, en rotation",
    materiel: "Plots, petite cage, ballons",
    description: "Petits duels 1 contre 1 vers une mini-cage, célébrés joyeusement quel que soit le résultat. Contrairement aux versions pour joueurs plus âgés, ici il n'y a aucune attente de \"suite collective\" — juste le plaisir du défi entre deux copains.",
    diagram: genVs(1, 1, { xA: 0.3, xB: 0.5, hasKeeper: false }),
  },
  {
    name: "La ronde des passes", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de faire circuler le ballon en cercle", duree: 15, nbJoueurs: "6-7 enfants en cercle contre 1-2 au milieu",
    materiel: "Plots pour marquer le cercle, ballons",
    description: "Ronde de passes classique où les enfants au milieu essaient de toucher le ballon, sans notion de position ou de zone à respecter — juste le plaisir de faire circuler le ballon vite en évitant qu'il ne soit touché.",
    diagram: genRondo(6, 1),
  },
  {
    name: "Fonce vers le but", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Encourager l'envie d'aller vers le but avec le ballon", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Match libre où le coach encourage bruyamment chaque enfant qui fonce vers le but avec le ballon, sans jamais reprocher une tentative ratée.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le copain qui m'aide", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement l'idée qu'un copain peut aider à récupérer le ballon", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Le coach félicite chaque fois que deux enfants s'approchent ensemble du porteur de balle adverse, présenté comme de l'entraide amicale plutôt que comme une notion tactique de couverture défensive.",
    diagram: [pel("playerB", 0.5, 0.45), pel("playerB", 0.55, 0.55), pel("playerA", 0.4, 0.5, { number: 1 })],
  },
  {
    name: "Tous ensemble on court après le ballon", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de courir ensemble après le ballon perdu", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Match libre où le coach valorise les moments où plusieurs enfants courent ensemble récupérer le ballon juste après l'avoir perdu, présenté comme un jeu d'équipe amusant.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le petit dribble malin", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Encourager la tentative de dribble créatif sans peur de l'échec", duree: 15, nbJoueurs: "1 contre 1 en petit espace, en rotation",
    materiel: "Plots, ballons",
    description: "Petits duels de dribble en espace confiné où chaque tentative technique (réussie ou non) est célébrée par le coach.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, zone: [0.3, 0.35, 0.7, 0.65] }),
  },
  {
    name: "Le petit jeu en dedans", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le jeu en espace réduit dans une ambiance festive", duree: 15, nbJoueurs: "5 contre 5 en espace réduit",
    materiel: "Plots pour délimiter l'espace, petites cages",
    description: "Match en espace resserré, dans une ambiance ludique et festive, en encourageant les tentatives techniques créatives.",
    diagram: genVs(5, 5, { zone: [0.2, 0.15, 0.8, 0.85] }),
  },
  {
    name: "Garder le ballon avec un copain", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir simplement le plaisir de garder le ballon à deux", duree: 15, nbJoueurs: "2 contre 1",
    materiel: "Plots, ballons",
    description: "Deux enfants essaient de garder le ballon le plus longtemps possible face à un troisième qui essaie de le récupérer, dans une ambiance de jeu plutôt que d'exercice technique.",
    diagram: genVs(2, 1, { xA: 0.4, xB: 0.55 }),
  },
  {
    name: "On échange nos places pour rigoler", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir de façon amusante l'idée d'échanger sa place", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Pendant le match, le coach demande de temps en temps à deux enfants d'échanger leur place \"pour rigoler\", sans enjeu tactique particulier.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "La course vers le but", category: "tactique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de foncer vers le but après avoir récupéré le ballon", duree: 15, nbJoueurs: "5 contre 5",
    materiel: "Petits buts, chasubles",
    description: "Le coach célèbre chaque fois qu'un enfant qui vient de récupérer le ballon fonce rapidement vers le but adverse, dans un esprit de course amusante plutôt que de transition tactique.",
    diagram: genVs(5, 5, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
];

const STARTER_EXERCISES_NATIONS_MENTAL_8 = [
  {
    name: "Mon talent au service de l'équipe, version simple", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir simplement le lien entre qualité individuelle et jeu collectif", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Chaque enfant nomme une chose qu'il aime faire avec le ballon et comment ça peut aider l'équipe.",
    diagram: [],
  },
  {
    name: "Rester patient quand ça ne marche pas tout de suite", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir la patience face à une possession qui ne débouche pas immédiatement", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion courte après un jeu de possession où les enfants expriment leur frustration ou leur patience face aux tentatives infructueuses.",
    diagram: [],
  },
  {
    name: "Continuer à essayer jusqu'à la fin", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir l'idée de ne pas abandonner en douceur, sans pression excessive", duree: 10, nbJoueurs: "Groupe complet, en fin de match ou de jeu",
    materiel: "Aucun",
    description: "Encouragement explicite en fin de match ou de jeu à continuer à essayer même si le résultat semble décidé, présenté positivement (\"on continue à s'amuser et à essayer\") plutôt que comme une obligation de résultat.",
    diagram: [],
  },
  {
    name: "Rester concentré quelques minutes de plus", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir le maintien de l'attention sur une durée courte et progressive", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Défi ludique de rester concentré sur sa position ou sa tâche pendant une durée courte et annoncée à l'avance (quelques minutes), en félicitant l'effort de concentration plutôt que le résultat.",
    diagram: [],
  },
  {
    name: "On compte les uns sur les autres", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir simplement l'esprit d'équipe et l'engagement mutuel", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit rituel avant un match où chaque enfant dit à un copain \"je compte sur toi\" et reçoit la même chose en retour.",
    diagram: [],
  },
  {
    name: "Ne rien lâcher dans les efforts", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir la valeur de l'engagement complet dans chaque effort, sans dramatisation", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu",
    materiel: "Aucun",
    description: "Encouragement à mettre de l'énergie et de l'envie dans chaque course et chaque duel, présenté comme une qualité valorisante plutôt qu'une obligation.",
    diagram: [],
  },
  {
    name: "Jouer avec joie et liberté, Foot à 8", category: "mental", ageFormat: "foot_a_8",
    objectif: "Privilégier le plaisir et la créativité dans le jeu", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rappel avant une séance ou un match que tenter un geste créatif est encouragé plutôt que sanctionné en cas d'échec, exactement comme dans la version pour joueurs plus âgés puisque cet état d'esprit convient à tout âge sans adaptation particulière.",
    diagram: [],
  },
  {
    name: "Notre équipe peut surprendre", category: "mental", ageFormat: "foot_a_8",
    objectif: "Développer la conviction collective face à une équipe qui semble plus forte", duree: 10, nbJoueurs: "Groupe complet, avant un match face à une équipe réputée forte",
    materiel: "Aucun",
    description: "Discussion courte et positive avant d'affronter une équipe réputée plus forte, insistant sur ce que le groupe peut apporter collectivement plutôt que sur le rapport de force apparent.",
    diagram: [],
  },
  {
    name: "On joue à notre manière", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir simplement l'idée de garder sa façon de jouer même après une difficulté", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rappel simple après un match difficile que l'équipe garde sa façon de jouer plutôt que de tout changer après un seul mauvais résultat.",
    diagram: [],
  },
  {
    name: "Jouer pour soi, pas pour la comparaison", category: "mental", ageFormat: "foot_a_8",
    objectif: "Découvrir à se concentrer sur son propre jeu plutôt que sur la comparaison avec les copains", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur l'envie de bien faire pour soi-même plutôt que de se comparer constamment à un copain plus performant ou plus mis en avant.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS_ATHLETIQUE_8 = [
  {
    name: "Puissance explosive au poids du corps", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'explosivité au poids du corps, en faible volume", duree: 15, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Plots",
    description: "Départs sprintés courts et petits bondissements au poids du corps uniquement, en faible volume avec récupération complète. Introduction prudente à l'explosivité, sans la charge ajoutée de la version pour joueurs plus âgés.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Agilité en espace confiné, Foot à 8", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Développer l'agilité et les changements de direction fins", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots resserrés",
    description: "Parcours d'agilité aux plots rapprochés, identique dans l'esprit à la version pour joueurs plus âgés puisque ce travail d'agilité convient bien à cet âge, avec une attention portée par le coach à la qualité des appuis plutôt qu'à la vitesse pure.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Intermittent modéré et ludique", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'effort intermittent dans un cadre plus court et ludique", duree: 15, nbJoueurs: "Groupe complet ou par vagues",
    materiel: "Plots, chronomètre",
    description: "Efforts intermittents beaucoup plus courts et moins intenses que la version adulte (10 secondes effort, 20 secondes récupération), présentés comme un jeu plutôt qu'un travail de conditionnement pur.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Maintenir sa concentration quelques minutes", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir le maintien d'une organisation défensive sur une durée courte", duree: 10, nbJoueurs: "3-4 défenseurs en maintien de bloc court",
    materiel: "Plots pour marquer les lignes",
    description: "Maintien d'une organisation défensive simple sur une durée courte (5 minutes maximum, bien moins que les 15-20 minutes de la version adulte), adaptée à la capacité d'attention et de résistance de cet âge.",
    diagram: genLine(4, 3),
  },
  {
    name: "Circuit structuré court", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir une séance organisée en blocs simples et chronométrés", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Circuit de 3-4 ateliers courts et chronométrés (course, agilité, coordination), avec un suivi simple des performances d'une séance à l'autre pour habituer progressivement à une approche structurée, sans la complexité de la planification adulte.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Petits efforts répétés avec engagement", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir la répétition d'efforts courts avec un engagement complet", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots, ballons",
    description: "Enchaînement de courts efforts suivis d'une action technique simple, en quantité modérée, pour introduire l'idée de maintenir son engagement malgré une légère fatigue, sans le volume plus exigeant de la version pour joueurs plus âgés.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Rythme et coordination, Foot à 8", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Développer la coordination par le rythme, comme en Foot à 11", duree: 15, nbJoueurs: "Groupe complet, en ligne ou en cercle",
    materiel: "Musique en option, plots",
    description: "Exercices de coordination rythmée similaires à la version pour joueurs plus âgés, cet aspect ludique et rythmique convenant naturellement bien à cette tranche d'âge sans nécessiter d'adaptation particulière.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Petite ténacité, courts efforts soutenus", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir le maintien de l'effort sur une courte durée sans relâcher", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Courses de 1-2 minutes à intensité modérée mais constante (bien plus courtes que les 3-5 minutes de la version adulte), pour découvrir progressivement l'idée de maintenir l'engagement sans relâchement.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Mobilité et prévention simple", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir une routine simple de mobilité et de prévention", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Tapis si disponible",
    description: "Routine simple de mobilité articulaire et d'exercices de prévention de base (proprioception légère, gainage court), sans la complexité de planification par période de saison de la version adulte, mais avec la même valeur de régularité et de sérieux dans l'exécution.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Accélération courte pour la contre-attaque", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'accélération explosive sur de très courtes distances", duree: 15, nbJoueurs: "Groupes de 3-4 par couloir",
    materiel: "Plots, chronomètre",
    description: "Départs explosifs sur des distances courtes (5-10 mètres), en volume modéré, pour développer progressivement la qualité d'accélération utile en transition, avant le travail plus poussé des catégories plus âgées.",
    diagram: genSprintLanes(3),
  },
];

const STARTER_EXERCISES_NATIONS_TECHNIQUE_8 = [
  {
    name: "Frappe précise, introduction à la puissance", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir la frappe technique avec un premier travail de puissance mesurée", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes où la précision reste la priorité, avec une puissance progressivement un peu plus marquée qu'en Foot à 5, sans rechercher la puissance maximale de la version adulte.",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Contrôle-passe en espace un peu plus large", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir la précision technique en espace réduit, avec plus de marge qu'à onze", duree: 15, nbJoueurs: "4-5 joueurs dans un espace modéré",
    materiel: "Plots, ballons",
    description: "Circulation de balle en deux-trois touches maximum (plus souple que la limite d'une-deux touches de la version adulte) dans un espace réduit mais un peu plus généreux, pour laisser le temps de développer la qualité technique nécessaire avant d'augmenter l'exigence avec l'âge.",
    diagram: genPassingGrid(4),
  },
  {
    name: "Centre et première approche du jeu de tête", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir prudemment le contact de tête sur un ballon adapté", duree: 15, nbJoueurs: "Groupes de 3 en rotation",
    materiel: "Ballons plus légers si disponibles, cage",
    description: "Centres doux et travail du contact de tête sur ballon léger ou peu gonflé si possible, en insistant sur la technique (front, yeux ouverts) plutôt que sur la puissance de l'impact. Introduction prudente et progressive du geste, à ne jamais forcer si l'enfant est mal à l'aise avec le contact.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "Timing du tacle, première approche", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir le bon moment pour tenter une récupération de balle propre", duree: 15, nbJoueurs: "Binômes en rotation, défenseur passif puis semi-actif",
    materiel: "Ballons",
    description: "Travail du timing de l'intervention défensive (quand intervenir, quand attendre) contre un partenaire d'abord passif puis progressivement plus actif, sans insister sur l'engagement physique du tacle glissé complet réservé aux catégories plus âgées.",
    diagram: [pel("playerB", 0.5, 0.5), pel("playerA", 0.35, 0.5, { number: 1 }), pel("ball", 0.42, 0.5)],
  },
  {
    name: "Frappe de mi-distance", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir la frappe à distance moyenne, avant la version longue distance des catégories plus âgées", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage, plots pour marquer la distance",
    description: "Séries de frappes depuis une distance moyenne (plus proche que la frappe lointaine adulte), en travaillant l'armé complet de la jambe sans rechercher la puissance maximale. Premier pas vers la frappe longue distance qui deviendra plus exigeante en Foot à 11.",
    diagram: genShooting(1, { ballX: 0.48, ballY: 0.5 }),
  },
  {
    name: "Feintes à vitesse progressive", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir les feintes de dribble à un rythme progressif avant la pleine vitesse", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Reprise des gestes de feinte déjà découverts (crochet, feinte de corps) mais en insistant sur une accélération progressive du rythme d'exécution, plutôt que la vitesse maximale immédiate travaillée dans la version pour joueurs plus âgés.",
    diagram: genDribbleMove(),
  },
  {
    name: "Jeu de pieds simple façon futsal", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir un geste de jeu de pieds accessible avant les gestes plus avancés", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Introduction d'un geste de jeu de pieds simple inspiré du futsal (déplacement rapide du ballon d'un pied à l'autre, la Croqueta déjà travaillée par ailleurs), avant d'aborder des gestes plus avancés comme l'élastico réservés à un stade technique plus mûr.",
    diagram: genDribbleMove(),
  },
  {
    name: "Réception et pivot, pression modérée", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir le contrôle-pivot sous une pression plus légère qu'à onze", duree: 15, nbJoueurs: "Trios, avec un défenseur pressant modérément",
    materiel: "Ballons, plots",
    description: "Le receveur s'entraîne à contrôler et se retourner face au jeu sous une pression modérée et prévisible, avant la pression plus intense et moins prévisible de la version pour joueurs plus âgés.",
    diagram: [pel("playerB", 0.58, 0.5), pel("playerA", 0.45, 0.5, { number: 1 }), pel("ball", 0.35, 0.5)],
  },
  {
    name: "Qualité du premier contrôle", category: "technique", ageFormat: "foot_a_8",
    objectif: "Élever l'exigence sur le premier contrôle par rapport à la découverte du Foot à 5", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots",
    description: "Travail du premier contrôle sur des passes variées mais plus prévisibles qu'à onze, avec une exigence de qualité un peu plus élevée que la simple découverte du Foot à 5.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Finition après course rapide", category: "technique", ageFormat: "foot_a_8",
    objectif: "Découvrir la finition en mouvement, avant la pleine vitesse de transition adulte", duree: 15, nbJoueurs: "2 attaquants en course modérée vers le but",
    materiel: "Ballons, cage",
    description: "Séquences de finition où l'attaquant reçoit en course modérée (pas encore à pleine vitesse comme en Foot à 11) et doit conclure rapidement. Premier pas vers la finition en transition rapide qui deviendra plus exigeante avec l'âge.",
    diagram: genShooting(2, { arrow: true }),
  },
];

const STARTER_EXERCISES_NATIONS_TACTIQUE_8 = [
  {
    name: "Duel 1 contre 1 puis passe simple", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir le lien entre le duel individuel et la suite collective, en version simplifiée", duree: 15, nbJoueurs: "1 contre 1 avec un soutien",
    materiel: "Plots, ballons",
    description: "Version simplifiée de l'exercice équivalent en Foot à 11 : après avoir gagné son duel, l'enfant cherche simplement un copain plutôt que d'intégrer un schéma collectif complexe.",
    diagram: genVs(1, 1, { xA: 0.3, xB: 0.5, hasKeeper: false }),
  },
  {
    name: "Rondo simple façon jeu de position", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir en douceur l'idée de garder une position de référence en conservant le ballon", duree: 15, nbJoueurs: "6 contre 2",
    materiel: "Plots pour délimiter de grandes zones souples, chasubles",
    description: "Rester souple sur le respect de la zone à cet âge.",
    diagram: genRondo(6, 2),
  },
  {
    name: "Jouer vite vers l'avant quand c'est possible", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'intérêt de la verticalité sans contrainte de temps stricte", duree: 15, nbJoueurs: "6 contre 6",
    materiel: "Plots, chasubles",
    description: "Jeu à thème où chaque récupération de balle est suivie d'un encouragement explicite à chercher l'avant en premier, sans la contrainte de temps stricte de la version adulte.",
    diagram: genVs(6, 6, { xA: 0.35, xB: 0.6 }),
  },
  {
    name: "S'aider à deux pour défendre", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'entraide défensive de base entre deux défenseurs", duree: 15, nbJoueurs: "2 défenseurs contre 2 attaquants",
    materiel: "Plots, chasubles",
    description: "Situation simple à 2 contre 2 où l'un des défenseurs presse le porteur pendant que l'autre se positionne en soutien proche, avant d'échanger les rôles.",
    diagram: genVs(2, 2, { xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Presser vite tous ensemble après la perte", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'idée de pressing collectif immédiat, sans règle de temps stricte", duree: 15, nbJoueurs: "6 contre 6",
    materiel: "Plots, chasubles",
    description: "Consigne simple : dès la perte du ballon, tout le monde presse ensemble pendant quelques secondes avant de se replier si le ballon n'est pas récupéré.",
    diagram: genVs(6, 6, { zone: [0.2, 0.1, 0.8, 0.9] }),
  },
  {
    name: "La gambeta en espace réduit, initiation", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Développer le dribble créatif en espace confiné, comme en Foot à 11 mais un peu plus large", duree: 15, nbJoueurs: "1 contre 1 en espace réduit, en rotation",
    materiel: "Plots, ballons",
    description: "Duels 1 contre 1 dans un espace réduit mais un peu plus généreux qu'en Foot à 11, pour laisser à cet âge la place à l'essai et à l'erreur technique.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, zone: [0.25, 0.3, 0.75, 0.7] }),
  },
  {
    name: "Jeu au sol en petit espace", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la circulation rapide au sol en espace réduit, inspirée du futsal", duree: 15, nbJoueurs: "6 contre 6 en espace réduit",
    materiel: "Plots pour délimiter l'espace, petites cages",
    description: "Garder une ambiance ludique et valoriser les tentatives créatives, même ratées.",
    diagram: genVs(6, 6, { zone: [0.2, 0.15, 0.8, 0.85] }),
  },
  {
    name: "Garder le ballon au milieu sous un peu de pression", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la conservation du ballon au milieu face à une pression modérée", duree: 15, nbJoueurs: "4 milieux contre 2 pressants",
    materiel: "Plots, chasubles, ballons",
    description: "Jeu de conservation dans le couloir central avec une pression plus légère que la version pour joueurs plus âgés (2 pressants au lieu de 3), pour laisser le temps de développer les repères techniques et tactiques nécessaires avant d'augmenter la difficulté avec l'âge.",
    diagram: genVs(4, 2, { zone: [0.3, 0.2, 0.7, 0.8] }),
  },
  {
    name: "Échanger sa place avec un copain", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir très simplement l'idée d'échanger sa position avec un partenaire", duree: 15, nbJoueurs: "8 contre 4 en possession",
    materiel: "Plots pour marquer deux zones de référence, chasubles",
    description: "",
    diagram: genVs(8, 4, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Contre-attaque à plusieurs", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la prise d'initiative individuelle dans une transition rapide en surnombre", duree: 15, nbJoueurs: "3 attaquants contre 2 défenseurs",
    materiel: "Plots, petites cages, ballons",
    description: "Transition rapide en supériorité numérique où chaque enfant est encouragé à tenter une action individuelle (dribble, course rapide) plutôt que de systématiquement chercher l'option la plus prudente. Version à effectif réduit de l'exercice équivalent en Foot à 11.",
    diagram: genVs(3, 2, { xA: 0.35, xB: 0.6 }),
  },
];

const STARTER_EXERCISES_NATIONS_MENTAL_11 = [
  {
    name: "Équilibre entre expression individuelle et discipline collective", category: "mental", ageFormat: "standard",
    objectif: "Développer l'équilibre entre expression individuelle et discipline collective", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion et mise en situation où chaque joueur identifie une de ses qualités individuelles fortes et réfléchit à comment la mettre explicitement au service d'un objectif collectif du match à venir.",
    diagram: [],
  },
  {
    name: "Patience et confiance dans le processus", category: "mental", ageFormat: "standard",
    objectif: "S'inspirer de la patience mentale requise par un jeu de possession long", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur la gestion de la frustration quand la possession ne débouche pas immédiatement sur une occasion, avec des exemples concrets de matchs où la patience collective a fini par payer.",
    diagram: [],
  },
  {
    name: "Résilience jusqu'au bout", category: "mental", ageFormat: "standard",
    objectif: "Développer la mentalité de ne jamais abandonner avant le coup de sifflet final", duree: 15, nbJoueurs: "Groupe complet, en fin de match simulé",
    materiel: "Aucun",
    description: "Situation de match simulée où l'équipe est menée dans les dernières minutes, avec un travail explicite sur le maintien de l'engagement et de la conviction jusqu'à la fin plutôt que le relâchement.",
    diagram: [],
  },
  {
    name: "Concentration tactique sur la durée", category: "mental", ageFormat: "standard",
    objectif: "Développer la concentration défensive sur la durée complète d'un match", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Exercice de visualisation où chaque défenseur imagine mentalement le maintien de sa concentration positionnelle sur la durée complète d'un match, y compris dans les moments où le jeu semble calme.",
    diagram: [],
  },
  {
    name: "Force mentale collective, l'esprit d'équipe", category: "mental", ageFormat: "standard",
    objectif: "Développer un esprit collectif fort au sein du groupe", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion collective sur un engagement mutuel explicite (\"je peux compter sur toi, tu peux compter sur moi\") avant une échéance importante.",
    diagram: [],
  },
  {
    name: "La niaque, refuser d'abandonner", category: "mental", ageFormat: "standard",
    objectif: "Développer la combativité et la passion dans le jeu", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Travail sur l'engagement émotionnel et physique dans chaque duel, chaque récupération, chaque situation de jeu, sans jamais se résigner même en situation défavorable.",
    diagram: [],
  },
  {
    name: "Jouer avec joie et liberté", category: "mental", ageFormat: "standard",
    objectif: "Privilégier le plaisir et la créativité dans le jeu", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Rappel avant une séance ou un match que la prise de risque créative (tenter un geste, oser une passe originale) est encouragée plutôt que sanctionnée en cas d'échec. Reflète la philosophie du \"jogo bonito\", où le plaisir de jouer et la liberté d'expression sont considérés comme des leviers de performance, pas comme des concessions à l'efficacité.",
    diagram: [],
  },
  {
    name: "Croire malgré la taille du pays", category: "mental", ageFormat: "standard",
    objectif: "S'inspirer de la conviction collective d'une petite nation qui refuse ses limites apparentes", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur des exemples concrets où un collectif plus modeste sur le papier a dépassé les attentes par la conviction et la cohésion plutôt que par les moyens.",
    diagram: [],
  },
  {
    name: "Conviction dans son identité de jeu", category: "mental", ageFormat: "standard",
    objectif: "Développer la conviction dans ses idées de jeu, même sous critique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur l'importance de rester fidèle à une identité de jeu choisie même face à un résultat décevant ponctuel, plutôt que de l'abandonner à la première difficulté.",
    diagram: [],
  },
  {
    name: "Gérer l'attente extérieure", category: "mental", ageFormat: "standard",
    objectif: "Développer la gestion de la pression liée aux attentes externes élevées", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion sur la différence entre la pression que l'on s'impose soi-même et celle que le regard extérieur (médias, supporters, statut de favori) fait peser sur une équipe.",
    diagram: [],
  },
];

const STARTER_EXERCISES_NATIONS_ATHLETIQUE_11 = [
  {
    name: "Puissance explosive", category: "athletique", ageFormat: "standard",
    objectif: "Développer la puissance athlétique associée à la technique", duree: 15, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Plots, élastiques si disponibles",
    description: "",
    diagram: genSprintLanes(3),
  },
  {
    name: "Agilité en espace confiné", category: "athletique", ageFormat: "standard",
    objectif: "S'inspirer du besoin d'agilité en espace réduit plutôt que de puissance brute", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots resserrés",
    description: "Parcours d'agilité aux plots très rapprochés, favorisant la fréquence d'appuis et les changements de direction fins plutôt que la puissance ou la vitesse linéaire. Reflète les besoins athlétiques d'un jeu de possession en espace réduit, où l'agilité prime sur la puissance pure.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Intermittent haute intensité", category: "athletique", ageFormat: "standard",
    objectif: "Développer la capacité à soutenir un rythme de jeu très intense", duree: 20, nbJoueurs: "Groupe complet ou par vagues",
    materiel: "Plots, chronomètre",
    description: "",
    diagram: genSprintLanes(2),
  },
  {
    name: "Endurance de concentration positionnelle", category: "athletique", ageFormat: "standard",
    objectif: "Maintenir une discipline positionnelle sur la durée", duree: 20, nbJoueurs: "5-6 défenseurs en maintien de bloc prolongé",
    materiel: "Plots pour marquer les lignes de bloc",
    description: "Maintien prolongé d'un bloc défensif organisé (15-20 minutes sans interruption) face à des vagues d'attaquants qui se relaient, pour habituer à la fatigue de concentration positionnelle sur la durée d'un match.",
    diagram: genLine(5, 4),
  },
  {
    name: "Conditionnement structuré par blocs", category: "athletique", ageFormat: "standard",
    objectif: "Structurer la préparation physique de façon scientifique et méthodique", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre, cahier de suivi si possible",
    description: "Séance de conditionnement organisée en blocs précisément chronométrés et progressifs (échauffement mesuré, blocs d'intensité croissante puis décroissante), avec un suivi systématique des temps et répétitions d'une séance à l'autre.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Résistance à la fatigue et à l'adversité", category: "athletique", ageFormat: "standard",
    objectif: "Développer la résilience physique et mentale face à l'adversité", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, ballons",
    description: "Enchaînement d'efforts physiques exigeants suivis immédiatement d'une action technique ou tactique à réaliser malgré la fatigue accumulée, pour habituer à maintenir la qualité d'exécution en fin d'effort.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Rythme et coordination", category: "athletique", ageFormat: "standard",
    objectif: "Développer la coordination par le rythme", duree: 15, nbJoueurs: "Groupe complet, en ligne ou en cercle",
    materiel: "Musique en option, plots",
    description: "",
    diagram: genAgilityPattern(),
  },
  {
    name: "Endurance et ténacité du petit collectif", category: "athletique", ageFormat: "standard",
    objectif: "S'inspirer de la ténacité physique d'une nation qui compense la taille par l'engagement", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Plots, chronomètre",
    description: "Efforts prolongés à intensité sous-maximale mais constante (courses de 3-5 minutes sans relâchement), développant la capacité à maintenir l'engagement physique sur la durée.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Périodisation et prévention structurée", category: "athletique", ageFormat: "standard",
    objectif: "Structurer la gestion de la charge physique de façon scientifique", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Élastiques, tapis si disponibles",
    description: "",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Accélération explosive pour la contre-attaque", category: "athletique", ageFormat: "standard",
    objectif: "Développer la vitesse d'accélération utile en transition", duree: 15, nbJoueurs: "Groupes de 3-4 par couloir",
    materiel: "Plots, chronomètre",
    description: "Départs explosifs sur de courtes distances (5-15 mètres), reproduisant la vitesse d'accélération nécessaire pour exploiter un espace en contre-attaque.",
    diagram: genSprintLanes(4),
  },
];

const STARTER_EXERCISES_NATIONS_TECHNIQUE_11 = [
  {
    name: "Frappe puissante et précise", category: "technique", ageFormat: "standard",
    objectif: "Allier puissance et précision technique dans la frappe", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes travaillant à la fois la puissance du contact et la précision de la trajectoire, plutôt que de dissocier ces deux qualités.",
    diagram: genTechniqueShot({ cones: true }),
  },
  {
    name: "Contrôle et passe en une-deux touches en espace restreint", category: "technique", ageFormat: "standard",
    objectif: "Développer la précision technique en espace confiné", duree: 15, nbJoueurs: "4-5 joueurs dans un espace réduit",
    materiel: "Plots pour délimiter un petit espace, ballons",
    description: "Circulation de balle en une ou deux touches maximum dans un espace volontairement restreint, exigeant une qualité de contrôle et de passe irréprochable.",
    diagram: genPassingGrid(5),
  },
  {
    name: "Centre et jeu de tête", category: "technique", ageFormat: "standard",
    objectif: "Développer la qualité de centre et le jeu aérien", duree: 15, nbJoueurs: "Groupes de 3 en rotation (centreur, attaquant de tête, gardien)",
    materiel: "Ballons, cage",
    description: "Séries de centres variés (tendu, en cloche, en retrait) suivis systématiquement d'une reprise de la tête.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "Technique de tacle et interception", category: "technique", ageFormat: "standard",
    objectif: "Développer la technique pure du tacle et de l'interception", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots",
    description: "Travail technique isolé du tacle glissé et de l'interception (timing, surface de contact, position du corps pour ne pas se faire sanctionner), avant toute mise en opposition réelle.",
    diagram: [pel("playerB", 0.5, 0.5), pel("playerA", 0.35, 0.5, { number: 1 }), pel("ball", 0.42, 0.5)],
  },
  {
    name: "Frappe de loin, puissance et précision", category: "technique", ageFormat: "standard",
    objectif: "Développer les frappes puissantes à distance", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage, plots pour marquer les distances de frappe",
    description: "Séries de frappes depuis l'extérieur de la surface, en insistant sur l'armé complet de la jambe et la puissance du contact, tout en gardant un cadrage correct.",
    diagram: genShooting(1, { ballX: 0.4, ballY: 0.5 }),
  },
  {
    name: "La gambeta rapide en couloir", category: "technique", ageFormat: "standard",
    objectif: "Développer le dribble créatif à vitesse élevée", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Enchaînement de petites touches rapides et de feintes de corps en pleine vitesse de course, plutôt qu'à l'arrêt.",
    diagram: genDribbleMove(),
  },
  {
    name: "L'élastico et jeu de pieds rapide", category: "technique", ageFormat: "standard",
    objectif: "Développer un jeu de pieds créatif inspiré du futsal", duree: 15, nbJoueurs: "Individuel face à un plot, en rotation",
    materiel: "Plots, ballons",
    description: "Travail du geste technique de l'élastico (changement de direction du ballon par un mouvement circulaire rapide du pied) et d'autres gestes de jeu de pieds rapides issus du futsal, décomposés lentement puis accélérés progressivement.",
    diagram: genDribbleMove(),
  },
  {
    name: "Réception et pivot sous pression au milieu", category: "technique", ageFormat: "standard",
    objectif: "Développer la qualité technique de réception et de pivot au milieu de terrain", duree: 15, nbJoueurs: "Trios, avec un défenseur pressant le receveur",
    materiel: "Ballons, plots",
    description: "Le milieu reçoit sous pression immédiate d'un défenseur et doit contrôler-pivoter en un minimum de gestes pour se retourner face au jeu.",
    diagram: [pel("playerB", 0.55, 0.5), pel("playerA", 0.45, 0.5, { number: 1 }), pel("ball", 0.35, 0.5)],
  },
  {
    name: "Premier contrôle, pureté du geste", category: "technique", ageFormat: "standard",
    objectif: "Développer l'exigence sur la qualité du premier contrôle", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons, plots",
    description: "Travail exigeant du premier contrôle sur des passes variées (au sol, en l'air, rapides, lentes), avec un standard de qualité élevé sur l'amorti et l'orientation immédiate.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Finition en transition rapide", category: "technique", ageFormat: "standard",
    objectif: "Développer la finition en contre-attaque rapide", duree: 15, nbJoueurs: "2-3 attaquants en course rapide vers le but",
    materiel: "Ballons, cage",
    description: "Séquences de finition où l'attaquant reçoit en pleine course rapide (pas à l'arrêt) et doit conclure en un minimum de touches.",
    diagram: genShooting(2, { arrow: true }),
  },
];

const STARTER_EXERCISES_NATIONS_TACTIQUE_11 = [
  {
    name: "Duel 1 contre 1 orienté vers le collectif", category: "tactique", ageFormat: "standard",
    objectif: "Allier la réussite du duel technique individuel à la lecture collective du jeu", duree: 20, nbJoueurs: "1 contre 1 avec deux soutiens en relais",
    materiel: "Plots, petites cages, ballons",
    description: "Un duel 1 contre 1 classique, mais où le vainqueur doit immédiatement chercher un des deux soutiens positionnés pour continuer l'action collectivement, plutôt que de s'arrêter après l'élimination.",
    diagram: genVs(1, 1, { xA: 0.3, xB: 0.5, hasKeeper: false }),
  },
  {
    name: "Rondo positionnel en zones fixes", category: "tactique", ageFormat: "standard",
    objectif: "Développer le jeu de position, où chaque joueur respecte une zone stricte", duree: 20, nbJoueurs: "8 contre 2 ou 3, en zones fixes",
    materiel: "Plots pour délimiter des zones précises, chasubles",
    description: "Insister sur la fixation de l'adversaire par la position plutôt que par le mouvement, avant la passe qui casse une ligne de pressing.",
    diagram: genRondo(8, 2),
  },
  {
    name: "Transition rapide et jeu direct", category: "tactique", ageFormat: "standard",
    objectif: "Développer la verticalité et l'intensité dans les transitions", duree: 20, nbJoueurs: "6 contre 6",
    materiel: "Plots, cages, chasubles",
    description: "Jeu à thème où l'équipe qui récupère le ballon a une fenêtre de temps courte pour trouver une solution verticale avant que la possession ne soit jugée \"trop lente\".",
    diagram: genVs(6, 6, { hasKeeper: true, xA: 0.35, xB: 0.6 }),
  },
  {
    name: "Bloc bas et couverture", category: "tactique", ageFormat: "standard",
    objectif: "Développer l'organisation défensive et la couverture collective", duree: 20, nbJoueurs: "5-6 défenseurs contre 4-5 attaquants",
    materiel: "Plots, chasubles",
    description: "",
    diagram: genLine(6, 5),
  },
  {
    name: "Contre-pressing immédiat à déclenchement précis", category: "tactique", ageFormat: "standard",
    objectif: "Maîtriser le contre-pressing immédiat, avec des principes explicites de déclenchement", duree: 20, nbJoueurs: "6 contre 6 en espace réduit",
    materiel: "Plots, chasubles, chronomètre",
    description: "Plus détaillé et systématisé que l'exercice de contre-pressing générique déjà présent.",
    diagram: genVs(6, 6, { zone: [0.25, 0.1, 0.75, 0.9] }),
  },
  {
    name: "La gambeta en espace réduit", category: "tactique", ageFormat: "standard",
    objectif: "Développer le dribble créatif en espace confiné", duree: 15, nbJoueurs: "1 contre 1 en espace très réduit, en rotation",
    materiel: "Plots pour délimiter un très petit espace, ballons",
    description: "Encourager l'improvisation et la prise de risque technique plutôt que la sécurité, dans un cadre où l'erreur n'a pas de conséquence collective grave.",
    diagram: genVs(1, 1, { xA: 0.4, xB: 0.55, zone: [0.3, 0.35, 0.7, 0.65] }),
  },
  {
    name: "Jeu au sol façon futsal", category: "tactique", ageFormat: "standard",
    objectif: "Développer la circulation rapide au sol, dans l'esprit du futsal", duree: 20, nbJoueurs: "5 contre 5 en espace réduit",
    materiel: "Plots pour délimiter un espace réduit, petites cages, ballons",
    description: "Favoriser la circulation rapide au sol, les prises de balle en un temps et la créativité individuelle dans le petit espace, plutôt que le jeu direct.",
    diagram: genVs(5, 5, { zone: [0.2, 0.15, 0.8, 0.85] }),
  },
  {
    name: "Circulation et maîtrise au milieu sous pression", category: "tactique", ageFormat: "standard",
    objectif: "Développer la maîtrise technique et tactique au milieu de terrain sous pression", duree: 20, nbJoueurs: "4 milieux contre 3 pressants",
    materiel: "Plots, chasubles, ballons",
    description: "Jeu de conservation concentré dans le couloir central du terrain, où les milieux doivent maintenir la possession et l'orientation du jeu sous pression constante.",
    diagram: genVs(4, 3, { zone: [0.3, 0.2, 0.7, 0.8] }),
  },
  {
    name: "Permutations de postes en mouvement", category: "tactique", ageFormat: "standard",
    objectif: "Développer l'interchangeabilité des postes en mouvement", duree: 20, nbJoueurs: "7 contre 4 en possession",
    materiel: "Plots pour marquer les zones de référence, chasubles",
    description: "Jeu de possession où les joueurs échangent régulièrement leurs zones de référence tout en maintenant collectivement l'équilibre et l'occupation de l'espace du système.",
    diagram: genVs(7, 4, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Transition offensive en supériorité", category: "tactique", ageFormat: "standard",
    objectif: "Développer l'initiative individuelle en contre-attaque", duree: 15, nbJoueurs: "4 attaquants contre 3 défenseurs",
    materiel: "Plots, cages, ballons",
    description: "Transition rapide en supériorité numérique vers le but, où chaque attaquant est encouragé à prendre l'initiative individuelle (dribble, prise de risque) plutôt que de systématiquement chercher la solution la plus sûre.",
    diagram: genVs(4, 3, { xA: 0.3, xB: 0.6, hasKeeper: true }),
  },
];

const STARTER_EXERCISES_FOOT8_MENTAL = [
  {
    name: "Apprendre de la défaite", category: "mental", ageFormat: "foot_a_8",
    objectif: "Introduire une première relation constructive à la défaite, sans dramatisation", duree: 10, nbJoueurs: "Groupe complet, après un match ou un jeu à enjeu",
    materiel: "Aucun",
    description: "Après un match perdu (réel ou simulé en séance), demander à chaque enfant de nommer une chose que l'équipe a bien faite malgré la défaite. Introduit progressivement l'idée que perdre fait partie du jeu et peut être une source d'apprentissage, sans pour autant minimiser la déception ressentie — les deux peuvent coexister.",
    diagram: [],
  },
  {
    name: "Mon petit objectif de match", category: "mental", ageFormat: "foot_a_8",
    objectif: "Fixer un objectif personnel centré sur l'effort plutôt que sur le résultat", duree: 10, nbJoueurs: "Groupe complet, avant un match",
    materiel: "Aucun",
    description: "Avant le match, chaque enfant choisit un objectif personnel simple et observable (\"je communique avec mes coéquipiers\", \"je fais des efforts défensifs\") totalement indépendant du score final. Après le match, revenir sur cet objectif plutôt que sur le résultat en priorité — habitue progressivement à dissocier la valeur de la performance individuelle du résultat collectif.",
    diagram: [],
  },
  {
    name: "Gérer une petite déception", category: "mental", ageFormat: "foot_a_8",
    objectif: "Introduire une régulation émotionnelle simple après un raté ponctuel", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu ou un match",
    materiel: "Aucun",
    description: "Introduire un geste ou un mot simple à utiliser après une déception ponctuelle en match (une occasion manquée, une erreur) — plus explicite que le \"recommencer avec le sourire\" du Foot à 5, mais encore loin du protocole mental structuré des catégories plus âgées. Une étape intermédiaire dans l'apprentissage de la régulation émotionnelle.",
    diagram: [],
  },
  {
    name: "Le respect de l'adversaire", category: "mental", ageFormat: "foot_a_8",
    objectif: "Développer le respect de l'adversaire, qu'on gagne ou qu'on perde", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Discussion simple et rituel systématique (se serrer la main, se féliciter mutuellement) après chaque match, quel que soit le résultat. Construit tôt une relation saine à la compétition où l'adversaire est un partenaire de jeu à respecter, pas un ennemi, une base importante avant que l'enjeu des matchs ne grandisse avec l'âge.",
    diagram: [],
  },
  {
    name: "Encourager un copain qui a raté", category: "mental", ageFormat: "foot_a_8",
    objectif: "Développer le soutien actif entre coéquipiers face à l'erreur", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu",
    materiel: "Aucun",
    description: "Consigne explicite pendant un jeu à enjeu : après l'erreur d'un coéquipier, les autres doivent lui dire un mot d'encouragement avant de reprendre le jeu. Plus structuré que l'attention simple portée aux émotions du Foot à 5, introduit l'idée d'un soutien actif et verbalisé face à l'erreur d'un partenaire.",
    diagram: [],
  },
  {
    name: "Un match qui compte, sans en avoir peur", category: "mental", ageFormat: "foot_a_8",
    objectif: "Introduire très progressivement la notion d'enjeu sportif, sans générer d'anxiété", duree: 10, nbJoueurs: "Groupe complet, avant un match un peu plus \"important\"",
    materiel: "Aucun",
    description: "Avant un match présenté comme un peu plus \"important\" (contre une équipe qu'ils connaissent, ou dans un contexte de classement), discussion courte pour nommer que ce match \"compte un peu plus\" sans en faire une source de pression. Insister sur le fait que l'enjeu rend le jeu plus excitant, pas plus menaçant — la première pierre d'un rapport sain et progressif à la compétition qui se construira sur plusieurs années.",
    diagram: [],
  },
];

const STARTER_EXERCISES_FOOT8_ATHLETIQUE = [
  {
    name: "Vitesse et réaction sur signal", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Développer la vitesse de réaction avec une première approche technique de la course", duree: 15, nbJoueurs: "Groupes de 3-4 par couloir",
    materiel: "Plots, chronomètre",
    description: "Départs rapides sur signal (sonore ou visuel) sur de courtes distances, avec une première attention portée à la technique de course (position du corps, appuis) contrairement au simple jeu de poursuite du Foot à 5. Garder la dimension ludique en variant les signaux et les positions de départ.",
    diagram: genSprintLanes(4),
  },
  {
    name: "Parcours d'agilité technique", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Structurer le travail d'agilité avec une attention portée aux appuis", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Plots, échelle de rythme si disponible",
    description: "Parcours de plots imposant des changements de direction, avec une attention portée à la qualité des appuis (position basse, réactivité) plutôt qu'à la seule vitesse d'exécution comme au Foot à 5. Premier pas vers le travail d'agilité plus poussé des catégories plus âgées.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Renforcement au poids du corps, première approche", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Introduire le renforcement musculaire simple, uniquement au poids du corps", duree: 15, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Tapis si disponible",
    description: "Exercices simples au poids du corps uniquement (squats sans charge, gainage court, pompes sur les genoux si besoin), jamais avec charge ajoutée à cet âge où le squelette est encore en développement. Contrairement aux exercices \"standard\" avec élastiques ou charges légères, ici tout reste au poids du corps, en quantité modérée.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Sauts simples, introduction à la pliométrie", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Introduire prudemment le travail de saut, à faible volume", duree: 10, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plots bas ou lignes au sol",
    description: "Sauts bipodaux simples par-dessus de petits plots ou lignes au sol, en très faible volume (quelques répétitions par série) et toujours avec un temps de récupération complet entre les séries. Introduction prudente et progressive, bien en dessous du volume travaillé dans les catégories plus âgées.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("cone", 0.45, 0.5), pel("cone", 0.55, 0.5), ael("arrowMove", 0.3, 0.5, 0.65, 0.5)],
  },
  {
    name: "Coordination avec et sans ballon", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Combiner un travail de coordination générale avec la manipulation du ballon", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, plots, échelle de rythme si disponible",
    description: "Parcours combinant une phase de coordination pure (échelle de rythme, appuis rapides) suivie immédiatement d'une phase avec ballon (conduite, passe sur cible). Renforce le lien entre les qualités motrices générales et leur application avec le ballon, plus structuré que l'exercice équivalent du Foot à 5.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le relais par équipe", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Développer la vitesse dans un cadre collectif motivant", duree: 15, nbJoueurs: "Équipes de 3-4 en relais",
    materiel: "Plots, ballons en option",
    description: "Relais par équipes avec plusieurs variantes possibles (course simple, course avec ballon, slalom), où l'esprit d'équipe motive l'effort individuel. Plus structuré que le relais du Foot à 5 (variantes plus nombreuses, parcours plus exigeants), tout en gardant l'aspect collectif et motivant.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Échauffement dynamique adapté", category: "athletique", ageFormat: "foot_a_8",
    objectif: "Introduire une routine d'échauffement structurée et progressive", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Série de mouvements dynamiques simples (montées de genoux, talons-fesses, pas chassés) réalisée en ligne, dans un ordre progressif qui deviendra une routine reconnaissable au fil des séances. Premier pas vers l'échauffement structuré des catégories plus âgées, tout en gardant des mouvements simples et un temps court adapté à l'attention de cet âge.",
    diagram: genSprintLanes(3),
  },
];

const STARTER_EXERCISES_FOOT8_TACTIQUE = [
  {
    name: "Découvrir sa zone de jeu", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Introduire des repères de position simples, sans rigidité excessive", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots pour délimiter de grandes zones, chasubles",
    description: "Le terrain est divisé en 3-4 grandes zones et chaque enfant reçoit une zone de référence à occuper prioritairement, tout en gardant la liberté de la quitter ponctuellement en fonction du jeu. Premier pas vers la notion de position, plus structuré que le jeu par couleurs du Foot à 5, mais encore loin de la rigueur d'un système à onze.",
    diagram: genVs(8, 8, { zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Le une-deux simple", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la combinaison de base passe-et-va", duree: 15, nbJoueurs: "Trios en situation, puis intégré en match",
    materiel: "Plots, ballons, chasubles",
    description: "Un joueur passe à un partenaire puis part immédiatement en soutien pour recevoir le retour en mouvement. D'abord travaillé en situation isolée à trois, puis réintégré progressivement dans un jeu à thème où chaque une-deux réussi est valorisé. Première combinaison tactique explicite adaptée à cet âge.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.5, 0.4, { number: 2 }), ael("arrowPass", 0.3, 0.5, 0.5, 0.4), ael("arrowMove", 0.3, 0.5, 0.45, 0.55, { curved: true })],
  },
  {
    name: "Élargir le jeu, utiliser la largeur", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir l'intérêt d'occuper la largeur du terrain à 8", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots pour marquer les couloirs extérieurs, chasubles",
    description: "Jeu à thème où les couloirs extérieurs du terrain (plus grand qu'à 5) doivent être occupés par au moins un joueur de chaque équipe en permanence. Introduit concrètement l'idée que l'espace supplémentaire du foot à 8 permet et demande d'écarter le jeu, contrairement au foot à 5 où l'espace réduit ne le permettait pas vraiment.",
    diagram: genVs(8, 8, { zone: [0.08, 0.08, 0.92, 0.92] }),
  },
  {
    name: "Le repli organisé, revenir ensemble", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Introduire une notion simple de repli collectif plutôt qu'individuel", duree: 15, nbJoueurs: "8 contre 8",
    materiel: "Plots, chasubles",
    description: "Consigne de jeu : après une perte de balle, l'équipe doit revenir ensemble en essayant de garder une distance raisonnable entre les joueurs, plutôt que de revenir chacun de son côté en ordre dispersé. Premier pas vers la notion de bloc défensif, présentée simplement comme \"on rentre ensemble\" plutôt que par un vocabulaire tactique complexe.",
    diagram: genLine(6, 6),
  },
  {
    name: "Jouer en trois lignes (avant, milieu, arrière)", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Introduire la notion de lignes de jeu, précurseur du système à onze", duree: 20, nbJoueurs: "8 contre 8",
    materiel: "Plots pour marquer trois bandes horizontales, chasubles",
    description: "Le terrain est divisé en trois bandes (défense, milieu, attaque) et chaque enfant appartient à l'une d'elles pour la séance. Premier contact concret avec la notion de ligne de jeu, base de tous les systèmes qu'ils découvriront à onze plus tard, tout en gardant une grande souplesse d'exécution à cet âge.",
    diagram: genFromFormation("4-4-2"),
  },
  {
    name: "Marquer son adversaire direct", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Découvrir la responsabilité individuelle simple de marquage", duree: 15, nbJoueurs: "8 contre 8, avec duels désignés",
    materiel: "Chasubles pour désigner les duels, plots",
    description: "Chaque enfant reçoit un adversaire direct à suivre pendant une période de jeu délimitée, avant de changer de vis-à-vis. Introduit la notion de responsabilité défensive individuelle simple, sans encore aborder les concepts plus complexes de couverture ou de bascule collective réservés aux catégories plus âgées.",
    diagram: genVs(6, 6),
  },
  {
    name: "Créer une supériorité à deux contre un", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Consolider la prise de décision en surnombre, avec un vocabulaire tactique explicite", duree: 15, nbJoueurs: "2 attaquants contre 1 défenseur, en rotation",
    materiel: "Plots, petites cages, ballons",
    description: "Situation répétée de 2 contre 1 vers une petite cage, avec cette fois un vocabulaire tactique explicite introduit (\"fixer\", \"appel\", \"soutien\") contrairement au même exercice en catégorie plus jeune qui resterait purement intuitif. Premier pas vers l'analyse verbale du jeu, adapté à la capacité de compréhension grandissante à cet âge.",
    diagram: genVs(2, 1, { xA: 0.25, xB: 0.55 }),
  },
  {
    name: "Découvrir un système simple (2-3-2)", category: "tactique", ageFormat: "foot_a_8",
    objectif: "Introduire très simplement la notion de système de jeu à huit", duree: 20, nbJoueurs: "8 contre 8 (7 joueurs de champ + gardien par équipe)",
    materiel: "Plots pour marquer les postes, chasubles",
    description: "Présentation d'un système simple à huit (2 défenseurs, 3 milieux, 2 attaquants) avec des repères de placement de départ, tout en laissant une grande liberté de mouvement une fois le jeu lancé. L'objectif est la découverte du concept de système plutôt que son application rigoureuse, pour préparer en douceur la transition vers le foot à onze.",
    diagram: [pel("keeper", 0.06, 0.5), pel("playerA", 0.25, 0.3, { number: 1 }), pel("playerA", 0.25, 0.7, { number: 2 }), pel("playerA", 0.5, 0.2, { number: 3 }), pel("playerA", 0.5, 0.5, { number: 4 }), pel("playerA", 0.5, 0.8, { number: 5 }), pel("playerA", 0.75, 0.35, { number: 6 }), pel("playerA", 0.75, 0.65, { number: 7 })],
  },
];

const STARTER_EXERCISES_FOOT5_MENTAL = [
  {
    name: "Le bravo collectif", category: "mental", ageFormat: "foot_a_5",
    objectif: "Associer le jeu à une expérience joyeuse et valorisée collectivement", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "À chaque action positive (une passe réussie, un but, une belle tentative même ratée), tout le groupe s'arrête un instant pour applaudir ou crier \"bravo\" ensemble. Construit une association simple et positive entre jouer au football et se sentir bien, sans aucune notion de résultat ou de comparaison entre enfants.",
    diagram: [],
  },
  {
    name: "Recommencer avec le sourire", category: "mental", ageFormat: "foot_a_5",
    objectif: "Associer l'erreur à quelque chose de normal et sans gravité", duree: 10, nbJoueurs: "Groupe complet, intégré à un jeu",
    materiel: "Aucun",
    description: "Le coach modélise lui-même une réaction simple après une erreur pendant un jeu (\"oups, on recommence !\" avec un sourire) et encourage les enfants à faire pareil. Contrairement à un protocole de gestion de l'erreur pour joueurs plus âgés, ici l'objectif est uniquement de désamorcer toute charge émotionnelle négative autour du raté, pas d'installer une routine mentale structurée.",
    diagram: [],
  },
  {
    name: "Le jeu du copain content", category: "mental", ageFormat: "foot_a_5",
    objectif: "Développer une attention simple aux autres et à leurs émotions", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "En fin de séance, chaque enfant dit une chose qui a rendu un copain content pendant la séance (\"j'ai vu que tu étais content quand...\"). Introduction très simple et concrète à l'attention portée aux autres, adaptée à l'âge, sans vocabulaire ou concept abstrait de cohésion d'équipe.",
    diagram: [],
  },
  {
    name: "Ma petite victoire du jour", category: "mental", ageFormat: "foot_a_5",
    objectif: "Développer la fierté personnelle sur un vécu, jamais sur un résultat", duree: 5, nbJoueurs: "Groupe complet, en cercle",
    materiel: "Aucun",
    description: "En fin de séance, chaque enfant partage une chose dont il est content aujourd'hui (\"j'ai réussi à...\", \"j'ai aimé...\"), sans rapport avec le score ou la performance. Construit très tôt l'idée que la valeur personnelle ne dépend pas du résultat du jeu, une base importante avant l'introduction progressive de la compétition à un âge plus avancé.",
    diagram: [],
  },
  {
    name: "Le calme après le jeu", category: "mental", ageFormat: "foot_a_5",
    objectif: "Découvrir un retour au calme simple et ludique après l'excitation du jeu", duree: 5, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Petit jeu calme de fin de séance (ex. \"on est une statue qui respire doucement\", ou marcher très lentement comme au ralenti) pour faire retomber l'excitation avant de rejoindre les parents. Contrairement à la routine de respiration structurée pour les catégories plus âgées, ici tout reste ludique et très court, sans vocabulaire technique de gestion du stress.",
    diagram: [],
  },
];

const STARTER_EXERCISES_FOOT5_ATHLETIQUE = [
  {
    name: "Le jeu de l'épervier", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Développer la course, l'évitement et la réaction dans un jeu collectif", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots pour délimiter l'espace, chasubles pour désigner l'épervier",
    description: "Un ou deux enfants \"éperviers\" doivent toucher les autres qui traversent l'espace en courant. Jeu de poursuite classique qui développe la vitesse de réaction, le changement de direction et l'évitement, sans aucune notion de performance chronométrée ni de renforcement musculaire — uniquement du plaisir de courir et d'éviter.",
    diagram: [pel("playerB", 0.5, 0.5), pel("playerA", 0.2, 0.3, { number: 1 }), pel("playerA", 0.8, 0.7, { number: 2 }), pel("playerA", 0.3, 0.8, { number: 3 })],
  },
  {
    name: "Parcours d'obstacles ludique", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Développer la motricité globale par des mouvements variés", duree: 15, nbJoueurs: "Individuel en rotation, plusieurs parcours en parallèle si possible",
    materiel: "Plots, cerceaux, petits obstacles à enjamber, tapis si disponible",
    description: "Parcours combinant plusieurs mouvements variés (ramper sous un obstacle, sauter dans des cerceaux, enjamber des plots couchés, rouler au sol) présenté comme une aventure. L'objectif est la richesse et la variété des mouvements découverts, pas la vitesse d'exécution ni la répétition d'un geste unique.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Le jeu des statues", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Développer l'équilibre et la capacité à s'arrêter net sur un signal", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Un signal sonore (sifflet, tape dans les mains)",
    description: "Les enfants courent librement dans l'espace et doivent s'immobiliser comme des statues dès le signal, en gardant l'équilibre le plus longtemps possible sans bouger. Jeu simple qui travaille l'équilibre et le contrôle du corps de façon ludique, sans aucune notion de performance ou de comparaison entre enfants.",
    diagram: [pel("playerA", 0.3, 0.3, { number: 1 }), pel("playerA", 0.7, 0.4, { number: 2 }), pel("playerA", 0.5, 0.7, { number: 3 })],
  },
  {
    name: "La course des animaux", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Découvrir des schémas moteurs variés à travers l'imitation d'animaux", duree: 15, nbJoueurs: "Groupe complet",
    materiel: "Plots pour marquer un parcours",
    description: "Les enfants parcourent une distance en imitant différents animaux (sauts de grenouille, marche du crabe, course du lapin), changeant d'animal à chaque plot. Approche ludique et imaginative qui développe des schémas moteurs variés (coordination, équilibre, tonicité) bien plus riches que la simple course en ligne droite répétée.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Le jeu de la rivière", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Développer la capacité de saut dans un cadre ludique", duree: 10, nbJoueurs: "Groupe complet ou petits groupes",
    materiel: "Une corde au sol ou une ligne de plots pour matérialiser la rivière",
    description: "Une \"rivière\" est matérialisée au sol (corde ou ligne de plots) que les enfants doivent sauter à pieds joints sans tomber dedans, en élargissant progressivement la rivière au fil du jeu. Présenté comme un défi collectif amusant plutôt que comme un exercice de saut en longueur mesuré et comparé.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.3, 0.3, { number: 2 }), zel(0.45, 0.2, 0.55, 0.8)],
  },
  {
    name: "Ballon et équilibre", category: "athletique", ageFormat: "foot_a_5",
    objectif: "Combiner motricité globale et manipulation du ballon", duree: 15, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant, plots pour marquer un parcours simple",
    description: "Parcours simple où l'enfant doit se déplacer en portant ou en équilibrant le ballon de différentes façons (sur la tête en marchant lentement, entre les genoux en sautillant, dans les bras en courant). Développe la coordination générale tout en gardant un lien ludique avec le ballon, sans être un exercice technique de conduite de balle à proprement parler.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("ball", 0.3, 0.42), pel("cone", 0.5, 0.5), pel("cone", 0.7, 0.5)],
  },
];

const STARTER_EXERCISES_FOOT5_TECHNIQUE = [
  {
    name: "La balade du ballon (familiarisation)", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le contact avec le ballon sous toutes ses formes, dans le plaisir", duree: 10, nbJoueurs: "Individuel, un ballon chacun",
    materiel: "Un ballon par enfant",
    description: "Jeu libre où chaque enfant \"promène\" son ballon en le touchant de toutes les manières possibles (rouler sous la semelle, toucher du bout du pied, faire des petits sauts par-dessus). Aucune consigne technique précise à ce stade — l'objectif est le maximum de contacts ballon-pied dans un cadre joyeux et exploratoire.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.5, 0.42)],
  },
  {
    name: "Le petit parcours rigolo", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la conduite de balle à travers un parcours ludique", duree: 15, nbJoueurs: "Individuel en rotation, ou plusieurs parcours en parallèle",
    materiel: "Plots colorés, ballons",
    description: "Parcours de plots espacés (pas resserré comme pour un slalom technique classique) que l'enfant doit suivre en poussant son ballon, présenté comme une aventure ou une course plutôt que comme un exercice technique. Chronométrer pour le plaisir du défi, sans jamais comparer les enfants entre eux publiquement.",
    diagram: genSlalom(4),
  },
  {
    name: "La passe au copain (jeu de la cible)", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la passe de base vers un copain, dans un cadre ludique", duree: 15, nbJoueurs: "Binômes",
    materiel: "Ballons, plots pour marquer une petite cible entre les deux enfants",
    description: "Deux enfants face à face doivent se faire passer le ballon en essayant de le faire passer entre deux petits plots (comme un petit but). Le jeu de \"viser la cible\" est plus motivant à cet âge qu'une simple consigne de passe technique, tout en travaillant le même geste de base.",
    diagram: genPassingGrid(2),
  },
  {
    name: "Le jeu du gardien du trésor (protection de balle)", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir de façon ludique l'idée de garder son ballon proche de soi", duree: 15, nbJoueurs: "Individuel ou petits groupes dans un espace commun",
    materiel: "Un ballon par enfant, plots pour délimiter l'espace",
    description: "Chaque enfant a son ballon \"trésor\" qu'il doit garder proche de lui en se déplaçant dans un espace commun où d'autres enfants essaient gentiment de toucher les ballons des autres (sans les prendre, juste les toucher pour marquer un point). Introduction ludique et sans enjeu de la notion de protection du ballon.",
    diagram: [pel("playerA", 0.4, 0.4, { number: 1 }), pel("playerA", 0.6, 0.6, { number: 2 }), pel("ball", 0.38, 0.35), pel("ball", 0.58, 0.55)],
  },
  {
    name: "Tape dans le ballon (première frappe)", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir le plaisir de frapper le ballon vers un but", duree: 15, nbJoueurs: "Individuel en rotation",
    materiel: "Ballons, petit but ou cage",
    description: "Chaque enfant frappe le ballon vers un petit but, sans consigne technique précise sur la surface de frappe — l'objectif est uniquement le plaisir de voir le ballon partir vers le but et, si possible, y rentrer. Célébrer chaque tentative, marquée ou non, pour construire une relation positive avec le geste de frapper.",
    diagram: genTechniqueShot({ cones: false }),
  },
  {
    name: "La course avec le ballon (relais rigolo)", category: "technique", ageFormat: "foot_a_5",
    objectif: "Découvrir la conduite de balle en vitesse dans un cadre de jeu collectif", duree: 15, nbJoueurs: "Équipes de 3-4 en relais",
    materiel: "Ballons, plots pour marquer l'aller-retour",
    description: "Jeu de relais par équipes où chaque enfant conduit son ballon jusqu'à un plot puis revient le donner au suivant. Le cadre collectif et ludique du relais motive l'effort de conduite de balle bien plus qu'un exercice individuel répétitif, tout en travaillant le même geste technique de base.",
    diagram: genSprintLanes(3),
  },
];

const STARTER_EXERCISES_DRIBBLES = [
  {
    name: "Crochet intérieur", category: "technique",
    objectif: "Maîtriser le crochet intérieur pour changer brusquement de direction", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Le joueur conduit le ballon vers un plot (ou un défenseur passif), puis dévie le ballon vers l'intérieur avec la face interne du pied au dernier moment pour repartir dans la direction opposée. Travailler d'abord à vitesse modérée pour fixer le geste, puis à vitesse de match. Le crochet intérieur est la base de nombreuses autres feintes.",
    diagram: genDribbleMove(),
  },
  {
    name: "Crochet extérieur", category: "technique",
    objectif: "Maîtriser le crochet extérieur pour éliminer sans changer radicalement d'axe", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Le joueur dévie le ballon vers l'extérieur avec la face externe du pied, un geste plus discret que le crochet intérieur car il ne change pas radicalement l'axe de course. Utile pour accélérer dans un espace qui vient de s'ouvrir sur le côté sans perdre de vitesse dans une conversion de direction complète.",
    diagram: genDribbleMove(),
  },
  {
    name: "Roulette (Zidane)", category: "technique",
    objectif: "Maîtriser le contrôle à 360 degrés pour éliminer un adversaire venant de face ou dans le dos", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Le joueur pivote sur lui-même en faisant rouler le ballon sous la semelle d'un pied puis de l'autre, retournant complètement son orientation en un seul mouvement fluide. Geste technique exigeant qui demande d'abord d'être décomposé lentement (arrêt sur image à mi-mouvement) avant d'être exécuté à vitesse réelle.",
    diagram: genDribbleMove(),
  },
  {
    name: "Petit pont (nutmeg)", category: "technique",
    objectif: "Maîtriser le petit pont pour éliminer un défenseur qui écarte les jambes", duree: 15, nbJoueurs: "Binômes (1 attaquant, 1 défenseur passif puis semi-actif)",
    materiel: "Ballons",
    description: "Le joueur pousse le ballon entre les jambes d'un défenseur qui a les appuis écartés, puis le récupère de l'autre côté en accélérant. Travailler d'abord contre un défenseur totalement passif et statique, puis progressivement plus actif, pour apprendre à reconnaître le moment où les appuis du défenseur sont réellement ouverts.",
    diagram: genDribbleMove(),
  },
  {
    name: "Feinte de corps (stepover)", category: "technique",
    objectif: "Maîtriser la feinte de corps pour désorienter un défenseur sans toucher le ballon lors de la feinte", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Le joueur fait passer son pied autour du ballon sans le toucher, simulant un départ dans une direction pour finalement partir dans l'autre. Le geste ne fonctionne que si le regard et l'orientation du buste accompagnent la feinte de façon crédible — insister sur cet aspect autant que sur le mouvement du pied lui-même.",
    diagram: genDribbleMove(),
  },
  {
    name: "Double contact (crochet appuyé)", category: "technique",
    objectif: "Maîtriser le double contact rapide pour changer de direction en pleine vitesse", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Deux touches rapprochées et rapides du même pied (ou pieds alternés) qui déplacent le ballon latéralement en un temps très court, permettant de changer de direction sans casser la vitesse de course. Geste utilisé typiquement en pleine course pour éliminer un défenseur qui vient au contact latéralement.",
    diagram: genDribbleMove(),
  },
  {
    name: "La Croqueta (déplacement entre les appuis)", category: "technique",
    objectif: "Maîtriser le déplacement rapide du ballon d'un pied à l'autre pour esquiver un tacle", duree: 15, nbJoueurs: "Individuel face à un plot ou un défenseur passif, en rotation",
    materiel: "Plots, ballons",
    description: "Le joueur pousse le ballon rapidement d'un pied à l'autre devant lui, en gardant le ballon proche du corps, pour esquiver un adversaire qui arrive au contact ou tente un tacle. Le geste protège le ballon tout en permettant un changement d'axe immédiat, utile en couloir proche de la ligne de touche où l'espace latéral manque.",
    diagram: genDribbleMove(),
  },
  {
    name: "Élimination en vitesse après feinte", category: "technique",
    objectif: "Enchaîner une feinte technique avec une accélération immédiate et décisive", duree: 15, nbJoueurs: "Binômes (1 attaquant, 1 défenseur actif progressif)",
    materiel: "Plots pour délimiter la zone, ballons",
    description: "Une fois un geste technique choisi (crochet, feinte de corps, etc.) exécuté avec succès contre un défenseur actif, le joueur doit immédiatement accélérer sur 5-10 mètres pour concrétiser l'élimination plutôt que de ralentir juste après la feinte. Travailler cet enchaînement feinte-accélération comme un geste unique, pas deux actions séparées — une erreur fréquente qui annule le bénéfice de la feinte.",
    diagram: genSlalom(3),
  },
];

const STARTER_EXERCISES_ATHLETIQUE_MUSCLES = [
  {
    name: "Renforcement ciblé, quadriceps", category: "athletique",
    objectif: "Renforcer spécifiquement le quadriceps pour la puissance de frappe et la protection du genou", duree: 15, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Élastiques ou charges légères si disponibles",
    description: "Squats à charge progressive, fentes avant, et extensions de jambe si équipement disponible. Le quadriceps est directement sollicité dans la frappe de balle et l'appui en changement de direction — un renforcement régulier contribue aussi à la protection du genou (stabilité de la rotule).",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Renforcement ciblé, adducteurs", category: "athletique",
    objectif: "Renforcer spécifiquement les adducteurs, zone fréquemment fragile en football (pubalgie)", duree: 15, nbJoueurs: "Groupe complet, en parallèle ou en binômes",
    materiel: "Ballon entre les genoux, élastique, ou résistance d'un partenaire",
    description: "Exercices d'adduction de hanche contre résistance (ballon serré entre les genoux en position couchée, élastique, ou résistance manuelle d'un partenaire), à intensité progressive. Zone directement liée au risque de pubalgie déjà abordé dans les programmes de blessure — pertinent en prévention régulière, pas seulement en réathlétisation après blessure.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerA", 0.55, 0.5, { number: 2 })],
  },
  {
    name: "Renforcement ciblé, mollets", category: "athletique",
    objectif: "Renforcer les mollets pour la propulsion et la stabilité de la cheville", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Aucun, ou charge légère si disponible",
    description: "Montées sur pointe de pied (mollets), en bipodal puis unipodal, à charge progressive. Muscle directement impliqué dans la propulsion (accélération, saut) et dans la stabilité de la cheville — pertinent aussi en prévention des tendinopathies achilléennes.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Renforcement ciblé, moyen fessier", category: "athletique",
    objectif: "Stabiliser le bassin pour prévenir les compensations au genou et à la hanche", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Élastique en boucle si disponible",
    description: "Exercices de stabilité latérale de hanche (marche latérale avec élastique, levées de jambe latérales, pont fessier unilatéral), ciblant spécifiquement le moyen fessier plutôt que le grand fessier déjà couvert par le renforcement fonctionnel global. Un moyen fessier faible est souvent associé à des compensations qui fragilisent le genou en réception ou en changement de direction.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Renforcement ciblé, fléchisseurs de hanche (psoas)", category: "athletique",
    objectif: "Renforcer les fléchisseurs de hanche, sollicités dans la frappe et la course rapide", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Élastique ou charge légère si disponible",
    description: "Levées de genou contre résistance (élastique attaché à la cheville ou au genou), en statique puis en dynamique. Muscle directement sollicité dans l'armé de la frappe et dans la phase d'accélération à la course — souvent négligé au profit des ischio-jambiers et quadriceps plus visibles.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Renforcement ciblé, stabilisateurs de cheville", category: "athletique",
    objectif: "Renforcer les muscles stabilisateurs de la cheville en prévention des entorses", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Élastique si disponible",
    description: "Mouvements résistés d'éversion et d'inversion de la cheville avec élastique, en complément du travail proprioceptif déjà couvert par ailleurs (qui travaille l'équilibre plutôt que la force pure). Combiner les deux approches (force + proprioception) donne une prévention plus complète contre l'entorse, la blessure la plus fréquente en football.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Renforcement excentrique approfondi, ischio-jambiers", category: "athletique",
    objectif: "Compléter le travail nordic par des variantes excentriques supplémentaires", duree: 15, nbJoueurs: "Binômes ou individuel avec appui fixe",
    materiel: "Aucun, ou banc pour certaines variantes",
    description: "Variantes complémentaires au nordic hamstring déjà couvert : léger romanien (deadlift jambes tendues à charge légère ou au poids du corps), et glute-ham raise partiel si un support est disponible. Alterner les variantes d'une semaine à l'autre pour éviter la lassitude et solliciter le muscle sous différents angles.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Gainage profond, stabilisateurs du tronc", category: "athletique",
    objectif: "Renforcer les muscles stabilisateurs profonds (transverse) au-delà du gainage global déjà couvert", duree: 10, nbJoueurs: "Groupe complet, en parallèle",
    materiel: "Tapis si disponible",
    description: "Exercices ciblant spécifiquement le transverse de l'abdomen (rentrée du nombril maintenue en respiration normale, oiseau-chien en quadrupédie, gainage avec activation consciente du transverse avant le mouvement). Complète le gainage global déjà couvert par ailleurs, qui sollicite surtout les muscles superficiels (grand droit, obliques).",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
];

const STARTER_EXERCISES_ATHLETIQUE_2 = [
  {
    name: "Endurance fondamentale", category: "athletique",
    objectif: "Développer la base aérobie générale à intensité modérée et continue", duree: 25, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Course continue à allure modérée et constante (pas de fractionné), permettant de tenir une conversation sans être essoufflé. Utile en début de préparation physique ou en récupération active après une période de charge intense, pour développer la base aérobie sans accumuler de fatigue excessive.",
    diagram: genSprintLanes(1),
  },
  {
    name: "Mobilité articulaire dynamique", category: "athletique",
    objectif: "Préparer les articulations et les muscles à l'effort par des mouvements actifs", duree: 10, nbJoueurs: "Groupe complet, en ligne ou en cercle",
    materiel: "Aucun",
    description: "Série de mouvements dynamiques (montées de genoux, talons-fesses, rotations de hanches, fentes marchées) parcourant l'ensemble des grandes articulations sollicitées en match. À utiliser en échauffement, en complément ou à la place d'étirements statiques qui sont moins adaptés juste avant un effort intense.",
    diagram: genSprintLanes(3),
  },
  {
    name: "Proprioception, prévention des entorses", category: "athletique",
    objectif: "Renforcer la stabilité de la cheville et du genou pour prévenir les entorses", duree: 10, nbJoueurs: "Individuel ou en binômes",
    materiel: "Plateau instable ou coussin proprioceptif si disponible, sinon surface irrégulière",
    description: "Exercices d'équilibre sur une jambe, les yeux ouverts puis fermés, sur surface stable puis instable, en ajoutant progressivement des perturbations (légère poussée d'un partenaire, réception de ballon en équilibre). Particulièrement pertinent en prévention, mais aussi en phase de retour de blessure à la cheville ou au genou.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Capacité anaérobie lactique", category: "athletique",
    objectif: "Développer la tolérance à l'effort intense prolongé (30 à 90 secondes)", duree: 20, nbJoueurs: "Groupe complet ou par vagues",
    materiel: "Plots pour délimiter le parcours, chronomètre",
    description: "Efforts intenses continus de 30 à 90 secondes (course, ou enchaînement d'exercices dynamiques), avec une récupération incomplète entre les répétitions. Développe la tolérance à l'accumulation de fatigue métabolique, sollicitée notamment lors d'efforts prolongés en fin de match ou de période de jeu intense.",
    diagram: genSprintLanes(2),
  },
  {
    name: "Vitesse gestuelle, fréquence de jambes", category: "athletique",
    objectif: "Développer la fréquence et la coordination des appuis au sol", duree: 10, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Échelle de rythme si disponible, sinon plots rapprochés au sol",
    description: "Parcours d'échelle de rythme ou de plots très rapprochés au sol, à exécuter avec des appuis rapides et variés (un appui, deux appuis, latéral). Travaille la coordination neuromusculaire et la fréquence gestuelle, complémentaire à la vitesse pure travaillée en sprint linéaire.",
    diagram: genSlalom(8),
  },
  {
    name: "Musculation haut du corps et gainage complet", category: "athletique",
    objectif: "Renforcer le haut du corps et la sangle abdominale de façon complète", duree: 15, nbJoueurs: "Groupe complet, en parallèle ou en circuit",
    materiel: "Élastiques ou charges légères si disponibles, tapis",
    description: "Circuit d'exercices de renforcement du haut du corps (pompes, tirages avec élastique, gainage complet incluant le dos) en complément du travail du bas du corps déjà couvert par ailleurs. Un haut du corps stable contribue à l'équilibre général et à la protection du ballon en duel.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 })],
  },
  {
    name: "Coordination motrice générale", category: "athletique",
    objectif: "Développer la coordination globale par des tâches motrices combinées", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Plusieurs ballons, plots, échelle de rythme si disponible",
    description: "Exercices combinant plusieurs tâches motrices simultanées (ex. jonglage en marchant, parcours d'appuis avec un ballon lancé et rattrapé, jonglerie à deux ballons en binôme). Développe la coordination générale, utile en préparation physique des jeunes joueurs en particulier.",
    diagram: genAgilityPattern(),
  },
  {
    name: "Prévention ischio-jambiers, renforcement excentrique", category: "athletique",
    objectif: "Réduire le risque de blessure aux ischio-jambiers par un renforcement excentrique régulier", duree: 10, nbJoueurs: "Binômes ou individuel avec appui fixe",
    materiel: "Aucun (ou sangle de maintien des chevilles)",
    description: "Exercice de type nordic hamstring : partenaire ou support fixe maintenant les chevilles, le joueur se laisse tomber vers l'avant en contrôlant la descente avec les ischio-jambiers, le plus lentement possible. À intégrer régulièrement en prévention (1-2 fois par semaine), pas seulement en phase de retour de blessure.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerA", 0.55, 0.5, { number: 2 })],
  },
];

const STARTER_EXERCISES_TECHNIQUE_2 = [
  {
    name: "Passe en mouvement, une touche", category: "technique",
    objectif: "Automatiser la passe précise sans contrôle préalable, en course", duree: 15, nbJoueurs: "3-4 joueurs par groupe, en mouvement continu",
    materiel: "Plots pour délimiter la zone, ballons",
    description: "Les joueurs se déplacent en continu dans un espace délimité et se font des passes en une touche, sans jamais s'arrêter ni contrôler. Travailler la qualité de la passe (puissance juste, dans les pieds du partenaire) malgré le mouvement permanent, une exigence supérieure à la passe classique à l'arrêt.",
    diagram: genPassingGrid(5),
  },
  {
    name: "Contrôle aérien, amorti de balle haute", category: "technique",
    objectif: "Maîtriser l'amorti d'un ballon qui arrive en hauteur (poitrine, cuisse, pied)", duree: 15, nbJoueurs: "Binômes en rotation",
    materiel: "Ballons",
    description: "Un partenaire envoie des ballons en cloche variés (poitrine, cuisse, pied) que le receveur doit amortir pour ramener le ballon au sol en un contrôle, avant d'enchaîner sur une passe ou une frappe. Varier la hauteur et la vitesse d'arrivée du ballon pour couvrir les différentes surfaces de contrôle.",
    diagram: [pel("playerA", 0.3, 0.5, { number: 1 }), pel("playerA", 0.6, 0.5, { number: 2 }), pel("ball", 0.45, 0.35), ael("arrowPass", 0.3, 0.5, 0.6, 0.5, { curved: true, cx: 0.45, cy: 0.25 })],
  },
  {
    name: "Centre, technique du centrage", category: "technique",
    objectif: "Travailler la technique pure du centre (enroulé, tendu, en retrait)", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, plots pour marquer la zone de réception",
    description: "Séries de centres depuis différentes zones du couloir (proche de la ligne de fond, plus reculé), en variant le type de trajectoire (centre tendu au ras du sol, en cloche vers le second poteau, en retrait hors de la surface). Accent sur la qualité et la variété de la technique de frappe, indépendamment du contexte tactique de match.",
    diagram: [pel("playerA", 0.75, 0.05, { number: 1 }), pel("ball", 0.75, 0.05), pel("cone", 0.55, 0.45), pel("cone", 0.6, 0.55), ael("arrowPass", 0.75, 0.05, 0.55, 0.45)],
  },
  {
    name: "Duel et protection de balle", category: "technique",
    objectif: "Apprendre à protéger le ballon corps interposé face à un adversaire proche", duree: 15, nbJoueurs: "Binômes en opposition",
    materiel: "Plots pour délimiter la zone, ballons",
    description: "Face à face en zone réduite, un joueur avec ballon doit conserver la possession face à un adversaire qui cherche à le récupérer, sans avoir le droit de s'éloigner de la zone. Travailler le placement du corps (dos ou épaule vers l'adversaire), les appuis et la protection du ballon avec les deux pieds en alternance.",
    diagram: [pel("playerA", 0.45, 0.5, { number: 1 }), pel("playerB", 0.55, 0.5), pel("ball", 0.43, 0.5), zel(0.35, 0.35, 0.65, 0.65)],
  },
  {
    name: "Jeu du pied faible", category: "technique",
    objectif: "Développer la maîtrise technique du pied non-dominant", duree: 15, nbJoueurs: "Individuel ou binômes",
    materiel: "Ballons, plots",
    description: "Reprendre plusieurs exercices techniques classiques (passes, contrôles, frappes, conduite en slalom) en imposant l'utilisation exclusive du pied faible. Accepter une baisse de qualité au démarrage — l'objectif est la répétition régulière et progressive, pas la performance immédiate.",
    diagram: genSlalom(5),
  },
  {
    name: "Remise en une touche, jeu de pivot", category: "technique",
    objectif: "Automatiser la remise rapide et précise en une touche pour un joueur pivot", duree: 15, nbJoueurs: "3 joueurs (2 extérieurs + 1 pivot) en rotation",
    materiel: "Plots, ballons",
    description: "Un joueur pivot reçoit dos au jeu et doit remettre en une touche vers l'un des deux partenaires extérieurs, qui varient leur position à chaque répétition. Travailler la qualité et la rapidité d'exécution de la remise, ainsi que l'orientation du corps du pivot avant même de recevoir le ballon.",
    diagram: [pel("playerA", 0.5, 0.5, { number: 1 }), pel("playerA", 0.25, 0.3, { number: 2 }), pel("playerA", 0.25, 0.7, { number: 3 }), pel("ball", 0.4, 0.4)],
  },
  {
    name: "Prise de balle dos au jeu", category: "technique",
    objectif: "Maîtriser le contrôle et l'orientation du corps quand on reçoit dos à l'action", duree: 15, nbJoueurs: "Binômes ou trios en rotation",
    materiel: "Ballons, plots",
    description: "Le joueur reçoit une passe dos au jeu (dos à la cage adverse ou à la zone de jeu) et doit contrôler en s'orientant du bon côté selon la position d'un défenseur ou d'un repère annoncé au dernier moment. Travailler la qualité du contrôle orienté et la rapidité de la prise de décision malgré l'absence de vision directe au moment de la réception.",
    diagram: [pel("playerB", 0.6, 0.5), pel("playerA", 0.5, 0.5, { number: 1 }), pel("ball", 0.42, 0.5)],
  },
  {
    name: "Frappe en une touche (volée, demi-volée)", category: "technique",
    objectif: "Travailler la technique de frappe sans contrôle préalable", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage",
    description: "Séries de frappes en une touche sur des ballons envoyés en l'air (volée) ou juste après un rebond (demi-volée), sans contrôle intermédiaire. Varier la trajectoire d'envoi et la position du tireur pour couvrir différents angles de frappe en une touche rencontrés en match.",
    diagram: genTechniqueShot({ cones: false }),
  },
];

const STARTER_EXERCISES_TACTIQUE_GENERIQUE = [
  {
    name: "Supériorité numérique 2 contre 1", category: "tactique",
    objectif: "Automatiser la prise de décision de base en situation de surnombre", duree: 15, nbJoueurs: "2 attaquants contre 1 défenseur, en rotation",
    materiel: "Plots, cage, ballons",
    description: "Situation répétée de 2 attaquants face à 1 défenseur vers une petite cage. Travailler la fixation du défenseur par le porteur avant la passe, le timing de course du soutien, et la lecture rapide de laquelle des deux options (dribble ou passe) est la plus favorable selon la position du défenseur.",
    diagram: genVs(2, 1, { xA: 0.25, xB: 0.55, hasKeeper: false }),
  },
  {
    name: "Infériorité numérique, défendre à 3 contre 4", category: "tactique",
    objectif: "Organiser une défense efficace malgré un désavantage numérique", duree: 15, nbJoueurs: "3 défenseurs contre 4 attaquants",
    materiel: "Plots, cage, ballons",
    description: "Situation répétée où 3 défenseurs doivent retarder et contenir 4 attaquants avant l'arrivée d'un renfort défensif (réel ou simulé par un délai). Travailler les concessions acceptées (céder la largeur pour protéger l'axe) et la communication permanente entre les 3 défenseurs pour ne pas se faire déborder simultanément sur deux côtés.",
    diagram: genVs(4, 3, { xA: 0.3, xB: 0.6 }),
  },
  {
    name: "Jeu réduit 4 contre 4 en espace restreint", category: "tactique",
    objectif: "Accélérer la prise de décision et la qualité technique sous contrainte d'espace", duree: 20, nbJoueurs: "4 contre 4 (+ gardiens en option)",
    materiel: "Plots pour délimiter l'espace réduit, ballons, petites cages",
    description: "Jeu à 4 contre 4 dans un espace nettement plus petit qu'un terrain habituel, ce qui oblige des décisions plus rapides et une meilleure protection de balle. Utile pour travailler en intensité sur un temps court, avec un transfert direct vers la vitesse d'exécution en match sur grand terrain.",
    diagram: genVs(4, 4, { zone: [0.15, 0.15, 0.85, 0.85] }),
  },
  {
    name: "Occupation de l'espace, étirer le bloc adverse", category: "tactique",
    objectif: "Comprendre comment la largeur et la profondeur créent des espaces exploitables", duree: 20, nbJoueurs: "6 contre 6 sur grand espace",
    materiel: "Plots pour marquer les limites, chasubles",
    description: "Jeu à thème où l'équipe en possession doit occuper systématiquement les extrémités du terrain (largeur maximale) avant de chercher à progresser dans les espaces ainsi créés au centre. Débriefer sur le lien entre l'écartement du jeu et l'ouverture d'espaces dans l'axe, un principe transversal à la plupart des systèmes de jeu.",
    diagram: genVs(6, 6, { zone: [0.1, 0.08, 0.9, 0.92] }),
  },
  {
    name: "Permutation de postes en possession", category: "tactique",
    objectif: "Habituer les joueurs à échanger temporairement leurs zones sans perdre l'équilibre collectif", duree: 20, nbJoueurs: "8 contre 4 en possession",
    materiel: "Plots pour marquer les zones de référence, chasubles",
    description: "Jeu de possession où deux joueurs reçoivent la consigne d'échanger leurs zones à intervalle régulier (ex. un latéral et un milieu qui permutent), pendant que le reste de l'équipe s'ajuste pour garder l'équilibre collectif. Travailler la communication de la permutation et la rapidité de réadaptation des partenaires proches.",
    diagram: genVs(8, 4, { xA: 0.3, xB: 0.6, zone: [0.1, 0.1, 0.9, 0.9] }),
  },
  {
    name: "Lecture du jeu, anticipation défensive", category: "tactique",
    objectif: "Développer la capacité à anticiper une trajectoire ou une intention adverse avant qu'elle ne se concrétise", duree: 15, nbJoueurs: "4 défenseurs contre 3 attaquants",
    materiel: "Plots, chasubles, ballons",
    description: "Situation de jeu où le défenseur est explicitement encouragé à anticiper (interception) plutôt qu'à réagir (tacle après le fait). Débriefer après chaque séquence sur les indices qui permettaient d'anticiper (orientation du corps du porteur, angle de course d'un attaquant) plutôt que de valoriser uniquement le résultat de l'action.",
    diagram: genLine(4, 3),
  },
  {
    name: "Couverture et soutien défensif à trois niveaux", category: "tactique",
    objectif: "Organiser les rôles de premier défenseur, de soutien et de couverture", duree: 20, nbJoueurs: "3 défenseurs contre 2-3 attaquants",
    materiel: "Plots, chasubles, ballons",
    description: "Situation défensive où les rôles sont explicitement nommés : un défenseur presse le porteur (premier rideau), un second se positionne en soutien proche (couverture immédiate), un troisième couvre plus loin (sécurité). Travailler les rotations de ces rôles selon les déplacements du ballon, un principe applicable quelle que soit l'organisation défensive globale choisie.",
    diagram: genVs(3, 3, { xA: 0.6, xB: 0.3 }),
  },
  {
    name: "Conservation à touches limitées", category: "tactique",
    objectif: "Accélérer la circulation du ballon et la prise de décision avant réception", duree: 15, nbJoueurs: "6 contre 6 en possession",
    materiel: "Plots, chasubles",
    description: "Jeu de possession classique avec une contrainte stricte de nombre de touches (1 ou 2 touches maximum par joueur). Oblige chaque joueur à observer et décider avant même de recevoir le ballon plutôt qu'après, un principe de prise d'information qui reste valable quel que soit le style de jeu global recherché.",
    diagram: genVs(6, 6, { zone: [0.15, 0.12, 0.85, 0.88] }),
  },
];

const STARTER_EXERCISES_MENTAL = [
  {
    name: "Routine de respiration pré-match", category: "mental",
    objectif: "Réguler le niveau d'activation et gérer le stress avant la compétition", duree: 10, nbJoueurs: "Groupe complet",
    materiel: "Aucun",
    description: "Exercice de respiration guidée (inspiration lente sur 4 temps, rétention 2 temps, expiration sur 6 temps) répété sur plusieurs cycles, en groupe ou individuellement, dans le vestiaire avant le match. Objectif : ramener chaque joueur à un niveau d'activation optimal, ni trop relâché ni trop tendu, plutôt que de simplement \"attendre que ça passe\".",
    diagram: [],
  },
  {
    name: "Visualisation positive avant un geste technique", category: "mental",
    objectif: "Utiliser l'imagerie mentale pour préparer un geste technique isolé (penalty, coup franc)", duree: 10, nbJoueurs: "Individuel, avant une situation de tir au but ou de coup franc",
    materiel: "Aucun",
    description: "Avant d'exécuter le geste réel, le joueur ferme les yeux et visualise en détail la réussite de son action (l'élan, le contact, la trajectoire, le résultat), avec les sensations associées. À répéter avant chaque répétition d'entraînement sur les gestes à enjeu (penalty, coup franc), pour créer un automatisme mental transférable au contexte réel de match.",
    diagram: genPenalty(),
  },
  {
    name: "Gestion de l'erreur, protocole de reprise", category: "mental",
    objectif: "Automatiser un protocole mental court pour repartir vite après une erreur", duree: 15, nbJoueurs: "Groupe complet, intégré à un exercice de jeu",
    materiel: "Aucun",
    description: "Pendant un exercice de jeu classique, introduire une consigne explicite : après toute erreur (perte de balle, faute technique), le joueur doit appliquer un geste ou un mot personnel de reprise (ex. taper des mains, respirer une fois, dire un mot-clé) avant de se réengager dans l'action suivante. Travailler la rapidité à \"tourner la page\" plutôt que la rumination, qui entraîne souvent une deuxième erreur en cascade.",
    diagram: [],
  },
  {
    name: "Fixation d'objectifs individuels de séance", category: "mental",
    objectif: "Donner à chaque joueur un objectif personnel concret et mesurable pour la séance", duree: 10, nbJoueurs: "Groupe complet, en cercle avant la séance",
    materiel: "Aucun (papier/stylo en option)",
    description: "Avant le début de la séance, chaque joueur exprime (à voix haute ou par écrit) un objectif personnel simple et observable pour la séance du jour (ex. \"je frappe des deux pieds aujourd'hui\", \"je communique plus fort en défense\"). Revenir dessus en fin de séance pour un bilan rapide — développe l'engagement actif plutôt qu'une participation passive.",
    diagram: [],
  },
  {
    name: "Communication et leadership sur le terrain", category: "mental",
    objectif: "Développer la prise de parole et la communication active pendant le jeu", duree: 20, nbJoueurs: "Groupe complet, intégré à un exercice de jeu",
    materiel: "Aucun",
    description: "Pendant un exercice de jeu, imposer une consigne de communication minimale (chaque joueur doit donner au moins une information vocale utile à un partenaire toutes les X secondes, ex. \"devant toi\", \"j'arrive\", \"change\"). Débriefer ensuite sur la qualité et la pertinence de ce qui a été communiqué, pas seulement sur le volume sonore.",
    diagram: [],
  },
  {
    name: "Cohésion d'équipe, activité collaborative", category: "mental",
    objectif: "Renforcer les liens et la confiance collective par une activité non footballistique", duree: 20, nbJoueurs: "Groupe complet",
    materiel: "Variable selon l'activité choisie (ballon, foulards pour un jeu de confiance, etc.)",
    description: "Activité collective ludique sans rapport direct avec le football (jeu de confiance en binôme, défi collectif à résoudre en équipe, jeu de communication les yeux bandés). L'objectif est de renforcer la confiance et la connaissance mutuelle entre joueurs, un facteur qui se retrouve ensuite indirectement dans la qualité du jeu collectif sur le terrain.",
    diagram: [],
  },
  {
    name: "Concentration, focus sur un signal", category: "mental",
    objectif: "Développer la capacité à maintenir l'attention sur un signal précis malgré les distractions", duree: 15, nbJoueurs: "Groupe complet ou petits groupes",
    materiel: "Un signal sonore ou visuel (sifflet, plot de couleur levé)",
    description: "Pendant un exercice de jeu ou de course, un signal (sifflet, plot levé) déclenche une action précise et immédiate (s'arrêter, changer de direction, accélérer). Ajouter progressivement du bruit ambiant ou des distractions pour rendre le maintien de l'attention plus exigeant, en se rapprochant des conditions réelles de match.",
    diagram: [],
  },
  {
    name: "Gestion de la pression en situation chronométrée", category: "mental",
    objectif: "Habituer les joueurs à performer sous contrainte de temps et d'enjeu simulé", duree: 15, nbJoueurs: "Individuel ou petits groupes en rotation",
    materiel: "Ballons, cage, chronomètre",
    description: "Situation de tir au but ou de finition avec un enjeu annoncé (\"il vous reste 10 secondes, votre équipe est menée d'un but\") et un public qui observe. Travailler la gestion physique et mentale de la pression (respiration, concentration) dans un contexte qui se rapproche du money-time d'un vrai match, plutôt que dans un cadre neutre sans enjeu.",
    diagram: genShooting(1, { ballX: 0.55, ballY: 0.5 }),
  },
];

// Classement par thème à l'intérieur de chaque domaine (tactique/technique/athlétique/mental), pour
// que "récupération" se distingue de "mobilité" ou "coordination", etc. Passe automatique par
// mots-clés sur le nom + l'objectif de chaque exercice — un premier classement pensé pour être
// globalement fiable sur les 484 exercices, pas une relecture individuelle de chacun : à affiner
// au cas par cas si un exercice précis tombe dans la mauvaise case.
function normTheme(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
const THEME_RULES = {
  tactique: [
    ["Coups de pied arrêtés", ["corner", "coup franc", "penalty", "touche", "coup de pied arrete", "cpa", "tirs au but", "tireur"]],
    ["Pressing", ["pressing", "presser", "piege", "recuperation haute", "recuperer haut"]],
    ["Organisation défensive", ["bloc defensif", "bloc bas", "bloc median", "bloc haut", "ligne defensive", "glissade", "hors-jeu", "hors jeu", "couverture", "marquage", "repli", "hauteur de bloc", "defense a", "solidite defensive", "defendre", "defense basse", "surveillance", "homme a homme", "zone/individuel", "zone / individuel", "etranglement", "inferiorite numerique", "anticipation defensive", "faute tactique"]],
    ["Transitions", ["transition", "contre-attaque", "contre attaque", "perte de balle", "reconversion", "replacement rapide"]],
    ["Jeu de position / possession", ["rondo", "possession", "jeu de position", "conservation", "occupation de l'espace", "occupation de l espace", "circulation", "espace restreint", "jeu reduit", "zone de jeu", "reperes de position", "systeme de jeu", "orientation du jeu", "trois lignes"]],
    ["Animation offensive", ["combinaison", "construction", "progression", "appel", "course dans le dos", "triangle", "soutien", "relance", "un-contre-un", "un contre un", "1 contre 1", "duel", "diagonale", "changement d'aile", "changement d aile", "fixation", "surnombre", "debordement", "centre", "profondeur", "ecartement", "largeur", "chevauchement", "remise", "finition", "frappe", "gambeta"]],
  ],
  technique: [
    ["Jeu de tête", ["tete", "coup de tete", "duel aerien offensif"]],
    ["Tirs / finition", ["frappe", "tir ", "tir,", "tir au but", "finition", "but ", "reprise de volee", "volee"]],
    ["Dribbles / conduite de balle", ["dribble", "conduite de balle", "crochet", "petit pont", "nutmeg", "croqueta", "slalom", "feinte", "elimination", "un contre un technique", "changement de direction balle au pied"]],
    ["Contrôle / réception", ["controle", "amorti", "reception", "pivot", "orientation"]],
    ["Passes", ["passe", "transmission", "remise"]],
    ["Jonglerie / maîtrise de balle", ["jonglerie", "maitrise de balle", "sensibilite", "pied faible", "ambidextrie", "toucher de balle"]],
  ],
  athletique: [
    ["Récupération", ["recuperation", "etirement", "relachement", "myofascial", "respiration", "retour au calme", "auto-massage", "auto massage"]],
    ["Mobilité", ["mobilite", "articulaire", "amplitude"]],
    ["Force / musculation", ["renforcement", "musculation", "gainage", "excentrique", "prevention", "stabilisateur", "charge", "puissance", "explosi"]],
    ["Vitesse", ["sprint", "vitesse", "frequence de jambes", "reaction", "acceleration", "vivacite"]],
    ["Endurance", ["vma", "fractionne", "endurance", "cardio", "aerobie", "capacite", "conditionnement", "resistance a la fatigue", "intermittent", "effort"]],
    ["Agilité / coordination", ["agilite", "changement de direction", "coordination", "appuis", "epervier", "schema moteur", "animaux", "equilibre", "proprioception", "pliometrie", "detente", "saut", "poursuite", "parcours"]],
  ],
  mental: [
    ["Gestion de la pression / émotions", ["stress", "pression", "peur", "enjeu", "anxiete", "emotion", "deception", "erreur", "colere", "frustration"]],
    ["Concentration", ["concentration", "focus", "attention", "signal"]],
    ["Communication / cohésion", ["equipe", "ensemble", "copain", "communication", "cohesion", "esprit d'equipe", "esprit d equipe", "collectif", "compter les uns", "respect", "harmonie"]],
    ["Prise de décision", ["decision", "choix", "lecture du jeu", "anticipation"]],
    ["Confiance / motivation", ["confiance", "conviction", "niaque", "resilience", "combativite", "motivation", "plaisir", "sourire", "patience", "identite", "surprendre", "abandon", "objectif", "victoire", "defaite", "visualisation", "fierte"]],
  ],
};
const THEME_FALLBACK = { tactique: "Tactique générale", technique: "Technique générale", athletique: "Athlétique général", mental: "Mental général" };
export function classifyExerciseTheme(ex) {
  const cat = ex.category || "tactique";
  const text = normTheme(`${ex.name} ${ex.objectif}`);
  for (const [theme, words] of THEME_RULES[cat] || []) {
    if (words.some((w) => text.includes(w))) return theme;
  }
  return THEME_FALLBACK[cat] || "Général";
}

const RAW_STARTER_EXERCISES = [
  ...STARTER_EXERCISES.map((ex) => ({ category: "tactique", ...ex })),
  ...STARTER_EXERCISES_TECHNIQUE,
  ...STARTER_EXERCISES_ATHLETIQUE,
  ...STARTER_EXERCISES_RECUPERATION,
  ...STARTER_EXERCISES_MENTAL,
  ...STARTER_EXERCISES_TACTIQUE_GENERIQUE,
  ...STARTER_EXERCISES_TECHNIQUE_2,
  ...STARTER_EXERCISES_ATHLETIQUE_2,
  ...STARTER_EXERCISES_TECHNIQUE_PASSES,
  ...STARTER_EXERCISES_TECHNIQUE_AUTRES,
  ...STARTER_EXERCISES_ATHLETIQUE_MUSCLES,
  ...STARTER_EXERCISES_DRIBBLES,
  ...STARTER_EXERCISES_FOOT5_TACTIQUE,
  ...STARTER_EXERCISES_FOOT5_TECHNIQUE,
  ...STARTER_EXERCISES_FOOT5_ATHLETIQUE,
  ...STARTER_EXERCISES_FOOT5_MENTAL,
  ...STARTER_EXERCISES_FOOT8_TACTIQUE,
  ...STARTER_EXERCISES_FOOT8_TECHNIQUE,
  ...STARTER_EXERCISES_FOOT8_ATHLETIQUE,
  ...STARTER_EXERCISES_FOOT8_MENTAL,
  ...STARTER_EXERCISES_NATIONS_TACTIQUE_11,
  ...STARTER_EXERCISES_NATIONS_TECHNIQUE_11,
  ...STARTER_EXERCISES_NATIONS_ATHLETIQUE_11,
  ...STARTER_EXERCISES_NATIONS_MENTAL_11,
  ...STARTER_EXERCISES_NATIONS_TACTIQUE_8,
  ...STARTER_EXERCISES_NATIONS_TECHNIQUE_8,
  ...STARTER_EXERCISES_NATIONS_ATHLETIQUE_8,
  ...STARTER_EXERCISES_NATIONS_MENTAL_8,
  ...STARTER_EXERCISES_NATIONS_TACTIQUE_5,
  ...STARTER_EXERCISES_NATIONS_TECHNIQUE_5,
  ...STARTER_EXERCISES_NATIONS_ATHLETIQUE_5,
  ...STARTER_EXERCISES_NATIONS_MENTAL_5,
  ...STARTER_EXERCISES_NATIONS2_TACTIQUE_11,
  ...STARTER_EXERCISES_NATIONS2_TECHNIQUE_11,
  ...STARTER_EXERCISES_NATIONS2_ATHLETIQUE_11,
  ...STARTER_EXERCISES_NATIONS2_MENTAL_11,
  ...STARTER_EXERCISES_NATIONS2_TACTIQUE_8,
  ...STARTER_EXERCISES_NATIONS2_TECHNIQUE_8,
  ...STARTER_EXERCISES_NATIONS2_ATHLETIQUE_8,
  ...STARTER_EXERCISES_NATIONS2_MENTAL_8,
  ...STARTER_EXERCISES_NATIONS2_TACTIQUE_5,
  ...STARTER_EXERCISES_NATIONS2_TECHNIQUE_5,
  ...STARTER_EXERCISES_NATIONS2_ATHLETIQUE_5,
  ...STARTER_EXERCISES_NATIONS2_MENTAL_5,
  ...STARTER_EXERCISES_FA.map((ex) => ({ curriculumFederation: "FA", ...ex })),
  ...STARTER_EXERCISES_DFB_1,
  ...STARTER_EXERCISES_DFB_2,
  ...STARTER_EXERCISES_FIGC,
  ...STARTER_EXERCISES_RBFA,
  ...[
    ...STARTER_EXERCISES_FFF_U6_7,
    ...STARTER_EXERCISES_FFF_U8_9,
    ...STARTER_EXERCISES_FFF_U10_11,
    ...STARTER_EXERCISES_FFF_U12_13,
    ...STARTER_EXERCISES_FFF_U16_19,
    ...STARTER_EXERCISES_FFF_SENIORS,
  ].map((ex) => ({ curriculumFederation: "FFF", ...ex })),
];

// Ajout du thème sur l'ensemble, sans rien changer d'autre à la donnée existante.
export const ALL_STARTER_EXERCISES = RAW_STARTER_EXERCISES.map((ex) => ({ ...ex, theme: ex.theme || classifyExerciseTheme(ex) }));

export const STARTER_SESSIONS = [
  {
    name: "Construction et progression",
    plan: [
      { phase: "echauffement", exerciseName: "Rondo positionnel 4-3-3" },
      { phase: "corps", exerciseName: "Sortie de balle à 4 contre pressing à 3" },
      { phase: "corps", exerciseName: "Débordements et centres en supériorité 3v2" },
      { phase: "retourcalme", exerciseName: "Transition offensive rapide 4 contre 3" },
    ],
  },
  {
    name: "Bloc défensif et pressing",
    plan: [
      { phase: "echauffement", exerciseName: "Glissades collectives en bloc de zone" },
      { phase: "corps", exerciseName: "Maintien du bloc médian face à progression" },
      { phase: "corps", exerciseName: "Déclenchement de pressing sur passe latérale" },
      { phase: "retourcalme", exerciseName: "Contre-pressing 6 secondes" },
    ],
  },
  {
    name: "Coups de pied arrêtés",
    plan: [
      { phase: "echauffement", exerciseName: "Touche défensive sous pression" },
      { phase: "corps", exerciseName: "Corner offensif joué au sol" },
      { phase: "corps", exerciseName: "Corner défensif en marquage mixte" },
      { phase: "retourcalme", exerciseName: "Coup franc offensif à deux" },
    ],
  },
];
