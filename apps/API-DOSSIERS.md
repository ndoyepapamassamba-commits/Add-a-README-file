# API « dossiers » (AccordAI, ColisPreuve, Tontine, Rendez-vous Pro, Chantier Clair, Lot Tracé)
Base : https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers — JSON, CORS ouvert, aucune clé côté client.
Les liens secrets (jetons) ne sont montrés qu'une fois à la création : l'application les garde sur le téléphone.

- POST /creer {app: "accord"|"colis"|"tontine"|"rdv"|"chantier"|"trace", titre, donnees: {clé: texte|nombre|booléen} (40 clés au plus, 2 000 caractères par valeur), code_remise?: "4 chiffres" (colis), pass?: {o, t}}
  → 201 {id: "D-XXXXXXXXXX", jetons: {proprio, partie} | {proprio, livreur, destinataire} | {proprio, membre} | {proprio, client} | {proprio, chef, temoin} | {proprio, transporteur, acheteur}, premium, empreinte}
  → 429 limite (10 créations/jour sans pass, 500 avec pass)
- GET /<id>?t=<jeton> → {dossier: {id, app, titre, donnees, statut, role, evenements: [{id, auteur, type, donnees, le, precedent, empreinte}]}}
- POST /<id>/evenement {t, type, donnees?, maj? (proprio : modification|acceptation ; remplace toutes les données), code_remise? (colis : livraison), code? (rdv, lien client)}
  types permis — accord : proprio [modification, note, preuve, livraison, cloture, acceptation], partie [confirmation, correction, note, preuve, reception]
                 tontine : proprio [modification, versement_recu, tour, rappel, note, cloture], membre (lien commun du groupe) [versement_declare, note]
                 colis : proprio [preparation, remise_livreur, note, preuve, annulation, modification], livreur [prise_en_charge, en_route, tentative, livraison, note, preuve], destinataire [reception, probleme, note]
                 rdv : proprio (le professionnel) [modification, confirmation, refus, report, annulation, note, rappel], client (lien public commun, QR code) [demande, annulation, note]
                 chantier : proprio (la personne qui paie) [modification, validation, question, note, versement_declare, cloture], chef [avancement, preuve, demande_materiaux, depense, note], temoin [constat, preuve, note]
                 trace : proprio (producteur ou exportateur) [recolte, tri, conditionnement, expedition, note, preuve, modification], transporteur [prise_en_charge, en_route, livraison, preuve, note], acheteur [reception, reserve, preuve, note]
  statuts (accord, colis, tontine) : confirmation→confirme, correction→a_revoir, acceptation→confirme, livraison→livre, reception→recu, cloture→clos, annulation→annule, preparation→prepare, remise_livreur/prise_en_charge→chez_livreur, en_route, tentative, probleme, tour→en_cours
  statuts propres (remplacent la liste commune) — rdv : demande→en_attente, confirmation→confirme, refus→refuse, report→reporte, annulation→annule
                 chantier : avancement→en_cours, validation→valide, cloture→termine
                 trace : recolte→recolte, tri→trie, conditionnement→conditionne, expedition→expedie, prise_en_charge→en_transport, en_route→en_route, livraison→livre, reception→recu, reserve→reserve
  rdv (Rendez-vous Pro) — une page = un dossier ; chaque rendez-vous = des événements de ce dossier :
    · client/demande : donnees {nom (≥ 2), date "AAAA-MM-JJ", heure "HH:MM", duree (min), service, prix, telephone? (facultatif, choisi par le client), note?} + code (16 à 64 caractères tirés au hasard
      et gardés par le téléphone du client) ; le serveur garde seulement donnees.verif = sha256("rdv:" + code). 400 si jour, heure ou nom manquent ; 429 au-delà de 6 demandes par jour et par adresse IP.
    · client/annulation et client/note : donnees.demande = empreinte de la demande + le même code, sinon 403.
    · proprio/confirmation|refus|report|annulation|rappel|note : donnees.demande = empreinte de la demande (report : nouvelle date/heure) ;
      confirmation sans « demande » = rendez-vous ajouté par le professionnel (donnees {nom, date, heure, duree, service…}).
    · GET avec le lien client : les événements « note » et « rappel » sont retirés ; des autres, seuls date, heure, duree et demande restent
      (jamais le nom, le numéro, la note ni verif). Le lien du professionnel voit tout.
  colis/livraison : 400 si code_remise faux (le destinataire donne le code au livreur) ; 10 essais au plus par colis et par 24 h,
    comptés avant la comparaison → 429 au-delà, même avec le bon code. Nouveaux colis : empreinte HMAC-SHA256(poivre secret du serveur,
    id + ":" + code), donnees.code_schema = 2 (anciens colis : sha256 simple, encore vérifié). Le code n'est jamais stocké en clair.
  Aucune clé finissant par « _empreinte » n'est renvoyée (ni dans donnees, ni dans l'historique) ; « code_schema » et les empreintes
    ne peuvent pas être imposés par le téléphone (creer, maj).
  Plafond d'événements par dossier : tontine et chantier 3 000, rdv 1 500, accord, colis et trace 400 → 409 « plein » au-delà ; 300 événements par jour et par dossier → 429.
- POST /<id>/photo {t, photo: "data:image/jpeg;base64,…" (≤ 1,5 Mo, réduite par le navigateur), legende?} → {photo: "photo-N.jpg", sha256} + événement « preuve » ; 30 photos par dossier.
  rdv, chantier, trace : seulement les rôles qui ont « preuve » (chantier : chef, temoin ; trace : proprio, transporteur, acheteur ; rdv : aucun) — 403 sinon.
- GET /<id>/photos/photo-N.jpg?t=<jeton> → image
- POST /extraire {texte?, photos?: [dataURL ≤ 4], pass: {o, t}} → {accord: {titre, vendeur, acheteur, produit, quantite, prix_unitaire, prix_total, acompte, delai, lieu, engagements, points_flous}} ; 402 sans pass AccordAI
- POST /pass {app, pass: {o, t}} → {valide}
Pass : commande payée de la boutique, produits pass-accordai-1-mois / pass-accordai-12-mois, pass-colispreuve-1-mois / pass-colispreuve-12-mois, pass-tontine-12-mois,
pass-rendez-vous-pro-1-mois (1 000 F) / pass-rendez-vous-pro-12-mois (9 000 F), pass-chantier-clair-12-mois (5 000 F), pass-lot-trace-12-mois (5 000 F) ; « o » = TCV-…, « t » = jeton de la page commande.
Historique : chaque événement porte l'empreinte du précédent ; l'application peut vérifier la chaîne et l'imprimer dans le PDF.
Données effacées 180 jours après la dernière activité. Ne jamais demander d'adresse exacte, de numéro de pièce d'identité ni de données bancaires.
