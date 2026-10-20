// Pure helpers for presenting generated videos (no I/O): file naming, real-MIME extension, display state, summary.
import type { Job } from './types';

const EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
};
/** Extension that matches the REAL mime (never assumes mp4). Unknown mime → 'bin'. */
export const videoExt = (mime: string): string => EXT[mime.split(';')[0]!.trim().toLowerCase()] ?? 'bin';

const slug = (t: string) =>
  t
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'x';
/** PROJECT_SCENE_MODEL_TIMESTAMP.<ext of the real mime> */
export function videoFileName(
  o: { project: string; scene?: string; model: string; mime: string },
  at = Date.now(),
): string {
  const ts = new Date(at).toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `${slug(o.project)}_${slug(o.scene ?? 'scene')}_${slug(o.model.split('/').pop() ?? o.model)}_${ts}.${videoExt(o.mime)}`;
}

export type VideoState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
/** A job still RUNNING after this long is shown as EXPIRED (provider links do not live forever). */
export const EXPIRY_MS = 24 * 3600_000;
export function videoState(j: Pick<Job, 'status' | 'createdAt'>, now = Date.now()): VideoState {
  if (j.status === 'RUNNING' && now - j.createdAt > EXPIRY_MS) return 'EXPIRED';
  return j.status;
}

export const completedVideos = (jobs: Job[], projectId?: string): Job[] =>
  jobs
    .filter(
      (j) =>
        j.kind === 'video' &&
        j.status === 'COMPLETED' &&
        Boolean(j.assetId) &&
        (!projectId || j.projectId === projectId),
    )
    .sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt));

export function videoOutput(jobs: Job[], projectId: string) {
  const list = completedVideos(jobs, projectId);
  return {
    count: list.length,
    latest: list[0],
    totalCost: list.reduce((s, j) => s + (j.cost ?? 0), 0),
    costKnown: list.every((j) => j.cost !== null),
  };
}

export function elapsed(since: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** Real ratio from real pixel dimensions (e.g. 720×1280 → 9:16). */
export function ratioOf(w: number, h: number): string {
  if (!w || !h) return '—';
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
  const d = g(w, h);
  return `${w / d}:${h / d}`;
}

export type TalkRoute = 'A' | 'B' | 'C' | 'D' | 'N';
export interface TalkInputs {
  videoEnabled: boolean;
  hasSceneImage: boolean;
  /** I2V models discovered (any audio capability). */
  i2v: number;
  /** I2V models with native audio. */
  i2vNative: number;
  /** Speech (TTS) models discovered. */
  tts: number;
  dialogueLines: number;
  /** The local engine (Rhubarb lip-sync) only renders 2D productions. */
  dimension?: '2D' | '3D';
}
export const TALK_LABEL: Record<TalkRoute, string> = {
  A: 'Image → vidéo (sans voix)',
  B: 'Image → vidéo + audio natif',
  C: 'Image → vidéo + TTS externe',
  D: 'Moteur 2D local + lip-sync Rhubarb',
  N: 'NOT AVAILABLE',
};
/** Which routes exist right now, and which one JEV picks (B > C > D; A is silent so it is never chosen for « Fais parler »). */
export function talkRoutes(i: TalkInputs): {
  available: Record<TalkRoute, boolean>;
  selected: TalkRoute;
  why: string;
} {
  const base = i.videoEnabled && i.hasSceneImage;
  const available: Record<TalkRoute, boolean> = {
    A: base && i.i2v > 0,
    B: base && i.i2vNative > 0,
    C: base && i.i2v > 0 && i.tts > 0 && i.dialogueLines > 0,
    D: (i.dimension ?? '2D') === '2D',
    N: true,
  };
  const selected: TalkRoute = available.B ? 'B' : available.C ? 'C' : available.D ? 'D' : 'N';
  const why = !i.videoEnabled
    ? 'Video Factory désactivée : aucun appel vidéo payant'
    : !i.hasSceneImage
      ? 'la scène n’a pas d’image de référence'
      : selected === 'B'
        ? 'un modèle image→vidéo à audio natif est disponible'
        : selected === 'C'
          ? 'aucun audio natif, mais image→vidéo + synthèse vocale sont disponibles : vidéo, puis voix, assemblées séparément'
          : selected === 'N'
            ? 'production 3D : le moteur local (Rhubarb) ne rend que la 2D et aucune route vidéo IA n’est disponible'
            : i.i2v === 0
              ? 'aucun modèle image→vidéo découvert'
              : 'image→vidéo disponible mais aucune synthèse vocale ni réplique : la vidéo serait muette (route A, non choisie)';
  return { available, selected, why };
}
