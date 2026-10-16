# Complément 1 : le vrai format des TikTok du propriétaire (bandeau net sur copie floue), le budget de résolution des gros plans et la porte de rythme par mise en page

Date : 16/10/2026. Complète les notes 00 (audit, porte de rythme) et 05 (caméra, zones sûres). Les sources tierces sont
**lues pour apprendre**, jamais copiées. Les réseaux de super-résolution ont été rechargés dans des définitions
d'architecture **écrites pour le banc** (scratchpad), pas dans le dépôt.

Conventions de source :
- **[mesure]** : mesure faite dans ce conteneur (4 vCPU Xeon, 15 Go, sans GPU). Scripts dans
  `scratchpad/bench-format/scripts/` (non versionnés) : `geometrie.py` (E1), `rendu_matrice.py` (E2),
  `gp_compare.py`, `sr_compact.py`, `sr_rrdb.py`, `klein_1024.sh` (E3), `rythme_mises_en_page.py` (E4),
  `grammaire_tiktok.py` (relevé des vidéos de référence). Images dérivées des décors privés : scratchpad seulement.
- **Charge machine** : d'autres sessions tournaient en même temps (génération klein, échange de rig) ; la charge
  moyenne a varié de 3,5 à 16 pour 4 cœurs. **Tous les temps CPU de cette note sont donc pessimistes** ; la charge est
  notée à côté de chaque temps.
- **[B]** : notre code antérieur, commit `d869966`, lien GitHub suivi du chemin.
- **[kit]** : le kit privé `studio-troupe/.private/kit/` (191 décors, jamais versionné).
- Personnage d'essai : MODOU (bible : 1,76 m), image Z-Image 576×1024 de la note 06, détourage ISNet-anime, découpe en
  15 parties de la note 06 (`character_manifest.json`).

---

## Q1. Quel est le format réel des vidéos du propriétaire, et que faut-il relever sur ses 13 vidéos de référence ?

### Takeaway
Le format est écrit dans notre propre code de finition, mais **aucune mesure plan par plan n'existe**. Les plans à deux
sont un **carré net 1080×1080 posé sur les visages**, sur la même image agrandie, floutée (σ 18) et assombrie (×0,82).
Les sous-titres mot à mot vont hors des visages, et une carte emoji plein écran ponctue la chute. Les autres plans
(plan rapproché, gros plan) sont en **plein cadre**.

La seule mesure sur une vraie vidéo (041701 : bande nette lignes 514-1408) vient d'un détecteur qui, testé ici sur un
film synthétique, **tronque la bande de 46 %**. La bande de 041701 est donc peut-être plus haute que 894 px.
Les 13 fichiers (041701 et les 12 TikTok) ne sont pas dans le conteneur : il faut les **demander au propriétaire**. Le
relevé est prêt (`grammaire_tiktok.py`, validé sur un film synthétique).

### Cited Findings
- **Le format codé dans la finition** ([B finish.py l.2-5](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/finish.py)) :
  - « plans à deux personnages en BANDEAU : l'image nette au centre, le haut et le bas remplis de la même image floutée » ;
  - « sous-titres mot à mot (gras, contour noir, le mot prononcé en couleur), placés hors des visages » ;
  - « insert emoji plein écran sur la chute (comme vos vidéos) ».
- **`band()`** ([B finish.py l.74-83](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/finish.py)) :
  - carré `W×W` découpé à `y0` ;
  - fond = le carré agrandi à `H×H` (bilinéaire), recadré au centre en largeur, flou gaussien de rayon 18, luminance ×0,82 ;
  - le carré est recollé à `y0`.
- **`band_top()`** (l.52-62) place le carré « sur les VISAGES du plan », avec une marge de 0,10·W au-dessus de la tête la
  plus haute. Sans visages mesurés, le carré est centré : `y0 = (H − W)/2 = 420` en 1080×1920. Le carré ne bouge pas à
  l'intérieur d'un plan (l.309-311).
- **Sous-titres** : ligne de base à `0,865·H` (y ≈ 1661) dans les plans à deux, `0,80·H` (y = 1536) sinon. La taille
  de police est `0,08·W`, et la largeur va jusqu'à 0,92·W. Source : [B finish.py l.351-355](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/finish.py).
- **Carte emoji** : fond noir et emoji couleur à 62 % de la largeur, avec un petit rebond ([B finish.py l.26-49](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/finish.py)).
- **Cycle de plans** : le commentaire dit « Mostly medium and wide shots, like the channel's videos ». Le cycle est
  `['two', 'mcu', 'two', 'mcu', 'cu', 'two']`, soit 3 plans à deux en bandeau pour 3 plans plein cadre. Le gros plan
  est « gardé pour les réactions et un temps sur six », car il « magnifies a few dozen pixels of the painted set over
  the whole screen ». C'est une hypothèse écrite, **pas une mesure** ([B plan.py l.193-196](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/plan.py)).
- **041701** (Grok Imagine, 1080×1920, 30 i/s, 12,3 s) : « bande nette détectée lignes 514–1408 », coupure à 10,07 s ([B veille 2026-10-14 l.71](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/research_notes/veille-video-html-3d/2026-10-14.md)).
- **Détecteur utilisé** : `rowSharpness` puis `sharpBand` ([B videoDepth.ts l.351-405](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/videogen/videoDepth.ts)).
  - Seuil : `0,4 ×` le 90ᵉ centile de la netteté des lignes.
  - Il garde la plus longue suite de lignes au-dessus de ce seuil.
- **[mesure] Le détecteur tronque la bande.** Film synthétique 540×960 (`testvid/film_test.mp4`) : un plan à deux en
  bandeau (bande réelle : lignes **210-750**), deux plans plein cadre et une carte emoji.
  - `sharpBand` d'origine trouve **[250, 540]** : il perd 46 % de la bande. Le bas du carré, agrandi et doux (sol,
    jambes), passe sous le seuil.
  - Notre version v2 trouve **[228, 752]**. Elle cherche les bords par le **niveau du flou** (10ᵉ centile ×3, sur
    6 lignes consécutives, depuis le haut puis depuis le bas).
  - Les deux plans plein cadre sont bien classés « plein » ; la carte est classée « insert » (pixels sombres > 60 %).
- **[mesure] Tailles du visage de MODOU** (alpha + repères MediaPipe, note 06) :
  - haut du crâne y = 71, menton y = 268,6 : **tête de 198 px** dans l'image 576×1024 ;
  - corps de 910 px ;
  - recadrage visage de la note 06 : 219 px.
- **Ce que `qualityRef` sait du format** : profil `REFERENCE_041701` mesuré « frames 180×320, first 12 s, 25 i/s ».
  Netteté cible 8,83, fourchette 8,83-18,34 ; mouvement 1,16 (0,52-2,33) ([B qualityRef.ts l.23-30](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/qualityRef.ts)).
  Seules des statistiques sont gardées ; aucune image ni mise en page.

### Inferences
- **Le format est mixte, plan par plan.** Le bandeau sert aux plans à deux : il montre deux personnages entiers et
  lisibles dans un 9:16 sans les rendre minuscules. Le plein cadre sert aux plans rapprochés et aux gros plans. La part
  réelle de chaque mise en page dans les 13 vidéos est **inconnue** : le 3/6 de `SHOT_CYCLE` est une hypothèse.
- Le carré 1080×1080 de `finish.py` occupe **56 %** de la surface. Une bande de 894 lignes (041701) en occupe 47 %, et
  une bande 16:9 (608 lignes) 32 %. La bande de 041701 étant peut-être tronquée, son rapport réel (carré, 6:5 ou
  autre) reste à mesurer.
- **Zones sûres par mise en page** (calque TikTok de la note 05 : barre du haut y 42-131, colonne de droite x ≥ 880 à
  partir de y 803, légende à partir de y ≈ 1744) :
  - **bandeau** : visages dans le carré (y 420-1500). Les sous-titres vont dans le **flou du bas**, y ≈ 1520-1700, et
    non dans la bande y 1150-1550 de la note 05, qui recouvre le bas du carré. Les sous-titres de `finish.py` (largeur
    jusqu'à 0,92·W, soit x 43-1037) **mordent sur la colonne de boutons** : il faut les borner à x 100-860 ;
  - **plein cadre** : règles de la note 05 inchangées (visages y 250-1150, sous-titres y 1150-1550).

### Gaps
- **Fichiers à demander au propriétaire** :
  - `041701.mp4` et les 12 TikTok de référence, en fichiers d'origine (export de l'app ou téléchargement sans
    recompression si possible) ;
  - pour chaque vidéo, une confirmation des droits d'usage interne (mesure seule ; aucune image gardée, comme
    `qualityRef`).
- **À mesurer dès réception**, avec `grammaire_tiktok.py` (détecteur v2) :
  - part de durée en bandeau, en plein cadre et en insert ;
  - hauteur et position de la bande, à re-mesurer aussi sur 041701 ;
  - hauteur des visages en px (MediaPipe Face Detector, Apache-2.0, modèle `blaze_face_short_range` à télécharger) ;
  - mouvement et couverture sur toute l'image, dans la bande seule et dans le flou seul.
- La précision du détecteur v2 sur de vraies vidéos (dégradés, ciel lisse en haut de bande) n'est pas connue. Sur le
  film synthétique, le bord haut est trouvé 18 px trop bas (ciel nocturne lisse). Il faut un affinage par le saut de
  luminance moyenne à la couture (non implémenté).

---

## Q2. Combien faut-il agrandir le décor et le personnage, selon la mise en page et le cadrage ? (191 décors, calcul exact)

### Takeaway
Deux budgets distincts :
- **Le décor.** Avec une caméra « zoom » (recadrage 2D à échelle constante, l'hypothèse implicite de la note 05), un
  gros plan plein cadre demande **×19,5 en médiane (×12 à ×33)** de la plaque. Avec une caméra « dolly » (on
  s'approche, le décor plus lointain grossit moins), il ne faut plus que **×3,7 (×3,0 à ×5,5)**. Le bandeau divise
  encore ces facteurs par environ 1,8.
- **Le sprite.** Il est le vrai goulot. La tête de MODOU fait 198 px ; le gros plan plein cadre en demande 1 056, soit
  **×5,33**. Le plan américain demande ×2,78 en plein cadre et ×1,56 en bandeau. Seuls le plan d'ensemble et le plan
  pied tiennent à ×1,6 ou moins.

### Cited Findings
- **[mesure] Méthode** (`geometrie.py`) :
  - cadrages de la note 05 Q3 : PE corps à 30 % de H, PP corps à 75 %, PA de la tête à mi-cuisse à 85 %, PT de la tête
    à la taille à 80 %, PR de la tête à la poitrine à 75 %, GP tête à 55 % ;
  - lignes de MODOU : tête 71-269, poitrine 430, taille 540, mi-cuisse 659, pieds 981 ;
  - hauteur du personnage dans la plaque `h_px = 1,76·(y_f − y_h)/1,6`, avec `y_h = floor·Hp − 1,6·Hp/mH` (note 00 Q5) ;
    p10 / médiane / p90 = **146 / 249 / 405 px** ;
  - fenêtre bornée à la plaque : `s ≥ max(Ho/Hp, Wo/Wp)`.
- **[mesure] Modèle dolly.** Rapport de distance fond/personnage `r = Z_fond/Z_perso`, tiré de la profondeur relative
  calibrée sur le sol :
  - sur le plan du sol, `1/Z ∝ (y − y_h)` ;
  - on ajuste `d = a·(y − y_h) + b` sur les lignes de sol (bas de l'image, hors ciel) ;
  - chaque pixel de fond, derrière la tête et le buste, reçoit sa ligne de sol équivalente ;
  - **r : p10 / médiane / p90 = 3,05 / 5,36 / 8,13**.
  - Grossissement du fond pour un grossissement M du personnage : `m = r/(r − 1 + 1/M)`.
  - Principe optique : en dolly zoom, « the background appears to change size relative to the subject » ; à
    grossissement constant, plus la caméra est proche, plus la profondeur apparente augmente ([Wikipedia, Dolly zoom](https://en.wikipedia.org/wiki/Dolly_zoom)).
- **[mesure] Agrandissement du décor, p10 / médiane / p90 sur 191 décors** (sprite : facteur sur l'image 576×1024) :

  | Mise en page | Cadrage | Sprite | Décor, modèle zoom | Décor, modèle dolly |
  |---|---|---|---|---|
  | plein 1080×1920 | PE | ×0,63 | ×2,56 / **×3,10** / ×4,05 | identique |
  | | PP | ×1,58 | ×3,64 / **×5,78** / ×9,86 | ×2,76 / **×3,37** / ×4,75 |
  | | PA | ×2,78 | ×6,24 / **×10,1** / ×17,3 | ×2,94 / **×3,57** / ×5,16 |
  | | PT | ×3,28 | ×7,37 / **×12,0** / ×20,4 | ×2,98 / **×3,61** / ×5,25 |
  | | PR | ×4,01 | ×9,02 / **×14,7** / ×25,0 | ×3,01 / **×3,67** / ×5,38 |
  | | GP | **×5,33** | ×12,0 / **×19,5** / ×33,2 | ×3,05 / **×3,72** / ×5,48 |
  | bandeau carré 1080 | PE | ×0,36 | ×1,44 / **×1,74** / ×2,28 | identique |
  | | PP | ×0,89 | ×2,05 / **×3,25** / ×5,54 | ×1,55 / **×1,90** / ×2,67 |
  | | PA | ×1,56 | ×3,51 / **×5,70** / ×9,73 | ×1,65 / **×2,01** / ×2,90 |
  | | GP | ×3,00 | ×6,75 / **×11,0** / ×18,7 | ×1,71 / **×2,09** / ×3,08 |
  | bandeau 1080×894 (041701) | PE | ×0,29 | ×1,19 / **×1,44** / ×1,89 | identique |
  | bandeau 16:9 1080×608 | PE | ×0,20 | ×1,05 / **×1,05** / ×1,28 | identique |

- **[mesure] Cas extrêmes, GP plein cadre** :
  - `nocturne-riviera` : ×26,4 en zoom contre ×4,8 en dolly ;
  - `plage` : ×22,9 contre ×5,9 ;
  - `maison-modeste-abidjan` : ×13,4 contre ×3,1.

### Inferences
- **La fourchette « ×1,05 à ×1,65 » du bandeau** vaut pour une plaque médiane (656 px), du 16:9 au carré, et **pour le
  plan large seulement**. Sur les 191 plaques, le carré demande ×1,44-2,28 en PE. Dès qu'on resserre (PP et au-delà),
  le modèle zoom dépasse ×3 même en bandeau.
- **Le modèle dolly est la correction physique**, sans coût de rendu. Le personnage est près de la caméra, le décor 3 à
  8 fois plus loin. En s'approchant, le décor grossit beaucoup moins que le personnage. On peut ajouter le flou de
  profondeur d'un vrai gros plan. Le « zoom éclair » de la note 05 (k = 1,25-1,6, sans parallaxe) reste juste pour un
  coup de zoom à l'intérieur d'un plan. En revanche, le **gros plan coupé** doit être cadré en dolly.
- **Le sprite 576×1024 ne suffit qu'aux plans larges.** Il faut des **niveaux de détail** de personnage :
  - plein pied natif pour PE et PP ;
  - buste à ×2-4 pour PA à PR ;
  - visage à environ 1 024 px pour le GP.

### Gaps
- `r` vient d'une profondeur relative (Depth Anything V2 Small), calibrée sur un sol supposé plan, avec une hauteur
  d'œil supposée de 1,6 m. Ni l'erreur sur `r` ni la plage de validité (intérieurs, sols encombrés comme `marche`) ne
  sont mesurées. Sur `plage`, `r = 1,63` paraît trop bas (sable et barque derrière le buste).
- Le modèle ne gère pas la parallaxe *interne* du fond (couches à des profondeurs différentes). Il n'est acceptable que
  pour une **coupe**, pas pour un travelling continu (voir note 05 G2).

---

## Q3. MODOU dans 6 décors × 2 mises en page × 6 cadrages : que valent la netteté et l'écart personnage/décor en pleine résolution, et que voit `qualityRef` ?

### Takeaway
Mesurée en 1080×1920, la netteté du visage tombe de **11,6 (PE) à 0,9 (GP)**, soit 13 fois moins. Le visage du sprite
natif vaut 11,3. Pourtant, la netteté de `qualityRef` à 180×320 donne encore **8,8-10,2** au GP en dolly, ce qui est
**dans la fourchette de 041701** (8,83-18,34). **18 rendus sur 48 à visage flou passent ce seuil**, et la corrélation
entre les deux mesures n'est que de 0,46.

L'écart de netteté (`sharpGap`) est **inversé** par rapport au cinéma :
- **5,1 en plan d'ensemble plein cadre** : personnage net sur décor ×3 mou, l'effet autocollant, donc « irréel » ;
- **0,5-0,9 en gros plan** : visage aussi mou que le fond, sans détachement.

Revue visuelle : le bandeau tire bien mieux parti des plaques (wax lisibles à ×1,8-2,7). Le plein cadre serré donne des
fonds « aquarelle » en jour et un bokeh crédible la nuit.

### Cited Findings
- **Définitions reprises de notre code** :
  - netteté `qualityRef` = moyenne de `|4c − n − s − e − w|` sur le gris, image réduite à 180×320 ([B videoMetrics.ts l.1-97](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/direct/lib/studio/videoMetrics.ts)) ;
  - `sharpGap` = `log2((var Lap personnes + 1)/(var Lap décor + 1))`, sur « the full-size picture », masques érodés de
    9 px (personne) et 25 px (décor), bande des sous-titres 0,76-0,93 H exclue ([B filmbench/scene.py l.5, l.36-44](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/filmbench/scene.py)) ;
  - porte filmbench : moteur ≤ médiane des références + 0,75 ([B report.py l.50](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/filmbench/report.py)).
- **[mesure] Protocole** (`rendu_matrice.py`) :
  - décors `maquis` (intérieur de nuit), `marche` (marché, wax), `plage`, `nocturne-riviera` (rue de nuit),
    `maison-modeste-abidjan` (cour) et `marcory-2` (plaque barbouillée) ;
  - plaque Lanczos, flou de profondeur à deux niveaux en dolly (σ = 0 / 0,8 / 1,6 / 2,2 / 3,0 / 4,5 px du PE au GP) ;
  - sprite en alpha prémultiplié, Lanczos (`lanczos`) ou bilinéaire (`bilin`, l'agrandissement d'une texture WebGL) ;
  - bandeau assemblé exactement comme `finish.band()` ;
  - 288 images en 126 s.
- **[mesure] Médianes sur les 6 décors, sprite Lanczos.** `lap` = moyenne de |Laplacien| en 1080×1920 ;
  `q180` = netteté `qualityRef` (réduction INTER_AREA / bilinéaire).

  | Mise en page, modèle | Cadrage | Décor | Sprite | lap visage | lap décor | sharpGap | q180 |
  |---|---|---|---|---|---|---|---|
  | plein, zoom | PE | ×3,14 | ×0,89 | 11,6 | 1,16 | **5,06** | 16,1 / 19,5 |
  | | PA | ×8,58 | ×2,78 | 2,13 | 0,51 | 2,72 | 7,6 / 9,7 |
  | | GP | ×16,5 | ×5,33 | **0,90** | 0,45 | 0,93 | 5,7 / 6,9 |
  | plein, dolly | PP | ×3,96 | ×1,58 | 5,29 | 1,05 | 3,67 | 15,6 / 19,0 |
  | | PA | ×4,50 | ×2,78 | 2,13 | 0,83 | 1,85 | 14,2 / 17,3 |
  | | PR | ×4,70 | ×4,01 | 1,27 | 0,69 | 1,09 | 11,2 / 13,1 |
  | | GP | ×4,83 | ×5,33 | **0,91** | 0,59 | **0,67** | **8,9 / 10,2** |
  | bandeau, dolly | PE | ×1,77 | ×0,50 | 18,2 | 1,89 | 3,45 | 17,7 / 22,0 |
  | | PA | ×2,53 | ×1,56 | 5,41 | 1,10 | 2,18 | 14,2 / 16,9 |
  | | GP | ×2,71 | ×3,00 | 1,85 | 0,69 | 0,03 | 8,3 / 9,8 |

  - En bandeau, la netteté de la bande vaut 1,2-3,5 et celle du flou environ 0,5.
  - Référence de netteté native : visage du sprite à l'échelle 1:1 = **11,3** ; plaques natives = 5,3 à 18,4 (`marche`
    18,4, `maquis` 11,3, `plage` 10,0, rues de nuit et cour 5,3-6,0).
  - En bilinéaire, le visage perd encore 15-25 % : 8,8 au lieu de 11,6 en PE, 1,72 au lieu de 2,13 en PA.
- **[mesure] Revue visuelle** (planches `matrice/planche_marche.jpg`, `planche_nocturne-riviera.jpg`, recadrages 1:1) :
  - en plein cadre serré, de jour, le fond agrandi ×4,5 devient une **pâte « aquarelle »** : le wax du marché n'est plus
    qu'un aplat. De nuit, le même flou passe pour un **bokeh** naturel (lampions, néons) ;
  - en bandeau, les wax, fruits et lampions restent lisibles jusqu'au GP (×2,7) ;
  - au GP plein cadre, à 1:1, le visage Lanczos ×5,33 est **mou** : contours baveux, moustache en points flous ;
  - en `marche`, avec le sol par défaut (`floor` 1,05), MODOU **se tient sur les étals de tomates** : le sol praticable
    n'est pas modélisé ;
  - la lumière studio du sprite trahit le collage sur les décors de nuit (sujet de la note 05 G5, hors résolution).

### Inferences
- **Le reproche « irréel » a deux signatures mesurables, opposées selon le cadrage** :
  - **plan large** : personnage plus net que le décor (`sharpGap` 3,5-5) ;
  - **gros plan** : visage flou, sans détachement (`sharpGap` < 1, visage < 1).
  
  Une photo ou un film cohérent a un écart proche de 0 en plan large, et un écart positif modéré en gros plan (visage
  net, fond dans la profondeur de champ).
- **`qualityRef` ne protège pas le gros plan** : à 180×320, un pixel de mesure moyenne 6×6 pixels de sortie et efface
  exactement le flou à corriger. Il faut une mesure en pleine résolution sur la boîte du visage (G6).
- Le bandeau n'est pas qu'un choix de style : c'est la mise en page qui **respecte le mieux la résolution des
  plaques**. Le plein cadre serré n'est acceptable qu'avec le modèle dolly et un sprite haute définition.

### Gaps
- Les valeurs de `sharpGap` des références (Grok, TikTok) ne sont pas dans le conteneur (`report.json` de filmbench
  absent). La porte « ≤ référence + 0,75 » ne peut donc pas être chiffrée ici.
- Le seuil de netteté **perçu** sur téléphone après recompression TikTok n'est pas mesuré. Les seules sources trouvées
  sur le débit de TikTok sont des blogs, sans valeur officielle ni accord entre eux ([Stack Influence](https://stackinfluence.com/tiktok-video-sizes-the-ultimate-2025-guide/)).
  Il faut un test A/B sur le téléphone du propriétaire.
- Un seul personnage, sans couleur ni ombre, a été rendu : la mesure isole la résolution, pas l'intégration.

---

## Q4. Quelles voies de résolution tiennent sur ce CPU, à quel coût, avec quels artefacts et quelles licences ?

### Takeaway
- **Super-résolution animée.** Rapide, mais elle **change le style**.
  - `realesr-animevideov3` (×4, 0,6 M de paramètres) : environ 15-20 s par sprite ou par plaque. Il double la netteté
    du visage au GP (0,81 → 1,77), mais aplatit la moustache et les motifs wax en aplats.
  - `RealESRGAN_x4plus_anime_6B` : environ 1 à 2,7 min par image en PyTorch bf16 (contre 9 min dans sd.cpp). Il
    quadruple la netteté (3,09), mais **ajoute des contours noirs** (nez, yeux) : un style « cel » qui n'est pas le
    rendu 3D Pixar du reste du film.
  - Les poids n'ont pas de licence séparée (dépôt BSD-3).
- **Génération directe 1024² avec klein.** L'img2img klein en 1024² (force 0,45, soit 2 pas) **garde le style 3D-Pixar** et ajoute un vrai modelé (narines, lèvres, paupières). Il a pris **27 min sous charge** (environ 12-14 min estimées à vide), avec un pic de 9,4 Go. Mais **l'identité et l'expression dérivent** :
  - repères décalés de 3,6 % de la distance entre les yeux, soit la moitié de l'écart neutre → choc (7,6 %) ;
  - choc affaibli : `jawOpen` 0,70 → 0,52 ;
  - peau plus claire (L +6).
  
  C'est la seule voie qui apporte du détail dans le bon style, et elle doit passer par une porte d'identité.
- **Lanczos + flou de profondeur.** Gratuit et stable, mais le visage reste mou au-delà d'environ ×2. C'est la bonne
  voie pour le **décor** en dolly, pas pour le visage.

### Cited Findings
- **Licences** :
  - Real-ESRGAN : code **BSD-3-Clause** (« Copyright (c) 2021, Xintao Wang ») ([LICENSE](https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/LICENSE)).
    Les poids sont des fichiers de *release* : `RealESRGAN_x4plus_anime_6B.pth` (« Optimized for anime images; 6 RRDB
    blocks ») et `realesr-animevideov3.pth` (« Anime video model with XS size ») ([model_zoo.md](https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/docs/model_zoo.md)).
    **Aucune licence propre aux poids** n'est indiquée sur la page du dépôt ([dépôt](https://github.com/xinntao/Real-ESRGAN)),
    et les données d'entraînement de ces modèles ne sont pas documentées dans le model zoo.
  - waifu2x / nunif : code **MIT** (« Copyright (C) 2019-2023 nagadomi ») ([LICENSE](https://raw.githubusercontent.com/nagadomi/nunif/master/LICENSE)).
    Les modèles se téléchargent par `python -m waifu2x.download_models`, sans licence séparée lue dans le README
    ([waifu2x README](https://raw.githubusercontent.com/nagadomi/nunif/master/waifu2x/README.md)). Non mesuré ici.
  - APISR : « released under the GPL 3.0 license », et aussi « released for academic use only. We disclaim
    responsibility for the distribution of the model weight » ([README](https://raw.githubusercontent.com/Kiteretsu77/APISR/main/README.md)).
    **Exclu** (usage académique).
  - stable-diffusion.cpp : **MIT** (« Copyright (c) 2023 leejet », LICENSE du clone local, [dépôt](https://github.com/leejet/stable-diffusion.cpp)).
    Il charge les ESRGAN `.pth` par `--upscale-model` et garde l'alpha (« the alpha channel is resized with bilinear
    interpolation and recombined ») ([docs/esrgan.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/esrgan.md)).
  - FLUX.2 [klein] 4B : Apache-2.0, et Z-Image-Turbo : Apache-2.0 (vérifiés en note 06 Q1 :
    [fiche klein](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [fiche Z-Image](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)).
- **Principe « ADetailer » de sd.cpp** : détecteur YOLOv8, puis « a cropped inpaint pass for every detected object »
  (recadrer, regénérer à `inpaint_width`, recoller, `denoising_strength` environ 0,4) ([docs/adetailer.md](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/adetailer.md)).
  Nous avons déjà la boîte du visage (MediaPipe), donc pas besoin du détecteur YOLO.
- **[mesure] Temps et mémoire** (charge moyenne entre parenthèses) :

  | Voie | Entrée → sortie | Temps | Pic RAM |
  |---|---|---|---|
  | animev3 (PyTorch fp32, 4 threads) | sprite 576×1024 → 2304×4096 | **20,4 s** (3,6) | 0,60 Go |
  | animev3 (4 threads) | visage 512² → 2048² | 6,3 s | 0,42 Go |
  | animev3 (2 threads) | 6 plaques 1024×494-752 → ×4 | **12,1-18,2 s** chacune (≈ 9) | 0,57-0,76 Go |
  | anime 6B, sd.cpp `-M upscale` (poids convertis en f16, tuiles 128, 4 threads) | visage 512² → 2048² | **543,6 s** (5-9) | — |
  | anime 6B, PyTorch fp32 (4 threads, tuiles 192) | visage 512² | 182,6 s (6-12) | 1,03 Go |
  | anime 6B, PyTorch **bf16** (4 threads) | visage 512² | **104,6 s** (6-12) | 0,84 Go |
  | anime 6B, PyTorch bf16 (2 threads) | sprite choc 576×1024 / plaque `marche` / plaque `maquis` / sprite RGBA | **57 / 66 / 88 / 162 s** (9-17) | 0,88 Go |
  | Lanczos (PIL) | toute image | < 0,1 s | — |
  | klein img2img 1024² (force 0,45, soit 2 pas sur 4) | visage choc → 1024² | **27,1 min** (charge 6-12) : 2 pas × 678 s et décodage VAE de 145 s. Estimation à vide : environ 12-14 min (0,08 s par jeton et par pas, note 06) | **9,36 Go** |
  | klein édition 1024², référence 512² (5 120 jetons, 4 pas) | visage choc → 1024² | **interrompu après 2 pas sur 4** pour libérer le CPU partagé : pas de 656 s puis 1 064 s (charge 6-9), encodage de la référence 53 s. Total estimé : environ 60-75 min sous charge, environ 30 min à vide | ≈ 6,7 Go (RSS au 2ᵉ pas) |

  - Équivalence : la sortie PyTorch reproduit sd.cpp (écart absolu moyen de 0,25 niveau en fp32, 0,51 en bf16, sur
    0-255).
- **[mesure] Fidélité** : on réduit la sortie ×4 à la taille d'entrée, puis on la compare à la source.

  | Image | animev3 | anime 6B | Lanczos aller-retour |
  |---|---|---|---|
  | sprite MODOU (choc) | 34,3 dB, couleur +4,1 niveaux | 36,2 dB, +2,3 | 52,4 dB |
  | plaque `marche` | 28,9 dB | 28,1 dB | 43,3 dB |
  | plaque `maquis` | 31,8 dB | 30,3 dB | — |

- **[mesure] Gros plan du visage choqué** (médianes sur 6 décors, plein cadre, dolly). Le sprite SR ×4 est ensuite
  réduit ×1,33.

  | Voie du sprite | lap visage | sharpGap | q180 |
  |---|---|---|---|
  | bilinéaire ×5,33 (texture WebGL) | 0,79 | 0,65 | 7,8 |
  | Lanczos ×5,33 | 0,81 | 0,46 | 8,8 |
  | animev3 ×4, puis ×1,33 | **1,77** | 2,48 | 9,4 |
  | anime 6B ×4, puis ×1,33 | **3,09** | 5,28 | 10,3 |
  | klein 1024² | 1,43 | 1,38 | 10,1 |

- **[mesure] Revue visuelle à 1:1** (`gp/planche_crops_marche.jpg`, `gp/planche_wax_marche.jpg`) :
  - **Lanczos** : contours baveux ; moustache en points flous ; wax lisible mais mou, artefacts JPEG agrandis en taches.
  - **animev3** : contours propres, mais moustache et barbe **lissées en aplats noirs** ; peau sans grain ; les petits
    points du wax fusionnent en taches. On passe au style « dessin animé 2D ».
  - **anime 6B** : le plus net, mais il **invente un trait noir** autour du nez et des yeux et dessine la moustache en
    mèches. Sur le wax : contraste et netteté accrus, petits motifs postérisés, et des bords durs inventés sur les
    artefacts JPEG.
  - **klein img2img 1024²** (`gp_klein/planche_crops_nuit.jpg`) : même style 3D-Pixar, sans trait noir ajouté. Le modelé est plus riche (narines, lèvres, orbites, poils fins de la moustache) ; la peau est plus claire et plus brillante. Le nez devient plus « réaliste » et la bouche moins ronde : l'expression « choc » s'affaiblit.
- **Stabilité de l'identité** :
  - la SR est **déterministe**. Appliquée une fois à l'asset (sprite, plaque), elle ne scintille pas d'une image à
    l'autre ;
  - la forme est conservée (yeux, nez, bouche aux mêmes places) ; c'est le **style** qui dérive (trait, aplats) ;
  - pour klein, voir le tableau suivant.

**[mesure] Dérive d'identité et d'expression** (`identite_visage.py`) par rapport au visage choc 512². Elle est mesurée
sur les 478 repères MediaPipe alignés par Procrustes, en % de la distance entre les yeux.

| Voie | Écart des repères | `jawOpen` (réf. 0,70) | `eyeWideLeft` (réf. 0,38) | ΔL peau | Netteté du visage à 1024 |
|---|---|---|---|---|---|
| Lanczos | 0 | 0,70 | 0,38 | 0 | 1,30 |
| animev3 | 1,2 % | 0,68 | 0,27 | +2,3 | 2,63 |
| anime 6B | 1,7 % | 0,65 | 0,22 | +1,1 | 3,52 |
| **klein img2img** | **3,6 %** (contour 4,9 %, bouche 2,7 %) | **0,52** | **0,11** | **+6,0** | 1,75 |

- Pour échelle, l'écart neutre ↔ choc vaut 7,6 %.
- Le Laplacien récompense les bords durs, pas le modelé : il ne mesure pas à lui seul la qualité.

### Inferences
- **Les SR « anime » ne conviennent pas au personnage 3D-Pixar.** Elles projettent un a priori de dessin à trait sur un
  rendu à modelé doux. Dans un même film, le gros plan aurait un trait noir que le plan large n'a pas : c'est un faux
  raccord de style. Sur les **plaques peintes**, en revanche, elles sont acceptables : le décor est déjà pictural et il
  sera adouci par la profondeur de champ. animev3 suffit (15 s par plaque).
- **Le coût de la RRDB dépend surtout du moteur.** sd.cpp convertit les poids en f16 (journal : « Upscaler weight type:
  f16 ») et tourne 3 à 5 fois plus lentement que PyTorch bf16. PyTorch passe probablement par oneDNN, avec AVX-512 et
  AMX sur ce Xeon, mais ce n'est pas vérifié. Pour une SR hors ligne, PyTorch bf16 est la voie.
- **La voie klein est la seule qui ajoute du détail dans le bon style.** Mais c'est une régénération : à force 0,45, elle déplace l'identité de la moitié d'une expression. Il faut donc :
  1. une force plus basse (0,25-0,35, à mesurer) ;
  2. la référence du personnage en plus de l'image de départ (édition multi-références, note 06) ;
  3. une **porte d'identité** : écart des repères ≤ 2 % de la distance entre les yeux, blendshapes de l'expression demandée à ±0,1, ΔL de la peau ≤ 3, sinon nouvelle graine.
  
  Le coût est payé une fois par expression de chute et par personnage (2 à 3 visages).

### Gaps
- Les poids Real-ESRGAN n'ont pas de licence écrite à part, et leurs données d'entraînement ne sont pas documentées.
  Le risque pour un usage commercial des *sorties* est jugé faible mais **non levé** ; à consigner dans
  `THIRD_PARTY_NOTICES.md`.
- waifu2x (MIT) et les modèles d'OpenModelDB n'ont pas été mesurés ; les licences de ces derniers varient selon le
  modèle (non vérifié ici).
- Les temps ont été mesurés sous une charge de 3,5 à 17 sur 4 cœurs. Les temps à vide ne sont pas mesurés.
- Pas de mesure objective d'identité adaptée au cartoon (même lacune que la note 06 Q5). Les repères MediaPipe et les
  blendshapes ne sont qu'un indice.
- L'**édition klein 1024² à partir de la référence** (sans image de départ) n'a pas abouti : elle a été arrêtée après
  2 pas sur 4. On ne sait donc pas si elle dérive moins que l'img2img. Il faut la relancer de nuit, avec aussi
  l'img2img à force 0,3.

---

## Q5. La porte de rythme mesurée sur le bon format : quels seuils de mouvement et de couverture pour chaque mise en page ?

### Takeaway
À jeu identique, le plein cadre donne **×1,75 à ×2,35 de mouvement** et **×1,3 à ×1,75 de couverture** par rapport au
bandeau. L'hypothèse « environ deux fois plus » est donc juste pour le mouvement, mais trop forte pour la couverture,
qui sature.

Surprise : **la copie floue bouge autant que la bande**. Couverture 0,143 dans le flou contre 0,160 dans la bande ; sur
un personnage seul, le flou (0,187) dépasse même la bande (0,138). Le flou (σ 18 px en 1920) est petit devant une zone
de la grille (135×240 px), et la copie agrandie ×1,78 montre les têtes et les bras du haut du carré.

Un gros plan plein cadre ordinaire sort à **0,39 de couverture** : il échoue à l'actuel plafond de 0,29 alors que son
jeu est le même. La porte doit être **par plan et par mise en page**.

### Cited Findings
- **Définitions de la porte** (gris 96×170, 12 i/s, grille 8×8 ; une zone compte si |Δ| moyen > 0,012 ; mouvement =
  |Δ| moyen hors coupes). Références de la chaîne : mouvement 0,0098-0,027, couverture 0,15-0,29, « 12 TikTok de la
  chaîne » ([B clipInspect.ts l.33-130](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/server/jev/studio/clipInspect.ts) ; [B measure.ts](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/measure.ts) ; [B tiktok_reference.json](https://github.com/ndoyepapamassamba-commits/Add-a-README-file/blob/d869966/workbench/scripts/blenderfilm/tiktok_reference.json)).
- **[mesure] Protocole** (`rythme_mises_en_page.py`, algorithme de `measureFrames` réécrit en Python à l'identique) :
  - MODOU découpé (15 parties) en cinématique directe ;
  - **locuteur** : avant-bras à −28° × enveloppe, geste à 1,1 Hz, hochements de tête de 4,5° à 1,8 Hz, balancement du
    torse de 1,5° ;
  - **auditeur** : respiration et micro-regards ;
  - 4 s à 12 i/s ; décor fixe, caméra posée ;
  - jeu normal (gain 1) et jeu fort (gain 2) ; médiane sur `maquis`, `marche` et `maison-modeste-abidjan`.

  | Mise en page | Mouvement g1 | Couverture g1 | Mouvement g2 | Couverture g2 | Couverture bande / flou (g1) |
  |---|---|---|---|---|---|
  | bandeau, deux personnages, PA | 0,0064 | **0,151** | 0,0102 | 0,267 | 0,160 / 0,143 |
  | bandeau, un personnage, PA | 0,0064 | 0,162 | 0,0100 | 0,269 | 0,138 / **0,187** |
  | bandeau, deux personnages, PP | 0,0018 | 0,035 | 0,0032 | 0,080 | 0,053 / 0,018 |
  | bandeau, GP | 0,0094 | 0,221 | 0,0159 | 0,284 | 0,260 / 0,184 |
  | plein, deux personnages côte à côte, PP | 0,0014 | 0,034 | 0,0025 | 0,060 | — |
  | plein, deux personnages étagés, PA | 0,0123 | **0,251** | 0,0179 | 0,360 | — |
  | plein, un personnage, PA | 0,0120 | 0,250 | 0,0179 | 0,344 | — |
  | plein, un personnage, PT | 0,0129 | 0,242 | 0,0203 | 0,348 | — |
  | plein, GP | 0,0220 | **0,387** | 0,0332 | 0,450 | — |

- **[mesure] Rapports plein / bandeau à jeu égal** :
  - PA : mouvement ×1,88 (g1) et ×1,75 (g2) ; couverture ×1,65 et ×1,29 ;
  - étagé contre bandeau à deux : mouvement ×1,92 et ×1,75 ; couverture ×1,66 et ×1,35 ;
  - GP : mouvement ×2,34 et ×2,09 ; couverture ×1,75 et ×1,58.
- **[mesure] Film synthétique** (`grammaire_tiktok.py`, jeu ×1,5) : plan en bandeau 0,223 de couverture (0,224 dans la
  bande, 0,222 dans le flou) ; plein PA 0,325 ; plein GP 0,429.
- **Antécédent** : le film 9 a échoué à 0,53 de couverture pour un plafond de 0,435 = 1,5 × 0,29 (note 00 Q2). Il
  était en plein cadre, avec des plans à deux en bandeau.

### Inferences
- **Pourquoi le flou ne « tue » pas la couverture.** La porte travaille en 96×170 : un pixel de mesure vaut environ
  11×11 pixels de sortie, et une zone de grille environ 135×240. Le flou σ 18 n'efface donc que des détails plus fins
  que la grille. La copie ×1,78 **agrandit** même les mouvements des têtes, placées en haut du carré par `band_top`.
- **Ce que mesurent les références.** 0,15-0,29 est une moyenne de films **mixtes** (bandeau et plein, part inconnue
  p). Si p ≈ 1 (presque tout en bandeau), la fourchette plein cadre équivalente est d'environ **0,25-0,38** pour la
  couverture et **0,018-0,047** pour le mouvement. Si p ≈ 0,5, la fourchette bandeau descend à environ 0,12-0,23 (voir
  G7).
- **Conséquence pour le moteur** : avec la porte actuelle, il serait poussé à sous-jouer les gros plans plein cadre, ou
  à surjouer les plans à deux larges (0,03-0,08 de couverture en PP, très loin de 0,15).

### Gaps
- La part p de bandeau dans les références et la couverture par mise en page des références restent à mesurer
  (Q1, fichiers du propriétaire).
- Un seul jeu synthétique (FK simple, sans bouche ni clignements) a été mesuré. Avec la bouche et les yeux animés, la
  couverture du GP monterait encore.
- Le décor vivant (note 05 G4) n'est pas inclus : on suppose sa couverture inférieure à 0,05.

---

## Ce que nous greffons dans notre moteur

Tout est réimplémenté chez nous, à partir de notre code antérieur (`finish.py`, `videoDepth.ts`, `clipInspect.ts`) et
des principes publics cités. Aucun code tiers n'est copié. Seule dépendance nouvelle possible : des **poids** de
super-résolution (Real-ESRGAN, BSD-3, sans licence propre aux poids : à consigner), utilisés **hors ligne**,
uniquement sur les plaques.

### G1. `Layout` : la mise en page devient une dimension de la grammaire du `CameraDirector`
Chaque plan porte `layout ∈ {bandeau, plein, insert}` en plus de son cadrage :

```
LayoutBand { aspect: 1.0 (défaut, finish.py) | 1.208 (à re-mesurer sur 041701) | 1.778,
             y0: band_top(visages, headroom=0.10·W, margin=0.04·W),   // fixé pour tout le plan
             blur: { sigma: 18 px @1920, gain: 0.82, scale: 1920/1080 } }
render(plan bandeau) :
  carré = renderScene(1080 × round(1080/aspect))            // seul le carré est rendu en pleine définition
  fond  = flou_gaussien(redim(carré, 1/4) → 270×480, σ = 18/4) ; ×0,82 ; redim ×4 (bilinéaire)
  sortie = fond ; coller(carré, y0)
```

- **Amélioration sur `finish.py`** : le flou est calculé au quart de la résolution. Un flou σ 18 atténue de plus
  de 99 % les fréquences au-dessus de 1/36 de cycle par pixel, donc le résultat est visuellement identique, pour environ 16 fois moins de
  pixels. Seul le carré est rendu : environ −44 % de pixels par image par rapport au plein cadre (183 ms par image en
  1080×1920, note 05 G7).
- **Règle de choix** (provisoire, en attendant Q1) :
  - **bandeau** pour tout plan à deux ou plus dont les personnages entiers ne tiendraient pas à 30 % de H ou plus en
    plein cadre ;
  - **plein** pour le locuteur seul (PA à GP) et pour la réaction de la chute ;
  - **insert** pour la carte emoji.
  
  `stagger2` (note 05) reste l'option plein cadre à deux personnages ; mesuré en E4, il donne le même rythme que le PA
  seul.
- **Zones sûres par mise en page**, dans `safe_zones.json` :
  - bandeau : visages dans le carré ; sous-titres dans le flou du bas, y ∈ [y0 + h_bande + 20, 1700] et x ∈ [100, 860] ;
  - plein : note 05 (visages y ∈ [250, 1150], sous-titres y ∈ [1150, 1550]) ;
  - partout : x ≤ 860 si y ≥ 803 (colonne de boutons).

### G2. `ResolutionBudget` : contrôle avant rendu, par plan
Pour chaque plan, on calcule :

```
s_sprite = frac·Ho / (ligne_basse − haut_crâne) / k_LOD     // k_LOD = facteur de l'asset choisi (1, 2, 4…)
s_decor  = cadrage_dolly(...)                                // G3
exiger   : s_sprite ≤ 1,5 (visage du GP de la chute : ≤ 1,25) ;  s_decor ≤ 4 en plein, ≤ 2,5 en bandeau
sinon    : 1) prendre le niveau de détail suivant de l'asset (G4) ;
           2) sinon élargir le cadrage d'un cran ;
           3) sinon passer en bandeau ;
           tout en journal (aucun échec silencieux)
```

- Les seuils viennent de la revue visuelle E2-E3 : un visage à ×2,78 est déjà mou à 1:1, et ×1,58 passe. Ils sont
  **provisoires** jusqu'au test A/B sur téléphone (Q3, lacune).
- **Amélioration** : le plan antérieur réservait le gros plan à « un temps sur six » pour cacher le problème
  (`plan.py`). Ici, la résolution devient une **contrainte vérifiée**, qui choisit l'asset au lieu d'interdire le
  plan.

### G3. `DollyCut` : le grossissement du décor dans un plan coupé, par la profondeur calibrée sur le sol
Calcul hors ligne, une fois par décor (dans `SetPrep`, note 05 G1) :

```
lignes de sol : y ∈ [max(y_h + 0,15·(Hp − y_h), 0,6·Hp), Hp], hors ciel (masque G), colonnes centrales
ajuster       : d(y) = a·(y − y_h) + b            (1/Z ∝ y − y_h sur le plan du sol, d = disparité relative)
pour un pixel p de fond : y_eq(p) = (d(p) − b)/a  ;  r(p) = (y_pieds − y_h)/y_eq(p)  (ciel ou y_eq ≤ 1 : r = 50)
r_plan = médiane de r(p) derrière la tête et le buste, gardée dans floor.json
```

Au rendu d'un plan coupé de grossissement M (par rapport au plan large de référence) :

```
m_decor = r/(r − 1 + 1/M)        // dolly ; m_decor → r/(r−1) quand M → ∞
s_decor = s_PE · m_decor ;  ancrage : le point de plaque derrière la tête reste derrière la tête
flou de profondeur : 2 niveaux mélangés (note 05 G5), w = clamp((d_focus − d)/0,25, 0, 1),
                     σ_max = 0 / 0,8 / 1,6 / 2,2 / 3,0 / 4,5 px (PE → GP, base 1080 de large)
```

- **Mesuré** : GP plein cadre à ×3,7 en médiane, au lieu de ×19,5 en zoom. La netteté `qualityRef` du plan monte de
  5,7 à 8,9 et le fond garde sa forme.
- **Amélioration sur la note 05** : `punchIn` (zoom 2D) reste réservé au **coup de zoom à l'intérieur** d'un plan
  (k ≤ 1,6). Tout plan **coupé** plus serré passe par `DollyCut`. On garde la caméra posée et l'absence de parallaxe
  pendant le plan.

### G4. Niveaux de détail des personnages (`CharacterLOD`) : jamais de SR par image
Pour chaque personnage (`AssetRegistry`, avec hash et origine) :

| Niveau | Contenu | Production (CPU) | Sert à |
|---|---|---|---|
| L0 | plein pied 576×1024 (note 06) | Z-Image ou klein, 15-30 min | PE et PP, tous plans à deux en bandeau |
| L1 | buste, tête à environ 400 px | recadrage du L0, puis img2img klein du buste (environ 768×1024, force environ 0,3, à mesurer) ; à défaut, Lanczos ×2 (visage 1,8-2,1 mesuré en PA) | PA à PR plein cadre, GP en bandeau |
| L2 | visage 1024² (tête à environ 880 px) pour chaque expression de chute (choc, rire) | img2img klein 1024², force 0,3-0,45, puis porte d'identité (27 min mesurées sous charge, environ 12-14 à vide) | GP plein cadre de la chute |

- Recollage : la chaîne de la note 06 Q5 (recadrer, éditer, recaler par ECC, recoller avec correction Lab), appliquée
  à la boîte du visage en ×4.
- C'est le principe ADetailer de sd.cpp (recadrer, regénérer, recoller), **sans détecteur YOLOv8** : la boîte vient de
  MediaPipe (Apache-2.0).
- **Garde de style** : pas de SR « anime » sur un personnage au rendu 3D. On mesure la **part de traits sombres fins**
  du visage : chapeau haut-de-forme noir (« black-hat ») de 15 px, part des pixels > 40, comparée au même visage en
  Lanczos à la même taille. Un asset est refusé si cette part dépasse **2 fois** la référence Lanczos.
  - [mesure] À ×4 : Lanczos 0,22 %, animev3 0,48 % (×2,2), anime 6B **1,49 % (×6,8)**.
  - La luminance moyenne sur les bords de Canny, elle, ne voit rien (115,5 → 116,8 pour le 6B).
  - Le seuil ×2 reste à régler sur les planches du propriétaire.
- **Plaques** : animev3 ×4 hors ligne (12-18 s par plaque), stockée en privé (`<id>.plate4x.jpg`) et utilisée seulement
  quand `s_decor > 2,5`. Lanczos sinon.
- **Contrat** : la SR et la génération s'appliquent aux **assets**, une fois, jamais aux images du film. Le scrub reste
  bit à bit identique (note 05 G8) et rien ne scintille.

### G5. Compositeur PixiJS : textures à la bonne taille
- WebGL agrandit les textures en bilinéaire : −15 à −25 % de netteté du visage contre Lanczos (E2).
- Pour chaque plan, le `RenderAdapter` charge **le niveau de détail dont l'échelle effective est entre 0,5 et 1,25**,
  pré-réduit hors ligne par Lanczos (mipmaps maison). On ne laisse jamais le GPU agrandir de plus de 1,25.
- Le carré du bandeau est un `RenderTexture` de 1080², et la copie floue un second `RenderTexture` de 270×480.

### G6. `AnimationQualityGate` : netteté en pleine résolution, par cadrage
On ajoute, sur le rendu complet en 1080×1920 :

```
lap_visage = moyenne |4c − n − s − e − w| sur la boîte du visage (érodée), en pleine résolution
ratio      = lap_visage / lap_natif(asset)   // lap du même visage dans l'asset utilisé, à l'échelle 1
plancher   : ratio ≥ 0,4 partout ; ≥ 0,6 pour le GP de la chute        (provisoire)
sharpGap   (filmbench) par cadrage : PE/PP ∈ [−0,5 ; 2,0]   (pas d'autocollant)
                                     GP    ∈ [1,0 ; 5,0]    (visage détaché du fond flou)
q180       (qualityRef) : gardé comme indicateur de style, JAMAIS comme preuve de netteté
budget     : s_sprite effectif et s_decor de G2, à chaque image, dans le rapport QA
```

- **Pourquoi un plancher relatif.** Le Laplacien d'un visage dépend du style de l'asset. Le visage klein 1024², au
  modelé lisse, vaut 1,75 à l'échelle 1 ; le sprite 576×1024 vaut 11,3. Un seuil absolu condamnerait la bonne voie
  (klein) et favoriserait la mauvaise (6B, traits durs).
- **Ratios mesurés** : Lanczos ×0,89 → 1,03 ; ×1,58 → 0,47 ; ×2,78 → 0,19 ; ×5,33 → 0,08 ; visage klein L2 au GP
  (×1,14) → environ 0,8 (boîtes de mesure un peu différentes).
- **Mesuré** : sur 48 rendus à visage mou (`lap_visage` < 2, tous à ×2,78 ou plus), 18 passaient le seuil
  `qualityRef`. Avec le plancher relatif, aucun ne passe.

### G7. Porte de rythme par plan et par mise en page
Mesure par plan, avec l'algorithme de `clipInspect` inchangé (comparabilité avec les références), puis conversion en
**équivalent bandeau** :

```
eq_cov(plan)    = cov / k_c[layout, cadrage]      k_c : bandeau 1 ; plein PE–PP 1,0 ; plein PA–PT 1,6 ; plein GP 1,7
eq_motion(plan) = motion / k_m[layout, cadrage]   k_m : bandeau 1 ; plein PE–PP 0,8 ; plein PA–PT 1,9 ; plein GP 2,2
film : moyennes pondérées par la durée de eq_cov et eq_motion, comparées à [0,15 ; 0,29] et [0,0098 ; 0,027]
rapport : couverture dans la bande et dans le flou, séparément, pour chaque plan en bandeau
```

- Les k sont les rapports mesurés en E4 au jeu normal (PE–PP : deux personnages côte à côte, plein 0,034 / 0,0014
  contre bandeau 0,035 / 0,0018). Ils sont **provisoires**.
- Dès que les 13 vidéos sont mesurées (Q1), on remplace la conversion par des fourchettes propres à chaque mise en page
  (médiane et extrêmes des plans en bandeau, des plans plein cadre et des gros plans des références) :

  ```
  ref_L = { cov: [min, max], motion: [min, max] }  pour L ∈ {bandeau, plein, GP plein}
  porte(plan) : mesure ∈ ref_L(layout) ; porte(film) : Σ durée·mesure / Σ durée ∈ Σ p_L·ref_L
  ```

- **Prédiction** (note 00 G3) : `cov_pred` se calcule sur la mise en page réelle, avec le carré et sa copie floue
  (la copie compte : 47 % de la couverture d'un plan à deux mesuré en E4).
- **Amélioration** : le plafond unique de 0,29 (×1,5 « monde vivant ») est remplacé par une porte qui ne punit ni les
  gros plans plein cadre ni n'encourage à surjouer les plans larges.

### G8. Relevé des références : outil prêt, fichiers à demander
`grammaire_tiktok.py` (notre code, à porter dans `studio-troupe/` après revue), sur chaque vidéo :
- coupes de `clipInspect` ;
- pour chaque plan : type (bandeau / plein / insert), lignes de la bande (détecteur v2 par niveau du flou), hauteur des
  visages (MediaPipe Face Detector), mouvement et couverture sur toute l'image, dans la bande et dans le flou ;
- sortie JSON de statistiques seulement (aucune image gardée).

**Demande au propriétaire** :
- `041701` et les 12 TikTok de référence (fichiers d'origine) ;
- les planches des 7 personnages, qui donneront les niveaux de détail L1 et L2 et les seuils de la garde de style ;
- un avis sur 3 rendus A/B vus **sur son téléphone** (GP Lanczos, GP SR, GP klein), pour fixer les planchers de G6.

### Ce que nous NE prenons pas
- APISR (GPL-3.0 et « academic use only »).
- Les SR « anime » sur les personnages au rendu 3D (faux raccord de style mesuré).
- La SR appliquée aux images du film (scintillement, non-déterminisme du scrub).
- Le détecteur YOLOv8 d'ADetailer (Ultralytics, et inutile ici : nous avons la boîte MediaPipe).
- Le zoom 2D pour les plans coupés serrés (×12 à ×33 du décor mesurés).
- La netteté à 180×320 comme critère de netteté.
