# Fonctions : opérationnelles, partielles, dépendantes d'un service externe

État au 23/10/2026. Chaque ligne renvoie à sa preuve : test unitaire (U), test e2e (E1 à E17) ou essai réel consigné dans [RAPPORT-TESTS.md](RAPPORT-TESTS.md).

## 1. Opérationnelles (dans l'application, sans service externe)

| Fonction | Preuve |
|---|---|
| **Autopilote** : idée → plans écrits (modèle gratuit, repli local annoncé) → consignes → génération de tous les plans avec chaîne de secours de moteurs gratuits → montage, fondus, sous-titres, voix Piper, nappe → export validé → rapport chronométré ; relecture des plans facultative ; budget de quota GPU affiché avant le lancement ; voie « sketch de la troupe » (moteur V1) | E18, E19, E20 |
| **Consigne embarquée** dans chaque vidéo produite (génération, démo, moteur V1, export final) : MP4 udta/ilst et WebM Tags, sans ré-encodage ; relue à l'import (consigne, moteur, nature DÉMO) ; bouton « Réutiliser la consigne » | U (4 formats réels, ffprobe, framemd5), E2, E8, E13, E18 |
| **Export H.264 + AAC** même sans encodeur dans le navigateur : conversion par ffmpeg sur le serveur local, contrôle ffprobe + décodage intégral renvoyé et affiché | U, E13, E18 |
| Ouverture sans clé, 10 sections, aucun appel payant | E1 |
| Mode démo marqué jusque dans l'image (bandeau incrusté, étiquette DÉMO, jamais compté comme IA) | E2 |
| Import d'images : aperçu, formats refusés, médiathèque | E3 |
| Assistant de consigne : idée gardée en tête, ajouts sourcés, 11 préréglages, rien de réécrit en silence | E4, U |
| Validation des paramètres d'après les capacités du moteur (image, image de fin, durée bornée, consigne) | E5, U |
| Gestionnaire de tâches : états, double soumission refusée, concurrence, délai, annulation, relance, restauration | E7, E14, U |
| Timeline avec vraies vidéos (durée réelle, point d'entrée, vitesse, volume, muet) | E9, E10, E11 |
| Lecture synchronisée image et son | E10 |
| Découpe au curseur, duplication, suppression, glisser, poignées ; 10 transitions | E11, E17 |
| Sous-titres `.srt` / `.vtt` (import, édition, export, incrustation) ; dialogues du storyboard vers sous-titres | Code relu ; incrustation rendue dans l'export (E13) |
| Sauvegarde automatique (IndexedDB) et fichier projet complet v3, réouverture à l'identique | E12 |
| Ouverture et migration des projets MASSAMBA Motion Studio 2 (v2) | E16, U |
| Export MP4 image par image validé par l'application, puis relu par ffprobe et décodé sans erreur ; repli WebM | E13 (H.264 + AAC par le serveur local dans le Chromium de test ; chemin direct à confirmer dans Chrome ou Edge) |
| Fonctions de montage d'origine (117 identifiants, 13 listes, mouvements, images clés, textes, annuler et rétablir, étalonnage, PNG, planche, lecture) | E17 |
| Protection des clés : jeton en mémoire seulement, absent des stockages, exports et page ; envoyé seulement au service appelé | E15, U (serveur) |
| Serveur local : voies payantes fermées (403), validation (400), fichiers protégés, origine étrangère refusée, limite de débit (429), journaux caviardés | U (serveur, 7 tests) |
| Personnages : 61 duos et 122 personnages de la troupe, fiches de continuité modifiables, « Utiliser dans Générer » | Fumée Playwright (9 vues sans erreur) |
| Moteur V1 de la troupe par l'application (serveur local) : sketch tourné, vidéo TikTok H.264 1080×1920 récupérée, 8 portes de qualité sur 9 (seule la durée d'un épisode complet manque, l'essai ne compte qu'un sketch) ; **sketch neuf en 121 s** sur décor préparé ; préchauffage au démarrage du serveur | Essais réels des 22 et 23/10/2026 (RAPPORT-TESTS § 3) |
| Storyboard : découpage d'un scénario en scènes, moteur par scène, variantes, « Film complet » avec confirmation, assemblage en timeline | Code relu ; génération par scène = même chemin que E6 à E9 |

## 2. Partiellement opérationnelles

| Fonction | Ce qui marche | Ce qui reste : greffe en cours |
|---|---|---|
| Génération réelle sur les Spaces gratuits **depuis le conteneur de développement** | Protocole complet vérifié (E6 à E8) contre les configurations réelles. Le 22/10/2026, un vrai calcul I2V a eu lieu sur le GPU du Space Wan 2.2 (26,7 s). | Depuis le conteneur, le téléchargement du clip a été refusé (403 : plusieurs répliques derrière le proxy). Le navigateur de l'utilisateur garde sa connexion HTTP/2 vers la même réplique. **Mesure attendue** : premier clip reçu dans le navigateur de l'utilisateur, consigné dans l'Historique. |
| Texte → vidéo anonyme | Chemin LTX-2.3 et chaîne Pollinations → Wan branchés et validés | Quota anonyme épuisé le 22/10 à 20:52 (« 37 s restantes »). Un compte Hugging Face gratuit de l'utilisateur lève ce point. |
| Voix off | Piper local (siwis, gilles) par le serveur ; voix du navigateur en écoute seule | La voix du navigateur ne peut pas être enregistrée dans l'export (limite de l'API Web Speech) ; Piper la remplace. |

## 3. Dépendantes d'un service externe

| Fonction | Service | État |
|---|---|---|
| Image → vidéo, texte → vidéo gratuits | Spaces Hugging Face (Wan 2.2, LTX-2.3, LTX-Video) | Disponibles selon la file et le quota GPU gratuit ; capacités relues en direct |
| Image de départ générée | Pollinations (`sana`) | Gratuit, sans compte |
| Traduction de la consigne | Pollinations `openai-fast` | Gratuite ; traduction **affichée** avant usage, jamais appliquée en silence |
| fal.ai, Replicate, Runway, Luma | API officielles, clé dans `.env` | Branchées et testées hors ligne (en-têtes Runway conformes au SDK 4.22.0) ; **fermées** tant que `PAYANT_AUTORISE=0` |
| Kling | API officielle | **À CONFIRMER** : adresse et modèle à renseigner depuis la console Kling de l'utilisateur |
