// The design is chosen BEFORE the work, enforced on files the model writes itself, and two chats never swap files.
import { describe, expect, it } from 'vitest';
(globalThis as { document?: unknown }).document ??= { documentElement: { dataset: {} } };
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { useStore } from '../../direct/lib/store';
import { acquireScope, getFile, importBrowserFile, scopeGate, setChatScope, writeText, CHAT_PREFIX } from '../../direct/lib/vfs';
import { buildTheme, DESIGN } from '../../server/services/houseDesign';
import { recolorMap, recolorOffice } from '../../server/services/officeRecolor';
import { deliverableFromCode, deliverableFromText } from '../../server/services/premiumDesigns';

describe('deliverable detection', () => {
  it('a request for a file opens the gallery; an attached file alone or a question does not', () => {
    expect(deliverableFromText('Analyse le fichier Excel joint : anomalies, tendances et 3 graphiques clés et me retourné un fichier excel analysé')).toBe('excel');
    expect(deliverableFromText('Analyse le fichier Excel joint : anomalies, tendances')).toBeNull();
    expect(deliverableFromText('résume le fichier excel joint')).toBeNull();
    expect(deliverableFromText('le crédit est-il risqué ?')).toBeNull();
    expect(deliverableFromText('Prépare une présentation pour le COMEX')).toBe('slides');
    expect(deliverableFromText('Fais-moi un rapport Word')).toBe('document');
    expect(deliverableFromText('Crée un site vitrine')).toBe('web');
  });
  it('code that writes an Office file is a deliverable', () => {
    expect(deliverableFromCode("wb.save('outputs/analyse.xlsx')")).toBe('excel');
    expect(deliverableFromCode("df.to_excel('outputs/x.xlsx')")).toBe('excel');
    expect(deliverableFromCode("doc.save('outputs/r.docx')")).toBe('document');
    expect(deliverableFromCode("prs.save('outputs/d.pptx')")).toBe('slides');
    expect(deliverableFromCode('print(df.describe())')).toBeNull();
  });
});

describe('design enforced on Office files the model wrote itself', () => {
  const styles = `<styleSheet><fonts><font><name val="Segoe UI"/><color rgb="FFFFFFFF"/></font></fonts><fills><fill><patternFill><fgColor rgb="FF00415E"/></patternFill></fill><fill><patternFill><fgColor rgb="FF8CC63F"/></patternFill></fill><fill><patternFill><fgColor rgb="FF${DESIGN.color.blue}"/></patternFill></fill></fills></styleSheet>`;
  const data = `<sst><si><t>00415E reste une donnée</t></si></sst>`;
  const xlsx = zipSync({ 'xl/styles.xml': strToU8(styles), 'xl/sharedStrings.xml': strToU8(data) });

  it('house colours (current + legacy) become the theme colours, the font follows, data untouched', () => {
    const t = buildTheme('onyx');
    const r = recolorOffice(xlsx, t)!;
    expect(r.replaced).toBeGreaterThanOrEqual(4);
    const out = unzipSync(r.bytes);
    const st = strFromU8(out['xl/styles.xml']!);
    expect(st).toContain(`FF${t.color.navy}`);
    expect(st).toContain(`FF${t.color.gold}`);
    expect(st).toContain(`FF${t.color.blue}`);
    expect(st).not.toContain('00415E');
    expect(st).not.toContain('8CC63F');
    expect(st).toContain(`val="${t.font.ui}"`);
    expect(st).toContain('FFFFFFFF');
    expect(strFromU8(out['xl/sharedStrings.xml']!)).toBe(data);
  });
  it('the house design never rewrites its own colours; a non-zip is ignored', () => {
    const m = recolorMap(DESIGN);
    for (const k of [DESIGN.color.navy, DESIGN.color.blue, DESIGN.color.gold]) expect(m[k]).toBeUndefined();
    expect(recolorOffice(strToU8('not a zip'), buildTheme('onyx'))).toBeNull();
  });
});

describe('two chats running at the same time never swap files', () => {
  it('an attachment goes into the chat it was attached to, whatever chat is running', async () => {
    setChatScope('OTHER');
    const f = { name: 'Provisions.xlsx', type: 'application/octet-stream', arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer } as unknown as File;
    const v = await importBrowserFile(f, 'uploads', 'MINE');
    expect(v.path).toBe('uploads/Provisions.xlsx');
    expect(useStore.getState().files[`${CHAT_PREFIX}MINE/uploads/Provisions.xlsx`]).toBeTruthy();
    expect(useStore.getState().files[`${CHAT_PREFIX}OTHER/uploads/Provisions.xlsx`]).toBeUndefined();
    expect(getFile('uploads/Provisions.xlsx')).toBeUndefined(); // still OTHER's scope
    setChatScope(null);
  });
  it('a chat waits while another chat’s tool holds the scope; same-chat calls are re-entrant', async () => {
    const order: string[] = [];
    const relA = await acquireScope('A');
    const relA2 = await acquireScope('A'); // parallel tool of the same chat
    let bIn = false;
    const b = scopeGate('B').then(() => {
      bIn = true;
      order.push('B');
    });
    await Promise.resolve();
    setChatScope('A');
    writeText('outputs/a.txt', 'A');
    order.push('A-write');
    relA();
    await Promise.resolve();
    expect(bIn).toBe(false);
    relA2();
    await b;
    expect(order).toEqual(['A-write', 'B']);
    expect(useStore.getState().files[`${CHAT_PREFIX}A/outputs/a.txt`]).toBeTruthy();
    setChatScope(null);
  });
});
