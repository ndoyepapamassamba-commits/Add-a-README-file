# Outils d'export APEX — chaîne de construction et de contrôle

Ce dossier rend les exports d'APEX reconstructibles et vérifiables d'une session à l'autre. Il sert d'outillage à
l'agent EXPORT (`.claude/agents/export.md`).

## Reconstruire l'application

```sh
sh outils_export/build/build.sh /tmp/apex_build /tmp/apex_build/apex.html
```

- La base est APEX 35, tirée de l'historique git (`git show 3c018ee:ECOBANK_Credit_Risk_OS_APEX_35.html`).
- Les étapes s'enchaînent dans cet ordre :
  1. `ri_master.py` : mastering Credit Risk Intelligence ;
  2. `ri_3d.py` : relief 3D, graphiques natifs 3D, texte ombré ;
  3. `ri_img.py` : visuels Blender dans le hero, la navigation et les documents ;
  4. `ri_ts.py` : couche sémantique avancée et analyses avancées dans Excel, Word, PDF, PowerPoint et les salles ;
  5. `inject_ri.py` : injection dans APEX, puis `ts_apex.py` (lecture des retours, lot enrichi, feuilles Impayés et Risk Outlook).
- La construction est reproductible : sans modification des sources, l'empreinte SHA-1 est identique à celle de
  l'APEX livré.
- Les visuels Blender (`typesafe-reporting/sortie/art_*.jpg`) se régénèrent ainsi :
  ```sh
  python3 typesafe-reporting/blender_export_art.py 48
  ```
  Cette commande demande `pip install bpy`.

## Tester

Prérequis : Node 22 et Playwright avec Chromium (`PLAYWRIGHT` = chemin du module s'il n'est pas dans
`/opt/node22/lib/node_modules/playwright`).

```sh
cd outils_export/fixtures && python3 noms_demo.py && cd -     # crée N_01..N_09 (noms de groupe fictifs)
export APP=/tmp/apex_build/apex.html FIXDIR=$PWD/outils_export/fixtures FIX=N_
OUT=/tmp/rx node outils_export/tests/t70.js outils_export/fixtures/retour_semantique_demo.xlsx   # tous les formats
OUT=/tmp/lot node outils_export/tests/t80.js                                                    # lot sémantique
node outils_export/tests/t81.js outils_export/fixtures/retour_semantique_demo.xlsx              # diagnostic du modèle
OUT=exemples_risk_intelligence node outils_export/tests/exemples.js outils_export/fixtures/retour_semantique_demo.xlsx  # exemples
```

Validateur Open XML (0 erreur exigée pour .xlsx et .docx) :

```sh
cd outils_export/validateur && dotnet build -c Release -o out && dotnet out/val.dll /tmp/rx/<fichier>
```

Rendu visuel :

```sh
soffice --headless --convert-to pdf <fichier.xlsx>
```

Inspecter ensuite les pages (pymupdf).

## Jeux d'essai

Toutes ces données sont synthétiques ou fictives.

- `M_01..M_09.xlsx` : neuf arrêtés ACTE 7 synthétiques (2 500 lignes, SOCIETE 0000…, comptes L0000000…).
- `noms_demo.py` → `N_..` : dix grands clients renommés en noms de groupe fictifs. On y trouve trois vraies paires (BAOBAB,
  KORA, TERANGA) et deux pièges qui ne partagent qu'un mot géographique (SAHEL, NIAYES).
- `lot_demo.json` : lot exporté par APEX (`tsLot`), avec les commentaires et secteurs fictifs de
  `typesafe-reporting/demo_lot.py`. Il contient 30 dossiers (27 commentés, dont 6 situations complexes), 8 constats et 5 paires.
- `retour_semantique_demo.xlsx` : retour enrichi par l'API (modèle jev-1.13.0) à partir de `lot_demo.json`.

## Cycle complet sur poste connecté

```sh
python3 typesafe-reporting/demo_lot.py Lot_TypeSafe_Impayes_<date>.json          # démo uniquement
python3 typesafe-reporting/impayes_typesafe.py --lot lot_demo.json --sortie Retour.xlsx [--anonymiser] [--modele-apprentissage]
python3 typesafe-reporting/impayes_typesafe.py --apprentissage sortie/a_valider.xlsx   # après validation des analystes
```

Sur données réelles, tant que la Conformité n'a pas validé, `--anonymiser` est obligatoire.
