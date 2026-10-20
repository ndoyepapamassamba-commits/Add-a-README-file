# Tisser MASSAMBA Workbench et faire voir JEV

Pour devenir ultra premium, MASSAMBA Workbench n'a pas besoin de changer de structure. La barre latérale, le fil de discussion et le compositeur en bas sont les codes que les utilisateurs connaissent déjà (loi de Jakob). Ce qui doit changer, c'est la **matière** et la **hiérarchie**. Aujourd'hui, l'app reprend **à l'identique les jetons de Claude.ai** : l'accent du thème sombre `#d97757` est à une distance OKLab de 0,000 de l'orange de Claude, et les surfaces `#faf9f5` et `#262624` sont les mêmes. Son logo, un carré arrondi orné d'un losange, relève selon la veille des motifs génériques à quitter. Son mot-symbole est tronqué sur mobile. Enfin, JEV, son vrai avantage, est rangé en troisième onglet de la dixième rubrique.

La refonte proposée repose sur quatre piliers :

- **Des jetons OKLCH à rôles fixes.** Des neutres « papier ocre », un accent latérite décalé à au moins 0,075 de l'orange de Claude (calcul local), et un indigo de teinture réservé à JEV seul. S'y ajoutent une élévation par paliers de luminosité, des filets translucides, des ombres à deux couches, des rayons de 6, 12 et 16 px, et des ressorts courts qui s'arrêtent quand l'utilisateur demande moins d'animations.
- **Un monogramme « M tissé ».** Il s'inspire du tissage manjak sénégalais, et non des symboles akan Adinkra.
- **Une navigation mobile « 4 + Plus » doublée d'une palette ⌘K**, avec un compositeur qui suit le clavier, sur un socle WCAG 2.2 AA.
- **JEV présent partout, sur quatre étages.** Une pastille de présence, une ligne d'état précise, un **reçu repliable par réponse** qui remplace les quatre cartes actuelles, et le soulignement des passages corrigés par le vérificateur premium.

La règle cardinale de ce dernier pilier : **tout ce que JEV affiche est un événement journalisé par le code**, jamais une confiance déclarée ni une économie estimée. C'est ce qui distingue JEV des « raisonnements » affichés par les autres apps, que NN/g juge souvent infidèles.

La priorité absolue est un premier lot qui corrige des **défauts objectifs** : textes indicatifs (placeholders) à 2,66:1, champ de saisie à 14 px qui déclenche le zoom d'iOS, aucune règle `prefers-reduced-motion`. Ce n'est qu'ensuite que viennent les jetons, JEV, puis le logo.

Deux limites restent ouvertes. Aucune étude contrôlée ne relie ces choix à la rétention. Et le symbole ne doit pas être publié sans la relecture d'au moins une personne sénégalaise.

> **Convention de lecture.** Un fait sourcé porte un lien. Un constat tiré du dépôt cite le fichier, par exemple `direct/lib/nav.ts`. « Calcul local » désigne un calcul refait pour ce rapport (conversion OKLCH, contraste WCAG 2.x, APCA) avec le script du scratchpad de session. Tout passage qui commence par **Inférence** est une proposition de design, pas un fait. Toutes les notes de veille datent du 15/10/2026.

## Aujourd'hui, l'app porte les couleurs exactes de Claude et cache JEV

Le point de départ se mesure dans le dépôt. Il ne relève pas de l'impression.

La feuille `web/styles.css`, importée telle quelle par l'app livrée (`direct/styles.css`), définit en thème clair un accent `#c8623f` et une surface `#faf9f5`, et en thème sombre un accent `#d97757` et une surface `#262624`. Or la CSS de production de claude.ai publie `brand-000 #c6613f`, `accent-brand #d97757`, `bg-100 #faf9f5` et, en sombre, `bg-100 #262624` ([CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)). Le calcul local donne une **distance OKLab de 0,000** entre l'accent sombre de l'app et celui de Claude, de **0,005** pour l'accent clair, et des surfaces strictement identiques. **Inférence** : pour un utilisateur, l'app se lit donc comme « Claude ».

Le logo pose le même problème. `direct/App.tsx` dessine un carré arrondi (`rx 8`) qui contient un losange. Les marques IA de 2025 se distinguent au contraire par un symbole dessiné et une imperfection humaine maîtrisée, comme le « O » d'OpenAI ([Octet Design](https://octet.design/journal/openai-new-logo-gets-bold-rebrand)) ou l'étincelle griffonnée de Claude ([Abduzeedo](https://www.abduzeedo.com/seamlessly-crafting-ai-branding-and-visual-identity-anthropic)). **Inférence** (celle de la veille identité) : un carré arrondi orné d'un losange est précisément le motif générique à quitter.

Les défauts d'accessibilité sont nets, et ils comptent davantage. Le gris `--faint` sert de couleur aux textes indicatifs des champs (`placeholder:text-faint`, 6 occurrences) et au pied de chaque réponse (`text-[11.5px] text-faint` dans `direct/views/ChatView.tsx`). Il ne donne que **2,66 à 2,95:1 en clair et 2,99 à 3,60:1 en sombre** (calcul local), sous le seuil de **4,5:1** du critère 1.4.3 ([W3C 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). L'onglet actif, en texte accent sur fond accent adouci, tombe à **3,31:1** en clair, et le blanc sur le bouton accent clair à **3,98:1**.

Le champ de saisie du chat est en `text-[14px]`. Or iOS zoome au focus sous 16 px ([Vercel Guidelines](https://vercel.com/design/guidelines) ; [mieweb/ui #494](https://github.com/mieweb/ui/issues/494)). La balise viewport (`direct/index.html`) n'a ni `viewport-fit=cover` ni `interactive-widget`. La feuille de styles ne contient aucune règle `prefers-reduced-motion` ni `forced-colors`, alors qu'une pulsation tourne en boucle (`wb-pulse … infinite`).

Côté structure :

- **Mobile.** La navigation passe par un tiroir hamburger. NN/g a montré que cacher la navigation principale **divise presque par deux sa découvrabilité** (6 sites, 179 participants) ([NN/g](https://www.nngroup.com/articles/hamburger-menus/)).
- **JEV.** Il n'a pas de lieu à lui. La page « JEV » est le troisième des quatre onglets de la rubrique « Observabilité », la dixième sur douze (`direct/lib/nav.ts`). Sur mobile, il faut donc trois gestes pour l'atteindre.
- **Transcript.** Une même réponse peut y empiler jusqu'à quatre objets méta : carte d'intelligence, carte de routage, trace JEV et ligne d'usage (`ChatView.tsx`, cas `intel`, `routing`, `jev`, `usage`). JEV est donc à la fois caché, comme rubrique, et bavard, dans le fil.

| Constat dans le code | Fichier | Référence violée ou risque |
|---|---|---|
| Accent et surfaces identiques à Claude (distance OKLab de 0,000 à 0,005) | `web/styles.css` | Identité non distinctive ([CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)) |
| `--faint` à 2,66–3,60:1, utilisé pour les textes indicatifs et le pied des réponses | `web/styles.css`, `ChatView.tsx` | WCAG 1.4.3 : 4,5:1 |
| Saisie à 14 px, sans `enterkeyhint` | `ChatView.tsx` | Zoom d'iOS au focus ([mieweb/ui #494](https://github.com/mieweb/ui/issues/494)) |
| Viewport sans `viewport-fit=cover` | `direct/index.html` | `env(safe-area-*)` vaut 0 sur iPhone ([MDN viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element)) |
| Aucune règle `prefers-reduced-motion` ni `forced-colors` ; animation en boucle | `web/styles.css` | [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) ; [Vercel](https://vercel.com/design/guidelines) |
| Barre latérale animée sur `width` ; 2 occurrences de `transition-all` | `direct/App.tsx`, `web/components/ui.tsx` | « never `transition: all` », animer seulement `transform` et `opacity` ([Vercel](https://vercel.com/design/guidelines)) |
| Mot-symbole en `truncate` dans l'en-tête | `direct/App.tsx` | Troncature de la marque sur mobile |
| ⌘/Ctrl+K crée une nouvelle session au lieu d'ouvrir une palette | `direct/App.tsx` | Convention ⌘K = palette de commandes |
| JEV en onglet 3 sur 4 de la rubrique 10 sur 12 | `direct/lib/nav.ts` | Présence de l'IA non signalée (HAX G1, Apple « Communicate where your app uses AI ») |

## Des jetons OKLCH qui gardent la chaleur sans copier Claude

### Couleur : déplacer l'accent, réserver l'indigo à JEV

Les références de 2025-2026 convergent vers des neutres chauds très peu saturés. Linear est passé en mars 2026 à un gris « plus chaud, moins saturé », tout en avertissant qu'un neutre trop chaud « risks looking muddy » ([Linear, 12/03/2026](https://linear.app/now/behind-the-latest-design-refresh)). Les systèmes publics fixent des **échelles de 12 pas à rôles fixes** :

- pas 1 à 3 : fonds ;
- pas 4 et 5 : états de survol et d'activation ;
- pas 6 à 8 : bordures ;
- pas 9 et 10 : aplats ;
- pas 11 et 12 : textes, avec la garantie **APCA Lc 60 pour le pas 11 et Lc 90 pour le pas 12** ([Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).

Tailwind v4 a déjà converti sa palette en `oklch` et expose tous les jetons en variables CSS via `@theme` ([Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4)). L'OKLCH garde une luminosité perçue (L) cohérente d'une teinte à l'autre. On peut donc dériver un survol par `oklch(from var(--accent) calc(l - 0.1) c h)` sans hex en dur ([Evil Martians, 17/09/2025](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)).

Côté culturel, l'exposition dakaroise « Sur le fil » consacrait une section à la **teinture à l'indigo** ([Au-Sénégal](https://au-senegal.com/senegal-chanel-valorise-la-broderie-et-le-tissage-avec-sur-le-fil,16473.html)). Carbon for AI réserve les effets lumineux « strictly » à l'identification de l'IA ([Carbon for AI, 12/08/2026](https://carbondesignsystem.com/guidelines/carbon-for-ai/)).

**Inférence.** Trois décisions combinent ces faits.

1. **Neutres « papier ocre ».** Teinte fixe H ≈ 80, chroma ≤ 0,01 : assez chaud pour accueillir, assez peu saturé pour ne pas devenir boueux.
2. **Accent latérite déplacé.** H 33 et L 0,535 en clair, H 52 et L 0,74 en sombre. Il reste chaud mais sort de la teinte de Claude.
3. **Indigo de teinture réservé à JEV.** Second accent froid et rare, qui signale « ici, JEV agit ». Aucun autre composant ne le porte, ce qui applique à JEV la règle Carbon.

La règle anti-« IA générique » des notes (« teinte d'accent hors de 260-300° ») est affinée plutôt qu'abandonnée. Le marqueur dénoncé est l'indigo saturé par défaut de Tailwind et le dégradé indigo → violet ([prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)). Le critère devient donc : **aucun jeton avec H entre 260 et 300 et C > 0,15, et aucun dégradé indigo → violet**. L'indigo JEV est à 0,188 (clair) et 0,243 (sombre) de distance OKLab de l'`indigo-500` de Tailwind (calcul local).

Le tableau ci-dessous donne les jetons proposés. Toutes les valeurs ont été converties et contrôlées par calcul local. Toutes sont dans le gamut sRGB, et chaque contraste est **le minimum sur les quatre surfaces** du thème.

| Rôle | Clair (OKLCH → hex) | Contraste min. | Sombre (OKLCH → hex) | Contraste min. |
|---|---|---|---|---|
| Fond app / surface / panneau / survol | `0.972 0.006 80` `#f8f5f1` / `0.985 0.004 80` / `0.997 0.002 80` / `0.945 0.008 80` | — | `0.18 0.004 80` `#121110` / `0.215` / `0.25` / `0.285` (même C ≤ 0,006, H 80) | — |
| Texte principal | `0.235 0.008 80` `#201e1a` | **14,15:1** | `0.95 0.006 80` `#f1eeea` | **12,37:1** |
| Texte secondaire | `0.50 0.010 80` `#66635d` | **5,09:1** | `0.775 0.010 80` `#b9b5af` | **7,01:1** (APCA Lc 58,7 à 62,1) |
| Accent latérite (texte, focus) | `0.535 0.150 33` `#b3442e` | **4,72:1** ; 4,60 sur son fond adouci | `0.74 0.130 52` `#eb9259` | **5,99:1** ; 5,79 sur son fond adouci |
| Bouton plein accent | blanc sur `#b3442e` | **5,55:1** | `#121110` sur `#eb9259` | **7,89:1** |
| JEV indigo (texte, trait) | `0.44 0.115 264` `#314f91` | **6,72:1** ; 6,84 sur sa puce | `0.78 0.090 264` `#9ab7f2` | **7,11:1** ; 7,04 sur sa puce |
| Succès / vigilance / erreur | `#24744d` / `#8f5d04` / `#bd1f46` | 4,85 / 4,78 / 5,18:1 | `#73ca99` / `#ebbc63` / `#f87582` | 7,25 / 8,11 / 5,35:1 |
| Distance OKLab au plus proche orange de Claude | accent : **0,075** (contre `#c6613f`) | seuil ≥ 0,06 | accent : **0,075** (contre `#d97757`) | seuil ≥ 0,06 |

Deux règles de détail viennent du même calcul.

- **Filets et bordures de champ.** Les filets en couleur de texte à 8-15 % d'opacité, que Claude utilise ([CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)), n'atteignent que 1,17 à 1,47:1. Ils restent donc **décoratifs**. La bordure d'un champ qui, seule, permet de l'identifier doit monter à **48 % d'opacité en clair et 36 % en sombre** pour franchir les **3:1** du critère 1.4.11 ([W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). Sinon, le champ doit être identifié par son fond et son libellé.
- **Accent et erreur.** Ils restent proches : distance OKLab de 0,070 en clair. Une erreur s'affiche donc **toujours avec une icône et un libellé**, car Vercel interdit de coder un statut par la seule couleur ([Vercel](https://vercel.com/design/guidelines)).

L'APCA sert d'indicateur interne, pas de critère de conformité. Il a été retiré du brouillon WCAG 3, dont l'algorithme de contraste est encore « à déterminer » en avril 2026 ([Adrian Roselli, 04/2026](https://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html)). La conformité reste mesurée par les ratios WCAG 2.x, même si Vercel préfère l'APCA ([Vercel](https://vercel.com/design/guidelines)).

### Typographie : un parti pris libre, distinct de la voix de Claude

Claude compose son interface en Anthropic Sans et **les réponses du modèle en serif** (`--font-claude-response`). Ces polices sont propriétaires ([CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)). Les systèmes publics fixent le texte d'interface à **14 px** et le texte secondaire à 13 px en chiffres tabulaires ([Geist](https://vercel.com/geist/typography) ; [Primer](https://unpkg.com/@primer/primitives@11.10.0/dist/css/base/typography/typography.css)). Primer réserve la légende de 12 px au texte sur une seule ligne, parce que sur plusieurs lignes elle « doesn't pass accessibility requirements ».

Radix publie une échelle de 12 à 60 px et resserre progressivement l'approche des lettres, de +0,0025 em à −0,025 em ([Radix Themes](https://github.com/radix-ui/themes/tree/main/packages/radix-ui-themes/src/styles/tokens)). Inter offre un axe de taille optique jusqu'à « display » ainsi que les fonctions `tnum`, `case` et `ss02` ([rsms.me/inter](https://rsms.me/inter/)).

Inter, Geist, Fraunces, Instrument Serif, Bricolage Grotesque (axes opsz, wdth et wght), Source Serif 4, Newsreader, JetBrains Mono et Ojuju sont sous **SIL OFL 1.1** ([google/fonts](https://github.com/google/fonts/tree/main/ofl)). L'OFL autorise un logo sans mention et laisse l'auteur propriétaire du graphisme dérivé ([OFL-FAQ](https://openfontlicense.org/ofl-faq/)). Satoshi, en revanche, n'est pas sous OFL (sources secondaires : [fontalternatives](https://fontalternatives.com/alternatives/satoshi/)). Selon la veille communautaire, « Inter partout sans parti pris » fait partie des marqueurs d'interface générée ([925studios](https://www.925studios.co/blog/ai-slop-design-tells)).

**Inférence.** La typographie se répartit en trois voix.

| Voix | Police | Usages et réglages |
|---|---|---|
| Interface et réponses | **Inter** (déjà embarquée) | 14 px pour l'interface, 15/24 px pour les réponses ; `tnum` partout où l'on compare des chiffres ; taille optique « display » pour les titres |
| JEV | **JetBrains Mono** (déjà embarquée) | 12-13 px en chiffres tabulaires, pour les relevés : jetons, coût, ratio, durée |
| Marque | **Bricolage Grotesque** | Mot-symbole et grand titre d'accueil seulement |

Composer les réponses en Inter plutôt qu'en serif est volontaire. Avec une palette chaude et des réponses en serif, l'app redeviendrait un clone de Claude. JEV, lui, prend la voix d'un **instrument** : une lecture mesurée, pas une conversation.

Bricolage Grotesque est retenue pour son axe de chasse (wdth) : il permet de produire une version condensée de « MASSAMBA » pour les petites largeurs sans changer de famille. Une serif libre (Source Serif 4 ou Newsreader) reste réservée à l'aperçu des rapports longs.

Deux décisions reviennent à l'utilisateur. La règle maison n'autorise que les licences MIT, Apache-2.0 ou BSD pour le code exécuté : il doit trancher si l'OFL est admise comme licence de **ressource**, ce qu'Inter, déjà embarquée, fait de fait. Il doit aussi décider du sort de `lucide-react`, sous licence **ISC** ; `@phosphor-icons/react` en MIT en est l'alternative ([npm lucide-react](https://registry.npmjs.org/lucide-react/latest)).

### Profondeur, rayons et matière : une élévation par paliers, du verre seulement sur la navigation

D'après les jetons de Claude, les fonds sombres montent d'environ **+0,03 à 0,045 de L par niveau d'élévation**, à chroma quasi nulle (calcul des notes sur la [CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)). Vercel demande « at least two layers » d'ombre combinées à un filet semi-transparent, et un **rayon enfant inférieur ou égal au rayon parent**, en courbes concentriques ([Vercel](https://vercel.com/design/guidelines)). Geist fixe **6 px pour les contrôles, 12 px pour les menus et modales, 16 px pour le plein écran** ([Geist Materials](https://vercel.com/geist/materials)). Radix empile de 3 à 5 couches par ombre ([Radix Themes](https://github.com/radix-ui/themes/tree/main/packages/radix-ui-themes/src/styles/tokens)).

Apple réserve Liquid Glass à la **couche de navigation** : « Don't use Liquid Glass in the content layer », « Use Liquid Glass effects sparingly » ([Apple HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)). NN/g relève une baisse d'utilisabilité sous iOS 26 quand des contrôles translucides se posent sur des fonds chargés ([anderegg.ca, relais NN/g, 10/2025](https://anderegg.ca/2025/10/12/nielsen-norman-group-on-ios-26-usability)).

**Inférence.** L'élévation sombre proposée monte de 0,18 à 0,215, 0,25 puis 0,285 de L (+0,035 par palier), à teinte fixe. En clair, la profondeur vient surtout des ombres. Chaque surface flottante (menu, popover, feuille du bas) combine un filet translucide et deux couches d'ombre, ambiante et directe. Les rayons suivent l'échelle 6 / 12 / 16, sans exception.

Le verre dépoli est autorisé une seule fois par écran : sur la barre du bas mobile, ou sur l'en-tête quand le contenu défile dessous, jamais sur une carte de contenu. Pour le reste, les deux gestes premium les moins coûteux sont ceux de Linear 2026 : **moins de séparateurs et moins d'icônes**.

### Mouvement : des ressorts courts, coupés à la demande

Claude utilise `cubic-bezier(.4,0,.2,1)` sur 150 ms (53 et 49 occurrences), avec deux courbes à dépassement réservées aux moments ponctuels ([CSS claude.ai](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/c6a992d55-CGuUmOei.css)). Material 3 Expressive publie ses ressorts dans le code AndroidX. Le ressort *spatial default* (amortissement 0,8, raideur 380) sert à la position et à la taille. Les ressorts *effects*, sans rebond, servent à l'opacité et à la couleur ([ExpressiveMotionTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt)). Une recherche Google sur ce langage, rapportée de seconde main (46 études, plus de 18 000 participants), trouve un design expressif « bien appliqué » préféré à tous les âges ([Droid Life, 05/05/2025](https://www.droid-life.com/2025/05/05/material-3-expressive-might-be-the-future-of-android-design/)).

Vercel n'anime que `transform` et `opacity`, exige une variante `prefers-reduced-motion` et une pause pour toute animation de plus de 5 s ([Vercel](https://vercel.com/design/guidelines)). Le seuil de Doherty fixe une réponse à moins de 400 ms ([Laws of UX](https://lawsofux.com/)).

**Inférence.** Quatre jetons de mouvement suffisent. Les courbes `linear()` sont les approximations du ressort calculées dans la veille.

```css
@theme {
  --ease-effects: cubic-bezier(0.2, 0, 0, 1);              /* couleur, opacité : 120-160 ms */
  --dur-effects: 140ms;
  --ease-spring: linear(0, 0.096, 0.292, 0.5, 0.678, 0.812, 0.904, 0.962, 0.994,
                        1.009, 1.015, 1.015, 1.012, 1.009, 1.006, 1.004, 1); /* 410 ms, 1,5 % de dépassement */
  --dur-spring: 410ms;                                       /* panneaux, feuilles, cartes qui entrent */
}
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
                         transition-duration: 0.01ms !important; }
}
```

Le ressort rapide, avec 9,5 % de dépassement, est réservé à **une seule « touche de joie » par parcours** : la fin d'un export, ou un « vérifié » obtenu.

### La liste de contrôle anti-« bon marché », rendue automatisable

Les marqueurs relevés par les notes sont des opinions de praticiens, pas des études contrôlées. Ils se transforment pourtant presque tous en tests :

- aucun `transition: all` ;
- texte secondaire à au moins 4,5:1 ;
- au plus un effet de verre par écran ;
- au plus une pastille ou un compteur par ligne de liste ;
- cibles d'au moins 24 px, et 44 px sur mobile ;
- au moins deux couches d'ombre sur les surfaces flottantes ;
- aucun couple « indigo saturé » ni dégradé indigo → violet.

Ces seuils viennent de [Vercel](https://vercel.com/design/guidelines), de [Linear](https://linear.app/now/behind-the-latest-design-refresh) et de [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website). Un point reste à vérifier avant d'en faire une règle : la typographie française, avec les espaces insécables avant `: ; ! ?` et entre nombre et unité. C'est un détail de finition que les références anglophones n'ont pas. Seul l'espace insécable entre nombre et unité est sourcé ici ([Vercel](https://vercel.com/design/guidelines)) ; le reste est une hypothèse.

## L'accueil retient par la reprise, pas par le décor

Les preuves sur ce qui fait rester sont des **principes**, pas des études de rétention chiffrées. La veille n'en a trouvé aucune pour les apps d'IA ou de productivité sur la période 2024-2026.

- **Notion** a lancé en juin 2024 une page Home pour « revenir à un document récent » et voir agenda et tâches ([Notion 2.40, 11/06/2024](https://www.notion.com/en-gb/releases/2024-06-11)).
- **Laws of UX** définit plusieurs effets utiles ([lawsofux.com](https://lawsofux.com/)) :
  - l'effet Zeigarnik : on se souvient mieux des tâches inachevées ;
  - le gradient d'objectif : la motivation croît près du but ;
  - la règle pic-fin : on juge une expérience sur son pic et sa fin ;
  - les lois de Miller et de Hick : la mémoire de travail est limitée, et le temps de décision croît avec le nombre de choix.
- **Les états vides** doivent dire le statut, enseigner sur place et offrir un chemin direct, voire des données de démonstration ([NN/g](https://www.nngroup.com/articles/empty-state-interface-design/), 2021).
- **Les suggestions de prompts** ne doivent jamais dépasser cinq et doivent se renouveler avec le contexte ([AWS Cloudscape](https://cloudscape.design/patterns/genai/support-prompts)) ; l'app mobile de Claude en montre trois ([screensdesign](https://screensdesign.com/explore/ui-elements/ai-prompt-suggestions/)).
- **L'attente** se gère par paliers :
  - sous 1 s, rien ;
  - pour une page entière en moins de 10 s, un squelette aux dimensions exactes du contenu ;
  - au-delà de 10 s, une barre de progression ([NN/g](https://www.nngroup.com/articles/skeleton-screens/)) ;
  - un spinner n'apparaît qu'après 150 à 300 ms et reste visible 300 à 500 ms au minimum ([Vercel](https://vercel.com/design/guidelines)).

**Inférence.** Le Cockpit IA devient un accueil en trois bandes.

1. Une **salutation datée en français**.
2. Un **bloc « Reprendre »** : dernière conversation, dernier export inachevé, dernière analyse en cours, avec une progression quand elle existe. On reprend en un clic, ou par ⌘K puis Entrée.
3. **Trois suggestions** au plus, tirées des derniers fichiers et exports réels, jamais écrites en dur, plus un exemple de démonstration chargé en un clic.

Les listes d'épinglés et de récents s'arrêtent à 5-7 éléments, les plus importants en tête et en fin de liste. Le **Carnet JEV du jour** (voir plus bas) occupe une carte repliable de cet accueil. Les animations ne servent jamais d'habillage. La seule « joie » visible arrive au pic et à la fin d'un parcours. La singularité vient de la matière (couleur, typographie, mouvement) et non d'une structure inédite qui obligerait à réapprendre l'app.

## Un M tissé manjak remplace le carré au losange

Les identités IA de 2025 ont toutes cherché à se **démarquer du « bleu tech »** et à s'humaniser :

- **OpenAI** a dessiné OpenAI Sans avec un « O » volontairement imparfait ([Octet Design](https://octet.design/journal/openai-new-logo-gets-bold-rebrand) ; [Fast Company, 02/2025](https://www.fastcompany.com/91273217/open-ai-rebrand-chat-gpt-logo)).
- **Mistral** a choisi un « M » pixelisé et rayé qui cache un chat. Son système complet comprend un logo, une icône et un emblème, avec un espace de protection obligatoire et le monochrome sur les fonds chargés ([Mistral Brand](https://mistral.ai/brand)).
- **Perplexity** a construit son symbole sur l'astérisque de ses citations, puis l'a animé en curseur ([Ebaq Design](https://www.ebaqdesign.com/news/perplexity-rebrand)).
- **Vercel** décline un logotype et un symbole, choisis **selon le fond réel**, avec un espace de protection fondé sur la hauteur du symbole ([Vercel Brands](https://vercel.com/geist/brands)).
- **LogoLounge 2026** fait du mouvement le grand thème transversal de l'année ([The Dieline](https://thedieline.com/logoloung-releases-its-2026-trend-report-and-everything-is-on-the-move/)).

L'ancrage culturel demande de la rigueur.

- **Les Adinkra sont akan** (Ghana, Côte d'Ivoire), et non sénégalais. Une thèse ghanéenne conclut que la plupart des designers les utilisent mal ([UEW, 2021](https://ir.uew.edu.gh/handle/123456789/3194)). Une autre relève leur surexploitation au détriment des symboles d'autres peuples ([UGSpace](https://ugspace.ug.edu.gh/items/b40651f5-cb3b-4093-9dc5-06c01ba3c5d5)). Le noir et l'indigo de l'impression adinkra sont des **couleurs de deuil chez les Akan** ([UEW](https://ir.uew.edu.gh/handle/123456789/3173)).
- **Pour un nom sénégalais**, les sources légitimes sont sénégalaises :
  - le **tissage manjak**, l'un des plus recherchés du Sénégal selon le Met, aux motifs en zigzag, chevron, croix et losange ([The Met, Seru Njaago](https://metmuseum.org/art/collection/search/320506)) ;
  - le **souwèr**, peinture sous verre maintenue à Dakar ([Vitromusée Romont, 2024](https://vitromusee.ch/en/regards-du-senegal-souwer-de-la-collection-afric-art-2/)) ;
  - le **wolofal**, wolof écrit en caractères arabes, reconnu officiellement en 2002 ([Fallou Ngom, BU, 2022](https://www.bu.edu/articles/2022/fallou-ngom-discovers-ajami-african-writing-system/embed/)).
- **Le sens précis** des motifs manjak n'est documenté dans aucune source lue : le Met décrit les formes, pas leur signification.

Côté technique, le jeu de favicons tient en six fichiers :

| Fichier | Rôle |
|---|---|
| `favicon.ico` 32 px | Repli universel |
| `icon.svg` | Icône vectorielle, thème sombre intégré |
| `apple-touch-icon.png` 180 px | Logo à 140 px sur un fond plein |
| PNG 192 px et 512 px | Icônes d'application |
| `icon-mask.png` 512 px | Icône maskable, contenu tenu dans un cercle de **409 px** |

Ce jeu vient d'[Evil Martians](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs). La zone sûre de l'icône maskable est un cercle de 80 % du diamètre selon [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons), et il faut déclarer `any` et `maskable` séparément ([web.dev](https://web.dev/articles/maskable-icon)). Le `prefers-color-scheme` placé dans un SVG reste **peu fiable sous WebKit** ([WebKit 199134](https://bugs.webkit.org/show_bug.cgi?id=199134)), d'où un repli en JavaScript par `matchMedia`. Les logotypes sont exemptés du critère 1.4.3, mais les objets graphiques nécessaires à la compréhension doivent atteindre **3:1** ([W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

**Inférence : le système proposé.**

**Le symbole.** C'est un **« M » formé de deux chevrons tissés** qui se croisent dessus-dessous, construit sur une grille de 32 unités. Au centre, un **losange tissé** reprend le motif manjak, et prolonge aussi le losange du logo actuel : les utilisateurs actuels gardent leur repère. La logique du fil rejoint celle du pixel. En version 16 px, les bandes font 4 unités (2 px) et le dessin se limite à trois formes. La version « hero » affine les fils à 2 unités et montre les croisements.

**Les déclinaisons.** Il y en a trois, sur le modèle de Vercel et Mistral :

- *complète* : symbole + « MASSAMBA » + « Workbench » ;
- *compacte* : symbole + « MASSAMBA » ;
- *icône* : symbole seul.

On passe de l'une à l'autre par des **requêtes de conteneur** sur la largeur réelle de l'en-tête, jamais par troncature. Seuils de départ, à mesurer : environ 180 px pour la complète, 96 px pour la compacte.

**Le mot-symbole.** « MASSAMBA » est composé en Bricolage Grotesque en capitales, approche réglée à la main sur les couples AM, MA et MB, avec une coupe condensée tirée de l'axe wdth, puis vectorisé en chemins SVG. Une fois vectorisé, il n'embarque aucune police et sort du champ de l'OFL.

**La couleur.** Le symbole est en latérite sur papier (`#b3442e`, 5,11:1) et en latérite claire sur fond sombre (`#eb9259`, 7,89:1). La tuile d'icône (apple-touch, maskable) est en **indigo profond** `#1f2a5c`. Sur cette tuile, seule la latérite claire passe (5,69:1) : la latérite du thème clair tombe à 2,45:1 (calcul local). La tuile indigo disparaît sur le fond sombre de l'app (1,39:1). Elle reste donc réservée aux icônes système.

**Le mouvement.** Les fils « se tissent » en 300 à 800 ms à la première apparition et pendant un état actif de JEV. L'animation se fige sous `prefers-reduced-motion`, et le logo statique reste complet.

**L'idée qui dépasse les références.** Le même SVG source produit le favicon calé sur les pixels, l'icône maskable, une **trame de tissage** pour les en-têtes des exports Office et les génériques des films, et l'animation de JEV. La marque devient ainsi cohérente entre l'app, les livrables et les vidéos, un terrain qu'aucune des références étudiées n'occupe.

**Les garde-fous.**

- Citer la source muséale de chaque motif dans le guide de marque.
- Ne jamais présenter un Adinkra comme signe d'identité.
- Ne pas utiliser de clin d'œil wolofal (la lettre *mīm* م) sans la validation d'un locuteur ou d'un calligraphe sénégalais, en raison de la charge religieuse de l'écriture.
- Faire relire le symbole par au moins une personne sénégalaise **avant toute publication**.

Ojuju, une police OFL de la fonderie lagosienne Ụdị ([google/fonts](https://raw.githubusercontent.com/google/fonts/main/ofl/ojuju/METADATA.pb)), peut servir d'accent. Il faut alors la présenter comme le travail d'un typographe africain, et non comme une police sénégalaise : aucune fonderie sénégalaise n'a été trouvée.

## Douze rubriques à portée de pouce, clavier compris

### Navigation : 4 + « Plus » au téléphone, un rail sur tablette, une palette partout

Material 3 réserve la barre du bas à **3 à 5 destinations** et recommande le tiroir au-delà ([Android Developers](https://developer.android.com/develop/ui/compose/components/navigation-bar)). Il recommande aussi une navigation par classe de largeur ([Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes)) :

- **compact** (moins de 600 dp) : une barre ;
- **moyen** (600 à 839 dp) : un rail ;
- **étendu** (840 dp et plus) : un tiroir.

NN/g mesure le coût de la navigation cachée ([NN/g, 2016](https://www.nngroup.com/articles/hamburger-menus/)) et confirme qu'il persiste même si l'icône hamburger est aujourd'hui reconnue ([NN/g](https://www.nngroup.com/articles/hamburger-menu-icon-recognizability/)). Les grandes apps de chat gardent l'historique dans un tiroir et ouvrent outils et modèles dans des feuilles du bas, d'après des inspections de tiers, faute de documentation officielle ([IntuitionLabs](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025)).

**Inférence.** Le dispositif varie selon la largeur.

| Largeur | Navigation |
|---|---|
| Moins de 600 px | Barre du bas à cinq positions : quatre rubriques et un onglet « Plus » |
| 600 à 1023 px | Rail de 72 à 80 px, icône et libellé court |
| 1024 px et plus | Barre latérale complète repliable, proche de l'actuelle |

Les quatre rubriques par défaut de la barre du bas sont Chats, Cockpit IA, Fichiers et Bac à sable. « Plus » ouvre une feuille avec les huit autres rubriques en grille 2×4, sur des tuiles d'au moins 48 px avec icône et libellé. L'historique des conversations reste dans un tiroir ouvert depuis l'en-tête du chat.

L'innovation est un **« Plus » adaptatif**. La feuille trie les huit rubriques par fréquence d'usage locale, et un badge s'allume sur « Plus » quand une rubrique cachée a une activité (export prêt, tâche finie). On réduit ainsi le coût de découvrabilité mesuré par NN/g sans dépasser cinq positions.

La **palette ⌘K** s'ajoute à cette navigation visible et ne la remplace pas. Elle donne accès aux 12 rubriques, aux conversations, aux fichiers et aux actions, avec les raccourcis existants (Alt+1 à Alt+0) affichés en `kbd`.

Pour ne pas casser une habitude, la palette s'ouvre avec **« Nouvelle conversation » comme premier élément**. Aujourd'hui, Ctrl+K crée directement une session. Demain, Ctrl+K puis Entrée produira le même résultat, et la palette devient la colonne vertébrale de l'app. `cmdk` (MIT) suffit pour la construire ([npm cmdk](https://registry.npmjs.org/cmdk/latest)).

### Compositeur : la saisie, Envoyer et Joindre ne débordent jamais

SAP Fiori classe les actions d'une barre d'outils par priorité : NeverOverflow, High, Low, AlwaysOverflow. Les actions de priorité basse partent en premier dans un menu « … », et les actions liées débordent ensemble ([SAP Fiori](https://www.sap.com/design-system/fiori-design-web/v1-139/ui-elements/toolbar-overview/usage)). Le tout peut se faire en CSS pur, avec des requêtes de conteneur ([NVIDIA Elements](https://nvidia.github.io/elements/docs/patterns/responsive/)).

**Inférence.** À 390 px, le compositeur répartit ses contrôles ainsi :

- **toujours visibles** : la saisie, Envoyer/Stop et Joindre ;
- **en priorité haute** : le sélecteur de modèle, en puce courte ;
- **dans la feuille « + »** : outils, mode, recherche web, effort, réglages JEV et budget.

Le compositeur ne montre donc **pas plus de trois boutons-icônes** en plus de la saisie, tous d'au moins 44 px.

Pour que cacher un contrôle ne cache pas son état, tout réglage différent de sa valeur par défaut apparaît en **puce supprimable** au-dessus de la saisie, par exemple « Recherche web » ou « Plafond 0,50 $ ». Un seul état React alimente les deux rendus, la puce et la feuille.

### Clavier virtuel : une recette en trois couches

Safari iOS **ignore `interactive-widget=resizes-content`**, et `100dvh` ne rétrécit pas quand le clavier s'ouvre. ChatGPT compense avec une variable de hauteur du clavier suivie par `visualViewport`. Claude impose un plancher de taille de police pour éviter le zoom ([mieweb/ui #494, 24/09/2026](https://github.com/mieweb/ui/issues/494)). Chrome Android fonctionne en `resizes-visual` depuis sa version 108 ([Chrome for Developers](https://developer.chrome.com/blog/viewport-resize-behavior)), et `interactive-widget` n'est pris en charge que par Chrome et Firefox sur Android ([caniuse](https://caniuse.com/mdn-html_elements_meta_name_viewport_interactive-widget)). L'API VirtualKeyboard est expérimentale, limitée à Chromium et réservée aux contextes sécurisés : elle est donc **inutilisable en `file://`** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)). Enfin, la zone sûre laisse un vide d'environ 42 px au-dessus du clavier si on ne la remet pas à zéro ([1sl2tp/chat PR #143](https://github.com/1sl2tp/chat/pull/143)).

**Inférence.** La recette tient en trois couches.

1. **La balise viewport** : `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.
2. **Un écouteur `visualViewport`** qui écrit `--kb = max(0, innerHeight − vv.height − vv.offsetTop)` sur `:root`. La variable vaut 0 sur Android, où la page se redimensionne déjà, et la hauteur du clavier sur iOS. Une seule règle, `padding-bottom: var(--kb)`, couvre donc les deux plateformes.
3. **La zone sûre** : `max(env(safe-area-inset-bottom), .5rem)` quand le clavier est fermé, `.5rem` quand il est ouvert.

La saisie reçoit en plus :

- une taille de police `max(16px, 1rem)` ;
- une hauteur maximale `min(40svh, 24rem)` ;
- `enterkeyhint="send"` ;
- aucun `autoFocus` sur mobile, pour ne pas ouvrir le clavier à chaque changement de rubrique.

### Accessibilité WCAG 2.2 : les règles qui touchent cette coquille

WCAG 2.2 (Recommandation du 05/10/2023) fixe plusieurs exigences pour cette coquille :

- **Cibles (2.5.8 AA).** Elles mesurent **24×24 px CSS** au minimum, sauf exception d'espacement ([W3C 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Apple demande 44 pt et Material 48 dp.
- **Focus non masqué (2.4.11 AA).** Un élément qui reçoit le focus ne doit jamais être entièrement caché par un en-tête ou un pied collant (échec F110). La technique suffisante est `scroll-padding` (C43) ([W3C 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
- **Apparence du focus (2.4.13 AAA).** L'indicateur couvre au moins un périmètre de 2 px avec un contraste d'au moins 3:1 ([W3C 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)).
- **Préférences système.** `prefers-contrast` et `forced-colors` sont Baseline depuis 2022 ([MDN prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast) ; [MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)).
- **Typographie fluide (1.4.4).** Une taille en `vw` seul ne grandit pas au zoom. La valeur doit mêler `rem` et `vw` et rester lisible à 200 %, ce que vérifie `utopia-core` ([Smashing, 11/2023](https://smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type)).

**Inférence.** La règle maison suit ces exigences.

- **Cibles.** 44×44 px sur mobile ; 24 px avec espacement sur bureau en mode dense.
- **Défilement.** `scroll-padding-block: var(--header-h) calc(var(--composer-h) + var(--kb))` sur le fil, avec `--composer-h` mesuré par un `ResizeObserver`.
- **Focus.** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`. La latérite atteint 5,11:1 en clair et 7,89:1 en sombre sur le fond, ce qui vise le niveau AAA à faible coût.
- **Couleurs forcées.** Un bloc `forced-colors` remplace les ombres porteuses de sens par `CanvasText` et utilise `Highlight` pour la sélection.

Les tableaux de bord passent en requêtes de conteneur : deux tuiles KPI d'environ 171 px par ligne à 390 px, une valeur en 24-28 px tabulaire, et aucun défilement horizontal dans la vue principale. Cette règle empirique vient de praticiens et d'éditeurs BI, pas d'une étude ([Infor Birst](https://docs.infor.com/birst/2025.x/en-us/birstolh/mobile_user/nsc1655271156432.html)).

### Plateforme : tout est Baseline, sauf l'installation en `file://`

Toutes les briques nécessaires sont désormais disponibles dans les navigateurs courants :

- requêtes de conteneur : largement disponibles depuis août 2025 ([web.dev](https://web.dev/blog/baseline2023)) ;
- View Transitions dans un même document : Baseline avec Firefox 144, en octobre 2025 ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)) ;
- positionnement par ancre : avec Firefox 147, en janvier 2026 ([web.dev](https://web.dev/blog/web-platform-01-2026)) ;
- API Popover : depuis le 27/01/2025 ([web.dev](https://web.dev/blog/popover-baseline)) ;
- `text-wrap: pretty` : **non pris en charge par Firefox**, donc à traiter en amélioration progressive ([caniuse](https://caniuse.com/mdn-css_properties_text-wrap_pretty)).

Une PWA **ne s'installe pas depuis `file://`**. Il faut HTTPS ou `localhost` ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/CycleTracker/Secure_connection)), ainsi que des icônes de 192 et 512 px dans le manifeste ([web.dev](https://web.dev/articles/install-criteria)).

**Inférence.** Le fichier HTML unique garde les réglages passifs : viewport, deux `theme-color` (clair et sombre) et `color-scheme`. L'installation se fait seulement si l'utilisateur sert l'app sur `localhost`. Le dépôt étant public et les envois proscrits, aucun hébergement distant n'est proposé.

## JEV en quatre étages : présence, état, preuve, contrôle

### Ce que les guides imposent, et ce que JEV fait mieux qu'eux

Les guides officiels convergent.

- **Microsoft HAX** demande de rendre clair ce que l'IA sait faire et à quel point elle le fait bien (G1, G2), pourquoi elle a agi (G11), et d'offrir des contrôles globaux (G17) ([HAX](https://www.microsoft.com/en-us/haxtoolkit/library/)).
- **Apple** exige de « Communicate where your app uses AI » et préfère un retour précis, comme « Summarizing key themes from your notes », à un « Processing… », parce que « Specific feedback reduces uncertainty ». Les contrôles Edit, Undo, Retry et Adjust doivent se trouver près du contenu généré ([Apple HIG Generative AI, mis à jour le 08/06/2026](https://developer.apple.com/design/human-interface-guidelines/generative-ai)).
- **Carbon for AI** fait de l'étiquette IA le repère principal, ouvrant une popover en quatre sections : vue d'ensemble, détails, preuves et actions. Les explications n'y apparaissent qu'à la demande, et un bouton « revert » restaure la version de l'IA après une modification ([Carbon AI label](https://carbondesignsystem.com/components/ai-label/usage/)).
- **NN/g** ajoute deux avertissements. Personne n'associe l'étincelle à l'IA ([NN/g, 20/09/2024](https://www.nngroup.com/articles/ai-sparkles-icon-problem/)). Et les explications pas à pas des LLM sont « often unfaithful », des rationalisations a posteriori ; NN/g déconseille aussi le langage anthropomorphe ([NN/g, 12/12/2025](https://www.nngroup.com/articles/explainable-ai/)).
- **La recherche** confirme que la confiance verbalisée par un agent « may actively mislead users ». Elle recommande de lui opposer une fiabilité mesurée ([arXiv 2602.16666](https://arxiv.org/pdf/2602.16666)).

C'est là que JEV détient un avantage décisif. Ses étapes ne sont pas une chaîne de pensée générée : ce sont des **événements système journalisés**. `direct/views/JevTrace.tsx` enchaîne déjà, avec durée, jetons, coût et décision à chaque point de contrôle :

`JEV_PRE → TASK DNA → ROUTING → CONTEXT → TOOLS → EXECUTION → QA → CORRECTION → POST → LEARNING`

Le registre d'innovations du projet note en plus une **confiance apprise par famille de tâches (borne de Wilson)** et une économie de **÷95 mesurée** de bout en bout au tarif du catalogue (`registre_innovations.md`, 15/10/2026).

**Inférence.** Afficher ces événements tient la règle G11 de façon **fidèle par construction**, et afficher la borne de Wilson tient G2 avec une fiabilité mesurée plutôt que déclarée. Aucune app de référence ne fait les deux, et aucun produit trouvé n'expose un schéma « brouillon gratuit + correctifs premium ». La présentation est donc à inventer, puis à tester.

### Le vocabulaire visuel : quatre étages, chacun avec son budget d'attention

L'industrie s'est stabilisée sur quatre étages :

1. **une signature lumineuse ou colorée réservée à l'IA** : la lueur de bord de Siri ([SlashGear](https://www.slashgear.com/1865686/iphone-glowing-around-edges-reason/)), les dégradés de Gemini dont le mouvement « is an essential guiding element » ([Google Design](https://design.google/library/gemini-ai-visual-design)) ;
2. **une ligne d'état précise** pendant l'attente ;
3. **une chronologie repliable** : les étapes de Perplexity, conçues parce que les utilisateurs attendent plus volontiers quand la progression est visible ([LangChain, Perplexity](https://www.langchain.com/breakoutagents/perplexity)), et le motif Stream of Thought, « a bounded box, with details minimized » ([Shape of AI](https://www.shapeof.ai/patterns/stream-of-thought)) ;
4. **des marques en ligne sur le contenu** : le « double-check » de Gemini surligne en vert ou orange chaque énoncé ([Aide Gemini](https://support.google.com/gemini/answer/14143489?hl=en)).

Les indicateurs de présence réduisent aussi la perturbation causée par un agent proactif ([Pu et al., arXiv 2502.18658](https://arxiv.org/abs/2502.18658)).

**Inférence.** JEV reprend ces quatre étages, avec une règle de discipline : **un seul élément JEV permanent par zone, tout le reste à la demande**. Le tableau ci-dessous sert à la fois de spécification et de garde-fou contre l'encombrement.

| Zone | Toujours visible | À la demande | Interdit |
|---|---|---|---|
| En-tête (12 rubriques) | **Pastille JEV** : signe tissé + état en un mot + économie du jour **mesurée** | Panneau JEV (l'actuel `JevView`) en panneau latéral sur bureau, en feuille sur mobile | Compte à rebours du solde, étincelle seule |
| Compositeur | Puce d'état si un réglage JEV diffère du défaut | Aperçu du coût avant action, si l'action est significative (« Refaire en premium : ~{coût} ») | Coût affiché pour le chemin gratuit, autre que « gratuit » |
| Pendant la génération | Ligne d'état précise : « JEV compacte le contexte : {avant} → {après} jetons », « Vérification premium : {n} passages à corriger » | Bouton Stop toujours visible | « Je réfléchis… », « Processing… » |
| Pied de chaque réponse | **Reçu JEV replié en une ligne** (« gratuit · vérifié · ÷{N} ») qui **remplace** les cartes `intel`, `routing`, `jev` et `usage` | Dépliage en quatre sections Carbon : ce que JEV a fait / détails (modèles, jetons, coût réel, coût standard) / preuves (trace, passages corrigés) / actions | Plusieurs cartes méta empilées dans le fil |
| Texte de la réponse | Soulignement fin indigo des passages **corrigés** par le vérificateur | Popover « brouillon → correctif » + raison + **revenir au brouillon** | Un état « confirmé » non produit par le code |
| Cockpit (accueil) | Carnet JEV du jour, une carte repliable | Chaque ligne mène à sa preuve | Plus d'un carnet par jour |
| Catalogue LLM | Fiabilité **mesurée** par famille (borne basse de Wilson, n appels) | Pourquoi ce modèle (`RoutingCard`) | Confiance auto-déclarée par le modèle |
| Coûts | Règle par décades ÷1 → ÷1000 et taux d'économie effectif (déjà livrés) | Détail par chemin | Économie estimée présentée comme mesurée |
| Paramètres | Une seule carte de réglages globaux JEV | — | Réglages JEV dispersés |
| Tout l'écran | **Une seule lueur, réservée à « vérification premium en cours »** | — | Lueur décorative ou permanente |

Le signe de présence est un **état discret, pas une mascotte**. Il prend six formes, chacune avec son mouvement fonctionnel : repos, compacte, route, rédige, vérifie, apprend. Sous `prefers-reduced-motion`, la forme change sans animer. JEV ne s'écrit jamais avec une étincelle seule : il porte toujours la marque et le libellé « JEV », comme le recommande NN/g.

### Coût et économies : un reçu, pas un compteur

Les coûts rassurent quand ils sont annoncés au moment de décider, dans une unité explicite, en fourchette, et avec une alternative moins chère. Il ne faut pas les enfouir dans les réglages ([Shape of AI, Cost estimates](https://www.shapeof.ai/patterns/cost-estimates)). Un écart entre l'estimation et le coût final érode la confiance (même source). L'« anxiété des jetons » est décrite par des blogs, pas par une étude contrôlée : prompts raccourcis artificiellement, rafraîchissement compulsif du solde ([Tian Pan, 09/05/2026](https://tianpan.co/blog/2026-05-09-ai-wallet-token-budget-product-surface)). Aujourd'hui, l'en-tête de l'app montre le **solde du fournisseur** (`CreditsGauge`), donc ce que l'on dépense.

**Inférence.** JEV a une histoire de coût positive, et le cadrage par défaut doit devenir **« ce que JEV a économisé »**.

- **Pastille d'en-tête.** Elle affiche l'économie du jour ; le solde passe dans la popover.
- **Reçu de chaque réponse.** Il dit gratuit ou payé, le modèle brouillon, le modèle vérificateur, les jetons avant et après compactage, le coût réel et le coût standard, c'est-à-dire tout en premium.
- **Ratio ÷N.** Il ne s'affiche **que s'il est calculé à partir du registre de coûts de la requête**. C'est la consigne « ne jamais fabriquer d'économies ».
- **Unité.** L'utilisateur choisit entre FCFA et dollar.
- **Alerte.** Elle n'apparaît qu'au seuil d'un plafond **appliqué par le code**.

### Arrière-plan, ton et contrôle : un carnet, une boîte, des gestes

**Les références.** LangChain distingue trois intensités pour les agents ambiants, réunies dans une « Agent Inbox » : *notify*, *question*, *review* ([LangChain, 01/2025](https://blog.langchain.com/introducing-ambient-agents)). ChatGPT Pulse livre de 5 à 10 cartes par jour, qui **expirent** si on ne les enregistre pas ([YourStory](https://yourstory.com/ai-story/openai-chatgpt-pulse-pro-daily-briefings)). Côté ton, une IA ne doit jamais faire croire qu'elle est humaine ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/generative-ai)) et doit « minimizing markers of consciousness » ([Suleyman, via Simon Willison, 21/08/2025](https://simonwillison.net/2025/Aug/21/mustafa-suleyman)). Côté contrôle, les références attendent Stop, un plan modifiable avant exécution ([Cursor Plan Mode](https://cursor.com/docs/agent/plan-mode)), une confirmation avant toute action significative, et un retour à la version d'origine ([Carbon](https://carbondesignsystem.com/components/ai-label/usage/)).

**Inférence.** JEV s'organise ainsi.

**Le Carnet JEV du jour.** C'est une carte factuelle et périssable : « Hier, JEV a compacté {n} requêtes, vérifié {n} brouillons ({n} corrigés), appris {n} leçons, repéré {n} outil(s) en veille ». Chaque chiffre est lu dans le journal, et chaque ligne mène à sa preuve.

**La Boîte JEV.** Elle a trois couloirs :

- *Pour info* : veille, leçons apprises ;
- *Question* : JEV a besoin d'un choix ;
- *À valider* : adopter un outil, appliquer une leçon globale.

Aucune notification push par défaut. Un point discret sur la pastille signale seulement les « À valider ».

**Le ton.** JEV parle à la troisième personne, en instrument : « JEV a vérifié… », jamais « je pense ». Sa personnalité, vive, précise et sobrement fière de ses économies, se montre dans le carnet et les messages de succès. Elle n'apparaît jamais dans les erreurs, qui restent en langage simple avec la prochaine étape.

**Les gestes de contrôle de la ligne JEV.**

- Stop.
- Refaire en premium, avec le coût estimé.
- Sans JEV pour ce message : le repli non-IA d'Apple, utile aussi en diagnostic.
- Voir le plan, pour les tâches longues.
- Oublier cette leçon, en montrant sa conséquence : « s'appliquera aux prochains exports Excel ».

**Les réglages globaux.** Une seule carte réunit : niveau de présence (discret, standard ou démonstration, par analogie avec Mico, que Microsoft permet de désactiver ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/meet-the-new-clippy-microsoft-unveils-copilots-mico-avatar))), veille et ses sujets, plafond dur, politique de vérification (toujours, risque élevé ou jamais) et liste des leçons modifiable.

**Les trois états de vérification.** Ils s'inspirent du double-check de Gemini, mais sont produits par JEV lui-même :

- *corrigé* : le vérificateur a modifié le passage ;
- *confirmé* : relu sans changement ;
- *non vérifié* : vérification sautée par politique de coût, et dit explicitement.

Quand rien n'est corrigé, le reçu affiche « Vérifié · aucun correctif ». C'est la preuve que le contrôle a eu lieu.

## Conclusion

Le premier enseignement de cette veille est contre-intuitif : le premium de MASSAMBA ne viendra pas d'un effet de plus. Il viendra d'**une différence mesurable et d'une preuve visible**.

La différence mesurable, c'est un accent sorti de la teinte de Claude, contrôlé par une distance OKLab, et un monogramme tissé qui raconte une origine sénégalaise vérifiable au lieu d'emprunter un symbole akan. La preuve visible, c'est JEV. Les autres apps montrent des « raisonnements » que la recherche juge infidèles et des confiances mal calibrées. JEV peut montrer des **événements** : compactage, routage, correctifs, leçon appliquée, économie au tarif réel. Exposer ces événements, sobrement, en un reçu d'une ligne et un soulignement, fait de la transparence un trait de marque, que des concurrents qui n'ont pas cette architecture ne peuvent pas copier.

Le second enseignement porte sur l'ordre des travaux. Les défauts les plus coûteux pour la confiance sont aussi les moins glamour : un texte indicatif illisible, un zoom intempestif sur iPhone, une animation sans arrêt. Ils se corrigent en un lot et se vérifient par script. Deux inconnues demandent des mesures plutôt que des opinions : l'effet réel sur la rétention, faute d'étude publique, et la réception du symbole par des personnes sénégalaises. Le plan ci-dessous traite donc ces deux points comme des **portes de validation**, pas comme des détails.

## Plan de mise en œuvre priorisé et critères d'acceptation

Le plan suit l'ordre « défauts objectifs → système → JEV → identité → plaisir ». Chaque lot passe par la chaîne de livraison existante : `npm run build:direct`, puis le dossier « A ENVOYER », sans envoi sur le dépôt. Les tailles relatives sont des estimations : S pour petite, M pour moyenne, L pour grande.

| Priorité | Lot | Contenu | Fichiers principaux | Taille |
|---|---|---|---|---|
| **P0** | Socle accessible et mobile | Balise viewport en trois couches et variable `--kb` ; saisie à 16 px, `enterkeyhint`, pas d'`autoFocus` sur mobile ; textes indicatifs et pied de réponse passés au gris secondaire ; `prefers-reduced-motion` et `forced-colors` ; anneau de focus de 2 px ; `scroll-padding` du fil ; cibles de 44 px ; suppression de `transition-all` et de l'animation sur `width` ; mot-symbole sans `truncate`, avec la déclinaison compacte en attendant le logo | `direct/index.html`, `web/styles.css`, `direct/views/ChatView.tsx`, `direct/App.tsx`, `web/components/ui.tsx` | M |
| **P1** | Jetons v2 en OKLCH | Neutres H 80, accent latérite, échelle indigo JEV, statuts, élévation à +0,035, filets à 8-15 % et bordures de champ à 48 % / 36 %, ombres à deux couches, rayons 6 / 12 / 16, typographie (Inter, JetBrains Mono, Bricolage Grotesque selon la décision de licence), jetons de mouvement | `web/styles.css` (`@theme`) | M |
| **P1** | Navigation des 12 rubriques | Barre du bas 4 + « Plus » adaptatif avec badge ; rail de 600 à 1023 px ; palette ⌘K avec « Nouvelle conversation » en tête ; puces d'état et débordement par priorités dans le compositeur | `direct/App.tsx`, `direct/lib/nav.ts`, `ChatView.tsx` | L |
| **P1** | JEV, étages 1 et 2 | Pastille d'en-tête et panneau JEV accessible depuis toutes les rubriques ; ligne d'état précise ; reçu JEV unique qui remplace les cartes `intel`, `routing`, `jev` et `usage` ; cadrage de l'en-tête sur l'économie | `direct/App.tsx`, `ChatView.tsx`, `JevView.tsx`, `CreditsGauge.tsx` | L |
| **P2** | JEV, étages 3 et 4, et contrôle | Chronologie repliable (`JevTrace`) dans le reçu ; soulignement des passages corrigés, popover brouillon → correctif et retour au brouillon (dépend de positions de correctifs exposées par le moteur) ; fiabilité de Wilson dans le Catalogue ; carte de réglages globaux ; gestes de contrôle | `JevTrace.tsx`, `RoutingCard.tsx`, moteur JEV, `SettingsViews.tsx` | L |
| **P2** | Identité « M tissé » | Esquisses, **relecture sénégalaise (porte de validation)**, symbole en 16 et 32 px et hero, mot-symbole vectorisé, trois déclinaisons en requêtes de conteneur, jeu de six favicons et repli `matchMedia`, guide de marque avec les sources des motifs | `direct/App.tsx` (`Logo`), ressources SVG et PNG | M |
| **P3** | Accueil et rétention | Bloc « Reprendre », trois suggestions contextuelles, démo en un clic, Carnet JEV du jour, Boîte JEV à trois couloirs, une « joie » par parcours, trame de tissage dans les exports et génériques | `CockpitView.tsx`, `HomeView.tsx`, exports | M |
| **P3** | Installation locale (option) | Manifeste et icônes `any` / `maskable` quand l'app est servie sur `localhost` | ressources de livraison | S |

Chaque critère ci-dessous est vérifiable par un script, un test Playwright ou un contrôle humain explicite. La colonne « Origine du seuil » distingue les seuils sourcés des seuils proposés ici.

| N° | Critère d'acceptation | Mesure | Origine du seuil |
|---|---|---|---|
| A1 | Tout jeton de texte (principal, secondaire, accent, JEV, statuts) atteint **≥ 4,5:1** sur chaque surface, dans les deux thèmes ; les textes indicatifs aussi | Script de contraste sur `@theme` (valeurs du tableau de couleur : minimum 4,60:1) | WCAG 1.4.3 |
| A2 | Bordures de champ, icônes porteuses de sens et anneau de focus atteignent **≥ 3:1** | Script ; bordure de champ ≥ 48 % (clair) et 36 % (sombre) d'opacité | WCAG 1.4.11, 2.4.13 |
| A3 | Distance OKLab entre l'accent et `#d97757` comme `#c6613f` **≥ 0,06** dans les deux thèmes | Script (valeur proposée : 0,075) | Proposé par la veille |
| A4 | Aucun jeton avec H entre 260 et 300 et C > 0,15 ; aucun dégradé indigo → violet | Script sur les jetons et recherche dans le code | Inférence affinée de [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) |
| A5 | Zéro `transition-all` ou `transition: all` ; aucune animation de `width`, `height` ou `top` | Recherche dans le code / lint | [Vercel](https://vercel.com/design/guidelines) |
| A6 | Sous `prefers-reduced-motion: reduce` émulé, aucune animation en boucle ne tourne | Playwright `emulateMedia` + `getAnimations()` | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) |
| A7 | À 390×844, `scrollWidth ≤ innerWidth` sur les 12 rubriques | Playwright, une page par rubrique | Notes responsive |
| A8 | Sur mobile, chaque rubrique est atteignable en **≤ 2 gestes**, et les 4 de la barre en 1 geste | Playwright | Inférence (« Plus » adaptatif) |
| A9 | Toute cible interactive mesure ≥ 44×44 px sur mobile et ≥ 24×24 px sur bureau, ou respecte l'exception d'espacement | Script sur les boîtes englobantes | WCAG 2.5.8 ; règle maison |
| A10 | Clavier ouvert (iPhone 390×844, Pixel) : écart de **0 à 8 px** entre le compositeur et le clavier ; dernier message visible | Test sur appareil réel et capture | Notes responsive |
| A11 | Taille calculée de la saisie ≥ 16 px sur mobile ; aucun `autoFocus` au changement de rubrique | Playwright | [mieweb/ui #494](https://github.com/mieweb/ui/issues/494) |
| A12 | En tabulant dans chaque rubrique, l'élément focalisé n'est **jamais entièrement masqué** par l'en-tête, la barre du bas ou le compositeur | Playwright (intersection de l'élément avec la zone visible hors bandeaux) | WCAG 2.4.11 |
| A13 | Avec `forced-colors: active` émulé, les icônes et la sélection restent visibles | Playwright et capture relue | [MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) |
| A14 | Au zoom de 200 %, aucun texte coupé ; `wcagViolation` vide dans `utopia-core` | Playwright et script | WCAG 1.4.4 |
| A15 | Le mot-symbole n'est **jamais tronqué** : la déclinaison change à 320, 390, 768 et 1280 px | Playwright (aucune `text-overflow: ellipsis` sur la marque) | Inférence |
| A16 | Le symbole atteint ≥ 3:1 dans les deux thèmes ; l'icône maskable passe la zone sûre ; un même SVG source produit favicon, icône maskable, trame et animation | Script, DevTools Application, revue des fichiers | WCAG 1.4.11 ; [web.dev maskable](https://web.dev/articles/maskable-icon) |
| A17 | **Validation écrite d'au moins une personne sénégalaise** avant publication du symbole ; chaque motif cité avec sa source muséale dans le guide | Contrôle humain | Garde-fou des notes logo |
| A18 | Chaque valeur affichée par JEV (reçu, carnet, pastille, ÷N) porte l'identifiant de l'événement de journal qui la produit ; ÷N et « vérifié » n'apparaissent pas sans cet événement | Test unitaire sur le modèle de vue | Consigne « ne jamais fabriquer » ; [arXiv 2602.16666](https://arxiv.org/pdf/2602.16666) |
| A19 | Par réponse, **une seule** ligne JEV, repliée par défaut ; au plus une lueur par écran ; aucune notification push par défaut ; au plus un carnet par jour | Playwright sur un fil de démonstration | Inférence (budget d'attention) |
| A20 | Aucun texte d'interface de JEV à la première personne (« je ») ; JEV jamais représenté par une étincelle sans libellé | Recherche dans les chaînes de l'interface | [NN/g 2025](https://www.nngroup.com/articles/explainable-ai/) ; [NN/g 2024](https://www.nngroup.com/articles/ai-sparkles-icon-problem/) |
| A21 | Retour visuel d'interaction en moins de 400 ms ; spinner seulement après 150-300 ms ; squelettes aux dimensions finales (aucun saut de mise en page à l'arrivée du contenu) | Trace de performance Playwright | [Laws of UX](https://lawsofux.com/) ; [Vercel](https://vercel.com/design/guidelines) |
| A22 | Après ajout des polices, chaque fichier livré reste sous **30 Mio** | `npm run build:direct` (contrôle de taille existant) | Consigne de livraison |
