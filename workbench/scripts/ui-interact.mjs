// Interactive UI check: editor, live preview, browser, data, chat with approval.
// Usage: node scripts/ui-interact.mjs <baseUrl> <token> <outDir> [model]
import { chromium } from 'playwright';
const [, , base, token, out, model = 'anthropic/claude-haiku-4.5'] = process.argv;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const nav = (label) => page.getByRole('button', { name: label, exact: true }).first().click();

await page.goto(`${base}/#token=${token}`);
await page.waitForSelector('textarea', { timeout: 20000 });

// 1. Code + Monaco + preview
await nav('Code');
await page.getByRole('button', { name: 'index.html' }).first().click();
await page.waitForSelector('.monaco-editor .view-lines', { timeout: 30000 });
await page.waitForTimeout(1500);
await shot('i1-editor');
await page.getByRole('button', { name: 'Aperçu en direct' }).click();
await page.waitForTimeout(2500);
await shot('i2-preview');

// 2. Browser live view
await nav('Navigateur');
await page.getByPlaceholder(/Saisissez une adresse/).fill('https://example.com');
await page.keyboard.press('Enter');
await page.waitForSelector('img[alt]:not([alt=""])', { timeout: 45000 });
await page.waitForTimeout(2000);
await shot('i3-browser');

// 3. Data
await nav('Données');
await page.getByRole('button', { name: /portefeuille\.csv/ }).click();
await page.waitForSelector('text=Anomalies détectées', { timeout: 20000 }).catch(() => undefined);
await page.waitForTimeout(800);
await shot('i4-data-profile');
await page.getByRole('tab', { name: 'Graphiques' }).click();
await page.waitForTimeout(2000);
await shot('i5-data-chart');

// 4. Chat with approval (NORMAL mode)
await nav('Chat');
const projects = await (await fetch(`${base}/api/projects`, { headers: H })).json();
const s = await (
  await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ projectId: projects[0].id, model, permissionMode: 'normal' }),
  })
).json();
await page.evaluate((id) => {
  const raw = JSON.parse(localStorage.getItem('wb.ui') || '{}');
  raw.sessionId = id;
  localStorage.setItem('wb.ui', JSON.stringify(raw));
}, s.id);
await page.reload();
await page.waitForSelector('textarea', { timeout: 20000 });
await page
  .locator('textarea')
  .first()
  .fill(
    'Crée un fichier notes/hello.txt contenant exactement « bonjour Dakar », puis affiche son contenu avec la commande cat.',
  );
await page.keyboard.press('Enter');
const approve = page.getByRole('button', { name: /Oui$/ }).first();
await approve.waitFor({ timeout: 120000 });
await page.waitForTimeout(500);
await shot('i6-approval');
await approve.click();
// a second approval may appear for nothing; wait for the run footer
await page.waitForSelector('text=/tokens · \\$/', { timeout: 180000 });
await page.waitForTimeout(1500);
await shot('i7-chat-done');
console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
