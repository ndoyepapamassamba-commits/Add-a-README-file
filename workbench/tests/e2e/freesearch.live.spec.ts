// RECHERCHE GRATUITE EN VRAI (v62) — « teste la disponibilité des alternatives Tavily avant de livrer ». L'app est ouverte
// depuis file:// (comme chez l'utilisateur), OpenRouter est simulé, mais Tavily sans clé, DuckDuckGo, Wikipédia et
// Crossref sont appelés RÉELLEMENT depuis la page (CORS et quotas compris). Lancé seulement avec LIVE_WEB=1.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
test.skip(process.env.LIVE_WEB !== '1', 'test réseau réel : LIVE_WEB=1');
// In the cloud container, HTTPS leaves through a proxy that re-signs TLS with its own CA: Chromium is told to trust THAT
// CA (its public-key pin), nothing else — verification stays on. On a normal machine there is no such file.
const CA = process.env.PROXY_CA_FILE ?? '/root/.ccr/agent-proxy-ca.crt';
const spki = fs.existsSync(CA) ? crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(CA)).publicKey.export({ type: 'spki', format: 'der' })).digest('base64') : null;
if (PROXY) test.use({ proxy: { server: PROXY, bypass: '127.0.0.1,localhost' }, launchOptions: { args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] } });

let mock: MockOpenRouter;
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct:single` first');
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

test('the free search services answer from the file:// page (status, latency, CORS)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const res = await route.fetch({ url: route.request().url().replace('https://openrouter.ai/api/v1', mock.url) });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  const netErrors: string[] = [];
  page.on('requestfailed', (r) => { if (!/openrouter|127\.0\.0\.1/.test(r.url())) netErrors.push(`${new URL(r.url()).host} : ${r.failure()?.errorText ?? '?'}`); });
  page.on('console', (m) => { if (m.type() === 'error' && /CORS|Access-Control/i.test(m.text())) netErrors.push(m.text().slice(0, 200)); });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-direct-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Réglages');
  await page.getByTestId('free-search-probe-run').click();
  const summary = page.getByTestId('free-search-probe-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const rows = await page.locator('[data-testid^="probe-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid'), ok: e.getAttribute('data-ok') === '1', text: (e as HTMLElement).innerText.replace(/\s+/g, ' ') })));
  const report = path.join(process.env.PROBE_OUT ?? path.join(ROOT, 'test-results'), 'free-search-probe.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify({ at: new Date().toISOString(), origin: 'file://', summary: await summary.innerText(), rows, netErrors }, null, 2));
  console.log(await summary.innerText());
  for (const r of rows) console.log(`${r.ok ? 'OK ' : 'KO '} ${r.text}`);
  for (const e of netErrors) console.log(`NET ${e}`);
  // The cascade needs at least one keyless engine for text and Tavily keyless for design images.
  expect(rows.filter((r) => r.ok && /^probe-(tavily|parallel|firecrawl)$/.test(r.id ?? '')).length).toBeGreaterThanOrEqual(2);
});
