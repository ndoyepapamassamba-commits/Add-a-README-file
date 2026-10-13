// The craft skills (video / 3D / captions) enabled in the library: the set the studio hooks read before acting.
import { CRAFT_NAMES, type CraftSet } from '../../../server/jev/studio/craftSkills';
import { useStore } from '../store';

/** Names of the enabled craft skills (empty set when none is installed or they are all turned off). */
export function craftSet(): CraftSet {
  const on = new Set<string>();
  for (const s of useStore.getState().skills) if (s.enabled && CRAFT_NAMES.includes(s.name)) on.add(s.name);
  return on;
}
