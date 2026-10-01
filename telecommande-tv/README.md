# 📺 Télécommande TV universelle (ELACTRON et autres marques)

Appli Android qui transforme ton téléphone en **télécommande infrarouge** pour ta télé
ELACTRON (ou n'importe quelle autre marque), avec en bonus une **lampe torche**
(LED arrière à pleine puissance ou écran lumineux de la couleur de ton choix).

➡️ **Fichier à installer : [`TelecommandeTV.apk`](TelecommandeTV.apk)** (version 2.0, ≈ 155 Ko)

> Mise à jour depuis une version précédente : installe simplement la nouvelle version
> par-dessus l'ancienne, tes réglages sont gardés.

**Deux façons de piloter la télé :**
- **📶 Par le Wi-Fi** (nouveau, recommandé pour les télés ELACTRON Smart / Android TV) :
  marche sur **n'importe quel téléphone Android**, même sans infrarouge. Réponse immédiate,
  tous les boutons marchent tout de suite, aucun code à chercher.
- **🔴 Par infrarouge** : pour les télés non connectées, avec un téléphone qui a un émetteur
  infrarouge.

Lien direct à partager (WhatsApp, mail, SMS…) :
https://github.com/ndoyepapamassamba-commits/Add-a-README-file/raw/claude/admiring-cray-uua1sz/telecommande-tv/TelecommandeTV.apk

---

## 🌐 Version web : TV en direct (IPTV) + télécommande Wi-Fi, sur téléphone et ordinateur

Rien à installer sur le téléphone : une seule page web,
**[`web/TelecommandeTV.html`](web/TelecommandeTV.html)** (≈ 700 Ko). Le tout est aussi dans
**[`TelecommandeTV-Web.zip`](TelecommandeTV-Web.zip)** (≈ 235 Ko), à envoyer par WhatsApp ou par mail.
Ce zip contient la page, la passerelle et le mode d'emploi `LISEZMOI.txt`.

### 📡 TV en direct, avec bascule automatique
- Ouvre `TelecommandeTV.html` avec **Chrome** : sur le téléphone, *Fichiers → Téléchargements →
  Ouvrir avec Chrome* ; sur l'ordinateur, double-clic.
- Choisis un bouquet : 🇸🇳 Sénégal, 🌍 Afrique, 🇫🇷 France, 🗣 En français, 🌐 Monde entier, et
  des thèmes (📰 Infos, ⚽ Sport, 🎬 Films, 🎵 Musique, 🧸 Enfants, 🕌 Religion, 🦁 Documentaires).
- **🗺 Tour du monde** : « Tous les pays… » ouvre les **250 pays** et **16 régions**
  (Afrique de l'Ouest, Maghreb, monde arabe, Europe…), avec une recherche.
- Les chaînes sont **cherchées en direct sur GitHub**. Ce sont les bases publiques de chaînes
  **gratuites et légales** [iptv-org](https://github.com/iptv-org/iptv) et
  [Free-TV](https://github.com/Free-TV/IPTV), mises à jour chaque jour.
  - L'appli lit aussi la **base complète** d'iptv-org (`streams.json`). Les listes publiques ne
    gardent qu'**un lien par chaîne** ; la base complète apporte les **liens de secours** et les
    chaînes absentes des listes.
  - Monde entier : **13 787 chaînes et 19 488 liens**, au lieu de 12 153 chaînes avec un seul lien
    chacune.
  - Si `iptv-org.github.io` ne répond pas, l'appli passe par le miroir `raw.githubusercontent.com`
    et réessaie une fois.
- **Quand un lien saute**, l'appli essaie aussitôt un autre lien de la même chaîne. S'il n'y en a
  plus, elle **bascule toute seule sur une autre chaîne qui marche**, avec un bouton « ↩ Réessayer ».
- Les chaînes de la liste sont **testées en arrière-plan**, en commençant par celles qui suivent la
  chaîne en cours, pour que la bascule soit immédiate. Avec la passerelle, l'ordinateur teste
  **toute** la liste (40 chaînes par requête) et descend jusqu'à la liste des segments vidéo.
  Pastilles :
  - 🟢 marche ;
  - 🟡 à essayer : la chaîne est vivante mais le navigateur la bloque ;
  - 🟣 interdite ici : pays ou droits de diffusion ;
  - 🔴 morte ;
  - ⭕ décodeur requis.

  Une chaîne n'est plus déclarée « morte » quand c'est seulement le navigateur qui la refuse.
- **Coupure d'internet** : l'appli ne pénalise pas les chaînes. Elle affiche « Pas de connexion
  internet » et reprend toute seule au retour du réseau.
- ⭐ Favoris, recherche, « Qui marchent » (cache les chaînes en panne), plein écran (touche F),
  chaîne précédente / suivante (P / N).
- « ➕ Mes listes » : ajoute le lien d'une liste M3U ou un fichier `.m3u`.
- 💾 enregistre les chaînes qui marchent en liste `.m3u`, à ouvrir avec VLC ou une appli IPTV de
  la télé.

### 🧩 Le décodeur : pour faire marcher les chaînes difficiles
Le lecteur essaie les solutions dans l'ordre et s'arrête dès que l'une marche :
1. le lecteur du navigateur ;
2. le lecteur du téléphone (Android, il ignore les blocages du navigateur) ;
3. le **relais** de la passerelle, qui ajoute les en-têtes Referer / User-Agent qu'exigent certaines
   chaînes ;
4. le **décodeur FFmpeg**, en réemballant le flux : seul le son est converti ;
5. le **décodeur FFmpeg** en conversion complète, en H.264 + AAC.

L'appli saute directement aux étapes utiles : un lien mort ne passe pas par le décodeur.

- **Sur le téléphone** : le bouton **▶ VLC** ouvre la chaîne dans [VLC](https://play.google.com/store/apps/details?id=org.videolan.vlc)
  (gratuit sur le Play Store), qui décode presque tout.
- **Sur l'ordinateur** : avec la passerelle, le bouton **Installer le décodeur (65 Mo)** télécharge
  FFmpeg tout seul sous Windows. Il ne prend que `ffmpeg.exe` dans l'archive officielle de 200 Mo.
  Mac : `brew install ffmpeg` ; Linux : `sudo apt install ffmpeg`.
- Le décodeur lit ce que les navigateurs refusent :
  - son AC-3 / E-AC-3 ;
  - image HEVC (H.265) ;
  - flux DASH, RTMP, RTSP, TS ou FLV bruts.

  La vidéo convertie est servie au téléphone par le Wi-Fi.

> Ce qu'aucun décodeur ne peut réparer : un serveur arrêté (🔴), une chaîne réservée à un pays
> (🟣) ou une chaîne cryptée (DRM). L'appli les reconnaît et les saute.

### 🎮 Télécommande Wi-Fi depuis la page web
Un navigateur n'a pas le droit d'ouvrir la connexion TLS à certificat client qu'exige la télé.
La petite **passerelle** [`web/passerelle_tv.py`](web/passerelle_tv.py) fait l'intermédiaire
depuis un ordinateur du même Wi-Fi. Elle n'a besoin que de Python 3.7 ou plus récent, sans aucune
bibliothèque à ajouter.

1. Installe [Python](https://www.python.org/downloads/). Sous Windows, coche « Add python.exe to PATH ».
2. Lance la passerelle :
   - Windows : double-clic sur **`Lancer-passerelle-Windows.bat`** ;
   - Mac ou Linux : `python3 passerelle_tv.py`.

   Si le pare-feu demande, autorise l'accès sur les « Réseaux privés ».
3. La page s'ouvre sur l'ordinateur → onglet **🎮 Télécommande**.
   - **Sur le téléphone** : scanne le QR code affiché, ou tape l'adresse indiquée
     (ex. `http://192.168.1.20:8765`).
4. **🔎 Chercher ma télé**, puis tape le code à 6 caractères qui s'affiche sur la télé
   (une seule fois).

Tous les boutons de l'appli Android sont là : appui long pour répéter, Netflix / YouTube / Prime,
volume de la télé affiché. Sur ordinateur, le clavier marche aussi : flèches, Entrée,
Échap, + / −, Page ↑/↓, chiffres.

---

## 📶 Piloter la télé par le Wi-Fi (Android TV)

Les télés **ELACTRON Smart** fonctionnent sous **Android TV**. L'appli utilise le même protocole
que la télécommande de l'appli officielle Google TV (« Android TV Remote v2 ») :

1. Allume la télé et vérifie qu'elle est connectée au Wi-Fi (**Réglages → Réseau**).
2. Connecte le téléphone **au même Wi-Fi** (la même box, pas la 4G).
3. Ouvre l'appli → **📶 Connecter ma télé en Wi-Fi**. L'appli cherche la télé toute seule
   (sinon, tape son adresse IP, visible dans les réglages réseau de la télé).
4. Touche ta télé : un **code de 6 caractères** s'affiche sur l'écran de la télé. Tape-le.
5. C'est fini : la télécommande Wi-Fi s'ouvre, et s'ouvrira directement les fois suivantes.

Boutons : Marche/Arrêt, Source, Muet, Réglages, Accueil, Info, croix directionnelle + OK,
Retour, Lecture/Pause, Volume et Chaînes (maintenir pour répéter), chiffres, et lancement direct
de **Netflix, YouTube et Prime Video**. Le volume de la télé s'affiche en haut.

> ℹ️ Quand la télé est en veille profonde, elle ne répond plus en Wi-Fi : allume-la avec son
> bouton (ou avec l'infrarouge), puis l'appli se reconnecte toute seule.

## ⚠️ Pour l'infrarouge : un téléphone avec émetteur infrarouge

Une télé classique se pilote en **infrarouge**. Le téléphone doit avoir un **émetteur
infrarouge** (une petite fenêtre noire sur le dessus, souvent à côté de la prise casque).

- ✅ En ont souvent un : **Xiaomi / Redmi / POCO**, beaucoup de **Tecno** et **Infinix**,
  certains **Honor / Huawei**.
- ❌ N'en ont pas : **iPhone**, **Samsung** récents, la plupart des **Oppo / Vivo**.

L'appli te le dit dès l'ouverture : « ✅ Émetteur infrarouge détecté » ou « ❌ Pas d'émetteur
infrarouge ». La lampe torche, elle, marche sur tous les téléphones Android.

---

## 📲 Installer l'appli

1. Télécharge `TelecommandeTV.apk` sur le téléphone (lien ci-dessus, ou fichier reçu par WhatsApp).
2. Ouvre le fichier. Android demande d'**autoriser l'installation d'applis inconnues**
   pour Chrome / WhatsApp / Fichiers : accepte.
3. Si **Play Protect** affiche un avertissement (appli inconnue, pas sur le Play Store),
   touche **« Plus de détails » → « Installer quand même »**.
4. L'icône bleue **Télécommande TV** apparaît.

### L'installation est bloquée (« restriction », « bloqué », « non autorisé ») ?
L'appli n'est pas en cause : c'est une **protection du téléphone** contre les applis hors Play Store.
Selon le message affiché :
- **« Votre téléphone n'est pas autorisé à installer des applis inconnues de cette source »** :
  touche **Paramètres** → active **Autoriser cette source** → reviens et touche **Installer**.
- **Samsung – « Blocage automatique » / « Auto Blocker »** : Paramètres → **Sécurité et
  confidentialité** → **Blocage automatique** → **Désactivé**. Installe, puis réactive-le.
- **Huawei / Honor – « Mode pur »** : Paramètres → Système (ou Sécurité) → **Mode pur** →
  **Désactiver**.
- **Xiaomi / Redmi / POCO** : dans l'écran d'analyse, touche **Installer quand même** ; si c'est
  refusé, ouvre l'appli **Sécurité** → ⚙ → désactive l'**analyse avant installation** (un compte
  Xiaomi peut être demandé).
- **Oppo / Realme / Tecno / Infinix / itel / Vivo** : Paramètres → **Sécurité** → désactive
  l'option qui **vérifie ou bloque les installations** d'applis.
- **Téléphone professionnel ou contrôle parental (Family Link)** : l'installation n'est
  possible qu'avec l'accord de l'administrateur ou du parent.

**Plan B sans installer d'APK** (pour le Wi-Fi seulement) : l'appli officielle **Google TV**
du Play Store contient aussi une télécommande Wi-Fi pour les Android TV.

### Le téléchargement tourne sans jamais finir ?
Le fichier ne fait que 110 Ko : il doit arriver en une seconde. S'il « tourne » :
- **Dans Chrome**, regarde **en bas de l'écran** : Chrome met les .apk en pause et demande
  « Ce type de fichier peut endommager votre appareil » → touche **Télécharger quand même**.
  Si le message a disparu : **⋮ → Téléchargements** et relance le fichier « en attente ».
- **Depuis l'appli Claude, WhatsApp ou un autre navigateur** (Opera Mini…) : copie le lien
  et ouvre-le dans **Chrome**.
- **Toujours bloqué ?** Prends la version **ZIP** (Chrome la télécharge sans avertissement) :
  https://github.com/ndoyepapamassamba-commits/Add-a-README-file/raw/claude/admiring-cray-uua1sz/telecommande-tv/TelecommandeTV.zip
  puis ouvre-la avec l'appli **Fichiers** → **Extraire** → touche `TelecommandeTV.apk`.

### Envoyer l'appli à quelqu'un
- **WhatsApp** : 📎 → **Document** → choisis `TelecommandeTV.apk`. La personne n'a qu'à
  toucher le fichier pour l'installer.
- **Mail** : Gmail **refuse les pièces jointes .apk**. Envoie plutôt le **lien direct**
  ci-dessus dans le corps du message.

---

## 🔍 Trouver le code de ta télé ELACTRON (2 minutes)

ELACTRON n'a pas de liste de codes officielle, mais ces télés utilisent les puces (et
donc les codes) d'autres fabricants. L'appli contient **496 familles de codes** de
**180 marques** et les essaie une par une :

1. Allume la télé avec son bouton (sur le côté ou dessous).
2. Ouvre l'appli → **🔍 Recherche automatique**.
3. Pointe le **haut du téléphone** vers la télé, à 1–3 m.
4. Appuie sur **TESTER**. Rien ? Appuie sur **▶** (code suivant)… ou lance
   **⏩ Défilement automatique** (un code toutes les 1,6 s).
5. Dès que la télé **s'éteint**, appuie sur **✅** (ou **✋ STOP** pendant le défilement,
   puis vérifie avec TESTER / ◀).
6. Rallume la télé avec le **gros bouton rouge** de l'appli, puis appuie sur
   **TESTER VOLUME +** : si le volume monte, c'est prêt ; sinon, l'appli lance l'**assistant**
   (voir ci-dessous).

💡 Tu ne veux pas éteindre la télé pendant la recherche ? Choisis **🔇 Muet** ou
**🔉 Volume −** comme bouton de test : le symbole s'affiche à l'écran quand c'est le bon code.

## 🛠 La télé s'éteint mais les autres boutons ne marchent pas ?

C'est normal : **plusieurs modèles de télés partagent le même code Marche/Arrêt**, mais pas
les autres boutons (exemple réel : une ELACTRON qui répond au code Hisense « 00 BF » mais
dont les boutons suivent la disposition BGH). Touche **🛠 Régler** en haut de la télécommande :

- **✨ Assistant (recommandé)** : l'appli passe les boutons en revue (Volume, Muet, Chaînes,
  Source, Menu, flèches, OK, Retour, chiffres, Netflix / YouTube / Prime Video). Pour chacun :
  **TESTER** → **✅ Oui** ou **❌ Non** (le code suivant part tout seul). Elle propose d'abord
  les codes les plus probables d'après **620 dispositions de télécommandes connues** et
  **apprend de tes réponses** : en général 2 à 3 essais par bouton, et les chiffres se
  déduisent les uns des autres.
- **👆 Régler un seul bouton** : touche ensuite le bouton à corriger (ou fais un **appui long**
  dessus depuis la télécommande).
- **🔎 Scanner tous les codes** : l'appli envoie tous les codes de ta télé un par un (sauf
  Marche/Arrêt, pour ne pas l'éteindre) ; à chaque réaction, tu dis de quel bouton il s'agit.
- **↺ Effacer mes réglages** pour revenir aux codes d'origine.

Tous les réglages sont gardés en mémoire.

## 🔦 Lampe torche

Bouton **🔦** en haut de la télécommande (ou sur l'écran d'accueil) :

- **LED arrière** : puissance maximale (réglable sur Android 13+), effets *Fixe*,
  *Clignotant* (1 à 21 éclairs/s) et *SOS*.
- **Écran couleur** : écran à luminosité maximale, **10 couleurs prêtes** (blanc, blanc
  chaud, jaune, orange, rouge, rose, violet, bleu, cyan, vert) ou **couleur libre** avec les
  curseurs *teinte*, *blanc ↔ couleur vive* et *intensité*. Effets *Clignotant*, *SOS*,
  *🌈 Arc-en-ciel* et *🚨 Police*. Touche l'écran allumé pour cacher les réglages.

---

## 🧑‍💻 Pour les développeurs

| Élément | Rôle |
|---|---|
| `app/src/main/java/.../IrCodec.java` | Génère les trames IR : NEC, NECext, NEC42, Samsung32, RC5, RC5X, RC6, SIRC 12/15/20, Kaseikyo, RCA, Pioneer, brut |
| `app/src/main/java/.../CodeDb.java` | Charge la base `assets/codes.txt` : familles triées de la plus courante à la plus rare + dispositions complètes de télécommandes |
| `app/src/main/java/.../Suggest.java` | Classe les codes à essayer pour un bouton (vote des dispositions pondéré par les boutons confirmés / refusés, suite des chiffres) |
| `app/src/main/java/.../MainActivity.java` | Accueil, recherche auto, choix par marque, télécommande, assistant de réglage, scan libre |
| `app/src/main/java/.../LampActivity.java` | Lampe torche LED / écran couleur |
| `app/src/main/java/.../AtvClient.java` | Client Wi-Fi « Android TV Remote v2 » : appairage (port 6467, code à 6 caractères), touches et liens d'applis (port 6466), TLS avec certificat client |
| `app/src/main/java/.../AtvCert.java`, `Proto.java` | Certificat X.509 auto-signé du téléphone (encodé en DER) et mini-encodeur protobuf |
| `app/src/main/java/.../AtvFinder.java` | Recherche des Android TV sur le Wi-Fi (mDNS `_androidtvremote2._tcp` + balayage du réseau local) |
| `tools/test/fake_tv.py` | Fausse Android TV pour les tests (appairage vérifié, pings, journal des touches reçues) |
| `tools/builddb.py` | Construit `codes.txt` à partir de [Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB) |
| `build.sh` | Compile l'APK **sans Android Studio** (outils téléchargés depuis Maven Central) |
| `web/app.html` | Page web (source) : lecteur IPTV avec bascule automatique, listes iptv-org / Free-TV, télécommande Wi-Fi, QR code |
| `web/build_web.py` | Intègre [hls.js](https://github.com/video-dev/hls.js) (Apache-2.0) → `web/TelecommandeTV.html` autonome, et crée `TelecommandeTV-Web.zip` |
| `web/passerelle_tv.py` | Passerelle Wi-Fi en Python pur : clé RSA + certificat X.509 générés sans bibliothèque, appairage et touches Android TV Remote v2, recherche des télés (mDNS + balayage), relais vidéo HLS (réécrit les listes, ajoute Referer / User-Agent, refuse les adresses du réseau local), tests de liens en profondeur par lots, décodeur FFmpeg (réemballage ou conversion H.264/AAC en HLS, installation par téléchargement partiel du zip officiel) |
| `web/test/` | Tests de bout en bout : faux serveur IPTV (`streams.py`, dont son AC-3, DASH, chaîne interdite), Chromium piloté par Playwright (`web_test.js`), tests unitaires de la passerelle (`test_passerelle.py`), `run_tests.sh` |

Recompiler : `./build.sh` (Java 17+, Python 3, curl). Régénérer la base :
`python3 tools/builddb.py <Flipper-IRDB> app/src/main/assets/codes.txt <tv.ir>`.

**Vérifications faites :**
- les 3 137 codes de la base donnent des trames **identiques au bit près** à celles des
  encodeurs du firmware Flipper Zero (compilés en C pour comparaison, `app/src/test/java/XCheck.java`) ;
- codes de référence connus : LG `20DF10EF`, Samsung `E0E040BF`, Sony `A90` ×3 ;
- tests d'interface Robolectric (`app/src/test/.../AppTest.java`) : recherche auto,
  défilement, télécommande, répétition du volume, réglage d'un bouton, marques, aide,
  lampe LED / écran, et le **cas réel** « code 16 + disposition BGH » (Volume + retrouvé en
  3 essais, Marche/Arrêt jamais envoyé pendant le scan libre) ;
- Wi-Fi : la fausse Android TV (`tools/test/fake_tv.py`, décodage strict avec les messages
  protobuf de la bibliothèque de référence `androidtvremote2`) a d'abord été validée avec cette
  bibliothèque, puis l'appli a été testée contre elle : appairage, mauvais code refusé, touches,
  répétition, Netflix, reconnexion au redémarrage ;
- APK signé v1 + v2 et vérifié avec apksig ;
- version web (`web/test/run_tests.sh`, 55 vérifications) :
  - lien mort écarté ;
  - deux liens morts → bascule sur une autre chaîne ;
  - lien qui saute **en pleine lecture** → lien suivant de la même chaîne ;
  - chaîne qui coupe → autre chaîne qui marche ;
  - flux refusé par le navigateur ;
  - coupure d'internet → reprise sans pénaliser la chaîne ;
  - favoris, recherche et filtre ;
  - QR codes relus par un décodeur ;
  - classement : 403 → « interdite ici », flux refusé par le navigateur → « à essayer »,
    DASH sans décodeur → « décodeur requis » ;
  - avec la passerelle et la fausse télé : appairage, touches, appui long, clavier, Netflix,
    volume, relais des flux sans CORS ou exigeant un Referer ;
  - décodeur FFmpeg : son AC-3 et flux DASH lus ;
  - installation : `ffmpeg.exe` extrait intact d'une archive distante, archive abîmée refusée,
    fichiers locaux et réseau local refusés.

  Le vrai `ffmpeg.exe` (168 Mo) a aussi été extrait de l'archive officielle en n'en téléchargeant
  que 65 Mo.

  Les bases réelles iptv-org et Free-TV ont aussi été chargées dans Chromium :
  - 16 chaînes pour le Sénégal ;
  - 19 chaînes pour la Côte d'Ivoire ;
  - 289 chaînes et 502 liens pour l'Afrique de l'Ouest ;
  - 13 787 chaînes et 19 488 liens dans le monde entier ;
  - 250 pays dans le « tour du monde ».

La clé de signature (`debug.keystore`) n'est pas publiée : une version recompilée
ailleurs devra être installée après avoir désinstallé l'ancienne.

**Sources des codes** : Flipper-IRDB (domaine public, CC0) et la liste universelle TV du
firmware Flipper Zero (GPL-3.0).
