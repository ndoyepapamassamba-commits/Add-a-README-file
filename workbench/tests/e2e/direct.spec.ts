// End-to-end tests of the serverless edition (dist/openrouter-workbench-direct.html),
// opened from disk; OpenRouter calls are routed to a local mock.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/openrouter-workbench-direct.html');
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

test('onboarding, streaming chat, real cost and credits gauge', async ({ page }) => {
  const errors = await open(page);
  // The key is validated against /key and never put in the page URL.
  expect(page.url()).not.toContain('sk-or');
  mock.push({
    text: 'Bonjour depuis **OpenRouter** en accès direct.',
    usage: { prompt_tokens: 1500, completion_tokens: 20, cost: 0.0042 },
  });
  await send(page, 'Bonjour');
  await expect(page.getByText('en accès direct.')).toBeVisible();
  await expect(page.getByText('$0.0042').first()).toBeVisible();
  await expect(page.getByText('$9.50').first()).toBeVisible(); // key limit remaining from /key
  const req = mock.requests[0]!;
  expect(req.body).toMatchObject({ stream: true, usage: { include: true } });
  expect((req.tools ?? []).length).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('uploads a CSV and the agent analyses it with data tools', async ({ page }) => {
  await open(page);
  const csv = path.join(tmp, 'ventes.csv');
  fs.writeFileSync(csv, 'mois,montant\n2026-01-05,10\n2026-02-03,30\n2026-02-20,5\n');
  await page.locator('input[type=file]').first().setInputFiles(csv);
  await expect(page.getByText('ventes.csv').first()).toBeVisible();
  mock.push(
    {
      toolCalls: [
        {
          name: 'data.query',
          args: {
            path: 'uploads/ventes.csv',
            groupBy: [{ column: 'mois', bucket: 'month' }],
            aggregations: [{ column: 'montant', fn: 'sum', as: 'total' }],
          },
        },
      ],
    },
    { text: 'Février : 35.' },
  );
  await send(page, 'Total par mois ?');
  await expect(page.getByText('Février : 35.')).toBeVisible();
  // The attachment profile went into the user turn, and the exact tool result back to the model.
  expect(JSON.stringify(mock.requests[0]!.messages)).toContain('Rows: 3');
  expect(JSON.stringify(mock.requests[1]!.messages)).toContain('| 2026-02 | 35 |');
});

test('NORMAL mode asks before writing; the file appears in the workspace', async ({ page }) => {
  await open(page);
  mock.push(
    {
      toolCalls: [
        { name: 'filesystem.write', args: { path: 'notes/hello.md', content: '# Bonjour Dakar\n' } },
      ],
    },
    { text: 'Fichier créé.' },
  );
  await send(page, 'Crée notes/hello.md');
  const yes = page.getByRole('button', { name: /^1 Oui$/ });
  await expect(yes).toBeVisible();
  await yes.click();
  await expect(page.getByText('Fichier créé.')).toBeVisible();
  await page.getByRole('button', { name: 'Fichiers' }).click();
  await page.getByRole('button', { name: /notes\/hello\.md/ }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Dakar' })).toBeVisible();
});

test('code.run executes JavaScript in the sandbox', async ({ page }) => {
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'code.run',
          args: {
            language: 'javascript',
            code: 'console.log("somme", [1,2,3].reduce((a,b)=>a+b)); writeFile("out/r.txt", "42"); return typeof localStorage;',
          },
        },
      ],
    },
    { text: 'Calcul fait.' },
  );
  await send(page, 'Calcule');
  await expect(page.getByText('Calcul fait.')).toBeVisible();
  const toolResult = JSON.stringify(mock.requests[1]!.messages);
  expect(toolResult).toContain('somme 6');
  expect(toolResult).toContain('Saved files: out/r.txt');
  // The sandbox has no access to the page's storage (opaque origin): accessing it throws.
  expect(toolResult).not.toContain('→ object');
});

test('plan mode: plan card, edit and approve', async ({ page }) => {
  await open(page);
  await page.getByTitle(/Mode Plan/).click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'plan.propose',
          args: { summary: 'Créer un rapport', steps: ['Lire les fichiers', 'Rédiger'] },
        },
      ],
    },
    { text: 'Plan exécuté.' },
  );
  await send(page, 'Prépare un rapport');
  await expect(page.getByText('Plan proposé', { exact: true })).toBeVisible();
  const planTools = (mock.requests[0]!.tools as { function: { name: string } }[]).map((t) => t.function.name);
  expect(planTools).toContain('plan__propose');
  expect(planTools).not.toContain('filesystem__write');
  await page.getByRole('button', { name: /Approuver et exécuter/ }).click();
  await expect(page.getByText('Plan exécuté.')).toBeVisible();
  expect(JSON.stringify(mock.requests[1]!.messages)).toContain('2. Rédiger');
});

test('imported skills are enforced; custom agents restrict tools', async ({ page }) => {
  await open(page);
  const skill = path.join(tmp, 'SKILL.md');
  fs.writeFileSync(
    skill,
    '---\nname: rapport-risque\ndescription: Rapports de risque. Se déclenche avec "rapport de risque", "IFRS9".\n---\nRÈGLE-42 : terminer par une section Recommandations.\n',
  );
  await page.getByRole('button', { name: 'Skills' }).click();
  await page.locator('input[type=file]').setInputFiles(skill);
  await expect(page.getByText('rapport-risque').first()).toBeVisible();
  await page.getByRole('button', { name: 'Chat' }).click();
  mock.push({ text: 'Rapport…\n\n## Recommandations' });
  await send(page, 'Fais un rapport de risque IFRS9');
  await expect(page.getByText('Skills appliqués : rapport-risque')).toBeVisible();
  expect(systemOf(0)).toContain('RÈGLE-42');
  expect(systemOf(0)).toContain('MANDATORY');

  const agent = path.join(tmp, 'lecteur.md');
  fs.writeFileSync(
    agent,
    '---\nname: Lecteur\ndescription: Lit seulement\ntools: Read, Grep\n---\nCONSIGNE-AGENT-7',
  );
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.locator('input[type=file]').setInputFiles(agent);
  await expect(page.getByText('Lecteur').first()).toBeVisible();
  await page.getByRole('button', { name: 'Chat' }).click();
  await page.getByTitle('Agent', { exact: true }).click();
  await page.getByText('Lecteur', { exact: true }).last().click();
  mock.push({ text: 'Lecture seule.' });
  await send(page, 'Lis les fichiers');
  await expect(page.getByText('Lecture seule.')).toBeVisible();
  const last = mock.requests.at(-1)!;
  const offered = (last.tools as { function: { name: string } }[]).map((t) => t.function.name);
  expect(offered).toContain('filesystem__read');
  expect(offered).not.toContain('filesystem__write');
  expect(JSON.stringify(last.messages[0])).toContain('CONSIGNE-AGENT-7');
});

test('all views render without errors and data survives a reload', async ({ page }) => {
  const errors = await open(page);
  mock.push({ text: 'Mémorisé.' });
  await send(page, 'Retiens ceci');
  await expect(page.getByText('Mémorisé.')).toBeVisible();
  for (const v of ['Fichiers', 'Données', 'Agents', 'Skills', 'Plugins', 'Modèles', 'Réglages', 'Chat']) {
    await page.getByRole('button', { name: v, exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600); // debounced IndexedDB save
  await page.reload();
  await expect(page.getByText('Mémorisé.')).toBeVisible();
  expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
});
