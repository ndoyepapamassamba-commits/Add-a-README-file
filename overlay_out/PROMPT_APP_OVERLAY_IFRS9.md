# PROMPT — Application HTML « OVERLAY IFRS 9 STUDIO » (Ecobank Sénégal)

> À coller tel quel dans le modèle qui développera l'application. Il est écrit pour être **suivi pas à pas** : chaque phase se termine par un point de contrôle (🛑) où le modèle doit s'arrêter, montrer ses résultats chiffrés et attendre ma validation avant de continuer.

---

## 0. RÈGLES DE CONDUITE (à lire en premier, valables pour tout le travail)

1. Tu construis **un seul fichier `.html`, 100 % offline** (postes bancaires sans Internet). Toutes les bibliothèques sont **inlinées** dans le fichier : `xlsx-js-style` 1.2 (lecture ET écriture stylée), `JSZip` 3.10, `Chart.js` 4.4. Aucun CDN, aucun appel réseau, aucune donnée envoyée à l'extérieur. Si tu disposes du skill **`ecobank-god-export-studio`** (gabarit `shell.html`, kit `g3_xlsx_kit.js`, `build.py`, logo `logo_ecobank_png.b64`), **utilise-le** ; sinon respecte la charte décrite en §5.
2. **Tu ne devines jamais un chiffre.** Tout montant affiché ou exporté provient du calcul décrit en §3. Si une donnée manque, tu l'affiches comme manquante (badge orange), tu ne l'inventes pas.
3. **Honnêteté du résultat.** L'application doit afficher clairement si l'objectif est atteint ou non, et **quelle part de la réduction est fondée sur des garanties (couche A) et quelle part est un jugement d'expert (couche B)**. Cette distinction apparaît dans le dashboard, dans l'Excel et dans le mémo. Il est interdit de la masquer.
4. **Jamais d'augmentation de provision** : pour tout contrat, `Post ≤ Pre`. Si un paramètre ou une saisie manuelle l'enfreint, l'application bloque et signale la ligne.
5. Tout paramètre modifié **recalcule immédiatement** : tableaux, KPI, graphiques, Excel exporté, mémo exporté. Un export ne doit jamais refléter un état antérieur.
6. Procède **par phases** (§9). Après chaque phase : exécute les tests, affiche un court rapport (ce qui marche, chiffres obtenus vs valeurs attendues du §4), puis **STOP** et attends mon « go ».
7. Langue de l'interface, des exports et du mémo : **français**. Montants en XOF, entiers, espace comme séparateur de milliers (`9 715 141 373`), dates `jj/mm/aaaa`.

---

## 1. CONTEXTE MÉTIER

Ecobank Sénégal calcule chaque mois ses provisions IFRS 9 (fichier modèle « OVER »). La filiale peut appliquer des **overlays / overrides** (ajustements de la Direction) pour aligner le stock déclaré sur la position validée par la Direction Financière. Le mémo officiel du mois précédent (`MEMO_Overlay_Override_AOUT_2026_1.doc`) en est le modèle : un abattement de 614 715 369 XOF réparti au prorata sur 20 contreparties pour passer de 9 856 753 930 (modèle) à 9 242 038 561 (stock Finance).

Pour septembre 2026, la mission est :

- **Impairment-Pre total** (somme de la colonne `Impairment-pre`) = **11 896 144 967** XOF ;
- **Objectif** `Impairment-POST OVERLAY` = **9 715 141 373** XOF (tolérance ± 10 000) ;
- donc une réduction à justifier de **2 181 003 594** XOF, construite en **deux couches** :
  - **Couche A — Garanties** : abattement individualisé par client, fonction de la couverture (valeur de garantie éligible / exposition) ;
  - **Couche B — Lissage de la variation mensuelle** : jugement de direction qui neutralise une fraction λ de la hausse Août→Septembre sur les contrats Stage 1/2, calibrée pour atteindre l'objectif. **Elle n'est pas fondée sur des garanties** et requiert validation Comité des Risques / Finance.

L'application doit permettre à l'utilisateur (analyste du Credit Risk) de charger les fichiers, **jouer sur tous les paramètres**, voir l'impact en direct, corriger à la main des lignes, puis **télécharger le classeur Excel Overlay et le mémo Word** prêts à l'emploi.

---

## 2. ENTRÉES

### 2.1 Fichier OVER (`.xlsx`) — dépôt par glisser-déposer
Feuilles attendues (recherche **tolérante** : ligne d'en-tête dans les 25 premières lignes, en-têtes comparés sans accents ni casse, par expressions régulières) :

**Feuille `OVERRIDES`** (≈ 18 889 contrats). Colonnes utiles (lettre Excel d'origine, utile pour l'export) :

| Lettre | En-tête | Usage |
|---|---|---|
| A | CONTRACT_ID | clé contrat |
| C | CUSTOMER_NO | **clé client (texte, à conserver en chaîne)** |
| D | Clients | nom du client |
| E | SEGMENT | CORPORATE / COMMERCIAL / CONSUMER |
| H | STAGE | 1, 2 ou 3 (par contrat) |
| S | OUTSTANDING BALANCE | encours du contrat |
| W | **Impairment-pre** | provision modèle septembre (base de tout) |
| X | **impairment aout** | provision d'août (sert à la couche B) |
| Y | ecart | informatif |
| AN | Overlays_Percentage | **à remplir** (vide à l'entrée) |
| AO | Impairment-POST OVERLAY | **à remplir** (vide à l'entrée) |
| AP | Governance: Reason(s) for override? | **à remplir** |
| AQ | rpt_date | date d'arrêté (ex. 30/09/2026) |

Les autres colonnes (J→R garanties par contrat, toutes à 0, AB→AM overrides) sont **conservées telles quelles** dans l'export.

**Feuille `S2 ET S3 AOUT`** (≈ 51 clients) : `Code Client`, `Relationship`, `Ototal ` (attention : espace final dans l'en-tête), `Provisions IFRS9 AOUT 2026`, `Provisions Locales`, `Stage IFRS9 Model`, `Collateral value`. Certaines cellules peuvent contenir une erreur Excel (`#N/A`) : lire en tolérant, ne jamais planter.

### 2.2 Registre des garanties — second dépôt (CSV/XLSX) **ou collage**
Le fichier OVER **ne contient pas** la liste détaillée des garanties. L'app a donc un second bloc de dépôt « Registre des garanties » acceptant :
- le fichier fourni `garanties_source.csv` (séparateur `;`, colonnes `Code Client;Code Sûreté;Devise;Valeur;Échéance (jj/mm/aaaa)`, 942 lignes) ;
- OU un export Excel/CSV avec les colonnes d'origine `Contracts/Accounts, Ctry Code, Code Client, Relationship, Security, SecurityCurrency, Collateral Value, Issue_Date, Maturity_Date` ;
- OU un collage direct (zone de texte) du tableau copié depuis Excel/Word.

Tolérances de lecture : valeurs au format `197 986 250,` (espaces fines/insécables, virgule finale), échéance `—` ou vide = « non renseignée », année exotique (`11/04/2323`) acceptée, code client en texte. Aperçu des 10 premières lignes + compteurs (lignes lues, lignes rejetées avec motif).

### 2.3 Mémo modèle
Le mémo d'août (`.doc`, en réalité du HTML) fournit **la charte et la structure**. Le gabarit du nouveau mémo est **embarqué dans l'application** (§7) ; l'utilisateur n'a pas à recharger le mémo. Extrais le logo (balise `<img src="data:image/png;base64,…">` du mémo) ou prends celui du kit.

---

## 3. MOTEUR DE CALCUL (spécification exacte — à implémenter fidèlement)

Tout le moteur est une **fonction pure** `compute(data, params) → résultats`, exécutée dans un Web Worker (ou par blocs) pour que l'interface reste fluide sur 18 889 lignes. Aucune dépendance au DOM.

### 3.1 Paramètres (valeurs par défaut, tous modifiables dans l'UI)

| Clé | Défaut | Rôle |
|---|---|---|
| `objectif` | 9 715 141 373 | cible du Post total |
| `tolerance` | 10 000 | tolérance d'atteinte |
| `dateArrete` | 30/09/2026 | date de référence (garanties échues exclues) |
| `seuilPre` | 1 000 000 | Impairment-Pre minimal d'un client pour entrer dans la couche A |
| `tauxMax` | 50 % | plafond du taux d'abattement couche A |
| `seuilConcentration` | 1 000 000 000 | exposition client au-delà de laquelle on pénalise |
| `penConcentration` | 5 pts | pénalité de concentration |
| `seuilEcheance` | 50 % | part de garanties échéant < 12 mois déclenchant la pénalité |
| `penEcheance` | 5 pts | pénalité d'échéance |
| `lambda` | calibré (mode « Atteindre l'objectif ») ou saisi (mode « Manuel ») | part de la hausse mensuelle neutralisée |
| `stageMaxLissage` | 2 | contrats Stage ≤ cette valeur sont éligibles au lissage |
| `aoutMin` | 0 | provision d'août doit être > cette valeur |
| `perimetre` | « Tous les stages » | option : Stage 1 seulement / S2+S3 de la feuille S2 S3 seulement / tous |
| `couches` | A ✔ B ✔ | interrupteurs d'activation de chaque couche |
| `sourceValeurS2S3` | « Feuille S2 S3 » | pour les clients de S2 S3 : valeur = colonne `Collateral value` de la feuille (défaut) **ou** valeur éligible du registre |

**Grille d'abattement** (tableau éditable : seuil de couverture → taux ; recherche du dernier seuil ≤ ratio) :
`0 % → 0 %`, `30 % → 5 %`, `50 % → 10 %`, `70 % → 15 %`, `90 % → 20 %`, `110 % → 25 %`, `130 % → 30 %`, `150 % → 40 %`, `200 % → 50 %`, `300 % → 50 %`, `500 % → 50 %`.

**Table des sûretés** (code → famille, libellé, décote ; **éditable**, les libellés sont des hypothèses à valider avec Crédit/Juridique et doivent être affichés comme telles) :

| Code | Famille | Libellé | Décote |
|---|---|---|---|
| 1000 | Cash / financière | Garantie bancaire / contre-garantie | 10 % |
| 3110, 3120, 3210 | Cash / financière | Dépôt / cash collatéral | 0 % |
| 3410 | Cash / financière | Garantie financière institutionnelle | 10 % |
| 4100, 4200, 4300, 4500 | Mobilière (nantissement) | Gage / nantissement | 40 % |
| 5100, 5200, 5300, 5400, 5500 | Immobilière | Hypothèque | 30 % |
| 7000, 7100, 8000 | Mobilière (nantissement) | Nantissement matériel/stocks, autre sûreté | 50 % |

Un code absent de la table est signalé « Non mappé » (décote 100 %, compté dans un indicateur de qualité des données).

### 3.2 Étapes de calcul

**Étape 1 — Agrégation client.** Pour chaque `CUSTOMER_NO` (texte) : `nom` (1ʳᵉ occurrence), `stage = max(STAGE)` des contrats, `expo = Σ OUTSTANDING BALANCE`, `pre = Σ Impairment-pre`, `nbContrats`.

**Étape 2 — Garanties par client** à partir du registre :
- `brut = Σ valeur` ;
- pour chaque sûreté : `statut = « Échue »` si échéance < `dateArrete`, `« Non renseignée »` si vide, sinon `« Valide »` ; `éligible = statut=="Échue" ? 0 : valeur × (1 − décote(code))` ;
- `eligible = Σ éligible` ; `courtTerme = Σ valeur des sûretés Valides échéant avant dateArrete + 12 mois` ; `partCourtTerme = courtTerme / brut` ;
- `éligibleParFamille` (3 familles) ; `famille dominante = famille de plus forte valeur éligible`.

**Étape 3 — Valeur de garantie retenue** : si le client figure dans la feuille S2 S3 et `sourceValeurS2S3 = « Feuille S2 S3 »` → `retenue = Collateral value` (valeur brute de la feuille, sans décote) ; sinon `retenue = eligible`. `couverture = retenue / expo` (0 si expo = 0).

**Étape 4 — Couche A (taux par client).**
`tauxGrille = grille(couverture)` ; `penC = expo > seuilConcentration ? penConcentration : 0` ; `penE = (brut>0 && partCourtTerme > seuilEcheance) ? penEcheance : 0` ;
`tauxA = max(0, min(tauxMax, tauxGrille) − penC − penE)`.
Le client est **dans le périmètre A** si `brut > 0` et `pre ≥ seuilPre` (et selon l'option `perimetre`). Hors périmètre ou couche A désactivée : `tauxA = 0`.
`réductionA(client) = pre × tauxA` ; au niveau contrat : `AT = Impairment-pre × tauxA`.

**Étape 5 — Couche B (lissage), niveau contrat.**
`baseLissable = (STAGE ≤ stageMaxLissage && aout > aoutMin) ? max(0, Impairment-pre − AT − aout) : 0`
`réductionB = λ × baseLissable` (couche B désactivée → 0). Propriété à garantir : `Post_contrat = Pre − AT − réductionB ≥ aout` pour tout contrat lissé.

**Étape 6 — Résultat contrat.**
`réductionTotale = AT + réductionB` ; `Overlays_Percentage (AN) = Pre>0 ? réductionTotale / Pre : 0` ; `Impairment-POST OVERLAY (AO) = Pre × (1 − AN)` ; `Governance (AP)` = texte du type « Overlay Management Adjustment – garanties 40 % + lissage variation mensuelle (λ=73,9 %) » (vide si aucune réduction).

**Étape 7 — Calibration de λ (mode « Atteindre l'objectif »).** Formule fermée, pas d'itération :
`λ* = (Σ Pre − Σ AT − objectif) / Σ baseLissable`.
- Si `λ* < 0` : la couche A dépasse déjà l'objectif → λ = 0 et message « Objectif dépassé par la seule couche A ; Post = X ».
- Si `λ* > 1` : **objectif inatteignable** avec ces paramètres → λ = 1, bannière rouge « OBJECTIF NON ATTEINT – écart de X XOF » avec les leviers possibles (assouplir grille, élargir `stageMaxLissage`, baisser `seuilPre`, etc.).
- En mode « Manuel », λ est saisi (curseur + champ) et l'écart est affiché.

**Étape 8 — Surcharges manuelles (« la main »).** L'utilisateur peut, par client : (a) forcer un taux A (valeur absolue), (b) exclure le client de la couche A, (c) exclure le client de la couche B, (d) ajouter un commentaire libre. Chaque surcharge est tracée (journal : date/heure, client, ancien → nouveau, motif obligatoire) et **reste prioritaire sur le moteur**. Après surcharge, λ* est recalculé (mode objectif). Contrôle bloquant : `Post ≤ Pre` et `Post ≥ 0`.

**Étape 9 — Agrégats** : totaux Pre / Réduction A / Réduction B / Post, écart à l'objectif, nombre de clients et de contrats ajustés (clients distincts : un client est « ajusté » si au moins un de ses contrats a une réduction > 0), répartition par stage, par famille de garantie dominante, par segment, Top 20 clients par réduction totale, distribution des taux, contrôles qualité (contrats Post>Pre = 0 ; contrats lissés sous août = 0 ; codes sûreté non mappés ; clients du registre absents de OVERRIDES ; garanties échues).

### 3.3 Précision numérique
Calculs en flottants, **aucun arrondi intermédiaire**. Affichage arrondi à l'entier. L'écart final doit être de l'ordre de 1 XOF en mode objectif.

---

## 4. VALEURS DE TEST (critères d'acceptation chiffrés)

Avec le fichier `OVER.xlsx` d'origine, le registre `garanties_source.csv` et **les paramètres par défaut du §3.1**, l'application doit retrouver (tolérance < 1 XOF sauf mention) :

| Indicateur | Valeur attendue |
|---|---|
| Σ Impairment-pre | 11 896 144 967,27 |
| Σ impairment aout | 8 872 683 621,14 |
| Clients au périmètre couche A | 218 |
| Clients avec taux A > 0 | 165 |
| Réduction couche A | 746 726 726,39 |
| Σ base lissable (Stage ≤ 2, août > 0) | 1 940 439 486,15 |
| λ calibré | 0,739150526526 |
| Réduction couche B | 1 434 276 867,88 |
| **Réduction totale** | **2 181 003 594,27** |
| **Impairment-POST total** | **9 715 141 373** (écart < 1 XOF) |
| Contrats ajustés (réduction > 0) | 9 934 (1 : 8 319 · 2 : 1 541 · 3 : 74) |
| Contrats Post > Pre | 0 |
| Contrats lissés avec Post < août | 0 |
| Réduction A par stage | S1 : 80 483 321 · S2 : 26 388 881 · S3 : 639 854 525 |
| Réduction B par stage | S1 : 677 148 353 · S2 : 757 128 515 · S3 : 0 |
| SOCABEG SA (101304873) | couverture ≈ 2 627 % → taux A 50 % → réduction ≈ 194 061 936 |

Si un écart apparaît : **ne pas « ajuster pour tomber juste »**. Identifier la divergence (lecture de fichier, clé texte vs nombre, décote, périmètre) et me la signaler.

---

## 5. DESIGN — « BLUE ECOBANK GOD 3D »

**Palette** (le fond du logo est exactement `#005C83`) :

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

Règles : **jamais de fond noir ni sombre** ; filet **lime 3 px** sous chaque bandeau marine ; police **Segoe UI** (chiffres en `tabular-nums`, Consolas dans les tableaux/exports) ; cartes blanches en relief (ombre douce), liseré gauche coloré sur les KPI ; tables à en-tête marine soulignée de lime, zébrures `#F6FAFC`, lignes cliquables ouvrant une **fiche client en tiroir** latéral ; attribut `[hidden]{display:none!important}` ; responsive jusqu'à 390 px.

**Couleurs sémantiques des couches** : couche A (garanties) = bleu `#005C83` ; couche B (lissage) = ambre `#D4A13A` + pastille « Jugement » ; objectif atteint = vert lime ; non atteint = rouge `#C0392B`.

### 5.1 Structure de l'écran
1. **Topbar sticky** : logo + « OVERLAY IFRS 9 STUDIO », arrêté, bouton « Recalculer », « Annuler / Rétablir », « Exporter Excel », « Exporter Mémo », état (nombre de surcharges).
2. **Écran de dépôt** (état initial) : deux grandes zones de dépôt (OVER.xlsx · Registre des garanties) + zone de collage ; barre de progression de lecture ; rapport de lecture (feuilles trouvées, lignes, anomalies).
3. **Héros** (après chargement) : bloc marine dégradé `#00415E → #005C83` avec l'arc blanc du logo en filigrane ; **jauge/barre de progression vers l'objectif** (Pre → Post → Objectif) ; le **Post total en très grand**, l'écart, et une pastille ✔ ATTEINT / ✖ NON ATTEINT ; barre empilée « Couche A / Couche B ».
4. **Onglets** :
   - **Tableau de bord** : 6 KPI (Pre, Réduction totale, Post, Objectif, Écart, Clients ajustés) ; cartes « Couche A » et « Couche B » avec leur montant, leur part, leur statut (Fondée sur garanties / Jugement de direction) ; graphiques Chart.js : cascade Pre → A → B → Post, réduction par stage (barres empilées A+B), répartition par famille de garantie (anneau), distribution des taux, Top 20 (barres horizontales) ; **« Lecture rédigée »** (4 à 6 constats en phrases chiffrées, générés par le code, repris dans le mémo).
   - **Paramètres** : panneau à curseurs/champs (§3.1), grille éditable (ajout/suppression de lignes), table des sûretés éditable, interrupteurs de couches, sélecteur de mode λ (Objectif / Manuel), boutons « Réinitialiser aux défauts », « Enregistrer un scénario » (nom, stocké en `localStorage` dans un try/catch) et « Comparer deux scénarios » (tableau côte-à-côte Post, réduction A/B, écart). Chaque modification affiche en direct le **delta** sur Post et sur l'écart.
   - **Recommandations (clients)** : tableau filtrable/triable (client, n°, stage, exposition, garanties, valeur garantie retenue, couverture, Pre, Overlay % A, réduction A, réduction B, Post, justification) ; filtres : stage, famille, taux, « avec surcharge », recherche libre ; **édition en ligne** du taux A, exclusions, commentaire (→ journal d'audit) ; export du périmètre filtré rappelé en en-tête de l'export.
   - **Contrats** : table virtualisée des 18 889 contrats (Pre, août, AT, base lissable, réduction B, Overlay %, Post) avec filtres.
   - **Lissage (couche B)** : explication de la logique en 5 puces, tableau par stage et par segment, **courbe de sensibilité de λ** (λ de 0 à 100 % → Post et écart, marqueur du λ retenu et du λ requis).
   - **Contrôles & Audit** : liste des contrôles (✔/✖), anomalies de données, journal des surcharges et des changements de paramètres (horodaté), bouton « Exporter le journal ».
   - **Mémo** : éditeur du mémo (§7).
5. **Toast** pour chaque action ; **overlay d'attente** pendant les calculs/exports.

---

## 6. EXPORT EXCEL « OVERLAY » (`OVER_overlay_IFRS9_<AAAAMMJJ>.xlsx`)

Génération avec `xlsx-js-style`. Les **formules doivent être vivantes** (cellule `{f:"…", v:valeurCalculée}` : la formule ET sa valeur en cache, pour que le fichier s'ouvre correctement même sans recalcul). Mêmes styles que l'écran : en-têtes marine `#00415E` + filet lime/or, texte blanc gras, zébrures, Consolas `#,##0` pour les montants, % au format `0%` / `0,0 %`, grille masquée, volets figés sous l'en-tête, **filtres automatiques actifs**, largeurs de colonnes soignées, onglets colorés, impression A4 paysage, pied « ECOBANK SÉNÉGAL · OVERLAY IFRS 9 · INTERNAL USE ONLY », badge logo en tête des feuilles.

Feuilles, dans cet ordre :

1. **`DASHBOARD_OVERLAY`** — tuiles : Impairment Pre Total, Réduction Overlay Totale, Impairment Post Overlay Final, Objectif, Écart, Nombre de clients ajustés (formules sur `OVERRIDES`/`RECOMMANDATIONS_OVERLAY`) ; bandeau d'état (vert/rouge) ; contrôles (Post>Pre = 0, lissés < août = 0) ; réduction couche A / couche B / part fondée sur garanties ; répartition par Stage (contrats ajustés, réduction A, réduction B, totale, part) ; répartition par famille de garantie ; Top 20 des réductions ; graphiques « premium » (images PNG des visuels 3D du kit ou graphiques natifs : cascade, barres empilées par stage, anneau par famille, Top 20).
2. **`RECOMMANDATIONS_OVERLAY`** — colonnes **exactes** : `Client · Numéro Client · Stage · Exposition · Garanties · Valeur Garantie · Ratio Couverture · Impairment-Pre · Overlay % Proposé · Montant Réduction · Impairment-POST · Justification Overlay`, puis (après une colonne vide) les colonnes techniques : Famille dominante, Valeur brute, Valeur éligible, Valeur S2 S3 (source), Pénalité concentration, Pénalité échéance, Taux grille, Part échéant < 12 mois, valeurs éligibles par famille, Réduction couche B, Réduction totale, Impairment-POST final, Surcharge (O/N), Commentaire. Formules : `Exposition = SUMIFS(OVERRIDES!S:S, OVERRIDES!C:C, B)`, `Impairment-Pre = SUMIFS(OVERRIDES!W:W, …)`, `Ratio = Valeur/Exposition`, `Overlay % = grille − pénalités` (via `LOOKUP` sur la feuille PARAMETRES), `Montant Réduction = Pre × Overlay %`, `POST = Pre − Réduction`. Ligne TOTAL en `SUBTOTAL`. Justification : **texte détaillé** par client (voir §6.1). Barres de données sur la réduction, échelle de couleurs sur la couverture.
3. **`OVERLAY_LISSAGE`** — logique en 5 puces, tableau par stage/segment, sensibilité de λ, λ retenu vs λ requis.
4. **`PARAMETRES`** — tous les paramètres (cellules **bleues** = saisies modifiables), grille, table des sûretés, notes d'hypothèses. **Les formules des autres feuilles pointent ici** : l'utilisateur peut rejouer des scénarios directement dans Excel.
5. **`GARANTIES`** — le registre (Numéro Client, Relationship par `INDEX/MATCH`, Code sûreté, Famille par `VLOOKUP`, Devise, Valeur, Échéance, Décote, Statut échéance, Valeur éligible, Échéant < 12 mois), filtres actifs.
6. **`OVERRIDES`** — **toutes les colonnes d'origine conservées**, plus : `AN Overlays_Percentage = IF(W>0, AW/W, 0)`, `AO Impairment-POST OVERLAY = W*(1-AN)`, `AP Governance` (texte), et colonnes ajoutées `AS Overlay_Garanties_%`, `AT Reduction_Garanties = W*AS`, `AU Base_Lissable`, `AV Reduction_Lissage = AU*λ`, `AW Reduction_Totale = AT+AV`.
7. **`S2 ET S3 AOUT`** — feuille d'origine inchangée.
8. **`JOURNAL_AUDIT`** — surcharges et changements de paramètres horodatés.

Le recalcul Excel doit redonner **exactement** les valeurs de l'application (test : ouvrir le fichier, recalculer, comparer Post total). Aucune cellule en erreur introduite par l'export (la seule erreur tolérée est le `#N/A` déjà présent dans la source `S2 ET S3 AOUT`).

Les mises en forme conditionnelles/données de barres que `xlsx-js-style` ne sait pas écrire sont ajoutées par post-traitement du `.xlsx` avec JSZip (voir `xlsxAttach` du kit) ; si impossible, dégrade proprement (valeurs colorées statiquement).

### 6.1 Justifications détaillées (générées par le code, pas de texte figé)
Pour chaque client de la couche A, assembler, selon les données, des phrases du type :
- couverture : « Couverture de **158 %** de l'exposition, très largement supérieure au risque résiduel. » (≥150 %), « Couverture supérieure à 110 % de l'exposition. » (≥110 %), « Couverture suffisante pour justifier un ajustement. » (≥70 %), « Couverture partielle de X %. » (sinon) ;
- nature : « Garantie immobilière actualisée et exécutoire (hypothèque). » / « Garantie cash collatéral / financière couvrant largement le risque résiduel. » / « Sûretés mobilières (nantissement) retenues après décote prudentielle. » ;
- niveau de provision : « Niveau de provision jugé conservateur au regard des sûretés disponibles (Pre = X % de l'exposition, Post = Y %). » ;
- taux : « Abattement de 40 % (grille 40 %) » et, si pénalité, « – prudence : 5 pts pour concentration / échéance des garanties < 12 mois » ;
- stage : S3 → « revue individuelle du dossier par le Comité des Risques requise » ; S2 → « suivi renforcé de la valeur des sûretés » ; S1 → « abattement fondé sur la valeur des sûretés disponibles » ;
- si surcharge manuelle : ajouter le motif saisi.
Pour un client sans abattement : « Aucun abattement : couverture éligible de X % insuffisante au regard de la grille (seuil 30 %) ou provision non significative. »

---

## 7. MÉMO (`MEMO_Overlay_Override_<MOIS>_<ANNEE>.doc` + `.docx`)

Le mémo est **généré à partir du gabarit d'août**, adapté aux deux couches, **éditable dans l'application avant export**.

### 7.1 Charte du mémo (reprendre ce CSS)
```css
@page{size:A4;margin:2.2cm 2.2cm}
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;color:#12333F;font-size:11pt;line-height:1.5}
.hdr{border-bottom:3px solid #8CC63F;padding-bottom:8px;margin-bottom:6px} .hdr img{height:56px}
.tagline{color:#3E5C6B;font-size:8pt;letter-spacing:.5px} .internal{font-size:8pt;color:#3E5C6B;letter-spacing:1px}
.meta td{padding:2px 6px;font-size:10.5pt;vertical-align:top} .meta b{color:#00415E}
h1.obj{font-size:12pt;color:#00415E;margin:14px 0 4px}
h2.sec{font-size:11.5pt;color:#005C83;border-bottom:1px solid #CFE0E7;padding-bottom:3px;margin:18px 0 8px}
p{margin:8px 0;text-align:justify}
table.k{border-collapse:collapse;width:100%;margin:10px 0}
table.k th{background:#005C83;color:#fff;font-size:9.5pt;padding:6px;text-align:right;border:1px solid #00415E}
table.k th:nth-child(1),table.k th:nth-child(2){text-align:left}
table.k td{border:1px solid #CFE0E7;padding:5px 6px;font-size:10pt} table.k td.r{text-align:right} table.k td.cu{color:#005C83;font-weight:bold}
table.k tr:nth-child(even) td{background:#EEF4F7}
table.k tfoot td{background:#E7F0F4;font-weight:bold;color:#00415E;border-top:2px solid #005C83}
.parambox{background:#EEF4F7;border:1px solid #CFE0E7;border-left:4px solid #8CC63F;padding:8px 12px;margin:10px 0;font-size:10pt} .parambox b{color:#00415E}
.sign{margin-top:40px;width:100%;border-collapse:collapse}
.sign td{text-align:center;font-size:9.5pt;color:#00415E;font-weight:bold;padding-top:6px;border-top:1px solid #12333F;width:20%}
.sign .sp td{border:none;height:46px}
.foot{margin-top:28px;font-size:8pt;color:#3E5C6B;text-align:center;border-top:1px solid #CFE0E7;padding-top:6px}
```
En-tête : « INTERNAL USE ONLY », logo « The Pan African Bank », bloc méta (À : DG / FINANCE · De : Direction des Engagements – Cellule Portefeuille · Date · Objet : « MÉMO PROVISIONS, OVERLAYS & OVERRIDES – SEPTEMBRE 2026 »). Signatures : HEAD CAD · HEAD REMEDIAL · HEAD ENGAGEMENTS · HEAD FINCON · DG. Pied : « Ecobank Sénégal – The Pan African Bank · Document interne · Généré le jj/mm/aaaa ».

### 7.2 Plan du mémo (chaque bloc = paragraphe éditable ; les variables `{{…}}` se mettent à jour quand les paramètres changent)
1. **Introduction IFRS 9** (reprise du texte d'août : projections et perspectives propres à l'environnement/pays, dérogations possibles).
2. **Demande d'approbation** : « Le modèle produit pour {{MOIS}} un stock de provisions de XOF {{PRE}}. Après revue et rapprochement avec la position arrêtée par la Direction Financière (stock validé de XOF {{OBJECTIF}}), la filiale sollicite votre approbation pour appliquer un abattement de XOF {{REDUCTION}} … ». Le libellé « stock validé par la Direction Financière » est un champ libre.
3. **Encadré paramètres** (`parambox`) : montant total à retrancher ; part couche A (garanties) ; part couche B (lissage) ; λ ; taux moyen de réduction ; nombre de clients et de contrats ajustés ; date d'arrêté.
4. **Section A — Abattements fondés sur les garanties** : méthode (grille couverture → taux, pénalités concentration/échéance, décotes par type de sûreté) ; **tableau des N plus grosses contreparties** (N réglable, défaut 20) : `CU · Nom · Stage · Couverture · Impairment avant · Impairment après · Abattement · Taux` + ligne TOTAL (`tfoot`) ; **commentaire automatique par contrepartie** (la justification du §6.1, abrégée) en dessous du tableau ou en note.
5. **Section B — Lissage de la variation mensuelle** : rappel de la logique, de λ, des garde-fous (jamais de hausse, Post ≥ provision d'août, Stage 3 exclu) ; tableau par stage ; **mention explicite « jugement de direction, non fondé sur des garanties »** et réserves (validation Comité des Risques/Finance, back-test, commissaires aux comptes).
6. **Synthèse et contrôles** : Pre → A → B → Post, écart à l'objectif, contrôles réussis, anomalies restantes.
7. **Demande finale** : « Après application de ces abattements, le stock de provisions IFRS 9 déclaré pour {{MOIS}} s'établit à XOF {{POST}}, en cohérence avec … Nous sollicitons votre approbation … ». Si l'objectif n'est pas atteint, **le texte bascule automatiquement** vers « … s'établit à XOF {{POST}}, soit un écart de XOF {{ECART}} par rapport à … » (jamais de phrase affirmant une cohérence qui n'existe pas).
8. Signatures + pied.

### 7.3 Éditeur de mémo (onglet « Mémo »)
- Aperçu A4 fidèle à gauche, **chaque bloc modifiable en clair** (contenteditable) ; barre d'outils minimale (gras, italique, liste) ;
- panneau de droite : liste des variables (valeur courante, bouton « verrouiller la valeur » pour figer un chiffre), bascules d'inclusion des sections, champs libres (objet, destinataires, mois, date du mémo, libellé du stock cible), curseur « N contreparties » ;
- **un bloc modifié à la main n'est plus réécrit automatiquement** (badge « modifié », bouton « Régénérer ce bloc ») ; les chiffres encore liés aux variables restent à jour ;
- bouton **« Ajouter un commentaire »** (encadré `parambox` libre) à n'importe quel endroit ;
- export : `.doc` (HTML avec le CSS ci-dessus, compatible Word, comme l'original) **et** `.docx` (via JSZip, tableaux et couleurs conservés) ; l'export reprend exactement ce qui est affiché dans l'éditeur.

---

## 8. EXIGENCES TECHNIQUES

- Lecture : `XLSX.read` avec `cellDates`, `raw:false` désactivé pour les montants ; **clé client toujours en chaîne** ; tolérance aux `#N/A` ; 18 889 lignes lues en < 3 s.
- Calcul dans un **Web Worker** (blob inline) avec repli synchrone ; recalcul < 300 ms après changement de paramètre (mémoriser les agrégats client invariants : étapes 1-3 ne sont refaites que si les entrées ou la table des sûretés changent).
- Tables volumineuses **virtualisées** (rendu des lignes visibles uniquement).
- `localStorage` uniquement dans des `try/catch` ; l'application fonctionne sans.
- Aucune donnée client n'est envoyée sur un réseau ; ne pas utiliser `eval`/`Function` sur des contenus de fichier.
- Accessibilité : contraste ≥ 4,5, focus visible, navigation clavier des onglets.
- Code structuré en modules internes : `reader`, `engine` (pur), `store` (état + historique annuler/rétablir), `views`, `exportXlsx`, `exportMemo`, `audit`. Commentaires courts sur chaque règle métier avec renvoi au § de ce prompt.

---

## 9. PLAN DE TRAVAIL PAR PHASES (arrête-toi à chaque 🛑)

**Phase 1 — Lecture & moteur.** Lecteur OVER + registre garanties ; `engine.compute` ; tests unitaires en console sur les valeurs du §4. 🛑 *Montre le tableau « attendu vs obtenu ».*

**Phase 2 — Interface principale.** Gabarit/charte, écran de dépôt, héros, tableau de bord, panneau Paramètres avec recalcul en direct, onglets Recommandations/Contrats/Lissage/Contrôles. 🛑 *Fournis des captures (Playwright) de chaque onglet en 1440 px et 390 px.*

**Phase 3 — Main de l'utilisateur.** Surcharges par client, journal d'audit, annuler/rétablir, scénarios et comparaison, mode λ Objectif/Manuel, cas « objectif inatteignable ». 🛑 *Démontre : (a) λ > 1 (ex. grille divisée par 2) → bannière rouge ; (b) forcer un taux manuel → λ* recalculé et journal alimenté.*

**Phase 4 — Export Excel.** Toutes les feuilles du §6, formules vivantes, styles, filtres. 🛑 *Ouvre le fichier avec openpyxl, recalcule avec LibreOffice (`soffice --headless`), compare Post total et totaux par stage avec l'application ; convertis en PDF et inspecte visuellement ; liste toute erreur de formule.*

**Phase 5 — Mémo.** Gabarit, variables, éditeur, export `.doc` et `.docx`. 🛑 *Génère le mémo avec les paramètres par défaut, convertis en PDF, vérifie la mise en page, que les chiffres du mémo = ceux de l'Excel, et le basculement de texte quand l'objectif n'est pas atteint.*

**Phase 6 — Recette finale.** Playwright : charger les vrais fichiers, zéro `pageerror`, déclencher chaque export, relire les téléchargements ; vérifier le mode hors-ligne (aucune requête réseau). Livrer le `.html` unique + un `LISEZMOI` d'une page (mode d'emploi, limites, hypothèses à valider).

---

## 10. FORMAT DE TES RÉPONSES

À chaque point de contrôle : (1) ce qui est fait en 5 lignes max ; (2) tableau « attendu / obtenu » ; (3) problèmes rencontrés et décisions prises ; (4) la question « Je passe à la phase suivante ? ». Ne livre le fichier final qu'après la phase 6.

## 11. CE QUE TU NE DOIS PAS FAIRE
- Ne pas présenter la couche B comme fondée sur des garanties.
- Ne pas forcer un résultat (modifier un chiffre, une grille ou un test pour « tomber juste »).
- Ne pas produire de fond sombre, de police exotique, ni d'export dont les chiffres diffèrent de l'écran.
- Ne pas dépendre d'Internet ni d'un serveur.
- Ne pas supprimer ou réordonner les colonnes d'origine de `OVERRIDES`.
