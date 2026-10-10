// Runtime of the JEV vision bridge (see server/jev/vision/bridge.ts).
import { complete } from './llm';
import { dataUrl } from './vfs';
import { useStore } from './store';
import type { VFile } from './types';
import { bridgeBlock, bridgeKey, visionCandidates, visionPrompt } from '../../server/jev/vision/bridge';
import { blockedVision, withVisionModel } from './visionGuard';

const cache = new Map<string, { text: string; model: string }>();
export interface BridgeResult {
  block: string;
  model: string;
  cost: number;
  cached: boolean;
}
export const visionBridgeEnabled = () => useStore.getState().settings.visionBridge !== false;

export async function describeImage(f: VFile, question: string, signal?: AbortSignal): Promise<BridgeResult | null> {
  const st = useStore.getState();
  const key = bridgeKey(f.data, question);
  const hit = cache.get(key);
  if (hit) return { block: bridgeBlock(f.path, hit.model, hit.text), model: hit.model, cost: 0, cached: true };
  if (!visionCandidates(st.models, st.settings.visionModel, blockedVision()).length) return null;
  // Cost first (free models), but a model that refuses is skipped and remembered: the chat never loses its eyes.
  const r = await withVisionModel(
    (model) =>
      complete(
        {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: visionPrompt(question) },
                { type: 'image_url', image_url: { url: dataUrl(f) } },
              ],
            },
          ],
          maxTokens: 1500,
          temperature: 0,
          signal,
        },
        { models: st.models, fallbacks: [], effort: 'auto', maxRetries: 1 },
      ),
    'cheap',
    signal,
  );
  const text = r.content ?? '';
  if (!text.trim()) return null;
  cache.set(key, { text, model: r.model });
  return { block: bridgeBlock(f.path, r.model, text), model: r.model, cost: r.cost, cached: false };
}
