/**
 * Outils PixiJS v8 du rendu : maillages à géométrie libre (attributs mis à jour à chaque image), programmes
 * partagés, chargement d'images sans « teinter » les canevas (fetch → blob → image), lecture des pixels.
 */
import { Buffer, BufferUsage, CanvasSource, Geometry, GlProgram, ImageSource, Mesh, Shader, Texture, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';

/** Programme GL mis en cache par nom. */
const PROGRAMMES = new Map<string, GlProgram>();

export function programme(nom: string, vertex: string, fragment: string): GlProgram {
  let p = PROGRAMMES.get(nom);
  if (!p) {
    p = GlProgram.from({ vertex, fragment, name: nom });
    PROGRAMMES.set(nom, p);
  }
  return p;
}

/** Description d'un attribut : nom, composantes, données initiales. */
export interface Attribut {
  nom: string;
  composantes: 1 | 2 | 4;
  /** Données initiales, ou tampon existant à partager avec un autre maillage. */
  donnees: Float32Array | Buffer;
}

/** Maillage libre : géométrie + accès direct aux tampons. */
export interface MaillageLibre {
  mesh: Mesh<Geometry, Shader>;
  geometrie: Geometry;
  tampons: Record<string, Buffer>;
  indices: Buffer;
}

function format(c: 1 | 2 | 4): 'float32' | 'float32x2' | 'float32x4' {
  return c === 1 ? 'float32' : c === 2 ? 'float32x2' : 'float32x4';
}

/** Crée un maillage à géométrie libre avec un shader donné. */
export function creerMaillage(attributs: Attribut[], indices: Uint32Array, shader: Shader): MaillageLibre {
  const tampons: Record<string, Buffer> = {};
  const attrs: Record<string, { buffer: Buffer; format: ReturnType<typeof format> }> = {};
  for (const a of attributs) {
    const b =
      a.donnees instanceof Buffer
        ? a.donnees
        : new Buffer({ data: a.donnees, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST, label: a.nom });
    tampons[a.nom] = b;
    attrs[a.nom] = { buffer: b, format: format(a.composantes) };
  }
  const tIndices = new Buffer({ data: indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST, label: 'indices' });
  const geometrie = new Geometry({ attributes: attrs, indexBuffer: tIndices });
  const mesh = new Mesh<Geometry, Shader>({ geometry: geometrie, shader });
  return { mesh, geometrie, tampons, indices: tIndices };
}

/** Remplace les données d'un tampon (redimensionne si besoin). */
export function majTampon(b: Buffer, donnees: Float32Array | Uint32Array): void {
  if (b.data === donnees) {
    b.update();
    return;
  }
  b.data = donnees;
}

/** Crée un shader avec un groupe d'uniformes `u` et des textures. */
export function creerShader(
  prog: GlProgram,
  uniformes: Record<string, { value: number | number[] | Float32Array; type: string }>,
  textures: Record<string, TextureSource>,
): Shader {
  const groupe = new UniformGroup(uniformes as never);
  return new Shader({ glProgram: prog, resources: { u: groupe, ...textures } });
}

/** Groupe d'uniformes d'un shader créé par `creerShader`. */
export function uniformes(s: Shader): Record<string, unknown> {
  return (s.resources.u as UniformGroup).uniforms as Record<string, unknown>;
}

/** Télécharge une ressource et la décode en image (sans teinter les canevas : URL de blob locale). */
export async function chargerImage(url: string): Promise<HTMLImageElement> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Ressource introuvable (${r.status}) : ${url}`);
  const blob = await r.blob();
  const objet = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'sync';
  img.src = objet;
  await img.decode();
  return img;
}

/** Pixels RGBA d'une image, éventuellement redimensionnée. */
export function lirePixels(img: CanvasImageSource & { width: number; height: number }, largeur?: number, hauteur?: number): ImageData {
  const L = largeur ?? img.width;
  const H = hauteur ?? Math.round((img.height * L) / img.width);
  const c = document.createElement('canvas');
  c.width = L;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, L, H);
  return ctx.getImageData(0, 0, L, H);
}

/** Texture depuis une image (alpha prémultiplié au chargement, filtrage linéaire, mipmaps facultatives). */
export function textureImage(img: HTMLImageElement, mipmaps = false): Texture {
  const source = new ImageSource({
    resource: img,
    autoGenerateMipmaps: mipmaps,
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
  if (mipmaps) source.style.mipmapFilter = 'linear';
  return new Texture({ source });
}

/** Texture depuis des pixels RGBA (non prémultipliés). */
export function texturePixels(donnees: Uint8ClampedArray, L: number, H: number, mipmaps = false): Texture {
  const c = document.createElement('canvas');
  c.width = L;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(donnees as Uint8ClampedArray<ArrayBuffer>, L, H), 0, 0);
  const source = new CanvasSource({ resource: c, autoGenerateMipmaps: mipmaps, scaleMode: 'linear', addressMode: 'clamp-to-edge' });
  if (mipmaps) source.style.mipmapFilter = 'linear';
  return new Texture({ source });
}
