/* Teranga — stockage sur le téléphone (IndexedDB). Rien n'est envoyé sur Internet.
   Magasins : kv (réglages, pass…), enr (tous les enregistrements, champ « type »), photos (images réduites). */
(function () {
  'use strict';
  var VERSION = 1;
  var NOM = 'teranga-app', ouverture = null, memoire = null;

  function ouvrir() {
    if (ouverture) return ouverture;
    ouverture = new Promise(function (ok, ko) {
      var idb;
      try { idb = window.indexedDB; } catch (e) { idb = null; }
      if (!idb) return ko(new Error('indisponible'));
      var r;
      try { r = idb.open(NOM, VERSION); } catch (e) { return ko(e); }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('enr')) db.createObjectStore('enr', { keyPath: 'id' }).createIndex('type', 'type', { unique: false });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); ouverture = null; };
        ok(db);
      };
      r.onerror = function () { ouverture = null; ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de l’application puis réessayez.')); };
    }).catch(function () {
      // Navigateur sans stockage (ancien mode privé) : données gardées en mémoire le temps de la visite
      memoire = memoire || { kv: {}, enr: {}, photos: {} };
      TDB.temporaire = true;
      return null;
    });
    return ouverture;
  }

  function tx(noms, mode, fn) {
    return ouvrir().then(function (db) {
      if (!db) return fn(null);
      return new Promise(function (ok, ko) {
        var t = db.transaction(noms, mode), res, m = {};
        [].concat(noms).forEach(function (k) { m[k] = t.objectStore(k); });
        t.oncomplete = function () { ok(res && res.__req ? res.__req.result : res); };
        t.onerror = function () { ko(t.error); };
        t.onabort = function () { ko(t.error || new Error('Opération annulée.')); };
        res = fn(m);
      });
    });
  }
  function req(r) { return { __req: r }; }
  function copie(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function valeurs(o) { return Object.keys(o).map(function (k) { return copie(o[k]); }); }

  var TDB = {
    temporaire: false,
    init: function (nom) { NOM = nom; ouverture = null; },
    lire: function (cle) { return tx('kv', 'readonly', function (m) { return !m ? copie(memoire.kv[cle]) : req(m.kv.get(cle)); }); },
    ecrire: function (cle, val) { return tx('kv', 'readwrite', function (m) { if (!m) memoire.kv[cle] = copie(val); else m.kv.put(val, cle); }); },
    tout: function () { return tx('enr', 'readonly', function (m) { return !m ? valeurs(memoire.enr) : req(m.enr.getAll()); }); },
    mettre: function (recs) {
      recs = [].concat(recs);
      var t = Date.now();
      recs.forEach(function (r) { r.modifie = t; if (!r.cree) r.cree = t; });
      return tx('enr', 'readwrite', function (m) { recs.forEach(function (r) { if (!m) memoire.enr[r.id] = copie(r); else m.enr.put(r); }); });
    },
    supprimer: function (ids) {
      ids = [].concat(ids);
      return tx(['enr', 'photos'], 'readwrite', function (m) {
        ids.forEach(function (id) { if (!m) { delete memoire.enr[id]; delete memoire.photos[id]; } else { m.enr.delete(id); m.photos.delete(id); } });
      });
    },
    photo: function (id) { return tx('photos', 'readonly', function (m) { return !m ? copie(memoire.photos[id]) : req(m.photos.get(id)); }); },
    photos: function () { return tx('photos', 'readonly', function (m) { return !m ? valeurs(memoire.photos) : req(m.photos.getAll()); }); },
    mettrePhoto: function (p) { return tx('photos', 'readwrite', function (m) { if (!m) memoire.photos[p.id] = copie(p); else m.photos.put(p); }); },
    supprimerPhoto: function (id) { return tx('photos', 'readwrite', function (m) { if (!m) delete memoire.photos[id]; else m.photos.delete(id); }); },
    // Remplace toutes les données (restauration). kv : objet {clé: valeur} à écrire ; garder : clés kv à conserver (le pass).
    remplacer: function (recs, kv, photos, garder) {
      return tx(['enr', 'kv', 'photos'], 'readwrite', function (m) {
        if (!m) {
          var gardes = {}; (garder || []).forEach(function (k) { if (k in memoire.kv) gardes[k] = memoire.kv[k]; });
          memoire.enr = {}; memoire.kv = gardes; memoire.photos = {};
          recs.forEach(function (r) { memoire.enr[r.id] = copie(r); });
          Object.keys(kv || {}).forEach(function (k) { memoire.kv[k] = copie(kv[k]); });
          (photos || []).forEach(function (p) { memoire.photos[p.id] = copie(p); });
          return;
        }
        m.enr.clear(); m.photos.clear();
        recs.forEach(function (r) { m.enr.put(r); });
        Object.keys(kv || {}).forEach(function (k) { m.kv.put(kv[k], k); });
        (photos || []).forEach(function (p) { m.photos.put(p); });
      });
    },
    toutEffacer: function (garder) {
      return tx(['enr', 'kv', 'photos'], 'readwrite', function (m) {
        if (!m) {
          var gardes = {}; (garder || []).forEach(function (k) { if (k in memoire.kv) gardes[k] = memoire.kv[k]; });
          memoire = { kv: gardes, enr: {}, photos: {} }; return;
        }
        m.enr.clear(); m.photos.clear();
        var c = m.kv.openCursor();
        c.onsuccess = function () { var cur = c.result; if (cur) { if ((garder || []).indexOf(cur.key) < 0) cur.delete(); cur.continue(); } };
      });
    }
  };
  window.TDB = TDB;
})();
