# Série de 10 000 épisodes avec toute la troupe (20/10/2026)

Consigne : « je préfère la V14 ou V15 avec leurs personnages beaucoup plus animés […] comme d'hab 3 sketchs mais je voudrais
après que tu impliques toute la troupe dans le moteur (plus de 50 personnages) […] règle tout pour mes 10 000 vidéos ».

Le moteur reste celui de la v14/v15 (`tourne.py`) :
- visages LivePortrait ;
- gestes BEAT2 ;
- corps ARAP ;
- regards, flou de bougé, son masterisé.

Ce qui change, c'est la façon de lui donner des acteurs, des scènes et des histoires, en masse.

## Les trois pièces

| Pièce | Fichier | Rôle |
|---|---|---|
| Casting central | `casting_troupe.py` | Chaque personnage préparé **une fois** : figure (galeries, planches ou dessin généré), voix distincte, bibliothèque de visages LivePortrait. Les visages sont rangés en coordonnées de la figure, puis replacés dans n'importe quel décor, à n'importe quelle échelle, en miroir ou non. |
| Scène composée | `scene_nouvelle.py` + `compositeur.py` | Décor de la bibliothèque + figures posées à l'échelle (taille de la bible × px/m), ombres, découpes exactes. Chaque acteur est analysé seul sur sa découpe : un décor peuplé ne lui vole ni squelette ni visage. Les visages viennent du casting en quelques secondes. |
| Série | `serie.py` | File d'épisodes reprenable (diskcache, SQLite). Étapes : distribution, scènes, écriture, tournage, fin. Un arrêt reprend à l'étape interrompue. |

## Commandes

```
MASSAMBA_BIBLIO=<bibliothèque> python3 casting_troupe.py etat          # 54 personnages : figure, voix, visages
MASSAMBA_BIBLIO=<bibliothèque> python3 casting_troupe.py dessine       # figures manquantes (AI Horde gratuit)
MASSAMBA_BIBLIO=<bibliothèque> python3 casting_troupe.py visages [NOM] # bibliothèques de visages (une fois par personnage)
MASSAMBA_BIBLIO=<bibliothèque> python3 serie.py plan 100               # 100 épisodes de plus dans la file
MASSAMBA_BIBLIO=<bibliothèque> python3 serie.py marche                 # fait avancer la file (reprenable)
MASSAMBA_BIBLIO=<bibliothèque> python3 serie.py etat                   # avancement, minutes par épisode, date de fin
```

## Distribution

- 3 sketchs par épisode, dans 3 lieux différents de la bible (Cour, Maquis, Marché, École, Bureau…).
- 2 personnages par sketch, parfois 3 (un sketch sur quatre).
- Pris parmi ceux qui fréquentent le lieu (fiche `lieux`).
- Le moins employé passe d'abord.
- Jamais deux fois le même duo dans le même lieu.

Avec 54 personnages et 14 lieux, la bible permet plusieurs milliers de duos distincts avant toute répétition. Les décors
offrent en plus plusieurs vues par lieu.

## Débit mesuré et chemin vers 10 000

| Étape | Coût mesuré | Fréquence |
|---|---|---|
| Bibliothèque de visages d'un personnage | 11 à 28 min (Koné 645 à 1 667 s, Awa 1 311 s) | une fois par personnage (54) |
| Visages par le casting (essai École, 20/10/2026) | quelques secondes au lieu de 11 à 28 min par personnage ; écart du visage neutre au dessin 23,1 et 29,3 niveaux contre 20,7 et 26,5 dessinés sur place (+ 2,4 à 2,9) ; cadre transféré à 5 px et 2 % du cadre LivePortrait de la scène | chaque scène |
| Scène composée (duo dans un décor) | 3 à 13 min selon la charge du processeur | une fois par duo et par décor, ensuite en cache |
| Épisode v15 (voix → export TikTok) | 12 min 43 s, dont tournage 8 min 14 s, pour 69 s de film (processeur partagé) | chaque épisode |
| Épisode v16, processeur libre | tournage 5 min 34 s (rendu 290 s), flou 41 s, montage 59 s, essai des visages 15 s, planche 8 s | chaque épisode |
| Juge unique (9 portes) | 33 s, plus 47 s pour les boîtes d'un film déjà tourné (0 s quand le tournage les écrit) | chaque épisode |

**Accélérations du 20/10/2026 (« 13 minutes, diminue encore ») :**
- fichier TikTok 1080 × 1920 écrit par la MÊME passe ffmpeg que le film (`COMPOSE_TIKTOK`) : l'export séparé (2 min 14 s sur
  la v15) disparaît ;
- préréglage x264 `veryfast` mesuré (17,5 s contre 30,9 s pour 10 s de film, SSIM 0,993) ;
- essai des visages gardé en cache tant que la bibliothèque ne change pas (45 s → 0 s) ;
- profil py-spy du tournage : fumée du grill 13 % (plus calculée hors champ), collage des acteurs 9 % (limité à la zone vue) ;
- juge unique (33 s) à la place des 18 portes (≈ 16 min) ;
- veille REA au nice 19 : le tournage passe toujours avant.

**Viralité mesurée après publication** : `viralite.py` (API Display de TikTok en lecture seule si le compte est connecté,
relevé à la main de TikTok Studio, ou export CSV) ; `serie.py marche` relève au plus une fois par heure ; le rapport compare
les mécaniques de chute dès 6 vidéos mesurées. En fin de film, un vote en commentaire (« Qui est le plus malin ? 1, 2 ou 3 »)
tiré des personnages qui portent les chutes.

**Sur ce conteneur (4 processeurs) :**
- environ 4,7 épisodes à l'heure, soit environ 110 par jour ;
- les 10 000 en environ 3 mois de marche continue, une fois les 54 bibliothèques faites.

**Greffes en cours pour aller plus vite, gratuites :**
1. Tournage parallèle de deux épisodes quand la mémoire le permet.
2. Rendu LivePortrait sur la carte graphique gratuite (crédits Modal du compte de l'utilisateur, plafond dur dans le code),
   dès que le jeton Modal est ajouté aux secrets de l'environnement.
3. Les mêmes commandes sur une seconde machine gratuite, avec la bibliothèque copiée.
