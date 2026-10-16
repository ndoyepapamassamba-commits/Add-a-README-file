# Banc CPU : un vrai moteur vidéo ouvert peut-il tourner gratuitement sur le conteneur ?

**Réponse : oui, ça marche, mais c'est lent.** Le moteur ouvert **Wan2.1-T2V-1.3B** (Alibaba, Apache-2.0), en GGUF et
exécuté par **stable-diffusion.cpp** (C++/ggml, MIT), a produit de vraies vidéos 9:16 de style cartoon 3D sur le
CPU du conteneur (4 cœurs, 15 Go de RAM, sans GPU). Le meilleur clip fait **2,06 s en 320×576 (33 images à 16 i/s)**
et a demandé **24,3 min de calcul** sur 2 threads, machine partagée. On peut s'en servir pour des aperçus, des tests de prompts
ou des animatiques nocturnes. **Pas pour la production** en 720p/1080p : c'est le rôle de Kaggle T4.

Clip principal : `clip_2s_320x576_dmd4_tae.mp4` (ou le `.gif`), avec sa planche `planche_clip_2s.jpg`.

Prompt (identique pour tous les essais) :
`3D animated cartoon, Pixar style, a thin West-African man in a faded green t-shirt waves his hand in a sunny West-African courtyard, vertical 9:16`

## Résultats mesurés (16/10/2026)

Mesures prises par `scripts/mesure.py` : temps mural, plus pic de RAM via `ru_maxrss`, car `/usr/bin/time` n'existe pas ici.
Un entraînement `minimoteur` et des tests pytest d'un autre agent tournaient en parallèle (charge de 4 à 12) :
les temps sont donc **pessimistes**.

| Essai (fichier) | Taille | Réglage | Threads | Texte (T5) | Diffusion | Décodage | **Total** | Pic RAM |
|---|---|---|---|---|---|---|---|---|
| 1 `essai1_256x448_10pas_cfg6.mp4` | 256×448×9 (0,56 s) | 10 pas euler, CFG 6, prompt négatif | 2 | 104 s | 983 s (98 s/pas) | VAE 187 s | **21,3 min** | 10,05 Go |
| 2 `essai2_256x448_dmd4_vae.mp4` | 256×448×9 | LoRA DMD 4 pas, CFG 1 | 2 | 52 s | 221 s (55 s/pas) | VAE 188 s | **7,7 min** | 10,22 Go |
| 3 `essai3_256x448_dmd4_tae.mp4` | 256×448×9 | DMD 4 pas + décodeur TAE | 2 | 50 s | 215 s (54 s/pas) | TAE 27 s | **4,9 min** | 7,38 Go |
| 4 `clip_1s_320x576_dmd4_vae.mp4` | 320×576×17 (1,06 s) | DMD 4 pas, VAE en tuiles | 4 (*) | 27 s | 335 s (84 s/pas) | VAE en tuiles 1 333 s | **28,3 min** | 8,42 Go |
| 5 `clip_2s_320x576_dmd4_tae.mp4` | 320×576×33 (2,06 s) | DMD 4 pas + TAE, tuilage temporel | 2 | 51 s | 1 263 s (316 s/pas) | TAE 144 s | **24,3 min** | 10,10 Go |

(*) L'essai 4 a démarré avec 4 threads quand aucun entraînement ne tournait. Quand un entraînement `minimoteur` a été
relancé pendant le décodage, le processus a été passé en `nice 19`. Son décodage (6 tuiles de VAE, CPU disputé) n'est donc
pas représentatif. Le décodeur TAE avec tuilage temporel (essai 5) est la voie à retenir.

Leçons tirées des mesures :
- **La LoRA DMD 4 pas divise le temps de diffusion par 4,4** (983 s → 221 s) : 4 pas au lieu de 10, et plus de passe CFG négative.
  Le rendu est au moins aussi bon à cette taille (voir `planche_essai1.jpg`).
- **Le décodeur TAE (taew2_1) est environ 7 fois plus rapide que le VAE Wan** (27 s contre 188 s) et la différence de rendu est minime
  (`comparaison_vae_haut_tae_bas.jpg` : VAE en haut, TAE en bas, sur les mêmes latents).
- Le VAE complet sans tuiles réserve 5 Go de RAM dès 256×448. Avec ses tuiles spatiales, des joints restent visibles
  (taches sur le t-shirt et le sol en fin de clip 1 s).
- Passer de 2 à 4 threads accélère la diffusion d'environ ×1,8. Ce chiffre vient d'un seul essai, sur une machine partiellement chargée.
- Le coût d'un pas de diffusion en fonction du nombre N de jetons a été ajusté sur les mesures à 2 threads :
  ≈ 0,0377·N + 1,88e-6·N² secondes, avec N = ((images−1)/4+1)·(H/16)·(W/16). Le terme en N² correspond à l'attention.

### Extrapolation (2 threads, DMD 4 pas + TAE, estimations non mesurées)

| Cible | Jetons | Calcul estimé | Par seconde de vidéo |
|---|---|---|---|
| Plan de 5 s en 320×576 (81 images) | 15 120 | ≈ 67 min de diffusion + 6 min TAE + 1 min T5 ≈ **74 min** | ≈ 15 min |
| Plan de 5 s en 480×832 (81 images) | 32 760 | ≈ 3,6 h + 13 min TAE ≈ **3,9 h** | ≈ 47 min |
| Sketch de 30 s (6 plans de 5 s) en 320×576 | — | ≈ **7,5 h** (environ 4 h à 4 threads libres) | — |

À titre de comparaison, Kaggle T4 fait environ 8 min par clip de 5 s en 480p avec FastWan 5B
(chiffre de la recette Wan2GP-on-Colab, non mesuré ici).

## Évaluation honnête de la qualité

Les points positifs :
- le style « cartoon 3D façon Pixar » est réussi ;
- l'homme noir en t-shirt vert lève bien la main et salue ;
- le décor (cour ensoleillée, mur, palmiers, toits) est plausible ;
- le mouvement est fluide sur 2 s et le visage reste stable d'une image à l'autre à l'intérieur d'un même clip.

Les limites :
- **Basse définition.** Le 320×576 doit être agrandi ×3,3 pour atteindre le 1080×1920 de TikTok.
- **Défauts visibles.** La main se brouille et les doigts se déforment pendant le geste. Un motif parasite apparaît sur le t-shirt,
  qui n'a rien de « délavé ». Un grain en damier apparaît sur les dernières images des clips 256×448. Dans le clip 2 s, le personnage
  paraît plus jeune (adolescent) que l'« homme mince » demandé.
- **Aucune cohérence d'identité entre clips.** C'est du texte → vidéo pur : chaque graine invente un nouveau visage. En l'état,
  c'est **rédhibitoire pour 54 personnages récurrents** : il faudra une image de référence (VACE/I2V) ou une LoRA de personnage.
- Pas de son, pas de synchronisation labiale. Un seul personnage a été testé, pas de scène à 2-4 personnages.
- La LoRA DMD est un **point de contrôle expérimental intermédiaire** : itération 1 600 sur 3 000, presque aucun téléchargement sur HF.
  Elle marche ici, mais rien ne garantit sa stabilité sur d'autres prompts.

## Versions et poids (licences vérifiées via l'API HF, sommes SHA-256 contrôlées localement)

- **stable-diffusion.cpp** `8cd731e7b4667eb8f40a153315b9a7125d09a58d` (« master-968 », 16/10/2026), **MIT**.
  Sous-module **ggml** `d25b121ce1d6ae0c7e62ad080460d9fc1e46dd93`, **MIT**.
  Compilé avec gcc 13.3 et cmake 3.28.3 (`-march=native` : AVX-512 et AMX détectés, OpenMP). Durée : 4,5 min en `-j 2`, 3,1 Go de RAM.
- **Wan2.1-T2V-1.3B Q8_0** : `samuelchristlie/Wan2.1-T2V-1.3B-GGUF` @ `5a512b15`, fichier `Wan2.1-T2V-1.3B-Q8_0.gguf`
  (1 535 768 800 o, sha256 `30a44f695b4275a915810120360d6fd26152ec303c2226b5152ec33a93c380e4`). Licence **Apache-2.0**, dérivé de `Wan-AI/Wan2.1-T2V-1.3B` (Apache-2.0).
  Sur les sorties, Wan déclare « We claim no rights over your generated contents » : usage commercial permis, sans restriction de territoire.
- **Encodeur de texte umT5-XXL Q4_K_M** : `city96/umt5-xxl-encoder-gguf` @ `b535255b` (3 655 145 312 o, sha256 `17cf97a5bbbc60a646d6105b832b6f657ce904a8a1ad970e4b59df0c67584a40`).
  Licence **Apache-2.0**.
- **VAE Wan 2.1** : `Comfy-Org/Wan_2.1_ComfyUI_repackaged` @ `123acf1c`, `split_files/vae/wan_2.1_vae.safetensors`
  (253 815 318 o, sha256 `2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b`). Licence **Apache-2.0**.
- **Décodeur rapide TAEHV taew2_1** : `github.com/madebyollin/taehv` @ `011dfc21`, `safetensors/taew2_1.safetensors` (22 642 902 o, sha256 `04766eac0221b5390b985ae3fdcca652cbb4b1e8b82b28ea7ff89dfad1b1a93f`).
  Licence **MIT**.
- **LoRA DMD 4 pas** : `Perflow-Shuai/Wan2.1-T2V-1.3B-NonAR-DMD-4Step-LoRA-r64-iter1600-Teacher14B` @ `5193ab05`,
  `generator_lora_lightx2v.safetensors` (175 045 992 o, sha256 `73f0750f12f5f91a913960c77cc002f0256dc88133d1638dd0a3d491277d7866`, conforme au fichier SHA256SUMS du dépôt). Licence **Apache-2.0**.
  Le fichier est au format LightX2V (clés `blocks.N...lora_A/B`) : `scripts/prefix_lora.py` réécrit seulement l'en-tête pour préfixer
  les clés par `diffusion_model.`, et sd.cpp applique alors 600 tenseurs sur 600.

Total téléchargé : 5,64 Go. Les poids ont été supprimés du conteneur après le banc : les commandes ci-dessous permettent de les retélécharger.
Wan2.2-TI2V-5B n'a **pas** été testé, pour rester sous le plafond de 8 Go de téléchargement.

## Commandes exactes

```bash
B=/chemin/banc-cpu; S=/chemin/studio-troupe/banc-cpu/scripts   # S = scripts de ce dossier
mkdir -p $B/models/loras && cd $B
# 1) Compilation (CPU seulement, sans WebP/WebM : sortie .avi MJPG)
git clone https://github.com/leejet/stable-diffusion.cpp sdcpp && cd sdcpp
git checkout 8cd731e7b4667eb8f40a153315b9a7125d09a58d
git submodule update --init --depth 50 ggml
cmake -B build -DCMAKE_BUILD_TYPE=Release -DSD_WEBP=OFF -DSD_WEBM=OFF
cmake --build build --config Release --target sd-cli -j 2
cd $B/models
# 2) Poids (révisions épinglées)
curl -L -o Wan2.1-T2V-1.3B-Q8_0.gguf https://huggingface.co/samuelchristlie/Wan2.1-T2V-1.3B-GGUF/resolve/5a512b15fc35d1b67a074cfe55a591be9e9ef9b5/Wan2.1-T2V-1.3B-Q8_0.gguf
curl -L -o umt5-xxl-encoder-Q4_K_M.gguf https://huggingface.co/city96/umt5-xxl-encoder-gguf/resolve/b535255bee98c2b0a59ea7c0ae2dcd0c6657b3b7/umt5-xxl-encoder-Q4_K_M.gguf
curl -L -o wan_2.1_vae.safetensors https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/123acf1cc74bccbb9bfff8ac1ee72edc08c2341d/split_files/vae/wan_2.1_vae.safetensors
curl -L -o taew2_1.safetensors https://raw.githubusercontent.com/madebyollin/taehv/011dfc2112197741c540e0bdd5b7b67bcc930771/safetensors/taew2_1.safetensors
curl -L -o /tmp/dmd.safetensors https://huggingface.co/Perflow-Shuai/Wan2.1-T2V-1.3B-NonAR-DMD-4Step-LoRA-r64-iter1600-Teacher14B/resolve/5193ab05feeabc4e63436448e6609954f528a1cc/generator_lora_lightx2v.safetensors
python3 -I $S/prefix_lora.py /tmp/dmd.safetensors $B/models/loras/dmd4.safetensors
# 3) Clip principal (essai 5) : 2 s en 9:16, DMD 4 pas + TAE
B=$B W=320 H=576 F=33 T=2 DECODEUR=tae OUT=clip.avi $S/generer.sh
ffmpeg -i clip.avi -c:v libx264 -crf 18 -pix_fmt yuv420p clip.mp4
```

`scripts/generer.sh` a été vérifié de bout en bout (5 images en 256×448 : 3,9 min, 6,6 Go de RAM) avant la suppression des poids. Il lance cette commande `sd-cli` :
`-M vid_gen --diffusion-model …Q8_0.gguf --vae wan_2.1_vae.safetensors --t5xxl umt5…Q4_K_M.gguf --lora-model-dir models/loras -p "<prompt><lora:dmd4:1.0>" --cfg-scale 1.0 --sampling-method lcm --scheduler simple --steps 4 -W 320 -H 576 --video-frames 33 --fps 16 --flow-shift 5.0 -s 42 -t 2 --tae taew2_1.safetensors --temporal-tiling -o clip.avi`.
Le planificateur `simple` à 4 pas reproduit les pas de temps 1000/750/500/250 de la fiche DMD. L'échantillonneur `lcm` prédit x0
puis rebruite, ce qui est la façon d'échantillonner DMD. Le décalage 5 est celui de la fiche.

L'essai 1 (référence sans LoRA) utilisait : `--cfg-scale 6.0 --sampling-method euler --steps 10 --flow-shift 3.0 -n "<prompt négatif chinois standard de Wan, docs/wan.md>"` avec le VAE complet.

## Suite conseillée

1. **Identité des personnages** : tester **Wan2.1-VACE-1.3B** (référence image → vidéo, GGUF Apache, de 1,4 à 2,4 Go) avec le même sd.cpp
   et la fiche d'un personnage comme référence. Autre piste : **Wan2.2-TI2V-5B** en GGUF Q3/Q4 + `taew2_2`, en I2V à partir de la fiche.
   Aucune des deux n'a été testée ici.
2. **Rôle du CPU** : servir de banc d'essai nocturne (prompts, cadrages, animatiques basse définition, environ 15 min de calcul par seconde de vidéo),
   et lancer avec 4 threads quand aucun entraînement ne tourne.
3. **Production** (720p, lèvres, 2 à 4 personnages) : Kaggle T4. Le CPU ne fera jamais tourner raisonnablement S2V-14B ni les modèles 14B.
