/* Carnet Élevage — pass (gratuit / complet) : lecture du lien de commande, vérification unique, durée, rappel.
   Fonctionne dans le navigateur (window.TL) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var BOUTIQUE = '../../boutique/';
  var PRODUITS = {
    'pass-carnet-elevage-12-mois': { jours: 365, nom: 'Pass 12 mois', prix: 3000 }
  };
  var SLUG_DEFAUT = 'pass-carnet-elevage-12-mois';
  var NOM_APP = 'Carnet Élevage';
  var GRACE_JOURS = 1;     // la commande reste acceptée 1 jour après la fin théorique
  var RAPPEL_JOURS = 14;   // rappel 14 jours avant la fin

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
  function urlProduit(slug) { return BOUTIQUE + (PRODUITS[slug] ? slug : SLUG_DEFAUT) + '.html'; }
  function dureeMs(slug) { return (PRODUITS[slug].jours + GRACE_JOURS) * JOUR_MS; }

  // Analyse la réponse de GET /commandes/<id>?t=<jeton>
  // → { ok: true, pass, fin } ou { ok: false, raison: 'introuvable' | 'produit' | 'impayee' | 'expiree', ... }
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
    var fin = debut + dureeMs(slug);
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
      fin = Math.max(fin == null ? d : fin, d) + dureeMs(p.slug);
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

  function ajouterPass(passes, pass) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }

  var TL = {
    API: API, PRODUITS: PRODUITS, SLUG_DEFAUT: SLUG_DEFAUT, NOM_APP: NOM_APP, RAPPEL_JOURS: RAPPEL_JOURS, GRACE_JOURS: GRACE_JOURS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, urlProduit: urlProduit,
    analyserReponse: analyserReponse, finDroits: finDroits, etatLicence: etatLicence, ajouterPass: ajouterPass
  };
  if (typeof module === 'object' && module.exports) module.exports = TL;
  else racine.TL = TL;
})(typeof self !== 'undefined' ? self : this);
