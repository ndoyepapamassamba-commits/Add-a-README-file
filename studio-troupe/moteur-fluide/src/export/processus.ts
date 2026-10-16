/**
 * Outils de processus de l'export : lancement de FFmpeg / ffprobe (processus séparés, jamais simulés), lecture de
 * leur sortie, version et configuration de compilation (consignées dans les rapports).
 *
 * Aucune fonction ne « fait semblant » : si un outil manque, l'erreur `OutilAbsent` le dit, et la commande s'arrête.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Chemins des outils (surchargeables par `MOTEUR_FFMPEG` / `MOTEUR_FFPROBE`). */
export const FFMPEG = process.env.MOTEUR_FFMPEG ?? '/usr/bin/ffmpeg';
export const FFPROBE = process.env.MOTEUR_FFPROBE ?? '/usr/bin/ffprobe';

/** Outil système introuvable : on s'arrête au lieu de simuler. */
export class OutilAbsent extends Error {
  constructor(public readonly outil: string) {
    super(`Outil introuvable : ${outil} (aucune vidéo n'est produite sans lui)`);
    this.name = 'OutilAbsent';
  }
}

/** Vérifie la présence de FFmpeg et ffprobe. */
export function verifierOutils(): void {
  for (const o of [FFMPEG, FFPROBE]) if (!existsSync(o)) throw new OutilAbsent(o);
}

/** Résultat d'un processus terminé. */
export interface ResultatProcessus {
  code: number;
  stdout: Buffer;
  stderr: string;
}

/**
 * Lance un processus et attend sa fin. `entree` est écrite sur son entrée standard. Ne lève pas d'erreur sur un code
 * non nul (l'appelant décide) ; lève `OutilAbsent` si l'exécutable manque.
 */
export function executer(cmd: string, args: readonly string[], options: { entree?: Buffer | string; cwd?: string } = {}): Promise<ResultatProcessus> {
  return new Promise((resolve, reject) => {
    if (cmd.startsWith('/') && !existsSync(cmd)) {
      reject(new OutilAbsent(cmd));
      return;
    }
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...(options.cwd ? { cwd: options.cwd } : {}) });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => err.push(d));
    p.on('error', (e) => reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new OutilAbsent(cmd) : e));
    p.on('close', (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') }));
    p.stdin.on('error', () => undefined); // EPIPE si le processus se termine avant la fin de l'entrée : le code le dira
    if (options.entree !== undefined) p.stdin.end(options.entree);
    else p.stdin.end();
  });
}

/** Lance FFmpeg et lève une erreur lisible si le code est non nul. */
export async function ffmpeg(args: readonly string[], options: { entree?: Buffer | string } = {}): Promise<ResultatProcessus> {
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', ...args], options);
  if (r.code !== 0) throw new Error(`ffmpeg a échoué (code ${r.code}) : ${dernieresLignes(r.stderr)}\n  commande : ffmpeg ${args.join(' ')}`);
  return r;
}

/** Lance ffprobe en JSON et renvoie l'objet lu. */
export async function ffprobeJson(args: readonly string[]): Promise<Record<string, unknown>> {
  const r = await executer(FFPROBE, ['-v', 'error', '-print_format', 'json', ...args]);
  if (r.code !== 0) throw new Error(`ffprobe a échoué (code ${r.code}) : ${dernieresLignes(r.stderr)}`);
  return JSON.parse(r.stdout.toString('utf8') || '{}') as Record<string, unknown>;
}

/** Les dernières lignes non vides d'une sortie d'erreur (messages lisibles). */
export function dernieresLignes(texte: string, n = 6): string {
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(' | ');
}

let versionsCache: { ffmpeg: string; ffprobe: string; configuration: string } | null = null;

/** Version de FFmpeg / ffprobe et configuration de compilation (`-buildconf`), pour les rapports. */
export function versionsOutils(): { ffmpeg: string; ffprobe: string; configuration: string } {
  if (versionsCache) return versionsCache;
  const premiere = (cmd: string): string => {
    const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
    return r.status === 0 ? (r.stdout.split('\n')[0] ?? '').trim() : `indisponible (${cmd})`;
  };
  const conf = spawnSync(FFMPEG, ['-hide_banner', '-buildconf'], { encoding: 'utf8' });
  const configuration = conf.status === 0 ? `${conf.stdout}${conf.stderr}`.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('--')).join(' ') : 'indisponible';
  versionsCache = { ffmpeg: premiere(FFMPEG), ffprobe: premiere(FFPROBE), configuration };
  return versionsCache;
}

/** Nombre rationnel de ffprobe (« 30/1 », « 30000/1001 ») en nombre. */
export function lireRationnel(r: unknown): number {
  if (typeof r !== 'string') return Number.NaN;
  const [a, b] = r.split('/').map(Number);
  if (b === undefined) return Number(a);
  return b === 0 ? Number.NaN : a! / b;
}
