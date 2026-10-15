// Captures de contrôle design (bureau 1440 px, mobile 390 px, clair et sombre) de l'app compilée, pour relire
// l'interface avant livraison : `node scripts/design-captures.mjs <dossier de sortie>`.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.argv[2] ?? 'test-results/design');
fs.mkdirSync(out, { recursive: true });
const file = pathToFileURL(path.resolve('dist/massamba-workbench-direct.html')).href;
const VIEWS = [
  ['accueil', null],
  ['chats', 'Chats'],
  ['cockpit', 'Cockpit IA'],
  ['observabilite', 'Observabilité'],
  ['parametres', 'Paramètres'],
];
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  for (const [vp, size] of [
    ['bureau', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: vp === 'mobile' ? 2 : 1, colorScheme: theme });
    await page.route(/^https?:\/\//, (r) => r.abort());
    await page.goto(file);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, `${theme}-${vp}-0-ouverture.png`) });
    const noKey = page.getByRole('button', { name: /Utiliser sans clé/ });
    if (await noKey.isVisible().catch(() => false)) await noKey.click();
    await page.waitForTimeout(1200);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const [name, nav] of VIEWS) {
      if (nav) {
        const menu = page.getByRole('button', { name: /menu|navigation/i }).first();
        if (vp === 'mobile' && (await menu.isVisible().catch(() => false))) await menu.click().catch(() => {});
        await page.getByTestId('main-nav').getByRole('button', { name: nav, exact: true }).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(700);
      }
      await page.screenshot({ path: path.join(out, `${theme}-${vp}-${name}.png`) });
    }
    await page.close();
  }
}
await browser.close();
console.log('captures →', out);
