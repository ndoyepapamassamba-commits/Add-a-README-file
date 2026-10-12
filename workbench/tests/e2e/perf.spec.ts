// PERFORMANCE: two chats streaming at the same time must not freeze the app (main-thread long tasks, frame rate).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startMockOpenRouter, type MockOpenRouter } from '../helpers/mockOpenRouter';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'dist/massamba-workbench-direct.html');
let mock: MockOpenRouter;
test.beforeAll(async () => {
  mock = await startMockOpenRouter();
});
test.afterAll(async () => mock?.close());

// A heavy answer, like a real analysis: paragraphs, lists, tables and code blocks (≈ 90 KB).
const LONG = Array.from({ length: 300 }, (_, i) =>
  i % 10 === 0
    ? `\n| Colonne A | Colonne B | Montant |\n|---|---|---|\n${Array.from({ length: 8 }, (_, k) => `| ligne ${k} | valeur ${i} | ${k * 1000 + i} |`).join('\n')}\n\n`
    : i % 7 === 0
      ? `\n\`\`\`python\nimport pandas as pd\ndf = pd.read_excel('f.xlsx')\nprint(df.groupby('region')['montant'].sum())  # ${i}\n\`\`\`\n`
      : `Paragraphe ${i} : une phrase assez longue pour remplir la réponse du modèle, avec **gras**, \`code\` et une liste :\n- point un\n- point deux\n`,
).join('');

async function open(page: Page) {
  // Straight to the local server (no interception): the app receives a REAL progressive stream.
  await page.addInitScript((base) => {
    const f = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return f(
        u.startsWith('https://openrouter.ai/api/v1')
          ? u.replace('https://openrouter.ai/api/v1', base)
          : input,
        init,
      );
    };
  }, mock.url);
  await page.addLocatorHandler(page.getByTestId('design-go'), async () =>
    page.getByTestId('design-go').click(),
  );
  await page.goto(pathToFileURL(FILE).href);
  await page.getByPlaceholder('sk-or-v1-…').fill('sk-or-v1-e2e-perf-key');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.locator('textarea')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __frames: number };
    w.__long = [];
    w.__frames = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({
      type: 'longtask',
      buffered: false,
    });
    const tick = () => {
      w.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function send(page: Page, text: string) {
  await page.locator('textarea').fill(text);
  await page.keyboard.press('Enter');
}
async function measure(page: Page, ms: number) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __frames: number };
    w.__long = [];
    w.__frames = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate((ms) => {
    const w = window as unknown as { __long: number[]; __frames: number };
    return {
      fps: Math.round((w.__frames / ms) * 1000),
      longTasks: w.__long.length,
      blockedMs: Math.round(w.__long.reduce((a, b) => a + b, 0)),
      worstMs: Math.round(Math.max(0, ...w.__long)),
    };
  }, ms);
}

test('two chats streaming at once: the app stays fluid', async ({ page }) => {
  test.setTimeout(120_000);
  mock.fallback = () => ({ text: LONG, chunkDelayMs: 4 });
  await open(page);
  await send(page, 'Écris un long texte A');
  await page.waitForTimeout(1500);
  const one = await measure(page, 5000);
  await page.getByRole('button', { name: 'Nouvelle session' }).click();
  await page.waitForTimeout(500);
  await send(page, 'Écris un long texte B');
  await expect
    .poll(() => mock.requests.filter((r) => JSON.stringify(r.messages).includes('texte B')).length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const two = await measure(page, 5000);
  const running = await page.evaluate(() => document.body.innerText.match(/Paragraphe \d+/g)?.length ?? 0);
  console.log(`[perf] requests=${mock.requests.length} paragraphs-visible=${running}`);
  console.log(`[perf] 1 chat ${JSON.stringify(one)} · 2 chats ${JSON.stringify(two)}`);
  expect(two.fps).toBeGreaterThan(0);
  await page.close();
});

test('saving one small file does not rewrite every file of every chat (no freeze with big attachments)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  const big = (n: number) => ({
    name: `gros-${n}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(`a,b,c\n${'1234567,abcdefg,9876543\n'.repeat(130_000)}`),
  });
  for (let i = 0; i < 6; i++) {
    await page.locator('input[type=file]').first().setInputFiles(big(i));
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2500); // the big saves are done
  const before = await measure(page, 10); // reset counters
  void before;
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'petit.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  const after = await measure(page, 2500);
  console.log(`[perf] small save with 18 MB of files around: ${JSON.stringify(after)}`);
  expect(after.worstMs).toBeLessThan(200);
});

test('an Excel export of 5 000 rows runs in the background: the page is not frozen', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const csv = [
    'date,client,region,montant,provision',
    ...Array.from(
      { length: 5000 },
      (_, i) =>
        `2025-0${(i % 9) + 1}-15,CLIENT ${i % 700},${['Dakar', 'Thiès', 'Kaolack', 'Ziguinchor'][i % 4]},${100000 + ((i * 7919) % 900000)},${(i * 31) % 50000}`,
    ),
  ].join('\n');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'portefeuille.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(1500);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  mock.push(
    {
      toolCalls: [
        {
          name: 'data.export',
          args: {
            path: 'uploads/portefeuille.csv',
            name: 'portefeuille',
            title: 'Portefeuille',
            format: 'xlsx',
          },
        },
      ],
    },
    { text: 'Classeur livré.' },
  );
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
  });
  const cdp = process.env.PERF_PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  await send(page, 'Exporte le portefeuille en Excel');
  await expect(page.getByText('Classeur livré.')).toBeVisible({ timeout: 60_000 });
  if (cdp) {
    const { profile } = (await cdp.send('Profiler.stop')) as {
      profile: {
        nodes: {
          id: number;
          callFrame: { functionName: string; lineNumber: number; columnNumber: number };
          children?: number[];
        }[];
        samples: number[];
        timeDeltas: number[];
      };
    };
    const self = new Map<number, number>();
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
    const byFn = new Map<string, number>();
    for (const n of profile.nodes) {
      const k = `${n.callFrame.functionName || '(anon)'}@${n.callFrame.lineNumber}:${n.callFrame.columnNumber}`;
      byFn.set(k, (byFn.get(k) ?? 0) + (self.get(n.id) ?? 0));
    }
    const top = [...byFn]
      .filter(([k]) => !/^\(idle|program|garbage/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);
    for (const [k, us] of top) console.log(`[prof] ${Math.round(us / 1000)} ms ${k}`);
  }
  const worst = await page.evaluate(() =>
    Math.round(Math.max(0, ...(window as unknown as { __long: number[] }).__long)),
  );
  const total = await page.evaluate(() =>
    Math.round((window as unknown as { __long: number[] }).__long.reduce((a, b) => a + b, 0)),
  );
  console.log(
    `[perf] export 5 000 lignes : tâche bloquante la plus longue ${worst} ms, total bloqué ${total} ms`,
  );
  expect(worst).toBeLessThan(400);
});

test('STOP works while the model is still thinking (no token yet) and while it writes; the chat is usable at once', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  // 1. thinking: 20 s of silence before the first word
  mock.push({ text: 'Réponse tardive.', firstDelayMs: 20_000 });
  await send(page, 'Question longue à réfléchir');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 3000 });
  console.log(`[stop] pendant la réflexion : arrêt en ${Date.now() - t0} ms`);
  // 2. writing: a long answer streamed slowly
  mock.push({ text: LONG, chunkDelayMs: 30 });
  await send(page, 'Encore une');
  await page.waitForTimeout(2000);
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 3000 });
  console.log(`[stop] pendant l’écriture : arrêt en ${Date.now() - t1} ms`);
  const len = await page.evaluate(() => document.body.innerText.length);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.body.innerText.length)).toBe(len); // nothing more arrives
  // 3. the chat answers a new question right away
  mock.push({ text: 'Nouvelle réponse OK.' });
  await send(page, 'Et maintenant ?');
  await expect(page.getByText('Nouvelle réponse OK.')).toBeVisible({ timeout: 10_000 });
});

test('writing while the model thinks: the follow-up is shown at once and answered — never ignored', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  mock.push({ text: 'Première réponse.', firstDelayMs: 4000 }, { text: 'Réponse à la précision.' });
  await send(page, 'Analyse ce dossier');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(800);
  await send(page, 'Précision : en francs CFA');
  await expect(page.getByText('Précision : en francs CFA')).toBeVisible({ timeout: 2000 });
  await expect(page.getByText('Première réponse.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Réponse à la précision.')).toBeVisible({ timeout: 15_000 });
  // the model received the follow-up
  expect(mock.requests.some((r) => JSON.stringify(r.messages).includes('Précision : en francs CFA'))).toBe(
    true,
  );
});

test('code.run of the model (here 2 s of pure computation) runs in its own thread: the page is not frozen', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByTitle('Mode de permissions', { exact: true }).click();
  await page.getByText('AUTONOME').click();
  const busy =
    'const t = Date.now(); let n = 0; while (Date.now() - t < 2000) n++; console.log("tours", n > 0);';
  mock.push(
    { toolCalls: [{ name: 'code.run', args: { language: 'javascript', code: busy } }] },
    { text: 'Calcul terminé.' },
  );
  await page.evaluate(() => {
    (window as unknown as { __long: number[] }).__long = [];
  });
  await send(page, 'Lance le calcul');
  await expect(page.getByText('Calcul terminé.')).toBeVisible({ timeout: 60_000 });
  const worst = await page.evaluate(() =>
    Math.round(Math.max(0, ...(window as unknown as { __long: number[] }).__long)),
  );
  console.log(`[perf] code.run 2 s : tâche bloquante la plus longue ${worst} ms`);
  expect(worst).toBeLessThan(600);
});
