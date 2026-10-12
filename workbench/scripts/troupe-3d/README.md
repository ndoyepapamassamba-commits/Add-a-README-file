# Troupe 3D — un dessin de planche → un personnage 3D riggé (une fois par personnage, GPU gratuit)

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
renommage d'os n'est nécessaire (`server/jev/studio/actor/rig3d.ts`).

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

## Ce que la projection du dessin corrige

La texture reconstruite est lissée et son dos est deviné : **de face, le moteur projette votre dessin original sur le
modèle** (fidélité totale, lèvres / yeux / sourcils du rig 2D mesuré) ; la texture 3D n'apparaît qu'aux angles,
fondue selon l'orientation. Les défauts de texture de la reconstruction n'ont donc pas à être retouchés.
