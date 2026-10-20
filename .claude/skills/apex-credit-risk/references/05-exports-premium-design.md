# 05 — Exports premium (Excel, Word, PowerPoint, PDF/HTML, mail) : le savoir-faire APEX

Source : couches `styledExcel` / `X3` / `g3` / `xlsxAttach` / `xlsxPolish` / `pm*` (finition premium) / `RX` (générateur Open XML natif) / `riModel` (Credit Risk Intelligence) / builders Word, PptxGenJS, mailer.
Dans MASSAMBA Workbench, ces règles complètent le design Maison 2 (`houseDesign`, `maisonBand`, `liveDash`, `designQA`, `designGate`, `excelStrict`) : le thème choisi par l'utilisateur **remplace** la palette ci-dessous, la structure et les contrôles restent.

## 1. Principes non négociables
1. **Source unique** : écran, Excel, Word, PPT et PDF lisent le même modèle (`riModel`) ; aucun chiffre recalculé « à la main » dans un export.
2. **Tableau de bord vivant avant l'en-tête** de chaque feuille de données : tuiles `SUBTOTAL`/`SOUS.TOTAL` (réagissent aux filtres), segments (slicers) sur les colonnes catégorielles, graphiques **natifs** (jamais une image de graphique dans Excel).
3. **Aucune donnée inventée** ; une valeur absente s'écrit « — » ou « non renseigné », jamais 0.
4. **Aucun nom d'outil interne** dans un livrable (`expScrub` : TypeSafe → « analyse sémantique », JEV → « Risk Outlook », jev-latest → « moteur sémantique »).
5. **Contrôle avant livraison** (`EXPORT_AGENT.inspect`) : pas de `NaN` / `Infinity` / `undefined` dans le XML, pas de `#REF!` / `#VALUE!` / `#DIV/0!`, pas de couleur de l'ancienne charte, fichier ≤ 15 Mo (`EXPORT_MAX`, sinon réduction des images `G3S`), couche d'analyse présente.
6. **Texte ≠ formule** : une cellule texte qui commence par « = » est écrite en `inlineStr`, jamais dans `<f>` (cause historique de « Excel a trouvé un problème dans le contenu » ; avec openpyxl, préfixer la chaîne d'une apostrophe ou passer par `cell.data_type = 's'`). Formules en anglais, séparateur « , », préfixe `_xlfn.` pour les fonctions post-2007 (voir `formulaCheck.ts`). Une part du total s'écrit `=C30/SUM('Données'!D:D)`, jamais `=C30/'Données'!D:D` (Excel lit la colonne par intersection implicite et affiche une valeur fausse). Un pied de table ne somme jamais une colonne de pourcentages (laisser vide ou écrire le ratio des totaux).
7. Vérifier comme Microsoft 365 avant de livrer : compétence `m365-verification` (0 erreur Open XML, 0 anomalie sémantique, aperçus lus).

## 2. Palettes de référence (remplacées par le thème utilisateur)

| Jeu | Couleurs |
|---|---|
| XC (APEX historique) | navy `00415E`, blue `005C83`, lime `8CC63F`, lime2 `6BA23A`, soft `EEF4F8`, soft2 `F4F9FB`, ink `12333F`, mut `3E5C6B`, line `CFE0E7`, risk `C0392B`, warn `9A6A06`, ok `4E8A2E` |
| ECOBANK BLUE PREMIUM (RP) | deep `001B4D`, eb `003DA5`, corp `002B73`, bright `2563EB`, cyan `06B6D4`, gold `C8A951`, off `F8FAFC`, light `EAF2FF`, pale `F2F7FF`, ok `16A34A`, warn `F59E0B`, alert `F97316`, crit `DC2626`, neu `64748B`, ink `0F172A`, ink2 `334155`, line `DBE6F7` |
| G3 (graphiques) | navy `001B4D`, blue `003DA5`, lime/or `C8A951`, S1 `16A34A`, S2 `F59E0B`, S3 `DC2626` |
| Classes BCEAO | I `2EA3D6`, IA `7FC7E8`, II `8CC63F`, III `F2B632`, IV `E08A3C`, V `C0392B` |
| Criticité | FAIBLE vert, MOYENNE ambre, ÉLEVÉE orange, CRITIQUE rouge |

Remappage automatique (`PM_BLUE_MAP`) : toute couleur de l'ancienne charte trouvée dans un XML est remplacée par son équivalent de la charte active — appliquer la même logique avec le thème choisi par l'utilisateur.

## 3. Excel — structure d'une feuille (`styledExcel`, `pmSheetXml`, `riHeader`)

```
ligne 1   bandeau titre (fond sombre, 15–20 pt, blanc) + « ◀ Sommaire » en dernière colonne (HYPERLINK interne)
ligne 2   sous-titre (bleu, italique) : source, feuille, périmètre, arrêté
ligne 3   vide
lignes 4+ bande KPI : paires libellé / valeur (SUBTOTAL(109; plage) ou (103;) pour les comptes), groupées par 4, filet accent sous le groupe
          zone de graphiques natifs (barres, anneau, courbe, cascade, radar, carte de chaleur) ancrés AVANT l'en-tête
en-tête   fond sombre, blanc, gras, retour à la ligne, figé (freeze sous l'en-tête), filtre automatique
corps     zébrures (blanc / pale), nombres en Consolas alignés à droite, formats « #,##0 » / « 0.0% » / « dd/mm/yyyy »
          format compact des grands montants : [>=1000000000]#,##0.00,,," Md";[>=1000000]#,##0.0,," M";#,##0
pied      SUBTOTAL par colonne de montant
```

Finitions (`pmPolishSheet`, `xlsxPolish`) : quadrillage masqué, zoom 90–100, largeurs = contenu × 1,12 + 3 (plafond 62), couleur d'onglet par feuille (`PM_TABS`), A4 paysage `fitToWidth=1 fitToHeight=0`, en-tête d'impression « ECOBANK SÉNÉGAL · Credit Risk OS », pied « Confidentiel — usage interne · Page &P / &N » (adapter l'entité au thème utilisateur), `fullCalcOnLoad` quand des formules ont été écrites par le générateur.

Enrichissements (`xlsxAttach`) : mise en forme conditionnelle `dataBar` sur les montants, `colorScale` sur les jours, `iconSet` sur les variations ; validation de données (listes) sur statuts et criticité ; badge logo + drapeau ancré en A1 ; propriétés du document (titre, auteur, sujet) ; `WS_ORDER` fixe l'ordre des feuilles (Sommaire → Synthèse → Watchlist → Actions → Détail → Données → Audit).

Sommaire (`pm` Excel) : première feuille, un lien par feuille avec description, tableau de bord image HD (`pmDashPng`, 2000 × 1240) **en plus** des graphiques natifs, simulateur de stress vivant (cellules d'entrée fond `FFF4CC`, sorties fond `E8F4D5`, formules), recherche client (`INDEX`/`MATCH` sur la feuille Données).

Reliefs `X3` : styles `hdr` / `cell` / `pill` / `tile` / `title` / `sub` avec bordures biseau (clair en haut/gauche, sombre en bas/droite) pour l'effet 3D sans image.

## 4. Credit Risk Intelligence (RX / RI) — composition « application web » en Excel

Feuilles : `EXECUTIVE`, `RISK`, `MOVEMENT`, `CONCENTRATION`, `WATCHLIST`, `ACTIONS`, `INSIGHTS`, `DETAIL`, `AUDIT`, `DATA` ; variantes d'export : Executive, Risk, Watchlist, Action plan, Audit, Data, Complet.

Ordre vertical de chaque feuille : HEADER (ligne 0 bandeau, lignes 1–5 héros à dégradé + date longue + périmètre + visuel 3D recadré) → filet or → NAVIGATION (ligne 7, un onglet par feuille, onglet actif surligné, liens internes) → PUCES DE STATUT (statut portefeuille STABLE / SOUS SURVEILLANCE / VIGILANCE, PD 12M avec provenance, sémantique, contrôles n/n) → KPI (`riCard` : titre icône, grande valeur 22 pt, unité, variation ▲▼■ colorée, sparkline, statut FAVORABLE / STABLE / À SURVEILLER, ombre portée en dégradé) → ANALYTICS (`riTable` zébré, formats m/md/%/d/n/b/st/bk) → VISUALISATIONS natives → INSIGHTS (`riCallout`) → WATCHLIST → ACTION PLAN.

Niveaux watchlist : `CRITICAL` (criticité CRITIQUE, ou migration vers > 90 j, ou 75 < dj ≤ 90), `HIGH` (ÉLEVÉE, ou tranche 61–90, ou migration), `WATCH` (stage 2, tranche 31–60, hausse d'impayé, ou criticité), `CURED` (impayé N‑1 > 0 → 0). Progression par statut : À faire 0, Revue analyste 0,25, En cours 0,5, Promesse / Restructuration 0,6, Régularisé à vérifier 0,9, Fait 1.

Pont des impayés N‑1 → N : ouverture + nouveaux + entrées + aggravations − régularisations − remboursements − sorties = clôture ; `check` doit valoir 0 (contrôle affiché dans AUDIT). Matrice de migration 5 × 5 (Sain, 1‑30, 31‑60, 61‑90, > 90/S3) en nombre et encours. Matrice risque × exposition 3 × 3 (seuils d'exposition 100 M et 1 Md). Concentration : top 10, top 5, HHI.

Insights calculés (jamais de phrase générique) : 01 impayés (hausse/baisse, nouveaux, régularisations), 02 concentration, 03 migration, 04 action (critiques + priorité haute), 05 stage 2 & 3, 06 régularisations, 07 prospectif PD 12M avec provenance, 08 retours sémantiques, 09 stress narratif, 10 analyses avancées (temps avant défaut, guérison, IC 90 %, backtest, stress inverse).

Contrôles d'audit (`ctl`) : somme clients = agrégat ; pont = 0 ; tranches = total ; watchlist ≤ total ; clients en double ; valeurs non numériques ; historique sur base IFRS 9 ; PD avec provenance pour chaque client de la watchlist ; historique ≥ 2 arrêtés.

## 5. Word (docx)

Builder `dxRun` / `dxP` / `dxTable` / `dxKpis` ; styles `Titre1` / `Titre2` ; **page de garde** (tableau pleine largeur fond sombre, titre, sous-titre, date longue, périmètre), **tableau de bord** (tuiles KPI 2 × 4), **sommaire** (champ TOC), en-tête avec entité et pied « Page X / Y » (champ `PAGE` / `NUMPAGES`), sections numérotées : constats → analyse → recommandations → tableau de preuve → méthodologie → annexes. Titres et grands chiffres (gras ≥ 13 pt) avec ombre portée Word 2010 (`w14:shadow`, namespace déclaré et `mc:Ignorable="w14"`). Les rapports Word-HTML (`.doc`) sont convertis en vrai docx (`pmHtmlToDocx`) avant finition.

## 6. PowerPoint (pptx)

`LAYOUT_WIDE` 16:9 ; bandeau de titre sombre + filet accent + badge entité ; KPI en `roundRect` ; diapositives séparatrices de section ; notes du présentateur avec les chiffres sources ; graphique de stress **natif** (pas une image) ; sommaire interactif (liens vers chaque section) et barre de progression en pied ; diapositive de clôture. Comité : 20 diapositives (ordre du jour, santé, watchlist, douteux, déclassements, stress, décisions, calendrier). `pptxFix` : un seul `a:pPr` par paragraphe, `notesMasterIdLst` après `sldMasterIdLst`, `c:grouping` sur les courbes, série « base » des cascades sans remplissage, identifiants d'axes existants seulement.

## 7. Mail (.eml) et HTML

`mailShell` : tableaux de 660–680 px, **styles en ligne** (Outlook ignore le CSS de tête), `mKpis` (tuiles), `mReco` (liste numérotée), `mTable` (zébré), images intégrées en **CID** (pas de lien externe), version texte, `copyRich` pour le presse-papiers. PDF/HTML : même structure que Word, impression A4, graphiques SVG inline.

## 8. Fiche carte d'identité client (`fiche IDC`)

A4 paysage HTML → PDF : identité (client, groupe, segment, secteur SIC, agence, gestionnaire), familles de produits (`idcFamily` / `cdFamily`), encours par ligne, impayés et jours, classe / stage / FRR, sûretés, points de vigilance, RAROC (si marge et capital disponibles, sinon « non calculable »), historique 12 mois (sparkline), recommandation datée.

## 9. Dossier global (`apSec`) — sections à produire quand on demande « le dossier complet »

health, segment, watchlist, tension, douteux, contagion/COD, déclencheurs, secteurs/limites, gestionnaires, sûretés, triage, grandes expositions, efficacité, 30‑90 j, NBA, anomalies, qualité des données, appétit pour le risque, pôles, maturité, surface de stress, PSI, déclassements, covenants, calendrier, tornade, PCB, CCB, conformité, concepts. Chaque section : chiffres → constat → recommandation ; ne produire que les sections dont les données existent.

## 10. Agent EXPORT — journal et amélioration continue

Chaque export est journalisé (type, nom, taille, durée, étapes, avertissements) ; suggestions dérivées des 100 derniers exports (couche sémantique absente, ancienne charte, fichiers lourds, valeurs invalides). Dans MASSAMBA Workbench : `designQA` corrige, `designGate` vérifie (bande Maison 2, graphiques natifs, contrastes), `excelStrict` répare, `m365-verification` valide.
