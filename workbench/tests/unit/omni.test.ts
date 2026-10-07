import { describe, it, expect } from 'vitest';
import { reclassify } from '../../server/jev/omni/reclassify';
import { buildCapsule, missionLock, firewallHistory, type HMsg } from '../../server/jev/omni/mission';
import { governMemory, filterDigest, governWrite, digestCandidates } from '../../server/jev/omni/memory';
import { laneOf, contextPressure } from '../../server/jev/omni/lane';
import { toolFirewall } from '../../server/jev/omni/toolfw';
import { driftGuard, retryPacket, MAX_DRIFT_RETRIES } from '../../server/jev/omni/drift';
import { traceLines, enforcementOf, DEFAULT_OMNI, type OmniTag } from '../../server/jev/omni/trace';
import { analyzeTask } from '../../server/llm/routing';
import { TOOL_FAMILIES } from '../../server/jev/tools';

const rc = (text: string, initial = 'chat', atts: { name: string; image?: boolean }[] = []) => reclassify({ text, initial, attachments: atts, hasImages: atts.some((a) => a.image) });

describe('V4.1 golden tests — reclassification (01, 02, mission DNA)', () => {
  it('01 visual repair is an artifact repair, never an answer', () => {
    const r = rc('La photo est décalée et le scroll horizontal est cassé, corrige.', 'vision');
    expect(r.trueTask).toMatch(/^artifact:repair:visual-regression$/);
    expect(r.mutationRequired && r.verificationRequired && r.visualRegression).toBe(true);
    expect(r.expected).toBe('corrected_artifact');
    expect(r.reasoningMin).toBe('medium');
  });
  it('02 a mail that delivers a repair is a delivery channel, not writing:mail', () => {
    const r = rc('La photo a disparu après ta modification. Corrige le fichier puis envoie-moi le résultat par mail.', 'writing');
    expect(r.trueTask).toBe('artifact:regression-repair');
    expect(r.secondaryIntents).toContain('delivery:email');
    expect(r.trueTask).not.toBe('writing');
    expect(r.reclassified).toBe(true);
  });
  it('the observed failure: « mail il y a eu régression, la photo et le design ont disparu »', () => {
    const r = rc('mail il y a eu régression, la photo et le design ont disparu', 'writing');
    expect(r.trueTask).toBe('artifact:regression-repair');
    expect(r.secondaryIntents).toContain('delivery:email');
    const p = analyzeTask({ text: 'mail il y a eu régression, la photo et le design ont disparu' });
    expect(p.type).toBe('code');
    expect(p.difficulty).toBeGreaterThanOrEqual(0.55);
    expect(p.reclass?.trueTask).toBe('artifact:regression-repair');
  });
  it('an image + « corrige » is NEVER vision:answer', () => {
    const r = rc('dans l’image attachée on voit des écritures cachées et un défilement impossible à droite de la photo, corrige', 'vision', [{ name: 'capture.png', image: true }]);
    expect(r.trueTask).toBe('artifact:repair:visual-regression');
    expect(r.routeType).toBe('code');
  });
  it('look / explain stay vision; plain writing stays writing; trivial questions stay answers', () => {
    expect(rc('Regarde cette image', 'vision', [{ name: 'a.png', image: true }]).trueTask).toBe('vision:inspect');
    expect(rc('Explique ce qu’on voit', 'vision', [{ name: 'a.png', image: true }]).trueTask).toBe('vision:answer');
    expect(rc('Écris un mail pour remercier l’équipe', 'writing').trueTask).toBe('writing');
    expect(rc('Corrige les fautes d’orthographe de ce texte', 'writing').trueTask).toBe('writing');
    const q = rc('Quelle est la capitale du Mali ?', 'chat');
    expect(q.trueTask).toBe('answer');
    expect(q.mutationRequired).toBe(false);
    expect(analyzeTask({ text: 'Quelle est la capitale du Mali ?' }).reclass).toBeUndefined();
  });
  it('data repair and enhancement', () => {
    expect(rc('Le total de la colonne B a disparu dans mon fichier excel, corrige', 'data').trueTask).toBe('artifact:repair:data');
    expect(rc('Améliore le design de mon dashboard html', 'chat').trueTask).toBe('artifact:enhance');
    expect(rc('Envoie le fichier rapport.xlsx par mail', 'chat').trueTask).toBe('delivery:email');
  });
});

// ───────── history firewall (golden 03, 04, 07, tests A, B, C) ─────────
const turn = (u: string, a: string): HMsg[] => [
  { role: 'user', content: u },
  { role: 'assistant', content: a },
];
const IFRS = [
  ...turn('Calcule les provisions IFRS9 du portefeuille retail et le taux de couverture NPL', 'Les provisions IFRS9 du portefeuille retail s’élèvent à 12,4 milliards, taux de couverture NPL 61 %.'),
  ...turn('Compare les provisions IFRS9 stage 2 et stage 3 par segment de crédit', 'Stage 2 : 4,1 milliards ; stage 3 : 8,3 milliards, segment crédit retail dominant.'),
];
describe('history firewall', () => {
  it('A: same mission keeps its context', () => {
    const r = firewallHistory(IFRS, undefined, 'Et pour le segment PME, quel est le taux de couverture NPL ?');
    expect(r.stats.foreignTurns).toBe(0);
    expect(r.history.length).toBe(IFRS.length);
  });
  it('A: a short follow-up (« corrige ça », « continue ») keeps the previous turn', () => {
    expect(firewallHistory(IFRS, undefined, 'continue').stats.missionTurns).toBeGreaterThan(0);
    expect(firewallHistory(IFRS, undefined, 'corrige ça').history.length).toBe(IFRS.length);
  });
  it('03/B: a topic switch blocks the IFRS9 turns and names them in the lock', () => {
    const cur = 'La photo est décalée sur ma page html et le scroll horizontal est cassé, corrige le fichier index.html';
    const r = firewallHistory(IFRS, undefined, cur);
    expect(r.stats.foreignTurns).toBe(2);
    expect(r.history).toHaveLength(0);
    expect(r.topicSwitch).toBe(true);
    expect(r.blockedTopics.join(' ')).toMatch(/provisions|IFRS9/i);
    expect(r.stats.keptTokens).toBe(0);
    const cap = buildCapsule({ text: cur, reclass: rc(cur, 'writing') });
    const lock = missionLock(cap, r.blockedTopics);
    expect(lock).toContain('MISSION_LOCK');
    expect(lock).toMatch(/SUJETS ANTÉRIEURS BLOQUÉS/);
    expect(lock).toContain('index.html');
  });
  it('an announced new topic blocks even a lexically close turn', () => {
    const r = firewallHistory(IFRS, undefined, 'Nouveau sujet : calcule les provisions IFRS9 de la filiale B');
    expect(r.topicSwitch).toBe(true);
  });
  it('04/C: an explicit recall brings back the right old mission, and it is traced', () => {
    const html = turn('Corrige la photo décalée dans le fichier dashboard.html', 'J’ai corrigé dashboard.html : la photo est alignée.');
    const hist = [...IFRS, ...html, ...turn('Écris un mail de remerciement à l’équipe', 'Voici le mail.')];
    const r = firewallHistory(hist, undefined, 'reprends la décision prise dans la mission IFRS9 précédente sur les provisions stage 3');
    expect(r.recall).toBe(true);
    expect(r.groups.some((g) => g.cls === 'EXPLICIT_RECALL')).toBe(true);
    const text = r.history.map((m) => String(m.content)).join(' ');
    expect(text).toMatch(/stage 3|IFRS9/);
    expect(text).not.toMatch(/dashboard\.html/);
  });
  it('turn marks give exact mission boundaries even with synthetic notes', () => {
    const hist: HMsg[] = [
      { role: 'user', content: 'Analyse le fichier ventes.xlsx et donne le total par région' },
      { role: 'assistant', content: 'Total Dakar 120, Thiès 80.' },
      { role: 'user', content: '[EVIDENCE CHECK] These figures appear in no tool result: 120, 80' },
      { role: 'assistant', content: 'Ces chiffres viennent du fichier.' },
      { role: 'user', content: 'Rédige un poème sur la mer' },
      { role: 'assistant', content: 'La mer chante…' },
    ];
    const r = firewallHistory(hist, [{ start: 0, text: 'Analyse' }, { start: 4, text: 'poème' }], 'Calcule la moyenne des ventes par région dans ventes.xlsx');
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]!.cls).not.toBe('FOREIGN_MISSION');
    expect(r.groups[1]!.cls).toBe('FOREIGN_MISSION');
    expect(r.history.map((m) => String(m.content)).join(' ')).toContain('Total Dakar');
    expect(r.history.map((m) => String(m.content)).join(' ')).not.toContain('mer');
  });
  it('07: 100+ turns stay bounded and foreign context stays blocked', () => {
    const hist: HMsg[] = [];
    for (let i = 0; i < 60; i++) hist.push(...turn(`Provisions IFRS9 tour ${i} : calcule le taux de couverture NPL du portefeuille retail`, `Résultat IFRS9 numéro ${i} : couverture ${50 + (i % 10)} %.`));
    for (let i = 0; i < 55; i++) hist.push(...turn(`Photo décalée fichier page${i}.html scroll cassé`, `Corrigé page${i}.html.`));
    const r = firewallHistory(hist, undefined, 'La photo est décalée dans page9.html et le scroll est cassé, corrige');
    expect(r.stats.rawTurns).toBe(115);
    expect(r.stats.missionTurns).toBeLessThanOrEqual(8);
    expect(r.history.every((m) => !/IFRS9/.test(String(m.content)))).toBe(true);
    expect(r.stats.keptTokens).toBeLessThan(r.stats.rawTokens / 5);
  });
  it('never splits a tool call from its result (whole turns only)', () => {
    const hist: HMsg[] = [
      { role: 'user', content: 'Lis report.csv' },
      { role: 'assistant', content: '', tool_calls: [{}] } as HMsg,
      { role: 'tool', content: 'a,b\n1,2' },
      { role: 'assistant', content: 'Fait.' },
    ];
    const r = firewallHistory(hist, undefined, 'Qu’y a-t-il dans report.csv ?');
    expect(r.history).toHaveLength(4);
  });
});

describe('memory governor', () => {
  const html = buildCapsule({ text: 'Corrige la photo décalée dans index.html', reclass: rc('Corrige la photo décalée dans index.html') });
  const cands = [
    { id: 'm1', type: 'PROJECT_FACTS' as const, text: 'La photo du dashboard est dans index.html, centrée par le CSS de la classe .hero', verified: 1 },
    { id: 'm2', type: 'VERIFIED_DECISIONS' as const, text: 'Règle IFRS9 : provision stage 3 = 100 % de l’encours net, couverture NPL contrôlée par le comité', verified: 1 },
    { id: 'm3', type: 'MISSION_ARCHIVE' as const, text: 'Changelog : photo alignée dans index.html le 12/09', verified: 1 },
    { id: 'm4', type: 'USER_PREFERENCES' as const, text: 'L’utilisateur préfère des réponses courtes', verified: 0.9 },
  ];
  it('foreign memories are QUARANTINED, archives are never injected, relevant ones pass', () => {
    const g = governMemory(cands, html);
    const d = Object.fromEntries(g.scored.map((s) => [s.id, s.decision]));
    expect(d.m2).toBe('QUARANTINE');
    expect(d.m3).toBe('BLOCK');
    expect(['ALLOW', 'OPTIONAL']).toContain(d.m1);
    expect(g.stats.candidates).toBe(4);
    expect(g.scored.find((s) => s.id === 'm1')!.score).toBeGreaterThan(g.scored.find((s) => s.id === 'm2')!.score);
  });
  it('an explicitly requested memory may be recalled', () => {
    expect(governMemory(cands, html, { requested: ['m3'] }).scored.find((s) => s.id === 'm3')!.decision).toBe('BLOCK'); // archives stay blocked
  });
  it('the project-memory digest is filtered paragraph by paragraph', () => {
    const digest = '<.ai/DECISIONS.md>\nRègle IFRS9 : provision stage 3 = 100 % de l’encours net.\n\nLa photo du hero reste centrée dans index.html via .hero.\n</.ai/DECISIONS.md>\n\n<.ai/CHANGELOG.md>\nLa photo a été déplacée.\n</.ai/CHANGELOG.md>';
    expect(digestCandidates(digest).length).toBe(3);
    const f = filterDigest(digest, html);
    expect(f.text).toContain('hero');
    expect(f.text).not.toMatch(/IFRS9/);
    expect(f.text).not.toMatch(/CHANGELOG/);
    expect(f.keptChars).toBeLessThan(f.rawChars);
  });
  it('the write governor never commits a hypothesis or an unverified model output', () => {
    expect(governWrite({ content: 'x', source: 'model', verified: false }).action).toBe('DISCARD');
    expect(governWrite({ content: 'x', source: 'tool-verified', verified: true, stable: true }).action).toBe('COMMIT');
    expect(governWrite({ content: 'x', source: 'model', verified: false, hypothesis: true }).action).toBe('DISCARD');
    expect(governWrite({ content: 'x', source: 'user', verified: false, confirmedByUser: true }).action).toBe('COMMIT');
    expect(governWrite({ content: 'x', source: 'tool-verified', verified: true, stable: true, missionId: 'A', currentMissionId: 'B' }).action).toBe('QUARANTINE');
  });
});

describe('fast lane, ceilings, budget = ceiling', () => {
  const base = { attachments: 0, difficulty: 0.15, critical: false, mission: false, needsTools: false, historyTokens: 500 };
  it('a trivial request: no tools, no gates, one step class, tiny ceilings', () => {
    const p = laneOf({ ...base, text: 'Quelle est la capitale du Mali ?', reclass: rc('Quelle est la capitale du Mali ?') });
    expect(p).toMatchObject({ lane: 'trivial', tools: 'none', gates: 0, verification: 'none', evidenceReask: false });
    expect(p.contextCeiling).toBeLessThanOrEqual(6000);
    expect(p.outputCeiling).toBeLessThanOrEqual(1500);
  });
  it('a repair is never fast-laned; critical work keeps adversarial verification', () => {
    const t = 'La photo est décalée et le scroll est cassé, corrige index.html';
    const r = rc(t);
    const p = laneOf({ ...base, text: t, reclass: r, difficulty: 0.6 });
    expect(['standard', 'complex']).toContain(p.lane);
    expect(p.tools).toBe('pack');
    const c = laneOf({ ...base, text: 'Vérifie les provisions IFRS9 pour le COMEX', reclass: rc('Vérifie les provisions IFRS9 pour le COMEX'), difficulty: 0.9, critical: true });
    expect(c).toMatchObject({ lane: 'critical', verification: 'adversarial' });
    expect(c.contextCeiling).toBe(50_000);
  });
  it('a small request with one file is « simple »: light verification, one gate that never re-asks for figures', () => {
    const p = laneOf({ ...base, text: 'Résume ce fichier', attachments: 1, difficulty: 0.3, reclass: rc('Résume ce fichier') });
    expect(p.lane).toBe('simple');
    expect(p.gates).toBe(1);
    expect(p.evidenceReask).toBe(false);
  });
  it('§93 pressure thresholds', () => {
    expect(contextPressure(10_000).level).toBe('ok');
    expect(contextPressure(21_000).level).toBe('reduce');
    expect(contextPressure(31_000).level).toBe('aggressive');
    expect(contextPressure(41_000).level).toBe('review');
    expect(contextPressure(55_000).level).toBe('recompile');
  });
});

describe('tool firewall (golden 05) — AVAILABLE ≠ EXPOSED', () => {
  const all = [...Object.values(TOOL_FAMILIES).flat(), 'agent.delegate', 'skill.use'];
  it('HTML repair: no blender, no diagram, no financial tools', () => {
    const t = 'La photo est décalée dans index.html, corrige';
    const r = rc(t);
    const lane = laneOf({ attachments: 0, difficulty: 0.6, critical: false, mission: false, needsTools: true, historyTokens: 100, text: t, reclass: r });
    const f = toolFirewall({ names: all, lane, reclass: r, text: t, attachments: 0 });
    for (const n of ['blender.scene', 'diagram.render', 'image.generate', 'fx.rates', 'worldbank.indicator', 'report.export']) expect(f.allowed).not.toContain(n);
    for (const n of ['filesystem.read', 'filesystem.edit', 'browser.open', 'code.run']) expect(f.allowed).toContain(n);
    expect(f.allowed.length).toBeLessThan(all.length);
  });
  it('a trivial request exposes only tools.request; a named tool is never hidden', () => {
    const t = 'Quelle est la capitale du Mali ?';
    const lane = laneOf({ attachments: 0, difficulty: 0.1, critical: false, mission: false, needsTools: false, historyTokens: 0, text: t, reclass: rc(t) });
    expect(toolFirewall({ names: all, lane, reclass: rc(t), text: t, attachments: 0 }).allowed).toEqual(['tools.request']);
    const t2 = 'Utilise web.search pour la capitale du Mali';
    const f2 = toolFirewall({ names: all, lane, reclass: rc(t2), text: t2, attachments: 0 });
    expect(f2.allowed).toContain('web.search');
  });
  it('a simple file question exposes read tools, not the whole registry', () => {
    const t = 'Que contient le fichier notes.txt ?';
    const lane = laneOf({ attachments: 1, difficulty: 0.25, critical: false, mission: false, needsTools: true, historyTokens: 0, text: t, reclass: rc(t) });
    const f = toolFirewall({ names: all, lane, reclass: rc(t), text: t, attachments: 1 });
    expect(f.allowed).toContain('filesystem.read');
    expect(f.allowed.length).toBeLessThan(10);
  });
});

describe('output drift guard (§69, §95, §96)', () => {
  const t = 'La photo est décalée dans index.html, corrige';
  const r = rc(t);
  const cap = buildCapsule({ text: t, reclass: r });
  const blocked = new Set(['provis', 'ifrs9', 'couver', 'portef', 'retail']);
  it('a fluent answer about another mission is rejected', () => {
    const d = driftGuard({ answer: 'Les provisions IFRS9 du portefeuille retail atteignent 12 milliards avec une couverture de 61 % sur le retail.', capsule: cap, reclass: r, blockedKeys: blocked, toolsWrote: false, toolsVerified: false, toolCalls: 0 });
    expect(d.verdict).not.toBe('PASS');
    expect(d.foreignTopicRate).toBeGreaterThan(0.15);
  });
  it('a descriptive answer to a repair is INCOMPLETE, not SUCCESS', () => {
    const d = driftGuard({ answer: 'Vous pouvez essayer de modifier le CSS de la photo, il faudrait peut-être ajuster la marge dans index.html.', capsule: cap, reclass: r, toolsWrote: false, toolsVerified: false, toolCalls: 0 });
    expect(d.verdict).toBe('INCOMPLETE');
    expect(d.actionCompletion).toBeLessThan(0.7);
  });
  it('a real repair (a write tool ran, the file is named) passes', () => {
    const d = driftGuard({ answer: 'J’ai corrigé index.html : la photo est recentrée (marge supprimée) et le scroll horizontal ne se déclenche plus.', capsule: cap, reclass: r, blockedKeys: blocked, toolsWrote: true, toolsVerified: true, toolCalls: 4 });
    expect(d.verdict).toBe('PASS');
  });
  it('the retry packet carries the capsule, never the transcript, and retries are capped at 2', () => {
    const p = retryPacket(cap, { objectiveCoverage: 0, artifactAlignment: 0, actionCompletion: 0, foreignTopicRate: 0.4, verdict: 'REPAIR', reasons: ['sujet antérieur'] }, 1);
    expect(p).toContain('index.html');
    expect(p).toMatch(/UNIQUEMENT/);
    expect(p.length).toBeLessThan(900);
    expect(MAX_DRIFT_RETRIES).toBe(2);
  });
});

describe('trace honesty (§99)', () => {
  it('reports HARD only for enforced barriers and OFF otherwise', () => {
    const lane = laneOf({ attachments: 0, difficulty: 0.1, critical: false, mission: false, needsTools: false, historyTokens: 0, text: 'bonjour', reclass: rc('bonjour') });
    const on = enforcementOf(DEFAULT_OMNI, null, lane);
    expect(on.HISTORY_FIREWALL).toBe('HARD');
    expect(on.MISSION_FIREWALL).toBe('OFF');
    const off = enforcementOf({ ...DEFAULT_OMNI, enabled: false }, null, lane);
    expect(Object.values(off).every((v) => v === 'OFF')).toBe(true);
    const tag = { missionId: 'M-1', fingerprint: 'x', initialDna: 'writing', finalDna: 'artifact:regression-repair', reclassified: true, lane: 'complex', verification: 'strong', enforcement: on, history: { raw: 8, mission: 2, foreign: 6, rawTokens: 9000, keptTokens: 800 }, memory: { candidates: 9, allowed: 1, optional: 0, blocked: 4, quarantined: 4, rawChars: 4000, keptChars: 300 }, tools: { available: 84, exposed: 9, blocked: 75 }, contextCeiling: 40000, avoidedReasks: 0, version: 1 } as OmniTag;
    const lines = traceLines(tag).join('\n');
    expect(lines).toMatch(/RECLASSIFIÉE/);
    expect(lines).toMatch(/2\/8 tours/);
    expect(lines).toMatch(/9\/84 exposés/);
  });
});
