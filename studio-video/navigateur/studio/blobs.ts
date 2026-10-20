// Binary storage of the studio: a DEDICATED IndexedDB database `massamba-visual-studio` (never the Workbench's own).
// Opened lazily — a disabled studio never touches IndexedDB.
const DB = 'massamba-visual-studio';
const STORE = 'blobs';
let dbp: Promise<IDBDatabase> | null = null;
const open = (): Promise<IDBDatabase> => {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'));
  });
  return dbp;
};
const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = f(db.transaction(STORE, mode).objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
export const blobs = {
  put: (id: string, b: Blob) => run('readwrite', (s) => s.put(b, id)).then(() => undefined),
  get: (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>),
  del: (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined),
  keys: () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => k.map(String)),
};
export interface Quota {
  usage: number | null;
  quota: number | null;
  ratio: number | null;
  warn: boolean;
}
/** Storage quota, watched: warn above 80 %. */
export async function quota(): Promise<Quota> {
  try {
    const e = await navigator.storage.estimate();
    const ratio = e.usage != null && e.quota ? e.usage / e.quota : null;
    return { usage: e.usage ?? null, quota: e.quota ?? null, ratio, warn: ratio !== null && ratio > 0.8 };
  } catch {
    return { usage: null, quota: null, ratio: null, warn: false };
  }
}
export const blobToBase64 = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
export const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
export const base64ToBlob = (b64: string, mime: string): Blob => {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
};
export const blobBytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
