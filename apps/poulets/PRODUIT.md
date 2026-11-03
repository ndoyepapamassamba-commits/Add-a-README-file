# PouletPilot — fiches des deux produits de la boutique

Application : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/poulets/
Catégorie conseillée : « Élevage et volaille ». Paiement Wave, comme les autres produits.

L'application vérifie la commande par `GET …/functions/v1/boutique/commandes/<id>?t=<jeton>` :
le pass est valable si `commande.payee === true` et si `commande.produit.slug` vaut exactement
`pass-pouletpilot-1-mois` (30 jours après `payee_le`) ou `pass-pouletpilot-12-mois` (365 jours après `payee_le`).
Les boutons « Acheter » et « Renouveler » de l'application ouvrent `boutique/<slug>.html`.

---

## Produit 1 — Pass PouletPilot 1 mois

- **Slug** : `pass-pouletpilot-1-mois`
- **Prix** : 2 000 F
- **Titre** : Pass PouletPilot 1 mois : la gestion complète de vos poulets de chair
- **Accroche** : Pendant 30 jours, suivez tous vos lots, comparez-les et partagez des rapports PDF, depuis votre téléphone.

**Description** (439 caractères) :
PouletPilot est une application pour téléphone qui aide l'éleveur de poulets de chair à suivre chaque lot : morts, sacs d'aliment, pesées, dépenses et ventes. Elle calcule l'indice de consommation, le coût par poulet, le prix minimum de vente et la marge. Le Pass 1 mois débloque pendant 30 jours la version complète : lots illimités, comparaison des lots, rapports PDF et estimation de fin de lot. Vos données restent sur votre téléphone.

**Points forts** :
1. Lots en cours illimités pendant 30 jours (la version gratuite en suit un seul)
2. Comparaison des lots : mortalité, indice de consommation, coût et marge par poulet
3. Rapport PDF du lot, prêt à partager sur WhatsApp ou à imprimer
4. Estimation de fin de lot : poids, sacs d'aliment à acheter, prix minimum et marge
5. Fonctionne sans Internet ; aucune donnée envoyée, sauf la vérification du pass une fois

**Questions fréquentes** :
- **Comment activer mon pass ?** — Après le paiement Wave, la page de votre commande s'ouvre. Touchez « Copier le lien de cette page », ouvrez PouletPilot, allez dans « Mon pass », collez le lien et touchez « Activer ». Il faut Internet une seule fois.
- **Que se passe-t-il à la fin des 30 jours ?** — Rien n'est prélevé automatiquement. Vous gardez tous vos lots et vos chiffres, la sauvegarde et l'export CSV. Les fonctions du pass se mettent en pause ; l'application vous prévient 5 jours avant la fin.
- **L'application donne-t-elle des conseils vétérinaires ?** — Non. PouletPilot est un outil de gestion : il signale des chiffres « à vérifier » mais ne donne ni diagnostic ni traitement. Pour la santé de vos poulets, consultez un vétérinaire.

---

## Produit 2 — Pass PouletPilot 12 mois

- **Slug** : `pass-pouletpilot-12-mois`
- **Prix** : 15 000 F
- **Titre** : Pass PouletPilot 12 mois : un an de gestion complète pour votre poulailler
- **Accroche** : Une année entière de version complète pour 15 000 F, soit 1 250 F par mois.

**Description** (506 caractères) :
PouletPilot est une application pour téléphone qui aide l'éleveur de poulets de chair à suivre chaque lot : morts, sacs d'aliment, pesées, dépenses et ventes. Elle calcule l'indice de consommation, le coût par poulet, le prix minimum de vente et la marge. Le Pass 12 mois débloque pendant 365 jours la version complète : lots illimités, comparaison de toutes vos bandes de l'année, rapports PDF et estimation de fin de lot. Un seul paiement par an, sans abonnement. Vos données restent sur votre téléphone.

**Points forts** :
1. 365 jours de version complète, soit 1 250 F par mois
2. Toutes vos bandes de l'année suivies et comparées côte à côte
3. Rapports PDF à partager avec un associé, un client ou un organisme de crédit
4. Estimation de fin de lot pour prévoir l'aliment à acheter et le bon prix de vente
5. Un seul paiement Wave, sans abonnement ; données gardées sur votre téléphone

**Questions fréquentes** :
- **J'ai déjà un pass 1 mois en cours : est-ce que je perds des jours ?** — Non. Les jours qui vous restent s'ajoutent aux 365 jours du nouveau pass.
- **Et si je change de téléphone ?** — Faites une sauvegarde dans Réglages et envoyez-vous le fichier. Sur le nouveau téléphone, restaurez la sauvegarde puis collez à nouveau le lien de votre commande dans « Mon pass ».
- **Faut-il Internet pour utiliser l'application ?** — Seulement pour l'ouvrir la première fois et pour activer le pass, une fois. Ensuite, toutes les saisies et tous les calculs marchent sans Internet.
