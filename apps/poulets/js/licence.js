/* PouletPilot — pass (gratuit / complet) : lecture du lien de commande, vérification, durée, limites.
   Fonctionne dans le navigateur (window.PPL) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var BOUTIQUE = '../../boutique/';
  var PRODUITS = {
    'pass-pouletpilot-1-mois': { jours: 30, nom: 'Pass 1 mois', prix: 2000 },
    'pass-pouletpilot-12-mois': { jours: 365, nom: 'Pass 12 mois', prix: 15000 }
  };
  var RAPPEL_JOURS = 5;
  var LOTS_GRATUITS = 1;

  // Accepte le lien complet de la page de commande (…/commande.html?o=TCV-XXXXXXXX&t=<jeton>)
  // ou « TCV-XXXXXXXX » suivi du jeton.
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
  function urlProduit(slug) { return BOUTIQUE + (PRODUITS[slug] ? slug : 'pass-pouletpilot-1-mois') + '.html'; }

  // Analyse la réponse de GET /commandes/<id>?t=<jeton>
  // → { ok: true, pass } ou { ok: false, raison: 'introuvable' | 'produit' | 'impayee' | 'expiree', ... }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug;
    var p = PRODUITS[slug];
    if (!p) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var pass = { id: String(c.id || ''), slug: slug, jours: p.jours, payeeLe: new Date(debut).toISOString() };
    var fin = debut + p.jours * JOUR_MS;
    var now = maintenant == null ? Date.now() : +maintenant;
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }

  // Fin des droits : chaque pass ajoute sa durée ; un renouvellement anticipé ne fait pas perdre de jours.
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || !PRODUITS[p.slug] || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) {
      var d = Date.parse(p.payeeLe);
      fin = Math.max(fin == null ? d : fin, d) + PRODUITS[p.slug].jours * JOUR_MS;
    });
    return fin;
  }

  function etatLicence(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant;
    var fin = finDroits(passes);
    var dernier = null;
    (passes || []).forEach(function (p) { if (PRODUITS[p.slug] && (!dernier || Date.parse(p.payeeLe) >= Date.parse(dernier.payeeLe))) dernier = p; });
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false, slug: null };
    var reste = fin - now;
    var jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return {
      premium: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr,
      rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0, slug: dernier ? dernier.slug : null
    };
  }

  // Ajoute un pass vérifié à la liste (sans doublon)
  function ajouterPass(passes, pass) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }

  // ---------- Limites de la version gratuite ----------
  function lotsEnCours(lots) {
    return (lots || []).filter(function (l) { return l.statut !== 'termine'; }).sort(function (a, b) {
      return a.dateDebut < b.dateDebut ? -1 : a.dateDebut > b.dateDebut ? 1 : (a.cree || 0) - (b.cree || 0);
    });
  }
  function peutCreerLot(lots, premium) { return !!premium || lotsEnCours(lots).length < LOTS_GRATUITS; }
  // Sans pass : seul le plus ancien lot en cours reste modifiable ; les lots terminés et les autres sont consultables.
  function lotModifiable(lot, lots, premium) {
    if (premium || !lot) return true;
    if (lot.statut === 'termine') return true;
    var ec = lotsEnCours(lots);
    for (var i = 0; i < LOTS_GRATUITS && i < ec.length; i++) if (ec[i].id === lot.id) return true;
    return false;
  }

  var PPL = {
    API: API, PRODUITS: PRODUITS, RAPPEL_JOURS: RAPPEL_JOURS, LOTS_GRATUITS: LOTS_GRATUITS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, urlProduit: urlProduit,
    analyserReponse: analyserReponse, finDroits: finDroits, etatLicence: etatLicence, ajouterPass: ajouterPass,
    lotsEnCours: lotsEnCours, peutCreerLot: peutCreerLot, lotModifiable: lotModifiable
  };
  if (typeof module === 'object' && module.exports) module.exports = PPL;
  else racine.PPL = PPL;
})(typeof self !== 'undefined' ? self : this);
