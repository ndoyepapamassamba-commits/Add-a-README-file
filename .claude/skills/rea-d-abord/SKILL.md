---
name: rea-d-abord
description: Consigne permanente de l'utilisateur (17/10/2026) — « utilise REA tout le temps au début de toutes tes réflexions pour de la rétro-ingénierie rapide ». À appeler au début de CHAQUE réflexion technique, juste après methode-veille-creation (qui reste le premier skill) : avant de deviner comment marche un outil, un paquet, une app, un format ou un service, le démonter avec REA (Reverse Engineer Anything, MIT) et raisonner sur des preuves.
---

# REA d'abord : rétro-ingénierie rapide au début de chaque réflexion

Consigne de l'utilisateur (17/10/2026), mot pour mot :
> « utilise REA tout le temps au début de toutes tes réflexions pour de la rétro-ingénierie rapide, garde ça comme skill »

Ordre des compétences : `methode-veille-creation` (toujours la première, CLAUDE.md) → **`rea-d-abord`** → `zero-limite`
→ compétences métier. REA (`morluto/rea`, licence MIT, paquet npm `rea-agents@6.5.0`) est installé dans ce projet :
CLI `rea` (Node ≥ 22.19, `/opt/node22/bin/rea`), serveur MCP déclaré dans `.mcp.json` (outils `mcp__rea__*` après
redémarrage de la session). Le mode d'emploi complet est dans `.claude/skills/reverse-engineer-anything/`.

## Règle

1. **Au début de chaque réflexion technique**, se demander : « quel artefact livré répond à ma question plus vite que
   ma mémoire ? » (paquet npm ou pip, bundle JavaScript, app Electron, APK, binaire, base SQLite, WASM, capture réseau,
   notre propre build). S'il existe, **REA d'abord**, puis raisonner sur ses preuves.
2. **Outils MCP si présents** (`mcp__rea__analyze_javascript_application`, `inspect_artifact`, …), sinon **CLI** :
   - paquet JavaScript : `npm pack <paquet>@<version>` dans le scratchpad, extraire, puis
     `rea analyze-javascript-application <dossier>/package/dist --format json > ev.json` ;
   - chercher dans `normalized_result.semantic_graph.nodes` les motifs utiles (en-têtes, routes, clés), lire ensuite les
     lignes exactes indiquées par `identity.module_path` + `source_range` ;
   - autres cibles : `rea inspect-artifact`, `rea inspect-binary-layout`, `rea inspect-sqlite-database`,
     `rea inspect-wasm-artifact`, `rea inspect-web-network-capture` (voir `rea --help`).
3. **Disque** : la preuve JSON peut peser des dizaines de Mo (65 Mo pour `@gradio/client`) ; extraire ce qui sert, puis
   supprimer le JSON. Rien de tout cela dans le dépôt.
4. **Citer les preuves** dans la réponse : fichier, ligne, identifiant de preuve REA ; séparer observé / déduit /
   inconnu (règle REA).
5. **Cibles légitimes seulement** : nos apps, logiciels libres, artefacts de l'utilisateur, code client public pour
   l'interopérabilité. Jamais pour extraire un modèle propriétaire hébergé côté serveur (Grok, Veo, Kling : refusé le
   17/10/2026), contourner un contrôle anti-robot (CAPTCHA, code SMS), récupérer des identifiants ou violer des
   conditions d'utilisation. Un refus du classificateur de sécurité ne se contourne pas : le noter et passer par la voie
   légitime (exemple : inscription Hugging Face faite par l'utilisateur, 17/10/2026).

## Exemple mesuré (17/10/2026) : quota ZeroGPU de l'utilisateur dans « Animer mon image »

Question : comment le client officiel de Gradio fait-il compter un appel sur le quota GPU d'un compte ?
- `npm pack @gradio/client` (2.7.1) → `rea analyze-javascript-application` : 26 fichiers JavaScript analysés,
  61 343 nœuds de syntaxe, 471 constats, preuve `ev_ac6e1004…` ;
- le graphe a pointé `dist/index.js` l. 1162-1180 (`src/helpers/zerogpu.ts`) : les en-têtes d'identité ZeroGPU ne
  viennent que de la page parente huggingface.co (poignée de main `postMessage` « supports-zerogpu-headers ») ;
  l. 35-44 : un jeton donne `Authorization: Bearer …` sur chaque appel et un JWT via `/api/spaces/{id}/jwt` ;
- conséquence codée : hors de huggingface.co, l'app envoie le jeton de l'utilisateur en `Authorization` (pré-vols CORS
  vérifiés pour une page locale, origine `null` : `whoami-v2` et `queue/join` autorisent l'en-tête `authorization`).

## Veille permanente sans limite (18/10/2026)

Consignes : « veille permanente REA chaque minute » ; « ne donne pas de limite à REA, demande-lui de chercher tous les
moteurs disponibles du monde » ; « greffe d'abord les outils nécessaires, JEV ne juge que le rendu ».
- `studio-video/outils/veille_rea.py <dossier>` tourne en continu (cycle d'une minute) : npm (recherche paginée sur
  ~70 thèmes + nouvelles versions des moteurs suivis), GitHub (sujets triés par étoiles), Hugging Face (modèles par tâche) ;
  REA démonte tout paquet JavaScript greffable sur deux voies parallèles ; journal `journal.jsonl` + résumé `veille.md`.
- Au début de chaque session : relancer le veilleur ; avant chaque greffe : lire son journal.

## Outils libres et gratuits pour avancer vite, REA à chaque instant (18/10/2026)

Consigne, mot pour mot : « Toujours chercher des outils libres et gratuits pour avancer vite. […] Et pour cela, tu
utiliseras REA chaque instant. Mets ça comme skills. »
- **À chaque étape lente ou manquante** (production vidéo, juge, rendu, publication), avant d'écrire du code maison :
  chercher l'outil **libre** (MIT, Apache-2.0, BSD pour ce qui tourne chez nous) et **gratuit** qui fait déjà le travail
  plus vite — npm, PyPI, GitHub, Hugging Face, journal du veilleur — puis le **démonter avec REA** (paquet JavaScript,
  binaire, WASM, base SQLite, notre propre build) pour savoir exactement comment il marche avant de le greffer.
- **Mesurer le gain** sur nos données (secondes par minute de film, qualité, licence) et garder les voies battues en
  secours ; ce qui est plus lent ou payant n'est pas retenu.
- REA sert aussi à **nos propres artefacts** (journaux de l'usine, mesures par image, films rendus) pour trouver où
  le temps passe avant d'accélérer.

## Liste de contrôle

- [ ] REA lancé (ou absence d'artefact pertinent constatée) avant de coder ou de conclure ;
- [ ] preuves citées (fichier, ligne, identifiant) ;
- [ ] gros JSON de preuve supprimé après extraction ;
- [ ] cible légitime, aucun contournement de refus.
