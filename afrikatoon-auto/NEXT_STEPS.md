# Reprise — prochaine étape (à lire par Claude en début de session)

## État au 3 octobre 2026 (fin de matinée)

- **Vraie animation IA opérationnelle** : `afrikatoon/wananim.py` (moteur `--mock wan`).
  Un plan par réplique : image composée (personnage qui parle en plan rapproché, l'autre en amorce floue)
  → Wan 2.2 image→vidéo sur le Space ZeroGPU `zerogpu-aoti/wan2-2-fp8da-aoti-faster` → plan calé sur la voix,
  agrandi en 1080×1920, bruitages, gel final. Démo livrée : `output/anim-sauce/final.mp4`
  (« La sauce de belle-maman », kit `kits/2026-10-03/02b-la-sauce-de-belle-maman-anim.json`, 64 s).
  7 plans uniques (1.1, 1.2, 2.1, 2.2, 3.1, 7.1, 8.1) ; les 8 autres réutilisent un plan du même
  personnage recadré, faute de quota.
- **HF_TOKEN** : la variable contient « hf_hf_… » (préfixe collé deux fois). `config.py` le corrige
  automatiquement ; l'utilisateur peut aussi corriger la variable d'environnement.
- **Quota ZeroGPU gratuit ≈ 5 min/jour** (≈ 6 plans de 3-5 s). Épuisé le 3/10 à 08:35 UTC, retour vers
  08:00 UTC le 4/10. PRO (9 $/mois) = 40 min/jour. Coût mesuré : `output/anim-sauce/wan_log.jsonl`.
- **Voix Chatterbox** avec voix de référence à accent africain (OpenSLR 57, Apache 2.0) dans
  `state/voice_refs/` ; chaque réplique est vérifiée par Whisper (prise refaite si phrase coupée ou inventée).
- **Bibliothèque** : 38 personnages dans `assets/characters/` (dont 30 tirés de la planche
  `assets/planches/DISTRIBUTION.webp` : agrandis ×4 Real-ESRGAN + détourés ; BAYE et MODOU extraits de la
  scène de famille par segmentation SAM), 24 scènes de groupe + 5 scènes de famille dans `assets/scenes/`.
  À reprendre (découpes imparfaites, cases trop petites) : IMAM_KARIM (tête seule), GRAND-PERE_NDIAYE,
  PROFESSEUR_SAMBA, MAMIE_BINTOU (vêtements semi-transparents) → `assets_tool.extract_from_scene`
  (SAM + rembg) sur la planche ou une scène.
  Personnages des scènes encore à extraire : le marié et la mariée (`famille_ceremonie.jpg`), le juge
  (`groupe_tribunal.jpg`), la banquière (`banque.jpg`, logo Ecobank à flouter avant toute publication),
  la jeune maman (`maternite.jpg`).
- **Génération** (`afrikatoon/generate.py`, crédits Inference Providers du compte HF, ~0,10 $/mois en
  gratuit) : FLUX.1-schnell / Z-Image-Turbo (texte→image), FLUX.2-klein-4B (retouche). Test 2D réussi :
  `assets/characters_2d/MAMAN_NOUNOU/angry.png`.
- Services testés et écartés : Space Wan2.2-S2V (file bloquée), Space Wan2.1 officiel (n'accepte plus de
  tâches), LatentSync (180 s de quota par appel), Pollinations anonyme (qualité faible, filigrane).

## Retours de l'utilisateur sur la démo (à corriger en V2)

1 animation trop statique · 2 corps peu mobile · 3 expressions sans transition · 4 lip-sync ·
5 gestuelle peu narrative · 6 caméra répétitive (que des gros plans) · 7 rythme · 8 pas de réactions des
autres · 9 profondeur · 10 peu de comédie visuelle · 11 transitions brutales · 12 cadrage trop serré ·
13 sous-titres trop dominants · 14 cohérence des personnages · 15 pas de langage cinématographique.
Il est **preneur d'une version 2D haute qualité** si c'est plus rapide et gratuit.

## Plan V2

1. **Découpage cinéma** (`wananim.plan_shots`) : plan large d'installation (scène de groupe), plans
   moyens à deux, champ/contrechamp par-dessus l'épaule, plans de réaction courts (0,6-1,2 s) des
   personnages muets, gros plan seulement sur les chutes ; coupes motivées par le regard ou le geste.
2. **Jeu d'acteur** : prompts « corps entier » (épaules, buste, bras, tête ensemble), émotions qui
   montent progressivement, plans moyens moins serrés.
3. **Lip-sync** : en 2D, bouches de remplacement (visèmes) posées sur l'alignement phonétique de la
   voix ; en 3D, il faut un modèle audio→vidéo (Wan2.2-S2V / InfiniteTalk) sur GPU (Modal ou Kaggle).
4. **Sous-titres** façon TikTok : 2-3 mots à la fois, mot prononcé surligné (horodatage Whisper),
   police plus petite, bas de l'écran, sans nom du personnage.
5. **Gags visuels** : inserts générés (le chat qui lèche l'assiette, la marmite « NOUNOU », le robinet).
6. Plans manquants dès le retour du quota ; GPU gratuit si l'utilisateur fournit une clé Modal
   (30 $/mois offerts) ou Kaggle (30 h/semaine).
