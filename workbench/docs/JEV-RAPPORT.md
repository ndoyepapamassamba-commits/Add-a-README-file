# JEV Cognitive Companion — rapport technique (05/10/2026)

Tous les chiffres ci-dessous sont mesurés : appels réels à OpenRouter et à TypeSafe Jev, depuis l'application construite. Aucun n'est extrapolé.

## Fonctionnalités intégrées
- **Avant l'appel au modèle**
  - JEV-0 déterministe produit l'Execution Packet (champs de la spécification).
  - JEV-1 (TypeSafe Jev) passe derrière un ROI gate ; JEV-2 arbitre les conflits.
  - Les requêtes déterministes sont traitées en L0, sans LLM.
- **Préparation du contexte**
  - Compilateurs de contexte, de mémoire et de style (code, écriture, préférences, contrat de sortie).
  - Sélection des outils, skills et MCP (TOOL PACK + `tools.request` + ADD TOOL).
  - Budgets : tokens, coût, temps, étapes, retries.
- **Pendant l'exécution**
  - Moniteur d'exécution : STOP, COMPRESS, REMOVE TOOL, SWITCH STRATEGY.
  - Escalade L0–L5 bornée par le gain marginal.
- **Après l'exécution**
  - Vecteur qualité et correction ciblée.
- **Infrastructure et interface**
  - Caches avec durée de vie (TTL).
  - JEV_LOG en JSON / CSV, profils de modèles, KPI sans / avec JEV, benchmark A/B sur 12 catégories.
  - API JEV : clé masquée, relais, repli sur JEV-0.
  - Rapport de régression, JEV Control Center.

## Points d'intégration (code réel)
- `direct/lib/agent.ts`, dans la boucle d'agent :
  - `jev.pre` avant le routage, qui remplace le doublon decideRoute / skills / loadout ;
  - packet injecté dans le prompt ;
  - pack d'outils envoyé à OpenRouter ;
  - historique compilé ;
  - moniteur après chaque appel et chaque outil ;
  - QA et correction dans la porte de livraison ;
  - garde d'escalade ;
  - sub-packet pour les agents délégués ;
  - réponses L0 et `jev.learn` dans `runAgent`.
- Modules : `server/jev/*` (cœur pur), `direct/lib/jev.ts` (runtime), `direct/views/JevView.tsx`, `JevTrace.tsx`.
- Cost Optimizer absorbé : le même composant (`CostsTab`) est affiché sous « Cost Intelligence ».

## Modèles et outils concernés
- **Modèles retenus en réel** : openai/gpt-6-luna, deepseek/deepseek-v4-flash-0731, xiaomi/mimo-v2.6-flash (secours), et un modèle de palier QUALITY pour DOCUMENT (contrat, donc critique).
- **JEV-1** : jev-1.13.0.
- **Outils exposés** : de 9 à 27 sur 53 selon la tâche (52 ou 53 sans JEV).

## Coût de JEV
- Test de connexion JEV-1 : 486 ms, 658 tokens, 0,000028 $.
- 12 missions avec JEV : coût JEV total 0,0001 $. Le ROI gate a évité la plupart des appels distants : JEV-0 était sûr de lui à 95 %.

## Benchmark A/B réel (12 catégories × sans / avec JEV)
| Mesure | Sans JEV | Avec JEV | Variation |
|---|---|---|---|
| Tokens / mission (passe 1, à froid) | 20 664 | 13 185 | −36 % |
| Coût / mission (passe 1) | 0,0048 $ | 0,0028 $ | −42 % |
| Latence moyenne (passe 1) | 6,5 s | 7,7 s | +18 % |
| Réussite | 24 / 24 | 24 / 24 | = |

- **Défauts trouvés par cette passe 1, puis corrigés :**
  - « tableau de nombres » était pris pour une demande de format tableau ;
  - « reporting » déclenchait APEX à tort ;
  - l'exécution de code était exigée pour un extrait trivial.
- **Passe 2, après les correctifs** : tokens −17 %, coût −35 %. Les invites de la ligne de base y profitaient déjà du cache de prompts d'OpenRouter, d'où un écart moins net.
- **Après le dernier correctif**, CODING passe de 7,4k tokens sans JEV à 4,9k avec (22,2k avant le correctif), et REFACTORING de 7,4k à 4,6k.
- **Contexte** : compression moyenne de 63 %. 134k tokens de définitions d'outils n'ont pas été envoyés, soit 0,031 $ d'économie pour 0,0001 $ de coût JEV.
- **Qualité** : moyenne 99/100 avec JEV. Le vecteur qualité n'est pas calculé sans JEV.

**Objectif > 90 % : non atteint et non revendiqué.** La réduction mesurée est de 17 à 42 % selon la passe. La latence augmente sur certaines tâches : le packet ajoute des tokens d'entrée et JEV-1 environ 0,5 s quand il est appelé.

## Tests
- 212 tests unitaires et d'intégration, dont 16 pour JEV : JEV-0, JEV-1 (succès, échec 503, réponse mal formée, délai dépassé), ROI gate, contexte, mémoire, style, pack d'outils, QA, correction, gain marginal, moniteur, cache, masquage des secrets, métriques.
- 32 tests e2e sur les deux éditions, dont 3 pour JEV :
  - packet, trace, outils envoyés, ADD TOOL, correction JSON ciblée, JEV_LOG ;
  - L0 sans LLM ;
  - Control Center : clé jamais dans le DOM, JEV-1 via relais puis repli, rapport de régression, A/B.

## Régressions
- **Détectées** : deux tests e2e supposaient que tous les outils étaient envoyés. C'est une conséquence voulue du pack d'outils, et les tests ont été adaptés pour vérifier le pack.
- **Rapport d'inventaire automatique** (46 outils, 11 outils de plugins, 26 agents, 13 vues, 9 MCP, 18 skills, 11 réglages, 60 clés d'état) : rien n'a disparu.

## Limites restantes
- **Appel direct impossible.** Le navigateur ne peut pas appeler api.typesafe.ai (CORS) : JEV-1 exige un relais. Un modèle Deno / Supabase est fourni ; il n'est pas déployé.
- **Édition serveur.** Elle garde son classifieur Jev existant et la décision expliquée, mais pas encore le packet ni le Control Center.
- **Mesures.** L'efficacité dépend des déclencheurs par mots-clés de JEV-0 (des faux positifs restent possibles, corrigeables via les profils) et le benchmark est petit (12 tâches courtes) : à relancer sur vos missions réelles.

---

# Phase 2 — JEV LIVE, relais CORS, Benchmark 2.0 (05/10/2026)

Mesures réelles : application construite (`dist/massamba-workbench-direct.html`), appels OpenRouter réels, JEV-1 réel (TypeSafe jev-1.13.0) via un relais au comportement identique au relais Supabase. Aucun chiffre extrapolé.

## Relais CORS
- `relay/jev-relay/index.ts` déployé en Edge Function Supabase (projet mntech-sync) : il transmet la clé JEV de l'utilisateur à TypeSafe, n'en stocke ni n'en journalise aucune, n'appelle que l'endpoint TypeSafe, refuse > 200 ko.
- Vérifié depuis un vrai navigateur : appel direct à api.typesafe.ai → « Failed to fetch » (CORS) ; appel via le relais → réponse de TypeSafe (401 avec une fausse clé, donc l'appel passe). Non vérifié : une réponse 200 via le relais Supabase avec la vraie clé (je n'y ai pas accès).
- Test de connexion JEV-1 via le relais de test : OK, 381–420 ms, 658 tokens, 0,000028 $.

## Benchmark 2.0 — 15 tâches × 4 variantes × 2 répétitions = 120 exécutions (19 min, ≈ 0,48 $)
| Variante | Tokens / mission (moy · méd · p95) | Coût / mission (moy) | Latence (moy · méd) | Succès | Outils exposés (moy) |
|---|---|---|---|---|---|
| SANS JEV | 22,9k · 22,8k · 48,8k | 0,0066 $ | 11 s · 7,4 s | 30/30 | 52 |
| JEV PRE | 12,8k · 12,5k · 24,2k | 0,0036 $ | 8,3 s · 7,8 s | 29/30 | 18,7 |
| JEV PRE + LIVE | 13,1k · 16,4k · 21,7k | 0,0032 $ | 10 s · 7,0 s | 30/30 | 14,1 |
| JEV FULL | 13,3k · 16,4k · 24,7k | 0,0025 $ | 8,2 s · 6,8 s | 30/30 | 13,9 |

| Δ vs SANS JEV | Tokens | Coût | Latence (moy) | Réduction du gaspillage évitable |
|---|---|---|---|---|
| JEV PRE | −44 % | −45 % | −25 % | 66 % |
| JEV PRE + LIVE | −43 % | −51 % | −9 % | 66 % |
| JEV FULL | −42 % | −62 % | −26 % | 66 % |

- **Gaspillage mesuré** (définitions d'outils jamais utilisés + appels en échec ou répétés + réponses jetées) : 16,1k tokens / mission sans JEV (70 % des tokens), 5,4k avec JEV FULL (41 %). **Cible > 90 % de réduction : non atteinte (66 %).** L'essentiel du reste est constitué des définitions des ~14 outils encore exposés mais non appelés.
- **Contrôle live** : 174 (PRE + LIVE) et 179 (FULL) décisions sur 30 missions, surtout REMOVE_TOOL et REMOVE_CONTEXT ; 7,6k et 10,7k tokens évités par l'élagage live. Aucun changement de modèle, aucune correction ni escalade déclenchés sur ces tâches (elles ont toutes réussi du premier coup).
- **Coût de JEV** : 5 appels JEV-1 (cache ensuite), 0,00011 $ au total, soit 0,1 % du coût LLM de la variante PRE ; temps de décision moyen 2 à 69 ms (69 ms quand JEV-1 est appelé). JEV ROI (PRE) : 777×.
- Écarts de coût entre variantes : dominés par DOCUMENT (0,045 $ → 0,024 $) et MULTI-AGENT (0,019 $ → 0,003 $). Avec 2 répétitions, les écarts entre PRE, PRE + LIVE et FULL restent dans le bruit.
- 1 échec sur 120 : PLANNING, variante PRE, répétition 1 (contrôle de format « 1. 2. 3. »).

## Rapport final par fonctionnalité
| Fonctionnalité | État | Preuve |
|---|---|---|
| JEV PRE | OK | benchmark réel, tests unitaires et e2e |
| JEV LIVE (checkpoints adaptatifs) | OK | 353 décisions live en réel ; e2e stagnation → REPLAN |
| JEV POST (QA, correction ciblée) | OK | e2e (correction JSON) ; 0 correction nécessaire en réel |
| Dynamic Model Switching | OK en tests, non déclenché en réel | tests unitaires (montée sur stagnation, descente sur étapes mécaniques, jamais sur tâche critique) |
| Dynamic Token Budget (B0 → B3) | OK | tests unitaires ; par défaut, plus d'arrêt sur budget tokens / temps (interrupteur dans le Control Center) |
| Context Pruning live | OK | 7,6k / 10,7k tokens évités en réel |
| Tool Optimization (pack + ROI live) | OK | 52 → 14 outils exposés en moyenne |
| QA (vecteur, cohérence, localisation, L0/L1) | OK | tests unitaires ; L2 / L3 non implémentés comme étapes distinctes |
| Escalade (gain marginal) | OK en tests, non déclenchée en réel | tests unitaires |
| Apprentissage (👍 / 👎, « parfait » / « c'est mauvais », motifs) | OK | e2e |
| Benchmark 2.0 | OK | 120 exécutions réelles ci-dessus |
| Régression | OK | rapport de régression sans perte, 236 tests unitaires, 33 e2e |

Limites : 2 répétitions seulement (budget OpenRouter), tâches courtes qui n'exercent pas les changements de modèle ni les escalades ; la qualité de la variante SANS JEV n'est pas notée (la QA JEV ne tourne qu'avec JEV), donc pas de Δ qualité.
