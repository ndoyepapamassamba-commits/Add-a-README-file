# Prompt maître — « Atelier de production audiovisuelle 100 % IA » (Afrikatoon)

> À coller tel quel dans une nouvelle session Claude Code sur la branche `claude/gallant-bell-286f0p`.
> Modèles vérifiés sur OpenRouter le 06/10/2026 (`GET /api/v1/models?output_modalities=image|video|audio`).
> Aucune clé dans le chat, les journaux ni les commits : `OPENROUTER_API_KEY`, `HF_TOKEN` lus dans l'environnement.

---

## RÔLE
Tu es le directeur technique d'un studio d'animation. Construis dans `afrikatoon-auto/` un **Atelier de production
audiovisuelle IA** (module `afrikatoon/atelier/` + CLI `python run.py atelier …` + interface web `atelier/index.html`
sur le modèle de `index.html` du dépôt) qui transforme une **idée d'histoire** en **vidéo verticale 9:16 TikTok finie** :
images clés détaillées → vidéos animées parlantes → voix off, bruitages, musique, sous-titres emoji → montage.

## STYLE À CONSERVER (non négociable)
Style des vidéos Afrikatoon de référence (la vidéo jointe + `output/anim-sauce/final.mp4`,
`assets/characters_2d_ia/MAMAN_NOUNOU_angry.png`) : humour de famille sénégalaise, personnages récurrents de
`assets/characters/` (38) et `bible.py`, décors de village/cuisine/marché, couleurs chaudes « golden hour »,
expressions très exagérées, rythme rapide (coupes de 1 à 4 s), chute finale gelée, sous-titres TikTok 2-3 mots
avec mot courant surligné + emoji, bas d'écran, sans nom de personnage. Deux modes de rendu, au choix par projet :
`3d` (cartoon Pixar africain) ou `2d` (traits noirs nets, aplats). Le mode est injecté dans CHAQUE prompt via un
`STYLE_BLOCK` unique (cohérence). Jamais de logo, filigrane ni texte parasite dans les images.

## MODÈLES (registre `models.json`, modifiable, avec prix et capacités ; l'atelier interroge l'API pour mettre à jour)
**Texte→image / édition (OpenRouter `POST /api/v1/images`)** : `google/gemini-3.1-flash-image` (« Nano Banana »,
édition + cohérence de personnage, référence = image du personnage), `x-ai/grok-imagine-image-2.0`,
`bytedance-seed/seedream-5-0-flash|lite|pro` (le moins cher, bon décor), `openai/gpt-image-2`
(texte lisible dans l'image), `black-forest-labs/flux-3-image`, `recraft/recraft-v4-styles(-vector)` (style 2D net),
`qwen/qwen-image-3(-pro)`, `krea/krea-2-*`, `microsoft/mai-image-2.6`.
**Image→vidéo** : `x-ai/grok-imagine-video(-1.5)` (le flux historique de l'utilisateur : image récupérée ou générée
+ prompt de dialogue), `google/veo-3.1(-fast|-lite)` (dialogue + son natifs), `kwaivgi/kling-v3.0-pro|std`,
`bytedance/seedance-2.5|2.0(-fast|-mini)` (image + audio + vidéo de référence), `minimax/hailuo-3(-max)`,
`alibaba/wan-3.0(-prime)|2.7|2.6`, `runway/gen-4.5`, `alibaba/happyhorse-1.1`.
**Personnage parlant / avatar** : `heygen/avatar-iv` (image + audio → vidéo, lip-sync), `heygen/heygen-video-1`.
**Post-production vidéo** : `black-forest-labs/flux-video-upscale`, `flux-video-edit`, `runway/aleph-2`.
**Audio** : `google/lyria-3-pro-preview|clip-preview` (musique), `openai/gpt-audio(-mini)` (voix off / bruitages
parlés) ; en local : Chatterbox (voix à accent africain `state/voice_refs/`), Whisper (sous-titres + contrôle),
Rhubarb (lip-sync 2D), `sound2d.py` (balafon/djembé, ambiance), `assets/sfx/` (Kenney CC0).
**HuggingFace (HF_TOKEN)** : Wan 2.2 sur le Space ZeroGPU (`wananim.py`, quota ≈ 5 min/jour), FLUX.2-klein.
**Routeur de modèles** : `--qualite eco|standard|premium` choisit le modèle par étape selon le budget ;
repli automatique sur le modèle suivant en cas d'échec, de refus de contenu ou de dépassement de budget.

## PIPELINE (chaque étape = commande indépendante, reprise automatique, résultat mis en cache)
1. **Idée → scénario** (`scenario.py` existant) : titre, logline, 3 actes, chute, 8-15 répliques, personnages pris
   dans la bibliothèque ou créés. Sortie : kit JSON (`kits/AAAA-MM-JJ/…json`) compatible avec `run.py`.
2. **Fiches personnages & décors** : pour chaque nouveau personnage, prompt détaillé (âge, morphologie, visage,
   tenue, accessoires, palette, tics) → image de référence 3 poses + expressions ; pour chaque lieu, un décor
   large sans personnage. Optionnel : **import d'images du web** (URL ou fichier) → nettoyage (suppression
   logo/texte, détourage `rembg`, agrandissement Real-ESRGAN) → fiche personnage. Vérifier les droits, flouter
   toute marque.
3. **Storyboard image par image** : un prompt d'image par plan, généré par un LLM à partir du scénario
   (cadrage large/moyen/épaule/gros plan, angle, lumière, émotion, action, décor, personnages présents, image de
   référence). Sortie : planche contact HTML pour validation avant tout appel vidéo payant.
4. **Image → vidéo parlante** : pour chaque plan, prompt vidéo structuré (voir gabarit ci-dessous) envoyé au
   modèle choisi avec l'image clé en première image ; dialogue entre guillemets, accent, ton ; durée 3-8 s.
   Vérification : Whisper transcrit la vidéo, compare au texte attendu, refait la prise si coupée ou inventée.
5. **Son** : voix off / répliques (Chatterbox local ou audio natif Veo/Seedance/Grok), bruitages synchronisés sur
   des marqueurs du scénario (`[SFX: porte qui claque @2.1s]`), musique Lyria ou locale, ambiance, ducking sous
   les voix, loudnorm −14 LUFS.
6. **Sous-titres emoji** : horodatage Whisper mot à mot, 2-3 mots à l'écran, mot courant surligné, emoji choisi
   par mot-clé (table `emoji.json` + LLM), polices africaines lisibles, zone sûre TikTok.
7. **Montage** (`montage.py`/ffmpeg) : coupes motivées (regard/geste), transitions courtes, plan de réaction,
   gel final, 1080×1920, < 30 Mo (CRF 24), version avec et sans sous-titres, miniature, légende + hashtags.
8. **Contrôle qualité automatique + humain** : planche des plans, cohérence des visages/tenues, logos, audio
   coupé ; toute pose ratée est refaite seule.
9. **Journal des coûts** (`depenses.jsonl`) : coût réel `usage.cost` par appel, **budget dur** par projet
   (`--budget`), mode `--plan` qui n'appelle rien et affiche le coût estimé.

## BANQUE DE « MILLIERS DE PROMPTS » À POSSIBILITÉS INFINIES
Ne pas écrire des milliers de prompts à la main : construire un **générateur combinatoire** (`prompts/`) :
- **Briques YAML** (≥ 40 fichiers) : `personnages` (âges, morphologies, tenues wax/boubou/bazin, tics),
  `lieux` (cuisine, marché, mosquée, école, taxi-brousse, mariage, tribunal, banque, plage, champ…),
  `situations` (belle-mère vs belle-fille, enfant espiègle, voisin radin, malentendu, dette, rumeur, cérémonie,
  panne de courant, sauce ratée…), `émotions` (20 niveaux d'intensité), `cadrages` (30), `lumières` (15),
  `mouvements de caméra` (25), `gags visuels` (100+), `chutes` (100+), `proverbes`, `accents` (wolof-français,
  français de Dakar, anglais ouest-africain), `bruitages`, `ambiances`, `musiques`.
- **Gabarits** avec variables `{perso} {lieu} {emotion}`, tirage pondéré et graine (`--graine`) → **≥ 10 000
  combinaisons distinctes** ; commande `atelier prompt --theme "belle-mère" --n 50` ; mode « mutation » (variante
  d'un prompt existant) et « suite » (épisode suivant, mêmes personnages) ; favoris et historique.
- **Prompts LLM libres** : champ « décris ton histoire » → l'atelier la développe en scénario + storyboard.
- Gabarit prompt vidéo : `[STYLE_BLOCK] | PLAN : <cadrage>, <angle> | ACTION : <geste précis, 1 seule action> |
  DIALOGUE : <PERSONNAGE> dit, ton <…>, accent <…> : « … » | CAMÉRA : <mouvement> | SON : <ambiance, SFX> |
  DURÉE : <s> | NÉGATIF : texte, logo, filigrane, visage déformé, mains en trop`.

## INTERFACE WEB (`atelier/index.html`, statique, thème du dépôt, mobile d'abord)
Onglets : **Idée** (champ libre + générateur de prompts) · **Casting** (galerie personnages, import d'image) ·
**Storyboard** (planche d'images, régénérer un plan) · **Animation** (choix du modèle par plan, prix affiché) ·
**Son & sous-titres** · **Montage & export** · **Coûts**. Chaque prompt est copiable pour coller dans Grok,
Veo, Kling, etc. si l'utilisateur préfère l'outil externe. Fonctionne hors ligne en mode « prompts seuls ».

## LIVRABLES & RÈGLES
- Code propre, testé (tests unitaires sur le routeur, le budget, le générateur de prompts), `README` atelier,
  `models.json`, ≥ 10 000 combinaisons de prompts vérifiées par un test, 3 projets d'exemple.
- Démo : « La sauce de belle-maman » refaite par l'atelier, de l'idée au MP4, avec coût réel affiché.
- Commits fréquents sur `claude/gallant-bell-286f0p`, pas de PR sans demande. Aucun secret dans le dépôt.
- Contenus : humour bienveillant, pas de personne réelle identifiable, respect des droits des images importées.
