# Vidéo longue, image→vidéo et contrôle caméra : liste 4 (FramePack, SkyReels-V2, LongCat-Video, CamI2V, RealCam-I2V, ImageConductor, I2V-Adapter, VideoBooth, ShowMe)

Veille du 16/10/2026. Cas d'usage : animer les images fixes de la troupe MASSAMBA (plusieurs personnages africains stylisés façon 3D cartoon autour d'une table), films verticaux 9:16 d'environ 60 s avec voix françaises, 1 000 films, usage commercial. Moteur piloté par ComfyUI (API HTTP), sur Kaggle T4 16 Go gratuit ou GPU loué. Règle maison : code et modèles exécutés chez nous sous MIT, Apache-2.0 ou BSD seulement, usage commercial autorisé.

Méthode : fichiers LICENSE et README lus directement (raw.githubusercontent.com), date du dernier commit lue par clone git superficiel sans arbre (`--depth 1 --filter=tree:0`, supprimé ensuite), étiquettes de licence et fichiers des dépôts Hugging Face lus par l'API publique HF, état des Spaces lu par l'API HF (`runtime.stage`) le 16/10/2026, liste ComfyUI-Manager (`custom-node-list.json`) filtrée par nom. L'API REST GitHub était fermée à cette session : nombre d'étoiles et issues non relevés.

## 1. Licences exactes : code, chaque poids, modèle de base

### Takeaway
Sur les neuf outils, **un seul passe la règle MIT/Apache/BSD pour le code ET les poids : LongCat-Video (MIT/MIT)**. FramePack a un code Apache-2.0, mais ses poids sont un affinage de HunyuanVideo (Tencent Hunyuan Community License, avec exclusion UE/RU/Corée du Sud). SkyReels-V2/V3 sont sous Skywork Community License : l'usage commercial est permis, mais ce n'est pas une licence de notre liste. CamI2V, RealCam-I2V (version DynamiCrafter) et ShowMe reposent sur les poids DynamiCrafter, réservés à un usage « personnel/recherche/non commercial ». ImageConductor, I2V-Adapter, VideoBooth, RealCam-I2V et ShowMe n'ont **aucun fichier LICENSE** pour leur code.

### Cited Findings
**FramePack (lllyasviel/FramePack, y compris F1)**
- Code : Apache License 2.0 (fichier LICENSE à la racine) — [LICENSE](https://github.com/lllyasviel/FramePack/blob/main/LICENSE)
- Le script officiel charge le transformeur `lllyasviel/FramePackI2V_HY`, les encodeurs de texte (Llama et CLIP) et le VAE depuis `hunyuanvideo-community/HunyuanVideo`, ainsi que l'encodeur d'image SigLIP depuis `lllyasviel/flux_redux_bfl` (sous-dossiers `feature_extractor` et `image_encoder` seulement) — [demo_gradio.py](https://github.com/lllyasviel/FramePack/blob/main/demo_gradio.py)
- Poids `lllyasviel/FramePackI2V_HY` et `lllyasviel/FramePack_F1_I2V_HY_20250503` : aucune étiquette de licence et aucun fichier LICENSE dans le dépôt HF. La fiche dit seulement « This is the `f1k1_x_g9_f1k1f2k2f16k4_td` FramePack for HY » — [FramePackI2V_HY](https://huggingface.co/lllyasviel/FramePackI2V_HY) ; [FramePack_F1](https://huggingface.co/lllyasviel/FramePack_F1_I2V_HY_20250503)
- Les reconditionnements ComfyUI de ces mêmes poids portent l'étiquette `tencent-hunyuan-community` : Kijai/HunyuanVideo_comfy, qui héberge `FramePackI2V_HY_fp8_e4m3fn` et `_bf16`, ainsi que Comfy-Org/HunyuanVideo_repackaged — [Kijai/HunyuanVideo_comfy](https://huggingface.co/Kijai/HunyuanVideo_comfy) ; [Comfy-Org/HunyuanVideo_repackaged](https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged)
- Le dépôt `hunyuanvideo-community/HunyuanVideo` n'a pas d'étiquette de licence mais déclare `base_model: tencent/HunyuanVideo` — [HF](https://huggingface.co/hunyuanvideo-community/HunyuanVideo)
- Tencent Hunyuan Community License : « THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ». Les « Model Derivatives » incluent les modifications et les œuvres basées sur Tencent Hunyuan. Toute distribution doit porter un fichier « Notice ». Au-delà de 100 millions d'utilisateurs actifs mensuels, il faut demander une licence. Interdiction d'utiliser les sorties pour améliorer un autre modèle d'IA. Une politique d'usage acceptable s'applique. « Tencent claims no rights in Outputs » — [LICENSE HunyuanVideo](https://huggingface.co/tencent/HunyuanVideo/blob/main/LICENSE)
- `lllyasviel/flux_redux_bfl` n'a pas d'étiquette de licence. Il contient `image_encoder` (SigLIP) et `image_embedder` (FLUX Redux) — [HF](https://huggingface.co/lllyasviel/flux_redux_bfl). FLUX.1-Redux-dev est sous `flux-1-dev-non-commercial-license` — [HF](https://huggingface.co/black-forest-labs/FLUX.1-Redux-dev). SigLIP `google/siglip-so400m-patch14-384` est sous Apache-2.0 — [HF](https://huggingface.co/google/siglip-so400m-patch14-384). Le reconditionnement ComfyUI `Comfy-Org/sigclip_vision_384` est sous Apache-2.0 — [HF](https://huggingface.co/Comfy-Org/sigclip_vision_384)

**SkyReels-V2 (SkyworkAI/SkyReels-V2)**
- Code : le fichier `LICENSE.txt` du dépôt est un texte « Terms and Conditions » (`license: other`) qui renvoie à la Skywork Community License. Il contient aussi une demande de ne pas déployer le modèle « for internet services without appropriate security reviews and records » — [LICENSE.txt](https://github.com/SkyworkAI/SkyReels-V2/blob/main/LICENSE.txt)
- Poids : tous les dépôts HF vérifiés portent `license: other`, `license_name: skywork-license` (I2V-14B-540P, I2V-1.3B-540P, DF-1.3B-540P, DF-14B-720P, I2V-14B-720P ; idem pour SkyReels-V3 R2V-14B, V2V-14B et A2V-19B) — [SkyReels-V2-I2V-14B-540P](https://huggingface.co/Skywork/SkyReels-V2-I2V-14B-540P) ; [SkyReels-V2-DF-14B-720P](https://huggingface.co/Skywork/SkyReels-V2-DF-14B-720P) ; [SkyReels-V3-A2V-19B](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B)
- Skywork Community License (PDF, 4 pages) : licence « non-exclusive, worldwide, non-transferable, non-sublicensable, revocable, royalty-free », avec la mention « You may use the License for commercial purposes ». Le concédant ne revendique aucun droit sur les sorties. Usage militaire ou illégal interdit. Obligation de fournir la source et une copie de l'accord aux utilisateurs tiers. Étiquetage « Skywork Inside » si on publie un dérivé ou si on le présente à un classement. Droit chinois applicable (art. 18). Le concédant garde « the final right to interpret » (art. 17) — [Skywork Community License](https://github.com/SkyworkAI/Skywork/blob/main/Skywork%20Community%20License.pdf)
- Architecture : SkyReels-V2 reprend l'architecture Wan2.1, mais le DiT est entraîné « from scratch », avec le VAE et l'encodeur de texte pré-entraînés conservés (lecture du rapport via résumé automatique) — [arXiv 2504.13074](https://arxiv.org/abs/2504.13074)

**LongCat-Video (meituan-longcat/LongCat-Video)**
- Code : MIT (« Copyright (c) 2025 Meituan ») — [LICENSE](https://github.com/meituan-longcat/LongCat-Video/blob/main/LICENSE)
- Poids : étiquette HF `license: mit`. La fiche précise : « The model weights are released under the MIT License » et « does not grant any rights to use Meituan trademarks or patents ». Le dépôt HF regroupe `dit`, `text_encoder`, `vae`, `lora`, `tokenizer` et `scheduler` — [HF LongCat-Video](https://huggingface.co/meituan-longcat/LongCat-Video)
- Les remerciements citent Wan et UMT5-XXL. Le code charge `UMT5EncoderModel` et `AutoencoderKLWan` — [README](https://github.com/meituan-longcat/LongCat-Video) ; [run_demo_image_to_video.py](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_image_to_video.py). Pour comparaison, Wan2.1 est sous Apache-2.0 sur HF — [Wan2.1-I2V-14B-480P](https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P)
- Pour comparaison seulement : LongCat-Video-Avatar porte aussi l'étiquette `mit` — [HF](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar)

**CamI2V (ZGCTroy/CamI2V)**
- Code : MIT (« Copyright (c) 2024 Zheng Guang Cong ») — [LICENSE](https://github.com/ZGCTroy/CamI2V/blob/main/LICENSE)
- Poids `MuteApo/CamI2V` : étiquette `mit` (256_cami2v.pt, 512_cami2v_50k/100k.pt, 512_realcam-i2v_50k.safetensors…) — [HF](https://huggingface.co/MuteApo/CamI2V)
- Modèle de base obligatoire DynamiCrafter (256 et 512). Sa fiche dit : « We develop this repository for RESEARCH purposes, so it can only be used for personal/research/non-commercial purposes ». Le code DynamiCrafter est sous Apache-2.0 — [Doubiiu/DynamiCrafter_512](https://huggingface.co/Doubiiu/DynamiCrafter_512) ; [DynamiCrafter LICENSE](https://github.com/Doubiiu/DynamiCrafter/blob/main/LICENSE)
- Profondeur métrique : Depth-Anything-V2-Metric-Hypersim-Large porte l'étiquette `apache-2.0` sur HF — [HF](https://huggingface.co/depth-anything/Depth-Anything-V2-Metric-Hypersim-Large). Ce point est **contredit** par le README officiel : « Depth-Anything-V2-Base/Large/Giant models are under the CC-BY-NC-4.0 license » (seul Small est sous Apache-2.0) — [Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2)

**RealCam-I2V (ZGCTroy/RealCam-I2V)**
- Code : **aucun fichier LICENSE**. La racine contient `.gitignore .gitmodules README.md finetune index.html requirements.txt static` (listage git du 16/10/2026) — [dépôt](https://github.com/ZGCTroy/RealCam-I2V)
- Poids `MuteApo/RealCam-I2V` (`RealCam-I2V_CogVideoX1.5-5B_50k.pt`) : étiquette `mit` — [HF](https://huggingface.co/MuteApo/RealCam-I2V)
- Base CogVideoX1.5-5B-I2V sous « The CogVideoX License » : l'usage commercial impose de « register and obtain a basic commercial license », gratuite jusqu'à 1 million de visites par mois — [LICENSE CogVideoX1.5](https://huggingface.co/zai-org/CogVideoX1.5-5B-I2V/blob/main/LICENSE)
- Autres dépendances : Metric3D (code sous licence BSD 2-Clause — [LICENSE](https://github.com/YvanYin/Metric3D/blob/main/LICENSE) ; poids `JUGGHM/Metric3D` sans étiquette — [HF](https://huggingface.co/JUGGHM/Metric3D)) et Qwen2.5-VL-7B pour les légendes — [README](https://github.com/ZGCTroy/RealCam-I2V)
- Les résultats de l'article reposent sur la version DynamiCrafter (donc base non commerciale), publiée dans le dépôt CamI2V — [README](https://github.com/ZGCTroy/RealCam-I2V)

**ImageConductor (liyaowei-stu/ImageConductor)**
- Code : **aucun fichier LICENSE**. Racine : `ImageConductor_app.py README.md __assets__ configs main modules peft pipelines requirements.txt scripts utils` — [dépôt](https://github.com/liyaowei-stu/ImageConductor)
- Poids `TencentARC/ImageConductor` : étiquette `apache-2.0`. Fichiers : `unet.ckpt`, `image_controlnet.ckpt`, `flow_controlnet.ckpt`, plus deux modèles communautaires `helloobjects_V12c.safetensors` et `TUSUN.safetensors` — [HF](https://huggingface.co/TencentARC/ImageConductor)
- Base Stable Diffusion 1.5 (`creativeml-openrail-m`) et AnimateDiff (étiquette `apache-2.0`) — [SD1.5](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5) ; [guoyww/animatediff](https://huggingface.co/guoyww/animatediff) ; [README](https://github.com/liyaowei-stu/ImageConductor)

**I2V-Adapter (KwaiVGI/I2V-Adapter)**
- Code : **aucun fichier LICENSE**. Un seul commit (« first commit ») — [dépôt](https://github.com/KwaiVGI/I2V-Adapter)
- Poids `space-xun/i2v_adapter` : étiquette `apache-2.0` — [HF](https://huggingface.co/space-xun/i2v_adapter). Dépendances : SD1.5 (OpenRAIL-M) et IP-Adapter (`apache-2.0`) — [h94/IP-Adapter](https://huggingface.co/h94/IP-Adapter) ; [README](https://github.com/KwaiVGI/I2V-Adapter)

**VideoBooth (Vchitect/VideoBooth)**
- Code : **aucun fichier LICENSE** — [dépôt](https://github.com/Vchitect/VideoBooth)
- Poids `yumingj/VideoBooth_models` (`mapper.pt`, `watermark_remove_module.pt`) : aucune étiquette de licence — [HF](https://huggingface.co/yumingj/VideoBooth_models). Base Stable Diffusion v1.4 (`creativeml-openrail-m`) — [HF](https://huggingface.co/CompVis/stable-diffusion-v1-4)

**ShowMe : dépôt identifié = yujiangpu20/ShowMe-master**
- Il s'agit de « Show Me: Unifying Instructional Image and Video Generation with Diffusion Models » (Yujiang Pu, Zhanbo Huang, Vishnu Boddeti, Yu Kong), WACV 2026 — [arXiv 2511.17839](https://arxiv.org/abs/2511.17839) ; [WACV 2026](https://openaccess.thecvf.com/content/WACV2026/html/Pu_Show_Me_Unifying_Instructional_Image_and_Video_Generation_with_Diffusion_WACV_2026_paper.html)
- La page projet renvoie vers le dépôt `github.com/yujiangpu20/ShowMe-master` — [page projet](https://yujiangpu20.github.io/showme/)
- Code : **aucun fichier LICENSE**. Racine : `.gitignore README.md assets checkpoints configs data_process evaluation lvdm main requirements.txt utils` — [dépôt](https://github.com/yujiangpu20/ShowMe-master)
- Poids : modèle de base DynamiCrafter (`model.ckpt`, donc non commercial, voir plus haut) et LoRA `lora_image.pth` / `lora_video.pth` distribuées par Google Drive, sans licence indiquée — [README](https://github.com/yujiangpu20/ShowMe-master)

### Inferences
- **FramePack** : en tant qu'affinage de HunyuanVideo, les poids FramePackI2V_HY relèvent selon toute vraisemblance de la définition « Model Derivatives » de la Tencent Hunyuan Community License. Les reconditionnements Kijai/Comfy-Org les étiquettent d'ailleurs `tencent-hunyuan-community`. Ce n'est ni MIT, ni Apache, ni BSD → hors règle. L'encodeur Llama de HunyuanVideo dérive probablement de LLaVA-Llama-3 (licence Llama 3), point non vérifié ici. Seul l'encodeur SigLIP est propre (Apache-2.0) : le module FLUX Redux non commercial présent dans `flux_redux_bfl` n'est pas chargé par FramePack.
- **SkyReels-V2/V3** : usage commercial autorisé, mais licence propriétaire révocable, sous droit chinois, avec interprétation réservée au concédant → hors règle maison.
- **LongCat-Video** est le seul modèle de la liste conforme sans réserve (code et poids MIT, composants Wan et UMT5 inclus dans le dépôt MIT). Les modèles d'origine de ces composants sont déclarés sous Apache-2.0 côté Wan.
- **CamI2V, RealCam-I2V (version DynamiCrafter) et ShowMe** héritent de la restriction non commerciale de DynamiCrafter, quelle que soit l'étiquette MIT des poids d'adaptation. Ces poids ne fonctionnent pas sans la base.
- **ImageConductor, I2V-Adapter, VideoBooth, RealCam-I2V et ShowMe** : sans fichier LICENSE, le code reste par défaut « tous droits réservés ». L'étiquette Apache-2.0 de certains poids ne couvre pas le code.

### Gaps
- Licence exacte de l'encodeur de texte Llama de `hunyuanvideo-community/HunyuanVideo` : à lire dans la fiche de `xtuner/llava-llama-3-8b-v1_1-transformers`, sans étiquette HF lue le 16/10/2026.
- Licence des deux modèles communautaires embarqués par ImageConductor (`helloobjects_V12c`, `TUSUN`), qui viennent de CivitAI : non vérifiée.
- Conflit Apache-2.0 / CC-BY-NC-4.0 sur Depth-Anything-V2 Metric Large : à arbitrer avant tout usage (Small reste sous Apache-2.0, sans ambiguïté).

## 2. Entrée → sortie : résolution, images, fps, durée, vertical 9:16, entrée audio

### Takeaway
Seuls FramePack (30 fps, jusqu'à 60 s annoncées), SkyReels-V2 en diffusion forcing (24 fps, `num_frames 1457` pour 60 s) et LongCat-Video (480p 15 fps vers 720p 30 fps, continuation « minutes-long ») visent les plans longs. CamI2V, RealCam, ImageConductor, I2V-Adapter, VideoBooth et ShowMe produisent des clips de 16 à 161 images en basse ou moyenne résolution. **Aucun des neuf n'accepte d'entrée audio** : pas de synchronisation labiale native. Celle-ci reste du ressort de LongCat-Video-Avatar, SkyReels-V3-A2V et des outils couverts ailleurs.

### Cited Findings
- **FramePack** : sortie à 30 fps (`total_latent_sections = (total_second_length * 30) / (latent_window_size * 4)`), image redimensionnée au « bucket » le plus proche pour une résolution de 640 — [demo_gradio.py](https://github.com/lllyasviel/FramePack/blob/main/demo_gradio.py). « To generate 1-minute video (60 seconds) at 30fps (1800 frames) using 13B model, the minimal required GPU memory is 6GB » — [README](https://github.com/lllyasviel/FramePack). La page projet montre de l'image→5 s (150 images) et de l'image→60 s (1 800 images) — [page FramePack](https://lllyasviel.github.io/frame_pack_gitpage/). Pas d'entrée audio. Il existe une variante début/fin d'image via le nœud TTP_Comfyui_FramePack_SE — [ComfyUI-Manager list](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json)
- **FramePack-F1** : prédiction « forward » seulement, « less constrained than the bi-directional default model », « Larger variances and more dynamics will be visible », lancement par `demo_gradio_f1.py` (annonce du 04/05/2025) — [discussion #459](https://github.com/lllyasviel/FramePack/discussions/459)
- **SkyReels-V2** : modèles 540P (544×960) et 720P (720×1280), fps 24 par défaut. Diffusion forcing : `--num_frames 257` pour 10 s, `377` pour 15 s, `737` pour 30 s, `1457` pour 60 s. `base_num_frames` vaut 97 (540P) ou 121 (720P), `overlap_history` 17 pour les vidéos longues, `addnoise_condition` 20, asynchrone avec `ar_step 5` et `causal_block_size 5`. Image de début et de fin (`--image`, `--end_image`), extension vidéo (V2V) — [README](https://github.com/SkyworkAI/SkyReels-V2). Démos de 30 s publiées ; le rapport dit des exemples d'histoire « exceeding 30 seconds » — [README](https://github.com/SkyworkAI/SkyReels-V2) ; [arXiv 2504.13074](https://arxiv.org/abs/2504.13074)
- **SkyReels-V3** (comparaison) : R2V 14B-720P avec 1 à 4 images de référence, « recommended output specification … 5-second video at 720p and 24 fps ». V2V : extension d'un plan de 5 à 30 s. A2V 19B-720P « Talking Avatar » (entrée audio) — [README V3](https://github.com/SkyworkAI/SkyReels-V3)
- **LongCat-Video** : 13,6 milliards de paramètres. T2V, I2V et continuation vidéo dans un seul modèle, « natively pretrained on Video-Continuation tasks, enabling it to produce minutes-long videos without color drifting or quality degradation », 720p 30 fps par génération grossière puis fine — [README](https://github.com/meituan-longcat/LongCat-Video). Démo I2V : `resolution='480p'`, `num_frames=93`, 50 pas, guidage 4.0, écrite à `fps=15`. Mode distillé : 16 pas, guidage 1.0. Puis LoRA de raffinement vers 720p ; la taille cible suit `image.size` — [run_demo_image_to_video.py](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_image_to_video.py). Le rapport confirme une base 480p 15 fps raffinée en 720p 30 fps — [arXiv 2510.22200](https://arxiv.org/abs/2510.22200). Pas d'entrée audio dans le modèle de base ; l'audio relève de LongCat-Video-Avatar et Avatar-1.5 (Whisper-large-v3, publié le 21/05/2026) — [README](https://github.com/meituan-longcat/LongCat-Video)
- **CamI2V** : points de contrôle 256×256 et 512×320 (paysage) — [README](https://github.com/ZGCTroy/CamI2V). La base DynamiCrafter 512 génère « 16 video frames at a resolution of 320x512 », des clips d'environ 2 s — [fiche DynamiCrafter_512](https://huggingface.co/Doubiiu/DynamiCrafter_512)
- **RealCam-I2V (CogVideoX1.5)** : l'interface Gradio règle les images de 17 à 161 (pas de 16, 49 par défaut), la hauteur de 256 à 1360 (512 par défaut) et la largeur de 448 à 1360 (896 par défaut) — [gradio_app.py](https://github.com/ZGCTroy/RealCam-I2V/blob/main/finetune/gradio_app.py)
- **ImageConductor** : l'application instancie le modèle en `height=256, width=384`, avec des flux de trajectoire écrits à 8 fps — [ImageConductor_app.py](https://github.com/liyaowei-stu/ImageConductor/blob/main/ImageConductor_app.py). Contrôle des « camera transitions and object movements » par trajectoires — [arXiv 2406.15339](https://arxiv.org/abs/2406.15339)
- **I2V-Adapter** : `inference.py` règle par défaut 256×256 et 16 images (`--length 16`), CFG 8. `infer.sh` lance du 512×512 — [inference.py](https://github.com/KwaiVGI/I2V-Adapter/blob/main/inference.py) ; [infer.sh](https://github.com/KwaiVGI/I2V-Adapter/blob/main/infer.sh)
- **VideoBooth** : prompt image (sujet segmenté par Grounded-SAM) et prompt texte, puis génération d'une nouvelle vidéo. Il n'anime pas l'image fournie. Entraînement à `--num-frames 16` — [README](https://github.com/Vchitect/VideoBooth) ; [arXiv 2312.00777](https://arxiv.org/abs/2312.00777)
- **ShowMe** : génération « instructionnelle » d'image (état final) et de vidéo (prédiction de l'action depuis un état initial). Configurations `inference_256_v1.0.yaml`, données Something-Something v2, Epic-Kitchens 100 et Ego4D, toutes en 256 px — [README ShowMe](https://github.com/yujiangpu20/ShowMe-master) ; [arXiv 2511.17839](https://arxiv.org/abs/2511.17839)

### Inferences
- **Vertical 9:16** : LongCat (taille calée sur l'image d'entrée), SkyReels (hauteur et largeur libres dans diffusers) et RealCam-CogVideoX (curseurs libres, par exemple 512×896) acceptent a priori un format portrait. FramePack choisit un bucket proche de l'image d'entrée. CamI2V, DynamiCrafter et ImageConductor sont figés en paysage ou en carré.
- Pour un film de 60 s, seuls FramePack, SkyReels-DF et LongCat (continuation) couvrent la durée en un seul plan continu. Les autres demanderaient 30 clips de 2 s raccordés.

### Gaps
- Liste exacte des buckets portrait de FramePack (`diffusers_helper/bucket_tools.py` non lu).
- Qualité réelle de SkyReels et LongCat en 9:16 natif : aucune démo verticale officielle trouvée ; à mesurer sur nos images (greffe en cours, voir §7).

## 3. Qualité sur personnages stylisés / 3D cartoon, stabilité d'identité sur plans longs, scènes à plusieurs personnes

### Takeaway
Aucun des neuf outils ne publie de mesure sur des personnages 3D cartoon ni sur des scènes à plusieurs personnes autour d'une table. Les preuves sont indirectes. LongCat-Video inclut « 2D/3D animation » dans ses styles d'évaluation I2V, sans score séparé. FramePack utilise surtout des images Midjourney comme entrées. SkyReels-V2 dit avoir filtré le contenu animé de ses données. ImageConductor livre deux modèles de style communautaires. La stabilité sur la durée n'est chiffrée nulle part par une mesure d'identité.

### Cited Findings
- **FramePack** : « Most input images are from Midjourney ». La page définit la dérive (« quality degradation as the video becomes longer ») et présente l'échantillonnage anti-dérive inversé, qui traite toujours la première image comme cible. Aucun exemple multi-personnes n'est mentionné — [page FramePack](https://lllyasviel.github.io/frame_pack_gitpage/)
- **FramePack-F1** : des utilisateurs rapportent que F1 change peu la pose du sujet (par exemple, une personne assise ne se lève pas). Ce sont des retours d'utilisateurs, pas du mainteneur — [discussion #459](https://github.com/lllyasviel/FramePack/discussions/459)
- **SkyReels-V2** : en évaluation humaine I2V (SkyReels-Bench, notes de 1 à 5), SkyReels-V2-I2V obtient 3,29 en moyenne (Consistency 3,18) et SkyReels-V2-DF 3,24 (Consistency 3,21), contre 2,85 pour Wan2.1-14B, 2,84 pour HunyuanVideo-13B, 3,4 pour Kling-1.6 Pro et 3,39 pour Runway-Gen4 — [README](https://github.com/SkyworkAI/SkyReels-V2)
- **SkyReels-V2** : le rapport cite le contenu « Computer-generated or hand-drawn non-live-action content » parmi les types de vidéos filtrés (tableau 1). La conclusion reconnaît une « error accumulation over extended generations » qui limite la longueur utile. Il n'y a pas de mesure quantitative de dérive d'identité (lecture via résumé automatique) — [arXiv 2504.13074](https://arxiv.org/abs/2504.13074)
- **LongCat-Video** : MOS I2V interne de 4,04 en Image-Alignment, contre 4,18 pour Wan2.2-I2V-A14B, 4,18 pour Hailuo-02 et 4,12 pour Seedance 1.0. Text-Alignment de 3,49 — [README](https://github.com/meituan-longcat/LongCat-Video). Le rapport donne aussi Visual Quality 3,27, Motion Quality 3,59 et Overall 3,17. Il liste « 2D anime » et « 3D cartoon » parmi les catégories de style annotées et « 2D/3D animation » parmi les styles d'évaluation I2V, sans score séparé. VBench 2.0 total : 62,11 %, Human Fidelity 80,20 % — [arXiv 2510.22200](https://arxiv.org/abs/2510.22200)
- **DynamiCrafter** (base de CamI2V, RealCam-DynamiCrafter et ShowMe) : « Faces and people in general may not be generated properly » — [fiche DynamiCrafter_512](https://huggingface.co/Doubiiu/DynamiCrafter_512)
- **ImageConductor** : le dépôt de poids embarque `helloobjects_V12c.safetensors` et `TUSUN.safetensors`, deux modèles de style communautaires. Le README invite à télécharger des modèles personnalisés depuis CivitAI — [HF](https://huggingface.co/TencentARC/ImageConductor) ; [README](https://github.com/liyaowei-stu/ImageConductor)
- **I2V-Adapter** : préserve l'identité de l'image d'entrée par attention inter-images, « without any changes to the pretrained T2V model », avec une « compatibility with existing community-driven personalized models and control tools » — [arXiv 2312.16693](https://arxiv.org/abs/2312.16693)
- **ShowMe** : entraîné sur des vidéos d'interactions main-objet (SSv2, Epic-Kitchens, Ego4D), domaine sans lien avec des personnages animés — [README ShowMe](https://github.com/yujiangpu20/ShowMe-master)

### Inferences
- Pour nos personnages 3D cartoon, LongCat-Video est le seul candidat dont l'évaluation inclut explicitement l'animation 2D/3D. Le filtrage du contenu animé chez SkyReels-V2 laisse craindre une moins bonne tenue du style cartoon.
- Pour les tablées à plusieurs personnages, aucun des neuf ne gère la parole de chaque personnage (pas d'audio). Ils servent tout au plus aux plans d'ambiance (respiration, gestes, caméra), pas aux répliques.

### Gaps
- Aucune mesure publique d'identité multi-personnages sur 60 s pour ces outils. À produire nous-mêmes avec `mesure2.py`, `measure.ts` et `grammaire_plans.py` (similarité de visage et de costume image par image, dérive de couleur) sur 3 images de la troupe : greffe en cours, plan au §7.
- Pas de résultat VBench-I2V publié pour FramePack, SkyReels-V2 (seul le VBench T2V est publié), LongCat (VBench 2.0 en T2V seulement), ni pour les six autres.

## 4. Matériel : VRAM, temps par seconde de vidéo, Kaggle T4 16 Go (sans bf16) ou P100

### Takeaway
Les chiffres sourcés existent sur RTX 4090 (FramePack), RTX 3090 (CamI2V) et H800 (LongCat). Aucun des neuf n'est documenté sur T4 ou P100. Les trois modèles « longs » (FramePack, SkyReels, LongCat) sont publiés et chargés en **bf16**, que le T4 (Turing) ne gère pas nativement. Leur passage sur Kaggle exige une conversion en fp16, non validée par les auteurs. LongCat 13,6 milliards de paramètres en fp16 dépasse 16 Go sans déchargement par blocs : pour lui, le GPU loué est la voie réaliste.

### Cited Findings
- **FramePack** : « Nvidia GPU in RTX 30XX, 40XX, 50XX series that supports fp16 and bf16. The GTX 10XX/20XX are not tested », au moins 6 Go. Sur RTX 4090 : « 2.5 seconds/frame (unoptimized) or 1.5 seconds/frame (teacache) ». Les portables 3070 Ti / 3060 sont « about 4x to 8x slower ». Plus de 30 Go à télécharger. TeaCache « is not really lossless » — [README](https://github.com/lllyasviel/FramePack). Le transformeur est chargé en `torch.bfloat16`, le reste en fp16 ; le mode « high_vram » demande plus de 60 Go libres — [demo_gradio.py](https://github.com/lllyasviel/FramePack/blob/main/demo_gradio.py)
- **T4 et bf16** : la génération Turing (T4, capacité de calcul 7.5) n'a pas de calcul bf16 natif ; le contournement documenté consiste à passer en float16 — [forum PyTorch](https://discuss.pytorch.org/t/current-cuda-device-does-not-support-bfloat16-please-switch-dtype-to-float16/201564) ; [forum NVIDIA](https://forums.developer.nvidia.com/t/quadro-rtx-6000-does-not-handle-bf16-please-make-an-update/312545). Aucune issue FramePack spécifique au T4 trouvée — [recherche web, 16/10/2026](https://github.com/lllyasviel/FramePack/issues/339)
- **SkyReels-V2** : « Generating a 540P video using the 1.3B model requires approximately 14.7GB peak VRAM, while the same resolution video using the 14B model demands around 51.2GB » (diffusion forcing ; 43,4 Go pour T2V 14B). Baisser `base_num_frames` (77, 57) réduit le pic de mémoire. Options `--offload`, `--teacache` et xDiT USP multi-GPU. Aucun GPU n'est nommé pour ces chiffres — [README](https://github.com/SkyworkAI/SkyReels-V2)
- **SkyReels-V2** : le rapport sert le 14B sur « RTX 4090 GPUs (24GB VRAM) », en 720p sur un seul GPU avec quantification FP8 et déchargement. FP8 apporte ×1,10, SageAttention2 ×1,30, et le passage de 4 à 8 RTX 4090 donne ×1,8. Pas de durée par vidéo mesurée — [arXiv 2504.13074](https://arxiv.org/abs/2504.13074)
- **LongCat-Video** (single H800 + FlashAttention3, rapport, tableau 2) : 720p×93 images avec distillation, génération grossière puis fine et attention clairsemée par blocs (16 puis 5 pas) en **116,5 s**. 720p×189 images en **142,0 s**. 720p×93 images natif à 50 pas en 1 429,5 s. 480p : 341,5 s à 50 pas, 61,3 s à 16 pas — [arXiv 2510.22200](https://arxiv.org/abs/2510.22200). Tous les composants sont chargés en `torch.bfloat16` — [run_demo_image_to_video.py](https://github.com/meituan-longcat/LongCat-Video/blob/main/run_demo_image_to_video.py). CacheDiT apporte « nearly 1.7x speedup » — [README](https://github.com/meituan-longcat/LongCat-Video)
- **LongCat-Video, VRAM** (sources secondaires, non officielles et contradictoires) : « at least 80GB of VRAM » selon DigitalOcean — [DigitalOcean](https://www.digitalocean.com/community/tutorials/longcat-video-sora-alternative). Selon un tutoriel ComfyUI, la version FP8 tient en 12 à 16 Go et la version BF16 demande 24 Go ou plus — [stablediffusiontutorials](https://www.stablediffusiontutorials.com/2025/11/longcat-long-video-generation.html). Des poids `LongCat_TI2V_comfy_fp8_e4m3fn_scaled_KJ` et `_bf16` sont disponibles — [Kijai/LongCat-Video_comfy](https://huggingface.co/Kijai/LongCat-Video_comfy)
- **CamI2V** (RTX 3090, 256×256, 25 pas DDIM) : 11,67 Gio et 10,3 s par génération (DynamiCrafter seul : 11,14 Gio et 8,14 s) — [README](https://github.com/ZGCTroy/CamI2V)
- **RealCam-I2V** : `image2video.offload_cpu()` dans l'application. Pas de chiffre de VRAM ni de temps publié — [gradio_app.py](https://github.com/ZGCTroy/RealCam-I2V/blob/main/finetune/gradio_app.py)
- **I2V-Adapter** : tout en `torch.float16` (UNet, VAE, encodeurs) — [inference.py](https://github.com/KwaiVGI/I2V-Adapter/blob/main/inference.py). Pas de chiffre de temps publié.
- **SkyReels-V2 en ComfyUI** : il existe des poids fp16 (`Wan2_1-SkyReels-V2-I2V-14B-540P_fp16`, `…-DF-14B-540P_fp16`), fp8 (`e4m3fn`, `e5m2`) et fp32 pour le DF 1.3B — [Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy)

### Inferences
- **Sur T4 Kaggle** : SkyReels-V2 DF 1.3B 540P (14,7 Go de pic annoncés, GPU non nommé) est le seul modèle long qui tiendrait en théorie dans 16 Go. Il faudrait des poids fp16 ou fp32 (il en existe chez Kijai) et le calcul en fp16, mais sa licence l'exclut. FramePack demanderait de forcer le transformeur en fp16 (non testé par l'auteur, risque de NaN ou d'artefacts) ; licence également exclue.
- **LongCat sur T4** : les poids fp8 se stockent mais le T4 n'a pas d'unités FP8, donc conversion en fp16 à la volée et déchargement par blocs. Probablement plusieurs dizaines de minutes par clip de 6 s ; à mesurer. Sur GPU loué de classe H800/H100, on peut tabler sur environ 2 min pour 93 images en 720p (3,1 s à 30 fps), soit environ 37 s de calcul par seconde de vidéo (116,5 s / 3,1 s, calcul fait à partir du rapport).
- **P100** (Pascal) : pas de bf16, fp16 lent. Aucun des trois modèles longs n'y est raisonnable.

### Gaps
- Aucun temps mesuré sur T4 ou P100 pour ces neuf outils : à mesurer sur notre propre notebook Kaggle (greffe en cours).
- VRAM officielle de LongCat-Video : non publiée ; les deux chiffres secondaires (80 Go contre 12–16 Go en FP8) se contredisent.

## 5. Intégration ComfyUI : natif ou paquet de nœuds (nom, licence, dernier commit)

### Takeaway
FramePack (wrapper Kijai, Apache-2.0), SkyReels-V2 et LongCat-Video (via ComfyUI-WanVideoWrapper de Kijai, Apache-2.0, actif en mai 2026) sont branchables dans ComfyUI. Aucun n'est natif dans le cœur de ComfyUI d'après `model_detection.py`. I2V-Adapter a un nœud abandonné et sans licence. CamI2V, RealCam-I2V, ImageConductor, VideoBooth et ShowMe n'ont aucun nœud recensé dans ComfyUI-Manager.

### Cited Findings
- **FramePack** :
  - kijai/ComfyUI-FramePackWrapper : Apache-2.0, dernier commit le 13/01/2026 (`a0eeaa6`), README « WORK IN PROGRESS ». Il utilise les encodeurs de texte, le VAE et le SigLIP natifs de ComfyUI, et le transformeur `FramePackI2V_HY` (bf16 ou fp8_e4m3fn) — [dépôt](https://github.com/kijai/ComfyUI-FramePackWrapper)
  - Autres paquets recensés : ShmuelRonen/ComfyUI-FramePackWrapper_Plus (Apache-2.0, 20/05/2025) ; TTPlanetPig/TTP_Comfyui_FramePack_SE (Apache-2.0, 25/04/2025, images de début et de fin) ; HM-RunningHub/ComfyUI_RH_FramePack (pas de LICENSE trouvé, 06/05/2025) ; xhiroga/ComfyUI-FramePackWrapper_PlusOne ; CY-CHENYUE/ComfyUI-FramePack-HY — [ComfyUI-Manager custom-node-list.json](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json) ; [Plus](https://github.com/ShmuelRonen/ComfyUI-FramePackWrapper_Plus) ; [SE](https://github.com/TTPlanetPig/TTP_Comfyui_FramePack_SE) ; [RH](https://github.com/HM-RunningHub/ComfyUI_RH_FramePack)
- **SkyReels-V2** :
  - kijai/ComfyUI-WanVideoWrapper (Apache-2.0, dernier commit le 24/05/2026, `088128b`) liste « SkyReels » parmi les modèles pris en charge — [README](https://github.com/kijai/ComfyUI-WanVideoWrapper)
  - Poids convertis : Kijai/WanVideo_comfy (dossier `Skyreels/`) — [HF](https://huggingface.co/Kijai/WanVideo_comfy)
  - L'intégration diffusers existe : `SkyReelsV2DiffusionForcingPipeline`, `…ImageToVideoPipeline`, `…VideoToVideoPipeline` — [README](https://github.com/SkyworkAI/SkyReels-V2)
- **LongCat-Video** :
  - Même wrapper : « Not exactly Wan model, but close enough to work with the code base: LongCat-Video » — [README WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper)
  - Poids ComfyUI `Kijai/LongCat-Video_comfy` (MIT, modifié le 22/12/2025) : TI2V bf16 et fp8, LoRA de distillation, LoRA de raffinement — [HF](https://huggingface.co/Kijai/LongCat-Video_comfy)
  - Nœuds Avatar (comparaison) : smthemex/ComfyUI_LongCat_Avatar et rookiestar28/ComfyUI-LongCat-Avatar (Avatar 1.5) — [ComfyUI-Manager list](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json)
- **Cœur de ComfyUI** : la recherche « framepack / longcat / skyreels » dans `comfy/model_detection.py` ne trouve qu'un commentaire « SkyReels img2video has 32 input channels » (lié à l'ancienne génération SkyReels basée sur Hunyuan) et « LongCat-Image ». Pas de détection native de FramePack ni de LongCat-Video — [model_detection.py](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/model_detection.py)
- **I2V-Adapter** : AIFSH/ComfyUI-I2V-Adapter, aucun LICENSE trouvé, dernier commit le 02/07/2024 — [dépôt](https://github.com/AIFSH/ComfyUI-I2V-Adapter)
- **CamI2V, RealCam-I2V, ImageConductor, VideoBooth, ShowMe** : aucune entrée trouvée dans la liste ComfyUI-Manager (recherche par nom du 16/10/2026) — [custom-node-list.json](https://github.com/ltdrdata/ComfyUI-Manager/blob/main/custom-node-list.json)

### Inferences
- LongCat-Video peut s'intégrer à notre serveur ComfyUI distant sans code maison, via WanVideoWrapper et les poids Kijai, tout en restant sous MIT. Le wrapper étant un code tiers sous Apache-2.0, il est conforme à notre règle.
- Les SkyReels-V2 I2V reprennent l'architecture Wan2.1 I2V. Les nœuds Wan natifs de ComfyUI les chargent probablement, ce que nous n'avons pas vérifié ; c'est sans effet sur le verdict (licence).

### Gaps
- Pas de vérification qu'un graphe WanVideoWrapper + LongCat fonctionne en fp16 sur T4 : à tester (greffe en cours).

## 6. Maintenance (dernier commit) et état des démos gratuites (Spaces) au 16/10/2026

### Takeaway
Seul LongCat-Video est actif en 2026 (commit du 27/05/2026, Avatar 1.5 en mai 2026). SkyReels-V2 n'évolue plus depuis la sortie de V3 (janvier 2026). FramePack et RealCam ont eu leur dernier commit en octobre 2025, CamI2V en septembre 2025, ShowMe en décembre 2025. ImageConductor, I2V-Adapter et VideoBooth sont figés depuis mi-2024. Parmi les Spaces vérifiés, seul `linoyts/FramePack-F1` tourne sur GPU.

### Cited Findings
- Derniers commits (clone git superficiel du 16/10/2026) :

| Dépôt | Dernier commit | Message | Source |
|---|---|---|---|
| FramePack | 15/10/2025 | « fix » | [commits](https://github.com/lllyasviel/FramePack/commits/main) |
| SkyReels-V2 | 29/01/2026 | « Update README with SkyReels-V3 launch news » | [commits](https://github.com/SkyworkAI/SkyReels-V2/commits/main) |
| SkyReels-V3 | 30/01/2026 | « fixbug » | [commits](https://github.com/SkyworkAI/SkyReels-V3/commits/main) |
| LongCat-Video | 27/05/2026 | « Update README.md » | [commits](https://github.com/meituan-longcat/LongCat-Video/commits/main) |
| CamI2V | 29/09/2025 | « update evalution scripts » | [commits](https://github.com/ZGCTroy/CamI2V/commits/main) |
| RealCam-I2V | 19/10/2025 | « update scripts » | [commits](https://github.com/ZGCTroy/RealCam-I2V/commits/main) |
| ImageConductor | 18/07/2024 | — | [commits](https://github.com/liyaowei-stu/ImageConductor/commits/main) |
| I2V-Adapter | 18/06/2024 | un seul commit | [commits](https://github.com/KwaiVGI/I2V-Adapter/commits/main) |
| VideoBooth | 09/06/2024 | — | [commits](https://github.com/Vchitect/VideoBooth/commits/main) |
| ShowMe-master | 11/12/2025 | « Update evaluation README » | [commits](https://github.com/yujiangpu20/ShowMe-master/commits/main) |

- FramePack-P1 (anti-dérive planifiée, discrétisation de l'historique) est annoncé dans le README avec des résultats publiés en juin et juillet 2025, présenté comme « the next version of FramePack » — [README](https://github.com/lllyasviel/FramePack)
- Spaces (API HF, `runtime.stage` au 16/10/2026) :
  - `linoyts/FramePack-F1` : RUNNING sur zero-a10g — [Space](https://huggingface.co/spaces/linoyts/FramePack-F1)
  - `lisonallen/framepack-i2v` : CONFIG_ERROR — [Space](https://huggingface.co/spaces/lisonallen/framepack-i2v)
  - `fffiloni/SkyReels-V2` : RUNNING mais sur cpu-basic — [Space](https://huggingface.co/spaces/fffiloni/SkyReels-V2)
  - `Skywork/SkyReels-V3` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/Skywork/SkyReels-V3)
  - `multimodalart/LongCat-Video` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/multimodalart/LongCat-Video)
  - `TencentARC/ImageConductor` : RUNTIME_ERROR — [Space](https://huggingface.co/spaces/TencentARC/ImageConductor)
  - Aucun Space trouvé pour CamI2V, RealCam, I2V-Adapter ou VideoBooth (recherche API HF par nom).

### Inferences
- Le Space SkyReels-V2 sur CPU est très probablement une simple interface (à dupliquer sur GPU) plutôt qu'une démo qui génère réellement. Non vérifié.

### Gaps
- Nombre d'étoiles et issues ouvertes : non relevés (API GitHub fermée à cette session).
- État des Spaces LongCat-Video-Avatar-1.5 (comparaison) non vérifié.

## 7. Verdict pour notre usage : moteur principal / couche plan long ou caméra / rejet

### Takeaway
**Aucun des neuf n'est un moteur principal** : aucun ne prend la voix, et la parole multi-personnages reste du ressort des outils couverts ailleurs. **LongCat-Video est le seul à retenir, comme couche « plan long / continuité »** : code et poids MIT, I2V et continuation natives, 720p 30 fps, nœuds ComfyUI disponibles. Il faut un GPU loué ; le T4 reste à mesurer. Les huit autres sont rejetés, pour des raisons de licence d'abord, puis de résolution, de durée ou de domaine.

### Cited Findings
- **LongCat-Video : couche plan long / continuité (GPU loué)**. MIT pour le code et les poids — [HF](https://huggingface.co/meituan-longcat/LongCat-Video). Continuation native « minutes-long » sans dérive de couleur — [README](https://github.com/meituan-longcat/LongCat-Video). 116,5 s pour 93 images en 720p sur un H800 — [arXiv 2510.22200](https://arxiv.org/abs/2510.22200). Intégration ComfyUI via WanVideoWrapper — [README](https://github.com/kijai/ComfyUI-WanVideoWrapper)
- **FramePack et F1 : rejet (licence des poids)**. Le code est sous Apache-2.0, mais les poids dérivent de HunyuanVideo (étiquette `tencent-hunyuan-community` sur les reconditionnements, exclusion UE/RU/Corée du Sud, interdiction d'utiliser les sorties pour améliorer un autre modèle) — [LICENSE Hunyuan](https://huggingface.co/tencent/HunyuanVideo/blob/main/LICENSE) ; [Kijai/HunyuanVideo_comfy](https://huggingface.co/Kijai/HunyuanVideo_comfy). Facteur aggravant : transformeur en bf16, GPU série 20XX « not tested » — [README](https://github.com/lllyasviel/FramePack)
- **SkyReels-V2 et V3 : rejet (licence)**. Skywork Community License : commercial autorisé mais propriétaire, révocable, sous droit chinois — [PDF](https://github.com/SkyworkAI/Skywork/blob/main/Skywork%20Community%20License.pdf). Facteur aggravant : contenu animé filtré à l'entraînement — [arXiv 2504.13074](https://arxiv.org/abs/2504.13074)
- **CamI2V : rejet**. Base DynamiCrafter « personal/research/non-commercial » — [fiche](https://huggingface.co/Doubiiu/DynamiCrafter_512). Clips de 16 images en 512×320 paysage — [README](https://github.com/ZGCTroy/CamI2V)
- **RealCam-I2V : rejet**. Code sans licence ; base CogVideoX sous licence propriétaire avec enregistrement commercial — [LICENSE CogVideoX](https://huggingface.co/zai-org/CogVideoX1.5-5B-I2V/blob/main/LICENSE)
- **ImageConductor : rejet**. Code sans licence ; SD1.5 en 384×256 ; dépôt figé depuis 2024 ; Space en erreur — [dépôt](https://github.com/liyaowei-stu/ImageConductor) ; [Space](https://huggingface.co/spaces/TencentARC/ImageConductor)
- **I2V-Adapter : rejet**. Code sans licence ; SD1.5 en 256 ou 512 px sur 16 images ; un seul commit — [dépôt](https://github.com/KwaiVGI/I2V-Adapter)
- **VideoBooth : rejet**. Pas d'image→vidéo de notre image (il génère un nouveau sujet à partir d'un prompt image) ; aucune licence ; SD1.4 — [README](https://github.com/Vchitect/VideoBooth)
- **ShowMe : rejet**. Recherche sur la prédiction d'actions égocentriques ; base DynamiCrafter non commerciale ; pas de LICENSE — [README ShowMe](https://github.com/yujiangpu20/ShowMe-master)

### Inferences
**Synthèse**

| Outil | Licence code / poids | Plan long | Caméra | T4 16 Go | ComfyUI | Verdict |
|---|---|---|---|---|---|---|
| LongCat-Video | MIT / MIT | oui (continuation, 720p 30 fps) | via prompt | non prouvé (bf16, 13,6 milliards de paramètres) | WanVideoWrapper | **couche plan long (GPU loué)** |
| FramePack et F1 | Apache-2.0 / Hunyuan Community | oui (60 s à 30 fps) | non | non prouvé (bf16) | Kijai wrapper | rejet (poids) |
| SkyReels-V2 | Skywork / Skywork | oui (DF, 1457 images = 60 s) | non | DF 1.3B ≈ 14,7 Go de pic | WanVideoWrapper | rejet (licence) |
| CamI2V | MIT / MIT + DynamiCrafter non commercial | non (16 images) | oui | 11,67 Gio sur 3090 | aucun | rejet |
| RealCam-I2V | aucune / MIT + CogVideoX | non (≤ 161 images) | oui (métrique) | ? | aucun | rejet |
| ImageConductor | aucune / Apache + SD1.5 | non | oui (trajectoires) | probable (SD1.5) | aucun | rejet |
| I2V-Adapter | aucune / Apache + SD1.5 | non | non | probable (fp16) | nœud mort | rejet |
| VideoBooth | aucune / aucune + SD1.4 | non | non | ? | aucun | rejet |
| ShowMe | aucune / DynamiCrafter | non | non | ? | aucun | rejet |

**Innovations proposées** (veille combinée aux outils natifs, à mesurer ; pas des faits établis) :
1. **Plan long hybride « LongCat + couche parole »** : LongCat-Video I2V (480p distillé, 16 pas) fournit 6 s de plan large vivant (respirations, gestes de table), puis la continuation prolonge le plan. Les répliques en gros plan restent confiées aux moteurs audio (Wan2.2-S2V, InfiniteTalk, LongCat-Video-Avatar, couverts ailleurs). Critère d'acceptation : sur 3 images de la troupe, dérive d'identité (similarité visage et costume par rapport à l'image 0) au-dessus du seuil `mesure2.py` sur 30 s, et coût inférieur ou égal à 1 min de GPU loué par 10 s de vidéo.
2. **Caméra « 2.5D maison » à la place de CamI2V et RealCam** : reprendre l'idée publiée de RealCam (profondeur métrique, puis trajectoire caméra, puis rendu de prévisualisation par reprojection) avec Depth-Anything-V2-**Small** (Apache-2.0, licence sans ambiguïté) ou Metric3D (BSD-2). Le travelling ou zoom 2.5D est rendu directement dans notre moteur sur l'image de la troupe, puis repassé dans LongCat ou Wan en mode vidéo→vidéo pour combler les occlusions. Critère d'acceptation : aucun modèle sous licence non commerciale dans la chaîne, et parallaxe mesurée cohérente (pas de cisaillement visible des personnages) sur 5 trajectoires types (avancée, recul, arc, panoramique, plongée).
3. **Réécrire l'anti-dérive FramePack sur une base sous licence libre** : la méthode (contexte compressé et échantillonnage anti-dérive inversé) est publiée et son code est sous Apache-2.0. Seuls les poids posent problème. Une greffe sur un modèle Apache ou MIT (Wan2.1/2.2 ou LongCat) demanderait un affinage, donc un GPU loué. À évaluer seulement si la continuation LongCat dérive sur nos mesures.

### Gaps
- Aucun des verdicts ne repose encore sur une mesure faite sur nos propres images. Plan de greffe : notebook Kaggle T4 (LongCat fp16 avec déchargement par blocs via WanVideoWrapper) et GPU loué (référence H100/H800), avec 3 images de la troupe en 9:16 et les métriques `mesure2.py` / `measure.ts` / `grammaire_plans.py`, avant toute intégration au moteur.
- Le registre d'innovations et le journal de veille vivent dans `.claude/skills/` ; consigne de cette tâche : ne pas les modifier. Les trois idées ci-dessus restent à y reporter par l'agent principal.
