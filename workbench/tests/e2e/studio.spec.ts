// AI Visual Studio — end-to-end in Chromium, from file://. OpenRouter media endpoints are intercepted with REAL payloads
// captured on 2026-10-06 (tests/fixtures/studio); the text LLM is the usual local mock.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { expect, test, type Page, type Route } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { validateKit } from '../../server/jev/studio/kit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const FX = (n: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/studio', n), 'utf8'));
const KEY = 'sk-or-v1-e2e-direct-key';
let mock: MockOpenRouter;
let tmp = '';
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-studio-'));
});
test.afterAll(async () => {
  await mock?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
test.beforeEach(() => mock.reset());
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const wav = (sec = 1.2, sr = 8000) => {
  const n = Math.floor(sec * sr);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2);
  return b;
};
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

interface Net {
  imageCalls: { model: string; body: Record<string, unknown> }[];
  speechCalls: number;
  videoSubmits: number;
  polls: number;
  discovery: string[];
  /** Scripted behaviour of POST /images: queue of status codes (200 = success). */
  imageScript: (number | { status: number; message: string })[];
  imageCost: number;
  videoCost: number;
  /** Real price / announced price when videoCost < 0 (v48: Grok billed 0,168 $ for 0,150 $ announced). */
  videoMarkup?: number;
  videoBodies: Record<string, unknown>[];
}
async function intercept(page: Page): Promise<Net> {
  const net: Net = {
    imageCalls: [],
    speechCalls: 0,
    videoSubmits: 0,
    polls: 0,
    discovery: [],
    imageScript: [],
    imageCost: 0.018,
    videoCost: 0.2,
    videoBodies: [],
  };
  const epById = FX('image-endpoints.json') as Record<string, unknown>;
  await page.route(/openrouter\.ai\/api\/v1\/(images|videos|audio)/, async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (p === '/images/models') return (net.discovery.push('images'), json(route, FX('images.json')));
    if (p === '/videos/models') return (net.discovery.push('videos'), json(route, FX('videos.json')));
    const ep = p.match(/^\/images\/models\/(.+)\/endpoints$/);
    if (ep) return json(route, epById[ep[1]!] ?? { endpoints: [] });
    if (p === '/images' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      net.imageCalls.push({ model: String(body.model), body });
      const step = net.imageScript.shift() ?? 200;
      if (step !== 200) {
        const s = typeof step === 'number' ? { status: step, message: 'scripted failure' } : step;
        return json(route, { error: { message: s.message, code: s.status } }, s.status);
      }
      return json(route, { data: [{ b64_json: PNG.toString('base64') }], usage: { cost: net.imageCost } });
    }
    if (p === '/audio/speech' && method === 'POST') {
      net.speechCalls++;
      // Local demo only (never in CI): ACTORS3D_TTS = a folder of Piper French voices → a real spoken line.
      const tts = process.env.ACTORS3D_TTS;
      if (tts) {
        const body = JSON.parse(route.request().postData() ?? '{}') as { input?: string; voice?: string };
        const female = /(^|[_-])(f|ff|af|bf)[_-]|female|femme|woman|siwis|nova|shimmer|coral|jessica|aoede|kore|leda|zephyr/i.test(String(body.voice ?? ''));
        const out = path.join(tts, `line-${net.speechCalls}.wav`);
        execFileSync('python3', ['-m', 'piper', '-m', path.join(tts, female ? 'fr_FR-siwis-medium.onnx' : 'fr_FR-tom-medium.onnx'), '-f', out], { input: String(body.input ?? '') });
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav' }, body: fs.readFileSync(out) });
      }
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav' }, body: wav() });
    }
    if (p === '/videos' && method === 'POST') {
      net.videoSubmits++;
      net.videoBodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
      return json(route, { id: 'vid-1', polling_url: 'https://openrouter.ai/api/v1/videos/vid-1' });
    }
    if (p === '/videos/vid-1' && method === 'GET') {
      net.polls++;
      return json(
        route,
        net.polls < 2
          ? { status: 'in_progress' }
          : {
              status: 'completed',
              unsigned_urls: ['https://openrouter.ai/api/v1/videos/vid-1/content?index=0'],
              // videoCost < 0: billed exactly as announced for the last clip (Grok Imagine Lite 480p: 0,02 $/s + 0,01 $)
              usage: { cost: net.videoCost < 0 ? (Number(net.videoBodies.at(-1)?.duration ?? 0) * 0.02 + 0.01) * (net.videoMarkup ?? 1) : net.videoCost },
            },
      );
    }
    if (p === '/videos/vid-1/content')
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'video/webm' }, // a real, playable clip with its REAL mime
        // Mirror environment (local only): a REAL clip of the owner's Grok films stands for Grok's answer.
        body: fs.readFileSync(process.env.MIRROR_GROK_CLIP ?? path.join(ROOT, 'tests/fixtures/studio/clip.webm')),
      });
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });
  await page.route(/openrouter\.ai\/api\/v1\/models\?output_modalities=/, async (route) => {
    const m = new URL(route.request().url()).searchParams.get('output_modalities');
    net.discovery.push(m ?? '');
    return json(route, FX(m === 'speech' ? 'speech.json' : 'audio.json'));
  });
  return net;
}
const model = (id: string, prompt: string, completion: string) => ({
  id,
  name: id,
  created: 1_800_000_000,
  context_length: 128_000,
  architecture: { input_modalities: ['text'] },
  pricing: { prompt, completion },
  top_provider: { context_length: 128_000, max_completion_tokens: 8192 },
  supported_parameters: ['tools', 'tool_choice', 'structured_outputs'],
});
async function open(page: Page, errors: string[] = [], opts: { debug?: boolean; autopilot?: boolean; news?: boolean } = {}) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // The idea prompter reads the news on its own: offline in these tests unless one drives it (deterministic LLM queue).
  if (!opts.news) for (const u of ['https://api.gdeltproject.org/**', 'https://fr.wikipedia.org/**']) await page.route(u, (r) => r.abort());
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  if (opts.debug) await page.addInitScript(() => localStorage.setItem('vs.debug', '1'));
  // These tests drive the multi-space studio (« mode expert »); the Film Autopilot single view has its own test.
  if (!opts.autopilot) await page.addInitScript(() => localStorage.setItem('vs.expert', '1'));
  // The premium design gallery appears before every deliverable: these tests keep the default design.
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill(KEY);
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  return errors;
}
const openStudio = async (page: Page) => {
  const nav = page.getByTitle(/AI Film Studio/);
  // After a reload the onboarding can come back (key kept for the session only): enter the key again.
  const login = page.getByPlaceholder('sk-or-v1-…');
  if (await login.isVisible().catch(() => false)) {
    await login.fill(KEY);
    await page.getByRole('button', { name: 'Commencer' }).click();
  }
  if (
    !(await nav.waitFor({ timeout: 15_000 }).then(
      () => true,
      () => false,
    ))
  ) {
    const diag = await page.evaluate(() => ({
      ls: Object.keys(localStorage),
      ss: Object.keys(sessionStorage),
      url: location.href,
      body: document.body.innerText.slice(0, 120),
    }));
    throw new Error(`studio nav not found: ${JSON.stringify(diag)}`);
  }
  await nav.click();
  await expect(page.getByTestId('studio')).toBeVisible();
};
const space = (page: Page, id: string) => page.getByTestId(`space-${id}`).click();
const kvKeys = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
          g.onsuccess = () => resolve(g.result.map(String));
        };
      }),
  );
const kvGet = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      new Promise<unknown>((resolve) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('kv', 'readonly').objectStore('kv').get(k);
          g.onsuccess = () => resolve(g.result);
        };
      }),
    key,
  );
const STORY = {
  title: 'Le secret du gendre',
  logline: 'Une belle-mère découvre un secret',
  concept: 'sketch',
  synopsis: 'syn',
  hook: 'Qui a pris mon argent ?',
  twist: 'c’est pour elle',
  punchline: 'Surprise, maman !',
  conflict: 'c',
  climax: 'cl',
  resolution: 'r',
  setting: 'Dakar',
  theme: 'famille',
  characters: ['MAMAN NOUNOU', 'COUMBA'],
  scenes: [
    {
      act: '1',
      beat: 'hook',
      duration: 32,
      location: 'salon',
      time: 'jour',
      characters: ['MAMAN NOUNOU', 'COUMBA'],
      action: 'MAMAN NOUNOU claque la porte et découvre le secret',
      emotion: 'shock',
      camera: 'gros plan',
      lighting: 'jour',
      sound: 'porte',
      music: 'balafon',
      transition: 'cut',
      dialogue: [
        {
          speaker: 'MAMAN NOUNOU',
          text: 'Coumba, qu’est-ce que c’est que ça ?',
          emotion: 'shock',
          language: 'fr',
        },
      ],
      visual_prompt: 'salon dakarois',
      video_prompt: 'elle sursaute',
      voice_prompt: '',
      subtitle_prompt: '',
    },
    {
      act: '2',
      beat: 'chute',
      duration: 32,
      location: 'cour',
      time: 'jour',
      characters: ['COUMBA'],
      action: 'COUMBA rit',
      emotion: 'laugh',
      camera: 'plan moyen',
      lighting: 'jour',
      sound: '',
      music: 'balafon',
      transition: 'cut',
      dialogue: [{ speaker: 'COUMBA', text: 'Surprise, maman !', emotion: 'laugh', language: 'fr' }],
      visual_prompt: 'cour',
      video_prompt: '',
      voice_prompt: '',
      subtitle_prompt: '',
    },
  ],
};
async function createProductionWithStory(page: Page) {
  await space(page, 'control');
  await page
    .getByTestId('studio-idea')
    .fill('Une belle-mère découvre que son gendre lui a caché quelque chose');
  await page.getByTestId('studio-create').click();
  await expect(page.getByTestId('studio-project-card')).toBeVisible();
  mock.push({ text: JSON.stringify(STORY) });
  await space(page, 'story');
  await page.getByTestId('story-generate').click();
  await expect(page.getByTestId('story-card').or(page.getByTestId('studio-error'))).toBeVisible({
    timeout: 30_000,
  });
  if (await page.getByTestId('studio-error').isVisible())
    throw new Error(`story failed: ${await page.getByTestId('studio-error').textContent()}`);
  await expect(page.getByTestId('story-card')).toContainText('Le secret du gendre');
  await expect(page.getByTestId('story-scenes').locator('li')).toHaveCount(2);
}

test('Studio: loads, adds exactly one view, 20 spaces, all render, no console error; an empty database shows no fabricated metric (TESTS 7, 17)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0'), model('acme/paid', '0.000003', '0.000015')];
  const errors = await open(page);
  // before opening the studio: nothing studio-related was written
  expect((await kvKeys(page)).filter((k) => k.startsWith('vs.'))).toEqual([]);
  await openStudio(page);
  await expect(page.getByTestId('studio-nav').getByRole('button')).toHaveCount(20);
  for (const id of [
    'control',
    'story',
    'character',
    'world',
    'style',
    'scenes',
    'images',
    'video',
    'dialogue',
    'voice',
    'sound',
    'music',
    'subtitles',
    'editor',
    'social',
    'genome',
    'assets',
    'memory',
    'analytics',
    'modellab',
  ]) {
    await space(page, id);
    await expect(page.getByTestId('studio-main')).not.toBeEmpty();
  }
  await space(page, 'analytics');
  await expect(page.getByTestId('studio-analytics')).toContainText('Aucune donnée réelle disponible');
  await space(page, 'memory');
  await expect(page.getByTestId('studio-memory')).toContainText('Aucune donnée réelle disponible');
  await space(page, 'assets');
  await expect(page.getByTestId('studio-assets')).toContainText('Aucune donnée réelle disponible');
  // non-regression of the original views
  for (const n of ['Mission Control', 'Chat', 'Fichiers', 'JEV', 'Réglages'])
    await page
      .getByTitle(new RegExp(`^${n}`))
      .first()
      .click();
  expect(errors.filter((e) => !/Failed to load resource|net::|ERR_/.test(e))).toEqual([]);
  // Alt+Shift+S opens the studio
  await page.keyboard.press('Alt+Shift+S');
  await expect(page.getByTestId('studio')).toBeVisible();
});

test('Studio disabled: no request, no vs.* write, no JEV_LOG entry; re-enabling works (TEST 6)', async ({
  page,
}) => {
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await page
    .getByRole('switch', { name: /Studio activé/ })
    .first()
    .click();
  await expect(page.getByTestId('studio-disabled')).toBeVisible();
  await page.waitForTimeout(500);
  expect(net.discovery).toEqual([]);
  const keys = (await kvKeys(page)).filter((k) => k.startsWith('vs.'));
  expect(keys).toEqual(['vs.settings']); // only the owner's own switch
  expect(await kvGet(page, 'jevLog')).toBeUndefined();
  await page.getByRole('switch', { name: /Activer le studio/ }).click();
  await expect(page.getByTestId('studio')).toBeVisible();
});

test('Capability discovery: the registry is built from the discovery endpoints, no hard-coded model (TEST 8)', async ({
  page,
}) => {
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await space(page, 'modellab');
  await page.getByTestId('discover').click();
  const sum = page.getByTestId('registry-summary');
  await expect(sum).toContainText('images');
  await expect(sum).toContainText('videos');
  await expect(sum).toContainText('speech');
  await expect(sum).toContainText('audio');
  expect(net.discovery.sort()).toEqual(expect.arrayContaining(['images', 'videos', 'speech', 'audio']));
  await expect(page.getByTestId('registry-table')).toContainText('IMAGE_GENERATION');
  await expect
    .poll(
      async () =>
        ((await kvGet(page, 'vs.registry')) as { models: unknown[] } | undefined)?.models.length ?? 0,
    )
    .toBeGreaterThanOrEqual(12);
});

test('Image path: story → scene image through the pipeline, real cost recorded, JEV_LOG entry, blueprint persists after reload (TESTS 9, 13)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'images');
  await page.getByTestId('studio-images').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 20_000 });
  expect(net.imageCalls).toHaveLength(1);
  const call = net.imageCalls[0]!;
  expect(String(call.body.prompt)).toContain('2D'); // Style DNA injected
  expect(String(call.body.prompt)).toMatch(/Avoid: .*3D render/);
  // 0.018 $ (image, measured usage.cost) + the story's text cost (measured too): the total is the sum of REAL costs
  await expect(page.getByTestId('studio-budget')).toContainText(/0\.01[89]\d \$ \/ 1\.00 \$/);
  // JEV_LOG: studio tag with the spec fields, real cost
  await expect
    .poll(async () =>
      (
        (await kvGet(page, 'jevLog')) as
          | { studio?: { media_type: string; cost: number; success: boolean; prompt_version: string } }[]
          | undefined
      )?.some((e) => e.studio?.media_type === 'image'),
    )
    .toBe(true);
  const log = (await kvGet(page, 'jevLog')) as {
    studio?: Record<string, unknown>;
    checkpoints: { name: string }[];
  }[];
  const e = log.find((x) => x.studio?.media_type === 'image')!;
  expect(e.studio).toMatchObject({ success: true, cost: 0.018, total_cost: 0.018, fallback: false });
  expect(String(e.studio!.prompt_version)).toMatch(/^pg-image-/);
  expect(e.checkpoints.map((c) => c.name)).toEqual(
    expect.arrayContaining(['MODEL_SELECTION', 'GENERATION', 'FINALIZATION']),
  );
  // persistence of the blueprint after a reload
  await expect
    .poll(async () => Object.keys(((await kvGet(page, 'vs.projects')) as object | undefined) ?? {}).length)
    .toBe(1);
  await page.reload();
  await openStudio(page);
  await expect(page.getByTestId('studio-project-card')).toContainText('Le secret du gendre');
  await space(page, 'scenes');
  await expect(page.getByTestId('storyboard').locator('li')).toHaveCount(2);
  await space(page, 'memory');
  await expect(page.getByTestId('memory-summary')).toContainText('1 réussite');
});

test('Budget cap: a call that would exceed the cap is blocked until explicitly confirmed (TEST 19)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'modellab');
  await page.getByTestId('cap-input').fill('0.01');
  await space(page, 'images');
  await page.getByTestId('studio-images').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('confirm-text')).toContainText('PLAFOND');
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('studio-error')).toContainText('PLAFOND');
  expect(net.imageCalls).toHaveLength(0);
  // explicit confirmation lets it through
  await page.getByTestId('image-generate').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 20_000 });
  expect(net.imageCalls).toHaveLength(1);
});

test('Errors and fallback: unsupported model → next candidate; both attempts are logged; 401 stops without trying other models (TEST 11)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'images');
  const sel = page.getByTestId('studio-images').getByRole('combobox').first();
  await sel.selectOption('S01');
  net.imageScript.push({ status: 404, message: 'No endpoints found that support input references' });
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 30_000 });
  expect(net.imageCalls).toHaveLength(2);
  expect(net.imageCalls[0]!.model).not.toBe(net.imageCalls[1]!.model);
  await expect
    .poll(
      async () =>
        (
          ((await kvGet(page, 'jevLog')) as
            { studio?: { success: boolean; fallback: boolean } }[] | undefined) ?? []
        ).filter((e) => e.studio && 'fallback' in e.studio).length,
    )
    .toBeGreaterThanOrEqual(2);
  const log = (await kvGet(page, 'jevLog')) as {
    studio?: { success: boolean; fallback: boolean };
    failureNote?: string;
  }[];
  expect(
    log.some((e) => e.studio && !e.studio.success && /UNSUPPORTED_CAPABILITY/.test(e.failureNote ?? '')),
  ).toBe(true);
  expect(log.some((e) => e.studio?.success && e.studio.fallback)).toBe(true);
  // 401: no other model is tried
  net.imageCalls.length = 0;
  net.imageScript.push({ status: 401, message: 'invalid key' });
  await sel.selectOption('S02');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('studio-error')).toContainText('AUTH_ERROR');
  expect(net.imageCalls).toHaveLength(1);
});

test('Voice, local music, subtitles, auto-edit and the animatic preview (TESTS 5 chain)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'voice');
  await expect(page.getByTestId('voice-models')).toBeVisible();
  await page.getByTestId('voice-gen-S01-0').click();
  await expect(page.getByTestId('studio-voice').locator('audio').first()).toBeVisible({ timeout: 20_000 });
  expect(net.speechCalls).toBe(1);
  await space(page, 'music');
  await expect(page.getByTestId('music-status')).toContainText(
    'Capability unavailable in current environment',
  );
  await page.getByTestId('music-generate').click();
  await expect(page.getByTestId('music-player')).toBeVisible({ timeout: 60_000 });
  await space(page, 'sound');
  await page.getByTestId('sfx-S01-door').click();
  await expect(page.getByTestId('sound-S01').locator('audio')).toBeVisible({ timeout: 20_000 });
  await space(page, 'subtitles');
  await page.getByTestId('subtitles-compute').click();
  await expect(page.getByTestId('subtitle-lines').locator('li')).toHaveCount(2);
  await space(page, 'editor');
  await page.getByTestId('editor-auto').click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page.getByTestId('clip-voice').first()).toBeVisible();
  await expect(page.getByTestId('clip-music').first()).toBeVisible();
  await page.getByTestId('editor-render').click();
  await expect(page.getByTestId('editor-result')).toBeVisible({ timeout: 120_000 });
  const size = await page.evaluate(
    async () =>
      (
        await (
          await fetch((document.querySelector('[data-testid=editor-result] video') as HTMLVideoElement).src)
        ).blob()
      ).size,
  );
  expect(size).toBeGreaterThan(1000);
});

test('Video Factory: disabled by default; submit → poll → completed with real cost; a paid job is never resubmitted after reopening (TEST 10)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page, [], { debug: true });
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'video');
  await expect(page.getByTestId('studio-video')).toContainText('DÉSACTIVÉE');
  // activation needs a budget typed by the owner
  await page.getByRole('switch', { name: /Activer la Video Factory/ }).click();
  await expect(page.getByTestId('studio-error')).toContainText('budget');
  await page.getByTestId('video-budget').fill('1');
  await page.getByRole('switch', { name: /Activer la Video Factory/ }).click();
  await expect(page.getByTestId('studio-video')).toContainText('ACTIVE');
  await page.evaluate(() =>
    (
      window as unknown as { massambaStudioDebug: { setVideoPollInterval: (n: number) => void } }
    ).massambaStudioDebug.setVideoPollInterval(50),
  );
  await expect(page.getByTestId('video-models')).toContainText('heygen/heygen-video-1');
  await page.getByTestId('studio-video').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('studio-video').getByRole('combobox').nth(1).selectOption('text');
  await page.getByTestId('video-generate').click();
  await expect(page.getByTestId('video-jobs')).toContainText('COMPLETED', { timeout: 30_000 });
  expect(net.videoSubmits).toBe(1);
  await expect(page.getByTestId('video-jobs')).toContainText('0.2000 $');
  await expect
    .poll(async () => (((await kvGet(page, 'vs.jobs')) as unknown[] | undefined) ?? []).length)
    .toBe(1); // the completed job is persisted
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('openrouter-workbench-direct');
        req.onerror = () => resolve(`open error ${String(req.error)}`);
        req.onsuccess = () => {
          const db = req.result;
          const os = db.transaction('kv', 'readwrite').objectStore('kv');
          const g = os.get('vs.jobs');
          g.onerror = () => resolve(`get error ${String(g.error)}`);
          g.onsuccess = () => {
            const jobs = ((g.result as Record<string, unknown>[] | undefined) ?? []).concat([
              {
                id: 'job-resume',
                projectId: 'x',
                kind: 'video',
                task: 'T2V',
                model: 'heygen/heygen-video-1',
                status: 'RUNNING',
                createdAt: 1,
                estimate: 0.2,
                estimateCertain: true,
                cost: null,
                retries: 0,
                paid: true,
                remoteId: 'vid-1',
                pollingUrl: 'https://openrouter.ai/api/v1/videos/vid-1',
              },
            ]);
            const w = os.put(jobs, 'vs.jobs');
            w.onsuccess = () => {
              db.close();
              resolve(`stored ${jobs.length}`);
            };
            w.onerror = () => resolve(`put error ${String(w.error)}`);
          };
        };
      }),
  );
  expect(stored).toBe('stored 2');
  net.polls = 5; // the provider already reports completion
  // file:// localStorage is flaky across reloads in headless Chromium: keep the key in sessionStorage too (same tab)
  await page.evaluate((k) => sessionStorage.setItem('wbd.openrouter-key', k), KEY);
  await page.reload();
  await openStudio(page);
  await space(page, 'video');
  await expect(page.getByTestId('video-jobs')).not.toContainText('RUNNING', { timeout: 20_000 });
  expect(net.videoSubmits).toBe(1); // never resubmitted
});

test('Video Factory restitution: COMPLETED → player visible at once, export with the real mime, fullscreen, storyboard, Control Room, Asset Library, diagnostics, still playable after reload (PATCH VIDEO OUTPUT)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page, [], { debug: true });
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  // reference image for S01 (image → video)
  await space(page, 'images');
  await page.getByTestId('studio-images').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 20_000 });
  await space(page, 'video');
  await page.getByTestId('video-budget').fill('1');
  await page.getByRole('switch', { name: /Activer la Video Factory/ }).click();
  await expect(page.getByTestId('studio-video')).toContainText('ACTIVE');
  await page.evaluate(() =>
    (
      window as unknown as { massambaStudioDebug: { setVideoPollInterval: (n: number) => void } }
    ).massambaStudioDebug.setVideoPollInterval(50),
  );
  await page.getByTestId('studio-video').getByRole('combobox').first().selectOption('S01');
  await expect(page.getByTestId('studio-video').getByRole('combobox').nth(1)).toHaveValue('image');
  await page.getByTestId('video-generate').click();
  // the player appears in Video Factory itself, without visiting Asset Library
  const card = page.getByTestId('video-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('VIDEO GENERATED');
  await expect(card).toContainText('S01');
  await expect(card).toContainText('0.2000 $');
  const player = page.getByTestId('video-player');
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const info = await player.evaluate((v: HTMLVideoElement) => ({
    d: v.duration,
    w: v.videoWidth,
    src: v.src.startsWith('blob:'),
    controls: v.controls,
  }));
  expect(info.src).toBe(true); // object URL of the Blob stored in IndexedDB
  expect(info.controls).toBe(true);
  expect(info.d).toBeGreaterThan(1);
  await expect(card).toContainText('180×320');
  await expect(card).toContainText('9:16');
  expect(net.videoSubmits).toBe(1);
  // play + fullscreen (never throws, falls back with a message)
  await page.getByTestId('video-play').click();
  await page.getByTestId('video-fullscreen').click();
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  // export: name PROJECT_SCENE_MODEL_TIMESTAMP.<real mime ext>
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('video-export').click()]);
  expect(dl.suggestedFilename()).toMatch(/^.+_S01_.+_\d{8}T\d{6}\.webm$/);
  const vp = path.join(tmp, 'out.webm');
  await dl.saveAs(vp);
  expect(fs.readFileSync(vp).subarray(0, 4).toString('hex')).toBe('1a45dfa3'); // EBML = real webm
  // diagnostics: real facts
  await expect(page.getByTestId('video-diagnostics')).toContainText('Blob stocké');
  await expect(page.getByTestId('video-diagnostics')).toContainText('video/webm');
  await expect(page.getByTestId('video-diagnostics')).toContainText('élément <video> chargé');
  // storyboard: the finished clip is attached to its scene AT ONCE (no click needed), the image is kept
  await expect(page.getByTestId('video-storyboard')).toContainText('DANS LE STORYBOARD');
  await expect
    .poll(async () => {
      const p = (await kvGet(page, 'vs.projects')) as Record<
        string,
        { scenes: { scene_id: string; imageAssetId?: string; videoAssetId?: string }[] }
      >;
      const sc = p ? Object.values(p)[0]?.scenes.find((x) => x.scene_id === 'S01') : undefined;
      return Boolean(sc?.imageAssetId) && Boolean(sc?.videoAssetId);
    })
    .toBe(true);
  await space(page, 'scenes');
  await expect(page.getByTestId('card-S01').getByTestId('video-ready')).toContainText('VIDEO READY');
  // Control Room
  await space(page, 'control');
  await expect(page.getByTestId('studio-video-output')).toContainText('VIDEO OUTPUT');
  await page.getByTestId('open-video-factory').click();
  await expect(page.getByTestId('studio-video')).toBeVisible();
  // Asset Library still lists it
  await space(page, 'assets');
  await expect(page.getByTestId('asset-list')).toContainText(/GENERATED.ASSET[\s\S]*video-S01/);
  // reload: still playable, nothing resubmitted
  await page.evaluate((k) => sessionStorage.setItem('wbd.openrouter-key', k), KEY);
  await page.reload();
  await openStudio(page);
  await space(page, 'video');
  await expect(page.getByTestId('video-card')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => page.getByTestId('video-player').evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(1);
  expect(net.videoSubmits).toBe(1);
});

test('Video Factory disabled: no video call is ever made, no player is shown', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'video');
  await expect(page.getByTestId('studio-video')).toContainText('DÉSACTIVÉE');
  await expect(page.getByTestId('video-generate')).toHaveCount(0);
  await expect(page.getByTestId('video-card')).toHaveCount(0);
  expect(net.videoSubmits).toBe(0);
});

test('AI Film Studio: 3D option follows the same path as 2D; wizard, clickable pipeline, diagnose, smoke test, versions, kit gated (3D)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await space(page, 'control');
  await expect(page.getByTestId('studio-wizard')).toContainText('START NEW PRODUCTION');
  await page.getByTestId('dim-3D').click();
  await page.getByTestId('studio-idea').fill('Une belle-mère arrive chez son gendre avec trois valises');
  await page.getByTestId('studio-create').click();
  await expect(page.getByTestId('studio-project-card')).toContainText('3D');
  mock.push({ text: JSON.stringify(STORY) });
  await space(page, 'story');
  await page.getByTestId('story-generate').click();
  await expect(page.getByTestId('story-card')).toBeVisible({ timeout: 30_000 });
  // 3D image: same pipeline, the 3D Style DNA is injected (never the 2D vocabulary)
  await space(page, 'images');
  await page.getByTestId('studio-images').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 20_000 });
  const prompt = String(net.imageCalls[0]!.body.prompt);
  expect(prompt).toContain('3D');
  expect(prompt).toContain('flat 2D'); // the 3D negative
  expect(prompt).not.toMatch(/high quality 2D illustration/);
  // control room: clickable pipeline, diagnose, smoke test, versions, plan
  await space(page, 'control');
  await page.getByTestId('stage-IMAGES').click();
  await expect(page.getByTestId('studio-images')).toBeVisible();
  await space(page, 'control');
  await expect(page.getByTestId('export-kit')).toBeDisabled(); // the local engine renders 2D only
  await page.getByTestId('diagnose-run').click();
  await expect(page.getByTestId('diagnose-result')).toContainText('API KEY', { timeout: 20_000 });
  await expect(page.getByTestId('diagnose-result')).toContainText('VIDEO MODEL');
  await expect(page.getByTestId('diagnose-result')).toContainText('ASSET STORAGE');
  await expect(page.getByTestId('diagnose-result')).toContainText('VIDEO FACTORY');
  await page.getByTestId('smoke-run').click();
  const smoke = page.getByTestId('smoke-result');
  await expect(smoke).toContainText('quality gate');
  await expect(smoke).not.toContainText('✗');
  await page.getByTestId('version-save').click();
  await expect(page.getByTestId('version-list')).toContainText('RESTORE VERSION');
  await expect(page.getByTestId('budget-governor')).toContainText('NORMAL');
  expect(net.videoSubmits).toBe(0);
});

test('Kit afrikatoon-auto: a valid ZIP with the run.py schema; no secret anywhere (TESTS 16, 18)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  const net = await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'images');
  await page.getByTestId('studio-images').getByRole('combobox').first().selectOption('S01');
  await page.getByTestId('image-generate').click();
  await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1, { timeout: 20_000 });
  expect(net.imageCalls).toHaveLength(1);
  await space(page, 'control');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-kit').click()]);
  const p = path.join(tmp, 'kit.zip');
  await dl.saveAs(p);
  const files = unzipSync(new Uint8Array(fs.readFileSync(p)));
  const names = Object.keys(files);
  const kitName = names.find((n) => /^kits\/\d{4}-\d{2}-\d{2}\/01-.*\.json$/.test(n))!;
  expect(kitName).toBeTruthy();
  expect(names).toContain('LISEZMOI.txt');
  const kit = JSON.parse(new TextDecoder().decode(files[kitName]));
  expect(validateKit(kit)).toEqual({ ok: true, errors: [] });
  expect(kit.characters).toEqual(expect.arrayContaining(['MAMAN NOUNOU', 'COUMBA']));
  expect(kit.scenes).toHaveLength(2);
  expect(new TextDecoder().decode(files['LISEZMOI.txt'])).toContain('--mock 2d-hq --no-upload');
  // project ZIP + report + prompts
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-zip').click()]);
  const p2 = path.join(tmp, 'proj.zip');
  await dl2.saveAs(p2);
  const proj = unzipSync(new Uint8Array(fs.readFileSync(p2)));
  expect(Object.keys(proj)).toEqual(
    expect.arrayContaining(['blueprint.json', 'assets.json', 'rapport.html', 'prompts.txt']),
  );
  // TEST 18: the key is nowhere but its own storage entry
  const texts = [...Object.values(files), ...Object.values(proj)]
    .map((f) => Buffer.from(f).toString('latin1'))
    .join('\n');
  expect(texts).not.toContain(KEY);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain(
    'sk-or-v1-e2e-direct-key',
  );
  const dump = JSON.stringify({
    log: await kvGet(page, 'jevLog'),
    projects: await kvGet(page, 'vs.projects'),
    jobs: await kvGet(page, 'vs.jobs'),
    assets: await kvGet(page, 'vs.assets.meta'),
    memory: await kvGet(page, 'vs.memory'),
    registry: await kvGet(page, 'vs.registry'),
  });
  expect(dump).not.toContain(KEY);
  const ls = await page.evaluate(() =>
    Object.entries({ ...localStorage })
      .filter(([k, v]) => v.includes('sk-or-v1-e2e') && k !== 'wbd.openrouter-key')
      .map(([k]) => k),
  );
  expect(ls).toEqual([]);
});

test('QA and targeted repair: rule checks flag real problems, no judge → no invented score (TEST 15)', async ({
  page,
}) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  await intercept(page);
  await openStudio(page);
  await createProductionWithStory(page);
  await space(page, 'story');
  await page.getByTestId('studio-story').getByRole('combobox').nth(2).selectOption('16:9'); // wrong format for TikTok
  await space(page, 'control');
  await page.getByTestId('qa-run').click();
  const rep = page.getByTestId('qa-report');
  await expect(rep).toContainText('VISUAL non mesuré');
  await expect(rep).toContainText('AUDIO non mesuré');
  await expect(rep).toContainText('WRONG_ASPECT');
  await expect(rep).toContainText('aucun — scores VISUAL / AUDIO / CONSISTENCY laissés vides');
  await rep.getByRole('button', { name: /recadrage/ }).click();
  await expect(page.getByTestId('repair-msg')).toContainText('9:16');
});

test('Character library import (folder) and Prompt Genome compile (TEST 14)', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page);
  await intercept(page);
  await openStudio(page);
  await space(page, 'control');
  await page.getByTestId('studio-idea').fill('idée');
  await page.getByTestId('studio-create').click();
  await space(page, 'character');
  const dir = path.join(tmp, 'lib/MAMAN_NOUNOU');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'neutral.png'), PNG);
  fs.writeFileSync(path.join(dir, 'angry.png'), PNG);
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ role: 'belle-mère', clothing: 'foulard et pagne rouges, tablier vichy vert' }),
  );
  await page.getByTestId('character-input').setInputFiles(path.join(tmp, 'lib/MAMAN_NOUNOU'));
  await expect(page.getByTestId('character-msg')).toContainText('1 personnage(s), 2 image(s)');
  await expect(page.getByTestId('character-sheet')).toContainText('MAMAN NOUNOU');
  await expect(page.getByTestId('character-consistency')).toHaveValue(/foulard et pagne rouges/);
  await expect(page.getByTestId('character-poses')).toContainText('neutral');
  await space(page, 'genome');
  await page.getByTestId('studio-genome').getByRole('textbox').first().fill('une belle-mère furieuse');
  await expect(page.getByTestId('genome-text')).toHaveValue(/une belle-mère furieuse/);
  await expect(page.getByTestId('genome-output')).toContainText('pg-image-');
});

test('Film Autopilot: one idea → story, scenes, images, animation, final film in ONE view; model plan; per-scene actions', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  await expect(page.getByTestId('film-autopilot')).toBeVisible();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Un jeune garçon africain rêve de devenir inventeur et construit une machine pour sauver son village.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  // Circuit Grok switched off by the owner: the film stays free of any paid video.
  await page.getByTestId('film-circuit').getByRole('switch').click();
  await expect(page.getByTestId('film-circuit')).toHaveAttribute('data-on', '0');
  await page.getByTestId('film-create').click();
  // One view: the pipeline, the model plan and the scenes appear in place.
  await expect(page.getByTestId('film-pipeline')).toBeVisible();
  await expect(page.getByTestId('film-plan')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('plan-images')).toBeVisible();
  await expect(page.getByTestId('pipe-STORY')).toHaveAttribute('data-state', /done|warning/, { timeout: 30_000 });
  await expect(page.getByTestId('film-scenes').locator('[data-testid^=scene-S]')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('pipe-IMAGES')).toHaveAttribute('data-state', /done|warning/, { timeout: 60_000 });
  expect(net.imageCalls.length).toBeGreaterThanOrEqual(2);
  // Animation: circuit off and no video budget → free 2.5D animation, no video call.
  expect(net.videoSubmits).toBe(0);
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 120_000 });
  const size = await page.evaluate(async () => (await (await fetch((document.querySelector('[data-testid=film-final] video') as HTMLVideoElement).src)).blob()).size);
  expect(size).toBeGreaterThan(1000);
  // Per-scene actions: accept, regenerate (one more image call).
  const first = page.getByTestId('scene-S01');
  await first.getByTestId('scene-accept').click();
  await expect(first).toContainText('validée');
  const before = net.imageCalls.length;
  await first.getByTestId('scene-regen').click();
  await expect.poll(() => net.imageCalls.length, { timeout: 20_000 }).toBeGreaterThan(before);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Prompteur d’idées: the day\'s news (GDELT, no key) becomes Afrikatoon ideas on its own; a click fills the idea', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  let gdelt = '';
  await page.route('https://api.gdeltproject.org/**', (r) => {
    gdelt = r.request().url();
    return r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ articles: [{ title: 'Le prix du garba grimpe encore dans les maquis d’Abidjan', domain: 'abidjan.net', seendate: '20261011T080000Z' }, { title: 'Un accident fait trois morts sur l’autoroute du Nord', domain: 'x.ci', seendate: '20261011T090000Z' }] }),
    });
  });
  await page.route('https://fr.wikipedia.org/**', (r) => r.abort());
  mock.push({ text: JSON.stringify({ ideas: [{ family: 'Marché & maquis', title: 'Le garba de luxe', setup: 'Le vendeur de garba annonce son nouveau prix « premium ».', escalation: 'Le client négocie avec sa carte de fidélité du maquis.', punchline: '[croise les bras] « Même le thon a pris l’avion ! »' }] }) });
  const errors = await open(page, [], { autopilot: true, news: true });
  await page.getByTitle(/AI Film Studio/).click();
  await expect(page.getByTestId('idea-prompter')).toBeVisible();
  await expect(page.getByTestId('prompter-status')).toContainText('GDELT', { timeout: 20_000 });
  expect(decodeURIComponent(gdelt)).toContain('sourcecountry:IV sourcelang:french');
  // The tragedy never reaches the writer; the laughable headline does.
  const asked = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(asked).toContain('prix du garba');
  expect(asked).not.toContain('trois morts');
  await page.getByText('Le garba de luxe').click();
  await expect(page.getByTestId('film-idea-input')).toHaveValue(/^Le garba de luxe — .*Chute : \[croise les bras\]/);
  // Library ideas of the day are always there (offline too).
  expect(await page.locator('[data-testid^="prompter-idea-"]').count()).toBeGreaterThanOrEqual(5);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Film Autopilot: a provider error on a scene image is caught up — no scene left without its image', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  // The image provider fails 8 times in a row (5xx « Erreur du fournisseur »): retries + the catch-up pass must recover.
  net.imageScript = [500, 500, 500, 500, 500, 500, 500, 500];
  net.videoCost = -1; // billed as announced
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Le mari paresseux et la servante trop bien habillée.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('pipe-IMAGES')).toHaveAttribute('data-state', /done|warning/, { timeout: 90_000 });
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 120_000 });
  const cards = page.getByTestId('film-scenes').locator('[data-testid^=scene-S]');
  await expect(cards).toHaveCount(2);
  for (const c of await cards.all()) await expect(c).not.toContainText('à générer');
  expect(net.imageScript.length).toBe(0);
  expect(errors.filter((e) => !/favicon|ERR_|net::|500/i.test(e))).toEqual([]);
});

test('Circuit Grok: open → launch → real generative clips with the OpenRouter key only, HARD cap 0,30 $ for the whole film', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  // The provider bills what it announced: seconds × 0,02 $ + 0,01 $ first-frame image.
  net.videoCost = -1;
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Le mari paresseux et la servante trop bien habillée.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  // ON by default: nothing to configure, no other key.
  await expect(page.getByTestId('film-circuit')).toHaveAttribute('data-on', '1');
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-spent')).toContainText('/ 0.30 $');
  await expect(page.getByTestId('plan-animation')).toContainText('Circuit Grok', { timeout: 20_000 });
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 180_000 });
  // Real motion on the key shots, with the cheapest certain-price model, at 480p, first frame = the scene image.
  expect(net.videoSubmits).toBeGreaterThanOrEqual(1);
  // The paid clips ARE in the film: attached to their scenes (v44 bug: stored but never played).
  expect(await page.getByTestId('film-scenes').locator('video').count()).toBeGreaterThanOrEqual(1);
  // Every clip carries the identity lock and names the deformations to avoid (v44: stretched / torn arms).
  for (const b of net.videoBodies) expect(String(b.prompt)).toMatch(/Keep the first frame exactly.*Avoid: morphing/);
  for (const b of net.videoBodies) {
    expect(b.model).toBe('x-ai/grok-imagine-video-1.5-lite');
    expect(b.resolution).toBe('480p');
    // each clip lasts what its lines last (voices made first), not the story's estimate
    expect(Number(b.duration)).toBeGreaterThanOrEqual(2);
    expect(Number(b.duration)).toBeLessThanOrEqual(15);
    expect(Array.isArray(b.frame_images)).toBe(true);
  }
  // HARD cap: the whole film (writing + images + video + voices) never exceeds 0,30 $.
  const txt = (await page.getByTestId('film-spent').textContent()) ?? '';
  const spentUsd = Number(/dépensé\s*([\d.,]+)/.exec(txt)![1]!.replace(',', '.'));
  expect(spentUsd).toBeGreaterThan(0);
  expect(spentUsd).toBeLessThanOrEqual(0.3);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Circuit Grok — analyse poussée: a deformed take is judged, redone ONCE with the written fix under the HARD cap; a hidden tab pauses the render', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0'), { ...model('acme/vision-judge', '0.0000001', '0.0000004'), architecture: { input_modalities: ['text', 'image'] } }];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  net.videoCost = -1;
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  // The vision judge: the FIRST clip it sees has a stretched arm and silent mouths; every later clip is fine.
  let judged = 0;
  mock.fallback = (body) => {
    if (!JSON.stringify(body).includes('directeur de l’animation')) return { text: '{}' };
    judged++;
    return judged === 1
      ? { text: '{"rire":5,"mouvement":6,"expressions":6,"bouche":2,"anatomie":2,"coherence":8,"defects":["bras étiré jusqu’à l’épaule du voisin"],"fix":"the arm keeps its normal length"}' }
      : { text: '{"rire":8,"mouvement":8,"expressions":8,"bouche":8,"anatomie":9,"coherence":9,"defects":[],"fix":""}' };
  };
  await page.getByTestId('film-idea-input').fill('Le chef invisible : Koffi croit qu’une caméra le surveille.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-create').click();
  // The render is real-time: hide the tab while it records → it pauses (never 1 frame/s), then resumes.
  await expect(page.getByTestId('pipe-MONTAGE')).toContainText('rendu du film', { timeout: 180_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('pipe-MONTAGE')).toContainText('rendu en pause', { timeout: 15_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 180_000 });
  expect(judged).toBeGreaterThanOrEqual(2);
  // The retake carried the judge's correction + the analyser's own one, ahead of the identity lock.
  const retake = net.videoBodies.find((b) => String(b.prompt).includes('the arm keeps its normal length'));
  expect(retake).toBeTruthy();
  expect(String(retake!.prompt)).toContain('correct anatomy');
  expect(String(retake!.prompt)).toContain('Keep the first frame exactly');
  // Every shot shows its analysis; the cap still holds.
  await expect(page.getByTestId('clip-report').first()).toContainText('anatomie');
  const txt = (await page.getByTestId('film-spent').textContent()) ?? '';
  expect(Number(/dépensé\s*([\d.,]+)/.exec(txt)![1]!.replace(',', '.'))).toBeLessThanOrEqual(0.3);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Histoire: a story CUT by the length limit (reasoning model) is repaired — finished scenes kept, low effort + JSON mode requested', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  const full = JSON.stringify(SHORT);
  // v48: the writer ran out of length in the middle of the LAST scene, twice in a row.
  const lastScene = full.lastIndexOf('{', full.lastIndexOf('"beat":"chute"'));
  const cut = full.slice(0, lastScene) + '{"beat":"chute","duration":3,"location":"cou';
  mock.push({ text: cut, finish: 'length' });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Le chef invisible : Koffi croit qu’une caméra le surveille.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('pipe-STORY')).toHaveAttribute('data-state', /done|warning/, { timeout: 60_000 });
  await expect(page.getByTestId('film-scenes').locator('[data-testid^="scene-S"]')).toHaveCount(SHORT.scenes.length - 1, { timeout: 60_000 });
  // The story call asked for JSON mode (the model supports it) and enough room to write.
  const storyReq = mock.requests.find((r) => JSON.stringify(r.messages).includes('JSON attendu'))!;
  expect(storyReq.body.response_format).toEqual({ type: 'json_object' });
  expect(Number(storyReq.body.max_tokens)).toBeGreaterThanOrEqual(8000);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Budget du film: typed before creation, it becomes the HARD cap of the film (and is remembered)', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  net.videoCost = -1;
  net.videoMarkup = 1.12; // the provider bills 12 % above the announced price
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await expect(page.getByTestId('film-budget')).toHaveAttribute('placeholder', 'auto 0.30');
  await page.getByTestId('film-budget').fill('1.2');
  await expect(page.getByTestId('film-idea')).toContainText('≈ 0.96 $ pour la vidéo');
  await expect(page.getByTestId('film-idea')).toContainText('Circuit Grok (≤ 1.20 $)');
  await page.getByTestId('film-idea-input').fill('Le chef invisible : Koffi croit qu’une caméra le surveille.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-spent')).toContainText('/ 1.20 $');
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 180_000 });
  const txt = (await page.getByTestId('film-spent').textContent()) ?? '';
  expect(Number(/dépensé\s*([\d.,]+)/.exec(txt)![1]!.replace(',', '.'))).toBeLessThanOrEqual(1.2);
  // Billed 12 % above the announced price: the rate is recalibrated, the circuit does NOT stop after the 1st clip.
  expect(net.videoSubmits).toBeGreaterThanOrEqual(SHORT.scenes.length);
  await expect(page.getByTestId('film-autopilot')).not.toContainText('Circuit Grok arrêté');
  // Remembered for the next film.
  await page.getByRole('button', { name: 'Nouvelle idée' }).click();
  await expect(page.getByTestId('film-budget')).toHaveValue('1.2');
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('🔬 Analyser une vidéo: any file is cut into shots and measured (motion, frozen passages, sound)', async ({ page }) => {
  const errors = await open(page, [], { autopilot: true });
  await page.getByTitle(/AI Film Studio/).click();
  await page.getByTestId('video-analyzer').locator('summary').click();
  await page.getByTestId('analyzer-file').setInputFiles(path.join(ROOT, 'tests/fixtures/studio/clip.webm'));
  await expect(page.getByTestId('analyzer-result')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('analyzer-result')).toContainText('plan(s)');
  await expect(page.getByTestId('analyzer-frozen')).toContainText('image figée');
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Circuit Grok « 10 s · entièrement animé »: no character sheet, voices first, EVERY shot a real clip, ≤ 0,30 $', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  net.videoCost = -1; // billed as announced
  await page.getByTitle(/AI Film Studio/).click();
  const SHORT = { ...STORY, scenes: STORY.scenes.map((s) => ({ ...s, duration: 3 })) };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Le faux riche propose de conduire ses amis… en taxi payant.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-idea').locator('select').first().selectOption('10');
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-spent')).toContainText('/ 0.30 $');
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 180_000 });
  // one picture per scene, no character sheet: the money goes to motion
  expect(net.imageCalls.length).toBe(SHORT.scenes.length);
  // every scene became a generative clip (the voices were made first) — and the film plays them
  // (the test clip barely moves: the analyser may order ONE retake per shot, never more, always under the cap)
  expect(net.videoSubmits).toBeGreaterThanOrEqual(SHORT.scenes.length);
  expect(net.videoSubmits).toBeLessThanOrEqual(2 * SHORT.scenes.length);
  expect(await page.getByTestId('film-scenes').locator('video').count()).toBe(SHORT.scenes.length);
  expect(net.speechCalls).toBeGreaterThan(0);
  const txt = (await page.getByTestId('film-spent').textContent()) ?? '';
  expect(Number(/dépensé\s*([\d.,]+)/.exec(txt)![1]!.replace(',', '.'))).toBeLessThanOrEqual(0.3);
  expect(errors.filter((e) => !/favicon|ERR_|net::/i.test(e))).toEqual([]);
});

test('Acteurs 3D: the @comedyvideos_100 troupe in the library, option ON → every scene played by the 3D actors (WebGL, lip-sync, chute), the film moves; the same actors come back', async ({ page }) => {
  test.setTimeout(1_500_000);
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  // The recurring actors of the account (character bible + the duo of the reference clip) join the library first.
  await page.getByTestId('actor-casting').locator('summary').click();
  await page.getByTestId('actors3d-troupe').click();
  await expect(page.getByTestId('actors3d-note')).toContainText(/univers @comedyvideos_100 : (3\d|4\d) acteur\(s\) ajouté\(s\)/);
  // The owner's own drawn character: a green-screen sheet (5 poses) cut out in the browser, then played in the film.
  const planche = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 420;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1ee614';
    g.fillRect(0, 0, 1000, 420);
    for (let k = 0; k < 5; k++) {
      const x = 100 + k * 200;
      g.fillStyle = '#e0559a';
      g.beginPath();
      g.ellipse(x, 250, 55, 140, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6b3a1e';
      g.beginPath();
      g.arc(x, 85, 42, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 70, 160, 22, 90);
      g.fillRect(x + 48 + k * 4, 140 - k * 10, 22, 80);
      g.fillStyle = '#120c08';
      g.beginPath();
      g.arc(x, 62, 40, Math.PI, 0);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(x - 18, 80, 10, 8);
      g.fillRect(x + 8, 80, 10, 8);
    }
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByTestId('sheet-name').fill('LA VOISINE');
  await page.getByTestId('sheet-file').setInputFiles({ name: 'voisine-planche.png', mimeType: 'image/png', buffer: Buffer.from(planche, 'base64') });
  await expect(page.getByTestId('actors3d-note')).toContainText('planche de LA VOISINE : 5 pose(s) découpée(s)', { timeout: 60_000 });
  await expect(page.getByTestId('actor-poses').locator('img')).toHaveCount(5);
  // The owner's empty set (their décor image) of the courtyard: the background of the scenes there.
  const decor = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 600;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, '#8ecdf2');
    sky.addColorStop(0.55, '#c9a06a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#9a9a96';
    g.fillRect(0, 150, 900, 240);
    g.fillStyle = '#f2c12e';
    g.fillRect(180, 200, 120, 190);
    g.fillStyle = '#6b4226';
    g.fillRect(600, 210, 140, 90);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByTestId('decors').locator('select').selectOption('Cour');
  await page.getByTestId('decor-file').setInputFiles({ name: 'cour.png', mimeType: 'image/png', buffer: Buffer.from(decor, 'base64') });
  await expect(page.getByTestId('decor-list')).toContainText('Cour');
  await page.getByTestId('actor-casting').locator('summary').click();
  // A real dialogue: the dispute of the reference clip (four alternating lines, gestures, punchline), then the village.
  const lines = [
    { speaker: 'LA VOISINE', text: 'Tu as encore bu toute la journée ?', emotion: 'colère', gesture: 'point', language: 'fr' },
    { speaker: 'LE TONTON', text: 'Moi ? C’est de l’eau minérale !', emotion: 'surprise', gesture: 'shrug', language: 'fr' },
    { speaker: 'LA VOISINE', text: 'De l’eau minérale verte ?', emotion: 'colère', language: 'fr' },
    { speaker: 'LE TONTON', text: 'C’est l’eau du village, ma chérie !', emotion: 'joie', gesture: 'laugh', language: 'fr' },
  ];
  const SHORT = {
    ...STORY,
    characters: ['LA VOISINE', 'LE TONTON', 'TANTIE AWA', 'PETIT MAMADOU'],
    scenes: [
      { ...STORY.scenes[0]!, duration: 3, location: 'cour de la maison', characters: ['LA VOISINE', 'LE TONTON'], action: 'LE TONTON titube avec sa bouteille devant LA VOISINE', dialogue: lines },
      {
        ...STORY.scenes[1]!,
        duration: 3,
        location: 'village',
        characters: ['TANTIE AWA', 'PETIT MAMADOU'],
        action: 'TANTIE AWA gronde PETIT MAMADOU qui tient un téléphone',
        dialogue: [
          { speaker: 'TANTIE AWA', text: 'Qui a pris mon crédit ?', emotion: 'colère', gesture: 'point', language: 'fr' },
          { speaker: 'PETIT MAMADOU', text: 'C’est le tonton, il appelle sa chérie !', emotion: 'joie', gesture: 'laugh', language: 'fr' },
        ],
      },
    ],
  };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Une belle-mère découvre le secret de son gendre au salon.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-circuit').getByRole('switch').click();
  await page.getByTestId('film-actors3d').getByRole('switch').click();
  await expect(page.getByTestId('film-actors3d')).toHaveAttribute('data-on', '1');
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('pipe-ANIMATION')).toHaveAttribute('data-state', /done|warning/, { timeout: 90_000 });
  // Exact frame-by-frame render (30 pictures/s): minutes with software WebGL.
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 900_000 });
  // Free: no video model was called.
  expect(net.videoSubmits).toBe(0);
  // The library learned the cast (rigged once, reused), the film keeps its cast snapshot.
  const lib = (await kvGet(page, 'vs.actors')) as Record<string, { name: string; films: number; source: string }>;
  expect(Object.keys(lib)).toEqual(expect.arrayContaining(['LA VOISINE', 'LE TONTON', 'TANTIE AWA', 'PETIT MAMADOU', 'MODOU', 'COUMBA']));
  // The troupe actors were REUSED (not rebuilt from the story's sheets) and counted once for this film.
  expect(lib['LE TONTON']!.source).toBe('troupe');
  expect(lib['LE TONTON']!.films).toBe(1);
  expect(lib['MODOU']!.films).toBe(0);
  // The sheet is the REFERENCE of the character for the image (and so Grok) models: no redrawn character sheet.
  const projects = (await kvGet(page, 'vs.projects')) as Record<string, { characters: { name: string; referenceAssetId?: string }[] }>;
  const voisine = Object.values(projects).flatMap((p) => p.characters).find((c) => c.name === 'LA VOISINE');
  expect(voisine?.referenceAssetId).toMatch(/^sheet-LA VOISINE-/);
  // The film itself: frames drawn by the 3D actors (not a black / placeholder picture) that MOVE between instants.
  const probe = await page.evaluate(async () => {
    const v = document.querySelector('[data-testid=film-final] video') as HTMLVideoElement;
    const src = v.src;
    const el = document.createElement('video');
    el.muted = true;
    el.src = src;
    await new Promise((r) => (el.onloadeddata = r));
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 4;
    const c = document.createElement('canvas');
    c.width = 108;
    c.height = 192;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const shots: { url: string; px: number[]; colors: number }[] = [];
    for (const f of [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]) {
      await new Promise<void>((ok) => {
        el.onseeked = () => ok();
        el.currentTime = f * dur;
        setTimeout(ok, 2000);
      });
      g.drawImage(el, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const px: number[] = [];
      const set = new Set<number>();
      for (let i = 0; i < d.length; i += 4) {
        px.push(d[i]! + d[i + 1]! + d[i + 2]!);
        set.add(((d[i]! >> 5) << 6) | ((d[i + 1]! >> 5) << 3) | (d[i + 2]! >> 5));
      }
      const big = document.createElement('canvas');
      big.width = 270;
      big.height = 480;
      big.getContext('2d')!.drawImage(el, 0, 0, 270, 480);
      shots.push({ url: big.toDataURL('image/png'), px, colors: set.size });
    }
    const diff = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]!), 0) / a.length;
    return { shots: shots.map((s) => ({ url: s.url, colors: s.colors })), moves: shots.slice(1).map((s, i) => diff(shots[i]!.px, s.px)) };
  });
  if (process.env.ACTORS3D_DUMP) probe.shots.forEach((s, i) => fs.writeFileSync(path.join(process.env.ACTORS3D_DUMP!, `film3d-${i}.png`), Buffer.from(s.url.split(',')[1]!, 'base64')));
  if (process.env.ACTORS3D_DUMP) {
    const b64 = await page.evaluate(async () => {
      const b = await (await fetch((document.querySelector('[data-testid=film-final] video') as HTMLVideoElement).src)).blob();
      const u8 = new Uint8Array(await b.arrayBuffer());
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    });
    fs.writeFileSync(path.join(process.env.ACTORS3D_DUMP, 'film3d.webm'), Buffer.from(b64, 'base64'));
  }
  // A rich picture (set + actors, many colours), not a flat placeholder.
  for (const s of probe.shots) expect(s.colors).toBeGreaterThan(12);
  // The actors move between the sampled instants.
  expect(Math.max(...probe.moves)).toBeGreaterThan(2);
  // Casting panel: the actors are listed with a live WebGL preview and can be edited by hand.
  await page.getByTestId('actor-casting').locator('summary').click();
  await expect(page.getByTestId('actors3d-list')).toContainText('LA VOISINE');
  await expect(page.getByTestId('actor-preview').locator('canvas')).toBeVisible({ timeout: 20_000 });
  if (process.env.ACTORS3D_DUMP)
    for (const n of ['LA VOISINE', 'LE TONTON', 'MODOU', 'BAYE NDIAYE', 'TANTIE AWA', 'PETIT MAMADOU', 'COUMBA', 'TONTON DIENG']) {
      await page.getByTestId('actors3d-list').getByText(n, { exact: true }).click();
      await page.waitForTimeout(1700);
      await page.getByTestId('actor-preview').screenshot({ path: path.join(process.env.ACTORS3D_DUMP, `troupe-${n.replace(/ /g, '_')}.png`) });
    }
  // Optional (local check with a real model, never committed): a .vrm imported for one actor drives the same acting.
  if (process.env.ACTORS3D_VRM) {
    await page.getByTestId('actors3d-list').getByText('COUMBA', { exact: true }).click();
    await page.getByTestId('actor-vrm-file').setInputFiles(process.env.ACTORS3D_VRM);
    await expect(page.getByTestId('actors3d-note')).toContainText('associé à COUMBA');
    await page.waitForTimeout(5000);
    if (process.env.ACTORS3D_DUMP)
      for (let i = 0; i < 6; i++) {
        await page.getByTestId('actor-preview').screenshot({ path: path.join(process.env.ACTORS3D_DUMP, `casting-vrm-${i}.png`) });
        await page.waitForTimeout(600);
      }
  }
  // The same actors come back: casting the film again reuses them (nothing new added).
  await page.getByTestId('actors3d-cast').click();
  await expect(page.getByTestId('actors3d-note')).toContainText('réutilisés : LA VOISINE, LE TONTON, TANTIE AWA, PETIT MAMADOU');
  expect(errors.filter((e) => !/favicon|ERR_|net::|GPU stall|WebGL/i.test(e))).toEqual([]);
});

test('Troupe intégrée: the owner’s planches, galleries and sets install themselves; the drawn actors TALK with their own lips (measured face) and blink — animation test', async ({ page }) => {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  await page.getByTestId('actor-casting').locator('summary').click();
  // Only in a build made with the owner's private troupe folder (never in the public repository).
  test.skip((await page.getByTestId('troupe-install').count()) === 0, 'no embedded troupe in this build');
  await page.getByTestId('troupe-install').click();
  await expect(page.getByTestId('actors3d-note')).toContainText(/troupe installée : \d+ acteur\(s\)/, { timeout: 170_000 });
  const note = (await page.getByTestId('actors3d-note').textContent()) ?? '';
  const [, rigged, poses] = /visage mesuré \(bouche, yeux\) sur (\d+)\/(\d+)/.exec(note) ?? [];
  // Every pose of every planche and every gallery figure has its face measured (lips, chin, eyes).
  expect(Number(rigged)).toBe(Number(poses));
  const lib = (await kvGet(page, 'vs.actors')) as Record<string, { sheet?: { poses: { kind: string; face?: { l: number[]; r: number[]; seam: number[]; eyes: unknown[] } }[] } }>;
  for (const n of ['MAMAN NOUNOU', 'BAYE NDIAYE', 'COUMBA', 'MODOU', 'PETIT MAMADOU', 'TANTIE AWA', 'KOFFI']) {
    expect(lib[n]?.sheet?.poses.length).toBe(5);
    expect(lib[n]!.sheet!.poses.every((p) => p.face && p.face.r[0]! > p.face.l[0]!)).toBe(true);
  }
  // KOFFI wears sunglasses: no eye to close → he never blinks (nothing is invented).
  expect(lib['KOFFI']!.sheet!.poses.every((p) => p.face!.eyes.length === 0)).toBe(true);
  expect(lib['DJECKY']?.sheet?.poses.length).toBe(1);
  expect(lib['TONTON DIENG']?.sheet?.poses[0]?.face).toBeTruthy();
  const decors = (await kvGet(page, 'vs.decors')) as Record<string, { name: string }>;
  expect(Object.values(decors).map((d) => d.name)).toEqual(expect.arrayContaining(['Salon', 'Marché', 'Maquis', 'Village']));
  await page.getByTestId('actor-casting').locator('summary').click();
  // The animation test: a dispute in the living room (the chute at the end), then the market.
  const SHORT = {
    ...STORY,
    characters: ['MAMAN NOUNOU', 'BAYE NDIAYE', 'COUMBA', 'MODOU'],
    scenes: [
      {
        ...STORY.scenes[0]!,
        duration: 4,
        location: 'salon de la maison',
        characters: ['MAMAN NOUNOU', 'BAYE NDIAYE'],
        action: 'MAMAN NOUNOU découvre que BAYE NDIAYE a caché l’argent du marché',
        dialogue: [
          { speaker: 'MAMAN NOUNOU', text: 'Baye ! Où est passé l’argent du marché ?', emotion: 'colère', gesture: 'point', language: 'fr' },
          { speaker: 'BAYE NDIAYE', text: 'Quel argent ? Moi je dormais, ma chérie !', emotion: 'surprise', gesture: 'shrug', language: 'fr' },
          { speaker: 'MAMAN NOUNOU', text: 'Tu dormais avec tes chaussures neuves ?', emotion: 'colère', language: 'fr' },
          { speaker: 'BAYE NDIAYE', text: 'Ce sont les chaussures du rêve !', emotion: 'joie', gesture: 'laugh', language: 'fr' },
        ],
      },
      {
        ...STORY.scenes[1]!,
        duration: 3,
        location: 'au marché',
        characters: ['COUMBA', 'MODOU'],
        action: 'COUMBA surprend MODOU en train de négocier une fausse montre',
        dialogue: [
          { speaker: 'COUMBA', text: 'Modou, c’est une vraie montre en or ?', emotion: 'doute', language: 'fr' },
          { speaker: 'MODOU', text: 'Elle est en or… le soir seulement !', emotion: 'joie', gesture: 'laugh', language: 'fr' },
        ],
      },
    ],
  };
  mock.push({ text: JSON.stringify(SHORT) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Maman Nounou découvre où est passé l’argent du marché.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-circuit').getByRole('switch').click();
  await page.getByTestId('film-actors3d').getByRole('switch').click();
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 240_000 });
  expect(net.videoSubmits).toBe(0);
  if (process.env.ACTORS3D_DUMP) {
    const b64 = await page.evaluate(async () => {
      const b = await (await fetch((document.querySelector('[data-testid=film-final] video') as HTMLVideoElement).src)).blob();
      const u8 = new Uint8Array(await b.arrayBuffer());
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    });
    fs.writeFileSync(path.join(process.env.ACTORS3D_DUMP, 'troupe-film.webm'), Buffer.from(b64, 'base64'));
  }
  expect(errors.filter((e) => !/favicon|ERR_|net::|GPU stall|WebGL/i.test(e))).toEqual([]);
});

// Local demo (never in CI): a 4-sketch film played by the owner's embedded troupe, real French voices (Piper), HD.
test('Troupe intégrée: démo 4 sketches en HD (ACTORS3D_DEMO)', async ({ page }) => {
  test.skip(!process.env.ACTORS3D_DEMO, 'local demo only');
  test.setTimeout(2_400_000);
  mock.models = [model('acme/free-text:free', '0', '0')];
  await open(page, [], { autopilot: true });
  const net = await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  await page.getByTestId('actor-casting').locator('summary').click();
  test.skip((await page.getByTestId('troupe-install').count()) === 0, 'no embedded troupe in this build');
  await page.getByTestId('troupe-install').click();
  await expect(page.getByTestId('actors3d-note')).toContainText(/troupe installée/, { timeout: 170_000 });
  await page.getByTestId('actor-casting').locator('summary').click();
  const L = (speaker: string, text: string, emotion: string, gesture?: string) => ({ speaker, text, emotion, ...(gesture ? { gesture } : {}), language: 'fr' });
  const sc = (i: number, location: string, characters: string[], action: string, dialogue: ReturnType<typeof L>[]) => ({ ...STORY.scenes[i % 2]!, duration: 12, location, characters, action, dialogue });
  const DEMO = {
    ...STORY,
    title: 'Les chaussures du rêve',
    characters: ['MAMAN NOUNOU', 'BAYE NDIAYE', 'PETIT MAMADOU', 'COUMBA', 'MODOU', 'KOFFI', 'TANTIE AWA'],
    scenes: [
      sc(0, 'salon de la maison', ['MAMAN NOUNOU', 'BAYE NDIAYE'], 'MAMAN NOUNOU découvre que BAYE NDIAYE a dépensé l’argent du marché', [
        L('MAMAN NOUNOU', 'Baye ! Où est passé l’argent du marché ?', 'colère', 'point'),
        L('BAYE NDIAYE', 'Quel argent ? Moi je dormais, ma chérie !', 'surprise', 'shrug'),
        L('MAMAN NOUNOU', 'Tu dormais avec tes chaussures neuves aux pieds ?', 'colère'),
        L('BAYE NDIAYE', 'Ce sont les chaussures du rêve !', 'joie', 'laugh'),
      ]),
      sc(1, 'salon de la maison', ['PETIT MAMADOU', 'MAMAN NOUNOU'], 'PETIT MAMADOU balance son grand-père', [
        L('PETIT MAMADOU', 'Maman, Papi a aussi rêvé d’un nouveau téléphone !', 'joie'),
        L('MAMAN NOUNOU', 'Quoi ? Un téléphone ?', 'surprise', 'head-hands'),
        L('PETIT MAMADOU', 'Il est caché sous son oreiller.', 'fierté', 'point'),
        L('MAMAN NOUNOU', 'Baye Ndiaye ! Viens ici tout de suite !', 'colère', 'point'),
      ]),
      sc(0, 'au marché', ['COUMBA', 'MODOU'], 'COUMBA surprend MODOU qui vend une fausse montre en or', [
        L('COUMBA', 'Modou, c’est une vraie montre en or ?', 'doute'),
        L('MODOU', 'Cent pour cent or, ma sœur !', 'fierté', 'shrug'),
        L('COUMBA', 'Alors pourquoi ton poignet devient vert ?', 'surprise', 'point'),
        L('MODOU', 'C’est de l’or écologique !', 'joie', 'laugh'),
      ]),
      sc(1, 'au marché', ['KOFFI', 'TANTIE AWA'], 'KOFFI veut acheter à crédit chez TANTIE AWA', [
        L('KOFFI', 'Tantie, mets-moi dix kilos de tomates, je paie demain.', 'fierté'),
        L('TANTIE AWA', 'Demain ? Hier aussi tu disais demain !', 'colère', 'point'),
        L('KOFFI', 'Mais hier, c’était le demain d’avant-hier !', 'joie', 'laugh'),
      ]),
    ],
  };
  mock.push({ text: JSON.stringify(DEMO) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Les chaussures du rêve : quatre sketches de la famille.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  await page.getByTestId('film-circuit').getByRole('switch').click();
  await page.getByTestId('film-actors3d').getByRole('switch').click();
  await page.getByTestId('film-render-width').selectOption(process.env.ACTORS3D_DEMO === '720' ? '720' : '1080');
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 2_300_000 });
  expect(net.videoSubmits).toBe(0);
  const { b64, mp4 } = await page.evaluate(async () => {
    const b = await (await fetch((document.querySelector('[data-testid=film-final] video') as HTMLVideoElement).src)).blob();
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { b64: btoa(s), mp4: b.type.includes('mp4') };
  });
  const file = path.join(process.env.ACTORS3D_DUMP ?? os.tmpdir(), `troupe-demo.${mp4 ? 'mp4' : 'webm'}`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  // FLUIDITY, measured on the file itself (v50 was filmed live at 4.9 pictures/s, its picture 0.37 s ahead of the
  // sound): every second carries ≥ 29 distinct pictures and the picture lasts as long as the sound.
  const probe = (args: string[]) => execFileSync('ffprobe', ['-v', 'error', ...args, file]).toString().trim();
  const pts = probe(['-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0']).split('\n').map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const span = pts.at(-1)! - pts[0]!;
  expect(pts.length / span).toBeGreaterThanOrEqual(29);
  const gaps = pts.slice(1).map((t, i) => t - pts[i]!);
  expect(Math.max(...gaps)).toBeLessThan(0.07);
  // End of each track = its last packet (WebM has no per-track duration).
  const endOf = (sel: string) => {
    const last = probe(['-select_streams', sel, '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0']).split('\n').filter(Boolean).at(-1)!.split(',').map(Number);
    return last[0]! + (last[1] || 0);
  };
  expect(Math.abs(endOf('v') - endOf('a'))).toBeLessThan(0.15);
});

/**
 * ENVIRONNEMENT MIROIR (local, never in CI): the owner's real conditions before any delivery — the HTML opened as is,
 * the embedded troupe installing itself, the DEFAULT settings (Circuit Grok ON), real French voices (Piper),
 * OpenRouter answering like the real one (a real clip of the owner's Grok films for the video model); the whole
 * Autopilot from a one-line idea to the film, then the film MEASURED (motion, frozen time, flicker, shots).
 */
async function mirrorFilm(page: Page, o: { circuit: boolean; label: string; grokKey?: boolean }) {
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  const net = await intercept(page);
  net.videoCost = -1;
  await page.getByTitle(/AI Film Studio/).click();
  await page.getByTestId('actor-casting').locator('summary').click();
  test.skip((await page.getByTestId('troupe-install').count()) === 0, 'no embedded troupe in this build');
  await page.getByTestId('troupe-install').click();
  await expect(page.getByTestId('actors3d-note')).toContainText(/troupe installée/, { timeout: 170_000 });
  await page.getByTestId('actor-casting').locator('summary').click();
  const L = (speaker: string, text: string, emotion: string, gesture?: string) => ({ speaker, text, emotion, ...(gesture ? { gesture } : {}), language: 'fr' });
  const SC = (i: number, beat: string, location: string, characters: string[], action: string, dialogue: ReturnType<typeof L>[]) => ({ ...STORY.scenes[i % 2]!, beat, duration: 10, location, characters, action, dialogue });
  const FILM = {
    ...STORY,
    title: 'L’argent du marché',
    characters: ['MAMAN NOUNOU', 'BAYE NDIAYE', 'PETIT MAMADOU'],
    scenes: [
      SC(0, 'hook', 'salon de la maison', ['MAMAN NOUNOU', 'BAYE NDIAYE'], 'MAMAN NOUNOU cherche l’argent du marché', [
        L('MAMAN NOUNOU', 'Baye ! Où est passé l’argent du marché ?', 'colère', 'point'),
        L('BAYE NDIAYE', 'Quel argent ? Moi je dormais, ma chérie !', 'surprise', 'shrug'),
        L('MAMAN NOUNOU', 'Tu dormais avec tes chaussures neuves aux pieds ?', 'colère'),
      ]),
      SC(1, 'chute', 'salon de la maison', ['PETIT MAMADOU', 'MAMAN NOUNOU'], 'PETIT MAMADOU balance son grand-père', [
        L('PETIT MAMADOU', 'Maman, Papi a aussi acheté un téléphone !', 'joie'),
        L('MAMAN NOUNOU', 'Baye Ndiaye ! Viens ici tout de suite !', 'colère', 'point'),
      ]),
    ],
  };
  mock.push({ text: JSON.stringify(FILM) });
  mock.fallback = () => ({ text: '{}' });
  await page.getByTestId('film-idea-input').fill('Maman Nounou cherche l’argent du marché.');
  await page.getByRole('button', { name: 'Afrikatoon 2D' }).click();
  // The owner's defaults: Circuit Grok ON. The free run turns it off and plays everything with the troupe.
  await expect(page.getByTestId('film-circuit')).toHaveAttribute('data-on', '1');
  if (!o.circuit) {
    await page.getByTestId('film-circuit').getByRole('switch').click();
    await page.getByTestId('film-actors3d').getByRole('switch').click();
  }
  if (o.grokKey) await page.getByTestId('film-grok-key').getByRole('switch').click();
  await page.getByTestId('film-render-width').selectOption('1080');
  await page.getByTestId('film-create').click();
  await expect(page.getByTestId('film-final')).toBeVisible({ timeout: 840_000 });
  const b64 = await page.evaluate(async () => {
    const b = await (await fetch((document.querySelector('[data-testid=film-final] video') as HTMLVideoElement).src)).blob();
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const out = path.join(process.env.MIRROR_OUT ?? os.tmpdir(), `mirror-${o.label}.webm`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  // The film measured like the owner's TikTok references.
  const { measureFrames } = await import('../../server/jev/studio/clipInspect');
  const W = 96;
  const H = 170;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', `fps=12,scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
  const n = Math.floor(raw.length / (W * H));
  const frames = Array.from({ length: n }, (_, i) => Float32Array.from(raw.subarray(i * W * H, (i + 1) * W * H), (v) => v / 255));
  const m = measureFrames({ w: W, h: H, fps: 12, frames });
  const frozenS = m.frozen.reduce((a, f) => a + f.end - f.start, 0);
  fs.writeFileSync(out.replace(/\.webm$/, '.json'), JSON.stringify({ ...m, frozenS, imageCalls: net.imageCalls.length, videoSubmits: net.videoSubmits, speechCalls: net.speechCalls }, null, 1));
  expect(m.seconds).toBeGreaterThan(8);
  expect(m.motion).toBeGreaterThan(0.006);
  expect(frozenS).toBeLessThan(4);
  expect(m.flicker).toBeLessThan(0.02);
  expect(errors.filter((e) => !/favicon|ERR_|net::|GPU stall|WebGL/i.test(e))).toEqual([]);
  return { net, m };
}

test('Miroir — réglages par défaut (Circuit Grok ON) + votre troupe : le MOTEUR fait tout le film, 0 image payante, 0 clip Grok', async ({ page }) => {
  test.skip(!process.env.MIRROR, 'local mirror environment only');
  test.setTimeout(900_000);
  const { net } = await mirrorFilm(page, { circuit: true, label: 'defaut' });
  expect(net.imageCalls.length).toBe(0);
  expect(net.videoSubmits).toBe(0);
});

test('Miroir — option « Grok sur la chute » (payant, sur demande) : images de départ par le moteur, Grok sur la chute seulement', async ({ page }) => {
  test.skip(!process.env.MIRROR, 'local mirror environment only');
  test.setTimeout(900_000);
  const { net } = await mirrorFilm(page, { circuit: true, label: 'grok-chute', grokKey: true });
  expect(net.imageCalls.length).toBe(0);
  expect(net.videoSubmits).toBe(1);
});

test('Miroir — tout gratuit (troupe, voix réelles, HD)', async ({ page }) => {
  test.skip(!process.env.MIRROR, 'local mirror environment only');
  test.setTimeout(900_000);
  const { net } = await mirrorFilm(page, { circuit: false, label: 'gratuit' });
  expect(net.videoSubmits).toBe(0);
  expect(net.imageCalls.length).toBe(0);
});


test('Corps 3D gonflé: a planche becomes a 3D body (inflated from its own drawing, bones on its measured skeleton, the drawing as skin) driven by the engine', async ({ page }) => {
  test.setTimeout(420_000);
  mock.models = [model('acme/free-text:free', '0', '0')];
  const errors = await open(page, [], { autopilot: true });
  await intercept(page);
  await page.getByTitle(/AI Film Studio/).click();
  await page.getByTestId('actor-casting').locator('summary').click();
  // Only in a build made with the owner's private troupe folder (never in the public repository).
  test.skip((await page.getByTestId('troupe-install').count()) === 0, 'no embedded troupe in this build');
  await page.getByTestId('troupe-install').click();
  await expect(page.getByTestId('actors3d-note')).toContainText(/troupe installée : \d+ acteur\(s\)/, { timeout: 170_000 });
  await page.getByTestId('actors3d-list').getByText('MAMAN NOUNOU', { exact: true }).click();
  await expect(page.getByTestId('actor-preview').locator('canvas')).toBeVisible({ timeout: 20_000 });
  const probe = () =>
    page.evaluate(() => {
      const src = document.querySelector('[data-testid=actor-preview-canvas]') as HTMLCanvasElement;
      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 140;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(src, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const px: number[] = [];
      const set = new Set<number>();
      for (let i = 0; i < d.length; i += 4) {
        px.push(d[i]! + d[i + 1]! + d[i + 2]!);
        set.add(((d[i]! >> 5) << 6) | ((d[i + 1]! >> 5) << 3) | (d[i + 2]! >> 5));
      }
      return { px, colors: set.size };
    });
  await page.waitForTimeout(2500);
  const flat = await probe();
  await page.getByTestId('actor-body3d').check();
  const saved = async () => ((await kvGet(page, 'vs.actors')) as Record<string, { body3d?: boolean }>)['MAMAN NOUNOU']?.body3d;
  await expect.poll(saved, { timeout: 15_000 }).toBe(true);
  // The 3D body is built in the browser (a second or two) and plays: the drawing's colours, and it moves.
  await page.waitForTimeout(7000);
  const shots: { px: number[]; colors: number }[] = [];
  for (let i = 0; i < 6; i++) {
    if (process.env.ACTORS3D_DUMP) await page.getByTestId('actor-preview').screenshot({ path: path.join(process.env.ACTORS3D_DUMP, `body3d-${i}.png`) });
    shots.push(await probe());
    await page.waitForTimeout(450);
  }
  const diff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length;
  for (const s of shots) expect(s.colors).toBeGreaterThan(12);
  expect(Math.max(...shots.slice(1).map((s, i) => diff(shots[i]!.px, s.px)))).toBeGreaterThan(1.5);
  // It is a different rendering from the flat cut-out (volume, lighting), still the drawing (its colours).
  expect(diff(flat.px, shots[0]!.px)).toBeGreaterThan(3);
  // Back to the cut-out: the toggle is per actor and reversible.
  await page.getByTestId('actor-body3d').uncheck();
  await expect.poll(saved, { timeout: 15_000 }).toBe(false);
  expect(errors.filter((e) => !/favicon|ERR_|net::|GPU stall|WebGL/i.test(e))).toEqual([]);
});
