# Étude de 20 applications vidéo et d'animation (19/10/2026)

Demande de l'utilisateur (19/10/2026) : étudier 12 générateurs vidéo et 8 logiciels d'animation, puis dire ce que
MASSAMBA peut en apprendre.

**Méthode.**
- Seules les fonctions **publiques** sont étudiées : documentation officielle, notes de version, guides.
- Les logiciels propriétaires ne sont jamais décompilés. REA ne sert que sur du code libre (règle `rea-d-abord`).
- Blender est libre (GPL) : sa documentation et son code peuvent apprendre une méthode. Aucune ligne GPL n'est recopiée
  dans notre moteur, qui est sous licence MIT.
- Chaque trouvaille est reliée à un module de `moteur-troupe/` et à la porte de qualité qu'elle sert.

**Lecture des tableaux.**
- La colonne « Où en est MASSAMBA » distingue trois cas : déjà fait, à faire, ou « greffe en cours » (avec la mesure qui
  dira qu'elle est réussie).
- Les mentions « 7 références », « crochets », etc. viennent des pages citées en fin de document.

## 1. Générateurs vidéo (1 à 12)

| # | Application | Fonction publique étudiée | Ce que MASSAMBA en apprend | Où en est MASSAMBA |
|---|---|---|---|---|
| 1 | Runway | Gen-4.5 image→vidéo ; « Keyframes » (image de début et de fin) | Un plan génératif se cadre par ses images de bord | Nos images de départ sont déjà rendues par le moteur (circuit Grok allégé). **Greffe en cours** : plans de chute en début + fin avec Wan 2.2 (Apache-2.0, GPU gratuit). Mesure : saut au raccord nul (porte Q). |
| 2 | Luma Dream Machine | Images-clés début/fin ; référence de personnage à partir d'une image nette du visage | Avec une référence de personnage, la consigne décrit l'**action**, pas le personnage | Identité garantie par construction (les dessins de l'utilisateur sont la référence). Règle reprise dans les consignes des passes génératives. |
| 3 | Kling AI | *Motion Brush* (vecteurs sur une zone peinte) ; *Motion Control* (mouvement d'une vidéo de référence) ; 3 images ou plus contre la dérive du visage | Deux voies de mouvement : par zone, ou recopié d'un vrai corps | Déjà fait : mouvement réel transféré (BEAT2, CMU, banque du réel) ; décor vivant par zones (`decor_vivant.champ`). |
| 4 | Pika | *Pikaffects* : gonfler, fondre, exploser | Un effet physique exagéré au temps fort fait rire | **Greffe en cours** : léger « gonflement » de la tête (squash-and-stretch, 6 images) à la prise de choc. Mesure : porte P et signature TikTok. |
| 5 | PixVerse | Gabarits d'effets fixes, styles prédéfinis (anime, argile, BD) | Un effet figé reste reproductible d'un épisode à l'autre | Déjà fait : émojis animés et signature TikTok, à gabarit fixe. |
| 6 | Hailuo (MiniMax) | Mode réalisateur : commandes entre crochets combinables (« [Pan left, Truck right] ») ; un préréglage fiable vaut mieux que plusieurs mouvements empilés | Un vocabulaire court de commandes caméra, écrit dans le script | **Greffe en cours** : commandes caméra en crochets dans l'histoire, traduites en cadres par `tourne.cadre_t`. Mesure : porte A (rythme). |
| 7 | Vidu | Jusqu'à 7 références mêlées (personnage, style, composition, caméra, scène) | Séparer les références par rôle | Déjà fait : décor, acteurs et style viennent de fichiers distincts. |
| 8 | Higgsfield | Préréglages caméra : crash zoom, dolly zoom, whip pan, arc, grue, caméra à l'épaule… | Le crash zoom sur la chute est le geste comique de TikTok | **Greffe en cours** (#285, #334) : crash zoom de 0,15 s à la prise de choc et whip pan entre les sketchs. Mesure : porte A et rythme mesuré contre les TikTok de l'utilisateur. |
| 9 | Adobe Firefly | Image de début (et de fin) ; mouvement caméra recopié d'une **vidéo de référence** ; tailles de plan nommées | La caméra peut être recopiée d'un vrai TikTok | **Greffe en cours** : trajectoire caméra extraite d'un TikTok de l'utilisateur (flux optique global, OpenCV Apache-2.0) puis rejouée sur nos plans. Mesure : écart de mouvement caméra contre la référence (`mesure2.py`). |
| 10 | Kaiber | Images qui réagissent à la musique et suivent le temps | Couper et appuyer les gestes sur le temps de la musique | **Greffe en cours** : coupes et gestes forts calés sur les temps du tapis musical (104 BPM). Mesure : part des coupes à ±1 image d'un temps. |
| 11 | DomoAI | Transfert de style d'illustration | — | Non retenu : notre style est celui des dessins de l'utilisateur. |
| 12 | CapCut Web | Sous-titres automatiques, gabarits, frise du montage | Blocs de 3 mots, mot actif surligné | Déjà fait et dépassé : OpenCut (MIT) démonté par REA ; sous-titres karaoké par groupes de sens ; depuis le 19/10, temps réel de chaque mot tiré de Piper. |

## 2. Logiciels d'animation (13 à 20)

| # | Logiciel | Fonction publique étudiée | Ce que MASSAMBA en apprend | Où en est MASSAMBA |
|---|---|---|---|---|
| 13 | Blender (libre, GPL) | Os, IK, *drivers*, *shape keys*, superposition d'actions (NLA) | Superposer des actions par couches avec un poids | Déjà fait : couches de jeu (`jeu.py`). Méthode apprise sans copie de code. |
| 14 | Cascadeur | *AutoPhysics* : centre de masse obligatoire, trajectoire lissée, correcteur qui garde la pose ; entre-deux par IA (surtout locomotion) | Corriger le mouvement par la physique sans casser la pose | **Greffe en cours** : contrôle du centre de masse (buste penché toujours porté par l'assise ou les pieds) dans la porte K. Mesure : aucun centre de masse hors du polygone d'appui. |
| 15 | DaVinci Resolve | *Dialogue Leveler* (égalise la parole) ; *Voice Isolation* ; *Ducker* (niveau, montée, maintien, retour) | Garder le tapis baissé entre deux mots proches, pour éviter qu'il « pompe » | Déjà fait : ducking du tapis à −20 dB minimum sous la parole (WCAG). **Greffe en cours** : maintien et retour de type Ducker ; niveleur de dialogue avant le limiteur (v14 : limiteur actif plus de 3 dB sur 55,9 % de la parole). Mesure : réduction du limiteur au-dessus de 3 dB sur moins de 10 % de la parole. |
| 16 | Adobe After Effects | Marionnette par épingles (maillage triangulaire, peu d'épingles) ; courbes d'accélération ; flou de bougé | Peu de points de contrôle donnent une déformation plus naturelle | Déjà fait : marionnette ARAP (même famille de méthodes), flou de bougé physique, ressorts. |
| 17 | Adobe Character Animator | Visèmes tirés de la voix, clignement auto, respiration (respirations par minute), physique *dangle*, déclencheurs | Comportements automatiques empilés sur chaque personnage | Déjà fait : visèmes (Rhubarb), clignements, souffle, ressorts. |
| 18 | Reallusion iClone (AccuLips) | Texte + audio alignés mot à mot, puis visèmes ; coarticulation ; **sous-échantillonnage des clés de lèvres** pour un rendu moins mécanique | La bouche doit suivre le texte aligné, pas seulement le son | **Greffe en cours**, la plus utile : durées des phonèmes Piper (exactes, branchées le 19/10 pour les sous-titres) fusionnées aux visèmes Rhubarb, puis suppression des clés de moins de 60 ms. Mesure : porte B, bouche ouverte aux voyelles et fermée sur m, b, p. |
| 19 | Cartoon Animator | Tête 360° (quelques dessins clés + déformation) ; 9 dessins de bouche pour 16 formes ; lip-sync automatique | Peu de dessins suffisent si l'on déforme entre eux | Déjà fait : rotation de tête LivePortrait et bibliothèque d'expressions. Tête de rechange peinte : #329. |
| 20 | Moho | *Switch layers* avec interpolation (même nombre de points, donc transition douce) ; *Smart Bones* (l'angle d'un os pilote une déformation correctrice) ; dynamique d'os | Une déformation correctrice pilotée par l'angle du coude | **Greffe en cours** : forme correctrice du coude et de l'épaule pilotée par l'angle (os « intelligent »). Mesure : porte C, étirement p95 abaissé. |

## 3. Combinaison innovée (ce qui n'existe dans aucune de ces applications)

**AccuLips × Piper × juge des lèvres.** Le texte est déjà connu au moment de la synthèse. MASSAMBA prend donc les
durées de phonèmes que la voix a réellement utilisées pour fabriquer le son. iClone, lui, doit retrouver l'alignement
depuis l'audio.

Ces durées servent à trois choses :
- caler les sous-titres (fait le 19/10 : 22 répliques sur 22, chaque mot prononcé appareillé à son mot écrit) ;
- piloter la bouche (greffe en cours) ;
- donner au juge de la porte B les instants des voyelles et des m, b, p, indépendamment des visèmes qui animent la
  bouche : le contrôle cesse d'être circulaire.

**Kaiber × Higgsfield × Hailuo.** Le script porte des commandes caméra entre crochets. Chaque commande est posée sur un
temps de la musique, et le crash zoom tombe sur la prise de choc. Il en sort un montage rythmé, piloté par le texte,
reproductible et mesurable contre les TikTok de l'utilisateur.

## Sources

- Runway, aide Gen-4 (renvoie à Gen-4.5 et au module Keyframes) : [help.runwayml.com](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4) · guide de mouvement Gen-4.5 : [runware.ai](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- Luma, guide des modèles vidéo : [lumalabs.ai](https://lumalabs.ai/learning-center/articles/luma-video-models-field-guide) · Ray3 Modify : [businesswire](https://secure.businesswire.com/news/home/20251218399664/en/Luma-AI-Announces-Ray3-Modify-a-New-Model-for-Hybrid-AI-Workflows-for-Acting-Performances-Now-Available-in-Dream-Machine)
- Kling, Motion Brush et Motion Control (source tierce) : [atlascloud.ai](https://www.atlascloud.ai/blog/guides/kling-ai-motion-control)
- Vidu, référence vers vidéo : [vidu.com](https://www.vidu.com/en/ai-reference-to-video)
- Higgsfield, liste des préréglages DoP : [docs.florafauna.ai](https://docs.florafauna.ai/models/video-models/higgsfield-dop-by-higgsfield) · [higgsfield.ai](https://higgsfield.ai/blog/WAN-AI-Camera-Control-Your-Guide-to-Cinematic-Motion)
- Hailuo, modèle réalisateur : [runcomfy.com](https://www.runcomfy.com/playground/minimax/hailuo-video-01-director) · [getimg.ai](https://getimg.ai/blog/the-ultimate-guide-to-minimax-hailuo-ai-video-models)
- Adobe Firefly, guide vidéo : [adobe.com (PDF)](https://www.adobe.com/cc-shared/assets/pdf/business/teams/resources/whitepapers-ebooks/sdk/firefly-video-guide.pdf) · [redsharknews](https://www.redsharknews.com/adobe-firefly-expands-ai-video-tools-with-precision-editing-camera-control-and-firefly-video-editor)
- Kaiber et Pika (sources tierces) : [freebeat.ai](https://freebeat.ai/articles/8-best-kaiber-alternatives-for-ai-music-videos-beat-synced-visuals-and-social-content-in-2026) · [beatsyncpro.ai](https://beatsyncpro.ai/compare/beatsync-vs-pika)
- PixVerse, effets (source tierce) : [eachlabs.ai](https://www.eachlabs.ai/ai-models/pixverse-v4-5-effect) · [help.scenario.com](https://help.scenario.com/articles/4150848357-pixverse-models-the-essentials)
- iClone AccuLips : [reallusion.com](https://www.reallusion.com/iclone/lipsync-animation.html) · [manuel iClone 8](https://manual.reallusion.com/iClone-8/Content/ENU/8.0/50-Animation/Facial-Animation/Creating-Voice-Script-with-Accurate-Lipsync.htm)
- Moho, switch layers : [lostmarble.com](https://www.lostmarble.com/moho/manual/switch_layers.html)
- Cascadeur, AutoPhysics et entre-deux : [cascadeur.com](https://cascadeur.com/help/tools/physics_tools/autophysics) · [cascadeur.com (2025.1)](https://cascadeur.com/blog/view/cascadeur-20251-released-faster-animation-workflows-with-ai-inbetweening)
- Cartoon Animator : [creativeboom.com](https://creativeboom.com/resources/how-cartoon-animator-5-makes-it-easy-for-illustrators-to-become-2d-animators)
- Character Animator, comportements : [helpx.adobe.com](https://helpx.adobe.com/fi/adobe-character-animator/desktop/behaviors/behaviors.html)
- DaVinci Resolve, Ducker et niveleur : [davinciresolveclub.com](https://davinciresolveclub.com/davinci-resolve-audio-ducking/) · [dvresolve.com](https://dvresolve.com/tutorial/voice-isolation-dialogue-leveler-audio-tools/)
- After Effects, outils de marionnette : [helpx.adobe.com](https://helpx.adobe.com/fi/after-effects/desktop/animate-in-after-effects/animate-with-puppet-tools/animating-puppet-tools.html)
