# Designs premium, sites réels et logo

## Avant chaque livrable
Une demande qui réclame un fichier (Excel, Word, PowerPoint, PDF, mail, site, application) ouvre la galerie **avant tout appel au modèle**. Elle s'ouvre aussi si le modèle écrit lui-même un fichier Office en Python ou en JavaScript.

## Sources de design
| Source | Ce qui est repris | Comment |
|---|---|---|
| 14 designs intégrés | palette, police | jetons du thème |
| Image trouvée sur Internet | mise en page complète, palette, police | lecture par un modèle vision |
| **Site réel (URL)** | couleurs **exactes**, polices, arrondis, ombres, variables CSS, navigation, structure | HTML et CSS du site lus via r.jina.ai, capture d'écran lue par un modèle vision |

### Galerie Internet
- 12 filtres de style et une recherche libre.
- Chaque page lance 4 recherches différentes ; « Plus de designs » charge la page suivante sans doublon.
- Il faut une clé Tavily.

### Sites réels
- Environ 6 lectures r.jina.ai par site (gratuit, 20 par minute) et un petit appel vision.
- Les logos, photos et textes du site ne sont jamais copiés.

## Logo
- **Choix :** sans logo, une image du chat, ou un logo importé.
- **Recoloration harmonieuse** (`server/services/logoHarmony.ts`) :
  - les familles de couleurs du logo sont trouvées par k-means ;
  - chaque famille reçoit un rôle : fond, blanc, noir ou couleur de marque ;
  - fond → couleur principale, couleurs de marque → accent puis séries (teintes distinctes), blanc conservé si lisible (sinon couleur sombre de la palette).
- **Dessin intact** :
  - chaque pixel est exprimé comme le mélange de la paire de couleurs qui l'explique le mieux, puis reconstruit avec les nouvelles couleurs ;
  - les lettres, les traits fins (par exemple la boucle d'un « k ») et les contours lissés gardent exactement leur forme ;
  - un test vérifie l'écart de couverture.
- **Variantes :** harmonisé, harmonisé sans fond, blanc (pour bandeau), couleur principale, original.
- **Placement automatique** (`server/services/officeLogo.ts`) :
  - Excel : bandeau de titre de la première feuille, graphiques conservés ;
  - Word : en-tête de chaque page ;
  - PowerPoint : chaque diapositive ;
  - HTML : bandeau ou haut de page.
- **Limites :**
  - Mail `.eml` : non traité (la version `.mail.html` contient le logo) ;
  - Python : le modèle ne doit pas insérer le logo lui-même ; l'app l'ajoute.

## Image choisie → reproduction sur le design même de l'image
1. **Découpe par le meilleur modèle vision du catalogue** (`designVisionCandidates`, quel que soit le prix — environ 1 centime par lecture). Ordre :
   1. le modèle vision choisi dans les réglages ;
   2. Gemini 3 / 2.5 (Pro, Flash) ;
   3. Claude Sonnet / Haiku / Opus ;
   4. GPT‑6 / GPT‑5 ;
   5. grands Qwen‑VL ;
   6. le modèle du chat s'il voit les images.

   Le modèle renvoie le cadre de **chaque** carte, menu, segment ou photo, son type et les couleurs de ses séries. Les pixels affinent ensuite chaque bord. Sans modèle vision : segmentation par les pixels (conteneur imbriqué, bandeau, titre au-dessus).
2. **Design sans contenu** (`server/services/cleanTemplate.ts`) — l'image est découpée en surfaces de couleur continue (un dégradé reste une seule surface).
   - **Conservé** : fonds, dégradés, cartes et leurs bandeaux, barres latérales, boutons, cadres, ombres, bords des cartes.
   - **Effacé** : textes, marques des graphiques, logos, icônes, photos (devenues leurs tons lissés).
   - Dans chaque panneau, le fond est un modèle lissé (plat, linéaire ou courbe) ; les bandes pleine largeur (en-têtes, lignes zébrées) et les tuiles internes sont gardées.
   - Chaque panneau est **aligné sur les bords exacts de sa carte**.
3. **Vos données dessinées dessus**, aux endroits mesurés (`attachTexts`) :
   - le titre à la place, à la taille et dans la couleur du titre de l'image, et le sous-titre (source, date) sur le bandeau ;
   - chaque titre de panneau sur la ligne de titre de l'image, les KPI sur les chiffres de l'image ;
   - les menus et segments remplis avec vos axes, vos catégories et vos mois.
4. **Excel** : feuille « Tableau de bord » = le design de l'image en fond, avec par-dessus les **graphiques Excel natifs** (transparents, modifiables) et les textes en formes Excel aux mêmes endroits.

## Image choisie → livrable au design de l'image
- **Excel** — même quand le modèle écrit le classeur lui-même (Python / openpyxl) :
  1. **feuille 1 « Tableau de bord »** : l'image reconstruite en **Excel natif** (`server/services/cloneXlsx.ts`) :
     - fond, cadre, page, bandeau de titre, cartes et tuiles KPI = formes Excel aux positions et couleurs mesurées ;
     - graphiques = **vrais graphiques Excel modifiables** (colonnes, barres, courbe, aire, secteurs, anneau) aux couleurs du panneau ;
     - tableaux, textes, images = la zone correspondante de la reproduction photo ;
  2. **feuille 2 « Tableau de bord (image) »** : la reproduction photo-fidèle ;
  3. les feuilles du modèle, puis « Données du tableau de bord » (les chiffres des graphiques).
- **Données** (`server/services/tablePick.ts`) :
  - Le **tableau détaillé** du classeur joint est utilisé, jamais une feuille de synthèse (Dashboard, Synthèse, blocs côte à côte).
  - Les lignes **TOTAL / Sous-total / « TOTAL / MOYENNE »** sont exclues, mais pas un client nommé « TOTAL SENEGAL SA ».
  - Seules les colonnes de montants sont sommées : un numéro client, un stade ou un mois d'ancienneté ne le sont jamais.
- **Fichiers openpyxl** : le préfixe `r:` est déclaré à la racine du classeur (openpyxl ne le déclare que sur chaque feuille) et les chemins absolus `/xl/…` sont résolus. Avant ce correctif, l'insertion rendait le classeur invalide et Excel la supprimait à l'ouverture.
- **Autres feuilles au format Maison 2.0 aux couleurs de l'image** (`server/services/officeRestyle.ts`) — feuilles du modèle et feuille de données :
  - bandeau de titre dans la couleur foncée de l'image ;
  - en-tête dans sa couleur principale, en blanc et gras ;
  - lignes zébrées teintées, filets fins, police du design ;
  - sans quadrillage, onglet coloré.
  - Formats de nombres, formules, fusions et graphiques sont conservés ; aucune ligne n'est insérée, donc aucune référence ne se décale.
- Le modèle est informé de ce qui a été appliqué : feuilles, nombre de graphiques, source des chiffres.
- **Le modèle ré-enregistre le classeur (openpyxl)** : openpyxl perd les formes et les images, donc le tableau de bord paraît « vide (1×1 + graphiques flottants) ».
  - Après chaque `code.run`, les trois feuilles de l'application sont retirées avec leurs dessins, graphiques et images (`removeSheets`), puis réappliquées intactes. Les feuilles du modèle restent à leur place.
  - Une feuille « Tableau de bord » de l'utilisateur n'est jamais retirée : elle ne l'est que si la feuille « Données du tableau de bord » de l'application l'accompagne.
  - Le modèle sait dès le choix de l'image que ces feuilles appartiennent à l'application. Il ne les lit pas, ne les vérifie pas, ne les répare pas. Il écrit ses feuilles en un seul `code.run` et ne rouvre pas le livrable pour le vérifier. Ces passes de « réparation » consommaient l'essentiel des jetons.
- **Livrable ≠ source** : dans le chat, le livrable porte l'étiquette « Livrable » et passe en premier. Le fichier joint par l'utilisateur est grisé, étiqueté « Source (votre fichier) ». Si le livrable porte le même nom que la source, il se télécharge sous « <nom> - livrable.<ext> ». Le chemin dans l'espace de travail ne change pas, donc le code du modèle continue de fonctionner.

## Style maison 2.0 — « GOD 3D »
- **9 palettes** : Bleu Ecobank (référence), Lime Ecobank, Océan, Émeraude & or, Bordeaux & or, Ardoise & corail, Sahel, Royal violet, Nuit & cyan. Chaque palette a sa propre série de couleurs ; le logo choisi s'y harmonise.
- **Excel** (`data.export`) :
  - **feuille « Synthèse 3D »** en tête du classeur (`server/services/chart3d.ts`) :
    - bandeau dégradé avec filet doré et logo ;
    - 4 KPI : lignes, total, moyenne, part du top 10 ;
    - jusqu'à **6 graphiques 3D** :
      - colonnes 3D ;
      - donut 3D ;
      - top 10 en barres 3D (leader en doré) ;
      - évolution mensuelle en relief ;
      - Pareto 3D (montant + part cumulée) ;
      - nombre de lignes par catégorie ;
    - carte « Lecture » (constats, points d'attention) ;
  - **feuille de données** : KPI puis **3 graphiques Excel 3D natifs** (modifiables) **avant l'en-tête du tableau** :
    - colonnes 3D, secteurs 3D, et courbe d'évolution ou top 10 en barres 3D ;
    - faces éclairées en dégradé, étiquettes « 1,8 Mds / 469 M » en Consolas ;
  - **feuille « Agrégats »** : les sommes par catégorie sont des formules `SOMME.SI` vivantes sur le tableau ; les graphiques natifs les lisent.
  - `chart: none` → tableau simple (en-tête en ligne 6) ; `visuals: false` → pas de feuille Synthèse 3D.
- **Word / PowerPoint / PDF** : les PNG de `data.chart` (barres, secteurs, courbes à une série) sont rendus en cartes 3D maison (`style: flat` pour l'ancien rendu) et s'insèrent avec `![titre](outputs/charts/x.png)`.
- **Données** :
  - Tout est calculé à partir des lignes exportées :
    - la mesure est la colonne monétaire (montant, solde, encours…), jamais un code ni un nombre de jours ;
    - le top 10 se fait par nom (client, société…), jamais par code.
  - La carte « Lecture » ne contient que des faits calculés, sans recommandations inventées.

## Mémoire
- Tout fait vient du chat : messages, pièces jointes, fichiers, résultats d'outils.
- Ce qui vient d'ailleurs (leçons, coffre d'expérience, missions similaires) sert seulement de méthode. Les chiffres y sont masqués (`methodOnly`).
- Si un design autre que le style maison est choisi, les souvenirs qui imposent le style maison ne sont pas transmis au modèle.
