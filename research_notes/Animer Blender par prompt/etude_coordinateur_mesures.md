# Étude du coordinateur — mesures et lectures directes (14/10/2026)

Faits observés directement dans cette session (pas d'agrégateur). Ils complètent les quatre notes thématiques.

## 1. Hugging Face ZeroGPU, appel anonyme depuis notre conteneur cloud — MESURÉ
- `gradio_client` 2.7.2 installé ; `Client('zerogpu-aoti/wan2-2-fp8da-aoti-faster').view_api()` répond sans compte :
  endpoint `/generate_video(input_image, prompt, steps=6, negative_prompt, duration_seconds=3.5, guidance_scale,
  guidance_scale_2, seed, randomize_seed) -> (video, seed)` (Wan 2.2 I2V, FP8, AoT).
- Premier appel réel (image de test libre « Big Buck Bunny », CC BY 3.0, Blender Foundation, jamais une image de
  l'utilisateur) : refus immédiat en 3,6 s — « You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging
  Face token for more quota ». Le quota anonyme est partagé par adresse de sortie (proxy du conteneur cloud) : **inutilisable
  depuis ce conteneur sans le jeton de l'utilisateur** (compte gratuit : 5 min/jour ≈ 4 clips).

## 2. OpenRouter vidéo — LU sur l'API publique `GET https://openrouter.ai/api/v1/videos/models` (HTTP 200, sans clé)
- 30 modèles. L'application les lit DÉJÀ : `workbench/server/jev/studio/capabilities.ts` (« GET /videos/models »,
  capacités `IMAGE_TO_VIDEO` et `FIRST_LAST_FRAME` déduites de `supported_frame_images`) et `circuit.ts` (choix du modèle
  au prix CERTAIN par seconde, plafond DUR par film — actuellement 0,30 $ par minute de film).
- Prix bruts lus (`pricing_skus`), sans audio, et modes d'image :

| Modèle (id OpenRouter) | Images de départ | Durées (s) | Prix lu |
|---|---|---|---|
| x-ai/grok-imagine-video-1.5-lite | première | 1–15 | 2 ¢/s 480p, 3 ¢/s 720p, 14 ¢/s 1080p, + 1 ¢ par image d'entrée |
| google/veo-3.1-lite | première + dernière | 4, 6, 8 | 0,03 $/s sans audio 720p (0,05 avec audio) |
| google/veo-3.1-fast | première + dernière | 4, 6, 8 | 0,08 $/s sans audio 720p (0,10 avec audio) |
| minimax/hailuo-3-max | première + dernière | 5–15 | 0,05 $/s 480p, 0,08 $/s 768p |
| alibaba/wan-3.0 | première | 2–30 | 0,05 $/s 480p, 0,10 $/s 720p |
| alibaba/wan-2.7 | première + dernière | 2–10 | 0,10 $/s |
| kwaivgi/kling-v3.0-std | première + dernière | 3–15 | 0,084 $/s (0,126 avec audio) |
| kwaivgi/kling-v3.0-pro | première + dernière | 3–15 | 0,112 $/s |
| runway/gen-4.5 | première | 2–10 | 12 ¢/s |
| runway/aleph-2 (édition vidéo) | — | — | 28 ¢/s, minimum 56 ¢ |
| black-forest-labs/flux-video-edit (édition vidéo) | — | — | 3 ¢/s |
| heygen/avatar-iv (avatar piloté par l'audio) | — | — | 0,05 $/s |
| bytedance/seedance-* | première + dernière | 4–15 (2.5 : 4–30) | facturé au JETON vidéo → prix non certain avant l'appel (exclu par `circuit.ts`) |

## 3. Coût exact sur le film 6 (23 plans, 64,0 s, plans de 0,56 à 6,72 s) — CALCUL depuis les prix lus
Chaque plan est facturé à la plus petite durée autorisée ≥ sa durée. Plans clés = accroche (plan 0) + deux plans de chute
(« punch ») : 3,3 + 2,0 + 0,6 s.

| Modèle | Mode | Secondes facturées | Film entier | 3 plans clés |
|---|---|---|---|---|
| Grok Imagine 1.5 Lite 480p | première | 74 | 1,71 $ | 0,17 $ |
| Grok Imagine 1.5 Lite 720p | première | 74 | 2,45 $ | 0,24 $ |
| Veo 3.1 Lite 720p sans son | première + dernière | 98 | 2,94 $ | 0,36 $ |
| Wan 3.0 480p | première | 75 | 3,75 $ | 0,40 $ |
| Hailuo 3 Max 480p | première + dernière | 117 | 5,85 $ | 0,75 $ |
| Kling 3.0 Std 720p | première + dernière | 81 | 6,80 $ | 0,84 $ |
| Wan 2.7 720p | première + dernière | 75 | 7,50 $ | 0,80 $ |
| Veo 3.1 Fast 720p sans son | première + dernière | 98 | 7,84 $ | 0,96 $ |

Une seule prise par plan ; les reprises multiplient. Le plafond actuel du circuit (0,30 $/min) ne couvre que les plans
clés en Grok Lite.

## 4. Conséquences pour notre moteur (déductions)
- La chaîne « Blender rend la PREMIÈRE et la DERNIÈRE image de chaque plan → un modèle première+dernière image anime
  l'entre-deux par prompt » verrouille l'identité des personnages et la mise en place aux deux bouts du plan (raccords
  propres entre plans). Modèles OpenRouter compatibles : Veo 3.1 Lite/Fast, Kling 3.0, Hailuo 3 Max, Wan 2.7.
- Les lèvres générées ne suivent pas nos voix françaises : pour les répliques en gros plan, un modèle piloté par
  l'AUDIO (avatar) ou une resynchronisation (LivePortrait / LatentSync sur GPU) reste nécessaire.
- Le conteneur n'a pas de GPU et le quota ZeroGPU anonyme est épuisé : les modèles ouverts ne peuvent tourner que sur
  le GPU de l'utilisateur, Kaggle (compte de l'utilisateur) ou par API à l'usage.
