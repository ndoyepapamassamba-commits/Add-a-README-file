// Sauvegardes : emplacements dans le navigateur (localStorage, compressés), code d'export/import.
import { G } from './state.js';

const META_KEY = 'hc-saves-meta';
const SLOT = (s) => 'hc-save-' + s;

function b64encode(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function b64decode(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function compress(text) {
  if (typeof CompressionStream === 'undefined') return 'J' + text;
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return 'Z' + b64encode(buf);
}

async function decompress(data) {
  if (data[0] === 'J') return data.slice(1);
  if (data[0] === '{') return data;
  const bytes = b64decode(data.slice(1));
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

export function snapshot() {
  const planted = [];
  for (const c of G.trees.chunks) for (const list of c) for (const t of list) if (t.user) planted.push([Math.round(t.x * 10) / 10, Math.round(t.z * 10) / 10, t.type, Math.round(t.s * 100) / 100]);
  return {
    v: 1,
    name: G.cityName,
    sim: G.sim.serialize(),
    roads: G.roads.serialize(),
    zones: G.zones.serialize(),
    buildings: G.buildings.serialize(),
    transit: G.transit ? G.transit.serialize() : [],
    trees: planted,
    cam: { ...G.cam.want },
  };
}

export function restore(d) {
  G.running = false;
  G.clearCity();
  G.cityName = d.name || 'Horizon Cité';
  G.roads.load(d.roads);
  G.zones.load(d.zones);
  G.buildings.load(d.buildings);
  G.sim.load(d.sim);
  if (G.transit) G.transit.load(d.transit);
  for (const [x, z, type, s] of d.trees || []) G.trees.addTree(x, z, type, s, Math.random(), true);
  if (d.cam) Object.assign(G.cam.want, d.cam);
  for (const b of G.buildings.list.values()) if (b.state === 'active' && G.fx) G.fx.addEmitters(b);
  G.running = true;
  G.emit('game:loaded', d);
}

export function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export async function saveSlot(slot) {
  const d = snapshot();
  const text = JSON.stringify(d);
  const packed = await compress(text);
  try {
    localStorage.setItem(SLOT(slot), packed);
    const meta = readMeta();
    meta[slot] = { name: d.name, pop: G.sim.stats.pop, money: Math.round(G.sim.money), day: G.sim.day, at: Date.now(), size: packed.length };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return { ok: true, size: packed.length };
  } catch (e) {
    return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'Espace de stockage du navigateur plein.' : 'Le navigateur refuse la sauvegarde (stockage désactivé ?).' };
  }
}

export async function loadSlot(slot) {
  let packed = null;
  try {
    packed = localStorage.getItem(SLOT(slot));
  } catch (e) {
    return { ok: false, error: 'Stockage du navigateur indisponible.' };
  }
  if (!packed) return { ok: false, error: 'Emplacement vide.' };
  try {
    const d = JSON.parse(await decompress(packed));
    restore(d);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: 'Sauvegarde illisible.' };
  }
}

export function deleteSlot(slot) {
  try {
    localStorage.removeItem(SLOT(slot));
    const meta = readMeta();
    delete meta[slot];
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (e) {
    /* stockage indisponible */
  }
}

export async function exportCode() {
  return await compress(JSON.stringify(snapshot()));
}

export async function importCode(code) {
  try {
    const d = JSON.parse(await decompress(code.trim()));
    if (!d || !d.roads) throw new Error('format');
    restore(d);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Code de sauvegarde invalide.' };
  }
}

export function hasAnySave() {
  const m = readMeta();
  return Object.keys(m).length > 0;
}
