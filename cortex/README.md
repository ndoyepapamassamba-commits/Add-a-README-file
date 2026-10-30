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

À chaque demande, une couche déterministe et gratuite entoure le modèle, quel qu'il soit (payant, gratuit, local). **Chaque demande est traitée pour elle-même** : une stratégie passée n'est réutilisée telle quelle que pour la même tâche sur les mêmes données ; les expériences passées servent de leçons de méthode, jamais de structure à recopier ; un skill appris ne s'active que s'il correspond vraiment à la demande ; le gabarit de « registre de suivi » n'est utilisé que pour un vrai suivi ; les nombres sont formatés (milliers, pourcentages, unités dans les en-têtes) et les feuilles « Top N » limitées.

**Voie rapide** : une salutation ou une question de connaissance (« C'est quoi le ratio NPL ? ») reçoit une réponse directe en quelques secondes — sans analyse préalable, stratégie, vérification ni relecture, et sans phase de réflexion du modèle. Une action (créer, corriger, traduire…), un fichier, une suite de tâche (« oui », « continue »), une information d'actualité, le mode plan ou un agent spécialisé passent toujours par la voie complète :

1. **Comprendre** — contrat de tâche : type (question, recherche, analyse, livrable, code, automatisation), livrables attendus, critères de réussite.
2. **Chercher** — conversations passées pertinentes (recherche BM25 locale, seulement si la mémoire est active), recherche web préalable si la demande porte sur une information récente et que la conversation dispose de la recherche web (mots-clés seulement, jamais vos chiffres ni vos noms ; jamais avec un modèle local, « Refuser la collecte », ZDR ou une demande marquée confidentielle), mémoire, base de connaissances.
3. **Stratégie** — le **Guru** (modèle gratuit de raisonnement) rédige le plan expert, les pièges et la checklist **en parallèle** : le modèle choisi démarre tout de suite et reçoit la stratégie dès qu'elle arrive (une stratégie déjà connue est appliquée immédiatement) ; l'**expérience** des tâches passées (REA) est réinjectée, seulement si le tour avait vraiment réussi.
4. **Exécuter** — outils (≈ 70) : Python, JavaScript, Studio (DOM + canvas), fichiers, web, documents, dossiers de l'ordinateur, messagerie…
5. **Vérifier sur preuves** — avant livraison, y compris pour une demande courte (« Donne-moi un fichier Excel premium », « continue », « où est le fichier ? »), jugée avec la demande d'origine : livrables demandés produits, fichiers annoncés existants, fichiers ouverts (aperçu généré par Cortex sinon), **chiffres de la réponse tracés dans les résultats d'outils** (valeurs dérivées et hypothèses déclarées admises), **design choisi présent dans les fichiers livrés**, erreurs d'outils non résolues ; une seule passe de correction si quelque chose bloque, dans la limite d'étapes réglée, puis une relecture critique par un autre modèle. Un même échec rejoué sous des variantes est freiné (changer d'approche ou s'arrêter proprement).
6. **Apprendre** — expérience mémorisée ; préférences durables retenues (profil) ; une tâche complexe réussie devient un **skill** réutilisable ; les recettes d'images sont mémorisées.
7. **Répondre** — la conclusion d'abord, chiffres clés en gras, puis seulement ce qui aide à décider (tableau, fichiers, points d'attention) et 1 ou 2 **suites proposées** ; aucune rubrique vide.

Les boosters gratuits (Guru, relecture critique, conseil d'experts, réflexion profonde) accompagnent aussi les modèles payants (réglable : Réglages › Harness). Ce sont des modèles gratuits du cloud : ils ne reçoivent jamais la demande quand « Refuser la collecte de données » ou ZDR est actif, ni pour un modèle local ou du navigateur (sauf accord explicite dans Modèles locaux). Le modèle choisi n'est jamais remplacé en silence : une bascule (coupures répétées) respecte vos réglages de repli et l'étiquette de la réponse montre le modèle qui a réellement répondu.

## 🖥️ Modèles locaux — indépendance (Apache 2.0)

| Voie | Comment | Modèles conseillés |
|---|---|---|
| **Serveur local** (Ollama, LM Studio, llama.cpp, vLLM — API compatible OpenAI) | Modèles › Modèles locaux › URL (`http://localhost:11434/v1`) › Tester. Ollama : `OLLAMA_ORIGINS=* ollama serve` puis `ollama pull gpt-oss:20b` | gpt-oss 20B / 120B (Apache 2.0), Qwen3 8B / 30B-A3B (Apache 2.0), Mistral Small 3.2 24B (Apache 2.0), Devstral (code), SmolLM3, OLMo 2, DeepSeek-R1 distill (MIT), Phi-4 (MIT) |
| **Dans le navigateur** (WebLLM, WebGPU) | Modèles › Modèles locaux › « Dans le navigateur » — téléchargé une fois, mis en cache | Qwen3 8B / 4B / 1.7B, Qwen2.5 7B, Mistral 7B v0.3, DeepSeek-R1 distill 7B |

Les modèles locaux apparaissent dans le sélecteur (« Local · … », « Navigateur · … ») et bénéficient de tout le harness : outils (appel natif ou **écrit en texte** si le modèle n'a pas de function calling), cerveau, vérification, Guru (option « utiliser aussi comme Guru / relecteur »). Sans clé OpenRouter, Cortex démarre directement sur le modèle local.

**Carte graphique vérifiée avant chaque usage** : si le navigateur ne donne pas accès au GPU (WebGPU coupé après une saturation de la mémoire graphique, par exemple), la page Modèles l'explique avant tout clic (cause et étapes, bouton « Revérifier ») et la conversation bascule sur un modèle cloud **gratuit** — jamais payant — avec une carte « Comment corriger ». Pour rester 100 % local, décochez « Si un modèle local échoue, répondre avec un modèle cloud gratuit » : aucun message ne part alors sur Internet. Choisir un modèle du navigateur dans le sélecteur ne lance aucun téléchargement : il démarre avec « Télécharger et utiliser » ou au premier message.

**Modèle du navigateur maîtrisé** : **Arrêter** coupe immédiatement, à toutes les étapes (chargement, réflexion, rédaction, outil), et le message suivant part sans attendre. Seule la lecture du contexte, que WebLLM ne sait pas interrompre, doit se terminer avant que le message suivant parte : elle reste affichée et annulable. Une ligne de progression montre l'étape en cours (chargement %, lecture du contexte, réflexion, rédaction en jetons/s). Si le modèle est trop lent pour la carte graphique, une carte d'aide propose un modèle plus léger, de couper la réflexion, de réduire le contexte ou de répondre avec un modèle cloud gratuit (si vous l'autorisez) ; jamais d'attente infinie. La réflexion de Qwen3 est coupée par défaut (activable avec un plafond). Aucune tâche de fond (titre, suggestions, stratégie, relecture) n'occupe la carte graphique. **Fenêtre de contexte** réglable dans la carte du navigateur (Automatique : 16 384 jetons sur carte graphique dédiée, 8 192 sur carte intégrée ; jusqu'à 32 768, mémoire estimée affichée) ; l'historique est ajusté automatiquement pour toujours tenir dedans.

## 🎨 Moteur de design — styles créés par Cortex

- **Votre design est prioritaire** : le design choisi (sélecteur « Design » ou Réglages › Design des documents) s'applique à **tous** les fichiers produits, quel que soit le chemin — `create_excel` / `create_word` / `create_powerpoint` / `create_pdf` / rapports HTML, Studio (le kit part de ce design ; un autre style demandé par le modèle est remplacé et signalé), Python (variable `CORTEX_DESIGN`) — et prime sur les instructions personnalisées, la mémoire, les skills, les expériences et le mot « premium » (= soin de la présentation, dans votre design). Seule exception : un autre design ou une charte nommé dans votre message en cours. La vérification sur preuves contrôle les couleurs réellement présentes dans chaque fichier livré et fait corriger un fichier qui ne les porte pas. Le modèle peut proposer un design, jamais changer le vôtre sans votre accord.
- **Automatique** (aucun choix) : mise en forme sobre ; un style ne s'applique que s'il est nommé dans la demande ou défini par un skill.
- **Outils natifs d'abord** : un rendu « premium » ou « sur mesure » passe par `create_excel` / `create_word` / `create_powerpoint`, qui disent exactement ce qu'ils ont produit (feuilles, lignes, tuiles, graphiques, éléments écartés et pourquoi) ; Python ou le Studio seulement pour ce qu'ils ne savent pas faire. Présentations : tableaux longs paginés, nombres formatés.
- **Catalogue des plus beaux classeurs** : 28 designs de référence en option, issus d'une recherche sur les meilleures pratiques mondiales, en 8 catégories : finance et banque (modèle bancaire à entrées bleues, grand livre, rapport annuel, salle des marchés), conseil et direction, éditorial (papier saumon de la presse économique, hebdomadaire, institut de recherche), tableaux de bord modernes, normes et accessibilité (notation de gestion normalisée, palette pour daltoniens, viridis, lisibilité renforcée), thèmes natifs du tableur, thèmes sombres (terminal de marché, carbone, minuit, ardoise) et inspirations africaines (indigo, bogolan, Lac Rose, Saint-Louis). Chaque design est complet (palette, statuts, couleurs de graphiques, polices, en-têtes, bordures, quadrillage, tuiles, négatifs entre parenthèses, totaux à double filet, cellules de saisie, fond sombre) et s'applique à Excel, Word, PowerPoint, PDF, HTML et au Studio ; contrastes vérifiés.
- **Choix du design** : sélecteur et onglet Réglages › Design des documents avec catégories, recherche, mini-aperçus fidèles, galerie d'aperçus réels ; changer la « couleur principale » d'un design du catalogue crée sa variante à votre couleur (mise en page conservée).
- **Styles intégrés historiques** : revue (pétrole et lime), exécutif, prestige, émeraude, graphite, bordeaux, océan, sahel, obsidienne, ivoire, corail.
- **Styles composés par Cortex** (`style_manage`) : à partir de graines (primaire, secondaire, accent, encre, relief 3D / doux / plat, polices), palette complète dérivée, **aperçu PNG** à contrôler, enregistrement ; partagés par `create_excel` / `create_word` / `create_powerpoint` et par le Studio.
- **Studio (`run_studio`) et kit `cx`** : visuels 3D sur carte en relief (barres, classements, anneau, courbes, jauge, matrice, carte d'analyse, bandeau d'indicateurs), badge logo, **classeur Excel fini** (tuiles, barres de données, listes déroulantes, feux tricolores, titre figé, impression A4, dégradés), **présentation** (couverture, bandeaux, tuiles, tableaux à pastilles, visuels), **note Word** (couverture, indicateurs, sections, tableaux, visuels), **mail Outlook** (.eml brouillon en couleur avec images intégrées, .html) — un seul appel `cx.deliver({...})` produit tout, avec le logo de la charte.
- **Kits de skills** : `useSkill('nom')` charge dans le Studio les bibliothèques et le kit JavaScript d'un skill (manifeste `studio.json`) — le skill définit le rendu, sauf design choisi par l'utilisateur.
- **Studio fiable** : seuls les formats demandés sont produits ; la ligne Total n'additionne que les colonnes additives (jamais un solde, un taux ou une date) et porte sa valeur ; PowerPoint et Word contiennent toutes les lignes (pagination « suite »).

## 🧩 Skills (standard agentskills.io) et outils forgés

- **Import** : `.zip`, dossier complet ou `SKILL.md` (références, scripts, assets conservés) ; `skill_manage` permet au modèle de créer, corriger et compléter des skills ; les skills appris sont modifiables.
- **Forge d'outils** (`tool_workshop`) : Cortex crée, teste (tests enregistrés) et conserve ses propres outils — moteurs **JavaScript** (worker), **Studio** (DOM, canvas, kit cx) ou **Python** — disponibles dans toutes les conversations.
- **Référentiel de méthodes** (Guru) : livrables, portefeuille de crédit, simulation de prêt, registre de suivi, exploitation des fichiers fournis, modèles gratuits/locaux, design, vérification.

## 📂 Dossiers de l'ordinateur, messagerie, tâches planifiées

- **Dossiers de l'ordinateur** (Fichiers › Dossiers de l'ordinateur) : connectez le Bureau, les Téléchargements ou un dossier de travail ; Cortex y **cherche** (`local_search`), **récupère** (`local_read`) et **enregistre** (`local_save`) ses livrables. Chrome / Edge (File System Access), accès révocable.
- **Messagerie** (Réglages › Messagerie) : Gmail (Google Identity Services) et Outlook / Microsoft 365 (MSAL + Graph) en lecture seule avec votre propre identifiant client OAuth, depuis le navigateur (Cortex servi en http(s)) ; outils `mail_search`, `mail_read`, `mail_attachment`. Sans connexion : `eml_extract` lit un `.eml` et extrait ses pièces jointes ; un serveur MCP de messagerie peut aussi être branché.
- **Tâches planifiées** (page dédiée ou en langage naturel : « chaque lundi à 8 h… ») : ponctuelles ou récurrentes, exécutées par Cortex lui-même dans une conversation dédiée lorsque la page est ouverte, rattrapées au lancement, notifiées.

## 🖼️ Studio multimédia

- **Page Studio** (barre latérale) : onglets **Image** (invite améliorable, styles, formats, variantes, graine), **Vidéo** (vidéo locale gratuite à partir d'images, plan vidéo pour les générateurs externes), **Recette** (comprendre comment une image a été faite) et **Galerie** (images et vidéos de l'espace de fichiers).
- Moteurs d'images gratuits sans clé (Pollinations, avec filigrane et limites ; AI Horde, file d'attente communautaire) ; modèles d'images et de vidéos OpenRouter **payants**, avec coût estimé affiché avant génération. Aucun générateur vidéo IA gratuit n'existe aujourd'hui : la vidéo gratuite est rendue localement.
- Outils du modèle : **`image_recipe`** : un modèle de vision reconstitue la recette d'une image (sujet, style, composition, lumière, palette, prompt reproductible, méthode du générateur) et la mémorise comme skill « recette » ; `generate_image … learn: true` apprend sa propre recette.
- **`video_prompt`** : plan vidéo depuis une image (mouvement, caméra, durée, prompt image-to-video) et diapositives prêtes pour `create_video` (diaporama animé local).

## 🔄 Mise à jour et sauvegarde

- Réglages › Données : version installée, **vérification quotidienne** d'une nouvelle version sur le dépôt, téléchargement en un clic (un fichier HTML à remplacer ; les données restent dans le navigateur).
- Export / import complet (conversations, agents, fichiers, mémoire, skills, outils, expériences, réglages).

## ✨ Également

- **Interface** en pétrole et lime par défaut (clair et sombre, contrastes WCAG AA), ou aux **couleurs du logo de votre charte** (Réglages › Apparence) ; panneau des conversations repliable proprement (Ctrl+Maj+S), état mémorisé.
- Conversations à branches, comparaison et arène de modèles, sous-agents, mode plan, permissions par outil, hooks, checkpoints, inspecteur de trace.
- **Permissions respectées partout** : tout appel d'outil, y compris imbriqué (reprise par le Guru, code du Guru, conversion, transcription), passe par l'autorisation, le mode (lecture seule, plan), les hooks et la liste des outils de la conversation. En mode « Demander », les actions qui modifient la configuration (mémoire, skills, tâches planifiées, styles, outils) ou remplacent un fichier existant demandent votre accord. Les sous-agents restent sur le modèle et les outils de la conversation.
- **Mémoire maîtrisée** : rien n'est retenu quand la mémoire est coupée ; une préférence détectée est proposée (« Retenir ? ») au lieu d'être enregistrée en silence ; jamais une plainte, une consigne de design ni les données d'un client.
- **Python** : `exports/` prêt d'emblée, Pillow installé automatiquement pour les images des classeurs, erreurs lisibles (cause et ligne de votre code d'abord), fichiers écrits avant une erreur conservés.
- Fichiers livrables téléchargeables (Excel, Word, PowerPoint, PDF, HTML, images, vidéos, 3D) ; la carte « Fichiers produits » met le livrable en tête (fichiers de travail et versions écartées repliés) ; exports Markdown/HTML sans les versions remplacées ni les étapes internes.
- Aperçu fidèle pour la vérification visuelle : classeurs (styles, logo, **formules calculées** même sans valeur en cache — Total, soldes — graphiques natifs tracés depuis leurs plages, barres de données), **présentations diapositive par diapositive** et documents Word avec leurs vraies couleurs.
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
