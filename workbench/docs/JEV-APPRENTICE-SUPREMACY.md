# JEV APPRENTICE SUPREMACY ENGINE (v1.1)

Patch d'évolution de JEV Apprentice. **Principe : FREE APPRENTICE → spécialiste par défaut ; modèle premium → Teacher / repli.**
Rien n'est supprimé (V5, Fabric, Free Model Lab, Model Council, benchmarks, exports). Avec l'interrupteur désactivé, le routage V5
est inchangé.

## Hiérarchie de routage (`apprentice/ladder.ts`)
L0 JEV-0 local · **L1 apprenti VALIDATED** · L2 spécialiste gratuit · L3 gratuit + micro-adaptation · L4 gratuit + correction ciblée ·
L5 spécialiste premium (routage V5) · L6 Model Council · L7 frontier. Un niveau supérieur n'est utilisé que si l'inférieur échoue à la porte
qualité ou n'est pas autorisé.

**Règle finale** : `validatedApprentice.exists ∧ confidence ≥ requis ∧ quality ≥ seuil ∧ health = healthy ∧ security = allowed ∧
capabilities = sufficient ∧ riskGate = PASS` ⇒ apprenti VALIDATED ; sinon routage V5 actuel.

## États et validation (`apprentice/supremacy.ts`)
FREE → ADAPTED → SPECIALIST → **VALIDATED** (→ DEGRADED). Seuils par défaut (configurables) : 10 missions, 3 formulations différentes,
réussite ≥ 90 %, qualité ≥ 90, 0 erreur critique, réussite récente ≥ 85 %, confiance ≥ MEDIUM ; HIGH : 95 % / 93 ; CRITICAL : 98 % / 97.
Réussite et qualité sont **pondérées par la récence** (demi-vie 30 j). Données insuffisantes ⇒ `INSUFFICIENT SAMPLE`, jamais VALIDATED.
Un profil dont la version a été annulée (ROLLBACK) perd VALIDATED. Un apprenti validé dont les missions récentes se dégradent
(réussite, qualité, limites de débit, latence) passe DEGRADED et perd la priorité.

Échantillon : n < 5 INSUFFICIENT · 5–19 INDICATIVE · 20–49 ROBUST · ≥ 50 HIGH CONFIDENCE.

## ApprenticeSupremacyScore
25 % tâche · 20 % qualité · 15 % réussite · 10 % confiance · 10 % fiabilité · 5 % outils · 5 % sortie structurée · 5 % latence ·
5 % efficacité économique (poids configurables, qualité/réussite/fiabilité/confiance ×1,5 pour HIGH et CRITICAL), × facteur de statut ×
facteur de dégradation.

## Premium override
Même VALIDATED, l'apprenti est contourné (→ V5) si : tâche critique sans seuil / confiance HIGH garantis, capacité manquante
(outils, vision, structuré, contexte), politique de sécurité incompatible, exigence de fraîcheur, modèle dégradé.

## Champions, matrice, mémoire de routage
`CURRENT CHAMPION FOR THIS TASK FAMILY` (jamais « best free model » seul) avec famille, n, qualité, réussite, confiance, date, repli,
référence premium mesurée et écart en points. Matrice modèle × domaine (qualité · réussite · n · confiance · statut). Mémoire de routage
persistante par famille (champion / repli / premium).

## Échecs, Teacher, payback
Signature d'échec (`STRUCTURED_OUTPUT_INVALID`, `MISSING_TABLE_RECONCILIATION`, `TOOL_SELECTION_ERROR`, `NUMERIC_REASONING_ERROR`,
`CONTEXT_OVERFLOW`…) → correction **nommée** (`FORMAT_REPAIR_V2`…). Échelle sans répétition : champion → correction → autre apprenti →
(adaptation d'un autre gratuit) → V5. Un succès premium après un échec crée une **skill candidate** (jamais validée d'office),
injectée « sous test » puis benchmarkée. Teacher ROI = (valeur de réutilisation future + gain immédiat) > coût ; la valeur future vient
de la fréquence MESURÉE de la famille × le coût premium MESURÉ (sinon N/A). Payback : investissement (Teacher + JEV + benchmark) vs appels
premium évités ; coût évité ESTIMÉ à partir du coût mesuré de la référence premium.

## Cache de capsules et temps
Clé `family × model × profileVersion × skillHash × contextHash × toolHash` ; CACHE HIT / MISS comptés ; jamais pour une tâche à exigence de
fraîcheur. Temps affichés = temps mesurés (récupération, compilation, adaptation, tokens avant / après) ; aucune cible n'est affichée comme acquise.

## Démonstration
Onglet « Démonstration (simulée) » : cycle IFRS9_ANALYSIS en 13 étapes sur des enregistrements **synthétiques étiquetés SIMULATED TEST ONLY**,
passés dans les vrais moteurs, jamais écrits dans le JEV_LOG. La preuve réelle = Apprentice Benchmark (bras A free · B free+JEV · C spécialiste ·
D apprenti VALIDATED · E premium), lancé par l'utilisateur.

## Entraînement réel
Niveaux 1–5 (adaptation à l'inférence, skills, distillation de stratégies, politiques, jeux de données) : disponibles. Niveaux 6–7
(fine-tuning, entraînement de poids) : **UNAVAILABLE** tant qu'aucune infrastructure externe n'est connectée.
