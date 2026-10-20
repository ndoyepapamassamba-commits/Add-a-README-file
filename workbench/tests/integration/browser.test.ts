import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BrowserManager } from '../../server/services/browserManager';

const PAGE = `<!doctype html><html><head><title>Formulaire test</title></head><body>
<h1>Bonjour Teranga</h1>
<input id="q" placeholder="Votre nom">
<button id="go" onclick="document.getElementById('out').textContent='Salut '+document.getElementById('q').value; console.log('clicked', document.getElementById('q').value)">Envoyer</button>
<p id="out"></p>
<a href="/file.csv" download>Télécharger le CSV</a>
<script>console.warn('page-loaded'); fetch('/api/data').then(r => r.json())</script>
</body></html>`;

let server: http.Server;
let base = '';
let dir: string;
const browser = new BrowserManager({ engine: 'chromium', headless: true, blockedPorts: [8787] });
const available = browser.isAvailable();

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-browser-'));
  server = http.createServer((req, res) => {
    if (req.url === '/file.csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="file.csv"');
      res.end('a,b\n1,2\n');
    } else if (req.url === '/api/data') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(PAGE);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await browser.shutdown();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!available)('BrowserManager (real Chromium)', () => {
  it('navigates, snapshots, types, clicks and reads the result', async () => {
    const st = await browser.navigate('t', dir, `${base}/`);
    expect(st.title).toBe('Formulaire test');
    const snap = await browser.snapshot('t', dir);
    expect(snap.text).toContain('Bonjour Teranga');
    const input = snap.elements.find((e) => e.placeholder === 'Votre nom')!;
    const button = snap.elements.find((e) => e.text === 'Envoyer')!;
    expect(input && button).toBeTruthy();
    await browser.type('t', dir, { ref: input.ref }, 'Awa');
    await browser.click('t', dir, { ref: button.ref });
    const after = await browser.snapshot('t', dir);
    expect(after.text).toContain('Salut Awa');
  }, 60_000);

  it('records actions, console and network activity', async () => {
    const logs = browser.logs('t');
    expect(logs.actions.map((a) => a.type)).toEqual(expect.arrayContaining(['navigate', 'type', 'click']));
    expect(logs.console.map((c) => c.text)).toEqual(expect.arrayContaining(['page-loaded', 'clicked Awa']));
    expect(logs.network.some((n) => n.url.endsWith('/api/data') && n.status === 200)).toBe(true);
  });

  it('takes PNG screenshots and downloads files into the project', async () => {
    const png = await browser.screenshot('t', dir);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const saved = await browser.download('t', dir, { text: 'Télécharger le CSV' });
    expect(fs.readFileSync(saved, 'utf8')).toBe('a,b\n1,2\n');
    expect(saved.startsWith(dir)).toBe(true);
  }, 60_000);

  it('blocks file:// and the workbench API port', async () => {
    await expect(browser.navigate('t', dir, 'file:///etc/passwd')).rejects.toThrow(/Blocked URL scheme/);
    await expect(browser.navigate('t', dir, 'http://127.0.0.1:8787/api/projects')).rejects.toThrow(/blocked/);
    await expect(browser.navigate('t', dir, 'javascript:alert(1)')).rejects.toThrow(/Blocked/);
  });

  it('renders HTML to PDF', async () => {
    const pdf = await browser.htmlToPdf('<h1>Rapport</h1>');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});
