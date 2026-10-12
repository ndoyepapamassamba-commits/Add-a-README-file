// ANALYSEUR DE CLIPS (navigateur) — échantillonne une vidéo par positionnement image par image (indépendant de la
// lecture : un onglet caché ne fausse rien), mesure mouvement / images figées / scintillement, extrait les images clés
// et les soumet au juge visuel (rire, jeu, expressions, bouche, anatomie, cohérence). Sert au circuit Grok (chaque clip)
// et à l'outil « Analyser une vidéo » (n'importe quel MP4 / WebM, dont les films déjà téléchargés).
import { useStudio } from './store';
import { blobs } from './blobs';
import { runText } from './textModel';
import { clipJudgePrompt, clipVerdict, measureFrames, parseClipJudgement, segmentFilm, silentGaps, type ClipJudgement, type ClipReport, type FrameSeries, type Span } from '../../../server/jev/studio/clipInspect';
import type { Scene } from '../../../server/jev/studio/types';

const W = 96;
const H = 170;
export interface Sampled {
  series: FrameSeries;
  keyframes: string[];
  seconds: number;
}
/** Grey frames (96×170 at `fps`) + `keys` JPEG key frames evenly spread (for the vision judge). */
export async function sampleVideo(blob: Blob, o: { fps?: number; maxS?: number; keys?: number; keyWidth?: number } = {}): Promise<Sampled> {
  const fps = o.fps ?? 12;
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  const url = URL.createObjectURL(blob);
  v.src = url;
  try {
    await new Promise<void>((ok, ko) => {
      v.onloadeddata = () => ok();
      v.onerror = () => ko(new Error('vidéo illisible'));
    });
    const seconds = Math.min(o.maxS ?? 90, Number.isFinite(v.duration) ? v.duration : 0);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const kw = o.keyWidth ?? 360;
    const kc = document.createElement('canvas');
    kc.width = kw;
    kc.height = Math.round((kw * (v.videoHeight || 16)) / (v.videoWidth || 9));
    const kg = kc.getContext('2d')!;
    const nKeys = o.keys ?? 6;
    const keyAt = new Set(Array.from({ length: nKeys }, (_, i) => Math.round(((i + 0.5) / nKeys) * seconds * fps)));
    const frames: Float32Array[] = [];
    const keyframes: string[] = [];
    const n = Math.max(1, Math.floor(seconds * fps));
    for (let i = 0; i < n; i++) {
      await new Promise<void>((ok) => {
        const done = () => {
          v.removeEventListener('seeked', done);
          ok();
        };
        v.addEventListener('seeked', done);
        v.currentTime = Math.min(seconds - 0.01, i / fps);
        setTimeout(done, 1500);
      });
      g.drawImage(v, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const f = new Float32Array(W * H);
      for (let p = 0; p < f.length; p++) f[p] = (0.299 * d[p * 4]! + 0.587 * d[p * 4 + 1]! + 0.114 * d[p * 4 + 2]!) / 255;
      frames.push(f);
      if (keyAt.has(i)) {
        kg.drawImage(v, 0, 0, kc.width, kc.height);
        keyframes.push(kc.toDataURL('image/jpeg', 0.72));
      }
    }
    return { series: { w: W, h: H, fps, frames }, keyframes, seconds };
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** Loudness envelope of the sound track (50 ms hops), or null when the file has no decodable audio. */
export async function audioEnvelope(blob: Blob, hopS = 0.05): Promise<number[] | null> {
  try {
    const ac = new OfflineAudioContext(1, 1, 22050);
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const ch = buf.getChannelData(0);
    const hop = Math.max(1, Math.round(buf.sampleRate * hopS));
    const env: number[] = [];
    for (let i = 0; i < ch.length; i += hop) {
      let s = 0;
      const end = Math.min(ch.length, i + hop);
      for (let k = i; k < end; k++) s += ch[k]! * ch[k]!;
      env.push(Math.sqrt(s / Math.max(1, end - i)));
    }
    return env;
  } catch {
    return null;
  }
}
/** The vision judge on the key frames of one clip (null when no vision model answered — never a made-up score). */
export async function judgeClip(projectId: string, sc: Pick<Scene, 'action' | 'location' | 'characters' | 'dialogue'> | null, keyframes: string[]): Promise<ClipJudgement | null> {
  if (!keyframes.length) return null;
  const bp = useStudio.getState().projects[projectId];
  const chars = sc && bp ? bp.characters.filter((c) => sc.characters.map((x) => x.toUpperCase()).includes(c.name.toUpperCase())).map((c) => `${c.name}: ${c.consistency || c.clothing}`).join(' | ') : '';
  try {
    const r = await runText({
      projectId,
      purpose: 'analyse vidéo (juge clip)',
      vision: true,
      maxTokens: 600,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: clipJudgePrompt({ action: sc?.action ?? 'sketch humoristique', location: sc?.location, characters: chars, lines: sc?.dialogue.map((d) => ({ speaker: d.speaker, text: d.text })) ?? [], frames: keyframes.length }) },
            ...keyframes.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
    });
    return parseClipJudgement(r.text);
  } catch {
    return null;
  }
}
/** Full analysis of the clip of one scene, stored on the scene. */
export async function inspectSceneClip(projectId: string, sceneId: string, o: { judge?: boolean; expectedS?: number } = {}): Promise<ClipReport | null> {
  const bp = useStudio.getState().projects[projectId];
  const sc = bp?.scenes.find((s) => s.scene_id === sceneId);
  if (!sc?.videoAssetId) return null;
  const blob = await blobs.get(sc.videoAssetId);
  if (!blob) return null;
  const s = await sampleVideo(blob, { maxS: 20 });
  const judge = o.judge === false ? null : await judgeClip(projectId, sc, s.keyframes);
  const report = clipVerdict(measureFrames(s.series), judge, { expectedS: o.expectedS });
  useStudio.getState().patchProject(projectId, (b) => ({ ...b, scenes: b.scenes.map((x) => (x.scene_id === sceneId ? { ...x, clipReport: report } : x)) }), `analyse du clip ${sceneId}`);
  return report;
}
export interface FilmAnalysis {
  seconds: number;
  shots: { start: number; end: number; report: ClipReport }[];
  frozen: Span[];
  silences: Span[] | null;
  score: number | null;
}
/** Any film file: cut into shots, each shot measured (+ judged when a project is given), silent gaps of the sound. */
export async function analyzeFilm(blob: Blob, o: { projectId?: string; judge?: boolean; fps?: number; onProgress?: (msg: string) => void } = {}): Promise<FilmAnalysis> {
  o.onProgress?.('lecture image par image…');
  const s = await sampleVideo(blob, { maxS: 180, keys: 0, fps: o.fps ?? 12 });
  const segs = segmentFilm(s.series);
  const shots: FilmAnalysis['shots'] = [];
  for (const [i, seg] of segs.entries()) {
    let judge: ClipJudgement | null = null;
    if (o.judge && o.projectId) {
      o.onProgress?.(`juge visuel plan ${i + 1}/${segs.length}…`);
      const keys = await keyframesAt(blob, [0.2, 0.5, 0.8].map((f) => seg.start + f * (seg.end - seg.start)));
      judge = await judgeClip(o.projectId, null, keys);
    }
    shots.push({ start: seg.start, end: seg.end, report: clipVerdict(seg.m, judge) });
  }
  o.onProgress?.('bande son…');
  const env = await audioEnvelope(blob);
  const frozen = shots.flatMap((x) => x.report.measures.frozen.map((f) => ({ start: x.start + f.start, end: x.start + f.end })));
  const weights = shots.map((x) => x.end - x.start);
  const total = weights.reduce((a, b) => a + b, 0);
  const score = total ? Math.round(shots.reduce((a, x, k) => a + (x.report.score ?? 0) * weights[k]!, 0) / total) : null;
  return { seconds: s.seconds, shots, frozen, silences: env ? silentGaps(env.map((v) => v / Math.max(1e-6, Math.max(...env))), 0.05) : null, score };
}
async function keyframesAt(blob: Blob, times: number[]): Promise<string[]> {
  const v = document.createElement('video');
  v.muted = true;
  const url = URL.createObjectURL(blob);
  v.src = url;
  try {
    await new Promise<void>((ok, ko) => {
      v.onloadeddata = () => ok();
      v.onerror = () => ko(new Error('vidéo illisible'));
    });
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = Math.round((360 * (v.videoHeight || 16)) / (v.videoWidth || 9));
    const g = c.getContext('2d')!;
    const out: string[] = [];
    for (const t of times) {
      await new Promise<void>((ok) => {
        v.onseeked = () => ok();
        v.currentTime = t;
        setTimeout(ok, 1500);
      });
      g.drawImage(v, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.72));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
