# Langage visuel des apps IA / productivité ultra premium (2025-2026) : règles mesurables pour la refonte de MASSAMBA Workbench

Veille faite le 15/10/2026. Les sources sont datées, et celles d'avant 2024 sont marquées **[antérieur à 2024]**. Les valeurs suivies de « calcul » ont été dérivées par nous (conversion HSL → hex/OKLCH, contraste WCAG, simulation de ressort) à partir des valeurs publiées citées. Les fichiers bruts téléchargés (CSS publique de claude.ai, jetons Material, Radix, Primer) sont dans le scratchpad de session et ne sont pas versionnés.

---

## 1. Ce que font visuellement Claude.ai, ChatGPT, Perplexity, Linear, Raycast, Arc/Dia, Vercel, Notion, Granola, Superhuman et Cursor (coque, typographie, couleur, profondeur, mouvement)

### Takeaway
Les références 2025-2026 convergent vers les mêmes choix :
- des **neutres chauds très peu saturés** : Claude.ai a un fond blanc cassé `#faf9f5`, et Linear est passé en mars 2026 d'un gris bleuté à un gris « plus chaud, moins saturé » ;
- des **filets de bordure translucides** : chez Claude, la couleur du texte à 15 % d'opacité ;
- une **navigation atténuée** qui « ne rivalise pas » avec le contenu ;
- une **police de marque**, propriétaire (Anthropic Sans/Serif/Mono, OpenAI Sans) ou libre (Inter, Geist) ;
- des **transitions courtes**, de 150 ms environ.

Point critique pour nous : l'accent terracotta actuel de MASSAMBA occupe presque exactement la teinte signature de Claude.ai, `oklch(0.61–0.67 0.13 39°)`. Je n'ai trouvé aucun chiffre primaire pour Arc/Dia, Granola, Superhuman, Cursor et Perplexity (voir Gaps).

### Cited Findings

**Claude.ai** (feuille de style publique de production, lue le 15/10/2026)
- Polices : l'interface est en `--font-ui: var(--font-anthropic-sans)`, les **réponses du modèle en serif** (`--font-claude-response: var(--font-anthropic-serif)`) et le code en `--font-mono: var(--font-anthropic-mono)` — [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css).
- Ces trois familles sont servies en woff2 variable, graisses 300 à 800 : `@font-face{font-family:Anthropic Sans; … font-weight:300 800; font-display:swap; font-feature-settings:"dlig" 0}`. Je n'ai trouvé aucune licence publique : elles sont donc **propriétaires et non livrables** — [CSS claude.ai v2](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css).
- Technique anti-saut de mise en page : la police de repli est un Arial local recalé sur la police finale (`anthropicSans Fallback` : `ascent-override:92.99%; descent-override:24.13%; size-adjust:106.73%`) — [CSS claude.ai v1](https://assets-proxy.anthropic.com/claude-ai/v1/_next/static/css/026d87fb2c6610cf.css).
- Une piste « serif = Tiempos, sans = Styrene » circule, mais c'est une **hypothèse non officielle** qui contredit les noms de fichiers — [LinkedIn, K. Skryp](https://ua.linkedin.com/in/kateryna-skryp).
- **Thème clair** (jetons HSL publiés ; hex et OKLCH = calcul) — [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css) :

| Jeton | Hex (calcul) | OKLCH (calcul) |
|---|---|---|
| `bg-000` | `#ffffff` | — |
| `bg-100` | `#faf9f5` | `oklch(0.982 0.005 95)` |
| `bg-200` | `#f5f4ed` | `oklch(0.966 0.009 100)` |
| `bg-300` | `#f0eee6` | `oklch(0.949 0.011 95)` |
| `text-000` | `#141413` | `oklch(0.190 0.002 107)` |
| `text-200` | `#3d3d3a` | — |
| `text-400` (gris secondaire) | `#73726c` | `oklch(0.551 0.009 98)` |
| `brand-000` | `#c6613f` | `oklch(0.608 0.138 39)` |
| `accent-brand` | `#d97757` | `oklch(0.673 0.130 39)` |

- **Thème sombre** (`[data-theme=claude][data-mode=dark]`, même source) :
  - quatre fonds du plus profond au plus élevé : `bg-300` `#141413` (L 0.190), `bg-200` `#1f1e1d` (L 0.236), `bg-100` `#262624` (L 0.268), `bg-000` `#30302e` (L 0.308) ; chroma ≤ 0.004, teinte chaude 68–107° (calcul) ;
  - textes : `text-000` `#faf9f5`, `text-200` `#c2c0b6`, `text-400` `#9c9a92`.
- **Bordures** : couleur du texte à faible opacité, jamais un gris opaque. Les classes sont `.border-border-300{border-color:hsl(var(--border-300) / .15)}`, `border-200 / .3` et `border-100 / .4`. La base est un quasi-noir chaud en clair, `hsl(30 3.3% 11.8%)`, et un quasi-blanc chaud en sombre, `hsl(51 16.5% 84.5%)`. On trouve aussi un filet-ombre `0px 1px 0px 0px hsl(var(--border-300) / .15)` — [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css).
- **Contrastes WCAG** (calcul sur ces jetons) :

| Couple | Clair | Sombre |
|---|---|---|
| texte principal / `bg-100` | 17,5:1 | 14,4:1 |
| gris secondaire `text-400` / `bg-100` | 4,59:1 | 5,38:1 |
| blanc sur `brand-000` | 4,06:1 | — |
| accent `#d97757` sur `bg-100` sombre | — | 4,87:1 |

  Le gris secondaire reste au-dessus de 4,5:1. Le blanc sur `brand-000` est sous 4,5:1, donc réservé aux gros textes et éléments d'interface (seuil 3:1).
- **Mouvement** : 53 occurrences de `cubic-bezier(.4,0,.2,1)` et 49 de `transition-duration:.15s`, c'est-à-dire les valeurs par défaut de Tailwind. Deux courbes « joueuses » avec dépassement sont utilisées ponctuellement : `cubic-bezier(0,.9,.5,1.35)` et `cubic-bezier(.75,0,0,1.15)`. On trouve aussi `font-variant-numeric: tabular-nums lining-nums` — [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css).
- Accueil mobile de Claude : **trois suggestions de prompts en serif gras**. La source est un catalogue tiers de captures, donc de fiabilité moyenne — [screensdesign](https://screensdesign.com/explore/ui-elements/ai-prompt-suggestions/).

**ChatGPT / OpenAI**
- Refonte de février 2025 : police sur mesure **OpenAI Sans**, dessinée avec la fonderie ABC Dinamo et Studio Dumbar, aux « lignes nettes et irrégularités subtiles ». Les points ronds des « i » et « j » font écho au curseur circulaire de ChatGPT. La police est **propriétaire** — [ain.ua, 05/02/2025](https://en.ain.ua/2025/02/05/openai-updates-the-chatgpt-logo-font) ; [TechRadar, 02/2025](https://www.techradar.com/pro/openai-is-getting-a-makeover-new-visual-rebrand-for-chatgpt-maker-even-includes-its-own-custom-font).

**Linear**
- **Refonte de 2024** (28/03/2024) — [Linear, « How we redesigned the Linear UI (part II) »](https://linear.app/now/how-we-redesigned-the-linear-ui) :
  - thèmes passés en **LCH** ;
  - chaque thème passe de **98 variables à 3** (base, accent, contraste) ; la variable de contraste fabrique des thèmes à fort contraste (comparaison 30 contre 100) ;
  - niveaux d'élévation dérivés : fond, premier plan, panneaux, dialogues, modales ;
  - **moins de bleu** dans le calcul des gris (« chrome ») ;
  - **Inter Display** pour les titres, Inter pour le reste ;
  - coque en « L inversé » autour de la vue principale ;
  - projet de 6 semaines.
- **Rafraîchissement de 2026** (12/03/2026) — [Linear, « Behind the latest design refresh »](https://linear.app/now/behind-the-latest-design-refresh) :
  - deux principes : « Don't compete for attention you haven't earned » et « Structure should be felt not seen » ;
  - barre latérale « a few notches dimmer », avec texte inactif atténué, icônes plus petites et plus de marge verticale ;
  - barre d'onglets compacte, qui ne prend plus toute la largeur, aux coins arrondis, avec des onglets en icône seule pour les premiers éléments ;
  - **moins d'icônes et plus petites**, suppression des fonds colorés des icônes d'équipe ;
  - bordures arrondies, contraste adouci, **moins de séparateurs** ;
  - palette passée d'un gris bleuté à un **gris plus chaud, moins saturé**, avec cet avertissement : trop chaud « risks looking muddy » ;
  - outil : un sélecteur de couleur construit avec Claude Code qui expose H/C/L par jeton, exporté en JSON vers Figma.
- La date de 2026 est confirmée par les notes de version (sidebar plus sombre, onglets plus compacts, icônes redessinées) — [releases.sh](https://releases.sh/release/rel_agYhFIauPnHCNlZZiuyaq).

**Raycast** (sources tierces non officielles, à vérifier)
- Toile quasi noire `#07080a`, filets `#242728`, Inter avec le jeu stylistique `ss03`, GeistMono pour le code. Le site reprendrait la palette de commandes en plus grand — [shadcn.io/design/raycast](https://www.shadcn.io/design/raycast) ; [open-design.ai](https://open-design.ai/plugins/design-system-raycast/).
- Ces sources se contredisent : « zéro ombre » pour l'une, ombres internes multicouches façon macOS pour l'autre ; accent `#ff5757` contre `#FF6363`.

**Perplexity**
- Identité par l'agence Smith & Diction, logotype en **FK Display** (fonderie Florian Karsten, commerciale). Article vers 2023, **[antérieur à 2024]**. Aucun jeton d'interface trouvé — [1000logos](https://1000logos.net/news/ai-tech-company-perplexity-gets-multi-meaning-logo/amp/).

**Notion**
- Version 2.40 (11/06/2024) : **Home**, une page d'accueil personnelle pour « revenir à un document récent », voir l'agenda et les tâches, et ajouter une base de projets à venir. Les événements de Notion Calendar y apparaissent avec un lien pour rejoindre la prochaine réunion — [Notion Releases 2.40](https://www.notion.com/en-gb/releases/2024-06-11).

**Vercel / v0** : système Geist, détaillé en §2.

### Inferences
- **Risque de clone de Claude.** Un accent terracotta à environ 39° de teinte, chroma 0,13-0,14 et L 0,61-0,67, posé sur un blanc cassé à 95°, se lit immédiatement comme « Claude ». Il faut garder la chaleur tout en se distinguant. Trois leviers combinables :
  - déplacer la teinte, par exemple vers une latérite plus rouge (25-30°) ou un cuivre-ocre (50-60°) ;
  - utiliser une autre serif d'affichage libre (voir le tableau des licences en §2) ;
  - ajouter un second accent froid très rare, pour le statut ou les données.

  Critère d'acceptation proposé : distance OKLab ≥ 0,06 entre notre accent et `#d97757` comme `#c6613f`, mesurée par script.
- **Élévation sombre reproductible.** D'après les jetons de Claude, on monte d'environ **+0,03 à 0,045 de L OKLCH par niveau**, avec une chroma ≤ 0,005 et une teinte fixe (calcul). C'est une règle directement transposable en variables CSS.
- **Bordures en couleur de texte à 8-15 % d'opacité** plutôt qu'en gris opaque (Claude), et moins de séparateurs (Linear 2026). Ce sont les deux gestes les moins coûteux pour un effet premium.
- **Serif pour la voix de l'IA, sans pour l'interface.** Claude réserve sa serif aux réponses du modèle : c'est un marqueur fort de « voix ». Pour un atelier en français, une serif libre (Newsreader, Source Serif 4, Fraunces) dans les réponses longues est à tester, sans copier les proportions de Claude.

### Gaps
- **Largeur de barre latérale, hauteur d'en-tête, largeur maximale du fil de discussion** : aucune valeur officielle publiée par ces apps. La CSS de Claude contient `16rem`, `18rem`, `280px`, `48rem`, `56rem` et `640px`, mais je n'ai pas pu attribuer chaque valeur à un composant sans le DOM.
- **chatgpt.com** a renvoyé une page de vérification de 8,5 Ko : aucun jeton lisible.
- **Arc/Dia, Granola, Superhuman, Cursor** : aucune source primaire de jetons trouvée dans cette veille. Pour la règle des « 100 ms » de Superhuman, la recherche n'a rien donné de vérifiable ; seul le rachat par Grammarly et le changement de nom en Superhuman (2025) apparaissent dans des profils promotionnels — [HumanX](https://mail.humanx.co/speaker-interviews/rahul-vohra).
- **Linear** ne publie ni pixels, ni tailles de police, ni valeurs d'ombre.

---

## 2. Design systems publiés, avec leurs jetons exacts (Geist, Linear, Radix, Primer, Apple Liquid Glass, Material 3 Expressive, Tailwind v4, OKLCH)

### Takeaway
Les systèmes publics donnent un squelette chiffré directement réutilisable :
- **échelles de 10 à 12 pas à rôles fixes** : fonds 1-3, bordures 4-8, plein 9-10, texte 11-12 ;
- **espacement en base 4** (4/8/12/16/24/32/40/48/64) ;
- **rayons 6 / 12 / 16** selon l'élévation (Geist) ;
- **texte d'interface à 14 px**, texte secondaire 12-13 px en chiffres tabulaires ;
- **ombres en 2 couches ou plus**, combinées à un filet translucide ;
- **mouvement par ressorts** : Material 3 Expressive publie ses constantes de raideur et d'amortissement, que l'on peut convertir en `linear()` CSS (calcul ci-dessous).

### Cited Findings

**Vercel Geist — couleur** (page non datée, lue le 15/10/2026) — [vercel.com/geist/colors](https://vercel.com/geist/colors)
- **10 échelles** : backgrounds, gray, gray-alpha, blue, red, amber, green, teal, purple, pink.
- **10 pas (100 à 1000)** à rôles fixes : 100 fond de composant, 200 survol, 300 actif ; 400 bordure, 500 bordure au survol, 600 bordure active ; 700 fond à fort contraste, 800 son survol ; 900 texte et icônes secondaires ; 1000 texte principal.
- Deux fonds : `--ds-background-100` par défaut et `-200` à utiliser « sparingly ».
- « P3 colors are used on supported browsers and displays. »

**Geist — typographie** (classes ; tailles en px implicites dans le suffixe, non détaillées sur la page) — [vercel.com/geist/typography](https://vercel.com/geist/typography)
- Titres : `text-heading-72` → `14`.
- **Labels** (une ligne) : `text-label-14` est « le plus courant (menus) » ; `text-label-13` sert au texte secondaire, avec la consigne « use tabular figures for numbers » ; `-12` au texte tertiaire dans les vues chargées.
- **Copy** (plusieurs lignes) : `text-copy-14` le plus utilisé, `-13` secondaire, `-16` pour les modales.
- Boutons : `text-button-14` par défaut, `-12` uniquement dans un champ.

**Geist — matériaux / rayons** — [vercel.com/geist/materials](https://vercel.com/geist/materials)

| Matériau | Rayon |
|---|---|
| `material-base`, `material-small` | 6 px |
| `material-medium`, `material-large` | 12 px |
| `tooltip` | 6 px |
| `menu`, `modal` | 12 px |
| `fullscreen` | 16 px |

Les ombres ne sont décrites qu'en termes relatifs.

**Police Geist / Geist Mono** : licence **SIL OFL** (paquet npm `geist` 1.7.2, « SIL OPEN FONT LICENSE » ; `@fontsource-variable/geist` et `geist-mono` en OFL-1.1) — [npm geist](https://registry.npmjs.org/geist/latest) ; [npm @fontsource-variable/geist](https://registry.npmjs.org/@fontsource-variable/geist/latest).

**Vercel Web Interface Guidelines** (page non datée) — [vercel.com/design/guidelines](https://vercel.com/design/guidelines)
- **Interaction**
  - Cible de clic ≥ 24 px, et ≥ 44 px sur mobile.
  - Champs ≥ 16 px sur mobile, contre le zoom d'iOS.
  - `:focus-visible` plutôt que `:focus`.
  - Retarder le premier infobulle d'un groupe ; les suivantes s'affichent sans délai.
  - Indicateur de chargement : délai d'apparition de 150 à 300 ms, puis présence minimale de 300 à 500 ms.
  - `overscroll-behavior: contain` dans les modales.
- **Animation**
  - Animer seulement `transform` et `opacity` ; « never `transition: all` ».
  - Prévoir une variante `prefers-reduced-motion`.
  - Une animation de plus de 5 s doit pouvoir être mise en pause.
- **Mise en page**
  - Ajustements optiques de ±1 px.
  - Les squelettes de chargement ont exactement les dimensions finales.
- **Contenu**
  - `tabular-nums` pour comparer des nombres ; `&nbsp;` entre nombre et unité.
  - Caractère `…` unique ; ne pas coder un statut par la seule couleur.
- **Formulaires** : ⌘/Ctrl+Entrée soumet un textarea.
- **Performance** : mutations en moins de 500 ms ; listes virtualisées ou `content-visibility: auto`.
- **Design**
  - « at least two layers » d'ombre (lumière ambiante + directe) ;
  - bordures semi-transparentes combinées aux ombres ;
  - **rayon enfant ≤ rayon parent, courbes concentriques** ;
  - APCA préféré à WCAG 2 ; survol, actif et focus plus contrastés que l'état de repos ;
  - `color-scheme: dark` sur `<html>` en thème sombre ;
  - dégradés vers le sombre en image de fond, pour éviter le banding ;
  - palettes de graphiques adaptées aux daltoniens.

**Radix Colors** (`@radix-ui/colors` 3.0.0, licence MIT) — [Radix, « Understanding the scale »](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) ; [npm](https://registry.npmjs.org/@radix-ui/colors/latest)
- **12 pas** :
  1. fond de l'app ;
  2. fond discret (cartes, barre latérale, blocs de code) ;
  3. fond d'élément ;
  4. son survol ;
  5. actif / sélectionné ;
  6. bordures et séparateurs non interactifs ;
  7. bordure d'élément interactif et anneau de focus ;
  8. bordure au survol ;
  9. plein, la chroma la plus pure (accents, logos) ;
  10. plein au survol ;
  11. texte à faible contraste ;
  12. texte à fort contraste.
- Garantie : **APCA Lc 60 pour le pas 11 et Lc 90 pour le pas 12, sur le pas 2** de la même échelle.

**Radix Themes — jetons** (source GitHub, lue le 15/10/2026) — [radix-ui/themes tokens](https://github.com/radix-ui/themes/tree/main/packages/radix-ui-themes/src/styles/tokens)
- Espacement `--space-1…9` : **4, 8, 12, 16, 24, 32, 40, 48, 64 px**.
- Rayons `--radius-1…6` : **3, 4, 6, 8, 12, 16 px**, multipliés par `--radius-factor`.
- Tailles de police `--font-size-1…9` : **12, 14, 16, 18, 20, 24, 28, 35, 60 px**, avec les interlignes associés **16, 20, 24, 26, 28, 30, 36, 40, 60 px**.
- Approche des lettres : de **+0,0025 em (12 px) à −0,025 em (60 px)**, en se resserrant progressivement (−0,01 em à 35 px).
- Ombres en 6 niveaux, chacune « filet + couches » :
  - `--shadow-2: 0 0 0 1px gray-a3, 0 0 0 0.5px black-a1, 0 1px 1px 0 gray-a2, 0 2px 1px -1px black-a1, 0 1px 3px 0 black-a1` ;
  - `--shadow-5: 0 0 0 1px gray-a3, 0 12px 60px black-a3, 0 12px 32px -16px gray-a5` ;
  - `--shadow-1`, en creux pour les champs : `inset 0 0 0 1px gray-a5, inset 0 1.5px 2px 0 gray-a2, inset 0 1.5px 2px 0 black-a2` ;
  - avec `color-mix(in oklab, …)` quand le navigateur le prend en charge.

**GitHub Primer** (`@primer/primitives` 11.10.0) — [unpkg @primer/primitives 11.10.0](https://unpkg.com/@primer/primitives@11.10.0/dist/css/base/typography/typography.css)
- Tailles : 12, **14 (« Default body text size for UI »)**, 16, 20, 32 et 40 px. Graisses 300, 400, 500, 600 ; les titres sont en semibold 600.
- Police : `"Mona Sans VF", -apple-system, …`.
- Rayons : 3 px (small), **6 px (default)**, 12 px (large), pilule.
- La légende 12 px / interligne 16 px est réservée au texte sur une ligne, car elle « doesn't pass accessibility requirements » sur plusieurs lignes.
- Mouvement : durées de 50 puis 100 à 1000 ms par pas de 100 ; `ease` pour les micro-interactions et `linear` pour les chargements — [radius.css](https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/size/radius.css) ; [motion.css](https://unpkg.com/@primer/primitives@11.10.0/dist/css/base/motion/motion.css).

**Apple HIG — Materials / Liquid Glass** (annoncé à la WWDC de juin 2025, session « Meet Liquid Glass ») — [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) ; [WWDC25 session 219](https://developer.apple.com/videos/play/wwdc2025/219/)
- Liquid Glass forme une **couche fonctionnelle distincte**, réservée aux contrôles et à la navigation (barres d'onglets, barres latérales), qui flotte au-dessus du contenu.
- « **Don't use Liquid Glass in the content layer.** » et « **Use Liquid Glass effects sparingly.** » Il faut le limiter « to the most important functional elements ».
- Deux variantes :
  - *regular* : floute et ajuste la luminosité, pour les composants chargés de texte (alertes, barres latérales, popovers) ;
  - *clear* : très translucide, réservé aux fonds riches (photo, vidéo). Sur fond clair, ajouter un **voile sombre à 35 % d'opacité**.
- Les réglages d'accessibilité « réduire la transparence » et « augmenter le contraste » modifient le rendu.
- Dans la couche de contenu, utiliser les **matériaux standard** (ultra-thin, thin, regular, thick) avec des couleurs « vibrantes ». Éviter le niveau quaternary, au contraste trop faible, sur les matériaux fins.

**Critique de Liquid Glass** : NN/g, « Liquid Glass Is Cracked, and Usability Suffers in iOS 26 » (Raluca Budiu, octobre 2025). Contrôles translucides sur fonds chargés, boutons animés instables, barres d'onglets rétrécies, navigation qui se replie. C'est un avis d'expert, pas une étude contrôlée. Lu via un relais : [anderegg.ca, 12/10/2025](https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability).

**Material 3 Expressive — mouvement** (code source officiel AndroidX, fichiers datés de 2024, livrés en 2025)
- Ressorts **Standard** (amortissement / raideur) — [StandardMotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StandardMotionTokens.kt) :
  - spatial fast 0,9 / 1400, default **0,9 / 700**, slow 0,9 / 300 ;
  - effects fast 1,0 / 3800, default **1,0 / 1600**, slow 1,0 / 800.
- Ressorts **Expressive** — [ExpressiveMotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt) :
  - spatial fast **0,6 / 800**, default **0,8 / 380**, slow 0,8 / 200 ;
  - effects identiques au Standard (1,0 / 3800, 1600, 800).
- Règle M3 : *spatial* pour la position, la taille et la mise en page ; *effects*, sans rebond, pour l'opacité et la couleur.
- **Contradiction** : un paquet Flutter communautaire donne un amortissement de 0,73 (et non 0,8) pour l'Expressive default spatial — [pub.dev material_expressive](https://pub.dev/documentation/material_expressive/0.7.0/). Je retiens la source AndroidX.
- Courbes et durées « classiques » — [MotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt) :
  - *emphasized* `cubic-bezier(0.2, 0, 0, 1)` ;
  - *emphasized decelerate* `(0.05, 0.7, 0.1, 1)` ;
  - *emphasized accelerate* `(0.3, 0, 0.8, 0.15)` ;
  - *standard* `(0.2, 0, 0, 1)` ;
  - durées : short 50 / 100 / 150 / 200, medium 250 / 300 / 350 / 400, long 450 à 600, extra-long 700 à 1000 ms.
- **Calcul (oscillateur de masse 1)**, temps de stabilisation à 1 % et dépassement :

| Ressort | Stabilisation | Dépassement |
|---|---|---|
| Standard spatial default | ≈ 194 ms | 0,2 % |
| Standard effects default | ≈ 166 ms | 0 % |
| Expressive spatial fast | ≈ 221 ms | **9,5 %** |
| Expressive spatial default | ≈ 326 ms | 1,5 % |
| Expressive spatial slow | ≈ 449 ms | 1,5 % |

- **Approximation CSS** (calcul ; dernier point forcé à 1) :
  - Expressive default spatial, 410 ms : `linear(0, 0.096, 0.292, 0.5, 0.678, 0.812, 0.904, 0.962, 0.994, 1.009, 1.015, 1.015, 1.012, 1.009, 1.006, 1.004, 1)` ;
  - Expressive fast spatial, 350 ms : `linear(0, 0.145, 0.436, 0.721, 0.93, 1.048, 1.092, 1.089, 1.065, 1.036, 1.013, 0.999, 0.992, 0.991, 0.993, 0.996, 1)`.
- **Recherche Google derrière M3 Expressive** (mai 2025) : 46 études et plus de 18 000 participants, par oculométrie, sondages et tests d'utilisabilité ; un design expressif « bien appliqué » est préféré à tous les âges. Le billet de Google a été publié puis retiré, donc la source est **secondaire** — [Droid Life, 05/05/2025](https://www.droid-life.com/2025/05/05/material-3-expressive-might-be-the-future-of-android-design/) ; [Chrome Unboxed](https://chromeunboxed.com/google-leaks-the-reason-and-process-behind-their-new-material-3-expressive-design-language).

**Tailwind CSS v4** (22/01/2025) — [tailwindcss.com/blog/tailwindcss-v4](https://tailwindcss.com/blog/tailwindcss-v4)
- Palette par défaut convertie de `rgb` en **`oklch`** (gamut P3).
- Configuration en CSS via `@theme` ; tous les jetons sont exposés en variables CSS.
- Espacement dérivé d'une seule variable, `--spacing: 0.25rem`.
- Container queries natives.
- Variante `starting:` (`@starting-style`) pour animer l'apparition sans JavaScript.
- Dégradés interpolés en **OKLAB par défaut**.
- Nouveaux utilitaires `inset-shadow-*`, `inset-ring-*` et `color-scheme`.

**OKLCH** : Evil Martians, page datée du 17/09/2025 (le texte mentionne aussi « at the time of this writing in 2024 », donc dates incohérentes) — [Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)
- La luminosité HSL n'est pas cohérente d'une teinte à l'autre ; le L d'OKLCH est perceptuel.
- **Garder L fixe et changer H** préserve le contraste : `oklch(from var(--error) l c 140)`.
- Variantes relatives : `oklch(from var(--accent) calc(l - 0.1) c h)`.
- « All backgrounds with L≥87% have good contrast with black text ».
- Pour le P3 : valeur sRGB par défaut, version saturée sous `@media (color-gamut: p3)`, puis contrôle avec `stylelint-gamut`.

**Inter** : licence **OFL 1.1** ; graisses 100 à 900, vraie italique ; tailles optiques de « text » à « display » (Inter Display, que Linear utilise pour ses titres). Fonctions OpenType utiles — [rsms.me/inter](https://rsms.me/inter/) :
- `tnum` : chiffres tabulaires ;
- `zero` : zéro barré ;
- `case` : formes adaptées aux capitales ;
- `ss01` : chiffres ouverts ;
- `ss02` : désambiguïsation des caractères proches ;
- `ss03` : guillemets et virgules ronds ;
- `cv11` : « a » à un étage.

**Licences des polices citées**
- **Livrables** (paquets `@fontsource` en OFL-1.1, lus sur npm le 15/10/2026) — [registre npm](https://registry.npmjs.org/@fontsource-variable/inter/latest) :
  - Inter, Inter Tight, Geist, Geist Mono ;
  - Instrument Serif, Fraunces, Newsreader, Source Serif 4 ;
  - Manrope, Onest, Figtree, JetBrains Mono, IBM Plex Sans ;
  - Schibsted Grotesk, Hanken Grotesk, Bricolage Grotesque.
- **Non livrables** (propriétaires) : Anthropic Sans/Serif/Mono, OpenAI Sans, FK Display / FK Grotesk (fonderie commerciale), et Tiempos / Styrene si l'hypothèse se confirmait.
- **Mona Sans** (Primer) : licence non vérifiée dans cette veille.

**Bibliothèques d'interface citées** (licences lues sur npm le 15/10/2026)

| Bibliothèque | Version | Licence | Usage |
|---|---|---|---|
| `cmdk` | 1.1.1 | MIT | palette ⌘K |
| `sonner` | 2.0.8 | MIT | toasts |
| `motion` | 14.3.0 | MIT | ressorts |
| `@phosphor-icons/react` | 2.1.10 | MIT | icônes |
| `lucide-react` | 1.57.0 | **ISC** | icônes |

ISC est permissive et équivalente à MIT, mais ne figure pas dans la liste MIT / Apache-2.0 / BSD des consignes : c'est à l'utilisateur de trancher — [npm lucide-react](https://registry.npmjs.org/lucide-react/latest) ; [npm cmdk](https://registry.npmjs.org/cmdk/latest) ; [npm sonner](https://registry.npmjs.org/sonner/latest) ; [npm motion](https://registry.npmjs.org/motion/latest).

### Inferences
- **Squelette de jetons recommandé (synthèse, pas une copie)** :
  - une échelle neutre chaude de 12 pas en OKLCH à rôles Radix, avec des noms courts façon Geist (100…1200), une teinte fixe et une chroma ≤ 0,01 ;
  - un accent de 12 pas avec la même progression de L ;
  - espacement en base 4 (Radix, Tailwind) ;
  - rayons de 6 px (contrôles) / 12 px (cartes, menus, modales) / 16 px (plein écran), en respectant enfant ≤ parent (Geist + Vercel) ;
  - texte d'interface à 14 px, secondaire à 13 px en `tabular-nums`, interligne de 20 px (Geist, Primer).

  Critères d'acceptation testables par script : pas 11 ≥ APCA Lc 60 et pas 12 ≥ Lc 90 sur le pas 2 (Radix) ; texte secondaire ≥ 4,5:1 WCAG sur les deux thèmes (seuil tenu par Claude).
- **Mouvement maison** : ressort « Expressive default » (≈ 330-410 ms, 1,5 % de dépassement) pour les panneaux et cartes qui entrent ; « effects » sans rebond, 100-170 ms, pour la couleur et l'opacité ; `cubic-bezier(0.2,0,0,1)` en repli. Tout est coupé sous `prefers-reduced-motion`.
- **Verre dépoli uniquement sur la couche de navigation**, jamais sur le contenu (Apple). Sur un fond riche, voile de 35 %.

### Gaps
- Geist ne publie ni valeur hex/OKLCH, ni valeur d'ombre, ni taille numérique de ses jetons typographiques sur ces pages.
- Je n'ai pas pu lire la page officielle des spécifications de mouvement de m3.material.io (application à page unique, vide via WebFetch). J'ai utilisé le code AndroidX.
- Je n'ai trouvé aucune valeur de flou (`backdrop-filter`) recommandée par Apple pour le web : le HIG ne donne pas de rayon de flou.

---

## 3. Rendre les ÉTATS VIDES et le premier lancement vivants ; détails de « plaisir » (micro-interactions, ⌘K, raccourcis, toasts, squelettes, interface optimiste)

### Takeaway
Un état vide premium remplit trois fonctions (NN/g) : dire le statut, apprendre sur place et offrir un chemin direct vers la tâche. Côté IA, il faut au plus 5 suggestions de prompts, renouvelées au fil du contexte (Cloudscape) ; Claude en montre 3. Pour l'attente : rien sous 1 s, squelette aux dimensions exactes jusqu'à 10 s, barre de progression au-delà (NN/g, Vercel). Je n'ai trouvé aucune source primaire chiffrée sur les dégradés d'ambiance ou les illustrations d'accueil des apps IA.

### Cited Findings
- **NN/g, états vides** (Kate Kaplan, 19/09/2021, **[antérieur à 2024]**) — [NN/g](https://www.nngroup.com/articles/empty-state-interface-design/) :
  1. communiquer le statut, sans jamais afficher « Aucun élément » pendant un chargement ;
  2. donner des repères d'apprentissage sur place, par exemple « Star your favorites to list them here » ;
  3. offrir des chemins directs : un bouton « Créer » et un lien « En savoir plus », voire des **données de démonstration** à explorer sans risque (exemple Loggly).
- **Suggestions de prompts** : « should not exceed five » à tout moment, et les remplacer quand la conversation avance, car le contexte a changé — [AWS Cloudscape, GenAI support prompts](https://cloudscape.design/patterns/genai/support-prompts).
- Exemples relevés : Claude mobile affiche 3 suggestions en serif gras ; Gemini propose des catégories de prompts (« Career guide »). Source : catalogue tiers — [screensdesign](https://screensdesign.com/explore/ui-elements/ai-prompt-suggestions/).
- **Chargement, NN/g** (Samhita Tankala, 04/06/2023, relu le 02/09/2026, **[antérieur à 2024, relu en 2026]**) — [NN/g Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) :
  - < 1 s : aucun indicateur ;
  - pleine page < 10 s : squelette ;
  - module isolé de 2 à 10 s : spinner ;
  - > 10 s : barre de progression avec estimation ;
  - pas de squelette « cadre seul » (en-tête et pied uniquement).
- **Chargement et interactions, Vercel** — [Vercel Guidelines](https://vercel.com/design/guidelines) :
  - spinner après 150 à 300 ms, visible au moins 300 à 500 ms ;
  - squelette aux dimensions exactes du contenu final ;
  - mutations en moins de 500 ms ;
  - bouton d'envoi actif jusqu'à la soumission, puis spinner et clé d'idempotence ;
  - ⌘/Ctrl+Entrée pour envoyer ;
  - « … » sur les actions qui ouvrent une suite (« Renommer… ») et sur les états en cours (« Enregistrement… »).
- **Seuil de Doherty** : « Productivity soars when … interact at a pace (<400ms) » — [Laws of UX](https://lawsofux.com/) (site non daté ; lois d'origine antérieures à 2024).
- **M3 Expressive** (recherche Google, rapportée en mai 2025, source secondaire) : les indicateurs animés réduisent la frustration, la taille des boutons influe sur la confiance, et les formes ludiques rendent le logiciel « chaleureux et personnel » — [Chrome Unboxed](https://chromeunboxed.com/google-leaks-the-reason-and-process-behind-their-new-material-3-expressive-design-language).
- **Bibliothèques de « plaisir » libres** : `cmdk` pour la palette ⌘K, `sonner` pour les toasts et `motion` pour les ressorts, toutes en MIT — [npm cmdk](https://registry.npmjs.org/cmdk/latest) ; [npm sonner](https://registry.npmjs.org/sonner/latest) ; [npm motion](https://registry.npmjs.org/motion/latest).
- **Apparition sans JavaScript** : variante `starting:` / `@starting-style` de Tailwind v4 — [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4).

### Inferences
- **Accueil « vivant » sans clinquant** (combinaison, pas copie) :
  - salutation datée en français (« Bonsoir, … ») ;
  - **3 suggestions** au maximum, tirées du contexte réel de l'utilisateur (derniers fichiers, derniers exports) plutôt que génériques, conformément à Cloudscape ;
  - un bloc « Reprendre » (voir §4) ;
  - un exemple de démonstration chargé en un clic (Loggly / NN/g).

  Critère : aucune suggestion en dur, et chacune mène à une action en 1 clic.
- **Une seule « touche de joie » par parcours**, au pic et à la fin (règle pic-fin, §4) : micro-ressort Expressive à la fin d'un export ou d'une analyse, toast avec action « Ouvrir ». Pas d'animation en boucle de plus de 5 s sans pause (Vercel).
- **⌘K comme colonne vertébrale** (actions, conversations, fichiers, réglages), avec les raccourcis affichés à droite en `kbd` monospace et chiffres tabulaires. Critère : toute action de la barre latérale est accessible via ⌘K.

### Gaps
- Je n'ai trouvé aucune source primaire 2025-2026 décrivant les **dégradés d'ambiance, le grain ou les illustrations** des écrans d'accueil de Claude, ChatGPT, Perplexity ou Dia. Je n'ai pas non plus trouvé l'article NN/g sur les suggestions de prompts (URL introuvable).
- Je n'ai trouvé aucune mesure publique de l'effet des micro-interactions sur la rétention dans les apps IA.

---

## 4. Ce qui fait rester et revenir dans une app de productivité (continuité de l'accueil, récents, épinglés, reprise, progression, personnalisation)

### Takeaway
Les preuves disponibles sont surtout des **principes**, pas des études de rétention chiffrées :
- page d'accueil personnelle pour « revenir à un document récent » (Notion Home, 2024) ;
- effet Zeigarnik (on retient les tâches inachevées), gradient d'objectif (la motivation croît près du but) et règle pic-fin ;
- effet esthétique-utilisabilité (ce qui est beau est perçu comme plus utilisable) ;
- seuil de Doherty (< 400 ms) ;
- préférence mesurée par Google pour un design expressif (46 études, source secondaire).

### Cited Findings
- **Notion Home** (2.40, 11/06/2024) : page d'accueil personnelle pour revenir à un document récent, voir l'agenda et les tâches, avec les réunions à venir et un lien pour les rejoindre — [Notion Releases](https://www.notion.com/en-gb/releases/2024-06-11).
- **Laws of UX** (définitions officielles du site) — [lawsofux.com](https://lawsofux.com/) :
  - **Zeigarnik** : on se souvient mieux des tâches inachevées ou interrompues ;
  - **Goal-Gradient** : « The tendency to approach a goal increases with proximity to the goal » ;
  - **Peak-End** : on juge une expérience sur son pic et sa fin ;
  - **Aesthetic-Usability** : « Users often perceive aesthetically pleasing design as design that's more usable » ;
  - **Jakob** : les utilisateurs attendent que l'app fonctionne comme celles qu'ils connaissent ;
  - **Hick** : le temps de décision croît avec le nombre de choix ;
  - **Serial Position** : on retient le premier et le dernier élément ;
  - **Miller** : 7 ± 2 éléments en mémoire de travail ;
  - **Doherty** : < 400 ms.
- **Repères d'apprentissage dans l'espace même** (« favoris ») : on retient mieux une aide applicable tout de suite qu'un long tutoriel — [NN/g, 2021, antérieur à 2024](https://www.nngroup.com/articles/empty-state-interface-design/).
- **Recherche M3 Expressive** : un design expressif bien appliqué est préféré à tous les âges à un design non expressif suivant le HIG d'iOS (source secondaire, billet Google retiré) — [Droid Life, 05/05/2025](https://www.droid-life.com/2025/05/05/material-3-expressive-might-be-the-future-of-android-design/).
- **Linear 2026** garde la densité d'information tout en réduisant le bruit (« Don't compete for attention you haven't earned ») : la densité utile est un argument de fidélité des utilisateurs avancés — [Linear, 12/03/2026](https://linear.app/now/behind-the-latest-design-refresh).

### Inferences
- **Bloc « Reprendre là où vous en étiez »** en tête de l'accueil, qui combine Notion Home et Zeigarnik : dernière conversation, dernier export inachevé, dernière analyse en cours, avec une **barre de progression** quand c'est pertinent (gradient d'objectif). Critère : reprendre la dernière tâche en 1 clic, ou ⌘K → Entrée.
- **Épinglés et récents** limités à 5-7 éléments par liste (Miller, Hick), les plus importants en premier et en dernier (Serial Position).
- **Conventions familières** (Jakob) : barre latérale gauche repliable, nouvelle conversation en haut, champ de saisie en bas centré. Ce sont les codes de Claude, ChatGPT et Perplexity : la singularité passe par la matière (couleur, typographie, mouvement), pas par la structure.

### Gaps
- Je n'ai trouvé aucune étude 2024-2026 de NN/g ou Baymard mesurant l'effet des récents, épinglés ou de la reprise sur la rétention des apps de productivité ou d'IA. Baymard porte surtout sur le e-commerce.
- Je n'ai trouvé aucune donnée publique de rétention liée aux fonctions de mémoire ou de personnalisation de ChatGPT ou Claude.

---

## 5. Pièges qui donnent un air « bon marché » ou « généré par IA »

### Takeaway
Les marqueurs d'une interface « générée par IA » relevés par la communauté :
- **indigo et violet par défaut** de Tailwind, dégradé indigo → violet ;
- Inter partout sans parti pris ;
- trois cartes arrondies alignées sous un héros centré ;
- **verre dépoli posé sur le contenu** (Apple l'interdit) ;
- **gris secondaires trop pâles** ;
- **trop d'icônes, de pastilles colorées et de séparateurs** (que Linear 2026 a retirés) ;
- `transition: all`, animations non coupables, cibles de clic trop petites.

Le remède commun est de décider d'abord des contraintes de marque.

### Cited Findings
- **Origine du « violet IA »** : le créateur de Tailwind s'est excusé publiquement en août 2025 d'avoir fait de `bg-indigo-500` la couleur par défaut des boutons de Tailwind UI. Les modèles reproduisent la « médiane » des sites depuis 2019 — [prg.sh, « Why Your AI Keeps Building the Same Purple Gradient Website »](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website).
- **Marqueurs récurrents** : Inter, dégradé indigo → violet, trois cartes à icône, héros centré avec un seul bouton. C'est une observation communautaire, pas une étude — [925studios](https://www.925studios.co/blog/ai-slop-design-tells) ; [superdesign.dev](https://www.superdesign.dev/blog/why-ai-design-looks-generic).
- **Abus du verre** : « Don't use Liquid Glass in the content layer », « Use Liquid Glass effects sparingly », et la variante *clear* seulement sur fonds riches, avec un voile de 35 % — [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/materials). NN/g (octobre 2025) note une baisse d'utilisabilité : contrôles translucides sur fonds chargés, barres rétrécies — [anderegg.ca](https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability).
- **Bruit visuel** : Linear 2026 réduit le nombre et la taille des icônes, supprime les fonds colorés des icônes d'équipe, retire des séparateurs, et met en garde : un neutre trop chaud « risks looking muddy » — [Linear](https://linear.app/now/behind-the-latest-design-refresh).
- **Gris trop pâle** :
  - Radix garantit Lc 60 pour le texte secondaire — [Radix](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) ;
  - le gris secondaire de Claude reste à 4,59:1 en clair et 5,38:1 en sombre (calcul sur la [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)) ;
  - Primer interdit la légende 12/16 px en texte de plusieurs lignes — [Primer](https://unpkg.com/@primer/primitives@11.10.0/dist/css/functional/typography/typography.css) ;
  - Vercel exige que survol, actif et focus soient plus contrastés que le repos, et qu'un statut ne repose pas sur la seule couleur — [Vercel](https://vercel.com/design/guidelines).
- **Mouvement « cheap »** : `transition: all`, animation de `width`/`top` au lieu de `transform`/`opacity`, pas de `prefers-reduced-motion`, banding des dégradés vers le noir — [Vercel](https://vercel.com/design/guidelines).
- **Barres d'outils serrées** : cible ≥ 24 px (≥ 44 px sur mobile), champs ≥ 16 px sur mobile — [Vercel](https://vercel.com/design/guidelines). Linear reste compact mais aligne strictement icônes, libellés et boutons sur les deux axes — [Linear 2024](https://linear.app/now/how-we-redesigned-the-linear-ui).
- **Ombres plates** : il faut au moins 2 couches, plus un filet semi-transparent — [Vercel](https://vercel.com/design/guidelines) ; Radix en empile 3 à 5 — [Radix Themes](https://github.com/radix-ui/themes/tree/main/packages/radix-ui-themes/src/styles/tokens).

### Inferences
- **Liste de contrôle anti-« IA générique » automatisable** (critères testables sur captures et CSS) :
  - aucun dégradé indigo ou violet, et teinte d'accent hors de 260-300° ;
  - `transition: all` interdit (recherche dans le code) ;
  - texte secondaire ≥ 4,5:1 ;
  - au plus 1 effet de verre par écran, et seulement sur la navigation ;
  - au plus 1 pastille ou compteur par ligne de liste ;
  - cibles ≥ 24 px ;
  - deux couches d'ombre au minimum sur les surfaces flottantes.
- **Typographie française** : Vercel exige `&nbsp;` entre nombre et unité et des chiffres tabulaires. En français, cela se prolonge naturellement par des espaces insécables avant `: ; ! ?` et dans les nombres, via le formatage fr-FR des nombres et des dates. C'est un détail de finition que les références anglophones n'ont pas. **Hypothèse non sourcée dans cette veille** : à vérifier par rapport aux règles typographiques françaises avant de l'ériger en règle.
- **« Trop de badges »** : pas de source dédiée trouvée. Le principe de Linear (« Don't compete for attention you haven't earned ») en tient lieu.

### Gaps
- Aucune étude contrôlée ne mesure l'effet « cheap » des marqueurs d'IA ; les sources sont des opinions de praticiens (blogs d'agences, 2025-2026).
- Je n'ai trouvé aucune règle chiffrée publiée sur la part de surface acceptable pour un accent (par exemple « ≤ 10 % de pixels »). Toute règle de ce type serait une hypothèse maison, à valider sur nos propres captures.
