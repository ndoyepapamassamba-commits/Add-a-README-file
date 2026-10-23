import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, gzipSync } from 'fflate';
import { printableStrings, reaInspect } from '../../direct/lib/reaLocal';

const hex = (h: string) =>
  Uint8Array.from(
    h
      .replace(/\s+/g, '')
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
  );
// (module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
const ADD_WASM = hex(
  '0061736d01000000 01070160027f7f017f 03020100 070701036164640000 0a09010700200020016a0b',
);

describe('REA local (browser): the REA method on workspace files', () => {
  it("WebAssembly: sections and the engine's own exports, a stable evidence id", async () => {
    const a = await reaInspect('add.wasm', ADD_WASM);
    expect(a.format).toBe('WebAssembly');
    expect(a.text).toContain('exports (1) : add (function)');
    expect(a.text).toMatch(/sections : type 7 o, function 2 o, export 7 o, code 9 o/);
    expect(a.evidenceId).toMatch(/^ev_[a-f0-9]{64}$/);
    expect((await reaInspect('add.wasm', ADD_WASM)).evidenceId).toBe(a.evidenceId);
    expect(a.text).toContain('## Inconnu / limites');
  });
  it('ZIP family: Office, npm manifest, entries', async () => {
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8('<w:document/>'),
      'docProps/app.xml': strToU8('<Application>Microsoft Office Word</Application>'),
    });
    const d = await reaInspect('rapport.docx', docx);
    expect(d.format).toBe('ZIP — Word (.docx)');
    expect(d.text).toContain('Microsoft Office Word');
    const tgz = (() => {
      // tar with package/package.json
      const body = strToU8('{"name":"demo","version":"1.2.3"}');
      const h = new Uint8Array(512);
      h.set(strToU8('package/package.json'));
      h.set(strToU8(body.length.toString(8).padStart(11, '0')), 124);
      h.set(strToU8('ustar'), 257);
      const t = new Uint8Array(512 + 512 + 1024);
      t.set(h);
      t.set(body, 512);
      return gzipSync(t);
    })();
    const g = await reaInspect('demo.tgz', tgz);
    expect(g.format).toBe('tar.gz — paquet npm (.tgz)');
    expect(g.text).toContain('package/package.json (33 o)');
  });
  it('SQLite header and schema text; JavaScript imports, endpoints, masked secrets', async () => {
    const db = new Uint8Array(4096);
    db.set(strToU8('SQLite format 3\0'));
    db[16] = 0x10; // page size 4096
    db[31] = 1; // one page
    db[59] = 1; // UTF-8
    db.set(strToU8('CREATE TABLE client(id integer primary key, nom text)'), 3000);
    const s = await reaInspect('clients.db', db);
    expect(s.format).toBe('SQLite 3');
    expect(s.text).toContain('taille de page 4');
    expect(s.text).toContain('CREATE TABLE client(id integer primary key, nom text)');
    const js = strToU8(
      `import x from 'react';\nconst k = 'sk-abcdefghijklmnopqrstuvwxyz123456';\nfetch('/api/v2/clients');\nexport function go() { return process.env.API_URL; }\nconst u = "https://exemple.org/x";`,
    );
    const j = await reaInspect('app.js', js);
    expect(j.format).toBe('JavaScript / TypeScript');
    expect(j.text).toContain('modules importés (1) : react');
    expect(j.text).toContain('routes d’API probables : /api/v2/clients');
    expect(j.text).toContain('variables d’environnement lues : API_URL');
    expect(j.text).toContain('sk-abc…[masqué]');
    expect(j.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });
  it('strings and search modes', async () => {
    const b = strToU8('\0\0hello-world-123\0\0another-string\0');
    expect(printableStrings(b)).toEqual(['hello-world-123', 'another-string']);
    const r = await reaInspect('x.bin', b, 'search', 'another');
    expect(r.text).toContain('1 chaîne(s)');
  });
});
