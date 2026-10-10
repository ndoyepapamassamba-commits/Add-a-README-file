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
  // The premium design gallery appears before every deliverable: these tests keep the default design.
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
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

const systemOf = (i: number) =>
  JSON.stringify((mock.requests[i]!.messages[0] as { content: unknown }).content);

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

async function enable(page: Page) {
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await page.getByRole('switch', { name: /Activer JEV Apprentice/ }).click();
  await expect(page.getByText('FREE-FIRST ✓ ACTIVE')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
}


/** Model lock OFF: lets the run switch models (escalation / free-first fallback), as the user can choose in Settings. */
async function unlockModel(page: Page) {
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.locator('[data-testid=pin-model] [role=switch]').click();
  await expect(page.locator('[data-testid=pin-model] [role=switch]')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
}

test('Apprentice: OFF by default (V5 routing untouched), tab shows N/A without data', async ({ page }) => {
  mock.models = CATALOG;
  await open(page);
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await expect(page.getByText(/FREE-FIRST OFF/)).toBeVisible();
  await expect(page.getByRole('switch', { name: /Activer JEV Apprentice/ })).not.toBeChecked();
  await expect(page.getByTestId('apprentice-live')).toContainText('Aucune mission');
  await page.getByRole('tab', { name: /Apprentice Benchmark/ }).click();
  await expect(page.getByTestId('apprentice-bench')).toContainText('INSUFFICIENT SAMPLE');
  await page.getByRole('tab', { name: /Coût réel/ }).click();
  await expect(page.getByTestId('apprentice-cost')).toContainText('TRUE TOTAL COST');
});

test('Apprentice: free-first runs on the FREE model, adapted by a capsule, accepted by the quality gate', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await enable(page);
  mock.push({ text: '{"agences": ["Dakar", "Thies"]}' });
  await send(page, 'Réponds en JSON : la liste des agences Dakar et Thies');
  await expect(page.getByText('{"agences": ["Dakar", "Thies"]}')).toBeVisible();
  expect(mock.requests.length).toBe(1);
  expect(mock.requests[0]!.model).toBe(FREE);
  expect(systemOf(0)).toContain('jev_capsule');
  expect(systemOf(0)).toContain('inference-time');
  await expect(page.getByText('JEV Apprentice — FREE-FIRST actif')).toBeVisible();
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  const live = page.getByTestId('apprentice-live');
  await expect(live).toContainText(FREE);
  await expect(live).toContainText('ACCEPTED');
  await expect(live).toContainText('JEV ADAPTATION');
});

test('Apprentice: free fails the quality gate → automatic fallback to the V5 model (no user choice)', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await unlockModel(page);
  await enable(page);
  // Unknown free model = LOW confidence: one free attempt, then V5.
  mock.push({ text: 'Voici : {agences: [Dakar' }, { text: '{"agences": ["Dakar", "Thies"]}' });
  await send(page, 'Réponds en JSON : la liste des agences Dakar et Thies');
  await expect(page.getByText('{"agences": ["Dakar", "Thies"]}')).toBeVisible();
  expect(mock.requests.length).toBe(2);
  expect(mock.requests[0]!.model).toBe(FREE);
  expect(mock.requests[1]!.model).not.toBe(FREE);
  expect(JSON.stringify(mock.requests[1]!.messages)).toMatch(/QUALITY GATE|JEV QA found precise problems/);
  await expect(page.getByText(/JEV Apprentice — routage V5/)).toBeVisible();
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  await page.getByRole('tab', { name: 'JEV APPRENTICE', exact: true }).click();
  await expect(page.getByTestId('apprentice-live')).toContainText('FALLBACK');
  await expect(page.getByTestId('apprentice-live')).toContainText('→');
  // The free model is credited with the FAILURE, not with V5's success.
  await page.getByRole('tab', { name: /Registre/ }).click();
  await expect(page.getByTestId('apprentice-profiles')).toContainText(FREE);
  await expect(page.getByTestId('apprentice-profiles')).toContainText('0 %');
});

test('Apprentice: CRITICAL task bypasses the free model (premium route), explained', async ({ page }) => {
  mock.models = CATALOG;
  await open(page);
  await enable(page);
  mock.push({ text: 'La conformité BCEAO impose des ratios prudentiels.' });
  await send(page, 'Explique la conformité BCEAO en une phrase');
  await expect(page.getByText('La conformité BCEAO impose des ratios prudentiels.')).toBeVisible();
  expect(mock.requests[0]!.model).not.toBe(FREE);
  await expect(page.getByText('JEV Apprentice — route gratuite non utilisée')).toBeVisible();
  await expect(page.getByText(/tâche CRITIQUE/)).toBeVisible();
});

test('Apprentice: confidential data never goes to a free provider with an unknown policy', async ({
  page,
}) => {
  mock.models = CATALOG;
  await open(page);
  await enable(page);
  mock.push({ text: 'ok' });
  await send(
    page,
    'Résume ce document strictement confidentiel : IBAN FR7630006000011234567890189, mot de passe admin: hunter2',
  );
  await expect(page.getByText('ok').first()).toBeVisible();
  expect(mock.requests.every((r) => r.model !== FREE)).toBe(true);
});
