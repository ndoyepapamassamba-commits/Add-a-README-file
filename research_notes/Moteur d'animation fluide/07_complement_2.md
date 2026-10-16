# Complément 2 — Une planche frontale unique : zones cachées, autres vues, ombrage cuit, échange de dessins sans saut (banc du 16/10/2026)

Conventions (les mêmes que la note 06) :
- **[mesure]** : mesure faite dans ce conteneur le 16/10/2026 (4 vCPU Xeon 2,10 GHz avec AVX-512 et AMX, 15 Go de RAM,
  sans GPU). Le processeur était **partagé** avec d'autres bancs : les temps de `sd-cli` sont donc des majorants.
- `S` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`. Banc : `S/bench-vues/`.
  - Scripts (écrits pour ce banc, **aucun code tiers copié**) : `scripts/complet.py` (complétion procédurale),
    `trou_verite.py` (trou artificiel avec vérité terrain), `faire_rig.py` (rig source du moteur depuis les repères),
    `poses_extremes.ts` (19 actions sur le **rig réel du moteur**), `rasteriser.py` (rendu et contrôles),
    `decoupe_completee.py` et `cutout_lib.py` (cut-out à calques complétés), `tourner.py` (formes clés de lacet),
    `verifier_vue.py` (rejet automatique des vues), `echange.py` (règle d'échange), `ombrage.py` et `banc_ombrage.py`
    (ré-ombrage), `lumiere_decor.py`, `file_sd.sh` (file d'attente `sd-cli`, un seul calcul lourd à la fois).
  - Sorties (images, JSON, journaux), **hors dépôt** : `S/bench-vues/out/`, `S/bench-vues/logs/`.
- Personnages :
  - **MODOU** : planche Z-Image de la note 06 (`bench-perso/out/zimg_modou_576x1024_s42.png`), son alpha ISNet, ses
    133 repères RTMW et sa découpe en 15 parties.
  - **BAYE NDIAYE**, gabarit différent : grand-père **rond en boubou** bleu roi brodé d'or, chapelet. Généré pour ce
    banc avec FLUX.2 [klein] 4B en 384×672. La graine est déterministe (`FNV-1a("BAYE NDIAYE") mod 2³¹ = 582739080`,
    règle G1 de la note 06). Prompt = bloc pose de la note 06 + `visuel` verbatim de la bible + `details.face`.
    **[mesure]** 691 s (11,5 min), pic de 5,51 Go.
  - Planche « accuse » : édition klein k2 de la note 06, qui a perdu un bras. Elle sert de « second dessin » pour
    la règle d'échange.
- Les numéros de questions suivent les 5 travaux demandés.

---

## Q1. Compléter les zones cachées de chaque calque sur CPU : remplissage procédural ou inpainting masqué de sd.cpp ? Coût et qualité du raccord

### Takeaway
<<Q1_TAKEAWAY>>

### Cited Findings
**Ce que fait l'inpainting de sd.cpp (code lu, commit `8cd731e7`)**
- Le masque est lu en [0 ; 1], arrondi, puis ramené à la taille du latent. Il sert de `denoise_mask`, avec la
  convention **blanc = zone à repeindre** : l'image masquée vaut `(1 − masque)·(init − 0,5) + 0,5`
  (`src/pipeline/image.cpp`, lignes 194–415 —
  [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp/blob/master/src/pipeline/image.cpp)).
  - Conséquence mesurée sur le principe : la grille du latent est de **8 px**. Le bord du trou est donc quantifié par
    blocs de 8 px.
  - Il faut **recomposer** le résultat dans l'image d'origine avec un fondu, car le VAE ré-encode aussi les pixels hors du
    trou.
- Licences : stable-diffusion.cpp MIT, Z-Image-Turbo et FLUX.2 [klein] 4B Apache-2.0. Révisions et sommes SHA-256
  dans la note 06 (Q1, G8).

**[mesure] Protocole « vérité terrain »**

Un trou ne peut pas être noté là où l'image n'a jamais rien montré. On a donc creusé un **trou artificiel sur une zone
visible du calque** : sa forme est celle d'un avant-bras posé en travers du torse (capsule) plus deux bandes de flanc,
comme sous des bras croisés. On compare ensuite le remplissage à l'image vraie (`trou_verite.py`).

- Mesures sur l'**intérieur du calque** (à plus de 4 px de la silhouette) :
  - `ΔE76` moyen dans le trou ;
  - erreur de basse fréquence (flou σ = 3) ;
  - **grain relatif** = écart-type des hautes fréquences du remplissage ÷ celui de la vérité (1 = même grain) ;
  - **couture relative** = gradient moyen sur l'anneau de 2 px autour du bord du trou ÷ le même dans la vérité. Au-dessus
    de 1, le bord du trou se voit.
- Trous :
  - MODOU : t-shirt vert délavé et taché, **6 527 px** ;
  - BAYE : boubou satiné avec plastron brodé et chapelet, **6 032 px**.

| Méthode (CPU) | Temps | MODOU ΔE / BF / grain / couture | BAYE ΔE / BF / grain / couture |
|---|---|---|---|
| Diffusion seule (Laplace sur la basse fréquence, notre code) | 0,47 s / 0,20 s | 3,57 / 5,49 / **0,22** / 0,54 | 17,2 / 17,8 / 0,11 / 0,77 |
| **Diffusion + motif** (pavage de patchs, fondu à variance conservée) | 0,56 s / 0,78 s | **4,25 / 6,19 / 0,82 / 0,98** | 16,2 / 16,4 / 0,36 / 0,91 |
| OpenCV Telea (référence, sans restriction au calque) | 0,03 s | 6,93 / 11,95 / 1,42 / 1,02 | 16,3 / 14,0 / 0,45 / 0,98 |
<<Q1_SD_LIGNES>>

- Effet du **fondu à variance conservée** sur MODOU. Avec un fondu moyen (½·a + ½·b), le grain tombait à **0,47** et la
  couture à 0,71. Avec `(a + b)/√2` sur des résidus de moyenne nulle, on obtient **0,82** et **0,98**. Le ΔE monte de
  3,76 à 4,25, ce qui est attendu : il y a plus de texture, donc plus d'écart pixel à pixel.
- **À l'œil** (`out/cmp_gt_modou_proc.jpg`, `out/cmp_gt_baye_proc.jpg`) :
  - Sur le t-shirt, la diffusion seule laisse une **tache lisse**. Diffusion + motif redonne l'usure du tissu, et le
    raccord est invisible à la taille du plein pied. Telea fait des **traînées** et tire du gris du fond dans les bandes
    de flanc.
  - Sur le boubou, **aucune méthode procédurale ne reconstruit le plastron brodé ni les perles du chapelet** : on obtient
    une bavure bleu-or. Le fond satiné, lui, est correct.
<<Q1_SD_OEIL>>

**[mesure] Complétion réelle des calques (sans vérité terrain), utilisée en Q2**
- Tous les calques d'un personnage sont complétés en procédural (diffusion + motif) :
  - MODOU : **5,8 s** pour **28 004 px** inventés ;
  - BAYE : **5,9 s** pour **42 748 px** inventés.
- Zones complétées :
  - le prolongement de chaque calque du dessous sous le disque de l'articulation (épaules, coudes, poignets, hanches,
    genoux, chevilles, cou) ;
  - le **flanc du torse sous la manche** : 331 + 360 px pour MODOU, 244 + 278 px pour BAYE ;
  - le bassin sous l'ourlet : 11 214 px pour MODOU, 22 391 px pour BAYE (le bas du boubou).

### Inferences
<<Q1_INFERENCES>>

### Gaps
- Une seule graine par modèle pour l'inpainting, et un seul trou par personnage. Le taux de réussite de l'inpainting
  n'est donc pas connu.
- Z-Image n'a pas été essayé en 512² : il a été mesuré en 384² seulement.
- Les métriques « grain » et « couture » sont les nôtres. Aucun seuil perceptif publié n'a été trouvé pour les calibrer.
- La complétion procédurale ne sait pas **prolonger un motif structuré** (broderie, rayures, carreaux du tablier, wax).
  Une synthèse guidée par la structure, du type PatchMatch avec carte de structure, n'a pas été essayée.

---

## Q2. Poses extrêmes des 19 actions : rendu et contrôles automatiques (trous d'alpha, triangles retournés, aire minimale)

### Takeaway
On a rendu les 19 actions de la spec §6, à leur pose extrême (gain g = 1,4), sur **trois variantes** et deux gabarits.
1. **Le maillage réel du moteur** (`construireRig` → `deformer`, skinning CoR) :
   - Seules 3 poses de face sur 11 restent propres pour MODOU (4 sur 11 pour BAYE).
   - Ailleurs, les triangles se retournent aux **coudes repliés** (bras croisés, surprise, rire) et l'**aisselle s'étire**
     (haussement, pointage, gêne, poser) : c'est le « carton » qui étire la manche.
2. **Le cut-out brut** (calques découpés, sans pixel caché) : **20 poses sur 21 ont des trous aux articulations**.
   - MODOU : 61 px en moyenne, jusqu'à 174 px ;
   - BAYE : 89 px en moyenne, jusqu'à 250 px.
3. **Le cut-out à calques complétés** (« calques de dessous » + bouts arrondis), qui est notre méthode :
   - **plus aucun trou** pour BAYE, et au plus 12 px pour MODOU (8 poses touchées) ;
   - l'image au repos reste **exacte** : écart moyen de 0,05 niveau ;
   - c'est la variante la plus propre pour croiser les bras, mettre les poings sur les hanches ou pointer.

**8 actions sur 19 sont fausses de face** quelle que soit la variante, car leur geste se fait en profondeur : marche,
arrêt, demi-tour, rire plié, recul, flexion, s'asseoir, se lever. L'aire de la silhouette tombe à 0,76–0,84 : le
personnage est simplement écrasé. Elles exigent une **autre vue ou un dessin** (Q3).

### Cited Findings
- La spec §6 exige un cut-out « tête, torse, bassin, bras segmentés, avant-bras, mains, cuisses, jambes et pieds ;
  pivots anatomiques ; couches d'occlusion et **masques sans trous** », ainsi que le catalogue « idle, marche/arrêt/
  rotation, regard, haussement d'épaules, pointage, mains ouvertes, bras croisés, surprise, colère, gêne, rire, recul,
  flexion, assis/debout, prise/dépôt d'objet ». Le §8 demande de « tester poses extrêmes, occlusions »
  (`spec/spec.txt`, §6 et §8).
- **Moteur testé tel quel** :
  - API : `rig/index.ts` → `deformer(rig, pose)` ; `rig/construire.ts` → maillage Delaunay adaptatif, poids « parties +
    bandes », centres CoR, groupes de dessin (`jambes 1 < corps 2 < tête 3 < bras 4`, `squelette.ts` →
    `ordreMembres`) ;
  - limites standard d'avant-bras G : `[−0,25 ; 2,7] rad` (`squelette.ts`, `LIMITES_GAUCHE`).
- **[mesure] Rig du moteur construit depuis la planche** : `faire_rig.py` écrit un `rig-source@1` à partir des repères
  RTMW et de la carte de parties d'AutoDécoupe.
  - Pour BAYE, cuisses et jambes situées au-dessus de l'**ourlet** sont rattachées au bassin. L'ourlet est détecté par
    une chute de 25 % de la largeur de la silhouette, à y = 573. C'est la règle « vêtement long = une seule partie bas
    du corps » de la note 06.
  - Taille et temps :

    | | Sommets | Triangles | Construction | `deformer` par pose (après le premier appel) |
    |---|---|---|---|---|
    | MODOU | 2 484 | 4 041 | 0,93–1,07 s | **0,17–0,3 ms** |
    | BAYE | 6 063 | 11 216 | 1,44 s | **0,17–0,3 ms** |

  - Couverture du masque par le maillage : 0,996 (MODOU), 1,0 (BAYE).
- **[mesure] Contrôles automatiques** (`rasteriser.py`) :
  - triangle **retourné** : aire signée posée ÷ aire au repos < 0 ;
  - triangle **écrasé** : rapport < 0,2 ; **étiré** : rapport > 4 ;
  - **trou d'alpha** : composante transparente fermée, classée « déchirure » si elle fait moins de 0,3 % de la
    silhouette, « boucle » sinon (une boucle est légitime, par exemple un bras sur la hanche) ;
  - **aire minimale** : aire de la silhouette posée ÷ aire au repos ;
  - **fuite** : pixels couverts par un triangle intérieur mais de texture transparente (étirement à travers un vide).
- **[mesure] Maillage du moteur**, triangles retournés aux poses extrêmes, avec les os en cause (MODOU) :

  | Action | Retournés (os) | Écrasés / étirés | Aire |
  |---|---|---|---|
  | respiration, regard, mains ouvertes | 0 | 0–3 / 0–10 | 1,00–1,05 |
  | haussement | 32 (cou 12, bras G 8, tête 7) | 9 / 25 | 1,09 |
  | pointage | 19 (bras D 15) | 4 / 26 | 1,00 |
  | bras croisés | 38 (bras G 18, bras D 9, avant-bras 10) | 18 / 3 | 0,92 |
  | surprise | 65 (bras G 27, bras D 24) | 9 / 4 | 0,90 |
  | poings sur les hanches | 15 | 11 / 16 | 1,03 |
  | gêne (main à la nuque) | 59 (bras D 42, torse 10) | 7 / 31 | 0,98 |
  | rire | 27 | 11 / 1 | 0,93 |
  | assis (en profondeur) | 42 | 97 / 0 | **0,76** |
  | se lever (en profondeur) | 6 | 13 / 0 | **0,77** |

  Pour BAYE, plus finement maillé, les retournés sont plus nombreux aux coudes repliés : bras croisés 69, surprise 123,
  poings sur les hanches 138, gêne 268. Pour s'asseoir, on compte 436 retournés dans les jambes raccourcies sous le
  boubou.
- **À l'œil** (`out/poses/mz_planche.jpg`, `by_planche.jpg`, zoom `zoom_mz_bras.jpg`) :
  - **aisselle étirée** en peau brune entre le bras levé et le torse (pointage, haussement), alors que la manche reste
    collée au t-shirt ;
  - **déchirure** à l'épaule de la main à la nuque, avec un triangle de fond visible ;
  - **liseré blanc** autour des avant-bras croisés devant le torse (bord d'alpha ISNet non décontaminé) ;
  - mains orientées « doigts en l'air » quand l'avant-bras se replie, car la main suit l'avant-bras sans contre-rotation.
- **[mesure] Cut-out à calques complétés** (`decoupe_completee.py`, FK du moteur). Méthode, la nôtre :
  1. Chaque calque **visible** garde exactement ses pixels.
  2. À chaque articulation, le calque du dessus prend en plus le **disque de l'articulation** (pixels de l'image). Ce bout
     arrondi est **invariant par rotation autour du pivot**.
  3. Tout ce qui est **inventé** va dans un « **calque de dessous** » du même os, dessiné **au fond** : le prolongement du
     calque du dessous sous le disque, et le flanc du torse sous la manche. Il ne couvre jamais rien et ne se voit que là
     où un vide s'ouvre.

  « Trou d'articulation » = pixels transparents dans le disque de rayon 0,7·r centré sur l'articulation posée, moins la
  valeur au repos :

  | | Cut-out brut : poses touchées / moyenne / max | Cut-out complété : poses touchées / max |
  |---|---|---|
  | MODOU | 20 sur 21 / 61 px / 174 px (surprise) | 8 sur 21 / **12 px** |
  | BAYE | 20 sur 21 / 89 px / 250 px (gêne) | **0** / 0 px |

  - Repos : écart moyen de 0,054 niveau entre le rendu complété et l'image. Seuls 1 875 px de bord semi-transparent
    dépassent 8 niveaux, parce qu'ils sont composés deux fois.
  - À l'œil (`out/poses/mz_cutout_planche.jpg`, `by_cutout_planche.jpg`) : le haussement et les poings sur les hanches
    n'ont plus d'aisselle déchirée. Les manches larges du boubou tournent proprement.
  - Défauts restants :
    - un **disque de manche visible** à l'épaule quand le bras dépasse environ 120° (« l'ancien voisin » tourne avec le
      disque) ;
    - au repos, l'ordre « bras devant le torse » montre la manche par-dessus le t-shirt. C'est exact au repos, mais il
      faut l'ordre animé de la note 02 G9 pour passer le bras derrière.
- **À l'œil, actions « en profondeur »** : s'asseoir, se lever et la flexion ne font qu'**écraser** la silhouette (aire
  0,76–0,84). Le demi-tour et le regard ne sont qu'une **inclinaison** dans le plan, pas un lacet. La marche de face
  devient un pas de côté.

### Inferences
- **Le cut-out complété est la bonne base pour les bras qui croisent le corps** : moins de déchirures, un repos exact,
  et un coût de préparation de 6 s par personnage, une fois. Le maillage unique du moteur reste meilleur pour les
  **flexions douces** (respiration, regard, torse), où il ne montre aucune couture.
- La règle à greffer est donc **hybride** : maillage pondéré **à l'intérieur** de chaque groupe, et **groupes séparés**
  (bras, avant-bras, jambes) avec bouts arrondis et calques de dessous.

  C'est exactement le « découpage automatique en sous-maillages dès qu'un groupe peut croiser le corps » prévu par la
  note 02 G1. Le banc montre qu'il faut **séparer aussi l'avant-bras du bras**, puisque les coudes repliés retournent
  10 à 28 triangles.
- Les limites d'avant-bras du moteur (`[−14° ; 155°]`, flexion vers le milieu du corps) rendent impossibles, de face,
  « mains levées de chaque côté de la tête » et « paumes vers le ciel ». En dessin de face, la flexion du coude se voit
  dans les deux sens selon la rotation de l'épaule. La limite devrait dépendre de l'angle du bras, ou être symétrique
  ±155°.
- **Tri des 19 actions** pour le metteur en scène :

  | Faisable de face | Faisable de face si les calques sont complétés | Exige une autre vue ou un dessin |
  |---|---|---|
  | idle, regard (inclinaison), mains ouvertes, prendre/poser (bras tendu), colère (torse) | bras croisés, pointage latéral, poings sur les hanches, gêne (main à la nuque), surprise, rire, haussement | marche, arrêt, demi-tour, rire plié, recul, flexion, assis, debout, pointage **vers la caméra** (raccourci) |

### Gaps
- Les poses extrêmes ont été écrites à la main dans le repère du moteur (degrés, g = 1,4), et non par les recettes
  d'`anim/` : ce module est encore une ébauche (`README.md` du moteur).
- Les seuils des contrôles (5 retournés, 0,3 %, aire 0,8) sont initiaux. Ils restent à calibrer sur des rendus jugés
  acceptables par l'utilisateur.
- L'ordre de dessin animé (bras derrière puis devant) n'a pas été testé avec la complétion.

---

## Q3. Générer des vues cohérentes (3/4 gauche et droite, profil, dos) : klein multi-références, Z-Image avec image de départ, formes clés ; rejet automatique et taux de réussite par graine

### Takeaway
<<Q3_TAKEAWAY>>

### Cited Findings
**Licences des générateurs multi-vues (API Hugging Face, lues le 16/10/2026)**

| Modèle | Licence des poids | Usage commercial des vidéos (France) |
|---|---|---|
| CharacterGen | apache-2.0 ([API](https://huggingface.co/api/models/zjpshadow/CharacterGen)) | possible, base et données à auditer |
| MV-Adapter | apache-2.0 ([API](https://huggingface.co/api/models/huanngzh/mv-adapter)) | adaptateur sur SDXL |
| Zero123++ v1.1 | openrail ([API](https://huggingface.co/api/models/sudo-ai/zero123plus-v1.1)) | restrictions d'usage |
| Zero123++ v1.2 | aucune balise de licence ([API](https://huggingface.co/api/models/sudo-ai/zero123plus-v1.2)) | non vérifiable |
| SV3D | `sv3d-nc-community` ([API](https://huggingface.co/api/models/stabilityai/sv3d)) | **non commercial, exclu** |
| Stable Fast 3D | `stabilityai-ai-community` ([API](https://huggingface.co/api/models/stabilityai/stable-fast-3d)) | soumis à condition, à éviter |
| TripoSR | mit ([API](https://huggingface.co/api/models/stabilityai/TripoSR)) | oui |
| TRELLIS image large | mit ([API](https://huggingface.co/api/models/microsoft/TRELLIS-image-large)) | oui |
| Hunyuan3D-2 et 2mv | `tencent-hunyuan-community` ([API](https://huggingface.co/api/models/tencent/Hunyuan3D-2)) | **exclu en France** (voir ci-dessous) |
| pix2gestalt (complétion amodale) | cc-by-nc-4.0 ([API](https://huggingface.co/api/models/cvlab/pix2gestalt-weights)) | **non commercial, exclu** |
| Qwen-Image-Layered (calques) | apache-2.0 ([API](https://huggingface.co/api/models/Qwen/Qwen-Image-Layered)) | oui, mais modèle de la taille de Qwen-Image |

- Précisions :
  - CharacterGen génère des vues canoniques en A-pose par diffusion multi-vues
    ([arXiv 2402.17214](https://arxiv.org/abs/2402.17214)).
  - MV-Adapter rend SDXL multi-vues à 768 px ([arXiv 2412.03632](https://arxiv.org/abs/2412.03632)).
  - Hunyuan3D : la licence « DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM AND SOUTH KOREA ». Le territoire est
    défini comme « the worldwide territory, excluding the territory of the European Union, United Kingdom and South
    Korea » ([LICENSE](https://huggingface.co/tencent/Hunyuan3D-2/resolve/main/LICENSE)).
- Tous ces modèles sont des modèles GPU (SDXL et plus). Aucun n'a été lancé ici, faute de GPU et parce que la mission
  interdit Kaggle.

**[mesure] klein multi-références et Z-Image avec image de départ** (`file_sd.sh`, 4 pas pour klein, 8 pour Z-Image,
288×512, référence = planche de face de MODOU réduite à 288×512)
<<Q3_GEN>>

**Formes clés analytiques (sans générateur)**
- Live2D standardise le lacet de la tête `ParamAngleX` sur **−30 … +30**, élargissable à ±45 si la tête doit tourner
  davantage ([Live2D, Standard Parameter List](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/)).
  Les vues au-delà sont donc des **dessins** ou des formes clés dessinées à la main.
- Les rigs cut-out de Toon Boom Harmony vendus avec « retournement 360° » (« full 360 turnaround », « 8 pose
  turnaround ») reposent sur des **substitutions de dessins** par vue, pilotées par des contrôleurs, et non sur la
  déformation d'une seule vue ([exemple de rig](https://bruks2d.gumroad.com/l/HellraiserRig),
  [rig Sonnie](https://drawnsean.gumroad.com/l/sonnie)).
  - La documentation Harmony décrit la **substitution de dessin** comme l'outil des bouches, mains et paupières
    ([Toon Boom, Library](https://docs.toonboom.com/help/harmony-16/essentials/library/about-library.html)).
  - Un fil du forum Toon Boom demande de lier ces substitutions à un contrôle, « comme les Smart Bones », sans réponse
    affirmative ([forum Toon Boom](https://forums.toonboom.com/t/script-to-attach-substitute-drawings-to-controls-in-rig/11236)).
- **[mesure] `tourner.py`** (notre méthode). Une primitive par calque : tête = profil elliptique par ligne (k = 0,85),
  torse et bassin = cylindre elliptique (k = 0,55), membres = cylindres (k = 1).
  - On inverse ligne par ligne `x' = x_c + (x − x_c)·cos φ + z(x)·sin φ` ; les ancres se déplacent ; les calques
    latéraux passent derrière si `z' < 0`.
  - Coût : **5,9 s pour 5 angles** en Python (576×1024).
  - À l'œil (`out/tour/mz_planche.jpg`, `by_planche.jpg`) :
    - ±25° : la tête se lit comme **écrasée de côté**, et non comme tournée. Les **oreilles**, comptées dans la largeur
      de la tête, viennent s'étaler sur la joue.
    - ±45° : visage déformé, corps « de face aminci », silhouette inchangée (épaules, profil du nez, pieds).
  - Le contrôle d'orientation (ci-dessous) **accepte** pourtant ces images : lacet +0,19 à +25°, −0,40 à −45°. L'indice
    de lacet seul ne distingue pas une vraie vue de 3/4 d'une vue de face comprimée.
- **[mesure] Rejet automatique `verifier_vue.py`**, calibré sur des images connues :
  - **Contrôles** : un seul morceau (≥ 0,97 de l'alpha dans la plus grande composante) ; plein pied ; écart de palette
    (k-moyennes Lab, 6 couleurs, ΔE moyen apparié ≤ 14) ; proportions (hauteur des épaules ±0,06) ; **lacet**
    `(x_nez − x_mi-oreilles) / |oreille G − oreille D|` (3/4 si 0,12 ≤ |lacet| ≤ 0,6, du bon signe) ; profil si l'écart des
    yeux est inférieur à 0,3 de la tête ; dos si le score du visage est inférieur à 0,6 de celui de la face ; membres
    présents (score SimCC des poignets et chevilles ≥ 2,5).
  - Planche de face : ACCEPTÉE (lacet 0,01, palette ΔE 0,7).
  - Planche « accuse » de la note 06 : **REJETÉE, « bras manquant »** (score du poignet G 2,42). C'est exactement le
    défaut vu à l'œil.
  - Coût : environ 10 s par vue (ISNet + RTMW).

### Inferences
<<Q3_INFERENCES>>

### Gaps
<<Q3_GAPS>>

---

## Q4. Règle d'échange de vue ou de dessin sans saut : à quel instant, sur combien d'images, à pose égale ?

### Takeaway
**La règle proposée tient, avec trois précisions mesurées.**
1. **Pose assortie.** L'échange se fait **par partie** (ici le bras), et le rig doit d'abord amener le dessin A aux
   **angles et aux longueurs apparentes** du dessin B, c'est-à-dire à son raccourci. Sans cette mise en pose, on
   reproduit le saut du film 8 : J = **120** pendant la tenue.
2. **Instant.** Le meilleur moment est l'**image juste après le pic de vitesse de la frappe**, et non pendant
   l'anticipation : la pose est alors à moins de 10 % de la cible, et l'image suivante bouge encore. Avec un flou de
   8 sous-instants, J = **1,48**, contre :
   - 2,31 au pic exact ;
   - 3,7 à 4,3 pendant l'anticipation ;
   - 12,7 à 13 une image trop tard, quand le mouvement s'arrête à l'image suivante ;
   - 29 pendant la tenue, même avec la pose assortie.
3. **Une coupe franche sur une image** avec le flou de bougé exact. Le **fondu enchaîné de 2 images n'apporte rien**
   (J = 2,29 contre 2,15) et ajoute un fantôme.

### Cited Findings
- **Le « raccord dans le mouvement »** (*cut on action*, *match on action*) du montage repose sur la même idée : on coupe
  au milieu d'un mouvement pour que l'œil suive le mouvement plutôt que la coupe
  ([How To Film School](https://howtofilmschool.com/dictionary/match-on-action/),
  [Videomaker](https://www.videomaker.com/article/c10/13536-cutting-on-action/)).
  - Le point de coupe doit accorder **vitesse, direction et timing** : « Even small mismatches can feel awkward »
    ([How To Film School](https://howtofilmschool.com/dictionary/match-on-action/)).
  - Ce sont des guides de montage, pas une étude perceptive.
- Les rigs cut-out professionnels changent de **dessin par partie** (mains, yeux, bouches, vues) au moyen de
  substitutions ([Toon Boom, Library](https://docs.toonboom.com/help/harmony-16/essentials/library/about-library.html)).
- **[mesure] Banc `echange.py`**, conditions :
  - Le dessin B (bras et main « accuse » de k2) remplace **une seule partie** (le bras D) sur le rig cut-out complété de
    MODOU. On ne remplace jamais le corps entier, puisque le k2 entier a perdu un bras.
  - Squelette cible tiré des repères de B : rotation absolue du bras −86,5°, de l'avant-bras −108,2°. **Longueurs
    apparentes** 0,35 et 0,75 : B pointe vers la caméra, donc en raccourci.
  - Courbe d'action : repos → anticipation (−0,12) → frappe (vers 1,08) → retour à 1 → tenue. 30 i/s, 36 images.
  - Vitesse du poignet : pic de **143 px/image à l'image 13** (115 à l'image 12, 109 à l'image 14, 43 à l'image 15).
  - Mesure **J** = énergie de changement d'une image à l'autre **avec** échange ÷ **sans** échange (même mouvement, dessin
    A seul). On prend le maximum sur l'image de l'échange et la suivante. J = 1 : l'échange ne se voit pas au-delà du
    mouvement.
  - Mesure **R** = écart moyen entre les deux rendus au moment de l'échange.

| Variante (instant de l'échange) | Image | Fondu | Flou | **J max** | Excès d'énergie | R (écart des dessins) |
|---|---|---|---|---|---|---|
| V0 « film 8 » : pose **non** assortie, échange pendant la tenue | 24 | 0 | 1 | **119,8** | 5,99 | 5,99 |
| V1 pose assortie, échange pendant la tenue | 24 | 0 | 1 | 29,5 | 1,47 | 1,47 |
| V2 assortie, au pic de vitesse | 13 | 0 | 1 | 3,05 | 3,35 | 2,39 |
| V3 assortie, au pic, flou | 13 | 0 | 3 | **2,15** | 1,84 | 0,79 |
| V4 assortie, au pic, fondu sur 2 images, flou | 13 | 2 | 3 | 2,29 | 2,06 | 1,29 |
| V5 fin de frappe, fondu sur 1 image, flou | 15 | 1 | 3 | 9,59 | 0,51 | 1,29 |
| V6 fin de frappe (l'image suivante est immobile), coupe, flou | 15 | 0 | 3 | 14,8 | 0,82 | 0,44 |

**[mesure] Balayage de l'instant** (coupe franche, flou à 8 sous-instants, J pris sur l'image de l'échange **et** la
suivante, `out/echange/balayage2_flou8.json`) :

| Image d'échange | 10 | 11 | 12 | **13 (pic)** | **14** | 15 | 16 | 17–20 |
|---|---|---|---|---|---|---|---|---|
| s(t) (0 = A, 1 = B) | −0,12 | −0,08 | 0,19 | 0,58 | **0,93** | 1,08 | 1,08 | 1,07–1,02 |
| v(f) ; v(f+1) (px/image) | 12 ; 17 | 17 ; 115 | 115 ; 143 | 143 ; 109 | **109 ; 43** | 43 ; 1 | 1 ; 3 | 3–4 |
| **J max** | 4,25 | 3,74 | 3,11 | 2,31 | **1,48** | 12,96 | 12,74 | 2,8–3,5 |
| R | 6,39 | 3,65 | 2,26 | 1,56 | 1,31 | 1,32 | 1,34 | 1,36–1,45 |

Coût : environ 0,3 s par image (cut-out complété, 576×1024) et par sous-instant, en Python. Vidéo de contrôle encodée
par FFmpeg (V0 | V3 | V4 côte à côte, H.264, 1934×506, 30 i/s, 36 images), vérifiée par ffprobe et décodée en entier
sans erreur : `out/echange/echange_comparaison.mp4`.

- À l'œil (`out/echange/planche_echange.jpg`) :
  - V0 : le bras long de A, tendu, est remplacé **d'un coup** par le gros poing en raccourci de B, pendant la tenue :
    c'est exactement le saut du film 8.
  - V3 : l'échange disparaît dans la traînée du geste.
  - Avec 3 sous-instants seulement, le flou montre des **copies discrètes** du bras, car le poignet fait 143 px/image.
  - Avec 8 sous-instants, la traînée est continue : le nombre de sous-instants doit suivre la vitesse,
    N ≥ v_max / 8 px.

### Inferences
- La mesure départage deux idées qui s'opposent :
  - échanger **au pic de vitesse**, là où le mouvement masque le plus ;
  - échanger **à pose égale**, là où les deux dessins se ressemblent le plus.

  Le meilleur compromis est **la dernière image rapide**, quand le squelette est presque à la pose cible. C'est aussi
  la variante du *cut on action* qui coupe « juste avant la fin du mouvement ».
- Règle exploitable par le moteur **sans rendu**, puisque tout est dans le squelette :
  `f* = argmin_f d_pose(f, P_B)` parmi les images f de la frappe où `v(f) ≥ 0,25·v_max` **et** `v(f+1) ≥ 0,25·v_max`.
  Ici, cette règle donne l'image 14 (s = 0,93, v = 109 puis 43), celle que le balayage trouve meilleure.
- La **mise en pose des longueurs** compte autant que celle des angles. B pointe vers la caméra (bras à 0,35 de sa
  longueur), donc A doit **raccourcir son bras** pendant la frappe. Le moteur sait déjà le faire avec `echelle.x` le
  long de l'os (`TransformOs`).
- Pour les **planches de l'utilisateur** (5 poses), la même règle s'applique **par partie** : le bras « accuse » d'une
  planche, la tête « choc » d'une autre, chacune calée sur le squelette. Jamais une planche entière d'un coup, ce qui a
  donné le saut du film 8.

### Gaps
- Un seul geste (accuser), un seul couple de dessins, et une mesure d'énergie de pixels qui n'est pas perceptive. Il
  faut confirmer sur une vidéo lue par l'utilisateur.
- Le passage d'une **vue** à une autre (face → 3/4 → profil pour le demi-tour) n'a pas pu être testé en rendu : il
  aurait fallu des vues générées acceptées. <<Q4_GAP_VUES2>>
- Les 5 poses des planches du propriétaire ne sont pas disponibles. La règle est testée sur une substitution klein.

---

## Q5. Ombrage : générer en lumière plate puis ré-ombrer par le moteur, ou garder l'ombrage cuit ? (coude à 120°, épaule levée)

### Takeaway
**Ombrage cuit pour la tête et le torse, ré-ombrage par le moteur pour les segments qui tournent.** C'est la voie
« hybride ».
- **Coude à 120°** : l'ombrage cuit met la lumière **sous** l'avant-bras, car le segment tourne avec sa lumière, et
  l'effet carton est évident. La voie hybride (albédo délité, normales gonflées qui tournent avec le segment, lumière fixe,
  occlusion au pli) remet la lumière **au-dessus** et creuse le coude.
- **Épaule levée** : l'écart est faible sur un bras uni, mais l'hybride reste cohérent.
- **Ré-ombrer tout le personnage** à partir d'une planche cuite est **pire** que le cuit. Le délitement procédural abîme
  le visage dessiné (taches, demi-visage sombre) et ne retire pas le **spéculaire** du satin des boubous.
- <<Q5_TAKEAWAY_PLAT>>
- On ne peut pas estimer automatiquement la direction de la lumière d'un décor par sa profondeur (R² ≤ 0,15) : elle
  doit être **déclarée par décor**.

### Cited Findings
- **Lumo** (Johnston, NPAR 2002) éclaire des dessins 2D en estimant des **normales interpolées depuis les contours**
  pour les intégrer à de la prise de vue réelle
  ([fiche bibliographique](https://isgwww.cs.uni-magdeburg.de/~stefans/npr/entry-Johnston-2002-LIC.html), DOI
  10.1145/508530.508538).
- **Tschumperlé, Porquet et Mahboubi** (ICIP 2022) estiment l'élévation d'un dessin en aplats comme le **maximum de
  demi-sphères** centrées sur le squelette (axe médian) de la silhouette :
  `B(P) = max_{Q∈K} √max(0, D(Q)² − ‖P − Q‖²)`, où D est la distance au bord.
  - Normales : `N = (∂B/∂x, ∂B/∂y, −1)`, normalisées, après un **lissage guidé par la silhouette**, parce que B n'est
    pas C¹.
  - Éclairage de Phong `J = Ka + Kd·(L̂·N̂) + Ks·max(0, R·V̂)^α`.
  - Selon les auteurs, la méthode est « extremely simple to implement, parallelizable » et se compare favorablement
    aux réseaux de neurones
  ([article](https://tschumperle.users.greyc.fr/publications/tschumperle_icip22.pdf)).
- **[mesure] Banc `banc_ombrage.py`**, sur le bras G de MODOU et de BAYE, à deux poses : **coude à 120°**
  (bras +15°, avant-bras +120°) et **épaule levée** (bras −150°). Quatre voies :
  1. **cuit** : la texture tourne avec le segment ;
  2. **ré-ombré** : chaque partie est « délitée » (L* divisé par son flou par matière, k-moyennes a*b*, σ = 0,9 ×
     demi-largeur), puis reçoit des normales gonflées par partie (`|n_xy| = 1 − d/R`, R = demi-largeur locale) qui
     **tournent avec le segment**, une lumière **fixe** L = (−0,45 ; −0,55 ; 0,70), `I = albédo·(0,55 + 0,65·max(0, n·L))`,
     et une occlusion ambiante au pivot posé `1 − 0,45·sin(flexion/2)·exp(−d²/(2(0,9 r)²))` ;
  3. **hybride** : seuls les segments qui tournent (bras, avant-bras, main) sont ré-ombrés ; tête et torse gardent
     l'ombrage cuit ;
  4. **plat** : albédo généré en lumière plate par klein. <<Q5_PLAT_STATUT>>

  Coût CPU : délitement et normales 1,4 à 4,6 s par personnage, une fois ; complétion 0,9 à 1,9 s. Le rendu
  d'ombrage est un produit par pixel.
- **À l'œil** (`out/ombrage/mz_zoom.jpg`, `by_zoom.jpg`, `mz_planche.jpg`) :
  - **Coude à 120°, cuit** : l'avant-bras qui traverse la poitrine garde la lumière qu'il avait, pendant, sur son côté
    gauche. Une fois tourné de 135°, son bord éclairé est **en bas** et son ombre **en haut** : la lumière semble venir
    du sol. C'est la signature du carton découpé décrite dans la mission.
  - **Coude à 120°, hybride** : bord haut éclairé, bas ombré, et un pli sombre au coude (occlusion). L'avant-bras se lit
    en volume, dans la même lumière que la tête.
  - **Épaule levée** : l'écart est moins frappant, parce que le bras de MODOU est presque uniforme. L'hybride donne quand
    même un côté éclairé cohérent et un creux d'aisselle.
  - **Ré-ombrage complet (tête et torse délités)** : **mauvais**. Taches et coutures sur le visage (amas des
    k-moyennes), moitié du visage assombrie par la normale « boule » de toute la tête, coutures entre torse et bassin.
    Le délitement procédural ne sait pas séparer le modelé dessiné du visage (nez, orbites) de l'éclairage.
  - **BAYE (satin)** : les **reflets spéculaires cuits** du boubou tournent avec la manche, ce qui est faux. Le délitement
    (basse fréquence) ne les retire pas. L'hybride donne une manche mate, avec une tache d'occlusion trop forte.
- **[mesure] Lumière du décor estimée automatiquement** (`lumiere_decor.py`) : moindres carrés lambertiens
  `Y ≈ a + w·n`, avec n tiré de la profondeur de la plaque.
  - R² = **0,087** (salon), **0,033** (marché), **0,059** (maquis), **0,154** (abidjan-2).
  - Les directions sont incohérentes : marché L_z < 0. La profondeur 8 bits relative et l'albédo peint dominent : on ne
    peut **pas** déduire la lumière d'un décor de cette façon.

### Inferences
- Le phénomène est une **incohérence d'orientation**, pas de quantité de lumière. Il suffit donc de faire tourner la
  **normale** avec le segment, sous une lumière fixe. La forme exacte du profil (gonflé ou sphères sur l'axe médian)
  change peu la lecture. Les sphères donnent un modelé plus rond (`out/ombrage/mz_cmp_normales.jpg`).
- Le **visage** tourne peu : inclinaison de ±30° au plus, lacet de ±12° (Q3). Son ombrage cuit reste donc plausible, et
  c'est lui qui porte le style « Pixar » que l'utilisateur aime. Le délitement procédural le dégrade : on n'y touche pas.
- L'occlusion au pli, proportionnelle à `sin(flexion/2)`, donne au coude et à l'aisselle le « creux » qui manque au
  carton. Elle ne coûte rien et ne dépend que de la pose.
- <<Q5_INF_PLAT>>
- La **lumière du décor** se déclare une fois par décor (191 décors : quelques minutes de clics, ou une valeur par
  famille « intérieur / rue / nuit »). L'estimation automatique par la profondeur 8 bits de la plaque échoue
  (R² 0,03–0,15, signes incohérents).

### Gaps
- Pas de mesure objective de la qualité de l'ombrage : la comparaison est faite à l'œil, comme le demandait la mission.
- Le profil « demi-sphères sur le squelette » de Tschumperlé n'a pas été implémenté. Nous avons utilisé `1 − d/R`, plus
  simple, qui donne un profil circulaire seulement pour les membres réguliers.
- Le spéculaire (satin des boubous, peau brillante du style Pixar) n'est pas modélisé.

---

## Ce que nous greffons dans notre moteur

<<GREFFES>>
