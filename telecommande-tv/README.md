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
- APK signé v1 + v2 et vérifié avec apksig.

La clé de signature (`debug.keystore`) n'est pas publiée : une version recompilée
ailleurs devra être installée après avoir désinstallé l'ancienne.

**Sources des codes** : Flipper-IRDB (domaine public, CC0) et la liste universelle TV du
firmware Flipper Zero (GPL-3.0).
