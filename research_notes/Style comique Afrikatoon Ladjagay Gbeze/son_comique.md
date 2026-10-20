# Son comique pour sketchs animés verticaux (TikTok / Reels / Shorts), angle ivoirien et ouest-africain — état octobre 2026

Notes de recherche, sources consultées le 16/10/2026, sauf mention contraire. Rappel des conversions utiles au moteur, qui tourne à 30 i/s : 1 image = 33,3 ms. À 24 i/s, 1 image = 41,7 ms. Les conversions d'images en ms sont de simple arithmétique ; elles ne viennent pas des sources.

---

## Q1. Palette d'effets sonores et règles de placement (images / ms) pour que le gag porte

### Takeaway
Aucune norme publiée ne fixe la place d'un bruitage comique. Les seuls chiffres en images viennent de blogs de vendeurs de sons : impact à +2 à +5 images après le contact, montée à −10 à −30 images avant le gag, son de prise de conscience à +20 à +40 images. Ces chiffres ne sont appuyés par aucune étude. On peut en revanche les caler sur des seuils de perception établis. Selon ITU-R BT.1359 (sources secondaires), un son en retard de moins de 125 ms passe pour synchrone, alors qu'un son en avance se détecte dès 45 ms. Pour que le retard se voie comme un effet voulu, il faut donc dépasser environ 4 images à 30 i/s.

### Cited Findings
**Placement par rapport au temps fort (sources de vendeurs, non vérifiées par une étude)**
- Trois placements sont décrits : avant le temps fort (« leading », par exemple un sifflet montant avant la glissade sur une peau de banane), sur le temps fort (impact) et juste après. Le placement juste après est présenté comme « often the sweet spot », parce qu'il laisse au spectateur une fraction de seconde pour comprendre l'image. — [SFX Engine, « Perfecting Sound Effects Timing in Comedy Videos »](https://sfxengine.com/blog/sound-effects-timing-in-comedy-videos)
- Pour le « post-impact pop », le même article conseille de décaler le son de 3 à 5 images, soit 125 à 200 ms à 24 i/s d'après lui. Il propose aussi un test à trois copies : une copie 3 images avant le repère, une sur le repère et une 3 images après. — [SFX Engine](https://sfxengine.com/blog/sound-effects-timing-in-comedy-videos)
- Son aide-mémoire de décalages, présenté comme des points de départ et non des règles : impact physique soudain +2 à +5 images ; montée vers un gag −10 à −30 images ; prise de conscience d'un personnage +20 à +40 images ; silence gêné +60 images ou plus. Pour le silence gêné, il conseille aussi de « let the silence hang there for a solid second or two ». — [SFX Engine](https://sfxengine.com/blog/sound-effects-timing-in-comedy-videos)
- Le même article avance d'autres chiffres : 0,2 à 0,5 s après le temps fort comme « sweet spot » ; un trombone triste 0,4 s après la maladresse ; +42 % de rires enregistrés grâce aux effets cartoon. Ces chiffres sont attribués à des « analyses » anonymes, sans éditeur ni méthode. Ils sont **non vérifiables**. — [SFX Engine](https://sfxengine.com/blog/sound-effects-timing-in-comedy-videos)
- Réglages de traitement proposés dans le même article : passe-haut à 100–150 Hz ; compresseur avec attaque de 1–5 ms et relâchement de 50–100 ms ; EQ +3 à +6 dB entre 2 et 5 kHz ; musique en ducking par sidechain sous les effets. L'article ne donne aucun niveau en dB des effets par rapport aux dialogues. — [SFX Engine](https://sfxengine.com/blog/sound-effects-timing-in-comedy-videos)

**Seuils de perception de la synchronisation son-image (référence technique)**
- ITU-R BT.1359 : le seuil de détectabilité va de +45 ms (son en avance) à −125 ms (son en retard). Le seuil d'acceptabilité va de +90 ms à −190 ms. — [brevet US 7400653 qui résume la recommandation](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7400653) ; même plage de détectabilité dans [arXiv 2212.01686](https://arxiv.org/pdf/2212.01686)
- Ces seuils ont été établis sur des extraits d'un présentateur de journal, pas sur d'autres contenus. — [arXiv 2212.01686](https://arxiv.org/pdf/2212.01686)
- Le NTIA donne les mêmes valeurs avec la convention de signe inversée (positif = son en retard). Il cite aussi l'ATSC, plus stricte : le son ne doit jamais être en avance de plus de 15 ms ni en retard de plus de 45 ms. — [NTIA report 11-474](https://its.ntia.gov/publications/download/11-474.pdf)

**Synchronisation labiale (pratique d'animation)**
- Les animateurs ouvrent la mâchoire 1 à 2 images avant le son. Une bouche calée exactement sur les crêtes de la forme d'onde paraît en retard à l'écran. Pour B, M et P, il faut tenir la bouche fermée environ 2 images. — [Pluralsight, « Proven Tips for Animating Believable Lip Sync »](https://www.pluralsight.com/resources/blog/software-development/proven-tips-animating-believable-lip-sync) ; [High On Films, lip sync techniques](https://www.highonfilms.com/lip-sync-animation-techniques-every-character-animator-should-know/)

**Silence et pause avant la chute : les études contredisent l'intuition**
- Attardo et Pickering (2011, *Humor* 24(2), 233–250) ont analysé vingt jokes interprétées. Rien n'indique une pause avant la chute, ni une accélération ou un ralentissement du débit autour d'elle. — [De Gruyter, « Timing in the performance of jokes »](https://www.degruyterbrill.com/document/doi/10.1515/HUMR.2011.015/pdf?lang=en)
- Dans une étude apparentée (Pickering et al., *Discourse Processes*), la chute n'est pas dite plus fort que ce qui précède. Elle est dite plus grave et plus lentement, sans pause significative avant. — [Penn State, « Prosodic markers of saliency in humorous narratives »](https://pure.psu.edu/en/publications/prosodic-markers-of-saliency-in-humorous-narratives/)

**Palette classique et rôle de chaque son**
- Scratch de disque : arrêt brutal de la musique de fond qui signale un retournement choquant. C'est un cliché des bandes-annonces de comédie, souvent avec l'attaque de « I Got You (I Feel Good) », et un trope en voie d'usure. — [Tropedia, « Record Needle Scratch »](https://tropedia.fandom.com/wiki/Record_Needle_Scratch). Habitude des bandes-annonces depuis la fin des années 1980 — [Maclean's](https://www.macleans.ca/uncategorized/when-did-the-record-scratch-cliche-start)
- Trombone triste : 3 à 4 notes descendantes pour souligner une chute ou un embarras, héritées du vaudeville et de la radio. — [Big Sound Bank, « meme iconic sounds »](https://bigsoundbank.com/articles/meme-iconic-sounds-f97.html)
- Grillons, roulement-cymbale (rimshot) et scratch figurent comme ponctuations comiques ; les grillons sont « le son quand personne ne rit ». Source commerciale. — [Morphic, comedy sound effects](https://morphic.com/resources/sounds/comedy-sound-effects)
- « Vine boom » : il vient d'une vidéo de banque de sons publiée le 7 novembre 2012 par la chaîne YouTube Bluezone Corporation. King Bach l'a popularisé sur Vine en 2014. Il a ensuite survécu dans les montages Instagram et les mèmes ironiques. — [Know Your Meme, « Vine Thud / Boom Sound Effect »](https://knowyourmeme.com/memes/vine-thud-boom-sound-effect). Meme.com donne d'autres dates (2009, 2013), contredites par KYM — [meme.com](https://meme.com/memes/vine-thud-boom-sound-effect)

**Rires (durées)**
- Bachorowski, Smoski et Owren (2001, JASA 110(3), 1581–1597) ont étudié 1 024 rires spontanés de 97 jeunes adultes devant des vidéos drôles. Leur acoustique est variable, pas stéréotypée. — [DOI 10.1121/1.1391244](https://doi.org/10.1121/1.1391244)
- Selon une revue secondaire, un rire compte environ 4,4 « appels » par épisode, chacun d'environ 0,11 s, séparés de 0,12 s. Un épisode type dure « around one second (or slightly less) ». — [arXiv 1010.5602, « The Bonds of Laughter »](https://arxiv.org/pdf/1010.5602)

### Inferences
- **Conversion à 30 i/s (arithmétique sur les chiffres des vendeurs, en supposant qu'ils comptent à 24 i/s).**

  | Cas | Source (24 i/s) | Durée | À 30 i/s |
  |---|---|---|---|
  | Impact | +2 à +5 images | ≈ 83–208 ms | +3 à +6 images |
  | Montée | −10 à −30 images | ≈ 417–1 250 ms | −12 à −38 images |
  | Prise de conscience | +20 à +40 images | ≈ 833–1 667 ms | +25 à +50 images |
  | Silence gêné | +60 images | ≈ 2,5 s | +75 images |
  | Trombone triste | 0,4 s | 400 ms | +12 images |

  Pour le silence gêné, on peut aussi viser 1 à 2 s, soit 30 à 60 images, comme le conseille le texte.
- **Croisement avec ITU-R BT.1359, pour créer plutôt que copier.**
  - Un bruitage d'impact en retard de 0 à 3 images (≤ 100 ms) reste sous le seuil de détection de 125 ms : il paraît « synchrone ».
  - Un retard voulu, du type « le son arrive après la chute », doit dépasser environ 125 ms, soit au moins 4 images, pour être perçu comme un effet.
  - Un son en avance se remarque dès 45 ms, soit 2 images. Il faut donc le réserver aux sons d'anticipation (whoosh, sifflet montant), placés nettement en avance (−12 images et plus), et ne jamais avancer un impact de 1 à 2 images « par erreur ».
- **Pause avant la chute.** Les études d'Attardo et Pickering ne trouvent pas de pause systématique avant la chute orale. Le « temps mort » comique tient plutôt à la réaction après la chute : silence, grillons, regard caméra. Cela recoupe le +20 à +60 images des vendeurs. C'est à valider par un test A/B sur la chaîne.
- **Rires.** Les rires mesurés sur la chaîne durent environ 4,7 s, soit 4 à 5 fois un épisode de rire naturel (environ 1 s selon la revue). Hypothèse à tester : couper le rire à environ 1–1,5 s, ou le laisser filer en dessous de la réplique suivante en ducking, pour garder le rythme rapide du format court.
- **Critère d'acceptation proposé.** Le moteur produit une liste de repères (cue list) à partir des événements d'animation : image de contact, image d'inversion du mouvement, image de réaction. Un détecteur d'attaques sur le mix final (par exemple `ffmpeg … astats` ou `librosa.onset`) doit retrouver chaque attaque à ±1 image du repère prévu.

### Gaps
- Aucune étude publiée et vérifiable ne mesure l'effet du décalage d'un bruitage sur le rire en format court. Tous les chiffres « +42 % », « 0,4 s » ou « 0,2–0,5 s » viennent de blogs de vendeurs sans méthode.
- L'origine et la licence des sons-mèmes « oh no », « bruh » et « dun dun dun » n'ont pas été recherchées. Pour le vine boom, on sait seulement qu'il vient d'une banque de sons commerciale (Bluezone, 2012) ; sa licence exacte n'a pas été lue.
- Le texte original d'ITU-R BT.1359 n'a pas été consulté directement : il est payant, et les chiffres viennent de résumés concordants.
- Aucune source ne donne de niveau en dB recommandé pour un bruitage comique par rapport au dialogue.
- Un résumé de recherche évoque une étude chinoise sur 828 spectacles de stand-up, où les pauses s'allongent avant les chutes très surprenantes. Elle n'a pas été localisée et n'est pas retenue.

---

## Q2. Musique, ducking et loudness recommandés pour les plateformes courtes

### Takeaway
TikTok, Instagram et YouTube Shorts ne publient **aucune** cible officielle en LUFS. Le consensus des guides commerciaux est −14 LUFS intégrés et −1 dBTP en crête vraie. Les normes publiées sont plus basses :
- EBU R128 : −23 LUFS, crête vraie ≤ −1 dBTP ;
- EBU R128 s1 (format court) : intensité court terme maximale de +5 LU au-dessus de l'intégré ;
- EBU R128 s2 (streaming) : −20 à −16 LUFS en valeur provisoire ;
- AES TD1008 : −18 LUFS pour la parole ou le contenu mixte, −16 LUFS pour la musique.

Pour le ducking, les seules valeurs citables sont des réglages par défaut de logiciels, par exemple Audacity Auto Duck à −12 dB, et non des normes.

### Cited Findings
**Normes et recommandations (sources primaires)**
- EBU R 128 (V5, novembre 2023) : intensité du programme normalisée à **−23,0 LUFS** (±0,5 LU ; ±1,0 LU en direct) ; crête vraie maximale **−1 dBTP**. Les crêtes permises « may be lower » selon les systèmes de distribution et les débits compressés. — [EBU R 128](https://tech.ebu.ch/docs/r/r128.pdf)
- EBU R 128 : pour un programme de moins d'une minute, la plage d'intensité (LRA) est déconseillée, faute de points de mesure (fenêtre court terme de 3 s). — [EBU R 128](https://tech.ebu.ch/docs/r/r128.pdf)
- EBU R 128 s1 (2020, format court : publicités, promos, « up to approximately 2 minutes, typically shorter than 30 seconds ») : intensité du programme **−23,0 LUFS** ; **intensité court terme maximale −18,0 LUFS, soit +5,0 LU** sur l'échelle relative, pour éviter des formats courts trop dynamiques. — [EBU R 128 s1](https://tech.ebu.ch/docs/r/r128s1.pdf)
- EBU R 128 s2 (« Loudness in Streaming », V3 novembre 2023) : les plateformes visent en général plus fort que la radiodiffusion. Sans métadonnées, l'intensité de distribution peut monter, avec une valeur provisoire de **−20,0 à −16,0 LUFS**. Les smartphones sont cités comme le cas « limited playback gain and headroom and/or higher background noise ». — [EBU R 128 s2](https://tech.ebu.ch/docs/r/r128s2.pdf)
- AES TD1008 (publiée en 2021 selon Production Advice) : parole seule et contenu « Assorted » (parole, musique et effets) à **−18 LUFS** ; musique à **−16 LUFS** en moyenne, la chanson la plus forte d'un album à −14 LUFS ; compromis à −17 LUFS quand on ne peut pas séparer parole et musique. — [Production Advice, TD1008](https://productionadvice.co.uk/td1008/) ; [Telos Alliance](https://docs.telosalliance.com/docs/understanding-loudness-for-streaming-audio)

**Plateformes**
- Spécifications YouTube (officielles) pour l'envoi : audio AAC-LC, Opus ou Eclipsa Audio ; 48 kHz ; stéréo à 384 kbps, mono à 128 kbps. La page ne dit **rien** sur l'intensité sonore ni la normalisation. — [YouTube Help, encodage recommandé](https://support.google.com/youtube/answer/1722171?hl=en)
- Guides commerciaux sur TikTok et Reels : cible de −14 LUFS intégrés avec un plafond de crête vraie à −1 dBTP. Les plateformes ne publient pas de chiffre officiel. — [mixingandmastering.ai](https://mixingandmastering.ai/blog/lufs-for-tiktok-and-reels) ; [cutscore.io, Instagram Reels](https://cutscore.io/blog/loudness-for-instagram-reels) ; [Trackgleam](https://trackgleam.com/learn/master-for-tiktok-reels-shorts) ; [Mr. Vocal](https://mrvocal.com/posts/loudness-for-shorts)
- Étude Kantar commandée par TikTok : **88 %** des utilisateurs jugent le son essentiel à l'expérience ; **73 %** disent « stop and look » devant une publicité avec audio. — [TikTok for Business, rapport Kantar](https://ads.tiktok.com/business/vi/blog/kantar-report-how-brands-are-making-noise-and-driving-impact-with-sound-on-tiktok) ; [Social Media Today](https://www.socialmediatoday.com/news/tiktok-shares-new-insights-into-the-importance-of-sound-for-marketing-promo/601569)

**Outils locaux de mesure et de normalisation (réglages documentés)**
- `ffmpeg loudnorm` :
  - I par défaut −24,0 (plage −70 à −5) ; LRA 7,0 ; TP par défaut −2,0 (plage −9 à 0) ;
  - double passe avec `measured_I`, `measured_LRA`, `measured_TP`, `measured_thresh` et `linear=true`. Le filtre repasse en mode dynamique si la cible LRA est inférieure à la LRA source, ou si le gain fait dépasser la crête vraie cible ;
  - en mode dynamique, l'audio est suréchantillonné à 192 kHz, d'où `-ar` à préciser en sortie ;
  - option `dual_mono` pour les sources mono.

  — [FFmpeg Filters, loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm)
- `ffmpeg sidechaincompress` (ducking) : valeurs par défaut threshold 0,125 (≈ −18 dBFS, calcul 20·log10 0,125), ratio 2 (max 20), attaque 20 ms, relâchement 250 ms, knee 2,83, détection rms. — [FFmpeg Filters, sidechaincompress](https://ffmpeg.org/ffmpeg-filters.html#sidechaincompress)
- Audacity Auto Duck, valeurs par défaut : **Duck Amount −12 dB**, Maximum Pause 1 s, fondus de descente et de montée de 0,5 s, seuil −30 dB. Le manuel ne recommande pas d'atténuation précise. — [Manuel Audacity, Auto Duck](https://manual.audacityteam.org/man/auto_duck.html)
- Adobe Premiere Pro (Essential Sound, Ducking) : aucune valeur officielle trouvée.
  - Un utilisateur du forum Adobe pense que le défaut est d'environ 18 dB, sans certitude — [Adobe Community](https://community.adobe.com/t5/premiere-pro-beta-bugs/quot-ducking-quot-doesn-t-work-when-audio-track-keyframes-is-selected/idc-p/15509831).
  - Un formateur règle « Reduce by » vers −27 dB par préférence personnelle — [LinkedIn Learning/Lynda](https://origin-www.lynda.com/Premiere-Pro-tutorials/Automatic-ducking/2871078/2381099-4.html).

**Musiques ivoiriennes (pour les fonds musicaux)**
- Coupé-décalé :
  - instruments : guitare, basse, batterie, clavier, synthétiseur, boîte à rythmes, tambour ;
  - les **atalaku** sont des éloges et dédicaces criés au micro par le DJ sur la musique, une pratique venue de la rumba congolaise ;
  - le genre est moins satirique que le zouglou : « on passe d'une musique engagée et réflexive sur sa société à une musique d'ambiance » ;
  - repères : arrivée vers 2002 à Abidjan ; *Sagacité* de Douk Saga en 2003 ; mort de Douk Saga en 2006.

  — [Wikipédia FR, Coupé-décalé](https://fr.wikipedia.org/wiki/Coup%C3%A9-d%C3%A9cal%C3%A9)
- Le zouglou est un style dansant né en Côte d'Ivoire au milieu des années 1990. — [Wikipedia, Zouglou](https://en.wikipedia.org/wiki/Zouglou)
- Afrobeats : médiane de 110 BPM, la plupart des morceaux entre 99 et 115 BPM, selon un catalogue dont la méthode n'est pas vérifiable. — [Mixgraph](https://www.mixgraph.io/bpm-for/afrobeats)

### Inferences
- **Chaîne de mixage proposée** (combinaison de normes et d'outils, à valider sur nos fichiers) :
  1. mesurer avec pyloudnorm, puis appliquer `loudnorm` en double passe linéaire vers **−14 LUFS intégrés, TP −1 dBTP** (consensus commercial pour les plateformes) ;
  2. ajouter un contrôle automatique adapté d'EBU R128 s1 : l'intensité court terme maximale ne doit pas dépasser l'intégré de plus de 5 LU, soit −9 LUFS court terme pour un master à −14. Cela signale les bruitages trop forts (vine boom, coup de grosse caisse) qui déclencheraient le limiteur de la plateforme ou feraient sursauter.

  La règle +5 LU vient du format court en radiodiffusion ; la transposer à −14 LUFS est une inférence.
- **Ne pas mesurer la LRA** sur des clips de moins de 60 s : l'EBU la déconseille.
- **Ducking « prévu » plutôt que détecté.** Le moteur connaît exactement les intervalles de parole (Piper TTS). On peut donc écrire une enveloppe de volume déterministe (`volume` avec expressions `between(t,…)` dans ffmpeg) au lieu d'un compresseur sidechain avec attaque et relâchement. Points de départ :
  - −12 dB (défaut Audacity) ;
  - descente de 0,5 s commençant **avant** la réplique (défaut Audacity) ;
  - remontée rapide après la réplique, à régler à l'écoute.

  Critère d'acceptation : l'intensité court terme de la musique pendant la parole doit être au moins 12 LU sous celle de la voix, mesurée par pyloudnorm sur chaque piste.
- **Fond musical.** Les atalaku du coupé-décalé (dédicaces criées) sont un dispositif sonore local qui peut servir de « stinger » comique : une voix d'ambianceur synthétisée qui commente la chute. C'est un pont entre la tradition du maquis et le rôle du « sting » dramatique.

### Gaps
- Aucune page officielle de TikTok, Instagram ou YouTube ne donne de cible en LUFS ou de comportement de normalisation pour la vidéo courte. Certains guides commerciaux affirment que TikTok ne normalise pas et conseillent −9 à −12 LUFS ; ces affirmations ne sont pas vérifiées.
- Le PDF original d'AES TD1008 n'a pas été lu : le lien de téléchargement AES renvoie une page HTML. Le plafond de crête vraie propre à TD1008 n'est donc pas confirmé ; l'ancienne TD1004 retenait −1 dBTP, selon un résumé.
- Aucune source fiable n'a été trouvée pour le tempo (BPM) du coupé-décalé ou du zouglou.
- Aucune valeur de ducking en dB ne vient d'une norme : seulement des valeurs par défaut de logiciels et des préférences de formateurs.
- Un tutoriel Premiere, non identifié avec certitude parmi les résultats de recherche, donnerait 800 ms comme fondu de ducking par défaut et le jugerait « way too slow ». Ce chiffre n'est pas confirmé par Adobe.

---

## Q3. Ressources gratuites et générateurs compatibles avec une app commerciale (code et modèles en MIT / Apache-2.0 / BSD, ressources en CC0)

### Takeaway
Retenus :
- **Sons :** Kenney (CC0) et Freesound filtré sur « Creative Commons 0 ».
- **Générateurs procéduraux :** ZzFX (MIT), Tone.js (MIT), jsfxr (Unlicense, domaine public).
- **Intensité sonore :** pyloudnorm (MIT).
- **Musique :** **ACE-Step 1.5**, code ET poids sous MIT (vérifié sur GitHub et Hugging Face), et ACE-Step v1 sous Apache-2.0. YuE est sous Apache-2.0 sur Hugging Face mais très lourd (7 milliards de paramètres).

Exclus :
- MusicGen, AudioGen et JASCO : poids en CC-BY-NC-4.0.
- Stable Audio Open : Stability AI Community License, avec plafond de chiffre d'affaires.
- DiffRhythm : son VAE est sous licence « stable-audio-community ».
- Sonniss : non CC0, apprentissage IA interdit, redistribution « en tant qu'effets sonores » interdite.
- BBC : usage personnel ou éducatif seulement.
- pedalboard : GPLv3.

ffmpeg est sous LGPL 2.1+ (GPL si compilé avec des modules GPL). C'est hors liste MIT/Apache/BSD : à signaler s'il est livré avec l'app.

### Cited Findings
**Banques de sons**
- **Kenney**
  - « all game assets on the asset pages are public domain licensed (CC0) … free to use them, even in commercial projects ». L'attribution n'est pas requise. — [Kenney Support](https://kenney.nl/support)
  - Le pack **Impact Sounds** contient 130 fichiers sous licence « Creative Commons CC0 », version 1.0 sortie en 2019. — [Kenney, Impact Sounds](https://kenney.nl/assets/impact-sounds)
  - Packs audio listés : Casino Audio, Sci-fi Sounds, Interface Sounds, Impact Sounds, Voiceover Pack (Fighter), Voiceover Pack, Music Jingles, RPG Audio, Digital Audio, UI Audio. — [Kenney, catégorie Audio](https://kenney.nl/assets/category:Audio)
- **Freesound**
  - Trois licences au choix de l'auteur : CC0, CC BY 4.0, CC BY-NC 4.0. Sampling+ 1.0 subsiste pour d'anciens sons.
  - Sous CC0, « you can do pretty much what you want with the sound » ; seule limite : ne pas s'en dire l'auteur.
  - Sous CC BY-NC, « you can't earn any money with the piece of work you create ».
  - Le filtre de recherche « Free Cultural Works » renvoie CC BY et CC0.
  - « We aren't lawyers. »

  — [Freesound FAQ](https://freesound.org/help/faq/)
- **API Freesound**
  - Le champ `license` vaut « Attribution », « Attribution NonCommercial » ou « Creative Commons 0 ».
  - Un champ `gen_ai_preference` a été ajouté. Il donne la préférence de l'auteur sur l'apprentissage d'IA générative : « no-additional-preferences », « open-source-models », « noncommercial-open-source-models », « no-gen-ai ».

  — [Freesound API v2](https://freesound.org/docs/api/resources_apiv2.html)
- **Sonniss, bundles GDC**
  - « All of the sounds are royalty free and commercially usable » ; « Attribution is always appreciated, but never required ».
  - Redistribution : « Not as sound effects. That covers the original files and any edited or re-designed versions ». La vente reste permise « as part of your finished game, film, app, or creative project ».
  - « Use for AI/ML training is strictly prohibited » ; licence « for media production (games, film, TV, interactive projects) only ».
  - Dernier bundle gratuit : GDC 2024 (9 parties, 23,5 Go) ; pas de bundle 2025.

  — [Sonniss, gameaudiogdc](https://sonniss.com/gameaudiogdc)
- **BBC Sound Effects**
  - Le site propose de « use them in your own personal/educational projects, or licence them for use ». — [BBC Rewind Sound Effects](https://sound-effects.bbcrewind.co.uk/)
  - Licence RemArc : usage de recherche, éducatif ou personnel ; pas d'échantillonnage dans une musique vendue. — [Mixmag](https://mixmag.net/read/bbc-sound-effect-archive-free-audio-samples-news)

**Générateurs procéduraux et outils (licences lues)**

| Outil | Licence (source) | Version / date |
|---|---|---|
| **jsfxr** (port JS de sfxr) | **Unlicense** : « This is free and unencumbered software released into the public domain » — [UNLICENSE](https://github.com/chr15m/jsfxr/blob/master/UNLICENSE) | npm 1.4.1 ([npm](https://www.npmjs.com/package/jsfxr)) |
| **ZzFX** (Frank Force) | **MIT**, © 2019 — [LICENSE](https://github.com/KilledByAPixel/ZzFX/blob/master/LICENSE) | npm `zzfx` 1.4.0 ([npm](https://www.npmjs.com/package/zzfx)) |
| **Tone.js** | **MIT**, © 2014-2020 Yotam Mann — [LICENSE.md](https://github.com/Tonejs/Tone.js/blob/main/LICENSE.md) | npm `tone` 15.1.22 ([npm](https://www.npmjs.com/package/tone)) |
| standardized-audio-context | MIT — [npm](https://www.npmjs.com/package/standardized-audio-context) | 25.3.77 |
| **pyloudnorm** | **MIT**, © 2018 Christian Steinmetz — [LICENSE](https://github.com/csteinmetz1/pyloudnorm/blob/master/LICENSE) | PyPI 0.2.0 ([PyPI](https://pypi.org/project/pyloudnorm/)) |
| ffmpeg-normalize (pilote ffmpeg) | MIT — [PyPI](https://pypi.org/project/ffmpeg-normalize/) | 1.43.0 |
| soundfile | BSD 3-Clause — [PyPI](https://pypi.org/project/soundfile/) | 0.14.0 |
| librosa | ISC (permissive, mais hors liste stricte MIT/Apache/BSD) — [PyPI](https://pypi.org/project/librosa/) | 1.0.0 |
| pedalboard (Spotify) | **GPLv3 → exclu** — [PyPI](https://pypi.org/project/pedalboard/) | 0.9.26 |
| **FFmpeg** | « licensed under the GNU Lesser General Public License (LGPL) version 2.1 or later », GPL v2+ si des parties optionnelles GPL sont utilisées ; mention LGPL requise en cas de distribution — [FFmpeg Legal](https://ffmpeg.org/legal.html) | — |

**Modèles de génération musicale (licences lues via l'API Hugging Face et les fichiers LICENSE le 16/10/2026)**

| Modèle | Licence du code | Licence des poids | Verdict pour l'app |
|---|---|---|---|
| MusicGen small/large (Meta) | — | **CC-BY-NC-4.0** — [HF musicgen-small](https://huggingface.co/facebook/musicgen-small), [musicgen-large](https://huggingface.co/facebook/musicgen-large) | **Exclu** (non commercial) |
| AudioGen medium, JASCO (Meta) | — | **CC-BY-NC-4.0** — [audiogen-medium](https://huggingface.co/facebook/audiogen-medium), [jasco](https://huggingface.co/facebook/jasco-chords-drums-400M) | **Exclu** |
| Stable Audio Open 1.0 et Small | — | **Stability AI Community License** (« Last Updated: July 5, 2024 ») : usage commercial gratuit seulement sous 1 000 000 USD de chiffre d'affaires annuel, avec enregistrement obligatoire ; licence d'entreprise à la discrétion de Stability au-delà — [LICENSE.md](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md), [SAO small](https://huggingface.co/stabilityai/stable-audio-open-small) | **Exclu** (ni MIT, ni Apache, ni BSD) |
| **ACE-Step v1 3.5B** | Apache-2.0 — [LICENSE](https://github.com/ace-step/ACE-Step/blob/main/LICENSE) | **Apache-2.0** — [HF](https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B) (mise à jour du 22/05/2025) | Compatible |
| **ACE-Step 1.5** | **MIT** « Copyright (c) 2026 ACEStep » — [LICENSE](https://github.com/ace-step/ACE-Step-1.5/blob/main/LICENSE) | **MIT** — [HF Ace-Step1.5](https://huggingface.co/ACE-Step/Ace-Step1.5) (mise à jour du 03/02/2026) ; tous les dépôts acestep-v15-* et les LM 5Hz (0.6B, 1.7B, 4B) sont aussi en MIT ; encodeur de texte inclus Qwen3-Embedding-0.6B en **Apache-2.0** ([HF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)) | **Compatible**. À exclure : la LoRA « chinese-new-year » en creativeml-openrail-m ([HF](https://huggingface.co/ACE-Step/ACE-Step-v1.5-chinese-new-year-LoRA)) |
| YuE s1 7B / s2 1B | Apache-2.0 — [LICENSE](https://github.com/multimodal-art-projection/YuE/blob/main/LICENSE) | Apache-2.0 — [YuE-s1-7B](https://huggingface.co/m-a-p/YuE-s1-7B-anneal-en-cot), [YuE-s2-1B](https://huggingface.co/m-a-p/YuE-s2-1B-general) | Compatible sur le papier ; 7 milliards de paramètres, irréaliste sur CPU (inférence) |
| DiffRhythm | Apache-2.0 selon le README GitHub — [GitHub](https://github.com/ASLP-lab/DiffRhythm) | DiT « apache-2.0 », mais la carte porte `license_name: stable-audio-community` — [DiffRhythm-base](https://huggingface.co/ASLP-lab/DiffRhythm-base) ; **VAE sous « other / stable-audio-community »** — [DiffRhythm-vae](https://huggingface.co/ASLP-lab/DiffRhythm-vae) | **Exclu** : la chaîne complète dépend d'un VAE sous licence Stability |

- ACE-Step 1.5 :
  - la carte du modèle affirme « You can strictly use the generated music for commercial purposes ». Elle décrit des données d'entraînement « Licensed Data », « Royalty-Free / No-Copyright Data » et « Synthetic Data » (MIDI vers audio), ce que le projet déclare lui-même sans audit public — [HF Ace-Step1.5](https://huggingface.co/ACE-Step/Ace-Step1.5) ;
  - performances annoncées : moins de 4 Go de VRAM ; une chanson entière en moins de 2 s sur A100 et moins de 10 s sur RTX 3090 ;
  - le README indique « CUDA GPU recommended (also supports MPS / ROCm / Intel XPU / CPU) » ; le palier ≤ 6 Go utilise le DiT « 2B turbo » quantifié en INT8 avec déchargement complet sur le CPU ;
  - avertissement : « verify the originality of generated works, clearly disclose AI involvement ».

  — [README ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5)

### Inferences
- **Pile retenue pour une app aux licences strictes :**
  - bruitages comiques synthétisés par **ZzFX** (MIT) ou **jsfxr** (domaine public) : boing = onde carrée ou sinus avec glissement de fréquence montant puis descendant ; whoosh = bruit filtré avec balayage ; glissade = sifflet montant ;
  - percussions et motifs rythmiques de fond par **Tone.js** (MIT) dans Chromium headless, déjà présent dans le moteur ;
  - impacts réels (claque, chute) pris dans **Kenney Impact Sounds** (CC0) ;
  - fonds musicaux ivoiriens générés hors ligne par **ACE-Step 1.5** (MIT, code et poids), avec des balises de style et un tempo dans la consigne ;
  - mesure par **pyloudnorm**, normalisation par **ffmpeg loudnorm**.
- **Sonniss.** Même si l'usage commercial est permis, l'app ne doit livrer aucun fichier Sonniss réutilisable : ce serait une « redistribution en tant qu'effets sonores ». Seul l'audio intégré au rendu final serait acceptable, et la règle « ressources CC0 » l'exclut de toute façon.
- **Sons-mèmes.** Le vine boom vient d'une banque commerciale (Bluezone, 2012) : en recréer un équivalent procédural (sinus grave avec réverbération longue) plutôt que d'embarquer le fichier. Même logique pour les sons « viraux » TikTok, voir Q4 sur la bibliothèque musicale commerciale de TikTok.
- **Freesound.** Filtrer les téléchargements automatiques sur `license == "Creative Commons 0"` et garder le champ `gen_ai_preference` dans le registre des ressources. Un futur réentraînement (LoRA ACE-Step sur nos propres sons) respecterait alors les choix des auteurs.
- **Critère d'acceptation pour une génération musicale ACE-Step 1.5 sur CPU.** Mesurer le temps de génération d'un fond de 15 à 30 s sur le CPU de production. Cible : moins de 10 × temps réel, à confirmer (l'objectif « un film d'une minute en minutes » impose de le mesurer). Le README ne donne aucun chiffre pour le CPU.

### Gaps
- Aucune durée de génération d'ACE-Step 1.5 sur CPU seul n'est publiée : à mesurer sur nos données.
- La qualité réelle d'ACE-Step 1.5 sur le coupé-décalé, le zouglou et l'afrobeats n'est documentée nulle part : à écouter et tester.
- La licence du sfxr original (DrPetter) et celle de bfxr n'ont pas pu être lues : fichiers LICENSE introuvables aux chemins essayés, et API GitHub bloquée dans cette session.
- Un guide secondaire évoque un « YuE2 » avec des poids CC BY-NC ; non vérifié et non retenu.
- La licence de TangoFlux n'apparaît pas dans les métadonnées Hugging Face. La licence Pixabay n'a pas été lue (page bloquée) ; ce n'est de toute façon pas du CC0.
- Aucun « tchip » ni rire africain sous CC0 n'a été vérifié sur Freesound : recherche par API à faire.

---

## Q4. Comment les créateurs comiques ivoiriens et ouest-africains utilisent le son

### Takeaway
La documentation est maigre : pages « découvrir » de TikTok, médias ivoiriens de divertissement, quelques travaux universitaires nigérians et ghanéens qui n'analysent pas le son. Les éléments sûrs :
- l'humour ivoirien en vidéo courte s'appuie sur l'**ambiance maquis** (musique « à fond », bruitages faits à la bouche, parler nouchi) ;
- il reprend des **extraits de chansons ivoiriennes** devenus des sons TikTok ;
- il utilise le **tchip**, bruit de succion de mépris « venu d'Afrique et des Antilles » selon Le Robert ;
- au Nigeria, des **rires et cris de personnalités** (Akrobeto) circulent comme bruitages réutilisables.

### Cited Findings
- **DJ TikTok (Thierry Yaké)**, article du 14/05/2026 :
  - son concept « Maquis TikTok » est décrit ainsi : « Télécommande utilisée comme micro, musique à fond, commentaires hilarants » ;
  - l'article cite « ses bruitages », les réactions exagérées, le « parler nouchi » et une « ambiance festive, vannes improvisées et situations complètement décalées ».

  — [Zappingmedias](https://www.zappingmedias.com/dj-tiktok-le-createur-ivoirien-qui-a-impose-son-propre-style-sur-tiktok/). Biographie : [Biographie.ci](https://biographie.ci/humoristes-comediens-stand-up/biographie-de-dj-tiktok-la-star-web-ivoirienne/)
- Créateurs ivoiriens mis en avant par Pulse.ci :
  - en 2025, le duo Pouppy et Amour Ruth, et Tecknoush (sketchs sur le couple) — [Pulse.ci 2025](https://www.pulse.ci/article/besoin-dune-bonne-dose-de-rire-voici-10-tiktokeurs-ivoiriens-a-suivre-absolument-2025091915542150724) ;
  - en 2024, Mamie Show, passée de Facebook à TikTok — [Pulse.ci 2024](https://www.pulse.ci/articles/divertissement/celebrites/10-influenceurs-ivoiriens-sur-tiktok-a-suivre-2024090510363536863).
- Sons ivoiriens qui circulent sur TikTok : Fleke Fleke (« Kpetou »), VDA (« Découragement n'est pas ivoirien »), TEAM2POY (« Tourbillon Biama », présenté comme un son de Yopougon). Il s'agit de pages « découvrir » de TikTok, dont les dates et les chiffres sont peu fiables. — [TikTok discover, musique ivoirienne kpetou](https://www.tiktok.com/discover/musique-ivoirienne-kpetou) ; [TikTok discover, TikTok ivoirien](https://www.tiktok.com/discover/tiktok-ivoirien)
- **Tchip**
  - Nom masculin : action de produire un bruit de succion pour marquer la désapprobation ou le mépris, et ce bruit lui-même. Origine Afrique et Antilles. — [Le Robert, tchip](https://dictionnaire.lerobert.com/definition/tchip)
  - Verbe « tchiper » : mouvement de langue vers l'arrière avec succion ; sorte d'onomatopée ; usage africain et antillais. — [La langue française](https://www.lalanguefrancaise.com/dictionnaire/definition/tchiper)
  - Pour le linguiste Philippe Hambye, c'est une onomatopée « comme une autre », fréquente. Certains collèges et lycées français l'ont interdite. — [Afrik.com](https://www.afrik.com/pourquoi-les-africains-tchipent-ils)
- **Atalaku** (coupé-décalé) : dédicaces et éloges criés par le DJ au micro sur la musique. — [Wikipédia FR, Coupé-décalé](https://fr.wikipedia.org/wiki/Coup%C3%A9-d%C3%A9cal%C3%A9)
- **Nigeria**
  - Des pages TikTok rassemblent des « Nigerian comedy sound effects » numérotés pour les faiseurs de sketchs : rire viral d'Akrobeto, extrait « Run for your life », appels « #usethissound ». Pages de fans, chiffres non vérifiés. — [TikTok discover, Nigerian comedy sound effects](https://www.tiktok.com/discover/nigerian-comedy-sounds-effect-sound-original-video)
  - Une application Android vend des « Nigeria Comedy Sound Effects ». — [Google Play](https://play.google.com/store/apps/details?id=nigeria.comedy.sound.effect&hl=en_US)
  - Selon l'African Polling Institute (2019), 67 % des Nigérians disent regarder des sketchs comiques. Freins cités : coût de production, électricité, taxes sur les réseaux sociaux. — [API, communiqué Skit Comedy](https://africapolling.org/wp-content/uploads/2021/01/API-Skit-Comedy-Press-Release.pdf)
  - Les faiseurs de sketchs en ligne ont contourné la forte barrière d'entrée du stand-up. — [TechCabal](https://techcabal.com/?p=110563)
  - Une thèse d'Illinois State analyse les sketchs comme multimodaux : « language, visuals, movement, costume, sound, and narrative structure ». — [Illinois State University, ETD 2281](https://ir.library.illinoisstate.edu/etd/2281)
- **Ghana** : Kholinar et Quarcoo (*European Journal of Humour Research* 14(2), 98–125, 29/06/2026) relèvent quatre modes d'humour (verbal, photographies, dessins, mèmes), avec une dominante verbale et l'usage du code-switching et du pidgin. Le son, la musique et le rire ne sont pas analysés dans le résumé. — [EJHR](https://europeanjournalofhumour.org/ejhr/article/view/1016)
- **Musique commerciale sur TikTok** : les comptes professionnels sont limités à la Commercial Music Library dans le choix de sons de l'app, avec l'avertissement « This sound isn't licensed for commercial use ». Sources tierces qui ne s'accordent pas toutes ; la page d'aide officielle n'a pas été lue. — [Soundstripe](https://www.soundstripe.com/blogs/why-can-i-only-use-commercial-sounds-on-tiktok) ; [Social Media Today](https://www.socialmediatoday.com/news/tiktok-changes-rules-on-music-usage-by-businesses/577734/)

### Inferences
- **Palette ouest-africaine à combiner avec la palette cartoon** (proposition de création, pas une copie) :
  - le **tchip** comme ponctuation de mépris ou d'agacement, l'équivalent local du « pfff » ou du trombone triste ;
  - l'**atalaku** comme sting vocal qui commente la chute (« Eh ! Mon frère… ») ;
  - l'ambiance **maquis** comme fond (musique forte, brouhaha) qui se coupe net sur la chute : scratch de disque version « le DJ coupe le son » ;
  - les **interjections nouchi** à la place des « oh no » anglo-saxons.

  Critère d'acceptation : test A/B sur la chaîne, avec palette ivoirienne contre palette cartoon générique, en comparant la rétention aux 3 premières secondes et le taux de vision complète.
- Le tchip est un bruit de bouche que Piper TTS ne produit pas. Deux voies, à évaluer à l'écoute :
  - l'enregistrer nous-mêmes, ou le trouver sous CC0 ;
  - le synthétiser par une courte rafale de bruit filtré de type « clic de succion » avec ZzFX ou Tone.js.
- Les sons viraux réels (extraits de chansons, rires de personnalités) sont protégés. Pour une chaîne qui monétise, il faut des **équivalents originaux** : motifs coupé-décalé générés par ACE-Step 1.5 ou Tone.js, voix d'ambianceur synthétique. Ils reprennent la fonction de ces sons sans en reprendre l'enregistrement.

### Gaps
- Aucun article de fond ni aucune étude n'analyse spécifiquement l'usage du son (bruitages, rires, sons viraux) chez les humoristes ivoiriens. Les sources sont des pages TikTok et des portraits de médias de divertissement.
- Aucune liste vérifiée d'interjections ou de sons viraux ivoiriens de 2026 avec leurs chiffres.
- Rien n'a été trouvé sur les rires enregistrés ou les rires de public dans les sketchs ivoiriens. Rien non plus sur les choix sonores d'Afrikatoon : non recherché, hors périmètre.
- La page officielle de TikTok sur la Commercial Music Library n'a pas été consultée directement.
