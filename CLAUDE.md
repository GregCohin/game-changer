# Game Changer — contexte de projet

Application de coaching pour un club de football amateur/jeunes, développée avec Claude sur claude.ai depuis plus de 13 sessions, puis avec Claude Code directement dans le dépôt (depuis sept. 2026). Ce fichier consolide ce qui a été appris — à lire avant toute recommandation structurelle, ajout ou modification de fonctionnalité.

Gregory (le porteur du projet, coach au club) travaille en français, en tutoiement.

## Le projet

- React + Vite, déployé sur Vercel (projet `gcfa/game-changer`, redéployé automatiquement à chaque push sur `main`) : `football-analysis-ten.vercel.app`
- Dépôt GitHub : `GregCohin/game-changer` — **dépôt public** : jamais de secret, de clé privée, d'email ni de donnée de joueur ou de famille dans le dépôt
- Couvre l'ensemble des opérations du club : administratif, vestiaire (effectif/séances/médical), analyse vidéo, ressources pédagogiques, portail joueur/parent
- Backend Supabase (depuis sept. 2026), uniquement pour le portail parent et le forum : voir la section « Backend Supabase » plus bas
- Pipeline d'analyse vidéo (Python/Colab : calibration terrain PnLCalib sur images Veo Cam 3, suivi et ré-identification des joueurs, OCR des numéros de maillot) : **dans ce dépôt depuis le 12/09/2026**, dossier `video-pipeline/` (`extract.py`, `tracking.py`, `calibration.py`, `metrics.py`, notebook Colab `colab_extraction.ipynb` pour le GPU). Son historique se lit dans `git log -- video-pipeline` ; les derniers commits touchent aussi `App.jsx` (import des données de tracking)

## Architecture — à connaître avant toute recommandation structurelle

**Le site staff n'a ni serveur, ni base de données, ni authentification** — à l'exception du portail parent et du forum, qui ont depuis sept. 2026 un vrai backend Supabase (section dédiée plus bas). Vérifié directement dans le code : sur ~35 000 lignes, les seuls appels réseau de l'app staff sont une requête météo (open-meteo), le chargement à la demande du moteur ffmpeg depuis un CDN, et les appels Supabase de `src/lib/portalSync.js`. Tout le reste — chaque fonctionnalité, y compris celles qui semblent collaboratives — lit et écrit uniquement dans `localStorage` du navigateur (ou dans IndexedDB pour les matchs et les clips).

Implications concrètes, pas théoriques :
- Côté staff, le forum, le covoiturage, les créneaux bénévoles et la FAQ ne fonctionnent réellement que si une seule personne, sur un seul appareil, gère toutes les données : `localStorage` ne se synchronise jamais entre navigateurs ou appareils différents. Pour les parents, le portail (données de l'enfant, carnet de bord, covoiturage, FAQ) et le forum passent désormais par Supabase, alimenté par une publication manuelle du staff — les créneaux bénévoles n'en font pas partie.
- Si le club a plusieurs coachs sur des appareils séparés, chacun n'a que les données de sa propre équipe dans son navigateur — les vues "transversales à toutes les équipes" (Vue académie, Tableau de bord dirigeant, Ressources partagées, Talents à suivre) ne sont complètes que pour la personne dont c'est le navigateur. Le backend Supabase ne change pas ça : il ne synchronise que staff → parents, et deux personnes qui publieraient la même équipe/saison depuis des navigateurs différents s'écraseraient mutuellement.
- `lib/storage.js` patch `localStorage` globalement pour scoper chaque clé par équipe + saison, sauf une liste explicite de clés non-scopées (club-wide, dans `UNSCOPED_STORAGE_KEYS`). Une saison ne s'écrase jamais — toute proposition supposant une perte de données entre saisons part d'une fausse prémisse. Depuis sept. 2026 le patch ne s'applique qu'à `window.localStorage` (garde ajoutée : `Storage.prototype` est aussi celui de `sessionStorage`) et signale par un `alert()`, une seule fois par session, un dépassement de quota (`QuotaExceededError`) qui était auparavant avalé en silence.
- Un embryon de couche async-ready existe déjà pour un futur vrai backend (`getAllReferees`/`saveReferee`, prototype de mise en relation d'arbitres entre clubs) : écrit en asynchrone dès maintenant bien qu'il ne fasse que lire/écrire du local pour l'instant, précisément pour que le jour où une API existe, seul l'intérieur de ces fonctions change. Ce principe a servi pour le backend Supabase : `src/lib/portalSync.js`.

**Direction produit souhaitée** : le site reste l'outil de travail complet du staff/coachs/dirigeants. Les parents/joueurs auraient une interface séparée, plus simple, filtrée sur ce qui les concerne (leur enfant, leur équipe/catégorie). Objectif à terme : une app mobile **native** (préférée à une PWA). Les deux — interface simplifiée ET app native — demandent un vrai backend avec authentification comme prérequis commun. Recommandation suivie (sept. 2026) : ce backend a été construit pour une seule fonctionnalité ciblée d'abord — le portail parent, avec le forum — plutôt que de migrer tout le site d'un coup. L'interface parent web actuelle est volontairement minimale ; l'app native reste l'objectif à terme et réutilisera la même base et la même authentification.

## Backend Supabase (portail parent + forum)

Ajouté en sept. 2026, uniquement pour ces deux fonctionnalités : le reste du site reste en `localStorage`. Vérifié de bout en bout en production avec l'effectif réel.

**Ce qui existe**
- Projet Supabase `game-changer` (réf. `dajsfquzknvutugjkrye`, région Paris, offre gratuite : contrainte de budget de Gregory), URL `https://dajsfquzknvutugjkrye.supabase.co`. Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (publiques par conception : c'est la RLS qui protège) sont dans `.env.local` en local et dans Vercel (Production, Preview, Development).
- **Aucun secret dans le dépôt** : la clé `service_role`, le jeton d'accès Supabase et le mot de passe de la base n'y sont pas — les redemander à Gregory ou les régénérer depuis le dashboard Supabase.
- Schéma, RLS et fonction `redeem_invitation_code` : `supabase/migrations/`, appliqués avec `npx supabase db push` (jeton d'accès et mot de passe de la base requis). Une migration déjà appliquée ne se réécrit jamais : on en ajoute une.
- Côté staff : écran `PortalBackendScreen` (Administratif → Club → « Portail parent (backend) », dans `App.jsx` à côté de `BackupScreen`) et `buildPortalSnapshot`. Boutons « Publier vers le portail » et « Récupérer les nouveautés », génération de codes d'invitation, liste des parents liés.
- Côté parent : `parent.html` → `src/parent/`, second point d'entrée Vite (`vite.config.js`). Connexion par lien magique, saisie du code, portail (statut, objectifs, séances, matchs, carnet de bord, covoiturage, FAQ) et forum. Style volontairement minimal.

**Modèle d'accès**
- Connexion par lien magique, sans mot de passe. Un compte staff est un compte présent dans `staff_profiles` (fonction SQL `is_staff()`) ; seul celui de Gregory y est aujourd'hui, et en ajouter un se fait par insertion manuelle (pas d'auto-inscription, volontairement).
- Un parent est lié à un enfant par un code d'invitation à 6 caractères généré par le staff (`player_invitation_codes`, 5 utilisations par défaut : plusieurs parents indépendants par enfant), consommé par `redeem_invitation_code` (SECURITY DEFINER). Aucune policy n'autorise un parent à insérer directement dans `parent_player_links` (seuls la fonction et le staff le peuvent).
- Un parent ne voit que ses enfants liés et les données de leur équipe/saison. Une conversation de forum « individuelle » n'est visible que par ses participants, **figés** (`forum_thread_participants`) à la première publication du thread : un parent lié plus tard ne voit jamais les anciennes conversations privées (voulu par Gregory).
- Le portail n'expose que le statut RTP des blessures — jamais diagnostic, dossier médical, discipline ni contacts d'urgence. À conserver dans `buildPortalSnapshot`, mais la vraie barrière, ce sont les policies RLS, pas le composant.

**Synchronisation (manuelle, dans les deux sens)**
- Staff → parents, « Publier » : `development_goals`, `individual_programs`, `injuries`, `sessions`, `club_faq`, `competitions`/`fixtures` sont remplacées en bloc par (équipe, saison), `club_events` (club-wide) en entier. `players`, `matches`, `match_stats`, `carpool_offers` et `forum_threads` sont en **upsert seulement** : leurs enfants écrits par les parents (`player_journal_entries`, `carpool_passengers`, `forum_messages`) partent en cascade avec elles, un delete-then-insert les effacerait. `players` et `matches` doivent être publiés avant les tables qui les référencent.
- Parents → staff, « Récupérer les nouveautés » : ramène journal, covoiturage et messages de forum dans le `localStorage` du staff (curseur `tf_portal_last_pull`).
- Limites connues : un joueur, un match ou un sujet supprimé côté staff n'est pas supprimé de Supabase par la publication ; les passagers de covoiturage saisis avant la migration (de simples noms) ne sont pas repris ; `club_events.location` n'est pas résolue ; le curseur de récupération avance même quand elle ne renvoie rien (une RLS cassée le masque — vider `tf_portal_last_pull` pour rejouer).

**Email et connexion**
- Le service d'email par défaut de Supabase est utilisé : il fonctionne mais n'autorise que quelques envois par heure. `site_url` est `https://football-analysis-ten.vercel.app` et la liste blanche de redirections contient la prod et `http://localhost:5173/**` — sans ça, les liens magiques renvoyaient vers `localhost:3000`.
- Un SMTP personnalisé (Brevo) a été essayé puis retiré : l'expéditeur doit appartenir à un domaine authentifié — un relais privé Apple ou une adresse `sfr.fr` sont rejetés (DMARC). Le domaine `gamechanger.com` (Route 53) est ajouté dans Brevo mais **pas authentifié** : il reste 4 enregistrements DNS à créer (2 CNAME DKIM, 1 TXT `brevo-code`, 1 TXT DMARC), puis à brancher dans Supabase (Authentication → SMTP). À faire avant d'inviter plusieurs familles en même temps.

**Tester sans boîte mail** : `POST /auth/v1/admin/generate_link` avec la clé `service_role`, suivre `/auth/v1/verify` pour lire le `location` (`access_token`, `refresh_token`), puis écrire la session dans le `localStorage` du domaine testé sous `sb-<réf>-auth-token`. Toujours supprimer les comptes et lignes de test ensuite. Le classifieur de permissions de Claude Code bloque ces appels : demander l'accord de Gregory à chaque fois.

## Structure des fichiers

```
src/
├── App.jsx                      ← fichier principal, environ 35 000 lignes
├── mannequin/index.jsx          ← pantin articulé (édition de pose, séquences, export vidéo)
├── ressources/bibliotheque.jsx  ← bibliothèque de ressources pédagogiques
├── styles/css.js                ← feuille de style unique
├── lib/storage.js               ← patch de scoping localStorage — fichier central, rarement modifié
├── lib/utils.js                 ← utilitaires partagés (formatDateFr, playerFullName, todayIso, newId...)
├── lib/portalSync.js            ← backend Supabase côté staff : publier / récupérer, codes d'invitation, liaisons parents
├── lib/supabaseClient.js        ← client Supabase côté staff
├── main.jsx                     ← point d'entrée staff (précharge les caches de matchs IndexedDB avant le premier rendu)
├── videoCompiler.js             ← compilation vidéo (ffmpeg.wasm), importée dynamiquement à l'usage
├── data/starterContent.js
├── data/formations.js
├── pad/index.js
└── parent/                      ← app parent séparée (point d'entrée `parent.html`, bundle indépendant d'App.jsx)
    ├── main.jsx, ParentApp.jsx, AuthContext.jsx, supabaseClient.js
    ├── lib/api.js               ← tous les appels Supabase de l'app parent
    └── screens/                 ← LoginScreen, LinkChildScreen, PortailScreen, ForumScreen

parent.html                      ← second point d'entrée Vite (voir `vite.config.js`)
supabase/                        ← `config.toml` + `migrations/` (schéma, RLS, fonction `redeem_invitation_code`)
video-pipeline/                  ← pipeline Python d'extraction vidéo
```

- La bibliothèque d'exercices contient 478 exercices.
- `AdvancedAnalyticsPanel` a un callback `onImport` et un schéma `emptyAdvancedAnalytics()` déjà prêts à recevoir les futures sorties du pipeline vidéo.
- Le build Vite (`npm run build`) produit un bundle staff d'environ 2,2 Mo (≈530 Ko gzip) avec un avertissement de taille — pas bloquant, mais réel : temps de chargement à surveiller, en particulier pour un usage mobile en bord de terrain avec un signal faible. La page parent est un bundle séparé (≈14 Ko) mais charge aussi le chunk partagé du client Supabase (≈370 Ko, ≈105 Ko gzip) : ≈110 Ko gzip au total, très en dessous du staff, mais pas « quelques Ko ». Passer `@ffmpeg` en import dynamique n'a gagné que ~7 Ko (le WASM est de toute façon chargé depuis un CDN) : le vrai poids vient probablement de `recharts`/`lucide-react` et d'`App.jsx` lui-même (non mesuré).

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

**Constat en sept. 2026, dans le vrai dépôt** : ni les vérificateurs (`check_undefined_vars.mjs`…) ni les 70+ fichiers de test n'y existent — confirmé, ce n'est pas une régression. Ce qui a été fait à la place pour chaque chantier : `npm run build` (celui de Vercel), `npm run dev` + navigation réelle dans le navigateur sur les écrans touchés, et pour Supabase des requêtes REST avec et sans session sur des comptes de test créés puis supprimés. Aucun test automatisé n'a été ajouté : c'est de la dette, pas un choix.

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
- **Identifiants issus de `localStorage` : aucun format garanti.** Le vrai roster contient des `id` hérités comme `"eff-01"`, pas des UUID. Toute colonne Postgres alimentée par `localStorage` doit être en `text` (seuls les identifiants auto-générés par Postgres et les références à `auth.users` sont en `uuid`). Un `ALTER COLUMN TYPE` échoue dès que des clés étrangères ou des policies RLS dépendent de la colonne : la migration `20260912010000_fix_id_types_full_rebuild.sql` a reconstruit les tables, ce qui n'est possible que tant qu'elles ne contiennent pas de vraies données.
- `tf_club_faq` et `tf_club_carpool` ne sont **pas** dans `UNSCOPED_STORAGE_KEYS` malgré leur préfixe `tf_club_` : elles sont scopées par équipe/saison, contrairement à `tf_club_events`, `tf_club_staff`… — vérifier la liste réelle, jamais le préfixe (à confirmer avec Gregory si c'est voulu).
- `readMatchFromCache` est synchrone et ne lit qu'un cache mémoire rempli pour l'équipe/saison **active** : `main.jsx` le précharge avant le premier rendu (`loadMatchCacheOnce`, `loadObsMatchCacheOnce`) et `loadMatchesForScope(teamId, seasonId)` charge à la demande une autre saison (sans ça, la comparaison avec une saison passée affichait zéro partout). Tout écran qui lit ce cache pour une autre équipe/saison doit passer par là.
- Un builder `supabase-js` (`supabase.from(...).upsert(...)`) n'envoie sa requête qu'à l'`await` ou au `.then()` : sans l'un des deux, rien ne part et aucune erreur ne remonte.
- Une jointure PostgREST (`select("*, autre_table(...)")`) exige une clé étrangère directe entre les deux tables : `parent_player_links` et `parent_profiles` référencent chacune `auth.users` mais pas l'une l'autre, la jointure échouait (`PGRST200`) et l'écran staff « Parents liés » avalait l'erreur en affichant « aucun parent lié ». `listPlayerLinks` fait donc deux requêtes, et le staff lit `parent_profiles` grâce à une policy dédiée. Un écran qui attrape toutes les erreurs et affiche un état vide masque ce genre de défaut : tester avec des données présentes, pas seulement vides.
- RLS : sans policy `INSERT`/`UPDATE`/`DELETE`, personne n'écrit, pas même le staff ; sans policy `SELECT` pour `is_staff()` sur les tables écrites par les parents, la récupération côté staff renvoie silencieusement 0 ligne. Tester chaque rôle réellement, avec et sans session, sur des données existantes.
- Deux alertes `npm audit` (`vite`/`esbuild`) ne concernent que le serveur de dev, pas le build de production ; leur correctif passe par Vite 8 (changement majeur), non fait.

## État du projet à la date de cette transmission

Trois vagues de propositions de fonctionnalités ont été systématiquement travaillées et vérifiées contre le code réel : un document de 32 propositions, un second de 36, et un document plus ancien et plus large de 150 propositions couvrant 50 rôles du club. L'écrasante majorité est construite et vérifiée — un échantillonnage large et varié du troisième document (y compris des rôles très spécifiques comme Podologue) n'a trouvé aucun manque.

Constructions récentes notables : système de widgets réorganisables sur l'Accueil (19 widgets au total), tarifs de cotisations par catégorie/gardien/féminine, modèles de créneaux bénévoles avec génération automatique à la création d'un événement, covoiturage visible côté portail parent, déplacement structurel du Pôle sportif vers Vue académie, reconnaissance des bénévoles, liste de suivi de talents internes distincte du scouting externe, total des dépenses matériel toutes acquisitions confondues, et disponibilité de l'effectif couvrant désormais blessures et suspensions.

Chercher de nouvelles fonctionnalités à ce stade a des rendements décroissants. La prochaine étape à plus forte valeur n'est plus de construire, mais de confronter l'app à un usage réel — un document de questions d'entretien par rôle a été rédigé à cet effet (même remarque que pour les tests : produit dans l'environnement de travail, à demander à Gregory s'il l'a conservé).

### Depuis cette transmission (sept. 2026)

- Correctifs issus d'une revue du dépôt : la comparaison avec une saison passée affichait zéro (cache de matchs jamais chargé pour l'autre saison) ; préchargement des caches de matchs avant le premier rendu (course avec IndexedDB) ; garde `sessionStorage` et alerte de quota dans `lib/storage.js`.
- Backend Supabase du portail parent et du forum, app parent séparée : voir la section dédiée. Testé en production avec l'effectif réel (20 joueurs, 20 matchs, 3 compétitions, 29 rencontres publiés). Un seul lien parent↔joueur existe à ce jour (issu des tests) : aucune famille réelle n'a encore été invitée.
- Pipeline vidéo intégré au dépôt (`video-pipeline/`, une quarantaine de commits du 12 au 18/09).

## Prochaines étapes envisagées

- **Fait** : backend pour une fonctionnalité ciblée, avec le portail parent et le forum (section « Backend Supabase »). L'étendre à d'autres fonctionnalités est une décision à part : le staff reste en `localStorage`.
- Avant d'inviter plusieurs familles à la fois : authentifier `gamechanger.com` chez Brevo (4 enregistrements DNS sur Route 53) puis brancher le SMTP dans Supabase.
- Premier usage réel : quelques familles de confiance pendant une à deux semaines avant de construire davantage — même logique que plus haut, l'usage réel avant les nouvelles fonctionnalités.
- Dette identifiée : bundle staff de ~2,2 Mo ; une quinzaine d'écrans lisent `readMatchFromCache` sans attendre le chargement (atténué par le préchargement dans `main.jsx`, pas éliminé) ; aucun test automatisé ; publication manuelle (oublier « Publier » laisse les parents sur des données périmées).
- App mobile native une fois le backend en place — React Native pressenti vu que le site est déjà en React, mais attention : tout ce qui est spécifique au navigateur dans le code actuel (`localStorage`, dessin canvas pour le pantin, stockage vidéo, `window.print()`) demande une vraie réécriture pour un environnement natif, pas un portage direct. La base et l'authentification existent désormais ; le modèle de « publication manuelle » devra probablement évoluer pour une app qui doit rester à jour toute seule.
- Le pipeline vidéo (Python/Colab) vit dans `video-pipeline/` ; son état d'avancement se lit dans `git log -- video-pipeline`, il n'est pas détaillé ici.
