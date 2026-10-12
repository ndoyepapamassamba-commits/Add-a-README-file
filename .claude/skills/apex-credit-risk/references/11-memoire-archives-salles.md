# 11 — Mémoire des arrêtés, archives, voyage dans le temps et salles de travail

Source : APEX mémoire IndexedDB (`hs*`), archives, time travel, salles (Atelier, DRAFT, Control Tower, Centrale K094, Comité, PDO Mailer). Dans MASSAMBA Workbench, la mémoire par chat et le coffre d'expérience jouent le même rôle : **ne jamais recalculer N‑1 de tête** ; s'il n'est pas en mémoire, le demander.

## 1. Instantané d'un arrêté (`hsPack`)
Par client (`HS_COL`) : `clc`, `rel`, `bseg`, `off` (gestionnaire), `sector`, `enc`, `pdo`, `dj`, `stage`, `npl`, `ecl`, `cls`, `frr`, `cov` ; métadonnées : `date` (arrêté), `label`, `file`, `eclBasis` (`IFRS9` ou `LOCAL` — un instantané en base locale n'est **pas comparable** à l'ECL IFRS 9 : l'écrire). Alias d'en-têtes (`HS_ALIAS`) pour reconnaître les colonnes des anciens fichiers.

## 2. N‑1 et historique
- `hsPriorFromHistory` : N‑1 = **dernier instantané du mois précédent** (fin de mois), jamais un instantané du même mois.
- Détection automatique d'un fichier N‑1 joint : > 500 lignes et date d'arrêté antérieure.
- Archives : les **24 derniers** instantanés + toutes les fins de mois ; sauvegarde générale (export JSON de la mémoire) et restauration.
- **Voyage dans le temps** : choisir un arrêté passé ⇒ toutes les analyses se recalculent sur cet arrêté, l'historique est borné à cette date (aucune fuite du futur dans les tendances ou les calibrations).

## 3. Salles de travail et ce qu'elles produisent

| Salle | Rôle | Sorties |
|---|---|---|
| **Atelier** | lecture guidée du fichier, corrections de données, requêtes libres | tableaux, exports Excel ciblés |
| **DRAFT** | brouillons de notes (watchlist, client, comité) à partir des modèles `noteWatchlist` / `noteClient` / `execNarr` | Word, mail |
| **Control Tower** | suivi des plans d'action (CRM interne : `crmFromActe7`, statuts, échéances, promesses) | Excel actions, relances, tableau de bord d'avancement |
| **Centrale K094** | consolidation multi-fichiers (ACTE 7, PCB, CRM, mémos d'appel, historique) et croisements | dossier global (fiche 05 § 9) |
| **Comité** | préparation du comité de crédit / des engagements : ordre du jour, décisions, suivi | PPT 20 diapositives, procès-verbal Word |
| **PDO Mailer** | relances par gestionnaire : impayés, promesses échues, dossiers J3–J4 | .eml avec tableaux et images CID |
| **CCB** | reporting groupe (fiche 07) | Excel / Word en anglais |
| **Décision** | capital et stress (fiche 09) | Excel, récit |
| **Risk Outlook** | probabilités avec provenance (fiche 12) | feuille « Risk Outlook » dans chaque classeur |

## 4. Statuts d'un dossier (Control Tower, CRM)
`À faire` → `Revue analyste` → `En cours` → `Promesse de règlement` / `Restructuration` → `Régularisé (à vérifier)` → `Fait` / `Régularisé` ; dates `dRegul`, `actionDate`, `d90` (date de bascule > 90 j). Une promesse datée **après** la bascule est signalée (« tombe après la date de bascule »).

## 5. Calendrier et moteur de rappels
Échéances calculées : date de bascule (dj → 90 j, 180 j), fin de mois (déclassements), échéances de protocole (fiche 03), comité ; registre des moteurs (`engine registry`) pour relancer une analyse quand un fichier change.

## 6. Règles de réponse
- Toute comparaison N‑1 cite la date et le fichier de l'instantané utilisé.
- Sans historique : variations « non mesurables (aucun arrêté antérieur en mémoire) », proposer de joindre N‑1.
- Un arrêté en base locale (`eclBasis = LOCAL`) ne se compare pas à l'ECL : comparer les encours et impayés seulement.
