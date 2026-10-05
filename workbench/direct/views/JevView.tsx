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
  setJevKey,
  type JevSettings,
} from '../lib/jev';
import { BENCH, runBench } from '../lib/jevBench';
import { regressionReport } from '../lib/inventory';
import { MODE_HELP, MODE_LABEL } from '../../server/jev/control';
import { compare, toCsv, type JevLogEntry } from '../../server/jev/metrics';
import { callJev1, jev1Cost } from '../../server/jev/provider';
import type { JevMode } from '../../server/jev/tools';
import { TraceTimeline } from './JevTrace';
import { CostsTab } from './IntelligenceView';

type Tab = 'dash' | 'trace' | 'log' | 'kpi' | 'bench' | 'models' | 'costs' | 'api' | 'regression';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dash', label: 'Control Center' },
  { id: 'trace', label: 'Trace live' },
  { id: 'log', label: 'JEV_LOG' },
  { id: 'kpi', label: 'Sans / avec JEV' },
  { id: 'bench', label: 'Benchmark A/B' },
  { id: 'models', label: 'Profils modèles' },
  { id: 'costs', label: 'Cost Intelligence' },
  { id: 'api', label: 'JEV API' },
  { id: 'regression', label: 'Régression' },
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
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="overflow-x-auto px-5" />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {tab === 'dash' && <Dashboard />}
        {tab === 'trace' && <TraceTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'kpi' && <KpiTab />}
        {tab === 'bench' && <BenchTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'costs' && <CostsTab />}
        {tab === 'api' && <ApiTab />}
        {tab === 'regression' && <RegressionTab />}
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
      {lastLog && (
        <div className="mt-3 text-[11.5px] text-faint">
          Dernière mission : {fmtTokens(lastLog.tokensIn + lastLog.tokensOut)} tokens, {fmtCost(lastLog.cost)}
          , {fmtDuration(lastLog.latencyMs)}, {lastLog.toolsOffered}/{lastLog.toolsBaseline} outils exposés.
        </div>
      )}
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
  const benchKeys = [...new Set(log.filter((e) => e.bench).map((e) => e.bench!))];
  // Real savings: only benchmark missions measured both ways.
  const paired = benchKeys.filter(
    (k) => log.some((e) => e.bench === k && e.jev) && log.some((e) => e.bench === k && !e.jev),
  );
  const lastOf = (k: string, jev: boolean) => [...log].reverse().find((e) => e.bench === k && e.jev === jev)!;
  const a = paired.map((k) => lastOf(k, false));
  const b = paired.map((k) => lastOf(k, true));
  const rows = compare(a, b);
  const all = compare(
    log.filter((e) => !e.jev),
    log.filter((e) => e.jev),
  );
  const show = (r: (typeof rows)[number]) => {
    const fmt = (v: number | null) =>
      v === null
        ? '—'
        : r.metric.includes('$')
          ? fmtCost(v)
          : r.metric.includes('Taux')
            ? pct(v)
            : r.metric.includes('ms')
              ? `${Math.round(v)}`
              : Math.round(v).toLocaleString('fr-FR');
    const good = r.change === null ? null : r.better === 'lower' ? r.change < 0 : r.change > 0;
    return (
      <tr key={r.metric} className="border-t border-line">
        <td className={td}>{r.metric}</td>
        <td className={td}>{fmt(r.without)}</td>
        <td className={td}>{fmt(r.with)}</td>
        <td className={cx(td, good === null ? '' : good ? 'text-ok' : 'text-err')}>
          {r.change === null ? '—' : `${r.change > 0 ? '+' : ''}${Math.round(r.change * 100)} %`}
        </td>
      </tr>
    );
  };
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-[13px] font-medium">
          REAL SAVINGS — même mission sans JEV vs avec JEV ({paired.length} paire(s) mesurée(s))
        </div>
        {!paired.length ? (
          <div className="text-[12.5px] text-muted">
            Aucune paire mesurée : lancez le Benchmark A/B. Aucun chiffre n’est affiché sans mesure.
          </div>
        ) : (
          <table className="w-full max-w-[720px] text-[12px]" data-testid="kpi-real">
            <thead>
              <tr>
                {['Indicateur', 'Sans JEV', 'Avec JEV', 'Variation'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map(show)}</tbody>
          </table>
        )}
      </div>
      <div>
        <div className="mb-1 text-[13px] font-medium">
          Toutes les missions enregistrées (missions différentes : indicatif)
        </div>
        <table className="w-full max-w-[720px] text-[12px]">
          <thead>
            <tr>
              {['Indicateur', 'Sans JEV', 'Avec JEV', 'Variation'].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{all.map(show)}</tbody>
        </table>
      </div>
      <div className="text-[11.5px] text-faint">
        PROJECTED SAVINGS : les tokens d’outils évités sont calculés sur les définitions réellement envoyées ;
        le reste (retries, escalades, contexte) n’est compté que lorsqu’il est mesuré. L’objectif de &gt; 90 %
        de réduction du gaspillage évitable n’est affiché comme atteint que si les mesures le montrent.
      </div>
    </div>
  );
}

function BenchTab() {
  const [sel, setSel] = useState<string[]>(BENCH.map((b) => b.key));
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ key: string; jev: boolean; ok: boolean }[]>([]);
  const stop = useRef({ stop: false });
  const log = useStore((s) => s.jevLog);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);
  const run = async () => {
    if (
      !confirm(
        `Lancer ${sel.length} tâche(s) × 2 (sans / avec JEV) avec de vrais appels OpenRouter ? Coût typique : quelques centimes avec des modèles économiques.`,
      )
    )
      return;
    stop.current.stop = false;
    setRes([]);
    try {
      const r = await runBench(sel, (m) => setBusy(m), stop.current);
      setRes(r);
      toast('ok', `Benchmark terminé : ${r.length} exécution(s).`);
    } catch (e) {
      toast('err', (e as Error).message);
    }
    setBusy(null);
    setView('jev');
  };
  const latest = (k: string, jev: boolean) => [...log].reverse().find((e) => e.bench === k && e.jev === jev);
  return (
    <div>
      <div className="mb-2 text-[12.5px] text-muted">
        Chaque tâche est exécutée deux fois par le vrai moteur d’agents : sans JEV (pipeline standard), puis
        avec JEV. Tokens, coût et latence viennent d’OpenRouter ; la réussite d’un contrôle déterministe de la
        réponse.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={Boolean(busy) || !sel.length}
          onClick={() => void run()}
        >
          <Play size={13} /> Lancer A/B ({sel.length})
        </Button>
        {busy && (
          <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
            <Square size={13} /> Arrêter après la tâche
          </Button>
        )}
        {busy && <span className="text-[12px] text-info">{busy}</span>}
      </div>
      <table className="w-full text-[12px]" data-testid="bench-table">
        <thead>
          <tr>
            {[
              '',
              'Catégorie',
              'Tokens sans',
              'Tokens avec',
              'Coût sans',
              'Coût avec',
              'Latence sans',
              'Latence avec',
              'Qualité avec',
              'Succès sans',
              'Succès avec',
            ].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BENCH.map((b) => {
            const x = latest(b.key, false);
            const y = latest(b.key, true);
            return (
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
                <td className={td}>{x ? fmtTokens(x.tokensIn + x.tokensOut) : '—'}</td>
                <td className={td}>{y ? fmtTokens(y.tokensIn + y.tokensOut) : '—'}</td>
                <td className={td}>{x ? fmtCost(x.cost) : '—'}</td>
                <td className={td}>{y ? fmtCost(y.cost + y.jevCost) : '—'}</td>
                <td className={td}>{x ? fmtDuration(x.latencyMs) : '—'}</td>
                <td className={td}>{y ? fmtDuration(y.latencyMs) : '—'}</td>
                <td className={td}>{y?.quality ?? '—'}</td>
                <td className={td}>{x ? (x.success ? '✓' : '✗') : '—'}</td>
                <td className={td}>{y ? (y.success ? '✓' : '✗') : '—'}</td>
              </tr>
            );
          })}
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
    setTest('Test en cours…');
    try {
      const r = await callJev1(
        jevSettings(),
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
      const msg = (e as Error).message;
      setTest(
        `Échec : ${/Failed to fetch|NetworkError/i.test(msg) ? 'appel bloqué par le navigateur (CORS) ou réseau — renseignez un relais (édition serveur, fonction Supabase…)' : (e as Error).name === 'AbortError' ? `délai de ${cfg.timeoutMs} ms dépassé` : msg}. JEV-0 local continue de fonctionner.`,
      );
    }
  };
  const relay = useMemo(
    () =>
      `// Relais JEV (Deno / Supabase Edge Function) : la clé reste côté serveur (secret TYPESAFE_API_KEY).\n// Déploiement : supabase functions deploy jev-relay ; secrets : supabase secrets set TYPESAFE_API_KEY=…\nconst ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'null').split(',');\nDeno.serve(async (req) => {\n  const origin = req.headers.get('origin') ?? 'null';\n  const cors = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };\n  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });\n  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });\n  const body = await req.text();\n  if (body.length > 200_000) return new Response('too large', { status: 413, headers: cors });\n  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${Deno.env.get('TYPESAFE_API_KEY')}\` }, body });\n  return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });\n});\n`,
    [],
  );
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
          Le navigateur ne peut pas appeler api.typesafe.ai directement (CORS). Dans l’édition directe,
          utilisez un relais qui garde la clé côté serveur (modèle ci-contre) ; sans relais, JEV-0 local prend
          tout en charge. Cache des décisions JEV :{' '}
          {Object.values(cache.stats).reduce((s, x) => s + x.hits, 0)} succès.
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[12.5px] font-medium">
          Relais (clé côté serveur)
          <Button size="sm" variant="ghost" onClick={() => download('jev-relay.ts', relay, 'text/plain')}>
            <Download size={13} /> jev-relay.ts
          </Button>
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-lg bg-panel p-2 text-[11px]">{relay}</pre>
      </div>
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
