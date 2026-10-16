# Avis de tiers — chaîne d'animation MASSAMBA Workbench

Établi le 16/10/2026 pour la spécification « Moteur d'animation fluide et chaîne de production libre » (§5 et §9).
L'état réel de chaque outil (version lue sur la machine, test de santé, conformité) est dans `tool-manifest.json`,
produit par `python3 scripts/tool-health.py`.

**Règle maison :** le code et les modèles exécutés chez nous doivent être sous MIT, Apache-2.0 ou BSD. Les composants
hors règle sont signalés ci-dessous, avec la façon dont ils sont isolés et ce qui les remplacera.

## Composants embarqués ou chargés par l'app (navigateur)

| Composant | Version | Licence | Amont | Rôle |
|---|---|---|---|---|
| three.js | 0.186.1 | MIT | github.com/mrdoob/three.js | décor en relief, personnages maillés, étalonnage |
| mp4-muxer | 5.2.2 | MIT | github.com/Vanilagy/mp4-muxer | MP4 depuis WebCodecs dans la page |
| mediabunny | 1.61.3 | MPL-2.0 | github.com/Vanilagy/mediabunny | muxage dans l'app — **copyleft faible au niveau fichier** : fichiers non modifiés, source amont citée |
| Marionnette ARAP (`server/jev/studio/actor/arap.ts`, `puppetMotion.ts`) | maison | — | code de l'app | dessins pliés autour du squelette (Sorkine & Alexa 2007) |
| Moteur squelettique 2D (`server/jev/studio/actor/armature2d.ts`) | maison, 16/10/2026 | — (réécrit, aucune ligne copiée) | méthode du runtime DragonBones, **MIT** (github.com/DragonBones/DragonBonesJS, lu pour la méthode) | os, peau pondérée, IK deux os, mélange en couches ; peau par nombres duaux d'après Kavan et al. 2007 (publication) |
| Poids de peau par diffusion de chaleur (`boneHeat.ts`) | maison | — | méthode Pinocchio, Baran & Popović 2007 (publication) | poids de chaque os sur le maillage du dessin |
| Ressorts analytiques (`server/jev/studio/actor/ressorts.ts`) | maison, 16/10/2026 | — | repris du « moteur fluide » du même dépôt (branche `claude/youthful-pasteur-7wbiqt`, même auteur) ; paramétrage (f, ζ, r) de t3ssel8r (vidéo « Giving Personality to Procedural Animations using Math », méthode) | dépassement, retour au calme, chevauchement des os, en forme fermée |
| Membres séparés (`limbs.ts`) | maison | — | code de l'app | coupe du maillage entre parties non articulées (option, désactivée par défaut) |
| Caméra qui accompagne (film de la troupe) | maison, 16/10/2026 | — (réécrit) | méthode de Phantom Camera (Godot), **MIT** (github.com/ramokz/phantom-camera, lu pour la méthode : zone morte « cadrée », SmoothDamp) | travelling qui suit la tête, immobile sur les temps comiques |
| Corps entier vivant | maison | — | méthode de Perlin, « Real Time Responsive Animation with Personality » (IEEE TVCG 1995, publication) | transfert du poids, buste, élan vers l'autre |
| Mâchoire, tête qui tourne, regard (déformeurs paramétriques) | maison | — | méthode des paramètres de Live2D / Inochi2D (**BSD-2**, méthode seulement) ; ComfyUI-AdvancedLivePortrait consulté (aucune licence publiée : rien repris) | bouche lisible, tête et yeux vers l'autre |
| Composition « format de la chaîne » (`scripts/blenderfilm/compose_chaine.py`) | maison | — | mesurée sur la vidéo TikTok la plus vue de l'utilisateur | clip au centre, fond flouté, sous-titres karaoké |
| Chaîne « troupe générée » (`scripts/troupe-generee/`) | maison, 16/10/2026 | — | voir les outils ci-dessous | fiches et scènes générées, juge JEV, incrustation à l'échelle, plaque LaMa, visages greffés, tournage et montage au format de la chaîne |
| jevlib (`server/jev/sandbox/jevlib*.ts`) | 1.1 | — | code de l'app | parole, cinéma, contrôle qualité |
| Mâchoire paramétrique (`scripts/troupe-generee/tourne.py`, `bouche_param`) | maison, 16/10/2026 | — (réécrit) | méthode des déformeurs de Live2D / Inochi2D (**BSD-2**, méthode seulement) | bouche des visages que LivePortrait n'ouvre pas (barbe, lunettes noires) : lèvre et menton déplacés par un champ doux, intérieur de bouche peint |

## Outils lancés en processus séparé (pas liés à notre code)

| Outil | Version | Licence | Amont | Rôle | Statut |
|---|---|---|---|---|---|
| Chromium (headless, Playwright) | 141.0.7390.37 | BSD-3-Clause (+ tiers) | chromium.org | rendu image par image | conforme |
| Playwright | 1.56.1 | Apache-2.0 | github.com/microsoft/playwright | pilotage du navigateur | conforme |
| MediaPipe (Pose Landmarker) | 1.1.0 | Apache-2.0 (code) | github.com/google-ai-edge/mediapipe | squelette mesuré sur chaque dessin | conforme ; fiche du modèle à relire |
| MediaPipe Hand Landmarker (`hand_landmarker.task`) | 0.10 | Apache-2.0 | github.com/google-ai-edge/mediapipe | mains des planches (scripts/troupe_poses.py) | conforme |
| MediaPipe Interactive Segmenter « MagicTouch » | 0.10 | Apache-2.0 | github.com/google-ai-edge/mediapipe | découpe des figurants guidée par le squelette (scripts/scene_layers.py) | conforme |
| BiRefNet-lite | — | MIT | github.com/ZhengPeng7/BiRefNet | masque des sujets (atlas des décors) | conforme |
| UperNet ConvNeXt ADE20K (ONNX) | — | MIT | github.com/open-mmlab/mmsegmentation | analyse de scène (atlas des décors) | conforme |
| pyloudnorm | 0.2.0 | MIT | github.com/csteinmetz1/pyloudnorm | mesure et réglage de la sonie (−14 LUFS) | conforme ; hors app (chaîne de film) |
| yt-dlp | 2026.08.19 | Unlicense | github.com/yt-dlp/yt-dlp | veille seulement (mesure de vidéos publiques, rien redistribué) | hors app |
| MediaPipe Selfie multiclass | — | Apache-2.0 | github.com/google-ai-edge/mediapipe | évalué puis écarté (fragmente les figures peintes) | non utilisé |
| OpenCV | 5.0 | Apache-2.0 | opencv.org/license | retouche de couture du décor (Telea) | conforme |
| NumPy | 2.4 | BSD-3-Clause | numpy.org | synthèse du sol (quilting), contrôles | conforme |
| onnxruntime | 1.31 | MIT | github.com/microsoft/onnxruntime | inférence CPU | conforme |
| Rhubarb Lip Sync | 1.14.0 | MIT | github.com/DanielSWolf/rhubarb-lip-sync | contrôle indépendant des bouches ; depuis le 16/10/2026, visèmes du tournage « troupe générée » (mode phonétique, `levres.py`) | conforme |
| Z-Image-Turbo (Tongyi-MAI) via AI Horde | 6B, turbo | **Apache-2.0** (modèle) ; AI Horde : service communautaire gratuit, usage anonyme | huggingface.co/Tongyi-MAI/Z-Image-Turbo ; aihorde.net | fiches personnages et scènes 3D | conforme ; exécuté hors de chez nous |
| WORLD (vocodeur) + pyworld | 0.3.4 | BSD modifiée (WORLD) ; MIT (pyworld) | github.com/mmorise/World ; github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder | hauteur, étendue et timbre des voix au ton de la chaîne | conforme |
| EasyOCR | 1.7 | Apache-2.0 | github.com/JaidedAI/EasyOCR | repérer le texte parasite des images générées (effacé par LaMa) | conforme |
| faster-whisper (Whisper small) | 1.1.0 | MIT | github.com/SYSTRAN/faster-whisper | contrôle d'intelligibilité de chaque réplique | conforme |
| JEV 1.14 (TypeSafe, System One, images) | 1.14 | service connecté (clé injectée par le mandataire, jamais dans le code) | docs.typesafe.ai | juge de cohérence des images (identité, taille, cadrage, texte, lieu) | service externe |
| FFmpeg / ffprobe (paquet Ubuntu) | 6.1.1 | **GPL-2.0-or-later** (compilé avec `--enable-gpl`, libx264) | ffmpeg.org/legal.html | encodage H.264/AAC, sous-titres, contrôle | **hors règle** — lancé comme programme séparé, jamais lié ni redistribué. Voie conforme existante : WebCodecs VP9/AV1 + Opus (BSD) et mp4-muxer (MIT) |
| piper-tts (piper1-gpl) | 1.8.0 | **GPL-3.0-or-later** | github.com/OHF-voice/piper1-gpl | synthèse vocale FR et durées de phonèmes | **hors règle** — à remplacer (Kokoro-82M Apache-2.0, Pocket TTS code MIT) |

## Données et modèles (licences distinctes du code)

| Ressource | Licence | Obligation / statut |
|---|---|---|
| Voix Piper `fr_FR-siwis-medium` | CC-BY-4.0 | **attribution** : crédit incrusté en fin de film |
| Voix Piper `fr_FR-tom-medium` | données d'entraînement **AGPL-3.0** (fiche du modèle) | **à remplacer avant toute diffusion** |
| Couches de visage générées avec LivePortrait | code MIT ; détecteur de visage tiers à licence distincte | à vérifier avant diffusion commerciale |
| Planches, décors et voix de la troupe | propriété de l'utilisateur | jamais dans le dépôt public (`workbench/.private/`) |
| Capture de mouvement CMU (mocap.cs.cmu.edu, essais 13, 14, 18, 19, 22, 23, 77, 113, 141) | usage libre, y compris commercial, selon la page de la base ; remerciement demandé (« The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217. ») | retargetée en 2D par `scripts/blenderfilm/mocap2d.py` (méthode d'Animated Drawings, Meta, **MIT**) ; remerciement à mettre au générique de fin |
| Voix Piper `fr_FR-gilles-low` | **CC0** (données) | aucune obligation ; voix d'hommes de la troupe recréée |
| Voix Piper `fr_FR-mls-medium` | CC-BY 4.0 | **écartée** : charabia mesuré par Whisper (16/10/2026) |
| Microsoft Fluent Emoji 3D (cartes de transition) | MIT | © Microsoft Corporation, licence jointe (`server/assets/FLUENT-EMOJI-LICENSE.txt`) |
| Police des sous-titres DejaVu Sans Bold | licence Bitstream Vera / DejaVu (permissive) | — |
| Police Montserrat (sous-titres karaoké) | SIL Open Font License 1.1 | police libre, redistribuable avec sa licence ; téléchargée dans le cache local, pas dans le dépôt |

## Évalués par la veille, non utilisés dans le film

| Outil | Licence | Constat |
|---|---|---|
| Synfig | GPL-3.0-or-later | rendu cut-out en ligne de commande possible ; déformation par os non documentée |
| MLT / melt | LGPL-2.1-or-later | rendu de timeline sans écran (attention : 720×576 à 25 i/s par défaut) |
| OpenTimelineIO | Apache-2.0 | timeline d'échange ; pas de piste de sous-titres native |

**Rappel :** les films produits ne deviennent pas GPL parce qu'un outil GPL les a encodés. Redistribuer un logiciel GPL
modifié, ou lier sa bibliothèque à notre code, imposerait en revanche ses obligations. C'est pourquoi les outils GPL
restent des programmes séparés, que l'app ne livre pas.
