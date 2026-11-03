/* Lecture Facile — logique pure (sans interface) : découpage du texte, syllabes du français, lettres qui se
   ressemblent, phrases pour la lecture à voix haute, nettoyage de l'OCR, pass. Navigateur (window.LF) et Node. */
(function (racine) {
  'use strict';
  var JOUR_MS = 86400000;

  // ---------- Syllabes du français (syllabes écrites, comme à l'école : « ta-ble », « pa-pi-llon ») ----------
  var VOYELLES = 'aàâäeéèêëiîïoôöuùûüyœæ';
  var TREMA = 'ëïü';
  function estVoyelle(c) { return !!c && VOYELLES.indexOf(c) >= 0; }
  // Groupes de consonnes qu'on ne sépare pas : consonne + l ou r (« ta-ble », « ar-bre », « é-cri-re »)
  var AVANT_L = ['b', 'c', 'f', 'g', 'k', 'p', 'ch', 'ph'];
  var AVANT_R = ['b', 'c', 'd', 'f', 'g', 'k', 'p', 't', 'v', 'ch', 'ph', 'th'];
  function inseparables(a, b) {
    if (b === 'l') return AVANT_L.indexOf(a) >= 0;
    if (b === 'r') return AVANT_R.indexOf(a) >= 0;
    return false;
  }

  // Découpe un mot (minuscules, lettres seules) en unités : voyelles (simples ou groupées) et consonnes (ch, ph, gn…)
  function unites(m) {
    var u = [], i = 0, n = m.length;
    while (i < n) {
      var c = m.charAt(i), suiv = m.charAt(i + 1), apres = m.charAt(i + 2), prec = m.charAt(i - 1);
      if (!estVoyelle(c) || (c === 'y' && ((i === 0 && estVoyelle(suiv)) || (estVoyelle(prec) && estVoyelle(suiv))))) {
        // consonnes
        var s = c;
        if (c === 'q' && suiv === 'u') s = 'qu';
        else if (c === 'g' && suiv === 'u' && estVoyelle(apres) && TREMA.indexOf(apres) < 0) s = 'gu';
        else if (c === 'g' && suiv === 'e' && 'aoâôu'.indexOf(apres) >= 0 && apres) s = 'ge';   // pi-geon, man-geons
        else if ((c === 'c' || c === 'p' || c === 't' || c === 'r') && suiv === 'h') s = c + 'h';
        else if (c === 'g' && suiv === 'n') s = 'gn';
        else if (c === 'l' && suiv === 'l' && prec === 'i') s = 'll';                         // fi-lle, pa-pi-llon
        u.push({ s: s, v: false });
        i += s.length;
        continue;
      }
      // voyelles
      var t3 = m.substr(i, 3), t2 = m.substr(i, 2), v = c;
      if (TREMA.indexOf(c) >= 0) v = c;
      else if (t3 === 'eau' || t3 === 'oeu') v = t3;
      else if ((t3 === 'uei' || t3 === 'oei') && m.charAt(i + 3) === 'l') v = t3;            // ac-cueil, oeil
      else if (t2 === 'œi' && apres === 'l') v = t2;
      else if (['ai', 'aî', 'ei', 'au', 'eu', 'eû', 'ou', 'où', 'oû', 'oi', 'oî', 'œu', 'oo'].indexOf(t2) >= 0) v = t2;
      else if (t2 === 'ey' && !estVoyelle(apres)) v = t2;                                  // Sey-na-bou, po-ney
      i += v.length;
      // « ill » après une voyelle : le i reste avec elle (tra-vai-ller, a-bei-lle, feui-lle)
      if (m.substr(i, 3) === 'ill' && v !== 'i') { v += 'i'; i += 1; }
      u.push({ s: v, v: true, trema: TREMA.indexOf(v.charAt(0)) >= 0 });
    }
    return u;
  }
  function eMuetFinal(u, k) {
    if (u[k].s !== 'e') return false;
    var reste = '';
    for (var j = k + 1; j < u.length; j++) { if (u[j].v) return false; reste += u[j].s; }
    return reste === 'nt' ? 'nt' : reste === '' || reste === 's';
  }
  // Voyelles qui se suivent : on les réunit quand elles se disent d'un seul coup (chien, nuit, nation, joue…)
  function fusionner(u) {
    var change = true;
    while (change) {
      change = false;
      for (var k = 0; k + 1 < u.length; k++) {
        var A = u[k], B = u[k + 1];
        if (!A.v || !B.v || B.trema) continue;
        var a = u[k - 2], b = u[k - 1];
        var groupe = !!(a && b && !a.v && !b.v && inseparables(a.s, b.s));     // consonne + l/r juste avant
        var ok = false;
        var muet = eMuetFinal(u, k + 1);
        if (muet === 'nt') ok = !groupe;                                         // jouent, mais cli-ent
        else if (muet) ok = true;                                              // jou-e → joue, a-mi-e → a-mie
        else if (A.s === 'u' && B.s.charAt(0) === 'i') ok = true;              // nuit, pluie, cuisine
        else if (A.s === 'i' || A.s === 'y' || A.s === 'u' || A.s === 'ou') ok = !groupe; // chien, hyè-ne, nuage ; mais cri-er, cru-el
        if (ok) { u.splice(k, 2, { s: A.s + B.s, v: true, trema: A.trema }); change = true; break; }
      }
    }
    return u;
  }
  // Syllabes d'un mot simple (sans trait d'union ni apostrophe). La casse d'origine est gardée.
  function syllabesSimples(mot) {
    if (!mot) return [];
    var u = fusionner(unites(mot.toLowerCase()));
    var noyaux = [];
    u.forEach(function (x, k) { if (x.v) noyaux.push(k); });
    if (noyaux.length <= 1) return [mot];
    var coupes = [];
    for (var q = 0; q + 1 < noyaux.length; q++) {
      var a = noyaux[q], b = noyaux[q + 1], n = b - a - 1;
      if (n === 0) coupes.push(b);                                             // é-cole, ré-a-li-té
      else if (n === 1) coupes.push(a + 1);                                    // ma-man, cho-co-lat
      else if (inseparables(u[b - 2].s, u[b - 1].s)) coupes.push(b - 2);       // ta-ble, ins-truc-tion
      else coupes.push(b - 1);                                                 // par-tir, obs-ta-cle
    }
    var pos = [0], l = 0;
    for (var k = 0; k < u.length; k++) { l += u[k].s.length; pos.push(l); }
    var out = [], debut = 0;
    coupes.forEach(function (c) { out.push(mot.slice(debut, pos[c])); debut = pos[c]; });
    out.push(mot.slice(debut));
    return out;
  }
  var APOS = /['’]/;
  // Mot avec apostrophe(s) : l'é-co-le, jus-qu'à, au-jour-d'hui
  function syllabesApostrophe(mot) {
    var k = Math.max(mot.lastIndexOf("'"), mot.lastIndexOf('’'));
    if (k < 0) return syllabesSimples(mot);
    var avant = mot.slice(0, k), apo = mot.charAt(k), apres = mot.slice(k + 1);
    if (!apres) return syllabesApostrophe(avant).concat([]).map(function (s, i, t) { return i === t.length - 1 ? s + apo : s; });
    var elide = /qu$/i.test(avant) ? avant.slice(-2) : avant.slice(-1);
    var reste = avant.slice(0, avant.length - elide.length);
    var s = syllabesSimples(apres);
    s[0] = elide + apo + s[0];
    return (reste ? syllabesApostrophe(reste) : []).concat(s);
  }
  // Mot complet → [{ s, syl }] : morceaux à colorier (syl: true) et traits d'union (syl: false)
  function morceaux(mot) {
    var out = [];
    var parts = mot.split(/(-)/);
    parts.forEach(function (p) {
      if (!p) return;
      if (p === '-') out.push({ s: '-', syl: false });
      // « t » de liaison (cria-t-elle) : pas une syllabe, il n'est pas colorié
      else if (parts.length > 1 && !/[aàâäeéèêëiîïoôöuùûüyœæ]/i.test(p)) out.push({ s: p, syl: false });
      else syllabesApostrophe(p).forEach(function (s) { out.push({ s: s, syl: true }); });
    });
    return out;
  }
  function syllabes(mot) { return morceaux(mot).filter(function (m) { return m.syl; }).map(function (m) { return m.s; }); }

  // ---------- Découpage du texte ----------
  var LETTRES = 'A-Za-zÀ-ÖØ-öø-ÿŒœÆæ';
  var RE_JETON = new RegExp('([' + LETTRES + ']+(?:[\'’\\-][' + LETTRES + ']+)*)|(\\d+(?:[.,]\\d+)*)|(\\n)|([^' + LETTRES + '\\d\\n]+)', 'g');
  // → { mots: [{ i, texte, debut, fin, nombre }], jetons: [{ t: 'mot'|'nl'|'autre', s, i? }] }
  function decouper(texte) {
    texte = String(texte || '').replace(/\r\n?/g, '\n');
    var jetons = [], mots = [], m;
    RE_JETON.lastIndex = 0;
    while ((m = RE_JETON.exec(texte))) {
      if (m[1] || m[2]) {
        var x = { i: mots.length, texte: m[0], debut: m.index, fin: m.index + m[0].length, nombre: !!m[2] };
        mots.push(x);
        jetons.push({ t: 'mot', s: m[0], i: x.i });
      } else if (m[3]) jetons.push({ t: 'nl', s: '\n' });
      else jetons.push({ t: 'autre', s: m[0] });
    }
    return { texte: texte, mots: mots, jetons: jetons };
  }
  // Phrases pour la lecture à voix haute : chaque phrase garde la position de ses mots.
  function phrases(analyse) {
    var out = [], cur = null, texte = analyse.texte;
    var fermer = function (fin) {
      if (cur && cur.mots.length) {
        cur.texte = texte.slice(cur.debut, fin).replace(/\s+$/, '');
        cur.mots.forEach(function (w) { w.debut -= cur.debut; w.fin -= cur.debut; });
        out.push(cur);
      }
      cur = null;
    };
    analyse.jetons.forEach(function (j) {
      if (j.t === 'mot') {
        var w = analyse.mots[j.i];
        if (!cur) cur = { debut: w.debut, mots: [] };
        cur.mots.push({ i: w.i, debut: w.debut, fin: w.fin, texte: w.texte });
      } else if (j.t === 'nl') {
        if (cur) fermer(cur.mots[cur.mots.length - 1].fin);
      } else if (cur && /[.!?…]/.test(j.s)) {
        var dernier = cur.mots[cur.mots.length - 1];
        fermer(dernier.fin + j.s.replace(/\s+$/, '').length);
      }
    });
    if (cur) fermer(cur.mots[cur.mots.length - 1].fin + 1);
    return out;
  }
  // Mot de la phrase prononcé au caractère donné (événement « boundary » de la synthèse vocale)
  function motAuCaractere(phrase, car) {
    var k = 0;
    for (var j = 0; j < phrase.mots.length; j++) if (phrase.mots[j].debut <= car) k = j;
    return k;
  }
  // Durée estimée d'un mot (secondes) quand le navigateur ne signale pas les mots
  function dureeMot(mot, vitesse) { return (0.16 + 0.062 * String(mot).length) / (vitesse || 1); }

  // ---------- Lettres qui se ressemblent ----------
  var PAIRES = { bd: 'bd', pq: 'pq', mn: 'mn' };
  function lettresActives(confusions) {
    var s = '';
    Object.keys(PAIRES).forEach(function (k) { if (confusions && confusions[k]) s += PAIRES[k]; });
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function marquerLettres(s, actives) {
    if (!actives) return esc(s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), b = c.toLowerCase();
      out += actives.indexOf(b) >= 0 ? '<span class="cf cf-' + b + '">' + esc(c) + '</span>' : esc(c);
    }
    return out;
  }
  // HTML du texte. o : { syllabes: bool, confusions: { bd, pq, mn } }
  function htmlTexte(analyse, o) {
    o = o || {};
    var actives = lettresActives(o.confusions);
    var paras = [[]], vide = 0, n = 0;   // n : compteur de syllabes, alterné sur tout le texte (deux mots voisins d'une syllabe changent de couleur)
    analyse.jetons.forEach(function (j) {
      if (j.t === 'nl') { vide++; if (vide === 1) paras[paras.length - 1].push({ t: 'br' }); else if (vide === 2) paras.push([]); return; }
      if (j.t !== 'autre' || /\S/.test(j.s)) vide = 0;
      paras[paras.length - 1].push(j);
    });
    return paras.map(function (p) {
      while (p.length && (p[p.length - 1].t === 'br' || (p[p.length - 1].t === 'autre' && !/\S/.test(p[p.length - 1].s)))) p.pop();
      while (p.length && (p[0].t === 'br' || (p[0].t === 'autre' && !/\S/.test(p[0].s)))) p.shift();
      if (!p.length) return '';
      return '<p>' + p.map(function (j) {
        if (j.t === 'br') return '<br>';
        if (j.t === 'autre') return esc(j.s);
        var w = analyse.mots[j.i];
        var corps;
        if (o.syllabes && !w.nombre) {
          corps = morceaux(w.texte).map(function (m) {
            if (!m.syl) return esc(m.s);
            return '<span class="syl s' + (n++ % 2) + '">' + marquerLettres(m.s, actives) + '</span>';
          }).join('');
        } else corps = marquerLettres(w.texte, actives);
        return '<span class="mot" data-i="' + w.i + '">' + corps + '</span>';
      }).join('') + '</p>';
    }).join('');
  }

  // ---------- Texte venant d'une photo (OCR) ----------
  function nettoyerOCR(t) {
    t = String(t || '').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ');
    t = t.replace(/[|]/g, 'l').replace(/[‘’`´]/g, '’').replace(/’/g, "'");
    t = t.replace(/(\w)[-‐¬]\n(\w)/g, '$1$2');                    // mot coupé en fin de ligne : mai-\nson → maison
    var lignes = t.split('\n').map(function (l) { return l.trim(); });
    // lignes de bruit (pas de lettre, ou un seul signe isolé)
    lignes = lignes.map(function (l) { return /[A-Za-zÀ-ÿ]{2,}/.test(l) || /\d/.test(l) ? l : ''; });
    var paras = [], cur = [];
    lignes.forEach(function (l) {
      if (!l) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } return; }
      cur.push(l);
    });
    if (cur.length) paras.push(cur.join(' '));
    return paras.join('\n\n').replace(/ +([,.])/g, '$1').trim();
  }
  function titreAuto(texte) {
    var mots = String(texte || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
    if (mots.length > 40) mots = mots.slice(0, 40).replace(/\s+\S*$/, '');
    mots = mots.replace(/[\s,;:.!?«»"'—-]+$/, '');
    return mots ? mots.charAt(0).toUpperCase() + mots.slice(1) + '…' : 'Mon texte';
  }

  // ---------- Pass ----------
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var BOUTIQUE = '../../boutique/';
  var SLUG = 'pass-lecture-facile-12-mois';
  var PRODUITS = {}; PRODUITS[SLUG] = { jours: 365, nom: 'Pass Lecture Facile 12 mois', prix: 1500 };
  var GRACE_JOURS = 1, RAPPEL_JOURS = 15, TEXTES_GRATUITS = 3;
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
  function urlProduit() { return BOUTIQUE + SLUG + '.html'; }
  function analyserReponse(j, maintenant) {
    var c = j && j.commande;
    if (!c || typeof c !== 'object') return { ok: false, raison: 'introuvable' };
    var slug = c.produit && c.produit.slug, p = PRODUITS[slug];
    if (!p) return { ok: false, raison: 'produit', titre: (c.produit && c.produit.titre) || '' };
    if (c.payee !== true) return { ok: false, raison: 'impayee' };
    var debut = Date.parse(c.payee_le);
    if (!isFinite(debut)) return { ok: false, raison: 'impayee' };
    var pass = { id: String(c.id || ''), slug: slug, jours: p.jours, payeeLe: new Date(debut).toISOString() };
    var fin = debut + (p.jours + GRACE_JOURS) * JOUR_MS, now = maintenant == null ? Date.now() : +maintenant;
    if (fin <= now) return { ok: false, raison: 'expiree', fin: new Date(fin).toISOString(), pass: pass };
    return { ok: true, pass: pass, fin: new Date(fin).toISOString() };
  }
  function finDroits(passes) {
    var vus = {}, liste = [];
    (passes || []).forEach(function (p) {
      if (!p || !PRODUITS[p.slug] || !isFinite(Date.parse(p.payeeLe))) return;
      if (p.id && vus[p.id]) return;
      if (p.id) vus[p.id] = 1;
      liste.push(p);
    });
    if (!liste.length) return null;
    liste.sort(function (a, b) { return Date.parse(a.payeeLe) - Date.parse(b.payeeLe); });
    var fin = null;
    liste.forEach(function (p) { var d = Date.parse(p.payeeLe); fin = Math.max(fin == null ? d : fin, d) + PRODUITS[p.slug].jours * JOUR_MS; });
    return fin + GRACE_JOURS * JOUR_MS;
  }
  function etatPass(passes, maintenant) {
    var now = maintenant == null ? Date.now() : +maintenant, fin = finDroits(passes);
    if (fin == null) return { premium: false, jamais: true, fin: null, joursRestants: 0, rappel: false, expire: false };
    var reste = fin - now, jr = reste > 0 ? Math.ceil(reste / JOUR_MS) : 0;
    return { premium: reste > 0, jamais: false, fin: new Date(fin).toISOString(), joursRestants: jr, rappel: reste > 0 && jr <= RAPPEL_JOURS, expire: reste <= 0 };
  }
  function ajouterPass(passes, pass) {
    var l = (passes || []).filter(function (p) { return !(pass.id && p.id === pass.id); });
    l.push({ id: pass.id, slug: pass.slug, jours: pass.jours, payeeLe: pass.payeeLe, verifieLe: new Date().toISOString() });
    return l;
  }
  // Version gratuite : 3 textes enregistrés (les textes déjà enregistrés restent toujours lisibles et modifiables)
  function peutEnregistrer(nbTextes, premium) { return !!premium || nbTextes < TEXTES_GRATUITS; }
  // Syllabes en couleur : avec le pass, ou pour essayer sur le premier texte facile
  var TEXTE_ESSAI = 'n1-01';
  function syllabesPermises(idTexte, premium) { return !!premium || idTexte === TEXTE_ESSAI; }

  // ---------- Dates, partage ----------
  function dateISO(d) { d = d || new Date(); var m = d.getMonth() + 1, j = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j; }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateFr(iso) { var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
  function dateLongue(iso) { var p = String(iso).slice(0, 10).split('-'); return (+p[2]) + ' ' + MOIS[+p[1] - 1] + ' ' + p[0]; }
  var URL_APPLI = 'https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/lecture/';
  function messageTexte(titre, texte) {
    var t = String(texte || '').trim();
    if (t.length > 1200) t = t.slice(0, 1200).replace(/\s+\S*$/, '') + '…';
    return (titre ? titre + '\n\n' : '') + t + '\n\n(Texte préparé avec Lecture Facile : ' + URL_APPLI + ')';
  }
  function messageConseil() {
    return 'Je te conseille « Lecture Facile » : une appli gratuite qui aide à lire (grandes lettres, lecture à voix haute, règle de lecture, b et d en couleur). Elle marche sans Internet : ' + URL_APPLI;
  }
  function lienWhatsApp(message) { return 'https://wa.me/?text=' + encodeURIComponent(message); }
  function nouvelId() {
    try { if (racine.crypto && racine.crypto.randomUUID) return racine.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var LF = {
    syllabes: syllabes, syllabesSimples: syllabesSimples, morceaux: morceaux, unites: unites,
    decouper: decouper, phrases: phrases, motAuCaractere: motAuCaractere, dureeMot: dureeMot,
    lettresActives: lettresActives, marquerLettres: marquerLettres, htmlTexte: htmlTexte,
    nettoyerOCR: nettoyerOCR, titreAuto: titreAuto,
    API: API, SLUG: SLUG, PRODUITS: PRODUITS, GRACE_JOURS: GRACE_JOURS, RAPPEL_JOURS: RAPPEL_JOURS, TEXTES_GRATUITS: TEXTES_GRATUITS,
    lireLienCommande: lireLienCommande, urlVerification: urlVerification, urlProduit: urlProduit, analyserReponse: analyserReponse,
    finDroits: finDroits, etatPass: etatPass, ajouterPass: ajouterPass, peutEnregistrer: peutEnregistrer,
    TEXTE_ESSAI: TEXTE_ESSAI, syllabesPermises: syllabesPermises,
    dateISO: dateISO, dateFr: dateFr, dateLongue: dateLongue, URL_APPLI: URL_APPLI, messageTexte: messageTexte,
    messageConseil: messageConseil, lienWhatsApp: lienWhatsApp, nouvelId: nouvelId
  };
  if (typeof module === 'object' && module.exports) module.exports = LF;
  else racine.LF = LF;
})(typeof self !== 'undefined' ? self : this);
