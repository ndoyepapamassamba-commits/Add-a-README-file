// End-to-end tests of the serverless edition (dist/massamba-workbench-direct.html),
// opened from disk; OpenRouter calls are routed to a local mock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
let tmp = '';

test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:web` before the e2e tests');
  mock = await startMockOpenRouter();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-direct-'));
});
test.afterAll(async () => {
  await mock?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
test.beforeEach(() => mock.reset());
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function open(page: Page, errors: string[] = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-direct-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  // Lands on Mission Control; most tests work in the chat.
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.locator('textarea')).toBeVisible();
  // Explicit model so requests are predictable.
  await page.evaluate(() => undefined);
  return errors;
}
async function send(page: Page, text: string) {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
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
const FREE = 'acme/free-gemma:free';
const PAID = 'acme/paid-pro';
const CATALOG = [
  model(FREE, '0', '0'),
  model(PAID, '0.000003', '0.000015'),
  model('acme/other-paid', '0.000001', '0.000002'),
];

import { entry, many } from '../helpers/logEntry';
import type { ApprenticeTag } from '../../server/jev/apprentice/types';

const TEXTS = [
  'Calcule la provision ECL IFRS9 du portefeuille corporate',
  'Analyse la migration Stage 1 vers Stage 2 des expositions',
  'Quel est le taux de couverture IFRS9 par segment',
  'Réconcilie les provisions IFRS9 avec le grand livre',
  'Prépare le tableau des expositions Stage 3 et perte attendue',
];
const tag = (family: string, model: string): ApprenticeTag => ({
  active: true,
  adapted: true,
  family,
  path: [model],
  threshold: 0.9,
  gateScore: 0.95,
  accepted: true,
  adaptationMs: 5,
  tokensAdded: 300,
  skills: [],
  experiences: 0,
  toolsExposed: 5,
  contextReduction: null,
  predictedSuccess: 0.9,
  confidence: 'HIGH',
  why: [],
});
/** A real-shaped JEV_LOG with a validated apprentice (12 missions, 5 formulations, 100 % success, quality 96). */
const seed = () =>
  many(12, (i) =>
    entry({
      model: FREE,
      ok: true,
      quality: 96,
      cost: 0,
      at: Date.now() - (14 - i) * 3_600_000,
      instruction: TEXTS[i % 5],
      mission: TEXTS[i % 5],
      apprentice: tag('data:ifrs9', FREE),
    }),
  );

async function seedLog(page: Page, log: unknown[]) {
  await page.evaluate(
    (l) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(l, 'jevLog');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    log,
  );
}
async function enableAfterReload(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await page.getByRole('switch', { name: /Activer JEV Apprentice/ }).click();
  await expect(page.getByText('FREE-FIRST ✓ ACTIVE')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
}

async function openLab(page: Page) {
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'CHAMPION SCIENCE LAB', exact: true }).click();
  await expect(page.getByTestId('champion-science')).toBeVisible();
}
const readKv = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('kv', 'readonly').objectStore('kv').get(k);
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => reject(g.error);
        };
        req.onerror = () => reject(req.error);
      }),
    key,
  );

test('Champion Science: empty lab shows no champion and no fabricated figure; the 18-step scenario is SIMULATED and never injected', async ({
  page,
}) => {
  mock.models = CATALOG;
  const errors = await open(page);
  await openLab(page);
  for (const k of [
    'Active Champions',
    'Challengers',
    'Promotions',
    'Rollbacks',
    'Teacher ROI',
    'Statistical Confidence',
  ])
    await expect(page.getByTestId('champion-kpis')).toContainText(k);
  await expect(page.getByTestId('champion-overview')).toContainText('Aucun champion');
  await expect(page.getByTestId('kpi-active-champions')).toHaveText('0');
  await expect(page.getByTestId('kpi-teacher-roi')).toHaveText('NON MESURÉ');
  // every sub-tab renders
  for (const t of [
    'Expériences',
    'Expertise (cube)',
    'Graphiques scientifiques',
    'Teacher & coût',
    'Échecs & découverte',
    'Historiques',
    'Seuils',
  ])
    await page.getByRole('tab', { name: t, exact: true }).click();
  await page.getByRole('tab', { name: 'Graphiques scientifiques' }).click();
  await expect(page.getByTestId('champion-charts')).toContainText('INSUFFICIENT SAMPLE');
  // scenario
  await page.getByRole('tab', { name: 'Scénario IFRS9 (simulé)' }).click();
  await page.getByRole('button', { name: /Lancer le scénario/ }).click();
  const steps = page.getByTestId('scenario-steps').locator('li');
  await expect(steps).toHaveCount(18);
  await expect(page.getByTestId('champion-scenario')).toContainText('SIMULATED TEST ONLY');
  await expect(page.getByTestId('champion-scenario')).toContainText('ROLLBACK');
  // the simulation changed nothing real
  await page.getByRole('tab', { name: 'Vue d’ensemble' }).click();
  await expect(page.getByTestId('champion-overview')).toContainText('Aucun champion');
  expect(((await readKv(page, 'jevLog')) as unknown[] | undefined)?.length ?? 0).toBe(0);
  expect(errors.filter((e) => !/Failed to load resource|net::/.test(e))).toEqual([]);
});

test('Champion Science: after a real mission the lab crowns the measured champion, persists it across reload and Apprentice OFF leaves the lab untouched', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  const log = many(30, (i) =>
    entry({
      model: FREE,
      ok: true,
      quality: 96,
      cost: 0,
      at: Date.now() - (40 - i) * 3_600_000,
      instruction: TEXTS[i % 5],
      mission: TEXTS[i % 5],
      apprentice: tag('data:ifrs9', FREE),
    }),
  );
  await seedLog(page, log);
  // OFF: nothing is written to the lab.
  await page.reload();
  await openLab(page);
  await expect(page.getByTestId('champion-overview')).toContainText('Aucun champion');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push({ text: 'Réponse hors apprenti.' });
  await send(page, 'Calcule la provision IFRS9 du portefeuille retail par stage');
  await expect(page.getByText('Réponse hors apprenti.')).toBeVisible();
  await expect
    .poll(async () => ((await readKv(page, 'fabric')) as { lab?: unknown } | undefined)?.lab)
    .toBeUndefined();
  // ON: the next real mission runs the lab.
  await enableAfterReload(page);
  mock.push({ text: 'La provision ECL est calculée par stage.' });
  await send(page, 'Calcule la provision IFRS9 du portefeuille retail par stage');
  await expect(page.getByText('La provision ECL est calculée par stage.')).toBeVisible();
  await openLab(page);
  await expect(page.getByTestId('champion-table')).toContainText(FREE);
  await expect(page.getByTestId('champion-table')).toContainText('data:ifrs9');
  // one champion per key: family × risk, and family × risk × contract once a contract has enough runs
  await expect(page.getByTestId('kpi-active-champions')).not.toHaveText('0');
  // persistence
  await expect
    .poll(
      async () =>
        Object.keys(((await readKv(page, 'fabric')) as { lab?: { families: object } })?.lab?.families ?? {})
          .length,
    )
    .toBeGreaterThan(0);
  await page.reload();
  await openLab(page);
  await expect(page.getByTestId('champion-table')).toContainText(FREE);
  // the mission carries the real lab checkpoints
  const stored = (await readKv(page, 'jevLog')) as { checkpoints: { name: string }[] }[];
  expect(stored.at(-1)!.checkpoints.map((c) => c.name)).toContain('CHAMPION_DECISION');
  // the champion is also visible in the cube and the thresholds are editable
  await page.getByRole('tab', { name: 'Expertise (cube)' }).click();
  await expect(page.getByTestId('champion-cube')).toContainText('CHAMPION');
  await page.getByRole('tab', { name: 'Seuils' }).click();
  await expect(page.getByTestId('champion-thresholds')).toContainText('Marge qualité');
});
