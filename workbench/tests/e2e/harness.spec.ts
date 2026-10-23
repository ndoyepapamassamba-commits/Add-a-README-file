// HARNESS (23/10/2026) — end to end from file://, OpenRouter replaced by the local mock: the skill pack installed next
// to the app (skills of every format, commands, agents), slash commands, permission rules, hooks, instruction files,
// free output formats, the agent's question card, REA in the browser, and the REAL local bridge (shell + REA) started
// as a separate process and paired from Réglages › Harness.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const PONT = path.join(ROOT, 'dist/mcp/massamba-pont.mjs');
// (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
const ADD_WASM = Buffer.from(
  '0061736d0100000001070160027f7f017f03020100070701036164640000' + '0a09010700200020016a0b',
  'hex',
);
let mock: MockOpenRouter;
let dir = '';
test.beforeAll(async () => {
  if (!fs.existsSync(APP)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-harness-'));
  fs.copyFileSync(APP, path.join(dir, 'app.html'));
  // A synthetic pack in the exact shape scripts/skills_pack.mjs writes (one part).
  const part = {
    version: 'test-1',
    part: 1,
    of: 1,
    files: ['massamba-skills.js'],
    skills: [
      {
        name: 'demo-skill',
        source: 'utilisateur',
        md: '# Démo\n\nSkill sans en-tête : compte les lignes des fichiers CSV.\n',
        files: { 'scripts/compte.py': 'print(sum(1 for _ in open("a.csv")))' },
        bin: { 'assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') },
        omitted: [],
      },
      {
        name: 'plug:outil',
        source: 'plugin',
        plugin: 'plug',
        md: '---\ndescription: Outil du plugin plug\n---\nCorps',
        files: {},
        bin: {},
      },
    ],
    commands: [
      {
        name: 'plug:bonjour',
        source: 'plugin',
        md: '---\ndescription: Saluer\nargument-hint: <nom>\n---\nDis bonjour à $ARGUMENTS en wolof.',
      },
    ],
    agents: [
      {
        name: 'plug:relecteur',
        source: 'plugin',
        md: '---\ndescription: Relit les textes\ntools:\n- Read\n---\nTu relis.',
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, 'massamba-skills.js'),
    `(window.MASSAMBA_SKILLS_PARTS=window.MASSAMBA_SKILLS_PARTS||[]).push(${JSON.stringify(part)});\n`,
  );
});
test.afterAll(async () => {
  await mock?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
test.beforeEach(() => mock.reset());
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function open(page: Page, url = pathToFileURL(path.join(dir, 'app.html')).href) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const res = await route.fetch({
      url: route.request().url().replace('https://openrouter.ai/api/v1', mock.url),
    });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.goto(url);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-harness-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Chat');
  await expect(page.locator('textarea')).toBeVisible();
  return errors;
}
const send = async (page: Page, text: string) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};
const autonomous = async (page: Page) => {
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
};
const sent = (i: number) => JSON.stringify(mock.requests[i]?.messages ?? []);

test('skill pack: every skill (files of any format), commands and agents installed; slash commands and skill.export work', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByText(/compétences de la session installées/)).toBeVisible({ timeout: 20_000 });
  // the pack's command and skills are in the slash menu
  await page.locator('textarea').fill('/plug:');
  await expect(page.getByTestId('slash-menu')).toContainText('/plug:bonjour');
  await expect(page.getByTestId('slash-menu')).toContainText('/plug:outil');
  await autonomous(page);
  mock.push({ text: 'Jamm nga am, Awa !' });
  await send(page, '/plug:bonjour Awa');
  await expect(page.getByText('Jamm nga am, Awa !')).toBeVisible({ timeout: 20_000 });
  expect(sent(0)).toContain('Dis bonjour à Awa en wolof.');
  // a skill without front matter got its description from its first paragraph; its files of every format are copied
  await send(page, '/skills compte');
  await expect(page.getByText(/demo-skill — Skill sans en-tête : compte les lignes/)).toBeAttached();
  mock.push(
    { toolCalls: [{ name: 'skill.export', args: { name: 'demo-skill' } }] },
    { text: 'Fichiers copiés.' },
  );
  await send(page, 'Copie les fichiers de la compétence demo-skill');
  await expect(page.getByText('Fichiers copiés.')).toBeVisible({ timeout: 20_000 });
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).toContain(
    'Copied 3 file(s) of demo-skill to skills/demo-skill/ (SKILL.md, 1 text, 1 binary)',
  );
  // the plugin agent is installed with its Claude tools mapped to the Workbench's
  await openView(page, 'Paramètres');
  await expect(page.getByTestId('harness-settings')).toContainText('paquet test-1');
  expect(errors).toEqual([]);
});

test("permission rules, hooks, instruction file, free formats and the agent's question run in the loop", async ({
  page,
}) => {
  const errors = await open(page);
  await openView(page, 'Paramètres');
  await page.getByTestId('harness-rules-deny').fill('filesystem.write(secret/**)');
  await page.getByTestId('harness-rules-save').click();
  // UserPromptSubmit: a context every request carries
  await page.getByTestId('harness-settings').locator('select').first().selectOption('UserPromptSubmit');
  await page.getByTestId('harness-settings').locator('select').nth(1).selectOption('context');
  await page.getByTestId('hook-body').fill('Toujours signer « — JEV ».');
  await page.getByTestId('hook-add').click();
  // PreToolUse: no file containing a forbidden word
  await page.getByTestId('harness-settings').locator('select').first().selectOption('PreToolUse');
  await page.getByTestId('hook-matcher').fill('Write');
  await page.getByTestId('hook-when').fill('interdit');
  await page.getByTestId('harness-settings').locator('select').nth(1).selectOption('deny');
  await page.getByTestId('hook-body').fill('mot interdit');
  await page.getByTestId('hook-add').click();
  await expect(page.getByTestId('harness-hooks')).toContainText('UserPromptSubmit');
  await expect(page.getByTestId('harness-hooks')).toContainText('PreToolUse');
  await openView(page, 'Chat');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'MASSAMBA.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Règle du projet : répondre en wolof.'),
    });
  await autonomous(page);
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'secret/a.txt', content: 'x' } }] },
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/ok.txt', content: 'un mot interdit' } }] },
    {
      toolCalls: [
        { name: 'user.ask', args: { question: 'Quel format voulez-vous ?', options: ['CSV', 'Markdown'] } },
      ],
    },
    { text: 'Travail fini — JEV' },
  );
  await send(page, 'Fais le travail demandé');
  await expect(page.getByTestId('question-card')).toContainText('Quel format voulez-vous ?');
  await page.getByTestId('question-option').filter({ hasText: 'Markdown' }).click();
  await expect(page.getByText('Travail fini — JEV')).toBeVisible({ timeout: 20_000 });
  const first = sent(0);
  expect(first).toContain('Output formats');
  expect(first).toContain('PROJECT INSTRUCTIONS');
  expect(first).toContain('répondre en wolof');
  expect(first).toContain('<hook-context>');
  expect(first).toContain('Toujours signer');
  expect(sent(1)).toContain('Denied by the permission rule « filesystem.write(secret/**) »');
  expect(sent(2)).toContain('Denied by a PreToolUse hook: mot interdit');
  expect(sent(3)).toContain('User answer: Markdown');
  await expect(page.getByTestId('question-done')).toContainText('Markdown');
  expect(errors).toEqual([]);
});

test('REA in the browser on a workspace file, then the REAL local bridge: shell and REA on the computer', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pont-'));
  fs.writeFileSync(
    path.join(ws, 'paquet.zip'),
    zipSync({
      'package.json': strToU8('{"name":"demo","version":"1.0.0"}'),
      'index.js': strToU8('export const x = 1;'),
    }),
  );
  const port = 7841;
  const env = { ...process.env, PATH: `/opt/node22/bin:${process.env.PATH ?? ''}` };
  const pont: ChildProcess = spawn(
    process.execPath,
    [PONT, ws, '--port', String(port), '--code', 'E2E-PONT-0001'],
    { env, stdio: 'ignore' },
  );
  try {
    const errors = await open(page);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'add.wasm', mimeType: 'application/wasm', buffer: ADD_WASM });
    await autonomous(page);
    mock.push(
      { toolCalls: [{ name: 'rea.inspect', args: { path: 'uploads/add.wasm' } }] },
      { text: 'Module analysé.' },
    );
    await send(page, 'Démonte ce module WebAssembly');
    await expect(page.getByText('Module analysé.')).toBeVisible({ timeout: 30_000 });
    expect(sent(1)).toContain('exports (1) : add (function)');
    expect(sent(1)).toMatch(/preuve ev_[a-f0-9]{64}/);
    // pairing the bridge from Réglages › Harness
    await openView(page, 'Paramètres');
    await page.getByTestId('bridge-manual').click();
    await page.getByTestId('bridge-code').fill('E2E-PONT-0001');
    await page.getByTestId('bridge-port').fill(String(port));
    await page.getByTestId('bridge-connect').click();
    await expect(page.getByTestId('bridge-status')).toContainText('poste — connecté · 6 outils', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('bridge-status')).toContainText('rea — connecté · 4 outils', {
      timeout: 120_000,
    });
    await openView(page, 'Chat');
    mock.reset();
    mock.push(
      { toolCalls: [{ name: 'mcp.poste.bash', args: { command: 'echo pont-ok && ls' } }] },
      { toolCalls: [{ name: 'mcp.rea.rea_inspect', args: { path: 'paquet.zip' } }] },
      { text: 'Pont vérifié.' },
    );
    await send(page, 'Vérifie le pont local');
    await expect(page.getByText('Pont vérifié.')).toBeVisible({ timeout: 120_000 });
    expect(sent(0)).toContain('REAL MACHINE through the local bridge');
    expect(sent(1)).toContain('pont-ok');
    expect(sent(1)).toContain('paquet.zip');
    expect(sent(2)).toMatch(/ev_[a-f0-9]{64}/);
    expect(sent(2)).toContain('paquet.zip');
    expect(errors).toEqual([]);
  } finally {
    pont.kill();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

// 23/10/2026 — « il y a énormément dans les réglages des champs vides » + capture « rea — Failed to fetch … (CORS) » avec
// un code d'appairage vide : le pont s'appaire SEUL (balise massamba-pont-code.js écrite à côté de l'app), la page servie
// par le pont s'appaire en même origine, et sans pont le diagnostic dit quoi faire au lieu d'un champ vide.
test('the local bridge pairs by itself: beacon next to the app, page served by the bridge, exact diagnosis', async ({
  page,
  context,
}) => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pont-auto-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pont-ws-'));
  fs.copyFileSync(APP, path.join(app, 'massamba-workbench-direct.html'));
  fs.copyFileSync(PONT, path.join(app, 'massamba-pont.mjs'));
  const port = 7843;
  // 1) no bridge yet: the diagnosis says how to start it; no empty code field is shown
  const errors = await open(page, pathToFileURL(path.join(app, 'massamba-workbench-direct.html')).href);
  await openView(page, 'Paramètres');
  await expect(page.getByTestId('bridge-diag')).toContainText('Pont non démarré', { timeout: 15_000 });
  await expect(page.getByTestId('bridge-diag')).toContainText('Lancer le pont');
  await expect(page.getByTestId('bridge-code')).toHaveCount(0);
  await expect(page.getByTestId('bridge-manual')).toBeVisible();
  const env = { ...process.env, PATH: `/opt/node22/bin:${process.env.PATH ?? ''}` };
  const pont: ChildProcess = spawn(
    process.execPath,
    [path.join(app, 'massamba-pont.mjs'), ws, '--port', String(port)],
    {
      env,
      stdio: 'ignore',
    },
  );
  try {
    // 2) the bridge starts: its beacon appears next to the app, « Réessayer » pairs without typing anything
    await expect
      .poll(() => fs.existsSync(path.join(app, 'massamba-pont-code.js')), { timeout: 15_000 })
      .toBe(true);
    await page.getByTestId('bridge-detect').click();
    await expect(page.getByTestId('bridge-status')).toContainText('poste — connecté · 6 outils', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('bridge-diag')).toContainText('Pont connecté');
    await expect(page.getByTestId('bridge-code')).not.toHaveValue('');
    await expect(page.getByTestId('bridge-port')).toHaveValue(String(port));
    // 3) next start of the app: paired at once, in the background
    await page.reload();
    await expect(page.getByText('Nouvelle mission')).toBeVisible();
    await openView(page, 'Paramètres');
    await expect(page.getByTestId('bridge-status')).toContainText('poste — connecté', { timeout: 30_000 });
    expect(errors).toEqual([]);
    // 4) plan B when the browser blocks file:// → 127.0.0.1: the app opened FROM the bridge pairs in the same origin
    const served = await context.newPage();
    const errors2 = await open(served, `http://127.0.0.1:${port}/`);
    expect(served.url()).toContain(`127.0.0.1:${port}/massamba-workbench-direct.html?pont`);
    await openView(served, 'Paramètres');
    await expect(served.getByTestId('bridge-status')).toContainText('poste — connecté · 6 outils', {
      timeout: 30_000,
    });
    expect(errors2).toEqual([]);
    // the code is never handed to another site, and the beacon file is never served
    const other = await fetch(`http://127.0.0.1:${port}/appairage`, {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(other.status).toBe(403);
    const beacon = await fetch(`http://127.0.0.1:${port}/massamba-pont-code.js`, {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(beacon.status).not.toBe(200);
  } finally {
    pont.kill();
  }
  // 5) the bridge stopped: the beacon says so (no code left on disk)
  await expect
    .poll(() => fs.readFileSync(path.join(app, 'massamba-pont-code.js'), 'utf8'), { timeout: 10_000 })
    .toContain('"running":false');
  expect(fs.readFileSync(path.join(app, 'massamba-pont-code.js'), 'utf8')).not.toContain('"code"');
  fs.rmSync(app, { recursive: true, force: true });
  fs.rmSync(ws, { recursive: true, force: true });
});
