# Étude technique — animation corporelle 3D « type Grok » pour le moteur MASSAMBA

*Octobre 2026. Toutes les mesures citées ont été faites dans ce projet ; les prix sont ceux publiés par les fournisseurs au moment de l'étude (à revérifier avant engagement).*

---

## 1. Diagnostic : pourquoi le moteur actuel ne peut pas atteindre seul Grok

| Le moteur 2.5D actuel (Marionnette) | Ce que fait Grok / Kling / Veo |
|---|---|
| Déforme les **pixels d'une image fixe** (maillage, calques, mâchoire) | **Génère de nouveaux pixels** à chaque image (modèle de diffusion vidéo) |
| Ne connaît que ce qui est visible : un bras caché derrière le corps n'existe pas | « Imagine » l'arrière du corps, les plis, les ombres, l'autre côté du visage |
| Mouvements limités à quelques degrés autour de la pose de l'image (au-delà : déchirures, halos) | Rotations du torse, pas, demi-tours, changements de posture complets |
| Aucune représentation 3D : pas de profondeur, pas d'occlusion, pas de contact au sol | Cohérence 3D implicite apprise sur des millions de vidéos |

**Conclusion.** Il manque deux briques qu'aucun réglage du warp ne peut apporter :
1. une **vraie représentation du corps** (squelette 3D articulé) ;
2. un **rendu capable de créer** les pixels que l'image ne contient pas.

Grok, Kling, Veo, Runway et Pika sont des modèles de diffusion vidéo (transformers de diffusion entraînés sur de très grands corpus). Ils ne « riggent » pas les personnages. Leurs modes de contrôle du mouvement (Runway Act-Two, Kling Motion Control, Wan-Animate) prennent une **image du personnage** et une **vidéo de mouvement**, puis génèrent le personnage qui exécute ce mouvement.

---

## 2. Benchmark détaillé

Notes de 1 à 5 (5 = meilleur). « Local » signifie exécutable sans GPU dédié dans l'app.

### Niveau 1 — Reconstruction 3D du personnage depuis une image

| Technologie | Ce que c'est | Qualité sur personnage cartoon | Limites | Intégration | Coût / vitesse | Local |
|---|---|---|---|---|---|---|
| **SMPL / SMPL-X** | Modèle paramétrique du corps humain (forme + pose, mains et visage pour -X) | 2 : corps humain réaliste, pas cartoon | Licence recherche (commercial payant), pas de vêtements | 3 | gratuit en recherche | oui (squelette) |
| **HMR 2.0 / 4D-Humans, PARE, PIXIE** | Estiment les paramètres SMPL(-X) depuis une photo | 2 : conçus pour de vrais humains ; proportions cartoon (grosse tête) mal estimées | GPU, licences recherche | 2 | GPU, ~0,1 s/image | non |
| **ECON, PHORHUM, PIFu** | Reconstruction d'humain habillé (surface implicite) | 2 : réaliste, lent, artefacts sur cartoons | Recherche, GPU, pas de texture fiable (PHORHUM non publié) | 1 | minutes/GPU | non |
| **TripoSR, InstantMesh, Wonder3D** | Image → maillage générique (objets) | 2–3 : silhouette correcte, visage et mains pâteux | Pas de squelette, pose figée | 3 | GPU (TripoSR tourne sur CPU, lentement) | partiel |
| **TRELLIS.2 (Microsoft, MIT), Hunyuan3D 2.1** | Image → maillage texturé haute qualité | 3–4 : bons assets stylisés | GPU 10–24 Go, pas de rig | 3 | ≈ 3–17 s sur H100 | non |
| **Meshy / Tripo (API)** | Image → 3D → **auto-rig** → animations | 3–4 : rapide, exploitable | Payant, rendu « jeu vidéo », visage peu expressif | 4 (API) | Meshy : image→3D 5–30 crédits, rig 5, animation 3 | non |
| **Character Creator** | Création manuelle de personnages riggés pro | 5 si fait par un artiste | Logiciel desktop, travail manuel | 1 | licence | non |

### Niveau 2 — Rig squelettique

| Technologie | Avantages | Limites | Intégration |
|---|---|---|---|
| **Squelette maison type SMPL (fait)** | Hiérarchie complète, IK, limites anatomiques, 0 €, déterministe, testé | À enrichir (doigts complets, blendshapes) | **intégré** |
| **UniRig (SIGGRAPH 2025, ouvert)** | Rigging automatique de n'importe quel maillage | GPU | moyenne |
| **Blender Rigify / Auto-Rig Pro** | Rigs pros, contrôleurs animateurs | Manuel / semi-manuel | Blender |
| **Mixamo** | Auto-rig + bibliothèque de mouvements | **Pas d'API officielle**, téléchargements manuels exigés par les conditions d'Adobe | faible (non automatisable proprement) |

### Niveau 3 — Pilotage par poses

| Technologie | Rôle | Remarque |
|---|---|---|
| **OpenPose / DWPose / RTMPose** | Squelette 2D (18 points + mains + visage) depuis une vidéo | DWPose est le standard des modèles pilotés par pose |
| **MediaPipe / BlazePose / MoveNet** | Pose 2D/3D en temps réel dans le navigateur | Utile pour capturer **votre propre jeu d'acteur** au téléphone |
| **YOLO-Pose** | Détection + pose rapide | Multi-personnes |
| **Notre moteur** | **Génère** directement la pose (pas besoin de la détecter) | La vidéo de squelette OpenPose est produite exactement, image par image |

### Niveau 4 — Animation et physique

| Technologie | Avantages | Limites |
|---|---|---|
| **Moteur maison (fait)** | Planificateur de pas, IK, émotions, gestes, regard, 0 € | Mouvements procéduraux (moins riches que la mocap) |
| **Texte → mouvement : HY-Motion 1.0 (Tencent, déc. 2025, 1 Md de paramètres), MoMask, MDM** | « se lève, marche, pointe du doigt » → mouvement SMPL naturel | GPU ; licence Tencent (exclut l'UE, plafond d'usage) |
| **Cascadeur** | Animation assistée par la physique (AutoPhysics) | Logiciel desktop, manuel |
| **DeepMotion / Rokoko Video** | Mocap depuis une vidéo | Payant, API ; utile pour capter un vrai acteur |
| **HumanIK** | Reciblage pro (Autodesk) | Écosystème Autodesk |

### Rendu génératif piloté par le mouvement (le chaînon qui donne la qualité Grok)

| Technologie | Entrées | Qualité | Coût | Statut |
|---|---|---|---|---|
| **Wan2.2-Animate (Alibaba, ouvert)** | image du personnage + vidéo de mouvement ; squelette spatialement aligné + traits du visage ; mode « move » et « remplacement » avec LoRA de ré-éclairage | 5 | fal.ai : 0,04 $/s (480p) à 0,08 $/s (720p) | **API fal + poids ouverts** |
| **Runway Act-Two** | performance + image (corps, mains, visage) | 5 | abonnement Runway | API Runway |
| **Kling Motion Control** | image + vidéo de mouvement | 5 | crédits Kling | API Kling |
| **Animate Anyone, MimicMotion, UniAnimate-DiT** | image + séquence de poses | 3–4 | GPU | recherche |

---

## 3. Recommandation unique

**L'ACTEUR VIRTUEL + TRANSFERT DE MOUVEMENT GÉNÉRATIF.**

> Un squelette 3D complet joue la scène (vraie physique de pas, IK, gestes, émotions, regard). Sa performance est rendue en mannequin 3D, puis **Wan2.2-Animate** la transfère au personnage de l'image de scène, qui exécute exactement ces mouvements avec un rendu génératif de qualité Grok.

Pourquoi cette architecture plutôt qu'une reconstruction 3D du personnage :
- **Qualité visuelle** : le rendu final est génératif. On garde le look Pixar de l'image (visage, vêtements, lumière), qu'un maillage reconstruit depuis une seule image dégrade toujours.
- **Contrôle total** : le mouvement vient d'un squelette dont nous maîtrisons chaque articulation. Ce n'est pas un « prompt » qu'on espère respecté.
- **Coût** : 0,04 à 0,08 $ par seconde, sans GPU à héberger. Les poids sont ouverts : on peut l'auto-héberger plus tard.
- **Robustesse** : sans clé ni réseau, l'acteur 3D reste visible en WebGL et la Marionnette 2.5D reste le secours.

Les autres briques (TRELLIS ou Meshy pour un vrai personnage 3D, HY-Motion pour le texte → mouvement, MediaPipe pour capter votre propre jeu) sont des **options qui s'enfichent** dans cette architecture. Ce ne sont pas des alternatives.

---

## 4. Architecture cible

```
Script (scène, répliques, [gestes], émotions)
        │
        ▼
DIRECTEUR D'ACTEURS ───► scripts squelettiques par personnage
        │                 (s'asseoir, se lever, marcher vers, tourner, saluer, pointer, hausser les épaules,
        │                  mains sur les hanches, émotions, regard)
        ▼
ACTEUR VIRTUEL (35 articulations type SMPL)
  • planificateur de pas (pieds posés, 0 glissement)
  • IK deux os (jambes, bras) + vecteurs de pôle
  • limites anatomiques, posture émotionnelle (Wallbott/Ekman), regard
  • [option V3] clips texte→mouvement (HY-Motion) / mocap téléphone (MediaPipe)
        │
        ├──► Rendu WebGL three.js (aperçu instantané, dans l'app)
        ├──► Rendu Blender (qualité film, côté serveur / poste)
        ├──► Vidéo de squelette OpenPose (signal de commande)
        ▼
TRANSFERT GÉNÉRATIF — Wan2.2-Animate (fal.ai ; auto-hébergeable)
  image du personnage + performance  ─►  personnage qui joue la scène (corps entier)
        │
        ▼
MONTAGE MAISON (format viral : bande + flou, sous-titres bilingues, stupeur, voix, lip-sync)
        │
        ▼
CONTRÔLE QUALITÉ RÉFÉRENCE (fidélité visuelle vs 041701 + vos TikTok, degré d'humour, potentiel viral)
```

---

## 5. Plan d'implémentation

| Étape | Contenu | État |
|---|---|---|
| **Quick wins** | Squelette 35 articulations, FK/IK, limites, planificateur de pas, gestes, émotions, regard ; tests | **fait** |
| **V1** | Directeur d'acteurs (scène → scripts) ; rendu WebGL dans l'app ; vidéo de performance + vidéo OpenPose ; connecteur Wan2.2-Animate (clé fal) ; contrôle qualité calé sur 041701 + TikTok ; juge d'humour dans l'autopilote | **fait** |
| **V2** | Mode « remplacement » de Wan-Animate (le personnage rejoue dans son décor d'origine) ; lip-sync audio (InfiniteTalk / Wan S2V) sur le visage ; caméra du monteur sur l'acteur 3D | à faire |
| **V3** | Texte → mouvement (HY-Motion / MoMask) pour des mouvements de mocap ; capture de votre jeu au téléphone (MediaPipe → squelette) | à faire |
| **V4** | Personnage 3D réel (TRELLIS.2 / Meshy + UniRig) quand on veut une 3D pure, rendu Blender en ferme de rendu | à faire |
| **Finale** | Auto-hébergement de Wan2.2-Animate sur GPU (coût marginal ≈ 0), banque de performances réutilisables, apprentissage des réglages qui font monter le score viral | à faire |

---

## 6. Prototype (POC) — résultats mesurés

**Script du POC (15 s).** Assis et triste → se lève → marche 3 m → tourne vers la caméra → salue avec joie → pointe du doigt en colère → hausse les épaules avec mépris → mains sur les hanches avec fierté.

| Contrôle (sur 376 images) | Résultat |
|---|---|
| Valeurs invalides (NaN) | 0 |
| Glissement d'un pied en appui | **0 mm** (600 images d'appui) |
| Genou plié à l'envers | jamais |
| Erreur de visée du doigt pointé | 0° |
| Assis → debout | bassin de 0,55 m à 0,93 m |
| Marche | les deux pieds se lèvent en alternance, distance atteinte à moins de 5 cm |

**Rendu Blender.** Personnage maillé, skinné sur le squelette (34 groupes de poids automatiques), avec tête, yeux, sourcils et bouche à formes clés pilotés par les émotions. Moteur Cycles, environ 6,5 s par image sur 4 cœurs CPU.

**Limite du POC.** Le transfert génératif (Wan2.2-Animate) demande une clé fal.ai, que ce POC n'a pas. Ce maillon n'a donc **pas été exécuté** ici. Il est branché dans l'app et se déclenche dès que la clé est renseignée.

---

## Sources
- Wan-Animate (arXiv 2509.14055) : https://arxiv.org/abs/2509.14055v1
- fal.ai — Wan 2.2 Animate Move : https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/move
- Comparatif de prix Wan 2.2 Animate : https://aireiter.com/blog/wan2-2-animate-guide
- HY-Motion 1.0 (arXiv 2512.23464) : https://arxiv.org/abs/2512.23464 · https://huggingface.co/tencent/HY-Motion-1.0
- UniRig (SIGGRAPH 2025) : https://github.com/VAST-AI-Research/UniRig
- Meshy, tarifs de l'API : https://docs.meshy.ai/en/api/pricing
- TRELLIS.2 : https://www.codesota.com/news/trellis-2-3d-generation
- Runway Act-Two : https://www.aiwiki.ai/wiki/runway_act_two
- Mixamo et API (forum Adobe) : https://community.adobe.com/questions-696/is-there-any-way-to-use-mixamo-to-rigging-model-via-api-589777
