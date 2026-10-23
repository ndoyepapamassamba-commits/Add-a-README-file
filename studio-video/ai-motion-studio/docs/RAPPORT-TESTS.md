# Rapport de tests et de non-régression

Mise à jour : 23/10/2026 (Autopilote, consigne embarquée, export H.264 par le serveur local, vitesse du moteur V1). Première version : 22/10/2026. Seuls des résultats **réellement exécutés** figurent ici. Les journaux bruts sont produits dans `tests/resultats/e2e.json`, fichier non versionné que chacun peut régénérer.

## Environnement

| Élément | Version |
|---|---|
| Node.js | 22.22.0 |
| Navigateur | Chromium 141.0.7390.37 (Playwright 1.56.1), sans codecs propriétaires |
| Lecture des fichiers exportés | ffprobe / ffmpeg 6.1.1 |
| Serveur | `serveur/serveur.mjs` réel, port 8790, `PAYANT_AUTORISE=0`, dossier de données temporaire |

- Pour les tests e2e, le réseau des Spaces est **simulé fidèlement**. Le protocole Gradio sse_v3 est complet : `/config`, `/upload`, `/queue/join`, `/queue/data` (flux d'états), `/file=`. Les configurations sont celles relevées en direct le 22/10/2026 (`tests/fixtures/configs`).
- Tout autre accès externe est coupé pendant les tests.

## 1. Tests unitaires : 26 sur 26 réussis

Commande : `npm run test:unitaires` → `# tests 26 · # pass 26 · # fail 0` (23/10/2026).

| Fichier | Tests | Ce qui est vérifié |
|---|---|---|
| `noyau.test.cjs` | 10 | Capacités déduites des 5 configurations réelles ; valeurs transmises par libellé et bornées ; entrée obligatoire refusée ; aucun prix inventé ; flux SSE (file, calcul, progression) ; erreurs quota et file sans GPU en français ; appel complet simulé, jeton envoyé seulement au Space ; tâches (états, double soumission, concurrence, annulation, coupure réseau, reprise unique, restauration) ; migration v2 → v3 et filtre des secrets ; assistant de consigne (idée gardée, 11 préréglages) |
| `serveur.test.mjs` | 7 | Santé sans secret ; tâche payante refusée (403) et demande invalide (400) ; fichiers protégés et origine étrangère refusés ; limite de débit (429 à la 31e requête) ; journal caviardé ; en-têtes Runway conformes au SDK 4.22.0 (`fetch` simulé, aucun appel payant) ; Kling non configuré tant que l'adresse n'est pas renseignée |
| `meta.test.cjs` | 5 | Consigne embarquée dans 4 fichiers **réels produits par ffmpeg** : MP4 « fast start », MP4 avec moov en fin, WebM avec SeekHead et Cues, WebM en direct sans index. Pour chacun : ffprobe lit le titre, la consigne et le JSON complet ; **framemd5 identique** à l'original (aucune image ni échantillon de son modifié) ; décodage intégral sans erreur ; réembarquer ne fait pas grossir le fichier. API Blob (embarquer, lire), format inconnu refusé |
| `transcodage.test.mjs` | 4 | Conversion **réelle** WebM VP9 + Opus → MP4 H.264 + AAC 48 kHz par ffmpeg ; contrôle renvoyé (ffprobe : h264, aac, 480 × 272, 2,0 s ; décodage intégral sans erreur ; son présent) ; moov avant mdat ; fichiers temporaires supprimés ; format refusé (415) ; sans ffmpeg : 503 en français |

## 2. Tests e2e : 20 sur 20 réussis (les 17 de la mission + 3 de l'Autopilote)

Passage final : 23/10/2026, de 11:07:15 à 11:09:30 UTC, `20 passed (2.2m)` ; unitaires relancés juste après : 26/26. Premier passage du jour : 18/19 (défaut de l'application trouvé par le test 02, corrigé, voir plus bas), puis 19/19, puis le test 20 ajouté. Passage du 22/10/2026 : 17/17.

| # | Test de la mission | Vérification réelle |
|---|---|---|
| 1 | Ouverture sans clé API | Les 9 sections s'ouvrent. Aucune erreur JavaScript, aucune requête vers un fournisseur payant, aucune clé dans le stockage. Les moteurs gratuits sont proposés en texte → vidéo et en image → vidéo. |
| 2 | Mode démo identifié | La puce passe à « MODE DÉMO » et seul le moteur Démo est proposé. Le résultat est marqué `demo` et son nom commence par `DEMO-`. Le **bandeau orange est mesuré dans l'image** de la vidéo (R > 200, B < 90), et la médiathèque affiche l'étiquette DÉMO. Le WebM du MediaRecorder porte la consigne (ffprobe : `comment` = « Essai démo », JSON `nature: demo`) et se décode en entier ; étiquette « consigne embarquée ». |
| 3 | Import d'une image | Aperçu (640 px), refus du GIF (« Format accepté : JPG, PNG ou WEBP »), import dans la médiathèque |
| 4 | Création d'un prompt | L'idée reste en tête, mot pour mot. Chaque ajout est sourcé (sujet + action, caméra, éclairage, préréglage). La consigne finale reste modifiable et la saisie d'origine est intacte. |
| 5 | Validation des paramètres | Bornes lues en direct (0,5 à 5 s, `max=5`). Messages vérifiés : « Importez une image de départ. », « Durée maximale : 5 s. », « Écrivez une consigne. », « Ce moteur exige une image de fin. ». Aucune tâche créée. |
| 6 | Soumission avec connexion configurée | Jeton Hugging Face vérifié (`whoami-v2` simulé). Séquence `/config → /upload → /queue/join → /queue/data → /file=` complète. Le corps de `join` porte l'image envoyée, la consigne exacte, 4 étapes et 2 s. Le jeton est présent sur **chaque** requête au Space. La graine 4242 est récupérée. |
| 7 | États et erreurs | Journal : attente, envoi, en cours, finalisation, terminée. Affichés en direct : « Rang dans la file du service : 3 » et « Progression donnée par le service : 25 % ». Coût affiché. Quota épuisé : « Quota GPU gratuit du jour épuisé ». File sans GPU : reprise automatique annoncée, puis annulation par l'utilisateur. |
| 8 | Récupération de la vidéo | Lecteur en `blob:`, 2,0 s, 480×272. Le fichier téléchargé `IA-plan-recuperation-xxxx.webm` a **les mêmes images et le même son** que le clip servi (framemd5 identique) et porte sa consigne : `comment` = « Plan récupération », JSON avec la graine 4242, le moteur `wan22-i2v-rapide`, le mode `i2v` (moins de 4 Ko ajoutés). Étiquette « généré par IA » dans la médiathèque. |
| 9 | Ajout à la timeline | Plan de type vidéo, durée réelle d'environ 2,0 s, bloc visible dans la piste |
| 10 | Lecture et synchronisation image et son | La source audio est détectée. Pendant la lecture, l'écart entre le temps du montage et celui de la vidéo reste sous 0,25 s (deux mesures), avec le son non coupé. La pause est respectée. |
| 11 | Découpage et transitions | Découpe au curseur : 3 plans, 1,0 s et 1,0 s, reprise de la source à 1,0 s. Les **10 transitions d'origine** sont rendues. Au milieu du fondu au noir, la luminance est inférieure à la moitié de la coupe franche ; au milieu du fondu au blanc, elle est supérieure. |
| 12 | Sauvegarde et réouverture | Sauvegarde automatique horodatée, actualisation de la page, état identique (plans, mouvements, médias, textes, sous-titres, nom). Le fichier `.massamba.json` v3 contient les médias en data URL et se rouvre à l'identique dans un navigateur vierge. |
| 13 | Export final | Ce Chromium n'a pas d'encodeur H.264 : le rendu image par image (VP9 + Opus) est **converti en H.264 + AAC 48 kHz par ffmpeg sur le serveur local**, contrôlé par ffprobe et décodé en entier, puis « Export validé » par l'application. Relu par ffprobe : h264 1280×720 + aac, durée à moins de 0,35 s du montage, consigne du montage embarquée (`Plan 1 (1,5 s) : …`, JSON `type: montage`) et relue. |
| 14 | Interruption réseau | Coupure pendant l'entrée en file : « Connexion réseau interrompue… ». Hors ligne : « Pas de connexion réseau… » et bandeau « Hors ligne ». Retour du réseau, puis relance depuis l'Historique : terminée. |
| 15 | Protection des clés | Le jeton est vidé du champ, absent du stockage local, de la sauvegarde IndexedDB, du fichier projet, de l'historique exporté et de la page. Il n'est envoyé qu'au Space et à `huggingface.co`, jamais au serveur local. Le code livré ne contient aucun motif de clé. Les voies payantes sont grisées et refusées même par appel direct (aucune tâche créée). |
| 16 | Anciens projets | Projet v2 **produit par MASSAMBA Motion Studio 2 lui-même** (Playwright sur le fichier d'origine) : plans (identifiants, médias, mouvements, durées, transitions), médias, textes, étalonnage et i/s rouverts à l'identique. Note de migration affichée. Rendu non uniforme. |
| 17 | Non-régression du montage | Les 117 identifiants et les 13 listes de réglages de l'original sont présents. Mouvement, image clé, texte, annuler et rétablir fonctionnent. Les 14 mouvements se rendent avec une image non uniforme. L'étalonnage « noir » est désaturé (saturation inférieure à 20 % de l'image couleur). PNG valide (signature), planche contact, lecture. |

| 18 | Autopilote de bout en bout (nouveau) | Une idée de deux phrases, voie démo, 6 s, 9:16 : écriture (modèle de texte coupé dans les tests → **repli local annoncé**), 2 plans dont les narrations sont les deux phrases mot pour mot, consignes, génération, montage (2 plans, fondus, 2 sous-titres, nappe « pulse »), export **H.264 720×1280 + AAC** validé, durée à moins de 0,35 s du montage, décodé en entier ; consigne `Idée : …` et JSON `type: autopilote` avec les 2 plans écrits et les réglages. Les 6 étapes finissent « fait ». |
| 19 | Autopilote : chaîne de secours (nouveau) | Quota épuisé simulé sur LTX-2.3 : la tâche échoue avec « Quota GPU gratuit du jour épuisé », la chaîne Pollinations → Wan échoue (réseau coupé), **LTX-Video distillé rend le plan** ; film validé ; le fichier nomme le moteur retenu ; aucune requête vers un fournisseur payant. |
| 20 | Autopilote, voie troupe (nouveau) | Serveur V1 simulé dans le navigateur (catalogue de 2 sketchs, grille de ton, tâche, vidéo MP4) : les mots de l'idée désignent « LE DIRECT DU MARCHÉ » ; la grille de ton est consultée avec ce sketch avant le tournage ; la tâche est suivie jusqu'à « terminée » ; voix, rires et sous-titres annoncés « faits par le moteur V1 » ; film validé ; consigne = titre + répliques avec la chute, JSON `mode: v1`, `modeleId: moteur-v1`. |

### Défauts trouvés par ces tests et corrigés dans l'application

0. (23/10/2026) **Étiquette « consigne embarquée » absente des vidéos générées** : l'opérateur ternaire de l'étiquette d'origine absorbait l'ajout, qui ne s'affichait que pour les médias importés. Parenthèses ajoutées (`js/app.js`, `rendreMedias`). Trouvé par le test 02.

1. **Course entre deux vérifications de moteur.** Une vérification en direct lente, lancée pour le moteur précédent, se terminait après celle du moteur choisi. Elle écrasait l'affichage, puis les capacités enregistrées (exemple : « Ce moteur ne fait pas image → vidéo » sur Wan 2.2). Désormais, la vérification la plus récente l'emporte toujours (`js/app.js`, `majCaps`).
2. Les autres échecs des deux premiers passages venaient des tests eux-mêmes :
   - utilitaire qui ne transmettait pas son argument ;
   - champ caché dans un onglet ou une section repliée ;
   - instant de mesure placé au début de la transition au lieu de son milieu ;
   - attente de la vraie sauvegarde ;
   - valeur de l'option d'export ;
   - modèle Runway image seulement.

   Tous ont été corrigés et le passage final les couvre. Historique des passages : 5/17, puis 14/17, puis 16/17 (import asynchrone compté trop tôt), puis **17/17**.

## 3. Essais réels (services et moteurs réels, hors simulation)

| Essai | Résultat mesuré |
|---|---|
| I2V Wan 2.2 sur le vrai Space, depuis Node, avec le même client `gradio.js` (22/10, 20:52 UTC) | Calcul effectué sur le GPU du Space (26,7 s), mais **téléchargement du clip refusé (403)** depuis le conteneur : plusieurs répliques derrière le proxy. À confirmer dans le navigateur de l'utilisateur, qui garde sa connexion vers la même réplique. |
| T2V LTX-2.3 anonyme (22/10, 20:52 UTC) | **Échec** : quota GPU anonyme épuisé (« 37 s restantes »). Message correctement traduit par l'application. |
| Chromium du conteneur vers les Spaces réels | Impossible : certificat du proxy non reconnu par le magasin NSS du navigateur (vide). Le contournement par désactivation des vérifications TLS a été écarté. |
| Conversion H.264 par le serveur local (23/10, route `/api/transcoder`) | WebM VP9 + Opus de 2 s → MP4 H.264 + AAC en **234 ms**, contrôle ffprobe renvoyé (60 images, décodage sans erreur, crête du son −18 dB) |
| Moteur V1, réglages de la fabrique (23/10, `OMP_NUM_THREADS=1`, 4 processus, machine libre), même sketch « LE TÉLÉPHONE QUI ÉCOUTE » | **306 s** au total (voix 34,6 · visages 33,8 · tournage 157,7 dont rendu 95 s · montage 35,5) contre 3 641 s la veille ; portes : 8 sur 9 (durée d'épisode seule) |
| Moteur V1, sketch **neuf** « salon-mois » (salon de coiffure, 6 répliques, 20,4 s), décor préparé, visages préchauffés, rires et ambiance pendant le tournage (23/10, 10:33–10:35 UTC) | **121 s de bout en bout** : voix 18,2 · bouches 0,0 · visages 0,2 · rires 1,7 · ambiance 2,6 (en parallèle) · tournage 74,0 (613 images **toutes tournées**, 0 reprise de cache) · flou 6,2 · montage 20,5 · planche 1,6. Vidéo H.264 1080×1920 30 i/s + AAC ; portes : 8 sur 9 (la porte « fichier » demande un épisode de plus de 60 s) |
| Moteur V1, premier sketch sur un décor jamais tourné (marché, 23/10) | Arrêté par moi après 5 min : py-spy montre la **préparation du décor** (décor vivant étiqueté par le juge visuel local Idefics3) sur **un seul cœur** à cause d'`OMP_NUM_THREADS=1`. Remède greffé : cette préparation passe dans le préchauffage du serveur, une fois par décor, avec tous les cœurs |
| Préchauffage des 6 décors (23/10, une seule fois, mémorisé ensuite) | Visages : 418 s à froid. Décors : gare de gbaka 198 s, marché 165 s, atelier de couture 182 s, bureau 171 s (deux répliques neutres pour les décors sans sketch en réserve) ; téléphone et salon déjà prêts. Les 6 décors sont prêts |
| Moteur V1, sketch « marche-direct » (marché), décor préparé (23/10, 11:00 UTC) | **93 s** de bout en bout, 675 images toutes tournées ; voix déjà en mémoire depuis l'essai interrompu (2,7 s au lieu d'environ 18 s). Portes : 8 sur 9 (durée d'épisode seule) |
| Moteur V1, sketch **écrit pour l'essai** « LA ROBE DU MARIAGE » (atelier de couture, décor jamais tourné avant ce jour, voix neuves), grille de ton conforme (23/10, 11:04 UTC) | **126 s** de bout en bout : voix 14,2 · tournage 77,8 (617 images toutes tournées) · montage 25,2. Vidéo H.264 1080×1920 + AAC, 20,6 s. Portes : 7 sur 9 — la porte « fichier » (durée d'épisode) et la porte **« vie » : 2,5 s d'images identiques à la fin**, pendant la réaction figée sur ce décor intérieur sans élément vivant (voir § 4) |
| Moteur V1 par l'API de l'application (`POST /api/taches`, sketch « LE TÉLÉPHONE QUI ÉCOUTE », Blaise et Odette, 7 répliques) | **Terminée** à 22:20 UTC. Vidéo `tiktok-1080x1920.mp4` récupérée par `GET /api/taches/…/video` (200, 14,0 Mo), lue par ffprobe : H.264 1080×1920, 30 i/s, AAC 48 kHz, 22,5 s. Juge unique du moteur : **8 portes sur 9** — synchro labiale (décalage 0 ms), parleur lisible 100 %, têtes entières, vie (0 s d'immobilité), fluidité (0 saut, 0 à-coup), rythme (13,3 plans/min), lieu, son (−14,1 LUFS, crête −2,1 dBTP, limiteur 4,1 %) ; la porte « fichier » échoue **seulement sur la durée** (elle exige un épisode de plus de 60 s, soit 3 sketchs ; l'essai n'en compte qu'un). Durée de fabrication : 3 641 s, dont 3 382 s de tournage, sur 4 cœurs partagés avec la préparation de la fabrique. |
| Voix Piper locale (`/api/voix`) | Fichier WAV produit (essai du 22/10) |

## 4. Points ouverts : greffe en cours

| Point | Action | Mesure de réussite |
|---|---|---|
| Export H.264 + AAC | **Fait le 23/10** : conversion par ffmpeg sur le serveur local quand le navigateur n'a pas l'encodeur (tests 13 et 18). Reste à confirmer le chemin direct (encodeur du navigateur) dans Chrome ou Edge de l'utilisateur. | ffprobe lit `h264` + `aac` sur un export fait dans Chrome ou Edge |
| Première génération réelle reçue dans le navigateur | Essai dans le navigateur de l'utilisateur, avec son compte Hugging Face gratuit | Clip consigné « Terminée » dans l'Historique |
| Durée de fabrication V1 | **Atteint le 23/10** : 121 s (salon), 93 s (marché), 126 s (atelier, sketch écrit pour l'essai), sur 4 cœurs, décors préchauffés au démarrage du serveur. | Mesuré : moins de 180 s sur 3 décors ; à refaire sur la machine de l'utilisateur |
| Vie de l'image pendant la réaction finale sur décor intérieur | Atelier de couture : 2,5 s d'images identiques à la fin (porte « vie »). Greffe en cours : micro-mouvement garanti pendant la tenue finale (souffle visible, poussée de caméra de 1 à 2 %) quand le décor n'a aucun élément vivant, puis nouvelle mesure de la porte. | Porte « vie » réussie sur l'atelier de couture |
