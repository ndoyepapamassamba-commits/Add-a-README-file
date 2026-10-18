// « ANIMER MON IMAGE » de bout en bout dans l'app construite : image déposée → consigne « un seul temps » → envoi au
// Space Wan 2.2 (simulé ici à l'identique du protocole de file de Gradio : config, upload, queue/join, flux SSE, fichier)
// → clip reçu et lu → quota du jour mis à jour ; puis le compte Hugging Face gratuit relié par jeton (whoami-v2 simulé)
// sans que le jeton apparaisse jamais dans la page. Captures bureau et téléphone pour la relecture visuelle.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-studio-video.html');
const OUT = process.env.ANIMER_OUT ?? path.join(ROOT, 'test-results/animer');
mkdirSync(OUT, { recursive: true });
const SPACE = 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space';
const JETON = 'hf_jeton_de_test_ne_doit_jamais_apparaitre';

function fichiers(): { png: Buffer; mp4: Buffer } {
  const png = path.join(OUT, 'depart.png');
  const mp4 = path.join(OUT, 'clip.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=1:duration=1', '-frames:v', '1', png]);
  // le Space renvoie du MP4 H.264 (lu par Chrome / Edge) ; le Chromium libre des tests ne lit pas le H.264 : clip VP9
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x832:rate=16:duration=3', '-c:v', 'libvpx-vp9', '-b:v', '600k', '-f', 'webm', mp4]);
  return { png: readFileSync(png), mp4: readFileSync(mp4) };
}

async function simulerSpace(page: Page, mp4: Buffer, envois: { fn: number; consigne: string; auth: string | null }[]) {
  await page.route(`${SPACE}/**`, async (route) => {
    const u = route.request().url();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.endsWith('/config')) return route.fulfill({ headers: cors, json: { api_prefix: '/gradio_api', dependencies: [{ api_name: 'load' }, { api_name: 'generate_video' }] } });
    if (u.includes('/gradio_api/upload')) return route.fulfill({ headers: cors, json: ['/tmp/gradio/abc/depart.png'] });
    if (u.endsWith('/gradio_api/queue/join')) {
      const b = JSON.parse(route.request().postData() ?? '{}') as { fn_index: number; data: unknown[] };
      envois.push({ fn: b.fn_index, consigne: String(b.data[1]), auth: route.request().headers()['authorization'] ?? null });
      return route.fulfill({ headers: cors, json: { event_id: 'e1' } });
    }
    if (u.includes('/gradio_api/queue/data')) {
      const lignes = [
        { msg: 'estimation', rank: 0, rank_eta: 12 },
        { msg: 'process_starts' },
        { msg: 'progress', progress_data: [{ index: 2, length: 4 }] },
        { msg: 'process_completed', success: true, output: { data: [{ video: { url: `${SPACE}/gradio_api/file=/tmp/v.mp4` } }, 1234] } },
      ].map((m) => `data: ${JSON.stringify(m)}\n\n`).join('');
      return route.fulfill({ headers: { ...cors, 'content-type': 'text/event-stream' }, body: lignes });
    }
    if (u.endsWith('/v.mp4')) return route.fulfill({ headers: { ...cors, 'content-type': 'video/webm' }, body: mp4 });
    return route.fulfill({ status: 404, headers: cors, body: '?' });
  });
}

test('Animer mon image : image → GPU distant → clip, quota du jour, compte gratuit relié sans afficher le jeton', async ({ page }) => {
  const { png, mp4 } = fichiers();
  const envois: { fn: number; consigne: string; auth: string | null }[] = [];
  await simulerSpace(page, mp4, envois);
  await page.route('https://huggingface.co/api/whoami-v2', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { name: 'massamba-test', isPro: false, auth: { accessToken: { role: 'read' } } } }),
  );
  await page.goto(pathToFileURL(FILE).href);
  await page.getByRole('button', { name: /Utiliser sans clé/ }).click(); // rien de payant : moteurs gratuits seulement
  await openView(page, 'Animer mon image');
  await expect(page.getByTestId('animer')).toBeVisible();
  await expect(page.getByTestId('animer-compte')).toContainText('5 min par jour au lieu de 2');
  await expect(page.getByTestId('animer-quota')).toContainText('0 / 120 s');

  await page.getByTestId('animer-fichier').setInputFiles({ name: 'depart.png', mimeType: 'image/png', buffer: png });
  await page.getByText('Salue de la main').click();
  await page.getByText('Zoom avant lent').click();
  // force du mouvement (préréglages façon Higgsfield) : proposée dès qu'une caméra bouge, « Normale » par défaut
  await expect(page.getByTestId('animer-intensite')).toBeVisible();
  await expect(page.getByText('Zoom éclair')).toBeVisible();
  await expect(page.getByTestId('animer-go')).toBeEnabled();
  await page.screenshot({ path: path.join(OUT, 'bureau-avant.png'), fullPage: true });
  await page.getByTestId('animer-go').click();

  await expect(page.getByTestId('animer-resultat').locator('video')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('animer-resultat')).toContainText('graine 1234');
  await expect(page.getByTestId('animer-quota')).toContainText('29 / 120 s');
  expect(envois).toHaveLength(1);
  expect(envois[0]!.fn).toBe(1);
  expect(envois[0]!.consigne).toBe('The character raises one hand and waves hello. Slow dolly in toward the character. natural, realistic pace. Keep the same character, face, clothes and colors as in the image.');
  expect(envois[0]!.auth).toBeNull(); // sans compte : aucun en-tête d'identité
  const duree = await page.getByTestId('animer-resultat').locator('video').evaluate(async (v: HTMLVideoElement) => {
    if (!(v.readyState >= 1)) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    return v.duration;
  });
  expect(duree).toBeGreaterThan(2.5);
  await page.screenshot({ path: path.join(OUT, 'bureau-clip.png'), fullPage: true });

  // compte gratuit : le jeton est vérifié (whoami-v2), gardé dans le navigateur, jamais affiché
  await page.getByTestId('animer-jeton').fill(JETON);
  await page.getByRole('button', { name: 'Relier' }).click();
  await expect(page.getByTestId('animer-quota')).toContainText('compte massamba-test');
  await expect(page.getByTestId('animer-quota')).toContainText('/ 300 s');
  expect(await page.content()).not.toContain(JETON);
  await page.getByTestId('animer-go').click();
  await expect.poll(() => envois.length, { timeout: 30_000 }).toBe(2);
  expect(envois[1]!.auth).toBe(`Bearer ${JETON}`); // avec compte : le quota de 5 min est celui de l'utilisateur

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(OUT, 'telephone.png'), fullPage: true });
});
