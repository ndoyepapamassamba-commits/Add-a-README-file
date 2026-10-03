# Consignes permanentes de PNDOYE

## TypeSafe dans tout ce qui est produit
- Chaque application, reporting ou export construit pour PNDOYE intègre une couche **TypeSafe** (modèle `jev-latest`, `POST https://api.typesafe.ai/v1/systemone`). Charger le skill `typesafe:typesafe-ai` et lire la documentation en ligne avant d'écrire l'intégration.
- Le code garde les règles, les calculs et les classements réglementaires (BCEAO, IFRS9, ACTE7). TypeSafe ne fait que des jugements sémantiques sur le texte et le contexte : motif, signal, cohérence, priorité, choix d'une phrase de lecture.
- Ne jamais demander à TypeSafe de produire un montant ou un ratio. Les chiffres viennent toujours du code.
- Toujours conserver les réponses brutes : probabilités, confiance, modèle et date. Elles servent à la piste d'audit et permettent de réappliquer d'autres seuils sans nouvel appel.
- Si la confiance est faible, le dossier part en revue analyste au lieu de recevoir une décision automatique.

## Apps HTML offline (charte « GOD 3D » BLUE ECOBANK)
- Les postes bancaires n'ont pas Internet et la clé API ne doit jamais être écrite dans un fichier HTML.
- TypeSafe passe donc par une étape d'enrichissement sur un poste connecté, ou par un relais serveur. L'app lit les résultats (feuille `_TYPESAFE`) quand ils existent et fonctionne sans eux sinon.
- Chaque export (Excel, PowerPoint, Word, mail) affiche la couche TypeSafe : signaux, confiance, dossiers à revoir et méthodologie.
- Les données clients réelles ne partent vers l'API qu'après validation de la Conformité. Sinon, les envoyer anonymisées.

## Moteur Credit Risk Intelligence (exports Excel premium natifs, APEX 36)
- Bouton **Risk Intelligence** : 7 exports issus d'une **source analytique canonique unique** (`riModel`) : Complet, Executive (Comité), Risk, Watchlist, Action plan, Audit, Data.
- Identité **ECOBANK BLUE PREMIUM** (`#003DA5`, Deep `#001B4D`, Bright `#2563EB`, Cyan `#06B6D4`, Gold `#C8A951` ; succès / vigilance / alerte / critique `#16A34A` `#F59E0B` `#F97316` `#DC2626`). Chaque couleur a un sens : bleu = structure, cyan = mouvement, or = stratégique, vert = amélioration, orange = vigilance, rouge = criticité.
- Classeur généré nativement par `rxBook` (Open XML écrit à la main) : graphiques natifs, sparklines, mises en forme conditionnelles, navigation, impression A4/A3. Aucune image, fichier léger. Il est marqué `APEX-RI` : `pmXlsx` le reconnaît comme déjà premium et le laisse intact. Il passe quand même par `pmFinish`.
- Contrôles automatiques à chaque génération, restitués dans la feuille AUDIT : rapprochement avec les agrégats APEX, pont des impayés bouclé, tranches, doublons, NaN, base IFRS 9 des provisions historiques.
