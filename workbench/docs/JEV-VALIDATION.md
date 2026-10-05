# JEV — validation scientifique : audit, protocole, lecture des résultats

Cette phase ne développe pas de fonctionnalité « waouh » : elle sert à **mesurer** si JEV réduit les coûts inutiles sans dégrader la qualité, et à dire quand il le fait. Aucun résultat de ce document n'est un résultat de benchmark : le benchmark réel n'est lancé que par l'utilisateur, depuis l'onglet **JEV → Validation scientifique**.

## 1. Pourquoi le tableau affichait +946 % de tokens, +9102 % de coût, +1646 % de latence

Constat de code (ancien onglet « Sans / avec JEV », section « Toutes les missions enregistrées ») :

- la colonne **Sans JEV** regroupait les entrées `jev = false`, c'est-à-dire **uniquement les petites exécutions de référence du benchmark** (une question courte, un fichier de quelques lignes) ;
- la colonne **Avec JEV** regroupait **toutes les vraies missions** (`jev = true`) : agents multi-étapes, applications APEX, nombreux appels qui renvoient chacun tout le contexte ;
- le « Variation » était donc le rapport de deux **populations de tâches différentes**. Le calcul arithmétique était correct ; la **conception** de la comparaison ne l'était pas : elle ne permettait aucune conclusion sur JEV.

Défauts de mesure trouvés dans le même audit :

| Défaut | Conséquence | Correction |
|---|---|---|
| Les appels LLM faits **dans un outil** (`web.search`) étaient facturés mais **absents du coût de la mission** | coût sous-estimé, invisible | chaque appel est enregistré dans un registre par session (`direct/lib/acct.ts`), type `tool` |
| Une mission **interrompue ou en erreur** perdait le coût de ses appels déjà payés | coût caché | le registre garde chaque appel quelle que soit l'issue |
| Le coût pouvait être **calculé** (tokens × prix) sans que ce soit dit | « mesuré » trompeur | chaque appel porte `costSource` : `measured` (renvoyé par le fournisseur), `calculated` (tokens mesurés × prix), `estimated` (tokens estimés) |
| Les appels **JEV-3** (jugement live) n'entraient pas dans `jevCost` | coût de JEV sous-estimé | enregistrés (`jev3`) |
| La **qualité** n'était calculée qu'avec JEV | « qualité sans JEV » impossible à comparer | la même fonction de qualité est appliquée **après coup** à toutes les variantes, avec un budget de tokens de référence **fixe** (60 000) pour que la dimension « efficacité » soit comparable |
| « Tokens économisés » = définitions d'outils non envoyées | économie présentée comme réelle sans tenir compte du reste | séparés : `TOKENS_TOOL_SAVED` et `TOKENS_CONTEXT_SAVED` sont **CALCULATED** (estimation caractères / 3,8) ; seuls `NET_TOKEN_SAVING` et `JEV_NET_TOKEN_IMPACT` (différences de tokens facturés, appariées) sont **MEASURED** |

## 2. Comptabilité séparée (par mission)

Chaque appel payant est un enregistrement `{type, modèle, tokens entrée / sortie, coût, origine du coût, durée}` :

| Type | Contenu |
|---|---|
| `main`, `delegate` | appels productifs de la mission (agent, sous-agents) |
| `gate`, `continuation` | relances après une porte de livraison, réponse coupée et continuée (coût inclus dans LLM_COST, tokens affichés à part : RETRY) |
| `correction` | correction ciblée demandée par la QA JEV (CORRECTION_COST) |
| `tool` | appel LLM à l'intérieur d'un outil (TOOL_COST) |
| `jev1`, `jev2`, `jev3` | appels propres à JEV : TypeSafe Jev (tokens d'entrée × prix publié), arbitrage par petit LLM, jugement live (JEV_COST) |
| QA | **locale et déterministe : aucun appel, coût 0 (MEASURED)** |

`TOTAL = LLM + JEV + QA + CORRECTION + TOOL`. La répartition de l'entrée en système / outils / historique / résultats d'outils est une **estimation** (CALCULATED) et un reliquat « non attribué » est affiché. Le test e2e réconcilie, exécution par exécution, `acct` avec `cost` et `jevCost` du journal.

## 3. Expérience appariée

Pour chaque **tâche × répétition** (un `benchmark_group_id`) : OFF, PRE, LIVE, FULL, dans un **ordre mélangé** (annule les effets d'ordre et de cache de prompts du fournisseur), avec :

- même prompt (empreinte `promptHash`) ;
- même état de l'espace de travail (`contextHash` ; entre deux exécutions, les fichiers créés par les exécutions précédentes sont supprimés et les données de la tâche réécrites) ;
- mêmes outils disponibles (`toolsAvailable`), même température, même `max_tokens` ;
- **protocole « modèle imposé »** (par défaut) : le même modèle pour les 4 variantes, ce qui isole l'effet de JEV. Le protocole « routage libre » laisse le routeur choisir : le modèle peut différer et la paire est alors marquée **NON COMPARABLE**.

Variables enregistrées : modèle (+ version / slug si disponible), prompt, type de tâche, difficulté, risque, outils, contexte, température, max tokens, mode JEV, répétition, ordre, horodatage. Si une variable contrôlée diffère entre OFF et la variante, la paire est exclue des conclusions et listée avec la raison.

Les missions sans groupe restent dans **Observational Data** : elles sont décrites, jamais comparées.

## 4. Statistiques (proportionnées à l'échantillon)

- Par variante : moyenne, médiane, p95, min, max, écart-type (tokens, coût, latence, qualité), taux de réussite.
- Par paire : différences `variante − OFF` (Δ tokens, Δ coût, Δ qualité, Δ latence, Δ réussite), moyenne, médiane, intervalle de confiance à 95 % de la moyenne (Student, n ≥ 3), nombre de paires où la variante est plus basse / plus haute. ✱ signale un IC qui exclut 0.
- **n ≥ 5 paires valides** pour toute conclusion (global, par variante, par catégorie) ; en dessous : « ÉCHANTILLON INSUFFISANT ». Pas de test sophistiqué : des différences appariées et un IC de Student suffisent à cette taille.

## 5. Métrique principale et score

- **Coût par mission réussie** = coût total / nombre de missions réussies (le coût de JEV compris). Une stratégie plus chère n'est pas pénalisée si elle augmente la réussite.
- La qualité non mesurée s'affiche **NON MESURÉ** (jamais 0) et est exclue du Δ de qualité.
- **COGNITIVE EFFICIENCY SCORE** (OFF = 100), formule visible dans l'interface : moyenne géométrique pondérée des rapports variante / OFF — réussite 0,30, qualité 0,20, coût / réussie 0,25, tokens / réussie 0,10, latence 0,10, retouches (retries + escalades + corrections) 0,05 ; les composantes non mesurables sont retirées et les poids renormalisés. Les composantes restent consultables.

## 6. ROI et valeur nette de JEV

```
JEV_GROSS_COST   = coût des appels propres à JEV (jev1 + jev2 + jev3)
SAVINGS          = coût mission OFF − coût mission de la variante (JEV exclu)
JEV_NET_VALUE    = SAVINGS − JEV_GROSS_COST
JEV_ROI          = SAVINGS / JEV_GROSS_COST      (non défini si JEV est gratuit : JEV-0 local)
NET_TOKEN_SAVING = TOKENS_BASELINE − TOKENS_ACTUAL (mission, JEV exclu)
JEV_NET_TOKEN_IMPACT = NET_TOKEN_SAVING − tokens consommés par JEV
```
Si `JEV_NET_VALUE < 0` ou `ROI < 1`, le tableau l'affiche en rouge : « économiquement négatif ».

## 7. Règles économiques dans le moteur

- **EVI gate** : avant un appel JEV payant (JEV-1, JEV-3), `bénéfice attendu = P(utile) × coût évitable` est comparé au coût de l'appel ; `SKIP` ou `USE`, tracé « EVI (projetée) » (c'est une projection, étiquetée comme telle).
- **Auto-downgrade pas à pas** JEV-3 → 2 → 1 → 0 : un niveau est retiré (au plus tous les 2 étapes) quand ce que JEV a économisé sur la mission (mesuré) est inférieur à son coût × seuil de ROI (réglable, 1 par défaut).
- **ECONOMIC_DRIFT** : l'entrée par appel croît (×1,3 sur 3 appels) sans progrès, ou le coût dépasse 60 % du budget pour un progrès < 40 % : COMPRESS, LOWER_REASONING, REPLAN ou SWITCH_MODEL, enregistré dans le journal. Le « progrès » est un indicateur interne (information nouvelle), **pas une mesure de qualité**. Au niveau des expériences, une dérive est aussi signalée quand une variante coûte plus de tokens sans gain de qualité, ou plus d'argent sans gain de réussite.
- **Arrêt anticipé** : les raisons d'arrêt sont enregistrées (`stopReason`). Les tokens et le coût économisés par un arrêt ne peuvent se mesurer que dans une comparaison appariée : aucun chiffre n'est avancé hors de là.
- **Politique adaptative** (désactivée par défaut) : applique, par catégorie, le niveau que les mesures ont désigné (coût / mission réussie le plus bas à réussite et qualité conservées), **uniquement si la catégorie a ≥ 5 groupes** ; sinon le comportement par défaut ne change pas.

## 8. Verdicts possibles

A — rentable · B — rentable uniquement pour certaines catégories · C — neutre · D — contre-productif · E — données insuffisantes. Les seuils (±5 % du coût / mission réussie, 5 points de réussite, 3 points de qualité, n ≥ 5) sont affichés dans l'interface.

## 9. Limites assumées

- La qualité est un score **local déterministe** (format, langue, éléments demandés, syntaxe, secrets, chiffres sans preuve, cohérence) ; en benchmark, la dimension « correction » vient du contrôle de réussite de la tâche. Elle ne juge pas la pertinence d'une réponse libre.
- Les tâches du benchmark sont courtes : elles n'exercent ni le changement de modèle ni l'escalade.
- Le cache de prompts du fournisseur peut avantager certaines exécutions : l'ordre est mélangé mais le cache n'est pas contrôlable.
- Les tokens facturés incluent le cache de prompts ; le coût (renvoyé par le fournisseur) en tient compte, les tokens non : lire coût et tokens ensemble.
- Aucun benchmark réel n'a été lancé pour cette phase (consigne : seulement à l'initiative de l'utilisateur). Les tests automatisés utilisent un serveur simulé et ne produisent aucun résultat publié.
