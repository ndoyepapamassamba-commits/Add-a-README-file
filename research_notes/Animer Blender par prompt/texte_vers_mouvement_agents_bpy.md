# Animer le moteur Blender par prompt : texte → mouvement, retargeting, agents LLM qui écrivent du bpy (état au 14/10/2026)

Méthode : les fichiers LICENSE et README ont été lus directement sur raw.githubusercontent.com et sur les fiches Hugging Face
(source primaire) le 14/10/2026, sauf mention « secondaire » ou « communauté ». L'API GitHub étant fermée pour cette
session, l'absence de fichier LICENSE signifie « aucun fichier LICENSE/LICENSE.md/LICENSE.txt sur main ou master ».
Règle maison rappelée : code et modèles exécutés chez nous en MIT, Apache-2.0 ou BSD seulement. Une dépendance
(modèle de corps SMPL/SMPL-X, jeu de données AMASS, encodeur de texte Llama) qui n'est pas dans cette liste rend la
chaîne non conforme, même si le code est sous MIT.

---

## 1. Modèles texte → mouvement : licences (code, poids, données), dépendance SMPL, format de sortie, vitesse

### Takeaway
En octobre 2026, AUCUN modèle texte→mouvement n'est conforme de bout en bout (code + poids + données + encodeur de texte
en MIT/Apache/BSD). Les modèles à code permissif (MDM, T2M-GPT, MoMask, MotionGPT, Light-T2M) sont entraînés sur
HumanML3D, construit à partir d'AMASS, qui est sous licence MPI « non commerciale ». Les modèles récents entraînés sur des
données commerciales (Kimodo et ARDY de NVIDIA, 2026) ont un code Apache-2.0 mais des poids sous NVIDIA Open Model License
et un encodeur de texte bâti sur Llama-3-8B, qui demande un compte et un jeton Hugging Face. Le meilleur candidat
technique pour le processeur est MoMask : code MIT, sortie BVH directe, démo officielle sur processeur. Il reste limité par
l'origine de ses données d'entraînement.

### Cited Findings

**Tableau comparatif (licences lues sur la source primaire le 14/10/2026)**

| Modèle | Licence du code | Poids / données | SMPL requis ? | Sortie | Vitesse publiée | Verdict |
|---|---|---|---|---|---|---|
| MDM (Tevet) | MIT ([LICENSE](https://github.com/GuyTevet/motion-diffusion-model/blob/main/LICENSE)) | HumanML3D (AMASS non commercial) | Non pour les positions des articulations ; OUI pour le maillage (`render_mesh` lance SMPLify, fichiers SMPL + GPU) ([README](https://github.com/GuyTevet/motion-diffusion-model)) | positions des articulations (figure en bâtons) + `smpl_params.npy` (rotations SMPL) en option | « ~0.4 sec/sample » avec le modèle à 50 pas, matériel non précisé ; mouvement de 9,8 s au maximum ([README](https://github.com/GuyTevet/motion-diffusion-model)) | code OK, données NC |
| MotionDiffuse | **S-Lab License 1.0, usage non commercial** ([LICENSE](https://github.com/mingyuan-zhang/MotionDiffuse/blob/main/LICENSE)) | HumanML3D | — | — | — | refusé |
| T2M-GPT | Apache-2.0 ([LICENSE](https://github.com/Mael-zys/T2M-GPT/blob/main/LICENSE)) | HumanML3D | seulement pour le rendu du maillage, en option ([README](https://github.com/Mael-zys/T2M-GPT)) | positions des articulations | non trouvée | code OK, données NC |
| MoMask | MIT ([LICENSE](https://github.com/EricGuo5513/momask-codes/blob/main/LICENSE)) ; le README ajoute que le code « depends on … SMPL, SMPL-X, PyTorch3D, and uses datasets which each have their own respective licenses » | HumanML3D | non pour le BVH | **fichiers BVH** dans `./animation`, plus une variante `_ik` avec un IK naïf des pieds qui « sometimes will fail » ([README](https://github.com/EricGuo5513/momask-codes)) | démo WebUI « running smoothly on a CPU. No GPU is required » depuis le 02/08/2024 ([README](https://github.com/EricGuo5513/momask-codes)) ; temps moyen sur 100 échantillons mesuré sur une Nvidia 2080Ti, chiffres seulement dans une figure ([article](https://arxiv.org/html/2312.00063v1)) | meilleur candidat processeur ; données NC |
| MotionLCM (V1/V2) | **« License for Non-commercial Scientific Research Purposes »** ([LICENSE](https://github.com/Dai-Wenxun/MotionLCM/blob/main/LICENSE)) | HumanML3D | SMPL pour le rendu | latents puis articulations | « real-time » ([arXiv 2404.19759](https://arxiv.org/abs/2404.19759)) ; V2 « 0.2s~0.3s », GPU non précisé ([blog HF](https://huggingface.co/blog/wxDai/motionlcm-v2)) | refusé |
| MotionGPT (2023) | MIT ([LICENSE](https://github.com/OpenMotionLab/MotionGPT/blob/main/LICENSE)) | HumanML3D | — | articulations | non trouvée | code OK, données NC |
| MotionGPT3 | aucun fichier LICENSE trouvé ([dépôt](https://github.com/OpenMotionLab/MotionGPT3)) ; poids Hugging Face **à accès restreint** (401 sans connexion) ([HF](https://huggingface.co/OpenMotionLab/motiongpt3)) | HumanML3D ; le README lance `download_smpl_model.sh` et `prepare_gpt2.sh` | oui (script de téléchargement SMPL) | — | — | refusé (licence absente) |
| Light-T2M (AAAI 2025) | MIT ([LICENSE](https://github.com/qinghuannn/light-t2m/blob/main/LICENSE)) ; le fichier porte « Copyright (c) 2022 Mathis Petrovich », probablement un gabarit recopié | HumanML3D | — | articulations | 4,48 M de paramètres contre 44,85 M pour MoMask ; 0,152 s contre 0,180 s ([arXiv 2412.11193](https://arxiv.org/abs/2412.11193)) | code OK, données NC |
| BAMM, MMM (exitudio) | **CC BY-NC-ND 4.0** (README [BAMM](https://github.com/exitudio/BAMM), [MMM](https://github.com/exitudio/MMM)) | HumanML3D | — | — | — | refusé |
| HY-Motion 1.0 (Tencent, 30/12/2025) | **Tencent HY-Motion 1.0 Community License** ([License.txt](https://github.com/Tencent-Hunyuan/HY-Motion-1.0/blob/master/License.txt)) : exclut l'UE, le Royaume-Uni et la Corée du Sud ; licence à demander au-delà de 1 M d'utilisateurs actifs par mois ; interdit d'utiliser les sorties pour améliorer un autre modèle d'IA | pré-entraînement sur plus de 3 000 h, affinage sur 400 h ([fiche HF](https://huggingface.co/tencent/HY-Motion-1.0)) | squelette SMPL-H (22 articulations sans les mains) ([article](https://arxiv.org/html/2512.23464v1)) | squelette SMPL-H | 1,0 Md de paramètres : 26 Go de VRAM au minimum ; Lite 0,46 Md : 24 Go ; réécriture du prompt par un LLM (Qwen3 cité) ([README](https://github.com/Tencent-Hunyuan/HY-Motion-1.0)) | refusé (licence + GPU) |
| SnapMoGen (Snap) | **Snap Inc. Non-Commercial License** ([LICENSE](https://github.com/snap-research/SnapMoGen/blob/main/LICENSE)) | — | — | — | — | refusé |
| **Kimodo** (NVIDIA, 16/03/2026) | **Apache-2.0** ([LICENSE](https://github.com/nv-tlabs/kimodo/blob/main/LICENSE)) | poids sous **NVIDIA Open Model License** (variante SMPL-X sous NVIDIA R&D Model License) ; entraîné sur Bones Rigplay 1, 700 h décrites comme « commercially-friendly » ([README](https://github.com/nv-tlabs/kimodo)) ; la fiche indique « ready for commercial use » ([HF](https://huggingface.co/nvidia/Kimodo-SOMA-RP-v1.1)) | non (squelette SOMA ; le corps SOMA-X est sous Apache-2.0) | NPZ ; `--bvh` exporte un BVH (SOMA seulement) ([doc CLI](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/cli.html)) ; NPZ au format AMASS pour la variante SMPL-X | 100 pas de débruitage par défaut ([doc CLI](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/cli.html)) ; environ 17 Go de VRAM tout sur GPU, moins de 3 Go avec `TEXT_ENCODER_DEVICE=cpu` ([README](https://github.com/nv-tlabs/kimodo)) | **bloqué** : encodeur de texte bâti sur Llama-3-8B (accès restreint) |
| **ARDY** (NVIDIA, 10/07/2026) | **Apache-2.0** ([LICENSE](https://github.com/nv-tlabs/ardy/blob/main/LICENSE)) | poids sous NVIDIA Open Model ; Bones Rigplay 1 ([README](https://github.com/nv-tlabs/ardy)) | non | NPZ avec `posed_joints` [T, J, 3], rotations locales et globales, contacts des pieds | génération autorégressive « real-time » ; encodeur LLM2Vec sur GPU en bfloat16 : environ 14 Go, ou sur processeur (plus lent) ([README](https://github.com/nv-tlabs/ardy)) | **bloqué** : même encodeur Llama-3 |
| MotionBricks (NVIDIA, arXiv 2604.24833) | aucun fichier LICENSE trouvé sous `NVlabs/` ni sous `nv-tlabs/motionbricks` | — | — | — | « real-time » ([arXiv](https://arxiv.org/pdf/2604.24833)) | à surveiller |

**Dépendances : jeux de données et modèles de corps**
- HumanML3D (code sous MIT) provient de HumanAct12 et d'AMASS. Le README précise : « Due to the distribution policy of AMASS dataset, we are not allowed to distribute the data directly ». Le reconstruire exige les modèles SMPL+H et DMPL. Ses 22 articulations suivent la structure du squelette SMPL ([README HumanML3D](https://github.com/EricGuo5513/HumanML3D)).
- AMASS est publié sous une « Dataset Copyright License for non-commercial scientific research purposes » ([amass.is.tue.mpg.de/license](https://amass.is.tue.mpg.de/license.html)).
- SMPL-X est gratuit pour la recherche, l'enseignement et l'art non commerciaux ; la licence commerciale passe par Meshcapade ([licence SMPL-X](https://smpl-x.is.tue.mpg.de/modellicense.html)). Selon un résumé de moteur de recherche, non lu sur la source primaire, les licences SMPL de Meshcapade coûtent 1 500 €/an (R&D) et 5 000 €/an (commerciale, plus petite entreprise) ([page Meshcapade](https://meshcapade.notion.site/The-SMPL-Model-Licenses-2144560e54388085af5eff111fcdf266)).
- Kimodo et ARDY dépendent d'un encodeur de texte qui « relies on the gated meta-llama/Meta-Llama-3-8B-Instruct model ». Il faut que « Your HF account has been granted access » et fournir un jeton HF à l'exécution ([installation Kimodo](https://research.nvidia.com/labs/sil/projects/kimodo/docs/getting_started/installation.html) ; [README ARDY](https://github.com/nv-tlabs/ardy)).
- La NVIDIA Open Model License (version du 24/10/2025) précise que « Models are commercially usable ». NVIDIA ne revendique aucun droit sur les sorties. La licence est révocable : elle prend fin si l'on contourne un garde-fou (« Guardrail ») ou si l'on engage un procès en contrefaçon ; NVIDIA peut aussi la mettre à jour. Ce n'est pas une licence OSI ([texte officiel](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/)).
- Le modèle de corps SOMA-X est sous **Apache-2.0**. Les corps SMPL, SMPL-H et SMPL-X n'y sont qu'optionnels, en « User-supplied licensed model files » ([README SOMA-X](https://github.com/NVlabs/SOMA-X)).
- Données Bones : BONES-SEED est décrit comme « Open source for academic use and qualifying startups », en accès restreint sur HF, aux formats SOMA, Unitree G1 et Vicon. RP01 compte « 700+ hours », en BVH et FBX, sous licence payante (« full IP clearance ») ([bones.studio](https://bones.studio/datasets)).
- Conflit de sources sur Kimodo : la fiche HF parle d'un « 30-joint SOMA skeleton » ([HF](https://huggingface.co/nvidia/Kimodo-SOMA-RP-v1.1)), alors que le README annonce le 19/03/2026 « Model inputs/outputs now use the SOMA 77-joint skeleton (`somaskel77`) » ([README](https://github.com/nv-tlabs/kimodo)).

### Inferences
- Pour MDM, MoMask, T2M-GPT et Light-T2M, les poids ne portent pas de licence distincte. Ils ont été appris sur des données AMASS non commerciales, donc les utiliser pour un film publié reste juridiquement incertain. Il faut les traiter comme des outils d'**essai**, pas de production, tant que la question n'est pas tranchée.
- Kimodo et ARDY résolvent le problème des données d'entraînement (Rigplay, commercial). Ils en créent deux autres : des poids hors liste (NVIDIA Open Model) et un encodeur Llama-3 à accès restreint, qui exige un compte HF et un jeton. Nos consignes interdisent de demander ce jeton ou de créer ce compte. Si l'utilisateur veut lever ces blocages, ce sont les plus puissants et les seuls avec un export BVH sur des données commercialement propres.
- Remplacer l'encodeur Llama de Kimodo par un encodeur Apache demanderait un ré-entraînement. Les poids Kimodo sont liés à leur encodeur, ce qu'on infère du fait que la VRAM est « primarily due to the text embedding model ».
- Sur le conteneur à 4 cœurs, seuls MoMask et Light-T2M paraissent réalistes « en secondes » : MoMask a une démo officielle sur processeur, Light-T2M a 4,48 M de paramètres. Aucun chiffre processeur n'est publié ; il faut mesurer chez nous.

### Gaps
- Aucun temps de génération sur processeur publié pour MoMask, T2M-GPT, MDM ou Light-T2M : seulement « fonctionne sur CPU » pour MoMask. Banc d'essai local nécessaire.
- Licence du README de Light-T2M non lue (fichier `README.md`/`readme.md` introuvable sur main).
- Licence exacte de BONES-SEED (texte complet) non lue : jeu de données à accès restreint sur HF.
- Licence de MotionBricks introuvable.
- Format de sortie exact de HY-Motion (BVH ? FBX ?) non confirmé sur la source primaire ; le README remercie le FBX-SDK, mais l'option d'export n'a pas été lue.

---

## 2. Gestes conversationnels pilotés par la voix ou le texte (co-speech)

### Takeaway
Les codes récents sont souvent permissifs (GestureLSM MIT, DiffSHEG BSD-3), mais tous produisent des paramètres
SMPL-X/FLAME ou ont été entraînés sur des données SMPL-X. Il faut donc le modèle de corps SMPL-X, sous licence non
commerciale, pour obtenir des articulations. Aucun outil de cette famille n'est conforme pour nous aujourd'hui. La
couche procédurale pilotée par la voix déjà dans le moteur reste le bon choix, comme le concluait le journal de veille
du 14/10/2026.

### Cited Findings
- **EMAGE / PantoMatrix** : pas de fichier LICENSE ni de mention de licence dans le README du dépôt GitHub ([WebFetch du dépôt](https://github.com/PantoMatrix/PantoMatrix)). En revanche, la fiche des poids `emage_audio` porte `license: apache-2.0` ([HF](https://huggingface.co/H-Liu1997/emage_audio)) et la fiche du jeu BEAT2 aussi ([HF BEAT2](https://huggingface.co/datasets/H-Liu1997/BEAT2)). Le README précise : « Outputs are in SMPLX and FLAME parameters ». Il propose un add-on Blender et le retargeting vers son avatar à partir de fichiers `.npz` SMPL-X ([README](https://github.com/PantoMatrix/PantoMatrix)).
- **GestureLSM** : code sous MIT, « Copyright (c) 2026 Pinxin Liu » ([LICENSE](https://github.com/andypinxinliu/GestureLSM/blob/main/LICENSE)). Le README contient une étape « Download the SMPL model » et utilise BEAT2 (indiqué « License: Apache 2.0 »). La variante MeanFlow à 1 pas est présentée comme « Fastest inference, single step », pour le temps réel ([README](https://github.com/andypinxinliu/GestureLSM)).
- **DiffSHEG** (« Real-Time Speech-driven Holistic 3D Expression and Gesture Generation ») : code sous BSD-3-Clause ([LICENSE](https://github.com/JeremyCJM/DiffSHEG/blob/main/LICENSE)). Les modèles sont entraînés sur BEAT et sur SHOW, le jeu de TalkSHOW ([README](https://github.com/JeremyCJM/DiffSHEG)).
- **TalkSHOW** : pas de fichier LICENSE. Le README demande de s'inscrire sur la page officielle SMPL-X et indique « For commercial licensing, please contact ps-licensing@tue.mpg.de » ([README](https://github.com/yhw-yhw/TalkSHOW)).
- **AMUSE** : « Software Copyright License for non-commercial scientific research purposes » ([LICENSE](https://github.com/kiranchhatre/amuse/blob/main/LICENSE)).
- **Audio2Gestures** (ICCV 2021) : pas de fichier LICENSE. Il dépend du FBX SDK d'Autodesk et de `smplx 1.0`, et les données Trinity sont retargetées vers SMPL-X « using maya » ([README](https://github.com/JingLi513/Audio2Gestures)).
- **LiveGesture** (arXiv, avril 2026, temps réel) : licence non trouvée, selon le journal de veille du 14/10/2026 ([arXiv 2604.10927](https://arxiv.org/abs/2604.10927)).

### Inferences
- Même avec une licence Apache sur les poids (EMAGE) et sur les données (BEAT2), passer des paramètres SMPL-X aux positions des articulations demande le modèle SMPL-X (régresseur d'articulations, forme). Sa licence est non commerciale ([licence SMPL-X](https://smpl-x.is.tue.mpg.de/modellicense.html)). Seule la rotation par articulation pourrait être transférée sans le modèle, sur un squelette de même topologie ; c'est une piste à vérifier juridiquement.
- Ce dont nos personnages en cartes ont besoin, c'est surtout des temps forts (accent, regard, main levée sur un mot fort). Un détecteur de temps forts dans l'audio et le texte qui pilote des gestes procéduraux rend 80 % du service, instantanément et sans dépendance.

### Gaps
- Aucune vitesse sur processeur publiée pour EMAGE, GestureLSM ou DiffSHEG.
- Licence d'origine de BEAT/BEAT2 : seule la fiche HF de l'auteur dit Apache-2.0. Le jeu BEAT original de 2022 n'a pas été relu.

---

## 3. Bibliothèques de mouvements libres pour un usage commercial et outils de retargeting dans Blender (automatisables en Python)

### Takeaway
Bibliothèques utilisables : CMU (« free for all uses », produits commerciaux permis, revente des données interdite) et
100STYLE (CC BY 4.0, vérifié sur Zenodo). Bandai Namco est sous CC BY-NC 4.0, donc refusé. Les conditions de Mixamo ne
sont connues que par une FAQ recopiée sur le forum Adobe (2022) : pas de redistribution des fichiers bruts, pas
d'entraînement de modèles d'apprentissage automatique. Pour le retargeting, Blender n'a pas d'outil dédié intégré
(seulement l'import BVH et les contraintes). Les add-ons automatisables sont tous sous licence GPL ou LGPL, ce qui
est normal dans l'écosystème Blender : Rokoko (LGPL-3, opérateurs `rsl.*`), Keemap (GPL-3), Expy Kit (GPL-3) et
l'extension « Retarget » (GPL-3.0+, Blender 5 et plus).

### Cited Findings
- **CMU Graphics Lab Motion Capture Database** : « This dataset of motions is free for all uses » ; « You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form » ; « Please don't crawl this database! ». Une mention de remerciement est demandée pour les publications ([mocap.cs.cmu.edu](http://mocap.cs.cmu.edu/)).
- **100STYLE** : « Creative Commons Attribution 4.0 International ». Il fournit les BVH originaux et les données traitées ([Zenodo 8127870](https://zenodo.org/records/8127870)).
- **Bandai Namco Research Motiondataset 1 et 2** : **CC BY-NC 4.0**, en BVH, issus de trois acteurs professionnels. Le jeu 1 couvre 17 contenus × 15 styles, le jeu 2 couvre 10 contenus × 7 styles. Les scripts de visualisation Blender sont sous MIT ([README](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset)).
- **Mixamo** (FAQ recopiée par un utilisateur du forum Adobe le 29/09/2022 ; ce n'est pas une page officielle Adobe) : « available for free, with no licensing or royalty fees, for unlimited commercial or non commercial use » ; « the only thing you can't do is distribute the raw character and animation files » ; « The only research application Mixamo content can't be used in is training machine-learning models » ([forum Adobe](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)). La page officielle helpx.adobe.com a renvoyé une erreur 403 le 14/10/2026.
- **ActorCore (Reallusion)** : seul un message de forum non daté a été trouvé : usage commercial en vidéo « without any restrictions », mais licence gratuite « Mass Distribution » à demander pour un jeu ([forum Reallusion](https://forum.reallusion.com/541812/Forum20.aspx)). Page des mouvements gratuits : [actorcore.reallusion.com/motion/free](https://actorcore.reallusion.com/motion/free). Contrat officiel non lu.
- **Import BVH** : intégré à Blender 5.2 LTS (« Motion Capture (.bvh) — Imports or exports bvh-files… ») ([manuel Blender](https://docs.blender.org/manual/en/latest/files/import_export/bvh.html)).
- **Retargeting intégré** : aucune trace d'un outil dédié dans Blender 5.0 ou 5.1 ; tous les résultats renvoient à des add-ons (recherche du 14/10/2026, [Retarget sur extensions.blender.org](https://extensions.blender.org/add-ons/retarget/)).
- **Rokoko Studio Live for Blender** : **LGPL-3.0** ([LICENSE.md](https://github.com/Rokoko/rokoko-studio-live-blender/blob/master/LICENSE.md)). Il fonctionne avec Blender 2.80 et plus, demande une connexion Internet à l'installation pour télécharger des bibliothèques, et exige un personnage en T-pose ([README](https://github.com/Rokoko/rokoko-studio-live-blender)). Opérateurs appelables depuis Python : `rsl.build_bone_list`, `rsl.add_bone_list_item`, `rsl.clear_bone_list`, `rsl.retarget_animation` ([operators/retargeting.py](https://github.com/Rokoko/rokoko-studio-live-blender/blob/master/operators/retargeting.py)).
- **Keemap Rig Transfer** : **GPL-3.0** ([LICENSE](https://github.com/nkeeline/Keemap-Blender-Rig-ReTargeting-Addon/blob/main/LICENSE)). Les auteurs de MoMask écrivent : « we found rokoko usually leads to large error on foot … keemap.rig.transfer shows more precise retargetting » ([README MoMask](https://github.com/EricGuo5513/momask-codes)).
- **Expy Kit** : en-tête « GNU General Public License … version 3 », version 0.6.1 ([__init__.py](https://github.com/pKrime/Expy-Kit/blob/main/__init__.py)).
- **Extension « Retarget »** (KBS-DEV) : « GNU General Public License v3.0 or later », fork d'Expy Kit et d'Animaide, « COMPATIBLE ONLY WITH BLENDER 5 AND HIGHER », version 5.2.0. Elle propose des préréglages pour Mixamo, Unreal, VRoid, MMD, Daz et Auto Rig Pro, un « Bind to Active Armature » et la cuisson de plusieurs actions d'un coup ([extensions.blender.org](https://extensions.blender.org/add-ons/retarget/)). Dates contradictoires sur la page : publication le 19/12/2025, version 5.2.0 du 23/08/2026.
- **API d'animation de Blender 5.0** : l'ancienne API des actions est supprimée (« This covered the properties action.fcurves, action.groups, and action.id_root »). Il faut passer par la channelbag d'un slot ; Blender ajoute `bpy_extras.anim_utils.action_ensure_channelbag_for_slot(action, slot)` et `channelbag.fcurves.ensure()` ([notes de version 5.0, API Python](https://developer.blender.org/docs/release_notes/5.0/python_api/)). Notre `preflight.py` et notre `scene.py` gèrent déjà les deux API (lecture du dépôt, `workbench/scripts/blenderfilm/scene.py` l. 1764-1768).

### Inferences
- Les add-ons de retargeting étant sous GPL ou LGPL, ils sortent de la liste MIT/Apache/BSD. Blender lui-même est sous GPL, et un add-on Blender doit l'être aussi. Les exécuter dans Blender pour produire des clips n'implique pas de redistribuer notre code. À faire valider par l'utilisateur, ou à remplacer par un petit script maison de correspondance d'os (contraintes « Copy Rotation » puis cuisson), qui suffit pour nos rigs de cartes à 3 à 8 os.
- Mixamo exige un compte Adobe pour télécharger (inférence à confirmer). Nos consignes interdisent de créer un compte au nom de l'utilisateur, et l'interdiction d'entraîner des modèles ferme la voie « apprendre sur Mixamo ». À n'utiliser que si l'utilisateur télécharge lui-même.
- Avec CMU et 100STYLE, une bibliothèque de clips indexés par texte est possible sans aucun modèle génératif : l'utilisateur ou un LLM étiquette les clips, puis un prompt retrouve le clip le plus proche. Attention à la clause CMU « no resale even in converted form » : on ne redistribue pas les BVH, seulement des films rendus.

### Gaps
- Texte officiel actuel des conditions de Mixamo (helpx en 403) et existence d'une API ou d'une automatisation autorisée : non vérifiés.
- Licence des packs gratuits de Rokoko (Motion Library) et d'ActorCore : contrats non lus.
- Auto-Rig Pro : seulement décrit comme « commercial » par un guide tiers ; prix et licence non lus.
- retarget-bvh (Diffeomorphic) : dépôt GitHub introuvable sous `Diffeomorphic/retarget-bvh` ; licence non lue.

---

## 4. Agents LLM qui pilotent Blender (BlenderMCP, LL3M, BlenderGPT, SceneCraft, BlenderAlchemy, MotionAgent…) : fiabilité pour l'animation et licences

### Takeaway
BlenderMCP (MIT) est le pont le plus mûr, mais il sert surtout à la modélisation et à la scène. Pour l'animation, le
signal mesuré est mauvais. Dans un banc communautaire de septembre 2026, les scripts d'animation générés pour Blender 5.0
ne s'exécutent que dans 10 % des cas, parce qu'aucun des 10 LLM ne connaît les actions à slots. Un LLM ne doit donc
pas écrire du bpy d'animation brut. Il doit produire un plan JSON validé par un schéma, que notre moteur traduit en
keyframes. LL3M est sous licence de démonstration non commerciale, donc refusé.

### Cited Findings
- **BlenderMCP (ahujasid)** : **MIT** ([LICENSE](https://github.com/ahujasid/blender-mcp/blob/main/LICENSE)). Il s'installe pour Claude Code avec `claude mcp add blender uvx mcp-for-blender`. Il fournit des vues de contrôle (« animation-strip views ») et des fonctions de génération 3D, dont certaines sont « premium ». La télémétrie de contenu est désactivée par défaut, mais un enregistrement anonyme minimal (identifiant d'installation, nom de l'outil, succès, durée, versions, OS) est envoyé sauf si `DISABLE_TELEMETRY=true` ([README](https://github.com/ahujasid/blender-mcp)).
- **LL3M** (Threedle, Université de Chicago) : « Demonstration License Agreement », « solely for non-commercial academic and evaluation purposes ». Il est interdit de modifier ou de décompiler le logiciel, et les sorties sont considérées comme du « Adapted Material » au sens de CC BY 4.0 ([LICENSE](https://github.com/threedle/ll3m/blob/main/LICENSE)).
- **BlenderGPT** : MIT (« Copyright (c) 2023 Aarya Gadekar ») ([LICENSE.md](https://github.com/gd3kr/BlenderGPT/blob/main/LICENSE.md)).
- **Motion-Agent** (szqwu) : MIT, 2025 ([LICENSE](https://github.com/szqwu/Motion-Agent/blob/main/LICENSE)). Ses dépendances (LLM, données) n'ont pas été lues.
- **modelscope/motionagent** : fichier LICENSE Apache-2.0 ([LICENSE](https://github.com/modelscope/motionagent/blob/main/LICENSE)). Contenu du projet non vérifié dans cette veille.
- **Banc « Ask ten LLMs for a Blender 5.0 script »** (DEV Community, 29 septembre, année absente du texte extrait mais cohérente avec 2026 vu les modèles cités ; source **communautaire**) : 10 modèles, 30 tâches, 1 190 réponses notées, exécution headless avec assertions, température 0, sans outils ni recherche. Taux d'exécution : gpt-5.5 95 %, claude-sonnet-5 94 %, gemini-3.1-pro 92 %, … gpt-oss-120b 61 %. Tous modèles confondus : 91 % sur Blender 3.6, 81 % sur 4.2, 83 % sur 4.5, 70 % sur 5.0. « Animation is at 10% » sur 5.0, car `Action.fcurves` passe désormais par `action.layers[0].strips[0].channelbag(slot).fcurves` et « Not one model knew any of these » ([dev.to](https://dev.to/rustam335/ask-ten-llms-for-a-blender-50-script-then-run-it-in-blender-50-1pe3)).
- **SceneActBench** (arXiv, 24/07/2026) : agents VLM qui agissent sur des scènes 3D multi-objets ; 520 cas, 11 configurations propriétaires ; scores globaux de 38,6 à 50,2 ; « none performs consistently well across tasks » ([arXiv 2607.22393](https://arxiv.org/abs/2607.22393)). Un résumé de recherche (secondaire) mentionne des tâches de révision de keyframes via MCP dans Blender, ce que la page d'abstract ne confirme pas.
- **Cutscene Agent** (arXiv, 28/04/2026) : boîte à outils MCP « bidirectional integration between LLM agents and the game engine », agent réalisateur et sous-agents animation, caméra et son, benchmark CutsceneBench. Ni moteur, ni modèle de mouvement, ni chiffres, ni code sur la page d'abstract ([arXiv 2604.25318](https://arxiv.org/abs/2604.25318)).
- **BlenderGym** : banc d'édition 3D par code (placement, éclairage, matériaux procéduraux, blend shapes, géométrie), sans animation (résumé **secondaire** : [emergentmind](https://www.emergentmind.com/topics/blendergym)).

### Inferences
- Le chiffre de 10 % porte sur des scripts sans outils ni documentation. Notre moteur gère déjà les deux API (`scene.py`), donc le LLM ne doit jamais toucher aux F-curves. Il produit des verbes et des cibles (« pointer vers Modou, colère 0,8, 0,6 s ; lever les bras ») que le moteur exécute.
- BlenderMCP peut servir de canal de pilotage interactif sur le PC Windows, à condition de couper la télémétrie avec `DISABLE_TELEMETRY=true`. En headless dans le conteneur, notre pont existant (`scripts/blender-bridge.py`, d'après la liste des tâches) suffit.

### Gaps
- BlenderAlchemy : README et LICENSE introuvables sur main et master (chemin du dépôt peut-être différent) ; licence non vérifiée.
- SceneCraft : aucun code public trouvé.
- Aucun banc publié ne mesure la qualité ou la fiabilité d'une animation de personnage produite par un agent LLM dans Blender : le chiffre de 10 % ne mesure que l'exécution.

---

## 5. Spécifique 2D : Meta AnimatedDrawings (BVH appliqué à un dessin) et pilotage par texte→mouvement

### Takeaway
AnimatedDrawings est sous MIT pour le code, les poids et le jeu Amateur Drawings (vérifié), et accepte n'importe quel
BVH grâce à des fichiers de configuration de mouvement et de retargeting. Il peut donc être piloté par la sortie BVH de
MoMask ou par CMU/100STYLE. Le dépôt est archivé et ne sera plus maintenu. Il tourne dans son propre rendu OpenGL avec
TorchServe, hors de Blender. Le plus utile pour nous est de reprendre son principe de retargeting 3D→2D dans le moteur
Blender.

### Cited Findings
- « Animated Drawings code, model weights, and Amateur Drawings dataset is released under the MIT license ». Les poids de détection et d'estimation de pose des figures dessinées sont dans les releases, sous MIT ([README](https://github.com/facebookresearch/AnimatedDrawings) ; [LICENSE](https://github.com/facebookresearch/AnimatedDrawings/blob/main/LICENSE)).
- Le dépôt est **archivé** : « Update 09-03-25 … I've chosen to archive it » ([README](https://github.com/facebookresearch/AnimatedDrawings)).
- « You can use any motion clip you'd like, as long as it is in BVH format. If the BVH's skeleton differs … you'll need to create a new motion config file and retarget config file » ([README](https://github.com/facebookresearch/AnimatedDrawings)).
- L'analyse d'un dessin (détection, segmentation, rig) passe par un conteneur Docker TorchServe. Il faut jusqu'à 16 Go de RAM pour Docker si TorchServe échoue ; un script local sans Docker existe pour macOS ([README](https://github.com/facebookresearch/AnimatedDrawings)).
- Le dépôt contient une implémentation Python d'ARAP (`animated_drawings/model/arap.py`) ([README](https://github.com/facebookresearch/AnimatedDrawings)).

### Inferences
- La chaîne MoMask (BVH, squelette HumanML3D à 22 articulations) → AnimatedDrawings est techniquement directe : un fichier de configuration de mouvement et un de retargeting suffisent. Elle reste sujette à la réserve sur les données de MoMask (§1).
- Pour notre moteur de cartes dans Blender, on récupère l'idée plutôt que l'outil : projeter chaque segment 3D (bras, buste, tête) dans le plan de la carte et ne garder que l'angle dans ce plan (rotation Z des os root, spine, head et bras), la profondeur servant à l'échelle et à l'ordre d'affichage. Notre marionnette ARAP existe déjà (tâche n°106).

### Gaps
- Pas de mesure du temps de rendu d'AnimatedDrawings sur processeur.
- Aucun fork maintenu identifié depuis l'archivage.

---

## 6. Chaîne recommandée prompt → mouvement → Blender (processeur, secondes, licences permissives) et manques

### Takeaway
La seule chaîne 100 % conforme aujourd'hui, et rapide sur le processeur, se fait en deux étages. D'abord, un LLM transforme
le prompt en un plan d'action JSON validé par un schéma (verbes, cibles, émotion, durée). Ensuite, le moteur bpy exécute
ce plan par des générateurs de poses procéduraux avec l'IK de Blender, et par des clips récupérés dans une bibliothèque
CMU et 100STYLE retargetée vers nos rigs. Un modèle génératif (MoMask sur processeur ; Kimodo ou ARDY sur GPU) n'entre
qu'en option marquée « essai » tant que les blocages de licence ne sont pas levés.

### Cited Findings
- Faits d'appui, voir les sections précédentes : sortie BVH de MoMask et démo sur processeur ([README MoMask](https://github.com/EricGuo5513/momask-codes)) ; conditions CMU ([mocap.cs.cmu.edu](http://mocap.cs.cmu.edu/)) ; 100STYLE sous CC BY 4.0 ([Zenodo](https://zenodo.org/records/8127870)) ; import BVH intégré ([manuel Blender](https://docs.blender.org/manual/en/latest/files/import_export/bvh.html)) ; 10 % de réussite pour l'animation en bpy brut sur Blender 5.0 ([dev.to](https://dev.to/rustam335/ask-ten-llms-for-a-blender-50-script-then-run-it-in-blender-50-1pe3)) ; export `--bvh` de Kimodo et son encodeur Llama à accès restreint ([doc CLI](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/cli.html), [installation](https://research.nvidia.com/labs/sil/projects/kimodo/docs/getting_started/installation.html)) ; corps SOMA-X sous Apache-2.0 ([SOMA-X](https://github.com/NVlabs/SOMA-X)).

### Inferences

**Chaîne proposée, sans données inventées : à mesurer chez nous**
1. **Prompt → plan JSON (LLM existant du routeur).** Exemple : « Nounou montre Modou du doigt avec colère, puis lève les bras » donne
   `[{acteur:"Nounou", verbe:"pointer", cible:"Modou", emotion:"colere", intensite:0.8, debut:0.0, duree:0.7},
     {acteur:"Nounou", verbe:"bras_au_ciel", emotion:"exasperation", debut:0.7, duree:0.9}]`.
   Le schéma fixe un vocabulaire fermé : pointer, bras_au_ciel, haussement d'épaules, mains sur les hanches, hochement,
   pied qui tape, se pencher, croiser les bras, etc. Le moteur rejette tout verbe inconnu. Le LLM n'écrit pas de bpy, à
   cause des 10 % mesurés plus haut.
2. **Plan → pose (bpy, processeur, quelques millisecondes par verbe ; à mesurer).** Chaque verbe est un générateur
   paramétrique : cible IK sur la tête ou le corps de l'interlocuteur (contrainte IK native de Blender, chaîne de deux os
   pour le bras), courbes d'anticipation, de dépassement et de maintien selon l'émotion, plus la couche procédurale
   existante (respiration, report de poids, penchée vers le partenaire). Il faut ajouter des os aux bras des rigs de
   cartes, qui n'ont aujourd'hui que root, spine et head.
3. **Option clip.** Une bibliothèque CMU et 100STYLE étiquetée (verbe, émotion) est importée en BVH par l'import intégré,
   retargetée par une table de correspondance d'os maison (contraintes « Copy Rotation », cuisson avec `bpy.ops.nla.bake`,
   nom à confirmer en 5.2), puis projetée dans le plan de la carte, à la manière d'AnimatedDrawings (§5). Attribution
   CC BY 4.0 au générique pour 100STYLE ; pas de revente des BVH CMU.
4. **Option générative « essai ».** MoMask sur le conteneur (code MIT, BVH direct) génère un clip pour un verbe absent de la
   bibliothèque. Clips marqués « données AMASS NC » et non publiés tant que la question n'est pas tranchée. Sur le PC
   Windows avec GPU, Kimodo ou ARDY ne s'utilisent que si l'utilisateur accepte lui-même la NVIDIA Open Model License,
   la licence Llama 3 et son propre jeton HF. Nous ne le demandons ni ne le créons.
5. **Contrôle.** Le preflight existant, avec en plus une vérification de la direction du doigt vers la cible (angle bras→cible)
   et l'absence de pénétration.

**Ce qui manque (à surveiller dans la veille)**
- Un modèle texte→mouvement entièrement permissif : code, poids, données d'entraînement ET encodeur de texte (par exemple un
  encodeur Apache ou MIT à la place de Llama-3 ou CLIP), entraîné sur des données commercialement propres.
  Kimodo-SOMA-SEED, entraîné sur le sous-ensemble public BONES-SEED, s'en approche, mais la licence de BONES-SEED dit
  « academic use and qualifying startups ».
- Des temps processeur mesurés pour MoMask et Light-T2M sur 4 cœurs : banc local à faire.
- Un modèle de gestes conversationnels sans SMPL-X.
- Un retargeting 3D→carte 2D publié et maintenu (AnimatedDrawings est archivé).
- Une mesure de la qualité perçue (et pas seulement de l'exécution) des animations produites par des agents LLM.

### Gaps
- Aucun des temps « en secondes » de cette chaîne n'est mesuré à ce jour ; ce sont des objectifs, pas des résultats.
- Le nom exact des opérateurs bpy de 5.2 (`import_anim.bvh`, `nla.bake`) est cité de mémoire et doit être vérifié dans l'API 5.2 avant intégration.
