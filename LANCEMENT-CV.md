# Teranga CV — Votre guide de lancement

Ce guide est pour vous, le propriétaire. Il explique tout, simplement.
Lisez-le une fois en entier. Gardez-le pour plus tard.

---

## 1. Ce que fait votre business

Teranga CV est un site internet.
Une personne qui cherche du travail remplit un formulaire sur son téléphone.
Le site écrit son CV et/ou sa lettre de motivation, en bon français, avec ses vraies informations.
La personne voit d'abord un **aperçu gratuit** (une partie du texte est floutée).
Si l'aperçu lui plaît, elle paie avec **Wave** :

| Produit | Prix |
|---|---|
| CV | 1 000 FCFA |
| Lettre de motivation | 1 000 FCFA |
| Pack CV + lettre | 1 500 FCFA |

Après le paiement, elle télécharge son document (PDF ou Word) ou l'imprime.
Le site travaille seul, jour et nuit. Vous n'écrivez aucun CV.

---

## 2. Vos deux liens

- **Le site** (à partager partout) : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/
- **Votre page admin** (SECRÈTE) : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/admin.html (la clé secrète vous a été donnée en privé ; ne la publiez jamais)

La page admin est **pour vous seul**.
Ne la partagez avec personne. Ne l'envoyez dans aucun groupe.
Avec ce lien, quelqu'un pourrait voir vos ventes et débloquer des commandes.
Enregistrez-la dans les favoris de votre téléphone.
Si vous pensez que quelqu'un l'a vue, demandez à l'assistant de changer la clé.

---

## 3. Comment se passe une vente

1. Le client ouvre le site.
2. Il choisit : CV, lettre, ou les deux.
3. Il remplit le formulaire (environ 5 minutes).
4. Il voit l'aperçu gratuit. Il peut choisir le modèle (classique, moderne, élégant).
5. Il clique sur le bouton pour payer avec Wave.
6. Le paiement est confirmé. Le document complet s'affiche.
7. Il peut corriger un mot, puis télécharger en PDF ou en Word, ou imprimer.

Les données du client sont effacées automatiquement :
après 3 jours si le client n'a pas payé, après 30 jours s'il a payé.

---

## 4. Comment l'argent arrive sur votre Wave

Il y a deux modes. Aujourd'hui, c'est le **mode manuel**.
Plus tard, quand votre compte Wave Business sera prêt, ce sera le **mode automatique**.

### Aujourd'hui : le mode manuel

L'argent arrive **directement sur votre Wave personnel**. Mais vous devez débloquer chaque commande.

1. Le client clique sur « Payer ». Le site lui montre **votre numéro Wave**, le **montant exact** et une **référence** (par exemple TCV-7K2M9QXA).
2. Le client vous envoie l'argent avec Wave, comme un transfert normal.
3. Il clique sur « J'ai payé » et donne son numéro.
4. WhatsApp s'ouvre chez lui avec un message pour vous : la référence, le montant et son numéro.
5. **Vous ouvrez votre application Wave.** Vous vérifiez que le bon montant est bien arrivé, depuis ce numéro.
6. Vous ouvrez la page admin. La commande est tout en haut, dans « Paiements à vérifier », marquée « En attente » (le client dit avoir payé).
7. Vous cliquez sur **« Débloquer »**.
8. Chez le client, le document complet apparaît tout seul. C'est fini.

**Règle d'or : ne débloquez jamais avant d'avoir vu l'argent dans votre application Wave.**
Une capture d'écran peut être fausse. Seule votre application Wave compte.

Allez vite : le client attend devant son écran.
Activez les notifications de Wave et de WhatsApp sur votre téléphone.

### Bientôt : le mode automatique

Vous n'avez plus rien à faire pour les ventes.

1. Le client paie sur la page officielle de Wave.
2. Le site reçoit la confirmation de Wave et débloque le document **tout seul**, tout de suite.
3. L'argent de la vente arrive sur votre **compte Wave Business** (le compte de votre activité).
4. **Chaque soir à 20 h 30** (heure de Dakar), le système envoie l'argent des ventes du jour sur **votre numéro Wave personnel**.

Les frais de Wave :

- environ **1 %** sur chaque vente reçue ;
- environ **1 %** sur l'envoi du soir vers votre Wave personnel.

Wave peut changer ses frais : vérifiez-les dans votre contrat Wave Business.

**Exemple de calcul** (ce n'est pas une prévision) :
10 packs vendus dans la journée = 15 000 FCFA.
Après les frais Wave sur les ventes, il reste environ 14 850 FCFA.
Le soir, vous recevez environ **14 700 FCFA** sur votre Wave personnel. Le reste paie les frais de l'envoi.

S'il y a moins de 1 000 FCFA à envoyer un soir, l'argent attend le soir suivant.
Quand le mode automatique marche, le site n'utilise plus le mode manuel.

---

## 5. Ce que vous seul pouvez faire (pour passer en mode automatique)

L'assistant ne peut pas faire ces étapes à votre place. Elles sont à votre nom.

### Étape 1 — Demander un compte Wave Business

1. Allez sur **https://www.wave.com/fr/business/**
2. Cliquez sur **« Contacter l'équipe commerciale »** et remplissez le formulaire.
3. Wave vous recontacte. En général, Wave demande :
   - votre **NINEA** (voir section 6) ;
   - votre **RCCM** (le registre du commerce de votre activité) ;
   - votre **pièce d'identité**.

   La liste exacte vient de Wave. Répondez à toutes leurs questions.

### Étape 2 — Créer la clé API

La clé API est comme un mot de passe spécial. Elle permet au site de parler à Wave.

1. Connectez-vous sur **business.wave.com** avec un compte **administrateur**.
2. Ouvrez le menu **Développeurs** (en anglais : *Developers*).
3. Créez une nouvelle **clé API**.
4. Donnez-lui l'accès à : **Checkout**, **Balance** et **Payout**.
5. **Ne cochez pas** l'option de signature des requêtes (*request signing*) : le site n'en a pas besoin.
6. **Copiez la clé tout de suite.** Wave ne la montre qu'une seule fois.

Si vous ne voyez pas le menu Développeurs, demandez au support Wave de l'activer.

### Étape 3 — Créer le webhook

Le webhook est une adresse où Wave prévient le site quand un client a payé.

1. Toujours dans **Développeurs**, ouvrez **Webhooks**.
2. Cliquez sur **Ajouter un webhook** (en anglais : *Add New Webhook*).
3. Adresse (URL) à copier exactement :
   `https://seegnylaubuularegmku.supabase.co/functions/v1/api/wave/webhook`
4. Sécurité : choisissez **Signing Secret**.
5. Événement : cochez **checkout.session.completed**.
6. Enregistrez. **Copiez le secret** que Wave affiche (il commence souvent par `wave_sn_WHS_`). Il n'est montré qu'une fois.

### Étape 4 — Donner les informations à l'assistant

Envoyez à l'assistant, **dans une conversation privée** :

- la **clé API** (étape 2) ;
- le **secret du webhook** (étape 3) ;
- votre **numéro Wave personnel** qui recevra l'argent chaque soir.

Ne publiez jamais la clé ni le secret : pas sur WhatsApp, pas sur Facebook, pas dans un groupe.
L'assistant active le mode automatique.
Ensuite, faites **un achat test vous-même** pour vérifier que tout marche.

---

## 6. Le minimum légal, en mots simples

- **NINEA** : c'est le numéro officiel de votre activité. Vous pouvez le demander en ligne avec le service **E-NINEA** de l'ANSD (site `e-ninea.ansd.sn`, aussi accessible depuis le portail e-Sénégal). Wave Business le demande en général.
- **RCCM** : c'est l'inscription de votre activité au registre du commerce. Si Wave vous le demande, renseignez-vous au guichet de création d'entreprise de l'APIX.
- **Déclaration à la CDP** : le site garde des CV pendant quelques jours. Ce sont des **données personnelles**. La loi sénégalaise (loi n° 2008-12 du 25 janvier 2008) protège ces données. Elle est contrôlée par la **CDP** (Commission de Protection des Données Personnelles). Déclarez votre site à la CDP. Les formulaires sont sur **www.cdp.sn**.
- **Où sont les données** : chez **Supabase**, un hébergeur, dans un centre de données à **Paris** (Union européenne). Dites-le dans votre déclaration à la CDP. Le site l'indique aussi aux clients.
- **Combien de temps** : 30 jours maximum après le paiement (3 jours si pas de paiement). L'effacement est automatique.
- **Aucune donnée sensible** : le site ne demande jamais la religion, l'ethnie, la santé ou les opinions politiques. Ne les demandez jamais, même par WhatsApp.
- **Impôts** : vos ventes sont des revenus. Renseignez-vous au centre des services fiscaux de votre quartier pour savoir comment les déclarer.

---

## 7. Comment lire la page admin

Ouvrez https://ndoyepapamassamba-commits.github.io/Add-a-README-file/cv/admin.html (la clé secrète vous a été donnée en privé ; ne la publiez jamais). La page se souvient de votre clé sur ce téléphone.

En mode manuel, les commandes à débloquer s'affichent tout en haut, dans **Paiements à vérifier**.

### Les voyants (« État du système »)

Ils disent si chaque partie du système est prête.

- **Wave** : le paiement automatique est prêt (clé API en place) ou pas encore.
- **Webhook** : Wave peut prévenir le site quand un client paie.
- **Versement** : l'envoi automatique du soir vers votre Wave personnel est activé.
- **Mode manuel** : les clients peuvent payer par transfert Wave sur votre numéro.
- **IA** : une aide qui améliore le style du texte. C'est optionnel. Le site marche sans.
- **Votre numéro Wave** : le numéro qui reçoit l'argent du soir.

En mode manuel, il est normal que Wave, Webhook et Versement ne soient pas encore prêts.

### Les chiffres

Une case pour **aujourd'hui**, **hier**, **7 jours**, **30 jours** et **depuis le début** :

- le grand chiffre : les **revenus**, l'argent des commandes payées, en FCFA, avant les frais Wave ;
- en dessous : le nombre de commandes **payées** sur le nombre de **commandes** (aperçus créés, payés ou non).

**À reverser ce soir** : l'argent des ventes automatiques pas encore envoyé sur votre Wave personnel.

### Les commandes récentes

Chaque ligne est une commande, avec sa référence (TCV-…), le produit, le montant et l'état :

- **Aperçu** : le client a vu l'aperçu mais n'a pas payé. Rien à faire.
- **Paiement en cours** : le client est sur la page de paiement Wave. Rien à faire.
- **En attente** : en mode manuel, le client dit avoir payé. **Vérifiez votre Wave**, puis cliquez sur **Débloquer**.
- **Payé** : tout est bon.

### Les versements

Tableau « Versements vers votre Wave ». Une ligne par soir : la date, le montant envoyé et l'état
(réussi, en cours, échoué, ou « à confirmer » : le système réessaie tout seul le soir suivant).
Si un versement est « échoué », prévenez l'assistant. L'argent reste en sécurité sur votre compte Wave Business.

---

## 8. Votre routine : 10 minutes par jour

Le site vend seulement si des gens le voient.
Le plan complet, avec tous les textes prêts à copier, est dans **MARKETING-CV.md**.

En résumé, chaque jour :

1. un statut WhatsApp ;
2. un post dans un groupe Facebook d'emploi (un jour sur trois) ;
3. une vidéo courte (un jour sur deux) ;
4. un coup d'œil à la page admin.

En mode manuel : regardez aussi vos messages WhatsApp plusieurs fois par jour pour débloquer les commandes.

---

## 9. Questions fréquentes

**Un client dit qu'il a payé, mais je ne vois rien dans Wave.**
Ne débloquez pas. Demandez-lui poliment le numéro qui a payé et l'heure. Vérifiez l'historique de votre Wave.
Si l'argent n'est pas arrivé, il n'y a pas de vente.

**Un client a payé mais ne voit pas son document.**
Sur la page de résultat, il peut cliquer sur « Vérifier maintenant ».
Il peut aussi rouvrir sa commande depuis « Mes documents », sur le même téléphone.
Regardez dans la page admin si la commande est bien « Payé ».

**Un client veut être remboursé.**
C'est votre décision. Si vous acceptez, renvoyez-lui l'argent avec Wave.

**Je veux changer les prix.**
Demandez à l'assistant. Il change les prix sans toucher au reste.

**J'ai perdu le lien admin.**
Demandez à l'assistant de créer une nouvelle clé. L'ancienne ne marchera plus.

**Je n'ai pas d'ordinateur.**
Pas besoin. Tout se fait sur le téléphone.

**Combien vais-je gagner ?**
Personne ne peut le dire. Cela dépend du nombre de personnes qui visitent le site, et de votre régularité.
Il n'y a aucune garantie de revenus.

---

## 10. Une note honnête

Ce business est réel et il marche tout seul. Mais **il ne garantit aucun revenu.**
Les ventes dépendent des visiteurs. Sans visiteurs, il n'y a pas de ventes.
Les premières semaines peuvent être calmes. C'est normal.
La régularité compte plus que tout : 10 minutes par jour, tous les jours.

---

### Sources

- Wave Business (frais et contact commercial) : https://www.wave.com/fr/business/
- Documentation Wave (clés API, menu Développeurs) : https://docs.wave.com/business
- Documentation Wave (webhooks, Signing Secret) : https://docs.wave.com/webhook
- E-NINEA, demande du NINEA en ligne (ANSD) : https://senego.com/e-ninea-immatriculation-en-ligne-et-obtention-du-ninea-100-en-ligne_1999150.html
- Commission de Protection des Données Personnelles (CDP) : https://www.cdp.sn
