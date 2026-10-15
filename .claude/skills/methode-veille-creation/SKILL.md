---
name: methode-veille-creation
description: >
  APPLICATION STRICTE, SANS EXCEPTION. PREMIER SKILL À APPELER, TOUJOURS, à chaque demande et avant tout autre skill
  (y compris les skills de processus, brainstorming, débogage, xlsx, docx, pptx, documents premium). PRIORITAIRE ET
  PERMANENT pour toute demande de PNDOYE : veille (design d'abord, puis analytique, puis le reste) → approfondir →
  améliorer (créer, ne pas copier) → intégrer en réussissant l'intégration → rendre compte brièvement. À appeler en
  premier, y compris pour une petite demande ou une question.
---

# Méthode permanente : veille → amélioration → intégration

Règle fixée par l'utilisateur (15/10/2026), valable **dans toutes les discussions** :

> « Quand je demande quelque chose, automatiquement : faire une veille, approfondir, prendre le résultat de cette veille, l'améliorer — pas chercher à l'intégrer et échouer — l'améliorer et l'intégrer dans la requête. Toujours insister sur la veille design d'abord, la veille analytique, et puis le reste. »
> « Je veux que toi et moi créions des styles d'export qui n'existent nulle part. »

**Ce skill est le premier appelé, à chaque demande, avant tout autre skill** (exigence de l'utilisateur : « ça doit être le premier skill à appeler tout le temps »). Les autres skills (processus, Excel, Word, PowerPoint, documents premium Ecobank…) viennent ensuite comme outils.

Elle ne remplace pas la demande : elle dit **comment** la traiter. Le livrable demandé reste l'objectif.

## Application stricte (exigence de l'utilisateur)

Aucune exception, aucune étape sautée, même pour une petite demande, une correction ou une question. Avant d'envoyer une réponse, cocher la liste :

- [ ] skill appelé **en premier**, avant tout autre ;
- [ ] **veille design** faite (au minimum quelques recherches ciblées sur le point demandé, ou reprise datée de la dernière veille si elle couvre exactement le point) ;
- [ ] **veille analytique** faite quand la demande touche une analyse, un chiffre, un texte réglementaire ou une recommandation ;
- [ ] **reste** (technique, outils) vérifié ;
- [ ] résultats **améliorés** — au moins une idée qui va au-delà des références, avec son critère d'acceptation ;
- [ ] améliorations **intégrées dans le livrable** et **contrôlées** (validateurs, recalcul, comparaison du contenu, rendu relu) ;
- [ ] **registre** `references/registre_innovations.md` mis à jour ;
- [ ] réponse avec la trace courte : *Veille design · Veille analytique · Améliorations · Intégré et vérifié*.

Si une case ne peut pas être cochée (pas d'accès réseau, outil indisponible), le dire explicitement dans la réponse, avec ce qui a été fait à la place.

## Le cycle, à chaque demande

### 1. Veille — toujours, dans cet ordre de priorité

| Ordre | Veille | Ce qu'on cherche |
|---|---|---|
| 1 | **Design** | état de l'art 2025-2026, références d'excellence (rapports primés, design systems publics, presse de données, cabinets, banques), règles mesurables (typographie, grilles, couleur OKLCH, contrastes WCAG, densité), techniques réalisables dans le format visé (OOXML, HTML e-mail Outlook, canvas…), pièges |
| 2 | **Analytique** | méthodes d'analyse, cadres réglementaires (BCEAO / UMOA / OHADA, IFRS 9, Bâle, EBA), pratiques de place, indicateurs, façons de rédiger constat → analyse → recommandation |
| 3 | **Le reste** | outils, bibliothèques, compatibilité, performances |

Proportionner, ne jamais sauter :
- **petite demande** (un réglage, un bouton, une correction) : veille ciblée de quelques recherches sur le point précis, dans le même tour ;
- **demande de fond** (nouvel export, nouvelle analyse, refonte) : veille approfondie multi-sources (skill `deep-research` si disponible, chercheurs en parallèle), notes rangées dans `research_notes/<titre>/`, rapport dans `reports/` ;
- **toujours repartir de la dernière veille** (voir `references/registre_innovations.md`) : on complète, on ne refait pas de zéro.

### 2. Approfondir

Sources primaires d'abord (normes, documentation officielle, études), chiffres et seuils exacts, contradictions entre sources relevées et arbitrées. Chaque fait garde sa source.

### 3. Améliorer — créer, ne pas copier

Pour chaque résultat retenu, se demander :
- **Que ferait mieux une cellule risque qui produit le même message en Excel, Word, PowerPoint et mail chaque mois ?** (cohérence entre formats, preuve, traçabilité : terrains que les références n'occupent pas) ;
- **Quelle combinaison inédite** de deux idées venues de domaines différents (presse de données × réglementaire, design system × OOXML…) ?
- **Quel critère d'acceptation testable** prouvera que c'est mieux ?

Viser « 100 % mieux » que la référence : une idée reprise telle quelle n'est pas une innovation. Noter chaque innovation dans le registre (idée, appui sourcé, critère, statut).

### 4. Intégrer — et réussir l'intégration

- Intégrer les améliorations **dans la réponse à la demande**, pas dans un document à part.
- **Pas d'intégration qui échoue** : chaque ajout passe les contrôles avant livraison (validateur Office, recalcul des formules sans erreur, comparaison du contenu avec l'original, rendu visuel relu, `node --check`, captures). Si une idée ne passe pas, l'adapter jusqu'à ce qu'elle passe ; sinon la retirer et le dire.
- Une amélioration de design **ne modifie pas le contenu** quand l'utilisateur a demandé « le même contenu, nouveau design » : chiffres, textes, tableaux et règles d'origine restent identiques (le prouver par comparaison).

### 5. Rendre compte, brièvement

Dans la réponse : ce que la veille a appris (2-3 lignes), ce qui a été **amélioré et intégré** (avec la preuve du contrôle), ce qui reste en idée. Le rapport complet de veille est envoyé en fichier quand il y en a un.

## Garde-fous permanents (rappel)

- **Jamais de donnée client dans une requête web** : aucun nom, code client ou montant individuel ; la veille porte sur les concepts, textes et outils.
- **Ne rien pousser** sur le dépôt public `Add-a-README-file` ; aucune clé d'API dans un fichier HTML ; aucun identifiant de modèle dans les commits.
- **Ne jamais inventer de chiffres** : tout chiffre vient des données chargées ou d'une source citée.
- Français, formats fr-FR, charte Ecobank (voir les skills `ecobank-documents-premium`, `ecobank-god-export-studio`, `ecobank-credit-risk-engine`).
