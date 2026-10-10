// Designs found on the Internet (thumbnails before validation): image search through the user's Tavily key, then a small
// vision model reads the chosen image and returns its palette and font → a custom premium theme.
import { useStore } from './store';
import { complete } from './llm';
import { DESIGN_QUERY, parseTavilyImages, tavilyImagesRequest } from '../../server/jev/web/search';
import { PALETTE_PROMPT, parsePalette, type DeliverableKind } from '../../server/services/premiumDesigns';
import { pickVisionModel } from '../../server/jev/vision/bridge';
import type { CustomTheme } from '../../server/services/houseDesign';
import { LAYOUT_PROMPT, parseLayout, type DesignLayout } from '../../server/services/layoutClone';

export async function searchDesigns(kind: DeliverableKind, extra = ''): Promise<{ url: string; description: string }[]> {
  const key = useStore.getState().settings.tavilyKey;
  if (!key) throw new Error('Ajoutez une clé Tavily dans Réglages pour voir des designs sur Internet.');
  const rq = tavilyImagesRequest(key, `${DESIGN_QUERY[kind]} ${extra}`.trim());
  const res = await fetch(rq.url, rq.init);
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  return parseTavilyImages(await res.json());
}

export async function paletteFromImage(url: string): Promise<{ theme: CustomTheme; model: string; cost: number }> {
  const st = useStore.getState();
  const pick = pickVisionModel(st.models, st.settings.visionModel);
  if (!pick) throw new Error('Aucun modèle vision disponible pour lire ce design.');
  const r = await complete(
    {
      model: pick.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: PALETTE_PROMPT }, { type: 'image_url', image_url: { url } }] }],
      maxTokens: 200,
      temperature: 0,
    },
    { models: st.models, fallbacks: pick.fallbacks, effort: 'auto', maxRetries: 1 },
  );
  const theme = parsePalette(r.content);
  if (!theme) throw new Error('Le style de cette image n’a pas pu être lu ; choisissez-en une autre.');
  return { theme, model: r.model, cost: r.cost };
}

/** The full LAYOUT of a design image (structure + palette + font), read once by a small vision model. */
export async function layoutFromImage(url: string): Promise<{ layout: DesignLayout; model: string; cost: number }> {
  const st = useStore.getState();
  const pick = pickVisionModel(st.models, st.settings.visionModel);
  if (!pick) throw new Error('Aucun modèle vision disponible pour lire ce design.');
  const r = await complete(
    {
      model: pick.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: LAYOUT_PROMPT }, { type: 'image_url', image_url: { url } }] }],
      maxTokens: 700,
      temperature: 0,
    },
    { models: st.models, fallbacks: pick.fallbacks, effort: 'auto', maxRetries: 1 },
  );
  const layout = parseLayout(r.content);
  if (!layout) throw new Error('La mise en page de cette image n’a pas pu être lue ; choisissez-en une autre.');
  return { layout, model: r.model, cost: r.cost };
}
