// Tiny IndexedDB key/value store (sessions, files, skills… stay on this computer).
const DB = 'openrouter-workbench-direct';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponible'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
      }),
  );
}

export const kv = {
  get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined),
  keys: () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => k.map(String)),
  clear: () => tx('readwrite', (s) => s.clear()).then(() => undefined),
};

/** Debounced writer: coalesces frequent saves of the same key. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function saveLater(key: string, value: () => unknown, ms = 300): void {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void kv.set(key, value()).catch((e) => console.error('save failed', key, e));
    }, ms),
  );
}
