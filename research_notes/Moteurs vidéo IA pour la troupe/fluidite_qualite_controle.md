# Fluid, high-quality motion from AI video models: generation, post-processing, automatic QA, and how models handle stylised African characters (as of 16 October 2026)

Scope: a "fluid 3D animation studio" for a recurring troupe of stylised, Pixar-like West-African cartoon characters, in 9:16 TikTok sketches. A previous Blender-rig attempt failed a rhythm gate ("motion 0.0271, coverage 0.53"). The user described the result as "too lego". Target stack: open-weight Wan 2.x, HunyuanVideo and LTX-2, with possible paid APIs (Veo 3, Kling, Grok Imagine). The dev container has no GPU (4 cores, 15 GB RAM). Dates are given where the sources state them. Research was done on 2026-10-16.

---

## 1. Generation side: frame rate and frame count, motion prompting, motion LoRAs, guidance tricks, RL fine-tuning, motion priors, and the slow or frozen output of 4-step distilled LoRAs

### Takeaway
On open weights, the most practical motion fixes need no training. Generate at the model's native rate: 16 fps / 81 frames for Wan 2.2 A14B, 24 fps for Wan 2.2 TI2V-5B, up to 50 fps for LTX-2, then interpolate. Use I2V motion boosters such as Adaptive Low-Pass Guidance or the PainterI2V `motion_amplitude` node. Use fixed CFG variants such as CFG-Zero* or APG, and temporal-attention tweaks such as Enhance-A-Video and FreeInit. Avoid the stock lightx2v 4-step LoRAs, or swap them for the community "slow-mo fix" variants, because they are widely reported to produce slow motion. RL or preference fine-tuning (VideoReward + Flow-DPO, DanceGRPO) and motion-prior training (VideoJAM) are documented to improve motion. They need multi-GPU training, and the reward models can be gamed ("reward hacking").

### Cited Findings

**Which open weights exist, and their native fps, frame counts and hardware**
- Wan2.2-I2V-A14B, official model card. Licence Apache 2.0. 480P and 720P. MoE with two ~14B experts (27B total, 14B active per step): a high-noise expert handles layout and a low-noise expert handles detail, with the switch set by SNR. The single-GPU command needs ≥80 GB VRAM. Code and weights released 28 July 2025. The card gives no fps for A14B. — [HF Wan-AI/Wan2.2-I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B)
- Wan2.2 TI2V-5B is 720P at 24 fps. The official card says it runs on consumer GPUs such as the 4090 and makes a 5 s 720P video in under 9 minutes. — [HF Wan-AI/Wan2.2-I2V-A14B](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B). A third-party summary gives the TI2V-5B default as 1280×704, 24 fps, 121 frames (~5 s). — [cnapsstudio Notion](https://cnapsstudio.notion.site/video-generation-wan2-2-ti2v-5b)
- The common Wan pattern is 81 frames at 16 fps. A vLLM-Omni doc shows Wan2.2-T2V-A14B generating 81 frames at 16 fps with frame interpolation as a post-processing step ("does not modify the diffusion denoising schedule"). — [vLLM-Omni frame interpolation doc](https://docs.vllm.ai/projects/vllm-omni/en/stable/user_guide/diffusion/frame_interpolation/). A Wan 2.1 ComfyUI workflow uses RIFE to go from 16 fps to 32 fps after generating 81 frames. — [comfyui.org Wan2.1 workflow](https://comfyui.org/en/wan2-1-video-stabilization-workflow). One community post says Wan 2.2 makes up to 720p at 16 fps and suggests upscaling and interpolating to 30 fps. — [Reddit snapshot](https://reddit.sentinel-team.org/posts/1teeots/snapshots/2026-05-22T22%3A42%3A24.48386Z)
- Newer Wan versions are closed. Several mid-2026 analyses report that Wan 2.6 (API through Alibaba Bailian), Wan 2.7 (April 2026) and Wan 3.0 (public beta, August 2026) have no published weights. They say Wan 2.2 is still the newest downloadable Wan, as checked on 10 Aug 2026. — [HowAIWorks](https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2); **contradicted by** SEO-type pages claiming Wan 2.7 is Apache 2.0 open weights, e.g. [nemovideo](https://www.nemovideo.com/blog/wan-2-7-open-source) and [wan27.org](https://www.wan27.org/blog/wan-2-6-open-source-guide). The detailed sources (HowAIWorks, AI Video Sensei) look more reliable.
- LTX-2 (Lightricks) makes synchronised video and audio in one pass, up to 20 s, at native 4K and 50 fps. Variants: bf16 dev, fp8, fp4, distilled, upscaler. The licence is a community licence: free for research, and free for commercial use by companies under US$10M ARR. — [invideo blog, Aug 2026](https://invideo.io/blog/ltx-ai-video-generator/); [HF LTX-2 README mirror](https://huggingface.co/Jesustepez/LTX-2/blob/main/README.md). LTX-2.3 was released 5 March 2026 with a rebuilt VAE and **native portrait (9:16) support**. — [NYU Shanghai RITS](https://rits.shanghai.nyu.edu/ai/ltx-2-3-sharper-video-native-portrait-and-cleaner-audio-in-lightricks-latest-open-source-model/). Sources disagree on the LTX-2.3 licence (Apache 2.0 vs LTX-2 Community). Only one source reports an LTX-2.5 release on 11 Aug 2026. — [gradually.ai](https://www.gradually.ai/en/ai-models/ltx-2-5/)
- HunyuanVideo 1.5 is under the Tencent Hunyuan Community License. Its territory is "worldwide excluding the EU, UK and South Korea". Reviews say users in those regions may not use the model *or its outputs*, and the licence bars using outputs to improve other AI models. — [HunyuanVideo licence commit](https://huggingface.co/tencent/HunyuanVideo/commit/a4ed25a99d7eb9cf21e12f5fd8052d266f2105fc); [DeepWiki licence summary](https://deepwiki.com/Tencent/HunyuanVideo/5-license-and-legal); [chatforest review](https://chatforest.com/reviews/hunyuanvideo-tencent-open-source-video-generation/)

**Slow or frozen output from 4-step distilled LoRAs (lightx2v)**
- The official LightX2V Wan2.2 4-step distill LoRAs are rank-64 high- and low-noise pairs that need the original Wan2.2 I2V base. — [cnb.cool LightX2V mirror](https://cnb.cool/ai-models/lightx2v/Wan2.2-Distill-Loras)
- A community model card says the default ComfyUI Wan2.2 I2V workflow's LightX2V LoRAs "tend to turn scenes into slow motion". It offers a replacement high/low-noise pair (4 steps, strength 1.0 on both, Apache-2.0, with a "260412" variant). It does not explain the cause. — [HF rzgar/Wan2.2_I2V_LightX2V_Slow-Mo_Fix](https://huggingface.co/rzgar/Wan2.2_I2V_LightX2V_Slow-Mo_Fix)
- **PainterI2V** is a drop-in replacement for `WanImageToVideo` that adds a `motion_amplitude` parameter:
  - 1.0 behaves like the original node; 1.15 is the default.
  - Suggested ranges: 1.10–1.20 for walking or waving, 1.25–1.35 for running or jumping, 1.5 for extreme motion.
  - It claims +15–50% motion amplitude and better response to camera prompts. It works by brightness-protected scaling of motion vectors, zero latent initialisation and `reference_latents`.
  - A 2025-12-30 "PainterI2Vadvanced" version followed, and the nodes were merged into ComfyUI-PainterNodes on 2026-07-25. No licence is shown on the page.
  - Source: [GitHub princepainter/ComfyUI-PainterI2V](https://github.com/princepainter/ComfyUI-PainterI2V)
- Pusa-Wan2.2 notes recommend 4 steps and CFG 1 with LightX2V, and *lower* LoRA alphas (~1.5 high / 1.4 low) for smoother motion, because "a larger alpha reduces motion". — [HF RaphaelLiu/Pusa-Wan2.2-V1](https://huggingface.co/RaphaelLiu/Pusa-Wan2.2-V1). Another card warns that lowering LightX2V strength weakens the speed-up and can cause blur or broken motion. — [HF rzgar/Wan2.2_LightX2V_4Step_Uncensored](https://huggingface.co/rzgar/Wan2.2_LightX2V_4Step_Uncensored)
- No official fix from the Wan or LightX2V teams turned up in this search. The fixes are community-made. — (search finding, same sources as above)

**Training-free guidance and sampling tricks**
- **Adaptive Low-Pass Guidance (ALG)** targets static output in I2V. The authors attribute it to "premature exposure to high-frequency details in the input image". ALG low-pass-filters the conditioning image early in denoising. They report **+33% average VBench dynamic degree across models while maintaining quality**. Training-free. v1 June 2025, v2 24 Feb 2026. Code is linked from the project page choi403.github.io/ALG. — [arXiv 2506.08456](https://arxiv.org/abs/2506.08456)
- **CFG-Zero\*** (NTU/Purdue, arXiv 2503.18886) adds an optimised scalar on the guidance and "zero-init", which skips the first few ODE solver steps. It was evaluated on **Wan-2.1 T2V** as well as Flux and SD3. Code: github.com/WeichenFan/CFG-Zero-star. — [arXiv 2503.18886](https://arxiv.org/abs/2503.18886v2)
- **APG (Adaptive Projected Guidance)**, Sadat, Hilliges and Weber (ETH/Disney Research), ICLR 2025. It down-weights the part of the CFG update parallel to the conditional prediction and adds rescaling and momentum. This reduces the oversaturation and artifacts of high CFG with almost no overhead. The experiments are on *image* models (EDM2, Stable Diffusion) only. — [arXiv 2410.02416](https://arxiv.org/abs/2410.02416v1); [ICLR 2025 paper](https://proceedings.iclr.cc/paper_files/paper/2025/file/d1450d6c10c6b6cf1b80964357f5fa08-Paper-Conference.pdf)
- **Enhance-A-Video** (arXiv 2502.07508, Feb 2025) is training-free and plug-and-play. It boosts cross-frame correlation by scaling the mean off-diagonal temporal attention with a temperature. Tested on HunyuanVideo (3D full attention), CogVideoX, LTX-Video and Open-Sora. Reported gains in temporal consistency and visual quality at small cost. — [arXiv 2502.07508](https://arxiv.org/pdf/2502.07508); [liner review](https://liner.com/review/enhanceavideo-better-generated-video-for-free)
- **FreeInit** (ECCV 2024, NTU S-Lab) points to a train/inference gap in the frequency profile of the initial noise. It iteratively refines the low-frequency part of the initial latent during sampling, which improves temporal consistency and subject appearance with no training. — [arXiv 2312.07537](https://arxiv.org/pdf/2312.07537); [ECCV page](https://www.ecva.net/papers/eccv_2024/papers_ECCV/html/423_ECCV_2024_paper.php)

**Motion priors and RL or preference fine-tuning**
- **VideoJAM** (Meta + Tel Aviv University, ICML 2025, arXiv 2502.02492):
  - It argues that the pixel-reconstruction objective biases models toward appearance over motion coherence.
  - It trains the model to predict pixels *and* motion from one shared representation, then uses "Inner-Guidance" at inference.
  - The authors claim state-of-the-art motion coherence that beats proprietary models, and say it applies to any video model "with minimal adaptations" and no change to training data.
  - These are the authors' own claims.
  - Sources: [arXiv 2502.02492](https://arxiv.org/abs/2502.02492); [PMLR v267](https://proceedings.mlr.press/v267/chefer25a.html)
- **VideoAlign / VideoReward** (Kling AI Research, NeurIPS 2025, arXiv 2501.13918):
  - A VLM reward model trained on 182k annotated examples (16k prompts × 12 T2V models).
  - It scores Visual Quality, **Motion Quality** (dynamic stability, reasonableness, naturalness, dynamic degree) and Text Alignment.
  - Flow-DPO beat Flow-RWR and SFT.
  - Base model Qwen2-VL-2B-Instruct; repo licence MIT. The checkpoints' licence is not stated.
  - Flow-DPO code was released 17 July 2025.
  - The repo lists uses as "data filtering, guidance, reject sampling, DPO".
  - Sources: [arXiv 2501.13918](https://arxiv.org/html/2501.13918v2); [GitHub KlingAIResearch/VideoAlign](https://github.com/KlingAIResearch/VideoAlign)
- The VideoReward authors admit reward-hacking risk: "human assessments indicate a marked decrease in video quality, yet the reward model continues to assign high scores". — [arXiv 2501.13918](https://arxiv.org/pdf/2501.13918). ContentV saw the same thing independently: with VideoAlign RLHF, "reward scores improved steadily, but the qualitative performance… showed no significant enhancement". — [ContentV arXiv 2506.05343](https://arxiv.org/pdf/2506.05343)
- **DanceGRPO** (ByteDance Seed + HKU, arXiv 2505.07818) applies GRPO to diffusion and rectified-flow models, with a video motion-quality reward. The authors report up to 181% relative improvement on benchmarks including VideoAlign. They state that earlier DPO variants (Diffusion-DPO, Flow-DPO, OnlineVPO) gave only marginal visual gains. — [arXiv 2505.07818](https://arxiv.org/html/2505.07818v2)
- **DenseDPO** turned up only in a related-work passage: it densifies video preferences across time to target temporal locality. — [via DanceGRPO / DPP paper](https://arxiv.org/html/2511.20647v1)

### Inferences
- The old Blender rig scored "motion 0.0271" (most likely a normalised mean frame-difference or flow magnitude). That number reflects *keyframed procedural* motion. Diffusion models trained on real footage produce organic secondary motion (cloth, weight shifts, overlapping action), which is what the "lego" complaint is about. The bigger danger with diffusion models is the opposite failure mode: near-static I2V output and slow motion from distilled LoRAs. Treat motion amplitude as a *two-sided* gate: reject both too little and too much.
- Recommended open-weight recipe (inference from the sources above):
  - Wan 2.2 A14B I2V from a canonical character-sheet image, at 16 fps × 81 frames (≈5 s).
  - Prefer full-step sampling (≈20–30 steps, CFG > 1 with CFG-Zero* or APG) for hero shots. Use 4-step lightx2v only for drafts, paired with the slow-mo-fix LoRA or PainterI2V at `motion_amplitude` 1.15–1.3.
  - Add ALG if I2V output is static.
  - Then interpolate ×2 to 32 fps or ×3 to 48 fps. TikTok usually plays at 30 fps, so ×2 (32 fps, or retimed to 30) is enough.
- Interpolation adds smoothness, not speed. If a clip *feels* slow-motion, a common fix is to retime it, for example playing 16 fps material at 20–24 fps (1.25–1.5× speed-up) before interpolating. This shortens the clip and should be tested per shot. (Inference; no source found that benchmarks this trick.)
- LTX-2's native 50 fps and LTX-2.3's native portrait support could avoid interpolation and 16:9→9:16 cropping altogether, at the cost of the community licence's revenue cap.
- HunyuanVideo 1.5's territorial exclusion and output restriction add legal risk if the troupe's content reaches EU/UK audiences or is produced there. Wan 2.2 (Apache 2.0) is the cleanest licence among the strong open models.
- VideoJAM, Flow-DPO and DanceGRPO need training compute (multi-GPU) and preference data. For a small studio, the realistic use of VideoReward is **best-of-N reject sampling** (generate 3–4 seeds, keep the best Motion Quality score), not RL fine-tuning.

### Gaps
- No public VideoJAM code or weights for Wan, Hunyuan or LTX were confirmed. Its adoption in open models is unverified.
- No head-to-head benchmark of CFG-Zero*, APG, Enhance-A-Video, FreeInit and ALG on Wan 2.2 or LTX-2 was found. APG was validated only on image models in its paper. Enhance-A-Video's paper does not list Wan. ComfyUI ports (e.g. in Kijai's WanVideoWrapper or KJNodes) were not verified in this session.
- Neither the rzgar slow-mo fix nor PainterI2V explains *why* lightx2v slows motion. No independent measurement (e.g. RAFT flow before and after) was found.
- Motion LoRAs specific to *cartoon* acting (squash and stretch, anticipation) for Wan 2.2 were not found.
- Grok Imagine's motion behaviour, frame rate and API terms were not researched (time budget).
- The LTX-2.3 licence (Apache vs community) and whether LTX-2.5 exists need checking on the official HF card.

---

## 2. Post-processing: frame interpolation, upscaling and restoration, deflicker, colour consistency, sound

### Takeaway
For interpolation, **Practical-RIFE 4.25 / 4.26 (MIT)** is the fast default. Its README says 4.25 significantly improved anime scenes and that 4.24+ suits diffusion-generated video. **GIMM-VFI** (NeurIPS 2024) is the slower option for large or complex motion where RIFE ghosts. For upscaling:
- **SeedVR2** (Apache-2.0, native in ComfyUI) gives the best fidelity but is slow (~5 min per 10 s clip on a 5090).
- **FlashVSR** (CVPR 2026, reportedly Apache-2.0) is ~7× faster.

For animation, ComfyUI's own guide recommends *conservative* upscalers so the style is kept. Flicker in AI video is aperiodic, so classic deflicker filters only partly help. **All-In-One-Deflicker** (CVPR 2023, Apache-2.0, ~3 GB GPU) handles colour and brightness flicker but not content inconsistency. On CPU, FFmpeg's `deflicker`, `minterpolate`, `tmix` and `framerate` filters are the only zero-GPU options.

### Cited Findings

**Frame interpolation**
- **Practical-RIFE** (hzwer):
  - MIT licence: model links are "under the same MIT license as this project".
  - 4.25 (2024-09-19) is the default recommendation for most scenes, and "anime scenes have been significantly improved". 4.26 (2024-09-21) is the newest standard model; 4.25.lite is dated 2024-10-20.
  - The README says 4.24+ suits post-processing some diffusion-generated videos.
  - Multiplier flags: `--multi=2/4`, `--exp`, `--fps`. Use `--scale=0.5` or `--UHD` for 4K. CPU support is not stated.
  - Source: [GitHub hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE)
- SVP forum users report no 4.27 nine months after 4.26, and disagree on whether 4.26 beats 4.25 ("v26 was supposed to be better than v25 but it isn't"). — [SVP forum](https://www.svp-team.com/forum/viewtopic.php?pid=87162)
- ComfyUI Wiki lists the RIFE 4.25/4.26 family in lite, standard and heavy variants. — [comfyui-wiki frame interpolation](https://comfyui-wiki.com/en/models/frame-interpolation/frame-interpolation)
- **GIMM-VFI** (NeurIPS 2024, arXiv 2407.08680) models motion as a continuous function of time, so it allows arbitrary interpolation factors. Checkpoints were released 2024-11-06. On a V100 it uses ~7.9 GB for 2K frames at 8× and ~10.9 GB for 4K at 8×. It needs CuPy/CUDA. The licence file exists but was not read. — [GitHub GSeanCDAT/GIMM-VFI](https://github.com/GSeanCDAT/GIMM-VFI)
- A community node guide says GIMM-VFI "holds together on motion that makes RIFE ghost and smear". User-reported timing on a matched clip: RIFE ~9 s, GIMM 25–53 s. The ComfyUI-GIMM-VFI wrapper is tested only with cupy-cuda12==13.3.0. These are anecdotal numbers. — [comfy.icu GIMM-VFI node](https://comfy.icu/node/GIMMVFI_interpolate); [comfyonline GIMM-VFI](https://api.comfyonline.app/comfyui-nodes/ComfyUI-GIMM-VFI)
- ComfyUI's guide lists Topaz Apollo (API partner node) for frame interpolation or custom fps such as 60 fps. — [ComfyUI video upscale guide](https://docs.comfy.org/tutorials/utility/video-upscale.md)

**Upscaling and restoration**
- ComfyUI official video-upscale guide (undated), timings for 10 s 720p clips:
  - SeedVR2 ~312 s to 1080p on a 5090-class GPU.
  - FlashVSR ~41 s to 1080p and ~52 s to 4K.
  - HitPaw ~80 s to 2K and ~175 s to 4K.
  - Topaz Starlight Creative (Astra) ~374 s to 1080p.
  - Recommendations: for **animation and motion graphics, use conservative options (Topaz Starlight Fast or "Fast GAN") to keep the intended style**. For AI-video repair, Topaz Astra Creative is best, then Wan 2.2 Upscale (Creative). "Fix artifacts before upscaling." For CGI and 3D renders, Topaz, SeedVR2 and HitPaw handle crisp edges well.
  - Source: [docs.comfy.org video-upscale](https://docs.comfy.org/tutorials/utility/video-upscale.md)
- **SeedVR2** (ByteDance) is one-step diffusion video restoration trained with Diffusion Adversarial Post-Training. Its weights are listed as apache-2.0 on HF, and it has native ComfyUI support (PR #14424). The numz ComfyUI wrapper is reportedly MIT (third-party listing). — [docs.comfy.org SeedVR2](https://docs.comfy.org/tutorials/utility/seedvr2.md); [HF numz/SeedVR2_comfyUI](https://huggingface.co/numz/SeedVR2_comfyUI/blob/b77d5dd95dba3f25e3a28064b76e6028a5152368/README.md); [sourcepulse](https://www.sourcepulse.org/projects/18364760)
- **FlashVSR** (arXiv 2510.12747, Oct 2025; CVPR 2026 poster) is a one-step, streaming, diffusion-based VSR. It reaches ~17 FPS for 768×1408 on one A100 using three-stage distillation, locality-constrained sparse attention and a tiny conditional decoder, and was trained on VSR-120K. The repo has a Wan-based "WanVSR" example path. An HF card commit lists apache-2.0 (not confirmed in the GitHub LICENSE). A v1.1 mirror exists. — [arXiv 2510.12747](https://arxiv.org/pdf/2510.12747); [GitHub OpenImagingLab/FlashVSR](https://github.com/OpenImagingLab/FlashVSR); [HF JunhaoZhuang/FlashVSR commit](https://huggingface.co/JunhaoZhuang/FlashVSR/commit/3a3609d15d48660aa8001f6d25d420b6ecd34685); [CVPR 2026](https://cvpr.thecvf.com/virtual/2026/poster/38690)
- A community skill file sums it up: "per-frame ESRGAN = quick & local; SeedVR2 = flicker-free & best". — [unpkg comfyui-mcp video-upscale skill](https://unpkg.com/comfyui-mcp@0.49.0/plugin/skills/video-upscale/SKILL.md)

**Deflicker and colour consistency**
- **All-In-One-Deflicker** ("Blind Video Deflickering by Neural Filtering with a Flawed Atlas", CVPR 2023):
  - Apache-2.0. Inference needs ~3 GB GPU memory.
  - It was evaluated on T2V outputs (Make-A-Video, Magic Video).
  - It does *not* fix content-level inconsistency ("the contents obtained by video generation algorithms can be very different").
  - Videos over 200 frames are not evaluated, so the authors recommend splitting. Hyperparameters need per-video tuning.
  - Sources: [GitHub ChenyangLEI/All-In-One-Deflicker](https://github.com/ChenyangLEI/All-In-One-Deflicker); [arXiv 2303.08120](https://alphaxiv.org/abs/2303.08120)
- A vendor blog explains that diffusion models re-sample texture from noise each frame, so AI flicker "has no rhythm" and classic deflicker filters built for periodic light flicker only partly help. It also says to regenerate bad shots and not stack effects. This is a vendor viewpoint. — [magichour.ai](https://magichour.ai/blog/how-to-fix-flicker-in-ai-video)
- A ComfyUI `DeflickerFrames` node offers brightness-step correction and temporal smoothing, with window and strength settings. — [comfyai.run DeflickerFrames](https://comfyai.run/documentation/DeflickerFrames)
- FFmpeg includes `deflicker`, `framerate` (frame blending), `minterpolate` (motion-compensated interpolation) and `tmix` filters, all CPU-based. The options were not extracted in this session; run `ffmpeg -h filter=<name>`. — [FFmpeg filters documentation (ToC)](https://ffmpeg.org/ffmpeg-filters.html)

**Sound**
- VABench evaluated end-to-end audio-video models (Veo3-Fast, Wan2.5 Preview, Sora2) and audio add-ons (ThinkSound, MMAudio). It found **Wan2.5 Preview best at audio-visual sync and lip-sync** among those tested, and "Human Sounds" the hardest category for all models. — [VABench arXiv 2512.09299](https://arxiv.org/html/2512.09299v1)
- LTX-2 makes synchronised audio and video in one pass. — [invideo blog](https://invideo.io/blog/ltx-ai-video-generator/)

### Inferences
- Suggested post chain for stylised 3D cartoons (inference):
  1. Reject or regenerate artifacted clips first.
  2. Interpolate ×2 with RIFE 4.25, or with GIMM-VFI for fast actions such as dancing or slapstick falls.
  3. Upscale conservatively: SeedVR2 at low strength or FlashVSR for speed, to 1080×1920.
  4. Add light colour matching (shot-to-shot LUT or histogram match).
  5. Finish with music and SFX.
  Creative upscalers can "re-render" faces and change the characters' design. Avoid them for recurring characters, or re-check identity afterwards.
- Interpolators handle flat-shaded cartoon surfaces well, but they ghost on fast limb motion and thin outlines. Gate interpolated output again with the same QA (smoothness plus a warping-artifact check).
- On the CPU-only dev container, only FFmpeg filters and possibly RIFE (PyTorch can run on CPU, but this is unverified and slow) are realistic. SeedVR2, FlashVSR, GIMM-VFI (CuPy) and All-In-One-Deflicker need a GPU.

### Gaps
- No published side-by-side metrics for RIFE 4.25 vs GIMM-VFI vs FILM vs EMA-VFI on AI-generated or cartoon footage were found. FILM's and EMA-VFI's licences were not checked in this session.
- GIMM-VFI's licence text was not read. FlashVSR's GitHub LICENSE was not confirmed.
- No CPU timing for RIFE or SeedVR2 was found.
- No source specific to deflickering *stylised 3D* AI video.
- Sound design tools (MMAudio and ThinkSound licences, SFX libraries) were not researched in depth.

---

## 3. Measurement: VBench / VBench-2.0, optical-flow metrics, identity consistency (cartoons), VLM-as-judge, lip-sync metrics; which run on CPU

### Takeaway
A workable automatic gate combines:
- **VBench's custom-input dimensions** (motion_smoothness via AMT interpolation error; dynamic_degree via RAFT top-5% flow; subject/background consistency; aesthetic and imaging quality; Apache-2.0).
- A **two-sided RAFT flow-magnitude band** calibrated on reference clips.
- **Per-character DINOv2/CLIP crop similarity** against the character sheet. This is used in the literature but not validated on cartoons.
- A **VLM judge**: VideoReward (2B, MIT) for motion quality, or a Qwen3-VL-8B defect model such as DefectVideoReward for listing defects.
- **SyncNet LSE-C/LSE-D** (syncnet_python, MIT, falls back to CPU) for dialogue shots, with the known caveat that it correlates weakly with human judgement and depends on the face detector.

VBench-2.0's semantic dimensions (Human Anatomy, Motion Rationality…) are heavier: they need LLaVA-Video-7B and Qwen2.5-7B on a GPU.

### Cited Findings

**VBench / VBench-2.0**
- VBench (Apache-2.0) has 16 dimensions: subject_consistency, background_consistency, temporal_flickering, motion_smoothness, dynamic_degree, aesthetic_quality, imaging_quality, object_class, multiple_objects, human_action, color, spatial_relationship, scene, temporal_style, appearance_style, overall_consistency.
  - **`custom_input` mode** (your own videos, any prompt) works for subject_consistency, background_consistency, motion_smoothness, dynamic_degree, aesthetic_quality and imaging_quality.
  - News items: VBench-2.0 (03/2025); human anomaly detection pipeline for AIGC (04/2025); VBench-2.0 custom-video evaluation (05/2025); VBench++ in TPAMI (11/2025); **VBench-I2V Arena (03/2026)**.
  - Acknowledged components: AMT, RAFT, CLIP, UMT, RAM, GRiT, IQA-PyTorch, ViCLIP, LAION aesthetic.
  - Source: [GitHub Vchitect/VBench](https://github.com/Vchitect/VBench)
- VBench definitions as summarised by other papers:
  - **Motion smoothness**: AMT predicts even frames from odd neighbours, and the pixel error against the real frames is scored on 0–100.
  - **Dynamic degree**: RAFT flow between adjacent frames, average of the top-5% flow magnitudes, thresholded to dynamic/static with resolution-adaptive thresholds.
  - Critique: AMT "reasons about coarser flows", while RAFT measures finer flows more faithfully.
  - Sources: [Video Interface Networks arXiv 2503.17539](https://arxiv.org/pdf/2503.17539); [ALG arXiv 2506.08456](https://arxiv.org/pdf/2506.08456)
- **VBench-2.0** has 18 dimensions in 5 categories:
  - Creativity: Diversity, Composition.
  - Commonsense: Motion Rationality, Instance Preservation.
  - Controllability: Dynamic Spatial Relationship, Dynamic Attribute, Motion Order Understanding, Human Interaction, Complex Landscape, Complex Plot, Camera Motion.
  - **Human Fidelity: Human Anatomy, Human Identity, Human Clothes.**
  - Physics: Mechanics, Thermotics, Material, Multi-View Consistency.
  - It needs LLaVA-Video-7B-Qwen2 and Qwen2.5-7B-Instruct. Credited components: CoTracker, Insightface, CLIP, RAFT, YOLO-World. CUDA 11.8 / PyTorch 2.5.1. One dimension per GPU (up to 8).
  - Custom videos are supported for Human Anatomy, Human Identity, Human Clothes, Diversity and Multi-View Consistency.
  - Source: [GitHub VBench-2.0](https://github.com/Vchitect/VBench/tree/master/VBench-2.0)
- VBench++ has a skin-tone bias protocol: Fitzpatrick classification of faces, merged into 3 groups, measuring how far the output distribution is from uniform. — [VBench++ arXiv 2411.13503](https://arxiv.org/pdf/2411.13503)

**Optical flow**
- torchvision ships `raft_large` and `raft_small` (RAFT, arXiv 2003.12039) with optional pretrained weights. — [torchvision RAFT docs](https://docs.pytorch.org/vision/main/models/raft.html)

**Identity consistency (cartoon characters)**
- **CLIP-I / DINO-I** (AnyCrowd, multi-character animation): cosine similarity between each character's reference crop and its tracked region per frame, using CLIP and DINOv2, averaged over frames and characters. — [AnyCrowd arXiv 2603.15415](https://arxiv.org/pdf/2603.15415)
- Memento's subject consistency = mean of consecutive-frame similarity (smoothness) and frame-to-first-frame similarity (long-range identity). — [Memento arXiv 2606.14667](https://arxiv.org/pdf/2606.14667). Phantom uses CLIP/DINO similarity against a reference image plus separate face-recognition scores. — [Phantom arXiv 2502.11079](https://arxiv.org/pdf/2502.11079). CustomX reports DINOv2/CLIP character-consistency scores. — [CustomX arXiv 2512.17796](https://arxiv.org/pdf/2512.17796)
- None of these were validated on cartoon or stylised characters. DINOv2 may track structure and pose more than style (search synthesis, not a primary finding). — (gap noted)

**VLM-as-judge**
- **DefectVideoReward** (HF) is fine-tuned from Qwen3-VL-8B-Instruct: SFT on defect annotations, then GRPO for 800 steps on pairwise preferences. It lists visible defects (artifacts, motion issues) and gives a 1–10 score in JSON. — [HF CaoruiLi/DefectVideoReward](https://huggingface.co/CaoruiLi/DefectVideoReward)
- **Q-Save**: ~10k AI-generated videos with MOS and attribution labels (visual quality, dynamic quality, text alignment). Qwen3-VL-8B is tuned to output a score plus an explanation. The paper listing shows CC BY-NC-SA 4.0. — [arXiv 2511.18825](https://arxiv.org/html/2511.18825v2)
- **AIGVE-MACS** gives 0–5 scores with written justifications on 9 aspects, including technical quality (noise, artifacts) and consistency (flicker, glitches). — [HF xiaoliux/AIGVE-MACS](https://huggingface.co/xiaoliux/AIGVE-MACS)
- **GenVideoLens** compares Qwen3-VL-8B with GPT-5 on 15 diagnostic dimensions (texture authenticity, local forgery artifacts, inter-frame consistency) and documents where LVLMs fall short. — [arXiv 2603.18625](https://arxiv.org/pdf/2603.18625)
- The Wan technical report used Qwen2-VL to detect physics violations and artifacts in generated video (for data curation). — [Wan arXiv 2503.20314](https://arxiv.org/pdf/2503.20314)
- A new human-centric AIGC video quality dataset and model came out in July 2026. — [arXiv 2607.16742](https://arxiv.org/pdf/2607.16742)
- VideoReward (Qwen2-VL-2B) scores VQ/MQ/TA and is meant for reject sampling. Reward-hacking caveat applies (section 1). — [GitHub VideoAlign](https://github.com/KlingAIResearch/VideoAlign)

**Lip-sync metrics**
- **syncnet_python** (joonson): MIT licence. It "automatically detects and uses a CUDA GPU if available, and falls back to CPU otherwise", with a separate `environment-cpu.yml`. Outputs are AV offset, min distance and confidence (demo: offset 3, min dist 5.353, confidence 10.021). Three stages: run_pipeline → run_syncnet → run_visualise. — [GitHub joonson/syncnet_python](https://github.com/joonson/syncnet_python)
- LSE-D is the mean lip–audio embedding distance (lower is better). LSE-C is the confidence: the gap between the minimum and median distance over offsets of ±10 frames (higher is better). Several papers report weak correlation with human judgement and sensitivity to mouth cropping, image quality and encoding. The Wav2Lip eval scripts and the public SyncNet code can mismatch. — [Wav2Lip arXiv 2008.10010](https://arxiv.org/pdf/2008.10010); [THEval arXiv 2511.04520](https://arxiv.org/pdf/2511.04520); [Comparative study arXiv 2403.06421](https://arxiv.org/pdf/2403.06421); [Wav2Lip eval README](https://huggingface.co/spaces/WebashalarForML/Ai_lip_sync/blob/521addf294d174aa1b166ad711c7906941ac535c/evaluation/README.md)

### Inferences
- The "coverage 0.53" metric in the previous gate looks like a share of frames or area with motion. It maps naturally to a **RAFT-based** pair of metrics: (a) the fraction of frame pairs whose top-5% flow is above a threshold, and (b) the median flow magnitude normalised by frame diagonal. Calibrate *both* bounds on 20–30 hand-picked "good" Pixar-like reference clips at the same fps and resolution.
- Suggested CPU-feasible gate per clip (inference; timings not verified):
  1. Decode at 256–384 px short side.
  2. RAFT-small flow on adjacent pairs, giving motion magnitude, coverage and flow jerk (second difference of mean flow, to catch stutter).
  3. A simple interpolation-error smoothness proxy (VBench-style AMT, or RIFE on CPU).
  4. Mean frame-to-frame luminance change for flicker.
  5. DINOv2-S/14 or CLIP ViT-B/16 cosine similarity of each character crop vs its character-sheet image (crop with an open-vocabulary detector or a fixed bounding box).
  6. SyncNet confidence on dialogue shots.
  A VLM judge (DefectVideoReward 8B or VideoReward 2B) realistically needs a GPU or a cloud endpoint. On 4 cores and 15 GB RAM, an 8B VLM would be very slow even quantised.
- SyncNet and VBench-2.0 Human Identity use real-face detectors (S3FD and InsightFace-like). Stylised Pixar-like faces may or may not be detected. Test this before relying on LSE scores for cartoon characters. If detection fails, fall back to a mouth-region crop from known character positions, or to a VLM check.
- Because reward models can be gamed, use VLM or reward scores for **ranking and rejection**, and keep a human spot-check (e.g. 1 in 10 clips).

### Gaps
- No published validation of DINOv2/CLIP identity metrics, SyncNet or InsightFace on stylised 3D cartoon characters.
- CPU runtimes for RAFT-small, VBench custom dimensions, VideoReward-2B and SyncNet were not found. They would have to be benchmarked in the container.
- VBench-2.0 Motion Rationality cannot take custom videos (only 5 dimensions can, per the README).
- The licences of DefectVideoReward and AIGVE-MACS checkpoints were not checked.
- No "rhythm" or comedic-timing metric (beat alignment of motion with dialogue or music) was found in the literature.

---

## 4. Stylised cartoon and African characters: model behaviour, bias, mitigations, African AI creators

### Takeaway
No benchmark was found that systematically measures how Veo 3, Kling, Wan or Hunyuan render Pixar-style 3D characters, dark skin tones, wax prints or boubous. The evidence is indirect:
- A manual observation in VABench that **Veo 3 "predominantly generates characters with Caucasian features"**.
- WIRED's audit of racial stereotypes in Sora.
- Image-model studies showing lightened skin and straightened hair for Black subjects (e.g. Midjourney "Blondes Braid Study").
- Vendor comparisons crediting Kling 3.0 and Wan 2.6 with stronger character consistency and Veo 3.1 with physics and texture realism.

The practical mitigation is **image-to-video from a fixed, canonical character-sheet image** (plus multi-reference features or a character LoRA). That avoids asking the model to invent a West-African face, skin and outfit from text. African AI creators exist (e.g. Senegal's Thiaroye 44 projects, Ghanaian TikTok cartoon series, Nigerian folktale animators), but their tooling is poorly documented. No "Afrikatoon" account was found.

### Cited Findings

**Documented bias**
- VABench §10.3 "Demographic Bias and Data Distribution": "**Veo3 predominantly generates characters with Caucasian features**", while Seedance tends toward Asian appearances. The authors hypothesise Western-centric training data. This was a manual observation, not measured. — [VABench arXiv 2512.09299](https://arxiv.org/html/2512.09299v1)
- A WIRED investigation of hundreds of Sora videos reported racial, gender and disability stereotypes (logged in the AI Incident Database, March 2025). — [AIID report 5007](https://incidentdatabase.ai/reports/5007). An academic Sora paper covers gender bias only. — [arXiv 2501.01987](https://arxiv.org/pdf/2501.01987)
- Minne Atairu's "Blondes Braid Study": asked for Black twins with blond braids, Midjourney mostly produced light-brown complexions with straightened hair. — [People of Color in Tech](https://peopleofcolorintech.com/?p=26238); [Goodreads author blog](https://www.goodreads.com/author_blog_posts/25410977-how-can-synthetic-images-render-blackness?tab=author)
- A travel brand's campaign (Black & Abroad) found that image generators often placed Black travellers in poverty settings and sometimes lightened their skin. — [strategyonline](https://strategyonline.ca/?p=285466)
- A 2025 hairstyle study (Janice Gassam Asare) found braided styles on a Black woman rated least intelligent and often not recognised as the same person by AI tools (image analysis, not generation). Spelman's "In the Context of Curls" project collects data on how AI renders braids, afros, twists and cornrows. — [Black Enterprise](https://www.blackenterprise.com/study-ai-black-women-hairstyles-less-intelligent); [Black Enterprise – Spelman](https://www.blackenterprise.com/spelman-innovator-train-ai-the-context-curls); [CBS News](https://www.cbsnews.com/atlanta/news/spelman-scholar-using-data-to-improve-how-ai-represents-black-womens-hairstyles/)
- A computer-graphics paper ("The Racial Character of Computer Graphics Research") criticises rendering defaults for high-melanin skin, including a "glowing" aesthetic bias. It is a research agenda, not a measured failure study. — [Moonlight review](https://www.themoonlight.io/de/review/the-racial-character-of-computer-graphics-research)

**Stylised and cartoon behaviour (mostly vendor or marketing sources, treat as directional)**
- Kling 3.0 has the stronger character-consistency feature; Veo 3.1 has the edge on physics and texture realism. — [CometAPI](https://www.cometapi.com/kling-3-0-vs-veo-3-1/)
- One test put Wan 2.6 ahead of Veo 3.1 on character consistency and composition, and Veo ahead on prompt following, with an anime prompt included. — [AtlasCloud blog](https://www.atlascloud.ai/blog/Wan-2-6-vs-Veo-3-1-Is-Wan-2-6-the-Veo-Killer-we-didnt-see-coming) (the page now returns HTTP 410)
- Kling "sits between realism and stylisation, more cinematic than animated"; Veo leans toward realism. — [Magic Hour](https://magichour.ai/blog/veo3-kling-pro-pixverse4-5-which-ai-video-model-to-choose)
- Seedance and Kling 3.0 rank highest for multi-reference consistency, but Kling drifts when two characters interact in close-up. — [Neural4D](https://blog.neural4d.com/comparisons/best-ai-video-generator-for-consistent-characters/)
- In VABench's "Virtual Worlds" (non-realistic) category, Veo3 and Sora2 are strong on Visual QA. — [VABench](https://arxiv.org/html/2512.09299v1)

**African creators and studios using AI**
- CNN (Thomas Page, syndicated by AOL):
  - Triggerfish CEO Stuart Forrest sees AI as a help for the "tiny" African animation industry.
  - Ebele Okoye: AI lets creators "tell our stories without having to wait for somebody to give us $20 million".
  - Creators say models "aren't quite ready" for full films, and that the cost of tools priced in US dollars is a barrier.
  - Sources: [AOL/CNN](https://www.aol.com/news/going-see-flood-stories-why-083224263.html) (the URL returned 404 at fetch time; content seen via search snippets)
- **Senegal**: rapper Dip Doundou Guiss's AI clip "Thiaroye 44 (Jambaar Remix)" took 3rd place at the World AI Film Festival (Nice) in April 2025. It was the only African entry among 1,500+ from 80 countries, and was described as entirely computer-generated. — [Senego](https://senego.com/world-ai-film-festival-dip-doundou-guiss-remporte-la-3e-place-avec-son-clip-thiaroye-44-jambaar-remix_1825737.html); [SenePlus](https://www.seneplus.com/culture/dip-doundou-guiss-sacre-au-world-ai-film-festival-avec-un-clip). A separate 2024 animated AI short "Thiaroye 44" (3:49) is by Senegalese filmmaker Hussein Dembel Sow, who "fine-tun[es] image models". — [Short Shorts Film Festival](https://shortshorts.org/2025autumn/en/program/thiaroye-44/)
- **Ghana**: a job listing for an AI cartoon mini-series about journalist Anas Aremeyaw Anas calls for 100+ episodes of 30–120 s, built entirely with AI tools, translated into African languages, and aimed at TikTok and Reels. — [Jobberman Ghana](https://www.jobberman.com.gh/listings/ai-animators-20mxnp)
- **Nigeria**: Fiverr sellers offer "3D AI Pixar-style African folktale" animation for TikTok, Instagram and Facebook. — [Fiverr listing](https://www.fiverr.com/s/42mpLBk); [Fiverr](https://fiverr.com/tobbi_tech/create-captivating-african-folktale-ai-animation-video). Nsibidi Fables uses AI to streamline clean-up and colouring. — [ADTC Substack](https://adtc.substack.com/p/nsibidi-fables-animation-storytelling)
- AI Film Festival Africa (Antananarivo, Madagascar) accepts animation; its 2026 theme is "Africa in 2063". — [FilmFreeway](https://filmfreeway.com/AIFilmFestivalAfrica)
- Non-AI benchmarks for the look: *Iwájú* (Kugali / Walt Disney Animation Studios, Disney+, 2024) and Kukua's *Super Sema*. — [Tech Labari](https://techlabari.substack.com/p/iwaju-and-the-state-of-african-animation-3d2); [vitrina.ai](https://vitrina.ai/blog/the-rise-of-african-animation-growth-challenges-opportunities)

### Inferences
- Given the documented Western/Caucasian default (Veo 3) and the lightening and hair-straightening bias in image models, **text-to-video alone is risky** for consistent West-African characters. A canonical character-sheet image fed into I2V or multi-reference conditioning fixes skin tone, hair (braids, locs, headwraps/gele), and wax-print or boubou patterns at frame 0. The model then mostly has to *move* them.
  - Expect drift in fine repeating patterns (wax prints) under motion. These are high-frequency, and interpolators and upscalers may smear them. Prefer bold, larger-scale print motifs in the character design.
  - Use the CLIP/DINO crop gate from section 3 to catch drift.
- Dark skin under stylised 3D lighting can collapse into flat or muddy shading, or get artificially lightened by "beauty" priors. Add explicit lighting cues to prompts (warm key, rim light, "rich deep brown skin with subsurface sheen") and an automated **skin-tone drift check**: mean Lab L*/a*/b* of the face region vs the character sheet. That check is an inference, not a published method; it is a simplification of VBench++'s Fitzpatrick protocol.
- A per-character LoRA trained on 20–40 renders of each troupe member (on Wan 2.2) is the strongest open-weight mitigation for identity. It needs a GPU for training (inference; no Wan-character-LoRA training cost source collected here).
- The "unreal cars" complaint suggests props and vehicles should come from the video model's prior (it has seen real Dakar or Abidjan street scenes far more than procedural rigs have), styled through the reference image. Region-specific objects (car rapide, Ndiaga Ndiaye buses, taxi-brousse) may not be well represented. Test them early, and keep a reference image of each recurring vehicle.

### Gaps
- No systematic benchmark of Veo 3/3.1, Kling 2.x/3.0, Wan 2.x, HunyuanVideo 1.5, LTX-2 or Grok Imagine on Pixar-style 3D cartoons, dark skin tones, African hairstyles, wax prints or boubous. Primary evidence is anecdotal or vendor-made.
- "Afrikatoon" could not be identified: no account or brand was found under that name. The tooling (which models, LoRAs, prompts) of African AI animation creators is undocumented in public sources. The Rundown Studio piece on African AI talent (18 July 2025) is paywalled.
- No data on how Kling or Veo handle Wolof/French/Nigerian-Pidgin lip-sync or accents (relevant for dialogue sketches).
- No source on dataset composition (share of African subjects or stylised 3D content) in Wan, Hunyuan or LTX training data.
