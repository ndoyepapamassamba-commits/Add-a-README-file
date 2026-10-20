# Outils desktop libres scriptables et rendus « headless » pour l'animation 2D cut-out et le montage automatique — formats d'échange et standards (état au 16/10/2026)

Contexte : MASSAMBA Workbench (app navigateur + « pont » local qui lance des processus : Blender, ffmpeg…) ; personnages peints en
calques PNG, décors peints 2.5D ; conteneur Linux, 4 cœurs CPU, pas de GPU, pas d'écran (xvfb disponible).

Méthode : veille Internet (docs officielles, dépôts, notes de version, forums), licences lues directement dans les fichiers
LICENSE/COPYING des dépôts (via raw.githubusercontent.com ; l'API GitHub était bloquée dans cette session), et **mesures
réelles dans le conteneur** pour Synfig 1.5.1, MLT/melt 7.22 et OpenTimelineIO 0.18.1 (paquets Ubuntu 24.04 + pip). Scripts de
mesure : `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/bench_synfig/` (gen.py,
mksif.py) et `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/otio/build.py`
(répertoire de session, éphémère). Les mesures Blender viennent des notes internes déjà produites le 14/10/2026.

## 1. Licences : que change le fait de lancer un programme GPL comme processus séparé ?

### Takeaway
Lancer Synfig, Blender, Kdenlive/melt, Krita, Inkscape, Natron… comme **exécutables séparés** (ligne de commande, fichiers,
tubes) ne rend pas le code de MASSAMBA GPL ; c'est l'**intégration dans le même programme** (lien statique/dynamique, `import bpy`
dans notre processus, module/greffon chargé dans notre code, code GPL copié ou compilé en WASM dans l'app livrée) qui crée une
œuvre combinée soumise à la GPL **au moment de la distribution**. Les obligations GPL ne se déclenchent qu'à la redistribution
(l'app livrée à l'utilisateur = distribution) ; aucun des outils retenus n'est AGPL.

### Cited Findings
- FAQ GPL de la FSF, entrée « Mere aggregation » : pipes, sockets et arguments de ligne de commande sont des mécanismes de
  communication « normalement utilisés entre deux programmes séparés » ; les modules sont alors normalement des programmes
  séparés, sauf si la communication est assez « intime » (échange de structures de données internes complexes) ; en revanche
  le lien (statique ou dynamique) dans un même exécutable forme un programme combiné — [FAQ GPL FSF](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)
  (**attention : la page a répondu HTTP 503 le 16/10/2026 ; formulation reprise de la FAQ telle que connue, à revérifier**).
- Licences lues dans les dépôts (16/10/2026) : Synfig = GPL-3.0 ([LICENSE](https://raw.githubusercontent.com/synfig/synfig/master/LICENSE)) ;
  MLT = LGPL-2.1 ([COPYING](https://raw.githubusercontent.com/mltframework/mlt/master/COPYING)) ; Kdenlive = GPL-3.0
  ([COPYING](https://raw.githubusercontent.com/KDE/kdenlive/master/COPYING)) ; Shotcut = GPL-3.0
  ([COPYING](https://raw.githubusercontent.com/mltframework/shotcut/master/COPYING)) ; Godot = MIT
  ([LICENSE.txt](https://raw.githubusercontent.com/godotengine/godot/master/LICENSE.txt)) ; OpenTimelineIO = Apache-2.0
  ([LICENSE.txt](https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenTimelineIO/master/LICENSE.txt)) ; OpenColorIO =
  BSD-3-Clause ([LICENSE](https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenColorIO/main/LICENSE)) ; Rhubarb Lip Sync =
  MIT, dépendances MIT/BSD ([LICENSE.md](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/LICENSE.md)) ;
  OpenToonz = BSD-3-Clause (contributions DWANGO 2016-2026) ([LICENSE.txt](https://raw.githubusercontent.com/opentoonz/opentoonz/master/LICENSE.txt)) ;
  Tahoma2D = même fichier de licence BSD-3 que OpenToonz ([LICENSE.txt](https://raw.githubusercontent.com/tahoma2d/tahoma2d/master/LICENSE.txt)) ;
  COA Tools 2 = GPL-3.0 ([LICENSE](https://raw.githubusercontent.com/Aodaruma/coa_tools2/master/LICENSE)) ; Friction = GPL-3.0
  ([LICENSE.md](https://raw.githubusercontent.com/friction2d/friction/master/LICENSE.md)) ; Pencil2D = GPL-2.0
  ([LICENSE.TXT](https://raw.githubusercontent.com/pencil2d/pencil/master/LICENSE.TXT)) ; Natron = GPL-2.0
  ([LICENSE.txt](https://raw.githubusercontent.com/NatronGitHub/Natron/master/LICENSE.txt)) ; Olive = GPL-3.0
  ([LICENSE](https://raw.githubusercontent.com/olive-editor/olive/master/LICENSE)) ; LosslessCut = GPL-2.0
  ([LICENSE](https://raw.githubusercontent.com/mifi/lossless-cut/master/LICENSE)) ; Papagayo-NG = GPL (fichier gpl.txt)
  ([gpl.txt](https://raw.githubusercontent.com/morevnaproject/papagayo-ng/master/gpl.txt)) ; libass = ISC
  ([COPYING](https://raw.githubusercontent.com/libass/libass/master/COPYING)).
- Rhubarb précise que les données de lip-sync produites appartiennent à l'utilisateur seul et que, pour un dessin animé qui
  « n'embarque pas » la fonction de lip-sync, la licence MIT n'impose même rien — [LICENSE.md Rhubarb](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/LICENSE.md).
- La documentation Tahoma2D signale que le FFmpeg fourni est la version LGPL (qualité possiblement moindre que la version GPL) —
  [Using FFmpeg with Tahoma2D](https://Tahoma2D.readthedocs.io/en/latest/using_ffmpeg_with_tahoma2D.html).

### Inferences
- Règle opérationnelle pour MASSAMBA : **le pont local lance des binaires GPL et échange des fichiers (.sif, .mlt, .blend, PNG,
  JSON)** → pas de contamination. À éviter : (a) embarquer dans l'app HTML livrée du code GPL (ex. compilation WASM de Synfig,
  bibliothèque JS GPL) ; (b) faire `import bpy` (module pip « bpy ») dans un processus Python qui contient aussi du code maison
  propriétaire distribué — le script devient alors une œuvre combinée ; le lancer comme `blender -b -P script.py` ne change pas
  le statut du script s'il est distribué (voir Gaps).
- Les fichiers de sortie (images, vidéos, .sif générés) ne sont pas couverts par la GPL de l'outil qui les produit (principe
  général ; Rhubarb l'écrit explicitement pour sa sortie).
- La consigne maison « code exécuté chez nous : MIT/Apache/BSD seulement » (`modeles-libres-moteur`) exclut de **lier** du GPL,
  mais l'usage en processus séparé déjà pratiqué pour Blender (GPL) reste cohérent ; à écrire noir sur blanc dans le registre.

### Gaps
- Position officielle de la Blender Foundation sur les scripts/add-ons Python utilisant `bpy` (souvent présentés comme devant
  être GPL s'ils sont distribués) : non revérifiée dans cette session.
- Licence exacte de Krita, Inkscape, GIMP, Glaxnimate et MyPaint non relue dans les fichiers (GPL selon connaissances antérieures).
- La bibliothèque Python « lottie » de Mattia Basaglia, embarquée dans Glaxnimate, serait sous **AGPL-3.0** selon mes
  connaissances antérieures — **non vérifié ici ; à contrôler avant tout usage** (l'AGPL a des effets en usage réseau).

## 2. Synfig : rendu CLI headless, génération de .sif, Skeleton Deformation, vitesse, état 1.4 / 1.5

### Takeaway
Synfig est **le candidat le plus « automatisable » du lot** pour du cut-out PNG : le binaire `synfig` rend un .sif/.sifz
**sans écran ni xvfb**, le format .sif est un XML lisible que l'on peut générer en Python, et nos mesures donnent
**≈ 0,16 s/image en 576×1024 sur 4 cœurs** (49 images en 8,0 s, rig rigide de 6 pièces PNG + décor). Limite : le calque
**Skeleton Deformation** (déformation maillée d'un bitmap par os) existe et se charge en CLI, mais le format XML des os
(`bone_valuenode` à GUID) n'est pas documenté ; notre essai avec une paire d'os par défaut **écrase l'image** — il faut
rétro-ingénier le format (sources disponibles) ou créer un modèle de rig une fois dans l'éditeur puis le paramétrer par script.

### Cited Findings
- Versions : dernière **stable 1.4.5 (mai 2024)** ; branche de développement **1.5.4 (18/01/2026)** puis **1.5.5 (22/03/2026)** ;
  1.5.4 ajoute notamment un mode de fusion « Alpha Intersection » et un support initial des textes SVG et des « Lottie Text
  Layers » ; 1.5.5 = surtout des corrections — [Synfig 1.5.5 Release Notes](https://synfig.readthedocs.io/en/latest/releases/development/1.5.5.html) ;
  [synfig.org, versions de développement](https://www.synfig.org/category/releases/development-releases/) ; [Synfig 1.5.4 notes](https://synfig.readthedocs.io/en/latest/_sources/releases/development/1.5.4.md.txt).
- L'outil Squelette (Skeleton Tool) est marqué « disponible depuis Synfig Studio 1.5.0 » ; le calque **Skeleton Deformation**
  applique une déformation pixel (raster) à ce qui est rendu sous lui (calques image ou contexte), via une grille dont les
  subdivisions horizontales/verticales valent 32 par défaut ; on crée une « Reset Pose » pour démarrer sans déformation —
  [Skeleton Deformation Layer](https://synfig.readthedocs.io/en/latest/layers/skeleton_deformation.html) ; [Skeleton Tool](https://synfig.readthedocs.io/en/latest/tools/skeleton.html).
- Code source (lu le 16/10/2026) : paramètres du calque = `bones` (liste de `BonePair`), `point1`, `point2`, `x_subdivisions`,
  `y_subdivisions` (32/32 par défaut) ; les os sont sérialisés comme `bone_valuenode` / `<bone type="bone_object" guid=…>` avec
  les liens `name, parent, origin, angle, scalelx, scalex, length, width, tipwidth, bone_depth` ; une paire est sérialisée
  `<first>…</first><second>…</second>` — [layer_skeletondeformation.cpp](https://raw.githubusercontent.com/synfig/synfig/master/synfig-core/src/synfig/layers/layer_skeletondeformation.cpp) ;
  [savecanvas.cpp](https://raw.githubusercontent.com/synfig/synfig/master/synfig-core/src/synfig/savecanvas.cpp) ;
  [valuenode_bone.cpp](https://raw.githubusercontent.com/synfig/synfig/master/synfig-core/src/synfig/valuenodes/valuenode_bone.cpp).
- Syntaxe CLI (man page) : `synfig [options par défaut] (fichier.sif [options spécifiques])…`, `-t` cible, `-o` sortie, `-T` nombre
  de fils, `--time` image unique, `--targets` liste des cibles — [man synfig (Ubuntu, synfig 1.5.1)](https://manpages.ubuntu.com/manpages/lunar/man1/synfig.1.html).
- **Mesure locale (16/10/2026, synfig 1.5.1 paquet Ubuntu 24.04, 4 cœurs, sans DISPLAY ni xvfb)** :
  - `synfig --help-all` confirme `-t/--target` (défaut PNG), `-w/-h`, `-a` antialias 1..30, `-T` fils, `-o`, `--fps`,
    `--begin-time/--end-time`, `--time`, `--video-codec`, `--video-bitrate`, `-x` extraction alpha, `--append` (ajouter les
    calques d'un autre fichier), `-c` rendu d'un canevas exporté ; cibles disponibles : bmp, dv, ffmpeg, gif, imagemagick, jpeg,
    libav, magick++, mng, null, openexr, png, png-spritesheet, ppm, yuv420p ; calques disponibles incluant `import`, `group`,
    `rotate`, `translate`, `stretch`, `switch`, `skeleton`, `skeleton_deformation`, `warp`, `curve_warp` (sortie de `synfig --layers`).
  - Scène générée en Python (`mksif.py`) : décor PNG 576×1024 + personnage de 6 pièces PNG (groupes avec pivot et angle animé par
    waypoints `halt`), 2 s à 24 i/s : `synfig rigid.sif -t png -o out/f.png -T 4` → **49 PNG en 8,0 s réels (≈ 0,16 s/image)** ;
    les images 0 et 12 diffèrent sur 86 007 pixels sur 589 824 (mouvement réel vérifié visuellement).
  - Même scène vers vidéo : `-t ffmpeg -o rigid.mp4` → 4,5 s, mais codec par défaut **mpeg1video** (préciser `--video-codec`).
  - Ajout d'un calque `skeleton_deformation` (grille 32×32, paire d'os par défaut) : 9,85 s (+23 %) **mais le personnage est
    écrasé en un petit fragment** → la paire d'os par défaut n'est pas une identité ; résultat inutilisable sans os valides.
  - Le format refuse `before="ease"` (erreur « Bad value in <before> ») ; `before="halt" after="halt"` (accélération/
    décélération) est accepté (vérifié). Les autres valeurs (`clamped`, `linear`, `constant`, TCB) n'ont pas été testées ici.

### Inferences
- Synfig convient très bien à un **cut-out rigide** (pièces PNG pivotant sur des articulations, waypoints avec interpolations
  douces, « switch » de bouches/mains) généré automatiquement : ~1 min de film (1 440 images) ≈ 4 min de rendu PNG sur 4 cœurs à
  576×1024 au rythme mesuré (extrapolation linéaire, à confirmer en 1080×1920).
- Pour la **déformation maillée des bitmaps**, deux voies : (1) écrire un générateur des `bone_valuenode` à partir du code
  source (savecanvas/loadcanvas) ; (2) créer **un rig modèle par personnage** dans Synfig Studio (GUI, une fois), puis le
  réutiliser en CLI avec `--append` / modification XML des angles d'os par script. La voie (2) est la plus sûre.
- Les plugins Python de Synfig (exportateur Lottie notamment) travaillent sur le .sif — ce qui confirme que le XML .sif est la
  bonne interface d'automatisation (pas d'API de script interne pendant le rendu).

### Gaps
- Exemple officiel complet de fichier .sif avec `skeleton_deformation` + os valides : non trouvé (le dépôt n'était consultable
  que fichier par fichier) ; le temps de rendu avec une vraie déformation reste à mesurer.
- Pas de 1.5.x stable ni de 1.6 annoncée au 16/10/2026 dans les sources consultées ; date de la prochaine stable inconnue.
- Mesure en 1080×1920 et avec flou de mouvement (`MotionBlur`) non faite.

## 3. OpenToonz / Tahoma2D : rendu en ligne de commande, scripts, outil Plastic, état 2026

### Takeaway
OpenToonz (BSD-3) est **vivant** (1.8.0 sortie le 19/06/2026 après ~3 ans) et possède des outils CLI (`tcomposer`, `tconverter`,
ferme de rendu) et un langage de script (ToonzScript, basé sur QtScript) capable de créer des scènes, colonnes, cellules et de
rendre ; mais **aucune API documentée ne permet de construire un rig Plastic (maillage + squelette) sans l'interface**, et la
syntaxe exacte de `tcomposer` n'est pas documentée publiquement. Pour un pipeline 100 % automatique : coût d'intégration élevé.

### Cited Findings
- OpenToonz 1.8.0 sorti le 19 juin 2026, premier grand update depuis ~3 ans ; ajoute l'import OCA (Open Cel Animation),
  améliorations XDTS (feuille d'exposition commune), « Smoother Fx Iwa », etc. ; licence BSD-3 ; l'article cite Windows et macOS —
  [Forest Watch (Impress), 23/06/2026](https://forest.watch.impress.co.jp/docs/news/2118799.html).
- Outils CLI fournis : tcleanup, tcomposer, tconverter, tfarmcontroller, tfarmserver ; depuis l'AppImage :
  `OpenToonz.appimage --appimage-exec tcomposer ARGUMENTS` ; exemple documenté pour tconverter :
  `tconverter srcName dstName [ -w width ] [ -s sceneName ] [ -range from to | -frame fr ]` ; pas de syntaxe tcomposer publiée —
  [Morevna Project, How to use OpenToonz CLI (2016)](https://morevnaproject.org/2016/11/27/use-opentoonz-cli).
- ToonzScript : basé sur QtScript (ECMAScript) ; classes `Scene` (load/save, `insertColumn`, `setCell`, `newLevel`, `loadLevel`),
  `Renderer` (`renderScene`, `renderFrame`), `Level`, `Image`, `ImageBuilder`, `Transform`, vectoriseurs, `Rasterizer` ; exécution
  documentée seulement via le menu/console de script — [ToonzScript (doc officielle)](https://opentoonz.readthedocs.io/ja/latest/toonzscript.html).
- Morevna Edition 1.3.0 permettait d'exécuter un script .toonzscript placé dans le dossier « scripts » en passant son chemin à
  l'exécutable — [Morevna, OpenToonz Morevna Edition 1.3.0](https://morevnaproject.org/2019/03/23/opentoonz-morevna-edition-1-3-0-released).
- Tahoma2D : version 1.6 (pinceaux, verrou alpha de colonne, images en boucle…), dernières versions 1.6.1/1.6.2 listées sans date ;
  sous Linux distribué seulement en AppImage — [What's New in Tahoma2D](https://tahoma2d.readthedocs.io/en/stable/whats_new.html) ;
  [newreleases.io](https://newreleases.io/project/github/tahoma2d/tahoma2d/release/v1.4) ; [Solus forum](https://discuss.getsol.us/d/11544-appimage-for-the-software-tahoma2d-not-working).
- Rhubarb exporte un format `dat` destiné à Moho et OpenToonz — [rhubarb-lip-sync README](https://github.com/DanielSWolf/rhubarb-lip-sync).

### Inferences
- ToonzScript n'expose ni le Plastic Tool, ni les pegbars/clés d'animation : un rig Plastic ne peut être produit que dans la GUI
  (ou en écrivant directement le XML .tnz, non documenté). → **impasse pour « rig généré par programme »**, utile seulement si un
  humain rigge une fois et que l'automate ne fait que remplir des cellules/temps.
- Application Qt : en conteneur, s'attendre à devoir utiliser `QT_QPA_PLATFORM=offscreen` ou `xvfb-run` pour tcomposer — non testé.
- L'import OCA de la 1.8 ouvre une passerelle depuis Krita (OCA est un format issu de l'écosystème Krita/Godot) — à vérifier.

### Gaps
- Syntaxe exacte et options de `tcomposer` (sortie, plage, fils) : non documentées dans les sources trouvées (faire `tcomposer -help`).
- Disponibilité d'une build Linux officielle 1.8.0 (l'article ne cite que Windows/macOS) : non confirmée.
- Vitesse de rendu CPU d'OpenToonz/Tahoma2D : aucune mesure trouvée ni faite (non installés).

## 4. Blender : Grease Pencil v3, COA Tools 2, plans d'images + armature, rendu de fond CPU, déterminisme

### Takeaway
Blender reste l'outil le plus complet (rig os + déformation de maillage d'images PNG, scripts `bpy`, rendu `blender -b`), mais
**sans GPU seule la voie Cycles CPU est praticable** : EEVEE (et, par déduction, Workbench et le rendu Grease Pencil, tous
OpenGL) exige un contexte OpenGL ; nos mesures internes : **Cycles CPU 4 cœurs = 2,57 s/image en 576×1024 (10 échantillons)**,
**EEVEE en OpenGL logiciel ≈ 150 s/image avec erreurs EGL → écarté**. COA Tools 2 (GPL-3) est maintenu et testé avec Blender 5.1.

### Cited Findings
- EEVEE « ne peut rendre que sur GPU (plus précisément il a besoin d'OpenGL) » ; rendu headless EEVEE impossible sous Windows/macOS
  et possible **seulement sous Linux depuis 3.4** ; Cycles rend sur CPU et GPU — [SURF, Blender course, GPU-based rendering](https://surf-visualization.github.io/blender-course/basics/rendering_lighting_materials/gpu_rendering/).
- Un commit Blender a introduit le rendu OpenGL headless sous Linux (EGL), utilisé en repli en mode `--background` ; EGL n'est
  pas utilisé sur Mac/Windows — [commit 3195a381200](https://projects.blender.org/blender/blender/commit/3195a381200) (résumé de
  recherche ; page non chargée directement) ; contournements historiques : xvfb (« fonctionne mais super lent ») ou VirtualGL —
  [devtalk Blender, « Unable to open a display » EEVEE](https://devtalk.blender.org/t/blender-2-8-unable-to-open-a-display-by-the-rendering-on-the-background-eevee/1436?page=2).
- Un article commercial (iRender, 09/10/2026) affirme qu'EEVEE Next exige Vulkan ou OpenGL 4.3+ et des contextes d'affichage
  réels, et que les instances headless « plantent ou sortent des images noires » ; source promotionnelle sans méthode — à
  traiter avec prudence — [iRender](https://irendering.net/eevee-next-headless-dilemma-cloud-render-farm-guide/).
- **Mesures internes MASSAMBA (14/10/2026, module bpy 5.0.1, 4 cœurs CPU)** : film de 1 600 images 576×1024, Cycles 10
  échantillons = **2,57 s/image**, rendu 4 106 s, 4 515 s au total avec montage ; demi-résolution 0,68 s/image ; EEVEE logiciel
  ≈ 150 s par image fixe avec erreurs EGL → écarté — notes internes
  `research_notes/Animer Blender par prompt/video_3d_etat_des_acquis.md` (l. 20 et 42) et `contournements_bac_a_sable.md` (l. 112),
  registre `.claude/skills/outils-puissants-d-abord`.
- Blender 5.0 (Grease Pencil) : flou de mouvement pour Grease Pencil, nouvel outil Plume en édition, interpolation Bézier et
  Catmull-Rom, nouveau mode « Join Strokes » — [Notes de version 5.0 Grease Pencil](https://developer.blender.org/docs/release_notes/5.0/grease_pencil/) ;
  évolutions de remplissage dans 5.1 — [Notes 5.1 Grease Pencil](https://developer.blender.org/docs/release_notes/5.1/grease_pencil/).
- Blender 5.0 publié le 18/11/2025 — [OSArch, Blender 5.0 released](https://osarch.org/2025/11/18/blender-5-0-released/).
- **COA Tools 2** : fork de ndee85/coa_tools par Aodaruma, GPL-3.0, « testé avec Blender 5.1 », but : Blender 3.4+, génération
  automatique de maillage, sans modes propriétaires ; exportateurs de sprites Photoshop/GIMP/Krita ; mainteneur seul (cherche des
  collaborateurs), 16 tickets et 2 PR ouverts — [GitHub Aodaruma/coa_tools2](https://github.com/Aodaruma/coa_tools2) ;
  l'ancien dépôt ndee85 s'était arrêté à Blender 2.9 — [Blender Artists, « COA tools dead? »](https://blenderartists.org/t/coa-tools-dead/1479623/).

### Inferences
- Rig cut-out « peinture PNG » dans Blender par script : plans d'images (import « Images as Planes ») → subdivision/maillage par
  contour alpha → armature 2D → parent « Automatic Weights » ou poids générés → animation par actions/NLA ; tout est faisable en
  `bpy` sans GUI. COA Tools 2 automatise l'import depuis les exportateurs Krita/GIMP (JSON + PNG) mais c'est un add-on GPL chargé
  dans Blender (pas dans notre code) → acceptable en processus séparé.
- Pour un rendu plat (matériaux émissifs non éclairés, pas de lumière), Cycles CPU à **1–4 échantillons sans débruitage** devrait
  être nettement plus rapide que les 2,57 s/image mesurées à 10 échantillons sur scène 3D — **hypothèse à mesurer**.
- Grease Pencil v3 n'est pas la bonne cible pour des personnages **peints** (c'est un outil de traits vectoriels) et son rendu
  passe par le moteur OpenGL → même problème headless qu'EEVEE (déduction, non testée).
- Déterminisme : rendu Cycles à graine fixe + même version → images reproductibles ; à vérifier sur deux exécutions.

### Gaps
- Confirmation officielle (notes 4.2–5.1) qu'EEVEE Next fonctionne en `-b` via EGL surfaceless + Mesa llvmpipe : non trouvée.
- Vitesse de Workbench/EEVEE sous xvfb + llvmpipe en 2026 : seule la mesure interne EEVEE (≈ 150 s/image) existe.
- Date et numéro exact de la dernière version de COA Tools 2 : non visibles sur la page (section Releases vide).

## 5. Godot 4 : Skeleton2D + Polygon2D, Movie Maker en headless/logiciel, licence

### Takeaway
Godot (MIT) offre le meilleur modèle de **cut-out déformé scriptable** (Polygon2D texturé + poids par os, Skeleton2D, entièrement
pilotable en GDScript ou en écrivant des .tscn texte) et un **Movie Maker non temps réel** (cadence parfaite, sortie PNG+WAV,
AVI MJPEG ou OGV). Mais **`--headless` utilise un rendu factice : Movie Maker ne produit rien (ou plante)** ; sous Linux il faut
un vrai rendu sur un écran virtuel (xvfb + pilote OpenGL logiciel) — vitesse CPU non mesurée.

### Cited Findings
- Doc « Creating movies » (Godot 4.7) : `godot --path projet --write-movie sortie.avi`, `--resolution`, `--fixed-fps 30`,
  `--quit-after N` ; formats : OGV (Theora/Vorbis, enregistrement **seulement dans les builds éditeur**), AVI (MJPEG + audio non
  compressé, ≤ 4 Go, sans transparence), séquence PNG + WAV (transparence possible), writers personnalisés via MovieWriter ;
  sortie à cadence parfaite sans images perdues quelle que soit la machine (« le matériel plus rapide réduit seulement le temps ») ;
  Mix Rate divisible par le FPS — [Creating movies](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html).
- `--headless` = `--display-driver headless --audio-driver Dummy`, « utile pour les serveurs et avec --script » ; `--rendering-method`
  ∈ {forward_plus, mobile, gl_compatibility} — [Command line tutorial (4.7)](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html).
- En `--headless`, Godot exécute un rendu factice : la texture du viewport n'existe pas ; l'auteur note que sous Linux le
  contournement habituel est un affichage X virtuel avec un vrai moteur de rendu (Godot 4.7.1) — [DEV Community, Godot Movie Maker sans --headless](https://dev.to/nefayran/godot-movie-maker-and-screenshots-on-macos-without-headless-26pi) ;
  un guide tiers indique que `--write-movie` plante (signal 11) sous `--headless` et conseille de vérifier
  `RenderingServer.get_video_adapter_name()` — [Summer Engine, Headless Scripting](https://docs.summerengine.com/automation/headless).
- Polygon2D : `polygon`, `uv`, `polygons`, `internal_vertex_count`, `skeleton` (NodePath vers Skeleton2D), `texture`,
  `add_bone(path: NodePath, weights: PackedFloat32Array)`, `set_bone_weights`, `get_bone_count`, `clear_bones` —
  [Polygon2D (classe)](https://docs.godotengine.org/en/stable/classes/class_polygon2d.html).
- Flux cut-out officiel : Polygon2D (UV), Skeleton2D + Bone2D, « Overwrite Rest Pose », « Sync Bones to Polygon », peinture de
  poids, points internes pour éviter les plis — [2D skeletons](https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html).
- Proposition ouverte d'ajout de sous-échantillonnage (flou de mouvement) au Movie Maker — [godot-proposals #6543](https://github.com/godotengine/godot-proposals/issues/6543).

### Inferences
- Le rig cut-out peut être **entièrement généré par programme** (script GDScript `--script` ou fichier .tscn texte : polygones
  issus du contour alpha, poids calculés par distance aux os, AnimationPlayer/AnimationTree pour les mélanges) — c'est le modèle de
  données le plus proche de notre moteur « troupe » maison.
- En conteneur : `xvfb-run -a godot --path proj --rendering-method gl_compatibility --write-movie out.png --fixed-fps 24
  --quit-after N` avec Mesa llvmpipe est la piste à tester (non vérifiée) ; vitesse CPU inconnue.
- MIT = intégrable sans contrainte, y compris en exportant un projet Godot web (moteur dans le navigateur) — cohérent avec l'app.

### Gaps
- Aucune mesure publiée de Movie Maker sous xvfb + llvmpipe (CPU seul) ; Godot non installable dans cette session (téléchargements
  github.com bloqués).
- `SkeletonModification2D`/IK 2D en Godot 4.x : statut non vérifié.

## 6. Krita, Inkscape, GIMP : traitements par lots

### Takeaway
Ces trois outils servent à **préparer les calques** (découpe, export PNG, vecteurs), pas à animer automatiquement : Krita exporte
une animation .kra en séquence d'images par CLI (`--export-sequence`, depuis 4.2) ; Inkscape exporte SVG→PNG/PDF par CLI et mode
`--actions`/`--shell` ; GIMP 3 a un mode batch (`--batch-interpreter`, `-b`, `--quit`) avec Script-Fu et Python.

### Cited Findings
- Krita : `--export-sequence` ajouté en 4.2, exporte l'animation vers le nom donné puis quitte ; l'extension du nom fixe le format
  et le préfixe (ex. `file.png`) ; message « This file has no animation. » sinon ; options prévues pour scripts shell (conversion de
  masse .kra → PNG) — [Krita, Linux Command Line](https://docs.krita.org/en/reference_manual/linux_command_line.html) ; origine : besoin
  d'intégration RenderChan — [KDE bug 364046](https://bugs.kde.org/show_bug.cgi?id=364046).
- Inkscape (man 1.x / 1.4.4) : `--export-type`, `-o/--export-filename` (type déduit de l'extension), mode `--shell` acceptant une
  suite d'actions (`file-open:…; export-type:png; export-do`), traitement de masse par `--actions="export-width:500px;export-type:png;export-do;" *.svg`
  ; « tout ce qui exige la GUI ne marche pas » — [man inkscape (openSUSE Tumbleweed 1.4.4)](https://manpages.opensuse.org/Tumbleweed/inkscape/inkscape.1.en.html) ;
  [Inkscape wiki, Using the Command Line](https://wiki.inkscape.org/wiki/Using_the_Command_Line) ; [forum Inkscape](https://inkscape.org/forums/beyond/exporting-multiple-files-input-files-in-filestxt).
- GIMP 3 : `--batch-interpreter`, `-b/--batch`, `--quit` ; procédure `python-fu-eval` (évaluation Python, « surtout pour le mode
  batch ») ; Script-Fu via `gimp-console --batch-interpreter=plug-in-script-fu-eval --batch="…"` ; un forum signale des échecs de
  type d'argument en 3.0.4 — [man gimp-3.0](https://www.mankier.com/1/gimp-3.0) ; [Script-Fu tools (developer.gimp.org)](https://developer.gimp.org/resource/script-fu/scriptfu-tools/) ;
  [python-eval.py](https://git.tsundoku.ne.jp/callisto-debian/gimp/src/commit/de1d71bb3f981cdeb7eea458aa254a5481a17408/plug-ins/python/python-eval.py).
- COA Tools 2 fournit des exportateurs de sprites pour Krita et GIMP (calques → PNG + données) — [coa_tools2](https://github.com/Aodaruma/coa_tools2).

### Inferences
- Pour MASSAMBA, Pillow/numpy (déjà en place) couvrent l'essentiel du prétraitement PNG ; Krita/GIMP n'apportent un gain que si
  l'utilisateur fournit des .kra/.xcf multicalques (export calque par calque). Inkscape est utile pour rastériser des SVG
  (sous-titres stylés, éléments graphiques) en lot.
- Krita/GIMP/Inkscape sont des applications Qt/GTK : prévoir `xvfb-run` si l'export CLI réclame un affichage (non testé ici).

### Gaps
- API Python de Krita (libkis) en mode sans fenêtre pour piloter calques/animation : non documentée dans les sources trouvées.
- Commande `python-fu-eval` complète vérifiée sur GIMP 3.x : non trouvée ; date de sortie GIMP 3.0 non revérifiée.
- Aucun des trois n'est installé dans le conteneur : pas de mesure.

## 7. Kdenlive / MLT (`melt`) : rendu de projets en headless, utilité face aux filtergraphs ffmpeg

### Takeaway
`melt` (MLT, LGPL-2.1) rend des projets .mlt **sans écran** avec le consommateur `avformat` ; **mesuré** : timeline OTIO→MLT de
96 images 576×1024 rendue en **3,2 s**. Piège : sans paramètres explicites, le profil par défaut sort en 720×576 / 25 i/s.
Kdenlive (GPL-3) lit nativement OTIO depuis 25.04. MLT apporte transitions, pistes multiples et un format de projet éditable par
l'humain ; ffmpeg reste plus simple pour des assemblages linéaires.

### Cited Findings
- `melt` : sans consommateur, le consommateur `sdl2` (fenêtre) est utilisé ; exemple de rendu fichier :
  `-consumer avformat:output.avi acodec=libmp3lame vcodec=libx264` — [MLT, melt docs](https://www.mltframework.org/docs/melt/).
- MLT = LGPL-2.1 ([COPYING](https://raw.githubusercontent.com/mltframework/mlt/master/COPYING)) ; Kdenlive = GPL-3.0 ([COPYING](https://raw.githubusercontent.com/KDE/kdenlive/master/COPYING)).
- **Mesures locales (16/10/2026, melt 7.22.0, sans DISPLAY)** :
  - séquence PNG Synfig → `melt out/f.%04d.png in=0 out=48 -consumer avformat:melt.mp4 vcodec=libx264 frame_rate_num=24
    frame_rate_den=1 width=576 height=1024` → 49 images h264 + piste aac en **1,34 s** ;
  - `.mlt` écrit par l'adaptateur OTIO `mlt_xml` (2 plans + voix) rendu sans profil → **720×576, 3,84 s de durée** (profil PAL par
    défaut, mauvais format) en 10,3 s ; avec `width=576 height=1024 frame_rate_num=24` → **576×1024, 24 i/s, 96 images, 4,01 s, en
    3,2 s** ;
  - `.kdenlive` écrit par l'adaptateur OTIO `kdenlive` puis rendu par melt → vidéo de **625 s** (durée fausse) en 4 min 35 s →
    inutilisable.
- Message affiché par le paquet `otio-kdenlive-adapter` lors de l'écriture : adaptateur « déprécié et plus maintenu » car
  « Kdenlive a un support natif d'OpenTimelineIO depuis la version 25.04 » (mesure locale, 16/10/2026 ; paquet PyPI [otio-kdenlive-adapter](https://pypi.org/project/otio-kdenlive-adapter/)).

### Inferences
- `melt` est utile comme **moteur de rendu de timeline** (multi-pistes, fondus, filtres MLT, titres) piloté par des fichiers
  .mlt générés — avantage sur ffmpeg : le même fichier peut être ouvert et retouché dans Kdenlive/Shotcut par l'humain.
- Toujours fixer le profil (`-profile` existant ou propriétés width/height/frame_rate du consommateur), sinon sortie PAL.
- ffmpeg seul (filtergraph `concat`, `overlay`, `xfade`, `subtitles`) reste le choix le plus rapide pour un assemblage linéaire
  de plans déjà rendus ; MLT devient intéressant si l'on veut un projet éditable à la main ensuite.

### Gaps
- Rendu headless d'un vrai projet .kdenlive créé par Kdenlive 25.x (et non par l'adaptateur) : non testé (Kdenlive 23.08 seulement
  disponible en apt) ; options `real_time=-N`/threads de melt non documentées dans la page consultée.

## 8. OpenTimelineIO : adaptateurs, API, représentation des plans, audio, sous-titres ; ponts vers ffmpeg/melt

### Takeaway
OTIO (Apache-2.0) est le bon **format pivot de montage** : API Python/C++, cœur 0.18.1 limité à `otio_json`/`otiod`/`otioz`,
adaptateurs en plugins (`OpenTimelineIO-Plugins` + `otio-mlt-adapter`). Mesuré : OTIO → MLT → melt fonctionne ; EDL (cmx_3600)
OK ; FCP XML a échoué sur notre timeline ; l'adaptateur Kdenlive est déprécié. **Pas de piste sous-titres native** (seulement
pistes Vidéo/Audio) : les sous-titres doivent être portés par des marqueurs/métadonnées puis exportés en SRT/WebVTT/ASS par nous.

### Cited Findings
- Adaptateurs intégrés : otio_json, otiod, otioz ; « batteries incluses » via le paquet `OpenTimelineIO-Plugins` : AAF, ale,
  burnins, cmx_3600, fcp_xml, maya_sequencer, svg, xges ; autres : kdenlive, fcpx_xml, hls_playlist —
  [OTIO, Adapters](https://opentimelineio.readthedocs.io/en/latest/tutorials/adapters.html).
- `otio-mlt-adapter` : génère du XML MLT pour `melt` ; **écriture seule** ; vérification par `otiopluginfo mlt_xml` —
  [PyPI otio-mlt-adapter](https://pypi.org/project/otio-mlt-adapter).
- **Mesures locales (16/10/2026)** : `pip install opentimelineio` → version **0.18.1**, adaptateurs disponibles = `otio_json`,
  `otiod`, `otioz` ; après `pip install OpenTimelineIO-Plugins otio-mlt-adapter otio-kdenlive-adapter` → AAF, ale, burnins,
  cmx_3600, fcp_xml, kdenlive, maya_sequencer, mlt_xml, otio_json, otiod, otioz, svg, xges ; `otio.schema.TrackKind` = {Audio,
  Video} ; schémas disponibles : Clip, Gap, Stack, Track, Transition, Marker, Effect, LinearTimeWarp, FreezeFrame,
  ExternalReference, ImageSequenceReference, GeneratorReference… ; écriture d'une timeline test (2 plans vidéo + 1 voix + 1 marqueur
  « sous-titre ») : mlt_xml OK, kdenlive OK (mais rendu melt faux, cf. §7), cmx_3600 OK, **fcp_xml en échec**
  (`AttributeError: 'NoneType' object has no attribute 'start_time'` — référence audio sans `available_range`).
- Aucun outil « otio2ffmpeg » vérifié ; l'adaptateur « burnins » d'OTIO sert à incruster du texte via FFmpeg, pas à rendre une
  timeline — [résultats de recherche, OTIO plugin docs](https://opentimelineio.readthedocs.io/en/v0.12/tutorials/otio-plugins.html).

### Inferences
- Modèle recommandé : 1 `Timeline` par film, `Stack` de pistes V1 (plans rendus : `ImageSequenceReference` sur les PNG ou
  `ExternalReference` sur les MP4), A1 voix, A2 bruitages, A3 musique ; sous-titres et repères de lip-sync en `Marker` avec
  `metadata` (texte, locuteur, style) → exporteur maison vers SRT/WebVTT/ASS. Le fichier .otio devient la « vérité » du montage,
  versionnable, et l'on peut en dériver soit un graphe ffmpeg, soit un .mlt (melt), soit une ouverture dans Kdenlive ≥ 25.04.
- Écrire notre propre « rendu OTIO → ffmpeg » (quelques centaines de lignes : concat + overlay + amix + subtitles) est plus fiable
  que les adaptateurs tiers mesurés ici.

### Gaps
- Qualité de l'import OTIO natif de Kdenlive 25.04+ (non testé, Kdenlive récent non disponible).
- Statut de maintenance des dépôts d'adaptateurs individuels (dates de dernière version) non vérifiable (API GitHub bloquée).

## 9. OpenColorIO / ACES : utile pour un pipeline sRGB simple ?

### Takeaway
Pour des PNG peints en sRGB composités en 2D (Synfig, Godot, ffmpeg), **OCIO/ACES n'est pas nécessaire** : il faut seulement
garder sRGB de bout en bout. OCIO devient important dès qu'on passe par **Blender** (rendu linéaire « scene-referred » + transformée
de vue) : Blender 5.0 a refondu sa gestion des couleurs (espace de travail par fichier, vue ACES 2.0 intégrée via OCIO).

### Cited Findings
- OpenColorIO = BSD-3-Clause — [LICENSE](https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenColorIO/main/LICENSE).
- Blender 5.0 : vue ACES 2.0 (standard et HDR) intégrée via OpenColorIO, alternative à AgX et Filmic, destinée aux petites équipes
  sans config ACES complète — [Digital Production, 02/09/2025](https://digitalproduction.com/2025/09/02/blender-5-0-ships-built-in-aces-2-0-view-transform/) ;
  espace de travail choisi par fichier .blend (ACEScg possible, Linear Rec.709 par défaut), export EXR ACES2065-1/ACEScg, nœud
  « Convert Colorspace », affichages HDR (Rec.2100-PQ/HLG, AgX HDR) — [It's FOSS, Blender 5.0](https://itsfoss.com/news/blender-5-0-release/) ;
  [Linux Adictos](https://en.linuxadictos.com/Blender-5.0-arrives-with-revamped-color-management--ACES-1--3--2--0--HDR--and-a-wide-gamut-for-video-and-images..html)
  (sources secondaires).

### Inferences
- Règle pratique : pour que les couleurs des planches peintes ressortent **identiques** dans un rendu Blender, utiliser la vue
  « Standard » (et non AgX/Filmic/ACES), textures marquées sRGB, matériaux émissifs ; sinon la transformée de vue modifie les
  teintes (à vérifier par comparaison pixel sur une planche). Dans ffmpeg, veiller à la conversion RGB→YUV en BT.709 (balises
  `colorspace/primaries/trc`) pour éviter le décalage de couleurs sur téléphone.
- OCIO n'a d'intérêt que si l'on mélange rendus 3D linéaires, EXR et étalonnage ; ce n'est pas le cas du cut-out 2D.

### Gaps
- Vue par défaut exacte de Blender 5.x (AgX supposé depuis 4.0) : non revérifiée ; notes officielles de color management 5.0 non
  chargées (sources secondaires seulement).

## 10. Autres outils notables (non listés dans la spécification) : état et utilité

### Takeaway
**Rhubarb Lip Sync (MIT, v1.14.0)** est le seul « petit outil » directement utile et sans risque (CLI, JSON, reconnaisseur
phonétique pour le français). Friction (GPL-3, 1.0 en RC) et Glaxnimate (0.6.0, 01/03/2026, Lottie) sont des éditeurs GUI sans
moteur de rendu CLI documenté ; Natron est au ralenti (2.5.0 de 2022) ; Olive reste alpha ; Papagayo-NG est remplacé par Rhubarb.

### Cited Findings
- Rhubarb : reconnaisseurs `pocketSphinx` (anglais, défaut) et `phonetic` (indépendant de la langue, moins précis) ; `-d/--dialogFile`
  pour fournir le texte ; entrées WAV/Ogg ; sorties `tsv` (défaut), `xml`, `json` (`mouthCues`), `dat` (Moho/OpenToonz) ; bouches A–F
  + G, H, X — [README rhubarb-lip-sync](https://github.com/DanielSWolf/rhubarb-lip-sync) ; support basique des langues non anglaises
  depuis 1.9 — [changelog (miroir yarn)](https://classic.yarnpkg.com/en/package/rhubarb-lip-sync) ; dernière entrée du changelog =
  **1.14.0** — [CHANGELOG.md](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/CHANGELOG.md).
- Friction : Qt + Skia, GPL-3.0-only, export SVG animé (SMIL) ; 1.0 beta 2 du 02/12/2024 (avertit : pas pour la production) ;
  dernière version confirmée = 1.0.0-rc.3 (empaquetage) — [Friction 1.0.0-beta.2](https://friction.graphics/releases/friction-100-beta2.html) ;
  [Friction 1.0.0-rc.2](https://friction.graphics/releases/friction-100-rc2.html) ; [GameFromScratch](https://gamefromscratch.com/friction-free-and-open-source-2d-animation-software/).
- Glaxnimate : 0.6.0 publiée le 01/03/2026 (KDE), Lottie parmi les formats, animation le long d'un chemin, export séquence
  d'images, support Rive ; paquet Arch 0.6.0 embarquant la bibliothèque Python `lottie` (dont exportateur dotLottie) —
  [apps.kde.org/glaxnimate](https://apps.kde.org/el/glaxnimate/) ; [Arch Linux, liste de fichiers](https://archlinux.org/packages/extra/x86_64/glaxnimate/files/).
- Natron : dernière stable 2.5.0 (26/11/2022) ; branche RB-2.6 (port Qt5) en instantanés de test ; développement lent faute de
  développeurs ; liste de priorités juillet 2026 incluant « Rendering silently stalls after N frames » (P0) et Qt 6 (P1) —
  [Wikipedia Natron](https://en.wikipedia.org/wiki/Natron_(software)) ; [pixls.us](https://discuss.pixls.us/t/will-there-be-an-alpha-release-of-natron-very-soon/53157) ;
  [Natron rb-2.6 TODO](https://natron.readthedocs.io/en/rb-2.6/maintainers/todo.html).
- Olive : refonte annoncée en mars 2025 (éditeur de nœuds réécrit en C#, moteur de rendu bâti sur Godot), objectif de version
  stable non livré ; toujours décrit comme alpha — [scribe.disroot.org, mise à jour 2025-03](https://scribe.disroot.org/post/2429686) ;
  [It's FOSS](https://itsfoss.com/olive-video-editor/).
- Licences : Pencil2D GPL-2.0, Shotcut GPL-3.0, LosslessCut GPL-2.0, Papagayo-NG GPL, Olive GPL-3.0 (cf. §1).

### Inferences
- **Rhubarb** : à intégrer tel quel (binaire appelé par le pont) avec `-r phonetic -d texte.txt -f json` pour les voix françaises,
  puis mappage A–H/X → planches de bouches ; à mesurer face à la détection actuelle (FaceLandmarker/énergie audio).
- Papagayo-NG, Pencil2D, MyPaint, Shotcut, LosslessCut : outils manuels (GUI) sans valeur pour un pipeline automatique.
- Friction/Glaxnimate : intéressants seulement comme **visionneuses/éditeurs** d'un format Lottie/SVG que nous générerions ; le
  rendu final se ferait ailleurs (lecteur Lottie → images → ffmpeg).
- Natron (NatronRenderer) : risque élevé (bloquant P0 « rendu qui cale ») → impasse pour un rendu fiable.

### Gaps
- MyPaint : non étudié (outil de peinture, hors automatisation).
- NatronRenderer CLI et vitesse : non vérifiés.
- Date de Rhubarb 1.14.0 et précision du reconnaisseur phonétique en français : non mesurées.

## 11. Formats d'échange et standards (Lottie/dotLottie, glTF + KHR_animation_pointer, OpenUSD, sous-titres)

### Takeaway
Trois standards mûrs et datés : **Lottie 1.0** (spécification JSON, LF/JDF, 17/09/2024), **glTF 2.0 + KHR_animation_pointer**
(ratifié par Khronos) et **OpenUSD Core Specification 1.0** (AOUSD, 17/12/2025). Pour notre cut-out PNG, Lottie (calques image +
transformations) et glTF (maillages 2D skinnés) sont pertinents ; USD est surdimensionné. Sous-titres : WebVTT/SRT pour le web,
**ASS rendu par libass (ISC)** dans ffmpeg pour l'incrustation stylée.

### Cited Findings
- La Lottie Animation Community (projet de la Joint Development Foundation, Linux Foundation) a publié la spécification JSON Lottie
  v1.0 le 17/09/2024, limitée aux fonctions largement implémentées — [Linux Foundation, communiqué](https://www.linuxfoundation.org/press/lottie-animation-community-announces-lottie-v1.0-specification) ;
  périmètre : schéma JSON, documentation, enregistrement IANA ; textes et effets de calque hors v1.0 (source LottieFiles,
  secondaire ; extension de fichier citée de façon contradictoire « .lot » / « .lottie ») —
  [LottieFiles blog](https://lottiefiles.com/blog/inside-lottiefiles/lottie-specification-v1-0-a-milestone-for-open-source-animation).
- Registre Khronos : **KHR_animation_pointer** figure dans « Ratified Khronos Extensions » ; statut de l'extension « Complete,
  Ratified by the Khronos Group » ; **KHR_interactivity** figure aussi dans la liste ratifiée —
  [glTF extensions README](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/README.md) ;
  [KHR_animation_pointer README](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_animation_pointer/README.md) ;
  KHR_interactivity avait été soumise à ratification (communiqué Khronos, juillet 2026) —
  [Khronos press](https://www.khronos.org/news/press/gltf-interactivity-extension-submitted-for-ratification).
- KHR_animation_pointer permet d'animer des propriétés de nœuds, matériaux, textures, caméras et lumières (support luma.gl) —
  [luma.gl, glTF native extensions](https://luma.gl/docs/api-reference/gltf/gltf-native-extensions).
- OpenUSD Core Specification 1.0 annoncée le 17/12/2025 : définition normative du modèle de données, de la composition et de la
  résolution de valeurs, formats USDA/USDC/USDZ ; géométrie/matériaux/physique encore en cours ; 1.1 prévue en 2026 —
  [Linux Foundation, AOUSD Core Spec 1.0](https://www.linuxfoundation.org/press/alliance-for-openusd-announces-core-specification-1.0-the-universal-language-for-building-3d-worlds) ;
  [80.lv](https://80.lv/articles/aousd-released-openusd-core-specification) ; [Digital Production](https://digitalproduction.com/2026/01/05/aousd-releases-openusd-core-specification-1-0/).
- OpenToonz 1.8 importe l'OCA (Open Cel Animation) et améliore XDTS — [Forest Watch](https://forest.watch.impress.co.jp/docs/news/2118799.html) ;
  Synfig 1.5.4 ajoute un support initial des « Lottie Text Layers » — [notes 1.5.4](https://synfig.readthedocs.io/en/latest/_sources/releases/development/1.5.4.md.txt).
- libass = licence ISC — [COPYING](https://raw.githubusercontent.com/libass/libass/master/COPYING).

### Inferences
- **Format pivot « rig » recommandé** : notre propre JSON de rig (os, pivots, calques PNG, poids) exportable vers (a) .sif Synfig
  (rendu CLI rapide mesuré), (b) Lottie (lecture web, aperçu instantané dans l'app, calques image + transformations seulement —
  pas de déformation maillée dans Lottie 1.0), (c) glTF 2.0 (maillages plats skinnés, lisibles par Godot/Blender/three.js ;
  KHR_animation_pointer pour animer opacité/UV des bouches).
- Sous-titres : produire **ASS** (styles, contours, position haute pour éviter les visages) et l'incruster via ffmpeg/libass ;
  produire en parallèle **WebVTT** pour les lecteurs web et **SRT** pour les plateformes.
- USD : utile seulement si le décor 2.5D passe par Blender/3D ; inutile pour le cut-out pur.

### Gaps
- Date exacte de ratification de KHR_animation_pointer : non trouvée (seul le statut « Ratified » est confirmé).
- Statut de dotLottie (conteneur zip) comme standard LAC : non vérifié.

## 12. Meilleur rapport « qualité de mouvement fluide / effort d'automatisation / vitesse CPU » et impasses

### Takeaway
Classement pour MASSAMBA (conteneur 4 cœurs, sans GPU) : **1) Synfig CLI** pour le rendu cut-out PNG généré (0,16 s/image mesuré,
sans xvfb) ; **2) ffmpeg + OTIO** pour le montage (melt en option quand un projet éditable est voulu) ; **3) Rhubarb** pour la
bouche ; **4) Blender Cycles CPU** seulement quand il faut de la 2.5D/lumière (≥ 0,7–2,6 s/image mesuré) ; **Godot** = meilleur
modèle de rig déformé mais rendu headless non prouvé (xvfb à tester). **Impasses** : EEVEE/Workbench/Grease Pencil sans GPU,
OpenToonz/Tahoma2D pour un rig Plastic généré, Natron, Olive, Papagayo-NG, adaptateur OTIO→Kdenlive.

### Cited Findings
- Synfig : 49 images 576×1024 en 8,0 s, sans DISPLAY (mesure locale §2) ; MLT/melt : 96 images 576×1024 en 3,2 s (mesure locale §7).
- Blender : Cycles CPU 2,57 s/image (pleine résolution, 10 éch.), 0,68 s/image (demi-résolution) ; EEVEE logiciel ≈ 150 s/image
  (notes internes §4).
- Godot Movie Maker : cadence parfaite non temps réel, mais rendu factice en `--headless` — [Creating movies](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html) ;
  [DEV Community](https://dev.to/nefayran/godot-movie-maker-and-screenshots-on-macos-without-headless-26pi).
- OpenToonz : pas d'API script pour Plastic, CLI peu documentée — [ToonzScript](https://opentoonz.readthedocs.io/ja/latest/toonzscript.html) ;
  [Morevna](https://morevnaproject.org/2016/11/27/use-opentoonz-cli).
- Natron : P0 « rendu qui cale silencieusement » ouvert — [Natron rb-2.6 TODO](https://natron.readthedocs.io/en/rb-2.6/maintainers/todo.html).

### Inferences
- Combinaison innovante proposée (à valider par mesure) : **un seul « rig JSON » maison → générateur .sif** (Synfig rend en CLI,
  0,16 s/image) **+ générateur Lottie** (aperçu instantané dans le navigateur, même animation) **+ timeline OTIO** (montage, voix,
  marqueurs de lip-sync Rhubarb, sous-titres ASS) **→ ffmpeg** pour l'assemblage final. Critère d'acceptation : 60 s de film
  1080×1920 rendues en < 10 min sur 4 cœurs, écart pixel aperçu Lottie/rendu Synfig < seuil défini, 0 saut d'image.
- Pour la déformation souple des membres (au-delà des pièces rigides), deux voies à comparer : rig Synfig modèle (Skeleton
  Deformation) créé une fois en GUI, ou notre moteur ARAP maison existant (déjà en place) qui produit les PNG intermédiaires
  rendus ensuite par Synfig/ffmpeg.

### Gaps
- Aucune mesure 1080×1920 ni sur un vrai personnage de la troupe (les images utilisateur doivent rester dans `workbench/.private/`).
- Godot sous xvfb + llvmpipe et Blender Cycles 1 échantillon émissif : vitesses à mesurer avant tout arbitrage final.
