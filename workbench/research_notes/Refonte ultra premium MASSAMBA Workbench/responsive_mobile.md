# Responsive et mobile pour un atelier IA (chat + 12 rubriques + tableaux de bord) — état de l'art 2025-2026

Veille faite le 15/10/2026. Cible : SPA React + Tailwind v4, téléphone de 390 px de large et bureau. Les dates indiquées sont celles des sources (publication ou dernière mise à jour connue). « (non revérifié) » signale une donnée tirée de la connaissance générale, avec un lien vers la référence primaire, mais pas relue pendant cette veille.

## 1. Comment se comportent ChatGPT, Claude, Perplexity et Gemini dans un navigateur mobile (navigation, compositeur, clavier, sélecteurs)

### Takeaway
Les grandes applications de chat utilisent un **tiroir latéral (drawer) pour l'historique** et non une barre d'onglets en bas. Leur compositeur est collé en bas et suit le clavier grâce à une **variable de hauteur du clavier calculée via `visualViewport`**, parce qu'iOS ignore `interactive-widget` et que `100dvh` ne rétrécit pas quand le clavier s'ouvre. Les outils et modèles sont rangés dans des **feuilles (bottom sheets) ou des menus déroulants** ouverts depuis le compositeur. Aucune documentation officielle d'OpenAI, d'Anthropic, de Perplexity ou de Google ne décrit ces implémentations : ce qui suit vient d'inspections de tiers.

### Cited Findings
- **ChatGPT (inspection du DOM par un tiers, 24/09/2026)** : la racine de défilement est complétée par `var(--screen-keyboard-height)`, un retrait égal à la hauteur du clavier et suivi par `visualViewport`. L'éditeur porte `data-virtualkeyboard="true"`, l'auteur y voit l'API VirtualKeyboard sur Chromium. Hauteur maximale observée pour la saisie : `max(30svh, 5rem)`, et une autre valeur de `13rem`. — [mieweb/ui issue #494, 24/09/2026](https://github.com/mieweb/ui/issues/494)
- **Claude (claude.ai, même source)** : l'éditeur a `enterkeyhint="enter"`. Le texte saisi utilise un plancher de taille de police (`--cds-font-size-text-entry-floor`) pour **éviter le zoom automatique d'iOS au focus**. La saisie est plafonnée à `24rem` et toute la surface du compositeur porte `cursor-text`. — [mieweb/ui issue #494, 24/09/2026](https://github.com/mieweb/ui/issues/494)
- **iOS** : Safari iOS et WKWebView **ignorent `interactive-widget=resizes-content`**, et `100dvh` **ne rétrécit pas** quand le clavier s'ouvre : iOS fait défiler tout le document pour montrer le champ. Sur iOS, `vh` correspond au grand viewport ; un `max-height` exprimé en `vh` laisse donc la saisie déborder sous le clavier. Sur Chrome Android, `autoFocus` ouvre le clavier à chaque navigation. — [mieweb/ui issue #494, 24/09/2026](https://github.com/mieweb/ui/issues/494)
- **Écart dû à la zone sûre quand le clavier est ouvert** : une marge `env(safe-area-inset-bottom)` laisse un vide d'environ 42 px sur iPhone pendant que le clavier est ouvert. Le correctif remet cette marge à 0 tant que le clavier est visible. — [1sl2tp/chat PR #143](https://github.com/1sl2tp/chat/pull/143) (date non relevée). iOS continue de renvoyer `env(safe-area-inset-bottom)` même quand le clavier couvre l'indicateur d'accueil. Sans `viewport-fit=cover`, les valeurs `env(safe-area-*)` valent 0 sur iPhone. — synthèse de PR de projets tiers : [rome-os/rome PR #586](https://github.com/rome-os/rome/pull/586), [scottmsilver/gmail-search PR #48](https://github.com/scottmsilver/gmail-search/pull/48) (2026, dates exactes non relevées)
- **Chrome Android depuis la version 108 (novembre 2022)** : par défaut, le clavier ne redimensionne plus que le *visual viewport* (`resizes-visual`), comme sur iOS. Les unités relatives au viewport restent alors stables, et les éléments `position: fixed` peuvent être masqués par le clavier. `interactive-widget=resizes-content` rétrécit aussi le *layout viewport* : les unités du viewport rapetissent et la mise en page remonte. `overlays-content` ne redimensionne rien, le clavier recouvre le contenu. Cette clé n'a pas d'effet dans Chrome iOS/iPadOS et ne touche pas les WebView. — [Chrome for Developers, « Prepare for viewport resize behavior changes », màj 28/10/2022](https://developer.chrome.com/blog/viewport-resize-behavior)
- **Prise en charge de `interactive-widget` (caniuse, consulté en 10/2026)** : Chrome Android oui, Firefox Android oui (dernière version listée : 150). Safari macOS et iOS : non (jusqu'à 26.5 compris). Firefox desktop : non. Les navigateurs de bureau n'ont de toute façon pas de clavier virtuel dans le cas courant. — [caniuse : interactive-widget](https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget)
- **API VirtualKeyboard** : `navigator.virtualKeyboard.overlaysContent = true`, l'événement `geometrychange` et les variables CSS `env(keyboard-inset-top|right|bottom|left|width|height)`. MDN donne l'exemple d'une grille de chat avec une rangée `"keyboard" env(keyboard-inset-height, 0px)`. L'API est **expérimentale**, n'a pas le statut Baseline, est limitée à Chromium et demande un contexte sécurisé (HTTPS). — [MDN, VirtualKeyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)
- **Gemini (application Android)** : en 2025, le sélecteur de modèle est passé en bas à droite de la barre de saisie, avec un bouton « + » qui réunit pièces jointes et choix du modèle dans une même feuille. La refonte de mai 2026 a ramené le sélecteur dans un menu déroulant en haut à gauche et placé le changement de compte en bas du tiroir de navigation. — [Gadget Hacks (2025)](https://android.gadgethacks.com/news/google-gemini-android-app-gets-major-ui-overhaul/) ; [9to5Google, 03/05/2026](https://9to5google.com/2026/05/03/gemini-full-redesign/)
- **ChatGPT** : la barre latérale repliable regroupe l'historique et peut rester épinglée sur bureau. Sur mobile, le menu des outils s'ouvre dans une **feuille en bas d'écran**. Ces informations viennent de sources secondaires et non d'OpenAI. — [ai-toolbox, guide de la barre latérale ChatGPT](https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-sidebar-redesign-guide) ; [IntuitionLabs, comparatif des interfaces de chat 2025](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)

### Inferences
- **Recette « clavier » en 3 couches**, déduite des constats ci-dessus :
  1. Balise : `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`. Sur Chrome et Firefox Android, la mise en page remonte toute seule.
  2. Repli iOS : on écoute `visualViewport` (`resize` et `scroll`) et on calcule `--kb = max(0, innerHeight − vv.height − vv.offsetTop)`, écrit sur `:root`. Ce calcul donne 0 sur Android avec `resizes-content`, où `innerHeight` rétrécit aussi, et la hauteur du clavier sur iOS. Une seule règle CSS couvre donc les deux plateformes : `padding-bottom: var(--kb)` sur la coquille.
  3. Zone sûre : `padding-bottom: max(env(safe-area-inset-bottom), .5rem)` quand le clavier est fermé, `.5rem` quand il est ouvert (`[data-kb="open"]`, déclenché si `--kb` > 80 px). On supprime ainsi l'écart d'environ 34 à 42 px.
- **Saisie** : `font-size: max(16px, 1rem)`, le plancher de 16 px évitant le zoom d'iOS au focus. Ajouter `max-height: min(40svh, 24rem)` ; sur iOS, `svh` reste prudent alors que `vh` déborde. Mettre `enterkeyhint="send"` ou `"enter"` selon la touche Entrée voulue. Ne pas appeler `autoFocus` sur mobile, pour ne pas ouvrir le clavier à chaque changement de rubrique.
- Hauteur de la coquille : `height: 100dvh` avec repli `100vh`. Ne pas compter sur `dvh` pour suivre le clavier, la variable `--kb` s'en charge.
- **Critère d'acceptation proposé** : sur une simulation iPhone 390×844 et sur Pixel, clavier ouvert, l'écart entre le bas du compositeur et le haut du clavier est compris entre 0 et 8 px ; aucun défilement horizontal ; le dernier message reste visible au-dessus du compositeur.

### Gaps
- Aucune documentation officielle (OpenAI, Anthropic, Perplexity, Google) ni démontage public récent et fiable du web mobile de Claude ou de Perplexity : la navigation (tiroir, barre du bas) et l'emplacement du sélecteur de modèle de claude.ai et perplexity.ai sur mobile restent **non sourcés**.
- Largeur maximale exacte des messages dans ChatGPT et Claude sur bureau : la valeur souvent observée (~48rem / 768px) **n'a pas été vérifiée** pendant cette veille.
- Les observations sur ChatGPT et Claude reposent sur une seule inspection de DOM par un tiers (09/2026) et peuvent changer sans préavis.

## 2. Navigation pour de nombreuses rubriques (12) sur mobile : barre du bas, feuille « Plus », palette de commandes

### Takeaway
La barre de navigation du bas accepte **3 à 5 destinations**. Material 3 recommande d'utiliser un tiroir au-delà de 5, et NN/g a montré que cacher la navigation principale **divise presque par deux sa découvrabilité**. Pour 12 rubriques, la bonne solution est **mixte** : 4 rubriques visibles et un 5e onglet « Plus » qui ouvre une feuille, plus une palette de commandes (recherche) pour l'accès direct. La navigation s'adapte à la largeur : barre en mode compact, rail en mode moyen, tiroir ou barre latérale en mode étendu.

### Cited Findings
- **Material 3 (Android Compose)** : la barre de navigation sert pour **3 à 5 destinations d'importance égale**, en fenêtre compacte, avec des destinations constantes d'un écran à l'autre. Libellés : avec 3 destinations, icône et libellé partout ; avec 4, libellé obligatoire sur l'onglet actif et recommandé sur les autres ; avec 5, libellé sur l'onglet actif. — [Android Developers, Navigation bar (Compose)](https://developer.android.com/develop/ui/compose/components/navigation-bar) (consulté 10/2026) ; [Compose Multiplatform API NavigationBar](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-navigation-bar.html)
- Le système Fiori de SAP pour Android parle de 2 à 5 destinations, et demande un tiroir de navigation au-delà de 5. — [SAP Fiori for Android, Navigation bar (v25.x)](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/navigation-bar/usage)
- **Material 3 Expressive (mai 2025)** : « l'ancienne » barre de navigation est dépréciée au profit de la **flexible navigation bar**, plus basse. Elle peut afficher le libellé à côté de l'icône en fenêtre moyenne. Selon une copie de la documentation Android, sa hauteur passe de **80 dp à 64 dp** et l'indicateur actif de 64 à 56 dp, chiffres **non confirmés sur la page officielle**. — [9to5Google, 14/05/2025](https://9to5google.com/2025/05/14/material-3-expressive-navigation/) ; [copie de la doc material-components-android BottomNavigation.md](https://gitea.com/784622644/material-components-android/src/branch/master/docs/components/BottomNavigation.md)
- **Classes de taille de fenêtre** (largeur) : compact < 600 dp, moyen de 600 à moins de 840 dp, étendu ≥ 840 dp. Navigation recommandée : barre en compact, rail en moyen, tiroir en étendu. `NavigationSuiteScaffold` fait ce choix automatiquement. — [Android Developers, Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes) ; [Material Design blog, 29/04/2023](https://m2.material.io/blog/material-you-large-screens)
- **NN/g (étude quantitative, 6 sites, 179 participants, 2016)** : cacher la navigation principale divise presque par deux sa découvrabilité, allonge les tâches et augmente la difficulté perçue. L'effet est **plus fort sur bureau que sur mobile**. — [NN/g, « Hamburger Menus and Hidden Navigation Hurt UX Metrics » (2016)](https://www.nngroup.com/articles/hamburger-menus/) ; [méthodologie](https://www.nngroup.com/articles/hidden-navigation-methodology/)
- NN/g, article plus récent : l'icône hamburger est aujourd'hui largement reconnue comme un menu caché, mais **cacher la navigation ajoute toujours un coût d'interaction**. La saillance visuelle, l'odeur d'information (*information scent*), le contexte et les indices d'actionnabilité jouent aussi. — [NN/g, « The Hamburger-Menu Icon Today: Is it Recognizable? »](https://www.nngroup.com/articles/hamburger-menu-icon-recognizability/) (date non relevée) ; [NN/g, « Beyond the Hamburger… on Mobile »](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/)
- La barre d'onglets se limite à **5 entrées au plus**. L'onglet « Plus » s'ouvre en menu déroulant ou mène à un écran de navigation séparé. La **navigation combinée** (une partie visible, le reste caché) est la voie médiane recommandée. — [Webdesigner Depot, « 5 Smart Alternatives to the Hamburger Menu » (2017)](https://www.webdesignerdepot.com/2017/08/5-smart-alternatives-to-the-hamburger-menu/)

### Inferences
- **Plan pour 12 rubriques**, en fusionnant les règles M3 et NN/g :
  - **< 600 px** : barre du bas à 5 positions = 4 rubriques les plus utilisées (par exemple Chat, Tableaux de bord, Données, Exports) et « Plus ». « Plus » ouvre une feuille avec les 8 autres rubriques en grille 2×4, chaque tuile mesurant au moins 48 px avec icône et libellé. L'historique des conversations reste dans un tiroir ouvert depuis l'en-tête du chat, comme ChatGPT et Claude.
  - **600–1023 px** : rail vertical de 72 à 80 px, icône et libellé court, avec les 12 rubriques groupées par section ou en défilement.
  - **≥ 1024 px** : barre latérale complète repliable.
- **Palette de commandes** (Ctrl/⌘+K sur bureau, bouton loupe dans l'en-tête sur mobile) : elle donne accès en un geste aux 12 rubriques et aux actions. La palette **s'ajoute** à la navigation visible et ne la remplace pas, puisque NN/g a montré qu'une navigation cachée est moins découverte.
- **Innovation proposée : un onglet « Plus » adaptatif.** La feuille trie les 8 rubriques par fréquence d'usage locale (stockée par l'utilisateur) et affiche un badge sur l'onglet « Plus » quand une rubrique cachée a une activité (export prêt, tâche terminée). On limite ainsi le coût de découvrabilité mesuré par NN/g. Critère d'acceptation : chaque rubrique est accessible en 2 taps au plus, les 4 plus fréquentes en 1 tap ; aucun événement d'une rubrique cachée ne passe inaperçu, grâce au badge visible sur « Plus ».
- Correspondance avec Tailwind v4 : le point de rupture `sm` = 640 px est proche du seuil compact M3 de 600 px. Pour s'aligner sur M3, on peut ajouter `--breakpoint-compact: 37.5rem` (600 px) et `--breakpoint-expanded: 52.5rem` (840 px) dans `@theme` (voir §4).

### Gaps
- Aucune page NN/g récente (2025-2026) consacrée à la barre du bas avec « Plus » n'a été trouvée. La règle des 5 entrées au plus vient de Material, de SAP et de sources secondaires.
- Les dimensions exactes de la barre M3 Expressive (64 dp) n'ont pas été confirmées sur m3.material.io.

## 3. Règles exactes d'accessibilité (cibles, focus, contraste, mouvement, contraste forcé)

### Takeaway
La base légale reste **WCAG 2.2 (Recommandation W3C du 05/10/2023)**. Les cibles doivent mesurer **24×24 px CSS au minimum (AA)**, viser 44×44 pour les commandes importantes, et 44 pt chez Apple / 48 dp chez Material. Le focus ne doit **jamais être entièrement masqué** par un en-tête ou un compositeur collant (2.4.11 AA). Les contrastes restent à **4,5:1 pour le texte et 3:1 pour le grand texte et les éléments non textuels**. **APCA ne fait pas partie du brouillon WCAG 3** (méthode de contraste encore « à déterminer » en avril 2026).

### Cited Findings
- **2.5.8 Target Size (Minimum), niveau AA** : « The size of the target for pointer inputs is at least 24 by 24 CSS pixels ». Il faut qu'un carré plein de 24×24 tienne dans la cible. Exceptions :
  1. Espacement : un cercle de 24 px de diamètre centré sur chaque cible trop petite ne doit croiser ni une autre cible ni le cercle d'une autre cible trop petite.
  2. Équivalent : la même fonction existe sur la page avec une commande conforme.
  3. En ligne : cible dans une phrase.
  4. Contrôle par l'agent utilisateur : cible non modifiée par l'auteur.
  5. Essentiel : présentation imposée par l'information ou par la loi.

  Le W3C conseille de viser 2.5.5 (Enhanced) pour les commandes importantes. — [W3C, Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **2.5.5 Target Size (Enhanced), niveau AAA** : 44×44 px CSS. Ces seuils sont liés à la taille moyenne du bout du doigt (environ 10 mm). — [Adrian Roselli, « Target Size and 2.5.5 » (06/2019)](https://adrianroselli.com/2019/06/target-size-and-2-5-5.html) ; [W3C Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) (non revérifié)
- **Apple HIG** : zone touchable d'au moins **44×44 pt** sur iOS. **Material** : **48×48 dp**. Une icône peut rester petite si un `padding` étend sa zone touchable. — [Deque, règle attest-iOS touch-target-size](https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size) ; [Apple HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (page Apple non relue)
- **2.4.11 Focus Not Obscured (Minimum), niveau AA** : « When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content ». Un masquage partiel est admis. L'échec **F110** correspond à un en-tête ou pied de page collant qui cache entièrement l'élément focalisé. La technique suffisante **C43** consiste à utiliser **`scroll-padding`** pour que l'élément focalisé ne se retrouve pas sous un bandeau fixe. Au niveau AAA (*Enhanced*), aucune partie de l'élément focalisé ne doit être masquée. — [W3C, Understanding SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- **2.4.13 Focus Appearance, niveau AAA** : l'indicateur de focus doit couvrir une zone **au moins égale à un périmètre de 2 px CSS** autour du composant non focalisé, et présenter un **contraste ≥ 3:1** entre l'état focalisé et l'état non focalisé des mêmes pixels. Exceptions : indicateur fourni par l'agent utilisateur et non modifiable, ou indicateur et fond non modifiés par l'auteur. **2.4.7 Focus Visible (AA)** exige qu'un indicateur de focus clavier soit visible. — [W3C, Understanding SC 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- **Contraste 1.4.3 (AA)** : 4,5:1 pour le texte normal, 3:1 pour le grand texte (≥ 18 pt, ou 14 pt en gras). **1.4.11 Non-text Contrast (AA)** : 3:1 pour les composants d'interface et les éléments graphiques porteurs de sens. — [W3C Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) ; [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) (non revérifiés)
- **APCA et WCAG 3** : APCA a été retiré du brouillon de juillet 2023, comme contenu exploratoire sans soutien du groupe de travail. Le brouillon actuel indique que l'algorithme de contraste de WCAG 3 reste **« à déterminer »** (avril 2026). WCAG 3 est un brouillon incomplet, avec une version publiée en 03/2026 ; une Recommandation n'est pas attendue avant plusieurs années, au plus tôt en 2027 selon des estimations non officielles. — [Adrian Roselli, « WCAG3 Contrast as of April 2026 »](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html) ; [W3C, WCAG 3 Working Draft, 03/03/2026](https://www.w3.org/WAI/news/2026-03-03/wcag3) ; [W3C, WCAG 3 Introduction](https://w3.org/WAI/WCAG3)
- **`prefers-contrast`** : Baseline « largement disponible », dans tous les navigateurs **depuis mai 2022**. La valeur `more` s'active notamment avec le réglage macOS « Augmenter le contraste ». **`forced-colors`** : Baseline largement disponible **depuis septembre 2022**. Selon Smashing (2022), seul Windows permet vraiment de choisir un thème de couleurs forcées ; macOS, iOS et Android n'en ont pas. — [MDN prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast) ; [MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) ; [Firefox source docs, HCM media queries](https://firefox-source-docs.mozilla.org/accessible/HCMMediaQueries.html) ; [Smashing Magazine, 03/2022](https://smashingmagazine.com/2022/03/windows-high-contrast-colors-mode-css-custom-properties)
- **`prefers-reduced-motion`** : à respecter pour les transitions, notamment les View Transitions et les animations de feuilles. — [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) (non revérifié pendant cette veille)

### Inferences
- **Règle maison proposée** : toute cible tactile mesure **≥ 44×44 px CSS** sur mobile, ce qui atteint le niveau AAA et l'exigence Apple. Le minimum absolu est de 24×24 avec espacement sur bureau en mode dense. Sur Tailwind : `min-h-11 min-w-11` (44 px) pour les boutons-icônes du compositeur et de la barre du bas, et `size-6` minimum pour les contrôles denses sur bureau.
- **Compositeur collant et 2.4.11** : appliquer `scroll-padding-bottom: calc(var(--composer-h) + var(--kb, 0px))` sur le conteneur de défilement et `scroll-padding-top: var(--header-h)`. Mesurer `--composer-h` avec un `ResizeObserver`. Cette technique C43 garantit que le focus clavier ne passe jamais sous le compositeur ni sous la barre du bas.
- **Focus visible** : `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`, avec une couleur de focus à ≥ 3:1 contre les deux fonds (clair et sombre). On vise ainsi 2.4.13 (AAA) à faible coût.
- **Couleurs forcées** : `@media (forced-colors: active) { … }`. Remplacer les bordures et ombres porteuses de sens par `border: 1px solid CanvasText`, utiliser `Highlight` pour l'état sélectionné et ne pas cacher les icônes SVG (`fill: currentColor`).
- **Contraste** : rester sur les ratios WCAG 2.x (4,5:1 et 3:1) comme règle de conformité. APCA peut servir d'indicateur interne de lisibilité, sans valeur réglementaire.

### Gaps
- Les pages Apple HIG et Material « Accessibility / touch targets » n'ont pas été relues directement : 44 pt et 48 dp viennent de sources secondaires concordantes.
- Il n'a pas été confirmé que Safari prend en charge `forced-colors` en dehors du badge Baseline de MDN.

## 4. Techniques CSS 2025-2026 et compatibilité navigateurs

### Takeaway
Tout ce qu'il faut pour une coquille mobile moderne est désormais **Baseline**. Les requêtes de conteneur sont *largement disponibles* depuis 08/2025. `dvh`, `svh` et `lvh` fonctionnent depuis Chrome 108, Firefox 101 et Safari 15.4. `:has()` est arrivé en Firefox 121. Les View Transitions dans un même document sont Baseline depuis 10/2025, le positionnement par ancre depuis 01/2026 (Firefox 147) et `scrollbar-gutter` depuis 12/2024. Le Popover API l'est depuis le 27/01/2025. **`text-wrap: pretty` n'est pas pris en charge par Firefox**, il faut donc le traiter comme une amélioration progressive.

### Cited Findings
- **`dvh`/`svh`/`lvh`** : Chrome 108, Edge 108, Firefox 101, Safari 15.4. Sur bureau, les trois valent `vh`. — [web.dev, « The large, small, and dynamic viewport units »](https://web.dev/blog/viewport-units) (2022)
- **Requêtes de conteneur (taille)** : Baseline *nouvellement disponible* en **février 2023**, *largement disponible* en **août 2025**. Les *style queries* ont un statut contradictoire selon les sources (Baseline 2025 ou mai 2026), donc non tranché. — [web.dev, Baseline 2023](https://web.dev/blog/baseline2023) ; [synthèse Baseline 2025](https://www.youngju.dev/transcribe/culture/2026-04-15-web-platform-2025-complete-guide-container-queries-has-selector-nesting-subgrid-popover-anchor-positioning-webgpu-wasi-speculation-rules-baseline-deep-dive-guide-2025.en) (04/2026, source secondaire)
- **`:has()`** : Chrome/Edge 105, Safari 15.4, Firefox 121 (Firefox 121 est sorti en décembre 2023). — [Chrome for Developers, « :has() case studies »](https://developer.chrome.google.cn/blog/css-ui-ecommerce-has)
- **View Transitions dans un même document** : Baseline *nouvellement disponible* avec **Firefox 144** (billet web.dev du 16/10/2025). Le lot comprend `document.startViewTransition()`, `view-transition-name`, `view-transition-class`, `view-transition-name: match-element` et `:active-view-transition`. Cette fonction fait partie d'Interop 2025. — [web.dev, 16/10/2025](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available) ; [web.dev, New in October 2025](https://web.dev/blog/web-platform-10-2025)
- **Positionnement par ancre (CSS Anchor Positioning)** : Baseline *nouvellement disponible* avec **Firefox 147 (janvier 2026)** ; Safari 26 ; Chrome/Edge 125. **Avertissement** : Adobe (avril 2026) juge le support « limité » pour l'ancrage entre arbres Shadow DOM. — [web.dev, New in January 2026](https://web.dev/blog/web-platform-01-2026) ; [web.dev, New in September 2025](https://web.dev/blog/web-platform-09-2025) ; [Adobe Shadow DOM CSS, Anchor Positioning (04/2026)](https://shadow-dom-css.adobe.com/features/anchor-positioning/)
- **Popover API** : Baseline depuis le **27/01/2025** (Safari 18.3 a corrigé la fermeture par clic extérieur sur iOS/iPadOS). web.dev a corrigé son annonce d'avril 2024 ; MDN affiche encore « Baseline 2024 ». — [web.dev, « The Popover API is now Baseline Newly available »](https://web.dev/blog/popover-baseline)
- **`scrollbar-gutter`** (et `scrollbar-width`) : Baseline 2024, disponible partout **depuis décembre 2024** (annonce web.dev le 01/02/2025). `stable` réserve la gouttière et évite le décalage de mise en page ; sans effet avec les barres de défilement superposées (mobile, macOS par défaut). — [web.dev, 02/2025](https://web.dev/blog/baseline-scrollbar-props) ; [MDN scrollbar-gutter](https://developer.mozilla.org/docs/Web/CSS/scrollbar-gutter)
- **`text-wrap: pretty`** : Safari ≥ 26.0, Chrome ≥ 117 (non revérifié), **Firefox non pris en charge** jusqu'à la version 158 listée par caniuse (10/2026). Sans prise en charge, le texte revient au retour à la ligne normal, sans casse. — [caniuse, text-wrap: pretty](https://caniuse.com/mdn-css_properties_text-wrap_pretty) ; [caniuse, text-wrap-style: pretty](https://caniuse.com/mdn-css_properties_text-wrap-style_pretty)
- **`text-wrap: balance`** : Baseline 2024 (Chrome 114, Firefox 121, Safari 17.5). — [caniuse, text-wrap: balance](https://caniuse.com/css-text-wrap-balance) (non revérifié)
- **`env(safe-area-inset-*)`** : demande `viewport-fit=cover` dans la balise viewport, sinon les valeurs valent 0 sur iPhone (voir §1). — [MDN, balise viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element) ; [caniuse, viewport-fit](https://caniuse.com/mdn-html_elements_meta_name_viewport_viewport-fit)
- **`overscroll-behavior`** (`contain` bloque l'enchaînement du défilement et le tirer-pour-rafraîchir) : disponible dans tous les moteurs depuis Safari 16 (2022). — [MDN overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior) (non revérifié)
- **Tailwind v4** :
  - Points de rupture *mobile-first* : `sm` 40rem (640 px), `md` 48rem (768 px), `lg` 64rem (1024 px), `xl` 80rem (1280 px), `2xl` 96rem (1536 px).
  - Variantes `max-*` (`max-md` = `width < 48rem`) et plages (`md:max-lg:`). Personnalisation dans `@theme` via `--breakpoint-*`, en gardant les mêmes unités (rem).
  - **Requêtes de conteneur natives** : `@container`, `@sm:`, `@max-md:`, conteneurs nommés `@container/main` + `@sm/main:`, `@container-size` pour les unités `cqb`.
  - Tailles de conteneur : `@3xs` 16rem, `@2xs` 18rem, `@xs` 20rem, `@sm` 24rem, `@md` 28rem, `@lg` 32rem, `@xl` 36rem, `@2xl` 42rem, `@3xl` 48rem, `@4xl` 56rem, `@5xl` 64rem, `@6xl` 72rem, `@7xl` 80rem.

  — [Tailwind CSS, Responsive design](https://tailwindcss.com/docs/responsive-design)
- **Typographie fluide (Utopia, `clamp()`)** : `utopia-core` (`calculateTypeScale()`) renvoie dans `wcagViolation` les viewports où un pas de l'échelle **ne peut pas être agrandi à 200 %** (WCAG 1.4.4). Un plafond `max()`/`clamp()` trop bas fait échouer 1.4.4. Une taille en `vw` seul ne grandit pas au zoom : il faut une valeur préférée qui **mélange `rem` et `vw`** et tester au zoom 200 %. — [npm utopia-core](https://npmjs.com/utopia-core) ; [Smashing Magazine, 11/2023](https://smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type) ; [Smashing Magazine, 12/2022](https://smashingmagazine.com/2022/12/fluid-typography-predict-problem-users-zoom-in/) ; [LogRocket / DEV](https://dev.to/logrocket/fluid-vs-responsive-typography-with-css-clamp-4j13)
- **`theme-color` avec `media`** : MDN décrit `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="…">` pour définir une couleur par thème. `prefers-color-scheme` : Chrome 76, Firefox 67, Safari 12.1. `color-scheme` : Chrome 81, Firefox 96, Safari 13. — [web.dev, color-scheme](https://web.dev/articles/color-scheme) ; [MDN HTMLMetaElement.media](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMetaElement/media)

### Inferences
- **Socle CSS proposé** (toutes les règles sont Baseline sauf mention) :
  - `html { scrollbar-gutter: stable }` sur bureau.
  - Coquille `.app { height: 100vh; height: 100dvh }`.
  - Fil de chat `.thread { overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: var(--header-h) calc(var(--composer-h) + var(--kb,0px)) }`.
  - Titres `h1,h2,h3 { text-wrap: balance }`, paragraphes `p { text-wrap: pretty }` (amélioration progressive, ignoré par Firefox).
  - Tiroir et feuilles : `overscroll-behavior: contain`, plus `<dialog>` ou `popover` pour la fermeture en touchant à l'extérieur et la gestion du focus.
- **Menus du compositeur (modèle, outils)** : sur bureau, `popover` + positionnement par ancre (`position-anchor`, `position-try-fallbacks: flip-block`). Sur mobile, le même `popover` en feuille du bas (`inset: auto 0 0 0`). Garder un repli JS (Floating UI) uniquement si le menu sort d'un Shadow DOM.
- **Transitions entre rubriques** : `document.startViewTransition()` dans le routeur React, désactivé sous `@media (prefers-reduced-motion: reduce)` et quand l'API est absente, avec le test `if (!document.startViewTransition) update()`.
- **Composants en requêtes de conteneur plutôt qu'en requêtes média** : une tuile KPI ou un graphique s'adapte à la largeur de **sa colonne**, ce qui est indispensable quand la barre latérale de 12 rubriques est ouverte ou fermée. Avec Tailwind : `@container` sur la grille, puis `@sm:grid-cols-2 @3xl:grid-cols-4`.
- **Échelle typographique fluide** (exemple au format Utopia, 390 → 1280 px) : texte courant `clamp(1rem, 0.96rem + 0.18vw, 1.125rem)`, H1 `clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem)`. Les valeurs exactes sont à générer avec utopia.fyi, puis à valider au zoom 200 %. Critère : `wcagViolation` vide dans `utopia-core`.

### Gaps
- Le support exact de `theme-color` avec l'attribut `media` par navigateur (Chrome Android, Safari iOS) n'a pas été trouvé dans un tableau de compatibilité fiable.
- Le statut Baseline des *style queries* de conteneur est contradictoire selon les sources (2025 ou 05/2026).
- Les View Transitions entre documents (MPA) n'ont pas été vérifiées ; elles sont sans intérêt pour une SPA.

## 5. Replier une barre d'outils dense (7 contrôles ou plus) et garder des tableaux de bord lisibles sur téléphone

### Takeaway
Le modèle éprouvé est la **barre d'outils à débordement avec priorités** (SAP Fiori OverflowToolbar) : certaines actions ne débordent jamais, celles de priorité « basse » partent en premier dans un menu « … », les actions liées débordent ensemble. Il peut être réalisé en CSS pur avec des requêtes de conteneur. Pour les tableaux de bord mobiles, les sources de praticiens convergent : **3 à 5 KPI et 1 à 2 graphiques**, aucun défilement horizontal pour la vue principale, des graphiques simplifiés et des chiffres de KPI en 24–32 px.

### Cited Findings
- **SAP Fiori OverflowToolbar** : priorités par action, à savoir « NeverOverflow », « High », « Low », « AlwaysOverflow » et « Disappear ». Les actions « Low » débordent en premier, les « High » restent visibles jusqu'à ce que toutes les actions de moindre priorité soient passées dans le menu. À priorité égale, l'action la plus à droite part d'abord. Il est recommandé de ranger les boutons par fréquence d'usage, de gauche à droite. Une même valeur `group` fait déborder ensemble des actions non adjacentes. — [SAP Fiori for Web, Toolbar overview (v1.139)](https://www.sap.com/design-system/fiori-design-web/v1-139/ui-elements/toolbar-overview/usage)
- **NVIDIA Elements** : une requête de conteneur masque les actions de fin au-delà d'une largeur et affiche un bouton « plus d'actions » qui ouvre un menu déroulant, **sans JavaScript de mesure**. — [NVIDIA Elements, Responsive patterns](https://nvidia.github.io/elements/docs/patterns/responsive/)
- ServiceNow Horizon : la barre d'actions déborde vers un menu et y organise les actions par type de bouton. — [ServiceNow Horizon, Action bar](https://horizon.servicenow.com/workspace/components/now-record-common-uiactionbar)
- Gemini a regroupé pièces jointes et sélecteur de modèle derrière un bouton « + » de la barre de saisie (2025). Un analyste y voit une tension entre accès aux fonctions et simplicité visuelle. — [Gadget Hacks (2025)](https://android.gadgethacks.com/news/google-gemini-android-app-gets-major-ui-overhaul/)
- **Tableaux de bord mobiles (sources de praticiens et d'éditeurs BI, sans recherche contrôlée)** :
  - Un téléphone accueille environ **3 à 5 KPI et deux graphiques**. Commencer par **2 ou 3 cartes KPI avec tendance** et un graphique lisible d'un coup d'œil, et renvoyer les statistiques secondaires vers des écrans de détail.
  - Sparklines pour les tendances, barres pour les comparaisons ; supprimer légendes et libellés redondants ; une couleur plus une couleur d'accent.
  - Texte courant en **16–18 px**, chiffre des tuiles KPI en **24–32 px**.
  - Vue principale **sans défilement horizontal** ; tester sur appareil réel, car l'émulation DevTools trompe sur le toucher, le rendu des polices et les performances.

  — [The Bricks, Mobile dashboard best practices](https://www.thebricks.com/resources/best-practices-for-mobile-dashboard-design) ; [Querio, Dashboards for mobile users](https://querio.ai/articles/how-to-design-dashboards-for-mobile-users) ; [Infor Birst 2025.x, Guidelines for mobile design](https://docs.infor.com/birst/2025.x/en-us/birstolh/mobile_user/nsc1655271156432.html)

### Inferences
- **Compositeur à 390 px**, en appliquant le modèle de priorités SAP aux contrôles du chat :
  - *NeverOverflow* : champ de saisie, Envoyer/Stop, Joindre (« + »).
  - *High* : sélecteur de modèle, présenté comme une puce compacte avec le nom court.
  - *Low* : outils, mode (agent/plan), recherche web, température/effort, JEV, budget.
  - *Group* : les réglages de génération débordent ensemble.

  Le « … » ou le « + » ouvre une **feuille du bas** (popover) avec des sections libellées. Les contrôles font au moins 44 px.
- **Innovation proposée : des puces d'état.** Tout réglage caché dont la valeur n'est pas celle par défaut apparaît sous forme de **puce supprimable** au-dessus de la saisie (par exemple « Recherche web », « Budget 0,50 $ »). On cache les contrôles sans cacher l'état, ce qui corrige le défaut de découvrabilité mesuré par NN/g sur la navigation cachée.
  - Critère d'acceptation : à 390 px, la rangée du compositeur montre au plus 3 boutons-icônes en plus de la saisie ; 100 % des réglages différents de la valeur par défaut sont visibles en puces ; aucun contrôle sous 44×44 px.
- **Réalisation CSS sans mesure** : `@container composer (width < 28rem) { .prio-low { display: none } .more { display: inline-flex } }`, et la feuille « … » contient les mêmes contrôles (un seul état React, deux rendus).
- **Tuiles KPI** : grille en requêtes de conteneur, `grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr))`. À 390 px moins 2×16 px de marges, on obtient **2 tuiles par ligne** d'environ 171 px. Chaque tuile contient le libellé (12–13 px, deux lignes au plus avec `text-wrap: balance`), la valeur (24–28 px, chiffres tabulaires `font-variant-numeric: tabular-nums`), la variation et une mini sparkline.
- **Graphiques** : **réarranger plutôt que défiler**. Sous 28rem de conteneur : légende sous le graphique ou libellés directs, 4 à 5 graduations au plus, barres horizontales au lieu de colonnes pour les catégories aux libellés longs, hauteur d'environ 220–260 px. Le défilement horizontal reste **exceptionnel** et réservé aux longues séries temporelles et aux tableaux larges : conteneur `overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity`, axe Y et première colonne en `position: sticky`, avec un indice visuel (dégradé de bord).
- Critère global : à 390 px, `document.scrollingElement.scrollWidth <= innerWidth` sur les 12 rubriques. À vérifier avec un test Playwright par rubrique.

### Gaps
- Aucun article NN/g ou Material de 2025-2026 consacré spécifiquement aux tableaux de bord sur mobile n'a été trouvé. Les recommandations chiffrées (3–5 KPI, 24–32 px) viennent de blogs d'éditeurs et doivent être prises comme des règles empiriques.
- Il n'existe pas de nom de patron « Priority+ » documenté dans une source primaire récente : le modèle de priorités vient de SAP Fiori.

## 6. PWA : installation, manifeste, icônes masquables et `theme-color` pour une application HTML en un seul fichier ouverte en `file://`

### Takeaway
**Une PWA ne peut pas être installée depuis `file://`.** L'installation exige HTTPS, ou `http://localhost` / `127.0.0.1`, et les API liées (service worker, VirtualKeyboard) demandent un contexte sécurisé. En `file://`, seuls les réglages passifs restent utiles : balise viewport, `theme-color` et `color-scheme`. Pour une application installable, il faut la servir en local (`localhost`) ou depuis un hôte HTTPS, avec un manifeste complet.

### Cited Findings
- MDN : on ne peut installer une PWA que **servie en `https://`**, ou en local en **`http://` sur `127.0.0.1` / `localhost`**. La plupart des fonctions se testent en `file://`, **mais pas l'installation**. — [MDN, CycleTracker : Secure connection](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Secure_connection)
- Les PWA ne fonctionnent qu'en **contexte sécurisé** (localhost ou HTTPS). La portée du service worker doit couvrir le `start_url` du manifeste ; la portée par défaut du manifeste est son répertoire. — [liste W3C public-webapps-github, 01/2023](https://lists.w3.org/Archives/Public/public-webapps-github/2023Jan/0515.html) ; [DEV, « How to scope your PWA service workers »](https://dev.to/njromano/how-to-scope-your-pwa-service-workers-1n6m)
- **Critères d'installation de Chrome** (web.dev, màj 19/09/2024) :
  - application pas déjà installée ;
  - engagement : au moins un clic ou toucher, et au moins 30 s passées sur la page ;
  - **HTTPS** ;
  - manifeste avec `name` ou `short_name`, des **icônes de 192 px et de 512 px**, un `start_url` et un `display` parmi `fullscreen`, `standalone`, `minimal-ui` ou `window-controls-overlay`, et `prefer_related_applications` absent ou à `false`.

  La page ne cite **plus** le service worker parmi les critères. Captures d'écran et `description` sont recommandées pour une boîte d'installation plus riche. — [web.dev, Install criteria](https://web.dev/articles/install-criteria)
- **Icônes masquables** :
  - Le contenu important doit tenir dans un **cercle centré de rayon égal à 40 % de la largeur** de l'icône ; les 10 % du bord peuvent être rognés.
  - Déclarer des icônes séparées `"purpose": "any"` et `"purpose": "maskable"`. Il est **déconseillé** de combiner `"any maskable"` : la marge rend l'icône trop petite en mode `any`.
  - Outils de test : maskable.app (aperçu et éditeur) et Chrome DevTools > Application > Icons > « Show only the minimum safe area for maskable icons ».

  — [web.dev, Maskable icons](https://web.dev/articles/maskable-icon)
- **`theme-color` clair/sombre** : deux balises `<meta name="theme-color" media="(prefers-color-scheme: light|dark)">`, et `color-scheme` pour les contrôles natifs. — [MDN HTMLMetaElement.media](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMetaElement/media) ; [web.dev, color-scheme](https://web.dev/articles/color-scheme)
- L'API VirtualKeyboard est disponible **seulement en contexte sécurisé**, donc pas en `file://`. — [MDN, VirtualKeyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)

### Inferences
- **Pour le livrable actuel (HTML unique ouvert en `file://`)** :
  - Mettre `viewport-fit=cover` et `interactive-widget=resizes-content` dans la balise viewport, ajouter les deux `theme-color` (clair/sombre) et `<meta name="color-scheme" content="light dark">`.
  - Utiliser le repli `visualViewport` pour le clavier, qui fonctionne sans contexte sécurisé : c'est une inférence, la compatibilité de `visualViewport` en `file://` n'a pas été vérifiée.
  - Ne **pas** compter sur l'API VirtualKeyboard, le service worker ou l'installation.
- **Pour rendre l'application installable sans compte ni abonnement** : la servir sur `http://localhost` avec un petit serveur statique local (Node ou Python), avec à côté du HTML :
  - un `manifest.webmanifest` : `name` « MASSAMBA Workbench », `short_name` « MASSAMBA », `start_url` « ./ », `display` « standalone », `background_color`/`theme_color` ;
  - des icônes 192 et 512 en `any`, plus 192 et 512 en `maskable` avec le logo dans le cercle de 40 % ;
  - éventuellement des `screenshots` en `form_factor: "narrow"` et `"wide"`.

  Le dépôt est public et la consigne interdit de pousser : un hébergement HTTPS distant est donc à écarter sauf décision de l'utilisateur.
- Critère d'acceptation : en servant le fichier sur `localhost`, le panneau Application de Chrome DevTools ne signale aucune erreur de manifeste ; l'icône masquable passe le contrôle de la zone sûre ; la barre d'outils du navigateur Android prend la couleur du thème actif (clair ou sombre).

### Gaps
- Je n'ai pas trouvé de source qui confirme ou infirme l'installabilité d'un manifeste en ligne (`data:` ou `blob:` URL) dans un HTML en un seul fichier. À considérer comme non pris en charge tant que ce n'est pas testé.
- Le support par navigateur de l'attribut `media` sur `theme-color` (en particulier Chrome Android et Firefox) n'a pas été trouvé dans un tableau de compatibilité fiable.
- On ignore si Chrome applique `theme-color` à une page ouverte en `file://` sur Android ; non vérifié.
