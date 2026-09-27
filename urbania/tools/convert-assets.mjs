// Convertit les exports SketchUp (JSON renvoyé par export_assets) en paquet binaire compressé pour le jeu.
// Usage : node convert-assets.mjs sortie.js export1.json [export2.json ...]
// Chaque export : { mats:[[nom, r, g, b, a]], assets:[{ name, faces:[[mat, nx, ny, nz, boucleExt, trou1, ...], ...] }] }
// Coordonnées en cm dans le repère du jeu (y vers le haut, façade avant vers +z).
import fs from 'fs';
import zlib from 'zlib';
import { ShapeUtils, Vector2 } from 'three';

const [,, outFile, ...inputs] = process.argv;
if(!outFile || !inputs.length){ console.error('usage : node convert-assets.mjs sortie.js export.json...'); process.exit(1); }

// rôle d'une matière selon son préfixe : W mur teinté, R toit teinté, A accent teinté, G vitrage, E enseigne lumineuse
const REF = { W:[226,216,198], R:[128,64,50], A:[58,92,72] };
const lum = c => .2126*c[0] + .7152*c[1] + .0722*c[2];
const ROLE_FIX = { A_base:0 }; // matières à préfixe réservé mais de couleur fixe
function roleOf(name){ if(name in ROLE_FIX) return ROLE_FIX[name]; const p = name.split('_')[0]; return { W:1, R:2, A:3, G:4, E:5 }[p] || 0; }

// modules empilables et services : emprise fixe [0, L] x [0, P] depuis l'origine SketchUp, sans décalage vertical
const FOOT = { a4_base:[18,16], a4_mid:[18,16], a4_top:[18,16], a5_base:[20,20], a5_mid:[20,20], a5_top:[20,20], ht_base:[28,22], ht_mid:[18,14], ht_top:[18,14],
  o2_base:[22,18], o2_mid:[22,18], o2_top:[22,18], o3_base:[24,24], o3_mid:[24,24], o3_top:[24,24],
  svc_coal:[48,40], svc_solar:[40,40], svc_pump:[16,24], svc_wtower:[16,16], svc_sewage:[16,16], svc_treat:[40,32], svc_landfill:[48,48], svc_inciner:[40,32], svc_recycle:[40,32],
  svc_clinic:[24,24], svc_hospital:[48,40], svc_cemetery:[40,40], svc_cremat:[32,24], svc_fire:[24,24], svc_police:[24,24] };
const mats = [], matIdx = new Map(), assets = new Map();
for(const file of inputs){
  let d = JSON.parse(fs.readFileSync(file, 'utf8')); if(d.result) d = d.result; if(d.data) d = d.data;
  const remap = d.mats.map(([name, r, g, b]) => { if(!matIdx.has(name)){ matIdx.set(name, mats.length); mats.push({ name, rgb:[r, g, b], role:roleOf(name) }); } return matIdx.get(name); });
  for(const a of d.assets) assets.set(a.name, { name:a.name, faces:a.faces.map(f => [remap[f[0]], ...f.slice(1)]), detail:a.detail || null });
}

const out = [];
let totalV = 0, totalT = 0;
for(const a of assets.values()){
  const V = [], I = [], key = new Map();
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  const vert = (x, y, z, m, nq, det) => { const k = `${x},${y},${z},${m},${nq},${det}`; let i = key.get(k);
    if(i === undefined){ i = V.length/5; key.set(k, i); V.push(x, y, z, m, det); mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z); }
    return i; };
  let fi = 0;
  for(const f of a.faces){
    const [m, nx, ny, nz, ...loops] = f, det = Array.isArray(loops[loops.length-1]) ? 0 : loops.pop(); fi++;
    const n = [nx/1000, ny/1000, nz/1000], ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    const [ua, va] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
    const pts3 = [], rings = [];
    for(const lp of loops){ const ring = []; for(let i=0;i<lp.length;i+=3){ pts3.push([lp[i], lp[i+1], lp[i+2]]); ring.push(new Vector2(lp[i+ua], lp[i+va])); } rings.push(ring); }
    if(rings[0].length < 3) continue;
    let tris; try { tris = ShapeUtils.triangulateShape(rings[0].map(p => p.clone()), rings.slice(1).map(r => r.map(p => p.clone()))); } catch(e){ continue; }
    const nq = `${Math.round(n[0]*50)},${Math.round(n[1]*50)},${Math.round(n[2]*50)}`;
    // octet d'étiquette : bit 0 détail ; pour un vitrage, bit 1 = grande surface (éclairage par travées), bits 2-7 = numéro aléatoire de la fenêtre
    let tag = det;
    if(mats[m].role === 4){ let area = 0; for(const t of tris){ const [p, q, r] = t.map(i => pts3[i]); if(!p || !q || !r) continue;
        const e1 = [q[0]-p[0], q[1]-p[1], q[2]-p[2]], e2 = [r[0]-p[0], r[1]-p[1], r[2]-p[2]];
        area += Math.hypot(e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0])/2; }
      tag |= (area > 60000 ? 2 : 0) | ((Math.imul(fi, 2654435761) >>> 26) << 2); }
    for(const t of tris){ let [p, q, r] = t.map(i => pts3[i]); if(!p || !q || !r) continue;
      const e1 = [q[0]-p[0], q[1]-p[1], q[2]-p[2]], e2 = [r[0]-p[0], r[1]-p[1], r[2]-p[2]];
      const c = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
      const dd = c[0]*n[0] + c[1]*n[1] + c[2]*n[2]; if(Math.abs(dd) < 1e-6) continue; if(dd < 0) [q, r] = [r, q];
      I.push(vert(...p, m, nq, tag), vert(...q, m, nq, tag), vert(...r, m, nq, tag)); }
  }
  // origine : centre de l'emprise au sol, base à y = 0 ; « nom@LxP » impose une emprise fixe [0, L] x [0, P] (repère SketchUp)
  const fp = a.name.match(/@(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/) || (FOOT[a.name] && [0, ...FOOT[a.name]]);
  const cx = fp ? Math.round(+fp[1]*50) : Math.round((mnx + mxx)/2), cz = fp ? -Math.round(+fp[2]*50) : Math.round((mnz + mxz)/2);
  const oy = fp ? 0 : mny;
  for(let i=0;i<V.length;i+=5){ V[i] -= cx; V[i+1] -= oy; V[i+2] -= cz; }
  out.push({ name:a.name.replace(/@.*$/, ''), V, I, w:fp ? +fp[1] : (mxx-mnx)/100, h:(mxy-oy)/100, d:fp ? +fp[2] : (mxz-mnz)/100, off:[cx/100, oy/100, cz/100] });
  totalV += V.length/5; totalT += I.length/3;
}

// paquet : [u32 longueur JSON][JSON][alignement 4][par modèle : Int16 xyz + Uint8 matière + Uint8 étiquette][index Uint16 ou Uint32]
const meta = { mats:mats.map(m => [m.name, ...m.rgb, m.role]), ref:REF, assets:[] };
const chunks = []; let off = 0;
for(const a of out){ const nv = a.V.length/5, big = nv > 65535;
  const vb = Buffer.alloc(nv*8); for(let i=0;i<nv;i++){ vb.writeInt16LE(a.V[i*5], i*8); vb.writeInt16LE(a.V[i*5+1], i*8+2); vb.writeInt16LE(a.V[i*5+2], i*8+4); vb.writeUInt8(a.V[i*5+3], i*8+6); vb.writeUInt8(a.V[i*5+4], i*8+7); }
  const ib = big ? Buffer.from(new Uint32Array(a.I).buffer) : Buffer.from(new Uint16Array(a.I).buffer);
  const pad = Buffer.alloc((4 - ib.length % 4) % 4);
  meta.assets.push({ name:a.name, w:+a.w.toFixed(2), d:+a.d.toFixed(2), h:+a.h.toFixed(2), off:a.off.map(v => +v.toFixed(2)), nv, ni:a.I.length, big, vo:off, io:off + vb.length });
  chunks.push(vb, ib, pad); off += vb.length + ib.length + pad.length; }
let js = Buffer.from(JSON.stringify(meta)); const jpad = Buffer.alloc((4 - (4 + js.length) % 4) % 4, 32); js = Buffer.concat([js, jpad]);
const head = Buffer.alloc(4); head.writeUInt32LE(js.length, 0);
const raw = Buffer.concat([head, js, ...chunks]); const gz = zlib.gzipSync(raw, { level:9 });
fs.writeFileSync(outFile, `/* ================= modèles 3D SketchUp (généré par tools/convert-assets.mjs, ne pas modifier) ================= */\nconst ASSET_PACK = '${gz.toString('base64')}';\n`);
console.log(`${out.length} modèles, ${totalV} sommets, ${totalT} triangles, brut ${(raw.length/1024).toFixed(0)} Ko, gzip ${(gz.length/1024).toFixed(0)} Ko`);
for(const a of out) console.log(`  ${a.name.padEnd(18)} ${String(a.V.length/5).padStart(6)} sommets ${String(a.I.length/3).padStart(6)} triangles  ${a.w.toFixed(1)} × ${a.d.toFixed(1)} × ${a.h.toFixed(1)} m`);
