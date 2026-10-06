import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  buildRegistry,
  parseImageModels,
  parseVideoModels,
  parseSpeechModels,
  validateImageRequest,
  validateVideoRequest,
  validateSpeechRequest,
  modelsWith,
  type Registry,
  type MediaModel,
} from '../../server/jev/studio/capabilities';
import {
  checkBudget,
  estimateImage,
  estimateSpeech,
  estimateVideo,
  pickModel,
  type Candidate,
} from '../../server/jev/studio/cost';
import { classifyError, withRetry, StudioError } from '../../server/jev/studio/errors';
import {
  newJob,
  startJob,
  markSubmitted,
  completeJob,
  failJob,
  canAutoRetry,
  recoverJobs,
  cancelJob,
  spentOf,
} from '../../server/jev/studio/jobs';
import { scanSecrets, redactSecrets } from '../../server/jev/studio/secrets';
import { makeZip, crc32 } from '../../server/jev/studio/zip';
import { compose, compileScene, hash, sceneDims, REDRAW_INSTRUCTION } from '../../server/jev/studio/genome';
import { STYLE_2D_HQ } from '../../server/jev/studio/style';
import { extractJson, parseStory, storyMessages } from '../../server/jev/studio/story';
import { newBlueprint, serialize, loadBlueprint, progress } from '../../server/jev/studio/blueprint';
import { buildKit, validateKit, buildKitZip } from '../../server/jev/studio/kit';
import { timeSubtitles, emojiFor, toSrt, activeAt } from '../../server/jev/studio/subtitles';
import {
  buildQAReport,
  continuityCheck,
  contextPack,
  planRepairs,
  ruleCheck,
} from '../../server/jev/studio/qa';
import { championTable, analytics, promptPatterns, type ProdRecord } from '../../server/jev/studio/memory';
import { parseSocial } from '../../server/jev/studio/social';
import type { CharacterSheet, Scene } from '../../server/jev/studio/types';

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/studio', n), 'utf8'));
const reg = (): Registry =>
  buildRegistry(
    {
      images: fx('images.json'),
      videos: fx('videos.json'),
      speech: fx('speech.json'),
      audio: fx('audio.json'),
    },
    null,
    1,
  );
const withImagePrices = (r: Registry) => {
  const ep = fx('image-endpoints.json') as Record<
    string,
    { endpoints: { pricing: { billable: string; unit: string; cost_usd: number; variant?: string }[] }[] }
  >;
  for (const m of r.models)
    if (m.kind === 'image' && ep[m.id])
      m.pricing = {
        ...m.pricing,
        imageLoaded: true,
        image: ep[m.id]!.endpoints[0]!.pricing.map((p) => ({
          billable: p.billable,
          unit: p.unit,
          usd: p.cost_usd,
          variant: p.variant,
        })),
      };
  return r;
};
const get = (r: Registry, id: string) => r.models.find((m) => m.id === id)!;

describe('MediaCapabilityRegistry (real payloads of 2026-10-06)', () => {
  const r = withImagePrices(reg());
  it('discovers images, videos, speech and music from the payloads — no model name hard-coded', () => {
    expect(r.models.filter((m) => m.kind === 'image').length).toBeGreaterThanOrEqual(3);
    expect(r.models.filter((m) => m.kind === 'video').length).toBeGreaterThanOrEqual(3);
    expect(r.models.filter((m) => m.kind === 'speech').length).toBeGreaterThanOrEqual(3);
    expect(r.models.filter((m) => m.kind === 'music').length).toBeGreaterThanOrEqual(1);
  });
  it('derives capabilities and parameters from the declared fields only', () => {
    const hy = get(r, 'tencent/hy-image-v3.5-preview');
    expect(hy.caps).toContain('REFERENCE_IMAGES');
    expect(hy.image!.inputReferences!.max).toBe(20);
    expect(hy.image!.aspectRatios).toContain('9:16');
    const hailuo = get(r, 'minimax/hailuo-3');
    expect(hailuo.caps).toEqual(
      expect.arrayContaining(['VIDEO_GENERATION', 'IMAGE_TO_VIDEO', 'FIRST_LAST_FRAME']),
    );
    const heygen = get(r, 'heygen/heygen-video-1');
    expect(heygen.caps).not.toContain('FIRST_LAST_FRAME');
    expect(heygen.caps).not.toContain('AUDIO'); // generate_audio:false in the payload
    expect(
      modelsWith(r, 'video', 'FIRST_LAST_FRAME').every((m) => m.video!.frameImages.includes('last_frame')),
    ).toBe(true);
  });
  it('speech: voices come from supported_voices and the free model is flagged free', () => {
    const k = get(r, 'hexgrad/kokoro-82m');
    expect(k.voices.length).toBeGreaterThan(0);
    const free = r.models.find((m) => m.kind === 'speech' && m.id.endsWith(':free'));
    if (free) expect(free.free).toBe(true);
  });
  it('an invalid configuration is never sent: validation against the discovered capabilities', () => {
    const hy = get(r, 'tencent/hy-image-v3.5-preview');
    expect(validateImageRequest(hy, { aspect_ratio: '9:16', resolution: '2K', references: 1 }).ok).toBe(true);
    expect(validateImageRequest(hy, { aspect_ratio: '7:3' }).ok).toBe(false);
    expect(validateImageRequest(hy, { references: 21 }).errors.join()).toMatch(/21/);
    expect(validateImageRequest(hy, { n: 4 }).ok).toBe(false);
    const heygen = get(r, 'heygen/heygen-video-1');
    expect(
      validateVideoRequest(heygen, {
        duration: 6,
        aspect_ratio: '9:16',
        resolution: '480p',
        frames: ['first_frame'],
      }).ok,
    ).toBe(true);
    expect(validateVideoRequest(heygen, { duration: 4 }).ok).toBe(false);
    expect(validateVideoRequest(heygen, { frames: ['last_frame'] }).ok).toBe(false);
    expect(validateVideoRequest(heygen, { generate_audio: true }).errors.join()).toMatch(/audio/);
    expect(validateVideoRequest(heygen, { passthrough: ['voice_id'] }).ok).toBe(false);
    const k = get(r, 'hexgrad/kokoro-82m');
    expect(validateSpeechRequest(k, { voice: 'inexistante' }).ok).toBe(false);
    expect(validateSpeechRequest(k, { voice: k.voices[0] }).ok).toBe(true);
  });
  it('new / removed models are reported; a failed source never makes models look removed', () => {
    const first = reg();
    const half = buildRegistry(
      {
        images: { data: fx('images.json').data.slice(0, 2) },
        videos: undefined,
        sources: [{ endpoint: 'videos', ok: false, count: 0 }],
      },
      first,
      2,
    );
    expect(half.removed.some((id) => first.models.find((m) => m.id === id)?.kind === 'video')).toBe(false);
    expect(half.removed.length).toBeGreaterThan(0);
    const again = buildRegistry(
      {
        images: fx('images.json'),
        videos: fx('videos.json'),
        speech: fx('speech.json'),
        audio: fx('audio.json'),
      },
      half,
      3,
    );
    expect(again.added.length).toBeGreaterThan(0);
  });
  it('pure parsers tolerate garbage', () => {
    expect(parseImageModels(null)).toEqual([]);
    expect(parseVideoModels({ data: [{ nope: 1 }] })).toEqual([]);
    expect(parseSpeechModels({ data: 'x' })).toEqual([]);
  });
});

describe('cost before the call + governor', () => {
  const r = withImagePrices(reg());
  it('image: per-image price is exact, variant by resolution, token billing is « estimation incertaine »', () => {
    const seed = get(r, 'bytedance-seed/seedream-5-0-flash');
    expect(estimateImage(seed, { n: 2 })).toMatchObject({ usd: 0.036, certain: true });
    const flux = get(r, 'black-forest-labs/flux-3-image');
    expect(estimateImage(flux, { resolution: '1K' }).usd).toBeCloseTo(0.048);
    expect(estimateImage(flux, { resolution: '9K' }).certain).toBe(false);
    const hy = get(r, 'tencent/hy-image-v3.5-preview');
    const e = estimateImage(hy, {});
    expect(e.usd).toBeNull();
    expect(e.certain).toBe(false);
    expect(e.formula).toMatch(/token/);
    expect(estimateImage(get(r, 'inclusionai/ming-image-0.1-design-layer'), {})).toMatchObject({
      usd: 0,
      certain: true,
    });
  });
  it('video: by resolution, per second, token-based is uncertain with its formula', () => {
    expect(
      estimateVideo(get(r, 'heygen/heygen-video-1'), { duration: 10, resolution: '480p' }),
    ).toMatchObject({ certain: true });
    expect(
      estimateVideo(get(r, 'heygen/heygen-video-1'), { duration: 10, resolution: '480p' }).usd,
    ).toBeCloseTo(0.2);
    expect(estimateVideo(get(r, 'minimax/hailuo-3'), { duration: 5 }).usd).toBeCloseTo(0.65);
    const tok = estimateVideo(get(r, 'bytedance/seedance-2.5'), { duration: 5 });
    expect(tok.usd).toBeNull();
    expect(tok.certain).toBe(false);
    expect(tok.formula).toMatch(/jetons vidéo/);
    expect(estimateVideo(get(r, 'black-forest-labs/flux-video-edit'), { duration: 4 }).usd).toBeCloseTo(0.12);
  });
  it('speech: approximate (uncertain) unless free', () => {
    const k = get(r, 'hexgrad/kokoro-82m');
    const e = estimateSpeech(k, 400);
    expect(e.certain).toBe(false);
    expect(e.usd).toBeCloseTo(100 * 0.00000062);
    const free = { ...k, pricing: { tokenPrices: { prompt: 0, completion: 0 } } } as MediaModel;
    expect(estimateSpeech(free, 400)).toMatchObject({ usd: 0, certain: true });
  });
  it('hard cap: a call that would exceed the cap is blocked until explicitly confirmed (TEST 19)', () => {
    const s = { mode: 'ECO' as const, cap: 1, spent: 0.95 };
    const d = checkBudget(s, { usd: 0.1, certain: true, formula: '' });
    expect(d).toMatchObject({ allowed: false, blocked: true, needsConfirmation: true });
    expect(checkBudget(s, { usd: 0.1, certain: true, formula: '' }, true).allowed).toBe(true);
    expect(checkBudget(s, { usd: 0.01, certain: true, formula: '' }).allowed).toBe(true);
    expect(
      checkBudget({ ...s, spent: 0 }, { usd: null, certain: false, formula: 'jetons' }).needsConfirmation,
    ).toBe(true);
  });
  it('model choice by capability: ECO = cheapest certain price; QUALITY never claims "best" without evidence', () => {
    const mk = (id: string, usd: number | null, history: Candidate['history'] = null): Candidate => ({
      model: { id, name: id } as MediaModel,
      estimate: { usd, certain: usd !== null, formula: '' },
      history,
    });
    const eco = pickModel([mk('a', 0.05), mk('b', 0.01), mk('c', null)], 'ECO');
    expect(eco.model!.id).toBe('b');
    const champ = pickModel(
      [
        mk('a', 0.011, { n: 30, quality: 90, successRate: 0.95, champion: true, confidence: 'ROBUST' }),
        mk('b', 0.01),
      ],
      'ECO',
    );
    expect(champ.model!.id).toBe('a');
    const q = pickModel([mk('a', 0.05), mk('b', 0.5)], 'QUALITY');
    expect(q.explain.join()).toMatch(/non prouvé/);
    expect(pickModel([], 'ECO').model).toBeNull();
  });
});

describe('errors and retries', () => {
  it('classification (TEST 11)', () => {
    expect(classifyError({ status: 401 }).cls).toBe('AUTH_ERROR');
    expect(classifyError({ status: 402, message: 'insufficient credits' }).cls).toBe('INSUFFICIENT_CREDITS');
    expect(classifyError({ status: 429 })).toMatchObject({ cls: 'RATE_LIMIT', transient: true });
    expect(classifyError({ status: 503 })).toMatchObject({ cls: 'SERVER_ERROR', transient: true });
    expect(classifyError({ status: 400, message: 'invalid aspect_ratio' }).cls).toBe('INVALID_PARAMETER');
    expect(classifyError({ status: 404, message: 'No endpoints found that support x' }).cls).toBe(
      'UNSUPPORTED_CAPABILITY',
    );
    expect(classifyError({ status: 400, message: 'blocked by safety policy' }).cls).toBe('CONTENT_ERROR');
    expect(classifyError({ name: 'AbortError' })).toMatchObject({ cls: 'TIMEOUT', transient: true });
    expect(classifyError({ status: 0, message: 'Failed to fetch' })).toMatchObject({
      cls: 'SERVER_ERROR',
      transient: true,
    });
    expect(classifyError({ status: 418 }).cls).toBe('UNKNOWN');
  });
  it('retries only transient errors, with exponential back-off', async () => {
    const waits: number[] = [];
    let calls = 0;
    const r = await withRetry(
      async () => {
        if (++calls < 3) throw new StudioError('RATE_LIMIT', 'x', 429, true);
        return 'ok';
      },
      { retries: 3, baseMs: 100, sleep: async (ms) => void waits.push(ms) },
    );
    expect(r).toEqual({ value: 'ok', retries: 2 });
    expect(waits).toEqual([100, 200]);
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new StudioError('AUTH_ERROR', 'k', 401, false);
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow();
    expect(n).toBe(1);
    n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new StudioError('SERVER_ERROR', 'k', 500, true, true);
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow();
    expect(n).toBe(1); // already paid: never retried
  });
});

describe('job queue', () => {
  const base = () =>
    newJob({ projectId: 'p', kind: 'video', task: 'i2v', model: 'm', estimate: 0.5, estimateCertain: true });
  it('lifecycle and cost accounting', () => {
    let jobs = [base()];
    const id = jobs[0]!.id;
    jobs = startJob(jobs, id);
    jobs = markSubmitted(jobs, id, 'rid', 'https://x/poll');
    jobs = completeJob(jobs, id, { cost: 0.42, assetId: 'a1' });
    expect(jobs[0]).toMatchObject({ status: 'COMPLETED', paid: true, cost: 0.42 });
    expect(spentOf(jobs, 'p')).toBeCloseTo(0.42);
    expect(cancelJob(jobs, id)[0]!.status).toBe('COMPLETED');
  });
  it('a paid job is never auto-retried; transient unpaid failures may be', () => {
    let a = [base()];
    a = failJob(a, a[0]!.id, { error: 'x', errorClass: 'RATE_LIMIT' });
    expect(canAutoRetry(a[0]!)).toBe(true);
    let b = [base()];
    b = markSubmitted(b, b[0]!.id, 'r');
    b = failJob(b, b[0]!.id, { error: 'x', errorClass: 'SERVER_ERROR' });
    expect(canAutoRetry(b[0]!)).toBe(false);
    let c = [base()];
    c = failJob(c, c[0]!.id, { error: 'x', errorClass: 'AUTH_ERROR' });
    expect(canAutoRetry(c[0]!)).toBe(false);
  });
  it('on reopening, running video jobs are re-polled, never resubmitted', () => {
    let jobs = [
      base(),
      base(),
      newJob({ projectId: 'p', kind: 'image', task: 't', model: 'm', estimate: 0, estimateCertain: true }),
    ];
    jobs = jobs.map((j) => ({ ...j, status: 'RUNNING' as const }));
    jobs = markSubmitted(jobs, jobs[0]!.id, 'rid-1', 'https://x');
    const rec = recoverJobs(jobs);
    expect(rec.repoll.map((j) => j.remoteId)).toEqual(['rid-1']);
    expect(rec.orphaned).toHaveLength(2);
    expect(rec.jobs.filter((j) => j.status === 'FAILED')).toHaveLength(2);
    expect(rec.jobs.find((j) => j.id === jobs[0]!.id)!.status).toBe('RUNNING');
  });
});

describe('secrets and zip', () => {
  it('detects keys, tokens and assignments; masks them', () => {
    const k = 'sk-or-v1-0123456789abcdef0123456789abcdef';
    expect(scanSecrets(`Authorization: Bearer ${k}`).length).toBeGreaterThan(0);
    expect(scanSecrets('api_key = "abcdef123456"').length).toBeGreaterThan(0);
    expect(scanSecrets('un sketch drôle sur la belle-mère')).toEqual([]);
    expect(redactSecrets(`clé ${k}`)).not.toContain(k);
  });
  it('writes a valid ZIP (checked by an independent unzip)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
    const f = path.join(dir, 't.zip');
    fs.writeFileSync(
      f,
      makeZip([
        { path: 'a/b.txt', data: 'héllo' },
        { path: 'c.bin', data: new Uint8Array([0, 1, 2, 255]) },
      ]),
    );
    const out = execFileSync('python3', [
      '-c',
      'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(z.read("a/b.txt").decode());print(list(z.read("c.bin")))',
      f,
    ]).toString();
    expect(out).toContain('None');
    expect(out).toContain('héllo');
    expect(out).toContain('[0, 1, 2, 255]');
    fs.rmSync(dir, { recursive: true });
  });
});

const chars: CharacterSheet[] = ['MAMAN NOUNOU', 'COUMBA', 'PETIT MAMADOU'].map((n) => ({
  id: n,
  name: n,
  role: 'x',
  age: '50',
  gender: 'f',
  ethnicity: '',
  skin: '',
  face: '',
  hair: '',
  body: '',
  height: '',
  clothing: n === 'COUMBA' ? 'robe wax rose et violette' : 'foulard et pagne rouges',
  shoes: '',
  accessories: '',
  voice: '',
  accent: '',
  personality: '',
  emotionalProfile: '',
  gestures: '',
  posture: '',
  walk: '',
  facialExpressions: '',
  speakingStyle: '',
  poses: {},
  consistency: `${n}: profil compact`,
}));
const scene = (i: number, o: Partial<Scene> = {}): Scene => ({
  scene_id: `S0${i}`,
  act: '1',
  beat: 'hook',
  duration: 8,
  location: 'salon',
  time: 'jour',
  characters: ['MAMAN NOUNOU', 'COUMBA'],
  action: 'MAMAN NOUNOU découvre le secret',
  dialogue: [
    {
      speaker: 'MAMAN NOUNOU',
      text: 'Coumba, qu’est-ce que c’est que ça ?',
      language: 'fr',
      emotion: 'shock',
      intensity: 0.8,
      pace: 1,
      pauseAfterMs: 200,
    },
  ],
  emotion: 'shock',
  camera: 'gros plan',
  lighting: 'jour',
  sound: 'porte qui claque',
  music: 'balafon',
  transition: 'cut',
  visual_prompt: 'salon dakarois',
  video_prompt: '',
  voice_prompt: '',
  subtitle_prompt: '',
  status: 'DRAFT',
  ...o,
});

describe('Prompt Genome', () => {
  it('composes from dimensions, versions deterministically, injects Style DNA, character consistency and negatives (TEST 14)', () => {
    const sc = scene(1);
    const ctx = { style: STYLE_2D_HQ, characters: chars, worlds: [], platform: 'TikTok', aspect: '9:16' };
    const a = compileScene(sc, ctx, 'image', {}, 'm');
    const b = compileScene(sc, ctx, 'image', {}, 'm');
    expect(a.version).toBe(b.version);
    expect(a.text).toContain(STYLE_2D_HQ.renderStyle);
    expect(a.text).toContain('MAMAN NOUNOU: profil compact');
    expect(a.text).toMatch(/Avoid: .*3D render/);
    expect(compileScene({ ...sc, action: 'autre chose' }, ctx, 'image').version).not.toBe(a.version);
    expect(Object.keys(sceneDims(sc, ctx))).toContain('CAMERA');
  });
  it('adapts to the model: truncation and inline negatives; never leaks a secret', () => {
    const sc = scene(1, { action: 'x '.repeat(400) });
    const ctx = { style: STYLE_2D_HQ, characters: chars, worlds: [] };
    const c = compileScene(sc, ctx, 'image', { maxChars: 300 });
    expect(c.truncated).toBe(true);
    expect(c.text.length).toBeLessThanOrEqual(300);
    expect(
      compose('image', { SUBJECT: 'chat', NEGATIVE: 'flou' }, { negativeInline: false }).text,
    ).not.toContain('flou');
    expect(compose('image', { SUBJECT: 'clé sk-or-v1-0123456789abcdef0123' }).text).not.toMatch(
      /sk-or-v1-0123/,
    );
    expect(hash('a')).toMatch(/^[0-9a-f]{8}$/);
    expect(REDRAW_INSTRUCTION).toMatch(/white background/);
  });
  it('default style is locked 2D and forbids 3D / photoreal', () => {
    expect(STYLE_2D_HQ.locked).toBe(true);
    expect(STYLE_2D_HQ.negative).toMatch(/3D render/);
    expect(Object.isFrozen(STYLE_2D_HQ)).toBe(true);
  });
});

describe('story', () => {
  const answer = JSON.stringify({
    title: 'Le secret du gendre',
    logline: 'Une belle-mère découvre un secret',
    hook: 'Qui a pris mon argent ?',
    punchline: 'C’était pour toi, maman',
    characters: ['maman nounou', 'coumba'],
    scenes: [
      {
        beat: 'hook',
        duration: 20,
        location: 'salon',
        characters: ['maman nounou'],
        action: 'elle fouille',
        dialogue: [
          {
            speaker: 'maman nounou',
            text: 'Dama bëgg xam lépp tout de suite maintenant, vraiment, je veux tout savoir ici',
            emotion: 'angry',
          },
        ],
      },
      {
        beat: 'chute',
        duration: 25,
        location: 'cour',
        characters: ['coumba'],
        action: 'rire',
        dialogue: [{ speaker: 'coumba', text: 'Surprise !', emotion: 'laugh' }],
      },
    ],
  });
  it('extracts JSON from noisy output, normalises, and flags long lines / missing translation / short duration', () => {
    expect(extractJson('blabla ```json\n{"a":{"b":"}"}}\n``` fin')).toEqual({ a: { b: '}' } });
    expect(extractJson('pas de json')).toBeNull();
    const p = parseStory(`Voici : ${answer}`, { durationSec: 62, language: 'fr' }) as Exclude<
      ReturnType<typeof parseStory>,
      { issues: unknown }
    >;
    expect(p.scenes).toHaveLength(2);
    expect(p.scenes[0]!.dialogue[0]!.speaker).toBe('MAMAN NOUNOU');
    const codes = p.issues.map((i) => i.code);
    expect(codes).toContain('LONG_LINE');
    expect(codes).toContain('NO_TRANSLATION');
    expect(codes).toContain('DURATION_SHORT');
    expect(p.story.characters).toEqual(expect.arrayContaining(['MAMAN NOUNOU', 'COUMBA']));
  });
  it('never throws on garbage, and the prompt carries the safety rules', () => {
    expect('issues' in parseStory('???', { durationSec: 60, language: 'fr' })).toBe(true);
    const m = storyMessages({
      idea: 'x',
      durationSec: 62,
      language: 'fr',
      platform: 'TikTok',
      characters: [{ name: 'Coumba', role: 'bru' }],
    });
    expect(m[0]!.content).toMatch(/jamais un groupe/);
    expect(m[1]!.content).toContain('COUMBA');
  });
});

describe('blueprint, kit, export', () => {
  const bp = () => {
    const b = newBlueprint({ id: 'p1', idea: 'belle-mère', now: 1 });
    b.title = 'Le secret du gendre';
    b.characters = chars;
    b.scenes = [scene(1), scene(2, { beat: 'chute', characters: ['COUMBA'] })];
    b.story = {
      title: b.title,
      logline: 'l',
      concept: 'c',
      synopsis: 's',
      hook: 'h',
      twist: 't',
      punchline: 'p',
      conflict: '',
      climax: '',
      resolution: '',
      durationSec: 62,
      characters: [],
      setting: 'Dakar',
      theme: 'famille',
    };
    return b;
  };
  it('video stage disabled by default, cap 1 $, mode ECO, style locked', () => {
    const b = newBlueprint({ id: 'x', idea: 'i' });
    expect(b.stages.VIDEO).toBe('DISABLED');
    expect([b.cap, b.mode, b.styleDNA.locked]).toEqual([1, 'ECO', true]);
    expect(progress(b)).toBe(0);
  });
  it('round-trips through JSON and refuses to serialise a secret (TEST 13, 18)', () => {
    const b = bp();
    const s = serialize(b);
    expect(s.ok).toBe(true);
    if (s.ok) expect(loadBlueprint(JSON.parse(s.json))!.title).toBe(b.title);
    b.prompts.push({
      id: 'x',
      version: 'v',
      kind: 'image',
      text: 'clé sk-or-v1-0123456789abcdef0123456789',
      at: 1,
    });
    expect(serialize(b).ok).toBe(false);
    expect(loadBlueprint({ nope: 1 })).toBeNull();
  });
  it('afrikatoon-auto kit follows the run.py schema; names in CAPITALS; only measured scores (TEST 16)', () => {
    const k = buildKit(bp(), { caption: 'Qui a raison ?', hashtags: ['sketch'] });
    expect(validateKit(k)).toEqual({ ok: true, errors: [] });
    expect(k.characters).toContain('MAMAN NOUNOU');
    expect(k.score).toEqual({});
    expect(k.scenes[0]!.dialogue[0]).toEqual({
      speaker: 'MAMAN NOUNOU',
      text: 'Coumba, qu’est-ce que c’est que ça ?',
    });
    expect(validateKit({ ...k, characters: ['coumba'] }).ok).toBe(false);
    expect(validateKit({ title: 1 }).ok).toBe(false);
  });
  it('kit ZIP contains kits/<date>/NN-slug.json, 2D assets with meta.json and LISEZMOI.txt', () => {
    const {
      zip,
      validation,
      path: p,
    } = buildKitZip(bp(), {
      date: '2026-10-06',
      assets: [
        { character: 'Coumba', pose: 'neutral', bytes: new Uint8Array([137, 80]), meta: { src: 'studio' } },
      ],
    });
    expect(validation.ok).toBe(true);
    expect(p).toBe('kits/2026-10-06/01-le-secret-du-gendre.json');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
    const f = path.join(dir, 'k.zip');
    fs.writeFileSync(f, zip);
    const names = execFileSync('python3', [
      '-c',
      'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print("\\n".join(z.namelist()))',
      f,
    ]).toString();
    expect(names).toContain('kits/2026-10-06/01-le-secret-du-gendre.json');
    expect(names).toContain('assets/characters_2d_ia/COUMBA/neutral.png');
    expect(names).toContain('assets/characters_2d_ia/COUMBA/meta.json');
    expect(names).toContain('LISEZMOI.txt');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('subtitles', () => {
  it('word timings, contextual emoji (deterministic), SRT and active word', () => {
    const lines = timeSubtitles([scene(1), scene(2)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.end).toBeGreaterThan(lines[0]!.start);
    expect(lines[1]!.start).toBeGreaterThanOrEqual(8);
    expect(lines[0]!.words.at(-1)!.end).toBeCloseTo(lines[0]!.end, 5);
    expect(emojiFor('shock')).toBe('😱');
    expect(emojiFor('shock')).toBe(emojiFor('shock'));
    expect(emojiFor('neutral', 'rien')).toBeUndefined();
    expect(toSrt(lines)).toMatch(/00:00:00,3\d\d --> /);
    expect(activeAt(lines, lines[0]!.start + 0.01)!.wordIndex).toBe(0);
    expect(activeAt(lines, 999)).toBeNull();
  });
  it('measured voice durations override the estimate', () => {
    const l = timeSubtitles([scene(1)], { voiceSeconds: { S01: [5] } });
    expect(l[0]!.end - l[0]!.start).toBeCloseTo(5);
  });
});

describe('QA, continuity, repair', () => {
  const mkbp = () => {
    const b = newBlueprint({ id: 'p', idea: 'i', now: 1 });
    b.characters = chars;
    b.worlds = [
      {
        id: 'w',
        name: 'salon',
        architecture: '',
        palette: '',
        lighting: '',
        weather: '',
        time: '',
        textures: '',
        objects: '',
        background: '',
        cameraAngles: '',
        referenceAssetIds: [],
      },
    ];
    b.scenes = [scene(1), scene(2)];
    return b;
  };
  it('no judge → visual/audio/consistency stay null; TOTAL is built only from measured scores (TEST 15, 17)', () => {
    const q = buildQAReport(mkbp(), {}, 1);
    expect(q.scores.visual).toBeNull();
    expect(q.scores.audio).toBeNull();
    expect(q.judge).toBeNull();
    expect(typeof q.scores.narrative).toBe('number');
    const judged = buildQAReport(mkbp(), { visual: 80, judge: 'm/vision', confidence: 'MEDIUM' }, 1);
    expect(judged.scores.visual).toBe(80);
    expect(judged.judge).toBe('m/vision');
    expect(buildQAReport(newBlueprint({ id: 'e', idea: '' }), {}, 1).total).toBeNull();
    // a score without the judge identity is discarded
    expect(buildQAReport(mkbp(), { visual: 99 }, 1).scores.visual).toBeNull();
  });
  it('detects wrong aspect, short TikTok, brand logos, sensitive content, unknown character, long lines', () => {
    const b = mkbp();
    b.aspect = '16:9';
    b.scenes[0]!.visual_prompt = 'un maillot Nike jaune';
    b.scenes[1]!.characters = ['INCONNU'];
    b.scenes[1]!.dialogue[0]!.text = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize';
    const codes = ruleCheck(b).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'WRONG_ASPECT',
        'DURATION_SHORT',
        'BRAND_LOGO',
        'UNKNOWN_CHARACTER',
        'LONG_LINE',
      ]),
    );
    b.scenes[0]!.action = 'les noirs sont stupides';
    expect(ruleCheck(b).map((i) => i.code)).toContain('SENSITIVE_CONTENT');
  });
  it('continuity: time jump without transition, speaker absent from the scene', () => {
    const b = mkbp();
    b.scenes[0]!.time = 'nuit';
    b.scenes[1]!.time = 'matin';
    b.scenes[1]!.dialogue[0]!.speaker = 'PETIT MAMADOU';
    const codes = continuityCheck(b).map((i) => i.code);
    expect(codes).toContain('TIME_JUMP');
    expect(codes).toContain('SPEAKER_NOT_IN_SCENE');
  });
  it('compressed context never sends the whole project; repairs are targeted (TEST 15)', () => {
    const b = mkbp();
    b.scenes = Array.from({ length: 30 }, (_, i) =>
      scene((i % 9) + 1, { scene_id: `S${i}`, action: 'x'.repeat(500) }),
    );
    const p = contextPack(b, 'S10', 900);
    expect(p.text.length).toBeLessThanOrEqual(900);
    expect(p.omittedChars).toBeGreaterThan(1000);
    expect(p.text).toContain('SCÈNE PRÉCÉDENTE (S9)');
    const plan = planRepairs([
      { code: 'FACE_DRIFT', severity: 'warn', message: '' },
      { code: 'SUBTITLE_DESYNC', severity: 'warn', message: '' },
      { code: 'NO_IMAGE', severity: 'info', message: '' },
    ]);
    expect(plan.map((x) => x.repair?.action)).toEqual([
      'REGENERATE_CHARACTER_REFERENCE',
      'RECOMPUTE_SUBTITLES',
    ]);
  });
});

describe('production memory and audiovisual champions (real data only)', () => {
  const rec = (i: number, model: string, success: boolean, o: Partial<ProdRecord> = {}): ProdRecord => ({
    id: `r${i}`,
    at: i,
    projectId: 'p',
    kind: 'image',
    task: '2D-REDRAW',
    style: '2D-HQ',
    contract: '9:16',
    risk: 'normal',
    model,
    success,
    quality: null,
    cost: 0.02,
    latencyMs: 4000,
    regenerated: false,
    fallback: false,
    ...o,
  });
  it('INSUFFICIENT SAMPLE → no champion, never « best model » (TEST 17)', () => {
    const t = championTable(Array.from({ length: 4 }, (_, i) => rec(i, 'a', true)));
    expect(t[0]!.champion).toBeNull();
    expect(t[0]!.decision).toBe('INSUFFICIENT SAMPLE');
    expect(championTable([])).toEqual([]);
    expect(analytics([])).toBeNull();
  });
  it('champion only with n ≥ 20 and a high LOWER bound; a lucky model stays challenger', () => {
    const lucky = Array.from({ length: 6 }, (_, i) => rec(i, 'lucky', true));
    const solid = Array.from({ length: 40 }, (_, i) => rec(100 + i, 'solid', i % 10 !== 0));
    const t = championTable([...lucky, ...solid])[0]!;
    expect(t.champion).toBe('solid');
    expect(t.challenger).toBe('lucky');
    const weak = Array.from({ length: 40 }, (_, i) => rec(i, 'weak', i % 2 === 0));
    expect(championTable(weak)[0]!.champion).toBeNull();
  });
  it('an isolated success never becomes a rule', () => {
    const p = promptPatterns([
      rec(1, 'a', true, { prompt: 'pg-1' }),
      ...Array.from({ length: 6 }, (_, i) => rec(10 + i, 'a', true, { prompt: 'pg-2' })),
    ]);
    expect(p.find((x) => x.prompt === 'pg-1')!.isRule).toBe(false);
    expect(p.find((x) => x.prompt === 'pg-2')!.isRule).toBe(true);
  });
  it('analytics computed from the records only', () => {
    const a = analytics(
      [
        rec(1, 'a', true, { cost: 0.5 }),
        rec(2, 'a', false, { cost: 0.25, errorClass: 'RATE_LIMIT', regenerated: true }),
      ],
      { projects: 1, scenes: 4 },
    )!;
    expect(a.totalCost).toBeCloseTo(0.75);
    expect(a.costPerVideo).toBeCloseTo(0.75);
    expect(a.regenerationRate).toBe(0.5);
    expect(a.topError).toEqual({ cls: 'RATE_LIMIT', n: 1 });
    expect(a.qualityMean).toBeNull();
  });
});

describe('social', () => {
  it('requires a closing question and 6–8 hashtags', () => {
    const ok = parseSocial(
      JSON.stringify({
        hooks: ['a', 'b'],
        title: 't',
        description: 'd',
        caption: 'Qui a raison ?',
        hashtags: ['a', 'b', 'c', 'd', 'e', 'f'],
        thumbnail: 't',
        cta: 'c',
        emojis: ['😂'],
      }),
      'TikTok',
    );
    expect(ok.issues).toEqual([]);
    const bad = parseSocial(JSON.stringify({ hooks: ['a'], caption: 'Voilà', hashtags: ['a'] }), 'TikTok');
    expect(bad.issues.length).toBe(3);
    expect(parseSocial('rien', 'TikTok').pack).toBeNull();
  });
});
