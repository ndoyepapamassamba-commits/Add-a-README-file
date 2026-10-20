// STUDIO 3D — de bout en bout dans l'app Studio Vidéo construite (fichier HTML unique) : bac à sable WebGL, erreurs JS /
// GLSL renvoyées avec leur ligne, physique, export GLB, génération IA auto-corrigée (venu de Workbench le 16/10/2026).
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
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-lab3d');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByTestId('main-nav')).toBeVisible();
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

test('Génération IA: the broken first answer is corrected from the real error, two calls', async ({
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
  // Two real calls went out (the broken answer, then the corrected one).
  expect(mock.requests.length).toBeGreaterThanOrEqual(2);
});

