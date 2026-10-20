# Revérification du catalogue OpenRouter — 14/10/2026 (après la question « et Grok ? »)

Lecture directe des API publiques, sans clé : `GET https://openrouter.ai/api/v1/models?output_modalities=all` (667 modèles),
`GET https://openrouter.ai/api/v1/videos/models` (30 modèles). Calcul : `couts.py` (scratchpad), sur les 23 plans réels du
film 6 (64,0 s). Chaque plan est facturé à la plus petite durée acceptée ≥ sa durée ; image de départ facturée quand le
modèle la facture ; une seule prise par plan. Plans clés = 0, 18, 19 (3,28 + 2,0 + 0,56 s). Hybride = les 11 plans à deux
+ l'accroche (les 11 gros plans parlés restent dans le moteur).

## 1. Qui génère de la vidéo ? (LU)
- Sorties déclarées sur les 667 modèles : texte 446, image 47, embeddings 37, voix 35, **vidéo 30**, transcription 25,
  décisions 22, image+texte 12, rerank 9, audio+texte 4.
- Les 30 modèles « vidéo » de `/models` sont exactement les 30 de `/videos/models` : **aucun générateur vidéo caché dans
  une autre catégorie**. Les modèles « omni » (Qwen 3.8 Omni Flash, Nemotron 3 Nano Omni, MiMo v2.5) LISENT la vidéo et
  écrivent du texte ; Grok Imagine Image ne sort que des images.
- **101 modèles lisent la vidéo** (juges possibles de nos clips), dont 3 gratuits : `google/gemma-4-31b-it:free`,
  `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`.
- **17 modèles texte gratuits** (`:free`), dont des modèles de code (`cohere/north-mini-code:free`,
  `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`) : ils ne fabriquent pas de pixels, mais peuvent
  ÉCRIRE l'animation (Three.js du bac à sable Studio 3D Pro, bpy ou paramètres de jeu de notre moteur Blender), que nos
  moteurs rendent ensuite en vidéo à 0 $ de calcul vidéo.

## 2. Coût sur le film 6 (CALCUL depuis les prix lus ce jour)
```
plans: 23 (64.00 s) ; clés [3.28, 2.0, 0.56] ; hybride 12 plans
modèle                             images            rés      $/s prix            s fact.   film  clés  hybr. min s
bytedance/seedance-1-5-pro         première+dernière 480p  0.0115 estimé (jetons)      96   1.11  0.14   0.60     4
x-ai/grok-imagine-video-1.5-lite   première          480p  0.0200 certain              74   1.71  0.17   0.92     1
heygen/heygen-video-1              première          480p  0.0200 certain             117   2.34  0.30   1.24     5
google/veo-3.1-lite                première+dernière 720p  0.0300 certain              98   2.94  0.36   1.62     4
bytedance/seedance-2.0-mini        première+dernière 480p  0.0336 estimé (jetons)      96   3.23  0.40   1.75     4
x-ai/grok-imagine-video            première          480p  0.0500 certain              74   3.75  0.36   2.02     1
alibaba/wan-3.0                    première          480p  0.0500 certain              75   3.75  0.40   2.00     2
bytedance/seedance-2.0-fast        première+dernière 480p  0.0404 estimé (jetons)      96   3.87  0.48   2.10     4
alibaba/wan-3.0-prime              première          480p  0.0680 certain              75   5.10  0.54   2.72     2
minimax/hailuo-3-max               première+dernière 480p  0.0500 certain             117   5.85  0.75   3.10     5
x-ai/grok-imagine-video-1.5        première          480p  0.0800 certain              74   6.15  0.59   3.32     1
bytedance/seedance-2.0             première+dernière 480p  0.0673 estimé (jetons)      96   6.46  0.81   3.50     4
kwaivgi/kling-v3.0-std             première+dernière 720p  0.0840 certain              81   6.80  0.84   3.70     3
alibaba/wan-2.7                    première+dernière 720p  0.1000 certain              75   7.50  0.80   4.00     2
google/veo-3.1-fast                première+dernière 720p  0.0800 certain              98   7.84  0.96   4.32     4
alibaba/happyhorse-1.0             première          720p  0.0988 certain              81   8.00  0.99   4.35     3
alibaba/happyhorse-1.1             première          720p  0.0988 certain              81   8.00  0.99   4.35     3
runway/gen-4.5                     première          720p  0.1200 certain              75   9.00  0.96   4.80     2
kwaivgi/kling-v3.0-pro             première+dernière 720p  0.1120 certain              81   9.07  1.12   4.93     3
bytedance/seedance-2.5             première+dernière 480p  0.1028 estimé (jetons)      96   9.87  1.23   5.35     4
alibaba/wan-2.6                    première          720p  0.1000 certain             120  12.00  1.50   6.50     5
kwaivgi/kling-video-o1             première+dernière 720p  0.1120 certain             120  13.44  1.68   7.28     5
google/veo-3.1                     première+dernière 720p  0.2000 certain              98  19.60  2.40  10.80     4
black-forest-labs/flux-3-video     première+dernière 720p  0.1700 certain             117  19.89  2.55  10.54     5
grok-1.5-lite 720p 74 2.45 0.24 1.32
```
Colonnes : `$/s` à la résolution la moins chère proposée (480p, sinon 720p) ; `s fact.` = secondes facturées ; `film`,
`clés`, `hybr.` en dollars ; `min s` = durée minimale d'un clip.

- Grok Imagine 1.5 Lite : 0,02 $/s en 480p (0,03 $/s en 720p) + 0,01 $ par image de départ ; durées de 1 à 15 s, donc
  presque pas de secondes perdues. Une minute de film ≈ 1,20 $ en théorie (60 s × 0,02 $) plus 0,01 $ par plan ; le film 6
  coûte **1,71 $ en 480p, 2,45 $ en 720p**. Limite : première image seulement (la fin du plan n'est pas épinglée).
- Grok Imagine Video (ancien, 5 ¢/s 480p) et Grok Imagine Video 1.5 (8 ¢/s 480p) : plus chers sans avantage pour nous.
- Seedance (ByteDance) est facturé au jeton vidéo. Formule donnée par des fournisseurs tiers (pas par OpenRouter) :
  jetons = largeur × hauteur × 24 i/s × durée / 1024. Avec 480×854 : Seedance 1.5 Pro sans son ≈ 0,0115 $/s → film 6
  ≈ 1,11 $ **ESTIMÉ** (première + dernière image) ; à confirmer par un appel réel (le coût revient dans `usage.cost`).
- HeyGen Video 1 est décrit comme modèle GÉNÉRAL (pas un avatar) ; l'app l'écarte encore par son nom. Sur nos plans courts
  il coûte plus que Grok (durée minimale 5 s) : 2,34 $ le film 6.

## 3. Défaut trouvé et corrigé
- La doc OpenRouter : `generate_audio` « Defaults to `true` for models that support audio output ». Le circuit n'envoyait
  pas ce champ : Veo 3.1 Lite aurait été facturé **0,05 $/s au lieu de 0,03** (son généré puis jeté), Kling 3.0 Std 0,126
  au lieu de 0,084, alors que le plafond se calculait au prix muet. Corrigé : `circuitAudio()` demande le silence aux
  modèles qui savent faire du son (test unitaire sur le catalogue réel).
