/**
 * Audio de l'export : collecte des sources du projet (voix des répliques, bruitages, musique, ambiances), génération
 * des bruitages synthétisés, mixage FFmpeg aux instants exacts de la timeline (`adelay` à l'échantillon près, `amix`
 * sans normalisation), normalisation de sonie en deux passes (`loudnorm`, cible TikTok ≈ −14 LUFS, crête vraie
 * ≤ −1,5 dBTP), durée exactement égale à celle de la vidéo, puis multiplexage AAC 48 kHz.
 *
 * Fournit aussi l'enveloppe RMS image par image d'un fichier audio (synchro labiale de la porte qualité).
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { finReplique } from '../timeline/derives';
import type { Projet, TypeSon } from '../timeline/types';
import { executer, ffmpeg, ffprobeJson, FFMPEG } from './processus';
import { mesurerSonie } from './verifier';
import { lireReferenceSynthese, synthetiser } from './sfx';
import { ecrireWav } from './wav';

/** Fréquence d'échantillonnage de sortie. */
export const FREQUENCE_AUDIO = 48000;

/** Une source à mixer, en temps absolu du projet. */
export interface SourceAudio {
  id: string;
  type: TypeSon;
  /** Fichier réel (absolu). */
  fichier: string;
  /** Référence d'origine dans le projet (chemin relatif ou `synth:…`). */
  origine: string;
  /** Début absolu (s). */
  debut: number;
  /** Durée du fichier (s), lue par ffprobe. */
  dureeFichier: number;
  /** Durée jouée (s) ; défaut : tout le fichier (ou jusqu'à la fin du rendu en boucle). */
  duree?: number;
  volume: number;
  boucle: boolean;
  fondu?: { entree?: number; sortie?: number };
  /** Locuteur (voix des répliques) : sert à la synchro labiale. */
  personnage?: string;
  /** Réplique d'origine (voix). */
  replique?: string;
}

/** Résultat de la collecte. */
export interface CollecteAudio {
  sources: SourceAudio[];
  /** Bruitages générés (chemins). */
  synthetises: string[];
  /** Références introuvables (message lisible). */
  manquants: string[];
}

/** Durée d'un fichier audio (s) par ffprobe. */
export async function dureeAudio(fichier: string): Promise<number> {
  const j = await ffprobeJson(['-show_entries', 'format=duration', fichier]);
  const d = Number((j.format as { duration?: string } | undefined)?.duration);
  if (!Number.isFinite(d)) throw new Error(`Durée audio illisible : ${fichier}`);
  return d;
}

/**
 * Collecte les sources audio du projet. Les chemins relatifs sont résolus depuis `dossierProjet` ; les références
 * `synth:…` sont synthétisées en WAV dans `dossierTravail/sfx/` (réutilisées si déjà présentes).
 */
export async function collecterSources(projet: Projet, options: { dossierProjet: string; dossierTravail: string }): Promise<CollecteAudio> {
  const sources: SourceAudio[] = [];
  const synthetises: string[] = [];
  const manquants: string[] = [];
  const resoudre = async (ref: string, contexte: string): Promise<string | null> => {
    const synth = lireReferenceSynthese(ref);
    if (synth) {
      const dossier = join(options.dossierTravail, 'sfx');
      mkdirSync(dossier, { recursive: true });
      const chemin = join(dossier, `${synth.cle}.wav`);
      if (!existsSync(chemin)) {
        const tmp = `${chemin}.tmp.wav`;
        ecrireWav(tmp, synthetiser(synth.nom, synth.parametres, FREQUENCE_AUDIO));
        renameSync(tmp, chemin);
      }
      synthetises.push(chemin);
      return chemin;
    }
    const chemin = isAbsolute(ref) ? ref : resolve(options.dossierProjet, ref);
    if (!existsSync(chemin)) {
      manquants.push(`${contexte} : fichier introuvable ${chemin}`);
      return null;
    }
    return chemin;
  };
  for (const r of projet.pistes.dialogue) {
    if (!r.audio) continue;
    const f = await resoudre(r.audio, `réplique ${r.id}`);
    if (!f) continue;
    sources.push({
      id: `voix-${r.id}`,
      type: 'voix',
      fichier: f,
      origine: r.audio,
      debut: r.debut,
      dureeFichier: await dureeAudio(f),
      volume: r.volume ?? 1,
      boucle: false,
      personnage: r.personnage,
      replique: r.id,
    });
  }
  for (const s of projet.pistes.sons) {
    const f = await resoudre(s.fichier, `son ${s.id}`);
    if (!f) continue;
    const src: SourceAudio = {
      id: s.id,
      type: s.type,
      fichier: f,
      origine: s.fichier,
      debut: s.debut,
      dureeFichier: await dureeAudio(f),
      volume: s.volume ?? 1,
      boucle: s.boucle ?? false,
    };
    if (s.duree !== undefined) src.duree = s.duree;
    if (s.fondu) src.fondu = s.fondu;
    sources.push(src);
  }
  return { sources, synthetises, manquants };
}

/** Fin absolue d'une source (s) ; `Infinity` pour une boucle sans durée. */
export function finSource(s: SourceAudio): number {
  if (s.duree !== undefined) return s.debut + s.duree;
  return s.boucle ? Infinity : s.debut + s.dureeFichier;
}

const nb = (x: number): string => {
  const r = Math.round(x * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * Graphe de mixage FFmpeg pour la plage `[debut, fin[` (s, absolus) : arguments d'entrée et `filter_complex`
 * dont la sortie `[mix]` dure exactement `fin − debut`. Fonction pure (testable sans FFmpeg).
 */
export function grapheMixage(sources: readonly SourceAudio[], debut: number, fin: number): { entrees: string[]; filtre: string; utilisees: SourceAudio[] } {
  const T = fin - debut;
  if (!(T > 0)) throw new Error('grapheMixage : plage vide');
  const entrees: string[] = [];
  const chaines: string[] = [];
  const utilisees: SourceAudio[] = [];
  for (const s of sources) {
    const finS = finSource(s);
    if (finS <= debut || s.debut >= fin) continue;
    const k = utilisees.length;
    utilisees.push(s);
    if (s.boucle) entrees.push('-stream_loop', '-1');
    entrees.push('-i', s.fichier);
    const decalage = Math.max(0, debut - s.debut); // partie déjà jouée avant la plage
    const retard = Math.max(0, s.debut - debut);
    const joue = Math.min(finS, fin) - Math.max(s.debut, debut);
    const f: string[] = [`aformat=sample_fmts=fltp:sample_rates=${FREQUENCE_AUDIO}:channel_layouts=stereo`];
    f.push(`atrim=start=${nb(decalage)}:duration=${nb(joue)}`, 'asetpts=PTS-STARTPTS');
    if (s.volume !== 1) f.push(`volume=${nb(s.volume)}`);
    const fe = s.fondu?.entree ?? 0;
    if (fe > 0 && decalage < fe) f.push(`afade=t=in:st=0:d=${nb(fe - decalage)}:curve=tri`);
    const fs = s.fondu?.sortie ?? 0;
    if (fs > 0 && Number.isFinite(finS)) {
      const debutFondu = finS - fs - Math.max(s.debut, debut);
      f.push(`afade=t=out:st=${nb(Math.max(0, debutFondu))}:d=${nb(Math.min(fs, joue))}:curve=tri`);
    }
    if (retard > 0) f.push(`adelay=delays=${Math.round(retard * FREQUENCE_AUDIO)}S:all=1`);
    chaines.push(`[${k}:a]${f.join(',')}[s${k}]`);
  }
  const fini = `apad=whole_dur=${nb(T)},atrim=duration=${nb(T)}`;
  if (utilisees.length === 0) {
    chaines.push(`anullsrc=r=${FREQUENCE_AUDIO}:cl=stereo,atrim=duration=${nb(T)}[mix]`);
  } else if (utilisees.length === 1) {
    chaines.push(`[s0]${fini}[mix]`);
  } else {
    const labels = utilisees.map((_, k) => `[s${k}]`).join('');
    chaines.push(`${labels}amix=inputs=${utilisees.length}:normalize=0:dropout_transition=0:duration=longest,${fini}[mix]`);
  }
  return { entrees, filtre: chaines.join(';'), utilisees };
}

/** Mesure de sonie (EBU R128) renvoyée par `loudnorm`. */
export interface MesureSonie {
  integre: number;
  creteVraie: number;
  plage: number;
  seuil: number;
  decalage?: number;
}

/** Rapport du mixage. */
export interface RapportAudio {
  sortie: string;
  duree: number;
  sources: Array<{ id: string; type: TypeSon; origine: string; debut: number; volume: number }>;
  mode: 'silence' | 'lineaire' | 'dynamique';
  cibleLufs: number;
  creteMax: number;
  avant?: MesureSonie;
  apres?: MesureSonie;
  /**
   * Correction finale : `loudnorm` manque souvent la cible sur un contenu bref ou clairsemé (bruitages seuls) ; on
   * mesure le résultat (EBU R128) et on applique le gain qui manque, avec un limiteur à anticipation (retard
   * compensé, la synchro ne bouge pas) si la crête l'exige.
   */
  correction?: { gainDb: number; limiteur: boolean };
}

function lireJsonLoudnorm(stderr: string): Record<string, string> {
  const i = stderr.lastIndexOf('{');
  const j = stderr.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error(`loudnorm : mesure illisible (${stderr.slice(-300)})`);
  return JSON.parse(stderr.slice(i, j + 1)) as Record<string, string>;
}

/**
 * Mixe les sources sur `[debut, fin[` et écrit un WAV 48 kHz stéréo 24 bits de durée exacte `fin − debut`.
 * Sonie : deux passes `loudnorm` (mesure puis correction linéaire) vers `cibleLufs` ; rien n'est normalisé si la
 * plage ne contient aucun son (piste de silence, signalée comme telle).
 */
export async function mixerAudio(options: {
  sources: readonly SourceAudio[];
  debut: number;
  fin: number;
  sortie: string;
  cibleLufs?: number;
  creteMax?: number;
  plageLoudness?: number;
}): Promise<RapportAudio> {
  const cible = options.cibleLufs ?? -14;
  const crete = options.creteMax ?? -1.5;
  const lra = options.plageLoudness ?? 11;
  const T = options.fin - options.debut;
  mkdirSync(dirname(options.sortie), { recursive: true });
  const g = grapheMixage(options.sources, options.debut, options.fin);
  const tmp = `${options.sortie}.tmp.wav`;
  const rapport: RapportAudio = {
    sortie: options.sortie,
    duree: T,
    sources: g.utilisees.map((s) => ({ id: s.id, type: s.type, origine: s.origine, debut: s.debut, volume: s.volume })),
    mode: 'silence',
    cibleLufs: cible,
    creteMax: crete,
  };
  const ecrire = async (filtre: string): Promise<void> => {
    await ffmpeg(['-y', '-v', 'error', ...g.entrees, '-filter_complex', filtre, '-map', '[out]', '-c:a', 'pcm_s24le', '-ar', String(FREQUENCE_AUDIO), '-ac', '2', tmp]);
    renameSync(tmp, options.sortie);
  };
  if (g.utilisees.length === 0) {
    await ecrire(`${g.filtre};[mix]anull[out]`);
    return rapport;
  }
  // Passe 1 : mesure.
  const base = `loudnorm=I=${cible}:TP=${crete}:LRA=${lra}`;
  const p1 = await ffmpeg(['-v', 'info', ...g.entrees, '-filter_complex', `${g.filtre};[mix]${base}:print_format=json[out]`, '-map', '[out]', '-f', 'null', '-']);
  const m1 = lireJsonLoudnorm(p1.stderr);
  rapport.avant = { integre: Number(m1.input_i), creteVraie: Number(m1.input_tp), plage: Number(m1.input_lra), seuil: Number(m1.input_thresh) };
  if (!Number.isFinite(rapport.avant.integre) || rapport.avant.integre < -70) {
    // Quasi-silence : pas de gain absurde, on garde le mixage tel quel.
    await ecrire(`${g.filtre};[mix]anull[out]`);
    return rapport;
  }
  // Passe 2 : correction linéaire avec les mesures, puis durée exacte.
  const mesures = `measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}`;
  const filtre2 = `${g.filtre};[mix]${base}:${mesures}:linear=true:print_format=json,aresample=${FREQUENCE_AUDIO},apad=whole_dur=${nb(T)},atrim=duration=${nb(T)}[out]`;
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-v', 'info', ...g.entrees, '-filter_complex', filtre2, '-map', '[out]', '-c:a', 'pcm_s24le', '-ar', String(FREQUENCE_AUDIO), '-ac', '2', tmp]);
  if (r.code !== 0) throw new Error(`Mixage audio : ffmpeg a échoué (${r.stderr.slice(-400)})`);
  const m2 = lireJsonLoudnorm(r.stderr);
  rapport.mode = m2.normalization_type === 'linear' ? 'lineaire' : 'dynamique';
  rapport.apres = { integre: Number(m2.output_i), creteVraie: Number(m2.output_tp), plage: Number(m2.output_lra), seuil: Number(m2.output_thresh), decalage: Number(m2.target_offset) };
  // Passe 3 : mesure réelle et gain manquant (limiteur à retard compensé si la crête l'exige). Sur un contenu très
  // percussif, le limiteur mange une partie du gain : on recommence (au plus 3 fois, +8 dB au total).
  let mesure = await mesurerSonie(tmp);
  let gainTotal = 0;
  let limiteurUtilise = false;
  for (let essai = 0; essai < 3 && mesure && Number.isFinite(mesure.integre) && Number.isFinite(mesure.creteVraie); essai++) {
    rapport.apres = { ...rapport.apres, integre: mesure.integre, creteVraie: mesure.creteVraie, plage: mesure.plage };
    const gainDb = Math.max(-20, Math.min(8 - gainTotal, cible - mesure.integre));
    if (Math.abs(cible - mesure.integre) <= 0.4 || Math.abs(gainDb) < 0.05) break;
    const limiteur = mesure.creteVraie + gainDb > crete - 0.1;
    const limite = Math.pow(10, (crete - 0.7) / 20);
    const f3 = [`volume=${nb(gainDb)}dB`];
    if (limiteur) f3.push(`alimiter=limit=${nb(limite)}:attack=2:release=60:level=false:latency=true`);
    f3.push(`apad=whole_dur=${nb(T)}`, `atrim=duration=${nb(T)}`);
    const corrige = `${options.sortie}.corrige.wav`;
    await ffmpeg(['-y', '-v', 'error', '-i', tmp, '-af', f3.join(','), '-c:a', 'pcm_s24le', '-ar', String(FREQUENCE_AUDIO), '-ac', '2', corrige]);
    renameSync(corrige, tmp);
    gainTotal += gainDb;
    limiteurUtilise ||= limiteur;
    rapport.correction = { gainDb: gainTotal, limiteur: limiteurUtilise };
    mesure = await mesurerSonie(tmp);
    if (mesure) rapport.apres = { ...rapport.apres, integre: mesure.integre, creteVraie: mesure.creteVraie, plage: mesure.plage };
  }
  renameSync(tmp, options.sortie);
  return rapport;
}

/**
 * Multiplexe la vidéo (copiée telle quelle) et le WAV (encodé en AAC-LC 48 kHz stéréo), atome `moov` en tête
 * (`+faststart`). Écrit d'abord un fichier temporaire, renommé à la fin (jamais de MP4 à moitié écrit).
 */
export async function multiplexer(options: { video: string; audio: string; sortie: string; debitAudio?: string; titre?: string }): Promise<void> {
  const tmp = `${options.sortie}.tmp.mp4`;
  const meta = options.titre ? ['-metadata', `title=${options.titre}`] : [];
  await ffmpeg([
    '-y', '-v', 'error',
    '-i', options.video,
    '-i', options.audio,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', options.debitAudio ?? '192k', '-ar', String(FREQUENCE_AUDIO), '-ac', '2',
    ...meta,
    '-movflags', '+faststart',
    tmp,
  ]);
  renameSync(tmp, options.sortie);
}

/**
 * Enveloppe RMS (linéaire) d'un fichier audio, une valeur par image : la valeur `n` couvre `[n/fps, (n+1)/fps[`
 * depuis le début du fichier. Décodage FFmpeg en mono 16 kHz.
 */
export async function enveloppeRms(fichier: string, fps: number): Promise<Float64Array> {
  const fe = 16000;
  const r = await ffmpeg(['-v', 'error', '-i', fichier, '-ac', '1', '-ar', String(fe), '-f', 'f32le', '-']);
  const n = Math.floor(r.stdout.length / 4);
  const ech = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + n * 4));
  const parImage = fe / fps;
  const nImages = Math.ceil(n / parImage);
  const env = new Float64Array(nImages);
  for (let k = 0; k < nImages; k++) {
    const a = Math.round(k * parImage);
    const b = Math.min(n, Math.round((k + 1) * parImage));
    let s = 0;
    for (let i = a; i < b; i++) s += ech[i]! * ech[i]!;
    env[k] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  return env;
}

/** Fin (s) de la dernière voix ou du dernier son borné (informatif). */
export function finDesSons(projet: Projet): number {
  let f = 0;
  for (const r of projet.pistes.dialogue) f = Math.max(f, finReplique(r));
  for (const s of projet.pistes.sons) if (s.duree !== undefined) f = Math.max(f, s.debut + s.duree);
  return f;
}
