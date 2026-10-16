# Moteurs vidéo à poids ouverts (téléchargeables) pour la troupe — état au 16/10/2026

Méthode : toutes les sources ont été lues le **16/10/2026** (API Hugging Face, fiches de modèles brutes, README GitHub,
API publique OpenRouter, pages `llms.txt` de fal.ai, classements Artificial Analysis). Les notes du 14/10/2026
(`modeles_video_ouverts_pilotes.md`, `reverification_catalogue_openrouter.md`) servent de fond ; ce qui est repris d'elles
est signalé « (notes 14/10) ». « Dérivé » = calcul ou extrapolation de ma part, pas une mesure. « Déclarée » = champ
`license:` de la fiche, texte de licence non relu. Contrainte ajoutée en cours de route : **budget zéro** (Kaggle 2×T4 /
P100, Colab T4 gratuit, HF ZeroGPU) et **monétisation TikTok** → traitées en Q3 et Q1.

---

## Q1 — Quels modèles ouverts existent (versions récentes), quand, sous quelle licence, quelle taille, quels modes ?

### Takeaway
Depuis mi-2025, le paysage ouvert a basculé : **MiniMax H3 (poids publiés le 28/07/2026)** est le premier modèle ouvert
au niveau des meilleurs fermés (audio + vidéo natifs, dialogue français, 9:16, jusqu'à 15 s, référence multi-images),
suivi de **LTX-2.5 (23/07/2026)** et de modèles audio-vidéo plus petits (daVinci-MagiHuman, Kandinsky 6.0, Ovi). Mais
H3 et LTX ont des licences maison ; la famille **Wan 2.1/2.2 reste la seule base Apache-2.0 complète** (et Wan 2.5 → 3.0
sont restés fermés, API seulement). Pour une monétisation TikTok sans risque juridique, les candidats sont les
licences Apache/MIT (Wan, Ovi, daVinci-MagiHuman, Kandinsky 6, LongCat, SCAIL-2, Bernini) ; LTX est gratuit sous
10 M$ de CA ; H3 interdit l'usage et l'affichage des sorties dans l'UE, au Royaume-Uni, aux États-Unis et en Corée.

### Cited Findings

**Tableau comparatif (dates = création du dépôt HF officiel ; licences lues le 16/10/2026)**

| Modèle | Date | Licence / usage commercial (TikTok) | Taille | Modes | Audio natif / FR |
|---|---|---|---|---|---|
| Wan2.1 T2V-1.3B / 14B, I2V-14B 480p/720p | 25/02/2025 | Apache-2.0 → **oui** | 1,3B / 14B | T2V, I2V | non |
| Wan2.1-FLF2V-14B / VACE-1.3B / VACE-14B | 17/04/2025 ; 13/05/2025 | Apache-2.0 → **oui** | 14B / 1,3B | première+dernière image ; R2V, V2V, masques | non |
| Wan2.2 T2V/I2V-A14B, TI2V-5B | 18–24/07/2025 | Apache-2.0 → **oui** | MoE 27B (14B actifs) ; 5B | T2V, I2V | non |
| Wan2.2-S2V-14B | 25/08/2025 | Apache-2.0 → **oui** | 14B | audio→vidéo (+pose) | piloté par audio externe |
| Wan2.2-Animate-14B | 11/09/2025 | Apache-2.0 → **oui** | 14B | vidéo de conduite + image perso (animation / remplacement) | non |
| Wan2.2-Animate-2-14B (+ Distilled) | 14/07/2026 (Diffusers 06/08/2026) | Apache-2.0 → **oui** | 14B | vidéo de conduite brute → perso | non |
| Wan 2.5 / 2.6 / 2.7 / 3.0 | 2025–08/2026 | **pas de poids** (API seulement) | — | — | oui (API) |
| MiniMax H3 (FL2VA + Ref2VA) | 28/07/2026 | Licence maison : commercial OK si < 20 M$ CA, mention « Powered by MiniMax H3 », **interdit dans/vers UE, R-U, Corée, USA** | 33B dense (≈13B AdaLN pré-calculables) + encodeur Qwen3-VL-32B | T2VA, première/dernière image, réf. ≤ 9 images + ≤ 3 vidéos + ≤ 3 audios | **oui, FR « stable »** |
| LTX-2 (19B) / LTX-2.3 (22B) / LTX-2.5 (22B) | 03/01/2026 ; 04/03/2026 ; 23/07/2026 | LTX-2.x Community : **gratuit < 10 M$ CA**, payant au-delà | 19–22B + Gemma | T2V, I2V, A2V, V2V, IC-LoRA, keyframes, retake, doublage | oui (fr dans les tags) |
| HunyuanVideo / -I2V / -Avatar / -1.5 | 12/2024 ; 03/2025 ; 26/05/2025 ; 11/2025 | Tencent Hunyuan Community : **ne s'applique pas dans l'UE, R-U, Corée du Sud** ; > 100 M MAU = licence | 13B ; 1.5 = 8,3B | T2V, I2V, audio→avatar multi-perso | Avatar : audio externe |
| Ovi / Ovi 1.1 (Character.AI) | 30/09/2025 ; 1.1 le 10/11/2025 | Apache-2.0 → **oui** | 11B (vidéo Wan2.2-5B + audio 5B) | T2AV, I2AV | oui (tag langue : en) |
| daVinci-MagiHuman (GAIR/SII + Sand.ai) | 21/03/2026 | Apache-2.0 → **oui** | 15B | T2AV, I2AV (humain) | **oui, fr listé** |
| MAGI-1 / MAGI-2-preview (Sand.ai) | 18/04/2025 ; 03/08/2026 | Apache-2.0 → oui | 24B/4,5B ; 114B MoE (6B actifs) | T2V, I2V (MAGI-2 : + audio) | MAGI-2 : oui |
| SkyReels V2 / V3 (R2V-14B, V2V-14B, A2V-19B) | 04/2025 ; 19/01/2026 | « Skywork license » (non relue) | 14B / 19B | R2V 1–4 réf., extension 5–30 s, avatar parlant | A2V : audio externe |
| LongCat-Video / LongCat-Video-Avatar 1.5 (Meituan) | 24/10/2025 ; 21/05/2026 | MIT → **oui** | 13,6B | T2V, I2V, continuation ; audio→vidéo mono/multi-perso | audio externe |
| Kandinsky 6.0 Lite / Pro (Sber) | 09/09/2026 | MIT (déclarée) → **oui** | 3B / 29B | T2AV, TI2AV, super-résolution | oui (langues non précisées) |
| Bernini-R / Bernini-v2 (ByteDance) | 01/06/2026 ; 13/08/2026 | Apache-2.0 → **oui** | rendu Wan2.2-A14B + planificateur Qwen2.5-VL-7B | t2v, v2v, r2v, rv2v (édition) | non |
| SCAIL-2 (Zhipu) | 09/06/2026 | MIT → **oui** | base Wan (VAE + T5 Wan) | animation de perso par vidéo de conduite, remplacement, multi-perso | non |
| Mochi 1 preview | 22/10/2024 | Apache-2.0 → oui | 10B | T2V | non |
| CogVideoX-2B / 5B / 1.5-5B | 08–11/2024 | 2B Apache ; 5B/1.5 = licence CogVideoX (enregistrement, ≤ 1 M visites/mois) | 2B / 5B | T2V, I2V | non |
| Step-Video-T2V | 02/2025 | MIT → oui | 30B | T2V | non |
| Open-Sora 2.0 | 04/03/2025 | Apache-2.0 → oui | 11B | T2V, I2V | non |

Sources du tableau :
- Dates et licences Wan : listing de l'organisation — [API HF Wan-AI](https://huggingface.co/api/models?author=Wan-AI&sort=createdAt&direction=-1) ; aucune entrée Wan 2.5/2.6/2.7/3.0 dans l'organisation officielle au 16/10/2026 (le dépôt le plus récent est `Wan2.2-Animate-2-14B-*`, 06/08/2026). Wan 2.6 (28/03/2026), 2.7 (15/04/2026), 3.0 et 3.0-prime (24 et 27/08/2026) existent sur OpenRouter avec `hugging_face_id: null` — [API OpenRouter /videos/models](https://openrouter.ai/api/v1/videos/models). Les dépôts HF communautaires « wan-3-0-video » ne sont pas des poids officiels — [recherche HF « Wan3 »](https://huggingface.co/api/models?search=Wan3).
- Wan2.2 A14B = « MoE 27B total / 14B active » — [GitHub theelderemo/wan2.2-google-colab](https://github.com/theelderemo/wan2.2-google-colab). Licences et fonctions Wan détaillées (VACE, Fun, Animate, Animate-2) — (notes 14/10) [HF Wan-AI/Wan2.2-Animate-2-14B](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B).
- MiniMax H3 : 33B dense, ≈ 13B dans les branches AdaLN « precomputed and cached », encodeur Qwen3-VL-32B, deux checkpoints FL2VA / Ref2VA, tags `text-to-audio-video`, `reference-to-audio-video` — [HF MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3). Création du dépôt 28/07/2026 — [API HF MiniMaxAI](https://huggingface.co/api/models?author=MiniMaxAI).
- Licence H3 (texte lu) : territoire = monde « excluding … the European Union, the United Kingdom, the Republic of Korea and the United States of America » ; autorisation écrite requise si les produits commerciaux dépassent « 20 million US dollars … in yearly revenue » ; afficher « Powered by MiniMax H3 » / « MiniMax H3 » sur un produit commercial ; « You may not use, reproduce, modify, distribute, or display the MiniMax H3 Works or any of their Outputs or results outside the Applicable Territory » ; interdiction d'utiliser les sorties pour améliorer un autre modèle ; « MiniMax claims no rights over the Outputs you generate » — [HF MiniMax-H3 LICENSE](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).
- LTX-2 : 19B (`ltx-2-19b-dev`, fp8, nvfp4, distillé 8 étapes CFG=1), tags `audio-to-video`, `text-to-audio-video`…, langues en/de/es/**fr**/ja/ko/zh/it/pt — [HF Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2) ; LTX-2.3 22B (dev, distilled, distilled-1.1) — [HF Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3) ; LTX-2.5 (créé 23/07/2026, accès conditionné, licence `ltx-2.x-community-license-agreement`) — [API HF Lightricks/LTX-2.5](https://huggingface.co/api/models/Lightricks/LTX-2.5). Seuil 10 M$ de CA de la licence LTX-2.x — (notes 14/10) [GitHub Lightricks/LTX-2 LICENSE-2_x](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x). Divergence : la fiche dit « Language(s): English » alors que les tags listent fr — [HF LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3).
- HunyuanVideo-1.5 : 8,3B, licence `tencent-hunyuan-community` — [HF tencent/HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5) ; exclusions UE/R-U/Corée du Sud et seuil 100 M MAU — (notes 14/10) [LICENSE 1.5](https://huggingface.co/tencent/HunyuanVideo-1.5/blob/main/LICENSE). HunyuanVideo-Avatar : « dynamic, emotion-controllable, and multi-character dialogue videos », avatars « multi-style » — [HF tencent/HunyuanVideo-Avatar](https://huggingface.co/tencent/HunyuanVideo-Avatar). Aucun nouveau modèle vidéo Tencent ouvert repéré en 2026 hors `HY-OmniWeaving` (31/03/2026, licence « other », non lu) — [API HF tencent « HY »](https://huggingface.co/api/models?author=tencent&search=HY).
- Ovi : Apache-2.0, base `Wan-AI/Wan2.2-TI2V-5B`, branche audio 5B entraînée de zéro, Ovi 1.1 du 10/11/2025 — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- daVinci-MagiHuman : Apache-2.0, 15B, 40 couches, langues zh/en/ja/ko/de/**fr**/yue, pile complète publiée (base, distillé, super-résolution) — [HF GAIR/daVinci-MagiHuman](https://huggingface.co/GAIR/daVinci-MagiHuman).
- MAGI-2-preview : 114B, 6B actifs par jeton, audio + vidéo, T2V et I2V, Apache-2.0 — [HF sand-ai/MAGI-2-preview](https://huggingface.co/sand-ai/MAGI-2-preview) ; MAGI-1 24B et 4,5B (+ distill, distill+quant), Apache-2.0 — [HF sand-ai/MAGI-1](https://huggingface.co/sand-ai/MAGI-1).
- SkyReels V3 : R2V 14B-720P, V2V 14B-720P, A2V « Talking Avatar » 19B-720P ; licence `skywork-license` — [HF Skywork/SkyReels-V3-A2V-19B](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B).
- LongCat-Video-Avatar 1.5 : MIT, audio-driven mono et multi-personnages — [HF meituan-longcat/LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5) ; LongCat-Video MIT (24/10/2025) — [API HF meituan-longcat](https://huggingface.co/api/models?author=meituan-longcat).
- Kandinsky 6.0 : « Kandinsky 6.0 Video Lite (3B parameters) and Kandinsky 6.0 Video Pro (29B parameters) », T2AV et image→audio-vidéo, licence `mit` — [HF kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers](https://huggingface.co/kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers) ; arXiv 2610.05608 dans les tags — [API HF Kandinsky-6.0-Pro](https://huggingface.co/api/models/kandinskylab/Kandinsky-6.0-Pro-5s-Diffusers).
- Bernini (ByteDance) : Apache-2.0 ; « Renderer base Wan2.2-T2V-A14B », « Planner base Qwen2.5-VL-7B-Instruct », tâches `t2i, i2i, t2v, v2v, rv2v, r2v` ; Bernini-R ouvert le 01/06/2026, Bernini complet le 11/06/2026 — [HF ByteDance/Bernini-Diffusers-v2](https://huggingface.co/ByteDance/Bernini-Diffusers-v2), [HF ByteDance/Bernini-R](https://huggingface.co/ByteDance/Bernini-R).
- SCAIL-2 : MIT, « end-to-end controlled character animation », remplacement de personnage, multi-personnages, « Animal-driving », Wan VAE et T5 intégrés — [HF zai-org/SCAIL-2](https://huggingface.co/zai-org/SCAIL-2).
- Mochi 1 (Apache-2.0) — [HF genmo/mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview) ; Step-Video-T2V « 30 billion parameters », MIT — [HF stepfun-ai/stepvideo-t2v](https://huggingface.co/stepfun-ai/stepvideo-t2v) ; Open-Sora 2.0 « 11B », Apache-2.0 — [HF hpcai-tech/Open-Sora-v2](https://huggingface.co/hpcai-tech/Open-Sora-v2) ; CogVideoX1.5-5B licence « other » — [HF zai-org/CogVideoX1.5-5B](https://huggingface.co/zai-org/CogVideoX1.5-5B) ; détails licence CogVideoX — (notes 14/10).
- Autres éditeurs : aucun modèle vidéo ouvert récent chez StepFun (rien de vidéo depuis Step-Video) — [API HF stepfun-ai](https://huggingface.co/api/models?author=stepfun-ai) ; aucun dépôt vidéo Kuaishou/Kling (`KwaiVGI` vide) — [API HF KwaiVGI](https://huggingface.co/api/models?author=KwaiVGI) ; rien de vidéo dans les 40 derniers dépôts `facebook` — [API HF facebook](https://huggingface.co/api/models?author=facebook).
- Outils : WanGP (Wan2GP) autorise explicitement « You may use WanGP to create outputs and you may sell or license those outputs », mais interdit de revendre l'outil en API/SaaS sans licence — [GitHub deepbeepmeep/Wan2GP LICENSE.txt](https://github.com/deepbeepmeep/Wan2GP/blob/main/LICENSE.txt). ComfyUI = GPL-3.0 — (notes 14/10). CausVid (accélération) = non commercial — (notes 14/10).

### Inferences
- **Monétisation TikTok sans risque** : rester sur Apache/MIT (Wan 2.1/2.2 + LoRA LightX2V, Ovi, daVinci-MagiHuman, Kandinsky 6, LongCat-Avatar 1.5, SCAIL-2, Bernini). LTX-2.x est utilisable gratuitement par un petit créateur (< 10 M$ de CA) mais n'est pas « libre ».
- **H3 = risque réel pour un public francophone** : la clause « display … Outputs outside the Applicable Territory » vise l'affichage ; un TikTok vu en France (UE) ou aux USA pourrait être considéré comme un affichage hors territoire. Le Sénégal / la Côte d'Ivoire sont dans le territoire, pas la France. À faire valider juridiquement avant toute monétisation ; à défaut, n'utiliser H3 que pour du prototypage interne. Même réserve, moindre, pour Hunyuan (licence « ne s'applique pas » dans l'UE).
- Les modèles 2026 les plus intéressants sous Apache/MIT pour une troupe récurrente sont des modèles « dérivés de Wan » (Bernini, SCAIL-2, Wan-Animate-2, SVI) : investir dans l'écosystème Wan reste le pari le plus sûr juridiquement.

### Gaps
- Licence Skywork (SkyReels) et licence Kandinsky 6 lues seulement comme métadonnées ; licence HY-OmniWeaving non lue.
- MAGI-2 Preview : l'onglet T2V d'Artificial Analysis ne montre pas de badge « open weights » alors que l'onglet I2V et Hugging Face le montrent (poids ≈ 307 Go publiés) — incohérence de la source.
- Aucune analyse juridique de la clause d'affichage H3 appliquée à une plateforme mondiale comme TikTok.

---

## Q2 — Sorties : résolution, i/s, durée max, 9:16, dialogue français, longueur 25–60 s

### Takeaway
Seuls H3, LTX-2.x, daVinci-MagiHuman, Ovi, Kandinsky 6 et MAGI-2 génèrent **image + voix ensemble** ; parmi eux, **H3
(FR « stable », 15 s, 9:16, 24 i/s, 768p)** et **daVinci-MagiHuman (fr listé, 5 s)** annoncent le français. Aucun modèle
ouvert ne sort 25–60 s d'un seul tenant : il faut enchaîner des plans de 5–15 s (extension / continuation / fenêtres
glissantes) ou piloter par une piste audio longue (S2V, LongCat-Avatar, SkyReels-A2V jusqu'à 200 s d'audio).

### Cited Findings
- **MiniMax H3** : durée 4–15 s ; ratios « 21:9, 16:9, 4:3, 1:1, 3:4, and 9:16 » ; côté court 768 px par défaut (2K via module H3-Regenerate-2K **non ouvert**) ; 24 i/s ; audio stéréo 32 kHz ; « Stable support for 11 languages: Arabic, Chinese, English, **French** … » ; module H3-Context-IR (réécriture de prompt) **non ouvert** mais « critical to the quality » — [HF MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3). WanGP enchaîne des fenêtres glissantes en gardant une bande-son téléversée (« keeping the original audio synchronized across sliding windows ») et accepte 3 voix de référence — [GitHub Wan2GP README](https://github.com/deepbeepmeep/Wan2GP).
- **LTX-2.5** : DFR par défaut « 1024×1536 at 24 fps », 4K possible (`3840 --height 2176`), upscaler temporel ×2 ; « Duration Head » qui prédit la durée depuis le prompt ; pipelines A2Vid (audio→vidéo), Keyframe, Retake (régénérer une plage temporelle), DubIt (« rephrasing while matching speaker identity and lip movements ») — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2).
- **daVinci-MagiHuman** : vitesses données pour des vidéos de 5 s en 256p/540p/1080p ; WER 14,60 % vs 19,23 % (LTX 2.3) et 40,45 % (Ovi 1.1) ; multilingue dont français — [HF GAIR/daVinci-MagiHuman](https://huggingface.co/GAIR/daVinci-MagiHuman).
- **Ovi 1.1** : 10 s (ou 5 s), 24 i/s, 960×960, « various aspect ratios (9:16, 16:9, 1:1, etc) » ; parole via balises `<S>…<E>` ; « Reference voice condition » encore non livré — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- **Kandinsky 6.0** : « Both models generate 5-second video clips » à 24 i/s ; super-résolution ×2/×2,25/×4 séparée — [HF Kandinsky-6.0-Lite](https://huggingface.co/kandinskylab/Kandinsky-6.0-Lite-5s-Diffusers). Exemple 480×864 (vertical) — (notes 14/10).
- **MAGI-2-preview** : « Clips are 10 seconds long, which is the only duration the model currently supports », raffineur vers 1080p — [HF MAGI-2-preview](https://huggingface.co/sand-ai/MAGI-2-preview).
- **Wan** : TI2V-5B 720p = 1280×704 **ou 704×1280**, 24 i/s ; Wan 2.1/A14B/Animate à 16 i/s, segments de 81 images (≈ 5 s) ; Animate enchaîne par segments de 77 images — (notes 14/10). fal facture Wan 2.2 A14B en « video seconds … calculated at 16 frames per second » — [fal Wan 2.2 A14B I2V](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/llms.txt).
- **Wan2.2-S2V** : « the generated video length will automatically adjust based on the input audio length », pose + audio possibles — [HF Wan-AI/Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B).
- **SkyReels V3** : R2V « 5-second video at 720p and 24 fps » ; extension « 5 to 30 seconds » ; avatar parlant à partir d'un portrait et d'un audio « (up to 200s) » — [HF SkyReels-V3](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B).
- **LongCat-Video-Avatar 1.5** : 480p et 720p ; audio-texte→vidéo et audio-image→vidéo avec continuation (`--num_segments`) ; mode deux voix (« Dual-Audio Modes ») ; multi-personnages — [HF LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5).
- **SCAIL-2** : 512p et 704p ; « H and W must both be divisible by 32 (e.g. 704×1280) » — [HF zai-org/SCAIL-2](https://huggingface.co/zai-org/SCAIL-2).
- **HunyuanVideo-1.5** : 480p ou 720p, paramètre `--aspect_ratio`, 121 images par défaut, super-résolution 1080p distillée — [HF tencent/HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5).
- Anciens : Open-Sora 2.0 accepte `9:16` — [HF Open-Sora-v2](https://huggingface.co/hpcai-tech/Open-Sora-v2) ; CogVideoX1.5-5B 1360×768 — [HF CogVideoX1.5-5B](https://huggingface.co/zai-org/CogVideoX1.5-5B) ; Step-Video jusqu'à 204 images à 544×992 — [HF stepvideo-t2v](https://huggingface.co/stepfun-ai/stepvideo-t2v).
- Côté fermé (pour repère) : Wan 3.0 accepte 2 à 30 s, Grok Imagine 1.5 Lite 1 à 15 s, Veo 3.1 4/6/8 s — [API OpenRouter](https://openrouter.ai/api/v1/videos/models).

### Inferences
- Pour un sketch de 25–60 s en français, deux architectures ouvertes sont réalistes : (a) **audio d'abord** — voix FR par TTS (hors périmètre de ces notes), puis vidéo pilotée par l'audio, plan par plan (LongCat-Avatar 1.5 MIT, Wan2.2-S2V Apache, LTX-2.5 A2Vid, H3 Ref2VA avec audio de référence) ; (b) **audio-vidéo natif** par plans de 5–15 s (H3, daVinci) puis montage. L'option (a) garde la même voix d'un plan à l'autre ; l'option (b) risque une voix différente à chaque plan (Ovi n'a pas encore de voix de référence).
- 9:16 est natif chez H3, Ovi, TI2V-5B (704×1280), SCAIL-2 (704×1280), Open-Sora ; pour les autres, la résolution est libre (multiples de 16/32) et le vertical est généralement possible mais non garanti en qualité.

### Gaps
- Pas de durée maximale documentée pour daVinci-MagiHuman et LTX-2.5 en une passe.
- Qualité du français mesurée nulle part pour H3 / daVinci / LTX (aucun WER en français publié).

---

## Q3 — Matériel : VRAM, temps par clip de 5 s, et faisabilité **gratuite** (T4 / P100 / 2×T4 / ZeroGPU / CPU)

### Takeaway
Sur GPU haut de gamme, H3 distillé fait ≈ 1 min par clip 5 s 768p (RTX 5090) et daVinci-MagiHuman 8 s en 540p (H100).
**Sur le gratuit**, le T4 (Turing, 15–16 Go, pas de bf16 natif, pas de FP8/NVFP4, pas de FlashAttention-2) limite à des
builds fp16/INT8/GGUF + délestage mémoire : des carnets Kaggle 2×T4 existent (septembre 2026) pour **H3 Turbo INT8**,
**LTX-2.5 distillé** et **LTX-2.3 Q4**, et WanGP annonce H3 480p en 5–6 Go de VRAM ; mais **aucun temps mesuré sur T4 n'a
été publié** — ordre de grandeur dérivé : 5–15 min par clip de 5 s en 480p. Pour du gratuit **et** commercialement
libre, la voie la plus sûre reste Wan2.2-TI2V-5B / Wan2.1-1.3B (Apache) en 480p distillé sur T4. ZeroGPU gratuit = 5 min
de GPU Blackwell par jour. CPU seul : non réaliste.

### Cited Findings

**Haut de gamme (référence)**
- MiniMax H3 : exemple SGLang sur 4 GPU (`--num-gpus 4 --ulysses-degree 4`) — [HF MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3). HyperFlow 8 étapes : « about 60 s vs about 175 s per clip on 4x H200 » ; recette mono-GPU officielle avec délestage CPU automatique — [HF videorebirth/hyperflow](https://huggingface.co/videorebirth/hyperflow).
- RTX 5090 (32 Go), FastH3 V2 NVFP4 8 étapes, 5 s (124 images) : 1344×768 en **58,6 s** vs 167,3 s pour H3 original 20 étapes ; 832×480 en **18,7 s** ; un portrait 480×832 testé (article du 08/10/2026) — [ai-muninn, FastH3 RTX 5090](https://ai-muninn.com/en/blog/fasth3-rtx-5090-comfyui).
- H3 NVFP4 élagué : fichier 12,5 Go, ≈ 11,9 Go de VRAM pour le DiT, 1,90 s/it (RTX PRO 6000, 864×480, 39 images) ; une 5090 32 Go devient viable si l'encodeur de texte est délesté — [HF lilcheaty/MiniMax-H3-NVFP4](https://huggingface.co/lilcheaty/MiniMax-H3-NVFP4). NVFP4 = Blackwell uniquement — (notes 14/10).
- H3 GGUF : complet Q4_K_M 19,9 Go, Q8_0 36 Go ; **élagué** Q3_K_M 8,9 Go, Q4 11,6 Go, Q8 21,6 Go ; encodeur Qwen3-VL-32B int4 15 Go / Q4_K_M 14,6 Go ; VAE vidéo fp16 5,21 Go — [HF Abiray/MiniMax-H3-GGUF](https://huggingface.co/Abiray/MiniMax-H3-GGUF).
- WanGP v17.17 (07/10/2026) : « 15 seconds of H3 video at 1080p used to require 25 GB of VRAM, now you just need 11 GB … only 5-6GB of VRAM to gen 15 seconds of H3 video at 480p » ; prise en charge « GTX 10XX, RTX 20XX, and newer » ; modèles pris en charge : Wan 2.1/2.2, MiniMax H3, LTX-2/2.3/2.5, Hunyuan 1/1.5, LongCat, Kandinsky, MagiHuman — [GitHub Wan2GP README](https://github.com/deepbeepmeep/Wan2GP).
- daVinci-MagiHuman, 1 H100, 5 s : 256p **2,0 s**, 540p **8,0 s**, 1080p **38,4 s** (distillation DMD-2 8 étapes sans CFG) ; installation avec FlashAttention « (Hopper) » et PyTorch 2.9 — [HF GAIR/daVinci-MagiHuman](https://huggingface.co/GAIR/daVinci-MagiHuman).
- Ovi : minimum **32 Go** ; 24 Go avec fp8 ou qint8 + délestage CPU (« slight quality degradation ») ; 720×720, 121 images, 50 étapes : ≈ 83–140 s sur une carte à 80 Go selon options, 40 s sur 8 GPU — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- LTX-2.5 : téléchargement ≈ 66 GiB ; « In cases of GPU memory constraints, consider `--quantization fp8-cast --offload {cpu, disk}` » ; distillé = 8 étapes étage 1 + 4 étapes étage 2 — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2). GGUF communautaires : `unsloth/LTX-2.5-GGUF` (13/10/2026), plusieurs `LTX-2.3-GGUF` — [recherche HF image-to-video tendances](https://huggingface.co/api/models?pipeline_tag=image-to-video&sort=likes7d&direction=-1).
- HunyuanVideo-1.5 : « Minimum GPU Memory: 14 GB (with model offloading enabled) » ; 480p I2V distillé 8–12 étapes, « ~75% speedup on RTX 4090 » ; Wan2GP « as low 6 GB of VRAM for Hunyuan Video 1.5 » — [HF tencent/HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5) ; « within 75 seconds » sur 4090 — (notes 14/10).
- Wan (officiel RTX 4090) : Wan2.1-1.3B 480p **261 s / 8,19 Go** ; TI2V-5B 720p **525–535 s / 22,8–22,9 Go** ; A14B 720p sur H100 ≈ 1041–1056 s / 59,7 Go ; communauté RTX 3060 12 Go, Wan2.2-14B fp8 + LoRA 4 étapes : **5 min 37 s par scène** — (notes 14/10).
- Wan2.2-S2V : « This command can run on a GPU with at least 80GB VRAM » — [HF Wan2.2-S2V-14B](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B).
- LongCat-Video-Avatar 1.5 : option `--use_int8` (« reduced VRAM usage »), exemples sur 2 GPU en parallélisme de contexte — [HF LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5).
- MAGI-2-preview : « NVIDIA Hopper GPUs, 8 of them », ≈ 307 Go de poids — [HF MAGI-2-preview](https://huggingface.co/sand-ai/MAGI-2-preview) ; MAGI-1-24B : « H100/H800 × 8 » — [HF MAGI-1](https://huggingface.co/sand-ai/MAGI-1) ; Step-Video : 77,64 Go de pic, 743 s pour 204 images — [HF stepvideo-t2v](https://huggingface.co/stepfun-ai/stepvideo-t2v) ; Mochi : 42 Go (22 Go en bf16) — [HF mochi-1-preview](https://huggingface.co/genmo/mochi-1-preview) ; CogVideoX1.5-5B diffusers BF16 « from 10GB », INT8 « from 7GB » — [HF CogVideoX1.5-5B](https://huggingface.co/zai-org/CogVideoX1.5-5B) ; Bernini : GPU Hopper recommandé — [HF Bernini-Diffusers-v2](https://huggingface.co/ByteDance/Bernini-Diffusers-v2).
- Aucun chiffre trouvé pour L40S.

**Turing (même famille que le T4) — seule mesure proche**
- RTX 2080 Ti modifiée 22 Go (Turing, sm_75), H3 en DiT **INT8** (19,53 Gio), encodeur Qwen3-VL-32B W4A4 (13,2 Gio, déchargé avant l'échantillonnage), VAE fp16 ; W4A4 sur le DiT rejeté (« full-frame colour tearing ») ; SageAttention 1.0.6 ; 15 s générées en 960×540 puis agrandies en 1080p, 20 étapes : **1 383 s** ; clip de 3 s : 253,8 s ; 4,4× plus lent qu'une 5090 (article du 06/08/2026) — [ai-muninn, H3 sur 2080 Ti 22 Go](https://ai-muninn.com/en/blog/minimax-h3-on-modded-2080ti-22gb).
- Même machine, FastH3 Trim int8 (18,9 Go) en 480p, 5 s : **149,9 s** (à chaud) ; pas d'accélération VSA sur Turing — [ai-muninn, FastH3](https://ai-muninn.com/en/blog/fasth3-rtx-5090-comfyui).

**Contraintes T4 / P100**
- FlashAttention-2 : « Ampere, Ada, or Hopper GPUs … For Turing GPUs (T4, RTX 2080), see the separate flash-attention-turing repo » ; « bf16 requires Ampere, Ada, or Hopper GPUs » — [GitHub Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention).
- Ovi en fp8 « will not have speed up … as it still uses bf16 matmuls » (donc pas adapté à un GPU sans bf16) — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- P100 (Pascal) : roues PyTorch CUDA 12.8+ sans sm_60, Pascal abandonné à partir de PyTorch 2.15 ; LTX-2 exige CUDA > 12.7 ; P100 en fin de support Google Cloud le 15/09/2026 — (notes 14/10).

**Offres gratuites (lu le 16/10/2026)**
- Kaggle : un P100 16 Go **ou** deux T4 (2×16 Go) ; ≈ 30 h GPU/semaine « commonly reported » (Kaggle ne publie pas de chiffre) ; sessions 9 ou 12 h selon les sources — [gpuperhour.com, guide du 21/09/2026](https://gpuperhour.com/blog/free-cloud-gpus-and-credits). Statut du P100 sur Kaggle en octobre 2026 : contradictoire (un carnet LTX-2.3 « Previously configured for P100, now updated for Kaggle GPU T4 x2 », mais les instructions générales du même dépôt disent encore « GPU P100 x1 ») — [GitHub TeamAIQ/Colab-notebooks](https://github.com/TeamAIQ/Colab-notebooks).
- Carnets Kaggle **2×T4** « ✅ Fixed & working as of September 2026 » : « MiniMax H3 Turbo - INT8 Video & Audio Generator » (« 20B … 4-step PDMD/DMAD distillation & INT8 tensor-parallel DiT. Optimized for Kaggle GPU T4 x2 ») ; « LTX-2.5 22B Distilled - Dual GPU Video Generator » ; « LTX-2.3 22B Distilled 1.1 Q4 Text & Image-to-Video » (avec audio) ; « LTX-2.3 22B Audio-to-Video Q4 » (lip-sync) ; « LTX-2.3 22B MSR Ref Distilled 1.1 » (multi-référence) ; « LTX-2.3 22B Distilled … Wan2GP engine & INT8 kernels » — [GitHub TeamAIQ/Colab-notebooks](https://github.com/TeamAIQ/Colab-notebooks) (aucun temps de génération publié ; les pages Kaggle n'ont pas pu être lues).
- Colab gratuit : « free Colab GPU runtimes usually provide only 15 GB of T4 VRAM, which is too small for most Wan2GP checkpoints; stick to the `Wan 2.2 TextImage2Video 5B FastWan` model and select 480p », testé sur T4 gratuit — [GitHub Square-Zero-Labs/Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab). Autre carnet : T4/L4 conseillé pour TI2V-5B (≈ 10 Go de poids), A100 pour les 14B (≈ 28 Go) — [GitHub theelderemo/wan2.2-google-colab](https://github.com/theelderemo/wan2.2-google-colab).
- HF ZeroGPU : moitié de RTX Pro 6000 Blackwell (48 Go) par défaut ; quota quotidien **2 min** (non connecté), **5 min** (compte gratuit), 40 min (PRO) ; un compte gratuit (> 30 jours, e-mail vérifié) peut héberger 2 Spaces ZeroGPU — [HF docs ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu). Un fil d'avril 2026 évoque aussi une limite de 3 lancements/jour, non confirmée par la doc — [forum HF](https://discuss.huggingface.co/t/what-is-the-free-zerogpu-quota-for-1-space/178610). Démos publiques : Space daVinci-MagiHuman — [HF Space SII-GAIR/daVinci-MagiHuman](https://huggingface.co/spaces/SII-GAIR/daVinci-MagiHuman) ; Space Ovi — [HF Space akhaliq/Ovi](https://huggingface.co/spaces/akhaliq/Ovi).
- Mesures sur T4 : recherches « Wan2.1 1.3B Kaggle T4 », « Wan 2.2 TI2V-5B Colab T4 », « H3 Kaggle T4 », « Wan 2.2 T4 x2 lightx2v » → **aucun temps publié trouvé**. Un message de réseau social (≈ 25 min pour 10 s en 480p, LTX-2.5 NVFP4 via Wan2GP sur Kaggle T4) a été cité par un résumé de recherche **sans URL vérifiable** → non retenu comme fait.
- CPU seul : aucun temps publié ; stable-diffusion.cpp (MIT) charge Wan/VACE en GGUF mais ne donne aucun temps CPU — (notes 14/10).

### Inferences
**Faisabilité par modèle sur le gratuit (dérivé ; à mesurer avant de planifier)** — hypothèse : un T4 (70 W, ≈ 320 Go/s) est 2 à 3× plus lent qu'une 2080 Ti (connaissance générale, non vérifiée ici), donc ≈ 9–13× plus lent qu'une 5090.

| Modèle | 1 T4 16 Go (Colab/Kaggle) | 2×T4 Kaggle | P100 16 Go | Temps estimé / clip 5 s (dérivé) | Libre pour TikTok monétisé ? |
|---|---|---|---|---|---|
| Wan2.1-1.3B / VACE-1.3B 480p | **oui** (8,2 Go mesuré sur 4090, fp16) | oui (inutile) | probable mais pile PyTorch ancienne | 50 étapes ≈ 15–25 min ; 4 étapes distillées ≈ 2–4 min | **oui (Apache)** |
| Wan2.2-TI2V-5B (FastWan) 480p, 704×1280 possible | **oui à 480p** (testé Colab T4) | oui | incertain | ≈ 5–15 min (distillé) ; 720p 50 étapes > 40 min | **oui (Apache)** |
| Wan2.2-A14B / Animate / VACE-14B (GGUF Q4 + LoRA 4 étapes) | limite (12 Go GGUF + délestage RAM) | mieux (un modèle par GPU haut/bas bruit) | non conseillé | ≈ 10–20 min (la 3060 12 Go fait 5,6 min ; un T4 est plus lent) | **oui (Apache)** ; éviter CausVid (NC) |
| MiniMax H3 (élagué 20B INT8/GGUF + Turbo 4–8 étapes) | possible via WanGP (5–6 Go VRAM annoncés à 480p) avec beaucoup de RAM | **oui, carnet dédié INT8 tensor-parallel** | non | ≈ 5–10 min à 480p (2080 Ti = 2,5 min) | **non sans avis juridique** (UE/USA exclus) |
| LTX-2.3 / 2.5 distillé (Q4 / INT8) | difficile (22B + Gemma 12B) | **oui, carnets dédiés** | ancien carnet P100 (2.3) | inconnu ; ≈ 10–25 min pour 5–10 s (non vérifié) | oui si < 10 M$ CA (licence maison) |
| HunyuanVideo-1.5 480p distillé | oui via WanGP (6 Go annoncés) | oui | incertain | ≈ 5–10 min | **non sûr** (licence exclut l'UE) |
| Kandinsky 6.0 Lite 3B | plausible (3B, WanGP « low VRAM ») | oui | incertain | inconnu (petit modèle → probablement quelques minutes) | **oui (MIT)** |
| daVinci-MagiHuman 15B | incertain (code Hopper/FA3 ; WanGP le prend en charge) | incertain | non | inconnu | **oui (Apache)** |
| LongCat-Video-Avatar 1.5 (INT8) | incertain | plausible (exemples 2 GPU) | non | inconnu | **oui (MIT)** |
| Ovi 11B | non (24 Go min., bf16) | non documenté | non | — | oui (Apache) |
| MAGI-2, Step-Video, Mochi plein, S2V-14B officiel | non | non | non | — | — |

- **ZeroGPU gratuit** : 5 min/jour de Blackwell 48 Go ≈ une dizaine de clips 480p de 5 s avec H3 distillé si l'on dispose d'un Space (18,7 s/clip sur 5090) — dérivé ; utile pour tester, insuffisant pour produire en série.
- **Budget Kaggle** : à ≈ 10 min par clip de 5 s, un sketch de 60 s (12 plans) ≈ 2 h de GPU, soit ≈ 15 sketchs par semaine dans un quota de ≈ 30 h — dérivé, hors essais ratés.
- Le T4 impose fp16 (pas de bf16) : les modèles entraînés en bf16 peuvent déborder en fp16 ; les builds INT8/GGUF et SageAttention 1.x sont la voie éprouvée sur Turing (preuve : H3 INT8 sur 2080 Ti). FP8 et NVFP4 (LightX2V NVFP4, FastH3 NVFP4) ne servent à rien sur T4/P100.

### Gaps
- **Aucune mesure publique de temps de génération sur T4 ou P100** pour Wan, H3, LTX, Hunyuan ou Kandinsky ; les carnets Kaggle 2×T4 existent mais leurs pages n'ont pas pu être lues (contenu JavaScript).
- RAM système disponible sur Kaggle / Colab gratuits en 2026 non confirmée (critique pour délester l'encodeur Qwen3-VL-32B de H3 ou Gemma de LTX).
- Disponibilité réelle du P100 sur Kaggle en octobre 2026 non confirmée par une page Kaggle (la page de doc Kaggle n'a rendu aucun texte).
- Aucun chiffre L40S ; aucun temps CPU.

---

## Q4 — Qualité : classements face à Veo 3 / Kling / Grok Imagine, et tenue du style cartoon

### Takeaway
Au 16/10/2026, **MiniMax H3 (768p) est le meilleur modèle ouvert** et se place devant Veo 3.1, Kling 3.0 et Grok Imagine
1.5 sur les deux classements Artificial Analysis (T2V n°4, I2V **n°1 toutes catégories**). LTX-2.5 est au niveau de Veo
3.1 Lite / Grok Imagine 1.5 Lite en T2V. MAGI-2 Preview (non exploitable localement) est juste derrière Grok Imagine. Les
modèles Wan 2.2, Hunyuan, Kandinsky, Ovi et daVinci n'apparaissent plus dans ces classements. Les preuves sur le style
3D cartoon restent anecdotiques.

### Cited Findings
- **Artificial Analysis T2V (AA-Video-T2V v2.1)** : 1. Wan 3.0 (fermé) 1174 ; 3. Seedance 2.5 1160 ; **4. MiniMax H3 (768p) 1159 (ouvert)** ; 10. Grok Imagine Video 1.5 1060 ; 12. MAGI-2 Preview 1044 ; 15–16. Kling 3.0 Omni Pro 1019 / Kling 3.0 Pro 1000 (ancre) ; 17. Grok Imagine 1.5 Lite 999 ; 19–21. Veo 3.1 967, Veo 3.1 Fast 964, Veo 3.1 Lite 950 ; **22–23. LTX-2.5 Fast 950, Pro 948 (ouverts)** ; 26–27. LTX-2.3 Pro 893, Fast 843 — [Artificial Analysis, classement T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video) (lu le 16/10/2026 ; pas d'horodatage explicite).
- **Artificial Analysis I2V (AA-Video-I2V v1.1, avec audio)** : **1. MiniMax H3 (768p) 1141 (ouvert)** ; 4. Wan 3.0 1127 ; 8. Grok Imagine 1.5 1068 ; **10. MAGI-2 Preview 1046 (ouvert)** ; 13. Veo 3.1 1031 ; 15. Veo 3.1 Fast 1017 ; 17–18. Kling 3.0 Omni Pro 1004 / Kling 3.0 Pro 1000 ; **19. LTX-2.5 Fast 985 ; 21. LTX-2.5 Pro 957 ; 22–23. LTX-2.3 903 / 889** ; filtre « Open weights » disponible — [Artificial Analysis, classement I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video).
- Absents de ces deux classements : Wan 2.2, HunyuanVideo, Kandinsky, daVinci-MagiHuman, Ovi, LongCat — [mêmes pages](https://artificialanalysis.ai/video/leaderboard/text-to-video).
- daVinci-MagiHuman (évaluation de l'éditeur, 2 000 comparaisons) : gagne 80,0 % vs Ovi 1.1 et 60,9 % vs LTX 2.3 ; qualité visuelle 4,80 vs 4,76 (LTX 2.3) — [HF GAIR/daVinci-MagiHuman](https://huggingface.co/GAIR/daVinci-MagiHuman).
- Bernini-v2 : VBench 84,46 ; « first tier among leading closed-source commercial models » en édition, selon l'arène interne de l'éditeur — [HF Bernini-Diffusers-v2](https://huggingface.co/ByteDance/Bernini-Diffusers-v2).
- Style cartoon / stylisé :
  - FastH3 : « The mascot illustration kept its style while blinking and talking » ; français non testé — [ai-muninn FastH3](https://ai-muninn.com/en/blog/fasth3-rtx-5090-comfyui).
  - LongCat-Video-Avatar 1.5 : « Robustly generalizes to anime, animals » et « animation, and animal characters » — [HF LongCat-Video-Avatar-1.5](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5).
  - HunyuanVideo-Avatar : avatars « multi-style » — [HF HunyuanVideo-Avatar](https://huggingface.co/tencent/HunyuanVideo-Avatar).
  - SCAIL-2 : « Animal-driving scenarios », remplacement inter-identités — [HF SCAIL-2](https://huggingface.co/zai-org/SCAIL-2).
  - Wan-Animate-2 : exemple officiel = chatte anthropomorphe ; SVI-Tom (Tom & Jerry 8–10 min, MIT) — (notes 14/10).
  - fal propose sur H3 Max (fermé) des styles « hand-drawn », « low-poly », « retro-toon-70s » et un « 3d-to-video » — [API fal « minimax h3 »](https://fal.ai/api/models?keywords=minimax%20h3).
- H3 en mode référence est présenté comme l'option ouverte la plus forte pour la préservation d'identité (comparatif tiers) — [aireiter, MiniMax H3 vs LTX 2.3](https://aireiter.com/blog/minimax-h3-vs-ltx-2-3) (source secondaire).

### Inferences
- En qualité brute, **H3 est le seul modèle ouvert comparable à Veo 3.1 / Kling 3.0 / Grok Imagine** ; LTX-2.5 est un cran en dessous ; les modèles Apache (Wan 2.2 et dérivés, daVinci, Kandinsky) ne sont plus mesurés par AA et sont vraisemblablement nettement en dessous des fermés de 2026.
- Pour des personnages 3D cartoon récurrents, la qualité « classement » compte moins que la **tenue d'identité** (référence multi-images H3 Ref2VA, VACE/Phantom/Bernini r2v chez Wan) et qu'une **LoRA de style/personnage** (Q5).

### Gaps
- Aucun classement public dédié au contenu cartoon/animé 3D ; aucun score VBench récent pour H3, LTX-2.5, daVinci ou Kandinsky 6 trouvé.
- Pas de comparaison publiée H3 vs Wan 2.2 sur personnages stylisés africains.

---

## Q5 — Écosystème : ComfyUI, Diffusers, entraînement de LoRA, LoRA cartoon/Pixar, distillations rapides

### Takeaway
L'écosystème de l'automne 2026 s'est massivement déplacé vers **MiniMax H3** (ComfyUI officiel, Diffusers, SGLang/vLLM,
LoRA Turbo 3–8 étapes, ControlNet-Union, GGUF/INT8/NVFP4, et prise en charge LoRA dans musubi-tuner, ai-toolkit,
diffusion-pipe et DiffSynth-Studio) ; **LTX-2.x** a son propre entraîneur et des IC-LoRA ; **Wan 2.2** garde l'écosystème
Apache le plus mûr (LightX2V 4 étapes, GGUF, LoRA Pixar Apache). Des LoRA de style « 3D animation » / « Pixar toon »
existent pour H3 (accès restreint) et LTX-2.3 (licence non déclarée), et pour Wan 2.1 (Apache).

### Cited Findings
- **H3** : ComfyUI (tutoriel officiel + modèles de workflow R2V/T2V), Diffusers (`ModularPipeline`), SGLang, vLLM — [HF MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3). Accélérations : LightX2V `Minimax-h3-Turbo` 4 et 8 étapes 768p (fiche `apache-2.0`, mais base sous licence H3) — [HF lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo) ; LoRA Turbo « as few as 4 sampling steps instead of the usual ~20 — a ~5× sampling speedup », 6–8 étapes conseillées — [HF larryvrh/MiniMax-H3-Turbo-Lora](https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora) ; conversions ComfyUI HyperFlow 8 étapes, TaoMate 3 étapes, VDN-H3 8 étapes — [HF drbaph/MiniMax-H3-Turbo-Lora-ComfyUI](https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI) ; FastVideo FastH3 4 étapes — [HF FastVideo-FastH3-4-step](https://huggingface.co/FastVideo/FastVideo-FastH3-4-step-Preview-v1-VSA-DataFree) ; ControlNet-Union 2.0 (pose, profondeur, contours, inpainting) intégré à WanGP — [GitHub Wan2GP](https://github.com/deepbeepmeep/Wan2GP).
- **Entraînement LoRA** (mentions dans les README, lus le 16/10/2026) : musubi-tuner → minimax-h3, hunyuanvideo 1.5, kandinsky 5, ovi — [GitHub kohya-ss/musubi-tuner](https://github.com/kohya-ss/musubi-tuner) ; ai-toolkit → minimax-h3, ltx-2/2.3/2.5, wan 2.2, ovi — [GitHub ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) ; diffusion-pipe → minimax h3, wan2.2 — [GitHub tdrussell/diffusion-pipe](https://github.com/tdrussell/diffusion-pipe) ; DiffSynth-Studio → ltx-2/2.3/2.5, minimax-h3, ovi, wan2.2, wan-animate — [GitHub modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio). LTX : `ltx-trainer` (« LoRA, full fine-tuning, and IC-LoRA ») — [GitHub Lightricks/LTX-2](https://github.com/Lightricks/LTX-2). HunyuanVideo-1.5 : script d'entraînement et LoRA publiés le 05/12/2025 — [HF HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5). Les LoRA LTX 2.0 ne se transfèrent pas à LTX 2.3 (rapports d'utilisateurs, source secondaire) — [RunComfy, LTX 2.3 character LoRA](https://www.runcomfy.com/trainer/ai-toolkit/ltx-2-3-character-lora-training).
- **LoRA de style cartoon/Pixar trouvées (API HF, 16/10/2026)** : `SOLRICKS/3D-Animation-Style-MiniMax-H3` (27/09/2026, accès restreint, licence H3) ; `prithivMLmods/MiniMax-H3-Rough-2D-Cartoon-Illustration` (19/09/2026) ; `vrgamedevgirl84/LTX_2.3_Pixar_Toon_Style_LoRa` (23/04/2026, licence non déclarée) ; `Remade-AI/Pixar` (Wan2.1-T2V-14B, **Apache-2.0**, 24/03/2025) ; `Remade-AI/Disney-Princess`, `Remade-AI/Cartoon_Jaw_Drop` (Wan2.1-I2V, Apache-2.0) ; `strangerzonehf/Hunyuan-t2v-Cartoon-LoRA` (Apache-2.0) — [recherche API HF « pixar »/« cartoon »/« 3D-Animation »](https://huggingface.co/api/models?search=pixar). LoRA H3 « Studio 1939 » (animation années 1930) — [comfyui-wiki, 28/08/2026](https://comfyui-wiki.com/en/news/2026-08-28-studio-1939).
- **Wan** : distillations LightX2V 4 étapes Apache, Wan2.2-Lightning « x20 speed-up » avec mouvement plus lent à 4 étapes, GGUF QuantStack, FP8 Kijai ; CausVid non commercial — (notes 14/10) ; [HF lightx2v/Wan2.2-Lightning](https://huggingface.co/lightx2v/Wan2.2-Lightning).
- **Ovi** : ComfyUI via ComfyUI-WanVideoWrapper ; pas encore de modèle distillé ni de scripts d'entraînement officiels — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- **daVinci-MagiHuman** : Diffusers communautaire `FastVideo/MagiHuman-Diffusers` (02/05/2026), nœud ComfyUI `RunningHubAI/ComfyUI-RH-daVinci-MagiHuman` (20/08/2026) — [recherche API HF « MagiHuman »](https://huggingface.co/api/models?search=MagiHuman).
- **Kandinsky 6** : pipeline Diffusers `Kandinsky6TI2VAPipeline`, variantes distillées, VSR 2 étapes — [API HF Kandinsky-6.0-Pro](https://huggingface.co/api/models/kandinskylab/Kandinsky-6.0-Pro-5s-Diffusers) ; WanGP version « low VRAM » — [GitHub Wan2GP](https://github.com/deepbeepmeep/Wan2GP).
- **HunyuanVideo-1.5** : Diffusers officiel, ComfyUI, caches (deepcache/teacache/taylorcache) — [HF HunyuanVideo-1.5](https://huggingface.co/tencent/HunyuanVideo-1.5).
- **LTX-2.5 dans WanGP** : « Layout to Render: turn a rough viewport animation or playblast into a finished shot » avec une image de référence — [GitHub Wan2GP](https://github.com/deepbeepmeep/Wan2GP).

### Inferences
- Pour fixer l'identité d'une troupe récurrente, la combinaison la plus outillée est : **LoRA par personnage (ou LoRA de style « troupe ») + mode référence** — H3 Ref2VA (≤ 9 images) ou Wan VACE/Phantom/Bernini r2v (Apache). L'entraînement de LoRA H3 est désormais pris en charge partout, mais ses sorties et dérivés restent sous licence H3.
- Si la contrainte « libre commercialement » prime, Wan 2.1/2.2 + LoRA Pixar Apache + LoRA personnage entraînée soi-même (musubi-tuner / ai-toolkit / DiffSynth) reste la seule chaîne 100 % Apache.

### Gaps
- Licences des LoRA Pixar LTX-2.3 non déclarées ; LoRA 3D-Animation H3 non lue (accès restreint).
- Aucun retour publié sur l'entraînement d'une LoRA H3 ou LTX-2.5 sur un GPU gratuit (T4) — probablement hors de portée en VRAM ; le service payant fal facture 0,015 $/étape (H3) ou 0,005 $/étape (Wan).

---

## Q6 — Disponibilité hébergée et prix par seconde (fal.ai, OpenRouter, Spaces)

### Takeaway
Les modèles ouverts sont hébergés surtout chez **fal.ai** : H3 ouvert à **0,05 $/s (480p) – 0,06 $/s (768p)**, LTX-2.5
Fast **0,09 $/s (720p)**, daVinci-MagiHuman **0,05 $/s**, Wan 2.2 A14B **0,04–0,08 $/s**, LongCat distillé 0,01 $/s,
Kandinsky 6 Lite 0,17 $ par clip de 5 s. **OpenRouter ne propose aucun modèle vidéo à poids ouverts** (30 modèles, tous
fermés). Pour le budget zéro, seuls les Spaces HF (quota ZeroGPU) et les carnets Kaggle/Colab sont gratuits.

### Cited Findings
- fal.ai (pages `llms.txt` lues le 16/10/2026) :
  - MiniMax H3 (ouvert) T2V/I2V/R2V : « $0.05 per second at 480p, $0.06 per second at 768p, $0.13 per second at 2K and $0.16 per second at 4K » ; R2V : 5 images de référence gratuites puis 0,08 $ l'image ; variantes LoRA 0,0625–0,075 $/s ; entraîneur LoRA H3 « 0.015 * steps » (15 $ pour 1 000 étapes) — [fal minimax/h3/image-to-video](https://fal.ai/models/minimax/h3/image-to-video/llms.txt), [fal minimax/h3/reference-to-video](https://fal.ai/models/minimax/h3/reference-to-video/llms.txt), [fal minimax/h3/ref2va/trainer](https://fal.ai/models/minimax/h3/ref2va/trainer/llms.txt).
  - H3 Max (non ouvert) : 0,05 / 0,08 / 0,16 $/s (480p/768p/1080p) après la promotion terminée le 15/10/2026 — [fal minimax/h3-max/image-to-video](https://fal.ai/models/minimax/h3-max/image-to-video/llms.txt).
  - LTX-2.5 Fast I2V : 0,09 $/s (720p), 0,13 (1080p), 0,19 (1440p), 0,30 (4K), audio inclus ; Pro : 0,12 $/s (720p), 0,17 (1080p) ; audio→vidéo Fast 0,13 $/s (1080p) — [fal ltx-2.5 fast](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/fast/llms.txt), [fal ltx-2.5 pro](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/pro/llms.txt) ; LTX-2.3 0,08 $/s en 1080p — [fal ltx-2.3](https://fal.ai/models/fal-ai/ltx-2.3/image-to-video/llms.txt).
  - daVinci-MagiHuman : 0,05 $/s — [fal davinci-magihuman](https://fal.ai/models/fal-ai/davinci-magihuman/llms.txt).
  - Ovi I2V : 0,20 $ par vidéo — [fal ovi](https://fal.ai/models/fal-ai/ovi/image-to-video/llms.txt).
  - Wan 2.2 A14B I2V : 0,04 $/s (480p), 0,06 (580p), 0,08 (720p), secondes comptées à 16 i/s ; Turbo : 0,05 / 0,075 / 0,10 $ par vidéo ; TI2V-5B I2V : 0,15 $ par vidéo ; Animate (move) 0,04–0,08 $/s ; S2V 0,10–0,20 $/s ; entraîneur LoRA Wan 0,005 $/étape — [fal wan v2.2-a14b](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/llms.txt), [turbo](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/turbo/llms.txt), [5b](https://fal.ai/models/fal-ai/wan/v2.2-5b/image-to-video/llms.txt), [animate](https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/move/llms.txt), [s2v](https://fal.ai/models/fal-ai/wan/v2.2-14b/speech-to-video/llms.txt), [trainer](https://fal.ai/models/fal-ai/wan-22-trainer/i2v-a14b/llms.txt).
  - HunyuanVideo-1.5 I2V : 0,075 $/s — [fal hunyuan-video-v1.5](https://fal.ai/models/fal-ai/hunyuan-video-v1.5/image-to-video/llms.txt).
  - Kandinsky 6 Lite : 0,17 $ par clip 5 s 480p (10 étapes ; 0,085 $ à 4 étapes) ; Pro : 1,40 $ (50 étapes ; 0,25 $ à 8 étapes) — [fal kandinsky6-lite](https://fal.ai/models/fal-ai/kandinsky6-lite/image-to-video/llms.txt), [fal kandinsky6-pro](https://fal.ai/models/fal-ai/kandinsky6-pro/image-to-video/llms.txt).
  - LongCat-Video distillé 720p : 0,01 $ par seconde générée (30 i/s) ; LongCat avatar (v1) 0,15 $/s (480p), 0,30 $/s (720p) ; InfiniteTalk 0,20 $/s — [fal longcat-video distilled](https://fal.ai/models/fal-ai/longcat-video/distilled/image-to-video/720p/llms.txt), [fal longcat-single-avatar](https://fal.ai/models/fal-ai/longcat-single-avatar/image-audio-to-video/llms.txt), [fal infinitalk](https://fal.ai/models/fal-ai/infinitalk/llms.txt).
- Prix API indiqués par Artificial Analysis (par minute en 1080p) : MiniMax H3 4,80 $ (T2V) / 5,40 $ (I2V), LTX-2.5 Fast 7,80 $, Pro 10,20 $ — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video), [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video).
- OpenRouter : 30 modèles vidéo, tous avec `hugging_face_id: null` (Grok Imagine 1.5 / 1.5 Lite, Veo 3.1 / Fast / Lite, Kling 3.0 / o1, Seedance 1.5–2.5, Wan 2.6 / 2.7 / 3.0, HappyHorse, Hailuo, Runway, FLUX 3 Video, HeyGen) ; repères : Grok Imagine 1.5 Lite 0,02 $/s (480p) + 0,01 $ par image ; Wan 3.0 0,05 $/s (480p) ; Veo 3.1 Lite 0,03 $/s sans audio (720p) — [API OpenRouter /videos/models](https://openrouter.ai/api/v1/videos/models) (GET public, aucune génération payante lancée).
- LightX2V propose un Studio et une API pour H3 Turbo — [HF lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo). Ovi existe aussi sur wavespeed.ai — [HF chetwinlow1/Ovi](https://huggingface.co/chetwinlow1/Ovi).
- Replicate et Pollinations : non vérifiés dans cette recherche.

### Inferences
- Coût hébergé d'un sketch de 60 s (dérivé, une seule prise par plan) : H3 480p ≈ 3,00 $ ; daVinci ≈ 3,00 $ ; Wan 2.2 A14B 480p ≈ 2,40 $ ; LTX-2.5 Fast 720p ≈ 5,40 $ ; à comparer à Grok Imagine 1.5 Lite 480p ≈ 1,20 $ (fermé, OpenRouter). Avec la contrainte budget zéro, ces prix servent seulement de repère : la production doit passer par Kaggle/Colab/ZeroGPU.

### Gaps
- Prix Replicate, Pollinations et Spaces HF « payants » non relevés ; prix fal des modèles Bernini, SCAIL-2, SkyReels V3, LongCat-Avatar 1.5 non trouvés.
