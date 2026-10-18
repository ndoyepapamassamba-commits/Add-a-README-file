# Relier votre téléphone : les paiements Wave se débloquent tout seuls

## À quoi ça sert

Chaque client reçoit un **montant unique** à envoyer. Par exemple 1 487 FCFA au lieu de 1 500 FCFA.
Quand l'argent arrive, Wave affiche une notification sur votre téléphone : « Vous avez reçu 1 487F de … ».

L'application **MacroDroid** envoie ce texte au site. Le site reconnaît le montant et débloque la commande.
Le client voit ses documents en moins d'une minute. **Vous n'avez rien à faire.**

## Ce qu'il vous faut

- Votre téléphone **Android**, celui où l'application Wave reçoit l'argent des clients.
- Internet sur ce téléphone (données mobiles ou Wi-Fi).
- 10 minutes.
- Deux informations que l'assistant vous donne en privé :
  - l'adresse du site : **{API}**
  - votre clé secrète : **{CLÉ}**

Ne montrez jamais la clé à personne.

## Installer (une seule fois)

1. Ouvrez le **Play Store**. Cherchez **MacroDroid**. Installez l'application (elle est gratuite).
2. Ouvrez MacroDroid. Touchez **« Ajouter une macro »**.
3. Dans **Déclencheurs**, touchez **+**. Cherchez **« Notification »**, puis choisissez **« Notification reçue »**.
4. Choisissez l'application **Wave** (celle où vous recevez l'argent des clients).
   Pour le contenu, choisissez **« Tout contenu »**. Touchez **OK**.
5. Dans **Actions**, touchez **+**. Ouvrez **« Connectivité »**, puis choisissez **« Requête HTTP »**.
6. Méthode : choisissez **POST**.
7. Adresse (URL) : écrivez exactement, sans espace :

   `{API}/payments/notify?k={CLÉ}`

8. Corps de la requête : choisissez **« Texte »**.
   Touchez le bouton des **textes magiques** (souvent « … » ou une petite étiquette).
   Insérez **« Titre de la notification »**, tapez un espace, puis insérez **« Texte de la notification »**.
9. Touchez **OK** pour enregistrer l'action.
10. Donnez un nom à la macro, par exemple **« Teranga CV paiements »**. Touchez la **coche** pour enregistrer.
11. MacroDroid demande l'**accès aux notifications** : touchez **Autoriser**.
    (Sinon : Paramètres du téléphone → Notifications → Accès aux notifications → MacroDroid → activer.)
12. Batterie : Paramètres du téléphone → Applications → **MacroDroid** → Batterie → **« Sans restriction »**
    (ou « Ne pas optimiser »). Sinon, le téléphone peut endormir MacroDroid.

## Tester

1. Dans MacroDroid, ouvrez la macro « Teranga CV paiements ».
2. Touchez l'action **« Requête HTTP »**, puis **« Tester l'action »**.
3. Ouvrez la page admin et touchez **« Actualiser »**.
4. La ligne **« Téléphone relié (MacroDroid) »** doit afficher **« Dernier signal reçu le … »** avec l'heure du test.

Si l'heure ne s'affiche pas :

- vérifiez l'adresse : elle commence par `https://`, sans espace, avec `?k=` puis la clé ;
- vérifiez que le téléphone a Internet ;
- refaites l'étape 11 (accès aux notifications).

## Au quotidien

- Laissez le téléphone allumé, avec Internet. Ne fermez pas MacroDroid de force.
- Vos propres envois, paiements, retraits et dépôts sont ignorés. Seul l'argent **reçu** compte.
- Si un client arrondit (par exemple 1 500 au lieu de 1 487), le site le reconnaît quand même s'il est
  le seul client récent. Sinon, la commande reste dans **« Paiements à vérifier »** avec l'étiquette
  **« Paiement détecté »** : vérifiez votre Wave, puis touchez **« Débloquer »**.
- Si vous changez de téléphone, refaites ce guide sur le nouveau téléphone.

## Vos données

- Le texte de la notification contient le nom et le numéro du client. Il est gardé avec la commande,
  puis effacé automatiquement, comme le reste (30 jours au plus).
- Si vous pensez que quelqu'un a vu votre clé, demandez une nouvelle clé à l'assistant.
  L'ancienne ne marchera plus.

---

Note pour l'assistant (technique) : {API} = l'adresse de la fonction `api` (voir `supabase/SPEC.md`).
{CLÉ} = la valeur de `PHONE_HOOK_KEY`, à créer (longue et aléatoire) dans `tcv.settings` ou dans les secrets
de la fonction, jamais dans le dépôt. `MANUAL_AUTO_CONFIRM=false` garde la détection sans débloquer tout seul.
