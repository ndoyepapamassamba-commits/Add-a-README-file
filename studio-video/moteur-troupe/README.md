# Chaîne « troupe générée » — vidéos TikTok d'une minute, cohérentes et rapides (16/10/2026)

Production en série d'animations au format de la chaîne de l'utilisateur, à partir de personnages et de scènes
générés **dans un même style**, contrôlés par **JEV**, puis animés sur place. Les images, voix et films produits sont
privés : ils ne sont jamais dans ce dépôt (scratchpad ou `workbench/.private/`).

| Étape | Script | Outils (licences) |
|---|---|---|
| Cartes d'identité visuelles des personnages et lieux | `adn.py` | bible `coeur/studio/actor/profiles/` |
| Génération (fiches, scènes) | `horde.py`, `lot.py` | Z-Image-Turbo (Apache-2.0) via AI Horde (sans compte) |
| Juge de cohérence | `jev_juge.py` | JEV 1.14 images (TypeSafe) : identité vs fiche, taille, cadrage, texte, nombre, lieu |
| Personnage raté → fiche incrustée à l'échelle | `incruste.py` | MagicTouch, BiRefNet, LaMa ; transfert de Reinhard (2001) |
| Préparation d'une scène (une fois) | `prepare_scene.py` | Pose / Face Landmarker, MagicTouch (Apache-2.0), LaMa (Apache-2.0) |
| Texte parasite effacé | `texte.py` | EasyOCR + LaMa (Apache-2.0) |
| Visages (une fois par scène) | `visages.py` | LivePortrait (MIT) — seules bouche et paupières sont greffées, alignées |
| Voix au ton de la chaîne | `voix.py`, `f0.py`, `ecoute.py` | Piper siwis (CC-BY) / gilles (CC0), WORLD (BSD), Whisper (MIT) |
| **Animation par outil** (plan par plan, arbitrée par JEV) | `anime_ia.py` | Wan2.2-S2V (Apache-2.0) : image + voix → bouche, tête, buste, gestes ; API Alibaba Model Studio (clé `DASHSCOPE_API_KEY`) ou Space public Wan-AI, ou ComfyUI + Wan (local, ou sur une carte T4 GRATUITE du compte Kaggle de l'utilisateur, pilotée d'ici : `kaggle_moteur.py` + `noyau_kaggle.py`, rien à installer sur le PC) ; JEV garde le plan de l'outil seulement s'il est fidèle, sans déformation et plus vivant ; sinon le plan du moteur reste |
| Visèmes depuis l'audio | `levres.py` | Rhubarb Lip Sync (MIT), mode phonétique (les voix Piper utilisées ne donnent pas d'alignement) |
| Tournage | `tourne.py` | jeu sur place, découpage mesuré, règles « tête entière ou absente » et « pas de corps sans tête », aucun plan < 0,5 s ; mâchoire paramétrique quand LivePortrait n'ouvre pas la bouche (barbe, lunettes noires) ; acteur en bicubique, cadre sous-pixel |
| Montage 9:16 | `compose.py` | sous-titres karaoké, cartes émoji Fluent (MIT), −14 LUFS |
| Contrôle avant livraison (tests 1–6, 5 bis) | `controle_video.py`, `mesure2.py`, `levres_roi.py` | durée, cadence, décodage, sonie EBU R128, images noires et gels, fluidité, lèvres mesurées sur l'image rendue (pistes de visages par plus proche voisin ; 5 bis : visage du locuteur retrouvé par corrélation, toutes les répliques), Whisper |
| Œil de JEV sur le film (test 7) | `jev_plans.py` | tête coupée, visage déformé, artefacts, style, une image par plan |
| Preuve différentielle (test 8) | `jev_diff.py`, `jev_paires.py` | même plan avant / après animation ; témoins « identique » et « encodage seul » pour séparer moteur, compression et bruit du juge |

```
python3 voix.py                         # histoire.json → voix/ + timeline.json
python3 prepare_scene.py scenes/x.png prep/x "A,B"
python3 visages.py prep/x               # environnement avec torch
python3 levres.py timeline.json        # visèmes Rhubarb → timeline.json
python3 tourne.py montage.json sortie   # puis : python3 compose.py sortie sortie/film.mp4
python3 controle_video.py sortie/film.mp4 timeline.json sortie/tournage.json sortie/controle.json
python3 jev_plans.py sortie/film.mp4 sortie/tournage.json sortie/jev_plans.json
python3 jev_diff.py sortie/film.mp4 sortie/tournage.json sortie/source sortie/jev_diff.json
python3 levres_roi.py sortie/film.mp4 timeline.json montage.json sortie/levres_roi.json
# animation par outil : préparer les plans parlants, animer, réinsérer (JEV arbitre), puis remonter
python3 anime_ia.py prepare sortie timeline.json && python3 anime_ia.py genere sortie dashscope && python3 anime_ia.py insere sortie
# même chose sur une carte graphique gratuite (Kaggle), sans rien installer sur le PC (jeton KAGGLE_API_TOKEN dans l'environnement)
pip install kaggle && python3 kaggle_moteur.py a-blanc sortie s2v      # contrôle du paquet et du carnet, rien n'est envoyé
python3 anime_ia.py genere sortie kaggle && python3 anime_ia.py insere sortie
```

### ComfyUI + Wan sans PowerShell (16/10/2026)

L'organisation de l'utilisateur interdit l'installation par PowerShell : la carte graphique est donc empruntée à distance.

| Fichier | Rôle |
|---|---|
| `kaggle_moteur.py` | Dépose les plans parlants (image + son exact, `config.json`) dans un jeu de données **privé** du compte Kaggle de l'utilisateur, lance le carnet sur une T4, attend la fin et rapatrie `<cle>.mp4` + `kaggle_mesures.json` (temps mesurés, mémoire maximale, erreurs). Commandes : `a-blanc`, `envoie`, `suit`, `tout`, `quota`. |
| `noyau_kaggle.py` | Tourne sur la T4 : ComfyUI figé (0.41.0, commit `fc04da9`) + ComfyUI-GGUF figé (`6ea2651`) installés dans `/tmp`, kit téléchargé en parallèle, version GGUF choisie d'après la mémoire de la carte, un serveur par carte, contrôle « vidéo noire », mesures écrites au fil de l'eau. Essai hors Kaggle : `NOYAU_ESSAI=1`. |
| `comfy_wan.py` | Graphes ComfyUI Wan2.2-S2V et InfiniteTalk (une ou deux voix), chargeur fp8 ou GGUF, client HTTP (adresse par serveur). |
| `modeles_wan.json`, `installer_comfyui_wan.sh` | Manifeste des fichiers du kit (liens vérifiés) et installation Linux/macOS. `installer_comfyui_wan.ps1` reste pour les postes Windows où PowerShell est permis. |

Contrôles du 16/10/2026 sur le ComfyUI d'essai : graphes S2V et InfiniteTalk en GGUF acceptés par le serveur (`node_errors` vide), exécution lancée jusqu'au chargement des fichiers ; noyau exécuté de bout en bout en mode essai (21 plans, 51,7 s à animer) ; paquet de 10,5 Mo ; récupération des versions figées vérifiée ; refus propre sans jeton ou avec un jeton invalide. Le temps réel sur T4 sera celui écrit par le noyau dans `kaggle_mesures.json` au premier passage.

### Corps entier, visage dessiné, regard et décor contrôlé (17/10/2026)

Chaque scène est préparée **une fois** (`prepare_rig.py prep/<scène>`, résultat dans `<scène>/rig/`), puis tous les épisodes
tournés dans ce lieu la réutilisent. `tourne.py` l'utilise dès que `"rig": 1` est dans les réglages du montage.

| Étape | Module | Ce qui est fait | Outils (licences) |
|---|---|---|---|
| Découpe de chaque personne entière | `rig2d.decoupe` | segmentation « personne », pièce reliée au cœur de l'ancien masque, bords par filtre guidé ; **les meubles restent au décor** : là où MediaPipe dit « personne » et ADE20K dit « chaise », la couleur tranche (GrabCut local) | MediaPipe (Apache-2.0), UperNet ConvNeXt ADE20K (MIT, ONNX), OpenCV GrabCut (Apache-2.0) |
| Pixels orphelins | `prepare_rig.orphelins` | tout pixel « personne » sans propriétaire est rattaché à l'acteur le plus proche (bande de robe coincée entre deux acteurs) | — |
| Squelette affiné | `prepare_rig.squelette` | pose re-détectée sur le recadrage agrandi ×2 de chaque acteur, gardée si elle est meilleure (visibilité × articulations dans la découpe) | Pose Landmarker heavy (Apache-2.0) |
| Décor sans acteur | `plaque.py` | remplissage progressif à pleine résolution, grain rendu, **restes et objets inventés rebouchés** (couleur absente du décor autour, ou personne), fils prolongés jusqu'à leur appui, parties cachées complétées | LaMa (Apache-2.0), LSD (OpenCV) |
| Contrôle de cohérence | `coherence.py` | restes de personne, netteté reconstituée, découpes, et l'œil de JEV (fil dans le vide, objet coupé, flotte, membre, texte, ombres, échelle ; taches et restes dans la plaque) | JEV 1.14 (TypeSafe) |
| Squelette 2D de la tête aux pieds | `rig2d.py` | ARAP sur grille (cœurs rigides, articulations libres), mains et avant-bras en calques, tête en 3D (relief du visage), **enveloppe mesurée** de chaque mouvement (buste, tête, épaules, bassin, souffle, lacets de tête et de buste) que le jeu ne dépasse jamais | SciPy (BSD) |
| Expressions dessinées | `expressions_lp.py`, `lp_onnx.py`, `prepare_expressions.py` | 15 émotions × 4 ouvertures de bouche + yeux clos par personnage ; **recette cherchée pour chaque visage** (recette de base, « sourcils + », « bouche + », recettes de rechange, jugées en parallèle par l'œil de JEV : la plus lisible qui n'abîme pas ce visage, défaut toléré +0,12 au neutre) ; passage d'une émotion à l'autre par **morphing** (flux optique DIS), pas de fondu | LivePortrait (MIT, ONNX Runtime), JEV 1.14 |
| Jeu | `jeu.py` | ressenti (événements des répliques), orientation de la tête et du regard vers l'interlocuteur, regard vers le bas quand on est triste, ressorts amortis | — |
| Caméra | `tourne.py` (`cadres_du_plan`, `frame_scene`) | glissement vers le côté libre, **grue** (toute la place en hauteur, un plan sur deux) et **travelling avant** (`pousse`, 10 %) validés par la règle « tête entière ou absente » ; parallaxe latérale ET avant : pendant la poussée le décor lointain grossit moins que les acteurs (z^kpar, carte de profondeur) ; `TOURNE_CADRES=1` écrit les cadres de chaque plan sans rien rendre | Depth Anything V2 (Apache-2.0, carte déjà préparée) |
| Mesure | `cadre.py`, `mesure2.py` | mêmes instruments que pour les TikTok de l'utilisateur | — |

```
python3 prepare_rig.py prep/cour                 # une fois par scène (cache : la plaque est reprise si les découpes n'ont pas changé)
python3 prepare_expressions.py prep/cour         # une fois par personnage et par scène (≈ 6 min par personnage sur 4 cœurs)
ETIREMENT=1 python3 tourne.py montage.json sortie [sketch]   # ETIREMENT=1 : étirement, pose et ressenti mesurés image par image
python3 cadre.py juge sortie/film.mp4            # tableau film / TikTok / studios
```

Mesures du 17/10/2026 (sketch « la cachette », 22,5 s) : étirement du corps (99e centile, médiane des images) Baye 4,2 %,
Maman 3,7 %, Petit Mamadou 2,9 % ; 8 mesures sur 9 dans la fourchette des TikTok de l'utilisateur ; rendu 670 images en
≈ 2 min 30 sur 4 cœurs ; colère de Petit Mamadou lisible à 0,76 selon JEV (défaut 0,27).

### Voix d'Afrique de l'Ouest, jingle, juge qualité à 10 portes, machine à blagues (17/10/2026, soir)

| Étape | Module | Ce qui est fait | Outils (licences) |
|---|---|---|---|
| Voix clonées | `voix.py` (`VOIX_MOTEUR=qwen3`), `voix_qwen.py` | chaque personnage reçoit une voix de référence (`VOIX_REFS/refs.json`, hors dépôt : extraits des TikTok de l'utilisateur, ou du corpus OpenSLR 57 « African Accented French ») ; toutes les répliques en un seul passage du modèle ; **chaque prise réécoutée par Whisper** et refaite avec une autre graine si elle est mal comprise ; hauteur poussée à mi-chemin du registre visé, débit ramené vers celui de la chaîne (×1,3 au plus, jamais sur une chute) ; repli Piper pour un personnage sans référence | Qwen3-TTS 0,6 B Base (Apache-2.0), OpenSLR 57 (Apache-2.0), Whisper small (MIT), WORLD (BSD) |
| Comparer dit / écrit | `mots.py` | chiffres écrits en lettres (« 500 » = « cinq cents »), mots du parler ivoirien retirés des deux côtés, erreur de mots | — |
| Formes de bouche | `levres.py` | après les voix : visèmes lus dans l'audio de chaque réplique | Rhubarb Lip Sync (MIT) |
| Jingle | `musique.py` | jingle d'1 s synthétisé (balafon pentatonique + appel de djembé), varié à chaque carte et en fin ; la bande dialogue reste sèche comme dans les TikTok | code maison |
| Réaction tenue | `voix.py` | 2 s de réaction après une chute finale, 0,9 s après une réplique de rattrapage : le plan de réaction existe vraiment | — |
| Bibliothèques reprises | `expressions_lp.py` | `partiel.json` écrit après chaque émotion : une construction coupée (minuterie, machine reprise) repart où elle s'était arrêtée | — |
| Juge qualité | `qualite.py` | 10 portes : A rythme, B bouche lisible, C étirement, D écoute, E automate, F arrière-plan vivant, G œil de JEV, H technique et son (sautes ≤ 0,6/s), **I fluidité** (aucun à-coup de tête, de buste ou d'expression d'une image à l'autre), **J humour** (chaque sketch noté par JEV) ; film livré seulement à 10/10 | JEV 1.14, Whisper |
| Histoires et blagues | `histoires.py`, `exporte_bible.ts` | brouillons contrôlés par le code, notés par JEV (drôle, chute, parler ivoirien jugé sur les répliques seules, clarté, méchanceté), échelle de champions par duels dans les deux ordres | JEV 1.14 ; modèle d'écriture : celui du routeur de l'app, ou gratuit sans clé |

```
VOIX_MOTEUR=qwen3 QWEN_PY=<python avec torch> python3 voix.py   # voix clonées + frise (timeline.json)
python3 levres.py timeline.json                                  # formes de bouche lues dans l'audio
python3 musique.py timeline.json voix/mix.wav voix/mix-musique.wav
ETIREMENT=1 TOURNE_PROCS=4 python3 tourne.py montage.json film && python3 compose.py film film/film.mp4
python3 qualite.py film film/film.mp4 montage.json               # 10 portes → film/qualite.json
```

### Troupe en dessin animé : âge, proportions, gestes et regards (19/10/2026)

| Étape | Module | Ce qui est fait | Outils (licences) |
|---|---|---|---|
| Contrôle de la troupe | `controle_troupe.py` | par lieu préparé : âge apparent du visage ET de la silhouette (tranches d'âge lues en zéro-coup, attendu tiré des cartes `adn.py`, conforme si > 0,5), têtes du crâne aux hanches (un adulte en compte plus que l'enfant de la scène), et partenaires que chacun peut regarder avec ce que le moteur ajoute au visage peint (24°). Bloque la publication (`usine.finit`) | SigLIP base (Apache-2.0) |
| Retouche à la source | `retouche_troupe.py` | consigne d'édition écrite à partir des échecs du contrôle, scène éditée dans son propre style, seuls les personnages corrigés recollés, seconde passe sur le visage agrandi, contrôle refait, graines suivantes tant qu'il échoue → `prep/<lieu>-v2` préparé | FLUX.2 [klein] 4B (Apache-2.0) par stable-diffusion.cpp (MIT), sur processeur |
| Gestes qui quittent leur appui | `gestes.enveloppe_revelee`, `tourne.py` | une main posée (table, hanche) se lève pendant la réplique et revient : le bras découvre sa place, reconstituée (LaMa + grain du dessin) et contrôlée (pas de bras fantôme, pas de couleur étrangère) ; jusqu'à 28° pour un avant-bras, 20° pour une main | LaMa (Apache-2.0) |
| Penché d'engagement | `jeu.py` (`PENCHE_FRAC`, `PENCHE_JEU`) | l'orateur se penche vers son interlocuteur 0,25 s avant sa réplique, bat sur ses syllabes fortes, se redresse après ; recule sur le choc et le rire | méthode publiée réécrite |
| Regards jugés en local | `jev_regard.local` | réplique par réplique, la géométrie exacte du regard rendu (lacet peint + squelette + visage, iris peint + commande, inclinaison de la tête) : chacun regarde-t-il la bonne personne plus de la moitié du temps ? Une porte qui ne juge rien échoue | — |
| Iris borné en ellipse | `regard.py` | course relative élargie (1,8 ; 1,7), position finale gardée dans le disque de la course : l'iris peut descendre vers un enfant plus bas sans sortir de l'œil | — |

### Dictionnaire humain des gestes : BEAT2 entier injecté à la troupe (19/10/2026)

| Étape | Module | Ce qui est fait | Outils (licences) |
|---|---|---|---|
| Démontage | REA (`inspect-artifact`) | archive BEAT2 lue sans exécuter de code (`allow_pickle=False`) : rotations SMPL-X (bassin, 21 articulations, mains), 30 i/s ; mots alignés (TextGrid), gestes annotés (type, force, mot) ; émotions d'après le lisez-moi officiel de BEAT | REA (MIT) |
| Conversion | `dictionnaire_humain.py construit` | 1 428 enregistrements (anglais 1 000, chinois 310, japonais 66, espagnol 52), 46,3 h, 20 locuteurs, téléchargés, convertis en pistes puis effacés : 141 Mo de pistes en 540 s ; seules les rotations servent (notre squelette, pas le modèle de corps SMPL-X) ; mêmes canaux et mêmes signes que la capture CMU (vérifiés : avance de l'avant-bras +0,68 contre +0,48, tangage de tête +5,5° contre +9,3°) | BEAT2 (Apache-2.0) |
| Index | `dictionnaire_humain.index` | par enregistrement : langue, locuteur, émotion (neutre, joie, colère, tristesse, mépris, surprise, peur, dégoût), 21 238 gestes typés (battement, iconique, métaphorique, déictique), apex par seconde, parole image par image | — |
| Choix du geste | `mocap_jeu.choisir` (vectorisé) | chaque réplique examine 40 enregistrements tirés selon l'émotion de son jeu (accuser → colère/mépris, choc → surprise/peur…), plus les prises CMU : syllabes fortes sur les apex, le locuteur doit parler pendant la réplique, bonus au geste annoté du bon type (déictique pour accuser) et à la vivacité ; même résultat que l'ancien calcul sur la CMU (6 essais sur 8 identiques, 2 égalités de coût) | — |
| Doublures | `dictionnaire_humain.doublures` | chaque personnage garde deux locuteurs BEAT2 d'une réplique et d'un épisode à l'autre (style gestuel constant), choisis dans le tiers d'énergie mesurée qui convient (enfant : les plus vifs, aîné : les plus posés) | — |
| Échelle dessin animé | `mocap_jeu.EXAG_BEAT2` | la conversation naturelle est 2,4 à 5 fois plus petite que le jeu d'acteur CMU sur lequel le moteur est réglé (mesuré sur 38 prises CMU et 200 enregistrements BEAT2) : rythme et forme gardés, ampleur portée à celle du jeu d'acteur ; repos du bras pris dans la fenêtre de la réplique (l'orateur BEAT2 garde souvent les mains levées) | principe d'exagération des animateurs |
| Écoute | `mocap_jeu.couche`, `hochements`, `jeu.pistes` | l'auditeur garde les prises CMU d'écoute (plus vivantes une fois filtrées) et reçoit 538 vrais hochements, dont 478 d'auditeurs BEAT2 (silences des conversations, portés à l'ampleur des hochements CMU) ; les apex de l'auditeur ne sont plus pénalisés (c'étaient ses hochements) ; gain de l'écoute séparé du gain de la parole (les pics des répliques ne la rapetissent plus) | — |
| Garde de souplesse | `jeu.garde_souplesse` | fenêtres examinées tous les 5 images au lieu de 30 : les fenêtres de la porte Q partent du début de chaque plan, la garde les voit toutes | — |
| Cache de tournage | `tourne.py` (empreinte) | la source des gestes (`MOCAP_SOURCE`, `MOCAP_BEAT_N`) et l'index du dictionnaire entrent dans l'empreinte des plans : un tournage BEAT2 ne reprend plus les images d'un tournage CMU | — |

Mesuré le 19/10/2026 sur le sketch du bulletin (26 s, trois personnages, mêmes dessins, même code, seule la source change ; 1 512 images à 60 i/s, 3 min 50 s par version) : porte de souplesse Q au niveau humain des deux côtés ; Maman Nounou : avant-bras 8,1° → 11,4° de crête à crête par seconde (≥ 6° : 54 % → 58 % des secondes) ; Petit Mamadou : tête ≥ 3° 81 % → 85 %, buste ≥ 2° 27 % → 38 %, « ensemble » 42 % → 46 % ; Baye : tête ≥ 3° 46 % → 35 % (il parle peu : son écoute garde les prises CMU) ; 8 répliques sur 8 jouées par 8 enregistrements différents (contre des prises CMU reprises), émotion accordée au jeu (mépris 4, neutre 3, joie 1). Hors tournage, sur les 55 répliques de l'épisode : part des secondes avec un geste du bras ≥ 6° 42,7 % → 45,3 %, souplesse au niveau humain sur les cinq articulations. Greffe en cours : des bras à deux segments (épaule + coude, IK) pour que les mains quittent vraiment la hanche et la table — le dictionnaire fournit déjà les angles d'épaule (`lever`), de coude (`coude`) et l'avance de l'avant-bras ; mesure de réussite : bras ≥ 6° sur plus de 60 % des secondes de parole sans fantôme ni étirement.

### Tête et buste aux normes humaines, par le squelette (19/10/2026)

Demande : « revoir aussi les mouvements de la tête, qui doivent se tourner selon les normes humaines par le squelette ».
Normes mesurées sur 204 enregistrements BEAT2 (crête à crête par seconde, parole / écoute) : lacet 4,7 / 3,8°, tangage
4,1 / 3,6°, roulis 3,0 / 2,5°, buste penché 1,4 / 1,2°, buste en lacet 3,7 / 3,2° ; tête entière ≥ 3° sur 85 % des secondes
de parole et 78 % d'écoute, buste ≥ 2° sur 74 % / 67 % ; lacet crête à crête sur 3 s : 9,3° ; virages : durée ≈ 0,554 s
+ 0,0143 s par degré ; sur les virages de 15° et plus, le buste suit à 0,32 de la tête (2 490 virages).

| Cause trouvée (mesurée) | Remède (`jeu.py`) |
|---|---|
| Tourné vers celui qui parle (15° voulus pour 6° d'enveloppe), le squelette saturait sa borne douce : chaque mouvement autour de cette position écrasé ×0,07 (lacet d'écoute de Maman 0,8° par seconde, buste 0,1°) | `borne_vive` : la position lente (sous 0,3 Hz) ne prend plus que la moitié de l'enveloppe, le visage (LivePortrait) porte le reste du regard ; le mouvement vif garde l'autre moitié |
| Les gardes de souplesse (filtre, garde SPARC de la porte Q) rabotaient l'ampleur : buste 3,2° par seconde de parole avant elles, 1,0° après | `ampleur_humaine` : la souplesse SPARC ne dépend pas de l'ampleur ; la part vive est remise à la norme humaine × 1,2 (dessin animé), parole et écoute séparées, dans l'enveloppe, puis garde de souplesse sans marge (seules les fenêtres plus raides que les 10 % les plus raides des humains sont lissées), deux tours |
| Le lacet capté remplissait l'enveloppe à ses pics : 12,6 à 24° sur 3 s | `LACET_3S_HUMAIN` : ramené à 11° (9,3° × 1,2) |
| Le buste ne suivait pas la tête (0,00 à 0,09 contre 0,32) | `BUSTE_SUIT` : le buste suit la tête entière à 0,32, en retard (ressort) |

Hors tournage, 7 acteurs, 3 sketchs (avant → après) : tête ≥ 3° 93 → 98 % des secondes de parole et 68 → 77 % d'écoute ; buste
≥ 2° 33 → 81 % et 40 → 72 % ; lacet sur 3 s 18,7° → 12,0° ; porte de souplesse Q au niveau humain sur les cinq articulations.
Tournage du bulletin (1 512 images, 3 min 53 s) : tête ≥ 3° Baye 31 → 69 %, Maman 27 → 58 %, Petit Mamadou 69 → 88 % ; buste
≥ 2° 27 → 54 %, 35 → 65 %, 12 → 81 % ; « ensemble » 23 → 58 %, 35 → 65 %, 31 → 85 % ; étirement (médiane du 99e centile)
0,054 → 0,040, 0,063 → 0,039, 0,050 → 0,034 ; part du squelette dans les virages de tête 43 → 70 % ; virage de 20 à 40° :
1,25 s → 0,73 s (humain 0,94), pointe 59 → 97°/s (humain 87) ; porte Q passée. Le dictionnaire passe en version 2 : angles des
bras dans le plan de l'écran (`bras_f`, `coude_f`, `raccourci`) pour les bras à deux segments (1 428 enregistrements reconvertis
en 577 s, 0 erreur).
