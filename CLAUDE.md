# Projet : Teranga CV (et Teranga Shop)

## Le propriétaire et ce qu'il veut

- Toujours répondre **en français**, en phrases courtes et simples, **sans détails techniques**.
- Son objectif : **voir des revenus arriver sur son compte Wave chaque jour**, en ayant le moins
  possible à faire lui-même. Tout ce qui peut être automatisé doit l'être ; ne lui demander que ce
  que lui seul peut faire (démarches à son nom, informations personnelles).
- Versement automatique quotidien souhaité à **20 h 30** (heure de Dakar).
- Son numéro Wave est enregistré dans la configuration privée du serveur (table `tcv.settings`),
  jamais dans le code public.
- Rester honnête : ne jamais promettre ni garantir de gains, ne jamais utiliser de moyens risqués
  pour lui (spam, faux comptes, faux avis, fraude). Il travaille dans une banque : lui conseiller de
  garder son emploi tant que les revenus ne sont pas stables.

## Le business

Teranga CV vend des CV et lettres de motivation (1 000 / 1 000 / 1 500 FCFA), payés par Wave,
livrés automatiquement. Spécification complète : `supabase/SPEC.md`. Guide du propriétaire :
`LANCEMENT-CV.md`. Plan de promotion : `MARKETING-CV.md`.

- Backend : Supabase, projet `teranga-cv` (ref `seegnylaubuularegmku`), fonction Edge `api`
  (`verify_jwt = false`). Déploiement : `deno bundle --external 'npm:*' --minify supabase/functions/api/index.ts -o /tmp/index.js`
  puis `deploy_edge_function` (fichier unique `index.ts`). Réglages privés dans `tcv.settings`
  (jamais dans le dépôt). Tâches pg_cron : `tcv-reconcile` (10 min) et `tcv-daily` (20 h 30).
  Les migrations à partir de 000003 ne contiennent jamais le mot DELETE (l'outil de déploiement
  demande sinon une confirmation interactive) : `tcv_purge` efface les données par UPDATE.
  Produits : cv, lettre, pack, stage (Pack Stage), premium (CV Premium, 5 000 FCFA).
  Paiement manuel « autopay » : montant unique par commande + notification Wave relayée par le
  téléphone du propriétaire (MacroDroid → POST /payments/notify, clé PHONE_HOOK_KEY dans tcv.settings).
- Site : dossier `cv/`, publié par GitHub Pages depuis la branche `gh-pages`
  (https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/). Publier = pousser un commit
  testé sur `gh-pages`. Ne pas utiliser githack (page d'avertissement devant le site).
- Teranga Pro (dossier `formation/`, produit `pq_essentiel`, 25 000 FCFA) : formation « Power Query pour le
  reporting bancaire ». Le dépôt est PUBLIC : le contenu payant (modules, classeurs, clé du quiz) n'y entre jamais ;
  il est dans la table `tcv.course_assets` (plus une copie de secours `_backup/…tgz`, jamais servie aux acheteurs).
  Mise à jour du contenu : `scripts/course-upload.mjs` avec un jeton jetable (`openssl rand -hex 32`, son SHA-256 dans
  `COURSE_UPLOAD_TOKEN_SHA256`, fenêtre `COURSE_UPLOAD_UNTIL` ≤ 72 h, refermée après). Vente ouverte/fermée par
  `PQ_SALES_OPEN` dans `tcv.settings`. Rien de l'employeur du propriétaire (données, modèles, méthodes), aucune vraie
  banque citée, ne jamais utiliser les skills `ecobank-*`. Démo sans paiement : `formation/demo.html`.
  Le propriétaire a confirmé (22/10/2026) que son contrat lui permet cette activité.
- Référencement : après chaque publication, `node scripts/indexnow.mjs` signale toutes les URL de `cv/sitemap.xml` à IndexNow (Bing, Yandex…) ; la clé publique est dans `cv/ebb4ea75c352a571bd0b205056c2b276.txt`.
- Tests : `deno test -A supabase/functions/api/tests/` et `cd e2e && node flow.mjs`.

## Teranga Outils (boutique d'outils Excel et de documents sur mesure, gérée de bout en bout)

- Pages : dossier `boutique/`, régénérées par `scripts/boutique/pages.mjs` depuis le catalogue public (workflow
  « Boutique pages » de la branche par défaut, toutes les 3 h et après chaque fabrique ; IndexNow pour les pages changées).
- Fabrique : `scripts/boutique/fabriquer.py` (workflow « Boutique fabrique », chaque nuit) lit d'abord les fiches en
  attente (`tcv.boutique_fiches`, ajoutées par `boutique_ajouter_fiches` ; une fiche avec `formulaire` est un document sur
  mesure), puis fait écrire de nouvelles fiches et documents par des modèles GRATUITS d'OpenRouter via la route
  `POST /fabrique/modele` de la fonction (GitHub Models a fermé le 30 juillet 2026 ; sans clé enregistrée, seule la file
  est traitée, sans erreur). Plafond de sécurité : 30 nouveaux produits par 24 h (au-delà, les fiches restent en file) ;
  chaque classeur est construit (openpyxl), recalculé par LibreOffice et contrôlé avant dépôt. Dépôt authentifié par le
  jeton OIDC de GitHub Actions (aucun secret). Publication tacite 24 h après le dépôt (tâche pg_cron
  `boutique-publication`, 5 par jour au plus), sauf refus du propriétaire (`/admin/decider`).
- Fonction Edge `boutique` (`supabase/functions/boutique/index.ts`, fichier unique, tests :
  `node --experimental-strip-types supabase/functions/boutique/test.ts`). Commandes dans `tcv.orders` (produit
  `bt_<id>`) : montant unique et détection du paiement par le téléphone via la fonction `api`, inchangée. Fichiers dans
  `tcv.course_assets` sous `bt/<id>/`. Migrations `20261102000008_boutique.sql` et `20261102000009_boutique_fiches.sql`.
- Les fiches des produits (le contenu payant) ne sont jamais committées : elles vivent dans la base.
- Guides gratuits : `scripts/boutique/guides.json` (contenu public) → pages `boutique/guide-<slug>.html` et `guides.html`,
  reliés aux produits (champ `produits`) ; ajoutés au plan du site. C'est le seul marketing : aucun message n'est envoyé.
- Documents sur mesure (produits `type = 'generateur'`) : le client remplit un formulaire (réponses dans
  `orders.input`), paie par Wave, puis la fonction rédige le document par OpenRouter à la lecture de la commande
  (`boutique_generation_reserver` / `_enregistrer`, verrou de 3 min) et le livre à l'écran et en Word (.docx construit
  sans bibliothèque). La consigne de rédaction reste privée (jamais dans `boutique_json`). Clé : secret
  `OPENROUTER_API_KEY` de la fonction, sinon clé du propriétaire enregistrée depuis son application (`POST /admin/ia`,
  `tcv.settings` `BOUTIQUE_OPENROUTER_KEY`, jamais renvoyée). Sans clé, les générateurs sont masqués du catalogue et
  refusés (503). Migrations `20261102000010_boutique_generateurs.sql` et `20261102000011_boutique_cle_ia.sql`.
