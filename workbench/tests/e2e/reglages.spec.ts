// RÉGLAGES SANS CHAMP VIDE (23/10/2026, « il y a énormément dans les réglages des champs vides, il faut les renseigner »).
// Contrôle permanent tiré de l'audit de ce jour : à la première ouverture, chaque champ visible de Paramètres (Avancé
// ouvert compris) porte une valeur ou un choix nommé — règles et crochets par défaut, formulaire de crochet prérempli,
// clés facultatives affichées comme un état (« ✓ sans clé : … ») avec un bouton, pont diagnostiqué au lieu d'un code vide.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';
import { openView } from './nav';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  if (!fs.existsSync(FILE)) throw new Error('Run `npm run build:direct` before the e2e tests');
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

test('Paramètres: no visible field is empty on first opening (Avancé included)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const res = await route.fetch({
      url: route.request().url().replace('https://openrouter.ai/api/v1', mock.url),
    });
    await route.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-reglages');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByText('Nouvelle mission')).toBeVisible();
  await openView(page, 'Paramètres');
  await expect(page.getByTestId('bridge-diag')).not.toBeEmpty({ timeout: 15_000 });
  await page.getByTestId('settings-advanced').locator('summary').click();
  const empty = await page.evaluate(() => {
    const out: string[] = [];
    const name = (e: Element) =>
      e.getAttribute('data-testid') ||
      e.getAttribute('placeholder') ||
      (e.parentElement?.previousElementSibling?.textContent ?? '').trim().slice(0, 60) ||
      e.tagName;
    for (const el of Array.from(document.querySelectorAll('main input, main textarea, main select'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el instanceof HTMLSelectElement) {
        const label = el.selectedOptions[0]?.textContent?.trim() ?? '';
        if (!label || label.startsWith('—')) out.push(`liste sans choix nommé : ${name(el)}`);
      } else if (el instanceof HTMLInputElement) {
        if (['checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes(el.type)) continue;
        if (!el.value.trim()) out.push(`champ vide : ${name(el)}`);
      } else if (el instanceof HTMLTextAreaElement && !el.value.trim()) out.push(`zone vide : ${name(el)}`);
    }
    return out;
  });
  expect(empty).toEqual([]);
  // what used to be empty is now filled with safe defaults or shown as a state
  await expect(page.getByTestId('harness-rules-deny')).toHaveValue(/Read\(\*\.env\)/);
  await expect(page.getByTestId('harness-rules-ask')).toHaveValue(/Bash\(git push\*\)/);
  await expect(page.getByTestId('harness-hooks')).toContainText('Fichier de secrets');
  await expect(page.getByTestId('hook-body')).not.toHaveValue('');
  await expect(page.getByTestId('tavily-key-status')).toContainText('sans clé');
  await expect(page.getByTestId('bridge-diag')).toContainText('Lancer le pont');
  await expect(page.getByTestId('bridge-code')).toHaveCount(0);
  // a secret is never prefilled: the field appears on demand and the key is then shown masked
  await page.getByTestId('tavily-key-edit').click();
  await page.getByTestId('tavily-key').fill('tvly-e2e-0123456789');
  await page.getByTestId('tavily-key-save').click();
  await expect(page.getByTestId('tavily-key-status')).toContainText('tvly');
  await expect(page.getByTestId('tavily-key-status')).not.toContainText('tvly-e2e-0123456789');
  expect(errors).toEqual([]);
});
