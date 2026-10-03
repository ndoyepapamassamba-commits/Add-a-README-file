# Passation : TypeSafe dans les exports Credit Risk de PNDOYE

À lire en début de nouvelle session, avec `CLAUDE.md` qui contient les consignes permanentes.

## Déjà fait (branche `claude/upbeat-wozniak-q8ux3c`)
- `typesafe-reporting/` : démonstration d'un pré-Comité des Risques.
  - `pre_comite.py` : règles en code, 8 questions TypeSafe par dossier, score d'alerte, revue analyste, rapport HTML.
  - `blender_3d.py` : vue 3D du portefeuille avec Blender (`pip install bpy`, Python 3.11).
- `CLAUDE.md` : TypeSafe obligatoire dans toutes les productions.
- Liste des ajouts Excel proposés :
  - **TypeSafe** : (A) signaux IA, (B) confiance visible, (C) carte « Lecture IA » à phrases choisies, (D) heatmap motif × segment, (E) contrôle qualité, (F) colonne de décision du Comité, (G) méthodologie et audit.
  - **Visuels** : (H) sparklines, (I) fiches dossier, (J) rendu 3D Blender en couverture, (K) navigation.
  - **Priorité recommandée** : A, B, C, F, G.

## Fichier analysé
`PDO_CONSOLIDE_Impayes_30-90j_plan_actions_2026-09-29.xlsb`, export de l'app « Impayés 30-90j / Plan d'actions » (Credit Risk OS APEX). Il n'est pas versionné car il contient des données clients réelles : il faut le rejoindre à la nouvelle session.
- 15 feuilles, graphiques natifs et 25 segments.
- « Plan d'actions » : 208 lignes. « Plan débiteurs » : 357 lignes.
- Diagnostic et Plan d'action sont rédigés par l'app, donc inutiles pour TypeSafe.
- **Commentaire du gestionnaire est vide (0 %)** et Statut du suivi vaut 100 % « À faire ».

## Plan d'intégration convenu
1. **Retour gestionnaires** : TypeSafe lit les commentaires saisis.
   - Motif (Choice), promesse datée (Noul), crédibilité de la promesse (Score), incohérence avec les chiffres, statut du suivi proposé.
   - Le code compare la date promise à la Date de bascule.
   - Un dossier où la confiance est faible part en revue analyste.
2. **Jugements sur les noms de clients** : entité publique ou parapublique, intra-groupe Ecobank, segment douteux.
3. **Nouvelles feuilles** : Retours gestionnaires, Promesses vs bascules, Contrôle qualité, Méthodologie TypeSafe, et `_TYPESAFE` (réponses brutes, cachée).
4. **Défauts visuels à corriger** :
   - étiquettes de l'anneau qui se chevauchent (masquer sous 4 %) ;
   - titres de graphiques tronqués ;
   - graphique « par classe » trop étroit ;
   - dernier graphique coupé à droite ;
   - en-têtes de colonnes coupés.

## En attente de PNDOYE
- Le **code source de l'app** (`.html` ou `app.js`).
- La **validation Conformité** pour envoyer des données réelles. D'ici là, la démonstration se fait sur une copie anonymisée avec des commentaires fictifs.
- Faut-il préparer la mise à jour du skill `ecobank-god-export-studio` (section « Couche TypeSafe ») ?
