# 📺 Télécommande TV universelle (ELACTRON et autres marques)

Appli Android qui transforme ton téléphone en **télécommande infrarouge** pour ta télé
ELACTRON (ou n'importe quelle autre marque), avec en bonus une **lampe torche**
(LED arrière à pleine puissance ou écran lumineux de la couleur de ton choix).

➡️ **Fichier à installer : [`TelecommandeTV.apk`](TelecommandeTV.apk)** (≈ 110 Ko)

Lien direct à partager (WhatsApp, mail, SMS…) :
https://github.com/ndoyepapamassamba-commits/Add-a-README-file/raw/claude/admiring-cray-uua1sz/telecommande-tv/TelecommandeTV.apk

---

## ⚠️ Condition indispensable : un téléphone avec infrarouge

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
6. La télécommande s'ouvre. Rallume la télé avec le bouton **⏻** de l'appli.

💡 Tu ne veux pas éteindre la télé pendant la recherche ? Choisis **🔇 Muet** ou
**🔉 Volume −** comme bouton de test : le symbole s'affiche à l'écran quand c'est le bon code.

## 🛠 Un bouton ne marche pas ?

Touche **🛠 Régler** en haut de la télécommande, puis le bouton en question (ou fais un
**appui long** dessus). L'appli essaie tous les codes possibles de ta télé : appuie sur
**✅ C'est ce code !** quand la télé fait la bonne action. Le réglage est gardé en mémoire.

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
| `app/src/main/java/.../CodeDb.java` | Charge la base `assets/codes.txt` (familles triées de la plus courante à la plus rare) |
| `app/src/main/java/.../MainActivity.java` | Accueil, recherche auto, choix par marque, télécommande, réglage bouton par bouton |
| `app/src/main/java/.../LampActivity.java` | Lampe torche LED / écran couleur |
| `tools/builddb.py` | Construit `codes.txt` à partir de [Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB) |
| `build.sh` | Compile l'APK **sans Android Studio** (outils téléchargés depuis Maven Central) |

Recompiler : `./build.sh` (Java 17+, Python 3, curl). Régénérer la base :
`python3 tools/builddb.py <Flipper-IRDB> app/src/main/assets/codes.txt <tv.ir>`.

**Vérifications faites :**
- les 3 095 codes de la base donnent des trames **identiques au bit près** à celles des
  encodeurs du firmware Flipper Zero (compilés en C pour comparaison, `app/src/test/java/XCheck.java`) ;
- codes de référence connus : LG `20DF10EF`, Samsung `E0E040BF`, Sony `A90` ×3 ;
- tests d'interface Robolectric (`app/src/test/.../AppTest.java`) : recherche auto,
  défilement, télécommande, répétition du volume, réglage d'un bouton, marques, aide,
  lampe LED / écran ;
- APK signé v1 + v2 et vérifié avec apksig.

La clé de signature (`debug.keystore`) n'est pas publiée : une version recompilée
ailleurs devra être installée après avoir désinstallé l'ancienne.

**Sources des codes** : Flipper-IRDB (domaine public, CC0) et la liste universelle TV du
firmware Flipper Zero (GPL-3.0).
