/* Calcul Chantier — logique pure (sans interface) : dosages, quantités par élément, arrondis, budget par étape,
   plan d'épargne, pass. Utilisable dans le navigateur (window.CC) et dans Node (require) pour les tests.
   Toutes les hypothèses sont listées ici et affichées telles quelles dans l'application (page « Hypothèses »). */
(function (racine) {
  'use strict';
  var JOUR = 86400000;
  var AVERTISSEMENT = 'Quantités indicatives pour préparer votre budget ; la structure (fer, dosage, fondations) doit être validée par un professionnel.';

  // ---------- Hypothèses (dosages standard, affichés dans l'application) ----------
  var DOSAGES = {
    beton: { nom: 'Béton armé (fondations, poteaux, chaînages, dalle)', ciment: 350, sable: 0.4, gravier: 0.8, eau: 175 },
    proprete: { nom: 'Béton de propreté (5 cm sous les semelles)', ciment: 150, sable: 0.4, gravier: 0.8, eau: 150 },
    hourdage: { nom: 'Mortier de pose des parpaings', ciment: 300, sable: 1, gravier: 0, eau: 200 },
    enduit: { nom: 'Mortier d\'enduit', ciment: 350, sable: 1, gravier: 0, eau: 200 },
    chape: { nom: 'Mortier de pose du carrelage (3 cm)', ciment: 300, sable: 1, gravier: 0, eau: 200 }
  };
  var H = {
    sac: 50,                 // kg par sac de ciment
    barre: 12,               // m par barre de fer
    recouvrement: 50,        // × diamètre, à chaque jonction de barres filantes
    attente: 0.5,            // m ajoutés à chaque barre de poteau (attentes et recouvrement)
    enrobage: 2.5,           // cm de chaque côté (poteaux, chaînages) : longueur des cadres
    crochets: 0.10,          // m de crochets par cadre
    enrobageSemelle: 0.05,   // m de chaque côté dans les semelles
    retour: 0.10,            // m de retour à chaque bout des barres de semelle
    proprete: 0.05,          // m d'épaisseur du béton de propreté
    parpaingsM2: 12.5,       // parpaings de 40 × 20 cm par m² de mur
    mortierM2: { 15: 0.015, 20: 0.020 }, // m³ de mortier par m² de mur
    porte: 0.9 * 2.1,        // m² d'une porte (0,90 × 2,10 m)
    fenetre: 1.2 * 1.0,      // m² d'une fenêtre (1,20 × 1,00 m)
    chape: 0.03,             // m de mortier sous le carrelage posé au ciment
    colleM2: 5,              // kg de colle par m² de carrelage
    sacColle: 25,            // kg par sac de colle
    barrique: 200            // litres d'eau par barrique
  };
  var DIAMETRES = [6, 8, 10, 12, 14];
  var POIDS_FER = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208 }; // kg par mètre
  var FORMATS = [['20x20', '20 × 20 cm'], ['30x30', '30 × 30 cm'], ['40x40', '40 × 40 cm'], ['45x45', '45 × 45 cm'], ['50x50', '50 × 50 cm'], ['60x60', '60 × 60 cm'], ['25x40', '25 × 40 cm (faïence)'], ['30x60', '30 × 60 cm']];

  // Prix d'exemple (F CFA) : à remplacer par ceux de votre quincaillerie
  var PRIX_DEFAUT = { ciment: 4200, sable: 10000, gravier: 22000, eau: 500, fer6: 1500, fer8: 2600, fer10: 4000, fer12: 5800, fer14: 7900, parpaing15: 400, parpaing20: 500, colle: 5000 };
  var MATERIAUX = {
    ciment: { nom: 'Ciment', unite: 'sac', unites: 'sacs', pu: 'le sac de 50 kg' },
    sable: { nom: 'Sable', unite: 'm³', pu: 'le m³' },
    gravier: { nom: 'Gravier', unite: 'm³', pu: 'le m³' },
    eau: { nom: 'Eau', unite: 'barrique', unites: 'barriques', pu: 'la barrique de 200 L' },
    parpaing15: { nom: 'Parpaings de 15', unite: 'parpaing', unites: 'parpaings', pu: 'le parpaing' },
    parpaing20: { nom: 'Parpaings de 20', unite: 'parpaing', unites: 'parpaings', pu: 'le parpaing' },
    colle: { nom: 'Colle à carrelage', unite: 'sac', unites: 'sacs', pu: 'le sac de 25 kg' }
  };
  DIAMETRES.forEach(function (d) { MATERIAUX['fer' + d] = { nom: 'Fer de ' + d + ' mm', unite: 'barre', unites: 'barres', pu: 'la barre de 12 m' }; });
  var ORDRE_MATERIAUX = ['ciment', 'sable', 'gravier', 'eau', 'fer6', 'fer8', 'fer10', 'fer12', 'fer14', 'parpaing15', 'parpaing20', 'colle'];

  var ETAPES = [
    { cle: 'fondations', nom: 'Fondations' },
    { cle: 'elevation', nom: 'Élévation des murs' },
    { cle: 'dalle', nom: 'Dalle' },
    { cle: 'enduits', nom: 'Enduits' },
    { cle: 'carrelage', nom: 'Carrelage' },
    { cle: 'peinture', nom: 'Peinture' }
  ];
  function nomEtape(cle) { for (var i = 0; i < ETAPES.length; i++) if (ETAPES[i].cle === cle) return ETAPES[i].nom; return cle; }

  // ---------- Nombres ----------
  function lireNombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function pos(v) { return Math.max(0, lireNombre(v)); }
  function entier(v) { return Math.max(0, Math.round(lireNombre(v))); }
  // Arrondi au-dessus, sans être trompé par les petites erreurs de calcul en virgule flottante
  function net6(x) { return Math.round(x * 1e6) / 1e6; }
  function plafond(x) { return Math.ceil(net6(x)); }
  function plafond1(x) { return plafond(x * 10) / 10; }
  function formatNombre(n, sep) {
    if (sep === undefined) sep = ' ';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function formatDecimal(n, dec, sep) {
    var x = Math.round(Number(n || 0) * Math.pow(10, dec)) / Math.pow(10, dec), e = Math.trunc(x), r = Math.abs(x - e);
    var s = formatNombre(e, sep);
    if (x < 0 && e === 0) s = '-' + s;
    if (r > 1e-9) s += ',' + String(Math.round(r * Math.pow(10, dec))).padStart(dec, '0').replace(/0+$/, '');
    return s;
  }
  function f(n, sep) { return formatNombre(n, sep) + (sep === ' ' ? ' ' : ' ') + 'F'; }

  // Barre filante de longueur L (m) : un recouvrement de 50 × diamètre à chaque jonction de barres de 12 m
  function filant(L, d) {
    L = pos(L);
    if (L <= H.barre) return L;
    return net6(L + (Math.ceil(net6(L / H.barre)) - 1) * H.recouvrement * d / 1000);
  }
  // Nombre de barres réparties sur une longueur (cm) avec un espacement (cm) : une barre à chaque bout
  function reparties(longueurCm, espacementCm) {
    var e = pos(espacementCm);
    if (!(e > 0)) return 0;
    return Math.floor(net6(Math.round(pos(longueurCm) * 100) / 100 / e)) + 1;
  }
  function cadre(aCm, bCm) { return net6(2 * (Math.max(0, pos(aCm) - 2 * H.enrobage) + Math.max(0, pos(bCm) - 2 * H.enrobage)) / 100 + H.crochets); }

  function vide() { return { ciment: 0, sable: 0, gravier: 0, eau: 0, fer: {}, parpaing15: 0, parpaing20: 0, colle: 0, carreaux: [], peinture: [], infos: {} }; }
  function ajouterBeton(q, v, dosage) {
    var D = DOSAGES[dosage];
    q.ciment += v * D.ciment; q.sable += v * D.sable; q.gravier += v * D.gravier; q.eau += v * D.eau;
  }
  function ajouterFer(q, d, m) { if (m > 0) q.fer[d] = net6((q.fer[d] || 0) + m); }

  // ---------- Éléments : champs (pour le formulaire) et calcul ----------
  // Champs : cle, nom, unite, defaut, type ('nombre' par défaut, 'entier', 'choix', 'ouinon', 'diametre', 'format', 'montant'), si : { cle: valeur }
  var TYPES = {
    fondation: {
      nom: 'Fondations', court: 'Semelles', etape: 'fondations', aide: 'Semelles isolées sous les poteaux, ou semelle filante sous les murs.',
      champs: [
        { cle: 'forme', nom: 'Type de semelle', type: 'choix', defaut: 'isolees', options: [['isolees', 'Semelles isolées'], ['filante', 'Semelle filante']] },
        { cle: 'nombre', nom: 'Nombre de semelles', type: 'entier', defaut: 8, si: { forme: 'isolees' } },
        { cle: 'longueurCm', nom: 'Longueur d\'une semelle', unite: 'cm', defaut: 80, si: { forme: 'isolees' } },
        { cle: 'largeurCm', nom: 'Largeur d\'une semelle', unite: 'cm', defaut: 80, si: { forme: 'isolees' } },
        { cle: 'epaisseurCm', nom: 'Épaisseur', unite: 'cm', defaut: 30, si: { forme: 'isolees' } },
        { cle: 'longueurM', nom: 'Longueur totale de la semelle', unite: 'm', defaut: 40, si: { forme: 'filante' } },
        { cle: 'largeurFCm', nom: 'Largeur', unite: 'cm', defaut: 50, si: { forme: 'filante' } },
        { cle: 'epaisseurFCm', nom: 'Épaisseur', unite: 'cm', defaut: 25, si: { forme: 'filante' } },
        { cle: 'proprete', nom: 'Béton de propreté de 5 cm dessous', type: 'ouinon', defaut: true },
        { cle: 'diametre', nom: 'Fer (nappe)', type: 'diametre', defaut: 10, si: { forme: 'isolees' } },
        { cle: 'espacementCm', nom: 'Espacement des barres', unite: 'cm', defaut: 15, si: { forme: 'isolees' } },
        { cle: 'barres', nom: 'Nombre de barres filantes', type: 'entier', defaut: 4, si: { forme: 'filante' } },
        { cle: 'diametreF', nom: 'Fer des barres filantes', type: 'diametre', defaut: 10, si: { forme: 'filante' } },
        { cle: 'diametreCadre', nom: 'Fer des épingles', type: 'diametre', defaut: 6, si: { forme: 'filante' } },
        { cle: 'espacementCadreCm', nom: 'Espacement des épingles', unite: 'cm', defaut: 20, si: { forme: 'filante' } }
      ],
      calcul: function (d) {
        var q = vide(), v, vp, d1;
        if (d.forme === 'filante') {
          var L = pos(d.longueurM), B = pos(d.largeurFCm) / 100;
          v = L * B * pos(d.epaisseurFCm) / 100;
          vp = d.proprete ? L * B * H.proprete : 0;
          d1 = entier(d.diametreF) || 10;
          ajouterFer(q, d1, entier(d.barres) * filant(L, d1));
          ajouterFer(q, entier(d.diametreCadre) || 6, reparties(L * 100, d.espacementCadreCm) * (B - 2 * H.enrobageSemelle + 2 * H.retour));
        } else {
          var n = entier(d.nombre), A = pos(d.longueurCm) / 100, Bi = pos(d.largeurCm) / 100;
          v = n * A * Bi * pos(d.epaisseurCm) / 100;
          vp = d.proprete ? n * A * Bi * H.proprete : 0;
          d1 = entier(d.diametre) || 10;
          // nappe : barres dans les deux sens, longueur = côté − 2 × 5 cm d'enrobage + 2 × 10 cm de retour
          var parSemelle = reparties(d.largeurCm, d.espacementCm) * (A - 2 * H.enrobageSemelle + 2 * H.retour) +
            reparties(d.longueurCm, d.espacementCm) * (Bi - 2 * H.enrobageSemelle + 2 * H.retour);
          ajouterFer(q, d1, n * parSemelle);
        }
        v = net6(v); vp = net6(vp);
        ajouterBeton(q, v, 'beton');
        if (vp) ajouterBeton(q, vp, 'proprete');
        q.infos = { beton: v, proprete: vp };
        return q;
      }
    },
    poteaux: {
      nom: 'Poteaux', court: 'Poteaux', etape: 'elevation', aide: 'Les poteaux en béton armé, aux angles et le long des murs.',
      champs: [
        { cle: 'nombre', nom: 'Nombre de poteaux', type: 'entier', defaut: 10 },
        { cle: 'aCm', nom: 'Section : largeur', unite: 'cm', defaut: 20 },
        { cle: 'bCm', nom: 'Section : profondeur', unite: 'cm', defaut: 20 },
        { cle: 'hauteurM', nom: 'Hauteur d\'un poteau', unite: 'm', defaut: 3 },
        { cle: 'barres', nom: 'Barres par poteau', type: 'entier', defaut: 4 },
        { cle: 'diametre', nom: 'Fer des barres', type: 'diametre', defaut: 12 },
        { cle: 'diametreCadre', nom: 'Fer des cadres', type: 'diametre', defaut: 6 },
        { cle: 'espacementCadreCm', nom: 'Espacement des cadres', unite: 'cm', defaut: 15 }
      ],
      calcul: function (d) {
        var q = vide(), n = entier(d.nombre), h = pos(d.hauteurM);
        var v = net6(n * pos(d.aCm) / 100 * pos(d.bCm) / 100 * h);
        ajouterBeton(q, v, 'beton');
        ajouterFer(q, entier(d.diametre) || 12, n * entier(d.barres) * (h > 0 ? h + H.attente : 0));
        ajouterFer(q, entier(d.diametreCadre) || 6, n * reparties(h * 100, d.espacementCadreCm) * cadre(d.aCm, d.bCm));
        q.infos = { beton: v };
        return q;
      }
    },
    chainage: {
      nom: 'Chaînages et poutres', court: 'Chaînage', etape: 'elevation', aide: 'Chaînage bas (longrine), chaînage haut, poutres et linteaux : longueur totale.',
      champs: [
        { cle: 'niveau', nom: 'Position', type: 'choix', defaut: 'haut', options: [['bas', 'Chaînage bas'], ['haut', 'Chaînage haut'], ['poutre', 'Poutre / linteau']] },
        { cle: 'longueurM', nom: 'Longueur totale', unite: 'm', defaut: 40 },
        { cle: 'aCm', nom: 'Section : largeur', unite: 'cm', defaut: 15 },
        { cle: 'bCm', nom: 'Section : hauteur', unite: 'cm', defaut: 20 },
        { cle: 'barres', nom: 'Nombre de barres', type: 'entier', defaut: 4 },
        { cle: 'diametre', nom: 'Fer des barres', type: 'diametre', defaut: 10 },
        { cle: 'diametreCadre', nom: 'Fer des cadres', type: 'diametre', defaut: 6 },
        { cle: 'espacementCadreCm', nom: 'Espacement des cadres', unite: 'cm', defaut: 20 }
      ],
      calcul: function (d) {
        var q = vide(), L = pos(d.longueurM), d1 = entier(d.diametre) || 10;
        var v = net6(L * pos(d.aCm) / 100 * pos(d.bCm) / 100);
        ajouterBeton(q, v, 'beton');
        ajouterFer(q, d1, entier(d.barres) * filant(L, d1));
        ajouterFer(q, entier(d.diametreCadre) || 6, reparties(L * 100, d.espacementCadreCm) * cadre(d.aCm, d.bCm));
        q.infos = { beton: v };
        return q;
      }
    },
    dalle: {
      nom: 'Dalle', court: 'Dalle', etape: 'dalle', aide: 'Dalle pleine en béton armé, une nappe de fer dans les deux sens.',
      champs: [
        { cle: 'longueurM', nom: 'Longueur', unite: 'm', defaut: 10 },
        { cle: 'largeurM', nom: 'Largeur', unite: 'm', defaut: 8 },
        { cle: 'epaisseurCm', nom: 'Épaisseur', unite: 'cm', defaut: 15 },
        { cle: 'diametre', nom: 'Fer de la nappe', type: 'diametre', defaut: 10 },
        { cle: 'espacementCm', nom: 'Espacement des barres', unite: 'cm', defaut: 15 }
      ],
      calcul: function (d) {
        var q = vide(), L = pos(d.longueurM), l = pos(d.largeurM), d1 = entier(d.diametre) || 10;
        var v = net6(L * l * pos(d.epaisseurCm) / 100);
        ajouterBeton(q, v, 'beton');
        // barres dans le sens de la longueur, réparties sur la largeur, et inversement
        ajouterFer(q, d1, reparties(l * 100, d.espacementCm) * filant(L, d1) + reparties(L * 100, d.espacementCm) * filant(l, d1));
        q.infos = { beton: v, surface: net6(L * l) };
        return q;
      }
    },
    mur: {
      nom: 'Murs en parpaings', court: 'Murs', etape: 'elevation', aide: 'Parpaings creux de 15 ou de 20 (40 × 20 cm), ouvertures déduites.',
      champs: [
        { cle: 'epaisseur', nom: 'Parpaings', type: 'choix', defaut: '15', options: [['15', 'Parpaings de 15'], ['20', 'Parpaings de 20']] },
        { cle: 'longueurM', nom: 'Longueur totale des murs', unite: 'm', defaut: 40 },
        { cle: 'hauteurM', nom: 'Hauteur des murs', unite: 'm', defaut: 3 },
        { cle: 'portes', nom: 'Portes (0,90 × 2,10 m)', type: 'entier', defaut: 3 },
        { cle: 'fenetres', nom: 'Fenêtres (1,20 × 1,00 m)', type: 'entier', defaut: 6 },
        { cle: 'autresM2', nom: 'Autres ouvertures', unite: 'm²', defaut: 0 }
      ],
      calcul: function (d) {
        var q = vide(), ep = String(d.epaisseur) === '20' ? 20 : 15;
        var S = net6(Math.max(0, pos(d.longueurM) * pos(d.hauteurM) - entier(d.portes) * H.porte - entier(d.fenetres) * H.fenetre - pos(d.autresM2)));
        q['parpaing' + ep] = S * H.parpaingsM2;
        var v = net6(S * H.mortierM2[ep]);
        ajouterBeton(q, v, 'hourdage');
        q.infos = { surface: S, mortier: v };
        return q;
      }
    },
    enduit: {
      nom: 'Enduit', court: 'Enduit', etape: 'enduits', aide: 'Crépissage des murs (intérieur ou extérieur) ou d\'un plafond.',
      champs: [
        { cle: 'longueurM', nom: 'Longueur des murs', unite: 'm', defaut: 40 },
        { cle: 'hauteurM', nom: 'Hauteur (ou largeur du plafond)', unite: 'm', defaut: 3 },
        { cle: 'faces', nom: 'Faces à enduire', type: 'choix', defaut: '2', options: [['1', '1 face'], ['2', '2 faces']] },
        { cle: 'ouverturesM2', nom: 'Ouvertures à déduire (par face)', unite: 'm²', defaut: 12.87 },
        { cle: 'epaisseurCm', nom: 'Épaisseur de l\'enduit', unite: 'cm', defaut: 1.5 }
      ],
      calcul: function (d) {
        var q = vide(), faces = String(d.faces) === '1' ? 1 : 2;
        var S = net6(Math.max(0, pos(d.longueurM) * pos(d.hauteurM) - pos(d.ouverturesM2)) * faces);
        var v = net6(S * pos(d.epaisseurCm) / 100);
        ajouterBeton(q, v, 'enduit');
        q.infos = { surface: S, mortier: v };
        return q;
      }
    },
    carrelage: {
      nom: 'Carrelage', court: 'Carrelage', etape: 'carrelage', aide: 'Sol ou mur carrelé : carreaux, et ciment ou colle pour la pose.',
      champs: [
        { cle: 'longueurM', nom: 'Longueur de la pièce', unite: 'm', defaut: 5 },
        { cle: 'largeurM', nom: 'Largeur de la pièce', unite: 'm', defaut: 4 },
        { cle: 'format', nom: 'Format des carreaux', type: 'format', defaut: '40x40' },
        { cle: 'pose', nom: 'Pose', type: 'choix', defaut: 'colle', options: [['colle', 'À la colle'], ['mortier', 'Au mortier de ciment']] },
        { cle: 'prixM2', nom: 'Prix des carreaux', unite: 'F / m²', type: 'montant', defaut: 6000 }
      ],
      calcul: function (d) {
        var q = vide(), S = net6(pos(d.longueurM) * pos(d.largeurM));
        var fm = String(d.format || '40x40').split('x'), aire = net6(pos(fm[0]) * pos(fm[1]) / 10000) || 0.16;
        q.carreaux.push({ m2: S, aire: aire, format: d.format || '40x40', prixM2: entier(d.prixM2) });
        if (d.pose === 'mortier') { var v = net6(S * H.chape); ajouterBeton(q, v, 'chape'); q.infos.mortier = v; }
        else q.colle = S * H.colleM2;
        q.infos.surface = S;
        return q;
      }
    },
    peinture: {
      nom: 'Peinture', court: 'Peinture', etape: 'peinture', aide: 'Peinture des murs ou plafonds, en pots.',
      champs: [
        { cle: 'longueurM', nom: 'Longueur des murs', unite: 'm', defaut: 40 },
        { cle: 'hauteurM', nom: 'Hauteur (ou largeur du plafond)', unite: 'm', defaut: 3 },
        { cle: 'faces', nom: 'Faces à peindre', type: 'choix', defaut: '2', options: [['1', '1 face'], ['2', '2 faces']] },
        { cle: 'ouverturesM2', nom: 'Ouvertures à déduire (par face)', unite: 'm²', defaut: 12.87 },
        { cle: 'couches', nom: 'Nombre de couches', type: 'entier', defaut: 2 },
        { cle: 'rendement', nom: 'Rendement (écrit sur le pot)', unite: 'm² / L', defaut: 10 },
        { cle: 'potL', nom: 'Contenance d\'un pot', unite: 'L', defaut: 20 },
        { cle: 'prixPot', nom: 'Prix d\'un pot', unite: 'F', type: 'montant', defaut: 25000 }
      ],
      calcul: function (d) {
        var q = vide(), faces = String(d.faces) === '1' ? 1 : 2;
        var S = net6(Math.max(0, pos(d.longueurM) * pos(d.hauteurM) - pos(d.ouverturesM2)) * faces);
        var r = pos(d.rendement);
        q.peinture.push({ litres: r > 0 ? net6(S * entier(d.couches) / r) : 0, potL: pos(d.potL) || 20, prixPot: entier(d.prixPot) });
        q.infos = { surface: S };
        return q;
      }
    }
  };
  var ORDRE_TYPES = ['fondation', 'poteaux', 'chainage', 'dalle', 'mur', 'enduit', 'carrelage', 'peinture'];

  function dimsDefaut(type) {
    var d = {};
    TYPES[type].champs.forEach(function (c) { d[c.cle] = c.defaut; });
    return d;
  }
  function champVisible(c, d) {
    if (!c.si) return true;
    return Object.keys(c.si).every(function (k) { return String(d[k]) === String(c.si[k]); });
  }
  function etapeDefaut(type, d) {
    if (type === 'chainage' && d && d.niveau === 'bas') return 'fondations';
    return TYPES[type].etape;
  }
  // Quantités brutes d'un élément (sans marge)
  function calculer(el) { return TYPES[el.type] ? TYPES[el.type].calcul(Object.assign(dimsDefaut(el.type), el.dims || {})) : vide(); }

  function additionner(liste) {
    var t = vide();
    liste.forEach(function (q) {
      ['ciment', 'sable', 'gravier', 'eau', 'parpaing15', 'parpaing20', 'colle'].forEach(function (k) { t[k] = net6(t[k] + (q[k] || 0)); });
      Object.keys(q.fer || {}).forEach(function (d) { ajouterFer(t, d, q.fer[d]); });
      t.carreaux = t.carreaux.concat(q.carreaux || []);
      t.peinture = t.peinture.concat(q.peinture || []);
    });
    return t;
  }

  // Quantités à acheter (marge de pertes comprise, arrondies au-dessus) et montants
  // → { lignes: [{ cle, nom, quantite, unite, pu, montant, info }], total }
  function arrondir(q, marge, prix) {
    var k = 1 + Math.max(0, lireNombre(marge)) / 100, P = Object.assign({}, PRIX_DEFAUT, prix || {}), lignes = [];
    function ligne(cle, quantite, info, nom, unite, pu) {
      if (!(quantite > 0)) return;
      var M = MATERIAUX[cle] || {};
      var p = pu != null ? pu : entier(P[cle]);
      lignes.push({ cle: cle, nom: nom || M.nom, quantite: quantite, unite: unite || (quantite > 1 && M.unites ? M.unites : M.unite), pu: p, montant: Math.round(net6(quantite * p)), info: info || '' });
    }
    var kg = net6(q.ciment * k);
    ligne('ciment', plafond(kg / H.sac), formatDecimal(kg, 0) + ' kg');
    ligne('sable', plafond1(q.sable * k));
    ligne('gravier', plafond1(q.gravier * k));
    var litres = plafond(q.eau * k);
    ligne('eau', plafond(litres / H.barrique), formatNombre(litres) + ' L');
    DIAMETRES.forEach(function (d) {
      var m = q.fer[d] || 0;
      if (!(m > 0)) return;
      var b = plafond(m * k / H.barre);
      ligne('fer' + d, b, formatDecimal(m * k, 1) + ' m · ≈ ' + formatNombre(b * H.barre * POIDS_FER[d]) + ' kg');
    });
    ligne('parpaing15', plafond(q.parpaing15 * k));
    ligne('parpaing20', plafond(q.parpaing20 * k));
    ligne('colle', plafond(q.colle * k / H.sacColle), formatDecimal(q.colle * k, 1) + ' kg');
    q.carreaux.forEach(function (c) {
      var m2 = plafond1(c.m2 * k);
      ligne('carreaux', m2, '≈ ' + formatNombre(plafond(c.m2 * k / c.aire)) + ' carreaux', 'Carreaux ' + String(c.format).replace('x', ' × ') + ' cm', 'm²', c.prixM2);
    });
    q.peinture.forEach(function (p) {
      var l = net6(p.litres * k);
      ligne('peinture', plafond(l / p.potL), formatDecimal(l, 1) + ' L', 'Peinture (pots de ' + formatDecimal(p.potL, 1) + ' L)', plafond(l / p.potL) > 1 ? 'pots' : 'pot', p.prixPot);
    });
    var total = 0;
    lignes.forEach(function (l) { total += l.montant; });
    return { lignes: lignes, total: total };
  }
  // Coût d'un élément seul (quantités arrondies pour lui seul)
  function coutElement(el, projet) { return arrondir(calculer(el), projet.marge, projet.prix); }

  // Budget par étape : quantités additionnées pour toute l'étape, puis arrondies (on achète par étape)
  function budget(projet, elements) {
    var out = [], total = 0;
    ETAPES.forEach(function (e) {
      var els = (elements || []).filter(function (x) { return (x.etape || etapeDefaut(x.type, x.dims)) === e.cle; });
      var r = arrondir(additionner(els.map(calculer)), projet.marge, projet.prix);
      total += r.total;
      out.push({ cle: e.cle, nom: e.nom, elements: els, lignes: r.lignes, total: r.total });
    });
    return { etapes: out, total: total };
  }
  // Liste d'achat de tout le projet : somme des quantités achetées étape par étape
  function listeAchat(b) {
    var parCle = {}, ordre = [];
    b.etapes.forEach(function (e) {
      e.lignes.forEach(function (l) {
        var cle = l.cle === 'carreaux' || l.cle === 'peinture' ? l.cle + '|' + l.nom + '|' + l.pu : l.cle;
        if (!parCle[cle]) { parCle[cle] = { cle: l.cle, nom: l.nom, quantite: 0, unite: l.unite, pu: l.pu, montant: 0 }; ordre.push(cle); }
        parCle[cle].quantite = net6(parCle[cle].quantite + l.quantite);
        parCle[cle].montant += l.montant;
        if (parCle[cle].quantite > 1 && MATERIAUX[l.cle] && MATERIAUX[l.cle].unites) parCle[cle].unite = MATERIAUX[l.cle].unites;
      });
    });
    return ordre.map(function (k) { return parCle[k]; }).sort(function (a, b) {
      var ia = ORDRE_MATERIAUX.indexOf(a.cle), ib = ORDRE_MATERIAUX.indexOf(b.cle);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }

  // ---------- Épargne et dépenses ----------
  function ajouterMois(cle, n) {
    var p = String(cle).split('-'), t = (+p[0]) * 12 + (+p[1] - 1) + n;
    var a = Math.floor(t / 12), m = t % 12 + 1;
    return a + '-' + (m < 10 ? '0' : '') + m;
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function moisFr(cle) { var p = String(cle).split('-'); return MOIS[+p[1] - 1] + ' ' + p[0]; }
  function depensesParEtape(depenses) {
    var t = {};
    (depenses || []).forEach(function (d) { t[d.etape] = (t[d.etape] || 0) + entier(d.montant); });
    return t;
  }
  // Plan : on finance les étapes dans l'ordre. Reste d'une étape = budget − déjà dépensé (0 si elle est terminée).
  // Une étape devient finançable quand l'argent mis de côté + n mois d'épargne couvre le reste cumulé.
  function plan(b, depenses, terminees, dejaEpargne, mensuel, moisCourant) {
    var dep = depensesParEtape(depenses), cumul = 0, deja = entier(dejaEpargne), m = entier(mensuel), out = [];
    b.etapes.forEach(function (e) {
      var depense = dep[e.cle] || 0, fini = !!(terminees && terminees[e.cle]);
      if (!e.total && !depense && !fini) return;
      var reste = fini ? 0 : Math.max(0, e.total - depense);
      cumul += reste;
      var n = cumul <= deja ? 0 : m > 0 ? Math.ceil((cumul - deja) / m) : null;
      out.push({ cle: e.cle, nom: e.nom, budget: e.total, depense: depense, ecart: depense - e.total, terminee: fini, reste: reste, cumul: cumul,
        mois: n, quand: n === null ? null : ajouterMois(moisCourant, n) });
    });
    return out;
  }

  // ---------- Textes ----------
  function resumeDims(el) {
    var d = Object.assign(dimsDefaut(el.type), el.dims || {}), n = function (x, dec) { return formatDecimal(x, dec == null ? 2 : dec); };
    switch (el.type) {
      case 'fondation': return d.forme === 'filante' ? 'Semelle filante ' + n(d.longueurM) + ' m × ' + n(d.largeurFCm) + ' × ' + n(d.epaisseurFCm) + ' cm, ' + d.barres + ' HA' + d.diametreF :
        d.nombre + ' semelles ' + n(d.longueurCm) + ' × ' + n(d.largeurCm) + ' × ' + n(d.epaisseurCm) + ' cm, HA' + d.diametre + ' tous les ' + n(d.espacementCm) + ' cm';
      case 'poteaux': return d.nombre + ' poteaux ' + n(d.aCm) + ' × ' + n(d.bCm) + ' cm, ' + n(d.hauteurM) + ' m, ' + d.barres + ' HA' + d.diametre + ', cadres HA' + d.diametreCadre + ' / ' + n(d.espacementCadreCm) + ' cm';
      case 'chainage': return n(d.longueurM) + ' m, ' + n(d.aCm) + ' × ' + n(d.bCm) + ' cm, ' + d.barres + ' HA' + d.diametre + ', cadres HA' + d.diametreCadre + ' / ' + n(d.espacementCadreCm) + ' cm';
      case 'dalle': return n(d.longueurM) + ' × ' + n(d.largeurM) + ' m, ' + n(d.epaisseurCm) + ' cm, HA' + d.diametre + ' tous les ' + n(d.espacementCm) + ' cm';
      case 'mur': return 'Parpaings de ' + d.epaisseur + ', ' + n(d.longueurM) + ' × ' + n(d.hauteurM) + ' m, ' + d.portes + ' porte(s), ' + d.fenetres + ' fenêtre(s)';
      case 'enduit': return n(d.longueurM) + ' × ' + n(d.hauteurM) + ' m, ' + d.faces + ' face(s), ' + n(d.epaisseurCm) + ' cm';
      case 'carrelage': return n(d.longueurM) + ' × ' + n(d.largeurM) + ' m, ' + String(d.format).replace('x', ' × ') + ' cm, pose ' + (d.pose === 'mortier' ? 'au mortier' : 'à la colle');
      case 'peinture': return n(d.longueurM) + ' × ' + n(d.hauteurM) + ' m, ' + d.faces + ' face(s), ' + d.couches + ' couche(s)';
    }
    return '';
  }
  function quantiteTexte(l) {
    var q = l.cle === 'sable' || l.cle === 'gravier' || l.cle === 'carreaux' ? formatDecimal(l.quantite, 1) : formatNombre(l.quantite);
    return q + ' ' + l.unite;
  }
  // Résumé à envoyer sur WhatsApp (l'utilisateur l'envoie lui-même)
  function messageDevis(projet, b) {
    var s = 'Devis matériaux : ' + (projet.nom || 'Mon chantier') + (projet.lieu ? ' (' + projet.lieu + ')' : '') + '\n';
    b.etapes.forEach(function (e, i) {
      if (!e.total) return;
      s += '\n' + (i + 1) + '. ' + e.nom + ' : ' + f(e.total, ' ') + '\n';
      e.lignes.forEach(function (l) { s += '- ' + l.nom + ' : ' + quantiteTexte(l).replace(/[  ]/g, ' ') + '\n'; });
    });
    s += '\nTotal : ' + f(b.total, ' ') + ' (marge de pertes ' + formatDecimal(projet.marge, 1) + ' % comprise)\n\n' + AVERTISSEMENT + '\n(Calcul Chantier)';
    return s.replace(/[  ]/g, ' ');
  }

  // ---------- Texte pour le PDF (polices standard : Windows-1252) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n').replace(/≈/g, 'env.').replace(/³/g, '3').replace(/²/g, '2').replace(/→/g, '->').replace(/[−–]/g, '-');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function dateISO(d) { d = d || new Date(); var m = d.getMonth() + 1, j = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j; }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }

  // ---------- Pass (version gratuite : 1 projet et 3 éléments) ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var PASS = { slug: 'pass-calcul-chantier-12-mois', jours: 365, prix: 2000, nom: 'Pass Calcul Chantier 12 mois' };
  var LIMITE_PROJETS = 1, LIMITE_ELEMENTS = 3, RAPPEL_JOURS = 15;
  function lireLienCommande(texte) {
    var s = String(texte || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&]t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { id: o[1].toUpperCase(), jeton: t[1] };
    var m = s.match(/TCV-[0-9A-HJKMNP-TV-Z]{8}(?![0-9A-Z])/i);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    return j ? { id: m[0].toUpperCase(), jeton: j[1] } : null;
  }
  function urlVerification(c) { return API + '/commandes/' + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  function urlProduit() { return '../../boutique/' + PASS.slug + '.html'; }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug;
    if (slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var pass = { id: String(c.id || ''), slug: slug, payeeLe: new Date(debut).toISOString() };
    var fin = debut + (PASS.jours + 1) * JOUR;
    var now = maintenant == null ? Date.now() : +maintenant;
    if (now > fin) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || p.slug !== PASS.slug || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    if (!liste.length) return null;
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PASS.jours * JOUR; });
    return fin + JOUR;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { actif: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR) : 0;
    return { actif: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass, maintenant) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, payeeLe: pass.payeeLe, verifieLe: new Date(maintenant == null ? Date.now() : +maintenant).toISOString() });
    return l;
  }
  function peutAjouterProjet(nb, actif) { return !!actif || nb < LIMITE_PROJETS; }
  function peutAjouterElement(nb, actif) { return !!actif || nb < LIMITE_ELEMENTS; }

  function validerSauvegarde(o) {
    if (!o || typeof o !== 'object' || o.application !== 'calcul-chantier') return 'Ce fichier n\'est pas une sauvegarde de Calcul Chantier.';
    if (!Array.isArray(o.projets) || !Array.isArray(o.elements) || !Array.isArray(o.depenses)) return 'Sauvegarde incomplète ou abîmée.';
    var ok = o.projets.every(function (p) { return p && typeof p.id === 'string'; }) &&
      o.elements.every(function (e) { return e && typeof e.id === 'string' && TYPES[e.type]; }) &&
      o.depenses.every(function (d) { return d && typeof d.id === 'string'; });
    return ok ? null : 'Sauvegarde abîmée : certaines fiches sont illisibles.';
  }

  var CC = {
    JOUR: JOUR, AVERTISSEMENT: AVERTISSEMENT, DOSAGES: DOSAGES, H: H, DIAMETRES: DIAMETRES, POIDS_FER: POIDS_FER, FORMATS: FORMATS,
    PRIX_DEFAUT: PRIX_DEFAUT, MATERIAUX: MATERIAUX, ORDRE_MATERIAUX: ORDRE_MATERIAUX, ETAPES: ETAPES, nomEtape: nomEtape,
    lireNombre: lireNombre, entier: entier, plafond: plafond, plafond1: plafond1, formatNombre: formatNombre, formatDecimal: formatDecimal, f: f,
    filant: filant, reparties: reparties, cadre: cadre,
    TYPES: TYPES, ORDRE_TYPES: ORDRE_TYPES, dimsDefaut: dimsDefaut, champVisible: champVisible, etapeDefaut: etapeDefaut, calculer: calculer,
    additionner: additionner, arrondir: arrondir, coutElement: coutElement, budget: budget, listeAchat: listeAchat,
    ajouterMois: ajouterMois, moisFr: moisFr, depensesParEtape: depensesParEtape, plan: plan,
    resumeDims: resumeDims, quantiteTexte: quantiteTexte, messageDevis: messageDevis,
    textePDF: textePDF, sansAccents: sansAccents, nouvelId: nouvelId, dateISO: dateISO, dateFr: dateFr,
    API: API, PASS: PASS, LIMITE_PROJETS: LIMITE_PROJETS, LIMITE_ELEMENTS: LIMITE_ELEMENTS, RAPPEL_JOURS: RAPPEL_JOURS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, urlProduit: urlProduit, analyserReponse: analyserReponse,
    finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, peutAjouterProjet: peutAjouterProjet, peutAjouterElement: peutAjouterElement,
    validerSauvegarde: validerSauvegarde
  };
  if (typeof module === 'object' && module.exports) module.exports = CC;
  else racine.CC = CC;
})(typeof self !== 'undefined' ? self : this);
