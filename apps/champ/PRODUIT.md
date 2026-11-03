# Fiche produit : Pass Champ Pilot 12 mois

Application : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/champ/
Page des applications : https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/

## Slug
pass-champ-pilot-12-mois

## Prix
2000 F CFA (paiement Wave sur la boutique)

## Durée
12 mois (365 jours, +1 jour de grâce à l’activation)

## Titre
Pass Champ Pilot 12 mois : parcelles illimitées

## Accroche
Suivez toutes vos parcelles dans Champ Pilot : travaux, achats, main-d’œuvre, récolte, rendement à l’hectare et marge. 2 000 F pour 12 mois.

## Description (471 caractères)
Champ Pilot est une application gratuite pour téléphone qui tient le carnet de votre campagne agricole : arachide, mil, maïs, oignon, riz, niébé ou maraîchage. Notez vos travaux avec rappels, vos achats de semences et d’engrais, la main-d’œuvre, la récolte et les ventes : l’application calcule le rendement à l’hectare, la marge par parcelle et compare vos campagnes. Sans Internet, données gardées sur le téléphone. Le pass enlève la limite de 2 parcelles par campagne.

## Points forts
- Parcelles illimitées pendant 12 mois (version gratuite : 2 parcelles par campagne)
- Rendement à l’hectare, marge par parcelle et par campagne, calculés au franc près
- Calendrier des travaux avec rappels dans l’application et message WhatsApp prêt à envoyer
- Comparaison des campagnes d’une année à l’autre et rapport PDF à partager
- Besoin en eau indicatif sur 7 jours (sur demande), sauvegarde, marche sans Internet

## Questions fréquentes
**Comment activer le pass après le paiement ?**
Sur la page de votre commande payée, touchez « Copier le lien de cette page ». Dans l’application, ouvrez « Mon pass », collez le lien et touchez « Activer ». Une connexion Internet suffit une seule fois.

**L’application conseille-t-elle des engrais, des produits ou des doses ?**
Non. Vous notez seulement les noms et les prix de ce que vous achetez. Pour les produits et les doses, suivez l’étiquette et votre conseiller agricole. Le besoin en eau est un repère indicatif, pas un conseil d’arrosage.

**Que se passe-t-il à la fin des 12 mois ?**
Rien n’est perdu : toutes vos parcelles et vos campagnes restent consultables et modifiables. Seule une nouvelle parcelle au-delà de 2 par campagne attend un nouveau pass. Un rappel s’affiche 14 jours avant la fin.

## Activation dans l’application
Vérification unique : GET https://seegnylaubuularegmku.supabase.co/functions/v1/boutique/commandes/<id>?t=<jeton> ; le pass est accepté si `commande.payee === true`, `commande.produit.slug === "pass-champ-pilot-12-mois"` et `payee_le` date de moins de 366 jours. Le lien d’achat dans l’application pointe vers `boutique/pass-champ-pilot-12-mois.html`.

## Données prêtes à insérer (mêmes champs que tcv.boutique_produits)
```json
{
  "slug": "pass-champ-pilot-12-mois",
  "titre": "Pass Champ Pilot 12 mois : parcelles illimitées",
  "domaine": "Agriculture",
  "accroche": "Suivez toutes vos parcelles dans Champ Pilot : travaux, achats, main-d’œuvre, récolte, rendement à l’hectare et marge. 2 000 F pour 12 mois.",
  "description": "Champ Pilot est une application gratuite pour téléphone qui tient le carnet de votre campagne agricole : arachide, mil, maïs, oignon, riz, niébé ou maraîchage. Notez vos travaux avec rappels, vos achats de semences et d’engrais, la main-d’œuvre, la récolte et les ventes : l’application calcule le rendement à l’hectare, la marge par parcelle et compare vos campagnes. Sans Internet, données gardées sur le téléphone. Le pass enlève la limite de 2 parcelles par campagne.",
  "points": [
    "Parcelles illimitées pendant 12 mois (version gratuite : 2 parcelles par campagne)",
    "Rendement à l’hectare, marge par parcelle et par campagne, calculés au franc près",
    "Calendrier des travaux avec rappels dans l’application et message WhatsApp prêt à envoyer",
    "Comparaison des campagnes d’une année à l’autre et rapport PDF à partager",
    "Besoin en eau indicatif sur 7 jours (sur demande), sauvegarde, marche sans Internet"
  ],
  "faq": [
    {
      "q": "Comment activer le pass après le paiement ?",
      "r": "Sur la page de votre commande payée, touchez « Copier le lien de cette page ». Dans l’application, ouvrez « Mon pass », collez le lien et touchez « Activer ». Une connexion Internet suffit une seule fois."
    },
    {
      "q": "L’application conseille-t-elle des engrais, des produits ou des doses ?",
      "r": "Non. Vous notez seulement les noms et les prix de ce que vous achetez. Pour les produits et les doses, suivez l’étiquette et votre conseiller agricole. Le besoin en eau est un repère indicatif, pas un conseil d’arrosage."
    },
    {
      "q": "Que se passe-t-il à la fin des 12 mois ?",
      "r": "Rien n’est perdu : toutes vos parcelles et vos campagnes restent consultables et modifiables. Seule une nouvelle parcelle au-delà de 2 par campagne attend un nouveau pass. Un rappel s’affiche 14 jours avant la fin."
    }
  ],
  "prix": 2000
}
```
