/* AccordAI — stockage du téléphone (IndexedDB) : accords et leurs liens secrets, photos en cache, réglages. */
(function () {
  'use strict';
  var NOM = 'accordai', VERSION = 1;
  var ouverture = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('Stockage indisponible sur ce navigateur.'));
      var r;
      try { r = indexedDB.open(NOM, VERSION); } catch (e) { ouverture = null; return ko(e); }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('dossiers')) db.createObjectStore('dossiers', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); ouverture = null; };
        ok(db);
      };
      r.onerror = function () { ouverture = null; ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de l\'application puis réessayez.')); };
    });
    return ouverture;
  }
  function requete(r) {
    return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; });
  }
  function ecrire(magasin, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(magasin, 'readwrite');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error || new Error('Écriture annulée (mémoire du téléphone pleine ?).')); };
        fn(tx.objectStore(magasin));
      });
    });
  }

  window.DB = {
    lire: function (magasin, cle) { return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).get(cle)); }); },
    tout: function (magasin) { return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).getAll()); }); },
    mettre: function (magasin, valeur, cle) { return ecrire(magasin, function (s) { if (cle === undefined) s.put(valeur); else s.put(valeur, cle); }); },
    effacer: function (magasin, cle) { return ecrire(magasin, function (s) { s.delete(cle); }); },
    // Efface les photos en cache d'un accord (clés « id/photo-N.jpg »)
    effacerPhotos: function (id) {
      return ecrire('photos', function (s) { s.delete(IDBKeyRange.bound(id + '/', id + '/￿')); });
    }
  };
})();
