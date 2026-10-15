// CERVEAU JEV + MODÈLES GRATUITS EN VRAI (v63 — « tout en gratuit sans que je ne mette de clé », « donnes après
// l'impact »). L'app est ouverte depuis file:// et démarrée SANS CLÉ ; LLM7, Pollinations, Exa, Parallel, Jina, la BCE,
// Wikidata et la bibliothèque mondiale sont appelés RÉELLEMENT depuis la page. Le catalogue OpenRouter est simulé (il ne
// sert qu'aux listes). Lancé seulement avec LIVE_WEB=1 ; le modèle intégré au navigateur (≈ 0,6 Go) avec LOCAL_MODEL=1.
// Les mesures sont écrites dans test-results/jev-brain-impact.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const OUT = path.join(process.env.PROBE_OUT ?? path.join(ROOT, 'test-results'), 'jev-brain-impact.json');
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
test.skip(process.env.LIVE_WEB !== '1', 'test réseau réel : LIVE_WEB=1');
const CA = process.env.PROXY_CA_FILE ?? '/root/.ccr/agent-proxy-ca.crt';
const spki = fs.existsSync(CA) ? crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(CA)).publicKey.export({ type: 'spki', format: 'der' })).digest('base64') : null;
if (PROXY) test.use({ proxy: { server: PROXY, bypass: '127.0.0.1,localhost' }, launchOptions: { args: spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] } });
test.describe.configure({ mode: 'serial' });

let mock: MockOpenRouter;
const report: Record<string, unknown> = { at: new Date().toISOString(), origin: 'file://', key: 'aucune' };
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct:single` first');
  mock = await startMockOpenRouter();
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
test.afterAll(async () => {
  await mock?.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const prev = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, unknown>) : {};
  fs.writeFileSync(OUT, JSON.stringify({ ...prev, ...report }, null, 2));
});

async function openFree(page: Page) {
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const res = await route.fetch({ url: route.request().url().replace('https://openrouter.ai/api/v1', mock.url) });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.getByTestId('start-free').click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
}
async function openChat(page: Page) {
  await openView(page, 'Chat');
  await expect(page.locator('textarea')).toBeVisible();
}
const send = async (page: Page, text: string) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};
/** Sends a message and waits until the chat is idle; returns the last assistant text and the time taken. */
async function ask(page: Page, text: string, timeout = 120_000): Promise<{ ms: number; answer: string }> {
  const t0 = Date.now();
  await send(page, text);
  await expect(page.getByTitle('Interrompre')).toHaveCount(1, { timeout: 10_000 }).catch(() => undefined);
  await expect(page.getByTitle('Interrompre')).toHaveCount(0, { timeout });
  const answer = await page.evaluate(() => {
    const md = [...document.querySelectorAll('.wb-md, .prose, [data-role="assistant"]')].map((e) => (e as HTMLElement).innerText);
    return md.at(-1) ?? document.body.innerText.slice(-3000);
  });
  return { ms: Date.now() - t0, answer };
}

test('sans clé : réflexes JEV, calcul par code exécuté, réponse d’un modèle gratuit outillé par JEV', async ({ page }) => {
  test.setTimeout(420_000);
  await openFree(page);
  await openChat(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();

  // 1. Reflex: CFA conversion from the ECB reference rate — no model at all.
  const fx = await ask(page, 'convertis 1 500 euros en FCFA', 30_000);
  await expect(page.getByText(/983\s?935,5\s?XOF/).first()).toBeVisible();
  await expect(page.getByText('aucun modèle appelé').first()).toBeVisible();
  // 2. Reflex: entity card (Wikidata).
  const ent = await ask(page, 'Où est le siège de Ecobank ?', 30_000);
  // 3. JEV codes and interprets: the program is written by a free coder and EXECUTED in the sandbox.
  const calc = await ask(page, 'Calcule la mensualité d’un prêt de 10 000 000 FCFA à 8 % par an sur 5 ans', 120_000);
  const calcShown = await page.getByText('exécuté dans le bac à sable').first().isVisible().catch(() => false);
  // 4. A real question answered by a FREE model (no key), fed by JEV (packet, capsule, tools).
  const q = await ask(page, 'En deux phrases, explique la différence entre le stage 2 et le stage 3 d’IFRS 9.', 180_000);
  const body = await page.locator('body').innerText();
  report.chat = {
    reflexeChange: { ms: fx.ms, ok: /983\s?935,5/.test(body) },
    reflexeEntite: { ms: ent.ms, ok: /Lomé|Siège de Ecobank/i.test(body) },
    calculParCode: { ms: calc.ms, executed: calcShown, sample: calc.answer.slice(0, 300) },
    modeleGratuit: { ms: q.ms, sample: q.answer.slice(0, 400), stage: /stage\s?3/i.test(body) },
  };
  console.log(JSON.stringify(report.chat, null, 2));
  expect(/983\s?935,5/.test(body)).toBe(true);
  expect(/stage\s?3/i.test(body)).toBe(true);
});

test('sondes : chaque service gratuit appelé depuis la page (lecture, BCE, Wikidata, modèles, 19 sources de la bibliothèque)', async ({ page }) => {
  test.setTimeout(180_000);
  await openFree(page);
  await openView(page, 'Réglages');
  await page.getByTestId('free-search-probe-run').click();
  const summary = page.getByTestId('free-search-probe-summary');
  await expect(summary).toBeVisible({ timeout: 90_000 });
  const rows = await page.locator('[data-testid^="probe-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid'), ok: e.getAttribute('data-ok') === '1', text: (e as HTMLElement).innerText.replace(/\s+/g, ' ') })));
  report.probes = { summary: await summary.innerText(), rows };
  for (const r of rows) console.log(`${r.ok ? 'OK ' : 'KO '} ${r.text}`);
  expect(rows.filter((r) => r.ok).length).toBeGreaterThanOrEqual(15);
});

test('modèle intégré au navigateur : téléchargement, vitesse mesurée sur cette machine', async ({ page }) => {
  test.skip(process.env.LOCAL_MODEL !== '1', 'téléchargement ≈ 0,6 Go : LOCAL_MODEL=1');
  test.setTimeout(1_500_000);
  await openFree(page);
  await openView(page, 'Réglages');
  await page.getByTestId('brain-settings').getByRole('combobox').last().selectOption('qwen3-0.6b').catch(async () => {
    await page.getByTestId('brain-settings').locator('select').last().selectOption('qwen3-0.6b');
  });
  const t0 = Date.now();
  await page.getByTestId('browser-model-test').click();
  const out = page.getByTestId('brain-test-out');
  await expect(out).toBeVisible({ timeout: 1_400_000 });
  const text = await out.innerText();
  report.browserModel = { ms: Date.now() - t0, result: text };
  console.log(text);
  expect(text.startsWith('✓')).toBe(true);
});
