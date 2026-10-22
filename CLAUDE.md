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
