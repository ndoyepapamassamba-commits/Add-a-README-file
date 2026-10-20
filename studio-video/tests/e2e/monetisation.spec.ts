// MONÉTISATION ET PUBLICATION — de bout en bout dans l'app construite (18/10/2026) : la rubrique Monétisation montre les
// programmes des quatre plateformes, importe un bilan (sans jeton), refuse un bilan qui contient un jeton, note les
// revenus ; l'écran du moteur de la troupe montre la chaîne de publication TikTok et les règles de viralité.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '@workbench/tests/helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-studio-video.html');
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
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-monetisation');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByTestId('main-nav')).toBeVisible();
}

test('Monétisation : programmes, bilan importé (sans jeton), revenus ; publication TikTok dans le moteur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await openView(page, 'Monétisation');
  const m = page.getByTestId('monetisation');
  await expect(m).toBeVisible();
  for (const p of ['tiktok', 'youtube', 'facebook', 'instagram']) await expect(page.getByTestId(`programme-${p}`)).toBeVisible();
  await expect(page.getByTestId('programme-tiktok')).toContainText('non connecté');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilan-'));
  const mauvais = path.join(dir, 'mauvais.json');
  fs.writeFileSync(mauvais, JSON.stringify({ date: '2026-10-18', plateformes: {}, access_token: 'x' }));
  await page.getByTestId('import-bilan').setInputFiles(mauvais);
  await expect(m).toContainText('jetons');
  const bon = path.join(dir, 'bilan.json');
  fs.writeFileSync(bon, JSON.stringify({ date: '2026-10-18', plateformes: { tiktok: { connecte: true, abonnes: 12000, vues_30j: 50000 } } }));
  await page.getByTestId('import-bilan').setInputFiles(bon);
  await expect(m).toContainText('du 2026-10-18');
  await expect(page.getByTestId('programme-tiktok')).toContainText('compte connecté');
  await expect(page.getByTestId('programme-tiktok')).toContainText('12 000');

  const rev = page.getByTestId('revenus');
  await rev.locator('input[type="number"]').fill('12.5');
  await rev.getByRole('button', { name: 'Ajouter' }).click();
  await expect(rev).toContainText('tiktok EUR');

  await openView(page, 'Moteur de la troupe');
  await expect(page.getByTestId('publication-tiktok')).toContainText('Compte');
  await expect(page.getByTestId('moteur-troupe')).toContainText('publie_tiktok.py connecte');
  expect(errors).toEqual([]);
});
