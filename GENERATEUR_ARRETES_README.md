# Générateur des arrêtés d'inventaire des engagements — ECOBANK Sénégal

Application HTML **autonome et 100 % locale** (aucune donnée ne quitte le poste) qui reconstitue,
à partir des informations recensées au **30/09/2024**, les arrêtés réglementaires demandés par le
régulateur pour **les mêmes clients** :

- **31/12/2024**
- **30/06/2025**
- **31/12/2025**

Elle produit **deux fichiers Excel** au format et aux couleurs identiques aux bases transmises :

- `Base_Inventaire_Engagement_Etat_du_Senegal_ECOBANK.xlsx`
- `Base_Inventaire_Engagement_Parapublique_ECOBANK.xlsx`

## Utilisation

1. Ouvrir `Generateur_Arretes_Inventaire_Engagements_ECOBANK.html` dans un navigateur (Chrome/Edge).
2. Charger le fichier **DIVERS PORTEFEUILLES** (feuilles `31.12.2024`, `30.06.2025`, `31.12.2025`).
3. Cliquer sur **Générer les 3 arrêtés**.
4. Télécharger les deux fichiers Excel.

Les deux bases (État & Parapublique) au 30/09/2024, avec leur mise en forme, sont **embarquées**
dans l'application : seul le fichier DIVERS PORTEFEUILLES est à charger.

## Logique de reconstitution (par arrêté)

- **Périmètre** : uniquement les clients présents dans la base au 30/09/2024
  (État du Sénégal ; SENELEC, PETROSEN, AIBD, FERA).
- **Clé de rapprochement** : n° de prêt (col. G) ou n° de compte (col. A) de la base
  = colonne « Contracts/Accounts » du portefeuille.
- **Mise à jour** d'un contrat présent au portefeuille : encours, capital restant dû,
  classification, impayés, provisions actualisés ; l'encours de début de période reprend
  l'encours au bilan de l'arrêté précédent ; les informations descriptives sont reportées.
- **Sortie** d'un contrat absent du portefeuille ou soldé (encours nul).
- **Intégration** d'un nouveau contrat du même client (champs financiers depuis le portefeuille,
  champs descriptifs à compléter — signalés en colonne « Commentaires »).
- **Exclusion** des titres / obligations (`ESN_AFS`, `ESN_HTM`, Product Code `LGMO`/`LTB`) et
  du segment interbancaire `8110` — conventions alignées sur l'outil PDO Monitor.

Un tableau de réconciliation (MAJ / nouveaux / sortis) est affiché par arrêté après génération.

## Technique

- SheetJS (lecture du portefeuille) + ExcelJS (écriture avec préservation des styles) embarqués.
- Charte BLUE ECOBANK (`#005C83` / `#8CC63F`).
- Traitement entièrement côté navigateur.
