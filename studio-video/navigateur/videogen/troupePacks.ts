// DÉCORS EN PAQUETS — dans la construction « en paquets » (npm run build:direct:packs), les décors du projet ne sont
// pas dans l'app mais dans des fichiers voisins massamba-troupe-N.js (< 30 Mo chacun, voir troupePack.ts).
// 1. Même dossier que l'app : chargés tout seuls par <script> (permis en file://, contrairement à fetch()).
// 2. Déjà importés une fois : relus depuis IndexedDB.
// 3. Sinon : l'utilisateur les importe (sélecteur de fichiers) ; le texte est lu comme données, jamais exécuté.
import kit from 'virtual:troupe-kit';
import { checkPack, mergePacks, packFileName, parsePack, PACK_GLOBAL, type PackDecor, type TroupePack } from '../../coeur/videogen/troupePack';

export interface PackState {
  decors: PackDecor[];
  /** Décors the app should have (all packs present). */
  expected: number;
  source: 'app' | 'dossier' | 'importés' | 'aucun';
  /** Pack numbers still missing (pack build only). */
  missing: number[];
  count: number;
  note?: string;
}

const DB = 'massamba-troupe-packs';
const STORE = 'packs';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB indisponible'));
  });
}
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => {
  t.oncomplete = () => res();
  t.onerror = t.onabort = () => rej(t.error ?? new Error('écriture refusée'));
});
async function storedPacks(): Promise<TroupePack[]> {
  const db = await idb();
  try {
    const all = await new Promise<unknown[]>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).getAll();
      r.onsuccess = () => res(r.result as unknown[]);
      r.onerror = () => rej(r.error);
    });
    return all.flatMap((p) => {
      try {
        return [checkPack(p)];
      } catch {
        return [];
      }
    });
  } finally {
    db.close();
  }
}
async function savePacks(packs: TroupePack[], version: string): Promise<void> {
  const db = await idb();
  try {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    const keys = await new Promise<IDBValidKey[]>((res, rej) => {
      const r = s.getAllKeys();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    // Packs of an older build are dropped (their space is freed); parts of this version already saved stay.
    for (const k of keys) if (!String(k).startsWith(`${version}:`)) s.delete(k);
    for (const p of packs) s.put(p, `${p.version}:${p.part}`);
    await done(t);
  } finally {
    db.close();
  }
}

const tried = new Set<number>();
function scriptPack(part: number): Promise<void> {
  if (tried.has(part)) return Promise.resolve();
  tried.add(part);
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = new URL(packFileName(part), location.href).href;
    s.onload = s.onerror = () => {
      s.remove();
      res();
    };
    document.head.appendChild(s);
  });
}
async function folderPacks(count: number): Promise<TroupePack[]> {
  if (!/^(file|https?):$/.test(location.protocol)) return [];
  for (let i = 1; i <= count; i++) await scriptPack(i);
  const g = self as unknown as Record<string, unknown[] | undefined>;
  return (g[PACK_GLOBAL] ?? []).flatMap((p) => {
    try {
      return [checkPack(p)];
    } catch {
      return [];
    }
  });
}

let loading: Promise<PackState> | null = null;
/** The project's sets: embedded in the app, or from the packs (next to the app, else imported earlier). */
export function loadTroupePacks(): Promise<PackState> {
  const info = kit?.packs;
  if (!info) {
    const decors = kit?.decors ?? [];
    return Promise.resolve({ decors, expected: decors.length, source: decors.length ? 'app' : 'aucun', missing: [], count: 0 });
  }
  loading ??= (async () => {
    const found = await folderPacks(info.count);
    let m = mergePacks(found, info);
    let source: PackState['source'] = 'dossier';
    if (m.missing.length) {
      const saved = await storedPacks().catch(() => [] as TroupePack[]);
      const both = mergePacks([...found, ...saved], info);
      if (both.missing.length < m.missing.length) {
        m = both;
        if (!found.length) source = 'importés';
      }
    }
    return {
      decors: m.decors,
      expected: info.decors,
      source: m.decors.length ? source : 'aucun',
      missing: m.missing,
      count: info.count,
      ...(m.foreign ? { note: `${m.foreign} paquet(s) d’une autre version de l’app ignoré(s)` } : {}),
    };
  })();
  return loading;
}

/** Imports pack files chosen by the user (read as data), keeps them in the browser, and reloads the sets. */
export async function importTroupePacks(files: File[]): Promise<PackState> {
  const info = kit?.packs;
  if (!info) throw new Error('cette app contient déjà ses décors');
  const packs: TroupePack[] = [];
  for (const f of files) {
    try {
      packs.push(parsePack(await f.text()));
    } catch (e) {
      throw new Error(`${f.name} : ${(e as Error).message}`, { cause: e });
    }
  }
  const ok = packs.filter((p) => p.version === info.version && p.of === info.count);
  if (!ok.length) throw new Error('ces paquets viennent d’une autre version de l’app (reconstruisez les deux ensemble)');
  await savePacks(ok, info.version);
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* persistence is a bonus */
  }
  loading = null;
  return loadTroupePacks();
}
