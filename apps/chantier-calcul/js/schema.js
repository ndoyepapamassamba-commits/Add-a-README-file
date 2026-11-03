/* Calcul Chantier — petits schémas des éléments (SVG dessiné par le programme), avec les cotes à saisir.
   Utilisable dans le navigateur (window.CCSchema) et dans Node. */
(function (racine) {
  'use strict';
  function t(x, y, s, ancre) { return '<text class="sch-texte" x="' + x + '" y="' + y + '"' + (ancre ? ' text-anchor="' + ancre + '"' : '') + '>' + s + '</text>'; }
  function cote(x1, y1, x2, y2) {
    return '<line class="sch-cote" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<circle class="sch-bout" cx="' + x1 + '" cy="' + y1 + '" r="1.8"/><circle class="sch-bout" cx="' + x2 + '" cy="' + y2 + '" r="1.8"/>';
  }
  function poly(cls, pts) { return '<polygon class="' + cls + '" points="' + pts + '"/>'; }
  function rect(cls, x, y, w, h) { return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>'; }
  function ligne(cls, x1, y1, x2, y2) { return '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>'; }
  function parpaings(x, y, w, h, pas) {
    var s = rect('sch-mur', x, y, w, h), rang = 0;
    for (var yy = y + pas / 2; yy < y + h - 0.1; yy += pas / 2) {
      s += ligne('sch-joint', x, yy, x + w, yy);
    }
    for (var y2 = y; y2 < y + h - 0.1; y2 += pas / 2) {
      var dec = (rang++ % 2) ? pas / 2 : 0;
      for (var xx = x + dec + pas; xx < x + w - 0.1; xx += pas) s += ligne('sch-joint', xx, y2, xx, Math.min(y + h, y2 + pas / 2));
    }
    return s;
  }
  var DESSINS = {
    isolees: function () {
      return ligne('sch-sol', 4, 50, 156, 50) +
        poly('sch-proprete', '26,83 124,83 144,71 46,71') + rect('sch-proprete', 26, 83, 98, 4) +
        poly('sch-beton-haut', '30,62 50,50 140,50 120,62') + rect('sch-beton', 30, 62, 90, 20) + poly('sch-beton-cote', '120,62 140,50 140,70 120,82') +
        ligne('sch-fer', 36, 76, 114, 76) + ligne('sch-fer', 124, 74, 136, 66) +
        rect('sch-beton', 78, 14, 14, 42) + poly('sch-beton-cote', '92,14 98,10 98,52 92,56') + poly('sch-beton-haut', '78,14 84,10 98,10 92,14') +
        cote(30, 96, 120, 96) + t(75, 106, 'longueur', 'middle') + cote(146, 52, 146, 72) + t(150, 46, 'largeur', 'end') +
        cote(20, 62, 20, 82) + t(16, 75, 'ép.', 'end');
    },
    filante: function () {
      return parpaings(36, 12, 96, 40, 16) + ligne('sch-sol', 4, 54, 156, 54) +
        poly('sch-beton-haut', '14,64 30,54 150,54 134,64') + rect('sch-beton', 14, 64, 120, 18) + poly('sch-beton-cote', '134,64 150,54 150,72 134,82') +
        rect('sch-proprete', 10, 82, 128, 4) + ligne('sch-fer', 18, 70, 130, 70) + ligne('sch-fer', 18, 77, 130, 77) +
        cote(14, 96, 134, 96) + t(74, 106, 'longueur totale', 'middle') + cote(154, 56, 154, 74) + t(156, 50, 'largeur', 'end') + cote(8, 64, 8, 82);
    },
    poteaux: function () {
      var s = rect('sch-beton', 66, 14, 22, 84) + poly('sch-beton-cote', '88,14 98,8 98,92 88,98') + poly('sch-beton-haut', '66,14 76,8 98,8 88,14');
      s += ligne('sch-fer', 71, 4, 71, 96) + ligne('sch-fer', 83, 4, 83, 96);
      for (var y = 20; y < 96; y += 11) s += ligne('sch-cadre', 68, y, 86, y);
      return s + cote(52, 14, 52, 98) + t(46, 60, 'h', 'end') + cote(66, 104, 88, 104) + t(110, 108, 'section', 'start') + t(112, 30, 'barres', 'start') + t(112, 42, '+ cadres', 'start');
    },
    chainage: function () {
      var s = parpaings(10, 42, 140, 54, 18) + rect('sch-beton', 10, 24, 140, 18) + poly('sch-beton-haut', '10,24 18,18 158,18 150,24') + poly('sch-beton-cote', '150,24 158,18 158,36 150,42');
      s += ligne('sch-fer', 12, 28, 148, 28) + ligne('sch-fer', 12, 38, 148, 38);
      for (var x = 20; x < 148; x += 14) s += ligne('sch-cadre', x, 26, x, 40);
      return s + cote(10, 10, 150, 10) + t(80, 8, 'longueur totale', 'middle') + t(156, 52, 'section', 'end');
    },
    dalle: function () {
      var s = poly('sch-beton-haut', '18,46 52,18 152,18 118,46') + rect('sch-beton', 18, 46, 100, 12) + poly('sch-beton-cote', '118,46 152,18 152,30 118,58');
      for (var i = 1; i < 6; i++) { var k = i / 6; s += ligne('sch-fer', 18 + 100 * k, 46, 52 + 100 * k, 18); }
      for (var j = 1; j < 4; j++) { var q = j / 4; s += ligne('sch-fer', 18 + 34 * q, 46 - 28 * q, 118 + 34 * q, 46 - 28 * q); }
      return s + cote(18, 70, 118, 70) + t(68, 82, 'longueur', 'middle') + cote(126, 58, 158, 32) + t(158, 52, 'largeur', 'end') + cote(10, 46, 10, 58) + t(8, 40, 'ép.', 'start');
    },
    mur: function () {
      return parpaings(16, 10, 132, 80, 16) + rect('sch-ouverture', 34, 46, 20, 44) + rect('sch-ouverture', 92, 30, 30, 22) +
        ligne('sch-cadre', 107, 30, 107, 52) + cote(16, 100, 148, 100) + t(82, 108, 'longueur', 'middle') + cote(8, 10, 8, 90) + t(4, 6, 'H', 'start') +
        t(44, 42, 'porte', 'middle') + t(107, 26, 'fenêtre', 'middle');
    },
    enduit: function () {
      return parpaings(20, 10, 84, 86, 16) + rect('sch-enduit', 104, 10, 9, 86) + rect('sch-enduit', 12, 10, 8, 86) +
        poly('sch-outil', '122,40 150,40 150,58 122,58') + rect('sch-outil-manche', 132, 58, 8, 22) +
        cote(104, 102, 113, 102) + t(118, 108, 'épaisseur', 'start');
    },
    carrelage: function () {
      var s = poly('sch-carreau', '14,90 50,30 150,30 114,90');
      for (var i = 1; i < 5; i++) { var k = i / 5; s += ligne('sch-joint-c', 14 + 100 * k, 90, 50 + 100 * k, 30); }
      for (var j = 1; j < 4; j++) { var q = j / 4; s += ligne('sch-joint-c', 14 + 36 * q, 90 - 60 * q, 114 + 36 * q, 90 - 60 * q); }
      return s + cote(14, 100, 114, 100) + t(64, 108, 'longueur', 'middle') + cote(122, 90, 156, 32) + t(158, 72, 'largeur', 'end');
    },
    peinture: function () {
      return rect('sch-mur', 14, 10, 110, 86) + poly('sch-peint', '14,10 92,10 72,96 14,96') +
        rect('sch-outil', 118, 20, 34, 14) + '<polyline class="sch-outil-trait" points="152,27 156,27 156,44 135,44 135,62"/>' + rect('sch-outil-manche', 131, 62, 8, 30) +
        cote(14, 101, 124, 101) + t(69, 110, 'longueur', 'middle') + cote(6, 10, 6, 96) + t(4, 6, 'H', 'start');
    }
  };
  function dessin(type, dims, titre) {
    var cle = type === 'fondation' ? ((dims && dims.forme) === 'filante' ? 'filante' : 'isolees') : type;
    var f = DESSINS[cle] || DESSINS.mur;
    return '<svg class="schema" viewBox="0 0 160 112" role="img" aria-label="' + String(titre || 'Schéma').replace(/"/g, '&quot;') + '" focusable="false">' + f() + '</svg>';
  }
  var CCSchema = { dessin: dessin };
  if (typeof module === 'object' && module.exports) module.exports = CCSchema;
  else racine.CCSchema = CCSchema;
})(typeof self !== 'undefined' ? self : this);
