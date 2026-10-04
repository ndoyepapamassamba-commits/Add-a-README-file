// End-to-end: the production build (server + single-file HTML client) driven by
// a real browser, against a mock OpenRouter. Requires `npm run build` first.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOKEN = 'e2e-token-0123456789abcdefghij';
let mock: MockOpenRouter;
let server: ChildProcess;
let base = '';
let tmp = '';
let logs = '';

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(ROOT, 'dist/server/index.js')))
    throw new Error('Run `npm run build` before the e2e tests');
  mock = await startMockOpenRouter();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-e2e-'));
  fs.mkdirSync(path.join(tmp, 'workspace/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'workspace/demo/index.html'),
    '<!doctype html><title>Demo</title><h1>Bonjour</h1>\n',
  );
  const port = await freePort();
  const previewPort = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'dist/server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      PREVIEW_PORT: String(previewPort),
      WORKBENCH_AUTH_TOKEN: TOKEN,
      OPENROUTER_API_KEY: 'sk-or-v1-mock-e2e',
      OPENROUTER_BASE_URL: mock.url,
      WORKSPACE_ROOT: path.join(tmp, 'workspace'),
      DATA_DIR: path.join(tmp, 'data'),
      INCLUDE_CLAUDE_SKILLS: 'false',
      TYPESAFE_API_KEY: '',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (d: Buffer) => (logs += d.toString()));
  server.stderr!.on('data', (d: Buffer) => (logs += d.toString()));
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 150) throw new Error(`server did not start:\n${logs}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  await api('PUT', '/api/settings', { jev: { enabled: false }, defaultModel: 'mock/smart-2' });
});

test.afterAll(async () => {
  server?.kill('SIGTERM');
  await mock?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test.beforeEach(() => mock.reset());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openSession(page: Page, permissionMode: 'safe' | 'normal' | 'autonomous' = 'normal') {
  const s = await api('POST', '/api/sessions', { projectId: 'demo', model: 'mock/smart-2', permissionMode });
  await page.goto(`${base}/#token=${TOKEN}`);
  await page.waitForSelector('textarea');
  await page.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem('wb.ui') || '{}');
    raw.sessionId = id;
    localStorage.setItem('wb.ui', JSON.stringify(raw));
  }, s.id);
  await page.reload();
  await page.waitForSelector('textarea');
  return s.id as string;
}

test('rejects a wrong token and connects with the right one', async ({ page }) => {
  await page.goto(`${base}/`);
  await page.getByPlaceholder('Collez le jeton').fill('mauvais-jeton');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/jeton|token|401|Unauthorized/i).first()).toBeVisible();
  await page.getByPlaceholder('Collez le jeton').fill(TOKEN);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('textarea')).toBeVisible();
  // The access token is never placed in the URL after pairing.
  expect(page.url()).not.toContain(TOKEN);
});

test('chat streams the answer and shows cost and credits', async ({ page }) => {
  const errors = watchErrors(page);
  await openSession(page);
  mock.push({
    text: 'Bonjour depuis le **faux** OpenRouter !',
    usage: { prompt_tokens: 2000, completion_tokens: 40, cost: 0.0123 },
  });
  await page.locator('textarea').fill('Dis bonjour');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Bonjour depuis le')).toBeVisible();
  await expect(page.locator('strong', { hasText: 'faux' })).toBeVisible();
  await expect(page.getByText(/\$0[.,]012/).first()).toBeVisible();
  expect(mock.requests[0]!.model).toBe('mock/smart-2');
  expect(errors).toEqual([]);
});

test('approval card: the agent writes a file only after "Oui"', async ({ page }) => {
  await openSession(page, 'normal');
  mock.push(
    {
      toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/e2e.txt', content: 'bonjour Dakar\n' } }],
    },
    { text: 'Fichier notes/e2e.txt créé.' },
  );
  await page.locator('textarea').fill('Crée notes/e2e.txt');
  await page.keyboard.press('Enter');
  const yes = page.getByRole('button', { name: /^1 Oui$/ });
  await expect(yes).toBeVisible();
  expect(fs.existsSync(path.join(tmp, 'workspace/demo/notes/e2e.txt'))).toBe(false);
  await yes.click();
  await expect(page.getByText('Fichier notes/e2e.txt créé.')).toBeVisible();
  expect(fs.readFileSync(path.join(tmp, 'workspace/demo/notes/e2e.txt'), 'utf8')).toBe('bonjour Dakar\n');
});

test('plan mode: the plan card can be approved', async ({ page }) => {
  await openSession(page, 'autonomous');
  mock.push(
    {
      toolCalls: [
        {
          name: 'plan.propose',
          args: { summary: 'Créer un README', steps: ['Analyser le projet', 'Rédiger README.md'] },
        },
      ],
    },
    { text: 'Plan exécuté.' },
  );
  await page.getByTitle(/Mode Plan/).click();
  await page.locator('textarea').fill('Prépare un README');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Plan proposé')).toBeVisible();
  await expect(page.getByText('Rédiger README.md')).toBeVisible();
  await page
    .getByRole('button', { name: /Approuver/ })
    .first()
    .click();
  await expect(page.getByText('Plan exécuté.')).toBeVisible();
  expect(mock.requests[0]!.body.tools).toBeTruthy();
  await page.getByTitle(/Mode Plan/).click(); // back to chat mode for the next tests
});

test('command palette opens views; the code editor loads Monaco', async ({ page }) => {
  const errors = watchErrors(page);
  await openSession(page);
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('Commande, vue, fichier, modèle…');
  await expect(input).toBeVisible();
  await input.fill('Code');
  await expect(page.locator('[cmdk-item][data-selected="true"]')).toHaveText(/^Code/);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'index.html' }).first().click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Bonjour', { timeout: 30_000 });
  expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
});

test('every main view renders without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openSession(page);
  for (const view of [
    'Code',
    'Terminal',
    'Navigateur',
    'Données',
    'Agents',
    'Skills',
    'Plugins',
    'Tâches',
    'Modèles',
    'Réglages',
    'Projets',
    'Chat',
  ]) {
    await page.getByRole('button', { name: view, exact: true }).first().click();
    await page.waitForTimeout(250);
  }
  expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
});

test('the standalone HTML file works when opened from disk', async ({ page }) => {
  const file = path.join(ROOT, 'dist/openrouter-workbench.html');
  test.skip(!fs.existsSync(file), 'standalone file not built');
  await page.goto(pathToFileURL(file).href);
  await page.locator('input').first().fill(base);
  await page.getByPlaceholder('Collez le jeton').fill(TOKEN);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('textarea')).toBeVisible();
  mock.push({ text: 'Réponse via le fichier HTML local.' });
  await page.locator('textarea').fill('test');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Réponse via le fichier HTML local.')).toBeVisible();
});
