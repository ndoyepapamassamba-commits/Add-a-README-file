# 🧠 Cortex — gestionnaire de LLM et harness d'agents autonome (un seul fichier HTML)

**Un seul fichier** (`index.html`) qui transforme votre navigateur en studio d'IA complet et autonome :
plus de 400 modèles via une clé [OpenRouter](https://openrouter.ai) **ou des modèles locaux gratuits
(licence Apache 2.0)**, des agents qui réfléchissent, cherchent, exécutent, **vérifient sur preuves** et
**apprennent**, des livrables Excel / Word / PowerPoint / mail au design que Cortex compose lui-même,
l'accès à vos dossiers et à votre messagerie, des tâches planifiées. Aucun serveur, aucun abonnement :
vos données restent **dans votre navigateur**.

## 🚀 Démarrer en 1 minute

1. Ouvrez `cortex/index.html` dans Chrome ou Edge (double-clic ; Firefox et Safari fonctionnent sans les dossiers de l'ordinateur ni WebGPU).
2. **Avec le cloud** : créez une clé sur [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) et collez-la à l'accueil — des modèles **gratuits** (`:free`) sont proposés par défaut.
   **Sans le cloud** : page **Modèles › Modèles locaux** — un serveur local (Ollama, LM Studio, llama.cpp…) ou un modèle dans le navigateur (WebLLM, WebGPU). Aucune clé n'est alors nécessaire.
3. Choisissez un agent et demandez : « analyse ce fichier », « prépare la revue de septembre en Excel et PowerPoint », « chaque lundi à 8 h, … ».

**Mise en ligne (optionnel)** : activez GitHub Pages ; l'application est servie à `https://<utilisateur>.github.io/<dépôt>/cortex/`
(active aussi « Se connecter avec OpenRouter » et la connexion directe Gmail / Outlook).

## 🧭 Comment Cortex travaille (le « cerveau »)

À chaque demande, une couche déterministe et gratuite entoure le modèle, quel qu'il soit (payant, gratuit, local).

**Voie rapide** : une salutation ou une question de connaissance (« C'est quoi le ratio NPL ? ») reçoit une réponse directe en quelques secondes — sans analyse préalable, stratégie, vérification ni relecture, et sans phase de réflexion du modèle. Une action (créer, corriger, traduire…), un fichier, une suite de tâche (« oui », « continue »), une information d'actualité, le mode plan ou un agent spécialisé passent toujours par la voie complète :

1. **Comprendre** — contrat de tâche : type (question, recherche, analyse, livrable, code, automatisation), livrables attendus, critères de réussite.
2. **Chercher** — conversations passées pertinentes (recherche BM25 locale), recherche web préalable si la demande porte sur une information récente, mémoire, base de connaissances.
3. **Stratégie** — le **Guru** (modèle gratuit de raisonnement, plafonné à 45 s puis repli sur un modèle rapide) rédige le plan expert, les pièges et la checklist ; l'**expérience** des tâches passées (REA) est réinjectée.
4. **Exécuter** — outils (≈ 70) : Python, JavaScript, Studio (DOM + canvas), fichiers, web, documents, dossiers de l'ordinateur, messagerie…
5. **Vérifier sur preuves** — avant livraison : livrables demandés produits, fichiers annoncés existants, fichiers ouverts (aperçu généré par Cortex sinon), **chiffres de la réponse tracés dans les résultats d'outils**, erreurs d'outils non résolues ; une passe de correction est imposée si quelque chose bloque, puis une relecture critique par un autre modèle.
6. **Apprendre** — expérience mémorisée ; préférences durables retenues (profil) ; une tâche complexe réussie devient un **skill** réutilisable ; les recettes d'images sont mémorisées.
7. **Répondre** — la conclusion d'abord, chiffres clés en gras, puis seulement ce qui aide à décider (tableau, fichiers, points d'attention) et 1 ou 2 **suites proposées** ; aucune rubrique vide.

Les boosters gratuits (Guru, relecture critique, conseil d'experts, réflexion profonde) accompagnent aussi les modèles payants (réglable).

## 🖥️ Modèles locaux — indépendance (Apache 2.0)

| Voie | Comment | Modèles conseillés |
|---|---|---|
| **Serveur local** (Ollama, LM Studio, llama.cpp, vLLM — API compatible OpenAI) | Modèles › Modèles locaux › URL (`http://localhost:11434/v1`) › Tester. Ollama : `OLLAMA_ORIGINS=* ollama serve` puis `ollama pull gpt-oss:20b` | gpt-oss 20B / 120B (Apache 2.0), Qwen3 8B / 30B-A3B (Apache 2.0), Mistral Small 3.2 24B (Apache 2.0), Devstral (code), SmolLM3, OLMo 2, DeepSeek-R1 distill (MIT), Phi-4 (MIT) |
| **Dans le navigateur** (WebLLM, WebGPU) | Modèles › Modèles locaux › « Dans le navigateur » — téléchargé une fois, mis en cache | Qwen3 8B / 4B / 1.7B, Qwen2.5 7B, Mistral 7B v0.3, DeepSeek-R1 distill 7B |

Les modèles locaux apparaissent dans le sélecteur (« Local · … », « Navigateur · … ») et bénéficient de tout le harness : outils (appel natif ou **écrit en texte** si le modèle n'a pas de function calling), cerveau, vérification, Guru (option « utiliser aussi comme Guru / relecteur »). Sans clé OpenRouter, Cortex démarre directement sur le modèle local.

**Carte graphique vérifiée avant chaque usage** : si le navigateur ne donne pas accès au GPU (WebGPU coupé après une saturation de la mémoire graphique, par exemple), la page Modèles l'explique avant tout clic (cause et étapes, bouton « Revérifier ») et la conversation bascule sur un modèle cloud **gratuit** — jamais payant — avec une carte « Comment corriger ». Pour rester 100 % local, décochez « Si un modèle local échoue, répondre avec un modèle cloud gratuit » : aucun message ne part alors sur Internet. Choisir un modèle du navigateur dans le sélecteur ne lance aucun téléchargement : il démarre avec « Télécharger et utiliser » ou au premier message.

## 🎨 Moteur de design — styles créés par Cortex

- **Sobre par défaut** : aucun design imposé. Un style ne s'applique que sur demande (`theme`), ou quand un skill le définit.
- **Styles intégrés** : revue (pétrole et lime), exécutif, prestige, émeraude, graphite, bordeaux, océan, sahel, obsidienne, ivoire, corail.
- **Styles composés par Cortex** (`style_manage`) : à partir de graines (primaire, secondaire, accent, encre, relief 3D / doux / plat, polices), palette complète dérivée, **aperçu PNG** à contrôler, enregistrement ; partagés par `create_excel` / `create_word` / `create_powerpoint` et par le Studio.
- **Studio (`run_studio`) et kit `cx`** : visuels 3D sur carte en relief (barres, classements, anneau, courbes, jauge, matrice, carte d'analyse, bandeau d'indicateurs), badge logo, **classeur Excel fini** (tuiles, barres de données, listes déroulantes, feux tricolores, titre figé, impression A4, dégradés), **présentation** (couverture, bandeaux, tuiles, tableaux à pastilles, visuels), **note Word** (couverture, indicateurs, sections, tableaux, visuels), **mail Outlook** (.eml brouillon en couleur avec images intégrées, .html) — un seul appel `cx.deliver({...})` produit tout, avec le logo de la charte.
- **Kits de skills** : `useSkill('nom')` charge dans le Studio les bibliothèques et le kit JavaScript d'un skill (manifeste `studio.json`) — c'est le skill qui définit le rendu.

## 🧩 Skills (standard agentskills.io) et outils forgés

- **Import** : `.zip`, dossier complet ou `SKILL.md` (références, scripts, assets conservés) ; `skill_manage` permet au modèle de créer, corriger et compléter des skills ; les skills appris sont modifiables.
- **Forge d'outils** (`tool_workshop`) : Cortex crée, teste (tests enregistrés) et conserve ses propres outils — moteurs **JavaScript** (worker), **Studio** (DOM, canvas, kit cx) ou **Python** — disponibles dans toutes les conversations.
- **Référentiel de méthodes** (Guru) : livrables, portefeuille de crédit, simulation de prêt, registre de suivi, exploitation des fichiers fournis, modèles gratuits/locaux, design, vérification.

## 📂 Dossiers de l'ordinateur, messagerie, tâches planifiées

- **Dossiers de l'ordinateur** (Fichiers › Dossiers de l'ordinateur) : connectez le Bureau, les Téléchargements ou un dossier de travail ; Cortex y **cherche** (`local_search`), **récupère** (`local_read`) et **enregistre** (`local_save`) ses livrables. Chrome / Edge (File System Access), accès révocable.
- **Messagerie** (Réglages › Messagerie) : Gmail (Google Identity Services) et Outlook / Microsoft 365 (MSAL + Graph) en lecture seule avec votre propre identifiant client OAuth, depuis le navigateur (Cortex servi en http(s)) ; outils `mail_search`, `mail_read`, `mail_attachment`. Sans connexion : `eml_extract` lit un `.eml` et extrait ses pièces jointes ; un serveur MCP de messagerie peut aussi être branché.
- **Tâches planifiées** (page dédiée ou en langage naturel : « chaque lundi à 8 h… ») : ponctuelles ou récurrentes, exécutées par Cortex lui-même dans une conversation dédiée lorsque la page est ouverte, rattrapées au lancement, notifiées.

## 🖼️ Studio multimédia

- Images gratuites (FLUX) ou via OpenRouter ; **`image_recipe`** : un modèle de vision reconstitue la recette d'une image (sujet, style, composition, lumière, palette, prompt reproductible, méthode du générateur) et la mémorise comme skill « recette » ; `generate_image … learn: true` apprend sa propre recette.
- **`video_prompt`** : plan vidéo depuis une image (mouvement, caméra, durée, prompt image-to-video) et diapositives prêtes pour `create_video` (diaporama animé local).

## 🔄 Mise à jour et sauvegarde

- Réglages › Données : version installée, **vérification quotidienne** d'une nouvelle version sur le dépôt, téléchargement en un clic (un fichier HTML à remplacer ; les données restent dans le navigateur).
- Export / import complet (conversations, agents, fichiers, mémoire, skills, outils, expériences, réglages).

## ✨ Également

- Conversations à branches, comparaison et arène de modèles, sous-agents, mode plan, permissions par outil, hooks, checkpoints, inspecteur de trace.
- Fichiers livrables téléchargeables (Excel, Word, PowerPoint, PDF, HTML, images, vidéos, 3D) ; aperçu fidèle des classeurs (styles, logo, graphiques) pour la vérification visuelle.
- Internet gratuit sans clé (moteurs de recherche gratuits, lecture de pages), API gratuites, serveurs MCP (registre officiel), exploration de projets GitHub.
- Entrées : images, audio, PDF, Office, archives, CSV / Excel (y compris `.xlsb`).
- Suivi des coûts et du solde OpenRouter ; modèles gratuits privilégiés.

## 🔒 Sécurité & confidentialité

- Conversations, fichiers, mémoire, skills, outils : stockés **localement** (IndexedDB). Aucune télémétrie.
- La clé API reste dans le navigateur et n'est envoyée qu'à `openrouter.ai` ; les modèles locaux ne sortent pas de votre machine.
- Le code exécuté par les agents (JS, Python, Studio, outils forgés, hooks) tourne dans des **bacs à sable isolés** (workers et iframes d'origine opaque) sans accès à vos données ni à votre clé.
- Le HTML produit par les modèles est assaini (DOMPurify) ; les images distantes ne se chargent qu'au clic.
- L'accès aux dossiers de l'ordinateur et à la messagerie passe par les autorisations du navigateur et reste révocable.

## 🧩 Agents fournis

| Agent | Spécialité |
|---|---|
| 💬 Assistant | Polyvalent : mémoire, calcul, lecture de pages, livrables |
| 🔎 Chercheur | Recherche web approfondie, rapport cité |
| 🧑‍💻 Développeur | Code dans l'espace de fichiers, exécution, artefacts |
| 📊 Analyste de données | Python, graphiques, analyses, Studio |
| 🧭 Orchestrateur | Planifie et délègue à des sous-agents |
| ✍️ Rédacteur | Écriture française soignée |
| 🎨 Studio Image | Images, recettes, vidéos |
| 🎓 Professeur | Pédagogie, quiz interactifs, présentations |
| 📑 Studio Office | Excel, Word, PowerPoint, PDF vérifiés visuellement |
| 🧊 Studio 3D | Scènes 3D exportables vers Blender, scripts bpy |

Créez les vôtres dans **Agents** (instructions, modèle, outils, connaissances, paramètres, amorces).

## ⌨️ Raccourcis

| Touche | Action |
|---|---|
| `/` | Aller à la zone de saisie (ou ouvrir les commandes et prompts) |
| `Maj Tab` | Changer de mode : Demander → Auto → Plan |
| `Ctrl/⌘ K` | Palette de commandes |
| `Ctrl/⌘ Maj O` | Nouvelle conversation |
| `Échap` | Arrêter la génération |
| `Alt R` | Régénérer la dernière réponse |
| `Ctrl/⌘ .` | Inspecteur (trace, plan, fichiers, aperçu) |
| `↑` | Modifier votre dernier message |

## ℹ️ Limites d'une application navigateur

Node.js, Cursor et Blender sont des logiciels de bureau : ils ne s'exécutent pas dans une page web. Cortex fournit leurs équivalents
(exécution JS/Python isolée, Studio avec DOM et canvas, éditeur avec diff IA, scènes 3D exportées). Les tâches planifiées s'exécutent
quand Cortex est ouvert (rattrapage au lancement) ; les connexions Gmail / Outlook exigent une page servie en http(s).
