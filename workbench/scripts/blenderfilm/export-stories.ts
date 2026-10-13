// Écrit les histoires TikTok de la bibliothèque (server/jev/studio/tiktokComedy.ts) au format du pipeline Blender :
//   npx tsx scripts/blenderfilm/export-stories.ts   →   scripts/blenderfilm/stories/<id>.json
// puis : python3 scripts/blenderfilm/film.py --story scripts/blenderfilm/stories/poulet.json --troupe .private/troupe --out …
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIKTOK_STORIES, blenderStory } from '../../server/jev/studio/tiktokComedy';
import { blenderCast, PROFILES } from '../../server/jev/studio/actor/characterBible';
import { universeCharacter } from '../../server/jev/studio/actor/universe';
import { worldJson } from '../../server/jev/studio/world/livingWorld';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'stories');
mkdirSync(dir, { recursive: true });
for (const s of TIKTOK_STORIES)
  writeFileSync(join(dir, `${s.id}.json`), `${JSON.stringify(blenderStory(s), null, 1)}\n`);
// The knowledge base for Blender: heights, voices and the places each character frequents (extras of the living world).
const here = dirname(fileURLToPath(import.meta.url));
const cast = blenderCast();
for (const p of PROFILES) {
  const u = universeCharacter(p.name);
  const age = Number(/(\d+)/.exec(u?.age ?? '')?.[1] ?? 35);
  Object.assign(cast[p.name]!, { lieux: p.lieux, activite: p.activite, genre: u?.gender ?? '', age });
}
writeFileSync(join(here, 'characters.json'), `${JSON.stringify(cast, null, 1)}\n`);
writeFileSync(join(here, 'world.json'), `${JSON.stringify(worldJson(), null, 1)}\n`);
console.log(
  `${TIKTOK_STORIES.length} histoires → ${dir} · characters.json (${PROFILES.length}) · world.json`,
);
