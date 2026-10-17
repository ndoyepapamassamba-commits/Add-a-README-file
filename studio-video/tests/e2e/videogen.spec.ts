// BAC À SABLE · VIDÉO IA — de bout en bout dans l'app réelle (build de production) :
//  · Vidéo → scène 3D : une vidéo (images + son) → profondeur image par image → scène Three.js → MP4 avec le son,
//    MP4 RGBD, page HTML 3D autonome qui se joue ;
//  · Idée → plan (rendu par le modèle) → scène 3D HTML → MP4 ;
//  · Image → profondeur → animation → MP4.
// Le modèle de profondeur (jsDelivr) est coupé : le test exerce le repli heuristique, de façon déterministe.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '@workbench/tests/helpers/mockOpenRouter';
import { heuristicPlan } from '../../coeur/videogen/plan';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-studio-video.html');
const OUT = process.env.VIDEOGEN_OUT ?? path.join(ROOT, 'test-results/videogen');
mkdirSync(OUT, { recursive: true });
let mock: MockOpenRouter;
test.beforeAll(async () => {
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

function ffprobe(file: string): { video: number; audio: string | null; w: number; h: number } | null {
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file]).toString()) as { streams: { codec_type: string; codec_name: string; nb_read_frames?: string; width?: number; height?: number }[] };
    const v = j.streams.find((s) => s.codec_type === 'video');
    const a = j.streams.find((s) => s.codec_type === 'audio');
    return { video: Number(v?.nb_read_frames ?? 0), audio: a?.codec_name ?? null, w: v?.width ?? 0, h: v?.height ?? 0 };
  } catch {
    return null; // no ffprobe on this machine
  }
}
/** A short test video: moving pattern + a 440 Hz tone (VP9 + Opus, readable by every Chromium). */
function testVideo(): Buffer | null {
  const f = path.join(OUT, 'source.webm');
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000', '-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus', '-shortest', f]);
    return readFileSync(f);
  } catch {
    return null;
  }
}
/** Real network for the depth model, through curl (the container's Chromium rejects the CDN certificates; curl goes
 *  through the proxy). Files are cached by URL. Used only by the opt-in real-model test. */
async function viaCurl(page: Page) {
  const cache = path.join(OUT, 'net');
  mkdirSync(cache, { recursive: true });
  const handler = async (route: import('@playwright/test').Route) => {
    const url = route.request().url();
    const f = path.join(cache, Buffer.from(url).toString('base64url').slice(-180));
    try {
      execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '300', '-o', f, '-z', f, url]);
    } catch {
      return route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    }
    const type = /\.wasm(\?|$)/.test(url) ? 'application/wasm' : /\.json(\?|$)/.test(url) ? 'application/json' : /\.onnx|_data(\?|$)/.test(url) ? 'application/octet-stream' : 'text/javascript';
    return route.fulfill({ path: f, contentType: type, headers: { 'access-control-allow-origin': '*' } });
  };
  await page.route('https://cdn.jsdelivr.net/**', handler);
  await page.route('https://huggingface.co/**', handler);
}
async function open(page: Page, o: { realModel?: boolean } = {}) {
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  if (o.realModel) await viaCurl(page);
  else await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-videogen');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByTestId('main-nav')).toBeVisible();
  await openView(page, 'Vidéo IA');
  await expect(page.getByTestId('videogen')).toBeVisible();
}
/** Mean and spread of a canvas (a black or flat frame fails). */
async function canvasStats(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((c: HTMLCanvasElement) => {
    const g = document.createElement('canvas');
    g.width = 64;
    g.height = 64;
    const x = g.getContext('2d')!;
    x.drawImage(c, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    let s = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      s += v;
      s2 += v * v;
    }
    const n = d.length / 4;
    return { mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) };
  });
}
async function saveDownload(page: Page, click: () => Promise<void>, name: string): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), click()]);
  const f = path.join(OUT, name);
  await dl.saveAs(f);
  return f;
}

test('Vidéo → scène 3D : pixels d’origine + profondeur par image → MP4 avec le son, RGBD, page HTML 3D qui se joue', async ({ page, context }) => {
  test.setTimeout(420_000);
  const src = testVideo();
  test.skip(!src, 'ffmpeg absent : pas de vidéo de test');
  if (process.env.VIDEOGEN_DEBUG) {
    page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    page.on('crash', () => console.log('CRASH'));
  }
  await open(page);
  await page.getByTestId('videogen-mode-video').click();
  await page.getByTestId('videogen-video-file').setInputFiles({ name: 'tiktok-test.webm', mimeType: 'video/webm', buffer: src! });
  await expect(page.getByTestId('videogen-video-stages')).toContainText('540×960', { timeout: 30_000 });
  const t0 = Date.now();
  await page.getByTestId('videogen-video-analyse').click();
  await expect(page.getByTestId('videogen-video-stages')).toContainText('45 cartes', { timeout: 120_000 });
  const analyseMs = Date.now() - t0;
  await expect(page.getByTestId('videogen-video-preview')).toBeVisible();
  const st = await canvasStats(page, 'videogen-video-preview');
  expect(st.sd).toBeGreaterThan(10); // a real picture, not a black or flat frame
  await page.getByTestId('videogen-video-preview').screenshot({ path: path.join(OUT, 'relief.png') });
  for (const s of ['nuage', 'holo'] as const) {
    await page.getByTestId('videogen-video-style').selectOption(s);
    await page.waitForTimeout(300);
    await page.getByTestId('videogen-video-preview').screenshot({ path: path.join(OUT, `${s}.png`) });
  }
  await page.getByTestId('videogen-video-style').selectOption('relief');

  const t1 = Date.now();
  await page.getByTestId('videogen-video-mp4').click();
  await expect(page.getByTestId('videogen-video-result')).toBeVisible({ timeout: 300_000 });
  const renderMs = Date.now() - t1;
  const mp4 = await saveDownload(page, () => page.getByTestId('videogen-video-download').click(), 'scene-3d.mp4');
  const probe = ffprobe(mp4);
  if (probe) {
    expect(probe.video).toBe(90); // 3 s at 30 fps, frame-exact
    expect(probe.audio).not.toBeNull(); // the original sound is kept
    expect(probe.w).toBe(540);
  }
  await page.getByTestId('videogen-video-rgbd').click();
  await expect(page.getByTestId('videogen-video-rgbd-result')).toBeVisible({ timeout: 300_000 });
  const html = await saveDownload(page, () => page.getByTestId('videogen-video-html').click(), 'scene-3d.html');
  const body = readFileSync(html, 'utf8');
  expect(body).toContain('id="asset-video"'); // the original video, untouched
  expect(body).not.toContain('esm.sh'); // three.js and mp4-muxer are embedded: the page works offline

  // The exported page plays by itself with the network fully cut.
  const p2 = await context.newPage();
  const external: string[] = [];
  await p2.route(/^https?:/, (r) => {
    external.push(r.request().url());
    return r.abort();
  });
  const errors: string[] = [];
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(pathToFileURL(html).href);
  await p2.waitForFunction(() => {
    const s = (window as unknown as { __scene?: { ready?: boolean; error?: string } }).__scene;
    return s?.ready || s?.error;
  }, null, { timeout: 60_000 });
  expect(await p2.evaluate(() => (window as unknown as { __scene: { error?: string } }).__scene.error ?? null)).toBeNull();
  await p2.waitForTimeout(500);
  await p2.locator('#stage').screenshot({ path: path.join(OUT, 'page-html.png') });
  const st2 = await p2.locator('#canvas').evaluate((c: HTMLCanvasElement) => {
    const g = document.createElement('canvas');
    g.width = g.height = 48;
    const x = g.getContext('2d')!;
    x.drawImage(c, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data;
    let s = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      s += v;
      s2 += v * v;
    }
    const n = d.length / 4;
    return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(st2).toBeGreaterThan(10);
  writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify({ analyseMs, renderMs, probe, htmlBytes: body.length }, null, 2));
});

test('Idée → plan rendu par le modèle → scène 3D HTML → MP4 image par image', async ({ page }) => {
  test.setTimeout(420_000);
  const plan = { ...heuristicPlan('Awa marche au marché de Dakar et salue la caméra', { seconds: 5, format: '1:1' }), title: 'Plan du modèle' };
  mock.push({ text: 'Voici le plan :\n```json\n' + JSON.stringify(plan) + '\n```' });
  await open(page);
  await page.getByTestId('videogen-mode-idea').click();
  await page.getByTestId('videogen-text').fill('Awa marche au marché de Dakar et salue la caméra');
  await page.getByLabel('Durée', { exact: true }).selectOption('5');
  await page.getByTestId('videogen-plan').click();
  await expect(page.getByTestId('videogen-shots')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('videogen')).toContainText('Plan du modèle');
  await page.waitForTimeout(500);
  await page.getByTestId('videogen-preview').screenshot({ path: path.join(OUT, 'idea-preview.png') });
  const t0 = Date.now();
  await page.getByTestId('videogen-mp4').click();
  await expect(page.getByTestId('videogen-video')).toBeVisible({ timeout: 400_000 });
  const mp4 = await saveDownload(page, () => page.getByTestId('videogen-download').click(), 'idea.mp4');
  const probe = ffprobe(mp4);
  if (probe) expect(probe.video).toBe(150);
  writeFileSync(path.join(OUT, 'idea-timings.json'), JSON.stringify({ renderMs: Date.now() - t0, probe }, null, 2));
});

test('Image → profondeur → animation → MP4', async ({ page }) => {
  test.setTimeout(300_000);
  const f = path.join(OUT, 'image.png');
  let png: Buffer | null;
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:duration=1', '-frames:v', '1', f]);
    png = readFileSync(f);
  } catch {
    png = null;
  }
  test.skip(!png, 'ffmpeg absent');
  await open(page);
  await page.getByTestId('videogen-mode-image').click();
  await page.getByTestId('videogen-image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png! });
  await page.getByTestId('videogen-analyse').click();
  await expect(page.getByTestId('videogen-image-mp4')).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel('Durée de la vidéo').selectOption('4');
  await page.getByTestId('videogen-image-mp4').click();
  await expect(page.getByTestId('videogen-image-video')).toBeVisible({ timeout: 240_000 });
  const mp4 = await saveDownload(page, () => page.getByTestId('videogen-image-video').getByRole('link').click(), 'image.mp4');
  const probe = ffprobe(mp4);
  if (probe) expect(probe.video).toBe(120);
});

// Opt-in (network): the real Depth Anything V2 Small in the browser on a rendered 3D scene (VIDEOGEN_REAL_VIDEO).
test('Vidéo → scène 3D avec le vrai modèle de profondeur (Depth Anything V2, réseau requis)', async ({ page }) => {
  test.skip(!process.env.VIDEOGEN_REAL_VIDEO, 'test réseau facultatif : VIDEOGEN_REAL_VIDEO=<vidéo>');
  test.setTimeout(900_000);
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)));
  await open(page, { realModel: true });
  await page.getByTestId('videogen-mode-video').click();
  const file = process.env.VIDEOGEN_REAL_VIDEO!;
  await page.getByTestId('videogen-video-file').setInputFiles({ name: path.basename(file), mimeType: 'video/webm', buffer: readFileSync(file) });
  await expect(page.getByTestId('videogen-video-stages')).toContainText(' s · pixels', { timeout: 30_000 });
  await page.getByTestId('videogen-video-analyse').click();
  await expect(page.getByTestId('videogen-video-stages')).toContainText('cartes', { timeout: 800_000 });
  const stages = await page.getByTestId('videogen-video-stages').textContent();
  console.log('STAGES', stages);
  expect(stages).toContain('Depth Anything V2');
  for (const [preset, name] of [['fixe_vivant', 'real-rest'], ['orbite', 'real-orbit']] as const) {
    await page.getByLabel('Mouvement de caméra').selectOption(preset);
    await page.waitForTimeout(400);
    await page.getByTestId('videogen-video-preview').screenshot({ path: path.join(OUT, `${name}.png`) });
  }
  // Drag the camera far to the side: the parallax shows the depth.
  const box = (await page.getByTestId('videogen-video-preview').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId('videogen-video-preview').screenshot({ path: path.join(OUT, 'real-drag.png') });
});

// The owner's project images (private, embedded at build time only when .private/troupe exists — never in the repo).
test('Images du projet : un décor embarqué avec sa profondeur devient une scène 3D et une page HTML autonome', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await page.getByTestId('videogen-mode-image').click();
  const has = await page.getByTestId('videogen-project').count();
  test.skip(!has, 'pas d’images de projet dans ce build (dossier privé absent)');
  await page.getByTestId('videogen-project').click();
  await expect(page.getByTestId('videogen-project-item').first()).toBeVisible();
  const label = (await page.getByTestId('videogen-project-item').first().textContent()) ?? '';
  await page.getByTestId('videogen-project-item').first().click(); // the gallery closes once a picture is chosen
  await expect(page.getByTestId('videogen-image-html')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId('videogen-stages')).toContainText('carte du projet');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByTestId('videogen-image-html').click()]);
  const html = path.join(OUT, 'projet.html');
  await dl.saveAs(html);
  const page3d = readFileSync(html, 'utf8');
  expect(page3d).toContain('"kind":"image"');
  // A set in layers (outils/troupe-plates.py) carries its rebuilt set behind the people.
  if (label.includes('en couches')) expect(page3d).toContain('"layers":{');
});
