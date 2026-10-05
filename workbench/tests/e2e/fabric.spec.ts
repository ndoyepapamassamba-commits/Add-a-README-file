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

test('Cognitive Super-Fabric: all tabs render, no fabricated data, non-regression PASS, security classifier, off by default', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('button', { name: 'JEV', exact: true }).first().click();
  const tabs = [
    'Mission cognitive',
    'Model Council',
    'Model Expertise',
    'Capability Fabric',
    'Skill Factory',
    'Skill Lab',
    'Experience Memory',
    'Failure Replay',
    'Distillation Lab',
    'Training Data',
    'Policy Engine',
    'Free Model Lab',
    'Security',
    'Health & Score',
    'Cognitive Benchmark',
  ];
  for (const t of tabs) {
    await page.getByRole('tab', { name: t, exact: true }).click();
    await expect(page.getByRole('tab', { name: t, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  // V5 tabs are still there.
  for (const t of [
    'Control Center',
    'Trace live',
    'JEV_LOG',
    'Validation scientifique',
    'Benchmark 2.0',
    'Régression',
  ])
    await expect(page.getByRole('tab', { name: t, exact: true })).toBeVisible();
  // Distillation: levels 6–7 are UNAVAILABLE, never claimed.
  await page.getByRole('tab', { name: 'Distillation Lab', exact: true }).click();
  await expect(page.getByTestId('levels')).toContainText('UNAVAILABLE');
  // Cognitive benchmark with no run: insufficient sample, nothing fabricated.
  await page.getByRole('tab', { name: 'Cognitive Benchmark', exact: true }).click();
  await expect(page.getByTestId('cfbench')).toContainText('ÉCHANTILLON INSUFFISANT');
  // Security classifier + secret scrubbing.
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await page.getByLabel('Texte à classifier').fill('clé sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789');
  await expect(page.getByTestId('classification')).toContainText('Secret détecté');
  // Policy: Fabric off by default.
  await page.getByRole('tab', { name: 'Policy Engine', exact: true }).click();
  await expect(page.getByRole('switch', { name: /Appliquer le Cognitive Fabric/ })).not.toBeChecked();
  // Non-regression.
  await page.getByRole('tab', { name: 'Régression', exact: true }).click();
  const box = page.getByTestId('fabric-regression');
  await expect(box).toContainText('FAIL 0');
  await expect(page.getByTestId('regression')).toBeVisible();
  expect(errors.filter((e) => !/favicon|net::ERR/.test(e))).toEqual([]);
});
