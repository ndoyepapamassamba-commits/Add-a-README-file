// AI Editor — pure timeline model: tracks VIDEO/IMAGES, DIALOGUE, VOICE, MUSIC, SFX, SUBTITLES and the editing operations
// (cut, trim, split, reorder, transitions, levels, fades, text, emoji, speed, zoom, crop). The auto-edit builds the first
// cut from the storyboard.
import type { Blueprint, Timeline, TimelineClip } from './types';
import { planEmojis, timeSubtitles } from './subtitles';

export const TRACKS: TimelineClip['track'][] = [
  'video',
  'dialogue',
  'voice',
  'music',
  'sfx',
  'subtitles',
  'emoji',
];
let n = 0;
const cid = () => `clip-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

/** First cut: scene images in order, voices at their subtitle times, SFX at scene starts, music over everything. */
export function autoTimeline(bp: Blueprint): Timeline {
  const voiceSeconds: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(bp.audio.voices ?? {})) {
    const [sid, i] = k.split(':');
    (voiceSeconds[sid!] ??= [])[Number(i)] = v.seconds;
  }
  const lines = timeSubtitles(bp.scenes, { voiceSeconds });
  const clips: TimelineClip[] = [];
  let t = 0;
  const starts: Record<string, number> = {};
  for (const sc of bp.scenes) {
    const mine = lines.filter((l) => l.sceneId === sc.scene_id);
    const dur = Math.max(sc.duration, mine.length ? mine.at(-1)!.end - t + 0.4 : 0);
    starts[sc.scene_id] = t;
    clips.push({
      id: cid(),
      track: 'video',
      start: t,
      duration: dur,
      assetId: sc.imageAssetId,
      sceneId: sc.scene_id,
      transition: sc.transition || 'cut',
      zoom: 1.06,
    });
    t += dur;
  }
  for (const l of lines) {
    const v = bp.audio.voices?.[`${l.sceneId}:${l.index}`];
    clips.push({
      id: cid(),
      track: 'dialogue',
      start: l.start,
      duration: l.end - l.start,
      sceneId: l.sceneId,
      text: `${l.speaker} : ${l.text}`,
    });
    if (v)
      clips.push({
        id: cid(),
        track: 'voice',
        start: l.start,
        duration: v.seconds || l.end - l.start,
        assetId: v.assetId,
        sceneId: l.sceneId,
        gain: 1,
      });
    clips.push({
      id: cid(),
      track: 'subtitles',
      start: l.start,
      duration: l.end - l.start,
      text: l.text,
      sceneId: l.sceneId,
    });
  }
  for (const e of planEmojis(lines))
    clips.push({
      id: cid(),
      track: 'emoji',
      start: e.start,
      duration: e.duration,
      text: e.emoji,
      sceneId: e.sceneId,
    });
  for (const e of bp.audio.sfx)
    if (e.assetId && starts[e.sceneId] !== undefined)
      clips.push({
        id: cid(),
        track: 'sfx',
        start: starts[e.sceneId]! + 0.2,
        duration: 1.2,
        assetId: e.assetId,
        sceneId: e.sceneId,
        gain: 0.6,
      });
  if (bp.audio.music?.assetId)
    clips.push({
      id: cid(),
      track: 'music',
      start: 0,
      duration: t,
      assetId: bp.audio.music.assetId,
      gain: 0.22,
      fadeIn: 1,
      fadeOut: 2,
    });
  return { clips, aspect: bp.aspect };
}
export const totalDuration = (tl: Timeline) =>
  tl.clips.reduce((a, c) => Math.max(a, c.start + c.duration), 0);

const map = (tl: Timeline, id: string, f: (c: TimelineClip) => TimelineClip): Timeline => ({
  ...tl,
  clips: tl.clips.map((c) => (c.id === id ? f(c) : c)),
});
/** Splits a clip in two at absolute time t (must fall strictly inside it). */
export function splitClip(tl: Timeline, id: string, t: number): Timeline {
  const c = tl.clips.find((x) => x.id === id);
  if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return tl;
  const a = { ...c, duration: t - c.start };
  const b: TimelineClip = {
    ...c,
    id: cid(),
    start: t,
    duration: c.start + c.duration - t,
    fadeIn: undefined,
  };
  return { ...tl, clips: [...tl.clips.filter((x) => x.id !== id), a, b] };
}
/** Trims the head and/or the tail of a clip by the given seconds (never below 0.1 s). */
export const trimClip = (tl: Timeline, id: string, o: { head?: number; tail?: number }): Timeline =>
  map(tl, id, (c) => {
    const head = Math.max(0, o.head ?? 0);
    const tail = Math.max(0, o.tail ?? 0);
    const dur = Math.max(0.1, c.duration - head - tail);
    return { ...c, start: c.start + head, duration: dur };
  });
export const moveClip = (tl: Timeline, id: string, start: number): Timeline =>
  map(tl, id, (c) => ({ ...c, start: Math.max(0, start) }));
export const setClip = (
  tl: Timeline,
  id: string,
  p: Partial<Pick<TimelineClip, 'gain' | 'fadeIn' | 'fadeOut' | 'speed' | 'zoom' | 'transition' | 'text'>>,
): Timeline =>
  map(tl, id, (c) => ({
    ...c,
    ...p,
    gain: p.gain === undefined ? c.gain : Math.max(0, Math.min(2, p.gain)),
    speed: p.speed === undefined ? c.speed : Math.max(0.25, Math.min(4, p.speed)),
  }));
export const removeClip = (tl: Timeline, id: string): Timeline => ({
  ...tl,
  clips: tl.clips.filter((c) => c.id !== id),
});
/** Reorders the VIDEO clips (scenes) and re-flows their starts back to back; audio of a moved scene follows it. */
export function reorderScenes(tl: Timeline, order: string[]): Timeline {
  const vids = tl.clips.filter((c) => c.track === 'video');
  const byScene = new Map(vids.map((v) => [v.sceneId!, v]));
  const oldStart = new Map(vids.map((v) => [v.sceneId!, v.start]));
  let t = 0;
  const newStart = new Map<string, number>();
  for (const id of order) {
    const v = byScene.get(id);
    if (!v) continue;
    newStart.set(id, t);
    t += v.duration;
  }
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (!c.sceneId || !newStart.has(c.sceneId)) return c;
      const delta = newStart.get(c.sceneId)! - (oldStart.get(c.sceneId) ?? 0);
      return c.track === 'music' ? c : { ...c, start: Math.max(0, c.start + delta) };
    }),
  };
}
/** Clips overlapping on the same single-voice track (dialogue / voice): an editing warning, not an error. */
export function overlaps(tl: Timeline): { track: string; a: string; b: string }[] {
  const out: { track: string; a: string; b: string }[] = [];
  for (const track of ['voice', 'dialogue'] as const) {
    const cs = tl.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start);
    for (let i = 1; i < cs.length; i++)
      if (cs[i]!.start < cs[i - 1]!.start + cs[i - 1]!.duration - 0.05)
        out.push({ track, a: cs[i - 1]!.id, b: cs[i]!.id });
  }
  return out;
}

/**
 * MUSIC DUCKING: gain breakpoints (time, gain) of the music under the voice clips — down to `ducked` with a short attack,
 * back up with a longer release; adjacent voices keep the music low.
 */
export function duckingPoints(
  voices: { start: number; end: number }[],
  o: { base?: number; ducked?: number; attack?: number; release?: number } = {},
): { t: number; v: number }[] {
  const base = o.base ?? 0.22;
  const ducked = o.ducked ?? 0.08;
  const attack = o.attack ?? 0.15;
  const release = o.release ?? 0.4;
  const merged: { start: number; end: number }[] = [];
  for (const v of [...voices].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && v.start - last.end < attack + release) last.end = Math.max(last.end, v.end);
    else merged.push({ ...v });
  }
  const pts: { t: number; v: number }[] = [{ t: 0, v: base }];
  for (const m of merged) {
    pts.push(
      { t: Math.max(0, m.start - attack), v: base },
      { t: m.start, v: ducked },
      { t: m.end, v: ducked },
      { t: m.end + release, v: base },
    );
  }
  return pts;
}
