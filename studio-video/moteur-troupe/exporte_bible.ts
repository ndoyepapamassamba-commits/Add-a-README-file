// BIBLE COMIQUE pour le moteur de la troupe (Python) : une seule source, les modules du Studio (règles TikTok mesurées,
// mécaniques comiques, interjections ivoiriennes, histoires déjà écrites, fiches et relations des personnages).
//   npx tsx moteur-troupe/exporte_bible.ts   → moteur-troupe/bible_comique.json
import fs from 'node:fs';
import path from 'node:path';
import { TIKTOK_BIBLE, TIKTOK_STORIES } from '../coeur/studio/tiktokComedy';
import { COMIC_DEVICES, SITUATIONS, INTERJECTIONS, REACTIONS } from '../coeur/studio/humor';
import { PROFILES, RELATIONS, QUARTIER } from '../coeur/studio/actor/characterBible';

const sortie = path.join(path.dirname(new URL(import.meta.url).pathname), 'bible_comique.json');
fs.writeFileSync(
  sortie,
  JSON.stringify(
    { regles: TIKTOK_BIBLE, mecaniques: COMIC_DEVICES, situations: SITUATIONS, interjections: INTERJECTIONS, reactions: REACTIONS,
      histoires: TIKTOK_STORIES, personnages: PROFILES, relations: RELATIONS, quartier: QUARTIER },
    null,
    1,
  ),
);
console.log('bible écrite :', sortie, TIKTOK_BIBLE.length, 'règles,', COMIC_DEVICES.length, 'mécaniques,', TIKTOK_STORIES.length, 'histoires,', PROFILES.length, 'personnages');
