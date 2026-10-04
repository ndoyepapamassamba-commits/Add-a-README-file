# OpenRouter AI Workbench

Un centre de commande d'ingénierie IA, dans l'esprit de Claude Code, qui utilise **OpenRouter** comme fournisseur de modèles.
L'interface est **un seul fichier HTML local** (`dist/openrouter-workbench.html`). Elle pilote un **agent local** (serveur Node) qui garde la clé, exécute les outils et applique les permissions.

```
┌──────────────────────────────┐        HTTP + WebSocket          ┌──────────────────────────────────────┐
│ openrouter-workbench.html    │  ◀──── (jeton d'accès) ────▶     │ Agent local (Node, 127.0.0.1:8787)   │
│ chat · code · terminal ·     │                                  │ boucle d'agent · outils · SQLite      │
│ navigateur · données · …     │                                  │ Playwright · MCP · Jev · git          │
└──────────────────────────────┘                                  └──────────────┬───────────────────────┘
                                                                                 │ OPENROUTER_API_KEY (serveur uniquement)
                                                                                 ▼
                                                                         openrouter.ai/api/v1
```

## Installation

Prérequis : **Node.js ≥ 22.13** (git recommandé ; Python 3 optionnel pour `code.run`, `uv` pour certains plugins MCP).

```bash
cd workbench
npm install
npx playwright install chromium   # navigateur intégré (une fois)
cp .env.example .env              # puis renseignez OPENROUTER_API_KEY
npm run build
npm start
```

Au démarrage, le terminal affiche :

- l'adresse de l'interface **déjà connectée** (`http://127.0.0.1:8787/#token=…`) ;
- le **jeton d'accès** (aussi enregistré dans `data/.workbench-token`).

### Sans terminal ni installation : GitHub Codespaces

Si votre ordinateur ne permet pas d'ouvrir un terminal ou d'installer Node.js, faites tourner l'agent dans le cloud de GitHub, depuis le navigateur :

1. Sur github.com : **Settings › Codespaces › Secrets › New secret**, nom `OPENROUTER_API_KEY`, valeur = votre clé, et autorisez ce dépôt.
2. Sur la page du dépôt, choisissez la branche, puis **Code › Codespaces › Create codespace**.
3. Attendez l'installation (quelques minutes la première fois). Dans l'onglet de terminal ouvert automatiquement, cliquez sur le lien **Interface** (`https://…-8787.app.github.dev/#token=…`).

Le port reste **privé** (seul votre compte GitHub y accède) et le jeton est conservé dans `workbench/data/.workbench-token`. Pensez à arrêter le codespace quand vous avez fini (quota gratuit mensuel limité).

### Utiliser le fichier HTML local

Ouvrez `dist/openrouter-workbench.html` (double-clic, depuis n'importe quel dossier). Indiquez l'adresse de l'agent (`http://127.0.0.1:8787`) et collez le jeton. Le fichier ne contient **aucune clé** : il ne fait que parler à votre agent local.

### Développement

```bash
npm run dev        # serveur (tsx watch) + interface Vite avec rechargement à chaud
npm run typecheck  # TypeScript strict
npm run lint       # ESLint
npm run format     # Prettier
```

## Configuration (`.env`)

| Variable                               | Rôle                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                   | Clé OpenRouter. **Côté serveur uniquement.** Peut aussi être saisie dans _Réglages › Fournisseurs IA_ (jamais réaffichée ensuite). |
| `HOST`, `PORT`, `PREVIEW_PORT`         | Écoute (par défaut `127.0.0.1`, `8787`, `8788` pour l'aperçu isolé).                                                               |
| `PUBLIC_PREVIEW_URL`                   | Adresse publique de l'aperçu derrière une redirection de port (détectée automatiquement dans Codespaces).                          |
| `WORKBENCH_AUTH_TOKEN`                 | Jeton d'accès fixe (sinon généré). Obligatoire si `HOST` n'est pas une adresse locale.                                             |
| `WORKSPACE_ROOT`, `DATA_DIR`           | Dossier des projets (`./workspace`) et des données (`./data` : SQLite, sessions, skills importés…).                                |
| `BRAVE_API_KEY`                        | Recherche web Brave (sinon recherche via le plugin web d'OpenRouter).                                                              |
| `BROWSER_ENGINE`, `BROWSER_HEADLESS`   | Moteur Playwright (`chromium`, `firefox`, `webkit`).                                                                               |
| `TYPESAFE_API_KEY`                     | Active **Jev** (TypeSafe System One) pour le routage AUTO, la détection des skills et l'outil `jev.judge`.                         |
| `SKILLS_DIRS`, `INCLUDE_CLAUDE_SKILLS` | Dossiers de skills supplémentaires ; lecture de `~/.claude/skills` et `~/.claude/agents` (activée par défaut).                     |

## Fonctionnalités

- **Chat d'agent** en streaming : appels d'outils visibles, statut, coûts réels par étape (jamais la chaîne de pensée privée).
- **Choix du modèle** (catalogue OpenRouter en direct : prix, contexte, capacités) ou **AUTO** (routage par tâche : rapide / équilibré / puissant / raisonnement / vision), **niveau d'effort**, chaîne de **secours** automatique.
- **Jauge de crédits** OpenRouter + consommation par session et par modèle ; **budgets** jour / mois / tâche.
- **Modes de permissions** : SAFE (lecture seule), NORMAL (demande avant d'écrire / d'exécuter), AUTONOMOUS. Cartes d'approbation avec diff ou commande, « toujours autoriser », refus avec consigne.
- **Mode PLAN** : l'agent inspecte en lecture seule, propose un plan modifiable, puis l'exécute après validation.
- **Agents** intégrés (Généraliste, Codeur, Chercheur, Navigateur, Analyste de données, Relecteur, Testeur) + **agents personnalisés** au format Claude Code (`.md` avec `name`, `description`, `tools`, `model`, `effort`, `skills`) ; délégation à des sous-agents ; **Review my work**.
- **Skills** compatibles Claude (`SKILL.md`) : épinglés, choisis, liés à un agent ou détectés automatiquement (mots-clés + Jev) ; injectés comme instructions **obligatoires**. Import `.zip` / `.skill` / `SKILL.md`.
- **Plugins MCP** (stdio, HTTP, SSE, OAuth) : préréglages Blender, Canva, Figma, Notion, Linear et MCP gratuits (Context7, DeepWiki, Fetch, Time, DuckDuckGo, Memory, Sequential Thinking, Playwright, Git). L'agent les utilise automatiquement, sous contrôle des permissions.
- **Code** : éditeur Monaco (onglets, diff, « Demander à l'IA »), arbre de fichiers, recherche, **aperçu en direct**, changements **acceptables / annulables**, Git (commit ; jamais de push sans confirmation).
- **Terminal** avec classification du risque des commandes, **navigateur intégré** Playwright en direct (actions, console, réseau, captures, téléchargements).
- **Données** : CSV, Excel, JSON — profil, anomalies, requêtes, graphiques interactifs, exports.
- **Téléversement** de fichiers, textes, documents (PDF, Word, PowerPoint…), photos (vision).
- Mémoire de projet (`PROJECT_CONTEXT.md`), artefacts, palette de commandes `Ctrl+K`, sessions persistantes, export Markdown / JSON / PDF, journal d'audit.

Utilisation sans interface : `node scripts/agent-cli.mjs` (lance une tâche via l'API).

## Sécurité

- La clé OpenRouter n'existe **que** côté serveur ; elle est masquée dans les journaux, les sorties d'outils et les réponses de l'API.
- Toute l'API exige le **jeton d'accès** (Bearer, comparaison à temps constant) ; CORS limité à `localhost` et aux fichiers locaux ; refus de démarrer sur une adresse publique sans jeton fixe.
- Les fichiers sensibles (`.env`, clés SSH, identifiants…) sont protégés ; les chemins ne peuvent pas sortir du projet ; les suppressions passent par une corbeille annulable.
- Les processus lancés reçoivent un environnement **nettoyé** des secrets. Les commandes dangereuses sont bloquées ou confirmées à chaque fois.
- L'aperçu est servi sur une **origine séparée** avec des jetons de capacité par projet ; le navigateur intégré ne peut pas ouvrir `file://` ni l'API locale.
- ⚠️ Le terminal n'est **pas** un conteneur : les commandes s'exécutent avec les droits de votre utilisateur. Pour une isolation forte, utilisez l'image Docker ci-dessous.

## Tests

```bash
npm test            # unitaires + intégration (API, boucle d'agent avec faux OpenRouter, Chromium réel, serveur MCP stdio réel)
npm run build && npm run test:e2e   # interface construite pilotée par Playwright (y compris le fichier HTML ouvert depuis le disque)
npm run test:live   # optionnel : vrai OpenRouter + Jev (quelques fractions de centime)
```

## Déploiement

L'agent exécute des commandes et pilote un navigateur : il doit tourner **sur votre machine ou sur un serveur à vous**, pas sur une plateforme « serverless » (Vercel, Netlify…).

```bash
docker build -t openrouter-workbench workbench
docker run -p 127.0.0.1:8787:8787 -p 127.0.0.1:8788:8788 \
  -e OPENROUTER_API_KEY=sk-or-... -e WORKBENCH_AUTH_TOKEN=un-long-jeton \
  -v "$PWD/wb-data:/app/data" -v "$PWD/wb-workspace:/app/workspace" openrouter-workbench
```

Derrière un reverse proxy (HTTPS), gardez `WORKBENCH_AUTH_TOKEN` long et secret.
