// v62 — « LOT PUISSANCE » in the real app: the ESN chat replayed on a SYNTHETIC ACTE 7 portfolio (.xlsb, 3 sheets, a
// dictionary sheet). The model is mocked with the exact query shapes that failed in the owner's chat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
let tmp = '';

test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-portfolio-'));
});
test.afterAll(async () => {
  await mock?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
test.beforeEach(() => mock.reset());
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function open(page: Page, errors: string[] = []) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const url = route.request().url().replace('https://openrouter.ai/api/v1', mock.url);
    const res = await route.fetch({ url });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-direct-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Chat');
  await expect(page.locator('textarea')).toBeVisible();
  return errors;
}
async function send(page: Page, text: string) {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
}

/** A synthetic portfolio with the ACTE 7 headers (no real client): 40 contracts, segments 8200 / 8100 / 8800. */
function portfolio(): string {
  const head = ['Contracts/Accounts', 'Code Client', 'Relationship', 'Segment Code', 'Status (P/NP)', 'Net Exposure In Local Currency', 'Cprovisions IFRS9 In Local Currency', 'CProvisions Per Local Regulatory In Local Currency', 'Ototal Including PDO In Local Currency', 'Ototal Net In Local Currency'];
  const rows: unknown[][] = [head];
  for (let i = 0; i < 40; i++) {
    const seg = [8200, 8100, 8800][i % 3]!;
    const expo = 1_000_000 * (i + 1);
    rows.push([`C${1000 + i}`, 500 + (i % 12), `CLIENT ${String.fromCharCode(65 + (i % 12))}`, i % 4 === 0 ? String(seg) : seg, i % 7 === 0 ? 'NP' : 'P', expo, Math.round(expo * 0.02), Math.round(expo * 0.03), expo, expo]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Mainreport');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Column Name', 'Description', 'Type'],
      ['Segment Code', 'Segment technique du client (8200 = entreprises locales)', 'int'],
      ['Net Exposure In Local Currency', 'Exposition nette en monnaie locale', 'num'],
      ['Status (P/NP)', 'Statut performant / non performant', 'txt'],
      ['Relationship', 'Nom de la contrepartie', 'txt'],
      ['Cprovisions IFRS9 In Local Currency', 'Dépréciation IFRS 9 (ECL)', 'num'],
    ]),
    'ColumnDescription',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Note'], ['extrait synthétique']]), 'Notes');
  const p = path.join(tmp, 'ESN_Portfolio_synthetique.xlsb');
  fs.writeFileSync(p, Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsb' }) as Buffer));
  return p;
}

test('v62 — the ESN chat replayed: portfolio card, every failed query shape runs, ambiguity is short, « continue » keeps the mission', async ({ page }) => {
  const errors = await open(page);
  await page.locator('input[type=file]').first().setInputFiles(portfolio());
  await expect(page.getByText('ESN_Portfolio_synthetique.xlsb').first()).toBeVisible();
  const P = 'uploads/ESN_Portfolio_synthetique.xlsb';
  mock.push(
    {
      toolCalls: [
        // The exact shapes that failed in the owner's chat.
        { name: 'data.query', args: { path: P, filters: [{ column: 'Segment Code', op: '==', value: 8200 }], groupBy: '[{"column": "Relationship"}]', aggregations: [{ column: 'expo', fn: 'sum', as: 'expo_net' }], sort: [{ column: 'expo_net', dir: 'desc' }], limit: '20' } },
        { name: 'data.query', args: { path: P, groupBy: ['Statut'], aggregations: [{ sum: 'Net Exposure In Local Currency' }], sort: [{ column: 'sum_Net Exposure In Local Currency', dir: 'desc' }] } },
        { name: 'data.query', args: { path: P, aggregations: [{ column: 'Provision', fn: 'sum' }] } },
      ],
    },
    { text: 'Top 20 du segment 8200 calculé.' },
  );
  await send(page, 'Dans le fichier attaché, donnes moi le top 20 du segment code 8200 Local Corporate par exposition');
  await expect(page.getByText('Top 20 du segment 8200 calculé.')).toBeVisible({ timeout: 30_000 });
  const first = JSON.stringify(mock.requests[0]!.messages);
  // The portfolio card: exact columns, segment labels from the APEX codification, the file's own dictionary.
  expect(first).toContain('PORTFOLIO CARD');
  expect(first).toContain('8200 = Entreprises locales');
  expect(first).toContain('Exposition nette en monnaie locale');
  // The data AND deliver tools are exposed from the first step (no « JEV : outils … » round trip).
  const tools = (mock.requests[0]!.tools ?? []).map((t) => (t as { function: { name: string } }).function.name);
  expect(tools).toEqual(expect.arrayContaining(['data__query', 'data__export']));
  const second = JSON.stringify(mock.requests[1]!.messages);
  // 1. JSON-string groupBy, « == », « expo », sort on the alias, limit as text → 12 clients max of segment 8200, sorted.
  expect(second).toContain('colonnes interprétées : expo → Net Exposure In Local Currency');
  expect(second).toMatch(/\| Relationship \| expo_net \|/);
  // 2. {sum: X} and a sort on the default output name.
  expect(second).toContain('Statut → Status (P/NP)');
  expect(second).toMatch(/\| Status \(P\/NP\) \| sum_Net Exposure In Local Currency \|/);
  // 3. « Provision » is ambiguous: the SHORT list, not the 10 columns.
  expect(second).toContain('« Provision » est ambigu → choisir parmi : Cprovisions IFRS9 In Local Currency | CProvisions Per Local Regulatory In Local Currency');
  expect(second).not.toContain('Invalid option');

  // « continue »: the SAME mission reaches the model.
  mock.push({ text: 'Reprise faite.' });
  await send(page, 'continue');
  await expect(page.getByText('Reprise faite.')).toBeVisible({ timeout: 30_000 });
  const last = JSON.stringify(mock.requests.at(-1)!.messages);
  expect(last).toContain('<mission_resumed>');
  expect(last).toContain('top 20 du segment code 8200 Local Corporate');
  expect(errors).toEqual([]);
});
