# OMNIPOTENT V4.1 + JEV COGNITIVE OS (direct_19)

## Pourquoi
Constats : l'historique d'une session s'accumulait entre missions sans rapport (dérive), l'arbre de fichiers et le digest `.ai`
étaient réinjectés, la porte de livraison redemandait des vérifications même pour une question triviale, le budget de contexte
(70 % de la fenêtre, jusqu'à 400 k) et la sortie (16 k) servaient de cibles, et toutes les définitions d'outils partaient à chaque appel.

## Un seul agent : OMNIPOTENT
`direct/lib/omnipotent.ts` : micro-noyau (~600 tokens) envoyé à chaque appel ; la doctrine complète
(`docs/omnipotent/OMNIPOTENT_COGNITIVE_KERNEL_V4_1.md`) n'est jamais envoyée en entier. Les anciens agents restent des **rôles internes**
(`agent.delegate`) ; leurs identifiants sont des alias de l'agent par défaut (`findAgent`).

## Ce qui est appliqué (HARD) — par le runtime, avant que le modèle voie l'objet
| Mécanisme | Effet réel |
|---|---|
| Pare-feu d'historique | seuls les tours de la mission courante (ou un rappel explicite) sont envoyés ; `session.history` brut jamais supprimé |
| Gouverneur de mémoire | le digest projet est filtré par paragraphe selon la capsule de mission |
| Pare-feu d'outils | outils exposés = ceux de la voie ; `tools.request` reste disponible (disponible ≠ exposé) |
| Voie rapide | étapes max, passes de porte, ré-demandes (preuves, alertes shadow, QA) proportionnelles ; prompt minimal pour trivial/simple |
| Plafonds | contexte (6 k trivial … 50 k critique) et sortie (1,5 k … 16 k) : un plafond, jamais une cible |
| Garde anti-dérive de sortie | réponse hors mission ou « réparation » décrite sans écriture ni vérification → rejetée, ≤ 2 reprises avec paquet propre |

## POLICY (consigne dans le prompt, non vérifiable)
`<MISSION_LOCK>`, la doctrine du noyau, les règles « ne pas boucler », « une seule question » : le modèle peut les ignorer.
La trace `OMNIPOTENT — voie …` (chat) et `JEV_LOG.omni` étiquettent chaque garde-fou HARD / POLICY / OFF.

## Non-régression
Interrupteur maître OMNIPOTENT (réglages, onglet JEV Cognitive OS) : OFF = comportement V18. JEV, Apprentice, Champion Science, Fabric,
Studio inchangés. Le Cognitive OS a son propre interrupteur (OFF par défaut ; modes off / shadow / active par moteur).

## JEV Cognitive OS (onglet)
17 sous-onglets : vue d'ensemble (+ carte d'architecture), diagnostic, protocoles, tokens, capsule, conditionnement, JCB, arrêt/ROI,
désaccord, empreintes, levier, auto-audit, stratégies, politique, cache, régression (PASS/FAIL/WARNING/INSUFFICIENT DATA),
super-benchmark (200 tâches, 5 bras). Tout chiffre vient du JEV_LOG réel ; un journal vide affiche NON MESURÉ.

## Limites honnêtes
- Aucune économie chiffrée n'est annoncée : elle se lit dans le journal (`zeroWaste`, `leverage`) après usage réel.
- Les estimations de tokens (caractères / 3,8) sont des estimations.
- Le détecteur de dérive est lexical : il rejette l'évident, pas le subtil.
- Le super-benchmark appelle de vrais modèles (coûts réels) ; il n'est lancé qu'à la demande.
