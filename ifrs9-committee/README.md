# ECOBANK SÉNÉGAL — IFRS9 Committee Intelligence

Application HTML monofichier, 100 % offline, destinée au Comité IFRS9. Elle explique pourquoi la provision IFRS9 du mois N diffère de celle du mois N-1, en suivant le fil : provision de référence → mouvements → facteurs explicatifs → clients → risques → actions.

> **Aucune donnée client n'est versionnée dans ce dépôt.** `dist/ECOBANK_IFRS9_Committee_Intelligence.html` s'ouvre sur un écran de dépôt : le classeur est lu localement dans le navigateur et aucune donnée ne quitte le poste.

## Utilisation

1. Ouvrir `dist/ECOBANK_IFRS9_Committee_Intelligence.html` dans Edge ou Chrome.
2. Déposer le classeur IFRS9 contenant ces feuilles :
   - **Ce mois** (N) : provision = `Impairment-pre`
   - **Mois dernier** (N-1) : provision = `Impairment (Manual Overrides)`
   - **Portefeuille** (N) : gestionnaire, devise, classification, client, etc.
3. Naviguer dans les 13 vues, filtrer (segment, gestionnaire, stage, produit, devise, secteur, client/compte/contrat), puis exporter.

Les feuilles et les colonnes sont détectées automatiquement, quel que soit l'ordre des colonnes : correspondance par expressions régulières, sans tenir compte des accents ni de la casse. La ligne d'en-tête est recherchée dans les 25 premières lignes et la dernière ligne est détectée automatiquement. Une colonne en plus, un nombre de lignes différent ou des valeurs nulles sont acceptés.

## Vues

| # | Vue | Question traitée |
|---|---|---|
| 01 | Executive Summary | Quelle est la provision, comment a-t-elle évolué ? Cartes KPI (N, N-1, Δ, Δ %), messages clés |
| 02 | IFRS9 Bridge | Graphique en cascade exact contrat par contrat : sorties, entrées, effet volume, effet couverture, détériorations, améliorations |
| 03 | Stage Migration | Matrice N-1 → N (comptes, Outstanding, provision, Δ), migration nette, gouvernance STAGE vs STAGE_OVERRIDE |
| 04 | Outstanding | Variation de l'Outstanding entre N-1 et N, quadrants Outstanding / provision, ventilations, top 20 hausses et baisses |
| 05 | Provision Movements | Vue par stage, structure, distribution des Δ, courbes de concentration |
| 06–07 | Top Increases / Decreases | Top 20 (contrats ou clients), top 10 en %, NEW / FROM ZERO, contributions |
| 08 | Segments | Segment, produit, secteur, classification : couverture, répartition par stage, classement, nuage de bulles |
| 09 | Agencies | Gestionnaires (Account Officer : le fichier n'a pas de colonne agence), carte de chaleur |
| 10 | Client Intelligence | Recherche, fiche client, concentration top 10 / 20 / 50, HHI |
| 11 | Watchlist | 13 règles automatiques, niveaux CRITICAL / HIGH / MEDIUM / LOW, responsables |
| 12 | Data Quality | Score /100, rapprochement des totaux, choix de la clé, traçabilité des colonnes, méthodologie |
| 13 | Committee Pack | QUOI / COMBIEN / POURQUOI / OÙ / QUI / RISQUE / ACTION |

## Exports

- **Excel** : 11 feuilles (`01_EXECUTIVE_SUMMARY` … `11_DATA_QUALITY`), visuels 3D, badge Ecobank, barres de données et liste déroulante de suivi dans la watchlist.
- **PowerPoint** : 12 diapositives au format 16:9.
- **PDF** : pack Comité au format A4 paysage, via l'impression du navigateur.

## Principes de calcul

- La clé de rapprochement est choisie après test de chaque candidate (CONTRACT_ID, ACCOUNT_NO, CUSTOMER_NO + CONTRACT_ID, CUSTOMER_NO). La clé retenue est unique dans les deux mois et maximise le rapprochement.
- Le bridge est additif et exact : Σ composantes = provision N − provision N-1, et l'écart est affiché. Les effets qui ne peuvent pas être mesurés sont déclarés « Non déterminable à partir des données disponibles » : overrides de N, ventilation PD / LGD / scénarios, motif des sorties, effet change.
- Le Δ % individuel n'est calculé que si la provision N-1 ≥ 100 000 XOF. En dessous, il est affiché « NEW » ou « FROM ZERO ».
- Les données sources ne sont jamais modifiées et aucune ligne de données n'est supprimée.

## Développement

```
src/shell.html        gabarit (CSS, structure)
src/10_core.js        formats, normalisations, lecture tolérante
src/20_engine.js      table analytique, bridge, migrations, watchlist, qualité des données
src/25_insights.js    messages Comité et insights calculés
src/30_ui.js          état, filtres, composants, graphiques
src/40_pages.js       les 13 vues
src/50_export.js      Excel, PowerPoint, PDF
src/90_boot.js        démarrage
vendor/               SheetJS (xlsx-js-style), Chart.js, JSZip + PptxGenJS, kit d'exports Ecobank, logo
tools/build.py        assemblage monofichier (re-colorisation du kit : #003DA5 / #001B4D / #C8A951)
tools/extract_data.py version à données préchargées (usage interne, ne pas versionner le résultat)
```

```bash
python3 tools/build.py                                    # version sans données -> dist/
python3 tools/extract_data.py classeur.xlsx embed.js      # usage interne uniquement
python3 tools/build.py --data embed.js sortie.html        # version préchargée (confidentielle)
```
