/* MASSAMBA AI MOTION STUDIO — consigne embarquée dans chaque vidéo (23/10/2026, « les prompts doivent être embarqués pour
 * chaque vidéo »). Écrit et relit les métadonnées DANS le fichier, sans ré-encoder une seule image :
 *  - MP4 : moov/udta/meta(hdlr « mdir »)/ilst — ©nam (titre), ©cmt (consigne), desc, ©too, ©day, et une clé libre « ---- »
 *    com.massamba/massamba portant le JSON complet. Les décalages de morceaux (stco/co64) situés après l'ancien moov sont
 *    recalés quand moov précède mdat (« fast start »). Une udta existante est remplacée : réembarquer est idempotent.
 *  - WebM/Matroska : élément Tags (SimpleTag TITLE, COMMENT, DESCRIPTION, ENCODER, DATE_RECORDED, MASSAMBA), inséré avant
 *    le premier Cluster quand aucun SeekHead ni Cues ne référence de position, sinon ajouté en fin de Segment.
 * Formats lus dans les normes publiques (ISO/IEC 14496-12, Matroska RFC 9559) et vérifiés par ffprobe (tests unitaires). */
(function (racine) {
  'use strict';
  var SCHEMA = 'massamba-consigne/1';
  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  function utf8(s) { return enc.encode(String(s == null ? '' : s)); }
  function latin1(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function concat(l) { var n = 0, i; for (i = 0; i < l.length; i++) n += l[i].length; var u = new Uint8Array(n), p = 0; for (i = 0; i < l.length; i++) { u.set(l[i], p); p += l[i].length; } return u; }
  function u32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function lit32(u, p) { return ((u[p] << 24) >>> 0) + (u[p + 1] << 16) + (u[p + 2] << 8) + u[p + 3]; }
  function ecrit32(u, p, v) { u[p] = (v >>> 24) & 255; u[p + 1] = (v >>> 16) & 255; u[p + 2] = (v >>> 8) & 255; u[p + 3] = v & 255; }
  function type4(u, p) { return String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]); }

  /** champs normalisés : titre, consigne (le prompt), description, outil, date, massamba (objet JSON complet). */
  function normaliser(c) {
    c = c || {};
    var m = Object.assign({ schema: SCHEMA }, c.massamba || {});
    if (c.consigne != null && m.consigne == null) m.consigne = c.consigne;
    return { titre: String(c.titre || '').slice(0, 250), consigne: String(c.consigne || ''), description: String(c.description || '').slice(0, 1000),
      outil: c.outil || 'MASSAMBA AI Motion Studio', date: c.date || new Date().toISOString(), json: JSON.stringify(m) };
  }

  // ------------------------------------------------------------------ MP4 (ISO BMFF)
  function boites(u, debut, fin) {
    var l = [], p = debut;
    while (p + 8 <= fin) {
      var t = lit32(u, p), ty = type4(u, p + 4), ent = 8;
      if (t === 1) { t = lit32(u, p + 8) * 4294967296 + lit32(u, p + 12); ent = 16; } else if (t === 0) t = fin - p;
      if (t < ent || p + t > fin) break;
      l.push({ type: ty, debut: p, taille: t, entete: ent }); p += t;
    }
    return l;
  }
  function boite(ty, contenu) { return concat([u32(8 + contenu.length), latin1(ty), contenu]); }
  function boitePleine(ty, contenu) { return boite(ty, concat([u32(0), contenu])); }
  function element(ty, texte) { return boite(ty, boite('data', concat([u32(1), u32(0), utf8(texte)]))); }
  function udtaMp4(c) {
    var A9 = String.fromCharCode(0xA9);
    var items = [element(A9 + 'nam', c.titre), element(A9 + 'cmt', c.consigne), element('desc', c.description), element(A9 + 'too', c.outil), element(A9 + 'day', c.date),
      boite('----', concat([boitePleine('mean', utf8('com.massamba')), boitePleine('name', utf8('massamba')), boite('data', concat([u32(1), u32(0), utf8(c.json)]))]))];
    var hdlr = boitePleine('hdlr', concat([u32(0), latin1('mdir'), latin1('appl'), u32(0), u32(0), new Uint8Array([0])]));
    return boite('udta', boitePleine('meta', concat([hdlr, boite('ilst', concat(items))])));
  }
  var CONTENEURS = { moov: 1, trak: 1, mdia: 1, minf: 1, stbl: 1, edts: 1, dinf: 1, mvex: 1 };
  /** recale les décalages de morceaux qui pointent au-delà de `seuil` (fin de l'ancien moov) de `delta` octets. */
  function recaler(u, debut, fin, seuil, delta) {
    boites(u, debut, fin).forEach(function (b) {
      var d = b.debut + b.entete, n, i, k;
      if (CONTENEURS[b.type]) recaler(u, d, b.debut + b.taille, seuil, delta);
      else if (b.type === 'stco') { n = lit32(u, d + 4); for (i = 0; i < n; i++) { k = d + 8 + 4 * i; var v = lit32(u, k); if (v >= seuil) ecrit32(u, k, v + delta); } }
      else if (b.type === 'co64') { n = lit32(u, d + 4); for (i = 0; i < n; i++) { k = d + 8 + 8 * i; var w = lit32(u, k) * 4294967296 + lit32(u, k + 4); if (w >= seuil) { w += delta; ecrit32(u, k, Math.floor(w / 4294967296)); ecrit32(u, k + 4, w % 4294967296); } } }
    });
  }
  function embarquerMp4(u, champs) {
    var c = normaliser(champs), top = boites(u, 0, u.length), moov = top.filter(function (b) { return b.type === 'moov'; })[0];
    if (!moov) throw new Error('MP4 sans boîte moov : consigne non embarquable.');
    var fils = boites(u, moov.debut + moov.entete, moov.debut + moov.taille).filter(function (b) { return b.type !== 'udta'; });
    var contenu = concat(fils.map(function (b) { return u.subarray(b.debut, b.debut + b.taille); }).concat([udtaMp4(c)]));
    var nouveau = concat([u32(8 + contenu.length), latin1('moov'), contenu]), delta = nouveau.length - moov.taille, finMoov = moov.debut + moov.taille;
    if (delta !== 0) recaler(nouveau, 8, nouveau.length, finMoov, delta);
    return concat([u.subarray(0, moov.debut), nouveau, u.subarray(finMoov)]);
  }
  function lireMp4(u) {
    var moov = boites(u, 0, u.length).filter(function (b) { return b.type === 'moov'; })[0]; if (!moov) return null;
    var udta = boites(u, moov.debut + moov.entete, moov.debut + moov.taille).filter(function (b) { return b.type === 'udta'; })[0]; if (!udta) return null;
    var meta = boites(u, udta.debut + udta.entete, udta.debut + udta.taille).filter(function (b) { return b.type === 'meta'; })[0]; if (!meta) return null;
    var ilst = boites(u, meta.debut + meta.entete + 4, meta.debut + meta.taille).filter(function (b) { return b.type === 'ilst'; })[0]; if (!ilst) return null;
    var r = {}, A9 = String.fromCharCode(0xA9);
    boites(u, ilst.debut + ilst.entete, ilst.debut + ilst.taille).forEach(function (it) {
      var sous = boites(u, it.debut + it.entete, it.debut + it.taille), data = sous.filter(function (b) { return b.type === 'data'; })[0]; if (!data) return;
      var val = dec.decode(u.subarray(data.debut + data.entete + 8, data.debut + data.taille));
      if (it.type === '----') { var nom = sous.filter(function (b) { return b.type === 'name'; })[0]; if (nom && dec.decode(u.subarray(nom.debut + nom.entete + 4, nom.debut + nom.taille)) === 'massamba') r.json = val; }
      else if (it.type === A9 + 'nam') r.titre = val; else if (it.type === A9 + 'cmt') r.consigne = val; else if (it.type === 'desc') r.description = val;
      else if (it.type === A9 + 'too') r.outil = val; else if (it.type === A9 + 'day') r.date = val;
    });
    return r;
  }

  // ------------------------------------------------------------------ WebM / Matroska (EBML)
  var ID = { EBML: 0x1A45DFA3, SEGMENT: 0x18538067, SEEKHEAD: 0x114D9B74, CLUSTER: 0x1F43B675, CUES: 0x1C53BB6B, TAGS: 0x1254C367, TAG: 0x7373, TARGETS: 0x63C0,
    SIMPLETAG: 0x67C8, TAGNAME: 0x45A3, TAGSTRING: 0x4487 };
  function longueurVint(o) { for (var i = 0; i < 8; i++) if (o & (0x80 >> i)) return i + 1; return 0; }
  function lireId(u, p) { var l = longueurVint(u[p]); if (!l || l > 4) return null; var v = 0; for (var i = 0; i < l; i++) v = v * 256 + u[p + i]; return { id: v, l: l }; }
  function lireTaille(u, p) {
    var l = longueurVint(u[p]); if (!l) return null;
    var v = u[p] & (0xFF >> l), plein = v === (0xFF >> l);
    for (var i = 1; i < l; i++) { v = v * 256 + u[p + i]; if (u[p + i] !== 255) plein = false; }
    return { v: v, l: l, inconnue: plein };
  }
  function ecrireTaille(n, l) {
    if (!l) { l = 1; while (n >= Math.pow(2, 7 * l) - 1) l++; }
    var u = new Uint8Array(l), v = n; for (var i = l - 1; i >= 0; i--) { u[i] = v % 256; v = Math.floor(v / 256); }
    u[0] |= (0x80 >> (l - 1)); return u;
  }
  function idOctets(id) { var o = []; while (id > 0) { o.unshift(id % 256); id = Math.floor(id / 256); } return new Uint8Array(o); }
  function elt(id, contenu) { return concat([idOctets(id), ecrireTaille(contenu.length), contenu]); }
  function tagsWebm(c) {
    var st = function (nom, val) { return elt(ID.SIMPLETAG, concat([elt(ID.TAGNAME, utf8(nom)), elt(ID.TAGSTRING, utf8(val))])); };
    return elt(ID.TAGS, elt(ID.TAG, concat([elt(ID.TARGETS, new Uint8Array(0)), st('TITLE', c.titre), st('COMMENT', c.consigne), st('DESCRIPTION', c.description),
      st('ENCODER', c.outil), st('DATE_RECORDED', c.date), st('MASSAMBA', c.json)])));
  }
  function segmentWebm(u) {
    var e = lireId(u, 0); if (!e || e.id !== ID.EBML) return null;
    var te = lireTaille(u, e.l), p = e.l + te.l + te.v, s = lireId(u, p); if (!s || s.id !== ID.SEGMENT) return null;
    var ts = lireTaille(u, p + s.l), d = p + s.l + ts.l;
    return { debut: p, tailleA: p + s.l, taille: ts, donnees: d, fin: ts.inconnue ? u.length : d + ts.v };
  }
  /** éléments de niveau 1 du Segment ; s'arrête sur une taille inconnue (Cluster en direct). */
  function niveau1(u, debut, fin) {
    var l = [], p = debut, complet = true;
    while (p < fin) {
      var i = lireId(u, p); if (!i) { complet = false; break; } var t = lireTaille(u, p + i.l); if (!t) { complet = false; break; }
      var e = { id: i.id, pos: p, donnees: p + i.l + t.l, inconnue: t.inconnue, fin: t.inconnue ? fin : p + i.l + t.l + t.v }; l.push(e);
      if (t.inconnue) { complet = false; break; } p = e.fin;
    }
    return { elements: l, complet: complet };
  }
  function vide(total) {   // élément Void (0xEC) d'une taille totale exacte
    if (total >= 2 && total - 2 < 127) return concat([new Uint8Array([0xEC]), ecrireTaille(total - 2, 1), new Uint8Array(total - 2)]);
    if (total >= 9) return concat([new Uint8Array([0xEC]), ecrireTaille(total - 9, 8), new Uint8Array(total - 9)]);
    return null;
  }
  function uint(v) { var o = []; do { o.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); return new Uint8Array(o); }
  function embarquerWebm(u, champs) {
    var c = normaliser(champs), seg = segmentWebm(u); if (!seg) throw new Error('WebM illisible : consigne non embarquable.');
    var tags = tagsWebm(c), n1 = niveau1(u, seg.donnees, seg.fin), el = n1.elements;
    var iClu = -1; for (var k = 0; k < el.length; k++) if (el[k].id === ID.CLUSTER) { iClu = k; break; }
    var avant = iClu < 0 ? el : el.slice(0, iClu), seek = avant.filter(function (e) { return e.id === ID.SEEKHEAD; })[0];
    var cues = el.some(function (e) { return e.id === ID.CUES; });
    if (iClu >= 0 && !seek && !cues) {
      // aucune position référencée (enregistrement MediaRecorder) : insertion avant le premier Cluster, anciennes Tags retirées
      var corps = [], q = seg.donnees, retire = 0;
      avant.filter(function (e) { return e.id === ID.TAGS; }).forEach(function (e) { corps.push(u.subarray(q, e.pos)); q = e.fin; retire += e.fin - e.pos; });
      corps.push(u.subarray(q, el[iClu].pos)); corps.push(tags); corps.push(u.subarray(el[iClu].pos, seg.fin));
      return concat([u.subarray(0, seg.tailleA), seg.taille.inconnue ? u.subarray(seg.tailleA, seg.donnees) : ecrireTaille(seg.taille.v - retire + tags.length, 8), concat(corps),
        seg.taille.inconnue ? new Uint8Array(0) : u.subarray(seg.fin)]);
    }
    // positions référencées (SeekHead, Cues) : rien ne bouge ; Tags neuves en fin de Segment, index mis à jour dans sa place
    var w = u.slice(0, seg.fin), dernier = el[el.length - 1];
    var coupe = n1.complet && dernier && dernier.id === ID.TAGS ? dernier.pos : seg.fin;   // Tags d'un passage précédent : remplacées
    el.forEach(function (e) { if (e.id === ID.TAGS && e.pos < coupe) { var v = vide(e.fin - e.pos); if (v) w.set(v, e.pos); } });   // anciennes Tags neutralisées
    if (seek) {
      var entrees = [], x = seek.donnees;
      while (x < seek.fin) {
        var i = lireId(u, x), t = lireTaille(u, x + i.l), d = x + i.l + t.l, f = d + t.v, idb = null, pos = null, y = d;
        while (y < f) { var j = lireId(u, y), s = lireTaille(u, y + j.l), dd = y + j.l + s.l;
          if (j.id === 0x53AB) idb = u.subarray(dd, dd + s.v); else if (j.id === 0x53AC) { pos = 0; for (var z = 0; z < s.v; z++) pos = pos * 256 + u[dd + z]; } y = dd + s.v; }
        if (idb) entrees.push({ idb: idb, pos: pos }); x = f;
      }
      var idTags = idOctets(ID.TAGS), estTags = function (b) { return b.length === 4 && b[0] === idTags[0] && b[1] === idTags[1] && b[2] === idTags[2] && b[3] === idTags[3]; };
      entrees = entrees.filter(function (e) { return !estTags(e.idb); }); entrees.push({ idb: idTags, pos: coupe - seg.donnees });
      var tete = elt(ID.SEEKHEAD, concat(entrees.map(function (e) { return elt(0x4DBB, concat([elt(0x53AB, e.idb), elt(0x53AC, uint(e.pos))])); })));
      var suivant = el.filter(function (e) { return e.pos === seek.fin && e.id === 0xEC; })[0], place = (suivant ? suivant.fin : seek.fin) - seek.pos, reste = place - tete.length;
      var bourre = reste === 0 ? new Uint8Array(0) : vide(reste);
      if (reste >= 0 && bourre) w.set(concat([tete, bourre]), seek.pos);
      // sinon : index laissé tel quel (les lecteurs qui balaient le fichier, dont lire(), trouvent quand même la consigne)
    }
    var tailleSeg = seg.taille.inconnue ? null : coupe - seg.donnees + tags.length;
    if (tailleSeg != null) { var ts = ecrireTaille(tailleSeg, seg.taille.l); if (ts.length !== seg.donnees - seg.tailleA) throw new Error('WebM : taille du Segment trop étroite.'); w.set(ts, seg.tailleA); }
    return concat([w.subarray(0, coupe), tags, u.subarray(seg.fin)]);
  }
  function lireTags(u, p, fin) {
    var r = {};
    (function parcourir(a, b) {
      while (a < b) {
        var i = lireId(u, a); if (!i) return; var t = lireTaille(u, a + i.l); if (!t || t.inconnue) return; var d = a + i.l + t.l, f = d + t.v; if (f > b) return;
        if (i.id === ID.TAG || i.id === ID.TAGS) parcourir(d, f);
        else if (i.id === ID.SIMPLETAG) {
          var nom = null, val = null, x = d;
          while (x < f) { var j = lireId(u, x); if (!j) break; var s = lireTaille(u, x + j.l); if (!s) break; var dd = x + j.l + s.l;
            if (j.id === ID.TAGNAME) nom = dec.decode(u.subarray(dd, dd + s.v)); else if (j.id === ID.TAGSTRING) val = dec.decode(u.subarray(dd, dd + s.v)); x = dd + s.v; }
          var cle = { TITLE: 'titre', COMMENT: 'consigne', DESCRIPTION: 'description', ENCODER: 'outil', DATE_RECORDED: 'date', MASSAMBA: 'json' }[nom];
          if (cle && val != null) r[cle] = val;
        }
        a = f;
      }
    })(p, fin);
    return r;
  }
  function lireWebm(u) {
    // les Tags peuvent être avant les Clusters ou en fin de fichier : on cherche la signature de l'élément et on la valide
    var r = null;
    for (var p = 0; p + 4 < u.length; p++) {
      if (u[p] === 0x12 && u[p + 1] === 0x54 && u[p + 2] === 0xC3 && u[p + 3] === 0x67) {
        var t = lireTaille(u, p + 4); if (!t || t.inconnue) continue; var d = p + 4 + t.l;
        if (d + t.v <= u.length) { var x = lireTags(u, d, d + t.v); if (x.json || x.consigne) r = x; }
      }
    }
    return r;
  }

  // ------------------------------------------------------------------ interface commune
  function nature(u) {
    if (u.length > 12 && type4(u, 4) === 'ftyp') return 'mp4';
    if (u.length > 4 && u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return 'webm';
    return null;
  }
  function embarquerOctets(u, champs) {
    var n = nature(u);
    if (n === 'mp4') return embarquerMp4(u, champs);
    if (n === 'webm') return embarquerWebm(u, champs);
    throw new Error('Format vidéo non reconnu : consigne non embarquée.');
  }
  function lireOctets(u) {
    var n = nature(u), r = n === 'mp4' ? lireMp4(u) : n === 'webm' ? lireWebm(u) : null;
    if (!r) return null;
    if (r.json) { try { r.massamba = JSON.parse(r.json); } catch (e) { r.massamba = null; } }
    return r;
  }
  /** Blob → Blob avec la consigne embarquée (même type MIME). */
  async function embarquer(blob, champs) {
    var u = new Uint8Array(await blob.arrayBuffer());
    return new Blob([embarquerOctets(u, champs)], { type: blob.type || (nature(u) === 'webm' ? 'video/webm' : 'video/mp4') });
  }
  /** lit la consigne embarquée d'un Blob (MP4 : boîte moov seule ; WebM : début et fin du fichier). */
  async function lire(blob) {
    var tete = new Uint8Array(await blob.slice(0, Math.min(blob.size, 64)).arrayBuffer()), n = nature(tete);
    if (n === 'mp4') {
      var p = 0;
      while (p + 8 <= blob.size) {
        var h = new Uint8Array(await blob.slice(p, p + 16).arrayBuffer()), t = lit32(h, 0), ty = type4(h, 4);
        if (t === 1) t = lit32(h, 8) * 4294967296 + lit32(h, 12); else if (t === 0) t = blob.size - p;
        if (t < 8) return null;
        if (ty === 'moov') { var m = new Uint8Array(await blob.slice(p, p + t).arrayBuffer()); var r = lireMp4(m); if (r && r.json) { try { r.massamba = JSON.parse(r.json); } catch (e) { r.massamba = null; } } return r; }
        p += t;
      }
      return null;
    }
    if (n === 'webm') {
      var debut = new Uint8Array(await blob.slice(0, Math.min(blob.size, 2 * 1048576)).arrayBuffer()), r1 = lireOctets(debut);
      if (r1) return r1;
      var fin = new Uint8Array(await blob.slice(Math.max(0, blob.size - 1048576)).arrayBuffer()); return lireOctets(fin);
    }
    return null;
  }

  var API = { SCHEMA: SCHEMA, embarquer: embarquer, lire: lire, embarquerOctets: embarquerOctets, lireOctets: lireOctets, nature: nature, normaliser: normaliser };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.meta = API; }
})(typeof self !== 'undefined' ? self : this);
