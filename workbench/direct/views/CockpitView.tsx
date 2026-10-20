// COCKPIT IA — the application's front page in four sections, every figure read from the application's own stores:
//  · Cockpit : launch a mission, live KPIs, missions, sessions, failures, workflows (Mission Control);
//  · Catalogue LLM : the real model catalogue (price, context, capabilities) with MEASURED latency and reliability
//    from the usage log — « — » when a model was never called (nothing is estimated);
//  · Orchestration : the workflows as executable chains + the live trace of the latest session (stages, tools, agents);
//  · Observabilité & coûts : calls, tokens, cost and latency per day / model / agent, budgets, recent errors.
import { useMemo, useState } from 'react';
import { Activity, BarChart3, Bot, Check, Gauge as GaugeIcon, Library, Play, Search, Workflow as WorkflowIcon } from 'lucide-react';
import { Button, Gauge } from '../../web/components/ui';
import { cx, fmtCost, fmtDuration, fmtRelative, fmtTokens, shortModel } from '../../web/lib/format';
import { agentStats, dailySeries, modelStats, percentile } from '../lib/cockpit';
import { allAgents } from '../lib/roles';
import { today, useStore } from '../lib/store';
import { allWorkflows, runWorkflow } from '../lib/workflows';
import { Empty, HomeView, Kpi, Panel } from './HomeView';
import { PageHeader } from './PageHeader';

const DAYS30 = 30 * 86400_000;
const price = (v: number | null) => (v === null ? '—' : v === 0 ? 'gratuit' : `${v.toFixed(v < 1 ? 3 : 2)} $`);
const ctx = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

/** Cockpit IA — the front page (mission launcher, KPIs, 24 h pulse, missions, sessions, failures, workflows). */
export function CockpitView() {
  return <HomeView />;
}

/** The real catalogue + what was measured on it. */
export function ModelCatalogue() {
  const models = useStore((s) => s.models);
  const usage = useStore((s) => s.usage);
  const [q, setQ] = useState('');
  const [onlyMeasured, setOnlyMeasured] = useState(false);
  const since = Date.now() - DAYS30;
  const stats = useMemo(() => new Map(modelStats(usage, since).map((s) => [s.model, s])), [usage, since]);
  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    return models
      .filter((m) => !f || `${m.id} ${m.name} ${m.provider}`.toLowerCase().includes(f))
      .filter((m) => !onlyMeasured || stats.has(m.id))
      .sort((a, b) => (stats.get(b.id)?.cost ?? 0) - (stats.get(a.id)?.cost ?? 0) || (stats.get(b.id)?.calls ?? 0) - (stats.get(a.id)?.calls ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 300);
  }, [models, q, onlyMeasured, stats]);
  const measured = models.filter((m) => stats.has(m.id)).length;
  const top = [...stats.values()].sort((a, b) => b.calls - a.calls)[0];
  const defaultModel = useStore((x) => x.settings.defaultModel);
  const session = useStore((x) => x.sessions.find((y) => y.id === x.currentId));
  const busy = useStore((x) => Boolean(session && x.running[session.id]));
  const chosen = session?.model ?? defaultModel;
  const choose = (id: string) => {
    const st = useStore.getState();
    if (session && !busy) st.patchSession(session.id, { model: id });
    else st.patchSettings({ defaultModel: id });
    st.toast('ok', session && !busy ? `Modèle de la session : ${shortModel(id)}` : `Modèle par défaut : ${shortModel(id)}`);
  };
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1400px] space-y-3 p-4">
        <PageHeader
          title="Catalogue LLM"
          subtitle="Sélectionnez le modèle adapté à votre tâche : prix, contexte, capacités, latence et fiabilité mesurées chez vous"
          right={
            <span className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px]" data-testid="catalogue-chosen">
              <span className="text-faint">{session ? 'Modèle de cette session' : 'Modèle par défaut'}</span>
              <b>{chosen === 'auto' ? 'Auto (routage)' : shortModel(chosen)}</b>
              <button className="text-accent hover:underline" onClick={() => useStore.getState().setView('settings')}>
                Configurer
              </button>
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Modèles au catalogue" value={String(models.length)} sub={models.length ? 'lus chez les fournisseurs' : 'catalogue non chargé (clé fournisseur ?)'} />
          <Kpi label="Modèles mesurés (30 j)" value={String(measured)} sub="appelés au moins une fois" tone={measured ? 'ok' : undefined} />
          <Kpi label="Modèle le plus appelé (30 j)" value={top ? shortModel(top.model) : '—'} sub={top ? `${top.calls} appel(s) · p50 ${fmtDuration(top.p50)}` : 'aucun appel enregistré'} />
          <Kpi label="Appels (30 j)" value={String([...stats.values()].reduce((a, s) => a + s.calls, 0))} sub={fmtCost([...stats.values()].reduce((a, s) => a + s.cost, 0))} />
        </div>
        <Panel
          title="Catalogue des modèles"
          icon={<Library size={13} />}
          right={
            <span className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11.5px] text-muted">
                <input type="checkbox" checked={onlyMeasured} onChange={(e) => setOnlyMeasured(e.target.checked)} /> mesurés seulement
              </label>
              <span className="flex items-center gap-1 rounded-lg border border-line bg-input px-2">
                <Search size={12} className="text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrer…" className="h-7 w-40 bg-transparent text-[12px] outline-none" data-testid="catalogue-filter" />
              </span>
            </span>
          }
        >
          {!rows.length && <Empty>{models.length ? 'Aucun modèle ne correspond.' : 'Le catalogue se charge avec une clé fournisseur (Paramètres).'}</Empty>}
          {rows.length > 0 && (
            <table className="w-full text-[12px]" data-testid="catalogue-table">
              <thead className="text-left text-faint">
                <tr>
                  <th className="px-2 py-1">Modèle</th>
                  <th className="px-2 py-1">Fournisseur</th>
                  <th className="px-2 py-1 text-right">Contexte</th>
                  <th className="px-2 py-1 text-right">Entrée $/M</th>
                  <th className="px-2 py-1 text-right">Sortie $/M</th>
                  <th className="px-2 py-1">Capacités</th>
                  <th className="px-2 py-1 text-right">Appels 30 j</th>
                  <th className="px-2 py-1 text-right">Latence p50</th>
                  <th className="px-2 py-1 text-right">p95</th>
                  <th className="px-2 py-1 text-right">Fiabilité</th>
                  <th className="px-2 py-1 text-right">Coût 30 j</th>
                  <th className="px-2 py-1 text-right">Choix</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const s = stats.get(m.id);
                  return (
                    <tr key={m.id} className={cx('border-t border-line', m.id === chosen && 'bg-accent-soft')}>
                      <td className="px-2 py-1 font-medium" title={m.id}>
                        {m.name}
                      </td>
                      <td className="px-2 py-1 text-muted">{m.provider}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{ctx(m.contextLength)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{price(m.inputPrice)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{price(m.outputPrice)}</td>
                      <td className="px-2 py-1 text-faint">
                        {[m.capabilities.tools && 'outils', m.capabilities.vision && 'vision', m.capabilities.reasoning && 'raisonnement', m.capabilities.structuredOutputs && 'JSON'].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{s ? s.calls : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{s ? fmtDuration(s.p50) : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{s ? fmtDuration(s.p95) : '—'}</td>
                      <td className={cx('px-2 py-1 text-right tabular-nums', s && s.reliability < 0.9 && 'text-warn')}>{s ? `${Math.round(s.reliability * 100)} %` : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{s ? fmtCost(s.cost) : '—'}</td>
                      <td className="px-2 py-1 text-right">
                        {m.id === chosen ? (
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent">
                            <Check size={12} /> choisi
                          </span>
                        ) : (
                          <button
                            className="rounded-md border border-line px-2 py-0.5 text-[11.5px] hover:border-accent hover:text-accent"
                            onClick={() => choose(m.id)}
                            title={session && !busy ? 'Utiliser ce modèle dans la session en cours' : 'En faire le modèle par défaut'}
                          >
                            Choisir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Workflows as executable chains + the live trace of the latest session. */
export function Orchestration() {
  const workflows = useStore((s) => s.workflows);
  const sessions = useStore((s) => s.sessions);
  const running = useStore((s) => s.running);
  const status = useStore((s) => s.status);
  const customAgents = useStore((s) => s.agents);
  const agents = allAgents(customAgents);
  const wfs = allWorkflows(workflows);
  const [sel, setSel] = useState<string | null>(null);
  const live = sessions.filter((s) => running[s.id]).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const latest = sessions.find((s) => s.id === sel) ?? live ?? [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const pipeline = latest?.items.findLast?.((i) => i.kind === 'pipeline');
  const stages = pipeline && pipeline.kind === 'pipeline' ? pipeline : null;
  const tools = latest ? latest.items.filter((i) => i.kind === 'tool').slice(-12) : [];
  const subs = latest ? latest.items.filter((i) => i.kind === 'subagent').slice(-6) : [];
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-[1400px] gap-3 p-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <PageHeader
            title="Orchestration des agents"
            subtitle="Définissez et exécutez des workflows d’agents pour vos tâches complexes ; suivez la trace en direct"
            right={
              <Button size="sm" variant="primary" onClick={() => useStore.getState().setView('workflows')}>
                <WorkflowIcon size={13} /> Créer un workflow
              </Button>
            }
          />
        </div>
        <Panel
          title="Workflows exécutables"
          icon={<WorkflowIcon size={13} />}
          right={
            <button className="text-[11.5px] text-accent hover:underline" onClick={() => useStore.getState().setView('workflows')}>
              Créer / modifier
            </button>
          }
        >
          {!wfs.length && <Empty>Aucun workflow.</Empty>}
          {wfs.map((w) => (
            <div key={w.id} className="mb-2 rounded-xl border border-line p-2" data-testid="orchestration-workflow">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{w.name}</div>
                  <div className="truncate text-[11.5px] text-faint">
                    {w.description || `${w.steps.length} étapes`} · agent {agents.find((a) => a.id === w.agent)?.name ?? w.agent}
                    {w.lastRunAt ? ` · dernière exécution ${fmtRelative(w.lastRunAt)}` : ''}
                  </div>
                </div>
                <Button size="sm" onClick={() => runWorkflow(w, [])} title="Exécuter">
                  <Play size={12} /> Lancer
                </Button>
              </div>
              <ol className="mt-1.5 flex flex-wrap items-center gap-1">
                {w.steps.map((st, i) => (
                  <li key={i} className="flex items-center gap-1 text-[11.5px]">
                    <span className="rounded-md border border-line bg-hover px-1.5 py-0.5">
                      <b className="mr-1 font-mono text-accent">{i + 1}</b>
                      {st.length > 64 ? `${st.slice(0, 63)}…` : st}
                    </span>
                    {i < w.steps.length - 1 && <span className="text-faint">→</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </Panel>
        <Panel
          title={live ? 'Trace en direct' : 'Trace de la dernière session'}
          icon={<Activity size={13} />}
          right={
            <select aria-label="Session" value={latest?.id ?? ''} onChange={(e) => setSel(e.target.value)} className="h-7 max-w-[220px] rounded-lg border border-line bg-input px-1 text-[11.5px]">
              {[...sessions]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 20)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          }
        >
          {!latest && <Empty>Aucune session.</Empty>}
          {latest && (
            <div className="space-y-2 text-[12px]" data-testid="orchestration-trace">
              <div className="text-muted">
                {latest.title} · agent {agents.find((a) => a.id === latest.agent)?.name ?? latest.agent} · {running[latest.id] ? (status[latest.id] ?? 'en cours…') : latest.verdict ?? 'terminée'} · {fmtCost(latest.cost)}
              </div>
              {stages && (
                <div className="flex flex-wrap items-center gap-1">
                  {[...stages.done, stages.current].map((st, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={cx('rounded-full border px-2 py-0.5 text-[11.5px]', i === arr.length - 1 && running[latest.id] ? 'border-accent bg-accent/15 font-semibold text-accent' : 'border-line bg-hover')}>
                        {i < arr.length - 1 ? '✓ ' : ''}
                        {st}
                      </span>
                      {i < arr.length - 1 && <span className="text-faint">→</span>}
                    </span>
                  ))}
                </div>
              )}
              {!stages && <div className="text-faint">Pas d’étapes de pipeline enregistrées pour cette session (chat simple).</div>}
              {subs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {subs.map((s) => s.kind === 'subagent' && (
                    <span key={s.id} className={cx('rounded-md px-1.5 py-0.5 text-[11.5px]', s.status === 'error' ? 'bg-err/15 text-err' : s.status === 'running' ? 'bg-accent/15 text-accent' : 'bg-hover')}>
                      <Bot size={11} className="mr-1 inline" />
                      {s.role} — {s.task.slice(0, 50)}
                    </span>
                  ))}
                </div>
              )}
              <ul className="space-y-0.5">
                {tools.map((t) => t.kind === 'tool' && (
                  <li key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-hover">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', t.status === 'ok' ? 'bg-ok' : t.status === 'error' || t.status === 'denied' ? 'bg-err' : 'bg-accent')} />
                    <span className="font-mono text-[11px] text-muted">{t.tool}</span>
                    <span className="min-w-0 flex-1 truncate">{t.label}</span>
                    {t.summary && <span className="max-w-[40%] truncate text-faint">{t.summary}</span>}
                  </li>
                ))}
                {!tools.length && <li className="text-faint">Aucun outil appelé.</li>}
              </ul>
              <button className="text-[11.5px] text-accent hover:underline" onClick={() => useStore.getState().selectSession(latest.id)}>
                Ouvrir la session
              </button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Calls, tokens, cost and latency — per day, model and agent — plus budgets and recent errors. */
export function Observability() {
  const usage = useStore((s) => s.usage);
  const spend = useStore((s) => s.spend);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const customAgents = useStore((s) => s.agents);
  const agents = allAgents(customAgents);
  const since = Date.now() - DAYS30;
  const recent = useMemo(() => usage.filter((u) => u.ts >= since), [usage, since]);
  const days = useMemo(() => dailySeries(usage, 14), [usage]);
  const byModel = useMemo(() => modelStats(usage, since).slice(0, 12), [usage, since]);
  const byAgent = useMemo(() => agentStats(usage, since).slice(0, 10), [usage, since]);
  const cost = recent.reduce((a, u) => a + u.cost, 0);
  const tokens = recent.reduce((a, u) => a + u.tokensIn + u.tokensOut, 0);
  const durations = recent.map((u) => u.durationMs);
  const fallbacks = recent.filter((u) => u.fallback).length;
  const month = today().slice(0, 7);
  const monthSpend = Object.entries(spend).filter(([d]) => d.startsWith(month)).reduce((a, [, v]) => a + v, 0);
  const daySpend = spend[today()] ?? 0;
  const errors = useMemo(
    () => sessions.flatMap((s) => s.items.filter((i) => i.kind === 'error' && !/Interrompu/.test(i.text)).map((i) => ({ s, text: (i as { text: string }).text }))).slice(-10).reverse(),
    [sessions],
  );
  const maxCost = Math.max(0.000001, ...days.map((d) => d.cost));
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1400px] space-y-3 p-4">
        <PageHeader
          title="Observabilité & coûts"
          subtitle="Surveillez l’exécution, analysez les performances et maîtrisez vos dépenses (30 derniers jours, mesuré)"
          right={
            <Button size="sm" variant="ghost" onClick={() => useStore.getState().setView('providers')}>
              Coûts par fournisseur
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="observability-kpis">
          <Kpi label="Appels (30 j)" value={String(recent.length)} sub={`${byModel.length} modèle(s)`} />
          <Kpi label="Tokens (30 j)" value={fmtTokens(tokens)} sub={`${fmtTokens(recent.reduce((a, u) => a + u.tokensOut, 0))} en sortie`} />
          <Kpi label="Coût (30 j)" value={fmtCost(cost)} sub={`${fmtCost(monthSpend)} ce mois`} />
          <Kpi label="Latence p50 / p95" value={recent.length ? `${fmtDuration(percentile(durations, 50))} / ${fmtDuration(percentile(durations, 95))}` : '—'} sub="par appel" />
          <Kpi label="Replis" value={recent.length ? `${Math.round((100 * fallbacks) / recent.length)} %` : '—'} sub={`${fallbacks} appel(s) sur un modèle de secours`} tone={recent.length && fallbacks / recent.length > 0.1 ? 'warn' : undefined} />
          <Kpi
            label="Budget du jour"
            value={fmtCost(daySpend)}
            sub={settings.budgetDaily ? <Gauge value={daySpend} max={settings.budgetDaily} className="mt-1" /> : 'pas de budget quotidien'}
            tone={settings.budgetDaily && daySpend >= settings.budgetDaily * 0.8 ? 'warn' : undefined}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Coût par jour (14 jours)" icon={<BarChart3 size={13} />} className="lg:col-span-2">
            <div className="flex h-36 items-end gap-1 px-1" data-testid="observability-days">
              {days.map((d) => (
                <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`${d.day} · ${d.calls} appel(s) · ${fmtCost(d.cost)} · ${fmtTokens(d.tokens)} tokens`}>
                  <span className="text-[10px] tabular-nums text-faint">{d.cost ? fmtCost(d.cost) : ''}</span>
                  <div className="w-full rounded-t-md bg-accent/70" style={{ height: `${Math.max(d.cost ? 3 : 1, Math.round((100 * d.cost) / maxCost))}%` }} />
                  <span className="text-[10px] text-faint">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Agents (30 jours)" icon={<Bot size={13} />}>
            {!byAgent.length && <Empty>Aucune utilisation enregistrée.</Empty>}
            {byAgent.map((a) => (
              <div key={a.agent} className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{agents.find((x) => x.id === a.agent)?.name ?? a.agent}</span>
                <span className="tabular-nums text-muted">{a.calls} appels</span>
                <span className="tabular-nums text-muted">{fmtDuration(a.p50)}</span>
                <span className="w-16 text-right tabular-nums">{fmtCost(a.cost)}</span>
              </div>
            ))}
          </Panel>
          <Panel title="Modèles (30 jours) — mesures" icon={<GaugeIcon size={13} />} className="lg:col-span-2">
            {!byModel.length && <Empty>Aucune utilisation enregistrée.</Empty>}
            {byModel.length > 0 && (
              <table className="w-full text-[12px]">
                <thead className="text-left text-faint">
                  <tr>
                    <th className="px-2 py-1">Modèle</th>
                    <th className="px-2 py-1 text-right">Appels</th>
                    <th className="px-2 py-1 text-right">Tokens</th>
                    <th className="px-2 py-1 text-right">Coût</th>
                    <th className="px-2 py-1 text-right">p50</th>
                    <th className="px-2 py-1 text-right">p95</th>
                    <th className="px-2 py-1 text-right">Fiabilité</th>
                    <th className="px-2 py-1 text-right">Dernier appel</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m) => (
                    <tr key={m.model} className="border-t border-line">
                      <td className="px-2 py-1 font-medium">{shortModel(m.model)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{m.calls}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtTokens(m.tokens)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtCost(m.cost)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtDuration(m.p50)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtDuration(m.p95)}</td>
                      <td className={cx('px-2 py-1 text-right tabular-nums', m.reliability < 0.9 && 'text-warn')}>{Math.round(m.reliability * 100)} %</td>
                      <td className="px-2 py-1 text-right text-faint">{fmtRelative(m.lastTs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Erreurs récentes" icon={<Activity size={13} />}>
            {!errors.length && <Empty>Aucune erreur récente.</Empty>}
            {errors.map((e, i) => (
              <button key={i} onClick={() => useStore.getState().selectSession(e.s.id)} className="flex w-full gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-hover">
                <span className="w-28 shrink-0 truncate text-faint">{e.s.title}</span>
                <span className="min-w-0 flex-1 truncate text-err">{e.text}</span>
              </button>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
