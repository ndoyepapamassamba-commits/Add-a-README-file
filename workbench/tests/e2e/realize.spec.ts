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
  mock.push({ text: '```html\n<!doctype html><html><head></head><body><script type="application/json" id="realize-spec">{"elements":[{"name":"logo rond"}],"light":"","view":"face"}</script><svg width="100" height="100"><circle data-element="logo rond" cx="50" cy="50" r="40" fill="tomato"/></svg></body></html>\n```' });
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
      '```html\n<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#000}canvas{width:100%;height:100%;object-fit:contain}</style></head><body><script type="application/json" id="realize-spec">{"elements":[{"name":"balle orange","where":"partout"}],"light":"nuit","view":"face"}</script><canvas id="video" width="640" height="360"></canvas><script>\n' +
      'window.REALIZE_ELEMENTS = ["balle orange"]; const c = document.getElementById("video"); const g = c.getContext("2d"); const t0 = performance.now(); window.VIDEO = { duration: 5, width: 640, height: 360 };\n' +
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

test('v62 — Réalisation VIDÉO: an unclosed fence and an unfilmable page (HTML controls over a 300×150 canvas) are corrected; after filming the preview is ALIVE', async ({ page }) => {
  test.setTimeout(150_000);
  mock.reset();
  await open(page);
  const anim = (w: number, h: number) =>
    `<canvas id="video" width="${w}" height="${h}"></canvas><script>\nconst c = document.getElementById("video"); const g = c.getContext("2d"); const t0 = performance.now(); window.VIDEO = { duration: 4, width: ${w}, height: ${h} };\nfunction f(now) { const t = (now - t0) / 1000; g.fillStyle = "#0b1020"; g.fillRect(0, 0, ${w}, ${h}); g.fillStyle = "#14b8a6"; g.beginPath(); g.arc(40 + (t * 120) % ${w - 80}, ${h / 2}, 30, 0, 7); g.fill(); document.title = "t=" + t.toFixed(2); requestAnimationFrame(f); }\nrequestAnimationFrame(f);\n</script>`;
  mock.push(
    // Round 1: the fence is never closed, and the « video » is an HTML page with controls over a default-size canvas.
    { text: '```html\n<!doctype html><html><head></head><body><div class="panel"><h1>Île tropicale au couchant</h1><button>Pause</button></div><canvas></canvas><script>document.querySelector("canvas").getContext("2d").fillRect(140,70,4,4)</script></body></html>' },
    // Round 2: a real filmable video page.
    { text: '```html\n<!doctype html><html><head><style>html,body{margin:0;height:100%;background:#000}canvas{width:100%;height:100%;object-fit:contain}</style></head><body><script type="application/json" id="realize-spec">{"elements":[{"name":"île tropicale","where":"centre"}],"light":"couchant doré","view":"plan large"}</script><script>window.REALIZE_ELEMENTS = ["île tropicale"];</script>' + anim(640, 360) + '</body></html>\n```' },
  );
  await openView(page, 'Réalisation');
  await page.getByTestId('realize-prompt').fill('Une vidéo de 4 secondes : île tropicale au couchant');
  await page.getByLabel('Durée de la vidéo').selectOption('5');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  await expect(page.getByTestId('realize-rounds')).toContainText('✓ réalisé sans erreur', { timeout: 60_000 });
  // The correction message named the real problem.
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).toContain('300×150 au lieu de 1920×1080');
  // No stray fence in what ran.
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).not.toContain('```html\\n```html');
  await expect(page.getByTestId('realize-video-download')).toBeVisible({ timeout: 90_000 });
  // After filming, the preview runs in real time again (its clock moves). The sandbox is an opaque-origin frame: it is
  // read through Playwright's frame API.
  const sandbox = () => page.frames().find((f) => f !== page.mainFrame() && f.url() === 'about:srcdoc');
  await expect.poll(async () => (await sandbox()?.evaluate(() => document.title).catch(() => '')) ?? '', { timeout: 15_000 }).toMatch(/^t=/);
  const a = await sandbox()!.evaluate(() => document.title);
  await page.waitForTimeout(700);
  const b = await sandbox()!.evaluate(() => document.title);
  expect(b).not.toBe(a);
});

test('v62 — Réalisation FIDÉLITÉ: an element the request names but that is hidden, or drawn at the wrong place, goes back to the model (measured in the page)', async ({ page }) => {
  test.setTimeout(120_000);
  mock.reset();
  await open(page);
  const scene = (churchOpacity: number, riverY: number) =>
    '```html\n<!doctype html><html><head><style>html,body{margin:0;height:100%}svg{width:100vw;height:100vh;display:block}</style></head><body>' +
    '<script type="application/json" id="realize-spec">{"elements":[{"name":"village","where":"centre"},{"name":"église","where":"centre"},{"name":"rivière","where":"bas"}],"light":"fin d’après-midi dorée","view":"vue plongeante"}</script>' +
    '<svg viewBox="0 0 1000 600" preserveAspectRatio="none"><rect width="1000" height="600" fill="#f2c27a"/>' +
    '<g data-element="village"><rect x="380" y="250" width="240" height="120" fill="#c9a27a"/></g>' +
    `<g data-element="église" opacity="${churchOpacity}"><rect x="470" y="200" width="60" height="110" fill="#eee"/></g>` +
    `<g data-element="rivière"><rect x="0" y="${riverY}" width="1000" height="60" fill="#5d8fa6"/></g>` +
    '</svg></body></html>\n```';
  mock.push({ text: scene(0, 30) }, { text: scene(1, 500) });
  await openView(page, 'Réalisation');
  await page.getByTestId('realize-prompt').fill('Un village avec une église et une rivière, à la fin d’après-midi');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  await expect(page.getByTestId('realize-rounds')).toContainText('✓ réalisé sans erreur', { timeout: 60_000 });
  const feedback = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(feedback).toContain('ne réalise pas EXACTEMENT la demande');
  expect(feedback).toContain('« église » est presque invisible');
  expect(feedback).toContain('« rivière » doit être en bas');
  expect(feedback).not.toContain('« village » est presque invisible');
  // The prompt asked for an illustration of a scene: the illustration rules (planes, perspective, light) were given.
  expect(JSON.stringify(mock.requests[0]!.messages)).toContain('FIDÉLITÉ À LA DEMANDE');
});

test('Réalisation (v64) : JEV dirige le bac à sable — fiches de savoirs dans les consignes, bibliothèque « jev » importée et exécutée dans la page isolée', async ({ page }) => {
  test.setTimeout(90_000);
  mock.reset();
  await open(page);
  mock.push({
    text:
      '```html\n<!doctype html><html><head><title>q</title></head><body><p id="e"></p><p id="g"></p><p id="o"></p>\n<script type="module">\n' +
      'import * as jev from "jev";\n' +
      'document.getElementById("e").textContent = "E1 = " + jev.quantum.hydrogenEnergy(1).toFixed(2) + " eV";\n' +
      'document.getElementById("g").textContent = "hanche " + Math.round(jev.human.gait(0).hip) + "°";\n' +
      'document.getElementById("o").textContent = "points " + jev.quantum.sampleOrbital(2, 1, 0, 300).length / 3;\n' +
      '</script></body></html>\n```',
  });
  await openView(page, 'Réalisation');
  await page.getByTestId('realize-prompt').fill('Montre l’énergie de l’atome d’hydrogène, une orbitale 2p et la pose d’un homme qui marche');
  await page.getByTestId('realize-model').selectOption({ index: 1 });
  await page.getByTestId('realize-go').click();
  const frame = page.frameLocator('[data-testid=realize-frame]');
  await expect(frame.locator('#e')).toHaveText('E1 = -13.61 eV', { timeout: 30_000 });
  await expect(frame.locator('#g')).toHaveText('hanche 30°');
  await expect(frame.locator('#o')).toHaveText('points 300');
  // What the model was told: the quantum and human-motion cards + the library API.
  const sys = JSON.stringify(mock.requests[0]!.messages);
  expect(sys).toContain('SAVOIRS DE JEV');
  expect(sys).toContain('Physique quantique montrée juste');
  expect(sys).toContain('Marche et course humaines crédibles');
  expect(sys).toContain('import * as jev from \\"jev\\"');
});
