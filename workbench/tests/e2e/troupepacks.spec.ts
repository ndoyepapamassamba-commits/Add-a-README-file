// APP EN PAQUETS — la construction « npm run build:direct:packs » range les décors du projet dans des fichiers
// massamba-troupe-N.js (< 30 Mo chacun) à côté de l'app (≈ 21 Mo, planches et galeries incluses). Vérifié ici dans
// l'app réelle, hors ligne :
//  · paquets dans le même dossier → chargés tout seuls, galerie complète ;
//  · app seule → galerie partielle + import des paquets (lus comme données) → décors gardés après rechargement ;
//  · un faux paquet est refusé.
// Sans build en paquets (ou sans dossier privé), les tests se mettent de côté.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const APP = 'massamba-workbench-direct.html';
const PACKS = existsSync(DIST) ? readdirSync(DIST).filter((f) => /^massamba-troupe-\d+\.js$/.test(f)).sort() : [];
const OUT = path.join(ROOT, 'test-results/troupepacks');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

async function open(page: Page, file: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await page.goto(pathToFileURL(file).href);
  await enter(page);
  return errors;
}
async function enter(page: Page) {
  const key = page.getByPlaceholder('sk-or-v1-…');
  await expect(key.or(page.getByText('Nouvelle mission')).first()).toBeVisible({ timeout: 60_000 });
  if (await key.isVisible()) {
    await key.fill('sk-or-v1-e2e-packs');
    await page.getByRole('button', { name: 'Commencer' }).click();
  }
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Vidéo IA');
  await page.getByTestId('videogen-mode-image').click();
  await page.getByTestId('videogen-project').click();
  await expect(page.getByTestId('videogen-project-gallery')).toBeVisible();
}
const decorCount = async (page: Page) => Number(/décors \((\d+)\)/.exec((await page.getByTestId('videogen-project-gallery').textContent()) ?? '')?.[1] ?? -1);

test.describe('App en paquets de décors', () => {
  test.skip(!PACKS.length, 'pas de build en paquets (npm run build:direct:packs) ou pas de dossier privé');

  test('paquets à côté de l’app : décors chargés tout seuls, scène 3D en couches prête', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await open(page, path.join(DIST, APP));
    const status = page.getByTestId('videogen-troupe-status');
    await expect(status).toContainText('chargés depuis les paquets', { timeout: 120_000 });
    const n = Number(/(\d+) décors/.exec((await status.textContent()) ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(await decorCount(page)).toBe(n);
    await expect(page.getByTestId('videogen-troupe-import')).toHaveCount(0);
    const layered = page.getByTestId('videogen-project-item').filter({ hasText: 'en couches' }).first();
    await expect(layered).toBeVisible();
    await layered.click();
    await expect(page.getByTestId('videogen-stages')).toContainText('carte du projet', { timeout: 60_000 });
    await expect(page.getByTestId('videogen-image-html')).toBeEnabled({ timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test('app seule : import des paquets (lus comme données), gardés après rechargement ; faux paquet refusé', async ({ page }) => {
    test.setTimeout(600_000);
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    copyFileSync(path.join(DIST, APP), path.join(OUT, APP));
    const errors = await open(page, path.join(OUT, APP));
    const status = page.getByTestId('videogen-troupe-status');
    await expect(status).toContainText('manquent', { timeout: 120_000 });
    expect(await decorCount(page)).toBe(0);
    // A file that is not a pack is refused (and never run).
    await page.getByTestId('videogen-troupe-file').setInputFiles({ name: 'massamba-troupe-1.js', mimeType: 'text/javascript', buffer: Buffer.from('window.__pwned = 1; alert(1)') });
    await expect(page.getByText(/Import refusé/)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    // The real packs.
    const t0 = Date.now();
    await page.getByTestId('videogen-troupe-file').setInputFiles(PACKS.map((f) => path.join(DIST, f)));
    await expect(status).toContainText('importés', { timeout: 300_000 });
    const importMs = Date.now() - t0;
    const n = Number(/(\d+) décors/.exec((await status.textContent()) ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(await decorCount(page)).toBe(n);
    // Reopened: the sets come back from the browser storage, nothing to import again.
    await page.reload();
    const t1 = Date.now();
    await enter(page);
    await expect(status).toContainText(`${n} décors importés`, { timeout: 120_000 });
    const reloadMs = Date.now() - t1;
    await page.getByTestId('videogen-project-item').filter({ hasText: 'en couches' }).first().click();
    await expect(page.getByTestId('videogen-stages')).toContainText('carte du projet', { timeout: 60_000 });
    console.log(`PACKS import ${importMs} ms · réouverture ${reloadMs} ms · ${n} décors`);
    expect(errors).toEqual([]);
  });
});
