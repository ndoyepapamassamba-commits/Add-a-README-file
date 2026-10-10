// JEV COGNITIVE OS — 17 sub-tabs over the pure engines (server/jev/cognitive) and the OMNIPOTENT runtime (server/jev/omni).
// Every figure comes from the real JEV_LOG or from the text typed in the lab; an empty log shows NON MESURÉ, never an invented number.
import { useMemo, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Badge, Button, Select, Tabs, Toggle } from '../../web/components/ui';
import { useStore } from '../lib/store';
import { cognitivePolicies, cognitiveSettings, setCognitiveSettings, setCognitivePolicies } from '../lib/cognitive';
import { omniSettings, setOmniSettings } from '../lib/omni';
import { runSuperBench } from '../lib/cognitiveRun';
import { cognitiveDiagnosis } from '../../server/jev/cognitive/diagnosis';
import { PROTOCOLS, selectProtocol } from '../../server/jev/cognitive/protocols';
import { analyzeTokens, planTokenBudget, type Part } from '../../server/jev/cognitive/tokens';
import { compileCognitiveCapsule } from '../../server/jev/cognitive/capsule';
import { behaviorFor, outputContract } from '../../server/jev/cognitive/conditioning';
import { compileCognitivePlan } from '../../server/jev/cognitive/bytecode';
import { shouldStop } from '../../server/jev/cognitive/stop';
import { adaptiveCouncil, localizeDisagreement } from '../../server/jev/cognitive/disagreement';
import { fingerprints } from '../../server/jev/cognitive/fingerprint';
import { leverage, zeroWaste } from '../../server/jev/cognitive/leverage';
import { selfAudit } from '../../server/jev/cognitive/audit';
import { strategyLibrary, PROMOTION, type CognitiveEntry } from '../../server/jev/cognitive/strategies';
import { cognitiveRegression, regressionSummary } from '../../server/jev/cognitive/regression';
import { analyzeSuperBench, superBenchTasks, SB_ARMS, SB_LABEL, SB_CATEGORIES, NOT_DETERMINISTIC } from '../../server/jev/cognitive/superbench';
import { reclassify } from '../../server/jev/omni/reclassify';
import { laneOf } from '../../server/jev/omni/lane';
import { cognitiveCache } from '../lib/cognitive';
import { TTL } from '../../server/jev/cognitive/cache';
import type { EngineId, EngineMode } from '../../server/jev/cognitive/types';
import { Empty, NM, Section, Table, fmt, StatusBadge } from './fabricUi';
import { download } from '../lib/vfs';
import { SEED_EXPERIENCE } from '../../server/jev/memory/seed';

type Sub =
  | 'overview' | 'diagnosis' | 'protocols' | 'tokens' | 'capsule' | 'conditioning' | 'jcb' | 'stop' | 'disagreement'
  | 'fingerprints' | 'leverage' | 'audit' | 'strategies' | 'policy' | 'cache' | 'regression' | 'superbench' | 'vault';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'overview', label: 'Vue d’ensemble' },
  { id: 'diagnosis', label: 'Diagnostic' },
  { id: 'protocols', label: 'Protocoles' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'conditioning', label: 'Conditionnement' },
  { id: 'jcb', label: 'JCB' },
  { id: 'stop', label: 'Arrêt / ROI' },
  { id: 'disagreement', label: 'Désaccord' },
  { id: 'fingerprints', label: 'Empreintes' },
  { id: 'leverage', label: 'Levier' },
  { id: 'audit', label: 'Auto-audit' },
  { id: 'strategies', label: 'Stratégies' },
  { id: 'policy', label: 'Politique' },
  { id: 'cache', label: 'Cache' },
  { id: 'regression', label: 'Régression' },
  { id: 'superbench', label: 'Super-benchmark' },
  { id: 'vault', label: 'Coffre & leçons' },
];
const ENGINES: { id: EngineId; label: string }[] = [
  { id: 'diagnosis', label: 'Diagnostic cognitif' },
  { id: 'protocols', label: 'Protocoles de raisonnement' },
  { id: 'tokens', label: 'Intelligence des tokens' },
  { id: 'capsule', label: 'Capsule cognitive' },
  { id: 'conditioning', label: 'Conditionnement modèle' },
  { id: 'guards', label: 'Garde-fous d’échec' },
  { id: 'bytecode', label: 'JCB (bytecode)' },
  { id: 'stop', label: 'Arrêt / ROI' },
  { id: 'disagreement', label: 'Désaccord' },
  { id: 'cache', label: 'Cache cognitif' },
];
const SAMPLE = 'Analyse le fichier ventes.xlsx et donne le total par région, vérifie les chiffres.';

const Lab = ({ text, set }: { text: string; set: (s: string) => void }) => (
  <textarea
    value={text}
    onChange={(e) => set(e.target.value)}
    rows={2}
    data-testid="cog-lab-input"
    className="w-full rounded-lg border border-line bg-transparent p-2 text-[13px]"
    placeholder="Texte d’une requête à analyser (rien n’est envoyé à un modèle)"
  />
);
const KV = ({ rows }: { rows: [string, React.ReactNode][] }) => <Table head={['Mesure', 'Valeur']} rows={rows.map(([a, b]) => [a, b])} />;

export function CognitiveOS() {
  const [sub, setSub] = useState<Sub>('overview');
  const [text, setText] = useState(SAMPLE);
  const log = useStore((s) => s.jevLog);
  const fabric = useStore((s) => s.fabric);
  const cs = cognitiveSettings();
  const os = omniSettings();
  const diag = useMemo(() => cognitiveDiagnosis({ text }), [text]);
  const real = useMemo(() => log.filter((e) => !e.studio), [log]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="cognitive-os">
      <Tabs tabs={SUBS} value={sub} onChange={setSub} className="overflow-x-auto" />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" data-testid={`cog-${sub}`}>
        {sub === 'overview' && (
          <>
            <Section
              title="OMNIPOTENT V4.1 — agent unique, noyau minimal"
              hint="Remplace les agents précédents (conservés comme rôles internes). Le budget est un PLAFOND, jamais une cible : une demande simple reste en voie rapide."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['enabled', 'OMNIPOTENT activé'],
                    ['fastLane', 'Voie rapide proportionnelle'],
                    ['historyFirewall', 'Pare-feu d’historique (mission)'],
                    ['memoryGovernor', 'Gouverneur de mémoire'],
                    ['toolFirewall', 'Pare-feu d’outils'],
                    ['driftGuard', 'Garde anti-dérive de sortie'],
                    ['ceilings', 'Plafonds contexte / sortie'],
                    ['traceInChat', 'Trace dans le chat'],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="flex items-center justify-between rounded-lg border border-line px-2 py-1.5 text-[12.5px]">
                    {l}
                    <Toggle checked={os[k]} onChange={(v) => setOmniSettings({ [k]: v })} />
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[12px] text-muted">
                HARD = filtré par le runtime avant que le modèle voie l’objet (historique, mémoire, outils, plafonds, garde de sortie). POLICY = consigne écrite
                dans le prompt, non vérifiable. L’historique brut n’est jamais supprimé.
              </div>
            </Section>
            <Section title="JEV COGNITIVE OS — interrupteur maître" hint="OFF par défaut : le Workbench se comporte comme avant. SHADOW calcule sans modifier l’appel ; ACTIVE applique.">
              <label className="mb-2 flex items-center justify-between text-[13px]">
                Cognitive OS activé
                <Toggle checked={cs.enabled} onChange={(v) => setCognitiveSettings({ enabled: v })} />
              </label>
              <Table
                head={['Moteur', 'Mode']}
                rows={ENGINES.map((e) => [
                  e.label,
                  <Select
                    key={e.id}
                    value={cs.engines[e.id]}
                    onChange={(v) => setCognitiveSettings({ engines: { [e.id]: v as EngineMode } as never })}
                    options={[{ value: 'off', label: 'off' }, { value: 'shadow', label: 'shadow' }, { value: 'active', label: 'active' }]}
                  />,
                ])}
              />
            </Section>
            <Section title="Carte d’architecture">
              <pre className="overflow-x-auto text-[11.5px] leading-snug text-muted">{`requête → reclassify (le travail, pas la modalité)
        → mission capsule + empreinte + <MISSION_LOCK>
        → pare-feu d’historique  → gouverneur de mémoire  → pare-feu d’outils   [HARD]
        → voie rapide (trivial…critique) : étapes · portes · outils · prompt · contexte · sortie
        → [Cognitive OS : diagnostic → protocole → budget → capsule → conditionnement → JCB]
        → modèle → garde anti-dérive (≤2 reprises, paquet propre) → arrêt / ROI → JEV_LOG`}</pre>
            </Section>
          </>
        )}

        {sub === 'diagnosis' && (
          <>
            <Lab text={text} set={setText} />
            <Section title="Diagnostic cognitif">
              <KV
                rows={[
                  ['taskDNA', diag.taskDNA], ['Type', diag.cognitiveType], ['Difficulté', fmt.num(diag.difficulty, 2)], ['Ambiguïté', fmt.num(diag.ambiguity, 2)],
                  ['Risque', diag.risk], ['Trivial', diag.trivial ? 'oui' : 'non'], ['Outils', diag.toolNeed ? 'oui' : 'non'], ['Qualité visée (cible, pas mesure)', diag.qualityTarget],
                ]}
              />
            </Section>
            <Section title="Reclassification OMNIPOTENT" hint="Le type est dérivé du travail réel, pas de la modalité (image, fichier…).">
              {(() => {
                const r = reclassify({ text, initial: 'chat', attachments: [], hasImages: false } as never);
                return <pre className="text-[12px] text-muted">{JSON.stringify(r, null, 1).slice(0, 900)}</pre>;
              })()}
            </Section>
          </>
        )}

        {sub === 'protocols' && (
          <>
            <Lab text={text} set={setText} />
            <Section title="Protocole choisi">
              {(() => {
                const c = selectProtocol(diag);
                return <div className="text-[12.5px]"><Badge tone="info">{c.protocol.id}</Badge> {c.protocol.tokens} tokens (plafond {c.ceiling}) — {c.why.join(' ; ')}</div>;
              })()}
            </Section>
            <Table head={['Protocole', 'Tokens', 'Statut']} rows={Object.values(PROTOCOLS).map((p) => [p.id, p.tokens, p.status])} />
          </>
        )}

        {sub === 'tokens' && (
          <>
            <Lab text={text} set={setText} />
            {(() => {
              const parts: Part[] = [{ id: 'u', kind: 'user', text }];
              const rep = analyzeTokens(text, parts);
              const b = planTokenBudget(diag, { contextTokens: rep.total });
              return (
                <Section title="Budget = plafond" hint="Estimations (caractères / 3,8). Jamais présentées comme facturées.">
                  <KV rows={[['Tokens estimés', rep.total], ['Sortie max', b.maxOutput], ['Entrée max', b.maxInput], ['Raisons', b.rationale.join(' ; ')]]} />
                </Section>
              );
            })()}
          </>
        )}

        {sub === 'capsule' && (
          <>
            <Lab text={text} set={setText} />
            {(() => {
              const c = compileCognitiveCapsule({ goal: text, raw: `${text}\nTotal 1 245 € validé. Ne jamais modifier ventes.xlsx. Décision : on garde la méthode B.`, budgetTokens: 400 });
              return (
                <Section title="Capsule compilée" hint="Les éléments critiques perdus sont récupérés avant livraison.">
                  <KV rows={[['Brut → capsule', `${c.rawTokens} → ${c.capsuleTokens} tokens`], ['Réduction', fmt.pct(c.reduction)], ['Récupéré', c.recovered ? 'oui' : 'non'], ['Complète', c.complete ? 'oui' : 'non']]} />
                  <pre className="mt-2 whitespace-pre-wrap text-[12px] text-muted">{c.text}</pre>
                </Section>
              );
            })()}
          </>
        )}

        {sub === 'conditioning' && (
          <>
            <Lab text={text} set={setText} />
            {(() => {
              const bh = behaviorFor(diag, text);
              const oc = outputContract(diag, { maxOutput: 800 });
              return <Section title="Comportement et contrat de sortie"><pre className="text-[12px] text-muted">{JSON.stringify({ bh, oc }, null, 1).slice(0, 1400)}</pre></Section>;
            })()}
          </>
        )}

        {sub === 'jcb' && (
          <>
            <Lab text={text} set={setText} />
            {(() => {
              const p = compileCognitivePlan(diag, { text, contextTokens: 0, economy: cs.economy });
              return (
                <Section title="Plan cognitif compilé (JCB)">
                  <KV rows={[['Palier', `${p.tier} — ${p.tierWhy}`], ['Protocole', p.protocol.id], ['Contexte', p.contextMethod], ['Arrêt', p.stop], ['Repli', p.fallback]]} />
                  <pre className="mt-2 text-[12px] text-muted">{p.jcb}</pre>
                </Section>
              );
            })()}
          </>
        )}

        {sub === 'stop' && (
          <Section title="Arrêt / ROI" hint="Cas simulés pour illustrer la règle ; les décisions réelles figurent dans le JEV_LOG.">
            {[
              { n: 'Qualité atteinte', i: { quality: 92, previousQuality: 90, target: 85, nextCost: 0.01, valueLeft: null, redundant: false, newFacts: 0, taskSolved: true, confidence: 0.9 } },
              { n: 'Appel redondant', i: { quality: 70, previousQuality: 70, target: 85, nextCost: 0.02, valueLeft: null, redundant: true, newFacts: 0, taskSolved: false, confidence: null } },
              { n: 'Qualité non mesurée', i: { quality: null, previousQuality: null, target: 85, nextCost: 0.02, valueLeft: null, redundant: false, newFacts: null, taskSolved: false, confidence: null } },
            ].map((c) => {
              const d = shouldStop(c.i);
              return <div key={c.n} className="mb-1 text-[12.5px]"><Badge tone={d.stop ? 'ok' : 'neutral'}>{d.stop ? 'STOP' : 'CONTINUE'}</Badge> {c.n} — {d.reason} : {d.detail}</div>;
            })}
          </Section>
        )}

        {sub === 'disagreement' && (
          <Section title="Désaccord localisé et conseil adaptatif">
            <div className="mb-2 text-[12.5px]">{(() => { const a = adaptiveCouncil({ risk: diag.risk, ambiguity: diag.ambiguity, difficulty: diag.difficulty, historicalVariance: null }); return `Conseil recommandé : ${a.size} modèle(s) — ${a.why}`; })()}</div>
            <pre className="text-[12px] text-muted">{JSON.stringify(localizeDisagreement('Le total est 1245 euros pour 3 régions.', 'Le total est 1254 euros pour 3 régions.'), null, 1).slice(0, 700)}</pre>
          </Section>
        )}

        {sub === 'fingerprints' && (() => {
          const f = fingerprints(log);
          return f.length ? (
            <Table head={['Modèle', 'n', 'Confiance', 'Qualité', 'Verbosité', 'Cohérence', 'Note']} rows={f.map((x) => [x.model, x.n, x.confidence, fmt.num(x.quality), fmt.num(x.verbosity, 2), fmt.num(x.consistency), x.note])} />
          ) : <Empty>{NM} — aucune exécution dans le JEV_LOG.</Empty>;
        })()}

        {sub === 'leverage' && (() => {
          const l = leverage(log);
          const z = zeroWaste(log);
          return (
            <>
              <Section title="Levier cognitif (paires avec / sans JEV)" hint={l.note}>
                <KV rows={[['Paires', l.pairs], ['Confiance', l.confidence], ['Levier qualité', fmt.num(l.cognitive, 2)], ['Levier tokens', fmt.num(l.token, 2)], ['Levier coût', fmt.num(l.cost, 2)], ['Valeur créée', `${fmt.usd(l.valueCreated.dollars)} · ${l.valueCreated.tokens} tokens`]]} />
              </Section>
              <Section title="Zéro gaspillage (lu du journal)" hint={z.sources.join(' · ')}>
                <KV rows={[['Exécutions', z.runs], ['Tokens économisés', z.tokensSaved], ['Appels évités', z.callsAvoided], ['Coût évité', fmt.usd(z.costAvoided)]]} />
              </Section>
            </>
          );
        })()}

        {sub === 'audit' && (
          <Table head={['Question', 'Statut', 'Preuve', 'Suggestion']} rows={selfAudit(log).map((f) => [f.question, <StatusBadge key={f.id} s={f.status} />, f.evidence, f.suggestion ?? ''])} />
        )}

        {sub === 'strategies' && (() => {
          const s = strategyLibrary(log as CognitiveEntry[]);
          return (
            <Section title="Bibliothèque de stratégies" hint={`Promotion : ≥${PROMOTION.minRuns} exécutions, ≥${PROMOTION.minFormulations} formulations, qualité ≥${PROMOTION.minQuality}, succès ≥${PROMOTION.minSuccess * 100} %.`}>
              {s.length ? <Table head={['taskDNA', 'Modèle', 'Protocole', 'n', 'Qualité', 'Statut', 'Pourquoi']} rows={s.map((x) => [x.taskDNA, x.model, x.protocol, x.n, fmt.num(x.quality), x.status, x.why])} /> : <Empty>{NM} — aucune stratégie observée.</Empty>}
            </Section>
          );
        })()}

        {sub === 'policy' && (
          <Section title="Méta-politique" hint="Une politique candidate n’est promue qu’après évaluation ; jamais automatiquement.">
            <Table
              head={['Version', 'Statut', 'Note']}
              rows={cognitivePolicies().map((p, i) => [i, p.status, p.note])}
            />
            <Button className="mt-2" onClick={() => setCognitivePolicies(cognitivePolicies())}>Enregistrer l’état courant</Button>
          </Section>
        )}

        {sub === 'cache' && (
          <Section title="Cache cognitif (L0–L5)" hint="Chaque entrée porte son cachet de fraîcheur ; rien de périmé n’est réutilisé.">
            <Table head={['Niveau', 'TTL', 'Hits', 'Misses', 'Invalidés']} rows={(Object.keys(TTL) as (keyof typeof TTL)[]).map((l) => [l, TTL[l] === Infinity ? '∞' : `${TTL[l] / 3600_000} h`, cognitiveCache.stats[l].hits, cognitiveCache.stats[l].misses, cognitiveCache.stats[l].invalidated])} />
          </Section>
        )}

        {sub === 'regression' && (() => {
          const rows = cognitiveRegression(log);
          const s = regressionSummary(rows);
          return (
            <Section title="Rapport de régression cognitive" hint={`PASS ${s.pass} · FAIL ${s.fail} · WARNING ${s.warning} · INSUFFICIENT DATA ${s.insufficient}`}>
              <Table testId="cog-regression-table" head={['Capacité', 'Type', 'Statut', 'Détail']} rows={rows.map((r) => [r.capability, r.kind, <StatusBadge key={r.id} s={r.status} />, r.detail])} />
            </Section>
          );
        })()}

        {sub === 'superbench' && <SuperBench />}
        {sub === 'vault' && <VaultPanel />}
      </div>
    </div>
  );
  void real; void fabric; void laneOf;
}

function SuperBench() {
  const log = useStore((s) => s.jevLog);
  const models = useStore((s) => s.models);
  const [model, setModel] = useState('');
  const [reps, setReps] = useState(1);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ctl = useRef({ stop: false });
  const tasks = useMemo(() => superBenchTasks(), []);
  const res = analyzeSuperBench(log);
  const run = async () => {
    if (!model) return;
    ctl.current = { stop: false };
    setBusy(true);
    try {
      await runSuperBench({ model, reps, tasks: tasks.slice(0, limit) }, setMsg, ctl.current);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Section title={`Super-benchmark — ${tasks.length} tâches, ${SB_ARMS.length} bras`} hint={`Catégories : ${SB_CATEGORIES.map((c) => SB_LABEL[c]).join(' · ')}. Les appels réels coûtent des tokens : lancer un petit sous-ensemble d’abord.`}>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <Select value={model} onChange={setModel} options={[{ value: '', label: 'Modèle…' }, ...Object.keys(models ?? {}).slice(0, 80).map((m) => ({ value: m, label: m }))]} />
          <label>Tâches <input type="number" min={1} max={tasks.length} value={limit} onChange={(e) => setLimit(+e.target.value)} className="w-16 rounded border border-line bg-transparent px-1" /></label>
          <label>Répétitions <input type="number" min={1} max={5} value={reps} onChange={(e) => setReps(+e.target.value)} className="w-12 rounded border border-line bg-transparent px-1" /></label>
          {busy ? <Button onClick={() => (ctl.current.stop = true)}><Square size={13} /> Arrêter</Button> : <Button onClick={run} disabled={!model}><Play size={13} /> Lancer</Button>}
          <span className="text-muted">{msg}</span>
        </div>
      </Section>
      <Section title="Résultats par bras" hint={res.note}>
        {res.rows.some((r) => r.n) ? (
          <Table head={['Bras', 'n', 'Succès', 'Qualité', 'Tokens', 'Coût', 'Δ vs seul']} rows={res.rows.map((r) => [r.arm, r.n, fmt.pct(r.success), fmt.num(r.quality), fmt.num(r.tokens, 0), fmt.usd(r.cost), r.vsAlone ? fmt.num(r.vsAlone.meanDelta) : NM])} />
        ) : <Empty>{NM} — aucun run de super-benchmark enregistré.</Empty>}
      </Section>
      <Section title="Non déterministe / non couvert">
        {NOT_DETERMINISTIC.map((n) => <div key={n.id} className="text-[12px] text-muted">{n.id} — {n.reason}</div>)}
      </Section>
    </>
  );
}

function VaultPanel() {
  const vault = useStore((s) => s.vault);
  const lessons = useStore((s) => s.lessons);
  const st = useStore.getState();
  return (
    <>
      <Section
        title={`Coffre d’expérience (${vault.length})`}
        hint="Réponses et fichiers que vous avez gardés (☆ sous une réponse). La plus proche d’une nouvelle demande est proposée au modèle comme référence ; vault.open copie ses fichiers dans le chat."
        testId="vault-list"
      >
        {vault.length ? (
          <Table
            head={['Date', 'Demande', 'Fichiers', '']}
            rows={[...vault].reverse().map((v) => [
              new Date(v.at).toLocaleDateString('fr-FR'),
              v.title,
              v.files.map((f) => f.path.split('/').pop()).join(', ') || '—',
              <div key={v.id} className="flex gap-2">
                <button className="text-accent" onClick={() => download(`coffre-${v.id}.json`, JSON.stringify(v, null, 1), 'application/json')}>Exporter</button>
                <button className="text-err" onClick={() => st.setVault(useStore.getState().vault.filter((x) => x.id !== v.id))}>Retirer</button>
              </div>,
            ])}
          />
        ) : (
          <Empty>Coffre vide — cliquez « ☆ Garder dans le coffre d’expérience » sous une réponse réussie.</Empty>
        )}
      </Section>
      <Section
        title={`Leçons apprises de vos corrections (${lessons.length})`}
        hint="Après une livraison, ce que vous avez dû corriger devient une leçon, réappliquée d’emblée sur le même type de demande (3 au plus, seulement si pertinentes)."
        testId="lessons-list"
      >
        {lessons.length ? (
          <Table
            head={['Type', 'Leçon', '']}
            rows={[...lessons].reverse().map((l) => [
              l.tag ?? '—',
              l.text,
              <button key={l.id} className="text-err" onClick={() => st.setLessons(useStore.getState().lessons.filter((x) => x.id !== l.id))}>Oublier</button>,
            ])}
          />
        ) : (
          <Empty>Aucune leçon pour l’instant.</Empty>
        )}
        <div className="mt-2 text-[12px] text-muted">Expérience embarquée : {SEED_EXPERIENCE.length} leçons d’ingénierie, rappelées seulement quand elles correspondent à la demande.</div>
      </Section>
    </>
  );
}
