# 04 — Douteux, NPL, déclassements de fin de mois et lecture PCB

Source : APEX Credit Risk OS (fonctions `doutAnalysis`, `declData`, `pcbIngest` / `pcbAnalysis` / `pcbAnswer`).
Règle absolue : chaque chiffre vient du fichier chargé ; aucun montant, aucune date, aucun taux n'est inventé.

## 1. Encours douteux par client (`doutAnalysis`)

Périmètre : lignes ACTE 7 **non exclues** (`excl = false`, voir fiche 01) et **NPL** (`npl = true` : classe IIN/III/IV/V, ou compte 292, ou impayé au-delà du seuil).

Par client (clé `clc`, libellé `rel`) :

| Mesure | Calcul |
|---|---|
| Encours douteux | Σ `ototal` des lignes NPL non exclues |
| Provision IFRS 9 | Σ `ecl` (stage 3 → 100 % de l'encours net de sûretés, voir fiche 02) |
| Provision locale | colonne « provision locale » de la feuille **« Douteux 292 »** si présente, sinon Σ des provisions 29x associées ; sinon « non renseignée » |
| Hypothèques | Σ sûretés de code **54\*** (hypothèques), **plafonnées à l'encours** de la ligne |
| Date de déclassement | colonne « date déclassement » de la feuille Douteux 292 si présente, sinon date d'entrée en NP ; sinon âge = `dj − seuil` (90 j ou 180 j selon la nature) |
| Âge (mois) | (arrêté − date de déclassement) / 30,4375 |
| Provision requise (art. 16) | voir grille § 2 |
| Complément | max(0, requise − provision locale) |
| Contribution | encours douteux client / encours douteux total |

## 2. Grille de provisionnement BCEAO — Instruction 026, article 16

Le taux s'applique à la **partie non couverte** par des sûretés éligibles (hypothèques 54\* et garanties financières reconnues) ; la partie couverte suit son propre calendrier.

| Ancienneté du déclassement | Partie non couverte | Partie couverte |
|---|---|---|
| < 3 mois | **20 %** | 0 % |
| 3 à < 9 mois | **50 %** | 0 % (jusqu'à 24 mois) |
| ≥ 9 mois | **100 %** | 50 % (24 à < 36 mois) |
| ≥ 36 mois | 100 % | **100 %** |

Rappels liés :
- **Art. 13** : passage en perte au plus tard au **5e exercice** suivant le déclassement (≥ 4 ans d'ancienneté → recommandation « passage en perte »).
- **Art. 11** : contagion — un client ayant une ligne douteuse voit l'ensemble de ses lignes déclassées (voir fiche 02, `contagion`).
- **Art. 6 / 7** : créances restructurées (compte 291) suivies à part, retour en sain après période probatoire.
- **Art. 8 al. 2** : comptes ordinaires débiteurs (COD) : douteux au-delà de 90 jours sans mouvement créditeur suffisant.

## 3. Recommandations par ancienneté (ordre de priorité)

| Ancienneté | Recommandation APEX |
|---|---|
| ≥ 4 ans | Passage en perte (art. 13) après avis juridique ; sortie du bilan, suivi hors bilan |
| ≥ 1 an | Transfert au contentieux / recouvrement judiciaire ; réalisation des sûretés |
| ≥ 90 j | Mise en demeure, gel des lignes, plan de règlement signé |
| Récent (< 90 j) | Protocole de régularisation (fiche 03, bandes J1–J4), contact gestionnaire sous 48 h |

## 4. NPL après régularisation et scénarios

- **Retour en sain** : l'encours de la ligne sort du NPL (le ratio NPL baisse de l'encours entier).
- **Remboursement** : l'encours baisse du montant remboursé seulement.
- Scénarios calculés (jamais estimés) : « fin de mois sans action » (les lignes J3–J4 de la fiche 03 basculent en douteux), « 10 premiers régularisés », « 20 premiers régularisés », « J3–J4 régularisés ». Pour chacun : ratio NPL résultant, ECL résultante, provision locale requise résultante.
- **Pareto** : nombre de clients portant 50 % (`n50`) et 80 % de l'encours douteux ; courbe cumulée triée par encours décroissant.

## 5. Déclassements de fin de mois (`declData`)

Reconstitution des déclassements attendus à la prochaine clôture :
1. Lignes dont `djProj` (jours projetés à la fin du mois) dépasse le seuil (90 j, 180 j pour les natures longues) → **nouveaux douteux**.
2. **Contagion art. 11** : toutes les autres lignes de ces clients sont reclassées.
3. **COD > 90 j** (art. 8 al. 2).

Impacts calculés : encours déclassé, provision à constituer (**20 %** de l'exposition nette de sûretés le premier trimestre), variation du ratio NPL en **points de base**, variation de la provision locale (`loc0` avant, `loc9` après), variation de l'ECL (stage 2 → stage 3 : 25 % → 100 % de l'encours net).

## 6. Lecture comptable PCB (plan comptable bancaire)

Fichier « Gl Code » (balance par compte) ; regroupement par préfixe de compte :

| Préfixe | Nature | Lecture |
|---|---|---|
| 20 à 208 | Crédits sains (par nature : court, moyen, long terme, crédit-bail…) | encours sain |
| 251 | Comptes ordinaires débiteurs (COD) | sain tant que < 90 j |
| 291 | Créances restructurées | souffrance, suivi art. 6/7 |
| 292 | Créances douteuses | **NPL comptable** |
| 293 | Intérêts sur créances douteuses | souffrance |
| 298 / 299 | Dépréciations (provisions) | couverture |
| 39 | Autres (titres, divers) | hors périmètre crédit |

Indicateurs : **NPL comptable = 292 / total crédits** ; **créances en souffrance = 291 + 292 + 293** ; **couverture = (298 + 299) / 292** ; limite interne de référence : ratio NPL comptable **3 %**.

### Trois lectures à présenter ensemble (jamais une seule)

| Lecture | Base | Ce qu'elle mesure |
|---|---|---|
| IFRS 9 — Stage 3 | lignes ACTE 7 stage 3 | risque économique, ECL |
| BCEAO — douteux Instr. 026 | classes IIN/III/IV/V + contagion | prudentiel, provision réglementaire |
| PCB — compte 292 | balance comptable | ce qui est comptabilisé |

Les écarts entre les trois sont des **constats à expliquer** (déclassement non encore comptabilisé, contagion non appliquée, ligne exclue du périmètre), jamais à lisser.

## 7. Format de réponse attendu (requête « douteux », « NPL », « provisions », « 292 »)

1. Chiffres clés : encours douteux, provision IFRS 9, provision locale, provision requise art. 16, complément, couverture, nombre de clients, `n50`.
2. Tableau des clients classés par complément décroissant (client, encours, âge, hypothèques, requise, constituée, complément, recommandation).
3. Trois lectures (IFRS 9 / BCEAO / PCB) et écarts.
4. Scénarios de fin de mois avec impact en bps.
5. Recommandations datées (fiche 03 pour les protocoles).
