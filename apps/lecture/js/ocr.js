/* Lecture Facile — lire le texte d'une photo, entièrement sur le téléphone (Tesseract.js, licence Apache 2.0).
   Les fichiers du lecteur (environ 3,7 Mo) ne sont téléchargés qu'à la première utilisation, puis gardés hors ligne.
   Aucune image n'est envoyée sur Internet. */
(function () {
  'use strict';
  var DOSSIER = 'vendor/tesseract/';
  function abs(chemin) { return new URL(chemin, location.href).href; }
  // Le navigateur sait-il faire du calcul « SIMD » en WebAssembly ? (version plus rapide du lecteur)
  function simd() {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
    catch (e) { return false; }
  }
  var chargement = null;
  function chargerScript() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (chargement) return chargement;
    chargement = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = DOSSIER + 'tesseract.min.js';
      s.onload = function () { if (window.Tesseract) ok(window.Tesseract); else ko(new Error('chargement')); };
      s.onerror = function () { chargement = null; s.remove(); ko(new Error('chargement')); };
      document.head.appendChild(s);
    });
    return chargement;
  }
  // Photo → image en niveaux de gris, à une taille raisonnable pour un téléphone modeste
  function preparer(fichier) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var l = img.naturalWidth, h = img.naturalHeight, max = 2200, min = 1100;
        var k = Math.min(1, max / Math.max(l, h));
        if (Math.max(l, h) * k < min) k = min / Math.max(l, h);
        var c = document.createElement('canvas');
        c.width = Math.round(l * k); c.height = Math.round(h * k);
        var x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        try {
          var d = x.getImageData(0, 0, c.width, c.height), p = d.data, mini = 255, maxi = 0, i, g;
          for (i = 0; i < p.length; i += 4) { g = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000; p[i] = g; if (g < mini) mini = g; if (g > maxi) maxi = g; }
          var e = Math.max(1, maxi - mini);
          for (i = 0; i < p.length; i += 4) { g = (p[i] - mini) * 255 / e; p[i] = p[i + 1] = p[i + 2] = g; }
          x.putImageData(d, 0, 0);
        } catch (er) { /* image protégée : on garde les couleurs */ }
        URL.revokeObjectURL(url);
        ok(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image')); };
      img.src = url;
    });
  }
  var ETAPES = { 'loading tesseract core': [0, 25, 'Préparation du lecteur…'], 'initializing tesseract': [25, 30, 'Préparation du lecteur…'],
    'loading language traineddata': [30, 45, 'Chargement du français…'], 'initializing api': [45, 50, 'Préparation du lecteur…'],
    'recognizing text': [50, 100, 'Lecture de la photo…'] };
  // progres(pourcent, message)
  function lire(fichier, progres) {
    progres = progres || function () {};
    progres(2, 'Préparation de la photo…');
    var worker = null;
    return Promise.all([preparer(fichier), chargerScript()]).then(function (r) {
      var image = r[0], T = r[1];
      progres(5, 'Préparation du lecteur…');
      return T.createWorker('fra', 1, {
        workerPath: abs(DOSSIER + 'worker.min.js'),
        corePath: abs(DOSSIER + (simd() ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js')),
        langPath: abs(DOSSIER + 'lang'),
        workerBlobURL: false, cacheMethod: 'none', gzip: true,
        logger: function (m) {
          var e = ETAPES[m && m.status];
          if (e) progres(Math.round(e[0] + (e[1] - e[0]) * (m.progress || 0)), e[2]);
        },
        errorHandler: function () {}
      }).then(function (w) { worker = w; return w.recognize(image); });
    }).then(function (res) {
      progres(100, 'Terminé');
      var texte = res && res.data && res.data.text || '';
      return worker.terminate().catch(function () {}).then(function () { return texte; });
    }).catch(function (e) {
      if (worker) worker.terminate().catch(function () {});
      throw e;
    });
  }
  window.OCR = { disponible: !!(window.Worker && window.WebAssembly && window.HTMLCanvasElement), lire: lire, preparer: preparer };
})();
