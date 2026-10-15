// ÉCONOMIE JEV ÷100 — bout en bout sans réseau (v64). L'app réelle, un faux OpenRouter qui FACTURE comme le vrai
// (jetons ≈ caractères / 4 de ce qui est réellement envoyé, au prix du catalogue du modèle demandé ; 0 $ pour « :free »).
// Seules les réponses des modèles sont écrites à l'avance ; tailles des requêtes, chemins et coûts sont ceux de l'app.
// Mesures écrites dans test-results/economy-measures.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { MOCK_MODELS, startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
const OUT = path.join(ROOT, 'test-results', 'economy-measures.json');
const FREE = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const PREMIUM = 'mock/smart-2'; // 3 $ / 15 $ par million de jetons : « ultra puissant » pour l'app (≥ 1 $)
test.describe.configure({ mode: 'serial' });

let mock: MockOpenRouter;
const measures: Record<string, unknown> = { at: new Date().toISOString() };
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct:single` first');
  mock = await startMockOpenRouter();
  reset();
});
/** Clears the queue and the recorded requests, keeping the catalogue with the free OpenRouter model. */
function reset() {
  mock.reset();
  mock.models = [
    ...MOCK_MODELS,
    { id: FREE, name: 'NVIDIA: Nemotron 3 Ultra (free)', created: 1_790_000_000, context_length: 1_000_000, architecture: { input_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, top_provider: { context_length: 1_000_000, max_completion_tokens: 32_000 }, supported_parameters: ['tools', 'tool_choice', 'temperature'] },
  ];
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
test.afterAll(async () => {
  await mock?.close();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(measures, null, 2));
});

async function boot(page: Page) {
  const relay = (base: string) => async (route: import('@playwright/test').Route) => {
    const res = await route.fetch({ url: route.request().url().replace(base, mock.url) });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  };
  await page.route('https://openrouter.ai/api/v1/**', relay('https://openrouter.ai/api/v1'));
  await page.route('https://api.llm7.io/v1/**', relay('https://api.llm7.io/v1'));
  await page.addLocatorHandler(page.getByTestId('design-go'), async () => {
    await page.getByTestId('design-go').click();
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-direct-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
}
const send = async (page: Page, text: string) => {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
};
type Req = MockOpenRouter['requests'][number];
const isVerifier = (r: Req) => JSON.stringify(r.messages).includes('VÉRIFICATEUR FINAL');

test('÷100 : brouillons et étapes d’outils par le gratuit, le modèle payant vérifie / corrige / refait — facteur mesuré', async ({ page }) => {
  test.setTimeout(240_000);
  reset();
  await boot(page);
  // The user's switch + the « ultra powerful » model (it becomes the chat's default model).
  await openView(page, 'Réglages');
  const panel = page.getByTestId('economy-panel');
  await panel.getByTestId('economy-toggle').getByRole('switch').click();
  await panel.locator('select').first().selectOption(PREMIUM);
  await page.getByRole('button', { name: 'Nouvelle session' }).click();
  await openView(page, 'Chat');
  await expect(page.locator('textarea')).toBeVisible();
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();

  // 1. A tool step then the final answer, both written by the free model; the paid model only validates.
  mock.push(
    { toolCalls: [{ name: 'skill.read', args: { name: 'apex-credit-risk', path: 'SKILL.md' } }], priced: true },
    { text: 'Le stage 2 regroupe les expositions dont le risque de crédit a augmenté significativement depuis l’octroi ; le stage 3 les actifs dépréciés (défaut avéré), provisionnés sur la durée de vie.', priced: true },
    { text: '{"verdict":"ok","patches":[],"lesson":"","why":"exact"}', priced: true },
  );
  await send(page, 'Consulte la skill de risque de crédit puis explique la différence entre le stage 2 et le stage 3 d’IFRS 9.');
  await expect(page.getByText('le stage 3 les actifs dépréciés (défaut avéré)').first()).toBeVisible({ timeout: 30_000 });
  const t1 = [...mock.requests];
  expect(t1.map((r) => r.model)).toEqual([FREE, FREE, PREMIUM]);
  expect(isVerifier(t1[2]!)).toBe(true);
  expect(t1[2]!.tools ?? []).toHaveLength(0); // the verifier gets no tools…
  expect(JSON.stringify(t1[2]!.messages)).toContain('le stage 3 les actifs dépréciés'); // …but the draft

  // 2. A localized error: the paid model answers with a patch, JEV applies it (the wrong words never stay).
  reset();
  mock.push(
    { text: 'Le stage 3 le classe comme probable sous l’hypothèque d’un crédit ; la provision passe à la perte attendue d’escompte.', priced: true },
    { text: '{"verdict":"fix","patches":[{"find":"le classe comme probable sous l’hypothèque d’un crédit","replace":"regroupe les actifs dépréciés (défaut avéré)"},{"find":"perte attendue d’escompte","replace":"perte attendue sur la durée de vie"}],"lesson":"Stage 3 = actifs dépréciés (défaut avéré), pertes attendues sur la durée de vie.","why":"définition fausse"}', priced: true },
  );
  await send(page, 'Rappelle ce qu’est le stage 3 d’IFRS 9 en une phrase.');
  await expect(page.getByText('regroupe les actifs dépréciés (défaut avéré)').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('perte attendue d’escompte')).toHaveCount(0);
  const t2 = [...mock.requests];
  expect(t2.map((r) => r.model)).toEqual([FREE, PREMIUM]);

  // 3. A wrong draft: refused, the paid model writes the answer (normal path, with its tools).
  reset();
  mock.push(
    { text: 'Le ratio de liquidité à court terme est de 42 % selon la circulaire de 1999 de la BCEAO.', priced: true },
    { text: '{"verdict":"redo","patches":[],"lesson":"Ne jamais citer un chiffre ou un texte réglementaire absent des éléments fournis.","why":"chiffres inventés"}', priced: true },
    { text: 'Le LCR rapporte les actifs liquides de haute qualité aux sorties nettes de trésorerie sur 30 jours ; le minimum réglementaire est fixé par le régulateur.', priced: true },
  );
  await send(page, 'Qu’est-ce que le ratio de liquidité à court terme ?');
  await expect(page.getByText('sorties nettes de trésorerie sur 30 jours').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('42 % selon la circulaire')).toHaveCount(0);
  const t3 = [...mock.requests];
  expect(t3.map((r) => r.model)).toEqual([FREE, PREMIUM, PREMIUM]);
  expect((t3[2]!.tools ?? []).length).toBeGreaterThan(0);

  // 4. Privacy: once a file tool has answered, the conversation carries the user's material → no free service.
  reset();
  mock.push(
    { toolCalls: [{ name: 'filesystem.write', args: { path: 'notes/eco.md', content: 'IFRS 9 : stages 1, 2, 3' } }], priced: true },
    { text: 'Note écrite dans notes/eco.md.', priced: true },
  );
  await send(page, 'Écris un résumé des trois stages dans notes/eco.md.');
  await expect(page.getByText('Note écrite dans notes/eco.md.').first()).toBeVisible({ timeout: 30_000 });
  const t4 = [...mock.requests];
  expect(t4.map((r) => r.model)).toEqual([FREE, PREMIUM]);
  expect(isVerifier(t4[1]!)).toBe(false);

  // The ledger, as the user sees it.
  await openView(page, 'Réglages');
  const stats = page.getByTestId('economy-stats');
  await expect(stats).toContainText('demande(s) au modèle payant');
  const factor = await page.getByTestId('economy-factor').innerText();
  const text = (await stats.innerText()).replace(/\s+/g, ' ');
  const size = (r: Req) => JSON.stringify({ m: r.messages, t: r.tools ?? [] }).length;
  measures.economie = {
    facteurAffiche: factor,
    registre: text.slice(0, 900),
    tour1: { appels: t1.map((r) => `${r.model} · ${size(r)} car.${isVerifier(r) ? ' (vérification)' : ''}`) },
    tour2: { appels: t2.map((r) => `${r.model} · ${size(r)} car.${isVerifier(r) ? ' (vérification)' : ''}`) },
    tour3: { appels: t3.map((r) => `${r.model} · ${size(r)} car.${isVerifier(r) ? ' (vérification)' : ''}`) },
    tour4_donnees: { appels: t4.map((r) => `${r.model} · ${size(r)} car.`) },
  };
  console.log(JSON.stringify(measures.economie, null, 2));
  // The verifier's request is a small fraction of a full chat request.
  expect(size(t1[2]!)).toBeLessThan(size(t1[1]!) / 5);
  expect(factor).toMatch(/^÷\d/);
  // The lesson the paid model wrote is kept for the free drafters (shown, removable).
  await expect(stats).toContainText('Stage 3 = actifs dépréciés');
});

test('÷100 sur une mission : 5 étapes d’outils écrites par le gratuit, 1 réponse finale vérifiée — facteur mesuré du tour', async ({ page }) => {
  test.setTimeout(240_000);
  reset();
  await boot(page);
  await openView(page, 'Réglages');
  const panel = page.getByTestId('economy-panel');
  await panel.getByTestId('economy-toggle').getByRole('switch').click();
  await panel.locator('select').first().selectOption(PREMIUM);
  await page.getByRole('button', { name: 'Nouvelle session' }).click();
  await openView(page, 'Chat');
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const paths = ['SKILL.md', 'references/01-classification.md', 'references/02-provisions.md', 'references/03-garanties.md', 'references/04-douteux-recouvrement-pcb.md'];
  mock.push(
    ...paths.map((p) => ({ toolCalls: [{ name: 'skill.read', args: { name: 'apex-credit-risk', path: p } }], priced: true })),
    { text: 'Synthèse : classement en sains, sensibles et douteux ; provisions selon l’ancienneté des impayés et la valeur des garanties retenues ; suivi des douteux jusqu’au recouvrement ou au passage en perte.', priced: true },
    { text: '{"verdict":"ok","patches":[],"lesson":"","why":"conforme aux références"}', priced: true },
  );
  await send(page, 'Lis les références de la skill de risque de crédit et fais-moi une synthèse de la méthode de classement et de provisionnement.');
  await expect(page.getByText('suivi des douteux jusqu’au recouvrement').first()).toBeVisible({ timeout: 60_000 });
  const reqs = [...mock.requests];
  expect(reqs.filter((r) => r.model === FREE)).toHaveLength(6);
  expect(reqs.filter((r) => r.model === PREMIUM)).toHaveLength(1);
  expect(isVerifier(reqs.at(-1)!)).toBe(true);
  await openView(page, 'Réglages');
  const factor = await page.getByTestId('economy-factor').innerText();
  const stats = (await page.getByTestId('economy-stats').innerText()).replace(/\s+/g, ' ');
  measures.mission = { facteurAffiche: factor, registre: stats.slice(0, 600), appels: reqs.map((r) => `${r.model}${isVerifier(r) ? ' (vérification)' : ''}`) };
  // The panel as the user sees it (design check).
  await page.getByTestId('economy-panel').screenshot({ path: path.join(ROOT, 'test-results', 'economy-panel.png') });
  console.log(JSON.stringify(measures.mission, null, 2));
  const f = Number(factor.replace('÷', '').replace(',', '.'));
  expect(f).toBeGreaterThan(50);
});
