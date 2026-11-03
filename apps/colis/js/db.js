/* ColisPreuve — stockage sur le téléphone (IndexedDB), avec repli en mémoire si le navigateur le refuse.
   Magasins : colis (colis du vendeur, avec leurs liens secrets), liens (liens livreur / client ouverts ici),
   file (actions en attente d'envoi, dans l'ordre), kv (réglages, pass, compteurs). */
(function (racine) {
  'use strict';
  var NOM = 'colispreuve', VERSION = 1;
  var memoire = { colis: {}, liens: {}, file: {}, kv: {} }, compteur = 0, persistant = true;
  var ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok) {
      var req;
      try { req = racine.indexedDB.open(NOM, VERSION); } catch (e) { persistant = false; return ok(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('colis')) db.createObjectStore('colis', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('liens')) db.createObjectStore('liens', { keyPath: 'cle' });
        if (!db.objectStoreNames.contains('file')) db.createObjectStore('file', { keyPath: 'n', autoIncrement: true });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { persistant = false; ok(null); };
      req.onblocked = function () { persistant = false; ok(null); };
    });
    return ouverture;
  }
  function tx(magasin, mode, action) {
    return ouvrir().then(function (db) {
      if (!db) return action(null);
      return new Promise(function (ok, ko) {
        var t = db.transaction(magasin, mode), s = t.objectStore(magasin), r = action(s);
        t.oncomplete = function () { ok(r && 'result' in r ? r.result : undefined); };
        t.onerror = function () { ko(t.error); };
        t.onabort = function () { ko(t.error); };
      });
    });
  }
  var DB = {
    persistant: function () { return ouvrir().then(function () { return persistant; }); },
    lire: function (magasin, cle) {
      return tx(magasin, 'readonly', function (s) { return s ? s.get(cle) : { result: copie(memoire[magasin][cle]) }; });
    },
    tout: function (magasin) {
      return tx(magasin, 'readonly', function (s) {
        if (s) return s.getAll();
        return { result: Object.keys(memoire[magasin]).map(function (k) { return copie(memoire[magasin][k]); }) };
      });
    },
    mettre: function (magasin, valeur, cle) {
      return tx(magasin, 'readwrite', function (s) {
        if (s) return cle === undefined ? s.put(valeur) : s.put(valeur, cle);
        if (magasin === 'file' && valeur.n == null) valeur.n = ++compteur;
        var k = cle !== undefined ? cle : magasin === 'colis' ? valeur.id : magasin === 'liens' ? valeur.cle : valeur.n;
        memoire[magasin][k] = copie(valeur);
        return { result: k };
      });
    },
    effacer: function (magasin, cle) {
      return tx(magasin, 'readwrite', function (s) { if (s) return s.delete(cle); delete memoire[magasin][cle]; return { result: undefined }; });
    }
  };
  function copie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  racine.DB = DB;
})(typeof self !== 'undefined' ? self : this);
