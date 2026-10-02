---
name: videos-du-jour
description: Produire les 2 à 3 vidéos TikTok Afrikatoon du jour pour @comedyvideos_100, entièrement dans la session (Claude écrit les sketchs, rendu dessin animé 2D propre ou 3D Blender, voix gratuites), puis les envoyer à l'utilisateur prêtes à publier. Se déclenche avec "vidéos du jour", "fais mes vidéos", "génère 3 vidéos", "lot du jour", "production du jour", ou une routine quotidienne Afrikatoon.
---

# Vidéos du jour — Afrikatoon 3D

Objectif : 2 à 3 vidéos > 1 minute, drôles, à fort potentiel de percée TikTok, livrées sur le téléphone
de l'utilisateur avec leur légende. Tout se fait ici, sans API payante : **c'est toi (Claude) qui écris
les sketchs**, `afrikatoon-auto/run.py lot` fait le rendu 3D (Blender) + voix + montage.

Nombre de vidéos : celui demandé, sinon 3.

## 1. Préparer (1 min)

- Vérifier l'environnement : `python3 -c "import bpy"` et `ls /usr/share/mbrola/fr1`. Sinon lancer
  `CLAUDE_CODE_REMOTE=true bash afrikatoon-auto/scripts/setup_env.sh`.
- Lire `afrikatoon-auto/state/history.json` (titres, conflits et twists déjà faits : ne jamais refaire
  le même couple conflit × twist ni le même titre) et `afrikatoon-auto/state/stats.json` s'il existe
  (performances réelles : privilégier les duos/conflits/hooks qui ont le mieux marché).
- Lire `afrikatoon-auto/afrikatoon/bible.py` (personnages, décors, conflits, twists) et
  `afrikatoon-auto/examples/kit_exemple.json` (format exact d'un kit).

## 2. Écrire les kits (toi-même)

Un fichier JSON par vidéo dans `afrikatoon-auto/kits/<AAAA-MM-JJ>/<NN>-<slug>.json`, au format de
`kit_exemple.json` : `title, concept, characters, setting, theme{conflict,twist,setting}, scenes[],
hook_text, caption, hashtags, score`.

Moteur par défaut : **photo** (`--mock photo`) — anime les images réalistes de l'utilisateur
(`afrikatoon-auto/assets/`, voir `assets/README.md`) : ≈ 5-8 min par vidéo. N'utiliser que des
personnages et décors présents dans `assets/` (`python run.py assets planche` pour voir la galerie).
L'utilisateur a rejeté le rendu 2D dessiné par code ; 3D Blender (`--mock 3d`) seulement si demandé.
Nouvelles images reçues → `python run.py assets importer <fichiers> [--perso NOM]`, puis regarder la
planche de contrôle et corriger `mouth` dans `meta.json` si la croix rouge n'est pas sur la bouche.

Contraintes du rendu (sinon ça ne s'affiche pas) :
- Personnages (18, voir `bible.CHARACTERS`) : MODOU, BAYE, TANTIE AWA, PETIT MAMADOU, COUMBA,
  TONTON DIENG, MAITRE KONE, DOCTEUR SYLLA, FATOU, ADJOUA, KOFFI, GRAND-PERE NDIAYE, MAMIE BINTOU,
  ALIOU, CHEF TRAORE, AMINATA, BOUBACAR, MAMAN NOUNOU ; 1 à 3 par scène (2 de préférence).
  Leurs accessoires (téléphone de Fatou/Aminata, canne, lunettes, stéthoscope, panier…) sont automatiques.
- Décors (`setting`) : cour, salon, plage, marche, village, ceremonie, hopital, ecole, maquis, taxi,
  salon_coiffure.
- Accessoires de décor dessinés si le mot est dans `image_prompt` : `ram` (mouton, + `ribbon`),
  `air conditioner`, `receipt` (dans la main de PETIT MAMADOU), `chicken`/`yassa`, `TV`, `cooking pot`.
  Le reste du gag passe par les répliques et les émotions.
- Variété : dans chaque lot, au moins un personnage peu utilisé (vérifier l'historique) et des décors
  différents. 18 personnages × 11 décors × 30 conflits × 11 twists = des milliers de combinaisons.
- Émotions reconnues dans `image_prompt` (dans la phrase qui commence par `NOM:` du personnage) :
  `furious finger pointing` (colère, « !! » rouges), `smug innocent shrug` (mauvaise foi),
  `jaw dropped… shock` / `eyes bulging out` (choc, « ?! »), `hands on head in despair`,
  `sweating nervously` (sueur), `arms crossed, unimpressed raised eyebrow`, `laughing so hard`.
- 8 scènes, `beat` : hook, escalade…, twist, chute. 1 à 3 répliques par scène, 12 mots max,
  écrites pour l'oral (la synthèse vocale les lit telles quelles : écrire les nombres en lettres si
  ambigu, éviter les abréviations).

Règles d'écriture pour un **score de percée élevé** (l'audience veut « mourir de rire » : chaque
vidéo doit être plus drôle que la précédente) :
0. Combiner au moins 3 procédés de `bible.COMIC_DEVICES` (règle de trois, callback, mauvaise foi,
   ironie dramatique, exagération croissante, quiproquo de langue, regard caméra après un mensonge…).
   Une réplique drôle toutes les 3 secondes : toute réplique purement informative est réécrite.
1. **Hook** : la 1re réplique est une accusation, un cri ou une révélation, dans la seconde 1.
   `hook_text` (3-7 mots, affiché en géant 3 s) pose une énigme : « Il a juré sur son climatiseur »,
   « L'enfant a tout balancé ».
2. **Escalade** : chaque réplique plus absurde ; mauvaise foi totale ; logique absurde mais imparable.
3. **Running gag** qui revient 2-3 fois et explose à la chute.
4. **Twist** (scène 7) : l'accusateur est coupable / l'enfant dit la vérité / l'objet trahit.
5. **Chute** (scène 8) en moins de 10 mots, jamais expliquée ; dernier personnage = celui qui se fait
   démasquer (gel sur son visage choqué).
6. 1 expression forte par scène (« Walay », « Dëgg », « yako », « c'est pas mon palabre »).
7. Familial, sans politique, religion moquée, violence ni stéréotype dégradant.
8. `caption` : question d'engagement qui force à choisir un camp (« Team Modou ou team Baye ? »).
   6-8 hashtags dont #drole #comedy #humourafricain #pourtoi.
9. Varier : jamais deux fois le même duo dans le lot du jour ; formats variés (sketch 3 actes,
   ou « la blague du jour » : 4 blagues de 2 scènes).

Auto-évaluation obligatoire avant rendu (`score`, sur 10) : `hook`, `universalite`,
`reproductibilite`. **Réécrire tout kit dont un score est < 8.** Valider ensuite :
`cd afrikatoon-auto && python3 -c "import json,sys;from afrikatoon import scenario;[scenario.validate_kit(json.load(open(f))) for f in sys.argv[1:]]" kits/<date>/*.json`

## 3. Rendu (en arrière-plan)

```bash
cd afrikatoon-auto && python run.py lot kits/<date>/*.json --mock photo > /tmp/lot.log 2>&1
```
Lancer avec `run_in_background` (photo ≈ 5-8 min par vidéo ; 3D ≈ 30-60 min). Prévenir
l'utilisateur du délai, ne pas attendre avec `sleep`. Si `VOICE_MODE=local` et Chatterbox est
installé (huggingface.co autorisé dans le réseau), les voix clonées de `state/voice_refs/` sont
utilisées ; sinon voix MBROLA.

## 4. Livrer

Pour chaque vidéo terminée (`afrikatoon-auto/output/*/final.mp4`) :
- l'envoyer avec SendUserFile (`status: proactive`, `display: render`), légende = titre — **toujours
  afficher les vidéos ici dans la conversation**, dès que chacune est prête ;
- donner dans le message : `caption.txt` prêt à coller, l'heure de publication conseillée
  (12h-14h ou 19h-22h GMT, espacer les vidéos d'au moins 3 h) et le rappel de cocher
  « contenu généré par IA » dans TikTok.

Puis committer et pousser `afrikatoon-auto/kits/` et `afrikatoon-auto/state/history.json`
(jamais `output/`).

## 5. Apprendre des résultats

Quand l'utilisateur envoie ses statistiques TikTok (captures TikTok Studio ou chiffres), les ajouter à
`afrikatoon-auto/state/stats.json` : `{"titre", "vues", "retention_pct", "likes", "partages",
"commentaires", "duo", "conflit", "hook_text"}`. Classer, repérer ce qui marche, et l'appliquer au
lot suivant (garder les gagnants, tester 1 pari par lot).
