import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page, type CDPSession, type BrowserType } from 'playwright';
import { redactSecrets } from '../security/redact';

export type EngineName = 'chromium' | 'firefox' | 'webkit';

export interface BrowserAction {
  id: string;
  ts: number;
  type: string;
  detail: string;
  ok: boolean;
  origin: 'agent' | 'user';
  error?: string;
}

export interface ConsoleEntry {
  ts: number;
  level: string;
  text: string;
  location?: string;
}

export interface NetworkEntry {
  id: string;
  ts: number;
  method: string;
  url: string;
  resourceType: string;
  status: number | null;
  durationMs: number | null;
  failure?: string;
}

export interface PageElement {
  ref: number;
  tag: string;
  role: string;
  text: string;
  href?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  value?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: PageElement[];
  links: { text: string; href: string }[];
  truncated: boolean;
}

export interface BrowserState {
  sessionKey: string;
  engine: EngineName;
  url: string;
  title: string;
  loading: boolean;
  viewport: { width: number; height: number };
}

const VIEWPORT = { width: 1280, height: 800 };
const RING = (n: number) => <T>(arr: T[], item: T) => {
  arr.push(item);
  if (arr.length > n) arr.splice(0, arr.length - n);
};
const push300 = RING(300);
const push500 = RING(500);

class BrowserSession {
  actions: BrowserAction[] = [];
  console: ConsoleEntry[] = [];
  network: NetworkEntry[] = [];
  cdp: CDPSession | null = null;
  screencasting = false;
  lastFrame: string | null = null;
  pollTimer: NodeJS.Timeout | null = null;
  loading = false;
  constructor(
    readonly key: string,
    readonly context: BrowserContext,
    public page: Page,
    public downloadsDir: string,
  ) {}
}

/** Extra CAs (not in Node's bundled roots) trusted by SPKI pinning — e.g. a corporate TLS proxy. */
function extraCaSpkiHashes(): string[] {
  const file = process.env.NODE_EXTRA_CA_CERTS;
  if (!file || !fs.existsSync(file)) return [];
  try {
    const pem = fs.readFileSync(file, 'utf8');
    const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    const roots = new Set(tls.rootCertificates.map((c) => c.replace(/\s/g, '')));
    return certs
      .filter((c) => !roots.has(c.replace(/\s/g, '')))
      .map((c) => crypto.createHash('sha256').update(new crypto.X509Certificate(c).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
  } catch {
    return [];
  }
}

// Collects interactive elements and tags them with data-wb-ref so the agent
// can target them precisely ("click ref 12").
const SNAPSHOT_SCRIPT = (maxChars: number) => {
  const doc = document;
  doc.querySelectorAll('[data-wb-ref]').forEach((el) => el.removeAttribute('data-wb-ref'));
  const selector =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=switch], [role=option], [contenteditable=true], [onclick], label[for]';
  const els = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  const out: {
    ref: number;
    tag: string;
    role: string;
    text: string;
    href?: string;
    type?: string;
    name?: string;
    placeholder?: string;
    value?: string;
  }[] = [];
  let ref = 1;
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width < 2 || rect.height < 2 || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    el.setAttribute('data-wb-ref', String(ref));
    const input = el as HTMLInputElement;
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || input.value || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    out.push({
      ref,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      text,
      href: (el as HTMLAnchorElement).href || undefined,
      type: input.type || undefined,
      name: input.name || undefined,
      placeholder: input.placeholder || undefined,
      value: ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase()) && input.type !== 'password' ? String(input.value || '').slice(0, 100) : undefined,
    });
    ref++;
    if (ref > 400) break;
  }
  const bodyText = (doc.body?.innerText || '').replace(/\n{3,}/g, '\n\n');
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .slice(0, 150)
    .map((a) => ({ text: (a.innerText || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 80), href: a.href }));
  return { url: location.href, title: doc.title, text: bodyText.slice(0, maxChars), truncated: bodyText.length > maxChars, elements: out, links };
};

/**
 * Server-side Playwright browser controlled by the agent and the user.
 * Each workbench session gets its own isolated BrowserContext.
 */
export class BrowserManager extends EventEmitter {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private sessions = new Map<string, BrowserSession>();
  private subscribers = new Map<string, number>();

  constructor(
    private readonly opts: { engine: EngineName; headless: boolean; blockedPorts: number[] },
  ) {
    super();
  }

  get engine(): EngineName {
    return this.opts.engine;
  }

  private engineType(): BrowserType {
    return { chromium, firefox, webkit }[this.opts.engine];
  }

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.engineType().executablePath());
    } catch {
      return false;
    }
  }

  private async launch(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      if (!this.isAvailable()) {
        throw new Error(`Browser engine "${this.opts.engine}" is not installed. Run: npx playwright install ${this.opts.engine}`);
      }
      const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
      const args: string[] = [];
      if (this.opts.engine === 'chromium') {
        const spki = extraCaSpkiHashes();
        if (spki.length) args.push(`--ignore-certificate-errors-spki-list=${spki.join(',')}`);
      }
      const browser = await this.engineType().launch({
        headless: this.opts.headless,
        args,
        proxy: proxyServer ? { server: proxyServer, bypass: process.env.NO_PROXY || process.env.no_proxy } : undefined,
      });
      browser.on('disconnected', () => {
        this.browser = null;
        this.sessions.clear();
      });
      this.browser = browser;
      return browser;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  async session(key: string, downloadsDir: string): Promise<BrowserSession> {
    const existing = this.sessions.get(key);
    if (existing && !existing.page.isClosed()) {
      existing.downloadsDir = downloadsDir;
      return existing;
    }
    const browser = await this.launch();
    const context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, locale: 'fr-FR' });
    // Never let a page reach the workbench API itself or the local filesystem.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      try {
        const u = new URL(url);
        if (u.protocol === 'file:') return route.abort('accessdenied');
        if (['127.0.0.1', 'localhost', '[::1]', '0.0.0.0'].includes(u.hostname) && this.opts.blockedPorts.includes(Number(u.port))) {
          return route.abort('accessdenied');
        }
      } catch {
        /* data:, blob: … */
      }
      return route.continue();
    });
    const page = await context.newPage();
    const s = new BrowserSession(key, context, page, downloadsDir);
    this.attachPage(s, page);
    context.on('page', (p) => {
      // Follow popups / target=_blank: the newest page becomes active.
      s.page = p;
      this.attachPage(s, p);
      this.logAction(s, 'popup', p.url(), true, 'agent');
      void this.restartScreencast(s);
    });
    this.sessions.set(key, s);
    if ((this.subscribers.get(key) ?? 0) > 0) await this.startScreencast(s);
    return s;
  }

  private attachPage(s: BrowserSession, page: Page): void {
    const starts = new Map<string, number>();
    page.on('console', (msg) => push500(s.console, { ts: Date.now(), level: msg.type(), text: redactSecrets(msg.text()).slice(0, 2000), location: msg.location().url }));
    page.on('pageerror', (err) => push500(s.console, { ts: Date.now(), level: 'error', text: redactSecrets(err.message).slice(0, 2000) }));
    page.on('request', (req) => {
      const id = randomUUID();
      starts.set(req.url() + req.method(), Date.now());
      push500(s.network, { id, ts: Date.now(), method: req.method(), url: redactSecrets(req.url()).slice(0, 500), resourceType: req.resourceType(), status: null, durationMs: null });
    });
    page.on('response', (res) => {
      const req = res.request();
      const entry = [...s.network].reverse().find((n) => n.url === redactSecrets(req.url()).slice(0, 500) && n.status === null);
      if (entry) {
        entry.status = res.status();
        const t = starts.get(req.url() + req.method());
        entry.durationMs = t ? Date.now() - t : null;
      }
    });
    page.on('requestfailed', (req) => {
      const entry = [...s.network].reverse().find((n) => n.url === redactSecrets(req.url()).slice(0, 500) && n.status === null);
      if (entry) entry.failure = req.failure()?.errorText ?? 'failed';
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) this.emitState(s);
    });
    page.on('load', () => {
      s.loading = false;
      this.emitState(s);
    });
    page.on('download', (download) => {
      void (async () => {
        const name = sanitizeFilename(download.suggestedFilename());
        fs.mkdirSync(s.downloadsDir, { recursive: true });
        const target = uniquePath(path.join(s.downloadsDir, name));
        await download.saveAs(target);
        this.logAction(s, 'download', path.basename(target), true, 'agent');
        this.emit('download', s.key, target);
      })().catch((err: Error) => this.logAction(s, 'download', err.message, false, 'agent'));
    });
  }

  private logAction(s: BrowserSession, type: string, detail: string, ok: boolean, origin: 'agent' | 'user', error?: string): BrowserAction {
    const a: BrowserAction = { id: randomUUID(), ts: Date.now(), type, detail: redactSecrets(detail).slice(0, 300), ok, origin, error };
    push300(s.actions, a);
    this.emit('action', s.key, a);
    return a;
  }

  private emitState(s: BrowserSession): void {
    const st = this.stateOf(s);
    void s.page
      .title()
      .then((title) => this.emit('state', s.key, { ...st, title }))
      .catch(() => this.emit('state', s.key, st));
  }

  private stateOf(s: BrowserSession): BrowserState {
    return { sessionKey: s.key, engine: this.opts.engine, url: s.page.isClosed() ? '' : s.page.url(), title: '', loading: s.loading, viewport: VIEWPORT };
  }

  async state(key: string): Promise<BrowserState | null> {
    const s = this.sessions.get(key);
    if (!s || s.page.isClosed()) return null;
    const st = this.stateOf(s);
    st.title = await s.page.title().catch(() => '');
    return st;
  }

  logs(key: string): { actions: BrowserAction[]; console: ConsoleEntry[]; network: NetworkEntry[] } {
    const s = this.sessions.get(key);
    return s ? { actions: s.actions, console: s.console, network: s.network } : { actions: [], console: [], network: [] };
  }

  lastFrame(key: string): string | null {
    return this.sessions.get(key)?.lastFrame ?? null;
  }

  // ── live view (screencast) ────────────────────────────────────────────
  async subscribe(key: string): Promise<void> {
    this.subscribers.set(key, (this.subscribers.get(key) ?? 0) + 1);
    const s = this.sessions.get(key);
    if (s) await this.startScreencast(s);
  }

  async unsubscribe(key: string): Promise<void> {
    const n = Math.max(0, (this.subscribers.get(key) ?? 1) - 1);
    this.subscribers.set(key, n);
    const s = this.sessions.get(key);
    if (s && n === 0) await this.stopScreencast(s);
  }

  private async startScreencast(s: BrowserSession): Promise<void> {
    if (s.screencasting) return;
    s.screencasting = true;
    if (this.opts.engine === 'chromium') {
      try {
        const cdp = await s.context.newCDPSession(s.page);
        s.cdp = cdp;
        cdp.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
          s.lastFrame = frame.data;
          this.emit('frame', s.key, frame.data);
          void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined);
        });
        await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 });
        return;
      } catch {
        s.cdp = null;
      }
    }
    // Fallback for Firefox/WebKit: periodic screenshots while someone watches.
    const tick = async () => {
      if (!s.screencasting) return;
      await this.captureFrame(s).catch(() => undefined);
      s.pollTimer = setTimeout(() => void tick(), 700);
    };
    void tick();
  }

  private async stopScreencast(s: BrowserSession): Promise<void> {
    s.screencasting = false;
    if (s.pollTimer) clearTimeout(s.pollTimer);
    if (s.cdp) {
      await s.cdp.send('Page.stopScreencast').catch(() => undefined);
      await s.cdp.detach().catch(() => undefined);
      s.cdp = null;
    }
  }

  private async restartScreencast(s: BrowserSession): Promise<void> {
    if (!s.screencasting) return;
    await this.stopScreencast(s);
    await this.startScreencast(s);
  }

  private async captureFrame(s: BrowserSession): Promise<string> {
    const buf = await s.page.screenshot({ type: 'jpeg', quality: 70 });
    s.lastFrame = buf.toString('base64');
    this.emit('frame', s.key, s.lastFrame);
    return s.lastFrame;
  }

  // ── actions ───────────────────────────────────────────────────────────
  private async act<T>(s: BrowserSession, type: string, detail: string, origin: 'agent' | 'user', fn: () => Promise<T>): Promise<T> {
    try {
      const r = await fn();
      this.logAction(s, type, detail, true, origin);
      if (!s.screencasting && (this.subscribers.get(s.key) ?? 0) > 0) await this.captureFrame(s).catch(() => undefined);
      else if (!s.cdp) await this.captureFrame(s).catch(() => undefined);
      this.emitState(s);
      return r;
    } catch (err) {
      const msg = (err as Error).message.split('\n')[0] ?? 'error';
      this.logAction(s, type, detail, false, origin, msg);
      throw new Error(msg);
    }
  }

  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 2_500 }).catch(() => undefined);
  }

  checkUrl(url: string): string {
    let u: URL;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (!['http:', 'https:'].includes(u.protocol) && u.href !== 'about:blank') throw new Error(`Blocked URL scheme: ${u.protocol}`);
    if (['127.0.0.1', 'localhost', '[::1]', '0.0.0.0'].includes(u.hostname) && this.opts.blockedPorts.includes(Number(u.port))) {
      throw new Error('Navigation to the workbench API is blocked');
    }
    return u.href;
  }

  async navigate(key: string, downloadsDir: string, url: string, origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    const href = this.checkUrl(url);
    s.loading = true;
    this.emitState(s);
    await this.act(s, 'navigate', href, origin, async () => {
      const res = await s.page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await this.settle(s.page);
      if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} for ${href}`);
    }).finally(() => {
      s.loading = false;
    });
    return (await this.state(key))!;
  }

  private locator(s: BrowserSession, target: { ref?: number; selector?: string; text?: string }) {
    if (target.ref !== undefined) return s.page.locator(`[data-wb-ref="${target.ref}"]`).first();
    if (target.selector) return s.page.locator(target.selector).first();
    if (target.text) return s.page.getByText(target.text, { exact: false }).first();
    throw new Error('Provide ref, selector, text or x/y');
  }

  async click(key: string, downloadsDir: string, target: { ref?: number; selector?: string; text?: string; x?: number; y?: number; button?: 'left' | 'right' | 'middle'; double?: boolean }, origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    const label = target.ref !== undefined ? `ref ${target.ref}` : target.selector ?? target.text ?? `(${target.x}, ${target.y})`;
    await this.act(s, 'click', label, origin, async () => {
      if (target.x !== undefined && target.y !== undefined && target.ref === undefined && !target.selector && !target.text) {
        await s.page.mouse.click(target.x, target.y, { button: target.button ?? 'left', clickCount: target.double ? 2 : 1 });
      } else {
        const loc = this.locator(s, target);
        if (target.double) await loc.dblclick({ timeout: 10_000 });
        else await loc.click({ timeout: 10_000, button: target.button ?? 'left' });
      }
      await this.settle(s.page);
    });
    return (await this.state(key))!;
  }

  async type(key: string, downloadsDir: string, target: { ref?: number; selector?: string; text?: string }, value: string, opts: { clear?: boolean; submit?: boolean } = {}, origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    const label = target.ref !== undefined ? `ref ${target.ref}` : target.selector ?? target.text ?? 'focused element';
    await this.act(s, 'type', `${label} ← "${value.length > 40 ? `${value.slice(0, 40)}…` : value}"`, origin, async () => {
      if (target.ref === undefined && !target.selector && !target.text) {
        await s.page.keyboard.type(value, { delay: 10 });
      } else {
        const loc = this.locator(s, target);
        if (opts.clear !== false) await loc.fill(value, { timeout: 10_000 });
        else await loc.pressSequentially(value, { timeout: 10_000 });
      }
      if (opts.submit) {
        await s.page.keyboard.press('Enter');
        await this.settle(s.page);
      }
    });
    return (await this.state(key))!;
  }

  async press(key: string, downloadsDir: string, keys: string, origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    await this.act(s, 'press', keys, origin, async () => {
      await s.page.keyboard.press(keys);
      await this.settle(s.page);
    });
    return (await this.state(key))!;
  }

  async scroll(key: string, downloadsDir: string, opts: { direction?: 'up' | 'down' | 'left' | 'right'; amount?: number; ref?: number; deltaX?: number; deltaY?: number; x?: number; y?: number }, origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    const amount = opts.amount ?? 600;
    await this.act(s, 'scroll', opts.ref !== undefined ? `to ref ${opts.ref}` : `${opts.direction ?? 'delta'} ${amount}`, origin, async () => {
      if (opts.ref !== undefined) {
        await s.page.locator(`[data-wb-ref="${opts.ref}"]`).first().scrollIntoViewIfNeeded({ timeout: 5000 });
        return;
      }
      if (opts.x !== undefined && opts.y !== undefined) await s.page.mouse.move(opts.x, opts.y);
      const dx = opts.deltaX ?? (opts.direction === 'left' ? -amount : opts.direction === 'right' ? amount : 0);
      const dy = opts.deltaY ?? (opts.direction === 'up' ? -amount : opts.direction === 'down' || !opts.direction ? amount : 0);
      await s.page.mouse.wheel(dx, dy);
      await s.page.waitForTimeout(250);
    });
    return (await this.state(key))!;
  }

  async history(key: string, downloadsDir: string, action: 'back' | 'forward' | 'reload', origin: 'agent' | 'user' = 'agent'): Promise<BrowserState> {
    const s = await this.session(key, downloadsDir);
    await this.act(s, action, s.page.url(), origin, async () => {
      if (action === 'back') await s.page.goBack({ timeout: 20_000 });
      else if (action === 'forward') await s.page.goForward({ timeout: 20_000 });
      else await s.page.reload({ timeout: 30_000 });
      await this.settle(s.page);
    });
    return (await this.state(key))!;
  }

  async screenshot(key: string, downloadsDir: string, opts: { fullPage?: boolean } = {}, origin: 'agent' | 'user' = 'agent'): Promise<Buffer> {
    const s = await this.session(key, downloadsDir);
    return this.act(s, 'screenshot', opts.fullPage ? 'full page' : 'viewport', origin, () => s.page.screenshot({ type: 'png', fullPage: Boolean(opts.fullPage) }));
  }

  async snapshot(key: string, downloadsDir: string, maxChars = 12_000, origin: 'agent' | 'user' = 'agent'): Promise<PageSnapshot> {
    const s = await this.session(key, downloadsDir);
    return this.act(s, 'extract', s.page.url(), origin, async () => {
      const snap = (await s.page.evaluate(SNAPSHOT_SCRIPT, maxChars)) as PageSnapshot;
      return { ...snap, text: redactSecrets(snap.text) };
    });
  }

  async download(key: string, downloadsDir: string, target: { url?: string; ref?: number; selector?: string; text?: string }, origin: 'agent' | 'user' = 'agent'): Promise<string> {
    const s = await this.session(key, downloadsDir);
    fs.mkdirSync(downloadsDir, { recursive: true });
    return this.act(s, 'download', target.url ?? `ref ${target.ref ?? target.selector ?? target.text}`, origin, async () => {
      if (target.url) {
        const href = this.checkUrl(target.url);
        const res = await s.context.request.get(href, { timeout: 120_000 });
        if (!res.ok()) throw new Error(`HTTP ${res.status()} downloading ${href}`);
        const disposition = res.headers()['content-disposition'] ?? '';
        const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
        const name = sanitizeFilename(decodeURIComponent(fromHeader ?? new URL(href).pathname.split('/').pop() ?? '') || 'download');
        const target2 = uniquePath(path.join(downloadsDir, name));
        fs.writeFileSync(target2, await res.body());
        return target2;
      }
      const [download] = await Promise.all([s.page.waitForEvent('download', { timeout: 60_000 }), this.locator(s, target).click({ timeout: 10_000 })]);
      const file = uniquePath(path.join(downloadsDir, sanitizeFilename(download.suggestedFilename())));
      await download.saveAs(file);
      return file;
    });
  }

  async close(key: string): Promise<void> {
    const s = this.sessions.get(key);
    if (!s) return;
    await this.stopScreencast(s);
    await s.context.close().catch(() => undefined);
    this.sessions.delete(key);
  }

  async shutdown(): Promise<void> {
    for (const key of [...this.sessions.keys()]) await this.close(key);
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }

  /** Renders HTML to PDF (used for reports and exports). Chromium only. */
  async htmlToPdf(html: string): Promise<Buffer> {
    if (this.opts.engine !== 'chromium') throw new Error('PDF export requires the chromium engine');
    const browser = await this.launch();
    const context = await browser.newContext();
    try {
      await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    } finally {
      await context.close();
    }
  }
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 150);
  return cleaned || 'file';
}

export function uniquePath(p: string): string {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} (${i})${ext}`;
    if (!fs.existsSync(cand)) return cand;
  }
  return `${base}-${Date.now()}${ext}`;
}
