// AI Visual Studio — end-to-end in Chromium, from file://. OpenRouter media endpoints are intercepted with REAL payloads
// captured on 2026-10-06 (tests/fixtures/studio); the text LLM is the usual local mock.
import fs from 'node:fs';
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
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav' }, body: wav() });
    }
    if (p === '/videos' && method === 'POST') {
      net.videoSubmits++;
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
              usage: { cost: 0.2 },
            },
      );
    }
    if (p === '/videos/vid-1/content')
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'video/webm' }, // a real, playable clip with its REAL mime
        body: fs.readFileSync(path.join(ROOT, 'tests/fixtures/studio/clip.webm')),
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
async function open(page: Page, errors: string[] = [], opts: { debug?: boolean; autopilot?: boolean } = {}) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  if (opts.debug) await page.addInitScript(() => localStorage.setItem('vs.debug', '1'));
  // These tests drive the multi-space studio (« mode expert »); the Film Autopilot single view has its own test.
  if (!opts.autopilot) await page.addInitScript(() => localStorage.setItem('vs.expert', '1'));
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill(KEY);
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  return errors;
}
const openStudio = async (page: Page) => {
  const nav = page.getByTitle(/AI Film Studio/);
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
  // storyboard: video attached, image kept
  await page.getByTestId('video-storyboard').click();
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
  await page.getByTestId('film-create').click();
  // One view: the pipeline, the model plan and the scenes appear in place.
  await expect(page.getByTestId('film-pipeline')).toBeVisible();
  await expect(page.getByTestId('film-plan')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('plan-images')).toBeVisible();
  await expect(page.getByTestId('pipe-STORY')).toHaveAttribute('data-state', /done|warning/, { timeout: 30_000 });
  await expect(page.getByTestId('film-scenes').locator('[data-testid^=scene-S]')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('pipe-IMAGES')).toHaveAttribute('data-state', /done|warning/, { timeout: 60_000 });
  expect(net.imageCalls.length).toBeGreaterThanOrEqual(2);
  // Animation: no paid video unless the owner set a video budget → free 2.5D animation, no video call.
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
