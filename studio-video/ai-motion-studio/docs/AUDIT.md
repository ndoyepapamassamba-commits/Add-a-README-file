# Audit de MASSAMBA Motion Studio 2 et plan de migration

Date : 22/10/2026. Fichier audité : `massamba-motion-studio_1.html`, fourni par l'utilisateur (629 lignes, 71 914 octets, 120 identifiants, 65 écouteurs d'événements). Le fichier d'origine reste hors du dépôt public.

## 1. Inventaire des fonctions d'origine

Les listes ci-dessous sont relues dans le fichier d'origine par `tests/fixtures/reference-motion-studio-2.json`. Ce relevé est automatique : le test e2e n° 17 vérifie que la nouvelle application les contient toutes.

| Domaine | Fonctions d'origine |
|---|---|
| Médias | Import d'images (`accept="image/*"`), glisser-déposer, image de démonstration, vignettes, suppression |
| Timeline | Piste images, piste textes, piste audio, zoom, règle, tête de lecture, sélection d'un plan |
| Mouvements de caméra | 14 réglages : auto, zoomIn, zoomOut, panRight, panLeft, tiltUp, tiltDown, kenburns, orbit, drift, pulse, handheld, vertigo, diagonal |
| Images clés | Ajout, capture, édition (échelle, X, Y, rotation, opacité) |
| Transitions | 10 transitions : none, fade, dipBlack, dipWhite, wipeL, wipeR, slide, iris, zoomBlur, whip ; durée réglable |
| Courbes | easeInOut, easeOut, easeIn, smooth, linear |
| Textes | 4 styles : lower, center, top, caption ; 7 animations : fade, up, down, scale, type, blur, kinetic ; taille, couleur, début, durée |
| Effets | 8 étalonnages ; 3 cadrages (cover, blur, contain) ; vignette, grain, poussière, bloom, tremblement, bandes cinéma |
| Audio | Musique importée avec volume et curseurs de fondu, voix off enregistrée au micro, nappe générée (calme, pulse, épique) |
| Sortie | 5 formats (16:9, 9:16, 1:1, 4:3, 21:9) ; qualité ×1 ou ×1,5 ; 24, 30 ou 60 i/s ; 3 débits ; export WebM ; instantané PNG ; planche contact |
| Projet | Sauvegarde JSON v2 (vignettes JPEG des images), ouverture, annuler et rétablir (60 états), raccourcis clavier |

## 2. Défauts relevés dans l'original

Chaque défaut ci-dessous est vérifié dans le code d'origine, avec la preuve indiquée.

| # | Défaut | Preuve |
|---|---|---|
| D1 | Aucun import vidéo : l'outil ne monte que des images fixes. | `accept="image/*"` sur l'import de médias |
| D2 | Les poignées de découpe sont dessinées mais inactives. | Les `data-resize="l"` et `data-resize="r"` sont présents, mais il n'y a aucun écouteur `pointerdown` ni `mousedown`. |
| D3 | La timeline lève une erreur à chaque rendu tant qu'aucune musique n'est chargée : `cvs.getContext is not a function`, quatre fois à l'import de deux images. | Le sélecteur `$` renvoie un objet factice `STUB` au lieu de `null` (`document.querySelector(s)\|\|STUB`), donc `if(cvs)` est toujours vrai. Relevé en exécution par Playwright le 22/10/2026. |
| D4 | Les fondus de musique (entrée et sortie) se règlent mais ne sont jamais appliqués. | `fadeIn` et `fadeOut` n'apparaissent que dans le curseur et son libellé. |
| D5 | La voix off enregistrée n'est pas jouée pendant la lecture. | Il n'y a aucun `voiceEl.play()` ; seul `audioEl.play()` existe. |
| D6 | L'export est en temps réel par `MediaRecorder` : WebM seulement, des images peuvent sauter si la machine ralentit, et le résultat n'est pas vérifié. | `cv.captureStream` + `new MediaRecorder` |
| D7 | Des dimensions impaires sont possibles, alors que les encodeurs H.264 exigent des dimensions paires. | `Math.round(b[0]*S.quality)` : en 4:3 à ×1,5, cela donne 1080 × 1,5 = 1620 et 810 × 1,5 = 1215. |
| D8 | Le projet v2 ne conserve que des vignettes JPEG des images : l'original est perdu à la réouverture. | `media:S.media.map(...{data:thumb(m)})` |
| D9 | Pas de sous-titres. | Aucune occurrence de `S.subs` ni de `srt` |
| D10 | Aucune génération IA, aucun suivi de tâche, aucun registre de moteurs, aucune gestion des coûts ni des clés. | Hors du périmètre de l'original |

## 3. Stratégie de migration retenue

1. **Conserver le moteur de montage** : `js/studio.js` reprend le rendu d'origine et garde tous les identifiants (vérifié par le test 17). Les défauts D1 à D9 sont corrigés :
   - vraies vidéos dans la timeline (durée réelle, point d'entrée, vitesse, volume, muet) ;
   - poignées et déplacement par glisser ;
   - découpe, duplication et suppression ;
   - forme d'onde réelle ;
   - fondus appliqués ;
   - voix off jouée à la lecture ;
   - dimensions paires ;
   - sous-titres `.srt` et `.vtt`.
2. **Ajouter autour du montage** les 9 sections du studio IA (`js/app.js`) :
   - studio de génération ;
   - storyboard ;
   - médiathèque ;
   - personnages (dont la troupe) ;
   - montage ;
   - audio ;
   - historique ;
   - projets ;
   - moteurs.
3. **Séparer les responsabilités** :

   | Fichier | Rôle |
   |---|---|
   | `registre.js` | Capacités lues en direct |
   | `gradio.js` | Protocole des Spaces |
   | `fournisseurs.js` | Adaptateurs |
   | `taches.js` | États, file d'attente, reprises |
   | `stockage.js` | Format v3, migration, IndexedDB, filtre des secrets |
   | `export.js` | MP4 image par image validé |
   | `serveur/` | Clés secrètes et moteur V1 |

4. **Format de projet v3** : les médias sont gardés en entier (data URL dans le fichier, Blob dans IndexedDB). Le format v2 est migré automatiquement, avec une note à l'ouverture qui signale les vignettes d'origine. L'identifiant de chaque média et de chaque plan est conservé.
5. **Export** :
   - principal : WebCodecs (H.264 + AAC) avec mp4-muxer (MIT), rendu image par image hors temps réel, puis validation automatique (durée, dimensions, lecture, codec, son) ;
   - repli : WebM en temps réel.

## 4. Liste de non-régression (automatisée)

Le test e2e n° 17 et `tests/fixtures/reference-motion-studio-2.json` couvrent :

- **Identifiants** : les 117 identifiants relevés à l'exécution de l'original sont présents.
- **Listes** : les 13 listes de réglages d'origine sont incluses (mouvements, transitions, étalonnages, cadrages, styles et animations de texte, courbes, nappes, formats, qualités, i/s, débits).
- **Opérations** :
  - mouvement de caméra appliqué ;
  - image clé ajoutée ;
  - texte ajouté ;
  - annuler puis rétablir ;
  - rendu non uniforme pour chacun des 14 mouvements ;
  - étalonnage « noir » désaturé (mesuré) ;
  - instantané PNG valide ;
  - planche contact ;
  - lecture.
- **Projet v2 réel**, produit par l'original lui-même (test 16) : plans, médias, textes, étalonnage et i/s rouverts à l'identique.
