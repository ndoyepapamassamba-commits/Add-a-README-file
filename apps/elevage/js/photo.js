/* Carnet Élevage — photo d'un animal : réduite dans le téléphone et gardée seulement sur le téléphone. */
(function () {
  'use strict';
  function charger(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); };
      img.src = url;
    });
  }
  function versJPEG(img, max, qualite, carre) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var sx = 0, sy = 0, sw = w, sh = h;
    if (carre) { var c = Math.min(w, h); sx = (w - c) / 2; sy = (h - c) / 2; sw = sh = c; }
    var r = Math.min(1, max / Math.max(sw, sh));
    var cw = Math.max(1, Math.round(sw * r)), ch = Math.max(1, Math.round(sh * r));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    return cv.toDataURL('image/jpeg', qualite);
  }
  // → { grande: dataURL (≤ 800 px), mini: dataURL carrée (160 px) }
  function reduire(fichier) {
    if (!fichier || !/^image\//.test(fichier.type || 'image/')) return Promise.reject(new Error('Choisissez une photo.'));
    return charger(fichier).then(function (r) {
      try { return { grande: versJPEG(r.img, 800, 0.72, false), mini: versJPEG(r.img, 160, 0.7, true) }; }
      finally { URL.revokeObjectURL(r.url); }
    });
  }
  window.CEPhoto = { reduire: reduire };
})();
