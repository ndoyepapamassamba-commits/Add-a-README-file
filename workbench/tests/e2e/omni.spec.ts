// OMNIPOTENT V4.1 + JEV COGNITIVE OS — end-to-end from file://, OpenRouter replaced by the local mock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());
test.beforeEach(() => mock.reset());
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.locator('textarea')).toBeVisible();
  return errors;
}
const send = async (page: Page, text: string) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};

test('JEV Cognitive OS: 18 sub-tabs, regression report without FAIL, no fabricated figure on an empty log', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'JEV Cognitive OS', exact: true }).first().click();
  await expect(page.getByTestId('cognitive-os')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(18);
  await page.getByRole('tab', { name: 'Régression', exact: true }).click();
  await expect(page.getByTestId('cog-regression-table')).toBeVisible();
  await expect(page.getByTestId('cog-regression-table')).not.toContainText('FAIL');
  await page.getByRole('tab', { name: 'Empreintes', exact: true }).click();
  await expect(page.getByTestId('cog-fingerprints')).toContainText('NON MESURÉ');
  await page.getByRole('tab', { name: 'Super-benchmark', exact: true }).click();
  await expect(page.getByTestId('cog-superbench')).toContainText('200 tâches');
  expect(errors).toEqual([]);
});

test('OMNIPOTENT: a trivial request stays in the fast lane (one call, small output ceiling, trace shown)', async ({ page }) => {
  const errors = await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push({ text: 'Dakar est la capitale du Sénégal.' });
  await send(page, 'Quelle est la capitale du Sénégal ?');
  await expect(page.getByText('Dakar est la capitale du Sénégal.')).toBeVisible();
  expect(mock.requests.length).toBe(1);
  const max = Number(mock.requests[0]!.body.max_tokens ?? 0);
  expect(max).toBeGreaterThan(0);
  expect(max).toBeLessThanOrEqual(4000);
  await expect(page.getByText(/OMNIPOTENT — voie/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('OMNIPOTENT: an unrelated earlier mission is not sent to the model on a new topic (raw history kept)', async ({ page }) => {
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push({ text: '| Mois | Total |\n|---|---|\n| Janvier | 1 200 |\n\nTableau des impayés Dupont prêt.' });
  await send(page, 'Fais un tableau Excel des factures impayées du client Dupont avec les totaux par mois');
  await expect(page.getByText('Tableau des impayés Dupont prêt.')).toBeVisible();
  await expect(page.getByTitle('Interrompre')).toHaveCount(0);
  mock.push({ text: 'La photosynthèse transforme la lumière en énergie chimique.' });
  await send(page, 'Explique la photosynthèse en deux phrases');
  await expect(page.getByText('La photosynthèse transforme')).toBeVisible();
  const req = mock.requests.find((r) => JSON.stringify(r.messages).includes('photosynth'));
  expect(req).toBeTruthy();
  // The old exchange itself is not sent; only a one-line index of this chat's earlier requests (memory stays in the chat).
  const sent = JSON.stringify(req!.messages);
  expect(sent).not.toContain('Tableau des impayés Dupont prêt');
  expect(sent).toContain('CHAT_INDEX');
});

test('chat memory stays in the chat: a second chat never sees the first chat\'s files; vault and archive work', async ({ page }) => {
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  // Chat A writes a deliverable.
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'outputs/secret-chat-a.md', content: '# Rapport A\nConfidentiel A' } }] },
    { text: 'Rapport A écrit dans outputs/secret-chat-a.md, prêt à être relu et partagé.' },
  );
  await send(page, 'Écris le rapport A dans un fichier markdown');
  await expect(page.getByText(/Rapport A écrit/)).toBeVisible();
  // Keep it in the experience vault.
  await page.getByTestId('vault-save').last().click();
  await expect(page.getByTestId('vault-save').last()).toContainText('Dans le coffre');
  // Chat B lists the workspace: chat A's file must not exist for it.
  await page.getByRole('button', { name: /Nouvelle session/ }).click();
  mock.push({ toolCalls: [{ name: 'filesystem.list', args: {} }] }, { text: 'Espace vide.' });
  await send(page, 'Liste les fichiers de mon espace de travail');
  await expect(page.getByText('Espace vide.')).toBeVisible();
  const all = JSON.stringify(mock.requests.slice(-2).map((r) => r.messages));
  expect(all).not.toContain('secret-chat-a');
  expect(all).not.toContain('Confidentiel A');
  // Archive every chat, then find them under « Archives ».
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Tout archiver' }).click();
  await expect(page.getByText(/Archives \(2\)/)).toBeVisible();
  // The vault entry is listed in JEV Cognitive OS.
  await page.getByRole('button', { name: 'JEV Cognitive OS', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Coffre & leçons', exact: true }).click();
  await expect(page.getByTestId('vault-list')).toContainText('rapport A');
});

test('free web search: Tavily is called directly from the browser (no relay) and its raw results reach the model', async ({ page }) => {
  await open(page);
  let tavilyBody = '';
  await page.route('https://api.tavily.com/search', async (route) => {
    tavilyBody = route.request().postData() ?? '';
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ results: [{ title: 'Taux directeur BCEAO', url: 'https://www.bceao.int/fr/taux', content: 'Le taux directeur est fixé à 3,25 %.', published_date: '2026-09-15' }] }),
    });
  });
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push({ toolCalls: [{ name: 'web.search', args: { query: 'taux directeur BCEAO' } }] }, { text: 'Le taux directeur BCEAO est de 3,25 % (source : bceao.int).' });
  await send(page, 'Quel est le taux directeur actuel de la BCEAO ? cherche sur internet');
  await expect(page.getByText(/3,25 % \(source/)).toBeVisible({ timeout: 20_000 });
  expect(JSON.parse(tavilyBody)).toMatchObject({ query: 'taux directeur BCEAO' });
  const sent = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(sent).toContain('https://www.bceao.int/fr/taux');
  expect(sent).toContain('Tavily');
});

test('premium design gallery: before an Excel deliverable the user picks a design on thumbnails (+ Internet designs); the file uses it', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  await page.route('https://api.tavily.com/search', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ results: [], images: [{ url: 'https://example.com/design-1.png', description: 'dashboard' }, { url: 'https://example.com/design-2.png', description: 'kpi' }] }),
    }),
  );
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/ventes.csv', content: 'agence,montant\nDakar,1250\nThies,430\n' } }] },
    { toolCalls: [{ name: 'data.export', args: { path: 'data/ventes.csv', name: 'synthese-ventes', title: 'Ventes', format: 'xlsx' } }] },
    { text: 'Classeur prêt : outputs/synthese-ventes.xlsx' },
  );
  await send(page, 'Fais un classeur Excel des ventes par agence');
  const card = page.getByTestId('design-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('design-gallery').locator('img')).toHaveCount(14);
  // Designs found on the Internet, shown as thumbnails before validation
  await page.getByTestId('design-web').click();
  await expect(page.getByTestId('design-web-gallery').locator('img')).toHaveCount(2);
  await page.getByTestId('design-onyx').click();
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('Onyx');
  await expect(page.getByText('Classeur prêt')).toBeVisible({ timeout: 20_000 });
  // The exported workbook really uses the chosen design (onyx title band colour)
  const readXlsx = () => page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('kv', 'readonly').objectStore('kv').get('files');
          g.onsuccess = () => {
            const files = (g.result ?? {}) as Record<string, { data: string }>;
            const key = Object.keys(files).find((k) => k.endsWith('synthese-ventes.xlsx'));
            resolve(key ? files[key]!.data : '');
          };
        };
      }),
  );
  await expect.poll(async () => (await readXlsx()).length, { timeout: 10_000 }).toBeGreaterThan(100);
  const styles = await readXlsx();
  const { unzipSync, strFromU8 } = await import('fflate');
  const zip = unzipSync(new Uint8Array(Buffer.from(styles, 'base64')));
  const xml = Object.entries(zip).filter(([k]) => /styles|sheet1/.test(k)).map(([, v]) => strFromU8(v)).join('');
  expect(xml).toContain('0B0B0F');
  expect(xml).not.toContain('001B4D');
});
