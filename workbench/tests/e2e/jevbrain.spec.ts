// CERVEAU JEV — bout en bout sans réseau (v63). LLM7 et OpenRouter sont simulés par le même faux serveur
// OpenAI-compatible : on MESURE ce que l'app envoie réellement (taille, outils), ce que JEV fait pendant la requête, et
// les réflexes sans modèle. Les mesures vont dans test-results/jev-brain-measures.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const OUT = path.join(ROOT, 'test-results', 'jev-brain-measures.json');
test.describe.configure({ mode: 'serial' });

let mock: MockOpenRouter;
const measures: Record<string, unknown> = { at: new Date().toISOString() };
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
  fs.writeFileSync(OUT, JSON.stringify(measures, null, 2));
});

async function boot(page: Page, withKey: boolean) {
  const relay = (base: string) => async (route: import('@playwright/test').Route) => {
    const res = await route.fetch({ url: route.request().url().replace(base, mock.url) });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  };
  await page.route('https://openrouter.ai/api/v1/**', relay('https://openrouter.ai/api/v1'));
  await page.route('https://api.llm7.io/v1/**', relay('https://api.llm7.io/v1'));
  // Nothing else may leave the page in these tests (free search, library, ECB are answered below or blocked).
  await page.route('https://api.frankfurter.dev/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-10-14', rates: { USD: 1.1195 } }) }));
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.goto(pathToFileURL(FILE).href);
  if (withKey) {
    await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-direct-key');
    await page.getByRole('button', { name: 'Commencer' }).click();
  } else await page.getByTestId('start-free').click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Chat');
  await expect(page.locator('textarea')).toBeVisible();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
}
const send = async (page: Page, text: string) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};
const size = (r: MockOpenRouter['requests'][number]) => JSON.stringify({ messages: r.messages, tools: r.tools ?? [] }).length;

test('sans clé : le modèle gratuit reçoit la requête compactée par JEV (blocs JEV gardés), et répond', async ({ browser }) => {
  // Reference: the same question WITH a key → what a paid model receives.
  const a = await browser.newPage();
  mock.reset();
  await boot(a, true);
  mock.push({ text: 'Le stage 2 signale une hausse significative du risque ; le stage 3 une dépréciation avérée.' });
  await send(a, 'Explique en deux phrases la différence entre le stage 2 et le stage 3 d’IFRS 9.');
  await expect(a.getByText('dépréciation avérée').first()).toBeVisible();
  const full = mock.requests.find((r) => (r.tools?.length ?? 0) > 0 || r.messages.length > 1)!;
  await a.unrouteAll({ behavior: 'ignoreErrors' });
  await a.close();
  // Same question WITHOUT a key → LLM7 (simulated) receives the compacted request.
  const b = await browser.newPage();
  mock.reset();
  await boot(b, false);
  mock.push({ text: 'Stage 2 : hausse significative du risque. Stage 3 : dépréciation avérée (défaut).' });
  await send(b, 'Explique en deux phrases la différence entre le stage 2 et le stage 3 d’IFRS 9.');
  await expect(b.getByText('dépréciation avérée (défaut)').first()).toBeVisible();
  const free = mock.requests.find((r) => r.model.startsWith('gpt-oss') || r.model.includes('nemotron') || r.model.includes('codestral'))!;
  expect(free).toBeTruthy();
  const sys = JSON.stringify(free.messages[0]);
  measures.compaction = {
    payant: { caracteres: size(full), outils: full.tools?.length ?? 0, modele: full.model },
    gratuit: { caracteres: size(free), outils: free.tools?.length ?? 0, modele: free.model },
    reduction: `${Math.round((1 - size(free) / size(full)) * 100)} %`,
    blocsJEV: ['jev_packet', 'jev_capsule', 'LEARNED_KNOWLEDGE', 'jev_focus'].filter((t) => sys.includes(t)),
  };
  console.log(JSON.stringify(measures.compaction));
  expect(size(free)).toBeLessThan(size(full));
  expect(free.tools?.length ?? 0).toBeLessThanOrEqual(14);
  await b.unrouteAll({ behavior: 'ignoreErrors' });
  await b.close();
});

test('pendant la requête : une boucle de répétition est coupée et la demande relancée avec la consigne corrective', async ({ page }) => {
  mock.reset();
  await boot(page, true);
  const loop = `Synthèse. ${'Le portefeuille reste exposé au secteur agricole. '.repeat(14)}`;
  mock.push({ text: loop, chunkDelayMs: 5 }, { text: 'Synthèse corrigée : exposition agricole élevée, à diversifier.' });
  await send(page, 'Fais une synthèse courte de l’exposition sectorielle.');
  await expect(page.getByText('Synthèse corrigée').first()).toBeVisible({ timeout: 30_000 });
  const second = mock.requests[1];
  const asked = JSON.stringify(second?.messages ?? []);
  measures.intervention = { appels: mock.requests.length, consigneCorrective: asked.includes('tournait en boucle') };
  console.log(JSON.stringify(measures.intervention));
  expect(asked).toContain('tournait en boucle');
});

test('réflexe : conversion BCE répondue par JEV seul (aucun appel de modèle)', async ({ page }) => {
  mock.reset();
  await boot(page, true);
  const t0 = Date.now();
  await send(page, 'convertis 2 000 dollars en euros');
  await expect(page.getByText(/1\s?786,51\s?EUR/).first()).toBeVisible();
  measures.reflexe = { ms: Date.now() - t0, appelsModele: mock.requests.length };
  expect(mock.requests.length).toBe(0);
});
