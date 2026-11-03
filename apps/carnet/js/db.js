/* Carnet Boutique — stockage dans le téléphone (IndexedDB). Rien ne quitte le téléphone. */
(function () {
  'use strict';
  var NOM = 'carnet-boutique', VERSION = 1, MAGASINS = ['clients', 'ops', 'produits', 'ardoise'];
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
        MAGASINS.forEach(function (m) { if (!db.objectStoreNames.contains(m)) db.createObjectStore(m, { keyPath: 'id' }); });
      };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); ouverture = null; };
        ok(db);
      };
      r.onerror = function () { ouverture = null; ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error("Fermez les autres onglets de l'application puis réessayez.")); };
    });
    return ouverture;
  }
  // Exécute fn(magasins) dans une transaction ; résout quand l'écriture est durable
  function transaction(noms, mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(noms, mode), m = {}, res;
        [].concat(noms).forEach(function (n) { m[n] = tx.objectStore(n); });
        tx.oncomplete = function () { ok(res); };
        tx.onerror = function () { ko(tx.error); };
        tx.onabort = function () { ko(tx.error || new Error('Opération annulée.')); };
        res = fn(m);
      });
    });
  }
  function requete(r) { return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; }); }

  window.DB = {
    MAGASINS: MAGASINS,
    ouvrir: ouvrir,
    lire: function (magasin, cle) { return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).get(cle)); }); },
    tout: function (magasin) { return ouvrir().then(function (db) { return requete(db.transaction(magasin).objectStore(magasin).getAll()); }); },
    toutKv: function () {
      return ouvrir().then(function (db) {
        return new Promise(function (ok, ko) {
          var res = {}, s = db.transaction('kv').objectStore('kv'), c = s.openCursor();
          c.onsuccess = function () { var cur = c.result; if (cur) { res[cur.key] = cur.value; cur.continue(); } else ok(res); };
          c.onerror = function () { ko(c.error); };
        });
      });
    },
    mettre: function (magasin, valeur, cle) {
      return transaction(magasin, 'readwrite', function (m) { if (cle === undefined) m[magasin].put(valeur); else m[magasin].put(valeur, cle); });
    },
    effacer: function (magasin, cle) { return transaction(magasin, 'readwrite', function (m) { m[magasin].delete(cle); }); },
    // Plusieurs écritures d'un coup : [[magasin, valeur, cle?]] ou ['-', magasin, cle] pour effacer
    lot: function (ops) {
      var noms = [];
      ops.forEach(function (o) { var n = o[0] === '-' ? o[1] : o[0]; if (noms.indexOf(n) < 0) noms.push(n); });
      return transaction(noms, 'readwrite', function (m) {
        ops.forEach(function (o) {
          if (o[0] === '-') m[o[1]].delete(o[2]);
          else if (o[2] === undefined) m[o[0]].put(o[1]);
          else m[o[0]].put(o[1], o[2]);
        });
      });
    },
    // Restauration : remplace le carnet en une seule transaction (le pass et le code restent)
    remplacer: function (d) {
      return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) {
        MAGASINS.forEach(function (n) { m[n].clear(); (d[n] || []).forEach(function (x) { m[n].put(x); }); });
        if (d.reglages) m.kv.put(d.reglages, 'reglages');
      });
    },
    toutEffacer: function () {
      return transaction(['kv'].concat(MAGASINS), 'readwrite', function (m) { m.kv.clear(); MAGASINS.forEach(function (n) { m[n].clear(); }); });
    }
  };
})();
