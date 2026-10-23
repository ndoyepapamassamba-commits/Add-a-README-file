# Installer et lancer MASSAMBA AI MOTION STUDIO

Ce guide s'adresse à quelqu'un qui n'est pas développeur. Chaque étape dit quoi faire et à quoi vous attendre.

## Deux façons d'utiliser l'application

| Façon | Ce qu'il faut | Ce qui marche |
|---|---|---|
| **A. Le fichier seul** : `MASSAMBA-AI-Motion-Studio.html`, double-clic | Un navigateur récent : Chrome, Edge ou Brave (version 2025 ou plus récente) | Génération gratuite image → vidéo et texte → vidéo (Spaces Hugging Face), mode démo, storyboard, médiathèque, personnages, montage, sous-titres, export MP4, sauvegarde |
| **B. Avec le serveur local** | En plus : Node.js 20 ou plus récent ; Python 3 pour le moteur V1 et les voix | Tout ce qui précède, plus le moteur V1 de la troupe, la voix off Piper et les fournisseurs à clé (fal, Replicate, Runway, Luma, Kling), désactivés par défaut |

## A. Le fichier seul (le plus simple)

1. Ouvrez `MASSAMBA-AI-Motion-Studio.html` avec Chrome ou Edge.
2. L'application s'ouvre sur **Studio de génération**. Aucune clé n'est demandée.
3. Facultatif, mais recommandé : créez un compte gratuit sur huggingface.co, puis un « Access Token » en lecture.
   - Collez-le dans **Moteurs IA → Jeton Hugging Face**, puis cliquez sur « Vérifier ».
   - Le jeton reste **en mémoire seulement** : il est effacé à la fermeture de l'onglet, n'est jamais enregistré et n'est jamais mis dans un fichier projet.
   - Avec un compte, votre quota GPU gratuit du jour est plus grand qu'en anonyme.
4. Choisissez **Image → vidéo**, déposez une image, écrivez ce qui doit se passer, puis cliquez sur « Générer ».
   - L'état s'affiche : En attente, Envoi, En cours (avec le rang dans la file), Finalisation, Terminée.
   - La vidéo arrive dans la médiathèque.

## B. Avec le serveur local

1. Installez Node.js (version LTS) depuis nodejs.org.
2. Ouvrez un terminal dans le dossier `ai-motion-studio`.
3. Lancez :

   ```
   node serveur/serveur.mjs
   ```

   Le terminal affiche `MASSAMBA AI MOTION STUDIO : http://127.0.0.1:8787 (payant désactivé)`.
4. Ouvrez **http://127.0.0.1:8787** dans le navigateur.
5. Dans **Moteurs IA → Serveur local**, cliquez sur « Tester ». L'état de chaque fournisseur s'affiche (configuré ou non, actif ou non).

### Moteur V1 de la troupe et voix off (gratuits, sur votre machine)

1. Installez Python 3, puis les dépendances du moteur (`studio-video/moteur-troupe`, voir son README).
2. Copiez `config.example.env` en `.env`, puis renseignez :
   - `MASSAMBA_BIBLIO` : le dossier de la bibliothèque de la troupe ;
   - `PIPER_VOICES` : le dossier des voix Piper.
3. Relancez le serveur. Le mode **Sketch V1** apparaît alors dans le Studio de génération, et la voie « Sketch de la troupe » dans l'Autopilote.
4. Au démarrage, le serveur **préchauffe** le moteur : il vérifie une fois les visages de chaque scène prête (quelques minutes la première fois, mémorisé ensuite). Un sketch n'attend donc plus cette étape. `PRECHAUFFE_V1=0` désactive le préchauffage.
5. Vitesse : le serveur règle un fil de calcul par processus de rendu (`OMP_NUM_THREADS=1`) et un processus par cœur (`TOURNE_PROCS`), comme la fabrique GitHub. Mesure du 23/10/2026 sur 4 cœurs : un sketch neuf de 20 s tourné en 121 s de bout en bout.

### Export H.264 + AAC (ffmpeg)

Si votre navigateur n'a pas d'encodeur H.264 (Chromium libre, certains Linux), le serveur local convertit l'export en MP4 H.264 + AAC avec **ffmpeg** (libx264 + aac), puis le contrôle (ffprobe et décodage intégral). Installez ffmpeg et mettez-le dans le PATH (ou indiquez `FFMPEG=` et `FFPROBE=` dans `.env`). Au démarrage, le terminal affiche `conversion H.264 : ffmpeg … (libx264 + aac)`.

### Fournisseurs payants (fermés par défaut)

Rien de payant n'est possible tant que `PAYANT_AUTORISE=0`. Pour les ouvrir, en connaissance de cause :

1. Mettez votre clé dans `.env`, par exemple `RUNWAYML_API_SECRET=...`.
   - Jamais dans l'application ni dans un fichier projet.
   - Le serveur ne la renvoie jamais au navigateur, et ses journaux la caviardent.
2. Mettez `PAYANT_AUTORISE=1` et gardez un plafond : `PLAFOND_TACHES_PAYANTES_JOUR=5`.
3. Relancez le serveur. Chaque génération payante affiche le fournisseur et le modèle, puis demande une confirmation.
   - Le coût affiché reste « Tarif indisponible — vérifier auprès du fournisseur » : l'application n'invente aucun prix.

## Sauvegarde

- **Automatique** : le projet est enregistré dans le navigateur, médias compris, 2,5 s après chaque changement. Il est rouvert au démarrage.
- **Fichier** : **Projets → Sauver le projet complet** produit un `.massamba.json` qui contient tous les médias. Gardez-le : c'est votre copie de sécurité.
- **Anciens projets** : les projets de MASSAMBA Motion Studio 2 s'ouvrent avec « Ouvrir ». Ils sont migrés automatiquement ; leurs images d'origine étaient des vignettes, une note le signale.

## En cas de souci

| Message | Que faire |
|---|---|
| « Aucun GPU libre dans la file gratuite » | L'application réessaie une fois toute seule. Sinon, relancez plus tard depuis l'Historique. |
| « Quota GPU gratuit du jour épuisé » | Le quota revient 24 h après la première utilisation. Un compte Hugging Face gratuit donne un quota plus grand. |
| « Connexion réseau interrompue » / « Pas de connexion réseau » | Rien n'est perdu. Relancez depuis l'Historique quand le réseau revient. |
| « Serveur local injoignable » | Vérifiez que le terminal du serveur est ouvert. Les moteurs gratuits du navigateur restent utilisables. |
