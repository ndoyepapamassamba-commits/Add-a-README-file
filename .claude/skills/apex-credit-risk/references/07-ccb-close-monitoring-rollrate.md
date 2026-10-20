# 07 — CCB : close monitoring, roll rate et reporting groupe

Source : APEX salle CCB (`BU_OF_SEG`, `PP_DEF`, `ppKey`, `cmMetrics`, roll rate `DPD_LIB`, « Report close monitoring »). Montants en **kUSD** au taux fixe **600 XOF / USD** (paramètre `kusd` — remplacer par le taux fourni par l'utilisateur s'il en donne un).

## 1. Lignes d'activité (BU) à partir du segment

| Segment | BU |
|---|---|
| 1000 | CSB (Consumer) |
| 1500, 1600, 8110, 8200, 8750 | CMB (Commercial) |
| 8900, 8100, 8300, 8400, 8500, 8600, 8700, 8800 | CIB (Corporate & Investment) |

Segment absent de la table ⇒ BU « AUTRES » (à signaler).

## 2. Programmes produits (`PP_DEF`, clé `ppKey` = préfixe du code PP)

| Préfixe PP | Famille |
|---|---|
| 2000 | CONTRACT / RECEIVABLE FINANCE |
| 3000 | INVENTORY / DISTRIBUTOR FINANCE |
| 4000 | ASSET FINANCE |
| 1300 | MORTGAGE |
| 1100 | UNSECURED — SALARY BACKED |

Référentiel complet des PP dans la fiche 08 (codification).

## 3. Indicateurs de close monitoring (`cmMetrics`), par BU puis total

| Indicateur | Définition |
|---|---|
| Exposition S1 | encours stage 1 (kUSD) |
| Top 5 | cinq premières expositions (client, kUSD, % du total BU) |
| PDO (Past Due Obligations) | impayés totaux (kUSD) et nombre de comptes |
| Expositions > 1 M$ | nombre et encours des clients > 1 000 kUSD |
| Collections | encaissements du mois si la feuille « collections » existe, sinon « non renseigné » |
| Restructures | encours compte 291 / lignes marquées restructurées |
| DPD 1‑30 / 31‑90 / > 90 | encours et nombre de comptes par tranche de jours |
| NPL | encours stage 3 / NPL et ratio |
| ECL | provision IFRS 9 (kUSD) et couverture |

## 4. Roll rate (matrice de migration DPD)

Tranches `DPD_LIB` : `0 (Current)`, `1- 30`, `31- 60`, `61- 90`, `90+`.
Entre deux arrêtés (N‑1 → N), par compte : tranche de départ → tranche d'arrivée ; matrice en **nombre** et en **encours**.

- **Roll forward (deter)** : part de l'encours d'une tranche qui passe à une tranche supérieure.
- **Cure** : part qui revient à `0 (Current)`.
- **Stable** : reste dans la tranche.
- Taux de passage > 90 j = Σ encours arrivant en `90+` / Σ encours de départ hors `90+`.

Un roll rate n'est calculé que si les deux arrêtés sont en mémoire (fiche 11) ; sinon l'indiquer et proposer de charger N‑1.

## 5. « Report close monitoring » — format des lignes

Une ligne par BU puis une ligne TOTAL :
`BU | Exposition S1 (k$) | Top 5 (k$) | PDO (k$) | Nb PDO | > 1 M$ (nb / k$) | Collections (k$) | Restructures (k$) | DPD 1‑30 | DPD 31‑90 | DPD 90+ | NPL (k$) | NPL % | ECL (k$)`
suivi des commentaires par BU (constats chiffrés, dossiers à l'origine des variations, actions).

## 6. Exports CCB
- Excel : feuille « Close monitoring » (tableau § 5 avec bande KPI et graphiques natifs : barres par BU, anneau DPD, courbe roll rate si historique), feuille « Roll rate » (matrices), feuille « Top expositions ».
- Word / PPT : même ordre ; en anglais si l'utilisateur le demande (reporting groupe), sinon en français.
- Toujours mentionner le taux de conversion utilisé et la date d'arrêté.
