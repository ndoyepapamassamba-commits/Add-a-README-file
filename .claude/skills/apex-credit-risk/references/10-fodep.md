# 10 — FODEP : états prudentiels (FxBook, EP01/EP02/EP03/EP08/EP29/EP32)

Source : APEX salle FODEP (moteur de formules `FxBook`, génération depuis le modèle Excel de la banque).

## 1. Principe
Le modèle FODEP (classeur Excel fourni par l'utilisateur) est **conservé tel quel** : on écrit les valeurs dans les cellules d'entrée, on laisse les formules, on recalcule. Jamais de modèle FODEP reconstruit de mémoire : sans le classeur modèle, répondre « modèle FODEP à fournir ».

## 2. Moteur `FxBook`
Évalue les formules du modèle hors Excel : `IF`, `IFERROR`, `SUM`, `MAX`, `MIN`, `AVERAGE`, `ROUND` / `ROUNDUP` / `ROUNDDOWN`, `ABS`, `AND`, `OR`, `VLOOKUP`, `SUMPRODUCT`, références inter-feuilles. Toute autre fonction ⇒ cellule marquée « à recalculer dans Excel » (`fullCalcOnLoad`).

## 3. Cellules et feuilles de référence

| Feuille / cellule | Contenu |
|---|---|
| « Controle Base Individuelle » | feuille de contrôles (cohérences bilan / hors bilan / provisions) |
| EP01 lignes 10 à 23 | normes prudentielles (ratios et seuils) |
| EP02!F16 | **FPE** — fonds propres effectifs |
| EP08!E34 | **APR** — actifs pondérés par les risques (RWA) |
| EP03!C52 | **FPB** — fonds propres de base (CET1) |
| EP29 lignes 16+ | **grands risques** : bénéficiaires ≥ 10 % des FPB |
| EP32 lignes 18+ | **50 plus gros** engagements |

Solvabilité = FPE / APR (seuil 11,5 %) ; Tier 1 = FPB / APR.

## 4. Alimentation depuis ACTE 7
- Encours bilan par classe et par nature ; **produits de signature** (`CKU`, `CC`, `AE`, `GCP`, `LCU`) en **hors bilan** ;
- grands risques EP29 : agrégation par bénéficiaire (groupe si vrai groupe, fiche 02) ≥ 10 % FPB, pondérée des sûretés éligibles ;
- EP32 : 50 premiers clients par engagement total (bilan + hors bilan).

## 5. Génération
Écriture Open XML directe dans le modèle : désagrégation des **formules partagées** (chaque cellule reçoit sa formule explicite), suppression de `calcChain.xml` (et de sa relation et de son type de contenu), `<calcPr fullCalcOnLoad="1"/>` dans `workbook.xml`, valeurs numériques sans format texte. Vérifier ensuite avec `m365-verification`.

## 6. Réponse attendue (requête « FODEP », « EP29 », « grands risques », « solvabilité réglementaire »)
1. FPE, FPB, APR, solvabilité, Tier 1 (source : cellules ci-dessus, date du modèle).
2. Tableau EP29 (bénéficiaire, engagement brut, sûretés, net, % FPB) et EP32.
3. Contrôles de cohérence (feuille Controle) avec les écarts.
4. Impact des déclassements de fin de mois (fiche 04 § 5) sur FPE (provisions) et APR.
