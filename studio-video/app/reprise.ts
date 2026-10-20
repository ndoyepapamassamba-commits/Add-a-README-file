// REPRISE DES DONNÉES VIDÉO — jusqu'au 16/10/2026 la vidéo vivait dans Workbench : ses projets, acteurs, décors,
// travaux, mémoire et réglages de studio (clés « vs.* ») sont dans la base de Workbench, et les clés des moteurs vidéo
// dans les réglages de Workbench. Au premier lancement, Studio Vidéo les RECOPIE dans sa propre base (lecture seule chez
// Workbench : rien n'y est modifié ni effacé). Ce qui existe déjà ici n'est jamais écrasé. Les médias (dossier blobs) et
// les paquets de décors importés sont dans des bases à part, déjà partagées par les deux fichiers : rien à recopier.
import { kv, WORKBENCH_DB } from '@workbench/direct/lib/db';
import { CHAMPS, useReglages, type ReglagesVideo } from '../navigateur/reglages';

const FAIT = 'sv.reprise';

export interface BilanReprise {
  cles: number;
  reglages: number;
}

function ouvrir(nom: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(nom);
    // La base n'existait pas : on n'en crée pas une vide chez Workbench.
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve(null);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function toutLire(db: IDBDatabase): Promise<[string, unknown][]> {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains('kv')) return resolve([]);
    const st = db.transaction('kv', 'readonly').objectStore('kv');
    const keys = st.getAllKeys();
    const vals = st.getAll();
    vals.onsuccess = () => resolve((keys.result ?? []).map((k, i) => [String(k), vals.result[i]]));
    vals.onerror = () => resolve([]);
  });
}

/** Recopie une fois les données vidéo de Workbench ; null quand c'est déjà fait ou qu'il n'y a rien à reprendre. */
export async function reprendreDeWorkbench(): Promise<BilanReprise | null> {
  try {
    if (localStorage.getItem(FAIT)) return null;
  } catch {
    return null;
  }
  const marquer = () => {
    try {
      localStorage.setItem(FAIT, new Date().toISOString());
    } catch {
      /* rien */
    }
  };
  const db = await ouvrir(WORKBENCH_DB);
  if (!db) return marquer(), null;
  const tout = await toutLire(db);
  db.close();
  let cles = 0;
  for (const [k, v] of tout) {
    if (!k.startsWith('vs.')) continue;
    if ((await kv.get(k).catch(() => undefined)) !== undefined) continue;
    await kv.set(k, v);
    cles++;
  }
  let reglages = 0;
  const anciens = (tout.find(([k]) => k === 'settings')?.[1] ?? {}) as ReglagesVideo;
  const ici = useReglages.getState();
  const patch: Partial<ReglagesVideo> = {};
  for (const c of CHAMPS)
    if (!ici[c] && typeof anciens[c] === 'string' && anciens[c]) {
      patch[c] = anciens[c];
      reglages++;
    }
  if (reglages) ici.patch(patch);
  marquer();
  return cles || reglages ? { cles, reglages } : null;
}
