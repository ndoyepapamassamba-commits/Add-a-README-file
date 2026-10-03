# Passation : TypeSafe, JEV et exports Credit Risk de PNDOYE

À lire en début de session, avec `CLAUDE.md`.

## Livré sur `claude/upbeat-wozniak-q8ux3c`
- `ECOBANK_Credit_Risk_OS_APEX_36.html`. C'est APEX 34 plus les ajouts suivants :
  - salle **JEV Prospectif** (bouton dans la barre) ;
  - import des **retours TypeSafe** (« ⇪ Retours TypeSafe ») et export du **lot** (« ⇩ Lot TypeSafe ») ;
  - 5 feuilles TypeSafe dans l'export Impayés 30-90 j, avec les colonnes Commentaire et Statut du suivi remplies au retour ;
  - correction des défauts visuels des graphiques premium.
- `typesafe-reporting/impayes_typesafe.py` : enrichissement sur le poste connecté (`--demo`, `--lot`, `--fichier`, `--anonymiser`, `--depuis-cache`).
- `typesafe-reporting/jev.py` : moteur JEV de référence en Python, démo sur un historique synthétique de 18 mois.
- `typesafe-reporting/skill/SKILL.md` : skill `ecobank-god-export-studio` mis à jour (sections 7 et 8) ; à recopier dans le skill synchronisé.
- Démos : `typesafe-reporting/sortie/Impayes_30-90j_TypeSafe_demo.xlsx` et `JEV_Risque_Prospectif_demo.xlsx`. Tous les noms et commentaires sont fictifs.

## En attente
- **Validation Conformité** pour envoyer des données réelles à l'API.
- Le fichier `.xlsb` réel n'a pas été rejoint à la session : la démo utilise une copie anonymisée de structure équivalente.
- Exemples générés sur 9 arrêtés de test : `exemples_risk_intelligence/`.

## Credit Risk Intelligence (APEX 36)
- Bouton « Risk Intelligence » → 7 exports Excel premium natifs (voir `CLAUDE.md`).
- Correction APEX : les provisions de l'historique sont maintenant calculées sur base IFRS 9, comme l'arrêté courant. Avant, la provision locale BCEAO était utilisée. Les anciens instantanés sont signalés dans AUDIT et exclus des variations de provisions jusqu'à leur rechargement.
- Pistes suivantes :
  - afficher le même modèle à l'écran (vue HTML) ;
  - porter la palette Blue Premium dans le moteur `pm*` des autres salles ;
  - champ « Agence » : absent de l'ACTE 7, remplacé par le segment.
