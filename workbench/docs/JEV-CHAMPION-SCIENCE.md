# JEV Apprentice — Champion Science Engine v1.2

Laboratoire Champion ↔ Challenger ↔ Référence premium, ajouté **au-dessus** de JEV Apprentice (Supremacy v1.1).
Rien n’est supprimé : Apprentice désactivé ⇒ routage V5 strictement inchangé.

## Principes (règles absolues)
- Aucune donnée ni métrique inventée : sans échantillon, l’interface affiche `N/A`, `NON MESURÉ`, `INSUFFICIENT SAMPLE`.
- Jamais de promotion sur un simple score ; jamais « équivalent au premium » sans preuve : le moteur dit
  « non-inférieur selon la marge configurée ».
- Jamais de sécurité sacrifiée au coût : un modèle sans politique déclarée reste `PUBLIC_ONLY`.
- Le scénario IFRS9 est **SIMULATED TEST ONLY** : enregistrements synthétiques (graine fixe), état jetable,
  rejetés par `isReal`, jamais persistés ni comptés dans les statistiques de production.

## Pipeline
`DISCOVERY → ELIGIBILITY → CHALLENGER → CONTROLLED TEST → VALIDATION → STATISTICAL COMPARISON → PROMOTION DECISION`.
Un nouveau modèle est toujours `CHALLENGER`, jamais champion directement.

## Modules (`server/jev/apprentice/`)
| Module | Rôle |
| --- | --- |
| `intervals.ts`, `stats.ts` | Wilson, Student-t, Welch/apparié, Newcombe, Cohen d, seuils d’échantillon (n<5 INSUFFICIENT · 5–19 INDICATIVE · 20–49 ROBUST · ≥50 HIGH CONFIDENCE, plus stricts en HIGH/CRITICAL), `armStats` |
| `strata.ts` | Strates (famille, risque, contrat, difficulté, outils, contexte, langue), `matchedTaskSet` (sinon NON-COMPARABLE) |
| `lab.ts` | `evaluateNonInferiority`, `shouldPromoteChallenger`, `detectChampionDegradation`, `runLab` (champions par famille / famille+risque / famille+risque+contrat, rollback vers le champion précédent, historiques), `lookupChampion` |
| `experiment.ts` | `runChampionChallengerExperiment` : tâches appariées, garde de sécurité, analyse par paires |
| `discovery.ts` | Découverte → sécurité → capacités → santé → CHALLENGER → benchmark → validation → promotion |
| `teacherLearning.ts` | Teacher comme investissement : `calculateTeacherROI` → INVEST / DO NOT INVEST (réutilisation et coût premium mesurés) |
| `failurePatterns.ts` | Motifs d’échec (≥ 3 identiques) → Skill candidat (testé WITH/WITHOUT avant promotion) |
| `decisionCache.ts` | Caches (taskDNA, championLookup, routingDecision, benchmarkResult…) avec taux de hit et latences mesurés ; la clé inclut classification, risque et révision du lab |
| `labView.ts` | Modèles de lecture UI (KPI, table, cube d’expertise, points de graphiques, coût) |
| `labScenario.ts` | Scénario IFRS9 en 18 étapes (simulé, reproductible) |

## Décision de promotion
`PROMOTE` / `KEEP CHAMPION` / `REJECT CHALLENGER` / `COLLECT MORE DATA` / `ROLLBACK`, avec la liste des contrôles :
échantillon, comparabilité, erreurs critiques, fiabilité, sécurité, capacités, coût, latence, dégradation, cooldown.
La non-infériorité se juge sur l’IC de (challenger − champion) contre la marge (Policy Engine → Seuils).

## Routage
Le champion du lab pour (famille, risque[, contrat]) est prioritaire **seulement** s’il est VALIDATED, sain, autorisé
par la sécurité, capable et s’il passe la porte de risque (`finalRule`) ; sinon le classement Supremacy décide.
Tâche critique ⇒ override premium sauf apprenti VALIDATED HIGH. L’explication « WHY THIS MODEL? » reprend la
décision du lab.

## Apprentissage continu
Après chaque mission réelle (Apprentice actif et « apprentissage continu » coché), `runLab` s’exécute et ajoute à la
trace les checkpoints réels `STATISTICAL_EVALUATION`, `CHAMPION_DECISION`, `MEMORY_UPDATE`. Une mission seule ne
promeut jamais. L’état (`fabric.lab`, `fabric.discovered`) est persisté dans IndexedDB.

## Interface
JEV → **CHAMPION SCIENCE LAB** : KPI (Active Champions, Challengers, Promotions, Rollbacks, Degraded Champions,
Premium References, Premium Calls Avoided, Estimated Cost Avoided, Teacher Investments, Teacher ROI, Statistical
Confidence, Non-Inferiority Decisions), table FAMILY / CHAMPION / CHALLENGER / N / QUALITY / SUCCESS / PREMIUM / DELTA /
CONFIDENCE / DECISION / LAST TEST, expériences, cube MODÈLE × FAMILLE × RISQUE × CONTRAT, graphiques (qualité/coût,
réussite/coût, latence/qualité — `INSUFFICIENT SAMPLE` si n < 5), Teacher & coût, motifs d’échec & découverte,
historiques, scénario simulé, seuils. Le scénario est aussi visible dans Cognitive Benchmark, Apprentice Benchmark,
Trace & Ladder et Routing Memory. Les seuils sont éditables dans Policy Engine.

## Benchmark 2.0 (bras)
A FREE BASELINE · B FREE+JEV · C FREE SPECIALIST · D VALIDATED APPRENTICE · E CHALLENGER · F PREMIUM REFERENCE. Chaque
bras est étiqueté réel ou simulé ; les bras simulés n’alimentent jamais la mémoire de production.

## Tests
`tests/unit/championLab.test.ts` (TEST 01–20, scénario 18 étapes, statistiques, expériences),
`tests/e2e/champion.spec.ts` (UI, persistance, Apprentice OFF), non-régression `fabricRegression` (inventaire des
modules, aucune donnée synthétique dans le journal réel, état vide ⇒ aucun champion).
