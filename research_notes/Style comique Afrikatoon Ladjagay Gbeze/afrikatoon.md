# Style comique AFRIKATOON (Afrika Toon, Abidjan) : ce qui fait rire, comment les plans sont animés, règles mesurables

> Notes de recherche du 16/10/2026. Sources : pages officielles (YouTube, TikTok, afrikatoon.com, Dailymotion), Wikipédia FR, presse.
> La presse parle très peu du format comique : les chiffres de rythme, de cadrage et de voix viennent donc d'une **mesure maison** sur des vidéos publiques.
> Méthode de mesure (voir Q8) : yt-dlp pour les métadonnées et le téléchargement, ffmpeg pour la détection de coupes, l'intensité sonore et les silences,
> OpenCV ORB/RANSAC pour le mouvement caméra, faster-whisper « small » pour la transcription avec horodatage des mots, planches-contacts relues à l'œil.
> Corpus mesuré : 7 sketchs TikTok (2022-2024) et 3 épisodes « La blague du jour » de Dailymotion (2023-2025).
> YouTube a bloqué le téléchargement (« Sign in to confirm you're not a bot »). Les épisodes 2026 ne sont donc analysés que par leurs métadonnées, leurs vignettes et leurs images à 25/50/75 %.
> Conventions : « ≈ » = approximation ; [date approx.] = date déduite par yt-dlp de « il y a N ans », mois imprécis.

---

## Q1. Qui est Afrikatoon ? (fondateurs, histoire, séries, plateformes, audiences datées)

### Takeaway
Afrika Toon / Afrikatoon est un studio d'animation 2D/3D d'Abidjan, fondé en 2005 par des dessinateurs de l'hebdomadaire satirique *Gbich !*. Sa notoriété grand public vient surtout de « La blague du jour » : des sketchs 2D très courts, publiés sans interruption depuis 2011. Au 16/10/2026, sa chaîne YouTube compte 1,96 M d'abonnés et 451 M de vues, et son compte TikTok 1,2 M d'abonnés.
En 2026, le format a évolué en cinq mini-séries hebdomadaires d'environ 1 min (Au Labo, Collège Gnangnan, Les Piqués, Sucré Salé, Gbairai chez Dodo) et en une plateforme payante, AFRIKATOON +.

### Cited Findings
**Identité, histoire**
- Studio fondé en 2005 à Abidjan par des dessinateurs du satirique *Gbich !* : Lassane Zohoré (devenu producteur) et Abel Kouamé, dit « Kan Souffle » (réalisateur et directeur artistique, à la tête de la société). — [Wikipédia FR, Afrika Toon](https://fr.wikipedia.org/wiki/Afrika_Toon)
- Premiers travaux : courts métrages de commande (institutions, publicité). Contrat de 22 courts publicitaires 2D de 2 min, « Les Tchatchallo » / « La famille Tchatchallo », pour Côte d'Ivoire Telecom (2007 dans le texte, 2005 dans l'infobox : contradiction interne). « Les blagues 2D » : saison 1 en 2011, saison 2 en 2015. — [Wikipédia FR](https://fr.wikipedia.org/wiki/Afrika_Toon)
- Longs métrages : *Pokou, princesse ashanti* (2013, présenté comme le « premier long métrage d'animation produit en Afrique de l'Ouest »), *Soundiata Keïta, le réveil du lion* (2014/2015), *Wê, l'histoire du masque mendiant* (2016), *Dia Houphouët*, *Ekoua*. Séries : *La Petite Pokou*, *Conte-nous !* (52 × 5 min), *La Bande à Gbich*, *Koka Kitoumbou*. *Le Point* (2015) a surnommé le studio « le Walt Disney ivoirien ». — [Wikipédia FR](https://fr.wikipedia.org/wiki/Afrika_Toon)
- *Koka Kitoumbou* : série 2D/3D de 13 épisodes pour TV5Monde, destinée aux moins de 10 ans. — [Voice of Nigeria](https://von.gov.ng/ivorian-animation-studio-unveils-childrens-series/)
- Filiale ouverte en 2019 à Annecy (Les Papeteries – Image Factory). — [CITIA, 12/12/2019](https://www.citia.org/news:a2563)
- Variety (2025) consacre un article à Abel N'guessan Kouamé sur l'état de l'animation africaine. Article payant, non lu (HTTP 402). Selon un résumé de recherche non vérifié : 5ᵉ saison de *La Petite Pokou*, coproduction TV5Monde « Gbassman », objectif d'un long métrage par an. — [Variety 2025](https://variety.com/2025/film/global/afrika-toon-abel-nguessan-kouames-1236439045/)
- Mars 2023 : Abel Kouamé, interrogé au MICA/FESPACO, parle de l'industrie ivoirienne mais pas du format comique. — [Fraternité Matin, 06/03/2023](https://www.fratmat.info/article/227424/culture/abel-kouame-directeur-de-production-afrika-toon-des-productions-ivoiriennes-sont-montees-en-puissance-)

**Plateformes et audiences (relevées le 16/10/2026)**
- **YouTube @Afrikatoon** (« Afrika Toon ») : 1,96 M d'abonnés, 451 346 282 vues, 4 422 vidéos, active depuis le 1ᵉʳ février 2012. Pays déclaré : France (filiale d'Annecy). La page À propos renvoie vers l'app Android `com.afrikatoon`. — [YouTube, À propos de la chaîne](https://www.youtube.com/@Afrikatoon/about)
- **TikTok @afrikatoon** (« AFRIKATOON OFFICIEL ») : 1,2 M d'abonnés, 4,6 M de « j'aime », 420 vidéos. Bio : afrikatoon.com ; compte non certifié, langue fr, créé le 08/10/2020 (horodatage du profil). — [TikTok @afrikatoon](https://www.tiktok.com/@afrikatoon)
- **Dailymotion** : 861 vidéos listées, dernière mise en ligne le 08/01/2025 (« LA PRIÈRE - La blague du jour »), quelques centaines de vues chacune. — [Dailymotion afrikatoon](https://www.dailymotion.com/afrikatoon)
- **AFRIKATOON +** (afrikatoon.com, 2026) : plateforme de streaming payante (abonnement ou paiement à l'acte, « Pay-Per-View… 1 Month »). On y trouve le long métrage *GBON* (2026, 1 h 13), *Dia Houphouët original* (1 h 29), les comptines « Afrika Comptine », des versions anglaises (« The joke of the day ») et les séries comiques. — [afrikatoon.com](https://afrikatoon.com/), [À propos](https://afrikatoon.com/about-us/)
- **Facebook / Instagram** : le compte Facebook (facebook.com/afrikatoon) existe mais exige une connexion, donc aucun chiffre relevé. — [Facebook](https://www.facebook.com/afrikatoon/)

**Séries comiques 2026 : synopsis officiels (afrikatoon.com)**
- **LES PIQUÉS** : « Boukyss et son complice, un mystérieux milliardaire de 35 ans… au chômage », toujours à la recherche de richesse ; « entre combines, ambition et situations absurdes ». — [afrikatoon.com/tvshows/les-piques](https://afrikatoon.com/tvshows/les-piques) ; fiches [Boukyss](https://afrikatoon.com/persons/boukyss) et [Le Milliardaire](https://afrikatoon.com/persons/le-milliardaire), ce dernier « intelligent, élégant et parfois imprévisible ».
- **COLLÈGE GNANGNAN** : « DAGO et PETIT SERY sont deux élèves stars du Collège Gnangnan. Loin d'être brillants, ils trouvent comment passer inaperçus aux yeux de leurs professeurs ». Dago « trouve presque toujours une solution… ou une bonne excuse ! ». — [tvshows/college-gnangnan](https://afrikatoon.com/tvshows/college-gnangnan), [Dago](https://afrikatoon.com/persons/dago-college-gnangnan), [Petit Sery](https://afrikatoon.com/persons/petit-sery-college-gnangnan)
- **AU LABO** : « HERVÉ et PETIT PIMENT sont deux laveurs d'automobile qui doivent gérer les humeurs de certains clients », dont LAETICIA, « jeune fille prétentieuse, vantarde », secrètement « amoureuse de HERVÉ ». — [tvshows/au-labo](https://afrikatoon.com/tvshows/au-labo)
- **SUCRÉ SALÉ – JOE LE VIGILE** : Joe, fils du directeur de la confiserie Souko, est puni après une bêtise et doit travailler comme vigile dans l'entreprise familiale : « responsabilités, maladresses et situations hilarantes ». — [tvshows/sucre-sale](https://afrikatoon.com/tvshows/sucre-sale)
- **GBAIRAI CHEZ DODO** : à « Gbairai City », le salon de coiffure de Dodo est « le véritable QG du quartier ». Dodo, Nado et Audrey sont « au cœur de tous les Gbairai » ; « tout le monde passe… et presque rien ne reste secret ! ». — [tvshows/gbairai-chez-dodo](https://afrikatoon.com/tvshows/gbairai-chez-dodo)
- Autres formats comiques sur YouTube : « Goumin Goumin Club » (numéros 120 à 157 en 2025-2026), « Les Sorcières » (saison 9 en 2026 ; en 2023 « Les Sorcières Intégral (Les 3 Petits Génies) » ; collaboration « Afrikatoon x Ratelkaz » en 06/2026), « Chez Mano » (compilation saison 2, 2026), compilations « 5 blagues ». — [YouTube @Afrikatoon/videos](https://www.youtube.com/@Afrikatoon/videos)

### Inferences
- La filiation *Gbich !* (presse satirique ivoirienne) explique l'ADN : la caricature de types sociaux d'Abidjan (le débrouillard, le patron, l'élève roublard, la commère, le faux riche), plutôt que l'aventure.
- En 2026, la stratégie déplace « La blague du jour » d'histoires isolées vers des **duos récurrents** reconnaissables, pour fidéliser le public et alimenter la plateforme payante AFRIKATOON +.

### Gaps
- Aucun abonné ni aucune vue Facebook/Instagram : pages derrière une connexion.
- Article Variety 2025 non lu (payant) ; aucune interview trouvée sur la méthode d'écriture de « La blague du jour ».
- Courbe d'abonnés dans le temps non trouvée (Social Blade non consulté, budget de recherche épuisé).

---

## Q2. Qu'est-ce qui fait rire ? Mécaniques comiques et gags récurrents (priorité de l'utilisateur)

### Takeaway
Le rire Afrikatoon repose sur **un seul retournement verbal par sketch**, ancré dans une réalité ivoirienne immédiatement reconnaissable : l'argent qui manque, le transport, la police, le « bip » téléphonique, le brouteur, la Tabaski, l'école, le couple. Le sketch se termine sur la **réaction figée** du personnage « normal », que la caméra tient 2 à 4,5 s avant le logo.
Les mécaniques dominantes : la prise au pied de la lettre (jeu de mots sur l'argot ou une expression), la logique absurde qui se contredit elle-même, l'ironie dramatique (le spectateur sait, le personnage cache) et la superstition détournée.

### Cited Findings
**Exemples transcrits et vus image par image** (transcription automatique, puis texte reconstitué à partir des planches ; les mots incertains sont marqués « ? »)
- **LE CAUCHEMAR** (TikTok, 17/12/2024, 24 s ; 2,4 M vues, 116,3 k j'aime, 1 232 commentaires, 3 923 partages). Couple au lit, la nuit.
  - Le mari : « J'ai rêvé que j'étais dans un avion qui a fait un crash. Je crois que la mort m'a bipé. »
  - La femme, d'abord un rire « Ah ah ah ! », puis : « …Tiens, j'ai suffisamment d'unités dans mon téléphone. Appelle-la et laisse-moi dormir. »
  - Le mari, gros plan avec goutte de sueur : « J'ai peur… » (?).
  - Mécanique : métaphore prise au pied de la lettre, appuyée sur l'usage local du « bip » (appel manqué volontaire). Le vrai dénouement, c'est l'indifférence de l'épouse. — [TikTok vidéo 7449454373857398022](https://www.tiktok.com/@afrikatoon/video/7449454373857398022)
- **fils brouteur** (TikTok, 11/10/2022, 17 s ; 154,5 k vues). Un apprenti de *gbaka* (minibus) penché à la portière : « Ah, bon vieux, tu vas où avec [ton chargement]-là comme ça ? ». Le vieux, une botte d'herbe sur la tête : « C'est pour apporter ça à mon fils. Il dit qu'il est devenu brouteur… Chez nous là, c'est le mouton qui broute. Voilà, j'ai envoyé un peu d'herbe pour lui. » Réaction de l'apprenti : main sur le visage, bouche ouverte. Jeu de mots sur *brouteur*, mot ivoirien pour un escroc en ligne. — [TikTok 7153300594126589190](https://www.tiktok.com/@afrikatoon/video/7153300594126589190) ; le sens ivoirien de *brouteur* (escroc sur Internet) est donné par le [Larousse](https://www.larousse.fr/dictionnaires/francais/brouteur/188499) (définition vue dans un extrait de recherche) et entré au Petit Robert 2023 ([Connexion France](https://connexionfrance.com/magazine/la-go-brouteur-do-you-know-these-french-words-in-petit-robert-2023/167221))
- **L'ARGENT DE TRANSPORT** (TikTok, 15/09/2023, 21 s ; 42 k vues). L'employé, au bureau : « [Patron], je ne viens pas travailler aujourd'hui parce que je n'ai pas l'argent du transport ! » — Le patron : « Ah, mais tu fais quoi ici alors ? » — L'employé : « Comme je n'arrivais pas à vous joindre au téléphone, je me suis déplacé pour venir vous informer. Je retourne comme ça. » Le patron reste figé, yeux exorbités, bouche en « O », pendant ≈ 3,7 s. Logique qui se contredit elle-même. — [TikTok 7279133546025848069](https://www.tiktok.com/@afrikatoon/video/7279133546025848069)
- **LA NOUVELLE MAISON** (TikTok, 18/10/2024, 25 s ; 32,2 k vues). Le premier plan montre un bâtiment marqué « PRISON ». Le détenu, au téléphone : « Allô papa, je me suis enfin trouvé un toit hein ! » — Le père : « Dieu merci, ça va te responsabiliser. Mais tu loues ça à combien ? » — « …Je ne paie pas. » La chute est un gros plan du gardien, yeux ronds, tenu ≈ 4,4 s. Le spectateur sait tout dès la première seconde : l'ironie dramatique fait le gag. — [TikTok 7427181684614892806](https://www.tiktok.com/@afrikatoon/video/7427181684614892806) ; dialogue cité aussi dans un [extrait de recherche TikTok](https://www.tiktok.com/@afrikatoon/video/7427181684614892806)
- **Le chat** (TikTok, 12/07/2024, 15 s ; 396,1 k vues, 21,4 k j'aime ; logo « Copyright AFRIKATOON 2011 », donc un sketch d'archive republié). À l'hôpital, un vieil homme : « Les chats, quand ils fuient la maison, c'est qu'il y aura un décès… Je préfère t'attacher. Là, je te vois toujours et je ne vais pas mourir. » Image : le chat attaché au pied du lit, yeux exorbités, langue pendante. Superstition prise à la lettre et retournée. — [TikTok 7390729523072978181](https://www.tiktok.com/@afrikatoon/video/7390729523072978181)
- **DÉCEMBRE – La blague du jour** (Dailymotion, 27/12/2023, 58 s). Deux amis croisent deux femmes ; l'un se bande les yeux avec un tissu rouge. « Mais mon ami, pourquoi tu bandes tes yeux ? » — « Je ne veux pas que mon argent finisse… » — « C'est toi qui as raison hein ! J'ai oublié qu'en décembre, on ne drague pas femme ! » Thème : l'argent qui fond en fin d'année. — [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l)
- **LA PRIÈRE – La blague du jour** (Dailymotion, 08/01/2025, 45 s). Un homme à genoux, devant le portrait de sa femme défunte, prie pour qu'elle lui « envoie l'argent » depuis le paradis (« Seigneur, pardon, ça fait deux mois que je n'ai pas mangé »). Coupe vers la femme en ange sur un nuage, puis retour au portrait. — [Dailymotion x9bzs20](https://www.dailymotion.com/video/x9bzs20)
- **LE TRICHEUR** (TikTok, 26/11/2024, 25 s ; 140,6 k vues). En classe, drapeau ivoirien au mur, un élève triche par signes. Chute : « Monsieur, je vais changer de place, il m'embrouille ! » — [TikTok 7441665514511945016](https://www.tiktok.com/@afrikatoon/video/7441665514511945016)

**Les thèmes qui reviennent, d'après les titres** (chaîne YouTube et TikTok)
- **Argent** : L'ARGENT DE LOYER, L'ARGENT DE FÊTE, CHERTÉ DE LA VIE, LA LOTERIE, L'HÉRITAGE, LE TRANSFERT AU VILLAGE, L'argent de transport, Décembre.
- **Couple et séduction** : LA TRESSE, LA GROSSESSE, LA RUPTURE, LA DRAGUE, LA MAÎTRESSE, VILAINE FEMME, L'INFIDÉLITÉ, LA TRAHISON, LA PREUVE D'AMOUR, Nouvelle femme ; « Goumin Goumin Club » (mot nouchi pour un chagrin d'amour profond).
- **Travail** : LE SECRÉTAIRE, LE PLOMBIER, L'huissier, « 2 heures avec la patronne ».
- **École** : LE TRICHEUR, « Les résultats du bac », Collège Gnangnan.
- **Religion et fêtes** : LA PRIÈRE, El hadji, « La Tabaski », « Tremblement de terre après la Tabaski ! 💥🐏 ».
- **Police** : LE POLICIER, LA NOUVELLE MAISON.
- **Santé** : TOMBE PAS MALADE, Le chat.
- **Famille** : La petite sœur, « PAPA A MANGÉ TATA », LA RESSEMBLANCE.
- Sources : [YouTube Shorts @Afrikatoon](https://www.youtube.com/@Afrikatoon/shorts), [YouTube vidéos](https://www.youtube.com/@Afrikatoon/videos) ; sens de *goumin* : [Sherpas, « Dico des parents : goumin », 26/12/2025](https://sherpas.com/blog/parents/a/goumin-definition/)

**Archétypes des séries 2026** (synopsis officiels, Q1)
- Un duo de ratés aux combines (Boukyss et le « milliardaire au chômage »).
- Un duo d'élèves roublards face au directeur (Dago et Petit Sery).
- Deux laveurs de voitures et une cliente prétentieuse secrètement amoureuse.
- Un fils gâté puni, devenu vigile.
- Le salon de coiffure comme centrale à « gbairai ».
- Le synopsis promet des « situations aussi absurdes que hilarantes ». — [Les Piqués](https://afrikatoon.com/tvshows/les-piques), [Collège Gnangnan](https://afrikatoon.com/tvshows/college-gnangnan), [Au Labo](https://afrikatoon.com/tvshows/au-labo), [Sucré Salé](https://afrikatoon.com/tvshows/sucre-sale), [Gbairai chez Dodo](https://afrikatoon.com/tvshows/gbairai-chez-dodo)

### Inferences
**La recette du gag Afrikatoon, déduite des 10 sketchs analysés**
1. **Situation reconnaissable en moins de 2 s**, posée par un plan large de décor typique : gbaka, bureau, classe avec drapeau, prison, hôpital, lit conjugal.
2. **Une à deux répliques de mise en place** : une question naïve ou un aveu.
3. **Une réplique-chute qui retourne le sens**, avec l'une de ces quatre mécaniques :
   - (a) le sens propre d'un mot d'argot ou d'une expression (brouteur, bipé, « trouvé un toit ») ;
   - (b) la logique absurde qui se contredit elle-même ;
   - (c) l'ironie dramatique montrée d'emblée par le décor ;
   - (d) une croyance ou une norme sociale poussée jusqu'au bout (chat, décembre, prière).
4. **Plan de réaction muet et figé** du personnage normal, puis le logo.
- La chute est presque toujours **verbale**. Le dessin sert la lisibilité, puis le visage de réaction (yeux exorbités, bouche en « O », goutte de sueur, main sur le front). Le comique de geste (slapstick) est secondaire : seul *Le chat* (2011) repose sur un gag visuel.
- Le couple, l'argent et l'autorité (patron, police, prof, directeur) fournissent la majorité des titres. **Pour Maman Nounou et Modou**, les sketchs parent-enfant transposables sont : le fils qui se vante d'un « toit » qui est une prison, le père naïf qui prend « brouteur » au pied de la lettre, l'employé qui se déplace pour dire qu'il ne peut pas se déplacer.

### Gaps
- Pas d'accès aux commentaires des vidéos les plus vues, pour savoir quelle réplique les gens citent.
- Le contenu exact de COCONUL (52 M vues), de LA TRESSE (2,9 M) et de LA GROSSESSE (1,3 M) n'a pas été vu : téléchargement YouTube bloqué ; seules les vignettes sont accessibles.
- Aucune source écrite (presse, interview) n'explique la méthode d'écriture des gags.

---

## Q3. Jeu d'acteur animé et montage : comment les plans sont animés (ajout de l'utilisateur)

### Takeaway
La caméra est **fixe la plupart du temps**. Une scène se découpe ainsi :
- un plan large d'installation de 0,8 à 1,6 s, souvent avec un **zoom avant** ;
- puis un **champ-contrechamp en gros plan**, une réplique par plan ;
- puis un **gros plan de réaction tenu, totalement figé**, de 2 à 4,5 s ;
- puis le logo avec un jingle.

Durée moyenne d'un plan ≈ 3,8 s sur TikTok, soit ≈ 13 coupes par minute. Toutes les transitions sont des coupes franches. Le jeu est « cut-out » : le corps reste immobile pendant la réplique, la bouche change toutes les ≈ 3 images, et chaque geste est une courte bouffée de 0,3 à 1,5 s.

### Cited Findings
Toutes les mesures ci-dessous viennent du corpus de Q8 (méthode de Q8), relevées le 16/10/2026.

**Découpage en plans, contenu seul** (sans logo ni générique ; coupes ffmpeg à un score ≥ 0,25, vérifiées sur planches à 2 images/s)

| Sketch (TikTok) | Contenu | Plans | Durée moy. d'un plan | Repères |
|---|---|---|---|---|
| fils brouteur | 16,7 s | 5 | 3,3 s | coupes à 4,96 · 7,56 · 13,5 · 14,68 |
| L'argent de transport | 19,9 s | 5 | 4,0 s | |
| Le chat | 13,9 s | 4 | 3,5 s | |
| Le voleur | 15,6 s | 5 | 3,1 s | |
| La nouvelle maison | 22,7 s | 6 | 3,8 s | |
| Le tricheur | 22,9 s | 5 | 4,6 s | |
| Le cauchemar | 22,2 s | 5 | 4,4 s | |

- **Total TikTok : 35 plans sur 133,8 s**, soit une durée moyenne de plan de **3,8 s**, ≈ **12,6 coupes/min**, et 4 à 6 plans par sketch. — [TikTok @afrikatoon](https://www.tiktok.com/@afrikatoon) (7 vidéos listées en Q8)
- Versions YouTube/Dailymotion en 16:9 :
  - « Décembre » : 12 plans en ≈ 32,6 s, durée moyenne ≈ 2,7 s ;
  - « La prière » : 6 plans en 28,9 s, durée moyenne ≈ 4,8 s, avec un passage par un fondu ou un volet noir vers une scène au paradis (28,4 à 28,6 s). — [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l), [x9bzs20](https://www.dailymotion.com/video/x9bzs20)

**Plan type par temps du gag** (lecture des planches)
- **Installation** : plan large du décor, 0,8 à 1,6 s. Exemples : chambre avec couple au lit (0 à 1,13 s), bureau (0 à 0,84 s), façade « PRISON » (0 à 1,64 s), classe entière (0 à 4,05 s).
- **Dialogue** : gros plan ou plan rapproché poitrine de celui qui parle, en alternance. Exemple : Le cauchemar, gros plan du mari de 5,8 à 10,4 s, puis gros plan de la femme de 10,4 à 19,7 s.
- **Réaction finale** : gros plan sur le visage du personnage normal.
- **Insert d'accessoire** : rare. Exemple : les mains qui nouent le bandeau dans « Décembre » à 17 s.
- Cadrages de « Décembre » : large → gros plan d'un personnage → large sur les deux femmes → gros plan sur une poitrine, puis un fessier (exagération caricaturale) → insert → gros plan → plan à deux → large de passage (dézoom) → plan à deux de réaction des femmes. — [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l)

**Mouvements de caméra** (OpenCV ORB/RANSAC, 12 mesures par seconde, mi-résolution)
- **Zoom avant d'ouverture** :
  - Le cauchemar : ×1,09 entre 0,08 et 1,08 s ;
  - L'argent de transport : ×1,10 entre 0,08 et 0,80 s ;
  - Le tricheur : ≈ ×1,66 entre 0,08 et 1,33 s, un vrai zoom rapide sur l'élève tricheur ;
  - La prière : ×1,21 sur la femme-ange (28,75 à 29,83 s) ;
  - Décembre : dézoom fort ×0,42 sur 2,8 s pour révéler la rue (33,3 à 36,2 s), puis zoom avant ×1,40 en 1,2 s avant la coupe sur les femmes.
- **Panoramiques** : courts (0,3 à 1,7 s) pour suivre un personnage ou passer d'un élève à l'autre. Le tricheur : 8,7 à 12,9 s ; La nouvelle maison : 1,8 à 3,3 s, du gardien au détenu.
- **Part du temps où un mouvement global est détecté** (contenu seul) : 4 %, 5 %, 10 %, 12 %, 13 %, 14 %, 15 %, 27 %, 30 % et 51 % (médiane ≈ 13 %). La caméra est donc fixe ≈ 87 % du temps en médiane. C'est une borne haute du mouvement, car un personnage qui bouge en gros plan peut être compté à tort.
- Aucun tremblement de caméra (shake) ni panoramique éclair (whip pan) observé dans l'échantillon.

**Jeu animé : différences entre images successives**, 24 à 25 images/s
- **Pendant une réplique** : le corps reste immobile. Seule la bouche change, ≈ toutes les 3 images, soit ≈ 8 changements/s. Exemples : L'argent de transport, 9 à 13 s, 8,2 changements/s ; La nouvelle maison, 13 à 16 s, une image sur 3 environ.
- **Gestes** : bouffées de changements continus, image par image, de 0,3 à 1,5 s (pointer du doigt, se lever, lever la main). Exemples : Le tricheur 19,5 à 20,5 s ; Le cauchemar 6,2 à 6,8 s.
- **Réactions tenues** : image strictement fixe, sans clignement ni respiration. L'argent de transport : 16,74 à 19,88 s (≈ 3,1 s) ; Le cauchemar : ≈ 20,4 à 22,1 s ; La nouvelle maison : regard du gardien 18,3 à 22,7 s.
- **Expressions vues** : yeux exorbités à petites pupilles, bouche en « O » rouge, sourcils froncés ou paupières mi-closes pour la suspicion (l'épouse dans Le cauchemar), goutte de sueur (le mari), main sur le front, doigt pointé, mains levées.
- **Entrées et sorties de champ** : on marche à travers un décor fixe (les deux amis puis les deux femmes dans « Décembre », 8 à 10 s et 33 à 37 s). Un personnage peut aussi glisser hors cadre pendant une réplique (L'argent de transport, ≈ 4 à 5,5 s).

**Fin et habillage**
- **TikTok** : le dernier mot précède le logo de 1,4 s, 4,0 s, 2,0 s, 3,5 s, 4,5 s et 1,0 s ; dans Le cauchemar, la voix déborde même sur le logo. Le logo animé « AFRIKA TOON » sur fond noir (« ©Afrikatoon 2024, www.afrikatoon.com ») dure 0,9 à 2,1 s.
- **YouTube/Dailymotion 2023-2025** : logo muet 1,2 s, puis carton blanc « LA BLAGUE DU JOUR » + titre de l'épisode (silhouettes violettes qui courent) ≈ 6,8 s, puis le sketch, puis le générique déroulant (≈ 8 à 15 s). Le générique crédite Production, Production exécutive, Scénario, Illustration et story-board, Animation, Voix, Service transmédia, Montage.
- **Pendant le sketch** : aucun texte, aucun émoji, aucun sous-titre incrusté (7 TikTok et 3 Dailymotion vérifiés). Le seul texte est dans le décor (« PRISON »).
- **Épisodes YouTube 2026** (images à 25, 50 et 75 % de 6 épisodes) : 16:9, cadrages larges fixes (le salon de Dodo identique sur les trois images), plans à deux et gros plans, et un carton final « VOIR PLUS SUR AFRIKATOON + » avec QR code, déjà visible à 75 % de la durée dans 2 épisodes sur 6. — [hq1/hq2/hq3 YouTube, Collège Gnangnan EP27](https://www.youtube.com/watch?v=ph96rHmZf9Q), [Sucré Salé EP26](https://www.youtube.com/watch?v=V6Lt5sZtSyc), [Gbairai chez Dodo EP26](https://www.youtube.com/watch?v=7AGjydQtdBI)

### Inferences
- Le moteur peut reproduire le langage Afrikatoon **sans mouvement de caméra complexe** : caméra fixe, coupes franches, un zoom avant lent (+9 à +20 % en ≈ 1 s) sur le plan d'ouverture, éventuellement un zoom rapide (+60 % en ≈ 1,2 s) pour désigner le fautif.
- Le **plan de réaction figé et muet de 2 à 4 s** est la signature : c'est là que le public rit. Il ne faut ni l'abréger ni l'animer, pas même un clignement.
- Un **mouvement de bouche toutes les 3 images sur un corps immobile** suffit à rester fidèle (animation limitée). Le budget d'animation peut aller aux 1 ou 2 gestes clés par sketch.

### Gaps
- Épisodes 2026 (≈ 1 min) non mesurés plan par plan, faute de téléchargement YouTube. Durée moyenne de plan et nombre de coupes à mesurer quand une source sera disponible, par exemple via la plateforme ou un export des cookies du navigateur.
- Le nombre exact de formes de bouche (visèmes) n'a pas été compté : le recadrage de mesure a manqué la bouche.

---

## Q4. Voix et langue : expressions ivoiriennes et diction

### Takeaway
Les dialogues sont en **français ivoirien populaire** : syntaxe locale (« on ne drague pas femme », « tu vas où avec … comme ça ? »), particules **« là »** et **« hein »**, « Dieu merci », « bon vieux », argot (brouteur, bipé, goumin, gbairai). Le débit est rapide : ≈ 200 mots/min en médiane, 3 à 6 répliques par sketch, une pause de 0,6 à 1,6 s avant la chute.
Les voix sont jouées par des comédiens humains : le générique crédite environ une douzaine de « Voix ».

### Cited Findings
**Débit mesuré** : nombre de mots reconnus par faster-whisper « small », divisé par le temps entre le premier et le dernier mot (pauses comprises). Erreurs de reconnaissance possibles : ± 10 à 15 %.

| Sketch (TikTok) | Mots | Débit | Pause max |
|---|---|---|---|
| fils brouteur | 49 | 197 mots/min | 0,78 s |
| L'argent de transport | 63 | 253 mots/min | 0,98 s |
| Le chat | 41 | 222 mots/min | 1,00 s |
| Le voleur | 21 | 204 mots/min | 0,60 s |
| La nouvelle maison | 36 | 146 mots/min | 1,22 s |
| Le tricheur | 56 | 207 mots/min | 0,78 s |
| Le cauchemar | 61 | 188 mots/min | 1,16 s |

- **Médiane ≈ 204 mots/min.** Dailymotion « Décembre » : 175 mots/min, pause max 1,64 s. — vidéos citées en Q2/Q8
- **Répliques** : 3 à 6 tours de parole par sketch d'environ 20 s. La première réplique arrive entre 0,4 et 5,8 s, plus tard quand le décor installe d'abord la situation. — mesure faster-whisper (Q8)

**Expressions relevées** (transcription, puis relecture)
- « Ah, bon vieux, tu vas où avec … comme ça ? »
- « chez nous là, c'est le mouton qui broute »
- « je me suis enfin trouvé un toit hein ! »
- « Dieu merci, ça va te responsabiliser »
- « Mais tu loues ça à combien ? »
- « la mort m'a bipé »
- « Appelle-la et laisse-moi dormir »
- « C'est toi qui as raison hein ! »
- « on ne drague pas femme ! »
- « il m'embrouille ! »
- Sources : [TikTok 7153300594126589190](https://www.tiktok.com/@afrikatoon/video/7153300594126589190), [7427181684614892806](https://www.tiktok.com/@afrikatoon/video/7427181684614892806), [7449454373857398022](https://www.tiktok.com/@afrikatoon/video/7449454373857398022), [7441665514511945016](https://www.tiktok.com/@afrikatoon/video/7441665514511945016), [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l)

**Lexique dans les titres**
- *goumin* : chagrin d'amour profond, en nouchi. — [Sherpas](https://sherpas.com/blog/parents/a/goumin-definition/)
- *brouteur* : escroc sur Internet, sens ivoirien. — [Larousse](https://www.larousse.fr/dictionnaires/francais/brouteur/188499)
- *gbairai* : le synopsis le relie aux confidences et aux secrets du quartier (« presque rien ne reste secret »). — [Gbairai chez Dodo](https://afrikatoon.com/tvshows/gbairai-chez-dodo)

**Intonation**
- Rires appuyés intégrés aux répliques (« Ah ah ah ! » de l'épouse dans Le cauchemar) ; exclamations aiguës (« Ah ! »), répétitions (« Toi qui ? Toi qui ? » dans Le tricheur).
- Intensité sonore intégrée des 7 TikTok : −15,6 à −23,4 LUFS (médiane −21,1 LUFS).
- **Voix humaines** : les génériques Dailymotion créditent une rubrique « Voix » d'environ une douzaine de comédiens (noms non reproduits ici). — [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l)

### Inferences
**Règles de dialogue pour le moteur (voix TTS + vocodeur)**
- Débit cible ≈ 190 à 210 mots/min.
- Phrases courtes, de 6 à 15 mots.
- Finir les répliques par « hein » ou une particule « là ».
- Une pause de 0,6 à 1,2 s juste avant la chute, sans aucune pause après. On coupe aussitôt sur la réaction, qui reste muette.
- Garder un rire ou une exclamation (« Ah ah ah ! », « Ehh ! ») en début de réplique de la personne qui se moque.

### Gaps
- Ni hauteur de voix (F0) ni écart de hauteur mesurés : pas d'outil de hauteur installé.
- Le « tchip » (bruit de succion des dents) n'a pas été détecté automatiquement : ni entendu, ni transcrit par Whisper, ni confirmé.
- Aucune source écrite sur la direction d'acteurs vocaux du studio.

---

## Q5. Style visuel et technique d'animation

### Takeaway
Le style est un **dessin animé 2D vectoriel plat** :
- contour noir épais et régulier ;
- une seule teinte d'ombre ;
- peaux brunes de plusieurs nuances ;
- traits caricaturaux (gros nez et grosses lèvres, mentons longs, yeux ronds à petites pupilles, silhouettes extrêmes : colosse contre gringalet, femmes en sablier, directeur bedonnant) ;
- décors simples et chauds, dans des lieux types d'Abidjan.

L'animation est **limitée, en marionnette** : poses tenues, bouche qui alterne, gestes interpolés. Le studio se dit « 2D/3D » ; la plus grosse vidéo (COCONUL, 52 M vues) a un aspect 3D.

### Cited Findings
- La chaîne YouTube se décrit ainsi : « l'animation 2D / 3D ayant acquis une expérience établie et reconnue dans le domaine de la bande dessinée ». — [YouTube @Afrikatoon/about](https://www.youtube.com/@Afrikatoon/about)
- Sur le site, les épisodes de « La blague du jour » sont étiquetés « 2D animation » ; un descriptif parle de « personnages rigolos évoluant dans un univers cartoon 2D » (vu dans un extrait de recherche, non relu en page complète). — [afrikatoon.com](https://afrikatoon.com/), [Dailymotion afrikatoon](https://www.dailymotion.com/afrikatoon)

**Constat visuel** (planches à 2 images/s des 10 vidéos ; vignettes et images à 25/50/75 % des épisodes 2026)
- **Lignes et couleurs** : contour noir épais ; aplats avec une ombre portée simple ; reflets blancs sur crânes et fronts. Accents de couleur : pagne rouge à motifs, débardeur bleu électrique, uniforme bleu marine, combinaison orange de détenu.
- **Visages** : yeux blancs ronds à petite pupille (exorbités dans les réactions) ; nez et lèvres volumineux ; gouttes de sueur ; rides du front.
- **Décors** : chambre avec lit en bois et drap vert, bureau avec bibliothèque, salle de classe avec bancs et drapeau ivoirien, hôpital avec perfusion et rideau, rue avec *gbaka* blanc à bandes orange et bleues, façade de prison, salon de coiffure « Chez Dodo » turquoise et orange (2026). — vidéos TikTok/Dailymotion de Q8 ; vignettes [Gbairai chez Dodo EP26](https://www.youtube.com/watch?v=7AGjydQtdBI)
- **Évolution 2026** : palette plus saturée et lumineuse ; personnages plus « modernes » (tenues, coiffures) ; vignettes très chargées avec gros titres jaunes et rouges, « EP 26 », émoji 😂 et traits d'agitation autour des personnages. Ces effets restent dans la vignette, pas dans la vidéo. — [Collège Gnangnan EP27](https://www.youtube.com/watch?v=ph96rHmZf9Q), [Les Piqués EP26](https://www.youtube.com/watch?v=WSB99MEwD58)
- **Archives** : le sketch « Le chat » porte « Copyright AFRIKATOON 2011 » (trait plus brut, mains et visages plus grossis) ; « PLAIDOIRIE » (vers 2015) a un trait proche de la bande dessinée *Gbich*. COCONUL (vers 2015) montre sur sa vignette des personnages en 3D numérique. — [TikTok 7390729523072978181](https://www.tiktok.com/@afrikatoon/video/7390729523072978181), [YouTube a2tYJ7Nj2zQ](https://www.youtube.com/watch?v=a2tYJ7Nj2zQ), [YouTube kANh5bratis](https://www.youtube.com/watch?v=kANh5bratis)
- **Formats** : TikTok en 1080×1920 ou 576×1024, 23,976 ou 25 images/s ; Dailymotion et YouTube en 16:9, 24 images/s. — ffprobe (Q8)

### Inferences
- Le style est **compatible avec un moteur de marionnettes 2D** : poses dessinées, bouches interchangeables, décors peints fixes. La règle utile : **les silhouettes doivent contraster fortement** entre les deux personnages (taille, carrure, couleur de vêtement), pour que le champ-contrechamp se lise en une fraction de seconde.
- L'exagération des corps féminins (« Décembre », vignettes « Gbairai », « Sucré Salé ») fait partie du style d'origine. Pour une troupe familiale (Maman Nounou), on peut garder l'exagération du visage et des réactions sans reprendre celle des corps : c'est un choix de marque à faire consciemment.

### Gaps
- Logiciels utilisés (Toon Boom, Animate, Moho, Blender…) : aucune source trouvée.
- Usage de l'IA : aucune preuve trouvée, ni dans un sens ni dans l'autre.

---

## Q6. Son et musique

### Takeaway
Pendant le dialogue, **pas de lit musical continu** dans la plupart des sketchs TikTok : les pauses retombent à −48 à −66 dBFS. D'autres pauses contiennent du son (−24 à −33 dBFS) dont la nature n'a pas été identifiée.
Le logo final a un **jingle** dans 6 sketchs sur 7. Les versions YouTube et Dailymotion ont un **jingle de générique identique d'un épisode à l'autre** et une musique sur le générique de fin.

### Cited Findings
- **Pauses entre répliques** (ffmpeg astats) :
  - quasi silencieuses (−48,9 à −65,7 dB RMS) dans fils brouteur, L'argent de transport (14,3 à 14,7 s), Le voleur et La nouvelle maison (6,7 à 7,8 s) ;
  - sonores (−24,5 à −33,3 dB) ailleurs.
  - Pendant la parole, le niveau est d'environ −22 à −27 dB RMS. — mesure maison sur les vidéos de Q8
- **Logo final TikTok** : −24,7 à −32,4 dB RMS dans 6 vidéos sur 7, donc un jingle ou la fin d'un son ; −48,8 dB pour Le chat. — idem
- **YouTube/Dailymotion** : logo d'ouverture muet (−114,8 dB) ; carton « LA BLAGUE DU JOUR » avec jingle (−21,2 à −25,9 dB). Valeur strictement identique (−25,862173 dB) sur deux épisodes : c'est le même fichier audio réutilisé. Générique de fin en musique (−17,1 à −24,7 dB). — [Dailymotion x8qx54l](https://www.dailymotion.com/video/x8qx54l), [x8qyg9i](https://www.dailymotion.com/video/x8qyg9i), [x9bzs20](https://www.dailymotion.com/video/x9bzs20)
- **Son TikTok** : chaque vidéo indique « son original – AFRIKATOON OFFICIEL » ; pas de musique tendance réutilisée. — [oEmbed TikTok 7449454373857398022](https://www.tiktok.com/@afrikatoon/video/7449454373857398022)

### Inferences
- **Règle son pour le moteur** : dialogue sec, sans musique dessous. Un son ponctuel est possible sur un geste ou une réaction. Un jingle court de marque sur le carton final (1 à 2 s). Une identité sonore fixe et réutilisée, comme le jingle d'Afrikatoon, construit la reconnaissance.

### Gaps
- Bruitages (bonk, swish, cymbale), rires enregistrés ou musique : **non identifiés à l'oreille**. Aucun outil de classification audio n'était disponible, et aucune source écrite n'a été trouvée.

---

## Q7. Public et ce qui marche (vues publiées)

### Takeaway
Les blagues **de 17 à 26 s** de 2014-2015 et les **compilations de 5 blagues** de 2016-2023 ont fait les millions de vues sur YouTube. Les Shorts les plus vus (2,9 M, 1,3 M) portent des titres d'un ou deux mots sur le couple ou la famille.
Sur la dernière année, l'audience YouTube par vidéo a fortement baissé (≈ 3 à 15 k de médiane). Les séries à personnages récurrents font 2 à 4 fois mieux que les blagues isolées, et les compilations font les pics. Sur TikTok, le sketch « Le cauchemar » (24 s) atteint 2,4 M vues.

### Cited Findings
**YouTube, tous temps** (3 876 vidéos longues listées par yt-dlp le 16/10/2026 ; titres traduits automatiquement en anglais par YouTube, ramenés au français quand ils sont connus ; [date approx.])

| Vidéo | Vues | Année | Durée |
|---|---|---|---|
| COCONUL (aspect 3D) | 52 M | ≈ 2015 | 300 s |
| Compilation « La blague du jour » #5 | 10 M | ≈ 2016 | 297 s |
| L'intégrale de la blague du jour saison 2 | 8,9 M | ≈ 2017 | 1 479 s |
| Extrait de *Pokou* | 5,9 M | ≈ 2022 | 601 s |
| LA BLAGUE DU JOUR – PLAIDOIRIE | 4,5 M | ≈ 2015 | 20 s |
| Aouita le chasseur | 4,2 M | ≈ 2021 | 193 s |
| La petite sœur | 3,7 M | ≈ 2018 | 53 s |
| JE SUIS TOMBÉ EN HAUT | 3,7 M | ≈ 2014 | 24 s |
| Tabaski – « la blague qui tue » (n° 2110) | 3,5 M | ≈ 2023 | 204 s |
| La Tabaski – La blague du jour | 2,4 M | ≈ 2023 | 41 s |
| Les Sorcières Intégral (Les 3 Petits Génies) | 3,3 M | ≈ 2023 | 3 093 s |
| RÉAGIS MON VIEUX | 3,1 M | | 26 s |
| 2 heures avec la patronne | 2,9 M | ≈ 2022 | 68 s |
| TOMBE PAS MALADE | 2,5 M | | 26 s |
| LE PENDU | 2,0 M | | 17 s |

- Les 10 premières vidéos font 24,3 % des vues longues, les 100 premières 60,3 %. — [YouTube @Afrikatoon/videos](https://www.youtube.com/@Afrikatoon/videos)
- **Blagues isolées par année** (médiane de durée / médiane de vues) [date approx.] :
  - 2014 : 24 s / 348 k ;
  - 2015 : 26 s / 682 k ;
  - 2017 : 46 s / 38 k ;
  - 2022 : 36 s / 27 k ;
  - 2024 : 40 s / 5,7 k ;
  - 2025 : 49 s / 4,2 k ;
  - 2026 : 58 s / 3,3 k.
  - Sur tout l'historique : 2 242 blagues isolées, durée médiane 41 s, 15 k vues en médiane. 396 compilations : durée médiane 262 s, 43 k vues en médiane. — idem
- **Shorts YouTube** (374, 14,5 M vues au total) : LA TRESSE 2,9 M ; LA GROSSESSE 1,3 M ; L'HÉRITAGE 727 k ; Tombe pas malade 603 k ; La belle voiture 584 k ; C'est mon problème 315 k ; L'ARGENT DE FÊTE 278 k ; La protection 200 k ; Coco Nul 137 k. — [YouTube Shorts](https://www.youtube.com/@Afrikatoon/shorts)
- **12 derniers mois** (≈ 10/2025 à 10/2026, 752 vidéos longues) :

| Format | Nombre | Vues médianes | Vues max | Durée médiane |
|---|---|---|---|---|
| Goumin Goumin Club | 39 | 15 k | 1,2 M | 240 s |
| Au Labo | 29 | 14 k | 164 k (EP16) | 72 s |
| Sucré Salé | 27 | 13 k | 58 k | 64 s |
| Les Piqués | 14 | 11 k | 42 k | 68 s |
| Collège Gnangnan | 26 | 10,5 k | 71 k | 65 s |
| Gbairai chez Dodo | 17 | 9,5 k | 49 k | 69 s |
| Compilations | 102 | 8,75 k | 1,3 M | 429 s |
| Autres blagues isolées | 465 | 3,7 k | | |

  — [YouTube @Afrikatoon/videos](https://www.youtube.com/@Afrikatoon/videos)
- **Rythme de publication (octobre 2026)** : chaque série sort un épisode par semaine (EP25 vers le 8 octobre, EP26 vers le 13-16 octobre, Collège Gnangnan EP27), plus une compilation « 5 blagues » hebdomadaire (EP16, puis EP17 cinq jours plus tard). — idem
- **TikTok** (vues, j'aime, commentaires) :
  - LE CAUCHEMAR (12/2024) : 2,4 M, 116,3 k, 1 232 ;
  - Le chat (07/2024) : 396,1 k, 21,4 k, 190 ;
  - fils brouteur (10/2022) : 154,5 k, 7,3 k ;
  - LE TRICHEUR (11/2024) : 140,6 k, 6,3 k ;
  - L'ARGENT DE TRANSPORT (09/2023) : 42 k ;
  - LA NOUVELLE MAISON (10/2024) : 32,2 k ;
  - LE VOLEUR (08/2024) : 31,1 k.
  - Toutes durent 15 à 25 s. Hashtags types : #blaguedujour #humourivoiriens🇨🇮 #abidjan_tiktok #abidjan225🇨🇮, plus #togo #cameroun #benin #senegal (cible : l'Afrique francophone). — [TikTok @afrikatoon](https://www.tiktok.com/@afrikatoon), métadonnées yt-dlp et oEmbed

### Inferences
- Sur YouTube, la baisse des vues par vidéo coïncide avec l'allongement des blagues (24 s → 58 s) et l'explosion du volume (≈ 1 vidéo par jour). C'est une **corrélation, pas une cause prouvée** ; la montée des Shorts et de TikTok est probablement en jeu.
- Pour une diffusion TikTok, les données disent : **un gag de 15 à 25 s par vidéo** (le format qui a fait 2,4 M sur TikTok et 3 à 4,5 M sur YouTube en 2014-2015). Un épisode d'≈ 60 s, en revanche, convient à des **personnages récurrents** que le public suit, comme les séries 2026.
- Les titres courts « LE/LA + NOM » en capitales sur le couple, l'argent ou la famille dominent les meilleurs scores : LA TRESSE, LA GROSSESSE, L'HÉRITAGE, LE CAUCHEMAR.

### Gaps
- Pas de statistiques Facebook, Instagram, ni de rétention ou de taux de visionnage complet : données privées.
- Dates YouTube approximatives : yt-dlp les déduit des mentions relatives « il y a N ans ».
- Les vues TikTok des épisodes 2026 n'ont pas été trouvées : la liste du compte est inaccessible et la recherche est épuisée.

---

## Q8. Ce qui peut être MESURÉ : règles chiffrées pour le moteur

### Takeaway
Les règles ci-dessous sont **toutes tirées de mesures sourcées** (corpus de 10 vidéos publiques, relevé le 16/10/2026) ou des métadonnées officielles. Les points non mesurés sont signalés comme tels.

### Cited Findings
**Corpus et méthode** (reproductibles)
- **Vidéos analysées** :
  - TikTok : [7153300594126589190](https://www.tiktok.com/@afrikatoon/video/7153300594126589190), [7279133546025848069](https://www.tiktok.com/@afrikatoon/video/7279133546025848069), [7390729523072978181](https://www.tiktok.com/@afrikatoon/video/7390729523072978181), [7406286141143518470](https://www.tiktok.com/@afrikatoon/video/7406286141143518470), [7427181684614892806](https://www.tiktok.com/@afrikatoon/video/7427181684614892806), [7441665514511945016](https://www.tiktok.com/@afrikatoon/video/7441665514511945016), [7449454373857398022](https://www.tiktok.com/@afrikatoon/video/7449454373857398022) ;
  - Dailymotion : [x8qx54l](https://www.dailymotion.com/video/x8qx54l), [x8qyg9i](https://www.dailymotion.com/video/x8qyg9i), [x9bzs20](https://www.dailymotion.com/video/x9bzs20).
- **Outils** : [yt-dlp](https://github.com/yt-dlp/yt-dlp), [FFmpeg](https://ffmpeg.org/) (filtres `select=scene`, `ebur128`, `silencedetect`, `astats`), [OpenCV](https://opencv.org/) (ORB et `estimateAffinePartial2D` avec RANSAC, mesure du zoom et du panoramique), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) modèle small, int8, CPU, mots horodatés. Fichiers de travail dans le scratchpad, non versionnés.

**Mesures clés** (rappel des sections précédentes)

| Mesure | Valeur | Section |
|---|---|---|
| Contenu d'un gag TikTok | 13,9 à 22,9 s, médiane ≈ 19,9 s | Q3 |
| Logo de fin | 0,9 à 2,1 s | Q3 |
| Vidéo TikTok entière | 15 à 25 s | Q7 |
| Durée moyenne d'un plan | 3,8 s (2,7 à 4,8 s selon la vidéo) | Q3 |
| Coupes | ≈ 12,6 par minute ; 4 à 6 plans par gag | Q3 |
| Plan d'installation | 0,8 à 1,6 s, zoom ×1,09 à ×1,10 (doux) ou ≈ ×1,66 (rapide) | Q3 |
| Caméra fixe | ≈ 87 % du temps (médiane) | Q3 |
| Réaction finale | 2 à 4,5 s entre le dernier mot et le logo, image figée | Q3 |
| Bouche | ≈ 8 changements/s, soit toutes les ≈ 3 images à 24-25 images/s | Q3 |
| Gestes | bouffées de 0,3 à 1,5 s | Q3 |
| Débit | ≈ 204 mots/min (146 à 253) ; 3 à 6 répliques | Q4 |
| Pause avant la chute | 0,6 à 1,6 s au maximum | Q4 |
| Texte incrusté | aucun (0/10 vidéos) | Q3 |
| Intensité sonore | médiane −21 LUFS | Q4/Q6 |
| Dialogue | sans musique dessous dans ≥ 4 sketchs sur 7 | Q6 |
| Format série 2026 | ≈ 54 à 78 s (épisodes EP15 à EP27), 1 épisode par semaine et par série | Q7 |

### Inferences
**Grille proposée pour un sketch TikTok d'≈ 60 s (Modou et Maman Nounou)**, en combinant la durée des épisodes 2026 et le découpage mesuré sur les gags. Ce découpage est une proposition dérivée, pas une mesure.

| Temps | Contenu |
|---|---|
| 0 à 1,5 s | Plan large du décor de village, zoom avant ×1,1 |
| 1,5 à 15 s | Mise en place, 2 répliques en champ-contrechamp (gros plans de 3 à 5 s) |
| 15 à 35 s | Escalade, avec un mini-rebond comique |
| 35 à 50 s | Pause de 0,8 s, puis la réplique-chute (gros plan) |
| 50 à 56 s | Réaction figée et muette de Maman Nounou ou Modou, 3 à 4 s |
| 56 à 60 s | Carton avec jingle de 1,5 à 2 s |

- Autre option, mieux alignée sur ce qui a fait les plus gros scores TikTok : **2 à 3 gags indépendants de 18 à 20 s**, chacun avec sa réaction figée.

**Critères d'acceptation testables** (même méthode que celle utilisée ici, appliquée à nos propres rendus)
- durée moyenne d'un plan entre 3 et 5 s ;
- réaction finale d'au moins 2 s, avec moins de 2 % d'images modifiées ;
- débit de 180 à 230 mots/min ;
- caméra fixe au moins 80 % du temps ;
- aucun texte incrusté pendant le dialogue ;
- dernier mot de la chute 2 à 4,5 s avant le carton final.

### Gaps
- Échantillon de 10 vidéos seulement, de 2022 à 2025 ; les épisodes 2026 ne sont pas mesurés plan par plan.
- Transcriptions automatiques imparfaites sur l'accent ivoirien (le modèle small a produit, par exemple, « bruteur » pour « brouteur » et des phrases parasites « Sous-titres réalisés par l'Amara.org », retirées). Les débits sont donc à ± 10 à 15 %.
- Formes de bouche, hauteur de voix, bruitages et rires : non mesurés (voir Q3, Q4 et Q6).
- Budget de recherche web épuisé avant de vérifier : le sens nouchi de *gbaka*, *gnangnan*, *piqué* ; la pratique du « bip » ; les statistiques Facebook ; une éventuelle interview sur l'écriture des blagues.
