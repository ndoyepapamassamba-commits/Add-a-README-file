/* Carnet du Tailleur — petits dessins : où placer le mètre ruban pour chaque mesure.
   Silhouette paramétrée (homme, femme, enfant) + ruban jaune (devant plein, dos en pointillés).
   Produit une chaîne SVG ; utilisable dans le navigateur (window.CTFig) et dans Node. */
(function (racine) {
  'use strict';
  var P = {
    homme: { teteR: 17, teteY: 30, couY: 50, couL: 8, epY: 62, epL: 44, poY: 90, poL: 36, spY: 104, spL: 33, taY: 126, taL: 31,
      haY: 152, haL: 38, enY: 176, geY: 234, chY: 292, piY: 302, bras: 12, coudeY: 130, poignetY: 172, jambe: 20 },
    femme: { teteR: 16, teteY: 33, couY: 52, couL: 7, epY: 64, epL: 38, poY: 92, poL: 36, spY: 105, spL: 30, taY: 126, taL: 26,
      haY: 154, haL: 42, enY: 178, geY: 234, chY: 292, piY: 302, bras: 11, coudeY: 130, poignetY: 170, jambe: 20 },
    enfant: { teteR: 22, teteY: 40, couY: 66, couL: 7, epY: 76, epL: 33, poY: 100, poL: 30, spY: 110, spL: 28, taY: 126, taL: 28,
      haY: 148, haL: 31, enY: 166, geY: 226, chY: 288, piY: 298, bras: 11, coudeY: 126, poignetY: 164, jambe: 18 }
  };
  function r1(n) { return Math.round(n * 10) / 10; }
  function pt(x, y) { return r1(x) + ',' + r1(y); }
  function g(p) { return P[p] ? P[p] : P.homme; }

  // Positions utiles (bras droit du dessin, jambe droite du dessin)
  function bras(p, cote) {
    var s = cote < 0 ? -1 : 1;
    return {
      epaule: [100 + s * (p.epL - 4), p.epY + 6],
      coude: [100 + s * (p.epL + 6), p.coudeY],
      poignet: [100 + s * (p.epL + 9), p.poignetY]
    };
  }
  function jambe(p, cote) {
    var s = cote < 0 ? -1 : 1, x = 100 + s * (p.haL / 2 + 1);
    return { haut: [x, p.enY - 12], genou: [x + s * 1, p.geY], cheville: [x + s * 3, p.chY] };
  }
  function interp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  function corps(p, genre) {
    var L = function (dx) { return 100 - dx; }, R = function (dx) { return 100 + dx; };
    var mt = (p.taY + p.haY) / 2 - 4, mp = (p.poY + p.taY) / 2;
    var d = 'M' + pt(L(p.couL), p.couY) +
      ' C' + pt(L(p.couL), p.epY - 5) + ' ' + pt(L(p.epL - 10), p.epY - 7) + ' ' + pt(L(p.epL), p.epY + 1) +
      ' Q' + pt(L(p.epL + 3), p.epY + 12) + ' ' + pt(L(p.poL + 1), p.poY - 8) +
      ' L' + pt(L(p.poL), p.poY) +
      ' Q' + pt(L(p.poL), mp) + ' ' + pt(L(p.taL), p.taY) +
      ' Q' + pt(L(p.haL + 1), mt) + ' ' + pt(L(p.haL), p.haY) +
      ' L' + pt(L(p.haL - 3), p.enY) + ' L' + pt(R(p.haL - 3), p.enY) + ' L' + pt(R(p.haL), p.haY) +
      ' Q' + pt(R(p.haL + 1), mt) + ' ' + pt(R(p.taL), p.taY) +
      ' Q' + pt(R(p.poL), mp) + ' ' + pt(R(p.poL), p.poY) +
      ' L' + pt(R(p.poL + 1), p.poY - 8) +
      ' Q' + pt(R(p.epL + 3), p.epY + 12) + ' ' + pt(R(p.epL), p.epY + 1) +
      ' C' + pt(R(p.epL - 10), p.epY - 7) + ' ' + pt(R(p.couL), p.epY - 5) + ' ' + pt(R(p.couL), p.couY) + ' Z';
    var s = '<g class="fig-corps">';
    s += '<rect x="' + r1(100 - p.couL) + '" y="' + r1(p.teteY + p.teteR - 4) + '" width="' + (2 * p.couL) + '" height="' + r1(p.couY - p.teteY - p.teteR + 8) + '" rx="3"/>';
    s += '<circle cx="100" cy="' + p.teteY + '" r="' + p.teteR + '"/>';
    [-1, 1].forEach(function (c) {
      var b = bras(p, c), j = jambe(p, c);
      s += '<polyline points="' + pt(b.epaule[0], b.epaule[1]) + ' ' + pt(b.coude[0], b.coude[1]) + ' ' + pt(b.poignet[0], b.poignet[1]) +
        '" fill="none" stroke-width="' + p.bras + '" stroke-linecap="round" stroke-linejoin="round" class="fig-membre"/>';
      s += '<circle cx="' + r1(b.poignet[0] + c * 1) + '" cy="' + r1(b.poignet[1] + p.bras * 0.7) + '" r="' + r1(p.bras * 0.55) + '"/>';
      s += '<line x1="' + r1(j.haut[0]) + '" y1="' + r1(j.haut[1]) + '" x2="' + r1(j.genou[0]) + '" y2="' + r1(j.genou[1]) + '" stroke-width="' + p.jambe + '" stroke-linecap="round" class="fig-membre"/>';
      s += '<line x1="' + r1(j.genou[0]) + '" y1="' + r1(j.genou[1]) + '" x2="' + r1(j.cheville[0]) + '" y2="' + r1(j.cheville[1]) + '" stroke-width="' + r1(p.jambe * 0.75) + '" stroke-linecap="round" class="fig-membre"/>';
      s += '<ellipse cx="' + r1(j.cheville[0] + c * 5) + '" cy="' + r1(p.piY) + '" rx="' + r1(p.jambe * 0.55) + '" ry="5"/>';
    });
    s += '<path d="' + d + '"/>';
    s += '</g>';
    if (genre === 'femme') {
      // foulard (moussor) noué sur la tête
      var t = p.teteY, r = p.teteR;
      s += '<path class="fig-foulard" d="M' + pt(100 - r - 1, t + 1) + ' Q' + pt(100 - r - 2, t - r - 10) + ' ' + pt(100, t - r - 9) +
        ' Q' + pt(100 + r + 6, t - r - 9) + ' ' + pt(100 + r + 1, t + 1) + ' Q' + pt(100, t - r * 0.35) + ' ' + pt(100 - r - 1, t + 1) + ' Z"/>';
      s += '<ellipse class="fig-foulard" cx="' + r1(100 + r * 0.55) + '" cy="' + r1(t - r - 8) + '" rx="7" ry="5"/>';
    }
    return s;
  }

  function habit(p, forme) {
    var d = '';
    if (forme === 'boubou') d = 'M' + pt(100 - p.epL - 2, p.epY) + ' L' + pt(100 - p.epL - 32, p.chY - 4) + ' L' + pt(100 + p.epL + 32, p.chY - 4) + ' L' + pt(100 + p.epL + 2, p.epY) + ' Z';
    if (forme === 'robe') d = 'M' + pt(100 - p.epL + 3, p.epY) + ' L' + pt(100 - p.poL, p.poY) + ' L' + pt(100 - p.taL, p.taY) + ' L' + pt(100 - p.haL - 14, p.geY + 20) +
      ' L' + pt(100 + p.haL + 14, p.geY + 20) + ' L' + pt(100 + p.taL, p.taY) + ' L' + pt(100 + p.poL, p.poY) + ' L' + pt(100 + p.epL - 3, p.epY) + ' Z';
    if (forme === 'jupe') d = 'M' + pt(100 - p.taL, p.taY) + ' L' + pt(100 - p.haL - 12, p.geY + 22) + ' L' + pt(100 + p.haL + 12, p.geY + 22) + ' L' + pt(100 + p.taL, p.taY) + ' Z';
    if (forme === 'haut') d = 'M' + pt(100 - p.epL, p.epY) + ' L' + pt(100 - p.poL - 2, p.poY) + ' L' + pt(100 - p.haL - 5, p.haY + 18) + ' L' + pt(100 + p.haL + 5, p.haY + 18) +
      ' L' + pt(100 + p.poL + 2, p.poY) + ' L' + pt(100 + p.epL, p.epY) + ' Z';
    return d ? '<path class="fig-habit" d="' + d + '"/>' : '';
  }

  // Ruban autour du corps : dos en pointillés (arc du haut), devant plein et gradué (arc du bas)
  function tour(cx, y, rx) {
    var ry = Math.max(3, rx * 0.2), a = pt(cx - rx, y), b = pt(cx + rx, y);
    return '<path class="fig-dos" d="M' + a + ' A' + r1(rx) + ',' + r1(ry) + ' 0 0 1 ' + b + '"/>' +
      '<path class="fig-ruban" d="M' + a + ' A' + r1(rx) + ',' + r1(ry) + ' 0 0 0 ' + b + '"/>' +
      '<path class="fig-graduation" d="M' + a + ' A' + r1(rx) + ',' + r1(ry) + ' 0 0 0 ' + b + '"/>';
  }
  function longueur(points) {
    var l = points.map(function (q) { return pt(q[0], q[1]); }).join(' ');
    var a = points[0], z = points[points.length - 1];
    return '<polyline class="fig-ruban" points="' + l + '"/><polyline class="fig-graduation" points="' + l + '"/>' +
      '<circle class="fig-bout" cx="' + r1(a[0]) + '" cy="' + r1(a[1]) + '" r="4"/><circle class="fig-bout" cx="' + r1(z[0]) + '" cy="' + r1(z[1]) + '" r="4"/>';
  }
  function guide(a, b) { return '<line class="fig-guide" x1="' + r1(a[0]) + '" y1="' + r1(a[1]) + '" x2="' + r1(b[0]) + '" y2="' + r1(b[1]) + '"/>'; }

  function ruban(p, cle) {
    var b = bras(p, 1), j = jambe(p, 1), x;
    switch (cle) {
      case 'cou': return tour(100, p.couY - 3, p.couL + 3);
      case 'epaule': return guide([100 - p.epL, p.epY + 1], [100 - p.epL, p.epY - 13]) + guide([100 + p.epL, p.epY + 1], [100 + p.epL, p.epY - 13]) +
        longueur([[100 - p.epL, p.epY - 13], [100 + p.epL, p.epY - 13]]);
      case 'poitrine': return tour(100, p.poY - 3, p.poL + 4);
      case 'sousPoitrine': return tour(100, p.spY, p.spL + 4);
      case 'hauteurPoitrine': return longueur([[100 - p.couL - 5, p.epY - 3], [100 - p.poL * 0.5, p.poY + 3]]);
      case 'taille': return tour(100, p.taY, p.taL + 4);
      case 'hanches': return tour(100, p.haY, p.haL + 4);
      case 'longueurManche': return longueur([[b.epaule[0] + 8, b.epaule[1] - 8], [b.coude[0] + 11, b.coude[1]], [b.poignet[0] + 11, b.poignet[1]]]);
      case 'tourBras': x = interp(b.epaule, b.coude, 0.38); return tour(x[0], x[1], p.bras / 2 + 3);
      case 'poignet': return tour(b.poignet[0], b.poignet[1] - 3, p.bras / 2 + 2);
      case 'longueurHaut': return habit(p, 'haut') + longueur([[100 + p.couL + 6, p.epY - 4], [100 + p.couL + 6, p.haY + 18]]);
      case 'longueurBoubou': return habit(p, 'boubou') + longueur([[100 + p.couL + 6, p.epY - 4], [100 + p.couL + 6, p.chY - 4]]);
      case 'longueurRobe': return habit(p, 'robe') + longueur([[100 + p.couL + 6, p.epY - 4], [100 + p.couL + 6, p.geY + 20]]);
      case 'longueurJupe': x = 100 + p.haL + 16;
        return habit(p, 'jupe') + guide([100 + p.taL, p.taY], [x, p.taY]) + longueur([[x, p.taY], [x, p.geY + 22]]);
      case 'longueurPantalon': x = 100 + p.haL + 12;
        return guide([100 + p.taL, p.taY], [x, p.taY]) + guide([j.cheville[0] + 6, p.chY], [x, p.chY]) + longueur([[x, p.taY], [x, p.chY]]);
      case 'entrejambe': return longueur([[100, p.enY + 3], [100, p.chY]]);
      case 'cuisse': x = interp(j.haut, j.genou, 0.22); return tour(x[0], x[1], p.jambe / 2 + 3);
      case 'bas': return tour(j.cheville[0], p.chY - 5, p.jambe * 0.38 + 3);
    }
    return '';
  }

  // Dessin complet ; « titre » sert de texte alternatif
  function dessin(cle, genre, titre) {
    var p = g(genre);
    return '<svg class="figure" viewBox="0 0 200 320" role="img" aria-label="' + String(titre || 'Silhouette').replace(/"/g, '&quot;') + '" focusable="false">' +
      corps(p, genre) + ruban(p, cle) + '</svg>';
  }
  // Silhouette sans ruban (choix du modèle)
  function silhouette(genre, titre) { return dessin(null, genre, titre); }

  var CTFig = { dessin: dessin, silhouette: silhouette, PARAMS: P };
  if (typeof module === 'object' && module.exports) module.exports = CTFig;
  else racine.CTFig = CTFig;
})(typeof self !== 'undefined' ? self : this);
