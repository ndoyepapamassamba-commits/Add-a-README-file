/**
 * Analyse des décors et des personnages dans Node (lecture SUR PLACE, rien n'est copié) : décodage des images du kit
 * par FFmpeg (`/usr/bin/ffmpeg`, sortie RGBA brute réduite), analyse par `analyse-pixels`, mise en cache JSON dans
 * `studio-troupe/sorties/cache/analyses-decors/` (dossier ignoré par git ; la clé suit la taille et la date des
 * fichiers). Les statistiques de couleur d'un rig sont tirées de son PNG (pngjs).
 *
 * Node seulement : ne pas importer depuis la page de rendu (elle fait la même analyse avec le navigateur).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { DOSSIER_SORTIES } from '../outils/kit';
import type { AnalyseDecor, CharacterRig, InfoDecor, Ressources, StatsLab } from '../timeline/types';
import { analyserPixelsDecor, type PixelsRGBA } from './analyse-pixels';
import { statsLabImage } from './couleur';

/** Dossier du cache des analyses (ignoré par git). */
export const DOSSIER_CACHE_ANALYSES = join(DOSSIER_SORTIES, 'cache', 'analyses-decors');

/** Version de l'algorithme (invalide le cache quand elle change). */
const VERSION_ANALYSE = 5;

/** Décode une image (JPEG, PNG…) en RGBA 8 bits, redimensionnée à `largeur` (hauteur proportionnelle). */
export function decoderImage(chemin: string, largeur?: number): PixelsRGBA {
  const filtre = largeur ? ['-vf', `scale=${largeur}:-2:flags=area`] : [];
  const args = ['-v', 'error', '-nostdin', '-i', chemin, ...filtre, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) throw new Error(`Décodage impossible (${chemin}) : ${r.stderr?.toString() ?? r.error}`);
  const sonde = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', chemin]);
  const [l0, h0] = sonde.stdout.toString().trim().split(',').map(Number);
  let L = l0!;
  let H = h0!;
  if (largeur) {
    L = largeur;
    H = Math.round((largeur * h0!) / l0! / 2) * 2;
  }
  const donnees = new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length);
  if (donnees.length !== L * H * 4) {
    // Hauteur arrondie différemment par FFmpeg : on la déduit de la taille reçue.
    H = Math.floor(donnees.length / (4 * L));
  }
  return { largeur: L, hauteur: H, donnees };
}

function cleFichiers(chemins: readonly string[]): string {
  return chemins
    .map((c) => {
      const s = statSync(c);
      return `${s.size}:${Math.round(s.mtimeMs)}`;
    })
    .join('|');
}

/** Analyse un décor (avec cache disque). */
export function analyserDecor(info: InfoDecor, options: { cache?: string | false; largeur?: number } = {}): AnalyseDecor {
  const f = info.fichiers;
  const cle = `${VERSION_ANALYSE}|${info.fit.mH}|${info.fit.floor}|${cleFichiers([f.plate, f.masks, f.plateDepth])}`;
  const dossier = options.cache === false ? null : (options.cache ?? DOSSIER_CACHE_ANALYSES);
  const fichierCache = dossier ? join(dossier, `${info.id}.json`) : null;
  if (fichierCache && existsSync(fichierCache)) {
    try {
      const c = JSON.parse(readFileSync(fichierCache, 'utf8')) as { cle: string; analyse: AnalyseDecor };
      if (c.cle === cle) return c.analyse;
    } catch {
      // cache illisible : on recalcule
    }
  }
  const largeur = options.largeur ?? 256;
  const plaque = decoderImage(f.plate, largeur);
  const masques = decoderImage(f.masks, largeur);
  const profondeur = decoderImage(f.plateDepth, largeur);
  const analyse = analyserPixelsDecor(plaque, masques, profondeur, info.fit);
  if (dossier && fichierCache) {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(fichierCache, JSON.stringify({ cle, analyse }));
  }
  return analyse;
}

/** Décors complétés de leur analyse (les décors déjà analysés sont conservés tels quels). */
export function enrichirDecors(decors: Record<string, InfoDecor>, ids?: readonly string[]): Record<string, InfoDecor> {
  const r: Record<string, InfoDecor> = {};
  for (const [id, d] of Object.entries(decors)) {
    r[id] = d.analyse || (ids && !ids.includes(id)) ? d : { ...d, analyse: analyserDecor(d) };
  }
  return r;
}

/** Statistiques Lab d'une image de personnage (PNG détouré). */
export function statsCouleurImage(chemin: string): StatsLab {
  const png = PNG.sync.read(readFileSync(chemin));
  return statsLabImage(png.data, png.width, png.height, { pas: 2, seuilAlpha: 0.5 });
}

/** Rig complété de ses statistiques de couleur. */
export function enrichirRig(rig: CharacterRig): CharacterRig {
  if (rig.couleur || !existsSync(rig.image.chemin)) return rig;
  const s = statsCouleurImage(rig.image.chemin);
  const a = (v: readonly number[]): [number, number, number] => [arrondir(v[0]!), arrondir(v[1]!), arrondir(v[2]!)];
  return { ...rig, couleur: { moyenne: a(s.moyenne), ecart: a(s.ecart) } };
}

/** Ressources complétées : analyses des décors utilisés et statistiques de couleur des rigs. */
export function enrichirRessources(ressources: Ressources, decorsUtilises?: readonly string[]): Ressources {
  const rigs: Record<string, CharacterRig> = {};
  for (const [id, r] of Object.entries(ressources.rigs)) rigs[id] = enrichirRig(r);
  return { rigs, decors: enrichirDecors(ressources.decors, decorsUtilises) };
}

function arrondir(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}
