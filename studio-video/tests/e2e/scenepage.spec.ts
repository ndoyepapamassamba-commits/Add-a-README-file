// PAGE HTML 3D AUTONOME — fabriquée par l'outil en ligne de commande (outils/video-scene-page.ts), puis ouverte
// avec TOUT le réseau coupé : la scène se joue (three.js embarqué), les styles changent, et l'export MP4 rend chaque
// image à son instant exact avec le son AAC d'origine recopié AU BIT PRÈS (comparé octet par octet).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.VIDEOGEN_OUT ?? path.join(ROOT, 'test-results/scenepage');
mkdirSync(OUT, { recursive: true });
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: ROOT, maxBuffer: 1 << 28 });
/** Raw AAC payload of a file's sound track (ADTS stripped by ffmpeg's « data » muxer = the packets as stored). */
const aacBytes = (f: string) => run('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:a', '-c', 'copy', '-f', 'data', '-']);

test('Page HTML 3D autonome : hors ligne, styles, export MP4 image par image avec le son AAC copié au bit près', async ({ page }) => {
  test.setTimeout(600_000);
  const src = path.join(OUT, 'source.mp4');
  try {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=2:sample_rate=44100', '-c:v', 'libvpx-vp9', '-b:v', '800k', '-c:a', 'aac', '-b:a', '128k', '-shortest', src]);
  } catch {
    test.skip(true, 'ffmpeg absent');
  }
  const html = path.join(OUT, 'page.html');
  const info = JSON.parse(run('npx', ['tsx', 'outils/video-scene-page.ts', src, html, '--depth', 'heuristic', '--title', 'Test autonome']).toString().trim().split('\n').at(-1)!) as { audio: string; frames: number };
  expect(info.audio).toContain('copie exacte');
  const body = readFileSync(html, 'utf8');
  expect(body).not.toMatch(/<script[^>]+src=|https?:\/\/(?!www\.w3\.org)[^"'\s]+\.(js|mjs)/); // nothing fetched from outside

  // Every network request is refused: the page must work from the file alone.
  const external: string[] = [];
  await page.route(/^https?:/, (r) => {
    external.push(r.request().url());
    return r.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => (window as unknown as { __scene?: { ready?: boolean; error?: string } }).__scene?.ready || (window as unknown as { __scene?: { error?: string } }).__scene?.error, null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as { __scene: { error?: string } }).__scene.error ?? null)).toBeNull();
  await expect(page.locator('#status')).toContainText('Prête');
  for (const s of ['original', 'relief', 'nuage', 'holo']) {
    await page.locator(`[data-style=${s}]`).click();
    await page.waitForTimeout(250);
    await page.locator('#stage').screenshot({ path: path.join(OUT, `style-${s}.png`) });
  }
  await page.locator('[data-style=relief]').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 500_000 }), page.locator('#export').click()]);
  const mp4 = path.join(OUT, 'export.mp4');
  await dl.saveAs(mp4);
  await expect(page.locator('#status')).toContainText('MP4 prêt');
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', mp4]).toString()) as { streams: { codec_type: string; codec_name: string; nb_read_frames?: string }[] };
  expect(Number(probe.streams.find((s) => s.codec_type === 'video')!.nb_read_frames)).toBe(60);
  expect(probe.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  // Bit-exact sound: the exported AAC packets are the source's, byte for byte.
  const a = aacBytes(src);
  const b = aacBytes(mp4);
  expect(b.length).toBeGreaterThan(1000);
  expect(Buffer.compare(a.subarray(0, b.length), b)).toBe(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('Image fixe → même page HTML 3D autonome (sa profondeur, caméra animée, export MP4 sans son)', async ({ page }) => {
  test.setTimeout(400_000);
  const src = path.join(OUT, 'image.png');
  try {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x320:duration=1', '-frames:v', '1', src]);
  } catch {
    test.skip(true, 'ffmpeg absent');
  }
  const html = path.join(OUT, 'image.html');
  run('npx', ['tsx', 'outils/video-scene-page.ts', src, html, '--depth', 'heuristic', '--seconds', '2', '--title', 'Image test']);
  const external: string[] = [];
  await page.route(/^https?:/, (r) => {
    external.push(r.request().url());
    return r.abort();
  });
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => {
    const s = (window as unknown as { __scene?: { ready?: boolean; error?: string } }).__scene;
    return s?.ready || s?.error;
  }, null, { timeout: 60_000 });
  await expect(page.locator('#status')).toContainText('image 480×320');
  await expect(page.locator('#mute')).toBeHidden();
  await page.locator('[data-style=relief]').click();
  await page.locator('#stage').screenshot({ path: path.join(OUT, 'image-relief.png') });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300_000 }), page.locator('#export').click()]);
  const mp4 = path.join(OUT, 'image.mp4');
  await dl.saveAs(mp4);
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', mp4]).toString()) as { streams: { codec_type: string; nb_read_frames?: string }[] };
  expect(Number(probe.streams.find((s) => s.codec_type === 'video')!.nb_read_frames)).toBe(60);
  expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(false);
  expect(external).toEqual([]);
});
