// STUDIO 3D PRO + FOURNISSEURS & COÛTS — de bout en bout dans l'app réelle (fichier HTML direct) : bac à sable WebGL,
// erreurs JS / GLSL renvoyées avec leur ligne, physique, export GLB, génération IA auto-corrigée, coffre de clés chiffré,
// appel direct Anthropic (simulé) et tableau de bord des coûts / TTFT.
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
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-lab3d');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
}
const stats = (page: Page) => page.getByTestId('lab3d-stats');
const consoleText = (page: Page) => page.getByTestId('lab3d-console');

test('Studio 3D Pro: run, real JS / GLSL errors with their line, physics, GLB export', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await openView(page, 'Studio 3D');
  await expect(page.getByTestId('lab3d')).toBeVisible();
  // The example runs on its own: 120 meshes.
  await expect(stats(page)).toContainText('✓ 120 mesh', { timeout: 30_000 });

  // A JavaScript error comes back with its line in the user code.
  await page
    .getByTestId('lab3d-code')
    .fill('const a = 1;\nconst g = new THREE.Geometry();\nscene.add(new THREE.Mesh(g));');
  await page.getByTestId('lab3d-run').click();
  await expect(consoleText(page)).toContainText('ligne 2', { timeout: 15_000 });
  await expect(consoleText(page)).toContainText('THREE.Geometry is not a constructor');
  await expect(stats(page)).toContainText('✗');

  // GLSL: a compile error is reported by the WebGL compiler; the fixed shader renders.
  await page.getByTestId('lab3d-tab-shader').click();
  const frag = await page.getByTestId('lab3d-frag').inputValue();
  await page.getByTestId('lab3d-frag').fill(frag.replace('void main() {', 'void main() {\n  float bad = 1;'));
  await page.getByTestId('lab3d-shader-run').click();
  await expect(consoleText(page)).toContainText('FRAGMENT', { timeout: 15_000 });
  await page.getByTestId('lab3d-frag').fill(frag);
  await page.getByTestId('lab3d-shader-run').click();
  await expect(stats(page)).toContainText('✓ 1 mesh', { timeout: 15_000 });

  // Physics: 25 balls + a kinematic paddle on its trajectory.
  await page.getByTestId('lab3d-tab-physics').click();
  await page.getByTestId('lab3d-phys-run').click();
  await expect(stats(page)).toContainText('26 corps', { timeout: 15_000 });

  // GLB export (binary glTF: magic « glTF »).
  const dl = page.waitForEvent('download');
  await page.getByTestId('lab3d-glb').click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('scene.glb');
  const fs = await import('node:fs');
  const p = await file.path();
  expect(fs.readFileSync(p!).subarray(0, 4).toString()).toBe('glTF');
});

test('Génération IA: the broken first answer is corrected from the real error, the cost and TTFT are recorded', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  mock.push({
    text: '```js\nconst m = new THREE.Mesh(new THREE.CubeGeometry(1,1,1), new THREE.MeshStandardMaterial());\nscene.add(m);\n```',
  });
  mock.push({
    text: '```js\nconst m = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ color: "#f59e0b" }));\nscene.add(m);\nonFrame((dt) => { m.rotation.y += dt; });\n```',
  });
  await openView(page, 'Studio 3D');
  await page.getByTestId('lab3d-tab-ai').click();
  await page.getByTestId('lab3d-model').selectOption({ index: 1 });
  await page.getByTestId('lab3d-prompt').fill('un cube orange qui tourne');
  await page.getByTestId('lab3d-generate').click();
  await expect(page.getByTestId('lab3d-rounds')).toContainText('Tour 2', { timeout: 30_000 });
  await expect(page.getByTestId('lab3d-rounds')).toContainText('✓ rendu valide');
  await expect(consoleText(page)).toContainText('scène générée en 2 tour(s)');
  // The 2nd request carried the real error and the matching documentation card.
  const last = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(last).toContain('CubeGeometry is not a constructor');
  expect(last).toContain('DOCUMENTATION TECHNIQUE');
  // Telemetry: the two calls are in the finance dashboard with their TTFT.
  await openView(page, 'Fournisseurs & coûts');
  await expect(page.getByTestId('finance-models')).toContainText('openrouter');
  await expect(page.getByTestId('finance-Appels')).toHaveText(/^[2-9]/);
});

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
