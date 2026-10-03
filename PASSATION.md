# Passation : TypeSafe, JEV et exports Credit Risk de PNDOYE

À lire en début de session, avec `CLAUDE.md`.

## État actuel (branche `claude/upbeat-wozniak-q8ux3c`)
- Application : `ECOBANK_Credit_Risk_OS_APEX_38.html`, 100 % hors ligne. Elle se reconstruit à l'identique avec
  `sh outils_export/build/build.sh` (base APEX 35 tirée de l'historique git).
- Agent EXPORT :
  - définition : `.claude/agents/export.md` ;
  - journal d'amélioration : `docs/EXPORT_AGENT_JOURNAL.md` ;
  - outillage dans `outils_export/` : construction, tests Playwright, jeux d'essai synthétiques, validateur Open XML.
- Enrichissement sur poste connecté (`typesafe-reporting/`) :
  - `impayes_typesafe.py`, avec les options `--demo`, `--lot`, `--fichier`, `--anonymiser`, `--depuis-cache`, `--modele-apprentissage` et `--apprentissage` ;
  - `typesafe_avance.py` : capacités avancées, scénarios et situations complexes de démonstration ;
  - `apprentissage.py` : boucle supervisée par les analystes ;
  - `demo_lot.py` : lot de démonstration à partir d'un lot APEX ;
  - `blender_export_art.py` : visuels 3D des exports et de l'app ;
  - `jev.py` : moteur Risk Outlook de référence en Python.
- Skill `ecobank-god-export-studio` : `typesafe-reporting/skill/SKILL.md`, sections 7 à 11. À recopier dans le skill synchronisé.

## APEX 38 — couche sémantique avancée partout, renommage, ultra 3D, apprentissage
- **Renommage** : les exports ne citent plus TypeSafe ni JEV (« Analyse sémantique », « RISK OUTLOOK »).
- **Ultra 3D** : graphiques natifs 3D, cellules et texte en relief, visuels Blender dans le hero, la navigation, les
  documents et l'interface de l'app.
- **La salle Risk Outlook (JEV) se recalibre seule** à chaque arrêté chargé : archive des arrêtés plus données du jour.
  Elle intègre les analyses avancées : structure par terme, temps avant défaut, guérison, IC bootstrap, backtest,
  stress inverse et sensibilité.
- **Exports Word, PowerPoint et PDF** au format Credit Risk Intelligence, depuis la même source `riModel`. Le menu
  Risk Intelligence et l'agent EXPORT embarqué les génèrent.
- **Couche sémantique**, selon les données présentes :
  - stress narratif sur 8 scénarios macro ;
  - bénéficiaires potentiellement liés ;
  - phrase de lecture du Comité et ordre des insights ;
  - action recommandée ;
  - famille de motif ;
  - stabilité ;
  - couverture complète dans AUDIT.

  Elle est présente dans l'Excel RI, le Word, le PDF, le PowerPoint, l'export Impayés (feuille « Stress narratif ») et la feuille sémantique de chaque salle.
- **Lot sémantique enrichi** (bouton « Lot ») : secteur, garantie, taille, trajectoire, plus un bloc portefeuille (constats,
  paires de noms, noms cités). `--anonymiser` masque les noms dans le commentaire, le plan et les constats, et retire les paires.
- **Apprentissage supervisé** : `--modele-apprentissage` écrit `sortie/a_valider.xlsx`. Une fois rempli par les analystes,
  `--apprentissage` alimente `sortie/memoire_apprentissage.json` : exemples joints aux consignes et seuils recalibrés.
  Le modèle lui-même n'est pas réentraîné.
- Démo de bout en bout sur les arrêtés synthétiques `N_..` (noms de groupe fictifs) :

  | Résultat | Valeur |
  |---|---|
  | Dossiers | 30, dont 27 commentés et 6 situations complexes |
  | Paires repérées | 5 (3 retenues, 2 pièges écartés) |
  | Phrase de lecture | constat 01 (confiance 0,83) |
  | Dossiers exposés à au moins un scénario | 16 (27 expositions) |

  Les exemples sont dans `exemples_risk_intelligence/`.

## En attente
- **Validation Conformité** avant d'envoyer des données réelles à l'API. D'ici là, `--anonymiser`.
- Le fichier `.xlsb` réel n'a pas été joint à la session : les démos utilisent des données synthétiques ou fictives.
- **Mémoire d'apprentissage vide** tant que les analystes n'ont pas validé un premier `a_valider.xlsx`.
- Idées suivantes : voir la fin de `docs/EXPORT_AGENT_JOURNAL.md` (PowerPoint sans erreur de schéma, allègement des
  exports de salles, calibrage du seuil d'exposition aux scénarios).

## Historique
- **APEX 35** : salle JEV Prospectif, retours TypeSafe (import `_TYPESAFE`, export du lot), 5 feuilles TypeSafe dans
  l'export Impayés 30-90 j, corrections des graphiques premium.
- **APEX 36** : moteur Credit Risk Intelligence (7 exports Excel natifs). Les provisions de l'historique sont désormais
  sur base IFRS 9, comme l'arrêté courant. Les anciens instantanés sont signalés dans AUDIT.
- **APEX 37** :
  - visual mastering (format de référence) ;
  - couche `pmBlue` (palette Blue Premium et feuille sémantique) sur tous les exports Excel des salles ;
  - questions urgence, routage, auto-cohérence et cohérence du plan.
