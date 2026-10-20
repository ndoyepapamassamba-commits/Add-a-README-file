# JEV APPRENTICE — FREE-FIRST, QUALITY-GATED, INTELLIGENCE-OPTIMIZED

Couche additive au-dessus de JEV V5 et du Cognitive Fabric. **Désactivée par défaut** : sans l'interrupteur
(JEV → JEV APPRENTICE), le routage V5 décide exactement comme avant. Rien n'est supprimé (Model Council, Free Model Lab,
fallback V5, exports, benchmarks).

> **« JEV-ADAPTED » = adaptation à l'inférence** (ADN de tâche, capsule de skills, exemples validés, règles d'échec, outils
> minimaux, contrat de sortie). **Aucun poids de modèle n'est modifié.** L'entraînement réel (fine-tuning, LoRA) reste
> UNAVAILABLE : le Distillation Lab / Training Data ne font que préparer des jeux de données.

## Boucle
`OBSERVE → CLASSIFY (Task DNA) → SELECT APPRENTICE → RETRIEVE SKILLS → MICRO-ADAPT → EXECUTE → VALIDATE (porte qualité)
→ CORRECT → RETRY → ESCALATE → TEACH → DISTILL → UPDATE SKILL → BENCHMARK → LEARN`

1. **Task DNA** (`apprentice/dna.ts`) : type, famille, difficulté, risque, ambiguïté, langue, domaine, sortie attendue,
   critères, outils, contexte, raisonnement, sortie structurée, latence, coût, **seuil qualité** (0,85 / 0,90 / 0,93 / 0,97
   selon le risque) + `freeEligibility` (capacités, contexte, politique de données).
2. **Registre Apprentice** (`registry.ts`) : une fiche par modèle gratuit, **uniquement à partir du JEV_LOG** ; statuts
   FREE → JEV-ADAPTED → JEV SPECIALIST → JEV-VALIDATED ; expertise par famille et par dimension avec effectifs ; santé ;
   détection de dégradation (réussite, qualité, limites de débit, latence). Un échec de la porte qualité est imputé au modèle
   gratuit (le succès final d'un autre modèle ne lui est pas crédité).
3. **Free-First Router** (`router.ts`) : priorité 1 gratuit déjà adapté · 2 gratuit au meilleur profil · 3 gratuit compatible
   non adapté · puis le routeur V5 (spécialiste payant → conseil → frontier). **ApprenticeScore** = 0,30 succès + 0,20 qualité +
   0,15 expertise + 0,10 outils + 0,10 sortie structurée + 0,05 fiabilité + 0,05 latence + 0,05 coût (poids configurables,
   renforcés pour high/critical). Confiance LOW → une seule tentative gratuite ; tâche CRITIQUE sans confiance HIGH → modèle
   premium directement ; risque d'échec attendu > tolérance → V5.
4. **Micro-adaptation** (`capsule.ts`) : capsule compacte compilée en quelques ms (temps mesuré), compression par priorité
   (jamais le contrat de sortie ni les critères), tokens ajoutés (estimés), skills / expériences / outils exposés, réduction de
   contexte ; `compressionVerdict` impose un ROLLBACK si la compression coûte de la qualité.
5. **Porte qualité + repli automatique** : FREE+JEV → FREE + correction ciblée → autre FREE → V5. Un défaut bloquant fait échouer
   la porte quel que soit le score pondéré. Aucun choix demandé à l'utilisateur.
6. **Teacher** (`teacher.ts`) : jamais appelé automatiquement ; gouverneur de coût EXECUTE/SKIP (gain qualité, gain de
   réussite, valeur d'information, coût, latence) ; seules les décisions observables sont distillées ; TeacherValueScore réduit la
   fréquence des appels inutiles ; transferts Teacher → Apprentice affichés.
7. **Versions** (`versions.ts`) : Gemma-IFRS9-v1/v2/v3, benchmark propre, promotion ou ROLLBACK ; skills CANDIDATE → VALIDATED →
   PRODUCTION.
8. **Métriques** (`metrics.ts`) : coût total réel (modèle + Teacher + JEV + outils + retries), qualité/$, succès/$, coût/succès
   et « QUALITY AT ZERO MODEL COST » (jamais de division par zéro) ; benchmark 5 bras (A free · B free+JEV · C +skills · D
   +expérience · E payant) ; formule de comparaison : « Free + JEV a atteint X % de la qualité de référence sur cette famille »
   avec n, confiance, version de benchmark, date — sinon INSUFFICIENT SAMPLE.
9. **Sécurité** : classification PUBLIC→HIGHLY_CONFIDENTIAL ; un fournisseur gratuit à politique inconnue ne reçoit jamais de
   données CONFIDENTIAL ou plus ; secrets nettoyés avant capsule / mémoire / log.

## Branchement runtime
`direct/lib/apprentice.ts` + hooks dans `direct/lib/agent.ts` (préparation, section de prompt `apprentice`, porte qualité,
repli, Teacher, tag `apprentice` dans le JEV_LOG, apprentissage après mission). Benchmark : `runApprenticeDemo`
(`direct/lib/fabricRun.ts`), lancé uniquement par l'utilisateur, tâches à réponse calculée.

## Honnêteté
Aucun résultat de benchmark Apprentice n'existe tant qu'il n'a pas été lancé. Les politiques de rétention/entraînement des
fournisseurs gratuits ne sont pas exposées par le catalogue : « NON RENSEIGNÉE » jusqu'à déclaration dans Security.
