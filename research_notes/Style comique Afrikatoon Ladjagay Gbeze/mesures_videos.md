# Vidéos de référence vues et mesurées : Afrikatoon, Ladjagaï, Gbeze et 3D fluide (16/10/2026)

> **Méthode.** Chaque chiffre vient de nos propres outils, appliqués aux vidéos publiques téléchargées en basse définition pour la seule mesure, dans le scratchpad (jamais dans le dépôt) :
> - `workbench/scripts/blenderfilm/measure.ts` : le même code que pour les 12 TikTok de la chaîne ;
> - `fluidite/mesure2.py` ;
> - un nouvel outil, `references-video/outils/grammaire_plans.py` (OpenCV + numpy) ;
> - `workbench/scripts/voice-study.py` (faster-whisper MIT, VAD Silero MIT).
>
> Les vidéos de la chaîne ont été remesurées avec les mêmes outils. Une valeur notée **« visuel »** a été comptée à l'œil sur les planches-contact ; elle est approximative. Durées converties à **30 i/s** (images à 30 i/s = secondes × 30).
>
> Aucun identifiant, cookie ni compte n'a été utilisé. Aucune transcription n'est recopiée ici.

---

## 0. En bref (ce qui change pour le moteur)

1. **On coupe 1,6 à 1,9 fois plus que la chaîne.**
   - Plans par minute de contenu, en médiane : Afrikatoon **23,6**, 3D **20,4**. Chaîne : **12,9**.
   - Plan médian : Afrikatoon **2,76 s (83 i)**, 3D **2,40 s (72 i)**.
   - Les plans de la chaîne ont des **longueurs fixes** : 9,2 s, 5,2 s, ouverture de 10,1 s, plus des cartons émoji de 2,9 s. Ces quatre longueurs couvrent **53 % du temps**. On coupe donc à la longueur du clip, pas sur le jeu.
2. **La chute est courte et vient tard.**
   - Réplique de chute : **1,14 à 1,24 s** chez Ladjagaï et Afrikatoon, contre **2,42 s** sur la chaîne.
   - Silence avant la chute : **0,31 à 0,33 s (9 à 10 i)**, identique à la chaîne.
   - Ladjagaï place sa dernière réplique entre **95 et 98 %** du contenu.
3. **Gros plans sur les réactions.**
   - Dans les références, au moins 2/3 des plans d'Afrikatoon sont des plans rapprochés ou gros plans (visuel). Les plans à deux servent au dialogue. Le très gros plan est réservé à l'impact.
   - La chaîne montre surtout des plans larges de groupe (visuel).
4. **L'« explosif » 2D tient sur trois procédés mesurés :**
   - **poses tenues** : 11 à 14 arrêts de 0,5 s ou plus par épisode Ladjagaï de 2022, médiane 0,58 s (17 i) ;
   - **poses claquées** en action : 0,17 à 0,5 s par pose (5 à 15 i) ;
   - **punch par coupe** : même dessin recadré ×1,32 puis ×1,15, par pas de 0,46 à 0,5 s (14 à 15 i).
5. **Le « fluide » 3D, mesuré :**
   - **24 images uniques/s** : 100 % des dessins changent à chaque image (animation « en 1 ») ;
   - **45 à 52 %** de l'image bouge (chaîne : 21,5 à 24 %) ;
   - le personnage bouge **3,4 fois plus** que sur la chaîne (2,48 contre 0,74 px/i) ;
   - **0,44 saute/s** (chaîne : 1,82) ;
   - la caméra bouge pendant 68 % du temps (médiane), à environ 0,55 % de la largeur par image (à 30 i/s).

---

## 1. Ce que les plateformes ont permis (16/10/2026)

| Plateforme | Résultat sans connexion |
|---|---|
| **YouTube** | La recherche de métadonnées (`ytsearch15`) fonctionne. Le **téléchargement des vidéos est refusé** : « Sign in to confirm you're not a bot » et HTTP 429, avec tous les clients essayés (tv_simply, web_safari, mweb, android_vr, web_embedded, tv). Restent seulement les **storyboards** (vignettes 160×90, 1 image par 1 à 2 s). On s'en sert pour voir la structure (§ 6), sans mesure de mouvement. |
| **TikTok** | Pages publiques listées pour @afrikatoon, @minions et @pixar. Liste refusée (réponse vide) pour @ladjagai.officiel, @gbeze.officiel, @sheddianime et @dreamworks. Chaque vidéo publique se télécharge par son URL. |
| **Instagram** | Bloqué. L'extracteur `instagram:user` de yt-dlp est marqué « broken » : « Unable to extract data » sans connexion. Abandonné. |
| **Dailymotion** | L'API publique de recherche et les téléchargements fonctionnent : ce sont des copies **officielles** déposées par Afrika Toon et Ratelcaz Production (vues faibles sur Dailymotion, voir § 2.3 pour YouTube). |

**Gbeze, l'ambiguïté.** Aucun dessin animé « Gbeze » n'a été trouvé, ni sur YouTube, ni sur TikTok, ni par recherche web. Trois pistes :
- La chaîne YouTube **@Gbeze** (gbeze.com) se décrit ainsi : « nos zappings et autres vidéos drôles ». Elle compte 124 abonnés et 2 vidéos de 2017 : une sélection hebdomadaire de **caricatures et BD ivoiriennes** et la bande-annonce d'une BD. C'est elle qui correspond aux « caricatures et mèmes (façon Gbeze) » déjà cités dans `server/jev/studio/humor.ts`.
- Homonymes écartés : Gbèzé Zèguèzougou (musique traditionnelle béninoise, pas d'animation) et le compte TikTok @gbeze.officiel (artiste, liste des vidéos refusée).
- **À confirmer par l'utilisateur** : le compte TikTok ou Instagram exact qu'il appelle « Gbeze ».

---

## 2. Les vidéos

### 2.1 Mesurées (13 vidéos complètes)

| Code | Créateur | Titre | Chaîne / compte | URL | Durée | Vues au 16/10/2026 | Date |
|---|---|---|---|---|---|---|---|
| A1 | Afrikatoon | Un cure-dent – La blague du jour | Afrika Toon | https://www.dailymotion.com/video/x7slnts | 37,8 s | 273 (Dailymotion) | 2020-03-12 |
| A2 | Afrikatoon | La Radio – La blague du jour | Afrika Toon | https://www.dailymotion.com/video/x8o8v77 | 34,0 s | 185 (Dailymotion) | 2023-09-22 |
| A3 | Afrikatoon | Sucré Salé EP1 / La blague du jour | AFRIKATOON OFFICIEL (@afrikatoon) | https://www.tiktok.com/@afrikatoon/video/7663550298455100689 | 13,8 s | 44 400 | 2026-07-17 |
| A4 | Afrikatoon | COLLEGE GNANGNAN EP2 | AFRIKATOON OFFICIEL (@afrikatoon) | https://www.tiktok.com/@afrikatoon/video/7667635250024942869 | 16,9 s | 38 200 | 2026-07-28 |
| L1 | Ladjagaï | Ladjagai épisode 1 « Dis ton prix » | Ratelcaz Production | https://www.dailymotion.com/video/x8a9r38 | 75,6 s | 197 (Dailymotion) | 2022-04-23 |
| L2 | Ladjagaï | Ladjagai ep2 « Elle a rappelé hein ! » | Ratelcaz Production | https://www.dailymotion.com/video/x8a9r4y | 93,9 s | 191 (Dailymotion) | 2022-04-23 |
| L3 | Ladjagaï | Ladjagai ep3 « Tu vas parler aujourd'hui ! » | Ratelcaz Production | https://www.dailymotion.com/video/x8a9r6b | 82,1 s | 198 (Dailymotion) | 2022-04-23 |
| L4 | Ladjagaï | LADJAGAI Saison 9 Épisode 1 « Yé fais pas de favoritisme » | LADJAGAÏ OFFICIEL (@ladjagai.officiel, se déclare « compte fan ») | https://www.tiktok.com/@ladjagai.officiel/video/7440781974647672096 | 60,8 s | 3 100 000 | 2024-11-24 |
| D1 | 3D | Any chair but THAT one! (Toy Story 5, scène) | Pixar | https://www.tiktok.com/@pixar/video/7686212041547271438 | 44,1 s | 31 200 | 2026-09-25 |
| D2 | 3D | stole the moon and our hearts (montage Moi, moche et méchant) | Illumination's Minions | https://www.tiktok.com/@minions/video/7686229393743547661 | 49,5 s | 1 800 000 | 2026-09-16 |
| D3 | 3D | can hardly remember life before minions (mème) | Illumination's Minions | https://www.tiktok.com/@minions/video/7690687312996453645 | 32,1 s | 1 400 000 | 2026-09-28 |
| D4 | 3D | might have to take the L on that one (Monstres & Cie, mème compteur) | Pixar | https://www.tiktok.com/@pixar/video/7692223244413275405 | 32,8 s | 111 300 | 2026-10-03 |
| D5 | 3D | papoy? ahhh, papoy! (scène) | Illumination's Minions | https://www.tiktok.com/@minions/video/7695860646008671502 | 29,4 s | 325 300 | 2026-10-12 |

Écartés après visionnage :
- @pixar 7688390166477557006 : publicité de jeu Fortnite × Toy Story, ce n'est pas de l'animation comique ;
- @minions 7673933630044933390 : diaporama photo, sans vidéo.

### 2.2 Vues par storyboard YouTube seulement (vidéo refusée)

| Code | Titre | Chaîne | URL | Durée | Vues | Date |
|---|---|---|---|---|---|---|
| G1 | AFRO CARI 1 (« La sélection de caricatures de la semaine par gbeze.com ») | Gbeze (@Gbeze) | https://www.youtube.com/watch?v=ZP4OPwhYI_U | 125 s | 806 | 2017-05-04 |
| G2 | Harcèlement tome 1 (bande-annonce de BD) | Gbeze (@Gbeze) | https://www.youtube.com/watch?v=E3eZRmF8glg | 57 s | 317 | 2017-05-04 |

### 2.3 Trouvées sur YouTube, non téléchargeables

Métadonnées de la recherche ; la date n'est pas fournie par la recherche à plat.

| Chaîne | Titre | Durée | Vues |
|---|---|---|---|
| Afrika Toon | COCONUL | 300 s | 52 481 304 |
| Afrika Toon | L'interdiction – La blague du jour | 34 s | 666 051 |
| Afrika Toon | LA BLAGUE DU JOUR – COMPILE #5 | 297 s | 10 829 161 |
| Afrika Toon | THE CRAZY ONES / Episode 25 | 78 s | 59 000 |
| Ratelcaz production | Ladjagaï s8 ep1 GODZILLA | 133 s | 1 868 932 |
| Ratelcaz production | Ladjagaï S4 Ep12 Le Combat | 101 s | 1 073 421 |
| Ratelcaz production | ladjagaï S12 ep04 le tank | 138 s | 254 832 |
| SheddiAnime | SAVAGE MUM Complation (1-10), mère africaine | 410 s | 16 845 700 |
| SheddiAnime | SAVAGE MUM 1 | 35 s | 209 360 |
| Mazzara Studio | YA MUKOLO (dessin animé congolais) | 280 s | 37 459 661 |

Les épisodes YouTube récents d'Afrika Toon durent 54 à 78 s. Les versions TikTok (A3, A4) en sont des extraits de 13,8 à 16,9 s.

---

## 3. Mesures

« Contenu » = la vidéo sans logo, carton-titre, générique ni carton de fin. Les bornes ont été relevées sur les planches (fenêtres dans `outils/synthese.py`).

### 3.1 Grammaire des plans (`grammaire_plans.py`, sur le contenu)

| Vidéo | Contenu (s) | Plans | Plans/min | Plan méd. (s) | 1er plan (s) | Plan final (s) | Caméra fixe / pano / zoom / trembl. (% du temps) | Zoom punch : dans le plan + à la coupe | Arrêts ≥ 0,5 s (nb ; s) | Images uniques/s | Dessin tenu 1 / 2 / ≥ 3 images | Poses claquées/min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 22,9 | 13 | 34,0 | 1,38 | 1,54 | 2,21 | 100 / 0 / 0 / 0 | 0 + 2 (×0,54) | 0 | 23,2 | 0,98 / 0,02 / 0,00 | 3,2 |
| A2 | 18,3 | 4 | 13,1 | 4,14 | 1,25 | 4,54 | 100 / 0 / 0 / 0 | 0 + 0 | 3 ; 5,5 | 16,0 | 0,88 / 0,02 / 0,10 | 0 |
| A3 | 13,8 | 9 | 39,1 | 0,64 | 0,16 | 0,08 | 57 / 43 / 0 / 0 | 0 + 1 | 3 ; 2,4 | 23,1 | 0,96 / 0,03 / 0,01 | 0 |
| A4 | 14,8 | 3 | 12,2 | 5,11 | 5,11 | 6,84 | 65 / 35 / 0 / 0 | 0 + 0 | 1 ; 0,5 | 15,5 | 0,68 / 0,17 / 0,15 | 0 |
| L1 | 60,9 | 17 | 16,7 | 0,58 | 4,75 | 13,97 | 74 / 0 / 25 / 1 | 0 + 6 | 13 ; 10,0 | 9,2 | 0,25 / 0,30 / 0,45 | 7,9 |
| L2 | 75,2 | 22 | 17,6 | 1,25 | 10,55 | 17,14 | 94 / 0 / 6 / 0 | 0 + 6 | 14 ; 11,0 | 9,2 | 0,27 / 0,30 / 0,43 | 4,5 |
| L3 | 63,8 | 33 | 31,1 | 0,50 | 4,71 | 3,34 | 63 / 0 / 37 / 0 | 0 + 5 | 11 ; 7,8 | 9,1 | 0,28 / 0,31 / 0,41 | 10,2 |
| L4 | 45,7 | 48* | 63,0* | 0,74* | 0,74 | 0,33 | 99 / 1 / 0 / 0 | 0 + 2 | 4 ; 2,3 | 21,2 | 0,79 / 0,15 / 0,06 | 9,9 |
| D1 | 41,0 | 13 | 19,0 | 3,04 | 5,63 | 4,05 | 62 / 38 / 0 / 0 | 0 + 0 | 0 | 22,9 | 0,98 / 0,01 / 0,01 | 4,1 |
| D2 | 49,5 | 9 | 10,9 | 3,17 | 2,21 | 2,84 | 20 / 77 / 2 / 0 | 3 + 1 | 0 | 24,0 | 1,00 / 0 / 0 | 0 |
| D3 | 32,1 | 20 | 37,4 | 1,44 | 0,71 | 2,25 | 32 / 44 / 24 / 0 | 1 + 3 | 4 ; 3,0 | 24,0 | 1,00 / 0 / 0 | 1,9 |
| D4 | 32,8 | 19 | 34,7 | 0,83 | 0,83 | 1,37 | 56 / 18 / 0 / 26 | 0 + 0 | 2 ; 2,9 | 23,3 | 0,99 / 0,00 / 0,01 | 7,3 |
| D5 | 29,4 | 10 | 20,4 | 2,40 | 3,67 | 2,42 | 0 / 82 / 18 / 0 | 2 + 0 | 0 | 23,9 | 1,00 / 0 / 0 | 2,0 |

\* L4 : les sous-titres affichés **un mot à la fois** font passer des changements de mot pour des coupes. Sur les planches, on compte **environ 30 vrais plans** (visuel), soit environ 40 par minute.

**Ladjagaï, sans les intermèdes « logo »** (§ 5) :

| Épisode | Plans par minute | Plan médian | p25 – p75 |
|---|---|---|---|
| L1 | 8,5 | 4,39 s (132 i) | 3,5 – 11,3 s |
| L2 | 11,0 | 3,63 s (109 i) | 1,6 – 9,0 s |
| L3 | 26,5 | 0,75 s | – |
| L4 | 60,7 | 0,77 s | – |

Pour L3, la bagarre en poses claquées est encore comptée en partie comme des plans.

### 3.2 Même code que pour la chaîne : `measure.ts` (vidéo entière) et `mesure2.py`

| Vidéo | measure.ts : plans/min | plan méd. (s) | motion | coverage (part qui bouge) | figé (s) | scintillement | mesure2 : caméra px/i | jeu vivant % | jeu px/i | sautes/s | régularité |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | 23,7 | 1,42 | 0,0178 | 0,23 | 2,8 | 0,0056 | 0,49 | 31,0 | 0,47 | 0,34 | 0,61 |
| A2 | 10,6 | 7,67 | 0,0118 | 0,11 | 15,8 | 0,0035 | 0,01 | 2,0 | 0,04 | 1,50 | 0,68 |
| A3 | 30,4 | 2,00 | 0,0138 | 0,23 | 3,2 | 0,0007 | 0,25 | 15,1 | 0,22 | 1,38 | 0,93 |
| A4 | 14,2 | 5,08 | 0,0230 | 0,22 | 6,8 | 0,0025 | 0,00 | 0,7 | 0,04 | 1,72 | 1,62 |
| L1 | 18,4 | 2,00 | 0,0086 | 0,06 | 41,0 | 0,0077 | † | † | † | 0,97 | 1,72 |
| L2 | 21,6 | 1,92 | 0,0065 | 0,06 | 34,2 | 0,0044 | † | † | † | 0,75 | 1,59 |
| L3 | 22,4 | 1,67 | 0,0091 | 0,07 | 40,7 | 0,0051 | † | † | † | 0,82 | 2,01 |
| L4 | 42,4 | 0,83 | 0,0078 | 0,07 | 19,4 | 0,0079 | 0,00 | 1,4 | 0,04 | 1,99 | 2,76 |
| D1 | 10,9 | 4,00 | 0,0070 | 0,16 | 10,5 | 0,0002 | 0,77 | 32,0 | 0,74 | 0,43 | 0,35 |
| D2 | 6,1 | 4,25 | 0,0338 | 0,52 | 0 | 0,0096 | 1,78 | 42,6 | 1,38 | 0,10 | 0,33 |
| D3 | 28,1 | 1,75 | 0,0555 | 0,68 | 2,4 | 0,0143 | 1,33 | 69,3 | 2,75 | 0,90 | 0,84 |
| D4 | 25,6 | 2,58 | 0,0329 | 0,46 | 2,9 | 0,0072 | 0,73 | 48,8 | 2,48 | 0,88 | 1,18 |
| D5 | 18,4 | 2,25 | 0,0355 | 0,56 | 0 | 0,0054 | 3,22 | 66,7 | 3,08 | 0,44 | 0,72 |

Limites des deux outils :
- **† `mesure2.py` n'est pas valable sur l'animation tenue « en 2 / en 3 ».** Il déclare une coupe dès qu'une différence dépasse 12 fois la médiane. Quand la plupart des images sont des doublons, chaque nouveau dessin devient une « coupe » (L1 à L3 : 568 à 704 « coupes ») et le jeu tombe à 0. Ses chiffres de jeu ne sont donc pas exploitables pour Ladjagaï, ni pour A2 et A4.
- `measure.ts` ramène tout au format 96×170 vertical : les vidéos horizontales (A1, A2, L1 à L3) y sont écrasées. Le code reste identique, mais la comparaison est imparfaite.
- `measure.ts` lit au plus 75 s.

### 3.3 Médianes par créateur et comparaison avec la chaîne

Pour la chaîne : `tiktok_reference.json` (12 TikTok, `measure.ts`), plus les mêmes 12 vidéos remesurées avec `grammaire_plans.py` et `mesure2.py`.

| Mesure | Afrikatoon (4) | Ladjagaï (4) | 3D fluide (5) | Chaîne (12) |
|---|---|---|---|---|
| Durée du contenu (s) | 16,6 | 62,4 | 32,8 | 63,4 (vidéo entière) |
| Plans par minute de contenu | 23,6 | 24,4 (sans intermèdes : 8,5 à 11 en 2022 ; ≈ 40 visuel en S9) | 20,4 | 12,9 (measure.ts : 11,4) |
| Plan médian (s) | 2,76 (p25 2,02 ; p75 3,90) | 0,66 brut / 3,6 à 4,4 sans intermèdes (L1, L2) | 2,40 (p25 1,73 ; p75 4,05) | 2,92 (p25 2,13 ; p75 6,16) ; measure.ts 5,17 |
| 1er plan, l'accroche (s) | 1,40 | 4,73 | 2,21 | 10,08 |
| Plan final (s) | 3,38 | 8,66 | 2,42 | 2,04 (émoji de fin) |
| Caméra fixe, % du temps | 82 | 84 | 32 | 31 |
| Panoramique / zoom, % du temps | 17 / 0 | 0 / 15 | 44 / 2 | 27 / 38 |
| Zoom punch par vidéo : dans le plan + à la coupe | 0 + 0,5 | 0 + 5,5 | 1 + 0 | 6,5 + 3,0 (surtout des transitions « cube », voir § 4.4) |
| Arrêts ≥ 0,5 s par vidéo ; durée médiane | 2 ; 0,80 s | 12 ; 0,58 s | 0 ; 0,79 s (seulement dans les mèmes) | 1 ; 1,12 s |
| Images uniques/s | 19,6 | 9,2 | 23,9 | 23,6 |
| Dessin tenu 1 / 2 / ≥ 3 images | 0,92 / 0,03 / 0,05 | 0,28 / 0,30 / 0,42 | 1,00 / 0 / 0 | 0,96 / 0,03 / 0,01 |
| Poses claquées par minute | 0 | 8,9 | 2,0 | 1,4 |
| measure.ts motion | 0,0158 | 0,0082 | 0,0338 | 0,0185 |
| measure.ts coverage (part qui bouge) | 0,225 | 0,065 | **0,52** | 0,215 |
| measure.ts figé (s) | 5,0 | 37,5 (titres et génériques compris) | 2,4 | 4,75 |
| measure.ts scintillement | 0,0030 | 0,0064 | 0,0072 | 0,012 |
| mesure2 jeu vivant (%) | 8,6 (A2 et A4 peu fiables, voir †) | † | **48,8** | 19,7 |
| mesure2 jeu (px/i à 288 px) | 0,13 | † | **2,48** | 0,74 |
| mesure2 sautes/s | 1,44 | 0,90 | **0,44** | 1,82 |
| mesure2 régularité du jeu (plus bas = plus lisse) | 0,81 | 1,86 | **0,72** | 1,00 |

### 3.4 Rythme du dialogue (`voice-study.py`, comparé à `tone_reference.json`)

| Mesure | Chaîne (6 vidéos, 12 blagues) | Afrikatoon (4 vidéos, 4 blagues) | Ladjagaï (4 vidéos, 12 blagues) |
|---|---|---|---|
| Tour de parole (s) | 0,26 | 0,74 | 0,25 |
| Silence avant la chute (s), médiane (p75) | 0,31 (0,40) | 0,33 (0,55) | 0,31 (0,44) |
| Durée de la réplique de chute (s) | **2,42** | **1,24** | **1,14** |
| Durée d'une blague (s) | 7,44 | 12,0 | 21,8 |
| Répliques par blague | 3,0 | 4,0 | 11,5 |
| Réplique médiane (s) | 2,49 | 2,36 | 1,60 |
| Répliques par minute | 13,7 | 11,1 (vidéo entière) ; 9,8 à 18,3 sur le contenu | 25,0 ; 23,5 à 30,2 sur le contenu |
| Part de réactions | 0,16 | 0,11 | 0,05 |
| Questions | 0,29 | 0,10 | 0,31 |
| Dernière réplique, position dans le contenu | – | 54 à 91 % | **95 à 98 %** |
| Temps après la dernière réplique (s) | – | 0,68 à 4,74 | ≤ 0,81 |
| Débit (syllabes/s), par type de voix | homme 5,92 ; femme 4,71 | homme 3,9 ; femme 5,87 ; enfant 4,21 | homme 6,71 ; femme 6,54 ; aigu (« enfant ») 6,28 |

Limites de ces chiffres :
- whisper « small » sur des voix de dessin animé ;
- le découpage des blagues est automatique ;
- Afrikatoon ne compte que 4 blagues : c'est mince.

---

## 4. Ce qu'on voit sur les planches (une image au milieu de chaque plan)

### 4.1 Afrikatoon (2D numérique)

- **Style.** Dessin 2D numérique à trait noir épais et aplats. Décors simples et colorés : maquis, salle de classe, cabinet médical. Personnages ivoiriens caricaturés : ventre, lunettes, coiffures.
- **Format Dailymotion de 2020 à 2023.**
  - Ouverture : logo « Afrika Toon présente » (1,2 s), puis carton « LA BLAGUE DU JOUR / *titre* » (6,8 s). L'habillage prend 8,0 s, soit 21 à 24 % de la vidéo.
  - Contenu de 18 à 23 s, puis générique déroulant (6,8 à 7,7 s).
- **Mise en scène du gag (A1, « Un cure-dent »).**
  - Plan d'ensemble des trois personnages (1,54 s).
  - Champ-contrechamp entre le client (plan rapproché) et le serveur (gros plan, sourire en coin).
  - Réaction du voisin en gros plan.
  - Goutte de sueur du client (gros plan, 1,2 s).
  - Le serveur se cure les dents : gros plans enchaînés, avec deux **coupes dans l'axe ×0,54**, c'est-à-dire un passage du gros plan au plan à deux.
  - Fin sur le **gros plan du rire du serveur (2,21 s)**.
  - Visuel : environ 1 plan large, 3 plans à deux et 9 plans rapprochés ou gros plans sur 13.
- **Format TikTok de 2026 (A3, A4).**
  - Ni logo ni titre au début : on entre directement dans la réplique.
  - Recadrage vertical d'images horizontales : la fenêtre 9:16 **se déplace pour suivre celui qui parle** (A4 : 152 % de la largeur parcourus en 5,1 s).
  - Sous-titres phrase par phrase dans un bandeau rouge.
  - Fin sur le plan de réaction tenu (A4 : main sur la bouche, 6,84 s), puis logo final (2,1 s).

### 4.2 Ladjagaï (encre noir et blanc et un seul bleu, animation très limitée)

- **Style.**
  - Dessin à l'encre, noir et blanc rehaussé d'une seule teinte bleue.
  - Décor récurrent : le kiosque **« Kbine Cel »** sous un parasol, dans un quartier.
  - Personnages très caricaturés : yeux énormes, femmes aux formes exagérées, gros bras à casquette.
- **Mise en scène.**
  - Plans à deux de profil pour le dialogue, en champ-contrechamp, en contre-plongée légère.
  - Gros plan avec **lignes de vitesse** derrière un rire moqueur (L2).
  - **Très gros plan de la gifle avec tremblement de caméra pendant 0,63 s** (L1).
  - Bagarre en **poses claquées** : une dizaine de dessins de 0,17 à 0,5 s en 3,7 s environ (L3).
  - **Plan subjectif du réveil** à l'hôpital, avec un cache en forme de paupières (L3).
- **Épilogue.** Un long plan tenu montre la conséquence : œil au beurre noir, lit d'hôpital, et le « gros bras » qui revient (gag récurrent).
- **Habillage.**
  - Logo du producteur (1,3 s), logo animé (2,6 s), carton-titre manuscrit (1,3 à 1,9 s).
  - En fin : carton « Abonne-toi à la chaîne et partage !!! » ou « À mercredi prochain » (12,6 à 13,0 s).
- **Saison 9 sur TikTok (L4, 3,1 M de vues).**
  - Même univers, recadré en vertical, avec beaucoup plus de **gros plans** (visuel : environ 2/3).
  - Un **mot géant à la fois** au milieu du bas de l'image, et le titre de l'épisode affiché en permanence en haut.
  - Intermède « logo rond » qui grossit, puis carton de fin « Republiez » (15,1 s, soit **25 % de la vidéo**).

### 4.3 3D fluide (Illumination, Pixar)

- **Scènes.**
  - D5 « papoy » : gros plans de Gru, travelling latéral le long de la file de Minions, Agnès en gros plan, presque toujours une caméra qui bouge.
  - D1, Toy Story 5 : scène de nuit, champ-contrechamp entre le groupe (plan moyen) et Jessie (plan rapproché), avec une **accélération des coupes jusqu'au gag** : 5,63 → 4,25 → 2,96 → 1,84 → **0,75 s** (« No, don't sit! »), puis 1,58 s de réaction.
- **Mèmes.**
  - D3 : portes « life before / after Minions » en **3 zooms punch par coupe**, ×1,23, ×1,32 puis ×1,46, toutes les 0,83 s.
  - D4 : compteur qui baisse toutes les 0,83 s sur la même image de Randall (8 pas), puis plans de réaction de 3,6 à 3,8 s.
  - Texte du mème en haut de l'image (« papoy lore », « Randall reacting to… »).
- **Expressions.** Bouches et yeux très ouverts, jeu en continu : les personnages ne s'arrêtent jamais net (0 arrêt de 0,5 s ou plus dans les scènes D1, D2 et D5).

### 4.4 Chaîne de l'utilisateur (12 TikTok, mêmes outils)

- **Images.** Images de style 3D « type Pixar » produites par IA, en **plans larges ou de groupe**.
- **Habillage.** Bande nette au centre et fond flou en haut et en bas. Sous-titres **bilingues mot à mot** en couleur (anglais en haut, français en bas).
- **Montage.**
  - Ouverture longue (10,1 s dans 11 plans sur 181).
  - Clips de **9,2 s** (16 plans, 19 % du temps) ou **5,2 s** (12 plans, 8 %), animés par un **zoom avant lent** (+10 à +24 % sur le plan).
  - Entre les clips, des **cartons émoji de 2,9 s** sur fond noir, avec transitions en cube rotatif (28 plans, 11 % du temps).
  - Fin sur un émoji qui rit (environ 2 s).
- **Zooms punch mesurés.** Les « zooms punch » mesurés sur la chaîne viennent surtout de ces transitions en cube. Il n'y a ni gros plan de réaction ni coupe pendant la réplique.

### 4.5 Gbeze (storyboard YouTube, 1 image toutes les 1 à 2 s)

- **G1, AFRO CARI 1.**
  - Carton rose « LA SÉLECTION DE LA SEMAINE par Gbeze.com » (2 s).
  - Puis **12 bandes dessinées de 2 cases** : à gauche l'installation, à droite la chute, avec bulles et « ?! ».
  - Un **bandeau rose** donne le titre du gag : « tu peux pas insister un peu ?! », « Didier comprends très très vite », « Y a brouteur puis y a vrai bandit », « Un vieux dioula à Paris », « Molière sa mère », « Le voleur n'attend pas les années »…
  - Chaque bande reste **environ 9,8 s** à l'écran (médiane, à 2 s près).
  - Dessin de presse en couleur : rues d'Abidjan, corps caricaturés.
- **G2, Harcèlement tome 1.** Bande-annonce d'une BD : cases réaliste-caricaturales et bandeaux roses en majuscules qui changent toutes les 3,9 à 4,9 s (médiane 3,9 s).
- Aucune mesure de mouvement n'est possible sur un storyboard.

---

## 5. Structure type mesurée (accroche, montée, chute, réaction, fin)

| Temps | Afrikatoon « blague du jour » | Ladjagaï, épisode de 2022 | Ladjagaï S9 sur TikTok | 3D (scène) | Gbeze (bande) |
|---|---|---|---|---|---|
| **Habillage d'ouverture** | 8,0 s sur Dailymotion (21 à 24 %) ; **0 s sur TikTok** | 4,0 à 5,8 s | 0 s (titre permanent en haut) | 0 s | carton de 2 s |
| **Accroche** (1er plan) | plan d'ensemble de 1,25 à 1,54 s (38 à 46 i), ou plan à deux de 5,1 s sur TikTok | plan large du kiosque de 4,7 à 10,6 s, avec zoom lent (−11 % à +7 %) | plan large de 0,74 s, puis gros plans | 0,7 à 5,6 s (médiane 2,2 s) | case 1 |
| **Montée** | champ-contrechamp en plans rapprochés et gros plans, plans de 0,7 à 5,5 s | dialogue en plans à deux de 2,2 à 16,8 s, coupé en 3 ou 4 actes par **2 ou 3 intermèdes « logo »** de 1,33 à 1,50 s (40 à 45 i), placés à 14 %, 40 à 44 % et 75 % du contenu | gros plans de 0,13 à 2,6 s, intermède à 53 % | les coupes s'accélèrent : 5,6 → 4,3 → 3,0 → 1,8 s | – |
| **Chute** | dernière réplique à 54 à 91 % du contenu ; 4 derniers plans de 2,58 → 1,42 → 0,67 → 0,67 s (A1) | réplique de 1,14 s ou geste bref : gifle en très gros plan de 0,63 s avec tremblement, bagarre en poses de 0,17 à 0,5 s | derniers plans de 0,17 à 0,33 s | gag sur un plan de 0,75 s | case 2 et bandeau (≈ 9,8 s par bande) |
| **Réaction** | gros plan tenu de 2,2 à 6,8 s (médiane du plan final 3,38 s, soit 101 i) | épilogue en un plan tenu de **14 à 22 s** ; dernière réplique à 95 à 98 % | – | 1,6 à 2,4 s | – |
| **Fin** | générique de 6,8 à 7,7 s (Dailymotion) ; logo de 2,1 s (TikTok) | carton de 12,6 à 13,0 s | carton « Republiez » de 15,1 s | mention légale de 3,1 s | – |

---

## 6. Grammaire des plans observée

- **Taille de plan selon le temps comique** (visuel) :
  - installation : plan large ou d'ensemble, une seule fois ;
  - dialogue : plans à deux, en champ-contrechamp ;
  - chute et réaction : gros plan sur le visage qui réagit (sueur, yeux exorbités, main sur la bouche) ;
  - impact : très gros plan de 0,63 s (19 i) ;
  - conséquence : plan large tenu (Ladjagaï).
- **Mouvements de caméra.**
  - En 2D : caméra fixe pendant 82 à 84 % du temps. Afrikatoon remplace le mouvement par la **coupe dans l'axe** (×0,54). Ladjagaï utilise des **zooms lents** de 6 à 13 % sur 1,6 à 22 s, plus un **tremblement de 0,63 s** à l'impact.
  - En 3D : caméra fixe seulement 32 % du temps (médiane). Les panoramiques et travellings vont à 0,47 à 1,16 % de la largeur par image à 24 i/s (médiane 0,69 %), soit environ 0,55 %/i à 30 i/s, ou 16,6 % de la largeur par seconde.
- **Zooms punch** (changement d'échelle de 8 % ou plus en 4 images au plus) :
  - Ladjagaï : par coupe sur le logo, ×1,32 puis ×1,15, par pas de 0,46 à 0,50 s (14 à 15 i). Mêmes valeurs dans les 3 épisodes de 2022 ; ×1,18 et ×1,28 en S9.
  - Minions : ×1,23, ×1,32, ×1,46 toutes les 0,83 s (25 i à 30 i/s).
  - Afrikatoon : aucun punch dans le plan.
- **Arrêts sur image** (images quasi identiques pendant 0,5 s ou plus) :
  - Ladjagaï : 43 arrêts sur 4 vidéos, médiane 0,58 s (17 i), p75 0,94 s (28 i), maximum 2,38 s ;
  - Afrikatoon : médiane 0,80 s (24 i) ;
  - 3D : seulement dans les mèmes (médiane 0,79 s) ;
  - chaîne : médiane 1,12 s.
- **Cadence d'animation réelle** (images uniques, hors arrêts) :
  - Ladjagaï : **9,2 dessins/s** sur des sources à 24 i/s, avec 28 % des dessins tenus 1 image, 30 % tenus 2 et 42 % tenus 3 ou plus ;
  - Afrikatoon : 23,2 dessins/s sur A1 (déformations continues), 15,5 à 16 sur A2 et A4 ;
  - 3D : 24/s, 100 % « en 1 » ;
  - chaîne : 23,6/s, à cause du zoom continu et des sous-titres qui changent, pas du jeu.

---

## 7. Ce qui rend la 3D « fluide », d'après les mesures

| Facteur | 3D (médiane) | Chaîne | Rapport |
|---|---|---|---|
| Dessins uniques par seconde | 24/s, 100 % en 1 | 23,6/s, mais surtout du zoom | – |
| Part de l'image qui bouge (coverage, measure.ts) | **0,52** | 0,215 | ×2,4 |
| Jeu vivant (mesure2) | 48,8 % | 19,7 % | ×2,5 |
| Amplitude du jeu (mesure2, px/i) | 2,48 | 0,74 | ×3,4 |
| Sautes par seconde | 0,44 | 1,82 | ÷4,1 |
| Régularité du jeu (plus bas = plus lisse) | 0,72 | 1,00 | −28 % |
| Caméra en mouvement, % du temps | 68 % | 69 %, mais en zoom mécanique et transitions | – |
| Arrêts de 0,5 s ou plus dans les scènes | 0 | 1 par vidéo | – |

**Conclusion des mesures.**
- La fluidité ne vient pas de la cadence : la chaîne a déjà 24 images uniques par seconde.
- Elle vient de la **quantité de jeu des personnages** : deux fois plus d'image qui bouge, un mouvement 3,4 fois plus ample, 4 fois moins de sautes.
- Elle vient aussi d'une **caméra qui accompagne le jeu** (travelling latéral, recadrage) au lieu d'un zoom constant appliqué à un clip.

---

## 8. Règles chiffrées pour le moteur de marionnettes 2D

Le moteur dessine des planches de poses, garde une caméra fixe, coupe entre les plans et rend à 30 i/s.

| # | Paramètre | Valeur à appliquer | D'après |
|---|---|---|---|
| R1 | Durée du contenu | format « blague » : 14 à 23 s (médiane 16,6 s) ; format « épisode » : 60 à 75 s en 3 actes | A1 à A4 ; L1 à L3 |
| R2 | Habillage d'ouverture sur TikTok | 0 s : première réplique dès l'image 0 ; titre éventuel en surimpression permanente | A3, A4, L4 contre 8,0 s sur Dailymotion |
| R3 | Accroche (1er plan) | 38 à 46 i (1,25 à 1,54 s), plan d'ensemble ; ou entrer directement en plan à deux | A1, A2 |
| R4 | Rythme de coupe | 20 à 25 plans par minute ; plan médian 72 à 83 i, p25 51 à 61 i, p75 117 à 122 i ; **jamais de longueur fixe** (la chaîne coupe à 9,2 et 5,2 s) | Afrikatoon, 3D ; § 4.4 |
| R5 | Coupe sur la parole | changer de plan au changement d'interlocuteur (champ-contrechamp), avec un tour de parole de 8 i (Ladjagaï) à 22 i (Afrikatoon) | § 3.4 |
| R6 | Silence avant la chute | 9 à 10 i (0,31 à 0,33 s) ; au plus 13 à 17 i (p75) | § 3.4 |
| R7 | Réplique de chute | 34 à 37 i (1,14 à 1,24 s), soit la moitié de la chaîne (2,42 s) ; à 90 % du contenu ou plus | Ladjagaï, Afrikatoon |
| R8 | Accélération avant la chute | 3 ou 4 derniers plans de 20 à 43 i (0,67 à 1,42 s), puis le plan de réaction | A1 ; D1 (0,75 s sur le gag) |
| R9 | Plan de réaction | gros plan sur celui qui subit, tenu 66 à 101 i (2,2 à 3,4 s) ; sur TikTok, ne pas dépasser 6,8 s (A4) | A1, A2, A4, D1 |
| R10 | Taille de plan selon le temps comique | installation : plan large, une fois ; dialogue : plan à deux ou plan rapproché ; chute : gros plan ; impact : très gros plan de 19 i avec tremblement | § 4.1, 4.2, 6 |
| R11 | Zoom punch par coupe | même pose recadrée ×1,25 à ×1,5, 3 pas au plus, de 14 à 25 i chacun (Ladjagaï ×1,32 puis ×1,15 en 14 à 15 i ; Minions ×1,23 / ×1,32 / ×1,46 en 25 i) ; coupe dans l'axe ×0,54 pour revenir au plan à deux | § 6 |
| R12 | Pose tenue après une réplique ou un geste (style explosif) | 15 à 28 i (médiane 17 i) ; 10 à 13 tenues par minute de contenu (épisodes de 2022), 5 par minute en S9 | Ladjagaï |
| R13 | Action physique | poses claquées de 5 à 15 i chacune (bagarre de L3 : une dizaine de poses de 0,17 à 0,5 s en 3,7 s environ, de 24,7 à 28,4 s) ; sur un épisode entier, 4,5 à 10,2 poses claquées par minute (médiane 8,9) | L1 à L4 |
| R14 | Fluidité (variante « 3D ») | 30 dessins uniques par seconde pendant les gestes ; au moins 45 % de l'image en mouvement (respiration, cheveux, foule, décor qui vit) ; amplitude du jeu multipliée par 3 ; au plus 0,45 saute/s | § 7 |
| R15 | Caméra (moteur à caméra fixe) | garder la caméra fixe environ 80 % du temps (référence 2D) ; zoom lent de 6 à 13 % seulement sur les plans larges d'installation et d'épilogue ; aucun zoom constant sur tous les plans | Ladjagaï, Afrikatoon |
| R16 | Texte à l'écran | soit sous-titre phrase par phrase dans un bandeau (Afrikatoon), soit un mot géant par temps fort (Ladjagaï S9) ; titre de l'épisode en haut | A3, L4 |
| R17 | Fin | logo de 63 i (2,1 s) au plus ; pas de carton de 13 à 15 s (Ladjagaï : 25 % de L4 en temps mort) | A4 ; L1 à L4 |
| R18 | Gag « bande dessinée » façon Gbeze | 2 temps (installation, puis chute) et un bandeau-titre du gag ; environ 9,8 s par gag | G1 |

---

## 9. Ce qui a été innové

**Outils créés et vérifiés sur les planches :**

- **Grammaire des plans** (`grammaire_plans.py`) :
  - la caméra est estimée sur la **couronne de l'image**, pour qu'un gros plan ne passe pas pour un mouvement de caméra ;
  - un **masque des incrustations fixes** (logos, titres) évite les faux appariements ORB ;
  - on distingue les **vraies coupes** des **poses claquées** de l'animation limitée (même cadre, autre dessin) ;
  - les **zooms punch à la coupe** sont repérés par l'échelle ORB et RANSAC ;
  - les transitions progressives sont repérées par l'histogramme à 8 images d'écart ;
  - les doublons sont repérés par le bloc 8×8 le plus différent : un bruit de compression reste sous 2, un vrai changement dépasse 6 ; seuil réglé à 2,5 sur 15 vidéos.
- **Structure à partir des storyboards YouTube** (`storyboard.py`) : on lit la structure d'une vidéo YouTube refusée sans connexion, sans la télécharger.

**Constats nouveaux pour le moteur :**
- La chaîne coupe à des **longueurs fixes de clip** : 53 % du temps est fait de longueurs mécaniques.
- La chute des références est **deux fois plus courte** que celle de la chaîne.
- `mesure2.py` est **invalide sur l'animation tenue**. À corriger : remplacer le seuil de coupe « 12 × la médiane » par la détection de `grammaire_plans.py`.

**Pas encore intégré dans le moteur :** les règles R1 à R18 sont prêtes à devenir des paramètres (`humor.ts`, réglage des plans de `director.py` / `plan.py`).

---

## 10. Fichiers (scratchpad, hors dépôt)

| Contenu | Chemin |
|---|---|
| Téléchargements | `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/references-video/{afrikatoon,ladjagai,anim3d,gbeze}/` |
| Outils | `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/references-video/outils/` (`grammaire_plans.py`, `storyboard.py`, `synthese.py`, `dl.sh`) |
| Mesures | `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/references-video/mesures/` (un JSON par vidéo, `synthese.json`, `measure_ts.jsonl`, `*.m2` ; `chaine/` pour les 12 TikTok de la chaîne) |
| Planches-contact | `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/references-video/planches/` (`chaine/` pour la chaîne, `verif/` pour les vérifications) |
| Rythme du dialogue | `/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/references-video/voix/{afrikatoon,ladjagai}/etude.json` (contient des transcriptions : à garder hors dépôt) |
