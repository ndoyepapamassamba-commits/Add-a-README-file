# Chaîne de production vidéo — outils puissants, gratuits, sans abonnement

État au 14/10/2026. Règles de l'utilisateur : outils **puissants mais gratuits**, **sans abonnement** ; chercher
d'abord les meilleurs outils à chaque requête, les améliorer, les intégrer (compétence
`.claude/skills/outils-puissants-d-abord`). Une vidéo doit sortir en **minutes**, pas en heures.

## 1. Diagnostic du film 5 (« Les tomates de Maman Nounou », noté 10/100)

Audit image par image, comparé aux vidéos de la chaîne de l'utilisateur :

| Défaut constaté | Cause | Réponse |
|---|---|---|
| Bouches et traits du visage qui se déforment (menton étiré) | la bouche s'ouvrait en ÉTIRANT le dessin sous la ligne des lèvres | visage vivant appris (LivePortrait, MIT) — §3 |
| Clignements = ovales orange plats collés sur les yeux | paupières dessinées en aplat de couleur | supprimés : les yeux se ferment dans l'image produite par le modèle |
| Acteurs statiques | une seule image par pose ; seule la mâchoire bougeait | visage vivant ; ensuite corps (respiration, gestes sur les mots forts) |
| Arrière-plan inanimé, flou | foule peinte figée ; profondeur de champ forte | à traiter : flou réduit, foule peinte animée (§4) |
| Pose de fou rire pendant une réplique parlée | l'histoire impose `rire` sur « Pour toi, mon fils ? Mille francs. » | à traiter : sourire produit par le modèle sur le dessin neutre (§4) |
| Gros plan qui coupe le visage, titre sur la tête | cadrage du premier plan | à traiter (§4) |
| 3 h de calcul pour 64 s | modèle exécuté image par image sur le processeur | animation par remplacement (§3) + aperçu rapide (§3) |

## 2. Veille — ce qui existe et ce qui est retenu

| Capacité | Outil | Licence | Gratuit sans compte ? | Mesures / sources | Verdict |
|---|---|---|---|---|---|
| Visage vivant depuis un dessin | LivePortrait (KwaiVGI / Kling) | MIT | oui (local) | **mesuré** : 7,9 s/image sur 4 cœurs CPU | **intégré** (`scripts/blenderfilm/liveface.py`) |
| LivePortrait accéléré | FasterLivePortrait (ONNX / TensorRT) | MIT | oui (local) | **mesuré** 17,6 s/image en ONNX sur ce CPU ; 30+ i/s sur RTX 3090 (annoncé) | pour un GPU |
| Plans animés image → vidéo (ouvert) | Wan 2.2 (TI2V-5B, Animate-14B) | Apache-2.0 (annoncé) | oui sur GPU local | 5B : GPU 24 Go ; 14B : 80 Go (officiel) | sur GPU de l'utilisateur s'il en a un |
| Lip-sync sur vidéo | LatentSync (ByteDance) | Apache-2.0 | oui sur GPU local | 8–18 Go VRAM | sur GPU |
| Lip-sync rapide | MuseTalk (Tencent) | MIT (à revérifier) | oui sur GPU local | 4 Go VRAM | sur GPU |
| Vidéo + son | LTX-2 (Lightricks) | licence maison (< 10 M$ de revenus) | — | — | hors règle MIT/Apache |
| Vidéo → mocap | GVHMR | non commercial | — | — | refusé |
| Visage 3D depuis la voix | NVIDIA Audio2Face-3D | NVIDIA Open Model License | — | — | hors règle |
| Plans animés avec voix | Veo 3.1, Grok Imagine, Kling 2.6/3.0 | API payantes | **non** | ≈ 0,04–0,40 $/s selon modèle (tiers, 2026) | non proposés (payants) |
| GPU loué | Runpod, Modal, Kaggle | services à compte | **non** | — | non proposés (compte requis) |

## 3. Ce qui est intégré maintenant

**Visage vivant par remplacement** (`liveface.py`, appelé par `film.py`) :
- une BIBLIOTHÈQUE d'états par pose de chaque personnage (5 ouvertures de lèvres × yeux ouverts / mi-clos / fermés),
  calculée UNE fois par LivePortrait et gardée dans le kit privé (`.private/troupe/visages/`) ;
- chaque film pioche, image par image, l'état le plus proche de sa voix et de ses clignements (liens physiques, pas
  de copie) ; Blender lit la suite d'images sur la carte de la pose (`scene.py`), sans étirer le dessin ni poser de
  paupière plate ;
- coût : ≈ 2 min par pose la première fois sur ce processeur, ~0 s par film ensuite ; secondes sur un GPU.

**Aperçu rapide** (« processeur fictif ») : `film.py --apercu` — demi-résolution, 4 échantillons, une image rendue sur
trois — pour valider histoire, lieux, cadrages et voix en quelques minutes ; le rendu final se lance sans l'option.

**Lieux d'Abidjan** : 8 planches de l'utilisateur → vues nommées, groupées par lieu, à l'échelle de la foule peinte ;
un film change de vue d'un même lieu entre deux plans (`lieux-planches.py`, `plan.py`).

## 4. Feuille de route (gratuit, sans abonnement)

1. Expressions produites par le modèle sur le dessin neutre (sourire, sourcils, regard) au lieu de changer de dessin ;
   formes de bouche par voyelle (a / é / ou) depuis les phonèmes de la voix.
2. Corps : respiration, balancement du poids, gestes calés sur les mots forts (animation procédurale, instantanée).
3. Décor vivant : foule peinte animée personne par personne (masque de la segmentation), parasols et feuillages qui
   bougent, flou de fond réduit.
4. Cadrages : plans moyens et larges comme les vidéos de référence, jamais de visage coupé, titre hors du visage.
5. Sur la machine de l'utilisateur, s'il a une carte graphique NVIDIA : Wan 2.2 (Apache-2.0) anime les plans entiers
   à partir de l'image de départ rendue par Blender (lieu, troupe, mise en scène cohérents d'un plan à l'autre).
