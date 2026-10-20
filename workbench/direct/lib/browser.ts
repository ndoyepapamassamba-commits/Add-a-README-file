// Embedded browser (direct edition). One sandboxed iframe (opaque origin: no
// access to this page, the API key or IndexedDB) driven through a bridge
// script: snapshot with element refs, click, type, select, upload a workspace
// file into <input type=file>, console capture and download capture (exports
// of generated apps land in the workspace under downloads/).
// Web pages (http/https) are shown in reader mode through r.jina.ai, because a
// browser page cannot frame or script third-party sites.
import { marked } from 'marked';
import { bytesOf, getFile, normPath, uniquePath, writeBytes } from './vfs';

export interface BrowserEl {
  ref: string;
  tag: string;
  type?: string;
  label: string;
  value?: string;
  disabled?: boolean;
}
export interface BrowserSnapshot {
  title: string;
  url: string;
  text: string;
  elements: BrowserEl[];
}
export interface BrowserState {
  url: string;
  title: string;
  mode: 'app' | 'reader' | 'blank';
  loading: boolean;
  history: string[];
  console: string[];
  downloads: { name: string; path: string; size: number }[];
}

const READER = 'https://r.jina.ai/';

/** Script injected first in every page: the agent's hands and eyes. */
const BRIDGE = `<script>(function(){
var P=parent, TOK='__TOKEN__', n=0;
function post(m){ try{ P.postMessage(Object.assign({mbr:TOK},m),'*'); }catch(e){} }
['log','info','warn','error'].forEach(function(k){ var o=console[k]; console[k]=function(){ try{ post({console:k+': '+[].map.call(arguments,function(a){try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' ')}); }catch(e){} return o.apply(console,arguments); }; });
addEventListener('error',function(e){ post({console:'error: '+(e.message||e)}); });
addEventListener('unhandledrejection',function(e){ post({console:'error: Promise '+(e.reason&&e.reason.message||e.reason)}); });
function grab(a){ var href=a.href, name=a.getAttribute('download')||(href.split('/').pop()||'fichier');
  if(!/^(blob|data):/.test(href)) return false;
  fetch(href).then(function(r){ return r.blob(); }).then(function(b){ return b.arrayBuffer().then(function(buf){ post({download:{name:name,mime:b.type,bytes:buf}}); }); }).catch(function(e){ post({console:'error: téléchargement '+e}); });
  return true; }
var oc=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.hasAttribute('download')&&grab(this)) return; if(this.dataset.mbrNav!==undefined) return; return oc.apply(this,arguments); };
document.addEventListener('click',function(e){ var a=e.target&&e.target.closest&&e.target.closest('a'); if(!a) return;
  if(a.hasAttribute('download')){ if(grab(a)) e.preventDefault(); return; }
  var h=a.getAttribute('href')||''; if(/^https?:/.test(h)||a.dataset.mbrNav!==undefined){ e.preventDefault(); post({navigate:a.href||h}); } },true);
window.open=function(u){ if(u) post({navigate:String(u)}); return null; };
function vis(el){ var r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; }
function label(el){ return (el.getAttribute('aria-label')||el.innerText||el.value||el.placeholder||el.title||el.name||el.id||'').replace(/\\s+/g,' ').trim().slice(0,90); }
function snap(){ var els=[].slice.call(document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button],[role=tab],[onclick],label[for]'));
  var out=[]; els.forEach(function(el){ if(!vis(el)&&!(el.type==='file')) return; if(!el.dataset.mref) el.dataset.mref='e'+(++n);
    out.push({ref:el.dataset.mref,tag:el.tagName.toLowerCase(),type:el.type||undefined,label:label(el),value:(el.type==='password'?undefined:(el.value!==undefined&&el.tagName!=='BUTTON'?String(el.value).slice(0,80):undefined)),disabled:!!el.disabled}); });
  return {title:document.title,url:location.href,text:(document.body?document.body.innerText:'').replace(/\\n{3,}/g,'\\n\\n').slice(0,12000),elements:out.slice(0,250)}; }
function el(ref){ var e=document.querySelector('[data-mref="'+ref+'"]'); if(!e) throw new Error('élément '+ref+' introuvable (refaites un snapshot)'); return e; }
addEventListener('message',function(ev){ var d=ev.data; if(!d||d.mbrCmd===undefined||d.tok!==TOK) return; var res;
  try{ var c=d.mbrCmd;
    if(c==='snapshot') res=snap();
    else if(c==='click'){ var e=el(d.ref); e.scrollIntoView({block:'center'}); e.click(); res={ok:true}; }
    else if(c==='type'){ var t=el(d.ref); t.focus(); var proto=t.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; var setter=Object.getOwnPropertyDescriptor(proto,'value').set; setter.call(t,d.text); t.dispatchEvent(new Event('input',{bubbles:true})); t.dispatchEvent(new Event('change',{bubbles:true})); if(d.submit){ var f=t.form; if(f){ f.requestSubmit?f.requestSubmit():f.submit(); } else t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); } res={ok:true}; }
    else if(c==='select'){ var s=el(d.ref); s.value=d.value; s.dispatchEvent(new Event('change',{bubbles:true})); res={ok:true}; }
    else if(c==='upload'){ var i=el(d.ref); var dt=new DataTransfer(); dt.items.add(new File([d.bytes],d.name,{type:d.mime||''})); i.files=dt.files; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); res={ok:true}; }
    else if(c==='scroll'){ scrollBy(0,(d.dy||600)); res={ok:true}; }
    else throw new Error('commande inconnue');
  }catch(err){ res={error:String(err&&err.message||err)}; }
  post({reply:d.id,res:res}); });
addEventListener('load',function(){ post({loaded:true,title:document.title}); });
})();</script>`;

type Listener = () => void;

class EmbeddedBrowser {
  frame: HTMLIFrameElement | null = null;
  private token = '';
  private pending = new Map<string, (r: unknown) => void>();
  private listeners = new Set<Listener>();
  private loaded: (() => void) | null = null;
  state: BrowserState = {
    url: '',
    title: '',
    mode: 'blank',
    loading: false,
    history: [],
    console: [],
    downloads: [],
  };

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', (e) => this.onMessage(e));
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private set(p: Partial<BrowserState>) {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }
  /** The iframe lives for the whole session (the agent can drive it even when the view is closed). */
  ensureFrame(): HTMLIFrameElement {
    if (this.frame) return this.frame;
    const f = document.createElement('iframe');
    f.title = 'Navigateur intégré';
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads');
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0;background:#fff';
    document.body.appendChild(f);
    this.frame = f;
    return f;
  }
  private onMessage(e: MessageEvent) {
    const d = e.data as Record<string, unknown> | null;
    if (!d || d.mbr !== this.token || !this.frame || e.source !== this.frame.contentWindow) return;
    if (typeof d.console === 'string') this.set({ console: [...this.state.console.slice(-299), d.console] });
    if (d.loaded) {
      this.set({ loading: false, title: String(d.title ?? '') || this.state.title });
      this.loaded?.();
      this.loaded = null;
    }
    if (typeof d.navigate === 'string') void this.open(d.navigate);
    if (d.download && typeof d.download === 'object') {
      const dl = d.download as { name: string; mime: string; bytes: ArrayBuffer };
      const path = uniquePath(`downloads/${dl.name.replace(/[\\/:*?"<>|]+/g, '_') || 'fichier'}`);
      writeBytes(path, new Uint8Array(dl.bytes), dl.mime);
      this.set({ downloads: [...this.state.downloads, { name: dl.name, path, size: dl.bytes.byteLength }] });
    }
    if (typeof d.reply === 'string') {
      this.pending.get(d.reply)?.(d.res);
      this.pending.delete(d.reply);
    }
  }
  private load(html: string, url: string, mode: BrowserState['mode']): Promise<void> {
    const f = this.ensureFrame();
    this.token = Math.random().toString(36).slice(2);
    const bridge = BRIDGE.replace('__TOKEN__', this.token);
    const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + bridge) : bridge + html;
    this.set({
      url,
      mode,
      loading: true,
      history: this.state.history.at(-1) === url ? this.state.history : [...this.state.history, url],
    });
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.set({ loading: false });
        resolve();
      }, 15_000);
      this.loaded = () => {
        clearTimeout(t);
        resolve();
      };
      f.srcdoc = doc;
    });
  }
  /** Opens a workspace HTML file (app mode) or a web page (reader mode). */
  async open(target: string): Promise<BrowserSnapshot> {
    const t = target.trim();
    if (/^https?:\/\//i.test(t)) {
      this.set({ url: t, loading: true, mode: 'reader' });
      let r: Response;
      try {
        r = await fetch(READER + t, { headers: { Accept: 'text/plain' } });
      } catch {
        this.set({ loading: false });
        throw new Error('Page inaccessible : pas de réseau, ou le service de lecture r.jina.ai est bloqué.');
      }
      if (!r.ok) {
        this.set({ loading: false });
        throw new Error(`Lecture de la page impossible (HTTP ${r.status}).`);
      }
      const md = await r.text();
      const title = /^Title:\s*(.+)$/m.exec(md)?.[1] ?? t;
      const body = md
        .replace(/^(Title|URL Source|Published Time):.*$/gm, '')
        .replace(/^Markdown Content:\s*/m, '');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>body{font:15px/1.6 'Segoe UI',system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 18px;color:#1d2a33}a{color:#1A86B3}img{max-width:100%}pre{overflow:auto;background:#f3f6f8;padding:8px}table{border-collapse:collapse}td,th{border:1px solid #d5dee5;padding:4px 8px}.rd{font-size:12px;color:#687;border-bottom:1px solid #e3e8ec;padding-bottom:6px;margin-bottom:12px}</style></head><body><div class="rd">Mode lecture · ${t.replace(/</g, '&lt;')}</div>${marked.parse(body, { async: false }) as string}</body></html>`;
      await this.load(html, t, 'reader');
    } else {
      const path = normPath(t.replace(/^\/+/, ''));
      const f = getFile(path);
      if (!f) throw new Error(`Fichier introuvable dans l'espace de travail : ${path}`);
      const html = f.binary ? new TextDecoder().decode(bytesOf(f)) : f.data;
      await this.load(html, path, 'app');
    }
    await new Promise((r) => setTimeout(r, 400));
    return this.snapshot();
  }
  async reload(): Promise<BrowserSnapshot> {
    if (!this.state.url) throw new Error('Aucune page ouverte.');
    return this.open(this.state.url);
  }
  async back(): Promise<BrowserSnapshot> {
    const h = this.state.history;
    if (h.length < 2) throw new Error('Pas de page précédente.');
    this.set({ history: h.slice(0, -2) });
    return this.open(h[h.length - 2]!);
  }
  private send<T>(
    cmd: string,
    extra: Record<string, unknown> = {},
    transfer: Transferable[] = [],
  ): Promise<T> {
    const f = this.frame;
    if (!f?.contentWindow || !this.state.url)
      return Promise.reject(new Error('Aucune page ouverte (browser.open).'));
    const id = Math.random().toString(36).slice(2);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('La page ne répond pas.'));
      }, 10_000);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        const res = r as { error?: string };
        if (res && res.error) reject(new Error(res.error));
        else resolve(r as T);
      });
      f.contentWindow!.postMessage({ mbrCmd: cmd, tok: this.token, id, ...extra }, '*', transfer);
    });
  }
  snapshot(): Promise<BrowserSnapshot> {
    return this.send<BrowserSnapshot>('snapshot').then((s) => ({ ...s, url: this.state.url }));
  }
  private async act(cmd: string, extra: Record<string, unknown>, transfer: Transferable[] = []) {
    const before = this.state.downloads.length;
    await this.send(cmd, extra, transfer);
    await new Promise((r) => setTimeout(r, 700)); // let the page react (render, export, download)
    const snap = await this.snapshot();
    return { snap, downloads: this.state.downloads.slice(before) };
  }
  click(ref: string) {
    return this.act('click', { ref });
  }
  type(ref: string, text: string, submit = false) {
    return this.act('type', { ref, text, submit });
  }
  select(ref: string, value: string) {
    return this.act('select', { ref, value });
  }
  scroll(dy = 600) {
    return this.act('scroll', { dy });
  }
  /** Puts a workspace file into an <input type=file> of the page (e.g. load an Excel into an app). */
  upload(ref: string, path: string) {
    const f = getFile(normPath(path));
    if (!f) throw new Error(`Fichier introuvable : ${path}`);
    const bytes = bytesOf(f).slice().buffer;
    return this.act('upload', { ref, name: f.path.split('/').pop(), mime: f.mime, bytes }, [bytes]);
  }
  clearConsole() {
    this.set({ console: [] });
  }
}

export const browser = new EmbeddedBrowser();

/** Compact text of a snapshot for the model. */
export function snapshotText(s: BrowserSnapshot, max = 9000): string {
  const els = s.elements
    .map(
      (e) =>
        `[${e.ref}] ${e.tag}${e.type ? `:${e.type}` : ''} "${e.label}"${e.value ? ` = "${e.value}"` : ''}${e.disabled ? ' (désactivé)' : ''}`,
    )
    .join('\n');
  return `URL: ${s.url}\nTitle: ${s.title}\n\nInteractive elements (use the ref):\n${els || '(none)'}\n\nPage text:\n${s.text.slice(0, max)}`;
}
