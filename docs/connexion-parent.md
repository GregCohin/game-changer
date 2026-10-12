# Connexion des parents : code à 6 chiffres, lien de confirmation et invitations

## En clair

**Le problème.** Certaines messageries (Outlook, les passerelles de sécurité d'entreprise…) ouvrent chaque lien d'un e-mail *avant* son destinataire, pour vérifier qu'il est sûr. Un lien de connexion ne sert qu'une fois : quand le parent clique, il est déjà « brûlé » et voit *lien invalide ou expiré*.

**Ce qui change.**

- L'e-mail de connexion contient maintenant un **code à 6 chiffres** (rien à ouvrir, donc rien qu'un scanner puisse consommer) **et** un bouton « Me connecter ».
- Ce bouton ne mène pas directement à la connexion : il ouvre une page qui **ne vérifie rien tant qu'on n'appuie pas sur « Me connecter »**. Un scanner qui ouvre la page ne consomme donc pas le lien.
- Un lien périmé ou déjà utilisé (y compris un *ancien* lien) affiche maintenant un message clair, avec un bouton pour recevoir un nouveau code, au lieu de renvoyer sur l'écran de connexion sans explication.
- Côté staff, le bouton **« Préparer l'invitation »** (Administratif → Club → Portail parent (backend)) fabrique le message à envoyer à une famille : adresse du portail, code d'invitation, rappel des indésirables. Il se copie, ou s'ouvre dans ta messagerie ou dans WhatsApp. **Rien n'est jamais envoyé automatiquement.**
- Un compteur t'avertit avant d'atteindre les plafonds d'envoi d'e-mails (voir plus bas).

## Ce que voit le parent

1. Il saisit son adresse e-mail → *Recevoir un e-mail de connexion*.
2. Écran *Vérifie ta boîte mail* : il saisit le code à 6 chiffres de l'e-mail, ou clique sur le bouton de l'e-mail (page *Confirme ta connexion* → *Me connecter*).
3. Il est connecté ; s'il n'est lié à aucun enfant, l'écran suivant lui demande son code d'invitation (inchangé).

## À faire par toi dans Supabase, une seule fois

Je n'ai touché à aucun réglage de production. Les modèles d'e-mail se changent dans le tableau de bord Supabase.

### 0. L'ordre compte

1. **D'abord** : fusionner la PR et laisser Vercel déployer. Le site comprend alors les nouveaux liens, et les anciens e-mails continuent de fonctionner.
2. **Ensuite seulement** : coller les nouveaux modèles. Un e-mail avec le nouveau lien (`…parent.html#confirmation?…`) envoyé *avant* le déploiement ne serait pas compris par l'ancien site.

Cette PR s'appuie sur la PR de sécurité du portail (la fenêtre « nouveaux parents liés ») : fusionne celle-ci en premier.

### 1. Garde une copie des modèles actuels

Authentication → Emails → Templates. Pour *Magic Link* et *Confirm signup*, copie le contenu actuel dans un fichier texte : c'est ton retour arrière.

### 2. Magic Link

- **Subject** : `Ton code de connexion Game Changer`
- **Message body** : le contenu de [`docs/modeles-email/magic-link.html`](modeles-email/magic-link.html).

Copie le fichier **tel quel**, sans le retaper : il est en ASCII pur (accents écrits `&eacute;`…), précisément pour que le presse-papiers ne corrompe rien.

```bash
pbcopy < docs/modeles-email/magic-link.html
```

### 3. Confirm signup

- **Subject** : `Bienvenue sur Game Changer : ton code de connexion`
- **Message body** : le contenu de [`docs/modeles-email/confirm-signup.html`](modeles-email/confirm-signup.html).

```bash
pbcopy < docs/modeles-email/confirm-signup.html
```

Les deux modèles servent : un parent qui se connecte pour la première fois reçoit « Confirm signup », un parent déjà connecté une fois reçoit « Magic Link ». Si tu n'en changes qu'un, l'autre garde l'ancien e-mail (avec l'ancien lien, toujours valable tant que personne ne l'ouvre avant le parent).

### 4. Durée et longueur du code

Authentication → Sign In / Providers → Auth Providers → Email → **Email OTP expiration** : 1 heure par défaut, ce qui convient. Garde la longueur à **6 chiffres** (l'application l'annonce ainsi). Les noms exacts des menus peuvent varier un peu selon la version du tableau de bord.

### 5. Adresses de redirection

Authentication → URL Configuration : l'adresse du portail (`https://football-analysis-ten.vercel.app/parent.html`) doit être couverte par les *Redirect URLs* (c'est déjà le cas avec `https://football-analysis-ten.vercel.app/**`). Sinon Supabase retombe sur le *Site URL* et le parent arrive sur l'app du staff. Pour le futur domaine, voir [`domaine.md`](domaine.md).

## Tester (15 minutes)

**Utilise une fenêtre de navigation privée** pour le portail parent. L'app staff et le portail parent ont la même adresse web de base et se partagent la session : si tu es connecté en staff dans ton navigateur habituel, le portail te croit déjà connecté.

Pour tester un *nouveau* parent, utilise une adresse jamais employée sur le portail ; avec iCloud ou Gmail, `prenom+test1@icloud.com` arrive dans ta boîte habituelle.

1. Ouvre le portail → saisis l'adresse → l'e-mail arrive avec **un code** et **un bouton**.
2. Saisis le code → tu es connecté.
3. Déconnecte-toi, redemande un e-mail, clique sur le **bouton** → la page *Confirme ta connexion* s'affiche, et **tu n'es pas encore connecté** → appuie sur *Me connecter* → tu l'es.
4. Rouvre le même bouton de l'e-mail déjà utilisé → *Ce code ou ce lien n'est plus valable* + *Recevoir un nouveau code*.
5. **Simulation d'un scanner** : demande un nouvel e-mail, ouvre le bouton, **n'appuie sur rien**, ferme l'onglet, puis saisis le **code** du même e-mail → il marche encore. C'est la preuve que simplement ouvrir le lien ne consomme rien.
6. Refais 1 à 3 depuis l'écran staff (Portail parent (backend)).

Si le code est refusé alors que l'e-mail vient d'arriver, vérifie dans l'e-mail que tu lis bien le **dernier** : chaque nouvelle demande invalide le code précédent.

## Inviter les familles

1. Administratif → Club → Portail parent (backend) → choisis le joueur → **+ Générer un code**. Le panneau *Préparer l'invitation* s'ouvre (pour un code existant : bouton *Préparer l'invitation* sur sa ligne).
2. Vérifie l'**adresse du portail** (une seule fois : elle est mémorisée pour le club). Une adresse qui ne marcherait pas chez les familles (`localhost`, réseau local…) est refusée.
3. Relis le message (il est modifiable), puis **Copier**, **Ouvrir dans ma messagerie** ou **Envoyer par WhatsApp**. Tu choisis toi-même le destinataire et tu appuies toi-même sur *Envoyer*.
4. Envoie-le à **la famille concernée, pas dans un groupe** : le code donne accès à la fiche de l'enfant.

Le message ne contient ni le prénom de l'enfant ni l'adresse du parent, et les liens `mailto:` / WhatsApp n'en contiennent pas non plus. Le code, lui, voyage dans le message, comme dans n'importe quel message envoyé par la même voie.

## Les plafonds d'e-mails

| Limite | Valeur | Où la voir / la changer |
|---|---|---|
| Resend, offre gratuite | 100 e-mails par jour (3 000 par mois) | Resend → Emails |
| Supabase, avec un SMTP personnalisé | 30 e-mails par heure par défaut | Authentication → Rate Limits (réglable) |
| Une même adresse | une demande par minute | — |

Chaque demande de connexion = 1 e-mail ; une famille en consomme en pratique **environ 2** (le premier, puis un renvoi : indésirables, code expiré, deuxième parent). Cela fait **une cinquantaine de familles par jour** et **une quinzaine par heure** au maximum.

Le compteur de l'écran *Codes d'invitation* ne voit que les invitations préparées **depuis ce navigateur** et en déduit une *estimation* ; le total réel est dans Resend. Il passe à l'orange à 70 % d'un plafond et au rouge à 100 % (une confirmation est alors demandée avant de préparer une invitation de plus). Si tu relèves la limite horaire de Supabase ou changes d'offre Resend, mets à jour `EMAIL_LIMITS` dans `src/lib/invitationMessage.js`.

**Inviter par vagues** :

1. Invite une dizaine de familles, pas plus.
2. Attends qu'elles se connectent : elles apparaissent dans *nouveaux parents liés à vérifier* ; confirme-les au fur et à mesure.
3. Invite les suivantes une heure plus tard, ou le lendemain si le compteur est orange ou rouge.

Quand le plafond est atteint, le parent voit *Beaucoup de connexions en ce moment… réessaie dans une heure* : ce n'est pas de sa faute et rien n'est cassé.

## Si un parent écrit « ça ne marche pas »

| Il dit | Cause probable | Réponse |
|---|---|---|
| « Je ne reçois pas l'e-mail » | Indésirables (iCloud surtout : domaine encore récent), ou faute dans l'adresse | Regarder dans les indésirables et marquer « non indésirable » ; attendre une minute puis *Renvoyer l'e-mail* ; vérifier l'adresse saisie ; côté staff, regarder dans Resend si l'e-mail est parti (*delivered*) ou a rebondi |
| « Ce code ou ce lien n'est plus valable » | Expiré, déjà utilisé, ou ancien e-mail | *Recevoir un nouveau code*, puis utiliser le **dernier** e-mail reçu |
| « Un e-mail vient déjà de m'être envoyé » | Il a redemandé moins d'une minute après | Saisir le code de l'e-mail déjà reçu ; le bouton de renvoi se réactive après le compte à rebours |
| « Beaucoup de connexions en ce moment » | Plafond horaire d'e-mails atteint | Réessayer dans une heure ; côté staff, inviter par vagues |
| « Je suis connecté mais je ne vois pas mon enfant » | Pas encore de code d'invitation saisi | L'écran suivant demande le code d'invitation (inchangé) |

## Sécurité, en deux mots

- Le code se devine avec une chance sur un million par essai ; Supabase limite les essais (30 vérifications par 5 minutes et par adresse IP), le code expire (1 heure par défaut) et chaque nouvelle demande invalide le précédent.
- Le jeton du lien est dans la partie `#` de l'adresse : le navigateur ne l'envoie jamais au serveur (ni journaux d'accès, ni en-tête `Referer`). Après connexion, l'adresse est nettoyée.
- Ce qui ne change pas : l'e-mail peut toujours atterrir en indésirables sur iCloud (réputation du domaine, voir CLAUDE.md), et le code d'invitation reste nécessaire pour lier un compte à un enfant.

## Dans le code

`src/lib/emailLogin.js` (code, lien, erreurs de retour), `src/lib/ConfirmationPage.jsx` (page de confirmation, partagée parent et staff), `src/parent/ConfirmationLayer.jsx` et `src/parent/screens/LoginScreen.jsx` (portail), `src/portail/StaffLogin.jsx`, `StaffConfirmation.jsx` et `InvitationMessage.jsx` (staff), `src/lib/invitationMessage.js` (texte, adresse, compteur). Tests : `tests/emailLogin.test.mjs`, `tests/invitationMessage.test.mjs`, `tests/modeles-email.test.mjs` (qui lit les deux modèles ci-dessus).
