# Voix françaises et lèvres sur CPU : Rhubarb, TTS avec durées de phonèmes, alignement forcé, visèmes français, prosodie, sons libres

Date : 16/10/2026. Piste « voix_levres » du moteur d'animation fluide. Toutes les mesures ont été faites **dans ce
conteneur** : 4 vCPU Xeon à 2,1 GHz, 15 Go de RAM, sans GPU.

Conventions de source :
- **[mesure]** : mesure faite pendant ce travail. Les scripts sont **les nôtres**. Ils restent dans le scratchpad
  `bench-voix/` et ne sont pas versionnés. Les commandes exactes sont dans la section Q7.
- **[code lu]** : code tiers lu pour apprendre. Rien n'a été copié dans le dépôt. Rhubarb a été lu au commit
  `9b9573c` (03/04/2025), cloné en lecture seule dans `scratchpad/sources/voix/`. piper-tts 1.8.0 et kokoro 0.9.4 ont
  été lus dans leurs paquets PyPI.
- **[B]** : code antérieur du projet, branche `claude/relaxed-noether-svkgiu`, commit `d869966`.

Pour aller vite : le résumé des chiffres du banc est en Q7. Les composants à greffer sont dans la dernière section.

---

## Q1. Rhubarb Lip Sync : que fait vraiment son code, et que faut-il réimplémenter ?

### Takeaway
Rhubarb vaut surtout par son **animateur** : environ 1 000 lignes de règles de timing, claires et transposables. Son
**reconnaisseur**, lui, est inadapté au français. Le mode `phonetic` utilise PocketSphinx avec un modèle acoustique et un
modèle de phones **anglais**. Sur nos voix françaises, les fermetures M/B/P qu'il détecte sont fausses plus d'une fois
sur deux (précision 0,44, rappel 0,63 [mesure]).

Il faut donc reprendre ses règles (ensembles de formes, anticipation, durée minimale, intercalaires, pauses, cassure des
segments statiques). Il faut les nourrir avec des **phonèmes français exacts** : durées du TTS ou alignement forcé.

### Cited Findings
**Licence et dépendances**
- Rhubarb est sous MIT, et toutes ses dépendances sont sous licences permissives (MIT, BSD, Boost…).
- Les données de lip-sync produites « appartiennent » à l'utilisateur.
- Source : [LICENSE.md](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/LICENSE.md)

**Les deux reconnaisseurs**
- `pocketSphinx` (par défaut) ne reconnaît que l'anglais.
- `phonetic` « reconnaît des sons et syllabes » sans comprendre les mots, et la doc le dit « moins précis » —
  [README.adoc §Recognizers](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/README.adoc).
- [code lu] `PhoneticRecognizer.cpp` lance PocketSphinx en mode `-allphone` avec le modèle de phones
  `en-us-phone.lm.bin` et le modèle acoustique `cmusphinx-en-us-5.2`. Réglages :
  - `-lw 0.8` : le commentaire dit que moins de 0,4 « fait papillonner » l'animation et que 1,0 ou plus « la fige » ;
  - `-beam`/`-pbeam 1e-20` et `-cmn batch` ;
  - un AH de moins de 6 cs est traité comme un schwa.
  - Source : [PhoneticRecognizer.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/recognition/PhoneticRecognizer.cpp)
- [code lu] `PocketSphinxRecognizer.cpp` (mode anglais) mélange deux modèles de langue : 0,1 pour le modèle général et
  0,9 pour un modèle construit sur le **texte du dialogue**. Il fait ensuite un alignement d'état (`ps_alignment`) sur
  les mots reconnus.
  - Source : [PocketSphinxRecognizer.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/recognition/PocketSphinxRecognizer.cpp)
- [code lu] La détection de voix (VAD) est celle de WebRTC :
  - signal ramené à 8 kHz, agressivité 2 ;
  - trous de 10 cs ou moins comblés ;
  - segments de moins de 5 cs supprimés ;
  - les zones sans phone d'au moins 12 cs deviennent du « bruit ».
  - Source : [voiceActivityDetection.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/audio/voiceActivityDetection.cpp)

**Les formes de bouche**
- Six formes de base A à F, dites « Hanna-Barbera » :
  - A : fermé, pour M/B/P ;
  - B : légèrement ouvert, dents serrées ;
  - C : ouvert ;
  - D : grand ouvert ;
  - E : arrondi ;
  - F : lèvres en avant.
- Trois formes étendues : G (F/V, dents sur la lèvre), H (L long, langue visible) et X (repos).
- Source : [README.adoc §Mouth shapes](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/README.adoc)

**Le pipeline d'animation** ([code lu], `mouthAnimation.cpp`)
- Phones → règles de formes → `animateRough` → `optimizeTiming` → `animatePauses` → `insertTweens` → conversion vers
  le jeu de formes cible.
- L'ensemble est enveloppé par `avoidStaticSegments`.
- Source : [mouthAnimation.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/mouthAnimation.cpp)

**Règles par phone** ([code lu], `animationRules.cpp`)
- Chaque phone donne un **ensemble** de formes admissibles, pas une forme unique. Les voyelles en ont souvent une
  seule, les consonnes plusieurs : T/D → {B, F}, K/G → {B, C, E, F, H}, N → {B, C, F, H}.
- Les plosives ont une occlusion **avant** l'instant du phone. Sa durée vaut la moitié du phone précédent, bornée
  entre 4 et 12 cs.
- Les diphtongues sont coupées à 60 / 40 %.
- Source : [animationRules.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/animationRules.cpp)

**Choix dans un ensemble** ([code lu])
- `getClosestShape` parcourt une matrice d'« effort » : pour chaque forme, les autres formes sont classées de la plus
  proche à la plus lointaine.
- `relax()` détend la forme de référence entre deux phones.
- Même source que ci-dessus.

**Anticipation** ([code lu], `roughAnimation.cpp`)
- L'animation avance d'abord dans le temps. Quand elle rencontre une voyelle à forme unique, elle **revient en
  arrière** jusqu'à **20 cs** pour donner cette forme aux phones qui précèdent.
- Elle s'arrête dès que la forme de base change.
- Source : [roughAnimation.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/roughAnimation.cpp)

**Suppression des formes courtes** ([code lu], `timingOptimization.cpp`)
- La timeline est découpée en segments repos / fermé / ouvert.
- Un segment ouvert ou fermé doit durer au moins **8 cs** pour être vu. Sinon on l'étend vers la gauche, de **6 cs** au
  plus, et les segments courts voisins se partagent le temps.
- Chaque segment est ensuite « re-timé » à rebours, avec une durée minimale de forme de **7 cs**. Le commentaire dit
  que 5 à 7 cs est bon, et 7 parfois un peu mieux.
- Entre formes candidates, la plus longue l'emporte ; C est remplacé par D quand D est présent (« plus intéressant »).
- Source : [timingOptimization.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/timingOptimization.cpp)

**Intercalaires** ([code lu], `tweening.cpp`)
- Une table de paires reçoit une forme intermédiaire, par exemple D→A via C « tôt », C↔F via E « centré », D→X via C
  « tard ».
- L'intercalaire dure entre 4 et 8 cs.
- Le principe est que la bouche **s'ouvre d'un coup et se ferme lentement**.
- Sources : [tweening.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/tweening.cpp) ;
  [animationRules.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/animationRules.cpp)

**Pauses** ([code lu], `pauseAnimation.cpp`)
- Moins de 12 cs : on garde la forme précédente.
- Jusqu'à 35 cs : forme détendue, différente de la suivante.
- Au-delà : X (repos).
- Source : [pauseAnimation.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/pauseAnimation.cpp)

**Segments statiques** ([code lu], `staticSegments.cpp`)
- Un segment statique est une même forme pendant au moins **75 cs** et au moins **3 syllabes**.
- On remplace la règle d'une ou plusieurs voyelles (B devient C, au plus 3 remplacements combinés).
- Le meilleur scénario est celui qui n'a aucun segment statique et la plus petite somme des carrés des durées.
- Source : [staticSegments.cpp](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/9b9573cd21b253c9ba58739bbd1aa0b50b991bff/rhubarb/src/animation/staticSegments.cpp)

**Ce que le projet antérieur avait mesuré** [B]
- Le moteur Blender appelait Rhubarb 1.14.0 en mode `phonetic` sur des voix Piper françaises.
- Il ne gardait que les fermetures A, parce que les autres formes « ouvraient moins que la voix ».
- Mesure de l'époque sur 22 répliques : 63 % des A tombaient dans des mots avec m/b/p, qui ne font que 28 % du temps
  parlé.
- Sources : [B lipsync.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/lipsync.py) ;
  [B audioVisemes.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/actor/audioVisemes.ts)
  (visèmes par formants LPC : ouverture, étirement, arrondi)

**Ce que nous avons mesuré** [mesure] (Rhubarb 1.14.0, release officielle Linux)
- Corpus : 12 répliques françaises Piper intelligibles, avec la vérité terrain des durées Piper.
- Fermetures : rappel 0,625 et précision 0,437, sur 63 bilabiales et 56 formes A, avec une tolérance de 40 ms.
- Accord image par image sur 3 classes (fermé, mi-ouvert, grand ouvert) : 0,528.
- Durée de calcul : 1,0 à 1,4 s pour 3 à 5 s d'audio.
- Détail en Q7.

### Inferences
- Le reconnaisseur de Rhubarb est le maillon faible pour le français. Avec un TTS, on connaît déjà les phonèmes et
  leurs durées **exactes**. Avec une voix enregistrée, un alignement forcé CTC multilingue fait beaucoup mieux (Q3 :
  PER 6 %, erreur de frontière 23 ms). Ni l'un ni l'autre n'a besoin de PocketSphinx.
- Les règles de timing de Rhubarb sont en centisecondes, **indépendantes du fps**. Il faut les quantifier à la cadence
  de rendu : à 30 i/s, 7 cs ≈ 2 images ; à 25 i/s, ≈ 1,75 image. Notre prototype montre qu'à 25 i/s, une affectation
  naïve perd 6 fermetures sur 63. Rhubarb ne garantit pas explicitement les fermetures M/B/P. Nous ajoutons cette
  garantie.
- Les « ensembles de formes » sont l'idée la plus réutilisable. Une consonne sans cible labiale (t, d, n, s, k, l, ʁ)
  doit **hériter** de la forme des voyelles voisines. C'est ce qui évite le « claquement » de bouche.

### Gaps
- Le mode `pocketSphinx` + dialogue n'a pas été mesuré, car il ne fonctionne qu'en anglais.
- Rhubarb n'a pas été mesuré sur une **voix humaine** française : aucune n'est disponible ici sous licence claire.

---

## Q2. Quel TTS français tourne sur CPU, est utilisable commercialement, et donne les durées de phonèmes ?

### Takeaway
**Piper + voix `fr_FR-mls-medium`** est le choix de base :
- voix sous CC-BY 4.0 (attribution), 125 locuteurs ;
- 29 à 37 fois plus rapide que le temps réel sur 4 vCPU (RTF 0,027 à 0,035) ;
- **durées exactes par phonème** : la sortie du prédicteur de durée (`w_ceil`) est exposée sans réentraînement.

Défaut mesuré : la voix **babille sur les phrases courtes** (« Akwaba ! », « Quoi ?! »). Le remède mesuré est la
**synthèse en une passe** ou la **phrase porteuse + découpe** par les durées : le CER passe de 0,85–6,0 à 0,0–0,29.

Kokoro-82M (Apache, une seule voix française) est 10 à 20 fois plus lent ici, avec le même défaut. Qwen3-TTS (Apache,
clonage de voix) est plus lent que le temps réel sur CPU et ne donne pas de durées. Il sert à la qualité de voix, pas
au minutage.

### Cited Findings
**Licences des voix Piper** (déjà vérifiées)
- `mls` medium est **CC-BY 4.0**, « trained from scratch », sur MLS (OpenSLR 94, CC BY 4.0).
- `siwis`, `upmc`, `gilles` et `mls_1840` sont affinées depuis `lessac` (« Research Purposes ») ou `ryan` (CC BY-NC-SA).
  Leur statut commercial est **douteux**.
- `tom` est sous AGPL.
- Sources : [MODEL_CARD mls medium](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/mls/medium/MODEL_CARD) ;
  [OpenSLR 94](https://www.openslr.org/94/) ;
  [note verification_licences.md](../Moteurs%20vidéo%20IA%20pour%20la%20troupe/verification_licences.md)
- Le moteur Blender antérieur utilisait siwis, tom, gilles et upmc —
  [B plan.py](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/plan.py).

**Moteur Piper**
- `piper-tts` 1.8.0 sur PyPI est **GPL-3.0-or-later**. Ses roues abi3 embarquent `espeakbridge.so` et
  `espeak-ng-data`.
- espeak-ng est sous GPL-3.0.
- Sources : [PyPI piper-tts](https://pypi.org/project/piper-tts/1.8.0/) ;
  [espeak-ng COPYING](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) ;
  [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)
- Le modèle de voix lui-même est un fichier ONNX : opset 15, entrées `input`, `input_lengths`, `scales`
  (bruit, longueur, bruit de durée) et `sid`, sortie audio. Il s'exécute avec onnxruntime (MIT) sans aucun code Piper
  [mesure].

**Durées de phonèmes dans Piper**
- piper1-gpl propose officiellement des « alignments » expérimentaux : on marque le tenseur `w_ceil` (nœud `Ceil`)
  comme sortie du graphe, au choix :
  - sur disque, avec `python3 -m piper.patch_voice_with_alignment model.onnx` ;
  - en mémoire, avec `PiperVoice.load(..., include_alignments=True)`.
- La doc cite comme usage l'« aligning speech with mouth movement ».
- Sources : [docs/ALIGNMENTS.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/ALIGNMENTS.md) ;
  [patch_voice_with_alignment.py](https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/patch_voice_with_alignment.py)
- [mesure] Le modèle mls contient bien un seul `Ceil_5171 → w_ceil`. La durée d'un id = `w_ceil × hop_length` (256
  échantillons à 22 050 Hz, soit **11,6 ms**).
- [mesure] Sur 8 synthèses, la somme des durées est **égale à la durée audio** (7,163 s = 7,163 s, etc.).
- [mesure] Le flux d'ids est `^ _ p1 _ p2 _ … $`. Les accents `ˈ`, les espaces et les diacritiques (tilde des nasales)
  ont **chacun** une durée. L'accent `ˈ` porte une durée non nulle (exemple : 151 ms avant le `ɛ` de « frère »). Il faut
  normaliser (Q4).

**Déterminisme**
- [mesure] Le graphe contient 2 nœuds `RandomNormalLike`.
- Avec les réglages par défaut (bruit 0,333), deux synthèses n'ont **pas la même longueur**.
- Avec bruit = 0, la sortie est identique au bit près.
- Avec une **graine** ajoutée aux nœuds, deux sessions neuves donnent la même sortie, mais deux appels dans la même
  session diffèrent (le générateur avance).
- Une session se crée en 1,3 à 1,4 s.

**Édition des durées**
- [mesure] On peut couper le graphe en deux : on retire le nœud `Ceil` et on déclare `w_ceil` comme **entrée**.
- La passe A (graphe patché) donne les durées. La passe B (graphe coupé) prend les durées éditées et rend l'audio.
- Avec bruit = 0, B reproduit A (`allclose`, tolérance 1e-4).
- Tripler un phonème allonge l'audio de la durée prévue (+0,046 s pour +0,046 s attendus).
- On peut donc **allonger une voyelle de chute comique** ou insérer une pause exacte sans changer la voix.

**Phrases courtes**
- [mesure] Phrases isolées « Eh mon frère, c'est comment ? », « Akwaba ! », « Y a pas drap… », « Faut pas fatiguer moi
  deh ! », « Quoi ?! » : CER ASR de 0,85 à 6,0 (babillage).
- Les mêmes mots **dans une phrase longue** : CER de 0,03 à 0,06.
- Avec une phrase porteuse découpée par les durées : CER de 0,00 à 0,29. Pour « Akwaba », l'ASR écrit « à quoi bas » :
  c'est phonétiquement /akwaba/, et le CER de 1,33 vient de l'orthographe.
- La fiche Kokoro décrit le même défaut (« Weakness on short utterances, especially less than 10-20 tokens ») et
  propose de « bundle shorter utterances together » —
  [VOICES.md Kokoro](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

**Kokoro-82M**
- Poids sous Apache-2.0. **Une seule** voix française, `ff_siwis` (note B-, moins de 11 h, données SIWIS sous CC BY).
  Phonèmes espeak-ng `fr-fr` —
  [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) ;
  [SIWIS](https://datashare.ed.ac.uk/handle/10283/2353).
- [code lu] `KModel.forward_with_tokens` renvoie `pred_dur`, une durée par jeton. Unité : 600 échantillons à 24 kHz,
  soit **25 ms**.
- Les horodatages par mot (`join_timestamps`) ne sont construits que pour l'anglais. Pour le français, `pred_dur` reste
  accessible dans `Result.output` —
  [pipeline.py](https://github.com/hexgrad/kokoro/blob/main/kokoro/pipeline.py).
- [mesure] RTF sur une phrase de 4,5 s, selon le nombre de fils :

  | Fils | RTF |
  |---|---|
  | 1 | 0,73 |
  | 2 | **0,54** |
  | 4 | 2,4 à 8 (sur-souscription, voir Q7) |

- [mesure] CER : 0,04 à 0,06 sur les phrases longues ; 1,17 (« Akwaba ! ») et 1,25 (« Quoi ?! ») sur les courtes.
- [mesure] La somme de `pred_dur` est égale à la durée audio.

**Qwen3-TTS**
- Apache-2.0, 10 langues dont le français, clonage de voix en 3 s —
  [HF Qwen3-TTS 0.6B](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base) ;
  [verification_licences.md](../Moteurs%20vidéo%20IA%20pour%20la%20troupe/verification_licences.md).
- Banc tiers sur « 4 vCPU / 15 GB », comme notre conteneur : le 0.6B en int8 met environ **3,07 s de calcul par seconde
  d'audio**. Clonage : 3,17. qwen3-tts.cpp : 1,94 sur un Ryzen 5 3600 —
  [ocdevel 2026-07-11](https://ocdevel.com/blog/20260711-quantized-cpu-tts).
- Ce blog est la seule source, avec des incohérences internes signalées.
- Un banc personnel antérieur donnait un RTF de 5,4 sur CPU portable —
  [coherence_personnages_lipsync.md](../Moteurs%20vidéo%20IA%20pour%20la%20troupe/coherence_personnages_lipsync.md).

**Chatterbox Multilingual V3**
- MIT, français, **filigrane Perth** sur chaque sortie. Le CPU est pris en charge mais lent ; une version GGUF existe.
- Sources : [HF ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) ;
  [coherence_personnages_lipsync.md](../Moteurs%20vidéo%20IA%20pour%20la%20troupe/coherence_personnages_lipsync.md)

**Kyutai TTS 1.6B en_fr**
- Poids CC-BY-4.0 ; voix françaises tirées de CML-TTS (CC BY 4.0) —
  [HF kyutai/tts-1.6b-en_fr](https://huggingface.co/kyutai/tts-1.6b-en_fr).

**espeak-ng sans apt**
- La roue `piper-tts` 1.8.0 contient espeak-ng en module natif. Elle s'installe avec `uv pip` en Python 3.12 [mesure].
- `espeakng-loader` 0.2.4 (roue manylinux) fournit la bibliothèque et les données. `phonemizer-fork` 3.3.2 est en
  GPLv3+. `piper-phonemize` 1.1.0 existe aussi.
- Sources : [PyPI espeakng-loader](https://pypi.org/project/espeakng-loader/) ;
  [PyPI phonemizer-fork](https://pypi.org/project/phonemizer-fork/) ;
  [PyPI piper-phonemize](https://pypi.org/project/piper-phonemize/)
- Piper accepte des **phonèmes bruts** entre `[[ … ]]` dans le texte (motif `_PHONEME_BLOCK_PATTERN` de `voice.py`)
  [code lu]. C'est la porte d'entrée d'un **lexique nouchi**.

**Aucun modèle libre ne revendique l'accent ivoirien.**
- Il faut cloner la voix de comédiens ivoiriens consentants, ou les enregistrer —
  [coherence_personnages_lipsync.md](../Moteurs%20vidéo%20IA%20pour%20la%20troupe/coherence_personnages_lipsync.md).

### Inferences
- **Pour l'animation, Piper mls est la seule option de la liste qui donne des durées au pas de 11,6 ms.** Kokoro donne
  25 ms. Qwen3-TTS, Chatterbox et Kyutai ne donnent rien ; il faut passer par l'alignement forcé (Q3).
- 125 locuteurs dans un seul fichier de 77 Mo, c'est un **casting** pour 54 personnages. On les choisit par F0, débit et
  intelligibilité (balayage en Q7), puis on ajuste `length_scale` (débit comique) et la hauteur en post-traitement.
- Pour respecter la licence, notre moteur appellera **onnxruntime directement** avec notre propre code : table
  phonème → id lue dans le `.onnx.json`, plus le patch `w_ceil` en mémoire. espeak-ng sert seulement de **processus
  séparé** pour la phonétisation (GPL : outil, pas bibliothèque liée). À terme, on le remplace par notre propre G2P
  français à règles plus un lexique.
- Le babillage des phrases courtes est **critique pour la comédie**, faite de répliques courtes. Le remède doit être
  automatique et systématique, pas laissé à l'utilisateur.

### Gaps
- Qwen3-TTS et Chatterbox n'ont **pas** été mesurés dans ce conteneur. Les poids font plusieurs Go et le temps manquait.
  Les chiffres CPU viennent d'une source tierce unique.
- La qualité perçue (naturel, accent) n'a pas été jugée à l'oreille : aucune écoute n'est possible ici. Seule
  l'intelligibilité mesurée par ASR est rapportée.
- La reproductibilité au bit près **entre machines** différentes (autre CPU, autre version d'onnxruntime) n'a pas été
  testée.

---

## Q3. Alignement forcé du français sur CPU pour des voix enregistrées : quel modèle, quelle licence, quelle précision ?

### Takeaway
On combine le modèle CTC phonétique multilingue **`facebook/wav2vec2-xlsr-53-espeak-cv-ft` (Apache-2.0)**, qui sort
directement des phonèmes IPA espeak (ceux de Piper), et **notre propre Viterbi CTC en numpy**. Sur 12 répliques :
- écart moyen de **23 ms** sur les débuts de phonèmes ;
- 87 % à moins de 40 ms ;
- PER en décodage libre de 6 % (médiane) ;
- RTF 0,22 sur 2 fils.

`torchaudio.functional.forced_align` a été **retiré** de torchaudio 2.9. Le modèle MMS_FA est **CC-BY-NC**. MFA est
sérieux (modèle français CC BY 4.0, entraîné en partie sur du français d'Afrique) mais demande Kaldi via conda.

### Cited Findings
**État de l'outillage existant**
- Les API d'alignement forcé de torchaudio ont été « deprecated in 2.8 and removed in 2.9 » —
  [tutoriel torchaudio 2.9](https://docs.pytorch.org/audio/2.9.0/tutorials/ctc_forced_alignment_api_tutorial.html).
- torchaudio n'est pas installé ici, et torch est en 2.14 [mesure].
- `torchaudio.pipelines.MMS_FA` est publié « under CC-BY-NC 4.0 License » —
  [doc MMS_FA](https://docs.pytorch.org/audio/2.8/generated/torchaudio.pipelines.MMS_FA.html).
- Sont aussi **non commerciaux** `facebook/mms-300m`, `mms-1b-all` et `wav2vec2-base-10k-voxpopuli-ft-fr`
  (cc-by-nc-4.0) — [API HF mms-300m](https://huggingface.co/facebook/mms-300m) ;
  [HF voxpopuli-ft-fr](https://huggingface.co/facebook/wav2vec2-base-10k-voxpopuli-ft-fr).

**Modèles Apache-2.0** ([API HF], vérifiés le 16/10/2026)
- `facebook/wav2vec2-xlsr-53-espeak-cv-ft` : 392 étiquettes phonétiques, dont `ʁ ɑ̃ ɔ̃ ɛ̃ œ̃ ø œ y ɲ`. **`ɥ` est absent**
  et se mappe vers `y` [mesure].
- `facebook/wav2vec2-lv-60-espeak-cv-ft`.
- `jonatasgrosman/wav2vec2-large-xlsr-53-french` : WER test Common Voice 17,65 et CER 4,89 sans modèle de langue.
- `bofenghuang/asr-wav2vec2-ctc-french`.
- Sources : [HF xlsr-53-espeak-cv-ft](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft) ;
  [article Xu, Baevski, Auli 2021](https://arxiv.org/abs/2109.11680) ;
  [HF jonatasgrosman FR](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-french) ;
  [HF bofenghuang](https://huggingface.co/bofenghuang/asr-wav2vec2-ctc-french)

**Montreal Forced Aligner**
- Code sous MIT ; installation par conda-forge, Kaldi compris. Pas d'installation pip autonome documentée —
  [dépôt MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner).
- Modèle acoustique « French MFA v3.0.0 » : **CC BY 4.0**, entraîné sur Common Voice FR v16.1, GlobalPhone FR v3.1 et
  « African-accented French » —
  [fiche MFA French v3.0.0](https://mfa-models.readthedocs.io/en/latest/acoustic/French/French%20MFA%20acoustic%20model%20v3_0_0.html).

**Notre banc** [mesure]
- Corpus : 12 répliques Piper intelligibles (4 phrases × locuteurs 0, 7 et 13). La vérité terrain vient des durées
  Piper. Ces dernières sont l'alignement interne du générateur, pas une annotation humaine.
- Rééchantillonnage 22 050 → 16 000 Hz par `resample_poly`.
- **PER en décodage libre** : moyenne 0,091, médiane 0,062.
- **Alignement forcé** avec notre Viterbi CTC, trames de 20 ms :

  | Convention pour la durée de l'accent `ˈ` | Erreur moyenne | < 20 ms | < 40 ms | Biais médian |
  |---|---|---|---|---|
  | rattachée à la voyelle **suivante** | **23 ms** | 59,8 % | 87,4 % | −1,4 ms |
  | rattachée au phone précédent | 32 ms | 53,1 % | 78,8 % | — |

- **Temps de calcul** : RTF 0,35 sur 1 fil, **0,22 sur 2 fils**, 0,89 sur 4 fils. Chargement : environ 1,2 Go.
- Sur l'audio **babillé** (phrases courtes isolées), PER de 0,6 à 2,2 et alignement inutilisable. Le modèle ne
  « force » pas un sens à un signal qui n'en a pas : c'est un **détecteur de babillage** gratuit.

### Inferences
- **Recette pour une voix enregistrée.** On part du texte de la réplique, connu par le script :
  1. phonétisation espeak `fr` ;
  2. log-probabilités CTC ;
  3. Viterbi ;
  4. phonèmes horodatés au pas de 20 ms.

  Ensuite, les mêmes règles de visèmes que pour le TTS s'appliquent. Les 23 ms d'erreur moyenne restent sous le seuil
  de détection d'un décalage audio-vidéo (Q4) et sous une image à 30 i/s (33 ms).
- **MFA en second avis.** Le modèle français de MFA a vu du « français d'Afrique ». Il serait le meilleur candidat pour
  des voix ivoiriennes réelles. Son coût est de demander conda et Kaldi dans un outil local séparé.
- **Le décodage libre comme porte de qualité.** Le PER (phonèmes) ou le CER (lettres, modèle français) est une **porte
  de qualité audio** automatique pour chaque réplique synthétisée.

### Gaps
- Aucun enregistrement humain français sous licence claire n'était disponible. La précision sur une **vraie voix** (et
  avec l'accent ivoirien) **reste à mesurer**. Protocole proposé : 20 répliques enregistrées par un comédien, frontières
  annotées à la main dans Audacity.
- MFA n'a pas été installé (pas de conda ici). Sa précision n'est pas comparée.
- Une version int8 ou ONNX plus légère du modèle xlsr-53, utilisable dans le navigateur, n'a pas été testée.

---

## Q4. Des phonèmes français aux visèmes de la spec, et règles de coarticulation

### Takeaway
On mappe les phones espeak français sur les visèmes de la spec, plus un état de repos. On porte en plus **trois
paramètres continus** (ouverture de mâchoire, étirement, arrondi), dans l'esprit de JALI : mâchoire et lèvres sont
séparées. Cela traite proprement les voyelles **antérieures arrondies** du français (y, ø, œ), qui ont la langue de
i/e/ɛ mais les lèvres de u/o.

La coarticulation se fait par **fonctions de dominance** (Cohen–Massaro), avec deux contraintes :
- l'**arrondi anticipé** typique du français (modèle « look-ahead » de Benguerel & Cowan) ;
- des **contraintes dures** : M/B/P fermés, F/V dents sur la lèvre.

Notre prototype, comparé à une affectation naïve à 30 i/s :
- garde **63 fermetures sur 63** ;
- divise par deux les formes d'une seule image hors fermetures ;
- passe de 9,6 à 7,5 changements par seconde.

### Cited Findings
**Visèmes français dans la littérature**
- Benoît, Lallouache, Mohamadi et Abry ont publié « A set of French visemes for visual speech synthesis » dans *Talking
  Machines*. Ce jeu sert de base aux synthétiseurs audiovisuels français : Le Goff et Benoît (1996) donnent des valeurs
  cibles à chaque visème français.
- Sources : [référence SSIP](https://inf.u-szeged.hu/ssip/2001/handouts/gordan/tsld040.htm) ;
  [Le Goff & Benoît 1996](https://www.isca-archive.org/icslp_1996/goff96_icslp.html)

**Anticipation de l'arrondi (Benguerel & Cowan 1974)**
- Mesure de la protrusion de la lèvre supérieure chez 6 locuteurs français.
- Dans le modèle « look-ahead », le geste d'arrondi commence dès que la cible précédente est atteinte. Les consonnes
  n'ont pas de cible d'arrondi.
- Dans des suites C1…CnV avec voyelle arrondie, la protrusion commence le plus souvent sur C1 ou avant.
- Sources : [Benguerel & Cowan 1974](https://www.degruyterbrill.com/document/doi/10.1159/000259480/html) ;
  [MIT OCW 24.915, cours 13](https://ocw.mit.edu/courses/24-915-linguistic-phonetics-fall-2015/cf26055b20e6f89d69a5c4fb1fe9a47c_MIT24_915F15_lec13.pdf)
- Noiray et al. (2011) trouvent la protrusion moins fiable que la constriction labiale pour suivre l'anticipation —
  [PMC3055290](https://pmc.ncbi.nlm.nih.gov/articles/PMC3055290).

**Modèle de Cohen–Massaro (1993)**
- Chaque segment a une **cible** et une **fonction de dominance** exponentielle décroissante depuis son centre. La
  trajectoire est la moyenne des cibles pondérée par les dominances.
- Il est décrit comme le modèle de coarticulation le plus utilisé.
- Une comparaison perceptive de Beskow ne le trouve pas inférieur aux modèles neuronaux testés.
- Sources : [Dey et al. 2010](https://staffwww.dcs.shef.ac.uk/people/S.Maddock/phd_theses/dey/Dey_etal_FAA_2010.pdf) ;
  [Beskow, présentation](https://www.cs.columbia.edu/%7Ejulia/courses/CS6998/StudentPres11/Beskow_ajs2136.pdf)

**JALI (SIGGRAPH 2016)**
- La correspondance phonème → visème est « un vers plusieurs ». Les variations sont modélisées par deux actions
  visuellement distinctes, **mâchoire (JA)** et **lèvres (LI)**.
- Des traits audio (volume, hauteur, formants) pilotent le champ JA/LI.
- Le système est commercialisé, et son brevet est mentionné.
- Sources : [page JALI](https://www.dgp.toronto.edu/~elf/jali.html) ;
  [article PDF](https://dgp.toronto.edu/~elf/JALISIG16.pdf) ;
  [brevet US 10839825](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10839825)
- À apprendre, pas à copier : nous reprenons l'idée générale de deux axes.

**Synchronisation audio-vidéo (BT.1359)**
- Seuils de détection de +45 ms (audio en avance) à −125 ms (audio en retard).
- La convention de signe varie selon les sources. Le NTIA écrit −45 / +125, avec « positif = audio en retard ».
- Sources : [Wikipédia, Audio-to-video synchronization](https://en.wikipedia.org/wiki/Audio-to-video_synchronization) ;
  [NTIA 11-474](https://its.ntia.gov/publications/download/11-474.pdf) ;
  [arXiv 2212.01686](https://arxiv.org/pdf/2212.01686)
- Dans les deux conventions, une **image qui précède légèrement le son** est mieux tolérée qu'un son qui précède
  l'image.

**Notre prototype** [mesure], `proto_visemes.py`, sur les 12 répliques propres

| Cadence | Méthode | Formes d'une image | Fermetures M/B/P montrées | Changements / s |
|---|---|---|---|---|
| 30 i/s | naïve | 114 | 62/63 | 9,63 |
| 30 i/s | greffée | 60 | **63/63** | 7,49 |
| 25 i/s | naïve | 143 | 57/63 | 9,31 |
| 25 i/s | greffée | 65 | **63/63** | 6,66 |

- La méthode naïve prend, à chaque image, le visème du phone qui la couvre.
- La méthode greffée enchaîne dominance, ensembles de formes, fermetures garanties et suppression des formes d'une
  image.
- Dans la méthode greffée, les formes d'une image restantes sont surtout des fermetures d'une image, voulues.
- Exemple de sortie pour « Maman Brigitte a pris le bus… » :
  `MBP A A MBP A A A A A A MBP I I I I CHJ CHJ I I I TDN TDN A A A MBP …`

### Inferences
Table de correspondance retenue (phones espeak `fr` vers visèmes de la spec, avec les cibles ouverture / étirement /
arrondi du prototype) :

| Visème | Phones français | Remarque |
|---|---|---|
| **M/B/P** | p b m | fermeture **garantie**, au moins 1 image |
| **F/V** | f v | dents sur lèvre inférieure |
| **A** | a ɑ ɑ̃ | mâchoire basse |
| **E** | e ɛ ɛ̃ ə | ə est légèrement arrondi en français (cible 0,4 / 0,1 / 0,55) |
| **I** | i j | étiré |
| **O** | o ɔ ɔ̃ œ œ̃ | œ : ouverture 0,5, arrondi 0,7 |
| **U** | u w y ø ɥ | y : arrondi 1,0 et ouverture faible ; ø : arrondi 0,85 |
| **S/Z** | s z | dents serrées, étiré |
| **CH/J** | ʃ ʒ | lèvres projetées (arrondi 0,85) |
| **L/R** | l ʁ | ʁ est uvulaire en français : lèvres « transparentes » |
| **T/D/N** | t d n ɲ | sans cible labiale : hérite des voyelles voisines |
| **K/G** | k ɡ ŋ | sans cible labiale : hérite des voyelles voisines |
| **repos** | silence, pause | mâchoire 0,05 |

- Les **nasales** (ɑ̃, ɔ̃, ɛ̃) n'ont pas de signe labial propre. On les ramène à leur voyelle orale, éventuellement
  avec une ouverture un peu réduite.
- Le **ʁ français** n'est pas le R anglais labialisé : le mettre en L/R « transparent » est plus juste que la forme E/F
  que Rhubarb donne à R.

### Gaps
- Le jeu de visèmes de Benoît et al. n'a pas été lu dans le texte : seules des références secondaires ont été trouvées.
- Les cibles numériques du tableau sont **nos réglages initiaux**, pas des mesures. Elles seront validées sur les
  planches de bouche du propriétaire (7 personnages, bouche mesurée) et à l'œil.

---

## Q5. Quels traits de prosodie pilotent la tête et les sourcils ?

### Takeaway
Les hochements de tête se calent sur les **accents** et les **frontières de phrase**, avec une grande régularité
temporelle et des amplitudes très variables d'un locuteur à l'autre (Graf et al. 2002) :
- 42 % des accents portent un hochement simple, 18 % un hochement avec rebond, 20 % un balancement ;
- le signal se sépare en une bande lente de 0 à 2 Hz (posture) et une bande rapide de 2 à 15 Hz (parole).

En français, l'accent primaire est **final** : dernière syllabe pleine du groupe accentuel, allongée d'environ ×1,8.
Les durées Piper le reproduisent déjà : voyelles finales de groupe à 197 ms de médiane, contre 81 ms pour les non
accentuées [mesure]. Les **accents** se lisent donc gratuitement dans la piste de durées.

### Cited Findings
**Graf, Cosatto, Strom & Huang (FGR 2002)** — [PDF](https://www.cstr.ed.ac.uk/downloads/publications/2002/paper.vtts.pdf)
- Plusieurs heures enregistrées à 60 i/s, 6 locuteurs, 1 075 phrases. L'étiquetage ToBI vient d'un prédicteur de
  prosodie.
- Mouvements de tête découpés en deux bandes :
  - **0–2 Hz** : mouvements lents de posture, sur plusieurs mots ;
  - **2–15 Hz** : liés à la parole.
- Les accents sont souvent soulignés par un hochement qui s'étend sur **2 à 4 phones**. Le même motif se répète,
  parfois pendant toute une séance.
- Mouvement **initial** après une pause : légère descente, puis hochement vers le haut au début de la phrase. Le
  locuteur de la figure 4 le fait dans plus de 70 % de 50 phrases.
- La rotation autour de x (hochement) domine, celle autour de y est fréquente, celle autour de z est rare.
- Trois primitives : hochement `^`, hochement avec rebond en S `~`, balancement brusque `/`.
- Tableau 4, sur 100 phrases courtes et salutations :

  | Primitive | Part des accents |
  |---|---|
  | `^` hochement | **42 %** |
  | `~` hochement avec rebond | **18 %** |
  | `/` balancement brusque | **20 %** |

- Amplitudes de l'ordre de ±3° en x pour un débit neutre, plus fortes avec une expression joyeuse (figure 4).
- Les haussements de sourcils tombent souvent sur les événements prosodiques, avec ou sans hochement.
- Les mouvements sont moins marqués en lecture de journal que pour des salutations.

**Prosodie du français**
- Le groupe accentuel (AP) a la forme maximale LHiLH* et minimale LH*.
- **H\*** final est obligatoire, sur la **dernière syllabe pleine** (hors schwa). Hi initial est optionnel.
- La montée finale LH a une fonction démarcative.
- Source : [Jun & Fougeron](https://sunahjun.humspace.ucla.edu/pdf/Jun_Fougeron%20in%20Botinis.pdf)
- La syllabe finale serait environ **1,8 fois** plus longue que les non finales (Delattre 1966, cité) —
  [PMC9014682](https://pmc.ncbi.nlm.nih.gov/articles/PMC9014682).
- L'accent initial serait tonal plutôt qu'allongé, mais ce point est discuté —
  [Goad & Buckley 2006](https://talkbank.org/phon/access/French/0docs/goad2006.pdf).

**Nos durées Piper** [mesure], 12 répliques, accent `ˈ` rattaché à la voyelle

| Voyelle | Nombre | Médiane | Moyenne | Rapport |
|---|---|---|---|---|
| finale de groupe (avant ponctuation ou fin) | 21 | **197 ms** | 210 ms | ×2,4 |
| accentuée de fin de mot | 51 | 139 ms | 219 ms | ×1,7 |
| non accentuée | 120 | 81 ms | 85 ms | référence |

- espeak-ng marque `ˈ` sur la dernière syllabe de chaque mot plein, par exemple « fʁˈɛʁ », « ɡaʁbˈa », « alˈe ».

### Inferences
- Les **événements prosodiques** se calculent sans analyse audio quand la voix vient du TTS :
  - accent = voyelle marquée `ˈ` dont la durée dépasse 1,5 fois la médiane des voyelles de la réplique ;
  - frontière = ponctuation ou pause de plus de 150 ms ;
  - question = `?`, qui donne une montée de F0, donc tête et sourcils vers le haut.
- Pour une voix enregistrée, on ajoute F0 (YIN) et énergie.
- Une **cible comique** se construit en exagérant : amplitude ×2 à ×3 par rapport à Graf, et choix de primitive selon
  le tempérament du personnage. La chute finale reste **figée** (gel sur le visage choqué), donc pas de hochement
  après le dernier accent du punchline.

### Gaps
- Aucune mesure de mouvements de tête en **français** (encore moins ivoirien) n'a été trouvée. Les probabilités de
  Graf viennent de l'anglais et de la lecture sur prompteur.
- L'extraction de F0 sur voix réelle n'a pas été mesurée ici. Le prototype F0 par autocorrélation sert seulement au
  casting.

---

## Q6. Effets sonores et musique : quoi synthétiser en code, quelles banques libres ?

### Takeaway
Les **bruitages comiques** (boing, sifflet glissant, ba-dum-tss, chute, pop, swoosh) se synthétisent en code, de façon
déterministe. Le modèle à apprendre est sfxr / ZzFX : oscillateur, enveloppe ADSR, glissando, vibrato, bruit,
bitcrush, tous deux sous MIT.

Les ambiances réelles d'Abidjan (marché, maquis, gbaka, pluie) viennent de banques **CC0** (Kenney, Freesound filtré
CC0). La licence est enregistrée **par fichier** dans l'AssetRegistry.

Sonniss est libre de droits sans attribution, mais interdit l'entraînement d'IA. CC BY-NC est **exclu**, puisque les
vidéos sont monétisées.

### Cited Findings
**Générateurs en code**
- **sfxr** (DrPetter) : « I've put it under the MIT free software license » —
  [page projet sfxr](https://drpetter.se/project_sfxr.html).
- bfxr est sous Apache-2.0 —
  [port C++ de bfxr](https://github.com/madeso/bfxr/).
- **ZzFX** (Frank Force) : MIT, sans dépendance, version micro de moins de 1 Ko. ZzFXM est son lecteur de musique —
  [npm zzfx](https://npmjs.com/package/zzfx) ; [GitHub ZzFX](https://github.com/KilledByAPixel/ZzFX).

**Banques de sons**
- **Kenney** : les packs audio sont listés **CC0** (UI, RPG, casino, numériques). L'attribution est facultative —
  [OpenGameArt Kenney UI](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) ;
  [guide Cinevva](https://app.cinevva.com/guides/free-sound-effects-music).
- **Freesound** propose trois licences : CC0, CC BY et CC BY-NC, et un filtre de licence. Pour CC BY-NC, la FAQ dit
  qu'on « can't earn any money » —
  [FAQ Freesound](https://freesound.org/help/faq/).
- **Sonniss GDC** : libre de droits et sans crédit, mais le bundle 2024 interdit l'entraînement d'IA —
  [GameFromScratch](https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/).
  Source secondaire : la licence officielle n'a pas été lue.

### Inferences
- **Un synthétiseur maison suffit pour les « stingers » comiques.** On réimplémente en TypeScript et en numpy le modèle
  paramétrique de sfxr / ZzFX, sans copier de code. Le rendu passe par un **OfflineAudioContext** dans le navigateur ou
  par numpy hors ligne, avec une graine. On obtient ainsi un son identique à chaque export, ce que demande `evaluate(t)`.
- **Musique de fond** : boucles procédurales (percussions synthétisées, basse, accords) plus **ducking** automatique
  sous le dialogue. Le ducking utilise l'enveloppe RMS de la piste de voix, que nous avons déjà.
- **Licences par fichier dans l'AssetRegistry.** Le TTS ou la banque est enregistré pour chaque son, avec la licence
  SPDX et l'attribution à afficher. Les crédits du TikTok sont générés automatiquement : par exemple « Voix : Piper
  fr_FR mls (MLS, CC BY 4.0) ».

### Gaps
- Les licences de Kenney et de Sonniss n'ont été vues que par des sources secondaires.
- Aucun générateur de musique libre et rapide sur CPU n'a été évalué. ACE-Step est cloné dans `sources/` mais n'a été
  ni lu ni mesuré dans cette piste.

---

## Q7. Banc pratique dans ce conteneur : commandes exactes et résultats

### Takeaway
Ce qui a tourné dans ce conteneur :
- **Piper mls medium : RTF 0,027–0,035 sur 4 fils, 0,072 sur 1 fil**, avec les durées de chaque phonème ;
- Kokoro : RTF 0,54 au mieux ;
- alignement forcé xlsr-53-espeak : erreur moyenne 23 ms, RTF 0,22 ;
- Rhubarb phonétique : fermetures avec une précision de 0,44.

Piège matériel important : torch sur **4 fils est 3 à 4 fois plus lent que sur 2 fils**. Les 4 vCPU se comportent
comme 2 cœurs physiques pour torch. onnxruntime, lui, gagne encore de 1 à 4 fils.

### Cited Findings
Tout ce qui suit est [mesure]. `S` désigne le scratchpad. Les scripts sont nos fichiers de banc dans `$S/bench-voix/`.

**Installation** (Python 3.12, sans apt)
```sh
uv pip install --python $S/venv/bin/python piper-tts==1.8.0 onnx   # onnxruntime 1.31.0 tiré
uv pip install --python $S/venv/bin/python transformers soundfile scipy
uv pip install --python $S/venv/bin/python "kokoro==0.9.4" "misaki[en]==0.9.4" espeakng-loader phonemizer-fork
# voix CC-BY (77 Mo)
curl -sSL -o voices/fr_FR-mls-medium.onnx      https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx
curl -sSL -o voices/fr_FR-mls-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx.json
# aligneur (1,2 Go) et ASR français (1,2 Go), Apache-2.0
python -c "from huggingface_hub import snapshot_download as s; s('facebook/wav2vec2-xlsr-53-espeak-cv-ft', local_dir='models/w2v2-espeak')"
python -c "from huggingface_hub import snapshot_download as s; s('jonatasgrosman/wav2vec2-large-xlsr-53-french', local_dir='models/w2v2-fr')"
# Rhubarb (release officielle MIT), sha256 a9a90748…8667
curl -sSLO https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Linux.zip
```

**Commandes des bancs**
```sh
python -I bench-voix/bench_piper.py  bench-voix/out    # WAV + durées + RTF + déterminisme
rhubarb -r phonetic -f json --extendedShapes GHX -q X.wav -o X.rhubarb.json
python -I bench-voix/gen_clean.py    bench-voix/clean  # 12 répliques en une passe
python -I bench-voix/bench_align.py  bench-voix/clean  # Viterbi CTC + PER + Rhubarb vs vérité
python -I bench-voix/carrier_crop.py bench-voix/out    # phrase porteuse + édition des durées
python -I bench-voix/bench_kokoro.py bench-voix/out
python -I bench-voix/proto_visemes.py bench-voix/clean 30   # (et 25)
python -I bench-voix/sweep_intel.py speakers 125       # casting des 125 locuteurs mls
```

**Piper mls medium** (piper-tts 1.8.0, onnxruntime 1.31.0)
- Répliques de test :
  - l1 : « Eh mon frère, c'est comment ? Tu as gâté mon garba et tu viens me dire ça va aller ? »
  - l2 : « Akwaba ! Y a pas drap, on est ensemble. Faut pas fatiguer moi deh ! »

  | Réplique | Locuteur | Fils | Audio | Calcul | RTF |
  |---|---|---|---|---|---|
  | l1 | 0 | 4 | 7,163 s | 0,250 s | 0,035 |
  | l1 | 17 | 4 | 9,451 s | 0,265 s | 0,028 |
  | l1 | 60 | 4 | 7,663 s | 0,208 s | 0,027 |
  | l2 | 0 | 4 | 7,732 s | 0,225 s | 0,029 |
  | l2 | 17 | 4 | 10,971 s | 0,308 s | 0,028 |
  | l2 | 60 | 4 | 11,134 s | 0,302 s | 0,027 |
  | l1 | 0 | 1 | 7,163 s | 0,514 s | 0,072 |
  | l2 | 0 | 1 | 8,115 s | 0,600 s | 0,074 |

- Somme des durées de phonèmes = durée audio dans tous les cas (81 et 67 phonèmes).
- **Mais** ces deux répliques contiennent des phrases courtes isolées, qui ont **babillé** (voir ci-dessous).
- Déterminisme :
  - par défaut : longueurs différentes, écart max 1,67 ;
  - bruit 0 : identique ;
  - graine dans le graphe : identique entre sessions neuves, pas dans une même session ;
  - création de session : 1,3 à 1,4 s.

**Intelligibilité** (ASR wav2vec2 FR, Apache-2.0)
- Phrases courtes isolées, CER direct :
  - « Eh mon frère, c'est comment ? » : 1,19 / 1,81 / 1,73 (locuteurs 0 / 17 / 60) ;
  - « Akwaba ! » : 2,17 / 5,0 / 3,83 ;
  - « Quoi ?! » : 4,25 / 6,0 / 2,75.
- Avec **phrase porteuse + découpe** : 0,12 / 0,08 / 0,08, puis 1,33 pour « Akwaba » (« à quoi bas »,
  phonétiquement juste), puis **0,00** pour « Quoi ».
- Phrase longue unique : 0,03 à 0,06.
- Premier balayage des 14 premiers locuteurs (synthèse phrase par phrase, donc phrases courtes isolées) : CER moyen de
  0,25 à 0,43.
- Second balayage en **synthèse une passe** : voir le paragraphe « Casting des 125 locuteurs » ci-dessous.

**Kokoro-82M ff_siwis** (torch 2.14.1 CPU)
- Phrase de 4,5 s : RTF 0,73 sur 1 fil, **0,54 sur 2 fils**, 2,4 sur 4 fils.
- Avec le pipeline sur 4 fils : RTF de 2,5 à 8.
- Profil sur 4 fils : `mkldnn_convolution` prend 34 % du temps, et même `aten::mul` 12 %. C'est le signe d'une
  sur-souscription de fils.

**Alignement forcé et Rhubarb** : voir Q1 et Q3.
- w2v2 xlsr-53 : RTF 0,354 sur 1 fil, 0,221 sur 2, 0,893 sur 4.
- Rhubarb : environ 1,0 à 1,4 s par réplique de 3 à 5 s (RTF environ 0,25 à 0,3).

**Visèmes** : voir le tableau en Q4.

**Casting des 125 locuteurs mls** (`sweep_intel.py speakers 125`, synthèse une passe, 666 s pour l'ensemble)
- 4 phrases par locuteur, dont « Quoi ? C'est toi qui as pris mon téléphone ? ».
- Le script mesure le CER ASR, la F0 médiane (autocorrélation simple, erreurs d'octave possibles) et le débit en
  caractères par seconde. Les données sont dans `out/speakers_sweep.json`.
- **CER moyen** : minimum 0,064, médiane 0,131, maximum 0,276. Le CER **maximal** a une médiane de 0,275 : c'est la
  phrase en « Quoi ? » qui pèse.
- Nombre de locuteurs sous un seuil de CER moyen :

  | CER moyen | Locuteurs | Dont CER max ≤ 0,20 |
  |---|---|---|
  | ≤ 0,08 | 7 | 7 |
  | ≤ 0,10 | 25 | 22 |
  | ≤ 0,15 | 82 | 30 |

- **Registre** (F0 médiane) : 42 voix graves (moins de 145 Hz), 9 intermédiaires, 74 aiguës (165 Hz ou plus). F0 de
  65,6 à 259,4 Hz.
- Avec un CER ≤ 0,10 : 10 voix graves et 13 aiguës.
- Meilleures voix graves (sid, CER moyen, F0, débit) : 36 (0,082 ; 116 Hz ; 11,9 c/s), 33 (0,087 ; 120 Hz ;
  14,7 c/s), 87 (0,089 ; 121 Hz ; 9,7 c/s), 103, 77, 80.
- Meilleures voix aiguës : 11 (0,064 ; 215 Hz ; 12,2 c/s), 94 (0,065 ; 209 Hz), 96 (0,066 ; 208 Hz), 109, 72, 92.
- Moins intelligibles : 114 (0,276), 54, 49, 56 et 60. Ce sont justement les locuteurs 17 et 60 du premier banc.
- **Débit** : de 6,4 à 16,4 caractères par seconde, médiane 9,95. `length_scale` permet de recaler chaque personnage.
- Une vingtaine de voix nettes et contrastées suffit donc pour démarrer le casting des 54 personnages. On les complète
  par des variations de débit et de hauteur. La validation se fait à l'oreille par le propriétaire.

### Inferences
- Une sketch de 60 s de dialogue se synthétise en **2 à 4 s** sur CPU, durées comprises. On peut donc régénérer toutes
  les voix à chaque modification du script, et même prévisualiser **en direct**.
- La porte d'intelligibilité ASR (RTF environ 0,2) coûte environ 12 s par minute de dialogue. On peut la passer
  systématiquement.
- Dans l'architecture : le TTS reste un **outil local** derrière le RenderAdapter / pont local. Le navigateur lit des
  fichiers « cuits » (WAV + `visemes.json`), conformément à la spec §5.

### Gaps
- Aucune écoute humaine n'a été faite. L'intelligibilité est mesurée par une ASR, elle-même imparfaite : WER de 17,65 %
  sur Common Voice.
- Qwen3-TTS et Chatterbox n'ont pas été mesurés ici.

---

## Ce que nous greffons dans notre moteur

Tout est **réimplémenté** dans notre code. Aucune ligne tierce n'est collée. Les dépendances d'exécution restent des
**outils** déclarés dans `tool-manifest.json` :

| Outil | Licence | Mode |
|---|---|---|
| onnxruntime | MIT | local |
| espeak-ng | GPL-3.0 | processus séparé |
| modèles wav2vec2 | Apache-2.0 | local |
| voix Piper mls | CC-BY 4.0 | attribution |
| Rhubarb | MIT | optionnel, comparaison |

### G1. `VoiceBaker`, Piper sans Piper : onnxruntime + durées + déterminisme
Entrées : `(texte, personnage → {sid, length_scale, pitch, noise})`. Sorties : `voice/<hash>.wav` et
`voice/<hash>.phones.json`.

```
phonemes   = G2P_fr(texte)                       # espeak-ng 'fr' en processus séparé ; lexique nouchi prioritaire
                                                 # (« deh » → [[dɛ]], « gbê » → [[ɡbɛ]] …) via blocs [[ ]]
seq        = concat(phrases)                     # UNE seule passe : jamais de phrase courte isolée
if n_phones(seq) < 25:                           # réplique courte → phrase porteuse
    seq = P(pre_neutre) + [',',' '] + seq + [' '] + P(post_neutre)   # « Alors il a dit, … et puis il est parti. »
ids        = [^,_] + Σ(id(p),_) + [$]            # table phoneme_id_map du .onnx.json
w          = graphA(ids, scales=[noise, length_scale, noise_w], sid)  # w_ceil exposé (patch mémoire du nœud Ceil)
w          = edit_durations(w, script)           # allonger la voyelle de chute ×2–3, pause exacte avant le punchline,
                                                 # accélérer une engueulade (length_scale local)
audio      = graphB(ids, w, sid)                 # graphe coupé : w_ceil est une ENTRÉE
samples(k) = (w[2+2k] + w[3+2k]) · hop           # hop = 256 @ 22 050 Hz → 11,6 ms
crop       = [Σ samples < k0, Σ samples < k1] ± 30 ms, fondus 10 ms   # si phrase porteuse
cache_key  = sha256(modèle, sid, seq, w_édité, graine, version ORT)
```

Ce que nous améliorons par rapport à la source :
1. **Babillage supprimé**, ce que Piper ne fait pas.
2. **Durées éditables** pour le timing comique : Piper n'expose que la lecture des durées.
3. **Déterminisme.** On met une graine dans les nœuds `RandomNormalLike`, dérivée du hachage de la réplique, avec une
   session neuve par réplique ; ou bien bruit = 0 pour les aperçus. Le WAV est mis en cache par hachage. Ainsi
   `evaluate(t)` lit toujours le même fichier.
4. **Casting** : un personnage est un `sid` parmi 125, plus `length_scale` et un décalage de hauteur.

### G2. `PhonemeTrack` : normalisation des durées
Règles validées par l'alignement indépendant (erreur moyenne 23 ms contre 32 ms avec la règle inverse) :
- la durée d'un accent `ˈ`/`ˌ` va à la **voyelle suivante** ;
- la durée d'un espace va au phone **précédent** ;
- les diacritiques combinants (`̃`, `ː`) sont fusionnés avec la base : `ɔ̃`, `ɑ̃` ;
- la ponctuation (`, . ? ! …`) devient un `sil` et les silences contigus sont fusionnés ;
- `^` et `$` deviennent des `sil`.

Schéma `phones.json` :
```
[{ph, start, end, stressed, word_idx, phrase_final}]
```

Invariant testé : `Σ(end − start) = durée WAV` à un échantillon près.

### G3. `ForcedAligner` pour les voix enregistrées
Modèle : wav2vec2-xlsr-53-espeak-cv-ft (Apache-2.0), en local, avec torch **2 fils**. Logits L (T × V), trames de
20 ms. Cibles y = phones G2P mappés au vocabulaire (`ɥ` → `y`).

Viterbi CTC (le nôtre, numpy/TS) :
```
ext = [∅, y1, ∅, y2, …, yL, ∅]
α[0,0] = L[0,∅] ; α[0,1] = L[0,y1]
α[t,s] = L[t,ext_s] + max(α[t−1,s], α[t−1,s−1], α[t−1,s−2] si ext_s ≠ ∅ et ext_s ≠ ext_{s−2})
```
- On remonte depuis `max(α[T−1,S−1], α[T−1,S−2])`.
- Début du phone i = première trame de l'état 2i+1 ; fin = début du suivant.
- Correction du biais médian, mesuré à environ −1 ms ici.

Améliorations :
1. Pas de torchaudio (retiré en 2.9) et pas de MMS (NC).
2. **Score de confiance par phone**, égal à la log-probabilité moyenne sur son intervalle. En dessous d'un seuil, la
   zone est signalée « à vérifier » dans l'éditeur. C'est l'exigence de la spec : « jamais certifié parfait ».
3. **Garde-fou** : un PER en décodage libre supérieur à 0,35 déclenche « audio non conforme au texte ». Sur les
   répliques babillées, le PER mesuré allait de 0,6 à 2,2.
4. Option MFA français (CC BY 4.0, français d'Afrique dans l'entraînement) en second avis, si un pont conda est un jour
   disponible.

### G4. `VisemeTrack` continu : coarticulation à dominances, version française
Chaque phone i a :
- une cible `T_i = (open, spread, round)` (table de Q4) ;
- un centre `c_i` et une demi-largeur `h_i` ;
- une force labiale `α_i` (forte pour MBP, FV, voyelles et CHJ ; **0,15** pour t, d, n, s, z, k, g, l, ʁ, qui sont
  transparentes).

Dominance du phone i pour le paramètre k :
```
D_i,k(t) = α_i,k                                   si |t − c_i| ≤ h_i
         = α_i,k · exp(−θ_i,k^± · 4·(|t − c_i| − h_i))   sinon
θ^− (anticipation)  = 18 s⁻¹ ; θ^+ (persistance) = 22 s⁻¹
θ^−(round)          = 5 s⁻¹ pour les voyelles arrondies (u y o ø œ ɔ)   # look-ahead français : l'arrondi
                                                                       # couvre tout le groupe consonantique
P_k(t) = Σ_i D_i,k(t) · T_i,k / Σ_i D_i,k(t)       # Cohen–Massaro
```

Contraintes dures appliquées après le mélange :
- `open = 0` sur les 60 % centraux de chaque M/B/P ;
- drapeau `teeth_on_lip` pendant F/V ;
- drapeau `tongue` pour un l long (plus de 120 ms).

Décalage d'avance : la bouche précède le son de **1 image (33 ms)**, dans la zone tolérée de BT.1359.

Intensité comique, à la manière de JALI, sur deux axes :
```
open' = open^(1/JA)
spread', round' = LI · (spread, round)
```
- JA vaut entre 1 et 1,6, selon le volume et l'émotion (colère, cri).
- LI vaut entre 0,8 et 1,3 selon le personnage (bavard, timide).

Améliorations par rapport à Rhubarb :
1. Les voyelles **antérieures arrondies** françaises sont représentées par les axes (y = lèvres de u sur mâchoire de i),
   ce que 6 à 9 dessins A–H ne savent pas faire.
2. L'anticipation de l'arrondi est **différente par paramètre**, alors que Rhubarb a une seule fenêtre de 20 cs pour
   tout.
3. Le résultat est continu, donc directement exploitable par un rig cutout ou un maillage (ARAP) sans « claquement ».

### G5. `MouthSpriteTrack` discret pour les planches à bouches dessinées
Rendu par image à la cadence de rendu (fps explicite) :
```
pour chaque image n : t = n / fps
  cand  = forme(phone actif)                          # ensembles de formes (Rhubarb)
  si consonne transparente : cand ∪= formes des voyelles voisines
  si MBP au cœur : forme = MBP ; si FV : FV ; sinon forme = argmin_{v ∈ cand} ‖P(t) − cible_v‖_W
                                                      # W = (2, 1, 1,5) sur (open, spread, round)
garantir : ∀ M/B/P, au moins 1 image MBP dans [a−1, b+1] (sinon forcer l'image la plus proche de son centre)
supprimer les formes d'1 image (sauf MBP) → la forme voisine (2 passes)
pauses : < 12 cs → garder ; ≤ 35 cs → forme détendue ≠ suivante ; > 35 cs → repos       # règles Rhubarb
intercalaires : grand ouvert → fermé via mi-ouvert « tôt », 4–8 cs ; ouvrir sec, fermer lentement
segments statiques : même forme ≥ 75 cs et ≥ 3 syllabes → alterner E↔I ou A↔E sur une voyelle (≤ 3 essais,
  minimiser Σ durée²)
```

Améliorations :
1. **Fermetures garanties** : 63/63 contre 57/63 en naïf à 25 i/s.
2. Quantification **à la cadence réelle** : on minimise les formes d'une image, et non une durée en cs abstraite.
3. Chaque clé peut être **verrouillée** par l'utilisateur. Une régénération conserve les clés verrouillées : c'est
   l'exigence « éditable » de la spec.
4. La correspondance vers les 5 poses du propriétaire (neutre, rire, choc, haussement, accuse) se limite à la
   **bouche**. L'expression vient d'une autre couche (G6).

### G6. `ProsodyDriver` : tête, sourcils et regard depuis la voix
Événements, depuis `phones.json` (TTS) ou depuis l'alignement plus F0/énergie (voix enregistrée) :
- **accent** = voyelle `stressed` dont la durée dépasse 1,5 fois la médiane des voyelles de la réplique ;
- **frontière** = `sil` de 150 ms ou plus, ou ponctuation ;
- **question** = `?` final, ou pente de F0 positive sur les 300 derniers ms.

Primitives (Graf 2002), tirées avec une graine = hachage de (réplique, personnage) :
```
P(^)=0,42  P(~)=0,18  P(/)=0,20  P(rien)=0,20
^ : hochement x, durée = 2–4 phones autour de l'accent, amplitude A·(1,5°…3°)
~ : idem + rebond (forme en S, 2ᵉ lobe à −35 %)
/ : balancement brusque en x ou y sans retour immédiat (retour lent 0,4–0,8 s)
```
- **Démarrage après pause** : petite descente (−1°) puis hochement vers le haut au début de la phrase (Graf : plus de
  70 % chez un locuteur).
- **Question** : tête +2° et sourcils levés sur les 200 derniers ms.
- **Composition** : la bande lente 0–2 Hz vient des actions (posture, regard). La bande rapide 2–15 Hz vient de ces
  primitives. Un **ressort amorti** critique (ω environ 12 s⁻¹) évite les à-coups.
- **Comique** : l'amplitude A dépend du tempérament (de 1 à 3). Pas de hochement après le dernier accent du punchline,
  pour que le **gel** sur le visage choqué reste net.
- **Sourcils** : levée de 40 à 60 % de leur course sur un accent sur deux, synchronisée au hochement ou isolée.
- **Clignements** : déclenchés de préférence aux frontières, jamais pendant une fermeture M/B/P du gros plan.

### G7. `AudioQualityGate` : critères mesurables par réplique
- `Σ durées == durée WAV` (au plus un échantillon d'écart). Durée WAV vérifiée par ffprobe.
- **CER ASR ≤ 0,15** pour le TTS (lexique nouchi exclu du calcul). Sinon : nouvel essai avec phrase porteuse, puis
  avec un autre `sid`.
- PER aligneur ≤ 0,35 pour une voix enregistrée, sinon « audio ≠ texte ».
- 100 % des M/B/P visibles, et pas de forme d'une image hors MBP.
- Décalage bouche/son entre 0 et +2 images (vidéo en avance).
- Sous-titres séparés, tirés des **mots** horodatés.

### G8. `SfxSynth` et `MusicBed`
- Synthétiseur paramétrique à la manière de sfxr / ZzFX, **réécrit** :
  - oscillateur (sinus, carré, dent de scie, bruit) ;
  - enveloppe A/S/R ;
  - glissando de fréquence et son accélération ;
  - vibrato ;
  - modulation de hauteur par paliers (« arpège ») ;
  - écrêtage et réduction de bits ;
  - passe-haut et passe-bas.
- Rendu déterministe avec graine (numpy hors ligne, ou OfflineAudioContext). Préréglages comiques : `boing`,
  `slide_whistle_up/down`, `rimshot`, `record_scratch`, `pop`, `swoosh`, `crowd_ooh` (bruit filtré par formants).
- **Ducking** : gain musique = −12 dB quand le RMS de la voix sur 50 ms dépasse le seuil. Attaque 30 ms, relâche
  250 ms.
- **AssetRegistry** : chaque son externe porte `{source, licence SPDX, auteur, url, attribution}`. Refus automatique de
  `CC-BY-NC-*` et de toute licence inconnue.

### Ordre de construction proposé
1. G2 + G1 (bruit 0, sans phrase porteuse) — ancre le dialogue et sert de test.
2. G4 + G5.
3. G7.
4. Phrase porteuse et édition des durées (G1).
5. G6.
6. G3, quand l'utilisateur enregistre des voix.
7. G8.
