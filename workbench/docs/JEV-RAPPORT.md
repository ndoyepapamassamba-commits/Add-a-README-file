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
