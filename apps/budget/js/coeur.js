/* Budget Famille (TERANGA) — logique pure, sans interface : dates, montants, enveloppes, budgets spéciaux,
   comparaison des mois, CSV, textes WhatsApp, pass. Navigateur (window.BF) et Node (require) pour les tests.
   Tous les montants sont des entiers en F CFA. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;

  // ---------- Nombres et montants ----------
  function formatNombre(n, sep) {
    if (sep === undefined) sep = ' ';
    n = Math.round(Number(n) || 0);
    var signe = n < 0 ? '-' : '', s = String(Math.abs(n)), out = '';
    while (s.length > 3) { out = sep + s.slice(-3) + out; s = s.slice(0, -3); }
    return signe + s + out;
  }
  function f(n, sep) { return formatNombre(n, sep) + (sep === undefined ? ' ' : sep) + 'F'; }
  var MAX_MONTANT = 999999999999;
  // « 12 500 », « 12500 F » → 12500 ; tout ce qui n'est pas un chiffre est ignoré ; jamais négatif
  function lireMontant(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.min(MAX_MONTANT, Math.max(0, Math.round(v))) : 0;
    var s = String(v == null ? '' : v).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
    return s ? Math.min(MAX_MONTANT, parseInt(s, 10)) : 0;
  }
  function entierPositif(v, min) {
    var n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10);
    if (!isFinite(n)) n = 0;
    return Math.max(min || 0, n);
  }
  function somme(liste, cle) { var t = 0; (liste || []).forEach(function (x) { t += Math.round(Number(cle ? x[cle] : x) || 0); }); return t; }
  function arrondiSup(n, pas) { pas = pas || 100; return n <= 0 ? 0 : Math.ceil(n / pas) * pas; }

  // ---------- Dates (chaînes AAAA-MM-JJ, heure locale) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function versDate(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function dateValide(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    var d = versDate(iso); return dateISO(d) === iso;
  }
  function moisDe(iso) { return String(iso).slice(0, 7); }
  function moisCourant(d) { return moisDe(dateISO(d)); }
  function decalerMois(m, n) { var p = String(m).split('-'), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function joursDansMois(m) { var p = String(m).split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
  function joursEntre(a, b) { return Math.round((versDate(b) - versDate(a)) / JOUR_MS); }
  function ajouterJours(iso, n) { var d = versDate(iso); d.setDate(d.getDate() + n); return dateISO(d); }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function moisFr(m) { var p = String(m).split('-'); return MOIS[+p[1] - 1] + ' ' + p[0]; }
  function moisFrCourt(m) { var p = String(m).split('-'); return MOIS_COURTS[+p[1] - 1] + ' ' + p[0].slice(2); }
  function dateFr(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  function dateLongue(iso) { var d = versDate(iso); return JOURS[d.getDay()] + ' ' + d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); }
  function dateCourte(iso) { var d = versDate(iso); return d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MOIS_COURTS[d.getMonth()]; }

  // ---------- Enveloppes ----------
  // type : courant (dépenses au fil du mois), fixe (une facture : bouton « Payé »), epargne
  var CATEGORIES = [
    { cle: 'quotidien', nom: 'Dépense quotidienne', court: 'Dépense', icone: 'panier', type: 'courant', aide: 'Marché, pain, popote du jour' },
    { cle: 'loyer', nom: 'Loyer', court: 'Loyer', icone: 'maison', type: 'fixe' },
    { cle: 'senelec', nom: 'Électricité Senelec', court: 'Senelec', icone: 'eclair', type: 'fixe', aide: 'Facture d\'électricité' },
    { cle: 'woyofal', nom: 'Woyofal', court: 'Woyofal', icone: 'compteur', type: 'courant', aide: 'Recharges du compteur prépayé' },
    { cle: 'eau', nom: 'Eau', court: 'Eau', icone: 'goutte', type: 'fixe', aide: 'Facture d\'eau' },
    { cle: 'gaz', nom: 'Gaz', court: 'Gaz', icone: 'flamme', type: 'courant' },
    { cle: 'transport', nom: 'Transport', court: 'Transport', icone: 'bus', type: 'courant', aide: 'Car rapide, taxi, bus, carburant' },
    { cle: 'ecole', nom: 'École', court: 'École', icone: 'livre', type: 'fixe', aide: 'Mensualités, cantine, cours' },
    { cle: 'sante', nom: 'Santé', court: 'Santé', icone: 'sante', type: 'courant', aide: 'Pharmacie, consultations' },
    { cle: 'famille', nom: 'Famille et solidarité', court: 'Famille', icone: 'mains', type: 'courant', aide: 'Parents, cérémonies, entraide' },
    { cle: 'tontine', nom: 'Tontine', court: 'Tontine', icone: 'tontine', type: 'fixe', aide: 'Votre cotisation du mois' },
    { cle: 'credit', nom: 'Crédit téléphone et Internet', court: 'Crédit', icone: 'telephone', type: 'courant' },
    { cle: 'epargne', nom: 'Épargne', court: 'Épargne', icone: 'tirelire', type: 'epargne', aide: 'Argent mis de côté' },
    { cle: 'divers', nom: 'Divers', court: 'Divers', icone: 'divers', type: 'courant' }
  ];
  var CAT = {};
  CATEGORIES.forEach(function (c) { CAT[c.cle] = c; });
  // Icônes proposées pour une enveloppe personnelle
  var ICONES_PERSO = ['etoile', 'panier', 'habits', 'coiffure', 'cadeau', 'bus', 'sante', 'livre', 'mains', 'outil', 'telephone', 'divers'];

  function nouvelleEnveloppe(cle, prevu) {
    var c = CAT[cle];
    return { id: cle, nom: c.nom, icone: c.icone, type: c.type, prevu: lireMontant(prevu) };
  }
  function enveloppePerso(nom, icone, prevu, id) {
    return { id: id || 'perso-' + nouvelId().slice(0, 8), nom: String(nom || '').trim().slice(0, 40) || 'Enveloppe', icone: ICONES_PERSO.indexOf(icone) >= 0 ? icone : 'etoile', type: 'courant', prevu: lireMontant(prevu), perso: true };
  }
  function typeEnveloppe(e) { return e.type || (CAT[e.id] ? CAT[e.id].type : 'courant'); }
  function nomCourt(e) { return CAT[e.id] ? CAT[e.id].court : e.nom; }

  // Nouveau mois : mêmes revenus et enveloppes que le dernier mois connu (montants prévus repris, dépenses à zéro)
  function copierPlan(plan, mois) {
    return {
      mois: mois,
      revenus: (plan.revenus || []).map(function (r) { return { id: r.id, nom: r.nom, montant: lireMontant(r.montant) }; }),
      enveloppes: (plan.enveloppes || []).map(function (e) {
        var c = { id: e.id, nom: e.nom, icone: e.icone, type: typeEnveloppe(e), prevu: lireMontant(e.prevu) };
        if (e.perso) c.perso = true;
        if (e.parJour) { c.parJour = lireMontant(e.parJour); c.prevu = c.parJour * joursDansMois(mois); }
        return c;
      }),
      copieDe: plan.mois, cree: new Date().toISOString()
    };
  }
  // Le plan le plus récent avant « mois » (pour créer automatiquement le mois suivant)
  function planReference(plans, mois) {
    var r = null;
    (plans || []).forEach(function (p) { if (p.mois < mois && (!r || p.mois > r.mois)) r = p; });
    return r;
  }

  // ---------- État d'une enveloppe et synthèse du mois ----------
  function etatEnveloppe(prevu, depense, seuil) {
    prevu = Math.round(prevu || 0); depense = Math.round(depense || 0); seuil = seuil || 80;
    var niveau;
    if (prevu <= 0) niveau = depense > 0 ? 'hors' : 'vide';
    else if (depense > prevu) niveau = 'depasse';
    else if (depense === prevu) niveau = 'epuise';
    else if (depense * 100 >= seuil * prevu) niveau = 'alerte';
    else niveau = 'ok';
    return { prevu: prevu, depense: depense, reste: prevu - depense, pct: prevu > 0 ? Math.floor(depense * 100 / prevu) : (depense > 0 ? 100 : 0), niveau: niveau };
  }
  function versementsDuMois(projets, mois) {
    var l = [];
    (projets || []).forEach(function (p) {
      (p.versements || []).forEach(function (v) { if (moisDe(v.date) === mois) l.push({ id: v.id, date: v.date, montant: lireMontant(v.montant), projet: p.id, nom: p.nom }); });
    });
    return l.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  // aujourdhui : AAAA-MM-JJ ; sert aux jours restants et au rythme des dépenses
  function syntheseMois(plan, depenses, projets, mois, aujourdhui, seuil) {
    plan = plan || { revenus: [], enveloppes: [] };
    aujourdhui = aujourdhui || dateISO();
    var dm = (depenses || []).filter(function (d) { return d.mois === mois; });
    var vers = versementsDuMois(projets, mois);
    var totalVers = somme(vers, 'montant');
    var parEnv = {};
    dm.forEach(function (d) { parEnv[d.env] = (parEnv[d.env] || 0) + lireMontant(d.montant); });
    var nbJours = joursDansMois(mois), mc = moisDe(aujourdhui);
    var jourActuel = mc === mois ? +aujourdhui.slice(8, 10) : (mois < mc ? nbJours : 0);
    var joursRestants = mc === mois ? nbJours - jourActuel + 1 : (mois > mc ? nbJours : 0);
    var vus = {};
    var envs = (plan.enveloppes || []).map(function (e) {
      vus[e.id] = 1;
      var dep = (parEnv[e.id] || 0) + (e.id === 'epargne' ? totalVers : 0);
      var et = etatEnveloppe(e.prevu, dep, seuil);
      et.id = e.id; et.nom = e.nom; et.icone = e.icone; et.type = typeEnveloppe(e); et.court = nomCourt(e);
      if (e.parJour) et.parJour = e.parJour;
      niveauSelonType(et);
      // Rythme : pour les dépenses courantes du mois en cours, à partir du 3e jour
      if (et.type === 'courant' && mc === mois && jourActuel >= 3 && dep > 0 && et.prevu > 0 && dep < et.prevu) {
        var jourVide = Math.floor(et.prevu * jourActuel / dep); // jour où l'enveloppe serait vide au rythme actuel
        if (jourVide < nbJours) et.videVers = mois + '-' + pad(Math.max(jourActuel, jourVide));
      }
      if (joursRestants > 0 && et.reste > 0 && (et.type === 'courant')) et.parJourRestant = Math.floor(et.reste / joursRestants);
      return et;
    });
    // Dépenses dans une enveloppe retirée du plan, ou épargne sans enveloppe prévue : lignes « hors budget »
    Object.keys(parEnv).forEach(function (id) {
      if (vus[id]) return;
      var c = CAT[id];
      var et = etatEnveloppe(0, parEnv[id], seuil);
      et.id = id; et.nom = c ? c.nom : 'Enveloppe retirée'; et.icone = c ? c.icone : 'divers'; et.type = c ? c.type : 'courant'; et.court = c ? c.court : et.nom; et.horsPlan = true;
      niveauSelonType(et);
      envs.push(et); vus[id] = 1;
    });
    if (totalVers > 0 && !vus.epargne) {
      var ep = etatEnveloppe(0, totalVers, seuil);
      ep.id = 'epargne'; ep.nom = CAT.epargne.nom; ep.icone = 'tirelire'; ep.type = 'epargne'; ep.court = 'Épargne'; ep.horsPlan = true;
      niveauSelonType(ep);
      envs.push(ep);
    }
    var revenus = somme(plan.revenus, 'montant');
    var prevu = somme(plan.enveloppes, 'prevu');
    var depense = somme(dm, 'montant') + totalVers;
    var epargne = (parEnv.epargne || 0) + totalVers;
    var resteEnveloppes = 0, resteFixes = 0;
    envs.forEach(function (e) { if (e.reste > 0) { resteEnveloppes += e.reste; if (e.type !== 'courant') resteFixes += e.reste; } });
    var alertes = envs.filter(function (e) { return e.niveau === 'alerte' || e.niveau === 'epuise' || e.niveau === 'depasse' || e.niveau === 'hors'; });
    alertes.sort(function (a, b) { return rangNiveau(b.niveau) - rangNiveau(a.niveau) || b.pct - a.pct; });
    return {
      mois: mois, revenus: revenus, prevu: prevu, depense: depense, epargne: epargne, solde: revenus - depense,
      aRepartir: revenus - prevu, resteEnveloppes: resteEnveloppes, enveloppes: envs, alertes: alertes,
      nbJours: nbJours, jourActuel: jourActuel, joursRestants: joursRestants, nbDepenses: dm.length + vers.length,
      // Par jour : ce qui reste une fois les factures et l'épargne prévues mises à part
      parJour: joursRestants > 0 ? Math.floor(Math.max(0, revenus - depense - resteFixes) / joursRestants) : 0,
      pct: prevu > 0 ? Math.floor(depense * 100 / prevu) : 0
    };
  }
  // Épargne : mettre de côté n'est jamais un dépassement. Facture payée exactement : pas d'alerte « vide ».
  function niveauSelonType(et) {
    if (et.type === 'epargne') { if (et.niveau !== 'vide') et.niveau = 'ok'; }
    else if (et.type === 'fixe' && et.niveau === 'epuise') { et.niveau = 'ok'; et.paye = true; }
    return et;
  }
  function rangNiveau(n) { return { depasse: 4, hors: 3, epuise: 2, alerte: 1 }[n] || 0; }

  // Comparaison de deux mois (a = mois étudié, b = mois de référence)
  function comparerMois(a, b) {
    var ids = [], idx = {};
    function ajouter(e) { if (!idx[e.id]) { idx[e.id] = { id: e.id, nom: e.nom, icone: e.icone, a: 0, b: 0 }; ids.push(e.id); } return idx[e.id]; }
    a.enveloppes.forEach(function (e) { ajouter(e).a = e.depense; });
    b.enveloppes.forEach(function (e) { ajouter(e).b = e.depense; });
    var lignes = ids.map(function (id) {
      var l = idx[id]; l.diff = l.a - l.b; l.pct = l.b > 0 ? Math.round(l.diff * 100 / l.b) : null; return l;
    }).filter(function (l) { return l.a > 0 || l.b > 0; });
    lignes.sort(function (x, y) { return Math.abs(y.diff) - Math.abs(x.diff); });
    return { lignes: lignes, a: a.depense, b: b.depense, diff: a.depense - b.depense, pct: b.depense > 0 ? Math.round((a.depense - b.depense) * 100 / b.depense) : null,
      revenusA: a.revenus, revenusB: b.revenus, epargneA: a.epargne, epargneB: b.epargne };
  }

  // Les plus grosses dépenses du mois
  function plusGrosses(depenses, mois, n) {
    return (depenses || []).filter(function (d) { return d.mois === mois; }).slice().sort(function (a, b) { return b.montant - a.montant || (a.date < b.date ? -1 : 1); }).slice(0, n || 5);
  }

  // ---------- Budgets spéciaux ----------
  function L(nom, prix, qte) { return [nom, prix || 0, qte || 1]; }
  var MODELES = {
    rentree: { nom: 'Rentrée scolaire', court: 'Rentrée', icone: 'cartable', parEnfant: true, aide: 'Une liste par enfant : inscription, fournitures, tenues, transport.',
      lignesEnfant: [L('Inscription et scolarité'), L('Fournitures : cahiers'), L('Fournitures : stylos, crayons, règle, ardoise'), L('Livres'), L('Tenue scolaire'), L('Chaussures'), L('Sac'), L('Transport du premier mois')] },
    tabaski: { nom: 'Tabaski', court: 'Tabaski', icone: 'mouton', aide: 'Mouton, habits, condiments, voyage…',
      lignes: [L('Mouton'), L('Habits de la famille'), L('Chaussures'), L('Condiments et épices'), L('Oignons et pommes de terre'), L('Charbon'), L('Coiffure et tresses'), L('Transport (voyage)'), L('Cadeaux (ndéwënal)')] },
    ramadan: { nom: 'Ramadan et Korité', court: 'Ramadan', icone: 'lune', aide: 'Ndogou, provisions, habits de Korité…',
      lignes: [L('Ndogou : dattes, lait, sucre, café'), L('Provisions : riz, huile, sucre'), L('Habits de Korité'), L('Chaussures'), L('Coiffure'), L('Cadeaux (ndéwënal)'), L('Dons')] },
    magal: { nom: 'Voyage Magal ou Gamou', court: 'Magal / Gamou', icone: 'route', aide: 'Transport, hébergement, nourriture du voyage…',
      lignes: [L('Transport aller-retour'), L('Hébergement'), L('Nourriture du voyage'), L('Participation (berndé)'), L('Habits'), L('Divers')] },
    bapteme: { nom: 'Baptême', court: 'Baptême', icone: 'bebe', aide: 'Mouton, habits de bébé, repas, chaises…',
      lignes: [L('Mouton'), L('Habits de bébé et de maman'), L('Repas : riz, huile, condiments'), L('Boissons'), L('Chaises et bâche'), L('Coiffure'), L('Cadeaux')] },
    mariage: { nom: 'Mariage', court: 'Mariage', icone: 'anneaux', aide: 'Dot, habits, repas, salle, photos…',
      lignes: [L('Dot'), L('Habits'), L('Repas'), L('Salle, chaises et bâche'), L('Transport'), L('Coiffure et maquillage'), L('Photos'), L('Cadeaux')] },
    autre: { nom: 'Autre projet', court: 'Projet', icone: 'etoile', aide: 'Un achat important, un voyage, des travaux…', lignes: [] }
  };
  var ORDRE_MODELES = ['rentree', 'tabaski', 'ramadan', 'magal', 'bapteme', 'mariage', 'autre'];

  function ligneProjet(nom, prix, qte, groupe) {
    return { id: nouvelId(), nom: String(nom || '').trim().slice(0, 80), prix: lireMontant(prix), qte: Math.max(1, entierPositif(qte, 1)), groupe: groupe || '', achete: false };
  }
  function nouveauProjet(type, nom, date, aujourdhui) {
    var m = MODELES[type] || MODELES.autre;
    var p = { id: nouvelId(), type: MODELES[type] ? type : 'autre', nom: String(nom || '').trim().slice(0, 60) || m.nom, date: date || '', cree: aujourdhui || dateISO(),
      enfants: [], lignes: [], versements: [], objectifManuel: 0, statut: 'actif' };
    (m.lignes || []).forEach(function (l) { p.lignes.push(ligneProjet(l[0], l[1], l[2])); });
    return p;
  }
  function ajouterEnfant(p, nom) {
    var e = { id: 'enf-' + nouvelId().slice(0, 8), nom: String(nom || '').trim().slice(0, 40) || ('Enfant ' + ((p.enfants || []).length + 1)) };
    p.enfants = (p.enfants || []).concat([e]);
    (MODELES.rentree.lignesEnfant).forEach(function (l) { p.lignes.push(ligneProjet(l[0], l[1], l[2], e.id)); });
    return e;
  }
  function montantLigne(l) { return lireMontant(l.prix) * Math.max(1, entierPositif(l.qte, 1)); }
  function totauxProjet(p) {
    var objectifLignes = 0, achete = 0, nbAchetes = 0, groupes = {};
    (p.lignes || []).forEach(function (l) {
      var m = montantLigne(l);
      objectifLignes += m;
      if (l.achete) { achete += m; nbAchetes++; }
      var g = groupes[l.groupe || ''] || (groupes[l.groupe || ''] = { total: 0, achete: 0, nb: 0, nbAchetes: 0 });
      g.total += m; g.nb++; if (l.achete) { g.achete += m; g.nbAchetes++; }
    });
    var objectif = objectifLignes > 0 ? objectifLignes : lireMontant(p.objectifManuel);
    var epargne = somme(p.versements, 'montant');
    return {
      objectif: objectif, objectifLignes: objectifLignes, achete: achete, resteAAcheter: Math.max(0, objectifLignes - achete),
      nbLignes: (p.lignes || []).length, nbAchetes: nbAchetes, epargne: epargne, resteAEpargner: Math.max(0, objectif - epargne),
      pct: objectif > 0 ? Math.min(100, Math.floor(epargne * 100 / objectif)) : 0, groupes: groupes
    };
  }
  // Plan d'épargne jusqu'à la date du projet (montants arrondis à la centaine supérieure)
  function planEpargne(p, aujourdhui) {
    aujourdhui = aujourdhui || dateISO();
    var t = totauxProjet(p);
    if (!dateValide(p.date)) return { sansDate: true, reste: t.resteAEpargner };
    var jours = joursEntre(aujourdhui, p.date);
    var r = { jours: jours, reste: t.resteAEpargner, passe: jours < 0, aujourdhui: jours === 0 };
    if (jours <= 0) return r;
    r.semaines = Math.ceil(jours / 7);
    r.mois = Math.max(1, Math.ceil(jours / 30));
    r.parJour = arrondiSup(t.resteAEpargner / jours);
    r.parSemaine = arrondiSup(t.resteAEpargner / r.semaines);
    r.parMois = arrondiSup(t.resteAEpargner / r.mois);
    // Avance ou retard par rapport à un rythme régulier depuis la création du projet
    var duree = dateValide(p.cree) ? joursEntre(p.cree, p.date) : 0;
    if (duree > 0 && t.objectif > 0) {
      var ecoule = Math.min(duree, Math.max(0, joursEntre(p.cree, aujourdhui)));
      r.attendu = Math.round(t.objectif * ecoule / duree);
      r.ecart = t.epargne - r.attendu;
    }
    return r;
  }
  function compteARebours(jours) {
    if (jours == null) return '';
    if (jours < 0) return 'Passé';
    if (jours === 0) return 'Aujourd\'hui';
    if (jours === 1) return 'Demain';
    if (jours < 14) return 'Dans ' + jours + ' jours';
    if (jours < 61) return 'Dans ' + Math.floor(jours / 7) + ' semaines';
    return 'Dans ' + Math.floor(jours / 30) + ' mois';
  }

  // ---------- Version gratuite ----------
  var PROJETS_GRATUITS = 1;
  function projetsActifs(projets) {
    return (projets || []).filter(function (p) { return p.statut !== 'termine'; }).sort(function (a, b) {
      return (a.cree || '') < (b.cree || '') ? -1 : (a.cree || '') > (b.cree || '') ? 1 : (a.ordre || 0) - (b.ordre || 0) || (a.creeMs || 0) - (b.creeMs || 0);
    });
  }
  function peutCreerProjet(projets, premium) { return !!premium || projetsActifs(projets).length < PROJETS_GRATUITS; }
  // Sans pass : le plus ancien budget spécial en cours reste modifiable ; les autres restent consultables
  function projetModifiable(p, projets, premium) {
    if (premium || !p) return true;
    var a = projetsActifs(projets);
    for (var i = 0; i < PROJETS_GRATUITS && i < a.length; i++) if (a[i].id === p.id) return true;
    return false;
  }
  function moisAccessible(mois, courant, premium) { return !!premium || mois === courant; }

  // ---------- CSV (séparateur ; pour Excel en français) ----------
  function csvCellule(v) {
    if (typeof v === 'number') return String(v);
    var s = String(v == null ? '' : v).replace(/\r\n?/g, '\n');
    if (/^[=+\-@\t]/.test(s)) s = '\'' + s; // pas de formule exécutée à l'ouverture
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvLigne(cellules) { return cellules.map(csvCellule).join(';'); }
  function nomEnveloppe(id, plans) {
    for (var i = 0; plans && i < plans.length; i++) {
      var e = (plans[i].enveloppes || []).filter(function (x) { return x.id === id; })[0];
      if (e) return e.nom;
    }
    return CAT[id] ? CAT[id].nom : id;
  }
  // depenses : liste ; plans : pour retrouver le nom des enveloppes ; projets : versements d'épargne inclus
  function csvDepenses(depenses, plans, projets, mois) {
    var lignes = [csvLigne(['Date', 'Mois', 'Enveloppe', 'Montant (F CFA)', 'Note'])];
    var l = (depenses || []).filter(function (d) { return !mois || d.mois === mois; }).map(function (d) {
      return { date: d.date, mois: d.mois, env: nomEnveloppe(d.env, plans), montant: lireMontant(d.montant), note: d.note || '' };
    });
    (projets || []).forEach(function (p) {
      (p.versements || []).forEach(function (v) {
        if (!mois || moisDe(v.date) === mois) l.push({ date: v.date, mois: moisDe(v.date), env: 'Épargne', montant: lireMontant(v.montant), note: 'Mis de côté : ' + p.nom });
      });
    });
    l.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    l.forEach(function (x) { lignes.push(csvLigne([x.date, x.mois, x.env, x.montant, x.note])); });
    return lignes.join('\r\n') + '\r\n';
  }
  function csvSynthese(s) {
    var lignes = [csvLigne(['Enveloppe', 'Prévu (F CFA)', 'Dépensé (F CFA)', 'Reste (F CFA)', '% utilisé'])];
    s.enveloppes.forEach(function (e) { lignes.push(csvLigne([e.nom, e.prevu, e.depense, e.reste, e.prevu > 0 ? e.pct : ''])); });
    lignes.push(csvLigne(['TOTAL', s.prevu, s.depense, s.prevu - s.depense, s.prevu > 0 ? s.pct : '']));
    lignes.push(csvLigne(['Revenus du mois', s.revenus, '', '', '']));
    lignes.push(csvLigne(['Solde (revenus - dépenses)', s.solde, '', '', '']));
    return lignes.join('\r\n') + '\r\n';
  }

  // ---------- Textes WhatsApp (l'utilisateur envoie lui-même) ----------
  function lienWhatsApp(texte) { return 'https://wa.me/?text=' + encodeURIComponent(texte); }
  function texteResume(s, foyer) {
    var sp = ' ';
    var t = 'Budget de ' + moisFr(s.mois) + (foyer ? ' (' + foyer + ')' : '') + '\n' +
      'Revenus : ' + f(s.revenus, sp) + '\n' + 'Dépensé : ' + f(s.depense, sp) + '\n' + 'Reste : ' + f(s.solde, sp) + '\n';
    if (s.epargne > 0) t += 'Mis de côté : ' + f(s.epargne, sp) + '\n';
    if (s.alertes.length) {
      t += '\nÀ surveiller :\n';
      s.alertes.slice(0, 6).forEach(function (e) {
        t += '- ' + e.nom + ' : ' + (e.niveau === 'depasse' ? 'dépassé de ' + f(-e.reste, sp) : e.niveau === 'hors' ? f(e.depense, sp) + ' hors budget' : 'reste ' + f(e.reste, sp) + ' sur ' + f(e.prevu, sp)) + '\n';
      });
    }
    return t + '\n(Budget Famille, TERANGA)';
  }
  function texteListeProjet(p, aujourdhui) {
    var sp = ' ', t = totauxProjet(p), pe = planEpargne(p, aujourdhui);
    var s = p.nom + (dateValide(p.date) ? ' : le ' + dateFr(p.date) + (pe.jours > 0 ? ' (J-' + pe.jours + ')' : '') : '') + '\n';
    var groupes = [{ id: '', nom: '' }].concat((p.enfants || []).map(function (e) { return { id: e.id, nom: e.nom }; }));
    groupes.forEach(function (g) {
      var lignes = (p.lignes || []).filter(function (l) { return (l.groupe || '') === g.id; });
      if (!lignes.length) return;
      if (g.nom) s += '\n' + g.nom + ' :\n';
      else s += '\n';
      lignes.forEach(function (l) {
        var m = montantLigne(l);
        s += (l.achete ? '✔ ' : '• ') + l.nom + (l.qte > 1 ? ' x' + l.qte : '') + (m > 0 ? ' : ' + f(m, sp) : '') + '\n';
      });
    });
    s += '\nTotal : ' + f(t.objectif, sp) + '\nDéjà mis de côté : ' + f(t.epargne, sp) + '\nReste à trouver : ' + f(t.resteAEpargner, sp) + '\n';
    return s + '\n(Budget Famille, TERANGA)';
  }

  // ---------- Pass (lien de la page de commande de la boutique) ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique/commandes/';
  var PASS = { slug: 'pass-budget-famille-12-mois', jours: 365, prix: 1500, nom: 'Pass Budget Famille 12 mois' };
  var GRACE_JOURS = 1, RAPPEL_JOURS = 15;
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
  function urlVerification(c) { return API + encodeURIComponent(c.id) + '?t=' + encodeURIComponent(c.jeton); }
  // Réponse de GET /commandes/<id>?t=<jeton> → { ok, pass, fin } ou { ok: false, raison: introuvable | produit | impayee | expiree }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    if (!c.produit || c.produit.slug !== PASS.slug) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var fin = debut + PASS.jours * JOUR_MS;
    var now = maintenant == null ? Date.now() : +maintenant;
    var pass = { id: String(c.id || ''), slug: PASS.slug, jours: PASS.jours, payeeLe: new Date(debut).toISOString() };
    if (now >= fin + GRACE_JOURS * JOUR_MS) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  // Fin des droits : un renouvellement anticipé s'ajoute à la fin du pass en cours
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || p.slug !== PASS.slug || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PASS.jours * JOUR_MS; });
    return fin;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant;
    var fin = finDroits(passes);
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var limite = fin + GRACE_JOURS * JOUR_MS, reste = fin - now;
    var jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { premium: now < limite, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: now < limite && jr <= RAPPEL_JOURS, expire: now >= limite };
  }
  function ajouterPass(passes, pass, maintenant) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date(maintenant == null ? Date.now() : +maintenant).toISOString() });
    return l;
  }

  // ---------- Texte pour le PDF (polices standard : Windows-1252) ----------
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function textePDF(s) {
    s = String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/ /g, ' ').replace(/\r\n?/g, '\n');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.indexOf(ch) >= 0) { out += ch; continue; }
      if (ch === 'ë' || ch === 'ñ') { out += ch; continue; }
      if (ch === 'ŋ') { out += 'n'; continue; }
      if (ch === 'Ŋ') { out += 'N'; continue; }
      if (ch === '−') { out += '-'; continue; }
      if (ch === '✔') { out += 'x'; continue; }
      var base = ch.normalize ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : ch;
      out += /^[\x20-\x7e]$/.test(base) ? base : (c >= 0xD800 && c <= 0xDBFF ? (i++, '') : '');
    }
    return out;
  }

  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) { /* ancien navigateur */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  var BF = {
    JOUR_MS: JOUR_MS, formatNombre: formatNombre, f: f, lireMontant: lireMontant, entierPositif: entierPositif, somme: somme, arrondiSup: arrondiSup,
    pad: pad, dateISO: dateISO, versDate: versDate, dateValide: dateValide, moisDe: moisDe, moisCourant: moisCourant, decalerMois: decalerMois,
    joursDansMois: joursDansMois, joursEntre: joursEntre, ajouterJours: ajouterJours, MOIS: MOIS, moisFr: moisFr, moisFrCourt: moisFrCourt,
    dateFr: dateFr, dateLongue: dateLongue, dateCourte: dateCourte,
    CATEGORIES: CATEGORIES, CAT: CAT, ICONES_PERSO: ICONES_PERSO, nouvelleEnveloppe: nouvelleEnveloppe, enveloppePerso: enveloppePerso,
    typeEnveloppe: typeEnveloppe, nomCourt: nomCourt, copierPlan: copierPlan, planReference: planReference,
    etatEnveloppe: etatEnveloppe, versementsDuMois: versementsDuMois, syntheseMois: syntheseMois, comparerMois: comparerMois, plusGrosses: plusGrosses,
    MODELES: MODELES, ORDRE_MODELES: ORDRE_MODELES, ligneProjet: ligneProjet, nouveauProjet: nouveauProjet, ajouterEnfant: ajouterEnfant,
    montantLigne: montantLigne, totauxProjet: totauxProjet, planEpargne: planEpargne, compteARebours: compteARebours,
    PROJETS_GRATUITS: PROJETS_GRATUITS, projetsActifs: projetsActifs, peutCreerProjet: peutCreerProjet, projetModifiable: projetModifiable, moisAccessible: moisAccessible,
    csvCellule: csvCellule, csvDepenses: csvDepenses, csvSynthese: csvSynthese, nomEnveloppe: nomEnveloppe,
    lienWhatsApp: lienWhatsApp, texteResume: texteResume, texteListeProjet: texteListeProjet,
    API: API, PASS: PASS, GRACE_JOURS: GRACE_JOURS, RAPPEL_JOURS: RAPPEL_JOURS, lireLienCommande: lireLienCommande, urlVerification: urlVerification,
    analyserReponse: analyserReponse, finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass,
    textePDF: textePDF, nouvelId: nouvelId
  };
  if (typeof module === 'object' && module.exports) module.exports = BF;
  else racine.BF = BF;
})(typeof self !== 'undefined' ? self : this);
