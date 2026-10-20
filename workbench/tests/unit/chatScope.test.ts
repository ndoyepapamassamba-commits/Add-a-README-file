// CHAT-SCOPED MEMORY: a chat never sees, lists, searches or overwrites another chat's files or `.ai/` memory.
import { describe, expect, it } from 'vitest';
(globalThis as { document?: unknown }).document ??= { documentElement: { dataset: {} } };
import { useStore } from '../../direct/lib/store';
import { files, getFile, removeFile, setChatScope, tree, writeText, CHAT_PREFIX } from '../../direct/lib/vfs';
import { firewallHistory, ALTERATION } from '../../server/jev/omni/mission';

describe('chat-scoped workspace', () => {
  it('two chats writing the same path keep two separate files; neither sees the other', () => {
    setChatScope('A');
    writeText('outputs/rapport.md', 'rapport du chat A');
    writeText('.ai/PROJECT.md', 'mémoire A');
    setChatScope('B');
    expect(getFile('outputs/rapport.md')).toBeUndefined();
    expect(getFile('.ai/PROJECT.md')).toBeUndefined();
    writeText('outputs/rapport.md', 'rapport du chat B');
    expect(getFile('outputs/rapport.md')!.data).toBe('rapport du chat B');
    expect(tree()).not.toContain('@chat');
    setChatScope('A');
    expect(getFile('outputs/rapport.md')!.data).toBe('rapport du chat A');
    expect(Object.keys(files())).toEqual(expect.arrayContaining(['outputs/rapport.md', '.ai/PROJECT.md']));
    setChatScope(null);
    const keys = Object.keys(useStore.getState().files);
    expect(keys.filter((k) => k.startsWith(CHAT_PREFIX))).toHaveLength(3);
  });
  it('a shared file is visible only when the chat attached or named it; shared .ai memory never', () => {
    setChatScope(null);
    writeText('uploads/ventes.csv', 'a,b\n1,2');
    writeText('.ai/DECISIONS.md', 'décision globale');
    setChatScope('C');
    expect(getFile('uploads/ventes.csv')).toBeUndefined();
    setChatScope('C', ['uploads/ventes.csv', '.ai/DECISIONS.md']);
    expect(getFile('uploads/ventes.csv')!.data).toContain('1,2');
    expect(getFile('.ai/DECISIONS.md')).toBeUndefined();
    // deleting in a chat removes the chat's own copy first
    writeText('uploads/ventes.csv', 'copie du chat C');
    expect(removeFile('uploads/ventes.csv')).toBe(1);
    expect(getFile('uploads/ventes.csv')!.data).toContain('1,2');
    setChatScope(null);
  });
});

describe('alteration targets the last delivery', () => {
  const h = [
    { role: 'user', content: 'Crée un tableau de bord HTML des ventes par région' },
    { role: 'assistant', content: 'Tableau de bord créé : outputs/ventes.html' },
    { role: 'user', content: 'Quelle est la capitale du Japon ?' },
    { role: 'assistant', content: 'Tokyo.' },
  ];
  const turns = [
    { start: 0, text: 'Crée un tableau de bord HTML des ventes par région' },
    { start: 2, text: 'Quelle est la capitale du Japon ?' },
  ];
  it('« mets le titre en rouge » is an alteration and brings the delivery mission back', () => {
    const t = 'Mets le titre en rouge';
    expect(ALTERATION.test(t)).toBe(true);
    const fw = firewallHistory(h, turns, t, { pinStart: 0 });
    expect(JSON.stringify(fw.history)).toContain('tableau de bord');
  });
});
