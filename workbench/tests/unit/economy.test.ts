// Économie JEV ÷100 (v64) — la partie pure : contrôle du brouillon, vérificateur par patchs, confiance apprise,
// rédacteurs gratuits, registre prix standard / payé.
import { describe, expect, it } from 'vitest';
import {
  applyPatches,
  cleanLesson,
  draftChain,
  draftGate,
  ecoStats,
  effectiveSavingsRate,
  evidenceDigest,
  factorLabel,
  familyOf,
  isPremium,
  needsVerification,
  parseVerdict,
  requestTokens,
  riskOf,
  rulerPosition,
  standardCost,
  toolCallsSane,
  updateTrust,
  verifierMessages,
  wilsonLower,
  type EcoEntry,
  type TrustRow,
} from '../../server/jev/economy';

describe('v64 — économie JEV ÷100 : prix', () => {
  it('modèle « ultra puissant » = au moins 1 $ par million de jetons d’entrée ; prix standard au tarif public', () => {
    expect(isPremium({ inputPrice: 4, outputPrice: 20 })).toBe(true); // Claude Opus 5.5 (catalogue OpenRouter du 15/10/2026)
    expect(isPremium({ inputPrice: 0.15, outputPrice: 0.6 })).toBe(false);
    expect(isPremium({ inputPrice: null, outputPrice: null })).toBe(false);
    expect(standardCost({ inputPrice: 4, outputPrice: 20 }, 30_000, 1_000)).toBeCloseTo(0.14, 6);
    const n = requestTokens([{ role: 'user', content: 'x'.repeat(4000) }], [{ type: 'function', function: { name: 'a', description: 'b', parameters: {} } }]);
    expect(n).toBeGreaterThan(1000);
    expect(n).toBeLessThan(1100);
  });
});

describe('v64 — économie JEV ÷100 : le brouillon gratuit', () => {
  it('contrôle local (0 $) : vide, refus, coupé, trous, mauvaise langue', () => {
    const ask = 'Explique en deux phrases la différence entre le stage 2 et le stage 3 d’IFRS 9.';
    expect(draftGate('Le stage 2 regroupe les expositions dont le risque a augmenté significativement ; le stage 3 les actifs dépréciés.', ask).ok).toBe(true);
    expect(draftGate('', ask).why).toContain('vide');
    expect(draftGate('Je ne peux pas répondre à cette question.', ask).why).toContain('refus');
    expect(draftGate(`${'Le stage 2 couvre une hausse significative du risque de crédit depuis l’origine et la provision '.repeat(6)}et la`, ask).why).toContain('coupé');
    expect(draftGate(`${'The stage 2 bucket is for assets with a significant increase in credit risk and the stage 3 is for impaired assets. '.repeat(3)}`, ask).why).toContain('langue');
    expect(draftGate('Réponse : [à compléter]', ask).why).toContain('trous');
  });
  it('étape d’outils écrite par un modèle gratuit : arguments JSON exigés ; le nom est laissé à l’agent (alias), mais signalé', () => {
    const tools = [{ type: 'function' as const, function: { name: 'data__query', description: '', parameters: {} } }];
    const call = (name: string, args: string) => ({ id: '1', type: 'function' as const, function: { name, arguments: args } });
    expect(toolCallsSane([call('data__query', '{"sql":"select 1"}')], tools).ok).toBe(true);
    expect(toolCallsSane([call('fs__write', '{}')], tools)).toMatchObject({ ok: true, unknown: ['fs__write'] });
    expect(toolCallsSane([call('rm -rf /', '{}')], tools).ok).toBe(false);
    expect(toolCallsSane([call('data__query', '{sql')], tools).ok).toBe(false);
    expect(toolCallsSane([call('data__query', '[1]')], tools).ok).toBe(false);
  });
  it('rédacteurs : les plus gros modèles gratuits d’OpenRouter d’abord (clé), puis les services sans clé ; jamais un classifieur', () => {
    const m = (id: string, ctx = 262_144, tools = true) => ({ id, contextLength: ctx, capabilities: { tools } });
    const catalog = [
      m('google/gemma-4-31b-it:free'),
      m('nvidia/nemotron-3-super-120b-a12b:free'),
      m('nvidia/nemotron-3-ultra-550b-a55b:free', 1_000_000),
      m('nvidia/nemotron-3.5-content-safety:free', 128_000, false),
      m('thinkingmachines/inkling:free', 1_048_576),
      m('anthropic/claude-opus-5.5'),
    ];
    const keyless = ['llm7:gpt-oss:20b', 'pollinations:openai'];
    expect(draftChain({ catalog, hasKey: true, keyless, needsTools: true })).toEqual([
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'google/gemma-4-31b-it:free',
      'llm7:gpt-oss:20b',
      'pollinations:openai',
    ]);
    expect(draftChain({ catalog, hasKey: false, keyless, needsTools: true })).toEqual(keyless);
    expect(draftChain({ catalog, hasKey: true, keyless: [], needsTools: true, blocked: ['nvidia/nemotron-3-ultra-550b-a55b:free'] })[0]).toBe('nvidia/nemotron-3-super-120b-a12b:free');
  });
});

describe('v64 — économie JEV ÷100 : le modèle payant vérifie et corrige par patchs', () => {
  it('le vérificateur reçoit la demande, les éléments et le brouillon — ni outils, ni historique', () => {
    const msgs = verifierMessages({ ask: 'Q ?', draft: 'Brouillon.', evidence: '[data] 3 lignes', focus: '<jev_focus>…</jev_focus>' });
    expect(msgs).toHaveLength(2);
    expect(JSON.stringify(msgs)).toContain('Brouillon.');
    expect(JSON.stringify(msgs)).toContain('[data] 3 lignes');
    expect(String(msgs[0]!.content)).toContain('"verdict":"ok"|"fix"|"redo"');
  });
  it('verdict lu même entouré de texte ou de ```json ; « fix » sans patch = « redo » ; illisible = null', () => {
    expect(parseVerdict('```json\n{"verdict":"ok","patches":[],"lesson":"","why":"exact"}\n```')?.verdict).toBe('ok');
    const fix = parseVerdict('Voici : {"verdict":"fix","patches":[{"find":"stage 3 le classe comme probable","replace":"stage 3 regroupe les actifs dépréciés"}],"lesson":"Stage 3 = actifs dépréciés (défaut avéré).","why":"définition fausse"}');
    expect(fix?.verdict).toBe('fix');
    expect(fix?.patches).toHaveLength(1);
    expect(parseVerdict('{"verdict":"fix","patches":[]}')?.verdict).toBe('redo');
    expect(parseVerdict('pas de JSON')).toBeNull();
    expect(parseVerdict('{"verdict":"peut-être"}')).toBeNull();
  });
  it('patchs appliqués à l’identique, puis sans tenir compte des espaces ; un extrait introuvable est compté', () => {
    const draft = 'Le stage 2 :\nhausse   significative du risque.\nLe stage 3 : perte attendue d’escompte.';
    const r = applyPatches(draft, [
      { find: 'perte attendue d’escompte', replace: 'actifs dépréciés, pertes attendues à maturité' },
      { find: 'hausse significative du risque', replace: 'hausse significative du risque de crédit' },
      { find: 'introuvable', replace: 'x' },
    ]);
    expect(r.applied).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.text).toContain('actifs dépréciés');
    expect(r.text).toContain('risque de crédit');
  });
  it('éléments pour le vérificateur : résultats d’outils (bornés) et demandes précédentes, pas le système', () => {
    const d = evidenceDigest([
      { role: 'system', content: 'SECRET SYSTEM' },
      { role: 'user', content: 'Analyse le portefeuille' },
      { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'data__query', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 't1', name: 'data__query', content: 'encours 12 ; douteux 3' },
      { role: 'user', content: 'Et les douteux ?' },
    ]);
    expect(d).toContain('encours 12');
    expect(d).toContain('Analyse le portefeuille');
    expect(d).not.toContain('SECRET SYSTEM');
  });
});

describe('v64 — économie JEV ÷100 : confiance apprise', () => {
  it('borne basse de Wilson : 8/8 ≈ 0,76 ; 20/20 ≈ 0,88 ; 0/0 = 0', () => {
    expect(wilsonLower(8, 8)).toBeGreaterThan(0.7);
    expect(wilsonLower(8, 8)).toBeLessThan(0.8);
    expect(wilsonLower(20, 20)).toBeGreaterThan(0.85);
    expect(wilsonLower(0, 0)).toBe(0);
  });
  it('quand vérifier : toujours si réglé ou si risque ; en apprentissage ; puis seulement en sondage (1 sur 5)', () => {
    const trusted: TrustRow = { family: 'chat:crédit', ok: 20, n: 20, sinceSpot: 0 };
    expect(needsVerification({ risk: 'normal', trust: trusted, mode: 'always' }).verify).toBe(true);
    expect(needsVerification({ risk: 'high', trust: trusted, mode: 'smart' }).verify).toBe(true);
    expect(needsVerification({ risk: 'normal', trust: { ...trusted, ok: 3, n: 3 }, mode: 'smart' }).verify).toBe(true);
    expect(needsVerification({ risk: 'normal', trust: { ...trusted, ok: 12, n: 20 }, mode: 'smart' }).verify).toBe(true);
    expect(needsVerification({ risk: 'normal', trust: trusted, mode: 'smart' }).verify).toBe(false);
    expect(needsVerification({ risk: 'normal', trust: { ...trusted, sinceSpot: 4 }, mode: 'smart' }).verify).toBe(true);
  });
  it('mise à jour : un verdict remet le compteur de sondage à zéro ; une réponse servie l’incrémente ; fenêtre de 40', () => {
    let rows = updateTrust([], 'f', 'ok');
    rows = updateTrust(rows, 'f', 'served');
    expect(rows[0]).toMatchObject({ ok: 1, n: 1, sinceSpot: 1 });
    rows = updateTrust(rows, 'f', 'redo');
    expect(rows[0]).toMatchObject({ ok: 1, n: 2, sinceSpot: 0 });
    for (let i = 0; i < 60; i++) rows = updateTrust(rows, 'f', 'ok');
    expect(rows[0]!.n).toBe(40);
    expect(rows[0]!.ok).toBeLessThanOrEqual(40);
  });
  it('risque et famille : chiffres / réglementation = risque élevé ; la famille ne garde ni chiffres ni noms propres', () => {
    expect(riskOf('Calcule les provisions BCEAO du portefeuille', 'chat')).toBe('high');
    expect(riskOf('Résume ce texte', 'résumé')).toBe('low');
    expect(riskOf('Explique ce qu’est un prêt amortissable', 'chat')).toBe('normal');
    const f = familyOf('Analyse les impayés de Ecobank Sénégal au 31/12/2025 pour 12 000 000', 'chat');
    expect(f.startsWith('chat:')).toBe(true);
    expect(f).not.toMatch(/\d|Ecobank/);
    expect(cleanLesson('Le stage 3 désigne les actifs dépréciés (défaut avéré), pas une probabilité.')).toBeTruthy();
    expect(cleanLesson('Le client 123456 doit 15 000 000')).toBeNull();
  });
});

describe('v64 — économie JEV ÷100 : registre et facteur', () => {
  const e = (path: EcoEntry['path'], standardUsd: number, paidUsd: number): EcoEntry => ({ at: 0, purpose: 'chat', premium: 'p', drafter: 'f', path, standardUsd, paidUsd, family: 'chat:x', ms: 1 });
  it('facteur = prix standard / payé ; part des demandes à 0 $ ; détail par chemin', () => {
    const s = ecoStats([e('free-tools', 0.06, 0), e('free-verified', 0.07, 0.004), e('free', 0.05, 0), e('premium-redo', 0.07, 0.05)]);
    expect(s.n).toBe(4);
    expect(s.freeShare).toBe(0.5);
    expect(s.factor).toBeCloseTo(0.25 / 0.054, 6);
    expect(factorLabel(s)).toBe('÷4,6');
    expect(factorLabel(ecoStats([e('free', 0.05, 0)]))).toBe('0 $ payé');
    expect(factorLabel(ecoStats([]))).toBe('—');
    expect(s.byPath['premium-redo']).toEqual({ n: 1, standardUsd: 0.07, paidUsd: 0.05 });
  });
  it('arithmétique d’un tour de chat au tarif public d’OpenRouter (calcul, pas une mesure) : ÷19 par réponse validée, ÷13 corrigée, ≈ ÷97 sur un tour de 5 étapes', () => {
    // Claude Opus 5.5 au 15/10/2026 : 4 $ / M en entrée, 20 $ / M en sortie. Un tour de chat brut : ≈ 30 000 jetons
    // (système, outils, historique) + 1 000 jetons de réponse.
    const opus = { inputPrice: 4, outputPrice: 20 };
    const raw = standardCost(opus, 30_000, 1_000);
    // Vérification seule : demande + cadre + brouillon ≈ 1 500 jetons, verdict ≈ 60 jetons.
    const verify = standardCost(opus, 1_500, 60);
    // Correction par patchs : ≈ 250 jetons de sortie.
    const patch = standardCost(opus, 1_500, 250);
    expect(raw / verify).toBeCloseTo(19.44, 1);
    expect(raw / patch).toBeCloseTo(12.73, 1);
    // Un mélange réaliste : 4 étapes d'outils gratuites + 1 réponse vérifiée ; puis la famille devient fiable (sondage 1/5).
    const learning = (5 * raw) / verify;
    const trusted = (5 * 5 * raw) / verify;
    expect(learning).toBeCloseTo(97.2, 0);
    expect(trusted).toBeCloseTo(486.1, 0);
  });
});

describe('v64 — panneau : règle par décades et taux d’économie effectif (ESR)', () => {
  it('÷1 au début, ÷10 au tiers, ÷100 aux deux tiers (repère objectif), 0 $ au bout ; ESR = 1 − payé / standard', () => {
    expect(rulerPosition({ standardUsd: 1, paidUsd: 1 })).toBe(0);
    expect(rulerPosition({ standardUsd: 1, paidUsd: 0.1 })).toBeCloseTo(1 / 3, 6);
    expect(rulerPosition({ standardUsd: 1, paidUsd: 0.01 })).toBeCloseTo(2 / 3, 6);
    expect(rulerPosition({ standardUsd: 1, paidUsd: 0 })).toBe(1);
    expect(rulerPosition({ standardUsd: 0, paidUsd: 0 })).toBeNull();
    expect(rulerPosition({ standardUsd: 1, paidUsd: 2 })).toBe(0); // plus cher que le standard : bloqué au début, jamais négatif
    // mission mesurée en e2e : 0,323 $ → 0,0034 $ (÷95) → juste sous le repère ÷100, ESR ≈ 98,9 %
    expect(rulerPosition({ standardUsd: 0.323, paidUsd: 0.0034 })!).toBeLessThan(2 / 3);
    expect(effectiveSavingsRate({ standardUsd: 0.323, paidUsd: 0.0034 })!).toBeCloseTo(0.9895, 3);
    expect(effectiveSavingsRate({ standardUsd: 0, paidUsd: 0 })).toBeNull();
    expect(effectiveSavingsRate({ standardUsd: 1, paidUsd: 2 })).toBe(0);
  });
});
