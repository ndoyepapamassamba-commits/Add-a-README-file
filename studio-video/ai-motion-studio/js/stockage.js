/* MASSAMBA AI MOTION STUDIO — stockage et format de projet (22/10/2026).
 * Où sont les données :
 *   - navigateur (IndexedDB « massamba-ai-motion ») : médias (images, vidéos générées, audio), projet en cours, historique
 *     des tâches — sur CET ordinateur seulement ;
 *   - fichier projet (.json) : tout le projet, médias compris (encodés), pour le rouvrir ailleurs ;
 *   - chez les fournisseurs : rien n'est gardé par l'application ; leurs URL temporaires sont rapatriées tout de suite.
 * Jamais de clé ni de jeton dans le stockage ni dans le fichier projet (filtre `sansSecrets`).
 * Format v3 ; les projets v2 de MASSAMBA Motion Studio 2 sont migrés à l'ouverture (`migrer`). */
(function (racine) {
  'use strict';
  var FORMAT = 'massamba-ai-motion-studio', VERSION = 3;
  var CLES_INTERDITES = /^(jeton|token|cle|clé|key|apikey|api_key|secret|password|motdepasse|authorization|hf_token)$/i;

  /** supprime récursivement tout champ dont le nom évoque un secret (défense en profondeur). */
  function sansSecrets(o) {
    if (Array.isArray(o)) return o.map(sansSecrets);
    if (o && typeof o === 'object' && !(typeof Blob !== 'undefined' && o instanceof Blob)) {
      var r = {}; for (var k in o) { if (CLES_INTERDITES.test(k)) continue; r[k] = sansSecrets(o[k]); } return r;
    }
    return o;
  }

  var REGLAGES_DEFAUT = { aspect: '16:9', quality: 1, fps: 30, bitrate: 12000000, grade: 'cinema', fit: 'cover', vignette: 0.35, grain: 0.08,
    dust: 0.4, bloom: 0, shake: 0, letter: 0, audio: { vol: 0.6, fadeIn: 0.5, fadeOut: 0.8, volVoice: 0.9, gen: 'none', volGen: 0.18 } };

  /**
   * migre n'importe quel projet connu vers le format v3. Accepte : v3, v2 de Motion Studio 2 ({v:2, settings, media,
   * clips, texts}), ou un projet sans version qui possède un tableau `clips`. Renvoie { projet, notes }.
   */
  function migrer(d) {
    if (!d || typeof d !== 'object') throw new Error('Fichier projet illisible.');
    var notes = [];
    if (d.format === FORMAT && d.v === VERSION) return { projet: d, notes: notes };
    if (d.format === FORMAT && d.v > VERSION) throw new Error('Projet créé par une version plus récente (v' + d.v + ').');
    if (!Array.isArray(d.clips)) throw new Error('Ce fichier n’est pas un projet MASSAMBA (pas de liste de plans).');
    var st = d.settings || {};
    var reglages = JSON.parse(JSON.stringify(REGLAGES_DEFAUT));
    for (var k in st) if (k !== 'audio' && st[k] != null) reglages[k] = st[k];
    if (st.audio) for (var a in st.audio) reglages.audio[a] = st.audio[a];
    var medias = (d.media || []).map(function (m) {
      return { id: m.id, nom: m.name || m.nom || 'image', type: 'image', origine: 'importe', data: m.data || null,
        note: 'Ancien format v2 : seule une vignette basse définition avait été enregistrée.' };
    });
    if (medias.length) notes.push(medias.length + ' image(s) de l’ancien format : vignettes basse définition (Motion Studio 2 ne gardait que des miniatures). Réimportez les originaux pour un export net.');
    var clips = d.clips.map(function (c) {
      return Object.assign({ type: 'image', debutSource: 0, vol: 1, muet: false, kf: [] }, c, { kf: c.kf || [] });
    });
    notes.push('Projet v' + (d.v || 1) + ' migré au format v3 (' + clips.length + ' plan(s), ' + (d.texts || []).length + ' texte(s)).');
    return { projet: { format: FORMAT, v: VERSION, nom: d.nom || 'Projet importé', creeLe: Date.now(), majLe: Date.now(), reglages: reglages,
      medias: medias, clips: clips, texts: d.texts || [], sousTitres: [], pistesAudio: [], scenes: [], personnages: [], taches: [] }, notes: notes };
  }

  // ------------------------------------------------------------------ IndexedDB
  var BASE = 'massamba-ai-motion', VER = 1, dbp = null;
  function ouvrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB indisponible'));
      var r = indexedDB.open(BASE, VER);
      r.onupgradeneeded = function () { var db = r.result; ['medias', 'etat'].forEach(function (s) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function op(store, mode, fn) {
    return ouvrir().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(store, mode), s = tx.objectStore(store), q = fn(s);
        tx.oncomplete = function () { res(q && q.result); }; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  var idb = {
    mettre: function (store, cle, val) { return op(store, 'readwrite', function (s) { return s.put(val, cle); }); },
    lire: function (store, cle) { return op(store, 'readonly', function (s) { return s.get(cle); }); },
    retirer: function (store, cle) { return op(store, 'readwrite', function (s) { return s.delete(cle); }); },
    cles: function (store) { return op(store, 'readonly', function (s) { return s.getAllKeys(); }); }
  };

  function blobVersDataUrl(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(b); }); }
  function dataUrlVersBlob(u) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(u || ''); if (!m) return null;
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] || 'application/octet-stream' });
  }

  var API = { FORMAT: FORMAT, VERSION: VERSION, REGLAGES_DEFAUT: REGLAGES_DEFAUT, migrer: migrer, sansSecrets: sansSecrets, idb: idb,
    blobVersDataUrl: blobVersDataUrl, dataUrlVersBlob: dataUrlVersBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.stockage = API; }
})(typeof self !== 'undefined' ? self : this);
