# Studio IA — sketchs d'Abidjan pour TikTok

Chaîne de production de micro-sketchs 3D (style Pixar), personnages ivoiriens, voix à l'accent d'Abidjan,
assemblés en compilations d'au moins 62 s (seuil de monétisation).

| Étape | Outil | Coût mesuré |
|---|---|---|
| Image de départ 4:3 | `google/gemini-3.1-flash-lite-image` (OpenRouter) | 0,034 $ |
| Vidéo parlante 6 à 10 s, 480p | `x-ai/grok-imagine-video-1.5-lite` (OpenRouter) | 0,02 $/s + 0,01 $ |
| Contrôle du dialogue | faster-whisper (local, gratuit) | — |
| Contrôle de l'accent à l'oreille | `google/gemini-3.8-flash` (ecouter.py) | < 0,01 $ |
| Musique de fond originale | `google/lyria-3-pro-preview` | 0,08 $ le morceau |
| Habillage et compilations | ffmpeg + Pillow (local, gratuit) | — |

Environ 0,18 $ par sketch.

## Fichiers

- `sketchs/lot0.json`, `lot5.json` … `lot8.json` : les sketchs (titre, décor, personnages, poses, dialogue, jeu d'acteur,
  chute, emoji, mots-clés colorés) ; `programme.json` : composition des compilations ; `archives/` : anciens lots 1 à 4 ;
  `brouillons/` : candidats soumis au jury avant tournage.
- `ecrire.py` : atelier à plusieurs plumes (Grok, GPT, Gemini, DeepSeek) ; `--reecrire` réécrit les sketchs les plus vus
  de la chaîne (`prive/originaux_top.json`, hors du dépôt, transcrits des deux vidéos à 2,4 M de vues).
- `jury.py` : jury d'humour AVANT tournage — panel de trois juges de familles différentes, classement à l'aveugle avec la
  référence de la chaîne mélangée parmi les candidats ; `--groupes` : chaque réécriture contre SON original ; repérage
  des blagues ou situations déjà tournées dans tout le catalogue.
- `generer.py` : images → vidéos → contrôle (dialogue), écoute (accent, notes DRÔLE / NATUREL), reprises. Ne relance jamais
  une vidéo déjà payée ; s'arrête avant d'épuiser la clé.
- `regarder.py` : contrôle à l'œil du réalisme (apparition, disparition, fusion de personnages) et de la synchro (le bon
  personnage parle à l'écran).
- `verifier.py` : tenues en double sur toute la chaîne, dialogues sans marqueur ivoirien, cohérence du programme.
- `chaine.py` : montage au design de la chaîne (bandes du haut et du bas, cartes, sous-titres karaoké, vote, carte de fin,
  rires, musique). `monter.py` : ancien montage à fond flou, dont `chaine.py` reprend les utilitaires.
- `or_api.py` : appels OpenRouter et journal des dépenses (`sortie/depenses.jsonl`).
- `transcrire.py` : transcription mot à mot.
- `ecouter.py` : fait écouter un son par Gemini (accent, voix dans une musique, rires).
- `comparer.py` : comparatif de moteurs vidéo sur un même sketch.
- `musique.py` : compose une musique de fond avec Lyria 3.
- `habillage/` : polices Poppins et Montserrat (licence OFL), emojis 3D Fluent de Microsoft (licence MIT), boucle de musique
  `fond_musical.m4a` (Lyria, passage sans voix) et rires `rires/` (générés par Grok).
- `prive/` (non suivi) : logo et nom de la chaîne ; `sortie/` : images, clips et compilations (non suivis par git).

## Leçons des tests (24/10/2026)

- L'accent ivoirien vient surtout du **texte** : un dialogue en français populaire d'Abidjan (« tu as marié papa-là ? »,
  « il avait cheveux et salaire dêh ! », « Tonton », « mon vieux ») sort avec l'accent ; un français standard sort
  « accent de France », même avec la consigne. La consigne de voix est aussi placée en tête du prompt.
- Grok Imagine 1.5 Lite + cette consigne : 7 clips sur 7 jugés ivoiriens / ouest-africains au 2ᵉ test ; Veo 3.1 Lite
  (option `--moteur=veo`) sert de secours, 2,4 fois plus cher.
- Chaque sketch a une chute propre (`chute`) au lieu du même gros plan choqué.

## Leçons des tests 3 et 4 (25-26/10/2026)

- Personne ne marche pendant qu'il parle (sinon les personnages se déforment ou fusionnent) ; la réaction finale et le zoom
  ne partent qu'APRÈS la dernière réplique ; celui qui parle garde le visage tourné vers la caméra.
- Écriture : on ouvre en plein conflit, une chute qui retourne la logique et touche deux cibles (référence : « Papa, qui
  m'a donné mon intelligence ? — Ça doit être ta mère, moi j'ai encore la mienne »). Le jury IA trie les candidats mais
  sous-note la référence : il aide à choisir, il ne remplace pas le goût du public.
- Ordre des compilations (règle de l'utilisateur) : du plus drôle au moins drôle, le meilleur en premier pour accrocher ;
  toutes les chutes doivent se valoir, un clip nettement en dessous des autres est écarté.

## Leçons des tests 5 et 6 (26/10/2026)

- Moteurs (même image, même consigne, sketch 308) : Grok Imagine 1.5 Lite reste le meilleur rapport (≈ 0,02 $/s, accent
  ivoirien, naturel 8/10) ; Seedance 1.5 Pro 0,26 $ pour 11 s, naturel 4/10 ; Seedance 2.0 Mini 1,6 fois plus cher et
  « accent de France » (24/10) ; HeyGen Video 0,11 $ mais « accent de France », naturel 4/10. Les économies viennent du
  procédé : 2e écoute avant toute reprise pour accent, et ne tourner que les sketchs retenus par le jury.
- Titres : jamais la chute dans le titre (il s'affiche pendant tout le sketch) ; on nomme la situation.
- Mise en scène : une chute qui fait mettre ou enlever un objet (perruque) provoque des sauts ; pour un personnage au fond,
  préciser qu'il reste assis à la même place pendant le zoom ; une réplique très courte (« Merci Tantie ») n'est pas animée.
- Viralité : `chaine.py --boucle` ouvre sur le visage choqué de la fin du 1er sketch (« COMMENT ON EN EST ARRIVÉ LÀ ? »)
  et fond la carte de fin dans cette image, pour que la relance de TikTok soit sans couture.
- Le sketch 302 n'est pas à publier : 504 « D'où vient ma beauté ? » repose sur la même chute.

## Leçons des tests 7 et 8 (26/10/2026)

- Barre montante : les plumes reçoivent en exemple les meilleures chutes déjà validées, et le jury mélange aux candidats
  la référence ET les meilleurs sketchs du test précédent (« BARRE ») ; on ne tourne que ce qui passe devant.
- Classiques mondiaux : les palmarès (Fringe d'Édimbourg, LaughLab) sont surtout des jeux de mots anglais intraduisibles ;
  ce qui se transpose, c'est le mécanisme des classiques (Henny Youngman « la même femme depuis cinquante ans », le fou à
  contresens, Tommy Cooper, Rodney Dangerfield) avec une situation d'Abidjan.
- Écartés par prudence de monétisation : une chute sur une chirurgie des fesses (contenu jugé suggestif par TikTok).
- Mise en scène : deux mains déjà prises = aucun geste de plus (sinon un bras en trop) ; un accessoire tenu doit être
  « un seul » (sinon il se dédouble) ; un personnage qui parle ne boit pas (sa bouche doit rester visible).

## Mode économique (test 9, 26/10/2026)

- 80 % de la dépense est la vidéo Grok : on paie le moins de secondes possible. `generer.py devis ids…` estime la durée
  finale de la compilation avant de payer (écart mesuré < 1 s).
- `chaine.py --rejouer` : 4 clips payés suffisent pour dépasser 62 s ; entre deux sketchs, transition fabriquée sans
  frais : REPLAY de la chute (zoom, son, sous-titres), RIRE-O-MÈTRE (« MORT DE RIRE 💀 ») avec l'appel « TU AS RI ? ÉCRIS
  « DÊH » EN COMMENTAIRE », puis la carte du sketch suivant. Test 9 : 64,1 s pour environ 1,1 $ (contre environ 3 $).
- Les sketchs validés par le jury mais non tournés forment une réserve : pas de frais d'écriture pour la vidéo suivante.

## Gags 3D libres de droit (test 10, 26/10/2026)

- `chaine.py --rejouer` insère, si le sketch a un champ `"gag": [nom, légende]`, un extrait de film de la Blender
  Foundation après le replay, avec une légende façon mème (« PAPA EN CHERCHANT SA CEINTURE : »), des émojis qui rient et
  le crédit obligatoire « (CC BY) Blender Foundation | studio.blender.org » (aussi sur l'écran final). Gags : `GAGS` dans
  chaine.py. Ne sont utilisés que les films dont la licence est vérifiée : Big Buck Bunny (CC BY) et Caminandes 3
  « Llamigos » (licence « Attribution » sur video.blender.org) ; Caminandes 1 est écarté (licence non précisée).
- Téléchargement (dans `sortie/blender_cc/`, hors dépôt) :
  `https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip` (à décompresser) et
  `https://archive.org/download/caminandes-3-llamigos/1_Caminandes3_Llamigos_720p_vp8.ogv` (à renommer `caminandes3.ogv`).
- Format : 3 clips payés + transitions (replay, gag, RIRE-O-MÈTRE, carte) = 63,4 s pour environ 0,9 $ de production.
- Dans la description TikTok, ajouter : « Extraits 3D : Big Buck Bunny, Caminandes 3 — (CC BY) Blender Foundation |
  studio.blender.org ».

## Application HTML « Studio Comédie Abidjan » (app/)

`app/studio-comedie.html` : UN fichier à ouvrir dans Chrome ou Edge (double-clic), sans installation. Il enchaîne tout :
banque de sketchs notés (prompts image et vidéo générés avec les gabarits de `generer.py`), production image → clip →
contrôle IA avec plafond de budget, puis montage au design de la chaîne en MP4 1080 × 1920, calculé dans le navigateur.

- Construire : `python3 app/fusionner.py` (banque/brut + banque/notes → banque/selection.json), puis
  `python3 app/construire.py` (src/ + vendor/ + sons/ + banque → studio-comedie.html).
- Banque : écrite par 100 agents auteurs (fiches `banque/briefs.json` : 25 domaines × 4 mécanismes comiques, couleurs de
  tenues réservées à chaque auteur), notée par deux juges indépendants (regard CHOC et regard PUBLIC, barème
  `banque/jury.md` calé sur les meilleurs sketchs de la chaîne), dédoublonnée contre les sketchs déjà écrits.
- Banque actuelle : 1 990 sketchs écrits, 1 062 gardés (note ≥ 5,5 ; 776 à 6 et plus, 178 à 7 et plus) → 2 124 prompts ;
  rejetés : 344 « déjà vus », 214 doublons, 36 « danger », 10 trop longs (`banque/rapport.txt`).
- Sécurité des dépenses (revue adverse : 25 défauts confirmés, tous corrigés, rejoués par `test_garde`) : chaque dépense est
  réservée avant son premier `await` (plafond et plancher tiennent même avec plusieurs lancements dans le même tour) ;
  un POST payant n'est jamais renvoyé après une 5xx ou une coupure (message « vérifie openrouter.ai/activity ») ; le
  solde suit les dépenses depuis la dernière lecture et tient compte du crédit du compte (`/credits`) quand la clé n'a
  pas de limite ; prix 720p pris en compte ; une vidéo lancée n'est jamais relancée et toujours récupérée, même après
  fermeture de la page et même si la clé n'était pas mémorisée ; un seul onglet peut produire (Web Locks) ; retirer ou
  vider la file est refusé pendant une étape payée.
- Montage : lecture séquentielle mp4box.js + VideoDecoder (une recherche image par image coûtait 90 ms par image),
  encodage WebCodecs (MP4 H.264 + AAC si le navigateur sait l'encoder, sinon Opus, sinon WebM).
- Bibliothèques embarquées : mp4-muxer et webm-muxer (MIT), mp4box.js 0.5.4 (BSD-3) — licences dans `app/vendor/`.

## Utilisation

```bash
pip install faster-whisper requests pillow
python3 ecrire.py sketchs/brouillons/candidats.json 12  # quatre plumes écrivent des candidats
python3 jury.py sketchs/brouillons/candidats.json 3   # panel : classe les candidats, signale les doublons
python3 verifier.py                      # tenues en double, marqueurs ivoiriens
python3 generer.py devis ids…            # coût estimé
python3 generer.py images ids…           # images, puis : python3 generer.py planche ids…
python3 generer.py videos ids…           # vidéos (--refaire pour relancer, --moteur=veo en secours)
python3 generer.py controle ids…         # dialogue bien prononcé
python3 generer.py ecoute ids…           # accent + notes DRÔLE / NATUREL
python3 regarder.py ids…                 # réalisme + synchro
python3 generer.py reprises              # ce qui est à refaire
python3 ecrire.py --reecrire prive/originaux_top.json sketchs/brouillons/reecritures.json 2
python3 jury.py --groupes prive/originaux_top.json sketchs/brouillons/reecritures.json 2
python3 chaine.py --meilleur-d-abord --boucle NOM ids…   # ids dans l'ordre du jury ; du plus drôle au moins drôle
python3 chaine.py --meilleur-d-abord --boucle --rejouer NOM ids…   # mode économique : 4 clips + transitions gratuites
```

La clé OpenRouter est lue dans `OPENROUTER_API_KEY` (ou ajoutée par le proxy de la session Claude).
