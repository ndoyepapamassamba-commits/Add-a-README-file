# Film Autopilot — une idée, un film (direct_21)

**Une seule vue, un seul bouton « Créer ».** L'onglet *AI Film Studio* ouvre désormais le Film Autopilot ; l'ancien studio
multi-écrans reste accessible via « mode expert » (lien discret en haut à droite).

## Pipeline visible en temps réel
`IDÉE → HISTOIRE → SCÈNES → IMAGES → ANIMATION → MONTAGE FINAL` — chaque étape affiche son état (en cours, fait,
avertissement, en attente, échec) et une note. Par défaut l'Autopilot enchaîne tout seul ; l'option « Valider chaque
étape » le fait s'arrêter après chaque étape jusqu'à « Valider → suite ». « Relancer d'ici » reprend à une étape.

1. **Histoire** : histoire complète, personnages, décors (un seul modèle d'écriture, choisi par le plan).
2. **Scènes** : découpage, dialogues, émotions, caméra.
3. **Images** : références des personnages d'abord (continuité), puis chaque scène.
4. **Animation** : image → vidéo avec le modèle choisi si vous avez fixé un budget vidéo ; sinon animation 2.5D intégrée
   gratuite (caméra par plan, zoom sur qui parle, rebond sur la voix, fondus ; orbite en 3D).
5. **Montage final** : voix distinctes par personnage, musique sous les voix, sous-titres, montage, rendu vidéo
   téléchargeable.

## Par scène, seulement
✅ Accepter · ✏️ Modifier (action + dialogues, puis régénération ; « réécrire avec l'IA ») · 🔄 Régénérer ·
Modèle (choisir un autre modèle d'image pour cette scène) · Valider. Après des modifications : « Remonter le film ».

## Orchestrateur de modèles
Pour chaque étape (écriture, images, animation, voix), l'Autopilot classe les modèles **réellement disponibles** sur
4 axes : qualité, coût estimé pour tout le film, temps, fidélité Afrikatoon (ex. images de référence = personnages
identiques ; image → vidéo = style conservé). Il applique la meilleure recommandation (★) et vous laisse en choisir une
autre. La recommandation respecte le budget du film. **Qualité « a priori »** (famille du modèle) tant qu'elle n'est pas
**mesurée** sur vos productions (≥ 3 jugements) ; elle est alors remplacée par la mesure.

## Afrikatoon natif
Le Style DNA Afrikatoon (2D ou 3D) est verrouillé et injecté dans chaque génération, quel que soit le modèle :
proportions, expressions, palette ouest-africaine, environnements (Dakar, cours, marchés), négatifs (pas de logo, pas
de photoréalisme…).

## Coûts
Rien de payant sans budget : plafond du film (modifiable), et la vidéo IA payante demande un budget vidéo explicite
(0 = animation 2.5D gratuite). Les estimations affichées sont des estimations ; la dépense réelle s'affiche en haut.

## Limites honnêtes
- Sans budget vidéo, l'« animation » est une animation 2.5D d'images (caméra, parallaxe), pas une animation de personnages.
- La qualité par modèle est un a priori tant qu'elle n'a pas été mesurée sur vos films.
- Le rendu final se fait en temps réel dans le navigateur (un film de 3 min prend ≈ 3 min à rendre).
