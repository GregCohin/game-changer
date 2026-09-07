// Positions de référence par système tactique (utilisé à la fois pour le positionnement
// automatique des joueurs sur une feuille de match, et pour générer le schéma des exercices
// "rondo positionnel" par système). Extrait de App.jsx (séparation des fichiers, sans
// changement de comportement).

export const FORMATION_LAYOUTS = {
  "4-3-3": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.15, y: 0.25 }, { role: "Défenseur", x: 0.38, y: 0.22 }, { role: "Défenseur", x: 0.62, y: 0.22 }, { role: "Défenseur", x: 0.85, y: 0.25 },
    { role: "Milieu", x: 0.3, y: 0.5 }, { role: "Milieu", x: 0.5, y: 0.45 }, { role: "Milieu", x: 0.7, y: 0.5 },
    { role: "Attaquant", x: 0.2, y: 0.8 }, { role: "Attaquant", x: 0.5, y: 0.85 }, { role: "Attaquant", x: 0.8, y: 0.8 },
  ],
  "4-4-2": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.15, y: 0.25 }, { role: "Défenseur", x: 0.38, y: 0.22 }, { role: "Défenseur", x: 0.62, y: 0.22 }, { role: "Défenseur", x: 0.85, y: 0.25 },
    { role: "Milieu", x: 0.15, y: 0.55 }, { role: "Milieu", x: 0.38, y: 0.5 }, { role: "Milieu", x: 0.62, y: 0.5 }, { role: "Milieu", x: 0.85, y: 0.55 },
    { role: "Attaquant", x: 0.38, y: 0.85 }, { role: "Attaquant", x: 0.62, y: 0.85 },
  ],
  "4-2-3-1": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.15, y: 0.25 }, { role: "Défenseur", x: 0.38, y: 0.22 }, { role: "Défenseur", x: 0.62, y: 0.22 }, { role: "Défenseur", x: 0.85, y: 0.25 },
    { role: "Milieu", x: 0.38, y: 0.42 }, { role: "Milieu", x: 0.62, y: 0.42 },
    { role: "Milieu", x: 0.2, y: 0.65 }, { role: "Milieu", x: 0.5, y: 0.6 }, { role: "Milieu", x: 0.8, y: 0.65 },
    { role: "Attaquant", x: 0.5, y: 0.88 },
  ],
  "3-5-2": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.3, y: 0.22 }, { role: "Défenseur", x: 0.5, y: 0.2 }, { role: "Défenseur", x: 0.7, y: 0.22 },
    { role: "Milieu", x: 0.1, y: 0.45 }, { role: "Milieu", x: 0.35, y: 0.5 }, { role: "Milieu", x: 0.5, y: 0.45 }, { role: "Milieu", x: 0.65, y: 0.5 }, { role: "Milieu", x: 0.9, y: 0.45 },
    { role: "Attaquant", x: 0.4, y: 0.85 }, { role: "Attaquant", x: 0.6, y: 0.85 },
  ],
  "5-3-2": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.1, y: 0.3 }, { role: "Défenseur", x: 0.3, y: 0.22 }, { role: "Défenseur", x: 0.5, y: 0.2 }, { role: "Défenseur", x: 0.7, y: 0.22 }, { role: "Défenseur", x: 0.9, y: 0.3 },
    { role: "Milieu", x: 0.3, y: 0.55 }, { role: "Milieu", x: 0.5, y: 0.5 }, { role: "Milieu", x: 0.7, y: 0.55 },
    { role: "Attaquant", x: 0.4, y: 0.85 }, { role: "Attaquant", x: 0.6, y: 0.85 },
  ],
  "3-4-3": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.3, y: 0.22 }, { role: "Défenseur", x: 0.5, y: 0.2 }, { role: "Défenseur", x: 0.7, y: 0.22 },
    { role: "Milieu", x: 0.15, y: 0.5 }, { role: "Milieu", x: 0.38, y: 0.48 }, { role: "Milieu", x: 0.62, y: 0.48 }, { role: "Milieu", x: 0.85, y: 0.5 },
    { role: "Attaquant", x: 0.2, y: 0.82 }, { role: "Attaquant", x: 0.5, y: 0.86 }, { role: "Attaquant", x: 0.8, y: 0.82 },
  ],
  "4-1-4-1": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.15, y: 0.25 }, { role: "Défenseur", x: 0.38, y: 0.22 }, { role: "Défenseur", x: 0.62, y: 0.22 }, { role: "Défenseur", x: 0.85, y: 0.25 },
    { role: "Milieu", x: 0.5, y: 0.4 },
    { role: "Milieu", x: 0.15, y: 0.58 }, { role: "Milieu", x: 0.38, y: 0.55 }, { role: "Milieu", x: 0.62, y: 0.55 }, { role: "Milieu", x: 0.85, y: 0.58 },
    { role: "Attaquant", x: 0.5, y: 0.85 },
  ],
  "4-3-1-2": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.15, y: 0.25 }, { role: "Défenseur", x: 0.38, y: 0.22 }, { role: "Défenseur", x: 0.62, y: 0.22 }, { role: "Défenseur", x: 0.85, y: 0.25 },
    { role: "Milieu", x: 0.3, y: 0.48 }, { role: "Milieu", x: 0.5, y: 0.44 }, { role: "Milieu", x: 0.7, y: 0.48 },
    { role: "Milieu", x: 0.5, y: 0.65 },
    { role: "Attaquant", x: 0.4, y: 0.85 }, { role: "Attaquant", x: 0.6, y: 0.85 },
  ],
  "3-4-1-2": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.3, y: 0.22 }, { role: "Défenseur", x: 0.5, y: 0.2 }, { role: "Défenseur", x: 0.7, y: 0.22 },
    { role: "Milieu", x: 0.12, y: 0.48 }, { role: "Milieu", x: 0.38, y: 0.45 }, { role: "Milieu", x: 0.62, y: 0.45 }, { role: "Milieu", x: 0.88, y: 0.48 },
    { role: "Milieu", x: 0.5, y: 0.65 },
    { role: "Attaquant", x: 0.4, y: 0.85 }, { role: "Attaquant", x: 0.6, y: 0.85 },
  ],
  "5-4-1": [
    { role: "Gardien", x: 0.5, y: 0.08 },
    { role: "Défenseur", x: 0.1, y: 0.3 }, { role: "Défenseur", x: 0.3, y: 0.22 }, { role: "Défenseur", x: 0.5, y: 0.2 }, { role: "Défenseur", x: 0.7, y: 0.22 }, { role: "Défenseur", x: 0.9, y: 0.3 },
    { role: "Milieu", x: 0.15, y: 0.58 }, { role: "Milieu", x: 0.38, y: 0.53 }, { role: "Milieu", x: 0.62, y: 0.53 }, { role: "Milieu", x: 0.85, y: 0.58 },
    { role: "Attaquant", x: 0.5, y: 0.85 },
  ],
};
