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
