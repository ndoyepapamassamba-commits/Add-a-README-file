// FOURNISSEURS & COÛTS — de bout en bout dans l'app réelle (fichier HTML direct) : coffre de clés chiffré, appel direct
// Anthropic (simulé) et tableau de bord des coûts / TTFT. (Le bac à sable WebGL « Studio 3D » est parti avec la vidéo
// dans l'application Studio Vidéo, studio-video/tests/e2e/lab3d.spec.ts.)
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
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-keyvault');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
}
test('Coffre de clés chiffré + appel direct Anthropic (rotation, coût, TTFT)', async ({ page }) => {
  test.setTimeout(120_000);
  let sentKey = '';
  await page.route('https://api.anthropic.com/v1/models', (r) =>
    r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ id: 'claude-test-1' }] }),
    }),
  );
  await page.route('https://api.anthropic.com/v1/messages', async (r) => {
    sentKey = r.request().headers()['x-api-key'] ?? '';
    const ev = [
      { type: 'message_start', message: { usage: { input_tokens: 12 } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    ];
    await r.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/event-stream',
        'anthropic-ratelimit-requests-remaining': '42',
        'access-control-expose-headers': 'anthropic-ratelimit-requests-remaining',
      },
      body: ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    });
  });
  await open(page);
  await openView(page, 'Fournisseurs & coûts');
  await page.getByTestId('vault-password').fill('mot-de-passe-maitre-e2e');
  await page.getByTestId('vault-unlock').click();
  await page.getByTestId('vault-key').fill('sk-ant-e2e-SECRET-9876');
  await page.getByTestId('vault-add').click();
  await expect(page.getByTestId('vault-keys')).toContainText('sk-ant…9876');
  // Only ciphertext in the browser storage.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain('SECRET');
  await page.getByTestId('vault-models').click();
  await expect(page.getByTestId('vault-msg')).toContainText('1 modèle(s)');
  await page.getByTestId('vault-test').click();
  await expect(page.getByTestId('vault-msg')).toContainText('« OK »');
  expect(sentKey).toBe('sk-ant-e2e-SECRET-9876');
  await expect(page.getByTestId('vault-keys')).toContainText('42 req');
  await expect(page.getByTestId('finance-models')).toContainText('claude-test-1');
  // After a reload the vault is locked; a wrong password does not open it.
  await page.reload();
  await openView(page, 'Fournisseurs & coûts');
  await page.getByTestId('vault-password').fill('mauvais-mot-de-passe');
  await page.getByTestId('vault-unlock').click();
  await expect(page.getByText('Mot de passe incorrect.')).toBeVisible();
  await page.getByTestId('vault-password').fill('mot-de-passe-maitre-e2e');
  await page.getByTestId('vault-unlock').click();
  await expect(page.getByTestId('vault-keys')).toContainText('sk-ant…9876');
});
