/* PouletPilot — stockage sur le téléphone (IndexedDB). Rien n'est envoyé sur Internet. */
(function () {
  'use strict';
  var NOM = 'pouletpilot', VERSION = 1;
  var ouverture = null, memoire = null;

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
        if (!db.objectStoreNames.contains('lots')) db.createObjectStore('lots', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('ops')) {
          var s = db.createObjectStore('ops', { keyPath: 'id' });
          s.createIndex('lotId', 'lotId', { unique: false });
        }
      };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); ouverture = null; };
        ok(db);
      };
      r.onerror = function () { ouverture = null; ko(r.error || new Error('Ouverture du stockage impossible.')); };
      r.onblocked = function () { ko(new Error('Fermez les autres onglets de PouletPilot puis réessayez.')); };
    }).catch(function (e) {
      // Navigateur sans stockage (mode privé ancien) : on garde les données en mémoire le temps de la visite
      memoire = memoire || { kv: {}, lots: {}, ops: {} };
      PPDB.temporaire = true;
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

  var PPDB = {
    temporaire: false,
    lire: function (cle) {
      return tx('kv', 'readonly', function (m) { return !m ? copie(memoire.kv[cle]) : req(m.kv.get(cle)); });
    },
    ecrire: function (cle, val) {
      return tx('kv', 'readwrite', function (m) { if (!m) memoire.kv[cle] = copie(val); else m.kv.put(val, cle); });
    },
    lots: function () {
      return tx('lots', 'readonly', function (m) { return !m ? valeurs(memoire.lots) : req(m.lots.getAll()); });
    },
    lot: function (id) {
      return tx('lots', 'readonly', function (m) { return !m ? copie(memoire.lots[id]) : req(m.lots.get(id)); });
    },
    mettreLot: function (lot) {
      lot.modifie = Date.now();
      return tx('lots', 'readwrite', function (m) { if (!m) memoire.lots[lot.id] = copie(lot); else m.lots.put(lot); });
    },
    supprimerLot: function (id) {
      return tx(['lots', 'ops'], 'readwrite', function (m) {
        if (!m) {
          delete memoire.lots[id];
          Object.keys(memoire.ops).forEach(function (k) { if (memoire.ops[k].lotId === id) delete memoire.ops[k]; });
          return;
        }
        m.lots.delete(id);
        var c = m.ops.index('lotId').openKeyCursor(IDBKeyRange.only(id));
        c.onsuccess = function () { var cur = c.result; if (cur) { m.ops.delete(cur.primaryKey); cur.continue(); } };
      });
    },
    ops: function (lotId) {
      return tx('ops', 'readonly', function (m) {
        if (!m) return valeurs(memoire.ops).filter(function (o) { return o.lotId === lotId; });
        return req(m.ops.index('lotId').getAll(IDBKeyRange.only(lotId)));
      });
    },
    toutesOps: function () {
      return tx('ops', 'readonly', function (m) { return !m ? valeurs(memoire.ops) : req(m.ops.getAll()); });
    },
    mettreOp: function (op) {
      op.modifie = Date.now();
      if (!op.cree) op.cree = op.modifie;
      return tx('ops', 'readwrite', function (m) { if (!m) memoire.ops[op.id] = copie(op); else m.ops.put(op); });
    },
    supprimerOp: function (id) {
      return tx('ops', 'readwrite', function (m) { if (!m) delete memoire.ops[id]; else m.ops.delete(id); });
    },
    // Remplace toutes les données (restauration d'une sauvegarde). Le pass n'est pas touché.
    remplacer: function (lots, ops, reglages) {
      return tx(['lots', 'ops', 'kv'], 'readwrite', function (m) {
        if (!m) {
          memoire.lots = {}; memoire.ops = {};
          lots.forEach(function (l) { memoire.lots[l.id] = copie(l); });
          ops.forEach(function (o) { memoire.ops[o.id] = copie(o); });
          if (reglages) memoire.kv.reglages = copie(reglages);
          return;
        }
        m.lots.clear(); m.ops.clear();
        lots.forEach(function (l) { m.lots.put(l); });
        ops.forEach(function (o) { m.ops.put(o); });
        if (reglages) m.kv.put(reglages, 'reglages');
      });
    },
    toutEffacer: function () {
      return tx(['lots', 'ops', 'kv'], 'readwrite', function (m) {
        if (!m) { memoire = { kv: {}, lots: {}, ops: {} }; return; }
        m.lots.clear(); m.ops.clear(); m.kv.clear();
      });
    }
  };
  window.PPDB = PPDB;
})();
