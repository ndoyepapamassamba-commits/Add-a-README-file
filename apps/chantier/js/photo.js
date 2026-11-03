/* Chantier Clair — photos : réduction dans le navigateur (1600 px au plus, JPEG, moins de 1,2 Mo) avant l'envoi.
   Plusieurs photos d'une même action (jusqu'à 4) sont assemblées en une seule image : le serveur garde 30 photos par chantier. */
(function (racine) {
  'use strict';
  var MAX_OCTETS = 1200000;
  function octets(dataUrl) { var i = dataUrl.indexOf(','); return Math.floor((dataUrl.length - i - 1) * 3 / 4); }
  function chargerImage(src) {
    return new Promise(function (ok, ko) {
      var url = typeof src === 'string' ? src : URL.createObjectURL(src), img = new Image();
      img.onload = function () { ok({ source: img, l: img.naturalWidth, h: img.naturalHeight, fin: function () { if (typeof src !== 'string') URL.revokeObjectURL(url); } }); };
      img.onerror = function () { if (typeof src !== 'string') URL.revokeObjectURL(url); ko(new Error('image illisible')); };
      img.src = url;
    });
  }
  function decoder(fichier) {
    if (typeof fichier !== 'string' && typeof createImageBitmap === 'function') {
      return createImageBitmap(fichier, { imageOrientation: 'from-image' })
        .then(function (b) { return { source: b, l: b.width, h: b.height, fin: function () { if (b.close) b.close(); } }; })
        .catch(function () { return chargerImage(fichier); });
    }
    return chargerImage(fichier);
  }
  function toile(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return { c: c, g: g }; }
  function versJpeg(c, essais) {
    for (var i = 0; i < essais.length; i++) { var u = c.toDataURL('image/jpeg', essais[i]); if (octets(u) <= MAX_OCTETS) return u; }
    return null;
  }
  function dessiner(img, cote, qualite) {
    var r = Math.min(1, cote / Math.max(img.l, img.h));
    var t = toile(Math.max(1, Math.round(img.l * r)), Math.max(1, Math.round(img.h * r)));
    t.g.drawImage(img.source, 0, 0, t.c.width, t.c.height);
    var url = t.c.toDataURL('image/jpeg', qualite);
    t.c.width = t.c.height = 1; // libère la mémoire tout de suite (téléphones modestes)
    return url;
  }
  // Une photo → data:image/jpeg;base64,…
  function reduire(fichier, cote) {
    return decoder(fichier).then(function (img) {
      try {
        var tailles = [cote || 1600, 1280, 1024], qualites = [0.82, 0.7, 0.58];
        for (var i = 0; i < tailles.length; i++) for (var j = 0; j < qualites.length; j++) {
          var url = dessiner(img, tailles[i], qualites[j]);
          if (octets(url) <= MAX_OCTETS) return url;
        }
        return dessiner(img, 800, 0.6);
      } finally { img.fin(); }
    });
  }
  // 2 à 4 photos → une image assemblée (2 colonnes), chaque photo entière (sans recadrage) sur fond blanc
  function assembler(fichiers) {
    var l = Array.prototype.slice.call(fichiers || [], 0, 4);
    if (l.length <= 1) return l.length ? reduire(l[0]) : Promise.reject(new Error('aucune photo'));
    var CW = 800, CH = 600, G = 8, cols = 2, lignes = Math.ceil(l.length / 2);
    var t = toile(cols * CW + G, lignes * CH + (lignes - 1) * G);
    var i = 0;
    function suivante() {
      if (i >= l.length) return Promise.resolve();
      var k = i++;
      return decoder(l[k]).then(function (img) {
        try {
          var r = Math.min(CW / img.l, CH / img.h), w = Math.round(img.l * r), h = Math.round(img.h * r);
          var x = (k % 2) * (CW + G) + Math.round((CW - w) / 2), y = Math.floor(k / 2) * (CH + G) + Math.round((CH - h) / 2);
          t.g.drawImage(img.source, x, y, w, h);
        } finally { img.fin(); }
      }).then(suivante);
    }
    return suivante().then(function () {
      var url = versJpeg(t.c, [0.82, 0.72, 0.62, 0.52]);
      if (!url) { var r2 = toile(Math.round(t.c.width * 0.7), Math.round(t.c.height * 0.7)); r2.g.drawImage(t.c, 0, 0, r2.c.width, r2.c.height); url = r2.c.toDataURL('image/jpeg', 0.6); r2.c.width = r2.c.height = 1; }
      t.c.width = t.c.height = 1;
      return url;
    });
  }
  // Image (data URL ou Blob) réduite pour le PDF
  function miniature(src, cote) {
    return decoder(src).then(function (img) {
      try { return { url: dessiner(img, cote || 900, 0.72), l: img.l, h: img.h }; } finally { img.fin(); }
    });
  }
  racine.PHOTO = { reduire: reduire, assembler: assembler, miniature: miniature, octets: octets };
})(typeof self !== 'undefined' ? self : this);
