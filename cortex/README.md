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

### Fichiers téléchargeables (sorties) — tous formats
- **Excel premium** (`.xlsx`) : titre, en-têtes stylés, filtres, volets figés, statuts colorés avec liste
  déroulante, feuille **Synthèse** d'avancement calculée par formules, impression paysage.
- **Word** (`.docx`), **PDF**, **PowerPoint** (`.pptx` 16:9 avec graphiques natifs modifiables, tableaux,
  illustrations, notes d'orateur), **vidéos** MP4/WebM (diaporamas animés), **images** (génération
  **gratuite** FLUX ou OpenRouter), **QR codes**, **modèles 3D** `.glb` / `.obj` / `.stl`.
- Chaque réponse affiche une carte **« Fichiers produits »** : aperçu, **Télécharger**, tout en `.zip`.
- Les liens inventés par les modèles (`sandbox:/mnt/data/…`) sont **réparés** automatiquement en vrais
  téléchargements ; les liens vers des fichiers inexistants sont signalés.
- Tout tableau d'une réponse : **Copier / CSV / Excel** ; toute réponse : export **Word / PDF / Excel / Markdown**.
- Python installe seul les paquets manquants (openpyxl, python-docx, python-pptx, fpdf2…) ; tout fichier
  écrit dans l'espace de travail devient téléchargeable.

### Empreintes premium (design imposé à tous les livrables, même par les modèles gratuits)
- Une **empreinte** est un système de design complet : bandeau sombre avec logo et **ligne d'accent**, tuiles d'indicateurs
  en dégradé, bandeaux de section soulignés, en-têtes de tableau en dégradé, lignes alternées, **statuts colorés**,
  polices (Segoe UI + Consolas), pied de page « organisation · titre · diffusion | page x / y ». Le design est appliqué
  par les outils : le modèle ne s'occupe que des données.
- Empreinte par défaut **« Revue premium — pétrole et lime »**, reproduite d'un registre de revue de crédit de référence
  (le design, pas les données).
- **Excel** : tableau de bord automatique dès qu'il y a une colonne Statut (tuile Total, une tuile par statut, En retard,
  Avancement ; section Lecture avec constats chiffrés ; **graphiques natifs** anneau par statut et barres empilées par owner ;
  synthèses par rubrique et par owner en formules, barres d'avancement), registre (colonnes **✎ à renseigner**, statuts
  colorés + liste déroulante, séparateurs de rubriques, **Retard (j)** calculé, échéances dépassées en rouge, filtres,
  volets figés), feuille **Paramètres** (mode d'emploi, statuts et définitions, rubriques, owners).
- **Word, PDF, PowerPoint, HTML** au même langage : bandeau titre, tuiles, sections, tableaux à statuts colorés, lignes Total,
  pied de page.
- **Copier le design d'un fichier** (bouton Design) : Excel, Word, PowerPoint ou image de référence → nouvelle empreinte
  (palette, accent, polices détectés).
- **Créer une empreinte avec le Guru** en décrivant vos goûts ; **👍/👎** sur chaque fichier produit : un 👎 commenté fait
  affiner l'empreinte par le Guru puis régénère le fichier. Outil `design_studio` pour les modèles (list, create, import,
  update, apply, feedback).
- **Analyses lourdes (portefeuille, revue de crédit)** : chaque feuille peut être remplie depuis un CSV produit par
  Python (`source_file`, sinon liaison automatique au CSV du même nom dans l'espace de travail) ; `kpis`, `insights` et
  `sheets` acceptés sous toutes les formes (texte, objet, liste) ; **graphiques natifs** demandés (`charts`) avec leur
  bloc de données ; formats selon l'unité (%, montants, nombres) ; garde-fous (pas de colonne Statut sur des commentaires,
  pas de regroupement sur une colonne quasi unique) ; une feuille vide est ignorée avec une note au lieu d'un onglet vide.
- **`sources`** (paramètre texte, le plus fiable) : `"exports/x_*.csv"` ou une liste de fichiers → une feuille premium
  par fichier ; `kpis`, `insights` et `charts` passés au niveau du classeur vont sur la feuille de synthèse. Formats
  ligne par ligne selon la colonne Unité (« 18 978 contrats », « 1 013,36 Mrd XOF », « 0,137 indice »), nombres saisis
  à la française (« 16 444 », « 987,35 ») reconnus, mentions « n.s. » tolérées dans une colonne de pourcentages,
  tuiles réparties en grilles équilibrées, logo de l'espace de travail repris quand son nom évoque l'organisation.

### Designs « ultra premium » (tous les modèles, même gratuits)
- **7 thèmes** cohérents pour Excel, Word, PDF, PowerPoint et rapports HTML : Exécutif, Prestige (marine et or),
  Émeraude, Graphite, Bordeaux, Océan, Sahel — plus **Marque** (votre couleur) et **Logo** (palette extraite du logo).
- **Logo intégré** partout (en-tête de chaque feuille Excel, en-tête Word, PDF, couverture et diapositives PowerPoint,
  bandeau HTML), **recoloré dans la couleur de la palette** si vous le souhaitez (ou d'origine, monochrome, blanc).
- Word / PDF : **page de couverture**, **sommaire automatique**, images et graphiques insérés depuis le Markdown.
- PowerPoint : mises en page **chiffres clés**, **intercalaires**, **comparatif deux colonnes**, **frise**, **citation**.
- **Rapport HTML premium** (tableau de bord : synthèse, cartes de chiffres clés, graphiques, tableaux, encadrés),
  imprimable en PDF. Le design est appliqué par les outils : la qualité ne dépend pas du modèle.
- **Bouton « Design »** au-dessus de la zone de saisie : choix du thème, de la couleur du logo et du logo, avec
  aperçu. **Votre choix s'impose aux modèles** (sauf si votre message demande autre chose) ; « Automatique » les laisse choisir.
- Le **ton principal du logo prend exactement la couleur de la palette** (les nuances plus claires deviennent des teintes).
- **« Changer le design »** sur chaque fichier produit : le fichier est régénéré instantanément dans une autre palette,
  sans rappeler le modèle.
- Excel : formats automatiques (pourcentages à 2 décimales pour PD, LGD, taux, parts ; entiers et décimaux séparés),
  **lignes Total** mises en valeur.
- Charte aussi réglable dans Réglages › Profil.

### Boîte à outils complète (≈ 55 outils)
PDF (fusion, découpe, extraction, rotation, filigrane, numérotation, formulaires, PDF ↔ images), conversions
(Excel/CSV/JSON/Markdown/Word/PDF/HTML/images/Mermaid), retouche d'images, **graphiques** et **diagrammes** en PNG/SVG,
**OCR** de scans, transcription audio, **e-mails .eml prêts pour Outlook** (avec pièces jointes), **invitations .ics**,
**SQL sur fichiers Excel/CSV**, recherche dans l'historique des conversations, **recherche d'images libres**,
**captures de sites web**, **recherche approfondie** multi-sources, archives ZIP, téléchargements, et l'**atelier
d'outils** : le modèle peut démonter un outil (schéma, code source), en créer une version améliorée et la tester.
- **Recherche d'outils par le modèle** (`find_tools`, comme dans Claude Code) : chaque agent garde une liste courte et
  active lui-même ce qui lui manque ; un outil appelé sans avoir été chargé est **activé automatiquement**.

### Internet gratuit, sans clé
- `web_search` gratuit par défaut : DuckDuckGo (direct ou via le lecteur Jina), Mojeek, Wikipédia, actualités GDELT,
  avec **lecture des meilleures pages** — bascule automatique d'un moteur à l'autre. Option OpenRouter (payante).
- Aucun service gratuit n'est « illimité » contractuellement : la combinaison de plusieurs sources évite qu'un
  quota unique bloque Cortex.

### Guru 100 % gratuit (aucun appel payant)
- **Course** entre les deux plus puissants modèles gratuits de raisonnement : la première stratégie complète gagne ;
  repli sur un modèle gratuit rapide. Une stratégie déjà réussie pour une tâche proche est **réutilisée instantanément**.
- **Méthodes expertes intégrées** (livrables premium, risque de crédit UEMOA/BCEAO/Bâle/IFRS 9, analyse de données,
  rédaction, stratégie, code, recherche, juridique OHADA) injectées selon la tâche, avec l'empreinte imposée.
- Outils du Guru pour les modèles gratuits : `ask_guru` (question difficile), `guru_code` (le Guru écrit le code Python et
  Cortex l'exécute), et **reprise automatique** : un outil qui échoue deux fois est corrigé et exécuté par le Guru.
- Robustesse : coupure du fournisseur en cours de réponse (« Provider timed out ») → nouvelle tentative, puis bascule sur
  un autre modèle gratuit ; réparateur JSON renforcé (guillemets internes non échappés, virgules manquantes, sorties
  tronquées, littéraux Python) ; `create_excel` accepte aussi un tableau Markdown ou CSV (`table`).
- **Fournisseurs qui suppriment des paramètres** : certains fournisseurs d'OpenRouter perdent les paramètres de type
  liste ou objet des appels d'outil (constaté : Morph et InferenceNet pour DeepSeek V4.1 Flash — `create_excel` arrivait
  sans `sheets`). Cortex détecte l'appel incomplet, **écarte ce fournisseur pour ce modèle** (mémorisé 7 jours) et
  relance l'étape (4 fois au plus) ; dès la 2e perte, il demande au modèle de passer les données en texte (`sources`,
  chaînes JSON), ce que tous les fournisseurs transmettent. L'erreur restante éventuelle liste les paramètres reçus et
  les CSV disponibles. Mesuré en réel (DeepSeek V4.1 Flash) : Morph puis Relace écartés, classeur premium livré, 0,05 $.
- **Appels d'outil écrits en texte** (`<tool_call><function=…>`, JSON « Hermes », bloc de code JSON) par certains modèles
  gratuits : Cortex les **exécute** au lieu de les afficher.
- **Garde anti-fichier halluciné** : une réponse qui annonce un fichier « créé » qui n'existe pas est retirée et le
  modèle est relancé pour le produire réellement (2 fois au plus).
- Python : un classeur écrit à la main (openpyxl) déclenche une consigne de repasser par `create_excel` pour obtenir
  l'empreinte premium ; un code vide est refusé avec une consigne claire.

### Modèles gratuits « niveau premium » : REA, Guru et boosters
- **REA en premier sur chaque tâche** : analyse préalable visible (expériences passées similaires, outils pertinents
  activés d'office, méthode cadrer → router → résumer → étiqueter → reconstruire et tester).
- **Guru** : sur une tâche complexe, le plus puissant modèle gratuit de raisonnement (effort élevé) rédige la
  **stratégie experte** (objectif, raisonnement du domaine, pièges, plan d'exécution, checklist qualité) ; le modèle
  choisi l'**exécute proprement** : le plan devient une liste de tâches cochée au fil de l'eau.
- **Boosters réservés aux modèles gratuits** (activables pour les payants) : `think` (réflexion structurée),
  `ask_experts` (3 modèles gratuits en parallèle + arbitre), `deep_think` (problème difficile confié au plus puissant
  modèle gratuit), `verify_answer` (relecture critique), `guru` (stratégie d'une sous-tâche).
- **Relecture critique automatique** : un autre modèle gratuit vérifie la réponse et les livrables (contre la checklist
  du Guru) ; une passe de correction est lancée si nécessaire, la première version reste consultable.
- Calculs obligatoirement faits par Python / JavaScript, effort de raisonnement renforcé sur les tâches complexes.
- **Mémoire d'expérience** : chaque tâche outillée est mémorisée (étapes, outils, erreurs corrigées, leçons de la
  relecture) et réutilisée par REA — page **Expérience**.
- **Découverte d'outils sur Internet** (`discover_tools`) : catalogue Cortex, registre officiel des serveurs MCP, annuaire
  des API publiques gratuites, GitHub, npm ; `connect_mcp` branche un serveur MCP distant (ex. DeepWiki, Context7) et
  active ses outils aussitôt.
- Exemple mesuré (Nemotron 3.5 Super gratuit) : analyse de perte attendue d'un portefeuille + Excel + note — stratégie
  du Guru (formule Bâle, HHI, pièges), calculs vérifiés, erreur détectée et corrigée seul, relecture validée (224 s, 0 $).
- Chaque booster consomme des **requêtes gratuites** OpenRouter (50/jour sans crédit, 1 000/jour avec 10 $ de crédit) :
  tout est réglable dans Réglages › Harness › Intelligence des modèles.
- Arguments d'outils mal formés **réparés** (JSON) et **normalisés** (noms de paramètres approximatifs, types).
- Détecteur de boucles, skills experts injectés automatiquement, consignes de qualité, vérification visuelle.
- Exemple mesuré : fusion de PDF + filigrane par un modèle gratuit passée de 113 s (5 erreurs) à 14 s (0 erreur).

### Entrées — tous formats
- Images, **vidéos** (images clés extraites), **audio** (transcrit si le modèle ne l'entend pas), PDF, Word,
  Excel (**xlsx, xlsm, xlsb**, xls, ods), **PowerPoint**, **zip**, code, CSV… ; chaque pièce jointe est aussi copiée
  dans `uploads/` pour Python.
- **Gros classeurs** : la conversation reçoit un aperçu structuré (dimensions de chaque feuille + 25 premières lignes) et
  l'analyse complète se fait en Python ; la base de connaissances indexe toujours le contenu intégral.
- Python installe seul les dépendances, y compris les **moteurs implicites de pandas** (`pyxlsb` pour .xlsb, `openpyxl`,
  `xlrd`, `odfpy`).
- Python ne reçoit que les fichiers **nouveaux ou modifiés** depuis l'exécution précédente (son disque les garde), en
  commençant par ceux que le code cite : les tables produites restent visibles même dans un espace de travail chargé ;
  délai minimal de 3 min par exécution pour l'analyse de données.
- **Pont de modalités** : un modèle « vision » décrit images et vidéos aux modèles qui ne les voient pas.

### Skills (savoir-faire chargeables)
- 12 skills intégrés (REA enrichi : atelier d'outils et exploration de projets open source GitHub) : **REA — Reverse Engineer Anything**, Excel, Word, PDF, PowerPoint, Vidéo,
  **Blender & 3D**, **Développement (mode Cursor)**, **API gratuites**, Contrôle visuel, Analyse de données,
  Ratios prudentiels (RWA, Bâle).
- **REA** applique la méthode de rétro-ingénierie en 5 étapes (une fonctionnalité à la fois, choix des outils
  selon la cible, résumé d'abord, constats étiquetés ✅ vu / 🔶 déduit / ❓ inconnu, reconstruction testée),
  uniquement sur ce que l'on possède, a le droit d'examiner ou qui est public. Inspiré de
  [morluto/rea](https://github.com/morluto/rea) (MIT) ; l'outil officiel s'utilise en local avec Claude Code, Cursor…
- Activation **automatique** selon votre message, ou à la demande (`load_skill`) : le skill injecte sa méthode
  et **active ses outils** en cours d'exécution.
- Import de vos skills au format **SKILL.md** (Claude, Cursor…), `.zip` (avec fichiers) ou `.json` ; éditeur intégré.

### Code (façon Cursor) et vérification visuelle
- Page **Code** : éditeur **Monaco** (celui de VS Code), onglets, exécution JS / Python / HTML,
  **modifications par l'IA en diff** (accepter / rejeter), corriger, expliquer, commenter, générer des tests.
- Outil **visual_check** : rend une page, un graphique, un Excel, un Word, un PowerPoint, un PDF ou une vidéo,
  en fait une **capture d'écran** avec les **erreurs JavaScript**, et la transmet au modèle (ou la fait décrire
  par un modèle vision) — l'équivalent navigateur d'un Node.js + Playwright.
- **Aperçu Excel fidèle** : le classeur est lu directement (polices, remplissages en dégradé, bordures, fusions,
  largeurs, formats de nombre, statuts colorés, barres d'avancement, logo) et ses **graphiques natifs sont dessinés**
  à partir des données du fichier — le modèle voit le livrable tel qu'Excel l'affiche (`page` = n° de feuille).
- `run_javascript` : paquets **npm** via `await import('https://esm.sh/paquet')`.

### Blender & 3D
- Outil **create_3d** : scène Three.js interactive, export **GLB automatique** (Blender : Fichier › Importer ›
  glTF 2.0), boutons **OBJ / STL** (impression 3D) / PNG, capture renvoyée au modèle.
- Le skill Blender écrit aussi des **scripts Blender Python (bpy)** prêts à exécuter dans Blender.

### API gratuites (sans clé)
Outil **free_api** : météo et qualité de l'air, géocodage, fiches pays, jours fériés, **Banque mondiale**,
taux de change (dont XOF), cryptomonnaies, Wikipédia / Wikidata, publications (Crossref, OpenAlex), livres,
npm, PyPI, GitHub, lever du soleil, horaires de prière, Coran, séismes, NASA, traduction, dictionnaire,
Open Food Facts, espèces (GBIF), QR codes, images gratuites…

### Harness d'agents
- **Boucle agentique** : le modèle enchaîne appels d'outils → observation → nouvelle étape, jusqu'à la fin
  de la tâche (nombre d'étapes et **budget en $ par réponse** plafonnés).
- **Outils intégrés** : recherche web (avec sources), lecture de pages, requêtes HTTP, **JavaScript** et
  **Python (Pyodide : numpy, pandas, matplotlib…)** dans un bac à sable, **espace de fichiers** persistant
  (lire / écrire / modifier / chercher), **artefacts** (pages HTML, SVG, Mermaid affichés en direct),
  **plan de tâches** (todo), **question à l'utilisateur**, mémoire, base de connaissances, génération d'images.
- **Sous-agents** : un orchestrateur délègue des sous-tâches à des agents spécialisés **en parallèle**.
- **Permissions** : mode *Demander* / *Auto* / *Plan* / *Lecture seule* (**Maj+Tab** pour changer), permission par
  outil, validation avec **arguments modifiables** avant exécution.
- **Mode Plan** (comme Claude Code) : l'agent analyse sans rien modifier puis présente son plan ; boutons
  « Approuver et exécuter » / « Approuver (confirmer chaque action) » / « Modifier le plan ».
- **Ligne d'état** : mode · modèle · contexte % · coût · intelligence active (REA, Guru, boosters, relecture, expériences).
- **Affichage Terminal** (style Claude Code) : `⏺ Outil(arguments)` / `⎿ résultat`, plan en cases ☐ ☒ (commande `/terminal`).
- **Commandes** : `/init` (CORTEX.md), `/plan`, `/review`, `/guru`, `/experts`, `/cost`, `/context`, `/clear`,
  `/experience`, `/memory`, `/skills`, `/tools`, `/design`, `/terminal`, `/help`…
- **Hooks** JavaScript : réécrire les requêtes, bloquer un appel d'outil, masquer des données dans les
  résultats, post-traiter les réponses.
- **Serveurs MCP** (Model Context Protocol, transport HTTP) et **outils personnalisés** en JavaScript
  (modèles fournis : météo, Wikipédia, taux de change).
- **Gestion du contexte** : jauge de remplissage, **compaction automatique** par résumé, troncature,
  « middle-out » OpenRouter.
- **Trace d'exécution** : chronologie de chaque appel (modèle, outil, hook), durées, tokens, coûts,
  requêtes et réponses brutes.
- Garde-fou **anti-boucle**, nouvelles tentatives automatiques (429/5xx), **repli** des modèles gratuits saturés.
- **Détecteur de boucles de répétition** : un modèle qui « radote » (raisonnement ou réponse qui se répète)
  est interrompu puis relancé en mode réponse directe.
- **Réparation automatique** des arguments JSON mal formés par les petits modèles.
- **Points de restauration** : chaque réponse mémorise l'état des fichiers qu'elle modifie ; menu « Annuler les
  modifications de fichiers ».
- **Instructions de projet** : un fichier `CORTEX.md` (ou `AGENTS.md`) dans l'espace de travail est lu par tous les agents.
- `fetch_url` lit aussi les PDF/Word/Excel en ligne et peut répondre à une question ciblée sur une page.

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
- **Solde OpenRouter** affiché en permanence dans la barre de gauche (vert / orange / rouge), détail au clic
  (crédits, consommation du jour et du mois, limite de la clé), actualisé après chaque réponse.
- Coût et tokens par message, par conversation, par modèle et par jour ; export CSV.

## ℹ️ Limites d'une application navigateur
Node.js, Cursor et Blender sont des logiciels de bureau : ils ne peuvent pas s'exécuter dans une page web.
Cortex fournit leurs équivalents dans le navigateur (exécution JS/Python isolée + captures d'écran,
éditeur Monaco avec diff IA, scènes 3D exportées en GLB/OBJ/STL et scripts Blender Python).

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
| 🎨 Studio Image | Images (gratuites ou premium) et vidéos |
| 🎓 Professeur | Pédagogie, quiz interactifs, présentations |
| 📑 Studio Office | Excel, Word, PowerPoint, PDF professionnels vérifiés visuellement |
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
