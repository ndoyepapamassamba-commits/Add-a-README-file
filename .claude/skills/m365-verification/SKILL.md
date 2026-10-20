---
name: m365-verification
description: Vérifie les livrables Office (Excel .xlsx, Word .docx, PowerPoint .pptx) comme s'ils étaient ouverts dans Microsoft 365, avant toute livraison — validation par le SDK Open XML officiel de Microsoft, contrôle sémantique Excel (styles, formules, plages), rendu page par page pour inspection visuelle. À utiliser dès qu'un export Excel/Word/PowerPoint est produit, modifié ou livré par l'app MASSAMBA Workbench (data.export, report.export, tableau de bord vivant, modèles du catalogue), quand l'utilisateur signale « le fichier ne s'ouvre pas / Excel répare le fichier / anomalie d'affichage », ou quand il demande de « tester comme dans Microsoft 365 ».
---

# Vérification « Microsoft 365 » des livrables Office

Il n'y a pas de Microsoft 365 dans le conteneur ; on reproduit ce qu'il fait au plus près :

| Ce que fait Microsoft 365 | Ce que fait cette compétence |
|---|---|
| Ouvre le fichier et refuse / « répare » s'il viole le schéma OOXML | **SDK Open XML de Microsoft** (`DocumentFormat.OpenXml` 3.1, règles Office 2016+) : 0 erreur exigée |
| Calcule les formules, applique styles et formats | **Contrôle sémantique Excel** : index de styles, `count` cohérents, formules interdites (`N(+plage)` dans SUMPRODUCT), plages et liens internes valides |
| Affiche les feuilles / pages / diapositives | **Rendu visuel** LibreOffice → PDF → PNG, une image par feuille (ajustée à la page) ou par page / diapositive, à regarder (vision) |

## Procédure (à suivre à chaque livraison)
1. Générer le livrable (scratchpad, jamais de données client réelles dans le dépôt).
2. Lancer : `bash .claude/skills/m365-verification/scripts/verify.sh <fichiers…>`
   - premier lancement : installe .NET 8 et compile le validateur (≈ 2 min), ensuite quelques secondes ;
   - sorties dans `$M365_OUT` (défaut `/tmp/m365-verif`).
3. **Critères de réussite** : `0 error(s)` Open XML pour chaque fichier ; aucune ligne d'erreur sémantique ; aperçus lus un par un (pas de `#####`, pas de texte coupé, contrastes lisibles, graphiques présents, logo bien placé).
4. Corriger, relancer, puis seulement livrer — en disant ce qui a été vérifié et comment.
5. Limite à annoncer honnêtement : le rendu LibreOffice est très proche d'Excel/Word/PowerPoint mais pas identique (polices, quelques effets) ; la vérification finale « pixel » reste l'ouverture dans Microsoft 365 par l'utilisateur.

## Dans l'app
- La passe `designQA` (server/services/designQA.ts) corrige automatiquement contrastes, largeurs, débordements avant livraison ; cette compétence vérifie le **résultat**.
- Tests e2e : les exports sont aussi contrôlés par `tests/e2e/*` ; en cas de doute sur un export, ajouter le fichier généré à la vérification ci-dessus.
