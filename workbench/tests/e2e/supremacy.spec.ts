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

test('Supremacy: a VALIDATED champion is selected BEFORE any premium model, shown in Champions, and the premium is never called', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await seedLog(page, seed());
  await enableAfterReload(page);
  mock.push({ text: 'La provision ECL du portefeuille corporate est calculée par stage.' });
  await send(page, 'Calcule la provision IFRS9 du portefeuille retail par stage');
  await expect(
    page.getByText('La provision ECL du portefeuille corporate est calculée par stage.'),
  ).toBeVisible();
  expect(mock.requests.length).toBe(1);
  expect(mock.requests[0]!.model).toBe(FREE);
  await expect(page.getByText('JEV Apprentice — FREE APPRENTICE SELECTED (VALIDATED)')).toBeVisible();
  await expect(page.getByText(/Validated Apprentice for/).first()).toBeVisible();
  await expect(page.getByText(/Premium reference: N\/A/).first()).toBeVisible();
  // Champions tab: evidence is displayed with the champion.
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await page.getByRole('tab', { name: 'Apprentice Champions' }).click();
  const t = page.getByTestId('champions-table');
  await expect(t).toContainText('data:ifrs9');
  await expect(t).toContainText(FREE);
  await expect(t).toContainText('VALIDATED');
  await expect(t).toContainText('N/A (aucune mission premium mesurée)');
  await expect(page.getByTestId('apprentice-matrix')).toContainText('VALIDATED');
  // The real mission is now in the log with its level, cache and champion flag.
  await page.getByRole('tab', { name: 'Apprentice Center' }).click();
  const live = page.getByTestId('apprentice-live');
  await expect(live).toContainText('LEVEL');
  await expect(live).toContainText('CHAMPION');
  await expect(live).toContainText('CACHE MISS');
  await expect(live).toContainText('WHY THIS MODEL?');
});

test('Supremacy: champion fails the gate → NAMED correction on the champion → alternative / V5, with APPRENTICE FAILED shown', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await seedLog(page, seed());
  await enableAfterReload(page);
  mock.push(
    { text: 'Voici : {agences: [Dakar' },
    { text: 'Voici : {encore: [Dakar' },
    { text: '{"agences": ["Dakar", "Thies"]}' },
  );
  await send(page, 'Réponds en JSON : la liste des agences IFRS9 Dakar et Thies');
  await expect(page.getByText('{"agences": ["Dakar", "Thies"]}')).toBeVisible();
  await expect(page.getByText(/APPRENTICE FAILED — STRUCTURED_OUTPUT_INVALID/).first()).toBeVisible();
  await expect(page.getByText(/Correction : FORMAT_REPAIR_V2/).first()).toBeVisible();
  // First retry stays on the champion (targeted correction), the next goes elsewhere: never the same attempt three times.
  expect(mock.requests[0]!.model).toBe(FREE);
  expect(mock.requests[1]!.model).toBe(FREE);
  expect(JSON.stringify(mock.requests[1]!.messages)).toContain('FORMAT_REPAIR_V2');
  expect(mock.requests[2]!.model).not.toBe(FREE);
});

test('Supremacy: demonstration is labelled SIMULATED TEST ONLY and walks the whole cycle', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await page.getByRole('tab', { name: /Démonstration/ }).click();
  await page.getByRole('button', { name: /Lancer la démonstration/ }).click();
  const steps = page.getByTestId('demo-steps');
  await expect(steps).toContainText('SIMULATED TEST ONLY');
  await expect(steps).toContainText('Promotion CHAMPION');
  await expect(steps).toContainText('Dégradation détectée');
  await expect(steps).toContainText('Revalidation');
  expect(mock.requests.length).toBe(0);
});

test('Supremacy: payback and learning graph show N/A without data (no fabricated savings)', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await page.getByRole('tab', { name: /Payback/ }).click();
  await expect(page.getByTestId('learning-payback')).toContainText('N/A');
  await expect(page.getByTestId('learning-graph')).toBeVisible();
  await page.getByRole('tab', { name: /Trace & Ladder/ }).click();
  await expect(page.getByTestId('ladder-levels')).toContainText('LEVEL 7 — FRONTIER MODEL');
});
