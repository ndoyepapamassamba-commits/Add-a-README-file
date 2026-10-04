import { useEffect, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListTodo, Square } from 'lucide-react';
import type { RunSummary } from '@shared/types';
import { api } from '../lib/api';
import { cx, fmtCost, fmtDuration, fmtRelative, fmtTokens, shortModel } from '../lib/format';
import { useApp } from '../store/app';
import { useActivity } from '../store/runtime';
import { Badge, Empty, IconButton, Input, Select } from '../components/ui';

type Row = RunSummary & { active: boolean };

const STATUS_TONE: Record<string, 'ok' | 'err' | 'warn' | 'info' | 'neutral'> = {
  completed: 'ok',
  failed: 'err',
  cancelled: 'neutral',
  running: 'info',
  waiting_approval: 'warn',
  waiting_plan: 'warn',
  queued: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  completed: 'terminée',
  failed: 'échec',
  cancelled: 'annulée',
  running: 'en cours',
  waiting_approval: 'autorisation',
  waiting_plan: 'plan à valider',
  queued: 'en attente',
};

/** Task manager: every agent run (incl. sub-agents) with model, tokens, cost, duration, files changed. */
export function TasksTable({ compact = false }: { compact?: boolean }) {
  const version = useActivity((s) => s.tasksVersion);
  const projects = useApp((s) => s.projects);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const scrollRef = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    void api<Row[]>('/api/runs', { query: { limit: 1000 } }).then(setRows).catch(() => undefined);
  }, [version]);
  useEffect(() => {
    if (!rows.some((r) => r.active)) return;
    const t = window.setInterval(() => void api<Row[]>('/api/runs', { query: { limit: 1000 } }).then(setRows), 3000);
    return () => window.clearInterval(t);
  }, [rows]);
  const filtered = useMemo(() => rows.filter((r) => (status === 'all' || r.status === status) && (!q || `${r.title} ${r.role} ${r.model}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, status]);
  const totals = useMemo(() => filtered.reduce((a, r) => ({ cost: a.cost + r.cost, tokens: a.tokens + r.tokensIn + r.tokensOut }), { cost: 0, tokens: 0 }), [filtered]);
  const virt = useVirtualizer({ count: filtered.length, getScrollElement: () => scrollRef[0], estimateSize: () => 36, overscan: 20 });

  const open = (r: Row) => {
    const app = useApp.getState();
    if (projects.some((p) => p.id === r.projectId) && app.projectId !== r.projectId) void app.selectProject(r.projectId).then(() => app.selectSession(r.sessionId));
    else app.selectSession(r.sessionId);
    app.setView('chat');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Input className="h-8 max-w-xs" placeholder="Filtrer les tâches…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tous les statuts' }, ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
          <span className="ml-auto text-[12.5px] text-muted">
            {filtered.length} tâches · {fmtTokens(totals.tokens)} tokens · {fmtCost(totals.cost)}
          </span>
        </div>
      )}
      <div className="grid shrink-0 grid-cols-[minmax(0,3fr)_120px_110px_minmax(0,1.4fr)_80px_80px_80px_60px_36px] gap-2 border-b border-line bg-hover/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        <span>Tâche</span>
        <span>Agent</span>
        <span>Statut</span>
        <span>Modèle</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Coût</span>
        <span className="text-right">Durée</span>
        <span className="text-right">Fich.</span>
        <span />
      </div>
      <div ref={(el) => scrollRef[1](el)} className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 && <Empty icon={<ListTodo size={28} />} title="Aucune tâche">Les tâches lancées dans le chat apparaissent ici.</Empty>}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const r = filtered[vi.index]!;
            return (
              <div
                key={r.id}
                onClick={() => open(r)}
                className="absolute left-0 right-0 grid cursor-pointer grid-cols-[minmax(0,3fr)_120px_110px_minmax(0,1.4fr)_80px_80px_80px_60px_36px] items-center gap-2 border-b border-line/60 px-3 text-[12.5px] hover:bg-hover/60"
                style={{ height: 36, transform: `translateY(${vi.start}px)` }}
              >
                <span className={cx('truncate', r.parentRunId && 'pl-4 text-muted')} title={r.title}>
                  {r.parentRunId ? '↳ ' : ''}
                  {r.title}
                  <span className="ml-2 text-[11px] text-faint">{fmtRelative(r.startedAt)}</span>
                </span>
                <span className="truncate">{r.role}</span>
                <span>
                  <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </span>
                <span className="truncate text-muted" title={r.model}>
                  {shortModel(r.model)}
                </span>
                <span className="text-right tabular-nums">{fmtTokens(r.tokensIn + r.tokensOut)}</span>
                <span className="text-right tabular-nums">{fmtCost(r.cost)}</span>
                <span className="text-right tabular-nums text-muted">{r.finishedAt ? fmtDuration(r.finishedAt - r.startedAt) : '…'}</span>
                <span className="text-right tabular-nums">{r.filesChanged || ''}</span>
                <span>
                  {r.active && (
                    <IconButton
                      label="Arrêter"
                      onClick={(e) => {
                        e.stopPropagation();
                        void api(`/api/runs/${r.id}/cancel`, { method: 'POST' });
                      }}
                    >
                      <Square size={12} />
                    </IconButton>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TasksView() {
  return <TasksTable />;
}
