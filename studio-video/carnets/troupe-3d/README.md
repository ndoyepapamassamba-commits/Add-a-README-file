# Troupe 3D — un dessin de planche → un personnage 3D riggé

## Voie 1 (par défaut, dans l'application, sans GPU, sans compte) : le dessin gonflé

Chaque planche dont le squelette a été mesuré (BlazePose, à l'import) devient un **corps 3D dans le navigateur**,
en une seconde, sans aucun service extérieur (casting → acteur → « Corps 3D (dessin gonflé) ») :

1. **Gonflage** de la silhouette du dessin en volume fermé (`coeur/studio/actor/inflate.ts`) — principe des
   modeleurs par croquis (Teddy, Igarashi 1999 ; Monster Mash, Dvorožňák et al. 2020) : champ de Poisson Δp = −1 à
   l'intérieur du contour, épaisseur √p (section ronde pour les parties rondes, elliptique pour les membres), avant +
   dos cousus sur le contour.
2. **Rig automatique** : les os (noms Mixamo) posés sur le squelette mesuré, poids de peau par **bone heat**
   (`boneHeat.ts`, Baran & Popović 2007 — le principe des « poids automatiques » de Blender), calculés sur la grille
   du dessin : un bras le long du corps reste au bras (la chaleur ne traverse pas le vide entre eux).
3. **Peau** : le dessin projeté sur le corps (`projectedSkin.ts`), sur les deux faces et la tranche ; le **visage
   dessiné** y est animé par le même warp que la planche plate (`faceWarp.ts` : lèvres, mâchoire, sourcils,
   paupières mesurés).
4. Le moteur le pilote comme tout modèle riggé (`GlbActor` : T-pose normalisée, retarget, jeu corps entier).

Limite connue (J2) : un bras dessiné **devant** le corps partage son volume avec lui ; levé, la robe se tend sous
lui (pas de calque séparé par membre — c'est la prochaine étape, à la Monster Mash : un calque par partie, le fond
inpainté derrière).

## Voie 2 (optionnelle, une fois par personnage, GPU gratuit) : reconstruction 3D neurale

Le moteur joue les personnages en **3D riggée** (squelette, gestes, rotations) tout en gardant **votre dessin comme peau**
(projection). La préparation 3D se fait **une seule fois par personnage**, hors application, sur un GPU gratuit
(Kaggle ≈ 30 h/semaine, Colab, Lightning) ou sur votre PC. Le résultat (un `.glb` riggé de quelques Mo) est importé
dans l'application (« Importer un .vrm / .glb riggé » dans le casting) ou embarqué dans le kit troupe.

## Étapes du cahier `troupe-3d.ipynb`

| # | Étape | Outil (licence) | Mémoire GPU |
|---|---|---|---|
| 1 | Découpe propre du dessin (pose neutre de la planche) | BiRefNet-lite (MIT) | 2 Go |
| 2 | Forme 3D texturée depuis l'image | **TRELLIS.2** (MIT) ≥ 24 Go — sinon **Pixal3D** (MIT) 16 Go — sinon **Hunyuan3D-2.1** (licence communautaire Tencent, hors UE/UK/Corée) 10 Go forme + 21 Go texture (`--low_vram_mode`) | selon la carte |
| 3 | Squelette humanoïde + poids de peau | **Make-It-Animatable** (MIT, humanoïdes) — sinon **UniRig** (MIT, 8 Go) | 8 Go |
| 4 | Contrôle (T-pose, hauteur, orientation) et export `.glb` | Blender 4.2 headless (GPL, outil) ou trimesh | CPU |

Le moteur reconnaît **tout squelette humanoïde** (Mixamo, VRM, UniRig, Make-It-Animatable, Rigify, Khronos) : aucun
renommage d'os n'est nécessaire (`coeur/studio/actor/rig3d.ts`).

## Exécution

1. Ouvrir `troupe-3d.ipynb` sur Kaggle (GPU T4 ×2 ou P100) ou Colab (T4) ; activer le GPU.
2. Déposer les dessins (`maman-nounou.jpg`, …) : la pose **neutre** de chaque planche, fond vert ou détouré.
3. Exécuter toutes les cellules : `out/<nom>.glb` par personnage (+ `out/<nom>.preview.png`).
4. Importer chaque `.glb` dans l'application (casting → acteur → « Importer un .vrm / .glb riggé »), ou le déposer
   dans `.private/troupe/3d/` et relancer la construction (embarqué, jamais commis : le dépôt est public).

## Choix selon le GPU disponible

- **T4 16 Go (Kaggle / Colab gratuit)** : Pixal3D ou Hunyuan3D-2.1 forme (10 Go) + texture en `--low_vram_mode` ;
  TRELLIS.2 ne tient pas (24 Go).
- **L4 / A10G 24 Go (Lightning, Colab Pro)** : TRELLIS.2 (meilleure géométrie, PBR).
- **Sans GPU** : les démos Hugging Face des mêmes outils (gratuites, manuelles) :
  `huggingface.co/spaces/tencent/Hunyuan3D-2.1`, `huggingface.co/spaces/jasongzy/Make-It-Animatable-v2`.
  Mesuré le 12/10/2026 sans compte : Hunyuan3D-2.1 refuse (durée GPU 270 s > quota anonyme), Hunyuan3D-2 « Turbo »
  5 pas rend une forme inexploitable (277 morceaux), puis le quota ZeroGPU anonyme tombe à 0 s (TripoSG, Make-It-
  Animatable refusés). Un compte Hugging Face gratuit (jeton dans le coffre de clés de l'application) élargit ce
  quota ; la voie 1 n'en a pas besoin.

## Ce que la projection du dessin corrige

La texture reconstruite est lissée et son dos est deviné : **de face, le moteur projette votre dessin original sur le
modèle** (fidélité totale, lèvres / yeux / sourcils du rig 2D mesuré) ; la texture 3D n'apparaît qu'aux angles,
fondue selon l'orientation. Les défauts de texture de la reconstruction n'ont donc pas à être retouchés.
