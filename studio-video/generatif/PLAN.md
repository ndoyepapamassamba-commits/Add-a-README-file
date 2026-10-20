# Chaîne générative « type Veo 3 » (20/10/2026)

Consigne : « il y a un manque notoire de fluidité des gestes et de cohérence […] changer complètement d'approche […] des
vidéos genre Veo 3 en termes de fluidité et de rendu […] générer des plaques, les images et les scènes adaptées et refaire
tout proprement par des greffes mesurées ».

## Diagnostic (mesuré)

- **Pourquoi les gestes manquent de fluidité.** Les marionnettes changent de corps par poses entières : 47 changements de
  pose sur l'épisode 1 (p5). Un dessin ne contient pas le mouvement entre deux poses.
- **Ce que font Veo 3, Grok ou Kling.** Ils génèrent chaque image avec un modèle qui a appris le mouvement sur des millions
  de vidéos. Aucune retouche de nos planches n'y mènera.
- **Ce qui marche déjà dans notre moteur** (juge unique 9/9) : la mise en scène.
  - décors propres ;
  - tailles et places des personnages ;
  - cadrage, voix, son, sous-titres ;
  - position exacte de chaque personnage.

## Architecture : mise en scène déterministe + mouvement génératif

| Étape | Outil | Licence | Statut |
|---|---|---|---|
| 1. Image clé par plan, au format exact du modèle (1056×864 → 704×576 sans recadrage) | `plan_generatif.py` + `tourne_peint.py` | maison | fait : 15 plans, 70,4 s, 100 % de la parole liée à une personne visible, 45 s |
| 2. Mouvement : lèvres, tête, buste, mains, à deux, piloté par les voix | InfiniteTalk (MeiGen-AI) sur Wan2.1-I2V-14B-480P | Apache-2.0 (code et poids) | `modal_studio.py` prêt, lancement dès que la carte gratuite est branchée |
| 3. Accélération 4 à 6 pas | LoRA lightx2v I2V 480p rang 64 | Apache-2.0 | dans `modal_studio.py` |
| 4. Couleur, 30 i/s, trajet de caméra rejoué, lèvres mesurées pour le juge | `assemble_generatif.py` (RIFE MIT, MediaPipe Apache-2.0) | MIT / Apache-2.0 | fait, essai de branchement réussi |
| 5. Montage, son, sous-titres, export, juge unique | chaîne existante (`usine.py generatif`) | maison | inchangée |

Point lu dans le code, qui piège le branchement d'InfiniteTalk (`wan/multitalk.py`, l. 592-601) : `human_mask[x_min:x_max, y_min:y_max]`.
- La « bbox » d'InfiniteTalk s'écrit donc **[haut, gauche, bas, droite]**, et non dans l'ordre usuel.
- Notre moteur fournit ce masque au pixel près ; le modèle n'a plus à deviner qui parle.

Expertise tirée d'un dépôt sans licence (consigne du 20/10/2026) : l'exemple InfiniteTalk de Kijai (ComfyUI-WanVideoWrapper).
- Il utilise la même LoRA lightx2v.
- Ses réglages sont 6 pas et un décalage de 11, contre 4 pas et un décalage de 2 dans le README.
- Les deux réglages seront départagés par la mesure sur le premier plan.

## Puissance de calcul (mesurée le 20/10/2026)

| Voie | Résultat |
|---|---|
| Conteneur | 4 processeurs, aucune carte graphique. Pour mémoire, FLUX.2 klein met 650 s par image en 576×448 : la vidéo n'est pas faisable ici. |
| Cartes ZeroGPU de Hugging Face, sans compte | refus immédiat : « You have exceeded your ZeroGPU runs limit » |
| Démo officielle Wan2.2-S2V | aucune réponse en 15 min |
| Démo officielle Wan2.1 | bloquée sur « Generating » pendant 25 min |
| **Modal**, compte gratuit de l'utilisateur | 30 $ de crédits par mois, soit environ 7,5 h de H100. API joignable depuis ici, client Modal 1.6.2 installé. |

Le plafond est **dur et appliqué par le code** : avant tout lancement, le dépensé du mois plus l'estimation doivent rester
sous `STUDIO_PLAFOND_USD` (25 $ par défaut). La dépense mesurée est tenue dans un dictionnaire Modal. Les plans d'un
épisode partent en parallèle.

## Ce qu'il faut à l'utilisateur, une fois

1. Créer un compte Modal gratuit et un jeton.
2. Ajouter `MODAL_TOKEN_ID` et `MODAL_TOKEN_SECRET` dans les secrets de l'environnement : menu de l'environnement cloud,
   puis Modifier. Jamais dans le chat.

Une nouvelle session lit les secrets.

## Ordre des essais dès que la carte est branchée

1. `modal run modal_studio.py::telecharge` : les poids vont dans le volume, sans carte graphique.
2. Un seul plan (plan-01, duo du maquis), deux réglages : (4 pas, décalage 2) contre (6 pas, décalage 11).
   - Mesures : secondes, coût, lèvres et voix (porte A), fluidité (porte E), identité contre l'image clé.
3. L'épisode entier en parallèle, puis le juge unique et la comparaison avec p5 et p6 (marionnettes).

## Greffes suivantes, déjà choisies

- **Plaques et scènes adaptées** pour les lieux absents de la bibliothèque : Qwen-Image-Edit-2509 ou FLUX.2 klein, Apache-2.0,
  sur la même carte. Le résultat est jugé par nos contrôles d'échelle et de propreté.
- **Plans de réaction sans parole** : Wan2.2-I2V-A14B, Apache-2.0, piloté par la consigne de jeu.
- **Identité gardée d'un plan à l'autre** : mesure par plan contre l'image clé, avec un seuil à fixer après les premiers plans.
