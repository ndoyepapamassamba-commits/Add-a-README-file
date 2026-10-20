// UI smoke test: opens the built client, visits every view, captures screenshots
// and console errors. Usage: node scripts/ui-smoke.mjs <baseUrl> <token> <outDir>
import { chromium } from 'playwright';
const [, , base, token, out] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${base}/#token=${token}`);
await page.waitForSelector('textarea', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/01-chat.png` });
const views = [
  ['Code', 'code'],
  ['Terminal', 'terminal'],
  ['Navigateur', 'browser'],
  ['Données', 'data'],
  ['Agents', 'agents'],
  ['Skills', 'skills'],
  ['Plugins', 'plugins'],
  ['Tâches', 'tasks'],
  ['Modèles', 'models'],
  ['Projets', 'projects'],
  ['Réglages', 'settings'],
];
let i = 2;
for (const [label, id] of views) {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${String(i++).padStart(2, '0')}-${id}.png` });
}
console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
