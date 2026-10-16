# Moteurs à dupliquer pour la troupe

> État au **16/10/2026**. Réponse à la demande « cherche des codes moteurs à dupliquer ».
> **22 dépôts vérifiés un par un** : clone local, fichier de licence lu, code clé lu (les références `fichier:ligne`
> sont dans [`vendor/moteurs.json`](vendor/moteurs.json)), licences des poids lues sur l'API Hugging Face, commit épinglé.
> Aucun code tiers n'a été exécuté et aucun poids n'a été téléchargé, sauf pour le banc CPU (§ 5), où
> stable-diffusion.cpp a été compilé et lancé exprès.
> Notes détaillées : `research_notes/Moteurs vidéo IA pour la troupe/codes_a_dupliquer_*.md`.
> Ce document n'est pas un avis juridique : c'est une lecture attentive des licences, à faire confirmer avant un gros enjeu commercial.

## En bref

- **Il n'existe pas de « Veo 3 ouvert » à copier tel quel.** Le moteur de la troupe s'assemble en chaîne :
  un cœur vidéo (**Wan 2.2**), un exécutant basse mémoire pour les T4 de Kaggle (**ComfyUI + ComfyUI-GGUF**, ou **Wan2GP**),
  l'animation des personnages (**SCAIL-2**, **One-to-All**), la voix française (**Qwen3-TTS**, **Chatterbox**),
  les lèvres (**InfiniteTalk**, **MuseTalk**), puis le montage et le contrôle qualité.
- **Verdicts : 19 dépôts à dupliquer, 3 à référencer seulement** (Qwen-Image, Z-Image, NanoI2V), environ 80 écartés (§ 3.2).
- **Tous les dépôts retenus autorisent l'usage commercial du code et des vidéos produites**, sans exclusion de territoire
  ni plafond de revenus. Mais presque chacun cache **un piège** : fichier non commercial embarqué, détecteur sous AGPL,
  LoRA sans licence, API payante appelée par défaut. Ces pièges sont recensés au § 4 et dans le champ `conditions` de `moteurs.json`.
- **Le CPU du conteneur fait tourner un vrai moteur** (stable-diffusion.cpp + Wan2.1 1,3B) : 2 s de vidéo 9:16 en 24 min.
  Il est utile pour les aperçus, pas pour la production, qui se fait sur Kaggle T4.
- **Rien n'a encore été chronométré sur T4 par nous.** Le seul chiffre T4 disponible est annoncé par un tiers :
  ≈ 8 min par clip de 5 s en 480p (FastWan 5B, recette Wan2GP-on-Colab). La première session Kaggle doit servir à mesurer.
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
| CC BY-NC, S-Lab, PolyForm Noncommercial, « qwen-research », FLUX.1-dev | recherche, usage personnel | **pas d'usage commercial** | ✘ |
| Licences avec territoire (Tencent Hunyuan, MiniMax H3) | usage hors des pays exclus | exclusion de l'UE, du Royaume-Uni, etc. | ✘ (TikTok vu en France) |
| Licences communautaires avec plafond (LTX, Fish Audio, SD3.5) | usage commercial sous un plafond de revenus | mentions, plafond | à éviter, on n'en a pas besoin |
| **Aucune licence** | rien : tous droits réservés | — | ✘ (lecture seulement) |

**Règle retenue :** une brique n'entre dans le moteur que si ses trois couches sont MIT, BSD ou Apache (ou équivalent),
ou si c'est un outil GPL-3.0 que l'on exécute sans le redistribuer, ou Wan2GP en usage interne.

---

## 2. La pile recommandée

```
 script ─► planches et images clés ─► voix FR ─► animation des personnages ─► lèvres ─► fluidité et 1080p ─► montage ─► contrôle
 ViMax     Qwen-Image-Edit-2511       Qwen3-TTS   SCAIL-2 / One-to-All        Infinite-  RIFE + SeedVR2      MoneyPrinter  VBench
           Z-Image (via diffusers,    Chatterbox  Wan 2.2 TI2V-5B             Talk                           Turbo         (à la carte)
           GGUF)                      (VC)                                    MuseTalk
 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 exécuté par : ComfyUI + ComfyUI-GGUF (ou Wan2GP) sur Kaggle 2×T4  ·  stable-diffusion.cpp sur le CPU du conteneur (aperçus)
 LoRA de personnages : DiffSynth-Studio  ·  code de référence et châssis Python : Wan2.2 + diffusers
```

| Étape | Code à dupliquer | Licence code / poids | Usage commercial | T4 (Kaggle) | CPU (conteneur) | Commit épinglé |
|---|---|---|---|---|---|---|
| **Moteur de base** | [Wan2.2](https://github.com/Wan-Video/Wan2.2) (code de référence TI2V-5B) | Apache-2.0 / Apache-2.0 | oui sous conditions | pas tel quel ; fork patché (SDPA, fp16, 480p) plausible | non | `1ea34ff` (21/09/2026) |
| | [diffusers](https://github.com/huggingface/diffusers) (châssis Python) | Apache-2.0 (3 fichiers NC à exclure) / Apache-2.0 | oui sous conditions | partiel (SDPA ; fp16 non documenté) | tests de fumée | `af4271c` (prod : tag v0.41.0 = `086bf95`) |
| **Runner T4** | [ComfyUI](https://github.com/Comfy-Org/ComfyUI) + [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | GPL-3.0 + Apache-2.0 / Apache, MIT | oui | oui, avec réserves (pilote, cu130) | développement seulement | `5a66589` (prod : v0.41.1 = `45bf90d`) + `6ea2651` |
| | voie rapide : [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) + [Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab) | WanGP CL 2.0 (+ Apache pour le notebook) / Apache-2.0 | oui sous conditions (pas de revente) | oui en 480p ; ≈ 8 min par 5 s annoncés | non | `de302ee` + `e428b5e` |
| **Route CPU** | [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | MIT / Apache-2.0 | oui | oui (à compiler) | **oui, mesuré** | `8cd731e` (16/10/2026) |
| **Personnages et animation** | [SCAIL-2](https://github.com/zai-org/SCAIL-2) | Apache-2.0 / MIT | oui sous conditions (mode e2e) | via ComfyUI + GGUF Q4 | non | `78fe195` |
| | [One-to-All-Animation](https://github.com/ssj9596/One-to-All-Animation) | Apache-2.0 / Apache-2.0 | oui sous conditions (fork élagué) | via WanVideoWrapper, 1.3B fp16 | prétraitement de pose | `b3c9d88` |
| **Voix française** | [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | Apache-2.0 / Apache-2.0 | oui | oui en fp32 | oui, lent | `022e286` |
| | [Chatterbox](https://github.com/resemble-ai/chatterbox) (TTS V3 et conversion de voix) | MIT / MIT | oui | oui | conversion de voix en lot (non mesuré) | `5de7a54` |
| **Lèvres** | [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | Apache-2.0 / Apache-2.0 | oui | pas tel quel ; GGUF Q4 via ComfyUI ou Wan2GP | non | `50aa0a9` |
| | [MuseTalk](https://github.com/TMElyralab/MuseTalk) 1.5 (retouche de bouche) | MIT / MIT (+ BiSeNet NC à remplacer) | oui sous conditions | oui en fp16 | tests | `0a89dec` |
| **Extension des planches, images clés** | *à référencer* : [Qwen-Image](https://github.com/QwenLM/Qwen-Image) (Edit-2511) et [Z-Image](https://github.com/Tongyi-MAI/Z-Image), exécutés via diffusers, ComfyUI-GGUF ou stable-diffusion.cpp | Apache-2.0 / Apache-2.0 | oui (pas Qwen-Image-2.1) | GGUF, à chronométrer | Z-Image en GGUF, lent | `6b5e1f5` / `26f23ed` |
| **LoRA de personnages** | [DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | Apache-2.0 / selon le modèle | oui sous conditions | partiel (patch fp16 + LoRA fp32) | non | `4a2d8af` |
| **Metteur en scène** | [ViMax](https://github.com/HKUDS/ViMax) | MIT / aucun poids | oui | sans objet | oui (orchestration) | `fd4b72e` |
| **Post-production** | [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (sous-titres, encodage 9:16) | MIT (polices et musiques à supprimer) | oui sous conditions | inutile | oui | `4b7b965` |
| | [Practical-RIFE](https://github.com/hzwer/Practical-RIFE) (interpolation) | MIT / MIT (déclaré dans le README) | oui | oui | lent | `bbfd2ea` |
| | [ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler), CLI (agrandissement) | Apache-2.0 (sauf `color_fix.py`) / Apache-2.0 | oui sous conditions | oui en principe | non | `4490bd1` |
| **Contrôle qualité** | [VBench](https://github.com/Vchitect/VBench), à la carte | Apache-2.0 (+ RAFT BSD ; AMT, CoTracker, pyiqa exclus) | oui sous conditions | oui | plausible | `fd18b3d` |
| **Moteur pédagogique** | *à référencer* : [NanoI2V](https://github.com/Shubham2376G/NanoI2V), avec notre [`mini-moteur`](mini-moteur/) | MIT / pas de poids | — | — | tests de fumée | `3f47e2f` |

### Pourquoi ces choix, étape par étape

- **Moteur de base : Wan 2.2.** C'est le moteur ouvert dont la licence est la plus propre : Apache-2.0 pour le code et les poids,
  sorties laissées à l'utilisateur. Son code est court (57 fichiers Python, ≈ 19 000 lignes). TI2V-5B est le seul modèle Apache
  qui produit nativement du 9:16 (704×1280) et anime une image de fiche personnage.
  Le code officiel ne tourne pas tel quel sur T4 : FlashAttention-2 est appelé directement dans le DiT et le bf16 est imposé.
  Le fork doit remplacer `flash_attention` par `attention()` (SDPA), passer en fp16 et ajouter les tailles 480p.
  On ne garde que TI2V-5B : les modèles 14B (A14B, S2V, Animate) demandent 80 Go et plus.
  **diffusers** sert de châssis Python au futur `moteur_troupe.py` : pipelines Wan I2V (première et dernière image), VACE et Animate,
  chargement de LoRA dans les deux experts, délestage par groupes, GGUF.
- **Runner T4 : ComfyUI + ComfyUI-GGUF en voie principale.** Ce sont des licences standard (GPL-3.0 et Apache-2.0).
  ComfyUI passe automatiquement en fp16 sur T4 (sm_75), sait répartir les modèles sur les deux T4 de Kaggle, et prend en charge
  SCAIL-2, Wan-Animate-2 et SeedVR2 nativement. ComfyUI-GGUF fait tenir Wan 2.2 en Q3 ou Q4 dans 16 Go.
  **Wan2GP sert de voie rapide pour démarrer** : un seul programme couvre FastWan 5B, InfiniteTalk, MultiTalk et plusieurs voix
  françaises, et la recette Wan2GP-on-Colab est la seule à annoncer un chrono T4. Sa licence maison autorise nos vidéos,
  mais interdit de revendre ou de louer le moteur à d'autres créateurs.
- **Route CPU : stable-diffusion.cpp.** C'est le seul moteur qui fait tourner Wan quantifié dans 15 Go de RAM sans PyTorch,
  et le même code compile pour les T4. Il a été mesuré (§ 5).
- **Personnages : SCAIL-2 d'abord.** On filme un comédien, et le modèle le transforme en personnage de la troupe.
  Les masques colorés (`scail_utils.py`) prévoient jusqu'à 6 identités par plan (le modèle n'a été montré qu'avec 2), et le découpage en segments de 81 images couvre
  des sketches de 25 à 60 s. **One-to-All** est la base Apache qui fournit en plus le code d'entraînement et des données cartoon :
  c'est elle qu'on affinera sur la troupe.
- **Voix : Qwen3-TTS pour créer les 54 voix** (VoiceDesign, puis une voix figée par personnage ; français confirmé), et
  **Chatterbox** pour la conversion de voix : un comédien joue la réplique avec l'accent ivoirien, Chatterbox lui donne
  la voix du personnage en gardant le timing. À valider par un test d'écoute.
- **Lèvres : InfiniteTalk** pour la parole pilotée par l'audio (2 locuteurs par passe, redoublage d'un plan) ;
  **MuseTalk** pour retoucher une bouche après coup, un visage à la fois.
- **Planches et images clés : Qwen-Image-Edit-2511 et Z-Image** sont les bons modèles, sous Apache-2.0. Mais leurs dépôts
  GitHub ne contiennent que des démos : le vrai code est dans diffusers, ComfyUI-GGUF et stable-diffusion.cpp. D'où le verdict
  « à référencer seulement ».
- **LoRA : DiffSynth-Studio**, un seul outil sous Apache-2.0 pour entraîner des LoRA Wan, Z-Image et Qwen-Edit.
  Il faut le patcher pour le T4 (fp16, LoRA en fp32). musubi-tuner reste un plan B, mais il n'a pas de LICENSE à la racine.
- **Metteur en scène : ViMax** (MIT), qui sépare la planification (personnages, storyboard, plans) du rendu.
  Il faut l'adapter : 9:16, champs de réplique et de durée, adaptateurs Wan.
- **Post-production** : les fonctions de sous-titres et d'encodage de MoneyPrinterTurbo, Practical-RIFE pour passer de 16 à 32 i/s,
  SeedVR2 pour agrandir vers 1080×1920.
- **Contrôle qualité** : quatre mesures de VBench copiées à la carte, plus `i2v_subject.py` pour comparer chaque plan à la planche du personnage.
- **Moteur pédagogique** : NanoI2V se lit pour comprendre la recette (VAE causal 3D, DiT, flow matching). Notre propre
  [`mini-moteur`](mini-moteur/) joue ce rôle dans ce dépôt.

---

## 3. Tous les dépôts vérifiés

### 3.1 Les 22 dépôts retenus

Champ complet (conditions, détails T4 et CPU) : [`vendor/moteurs.json`](vendor/moteurs.json).

| # | Dépôt | Étape | Verdict | Licence (code / poids) | Usage commercial | T4 | CPU | Commit (date) |
|---|---|---|---|---|---|---|---|---|
| 1 | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | moteur de base | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | non tel quel (FA2, bf16) ; patch plausible | non | `1ea34ff` (2026-09-21) |
| 2 | [huggingface/diffusers](https://github.com/huggingface/diffusers) | moteur de base (châssis) | **à dupliquer** | Apache-2.0 (sauf Bria FIBO, DiT) / Apache-2.0 | oui sous conditions | partiel | tests de fumée | `af4271c` (2026-10-15) |
| 3 | [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | runner T4 | **à dupliquer** | GPL-3.0 / Apache, MIT | oui | oui, avec réserves | développement | `5a66589` (2026-10-15) |
| 4 | [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | runner T4 | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | oui (gain mémoire, pas vitesse) | lent | `6ea2651` (2026-01-12) |
| 5 | [deepbeepmeep/Wan2GP](https://github.com/deepbeepmeep/Wan2GP) | runner T4 | **à dupliquer** | WanGP CL 2.0 / Apache-2.0, MIT | oui sous conditions | partiel (fp16 auto) | non | `de302ee` (2026-10-16) |
| 6 | [Square-Zero-Labs/Wan2GP-on-Colab](https://github.com/Square-Zero-Labs/Wan2GP-on-Colab) | notebook gratuit | **à dupliquer** | Apache-2.0 (notebook) ; moteur WanGP CL 2.0 | oui sous conditions | oui, FastWan 5B 480p | non | `e428b5e` (2026-08-31) |
| 7 | [leejet/stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) | route CPU | **à dupliquer** | MIT / Apache-2.0 | oui | oui (à compiler) | **oui, mesuré** | `8cd731e` (2026-10-16) |
| 8 | [zai-org/SCAIL-2](https://github.com/zai-org/SCAIL-2) | personnages, animation | **à dupliquer** | Apache-2.0 / MIT | oui sous conditions | via ComfyUI + GGUF | non | `78fe195` (2026-08-24) |
| 9 | [ssj9596/One-to-All-Animation](https://github.com/ssj9596/One-to-All-Animation) | personnages, animation | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | via WanVideoWrapper | pose seulement | `b3c9d88` (2026-04-19) |
| 10 | [QwenLM/Qwen-Image](https://github.com/QwenLM/Qwen-Image) | planches, images clés | **à référencer seulement** | Apache-2.0 / Apache-2.0 | oui | GGUF, non mesuré | non | `6b5e1f5` (2026-02-10) |
| 11 | [Tongyi-MAI/Z-Image](https://github.com/Tongyi-MAI/Z-Image) | planches, images clés | **à référencer seulement** | Apache-2.0 / Apache-2.0 | oui | GGUF (fp16 = images noires) | GGUF, lent | `26f23ed` (2026-02-09) |
| 12 | [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) | voix française | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | oui en fp32 | oui, lent | `022e286` (2026-03-17) |
| 13 | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | voix française | **à dupliquer** | MIT / MIT | oui | oui | conversion de voix en lot | `5de7a54` (2026-07-21) |
| 14 | [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | lèvres | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui | non tel quel ; GGUF via ComfyUI | non | `50aa0a9` (2026-05-22) |
| 15 | [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk) | lèvres | **à dupliquer** | MIT / MIT | oui sous conditions | oui en fp16 | tests | `0a89dec` (2025-09-26) |
| 16 | [modelscope/DiffSynth-Studio](https://github.com/modelscope/DiffSynth-Studio) | LoRA | **à dupliquer** | Apache-2.0 / selon le modèle | oui sous conditions | partiel, à valider | non | `4a2d8af` (2026-10-15) |
| 17 | [HKUDS/ViMax](https://github.com/HKUDS/ViMax) | metteur en scène | **à dupliquer** | MIT / — | oui | sans objet | oui | `fd4b72e` (2026-09-30) |
| 18 | [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | post-production | **à dupliquer** (partiel) | MIT / — | oui sous conditions | inutile | oui | `4b7b965` (2026-10-15) |
| 19 | [hzwer/Practical-RIFE](https://github.com/hzwer/Practical-RIFE) | interpolation | **à dupliquer** (fork corrigé) | MIT / MIT | oui | oui | lent | `bbfd2ea` (2026-08-27) |
| 20 | [numz/ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) | agrandissement | **à dupliquer** | Apache-2.0 / Apache-2.0 | oui sous conditions | oui en principe | non | `4490bd1` (2025-12-24) |
| 21 | [Vchitect/VBench](https://github.com/Vchitect/VBench) | contrôle qualité | **à dupliquer** (à la carte) | Apache-2.0 / mixtes | oui sous conditions | oui | plausible | `fd18b3d` (2026-08-21) |
| 22 | [Shubham2376G/NanoI2V](https://github.com/Shubham2376G/NanoI2V) | moteur pédagogique | **à référencer seulement** | MIT / pas de poids | oui sous conditions | non réaliste | tests de fumée | `3f47e2f` (2026-07-18) |

Les 22 commits ont été recoupés avec les clones de vérification. Deux branches méritent d'être notées :
SCAIL-2 a pour branche par défaut `wan-scail2`, et ComfyUI a pour branche par défaut `master`.

### 3.2 Écartés (résumé)

La liste complète, avec une ligne par dépôt, est dans les notes `codes_a_dupliquer_*.md`.

| Motif | Dépôts |
|---|---|
| **Non commercial**, ou d'origine non commerciale | HoloCine, huobao-drama (CC BY-NC-SA) ; GIMM-VFI (S-Lab) ; TalkVerse (Snap) ; Self-Forcing (code issu de CausVid, CC BY-NC-SA) ; Open-Sora 2.0 (étape 1 partant de FLUX.1-dev) ; LatentSync, LivePortrait, Hallo3 (InsightFace) ; Piper (voix françaises dérivées de modèles non commerciaux) |
| **Exclusion de territoire** | HunyuanVideo-1.5, HunyuanVideo-Avatar, FramePack (poids dérivés de Hunyuan), MiniMax H3 |
| **Licence maison couvrant le code ou exigeant un compte** | LTX-2 / 2.3 / 2.5, LTX-Video 0.9.x, SkyReels V2/V3, CogVideoX-5B, SkyReels-A2 |
| **Pas de licence** | daVinci-MagiHuman, UniAnimate-DiT, MovieAgent, AniMaker, WanGP-Kaggle, comfyui-kaggle, TeamAIQ, wan-2.2-animate-comfyui-kaggle ; poids sans licence : Animate-X, All-In-One-Deflicker ; musubi-tuner (pas de LICENSE à la racine, fichier dérivé d'AGPL) |
| **Copyleft qui contaminerait le moteur** | OpenMontage, AI Movie Studio 2, OneTrainer (AGPL) ; diffusion-pipe (GPL, plus tard) |
| **Trop gros ou matériel récent exigé** | Ovi, MAGI-1, Mochi 1, Step-Video-T2V, LongCat-Video, MAGREF, HuMo, SeedVR officiel, FlashVSR, FlashVSR+, LightX2V, SD.Next, wan2.2-google-colab ; à surveiller : Helios, SANA-Video, Kandinsky 6 |
| **Doublons ou déjà couverts** | Wan2.1, VACE, Wan-Animate-2, MultiTalk, Phantom, EchoMimic V3 ; minRF, rectified-flow-pytorch, Latte ; ai-toolkit, finetrainers, FastVideo ; ComfyUI-WanVideoWrapper (installé comme dépendance épinglée, pas forké), ComfyUI-MultiGPU (archivé), mmgp, SageAttention ; ComfyUI-Frame-Interpolation (embarque AMT, non commercial), rife-ncnn-vulkan, FILM, Real-ESRGAN (repli) ; Flow, PenShot, MM-StoryAgent, Toonflow, Pixelle-Video, VideoClaw, FireRed-OpenStoryline, editly, MoviePy, auto-editor, OpenTimelineIO, Revideo/Remotion, wind-comic ; RAFT, UVQ, syncnet_python, VideoAlign, DefectVideoReward ; LingBot-Video, notebooks OpenVINO |

---

## 4. Pièges de licence

### 4.1 Pièges transversaux (ils reviennent dans plusieurs dépôts)

1. **CausVid est non commercial (CC BY-NC).** Il se cache dans la LoRA FusionX (citée par InfiniteTalk), dans le GGUF « Phantom 14B »,
   dans un notebook OpenVINO et dans `lightx2v/Wan2.1-T2V-14B-CausVid`. Règle : **jamais CausVid ni FusionX**.
2. **Les LoRA de `Kijai/WanVideo_comfy` n'ont aucune licence déclarée.** Prendre les mêmes LoRA à la source :
   `lightx2v/...` (Apache-2.0) ou `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` (Apache-2.0).
3. **YOLOv10 est sous AGPL-3.0**, même quand il est livré dans un dépôt étiqueté Apache (`Wan2.2-Animate-14B/process_checkpoint`).
   Il est utilisé par Wan2.2-Animate et One-to-All. Le remplacer par `yolox_l.onnx` (Apache). Même problème avec **ultralytics** (AGPL) dans SCAIL-Pose.
4. **InsightFace est non commercial** (EchoMimic, LatentSync, LivePortrait, Hallo3, option `[infiniteyou]` de DiffSynth).
5. **Modèles non commerciaux chargeables par erreur** : FLUX.1-dev et FLUX.1-Kontext-dev (`--use_flux` de Wan2.2-Animate,
   GGUF cités en premier par ComfyUI-GGUF) ; Qwen-Image-2.1 (licence « qwen-research », pourtant mis en avant par DiffSynth et chargeable par diffusers) ;
   alias Qwen2.5-3B de Wan2.2.
6. **API payantes appelées par défaut** : DashScope (Wan2.2, SCAIL-2, InfiniteTalk, Qwen-Image), Gemini (SCAIL-2), Veo et Nano Banana (ViMax),
   nœuds « partner » de ComfyUI (`--offline`), générateurs sponsors de MoneyPrinterTurbo. Tous sont à couper.
7. **Comptes et accès restreints** : SAM3 (`facebook/sam3`), VAE FLUX.1-schnell renvoyé par la doc de Z-Image dans stable-diffusion.cpp,
   licence CogVideoX-5B. Il existe à chaque fois une copie ouverte (SAM2.1, `Comfy-Org/z_image_turbo`, Wan).
8. **Miroirs chinois codés en dur** : `HF_ENDPOINT=https://hf-mirror.com` (One-to-All, MuseTalk), `mirrors.aliyun.com`, `modelscope.cn` (DiffSynth). À retirer.
9. **Voix et visages réels** : cloner la voix d'un comédien ou animer son visage exige son **consentement écrit**, quelle que soit la licence du code.
   Garder le filigrane Perth de Chatterbox, qui va dans le sens de l'étiquetage « contenu IA » de TikTok et de l'AI Act.

### 4.2 Pièges par dépôt

| Dépôt | Piège | Que faire |
|---|---|---|
| Wan2.2 | `--use_flux` (FLUX.1-Kontext-dev, NC) dans l'exemple « animation » du README ; YOLOv10 (AGPL) fourni avec Animate ; alias Qwen 3B (NC) ; `--enable_tts` clone et exécute CosyVoice au lancement | retirer `--use_flux` ; ne pas redistribuer `yolov10m.onnx` ; Qwen 7B/14B seulement |
| diffusers | 3 fichiers Bria FIBO sous CC-BY-NC-4.0 ; `pipeline_dit.py` (CC BY-NC) ; la doc Wan renvoie aux LoRA Kijai | ne pas vendoriser ces fichiers ; LoRA lightx2v |
| ComfyUI | GPL-3.0 : un fork **distribué** doit l'être sous GPL, et les nœuds maison distribués doivent avoir une licence compatible ; nœuds d'API payants ; `comfy-aimdo` « se réserve » de changer de licence | usage comme outil ; `--offline` ; épingler les versions |
| ComfyUI-GGUF | FLUX.1-dev GGUF (NC) cité en premier ; SD3.5 avec plafond ; Gemma Terms of Use ; mainteneur inactif, cassé sur les ComfyUI récents (#488) | GGUF QuantStack et city96 Apache seulement ; correctif #488 |
| Wan2GP | licence maison : pas de revente, location, API ou SaaS ; mmgp de PyPI (≤ 3.8.x) ambigu ; Hunyuan (territoire), Fish Audio (plafond 500 000 USD) | usage interne ; épingler `de302ee` ; poids Apache ou MIT seulement |
| Wan2GP-on-Colab | Apache ne couvre que le notebook ; FFmpeg « -gpl » ; Gradio `--share` interdit sur Colab gratuit | mode `--process` sur Kaggle ; ne pas redistribuer FFmpeg |
| stable-diffusion.cpp | la doc Z-Image renvoie au VAE FLUX.1-schnell (compte) ; vocabulaires Gemma embarqués | `Comfy-Org/z_image_turbo` ; fork allégé si redistribué |
| SCAIL-2 | mode pose : poids NLF (NC) ; e2e : ultralytics (AGPL) + SAM3 (restreint) ; Gemini, DashScope ; SCAIL-2-Tuner sans licence | e2e seulement, avec SAM2.1 (Apache) |
| One-to-All | Naver CroCo (CC BY-NC-SA) dans `opensora/.../pos_embed.py` et `curope/` ; Poseur et SMPL-X (NC) dans `benchmark/` ; médias tiers (photo d'une personne réelle, vidéo Douyin) ; YOLOv10 ; jeu de données aux droits incertains | fork élagué (supprimer ces dossiers), `yolox_l` |
| InfiniteTalk | FusionX (CausVid) ; `quant_models/*_lora` (LoRA inconnue) ; Kokoro et StyleTTS2 vendorisés sans LICENSE | exclure ; ajouter les mentions |
| MuseTalk | BiSeNet `79999_iter.pth` (CelebAMask-HQ, NC) **obligatoire** dans `blending.py` ; médias de test NC ; S3FD sans licence de poids ; tag HF `creativeml-openrail-m` avant le 22/09/2026 | masque maison ; cadres des visages fournis par notre compositing ; révision HF récente |
| Qwen3-TTS | GGUF ggml-org sans licence déclarée | dérivé de poids Apache : acceptable, à noter |
| Chatterbox | `pykakasi` (GPL-3.0+) dans les dépendances ; `resemble-perth` tiré de `git@master` | retirer pykakasi ; `resemble-perth==1.0.1` |
| Qwen-Image | Qwen-Image-2.1 (NC) ; réécriture de prompt DashScope (payante, boucle infinie sans clé) | Edit-2511 seulement |
| Z-Image | le VAE se déclare « flux-dev », mais il est **identique bit à bit** à celui de FLUX.1-schnell (Apache) | aucun problème, vérifié |
| DiffSynth-Studio | Qwen-Image-2.1 (NC), MiniMax-H3 (territoire), Krea-2, InfiniteYou (insightface) proposés dans le même dépôt | ne jamais les activer |
| ViMax | réglages par défaut payants ; palier gratuit Gemini = données utilisées pour l'entraînement | choisir le LLM avec soin |
| MoneyPrinterTurbo | polices propriétaires (STHeiti par défaut, Microsoft YaHei) ; 29 musiques venues de YouTube ; Edge TTS non officiel ; SDK Azure propriétaire | supprimer `resource/fonts` (sauf OFL) et `resource/songs` |
| Practical-RIFE | licence des poids affirmée seulement par le README ; zip avec `.pyc` et pickle | archiver le README ; torch ≥ 2.6 ou sources vsrife |
| SeedVR2 (numz) | `color_fix.py` dérivé de StableSR (S-Lab, NC), utilisé par le réglage par défaut `lab` | `--color_correction hsv` ou `none`, puis réécriture en salle blanche |
| VBench | `pip install vbench` installe pyiqa (PolyForm NC) ; AMT et CoTracker (CC BY-NC) ; poids RAFT « research only » ; fiche CLIP « deployed use out of scope » | copie à la carte, contrôle qualité interne seulement |
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
| Poids de notre dépôt | nul | faible, mais `clone --recursive` tire ≈ 1 Go de code tiers | **≈ 1,1 Go** de fichiers, plus l'historique | nul (`src/` est ignoré par git) |
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
   (Bria FIBO dans diffusers, Naver CroCo dans One-to-All, `color_fix.py` de SeedVR2, AMT et CoTracker dans VBench),
   polices propriétaires et musiques tirées de YouTube (MoneyPrinterTurbo), photo d'une personne réelle et vidéo Douyin (One-to-All).
   Une copie en bloc ferait de nous leur distributeur public.
3. **Le volume** : environ 1,1 Go de fichiers pour les 19 dépôts (estimation d'après les tailles mesurées, plus l'historique),
   alors que ce dépôt sert aussi de site (`index.html`). GitHub refuse les fichiers de plus de 100 Mo.
4. **La traçabilité** : un SHA épinglé prouve exactement quelle version a été auditée. Une copie retouchée à la main perd ce lien.
5. **La sécurité** : c'est du code non relu ligne à ligne. Il reste dans `vendor/src/`, hors de notre historique.

**Quand forker quand même ?** Seulement pour les dépôts qu'on patche réellement (Wan2.2 pour SDPA et fp16, InfiniteTalk,
ComfyUI-GGUF #488, SeedVR2 `color_fix.py`, Practical-RIFE, Chatterbox), et de préférence **en privé**, ou sous forme de petits
fichiers `.patch` rangés dans `vendor/patches/<nom>/` et appliqués après récupération. Un patch suit la licence du fichier qu'il modifie
(GPL-3.0 pour ComfyUI, Apache-2.0 avec mention de modification pour Wan). Pour les dépôts critiques dont l'auteur peut disparaître
(ComfyUI-GGUF, Wan2GP), garder une archive privée (`git bundle`) dans un jeu de données Kaggle privé.

### 6.3 Utiliser `vendor/recuperer.sh`

```bash
cd studio-troupe/vendor
bash recuperer.sh --liste              # la liste, sans rien télécharger
bash recuperer.sh --seul ComfyUI-GGUF  # un seul dépôt, dans vendor/src/ComfyUI-GGUF
bash recuperer.sh                      # les 19 dépôts « à dupliquer » (≈ 1,1 Go de fichiers, prévoir ≈ 2 Go)
MOTEURS_SRC=/kaggle/working/src bash recuperer.sh --seul Wan2GP   # ailleurs, par exemple sur Kaggle
```

Ce que fait le script, pour chaque dépôt « à dupliquer » :
`git init`, puis `git fetch --depth 1 origin <sha>`, puis `git checkout FETCH_HEAD`, puis vérification que `HEAD` vaut bien le SHA attendu.

- Il lit `moteurs.json` avec `python3 -I` (pas de jq) et refuse un nom, une URL (GitHub seulement) ou un commit (SHA complet) mal formés.
- Il ne télécharge **aucun poids** (`GIT_LFS_SKIP_SMUDGE=1`, aucun appel à Hugging Face) et n'exécute **rien** (ni build, ni pip, ni hook git).
- Il est **idempotent** : un dossier déjà au bon commit est laissé tel quel, et un dossier modifié localement n'est jamais écrasé.
- Il ne récupère pas les **sous-modules** (stable-diffusion.cpp, SCAIL-2) et affiche la commande pour le faire.
- Il ne récupère jamais les dépôts « à référencer seulement » (code de sortie 4, avec le lien de lecture).

Vérifié le 16/10/2026 : `--liste`, puis `--seul ComfyUI-GGUF` (164 Ko, HEAD = `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`),
relance sans effet, refus d'écraser une modification locale, mise à jour depuis un autre commit, refus des noms inconnus et des
dépôts à référencer, rejet d'un `moteurs.json` falsifié. Le dossier `vendor/src` a été supprimé après le test.

---

## 7. Prochaines étapes conseillées

1. **Première session Kaggle (mesurer avant de construire)** : Wan2GP + recette Wan2GP-on-Colab adaptée en `--process`
   (FastWan 5B, 480p, 9:16) et ComfyUI + ComfyUI-GGUF (TI2V-5B Q4_K_M). Noter le temps par plan, la VRAM, la RAM et la version du pilote.
2. **Voix** : créer 3 voix de test avec Qwen3-TTS VoiceDesign, puis tester la conversion de voix Chatterbox sur des répliques
   jouées avec l'accent ivoirien.
3. **Personnages** : SCAIL-2 en GGUF Q4 sous ComfyUI, sur un plan de 2 personnages filmé au téléphone, en 512×896.
4. **Lèvres** : InfiniteTalk GGUF (via ComfyUI-WanVideoWrapper ou Wan2GP) et MuseTalk sur un personnage cartoon en français.
5. **Identité** : sur le CPU, Wan2.1-VACE-1.3B avec une fiche personnage ; sur Kaggle, une première LoRA de personnage avec DiffSynth patché.
6. **Fork** : ouvrir `vendor/patches/` pour les premiers correctifs (SDPA et fp16 dans Wan2.2, #488 dans ComfyUI-GGUF).

## Fichiers

- `studio-troupe/MOTEURS-A-DUPLIQUER.md` : ce document.
- `studio-troupe/vendor/moteurs.json` : les 22 dépôts retenus (nom, url, commit, date, étape, licence, usage commercial, conditions, T4, CPU, verdict).
- `studio-troupe/vendor/recuperer.sh` : récupération des dépôts au commit épinglé (`--liste`, `--seul NOM`).
- `studio-troupe/vendor/.gitignore` : ignore `src/`, où atterrissent les clones.
- `studio-troupe/banc-cpu/` : le banc CPU (§ 5).
