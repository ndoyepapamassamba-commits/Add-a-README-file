// REPRISE DES DONNÉES DE WORKBENCH — les pages file:// partagent la même origine (mesuré dans Chromium le 17/10/2026) :
// Studio Vidéo lit la base de Workbench au premier lancement et recopie les données du studio (clés « vs.* ») et les clés
// des moteurs vidéo dans SA base, sans rien modifier chez Workbench ; une donnée déjà présente ici n'est jamais écrasée.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '@workbench/tests/helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-studio-video.html');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

const ecrire = (page: Page, base: string, valeurs: Record<string, unknown>) =>
  page.evaluate(
    ({ base, valeurs }) =>
      new Promise<void>((res, rej) => {
        const r = indexedDB.open(base, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const t = r.result.transaction('kv', 'readwrite');
          for (const [k, v] of Object.entries(valeurs)) t.objectStore('kv').put(v, k);
          t.oncomplete = () => (r.result.close(), res());
        };
      }),
    { base, valeurs },
  );
const lire = (page: Page, base: string, cle: string) =>
  page.evaluate(
    ({ base, cle }) =>
      new Promise<unknown>((res) => {
        const r = indexedDB.open(base);
        r.onsuccess = () => {
          if (!r.result.objectStoreNames.contains('kv')) return res(undefined);
          const g = r.result.transaction('kv', 'readonly').objectStore('kv').get(cle);
          g.onsuccess = () => res(g.result);
        };
      }),
    { base, cle },
  );

test('premier lancement : projets du studio et clés vidéo repris de Workbench, Workbench intact, rien d’écrasé', async ({ page }) => {
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(FILE).href);
  // Le premier chargement fait déjà sa reprise (rien à reprendre) : on l'attend avant de poser l'état d'avant.
  await page.waitForFunction(() => localStorage.getItem('sv.reprise') !== null);
  // L'état de Workbench avant la séparation (même origine file://) et une donnée déjà présente dans Studio Vidéo.
  await ecrire(page, 'openrouter-workbench-direct', {
    'vs.projects': [{ id: 'p1', title: 'Le secret du gendre' }],
    'vs.actors': [{ id: 'a1', name: 'Modou' }],
    'vs.settings': { enabled: true, monthlyCap: 5 },
    settings: { theme: 'dark', pollinationsKey: 'sk_pollen_test', falKey: 'fal_test' },
    sessions: [{ id: 's1' }],
  });
  await ecrire(page, 'massamba-studio-video', { 'vs.settings': { enabled: true, monthlyCap: 9 } });
  await page.evaluate(() => localStorage.removeItem('sv.reprise'));
  await page.reload();
  await expect(page.getByText(/Repris de Workbench : 2 élément\(s\) du studio et 2 réglage\(s\) vidéo/)).toBeVisible({ timeout: 20_000 });
  expect(await lire(page, 'massamba-studio-video', 'vs.projects')).toEqual([{ id: 'p1', title: 'Le secret du gendre' }]);
  expect(await lire(page, 'massamba-studio-video', 'vs.actors')).toEqual([{ id: 'a1', name: 'Modou' }]);
  // Déjà présent ici : gardé tel quel. Les sessions de chat de Workbench ne sont pas recopiées.
  expect(await lire(page, 'massamba-studio-video', 'vs.settings')).toEqual({ enabled: true, monthlyCap: 9 });
  expect(await lire(page, 'massamba-studio-video', 'sessions')).toBeUndefined();
  // Workbench n'a pas été touché.
  expect(await lire(page, 'openrouter-workbench-direct', 'vs.projects')).toEqual([{ id: 'p1', title: 'Le secret du gendre' }]);
  // Les clés vidéo sont dans les Réglages de Studio Vidéo ; une seule reprise (pas de nouveau message au rechargement).
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-reprise');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByTestId('main-nav').getByRole('button', { name: 'Réglages', exact: true }).click();
  await expect(page.getByTestId('sv-pollinationsKey')).toHaveValue('sk_pollen_test');
  await expect(page.getByTestId('sv-falKey')).toHaveValue('fal_test');
  await page.reload();
  await expect(page.getByTestId('main-nav')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Repris de Workbench/)).toHaveCount(0);
});
