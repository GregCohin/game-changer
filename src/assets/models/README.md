# Modèles 3D du personnage

Source : **Quaternius** (https://quaternius.com), licence **CC0 1.0** (domaine public) — aucune attribution requise, mentionnée ici pour la traçabilité.

- « Universal Base Characters » (version Standard, gratuite) : `Superhero_Male_FullBody`, `Superhero_Female_FullBody` et les coiffures `Hair_SimpleParted` (garçon) et `Hair_Long` (fille). Les autres coiffures du pack (`Hair_Buzzed`, `Hair_Buns`, `Hair_BuzzedFemale`, `Hair_Beard`) ne sont pas incluses.
- « Universal Animation Library » (version Standard) : clips `Idle_Loop`, `Jog_Fwd_Loop`, `Jump_Loop`, `Sprint_Loop` (sur 43).

Téléchargés le 24/09/2026 depuis itch.io.

## Conversion (outillage jetable, non versionné)

`gltf-transform` 4.5 + `sharp` : un seul `.glb` par modèle, texture du corps 1024 px (JPEG), yeux et cheveux 512 px (WebP), textures de normales / rugosité / occlusion retirées, maillage d'exemple des animations retiré, clés d'animation dédupliquées. Les sous-vêtements peints dans la texture du corps ont été remplacés par la teinte de peau voisine : l'habillage (maillot, short, chaussettes, chaussures) est ajouté au chargement, voir `src/mannequin/habillage3d.js`.

## À respecter

Le dépôt est **public** : n'y ajouter que des modèles sous licence CC0 ou équivalente. Pas de fichiers bruts Mixamo (redistribution interdite en tant que fichiers autonomes).
