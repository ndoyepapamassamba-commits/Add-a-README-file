# Portraits parlants et transfert de mouvement, liste 3 : EchoMimicV2/V3, Hallo, Hallo2, Hallo-Live, AniPortrait, AniTalker, DreamTalk, FOMM, TPSM (état au 16/10/2026)

Méthode : les 9 dépôts GitHub et Hallo-Live ont été clonés en lecture seule (`git clone --depth 1`) le 16/10/2026 ; les fichiers LICENSE, README, scripts d'inférence, `requirements.txt` et configurations ont été lus directement. Les licences des poids viennent de l'API Hugging Face (`/api/models/<id>` : étiquette `license:` + liste des fichiers). L'état des Spaces vient de l'API Hugging Face (`/api/spaces/<id>`, champ `runtime.stage`) lue le 16/10/2026. Les nœuds ComfyUI viennent de la liste officielle de ComfyUI-Manager (6 026 entrées), et chaque dépôt de nœud a été cloné pour lire sa licence et son dernier commit. Aucune donnée de l'utilisateur dans les requêtes. Rien n'a été poussé.

Règle maison appliquée : code ET poids ET composants exécutés en MIT, Apache-2.0 ou BSD, usage commercial permis. Marques : **[NC]** = clause non commerciale ; **[RAIL]** = CreativeML OpenRAIL-M (commercial permis mais licence hors liste maison, restrictions d'usage héritées par les dérivés) ; **[RECH]** = mention « recherche / académique » sans licence claire des poids ; **[PROV]** = risque de provenance (code dérivé d'un code sous licence plus restrictive).

---

## 1. Licence exacte du code, de chaque poids et de chaque dépendance

### Takeaway
Sur les dix outils, **un seul passe la règle maison de bout en bout : EchoMimicV3** (code, poids et modèle de base en Apache-2.0, encodeurs audio Apache/MIT). **FOMM** a un code MIT (depuis le 06/06/2023), mais ses poids publiés n'ont pas de licence et ont été entraînés sur VoxCeleb (« research purposes »). Il est donc utilisable seulement **ré-entraîné sur nos propres rendus**. Tous les autres sont bloqués par un composant : InsightFace [NC] (Hallo, Hallo2), MMAudio [NC] (Hallo-Live), SD 1.5 [RAIL] (Hallo, Hallo2, AniPortrait, probablement EchoMimicV2), LIA [NC]/[PROV] (AniTalker), points de contrôle « academic only » (DreamTalk), code dérivé de MRAA sans licence [PROV] (TPSM).

### Cited Findings

**EchoMimicV2 (antgroup/echomimic_v2)**
- Code : Apache-2.0 (fichier `LICENSE`) — [LICENSE](https://github.com/antgroup/echomimic_v2/blob/main/LICENSE).
- Poids `BadToBest/EchoMimicV2` : **aucune étiquette de licence** sur Hugging Face (API : liste `license` vide, dernière modification 06/01/2025). Fichiers : `denoising_unet.pth` (1 702 Mo), `reference_unet.pth` (1 631 Mo), `motion_module.pth` (909 Mo), `pose_encoder.pth` (1 702 Mo), plus les versions accélérées `denoising_unet_acc.pth` (3 400 Mo) et `motion_module_acc.pth` (1 818 Mo) — [HF EchoMimicV2](https://huggingface.co/BadToBest/EchoMimicV2).
- README, section Disclaimer : « This project is intended for academic research, and we explicitly disclaim any responsibility for user-generated content » — [README](https://github.com/antgroup/echomimic_v2).
- Composants : `sd-vae-ft-mse` (HF : `mit`) — [sd-vae-ft-mse](https://huggingface.co/stabilityai/sd-vae-ft-mse) ; encodeur audio Whisper `tiny.pt` téléchargé depuis openaipublic (README) ; `openai/whisper-tiny` est étiqueté `apache-2.0` sur HF — [whisper-tiny](https://huggingface.co/openai/whisper-tiny) ; extraction de pose DWPose (`yolox_l.onnx`, `dw-ll_ucoco_384.onnx`) — [dwpose_detector.py](https://github.com/antgroup/echomimic_v2/blob/main/src/models/dwpose/dwpose_detector.py), DWPose sur HF : `apache-2.0` — [yzd-v/DWPose](https://huggingface.co/yzd-v/DWPose) ; `facenet_pytorch==2.6.0` et `mediapipe` dans l'installation — [README](https://github.com/antgroup/echomimic_v2), [requirements.txt](https://github.com/antgroup/echomimic_v2/blob/main/requirements.txt).
- Remerciements : MimicMotion et Moore-AnimateAnyone — [README](https://github.com/antgroup/echomimic_v2).

**EchoMimicV3 (antgroup/echomimic_v3)**
- Code : Apache-2.0 (`LICENSE.txt`) ; `LEGAL.md` ne contient qu'une clause sur la langue des commentaires (le chinois prévaut), sans restriction d'usage — [dépôt](https://github.com/antgroup/echomimic_v3).
- README, section License : « The models in this repository are licensed under the Apache 2.0 License. We claim no rights over the your generated contents » — [README](https://github.com/antgroup/echomimic_v3).
- Poids `BadToBest/EchoMimicV3` : HF `apache-2.0`, dernière modification 23/01/2026 ; fichiers `transformer/diffusion_pytorch_model.safetensors` (3 415 Mo, preview) et `echomimicv3-flash-pro/diffusion_pytorch_model.safetensors` (3 728 Mo, Flash) — [HF EchoMimicV3](https://huggingface.co/BadToBest/EchoMimicV3).
- Modèle de base `Wan2.1-Fun-V1.1-1.3B-InP` : HF `apache-2.0` — [Wan2.1-Fun](https://huggingface.co/alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP). Encodeur audio preview `wav2vec2-base-960h` : `apache-2.0` — [wav2vec2-base-960h](https://huggingface.co/facebook/wav2vec2-base-960h). Encodeur audio Flash `chinese-wav2vec2-base` : `mit` — [chinese-wav2vec2-base](https://huggingface.co/TencentGameMate/chinese-wav2vec2-base).
- Détection de visage : `src/face_detect.py` importe `from retinaface import RetinaFace`. Elle est utilisée par `app.py`, `app_mm.py` et `infer_preview.py`, **pas par `infer_flash.py`** (lecture du code) — [face_detect.py](https://github.com/antgroup/echomimic_v3/blob/main/src/face_detect.py). Le nœud ComfyUI télécharge `retinaface.h5` depuis serengil/deepface_models, « v3 only » (pas Flash) — [ComfyUI_EchoMimic](https://github.com/smthemex/ComfyUI_EchoMimic).

**Hallo (fudan-generative-vision/hallo)**
- Code : MIT, « Copyright (c) 2024 Fusion Lab: Generative Vision Lab of Fudan University » — [LICENSE](https://github.com/fudan-generative-vision/hallo/blob/main/LICENSE).
- Poids `fudan-generative-ai/hallo` : HF `mit`. Le dépôt HF **embarque** `hallo/net.pth` (4 851 Mo), `stable-diffusion-v1-5/unet` (3 438 Mo), `motion_module/mm_sd_v15_v2.ckpt`, `sd-vae-ft-mse`, `wav2vec2-base-960h`, `audio_separator/Kim_Vocal_2.onnx` et `face_analysis/models/` = `1k3d68.onnx`, `2d106det.onnx`, `genderage.onnx`, `glintr100.onnx`, `scrfd_10g_bnkps.onnx` (modèles InsightFace ; jeu de fichiers identique, à notre lecture, au paquet `antelopev2`) + `face_landmarker_v2_with_blendshapes.task` (MediaPipe) — [HF hallo](https://huggingface.co/fudan-generative-ai/hallo).
- Le code appelle `FaceAnalysis(...)` d'InsightFace dans `hallo/datasets/image_processor.py` (inférence comprise) — [image_processor.py](https://github.com/fudan-generative-vision/hallo/blob/main/hallo/datasets/image_processor.py).
- InsightFace : « The training data containing the annotation (and the models trained with these data) are available for non-commercial research purposes only » ; le paquet Python : « The pretrained models provided with this library are for non-commercial research only » — [README InsightFace](https://github.com/deepinsight/insightface), [python-package](https://github.com/deepinsight/insightface/tree/master/python-package). **[NC]**
- SD 1.5 : HF `creativeml-openrail-m` — [stable-diffusion-v1-5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5). **[RAIL]**
- AnimateDiff : `apache-2.0` — [guoyww/animatediff](https://huggingface.co/guoyww/animatediff). Kim_Vocal_2 : le dépôt HF `huangjackson/Kim_Vocal_2` cité par le README n'est pas accessible par l'API (réponse d'erreur), licence non lue — [README Hallo](https://github.com/fudan-generative-vision/hallo).

**Hallo2 (fudan-generative-vision/hallo2)**
- Code : MIT, même copyright Fudan — [LICENSE](https://github.com/fudan-generative-vision/hallo2/blob/main/LICENSE). Poids `fudan-generative-ai/hallo2` : HF `mit` (modification 31/07/2026).
- Le dépôt HF embarque les mêmes composants que Hallo (InsightFace **[NC]**, SD 1.5 UNet **[RAIL]**, Kim_Vocal_2, wav2vec2), **plus** `CodeFormer/codeformer.pth`, `facelib/` (`detection_Resnet50_Final.pth`, `parsing_parsenet.pth`, `yolov5l-face.pth`, `yolov5n-face.pth`) et `realesrgan/RealESRGAN_x2plus.pth` — [HF hallo2](https://huggingface.co/fudan-generative-ai/hallo2).
- README : « The High-Resolution animation feature is a modified version of CodeFormer… please comply with the S-Lab License 1.0 » — [README Hallo2](https://github.com/fudan-generative-vision/hallo2). La licence S-Lab 1.0 de CodeFormer interdit l'usage commercial **[NC]** (texte cité par le README, licence complète sur [CodeFormer](https://github.com/sczhou/CodeFormer)).

**Hallo-Live (nom exact : `fudan-generative-vision/Hallo-Live`, existe et est actif)**
- Le dépôt existe, et `hallo-live` redirige vers le même HEAD. Code : MIT, « Copyright (c) 2026 Fusion Lab » ; dernier commit le 24/06/2026 — [Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live). Article : arXiv 2604.23632 — [arXiv](https://arxiv.org/pdf/2604.23632).
- Poids `fudan-generative-ai/Hallo-Live` : HF `mit` (modification 15/05/2026) ; `hallolive_dit.pt` 23 322 Mo et `hallolive_ode_init.pt` 23 322 Mo — [HF Hallo-Live](https://huggingface.co/fudan-generative-ai/Hallo-Live).
- `tools/download_models.sh inference` télécharge aussi `Wan2.1-T2V-1.3B` (umT5-xxl), `Wan2.2_VAE.pth` et **`hkchengrex/MMAudio ext_weights/v1-16.pth` et `best_netG.pt`** (lecture du script) — [Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live).
- MMAudio : « The checkpoints are released on Hugging Face under the CC-BY-NC 4.0 license », HF `cc-by-nc-4.0` — [README MMAudio](https://github.com/hkchengrex/MMAudio), [HF MMAudio](https://huggingface.co/hkchengrex/MMAudio). **[NC]** Le professeur Ovi (entraînement seulement) est `apache-2.0` sur HF — [chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).

**AniPortrait (Zejun-Yang/AniPortrait)**
- Code : Apache-2.0 — [LICENSE](https://github.com/Zejun-Yang/AniPortrait/blob/main/LICENSE). Poids `ZJYang/AniPortrait` : HF `apache-2.0` ; `denoising_unet.pth` 3 438 Mo, `reference_unet.pth` 3 438 Mo, `pose_guider.pth`, `motion_module.pth`, `audio2mesh.pt`, `audio2pose.pt`, `film_net_fp16.pt` — [HF AniPortrait](https://huggingface.co/ZJYang/AniPortrait).
- Le README exige en plus `StableDiffusion V1.5` (**[RAIL]**), `sd-vae-ft-mse` (MIT), `image_encoder` de `lambdalabs/sd-image-variations-diffusers` (HF : `apache-2.0`, modifié 07/10/2026) et `wav2vec2-base-960h` (Apache) — [README](https://github.com/Zejun-Yang/AniPortrait), [sd-image-variations](https://huggingface.co/lambdalabs/sd-image-variations-diffusers).
- Repères visage : `mediapipe==0.10.11` (`LMKExtractor`) — [requirements.txt](https://github.com/Zejun-Yang/AniPortrait/blob/main/requirements.txt), [audio2vid.py](https://github.com/Zejun-Yang/AniPortrait/blob/main/scripts/audio2vid.py).

**AniTalker (X-LANCE/AniTalker)**
- Code : Apache-2.0 — [LICENSE](https://github.com/X-LANCE/AniTalker/blob/main/LICENSE). Poids `taocode/anitalker_ckpts` : HF `apache-2.0` (carte « remain to be done ») ; `stage1.ckpt` 188 Mo, `stage2_audio_only_hubert.ckpt` 342 Mo, `chinese-hubert-large` 1 262 Mo — [HF anitalker_ckpts](https://huggingface.co/taocode/anitalker_ckpts). `chinese-hubert-large` : `mit` — [HF](https://huggingface.co/TencentGameMate/chinese-hubert-large).
- README : « Stage 1, which primarily focuses on training the motion encoder and the rendering module, heavily relies on resources from LIA » — [README](https://github.com/X-LANCE/AniTalker). LIA est sous « Attribution-NonCommercial 4.0 International » — [LIA LICENSE.md](https://github.com/wyhsirius/LIA/blob/main/LICENSE.md). **[PROV][NC]**
- Disclaimer : « This library's code is not a formal product… it cannot be directly offered to end-service customers » et « The main purpose… is to facilitate academic demonstrations » — [README](https://github.com/X-LANCE/AniTalker).
- Super-résolution optionnelle : `pip install gfpgan`, poids téléchargés au premier usage — [README](https://github.com/X-LANCE/AniTalker).

**DreamTalk (ali-vilab/dreamtalk)**
- Code : MIT, « Copyright (c) 2023 Alibaba TongYi Vision Intelligence Lab » — [LICENSE](https://github.com/ali-vilab/dreamtalk/blob/main/LICENSE).
- README : « This method is intended for RESEARCH/NON-COMMERCIAL USE ONLY » ; points de contrôle retirés du public, obtenus par courriel, et « sending this email implies your consent to use the provided method solely for academic research purposes » — [README](https://github.com/ali-vilab/dreamtalk). **[NC]**
- Encodeur audio : `jonatasgrosman/wav2vec2-large-xlsr-53-english` (HF `apache-2.0`) — [inference_for_demo_video.py](https://github.com/ali-vilab/dreamtalk/blob/main/inference_for_demo_video.py), [HF](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-english).

**First Order Motion Model (AliaksandrSiarohin/first-order-model)**
- Code : **MIT** (« Copyright (c) 2019-2023 Aliaksandr Siarohin ») depuis le commit `f4ff6da` du **06/06/2023**. Le `LICENSE.md` initial (23/03/2020) était « Attribution-NonCommercial 4.0 International » (historique git lu) — [LICENSE.md](https://github.com/AliaksandrSiarohin/first-order-model/blob/master/LICENSE.md), [commit f4ff6da](https://github.com/AliaksandrSiarohin/first-order-model/commit/f4ff6da1ef5c0e6bcf6ec80324fab37c92193e84).
- Points de contrôle : liens Google Drive / Yandex, sans fichier de licence propre — [README](https://github.com/AliaksandrSiarohin/first-order-model).
- VoxCeleb (données d'entraînement de `vox-cpk`) : « available to download for research purposes under a Creative Commons Attribution 4.0 International License… The copyright remains with the original owners of the video » (miroir KAIST) — [VoxCeleb KAIST](https://mm.kaist.ac.kr/datasets/voxceleb/). Une recette Lhotse écrit « commercial/research purposes » : les sources se **contredisent** — [synthèse de recherche, lhotse](https://lhotse.readthedocs.io/en/v1.22/_modules/lhotse/recipes/voxceleb.html). La page VGG officielle lue ne porte aucune mention de licence — [VGG VoxCeleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/).

**Thin-Plate Spline Motion Model (yoyo-nb/Thin-Plate-Spline-Motion-Model)**
- Code : MIT, « Copyright (c) 2021 yoyo-nb » — [LICENSE](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model/blob/main/LICENSE). Poids (vox, ted, taichi, mgif) sur Yandex / Google Drive / Baidu, sans licence propre — [README](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model).
- README : « The main code is based upon FOMM and MRAA » — [README](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model). La licence de MRAA (Snap) : « No license, whether implied or otherwise, is granted in or to such code (including any rights to copy, modify, publish, distribute and/or commercialize such code) » — [MRAA LICENSE.md](https://github.com/snap-research/articulated-animation/blob/main/LICENSE.md). En 2021-2022, FOMM était encore sous CC BY-NC 4.0 (historique ci-dessus). **[PROV]**

**Nœud FOMM ComfyUI** : `FuouM/ComfyUI-FirstOrderMM` (MIT) intègre FOMM, Part Swap, **MRAA (Snap, aucune licence accordée)**, TPSM, MRFA et FSRT, chacun avec ses propres poids — [README du nœud](https://github.com/FuouM/ComfyUI-FirstOrderMM).

### Inferences
- Le seul « main engine » propre en licence de cette liste est **EchoMimicV3**, surtout en **Flash**, qui ne charge pas RetinaFace : chaîne entière Apache/MIT d'après le code lu.
- `reference_unet.pth` d'EchoMimicV2 pèse 1 631 Mo et `denoising_unet.pth` 1 702 Mo. Ces tailles correspondent à un U-Net SD 1.5 en fp16, et le projet hérite de Moore-AnimateAnyone : les poids V2 sont donc **probablement dérivés de SD 1.5 [RAIL]**, en plus d'être sans licence et marqués « academic research ». Déduction de taille, non confirmée par l'auteur.
- Pour FOMM, **le code MIT permet de ré-entraîner** un modèle de mouvement sur nos propres rendus 3D (Blender) ou sur des vidéos dont nous détenons les droits. Les poids `vox-cpk` publiés restent en zone grise (VoxCeleb « research purposes »). Pour TPSM, le risque de provenance porte sur le code lui-même (dérivé de MRAA et de FOMM-NC). À code équivalent, FOMM est donc le support le plus sûr pour une greffe « transfert de mouvement ».
- Hallo et Hallo2 pourraient être « nettoyés » en remplaçant InsightFace par un détecteur MIT/Apache (par exemple MediaPipe, déjà présent). Le U-Net reste toutefois un dérivé SD 1.5 [RAIL] : le nettoyage ne suffit pas pour la règle maison.

### Gaps
- Licence de `Kim_Vocal_2.onnx` (séparateur vocal de Hallo/Hallo2) : dépôt HF inaccessible par l'API. À lire sur la page du modèle UVR.
- Licence des poids `retinaface.h5` (serengil) et des données WIDER FACE : non lue. Cela ne concerne qu'EchoMimicV3 preview, pas Flash.
- Licence de `yolov5-face` (`facelib/` de Hallo2) et des poids GFPGAN (AniTalker, optionnel) : non lue.
- Pas de réponse officielle d'Ant Group sur la licence des poids EchoMimicV2 : à demander par une issue si V2 devait servir.

---

## 2. Ce que chaque outil anime : zone, langue audio, durée, résolution, fps, format vertical

### Takeaway
Seuls **EchoMimicV3** (tête ou corps, rapport d'aspect libre jusqu'à 768×768 de surface) et **EchoMimicV2** (demi-corps avec gestes de mains, pose obligatoire) vont au-delà du visage. Hallo, Hallo2, AniPortrait, AniTalker et DreamTalk exigent un **visage recadré carré** (256 ou 512 px). FOMM et TPSM transfèrent le mouvement d'une **vidéo** (pas d'audio), en 256×256. Aucun n'annonce le français. Hallo et AniTalker préviennent qu'une langue autre que l'anglais dégrade les lèvres. Hallo-Live **ne prend pas d'audio** : il génère sa propre voix à partir de texte.

### Cited Findings
- **EchoMimicV2** : animation « Semi-Body » (titre de l'article CVPR 2025) ; démos « English Driven Audio » et « Chinese Driven Audio » ; « Pretrained models trained on English and Mandarin Chinese » — [README](https://github.com/antgroup/echomimic_v2). Valeurs par défaut de `infer_acc.py` : `-W 768 -H 768 -L 240`, `--steps 6`, `--context_frames 12`, `--context_overlap 3` — [infer_acc.py](https://github.com/antgroup/echomimic_v2/blob/main/infer_acc.py). Pilotage par séquence de pose : la démo « RefImg-Pose Alignment » extrait la pose d'une vidéo de conduite (DWPose) — [README](https://github.com/antgroup/echomimic_v2).
- **EchoMimicV3** : « Unified Multi-Modal and Multi-Task Human Animation » ; « Sampling steps: 5 steps for talking head, 15~25 steps for talking body » ; « If you want to generate a video longer than 138 frames, you can use Long Video CFG » — [README](https://github.com/antgroup/echomimic_v3). Flash : « 8-step High-quality Generation », « No Face Mask required », « 12G VRAM Requirement », « Supports up to 768×768 Resolution » (22/01/2026) — [README](https://github.com/antgroup/echomimic_v3). `run_flash.sh` : `--video_length 81`, `--sample_size 768 768`, `--fps 25`, `--weight_dtype bfloat16`, prompt texte « A person is speaking. » — [run_flash.sh](https://github.com/antgroup/echomimic_v3/blob/main/run_flash.sh). `get_sample_size()` garde le rapport d'aspect de l'image d'entrée, ramène la surface à 768×768 au plus et arrondit à des multiples de 16 — [infer_flash.py](https://github.com/antgroup/echomimic_v3/blob/main/infer_flash.py). L'article revendique une « superior Chinese lip-sync accuracy » ; données : EchoMimicV2 + HDTF + données propres, ≈ 1 500 h — [arXiv 2507.03905](https://arxiv.org/html/2507.03905).
- **Hallo** : image source « cropped into squares », visage = 50 à 70 % de l'image, rotation < 30° ; audio « It must be in English since our training datasets are only in this language » — [README](https://github.com/fudan-generative-vision/hallo). Configuration : `fps: 25`, `inference_steps: 40`, `n_motion_frames: 2` — [default.yaml](https://github.com/fudan-generative-vision/hallo/blob/main/configs/inference/default.yaml). Article : entraînement en 512×512 ; données HDTF + Bilibili/YouTube, 108,86 h après filtrage, « mostly half-body or close-up » — [arXiv 2406.08801](https://arxiv.org/html/2406.08801).
- **Hallo2** : mêmes contraintes (carré, anglais) ; `inference_long.py` pour la longue durée ; démos « 4K, 23 minutes », « up to 1 hour » — [README](https://github.com/fudan-generative-vision/hallo2). Article : entraînement 512×512, sortie jusqu'à « 4096 × 4096 » via super-résolution, durées « tens of minutes » à « hour-long » — [arXiv 2410.07718](https://arxiv.org/html/2410.07718).
- **Hallo-Live** : « real-time text-driven joint audio-video avatar generation » ; la parole est écrite dans le prompt entre balises `<S>…<E>`, avec description audio `<AUDCAP>` (fichier `prompts/demo_prompts.csv`) ; mode T2V par défaut, option `--i2v` (image + légende) ; configuration `height: 480`, `width: 832`, `num_frames: 81` — [Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live) (lecture de `inference.py`, `configs/default_config.yaml`).
- **AniPortrait** : commandes en `-W 512 -H 512` ; `audio2vid` à 30 fps ; le code commente « Currently, only inference up to a maximum length of 10 seconds is supported » (génération de pose par audio, découpée en morceaux de 5 s). Avec un gabarit de pose (`pose_temp`), la séquence est répétée en miroir — [README](https://github.com/Zejun-Yang/AniPortrait), [audio2vid.py](https://github.com/Zejun-Yang/AniPortrait/blob/main/scripts/audio2vid.py).
- **AniTalker** : « The base resolution of our generated output is only 256×256 », 512 avec la super-résolution GFPGAN ; vidéo fixée à 25 Hz ; « Our model is primarily trained on English speech… If other languages are used, we have observed issues such as the generated lips moving slightly or causing image distortion » ; « The dataset processes the face and its surrounding areas, not involving the full body or upper body » ; démos de vidéo longue (Mona Lisa, histoire de Mars) — [README](https://github.com/X-LANCE/AniTalker), [demo.py](https://github.com/X-LANCE/AniTalker/blob/main/code/demo.py), [page projet](https://x-lance.github.io/AniTalker/).
- **DreamTalk** : portrait recadré en 256×256 ; `max_gen_len` en secondes (l'audio est tronqué au-delà) ; le README revendique « speech in multiple languages » ; style et pose pilotés par des séquences 3DMM extraites avec PIRenderer — [README](https://github.com/ali-vilab/dreamtalk).
- **FOMM** : `config/vox-256.yaml` `frame_shape: [256, 256, 3]`, 10 points clés ; configurations vox, taichi, mgif, fashion, bair, nemo ; pilotage par **vidéo de conduite** (`--driving_video`, `--relative --adapt_scale`) — [FOMM](https://github.com/AliaksandrSiarohin/first-order-model).
- **TPSM** : configurations `vox-256`, `taichi-256`, `mgif-256`, `ted-384` (TED-talks = haut du corps) ; `num_tps: 10` ; pilotage par vidéo — [TPSM](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model).

### Inferences
- **Format 9:16** : seul EchoMimicV3 accepte nativement une image verticale. D'après `get_sample_size`, une image 9:16 donne 576×1024, soit exactement 768² pixels. Tous les autres travaillent en carré : il faut animer des **recadrages par personnage** puis les recoller dans l'image 9:16.
- **Français** : aucun outil de la liste n'a de garantie. Les encodeurs `wav2vec2-base-960h` (EchoMimicV3 preview, Hallo, Hallo2, AniPortrait) sont des modèles ASR anglais (LibriSpeech). `chinese-wav2vec2-base` (EchoMimicV3 Flash) et `chinese-hubert-large` (AniTalker) sont chinois. Whisper (EchoMimicV2) est multilingue à la base. À **mesurer** avec nos voix françaises (Sync-C / LSE-D).
- **Gestes et haut du corps** : EchoMimicV2 (mains par pose) et EchoMimicV3 (« talking body ») sont les seuls de la liste. FOMM-TED ou TPSM-ted-384 couvrent le haut du corps par transfert vidéo.

### Gaps
- Durée maximale réelle d'EchoMimicV2 et d'EchoMimicV3 Flash sur 60 s sans dérive : non publiée. À mesurer.
- Résolutions non carrées d'EchoMimicV2 (paramètres `-W -H` libres, mais distribution d'entraînement inconnue) et d'AniPortrait : non documentées.
- Comportement de Hallo-Live sur une phrase française : non documenté.

---

## 3. Qualité sur visages non photoréalistes (cartoon, 3D stylisé), stabilité d'identité, plusieurs personnes dans l'image

### Takeaway
Les preuves sur le **cartoon 3D** sont minces partout. Hallo2 (fig. 10 : « anime images ») et AniTalker (section « Statue/Cartoon ») montrent quelques exemples qualitatifs. Hallo-Live montre explicitement du « 3D anime cartoon style, toon-shaded » et du multi-locuteurs, mais en génération par texte. Le point faible commun est la **détection de visage** (InsightFace, RetinaFace, MediaPipe), qui échoue souvent sur les visages dessinés. **Aucun des dix ne sait lier une piste audio à un personnage précis dans une image à plusieurs personnes.** Cette capacité appartient à MultiTalk et InfiniteTalk (couverts par l'autre chercheur).

### Cited Findings
- **EchoMimicV3** : issue #33 « Has this model been tested on anime characters? » (19/08/2025). L'auteur note que RetinaFace ne détecte pas les visages anime ; aucune réponse, étiquette « help wanted » posée le 08/09/2025, issue ouverte — [issue #33](https://github.com/antgroup/echomimic_v3/issues/33). Flash (22/01/2026) : « No Face Mask required » — [README](https://github.com/antgroup/echomimic_v3). L'article ne montre ni anime ni cartoon ni plusieurs personnes — [arXiv 2507.03905](https://arxiv.org/html/2507.03905).
- **Hallo** : figure 7 = croquis, peintures, images générées par IA, sculptures (pas de cartoon nommé) — [arXiv 2406.08801](https://arxiv.org/html/2406.08801). Issue #132 « #face is invalid: 0 » (échec de repères visage). Une question sur Mickey Mouse (13/08/2024) est restée sans réponse — [issue #132](https://github.com/fudan-generative-vision/hallo/issues/132). Un article tiers (READ) : « Hallo suffers from generation instability, producing unexpected visual artifacts towards the end of the video » — [READ, arXiv 2508.03457](https://arxiv.org/html/2508.03457v3).
- **Hallo2** : la figure 10 montre des « oil paintings, anime images, and portraits from generative models » (qualitatif seulement) — [arXiv 2410.07718](https://arxiv.org/html/2410.07718).
- **Hallo-Live** : « The main demo showcases Hallo-Live's real-time text-driven audio-video generation capabilities across anime-style characters, realistic human subjects, and multi-speaker scenarios » ; un prompt de démo commence par « 3D anime cartoon style, polished toon-shaded character rendering » — [README Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live).
- **AniPortrait** : titre « Audio-Driven Synthesis of Photorealistic Portrait Animations » — [HF](https://huggingface.co/ZJYang/AniPortrait). Il dépend des repères MediaPipe. Sur un outil voisin qui utilise le même MediaPipe Face, un mainteneur décrit la détection sur visages anime comme « a little touch-and-go » et recommande une vraie photo (analogie, pas AniPortrait lui-même) — [ControlNetMediaPipeFace #19](https://huggingface.co/CrucibleAI/ControlNetMediaPipeFace/discussions/19).
- **AniTalker** : la page projet contient une section « Audio-driven Talking Face Generation (Statue/Cartoon) » — [page projet](https://x-lance.github.io/AniTalker/). Limites déclarées : « Rendering models are unable to model multi-view objects. Sometimes they fail to separate characters from the background, especially accessories and hairstyles » ; « please keep the head as centered as possible » — [README](https://github.com/X-LANCE/AniTalker). Article READ : AniTalker et EchoMimic « require cropping or warping of the reference image » et ne sont pas fidèles à l'image de référence — [READ](https://arxiv.org/html/2508.03457v3).
- **DreamTalk** : revendique la robustesse sur des « out-of-domain portraits » (sans détail) — [README](https://github.com/ali-vilab/dreamtalk).
- **FOMM / TPSM** : les deux fournissent un modèle **MGif** (GIF d'animaux dessinés) en plus de VoxCeleb — [FOMM configs](https://github.com/AliaksandrSiarohin/first-order-model/tree/master/config), [TPSM README](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model). Le nœud ComfyUI recommande `relative_jacobian` pour éviter une « heavy deformation of the face » — [ComfyUI-FirstOrderMM](https://github.com/FuouM/ComfyUI-FirstOrderMM).
- **Plusieurs personnes** : aucun README des dix outils ne documente une liaison audio → personne. Hallo-Live montre du « multi-speaker » mais pilote tout par texte — [README Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live). À titre de comparaison, l'autre chercheur note que seuls MultiTalk, InfiniteTalk et LongCat-Video-Avatar 1.5 lient une piste audio à une personne par masque — notes `animation_par_la_voix.md`, [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk).

### Inferences
- Nos personnages 3D cartoon (gros yeux, bouches simplifiées) risquent de **ne pas être détectés** par InsightFace (Hallo, Hallo2), RetinaFace (EchoMimicV3 preview) et MediaPipe (AniPortrait). EchoMimicV3 **Flash**, sans masque de visage, est le seul de la liste qui contourne ce verrou par conception. Il faut le **vérifier sur nos images**.
- Pour 2 personnages ou plus à table, avec ces outils, la voie réaliste est la suivante : **recadrer chaque personnage, l'animer avec sa propre piste**, animer les auditeurs avec une piste silencieuse ou un « idle » FOMM piloté par une vidéo de référence, puis **recoller avec masque** dans le plan 9:16.

### Gaps
- Aucune mesure publiée (Sync-C, CSIM) sur des personnages cartoon 3D pour ces dix outils. Le test doit se faire sur nos propres images (`mesure2.py`, `measure.ts`).
- Comportement d'EchoMimicV2 sur cartoon : aucune preuve trouvée (README et issues non concluants).

---

## 4. Matériel : VRAM, temps par seconde de vidéo, T4 16 Go gratuit, variantes accélérées

### Takeaway
Les chiffres comparables viennent d'un seul banc tiers (READ, A100, extrait de 4,84 s) : AniTalker 13,6 s, AniPortrait 76,8 s, EchoMimic V1 124,1 s, Hallo 212,0 s. EchoMimicV2 accéléré annonce environ 50 s pour 120 images (4,8 s) sur A100. EchoMimicV3 annonce environ 1 min (tête, 5 pas) et environ 4 min (corps, 25 pas) pour 5 s, sans GPU nommé. Sa version Flash tient en 12 Go à 768×768 et en 6,5 Go à 768×512 (nœud ComfyUI). Sur T4 gratuit : FOMM (Kaggle cité par le README) et TPSM (Replicate tourne sur T4) sont confirmés ; les autres ne le sont pas. Hallo-Live demande 2× H200 pour le temps réel.

### Cited Findings
- **Banc READ (article tiers, AAAI)** : « All comparisons are conducted on the same device using identical test data with the same length of 4.84s (121 frames) », GPU NVIDIA A100. Durée moyenne du backbone par vidéo : FantasyTalking 896,1 s ; **Hallo 212,0 s** ; EchoMimic (V1) 124,1 s ; Sonic 83,6 s ; **AniPortrait 76,8 s** ; Ditto 18,0 s ; **AniTalker 13,6 s** ; READ 4,4 s — [READ, arXiv 2508.03457](https://arxiv.org/html/2508.03457v3).
- **STARCaster (article tiers, d'après l'extrait de recherche)** : sur A100, pour 5 s à 25 fps, EchoMimic 2,7 min et AniPortrait 3,7 min — [STARCaster, arXiv 2512.13247](https://arxiv.org/pdf/2512.13247). Chiffre lu dans l'extrait de recherche, tableau non relu.
- **EchoMimicV2** : « The inference speed can be improved by 9x (from ~7mins/120frames to ~50s/120frames on A100 GPU) » (version accélérée `infer_acc.py`, 03/01/2025) ; GPU testés : « A100(80G) / RTX4090D (24G) / V100(16G) » ; poids en `fp16` — [README](https://github.com/antgroup/echomimic_v2), [infer_acc.yaml](https://github.com/antgroup/echomimic_v2/blob/main/configs/prompts/infer_acc.yaml).
- **EchoMimicV3** : « generates a 5-second video in approximately 4 minutes with 25 inference steps » (TeaCache). Le tableau 1 indique environ 1 min pour la tête (5 pas) ; GPU d'inférence non nommé — [arXiv 2507.03905](https://arxiv.org/html/2507.03905). README : « 12G VRAM is All YOU NEED » (GradioUI quantifiée `app_mm.py`) ; « EchoMimicV3 can run on 16G VRAM using ComfyUI » ; GPU testés A100 / RTX 4090D / V100 ; conseil : `partial_video_length` à 81, 65 ou moins pour réduire la VRAM — [README](https://github.com/antgroup/echomimic_v3). Nœud smthemex : « v3 flash… 12G Vram use 8 steps [768×768], 768x512 need 6.5G… need 'block_offload' on » ; V3 « need 8G and more (use mmgp… partial_video_length==65 or 33) » ; LoRA lightX2V à 10 pas — [ComfyUI_EchoMimic](https://github.com/smthemex/ComfyUI_EchoMimic).
- **Hallo** : tableau 7 de l'article : 9,77 Go et 1,63 s (512, unité de temps non précisée : par image, par extrait ou par itération), 6,62 Go et 0,46 s en 256×256, 20,66 Go et 10,29 s en 1024×1024. GPU non précisé pour ce tableau (l'article cite « 8 NVIDIA A100 GPUs ») — [arXiv 2406.08801](https://arxiv.org/html/2406.08801). GPU testé dans le README : A100 — [README](https://github.com/fudan-generative-vision/hallo).
- **Hallo2** : aucune mesure de temps ni de mémoire dans l'article. Limite déclarée : « The substantial computational demands of generating 4K resolution videos necessitate optimization » ; GPU testé : A100 — [arXiv 2410.07718](https://arxiv.org/html/2410.07718), [README](https://github.com/fudan-generative-vision/hallo2).
- **Hallo-Live** : « 20.38 FPS with 0.94 s latency on two NVIDIA H200 GPUs » ; l'entraînement Stage 2 demande « at least 8 × NVIDIA H200 GPUs » ; point de contrôle de 23,3 Go — [README](https://github.com/fudan-generative-vision/Hallo-Live), [HF](https://huggingface.co/fudan-generative-ai/Hallo-Live).
- **AniPortrait** : accélération par interpolation d'images FILM (`-acc`, `film_net_fp16.pt`) — [README](https://github.com/Zejun-Yang/AniPortrait).
- **DreamTalk** : la super-résolution CodeFormer traite « only one frame per second on an A100 GPU » ; l'option MetaPortrait annonce 10 images/s — [README](https://github.com/ali-vilab/dreamtalk).
- **FOMM** : badge « Open in Kaggle » ; « It also works in Kaggle » (démo GUI de @graphemecluster) — [README FOMM](https://github.com/AliaksandrSiarohin/first-order-model).
- **TPSM** : « This model runs on Nvidia T4 GPU hardware. Predictions typically complete within 3 minutes », environ 0,040 $ par exécution sur Replicate — [Replicate TPSM](https://replicate.com/yoyo-nb/thin-plate-spline-motion-model). Le Space officiel tourne sur **CPU basique** (API HF : `RUNNING`, `cpu-basic`) — [Space TPSM](https://huggingface.co/spaces/CVPR/Image-Animation-using-Thin-Plate-Spline-Motion-Model).
- **AniTalker** : notebook Colab publié dans le README ; poids légers (188 Mo + 342 Mo + HuBERT 1,26 Go) — [README](https://github.com/X-LANCE/AniTalker), [HF](https://huggingface.co/taocode/anitalker_ckpts).

### Inferences
- Conversion du banc READ en temps par seconde de vidéo produite, sur A100 (calcul maison) : AniTalker ≈ 2,8 s/s, AniPortrait ≈ 15,9 s/s, Hallo ≈ 43,8 s/s. EchoMimicV2-acc (README) ≈ 50 s / 4,8 s ≈ 10,4 s/s. EchoMimicV3 (article) ≈ 12 s/s (tête, 5 pas) à 48 s/s (corps, 25 pas). Pour un film de 60 s sur A100 : environ 3 min (AniTalker), 10 min (EchoMimicV2-acc), 12 à 48 min (EchoMimicV3), 44 min (Hallo). Sur T4, compter plusieurs fois plus. Pour 1 000 films, seuls les moteurs légers, ou une animation **limitée aux plans parlants**, tiennent dans des minutes.
- **T4 16 Go** : EchoMimicV3 Flash tient en mémoire (6,5 à 12 Go selon le nœud). Mais `run_flash.sh` est en `bfloat16`, que l'architecture Turing du T4 ne traite pas nativement (à vérifier) : prévoir fp16 et contrôler la qualité. EchoMimicV2 (fp16, testé sur V100 16 Go) est plausible sur T4. Hallo tient en 9,8 Go selon l'article. Hallo-Live est **exclu** (23 Go de poids, 2× H200).
- Variantes accélérées à retenir : EchoMimicV2 `infer_acc.py` (6 pas), EchoMimicV3 Flash (8 pas, TeaCache, LoRA lightX2V à 10 pas dans ComfyUI), AniPortrait `-acc` (FILM).

### Gaps
- Aucun temps mesuré **sur T4** pour EchoMimicV2, EchoMimicV3 Flash, Hallo, Hallo2, AniPortrait, AniTalker ou DreamTalk. Il faut un banc maison sur Kaggle (temps par seconde produite, VRAM de crête par `torch.cuda.max_memory_allocated`).
- Unité du temps de 1,63 s du tableau 7 de Hallo : non précisée par l'article.
- VRAM d'AniPortrait et de DreamTalk : non publiée.

---

## 5. Intégration ComfyUI, maintenance (dernier commit) et démos gratuites aujourd'hui

### Takeaway
Tous sauf Hallo-Live ont au moins un nœud ComfyUI dans ComfyUI-Manager. Le seul nœud **maintenu en 2026** est `smthemex/ComfyUI_EchoMimic` (Apache-2.0, V1, V2, V3 et V3 Flash, dernier commit le 28/02/2026). Côté transfert de mouvement, `FuouM/ComfyUI-FirstOrderMM` (MIT, 27/03/2025) regroupe FOMM, TPSM, MRAA, MRFA et FSRT. Démos gratuites qui tournent sur GPU aujourd'hui : AniPortrait (ZeroGPU A10G). TPSM tourne sur CPU. EchoMimicV2 est sur CPU (`cpu-upgrade`), les autres sont en pause, en erreur ou supprimés.

### Cited Findings
**Dernier commit des dépôts (lecture git du 16/10/2026)** — liens : [EchoMimicV2](https://github.com/antgroup/echomimic_v2), [EchoMimicV3](https://github.com/antgroup/echomimic_v3), [Hallo](https://github.com/fudan-generative-vision/hallo), [Hallo2](https://github.com/fudan-generative-vision/hallo2), [Hallo-Live](https://github.com/fudan-generative-vision/Hallo-Live), [AniPortrait](https://github.com/Zejun-Yang/AniPortrait), [AniTalker](https://github.com/X-LANCE/AniTalker), [DreamTalk](https://github.com/ali-vilab/dreamtalk), [FOMM](https://github.com/AliaksandrSiarohin/first-order-model), [TPSM](https://github.com/yoyo-nb/Thin-Plate-Spline-Motion-Model)

| Outil | Dernier commit | Nature |
|---|---|---|
| EchoMimicV2 | 23/02/2026 | README |
| EchoMimicV3 | 18/03/2026 | README ; poids Flash le 22/01/2026 |
| Hallo | 14/09/2024 | README |
| Hallo2 | 27/02/2025 | correctif d'installation |
| Hallo-Live | 24/06/2026 | documentation |
| AniPortrait | 02/07/2024 | — |
| AniTalker | 15/08/2024 | — |
| DreamTalk | 06/01/2024 | README |
| FOMM | 13/11/2024 | coquilles du README ; licence MIT le 06/06/2023 |
| TPSM | 08/07/2023 | liens des poids |

**Nœuds ComfyUI (liste ComfyUI-Manager, dépôts clonés)** — [custom-node-list.json](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json)

| Outil | Nœud | Licence du nœud | Dernier commit |
|---|---|---|---|
| EchoMimic V1/V2/V3/V3 Flash | [smthemex/ComfyUI_EchoMimic](https://github.com/smthemex/ComfyUI_EchoMimic) | Apache-2.0 | 28/02/2026 |
| EchoMimicV2 | [AIFSH/EchoMimicV2-ComfyUI](https://github.com/AIFSH/EchoMimicV2-ComfyUI) | **aucun fichier LICENSE** | 08/12/2024 |
| Hallo | [AIFSH/ComfyUI-Hallo](https://github.com/AIFSH/ComfyUI-Hallo) | MIT | 24/06/2024 |
| Hallo | [hay86/ComfyUI_Hallo](https://github.com/hay86/ComfyUI_Hallo) | MIT | 30/07/2024 |
| Hallo2 | [smthemex/ComfyUI_Hallo2](https://github.com/smthemex/ComfyUI_Hallo2) | MIT | 12/03/2025 |
| Hallo-Live | aucun nœud dans la liste | — | — |
| AniPortrait | [chaojie/ComfyUI-AniPortrait](https://github.com/chaojie/ComfyUI-AniPortrait) | Apache-2.0 | 02/04/2024 |
| AniPortrait | [frankchieng/ComfyUI_Aniportrait](https://github.com/frankchieng/ComfyUI_Aniportrait) | **aucun fichier LICENSE** | 13/09/2024 |
| AniTalker | [AIFSH/AniTalker-ComfyUI](https://github.com/AIFSH/AniTalker-ComfyUI) | Apache-2.0 | 06/08/2024 |
| DreamTalk | [hay86/ComfyUI_Dreamtalk](https://github.com/hay86/ComfyUI_Dreamtalk) | MIT | 15/08/2024 |
| DreamTalk | [if-ai/ComfyUI-IF_AI_Dreamtalk](https://github.com/if-ai/ComfyUI-IF_AI_Dreamtalk) | **aucun fichier LICENSE** | 14/03/2025 |
| FOMM + TPSM (+ MRAA, MRFA, FSRT, Part Swap) | [FuouM/ComfyUI-FirstOrderMM](https://github.com/FuouM/ComfyUI-FirstOrderMM) | MIT | 27/03/2025 |

- Aucun nœud natif dans ComfyUI pour ces outils : l'autre chercheur a vérifié le code de ComfyUI 0.41.0 (nœuds natifs = Wan S2V, HuMo, InfiniteTalk) — notes `animation_par_la_voix.md`.

**Spaces / démos (API Hugging Face, 16/10/2026)**
- EchoMimicV2 : démo officielle HF/ModelScope « TBD » — [README](https://github.com/antgroup/echomimic_v2) ; `fffiloni/echomimic-v2` = RUNNING sur **cpu-upgrade** (pas de GPU) — [Space](https://huggingface.co/spaces/fffiloni/echomimic-v2).
- EchoMimicV3 : studio ModelScope annoncé le 21/08/2025 (état non vérifié) — [README](https://github.com/antgroup/echomimic_v3) ; `artificialguybr/EchoMimicV3-Demo` = **BUILD_ERROR** — [Space](https://huggingface.co/spaces/artificialguybr/EchoMimicV3-Demo).
- Hallo : `fudan-generative-ai/hallo` et `multimodalart/hallo` ne répondent plus (API : erreur d'accès, Space absent ou privé) ; `fffiloni/tts-hallo-talking-portrait` = **PAUSED** — [Space](https://huggingface.co/spaces/fffiloni/tts-hallo-talking-portrait).
- Hallo2, Hallo-Live : aucun Space officiel accessible (`fudan-generative-ai/hallo2` = erreur d'accès).
- AniPortrait : `ZJYang/AniPortrait_official` = **RUNNING sur zero-a10g** (modification 14/07/2026) — [Space](https://huggingface.co/spaces/ZJYang/AniPortrait_official).
- AniTalker : `Delik/Anitalker` = **BUILD_ERROR** — [Space](https://huggingface.co/spaces/Delik/Anitalker) ; notebook Colab dans le README.
- TPSM : Space CVPR = RUNNING sur **cpu-basic** — [Space](https://huggingface.co/spaces/CVPR/Image-Animation-using-Thin-Plate-Spline-Motion-Model) ; Replicate T4 payant à l'usage — [Replicate](https://replicate.com/yoyo-nb/thin-plate-spline-motion-model).
- FOMM : notebooks Colab et Kaggle — [README](https://github.com/AliaksandrSiarohin/first-order-model).

### Inferences
- Pour notre moteur, le nœud **smthemex/ComfyUI_EchoMimic** (Apache-2.0, actif) est la voie d'intégration la plus courte. Il charge les composants Wan repackagés par Comfy-Org (umT5-xxl fp8, CLIP vision H) : leur licence reste à vérifier une par une avant production. En processus Python, `infer_flash.py` s'appelle directement.
- Pour le transfert de mouvement, ne garder du nœud FuouM que le module **FOMM**, avec un point de contrôle ré-entraîné par nous. Écarter MRAA (Snap, aucune licence accordée).
- Les nœuds **sans fichier LICENSE** (AIFSH/EchoMimicV2-ComfyUI, frankchieng, if-ai) sont à proscrire : par défaut, aucun droit n'est accordé.

### Gaps
- Licences de `umt5_xxl_fp8_e4m3fn_scaled.safetensors` et du CLIP vision H repackagés par Comfy-Org (nœud EchoMimic) : non lues.
- État du studio ModelScope d'EchoMimicV3 : non vérifié (pas d'API équivalente lue).

---

## 6. Verdict pour les films troupe (moteur principal / couche lèvres / couche transfert de mouvement / rejet)

### Takeaway
**EchoMimicV3 (Flash)** est le seul candidat « moteur principal » de cette liste : licence propre, tête ou corps, format vertical, 6,5 à 12 Go. Il reste à prouver sur nos visages cartoon et nos voix françaises, en mono-personnage par recadrage. **FOMM, ré-entraîné sur nos rendus**, est la couche « transfert de mouvement » (gestes ou attitudes d'écoute pris sur une vidéo de référence TikTok). Les huit autres sont **rejetés** pour licence (et souvent aussi pour la résolution ou le visage seul), Hallo-Live en plus parce qu'il ne prend pas d'audio.

### Cited Findings (fiches de décision ; chaque raison renvoie aux sources des sections 1 à 5)

| # | Outil | Anime | Licence (code / poids / composants) | Preuve cartoon | Matériel (source) | ComfyUI | **Verdict** et raison décisive |
|---|---|---|---|---|---|---|---|
| 1 | **EchoMimicV2** | demi-corps + mains (pose) | Apache / **sans licence + « academic research »** / SD 1.5 probable [RAIL], Whisper, DWPose Apache | aucune | ≈ 50 s / 120 images sur A100 (acc) ; V100 16 Go testé | smthemex (Apache, 2026) | **Rejet** (poids sans licence, mention [RECH]). Remplacé par V3 |
| 2 | **EchoMimicV3 (Flash)** | tête (5 pas) ou corps (15 à 25 pas) ; 25 fps ; rapport d'aspect libre ≤ 768² | Apache / Apache / Wan2.1-Fun Apache, wav2vec2 Apache ou MIT | issue #33 ouverte (RetinaFace) ; Flash sans masque | ≈ 1 min (tête) à 4 min (corps) pour 5 s (GPU non nommé) ; Flash 12 Go en 768², 6,5 Go en 768×512 | smthemex (Apache, 28/02/2026) | **Moteur principal candidat** (seule chaîne entièrement Apache/MIT, corps + vertical) ; à mesurer : cartoon, français, 60 s |
| 3 | **Hallo** | visage carré | MIT / MIT / **InsightFace [NC]**, SD 1.5 [RAIL] | fig. 7 : peintures, sculptures ; issue #132 (visage non détecté) | 212 s pour 4,84 s (A100, READ) ; 9,77 Go | AIFSH, hay86 (MIT, 2024) | **Rejet** : InsightFace NC ; audio « must be in English » |
| 4 | **Hallo2** | visage carré, longue durée, 4K | MIT / MIT / InsightFace [NC], CodeFormer S-Lab [NC], SD 1.5 [RAIL] | fig. 10 : « anime images » | non publié ; A100 | smthemex (MIT, 03/2025) | **Rejet** : double NC (InsightFace + CodeFormer) |
| 5 | **Hallo-Live** | audio + vidéo générés **depuis du texte** (T2V ou I2V), 480×832 | MIT / MIT / **MMAudio CC-BY-NC [NC]** | démos « 3D anime cartoon », multi-locuteurs | 20,38 FPS sur **2× H200** ; 23,3 Go de poids | aucun | **Rejet** : n'accepte pas notre voix française + MMAudio NC + matériel hors de portée |
| 6 | **AniPortrait** | visage 512² ; 30 fps | Apache / Apache / **SD 1.5 [RAIL]**, MediaPipe | titre « Photorealistic » ; MediaPipe fragile sur anime (analogie) | 76,8 s pour 4,84 s (A100, READ) ; Space ZeroGPU actif | chaojie (Apache, 2024) | **Rejet** : base SD 1.5 OpenRAIL-M hors règle ; photoréaliste |
| 7 | **AniTalker** | visage 256² (512 via GFPGAN) ; 25 fps | Apache / Apache / **Stage 1 dérivé de LIA (CC BY-NC) [PROV]** ; disclaimer « not a formal product » | section « Statue/Cartoon » | 13,6 s pour 4,84 s (A100, READ), le plus rapide | AIFSH (Apache, 2024) | **Rejet** pour la production (provenance NC, 256 px, lèvres faibles hors anglais). Possible seulement comme banc de comparaison interne |
| 8 | **DreamTalk** | visage 256² | MIT / **poids par courriel « solely for academic research »** [NC] | « out-of-domain portraits » | non publié | hay86 (MIT), if-ai (sans licence) | **Rejet** : README « RESEARCH/NON-COMMERCIAL USE ONLY » |
| 9 | **FOMM** | tout objet, piloté par **vidéo** ; 256² ; modèles vox, taichi, mgif | **MIT depuis 06/06/2023** / poids sans licence (VoxCeleb « research ») | modèle mgif (dessins) | Kaggle cité par le README | FuouM (MIT, 03/2025) | **Couche transfert de mouvement**, à condition de **ré-entraîner** sur nos rendus |
| 10 | **TPSM** | comme FOMM + TED 384 (haut du corps) | MIT / sans licence / **code « based upon FOMM and MRAA » [PROV]** | modèle mgif | Replicate T4 : moins de 3 min par prédiction | FuouM (MIT, 03/2025) | **Rejet en production** (provenance MRAA « no license granted ») ; référence de qualité pour notre FOMM ré-entraîné |

Rappel de comparaison, sans fiche : MultiTalk et InfiniteTalk (Apache) lient une voix à un personnage par masque dans une image à plusieurs personnes. MuseTalk (MIT) sert de couche lèvres seules. LatentSync, Sonic et Hallo3 sont exclus pour licence. Sources : notes de l'autre chercheur `animation_par_la_voix.md`, [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk).

### Inferences
- **Greffe proposée (veille → combiner → créer), chaîne « troupe à table » en 4 couches.** Elle combine EchoMimicV3, FOMM et nos outils de mesure. Critères d'acceptation : Sync-C ≥ valeur d'InfiniteTalk sur le même extrait, CSIM d'identité ≥ 0,6, 60 s sans dérive, mesurés avec `mesure2.py` / `measure.ts`.
  1. **Plan locuteur** : recadrage 9:16 ou buste du personnage qui parle → EchoMimicV3 Flash (8 pas, voix française, prompt « talking body ») → recollage avec masque dans la scène.
  2. **Auditeurs** : FOMM ré-entraîné sur nos rendus Blender des mêmes personnages, piloté par une vidéo de référence (attitudes d'écoute ou gestes TikTok), sans audio. C'est léger : modèle 256² sur T4.
  3. **Choix du moteur par plan** : quand deux personnages parlent dans le même plan, on bascule sur InfiniteTalk/MultiTalk (masques), couvert ailleurs. Les dix outils de cette liste ne le font pas.
  4. **Banc français** : 10 répliques françaises × 3 personnages, mesurées avant de passer aux 1 000 films.
- **Contournement du verrou « détection de visage cartoon »** : utiliser **Flash** (sans masque), ou fournir le masque nous-mêmes. Nous connaissons la position de la tête dans nos rendus Blender, ce qui évite tout détecteur.
- **FOMM ré-entraîné** : le code MIT le permet et l'entraînement d'origine tournait sur des Titan X (README FOMM). Le ré-entraîner sur des clips de nos propres personnages animés dans Blender supprime à la fois le risque VoxCeleb et l'écart de domaine cartoon.

### Gaps
- Aucune mesure maison n'existe encore. Plan : (1) EchoMimicV3 Flash sur 3 personnages troupe, voix française, Kaggle T4 en fp16 : temps par seconde produite, VRAM de crête, Sync-C, CSIM ; (2) FOMM-vox contre FOMM ré-entraîné sur nos rendus, mesuré par AKD/AED (métriques de l'article TPSM) ; (3) comparaison avec InfiniteTalk sur le même extrait.
- Le risque [RAIL] d'EchoMimicV2 reste une déduction de taille de fichier. Une réponse d'Ant Group le trancherait, mais V3 le rend inutile.
