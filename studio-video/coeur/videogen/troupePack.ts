// PAQUETS DE DÉCORS — l'app complète (planches, galeries et 191 décors en couches) dépasse 125 Mo : trop pour un
// seul fichier à envoyer. La construction « en paquets » garde les planches et les galeries dans l'app et range les
// décors dans des fichiers voisins massamba-troupe-N.js de moins de 30 Mo chacun.
// - Ouverts depuis le même dossier que l'app, ils se chargent tout seuls (balise <script> classique, permise en
//   file:// là où fetch() est refusé).
// - Sinon, l'app les importe (sélecteur de fichiers) : le texte est LU comme des données (JSON strict, images en
//   data: URL png/jpeg seulement), jamais exécuté, puis gardé dans IndexedDB.
// Module pur : utilisé par vite.direct.config.ts, l'app et les tests.

export interface PackDecor {
  name: string;
  src: string;
  depth?: string;
  people?: string;
  fit?: unknown;
  plate?: string;
  plateDepth?: string;
  masks?: string;
}
export interface TroupePack {
  kind: 'massamba-troupe';
  /** Version of the kit (hash of the images): packs of another build are refused. */
  version: string;
  part: number;
  of: number;
  decors: PackDecor[];
}
export interface PackInfo {
  version: string;
  count: number;
  decors: number;
}

export const PACK_GLOBAL = '__MASSAMBA_TROUPE__';
export const PACK_PREFIX = `(self.${PACK_GLOBAL}=self.${PACK_GLOBAL}||[]).push(`;
export const PACK_SUFFIX = ');\n';
/** Below the 30 MiB (31 457 280 bytes) upload limit, with a margin. */
export const PACK_MAX_BYTES = 28_500_000;
export const packFileName = (part: number) => `massamba-troupe-${part}.js`;

const IMAGE_FIELDS = ['src', 'depth', 'people', 'plate', 'plateDepth', 'masks'] as const;
const DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** The décors split in order into groups whose pack text stays under maxBytes (a lone larger décor gets its own). */
export function splitDecors(decors: PackDecor[], maxBytes = PACK_MAX_BYTES): PackDecor[][] {
  const overhead = PACK_PREFIX.length + PACK_SUFFIX.length + 200;
  const groups: PackDecor[][] = [];
  let cur: PackDecor[] = [];
  let size = overhead;
  for (const d of decors) {
    const n = JSON.stringify(d).length + 1;
    if (cur.length && size + n > maxBytes) {
      groups.push(cur);
      cur = [];
      size = overhead;
    }
    cur.push(d);
    size += n;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function packText(p: TroupePack): string {
  return PACK_PREFIX + JSON.stringify(p) + PACK_SUFFIX;
}

/** Reads a pack file as data (never runs it). Throws a French message when it is not a valid pack. */
export function parsePack(text: string): TroupePack {
  const t = text.trim();
  const pre = PACK_PREFIX.trim();
  const suf = PACK_SUFFIX.trim();
  if (!t.startsWith(pre) || !t.endsWith(suf)) throw new Error('ce fichier n’est pas un paquet de décors MASSAMBA');
  let raw: unknown;
  try {
    raw = JSON.parse(t.slice(pre.length, t.length - suf.length));
  } catch {
    throw new Error('paquet de décors illisible (JSON)');
  }
  return checkPack(raw);
}

/** Validates a pack object (from a file or from a loaded script). */
export function checkPack(raw: unknown): TroupePack {
  const p = raw as Partial<TroupePack> | null;
  if (!p || p.kind !== 'massamba-troupe' || typeof p.version !== 'string' || !Number.isInteger(p.part) || !Number.isInteger(p.of) || !Array.isArray(p.decors))
    throw new Error('paquet de décors invalide');
  if (p.part! < 1 || p.part! > p.of!) throw new Error('numéro de paquet invalide');
  const decors: PackDecor[] = p.decors.map((d, i) => {
    const x = d as unknown as Record<string, unknown>;
    if (!x || typeof x.name !== 'string' || typeof x.src !== 'string') throw new Error(`décor ${i + 1} invalide`);
    const out: PackDecor = { name: x.name, src: '' };
    for (const k of IMAGE_FIELDS) {
      const v = x[k];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !DATA_URL.test(v)) throw new Error(`décor « ${x.name} » : image ${k} refusée (seules les images PNG/JPEG intégrées sont acceptées)`);
      out[k] = v;
    }
    if (x.fit !== undefined) out.fit = x.fit;
    return out;
  });
  return { kind: 'massamba-troupe', version: p.version, part: p.part!, of: p.of!, decors };
}

/** Merges packs of one version in part order; tells which parts are missing. */
export function mergePacks(packs: TroupePack[], info: PackInfo): { decors: PackDecor[]; missing: number[]; foreign: number } {
  const byPart = new Map<number, TroupePack>();
  let foreign = 0;
  for (const p of packs) {
    if (p.version !== info.version || p.of !== info.count) foreign++;
    else byPart.set(p.part, p);
  }
  const decors: PackDecor[] = [];
  const missing: number[] = [];
  for (let i = 1; i <= info.count; i++) {
    const p = byPart.get(i);
    if (p) decors.push(...p.decors);
    else missing.push(i);
  }
  return { decors, missing, foreign };
}
