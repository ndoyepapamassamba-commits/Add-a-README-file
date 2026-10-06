// Style DNA — default value LOCKED: 2D high-quality Franco-African TV-series cartoon (owner's decision).
// It is injected in EVERY generation and only changes on explicit request.
import type { StyleDNA } from './types';

export const DEFAULT_STYLE_ID = 'style-2d-hq-franco-africain';

export const STYLE_2D_HQ: StyleDNA = Object.freeze({
  id: DEFAULT_STYLE_ID,
  name: '2D HQ franco-africain (série TV moderne)',
  locked: true,
  color:
    'flat saturated colors, warm West-African palette (ochre, terracotta, wax-print pinks and purples), clean color blocking',
  lighting: 'flat cel shading with a single soft shadow tone, no gradients, no glow',
  material: 'flat fills, fabric patterns rendered as clean vector motifs (wax prints, gingham)',
  camera: 'simple stage-like framing, eye-level, medium shots and close-ups for expressions',
  lens: 'neutral flat perspective (2D, no lens distortion)',
  depth:
    'layered 2D backgrounds with light atmospheric perspective, characters clearly separated from the background',
  contrast: 'medium-high contrast, bold readable silhouettes',
  texture: 'smooth, no photographic texture, no film grain',
  characterDesign:
    'modern French-African TV cartoon: clean uniform black outlines, expressive oversized eyes and eyebrows, exaggerated comedic facial expressions, simple readable hands',
  environmentDesign:
    'stylised Dakar environments: colourful houses, markets, courtyards, flat painted backgrounds',
  animationStyle: '2D cut-out puppet animation, limited animation, expressive poses',
  renderStyle: '2D digital cartoon illustration, crisp black linework, flat color fills, one shadow tone',
  postProcessing: 'none (no bloom, no grain, no blur)',
  negative:
    '3D render, CGI, Pixar, photorealistic, photograph, realistic skin, volumetric lighting, depth of field blur, brand logos, real trademarks, text, watermark, signature, deformed hands, extra fingers',
}) as StyleDNA;

export const STYLE_DIMENSIONS: (keyof StyleDNA)[] = [
  'color',
  'lighting',
  'material',
  'camera',
  'lens',
  'depth',
  'contrast',
  'texture',
  'characterDesign',
  'environmentDesign',
  'animationStyle',
  'renderStyle',
  'postProcessing',
];

/** Compact one-paragraph rendering of the style for prompts. */
export function styleLine(
  s: StyleDNA,
  dims: (keyof StyleDNA)[] = ['renderStyle', 'characterDesign', 'color', 'lighting', 'environmentDesign'],
): string {
  return dims
    .map((d) => String(s[d] ?? '').trim())
    .filter(Boolean)
    .join('; ');
}
/** A variant derived from a reference image; never replaces a locked style unless the owner asks. */
export function deriveStyle(
  base: StyleDNA,
  o: { id: string; name: string; referenceAssetId: string; notes?: string },
): StyleDNA {
  return {
    ...base,
    id: o.id,
    name: o.name,
    locked: false,
    referenceAssetId: o.referenceAssetId,
    renderStyle: o.notes ? `${base.renderStyle}; ${o.notes}` : base.renderStyle,
  };
}
