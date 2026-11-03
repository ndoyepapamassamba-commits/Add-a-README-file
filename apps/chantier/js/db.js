/* Chantier Clair — stockage sur le téléphone (IndexedDB), avec repli en mémoire si le navigateur le refuse.
   Magasins : chantiers (chantiers créés ou importés par la personne qui paie, avec leurs liens secrets),
   liens (liens chef / témoin ouverts ici), file (actions en attente d'envoi, dans l'ordre), kv (réglages, pass, compteurs). */
(function (racine) {
  'use strict';
  var NOM = 'chantierclair', VERSION = 1;
  var CLES = { chantiers: 'id', liens: 'cle' };
  var memoire = { chantiers: {}, liens: {}, file: {}, kv: {} }, compteur = 0, persistant = true;
  var ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok) {
      var req;
      try { req = racine.indexedDB.open(NOM, VERSION); } catch (e) { persistant = false; return ok(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        Object.keys(CLES).forEach(function (m) { if (!db.objectStoreNames.contains(m)) db.createObjectStore(m, { keyPath: CLES[m] }); });
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
  function copie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
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
        var k = cle !== undefined ? cle : CLES[magasin] ? valeur[CLES[magasin]] : valeur.n;
        memoire[magasin][k] = copie(valeur);
        return { result: k };
      });
    },
    effacer: function (magasin, cle) {
      return tx(magasin, 'readwrite', function (s) { if (s) return s.delete(cle); delete memoire[magasin][cle]; return { result: undefined }; });
    }
  };
  racine.DB = DB;
})(typeof self !== 'undefined' ? self : this);
