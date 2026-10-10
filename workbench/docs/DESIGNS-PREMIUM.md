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
