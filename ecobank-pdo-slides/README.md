# PDO Slides Studio — Ecobank Sénégal

Application HTML **100 % hors ligne** (un seul fichier) qui charge l'export
`ECOBANK_PDO_AAAA-MM-JJ.xlsx` du PDO Monitor et le transforme en **présentation
interactive** pour le COMEX / Comité des Risques, aux couleurs BLUE ECOBANK.

## Utilisation

1. Ouvrir `ECOBANK_PDO_Slides_Studio.html` dans Chrome ou Edge (double-clic).
2. Déposer le fichier `ECOBANK_PDO_….xlsx` (ou cliquer pour le choisir).
   Le fichier est lu sur le poste et n'est envoyé nulle part.
3. Présenter :

| Touche | Action |
|---|---|
| `→` `Espace` / `←` | diapositive suivante / précédente (balayage sur mobile) |
| `O` | plan de la présentation (vignettes cliquables) |
| `F` | plein écran (la barre de contrôle se masque) |
| `/` ou `Ctrl+K` | rechercher un client → fiche 360° |
| `Échap` | fermer une fenêtre |

## Les 16 diapositives

Couverture · Sommaire · Indicateurs clés (onglet Synthèse) · Ratio NPL & classification ·
Lecture par segment · Top 10 expositions · Anatomie des impayés · Top 12 impayés ·
Croisement impayés/engagements (bulles) · Comptes débiteurs · COD à déclasser ·
Clients à déclasser (provision BCEAO) · Douteux 292 · Gestionnaires ·
Constats & actions proposées (rédigés automatiquement) · Clôture.

## Interactivité

- **Filtre segment** (Tous / Corporate / Commercial / Consumer) : recalcule toutes les diapositives et l'export.
- **Clic sur un graphique** : liste détaillée (classe, stade, groupe, ancienneté, gestionnaire…).
- **Clic sur une ligne ou une bulle** : fiche client 360° (contrats ACTE 7, impayés, débiteurs, déclassement, douteux).
- Compteurs animés, jauge NPL, transitions, minuteur de présentation.
- **PDF** via l'impression (1 diapositive par page).

## Export PowerPoint interactif

Le bouton **PowerPoint** produit un .pptx à utiliser **en mode diaporama (F5)** :

- **Graphiques natifs PowerPoint** (barres, anneaux, bulles en échelle log.) : valeurs au survol,
  données modifiables dans Excel (clic droit › Modifier les données).
- **Navigation cliquable** : bouton « Commencer » et tuiles de la couverture, sommaire cliquable,
  barre `⌂ Sommaire ◀ ▶` sur chaque diapositive.
- **Approfondissement** : boutons « Classe … ▸ » (contrats par classe), « Contrats détaillés » (top 5 groupes),
  lignes des tableaux Top impayés / Débiteurs / Déclassements / Douteux → **fiche client** ;
  chaque diapositive de détail a un bouton « ↩ Retour ». Page **Annexes** indexant toutes les fiches.
- **Animations** d'entrée en cascade (fondu pour les cartes, balayage vers le haut pour les graphiques),
  démarrage automatique, et **transitions** entre diapositives.
- **Notes du présentateur** reprenant la lecture rédigée.

Les liens et animations sont ajoutés par post-traitement du XML (JSZip) après la génération PptxGenJS.

## Règles de calcul

- Ratio NPL = Σ *Ototal Including PDO* des contrats `Status = NP` / Σ *Ototal* (onglet ACTE 7), avec les
  exclusions BCEAO appliquées **symétriquement** au numérateur et au dénominateur :
  produits OA, LGMO, LTB, CC, CKU, LCU et segment 8110.
- Concentration : top 10 groupes (*Group Name*, à défaut le client) sur la même base.
- Les autres agrégats reprennent les onglets Impayés, Croisement, Débiteurs, COD à déclasser,
  Déclassements et Douteux 292. Les en-têtes sont reconnus de façon tolérante (accents, casse, position).

## Reconstruire

Sources dans `src/` (`shell.html` + `app.js`). L'assemblage injecte les bibliothèques
(xlsx-js-style, Chart.js, PptxGenJS) et le logo depuis le kit « Ecobank GOD Export Studio » :

```bash
python build.py src/shell.html src/app.js ECOBANK_PDO_Slides_Studio.html
```
