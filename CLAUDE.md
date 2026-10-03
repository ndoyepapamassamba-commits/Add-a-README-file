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
