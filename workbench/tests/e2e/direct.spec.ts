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
  for (const v of [
    'Mission Control',
    'Fichiers',
    'Données',
    'Terminal',
    'Navigateur',
    'Workflows',
    'Agents',
    'Skills',
    'Plugins',
    'Modèles',
    'Réglages',
    'Chat',
  ]) {
    await page.getByRole('button', { name: v, exact: true }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(600); // debounced IndexedDB save
  await page.reload();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByText('Mémorisé.')).toBeVisible();
  expect(errors.filter((e) => !/ResizeObserver/.test(e))).toEqual([]);
});

test('mission mode: pipeline, correction round, final review, verdict and .ai memory', async ({ page }) => {
  await open(page);
  await page.getByTitle(/Mode Mission/).click();
  mock.push(
    {
      toolCalls: [
        { name: 'mission.stage', args: { stage: 'analyse' } },
        { name: 'filesystem.write', args: { path: 'app.js', content: 'console.log(1)' } },
      ],
    },
    {
      toolCalls: [
        {
          name: 'mission.report',
          args: {
            status: 'FAILED',
            summary: 'test KO',
            checks: [{ name: 'exécution', status: 'fail' }],
            issues: ['bug'],
          },
        },
      ],
    },
    {
      toolCalls: [
        { name: 'mission.stage', args: { stage: 'correction' } },
        { name: 'filesystem.write', args: { path: 'app.js', content: 'console.log(2)' } },
      ],
    },
    {
      toolCalls: [
        {
          name: 'mission.report',
          args: {
            status: 'PASSED',
            summary: 'Application livrée et vérifiée',
            checks: [{ name: 'exécution', status: 'pass' }],
            deliverables: ['app.js'],
          },
        },
      ],
    },
    { text: 'VERDICT: APPROVED' },
  );
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  await send(page, 'Construis une petite app');
  await expect(page.getByText('Revue finale : approuvée')).toBeVisible();
  await expect(page.getByText('Livraison').first()).toBeVisible();
  await expect(page.getByText('PASSED').first()).toBeVisible();
  expect(systemOf(0)).toContain('MISSION MODE');
  expect(JSON.stringify(mock.requests[2]!.messages)).toContain('Correction round 2');
  // Final reviewer ran as an independent sub-agent.
  expect(systemOf(4)).toContain('Final Reviewer');
  // Mission Control shows the session; .ai/ memory was updated.
  await page.getByRole('button', { name: 'Fichiers' }).click();
  await page.getByRole('button', { name: /\.ai\/CHANGELOG\.md/ }).click();
  await expect(page.getByText(/PASSED — Construis une petite app/)).toBeVisible();
  await page.getByRole('button', { name: 'Mission Control' }).click();
  await expect(page.getByText('Construis une petite app').first()).toBeVisible();
});

test('Mission Control launches a mission and workflows run in one click', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Mission Control' }).click();
  mock.fallback = () => ({
    toolCalls: [{ name: 'mission.report', args: { status: 'PARTIAL', summary: 'partiel', checks: [] } }],
  });
  await page.getByPlaceholder(/Construis cette application/).fill('Recherche les tendances IA');
  await page.getByRole('button', { name: /Lancer la mission/ }).click();
  await expect(page.getByText('PARTIAL').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await expect(page.getByText('Analyse de données complète')).toBeVisible();
  await page
    .getByRole('button', { name: /Lancer/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Lancer la mission/ }).click();
  await expect(page.getByText('Workflow « Analyse de données complète »').first()).toBeVisible();
});

test('sessions can be renamed', async ({ page }) => {
  await open(page);
  mock.push({ text: 'ok' });
  await send(page, 'Premier message');
  await expect(page.getByText('ok', { exact: true })).toBeVisible();
  // Double-click the title in the session header (the list also has a pencil on hover).
  await page.getByTitle('Double-cliquez pour renommer').first().dblclick();
  const input = page.getByLabel('Nouveau titre');
  await input.fill('Mon projet Dakar');
  await input.press('Enter');
  await expect(page.getByText('Mon projet Dakar').first()).toBeVisible();
});

test('APEX Studio: guide → build an offline house app → QA in an isolated frame', async ({ page }) => {
  const built = fs.readFileSync(FILE, 'utf8');
  test.skip(!built.includes('g3LogoBadge'), 'house kit not embedded in this build');
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const app = `'use strict';
const KIT={org:'ORG',unit:'Unité',app:'Test',footer:'ORG · Test',docTitle:'Test',docSubject:'Test',keywords:'test'};
function toast(m){ console.log(m); }
document.title='APEX e2e';`;
  mock.push(
    { toolCalls: [{ name: 'apex.guide', args: {} }] },
    { toolCalls: [{ name: 'apex.build_app', args: { name: 'demo', app_js: app } }] },
    { toolCalls: [{ name: 'apex.qa', args: { path: 'apps/demo.html' } }] },
    { text: 'Application livrée.' },
  );
  await send(page, 'Crée une application comme l’APEX');
  await expect(page.getByText('Application livrée.')).toBeVisible({ timeout: 30_000 });
  const msgs = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(msgs).toContain('APEX METHOD');
  expect(msgs).toContain('Built apps/demo.html');
  expect(msgs).toContain('QA PASSED');
  expect(msgs).toContain('APEX e2e');
});

test('APEX Studio rejects an app without KIT / with a syntax error', async ({ page }) => {
  const built = fs.readFileSync(FILE, 'utf8');
  test.skip(!built.includes('g3LogoBadge'), 'house kit not embedded in this build');
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'apex.build_app', args: { name: 'bad', app_js: 'function( {' } }] },
    { text: 'Corrigé.' },
  );
  await send(page, 'Crée une app');
  await expect(page.getByText('Corrigé.')).toBeVisible();
  const msgs = JSON.stringify(mock.requests[1]!.messages);
  expect(msgs).toContain('KIT is not defined');
  expect(msgs).toContain('Erreur de syntaxe');
});

test('embedded terminal: pipes, redirections, diagnosis', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Terminal', exact: true }).first().click();
  const cmd = page.getByLabel('Commande');
  await cmd.fill('echo "agence,montant" > v.csv && echo "Dakar,10" >> v.csv && cat v.csv | grep -c ,');
  await cmd.press('Enter');
  await expect(page.getByText(/^2$/)).toBeVisible();
  await cmd.fill('ls');
  await cmd.press('Enter');
  await expect(page.getByText('v.csv', { exact: true })).toBeVisible();
  await cmd.fill('node -e "throw new Error(\'boom\')"');
  await cmd.press('Enter');
  await expect(page.getByText(/boom/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Corriger avec l’agent/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('embedded browser: the agent loads a file into an app, clicks export, gets the download', async ({
  page,
}) => {
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const app = `<!doctype html><html><head><title>Mini app</title></head><body>
<input type="file" id="f"><button id="x">Exporter</button><p id="n">aucun fichier</p>
<script>let rows=0;
document.getElementById('f').addEventListener('change', async e => { const t = await e.target.files[0].text(); rows = t.trim().split('\\n').length; document.getElementById('n').textContent = rows + ' lignes'; });
document.getElementById('x').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['lignes=' + rows], {type:'text/plain'})); a.download = 'resultat.txt'; document.body.appendChild(a); a.click(); };
</script></body></html>`;
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'apps/mini.html', content: app } }] },
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/v.csv', content: 'a,b\n1,2\n3,4\n' } }] },
    { toolCalls: [{ name: 'browser.open', args: { target: 'apps/mini.html' } }] },
    { toolCalls: [{ name: 'browser.upload', args: { ref: 'e1', path: 'data/v.csv' } }] },
    { toolCalls: [{ name: 'browser.click', args: { ref: 'e2' } }] },
    { toolCalls: [{ name: 'terminal.execute', args: { command: 'cat downloads/resultat.txt' } }] },
    { text: 'Test terminé.' },
  );
  await send(page, 'Teste l’application');
  await expect(page.getByText('Test terminé.')).toBeVisible({ timeout: 30_000 });
  const msgs = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(msgs).toContain('[e1] input:file');
  expect(msgs).toContain('3 lignes');
  expect(msgs).toContain('Downloaded: downloads/resultat.txt');
  expect(msgs).toContain('lignes=3');
  // The user sees the same page in the Browser view, with the captured download.
  await page.getByRole('button', { name: 'Navigateur', exact: true }).first().click();
  await expect(page.getByText('resultat.txt')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Navigateur intégré"]').getByText('3 lignes')).toBeVisible();
});

test('built-in plugins: 3D studio (preview + .glb + Blender script) and exchange rates', async ({ page }) => {
  await page.route('https://open.er-api.com/**', (r) =>
    r.fulfill({
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({
        result: 'success',
        time_last_update_utc: 'Sun, 04 Oct 2026',
        rates: { XOF: 655.957, USD: 1.17 },
      }),
    }),
  );
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'blender.scene',
          args: {
            name: 'agence',
            title: 'Agence',
            objects: [{ type: 'roundedbox', size: 2, position: [0, 1, 0], color: '#005C83' }],
          },
        },
      ],
    },
    { toolCalls: [{ name: 'fx.rates', args: { base: 'EUR', symbols: ['XOF'] } }] },
    { text: 'Scène et taux prêts.' },
  );
  await send(page, 'Fais une maquette 3D et donne le taux EUR/XOF');
  await expect(page.getByText('Scène et taux prêts.')).toBeVisible({ timeout: 40_000 });
  const tools = (mock.requests[0]!.tools as { function: { name: string } }[]).map((t) => t.function.name);
  expect(tools).toEqual(
    expect.arrayContaining(['blender__scene', 'fx__rates', 'weather__forecast', 'diagram__render']),
  );
  const msgs = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(msgs).toContain('3d/agence.html');
  expect(msgs).toContain('glTF 3d/agence.glb');
  expect(msgs).toContain('3d/agence_blender.py');
  expect(msgs).toContain('XOF: 655.957');
  // Switching a plugin off removes its tools.
  await page.getByRole('button', { name: 'Plugins', exact: true }).first().click();
  await expect(page.getByText('Studio 3D → Blender')).toBeVisible();
});

test('Intelligence Engine: strategy, shadow alert, evidence check, manual, learning, time machine', async ({
  page,
}) => {
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'filesystem.write',
          args: { path: 'data/ventes.csv', content: 'agence,montant\nDakar,1250\nThies,430\n' },
        },
      ],
    },
    {
      toolCalls: [
        {
          name: 'data.query',
          args: { path: 'data/ventes.csv', aggregations: [{ column: 'montant', fn: 'sum' }] },
        },
      ],
    },
    // Final answer with an invented figure → evidence check.
    { text: 'Le total des ventes est de 1680 et la marge de 98 765 432.' },
    {
      text: 'Corrigé : le total des ventes est 1680 (données). La marge n’est pas calculable avec ce fichier.',
    },
  );
  await send(
    page,
    'À partir de maintenant, les montants sont toujours en XOF. Analyse les ventes du fichier data/ventes.csv et donne le total.',
  );
  await expect(page.getByText(/Corrigé : le total des ventes est 1680/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Stratégie — /).first()).toBeVisible();
  await expect(page.getByText('Manuel personnel : règle mémorisée')).toBeVisible();
  await expect(page.getByText('Contrôle des preuves : chiffres sans source')).toHaveCount(1);
  const r3 = JSON.stringify(mock.requests[3]!.messages);
  expect(r3).toContain('[EVIDENCE CHECK]');
  expect(r3).toContain('98 765 432');
  expect(r3).not.toMatch(/EVIDENCE CHECK[^\]]*1680/);
  // The rule is now part of every system prompt.
  expect(JSON.stringify(mock.requests[3]!.messages[0])).toContain('les montants sont toujours en XOF');
  expect(JSON.stringify(mock.requests[0]!.messages[0])).toContain('MASSAMBA STRATEGY');

  // Second run: the shadow agent catches a write into the user's source data; learning memory is used.
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'uploads/source.csv', content: 'x' } }] },
    { toolCalls: [{ name: 'timemachine.list', args: {} }] },
    { text: 'Fait.' },
  );
  await send(page, 'Analyse encore les ventes du fichier data/ventes.csv');
  await expect(page.getByText('Fait.', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/source file uploads\/source.csv is being modified/)).toBeVisible();
  const r5 = JSON.stringify(mock.requests[5]!.messages);
  expect(r5).toContain('[SHADOW AGENT');
  // Time machine: the first run's writes were checkpointed.
  expect(JSON.stringify(mock.requests[6]!.messages)).toMatch(/cp_[a-z0-9]+ — .* — \d+ fichier/);
  // Learning: the strategy of the second run knows the first one.
  await expect(page.getByText(/Mémoire : [1-9]\d* mission\(s\) similaire\(s\)/).first()).toBeVisible();
});

test('Intelligence Engine: critical mission → red team blocks, correction, judge approves', async ({
  page,
}) => {
  await open(page);
  await page.getByTitle(/Mode Mission/).click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'mission.report',
          args: {
            status: 'PASSED',
            summary: 'Note COMEX prête',
            checks: [{ name: 'total', status: 'pass', command: 'echo ok', expect: 'ok' }],
          },
        },
      ],
    },
    // Red team (sub-agent)
    { text: 'CONFIDENCE: 40%\nBLOCKING: le total des provisions est faux\nMINOR: titre' },
    // Correction then new report
    {
      toolCalls: [
        {
          name: 'mission.report',
          args: {
            status: 'PASSED',
            summary: 'Note COMEX corrigée',
            checks: [{ name: 'total', status: 'pass' }],
            evidence: [{ claim: 'Provisions 120', source: 'data.query', level: 'certain' }],
            related: [{ task: 'Prévenir le Comité', priority: 'forbidden' }],
          },
        },
      ],
    },
    { text: 'CONFIDENCE: 90%\nBLOCKING: none' },
    // Final judge
    { text: 'VERDICT: APPROVED\nScore 92/100' },
  );
  await send(page, 'Prépare la note au COMEX sur les provisions IFRS9');
  await expect(page.getByText('Revue finale : approuvée')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/Red team — confiance 40 %/)).toBeVisible();
  await expect(page.getByText(/Bloquant : le total des provisions est faux/)).toBeVisible();
  const fix = JSON.stringify(mock.requests[2]!.messages);
  expect(fix).toContain('The red team found blocking problems');
  expect(JSON.stringify(mock.requests[1]!.messages[0])).toContain('RED TEAM');
  await expect(page.getByText(/Carte d'incertitude|certain/).first()).toBeVisible();
  await page.getByTitle(/Mode Mission/).click();
});

test('auto-benchmark feeds the personal leaderboard; Time Machine diff and restore', async ({ page }) => {
  await open(page);
  // Benchmark: 4 right answers out of 5.
  mock.push(
    { text: 'Total : 1 900 250 000' },
    { text: '7,0 %' },
    { text: '{"client":"SOW Mamadou","montant":2500000,"echeance":"2026-03-15"}' },
    { text: '```js\nfunction formatXof(n){return "faux"}\n```' },
    { text: '7 500 000' },
  );
  await page.getByRole('button', { name: 'Modèles', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Mon classement' }).click();
  await page.getByPlaceholder('id du modèle').fill('mock/smart-2');
  await page.getByRole('button', { name: /Lancer/ }).click();
  await expect(page.getByText(/mock\/smart-2 : 4\/5 réussies/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('cell', { name: 'mock/smart-2' })).toBeVisible();
  await expect(page.getByText('✗ code-fn')).toBeVisible();

  // Time Machine: a task modifies a file → diff + restore from the Files view.
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/plan.md', content: 'version 1\n' } }] },
    { text: 'v1.' },
  );
  await send(page, 'Crée notes/plan.md');
  await expect(page.getByText('v1.', { exact: true })).toBeVisible();
  mock.push(
    {
      toolCalls: [
        {
          name: 'filesystem.write',
          args: { path: 'notes/plan.md', content: 'function nouvelle() {}\nversion 2\n' },
        },
      ],
    },
    { text: 'v2.' },
  );
  await send(page, 'Modifie notes/plan.md');
  await expect(page.getByText('v2.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fichiers', exact: true }).first().click();
  await page.getByText('actualiser').click();
  await page.getByRole('button', { name: 'diff' }).first().click();
  await expect(page.getByText(/fonctions ajoutées : nouvelle/)).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page
    .getByRole('button', { name: /restaurer/ })
    .first()
    .click();
  await expect(page.getByText('1 fichier(s) restauré(s)')).toBeVisible();
  await page.getByRole('button', { name: 'notes/plan.md' }).click();
  await expect(page.getByText('version 1').first()).toBeVisible();
});
