/**
 * Vérification d'un MP4 produit : rien n'est annoncé sans fichier réel, décodé en entier et contrôlé.
 *
 * Contrôles (bloquants sauf mention) :
 * - ffprobe : H.264 High, taille, yuv420p, cadence exacte, étiquettes BT.709 / échelle TV ;
 * - nombre d'images décodées (`-count_frames`) = nombre attendu, durée = images / fps ;
 * - décodage intégral (`ffmpeg -v error -i f -f null -`) sans aucune erreur ;
 * - horodatage de chaque image décodée = n / fps (ni trou, ni doublon temporel) ;
 * - échantillons : l'image n du MP4 ressemble à l'image n capturée (PSNR) et davantage qu'aux images n ± 1
 *   (ni image perdue, ni image décalée) ;
 * - images identiques consécutives inattendues (empreintes MD5 du décodage comparées aux empreintes de capture)
 *   [avertissement] ;
 * - piste audio AAC 48 kHz stéréo, durée = durée vidéo à une image près ; sonie −14 ± 1 LUFS et crête vraie
 *   ≤ −1 dBTP (sauf piste de silence) ;
 * - atome `moov` avant `mdat` (lecture immédiate en ligne, `+faststart`).
 *
 * Écrit un rapport JSON et Markdown (français).
 */
import { closeSync, existsSync, openSync, readSync, statSync, writeFileSync } from 'node:fs';
import { executer, FFMPEG, ffprobeJson, lireRationnel, versionsOutils } from './processus';

/** Ce que la vidéo doit être. */
export interface AttentesVideo {
  largeur: number;
  hauteur: number;
  fps: number;
  /** Nombre d'images attendu. */
  images: number;
  /** Une piste audio est attendue. */
  audio: boolean;
  /** La piste audio est un silence volontaire (aucune source) : pas de contrôle de sonie. */
  audioSilencieux?: boolean;
  /** Index absolu de la première image du fichier (rendu partiel `--de`). */
  premiereImage?: number;
  /** Images capturées de référence : index absolu → fichier image. */
  references?: Record<number, string>;
  /** Empreintes de capture, une par image du fichier (ordre). */
  empreintes?: readonly string[];
  cibleLufs?: number;
  toleranceLufs?: number;
  creteMax?: number;
  /** PSNR minimal d'un échantillon (dB, mesuré au quart de la définition ; défaut 30). */
  psnrMin?: number;
  /** Codec vidéo attendu (défaut h264) et profil (défaut High). */
  codec?: string;
  profil?: string;
}

/** Un contrôle. */
export interface Controle {
  nom: string;
  ok: boolean;
  /** Un contrôle non bloquant échoué donne un avertissement, pas un échec. */
  bloquant: boolean;
  valeur: string;
  attendu: string;
  detail?: string;
}

/** Échantillon comparé. */
export interface EchantillonVerifie {
  image: number;
  psnr: number;
  /** PSNR contre les références des images voisines (si elles diffèrent de la référence). */
  voisins: Array<{ image: number; psnr: number }>;
  ok: boolean;
}

/** Rapport de vérification. */
export interface RapportVerification {
  fichier: string;
  taille: number;
  ok: boolean;
  avertissements: number;
  date: string;
  controles: Controle[];
  video: {
    codec: string;
    profil: string;
    largeur: number;
    hauteur: number;
    pixFmt: string;
    fps: number;
    imagesConteneur: number;
    imagesDecodees: number;
    duree: number;
    debit: number;
    couleur: { primaires: string; transfert: string; matrice: string; echelle: string };
  } | null;
  audio: { codec: string; frequence: number; canaux: number; duree: number } | null;
  sonie: { integre: number; creteVraie: number; plage: number } | null;
  echantillons: EchantillonVerifie[];
  doublons: { decodes: number; attendus: number; inattendus: number[] };
  ordreAtomes: string[];
  outils: { ffmpeg: string; ffprobe: string; configuration: string };
}

interface FluxProbe {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  duration?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  color_primaries?: string;
  color_transfer?: string;
  color_space?: string;
  color_range?: string;
}

/** Atomes MP4 de premier niveau, dans l'ordre du fichier. */
export function atomesPremierNiveau(fichier: string, max = 64): string[] {
  const fd = openSync(fichier, 'r');
  const taille = statSync(fichier).size;
  const atomes: string[] = [];
  try {
    let pos = 0;
    const tete = Buffer.alloc(16);
    while (pos + 8 <= taille && atomes.length < max) {
      readSync(fd, tete, 0, 16, pos);
      let t = tete.readUInt32BE(0);
      const type = tete.toString('latin1', 4, 8);
      if (t === 1) t = Number(tete.readBigUInt64BE(8));
      else if (t === 0) t = taille - pos;
      if (t < 8) break;
      atomes.push(type);
      pos += t;
    }
  } finally {
    closeSync(fd);
  }
  return atomes;
}

/** PSNR (dB) entre deux images de mêmes dimensions (octets RVB). */
export function psnr(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  const mse = s / a.length;
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/** Décode un fichier image en RVB 24 bits à la taille donnée (FFmpeg). */
async function imageRvb(fichier: string, l: number, h: number): Promise<Uint8Array> {
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-frames:v', '1', '-vf', `format=rgb24,scale=${l}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  if (r.code !== 0) throw new Error(`Décodage de ${fichier} : ${r.stderr.slice(-300)}`);
  return new Uint8Array(r.stdout);
}

/**
 * Décode des images précises (index dans le fichier) d'une vidéo en RVB 24 bits réduit. La conversion en RVB se fait
 * AVANT la réduction : réduire directement du yuv420p avec `flags=area` donne une image fausse (mesuré : 16 dB au
 * lieu de 42 dB sur une mire).
 */
async function imagesVideo(fichier: string, indices: readonly number[], l: number, h: number): Promise<Map<number, Uint8Array>> {
  const tries = [...new Set(indices)].sort((x, y) => x - y);
  const res = new Map<number, Uint8Array>();
  if (tries.length === 0) return res;
  const select = tries.map((i) => `eq(n\\,${i})`).join('+');
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-map', '0:v:0', '-vf', `select='${select}',format=rgb24,scale=${l}:${h}:flags=area`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  if (r.code !== 0) throw new Error(`Extraction d'échantillons : ${r.stderr.slice(-300)}`);
  const t = l * h * 3;
  tries.forEach((i, k) => {
    if ((k + 1) * t <= r.stdout.length) res.set(i, new Uint8Array(r.stdout.subarray(k * t, (k + 1) * t)));
  });
  return res;
}

/** Empreintes MD5 et horodatages (s) de chaque image décodée (`-f framemd5`). */
export async function empreintesDecodees(fichier: string): Promise<Array<{ pts: number; md5: string }>> {
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'framemd5', '-']);
  if (r.code !== 0) throw new Error(`framemd5 : ${r.stderr.slice(-300)}`);
  let tb = Number.NaN;
  const out: Array<{ pts: number; md5: string }> = [];
  for (const ligne of r.stdout.toString('utf8').split('\n')) {
    if (ligne.startsWith('#tb')) {
      tb = lireRationnel(ligne.split(':')[1]?.trim());
      continue;
    }
    if (!ligne || ligne.startsWith('#')) continue;
    const c = ligne.split(',').map((x) => x.trim());
    if (c.length < 6) continue;
    out.push({ pts: Number(c[2]) * tb, md5: c[5]! });
  }
  return out;
}

/** Sonie intégrée et crête vraie de la piste audio (filtre `ebur128`). */
export async function mesurerSonie(fichier: string): Promise<{ integre: number; creteVraie: number; plage: number } | null> {
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'info', '-i', fichier, '-map', '0:a:0', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  if (r.code !== 0) return null;
  const resume = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lire = (re: RegExp): number => {
    const m = re.exec(resume);
    return m ? Number(m[1]) : Number.NaN;
  };
  return { integre: lire(/I:\s+(-?[\d.]+|-inf)\s+LUFS/), creteVraie: lire(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/), plage: lire(/LRA:\s+(-?[\d.]+)\s+LU/) };
}

/** Vérifie un MP4 contre les attentes. Ne lève pas d'erreur sur un fichier défectueux : le rapport le dit. */
export async function verifierVideo(fichier: string, attentes: AttentesVideo): Promise<RapportVerification> {
  const controles: Controle[] = [];
  const ajouter = (nom: string, ok: boolean, valeur: string, attendu: string, bloquant = true, detail?: string): void => {
    controles.push({ nom, ok, bloquant, valeur, attendu, ...(detail ? { detail } : {}) });
  };
  const rapport: RapportVerification = {
    fichier,
    taille: 0,
    ok: false,
    avertissements: 0,
    date: new Date().toISOString(),
    controles,
    video: null,
    audio: null,
    sonie: null,
    echantillons: [],
    doublons: { decodes: 0, attendus: 0, inattendus: [] },
    ordreAtomes: [],
    outils: versionsOutils(),
  };
  const fps = attentes.fps;
  const N = attentes.images;
  const clore = (): RapportVerification => {
    rapport.ok = controles.every((c) => c.ok || !c.bloquant);
    rapport.avertissements = controles.filter((c) => !c.ok && !c.bloquant).length;
    return rapport;
  };

  if (!existsSync(fichier)) {
    ajouter('fichier présent', false, 'absent', 'fichier MP4');
    return clore();
  }
  rapport.taille = statSync(fichier).size;
  ajouter('fichier non vide', rapport.taille > 1024, `${rapport.taille} octets`, '> 1 Kio');

  // 1. ffprobe (avec décompte des images décodées)
  let flux: FluxProbe[] = [];
  let format: { duration?: string; format_name?: string; bit_rate?: string } = {};
  try {
    const j = await ffprobeJson(['-count_frames', '-show_format', '-show_streams', fichier]);
    flux = (j.streams as FluxProbe[]) ?? [];
    format = (j.format as typeof format) ?? {};
    ajouter('lecture ffprobe', true, format.format_name ?? '?', 'mov,mp4');
  } catch (e) {
    ajouter('lecture ffprobe', false, (e as Error).message, 'fichier lisible');
    return clore();
  }
  const v = flux.find((s) => s.codec_type === 'video');
  const a = flux.find((s) => s.codec_type === 'audio');
  if (!v) {
    ajouter('piste vidéo', false, 'absente', 'une piste vidéo');
    return clore();
  }
  const fpsLu = lireRationnel(v.r_frame_rate);
  const fpsMoyen = lireRationnel(v.avg_frame_rate);
  const imagesDecodees = Number(v.nb_read_frames ?? Number.NaN);
  const imagesConteneur = Number(v.nb_frames ?? Number.NaN);
  const dureeV = Number(v.duration ?? format.duration ?? Number.NaN);
  rapport.video = {
    codec: v.codec_name ?? '?',
    profil: v.profile ?? '?',
    largeur: v.width ?? 0,
    hauteur: v.height ?? 0,
    pixFmt: v.pix_fmt ?? '?',
    fps: fpsLu,
    imagesConteneur,
    imagesDecodees,
    duree: dureeV,
    debit: Number(v.bit_rate ?? Number.NaN),
    couleur: { primaires: v.color_primaries ?? '?', transfert: v.color_transfer ?? '?', matrice: v.color_space ?? '?', echelle: v.color_range ?? '?' },
  };
  const codec = attentes.codec ?? 'h264';
  const profil = attentes.profil ?? 'High';
  ajouter('codec vidéo', v.codec_name === codec, v.codec_name ?? '?', codec);
  ajouter('profil', v.profile === profil, v.profile ?? '?', profil);
  ajouter('dimensions', v.width === attentes.largeur && v.height === attentes.hauteur, `${v.width}×${v.height}`, `${attentes.largeur}×${attentes.hauteur}`);
  ajouter('format de pixels', v.pix_fmt === 'yuv420p', v.pix_fmt ?? '?', 'yuv420p');
  ajouter('cadence', Math.abs(fpsLu - fps) < 1e-9 && Math.abs(fpsMoyen - fps) < 1e-6, `${v.r_frame_rate} (moyenne ${v.avg_frame_rate})`, `${fps}/1`);
  ajouter(
    'étiquettes couleur BT.709',
    v.color_primaries === 'bt709' && v.color_transfer === 'bt709' && v.color_space === 'bt709' && v.color_range === 'tv',
    `${v.color_primaries}/${v.color_transfer}/${v.color_space}/${v.color_range}`,
    'bt709/bt709/bt709/tv',
  );
  ajouter('images décodées', imagesDecodees === N, String(imagesDecodees), String(N));
  ajouter('images annoncées par le conteneur', imagesConteneur === N, String(imagesConteneur), String(N));
  ajouter('durée vidéo', Math.abs(dureeV - N / fps) <= 0.5 / fps, `${dureeV.toFixed(4)} s`, `${(N / fps).toFixed(4)} s ± ½ image`);

  // 2. Décodage intégral sans erreur
  const dec = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-map', '0', '-f', 'null', '-']);
  const erreursDec = dec.stderr.split('\n').filter((l) => l.trim()).length;
  ajouter('décodage intégral', dec.code === 0 && erreursDec === 0, dec.code === 0 ? `${erreursDec} message(s) d'erreur` : `code ${dec.code}`, '0 erreur', true, erreursDec ? dec.stderr.slice(0, 400) : undefined);

  // 3. Horodatage de chaque image + doublons
  try {
    const ed = await empreintesDecodees(fichier);
    let pire = 0;
    let croissant = true;
    for (let k = 0; k < ed.length; k++) {
      pire = Math.max(pire, Math.abs(ed[k]!.pts - k / fps));
      if (k > 0 && !(ed[k]!.pts > ed[k - 1]!.pts)) croissant = false;
    }
    ajouter(
      'horodatage n / fps',
      ed.length === N && croissant && pire < 0.25 / fps,
      `${ed.length} images, écart max ${(pire * 1000).toFixed(3)} ms${croissant ? '' : ', non croissant'}`,
      `${N} images, écart < ${((250 / fps)).toFixed(1)} ms`,
    );
    const emp = attentes.empreintes;
    for (let k = 1; k < ed.length; k++) {
      if (ed[k]!.md5 !== ed[k - 1]!.md5) continue;
      rapport.doublons.decodes++;
      if (emp && emp[k] !== undefined && emp[k] === emp[k - 1]) rapport.doublons.attendus++;
      else if (rapport.doublons.inattendus.length < 50) rapport.doublons.inattendus.push((attentes.premiereImage ?? 0) + k);
    }
    if (emp) {
      ajouter(
        'images identiques inattendues',
        rapport.doublons.inattendus.length === 0,
        `${rapport.doublons.decodes} identiques consécutives, dont ${rapport.doublons.attendus} attendues (capture identique)`,
        '0 inattendue',
        false,
        rapport.doublons.inattendus.length ? `images ${rapport.doublons.inattendus.slice(0, 12).join(', ')}` : undefined,
      );
    }
  } catch (e) {
    ajouter('horodatage n / fps', false, (e as Error).message, 'lisible');
  }

  // 4. Échantillons capturés contre images décodées
  const refs = attentes.references ?? {};
  const indicesRef = Object.keys(refs).map(Number).sort((x, y) => x - y);
  if (indicesRef.length > 0) {
    const l = Math.max(16, Math.round(attentes.largeur / 4 / 2) * 2);
    const h = Math.max(16, Math.round(attentes.hauteur / 4 / 2) * 2);
    const p0 = attentes.premiereImage ?? 0;
    const decodees = await imagesVideo(fichier, indicesRef.map((i) => i - p0).filter((k) => k >= 0 && k < N), l, h);
    const imgRef = new Map<number, Uint8Array>();
    for (const i of indicesRef) imgRef.set(i, await imageRvb(refs[i]!, l, h));
    const seuil = attentes.psnrMin ?? 30;
    for (const i of indicesRef) {
      const d = decodees.get(i - p0);
      if (!d) {
        rapport.echantillons.push({ image: i, psnr: 0, voisins: [], ok: false });
        continue;
      }
      const p = psnr(d, imgRef.get(i)!);
      const voisins: Array<{ image: number; psnr: number }> = [];
      for (const j of [i - 1, i + 1]) {
        const rj = imgRef.get(j);
        if (!rj) continue;
        // Voisin informatif seulement s'il diffère nettement de la référence.
        if (psnr(rj, imgRef.get(i)!) >= 45) continue;
        voisins.push({ image: j, psnr: psnr(d, rj) });
      }
      const ok = p >= seuil && voisins.every((x) => x.psnr < p);
      rapport.echantillons.push({ image: i, psnr: p, voisins, ok });
    }
    const mauvais = rapport.echantillons.filter((e) => !e.ok);
    const pmin = Math.min(...rapport.echantillons.map((e) => e.psnr));
    ajouter(
      'échantillons capturés = images du MP4 (ordre et fidélité)',
      mauvais.length === 0,
      `${rapport.echantillons.length - mauvais.length}/${rapport.echantillons.length} conformes, PSNR min ${pmin.toFixed(1)} dB`,
      `PSNR ≥ ${seuil} dB et meilleur que les images voisines`,
      true,
      mauvais.length ? `non conformes : ${mauvais.map((e) => `${e.image} (${e.psnr.toFixed(1)} dB${e.voisins.map((x) => `, ${x.image} : ${x.psnr.toFixed(1)}`).join('')})`).join(' ; ')}` : undefined,
    );
  }

  // 5. Audio
  if (a) {
    rapport.audio = { codec: a.codec_name ?? '?', frequence: Number(a.sample_rate), canaux: a.channels ?? 0, duree: Number(a.duration ?? Number.NaN) };
  }
  if (attentes.audio) {
    if (!a) {
      ajouter('piste audio', false, 'absente', 'AAC 48 kHz stéréo');
    } else {
      ajouter('piste audio', a.codec_name === 'aac' && Number(a.sample_rate) === 48000 && a.channels === 2, `${a.codec_name} ${a.sample_rate} Hz ${a.channels} canaux`, 'aac 48000 Hz 2 canaux');
      const da = Number(a.duration);
      ajouter('durée audio = durée vidéo', Math.abs(da - N / fps) <= 1 / fps + 1e-6, `${da.toFixed(4)} s`, `${(N / fps).toFixed(4)} s ± 1 image`);
      if (!attentes.audioSilencieux) {
        const s = await mesurerSonie(fichier);
        rapport.sonie = s;
        const cible = attentes.cibleLufs ?? -14;
        const tol = attentes.toleranceLufs ?? 1;
        const creteMax = attentes.creteMax ?? -1;
        ajouter('sonie intégrée', !!s && Math.abs(s.integre - cible) <= tol, s ? `${s.integre.toFixed(1)} LUFS` : 'illisible', `${cible} ± ${tol} LUFS`);
        ajouter('crête vraie', !!s && s.creteVraie <= creteMax + 0.05, s ? `${s.creteVraie.toFixed(1)} dBTP` : 'illisible', `≤ ${creteMax} dBTP`);
      }
    }
  } else if (a) {
    ajouter('piste audio', true, `${a.codec_name} (non exigée)`, 'facultative', false);
  }

  // 6. moov avant mdat
  rapport.ordreAtomes = atomesPremierNiveau(fichier);
  const iMoov = rapport.ordreAtomes.indexOf('moov');
  const iMdat = rapport.ordreAtomes.indexOf('mdat');
  ajouter('moov avant mdat (faststart)', iMoov >= 0 && iMdat >= 0 && iMoov < iMdat, rapport.ordreAtomes.join(' '), 'moov … mdat');

  return clore();
}

const echapper = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Rapport de vérification en Markdown (français). */
export function verificationEnMarkdown(r: RapportVerification): string {
  const l: string[] = [];
  l.push(`## Vérification du MP4 — ${r.ok ? 'CONFORME' : 'NON CONFORME'}${r.avertissements ? ` (${r.avertissements} avertissement(s))` : ''}`);
  l.push('');
  l.push(`Fichier : \`${r.fichier}\` (${(r.taille / 1048576).toFixed(2)} Mio)`);
  if (r.video) {
    const v = r.video;
    l.push(`Vidéo : ${v.codec} ${v.profil}, ${v.largeur}×${v.hauteur}, ${v.pixFmt}, ${v.fps} i/s, ${v.imagesDecodees} images décodées, ${v.duree.toFixed(3)} s, ${(v.debit / 1e6).toFixed(2)} Mbit/s`);
  }
  if (r.audio) l.push(`Audio : ${r.audio.codec}, ${r.audio.frequence} Hz, ${r.audio.canaux} canaux, ${r.audio.duree.toFixed(3)} s`);
  if (r.sonie) l.push(`Sonie : ${r.sonie.integre.toFixed(1)} LUFS intégrés, crête vraie ${r.sonie.creteVraie.toFixed(1)} dBTP, plage ${r.sonie.plage.toFixed(1)} LU`);
  l.push('');
  l.push('| Contrôle | Résultat | Mesuré | Attendu |');
  l.push('|---|---|---|---|');
  for (const c of r.controles) {
    const res = c.ok ? 'OK' : c.bloquant ? '**ÉCHEC**' : 'avertissement';
    l.push(`| ${echapper(c.nom)} | ${res} | ${echapper(c.valeur)} | ${echapper(c.attendu)} |`);
  }
  const details = r.controles.filter((c) => c.detail);
  if (details.length) {
    l.push('');
    for (const c of details) l.push(`- ${c.nom} : ${c.detail}`);
  }
  l.push('');
  l.push(`Outils : ${r.outils.ffmpeg} ; ${r.outils.ffprobe}`);
  l.push(`Configuration FFmpeg : \`${r.outils.configuration.slice(0, 600)}${r.outils.configuration.length > 600 ? ' …' : ''}\``);
  return l.join('\n');
}

/** Écrit le rapport en JSON et en Markdown (`<base>.json`, `<base>.md`). */
export function ecrireRapportVerification(r: RapportVerification, base: string): { json: string; markdown: string } {
  const json = `${base}.json`;
  const markdown = `${base}.md`;
  writeFileSync(json, JSON.stringify(r, null, 2));
  writeFileSync(markdown, `${verificationEnMarkdown(r)}\n`);
  return { json, markdown };
}
