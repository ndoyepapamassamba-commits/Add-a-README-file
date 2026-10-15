// IMAGES DU PROJET VIDÉO 3D — planches des personnages, galeries et décors du propriétaire (son propre art, dossier
// privé .private/troupe, jamais publié) embarqués dans le fichier HTML à la construction (virtual:troupe-kit). Les
// décors arrivent avec leur carte de profondeur déjà calculée (Depth Anything V2, scripts/troupe-enhance.py) : la
// scène 3D est immédiate, sans modèle à charger.
import kit from 'virtual:troupe-kit';
import type { DepthMap } from './depth';
import type { PackDecor } from '../../../server/jev/videogen/troupePack';

export interface ProjectImage {
  id: string;
  name: string;
  kind: 'décor' | 'personnage' | 'galerie';
  src: string;
  depth?: string;
  /** The set rebuilt behind its people (LaMa), its depth and its masks — data URLs. */
  layers?: { plate: string; plateDepth: string; masks: string };
}
/** The project's pictures; `decors` = the sets when they come from packs (troupePacks.ts), else the embedded ones. */
export function projectImages(decors: PackDecor[] = kit?.decors ?? []): ProjectImage[] {
  if (!kit) return [];
  return [
    ...decors.map((d, i) => ({ id: `d${i}`, name: d.name, kind: 'décor' as const, src: d.src, depth: d.depth, layers: d.plate && d.plateDepth && d.masks ? { plate: d.plate, plateDepth: d.plateDepth, masks: d.masks } : undefined })),
    ...kit.planches.map((p, i) => ({ id: `p${i}`, name: p.name, kind: 'personnage' as const, src: p.src })),
    ...kit.galeries.map((g, i) => ({ id: `g${i}`, name: g.names.slice(0, 3).join(', ') || `Galerie ${i + 1}`, kind: 'galerie' as const, src: g.src })),
  ];
}
/** The project's precomputed depth map (white = near) as a DepthMap. */
export async function projectDepth(src: string): Promise<DepthMap> {
  const t0 = performance.now();
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const data = new Float32Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4]! / 255;
  return { data, w: c.width, h: c.height, source: 'carte du projet (Depth Anything V2)', ms: Math.round(performance.now() - t0) };
}
