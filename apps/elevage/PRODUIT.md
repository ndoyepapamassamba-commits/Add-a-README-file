# Fiche produit : Pass Carnet Élevage 12 mois

Application : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/elevage/
Page des applications : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/

## Slug
pass-carnet-elevage-12-mois

## Prix
3000 F CFA (paiement Wave sur la boutique)

## Durée
12 mois (365 jours, +1 jour de grâce à l’activation)

## Titre
Pass Carnet Élevage 12 mois : animaux illimités

## Accroche
Suivez autant de moutons, chèvres et bovins que vous voulez dans Carnet Élevage : pesées, aliment, marge et prix de vente pour la Tabaski. 3 000 F pour 12 mois.

## Description (440 caractères)
Carnet Élevage est une application gratuite pour téléphone qui tient le cahier de votre troupeau : pesées à la balance ou au ruban, gain par jour, coût du kilo gagné, aliment et stock, dépenses, ventes, marge par animal et par lot, mises-bas et compte à rebours de la Tabaski. Elle marche sans Internet et vos données restent sur votre téléphone. La version gratuite suit 10 animaux présents à la fois ; le pass 12 mois enlève cette limite.

## Points forts
- Animaux illimités pendant 12 mois (version gratuite : 10 animaux présents à la fois)
- Gain par jour, coût du kilo gagné et marge par animal et par lot, calculés au franc près
- Prix de vente pour gagner la marge que vous voulez à la Tabaski, avec le compte à rebours
- Aliment : prix du kg, coût de votre ration par jour et jours de stock restants
- Rapport PDF du lot, annonce de vente prête pour WhatsApp, sauvegarde, marche sans Internet

## Questions fréquentes
**Comment activer le pass après le paiement ?**
Sur la page de votre commande payée, touchez « Copier le lien de cette page ». Dans l’application, ouvrez « Mon pass », collez le lien et touchez « Activer ». Une connexion Internet suffit une seule fois.

**L’application me dit-elle quoi donner à mes animaux ?**
Non. Vous notez vos aliments et la ration que vous donnez ; l’application calcule les coûts et le stock. Elle ne donne ni ration, ni soin, ni diagnostic : pour la santé de vos animaux, voyez un vétérinaire.

**Que se passe-t-il à la fin des 12 mois ?**
Rien n’est perdu : tous vos animaux restent consultables et modifiables. Seuls les nouveaux animaux au-delà de 10 présents attendent un nouveau pass. Un rappel s’affiche 14 jours avant la fin, et un renouvellement anticipé ajoute les jours restants.

## Activation dans l’application
Vérification unique : GET https://seegnylaubuularegmku.supabase.co/functions/v1/boutique/commandes/<id>?t=<jeton> ; le pass est accepté si `commande.payee === true`, `commande.produit.slug === "pass-carnet-elevage-12-mois"` et `payee_le` date de moins de 366 jours. Le lien d’achat dans l’application pointe vers `boutique/pass-carnet-elevage-12-mois.html`.

## Données prêtes à insérer (mêmes champs que tcv.boutique_produits)
```json
{
  "slug": "pass-carnet-elevage-12-mois",
  "titre": "Pass Carnet Élevage 12 mois : animaux illimités",
  "domaine": "Élevage",
  "accroche": "Suivez autant de moutons, chèvres et bovins que vous voulez dans Carnet Élevage : pesées, aliment, marge et prix de vente pour la Tabaski. 3 000 F pour 12 mois.",
  "description": "Carnet Élevage est une application gratuite pour téléphone qui tient le cahier de votre troupeau : pesées à la balance ou au ruban, gain par jour, coût du kilo gagné, aliment et stock, dépenses, ventes, marge par animal et par lot, mises-bas et compte à rebours de la Tabaski. Elle marche sans Internet et vos données restent sur votre téléphone. La version gratuite suit 10 animaux présents à la fois ; le pass 12 mois enlève cette limite.",
  "points": [
    "Animaux illimités pendant 12 mois (version gratuite : 10 animaux présents à la fois)",
    "Gain par jour, coût du kilo gagné et marge par animal et par lot, calculés au franc près",
    "Prix de vente pour gagner la marge que vous voulez à la Tabaski, avec le compte à rebours",
    "Aliment : prix du kg, coût de votre ration par jour et jours de stock restants",
    "Rapport PDF du lot, annonce de vente prête pour WhatsApp, sauvegarde, marche sans Internet"
  ],
  "faq": [
    {
      "q": "Comment activer le pass après le paiement ?",
      "r": "Sur la page de votre commande payée, touchez « Copier le lien de cette page ». Dans l’application, ouvrez « Mon pass », collez le lien et touchez « Activer ». Une connexion Internet suffit une seule fois."
    },
    {
      "q": "L’application me dit-elle quoi donner à mes animaux ?",
      "r": "Non. Vous notez vos aliments et la ration que vous donnez ; l’application calcule les coûts et le stock. Elle ne donne ni ration, ni soin, ni diagnostic : pour la santé de vos animaux, voyez un vétérinaire."
    },
    {
      "q": "Que se passe-t-il à la fin des 12 mois ?",
      "r": "Rien n’est perdu : tous vos animaux restent consultables et modifiables. Seuls les nouveaux animaux au-delà de 10 présents attendent un nouveau pass. Un rappel s’affiche 14 jours avant la fin, et un renouvellement anticipé ajoute les jours restants."
    }
  ],
  "prix": 3000
}
```
