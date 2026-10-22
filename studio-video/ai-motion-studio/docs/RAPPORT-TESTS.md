# Rapport de tests et de non-régression

Date : 22/10/2026. Seuls des résultats **réellement exécutés** figurent ici. Les journaux bruts sont produits dans `tests/resultats/e2e.json`, fichier non versionné que chacun peut régénérer.

## Environnement

| Élément | Version |
|---|---|
| Node.js | 22.22.0 |
| Navigateur | Chromium 141.0.7390.37 (Playwright 1.56.1), sans codecs propriétaires |
| Lecture des fichiers exportés | ffprobe / ffmpeg 6.1.1 |
| Serveur | `serveur/serveur.mjs` réel, port 8790, `PAYANT_AUTORISE=0`, dossier de données temporaire |

- Pour les tests e2e, le réseau des Spaces est **simulé fidèlement**. Le protocole Gradio sse_v3 est complet : `/config`, `/upload`, `/queue/join`, `/queue/data` (flux d'états), `/file=`. Les configurations sont celles relevées en direct le 22/10/2026 (`tests/fixtures/configs`).
- Tout autre accès externe est coupé pendant les tests.

## 1. Tests unitaires : 17 sur 17 réussis

Commande : `node --test tests/unitaires/noyau.test.cjs tests/unitaires/serveur.test.mjs` → `# tests 17 · # pass 17 · # fail 0`.

| Fichier | Tests | Ce qui est vérifié |
|---|---|---|
| `noyau.test.cjs` | 10 | Capacités déduites des 5 configurations réelles ; valeurs transmises par libellé et bornées ; entrée obligatoire refusée ; aucun prix inventé ; flux SSE (file, calcul, progression) ; erreurs quota et file sans GPU en français ; appel complet simulé, jeton envoyé seulement au Space ; tâches (états, double soumission, concurrence, annulation, coupure réseau, reprise unique, restauration) ; migration v2 → v3 et filtre des secrets ; assistant de consigne (idée gardée, 11 préréglages) |
| `serveur.test.mjs` | 7 | Santé sans secret ; tâche payante refusée (403) et demande invalide (400) ; fichiers protégés et origine étrangère refusés ; limite de débit (429 à la 31e requête) ; journal caviardé ; en-têtes Runway conformes au SDK 4.22.0 (`fetch` simulé, aucun appel payant) ; Kling non configuré tant que l'adresse n'est pas renseignée |

## 2. Les 17 tests obligatoires de la mission (e2e) : 17 sur 17 réussis

Passage final : 22/10/2026, de 22:13:54 à 22:15:00 UTC, `17 passed (1.1m)`.

| # | Test de la mission | Vérification réelle |
|---|---|---|
| 1 | Ouverture sans clé API | Les 9 sections s'ouvrent. Aucune erreur JavaScript, aucune requête vers un fournisseur payant, aucune clé dans le stockage. Les moteurs gratuits sont proposés en texte → vidéo et en image → vidéo. |
| 2 | Mode démo identifié | La puce passe à « MODE DÉMO » et seul le moteur Démo est proposé. Le résultat est marqué `demo` et son nom commence par `DEMO-`. Le **bandeau orange est mesuré dans l'image** de la vidéo (R > 200, B < 90), et la médiathèque affiche l'étiquette DÉMO. |
| 3 | Import d'une image | Aperçu (640 px), refus du GIF (« Format accepté : JPG, PNG ou WEBP »), import dans la médiathèque |
| 4 | Création d'un prompt | L'idée reste en tête, mot pour mot. Chaque ajout est sourcé (sujet + action, caméra, éclairage, préréglage). La consigne finale reste modifiable et la saisie d'origine est intacte. |
| 5 | Validation des paramètres | Bornes lues en direct (0,5 à 5 s, `max=5`). Messages vérifiés : « Importez une image de départ. », « Durée maximale : 5 s. », « Écrivez une consigne. », « Ce moteur exige une image de fin. ». Aucune tâche créée. |
| 6 | Soumission avec connexion configurée | Jeton Hugging Face vérifié (`whoami-v2` simulé). Séquence `/config → /upload → /queue/join → /queue/data → /file=` complète. Le corps de `join` porte l'image envoyée, la consigne exacte, 4 étapes et 2 s. Le jeton est présent sur **chaque** requête au Space. La graine 4242 est récupérée. |
| 7 | États et erreurs | Journal : attente, envoi, en cours, finalisation, terminée. Affichés en direct : « Rang dans la file du service : 3 » et « Progression donnée par le service : 25 % ». Coût affiché. Quota épuisé : « Quota GPU gratuit du jour épuisé ». File sans GPU : reprise automatique annoncée, puis annulation par l'utilisateur. |
| 8 | Récupération de la vidéo | Lecteur en `blob:`, 2,0 s, 480×272. Le fichier téléchargé `IA-plan-recuperation-xxxx.webm` est **identique octet pour octet** au clip servi. Étiquette « généré par IA » dans la médiathèque. |
| 9 | Ajout à la timeline | Plan de type vidéo, durée réelle d'environ 2,0 s, bloc visible dans la piste |
| 10 | Lecture et synchronisation image et son | La source audio est détectée. Pendant la lecture, l'écart entre le temps du montage et celui de la vidéo reste sous 0,25 s (deux mesures), avec le son non coupé. La pause est respectée. |
| 11 | Découpage et transitions | Découpe au curseur : 3 plans, 1,0 s et 1,0 s, reprise de la source à 1,0 s. Les **10 transitions d'origine** sont rendues. Au milieu du fondu au noir, la luminance est inférieure à la moitié de la coupe franche ; au milieu du fondu au blanc, elle est supérieure. |
| 12 | Sauvegarde et réouverture | Sauvegarde automatique horodatée, actualisation de la page, état identique (plans, mouvements, médias, textes, sous-titres, nom). Le fichier `.massamba.json` v3 contient les médias en data URL et se rouvre à l'identique dans un navigateur vierge. |
| 13 | Export final | « Export validé » par l'application, puis relu par ffprobe : `mon-film-….mp4` en **VP9 1280×720 + Opus, 3,02 s pour un montage de 3,01 s**. Décodé en entier par ffmpeg sans erreur. |
| 14 | Interruption réseau | Coupure pendant l'entrée en file : « Connexion réseau interrompue… ». Hors ligne : « Pas de connexion réseau… » et bandeau « Hors ligne ». Retour du réseau, puis relance depuis l'Historique : terminée. |
| 15 | Protection des clés | Le jeton est vidé du champ, absent du stockage local, de la sauvegarde IndexedDB, du fichier projet, de l'historique exporté et de la page. Il n'est envoyé qu'au Space et à `huggingface.co`, jamais au serveur local. Le code livré ne contient aucun motif de clé. Les voies payantes sont grisées et refusées même par appel direct (aucune tâche créée). |
| 16 | Anciens projets | Projet v2 **produit par MASSAMBA Motion Studio 2 lui-même** (Playwright sur le fichier d'origine) : plans (identifiants, médias, mouvements, durées, transitions), médias, textes, étalonnage et i/s rouverts à l'identique. Note de migration affichée. Rendu non uniforme. |
| 17 | Non-régression du montage | Les 117 identifiants et les 13 listes de réglages de l'original sont présents. Mouvement, image clé, texte, annuler et rétablir fonctionnent. Les 14 mouvements se rendent avec une image non uniforme. L'étalonnage « noir » est désaturé (saturation inférieure à 20 % de l'image couleur). PNG valide (signature), planche contact, lecture. |

### Défauts trouvés par ces tests et corrigés dans l'application

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
| Moteur V1 par l'API de l'application (`POST /api/taches`, sketch « telephone-ecoute », Blaise et Odette) | Contrôle de ton **CONFORME**, voix et visages préparés (`TOUT OK`). Rendu `tourne.py` en cours au moment du rapport : plus de 52 min, en concurrence avec la préparation de la fabrique sur 4 cœurs. Résultat à consigner à la fin du rendu. |
| Voix Piper locale (`/api/voix`) | Fichier WAV produit (essai du 22/10) |

## 4. Points ouverts : greffe en cours

| Point | Action | Mesure de réussite |
|---|---|---|
| Export H.264 + AAC | Le chemin H.264/AAC est codé (`avc1` puis `mp4a.40.2`), mais le Chromium de test n'a pas ces encodeurs : l'application a basculé sur VP9 + Opus dans le MP4, comme prévu. Ajout prévu d'un transcodage H.264 par le serveur local (ffmpeg) quand le navigateur n'a pas l'encodeur. | ffprobe lit `h264` + `aac` sur un export fait dans Chrome ou Edge de l'utilisateur, ou après transcodage local |
| Première génération réelle reçue dans le navigateur | Essai dans le navigateur de l'utilisateur, avec son compte Hugging Face gratuit | Clip consigné « Terminée » dans l'Historique |
| Rendu V1 par l'API | Attendre la fin de `tourne.py`, puis mesurer contre la V1 | Durée, i/s, portes du moteur |
