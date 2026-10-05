// JEV CONTROL CENTER: status, mode, current decision and why, budgets, context,
// tools / skills, cost estimated vs actual, tokens saved, quality, escalation,
// cache, JEV ROI; live trace; JEV_LOG (JSON / CSV); WITHOUT vs WITH JEV KPIs;
// A/B benchmark; model profiles; Cost Intelligence; JEV API settings; regression report.
import { useMemo, useRef, useState } from 'react';
import { Cpu, Download, FlaskConical, KeyRound, Play, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Select, Tabs, Toggle } from '../../web/components/ui';
import { cx, fmtCost, fmtDuration, fmtTokens } from '../../web/lib/format';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import {
  DEFAULT_JEV,
  cache,
  clearJevKey,
  getJevKey,
  jevKeyMasked,
  jevSettings,
  metrics,
  patterns,
  setJevKey,
  type JevSettings,
} from '../lib/jev';
import { BENCH, runBench, VARIANTS, type BenchRun } from '../lib/jevBench';

import { regressionReport } from '../lib/inventory';
import { MODE_HELP, MODE_LABEL } from '../../server/jev/control';
import { savingsVs, toCsv, variantOf, variantStats, type JevLogEntry } from '../../server/jev/metrics';
import { callJev1, jev1Cost, jevErrorText, JEV_DIRECT_URL, JEV_RELAY_URL } from '../../server/jev/provider';
import relaySource from '../../relay/jev-relay/index.ts?raw';
import type { JevMode } from '../../server/jev/tools';
import { LiveTree, TraceTimeline } from './JevTrace';
import { ScienceTab } from './JevScience';
import { VARIANT_LABEL, analyze } from '../../server/jev/science';
import { handoffOf } from '../../server/jev/live';
import { runAgent, stopAgent, type JevVariant } from '../lib/agent';
import { CostsTab } from './IntelligenceView';
import {
  CapabilityPanel,
  CouncilPanel,
  ExpertisePanel,
  MemoryPanel,
  MissionPanel,
  ReplayPanel,
  SkillFactoryPanel,
  SkillLabPanel,
} from './JevFabric';
import {
  CfBenchPanel,
  DatasetPanel,
  DistillPanel,
  FreeLabPanel,
  HealthPanel,
  PolicyPanel,
  SecurityPanel,
} from './JevFabric2';
import { fabricRegression } from '../lib/fabricRegression';

type Tab = 'dash' | 'trace' | 'log' | 'kpi' | 'science' | 'bench' | 'models' | 'costs' | 'api' | 'regression';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dash', label: 'Control Center' },
  { id: 'trace', label: 'Trace live' },
  { id: 'log', label: 'JEV_LOG' },
  { id: 'kpi', label: 'Sans / avec JEV' },
  { id: 'science', label: 'Validation scientifique' },
  { id: 'bench', label: 'Benchmark 2.0' },
  { id: 'models', label: 'Profils modèles' },
  { id: 'costs', label: 'Cost Intelligence' },
  { id: 'api', label: 'JEV API' },
  { id: 'regression', label: 'Régression' },
];
type FTab =
  | 'mission'
  | 'council'
  | 'expertise'
  | 'capabilities'
  | 'skills'
  | 'lab'
  | 'memory'
  | 'replay'
  | 'distill'
  | 'dataset'
  | 'policy'
  | 'freelab'
  | 'security'
  | 'health'
  | 'cfbench';
const FTABS: { id: FTab; label: string }[] = [
  { id: 'mission', label: 'Mission cognitive' },
  { id: 'council', label: 'Model Council' },
  { id: 'expertise', label: 'Model Expertise' },
  { id: 'capabilities', label: 'Capability Fabric' },
  { id: 'skills', label: 'Skill Factory' },
  { id: 'lab', label: 'Skill Lab' },
  { id: 'memory', label: 'Experience Memory' },
  { id: 'replay', label: 'Failure Replay' },
  { id: 'distill', label: 'Distillation Lab' },
  { id: 'dataset', label: 'Training Data' },
  { id: 'policy', label: 'Policy Engine' },
  { id: 'freelab', label: 'Free Model Lab' },
  { id: 'security', label: 'Security' },
  { id: 'health', label: 'Health & Score' },
  { id: 'cfbench', label: 'Cognitive Benchmark' },
];
const th = 'py-1 pr-2 text-left font-normal text-faint';
const td = 'py-1 pr-2 align-top';
const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`;

function useJev(): [JevSettings, (p: Partial<JevSettings>) => void] {
  const s = useStore((x) => x.settings);
  const patch = useStore((x) => x.patchSettings);
  const cur: JevSettings = { ...DEFAULT_JEV, ...s.jev };
  return [cur, (p) => patch({ jev: { ...cur, ...p } })];
}

/** $ saved by the tool pack: tool-definition tokens avoided × input price of the model used. */
function toolSavingsUsd(log: JevLogEntry[], price: (m: string) => number | null): number {
  return log.reduce((s, e) => {
    const p = price(e.model);
    return p === null ? s : s + (Math.max(0, e.toolTokensBaseline - e.toolTokens) * e.calls * p) / 1e6;
  }, 0);
}

export function JevView() {
  const [tab, setTab] = useState<Tab>('dash');
  const [ftab, setFtab] = useState<FTab | null>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-5">
        <h1 className="flex items-center gap-2 text-[18px] font-semibold">
          <Cpu size={18} className="text-accent" /> JEV Control Center
        </h1>
        <div className="mb-2 text-[13px] text-muted">
          JEV prépare (AVANT), pilote (PENDANT) et contrôle (APRÈS) chaque appel de modèle : il décide quoi
          faire, avec quel contexte, quels outils, quel modèle et quel budget. Le LLM se consacre à résoudre.
        </div>
      </div>
      <Tabs
        tabs={TABS}
        value={ftab ? ('' as Tab) : tab}
        onChange={(t) => {
          setFtab(null);
          setTab(t);
        }}
        className="overflow-x-auto px-5"
      />
      <div className="px-5 pt-1 text-[10.5px] uppercase tracking-wide text-faint">Cognitive Super-Fabric</div>
      <Tabs tabs={FTABS} value={ftab ?? ('' as FTab)} onChange={setFtab} className="overflow-x-auto px-5" />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {ftab === 'mission' && <MissionPanel />}
        {ftab === 'council' && <CouncilPanel />}
        {ftab === 'expertise' && <ExpertisePanel />}
        {ftab === 'capabilities' && <CapabilityPanel />}
        {ftab === 'skills' && <SkillFactoryPanel />}
        {ftab === 'lab' && <SkillLabPanel />}
        {ftab === 'memory' && <MemoryPanel />}
        {ftab === 'replay' && <ReplayPanel />}
        {ftab === 'distill' && <DistillPanel />}
        {ftab === 'dataset' && <DatasetPanel />}
        {ftab === 'policy' && <PolicyPanel />}
        {ftab === 'freelab' && <FreeLabPanel />}
        {ftab === 'security' && <SecurityPanel />}
        {ftab === 'health' && <HealthPanel />}
        {ftab === 'cfbench' && <CfBenchPanel />}
        {!ftab && (
          <>
            {tab === 'dash' && <Dashboard />}
            {tab === 'trace' && <TraceTab />}
            {tab === 'log' && <LogTab />}
            {tab === 'kpi' && <KpiTab />}
            {tab === 'science' && <ScienceTab />}
            {tab === 'bench' && <BenchTab />}
            {tab === 'models' && <ModelsTab />}
            {tab === 'costs' && <CostsTab />}
            {tab === 'api' && <ApiTab />}
            {tab === 'regression' && <RegressionTab />}
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2" title={hint}>
      <div className="text-[11.5px] text-faint">{k}</div>
      <div className="text-[15px] font-semibold tabular-nums">{v}</div>
      {hint && <div className="text-[10.5px] text-faint">{hint}</div>}
    </div>
  );
}

function lastJevItem() {
  const st = useStore.getState();
  for (const s of [...st.sessions].sort((a, b) => b.updatedAt - a.updatedAt))
    for (const i of [...s.items].reverse()) if (i.kind === 'jev') return i;
  return null;
}

function Dashboard() {
  const [cfg, set] = useJev();
  const log = useStore((s) => s.jevLog);
  const models = useStore((s) => s.models);
  useStore((s) => s.sessions);
  const m = metrics();
  const last = lastJevItem();
  const lastLog = [...log].reverse().find((e) => e.jev);
  const price = (id: string) => models.find((x) => x.id === id)?.inputPrice ?? null;
  const saved = toolSavingsUsd(
    log.filter((e) => e.jev),
    price,
  );
  const p = (last?.packet ?? {}) as Record<string, unknown>;
  return (
    <div>
      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">JEV</span>
            <Toggle checked={cfg.enabled} onChange={(v) => set({ enabled: v })} label="JEV actif" />
            <Badge tone={cfg.enabled ? 'ok' : 'warn'}>
              {cfg.enabled ? 'ACTIF' : 'DÉSACTIVÉ (pipeline standard)'}
            </Badge>
            <Badge tone={m.status.apiOk === false ? 'warn' : 'info'}>
              {m.status.provider}
              {m.status.apiOk === false ? ' → JEV-0 (repli)' : ''}
            </Badge>
            <span className="ml-auto text-[12px] text-muted">Mode</span>
            <Select
              value={cfg.mode}
              onChange={(v) => set({ mode: v as JevMode })}
              options={(['eco', 'balanced', 'performance', 'max'] as JevMode[]).map((x) => ({
                value: x,
                label: MODE_LABEL[x],
              }))}
              title="Mode JEV"
            />
          </div>
          <div className="mb-3 text-[12px] text-faint">{MODE_HELP[cfg.mode]}</div>
          <div className="mb-3">
            <Toggle
              checked={cfg.budgetStop}
              onChange={(v) => set({ budgetStop: v })}
              label="Arrêt automatique quand le budget tokens / temps est épuisé (sinon : compression et poursuite ; le budget coût des Réglages s’applique toujours)"
            />
          </div>
          <div className="mb-1 text-[12px] font-medium">Décision courante</div>
          {last ? (
            <div className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
              <span className="text-faint">Mission</span>
              <span>{String(p.intent ?? '')}</span>
              <span className="text-faint">Modèle choisi</span>
              <span>
                {String(p.selected_model ?? '—')}{' '}
                {p.fallback_model ? (
                  <span className="text-faint">(secours {String(p.fallback_model)})</span>
                ) : null}
              </span>
              <span className="text-faint">Stratégie</span>
              <span>
                {String(p.agent_strategy)} · L{String(p.level)} · {String(p.decided_by)}
              </span>
              <span className="text-faint">Budgets</span>
              <span>
                {String(p.token_budget)} tokens ·{' '}
                {p.cost_budget === null ? 'coût libre' : `$${String(p.cost_budget)}`} · {String(p.max_steps)}{' '}
                étapes
              </span>
              <span className="text-faint">Outils</span>
              <span>{(p.tools_required as string[] | undefined)?.length ?? 0} sélectionnés</span>
              <span className="text-faint">Skills</span>
              <span>{(p.skills_required as string[] | undefined)?.join(', ') || '—'}</span>
              <span className="text-faint">Contexte</span>
              <span>
                {(p.context_required as string[] | undefined)?.length ?? 0} fichier(s) retenu(s),{' '}
                {String(p.context_excluded ?? 0)} écarté(s)
              </span>
              <span className="text-faint">Coût réel</span>
              <span>{last.summary ?? 'en cours'}</span>
            </div>
          ) : (
            <div className="text-[12.5px] text-muted">
              Aucune mission encore : lancez une demande dans le chat.
            </div>
          )}
        </div>
        <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <div className="mb-1 font-medium">Pourquoi JEV a choisi cela</div>
          {last ? (
            <ul className="space-y-1">
              {last.why.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          ) : (
            <div className="text-muted">—</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        <Tile k="Missions avec JEV" v={String(m.with.missions)} />
        <Tile
          k="Tokens économisés (outils)"
          v={fmtTokens(m.with.toolTokensSaved)}
          hint="définitions d’outils non envoyées, mesurées sur le JSON réel"
        />
        <Tile
          k="Économie outils ($)"
          v={fmtCost(saved)}
          hint="tokens évités × prix d’entrée du modèle utilisé"
        />
        <Tile k="Compression contexte" v={pct(m.with.contextCompression)} />
        <Tile
          k="Qualité moyenne"
          v={m.with.qualityAvg === null ? '—' : String(Math.round(m.with.qualityAvg))}
        />
        <Tile k="Taux de réussite" v={pct(m.with.successRate)} />
        <Tile
          k="Coût / mission réussie"
          v={m.with.costPerSuccess === null ? '—' : fmtCost(m.with.costPerSuccess)}
        />
        <Tile k="Taux d’escalade" v={pct(m.with.escalationRate)} />
        <Tile k="Cache hit (décisions)" v={pct(m.cacheHitRate)} />
        <Tile
          k="Coût JEV (JEV-1/2)"
          v={fmtCost(m.with.jevCost)}
          hint={`aujourd’hui ${fmtCost(m.spentToday)}`}
        />
        <Tile
          k="JEV ROI"
          v={
            m.with.jevCost > 0
              ? `${Math.round(saved / m.with.jevCost)}×`
              : saved > 0
                ? '∞ (JEV-0 gratuit)'
                : '—'
          }
          hint="économie outils / coût JEV"
        />
        <Tile
          k="Décision JEV (moy.)"
          v={m.with.decisionMsAvg === null ? '—' : `${Math.round(m.with.decisionMsAvg)} ms`}
        />
      </div>
      <LivePanel />
      <PatternsPanel />
      {lastLog && (
        <div className="mt-3 text-[11.5px] text-faint">
          Dernière mission : {fmtTokens(lastLog.tokensIn + lastLog.tokensOut)} tokens, {fmtCost(lastLog.cost)}
          , {fmtDuration(lastLog.latencyMs)}, {lastLog.toolsOffered}/{lastLog.toolsBaseline} outils exposés.
        </div>
      )}
    </div>
  );
}

/** JEV LIVE CONTROL CENTER: state of the running (or last) mission, updated at each checkpoint. */
function LivePanel() {
  const live = useStore((s) => s.jevLive);
  const running = useStore((s) => s.running);
  const sessions = useStore((s) => s.sessions);
  const setView = useStore((s) => s.setView);
  const entries = Object.entries(live).sort((a, b) => b[1].at - a[1].at);
  const active = entries.find(([sid]) => running[sid]) ?? entries[0];
  if (!active)
    return (
      <div className="mt-4 rounded-xl border border-line p-3 text-[12.5px] text-muted">
        JEV LIVE : aucune mission contrôlée en direct pour l’instant (le contrôle live s’active à chaque
        mission avec JEV).
      </div>
    );
  const [sid, snap] = active;
  const s = snap.state;
  const isRunning = Boolean(running[sid]);
  const interrupted = !isRunning && s.status === 'running';
  const title = sessions.find((x) => x.id === sid)?.title ?? sid;
  const resume = () => {
    const st = useStore.getState();
    st.selectSession(sid);
    setView('chat');
    void runAgent(
      sid,
      `Reprends la mission interrompue à partir de cet état (ne refais pas ce qui est fait) :\n${handoffOf(s)}`,
      [],
    );
  };
  return (
    <div className="mt-4 rounded-xl border border-info/30 bg-info/5 p-3" data-testid="jev-live-panel">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-medium">JEV LIVE — Control Center</span>
        <span className="truncate text-muted">{title}</span>
        <span className="ml-auto text-faint">mis à jour {new Date(snap.at).toLocaleTimeString('fr-FR')}</span>
        {interrupted && (
          <Button size="sm" onClick={resume} title="Relance la mission avec l’état de mission enregistré">
            <Play size={13} /> Reprendre
          </Button>
        )}
        {isRunning && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => stopAgent(sid)}
            title="Pause : l’état de mission est conservé"
          >
            <Square size={13} /> Pause
          </Button>
        )}
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Tile k="Statut" v={isRunning ? 'EN COURS' : interrupted ? 'INTERROMPU' : s.status.toUpperCase()} />
        <Tile k="Modèle courant" v={s.model.split('/').pop() ?? '—'} />
        <Tile k="Stratégie" v={s.strategy} />
        <Tile k="Qualité" v={s.quality === null ? '—' : String(s.quality)} />
        <Tile
          k="Tokens"
          v={fmtTokens(s.tokens)}
          hint={`budget B${s.budgetStage} : ${fmtTokens(s.budgetTokens)}`}
        />
        <Tile
          k="Coût"
          v={fmtCost(s.cost)}
          hint={s.costBudget === null ? 'budget libre' : `budget $${s.costBudget}`}
        />
        <Tile k="Latence" v={fmtDuration(s.elapsedMs)} />
        <Tile k="Budget restant" v={fmtTokens(s.budgetLeftTokens)} />
        <Tile k="Outils exposés" v={String(s.toolsOffered.length)} hint={`${s.toolsUsed.length} utilisés`} />
        <Tile k="Overhead JEV" v={`${Math.round(s.overheadMs)} ms`} hint="temps de décision mesuré" />
        <Tile
          k="Tokens évités (live)"
          v={fmtTokens(s.savedTokens)}
          hint="contexte élagué + outils retirés, par appel suivant"
        />
        <Tile k="Décision live" v={s.lastDecision} />
      </div>
      <LiveTree snap={snap} running={isRunning} />
    </div>
  );
}

/** SUCCESS PATTERN LIBRARY + FAILURE MEMORY (learnt from real runs and user feedback). */
function PatternsPanel() {
  useStore((s) => s.jevLog);
  const ps = patterns().filter((p) => p.best || p.avoid.length);
  if (!ps.length) return null;
  return (
    <div className="mt-3 rounded-xl border border-line p-3 text-[12px]">
      <div className="mb-1 font-medium">Apprentissage : motifs de réussite / mémoire des échecs</div>
      <ul className="space-y-0.5">
        {ps.map((p) => (
          <li key={p.task}>
            <span className="font-medium">{p.task}</span> :{' '}
            {p.best
              ? `meilleur ${p.best.model} (${Math.round(p.best.successRate * 100)} % sur ${p.best.runs}, ${fmtCost(p.best.costPerSuccess)} / succès, ~${fmtTokens(p.best.avgTokens)} tokens)`
              : 'pas encore de modèle fiable'}
            {p.avoid.length ? (
              <span className="text-warn">
                {' '}
                · à éviter : {p.avoid.map((a) => `${a.model} (${a.failures} échecs)`).join(', ')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-1 text-faint">
        Le routage les applique via le classement par type de tâche (👍 / 👎 et « parfait » / « c’est mauvais
        » comptent).
      </div>
    </div>
  );
}

function TraceTab() {
  useStore((s) => s.sessions);
  const last = lastJevItem();
  if (!last) return <div className="text-[12.5px] text-muted">Aucune trace : lancez une mission.</div>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="mb-1 text-[12px] font-medium">
          JEV PRE → TASK DNA → ROUTAGE → CONTEXTE → OUTILS → LLM → QA → CORRECTION → FINAL → APPRENTISSAGE
        </div>
        <TraceTimeline trace={last.trace} />
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-lg bg-panel p-2 text-[11px]">
        {JSON.stringify(last.packet, null, 2)}
      </pre>
    </div>
  );
}

function LogTab() {
  const log = useStore((s) => s.jevLog);
  const setLog = useStore((s) => s.setJevLog);
  const rows = [...log].reverse().slice(0, 300);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12.5px] text-muted">
          {log.length} entrée(s) — clés et secrets masqués automatiquement.
        </span>
        <Button
          size="sm"
          onClick={() => download('jev-log.json', JSON.stringify(log, null, 2), 'application/json')}
          disabled={!log.length}
        >
          <Download size={13} /> JSON
        </Button>
        <Button
          size="sm"
          onClick={() => download('jev-log.csv', toCsv(log), 'text/csv')}
          disabled={!log.length}
        >
          <Download size={13} /> CSV
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => confirm('Vider le JEV_LOG ?') && setLog([])}
          disabled={!log.length}
        >
          <Trash2 size={13} /> Vider
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]" data-testid="jev-log">
            <thead>
              <tr>
                {[
                  'Date',
                  'JEV',
                  'Mission',
                  'Tâche',
                  'Décision',
                  'Modèle',
                  'Tokens',
                  'Coût',
                  'Coût JEV',
                  'Latence',
                  'Qualité',
                  'Retry',
                  'Escalade',
                  'Cache',
                  'Outils',
                  'Économie',
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className={td}>{new Date(e.at).toLocaleString('fr-FR')}</td>
                  <td className={td}>{e.jev ? <Badge tone="ok">avec</Badge> : <Badge>sans</Badge>}</td>
                  <td className={cx(td, 'max-w-[220px] truncate')} title={e.mission}>
                    {e.mission}
                  </td>
                  <td className={td}>
                    {e.task}
                    {e.bench ? ` · bench ${e.bench}` : ''}
                  </td>
                  <td className={td}>
                    {e.decisionBy} · L{e.level}
                  </td>
                  <td className={td}>{e.model}</td>
                  <td className={td}>{fmtTokens(e.tokensIn + e.tokensOut)}</td>
                  <td className={td}>{fmtCost(e.cost)}</td>
                  <td className={td}>{fmtCost(e.jevCost)}</td>
                  <td className={td}>{fmtDuration(e.latencyMs)}</td>
                  <td className={td}>
                    {e.quality ?? '—'}
                    {e.success === null ? '' : e.success ? ' ✓' : ' ✗'}
                  </td>
                  <td className={td}>{e.retries}</td>
                  <td className={td}>{e.escalations}</td>
                  <td className={td}>{e.cacheHits}</td>
                  <td className={td}>
                    {e.toolsOffered}/{e.toolsBaseline}
                  </td>
                  <td className={td}>
                    {e.toolTokensBaseline > e.toolTokens
                      ? `${fmtTokens((e.toolTokensBaseline - e.toolTokens) * e.calls)} tok`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiTab() {
  const log = useStore((s) => s.jevLog);
  const setTab = useStore((s) => s.setView);
  const sci = useMemo(() => analyze(log), [log]);
  const obs = sci.observational;
  const stat = (jev: boolean) => {
    const es = obs.filter((e) => e.jev === jev);
    const avg = (f: (e: JevLogEntry) => number) =>
      es.length ? es.reduce((a, e) => a + f(e), 0) / es.length : null;
    return {
      n: es.length,
      tokens: avg((e) => e.tokensIn + e.tokensOut),
      cost: avg((e) => e.acct?.totalCost ?? e.cost + e.jevCost),
      latency: avg((e) => e.latencyMs),
      success: es.filter((e) => e.success !== null).length
        ? es.filter((e) => e.success).length / es.filter((e) => e.success !== null).length
        : null,
    };
  };
  const rows = [
    ['Sans JEV', stat(false)],
    ['Avec JEV', stat(true)],
  ] as const;
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[13px] font-medium">
          Économies réelles — uniquement missions appariées ({sci.validPairs} paire(s) valide(s))
        </div>
        {!sci.validPairs ? (
          <div className="text-[12.5px] text-muted" data-testid="kpi-real">
            ÉCHANTILLON INSUFFISANT : aucune paire mesurée. Aucun chiffre d’économie n’est affiché sans
            expérience appariée (même tâche, même répétition, OFF / PRE / LIVE / FULL).
          </div>
        ) : (
          <table className="w-full max-w-[860px] text-[12px]" data-testid="kpi-real">
            <thead>
              <tr>
                {[
                  'Variante vs OFF',
                  'Paires (n)',
                  'Δ tokens / mission',
                  'Δ coût / mission',
                  'Δ coût / mission réussie',
                  'Statut',
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['pre', 'live', 'full'] as const).map((v) => {
                const d = sci.deltas[v];
                if (!d) return null;
                const ok = d.label === 'MEASURED';
                return (
                  <tr key={v} className="border-t border-line">
                    <td className={td}>{VARIANT_LABEL[v]}</td>
                    <td className={td}>{d.pairs}</td>
                    <td className={td}>
                      {ok && d.dTokens.meanDelta !== null
                        ? `${d.dTokens.meanDelta > 0 ? '+' : ''}${Math.round(d.dTokens.meanDelta)}`
                        : '—'}
                    </td>
                    <td className={td}>
                      {ok && d.dCost.meanDelta !== null
                        ? `${d.dCost.meanDelta > 0 ? '+' : ''}${d.dCost.meanDelta.toFixed(5)} $`
                        : '—'}
                    </td>
                    <td className={td}>
                      {ok && d.costPerSuccessChange !== null
                        ? `${d.costPerSuccessChange > 0 ? '+' : ''}${Math.round(d.costPerSuccessChange * 100)} %`
                        : '—'}
                    </td>
                    <td className={td}>{ok ? 'MEASURED' : `ÉCHANTILLON INSUFFISANT (n < ${5})`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="mt-1 text-[11.5px] text-faint">
          Détail complet, intervalles de confiance, ROI et décomposition des coûts :{' '}
          <button className="underline" onClick={() => setTab('jev')}>
            onglet « Validation scientifique »
          </button>
          .
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-line p-2">
        <div className="mb-1 text-[13px] font-medium">Observational Data — missions NON appariées</div>
        <div className="mb-1 text-[12px] text-muted">
          Ces missions sont différentes (petites exécutions de référence d’un côté, missions réelles de
          l’autre) : on ne peut en déduire ni économie ni surcoût. Aucune variation n’est calculée.
        </div>
        <table className="w-full max-w-[720px] text-[12px]">
          <thead>
            <tr>
              {[
                'Population',
                'Missions',
                'Tokens moy.',
                'Coût moy. (JEV inclus)',
                'Latence moy. (ms)',
                'Réussite',
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([l, x]) => (
              <tr key={l} className="border-t border-line">
                <td className={td}>{l}</td>
                <td className={td}>{x.n}</td>
                <td className={td}>
                  {x.tokens === null ? '—' : Math.round(x.tokens).toLocaleString('fr-FR')}
                </td>
                <td className={td}>{x.cost === null ? '—' : fmtCost(x.cost)}</td>
                <td className={td}>{x.latency === null ? '—' : Math.round(x.latency)}</td>
                <td className={td}>{pct(x.success)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BenchTab() {
  const [sel, setSel] = useState<string[]>(BENCH.map((b) => b.key));
  const [variants, setVariants] = useState<JevVariant[]>(['off', 'pre', 'live', 'full']);
  const [reps, setReps] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<BenchRun[]>([]);
  const stop = useRef({ stop: false });
  const log = useStore((s) => s.jevLog);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);
  const runs = sel.length * variants.length * reps;
  const run = async () => {
    if (
      !confirm(
        `Lancer ${sel.length} tâche(s) × ${variants.length} variante(s) × ${reps} répétition(s) = ${runs} exécution(s) avec de vrais appels OpenRouter ? Coût typique : quelques centimes par exécution avec des modèles économiques.`,
      )
    )
      return;
    stop.current.stop = false;
    setRes([]);
    try {
      // Vue rapide : même protocole que la validation scientifique (modèle imposé, groupes appariés).
      const m = useStore
        .getState()
        .models.filter((x) => x.capabilities.tools && (x.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(x.id))
        .sort((a, b) => (a.inputPrice ?? 0) - (b.inputPrice ?? 0))[0];
      if (!m) throw new Error('Aucun modèle avec outils dans le catalogue : ouvrez Réglages.');
      const r = await runBench(sel, (msg) => setBusy(msg), stop.current, {
        variants,
        reps,
        protocol: 'fixed-model',
        model: m.id,
      });
      setRes(r);
      toast('ok', `Benchmark terminé : ${r.length} exécution(s).`);
    } catch (e) {
      toast('err', (e as Error).message);
    }
    setBusy(null);
    setView('jev');
  };
  const bench = log.filter((e) => e.bench);
  const stats = VARIANTS.map((v) => variantStats(bench, v.id));
  const base = stats[0]!;
  const latest = (k: string, v: JevVariant) =>
    [...log].reverse().find((e) => e.bench === k && variantOf(e) === v);
  const n = (x: number | null, f: (v: number) => string) => (x === null ? '—' : f(x));
  const d = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`);
  const distCell = (
    x: { mean: number | null; median: number | null; p95: number | null },
    f: (v: number) => string,
  ) => (x.mean === null ? '—' : `${f(x.mean)} · méd ${f(x.median!)} · p95 ${f(x.p95!)}`);
  return (
    <div>
      <div className="mb-2 rounded-lg border border-warn/40 bg-warn/10 p-2 text-[12px]">
        Vue rapide, indicative. Les lignes agrègent toutes les exécutions de benchmark : pour conclure
        (paires, intervalles de confiance, ROI, coût de JEV séparé, qualité), utilisez l’onglet « Validation
        scientifique ».
      </div>
      <div className="mb-2 text-[12.5px] text-muted">
        BENCHMARK 2.0 — chaque tâche est exécutée par le vrai moteur d’agents dans chaque variante : SANS JEV,
        JEV PRE (paquet d’exécution seul), JEV PRE + LIVE (contrôle en cours d’exécution), JEV FULL (+ QA et
        correction ciblée). Tokens, coût et latence viennent d’OpenRouter ; la réussite d’un contrôle
        déterministe de la réponse. Aucune valeur n’est extrapolée.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
        {VARIANTS.map((v) => (
          <label key={v.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={variants.includes(v.id)}
              onChange={(e) =>
                setVariants(
                  e.target.checked
                    ? VARIANTS.map((x) => x.id).filter((x) => x === v.id || variants.includes(x))
                    : variants.filter((x) => x !== v.id),
                )
              }
              aria-label={`Variante ${v.label}`}
            />
            {v.label}
          </label>
        ))}
        <label className="flex items-center gap-1">
          Répétitions
          <Input
            type="number"
            min={1}
            max={10}
            value={reps}
            onChange={(e) => setReps(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="w-16"
            aria-label="Répétitions"
          />
        </label>
        <Button
          size="sm"
          variant="primary"
          disabled={Boolean(busy) || !sel.length || !variants.length}
          onClick={() => void run()}
        >
          <Play size={13} /> Lancer ({runs})
        </Button>
        {busy && (
          <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
            <Square size={13} /> Arrêter après la tâche
          </Button>
        )}
        {busy && <span className="text-[12px] text-info">{busy}</span>}
      </div>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-[12px]" data-testid="bench2-table">
          <thead>
            <tr>
              {[
                'Variante',
                'Exéc.',
                'Tokens (moy · méd · p95)',
                'Coût',
                'Latence',
                'Qualité',
                'Succès',
                'Coût / succès',
                'Gaspillage (tok)',
                'Qualité / $',
                'Qualité / 1k tok',
                'Succès / $',
                'Succès / 1k tok',
                'Overhead JEV',
                'Décisions live',
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((x, i) => (
              <tr key={x.variant} className="border-t border-line">
                <td className={cx(td, 'font-medium')}>{VARIANTS[i]!.label}</td>
                <td className={td}>{x.runs}</td>
                <td className={td}>{distCell(x.tokens, fmtTokens)}</td>
                <td className={td}>{distCell(x.cost, fmtCost)}</td>
                <td className={td}>{distCell(x.latency, fmtDuration)}</td>
                <td className={td}>{n(x.quality.mean, (v) => v.toFixed(0))}</td>
                <td className={td}>{pct(x.successRate)}</td>
                <td className={td}>{n(x.costPerSuccess, fmtCost)}</td>
                <td className={td}>{n(x.waste.mean, (v) => fmtTokens(Math.round(v)))}</td>
                <td className={td}>{n(x.qualityPerUsd, (v) => v.toFixed(0))}</td>
                <td className={td}>{n(x.qualityPer1kTokens, (v) => v.toFixed(1))}</td>
                <td className={td}>{n(x.successPerUsd, (v) => v.toFixed(0))}</td>
                <td className={td}>{n(x.successPer1kTokens, (v) => v.toFixed(3))}</td>
                <td className={td}>{pct(x.overheadPct)}</td>
                <td className={td}>
                  {x.liveDecisions}
                  {x.modelSwitches ? ` (${x.modelSwitches} switch)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-2 w-full max-w-[880px] text-[12px]" data-testid="bench2-delta">
          <thead>
            <tr>
              {[
                'Δ vs SANS JEV',
                'Variation tokens (indicatif)',
                'Variation coût (indicatif)',
                'Réduction du gaspillage mesuré (indicatif)',
                'Latence',
                'Qualité',
                'Succès (pts)',
                'JEV ROI',
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.slice(1).map((x, i) => {
              const sv = base.runs && x.runs ? savingsVs(base, x) : null;
              return (
                <tr key={x.variant} className="border-t border-line">
                  <td className={cx(td, 'font-medium')}>{VARIANTS[i + 1]!.label}</td>
                  <td className={td}>{sv ? pct(sv.tokenSavings) : '—'}</td>
                  <td className={td}>{sv ? pct(sv.costSavings) : '—'}</td>
                  <td
                    className={cx(
                      td,
                      sv?.wasteReduction != null && (sv.wasteReduction >= 0.9 ? 'text-ok' : 'text-warn'),
                    )}
                  >
                    {sv ? pct(sv.wasteReduction) : '—'}
                  </td>
                  <td className={td}>{sv ? d(sv.latencyDelta) : '—'}</td>
                  <td className={td}>{sv ? d(sv.qualityDelta) : '—'}</td>
                  <td className={td}>
                    {sv?.successDelta != null
                      ? `${sv.successDelta >= 0 ? '+' : ''}${Math.round(sv.successDelta * 100)}`
                      : '—'}
                  </td>
                  <td className={td}>{sv?.jevRoi != null ? `${sv.jevRoi.toFixed(0)}×` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-1 text-[11.5px] text-faint">
          TARGET &gt; 90 % de réduction du gaspillage évitable : affiché en vert seulement si la mesure
          l’atteint. Gaspillage = définitions d’outils jamais utilisés + appels d’outils en échec + appels
          répétés + réponses jetées (tokens mesurés par exécution). « — » = pas encore mesuré.
        </div>
      </div>
      <table className="w-full text-[12px]" data-testid="bench-table">
        <thead>
          <tr>
            <th className={th} />
            <th className={th}>Catégorie</th>
            {VARIANTS.map((v) => (
              <th key={v.id} className={th}>
                {v.label} (tokens · coût · succès)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BENCH.map((b) => (
            <tr key={b.key} className="border-t border-line">
              <td className={td}>
                <input
                  type="checkbox"
                  checked={sel.includes(b.key)}
                  onChange={(e) =>
                    setSel(e.target.checked ? [...sel, b.key] : sel.filter((k) => k !== b.key))
                  }
                  aria-label={b.label}
                />
              </td>
              <td className={cx(td, 'font-medium')} title={b.text}>
                {b.label}
              </td>
              {VARIANTS.map((v) => {
                const x = latest(b.key, v.id);
                return (
                  <td key={v.id} className={td}>
                    {x
                      ? `${fmtTokens(x.tokensIn + x.tokensOut)} · ${fmtCost(x.cost + x.jevCost)} · ${x.success ? '✓' : '✗'}`
                      : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {res.length > 0 && (
        <div className="mt-2 text-[12px] text-muted">
          Dernier lancement : {res.filter((r) => r.ok).length}/{res.length} réussites.
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11.5px] text-faint">
        <FlaskConical size={12} /> Les sessions de benchmark restent visibles dans le Chat (titre « [bench …]
        »).
      </div>
    </div>
  );
}

function ModelsTab() {
  useStore((s) => s.jevLog);
  const profiles = metrics().profiles;
  if (!profiles.length)
    return (
      <div className="text-[12.5px] text-muted">
        Les profils se construisent à partir des missions réelles (JEV_LOG).
      </div>
    );
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr>
          {[
            'Modèle',
            'Exécutions',
            'Réussite',
            'Qualité',
            'Tokens moy.',
            'Coût moy.',
            'Latence moy.',
            'Taux de retry',
            'Forces',
            'Faiblesses',
          ].map((h) => (
            <th key={h} className={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {profiles.map((p) => (
          <tr key={p.model} className="border-t border-line">
            <td className={cx(td, 'font-medium')}>{p.model}</td>
            <td className={td}>{p.runs}</td>
            <td className={td}>{pct(p.successRate)}</td>
            <td className={td}>{p.quality === null ? '—' : Math.round(p.quality)}</td>
            <td className={td}>{fmtTokens(p.avgTokens)}</td>
            <td className={td}>{fmtCost(p.avgCost)}</td>
            <td className={td}>{fmtDuration(p.avgLatencyMs)}</td>
            <td className={td}>{pct(p.retryRate)}</td>
            <td className={td}>{p.strengths.join(', ') || '—'}</td>
            <td className={td}>{p.weaknesses.join(', ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApiTab() {
  const [cfg, set] = useJev();
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [test, setTest] = useState<string | null>(null);
  const [, bump] = useState(0);
  const masked = jevKeyMasked();
  const runTest = async () => {
    const c = jevSettings();
    if (c.endpoint === JEV_DIRECT_URL) {
      setTest(
        'Échec : api.typesafe.ai refuse les appels directs du navigateur (CORS). Cliquez « Relais Supabase ». JEV-0 local continue de fonctionner.',
      );
      return;
    }
    if (!getJevKey()) {
      setTest(
        'Échec : aucune clé JEV enregistrée (le relais ne stocke aucune clé). JEV-0 local continue de fonctionner.',
      );
      return;
    }
    setTest('Test en cours…');
    try {
      // Larger timeout for the test only: the relay may cold-start.
      const r = await callJev1(
        { ...c, timeoutMs: Math.max(c.timeoutMs, 10_000) },
        getJevKey() || null,
        {
          request: 'Analyse ce fichier Excel et calcule les totaux par agence',
          attachments: ['ventes.xlsx'],
        },
        (u, i) => fetch(u, i) as never,
      );
      setTest(
        `OK : ${r.model} en ${r.ms} ms — type ${r.type} (${Math.round(r.typeConfidence * 100)} %), ${r.inputTokens} tokens, $${r.costUsd.toFixed(6)}.`,
      );
    } catch (e) {
      setTest(
        `Échec : ${jevErrorText(e, Math.max(c.timeoutMs, 10_000))}. JEV-0 local continue de fonctionner.`,
      );
    }
  };
  const relay = relaySource;
  return (
    <div className="grid max-w-[980px] gap-4 md:grid-cols-2">
      <div className="space-y-2 text-[12.5px]">
        <div className="font-medium">JEV API SETTINGS</div>
        <label className="block">
          <div className="text-faint">Fournisseur</div>
          <Select
            value={cfg.provider}
            onChange={(v) => set({ provider: v as JevSettings['provider'] })}
            options={[
              { value: 'local', label: 'JEV-0 local uniquement' },
              { value: 'hybrid', label: 'Hybride (JEV-0 puis JEV-1 si rentable)' },
              { value: 'api', label: 'API (JEV-1 à chaque mission, via ROI gate)' },
            ]}
            title="Fournisseur JEV"
          />
        </label>
        <label className="block">
          <div className="text-faint">API endpoint (TypeSafe ou relais)</div>
          <Input
            value={cfg.endpoint}
            onChange={(e) => set({ endpoint: e.target.value })}
            aria-label="JEV endpoint"
          />
          <div className="mt-1 flex gap-1.5">
            <Button
              size="sm"
              variant={cfg.endpoint === JEV_RELAY_URL ? 'ghost' : undefined}
              onClick={() => set({ endpoint: JEV_RELAY_URL })}
              title="Fonction Supabase jev-relay (projet mntech-sync) : transmet votre clé à TypeSafe, n’en stocke aucune"
            >
              Relais Supabase
            </Button>
            {cfg.endpoint === JEV_RELAY_URL && <Badge tone="ok">relais actif</Badge>}
            {cfg.endpoint === JEV_DIRECT_URL && <Badge tone="warn">direct : bloqué par CORS</Badge>}
          </div>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label>
            <div className="text-faint">Modèle</div>
            <Input
              value={cfg.model}
              onChange={(e) => set({ model: e.target.value })}
              aria-label="JEV modèle"
            />
          </label>
          <label>
            <div className="text-faint">Timeout (ms)</div>
            <Input
              type="number"
              value={cfg.timeoutMs}
              onChange={(e) => set({ timeoutMs: Number(e.target.value) || 1500 })}
              aria-label="JEV timeout"
            />
          </label>
          <label>
            <div className="text-faint">Budget / jour ($)</div>
            <Input
              type="number"
              step="0.01"
              value={cfg.budgetDaily}
              onChange={(e) => set({ budgetDaily: Number(e.target.value) || 0 })}
              aria-label="JEV budget"
            />
          </label>
        </div>
        <Toggle
          checked={cfg.jev2}
          onChange={(v) => set({ jev2: v })}
          label="JEV-2 (arbitrage par un petit LLM en cas de conflit)"
        />
        <div className="rounded-lg border border-line p-2">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <KeyRound size={13} /> Clé API JEV
          </div>
          <div className="mb-1 text-faint">
            {masked
              ? `Enregistrée : ${masked} (jamais affichée en clair, jamais envoyée dans un prompt ni un log)`
              : 'Aucune clé enregistrée'}
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Coller la clé TypeSafe"
              autoComplete="off"
              aria-label="Clé API JEV"
            />
            <Button
              size="sm"
              disabled={!key.trim()}
              onClick={() => {
                setJevKey(key, remember);
                setKey('');
                bump((x) => x + 1);
              }}
            >
              Enregistrer
            </Button>
            {masked && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearJevKey();
                  bump((x) => x + 1);
                }}
              >
                Effacer
              </Button>
            )}
          </div>
          <Toggle
            checked={remember}
            onChange={setRemember}
            label="Se souvenir sur cet ordinateur (sinon : cette session seulement)"
          />
        </div>
        <Button size="sm" onClick={() => void runTest()}>
          Tester la connexion (≈ ${jev1Cost('x').toFixed(6)})
        </Button>
        {test && (
          <div className={cx('text-[12px]', test.startsWith('OK') ? 'text-ok' : 'text-warn')}>{test}</div>
        )}
        <div className="text-[11.5px] text-faint">
          Le navigateur ne peut pas appeler api.typesafe.ai directement (CORS). Le relais Supabase jev-relay
          (code ci-contre, déployé) transmet votre clé à TypeSafe sans la stocker ni la journaliser ; vous
          pouvez aussi déployer le vôtre. Sans relais ou sans clé, JEV-0 local prend tout en charge. Cache des
          décisions JEV : {Object.values(cache.stats).reduce((s, x) => s + x.hits, 0)} succès.
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[12.5px] font-medium">
          Relais déployé (Supabase Edge Function)
          <Button size="sm" variant="ghost" onClick={() => download('jev-relay.ts', relay, 'text/plain')}>
            <Download size={13} /> jev-relay.ts
          </Button>
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-panel p-2 text-[11px]">{relay}</pre>
      </div>
    </div>
  );
}

function FabricChecks() {
  const [c, setC] = useState(() => fabricRegression());
  const n = (v: string) => c.filter((x) => x.verdict === v).length;
  return (
    <div className="mb-4 rounded-lg border border-line p-2" data-testid="fabric-regression">
      <div className="mb-1 flex items-center gap-2 font-medium">
        Non-régression Cognitive Fabric — PASS {n('PASS')} · WARN {n('WARN')} · FAIL {n('FAIL')}
        <Button size="sm" variant="ghost" onClick={() => setC(fabricRegression())}>
          Recalculer
        </Button>
        <Button
          size="sm"
          onClick={() => download('fabric-regression.json', JSON.stringify(c, null, 2), 'application/json')}
        >
          <Download size={13} /> JSON
        </Button>
      </div>
      <table className="w-full text-[12px]">
        <tbody>
          {c.map((x, i) => (
            <tr key={i} className="border-t border-line">
              <td className={td}>
                <Badge tone={x.verdict === 'PASS' ? 'ok' : x.verdict === 'WARN' ? 'warn' : 'err'}>
                  {x.verdict}
                </Badge>
              </td>
              <td className={td}>{x.group}</td>
              <td className={td}>{x.name}</td>
              <td className={cx(td, 'text-muted')}>{x.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegressionTab() {
  const [r, setR] = useState(() => regressionReport());
  return (
    <div className="max-w-[900px] text-[12.5px]">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck size={14} className={r.ok ? 'text-ok' : 'text-err'} />
        <span className="font-medium">
          {r.ok
            ? 'Aucune régression : tout l’inventaire d’avant JEV existe toujours.'
            : 'Régression : des éléments ont disparu.'}
        </span>
        <span className="text-faint">(référence du {r.capturedAt})</span>
        <Button size="sm" variant="ghost" onClick={() => setR(regressionReport())}>
          Recalculer
        </Button>
        <Button
          size="sm"
          onClick={() => download('regression-report.json', JSON.stringify(r, null, 2), 'application/json')}
        >
          <Download size={13} /> JSON
        </Button>
      </div>
      <FabricChecks />
      <table className="w-full text-[12px]" data-testid="regression">
        <thead>
          <tr>
            {['Inventaire', 'Avant', 'Après', 'Disparus', 'Ajoutés'].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.sections.map((s) => (
            <tr key={s.name} className="border-t border-line">
              <td className={td}>{s.name}</td>
              <td className={td}>{s.before}</td>
              <td className={td}>{s.after}</td>
              <td className={cx(td, s.missing.length ? 'text-err' : '')}>{s.missing.join(', ') || '—'}</td>
              <td className={cx(td, 'text-muted')}>{s.added.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
