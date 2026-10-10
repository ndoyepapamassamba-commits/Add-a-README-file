// Runtime of the JEV vision bridge (see server/jev/vision/bridge.ts).
import { complete } from './llm';
import { dataUrl } from './vfs';
import { useStore } from './store';
import type { VFile } from './types';
import { bridgeBlock, bridgeKey, pickVisionModel, visionPrompt } from '../../server/jev/vision/bridge';

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
  const pick = pickVisionModel(st.models, st.settings.visionModel);
  if (!pick) return null;
  const r = await complete(
    {
      model: pick.model,
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
    { models: st.models, fallbacks: pick.fallbacks, effort: 'auto', maxRetries: 1 },
  );
  const text = r.content ?? '';
  if (!text.trim()) return null;
  cache.set(key, { text, model: r.model });
  return { block: bridgeBlock(f.path, r.model, text), model: r.model, cost: r.cost, cached: false };
}
