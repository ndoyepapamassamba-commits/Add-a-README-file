/* Teranga — outils communs : nombres, dates, partage exact en F CFA, éléments d'interface.
   Les fonctions de calcul marchent aussi dans Node (tests) ; les fonctions d'écran seulement dans le navigateur. */
(function (racine) {
  'use strict';
  var NBSP = ' ';
  var JOUR_MS = 86400000;

  // ---------- Nombres ----------
  function estNombre(x) { return typeof x === 'number' && isFinite(x); }
  function n(x) { return estNombre(x) ? x : 0; }
  function arrondi(x, dec) { var p = Math.pow(10, dec || 0); return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * p) / p; }
  function grouper(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  // nombre(1234.5, 1) → « 1 234,5 » ; les zéros inutiles après la virgule sont retirés
  function nombre(x, dec) {
    if (!estNombre(x)) return '—';
    dec = dec || 0;
    var r = arrondi(x, dec);
    if (r === 0) r = 0;
    var s = Math.abs(r).toFixed(dec).split('.');
    var dec2 = s[1] ? s[1].replace(/0+$/, '') : '';
    return (r < 0 ? '-' : '') + grouper(s[0]) + (dec2 ? ',' + dec2 : '');
  }
  function fcfa(x) { return estNombre(x) ? nombre(Math.round(x), 0) + NBSP + 'F' : '—'; }
  function kg(x, dec) { return estNombre(x) ? nombre(x, dec == null ? 1 : dec) + NBSP + 'kg' : '—'; }
  function pct(x, dec) { return estNombre(x) ? nombre(x * 100, dec == null ? 0 : dec) + NBSP + '%' : '—'; }
  function lireNombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v == null ? '' : v).trim().replace(/[\s  ]/g, '').replace(/(fcfa|f|kg|g|cm|m2|m²|ha|l)$/i, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  // Partage exact d'un montant entier en parts entières (la somme des parts = le montant).
  // poids : tableau de nombres ≥ 0 (parts égales si tous à 1). Méthode du plus grand reste, ordre stable.
  function repartir(montant, poids) {
    montant = Math.round(n(montant));
    var k = poids.length, tot = 0, i;
    if (!k) return [];
    for (i = 0; i < k; i++) tot += Math.max(0, n(poids[i]));
    if (!(tot > 0)) { poids = poids.map(function () { return 1; }); tot = k; }
    var signe = montant < 0 ? -1 : 1, m = Math.abs(montant), parts = [], restes = [], somme = 0;
    for (i = 0; i < k; i++) {
      var exact = m * Math.max(0, n(poids[i])) / tot, b = Math.floor(exact + 1e-9);
      parts.push(b); somme += b; restes.push({ i: i, r: exact - b });
    }
    restes.sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (i = 0; i < m - somme; i++) parts[restes[i % k].i]++;
    return parts.map(function (p) { return p * signe; });
  }
  function mediane(l) {
    var t = l.filter(estNombre).slice().sort(function (a, b) { return a - b; });
    if (!t.length) return null;
    var m = Math.floor(t.length / 2);
    return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
  }

  // ---------- Dates (chaînes AAAA-MM-JJ, calcul en jours entiers sans effet d'heure d'été) ----------
  function deux(x) { return (x < 10 ? '0' : '') + x; }
  function dateISO(d) { d = d || new Date(); return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function dateValide(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function jour(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / JOUR_MS) : NaN; }
  function depuisJour(j) { var d = new Date(j * JOUR_MS); return d.getUTCFullYear() + '-' + deux(d.getUTCMonth() + 1) + '-' + deux(d.getUTCDate()); }
  function ajouterJours(iso, k) { return depuisJour(jour(iso) + k); }
  function ecartJours(a, b) { return jour(b) - jour(a); }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function parts(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? [+m[1], +m[2], +m[3]] : null; }
  function dateFr(iso) { var p = parts(iso); return p ? p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS_C[p[1] - 1] + ' ' + p[0] : ''; }
  function dateLongue(iso) {
    var p = parts(iso); if (!p) return '';
    var js = JOURS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
    return js + ' ' + p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS[p[1] - 1] + ' ' + p[0];
  }
  function dateCourte(iso) { var p = parts(iso); return p ? p[2] + (p[2] === 1 ? 'er' : '') + ' ' + MOIS_C[p[1] - 1] : ''; }
  function moisCourt(iso) { var p = parts(iso); return p ? MOIS_C[p[1] - 1] : ''; }
  function jourDuMois(iso) { var p = parts(iso); return p ? p[2] : ''; }
  function dans(k) {
    if (!estNombre(k)) return '';
    if (k === 0) return 'aujourd’hui';
    if (k === 1) return 'demain';
    if (k === -1) return 'hier';
    return k > 0 ? 'dans ' + k + ' jours' : 'il y a ' + (-k) + ' jours';
  }
  function pluriel(nb, mot, motPl) { return nombre(nb) + ' ' + (Math.abs(nb) >= 2 ? (motPl || mot + 's') : mot); }

  // ---------- Textes et liens ----------
  function lienWhatsApp(texte) { return 'https://wa.me/?text=' + encodeURIComponent(texte); }
  function nomFichier(base, ext) {
    var s = String(base || 'fichier').normalize ? String(base || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '') : String(base);
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier';
    return s + '.' + ext;
  }
  function nouvelId() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ancien navigateur */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var U = {
    NBSP: NBSP, JOUR_MS: JOUR_MS, estNombre: estNombre, n: n, arrondi: arrondi, nombre: nombre, fcfa: fcfa, kg: kg, pct: pct,
    lireNombre: lireNombre, repartir: repartir, mediane: mediane,
    dateISO: dateISO, dateValide: dateValide, jour: jour, depuisJour: depuisJour, ajouterJours: ajouterJours, ecartJours: ecartJours,
    dateFr: dateFr, dateLongue: dateLongue, dateCourte: dateCourte, moisCourt: moisCourt, jourDuMois: jourDuMois, dans: dans, pluriel: pluriel,
    lienWhatsApp: lienWhatsApp, nomFichier: nomFichier, nouvelId: nouvelId
  };

  if (typeof document !== 'undefined') ajouterEcran(U);
  if (typeof module === 'object' && module.exports) module.exports = U;
  else racine.TU = U;

  // ---------- Éléments d'écran (navigateur) ----------
  function ajouterEcran(U) {
    function h(tag, attrs) {
      var e = document.createElement(tag);
      if (attrs) for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
      for (var i = 2; i < arguments.length; i++) ajouter(e, arguments[i]);
      return e;
    }
    function ajouter(e, c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(function (x) { ajouter(e, x); }); return; }
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    var CHEMINS = {
      plus: 'M12 5v14M5 12h14',
      accueil: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
      pesee: 'M5 8h14l-2 12H7zM9 8a3 3 0 0 1 6 0M12 12v3',
      ruban: 'M3 12a9 4 0 1 0 18 0 9 4 0 1 0-18 0M7 12v2M11 12v3M15 12v2',
      sac: 'M7 7h10l2 13H5zM9 7V5a3 3 0 0 1 6 0v2M9 12h6',
      depense: 'M3 7h18v12H3zM3 11h18M7 15h3',
      vente: 'M20 12l-8 8-9-9V3h8zM7.5 7.5h.01',
      coeur: 'M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z',
      calendrier: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
      pdf: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
      alerte: 'M12 3l10 18H2zM12 10v5M12 18h.01',
      info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7h.01',
      verrou: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
      ok: 'M20 6L9 17l-5-5',
      partager: 'M4 12v8h16v-8M12 3v13M7 8l5-5 5 5',
      telecharger: 'M4 17v3h16v-3M12 3v13M7 11l5 5 5-5',
      corbeille: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
      modifier: 'M4 20h4L19 9l-4-4L4 16z',
      drapeau: 'M5 21V4M5 4h11l-2 4 2 4H5',
      graphique: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
      installer: 'M12 3v12M7 10l5 5 5-5M5 21h14',
      sauvegarde: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 14h8v7H8z',
      etoile: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z',
      reglages: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7',
      photo: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      whatsapp: 'M4 20l1.3-4A8 8 0 1 1 8 18.7zM9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z',
      cible: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
      plante: 'M12 21V10M12 10C12 6 9 4 5 4c0 4 3 6 7 6zM12 13c0-4 3-6 7-6 0 4-3 6-7 6z',
      parcelle: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13',
      outil: 'M14 6l4 4M3 21l9-9M12 12l4-4 2 2 3-3-4-4-3 3 2 2',
      travail: 'M8 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0M5 21v-3a6 6 0 0 1 12 0v3',
      recolte: 'M4 20h16M6 20l2-9h8l2 9M9 11V7a3 3 0 0 1 6 0v4',
      goutte: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
      comparer: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
      position: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
      liste: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
      horloge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2'
    };
    function icone(nom) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', CHEMINS[nom] || CHEMINS.info);
      svg.appendChild(p);
      return svg;
    }
    function $(s) { return document.querySelector(s); }
    var minuteurToast = null;
    function toast(t) {
      var el = $('#toast'); if (!el) return;
      el.textContent = t; el.classList.add('visible');
      clearTimeout(minuteurToast); minuteurToast = setTimeout(function () { el.classList.remove('visible'); }, 3200);
    }
    function stockLocal(cle, val) {
      try { if (val === undefined) return localStorage.getItem(cle); if (val === null) localStorage.removeItem(cle); else localStorage.setItem(cle, val); } catch (e) { /* indisponible */ }
      return null;
    }
    function alerte(niveau, texte, extra) {
      return h('div', { class: 'alerte ' + niveau, role: niveau === 'attention' || niveau === 'danger' ? 'alert' : null },
        icone(niveau === 'info' ? 'info' : niveau === 'ok' ? 'ok' : 'alerte'), h('div', { class: 'texte' }, texte, extra || null));
    }
    function kpi(etiquette, valeur, sous, opts) {
      opts = opts || {};
      return h('div', { class: 'kpi' + (opts.large ? ' large' : ''), 'data-kpi': opts.id || null },
        h('span', { class: 'etiquette' }, etiquette),
        h('span', { class: 'valeur' + (opts.signe && valeur !== '—' ? (opts.signe < 0 ? ' negatif' : ' positif') : '') }, valeur),
        sous ? h('span', { class: 'sous' }, sous) : null);
    }
    function lienBouton(href, texte, cls, ic, attrs) {
      var a = { class: 'btn ' + (cls || ''), href: href };
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      return h('a', a, ic ? icone(ic) : null, texte);
    }
    function bouton(texte, cls, onclick, ic, attrs) {
      var a = { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick };
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      return h('button', a, ic ? icone(ic) : null, texte);
    }
    function boutonWhatsApp(texte, message, attrs) {
      var a = { class: 'btn whatsapp', href: lienWhatsApp(message), target: '_blank', rel: 'noopener', 'data-action': 'whatsapp' };
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      return h('a', a, icone('whatsapp'), texte);
    }
    var compteurChamp = 0;
    function champ(label, input, aide, opts) {
      opts = opts || {};
      if (!input.id) input.id = 'c-' + (input.name || 'x') + '-' + (++compteurChamp);
      var idAide = aide ? input.id + '-aide' : null, idErr = input.id + '-err';
      input.setAttribute('aria-describedby', [idAide, idErr].filter(Boolean).join(' '));
      return h('div', { class: 'champ' + (opts.cls ? ' ' + opts.cls : '') },
        h('label', { for: input.id }, label), input,
        aide ? h('span', { class: 'aide', id: idAide }, aide) : null,
        h('div', { class: 'erreur-champ', id: idErr, hidden: true, role: 'alert' }));
    }
    function entree(nom, valeur, type, attrs) {
      var a = { name: nom, type: 'text', autocomplete: 'off' };
      if (type === 'nombre') { a.inputmode = 'decimal'; }
      else if (type === 'entier') { a.inputmode = 'numeric'; }
      else if (type === 'date') { a.type = 'date'; }
      else if (type === 'tel') { a.type = 'tel'; a.inputmode = 'tel'; }
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      var i = h('input', a);
      if (valeur != null && valeur !== '') i.value = type === 'nombre' || type === 'entier' ? String(valeur).replace('.', ',') : String(valeur);
      if (type === 'nombre' || type === 'entier') i.addEventListener('focus', function () { try { i.select(); } catch (e) { /* rien */ } });
      return i;
    }
    function zoneTexte(nom, valeur, attrs) {
      var a = { name: nom, rows: 3 };
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      var t = h('textarea', a); t.value = valeur || ''; return t;
    }
    function selection(nom, options, courant, attrs) {
      var a = { name: nom };
      if (attrs) for (var k in attrs) a[k] = attrs[k];
      var s = h('select', a, options.map(function (o) { return h('option', { value: o.id, selected: String(o.id) === String(courant) }, o.nom); }));
      return s;
    }
    function choixRadio(nom, options, courant, legende, cls) {
      return h('fieldset', null, h('legend', null, legende),
        h('div', { class: 'choix' + (cls ? ' ' + cls : '') }, options.map(function (o) {
          return h('label', null, h('input', { type: 'radio', name: nom, value: o.id, checked: String(o.id) === String(courant) }), h('span', null, o.emoji ? h('span', { 'aria-hidden': 'true' }, o.emoji) : null, o.nom));
        })));
    }
    function radio(form, nom) { var r = form.querySelector('[name="' + nom + '"]:checked'); return r ? r.value : null; }
    function erreur(form, nom, texte) {
      var i = form.querySelector('[name="' + nom + '"]');
      if (i) {
        i.setAttribute('aria-invalid', 'true');
        var z = document.getElementById(i.id + '-err');
        if (z) { z.textContent = texte; z.hidden = false; }
        else toast(texte);
        try { i.focus(); } catch (e) { /* rien */ }
      } else toast(texte);
      return false;
    }
    function effacerErreurs(form) {
      form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
      form.querySelectorAll('.erreur-champ').forEach(function (z) { z.hidden = true; z.textContent = ''; });
    }
    function val(form, nom) { var i = form.querySelector('[name="' + nom + '"]'); return i ? String(i.value).trim() : ''; }
    function nb(form, nom) { var v = val(form, nom); return v === '' ? null : lireNombre(v); }
    function coche(form, nom) { var i = form.querySelector('[name="' + nom + '"]'); return !!(i && i.checked); }

    // Fichiers : télécharger ou partager (PDF, sauvegarde)
    function telecharger(blob, nom) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nom; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    }
    function peutPartager(blob, nom) {
      try {
        if (!navigator.share || !navigator.canShare || typeof File === 'undefined') return false;
        return navigator.canShare({ files: [new File([blob], nom, { type: blob.type })] });
      } catch (e) { return false; }
    }
    function partagerFichier(blob, nom, titre) {
      return navigator.share({ files: [new File([blob], nom, { type: blob.type })], title: titre || nom });
    }
    function offrirFichier(zone, blob, nom, titre) {
      if (!zone) return;
      zone.textContent = '';
      var carte = h('div', { class: 'alerte ok', 'data-fichier': nom }, icone('ok'), h('div', { class: 'texte' }, h('b', null, 'Fichier prêt : '), nom,
        h('div', { class: 'boutons', style: 'margin:8px 0 0' },
          bouton('Télécharger', 'petit', function () { telecharger(blob, nom); }, 'telecharger', { 'data-action': 'telecharger' }),
          peutPartager(blob, nom) ? bouton('Partager', 'petit secondaire', function () {
            partagerFichier(blob, nom, titre).catch(function (e) { if (e && e.name !== 'AbortError') toast('Partage impossible : téléchargez le fichier.'); });
          }, 'partager', { 'data-action': 'partager' }) : null)));
      zone.appendChild(carte);
      try { carte.querySelector('button').focus(); } catch (e) { /* rien */ }
    }
    // Barres horizontales simples (comparaisons)
    function barres(items, etiquette) {
      var max = 0;
      items.forEach(function (it) { max = Math.max(max, Math.abs(n(it.valeur))); });
      return h('ul', { class: 'barres', 'aria-label': etiquette || null }, items.map(function (it) {
        var l = max > 0 ? Math.round(Math.abs(n(it.valeur)) / max * 100) : 0;
        return h('li', null, h('div', { class: 'nom' }, h('span', null, it.nom), h('b', null, it.texte)),
          h('div', { class: 'piste', 'aria-hidden': 'true' }, h('i', { class: n(it.valeur) < 0 ? 'negatif' : null, style: 'width:' + l + '%' })));
      }));
    }
    var X = {
      h: h, icone: icone, $: $, toast: toast, stockLocal: stockLocal, alerte: alerte, kpi: kpi, lienBouton: lienBouton, bouton: bouton,
      boutonWhatsApp: boutonWhatsApp, champ: champ, entree: entree, zoneTexte: zoneTexte, selection: selection, choixRadio: choixRadio, radio: radio,
      erreur: erreur, effacerErreurs: effacerErreurs, val: val, nb: nb, coche: coche,
      telecharger: telecharger, peutPartager: peutPartager, partagerFichier: partagerFichier, offrirFichier: offrirFichier, barres: barres
    };
    for (var k in X) U[k] = X[k];
  }
})(typeof self !== 'undefined' ? self : this);
