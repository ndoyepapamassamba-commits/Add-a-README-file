-- Applications TERANGA (dossier apps/) : leurs pass sont des produits de la boutique créés par le propriétaire avec
-- scripts/apps/passes.py (source « applis », publiés tout de suite, un mode d'emploi PDF livré comme fichier).
-- Un pass annuel peut dépasser le plafond des outils de la fabrique (9 500 F) : jusqu'à 50 000 F pour la source « applis ».
-- La fabrique garde ses règles : son dépôt force la source « fabrique » et refuse un prix au-delà de 9 500 F.
alter table tcv.boutique_produits drop constraint boutique_produits_source_check;
alter table tcv.boutique_produits add constraint boutique_produits_source_check
  check (source in ('fabrique', 'manuel', 'applis'));
alter table tcv.boutique_produits drop constraint boutique_produits_prix_check;
alter table tcv.boutique_produits add constraint boutique_produits_prix_check
  check (prix between 500 and 9500 or (source = 'applis' and prix between 500 and 50000));
