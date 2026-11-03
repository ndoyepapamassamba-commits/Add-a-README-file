/* Tontine Claire — stockage sur le téléphone (IndexedDB, repli sur localStorage puis mémoire).
   On y garde : les tontines suivies (liens secrets, dernière copie lue), les numéros de téléphone (organisateur seulement,
   jamais envoyés), le pass et les réglages. */
(function (racine) {
  'use strict';
  var NOM = 'tontine-claire', MAGASIN = 'kv', ouverture = null, memoire = {};
  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      if (!racine.indexedDB) return ko(new Error('indexedDB absent'));
      var r;
      try { r = racine.indexedDB.open(NOM, 1); } catch (e) { return ko(e); }
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(MAGASIN)) r.result.createObjectStore(MAGASIN); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error || new Error('indexedDB')); };
      r.onblocked = function () { ko(new Error('indexedDB bloqué')); };
    }).catch(function () { return null; });
    return ouverture;
  }
  function lsLire(cle) { try { var v = localStorage.getItem(NOM + ':' + cle); return v == null ? memoire[cle] : JSON.parse(v); } catch (e) { return memoire[cle]; } }
  function lsMettre(cle, v) { memoire[cle] = v; try { localStorage.setItem(NOM + ':' + cle, JSON.stringify(v)); } catch (e) { /* mémoire seulement */ } }
  function lire(cle) {
    return ouvrir().then(function (db) {
      if (!db) return lsLire(cle);
      return new Promise(function (ok) {
        try {
          var g = db.transaction(MAGASIN).objectStore(MAGASIN).get(cle);
          g.onsuccess = function () { ok(g.result); };
          g.onerror = function () { ok(lsLire(cle)); };
        } catch (e) { ok(lsLire(cle)); }
      });
    });
  }
  function mettre(cle, v) {
    return ouvrir().then(function (db) {
      if (!db) { lsMettre(cle, v); return; }
      return new Promise(function (ok) {
        try {
          var tx = db.transaction(MAGASIN, 'readwrite');
          tx.objectStore(MAGASIN).put(v, cle);
          tx.oncomplete = function () { ok(); };
          tx.onerror = tx.onabort = function () { lsMettre(cle, v); ok(); };
        } catch (e) { lsMettre(cle, v); ok(); }
      });
    });
  }
  racine.TCDB = { lire: lire, mettre: mettre };
})(typeof self !== 'undefined' ? self : this);
