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
const CODE_XLSX = `
// Minimal stored zip (CRC32) so the sandbox writes a real .xlsx-shaped file with the house palette, like openpyxl would.
const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = new TextEncoder();
const files = [['xl/styles.xml', '<styleSheet><fonts><font><name val="Segoe UI"/></font></fonts><fills><fill><patternFill><fgColor rgb="FF00415E"/></patternFill></fill><fill><patternFill><fgColor rgb="FF8CC63F"/></patternFill></fill></fills></styleSheet>']];
const parts = []; const central = []; let off = 0;
for (const [name, text] of files) {
  const n = enc.encode(name), d = enc.encode(text), c = crc(d);
  const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
  parts.push(new Uint8Array(h.buffer), n, d);
  const e = new DataView(new ArrayBuffer(46)); e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint32(16, c, true); e.setUint32(20, d.length, true); e.setUint32(24, d.length, true); e.setUint16(28, n.length, true); e.setUint32(42, off, true);
  central.push(new Uint8Array(e.buffer), n);
  off += 30 + n.length + d.length;
}
const cs = central.reduce((a, b) => a + b.length, 0);
const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
const all = [...parts, ...central, new Uint8Array(end.buffer)];
const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
writeFile('outputs/provisions-analyse.xlsx', out);
console.log('ok');
`;
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

test('design FIRST: a request for an Excel file opens the gallery before any model call; the model\'s own code output takes the chosen design', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'code.run', args: { language: 'javascript', code: CODE_XLSX } }] },
    { text: 'Classeur analysé prêt : outputs/provisions-analyse.xlsx' },
  );
  await send(page, 'Analyse ce portefeuille et retourne-moi un fichier excel analysé');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  // Nothing has been asked to the model yet: the design comes first.
  expect(mock.requests.length).toBe(0);
  await page.getByTestId('design-onyx').click();
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('Onyx');
  await expect(page.getByText('Classeur analysé prêt')).toBeVisible({ timeout: 20_000 });
  // The palette was given to the model, and the file its code wrote was re-skinned (no house colour, onyx + Georgia).
  expect(JSON.stringify(mock.requests[0]!.messages)).toContain('DESIGN_CHOICE');
  expect(await page.getByTestId('design-card-done').count()).toBe(1); // one gallery, not a second one for code.run
  const readXml = () => page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open('openrouter-workbench-direct', 1);
        req.onsuccess = () => {
          const g = req.result.transaction('kv', 'readonly').objectStore('kv').get('files');
          g.onsuccess = () => {
            const files = (g.result ?? {}) as Record<string, { data: string }>;
            const key = Object.keys(files).find((k) => k.endsWith('provisions-analyse.xlsx'));
            resolve(key ? files[key]!.data : '');
          };
        };
      }),
  ).then(async (b64) => {
    const { unzipSync, strFromU8 } = await import('fflate');
    return b64 ? strFromU8(unzipSync(new Uint8Array(Buffer.from(b64, 'base64')))['xl/styles.xml']!) : '';
  });
  await expect.poll(readXml, { timeout: 10_000 }).toContain('FF0B0B0F');
  const xml = await readXml();
  expect(xml).not.toContain('00415E');
  expect(xml).not.toContain('8CC63F');
  expect(xml).toContain('Georgia');
});

test('Internet design → REAL copy: its layout is read, previewed, then rebuilt with the processed data (Excel + dashboard)', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  await page.route('https://api.tavily.com/search', (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ results: [], images: [{ url: 'https://example.com/dash.png', description: 'dark dashboard' }] }) }),
  );
  await page.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const LAYOUT = { dark: true, navigation: 'sidebar', header: 'minimal', kpis: { count: 3, style: 'tile' }, charts: [{ type: 'donut', span: 1 }, { type: 'area', span: 2 }], table: { style: 'lined', position: 'bottom' }, columns: 3, radius: 18, shadow: true, palette: { bg: '#0B1020', surface: '#141B2D', primary: '#7C3AED', accent: '#22D3EE', text: '#E5E7EB', muted: '#94A3B8', series: ['#7C3AED', '#22D3EE', '#F59E0B'] }, font: 'Poppins' };
  mock.push(
    { text: JSON.stringify(LAYOUT) }, // the vision model reading the design image (the gallery opens before any work)
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/ventes.csv', content: 'agence,montant\nDakar,1250\nThies,430\nDakar,300\n' } }] },
    { toolCalls: [{ name: 'data.export', args: { path: 'data/ventes.csv', name: 'ventes', title: 'Ventes par agence', format: 'xlsx' } }] },
    { text: 'Classeur et tableau de bord prêts.' },
  );
  await send(page, 'Fais un classeur Excel des ventes par agence');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-web').click();
  await page.getByTestId('design-web-gallery').locator('button').first().click();
  await expect(page.getByTestId('design-layout-preview')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-go').click();
  await expect(page.getByText('Classeur et tableau de bord prêts.')).toBeVisible({ timeout: 20_000 });
  const files = () =>
    page.evaluate(
      () =>
        new Promise<Record<string, { data: string }>>((resolve) => {
          const req = indexedDB.open('openrouter-workbench-direct', 1);
          req.onsuccess = () => {
            const g = req.result.transaction('kv', 'readonly').objectStore('kv').get('files');
            g.onsuccess = () => resolve((g.result ?? {}) as Record<string, { data: string }>);
          };
        }),
    );
  await expect.poll(async () => Object.keys(await files()).some((k) => k.endsWith('ventes-tableau-de-bord.html')), { timeout: 10_000 }).toBe(true);
  const all = await files();
  const html = all[Object.keys(all).find((k) => k.endsWith('ventes-tableau-de-bord.html'))!]!.data;
  expect(html).toContain('<aside class="side">'); // sidebar reproduced
  expect(html).toContain('kpi tile'); // KPI style reproduced
  expect(html).toContain('--primary:#7C3AED'); // palette reproduced
  expect(html).toContain('1 980'); // real processed total (1250 + 430 + 300)
  expect(html).toContain('Poppins');
  expect(Object.keys(all).some((k) => k.endsWith('ventes.xlsx'))).toBe(true);
});
