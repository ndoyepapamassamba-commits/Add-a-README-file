---
name: docx-editorial
description: Document Word éditorial (MASSAMBA) — mémo, rapport d'analyse, page de garde, sommaire automatique, tableaux, pagination, en-tête/pied, signature, export PDF fidèle. Se déclenche avec "word", "docx", "mémo", "note", "lettre", "rapport word", "page de garde", "sommaire".
category: Office
triggers:
  - word
  - docx
  - mémo
  - memo
  - note de synthèse
  - lettre
  - courrier
  - rapport word
  - page de garde
  - sommaire
  - pagination
  - signature
  - pdf du rapport
---
# Documents éditoriaux Word / PDF — méthode MASSAMBA

## Structure d'un rapport ou d'un mémo
- **Page de garde** (titre, sous-titre, date, auteur/entité, logo), **sommaire automatique** construit sur les styles de titre (Titre 1 / Titre 2), **en-tête et pied de page** avec numéro de page « n / N » (première page sans en-tête), note de méthode, signature en fin de document.
- Conclusion d'abord (résumé exécutif ≤ 10 lignes), puis constats, puis recommandations ; un titre par idée ; paragraphes courts (≤ 6 lignes).

## Mise en forme
- Styles réels (pas de gras manuel pour un titre), listes à puces réelles (jamais « • » tapé), tableaux à largeurs fixes qui tiennent dans la page, images ajustées à la largeur du texte avec légende, pas de saut de ligne pour espacer.
- Chiffres : séparateur de milliers, unité et période, source sous chaque tableau ; **aucune donnée inventée**.
- Thème choisi (galerie de designs, logo importé) : couleurs des titres et des tableaux cohérentes avec les autres livrables.

## Export PDF fidèle
- Le PDF reproduit le document (polices, pagination, sommaire) : HTML imprimable de l'app ou conversion en conteneur ; vérifier page par page (rendu image) : rien de coupé, sommaire à jour, numéros de page présents.

## Dans l'app
- `report.export` (docx premium : page de garde, sommaire, en-tête/pied, KPI, graphiques, thème) ; `report.export` html imprimable → PDF ; vérification `m365-verification` en conteneur (0 erreur Open XML, aperçus lus).
