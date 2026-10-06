// Style DNA — default value LOCKED: 2D high-quality Franco-African TV-series cartoon (owner's decision).
// It is injected in EVERY generation and only changes on explicit request.
import type { StyleDNA } from './types';

export const DEFAULT_STYLE_ID = 'style-2d-hq-franco-africain';
export const STYLE_3D_ID = 'style-3d-afrikatoon-stylise';

export const STYLE_2D_HQ: StyleDNA = Object.freeze({
  id: DEFAULT_STYLE_ID,
  name: '2D HQ franco-africain (série TV moderne)',
  dimension: '2D',
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

/** 3D option: same pipeline, stylised 3D animation (Afrikatoon). Locked like the 2D default; chosen per production. */
export const STYLE_3D_AFRIKATOON: StyleDNA = Object.freeze({
  id: STYLE_3D_ID,
  name: '3D Afrikatoon (animation 3D stylisée, Afrique de l’Ouest)',
  dimension: '3D',
  locked: true,
  color:
    'vivid saturated colors, warm West-African palette (ochre, terracotta, wax-print pinks and purples), rich but readable',
  lighting: 'soft cinematic key light with warm bounce light, gentle rim light, readable shadows',
  material: 'stylised materials: soft skin shading, fabric with wax-print textures, slightly glossy eyes',
  camera: 'dynamic animated-feature camera, medium shots and close-ups on expressions, gentle parallax',
  lens: 'cinematic 35mm-equivalent perspective with mild depth of field',
  depth: 'layered 3D sets with atmospheric depth, characters clearly separated from the background',
  contrast: 'medium-high contrast, readable silhouettes',
  texture: 'clean stylised textures, no photographic noise',
  characterDesign:
    'stylised 3D animated-feature characters: expressive oversized eyes, strong comedic facial expressions, consistent proportions, clear readable hands',
  environmentDesign:
    'stylised West-African environments (Dakar streets, courtyards, markets) built as 3D sets',
  animationStyle: 'expressive 3D character animation, snappy comedic timing, squash and stretch on reactions',
  renderStyle: 'high quality stylised 3D animation render, soft global illumination, clean stylised shading',
  postProcessing: 'subtle color grading only',
  negative:
    'flat 2D, hand-drawn sketch, photorealistic live action, photograph, uncanny realistic skin, brand logos, real trademarks, text, watermark, signature, deformed hands, extra fingers',
}) as StyleDNA;

export type Dimension = '2D' | '3D';
export const STYLE_PRESETS: Record<Dimension, StyleDNA> = { '2D': STYLE_2D_HQ, '3D': STYLE_3D_AFRIKATOON };
export const dimensionOf = (s: Pick<StyleDNA, 'dimension'>): Dimension =>
  s.dimension === '3D' ? '3D' : '2D';
/** Task-style tag used by the champion memory (2D and 3D keep separate histories). */
export const styleTag = (s: StyleDNA): string =>
  s.id === DEFAULT_STYLE_ID ? '2D-HQ' : s.id === STYLE_3D_ID ? '3D-STYLISED' : s.name;
/** Quality sentence of the prompts, per dimension. */
export const qualityLine = (s: StyleDNA, what: 'illustration' | 'character sheet'): string =>
  dimensionOf(s) === '3D'
    ? `high quality stylised 3D ${what === 'illustration' ? 'render' : 'character turnaround'}, clean readable composition`
    : `high quality 2D ${what}, ${what === 'illustration' ? 'clean readable composition' : 'consistent proportions'}`;
export const redrawInstruction = (s: StyleDNA): string =>
  `Redraw this exact character in the target ${dimensionOf(s)} style. Keep the same face, pose, outfit, fabric patterns and proportions. Plain white background. No logo, no text.`;

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
