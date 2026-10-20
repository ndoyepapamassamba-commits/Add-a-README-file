// CASTING 3D — each character of the film takes ITS actor from the library (the same actor from one film to the
// next); a new character gets an actor built from its sheet, saved in the library. The film keeps a snapshot of its
// cast (the montage plays exactly these actors, even if the library changes later).
import { useStudio, type DecorFit, type DecorLayers } from './store';
import { castFilm, type ActorLibrary, type ActorLook3D } from '../../coeur/studio/actor/cast3d';
import { speakerKey } from '../../coeur/studio/motion';
import { universeSetOf } from '../../coeur/studio/actor/universe';

/** WebGL available in this browser (the 3D actors need it; otherwise the Marionnette plays the scenes). */
export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
export function castActors(projectId: string): { cast: ActorLibrary; added: string[]; reused: string[] } {
  const S = useStudio.getState();
  const bp = S.projects[projectId];
  if (!bp) return { cast: {}, added: [], reused: [] };
  // Every speaker plays, even one the story forgot to describe (built from the name, stable from film to film).
  const sheets = [...bp.characters];
  for (const sc of bp.scenes)
    for (const n of [...sc.characters, ...sc.dialogue.map((d) => d.speaker)]) if (n && !sheets.some((c) => speakerKey(c.name) === speakerKey(n))) sheets.push({ name: n } as never);
  const r = castFilm(sheets, S.actors);
  const first = !bp.actors3d;
  // The library learns the new actors; the reuse counter only moves once per film.
  S.upsertActors([...r.added, ...(first ? Object.values(r.cast).map((a) => ({ ...a, films: (S.actors[a.key]?.films ?? a.films ?? 0) + 1 })) : [])]);
  const cast = Object.fromEntries(Object.entries(r.cast).map(([k, a]) => [k, useStudio.getState().actors[k] ?? a]));
  S.patchProject(projectId, (b) => ({ ...b, actors3d: { cast, at: Date.now() } }), `casting 3D : ${Object.keys(cast).length} acteur(s)`);
  return { cast, added: r.added.map((a) => a.name), reused: r.reused };
}

/**
 * The owner's CHARACTER SHEETS become the reference images of the film's characters (same name): every scene image —
 * and so every Grok clip — draws THEIR character, and no character sheet is redrawn (saved money).
 */
export function applySheets(projectId: string): string[] {
  const S = useStudio.getState();
  const bp = S.projects[projectId];
  if (!bp) return [];
  const used: string[] = [];
  const characters = bp.characters.map((c) => {
    const a = S.actors[speakerKey(c.name)];
    if (!a?.sheet || c.referenceAssetId === a.sheet.sourceAssetId) return c;
    used.push(c.name);
    return { ...c, referenceAssetId: a.sheet.sourceAssetId };
  });
  if (used.length) S.patchProject(projectId, (b) => ({ ...b, characters }), `planches de personnages : ${used.join(', ')}`);
  return used;
}

/** The owner's empty set for a scene location (the set of the channel it matches, or a set named in the location). */
export function decorFor(location: string): ({ assetId: string; fit?: DecorFit } & DecorLayers) | null {
  const d = useStudio.getState().decors;
  const u = universeSetOf(location);
  const pick = (x: { assetId: string; fit?: DecorFit } & DecorLayers) => ({ assetId: x.assetId, ...(x.fit ? { fit: x.fit } : {}), ...(x.depthAssetId ? { depthAssetId: x.depthAssetId } : {}), ...(x.peopleAssetId ? { peopleAssetId: x.peopleAssetId } : {}) });
  // The set made for the film's vertical frame first (adapted set), else the owner's picture of the place.
  if (u && d[`${u.name.toLowerCase()} (vertical)`]) return pick(d[`${u.name.toLowerCase()} (vertical)`]!);
  if (u && d[u.name.toLowerCase()]) return pick(d[u.name.toLowerCase()]!);
  const t = location.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const hit = Object.values(d).find((x) => t.includes(x.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  return hit ? pick(hit) : null;
}

/** The troupe's drawn characters (planches and gallery figures): the figurants of the public places. */
export function extrasPool(): ActorLook3D[] {
  return Object.values(useStudio.getState().actors)
    .filter((a) => a.sheet?.poses.length)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Every character who speaks or appears in the film has its drawn actor (planche or gallery figure) in the library. */
export function troupeReady(projectId: string): boolean {
  const S = useStudio.getState();
  const bp = S.projects[projectId];
  if (!bp?.scenes.length) return false;
  const names = new Set<string>();
  for (const sc of bp.scenes) for (const n of [...sc.characters, ...sc.dialogue.map((d) => d.speaker)]) if (n) names.add(speakerKey(n));
  return names.size > 0 && [...names].every((k) => Boolean(S.actors[k]?.sheet?.poses.length));
}

/**
 * IMAGES DE DÉPART PAR LE MOTEUR (0 $): the first picture of each scene is drawn by the theatre — the owner's own
 * actors (their planches), in the owner's set at their scale, in the pose of the first line — and becomes the scene
 * image. The Grok circuit then animates THESE pictures (no paid scene image, no redrawn character, no drift of the
 * characters from one shot to the next). Returns the number of scenes drawn.
 */
export async function renderSceneStills(projectId: string, o: { width?: number } = {}): Promise<number> {
  const S = useStudio.getState();
  const bp = S.projects[projectId];
  if (!bp || !webglOk()) return 0;
  const cast = bp.actors3d?.cast ?? castActors(projectId).cast;
  const { Theater3D } = await import('./actors3d');
  const { mouthShape } = await import('../../coeur/studio/actor/cast3d');
  const { blobs } = await import('./blobs');
  const { useOwnSceneImage } = await import('./actions');
  const [aw, ah] = (bp.aspect ?? '9:16').split(':').map(Number) as [number, number];
  const W = o.width ?? 720;
  const H = Math.round((W * (ah || 16)) / (aw || 9));
  const th = new Theater3D(W, H);
  let n = 0;
  try {
    for (const [k, sc] of bp.scenes.entries()) {
      if (sc.imageAssetId && sc.status === 'APPROVED') continue;
      const lines = sc.dialogue.map((d, i) => ({ speaker: d.speaker, start: 0.8 + i * 2.2, end: 2.6 + i * 2.2, text: d.text, gesture: d.gesture, emotion: d.emotion }));
      const names = sc.characters.length ? sc.characters : [...new Set(sc.dialogue.map((d) => d.speaker))];
      if (!names.length) continue;
      const bd = decorFor(sc.location);
      const backdrop = bd ? ((await blobs.get(bd.assetId)) ?? null) : null;
      const backdropDepth = bd?.depthAssetId ? ((await blobs.get(bd.depthAssetId)) ?? null) : null;
      const backdropPeople = bd?.peopleAssetId ? ((await blobs.get(bd.peopleAssetId)) ?? null) : null;
      await th.addScene(k, { names, lines, seconds: Math.max(3, lines.length * 2.2 + 1.5), action: sc.action, location: sc.location, cast, backdrop, ...(bd ? { backdropId: bd.assetId, backdropDepth, backdropPeople } : {}), extras: extrasPool(), ...(bd?.fit ? { backdropFit: bd.fit } : {}) }, (id) => blobs.get(id));
      // The pose of the first line, mouth closed (the video model starts from a calm, readable picture).
      const l0 = lines[0];
      const t = l0 ? l0.start + 0.5 : 0.5;
      for (let tt = 0; tt <= t; tt += 1 / 15) th.render(k, tt, { speaker: l0 && tt >= l0.start ? l0.speaker : null, energy: 0, beat: 0, mouth: mouthShape('rest'), gesture: l0?.gesture ?? null, emotion: l0?.emotion, lineAge: l0 ? Math.max(0, tt - l0.start) : 0, text: l0?.text });
      const canvas = th.renderer.domElement;
      const png = await new Promise<Blob | null>((ok) => canvas.toBlob((b) => ok(b), 'image/png'));
      th.drop(k);
      if (!png) continue;
      await useOwnSceneImage(projectId, sc.scene_id, png);
      n++;
    }
  } finally {
    th.dispose();
  }
  return n;
}
