// KEY SHOTS BY JEV — which scenes deserve the premium generator (Grok) when the cap only covers a few: one typed Noul
// per scene (« is this the punchline / twist / climax? ») answered by JEV in ONE call; the beat heuristic
// (chute | twist) stays the fallback and the tie-breaker. JEV judges, the code decides; nothing is generated.
import { callJevQuestions, type JevQuestion } from '../../../server/jev/provider';
import type { Scene } from '../../../server/jev/studio/types';
import { getJevKey, jevSettings } from '../jev';

export interface KeyShotPick<S extends Scene = Scene> {
  scenes: S[];
  source: 'jev' | 'heuristique';
  note: string;
  scores?: Record<string, number>;
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The writer's own beats: the fall (« chute ») and the twist. */
export const heuristicKeyShots = <S extends Scene>(scenes: S[]): S[] => scenes.filter((s) => s.beat === 'chute' || s.beat === 'twist');

/** One Noul per scene — all asked together over the same state (they run in parallel at JEV's end). */
export function keyShotQuestions(scenes: Scene[]): Record<string, JevQuestion> {
  return Object.fromEntries(
    scenes.map((s, i) => [
      `key_${i}`,
      { type: 'noul', instructions: `Is scene \`scenes[${i}]\` (id ${s.scene_id}) the KEY moment of this story — the punchline, the twist or the climax the audience will remember, where the picture must be at its best? Judge it against the other scenes of \`scenes\`.` },
    ]),
  );
}

/** Scenes JEV rates ≥ 0.6 (best first, at most `max`); a writer's beat rated ≥ 0.4 is kept too. */
export function pickFromAnswers<S extends Scene>(scenes: S[], answers: Record<string, { noul?: number }>, max = 3): { scenes: S[]; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  scenes.forEach((s, i) => {
    const n = answers[`key_${i}`]?.noul;
    if (typeof n === 'number') scores[s.scene_id] = Math.max(0, Math.min(1, n));
  });
  const strong = scenes.filter((s) => (scores[s.scene_id] ?? 0) >= 0.6);
  const beats = heuristicKeyShots(scenes).filter((s) => (scores[s.scene_id] ?? 0) >= 0.4 && !strong.includes(s));
  const picked = [...strong, ...beats].sort((a, b) => (scores[b.scene_id] ?? 0) - (scores[a.scene_id] ?? 0)).slice(0, max);
  // Story order is kept for the circuit (the shots are rendered in sequence).
  return { scenes: scenes.filter((s) => picked.includes(s)), scores };
}

/** The key shots of a film: JEV when it is configured (one call, a few hundred tokens), the beat heuristic otherwise. */
export async function chooseKeyShots<S extends Scene>(
  scenes: S[],
  title: string,
  max = 3,
  env: { cfg?: ReturnType<typeof jevSettings>; key?: string; fetchFn?: FetchLike } = {},
): Promise<KeyShotPick<S>> {
  const heur = heuristicKeyShots(scenes);
  const fallback = (why: string): KeyShotPick<S> => ({ scenes: heur, source: 'heuristique', note: `${why} → plans clés par la structure (${heur.map((s) => s.scene_id).join(', ') || 'dernière scène'})` });
  const cfg = env.cfg ?? jevSettings();
  const key = env.key ?? getJevKey();
  if (!key || !cfg.enabled) return fallback('JEV non configuré');
  if (scenes.length < 2) return fallback('une seule scène');
  const asked = scenes.slice(0, 12);
  try {
    const state = {
      title,
      scenes: asked.map((s) => ({
        id: s.scene_id,
        beat: s.beat,
        action: (s.action ?? '').slice(0, 240),
        dialogue: s.dialogue
          .map((d) => (d as { text?: string }).text ?? '')
          .join(' / ')
          .slice(0, 240),
        emotion: s.emotion,
      })),
    };
    const ans = await callJevQuestions(cfg, key, state, keyShotQuestions(asked), env.fetchFn ?? ((u, i) => fetch(u, i)));
    const r = pickFromAnswers(asked, ans.answers, max);
    if (!r.scenes.length) return fallback(`JEV n’a distingué aucun plan clé (${ans.model})`);
    return {
      scenes: r.scenes,
      source: 'jev',
      scores: r.scores,
      note: `JEV (${ans.model.split('/').pop()}, ${ans.ms} ms, ${ans.costUsd.toFixed(4)} $) : ${r.scenes.map((s) => `${s.scene_id} ${Math.round((r.scores[s.scene_id] ?? 0) * 100)} %`).join(', ')}`,
    };
  } catch (e) {
    return fallback(`JEV indisponible (${(e as Error).message.slice(0, 60)})`);
  }
}
