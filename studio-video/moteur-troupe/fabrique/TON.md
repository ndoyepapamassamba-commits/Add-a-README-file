# Le ton de l'humour de la troupe

18/10/2026, demande « analyse bien le ton de l'humour en écrivant des sketchs ».

**Sources**
- La veille « Style comique Afrikatoon Ladjagay Gbeze », appelée **[V]** :
  - 10 sketchs Afrikatoon et 4 épisodes de Ladjagaï ;
  - les TikTok de l'utilisateur, mesurés avec le même code ;
  - des études sur le timing comique.
- La bible comique de la troupe, appelée **[B]**, et ses 18 relations entre les personnages de l'univers.

Le contrôle `ton.py` vérifie chaque règle chiffrée, et JEV fait le contrôle final.

## 1. D'où vient le rire chez Afrikatoon et Ladjagaï

1. **Une seule réplique retourne le sens, puis plus rien ne bouge [V].** La chute dure 1,14 à 1,24 s. Elle est suivie d'un gros plan de réaction immobile de 2,2 à 3,4 s, et jusqu'à 4,4 s chez Afrikatoon. Le rire vient de cette compression, pas de la quantité d'animation.

2. **La chute est verbale, et le dessin rend la situation lisible [V].** Les mécaniques qui portent :
   - la prise au pied de la lettre : « la mort m'a bipé » ;
   - la logique qui se contredit : venir au bureau dire qu'on ne peut pas venir ;
   - l'ironie portée par le décor : la façade « PRISON » ;
   - la croyance poussée au bout ;
   - chez Ladjagaï, la mauvaise foi commerciale, la règle absurde inventée sur-le-champ, la vantardise suivie d'une leçon au cadet, le défi immobile.

3. **Le quotidien d'Abidjan [V].** Les thèmes : argent, école, santé, couple, transport, maquis. Les titres les plus vus suivent le modèle « LE/LA + NOM » : LA TRESSE (2,9 M de vues).

4. **Des duos récurrents [V].** Depuis 2026, les mini-séries d'Afrikatoon bâties sur des duos font 9,5 à 14 k vues médianes, contre 3,7 k pour les blagues isolées. Le public revient pour des personnages qu'il reconnaît.

5. **Le registre : autodérision et ironie [V].** Il est servi en français ivoirien populaire et compréhensible : « là », « hein », « dêh », « Dieu merci », « une barre ». Le débit est rapide : 6,3 à 6,7 syllabes par seconde.

6. **Trois pièges à éviter [V] :**
   - l'animalisation des personnes noires par l'IA ;
   - la caricature des corps ;
   - la vulgarité, qui fait perdre des abonnés.

## 2. Ce qui manquait aux premiers sketchs de la saison 1

`ton.py` a relevé ces défauts sur la version écrite à la main.

| Défaut | Bulletin | Télécommande | Ordonnance |
|---|---|---|---|
| Chute trop longue (≤ 8 mots et ≤ 9 syllabes) | 11 mots, 19 syllabes | — | 11 syllabes |
| Pas de rappel de l'accroche dans la chute | ✗ | ✗ | ✗ |
| Pas de témoin figé après la chute | ✗ | ✗ | ✗ |
| Aucune marque du parler ivoirien | ✗ | ✗ | ✗ |
| **« Maman » et « Papa » dans la bouche de Petit Mamadou**, qui vit chez ses grands-parents (bible : « Mamie », « Papi ») | ✗ | ✗ | ✗ |
| Sketch trop court (12 à 22 s) | — | 7,7 s | 8,4 s |

**La cause de fond :** le sketch avait été écrit sans les **relations de la bible** :
- Baye cache son argent, et Nounou le trouve toujours ;
- Mamadou fait chanter Papi avec ses cachettes ;
- Nounou est la reine du marchandage.

Ce sont ces dynamiques qui font les duos récurrents.

## 3. La grille appliquée à chaque sketch

| Règle | Valeur | Source |
|---|---|---|
| Accroche | Un conflit dès la 1re réplique : question piège ou accusation (« ? » ou « ! ») | [B] |
| Chute | Une seule, en **dernière** réplique ; rien après | [V] [B] |
| Longueur de la chute | 8 mots et 9 syllabes au plus (34 à 37 images à 30 i/s) | [V] |
| Rappel | La chute reprend un mot de l'accroche, retourné contre quelqu'un | [B] |
| Réaction | Un **témoin**, pas l'auteur de la chute, se fige en gros plan 2,2 à 4,5 s ; le tournage tient cette durée (`voix.py`) | [V] |
| Durée | 12 à 22 s ; 4 à 12 répliques ; voix au débit mesuré de chaque personnage | [V] |
| Mécanique | Déclarée, parmi les 12 mécaniques des références | [V] [B] |
| Ressort | La chute ou la réaction porte le défaut d'un personnage (pas de blague hors personnage) | [B] |
| Adresse | Les vocatifs suivent la famille (`univers.ADRESSE`) | [R] |
| Langue | 2 à 4 marques ivoiriennes, jamais forcées ; pas de wolof ni de mot cru | [B] |
| Pièges | Rien sur le corps, un animal comparé à une personne, une ethnie, une religion | [V] |

## 4. Les trois sketchs réécrits (`histoires/saison1-ep01.json`)

| Sketch | Duo | Mécanique | Chute (témoin figé) |
|---|---|---|---|
| **LE BULLETIN** | Nounou ↔ Baye, devant Mamadou | Vantardise contredite : Baye donne la leçon (« j'étais toujours premier ») | « Premier à cacher son bulletin. » (Baye figé, Mamadou tourne lentement la tête vers lui) |
| **LA CACHETTE** | Mamadou ↔ Papi, puis Nounou | Contre-pied : Mamadou fait payer son silence en marchandant comme sa grand-mère (« une barre pour la bouche, deux pour les yeux ») | « Moi, j'ai tout vu ce matin. » (Baye figé ; Mamadou range ses billets très lentement) |
| **L'ORDONNANCE** | Nounou ↔ Baye, puis Mamadou | Prise au pied de la lettre : « plus de sucre », donc Baye en remet ; l'enfant retourne aussitôt la logique | « Docteur a dit : plus de bonbons ! » (Nounou figée, le sucre coule encore) |

## 5. Contrôle final par JEV

Exigence : décision > 0,5 sur chaque question, sans marge. Chaque nouveau sketch a aussi affronté en duel sa version précédente, dans les deux ordres de présentation pour annuler le biais de position.

| Sketch | Drôle (/4) | Chute | Ivoirien | Clair | Méchant (< 0,5) | Duel contre l'ancienne version |
|---|---|---|---|---|---|---|
| Le bulletin | 2,23 / 2,24 | 0,91 / 0,90 | 0,65 / 0,64 | 0,86 | 0,09 | 0,53 / 0,535 (gagné) |
| La cachette | 1,86 / 1,83 | 0,77 / 0,76 | 0,73 / 0,70 | 0,63 / 0,64 | 0,17 / 0,13 | 0,795 (gagné) |
| L'ordonnance | 2,16 / 2,22 | 0,76 / 0,78 | 0,70 / 0,71 | 0,73 / 0,74 | 0,11 / 0,12 | 0,57 / 0,585 (gagné) |

Les anciennes versions obtenaient :
- **drôle** : 2,08, 1,67 et 1,95 ;
- **ivoirien** : 0,51, 0,38 et 0,53. La télécommande échouait donc à la porte « ivoirien ».

**Les deux refus de JEV pendant l'écriture :**
- **L'ordonnance** a d'abord perdu son duel (0,40), car elle livrait le malentendu trop tôt et privait l'enfant de sa réplique. Elle a été reconstruite autour de l'escalade vers Petit Mamadou.
- **La cachette** a d'abord obtenu 0,48 et 0,50 en « ivoirien ». La variante gardée, avec « dêh », « sous le lit là » et « on se connaît pas », obtient 0,73 et 0,70.

## 6. Épisode 1, deuxième écriture : trois décors, sept personnages

18/10/2026. Retours de l'utilisateur sur la première version :
- « Le degré d'humour, ce n'est pas encore ça » ;
- « Varie scène et personnages comme avant ».

Les trois sketchs de la cour passent dans `histoires/reserve-cour.json`. L'épisode prend un duo de la bible par décor :

| Ordre | Sketch (titre à l'écran) | Décor, duo | Ressort de la bible | Chute |
|---|---|---|---|---|
| 1 | **KOFFI LE FAUX RICHE** | maquis : Coumba, Koffi | « elle teste sa richesse, il bluffe » | « Mes lunettes ? C'est pour fuir le patron. » La chute répond à l'accroche : « Pourquoi tu portes tes lunettes noires la nuit ? » |
| 2 | **PAPI ÉTAIT PREMIER** | cour : Maman Nounou, Petit Mamadou, Baye | Baye donne des leçons qu'il n'a jamais suivies ; l'enfant le trahit | « Caché avec le tien, Papi ! » La chute répond à « tu l'as caché où ? » et dément les « termites ». |
| 3 | **LE LOYER QUI MARCHE À PIED** | chambre : Tantie Awa, Modou | « elle le soupçonne de tout — et elle a souvent raison » | « Ça, c'était avec ton loyer, Tantie. » Elle vient après une escalade d'excuses : l'argent « en route », les embouteillages de Yopougon, la banque « gâtée ». |

**Ce qui a été appris en écrivant :**
- **La chute qui répond à la question d'accroche** a donné les meilleures notes. Le public attend la réponse depuis la première seconde.
- **L'escalade en trois excuses** a fait gagner son duel au « Loyer » : 0,41 sans elle, 0,805 avec.
- **Les titres « LE/LA + nom » seuls** obtiennent une note d'accroche faible : « LE BULLETIN » 0,25, « LE LOYER » 0,42. Un titre qui annonce le conflit fait mieux : « KOFFI LE FAUX RICHE » 0,68, « LE LOYER QUI MARCHE À PIED » 0,66.

**Contrôle final par JEV** (décision > 0,5 sur chaque question) :

| Sketch | Drôle (/4) | Chute | Parler ivoirien | Clair | Méchant | Duel contre le sketch remplacé |
|---|---|---|---|---|---|---|
| Koffi le faux riche | 2,45 | 0,87 | 0,81 | 0,78 | 0,12 | 0,56 contre la Cachette |
| Papi était premier | 2,31 | 0,89 | 0,72 | 0,79 | 0,07 | 0,67 contre l'ancien Bulletin |
| Le loyer qui marche à pied | **2,95** | 0,92 | 0,86 | 0,64 | 0,12 | 0,805 contre l'Ordonnance |

La première écriture plafonnait à 2,24.

**Porte « faute ».** Une réplique était jugée à 0,53 : « Montre ton bulletin d'avant, on va voir ». Elle est remplacée par « Ah bon ? Où est ton bulletin à toi, alors ? », jugée à 0,20.

**Biais de mesure corrigé dans la porte finale (`jev_texte.py`).** Le parler ivoirien est désormais jugé sur les répliques seules :
- les noms de la troupe, d'origines diverses, faisaient passer la même note de 0,64 à 0,26 ;
- l'épisode 1 v1 recevait ainsi 0,45 et 0,36 à la porte finale, contre 0,64 à 0,71 à l'écriture.

## 7. Épisode 1, troisième version : choc de fin, rires, sons d'intonation (18/10/2026)

Remarques de l'utilisateur sur la v2 :
- « revoir le visage du choc de la fin pour chaque épisode : Maman est choquée, la femme au maquis est choquée, la dame du loyer aussi » ;
- « le son d'accompagnement du film, il faut le revoir et le caler sur mes TikTok ; après le choc de fin de chaque sketch, ça doit être accompagné de rire comme dans mes TikTok » ;
- « gérer les sons intermédiaires d'intonation et autres ».

**Prise de choc (`jeu.py`, « take » des animateurs).** La v2 posait la surprise (0,91 à 0,94 au début du gros plan) mais rien ne se voyait :
- la bouche restait close, puisque sans réplique la commande de mâchoire vaut 0, ce qui joint les lèvres ;
- la colère et le soupçon mêlés annulaient les sourcils haussés.

La prise suit désormais le minutage des animateurs :
- le gros plan commence ;
- 0,25 s où l'on « encaisse », la tête qui s'abaisse un peu ;
- attaque en 0,18 s avec dépassement ;
- tenue vivante qui retombe de 18 % en 3 s.

Pendant la prise, la surprise domine (les autres ressentis s'effacent à 85 %), la mâchoire tombe (bouche bée, commande 0,6), la tête recule et monte, et on cligne peu. JEV, sur les mêmes 9 images (Coumba, Maman, Awa, à 0,6, 1,5 et 2,5 s) :

| Juge JEV | v2 | v3 |
|---|---|---|
| « choquée » | 0,03 à 0,07 | 0,64 à 0,84 |
| rendu abîmé | — | au plus 0,48 |
| déformé | — | au plus 0,45 |

Ce contrôle est devenu permanent : porte P_choc (`jev_choc.py`).

**Son calé sur les TikTok (`ecoute.py`, YAMNet Apache-2.0).** Mesure des 12 TikTok de l'utilisateur :
- aucune musique sous les dialogues (musique entendue 0 à 1,6 % du temps) ;
- après chaque blague, une salve de rires au niveau des voix (écart médian −0,7 dB, 0,5 à 1,5 s, jusqu'à 3,4 s).

D'où les choix de la v3 :
- plus de jingle par défaut ;
- après la prise de choc de chaque sketch, 0,2 s plus tard, des rires de public de 2,6 s au niveau des voix (−1 dB) ;
- les sons sont choisis parmi les rires gratuits de Mixkit selon la similarité de leur profil YAMNet avec les rires des TikTok, multipliée par la force du rire : 429, 460, 427, 424, de 0,41 à 0,67 ;
- dans chaque son, le passage le plus rieur est choisi par YAMNet.

Le juge du son reçoit les grandeurs mesurées (écart après la prise, durée, écart au niveau des voix, rire entendu par YAMNet). Sa question « rires_place » rend 0,94. Un sketch sans rire entendu est un défaut dur.

**Sons d'intonation (`intonations.py`).** Mesure : les TikTok ont 4,9 fenêtres par minute de sons vocaux hors paroles en médiane (cris, grognements, soupirs, halètements) ; la v2 en avait 0.

Les interjections lues par Piper (« Eeeh ! », « Hmm ? ») restent classées « Speech » par YAMNet, même retravaillées par WORLD. On part donc de vraies interjections humaines (Mixkit) classées par YAMNet comme celles des TikTok :
- grognements : 2768, 966, 965 ;
- souffles de choc : 964, 968.

Elles sont passées dans la voix du personnage par la même transformation WORLD que ses répliques. Deux usages :
- **grognement d'écoute** : celui à qui l'on fait une réplique de frime ou d'excuse fait « hmm… » avant de répondre ; il est inséré dans le minutage, rien n'est couvert ;
- **souffle de choc** : sur la prise de chaque sketch.

Résultat : 6 sons pour 70,2 s, soit 5,1 par minute.

**Regard en hauteur et iris borné.**
- La tête ne prend que 60 % de ce que le dessin ne regarde pas encore, borné par son enveloppe, et les yeux font le reste. Tantie Awa regardait au-dessus de Modou : « au-dessus de lui » passait de 0,55 sur l'image d'origine à 0,88 une fois animée.
- L'iris ne s'écarte plus que de 1,1 course de sa position peinte. L'œil de Maman devenait blanc quand l'iris traversait l'œil.

**Rotation de tête par LivePortrait : greffe en cours.** A/B jugé par JEV sur le plan de Baye (47 images) :

| Rotation | Images fautives | « Maman regarde Baye » |
|---|---|---|
| 0° | 9 | 0,39 |
| 12° | 32 | 0,44 |
| 22° | 40 | 0,55 |

Le champ de rotation fait glisser les traits dans une tête dont le contour ne tourne pas. Étendre le poids à toute la tête n'y change rien (38 contre 39). La v3 garde 22°, seul réglage où Maman regarde Baye. Greffe suivante : la tête tournée rendue directement par LivePortrait (bibliothèque d'expressions rendue à plusieurs lacets) au lieu du champ appliqué au dessin, jugée par la porte G et par « Maman regarde Baye ».

**Production de la v3, mesurée** (même conteneur, 4 cœurs, 70,2 s de film, 4 214 images à 60 i/s) :

| Étape | v2 | v3 |
|---|---|---|
| Voix, formes de bouche, rires, ambiance | 58 s | 67 s |
| Tournage (réalisateur JEV rejugeant les 21 plans compris) | 708 s | 632 s |
| Montage | 227 s | 83 s |
| Porte qualité | 136 s | 303 s |
| **Total** | **23 min 26 s** | **18 min 12 s** |

La porte qualité compte désormais 17 portes, P_choc comprise. La v3 en passe 6 sur 17 :
- **N_son** passe désormais (v2 : échec) ;
- **B_bouche** : 19 répliques sur 22 (v2 : 16) ;
- **P_choc** : 8 images sur 9, la neuvième ayant un rendu à 0,54 ;
- **J_humour** retombe sur la « faute » du bulletin, à 0,48 en v2 pour un texte identique : JEV hésite autour du seuil.

Greffes suivantes :
- tête tournée rendue par LivePortrait (porte G) ;
- bras en deux os à main clouée et buste plus ample sous garde d'étirement (porte L : bras 0,04, buste 0,12) ;
- regard de Tantie Awa vers Modou (porte D) ;
- passage de la porte qualité sous 2 min, en limitant les juges qui se disputent les 4 cœurs.
