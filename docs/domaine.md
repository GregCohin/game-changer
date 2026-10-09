# Mettre `game-changer.fr` devant le portail : mode d'emploi (rien n'est branché)

Ce document décrit comment relier le domaine `game-changer.fr` (acheté chez OVH, déjà authentifié pour l'envoi d'e-mails) au site. **Aucun de ces réglages n'est appliqué** : ils touchent la production (Vercel, OVH, Supabase) et restent à faire par toi, au moment où tu le décides.

## En clair

Aujourd'hui tout vit sous `https://football-analysis-ten.vercel.app` : l'app du staff à la racine, le portail des familles sous `/parent.html`. Le domaine du produit, lui, ne sert pour l'instant qu'à envoyer les e-mails (`noreply@game-changer.fr`).

## ⚠ À savoir avant tout : l'app du staff garde ses données dans le navigateur

L'app du staff n'a pas de serveur : ses données (effectif, séances, matchs…) sont dans le stockage du navigateur, **rattaché à l'adresse du site**. Si l'app du staff s'ouvre un jour sous une autre adresse, le navigateur y voit un stockage **vide**, comme un appareil neuf. Les données ne sont pas perdues (elles sont toujours sous l'ancienne adresse), mais il faut les y transférer avec une sauvegarde complète.

C'est pourquoi la recommandation est de **ne mettre sous `game-changer.fr` que le portail des familles** (qui n'a rien d'autre à conserver que sa connexion), et de laisser l'app du staff où elle est. Si tu veux un jour déplacer aussi l'app du staff : Club → Sauvegarde → exporter la sauvegarde complète (chiffrée) depuis l'ancienne adresse, la restaurer sur la nouvelle, vérifier, et seulement ensuite cesser d'utiliser l'ancienne.

## Recommandation

| Qui | Adresse | Pourquoi |
|---|---|---|
| Familles | `https://portail.game-changer.fr` | Adresse courte et durable à donner aux parents ; ne dépend d'aucun club (vision multi-clubs) |
| Staff | reste `https://football-analysis-ten.vercel.app` | Évite de déplacer les données du navigateur |

Les deux adresses servent le **même** site Vercel : `portail.game-changer.fr` affiche d'abord l'app du staff (comme n'importe quelle adresse du site), sauf si on ajoute la règle ci-dessous.

## Étapes, dans cet ordre

1. **Vercel** — projet `game-changer` → Settings → Domains → *Add* → `portail.game-changer.fr`. Vercel affiche l'enregistrement DNS à créer (un CNAME). Recopie **la valeur qu'il affiche**.
2. **OVH** — zone DNS de `game-changer.fr` → ajoute **uniquement** cet enregistrement. **Ne modifie et ne supprime aucun enregistrement existant** : les DKIM de Brevo (`brevo1._domainkey`, `brevo2._domainkey`), `brevo-code`, `_dmarc`, `resend._domainkey`, `rsend` et `send` font fonctionner l'envoi des e-mails.
3. Attends que Vercel affiche *Valid Configuration* (le certificat HTTPS se crée tout seul, en quelques minutes).
4. **Ouverture directe du portail** (facultatif mais recommandé) : pour que `https://portail.game-changer.fr` (sans `/parent.html`) ouvre le portail et non l'app du staff, ajoute dans `vercel.json` à la racine du dépôt :

   ```json
   {
     "rewrites": [
       { "source": "/", "has": [{ "type": "host", "value": "portail.game-changer.fr" }], "destination": "/parent.html" }
     ]
   }
   ```

   (Si un `vercel.json` existe déjà, ajoute cette entrée à sa liste `rewrites`.) Ainsi, un parent qui tape l'adresse sans `/parent.html` arrive quand même sur le portail. Dans l'écran *Préparer l'invitation*, l'adresse du message reste `https://portail.game-changer.fr/parent.html` : l'app complète toute adresse saisie sans chemin.
5. **Supabase** — Authentication → URL Configuration → *Redirect URLs* : **ajoute** `https://portail.game-changer.fr/**` en gardant les adresses actuelles (`https://football-analysis-ten.vercel.app/**` et `http://localhost:5173/**`). Sans cet ajout, Supabase retombe sur le *Site URL* et un parent qui se connecte depuis la nouvelle adresse arrive sur l'app du staff.
   Laisse le **Site URL** tel quel (l'app du staff) tant que celle-ci ne bouge pas.
6. **Tester** en navigation privée depuis `https://portail.game-changer.fr/parent.html` : demande un e-mail de connexion et vérifie que le bouton de l'e-mail commence bien par `https://portail.game-changer.fr/parent.html#confirmation?…`, puis qu'il t'amène sur la page *Confirme ta connexion*.
7. **Staff** — dans le panneau *Préparer l'invitation*, remplace l'adresse du portail par la nouvelle : elle est mémorisée pour le club, les prochaines invitations l'utiliseront. Les familles déjà invitées avec l'ancienne adresse continuent de fonctionner.

## Ce qui ne change pas

- L'expéditeur des e-mails (`noreply@game-changer.fr`), la configuration Resend, les enregistrements DNS d'authentification.
- Les variables d'environnement de Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) : elles ne dépendent pas de l'adresse du site.
- Le dépôt et le déploiement automatique à chaque push sur `main`.

## Retour arrière

Retire `portail.game-changer.fr` des Domains de Vercel (et, si tu veux, de la liste des *Redirect URLs* de Supabase). L'ancienne adresse n'a jamais cessé de fonctionner : aucune famille n'est coupée.

## Plus tard : plusieurs clubs

Le modèle actuel est mono-club (voir CLAUDE.md, « Vision multi-clubs »). Quand plusieurs clubs utiliseront le produit, l'adresse du portail sera celle du **produit**, pas d'un club : c'est ce que prépare le choix d'un sous-domaine `portail.` plutôt que d'une adresse propre à ce club.
