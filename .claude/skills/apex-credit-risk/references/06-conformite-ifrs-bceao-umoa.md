# 06 — Conformité IFRS 7 / IFRS 9 / BCEAO Instruction 026 / UMOA

Source : APEX `CF_REF` (référentiel de contrôles), `cfScore`, grille de classification. Chaque contrôle est évalué sur les lignes du fichier chargé ; un contrôle sans donnée est « non évaluable », jamais « conforme ».

## 1. Grille de classification (référentiel commun)

| Classe | Libellé | FRR | Jours d'impayé | Stage IFRS 9 |
|---|---|---|---|---|
| I | Normal | 1 à 6 | 0 | S1 |
| IA | Sur surveillance | 7 | 1 à 30 | S1 |
| II | Watch-list | 8 | 31 à 90 | S2 |
| III | Substandard | 9 | 91 à 180 | S3 |
| IV | Douteuse | 10 | 181 à 360 | S3 |
| V | Perte | 10 | > 360 | S3 |

`IIN` (douteux « nouveau » / Impaired New) est traité comme S3. Correspondance classe → stage (§ 5.5.3) : I, IA → S1 ; II → S2 ; IIN, III, IV, V → S3.

## 2. Référentiel des règles (`CF_REF`)

| Code | Texte | Règle contrôlée | Test sur les lignes |
|---|---|---|---|
| IFRS7-35H | IFRS 7 §35H | Rapprochement des provisions d'ouverture à clôture par stage | pont ECL N‑1 → N disponible et équilibré |
| IFRS7-35I | IFRS 7 §35I | Explication des variations d'exposition par stage | migrations S1/S2/S3 documentées |
| IFRS9-5.5.11 | IFRS 9 §5.5.11 | Présomption réfutable : > 30 j d'impayé ⇒ hausse significative du risque (S2) | ligne dj > 30 avec stage 1 ⇒ **écart** |
| IFRS9-B5.5.37 | IFRS 9 §B5.5.37 | Présomption : > 90 j ⇒ défaut (S3) | ligne dj > 90 avec stage ≠ 3 ⇒ **écart** |
| IFRS9-5.5.3 | IFRS 9 §5.5.3 | Cohérence classe / stage (grille § 1) | classe III/IV/V/IIN avec stage ≠ 3 ; classe II avec stage 1 ⇒ écart |
| IFRS9-5.5.7 | IFRS 9 §5.5.7 | Retour en S1 (cure) seulement après disparition du SICR | stage 1 avec dj > 0 le mois précédent sans période probatoire ⇒ à justifier |
| BCEAO-026-CL | Instr. 026 — classement | Douteux dès 90 j (180 j pour les natures longues), contagion art. 11 | ligne dj > seuil non classée douteuse ; client avec une ligne douteuse et d'autres saines ⇒ écart |
| BCEAO-026-PROV | Instr. 026 art. 16 | Provision selon ancienneté et couverture (fiche 04 § 2) | provision locale < requise ⇒ complément |
| BCEAO-026-FRR | Grille FRR | FRR cohérent avec les jours : ORR/≤6 (0 j), 7 (1‑30), 8 (31‑90), 9 (91‑180), 10 (> 180) | FRR incohérent ⇒ écart |
| EXCL | Périmètre | Exclusions symétriques (OA, CC, CKU, LCU, segment 8110 ; titres LGMO/LTB hors champ) appliquées au numérateur **et** au dénominateur | ratio recalculé avec et sans exclusions |
| UMOA-SOLV | Dispositif prudentiel UMOA | Solvabilité ≥ **11,5 %** (fonds propres effectifs / RWA) | FPE et RWA connus ⇒ calcul, sinon « non évaluable » |
| UMOA-DIV | Division des risques | Un même bénéficiaire ≤ **25 %** des fonds propres effectifs ; déclaration des grands risques ≥ 10 % | expositions clients / FPE |

## 3. Statut d'un contrôle

```
écarts  = lignes en contradiction avec la règle
enc     = encours des lignes en écart ; tot = encours du périmètre ; imp = impayés des lignes en écart
statut  = « non conforme » si enc / tot > 1 % ou imp > 0,1 % × tot
        = « à corriger » si écarts > 0 et sous ces seuils
        = « conforme » si écarts = 0
        = « non évaluable » si la donnée manque (colonne absente, FPE inconnus)
```

Score de conformité : `score = 100 × (1 − bad / max)` où `bad` = nombre de contrôles non conformes pondérés (non conforme 1, à corriger 0,5) et `max` = nombre de contrôles évaluables. Un score n'est jamais affiché quand `max = 0`.

## 4. Présentation attendue (requête « conformité », « audit », « IFRS 9 », « BCEAO »)

1. Score global et nombre de contrôles conforme / à corriger / non conforme / non évaluable.
2. Tableau des contrôles : code, texte, règle, écarts (nombre, encours, impayés), statut, **exemples de lignes** (client, compte, dj, classe, stage).
3. Pour chaque écart matériel : cause probable (donnée, règle non appliquée, retard de traitement) et correction proposée (reclassement, provision, justification de cure).
4. Rapprochement des trois lectures (IFRS 9 / BCEAO / PCB, fiche 04 § 6).
5. Rappels de texte uniquement sous forme de citations courtes du référentiel ci-dessus ; ne jamais inventer un article ou un seuil.

## 5. Limites à annoncer
- Les seuils 11,5 % et 25 % sont les seuils de référence du dispositif prudentiel UMOA tels que paramétrés dans APEX ; vérifier la version en vigueur avant un usage réglementaire.
- La conformité IFRS 7 (informations à fournir) se juge sur les états produits, pas seulement sur les lignes : signaler ce qui manque dans le fichier.
