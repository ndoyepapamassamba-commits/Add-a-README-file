/**
 * DIRECTEUR D'ACTEURS — turns a scene of the app (who speaks when, the [gesture] of each line, the emotion, the
 * action of the scene) into one skeletal performance script per character: the two actors face each other, the
 * speaker plays the gesture of the line (wave, point at the other, shrug, hands on the head…), the listener reacts and
 * looks at the speaker, emotions change the posture and the face, and scene actions (enters, sits, stands up) move the body.
 */
import type { Action, ArmMode, Emotion, Script } from './actor';
import { gestureOf } from '../puppet';
import { emotionOf } from '../emotionLayer';
import type { V3 } from './math';

export interface CueLine {
  speaker: string;
  start: number;
  end: number;
  text: string;
  gesture?: string;
  emotion?: string;
}
export interface Staging {
  /** Ground position (x, z) and heading of each character (radians, 0 = facing the camera side +Z). */
  marks: Record<string, { pos: [number, number]; heading: number }>;
  seconds: number;
}
const D = Math.PI / 180;
/** Two characters face each other three-quarter to the camera (the « dispute » staging of the reference clips). */
export function defaultStaging(names: string[], seconds: number): Staging {
  const marks: Staging['marks'] = {};
  names.slice(0, 4).forEach((n, i) => {
    const left = i % 2 === 0;
    marks[n] = { pos: [left ? -0.65 : 0.65, 0.2 + Math.floor(i / 2) * 0.9], heading: (left ? 55 : -55) * D };
  });
  return { marks, seconds };
}
/** The arm modes a line's gesture maps to (the 15 gestures of the puppet engine → skeletal acting). */
const ARM: Record<string, { mode: ArmMode; side: 'l' | 'r' | 'both' } | null> = {
  wave: { mode: 'wave', side: 'r' },
  point: { mode: 'point', side: 'r' },
  shrug: { mode: 'shrug', side: 'both' },
  'head-hands': { mode: 'facepalm', side: 'both' },
  laugh: { mode: 'akimbo', side: 'both' },
  jump: { mode: 'raise', side: 'both' },
  angry: { mode: 'point', side: 'r' },
  dance: { mode: 'raise', side: 'both' },
  clap: { mode: 'cross', side: 'both' },
  think: { mode: 'facepalm', side: 'r' },
  startle: { mode: 'raise', side: 'both' },
  cry: { mode: 'facepalm', side: 'both' },
  yes: null,
  no: null,
  run: null,
};
const EMO: Record<string, Emotion> = { colère: 'colère', joie: 'joie', tristesse: 'tristesse', peur: 'peur', surprise: 'surprise', honte: 'honte', fierté: 'fierté', mépris: 'mépris', dégoût: 'mépris', neutre: 'neutre' };
const headOf = (m: { pos: [number, number] }): V3 => [m.pos[0], 1.45, m.pos[1]];

/** One script per character of the scene. */
export function directScene(names: string[], lines: CueLine[], staging: Staging, sceneAction = ''): Record<string, Script> {
  const out: Record<string, Script> = {};
  for (const name of names) {
    const me = staging.marks[name];
    if (!me) continue;
    const others = names.filter((n) => n !== name && staging.marks[n]);
    const actions: Action[] = [];
    const enters = /\b(entre|arrive|débarque|rentre)\b/i.test(sceneAction) && name === names[0];
    const sits = /\b(assis|s'assoit|assise)\b/i.test(sceneAction);
    let start = { pos: me.pos, heading: me.heading };
    if (enters) {
      // Comes in from off-screen to the mark.
      start = { pos: [me.pos[0] - 2.2, me.pos[1] - 0.6], heading: 70 * D };
      actions.push({ kind: 'walkTo', t0: 0, t1: 2.2, to: me.pos }, { kind: 'turnTo', t0: 2.2, t1: 2.8, heading: me.heading });
    }
    if (sits) {
      actions.push({ kind: 'sit', t0: 0, t1: 1.5, seat: [me.pos[0], 0, me.pos[1]], heading: me.heading });
      const firstLine = lines.find((l) => l.speaker === name);
      if (firstLine) actions.push({ kind: 'standUp', t0: Math.max(1.5, firstLine.start - 0.4), t1: Math.max(1.5, firstLine.start - 0.4) + 1.6 });
    }
    for (const l of lines) {
      const speaking = l.speaker === name;
      const target = others[0] ? headOf(staging.marks[speaking ? others[0] : l.speaker] ?? staging.marks[others[0]]!) : undefined;
      if (target) actions.push({ kind: 'look', t0: l.start - 0.2, t1: l.end + 0.2, at: target });
      const emo = EMO[emotionOf(l.emotion ?? l.text)] ?? 'neutre';
      if (speaking) {
        if (emo !== 'neutre') actions.push({ kind: 'emotion', t0: l.start, t1: l.end + 0.3, emotion: emo });
        const g = gestureOf(l.gesture) ?? gestureOf(l.text);
        const arm = g ? ARM[g] : null;
        if (arm) actions.push({ kind: 'arm', t0: l.start + 0.1, t1: l.end, side: arm.side, mode: arm.mode, ...(arm.mode === 'point' && target ? { target: [target[0], target[1] - 0.15, target[2]] as V3 } : {}) });
      } else if (emo === 'colère' || emo === 'mépris') {
        // The listener answers with a defensive posture (hands on the hips) on an attack.
        actions.push({ kind: 'arm', t0: l.start + 0.4, t1: l.end, side: 'both', mode: 'akimbo' });
      }
    }
    out[name] = { start, actions };
  }
  return out;
}
