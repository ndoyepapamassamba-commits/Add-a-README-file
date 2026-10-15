// LA TROUPE EMBARQUÉE — les planches, galeries et décors du propriétaire (son propre dessin, dossier privé, jamais
// publié) sont intégrés au fichier HTML à la construction et installés tout seuls dans la bibliothèque des acteurs et
// des décors à la première ouverture du studio : rien à importer. Chaque planche devient un acteur qui joue avec ses
// poses ; chaque figure d'une galerie devient un acteur (une pose) ; chaque décor vide va dans les décors. Les visages
// ont été mesurés à l'avance (bouche, menton, yeux) pour que chacun parle et cligne avec son propre dessin.
import kit from 'virtual:troupe-kit';
import { blobs } from './blobs';
import { importSheet, type SheetBodyMarks, type SheetFaceMarks } from './sheetImport';
import { useStudio, type DecorFit } from './store';
import { lookFromSheet, type ActorLook3D } from '../../../server/jev/studio/actor/cast3d';
import { universeCharacter } from '../../../server/jev/studio/actor/universe';
import { speakerKey } from '../../../server/jev/studio/motion';

export interface TroupeKit {
  version: string;
  planches: { name: string; src: string; faces: SheetFaceMarks[]; bodies?: SheetBodyMarks[] }[];
  galeries: { src: string; names: string[]; faces: SheetFaceMarks[]; bodies?: SheetBodyMarks[] }[];
  decors: { name: string; src: string; depth?: string; people?: string; fit?: DecorFit; plate?: string; plateDepth?: string; masks?: string }[];
}
export const troupeKit: TroupeKit | null = kit;
/** Revision of the import (cut-out, face measure): a better import reinstalls the troupe once. */
const IMPORT_REV = 3;
const versionOf = (k: TroupeKit) => `${k.version}.${IMPORT_REV}`;

export interface TroupeInstall {
  actors: number;
  planches: number;
  figures: number;
  decors: number;
  /** Poses / figures whose face (mouth, eyes) is measured, over all of them. */
  rigged: number;
  poses: number;
}

const blobOf = async (src: string) => (await fetch(src)).blob();
let running: Promise<TroupeInstall | null> | null = null;

/**
 * Installs the embedded troupe once per version (force = again). The owner's own library entries are kept: a planche
 * gives its poses to the actor of the same name, a gallery figure never replaces an actor that already has a planche.
 */
export function ensureTroupeKit(o: { force?: boolean; onNote?: (m: string) => void } = {}): Promise<TroupeInstall | null> {
  const k = troupeKit;
  if (!k) return Promise.resolve(null);
  const st = useStudio.getState();
  if (!st.hydrated || !st.settings.enabled) return Promise.resolve(null);
  if (!o.force && st.settings.troupeKit === versionOf(k)) return Promise.resolve(null);
  running ??= (async () => {
    const out: TroupeInstall = { actors: 0, planches: 0, figures: 0, decors: 0, rigged: 0, poses: 0 };
    const looks: ActorLook3D[] = [];
    const withSheet = new Set<string>();
    const base = (name: string): ActorLook3D => {
      const key = speakerKey(name);
      const lib = useStudio.getState().actors[key];
      return lib ?? { ...lookFromSheet(universeCharacter(name) ?? { name }), films: 0 };
    };
    for (const [i, p] of k.planches.entries()) {
      o.onNote?.(`troupe : planche ${i + 1}/${k.planches.length} (${p.name})…`);
      try {
        const key = speakerKey(p.name);
        const r = await importSheet(await blobOf(p.src), key, { faces: p.faces, bodies: p.bodies ?? [] });
        looks.push({ ...base(p.name), sheet: { sourceAssetId: r.sourceAssetId, poses: r.poses }, source: 'planche', updatedAt: Date.now() });
        withSheet.add(key);
        out.planches++;
        out.rigged += r.rigged;
        out.poses += r.poses.length;
      } catch (e) {
        o.onNote?.(`troupe : planche de ${p.name} illisible (${(e as Error).message})`);
      }
    }
    for (const [gi, g] of k.galeries.entries()) {
      o.onNote?.(`troupe : galerie ${gi + 1}/${k.galeries.length}…`);
      try {
        const r = await importSheet(await blobOf(g.src), `galerie-${gi + 1}`, { gallery: true, faces: g.faces, bodies: g.bodies ?? [] });
        r.poses.forEach((pose, i) => {
          const name = g.names[i];
          if (!name) return;
          const key = speakerKey(name);
          const lib = useStudio.getState().actors[key];
          // Same character twice (its planche, another gallery): the first one plays it.
          if (withSheet.has(key) || (lib?.sheet && lib.sheet.poses.length > 1)) return;
          withSheet.add(key);
          looks.push({ ...base(name), sheet: { sourceAssetId: r.sourceAssetId, poses: [{ ...pose, kind: 'neutre' }] }, source: 'planche', updatedAt: Date.now() });
          out.figures++;
          out.poses++;
          if (pose.face) out.rigged++;
        });
      } catch (e) {
        o.onNote?.(`troupe : galerie ${gi + 1} illisible (${(e as Error).message})`);
      }
    }
    if (looks.length) useStudio.getState().upsertActors(looks);
    out.actors = looks.length;
    for (const d of k.decors) {
      try {
        const id = `decor-troupe-${speakerKey(d.name).toLowerCase()}-${k.version.slice(0, 6)}`;
        await blobs.put(id, await blobOf(d.src));
        if (d.depth) await blobs.put(`${id}-depth`, await blobOf(d.depth));
        if (d.people) await blobs.put(`${id}-people`, await blobOf(d.people));
        useStudio.getState().upsertDecor(d.name, id, d.fit, { ...(d.depth ? { depthAssetId: `${id}-depth` } : {}), ...(d.people ? { peopleAssetId: `${id}-people` } : {}) });
        out.decors++;
      } catch {
        /* a set that cannot be stored is skipped */
      }
    }
    useStudio.getState().setSettings({ troupeKit: versionOf(k) });
    o.onNote?.(
      `troupe installée : ${out.actors} acteur(s) (${out.planches} planche(s), ${out.figures} figure(s) de galerie), ${out.decors} décor(s) — visage mesuré (bouche, yeux) sur ${out.rigged}/${out.poses} pose(s)`,
    );
    return out;
  })().finally(() => {
    running = null;
  });
  return running;
}
