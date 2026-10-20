# 09 — Salle de décision : Markov, IRB (Vasicek), Monte Carlo, concentration, stress, leviers

Source : APEX `dcParams`, `dcExposures`, `dcMarkov`, `dcMonteCarlo`, `dcConc`, `dcStress`, `dcLevers`, `dcVerdict`, `dcNarrative`. Tout est **calculé** sur les lignes chargées et les arrêtés en mémoire ; chaque résultat porte sa provenance (fiche 12). Un paramètre non fourni par l'utilisateur prend la valeur par défaut ci-dessous **et est affiché comme hypothèse**.

## 1. États et PD de base

États de décision `DC_ST` = `['I', 'IA', 'II', 'D']` (D = douteux : IIN/III/IV/V).

Chaînes de Markov sur les arrêtés en mémoire : matrice de transition mensuelle (comptage des passages par compte), PD 3 / 6 / 12 mois = puissance de la matrice, colonne D. **Fiable** seulement si ≥ 4 périodes et écart ≥ 25 jours entre arrêtés ; sinon repli sur la grille `dcParams` : PD(I) = **1 %**, PD(IA) = **2,5 %**, PD(II) = **8 %**, PD(D) = 100 %.

Ajustements par exposition (`dcExposures`) :
- souverain (regex État / Trésor / administration) : PD **0,03 %** ; banques : PD ≤ **0,3 %** ;
- dj > 60 ⇒ PD ≥ **35 %** ; dj > 30 ⇒ PD ≥ **15 %** ;
- LGD = **0,45 × (1 − cov) + 0,15 × cov**, où `cov` = part de l'encours couverte par des sûretés éligibles ;
- EAD = encours (+ CCF 50 % des engagements hors bilan si la colonne existe).

## 2. Capital IRB (formule de Bâle / Vasicek)

```
R(corporate) = 0,12 × (1 − e^(−50·PD)) / (1 − e^(−50)) + 0,24 × [1 − (1 − e^(−50·PD)) / (1 − e^(−50))]
R(retail)    = 0,03 × (1 − e^(−35·PD)) / (1 − e^(−35)) + 0,16 × [1 − (1 − e^(−35·PD)) / (1 − e^(−35))]
K = LGD × [ N( (N⁻¹(PD) + √R · N⁻¹(0,999)) / √(1 − R) ) − PD ]   (× ajustement de maturité pour corporate, M = 2,5 par défaut)
UL = K × EAD ; EL = PD × LGD × EAD
Solvabilité économique = CET1 / (12,5 × Σ UL)   — comparer au seuil UMOA 11,5 %
```

Le retail est reconnu par segment (1000, 1500) ou regex (particulier, salarié).

## 3. Monte Carlo

- Modèle à un facteur : `Z = √ρ · M + √(1−ρ) · ε`, défaut si `Z < N⁻¹(PD)`.
- **4 000** simulations portefeuille (3 000 pour les scénarios), **600 clients nommés** les plus exposés simulés individuellement, le reste agrégé par classe ; graine **20260917** (résultats reproductibles).
- Sorties : distribution des pertes, EL, **VaR 99 %**, **ES 99 %** (expected shortfall), contribution des 20 premiers clients à l'ES.

## 4. Concentration

HHI sur les parts d'encours (clients), **Gini** et courbe de **Lorenz**, nombre effectif `nEff = 1 / HHI`, parts top 10 / 20 / 50 ; **souverain exclu** du calcul de concentration (à dire explicitement). Grandes expositions : ≥ 10 % des FPE à déclarer, 25 % plafond (fiche 06).

## 5. Scénarios de stress

| Scénario | PD | LGD |
|---|---|---|
| Central | × 1 | + 0 pt |
| Adverse | × 1,5 | + 10 pts |
| Sévère | × 2,5 | + 20 pts |
| Choc sectoriel | × 4 sur le secteur choisi | + 20 pts sur le secteur |

Pour chaque scénario : EL, UL, VaR, ES, solvabilité résultante, bps de ratio NPL. **Stress inverse** : facteur PD (dichotomie) qui ramène la solvabilité à 11,5 % ou qui consomme **25 % du CET1** — à présenter comme « distance au seuil ».

Vintage (cohortes par année d'origination : taux de défaut à 12/24/36 mois) et **momentum** (variation des entrées en douteux sur 3 arrêtés) complètent la lecture si l'historique existe.

## 6. Leviers (`dcLevers`)

| Levier | Action | Valeur = ECL évitée + 15 % × capital libéré |
|---|---|---|
| COD | régularisation des comptes débiteurs > 60 j | ECL S2→S1 évitée |
| ORIG | durcissement d'origination sur les segments à PD > seuil | EL future évitée |
| SUR | prise de sûretés sur les expositions non couvertes > 100 M | LGD ↓ ⇒ K ↓ |
| CONC | réduction des 5 premières expositions au plafond 25 % | UL ↓ |
| REC | recouvrement des douteux récents (< 9 mois) | provision art. 16 évitée |
| IIN | traitement des douteux nouveaux avant 3 mois | 20 % → 0 % |

Classement par valeur décroissante, avec le nombre de dossiers et l'effort (jours gestionnaire estimés par le protocole de la fiche 03, jamais un coût inventé).

## 7. Verdict et récit (`dcVerdict`, `dcNarrative`)

Verdict en une ligne : **SOLIDE** (solvabilité > 11,5 % + 3 pts sous stress sévère), **ROBUSTE** (> 11,5 % sous adverse), **FRAGILE** (< 11,5 % sous adverse), **CRITIQUE** (< 11,5 % au central), avec les trois chiffres qui le justifient. Récit en sections : situation → PD et capital → concentration → stress → leviers → décision proposée (datée) → hypothèses et limites (données manquantes, repli de PD, taux fixes).
