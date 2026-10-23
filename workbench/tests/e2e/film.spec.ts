// Circuit vidéo (23/10/2026): a one-minute film of the troupe, end to end, against a simulated OpenRouter — the
// script, the plan images, the clips (jobs, polling, download) and the montage run for real in Chromium; the MP4 that
// comes out is checked with ffprobe and decoded in full. Also: the HARD cap refuses calls before they are sent, and a
// reload during shooting resumes the jobs without paying for them twice.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const MODELS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests/fixtures/openrouter-videos-models-2026-10-23.json'), 'utf8'),
);
let mock: MockOpenRouter;
let dir = '';
let clips: Buffer[] = [];
let webm: Buffer[] = [];
let png = '';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
test.beforeAll(async () => {
  if (!fs.existsSync(APP)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-film-'));
  // the app next to a synthetic troupe pack (no private image in the tests)
  fs.copyFileSync(APP, path.join(dir, 'app.html'));
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=320x240', '-frames:v', '1', path.join(dir, 'scene.png')]);
  png = `data:image/png;base64,${fs.readFileSync(path.join(dir, 'scene.png')).toString('base64')}`;
  fs.writeFileSync(
    path.join(dir, 'massamba-troupe-film.js'),
    `window.MASSAMBA_TROUPE_FILM=${JSON.stringify({ version: 'test', scenes: [{ id: 'maquis', titre: 'Maquis', acteurs: ['KOFFI', 'COUMBA'], image: png }] })};`,
  );
  // H.264 clips as Grok returns them (same format: the test browser cannot decode H.264, the montage joins them
  // without re-encoding), and VP9 clips of three kinds (stereo, mono 44.1 kHz at 30 i/s, 16:9 silent) re-encoded
  const src = (size: string, rate: number) => ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`];
  const h264 = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '24'];
  ff([
    ...src('360x640', 24),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-ac',
    '2',
    '-t',
    '2',
    ...h264,
    '-c:a',
    'aac',
    path.join(dir, 'a.mp4'),
  ]);
  ff([
    ...src('360x640', 24),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=48000',
    '-ac',
    '2',
    '-t',
    '2',
    ...h264,
    '-c:a',
    'aac',
    path.join(dir, 'b.mp4'),
  ]);
  ff([...src('360x640', 24), '-t', '2', ...h264, path.join(dir, 'c.mp4')]);
  const vp9 = ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8'];
  ff([
    ...src('360x640', 24),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-ac',
    '2',
    '-t',
    '2',
    ...vp9,
    '-c:a',
    'libopus',
    path.join(dir, 'a.webm'),
  ]);
  ff([
    ...src('360x640', 30),
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=44100',
    '-ac',
    '1',
    '-t',
    '2',
    ...vp9,
    '-c:a',
    'libopus',
    path.join(dir, 'b.webm'),
  ]);
  ff([...src('640x360', 24), '-t', '2', ...vp9, path.join(dir, 'c.webm')]);
  clips = ['a.mp4', 'b.mp4', 'c.mp4'].map((n) => fs.readFileSync(path.join(dir, n)));
  webm = ['a.webm', 'b.webm', 'c.webm'].map((n) => fs.readFileSync(path.join(dir, n)));
});
test.afterAll(async () => {
  await mock?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const SCRIPT = {
  titre: 'L’addition',
  personnages: [
    { nom: 'KOFFI', apparence: 'man on the left, black and gold shirt, sunglasses' },
    { nom: 'COUMBA', apparence: 'woman on the right, purple dress' },
  ],
  plans: Array.from({ length: 6 }, (_, i) => ({
    cadrage: i === 0 ? 'plan large' : 'plan moyen',
    dans_le_cadre: ['KOFFI', 'COUMBA'],
    action: `Action ${i + 1}`,
    visuel_en: `they talk at the table, beat ${i + 1}`,
    camera_en: 'slow push-in',
    repliques: [{ qui: i % 2 ? 'COUMBA' : 'KOFFI', texte: `Réplique numéro ${i + 1} du film` }],
  })),
};

interface Sim {
  chat: Record<string, unknown>[];
  images: Record<string, unknown>[];
  videos: Record<string, unknown>[];
  polls: Record<string, number>;
  hold: boolean;
  kind: 'mp4' | 'webm';
}
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

async function open(page: Page, sim: Sim, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (globalThis as { __FILM_POLL_MS?: number }).__FILM_POLL_MS = 100;
  });
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace('/api/v1', '');
    if (req.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    if (p === '/videos/models') return json(route, MODELS);
    if (p === '/images' && req.method() === 'POST') {
      sim.images.push(req.postDataJSON());
      return json(route, {
        data: [{ b64_json: png.split(',')[1], media_type: 'image/png' }],
        usage: { cost: 0.04 },
      });
    }
    if (p === '/videos' && req.method() === 'POST') {
      sim.videos.push(req.postDataJSON());
      return json(
        route,
        {
          id: `job-${sim.videos.length - 1}`,
          status: 'pending',
          polling_url: `${url.origin}/api/v1/videos/job-${sim.videos.length - 1}`,
        },
        202,
      );
    }
    const content = /^\/videos\/job-(\d+)\/content$/.exec(p);
    if (content)
      return route.fulfill({
        status: 200,
        contentType: `video/${sim.kind}`,
        headers: { 'access-control-allow-origin': '*' },
        body: (sim.kind === 'mp4' ? clips : webm)[Number(content[1]) % 3]!,
      });
    const poll = /^\/videos\/(job-\d+)$/.exec(p);
    if (poll) {
      const n = (sim.polls[poll[1]!] = (sim.polls[poll[1]!] ?? 0) + 1);
      if (sim.hold || n < 2) return json(route, { id: poll[1], status: 'in_progress' });
      return json(route, { id: poll[1], status: 'completed', usage: { cost: 0.31 } });
    }
    if (
      p === '/chat/completions' &&
      req.method() === 'POST' &&
      (req.postData() ?? '').includes('scénariste')
    ) {
      sim.chat.push(req.postDataJSON());
      return json(route, {
        choices: [{ message: { content: JSON.stringify(SCRIPT) } }],
        usage: { cost: 0.01 },
      });
    }
    const res = await route.fetch({ url: req.url().replace('https://openrouter.ai/api/v1', mock.url) });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(path.join(dir, 'app.html')).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-film-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Circuit vidéo');
  await page.getByTestId('film-scene').first().click();
  await expect(page.getByTestId('film-devis')).toContainText('6 plans de 10 s');
}
async function saveFilm(page: Page, name: string): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('film-download').click()]);
  const out = path.join(dir, name);
  await dl.saveAs(out);
  return out;
}
type Stream = {
  codec_name: string;
  codec_type: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
};
function probe(f: string): { v?: Stream; a?: Stream; duration: number } {
  const j = JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,codec_type,width,height,sample_rate,channels:format=duration',
      '-of',
      'json',
      f,
    ]).toString(),
  ) as { streams: Stream[]; format: { duration: string } };
  return {
    v: j.streams.find((x) => x.codec_type === 'video'),
    a: j.streams.find((x) => x.codec_type === 'audio'),
    duration: Number(j.format.duration),
  };
}
const newSim = (kind: Sim['kind'] = 'mp4'): Sim => ({
  chat: [],
  images: [],
  videos: [],
  polls: {},
  hold: false,
  kind,
});

test('film d’une minute : script, images 9:16, 6 plans Grok à première image imposée, montage MP4 vérifié', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const sim = newSim();
  const errors: string[] = [];
  await open(page, sim, errors);
  await expect(page.getByTestId('film-devis')).toContainText('Grok Imagine Video 1.5');
  await page.getByTestId('film-all').click();
  await expect(page.getByTestId('film-confirm')).toContainText('Dépense estimée');
  await page.getByTestId('film-confirm-go').click();
  await expect(page.getByTestId('film-video')).toBeVisible({ timeout: 180_000 });

  // the script was written LOOKING at the scene image
  expect(sim.chat).toHaveLength(1);
  expect(JSON.stringify(sim.chat[0])).toContain('"type":"image_url"');
  // one image per plan, the scene as reference, vertical
  expect(sim.images).toHaveLength(6);
  for (const b of sim.images) {
    expect(b.aspect_ratio).toBe('9:16');
    expect((b.input_references as { image_url: { url: string } }[])[0]!.image_url.url).toBe(png);
  }
  // six clips submitted at once, each pinned on its plan image, the line given to the right character
  expect(sim.videos).toHaveLength(6);
  for (const b of sim.videos) {
    expect(b).toMatchObject({
      model: 'x-ai/grok-imagine-video-1.5',
      duration: 10,
      resolution: '720p',
      aspect_ratio: '9:16',
    });
    expect((b.frame_images as { frame_type: string; image_url: { url: string } }[])[0]).toMatchObject({
      frame_type: 'first_frame',
    });
    expect(String(b.prompt)).toContain('starts exactly on the provided first frame');
  }
  expect(sim.videos.map((b) => String(b.prompt)).join('\n')).toContain(
    'KOFFI (man on the left, black and gold shirt, sunglasses) says: "Réplique numéro 1 du film"',
  );
  await expect(page.getByTestId('film-shot-state').filter({ hasText: 'terminé' })).toHaveCount(6);
  // real costs reported by OpenRouter: script 0,01 + 6 images × 0,04 + 6 clips × 0,31 = 2,11 $
  await expect(page.getByTestId('film-step-6')).toContainText('Dépensé : 2,11 $');

  // H.264 clips in a browser that cannot decode them: joined without re-encoding, captions as .srt
  await expect(page.getByTestId('film-srt')).toBeVisible();
  const out = await saveFilm(page, 'film.mp4');
  const pr = probe(out);
  expect(pr.v).toMatchObject({ codec_name: 'h264', width: 360, height: 640 });
  expect(pr.a).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 });
  expect(Math.abs(pr.duration - 12)).toBeLessThan(0.35);
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', out, '-f', 'null', '-']);
  // moov before mdat: plays at once on a phone
  const bytes = fs.readFileSync(out);
  expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));
  expect(errors).toEqual([]);
});

test('montage réencodé : plans VP9 de formats différents → un film 9:16 720×1280, son rééchantillonné, silence ajouté', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const sim = newSim('webm');
  const errors: string[] = [];
  await open(page, sim, errors);
  await page.getByTestId('film-all').click();
  await page.getByTestId('film-confirm-go').click();
  await expect(page.getByTestId('film-video')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('film-srt')).toHaveCount(0); // captions burnt into the picture
  const out = await saveFilm(page, 'film.webm');
  const pr = probe(out);
  // no H.264 encoder in the test browser: VP9 + Opus in WebM (Chrome and Edge write H.264 + AAC in MP4)
  expect(pr.v).toMatchObject({ codec_name: 'vp9', width: 720, height: 1280 });
  expect(pr.a).toMatchObject({ codec_name: 'opus', sample_rate: '48000', channels: 2 });
  expect(Math.abs(pr.duration - 12)).toBeLessThan(0.4);
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', out, '-f', 'null', '-']);
  // plan 3 (film time 4–6 s) came without sound: silence was added, the voices of plans 1–2 do not drift into it
  const peak = (from: number, len: number) => {
    const r = spawnSync('ffmpeg', [
      '-v',
      'info',
      '-ss',
      String(from),
      '-t',
      String(len),
      '-i',
      out,
      '-vn',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ]);
    return Number(
      /max_volume:\s*(-?[\d.]+|-inf)/.exec(r.stderr.toString())?.[1]?.replace('-inf', '-200') ?? 'NaN',
    );
  };
  expect(peak(4.3, 1.4)).toBeLessThan(-50);
  expect(peak(0.3, 1.4)).toBeGreaterThan(-30);
  expect(peak(2.3, 1.4)).toBeGreaterThan(-30);
  expect(errors).toEqual([]);
});

test('plafond DUR : un plafond de 1 $ refuse les plans avant tout envoi', async ({ page }) => {
  test.setTimeout(120_000);
  const sim = newSim();
  await open(page, sim, []);
  await page.getByTestId('film-cap').fill('1');
  await page.getByTestId('film-all').click();
  await page.getByTestId('film-confirm-go').click();
  await expect(page.getByText(/Plafond de 1,00 \$ atteint/).first()).toBeVisible({ timeout: 60_000 });
  expect(sim.videos).toHaveLength(0);
});

test('rechargement pendant le tournage : les tâches reprennent, aucun plan n’est payé deux fois', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const sim = newSim();
  sim.hold = true;
  await open(page, sim, []);
  await page.getByTestId('film-all').click();
  await page.getByTestId('film-confirm-go').click();
  await expect.poll(() => sim.videos.length, { timeout: 60_000 }).toBe(6);
  await page.waitForTimeout(1500); // the job ids are saved (IndexedDB, debounced write)
  await page.reload();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  sim.hold = false;
  await openView(page, 'Circuit vidéo');
  await expect(page.getByTestId('film-shot-state').filter({ hasText: 'terminé' })).toHaveCount(6, {
    timeout: 60_000,
  });
  expect(sim.videos).toHaveLength(6);
  await page.getByTestId('film-montage').click();
  await expect(page.getByTestId('film-video')).toBeVisible({ timeout: 120_000 });
});
