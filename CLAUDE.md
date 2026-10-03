# Consignes permanentes de PNDOYE

## TypeSafe dans tout ce qui est produit
- Chaque application, reporting ou export construit pour PNDOYE intègre une couche **TypeSafe** (modèle `jev-latest`, `POST https://api.typesafe.ai/v1/systemone`). Charger le skill `typesafe:typesafe-ai` et lire la documentation en ligne avant d'écrire l'intégration.
- Le code garde les règles, les calculs et les classements réglementaires (BCEAO, IFRS9, ACTE7). TypeSafe ne fait que des jugements sémantiques sur le texte et le contexte : motif, signal, cohérence, priorité, choix d'une phrase de lecture.
- Ne jamais demander à TypeSafe de produire un montant ou un ratio. Les chiffres viennent toujours du code.
- Toujours conserver les réponses brutes : probabilités, confiance, modèle et date. Elles servent à la piste d'audit et permettent de réappliquer d'autres seuils sans nouvel appel.
- Si la confiance est faible, le dossier part en revue analyste au lieu de recevoir une décision automatique.

## Apps HTML offline (charte « GOD 3D » BLUE ECOBANK)
- Les postes bancaires n'ont pas Internet et la clé API ne doit jamais être écrite dans un fichier HTML.
- TypeSafe passe donc par une étape d'enrichissement sur un poste connecté, ou par un relais serveur. L'app lit les résultats (feuille `_TYPESAFE`) quand ils existent et fonctionne sans eux sinon.
- Chaque export (Excel, PowerPoint, Word, mail) affiche la couche TypeSafe : signaux, confiance, dossiers à revoir et méthodologie.
- Les données clients réelles ne partent vers l'API qu'après validation de la Conformité. Sinon, les envoyer anonymisées.

## Moteur Credit Risk Intelligence (exports Excel premium natifs, depuis APEX 37 ; version actuelle APEX 38) — FORMAT DE RÉFÉRENCE
- Bouton **Risk Intelligence** : 7 exports issus d'une **source analytique canonique unique** (`riModel`) : Complet, Executive (Comité), Risk, Watchlist, Action plan, Audit, Data.
- Identité **ECOBANK BLUE PREMIUM** (`#003DA5`, Deep `#001B4D`, Bright `#2563EB`, Cyan `#06B6D4`, Gold `#C8A951` ; succès / vigilance / alerte / critique `#16A34A` `#F59E0B` `#F97316` `#DC2626`). Chaque couleur a un sens : bleu = structure, cyan = mouvement, or = stratégique, vert = amélioration, orange = vigilance, rouge = criticité.
- Classeur généré nativement par `rxBook` (Open XML écrit à la main) : graphiques natifs, sparklines, mises en forme conditionnelles, navigation, impression A4/A3. Aucune image, fichier léger. Il est marqué `APEX-RI` : `pmXlsx` le reconnaît comme déjà premium et le laisse intact. Il passe quand même par `pmFinish`.
- Contrôles automatiques à chaque génération, restitués dans la feuille AUDIT : rapprochement avec les agrégats APEX, pont des impayés bouclé, tranches, doublons, NaN, base IFRS 9 des provisions historiques.
- **Format de référence pour tout export futur** : le moteur Risk Intelligence (ECOBANK VISUAL MASTERING) remplace l'ancien format. Il comprend :
  - hero (date longue, filet or) ;
  - navigation à icônes ;
  - bandeau de statut (santé, JEV, TypeSafe, contrôles) ;
  - cartes KPI à ombre portée et statut ;
  - callouts ;
  - sections numérotées en or ;
  - graphiques sans cadre ;
  - Movement narratif ;
  - Risk Action Center ;
  - insights en cartes.
- **Tous les exports Excel des salles** passent par `pmBlue` (dans `pmFinish`) :
  - remappage de la palette historique vers Blue Premium ;
  - ajout d'une feuille « TypeSafe » (jugements, confiance, revues, orientation, PD JEV et provenance) quand le classeur n'a pas déjà sa couche TypeSafe.
- **TypeSafe à fond**, en un seul appel par dossier (éventail spéculatif) :
  - motif, promesse, crédibilité, incohérence, statut ;
  - urgence (re-classement) et orientation (routage) ;
  - auto-cohérence : motif (Choice) contre durabilité (Noul) ; une divergence envoie le dossier en revue analyste ;
  - cohérence entre le plan d'action APEX et la cause décrite ;
  - noms des clients : nature de l'entité, intra-groupe, segment douteux.
- **JEV dans chaque feuille** :
  - PD 12M par client avec sa provenance (Watchlist, Actions, Top risks) ;
  - Forward view (Movement), callout Outlook (Executive), insight 07 ;
  - tableau de couverture JEV et TypeSafe dans AUDIT.

## Noms internes, ultra 3D et agent EXPORT (APEX 38)
- **Nos outils restent entre nous.** Aucun export (Excel, Word, PowerPoint, PDF, mail) ne cite TypeSafe, JEV ni jev-latest. Les noms affichés sont :
  - « Analyse sémantique » (feuille `_SEMANTIQUE`) ;
  - « RISK OUTLOOK » / « Risk Outlook » ;
  - « moteur sémantique ».

  Le renommage passe par `expScrub` / `expScrubTxt` (table `EXP_NAMES`). Il ne touche jamais aux `.rels`, à `[Content_Types].xml` ni aux images base64.
  - La version exacte du modèle s'affiche « moteur sémantique v1.13.0 » : elle reste traçable, sans le nom interne.
  - Dans l'app, et entre PNDOYE et Claude, les vrais noms restent.
  - Le classeur d'enrichissement du poste connecté est un fichier technique interne : sa feuille `_TYPESAFE` est le contrat de lecture avec APEX, qui accepte aussi `_SEMANTIQUE`. Ce sont les exports d'APEX qui sont diffusés.
- **Ultra 3D partout** :
  - graphiques natifs 3D (barres 3D, biseaux, ombres, bulles 3D) ;
  - cellules en relief et texte ombré dans Excel ;
  - visuels 3D équivalents dans Word, PDF et PowerPoint ;
  - visuels Blender (`typesafe-reporting/blender_export_art.py`) dans le hero des exports et dans l'app, avec la couche `app3d.css`.
- **Agent EXPORT** : tout travail d'export passe par `.claude/agents/export.md`.
  - La chaîne de construction reproductible, les tests et les jeux d'essai synthétiques sont dans `outils_export/`.
  - Chaque passage ajoute une entrée à `docs/EXPORT_AGENT_JOURNAL.md`.
  - Dans APEX, `EXPORT_AGENT` journalise chaque export et l'inspecte : valeurs invalides, ancienne charte, couche sémantique, noms internes, poids. Il propose aussi des améliorations.
- **Moteur sémantique à fond, selon les données présentes** :
  - par dossier : famille avec repli, action recommandée, contrôle d'ordre des options, stabilité (3 tirages avec sel), données sensibles, date par composants et 8 scénarios macro (stress narratif) ;
  - par portefeuille, en un appel : importance des constats, phrase de lecture du Comité et bénéficiaires potentiellement liés (Score + Noul ; « Lien probable » seulement si les deux concordent) ;
  - les démos utilisent toujours des situations complexes (plusieurs causes, plusieurs scénarios). Montants, agrégats et entrées en douteux attendues sont calculés par le code.
- **Découvertes API (jev-1.13.0)** :
  - trois types de questions : choice (255 options au plus), score (10 niveaux au plus) et noul ;
  - consignes structurées acceptées (objets, listes d'exemples) ;
  - français aussi fiable que l'anglais ; ordre des options sans biais mesuré ;
  - un sel dans l'état permet de rééchantillonner ;
  - la version exacte et les jetons sont conservés ;
  - dates et calculs restent toujours en code ;
  - un identifiant de choix « 01 » peut revenir numérique : normaliser.
- **Apprentissage supervisé** : le modèle n'est pas réentraîné. Ce sont les consignes et les seuils qui apprennent (`typesafe-reporting/apprentissage.py`) :
  - `a_valider.xlsx` → mémoire d'exemples validés par les analystes ;
  - 2 exemples par option, 12 au plus, noms masqués ;
  - seuils recalibrés dès 10 cas (90 % d'accord, plancher 0,40).
- **Risk Outlook avancé**, chaque résultat avec sa provenance :
  - structure par terme ;
  - temps moyen avant défaut ;
  - guérison ;
  - IC bootstrap ;
  - backtest + Brier ;
  - stress inverse ;
  - sensibilité.
