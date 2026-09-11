# Game Changer — contexte de projet

Application de coaching pour un club de football amateur/jeunes, développée avec Claude sur claude.ai depuis plus de 13 sessions. Ce fichier consolide ce qui a été appris — à lire avant toute recommandation structurelle, ajout ou modification de fonctionnalité.

Gregory (le porteur du projet, coach au club) travaille en français, en tutoiement.

## Le projet

- React + Vite, déployé sur Vercel : `football-analysis-ten.vercel.app`
- Dépôt GitHub : `GregCohin/game-changer`
- Couvre l'ensemble des opérations du club : administratif, vestiaire (effectif/séances/médical), analyse vidéo, ressources pédagogiques, portail joueur/parent
- Projet distinct, non couvert ici : un pipeline d'analyse vidéo (Python/Colab, calibration terrain PnLCalib sur images Veo Cam 3) — état d'avancement propre, pas dans ce dépôt

## Architecture — à connaître avant toute recommandation structurelle

**Aucun serveur, aucune base de données, aucune authentification.** Vérifié directement dans le code : sur ~35 000 lignes, le seul appel réseau réel de toute l'app est une requête météo (open-meteo). Tout le reste — chaque fonctionnalité, y compris celles qui semblent collaboratives — lit et écrit uniquement dans `localStorage` du navigateur.

Implications concrètes, pas théoriques :
- Le forum, le covoiturage, les créneaux bénévoles, la FAQ, le portail parent ne fonctionnent réellement que si une seule personne, sur un seul appareil, gère toutes les données. `localStorage` ne se synchronise jamais entre navigateurs ou appareils différents.
- Si le club a plusieurs coachs sur des appareils séparés, chacun n'a que les données de sa propre équipe dans son navigateur — les vues "transversales à toutes les équipes" (Vue académie, Tableau de bord dirigeant, Ressources partagées, Talents à suivre) ne sont complètes que pour la personne dont c'est le navigateur.
- `lib/storage.js` patch `localStorage` globalement pour scoper chaque clé par équipe + saison, sauf une liste explicite de clés non-scopées (club-wide, dans `UNSCOPED_STORAGE_KEYS`). Une saison ne s'écrase jamais — toute proposition supposant une perte de données entre saisons part d'une fausse prémisse.
- Un embryon de couche async-ready existe déjà pour un futur vrai backend (`getAllReferees`/`saveReferee`, prototype de mise en relation d'arbitres entre clubs) : écrit en asynchrone dès maintenant bien qu'il ne fasse que lire/écrire du local pour l'instant, précisément pour que le jour où une API existe, seul l'intérieur de ces fonctions change.

**Direction produit souhaitée** : le site reste l'outil de travail complet du staff/coachs/dirigeants. Les parents/joueurs auraient une interface séparée, plus simple, filtrée sur ce qui les concerne (leur enfant, leur équipe/catégorie). Objectif à terme : une app mobile **native** (préférée à une PWA). Les deux — interface simplifiée ET app native — demandent un vrai backend avec authentification comme prérequis commun. Recommandation en cours : construire ce backend pour une seule fonctionnalité ciblée d'abord (le portail parent est le candidat le plus probable, vu que c'est le point de contact le plus direct avec les familles), plutôt que de migrer tout le site d'un coup.

## Structure des fichiers

```
src/
├── App.jsx                      ← fichier principal, environ 35 000 lignes
├── mannequin/index.jsx          ← pantin articulé (édition de pose, séquences, export vidéo)
├── ressources/bibliotheque.jsx  ← bibliothèque de ressources pédagogiques
├── styles/css.js                ← feuille de style unique
├── lib/storage.js               ← patch de scoping localStorage — fichier central, rarement modifié
├── lib/utils.js                 ← utilitaires partagés (formatDateFr, playerFullName, todayIso, newId...)
├── data/starterContent.js
├── data/formations.js
└── pad/index.js
```

- La bibliothèque d'exercices contient 478 exercices.
- `AdvancedAnalyticsPanel` a un callback `onImport` et un schéma `emptyAdvancedAnalytics()` déjà prêts à recevoir les futures sorties du pipeline vidéo.
- Chaque compilation esbuild de cette session a produit un avertissement de taille de bundle (~2,7 Mo) — pas bloquant, mais réel : temps de chargement à surveiller, en particulier pour un usage mobile en bord de terrain avec un signal faible.

## Processus de travail établi

Chaque ajout ou modification a suivi ce processus, sans exception, sur 13+ sessions :

1. **Vérifier que la fonctionnalité n'existe pas déjà**, avant de la construire — grep sous plusieurs noms plausibles, pas seulement le terme utilisé dans la demande d'origine. Le compte-rendu détaillé plus bas liste plusieurs cas où une fonctionnalité "proposée" existait déjà, parfois construite sous un nom très différent.
2. Extraire les fonctions en dehors des composants avant de les modifier, quand nécessaire pour la conformité aux règles des hooks React.
3. Sur chaque changement, dans cet ordre :
   - Vérificateur de syntaxe
   - Vérificateur de variables non définies (`check_undefined_vars.mjs`) — sur `App.jsx` ET tout fichier séparé touché dans le même chantier
   - Vérificateur de doublons de déclaration de fonction
   - Vraie compilation esbuild (jamais simulée) :
     ```
     esbuild App.jsx --bundle --loader:.js=jsx --loader:.jsx=jsx \
       --external:react --external:react-dom --external:recharts --external:lucide-react \
       --external:./videoCompiler --external:./videoCompiler.js \
       --outfile=/tmp/bundle_check.js
     ```
4. Écrire un fichier de test dédié par chantier, avec des cas qui vérifient la logique réelle (pas seulement la présence de texte dans le code).
5. Faire tourner l'intégralité de la suite de régression (70+ fichiers de test accumulés) avant de considérer un chantier terminé.
6. Ne livrer qu'une fois tout vert.

**Deux points d'honnêteté sur ce processus, à ajuster selon l'environnement réel :**
- Ces vérifications ont été faites dans un environnement de travail sans accès au vrai `npm`/Vite du projet — la commande esbuild ci-dessus est une approximation manuelle de la compilation réelle. Claude Code, s'il tourne dans le vrai dépôt avec `npm install` déjà fait, devrait pouvoir lancer directement `npm run build` — la commande exacte que Vercel exécute en production — ce qui est une vérification plus fiable que cette approximation.
- Les 70+ fichiers de test accumulés vivent dans l'environnement de travail où ce projet a été développé, pas forcément dans le dépôt GitHub réel — ils n'ont jamais été explicitement livrés à Gregory pour qu'il les commit. Si Claude Code ne les trouve pas dans le dépôt, ce n'est pas une régression : il faudra soit demander à Gregory s'il les a conservés, soit reconstruire une suite de vérification équivalente au fil des prochains chantiers.

Quand un chantier touche à la fois `App.jsx` et un fichier séparé (`bibliotheque.jsx`, `mannequin/index.jsx`, `lib/storage.js`...), les deux doivent être livrés et déployés ensemble — un décalage entre les deux a déjà cassé un build en production (import cross-fichier cassé, un fichier mis à jour sans l'autre).

## Leçons techniques — à lire avant de construire ou déboguer

- Toujours vérifier qu'une fonctionnalité n'existe pas déjà avant de la construire. Cas rencontrés dans une seule session : un système de formations continues du staff (existait sous `ClubTrainingScreen`, nom différent de celui cherché), une prévision de couverture arbitrale (existait sous `CouvertureArbitraleTab`), un inventaire matériel (existait sous `InventaireMaterielTab`).
- `computeDirigeantAlerts` doit rester une fonction top-level pour la conformité aux règles des hooks — le suivi de résolution tourne dans un `useEffect` avant un retour anticipé.
- `LIBRARY_PEDAGOGY_THEMES` est intentionnellement dupliqué dans `bibliotheque.jsx` — aucun chemin d'import direct de ce module vers les constantes d'`App.jsx`, documenté par un commentaire. Mais toutes les duplications apparentes ne sont pas nécessaires : `daysSinceStatusChange` s'est avéré déjà exporté et importé, juste jamais appelé — toujours vérifier les déclarations `export`/`import` réelles avant de supposer qu'une duplication est nécessaire.
- Les assertions de test qui cherchent une chaîne présente dans plusieurs composants doivent être bornées aux limites de la fonction ciblée (`src.slice(src.indexOf("function X"), src.indexOf("\nfunction ", start + 10))`) — les clés de stockage et autres littéraux apparaissent souvent à la fois côté lecture et côté écriture, dans des composants différents.
- Les tests de présence sur des fenêtres de caractères fixes se cassent quand les fonctions grossissent — préférer découper sur les limites réelles de fonction.
- La détection de doublons doit matcher sur nom ET date de naissance pour éviter les faux positifs.
- Un joueur du roster chargé depuis la clé scopée `tf_roster` n'a pas de champ natif `teamId`/`teamIds` — il fait implicitement partie du roster scopé de son équipe. `teamId` n'apparaît que sur des objets synthétiques construits pour des vues transversales (ex. `findLinkedMultiTeamPlayers`), jamais sur le joueur brut stocké.
- `tf_exercices` (référencé par les séances-types) est scopé par équipe, PAS la même chose que `tf_club_exercise_library` (la vraie bibliothèque partagée, non-scopée, club-wide) — une séance-type construite par une équipe peut référencer des identifiants d'exercices invalides dans la banque d'une autre équipe ; résoudre par identifiant d'abord, puis par nom en repli.
- Déplacer ou renommer l'emplacement d'un écran demande de chercher dans tout le fichier les références obsolètes au-delà du seul routage : entrées de mots-clés de l'assistant, réponses de l'aide sur le site, messages `alert()` visibles par l'utilisateur, et libellés `eyebrow` à l'intérieur des écrans déplacés eux-mêmes. Quinze références dispersées trouvées lors du déplacement du Pôle sportif vers Vue académie.
- Les lignes d'onglets avec beaucoup de boutons ont besoin de `flexWrap: "wrap"` sur la div `.tabs` — motif déjà utilisé par 20+ écrans, pas une solution ponctuelle à chaque fois.
- Un écran dont le conteneur externe n'a pas la classe `stats-screen` perd le centrage et la largeur maximale (`margin: 0 auto; max-width: 1000px` dans cette classe, c'est elle qui centre tous les autres écrans) — vérifier cette classe en premier quand une mise en page semble poussée d'un côté.
- Un composant avec son propre conteneur `dashboard-card` complet (ex. `PlayerOfTheMonthWidget`) ne peut pas être réutilisé tel quel dans le système de widgets de l'Accueil, qui enveloppe déjà chaque widget dans son propre encart — extraire le calcul interne en fonction partagée plutôt que d'imbriquer deux encarts.
- Un élément natif non contrôlé (ex. `<details>`) qui reçoit un prop `open` contrôlé par React DOIT aussi recevoir un gestionnaire `onToggle` qui synchronise l'état, sinon l'élément devient insensible aux clics manuels de l'utilisateur.
- Une suspension (accumulation de cartons jaunes) n'a pas de durée fixe en jours — elle se purge en manquant le prochain match. `detectYellowCardSuspensions` ne calcule que la date de déclenchement (`suspensionStart`), jamais la fin. Approximation retenue : une suspension est considérée purgée dès qu'un match joué (pas d'observation) a eu lieu depuis `suspensionStart` — l'app ne peut pas vérifier la conformité réelle du jour J, seulement le calendrier.
- Un identifiant de joueur (`player.id`) survit à une reconduction de saison — `tf_roster` est recopié tel quel (JSON brut, identifiants inclus) d'une saison à l'autre. Une liste de suivi indexée par `playerId` reste donc valide dans le temps, à condition d'être stockée dans une clé non-scopée pour rester continue plutôt que remise à zéro chaque saison.

## État du projet à la date de cette transmission

Trois vagues de propositions de fonctionnalités ont été systématiquement travaillées et vérifiées contre le code réel : un document de 32 propositions, un second de 36, et un document plus ancien et plus large de 150 propositions couvrant 50 rôles du club. L'écrasante majorité est construite et vérifiée — un échantillonnage large et varié du troisième document (y compris des rôles très spécifiques comme Podologue) n'a trouvé aucun manque.

Constructions récentes notables : système de widgets réorganisables sur l'Accueil (19 widgets au total), tarifs de cotisations par catégorie/gardien/féminine, modèles de créneaux bénévoles avec génération automatique à la création d'un événement, covoiturage visible côté portail parent, déplacement structurel du Pôle sportif vers Vue académie, reconnaissance des bénévoles, liste de suivi de talents internes distincte du scouting externe, total des dépenses matériel toutes acquisitions confondues, et disponibilité de l'effectif couvrant désormais blessures et suspensions.

Chercher de nouvelles fonctionnalités à ce stade a des rendements décroissants. La prochaine étape à plus forte valeur n'est plus de construire, mais de confronter l'app à un usage réel — un document de questions d'entretien par rôle a été rédigé à cet effet (même remarque que pour les tests : produit dans l'environnement de travail, à demander à Gregory s'il l'a conservé).

## Prochaines étapes envisagées

- Backend/API pour une fonctionnalité ciblée (portail parent probable), comme prérequis à toute vraie synchronisation multi-utilisateurs
- App mobile native une fois le backend en place — React Native pressenti vu que le site est déjà en React, mais attention : tout ce qui est spécifique au navigateur dans le code actuel (`localStorage`, dessin canvas pour le pantin, stockage vidéo, `window.print()`) demande une vraie réécriture pour un environnement natif, pas un portage direct
- Le pipeline vidéo (projet Python/Colab séparé) a son propre état d'avancement, non détaillé ici
