---
name: boite-a-outils
description: Utilitaires fichiers sûrs — doublons (SHA-256), ce qui prend de la place, inventaire avec empreintes, renommage en masse avec aperçu et annulation, comparaison de deux versions d'un Excel/CSV par clé, fusion et découpage de fichiers, réparation d'encodage (Ã©). Déclencheurs : « doublons », « fais de la place », « renomme », « compare ces deux fichiers », « qu'est-ce qui a changé », « fusionne », « découpe par agence », « caractères bizarres ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🧰"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    install:
      - kind: uv
        package: openpyxl
---

# Boîte à outils

Script : `py {baseDir}\scripts\outils.py <action> …` — détails avec `--help`.

| Besoin | Commande |
|---|---|
| Fichiers en double | `outils.py doublons C:\Users\moi\Documents` |
| Faire de la place | `outils.py taille C:\Users\moi\Downloads --top 20` |
| Inventaire (preuve, audit) | `outils.py inventaire dossier --sortie inventaire.csv` |
| Renommer en masse | `outils.py renommer dossier --motif "IMG_(\d+)" --par "sketch_\1"` puis `--appliquer` |
| Annuler un renommage | `outils.py annuler dossier\journal_renommage_….csv` |
| Ce qui a changé entre deux arrêtés | `outils.py comparer sept.xlsx oct.xlsx --cle "Compte" --sortie ecarts.csv` |
| Empiler des fichiers | `outils.py fusionner agence1.xlsx agence2.xlsx --sortie tout.csv` |
| Un fichier par agence | `outils.py decouper tout.xlsx --cle "Agence" --dossier par_agence` |
| Réparer les accents | `outils.py encodage fichier.csv --convertir` |

## Règles de sécurité
1. **Rien n'est supprimé par le script.** Pour les doublons, montrer la liste, laisser l'utilisateur choisir, puis
   déplacer vers la Corbeille (jamais `del`/`rm` définitif) après un « oui ».
2. **Renommage : aperçu obligatoire**, montré à l'utilisateur, puis `--appliquer` seulement après accord. Le script
   refuse collisions, noms invalides et écrasements ; le journal permet d'annuler.
3. Dossiers système (`C:\Windows`, `Program Files`, `AppData`), `.git` et dossiers cachés : ne pas toucher.
4. Les sorties de `comparer`/`decouper` contenant des données clients restent locales ; pour les envoyer, passer par
   `export-securise`.
