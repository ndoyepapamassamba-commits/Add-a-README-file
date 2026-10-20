---
name: excel-pro
description: Classeur Excel professionnel (MASSAMBA) — formules vivantes, zéro erreur, hiérarchie visuelle, formats numériques, hypothèses documentées, vérification avant livraison. Se déclenche avec "excel", "xlsx", "classeur", "tableur", "feuille", "csv", "formule", "modèle financier".
category: Office
triggers:
  - excel
  - xlsx
  - xlsm
  - classeur
  - tableur
  - feuille de calcul
  - csv
  - formule
  - tableau croisé
  - modèle financier
  - modele financier
  - kpi excel
  - tableau de bord excel
---
# Excel professionnel — méthode MASSAMBA

Pratiques d'un classeur de qualité professionnelle (mise en forme financière, hiérarchie visuelle, tableaux, graphiques,
formules, formats numériques, vérification des résultats), écrites pour les moteurs de cette application. Texte original
MASSAMBA : les skills Office d'Anthropic sont sous licence propriétaire (pas de copie, pas de dérivé, pas de redistribution) ;
leurs *pratiques* sont reprises ici en nos mots, branchées sur nos outils.

## Exigences de tout classeur livré
1. **Formules vivantes, jamais de résultats figés** : un total est `=SOMME(...)` / `=SUMIFS(...)`, pas un nombre calculé ailleurs ; le classeur recalcule quand ses entrées changent. Préférer les fonctions universelles (SUMIFS, INDEX/MATCH, IFERROR, SUMPRODUCT) ; éviter XLOOKUP / FILTER / UNIQUE / SORT (tableaux dynamiques, échouent hors Excel 365 et dans LibreOffice).
2. **Zéro erreur de formule** (`#REF!`, `#NOM?`, `#DIV/0!`, `#VALEUR!`) : contrôle `excelStrict` dans l'app (index de styles, plages, formules interdites), `scripts/xlsx-repair.ts` dans le dépôt, vérification « Microsoft 365 » (SDK Open XML, 0 erreur) avant livraison.
3. **Hiérarchie visuelle maison** : bande KPI et cartes avant l'en-tête, feuille **Sommaire** avec liens, formats k / M, sparklines, volets figés sous l'en-tête, largeurs de colonnes lisibles (pas de `#####`), police professionnelle unique.
4. **Formats numériques** : séparateur de milliers, 0 à 2 décimales selon la grandeur, `%` sur les ratios, dates courtes ; une unité dans l'en-tête (« en M FCFA »), jamais dans chaque cellule.
5. **Hypothèses et constantes documentées** là où le lecteur les voit (cellule adjacente ou commentaire) ; source citée quand elle existe. **Aucune donnée inventée** : une valeur manquante reste vide et est signalée.
6. **Classeur à remplir** : cellules de saisie distinguées (couleur), légende, une ligne d'exemple réaliste — jamais dans un fichier qui contient déjà des données.
7. **Fichier existant** : respecter ses conventions (onglets, en-têtes, couleurs des entrées, formules telles que l'utilisateur les a écrites) ; elles priment sur ce guide.
8. **Spécification littérale** : noms d'onglets, en-têtes et formules exactement comme demandés ; une « meilleure » conception non demandée est un échec.

## Dans l'app
- `data.inspect` → `report.analyse` (brief local, 0 token) → `report.export` (xlsx premium : bande KPI, Sommaire, graphiques maison, design choisi dans la galerie) ; `designQA` corrige contrastes, largeurs, débordements ; `designGate` impose le design verrouillé.
- Vérifier le résultat : ouvrir l'aperçu (feuille par feuille) ; en conteneur, `bash .claude/skills/m365-verification/scripts/verify.sh fichier.xlsx`.
- Livrer en disant ce qui a été vérifié (formules, erreurs, mise en page) et comment.
