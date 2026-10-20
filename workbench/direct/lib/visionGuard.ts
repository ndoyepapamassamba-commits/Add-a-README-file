// VISION GUARD — a vision call never depends on one model: candidates are tried in turn, and a model that refuses
// for good (e.g. a free model « only available on agentic harnesses ») is remembered and skipped next time.
import { useStore } from './store';
import { permanentVisionError, visionCandidates } from '../../server/jev/vision/bridge';

const KEY = 'massamba.vision.blocked';
let mem: Set<string> | null = null;
export function blockedVision(): Set<string> {
  if (mem) return mem;
  try {
    mem = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    mem = new Set();
  }
  return mem;
}
export function blockVision(id: string): void {
  const b = blockedVision();
  b.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...b].slice(-50)));
  } catch {
    /* private mode: memory only */
  }
}
/** Run `fn` with the first vision model that works. Throws the last error when every candidate failed. */
export async function withVisionModel<T>(fn: (model: string) => Promise<T>, mode: 'cheap' | 'reliable' | 'design' = 'reliable', signal?: AbortSignal): Promise<T> {
  const st = useStore.getState();
  // The model the USER chose comes first: the vision model of the settings, then the chat's own model when it sees
  // images (a text-only model such as a Qwen Flash gets its eyes from the next candidates — JEV vision bridge).
  const sess = st.sessions.find((x) => x.id === st.currentId);
  const chatModel = [sess?.pinnedModel, sess?.model].find((m) => m && m !== 'auto' && st.models.some((x) => x.id === m && x.capabilities.vision));
  // Reading a DESIGN (boxes, kinds, colours): the strongest box-locating models of the catalogue come right after the
  // user's own vision model — before the chat model, which may see but locate poorly.
  const list = (
    mode === 'design'
      ? [...new Set([...(st.settings.visionModel ? [st.settings.visionModel] : []), ...visionCandidates(st.models, null, blockedVision(), 'design'), ...(chatModel ? [chatModel] : [])])]
      : [...new Set([...(st.settings.visionModel ? [st.settings.visionModel] : []), ...(chatModel ? [chatModel] : []), ...visionCandidates(st.models, null, blockedVision(), mode)])]
  )
    .filter((m) => !blockedVision().has(m))
    .slice(0, 6);
  if (!list.length) throw new Error('Aucun modèle vision disponible dans le catalogue.');
  let last: unknown = null;
  for (const model of list) {
    if (signal?.aborted) throw new Error('Interrompu');
    try {
      return await fn(model);
    } catch (e) {
      last = e;
      const err = e as { status?: number; message?: string };
      if (permanentVisionError(err.status, err.message ?? '')) blockVision(model);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
