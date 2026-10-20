# JEV COGNITIVE SUPER-FABRIC — Phase 2

Couche **additive** au-dessus de JEV V5. Rien n'a été retiré ni remplacé : expériences appariées,
exports JSON/CSV, traces, JEV_LOG, contrôle des coûts, repli JEV-0, Benchmark 2.0 et UI existants
sont intacts (vérifié : 323 tests unitaires, 28 e2e, rapport de non-régression).

## Principes
- **Aucune donnée fabriquée.** Tout est dérivé du JEV_LOG (exécutions réelles). Valeur absente = « NON MESURÉ ».
  Confiance = n/(n+k). Gains projetés étiquetés PROJECTED.
- **Désactivé par défaut** (`FabricSettings.enabled=false`). L'enregistrement passif est toujours actif ;
  les comportements actifs (sélection de capacités, skills, préférences apprises, conseil) sont opt-in.
- Les expériences Fabric portent un tag `fabric` et sont **exclues** de l'appariement scientifique V5.
- Les benchmarks ne tournent que lorsque l'utilisateur les lance (appels réels, facturés, confirmation).

## Modules (`server/jev/fabric/`)
| Module | Rôle |
|---|---|
| `registry.ts` | Capability Registry, `CapabilityAdapter`, découverte dynamique, sélecteur minimal (jamais tous les outils), `GitHubCapabilityAdapter` |
| `memory.ts` | Experience Memory, « Ai-je déjà rencontré ce problème ? », Failure Replay, Intelligence Graph |
| `learning.ts` | Matrice d'expertise (données réelles), politiques apprises (evidence/confidence/rollback), exploration ε, Economic Governor, Health Score |
| `skills.ts` | Skill Factory : répétition + généralisation + validation ; versions PROMOTE/ROLLBACK/DEPRECATE/CLONE/COMPARE ; test AVEC/SANS |
| `council.ts` | Model Council (1/2/3+ selon la tâche, gouverneur, évaluateur, pas de vote aveugle), Free Model Lab, tournoi |
| `distill.ts` | Teacher/Student, Distillation Lab, Training Data Factory (JSONL/JSON/CSV). Niveaux 6–7 = UNAVAILABLE |
| `security.ts` | Classification PUBLIC→HIGHLY_CONFIDENTIAL, politique fournisseur, nettoyage des secrets, gouvernance des plugins |
| `cache.ts` | Cache cognitif L0–L6 (TTL, version, provenance, confiance, invalidation) |
| `cfbench.ts` | Cognitive Fabric Benchmark : 80 tâches à vérité calculée, BASELINE vs JEV V5 vs FABRIC |

Runtime : `direct/lib/fabric.ts`, `fabricRun.ts`, `fabricRegression.ts`, hooks dans `agent.ts`.
UI : onglets « Cognitive Super-Fabric » du JEV Control Center (`JevFabric.tsx`, `JevFabric2.tsx`).

## GitHub
`GitHubCapabilityAdapter` : santé réelle (`/rate_limit`), AVAILABLE / PARTIAL / UNAVAILABLE, jamais simulé.
Sans jeton : lecture publique seulement (PARTIAL). Écritures (push, merge, delete, publish…) = **préparées**
(`pendingApproval`) et exécutées uniquement après approbation explicite. Le jeton n'entre jamais dans un
prompt, un log, un export, la mémoire ou une skill.

## Ce qui est réellement connecté / non connecté
- Connecté : outils locaux, plugins, MCP, skills, modèles OpenRouter, évaluateurs, GitHub (lecture publique).
- Non connecté : GitHub en écriture sans jeton ; fine-tuning (niveaux 6–7 d'apprentissage) ; politiques
  de rétention des fournisseurs (non exposées par le catalogue — à renseigner dans Security).
- Aucun résultat de benchmark cognitif n'existe tant que l'utilisateur n'en a pas lancé un.
