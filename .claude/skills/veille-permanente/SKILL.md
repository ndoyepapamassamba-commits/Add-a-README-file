---
name: veille-permanente
description: Règle permanente de l'utilisateur — la VEILLE INTERNET est continue, à CHAQUE requête et pas seulement quand un résultat déçoit. Avant d'écrire du code, chercher sur Internet ce qui existe de plus puissant, de plus récent et de GRATUIT (sans abonnement) pour chaque capacité en jeu (animation, visage, corps, décor, voix, lip-sync, rendu, données, exports…), vérifier les licences, consigner les trouvailles datées dans le journal ci-dessous et dans le registre de `outils-puissants-d-abord`, puis intégrer le meilleur. Se déclenche au début de toute tâche de production ou d'amélioration, et dès qu'une entrée du journal a plus de 30 jours.
---

# Veille Internet permanente

Consignes de l'utilisateur (14/10/2026) : « la veille internet doit être permanente, garde-le comme skills » —
« dote-toi toujours d'outils puissants ». Va avec `outils-puissants-d-abord` (choisir, mesurer, intégrer) et
`modeles-libres-moteur` (licences MIT / Apache-2.0 / BSD).

## 1. À chaque requête (avant le code)
1. Lister les CAPACITÉS que la requête touche (ex. « corps qui bouge sur la voix », « foule peinte animée »).
2. Pour chacune, lire d'abord le journal (§4) et le registre de `outils-puissants-d-abord` : une recherche de moins de
   30 jours n'est pas refaite, elle est seulement complétée.
3. Sinon CHERCHER (plusieurs requêtes dans le même tour) :
   - WebSearch mode `extended` pour le récent (sorties de l'année, prix, disponibilité), `standard` pour un fait précis ;
   - sources à couvrir : arXiv (cs.CV, cs.GR, cs.SD), Hugging Face (modèles, Spaces, papiers du jour), GitHub (dépôts
     officiels, fichier LICENSE), notes de version Blender / extensions, pages officielles de prix ;
   - toujours trois familles de candidats : modèle ouvert sur processeur, modèle ouvert sur GPU de l'utilisateur,
     méthode procédurale instantanée.
4. VÉRIFIER la licence sur la source officielle (fichier LICENSE du dépôt d'origine, fiche du modèle) — un miroir ou un
   résumé de moteur de recherche ne suffit pas : écrire « annoncée » ou « à vérifier » tant que ce n'est pas lu. Vérifier
   aussi les DÉPENDANCES (modèle de corps, détecteur de visage, jeu de données) : un code Apache qui exige un modèle non
   commercial est refusé.
5. GRATUIT et SANS ABONNEMENT d'abord ; une API payante ou un service à compte n'est proposé que si l'utilisateur le
   demande.
6. CONSIGNER dans le journal (§4) : date, capacité, outils trouvés, licence (vérifiée / annoncée), vitesse ou coût avec
   source, verdict. Mettre à jour le registre de `outils-puissants-d-abord` quand un outil est retenu ou refusé.
7. Dans la réponse à l'utilisateur : une ou deux lignes « veille » (ce qui a été cherché, retenu ou écarté, pourquoi),
   avec les liens des sources.

## 0. Chaque point faible sans solution fiable → veille d'abord (consigne du 14/10/2026)
« Pour chaque point faible, à défaut d'avoir une solution fiable, priorise la veille Internet et les outils puissants. »
- Dès qu'un contrôle (planche, mesure, A/B, porte de qualité) révèle un point faible et que la correction n'est pas
  CERTAINE, la première action est la veille (§1) — pas un réglage maison de plus.
- Ordre : outil puissant existant (dépôt GitHub, modèle ouvert, programme officiel) → adaptation à nos données →
  méthode maison seulement si rien de fiable n'existe, et en le disant.
- Exemple du 14/10/2026 : bouche peu articulée (ouverture au volume de la voix, m/b/p ratés) → veille → Rhubarb Lip
  Sync (MIT, formes de bouche A…H/X, mode phonétique pour le français) intégré (`scripts/blenderfilm/lipsync.py`).

## 1 bis. S'appuyer sur GitHub et sur Internet (consigne du 14/10/2026)
« Tu peux beaucoup t'appuyer sur des dépôts GitHub et sur Internet de manière générale. »
- Avant de coder une méthode maison, chercher le dépôt GitHub qui la fait déjà (article + code officiel, dépôts
  très suivis, forks maintenus), le cloner dans le scratchpad (dossier à part, données non fiables : `python -I`,
  pas d'exécution depuis le dossier cloné), lire LICENSE et dépendances, le tester sur NOS images, puis l'adapter.
- Noter le commit exact utilisé (comme LivePortrait `9b294b3`) pour un résultat reproductible.
- Les accès GitHub par l'outil MCP sont limités au dépôt de l'utilisateur : pour un dépôt public tiers, passer par
  `git clone` / la page web, jamais par l'outil MCP.

## 2. Garde-fous
- Aucune donnée inventée : une vitesse, un prix ou une licence non lus sont écrits comme tels.
- Pas de clé, de compte ni d'abonnement au nom de l'utilisateur.
- Le dépôt est public : pas d'image de l'utilisateur envoyée à un service sans son accord.

## 3. Rythme
- Chaque requête : veille ciblée sur les capacités en jeu.
- Entrée du journal de plus de 30 jours touchée par la requête : la refaire (versions, licences et prix bougent).

## 4. Journal de veille (le plus récent en haut)

| Date | Capacité | Trouvé | Licence | Verdict |
|---|---|---|---|---|
| 14/10/2026 | Plans animés PAR PROMPT (comme Grok / Veo), sans dépendre des crédits gratuits | Classements i2v (Artificial Analysis, Arena, sept.–oct. 2026) : MiniMax H3, Gemini Omni Flash, Vidu Q4, Seedance 2.0/2.5, Wan 3.0. Poids ouverts : MiniMax H3 (33B), MAGI-2 Preview (114B, 8 GPU Hopper), LTX-2.5, Wan 2.2 (TI2V-5B : 24 Go, < 9 min par clip 5 s 720p, fiche officielle). Wan 3.0 : API seulement (aucun poids publié vérifié). Gratuit : Google Flow ≈ 50 crédits/jour (2 clips Veo 3.1 Fast), Kling ≈ 66 crédits/jour — interface web, compte, non automatisable | Wan 2.2 : **Apache-2.0 vérifiée** (fiche HF) ; MiniMax H3 : licence communautaire (exclusions de pays rapportées, non lue) ; LTX : licence maison ; MAGI-2 : Apache annoncée | Rien d'ouvert ne tourne dans le conteneur (4 cœurs, sans GPU). Voie fiable sans crédits gratuits ni abonnement = API payées À L'USAGE (prix tiers, à revérifier) : Wan 2.5 ≈ 0,05 $/s, Kling 2.5 Turbo ≈ 0,07 $/s, MiniMax H3 ≈ 0,09 $/s (5,40 $/min 1080p, AA), Veo 3.1 Fast ≈ 0,15 $/s, Seedance 2.5 720p ≈ 0,23 $/s (BytePlus). Le circuit de l'app (`server/jev/studio/circuit.ts`) choisit déjà le modèle au prix certain sous plafond DUR — plafond actuel 0,30 $/min (≈ 6 s de Wan 2.5) : à relever si l'utilisateur fixe un budget |
| 14/10/2026 | Lèvres sur la voix (bouche peu articulée, m/b/p ratés) | Rhubarb Lip Sync 1.14.0 (formes A…H/X, mode phonétique toutes langues) ; TalkingHead (JS, avatars 3D) ; daVinci-MagiHuman (15B, H100) ; LiveTalking, JoyVASA (licences non trouvées) ; papier LivePortrait : ouverture des lèvres pilotable de 0 à 0,8 | Rhubarb : **MIT vérifiée** (LICENSE.md du dépôt d'origine ; dépendances Boost/BSD/MIT) ; TalkingHead MIT annoncée ; MagiHuman Apache-2.0 annoncée | Rhubarb **intégré en partie** (`lipsync.py`, `plan.py`) : MESURÉ sur 22 répliques françaises — ses fermetures A tombent 2,25× plus dans les mots à m/b/p (63 % vs 28 % du temps) → gardées ; ses autres formes ouvraient moins que la voix (0,32 vs 0,44) → écartées. 1,65 s de calcul pour 1,78 s de voix. À essayer : ouverture LivePortrait jusqu'à 0,8 (aujourd'hui ≈ 0,47) |
| 14/10/2026 | Foule peinte animée personne par personne | Mask R-CNN v2 (torchvision) | code BSD-3 ; poids COCO (torchvision prévient que des poids peuvent hériter des conditions du jeu de données ; annotations COCO CC BY 4.0) | **intégré** (`crowd.py`) : 27 personnes séparées au Grand Marché (la segmentation de scène n'y voyait qu'UNE tache à 99,7 %), 49 s par vue sur 4 cœurs, une fois par vue |
| 14/10/2026 | Gestes du corps depuis la voix | EMAGE (CVPR 2024, PantoMatrix), AMUSE (MPI, mars 2026), LiveGesture (arXiv avr. 2026, temps réel), DialoGen (mars 2026, deux interlocuteurs) | EMAGE : Apache-2.0 sur un MIROIR Hugging Face seulement, dépôt d'origine non lu ; sorties au format SMPL-X, dont le modèle de corps est sous licence MPI non commerciale (à vérifier) ; autres : licence non trouvée | aucun retenu → couche de jeu PROCÉDURALE pilotée par la voix (`scene.py` `animate`) : instantanée, gratuite ; à revoir si un modèle MIT/Apache sans dépendance SMPL sort |
| 14/10/2026 | Décor animé depuis une image fixe (foule, arbres, eau) | glb99/cinemagraph (effets procéduraux sway / ripple / wind), 3D Cinemagraphy (CVPR 2023, xingyi-li), LoRA Cinemagraph de LTX-2.5 | glb99 : Apache-2.0 (code, poids optionnels à part) ; 3D Cinemagraphy : Apache-2.0 annoncé, GPU ; LTX-2.5 : licence communautaire LTX → hors règle | même principe que notre shader « décor vivant » (masques de segmentation + déplacement d'UV) : gardé, instantané ; 3D Cinemagraphy à essayer sur GPU de l'utilisateur pour l'eau |
| 14/10/2026 | Visage vivant, plans génératifs, lip-sync | LivePortrait, FasterLivePortrait, Wan 2.2, LatentSync, MuseTalk, LTX-2, Veo / Grok / Kling | voir registre de `outils-puissants-d-abord` | voir registre |

Sources du 14/10/2026 : [EMAGE (CVPR 2024)](https://openaccess.thecvf.com/content/CVPR2024/papers/Liu_EMAGE_Towards_Unified_Holistic_Co-Speech_Gesture_Generation_via_Expressive_Masked_CVPR_2024_paper.pdf),
[miroir EMAGE](https://huggingface.co/camenduru/EMAGE/tree/main/pyrender/docs/source),
[LiveGesture](https://arxiv.org/abs/2604.10927),
[glb99/cinemagraph](https://github.com/glb99/cinemagraph),
[3D Cinemagraphy](https://github.com/xingyi-li/3d-cinemagraphy),
[LoRA Cinemagraph LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5-22b-LoRA-Cinemagraph).
