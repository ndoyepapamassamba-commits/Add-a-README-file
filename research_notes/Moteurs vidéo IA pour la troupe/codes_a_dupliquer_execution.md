# Codes à dupliquer : faire tourner les moteurs vidéo ouverts sur matériel faible ou gratuit (T4 16 Go, CPU 4 cœurs) — état au 16/10/2026

Demande de l'utilisateur : « cherche des codes moteurs à dupliquer ». Cette note couvre l'**étage d'exécution** : les
dépôts qui font **tourner** Wan 2.1/2.2, LTX-2.x, H3, etc. sur un **T4 16 Go** gratuit (Kaggle T4×2, Colab, Lightning),
voire sur le **CPU** du conteneur (4 cœurs, 15 Go de RAM, sans GPU). Elle couvre aussi les notebooks Kaggle/Colab prêts
à dupliquer.

Méthode : pages GitHub, flux Atom des commits, fichiers `LICENSE`, docs officielles (diffusers, ComfyUI, LightX2V,
DiffSynth, OpenVINO, SD.Next) et fiches Hugging Face, **lus le 16/10/2026**. Aucun dépôt n'a été cloné ni exécuté, aucun
poids n'a été téléchargé, aucun compte n'a été créé. Les étoiles et les dates viennent de la page GitHub ou du flux
`commits/<branche>.atom` du jour. Les licences sont **telles qu'affichées** et restent à confirmer par
`verification_licences.md` ou une passe juridique. Les phrases marquées **(inférence)** sont nos déductions, pas des
faits publiés.

Rappels hérités des notes précédentes (non revérifiés ici) : le T4 n'a ni bf16, ni FP8 matériel, ni FlashAttention-2
(`modeles_ouverts_2026.md`). Kaggle offre T4×2, ≈ 30 h par semaine et des sessions de 12 h ; le P100 est retiré depuis le
15/09/2026 (`verification_gratuit.md`). Colab gratuit restreint « bypassing the notebook UI to interact primarily via a
web UI » (`verification_gratuit.md`). D'où l'intérêt des modes **sans interface** (headless) décrits plus bas.

---

## 1. Takeaway

- **Le meilleur moteur d'exécution à dupliquer tel quel est Wan2GP (WanGP)**. Il est très actif (v18.10 du 15/10/2026,
  10,5k étoiles) et vise explicitement les petits GPU (« GTX 10XX, RTX 20XX, and newer »). Il a un drapeau `--fp16` (le
  T4 n'a pas de bf16), des profils de délestage (`--profile 4/4.5/5`) et un **mode headless** `--process
  fichier.json|.zip`, idéal pour un notebook Kaggle piloté par script. Sa licence (« WanGP Community License 2.0 »)
  autorise la **vente des vidéos produites** et l'usage privé automatisé. Elle interdit de revendre l'outil ou de
  l'exposer à des tiers comme service payant. Point à faire trancher : sa dépendance `mmgp` est sous GPL-3.0 dans
  `LICENSE.md`, mais son README dit « free to use … for non commercial use ».
- **Alternative 100 % licences libres classiques** : ComfyUI (GPL-3.0) + ComfyUI-GGUF (Apache-2.0) +
  ComfyUI-WanVideoWrapper (Apache-2.0) + VideoHelperSuite (GPL-3.0). La GPL n'empêche ni l'usage commercial ni la vente
  des vidéos. Elle oblige seulement à publier les sources **si l'on redistribue** le logiciel modifié. ComfyUI annonce
  « as low as 4GB vram + 8GB ram ». La doc officielle dit que Wan 2.2 5B « should fit well on 8GB vram with the ComfyUI
  native offloading ». Le pilotage se fait par l'API locale (workflow JSON), sans interface web exposée.
- **Pour écrire notre propre moteur Python** (le « moteur de la troupe ») : **diffusers** (Apache-2.0, 0.41.0 du
  06/10/2026) fournit `WanPipeline`, `WanImageToVideoPipeline`, `WanVACEPipeline`, `WanAnimatePipeline`, le délestage
  par groupes (« ~13GB of VRAM » pour Wan 2.1 14B T2V) et le chargement des LoRA lightx2v (`load_into_transformer_2`).
  **DiffSynth-Studio** (Apache-2.0) ajoute 37 scripts « low VRAM » prêts à copier (TI2V-5B, I2V-A14B, Animate, S2V, VACE)
  et l'entraînement LoRA. **LightX2V** (Apache-2.0) vise « 8GB VRAM + 16/32GB RAM » avec délestage disque–CPU–GPU, mais
  sa doc ne mentionne ni Turing ni fp16.
- **CPU seul** : **stable-diffusion.cpp** (MIT, ggml, très actif) lit Wan 2.1/2.2, VACE, S2V, LTX-2.5 et H3 en GGUF,
  avec backend CPU AVX2/AVX512 et `--offload-to-cpu`/`--vae-tiling`. Les **notebooks OpenVINO** (Apache-2.0) convertissent
  Wan 2.2 TI2V-5B, Wan 2.1, LTX-Video et Bernini-R en INT8/INT4 pour CPU Intel. **Aucun chrono CPU publié** pour une
  vidéo Wan : sur 4 cœurs, ces outils servent à des **tests de plomberie** (quelques images, basse résolution), pas à la
  production.
- **Notebooks gratuits** : il y en a, mais **la plupart n'ont pas de licence** : WanGP-Kaggle (kayas881), TeamAIQ
  (LTX/H3 sur Kaggle T4×2), wan-2.2-animate-comfyui-kaggle. Sans licence, on peut les **lire** et s'en inspirer, mais pas
  les recopier légalement. Il faut réécrire nos propres cellules. Deux sont sous licence libre : **Wan2GP-on-Colab**
  (Square-Zero-Labs, Apache-2.0, recommande « Wan 2.2 TextImage2Video 5B FastWan » en 480p sur T4) et
  **wan2.2-google-colab** (theelderemo, Apache-2.0, mais il appelle le code officiel qui demande 24 Go).

---

## 2. Tableau de synthèse

Légende T4 : ✔ = documenté ou très probable ; ~ = possible sous conditions (délestage, quantification, 480p) ; ✘ = non.
CPU = conteneur à 4 cœurs, 15 Go de RAM.

| # | Dépôt (URL canonique) | Rôle | Licence affichée | Étoiles (16/10) | Dernière activité vue | T4 16 Go | CPU 4 cœurs |
|---|---|---|---|---|---|---|---|
| 1 | [deepbeepmeep/Wan2GP](https://github.com/deepbeepmeep/Wan2GP) | moteur tout-en-un basse VRAM | WanGP Community License 2.0 (maison) | 10,5k | commit 15/10/2026, v18.10 | ✔ `--fp16 --profile 4`, FastWan 5B 480p ; 14B en streaming RAM | ✘ (pas de mode CPU documenté) |
| 2 | [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | moteur à graphe + API locale | GPL-3.0 | 137,7k | commit 16/10/2026 | ✔ `--fp16-unet`, GGUF, délestage asynchrone | ~ `--cpu` « (slow) » |
| 3 | [kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) | nœuds Wan avancés (Animate, MultiTalk, VACE…) | Apache-2.0 | 6,7k | commit 24/05/2026 (branche main) | ~ block swap, GGUF, fp8 stocké | ✘ |
| 4 | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | chargeur GGUF (DiT + T5) | Apache-2.0 | 4,2k | commit 12/01/2026 | ✔ clé du T4 (Q4–Q8) | ~ |
| 5 | [Kosinkadink/ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | lecture/écriture vidéo + audio (ffmpeg) | GPL-3.0 | 1,9k | commit 02/09/2026 | ✔ (pas de GPU) | ✔ |
| 6 | [pollockjj/ComfyUI-MultiGPU](https://github.com/pollockjj/ComfyUI-MultiGPU) | répartir T5/DiT/VAE sur 2 GPU | GPL-3.0 | 992 | **archivé le 30/09/2026** | ~ utile pour T4×2 | ~ (CPU comme mémoire donneuse) |
| 7 | [modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | moteur Python + entraînement LoRA | Apache-2.0 | 13,3k | commit 15/10/2026 | ~ `vram_limit`, délestage par couche ou sur disque (exemples en bf16) | ✘ |
| 8 | [ModelTC/LightX2V](https://github.com/ModelTC/LightX2V) | moteur d'inférence accéléré (4 pas, délestage) | Apache-2.0 | 2,9k | commit 15/10/2026 | ~ « 8GB VRAM + 16/32GB RAM », int8 ; Turing/fp16 non documentés | ✘ |
| 9 | [huggingface/diffusers](https://github.com/huggingface/diffusers) | bibliothèque de pipelines (base de notre moteur) | Apache-2.0 | 34,7k | release 0.41.0 du 06/10/2026 | ✔ délestage par groupes, `from_single_file`, LoRA lightx2v | ~ (`.to("cpu")` possible, très lent) |
| 10 | [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (+ [stable-diffusion-cpp-python](https://github.com/william-murray1204/stable-diffusion-cpp-python)) | moteur C++/ggml sans PyTorch | MIT (les deux) | 7,7k (+126) | commit 15/10/2026 | ✔ CUDA + `--offload-to-cpu` (VAE TI2V-5B gourmand) | ✔ seul candidat CPU natif (AVX2/AVX512) ; lent |
| 11 | [vladmandic/sdnext](https://github.com/vladmandic/sdnext) | interface web tout-en-un (Wan, LTX, FramePack…) | Apache-2.0 (LICENSE.txt) | 7,4k | commit 15/10/2026 (branche dev) | ~ « at least 16GB VRAM and 64GB RAM » recommandés | ~ backends CPU/OpenVINO listés, vidéo non confirmée |
| 12 | [openvinotoolkit/openvino_notebooks](https://github.com/openvinotoolkit/openvino_notebooks) (+ [openvino.genai](https://github.com/openvinotoolkit/openvino.genai)) | conversion INT8/INT4 pour CPU Intel | Apache-2.0 | 3,2k (+601) | notebook Wan2.2 TI2V fusionné le 30/01/2026 | sans objet | ~ seule voie CPU « officielle » ; « EXPERIMENTAL » |
| 13 | [deepbeepmeep/mmgp](https://github.com/deepbeepmeep/mmgp) | gestionnaire mémoire (cœur de WanGP) | **ambiguë** : GPL-3.0 (LICENSE.md) mais « non commercial use » (README) | 195 | PyPI 3.8.2 du 27/09/2026 | ✔ (moteur du délestage WanGP) | ✘ |
| 14 | [hao-ai-lab/FastVideo](https://github.com/hao-ai-lab/FastVideo) (poids FastWan) | distillation 3 pas Wan 2.2 5B | Apache-2.0 (code et poids FastWan) | 4,6k | commit 15/10/2026 | ~ via WanGP ; FastVideo lui-même ne vise pas Turing | ✘ |
| 15 | [thu-ml/SageAttention](https://github.com/thu-ml/SageAttention) | attention quantifiée (accélération) | Apache-2.0 | 4,0k | non relevée | ~ v1.0.6 (Triton) conseillée par WanGP pour RTX 20XX | ✘ |
| 16 | [kayas881/WanGP-Kaggle](https://github.com/kayas881/WanGP-Kaggle) (+ [comfyui-kaggle](https://github.com/kayas881/comfyui-kaggle)) | notebooks Kaggle T4 (WanGP ; ComfyUI) | **aucune licence** | 18 (+8) | 30/12/2025 | ✔ « ~9-15 minutes per video on T4 » | — |
| 17 | [Square-Zero-Labs/Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab) | notebook Colab WanGP | Apache-2.0 | 168 | 31/08/2026 | ✔ FastWan 5B en 480p « testé » | — |
| 18 | [TeamAIQ/Colab-notebooks](https://github.com/TeamAIQ/Colab-notebooks) | notebooks Kaggle T4×2 LTX-2.3/2.5, H3 | **aucune licence** (LICENSE 404) | 554 | 13/10/2026 | ~ « Optimized for Kaggle GPU T4 x2 » | — |
| 19 | [kelvinweijun/wan-2.2-animate-comfyui-kaggle](https://github.com/kelvinweijun/wan-2.2-animate-comfyui-kaggle) | Wan 2.2 Animate GGUF sur Kaggle T4×2 | **aucune licence** | 5 | 27/11/2025 | ~ Q3_K_M, demande « 32 GB RAM » | — |
| 20 | [theelderemo/wan2.2-google-colab](https://github.com/theelderemo/wan2.2-google-colab) | gabarit Colab sur le code officiel Wan 2.2 | Apache-2.0 (déclaré dans le README) | 60 | 26/03/2026 | ✘/~ code officiel : 24 Go minimum pour TI2V-5B | — |

---

## 3. Fiches détaillées

### 3.1 Wan2GP / WanGP — `deepbeepmeep/Wan2GP` (moteur d'exécution principal recommandé)

**Faits lus**
- 10,5k étoiles, 1,7k forks, 1 854 commits. Release « WanGP v18.10 - More Drama per Gigabyte » du **15/10/2026**. Derniers
  commits « flux 3 + Fish Audio Drama » (15/10/2026) et « optimisations » (13/10/2026) — [README](https://github.com/deepbeepmeep/Wan2GP),
  [commits](https://github.com/deepbeepmeep/Wan2GP/commits/main).
- Modèles vidéo : Wan 2.1/2.2 et dérivés, MiniMax H3, LTX-2/2.3/2.5, Hunyuan Video 1/1.5, LongCat, Kandinsky, MagiHuman.
  On y trouve aussi de l'image (Qwen Image, Z-Image, Flux) et de l'audio/TTS (Qwen3 TTS, Chatterbox, Index TTS2…). Le
  README promet « as little as 6 GB of VRAM » et cite, pour H3, « only 5-6GB of VRAM » en 480p — [README](https://github.com/deepbeepmeep/Wan2GP).
- Matériel : « GTX 10XX, RTX 20XX, and newer ». Pour les RTX 20XX (Turing, comme le T4) : SageAttention 1.0.6 + Triton 3.2.
  Les GTX 10XX « should use SDPA » — [README](https://github.com/deepbeepmeep/Wan2GP).
- Quantifications : « int8, fp8, gguf, NV FP4, and Nunchaku », plus INT8 ConvRot et des noyaux GGUF CUDA — [README](https://github.com/deepbeepmeep/Wan2GP).
- Ligne de commande ([docs/CLI.md](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/CLI.md)) :
  - `--fp16` : « Force fp16 instead of bf16 models ».
  - `--profile 1–5` (4 recommandé) : en 4, les modèles principaux restent en RAM réservée et passent au GPU par morceaux ;
    4.5 économise environ 1 Go de VRAM ; 5 est le mode « fail safe » pour les machines courtes en RAM et en VRAM.
  - `--perc-reserved-mem-max` ; `--attention sdpa|sage|sage2|flash` (sage2 = RTX 30XX et plus).
  - **`--process PATH`** : « Path to queue (.zip) or settings (.json) file (enables headless mode) ». Avec aussi
    `--dry-run` et `--output-dir`, et les codes de sortie 0/1/130.
  - Exemple basse mémoire : `python wgp.py --fp16 --profile 4 --perc-reserved-mem-max 0.3`.
- Licence « WanGP Community License 2.0 » ([LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt)) :
  - 6.1 : « you may use, reproduce, publish, perform, display, distribute, sell, and license Outputs for any lawful purpose ».
  - 6.2 : crédit à WanGP requis seulement en cas de « Direct Output Sale ».
  - 3.2 et 7.1 : usage privé en mode « batch mode, queue mode, Headless Usage », script ou API privée autorisé pour la
    « Free Use ».
  - 1.9 et 7.2 : il est interdit de vendre l'outil, de l'exposer à des tiers comme API ou service hébergé contre
    rémunération, ou de l'intégrer à un produit payant.
  - 4.1 : la redistribution, même modifiée, est permise seulement pour la « Free Use », en signalant les modifications.
  - 3.1 : licence « worldwide », sans plafond de revenu.
  - 2.2 et 6.6 : les licences des modèles restent applicables.
- Dépendance `mmgp` : voir 3.13 (licence ambiguë).

**Pour la troupe (inférence)**
- C'est le seul dépôt qui réunit déjà toute la chaîne voulue : Wan 2.2 (I2V, Animate, VACE), avatars parlants
  (MultiTalk/InfiniteTalk, cités dans `coherence_personnages_lipsync.md`), TTS, LTX-2.5 avec audio, H3, file d'attente et
  headless. Plan d'usage : un notebook Kaggle installe WanGP, reçoit un `.zip` de file d'attente (un plan = une tâche) et
  lance `wgp.py --process queue.zip --fp16 --profile 4 --attention sdpa`. Les MP4 sont récupérés avec `kaggle kernels
  output`. Aucune interface web n'est exposée, ce qui évite les restrictions Colab et Gradio.
- T4×2 : WanGP ne documente pas de multi-GPU. On peut lancer **deux processus**, chacun avec son `CUDA_VISIBLE_DEVICES`,
  si la RAM de la session suffit (non vérifié).
- Risques : la licence est maison (pas OSI). Il est interdit d'en faire un service payant pour d'autres créateurs. La
  question `mmgp` est à trancher. Le dépôt évolue très vite, d'où le besoin d'**épingler un commit**.

### 3.2 ComfyUI — `Comfy-Org/ComfyUI` (moteur à graphe, alternative GPL)

**Faits lus**
- 137,7k étoiles, 16,4k forks, GPL-3.0. Dernier commit le 16/10/2026 — [README](https://github.com/Comfy-Org/ComfyUI),
  [commits](https://github.com/Comfy-Org/ComfyUI/commits/master).
- Modèles vidéo natifs : « Wan 2.1 and 2.2, LTX-Video 2 and 2.3, HunyuanVideo 1.5, Kandinsky 5 Video, CogVideoX,
  Cosmos Predict2, Bernini-R, SCAIL 2, and Mochi ». S'y ajoutent « MiniMax H3 and LTX-AV ». Le README affirme « Can run
  even the biggest open source models on as low as 4GB vram + 8GB ram » et propose « a local API for integrating workflows
  into applications ».
- Drapeaux utiles ([cli_args.py](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py)) :
  - `--cpu` : « To use the CPU for everything (slow) ».
  - `--novram` ; `--lowvram` : sans effet si la VRAM dynamique est active.
  - `--fp16-unet` : « Run the diffusion model in fp16 » ; `--force-fp16`.
  - `--fp16-vae` : « might cause black images » ; `--cpu-vae`.
  - `--use-sage-attention` ; `--reserve-vram`.
  - `--cuda-device` : « '0' or '0,1' ».
  - `--async-offload` : « Enabled by default on Nvidia ».
- Wan 2.2 5B : « should fit well on 8GB vram with the ComfyUI native offloading ». Fichiers :
  `wan2.2_ti2v_5B_fp16.safetensors`, `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, `wan2.2_vae.safetensors` —
  [docs.comfy.org Wan2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2).

**Pour la troupe (inférence)**
- Le moteur « libre » le plus éprouvé. Les workflows sont des **fichiers JSON versionnables**, un par type de plan
  (dialogue, entrée en scène, plan large). Un script Python dans le notebook poste ces JSON à l'API locale
  `127.0.0.1:8188`, sans interface exposée.
- Sur T4, lancer avec `--fp16-unet --cpu-vae` (ou un VAE en fp32) et charger le DiT en GGUF via ComfyUI-GGUF.
  L'encodeur umt5 en « fp8 scaled » est un format de **stockage** : sur T4, le calcul doit se faire en fp16 (non
  vérifié pour Turing).
- La GPL n'impose rien sur les vidéos produites. On ne publie le code que si l'on **redistribue** le moteur modifié.

### 3.3 ComfyUI-WanVideoWrapper — `kijai/ComfyUI-WanVideoWrapper`

**Faits lus**
- 6,7k étoiles, 696 forks, Apache-2.0, 1 439 commits, 1,2k tickets ouverts. Derniers commits sur `main` : « Initial
  LongCatAvatar 1.5 support » (23/05/2026), « Fix multitalk_audio_stride init » (24/05/2026) — [README](https://github.com/kijai/ComfyUI-WanVideoWrapper),
  [commits](https://github.com/kijai/ComfyUI-WanVideoWrapper/commits/main).
- Modèles pris en charge : WanAnimate, MultiTalk, VACE, FantasyTalking, SkyReels, WanVideoFun, ReCamMaster, Phantom,
  ATI, Uni3C, MAGREF, FantasyPortrait, HuMo, Stand-In, EchoShot, Lynx, MoCha, UniLumos, BindWeave, LongCat-Video, SCAIL.
  Le dépôt contient aussi un dossier Ovi.
- Basse VRAM : « ~16GB used with 20/40 blocks offloaded » (block swap), « GGUF models can now be loaded in the main model
  loader », recommandation des « fp8 scaled models », préchargement asynchrone des LoRA. Les seuls chiffres donnés sont
  mesurés sur une 5090 ; le T4 et le fp16 ne sont pas mentionnés.

**Pour la troupe (inférence)**
- Le meilleur catalogue de **nœuds « personnage »** : Animate (transfert de mouvement), MultiTalk/HuMo (bouche),
  Phantom/Stand-In/MAGREF (identité par référence). À dupliquer **dans ComfyUI**, comme bibliothèque de nœuds.
- Le rythme a ralenti sur `main` depuis fin mai 2026. Il faut vérifier la compatibilité avec le ComfyUI d'octobre 2026
  avant de tout miser dessus.
- Piège de licence (cf. `verification_licences.md`) : le dépôt de poids `Kijai/WanVideo_comfy` mêle LoRA lightx2v
  (Apache) et CausVid (non commercial). Ne prendre que les fichiers lightx2v.

### 3.4 ComfyUI-GGUF — `city96/ComfyUI-GGUF`

**Faits lus** : 4,2k étoiles, Apache-2.0. Le dépôt se décrit comme « GGUF Quantization support for native ComfyUI
models ». Il charge l'UNet/DiT (« Unet loader … under the `bootleg` category ») et l'encodeur T5 quantifié (« a node to
load a quantized version of the T5 text encoder »). « LoRA loading is experimental » ; « very much WIP ». Derniers
commits le 12/01/2026, dont « Add Gemma3 12B Support (#402) », utile pour l'encodeur de LTX-2 — [README](https://github.com/city96/ComfyUI-GGUF),
[commits](https://github.com/city96/ComfyUI-GGUF/commits/main).

**Pour la troupe (inférence)** : c'est la pièce qui fait tenir Wan 2.2 dans un T4. TI2V-5B Q4_K_M = 3,4 Go et A14B Q4_K_M
= 9,7 Go par expert (tailles dans `calcul_et_couts.md`). Le README ne cite que Flux et SD3.5, mais les GGUF Wan de
QuantStack et Kijai sont faits pour ce chargeur. Le dépôt est stable mais peu actif depuis janvier 2026.

### 3.5 ComfyUI-VideoHelperSuite — `Kosinkadink/ComfyUI-VideoHelperSuite`

**Faits lus** : 1,9k étoiles, GPL-3.0. Nœuds Load Video, Load Image Sequence, Video Combine et Load Audio. Video
Combine : « If the optional audio input is provided, it will also be combined into the output video ». Les formats sont
définis en JSON comme des « arguments that are passed to ffmpeg ». Dernier commit le 02/09/2026, dont « Support h3 as
input format » (25/08/2026) — [README](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite),
[commits](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/commits/main).

**Pour la troupe (inférence)** : c'est la sortie MP4 avec la piste de dialogue française dans le graphe ComfyUI. On peut
ajouter un format JSON « TikTok 1080×1920 H.264 + AAC ». Cela tourne sur CPU.

### 3.6 ComfyUI-MultiGPU — `pollockjj/ComfyUI-MultiGPU` (archivé)

**Faits lus** : 992 étoiles, GPL-3.0 ([LICENSE](https://github.com/pollockjj/ComfyUI-MultiGPU/blob/main/LICENSE)).
« archived by the owner on Sep 30, 2026. It is no longer maintained. » DisTorch déplace des couches GGUF ou
safetensors vers la RAM CPU ou la VRAM d'un autre GPU (« cuda:1 », « cpu »). Le dépôt fournit des nœuds WanVideo
dédiés (`WanVideoBlockSwapMultiGPU`) et des workflows « WanVideo 2.2 I2V A14B GGUF » et « Double UNet (No CPU) ». Il
n'y a aucun chiffre propre à Wan — [README](https://github.com/pollockjj/ComfyUI-MultiGPU).

**Pour la troupe (inférence)** : c'est exactement le besoin **Kaggle T4×2** : umt5 et VAE sur `cuda:1`, l'expert Wan
14B sur `cuda:0`, ou un expert par GPU. Mais le dépôt est archivé : il faut le **forker et épingler** une version qui
marche avec notre ComfyUI. Sinon, lancer deux instances ComfyUI (`--cuda-device 0` et `--cuda-device 1`) pour
paralléliser des plans entiers.

### 3.7 DiffSynth-Studio — `modelscope/DiffSynth-Studio`

**Faits lus**
- 13,3k étoiles, Apache-2.0. Commit du 15/10/2026 (« add json format for quant_options in training »). Nouveautés 2026 :
  Wan-Animate-2 (07/08), MiniMax-H3 (03/08), LTX-2.5 (10/09), entraînement par délestage CPU (18/05), EntroPack
  (29/09) — [README](https://github.com/modelscope/DiffSynth-Studio), [commits](https://github.com/modelscope/DiffSynth-Studio/commits/main).
- Dossier `examples/wanvideo/model_inference_low_vram` : 37 scripts, dont `Wan2.2-TI2V-5B.py`, `Wan2.2-I2V-A14B.py`,
  `Wan2.2-Animate-14B.py`, `Wan2.2-Animate-2-14B-Distilled.py`, `Wan2.2-S2V-14B.py`, `Wan2.1-VACE-1.3B.py` et
  `Wan2.1-T2V-1.3B.py` — [dossier](https://github.com/modelscope/DiffSynth-Studio/tree/main/examples/wanvideo/model_inference_low_vram).
- Gestion de la VRAM ([doc](https://diffsynth-studio-doc.readthedocs.io/en/latest/Pipeline_Usage/VRAM_management.html)) :
  `vram_config` (offload/onload/computation dtype et device) et `vram_limit`. Avec `vram_limit=0`, le framework stocke
  tout en RAM et ne transfère que le nécessaire. Le délestage sur disque n'accepte que le `.safetensors`. « Native FP8
  computation is only supported on Hopper » ; le FP8 « only reduces VRAM usage ». Tous les exemples calculent en
  `torch.bfloat16`. Un ancien exemple génère de la vidéo « on just 6GB VRAM ».

**Pour la troupe (inférence)** : c'est la meilleure **base Python lisible** à recopier pour notre moteur, avec un script
par modèle et le même dépôt pour l'entraînement LoRA des 54 personnages. Sur T4, il faudra passer `computation_dtype` en
`torch.float16` (non documenté, à tester) et garder `vram_limit` sous 15 Go.

### 3.8 LightX2V — `ModelTC/LightX2V`

**Faits lus**
- 2,9k étoiles, Apache-2.0. Commit du 15/10/2026 (« simplify Wan2.2 and Qwen Image configs and scripts »).
- Modèles : Wan2.1/2.2 (VACE, S2V, Animate), InfiniteTalk, LTX-2, HunyuanVideo-1.5, MiniMax-H3 (LoRA Turbo 4 et 8 pas),
  Self-Forcing, ainsi que SeedVR2 et SwiftVR pour la super-résolution. Délestage « across disk, CPU, and GPU with
  model-level and block-level offloading ». Quantification W8A8 (INT8/FP8) et W4A4 (NVFP4), GGUF sur certains matériels.
  Intégration ComfyUI, Gradio séparé et API de service — [README](https://github.com/ModelTC/LightX2V).
- [Guide basse ressource](https://lightx2v-en.readthedocs.io/en/latest/deploy_guides/for_low_resource.html) : cible
  « 8GB VRAM » et « Minimum: 16GB DDR4 » (32 Go conseillés), SSD NVMe, processeur AVX2. Clés : `cpu_offload=True`,
  `t5_cpu_offload=True`, `offload_granularity=phase`, `lazy_load = True`, `dit_quant_scheme` (`"int8"` = universel),
  `DTYPE=BF16`. Turing, T4 et fp16 ne sont pas mentionnés.

**Pour la troupe (inférence)** : c'est l'équipe qui publie les LoRA de distillation 4 pas que tout le monde utilise
(Apache). Le moteur lui-même est taillé pour Ada, Hopper et Blackwell (bf16, FP8, NVFP4). Sur T4, il faudrait forcer fp16
et int8 sans garantie. **À dupliquer pour ses idées** (délestage par phase, `lazy_load`, serveur API asynchrone) plutôt
que comme moteur T4 clé en main.

### 3.9 diffusers — `huggingface/diffusers`

**Faits lus**
- 34,7k étoiles, Apache-2.0. Release « Diffusers 0.41.0: QwenImage 2.1 pipeline and more » du 06/10/2026 — [releases](https://github.com/huggingface/diffusers/releases).
- Doc Wan ([page](https://huggingface.co/docs/diffusers/main/en/api/pipelines/wan)) :
  - pipelines `WanPipeline`, `WanImageToVideoPipeline`, `WanVACEPipeline` et `WanAnimatePipeline` (prétraitement pose
    et visage encore à faire avec le dépôt officiel) ; Wan 2.2 TI2V 5B listé ;
  - « The Wan2.1 text-to-video model below requires ~13GB of VRAM » avec `apply_group_offloading` (encodeur en
    block_level) et `transformer.enable_group_offload(... offload_type="leaf_level", use_stream=True)` ;
  - `from_single_file()` pour le transformer et le VAE ;
  - LoRA LightX2V pour accélérer ; `load_into_transformer_2=True` pour le second expert de Wan 2.2.

**Pour la troupe (inférence)** : c'est la base la plus **stable et documentée** pour écrire notre propre
`moteur_troupe.py` (I2V depuis la fiche du personnage, LoRA de personnage, LoRA 4 pas, export MP4). Elle est déjà
analysée en détail dans `anatomie_code_moteur_ouvert.md`. Sur T4 : `torch_dtype=torch.float16` pour le transformer, VAE
en float32, délestage par groupes, et éventuellement GGUF via `from_single_file` (non vérifié ici).

### 3.10 stable-diffusion.cpp — `leejet/stable-diffusion.cpp` (+ liaison Python `william-murray1204/stable-diffusion-cpp-python`)

**Faits lus**
- 7,7k étoiles, MIT. Commit du 15/10/2026 (« add FLUX.3 Image Klein »), et le 15/10/2026 aussi « prevent core dump in
  CPU backend if using FP8 (e4m3) tensors ». Vidéo : Wan2.1/2.2, Wan2.1 VACE, LTX-2.3/2.5 (nouvelle du 20/08/2026),
  MiniMax-H3, HunyuanVideo 1.5, LingBot-Video. Backends : « CPU (AVX, AVX2 and AVX512 support for x86 architectures) »,
  CUDA, Vulkan, Metal, OpenCL, SYCL. Formats .safetensors et .gguf. Options « VAE tiling », « Flash Attention » et
  décodeur TAESD — [README](https://github.com/leejet/stable-diffusion.cpp), [commits](https://github.com/leejet/stable-diffusion.cpp/commits/master).
- [docs/wan.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/wan.md) :
  - mode `-M vid_gen` ; exemples TI2V-5B (`-W 480 -H 832 --offload-to-cpu --video-frames 33`), A14B en paire
    `--diffusion-model` + `--high-noise-diffusion-model`, FLF2V (`--init-img --end-img`), VACE 1.3B/14B et S2V
    (`--audio`) ;
  - LoRA 4 pas (`--steps 4 --high-noise-steps 4`) ;
  - le VAE Wan « requires really much VRAM », TAE est conseillé en alternative ;
  - pour S2V : `--sampling-method euler`, car « dpm++2m produces heavy artifacts ».
  - Aucun chrono ni chiffre de VRAM.
- Problème déjà noté (`coherence_personnages_lipsync.md`) : le VAE de TI2V-5B y demande un tampon de 20 895,80 Mo pour
  2 s en 832×480 — [discussion #868](https://github.com/leejet/stable-diffusion.cpp/discussions/868).
- Liaison Python : 126 étoiles, MIT, « High-level Python API for Stable Diffusion, FLUX and Wan image/video
  generation », `generate_video(...)`, builds CPU, CUDA (`-DSD_CUDA=ON`) et Vulkan — [README](https://github.com/william-murray1204/stable-diffusion-cpp-python).
- Aucun chrono CPU publié pour Wan. Le chiffre le plus proche est une image SD sur CPU AVX2 en 249 s, contre 36 s en
  Vulkan (blog tiers, recherche web).

**Pour la troupe (inférence)** : c'est le **seul moteur qui tourne nativement sur le CPU du conteneur**, sans PyTorch et
sous licence MIT. Usage réaliste : tester la plomberie du moteur ici, avec Wan2.1 1.3B ou TI2V-5B en GGUF Q4, 33 images,
480×832, TAE. Puis lancer la même ligne de commande en CUDA sur Kaggle. Il faut compter des dizaines de minutes à des
heures par clip sur 4 cœurs (ordre de grandeur non mesuré) : **pas pour la production**.

### 3.11 SD.Next — `vladmandic/sdnext`

**Faits lus** : 7,4k étoiles. LICENSE.txt : Apache License 2.0. Commit du 15/10/2026 sur `dev`. Backends CUDA, ROCm,
ZLUDA, **OpenVINO**, IPEX, **CPU**, DirectML, ONNX/Olive. Quantification SDNQ (« up to 4x VRAM reduction »),
« Balanced Offload » — [README](https://github.com/vladmandic/sdnext). [Page Vidéo](https://vladmandic.github.io/sdnext-docs/Video/) :
familles Hunyuan, WAN (2.1/2.2), LTX (0.9 à 2.5), FramePack, MiniMax, Cog, Mochi, Kandinsky 5 Lite. Recommandation :
« at least 16GB VRAM and a system with 64GB RAM », « aggressive offloading ». La vidéo sur CPU ou OpenVINO n'est pas
confirmée.

**Pour la troupe (inférence)** : c'est une alternative Apache à ComfyUI, avec une interface unique, mais son
recommandé (64 Go de RAM) dépasse Kaggle. À garder en **réserve** pour SDNQ, son quantificateur réutilisable. Non
prioritaire.

### 3.12 Notebooks OpenVINO — `openvinotoolkit/openvino_notebooks` (+ `openvino.genai`)

**Faits lus**
- 3,2k étoiles, Apache-2.0. Notebooks vidéo : `wan2.2-text-image-to-video`, `wan2.1-text-to-video`, `ltx-video`,
  `bernini-r-image-video`, `stable-video-diffusion`, `zeroscope-text2video`, `animate-anyone` et `wav2lip` — [index](https://github.com/openvinotoolkit/openvino_notebooks/blob/latest/notebooks/README.md).
- Wan 2.2 TI2V : PR #3209 « Add Wan2.2 TI2V notebook », fusionnée le 30/01/2026, « INT4/INT8/FP16 ». Le notebook
  s'appuie sur `Wan-AI/Wan2.2-TI2V-5B-Diffusers` et est marqué « EXPERIMENTAL » — [PR](https://github.com/openvinotoolkit/openvino_notebooks/pull/3209),
  [dossier](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/wan2.2-text-image-to-video).
- Wan 2.1 : le notebook applique **CausVid** en LoRA (« 50-step diffusion model into a 4-step generator »). CausVid est
  **non commercial** (`verification_licences.md`) — [dossier](https://github.com/openvinotoolkit/openvino_notebooks/tree/latest/notebooks/wan2.1-text-to-video).
- Bernini-R-1.3B (dérivé de Wan2.1-1.3B) : compression « FP16 / INT8 / INT4 », encodeur de texte par défaut sur CPU en
  fp32, marqué « EXPERIMENTAL ».
- openvino.genai : 601 étoiles, Apache-2.0, « Video generation using Diffusers - Generate videos with LTX models »,
  « inference on CPU, GPU and NPU » — [README](https://github.com/openvinotoolkit/openvino.genai).

**Pour la troupe (inférence)** : c'est la seule voie **CPU optimisée et officielle**, avec TI2V-5B en INT8. Le
conteneur est un CPU générique, peut-être pas Intel : OpenVINO tourne sur x86 AVX2, avec des performances maximales sur
Intel. Utile pour prévisualiser des **cadrages à très basse résolution** sans quota GPU. Aucun chrono publié : à mesurer.
Écarter le notebook Wan 2.1 (CausVid NC) ou retirer sa LoRA.

### 3.13 mmgp — `deepbeepmeep/mmgp` (cœur mémoire de WanGP)

**Faits lus** : 195 étoiles. Le README s'intitule « Memory Management 3.8.1 for the GPU Poor ». La version PyPI la plus
récente est 3.8.2, du 27/09/2026. Fonctions : profils, « pin models to reserved RAM », « Async transfers to VRAM »,
quantification à la volée (qint8 par défaut). Minimum « 6 GB VRAM and 24 GB RAM ». La bibliothèque est « almost plug
and play » sur un pipeline diffusers (`offload.profile(pipe, ...)`). **Licence** : `LICENSE.md` = « GNU GENERAL PUBLIC
LICENSE Version 3 », mais le README et PyPI disent « You are free to use my module for non commercial use as long you
give me proper credits » — [README](https://github.com/deepbeepmeep/mmgp), [LICENSE.md](https://github.com/deepbeepmeep/mmgp/blob/main/LICENSE.md),
[PyPI](https://pypi.org/project/mmgp/).

**Pour la troupe (inférence)** : c'est techniquement le meilleur délesteur pour un T4 avec 15 Go utiles et une RAM
limitée, et on pourrait le brancher sur notre propre pipeline diffusers. Mais la **contradiction de licence** doit être
levée (demande écrite à l'auteur, ou s'en tenir au texte GPL-3.0) avant toute monétisation. Repli sans risque : le
délestage par groupes de diffusers (3.9).

### 3.14 FastVideo / FastWan — `hao-ai-lab/FastVideo`

**Faits lus** : 4,6k étoiles, Apache-2.0. Commit du 15/10/2026. « Sparse distillation to achieve >50x denoising
speedup ». GPU cités : « Support H100, A100, 4090 ». Le T4 n'apparaît que dans un avertissement (multi-T4 gratuit
« likely to run out of memory » avec `num_gpus>1`) — [README](https://github.com/hao-ai-lab/FastVideo). Poids
`FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers` : tag « apache-2.0 », « efficient 3-step inference », entraîné en
121×704×1280 — [fiche HF](https://huggingface.co/FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers).

**Pour la troupe (inférence)** : le moteur FastVideo lui-même ne vise pas Turing. En revanche, les **poids FastWan
TI2V-5B (3 pas, Apache)** sont le meilleur rapport qualité/temps connu pour un T4. C'est exactement le modèle que
recommande Wan2GP-on-Colab (3.17). À charger via WanGP, ComfyUI ou diffusers.

### 3.15 SageAttention — `thu-ml/SageAttention`

**Faits lus** : 4,0k étoiles, Apache-2.0. La v1 en Triton s'installe par `pip install sageattention==1.0.6`. Les v2, 2++
et 3 visent « Ampere, Ada and Hopper » et Blackwell. Turing n'est pas mentionné sur la page — [README](https://github.com/thu-ml/SageAttention).
WanGP indique de son côté : « On RTX 20XX, install SageAttention 1.0.6 » ([CLI.md](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/CLI.md)).

**Pour la troupe (inférence)** : sur T4, FlashAttention-2 n'existe pas. SageAttention 1.0.6 est la seule accélération
d'attention documentée (indirectement) pour Turing. À tester contre SDPA dans le premier notebook chronométré.

### 3.16 WanGP-Kaggle et comfyui-kaggle — `kayas881/*`

**Faits lus**
- WanGP-Kaggle : 18 étoiles, 5 commits, tous du 30/12/2025, **sans fichier LICENSE** (404). Le notebook `wangpp.ipynb`
  installe WanGP avec SageAttention 1.0.6, mmgp, LoRA Lightning 4 pas, `--profile 4` et `--attention sage`. Le README
  dit : « 480p recommended for T4 », « Expect ~9-15 minutes per video on T4 », « ~73GB of temp storage », liens Gradio
  publics. Il est incohérent : il demande « GPU T4 x2 » mais décrit un seul T4 — [README](https://github.com/kayas881/WanGP-Kaggle).
- comfyui-kaggle : 8 étoiles, 2 commits, sans licence visible. ComfyUI et Manager sur T4, tunnel Pinggy, modèles Wan 2.1
  en exemple, modèles et sorties en lien symbolique vers `/tmp` — [README](https://github.com/kayas881/comfyui-kaggle).

**Pour la troupe (inférence)** : c'est la seule source qui donne un **ordre de grandeur T4** pour WanGP. **Ne pas copier
le code** (aucune licence) ; reprendre seulement les idées : `/tmp` pour les poids, redémarrage du noyau après
installation, sage 1.0.6. Remplacer le lien Gradio public par le mode `--process` headless.

### 3.17 Wan2GP-on-Colab — `Square-Zero-Labs/Wan2GP-on-Colab`

**Faits lus** : 168 étoiles, 73 forks, Apache-2.0. Dernier commit le 31/08/2026 (« update ffmpeg version if needed »).
Le README dit : « free Colab GPU runtimes usually provide only 15 GB of T4 VRAM, which is too small for most Wan2GP
checkpoints; stick to the `Wan 2.2 TextImage2Video 5B FastWan` model and select 480p ». Google Drive est en option pour
les checkpoints. Aucun chrono — [README](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab).

**Pour la troupe (inférence)** : c'est le **seul notebook WanGP sous licence libre**, donc copiable légalement. Base
idéale pour notre notebook Kaggle : adapter les chemins à `/kaggle/working` et `/kaggle/tmp`, retirer Gradio, ajouter
`--process`. Attention : sur Colab gratuit, l'interface Gradio tombe sous la restriction « web UI ».

### 3.18 TeamAIQ/Colab-notebooks

**Faits lus** : 554 étoiles, 188 forks, **aucune licence** (LICENSE 404). Dernier commit le 13/10/2026. Notebooks Kaggle
« Optimized for Kaggle GPU T4 x2 » :
- LTX-2.5 22B Distilled Dual GPU ;
- MiniMax H3 Turbo INT8 ;
- LTX-2.3 22B Distilled 1.1 Q4 T2V/I2V ;
- LTX-2.3 Audio-to-Video Q4 (lip-sync) ;
- LTX-2.3 MSR Ref (multi-référence) ;
- LTX-2.3 « Wan2GP engine ».

Plusieurs portent la mention « ✅ Fixed & working as of September 2026 ». Les fichiers `.ipynb` sont dans
`kaggle_notebooks/` — [README](https://github.com/TeamAIQ/Colab-notebooks), [dossier](https://github.com/TeamAIQ/Colab-notebooks/tree/main/kaggle_notebooks).

**Pour la troupe (inférence)** : c'est la preuve qu'une répartition **sur deux T4** (LTX 22B, H3 INT8) existe et
fonctionne en septembre 2026. À **lire** pour la technique (tensor-parallel INT8, Q4), pas à copier (aucune licence).
Rappels : H3 est sous licence H3 (UE et USA exclus sans formulaire) ; LTX-2.x est gratuit sous 10 M$ de chiffre
d'affaires annuel.

### 3.19 wan-2.2-animate-comfyui-kaggle — `kelvinweijun/*`

**Faits lus** : 5 étoiles, **sans licence**. Dernier commit le 27/11/2025. Il fournit des notebooks ComfyUI (tunnel
Local Tunnel, ou Gradio) et 3 workflows Kijai « 12GB-VRAM ». Cible : « Kaggle Nvidia 2 x T4 GPU ». Il utilise un GGUF
Q3_K_M par défaut (Q6_K en Gradio), la LoRA Relight et la LoRA « LightX2V I2V 14B 480p », et demande « CPU with 32 GB
RAM ». Aucun chrono — [README](https://github.com/kelvinweijun/wan-2.2-animate-comfyui-kaggle).

**Pour la troupe (inférence)** : c'est la recette la plus proche de notre besoin « personnage » : Wan 2.2 Animate sur
Kaggle, avec les poids en **Kaggle Datasets** pour ne pas les retélécharger à chaque session. À lire seulement (aucune
licence).

### 3.20 wan2.2-google-colab — `theelderemo/*`

**Faits lus** : 60 étoiles. Le README le déclare « released under the same Apache 2.0 License » que Wan2.2. Dernier
commit le 26/03/2026. Il clone le dépôt officiel Wan2.2 (T2V, I2V, TI2V, S2V, Animate, TTS CosyVoice). Il propose les
options `--offload_model`, `--convert_model_dtype` et `--t5_cpu`. Son tableau indique « 24 GB » minimum pour TI2V-5B —
[README](https://github.com/theelderemo/wan2.2-google-colab).

**Pour la troupe (inférence)** : copiable, mais construit sur le code officiel, qui n'est pas fait pour 16 Go. Utile
seulement comme gabarit de cellules pour les modes S2V et Animate. **Non prioritaire.**

---

## 4. Pile recommandée à dupliquer (inférence)

1. **Voie A, la plus rapide à mettre en route** : fork de **Wan2GP** (commit épinglé) + notebook Kaggle réécrit à partir
   de **Wan2GP-on-Colab** (Apache) en mode `--process` headless, avec `--fp16 --profile 4` et l'attention `sdpa` ou
   `sage` 1.0.6. Modèles : FastWan 2.2 TI2V-5B (3 pas, Apache) en 480p 9:16 pour les plans courants, et Wan 2.2 I2V-A14B
   GGUF + LoRA lightx2v 4 pas pour les plans clés. Points bloquants à lever : la licence `mmgp` et les CGU WanGP sur
   l'hébergement Kaggle.
2. **Voie B, licences classiques** : **ComfyUI** + **ComfyUI-GGUF** + **WanVideoWrapper** + **VideoHelperSuite**
   (+ fork de **ComfyUI-MultiGPU** pour T4×2). Les workflows JSON sont versionnés dans le dépôt de la troupe et pilotés
   par l'API locale depuis le notebook.
3. **Voie C, notre moteur Python** (« le moteur de la troupe ») : **diffusers** (pipelines Wan + délestage par groupes)
   et les scripts `model_inference_low_vram` de **DiffSynth-Studio** comme modèle de code, ainsi que pour les LoRA de
   personnages. On reprend les idées de LightX2V (délestage par phase, `lazy_load`, serveur asynchrone).
4. **Conteneur CPU** : **stable-diffusion.cpp** (MIT), ou la liaison Python, pour tester la plomberie hors quota GPU.
   **OpenVINO** (TI2V-5B INT8) en second essai. Aucun des deux ne sert à la production.

---

## 5. Écartés ou à manier avec précaution

- **FramePack** ([lllyasviel/FramePack](https://github.com/lllyasviel/FramePack), Apache-2.0, 17,3k étoiles) :
  « At least 6GB GPU memory » mais vise les RTX 30/40/50 avec fp16 et bf16 ; « The GTX 10XX/20XX are not tested ».
  Dernière nouvelle de juillet 2025. Le modèle de base (HunyuanVideo, d'après les notes précédentes) a une licence qui
  exclut l'UE. Écarté.
- **Notebook OpenVINO Wan 2.1** : LoRA CausVid non commerciale (voir 3.12).
- **Poids `Kijai/WanVideo_comfy`** : mélange de lightx2v (Apache) et de CausVid (NC) — ne prendre que lightx2v.
- **Dépôts sans licence** (kayas881, TeamAIQ, kelvinweijun) : à lire seulement. Sans licence, il n'y a pas de droit de
  copie ni de modification. Les pages Kaggle publiques affichent parfois une licence (par exemple « Apache 2.0 » sur des
  notebooks tutoriels) : à vérifier notebook par notebook avant de copier.
- **Space ZeroGPU « Wan2.2 14B Fast »** (`zerogpu-aoti/wan2-2-fp8da-aoti-faster`, 3,75k likes) : la page ne montre
  aucune licence. Le dupliquer demande un compte HF de plus de 30 jours (`calcul_et_couts.md`). Il est utile pour 3 plans
  vedettes par jour, mais ce n'est pas du code « faible matériel ».

---

## 6. Gaps

- **Aucun chrono mesuré sur T4** pour WanGP (sauf l'annonce « 9-15 min » de kayas881, modèle non précisé), ComfyUI-GGUF,
  diffusers fp16, DiffSynth ou LightX2V. **Aucun chrono CPU** pour Wan (sd.cpp, OpenVINO). Le premier notebook Kaggle
  doit chronométrer : FastWan 5B 480p 9:16 dans WanGP, puis la même chose en ComfyUI-GGUF Q4, puis l'I2V-A14B Q4 + lightx2v.
- Compatibilité du **fp16** (sans bf16) avec Wan 2.2 dans DiffSynth, LightX2V et diffusers : non documentée
  (débordements possibles) ; seul WanGP a un drapeau `--fp16` officiel.
- **mmgp** : GPL-3.0 ou « non commercial » ? À faire trancher par l'auteur ou par une revue juridique.
- **ComfyUI-WanVideoWrapper** : pas de commit sur `main` depuis le 24/05/2026 ; compatibilité avec le ComfyUI d'octobre
  2026 non vérifiée. **ComfyUI-MultiGPU** est archivé.
- RAM réelle d'une session Kaggle T4×2 : non vérifiée (WanGP profil 4 et Animate demandent beaucoup de RAM ; kelvinweijun
  exige 32 Go).
- Licences non lues : `LICENSE`, `LICENSE-2` et `LICENSE-2_x` de [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2)
  (la répartition code/poids n'est pas affichée) ; licences exactes des notebooks Kaggle TeamAIQ (pages Kaggle rendues en
  JavaScript).
