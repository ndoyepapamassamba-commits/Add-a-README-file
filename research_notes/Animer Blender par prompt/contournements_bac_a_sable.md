# Contourner les limites de « prompt → consignes de jeu → moteur Blender » — 14/10/2026

Demande : « fais de mon bac à sable l'outil qui te manquait et contourne les limites ». Limites annoncées la veille :
gestes peu variés (3 clips), expressions limitées aux planches, pas de tissus, un modèle texte qui demande une clé.
Tout ce qui suit est lu sur la source primaire ou MESURÉ dans le conteneur (4 cœurs, sans GPU).

## 1. Gestes variés sans modèle texte→mouvement (licences propres)
- Aucun modèle texte→mouvement n'est conforme de bout en bout (note `texte_vers_mouvement_agents_bpy.md`). Contournement :
  la base CMU elle-même, dont l'**index texte officiel** décrit 2 435 clips (fichier compilé par B. Hahne pour cgspeed,
  miroir lu : [cmu-mocap-index-text.txt](https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/cmu-mocap-index-text.txt)).
- Comptage sur l'index : 955 clips de marche, 186 de danse, 55 « talk », 8 « laugh », 8 « gesture », 6 « conversation »,
  3 « shrug », 4 « angry » ; 92 clips de jeu conversationnel ou émotionnel (rire, dispute, explique avec les mains,
  pointe, haussement, salut, révérence, bâillement, pleurs, peur, poignée de main, menace…).
- Retenu : `direction-vocab.json` = 25 étiquettes françaises × ~100 clips choisis à la main (sujets 13, 14, 18/19,
  22/23, 56, 77, 79, 80, 82, 111, 113, 141, 142, 143). Chaque étiquette porte des MOTS déclencheurs ; `mocap.search`
  cherche des mots entiers (« toi » ne se déclenche pas dans « toiture ») et garde l'indice le plus long.
- Conditions CMU : « free for all uses », produits commerciaux permis, pas de revente des données, pas de crawl →
  téléchargement clip par clip (`ensure_clip`), jamais redistribué, seulement les films rendus.
- Réserve : **100STYLE** — lu sur la page officielle ([ianxmason.com/100style](https://ianxmason.com/100style/)) : licence CC BY 4.0 (crédit « The 100STYLE Dataset - Ian Mason »), 100 styles comprenant chacun marche/course avant, arrière, de côté, attente (idle) et transitions ; styles utiles aux entrées en scène et aux attentes de nos personnages : Angry, Depressed, Drunk, Elated, Old, Proud, Rushed, Strutting, Stiff, Tiptoe, Zombie, OnPhoneLeft/Right, ArmsFolded, HandsInPockets, Akimbo, Waving, LookUp, Heavyset. À étiqueter dans `direction-vocab.json` (v2 : « entre en scène » + style) — BVH, donc un lecteur BVH à ajouter à `mocap.py` (aujourd'hui ASF/AMC).

## 2. Le modèle texte sans clé : llama.cpp + Qwen3 1,7B (MESURÉ)
- Licences : llama.cpp MIT ; Qwen3 1,7B GGUF **Apache-2.0** (balise `license:apache-2.0` lue sur la fiche
  [ggml-org/Qwen3-1.7B-GGUF](https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF)) ; fichier Q4_K_M = 1,28 Go.
- Installation : roue précompilée `llama-cpp-python` 0.3.36 (index CPU d'abetlen) + jinja2 ; aucun compilateur.
- Mesure (4 cœurs, `n_threads=4`, grammaire JSON depuis le schéma) : chargement 4,5 s ; **5,3 jetons/s** ; **8,1 s par
  réplique** (43 jetons) ; JSON valide **5/5**. Film 6 (18 répliques) : **160,8 s**.
- Qualité seule : faible — énergie toujours 1, caméra toujours « punch », geste parfois hors sujet (« boit » pour une
  question de prix). Avec le schéma fermé par réplique (poses de l'acteur, partenaires présents) : réactions sur
  15/18 répliques, toutes « accuse » → ping-pong de poses.
- Verdict : **règles d'abord, modèle pour les trous**. Les règles (mots du vocabulaire, « ?! », chute, pose demandée)
  tranchent le geste et l'énergie ; le modèle comble un geste « aucun » et propose des réactions, acceptées seulement
  sous déclencheur mesurable (question, cri, chute, énergie ≥ 0,7). Sur le film 6 : 4 gestes comblés.
- Gratuit par API : OpenRouter « :free » = 20 req/min, **50 req/jour** sans crédit, 1 000/jour après 10 crédits achetés
  une fois ([doc](https://openrouter.ai/docs/api-reference/limits)) → `director.py --mode openrouter` envoie UNE requête
  pour tout le film ; l'onglet Réalisateur de l'app fait de même.

## 3. Expressions
- Le visage reste piloté par les poses DESSINÉES de la troupe (neutre, accuse, choc, haussement, rire — rig.json) et
  par LivePortrait (yeux, lèvres, MIT). Le réalisateur choisit la pose et les réactions, pas des points du visage.
- Vu : PerformRecast (arXiv 2603.19731) et Xemo-Talker pilotent LivePortrait par émotion ; GPU, licences non lues →
  à revoir avec un GPU.

## 4. LLM « animateur » qui écrit du bpy : écarté, mesures à l'appui
- Rappel du banc communautaire (note précédente) : 10 % des scripts d'animation Blender 5.0 s'exécutent.
- [Animato](https://github.com/jesusxal777-boop/Animato) : MIT annoncé dans le README, fichier LICENSE absent de
  l'arborescence, 0 étoile, « /api/run exécute du Python arbitraire » → non retenu.
- [blender-agent](https://github.com/hotspoons/blender-agent) : GPL-3.0-or-later annoncé, 1 étoile → hors règle.
- Notre bac à sable : le modèle ne produit que du JSON fermé ; le moteur (plan.py → scene.py) traduit. Aucun code généré
  n'est exécuté.

## 5. Tissus et cheveux
- Non traité dans cette passe. Voie v2 sans licence nouvelle : simulation de tissu Blender sur la carte (groupe de
  sommets épinglé sur le haut du dessin, vent léger), masque des vêtements à mesurer.

## 6. Ce qui est intégré
- `scripts/blenderfilm/director.py` (règles / local / OpenRouter ; `film.py --realisateur`, `--sans-realisateur`) ;
- `scripts/blenderfilm/direction-vocab.json` (vocabulaire fermé partagé Python / app) ;
- `mocap.py` : `trial_of`, `vocab`, `gesture_clip`, `search`, `overlay(gain)` ; `acting.py` : clips à 4 valeurs ;
- `plan.py` : piste `clips` par acteur ; `scene.py` la lit ;
- app : `server/jev/studio/stageDirections.ts` (+ 5 tests) et l'onglet **Réalisateur** du Studio 3D Pro
  (`direct/views/Lab3DView.tsx`) : « QUI : réplique » → consignes validées → `story.directed.json` pour le moteur.

## 7. Suite du 14/10/2026 : 100STYLE branché, mouvement calibré
- Lecteur BVH maison (`parse_bvh`, `forward_bvh`, `card_curves_bvh`) : mêmes courbes de carte (buste, tête, bassin, rebond,
  flexion) que pour CMU. Mesuré : Angry_FW (4 942 images, 60 i/s) lu en 0,19 s.
- Le zip Zenodo de 1 469 Mo n'est jamais téléchargé : répertoire central lu par requêtes Range (0,5 Mo), puis le seul
  membre voulu (2–11 Mo). Le serveur coupe les connexions longues : 5 reprises avec pause (y compris sur lecture
  tronquée, `IncompleteRead`). Mesuré depuis le moteur (`mocap.ensure_bvh`) : 63 à 182 s par clip selon le
  débit de Zenodo (Strutting 63 s, Depressed 82 s, Tiptoe 91 s, Neutral 135 s, Zombie 142 s, Old 177 s,
  OnPhoneRight 182 s) ; 0,01 s quand le clip est déjà dans le cache. Les 12 styles d'entrée sont en cache (67 Mo).
- Amplitudes crête à crête (clip entier → fenêtre la plus expressive de 1,2 s) :

| Style | buste | tête | bassin | rebond | fenêtre 1,2 s |
|---|---|---|---|---|---|
| Angry_FW | 29° | 34° | 27° | 12,7 cm | buste 11°, rebond 8,4 cm |
| Drunk_FW | 28° | 46° | 30° | 16,1 cm | buste 14°, rebond 7,3 cm |
| Elated_FW | 26° | 32° | 23° | 17,3 cm | buste 8°, rebond 5,9 cm |
| Proud_FW | 23° | 25° | 18° | 6,9 cm | buste 4°, rebond 5,8 cm |
| Rushed_FW | 29° | 32° | 34° | 18,6 cm | buste 8°, rebond 7,4 cm |

  Les limites cartoon (`LIMITS` : buste 9°, tête 12°, rebond 5 cm) écrêtent ensuite chaque clip.
- Film 7 = film 6 dirigé (modèle local + règles, 14 gestes sur 18 répliques) : rendu en 1 139 s, toutes les images,
  son conforme, conformité 3D 100 %, **mais** mouvement 0,0294 (chaîne ≤ 0,027 ; film 6 : 0,0195), couverture 0,46
  (≤ 0,435 ; film 6 : 0,41), 2 sauts de lumière hors coupe. Trop de gestes → **budget de mouvement** (`motion_budget`) :
  la moitié la plus forte des répliques garde son geste (chute, mot-indice, énergie), gains 0,35–0,9. Film 8 en mesure.

## 8. Film 8 (budget de mouvement) et film 9 (réactions hors gros plan) — mesures
- **Film 8** = film 6 dirigé sous budget (9 gestes sur 18 répliques, gains 0,35–0,9, 11 réactions du modèle) : rendu
  1 119 s, 1 600/1 600 images, −14,4 LUFS, crête −1,2, conformité 3D 100 %, **mouvement 0,0225** (chaîne 0,0098–0,027,
  film 6 : 0,0195), **couverture 0,41** (= film 6), scintillement 0,003, plans/min 20,6, **1 saut de lumière hors coupe**
  (image 910, +39,9 de luminance) : la pose « haussement » d'une réaction ajoutée par le modèle claque en GROS PLAN sur
  Maman Nounou — un dessin plein cadre qui change d'un coup est un faux raccord.
- Règles ajoutées : une réaction du modèle n'est gardée que sur un cri, la chute ou une réplique énergique (plus sur une
  simple question) ; `plan.py` connaît maintenant les plans avant les poses et retire toute réaction du modèle qui
  tomberait dans un gros plan sur celui qui réagit (les réactions écrites par l'auteur restent). Film 9 en mesure.

## 9. Film 9 — PORTE DE QUALITÉ : OUI
- Film 9 = film 6 dirigé (budget de mouvement + réactions du modèle hors gros plan) : rendu 1 119 s, 1 600/1 600 images,
  −14,4 LUFS, crête −1,2, conformité 3D 100 %, **mouvement 0,0235** (film 6 : 0,0195 ; chaîne ≤ 0,027), **couverture
  0,42**, scintillement 0,0034, plans/min 20,6, **0 saut de lumière hors coupe → OUI**.
- La porte comptait d'abord 6 « sauts » : tous exactement 2 images après une coupe. Cause mesurée : l'aperçu rend une
  image sur trois et répète la précédente (images 473/474, 476/477… identiques octet pour octet), si bien qu'une coupe
  tombée sur une image répétée n'apparaît qu'à l'image rendue suivante. `finish.brightness_jumps` lit maintenant les
  images répétées SUR LA SOURCE (avant grain et sous-titres) et rattache le saut à la coupe qui le précède dans la
  fenêtre répétée. Un vrai saut loin d'une coupe reste compté (test unitaire). Le rendu final (toutes les images) n'a
  jamais eu ce décalage.
- Contre-épreuve (remesure des films 7 et 8 avec la porte corrigée, sans re-rendre) : **film 8 → 0 saut, porte OUI** ;
  **film 7 → 0 saut** mais toujours NON pour le mouvement (0,0294) et la couverture (0,46), qui étaient, eux, de vrais
  excès corrigés par le budget. Les 1 + 2 « sauts » comptés sur les films 8 et 7 étaient donc le même artefact.
