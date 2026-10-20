# 12 — Risk Outlook (moteur probabiliste) : provenance, cohortes, calibration, analyses avancées

Source : APEX `jev*` (moteur de jugement probabiliste) et `jevAdvanced`. Dans les livrables, le moteur s'appelle **« Risk Outlook »** / « moteur sémantique » ; les noms d'outils internes n'apparaissent jamais (fiche 05 § 1).

## 1. États et lecture d'une ligne
États `['Sain', '31-60 j', '61-90 j', 'Douteux']` ; `jevEtat(dj, npl, seuil = 90)` : douteux si `npl` ou `dj > seuil` ; `61-90 j` si dj > 60 ; `31-60 j` si dj > 30 ; sinon sain. Les règles APEX s'appliquent (douteux = classe III/IV/V/IIN, compte 292, ou impayé au-delà du seuil).

## 2. Provenance — obligatoire sur chaque nombre

| Source | Signification |
|---|---|
| OBSERVED | lu dans le fichier (état actuel, impayé, classe) |
| EMPIRICAL | fréquence observée dans l'historique (comptage) |
| MARKOV | puissance de la matrice de transition calibrée |
| MODELLED | formule (Vasicek, LGD) sur des paramètres observés |
| EXPERT | multiplicateur issu d'un jugement (commentaires sémantiques, dire d'expert) |
| STRESS | scénario appliqué (× 1,5 / × 2 / stress inverse) |
| SIMULATED | Monte Carlo / bootstrap |
| HYBRID | combinaison des précédents (dire laquelle) |

Chaque provenance porte : `n` (effectif), `periodes` (mois d'historique), `calib` (date de calibration), `horizon`, `confiance` (élevée / moyenne / faible), `avertissement` si l'historique est insuffisant.

Seuils : `JEV_ROBUSTE` = **60** (effectif pour une confiance élevée), `JEV_MIN` = **24**, `JEV_NMIN` = **30** (en dessous, repli pondéré `w = n / 30` vers la matrice portefeuille : `m = w × observé + (1 − w) × repli`). Intervalle de Wilson à 95 % pour les fréquences.

## 3. Calibration (`jevRun`)
1. Lire chaque arrêté en mémoire (`jevLireArrete`), un état par compte et par mois.
2. Compter les transitions mensuelles (par segment `bseg` et portefeuille) → matrice 4 × 4 normalisée, dernière ligne absorbante `[0,0,0,1]`.
3. PD(h) = `P^h[état][Douteux]` pour h = 1…24 mois ; par client : état courant + segment (repli portefeuille si segment trop petit).
4. Scénarios ×1 / ×1,5 / ×2 via `jevStress` (les probabilités de dégradation sont multipliées, la diagonale est réduite pour garder une somme 1) ; `jevOdds(p, m)` applique un multiplicateur **sur les cotes** pour les ajustements EXPERT.
5. Commentaires sémantiques (retours d'analyse de texte : motif, crédibilité, cohérence, urgence, orientation ; **aucun chiffre produit par cette couche**) → multiplicateurs EXPERT et statut `Revue analyste` si confiance faible ou incohérence.
6. Recalibration automatique à chaque arrêté chargé ; clé de cache = arrêté + fichier + nombre de retours.

## 4. Analyses avancées (`jevAdvanced`)

| Analyse | Méthode | Provenance |
|---|---|---|
| Structure par terme | PD cumulée et marginale 1‑24 mois | MARKOV |
| Temps moyen avant défaut | matrice fondamentale `N = (I − Q)⁻¹`, somme des lignes | MARKOV |
| Probabilité de guérison | absorption à deux états (Sain / Douteux), horizon 240 mois | MARKOV |
| IC 90 % de la PD 12M | bootstrap bayésien : 300 tirages Dirichlet(N + ½) par ligne | SIMULATED |
| Backtest | matrice sans le dernier mois vs entrées observées ; `exp`, `obs`, ratio, Brier | EMPIRICAL |
| Stress inverse | dichotomie du facteur qui **double** la PD 12M | STRESS |
| Sensibilité | +10 % relatif sur chaque transition de dégradation (différences finies) | MARKOV |

## 5. Rendu dans les exports
Feuille « Risk Outlook » dans chaque classeur : titre, méthode, PD portefeuille 3/6/12 mois avec provenance, par segment, par client de la watchlist (PD 12M, source, confiance, action proposée, signaux), scénarios (entrées en douteux attendues en XOF), analyses avancées, avertissements. Insight 07 (prospectif) et 10 (analyses avancées) dans Credit Risk Intelligence (fiche 05 § 4).

## 6. Règles
- Sans historique (< 2 arrêtés) : « Risk Outlook non calibré (aucune archive d'arrêtés) » ; ne pas afficher de PD modélisée.
- Toujours écrire la provenance à côté du chiffre (« PD 12M = 4,2 % — MARKOV, N = 1 240, 9 mois, confiance moyenne »).
- Un multiplicateur EXPERT est annoncé comme tel, avec le commentaire qui le justifie.
