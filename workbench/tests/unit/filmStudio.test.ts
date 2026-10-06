import { describe, it, expect } from 'vitest';
import { filmSmokeTest } from '../../server/jev/studio/smoke';
import {
  PRESETS,
  STAGE_SPACE,
  budgetTier,
  costLadder,
  effectiveMode,
  savedVsPremium,
  videoGate,
} from '../../server/jev/studio/film';
import { STAGES } from '../../server/jev/studio/types';
import {
  STYLE_2D_HQ,
  STYLE_3D_AFRIKATOON,
  STYLE_PRESETS,
  styleTag,
  qualityLine,
  redrawInstruction,
} from '../../server/jev/studio/style';
import { newBlueprint } from '../../server/jev/studio/blueprint';
import { storyMessages } from '../../server/jev/studio/story';
import type { Candidate } from '../../server/jev/studio/cost';
import type { MediaModel } from '../../server/jev/studio/capabilities';

describe('AI Film Studio — smoke test', () => {
  it('every check of the in-app smoke test passes', () => {
    const r = filmSmokeTest();
    expect(r.length).toBeGreaterThanOrEqual(10);
    expect(r.filter((x) => !x.ok).map((x) => `${x.name}: ${x.detail}`)).toEqual([]);
  });
});
describe('3D option', () => {
  it('2D stays the default and both styles are locked + frozen', () => {
    expect(newBlueprint({ id: 'a', idea: 'x' }).styleDNA).toBe(STYLE_2D_HQ);
    expect(newBlueprint({ id: 'a', idea: 'x', dimension: '3D' }).styleDNA).toBe(STYLE_3D_AFRIKATOON);
    expect(STYLE_3D_AFRIKATOON.locked && Object.isFrozen(STYLE_3D_AFRIKATOON)).toBe(true);
    expect(STYLE_PRESETS['3D'].negative).toMatch(/flat 2D/);
    expect(STYLE_PRESETS['3D'].negative).not.toMatch(/3D render/);
  });
  it('2D and 3D keep separate champion histories and vocabularies', () => {
    expect(styleTag(STYLE_2D_HQ)).toBe('2D-HQ');
    expect(styleTag(STYLE_3D_AFRIKATOON)).toBe('3D-STYLISED');
    expect(qualityLine(STYLE_3D_AFRIKATOON, 'illustration')).toMatch(/3D/);
    expect(qualityLine(STYLE_2D_HQ, 'character sheet')).toMatch(/2D/);
    expect(redrawInstruction(STYLE_3D_AFRIKATOON)).toMatch(/3D style/);
  });
  it('the wizard options reach the story prompt and the blueprint', () => {
    const bp = newBlueprint({
      id: 'a',
      idea: 'x',
      dimension: '3D',
      options: { duration: 45, aspect: '16:9', platform: 'YouTube', audience: 'ados', dialogue: false },
    });
    expect([bp.duration, bp.aspect, bp.platform, bp.options?.audience, bp.options?.dialogue]).toEqual([
      45,
      '16:9',
      'YouTube',
      'ados',
      false,
    ]);
    const m = storyMessages({
      idea: 'x',
      durationSec: 45,
      language: 'fr',
      platform: 'YouTube',
      characters: [],
      aspect: '16:9',
      dimension: '3D',
      audience: 'ados',
      dialogue: false,
    });
    expect(m[1]!.content).toMatch(/animation 3D/);
    expect(m[1]!.content).toMatch(/Aucun dialogue/);
  });
});
describe('budget governor', () => {
  it('cheaper mode as the cap approaches, never dearer', () => {
    expect(budgetTier(0, 0).tier).toBe('normal');
    expect(budgetTier(1, 0).tier).toBe('hard-stop');
    for (const m of ['ECO', 'BALANCED', 'QUALITY', 'PREMIUM', 'AUTOPILOT'] as const) {
      expect(effectiveMode(m, 0.1, 1)).toBe(m);
      expect(effectiveMode(m, 0.99, 1)).toBe('ECO');
    }
  });
});
describe('video quality gate', () => {
  const ok = {
    providerCompleted: true,
    bytes: 1e6,
    mime: 'video/mp4',
    playable: true,
    duration: 5,
    width: 720,
    height: 1280,
    expected: { duration: 5, aspect: '9:16' },
  };
  it('technical pass without judge is VALIDATED and says the judge was not run', () => {
    const g = videoGate(ok);
    expect(g.status).toBe('VALIDATED');
    expect(g.checks.find((c) => c.id === 'judge')?.ok).toBeNull();
  });
  it('wrong aspect → NEEDS_REVIEW; unplayable → REJECTED; low judge → NEEDS_REVIEW / REJECTED', () => {
    expect(videoGate({ ...ok, width: 1280, height: 720 }).status).toBe('NEEDS_REVIEW');
    expect(videoGate({ ...ok, playable: false }).status).toBe('REJECTED');
    const j = { promptAdherence: 90, character: 90, sceneAdherence: 90, motion: 90, consistency: 90 };
    expect(videoGate({ ...ok, judge: { ...j, character: 50 } }).status).toBe('NEEDS_REVIEW');
    expect(videoGate({ ...ok, judge: { ...j, character: 10 } }).status).toBe('REJECTED');
    expect(videoGate({ ...ok, judge: j }).status).toBe('VALIDATED');
  });
  it('not yet measured stays GENERATED, never VALIDATED', () => {
    expect(videoGate({ ...ok, playable: null, duration: null, width: null, height: null }).status).toBe(
      'GENERATED',
    );
  });
});
describe('cost ladder', () => {
  const mk = (id: string, usd: number | null, h: Candidate['history'] = null): Candidate => ({
    model: { id } as MediaModel,
    estimate: { usd, certain: usd !== null, formula: '' } as Candidate['estimate'],
    history: h,
  });
  it('best value needs measured quality on n ≥ 20; otherwise says INSUFFICIENT DATA', () => {
    const a = costLadder([mk('cheap', 0.1), mk('dear', 1)]);
    expect(a.cheapestCapable?.model).toBe('cheap');
    expect(a.premium?.model).toBe('dear');
    expect(a.bestValue).toBeNull();
    expect(a.bestValueWhy).toMatch(/INSUFFICIENT DATA/);
    const b = costLadder([
      mk('cheap', 0.1, { n: 25, quality: 60, successRate: 0.9, champion: false, confidence: 'x' }),
      mk('dear', 1, { n: 30, quality: 90, successRate: 0.9, champion: true, confidence: 'x' }),
    ]);
    expect(b.bestValue?.model).toBe('cheap');
    expect(b.champion?.model).toBe('dear');
  });
  it('savings only when both costs are known', () => {
    expect(savedVsPremium(0.2, 1)).toBeCloseTo(0.8);
    expect(savedVsPremium(null, 1)).toBeNull();
  });
});
describe('wizard', () => {
  it('presets and pipeline map to existing spaces', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(11);
    for (const s of STAGES) expect(STAGE_SPACE[s], s).toBeTruthy();
  });
});
import { parseScene, sceneMessages } from '../../server/jev/studio/story';
describe('Story Lab: regenerate ONE scene', () => {
  const base = {
    scene_id: 'S02',
    act: '1',
    beat: 'escalade',
    duration: 6,
    location: 'cour',
    time: 'jour',
    characters: ['A'],
    action: 'avant',
    dialogue: [],
    emotion: 'x',
    camera: 'c',
    lighting: '',
    sound: '',
    music: '',
    transition: 'cut',
    visual_prompt: '',
    video_prompt: '',
    voice_prompt: '',
    subtitle_prompt: '',
    status: 'APPROVED',
    imageAssetId: 'img',
    videoAssetId: 'vid',
  } as never;
  it('keeps id and generated assets, takes the new text', () => {
    const r = parseScene(
      '```json\n{"scene":{"action":"nouvelle action","beat":"twist","duration":7,"dialogue":[{"speaker":"a","text":"Bonjour"}]}}\n```',
      base,
    );
    expect('scene' in r).toBe(true);
    if ('scene' in r) {
      expect([
        r.scene.scene_id,
        r.scene.action,
        r.scene.imageAssetId,
        r.scene.videoAssetId,
        r.scene.dialogue[0]!.speaker,
      ]).toEqual(['S02', 'nouvelle action', 'img', 'vid', 'A']);
    }
  });
  it('refuses an answer without JSON or without action', () => {
    expect('scene' in parseScene('désolé', base)).toBe(false);
    expect('scene' in parseScene('{"beat":"x"}', base)).toBe(false);
  });
  it('the prompt marks the scene to rewrite and carries no secret', () => {
    const m = sceneMessages({
      idea: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789abcdef',
      logline: '',
      language: 'fr',
      scenes: [base],
      index: 0,
    });
    expect(m[1]!.content).toContain('>> S02');
    expect(m[1]!.content).not.toMatch(/sk-or-v1-abcdef/);
  });
});
import { duckingPoints, autoTimeline, TRACKS } from '../../server/jev/studio/timeline';
import { planEmojis } from '../../server/jev/studio/subtitles';
describe('AI Editor: ducking and emoji track', () => {
  it('music ducks under voices and recovers; adjacent voices keep it low', () => {
    const p = duckingPoints([
      { start: 2, end: 4 },
      { start: 4.2, end: 5 },
    ]);
    expect(p[0]).toEqual({ t: 0, v: 0.22 });
    expect(p.filter((x) => x.v === 0.08).map((x) => x.t)).toEqual([2, 5]);
    expect(p.at(-1)).toEqual({ t: 5.4, v: 0.22 });
    expect(duckingPoints([])).toEqual([{ t: 0, v: 0.22 }]);
  });
  it('emoji plan: at most one per scene and one per 3 s, deterministic', () => {
    const l = (sceneId: string, start: number) =>
      ({
        sceneId,
        index: 0,
        speaker: 'A',
        text: 'x',
        start,
        end: start + 1,
        emoji: '🤣',
        words: [],
      }) as never;
    const plan = planEmojis([l('S01', 0), l('S01', 1), l('S02', 2), l('S03', 6)]);
    expect(plan.map((e) => e.sceneId)).toEqual(['S01', 'S03']);
    expect(planEmojis([l('S01', 0), l('S01', 1), l('S02', 2), l('S03', 6)])).toEqual(plan);
  });
  it('the timeline has an EMOJIS track', () => {
    expect(TRACKS).toContain('emoji');
    expect(typeof autoTimeline).toBe('function');
  });
});
