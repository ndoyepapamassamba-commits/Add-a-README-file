---
name: outils-puissants-d-abord
description: Règle permanente de l'utilisateur, à appliquer AU DÉBUT DE CHAQUE REQUÊTE — chercher d'abord les outils les plus puissants du marché (génération vidéo, animation, 3D, voix, données…), mesurer leur qualité, leur vitesse, leur coût et leur licence, puis les AMÉLIORER et les INTÉGRER dans la tâche en cours, au lieu de bricoler une solution maison qui plafonne. Se déclenche à chaque demande de production (vidéo, animation, film, décor, voix, export) et dès qu'un résultat est lent ou en dessous du niveau attendu.
---

# Outils puissants d'abord — puis améliorés, puis intégrés

Règle de l'utilisateur (14/10/2026) : « Tout le temps, dans chaque requête, cherche d'abord les outils nécessaires et
puis les améliorer ensuite et les intégrer dans la tâche en cours. » — « 3 heures pour une vidéo, c'est beaucoup. »

## 1. Au début de chaque requête (avant d'écrire du code)
1. **Nommer le besoin** en capacités (ex. : « personnages qui bougent naturellement », « lèvres sur la voix », « décor
   animé », « caméra cinéma », « une vidéo en quelques minutes »).
2. **Chercher** l'état de l'art du moment pour chaque capacité : recherche web (mode `extended` pour le récent),
   Hugging Face, GitHub, pages tarifs des API. Toujours plusieurs candidats : un service en ligne (API), un modèle
   ouvert sur GPU, et ce qui tourne ici sur processeur.
3. **Mesurer avant de choisir**, sur NOS images (troupe, planches de lieux), jamais sur la démo du fournisseur :
   qualité (planche de contrôle regardée), **vitesse** (secondes par image ou par plan, matériel indiqué),
   coût ($ par seconde de vidéo, par film), licence (poids ET code).
4. **Choisir** le meilleur compromis qualité / temps / coût. Un film d'une minute doit sortir en **minutes**, pas en
   heures : si l'outil n'y arrive pas sur le processeur du conteneur, il tourne sur GPU (machine de l'utilisateur,
   GPU loué à la seconde) ou par API — jamais « on attend 3 h ».
5. **Améliorer** pour notre domaine (pilotage par les pistes du plan : voix, clignements, poses ; style de la troupe ;
   lieux d'Abidjan) et **intégrer** dans la tâche en cours, avec un contrôle qui prouve le gain (avant / après).
6. **Consigner** ici (registre ci-dessous) et dans `modeles-libres-moteur` : outil, licence, vitesse mesurée, coût,
   verdict. Une recherche déjà faite n'est pas refaite, elle est mise à jour.

## 1 bis. GRATUIT et SANS ABONNEMENT (précisions de l'utilisateur, 14/10/2026)
« Quand je parle d'outils, c'est d'outils puissants mais gratuits » — « sans que je doive m'abonner ».
- D'abord : modèles OUVERTS (MIT / Apache-2.0 / BSD) exécutés sur du calcul gratuit SANS compte : le processeur du
  conteneur, la machine de l'utilisateur (son GPU s'il en a un, via le pont Blender), des Spaces publics anonymes.
- Les API payantes (Veo, Grok, Kling…) et les services à compte (Modal, Kaggle, Runpod…) ne sont PAS proposés par
  défaut ; seulement si l'utilisateur le demande.
- Quand le calcul gratuit est lent, changer de MÉTHODE plutôt que d'attendre : calculer une fois et réutiliser
  (bibliothèques d'états, caches), cadence « en deux », aperçu basse définition (« processeur fictif »), ne calculer
  que ce qui se voit.

## 2. Garde-fous qui ne changent pas
- Licences : modèles et code **MIT, Apache-2.0, BSD** pour ce qui tourne chez nous ; les API commerciales passent par
  le coffre de clés de l'application (jamais une clé dans le dépôt ni dans la conversation, jamais de compte créé au
  nom de l'utilisateur).
- Budget : un plafond par film, affiché AVANT l'appel ; « plafond DUR » seulement s'il est réellement appliqué par le code.
- Aucune donnée inventée : vitesses et coûts mesurés ou cités avec leur source et leur date.
- Le dépôt est public : images de l'utilisateur seulement dans `.private/` ou le scratchpad.

## 3. Registre des outils (mis à jour à chaque recherche)

| Capacité | Outil | Licence | Vitesse / coût mesurés ou cités | Verdict |
|---|---|---|---|---|
| Visage vivant (lèvres, yeux, tête) depuis un dessin | LivePortrait (KwaiVGI / Kling) | MIT (code + poids) | **mesuré** : 7,9 s/image sur 4 cœurs CPU du conteneur ; ≈ 30 i/s sur GPU RTX 3090 (FasterLivePortrait, TensorRT) | retenu — `scripts/blenderfilm/liveface.py`, en BIBLIOTHÈQUE d'états (gratuit, ~0 s par film) |
| Détection de visage de la démo LivePortrait | InsightFace buffalo_l | non commercial | — | refusé : repères de la troupe + landmark.onnx de LivePortrait |
| LivePortrait accéléré | FasterLivePortrait (ONNX / TensorRT, option MediaPipe) | MIT (vérifié : LICENSE + fiche HF) | **mesuré** 17,6 s/image en ONNX sur ce CPU (pas plus rapide) ; 30+ i/s sur RTX 3090 (annoncé) | pour un GPU ; inutile sur CPU |
| Plans entièrement animés + voix + lèvres | Veo 3.1 (Google, API Gemini) | commercial (API payante) | ≈ 0,10–0,40 $/s selon version (tracker tiers, sept. 2026) | payant → seulement sur demande |
| Plans animés image → vidéo | Grok Imagine (xAI) | commercial (API payante) | ≈ 0,04–0,125 $/s selon résolution (agrégateurs, août 2026) | payant → seulement sur demande (circuit Grok de l'app) |
| Plans animés avec voix et lèvres | Kling 2.6 / 3.0 | commercial (API payante) | ≈ 0,07 $/s muet, 0,14 $/s avec audio (tiers) ; lip-sync seul ≈ 0,025 $/s | payant → seulement sur demande |
| Animation de personnage par vidéo-guide | Wan2.2-Animate 14B | Apache-2.0 (annoncé) | GPU 80 Go (officiel) ; 5B TI2V sur 24 Go | candidat GPU loué |
| Vidéo + son ouverte | LTX-2 / 2.3 (Lightricks) | licence maison (gratuite < 10 M$ de revenus) | GPU | hors règle MIT/Apache → non retenu par défaut |
| Lip-sync sur vidéo | LatentSync (ByteDance) | Apache-2.0 | 8–18 Go VRAM | candidat GPU |
| Lip-sync rapide | MuseTalk (Tencent) | MIT (à vérifier) | 4 Go VRAM | candidat GPU |
| Texte → mouvement 3D du corps | HY-Motion 1.0 (Tencent) | à vérifier | GPU | à évaluer |
| Vidéo → mocap | GVHMR | non commercial | — | refusé |
| Visage 3D depuis la voix | NVIDIA Audio2Face-3D | NVIDIA Open Model License | — | hors règle par défaut |
| Fermetures des lèvres (m/b/p) | Rhubarb Lip Sync 1.14.0 | MIT (vérifiée) | **mesuré** : 1,65 s pour 1,78 s de voix (CPU) ; fermetures A 2,25× plus dans les mots à m/b/p | retenu pour les FERMETURES seulement — `scripts/blenderfilm/lipsync.py` |
| Foule peinte séparée personne par personne | Mask R-CNN v2 (torchvision) | BSD-3 (code), poids COCO | **mesuré** : 49 s par vue, 27 personnes au Grand Marché | retenu — `scripts/blenderfilm/crowd.py` (décor vivant ancré aux pieds) |
| GPU loué à la seconde | Runpod / Modal (serverless) | service à compte | L4 ≈ 0,0001–0,0002 $/s ; H100 ≈ 0,0005–0,0011 $/s (comparatif Cerebrium, juil. 2026) | demande un compte → non proposé par défaut |

## 4. Leçons
- 14/10/2026 : LivePortrait image par image = 8 s/image sur processeur (3 h par film) → ANIMATION PAR REMPLACEMENT
  (méthode des studios : bouches de rechange d'Aardman, tableaux de bouches du dessin animé) : une bibliothèque
  d'états par pose (5 ouvertures de lèvres × 3 états des yeux) calculée UNE fois et gardée dans le kit, puis chaque
  film pioche l'état le plus proche de la voix — ≈ 2 min par pose la première fois, ~0 s par film ensuite.
  La version ONNX (FasterLivePortrait, MIT) n'accélère pas sur processeur (17,6 s/image mesurés) : elle sert au GPU.
- 14/10/2026 : un film rendu entièrement sur le processeur du conteneur (marionnette 2D + déformation du dessin) a été
  noté 10/100 : images statiques, bouches qui déforment le visage, fonds inanimés. La déformation géométrique d'un
  dessin ne remplace pas un modèle appris ; et un modèle appris sur processeur prend des heures. → Toujours chiffrer
  le temps de production dès le choix de l'outil.
