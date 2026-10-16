/**
 * Mesures sur les PIXELS du MP4 (complément de la porte sur l'état) : sans flot optique, des indicateurs simples et
 * robustes calculés sur la luminance réduite (108×192) de chaque image décodée :
 * - différence absolue moyenne entre images consécutives (répartition c50 / c95 / max) ;
 * - degré de dynamique : part des transitions où l'image change visiblement ;
 * - images figées : plus longue suite d'images quasi identiques hors gel voulu ;
 * - sauts de lumière : variation brutale de la luminance moyenne hors coupe, fondu ou flash.
 * Et la planche contact : 12 instants répartis, numéro d'image et temps incrustés.
 */
import { existsSync } from 'node:fs';
import { executer, FFMPEG } from '../export/processus';
import { centile, moyenne } from './metriques';
import type { MesureQualite, RapportQualite } from './types';

const LARGEUR_ANALYSE = 108;
const HAUTEUR_ANALYSE = 192;

/** Options de l'analyse. */
export interface OptionsPixels {
  fps: number;
  /** Index absolu de la première image du fichier. */
  premiereImage?: number;
  /** Images (absolues) qui commencent un nouveau plan : grande différence permise. */
  coupes?: readonly number[];
  /** Intervalles (s, absolus) de gel voulu : images figées permises. */
  gels?: ReadonlyArray<{ debut: number; fin: number }>;
  /** Images (absolues) touchées par un fondu ou un flash : variation de lumière permise. */
  effets?: ReadonlySet<number> | readonly number[];
}

/** Mesures sur les pixels. */
export interface MesuresPixels {
  images: number;
  /** Différence absolue moyenne entre images consécutives (niveaux sur 255). */
  difference: { moyenne: number; c50: number; c95: number; max: number };
  /** Part des transitions (hors coupes) où l'image change visiblement (différence > `SEUIL_DYNAMIQUE`). */
  dynamique: number;
  /** Plus longue suite d'images quasi identiques hors gel (s) et sa première image. */
  figeMax: number;
  figeDebut: number | null;
  /** Images (absolues) où la luminance moyenne saute hors coupe et hors effet. */
  sautsLumiere: number[];
  luminance: { min: number; max: number; moyenne: number };
  /** Différence par transition (pour les graphes), index relatif. */
  serie: number[];
}

/** Différence moyenne (niveaux) au-delà de laquelle une transition « bouge » visiblement. */
export const SEUIL_DYNAMIQUE = 0.25;
/** Différence moyenne en deçà de laquelle deux images sont quasi identiques. */
export const SEUIL_FIGE = 0.03;
/** Variation de luminance moyenne (niveaux) considérée comme un saut de lumière. */
export const SEUIL_SAUT_LUMIERE = 6;

/** Luminance réduite de chaque image (Y, 108×192). */
export async function luminancesReduites(fichier: string): Promise<Uint8Array[]> {
  if (!existsSync(fichier)) throw new Error(`Vidéo introuvable : ${fichier}`);
  const r = await executer(FFMPEG, [
    '-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-map', '0:v:0',
    '-vf', `format=gray,scale=${LARGEUR_ANALYSE}:${HAUTEUR_ANALYSE}:flags=area`,
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
  ]);
  if (r.code !== 0) throw new Error(`Analyse des pixels : ${r.stderr.slice(-300)}`);
  const t = LARGEUR_ANALYSE * HAUTEUR_ANALYSE;
  const out: Uint8Array[] = [];
  for (let o = 0; o + t <= r.stdout.length; o += t) out.push(new Uint8Array(r.stdout.subarray(o, o + t)));
  return out;
}

/** Calcule les mesures sur des luminances déjà décodées (pur, testable). */
export function mesurerLuminances(images: readonly Uint8Array[], o: OptionsPixels): MesuresPixels {
  const p0 = o.premiereImage ?? 0;
  const coupes = new Set(o.coupes ?? []);
  const effets = new Set(o.effets ?? []);
  const enGel = (abs: number): boolean => (o.gels ?? []).some((g) => abs / o.fps >= g.debut - 0.5 / o.fps && abs / o.fps < g.fin + 0.5 / o.fps);
  const lum = images.map((im) => {
    let s = 0;
    for (let i = 0; i < im.length; i++) s += im[i]!;
    return s / Math.max(1, im.length);
  });
  const diff: number[] = [];
  for (let k = 1; k < images.length; k++) {
    const a = images[k]!;
    const b = images[k - 1]!;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
    diff.push(s / Math.max(1, a.length));
  }
  const horsCoupe: number[] = [];
  diff.forEach((d, i) => {
    if (!coupes.has(p0 + i + 1)) horsCoupe.push(d);
  });
  // Images figées
  let figeMax = 0;
  let figeDebut: number | null = null;
  let debut = -1;
  const clore = (fin: number): void => {
    if (debut < 0) return;
    let compte = 0;
    for (let k = debut; k <= fin; k++) if (!enGel(p0 + k)) compte++;
    const duree = compte / o.fps;
    if (duree > figeMax) {
      figeMax = duree;
      figeDebut = p0 + debut;
    }
  };
  for (let i = 0; i < diff.length; i++) {
    const k = i + 1; // transition k-1 → k
    if (diff[i]! < SEUIL_FIGE && !coupes.has(p0 + k)) {
      if (debut < 0) debut = k - 1;
    } else {
      clore(k - 1);
      debut = -1;
    }
  }
  clore(images.length - 1);
  // Sauts de lumière
  const sautsLumiere: number[] = [];
  for (let k = 1; k < lum.length; k++) {
    const abs = p0 + k;
    if (coupes.has(abs) || effets.has(abs) || effets.has(abs - 1)) continue;
    if (Math.abs(lum[k]! - lum[k - 1]!) > SEUIL_SAUT_LUMIERE) sautsLumiere.push(abs);
  }
  return {
    images: images.length,
    difference: { moyenne: moyenne(horsCoupe), c50: centile(horsCoupe, 50), c95: centile(horsCoupe, 95), max: horsCoupe.length ? Math.max(...horsCoupe) : 0 },
    dynamique: horsCoupe.length ? horsCoupe.filter((d) => d > SEUIL_DYNAMIQUE).length / horsCoupe.length : 0,
    figeMax,
    figeDebut,
    sautsLumiere,
    luminance: { min: lum.length ? Math.min(...lum) : 0, max: lum.length ? Math.max(...lum) : 0, moyenne: moyenne(lum) },
    serie: diff,
  };
}

/** Analyse les pixels d'un MP4. */
export async function analyserPixels(fichier: string, o: OptionsPixels): Promise<MesuresPixels> {
  return mesurerLuminances(await luminancesReduites(fichier), o);
}

/** Seuils de la porte sur les pixels. */
export interface SeuilsPixels {
  dynamiqueMin: number;
  figeMax: number;
}

export const SEUILS_PIXELS_DEFAUT: SeuilsPixels = { dynamiqueMin: 0.5, figeMax: 1.5 };

/** Verdict sur les pixels. */
export function portePixels(m: MesuresPixels, fps: number, seuils: Partial<SeuilsPixels> = {}): RapportQualite {
  const S = { ...SEUILS_PIXELS_DEFAUT, ...seuils };
  const f = (x: number): string => x.toFixed(3);
  const mesures: MesureQualite[] = [
    {
      nom: 'degré de dynamique (images qui changent)',
      valeur: m.dynamique,
      seuil: `≥ ${S.dynamiqueMin}`,
      ok: m.dynamique >= S.dynamiqueMin,
      detail: `différence moyenne ${f(m.difference.moyenne)} niveaux (c50 ${f(m.difference.c50)}, c95 ${f(m.difference.c95)}, max ${f(m.difference.max)}) ; seuil de mouvement ${SEUIL_DYNAMIQUE}`,
    },
    {
      nom: 'images figées hors gel',
      valeur: m.figeMax,
      unite: 's',
      seuil: `≤ ${S.figeMax}`,
      ok: m.figeMax <= S.figeMax,
      ...(m.figeDebut !== null && m.figeMax > S.figeMax ? { detail: `à partir de l'image ${m.figeDebut}` } : {}),
    },
    {
      nom: 'sauts de lumière hors coupe',
      valeur: m.sautsLumiere.length,
      seuil: '= 0',
      ok: m.sautsLumiere.length === 0,
      ...(m.sautsLumiere.length ? { detail: `images ${m.sautsLumiere.slice(0, 10).join(', ')}` } : {}),
    },
  ];
  return {
    verdict: mesures.every((x) => x.ok || x.bloquant === false) ? 'PASS' : 'FAIL',
    mesures,
    portee: 'pixels du MP4',
    images: m.images,
    fps,
    details: { difference: m.difference, luminance: m.luminance },
  };
}

/** Police des incrustations (DejaVu, présente sur le système), sinon aucune incrustation. */
const POLICE = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'].find((p) => existsSync(p));

/**
 * Planche contact PNG : `nombre` images réparties (au milieu de tranches égales), en grille de `colonnes`, avec le
 * numéro d'image absolu et le temps. Renvoie les images retenues.
 */
export async function plancheContact(
  fichier: string,
  sortie: string,
  o: { fps: number; images: number; premiereImage?: number; nombre?: number; colonnes?: number; largeurVignette?: number; hauteurVignette?: number },
): Promise<number[]> {
  const nombre = Math.max(1, Math.min(o.nombre ?? 12, o.images));
  const colonnes = Math.min(o.colonnes ?? 4, nombre);
  const lignes = Math.ceil(nombre / colonnes);
  const lv = o.largeurVignette ?? 270;
  const hv = o.hauteurVignette ?? 480;
  const p0 = o.premiereImage ?? 0;
  const choix = [...new Set(Array.from({ length: nombre }, (_, i) => Math.min(o.images - 1, Math.floor(((i + 0.5) * o.images) / nombre))))];
  const select = choix.map((k) => `eq(n\\,${k})`).join('+');
  const texte = POLICE
    ? `,drawtext=fontfile=${POLICE}:text='image %{eif\\:t*${o.fps}+${p0}\\:d}   %{pts\\:hms\\:${(p0 / o.fps).toFixed(6)}}':x=8:y=8:fontsize=${Math.round(lv / 15)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`
    : '';
  const filtre = `select='${select}',format=rgb24,scale=${lv}:${hv}:flags=area${texte},tile=${colonnes}x${lignes}:padding=6:margin=6:color=0x202020`;
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', fichier, '-map', '0:v:0', '-vf', filtre, '-fps_mode', 'passthrough', '-frames:v', '1', '-update', '1', sortie]);
  if (r.code !== 0) throw new Error(`Planche contact : ${r.stderr.slice(-300)}`);
  return choix.map((k) => k + p0);
}
