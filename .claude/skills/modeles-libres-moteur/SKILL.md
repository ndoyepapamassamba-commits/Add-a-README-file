---
name: modeles-libres-moteur
description: Démarche permanente pour aller vite vers une qualité internationale — chercher d'abord un modèle existant (libre, ou privé dont on reproduit la méthode publiée), l'adapter au moteur Blender (et aux moteurs à venir), puis l'AMÉLIORER pour notre domaine. À appliquer à chaque nouveau besoin du moteur film (vision, géométrie, gestes, voix, lip-sync, vues des lieux…).
---

# Modèles libres → reproduits → améliorés → intégrés au moteur

Règle de l'utilisateur : « pour aller vite, cherche des modèles libres ou privés que tu peux reproduire dans le moteur
et dans tous les autres moteurs qui vont venir » ; « reproduction et amélioration de modèle ».

## 0. Aucun blocage n'arrête le moteur (règle de l'utilisateur : « trouver des solutions comme Dreamshaper pour tout
blocage », « chercher automatiquement une autre alternative »)
- Chaque dépendance externe a une CHAÎNE DE RECHANGE codée : copie locale → source officielle → miroir des mêmes poids
  (même licence) → modèle équivalent libre → méthode sans téléchargement ; le journal dit laquelle a servi.
- Un téléchargement long reprend où il s'est arrêté (HTTP Range) ; une erreur 5xx d'un hub = source suivante, pas un échec.
- Quand une approche « faite main » plafonne (formes procédurales trop simples face au style de la troupe), chercher le
  modèle qui débloque (ex. : photo réelle libre + reprise dans le style par un modèle de diffusion libre).

## 1. Chercher avant de coder
- Hugging Face (API `https://huggingface.co/api/models?search=…`, filtres `onnx`, `pipeline_tag`), GitHub, articles.
- Préférer un modèle déjà au format **ONNX** (exécuté par `onnxruntime`, déjà présent dans la chaîne) ; sinon le convertir
  soi-même depuis les poids OFFICIELS (jamais un export anonyme dont la provenance n'est pas vérifiable).

## 2. Licence vérifiée à la source (bloquant)
- Accepté : **MIT, Apache-2.0, BSD** (poids ET code). Lire la licence du dépôt des poids, pas seulement celle du code.
- Refusé pour les vidéos monétisées : non commercial (CC-BY-NC, licences « research only », NVIDIA Source Code License,
  CPML…), même si le modèle est meilleur.
- Modèle **privé** : on reproduit la MÉTHODE publiée (article, algorithme) avec des poids libres ou notre propre
  implémentation. Jamais de copie de poids propriétaires, jamais de contournement de conditions d'utilisation.
- Noter le modèle, sa licence et sa source dans l'en-tête du script qui l'utilise.

## 3. Reproduire fidèlement
- Conversion ONNX validée contre l'original : écart maximal des sorties et accord des décisions (ex. argmax ≥ 99,9 %).
- Mesurer le temps sur CPU (la machine de l'utilisateur) ; mettre le modèle en cache dans `~/.cache/massamba-models`
  (jamais commité) ; calculer UNE fois par ressource et garder le résultat à côté (art privé → `.private/`).

## 4. Améliorer pour notre domaine
- Croiser le modèle avec nos lois et mesures (géométrie du relief, physique, proxémie, style de la troupe) : la décision
  finale est la fusion, pas la sortie brute du modèle.
- Contre-épreuve : montrer un cas où le modèle seul se trompe et où la fusion corrige, et un cas où le contrôle
  attrape le défaut quand la loi est désactivée.

## 5. Intégrer au moteur, pas à côté
- Le résultat entre dans la génération (le moteur l'applique AVANT de produire) et dans le contrôle de conformité
  (preflight le vérifie APRÈS) ; cause racine enregistrée dans `rules.py` si un défaut est trouvé.
- Interfaces pures (numpy) testables sans Blender ; tests unitaires dans `tests/unit/`.

## Registre des modèles intégrés
| Besoin | Modèle | Licence | Usage |
|---|---|---|---|
| Profondeur des décors | Depth Anything V2 Small | Apache-2.0 | relief du décor peint |
| Super-résolution | Swin2SR real-world ×4 | Apache-2.0 | décors HD |
| Sol praticable, objets de la scène | UperNet ConvNeXt-small ADE20K (OpenMMLab) | MIT | masque de sol fusionné avec la géométrie du relief |
| Sources d'animaux, d'objets, de lieux | Photos Openverse filtrées CC0 / domaine public | CC0 / PDM | forge d'assets (provenance gardée) |
| Détourage | BiRefNet lite (ONNX) | MIT | sujet seul + alpha |
| Reprise dans le style de la troupe | LCM Dreamshaper v7 (image → image, 8 étapes) | MIT | forme et couleurs réelles gardées, rendu « film d'animation » |
| Référence de style = dessins de la troupe | IP-Adapter SD1.5 (h94 ; miroir InvokeAI) | Apache-2.0 | guide le rendu vers les personnages |
| Ambiance de couleurs | transfert Lab mesuré sur les dessins de la troupe | (code maison) | luminosité, saturation, chaleur ; teinte propre gardée |
| Physique des tas | Bullet (moteur de corps rigides de Blender) | zlib (Blender GPL) | versement par gravité, contact exact |
| Contrôle du CONTENU d'une image reprise (un seul sujet, une seule tête, aucune personne ajoutée) | OWLv2 base (Google) ; repli OWL-ViT base | Apache-2.0 | la forge rejette un essai où le style a ajouté une 2ᵉ poule, une tête sur la queue ou un humain (accord 12/12 avec l'examen visuel) |
| Transcription des vidéos de la chaîne | faster-whisper « small » (Systran) | MIT | répliques horodatées (fichiers privés, jamais commités) |
| Pauses réelles entre répliques | VAD Silero (livré avec faster-whisper) | MIT | silences mesurés même sous la musique |
| Hauteur de voix | YIN (de Cheveigné & Kawahara 2002) | méthode publiée, code maison | hauteur et étendue de mélodie (filtre médian contre les erreurs d'octave) |
| Voix des personnages | vocodeur WORLD (Morise 2016) via pyworld | BSD / MIT | mélodie élargie vers la chaîne, hauteur sans changer le timbre, formants d'enfant |

| Séparer la voix de la musique | Demucs htdemucs (Meta) | MIT | rires et voix mesurés sans la musique de fond |
| Regrouper les répliques d'une même voix | ECAPA-TDNN (SpeechBrain) | Apache-2.0 | vote du genre par groupe de voix |
| Genre d'une voix | wav2vec2 XLSR-53 genre (alefiury) | Apache-2.0 | validé 5/5 voix Piper + 11/11 répliques au genre écrit dans la phrase |
| Choisir la meilleure prise | faster-whisper « small » (réécoute) | MIT | prise la mieux comprise et la plus proche de la mélodie de la chaîne |
| Photos de lieux libres (relais) | Wikimedia Commons, licence lue dans les données structurées (CC0 / domaine public) | CC0 / PDM | séries d'un même lieu = plusieurs vues ; User-Agent avec contact, reprise sur 429 |
| Échelle d'une photo de lieu | règle de l'horizon (têtes des passants sur l'horizon, appareil à hauteur d'œil) | méthode classique | `ground.horizon_fit` |

## Leçons (à appliquer partout)
- Une mesure de STYLE seule peut récompenser un défaut : la « distance au style » baissait quand l'IP-Adapter ajoutait des
  personnages de la troupe à côté de la poule. Toujours coupler le style à un contrôle du CONTENU (que montre l'image ?).
- Comparer des silhouettes dans le MÊME cadre (pas deux recadrages : le recadrage grandit autour d'un 2ᵉ sujet).
- Une référence de style faite de personnages entiers transfère des personnages ; une référence de MATIÈRES (tissus, peau,
  cheveux en gros plan) transfère le rendu.
- Vérifier l'inventaire phonétique d'une voix (ex. « gilles » sans voyelles nasales) avant de l'attribuer ; une voix qui
  ne sait pas dire « francs » est remplacée automatiquement.
- Valider un modèle AVANT de s'en servir sur nos données, avec une vérité qu'on peut établir sans lui (planche de
  contrôle, phrases dont le genre est écrit…). L'identification du locuteur à l'image (OWLv2 + mouvement de tête) a été
  rejetée ainsi (≈ 4 bons sur 16) ; le classifieur de genre par la voix a été retenu (11/11).
- Un bon score de « sol praticable » ne suffit pas pour un lieu : une autoroute a beaucoup de sol. Mesurer aussi le ciel,
  le bâti proche et les véhicules.
