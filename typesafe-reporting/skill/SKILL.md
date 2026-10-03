---
name: ecobank-god-export-studio
description: Style maison "GOD 3D" BLUE ECOBANK pour toute application HTML offline de PNDOYE (Ecobank Sénégal) qui charge un fichier Excel et produit un dashboard haut de gamme avec exports Excel, PowerPoint, Word et mail couleur Outlook à graphiques intégrés. À utiliser dès que l'utilisateur demande un dashboard, une app HTML, un reporting, un mail quotidien, un tableau "moche" à transformer, des exports "comme dans l'APEX / Credit Risk OS", ou mentionne Ecobank, BLUE ECOBANK, logo Ecobank, COMEX, Comité, pipe, FACTORY — même sans citer ce skill.
---

# Ecobank GOD 3D Export Studio

Référentiel visuel et technique des applications HTML offline d'Ecobank Sénégal, extrait de l'app « Credit Risk OS APEX » puis éprouvé sur « Deal Pipe Studio » (pipeline FACTORY). Toute nouvelle app doit en reprendre la charte, l'architecture et la chaîne d'exports, pour que le DG, le COMEX et les Comités retrouvent le même rendu partout.

## 1. Charte — tout tourne autour du logo

Le fond du logo officiel est exactement `#005C83` : c'est le bleu primaire. Le filet sous « Ecobank » donne le lime.

| Rôle | Hex |
|---|---|
| Marine (bandeaux, en-têtes de tables, titres) | `#00415E` |
| Bleu Ecobank (primaire) | `#005C83` |
| Bleu clair (actions, liens) | `#1A86B3` |
| Lime (filets, accents, succès) | `#8CC63F` / `#A6D867` |
| Vert foncé | `#6BA23A` / `#4E8A2E` |
| Texte / texte secondaire | `#12333F` / `#3E5C6B` |
| Fonds clairs / lignes | `#EEF4F7` `#E9F1F6` / `#CFE0E7` |
| Risque / vigilance | `#C0392B` / `#B67D1C` `#D4A13A` |

Règles : jamais de fond noir ni sombre dans les exports ; filet lime de 3 px sous chaque bandeau marine ; montants en XOF, entiers avec espace comme séparateur (`2 359 078 494`), dates jj/mm/aaaa ; police Segoe UI, chiffres en tabular-nums (Consolas dans les exports).

**Dégradé de workflow** : quand l'objet est un processus (pipeline, étapes, workflow), les étapes vont du marine `#00415E` (demande) au lime `#8CC63F` (aboutissement) via `#0A6F95` — fonction `stageColor(i,n)` dans l'exemple. Cette couleur d'étape est réutilisée partout : chevrons, pastilles de tableau, cellules Excel, cellules PowerPoint, lignes du mail.

**Logo** : `assets/kit/logo_ecobank_png.b64` (PNG 400 px). Dans l'UI : header de chaque vue. Dans les exports : le *badge 3D* `g3LogoBadge()` (plaque bleue en relief + logo + drapeau du Sénégal) sur chaque feuille Excel, chaque diapositive, la couverture Word. Ne jamais redemander le logo à l'utilisateur.

## 2. Architecture de l'app

- Un seul fichier `.html`, 100 % offline (postes bancaires sans Internet) : toutes les bibliothèques sont inlinées depuis `assets/vendor/` — xlsx-js-style 1.2 (lecture + écriture stylée), Chart.js 4.4 (graphiques interactifs de l'UI), JSZip 3.10 + PptxGenJS (docx/xlsx post-traités, pptx).
- Gabarit : `assets/template/shell.html` (topbar sticky, onglets, barre de filtres, écran de dépôt, tiroir de fiche, feuille modale, toast, overlay d'attente, CSS complet). Marqueurs `/*@@VXLSX@@*/ /*@@VCHART@@*/ /*@@VZIP@@*/ /*@@LOGO@@*/ /*@@KIT@@*/ /*@@APP@@*/`.
- Assemblage : `python scripts/build.py shell.html app.js sortie.html`, puis `node --check` sur le dernier `<script>`.
- Code métier dans `app.js` ; exemple complet et commenté : `references/exemple_deal_pipe_app.js` (lecture tolérante des en-têtes, normalisations, agrégats, vues, exports, mail). Le lire avant d'écrire une nouvelle app.
- Le kit (`assets/kit/*.js`) attend un objet global `KIT={org,unit,app,footer,docTitle,docSubject,keywords}` et une fonction `toast(msg)` définis par l'app.

## 3. Écran — principes

- **Un héros propre au sujet**, pas une rangée de KPI générique : bloc marine en dégradé `#00415E → #005C83` avec l'arc blanc du logo en filigrane, le chiffre clé en très grand, puis la visualisation signature (ex. chevrons du workflow cliquables).
- KPI en cartes blanches avec liseré gauche coloré ; cartes en relief (ombre `--sh`) ; tables à en-tête marine souligné de lime, zébrures `#F6FAFC`, lignes cliquables ouvrant une fiche en tiroir.
- Filtres globaux appliqués à toutes les vues *et* aux exports ; le périmètre filtré est rappelé dans chaque export.
- Une « lecture rédigée » (constats chiffrés en phrases) accompagne chaque synthèse et est reprise dans le mail, le Word et le PowerPoint.
- Mémoire locale (localStorage, try/catch) des chargements successifs pour calculer les mouvements d'un jour à l'autre.
- Lecture de fichier tolérante : recherche de la ligne d'en-tête dans les 25 premières lignes, correspondance d'en-têtes par expressions régulières sur texte sans accents, harmonisation des libellés saisis à la main (casse, accents, fautes de frappe du type « PP STPCK »).

## 4. Moteur de visuels 3D (exports)

`assets/kit/g3_xlsx_kit.js` — chaque fonction renvoie un PNG (dataURL) posé sur une carte en relief (ombre portée, biseau, liseré lime, reflet satiné) via `g3Out` :
`g3Bars` (barres 3D), `g3HBars` (classements), `g3Donut` (anneau 3D), `g3Lines` (courbes à aire dégradée), `g3Heat` (matrice), `g3Gauge` (jauge), `g3Card` (carte d'analyse Constats/Analyse/Recommandations), `g3LogoBadge` (badge logo + drapeau).
`assets/kit/pipeline_word_mail_ppt_kit.js` ajoute `g3Pipeline` (chevrons 3D + barres de volume par étape).
Passer `h:560` pour des visuels plus hauts destinés au PowerPoint.

## 5. Chaîne d'exports (même identité partout)

**Excel** — construire avec `XLSX` + styles `X3` (`title`, `sub`, `hdr`, `cell`, `pill`, `tile`), puis `xlsxAttach(base64, attach, {logo: await g3LogoBadge(), gradient:true})` qui ajoute : badge logo sur chaque feuille, visuels 3D ancrés (`{sheet, imgs:[{png,col,row,cols,rows}], cf:[...], dv:[...]}`), mises en forme conditionnelles natives (barres de données, feux tricolores), listes déroulantes de suivi, dégradés natifs sur les cellules, grille masquée, titre figé, onglets colorés, impression A4 paysage, pied de page « ECOBANK SÉNÉGAL · … · INTERNAL USE ONLY ». Première feuille = tableau de bord à tuiles colorées + visuels ; puis une feuille par angle d'analyse avec son graphique à droite.

**PowerPoint** — `LAYOUT_WIDE`. Couverture marine avec disques lime/bleu translucides et badge ; diapositives avec `pptBand` (bandeau marine, filet lime, badge en haut à droite, pied de page gris-bleu numéroté), `pptKpis` (tuiles à liseré), `pptTable` (en-tête marine, pastilles de couleur d'étape, ligne total vert clair) ; diapositive de clôture marine.

**Word** — `docxBuild(body, media, piedDePage)` : couverture en cellule marine avec badge, `dxKpis`, titres `Titre1` soulignés lime, `dxRich` pour les puces rédigées, `dxTableS` (pastilles de couleur), images `dxImg` à 15–16,5 cm.

**Mail couleur** — `mailShell` (680 px, tables, compatible Outlook) + `mKpis`, `mH`, `mP`, `mCallout`, `mImg` ; tableau récapitulatif avec la couleur de chaque statut en première colonne, ligne total vert clair, total général marine ; `white-space:nowrap` sur tous les montants. Trois sorties : `.eml` multipart/related (`emlBuild`, images en `cid:` → brouillon Outlook en couleur au double-clic), copie mise en forme (`copyRich`), `.html`. Aperçu dans une iframe `srcdoc`.

## 6. Contrôle qualité avant livraison

1. `node --check` du script applicatif.
2. Playwright/Chromium : charger un vrai fichier, capturer chaque onglet (et un viewport mobile 390 px), vérifier l'absence de `pageerror`, déclencher chaque export et récupérer les téléchargements.
3. Ouvrir le `.xlsx` avec openpyxl ; convertir xlsx/pptx/docx en PDF avec `soffice --headless` puis `pdftoppm` pour inspecter visuellement les pages.
4. Vérifier : attribut `[hidden]` bien respecté (`[hidden]{display:none!important}`), montants non coupés, libellés d'étape lisibles dans les pastilles, logo présent partout.

## 7. Couche TypeSafe (obligatoire)

Toute app, tout reporting et tout export intègre une couche **TypeSafe** (modèle `jev-latest`, `POST https://api.typesafe.ai/v1/systemone`).

**Partage des rôles**
- Le **code** garde tous les calculs réglementaires et chiffrés : classes BCEAO, stages IFRS9, moteur ACTE7, jours, dates de bascule, montants, dates lues dans les textes.
- **TypeSafe** ne rend que des jugements sur le texte et le contexte : motif (Choice), signal (Noul), crédibilité ou priorité (Score), cohérence, phrase de lecture choisie.
- TypeSafe ne produit **jamais** de montant ni de ratio.

**Offline**
- Les postes bancaires n'ont pas Internet. Aucune clé API n'est écrite dans un HTML.
- L'app exporte un **lot JSON** (bouton « ⇩ Lot TypeSafe »).
- Un **poste connecté**, ou un relais serveur, l'enrichit avec `typesafe-reporting/impayes_typesafe.py --lot lot.json`. Sans accord Conformité, ajouter `--anonymiser`.
- Il renvoie un classeur qui contient la feuille **`_TYPESAFE`** (masquée) : `ref | question | type | reponse | confiance | probabilites_json`. La ligne `modele | … | arrete | … | genere | …` donne l'en-tête d'audit.
- L'app relit ce classeur (« ⇪ Retours TypeSafe »). Sans lui, elle fonctionne normalement et affiche « jugements en attente ».

**Politique, appliquée par le code**
- Seuil de signal : 0,6. Seuil de confiance : 0,55.
- Une confiance faible ou une incohérence donne le statut **« Revue analyste »**, jamais une décision automatique.
- Les réponses brutes sont conservées (probabilités, confiance, modèle, date). On peut changer les seuils sans nouvel appel (`--depuis-cache`).

**Questions types, Impayés 30-90 j**
- Sur le commentaire du gestionnaire : motif, promesse datée, crédibilité, incohérence, statut proposé.
- La date promise est lue par le code et comparée à la date de bascule d'APEX.
- Sur le nom du client : nature de l'entité (publique, parapublique, privée, particulier), intra-groupe Ecobank, segment douteux.

**Feuilles ajoutées à chaque export** : Retours gestionnaires, Promesses vs bascules, Contrôle qualité, Méthodologie TypeSafe, `_TYPESAFE`. Le Word, le PowerPoint et le mail reprennent les signaux, la confiance, les dossiers à revoir et la méthodologie.

**Défauts visuels corrigés dans le moteur premium (`pmChartXml` / `pmSheetDash`)**
- Les étiquettes de l'anneau sont masquées sous 4 %.
- Le titre du graphique s'adapte à sa largeur (police réduite, puis retour à la ligne).
- Chaque graphique fait au moins 330 px de large.
- L'axe des valeurs est prolongé de 22 % pour laisser la place aux étiquettes.
- La hauteur de la ligne d'en-tête s'ajuste au libellé le plus long.

## 8. JEV — risque prospectif (salle « JEV Prospectif » d'APEX)

Chaîne : OBSERVÉ → DÉTECTÉ → PROBABILITÉ → TRAJECTOIRE → SCÉNARIO → ACTION.
Niveaux : contrepartie, segment, portefeuille, scénario / stress.

- **Calibration** : matrices de Markov mensuelles (MLE) calculées sur l'archive des arrêtés APEX (`arList` / `arGet`, dernier arrêté de chaque mois, voyage dans le temps compris), avec les états Sain, 31-60 j, 61-90 j et Douteux (absorbant). Une ligne de segment avec N < 30 est rétrécie vers la matrice du portefeuille. Les cohortes empiriques sont données avec un intervalle de Wilson à 95 %.
- **Provenance obligatoire** sur chaque probabilité : `OBSERVED`, `EMPIRICAL`, `MARKOV`, `MODELLED`, `EXPERT`, `STRESS`, `SIMULATED`, `HYBRID`. Elle indique N, l'historique en mois, la date de calibration, l'horizon, la confiance, la qualité et la méthode.
- **Qualité** :
  - Robuste : 60 mois ou plus, et N ≥ 1 000.
  - Partielle : 24 mois ou plus.
  - Insuffisante en dessous.
  - Sous 60 mois, afficher toujours « Estimation indicative — historique insuffisant pour une calibration statistique robuste. ». Ne jamais masquer cette limite.
- **DÉTECTÉ** : les signaux EWS viennent des jugements TypeSafe et du code APEX. Leurs multiplicateurs sont des paramètres **EXPERT**, appliqués sur les cotes et affichés. La PD qui en résulte est **HYBRID** (Markov + EWS + expert), avec une confiance plafonnée.
- **SCÉNARIO** : les facteurs de stress ×1,5 et ×2,0 sur les dégradations sont des hypothèses **STRESS**. Monte Carlo des entrées en douteux en montants : **SIMULATED**.
- **ACTION** : l'effet de chaque levier (régularisation, règlement partiel, levée des signaux) est recalculé par le code.
- Exports Excel et Word de la salle → finition premium automatique (`pmHook`).
