# Pré-Comité des Risques : TypeSafe + Blender

Exemple de reporting Credit Risk : on analyse les **commentaires libres des gestionnaires** avec TypeSafe (modèle Jev), puis on visualise le portefeuille en **3D avec Blender**.

| Étape | Qui décide | Contenu |
|---|---|---|
| Règles réglementaires | Code | Classe (sain / sensible / douteux) et Stage IFRS9 selon les jours d'impayés, couverture par la garantie |
| Jugements sur le texte | TypeSafe | 1 requête par dossier, 8 questions en parallèle : motif (Choice), perspective de remboursement (Score), restructuration, rupture de flux, fraude, garantie fragile, promesse datée, incohérence avec les chiffres (Noul) |
| Politique de risque | Code | Score d'alerte pondéré, SICR qualitatif (Stage 1 → 2), écarts de classe, actions proposées, revue analyste si la confiance est faible |
| Restitution | Code + Blender | `sortie/pre_comite.html` (autonome) et la vue 3D `sortie/portefeuille_3d.png` / `.glb` / `.blend` |

## Lancer

```bash
python3 pre_comite.py                 # appelle TypeSafe (TYPESAFE_API_KEY si hors proxy)
pip install bpy                       # Blender en module Python (Python 3.11)
python3 blender_3d.py                 # rendu 3D Cycles + export glTF
python3 pre_comite.py --depuis-cache  # régénère le rapport avec l'image 3D, sans réinférence
```

Modifier `POIDS` ou les seuils dans `pre_comite.py`, puis relancer avec `--depuis-cache`, ne coûte aucun appel API.

Les données de `portefeuille_demo.csv` sont fictives. Les seuils réglementaires sont simplifiés pour la démonstration.
