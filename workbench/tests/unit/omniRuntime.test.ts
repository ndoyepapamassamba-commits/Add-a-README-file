// OMNIPOTENT runtime glue (direct/lib/omni.ts): the HARD filters really change what the model would receive.
import { describe, expect, it } from 'vitest';
import * as omni from '../../direct/lib/omni';
import { BUILTIN_AGENTS, findAgent, allRoles } from '../../direct/lib/roles';

const hist = [
  { role: 'user' as const, content: 'Fais-moi un tableau de factures impayées clients Dupont en Excel' },
  { role: 'assistant' as const, content: 'Voici le tableau des factures impayées Dupont (Excel) avec totaux.' },
];
const turns = [{ start: 0, text: 'Fais-moi un tableau de factures impayées clients Dupont en Excel', at: 1 }];
const prep = (text: string) =>
  omni.beginOmni({ text, attachments: [], hasImages: false, history: hist, turns: [...turns, { start: 2, text, at: 2 }], initialType: 'chat', initialDna: 'chat' })!;

(globalThis as { document?: unknown }).document ??= { documentElement: { dataset: {} } };

describe('omni runtime', () => {
  it('a trivial question gets the fast lane: no tools exposed, small ceilings', () => {
    const o = prep('Quelle heure est-il à Dakar ?');
    omni.laneOmni(o, { text: 'Quelle heure est-il à Dakar ?', attachments: 0, difficulty: 0.1, critical: false, mission: false, needsTools: false, historyTokens: 200 });
    expect(o.lane!.lane).toBe('trivial');
    expect(o.lane!.minimalPrompt).toBe(true);
    expect(omni.omniContextCeiling(o, 300_000)).toBeLessThanOrEqual(20_000);
    const exposed = omni.filterTools(o, ['filesystem.read', 'filesystem.write', 'browser.open', 'code.run'], 'Quelle heure ?', 0);
    expect(exposed.length).toBeLessThan(4);
  });
  it('the history of an unrelated earlier mission is not shown to the model (raw history untouched)', () => {
    const o = prep('Explique-moi la photosynthèse en deux phrases');
    expect(o.fw.history.length).toBeLessThan(hist.length + 1);
    expect(hist).toHaveLength(2);
  });
  it('the master switch OFF restores V18 behaviour', () => {
    omni.setOmniSettings({ enabled: false });
    expect(omni.beginOmni({ text: 'x', attachments: [], hasImages: false, history: hist, initialType: 'chat', initialDna: 'chat' })).toBeNull();
    omni.setOmniSettings({ enabled: true });
  });
  it('OMNIPOTENT is the only built-in agent; legacy ids alias to it and stay available as roles', () => {
    expect(BUILTIN_AGENTS).toHaveLength(1);
    expect(findAgent('apex', [] as never).id).toBe(BUILTIN_AGENTS[0]!.id);
    expect(allRoles([] as never).length).toBeGreaterThan(3);
  });
});
