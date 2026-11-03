/* ColisPreuve — photos : réduction dans le navigateur (1600 px au plus, JPEG, moins de 1,2 Mo) avant l'envoi. */
(function (racine) {
  'use strict';
  var MAX_OCTETS = 1200000;
  function octets(dataUrl) { var i = dataUrl.indexOf(','); return Math.floor((dataUrl.length - i - 1) * 3 / 4); }
  function chargerImage(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () { ok({ source: img, l: img.naturalWidth, h: img.naturalHeight, fin: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image illisible')); };
      img.src = url;
    });
  }
  function decoder(fichier) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(fichier, { imageOrientation: 'from-image' })
        .then(function (b) { return { source: b, l: b.width, h: b.height, fin: function () { if (b.close) b.close(); } }; })
        .catch(function () { return chargerImage(fichier); });
    }
    return chargerImage(fichier);
  }
  function dessiner(img, cote, qualite) {
    var r = Math.min(1, cote / Math.max(img.l, img.h));
    var w = Math.max(1, Math.round(img.l * r)), h = Math.max(1, Math.round(img.h * r));
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img.source, 0, 0, w, h);
    var url = c.toDataURL('image/jpeg', qualite);
    c.width = c.height = 1; // libère la mémoire tout de suite (téléphones modestes)
    return url;
  }
  // Fichier (appareil photo ou galerie) → data:image/jpeg;base64,…
  function reduire(fichier, cote) {
    return decoder(fichier).then(function (img) {
      try {
        var tailles = [cote || 1600, 1280, 1024], qualites = [0.82, 0.7, 0.58];
        for (var i = 0; i < tailles.length; i++) {
          for (var j = 0; j < qualites.length; j++) {
            var url = dessiner(img, tailles[i], qualites[j]);
            if (octets(url) <= MAX_OCTETS) return url;
          }
        }
        return dessiner(img, 800, 0.6);
      } finally { img.fin(); }
    });
  }
  // Image (data URL ou Blob) réduite pour le PDF
  function miniature(src, cote) {
    var p = typeof src === 'string' ? new Promise(function (ok, ko) {
      var im = new Image();
      im.onload = function () { ok({ source: im, l: im.naturalWidth, h: im.naturalHeight, fin: function () {} }); };
      im.onerror = function () { ko(new Error('image illisible')); };
      im.src = src;
    }) : decoder(src);
    return p.then(function (img) {
      try { return { url: dessiner(img, cote || 900, 0.72), l: img.l, h: img.h }; } finally { img.fin(); }
    });
  }
  racine.CPPhoto = { reduire: reduire, miniature: miniature, octets: octets };
})(typeof self !== 'undefined' ? self : this);
