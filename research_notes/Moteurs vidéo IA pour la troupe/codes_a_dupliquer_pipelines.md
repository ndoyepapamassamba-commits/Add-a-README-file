# Codes à dupliquer : la couche « réalisateur / pipeline » (histoire → liste de plans → images clés → clips → montage) — état au 16/10/2026

Demande de l'utilisateur : « cherche des codes moteurs à dupliquer ». Cette note couvre l'**étage réalisateur** du
moteur de la troupe : les dépôts qui transforment une idée ou un script en liste de plans, puis pilotent la génération
(images clés, clips), la voix et le montage. Les moteurs vidéo eux-mêmes (Wan, LTX, Helios…) sont traités dans
`codes_a_dupliquer_moteurs.md`, et leur exécution sur T4 / CPU dans `codes_a_dupliquer_execution.md`. Les formats de plan
et la logique multi-plans sont discutés dans `couche_prompt_et_multiplans.md` ; je ne les répète pas.

**Méthode (16/10/2026).** Pour chaque dépôt : clone superficiel **sans extraction**
(`git clone --depth 1 --filter=blob:none --no-checkout`), puis lecture de `LICENSE`, `README`, fichiers de configuration
et de quelques fichiers source clés par `git show`. **Aucun code des dépôts n'a été exécuté, aucun poids téléchargé,
aucun compte créé.** « Dernier commit » = date du commit `HEAD` de la branche par défaut. Étoiles = valeur (souvent
arrondie) affichée par la page GitHub, lue via WebFetch le 16/10/2026 ; « n.v. » = non vérifié. Les licences sont
**telles qu'affichées** et restent à confirmer (`verification_licences.md` ou passe juridique). Les phrases marquées
**(inférence)** sont nos déductions, pas des faits publiés. Les colonnes T4 / CPU décrivent **l'orchestrateur** ; le coût
GPU réel est celui du moteur branché derrière (voir les deux notes `codes_a_dupliquer_*`).

Rappels hérités (non revérifiés ici) : T4 sans bf16, sans FP8 matériel, sans FlashAttention-2 ; Kaggle T4×2 ≈ 30 h/semaine ;
LLM texte gratuits utilisables par code = Gemini Flash (AI Studio), OpenRouter `:free` (50 requêtes/jour au palier de
l'utilisateur), Groq, Cerebras ; TTS française commercialisable = Chatterbox Multilingual (MIT), Piper (MIT) ; edge-tts
est une voie non officielle (`sources_gratuites.md`).

---

## 0. En bref

**Constat principal.** Il n'existe pas de dépôt ouvert qui fasse **tout seul** un sketch comique 9:16 en français à
2–4 personnages récurrents sur matériel gratuit. Mais toutes les briques existent sous licence permissive, et un
**cerveau réalisateur MIT** (ViMax) est conçu pour qu'on branche son propre moteur derrière. La bonne stratégie est donc
d'**assembler** : forker un cerveau, lui écrire deux adaptateurs (moteur vidéo local, TTS + lip-sync français), et
reprendre des outils de montage éprouvés.

**À dupliquer en priorité (licence propre, orchestrateur sans GPU) :**
1. **`HKUDS/ViMax`** (MIT, 12,7k étoiles, commit du 30/09/2026) — le meilleur **cerveau réalisateur** à forker.
   Idea2Video / Script2Video / Novel2Video, agents scénariste, extracteur de personnages, storyboardeur, « arbre de
   caméras », sélection best-of-N des images clés par VLM. Schémas pydantic propres (`ShotBriefDescription` avec balises
   `<Nom>` et `audio_desc` « [Speaker] Nom (émotion): réplique »). Les générateurs image/vidéo sont des **protocoles à
   typage structurel** (`generate_single_image` / `generate_single_video`), instanciés depuis le YAML avec des
   **limiteurs de débit par minute et par jour** (parfait pour les quotas Kaggle / API gratuites). Le LLM passe par une
   `base_url` compatible OpenAI (OpenRouter par défaut). Aucun moteur local n'est fourni : on écrit l'adaptateur
   Wan2GP / ComfyUI nous-mêmes (inférence : ~100–150 lignes, cf. l'adaptateur Veo de 129 lignes).
2. **Montage scriptable** : **`mifi/editly`** (MIT, montage déclaratif JSON5 + ffmpeg, pistes audio rattachées à chaque
   plan), **`Zulko/moviepy`** (MIT, dénominateur commun de presque tous les pipelines), **`WyattBlue/auto-editor`**
   (domaine public, coupe automatique sur le **silence ou l'absence de mouvement** — utile pour couper les fins figées
   des clips IA), **`AcademySoftwareFoundation/OpenTimelineIO`** (Apache-2.0, exporter la timeline vers DaVinci /
   Kdenlive pour retouche manuelle).
3. **`harry0703/MoneyPrinterTurbo`** (MIT, ~132k étoiles, commit du 15/10/2026) — la chaîne TikTok « industrielle » :
   format 9:16 en 1080×1920, sous-titres (horodatage TTS ou faster-whisper), musique, lots, CLI ; TTS branchables dont
   **Chatterbox et Kokoro auto-hébergés** et Gemini TTS. README : **4 cœurs CPU minimum, GPU non nécessaire** = le
   conteneur actuel. On en copie l'étage d'assemblage, pas la recherche de stock vidéo.
4. **`OpenX-Inc/flow`** (MIT, 23 étoiles, jeune) — le plus **petit** pipeline complet autour de **Wan 2.2 auto-hébergé**
   (`pipeline.py` 146 lignes, `writer.py` 115, `keyframes.py` 109, `postproduction.py` 139) avec chaînage par dernière
   image et un **contrat HTTP de backend GPU** (`POST /generate/t2v|i2v|flf2v`, `GET /health`). Son backend vise
   40–80 Go : il faut le remplacer par Wan 2.2 TI2V-5B / Wan2GP pour tenir sur T4 (inférence).
5. **Post-production par agent** : **`FireRedTeam/FireRed-OpenStoryline`** (Apache-2.0, 3,5k étoiles) — nœuds
   découpe de plans (TransNetV2 **sur CPU**), ASR local, « rough cut » de parole, plan de timeline, rendu ; les styles de
   montage s'enregistrent en « Skills » rejouables (= une charte de montage de la troupe).
6. **Si l'on veut une interface** pour que l'utilisateur relise/corrige les plans : **`HBAI-Ltd/Toonflow-app`** (MIT
   depuis sa refonte, 17,9k étoiles, toile infinie, nœud « director3d », équipe storyboard, ComfyUI et LLM locaux) ou
   **`AIDC-AI/Pixelle-Video`** (Apache-2.0, 29,1k étoiles, flux ComfyUI auto-hébergés + Ollama = « solution 100 %
   gratuite » selon le README, mais conçu pour une **voix off** unique, pas pour un dialogue à plusieurs).

**À lire sans copier (pas de licence = tous droits réservés) :** `showlab/MovieAgent` et `HITsz-TMG/Anim-Director`
(contient **AniMaker**). On reprend leurs **idées** (agent de plans, MCTS-Gen = best-of-N sous budget, relecteur qui note
chaque clip dans le contexte des voisins) en les **réécrivant**.

**Pièges de licence découverts (nouveaux par rapport aux notes précédentes) :**
- **`chatfire-AI/huobao-drama` (« 火宝短剧 », 16,3k étoiles) = CC BY-NC-SA 4.0** : « Commercial use is prohibited ».
  **Ne pas dupliquer** pour un TikTok monétisé.
- **AGPL-3.0** : `calesthio/OpenMontage` (68,6k étoiles), `Heroesjouney/AIMovieStudiov2`, `aqm857886159/Nomi`,
  `heshengtao/comfyui_LLM_party`. Usage privé et vidéos produites : OK. Mais **copier leur code dans notre moteur le rend
  AGPL**, et l'exposer comme service à des tiers oblige à publier les sources. À **lire / utiliser tels quels**, pas à
  fusionner dans un moteur qu'on voudrait garder fermé.
- **Remotion** (utilisé par OpenMontage, short-video-maker) : licence maison — gratuit pour un **individu** ou une
  entreprise **≤ 3 employés**, vidéos commerciales autorisées ; licence entreprise au-delà ; interdit de revendre un
  dérivé de Remotion. Alternative MIT : **Revideo**.
- **OpenMontage** fait son lip-sync avec **Wav2Lip**, dont le README réserve les poids à la recherche (non relu ici) :
  remplacer par MuseTalk (MIT) / LatentSync (Apache) — voir `coherence_personnages_lipsync.md`.
- **Toonflow** : les anciennes versions étaient Apache-2.0 **avec avenant commercial** ; la version actuelle est MIT
  « sans aucune clause commerciale ». Ne dupliquer **que la version actuelle**.
- **Pixelle-Video** : TTS par défaut **edge-tts** (non officiel) ; flux vidéo par défaut `video_wan2.1_fusionx` sur
  RunningHub (cloud à compte) ; les fusions « FusionX » mélangent des LoRA de provenance à vérifier.
- **AniMaker** exige en plus un **compte Imgur** (création de compte = exclue).
- **n8n** : « Sustainable Use License » (fair-code), usage interne OK, fichiers `.ee` sous licence entreprise : outil
  d'orchestration utilisable, **pas un code à dupliquer**.

---

## 1. Tableau de synthèse

Légende : T4 = peut-on faire tourner l'orchestrateur et son moteur par défaut sur un T4 16 Go ; CPU = conteneur
4 cœurs / 15 Go sans GPU. « Délégué » = l'orchestrateur n'utilise pas de GPU, le rendu est appelé ailleurs.

| # | Dépôt (URL canonique) | Rôle dans la troupe | Licence affichée | Étoiles | Dernier commit | T4 16 Go | CPU 4 cœurs |
|---|---|---|---|---|---|---|---|
| 1 | [HKUDS/ViMax](https://github.com/HKUDS/ViMax) | **Cerveau réalisateur à forker** | MIT | 12,7k | 30/09/2026 | Délégué (adaptateur à écrire) | Oui (pur Python + API) |
| 2 | [OpenX-Inc/flow](https://github.com/OpenX-Inc/flow) | Mini-pipeline Wan 2.2 + backend GPU HTTP | MIT | 23 | 23/07/2026 | Backend documenté 40–80 Go → à remplacer par TI2V-5B | Orchestrateur oui |
| 3 | [neopen/story-shot-agent](https://github.com/neopen/story-shot-agent) (PenShot) | Découpe script → plans avec mémoire de continuité | MIT | 223 | 14/10/2026 | Sans objet | Oui (+ Redis, embeddings) |
| 4 | [X-PLUG/MM_StoryAgent](https://github.com/X-PLUG/MM_StoryAgent) | Squelette minimal agents par modalité (YAML) | Apache-2.0 | 309 | 23/08/2024 | SDXL fp16 (inférence) | Lent hors LLM API |
| 5 | [HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) | Studio « short drama » à toile, UI | MIT (refonte) | 17,9k | 13/10/2026 | Délégué (ComfyUI) | Oui |
| 6 | [AIDC-AI/Pixelle-Video](https://github.com/AIDC-AI/Pixelle-Video) | Moteur court-métrage auto, ComfyUI | Apache-2.0 | 29,1k | 14/06/2026 | Délégué (ComfyUI sur T4) | Oui (Ollama lent) |
| 7 | [HITsz-TMG/VideoClaw](https://github.com/HITsz-TMG/VideoClaw) (ex-FilmAgent) | Prompts réalisateur/scénariste/chef-op MIT | MIT | 1,9k | 26/08/2026 | Non (API seulement) | Oui |
| 8 | [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) | Studio piloté par agent de code, Wan local | **AGPL-3.0** | 68,6k | 12/10/2026 | Wan 2.2 TI2V-5B fp16 + délestage auto (inférence) | Oui (Piper, Remotion) |
| 9 | [Heroesjouney/AIMovieStudiov2](https://github.com/Heroesjouney/AIMovieStudiov2) | Studio ComfyUI + prévis 3D + export XML | **AGPL-3.0** | 176 | 15/09/2026 | « 8 Go min. » (comfyui-wiki) | UI oui |
| 10 | [showlab/MovieAgent](https://github.com/showlab/MovieAgent) | Référence recherche (agents de plans) | **Aucune** | 368 | 26/03/2025 | Non (HunyuanVideo-I2V) | Non |
| 11 | [HITsz-TMG/Anim-Director](https://github.com/HITsz-TMG/Anim-Director) (AniMaker) | Référence recherche (MCTS-Gen, AniEval) | **Aucune** | 262 | 07/01/2026 | Wan2.1-I2V-14B : seulement via délestage (inférence) | Non |
| 12 | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | Assemblage TikTok 9:16, sous-titres, lots | MIT | ~132k | 15/10/2026 | Non requis | **Oui (4 cœurs min.)** |
| 13 | [FireRedTeam/FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) | Agent de post-production | Apache-2.0 | 3,5k | 31/07/2026 | Non requis | Oui (LLM/VLM API) |
| 14 | [mifi/editly](https://github.com/mifi/editly) | Montage déclaratif JSON5 | MIT | 5,5k | 20/02/2025 | Non requis | Oui |
| 15 | [Zulko/moviepy](https://github.com/Zulko/moviepy) | Montage Python | MIT | 15,0k | 26/08/2026 | Non requis | Oui |
| 16 | [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) | Coupe auto silence/mouvement | Unlicense | 5,5k | 14/10/2026 | Non requis | Oui |
| 17 | [AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Format de timeline échangeable | Apache-2.0 | 2,0k | 13/10/2026 | Non requis | Oui |
| 18 | [midrender/revideo](https://github.com/midrender/revideo) (+ [remotion-dev/remotion](https://github.com/remotion-dev/remotion)) | Titres, sous-titres animés en code | MIT (Remotion : licence maison) | 4,1k (Remotion 64,4k) | 15/07/2026 (Remotion 15/10/2026) | Non requis | Oui (Node) |
| 19 | [ChrisChen667788/wind-comic](https://github.com/ChrisChen667788/wind-comic) | Idées lip-sync QA, boucle d'audit visuel | MIT | 707 | 15/10/2026 | Non (moteurs API) | Oui |
| 20 | [chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama) | **À écarter** | **CC BY-NC-SA 4.0** | 16,3k | 06/10/2026 | — | — |

---

## 2. Fiches détaillées

### A. Cerveaux réalisateurs à forker

#### A.1 ViMax — `https://github.com/HKUDS/ViMax` — **cerveau à forker en premier**

- **Licence** : `LICENSE` lu = « MIT License, Copyright (c) 2025 ». Page GitHub : MIT, 12,7k étoiles, 1,9k forks.
  `HEAD` du 30/09/2026 (« feat: restore concurrent keyframe generation and VLM selection »). Paquet
  `autolongvideogeneration` v1.2.0, Python ≥ 3.12, 188 fichiers suivis. Rapport technique arXiv 2606.07649 (non lu ici).
- **Ce que fait le code** : `pipelines/idea2video_pipeline.py` (278 lignes), `script2video_pipeline.py` (966 lignes),
  `novel2movie_pipeline.py`. Le pipeline Script2Video enchaîne : `extract_characters` → `generate_character_portraits`
  (face, profil, dos) → `design_storyboard` → `decompose_visual_descriptions` (premier/dernier cadre + mouvement) →
  `construct_camera_tree` (regroupe les plans par position de caméra pour réutiliser les cadres) → génération des
  images par caméra, **N candidats + choix par VLM** (`best_image_selector`, `image_selection.num_candidates`, 1 =
  désactivé) → `generate_video_for_single_shot` (attend premier et dernier cadre) → assemblage (`utils/video.py`,
  44 lignes, MoviePy). Agents fournis : `screenwriter`, `script_planner`, `script_enhancer`, `character_extractor`,
  `character_portraits_generator`, `storyboard_artist`, `camera_image_generator`, `reference_image_selector`,
  `best_image_selector`, `event_extractor`, `scene_extractor`, `novel_compressor`, `global_information_planner`.
- **Schémas réutilisables** (`interfaces/`) : `ShotBriefDescription` (`idx`, `is_last`, `cam_idx`, `visual_desc` où
  les personnages sont balisés `<Nom>` et les répliques écrites avec « : " " », `audio_desc` du type
  « [Speaker] Alice (Happy): Hello… » ou « [Sound Effect] … ») ; `CharacterInScene` (`static_features` = visage,
  silhouette ; `dynamic_features` = tenue, accessoires). C'est presque exactement la shot list proposée dans
  `couche_prompt_et_multiplans.md` §5.
- **Branchement des moteurs** : `tools/protocols.py` définit `ImageGenerator.generate_single_image(prompt,
  reference_image_paths)` et `VideoGenerator.generate_single_video(prompt, reference_image_paths)` « by duck typing ».
  `tools/render_backend.py` instancie la classe nommée par `class_path` dans le YAML et crée des limiteurs
  `max_requests_per_minute` / `max_requests_per_day`. Fournis : Veo et Nano Banana (Google), OpenRouter (image, vidéo),
  relais Yunwu (Seedance, Veo, Omni), MiniMax. Chat : `langchain` `init_chat_model` avec `model_provider: openai` et
  `base_url` (OpenRouter par défaut dans `configs/idea2video.yaml`, modèle `google/gemini-2.5-flash-lite-preview…`).
- **T4** : l'orchestrateur n'utilise pas de GPU. **Il faut écrire** `VideoGeneratorWan2GP` (file `--process` JSON de
  Wan2GP, cf. `codes_a_dupliquer_execution.md` §3.1) ou `VideoGeneratorComfyUI` (API locale), et un
  `ImageGeneratorQwenEdit` (inférence). La sélection VLM demande un LLM **vision** gratuit (Gemini Flash, ou
  `nvidia/nemotron-3.5-super-vl:free` sur OpenRouter d'après `sources_gratuites.md`).
- **CPU** : oui — dépendances `faiss-cpu`, `moviepy`, `opencv-python`, `scenedetect`, `langchain-openai`.
- **Pourquoi le dupliquer** : c'est le seul cerveau **MIT, actif, documenté, testé** (`tests/` couvre le protocole,
  les garde-fous, la robustesse JSON) qui sépare proprement planification et rendu. Pour la troupe :
  (1) pré-remplir `character_portraits_registry` avec les 54 fiches de la bible au lieu de générer des portraits ;
  (2) ajouter un étage **audio d'abord** (TTS français par personnage → durée réelle → durée des plans), absent de
  ViMax qui compte sur l'audio natif de Veo ; (3) écrire les adaptateurs moteur ; (4) ajouter la structure comique
  (accroche → escalade → twist → chute figée) dans les prompts `screenwriter` / `storyboard_artist`.
- **Limites** : configurations par défaut **payantes** (Veo, Nano Banana) ; pas de lip-sync ; montage minimal.

#### A.2 Flow — `https://github.com/OpenX-Inc/flow` — **mini-pipeline Wan 2.2 à copier presque entier**

- **Licence** : MIT (« Copyright (c) 2026 OpenX Inc »). 23 étoiles, 4 forks. `HEAD` du 23/07/2026, version 0.9.1.
- **Ce que fait le code** : « Topic → Script → Scene-by-Scene AI Video → Assembly → Publish ». Schéma
  `schemas.py` : `Scene(id, duration=5, visual_prompt, camera, narration_segment, characters)`,
  `Character(description, reference_image)`, `ShotList(title, narration, scenes, characters)`. Chaînage par **dernière
  image**, cohérence par images de référence et S2V, post-production (transitions, narration, sous-titres, musique),
  publication (YouTube), serveur MCP, magasin de projet avec annulation (`store/undo.py`), TTS `edge` et `miso`.
- **Backend GPU** (`src/gpu_backend/server.py`, `modal_server.py`, `client.py`) : un seul contrat HTTP base64
  `POST /generate/t2v|i2v|flf2v`, `GET /health`. Tableau du README : Wan 2.2 14B **40–80 Go**, Wan 2.1 VACE 14B
  40–80 Go, LTX-2.3 24–32 Go ; déploiement prévu sur Modal / RunPod / AWS / GCP (comptes payants).
- **T4** : **pas tel quel**. Il faut réécrire le serveur pour Wan 2.2 TI2V-5B (fp16, délestage) ou déléguer à Wan2GP,
  et l'appeler **dans le même notebook Kaggle** (inférence : Kaggle n'accepte pas de connexions entrantes).
- **CPU** : orchestrateur oui ; rendu non.
- **Pourquoi** : base de code **minuscule et lisible**, MIT, déjà pensée pour la publication courte (TikTok, Shorts,
  Reels) et pour un rendu Wan auto-hébergé. Excellent point de départ si l'on trouve ViMax trop gros.
- **Limites** : projet très jeune (23 étoiles) ; TTS edge non officiel ; pas de dialogue multi-voix ni de lip-sync.

#### A.3 PenShot — `https://github.com/neopen/story-shot-agent` — **le découpeur en plans avec mémoire**

- **Licence** : MIT (« Copyright (c) 2025 HiPeng »). 223 étoiles, 41 forks. `HEAD` du 14/10/2026 (release 0.3.11).
  Paquet PyPI `penshot`, image Docker `neotems/penshot`.
- **Ce que fait le code** : LangChain + LangGraph ; script (film, short drama, anime, roman) → plans avec **durées
  planifiées selon les contraintes du modèle**, descriptions bilingues, **prompts négatifs et indices audio** ;
  « Continuity Guard » = mémoire courte/moyenne/longue + Chroma pour l'état des personnages, accessoires et intrigue ;
  SDK Python, REST, MCP, nœud LangGraph. LLM : OpenAI, Qwen, DeepSeek, **Ollama** ; un modèle d'**embeddings** et un
  **Redis** sont requis (`.env.example`).
- **T4** : sans objet. **CPU** : oui (inférence : Redis + Chroma tiennent dans 15 Go).
- **Pourquoi** : brique spécialisée « script → shot list » réutilisable comme étape 2 de ViMax ou seule ; il faut
  remplacer ses sorties « Sora / Veo / Runway / Kling ready » par nos renderers Wan / HoloCine.
- **Limites** : embeddings payants par défaut (`text-embedding-v4`) — à remplacer par un modèle local ou gratuit.

#### A.4 MM-StoryAgent — `https://github.com/X-PLUG/MM_StoryAgent` — **squelette minimal à imiter**

- **Licence** : Apache-2.0 (`LICENSE` lu). 309 étoiles, 58 forks. `HEAD` de `main` daté du 23/08/2024 (le papier
  associé est arXiv 2503.05242 ; autres branches non vérifiées). **26 fichiers** seulement.
- **Ce que fait le code** : `run.py -c configs/mm_story_agent.yaml` ; registre d'outils par YAML : `story_writer`
  (`qa_outline_story_writer`), `speech_generation` (`cosyvoice_tts` via **DashScope**, API Aliyun), `image_generation`
  (`story_diffusion_t2i`, SDXL, `id_length: 2`), `sound_generation` (`audioldm2_t2a`), `music_generation`
  (`musicgen_t2m`), `video_compose` (`slideshow_video_compose`, MoviePy).
- **T4** : SDXL fp16 et AudioLDM2 devraient tenir (inférence). **CPU** : seulement avec LLM/TTS en API ; le reste lent.
- **Pourquoi** : le **motif** « un agent par modalité, déclaré dans un YAML, sortie JSON » est le plus simple à recopier
  pour démarrer notre propre code. Sujet = livre d'images narré (pas de dialogue à plusieurs, pas de vraie vidéo).
- **Limites** : MusicGen a des poids non commerciaux (à vérifier) ; CosyVoice via API payante ; dépôt peu actif.

### B. Studios complets (interfaces) à utiliser ou dont copier des morceaux

#### B.1 Toonflow — `https://github.com/HBAI-Ltd/Toonflow-app`

- **Licence** : MIT (`LICENSE` lu : « Copyright (c) 2026 HBAI-Ltd » ; `package.json` « license: MIT »). Le README
  explique le passage d'Apache-2.0 **avec clauses commerciales** à MIT « sans aucune clause commerciale ». 17,9k
  étoiles, 3,2k forks. `HEAD` du 13/10/2026. Monorepo Bun/Electron (868 fichiers) : `apps/server`, `apps/web`,
  `apps/mobile`, `packages/nodes/*` (text, image, video, audio, **director3dNode** avec mannequin et direction de la
  lumière), `packages/teams/storyboardTeam`, `packages/ffmpeg`, `packages/providers`.
- **Fonctions** : toile infinie où cohabitent script, personnages, décors et clips ; agents ouverts (prompts, outils,
  A2A), MCP, plug-ins ; déploiement local, Docker, Android ; « tiers API, ou ComfyUI et LLM locaux » par fournisseurs
  personnalisés (README ; non vérifié dans le code).
- **T4 / CPU** : l'application ne demande pas de GPU ; le rendu passe par un ComfyUI à côté.
- **Pourquoi** : si l'utilisateur veut **voir et corriger** chaque plan avant rendu (relecture humaine), c'est l'UI MIT
  la plus active du genre. Les prompts de `storyboardTeam` et du `director3dNode` sont copiables.
- **Limites** : très orienté fournisseurs chinois payants (sponsors) ; l'intégration ComfyUI est à configurer.

#### B.2 Pixelle-Video — `https://github.com/AIDC-AI/Pixelle-Video`

- **Licence** : Apache-2.0 + fichier `NOTICE` (composants tiers). 29,1k étoiles, 4,2k forks. `HEAD` du 14/06/2026,
  `pyproject` v0.2.0, Python ≥ 3.11. Interfaces : Streamlit (`web/`), API FastAPI (`api/routers` : content, frame,
  image, llm, tts, video, tasks).
- **Fonctions** : pipelines `standard`, `linear`, `asset_based`, `custom` ; modèle `storyboard.py` ; flux ComfyUI
  **auto-hébergés** (`selfhost/image_flux.json`, `selfhost/video_wan2.1_fusionx.json`, `selfhost/tts_edge.json`) ou
  RunningHub (cloud) ; LLM « any OpenAI SDK compatible » dont **Ollama** ; gabarits HTML de cadre (9:16) ; « 数字人口播 »
  (avatar parlant) et image→vidéo ajoutés le 14/01/2026. Le README annonce une « 完全免费方案 » : Ollama local + ComfyUI
  local = 0 yuan.
- **T4** : via un ComfyUI qui tourne sur le T4 (Wan 2.1 / 2.2 en GGUF ou fp16 + délestage, cf. note d'exécution).
  **CPU** : orchestrateur oui ; Ollama sur 4 cœurs = lent (pas de mesure trouvée).
- **Pourquoi** : la plomberie ComfyUI la plus aboutie (flux JSON paramétrés, scan du dossier `workflows/`), réutilisable
  pour appeler nos propres flux Wan + Qwen-Image-Edit.
- **Limites** : pensé pour **une narration en voix off** (pas de dialogue à 2–4 voix ni de lip-sync multi-personnages) ;
  edge-tts par défaut ; FusionX à vérifier.

#### B.3 VideoClaw (ex-FilmAgent) — `https://github.com/HITsz-TMG/VideoClaw`

- **Licence** : MIT (« Copyright (c) 2026 Video-Claw »). L'URL `HITsz-TMG/FilmAgent` sert désormais le dépôt
  VideoClaw. 1,9k étoiles, 276 forks. `HEAD` du 26/08/2026.
- **Contenu** : (1) **FilmAgent** (SIGGRAPH Asia 2024, arXiv 2501.12909) : production dans des décors 3D (Unity),
  prompts `director_1..9`, `screenwriter_1..5`, `cinematographer`, `actor`, `shot_review`, vocabulaires `shots.json`,
  `actions.json`, `rotateandtrack.json`, 16 lieux ; (2) **video-claw** : appli web « script → personnages/décors →
  storyboard → images de référence → vidéo → montage », **suite infinie** d'épisodes de short drama, intégration
  OpenClaw. Fournisseurs : OpenAI, Gemini, DeepSeek, DashScope, ARK (Seedance), Kling ; défauts `qwen3.5-plus` et
  `wan2.7-i2v` (API).
- **T4** : non, aucun rendu local fourni. **CPU** : oui.
- **Pourquoi** : banque de **prompts MIT** (réalisateur, scénariste, chef opérateur, relecture de plan) et vocabulaire
  discret de plans/actions utile pour des personnages 3D cartoon ; ne pas reprendre la partie fournisseurs payants.

#### B.4 OpenMontage — `https://github.com/calesthio/OpenMontage` — **AGPL : utiliser, ne pas fusionner**

- **Licence** : **AGPL-3.0** (`LICENSE` lu). 68,6k étoiles, 8,8k forks. `HEAD` du 12/10/2026.
- **Fonctions** : orchestrateur qui tourne **dans un assistant de code** (Claude Code, Codex, Cursor…) ; `pipeline_defs/*.yaml`
  (animation, character-animation, cinematic, talking-head, localization-dub, clip-factory…) avec directeurs
  (executive-producer, script, scene, asset, edit, compose, reviewer, voice-performance) et **plafonds de budget**
  (`budget_default_usd`, `max_revisions_per_stage`) ; mode « zéro clé » : **Piper TTS**, Remotion ou HyperFrames,
  FFmpeg, sous-titres mot à mot ; vidéo locale `VIDEO_GEN_LOCAL_MODEL=wan2.2-ti2v-5b` (ou wan2.1-1.3b, …) ;
  `tools/_comfyui/workflows/wan22-i2v-4step.json`, `wan22-t2v-4step.json` ; `tools/video/_wan_engine.py` choisit la
  précision (bf16 / fp16 / fp32) et le mode de délestage (« sequential » si peu de VRAM) ; auto-relecture après rendu
  (ffprobe, images noires, niveaux audio).
- **T4** : TI2V-5B en fp16 avec délestage séquentiel semble prévu par le code (inférence, non testé).
  **CPU** : composition et Piper oui.
- **Pourquoi** : l'exemple le plus complet d'**agent-producteur avec budget et relecture**. À utiliser tel quel ou à
  lire ; **ne pas copier** de code dans un moteur non AGPL.
- **Limites** : lip-sync = Wav2Lip (non commercial selon son README) ; Remotion = licence maison.

#### B.5 AI Movie Studio 2 — `https://github.com/Heroesjouney/AIMovieStudiov2` — AGPL

- **Licence** : AGPL-3.0. 176 étoiles. `HEAD` du 15/09/2026. Next.js + FastAPI.
- **Fonctions** : « Driver System » ComfyUI local / Fal / Replicate ; LTX 2.3, Wan (via ComfyUI-WanVideoWrapper),
  MiniMax H3 ; images Z-Image, Qwen Image, Flux 2, Krea 2 ; **prévisualisation caméra 3D** (alerte règle des 180°),
  références de continuité, LoRA par interface, « Long Take Mode » ; export **XML** Premiere / DaVinci (OTIO et FCPXML
  sur la feuille de route). Matériel : **8 Go minimum** pour images et clips courts, 12–16 Go pour Wan et H3
  ([comfyui-wiki, 09/09/2026](https://comfyui-wiki.com/en/news/2026-09-09-ai-movie-studio-2)).
- **Pourquoi** : pilotes `comfy_video.py` / `comfy_image.py` avec injection de LoRA = exactement notre besoin
  (LoRA personnages) ; à lire, ou à utiliser en local. Vérifier les licences de Flux 2 et H3 avant usage.

### C. Recherche : à lire, ne pas copier

#### C.1 MovieAgent — `https://github.com/showlab/MovieAgent`

- **Licence** : **aucun fichier LICENSE**, aucune licence dans la barre latérale GitHub → tous droits réservés.
  368 étoiles. `HEAD` du 26/03/2025.
- **Contenu** : GPT-4o + ROICtrl + SVD / HunyuanVideo-I2V ; dossiers de modèles CogVideoX, ConsisID, F5-TTS
  (poids CC-BY-NC), OmniGen, SD, I2VGen ; banque `character_list/<nom>/` (photos, `best.png`, légendes `.txt`) ;
  CUDA 12.1 / PyTorch 2.4.
- **T4** : non (HunyuanVideo-I2V). **CPU** : non.
- **Usage** : lire la logique de l'agent de plans (personnages, beat, caméra, type de plan, sous-titres) et la
  **réécrire** ; c'est la base de comparaison de ViMax et d'AniMaker.

#### C.2 AniMaker (dans Anim-Director) — `https://github.com/HITsz-TMG/Anim-Director/tree/main/AniMaker`

- **Licence** : **aucun LICENSE** à la racine ni dans `AniMaker/` (seuls des sous-modules tiers en ont). 262 étoiles.
  `HEAD` du 07/01/2026. SIGGRAPH Asia 2025 (arXiv 2506.10540).
- **Contenu** : `Pipeline/pipeline.py` (216 lignes) + `utils/` (`story2script`, `script2character`,
  `script2environment`, `script2scene`, `videogen` avec **Wan2.1-I2V-14B-480P**, `audiogen` CosyVoice,
  `finalvideogen`) ; AniEval sur EvalCrafter ; APIs OpenAI, Gemini, DeepSeek, Vidu et **compte Imgur** requis ;
  Hunyuan3D-1 (licence Tencent).
- **T4** : Wan 14B en 480p seulement avec délestage lourd (Wan2GP) ; le MCTS multiplie les candidats → très coûteux
  sur 30 h/semaine (inférence).
- **Usage** : reprendre l'**idée** MCTS-Gen (explorer quelques candidats par plan sous budget, approfondir les
  meilleurs) et le relecteur contextuel, en les réécrivant.

#### C.3 Papiers sans code public trouvé

StoryAgent (2411.04925 ; seul dépôt = démos `storyagent123/Comparison-of-storytelling-video-results`, sans licence),
DreamFactory (2408.11788 ; « publié après acceptation », non trouvé), MAViS (2508.08487), MVAgent (2609.30609),
Captain Cinema (2507.18634, ICLR 2026) : **aucun dépôt de code trouvé** au 16/10/2026. Mora
(`lichao-sun/Mora`) : pas de LICENSE, dernier commit 10/10/2024 → écarté.

### D. Pipelines TikTok et montage

#### D.1 MoneyPrinterTurbo — `https://github.com/harry0703/MoneyPrinterTurbo`

- **Licence** : MIT (« Copyright (c) 2024 Harry »). ~131,7k étoiles, 20,7k forks. `HEAD` du 15/10/2026.
- **Code utile** : `app/models/schema.py` (`VideoAspect.portrait = "9:16"` → 1080×1920) ; `app/services/video.py`
  (2 029 lignes : composition, effets, musique) ; `subtitle.py` (352 lignes : sous-titres par horodatage TTS ou
  **faster-whisper**) ; `voice.py` (3 816 lignes : Edge TTS, Gemini TTS, ElevenLabs, MiniMax, **Chatterbox
  auto-hébergé** `chatterbox:<voix>`, **Kokoro** par serveur) ; `cli.py` (1 793 lignes, lots) ; Docker CPU et GPU.
- **Matériel (README)** : CPU **4 cœurs minimum**, 6–8 recommandés ; GPU « non nécessaire », 4 Go conseillés pour
  faster-whisper local.
- **Pourquoi** : copier l'étage **sous-titres TikTok + mixage + 9:16 + lots**, déjà rodé par une très grosse
  communauté. Ignorer la partie « stock vidéo Pexels » et les sponsors API.

#### D.2 FireRed-OpenStoryline — `https://github.com/FireRedTeam/FireRed-OpenStoryline`

- **Licence** : Apache-2.0. 3,5k étoiles, 410 forks. `HEAD` du 31/07/2026.
- **Code utile** : serveur MCP de nœuds (`config.toml`) : `SplitShotsNode` (TransNetV2, `transnet_device = "cpu"`),
  `LocalASRNode`, `SpeechRoughCutNode` (retire hésitations et répétitions), `UnderstandClipsNode` (VLM, 2 i/s,
  64 images max), `GenerateScriptNode`, `GenerateVoiceoverNode`, `SelectBGMNode`, `RecommendTransitionNode`,
  `RecommendTextNode`, `PlanTimelineProNode`, `GenerateAITransitionNode`, `RenderVideoNode` ; « Skills » = un montage
  complet enregistré puis rejoué sur d'autres médias.
- **T4 / CPU** : CPU suffit ; LLM et VLM par `base_url` (gratuits possibles). Les transitions IA appellent un service
  vidéo tiers « relativement cher » (README) → à désactiver.
- **Pourquoi** : le meilleur agent de **post-production** sous licence permissive ; la notion de Skill = « charte de
  montage de la troupe » rejouable sur chaque sketch.

#### D.3 editly — `https://github.com/mifi/editly`

- **Licence** : MIT. 5,5k étoiles, 383 forks. `HEAD` du 20/02/2025 (peu actif depuis).
- **Ce que c'est** : montage non linéaire **déclaratif** (Node.js + ffmpeg, en flux) : `clips[].layers[]` (vidéo,
  image, titre, sous-titre…), `transition`, `audioTracks` globales, **`detached-audio` relatif au début du clip**,
  `audioNorm`, `keepSourceAudio`, `width`/`height` libres (9:16), ralenti/accéléré automatique pour caler un segment
  sur une durée.
- **Pourquoi** : le LLM ou notre code peut émettre **un fichier JSON5 = un montage reproductible** ; la réplique de
  chaque personnage s'accroche à son plan via `detached-audio`.

#### D.4 MoviePy — `https://github.com/Zulko/moviepy`

- **Licence** : MIT. 15,0k étoiles. `HEAD` du 26/08/2026, v2.2.0 (v2 = changements cassants par rapport à v1).
- **Pourquoi** : utilisé par ViMax, MoneyPrinterTurbo, OpenStoryline et MM-StoryAgent : le standard Python du montage.
  Plus lent qu'ffmpeg direct (README) : réserver aux compositions, pas aux ré-encodages lourds.

#### D.5 auto-editor — `https://github.com/WyattBlue/auto-editor`

- **Licence** : Unlicense (domaine public). 5,5k étoiles. `HEAD` du 14/10/2026 (Nim).
- **Ce que c'est** : coupe automatique par `--edit audio:threshold` et **`--edit motion:threshold`**, combinables ;
  `--margin` règle le rythme ; export `--export premiere | resolve | final-cut-pro | shotcut | kdenlive |
  clip-sequence` (README lu).
- **Pourquoi** : retirer les **fins de clips figées** typiques des générateurs et les blancs entre répliques ; régler le
  tempo comique par `--margin` (inférence).

#### D.6 OpenTimelineIO — `https://github.com/AcademySoftwareFoundation/OpenTimelineIO`

- **Licence** : Apache-2.0 (+ NOTICE Pixar). 2,0k étoiles. `HEAD` du 13/10/2026.
- **Pourquoi** : `couche_prompt_et_multiplans.md` note l'absence de format standard pour transmettre les décisions de
  montage. OTIO est ce standard : notre pipeline écrit une timeline `.otio`, l'utilisateur la retouche dans DaVinci
  Resolve / Kdenlive (adaptateurs à vérifier).

#### D.7 Revideo et Remotion — `https://github.com/midrender/revideo`, `https://github.com/remotion-dev/remotion`

- **Revideo** : MIT (fork de Motion Canvas), 4,1k étoiles, `HEAD` du 15/07/2026 ; « rendering engine for creating
  videos in code », API de rendu sans tête, « zero dep ». Pour titres, cartons, **sous-titres animés mot à mot**.
- **Remotion** : 64,4k étoiles, `HEAD` du 15/10/2026 ; **licence maison** (lue) : gratuit pour individus et
  entreprises ≤ 3 employés, y compris vidéos commerciales ; interdit de vendre un dérivé de Remotion.
- **Pourquoi** : la couche « habillage TikTok » (accroche écrite, sous-titres karaoké). Préférer Revideo si l'on veut
  éviter toute question de licence.

#### D.8 wind-comic — `https://github.com/ChrisChen667788/wind-comic` — idées de contrôle qualité

- **Licence** : MIT. 707 étoiles. `HEAD` du 15/10/2026.
- **Fonctions** : pipeline multi-agents (Writer, Director, Producer, Character Designer, Storyboard Artist, Cameo
  Locker, Lipsync, Editor) ; **voix par personnage** ; piste de **visèmes**, **score d'alignement bouche/audio** et
  correction de dérive ; boucle « Vision-Audit » qui régénère tout plan noté < 70 ; garde-fou de budget ; console de
  mise en place (acteurs + caméra vus de dessus → directive de staging).
- **T4** : non (moteurs Veo, MiniMax, Kling, HappyHorse en API). **CPU** : oui.
- **Pourquoi** : code MIT à lire/copier pour le **contrôle qualité du lip-sync** et le routage des voix ; il faut
  écrire les adaptateurs moteurs locaux.

---

## 3. Écartés ou à manier avec précaution

| Dépôt | Licence / état | Raison |
|---|---|---|
| [chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama) | **CC BY-NC-SA 4.0** (`LICENSE` lu) | « Commercial use is prohibited » ; clé API maison payante mise en avant. **Ne pas dupliquer.** |
| [aqm857886159/Nomi](https://github.com/aqm857886159/Nomi) | AGPL-3.0-only (anciennes versions Apache-2.0) ; 574 étoiles ; `HEAD` 16/10/2026 | Atelier ComfyUI piloté par Claude Code / Cursor via MCP ; utiliser tel quel seulement. |
| [heshengtao/comfyui_LLM_party](https://github.com/heshengtao/comfyui_LLM_party) | AGPL-3.0 ; `HEAD` 30/07/2026 | Nœuds LLM (Ollama…) dans ComfyUI ; AGPL. |
| [SlavaSexton/comfyui-agent-kit](https://github.com/SlavaSexton/comfyui-agent-kit) | Apache-2.0 depuis v3.2.0 (MIT ≤ v3.1.0, NOTICE lu) ; `HEAD` 20/08/2026 | Compétence d'agent de code pour piloter ComfyUI (multi-plans) ; utile mais pas un pipeline. |
| [agent-next/video-agent](https://github.com/agent-next/video-agent) | Apache-2.0 ; `HEAD` 10/10/2026 | « Ollama pour la vidéo », mais **H3 seulement** (~54 Go de poids), Wan/LTX « designed but not wired ». |
| [AIDC-AI/Pixelle-MCP](https://github.com/AIDC-AI/Pixelle-MCP) | MIT ; `HEAD` 17/12/2025 | Serveur MCP ComfyUI ; flux par défaut RunningHub (cloud). Optionnel. |
| [xuanyustudio/LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) | MIT ; 2,1k étoiles ; `HEAD` 16/10/2026 | Appli short drama ; LLM local (Ollama) mais **vidéo uniquement par API** (Seedance, Wan, Vidu, Kling, Veo). |
| [DuNGEOnmassster/VideoGen-of-Thought](https://github.com/DuNGEOnmassster/VideoGen-of-Thought) | BSD-3-Clause ; 66 étoiles ; `HEAD` 22/09/2025 | Recherche multi-plans ; ~60 Go en rendu (H100) ; variante FramePack (poids dérivés HunyuanVideo, licence Tencent). Lire. |
| [gyoridavid/short-video-maker](https://github.com/gyoridavid/short-video-maker) | MIT ; 1,4k étoiles ; `HEAD` 21/06/2025 | Voix **anglais seulement** (kokoro-js) ; dépend de Remotion. Utile pour son API REST/MCP + n8n. |
| [RayVentura/ShortGPT](https://github.com/RayVentura/ShortGPT) | MIT ; 8,0k étoiles ; `HEAD` 10/02/2025 | Inactif depuis février 2025 ; dépend d'edge-tts. |
| [google-deepmind/dramatron](https://github.com/google-deepmind/dramatron) | Apache-2.0 (code), CC-BY 4.0 (reste) ; 1,1k étoiles ; `HEAD` 17/07/2024 | Écriture hiérarchique (logline → personnages → scènes → dialogues) ; inactif ; **prompts à lire** pour le scénariste. |
| [Vchitect/Vlogger](https://github.com/Vchitect/Vlogger) | Apache-2.0 (code) ; `HEAD` 19/05/2025 | Base Stable Diffusion 1.4 et GPT-4 ; dépassé. |
| [linyqh/NarratoAI](https://github.com/linyqh/NarratoAI) | MIT ; `HEAD` 17/09/2026 | Commentaire / remontage de films existants : hors de notre usage. |
| [alecm20/story-flicks](https://github.com/alecm20/story-flicks) | **Pas de LICENSE** ; `HEAD` 12/03/2025 | Lecture seule. |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | Sustainable Use License + fichiers `.ee` sous licence entreprise | Usage interne possible comme planificateur, mais pas un code à forker. |
| [lichao-sun/Mora](https://github.com/lichao-sun/Mora) | Pas de LICENSE ; `HEAD` 10/10/2024 | Inactif, non licencié. |
| [HVision-NKU/StoryDiffusion](https://github.com/HVision-NKU/StoryDiffusion), [smthemex/ComfyUI_StoryDiffusion](https://github.com/smthemex/ComfyUI_StoryDiffusion) | Apache-2.0 | Couche cohérence personnages (> 20 Go pour la version « low VRAM » d'origine) : relève de `coherence_personnages_lipsync.md`. |
| [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT ; `HEAD` 24/09/2026 | Éditeur manuel (alternative CapCut) ; utile pour retouche, pas pour l'automatisation. |

---

## 4. Assemblage proposé pour « le moteur de la troupe » (inférence)

Principe : **un seul dépôt à nous**, sous licence permissive, qui **forke ViMax** et **recopie** des morceaux MIT/Apache.
Aucun code AGPL ou sans licence n'y entre. L'orchestrateur tourne sur le CPU du conteneur ou dans le notebook Kaggle ;
le GPU ne sert qu'aux étapes 4–6.

| Étape | Brique dupliquée | Ce qu'on écrit nous-mêmes |
|---|---|---|
| 0. Bible | — | Charger les 54 fiches + un échantillon de voix par personnage dans le registre de personnages de ViMax (au lieu de `generate_character_portraits`). |
| 1. Script | ViMax `screenwriter` + prompts VideoClaw / Dramatron (lecture) | Gabarit comique « accroche → escalade → twist → chute figée », français, 25–60 s ; LLM gratuit par `base_url` (Gemini Flash, OpenRouter `:free`) ou llama.cpp local. |
| 2. Shot list | ViMax `storyboard_artist`, `decompose_visual_descriptions`, `construct_camera_tree` (ou PenShot) | Champs en plus : locuteur, réplique FR, durée cible, type de plan ; renderers par moteur (Wan, HoloCine `[shot cut]`…) décrits dans `couche_prompt_et_multiplans.md`. |
| 3. Voix d'abord | Routage de voix de MoneyPrinterTurbo (`voice.py`, serveur Chatterbox) | TTS par réplique → durée réelle → durée de chaque plan. |
| 4. Images clés | ViMax `generate_and_select_best_image` (best-of-N + VLM) | `ImageGeneratorQwenEdit` (ComfyUI sur T4, ou Space HF). |
| 5. Clips | Contrat HTTP de `OpenX-Inc/flow` (`/generate/i2v|flf2v`) ou file JSON Wan2GP | `VideoGeneratorWan2GP` conforme au protocole ViMax ; limiteurs par jour = quotas Kaggle. |
| 6. Lèvres | — (wind-comic pour l'idée du score d'alignement) | Passe MuseTalk / LatentSync par plan parlant (voir note cohérence). |
| 7. Contrôle | Idées AniMaker (MCTS-Gen, relecteur contextuel) et OpenMontage (vérifs après rendu) — **réécrites** | Note par plan, régénération si sous le seuil, budget de candidats par sketch ; `auto-editor --edit motion` pour couper les fins figées. |
| 8. Montage | editly (JSON5) ou MoviePy ; sous-titres de MoneyPrinterTurbo (`subtitle.py`) ; Revideo pour l'habillage | Chute figée sur visage choqué (arrêt sur image + zoom), export `.otio` pour retouche. |
| 9. Charte | Concept de « Skills » d'OpenStoryline | Fichier de style de montage de la troupe rejoué à chaque sketch. |

Points d'architecture (inférence) :
- **Kaggle n'accepte pas de connexions entrantes** : le plus simple est de lancer tout le pipeline **dans** le notebook
  (orchestrateur + Wan2GP), ou de passer par une file de fichiers (dataset Kaggle) plutôt qu'un serveur HTTP exposé.
- Le protocole ViMax et ses limiteurs « par jour » s'adaptent naturellement aux plafonds gratuits (50 requêtes/jour
  OpenRouter, ~30 h GPU/semaine).
- Si l'utilisateur veut une interface de relecture, **Toonflow** (MIT) peut servir de façade, notre pipeline étant
  appelé comme fournisseur personnalisé.

---

## 5. Gaps

- **Aucun pipeline ouvert ne gère nativement un dialogue français à 2–4 voix avec lip-sync local** : l'étage
  « voix d'abord + lip-sync » est à écrire dans tous les cas.
- Aucun code n'a été exécuté : **aucune durée mesurée** de ces pipelines sur T4 ou sur le conteneur.
- Étoiles arrondies par GitHub ; dates = commit `HEAD` de la branche par défaut (les autres branches ne sont pas
  vérifiées, ex. MM-StoryAgent dont le `main` date d'août 2024).
- Intégration ComfyUI de Toonflow : affirmée par le README, non vérifiée dans le code.
- Adaptateurs d'OpenTimelineIO vers DaVinci / Kdenlive : non vérifiés (séparés du dépôt principal).
- Analyse AGPL / Remotion / Sustainable Use License = lecture de licences, **pas un avis juridique**.
- Licence exacte de Wav2Lip, MusicGen, FusionX et HyperFrames : non relue ici (à faire par `verification_licences.md`).
- Code de DreamFactory, MAViS, MVAgent, Captain Cinema et StoryAgent : non trouvé au 16/10/2026.
- Conditions de Kaggle sur les tunnels / serveurs dans un notebook : non consultées.

---

## Sources

Dépôts (licence, README, configuration et code lus par `git show`, étoiles via la page GitHub, 16/10/2026) :
[HKUDS/ViMax](https://github.com/HKUDS/ViMax) ·
[OpenX-Inc/flow](https://github.com/OpenX-Inc/flow) ·
[neopen/story-shot-agent](https://github.com/neopen/story-shot-agent) ·
[X-PLUG/MM_StoryAgent](https://github.com/X-PLUG/MM_StoryAgent) ·
[HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app) ·
[AIDC-AI/Pixelle-Video](https://github.com/AIDC-AI/Pixelle-Video) ·
[HITsz-TMG/VideoClaw](https://github.com/HITsz-TMG/VideoClaw) ·
[calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) ·
[Heroesjouney/AIMovieStudiov2](https://github.com/Heroesjouney/AIMovieStudiov2) ·
[showlab/MovieAgent](https://github.com/showlab/MovieAgent) ·
[HITsz-TMG/Anim-Director](https://github.com/HITsz-TMG/Anim-Director) ·
[harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) ·
[FireRedTeam/FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) ·
[mifi/editly](https://github.com/mifi/editly) ·
[Zulko/moviepy](https://github.com/Zulko/moviepy) ·
[WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) ·
[AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) ·
[midrender/revideo](https://github.com/midrender/revideo) ·
[remotion-dev/remotion](https://github.com/remotion-dev/remotion) ·
[ChrisChen667788/wind-comic](https://github.com/ChrisChen667788/wind-comic) ·
[chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama) ·
[aqm857886159/Nomi](https://github.com/aqm857886159/Nomi) ·
[xuanyustudio/LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) ·
[DuNGEOnmassster/VideoGen-of-Thought](https://github.com/DuNGEOnmassster/VideoGen-of-Thought) ·
[gyoridavid/short-video-maker](https://github.com/gyoridavid/short-video-maker) ·
[RayVentura/ShortGPT](https://github.com/RayVentura/ShortGPT) ·
[google-deepmind/dramatron](https://github.com/google-deepmind/dramatron).

Pages tierces : [AniMaker, page projet](https://animaker-dev.github.io/) (lien vers le code) ·
[comfyui-wiki, AI Movie Studio 2 (09/09/2026)](https://comfyui-wiki.com/en/news/2026-09-09-ai-movie-studio-2) ·
[arXiv 2411.04925 StoryAgent](https://arxiv.org/abs/2411.04925) · [arXiv 2408.11788 DreamFactory](https://arxiv.org/abs/2408.11788v1) ·
[arXiv 2508.08487 MAViS](https://arxiv.org/html/2508.08487v5) · [arXiv 2606.07649 ViMax](https://arxiv.org/pdf/2606.07649) ·
[ICLR 2026, Captain Cinema](https://iclr.cc/virtual/2026/poster/10006426).
