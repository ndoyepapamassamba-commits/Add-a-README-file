# Anatomie d'un moteur vidéo ouvert au niveau du code source : Wan 2.2 (moteur principal), LTX-2 (audio+vidéo) et Diffusers — état au 16/10/2026

Méthode : code lu (jamais exécuté) dans des clones superficiels faits le 16/10/2026 :
- `Wan-Video/Wan2.2` au commit `1ea34ff` (2026-09-21) ;
- `huggingface/diffusers` au commit `7ecb1e1` (2026-10-15) ;
- `Lightricks/LTX-2` au commit `be6d6d0` (2026-10-13), CHANGELOG 1.4.2 du 2026-10-01 ;
- fichiers `config.json` / `model_index.json` des dépôts Hugging Face `Wan-AI/*-Diffusers` (configs seulement, aucun poids téléchargé) ;
- fichiers ponctuels : musubi-tuner (`lora_wan.py`, `docs/wan.md`), DiffSynth-Studio (script LoRA TI2V-5B), cartes de modèle lightx2v (Wan2.2-Lightning, Wan2.2-Distill-Loras), dépôt ModelTC/Wan2.2-Lightning, résumé arXiv de LTX-2.

Les liens GitHub pointent vers les commits ci-dessus (permaliens). Les chiffres marqués **(dérivé)** sont des calculs faits à partir du code cité (formes de tenseurs, nombres de pas), pas des mesures publiées. Le code n'a pas été exécuté : les extraits Python proposés sont reconstruits à partir des signatures lues, non testés.

---

## 1. Carte du moteur : modules, flux de données et formes de tenseurs, du prompt (+ image) au MP4

### Takeaway
Wan 2.2 est un pipeline classique « encodeur de texte → DiT de flow-matching opérant dans le latent d'un VAE vidéo causal 3D → décodeur VAE → écriture MP4 », organisé en un point d'entrée (`generate.py`), une classe de pipeline par tâche (`WanT2V`, `WanI2V`, `WanTI2V`, `WanAnimate`, `WanS2V`), des modules réseau (`wan/modules/*`), des solveurs (`wan/utils/fm_solvers*.py`) et un parallélisme optionnel (`wan/distributed/*`) ; Diffusers en est une ré-implémentation fidèle avec d'autres noms de couches.

### Cited Findings

**Arborescence et rôle de chaque fichier (Wan2.2, commit 1ea34ff)**
- `generate.py` (575 lignes) : CLI ; valide les arguments, complète `sample_steps`, `sample_shift`, `sample_guide_scale`, `frame_num` à partir de la config de la tâche, lance l'extension de prompt optionnelle, instancie la classe de pipeline, puis `save_video(..., fps=cfg.sample_fps)` ; pour S2V, fusionne l'audio avec `merge_video_audio` — [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)
- Tâches enregistrées : `t2v-A14B`, `i2v-A14B`, `ti2v-5B`, `animate-14B`, `s2v-14B` (dictionnaire `WAN_CONFIGS`) ; tailles supportées par tâche dans `SUPPORTED_SIZES` (ex. `ti2v-5B`: `704*1280`, `1280*704` ; `t2v/i2v-A14B`: `720*1280`, `1280*720`, `480*832`, `832*480`) — [wan/configs/__init__.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/__init__.py)
- `wan/text2video.py` → classe `WanT2V` (MoE 14B, deux DiT `low_noise_model` / `high_noise_model`, VAE 2.1) ; `wan/image2video.py` → `WanI2V` (MoE 14B I2V) ; `wan/textimage2video.py` → `WanTI2V` (5B dense, VAE 2.2, méthodes `t2v()` et `i2v()`) ; `wan/animate.py` → `WanAnimate` ; `wan/speech2video.py` → `WanS2V` — [wan/](https://github.com/Wan-Video/Wan2.2/tree/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan)
- `wan/modules/model.py` (`WanModel`, le DiT), `t5.py` (`T5EncoderModel`, umT5-XXL encodeur seul), `tokenizers.py` (`HuggingfaceTokenizer`), `vae2_1.py` (`Wan2_1_VAE`), `vae2_2.py` (`Wan2_2_VAE`), `attention.py` (`flash_attention` FA3→FA2→SDPA), `animate/*` (modèle Animate, CLIP, encodeur de mouvement/visage), `s2v/*` (modèle S2V, encodeur audio wav2vec2, motioner FramePack) — [wan/modules/](https://github.com/Wan-Video/Wan2.2/tree/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules)
- `wan/utils/fm_solvers_unipc.py` (`FlowUniPCMultistepScheduler`), `fm_solvers.py` (`FlowDPMSolverMultistepScheduler`, `get_sampling_sigmas`, `retrieve_timesteps`), `prompt_extend.py` + `system_prompt.py` (réécriture de prompt), `utils.py` (`save_video`, `masks_like`, `best_output_size`, `merge_video_audio`) — [wan/utils/](https://github.com/Wan-Video/Wan2.2/tree/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils)
- `wan/distributed/` : `fsdp.py` (`shard_model`), `sequence_parallel.py` (`sp_dit_forward`, `sp_attn_forward` qui remplacent les `forward` par `types.MethodType`), `ulysses.py` (all-to-all DeepSpeed-Ulysses) — [wan/text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py), [wan/distributed/sequence_parallel.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/distributed/sequence_parallel.py)

**Flux de données (TI2V-5B, image→vidéo, 9:16 `704*1280`, 121 images) — formes lues dans le code**
```
prompt (str) ──HuggingfaceTokenizer(clean='whitespace', max_length=512, padding='max_length')
            ──umT5-XXL encodeur (24 couches, d=4096) ──► context: [L_réel, 4096] (tronqué à la longueur réelle)
            (même chose pour le prompt négatif ► context_null)
image PIL ──best_output_size(w,h, dw=32, dh=32, max_area=704*1280) ──resize LANCZOS + center-crop
          ──to_tensor, (x-0.5)/0.5 ──► [3, 1, H, W]
          ──Wan2_2_VAE.encode ──► z: [48, 1, H/16, W/16]
bruit ──randn ──► [48, (F-1)/4+1, H/16, W/16]  = [48, 31, 80, 44] pour 704x1280x121  (dérivé)
latent = (1-mask)*z + mask*bruit   (mask=0 sur la 1re frame latente)
boucle 50 pas UniPC (shift 5.0) :
    timestep par token = mask[:, ::2, ::2] * t  ──► 0 pour les tokens de la 1re frame
    WanModel(x, t, context) et WanModel(x, t, context_null)  → v_cond, v_uncond
    v = v_uncond + 5.0*(v_cond - v_uncond) ; latent = scheduler.step(v) ; re-pinner la 1re frame
Wan2_2_VAE.decode ──► [3, 121, 1280, 704] dans [-1,1]
save_video: imageio, codec libx264, quality=8, fps=24 ──► .mp4
```
- Prétraitement de l'image, bruit, masque, pas temporels par token et ré-injection de la 1re frame après chaque `scheduler.step` : méthode `WanTI2V.i2v` — [wan/textimage2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/textimage2video.py)
- Écriture vidéo : `save_video` clampe dans `value_range=(-1,1)`, normalise, convertit en `uint8`, écrit avec `imageio.get_writer(cache_file, fps=fps, codec='libx264', quality=8)` — [wan/utils/utils.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/utils.py)
- Calcul de la longueur de séquence : `seq_len = ceil((H_lat*W_lat)/(p_h*p_w) * T_lat / sp_size) * sp_size` (arrondi au multiple du degré de parallélisme de séquence) — [wan/text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)

**Tailles de séquence typiques (dérivé, à partir de `vae_stride` et `patch_size=(1,2,2)`)**

| Config | Latent (C×T×H×W) | Tokens DiT |
|---|---|---|
| TI2V-5B, 704×1280, 121 im. (stride 4×16×16) | 48×31×80×44 | 31×40×22 = **27 280** |
| A14B, 480×832, 81 im. (stride 4×8×8) | 16×21×104×60 | 21×52×30 = **32 760** |
| A14B, 720×1280, 81 im. | 16×21×160×90 | 21×80×45 = **75 600** |

Sources des strides/patchs : [wan_ti2v_5B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_ti2v_5B.py), [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py)

**Équivalents Diffusers (commit 7ecb1e1, 2026-10-15)**
- Pipelines : `pipelines/wan/pipeline_wan.py` (`WanPipeline`, T2V, gère aussi le MoE via `transformer_2` + `boundary_ratio` et le 5B via `expand_timesteps=True`), `pipeline_wan_i2v.py` (`WanImageToVideoPipeline`), `pipeline_wan_animate.py`, `pipeline_wan_vace.py`, `pipeline_wan_video2video.py` ; modèles `models/transformers/transformer_wan.py` (`WanTransformer3DModel`), `transformer_wan_animate.py`, `transformer_wan_vace.py`, `models/autoencoders/autoencoder_kl_wan.py` (`AutoencoderKLWan`) — [diffusers pipelines/wan](https://github.com/huggingface/diffusers/tree/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan)
- `model_cpu_offload_seq = "text_encoder->transformer->transformer_2->vae"` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Après la boucle, Diffusers dénormalise : `latents = latents / latents_std + latents_mean` (avec `latents_std = 1/std` lu dans `vae.config`), puis `vae.decode` et `video_processor.postprocess_video` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Le dépôt Wan2.2 annonce l'intégration Diffusers de T2V-A14B, I2V-A14B et TI2V-5B le 28/07/2025 et de Wan2.2-Animate-14B le 13/11/2025 (PR diffusers #12526) — [README Wan2.2](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)

### Inferences
- Pour « notre propre moteur », le contrat minimal est : (1) un encodeur texte qui produit `[L≤512, 4096]`, (2) un VAE qui produit des latents normalisés par canal, (3) un DiT `f(x_t, t_par_token, context) → vitesse`, (4) un solveur de flow-matching, (5) un décodeur + encodeur MP4. Tout le reste (MoE, I2V, Animate, S2V) se greffe sur ces cinq interfaces.
- À 720p, le 5B traite moins de tokens (27 280) que le 14B en 480p (32 760) **(dérivé)** : c'est la compression 16×16 du VAE 2.2 qui rend le 5B rapide, pas seulement sa taille.

### Gaps
- Le code n'a pas été exécuté ; aucune mesure de temps/VRAM propre n'a été faite. Les chiffres VRAM cités plus bas viennent du README.

---

## 2. Encodage du texte : encodeur, longueur maximale, réécriture de prompt, prompts négatifs

### Takeaway
Wan 2.2 utilise l'encodeur de umT5-XXL (bf16, 512 tokens max), dont la sortie est tronquée à la longueur réelle puis re-complétée par des zéros à 512 dans le DiT ; la réécriture de prompt est optionnelle (`--use_prompt_extend`) via DashScope (qwen-plus / qwen-vl-max) ou un Qwen local (Qwen2.5-14B-Instruct / Qwen2.5-VL-7B-Instruct), et le prompt négatif par défaut est une longue liste en chinois.

### Cited Findings
- Config partagée : `t5_model = 'umt5_xxl'`, `t5_dtype = torch.bfloat16`, `text_len = 512`, `param_dtype = bfloat16`, `num_train_timesteps = 1000`, `sample_fps = 16`, `frame_num = 81` — [shared_config.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/shared_config.py)
- Checkpoint `models_t5_umt5-xxl-enc-bf16.pth`, tokenizer `google/umt5-xxl` (toutes les tâches) — [wan_ti2v_5B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_ti2v_5B.py)
- Hyper-paramètres umT5-XXL dans `umt5_xxl()` : `vocab_size=256384, dim=4096, dim_attn=4096, dim_ffn=10240, num_heads=64, encoder_layers=24, num_buckets=32, shared_pos=False` ; instancié `encoder_only=True` — [wan/modules/t5.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/t5.py)
- `T5EncoderModel.__call__` : tokenise (`padding='max_length'`, `truncation=True`, `max_length=512`, nettoyage `whitespace` = `ftfy.fix_text` + normalisation des espaces), calcule `seq_lens = mask.sum()`, et renvoie `[u[:v] for u, v in zip(context, seq_lens)]` (embeddings tronqués à la longueur réelle) — [t5.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/t5.py), [tokenizers.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/tokenizers.py)
- Dans `WanModel.forward`, le contexte est re-complété par des zéros jusqu'à `text_len=512`, passé dans `text_embedding = Linear(4096→dim) → GELU(tanh) → Linear(dim→dim)`, et la cross-attention est appelée avec `context_lens=None` (pas de masque sur le padding) — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Diffusers reproduit le même schéma : `_get_t5_prompt_embeds` tronque à `seq_lens` puis re-complète par des zéros à `max_sequence_length` ; `__call__` a `max_sequence_length=512` par défaut ; nettoyage `prompt_clean` (ftfy + espaces) — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Dans les dépôts Diffusers Wan2.2, l'encodeur est `transformers.UMT5EncoderModel` et le tokenizer `T5TokenizerFast` — [model_index.json TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/model_index.json)
- `--t5_cpu` : l'encodeur reste sur CPU et seuls les embeddings sont copiés sur GPU ; sinon il est déplacé sur GPU puis renvoyé sur CPU si `offload_model` — [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)
- Prompt négatif par défaut (`sample_neg_prompt`) : « 色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走 » ; utilisé quand `n_prompt == ""` — [shared_config.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/shared_config.py)
- Traduction anglaise de ce négatif utilisée dans l'exemple Diffusers : « Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards » ; mais `encode_prompt` met `negative_prompt = ""` si rien n'est fourni (pas de négatif par défaut côté Diffusers) — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- S2V a son propre négatif (ajoute « 画面模糊…情绪激动剧烈，手快速抖动 », i.e. flou, émotion violente, mains qui tremblent vite) — [wan_s2v_14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_s2v_14B.py)
- Réécriture de prompt : flags `--use_prompt_extend`, `--prompt_extend_method {dashscope, local_qwen}` (défaut `local_qwen`), `--prompt_extend_model`, `--prompt_extend_target_lang` (défaut `zh`) ; exécutée sur le rang 0 puis diffusée (`dist.broadcast_object_list`) ; en cas d'échec, retombe sur le prompt original — [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)
- `DashScopePromptExpander` : modèle par défaut `'qwen-plus'` (texte) ou `'qwen-vl-max'` (image+texte), `retry_times=4`, graine passée à l'API ; `QwenPromptExpander` : `model_dict` = Qwen2.5-VL-3B/7B-Instruct, Qwen2.5-3B/7B/14B-Instruct, défaut `Qwen2.5_14B` (texte) ou `QwenVL2.5_7B` (image) — [prompt_extend.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/prompt_extend.py)
- DashScope nécessite la variable d'environnement `DASH_API_KEY` (exemples du README) — [README Wan2.2](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- Le système-prompt T2V chinois demande d'agir en « réalisateur de cinéma » : ajouter des réglages filmiques choisis dans des listes (moment de la journée, source/intensité/angle de lumière, tonalité, taille de plan, angle de prise de vue, composition), détailler les sujets et le mouvement, sans ajouter de sujets absents, et limiter la sortie à 60–200 caractères ; il contient aussi des règles de réécriture de contenus (sexuels, bikini, intimité homosexuelle) qui remplacent le prompt plutôt que de refuser — [system_prompt.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/system_prompt.py)

### Inferences
- Comme `context_lens=None`, les ~512−L positions de padding (zéros passés dans le MLP `text_embedding`, donc des vecteurs de biais) sont visibles par la cross-attention : pour reproduire exactement les sorties, il faut garder ce padding à 512 et ne pas masquer.
- Pour une troupe francophone : umT5 est multilingue, mais les système-prompts de réécriture sont en chinois/anglais et intègrent une politique de contenu propre à Alibaba ; un moteur maison devrait écrire son propre système-prompt (et choisir son LLM) plutôt que réutiliser `system_prompt.py` tel quel.

### Gaps
- Pas de mesure de l'effet du padding non masqué ni de la qualité des prompts en français ; aucune source primaire trouvée sur l'entraînement multilingue de Wan 2.2.

---

## 3. VAE : architecture causale 3D, VAE 2.2 haute compression 16×16×4, règle 1+4k, tuilage, mémoire

### Takeaway
Les deux VAE de Wan sont des autoencodeurs à convolutions 3D causales (cache temporel de 2 frames) qui encodent la 1re image seule puis des blocs de 4 images, d'où la règle `F = 4k+1 → T_lat = k+1` ; le VAE 2.1 (16 canaux, 4×8×8) sert aux modèles 14B, le VAE 2.2 (48 canaux, pré-patchify 2×2 + 4×8×8 = 4×16×16) sert au 5B ; l'implémentation officielle ne tuile pas spatialement, Diffusers propose `enable_tiling()`.

### Cited Findings
- Le README décrit le VAE Wan2.2 comme atteignant un ratio T×H×W de 4×16×16 (compression totale 64), et avec la couche de patchification du DiT, un ratio total de 4×32×32 pour TI2V-5B — [README Wan2.2](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- `Wan2_2_VAE(z_dim=48, c_dim=160, dim_mult=[1,2,4,4], temperal_downsample=[False, True, True], dtype=torch.float)` ; `WanVAE_` a `dec_dim=256` ; moyenne/écart-type par canal (48 valeurs codées en dur) et `self.scale = [mean, 1.0/std]` — [vae2_2.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/vae2_2.py)
- `WanVAE_.encode` : `patchify(x, patch_size=2)` (pixel-unshuffle 2×2 ⇒ 3→12 canaux), puis `iter_ = 1 + (t-1)//4` ; itération 0 sur `x[:, :, :1]`, itérations suivantes sur `x[:, :, 1+4(i-1) : 1+4i]`, avec `feat_cache` ; `mu, log_var = conv1(out).chunk(2)` ; normalisation `mu = (mu - mean) * (1/std)` — [vae2_2.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/vae2_2.py)
- `decode` : dénormalise `z / scale[1] + scale[0]`, boucle sur chaque frame latente (`iter_ = z.shape[2]`) avec `first_chunk=True` à la première, puis `unpatchify(out, patch_size=2)` — [vae2_2.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/vae2_2.py)
- Blocs du VAE 2.2 : `CausalConv3d` (cache `CACHE_T = 2` frames), `RMS_norm`, `Resample`, `ResidualBlock`, `AttentionBlock`, `AvgDown3D` / `DupUp3D` (raccourcis résiduels de down/up-sampling), `Down_ResidualBlock`, `Up_ResidualBlock`, `Encoder3d`, `Decoder3d` — [vae2_2.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/vae2_2.py)
- Config Diffusers du VAE 2.2 : `base_dim=160, decoder_base_dim=256, z_dim=48, in_channels=12, out_channels=12, patch_size=2, is_residual=true, scale_factor_spatial=16, scale_factor_temporal=4, temperal_downsample=[false,true,true], dim_mult=[1,2,4,4], num_res_blocks=2, attn_scales=[]` — [vae/config.json TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/vae/config.json)
- VAE 2.1 (utilisé par T2V/I2V/Animate/S2V 14B, checkpoint `Wan2.1_VAE.pth`, `vae_stride=(4,8,8)`) : `_video_vae(dim=96, z_dim=16, temperal_downsample=[False, True, True])` — [vae2_1.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/vae2_1.py), [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py) ; config Diffusers `base_dim=96, z_dim=16` — [vae/config.json T2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B-Diffusers/blob/main/vae/config.json)
- Règle des frames : docstrings « The number should be 4n+1 » ; forme latente `(z_dim, (F-1)//vae_stride[0] + 1, H//stride, W//stride)` — [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py) ; Diffusers arrondit : si `num_frames % 4 != 1`, avertit et prend `num_frames // 4 * 4 + 1` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Diffusers `AutoencoderKLWan` : `use_slicing=False`, `use_tiling=False` par défaut ; `enable_tiling()` avec tuiles de 256×256 px et pas de 192 px par défaut (`tile_sample_min_height/width=256`, `tile_sample_stride_height/width=192`) ; même cache `CACHE_T = 2` ; option `is_residual` « wan 2.2 vae use a residual downblock » — [autoencoder_kl_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/autoencoders/autoencoder_kl_wan.py)
- L'exemple Diffusers charge le VAE en `torch.float32` (`AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)`) et le reste en bf16 — [pipeline_wan.py (EXAMPLE_DOC_STRING)](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)

### Inferences
- Mémoire : grâce au traitement causal par blocs (1 + 4 + 4 + … frames en encodage, 1 frame latente à la fois en décodage, avec un cache de 2 frames par conv), le pic mémoire du VAE dépend surtout de la résolution, pas de la durée ; c'est la résolution spatiale (1280×704 décodée d'un coup dans le code officiel) qui peut saturer une carte 24 Go, d'où l'intérêt du tuilage Diffusers.
- Pour un VAE « maison » ou un fine-tuning, il faut reproduire exactement : pixels dans [-1,1], patchify 2×2 (VAE 2.2 seulement), normalisation par canal (mean/std), et la règle 4k+1.

### Gaps
- Nombres de paramètres des VAE 2.1/2.2 et métriques de reconstruction non vérifiés (le rapport technique Wan n'a pas été relu ici).

---

## 4. Transformer (DiT) : bloc, RoPE 3D, cross-attention texte, FFN, modulation adaLN ; 5B vs 14B ; bascule MoE

### Takeaway
`WanModel` = `Conv3d` de patchification (1,2,2) → N blocs [self-attention avec RoPE 3D factorisée (t,h,w) et QK-RMSNorm, modulée par adaLN-zero à 6 paramètres] + [cross-attention vers le texte, non modulée] + [FFN GELU-tanh modulée] → tête modulée → unpatchify ; 5B = 30 blocs × 3072 (24 têtes), 14B = 40 blocs × 5120 (40 têtes), tête de dim 128 dans les deux cas ; le « MoE » A14B n'est pas un routage par token mais deux DiT complets choisis selon le pas de temps (`t ≥ boundary·1000` → expert haut-bruit).

### Cited Findings

**Hyper-paramètres (configs officielles et config.json Diffusers)**

| | TI2V-5B | T2V-A14B / I2V-A14B (par expert) |
|---|---|---|
| `dim` | 3072 | 5120 |
| `ffn_dim` | 14336 | 13824 |
| `num_heads` | 24 | 40 |
| `num_layers` | 30 | 40 |
| `patch_size` | (1,2,2) | (1,2,2) |
| `freq_dim` | 256 | 256 |
| `in_channels` / `out_channels` (Diffusers) | 48 / 48 | T2V 16/16 ; I2V **36**/16 |
| `qk_norm`, `cross_attn_norm`, `eps` | True, True, 1e-6 | idem |

Sources : [wan_ti2v_5B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_ti2v_5B.py), [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py), [wan_i2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_i2v_A14B.py), [transformer/config.json TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/transformer/config.json), [transformer/config.json I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers/blob/main/transformer/config.json) (`attention_head_dim: 128`, `qk_norm: "rms_norm_across_heads"`, `rope_max_seq_len: 1024`, `text_dim: 4096`, `image_dim: null`, `added_kv_proj_dim: null`).

**Structure du code (`wan/modules/model.py`)**
- Plongements : `patch_embedding = nn.Conv3d(in_dim, dim, kernel_size=patch_size, stride=patch_size)` ; `text_embedding = Linear(text_dim=4096, dim) → GELU(tanh) → Linear(dim, dim)` ; `time_embedding = Linear(freq_dim=256, dim) → SiLU → Linear(dim, dim)` ; `time_projection = SiLU → Linear(dim, 6*dim)` — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Pas de temps : `sinusoidal_embedding_1d(256, t)` calculé en float64 ; si `t` est de dimension 1 il est étendu à `[B, seq_len]` ⇒ embedding **par token** `e: [B, L, dim]` et `e0: [B, L, 6, dim]`, calculés sous autocast float32 — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- `WanAttentionBlock.forward` : `e = (self.modulation + e0).chunk(6)` avec `self.modulation = nn.Parameter(randn(1,6,dim)/sqrt(dim))` ; self-attn sur `norm1(x)*(1+e[1]) + e[0]`, résidu `x + y*e[2]` ; puis `x = x + cross_attn(norm3(x), context)` (sans modulation) ; puis FFN sur `norm2(x)*(1+e[4]) + e[3]`, résidu `x + y*e[5]` ; FFN = `Linear(dim, ffn_dim) → GELU(tanh) → Linear(ffn_dim, dim)` ; `norm1`/`norm2` = LayerNorm sans affine, `norm3` = LayerNorm affine si `cross_attn_norm` — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- `WanSelfAttention` : `q,k,v,o = nn.Linear(dim, dim)` ; `norm_q`, `norm_k` = `WanRMSNorm(dim)` (sur toute la dimension, avant découpage en têtes) ; RoPE appliquée à q et k ; `flash_attention(..., k_lens=seq_lens)` (le padding de séquence est masqué) ; `WanCrossAttention` hérite des mêmes couches, sans RoPE — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- RoPE 3D : `freqs = cat(rope_params(1024, d - 4*(d//6)), rope_params(1024, 2*(d//6)), rope_params(1024, 2*(d//6)))` avec θ=10000 ; `rope_apply` découpe les `c = d/2` fréquences complexes en `[c - 2*(c//3), c//3, c//3]` pour (frame, hauteur, largeur) et les diffuse sur la grille `(f,h,w)` de chaque échantillon — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Tête : `Head` = LayerNorm + modulation à 2 paramètres (shift, scale) + `Linear(dim, prod(patch)*out_dim)` ; `unpatchify` via `einsum('fhwpqrc->cfphqwr')` ; initialisation : poids de `head.head` à zéro — [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Backend d'attention : FlashAttention 3 (`flash_attn_interface.flash_attn_varlen_func`) si disponible, sinon FA2 (`flash_attn.flash_attn_varlen_func`), sinon `scaled_dot_product_attention` (avec avertissement « Padding mask is disabled ») — [attention.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/attention.py)

**Correspondance des noms Diffusers (`WanTransformer3DModel`)**
- `attn1` (self) / `attn2` (cross) de classe `WanAttention` avec `to_q`, `to_k`, `to_v`, `to_out[0]` (+ `add_k_proj`, `add_v_proj` si `added_kv_proj_dim`, utilisés pour l'image CLIP de Wan 2.1) ; `ffn = FeedForward(dim, inner_dim=ffn_dim, activation_fn="gelu-approximate")` ; `scale_shift_table` (1,6,dim) ; **attention** : `norm2` Diffusers = norme de cross-attn (≙ `norm3` officiel) et `norm3` Diffusers = norme FFN (≙ `norm2` officiel) ; `condition_embedder = WanTimeTextImageEmbedding` ; `rope = WanRotaryPosEmbed` ; `_keep_in_fp32_modules = ["rope", "time_embedder", "scale_shift_table", "norm1", "norm2", "norm3"]` ; `_no_split_modules = ["WanTransformerBlock"]` ; mixins `PeftAdapterMixin`, `FromOriginalModelMixin`, `CacheMixin`, `AttentionMixin` ; attention via `dispatch_attention_fn` — [transformer_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/transformers/transformer_wan.py)

**MoE A14B (haut-bruit / bas-bruit)**
- README : deux experts d'environ 14B chacun (27B au total, 14B actifs par pas) ; l'expert haut-bruit gère les premiers pas (mise en place), le bas-bruit les derniers (détails) ; la bascule `t_moe` correspond à la moitié du SNR minimal — [README Wan2.2](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- Code : `boundary = 0.875` (T2V) / `0.900` (I2V) ; `boundary_ts = boundary * num_train_timesteps` ; `_prepare_model_for_timestep` : si `t.item() >= boundary` → `high_noise_model`, sinon `low_noise_model` ; avec `offload_model` ou `init_on_cpu`, l'expert inactif est renvoyé sur CPU et l'actif monté sur GPU ; les deux experts sont chargés depuis les sous-dossiers `high_noise_model` / `low_noise_model` via `WanModel.from_pretrained` — [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py), [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py), [wan_i2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_i2v_A14B.py)
- Diffusers : `transformer` = expert haut-bruit (t ≥ `boundary_ratio * num_train_timesteps`), `transformer_2` = bas-bruit ; `boundary_ratio` = 0.875 (T2V) et 0.9 (I2V) dans `model_index.json` ; `guidance_scale` s'applique à `transformer`, `guidance_scale_2` à `transformer_2` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py), [model_index T2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B-Diffusers/blob/main/model_index.json), [model_index I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers/blob/main/model_index.json)

### Inferences
- Avec `head_dim = 128`, la RoPE alloue 22 paires complexes (44 dimensions réelles) au temps et 21 paires (42 dimensions) à chaque axe spatial **(dérivé)** ; `rope_params(1024, …)` limite chaque axe à 1024 positions latentes.
- Répartition des pas entre experts **(dérivé)** de `σ' = shift·σ/(1+(shift−1)σ)` avec `σ = linspace(1,0,41)[:40]` : T2V (shift 12, boundary 0.875) → les 26 premiers pas sur 40 vont à l'expert haut-bruit ; I2V (shift 5, boundary 0.9) → 15 sur 40. Changer `shift` déplace donc aussi la bascule entre experts.
- Le pas de temps par token (et non par échantillon) est ce qui permet au 5B de faire de l'I2V par « frame propre à t=0 » et ouvre la porte à des techniques de type diffusion-forcing/extension vidéo sans changer l'architecture.
- Le « MoE » n'a pas de routeur appris : un moteur maison peut charger les deux experts sur deux GPU, ou en séquentiel avec offload, et même combiner un expert Wan2.2 avec un autre modèle (le README compare des variantes hybrides Wan2.1/Wan2.2).

### Gaps
- Nombres exacts de paramètres du 5B et de chaque expert 14B non recalculés à partir des poids ; pas de source primaire sur la procédure d'entraînement des experts (initialisation, données).

---

## 5. Conditionnement image→vidéo : comment la première image est injectée (Wan 2.1 vs 2.2 A14B vs TI2V-5B)

### Takeaway
Trois mécanismes coexistent : (a) Wan 2.1 I2V = concat canal [bruit 16 + masque 4 + latent VAE de « image + zéros » 16] **plus** embeddings CLIP en cross-attention séparée ; (b) Wan 2.2 I2V-A14B = la même concat à 36 canaux **sans CLIP** ; (c) TI2V-5B = pas de canaux supplémentaires : la 1re frame latente est remplacée par l'image encodée et ses tokens reçoivent `t = 0`.

### Cited Findings
- I2V-A14B (`WanI2V.generate`) : `msk = ones(1, F, lat_h, lat_w)` ; `msk[:, 1:] = 0` ; la 1re frame du masque est répétée 4 fois (`repeat_interleave(..., repeats=4)`), puis `view(1, T_lat, 4, lat_h, lat_w).transpose(1,2)` ⇒ masque de **4 canaux** ; `y = vae.encode(concat([image redimensionnée bicubique, zeros(3, F-1, h, w)], dim=1))` (16 canaux) ; `y = concat([msk, y])` (20 canaux) ; le modèle concatène `x` (16) et `y` (20) sur l'axe des canaux (`torch.cat([u, v], dim=0)` dans `WanModel.forward`) ⇒ 36 canaux d'entrée — [image2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/image2video.py), [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py), [transformer/config.json I2V-A14B (`in_channels: 36`)](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers/blob/main/transformer/config.json)
- Pas d'encodeur CLIP dans Wan 2.2 I2V-A14B : `model_index.json` a `"image_encoder": [null, null]` et le transformer a `image_dim: null`, `added_kv_proj_dim: null` ; le `WanModel` de Wan2.2 n'a pas de branche `img_emb` — [model_index I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers/blob/main/model_index.json), [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Chemin Wan 2.1 conservé dans Diffusers : `WanImageToVideoPipeline` prend un `image_encoder` `CLIPVisionModel` optionnel, utilise `hidden_states[-2]` comme `image_embeds`, passés comme `encoder_hidden_states_image` → `WanImageEmbedding` (FP32LayerNorm → FeedForward → FP32LayerNorm) puis `add_k_proj`/`add_v_proj` dans la cross-attn ; si `boundary_ratio` est défini (Wan 2.2), passer `image_embeds` lève une erreur — [pipeline_wan_i2v.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan_i2v.py), [transformer_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/transformers/transformer_wan.py)
- Diffusers supporte aussi « première + dernière image » (`last_image`) : `video_condition = [image, zeros(F-2), last_image]` et masque à 1 sur la première et la dernière frame — [pipeline_wan_i2v.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan_i2v.py)
- TI2V-5B (`WanTI2V.i2v`) : `z = vae.encode([img])` (1 frame latente) ; `mask1, mask2 = masks_like([noise], zero=True)` met `mask2[:, 0] = 0` ; `latent = (1 - mask2) * z + mask2 * latent` avant la boucle **et après chaque pas** ; `timestep` par token = `(mask2[0][0][:, ::2, ::2] * t).flatten()` complété par `t` jusqu'à `seq_len` — [textimage2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/textimage2video.py), [utils.py (`masks_like`)](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/utils.py)
- `masks_like` contient aussi une variante d'entraînement (avec `generator`, probabilité `p=0.2`) où la 1re frame reçoit un bruit d'amplitude `exp(N(-3.5, 0.5))` au lieu de 0 — [utils.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/utils.py)
- Diffusers, branche `expand_timesteps` (Wan2.2 TI2V) : `video_condition = image` (1 frame), `first_frame_mask[:, :, 0] = 0`, timestep par token `temp_ts = (mask[0][0][:, ::2, ::2] * t).flatten()` — [pipeline_wan_i2v.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan_i2v.py), [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py) ; `model_index.json` du 5B : `"expand_timesteps": true`, `"boundary_ratio": null` — [model_index TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/model_index.json)
- Redimensionnement de l'image : TI2V-5B → `best_output_size(iw, ih, dw=32, dh=32, max_area)` (multiples de 32 sous l'aire max, deux candidats comparés au ratio d'origine), resize LANCZOS puis recadrage centré ; I2V-A14B → `lat_h = round(sqrt(max_area*ar) // 8 // 2 * 2)` (multiples de 16 px) et interpolation bicubique sans recadrage — [textimage2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/textimage2video.py), [image2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/image2video.py)

### Inferences
- Pour l'I2V, la sortie suit le ratio de l'image d'entrée (seule l'aire `--size` compte) : une image source déjà en 9:16 évite le recadrage du 5B.
- Le mécanisme 5B est le plus simple à réutiliser dans un moteur maison (aucun canal à ajouter, juste un masque de timesteps) et se généralise à « N premières frames connues » (continuation de plan).

### Gaps
- Le comportement exact de `WanImageToVideoPipeline` chargé depuis le dépôt `Wan2.2-TI2V-5B-Diffusers` (dont la classe déclarée est `WanPipeline`) n'a pas été vérifié par exécution ; le code a bien une branche `expand_timesteps`.

---

## 6. Échantillonneur : flow matching (UniPC / DPM++ / Euler), shift, nombre de pas, CFG, boucle ; effets des LoRA de distillation

### Takeaway
Le DiT prédit une vitesse de flow-matching ; le solveur par défaut est `FlowUniPCMultistepScheduler` (ordre 2, `bh2`, `predict_x0`), avec des sigmas `linspace(1→0)` déformés par `σ' = shift·σ/(1+(shift−1)σ)` ; défauts : 5B = 50 pas, shift 5, CFG 5 ; T2V-A14B = 40 pas, shift 12, CFG (bas 3 / haut 4) ; I2V-A14B = 40 pas, shift 5, CFG 3.5 ; la CFG fait deux passes séparées (cond puis négatif) ; les LoRA « Lightning »/lightx2v ramènent à 4 pas, CFG 1, solveur Euler, shift 5.

### Cited Findings
- `set_timesteps` : `sigmas = linspace(sigma_max, sigma_min, n+1)[:-1]`, puis `sigmas = shift*sigmas/(1+(shift-1)*sigmas)`, `timesteps = sigmas * num_train_timesteps`, sigma final 0 (`final_sigmas_type="zero"`) — [fm_solvers_unipc.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/fm_solvers_unipc.py)
- Conversion de la sortie : `prediction_type="flow_prediction"` → `x0_pred = sample - sigma_t * model_output` (ou `epsilon = sample - (1 - sigma_t) * model_output`), donc la sortie est la vitesse `v = bruit − x0` ; défauts `solver_order=2`, `solver_type="bh2"`, `predict_x0=True`, `lower_order_final=True` — [fm_solvers_unipc.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/fm_solvers_unipc.py)
- DPM++ : `get_sampling_sigmas(steps, shift)` = même déformation sur `linspace(1, 0, steps+1)[:steps]`, passée à `FlowDPMSolverMultistepScheduler` via `retrieve_timesteps(..., sigmas=...)` ; `--sample_solver` ∈ {`unipc` (défaut), `dpm++`} — [fm_solvers.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/utils/fm_solvers.py), [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)
- Boucle (T2V) : pour chaque `t` : choisir l'expert, `noise_pred_cond = model(x, t, context)`, `noise_pred_uncond = model(x, t, context_null)` (deux appels séparés, pas de batch), `noise_pred = uncond + g*(cond - uncond)`, `latents = scheduler.step(noise_pred, t, latents)` ; le tout sous `torch.amp.autocast('cuda', dtype=bfloat16)` et `torch.no_grad()` — [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)
- Défauts par tâche : TI2V-5B `sample_steps=50, sample_shift=5.0, sample_guide_scale=5.0, frame_num=121, sample_fps=24` ; T2V-A14B `steps=40, shift=12.0, boundary=0.875, guide=(3.0, 4.0)` (bas-bruit, haut-bruit) ; I2V-A14B `steps=40, shift=5.0, boundary=0.900, guide=(3.5, 3.5)` ; Animate `steps=20, shift=5.0, guide=1.0, frame_num=77, fps=30` ; S2V `steps=40, shift=3, guide=4.5` — [configs/](https://github.com/Wan-Video/Wan2.2/tree/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs)
- Note du docstring I2V : « If you want to generate a 480p video, it is recommended to set the shift value to 3.0 » ; l'exemple Diffusers Wan 2.1 : `flow_shift = 5.0  # 5.0 for 720P, 3.0 for 480P` — [image2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/image2video.py), [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Divergence à connaître : les `scheduler_config.json` Diffusers de T2V-A14B et I2V-A14B contiennent `flow_shift: 3.0` (UniPC, `use_flow_sigmas: true`, `prediction_type: flow_prediction`), alors que les configs officielles utilisent 12.0 (T2V) et 5.0 (I2V) ; le 5B a `flow_shift: 5.0` des deux côtés — [scheduler_config T2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B-Diffusers/blob/main/scheduler/scheduler_config.json), [scheduler_config TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/scheduler/scheduler_config.json), [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py)
- Diffusers : la CFG n'est faite que si `guidance_scale > 1.0` (`do_classifier_free_guidance`) ; la passe négative est un second appel ; chaque appel est enveloppé dans `current_model.cache_context("cond"/"uncond", step_index, sigma, ...)` (points d'accroche pour les caches de calcul du `CacheMixin`) — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)
- Wan2.2-Lightning (lightx2v/ModelTC) : « only 4 steps without the need of CFG trick, leading to x20 speed-up » ; LoRA rang 64 publiées le 04/08/2025 (T2V V1), 07/08/2025 (T2V V1.1 et I2V V1) — [carte HF Wan2.2-Lightning](https://huggingface.co/lightx2v/Wan2.2-Lightning)
- Config Lightning T2V : `sample_shift = 5.0`, `sample_steps = 4`, `boundary = 0.875`, `sample_guide_scale = (1.0, 1.0)` ; `generate.py` y a `--sample_solver` par défaut `'euler'` (choix euler/unipc/dpm++) et avertit si une LoRA est utilisée avec un autre solveur ; les LoRA sont **fusionnées** dans les poids des deux experts (`load_and_merge_lora_weight_from_safetensors`, une LoRA par expert) — [wan_t2v_A14B.py Lightning](https://github.com/ModelTC/Wan2.2-Lightning/blob/main/wan/configs/wan_t2v_A14B.py), [generate.py Lightning](https://github.com/ModelTC/Wan2.2-Lightning/blob/main/generate.py), [text2video.py Lightning](https://github.com/ModelTC/Wan2.2-Lightning/blob/main/wan/text2video.py)
- lightx2v Wan2.2-Distill-Loras : LoRA rang 64 séparées haut-bruit / bas-bruit pour I2V-A14B, fusion hors-ligne recommandée (outil `converter.py`, avec option de quantification FP8), et pour l'inférence 4 pas un `denoising_step_list` recommandé `[1000, 750, 500, 250]` — [carte HF Wan2.2-Distill-Loras](https://huggingface.co/lightx2v/Wan2.2-Distill-Loras)

### Inferences
- Un moteur maison peut remplacer UniPC par un simple Euler de flow-matching (`x_{i+1} = x_i + (σ_{i+1} − σ_i)·v`) pour les variantes distillées ; pour les poids de base, UniPC ordre 2 avec 40–50 pas est la référence officielle.
- Coût **(dérivé)** : avec CFG, chaque pas = 2 passes DiT ; 40 pas ⇒ 80 passes ; Lightning 4 pas sans CFG ⇒ 4 passes, soit un facteur ~20, cohérent avec le « x20 » annoncé.
- Le shift contrôle à la fois la répartition du budget de pas vers les hauts bruits (mouvement/composition) et, pour l'A14B, la bascule entre experts (voir §4).

### Gaps
- CausVid (LoRA/distillation causale) : aucune source primaire lue dans ce lot ; son effet exact sur pas/CFG pour Wan 2.2 reste à documenter.
- Pas de comparaison qualité UniPC vs DPM++ vs Euler trouvée dans les sources lues.

---

## 7. Wan-Animate et S2V : injection de l'image de référence, de la pose, du visage et de l'audio

### Takeaway
Wan-Animate-14B est un DiT 14B I2V (36 canaux) augmenté : l'image de référence devient une frame latente supplémentaire en tête de séquence (+ embeddings CLIP en cross-attention), la pose est ajoutée aux tokens via un `Conv3d` dédié, et les expressions du visage passent par un encodeur de mouvement + un adaptateur de cross-attention inséré tous les 5 blocs ; S2V-14B injecte des features wav2vec2 par cross-attention **frame par frame** dans 12 blocs choisis, la référence et le contexte de mouvement étant ajoutés comme tokens supplémentaires à t=0.

### Cited Findings

**Wan-Animate-14B (publié le 19/09/2025)**
- Config : CLIP `models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth` (tokenizer `xlm-roberta-large`), LoRA de ré-éclairage `relighting_lora.ckpt`, VAE 2.1, dims 14B, `use_face_encoder=True`, `motion_encoder_dim=512`, `sample_steps=20`, `guide=1.0`, `frame_num=77`, `sample_fps=30`, prompt par défaut « 视频中的人在做动作 » (« la personne dans la vidéo fait une action ») — [wan_animate_14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_animate_14B.py) ; date — [README](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- `WanAnimateModel(in_dim=36, ...)` : `patch_embedding` + `pose_patch_embedding = nn.Conv3d(16, dim, kernel=patch, stride=patch)` ; `img_emb = MLPProj(1280, dim)` ; `motion_encoder = Generator(size=512, style_dim=512, motion_dim=20)` ; `face_encoder = FaceEncoder(in_dim=512, hidden_dim=dim, num_heads=4)` ; `face_adapter = FaceAdapter(heads_num=num_heads, hidden_dim=dim, num_adapter_layers=num_layers // 5)` — [model_animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/model_animate.py)
- `after_patch_embedding` : les latents de pose patchifiés sont **ajoutés** aux tokens vidéo à partir de la frame 1 (`x_[:, :, 1:] += pose_latents_`, la frame 0 étant la référence) ; les crops de visage (512×512 par frame) passent par `motion_encoder.get_motion` (par lots de 8) puis `face_encoder`, avec un vecteur nul en tête — [model_animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/model_animate.py)
- `after_transformer_block` : si `block_idx % 5 == 0`, `x = x + face_adapter.fuser_blocks[block_idx // 5](x, motion_vec, ...)` ; dans `forward`, `context = concat([img_emb(clip_fea), context])` (257 tokens image + texte) — [model_animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/model_animate.py)
- Pipeline `WanAnimate.generate` : lit `src_pose.mp4`, `src_face.mp4`, `src_ref.png` (et `src_bg.mp4`, `src_mask.mp4` en mode remplacement) depuis `--src_root_path` (sorties de l'étape de prétraitement) ; génère par clips de `clip_len=77` frames avec chevauchement `refert_num ∈ {1, 5}` frames reprises de la fin du clip précédent ; `y_ref = [mask_ref (4 ch), ref_latents (16 ch)]` pour 1 frame, `y_reft = [msk_reft, VAE(frames de guidage temporel + zéros ou fond)]`, `y = concat([y_ref, y_reft], dim=temps)` ; `clip_context = clip.visual(ref)` ; la passe « uncond » (si `guide_scale > 1`) remplace les visages par `-1` — [animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/animate.py)
- LoRA de ré-éclairage chargée via PEFT : `get_loraconfig(transformer, rank=128, alpha=128)` cible tous les `nn.Linear` contenant `"blocks"` mais pas `"face"` ni `"modulation"` ; `model.add_adapter(lora_config)` puis chargement du `state_dict` — [animate_utils.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/animate_utils.py), [animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/animate.py)
- Flags CLI : `--src_root_path`, `--refert_num` (« Recommended to be 1 or 5 »), `--replace_flag`, `--use_relighting_lora` — [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)

**Wan2.2-S2V-14B (publié le 26/08/2025 ; TTS CosyVoice ajouté le 05/09/2025)**
- Config : encodeur audio `wav2vec2-large-xlsr-53-english`, `audio_dim=1024`, `audio_inject_layers=[0,4,8,12,16,20,24,27,30,33,36,39]`, `enable_adain=True`, `adain_mode="attn_norm"`, `zero_timestep=True`, `enable_framepack=True`, `motion_frames=73`, `cond_dim=16`, `sample_steps=40`, `shift=3`, `guide=4.5`, `drop_first_motion=True` — [wan_s2v_14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_s2v_14B.py) ; dates — [README](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- Audio : chargement `librosa.load(audio_path, sr=16000)`, `hidden_states` wav2vec2 (dernière couche ou toutes), interpolation linéaire de 50 Hz vers la cadence vidéo (`linear_interpolation(feat, input_fps=50, output_fps=video_rate)`), puis découpage en « buckets » par frame (`get_audio_embed_bucket_fps(..., fps=16, batch_frames=infer_frames)`) — [audio_encoder.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/s2v/audio_encoder.py), [speech2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/speech2video.py)
- `WanModel_S2V.forward(x, t, context, seq_len, ref_latents, motion_latents, cond_states, audio_input, motion_frames=[17,5], ...)` : `CausalAudioEncoder` (`num_audio_token=4`, sortie globale pour AdaIN) ; pose via `cond_encoder` (Conv3d) **ajoutée** aux tokens vidéo ; tokens de la référence concaténés à la séquence avec une grille RoPE décalée (frame `30`→`31`) ; `mask_input` distingue bruit / référence / mouvement (`trainable_cond_mask = nn.Embedding(3, dim)`) ; contexte de mouvement compressé par `FramePackMotioner` — [model_s2v.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/s2v/model_s2v.py)
- `after_transformer_block` (blocs listés) : les états cachés des tokens vidéo sont réarrangés `"b (t n) c -> (b t) n c"` (une ligne par frame latente), normalisés par AdaIN conditionné par l'embedding audio global, puis passés dans `audio_injector.injector[i](x, context=audio_emb_de_cette_frame)` ; le résultat est ajouté en résidu — [model_s2v.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/s2v/model_s2v.py)
- Pipeline : `infer_frames=80` par clip (multiple de 4), `--num_clip`, `--pose_video` optionnel (DW-pose), `--start_from_ref`, `--enable_tts` (CosyVoice) ; sortie remuxée avec l'audio — [speech2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/speech2video.py), [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)

### Inferences
- La synchronisation labiale de S2V vient de la cross-attention restreinte par frame : chaque frame latente (≈4 frames vidéo) ne « voit » que les tokens audio de sa fenêtre temporelle ; c'est un alignement imposé par construction, différent de LTX-2 où l'alignement passe par une RoPE temporelle en secondes (§8).
- Animate et S2V réutilisent le squelette 14B : un moteur maison peut exposer des « hooks » génériques `after_patch_embedding` / `after_transformer_block(i)` et y brancher pose, visage ou audio.

### Gaps
- Le prétraitement Animate (extraction pose/visage/masque, dossier `wan/modules/animate/preprocess`) n'a pas été lu en détail ; l'architecture interne de `FaceBlock`, `CausalAudioEncoder` et `FramePackMotioner` n'est résumée qu'à partir des signatures.

---

## 8. Audio + vidéo conjoint (LTX-2 et successeurs) : VAE audio, transformer double flux, attention croisée, alignement parole/lèvres

### Takeaway
LTX-2 (arXiv 2601.03233, 6/01/2026) est un DiT asymétrique à deux flux (vidéo ~14B, audio ~5B) dont chaque bloc fait : self-attn + cross-attn texte par modalité, puis attention croisée bidirectionnelle audio→vidéo et vidéo→audio avec une RoPE **temporelle exprimée en secondes** commune aux deux flux, puis FFN ; le son est un mel-spectrogramme stéréo 16 kHz compressé par un VAE audio (8 canaux, ×4 en temps ⇒ 25 latents/s **(dérivé)**) et rendu par un vocodeur 24 kHz (variante BWE 48 kHz) ; en octobre 2026 le dépôt sert LTX-2.3 (22B, Gemma 3 12B) et LTX-2.5 (22B, encodeur « gemma4-12b »).

### Cited Findings
- Résumé arXiv : « asymmetric dual-stream transformer with a 14B-parameter video stream and a 5B-parameter audio stream, coupled through bidirectional audio-video cross-attention layers with temporal positional embeddings and cross-modality AdaLN for shared timestep conditioning » ; encodeur de texte multilingue ; « modality-aware classifier-free guidance (modality-CFG) » ; soumis le 6 janvier 2026 — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- Versions dans le dépôt : le README (oct. 2026) télécharge `Lightricks/LTX-2.5` : `ltx-2.5-22b-distilled-transformer-bf16`, `gemma4-12b-with-proj-ltx-2.5-bf16`, `ltx-2.5-video-vae`, `ltx-2.5-audio-vae`, upscaler latent ×2 (~66 Gio) ; `MODELS-LTX-2.3.md` liste `ltx-2.3-22b-dev`, `ltx-2.3-22b-distilled-1.1`, upscalers spatiaux ×2/×1.5, upscaler temporel ×2, LoRA distillée rang 384, et Gemma 3 (`gemma-3-12b-it-qat-q4_0-unquantized`) ; les checkpoints 2.3 ne sont pas interchangeables avec 2.5 — [README LTX-2](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/README.md), [MODELS-LTX-2.3.md](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/MODELS-LTX-2.3.md)
- Organisation : `packages/ltx-core` (modèles : `model/transformer`, `model/video_vae`, `model/audio_vae` dont `vocoder.py`, `text_encoders/gemma`, `conditioning`, `components` (patchifiers, schedulers, guiders, diffusion_steps), `quantization` (fp8, nvfp4)), `packages/ltx-pipelines` (`distilled.py`, `ti2vid_one_stage.py`, `ti2vid_two_stages.py`, `a2vid_two_stage.py`, `dubit.py`, `retake.py`, `keyframe_interpolation.py`, `ic_lora.py`, `t2a_one_stage.py`…), `packages/ltx-trainer` — [dépôt LTX-2](https://github.com/Lightricks/LTX-2/tree/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages)
- Bloc `BasicAVTransformerBlock` : vidéo `attn1` (self, RoPE), `attn2` (cross texte), `ff`, `scale_shift_table` ; audio `audio_attn1`, `audio_attn2`, `audio_ff`, `audio_scale_shift_table` ; couplage `audio_to_video_attn` (« Q: Video, K,V: Audio ») et `video_to_audio_attn` (« Q: Audio, K,V: Video »), modulées par `scale_shift_table_a2v_ca_video/audio` (5 paramètres) ; ordre du forward : self-attn modulée (RMSNorm) → cross-attn texte → A2V/V2A (sur un instantané des états d'avant A2V « so direction order doesn't bias the result ») → FFN modulée — [transformer.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/transformer/transformer.py)
- Les attentions croisées A2V/V2A utilisent `pe=video.cross_positional_embeddings, k_pe=audio.cross_positional_embeddings` (et inversement) ; `cross_pe_max_pos = max(positional_embedding_max_pos[0], audio_positional_embedding_max_pos[0])` — [transformer.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/transformer/transformer.py), [model.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/transformer/model.py)
- Alignement temporel : pour la vidéo, `positions = get_pixel_coords(...)` puis `positions[:, 0, ...] = positions[:, 0, ...] / self.fps` (axe temps en secondes) — [tools.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/tools.py) ; pour l'audio, `AudioPatchifier` « converts latent indices into real-time seconds » avec `audio_mel_frame * hop_length / sample_rate` (défauts `sample_rate=16000`, `hop_length=160`, `audio_latent_downsample_factor=4`, `is_causal=True`) — [patchifiers.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/components/patchifiers.py)
- Dimensions par défaut (`LTXModelConfigurator`) : `num_layers=48`, vidéo `num_attention_heads=32 × attention_head_dim=128`, `in/out_channels=128`, `cross_attention_dim=4096`, `positional_embedding_max_pos=[20, 2048, 2048]` ; audio `32 têtes × 64`, `audio_in/out_channels=128`, `audio_cross_attention_dim=2048`, `audio_positional_embedding_max_pos=[20]` ; options `apply_gated_attention`, `cross_attention_adaln`, `use_keyframes_abs_pos_embedding` lues dans les métadonnées du checkpoint — [model_configurator.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/transformer/model_configurator.py)
- VAE vidéo : patchify 4 puis compression jusqu'à `F' = 1 + (F-1)/8, H' = H/32, W' = W/32`, 128 canaux latents (`VIDEO_LATENT_CHANNELS = 128`) — [video_vae.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/video_vae/video_vae.py), [constants.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-pipelines/src/ltx_pipelines/utils/constants.py)
- VAE audio : `LATENT_DOWNSAMPLE_FACTOR = 4`, `mel_hop_length=160`, `mel_bins=64` par défaut, entrée `(batch, channels, frames, mel_bins)` — [audio_vae.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/model/audio_vae/audio_vae.py) ; Diffusers `AutoencoderKLLTX2Audio` : `in_channels=2` (stéréo), `latent_channels=8`, `sample_rate=16000`, `mel_hop_length=160`, `is_causal=True` ; vocodeur `output_sampling_rate=24000`, variante `LTX2VocoderWithBWE` 16 kHz→48 kHz — [autoencoder_kl_ltx2_audio.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/autoencoders/autoencoder_kl_ltx2_audio.py), [vocoder.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/ltx2/vocoder.py)
- Encodeur de texte : Gemma (Diffusers : `Gemma3ForConditionalGeneration | Gemma4UnifiedForConditionalGeneration`) ; `FeatureExtractorV1` (« 19B: per-segment norm -> aggregate_embed -> 3840 ») empile les états cachés de toutes les couches ; `Embeddings1DConnector` (2 blocs transformer par défaut) ; Diffusers : `connectors: LTX2TextConnectors`, `caption_channels=3840`, `max_sequence_length=1024` — [feature_extractor.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/text_encoders/gemma/feature_extractor.py), [embeddings_connector.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/text_encoders/gemma/embeddings_connector.py), [pipeline_ltx2.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/ltx2/pipeline_ltx2.py), [transformer_ltx2.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/transformers/transformer_ltx2.py)
- Guidage multimodal : `pred = cond + (cfg−1)(cond − uncond_text) + stg·(cond − uncond_perturbed) + (modality−1)(cond − uncond_modality)`, puis rescale par `cond.std()/pred.std()` — [guiders.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-core/src/ltx_core/components/guiders.py) ; Diffusers calcule `uncond_modality` avec `isolate_modalities=True` (« Turn off A2V and V2A cross attn to isolate video and audio modalities ») — [pipeline_ltx2.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/ltx2/pipeline_ltx2.py)
- Défauts (`constants.py`) : LTX-2 : étage 1 en 512×768, 121 frames, 24 fps, 40 pas, vidéo `cfg=3.0, stg=1.0, rescale=0.7, modality=3.0, stg_blocks=[29]`, audio `cfg=7.0`, idem sinon ; LTX-2.3 : 30 pas, `stg_blocks=[28]` ; HQ 2.3 : 15 pas, étage 1 en 544×960 ; sigmas distillés `[1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0]` (8 pas) et étage 2 `[0.909375, 0.725, 0.421875, 0.0]` — [constants.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-pipelines/src/ltx_pipelines/utils/constants.py)
- CHANGELOG 1.4.0 (29/09/2026) : génération longue par fenêtres (`--chunked`, fenêtres de 97 frames, 25 frames reportées), Euler ancestral (`eta=1.0`) pour les checkpoints LTX-2.5+ en distillé, `AudioConditionByLatentIndex` ; politiques de quantification `fp8-cast` et `fp8-scaled-mm` (+ dossier `nvfp4`) — [CHANGELOG.md](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/CHANGELOG.md), [quantization_factory.py](https://github.com/Lightricks/LTX-2/blob/be6d6d0a69d11a0a399c462ed92606692e5f8697/packages/ltx-pipelines/src/ltx_pipelines/utils/quantization_factory.py)
- Appel Diffusers documenté : `LTX2Pipeline.from_pretrained("Lightricks/LTX-2", torch_dtype=torch.bfloat16)`, `enable_model_cpu_offload()`, `pipe(prompt, negative_prompt, width=768, height=512, num_frames=121, frame_rate=24.0, num_inference_steps=30, guidance_scale=3.0, output_type="np", return_dict=False)` → `(video, audio)`, puis `encode_video(video[0], fps=frame_rate, audio=audio[0].float().cpu(), audio_sample_rate=pipe.vocoder.config.output_sampling_rate, output_path="video.mp4")` ; défauts `__call__` : `audio_guidance_scale=7.0`, `modality_scale=3.0`, `stg_scale=1.0`, `spatio_temporal_guidance_blocks=[28]`, `guidance_rescale=0.7`, `max_seconds=20.0` — [pipeline_ltx2.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/ltx2/pipeline_ltx2.py)

### Inferences
- Lèvres/parole : la RoPE croisée ne porte que l'axe temps, exprimé en secondes des deux côtés (vidéo : indice pixel / fps ; audio : indice mel × 160 / 16000) ; un token vidéo et un token audio au même instant ont donc la même phase, ce qui biaise l'attention croisée vers les paires synchrones. C'est le mécanisme de lip-sync « appris » de LTX-2, à opposer au découpage par frame codé en dur de Wan-S2V.
- Ordres de grandeur **(dérivé)** : 121 frames à 512×768 → 16×16×24 = 6 144 tokens vidéo (patch 1) ; 5,04 s d'audio → ≈126 latents audio (25/s), chacun de 8 canaux × 16 bins mel = 128 features, cohérent avec `audio_in_channels=128`.
- `positional_embedding_max_pos[0]=20` et `max_seconds=20.0` suggèrent un horizon natif de ~20 s par passe, d'où le mode « chunked » pour les clips plus longs.
- Coût du guidage complet LTX-2 : jusqu'à 4 passes par pas (cond, sans texte, perturbée STG, modalités isolées) **(dérivé)** — les versions distillées l'évitent.

### Gaps
- Différences d'architecture précises entre LTX-2 (19B), 2.3 (22B) et 2.5 (22B, « gemma4-12b ») non lues dans les métadonnées des checkpoints (flags `apply_gated_attention`, `cross_attention_adaln` par version non vérifiés).
- Aucune évaluation indépendante de la qualité du lip-sync de LTX-2 n'a été lue ici.

---

## 9. Réglages d'inférence utiles : 9:16, nombre de frames, fps, offload, FP8, parallélisme ; appel Python minimal avec Diffusers

### Takeaway
Pour du 9:16 : TI2V-5B en `--size 704*1280` (largeur×hauteur), 121 frames à 24 fps (≈5 s) sur une carte 24 Go avec `--offload_model True --convert_model_dtype --t5_cpu` ; A14B en `480*832` ou `720*1280`, 81 frames à 16 fps (≈5 s), ≥80 Go en mono-GPU d'après le README ; le dépôt officiel n'a pas de FP8 (il faut passer par Diffusers `enable_layerwise_casting`, musubi-tuner ou LightX2V) ; le multi-GPU = FSDP + Ulysses.

### Cited Findings
- Convention de taille : `SIZE_CONFIGS['704*1280'] = (704, 1280)` et le code utilise `size[1]` comme hauteur et `size[0]` comme largeur ⇒ `704*1280` = 704 de large × 1280 de haut (portrait 9:16) — [configs/__init__.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/__init__.py), [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)
- Tailles supportées : 5B `704*1280`, `1280*704` (« Unlike other tasks, the 720P resolution of the Text-Image-to-Video task is 1280*704 or 704*1280 ») ; A14B `720*1280`, `1280*720`, `480*832`, `832*480` ; S2V ajoute `1024*704`, `704*1024`, `704*1280`, `1280*704` ; Animate `720*1280`, `1280*720` ; pour I2V, « the aspect ratio of the output video will follow that of the input image » — [configs/__init__.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/__init__.py), [README](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md), [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)
- Frames/fps par défaut : 81 frames et 16 fps (partagé), 121 frames et 24 fps (5B), 77 frames et 30 fps (Animate) ; S2V par clips de 80 frames (`--infer_frames`) à 16 fps — [shared_config.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/shared_config.py), [wan_ti2v_5B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_ti2v_5B.py), [speech2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/speech2video.py)
- VRAM (README) : T2V/I2V-A14B mono-GPU avec `--offload_model True --convert_model_dtype` → « at least 80GB VRAM » ; TI2V-5B avec `--offload_model True --convert_model_dtype --t5_cpu` → « at least 24GB VRAM (e.g, RTX 4090 GPU) » ; le 5B génère « a 5-second 720P video in under 9 minutes on a single consumer-grade GPU » — [README](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md)
- `--offload_model` : si non précisé, `True` en mono-GPU et `False` en multi-GPU ; il renvoie le DiT/T5 sur CPU entre les étapes et appelle `torch.cuda.empty_cache()` ; `--convert_model_dtype` convertit le DiT en `param_dtype` (bf16) ; `init_on_cpu=True` par défaut (désactivé si FSDP/SP) — [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py), [text2video.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/text2video.py)
- Multi-GPU : `torchrun --nproc_per_node=8 generate.py ... --dit_fsdp --t5_fsdp --ulysses_size 8` ; `ulysses_size` doit égaler `world_size` ; FSDP/SP interdits en mono-processus — [README](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/README.md), [generate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/generate.py)
- FP8 : aucune occurrence de `fp8`/`float8` dans le code Python du dépôt Wan2.2 (recherche locale) — [dépôt Wan2.2](https://github.com/Wan-Video/Wan2.2/tree/1ea34ff48f87168174e12956e200b1d908b1c5ff) ; musubi-tuner propose `--fp8`, `--fp8_scaled`, `--fp8_fast`, `--fp8_t5`, `--blocks_to_swap`, `--offload_inactive_dit`, `--lazy_loading`, et annonce l'inférence 720×1280×81 frames en 24 Go via fp8 + block swap — [musubi docs/wan.md](https://github.com/kohya-ss/musubi-tuner/blob/main/docs/wan.md) ; Diffusers fournit `enable_layerwise_casting`, `enable_group_offload`, `set_attention_backend` (backends `flash`, `flash_varlen`, `_flash_3`, `sage`, `flex`, `native`, …) et Wan déclare `_skip_layerwise_casting_patterns = ["patch_embedding", "condition_embedder", "norm"]` — [modeling_utils.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/modeling_utils.py), [attention_dispatch.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/attention_dispatch.py), [transformer_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/models/transformers/transformer_wan.py)
- Diffusers : `height`/`width` sont arrondis vers le bas au multiple de `vae_scale_factor_spatial * patch_size` (`h_multiple_of`, `w_multiple_of`) avec un avertissement, soit 16 px pour le VAE 2.1 et 32 px pour le VAE 2.2 ; défauts `__call__` : `height=480, width=832, num_frames=81, num_inference_steps=50, guidance_scale=5.0, max_sequence_length=512` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py), [vae/config.json TI2V-5B](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/blob/main/vae/config.json)
- Exemple officiel Diffusers (Wan 2.1) : `vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)`, `pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=torch.bfloat16)`, `pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=flow_shift)`, `.frames[0]`, `export_to_video(output, "output.mp4", fps=16)` — [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py)

**Appel minimal reconstruit (NON exécuté) — TI2V-5B, image → vidéo 9:16**
```python
import torch
from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
from diffusers.utils import export_to_video, load_image

model_id = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"           # expand_timesteps=True, VAE 48 canaux
vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
pipe = WanImageToVideoPipeline.from_pretrained(model_id, vae=vae, torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()      # ~carte 24 Go ; sinon pipe.to("cuda")
pipe.vae.enable_tiling()             # optionnel : réduit le pic mémoire du décodage

image = load_image("reference_9x16.png")
neg = ("Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, "
       "static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, "
       "extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, "
       "fused fingers, still picture, messy background, three legs, many people in the background, walking backwards")
frames = pipe(
    image=image, prompt="...", negative_prompt=neg,
    height=1280, width=704,          # multiples de 32 (VAE 16 x patch 2)
    num_frames=121,                  # 4k+1 ; 121 / 24 fps = ~5 s
    num_inference_steps=50, guidance_scale=5.0,   # défauts officiels du 5B (shift 5.0 déjà dans scheduler_config)
    generator=torch.Generator("cuda").manual_seed(42),
).frames[0]
export_to_video(frames, "out_9x16.mp4", fps=24)
```

**Variante A14B T2V avec les valeurs officielles et une LoRA de distillation (NON exécuté)**
```python
from diffusers import WanPipeline, UniPCMultistepScheduler
pipe = WanPipeline.from_pretrained("Wan-AI/Wan2.2-T2V-A14B-Diffusers", vae=vae_21, torch_dtype=torch.bfloat16)
pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=12.0)  # config HF = 3.0
video = pipe(prompt=..., negative_prompt=neg, height=832, width=480, num_frames=81,
             num_inference_steps=40, guidance_scale=4.0,      # transformer   = expert haut-bruit
             guidance_scale_2=3.0).frames[0]                  # transformer_2 = expert bas-bruit
# Distillation 4 pas : une LoRA par expert
# pipe.load_lora_weights(high_lora, adapter_name="lx_high")
# pipe.load_lora_weights(low_lora,  adapter_name="lx_low", load_into_transformer_2=True)
# puis num_inference_steps=4, guidance_scale=1.0, guidance_scale_2=1.0 (CFG désactivée car <= 1.0)
export_to_video(video, "out.mp4", fps=16)
```
Bases de ces extraits : signatures et logique de [pipeline_wan.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan.py), [pipeline_wan_i2v.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/pipelines/wan/pipeline_wan_i2v.py), `load_into_transformer_2` dans [lora_pipeline.py (`WanLoraLoaderMixin`)](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/loaders/lora_pipeline.py), valeurs de [wan_t2v_A14B.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/configs/wan_t2v_A14B.py) et de la config Lightning.

### Inferences
- En 9:16 « réseaux sociaux », le 5B à 704×1280 est le seul chemin officiel proche du 720p sur 24 Go ; l'A14B en 480×832 est l'alternative qualité/mouvement si l'on dispose de plus de VRAM ou d'un block-swap/FP8 communautaire.
- Pour un moteur maison, garder l'abstraction « taille = (largeur, hauteur) » de Wan et forcer les multiples de 16/32 px dès l'interface évite les arrondis silencieux.
- Le shift à 3.0 des `scheduler_config.json` A14B de Diffusers diffère de l'officiel : à fixer explicitement si l'on veut reproduire les sorties de `generate.py`.

### Gaps
- Pas de mesure VRAM/temps pour Diffusers (offload, tiling, layerwise casting FP8) ; les extraits n'ont pas été exécutés ; l'adéquation exacte des LoRA lightx2v au format Diffusers (conversion de clés) n'a pas été testée.

---

## 10. Points d'accroche des LoRA : couches visées, et comment musubi-tuner / DiffSynth-Studio / Diffusers s'y branchent

### Takeaway
Toutes les chaînes ciblent les mêmes `nn.Linear` des blocs DiT : `self_attn.{q,k,v,o}`, `cross_attn.{q,k,v,o}` (+ `k_img`, `v_img` pour Wan 2.1 I2V) et `ffn.0`/`ffn.2` ; on exclut plongements, normes, tête et modulation ; pour l'A14B il faut une LoRA par expert (haut/bas bruit), entraînée sur la plage de timesteps correspondante.

### Cited Findings
- musubi-tuner : `WAN_TARGET_REPLACE_MODULES = ["WanAttentionBlock"]` (toutes les `Linear` à l'intérieur des blocs) et exclusion forcée `r".*(patch_embedding|text_embedding|time_embedding|time_projection|norm|head).*"` — [lora_wan.py](https://github.com/kohya-ss/musubi-tuner/blob/main/src/musubi_tuner/networks/lora_wan.py)
- musubi-tuner Wan 2.2 : `--task t2v-A14B | i2v-A14B`, `--dit` (bas-bruit) + `--dit_high_noise`, bascule `--timestep_boundary` (défaut 0.875 T2V, 0.9 I2V), `--min_timestep/--max_timestep` (0–1000), `--offload_inactive_dit`, `--blocks_to_swap`, `--fp8_base`, `--timestep_sampling shift --discrete_flow_shift 3.0` (exemple), et la remarque que l'officiel utilise un shift 12.0 (T2V) / 5.0 (I2V) en inférence ; `--network_module networks.lora_wan` — [docs/wan.md](https://github.com/kohya-ss/musubi-tuner/blob/main/docs/wan.md)
- DiffSynth-Studio (exemple TI2V-5B) : `--lora_base_model "dit"`, `--lora_target_modules "q,k,v,o,ffn.0,ffn.2"`, `--lora_rank 32`, `--learning_rate 1e-4`, 480×832, 49 frames, `--extra_inputs "input_image"`, poids officiels (`diffusion_pytorch_model*.safetensors`, `models_t5_umt5-xxl-enc-bf16.pth`, `Wan2.2_VAE.pth`) — [Wan2.2-TI2V-5B.sh](https://github.com/modelscope/DiffSynth-Studio/blob/main/examples/wanvideo/model_training/lora/Wan2.2-TI2V-5B.sh)
- Diffusers : `_convert_non_diffusers_wan_lora_to_diffusers` retire le préfixe `diffusion_model.`, accepte `lora_A`/`lora_down`, applique l'échelle `alpha/rank`, mappe `blocks.{i}.self_attn.{q,k,v,o}` → `blocks.{i}.attn1.{to_q,to_k,to_v,to_out.0}`, `cross_attn.*` → `attn2.*`, `k_img/v_img` → `add_k_proj/add_v_proj`, gère `ffn.*`, traite les clés `diff_b` comme biais LoRA et ignore les `diff` de normes — [lora_conversion_utils.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/loaders/lora_conversion_utils.py)
- `WanLoraLoaderMixin.load_lora_weights(..., load_into_transformer_2=True)` charge la LoRA dans le second expert (erreur si le pipeline n'a pas de `transformer_2`) — [lora_pipeline.py](https://github.com/huggingface/diffusers/blob/7ecb1e1b4fe500be7fb7381a7bb79a24d7fa3941/src/diffusers/loaders/lora_pipeline.py)
- Dépôt officiel : seul Animate utilise une LoRA (PEFT, rang 128, toutes les `Linear` de `blocks` sauf `face`/`modulation`) ; `WanAnimateModel` hérite de `PeftAdapterMixin`, alors que `WanModel` de base n'hérite que de `ModelMixin, ConfigMixin` — [animate_utils.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/animate_utils.py), [model_animate.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/animate/model_animate.py), [model.py](https://github.com/Wan-Video/Wan2.2/blob/1ea34ff48f87168174e12956e200b1d908b1c5ff/wan/modules/model.py)
- Les LoRA de distillation lightx2v sont publiées par expert (`..._high_noise_lora_rank64_...`, `..._low_noise_lora_rank64_...`) et peuvent être fusionnées hors-ligne avec `converter.py --model_type wan_dit --lora_path ... --lora_strength 1.0` — [Wan2.2-Distill-Loras](https://huggingface.co/lightx2v/Wan2.2-Distill-Loras)

### Inferences
- Pour un personnage récurrent (« la troupe »), une LoRA de ~rang 32–64 sur `q,k,v,o,ffn.0,ffn.2` est le standard commun aux trois outils ; sur l'A14B, l'identité visuelle fine relève surtout de l'expert bas-bruit, la composition/mouvement de l'expert haut-bruit (déduit du partage des rôles décrit au §4), d'où l'usage courant d'entraîner les deux avec `--timestep_boundary`.
- Les noms de couches diffèrent (officiel `self_attn.q` vs Diffusers `attn1.to_q`) : un moteur maison doit prévoir un convertisseur de clés à l'image de `_convert_non_diffusers_wan_lora_to_diffusers` pour accepter les LoRA de la communauté (ComfyUI/musubi/lightx2v).

### Gaps
- Pas de source primaire chiffrant l'apport d'entraîner une LoRA sur un seul expert vs les deux ; non vérifié si la LoRA « relighting » d'Animate est chargeable telle quelle dans Diffusers.
