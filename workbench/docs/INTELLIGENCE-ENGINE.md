# MASSAMBA Intelligence Engine — architecture, fonctionnement, rapport

Le rapport date du 05/10/2026. Les chiffres viennent des tests et des exécutions réelles décrits plus bas.

## 1. Architecture

```
MISSION ─► TASK DNA ─► EXIGENCES (type, complexité, risque, criticité, indice minimal,
           qualité pondérée minimale, vision, contexte, vitesse, budget)
        ─► DÉCOUVERTE (catalogue OpenRouter en direct, skills, MCP, outils, GitHub)
        ─► FUSION DES PREUVES (faits · benchmarks · MASSAMBA · inférences)
        ─► SCORE DE ROUTAGE PONDÉRÉ ─► DÉCISION (le moins cher qui atteint la qualité)
        ─► EXÉCUTION ─► QA / VÉRIFICATION (Jev, preuves, red team, juge)
        ─► CASCADE (accepter · corriger · escalader · arrêter)
        ─► TÉLÉMÉTRIE ─► APPRENTISSAGE (classement personnel, stratégie, ledger)
```

L'architecture existante n'a pas été remplacée : le moteur l'étend. Le routage par paliers (`server/llm/routing.ts`) reste le repli quand aucune preuve n'existe.

| Module (pur, partagé par les deux éditions) | Rôle                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `server/engine/decision.ts`                 | Exigences, score pondéré configurable, décision expliquée, échelle d'escalade, score QA, cascade |
| `server/engine/evidence.ts`                 | Preuves (source, date, score, confiance, URL, fraîcheur), fusion, contradictions                 |
| `server/engine/skills.ts`                   | Skill Registry (18 skills décrits), sélection par mission, incompatibilités                      |
| `server/engine/capabilities.ts`             | MCP Registry (25 serveurs), options « gratuit d'abord » par capacité                             |
| `server/engine/github.ts`                   | Découverte GitHub, scan profond, revue de sécurité, détection d'injection                        |
| `server/engine/registry.ts`                 | Cycle de vie DÉCOUVERT → REVU → APPROUVÉ → INSTALLÉ → ACTIVÉ / DÉSACTIVÉ / REJETÉ, rollback      |
| `server/engine/loadout.ts`                  | Équipement d'agent (skills, MCP, outils, stratégie QA) et co-conception agent × modèle           |
| `server/engine/telemetry.ts`                | Coût par mission réussie, qualité / $, tokens / réussite, temps / réussite, économie estimée     |
| `server/engine/githubSnapshot.json`         | Relevé GitHub daté (23 dépôts) pour le fonctionnement hors-ligne                                 |

Points d'intégration :

- **Édition directe** (`direct/lib/agent.ts`) :
  - décision avant le premier appel, avec la carte « Décision de routage » dans le chat ;
  - méthodes des skills injectées dans les instructions de l'agent ;
  - cascade dans les tours de correction, après la red team et après le refus du relecteur ;
  - télémétrie complète dans le ledger, correction humaine détectée au message suivant.
- **Édition serveur** (`server/agent/orchestrator.ts`) : même décision expliquée (événement `intel`), skills, cascade.
- **Interface** : vue **Intelligence**, avec 12 onglets (§ 3).

## 2. Règles de décision

- **Éligibilité** : le modèle doit atteindre l'indice du palier sur la mesure de la tâche (Intelligence ; Coding pour le code ; Agentique pour le navigateur). Il faut aussi :
  - une qualité pondérée minimale (CHEAP 50, BALANCED 60, QUALITY 70, MAXIMUM 78) ;
  - une fiabilité correcte ;
  - un prix sous le plafond, si un plafond est fixé ;
  - une estimation dans le budget restant.
- **Choix** : le coût estimé par mission réussie le plus bas l'emporte (coût estimé ÷ probabilité de réussite). À ±10 % près, le meilleur score départage. Le plus intelligent n'est jamais le choix par défaut.
- **Score de routage** (réglable) : réussite 35 %, intelligence 20 %, outils / code 15 %, agentique 10 %, fiabilité 10 %, latence 5 %, coût 5 %.
  - La probabilité de réussite part d'une estimation fondée sur l'indice de la tâche, puis se met à jour avec vos missions (loi bêta, force 4).
  - Une dimension non mesurée est affichée « est. ».
- **Cascade** : un score QA sous le seuil (75 % par défaut) déclenche une escalade vers le modèle le moins cher du palier supérieur. C'est limité à 2 escalades et au budget restant. Sinon, une nouvelle correction a lieu avec le même modèle, puis la cascade s'arrête. Le score QA tient compte de :
  - la part des contrôles réussis ;
  - les chiffres sans preuve (−10 chacun) ;
  - un blocage de la red team (−25) ;
  - un refus du relecteur (−20) ;
  - le verdict : PARTIAL plafonné à 70, FAILED à 40.
- **Mode dégradé** :
  - Sans benchmark, le routage passe par paliers.
  - Sans catalogue, le modèle par défaut est utilisé.
  - Sans GitHub, c'est le relevé daté.
  - Sans MCP, ce sont les outils natifs.
  - Sans CDN Python, c'est le pack hors-ligne.

## 3. Interface : vue Intelligence

| Onglet           | Contenu                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model Router     | Décision en direct pour une mission saisie, pondérations, seuil QA, escalades, plafond de prix                                                                                                                                                                                                         |
| Benchmarks       | Preuves par modèle (FAIT / BENCHMARK / MASSAMBA / INFÉRENCE), fusion, contradictions, import de benchmarks publics (.json)                                                                                                                                                                             |
| Agents × modèles | Meilleur modèle + secours + skills + MCP + outils + QA pour 10 types de travail                                                                                                                                                                                                                        |
| GitHub Discovery | Découverte (16 requêtes types ou libre), registre avec colonnes Ressource / Type / Capacité / GitHub / Version / Licence / Sécurité / Qualité / Coût / Maintenance / Compatibilité / Statut. Actions : revue, approbation, installation, activation, désactivation, mise à jour, rollback, comparaison |
| Skills           | Registre et test de sélection sur une mission                                                                                                                                                                                                                                                          |
| MCP              | Catalogue avec dépôt, auteur, licence, version, dernière mise à jour, capacités, permissions, secrets, coût, scores, compatibilité, statut                                                                                                                                                             |
| Gratuit d'abord  | Options par capacité, dans l'ordre natif → intégré → open source → API gratuite → MCP → skill → payant                                                                                                                                                                                                 |
| Cost Optimizer   | Coût / réussite, coût / point QA, qualité / $, tokens / réussite, temps / réussite, par modèle, agent, type ou palier ; économie estimée                                                                                                                                                               |
| Routing Log      | Décisions passées avec leur explication                                                                                                                                                                                                                                                                |
| Télémétrie       | Par mission : type, modèle, agent, skills, MCP, outils, tokens, coût, latence, itérations, replis, QA, escalades, correction humaine, résultat. Export CSV                                                                                                                                             |
| Sécurité         | Règles actives et scores du relevé GitHub                                                                                                                                                                                                                                                              |
| Documentation    | Ce fonctionnement, intégré à l'application                                                                                                                                                                                                                                                             |

## 4. Règles de sécurité appliquées

- **Pas d'installation automatique.** Une ressource GitHub n'est jamais installée parce qu'elle existe. L'approbation exige une revue de sécurité :
  - score inférieur à 60 : refus ;
  - de 60 à 74 : confirmation explicite ;
  - signal suspect : refus quel que soit le score.
- **Les étoiles comptent peu.** Elles apportent au plus +6 points. Une revue sur métadonnées seules est plafonnée à 85 ; un dépôt archivé à 35, abandonné à 45, suspect à 25.
- **Signaux examinés** :
  - réputation (organisation, contributeurs), activité, release, licence, issues, fork ;
  - scripts `preinstall` / `install` / `postinstall`, notamment ceux qui téléchargent puis exécutent du code ;
  - dépendances abandonnées, nombre de dépendances ;
  - binaires versionnés, JavaScript minifié hors build, Dockerfile ;
  - permissions déclarées (shell, fichiers, navigateur, réseau, identifiants, base de données), secrets requis, télémétrie ;
  - avis de sécurité GitHub (`/advisories`) ;
  - typosquatting (nom proche d'une organisation connue), popularité anormale, vocabulaire malveillant ;
  - injection de prompt dans le README ou le SKILL.md (consignes de dissimulation, exfiltration de secrets, `curl | sh`, Unicode invisible, `eval` obfusqué).
- **Ce que l'édition directe peut installer.** Uniquement :
  - un skill texte (SKILL.md), après le contrôle anti-injection, désactivé jusqu'à activation ;
  - un MCP HTTP, ajouté désactivé, avec accord demandé à chaque appel.

  Aucun code téléchargé n'est exécuté. Un MCP local (stdio) est refusé dans le navigateur : il relève de l'édition serveur, après approbation.

- **Secrets.** Le jeton GitHub, optionnel, reste en mémoire et n'est jamais enregistré. Les clés ne sont jamais transmises à un MCP. Les confirmations des commandes destructrices et les protections des fichiers sensibles sont inchangées.

## 5. Rapport final

### Architecture modifiée

- 8 modules purs ajoutés dans `server/engine/`, plus un relevé GitHub daté.
- Intégration dans la boucle d'agent des deux éditions.
- Vue Intelligence, carte de décision, carte « Python hors-ligne ».
- Exécuteur de code qui lit les fichiers binaires.

### Fonctionnalités ajoutées

Routage fondé sur les preuves, fusion de benchmarks, cascade, Skill Registry, MCP Registry, GitHub Discovery et registre de sécurité, Cost Optimizer, télémétrie, journal de routage, explicabilité, documentation intégrée.

Côté édition directe :

- **Python hors-ligne** : Pyodide 0.27.7 avec numpy, pandas, openpyxl, xlrd, pypdf, empreintes SHA-256 vérifiées.
- **Fichiers binaires** accessibles depuis `node` et `code.run`.
- **Commande `doctor`.**

### Agents améliorés

- **Équipement par mission.** Chaque mission de premier niveau reçoit un équipement dynamique : agent, équipe, skills compatibles, MCP utiles, outils autorisés, modèle recommandé, secours, stratégie QA.
- **Co-conception.** Elle couvre 10 types de travail : code, recherche, données, navigateur, documents, raisonnement, long contexte, agentique, gros volume, critique.

### Modèles intégrés

- **Catalogue** : celui d'OpenRouter, lu en direct, sans liste figée.
- **Mesures** : 159 modèles ont des indices Artificial Analysis (relevé du 04/10/2026, actualisable).
- **Exécution réelle** : 15 modèles éligibles au palier CHEAP pour une tâche de données ; GPT-6 Luna retenu.

### Skills découverts

- 18 skills natifs décrits (nom, description, capacités, déclencheurs, outils requis, modèles recommandés et incompatibles, coût, sécurité, source, version, licence).
- Sur GitHub : `anthropics/skills`, score 71 (REVUE REQUISE) parce qu'aucune licence n'est déclarée au niveau du dépôt.

### MCP découverts

- 25 serveurs au catalogue, dont 22 avec dépôt GitHub. 23 dépôts ont été relevés en tout, `anthropics/skills` compris.
- Hébergés sans dépôt auditable : DeepWiki, Jina, Microsoft Learn (score déclaratif 70).

### APIs découvertes

- **Nouvelles** : GitHub REST (recherche, dépôts, contributeurs, releases, arborescence) et GitHub Advisories.
- **Déjà intégrées et classées par l'ordre « gratuit d'abord »** : Frankfurter, Banque mondiale, Open-Meteo, Wikipédia, Crossref, OpenStreetMap, CoinGecko, Kroki, Pollinations, r.jina.ai.

### Ressources GitHub rejetées

| Dépôt                                   | Score | Raison                                                                                                                                                  |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GongRzhe/Office-Word-MCP-Server         | 35    | Dépôt archivé (plus de correctifs) ; il figurait dans les préréglages serveur, désormais marqués d'un avertissement                                     |
| GongRzhe/Office-PowerPoint-MCP-Server   | 35    | Dépôt archivé                                                                                                                                           |
| Cas malveillant de test (`microsfot/…`) | ≤ 25  | Typosquatting, `postinstall` qui fait `curl … \| sh`, injection de prompt, binaire `.exe`. Exemple synthétique utilisé par les tests, pas un vrai dépôt |

### Revue requise (non approuvées)

| Dépôt                    | Score | Raison                                     |
| ------------------------ | ----- | ------------------------------------------ |
| negokaz/excel-mcp-server | 64    | Aucun commit depuis 15 mois                |
| chroma-core/chroma-mcp   | 70    | Aucun commit depuis 13 mois                |
| anthropics/skills        | 71    | Aucune licence déclarée au niveau du dépôt |

### Ressources approuvables (score sur métadonnées, plafonné à 85)

- **85** : haris-musa/excel-mcp-server, microsoft/markitdown, upstash/context7, github/github-mcp-server, tavily-ai/tavily-mcp, brave/brave-search-mcp-server, microsoft/playwright-mcp, exa-labs/exa-mcp-server, makenotion/notion-mcp-server, antvis/mcp-server-chart, mongodb-js/mongodb-mcp-server, motherduckdb/mcp-server-motherduck, firecrawl/firecrawl-mcp-server, ahujasid/ableton-mcp, ahujasid/mcp-for-blender, supabase/mcp.
- **82** : modelcontextprotocol/servers (licence NOASSERTION), idosal/git-mcp.

Un scan profond dans l'application (manifeste, arborescence, README, avis de sécurité) peut faire monter ou baisser ces scores.

### Ressources installées

Aucune automatiquement, par règle. L'installation est une action de l'utilisateur, après approbation. Le pack Python s'installe par import manuel.

### Ressources non installées, et pourquoi

- Les MCP locaux (stdio) exigent l'édition serveur et une approbation.
- Les dépôts en revue requise attendent une confirmation explicite.
- Les dépôts rejetés sont archivés ou suspects.

### Économies estimées

- Exécution réelle d'une analyse de données : GPT-6 Luna pour 0,0006 $, avec un total exact vérifié deux fois.
- Les mêmes tokens au prix de Claude Opus 5.5 auraient coûté environ 0,13 $, soit environ 200 fois plus.
- C'est une estimation : le calcul ne tient pas compte des tours que le premium aurait pu éviter.

### Tests effectués

- **Tests unitaires et d'intégration (vitest)** : 196, dont 29 pour le moteur. Ils couvrent les cas A à N et 9 types de mission : simple, complexe, code, données, recherche, navigateur, document, vision, critique.
- **Tests e2e (Playwright)** : 29 sur les deux éditions. Ils incluent :
  - la carte de routage expliquée ;
  - l'escalade réelle de modèle après un QA en échec ;
  - le cycle GitHub complet (découverte, revue, approbation, installation, activation, rollback) ;
  - le rejet du dépôt malveillant et le repli hors-ligne ;
  - Python hors-ligne avec CDN bloqué (`pandas.read_excel`, lecture PDF) et la lecture de fichiers binaires depuis `node`.
- **Exécutions réelles OpenRouter** : catalogue réel, décision, mission sur données, télémétrie.

| Cas spécial                       | Test                                           |
| --------------------------------- | ---------------------------------------------- |
| A — modèle indisponible           | modèle exclu, secours utilisé                  |
| B, C — API / GitHub indisponibles | repli sur le relevé daté, scan en échec propre |
| D — MCP indisponible              | outils natifs                                  |
| E — skill incompatible            | refusé avec la raison (vision, outils)         |
| F — budget insuffisant            | signalé, modèle le moins cher retenu           |
| G — modèle trop cher              | exclu par le plafond, palier inférieur retenu  |
| H — benchmark absent              | repli par paliers / modèle par défaut          |
| I — benchmarks contradictoires    | signalé, confiance réduite                     |
| J — sécurité insuffisante         | approbation refusée ou soumise à confirmation  |
| K — dépôt abandonné               | rejeté ou risque élevé                         |
| L — dépôt suspect                 | rejet automatique                              |
| M — repli nécessaire              | chaîne de secours                              |
| N — escalade nécessaire           | escalade, puis arrêt avant gaspillage          |

### Régressions détectées et corrigées

- Pyodide créait `/uploads` à la racine au lieu de l'espace de travail (ENOENT) : les fichiers sont maintenant montés dans `/workspace`.
- Un plafond de prix qui excluait tout un palier ne donnait aucun choix : le moteur descend maintenant au palier qui respecte le plafond.
- La co-conception proposait des MCP archivés : ils sont maintenant filtrés.
- Le skill de code ne se déclenchait pas pour « application / architecture » : les déclencheurs sont ajoutés.

Aucune régression sur les tests existants.

### Limites

- Les scores de sécurité sont des indicateurs, pas un audit de code.
- Les probabilités de réussite et la latence restent des estimations tant que vos missions ne les ont pas mesurées.
- Sans jeton, l'API GitHub est limitée à 60 requêtes par heure (10 par minute pour la recherche).
- Le pack Python (16 Mo) s'importe une fois par navigateur.
- L'édition serveur reçoit la décision expliquée, les skills et la cascade, mais pas encore la vue Intelligence.

### Risques restants

- Un dépôt peut changer après son approbation : relancez la revue avant une mise à jour (bouton « Mise à jour ? »).
- Les benchmarks publics importés sont aussi fiables que leur source.

### Verdict final

**PASSED** pour l'édition directe, c'est-à-dire le Workbench joint. **PARTIAL** pour l'édition serveur, à qui il manque la vue Intelligence.
