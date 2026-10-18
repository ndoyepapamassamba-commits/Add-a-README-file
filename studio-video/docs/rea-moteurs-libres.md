# Moteurs libres analysés par REA (18/10/2026)

Consigne : « demande à REA d'analyser des moteurs accessibles fonctionnels », puis « utilise les résultats de REA en
priorité pour parfaire le moteur » et « continue la veille sur l'analyse d'autres moteurs par REA ».
REA (`rea analyze-javascript-application`, paquet `rea-agents@6.5.0`, MIT) sur les paquets npm publiés ; licences lues
dans les fiches npm ; Spine écarté (licence propriétaire). Chaque ligne cite la preuve REA et l'endroit exact du code.

## Lot 1

| Moteur (licence) | Preuve REA | Durée | Nœuds de syntaxe | Ce que REA a montré | Usage chez nous |
|---|---|---|---|---|---|
| DragonBones pour Pixi 5.7.0-1 (MIT) | `ev_0b47f7a2…` | 17,5 s | 72 590 | peau pondérée `PixiSlot._updateMesh` (l. 15698-15738 : xG = Σ w·(M_os·v)) ; IK à deux os analytique `IKConstraint._computeB` (l. 6646-6730, sens du coude `bendPositive`) | peau pondérée codée (`moteur-troupe/peau_ponderee.py`), mesurée par JEV : pas de gain → option désactivée |
| lottie-web 5.13.0 (MIT) | `ev_169a9ba4…` | 23,8 s | 105 295 | `BezierEasing` (G. Renaudeau, MIT) l. 2341-2470 : courbes d'accélération (table + Newton-Raphson) | courbes des gestes (gain JEV 0,57 sur l'image fixe ; à mesurer sur la fluidité) |
| MediaPipe Tasks Vision 1.1.1 (Apache-2.0) | `ev_e616511b…` | 17,0 s | 50 437 | exports : FaceLandmarker (52 blendshapes, matrices), PoseLandmarker, HandLandmarker, HolisticLandmarker, InteractiveSegmenter | segmentation exacte du bras (MagicTouch, déjà en local) : remède suivant de JEV (gain 2,39) |
| Transformers.js 4.3.1 (Apache-2.0) | `ev_20a48a7d…` | 34,5 s | 123 285 | DepthAnything / DepthPro (l. 24142-24148), `BackgroundRemovalPipeline` (l. 30118), entrées vidéo des modèles vision-langage | détourage dans le navigateur pour « Animer mon image » |
| Theatre.js core 0.7.2 (Apache-2.0) | `ev_f23aca2b…` | 15,1 s | 31 350 | images clés à poignées de Bézier (l. 1038-1145), couleurs interpolées en Lab (l. 5378) | raccords de couleur entre plans |
| Rive canvas 2.45.0 (MIT) | `ev_9348365b…` | 21,9 s | 99 224 | machines à états (l. 2875-3071), entrées typées (l. 5015-5029) ; moteur en WASM (non analysé) | états de jeu des personnages (repos → parole → réaction) |

## Lot 2

| Moteur (licence) | Preuve REA | Durée | Nœuds | Ce que REA a montré | Usage chez nous |
|---|---|---|---|---|---|
| Kalidokit 1.1.5 (MIT) | `ev_79b8aa8b…` | 6,0 s | 7 933 | solveurs `calcArms` / `rigArm` (l. 587-628), `calcLegs` (l. 737), yeux et pupilles (l. 1031-1091), bouche (l. 1133) | transposer le jeu des TikTok de l'utilisateur sur le squelette de la troupe |
| three-vrm 3.5.5 (MIT) | `ev_4fd34ce1…` | 15,9 s | 33 842 | ressorts secondaires `SpringBone` (l. 5132-5186 : raideur, gravité, traînée, collisions) | foulards, pagnes, cheveux qui suivent le corps |
| wawa-lipsync 0.0.2 (MIT) | `ev_8e6a6f6f…` | 3,0 s | 1 731 | FFT par bandes + volume + centroïde spectral → visème (l. 116-177) | lèvres depuis le son de nos voix |
| TalkingHead 1.7.0 (MIT) | `ev_51f556f6…` | 11,2 s | 38 234 | file d'animations, gestes, humeurs, `lipsyncLang` (l. 2799-2865) ; module `lipsync-fr.mjs` : règles graphème → visème du FRANÇAIS et durées par visème | lèvres françaises depuis le texte des répliques (porte B « bouche » du film) |
| popmotion 11.0.5 (MIT) | `ev_adc4b165…` | 8,8 s | 7 252 | ressort amorti (`dampingRatio`, raideur, masse, `restDelta`, l. 56-153) | gestes et tête au rythme naturel (porte I « fluidité ») |
| three.js CCDIKSolver (MIT) | `ev_c35b9a59…` | 3,7 s | 1 688 | IK CCD avec bornes de rotation (l. 146-227), `chainBlend` | coudes et genoux bornés (jamais à l'envers) |

## Première greffe mesurée : la peau pondérée (DragonBones)

JEV a désigné ce remède pour les gestes articulés (`conseil/bras_conseil_rea.json` : cause « bras découpé » 0,68,
remède « peau pondérée » 0,78). Codé dans `moteur-troupe/peau_ponderee.py`, branché sur `rig2d.rendre`
(`bras_articules.prepare(..., ponderee=True)`) :
- au repos, la peau rend la peinture au pixel près (écart nul) ; 2,7 ms par bras ; aire du bras gardée à 98-100 % pour
  les gestes courants, 95 % coude plié à 90° ;
- jugée par JEV sur les 24 images (4 gestes × 3 ampleurs × 2 personnages), défaut moyen : calques rigides 0,83 / 0,88 ;
  peau à fondus longs 0,87 / 0,93 ; peau à fondus courts (remède désigné ensuite, `bras_conseil_ab.json`) 0,87 / 0,94.
- Verdict : pas de gain mesuré, l'option reste désactivée ; les gestes articulés restent hors du film. Cause restante
  selon JEV : le masque du bras emporte du vêtement (0,83) → greffe suivante : segmentation exacte du bras (MagicTouch).
