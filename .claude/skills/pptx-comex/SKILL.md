---
name: pptx-comex
description: Présentation PowerPoint pour un comité (MASSAMBA) — diapositives structurées, un message par diapo, graphiques natifs lisibles, narration exécutive, typographie cohérente, contrôle des débordements, QA contenu / fichier / visuel. Se déclenche avec "powerpoint", "pptx", "diapo", "slides", "présentation", "comex", "pitch", "deck".
category: Office
triggers:
  - powerpoint
  - pptx
  - diapo
  - diapositive
  - slides
  - présentation
  - presentation
  - comex
  - comité
  - comite
  - pitch
  - deck
  - support de réunion
---
# Présentations COMEX — méthode MASSAMBA

## Structure
- **Un message par diapositive** ; le titre EST le message (phrase complète, ≤ 12 mots), pas un sujet.
- Ordre exécutif : conclusion d'abord, puis preuves (chiffres, graphiques), puis décision demandée. Agenda, séparateurs de section, diapo KPI, notes orateur.
- ≤ 6 puces par diapo, ≤ 30 mots de corps ; pas de paragraphe ; un chiffre clé en grand avec son unité et sa période.

## Lisibilité et typographie
- Deux polices au plus (titres / corps), tailles ≥ 18 pt pour le corps, ≥ 28 pt pour les titres ; contraste AA.
- **Contrôle des débordements** : tout texte tient dans sa boîte (marges ≥ 0,5"), aucun élément hors de la diapo (canevas 16:9 = 10" × 5,625"), pas de chevauchement logo / titre.
- Palette du thème choisi (galerie de designs, logo importé) ; pas de couleur hors palette.

## Graphiques
- **Graphiques natifs** (DrawingML) : titre, étiquettes de valeurs, axe des ordonnées à zéro, légende seulement si plusieurs séries, palette du thème ; un graphique par diapo ; pas d'image de graphique quand le natif existe.

## QA obligatoire avant livraison
1. **Contenu** : chaque chiffre vient du brief/des données (aucune invention) ; orthographe ; cohérence des unités.
2. **Fichier** : s'ouvre sans réparation (vérification M365 / SDK Open XML dans le conteneur) ; relations et types de contenu valides.
3. **Visuel** : aperçu diapo par diapo (rendu), rien de coupé, rien qui déborde, logo bien placé, notes présentes.

## Dans l'app
- `report.export` (pptx premium : page de garde, agenda, KPI, graphiques natifs, séparateurs, notes, thème choisi, logo adaptatif) ; `designQA` ; vérification `m365-verification` en conteneur.
