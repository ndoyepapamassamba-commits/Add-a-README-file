# Bibliothèque d'images des personnages et décors

Le moteur `photo` anime ces images (respiration, balancement, bouche synchronisée sur la voix, caméra).
La qualité des vidéos = la qualité de ces images. À générer une seule fois, puis réutilisées à l'infini.

## Personnages : `characters/<NOM>/`

Pour chaque personnage, **5 images**, même personnage, même tenue, même cadrage :

| Fichier | Expression |
|---|---|
| `neutral.png` | neutre / content, bouche fermée |
| `angry.png` | en colère, doigt pointé |
| `shock.png` | choqué, yeux exorbités, bouche fermée ou entrouverte |
| `smug.png` | mauvaise foi, sourire en coin, paumes ouvertes |
| `laugh.png` | mort de rire |

Règles de génération (à mettre dans votre prompt) :
- **Plein pied (de la tête aux pieds)**, personnage seul, centré, **de trois quarts tourné vers la droite**.
- **Fond uni vert vif (#00FF00) ou transparent** (détourage automatique de toute façon).
- Format vertical 2:3, au moins 1024 × 1536 px.
- Même style 3D cartoon Pixar que la galerie, même lumière chaude.
- **Bouche fermée** de préférence (le moteur l'ouvre lui-même en rythme avec la voix).
- Aucun texte, aucun panneau dans l'image.

Prompt type :
> 3D Pixar-style cartoon, full body, single character standing, three-quarter view facing right,
> plain bright green background, no text. [DESCRIPTION DU PERSONNAGE], [EXPRESSION], mouth closed,
> warm lighting, high detail, vertical 2:3.

`meta.json` (créé automatiquement par `python run.py assets importer`, à défaut à la main) :
`{"neutral": {"mouth": [x, y], "mouth_w": 40, "faces": "right"}, ...}`

## Décors : `backgrounds/<decor>.png`

Un décor **vide (sans personnage)**, vertical 9:16, même style 3D, pour chacun :
cour, salon, plage, marche, village, ceremonie, hopital, ecole, maquis, taxi, salon_coiffure.

> 3D Pixar-style cartoon background, empty [DÉCOR] in West Africa, no people, no text,
> warm sunlight, vertical 9:16, depth of field.
