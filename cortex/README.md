# 🧠 Cortex Studio — gestionnaire de LLM & harness d'agents (OpenRouter)

**Un seul fichier HTML** (`index.html`) qui transforme votre navigateur en studio d'IA complet :
plus de 400 modèles via une seule clé [OpenRouter](https://openrouter.ai), des agents autonomes
qui utilisent des outils, et un « harness » (moteur d'orchestration) de niveau professionnel.
Aucun serveur, aucun abonnement : vos données restent **dans votre navigateur**.

## 🚀 Démarrer en 1 minute

1. Ouvrez `cortex/index.html` dans Chrome, Edge, Firefox ou Safari (double-clic).
2. Créez une clé sur [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) et collez-la à l'accueil.
3. Choisissez un agent (Assistant, Chercheur, Développeur…) et discutez.

> 💡 Des modèles **gratuits** (`:free`) sont proposés par défaut. Ajoutez quelques dollars de
> crédit OpenRouter pour accéder aux modèles premium (GPT, Claude, Gemini…).
> Fixez une limite de dépense sur votre clé pour garder le contrôle.

**Mise en ligne (optionnel)** : activez GitHub Pages sur ce dépôt. L'application est alors servie à
`https://<utilisateur>.github.io/<dépôt>/cortex/`, ce qui active aussi le bouton
« Se connecter avec OpenRouter » (OAuth, sans copier de clé).

## ✨ Fonctionnalités

### Conversations (parité TypingMind et au-delà)
- Streaming temps réel, Markdown, tableaux, **LaTeX** (KaTeX), **diagrammes Mermaid**, coloration syntaxique.
- **Branches** : modifiez un message ou régénérez une réponse, puis naviguez entre les versions (‹ 1/3 ›).
- Régénérer avec **un autre modèle**, continuer une réponse coupée, créer une conversation à partir d'un message.
- **Dossiers** (glisser-déposer), épinglage, **étiquettes**, filtres, recherche plein texte.
- Pièces jointes : images (vision), **PDF**, **Word**, **Excel**, CSV, code, audio… (coller ou glisser).
- Dictée vocale 🎤, lecture à voix haute 🔊, raisonnement visible (🧠 effort réglable).
- Bibliothèque de **prompts à variables** (`{{texte}}`, `{{langue|anglais}}`) accessibles par `/commande`.
- Palette de commandes `Ctrl+K`, raccourcis clavier, thème clair/sombre, interface mobile.
- Export Markdown / HTML / JSON / PDF (impression). Import des exports **ChatGPT** et **TypingMind**.

### Harness d'agents
- **Boucle agentique** : le modèle enchaîne appels d'outils → observation → nouvelle étape, jusqu'à la fin
  de la tâche (nombre d'étapes et **budget en $ par réponse** plafonnés).
- **Outils intégrés** : recherche web (avec sources), lecture de pages, requêtes HTTP, **JavaScript** et
  **Python (Pyodide : numpy, pandas, matplotlib…)** dans un bac à sable, **espace de fichiers** persistant
  (lire / écrire / modifier / chercher), **artefacts** (pages HTML, SVG, Mermaid affichés en direct),
  **plan de tâches** (todo), **question à l'utilisateur**, mémoire, base de connaissances, génération d'images.
- **Sous-agents** : un orchestrateur délègue des sous-tâches à des agents spécialisés **en parallèle**.
- **Permissions** : mode *Demander* / *Auto* / *Lecture seule*, permission par outil, validation avec
  **arguments modifiables** avant exécution.
- **Hooks** JavaScript : réécrire les requêtes, bloquer un appel d'outil, masquer des données dans les
  résultats, post-traiter les réponses.
- **Serveurs MCP** (Model Context Protocol, transport HTTP) et **outils personnalisés** en JavaScript
  (modèles fournis : météo, Wikipédia, taux de change).
- **Gestion du contexte** : jauge de remplissage, **compaction automatique** par résumé, troncature,
  « middle-out » OpenRouter.
- **Trace d'exécution** : chronologie de chaque appel (modèle, outil, hook), durées, tokens, coûts,
  requêtes et réponses brutes.
- Garde-fou **anti-boucle**, nouvelles tentatives automatiques (429/5xx), **repli** des modèles gratuits saturés.

### Multi-modèles
- **Comparaison** côte à côte de 2 à 4 modèles sur le même message.
- **Conseil de modèles** : un modèle arbitre fusionne les réponses en une réponse supérieure.
- **Arène à l'aveugle** : votez pour la meilleure réponse sans connaître les modèles, puis consultez
  votre **classement Elo** personnel.
- Modèles de repli (fallback), routage des fournisseurs (prix, débit, latence), refus de collecte de données, ZDR.

### Connaissances & mémoire
- **Base de connaissances (RAG)** : collections de documents, recherche **hybride** (BM25 + embeddings),
  injection automatique des extraits pertinents.
- **Mémoire à long terme** : l'agent retient vos préférences et votre contexte d'une conversation à l'autre.
- Profil & instructions personnalisées transmis à tous les agents.

### Suivi des coûts
- Coût et tokens par message, par conversation, par modèle et par jour ; solde OpenRouter ; export CSV.

## 🔒 Sécurité & confidentialité
- Conversations, fichiers, mémoire et documents : stockés **localement** (IndexedDB). Aucune télémétrie.
- La clé API reste dans le navigateur et n'est envoyée qu'à `openrouter.ai`.
- Le code exécuté par les agents (JS, Python, outils personnalisés, hooks) tourne dans des **workers
  isolés** (iframe sandbox d'origine opaque) **sans accès** à vos données ni à votre clé.
- Le HTML produit par les modèles est assaini (DOMPurify) ; les **images distantes ne se chargent qu'au clic**
  (protection contre l'exfiltration de données par injection de prompt).
- La lecture de pages bloquées par le navigateur (CORS) passe par le proxy `r.jina.ai` (désactivable dans
  Réglages › Harness).

## 🧩 Agents fournis

| Agent | Spécialité |
|---|---|
| 💬 Assistant | Polyvalent : mémoire, calcul, lecture de pages |
| 🔎 Chercheur | Recherche web approfondie, rapport cité |
| 🧑‍💻 Développeur | Code dans l'espace de fichiers, exécution, artefacts |
| 📊 Analyste de données | Python, graphiques, analyses |
| 🧭 Orchestrateur | Planifie et délègue à des sous-agents |
| ✍️ Rédacteur | Écriture française soignée |
| 🎨 Studio Image | Génération d'images |
| 🎓 Professeur | Pédagogie, quiz interactifs |

Créez les vôtres dans **Agents** (instructions, modèle, outils, connaissances, paramètres, amorces).

## ⌨️ Raccourcis

| Touche | Action |
|---|---|
| `/` | Aller à la zone de saisie (ou ouvrir les prompts) |
| `Ctrl/⌘ K` | Palette de commandes |
| `Ctrl/⌘ Maj O` | Nouvelle conversation |
| `Échap` | Arrêter la génération |
| `Alt R` | Régénérer la dernière réponse |
| `Ctrl/⌘ .` | Inspecteur (trace, plan, fichiers, aperçu) |
| `↑` | Modifier votre dernier message |
