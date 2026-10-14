// BAC À SABLE · RÉALISATION — de bout en bout dans l'app réelle : un prompt devient une page exécutée dans une iframe
// isolée ; l'erreur réelle (avec sa ligne) revient au modèle, qui corrige ; les données jointes arrivent dans la page
// (window.DATA) sans que le modèle ne voie le fichier ; la page n'a aucun accès au stockage de l'app.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

async function open(page: Page) {
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-realize');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
}

test('Réalisation: the broken first page is corrected from the real error (with its line); the attached data reach the page; no access to the app storage', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  // Round 1: a ReferenceError on line 5 of the page. Round 2: fixed, reads window.DATA, tries the app's storage.
  mock.push({ text: '```html\n<!doctype html>\n<html><head><title>t</title></head>\n<body>\n<script>\nafficherTotal();\n</script>\n</body></html>\n```' });
  mock.push({
    text:
      '```html\n<!doctype html>\n<html><head><title>t</title></head>\n<body>\n<h1>Ventes</h1><p id="n"></p><p id="s"></p>\n<script>\n' +
      'document.getElementById("n").textContent = window.DATA.length + " lignes · total " + window.DATA.reduce((a, r) => a + Number(r.montant), 0);\n' +
      'let st = "stockage accessible"; try { localStorage.getItem("x"); } catch (e) { st = "stockage bloqué"; }\n' +
      'document.getElementById("s").textContent = st;\n</script>\n</body></html>\n```',
  });
  await openView(page, 'Réalisation');
  await expect(page.getByTestId('realize')).toBeVisible();
  await page.getByTestId('realize-file').setInputFiles({ name: 'ventes.csv', mimeType: 'text/csv', buffer: Buffer.from('region,montant\nDakar,1250\nThiès,430\nSaint-Louis,320\n') });
  await expect(page.getByTestId('realize-data')).toContainText('3 lignes');
  await page.getByTestId('realize-prompt').fill('Affiche le nombre de ventes et le total');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  await expect(page.getByTestId('realize-rounds')).toContainText('Tour 2', { timeout: 40_000 });
  await expect(page.getByTestId('realize-rounds')).toContainText('✓ réalisé sans erreur');
  // The 2nd request carried the real error, its line and the data columns — never the rows themselves.
  const second = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(second).toContain('afficherTotal is not defined');
  expect(second).toContain('>>   5 | afficherTotal();');
  expect(second).toContain('montant (nombre)');
  expect(second).not.toContain('Saint-Louis');
  // The live preview shows the user's data; the page cannot reach the app storage (opaque origin).
  const frame = page.frameLocator('[data-testid=realize-frame]');
  await expect(frame.locator('#n')).toHaveText('3 lignes · total 2000');
  await expect(frame.locator('#s')).toHaveText('stockage bloqué');
  // Exports: standalone HTML download.
  const dl = page.waitForEvent('download');
  await page.getByTestId('realize-download').click();
  const f = await dl;
  expect(f.suggestedFilename()).toMatch(/\.html$/);
});

test('Réalisation: an empty page is caught (nothing visible) and sent back to the model', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  mock.push({ text: '```html\n<!doctype html><html><head></head><body><script>const x = 1;</script></body></html>\n```' });
  mock.push({ text: '```html\n<!doctype html><html><head></head><body><svg width="100" height="100"><circle cx="50" cy="50" r="40" fill="tomato"/></svg></body></html>\n```' });
  await openView(page, 'Réalisation');
  await page.getByTestId('realize-prompt').fill('Un logo rond');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  await expect(page.getByTestId('realize-rounds')).toContainText('Tour 2', { timeout: 40_000 });
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).toContain('la page est vide');
  await expect(page.getByTestId('realize-status')).toHaveText('✓ Aperçu en direct');
});

test('Réalisation VIDÉO: a prompt becomes a canvas animation filmed from its first image, downloadable (MP4 where the browser records it)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  mock.push({
    text:
      '```html\n<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#000}canvas{width:100%;height:100%;object-fit:contain}</style></head><body><canvas id="video" width="640" height="360"></canvas><script>\n' +
      'const c = document.getElementById("video"); const g = c.getContext("2d"); const t0 = performance.now(); window.VIDEO = { duration: 5, width: 640, height: 360 };\n' +
      'function f(now) { const t = Math.min(5, (now - t0) / 1000); g.fillStyle = "#0b1020"; g.fillRect(0, 0, 640, 360); g.fillStyle = "#f97316"; g.beginPath(); g.arc(40 + t * 110, 180, 30, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "28px sans-serif"; g.fillText("Vidéo " + t.toFixed(1) + " s", 20, 40); requestAnimationFrame(f); }\nrequestAnimationFrame(f);\n</script></body></html>\n```',
  });
  await openView(page, 'Réalisation');
  await page.getByTestId('realize-prompt').fill('Une vidéo de 5 secondes : une balle orange qui traverse l’écran');
  await expect(page.getByTestId('realize-video-spec')).toBeVisible();
  await page.getByLabel('Durée de la vidéo').selectOption('5');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  await expect(page.getByTestId('realize-rounds')).toContainText('✓ réalisé sans erreur', { timeout: 40_000 });
  // The rules of a video were sent to the model (duration, single canvas).
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).toContain('vidéo de 5 secondes');
  await expect(page.getByTestId('realize-video-download')).toBeVisible({ timeout: 60_000 });
  const dl = page.waitForEvent('download');
  await page.getByTestId('realize-video-download').click();
  const f = await dl;
  expect(f.suggestedFilename()).toMatch(/\.(mp4|webm)$/);
  const fs = await import('node:fs');
  expect(fs.statSync((await f.path())!).size).toBeGreaterThan(10_000);
  console.log('VIDEO FILE', f.suggestedFilename(), fs.statSync((await f.path())!).size);
});
