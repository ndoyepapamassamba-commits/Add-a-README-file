# AFRICA TOON TROLL : plan de départ vers 10 000 vidéos

*Version du 18/10/2026.*

La source de vérité est le code : `fabrique/univers.py` (distribution, âges, lieux, objets, vues).
Ce plan suit les consignes du 18/10 :

- refaire toute la troupe, avec des vues 360°, debout et assis ;
- des personnages clairs et identifiables, qu'on peut faire parler et bouger ;
- assez de personnages, de scènes et de paramètres pour raconter toute une vie ;
- carte blanche sur l'histoire, les personnages et les scènes ;
- REA d'abord pour aller vite, JEV seulement au contrôle final.

## 1. Pourquoi on repart de zéro

Les films v23 à v35 animaient des images où tout était peint ensemble : personnages, meubles, objets et décor.
Chaque défaut vu par l'utilisateur en découle :

| Défaut vu | Cause dans l'image d'origine | Ce que change la fabrique |
|---|---|---|
| Baye bouge avec sa chaise | chaise peinte collée au corps | personnage seul sur fond uni, chaise = objet à part qui ne bouge pas |
| le plat suit la main de Koffi et passe derrière le fourneau | objets peints dans la main et sur le décor | objets = planches à part, avec leur couche (devant/derrière) donnée par le compositeur |
| Mamie regarde le ciel | tête peinte tournée vers le haut, à 29° | 7 directions par personnage (face, ¾ gauche/droite, profils, dos) et tête LivePortrait ±25° |
| Petit Mamadou est figé et ne se retourne pas | une seule vue de face | le moteur choisit la vue tournée vers l'interlocuteur, et peut changer de vue en cours de plan |
| le vieux assis ne parle pas | barbe sur la bouche | règle : bouche toujours visible |
| aucun clignement | l'image « yeux clos » ne fermait pas les yeux | module des paupières des auteurs de LivePortrait, plus un contrôle automatique |
| restes d'acteur dans le fond, parallaxe fantôme | décor reconstruit sous les personnages | décors générés vides |

## 2. La chaîne de fabrication : 7 étages

Chacun a une entrée, une sortie et un contrôle.

| # | Étage | Entrée → sortie | Contrôle (automatique, local) |
|---|---|---|---|
| E1 | **Bible** (`univers.py`) | consignes → distribution, âges, lieux, objets, invites | chaque personnage respecte les règles d'animabilité (§3) |
| E2 | **Planches** (générateur rapide gratuit) | invites → feuilles de rotation, assis, marche, décors vides, objets | chaque fichier existe, a la bonne taille et le bon nombre de silhouettes |
| E3 | **Découpe et mesures** | feuilles → une image détourée par vue + squelette, 478 points du visage, pieds, taille en pixels | bouche visible, blanc des yeux visible, bras décollés, pas de texte |
| E4 | **Bibliothèques de jeu** | vue détourée → visages LivePortrait et squelette 2D | les yeux clos cachent le blanc des yeux (≤ 35 %), la bouche s'ouvre, pas d'étirement |
| E5 | **Compositeur de scène** | décor + objets + personnages + paramètres → scène prête à tourner | échelle par la perspective, pieds au sol, ombres de contact, couches |
| E6 | **Écriture** | saison, lieu, duo, mécanique comique → épisode (répliques, jeu, chute) | un seul retournement par sketch, durée cible, phrases dites par une seule voix |
| E7 | **Tournage, montage, son** | épisode + scène → vidéo 9:16 | les mesures maison à chaque version ; **JEV au contrôle final seulement** |

## 3. Règles d'animabilité, imposées à chaque planche

1. **Bouche visible** : ni barbe ni moustache sur les lèvres.
2. **Yeux dégagés**, blanc de l'œil visible : les lunettes noires de Koffi sont remontées sur sa tête.
3. **Bras décollés** du corps, mains ouvertes, pieds visibles.
4. **Tenue symétrique, sans texte ni logo** : la vue gauche retournée donne la vue droite. Le maillot n°10 devient un maillot uni.
5. **Silhouette et couleur signature** propres à chacun : on le reconnaît en ombre chinoise.
6. **Personnage seul sur fond gris uni** ; meubles et objets sont des planches à part.
7. **Décors vides**, caméra à hauteur d'homme, sol dégagé devant pour jouer et se déplacer.

## 4. La distribution : 28 personnages et 12 âges de plus

L'univers s'appelle **la Grande Cour d'Abobo**. Le fil rouge est **la vie de Petit Mamadou**, de bébé à vieillard.

| Foyer | Personnages (ressort comique) |
|---|---|
| Famille Diabaté | Petit Mamadou en 7 âges : bébé, 8 ans, ado, étudiant, marié, papa, vieux (excuses impossibles) ; Mamie Nounou en 3 âges (accuse tout le monde, tient l'argent) ; Baye Ndiaye en 2 âges (mauvaise foi innocente) ; Mémé Ama, 85 ans (sourde quand ça l'arrange) ; Bébé Aya, 3 ans (répète tout au pire moment) |
| Voisins de la cour | Tantie Awa (commère) ; Modou (débrouillard) ; Coumba (influenceuse) ; Koffi (faux riche) ; Junior (frimeur) ; les Jumeaux (finissent les phrases l'un de l'autre) ; Vieux Père Sékou (proverbes à côté de la plaque) |
| Le quartier | Tantie Mariam (attiéké, pas de crédit) ; Bakary (chauffeur de gbaka) ; Issouf (apprenti) ; Tantine Laure (coiffeuse) ; Ibrahim (boutiquier) ; Sergent Yao (policier) ; Professeur Kanté (marabout charlatan) |
| École, hôpital, bureau, amour, village | Maîtresse Adjoua ; M. le Directeur ; Docteur Konan ; Sage-femme Tata Rose ; M. Kouassi (patron radin) ; Bintou (collègue) ; Fatou en 4 âges (étudiante, mariée, maman, grand-mère : la femme de Mamadou) ; Maman Clémentine (belle-mère) ; Nanan (chef du village) |

Pour chaque personnage, la fiche fixe aussi la taille en cm (échelle), la couleur signature, le ressort comique et la hauteur de voix visée.
Voici ce dernier point pour les voix : 105–125 Hz pour les hommes, 190–220 Hz pour les femmes, 280–330 Hz pour les enfants, puis un timbre adouci (§7).

## 5. Les planches : ce qu'on fabrique

- **Par personnage et par âge** :
  - une feuille de rotation (face, ¾ gauche, profil gauche, dos ; les miroirs donnent ¾ droite et profil droit, soit **7 directions**) ;
  - une feuille assis (face, ¾, profil, plus les miroirs) ;
  - une feuille de marche (4 poses du cycle, de profil : les déplacements).
- **24 lieux × 2 moments** (après-midi, nuit), tous vides :
  - à la maison : cour, salon, chambre, cuisine ;
  - en ville : maquis, rue, boutique, salon de coiffure, gbaka, gare, marché, kiosque ;
  - les institutions : classe, cour d'école, amphi, hôpital, maternité, commissariat, bureau, bureau du patron, mairie ;
  - ailleurs : village, plage de Bassam, terrain de foot.
- **21 objets** :
  - meubles : chaise, tabouret, banc, table ;
  - cuisine et repas : fourneau, marmite, plat d'attiéké, bassine ;
  - appareils : téléphone, radio, télé, ventilateur ;
  - école et voyage : ballon, cartable, pupitre, valise ;
  - divers : moto, sac de riz, billets ;
  - animaux : poule, chien.
- **Total du premier lot : 189 planches.**

Ensuite, le moteur multiplie sans rien générer de plus :

- émotions × bouches × paupières × têtes LivePortrait ;
- squelette 2D ;
- placements et cadrages du compositeur.

## 6. Les paramètres qu'on manipule en quelques secondes

Une vidéo est décrite par un petit fichier. Aucun pixel n'est généré au tournage.

| Famille | Paramètres |
|---|---|
| Distribution | personnage, âge, tenue (variante d'invite), place dans le cadre, distance, direction (7 vues, choisie vers l'interlocuteur) |
| Pose | debout, assis (sur un objet du décor), marche (de A à B, à vitesse donnée), gestes du squelette |
| Visage | 15 émotions, ouverture de bouche sur les phonèmes, regard vers une cible, paupières, tête (lacet, tangage, roulis) |
| Lieu | lieu, moment (jour, après-midi, soir, nuit), vie du fond (feuillage, oiseaux, figurants) |
| Objets | objet, place, couche (devant/derrière), tenu par qui et quand |
| Caméra | plan large, moyen ou serré, champ-contrechamp, poussée sur la chute, durée de la réaction |
| Son | voix (hauteur, débit, timbre), ambiance du lieu, musique, jingle, rires |
| Écriture | saison de vie, mécanique comique, duo, longueur, dose de nouchi |

## 7. L'histoire : une vie entière en 8 saisons

| Saison | Âge de Mamadou | Lieux phares | Duos phares |
|---|---|---|---|
| 1. La naissance | bébé | maternité, cour | Baye et Tata Rose, Mamie Nounou et Tantie Awa |
| 2. L'école | 8 ans | classe, cour d'école | Mamadou et Maîtresse Adjoua, Mamadou et les Jumeaux |
| 3. L'ado | 15 ans | rue, terrain, salon de coiffure | Mamadou et Junior, Mamadou et Mamie Nounou |
| 4. Le bac et l'amphi | 21 ans | amphi, kiosque, gbaka | Mamadou et Fatou, Bakary et Issouf |
| 5. La débrouille | 21 à 28 ans | gare, marché, maquis | Mamadou et Modou, Koffi et Coumba |
| 6. La dot et le mariage | 29 ans | mairie, salon | Mamadou et Maman Clémentine, Baye et Nanan |
| 7. Le bureau et les enfants | 40 ans | bureau, bureau du patron, cour | Mamadou et M. Kouassi, Bintou |
| 8. La sagesse | 70 ans | cour, village | Mamadou vieux et Vieux Père Sékou, Fatou grand-mère |

**Formats**, d'après la veille Afrikatoon, Ladjagaï et Gbézé :

- **la blague du jour** : 30–45 s, un seul retournement, une réaction figée de 2 à 4,5 s à la fin ;
- **le duo récurrent** : environ 60 s ;
- **les compilations** : 5 blagues.

**Mécaniques comiques**, tirées de la même veille : prise au pied de la lettre, logique absurde qui se contredit, ironie dramatique, superstition détournée, mauvaise foi, retournement de l'arroseur.

**Le compte pour 10 000** :

- 8 saisons × 24 lieux × 8 mécaniques × une centaine de duos plausibles, soit **plus de 150 000 combinaisons** ;
- la machine à blagues écrit, puis classe ;
- seules les meilleures sont tournées, à raison de 1 250 par saison.

## 8. Vitesse et matériel

| Étape | Coût visé |
|---|---|
| Planches (E2) | générées **une seule fois**. AI Horde anonyme (Z-Image-Turbo, gratuit) donne la bonne qualité, mais la file d'attente compte 10 à 25 min |
| Accélération des planches (**greffe en cours**) | une carte T4 gratuite sur Kaggle (30 h par semaine), pilotée par notre `kaggle_moteur.py`. Il suffit d'ajouter le jeton `KAGGLE_API_TOKEN` dans les réglages de l'environnement. Les 189 planches se font alors en un peu plus d'une heure |
| Une vidéo (E5 à E7) | quelques minutes sur le processeur du conteneur, tous les plans en parallèle |

## 9. Fait le 18/10, avant même les nouvelles planches (vaut pour tous les personnages)

- **Paupières** : l'image « yeux clos » ne fermait les yeux d'aucun des 7 personnages. Le module des auteurs de LivePortrait (`stitching_eye`) les ferme bien sur 6 d'entre eux ; Koffi garde ses lunettes et sera redessiné. Un contrôle automatique arrête la chaîne si le blanc des yeux reste visible.
- **Têtes qui tournent** : la pose de tête de LivePortrait (lacet ±24°, tangage ±10°) tourne la tête, foulard et coiffure compris. Essai fait sur Mamie, Petit Mamadou et Tantie Awa.
- **Voix** : la cause du son « trop aigu » est mesurée. La hauteur est déjà naturelle (hommes 119–127 Hz, femmes 209–225 Hz). C'est le **timbre** qui est trop brillant : la part d'énergie au-dessus de 3 kHz va de 10 à 30 % chez nous, contre 3 à 4 % dans les TikTok de l'utilisateur. La correction est une égalisation de la courbe spectrale de chaque voix sur celle des TikTok du même genre, puis une nouvelle mesure.
- **Oiseaux** : l'envergure est plafonnée à 2,5 % du cadre visible et la couleur est tirée vers le ciel (perspective aérienne).
