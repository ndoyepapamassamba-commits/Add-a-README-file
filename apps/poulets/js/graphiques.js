/* PouletPilot — graphiques dessinés en SVG (aucune bibliothèque). Lecture au toucher, au clavier et en tableau. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function E(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }
  function pasPropre(etendue, n) {
    var brut = etendue / n, p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10)), m = brut / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function graduations(max, n) {
    if (!(max > 0)) max = 1;
    var st = pasPropre(max, n), out = [];
    for (var v = 0; v <= max + st * 0.001; v += st) out.push(+v.toFixed(6));
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + st).toFixed(6));
    return out;
  }
  function compact(v) {
    if (Math.abs(v) >= 10000) return (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + 'k';
    return v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/ /g, ' ');
  }

  // Ajoute la lecture interactive : toucher, souris et flèches du clavier
  function interactif(svg, xs, versPx, dessinerSel, lire, zone) {
    var idx = -1, lecture = zone.querySelector('.lecture');
    function choisir(i) {
      if (!xs.length) return;
      idx = Math.max(0, Math.min(xs.length - 1, i));
      dessinerSel(xs[idx]);
      lecture.textContent = lire(xs[idx]);
    }
    function depuisEvenement(ev) {
      var r = svg.getBoundingClientRect();
      if (!r.width) return;
      var vb = svg.viewBox.baseVal, x = (ev.clientX - r.left) * vb.width / r.width;
      var best = 0, d = Infinity;
      xs.forEach(function (v, i) { var dd = Math.abs(versPx(v) - x); if (dd < d) { d = dd; best = i; } });
      choisir(best);
    }
    svg.addEventListener('pointerdown', depuisEvenement);
    svg.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse' || ev.buttons) depuisEvenement(ev); });
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { choisir(idx < 0 ? xs.length - 1 : idx + 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { choisir(idx < 0 ? xs.length - 1 : idx - 1); ev.preventDefault(); }
      else if (ev.key === 'Home') { choisir(0); ev.preventDefault(); }
      else if (ev.key === 'End') { choisir(xs.length - 1); ev.preventDefault(); }
    });
    svg.addEventListener('focus', function () { if (idx < 0) choisir(xs.length - 1); });
  }

  function tableau(entetes, lignes) {
    var d = E('details'), s = E('summary', null, 'Voir les chiffres'), box = E('div', 'defile'), t = E('table');
    d.appendChild(s);
    var tr = E('tr'); entetes.forEach(function (h, i) { var th = E('th', i ? 'n' : null, h); th.scope = 'col'; tr.appendChild(th); });
    var th = E('thead'); th.appendChild(tr); t.appendChild(th);
    var tb = E('tbody');
    lignes.forEach(function (l) { var r = E('tr'); l.forEach(function (c, i) { r.appendChild(E('td', i ? 'n' : null, c)); }); tb.appendChild(r); });
    t.appendChild(tb); box.appendChild(t); d.appendChild(box);
    return d;
  }

  // Courbe(s) : o = { titre, series: [{ nom, style: 1|2, points: [{x, y}] }], xMax, yNom, lire(x), entetes, lignes }
  function courbe(o) {
    var W = 340, H = 200, g = 46, dr = 10, ht = 10, bs = 28;
    var pw = W - g - dr, ph = H - ht - bs;
    var zone = E('div', 'graphique');
    var tous = [];
    o.series.forEach(function (s) { s.points.forEach(function (p) { tous.push(p); }); });
    var xMax = Math.max(o.xMax || 0, tous.reduce(function (m, p) { return Math.max(m, p.x); }, 1));
    var yMax = tous.reduce(function (m, p) { return Math.max(m, p.y); }, 0) * 1.08;
    var gy = graduations(yMax || 1, 4); yMax = gy[gy.length - 1];
    var gx = graduations(xMax, 6).filter(function (v) { return v <= xMax + 1e-9; });
    function X(v) { return g + v / xMax * pw; }
    function Y(v) { return ht + ph - v / yMax * ph; }
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titre, tabindex: '0', focusable: 'true' });
    S('title', {}, svg).textContent = o.titre;
    gy.forEach(function (v) {
      S('line', { x1: g, x2: W - dr, y1: Y(v), y2: Y(v), 'class': v === 0 ? 'axe' : 'grille' }, svg);
      S('text', { x: g - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = compact(v);
    });
    gx.forEach(function (v) { S('text', { x: X(v), y: H - 10, 'text-anchor': 'middle' }, svg).textContent = compact(v); });
    o.series.slice().reverse().forEach(function (s) {
      if (!s.points.length) return;
      var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
      S('path', { d: d, 'class': 'l' + s.style }, svg);
      if (s.style === 1) s.points.forEach(function (p) { S('circle', { cx: X(p.x), cy: Y(p.y), r: 4.5, 'class': 'p1' }, svg); });
    });
    var curseur = S('line', { y1: ht, y2: ht + ph, 'class': 'curseur', visibility: 'hidden' }, svg);
    var sel = S('circle', { r: 6, 'class': 'sel', visibility: 'hidden' }, svg);
    zone.appendChild(svg);
    var leg = E('ul', 'legende');
    if (o.series.length > 1) o.series.forEach(function (s) { var li = E('li'); li.appendChild(E('i', 's' + s.style)); li.appendChild(document.createTextNode(s.nom)); leg.appendChild(li); });
    zone.appendChild(leg);
    zone.appendChild(E('p', 'lecture'));
    var xs = [];
    var principale = o.series[0].points.length ? o.series[0].points : (o.series[1] ? o.series[1].points : []);
    principale.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); });
    interactif(svg, xs, X, function (x) {
      curseur.setAttribute('x1', X(x)); curseur.setAttribute('x2', X(x)); curseur.setAttribute('visibility', 'visible');
      var p = null; principale.forEach(function (q) { if (q.x === x) p = q; });
      if (p) { sel.setAttribute('cx', X(p.x)); sel.setAttribute('cy', Y(p.y)); sel.setAttribute('visibility', 'visible'); }
    }, o.lire, zone);
    if (o.lignes) zone.appendChild(tableau(o.entetes, o.lignes));
    return zone;
  }

  // Colonnes (une valeur par jour) : o = { titre, valeurs: [{x, y, haut}], lire(x), entetes, lignes }
  function colonnes(o) {
    var W = 340, H = 170, g = 34, dr = 8, ht = 10, bs = 28;
    var pw = W - g - dr, ph = H - ht - bs;
    var zone = E('div', 'graphique');
    var n = Math.max(1, o.valeurs.length);
    var yMax = o.valeurs.reduce(function (m, v) { return Math.max(m, v.y); }, 0);
    var gy = graduations(Math.max(yMax, 4), 4); yMax = gy[gy.length - 1];
    var slot = pw / n, bw = Math.max(1.5, Math.min(24, slot - 2));
    function X(i) { return g + i * slot + slot / 2; }
    function Y(v) { return ht + ph - v / yMax * ph; }
    var svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titre, tabindex: '0', focusable: 'true' });
    S('title', {}, svg).textContent = o.titre;
    gy.forEach(function (v) {
      S('line', { x1: g, x2: W - dr, y1: Y(v), y2: Y(v), 'class': v === 0 ? 'axe' : 'grille' }, svg);
      S('text', { x: g - 6, y: Y(v) + 4, 'text-anchor': 'end' }, svg).textContent = compact(v);
    });
    var pasX = Math.max(1, Math.ceil(n / 7));
    o.valeurs.forEach(function (v, i) {
      if (v.y > 0) {
        var h = Math.max(1, ph * v.y / yMax), r = Math.min(4, bw / 2);
        var x0 = X(i) - bw / 2, y0 = Y(v.y);
        // extrémité arrondie, base carrée
        var d = 'M' + x0 + ' ' + (y0 + h) + 'V' + (y0 + r) + 'Q' + x0 + ' ' + y0 + ' ' + (x0 + r) + ' ' + y0 + 'H' + (x0 + bw - r) +
          'Q' + (x0 + bw) + ' ' + y0 + ' ' + (x0 + bw) + ' ' + (y0 + r) + 'V' + (y0 + h) + 'Z';
        S('path', { d: d, 'class': 'b1' + (v.haut ? ' haut' : '') }, svg);
      }
      if (i % pasX === 0) S('text', { x: X(i), y: H - 10, 'text-anchor': 'middle' }, svg).textContent = String(v.x);
    });
    var curseur = S('line', { y1: ht, y2: ht + ph, 'class': 'curseur', visibility: 'hidden' }, svg);
    zone.appendChild(svg);
    zone.appendChild(E('p', 'lecture'));
    var xs = o.valeurs.map(function (v, i) { return i; });
    interactif(svg, xs, X, function (i) {
      curseur.setAttribute('x1', X(i)); curseur.setAttribute('x2', X(i)); curseur.setAttribute('visibility', 'visible');
    }, function (i) { return o.lire(o.valeurs[i]); }, zone);
    if (o.lignes) zone.appendChild(tableau(o.entetes, o.lignes));
    return zone;
  }

  // Barres horizontales en HTML (libellés longs, valeurs négatives possibles)
  // items = [{ nom, valeur, texte }]
  function barresH(items, titre) {
    var ul = E('ul', 'barres-h');
    if (titre) ul.setAttribute('aria-label', titre);
    var max = 0, min = 0;
    items.forEach(function (it) { max = Math.max(max, it.valeur); min = Math.min(min, it.valeur); });
    var etendue = (max - min) || 1, zero = -min / etendue * 100;
    items.forEach(function (it) {
      var li = E('li'), tete = E('div', 'tete');
      tete.appendChild(E('span', null, it.nom)); tete.appendChild(E('b', null, it.texte));
      var piste = E('div', 'piste'), barre = E('i', it.valeur < 0 ? 'neg' : null);
      var w = Math.abs(it.valeur) / etendue * 100;
      barre.style.left = (it.valeur < 0 ? zero - w : zero) + '%';
      barre.style.width = w + '%';
      piste.appendChild(barre);
      if (min < 0) { var z = E('span', 'zero'); z.style.left = 'calc(' + zero + '% - 1px)'; piste.appendChild(z); }
      li.appendChild(tete); li.appendChild(piste); ul.appendChild(li);
    });
    return ul;
  }

  window.PPG = { courbe: courbe, colonnes: colonnes, barresH: barresH, graduations: graduations };
})();
