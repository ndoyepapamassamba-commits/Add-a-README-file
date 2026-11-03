/* Rendez-vous Pro — stockage du téléphone (IndexedDB, magasin clé → valeur).
   Si le navigateur refuse IndexedDB (navigation privée), les données restent en mémoire le temps de la visite. */
(function () {
  'use strict';
  var NOM = 'rendez-vous-pro', VERSION = 1;
  var ouverture = null, memoire = {}, enMemoire = false;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('indisponible'));
      var r;
      try { r = indexedDB.open(NOM, VERSION); } catch (e) { return ko(e); }
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = function () { var db = r.result; db.onversionchange = function () { db.close(); ouverture = null; }; ok(db); };
      r.onerror = function () { ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de l\'application puis réessayez.')); };
    }).catch(function (e) { enMemoire = true; throw e; });
    return ouverture;
  }
  function tx(mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var t = db.transaction('kv', mode), res;
        t.oncomplete = function () { ok(res && res.result); };
        t.onerror = function () { ko(t.error); };
        t.onabort = function () { ko(t.error || new Error('Écriture annulée (mémoire du téléphone pleine ?).')); };
        res = fn(t.objectStore('kv'));
      });
    });
  }
  function copie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  window.DB = {
    lire: function (cle) {
      return tx('readonly', function (s) { return s.get(cle); }).catch(function () { return copie(memoire[cle]); });
    },
    mettre: function (cle, valeur) {
      memoire[cle] = copie(valeur);
      return tx('readwrite', function (s) { s.put(valeur, cle); }).catch(function (e) { if (!enMemoire) throw e; });
    },
    effacer: function (cle) {
      delete memoire[cle];
      return tx('readwrite', function (s) { s.delete(cle); }).catch(function (e) { if (!enMemoire) throw e; });
    },
    cles: function () {
      return tx('readonly', function (s) { return s.getAllKeys(); }).catch(function () { return Object.keys(memoire); });
    },
    toutEffacer: function () {
      memoire = {};
      return tx('readwrite', function (s) { s.clear(); }).catch(function (e) { if (!enMemoire) throw e; });
    },
    enMemoire: function () { return enMemoire; },
    persister: function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* facultatif */ } }
  };
})();
