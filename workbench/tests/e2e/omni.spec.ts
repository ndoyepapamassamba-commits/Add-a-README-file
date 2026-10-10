// OMNIPOTENT V4.1 + JEV COGNITIVE OS — end-to-end from file://, OpenRouter replaced by the local mock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { MOCK_MODELS, startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

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
  // Image proxy used to hand design images to the vision model: a 1×1 PNG, CORS open.
  await page.route('https://wsrv.nl/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }),
  );
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
  // MAISON 2.0 / GOD 3D: a « Synthèse 3D » board (picture) as the first sheet + native Excel 3D charts on the data sheet.
  const wbXml = strFromU8(zip['xl/workbook.xml']!);
  expect(wbXml.indexOf('name="Synthèse 3D"')).toBeGreaterThan(-1);
  expect(wbXml.indexOf('name="Synthèse 3D"')).toBeLessThan(wbXml.indexOf('name="Données"'));
  expect(wbXml).toContain('name="Agrégats"');
  expect(zip['xl/media/massamba-dashboard.png']!.length).toBeGreaterThan(20_000);
  expect(strFromU8(zip['xl/charts/chart1.xml']!)).toContain('<c:bar3DChart>');
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
  // The layout reaches the model even when the design is not remembered for the whole chat; the house style does not.
  const agentCalls = mock.requests.filter((r) => r.tools?.length);
  expect(JSON.stringify(agentCalls[0]!.messages)).toContain('DESIGN_LAYOUT');
  expect(JSON.stringify(agentCalls[0]!.messages)).toContain('REPLACES the house style');
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

test('REAL website reproduced: its code gives the exact colours / fonts, its screenshot the structure; Excel + dashboard use them with the chat data', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  const SITE_HTML = '<html><head><link rel="stylesheet" href="/assets/app.css"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap" rel="stylesheet"></head><body><aside class="sidebar">menu</aside><main>x</main></body></html>';
  const SITE_CSS = ':root{--color-primary:#0E7C66;--color-accent:#F2994A;--bg:#F7F9F8;--text:#13231F}body{background:var(--bg);color:var(--text);font-family:Manrope,sans-serif}.btn-primary{background:var(--color-primary);border-radius:14px;box-shadow:0 2px 8px #0002}.card{background:#FFFFFF;border:1px solid #E3E8E6;border-radius:14px;box-shadow:0 1px 2px #0001}.p{box-shadow:0 8px 24px #0002}a{color:var(--color-accent)}';
  const seen: string[] = [];
  await page.route('https://r.jina.ai/**', async (route) => {
    const url = route.request().url();
    const fmt = route.request().headers()['x-return-format'];
    seen.push(`${fmt} ${url}`);
    const cors = { 'access-control-allow-origin': '*' };
    if (fmt === 'screenshot') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: { screenshotUrl: 'https://example.com/shot.png' } }) });
    if (url.endsWith('/assets/app.css')) return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain', body: SITE_CSS });
    return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain', body: SITE_HTML });
  });
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const LAYOUT = { dark: false, navigation: 'sidebar', header: 'minimal', kpis: { count: 2, style: 'accent-left' }, charts: [{ type: 'bar', span: 2 }], table: { style: 'lined', position: 'bottom' }, columns: 3, radius: 6, shadow: false, palette: { bg: '#000000', surface: '#111111', primary: '#FF0000', accent: '#00FF00', text: '#FFFFFF', muted: '#999999', series: ['#FF0000'] }, font: 'Comic Sans' };
  mock.push(
    { text: JSON.stringify(LAYOUT) }, // vision reads the SCREENSHOT (structure); its colour guesses are overridden by the code
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/ventes.csv', content: 'agence,montant\nDakar,1250\nThies,430\n' } }] },
    { toolCalls: [{ name: 'data.export', args: { path: 'data/ventes.csv', name: 'ventes', title: 'Ventes', format: 'xlsx' } }] },
    { text: 'Livré au style du site.' },
  );
  await send(page, 'Fais un classeur Excel des ventes par agence');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-site-url').fill('banque-exemple.sn');
  await page.getByTestId('design-site-go').click();
  await expect(page.getByTestId('design-site-done')).toContainText('banque-exemple.sn', { timeout: 20_000 });
  await expect(page.getByTestId('design-site-done')).toContainText('Manrope');
  await expect(page.getByTestId('design-selected')).toContainText('Site reproduit');
  await expect(page.getByTestId('design-layout-preview')).toBeVisible();
  expect(seen.some((s) => s.startsWith('html https://r.jina.ai/https://banque-exemple.sn'))).toBe(true);
  expect(seen.some((s) => s.includes('/assets/app.css'))).toBe(true);
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('Site reproduit — banque-exemple.sn');
  await expect(page.getByText('Livré au style du site.')).toBeVisible({ timeout: 20_000 });
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
  expect(html).toContain('--primary:#0E7C66'); // exact colour from the site's CSS, not the vision guess
  expect(html).not.toContain('#FF0000');
  expect(html).toContain('family=Manrope'); // the site's web font
  expect(html).toContain('<aside class="side">'); // structure from the screenshot
  expect(html).toContain('accent-left');
  expect(html).toContain('1 680'); // real total of the chat data
  const { unzipSync, strFromU8 } = await import('fflate');
  const xlsx = all[Object.keys(all).find((k) => k.endsWith('ventes.xlsx'))!]!.data;
  const xml = Object.entries(unzipSync(new Uint8Array(Buffer.from(xlsx, 'base64')))).filter(([k]) => /styles|sheet1/.test(k)).map(([, v]) => strFromU8(v)).join('');
  expect(xml).toContain('0E7C66');
});

test('LOGO: the attached logo is offered in the gallery, recoloured harmoniously to the chosen design, and placed in the Excel', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  // A banner logo drawn in the page: blue background, white text, lime filet.
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 120;
    const g = c.getContext('2d')!;
    g.fillStyle = '#005C83';
    g.fillRect(0, 0, 240, 120);
    g.fillStyle = '#FFFFFF';
    g.font = 'italic bold 48px sans-serif';
    g.fillText('Banque', 20, 62);
    g.fillStyle = '#8CC63F';
    g.fillRect(20, 80, 200, 4);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'logo-banque.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/ventes.csv', content: 'agence,montant\nDakar,1250\nThies,430\n' } }] },
    { toolCalls: [{ name: 'data.export', args: { path: 'data/ventes.csv', name: 'ventes', title: 'Ventes', format: 'xlsx', chart: 'bar' } }] },
    { text: 'Classeur prêt avec le logo.' },
  );
  await send(page, 'Fais un classeur Excel des ventes par agence');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('design-logo-file')).toContainText('logo-banque.png'); // pre-selected (its name says logo)
  await page.getByTestId('design-onyx').click();
  await expect(page.getByTestId('design-logo-harmonized').locator('img')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('design-logo-variants').locator('img')).toHaveCount(5);
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('logo harmonisé');
  await expect(page.getByText('Classeur prêt avec le logo.')).toBeVisible({ timeout: 20_000 });
  expect(JSON.stringify(mock.requests.filter((r) => r.tools?.length)[0]!.messages)).toContain('assets/logo-harmonized.png');
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
  await expect.poll(async () => Object.keys(await files()).some((k) => k.endsWith('outputs/ventes.xlsx')), { timeout: 10_000 }).toBe(true);
  const all = await files();
  const { unzipSync } = await import('fflate');
  const z = unzipSync(new Uint8Array(Buffer.from(all[Object.keys(all).find((k) => k.endsWith('outputs/ventes.xlsx'))!]!.data, 'base64')));
  const media = z['xl/media/massamba-logo.png'];
  expect(media).toBeTruthy();
  expect(Object.keys(z).some((k) => k.startsWith('xl/charts/'))).toBe(true); // the chart is kept
  // The logo in the workbook IS recoloured: its background is now the Onyx primary, not the original blue.
  const corner = await page.evaluate(async (b: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return [...g.getImageData(3, 3, 1, 1).data];
  }, Buffer.from(media!).toString('base64'));
  expect(corner.slice(0, 3)).toEqual([0x1c, 0x1c, 0x24]);
});

test('vision model refusing (« only available on agentic harnesses ») → the next one describes the design; never back to Maison; the chat model is unchanged', async ({ page }) => {
  mock.models = [
    ...MOCK_MODELS,
    { id: 'mock/eyes:free', name: 'Mock: Eyes free', created: 1_750_000_000, context_length: 64_000, architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' }, top_provider: { context_length: 64_000, max_completion_tokens: 4096 }, supported_parameters: ['temperature'] },
  ];
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  await page.route('https://api.tavily.com/search', (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ results: [], images: [{ url: 'https://example.com/kpi.png', description: 'kpi dashboard' }] }) }),
  );
  await page.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const LAYOUT = { dark: false, navigation: 'top', header: 'band', kpis: { count: 3, style: 'card' }, charts: [{ type: 'line', span: 2 }], table: { style: 'zebra', position: 'bottom' }, columns: 3, radius: 10, shadow: true, palette: { bg: '#FFF7ED', surface: '#FFFFFF', primary: '#C2410C', accent: '#FACC15', text: '#1C1917', muted: '#78716C', series: ['#C2410C', '#FACC15'] }, font: 'Montserrat' };
  mock.push(
    { error: { status: 403, message: 'thinkingmachines/inkling-small:free is only available on agentic harnesses.' } },
    { text: JSON.stringify(LAYOUT) },
    { text: 'Prêt.' },
  );
  await send(page, 'Fais un classeur Excel des ventes');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-web').click();
  await page.getByTestId('design-web-gallery').locator('button').first().click();
  await expect(page.getByTestId('design-read-by')).toContainText('smart-2', { timeout: 20_000 });
  await expect(page.getByTestId('design-selected')).toContainText('Design Internet');
  const visionCalls = mock.requests.filter((r) => JSON.stringify(r.messages).includes('image_url'));
  expect(visionCalls.map((r) => r.model)).toEqual(['mock/eyes:free', 'mock/smart-2']);
  // The image went to the model as data (proxied), not as a link the provider might not fetch.
  expect(JSON.stringify(visionCalls[1]!.messages)).toContain('data:image/png;base64');
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('Design Internet');
  await expect(page.getByText('Prêt.')).toBeVisible({ timeout: 20_000 });
  // The vision model only DESCRIBED the image: the chat continues with its own model.
  const chatCall = mock.requests.filter((r) => !JSON.stringify(r.messages).includes('image_url')).pop()!;
  expect(chatCall.model).not.toBe('mock/eyes:free');
  // The refusing model is remembered and skipped next time.
  expect(await page.evaluate(() => localStorage.getItem('massamba.vision.blocked'))).toContain('mock/eyes:free');
});

test('PHOTO-FAITHFUL CLONE: the chosen dashboard image is measured (panels, frame, exact colours), labelled, shown next to its reproduction with the chat data; Excel opens on the reproduction', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  const IMG = fs.readFileSync(path.join(ROOT, 'tests/fixtures/dashboard-sweetshop.png'));
  await page.route('https://api.tavily.com/search', (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ results: [], images: [{ url: 'https://example.com/sweetshop.png', description: 'sweetshop dashboard' }] }) }),
  );
  await page.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: IMG }));
  await page.route('https://wsrv.nl/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: IMG }));
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  // The chat's data, attached: the preview shows THESE figures.
  const csv = ['date,produit,region,ventes', ...Array.from({ length: 60 }, (_, i) => `2023-0${(i % 9) + 1}-15,${['Cupcake', 'Brownie', 'Macaron', 'Cookie', 'Donut'][i % 5]},${['Dakar', 'Thiès', 'Kaolack'][i % 3]},${100 + ((i * 37) % 900)}`)].join('\n');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'ventes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const SOM = { panels: ['bar', 'line', 'bar', 'pie', 'hbar', 'hbar', 'donut'].map((kind, i) => ({ id: i + 1, kind, tiles: 1, title_align: 'center', value_labels: true, legend: kind === 'pie' || kind === 'donut' ? 'right' : 'none' })), font: 'Segoe UI', title_align: 'center' };
  mock.push(
    { text: '{}' }, // the best vision model is asked to cut the panels out first — here it gives nothing usable
    { text: JSON.stringify(SOM) }, // the vision model LABELS the numbered panels (geometry and colours come from the pixels)
    { toolCalls: [{ name: 'data.export', args: { path: 'uploads/ventes.csv', name: 'sweetshop', title: 'SWEETSHOP — ANALYSE 2023', format: 'xlsx' } }] },
    { text: 'Reproduction livrée.' },
  );
  await send(page, 'Fais un classeur Excel analysé des ventes');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-web').click();
  await page.getByTestId('design-web-gallery').locator('button').first().click();
  await expect(page.getByTestId('design-clone')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('design-clone-panels').locator('select')).toHaveCount(7);
  await expect(page.getByTestId('design-fidelity')).toContainText('%', { timeout: 20_000 });
  await expect(page.getByTestId('design-clone')).toContainText('ventes.csv');
  // The vision call received the image with NUMBERED boxes (set-of-marks), not a request to describe everything.
  const somCall = mock.requests.find((r) => JSON.stringify(r.messages).includes('numbered RED boxes'));
  expect(somCall).toBeTruthy();
  await page.getByTestId('design-clone').screenshot({ path: test.info().outputPath('clone-card.png') });
  fs.copyFileSync(test.info().outputPath('clone-card.png'), '/tmp/claude-0/clone/e2e-card.png');
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done')).toContainText('Reproduction fidèle');
  await expect(page.getByText('Reproduction livrée.')).toBeVisible({ timeout: 30_000 });
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
  await expect.poll(async () => Object.keys(await files()).some((k) => k.endsWith('sweetshop-tableau-de-bord.html')), { timeout: 15_000 }).toBe(true);
  const all = await files();
  const html = all[Object.keys(all).find((k) => k.endsWith('sweetshop-tableau-de-bord.html'))!]!.data;
  expect(html).toContain('data-dash-clone');
  expect(html).toContain('SWEETSHOP — ANALYSE 2023');
  const { unzipSync, strFromU8 } = await import('fflate');
  const z = unzipSync(new Uint8Array(Buffer.from(all[Object.keys(all).find((k) => k.endsWith('outputs/sweetshop.xlsx'))!]!.data, 'base64')));
  expect(z['xl/media/massamba-dashboard.png']).toBeTruthy();
  expect(strFromU8(z['xl/workbook.xml']!)).toMatch(/<sheets><sheet name="Tableau de bord"/);
  fs.writeFileSync('/tmp/claude-0/clone/e2e-dashboard.png', Buffer.from(z['xl/media/massamba-dashboard.png']!));
});

test('a design card left behind (mission stopped, page reloaded): « Générer » relaunches the request with the design — never a dead button', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  await send(page, 'Fais un classeur Excel des ventes par agence');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700); // debounced save
  await page.reload();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 10_000 });
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'data/v.csv', content: 'agence,montant\nDakar,1250\n' } }] },
    { toolCalls: [{ name: 'data.export', args: { path: 'data/v.csv', name: 'v', title: 'V', format: 'xlsx' } }] },
    { text: 'Relancé et livré.' },
  );
  await page.getByTestId('design-onyx').click();
  await page.getByTestId('design-go').click();
  await expect(page.getByTestId('design-card-done').first()).toContainText('relancé', { timeout: 10_000 });
  await expect(page.getByText('Relancé et livré.')).toBeVisible({ timeout: 30_000 });
  // The relaunched request did not ask again (the design is kept for the chat).
  await expect(page.getByTestId('design-card')).toHaveCount(0);
});

test('IMAGE DESIGN + Excel written by the model in code: the workbook OPENS on the reproduction of the chosen image, drawn with the detail table of the attached workbook (not its summary sheet, no TOTAL rows)', async ({ page }) => {
  await open(page);
  await page.removeLocatorHandler(page.getByTestId('design-go'));
  const IMG = fs.readFileSync(path.join(ROOT, 'tests/fixtures/dashboard-sweetshop.png'));
  await page.route('https://api.tavily.com/search', (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ results: [], images: [{ url: 'https://example.com/sweetshop.png', description: 'dashboard' }] }) }),
  );
  await page.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: IMG }));
  await page.route('https://wsrv.nl/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: IMG }));
  await page.getByRole('button', { name: 'Réglages', exact: true }).first().click();
  await page.getByTestId('tavily-key').fill('tvly-test-key');
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  // A workbook like the user's: a summary « Dashboard » sheet first (blocks side by side, TOTAL rows), the detail after.
  await page.locator('input[type=file]').first().setInputFiles(path.join(ROOT, 'tests/fixtures/provisions-like.xlsx'));
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const SOM = { panels: ['bar', 'line', 'bar', 'pie', 'hbar', 'hbar', 'donut'].map((kind, i) => ({ id: i + 1, kind, tiles: 1 })), font: 'Segoe UI' };
  // The model builds the workbook ITSELF (as openpyxl would): its own sheets and one native chart.
  const CODE = "const b = atob('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'); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); writeFile('outputs/provisions-analyse.xlsx', u); console.log('ok');";
  mock.push(
    { text: '{}' },
    { text: JSON.stringify(SOM) },
    { toolCalls: [{ name: 'code.run', args: { language: 'javascript', code: CODE } }] },
    { text: 'Classeur livré.' },
  );
  await send(page, 'Analyse ces provisions et retourne-moi un fichier excel analysé');
  await expect(page.getByTestId('design-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('design-web').click();
  await page.getByTestId('design-web-gallery').locator('button').first().click();
  await expect(page.getByTestId('design-clone')).toBeVisible({ timeout: 30_000 });
  // The preview already uses the DETAIL sheet of the attached workbook.
  await expect(page.getByTestId('design-clone')).toContainText('Provisions', { timeout: 20_000 });
  await page.getByTestId('design-go').click();
  await expect(page.getByText('Classeur livré.')).toBeVisible({ timeout: 40_000 });
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
  const { unzipSync, strFromU8 } = await import('fflate');
  const wb = async () => {
    const all = await files();
    const k = Object.keys(all).find((x) => x.endsWith('outputs/provisions-analyse.xlsx'));
    return k ? unzipSync(new Uint8Array(Buffer.from(all[k]!.data, 'base64'))) : null;
  };
  await expect.poll(async () => strFromU8((await wb())?.['xl/workbook.xml'] ?? new Uint8Array()), { timeout: 20_000 }).toMatch(/<sheets><sheet name="Tableau de bord"/);
  const z = (await wb())!;
  const wbXml = strFromU8(z['xl/workbook.xml']!);
  expect(wbXml).toContain('name="Synthese"'); // the model's own sheets are kept, after the reproduction
  // The reproduction is a NATIVE dashboard: the image's cards as shapes and its charts as editable Excel charts.
  const dr = strFromU8(z['xl/drawings/drawing-dash.xml']!);
  expect(dr).toContain('<xdr:sp ');
  expect(wbXml).toMatch(/<sheets><sheet name="Tableau de bord"[^>]*\/><sheet name="Tableau de bord \(image\)"/);
  // Valid XML: the r: prefix of the inserted sheets is declared on the root (openpyxl declares it per <sheet> only).
  expect(wbXml).toMatch(/^(<\?xml[^>]*>\s*)?<workbook[^>]*xmlns:r=/);
  expect((dr.match(/<c:chart /g) ?? []).length).toBeGreaterThanOrEqual(5);
  // Its figures come from the « Provisions » detail table — never from the summary sheet nor from a TOTAL row.
  const data = strFromU8(z['xl/worksheets/sheet-dash-data.xml']!);
  expect(data).toContain('ALPHA SA');
  expect(data).not.toMatch(/>TOTAL<|Sous-total/);
  // The model is told what was done.
  expect(JSON.stringify(mock.requests.at(-1)!.messages)).toContain('Tableau de bord');
});
