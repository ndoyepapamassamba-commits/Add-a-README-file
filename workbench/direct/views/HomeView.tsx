// MISSION CONTROL — the personal command center: start missions, see what the
// AI is doing (missions, agents, models, costs, tools, files, tests, errors).
import { IntelligencePanel } from './IntelligencePanels';
import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  FileText,
  Paperclip,
  Play,
  Rocket,
  Square,
  Wallet,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react';
import { Button, Chip, Gauge } from '../../web/components/ui';
import { VerdictBadge } from '../../web/components/mission';
import { cx, fmtBytes, fmtCost, fmtDuration, fmtRelative, fmtTokens, shortModel } from '../../web/lib/format';
import { MISSION_TEMPLATES } from '../../server/agent/mission';
import { runAgent, stopAgent } from '../lib/agent';
import { refreshCredits } from '../lib/credits';
import { allAgents } from '../lib/roles';
import { today, useStore } from '../lib/store';
import type { Attachment } from '../lib/types';
import { importBrowserFile } from '../lib/vfs';
import { allWorkflows, runWorkflow } from '../lib/workflows';

function Panel({
  title,
  icon,
  right,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('flex min-h-0 flex-col rounded-xl border border-line bg-panel', className)}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
        {icon} {title}
        <span className="ml-auto normal-case tracking-normal">{right}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: 'err' | 'warn' | 'ok';
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div
        className={cx(
          'text-[18px] font-semibold tabular-nums',
          tone === 'err' && 'text-err',
          tone === 'warn' && 'text-warn',
          tone === 'ok' && 'text-ok',
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="p-3 text-center text-[12px] text-faint">{children}</div>
);

export function HomeView() {
  const sessions = useStore((s) => s.sessions);
  const running = useStore((s) => s.running);
  const status = useStore((s) => s.status);
  const usage = useStore((s) => s.usage);
  const spend = useStore((s) => s.spend);
  const settings = useStore((s) => s.settings);
  const credits = useStore((s) => s.credits);
  const files = useStore((s) => s.files);
  const workflows = useStore((s) => s.workflows);
  const customAgents = useStore((s) => s.agents);
  const [goal, setGoal] = useState('');
  const [agent, setAgent] = useState('omnipotent');
  const [perm, setPerm] = useState<'auto' | 'normal'>('auto');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const month = today().slice(0, 7);
  const monthSpend = Object.entries(spend)
    .filter(([d]) => d.startsWith(month))
    .reduce((a, [, v]) => a + v, 0);
  const daySpend = spend[today()] ?? 0;
  const since = Date.now() - 30 * 86400_000;
  const recentUsage = useMemo(() => usage.filter((u) => u.ts >= since), [usage, since]);
  const todayUsage = useMemo(
    () => usage.filter((u) => new Date(u.ts).toISOString().slice(0, 10) === today()),
    [usage],
  );

  const byModel = useMemo(() => {
    const m = new Map<
      string,
      { calls: number; cost: number; tokens: number; ms: number; fallbacks: number }
    >();
    for (const u of recentUsage) {
      const r = m.get(u.model) ?? { calls: 0, cost: 0, tokens: 0, ms: 0, fallbacks: 0 };
      r.calls++;
      r.cost += u.cost;
      r.tokens += u.tokensIn + u.tokensOut;
      r.ms += u.durationMs;
      if (u.fallback) r.fallbacks++;
      m.set(u.model, r);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [recentUsage]);
  const toolCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of recentUsage) for (const t of u.tools ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [recentUsage]);
  const agentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of recentUsage) m.set(u.agent, (m.get(u.agent) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [recentUsage]);

  const active = sessions.filter((s) => running[s.id]);
  const recent = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const failed = sessions
    .filter((s) => s.verdict === 'FAILED' || s.verdict === 'PARTIAL' || s.verdict === 'ERROR')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);
  const errors = useMemo(
    () =>
      sessions
        .flatMap((s) =>
          s.items
            .filter((i) => i.kind === 'error' && !/Interrompu/.test(i.text))
            .map((i) => ({ s, text: (i as { text: string }).text })),
        )
        .slice(-8)
        .reverse(),
    [sessions],
  );
  const missions = sessions.filter((s) => s.lastMode === 'mission');
  const passRate = missions.length
    ? Math.round((missions.filter((s) => s.verdict === 'PASSED').length / missions.length) * 100)
    : null;
  const fileList = Object.values(files);
  const testsDoc = files['.ai/TESTS.md']?.data ?? '';
  const lastTests = testsDoc.split('\n## ').slice(-1)[0]?.split('\n').slice(0, 8).join('\n') ?? '';
  const agents = allAgents(customAgents);
  const wfs = allWorkflows(workflows);

  const launch = (mode: 'mission' | 'chat') => {
    const text = goal.trim();
    if (!text) return;
    const st = useStore.getState();
    const s = st.newSession();
    st.patchSession(s.id, { agent, mode: mode === 'mission' ? perm : 'normal' });
    setGoal('');
    const att = attachments;
    setAttachments([]);
    void runAgent(s.id, text, att, { mode }).then(refreshCredits);
  };

  const open = (id: string) => useStore.getState().selectSession(id);
  const lastStage = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    const p = s?.items.findLast?.((i) => i.kind === 'pipeline');
    return p && p.kind === 'pipeline' ? p.current : null;
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1400px] space-y-3 p-4">
        {/* NEW MISSION */}
        <div className="rounded-2xl border border-line bg-elev p-3">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <Rocket size={15} className="text-accent" /> Nouvelle mission
            <span className="font-normal text-faint">
              — l’IA analyse, planifie, exécute, teste, corrige et livre un résultat vérifié
            </span>
          </div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) launch('mission');
            }}
            rows={3}
            placeholder="Construis cette application… · Analyse ce fichier… · Répare ce projet… · Recherche… · Prépare le rapport…   (Ctrl+Entrée pour lancer)"
            className="block w-full resize-none rounded-xl border border-line bg-input px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span
                  key={a.path}
                  className="inline-flex items-center gap-1 rounded-lg bg-hover px-2 py-0.5 text-[12px]"
                >
                  <FileText size={12} /> {a.name}
                  <button
                    aria-label={`Retirer ${a.name}`}
                    onClick={() => setAttachments(attachments.filter((x) => x.path !== a.path))}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={async (e) => {
                const list = Array.from(e.target.files ?? []);
                e.target.value = '';
                const added: Attachment[] = [];
                for (const f of list) {
                  const v = await importBrowserFile(f);
                  added.push({ path: v.path, name: f.name, mime: v.mime, size: v.size });
                }
                setAttachments((x) => [...x, ...added]);
              }}
            />
            <Chip onClick={() => input.current?.click()} title="Joindre des fichiers">
              <Paperclip size={13} /> Fichiers
            </Chip>
            {MISSION_TEMPLATES.map((t) => (
              <Chip
                key={t.id}
                onClick={() => {
                  setGoal(t.prompt);
                  if (t.agent) setAgent(t.agent);
                }}
              >
                {t.label}
              </Chip>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <select
                aria-label="Agent"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="h-8 rounded-lg border border-line bg-input px-2 text-[12.5px]"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Permissions de la mission"
                title="Autonome : l’IA agit sans demander (les suppressions restent confirmées). Normal : elle demande avant d’écrire ou d’exécuter."
                value={perm}
                onChange={(e) => setPerm(e.target.value as 'auto' | 'normal')}
                className="h-8 rounded-lg border border-line bg-input px-2 text-[12.5px]"
              >
                <option value="auto">Autonome</option>
                <option value="normal">Avec validations</option>
              </select>
              <Button size="sm" variant="ghost" disabled={!goal.trim()} onClick={() => launch('chat')}>
                Discuter
              </Button>
              <Button size="sm" variant="primary" disabled={!goal.trim()} onClick={() => launch('mission')}>
                <Rocket size={13} /> Lancer la mission
              </Button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Missions actives"
            value={String(active.length)}
            sub={`${Object.keys(running).length} session(s) en cours`}
            tone={active.length ? 'ok' : undefined}
          />
          <Kpi
            label="Coût aujourd’hui"
            value={fmtCost(daySpend)}
            sub={
              settings.budgetDaily ? (
                <Gauge value={daySpend} max={settings.budgetDaily} className="mt-1" />
              ) : (
                'pas de budget'
              )
            }
            tone={settings.budgetDaily && daySpend >= settings.budgetDaily * 0.8 ? 'warn' : undefined}
          />
          <Kpi
            label="Coût du mois"
            value={fmtCost(monthSpend)}
            sub={`${fmtTokens(todayUsage.reduce((a, u) => a + u.tokensIn + u.tokensOut, 0))} tokens aujourd’hui`}
          />
          <Kpi
            label="Crédits OpenRouter"
            value={
              (credits?.keyLimitRemaining ?? credits?.remaining ?? null)
                ? fmtCost((credits?.keyLimitRemaining ?? credits?.remaining) as number, 2)
                : '—'
            }
            sub="restants"
          />
          <Kpi
            label="Missions réussies"
            value={passRate === null ? '—' : `${passRate} %`}
            sub={`${missions.length} mission(s)`}
            tone={passRate !== null && passRate < 60 ? 'warn' : 'ok'}
          />
          <Kpi
            label="Tâches en échec"
            value={String(failed.length)}
            sub="FAILED / PARTIAL / erreurs"
            tone={failed.length ? 'err' : undefined}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Missions actives" icon={<Activity size={13} />} className="max-h-[300px]">
            {!active.length && <Empty>Aucune mission en cours.</Empty>}
            {active.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <button className="min-w-0 flex-1 text-left" onClick={() => open(s.id)}>
                  <div className="truncate text-[13px] font-medium">{s.title}</div>
                  <div className="truncate text-[11.5px] text-faint">
                    {lastStage(s.id) ? `étape : ${lastStage(s.id)} · ` : ''}
                    {status[s.id] ?? 'en cours…'} · {agents.find((a) => a.id === s.agent)?.name}
                  </div>
                </button>
                <Button size="sm" variant="ghost" onClick={() => stopAgent(s.id)} title="Arrêter">
                  <Square size={12} />
                </Button>
              </div>
            ))}
          </Panel>

          <Panel title="Sessions récentes" icon={<FileText size={13} />} className="max-h-[300px]">
            {!recent.length && <Empty>Aucune session.</Empty>}
            {recent.map((s) => (
              <button
                key={s.id}
                onClick={() => open(s.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
                {s.verdict && s.verdict !== 'ERROR' && <VerdictBadge status={s.verdict} />}
                {s.verdict === 'ERROR' && <span className="text-[11px] text-err">erreur</span>}
                <span className="shrink-0 text-[11px] text-faint">{fmtCost(s.cost)}</span>
                <span className="w-16 shrink-0 text-right text-[11px] text-faint">
                  {fmtRelative(s.updatedAt)}
                </span>
              </button>
            ))}
          </Panel>

          <Panel title="Tâches en échec" icon={<AlertTriangle size={13} />} className="max-h-[300px]">
            {!failed.length && <Empty>Rien à reprendre. 👍</Empty>}
            {failed.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <button className="min-w-0 flex-1 truncate text-left text-[13px]" onClick={() => open(s.id)}>
                  {s.title}
                </button>
                {s.verdict && s.verdict !== 'ERROR' ? (
                  <VerdictBadge status={s.verdict} />
                ) : (
                  <span className="text-[11px] text-err">erreur</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(running[s.id])}
                  onClick={() => {
                    open(s.id);
                    void runAgent(
                      s.id,
                      'Reprends la tâche : corrige ce qui a échoué ou reste incomplet, re-teste tout, puis livre avec un verdict.',
                      [],
                      { mode: 'mission' },
                    ).then(refreshCredits);
                  }}
                >
                  Reprendre
                </Button>
              </div>
            ))}
          </Panel>

          <Panel
            title="Workflows"
            icon={<WorkflowIcon size={13} />}
            right={
              <button
                className="text-[11.5px] text-accent hover:underline"
                onClick={() => useStore.getState().setView('workflows')}
              >
                Gérer
              </button>
            }
            className="max-h-[300px]"
          >
            {wfs.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{w.name}</div>
                  <div className="truncate text-[11.5px] text-faint">
                    {w.description || `${w.steps.length} étapes`}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => runWorkflow(w, attachments)}
                  title="Exécuter (avec les fichiers joints ci-dessus)"
                >
                  <Play size={12} /> Lancer
                </Button>
              </div>
            ))}
          </Panel>

          <Panel
            title="Modèles (30 jours)"
            icon={<Wallet size={13} />}
            className="max-h-[300px] lg:col-span-2"
          >
            {!byModel.length && <Empty>Aucune utilisation enregistrée.</Empty>}
            {byModel.length > 0 && (
              <table className="w-full text-[12px]">
                <thead className="text-left text-faint">
                  <tr>
                    <th className="px-2 py-1">Modèle</th>
                    <th className="px-2 py-1 text-right">Appels</th>
                    <th className="px-2 py-1 text-right">Tokens</th>
                    <th className="px-2 py-1 text-right">Coût</th>
                    <th className="px-2 py-1 text-right">Durée moy.</th>
                    <th className="px-2 py-1 text-right">Replis</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map(([m, r]) => (
                    <tr key={m} className="border-t border-line">
                      <td className="px-2 py-1 font-medium">{shortModel(m)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.calls}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtTokens(r.tokens)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtCost(r.cost)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtDuration(r.ms / r.calls)}</td>
                      <td className={cx('px-2 py-1 text-right tabular-nums', r.fallbacks > 0 && 'text-warn')}>
                        {r.fallbacks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Agents & outils (30 jours)" icon={<Bot size={13} />} className="max-h-[300px]">
            {!agentCounts.length && <Empty>—</Empty>}
            <div className="mb-2 flex flex-wrap gap-1">
              {agentCounts.map(([a, n]) => (
                <span key={a} className="rounded-md bg-hover px-1.5 py-0.5 text-[11.5px]">
                  {agents.find((x) => x.id === a)?.name ?? a} · {n}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {toolCounts.map(([t, n]) => (
                <span
                  key={t}
                  className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted"
                >
                  {t} · {n}
                </span>
              ))}
            </div>
          </Panel>

          <div className="max-h-[300px]">
            <IntelligencePanel />
          </div>

          <Panel title="Fichiers & tests" icon={<FileText size={13} />} className="max-h-[300px]">
            <div className="mb-2 text-[12px] text-muted">
              {fileList.length} fichier(s) · {fmtBytes(fileList.reduce((a, f) => a + f.size, 0))}
            </div>
            {[...fileList]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 5)
              .map((f) => (
                <button
                  key={f.path}
                  className="flex w-full items-center gap-2 truncate rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-hover"
                  onClick={() => useStore.setState({ view: 'files', openFile: f.path })}
                >
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>
                  <span className="text-faint">{fmtRelative(f.updatedAt)}</span>
                </button>
              ))}
            {lastTests && (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-code p-2 text-[11px] text-muted">
                ## {lastTests}
              </pre>
            )}
          </Panel>

          <Panel
            title="Erreurs récentes"
            icon={<AlertTriangle size={13} />}
            className="max-h-[300px] lg:col-span-2"
          >
            {!errors.length && <Empty>Aucune erreur récente.</Empty>}
            {errors.map((e, i) => (
              <button
                key={i}
                onClick={() => open(e.s.id)}
                className="flex w-full gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-hover"
              >
                <span className="w-40 shrink-0 truncate text-faint">{e.s.title}</span>
                <span className="min-w-0 flex-1 truncate text-err">{e.text}</span>
              </button>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
