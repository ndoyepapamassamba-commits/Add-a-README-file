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

- Backend : Supabase, projet `teranga-cv` (ref `seegnylaubuularegmku`), fonction Edge `api`.
- Site : dossier `cv/` (GitHub Pages ou githack).
- Tests : `deno test -A supabase/functions/api/tests/` et `cd e2e && node flow.mjs`.
