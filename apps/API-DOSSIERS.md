# API « dossiers » (AccordAI, ColisPreuve)
Base : https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers — JSON, CORS ouvert, aucune clé côté client.
Les liens secrets (jetons) ne sont montrés qu'une fois à la création : l'application les garde sur le téléphone.

- POST /creer {app: "accord"|"colis"|"tontine", titre, donnees: {clé: texte|nombre|booléen}, code_remise?: "4 chiffres" (colis), pass?: {o, t}}
  → 201 {id: "D-XXXXXXXXXX", jetons: {proprio, partie} | {proprio, livreur, destinataire}, premium, empreinte}
  → 429 limite (10 créations/jour sans pass, 500 avec pass)
- GET /<id>?t=<jeton> → {dossier: {id, app, titre, donnees, statut, role, evenements: [{id, auteur, type, donnees, le, precedent, empreinte}]}}
- POST /<id>/evenement {t, type, donnees?, maj? (proprio : modification|acceptation), code_remise? (colis : livraison)}
  types permis — accord : proprio [modification, note, preuve, livraison, cloture, acceptation], partie [confirmation, correction, note, preuve, reception]
                 tontine : proprio [modification, versement_recu, tour, rappel, note, cloture], membre (lien commun du groupe) [versement_declare, note]
                 colis : proprio [preparation, remise_livreur, note, preuve, annulation, modification], livreur [prise_en_charge, en_route, tentative, livraison, note, preuve], destinataire [reception, probleme, note]
  statuts : confirmation→confirme, correction→a_revoir, acceptation→confirme, livraison→livre, reception→recu, cloture→clos, annulation→annule, preparation→prepare, remise_livreur/prise_en_charge→chez_livreur, en_route, tentative, probleme
  colis/livraison : 400 si code_remise faux (le destinataire donne le code au livreur).
- POST /<id>/photo {t, photo: "data:image/jpeg;base64,…" (≤ 1,5 Mo, réduite par le navigateur), legende?} → {photo: "photo-N.jpg", sha256} + événement « preuve »
- GET /<id>/photos/photo-N.jpg?t=<jeton> → image
- POST /extraire {texte?, photos?: [dataURL ≤ 4], pass: {o, t}} → {accord: {titre, vendeur, acheteur, produit, quantite, prix_unitaire, prix_total, acompte, delai, lieu, engagements, points_flous}} ; 402 sans pass AccordAI
- POST /pass {app, pass: {o, t}} → {valide}
Pass : commande payée de la boutique, produits pass-accordai-1-mois / pass-accordai-12-mois, pass-colispreuve-1-mois / pass-colispreuve-12-mois, pass-tontine-12-mois ; « o » = TCV-…, « t » = jeton de la page commande.
Historique : chaque événement porte l'empreinte du précédent ; l'application peut vérifier la chaîne et l'imprimer dans le PDF.
Données effacées 180 jours après la dernière activité. Ne jamais demander d'adresse exacte, de numéro de pièce d'identité ni de données bancaires.
