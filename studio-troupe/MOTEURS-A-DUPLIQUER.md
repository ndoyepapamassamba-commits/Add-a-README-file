# Moteurs à dupliquer pour la troupe

> État au **16/10/2026**. Réponse à la demande « cherche des codes moteurs à dupliquer ».
> **27 dépôts vérifiés un par un** (22 au premier passage, 5 ajoutés après relecture) : clone local, fichier de licence lu, code clé lu (les références `fichier:ligne`
> sont dans [`vendor/moteurs.json`](vendor/moteurs.json)), licences des poids lues sur l'API Hugging Face, commit épinglé.
> Aucun code tiers n'a été exécuté et aucun poids n'a été téléchargé, sauf pour le banc CPU (§ 5), où
> stable-diffusion.cpp a été compilé et lancé exprès.
> Notes détaillées : `research_notes/Moteurs vidéo IA pour la troupe/codes_a_dupliquer_*.md`.
> Ce document n'est pas un avis juridique : c'est une lecture attentive des licences, à faire confirmer avant un gros enjeu commercial.

## En bref

- **Il n'existe pas de « Veo 3 ouvert » à copier tel quel.** Le moteur de la troupe s'assemble en chaîne :
  un cœur vidéo (**Wan 2.2**), un exécutant basse mémoire pour les T4 de Kaggle (**ComfyUI + ComfyUI-GGUF +
  ComfyUI-WanVideoWrapper**, ou **Wan2GP**), l'animation des personnages (**SCAIL-2**, **One-to-All**, **VideoX-Fun**),
  la voix française (**Qwen3-TTS**, **Chatterbox**), les lèvres (**InfiniteTalk** et **HuMo** en A/B, **MuseTalk**),
  la musique (**ACE-Step 1.5**), puis le montage et le contrôle qualité.
- **Verdicts : 23 dépôts à dupliquer, 4 à référencer seulement** (Qwen-Image, Z-Image, FLUX.2, NanoI2V), environ 80 écartés (§ 3.2).
- **Le code de chaque dépôt retenu, et les vidéos faites avec les poids recommandés, autorisent l'usage commercial**,
  sans exclusion de territoire ni plafond de revenus pour ces briques-là. **Mais un dépôt propre ne rend pas propre tout
  ce qu'il sait charger.** Presque chacun cache un piège : modèle non commercial proposé à côté des bons (Wan2GP propose
  MMAudio, YuE2, Qwen-Image-2.1 et Flux3 ; FLUX.2 a des variantes 9B non commerciales), fichier non commercial embarqué,
  détecteur sous AGPL, LoRA sans licence, API payante appelée par défaut. N'utiliser que les poids des listes blanches :
  § 4 et champ `conditions` de `moteurs.json`.
- **Le CPU du conteneur fait tourner un vrai moteur** (stable-diffusion.cpp + Wan2.1 1,3B) : 2 s de vidéo 9:16 en 24 min.
  Il est utile pour les aperçus, pas pour la production, qui se fait sur Kaggle T4.
- **Rien n'a encore été chronométré sur T4 par nous.** Le seul chiffre T4 disponible est annoncé par un tiers :
  ≈ 8 min par clip de 5 s en 480p (FastWan 5B, recette Wan2GP-on-Colab). SCAIL-2 et InfiniteTalk (bases 14B) ne tiendront
  sur un T4 qu'avec délestage partiel, sans preuve à ce jour. La première session Kaggle doit servir à mesurer.
- **Comment dupliquer :** on ne copie pas le code tiers dans ce dépôt public. On l'épingle dans `vendor/moteurs.json`
  et on le récupère à la demande avec [`vendor/recuperer.sh`](vendor/recuperer.sh) (§ 6).

---

## 1. « Dupliquer » légalement : ce que ça veut dire

Dupliquer, c'est **cloner** (copie locale), **forker** (copie publique sous notre compte GitHub) ou **vendoriser**
(recopier des fichiers dans notre propre dépôt). Dans les trois cas, le code reste la propriété de ses auteurs.
Nous n'avons que les droits que la licence nous accorde. Pour une vidéo TikTok monétisée, il faut vérifier
**trois couches indépendantes**, plus une quatrième qui n'est pas une licence :

| Couche | La question | Exemples dans ce dossier |
|---|---|---|
| **Licence du code** | Peut-on copier, modifier, redistribuer le programme ? | Wan2.2 : Apache-2.0. ComfyUI : GPL-3.0. Wan2GP : licence maison. |
| **Licence des poids** | Peut-on utiliser le modèle entraîné (`.safetensors`, `.gguf`) commercialement, en France ? | Wan : Apache-2.0. Hunyuan : UE et Royaume-Uni exclus. Qwen-Image-2.1 : non commercial. |
| **Droits sur les sorties** | À qui appartiennent les vidéos et les voix générées ? | Wan : « We claim no rights over your generated contents ». GPL-3.0 § 2 : la sortie n'est pas couverte. |
| *Hors licence* | Droits des personnes et contenus embarqués | Voix ou visage d'un comédien réel : consentement écrit. Polices et musiques embarquées dans un dépôt (§ 4). |

Ces couches ne se déduisent pas l'une de l'autre. Un code MIT peut charger des poids non commerciaux.
Un dépôt de poids étiqueté Apache peut contenir un fichier d'origine AGPL (`yolov10m.onnx` dans Wan2.2-Animate).

**Les licences rencontrées et ce qu'elles signifient pour nous :**

| Licence | Permet | Impose | Pour la troupe |
|---|---|---|---|
| MIT, BSD | tout, y compris la vente | garder la notice de copyright | ✔ |
| Apache-2.0 | tout, avec une licence de brevet | garder `LICENSE` et les en-têtes, signaler les fichiers modifiés ; la licence de brevet tombe si l'on attaque en contrefaçon de brevet | ✔ |
| GPL-3.0 | exécuter et modifier en privé, sans condition | si l'on **distribue** un fork : le fournir sous GPL-3.0 avec sa source. Les sorties ne sont pas couvertes. | ✔ comme outil ; attention à ce qu'on publie |
| AGPL-3.0 | comme la GPL | l'obligation naît aussi d'un simple **service réseau** | ✘ dans le moteur (YOLOv10, ultralytics, OpenMontage) |
| WanGP Community License 2.0 | usage gratuit, y compris par une entreprise ; vidéos vendables | pas de revente, de location, d'API ni de SaaS sans licence commerciale | ✔ en usage interne |
| CC BY-NC, S-Lab, PolyForm Noncommercial, « qwen-research », FLUX.1-dev, FLUX Non-Commercial (FLUX.2 klein 9B et dev, Flux3) | recherche, usage personnel | **pas d'usage commercial** | ✘ |
| Licences avec territoire (Tencent Hunyuan, MiniMax H3) | usage hors des pays exclus | exclusion de l'UE, du Royaume-Uni, etc. | ✘ (TikTok vu en France) |
| Licences communautaires avec plafond (LTX, Fish Audio, SD3.5, Stable Audio, IndexTTS2) | usage commercial sous un plafond de revenus ou d'utilisateurs | mentions, plafond | à éviter, on n'en a pas besoin |
| **Aucune licence** | rien : tous droits réservés | — | ✘ (lecture seulement) |

**Règle retenue :** une brique n'entre dans le moteur que si ses trois couches sont MIT, BSD ou Apache (ou équivalent),
ou si c'est un outil GPL-3.0 que l'on exécute sans le redistribuer, ou Wan2GP en usage interne.

---

## 2. La pile recommandée

```
 script ─► planches et images clés ─► voix FR ──► animation des personnages ─► lèvres ──────► fluidité, 1080p ─► musique, ambiance ─► montage ──────► contrôle
 ViMax     Qwen-Image-Edit-2511       Qwen3-TTS   SCAIL-2 / One-to-All         InfiniteTalk   RIFE + SeedVR2     ACE-Step 1.5         MoneyPrinter-   VBench
           Z-Image, FLUX.2 klein 4B   Chatterbox  VideoX-Fun (Fun-5B)          ou HuMo (A/B)                     + bruitages CC0      Turbo (mixage)  (à la carte)
           (via diffusers, GGUF)      (VC)        Wan 2.2 TI2V-5B              MuseTalk
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 exécuté par : ComfyUI + ComfyUI-GGUF + ComfyUI-WanVideoWrapper (ou Wan2GP) sur Kaggle 2×T4  ·  stable-diffusion.cpp sur le CPU du conteneur (aperçus)
 LoRA de personnages : DiffSynth-Studio, VideoX-Fun (Fun-5B)  ·  code de référence et châssis Python : Wan2.2 + diffusers
```

| Étape | Code à dupliquer | Licence code / poids | Usage commercial | T4 (Kaggle) | CPU (conteneur) | Commit épinglé |
|---|---|---|---|---|---|---|
| **Moteur de base** | [Wan2.2](https://github.com/Wan-Video/Wan2.2) (code de référence TI2V-5B) | Apache-2.0 / Apache-2.0 | oui sous conditions | pas tel quel ; fork patché (SDPA, fp16, 480p) plausible | non | `1ea34ff` (21/09/2026) |
| | [diffusers](https://github.com/huggingface/diffusers) (châssis Python) | Apache-2.0 (3 fichiers NC à exclure) / Apache-2.0 | oui sous conditions | partiel (SDPA ; fp16 non documenté) | tests de fumée | `af4271c` (prod : tag v0.41.0 = `086bf95`) |
| **Runner T4** | [ComfyUI](https://github.com/Comfy-Org/ComfyUI) + [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | GPL-3.0 + Apache-2.0 / Apache, MIT | oui | oui, avec réserves (pilote, cu130) | développement seulement | `5a66589` (prod : v0.41.1 = `45bf90d`) + `6ea2651` |
| | [ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) (nœuds One-to-All, InfiniteTalk, HuMo) | Apache-2.0, sous-dossiers mixtes (Ovi non commercial, exclu) / GGUF Apache | oui sous conditions | sdpa, fp16 à régler, échange de blocs ; non mesuré | non | `088128b` (24/05/2026) |
| | voie rapide : [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) + [Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab) | WanGP CL 2.0 (+ Apache pour le notebook) / Apache-2.0 **pour la liste blanche seulement** (§ 4.2) | oui sous conditions (pas de revente) | FastWan 5B seulement, ≈ 8 min/5 s annoncés par un tiers (Colab) ; autres modèles non prouvés | non | `de302ee` + `e428b5e` |
| **Route CPU** | [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | MIT / Apache-2.0 | oui | oui (à compiler) | **oui, mesuré** | `8cd731e` (16/10/2026) |
| **Personnages et animation** | [SCAIL-2](https://github.com/zai-org/SCAIL-2) | Apache-2.0 / MIT | oui sous conditions (mode e2e) | **non prouvé** : GGUF Q3_K_M ou Q4 + délestage partiel, à mesurer | non | `78fe195` |
| | [One-to-All-Animation](https://github.com/ssj9596/One-to-All-Animation) | Apache-2.0 / Apache-2.0 | oui sous conditions (fork élagué) | via WanVideoWrapper (épinglé), 1.3B fp16 | prétraitement de pose | `b3c9d88` |
| | [VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) (Wan2.2-Fun-5B : Control + image de référence, InP première et dernière image) | Apache-2.0 / Apache-2.0 | oui sous conditions (5B seulement) | plausible (DiT 5B 10 Go, fp16 + délestage), non mesuré | non | `13bb3c6` (14/10/2026) |
| **Voix française** | [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | Apache-2.0 / Apache-2.0 | oui | oui en fp32 | oui, lent | `022e286` |
| | [Chatterbox](https://github.com/resemble-ai/chatterbox) (TTS V3 et conversion de voix) | MIT / MIT | oui | oui | conversion de voix en lot (non mesuré) | `5de7a54` |
| **Lèvres** | [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | Apache-2.0 / Apache-2.0 | oui | pas tel quel ; base I2V-14B Q4 (11,3 Go) + adaptateur (1,4 Go) : Q3 ou délestage, à mesurer | non | `50aa0a9` |
| | [HuMo](https://github.com/Phantom-video/HuMo) 1.7B (en A/B contre InfiniteTalk, encodeur Whisper multilingue) | Apache-2.0 / Apache-2.0 | oui sous conditions | plausible (3,5 Go + Whisper 3,1 Go en fp16), via ComfyUI natif ; non mesuré | non | `845f447` (26/01/2026) |
| | [MuseTalk](https://github.com/TMElyralab/MuseTalk) 1.5 (retouche de bouche) | MIT / MIT (+ BiSeNet NC à remplacer) | oui sous conditions | oui en fp16 | tests | `0a89dec` |
| **Musique et ambiance** | [ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) (musique avec ou sans paroles) ; bruitages : bibliothèques CC0, aucun générateur ouvert commercialement propre trouvé | MIT / MIT | oui sous conditions (Content ID) | prévu (fp16 et attention eager automatiques, `--backend pt`), non mesuré | possible, lent | `ca1e85f` (29/08/2026) |
| **Extension des planches, images clés** | *à référencer* : [Qwen-Image](https://github.com/QwenLM/Qwen-Image) (Edit-2511), [Z-Image](https://github.com/Tongyi-MAI/Z-Image) et [FLUX.2](https://github.com/black-forest-labs/flux2) [klein] 4B, exécutés via diffusers, ComfyUI-GGUF ou stable-diffusion.cpp | Apache-2.0 / Apache-2.0 | oui (pas Qwen-Image-2.1 ; FLUX.2 en 4B et 4B Base seulement) | GGUF, à chronométrer ; klein 4B ≈ 8 Go annoncés | Z-Image en GGUF, lent | `6b5e1f5` / `26f23ed` / `50fe516` |
| **LoRA de personnages** | [DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | Apache-2.0 / selon le modèle | oui sous conditions | partiel (patch fp16 + LoRA fp32) | non | `4a2d8af` |
| **Metteur en scène** | [ViMax](https://github.com/HKUDS/ViMax) | MIT / aucun poids | oui | sans objet | oui (orchestration) | `fd4b72e` |
| **Post-production** | [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (sous-titres, encodage 9:16, mixage de la musique) | MIT (polices et musiques à supprimer) | oui sous conditions | inutile | oui | `4b7b965` |
| | [Practical-RIFE](https://github.com/hzwer/Practical-RIFE) (interpolation) | MIT / MIT (déclaré dans le README) | oui | oui | lent | `bbfd2ea` |
| | [ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler), CLI (agrandissement) | Apache-2.0 (sauf `color_fix.py`) / Apache-2.0 | oui sous conditions | oui en principe | non | `4490bd1` |
| **Contrôle qualité** | [VBench](https://github.com/Vchitect/VBench), à la carte | Apache-2.0 (+ RAFT BSD ; AMT, CoTracker, pyiqa, NudeNet exclus) | oui sous conditions | oui | plausible | `fd18b3d` |
| **Moteur pédagogique** | *à référencer* : [NanoI2V](https://github.com/Shubham2376G/NanoI2V), avec notre [`mini-moteur`](mini-moteur/) | MIT / pas de poids | — | — | tests de fumée | `3f47e2f` |

### Pourquoi ces choix, étape par étape

- **Moteur de base : Wan 2.2.** C'est le moteur ouvert dont la licence est la plus propre : Apache-2.0 pour le code et les poids,
  sorties laissées à l'utilisateur. Son code est court (57 fichiers Python, ≈ 19 000 lignes). TI2V-5B est le seul modèle Apache
  de cette famille plausible sur un T4 de 16 Go en 9:16 (704×1280) à partir d'une image de fiche personnage ; les 14B Apache
  (I2V-A14B, S2V, Animate) acceptent aussi le portrait (`wan/configs/__init__.py:43-49`), mais pas sur un T4.
  Le code officiel ne tourne pas tel quel sur T4 : FlashAttention-2 est appelé directement dans le DiT et le bf16 est imposé.
  Le fork doit remplacer `flash_attention` par `attention()` (SDPA), passer en fp16 et ajouter les tailles 480p.
  On ne garde que TI2V-5B : les modèles 14B (A14B, S2V, Animate) demandent 80 Go et plus.
  **diffusers** sert de châssis Python au futur `moteur_troupe.py` : pipelines Wan I2V (première et dernière image), VACE et Animate,
  chargement de LoRA dans les deux experts, délestage par groupes, GGUF.
- **Runner T4 : ComfyUI + ComfyUI-GGUF en voie principale.** Ce sont des licences standard (GPL-3.0 et Apache-2.0).
  ComfyUI passe automatiquement en fp16 sur T4 (sm_75), sait répartir les modèles sur les deux T4 de Kaggle, et prend en charge
  SCAIL-2, Wan-Animate-2, HuMo et SeedVR2 nativement. ComfyUI-GGUF fait tenir TI2V-5B en Q4 dans 16 Go ; pour les 14B,
  il faut en plus du délestage. **ComfyUI-WanVideoWrapper** apporte les nœuds One-to-All et InfiniteTalk : il est épinglé
  comme les autres, et ses workflows d'exemple doivent remplacer VideoHelperSuite (GPL-3.0) par les nœuds natifs
  `CreateVideo` + `SaveVideo`.
  **Wan2GP sert de voie rapide pour démarrer** : un seul programme couvre FastWan 5B, InfiniteTalk, MultiTalk, Qwen3-TTS,
  Chatterbox et ACE-Step, et la recette Wan2GP-on-Colab est la seule à annoncer un chrono T4 (FastWan 5B seulement).
  Sa licence maison autorise nos vidéos, mais interdit de revendre ou de louer le moteur à d'autres créateurs. Il propose
  aussi beaucoup de modèles non commerciaux (MMAudio, YuE2, Qwen-Image-2.1, Flux3…) : liste blanche obligatoire (§ 4.2).
- **Route CPU : stable-diffusion.cpp.** C'est le seul moteur qui fait tourner Wan quantifié dans 15 Go de RAM sans PyTorch,
  et le même code compile pour les T4. Il a été mesuré (§ 5).
- **Personnages : SCAIL-2 d'abord.** On filme un comédien, et le modèle le transforme en personnage de la troupe.
  Les masques colorés (`scail_utils.py`) prévoient jusqu'à 6 identités par plan (le modèle n'a été montré qu'avec 2), et le découpage en segments de 81 images couvre
  des sketches de 25 à 60 s. Mais c'est un 14B : sa tenue sur un T4 n'est **pas prouvée** (jetons de référence et de pose
  en plus de la vidéo, § 7). **One-to-All** est la base Apache qui fournit en plus le code d'entraînement et des données
  cartoon : c'est elle qu'on affinera sur la troupe. **VideoX-Fun** est le plan le plus sûr pour le T4, car il tourne sur la
  base 5B déjà choisie : Wan2.2-Fun-5B-Control suit la pose d'un comédien à partir de l'image de référence du personnage,
  Wan2.2-Fun-5B-InP enchaîne les plans par première et dernière image, et le dépôt fournit l'entraînement de LoRA et de
  LoRA de contrôle.
- **Voix : Qwen3-TTS pour créer les 54 voix** (VoiceDesign, puis une voix figée par personnage ; français confirmé), et
  **Chatterbox** pour la conversion de voix : un comédien joue la réplique avec l'accent ivoirien, Chatterbox lui donne
  la voix du personnage en gardant le timing. À valider par un test d'écoute.
- **Lèvres : InfiniteTalk et HuMo-1.7B en A/B.** InfiniteTalk fait parler jusqu'à 2 locuteurs par passe et redouble un plan,
  mais son encodeur audio est entraîné sur du mandarin et sa base 14B est lourde pour un T4. HuMo-1.7B prend texte, image
  de référence et audio en une passe, avec un encodeur Whisper multilingue, et pèse 3,5 Go en fp16 : c'est le candidat le
  mieux fondé pour le français, à départager à l'écoute sur les mêmes répliques. **MuseTalk** sert à retoucher une bouche
  après coup, un visage à la fois.
- **Musique et ambiance : ACE-Step 1.5** (MIT pour le code et les poids) compose des fonds musicaux et des jingles, avec
  ou sans paroles, en moins de 4 Go de VRAM annoncés. Il remplace les 29 musiques de MoneyPrinterTurbo, à supprimer.
  Les autres générateurs de son examinés sont exclus : MMAudio et YuE2 (poids CC BY-NC), ThinkSound (« Commercial use is NOT
  permitted »), Stable Audio (licence communautaire avec plafond). Pour les bruitages, aucun générateur ouvert
  commercialement propre n'a été trouvé : prendre des bibliothèques CC0 (packs audio de Kenney, Freesound filtré sur CC0)
  et mixer avec MoneyPrinterTurbo (`bgm_file`, `bgm_volume`) ou FFmpeg.
- **Planches et images clés : Qwen-Image-Edit-2511, Z-Image et FLUX.2 [klein] 4B** sont les bons modèles, sous Apache-2.0.
  Mais leurs dépôts GitHub ne contiennent que des démos ou du code de référence en bf16 : le vrai code est dans diffusers,
  ComfyUI(-GGUF) et stable-diffusion.cpp. D'où le verdict « à référencer seulement ». Sur T4, Qwen-Image-Edit-2511 est un DiT
  de 20B (GGUF de 9,9 à 12,4 Go, fp16 exclu par ComfyUI) et Z-Image donne des images noires en fp16 ; FLUX.2 [klein] 4B
  (≈ 3,9 G paramètres, « ~8GB VRAM », édition multi-références) est à mettre en banc contre eux. Règle : klein **4B** ou
  **4B Base** seulement, jamais 9B ni [dev] (non commerciaux).
- **LoRA : DiffSynth-Studio**, un seul outil sous Apache-2.0 pour entraîner des LoRA Wan, Z-Image et Qwen-Edit.
  Il faut le patcher pour le T4 (fp16, LoRA en fp32). musubi-tuner reste un plan B, mais il n'a pas de LICENSE à la racine.
- **Metteur en scène : ViMax** (MIT), qui sépare la planification (personnages, storyboard, plans) du rendu.
  Il faut l'adapter : 9:16, champs de réplique et de durée, adaptateurs Wan.
- **Post-production** : les fonctions de sous-titres, d'encodage et de mixage de MoneyPrinterTurbo (avec `bgm_file` explicite,
  puisque `resource/songs` est supprimé), Practical-RIFE pour passer de 16 à 32 i/s, SeedVR2 pour agrandir vers 1080×1920.
- **Contrôle qualité** : quatre mesures de VBench copiées à la carte, plus `i2v_subject.py` pour comparer chaque plan à la planche du personnage.
- **Moteur pédagogique** : NanoI2V se lit pour comprendre la recette (VAE causal 3D, DiT, flow matching). Notre propre
  [`mini-moteur`](mini-moteur/) joue ce rôle dans ce dépôt.

---

## 3. Tous les dépôts vérifiés

### 3.1 Les 27 dépôts retenus

Champ complet (conditions, détails T4 et CPU) : [`vendor/moteurs.json`](vendor/moteurs.json).

| # | Dépôt | Étape | Verdict | Licence (code / poids) | Usage commercial | T4 | CPU | Commit (date) |
|---|---|---|---|---|---|---|---|---|
| 1 | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | moteur de base | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | non tel quel (FA2, bf16) ; patch plausible | non | `1ea34ff` (2026-09-21) |
| 2 | [huggingface/diffusers](https://github.com/huggingface/diffusers) | moteur de base (châssis) | **à dupliquer** | Apache-2.0 (sauf Bria FIBO, DiT) / Apache-2.0 | oui sous conditions | partiel | tests de fumée | `af4271c` (2026-10-15) |
| 3 | [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | runner T4 | **à dupliquer** | GPL-3.0 / Apache, MIT | oui | oui, avec réserves | développement | `5a66589` (2026-10-15) |
| 4 | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | runner T4 | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | oui (gain mémoire, pas vitesse) | lent | `6ea2651` (2026-01-12) |
| 5 | [kijai/ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) | runner T4 (nœuds) | **à dupliquer** (dépendance épinglée) | Apache-2.0, sous-dossiers mixtes / GGUF Apache | oui sous conditions | prévu (sdpa, fp16, échange de blocs), non mesuré | non | `088128b` (2026-05-24) |
| 6 | [deepbeepmeep/Wan2GP](https://github.com/deepbeepmeep/Wan2GP) | runner T4 | **à dupliquer** | WanGP CL 2.0 / Apache-2.0, MIT | oui sous conditions | partiel : FastWan 5B seul annoncé (tiers), autres non prouvés | non | `de302ee` (2026-10-16) |
| 7 | [Square-Zero-Labs/Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab) | notebook gratuit | **à dupliquer** | Apache-2.0 (notebook) ; moteur WanGP CL 2.0 | oui sous conditions | oui, FastWan 5B 480p | non | `e428b5e` (2026-08-31) |
| 8 | [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | route CPU | **à dupliquer** | MIT / Apache-2.0 | oui | oui (à compiler) | **oui, mesuré** | `8cd731e` (2026-10-16) |
| 9 | [zai-org/SCAIL-2](https://github.com/zai-org/SCAIL-2) | personnages, animation | **à dupliquer** | Apache-2.0 / MIT | oui sous conditions | non prouvé (GGUF + délestage partiel) | non | `78fe195` (2026-08-24) |
| 10 | [ssj9596/One-to-All-Animation](https://github.com/ssj9596/One-to-All-Animation) | personnages, animation | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | via WanVideoWrapper (épinglé) | pose seulement | `b3c9d88` (2026-04-19) |
| 11 | [aigc-apps/VideoX-Fun](https://github.com/aigc-apps/VideoX-Fun) | personnages, animation, enchaînement | **à dupliquer** | Apache-2.0 / Apache-2.0 (Fun-5B) | oui sous conditions | plausible, non mesuré | non | `13bb3c6` (2026-10-14) |
| 12 | [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image) | planches, images clés | **à référencer seulement** | Apache-2.0 / Apache-2.0 | oui | GGUF, non mesuré | non | `6b5e1f5` (2026-02-10) |
| 13 | [Tongyi-MAI/Z-Image](https://github.com/Tongyi-MAI/Z-Image) | planches, images clés | **à référencer seulement** | Apache-2.0 / Apache-2.0 | oui | GGUF (fp16 = images noires) | GGUF, lent | `26f23ed` (2026-02-09) |
| 14 | [black-forest-labs/flux2](https://github.com/black-forest-labs/flux2) | planches, images clés | **à référencer seulement** | Apache-2.0 / Apache-2.0 (klein 4B et 4B Base) | oui (4B seulement) | plausible (≈ 8 Go annoncés), non mesuré | GGUF, lent | `50fe516` (2026-03-12) |
| 15 | [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | voix française | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | oui en fp32 | oui, lent | `022e286` (2026-03-17) |
| 16 | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | voix française | **à dupliquer** | MIT / MIT | oui | oui | conversion de voix en lot | `5de7a54` (2026-07-21) |
| 17 | [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | lèvres | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | non tel quel ; base 14B GGUF + adaptateur, à mesurer | non | `50aa0a9` (2026-05-22) |
| 18 | [Phantom-video/HuMo](https://github.com/Phantom-video/HuMo) | lèvres (A/B) | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | plausible (1.7B fp16 3,5 Go), non mesuré | non | `845f447` (2026-01-26) |
| 19 | [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) | lèvres | **à dupliquer** | MIT / MIT | oui sous conditions | oui en fp16 | tests | `0a89dec` (2025-09-26) |
| 20 | [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) | musique et ambiance | **à dupliquer** | MIT / MIT | oui sous conditions (Content ID) | prévu (fp16 + eager), non mesuré | possible, lent | `ca1e85f` (2026-08-29) |
| 21 | [modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | LoRA | **à dupliquer** | Apache-2.0 / selon le modèle | oui sous conditions | partiel, à valider | non | `4a2d8af` (2026-10-15) |
| 22 | [HKUDS/ViMax](https://github.com/HKUDS/ViMax) | metteur en scène | **à dupliquer** | MIT / — | oui | sans objet | oui | `fd4b72e` (2026-09-30) |
| 23 | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | post-production | **à dupliquer** (partiel) | MIT / — | oui sous conditions | inutile | oui | `4b7b965` (2026-10-15) |
| 24 | [hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE) | interpolation | **à dupliquer** (fork corrigé) | MIT / MIT | oui | oui | lent | `bbfd2ea` (2026-08-27) |
| 25 | [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) | agrandissement | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | oui en principe | non | `4490bd1` (2025-12-24) |
| 26 | [Vchitect/VBench](https://github.com/Vchitect/VBench) | contrôle qualité | **à dupliquer** (à la carte) | Apache-2.0 (NudeNet AGPL exclu) / mixtes | oui sous conditions | oui | plausible | `fd18b3d` (2026-08-21) |
| 27 | [Shubham2376G/NanoI2V](https://github.com/Shubham2376G/NanoI2V) | moteur pédagogique | **à référencer seulement** | MIT / pas de poids | oui sous conditions | non réaliste | tests de fumée | `3f47e2f` (2026-07-18) |

Les 22 commits du premier passage ont été recoupés avec les clones de vérification ; les tags de production
diffusers v0.41.0 = `086bf95` et ComfyUI v0.41.1 = `45bf90d` sont exacts (`git ls-remote`). Les 5 dépôts ajoutés après
relecture (WanVideoWrapper, VideoX-Fun, FLUX.2, HuMo, ACE-Step-1.5) ont été clonés le 16/10/2026 à leur tête de branche,
LICENSE lu et commit relevé. Au dernier contrôle (16/10/2026), 23 des 27 commits épinglés étaient encore des têtes de
branche ; diffusers, ComfyUI, Wan2GP et DiffSynth-Studio ont avancé depuis l'audit, ce qui ne change rien à l'épinglage. Deux branches méritent d'être notées :
SCAIL-2 a pour branche par défaut `wan-scail2`, et ComfyUI a pour branche par défaut `master`.

### 3.2 Écartés (résumé)

La liste complète, avec une ligne par dépôt, est dans les notes `codes_a_dupliquer_*.md`.

| Motif | Dépôts |
|---|---|
| **Non commercial**, ou d'origine non commerciale | HoloCine, huobao-drama (CC BY-NC-SA) ; GIMM-VFI (S-Lab) ; TalkVerse (Snap) ; Self-Forcing (code issu de CausVid, CC BY-NC-SA) ; Open-Sora 2.0 (étape 1 partant de FLUX.1-dev) ; LatentSync, LivePortrait, Hallo3 (InsightFace) ; Piper (voix françaises dérivées de modèles non commerciaux) ; **son** : MMAudio (poids CC-BY-NC 4.0), ThinkSound (pas de LICENSE à la racine, README : « Commercial use is NOT permitted »), YuE2 (poids CC BY-NC 4.0) ; FLUX.2 [klein] 9B, 9B KV, 9B Base et FLUX.2 [dev] (FLUX Non-Commercial License) |
| **Exclusion de territoire** | HunyuanVideo-1.5, HunyuanVideo-Avatar, FramePack (poids dérivés de Hunyuan), MiniMax H3 |
| **Licence maison couvrant le code ou exigeant un compte** | LTX-2 / 2.3 / 2.5, LTX-Video 0.9.x, SkyReels V2/V3, CogVideoX-5B, SkyReels-A2 ; Stable Audio Open et Stable Audio 3 (licence communautaire Stability, plafond, accès restreint) |
| **Pas de licence** | daVinci-MagiHuman, UniAnimate-DiT, MovieAgent, AniMaker, WanGP-Kaggle, comfyui-kaggle, TeamAIQ, wan-2.2-animate-comfyui-kaggle ; poids sans licence : Animate-X, All-In-One-Deflicker ; musubi-tuner (pas de LICENSE à la racine, fichier dérivé d'AGPL) |
| **Copyleft qui contaminerait le moteur** | OpenMontage, AI Movie Studio 2, OneTrainer (AGPL) ; diffusion-pipe (GPL, plus tard) |
| **Trop gros ou matériel récent exigé** | Ovi, MAGI-1, Mochi 1, Step-Video-T2V, LongCat-Video, MAGREF, SeedVR officiel, FlashVSR, FlashVSR+, LightX2V, SD.Next, wan2.2-google-colab |
| **Provenance ou composants non commerciaux à éclaircir** | Kandinsky 6 (Lite 3B, code et poids MIT, mais VAE `AutoencoderKLHunyuanVideo` et VAE audio MMAudio embarqués, dont la provenance est à vérifier ; aucun chrono T4) |
| **Non mesurés, à surveiller** | Helios (« ~6GB of VRAM » annoncés avec délestage par groupes, base Wan2.1-14B, Apache-2.0 : aucune mesure T4), SANA-Video (pas encore évalué en détail) |
| **Doublons ou déjà couverts** | Wan2.1, VACE, Wan-Animate-2, MultiTalk, Phantom, EchoMimic V3 ; minRF, rectified-flow-pytorch, Latte ; ai-toolkit, finetrainers, FastVideo ; ComfyUI-MultiGPU (archivé), mmgp, SageAttention ; ComfyUI-Frame-Interpolation (embarque AMT, non commercial), VideoHelperSuite et KJNodes (GPL-3.0, remplacés par les nœuds natifs de ComfyUI), rife-ncnn-vulkan, FILM, Real-ESRGAN (repli) ; Flow, PenShot, MM-StoryAgent, Toonflow, Pixelle-Video, VideoClaw, FireRed-OpenStoryline, editly, MoviePy, auto-editor, OpenTimelineIO, Revideo/Remotion, wind-comic ; RAFT, UVQ, syncnet_python, VideoAlign, DefectVideoReward ; LingBot-Video, notebooks OpenVINO |

---

## 4. Pièges de licence

### 4.1 Pièges transversaux (ils reviennent dans plusieurs dépôts)

1. **CausVid est non commercial (CC BY-NC).** Il se cache dans la LoRA FusionX (citée par InfiniteTalk), dans le GGUF « Phantom 14B »,
   dans un notebook OpenVINO et dans `lightx2v/Wan2.1-T2V-14B-CausVid`. Règle : **jamais CausVid ni FusionX**.
2. **Les LoRA de `Kijai/WanVideo_comfy` n'ont aucune licence déclarée.** Prendre les mêmes LoRA à la source :
   `lightx2v/...` (Apache-2.0) ou `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` (Apache-2.0).
3. **YOLOv10 est sous AGPL-3.0**, même quand il est livré dans un dépôt étiqueté Apache (`Wan2.2-Animate-14B/process_checkpoint`).
   Il est utilisé par Wan2.2-Animate et One-to-All. Le remplacer par `yolox_l.onnx` (Apache). Même problème avec **ultralytics** (AGPL) dans SCAIL-Pose
   et dans `videox_fun/utils/utils_yolo.py` de VideoX-Fun, et avec **NudeNet** (AGPL-3.0, modèles YOLOv8 d'ultralytics) dont VBench commite
   l'ONNX `vbench2_beta_trustworthiness/third_party/nudenet/best.onnx` : exclure tout `vbench2_beta_trustworthiness/`.
4. **InsightFace est non commercial** (EchoMimic, LatentSync, LivePortrait, Hallo3, option `[infiniteyou]` de DiffSynth).
5. **Modèles non commerciaux chargeables par erreur** : FLUX.1-dev et FLUX.1-Kontext-dev (`--use_flux` de Wan2.2-Animate,
   GGUF cités en premier par ComfyUI-GGUF) ; Qwen-Image-2.1 (licence « qwen-research », pourtant mis en avant par DiffSynth et chargeable par diffusers) ;
   alias Qwen2.5-3B de Wan2.2 ; FLUX.2 [klein] 9B, 9B KV, 9B Base et FLUX.2 [dev] (FLUX Non-Commercial License), à côté de klein 4B
   et 4B Base qui sont Apache, et VAE de FLUX.2-dev renvoyé par `docs/flux2.md` de stable-diffusion.cpp (prendre le `vae/` de
   FLUX.2-klein-4B) ; dans Wan2GP : MMAudio, YuE2, Qwen-Image-2.1 et Flux3 (§ 4.2) ; dans VideoX-Fun : CogVideoX-5B,
   Qwen-Image-2.1, MiniMax-H3, HunyuanVideo, LTX-2.
6. **API payantes appelées par défaut** : DashScope (Wan2.2, SCAIL-2, InfiniteTalk, Qwen-Image), Gemini (SCAIL-2), Veo et Nano Banana (ViMax),
   nœuds « partner » de ComfyUI (`--offline`), générateurs sponsors de MoneyPrinterTurbo. Tous sont à couper.
7. **Comptes et accès restreints** : SAM3 (`facebook/sam3`), VAE FLUX.1-schnell renvoyé par la doc de Z-Image dans stable-diffusion.cpp,
   licence CogVideoX-5B. Il existe à chaque fois une copie ouverte (SAM2.1, `Comfy-Org/z_image_turbo`, Wan).
8. **Miroirs chinois codés en dur** : `HF_ENDPOINT=https://hf-mirror.com` (One-to-All, MuseTalk), `mirrors.aliyun.com`, `modelscope.cn` (DiffSynth). À retirer.
9. **Son : la plupart des générateurs ouverts sont non commerciaux.** MMAudio (poids CC-BY-NC 4.0, et un fichier de code
   `edm2_utils.py` en CC BY-NC-SA, repris par Wan2GP et par le module Ovi de WanVideoWrapper), ThinkSound, YuE2, Stable Audio
   (plafond). Seule ACE-Step 1.5 (MIT) est retenue, pour la musique ; les bruitages viennent de bibliothèques CC0.
10. **Voix et visages réels** : cloner la voix d'un comédien ou animer son visage exige son **consentement écrit**, quelle que soit la licence du code.
   Garder le filigrane Perth de Chatterbox, qui va dans le sens de l'étiquetage « contenu IA » de TikTok et de l'AI Act.

### 4.2 Pièges par dépôt

| Dépôt | Piège | Que faire |
|---|---|---|
| Wan2.2 | `--use_flux` (FLUX.1-Kontext-dev, NC) dans l'exemple « animation » du README ; YOLOv10 (AGPL) fourni avec Animate ; alias Qwen 3B (NC) ; `--enable_tts` clone et exécute CosyVoice au lancement | retirer `--use_flux` ; ne pas redistribuer `yolov10m.onnx` ; Qwen 7B/14B seulement |
| diffusers | 3 fichiers Bria FIBO sous CC-BY-NC-4.0 ; `pipeline_dit.py` (CC BY-NC) ; la doc Wan renvoie aux LoRA Kijai | ne pas vendoriser ces fichiers ; LoRA lightx2v |
| ComfyUI | GPL-3.0 : un fork **distribué** doit l'être sous GPL, et les nœuds maison distribués doivent avoir une licence compatible ; nœuds d'API payants ; `comfy-aimdo` « se réserve » de changer de licence | usage comme outil ; `--offline` ; épingler les versions |
| ComfyUI-GGUF | FLUX.1-dev GGUF (NC) cité en premier ; SD3.5 avec plafond ; Gemma Terms of Use ; mainteneur inactif, cassé sur les ComfyUI récents (#488) | GGUF QuantStack et city96 Apache seulement ; correctif #488 |
| ComfyUI-WanVideoWrapper | Ovi (`Ovi/vae/edm2_utils.py` en CC BY-NC-SA, audio issu de MMAudio) ; lynx (InsightFace buffalo, non commercial) ; FantasyPortrait (CC BY 4.0, deux ONNX de visage sans provenance) ; LoRA et conversions de `Kijai/WanVideo_comfy` sans licence ; workflows d'exemple dépendant de VideoHelperSuite et KJNodes (GPL-3.0) ; `base_precision` bf16 par défaut | nœuds Wan, GGUF, onetoall, multitalk, HuMo et SCAIL seulement ; nœuds natifs `CreateVideo` + `SaveVideo` / `LoadVideo` ; fp16 sur T4 ; GGUF `Kijai/WanVideo_comfy_GGUF` (Apache) |
| Wan2GP | licence maison : pas de revente, location, API ou SaaS ; mmgp de PyPI (≤ 3.8.x) ambigu. **Composants non commerciaux ou restreints embarqués ou proposés** : MMAudio (« generate soundtracks », poids CC-BY-NC 4.0, `postprocessing/mmaudio/ext/autoencoder/edm2_utils.py` en CC BY-NC-SA), YuE2 (poids CC BY-NC 4.0, mis en avant pour les chansons), Qwen-Image-2.1 (Qwen RESEARCH LICENSE), Flux3 (`WEIGHTS_LICENSE.md:27` : « Non-Commercial Use Only »), Fish Audio (plafond 500 000 USD), Hunyuan et MiniMax-H3 (territoire), Stable Audio 3 (licence communautaire), LTX-2 (plafond) ; IndexTTS2 et 2.5 : licence séparée au-delà de 100 M d'utilisateurs actifs mensuels ou 1 Md RMB de chiffre d'affaires (§ 2.2), interdiction d'améliorer un autre modèle avec (§ 3.4c) ; poids réhébergés `DeepBeepMeep/*` sans champ de licence | usage interne ; épingler `de302ee` ; **liste blanche seulement** : Wan/FastWan, InfiniteTalk/MultiTalk, Qwen3-TTS, Chatterbox, ACE-Step 1.5 (MIT, `models/TTS/ace_step15`) ; tout le reste est exclu par défaut (MiniMax Music 3, HeartMuLa, KugelAudio, OmniVoice, AuK non examinés). `models/recon3d` (MapAnything) n'est pas en cause : poids `map-anything-apache` et tête DPT réécrite à la place du code CroCo |
| Wan2GP-on-Colab | Apache ne couvre que le notebook ; FFmpeg « -gpl » ; Gradio `--share` interdit sur Colab gratuit | mode `--process` sur Kaggle ; ne pas redistribuer FFmpeg |
| stable-diffusion.cpp | la doc Z-Image renvoie au VAE FLUX.1-schnell (compte) ; vocabulaires Gemma embarqués | `Comfy-Org/z_image_turbo` ; fork allégé si redistribué |
| SCAIL-2 | mode pose : poids NLF (NC) ; e2e : ultralytics (AGPL) + SAM3 (restreint) ; Gemini, DashScope ; SCAIL-2-Tuner sans licence | e2e seulement, avec SAM2.1 (Apache) |
| One-to-All | Naver CroCo (CC BY-NC-SA) dans `opensora/.../pos_embed.py` et `curope/` ; Poseur et SMPL-X (NC) dans `benchmark/` ; médias tiers (photo d'une personne réelle, vidéo Douyin) ; YOLOv10 ; jeu de données aux droits incertains | fork élagué (supprimer ces dossiers), `yolox_l` |
| VideoX-Fun | le même code charge CogVideoX-5B (CogVideoX LICENSE, README:673), Qwen-Image-2.1, MiniMax-H3, HunyuanVideo, LTX-2 et FLUX.2 [dev] ; `utils_yolo.py` (ultralytics, AGPL, yolov8x-seg téléchargé depuis un OSS aliyun) ; bf16 par défaut ; médias de démonstration dans `asset/` | Wan2.2-Fun-5B (InP, Control, Control-Camera) et Wan seulement ; `weight_dtype = torch.float16` ; notre propre extraction de pose ; ne pas redistribuer `asset/` |
| InfiniteTalk | FusionX (CausVid) ; `quant_models/*_lora` (LoRA inconnue) ; Kokoro et StyleTTS2 vendorisés sans LICENSE | exclure ; ajouter les mentions |
| HuMo | séparateur vocal `huangjackson/Kim_Vocal_2` sans licence déclarée ; `flash_attn==2.6.3` et bf16 en dur dans le code natif ; médias de démonstration dans `examples/` | dialogue propre sans séparateur ; ComfyUI natif (`WanHuMoImageToVideo`) ou WanVideoWrapper ; repack `Comfy-Org/HuMo_ComfyUI` (Apache) |
| MuseTalk | BiSeNet `79999_iter.pth` (CelebAMask-HQ, NC) **obligatoire** dans `blending.py` ; médias de test NC ; S3FD sans licence de poids ; tag HF `creativeml-openrail-m` avant le 22/09/2026 | masque maison ; cadres des visages fournis par notre compositing ; révision HF récente |
| ACE-Step-1.5 | plagiat involontaire possible (README l. 297), donc revendications Content ID ; bascule vers ModelScope si google.com est injoignable ; `nano-vllm` exige flash-attn (pas sur T4) | pas de mode cover ou repaint sur un morceau existant, pas d'artiste nommé dans le prompt, ne pas déposer nos pistes dans un système d'identification de contenu ; téléchargement Hugging Face forcé ; `--backend pt` |
| Qwen3-TTS | GGUF ggml-org sans licence déclarée | dérivé de poids Apache : acceptable, à noter |
| Chatterbox | `pykakasi` (GPL-3.0+) dans les dépendances ; `resemble-perth` tiré de `git@master` | retirer pykakasi ; `resemble-perth==1.0.1` |
| Qwen-Image | Qwen-Image-2.1 (NC) ; réécriture de prompt DashScope (payante, boucle infinie sans clé) | Edit-2511 seulement |
| Z-Image | le VAE se déclare « flux-dev », mais il est **identique bit à bit** à celui de FLUX.1-schnell (Apache) | aucun problème, vérifié |
| FLUX.2 (klein) | klein 9B, 9B KV, 9B Base et [dev] sous FLUX Non-Commercial License, dans le même tableau que les 4B Apache ; `docs/flux2.md` de stable-diffusion.cpp renvoie au VAE de FLUX.2-dev (accès restreint) ; code de référence en bf16 | **4B ou 4B Base seulement** ; VAE de FLUX.2-klein-4B ou FLUX.2-small-decoder (Apache) ; diffusers, ComfyUI ou stable-diffusion.cpp |
| DiffSynth-Studio | Qwen-Image-2.1 (NC), MiniMax-H3 (territoire), Krea-2, InfiniteYou (insightface) proposés dans le même dépôt | ne jamais les activer |
| ViMax | réglages par défaut payants ; palier gratuit Gemini = données utilisées pour l'entraînement | choisir le LLM avec soin |
| MoneyPrinterTurbo | polices propriétaires (STHeiti par défaut, Microsoft YaHei) ; 29 musiques venues de YouTube ; Edge TTS non officiel ; SDK Azure propriétaire | supprimer `resource/fonts` (sauf OFL) et `resource/songs` ; musique : ACE-Step 1.5 passée en `bgm_file` (le `bgm_type` « random » par défaut puise dans `resource/songs`) |
| Practical-RIFE | licence des poids affirmée seulement par le README ; zip avec `.pyc` et pickle | archiver le README ; torch ≥ 2.6 ou sources vsrife |
| SeedVR2 (numz) | `color_fix.py` dérivé de StableSR (S-Lab, NC), utilisé par le réglage par défaut `lab` ; deux tenseurs picklés commités (`pos_emb.pt`, `neg_emb.pt`, chargés en `weights_only=True`) | `--color_correction hsv` ou `none`, puis réécriture en salle blanche |
| VBench | `pip install vbench` installe pyiqa (PolyForm NC) ; AMT et CoTracker (CC BY-NC) ; poids RAFT « research only » ; fiche CLIP « deployed use out of scope » ; détecteur NudeNet (AGPL-3.0) commité en ONNX dans `vbench2_beta_trustworthiness/` | copie à la carte (sans `vbench2_beta_trustworthiness/`), contrôle qualité interne seulement |
| NanoI2V | encodeur CLIP-L (même réserve) ; VIDGEN-1M (droits YouTube) ; `weights_only=False` | SigLIP ; nos propres données et checkpoints |

---

## 5. Résultat du banc CPU (conteneur, 16/10/2026)

**Oui, un vrai moteur vidéo ouvert tourne gratuitement sur le CPU du conteneur** (4 cœurs, 15 Go de RAM, sans GPU).
stable-diffusion.cpp (`8cd731e`, MIT), compilé depuis la source en 4,5 min, a fait tourner Wan2.1-T2V-1.3B en GGUF Q8_0
(Apache-2.0) avec umT5-XXL Q4_K_M, le VAE Wan 2.1, le décodeur rapide TAEHV (MIT) et une LoRA DMD 4 pas (Apache-2.0).
5,64 Go de poids ont été téléchargés, chaque SHA-256 contrôlé, puis supprimés après le banc.
Toutes les licences permettent l'usage commercial des vidéos.

| Essai | Taille | Réglage | Threads | Temps total | Pic de RAM |
|---|---|---|---|---|---|
| 1 | 256×448, 9 images | 10 pas, CFG 6, VAE complet | 2 | 21,3 min | 10,05 Go |
| 2 | 256×448, 9 images | LoRA 4 pas, CFG 1, VAE complet | 2 | 7,7 min | 10,22 Go |
| 3 | 256×448, 9 images | LoRA 4 pas + décodeur TAE | 2 | 4,9 min | 7,38 Go |
| 4 | 320×576, 17 images | LoRA 4 pas + VAE complet en tuiles | 4 puis machine chargée | 28,3 min | 8,42 Go |
| **5** | **320×576, 33 images (2,06 s)** | LoRA 4 pas + TAE | 2 | **24,3 min** | 10,10 Go |

Un entraînement `minimoteur` tournait en parallèle : les temps sont pessimistes.

- **Leviers mesurés** : la LoRA 4 pas divise le temps de diffusion par 4,4 ; le décodeur TAE est environ 7 fois plus rapide
  que le VAE complet, pour un rendu presque identique.
- **Extrapolation** (modèle de coût ajusté sur ces mesures, **non mesuré**) : ≈ 15 min de calcul par seconde de vidéo en 320×576
  sur 2 threads, soit ≈ 74 min par plan de 5 s, ≈ 3,9 h en 480×832, ≈ 7,5 h pour un sketch de 30 s (≈ 4 h avec 4 threads libres).
- **Qualité** : le style cartoon 3D façon Pixar est réussi, le geste est fluide et le visage stable dans un même clip.
  En revanche, la définition est très basse (agrandissement ×3,3 nécessaire), la main se brouille pendant le geste, et surtout
  **chaque graine invente un nouveau visage** : sans image de référence ni LoRA, l'identité des 54 personnages n'est pas tenue.
  Pas de son ni de lèvres ; un seul personnage testé. La LoRA DMD est un point de contrôle expérimental (itération 1 600 sur 3 000).
- **Conclusion** : le CPU sert aux aperçus nocturnes, aux tests de prompts et aux animatiques basse définition.
  La production (720p, lèvres, 2 à 4 personnages) se fait sur Kaggle T4.
- **Suite du banc** : tester Wan2.1-VACE-1.3B (vidéo à partir de la fiche d'un personnage) ou Wan2.2-TI2V-5B en GGUF, avec le même binaire.

Détails, vidéos, commandes exactes et sommes de contrôle : [`banc-cpu/README.md`](banc-cpu/README.md).

---

## 6. Comment dupliquer

### 6.1 Les options

| | Fork sur GitHub | Sous-module git | Copie dans ce dépôt (vendoring) | **Script de clone épinglé** (retenu) |
|---|---|---|---|---|
| Version figée | oui, si on la note | oui (SHA dans l'index) | oui | oui (SHA complet dans `moteurs.json`, vérifié après extraction) |
| Poids de notre dépôt | nul | faible, mais `clone --recursive` tire ≈ 1 Go de code tiers | **≈ 1,2 Go** de fichiers, plus l'historique | nul (`src/` est ignoré par git) |
| Redistribution du code tiers | oui, publiquement, sous notre compte | non (simple pointeur) | **oui, publiquement, dans notre dépôt** | non |
| Fichiers non commerciaux, polices, musiques et médias tiers embarqués | nous les republions | non | **nous les republions** | non |
| Correctifs locaux (fp16, SDPA…) | oui (branche) | non sans fork | oui, mais mêlés au code tiers | oui, en fichiers `.patch` séparés (à venir) |
| Ne prendre qu'une partie | non (tout l'historique suit) | non | oui | oui (`--seul NOM`) |
| Utilisable dans un notebook Kaggle | oui | lourd | oui | oui, en une ligne |
| Métadonnées (licence, conditions, verdict) | non | non | à écrire | oui, dans le même fichier |
| Si l'auteur supprime son dépôt | notre fork survit | cassé | survit | cassé (archive privée à prévoir) |

### 6.2 Pourquoi on ne copie pas le code tiers en bloc dans ce dépôt public

1. **Copier, c'est redistribuer**, et chaque licence a alors ses obligations : notices et fichiers modifiés signalés (Apache),
   source complète sous GPL-3.0 (ComfyUI), LICENSE et modifications datées (Wan2GP).
2. **Plusieurs dépôts « propres » contiennent des fichiers qu'on n'a pas le droit de republier** : fichiers non commerciaux
   (Bria FIBO dans diffusers, Naver CroCo dans One-to-All, `color_fix.py` de SeedVR2, AMT, CoTracker et NudeNet dans VBench,
   `edm2_utils.py` de MMAudio dans Wan2GP et WanVideoWrapper),
   polices propriétaires et musiques tirées de YouTube (MoneyPrinterTurbo), photo d'une personne réelle et vidéo Douyin (One-to-All).
   Une copie en bloc ferait de nous leur distributeur public.
3. **Le volume** : environ 1,2 Go de fichiers pour les 23 dépôts (estimation d'après les tailles mesurées, plus l'historique),
   alors que ce dépôt sert aussi de site (`index.html`). GitHub refuse les fichiers de plus de 100 Mo.
4. **La traçabilité** : un SHA épinglé prouve exactement quelle version a été auditée. Une copie retouchée à la main perd ce lien.
5. **La sécurité** : c'est du code non relu ligne à ligne. Il reste dans `vendor/src/`, hors de notre historique.

**Quand forker quand même ?** Seulement pour les dépôts qu'on patche réellement (Wan2.2 pour SDPA et fp16, InfiniteTalk,
ComfyUI-GGUF #488, SeedVR2 `color_fix.py`, Practical-RIFE, Chatterbox), et de préférence **en privé**, ou sous forme de petits
fichiers `.patch` rangés dans `vendor/patches/<nom>/` et appliqués après récupération. Un patch suit la licence du fichier qu'il modifie
(GPL-3.0 pour ComfyUI, Apache-2.0 avec mention de modification pour Wan). Pour les dépôts critiques dont l'auteur peut disparaître
(ComfyUI-GGUF, ComfyUI-WanVideoWrapper, Wan2GP), garder une archive privée (`git bundle`) dans un jeu de données Kaggle privé.

### 6.3 Utiliser `vendor/recuperer.sh`

```bash
cd studio-troupe/vendor
bash recuperer.sh --liste              # la liste, sans rien télécharger
bash recuperer.sh --seul ComfyUI-GGUF  # un seul dépôt, dans vendor/src/ComfyUI-GGUF
bash recuperer.sh                      # les 23 dépôts « à dupliquer » (≈ 1,2 Go de fichiers, prévoir ≈ 2 Go)
MOTEURS_SRC=/kaggle/working/src bash recuperer.sh --seul Wan2GP   # ailleurs, par exemple sur Kaggle
```

Ce que fait le script, pour chaque dépôt « à dupliquer » :
`git init`, puis `git fetch --depth 1 origin <sha>`, puis `git checkout --no-overwrite-ignore --detach FETCH_HEAD`, puis vérification
que `HEAD` vaut bien le SHA attendu.

- Il lit `moteurs.json` avec `python3 -I` (pas de jq) et refuse un nom, une URL (GitHub seulement) ou un commit (SHA complet) mal formés.
- Il ne télécharge **aucun poids hors des dépôts git** (`GIT_LFS_SKIP_SMUDGE=1`, aucun appel à Hugging Face) et n'exécute **rien**
  (ni build, ni pip, ni hook git). Mais quelques dépôts commitent des fichiers de modèle, qui arrivent avec le code : VBench embarque
  l'ONNX de NudeNet (`best.onnx`, 12 Mo, AGPL, à ne pas utiliser), SeedVR2 deux embeddings `.pt` (595 et 657 Ko), WanVideoWrapper
  deux ONNX de visage (FantasyPortrait, exclu) et `encoded_silence.safetensors`. Une extraction partielle (sparse checkout) de VBench
  reste à écrire.
- Il ignore les variables `GIT_DIR`, `GIT_WORK_TREE` et apparentées héritées du shell (hook git, tâche d'IDE, CI) : sans cela,
  chaque `git -C` aurait agi sur le dépôt extérieur.
- Il est **idempotent** : un dossier déjà au bon commit est laissé tel quel ; un dossier avec des modifications locales ou des
  fichiers non suivis n'est pas mis à jour ; un fichier **ignoré** par git (poids posés dans `models/`, `ckpts/`, `pretrained_models/`)
  n'est jamais écrasé : si le nouveau commit suit un fichier du même nom, l'extraction s'arrête et le script dit quoi déplacer.
- Il **reprend** un dossier vide créé à l'avance et un clone interrompu avant l'extraction ; si l'extraction a été interrompue
  (fichiers présents mais aucun commit), il refuse et indique de supprimer le dossier.
- Il ne récupère pas les **sous-modules** (stable-diffusion.cpp, SCAIL-2) et affiche la commande pour le faire.
- Il ne récupère jamais les dépôts « à référencer seulement » (code de sortie 4, avec le lien de lecture).

Vérifié le 16/10/2026 : `--liste`, puis `--seul ComfyUI-GGUF` (164 Ko, HEAD = `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`),
relance sans effet, refus d'écraser une modification locale, mise à jour depuis un autre commit, refus des noms inconnus et des
dépôts à référencer, rejet d'un `moteurs.json` falsifié. Après relecture, dans un bac à sable : lancement avec `GIT_DIR` et
`GIT_WORK_TREE` pointant vers un autre dépôt (dépôt extérieur intact : `origin` et `HEAD` inchangés, clone complet avec son `.git`),
dossier vide créé à l'avance (repris), clone interrompu avant extraction (repris), extraction interrompue (refus avec la marche
à suivre), fichier ignoré qui serait écrasé par le nouveau commit (extraction arrêtée, contenu conservé, puis mise à jour une fois
le fichier déplacé). Les dossiers de test ont été supprimés.

---

## 7. Prochaines étapes conseillées

1. **Première session Kaggle (mesurer avant de construire)** : Wan2GP + recette Wan2GP-on-Colab adaptée en `--process`
   (FastWan 5B, 480p, 9:16) et ComfyUI + ComfyUI-GGUF (TI2V-5B Q4_K_M). Noter le temps par plan, la VRAM, la RAM et la version du pilote.
   La RAM hôte d'une session T4×2 est annoncée à ≈ 29 Go par des tiers, sans confirmation officielle : la relever (`free -g`, `nproc`)
   dès la première session, car tout le délestage des 14B en dépend.
2. **Voix** : créer 3 voix de test avec Qwen3-TTS VoiceDesign, puis tester la conversion de voix Chatterbox sur des répliques
   jouées avec l'accent ivoirien.
3. **Personnages** : SCAIL-2 sous ComfyUI sur un plan de 2 personnages filmé au téléphone. Sa tenue sur T4 n'est **pas prouvée** :
   en 512×896×81, la référence et la pose ajoutent ≈ 49 % de jetons (≈ 48 800 contre 32 760 pour le 832×480×81 où un 14B Q4_K_M de
   9,7 Go culminait déjà à 14,9 Gio), et SCAIL-2-Q4_K_M pèse 10,86 Go. Premier essai en **Q3_K_M (8,11 Go) et/ou 384×672**
   (≈ 27 500 jetons), ou avec le streaming des poids de ComfyUI, encodeurs sur le 2e T4 ; aucune durée par segment n'est avancée
   avant cette mesure. En parallèle, **VideoX-Fun** Wan2.2-Fun-5B-Control avec l'image de référence du personnage, et 5B-InP
   pour enchaîner deux plans par première et dernière image.
4. **Lèvres** : **A/B InfiniteTalk contre HuMo-1.7B** sur les mêmes répliques françaises et le même personnage cartoon.
   InfiniteTalk : base Wan2.1-I2V-14B-480P en Q3_K_M (8,59 Go) + adaptateur Q4_K_M (1,40 Go), ou Q4 avec échange de blocs, via
   ComfyUI-WanVideoWrapper épinglé (ou Wan2GP). HuMo-1.7B : ComfyUI natif, repack fp16 (3,5 Go + Whisper 3,1 Go). Juger la
   synchronisation à l'œil et à l'oreille, puis MuseTalk en retouche.
5. **Planches** : banc FLUX.2 [klein] 4B contre Qwen-Image-Edit-2511 (GGUF) sur T4 : fiches personnages et images clés à
   plusieurs références, temps et VRAM.
6. **Musique et ambiance** : ACE-Step 1.5 (`--backend pt`) sur T4 ou CPU, trois fonds de 30 s ; bruitages CC0 ; mixage par
   MoneyPrinterTurbo (`bgm_file`, `bgm_volume`) ou FFmpeg.
7. **Identité** : sur le CPU, Wan2.1-VACE-1.3B avec une fiche personnage ; sur Kaggle, une première LoRA de personnage avec DiffSynth patché
   ou avec les scripts LoRA de VideoX-Fun sur Wan2.2-Fun-5B.
8. **Fork** : ouvrir `vendor/patches/` pour les premiers correctifs (SDPA et fp16 dans Wan2.2, #488 dans ComfyUI-GGUF).

## Fichiers

- `studio-troupe/MOTEURS-A-DUPLIQUER.md` : ce document.
- `studio-troupe/vendor/moteurs.json` : les 27 dépôts retenus (nom, url, commit, date, étape, licence, usage commercial, conditions, T4, CPU, verdict).
- `studio-troupe/vendor/recuperer.sh` : récupération des dépôts au commit épinglé (`--liste`, `--seul NOM`).
- `studio-troupe/vendor/.gitignore` : ignore `src/`, où atterrissent les clones.
- `studio-troupe/banc-cpu/` : le banc CPU (§ 5).
