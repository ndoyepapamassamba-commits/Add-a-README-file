# Créances à Échoir — Ecobank Sénégal · édition BLUE ECOBANK

Application HTML **100 % offline** (un seul fichier) qui charge le classeur
`CREANCE_A_ECHOIR` (.xlsm / .xlsb / .xlsx) et produit le tableau de bord COMEX
des contrats à échoir (mois M et M+1).

- Charte BLUE ECOBANK : marine `#00415E`, bleu `#005C83`, lime `#8CC63F`, logo officiel partout
  (barre latérale, en-tête, écran d'accueil, chargement, héros, exports).
- 8 vues : synthèse exécutive, échéancier, catégories, concentration, segments & agences,
  impact portefeuille (IFRS 9 / BCEAO), crédits Personnel, détail des contrats.
- Exports aux couleurs Ecobank, filtres appliqués et rappelés :
  - **Excel** (9 feuilles) : bandeau marine + badge logo, tuiles KPI, **graphiques 3D placés avant
    chaque en-tête de tableau**, barres de données, alertes conditionnelles, filtres, volets figés,
    impression A4 paysage, pied de page « INTERNAL USE ONLY ».
  - **PDF** : couverture marine, bandeau + logo sur chaque page, visuels 3D, tableaux à pastilles.
  - **PowerPoint** : couverture, diapositives à bandeau, KPI, visuels, tableaux, clôture.

## Construire

```bash
python build.py                                   # -> ECOBANK_CAE_MONITOR_BLUE.html (sans données)
python build.py sortie.html --data donnees.html   # variante avec données pré-embarquées
```

`src/` : `shell.html` (CSS + gabarit), `app.js` (moteur), `kit/` (logo + kit graphique 3D),
`vendor_libs.html` (Chart.js, SheetJS, ExcelJS, jsPDF, PptxGenJS, JSZip inlinés).
Aucune donnée client n'est versionnée.
