import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Circle,
  CircleDot,
  CornerDownRight,
  FileDiff,
  ListChecks,
  Paperclip,
  Puzzle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import type { ChangeRecord, ChartData, PlanStep } from '@shared/types';
import { api } from '../../lib/api';
import { cx, fmtCost, fmtDuration, fmtTokens, shortModel, basename } from '../../lib/format';
import type { Item, RunView, ToolItem } from '../../lib/transcript';
import { isActiveStatus } from '../../lib/transcript';
import type { ArtifactRecord } from '../../lib/types';
import { useApp } from '../../store/app';
import { useCode } from '../../store/code';
import { useSession } from '../../store/session';
import { ChartView, CodeBlock, DiffView, Markdown } from '../rich';
import { ArtifactCard, AuthImage } from '../artifacts';
import { Badge, Button, Spinner, Textarea } from '../ui';
import { toolArgSummary, toolVerb } from './toolMeta';

const ROLE_LABEL: Record<string, string> = {
  general: 'Agent principal',
  coder: 'Codeur',
  researcher: 'Chercheur',
  browser: 'Navigateur',
  data_analyst: 'Analyste',
  reviewer: 'Relecteur',
  tester: 'Testeur',
};

// ── tool rows ──────────────────────────────────────────────────────────
function StatusDot({ status }: { status: ToolItem['status'] }) {
  return (
    <span
      className={cx(
        'mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full',
        status === 'running' && 'bg-faint wb-pulse',
        status === 'waiting' && 'bg-warn wb-pulse',
        status === 'ok' && 'bg-ok',
        status === 'error' && 'bg-err',
        status === 'denied' && 'bg-warn',
      )}
    />
  );
}

function ChangeDiff({ changeId }: { changeId: string }) {
  const [c, setC] = useState<ChangeRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<ChangeRecord>(`/api/changes/${changeId}`).then(setC, (e: Error) => setErr(e.message));
  }, [changeId]);
  if (err) return <div className="text-[12px] text-err">{err}</div>;
  if (!c) return <Spinner />;
  return <DiffView before={c.before ?? ''} after={c.after ?? ''} maxLines={160} />;
}

function ArtifactById({ id, kind }: { id: string; kind: 'chart' | 'artifact' }) {
  const [rec, setRec] = useState<ArtifactRecord | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  useEffect(() => {
    void api<ArtifactRecord>(`/api/artifacts/${id}`).then(setRec);
    if (kind === 'chart') void api<ChartData>(`/api/artifacts/${id}/raw`).then(setChart);
  }, [id, kind]);
  if (kind === 'chart')
    return chart ? (
      <div className="rounded-lg border border-line bg-panel p-3">
        <div className="mb-2 text-[13px] font-medium">{chart.spec.title}</div>
        <ChartView data={chart} />
      </div>
    ) : (
      <Spinner />
    );
  return rec ? <ArtifactCard artifact={rec} /> : <Spinner />;
}

function ToolDetails({ item }: { item: ToolItem }) {
  const data = (item.result?.data ?? {}) as Record<string, unknown>;
  const args = (item.args ?? {}) as Record<string, unknown>;
  if (item.tool === 'terminal.execute' || item.tool === 'code.run') {
    const out = [data.stdout, data.stderr].filter((x) => typeof x === 'string' && x).join('\n');
    return (
      <div className="space-y-1.5">
        <CodeBlock
          code={String(args.command ?? args.code ?? '')}
          lang={item.tool === 'code.run' ? String(args.language) : 'bash'}
        />
        {out ? (
          <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-code p-2.5 font-mono text-[12px] leading-[1.5] whitespace-pre-wrap">
            {out}
          </pre>
        ) : null}
      </div>
    );
  }
  if (item.tool === 'web.search' && Array.isArray(data.results)) {
    return (
      <ul className="space-y-1.5">
        {(data.results as { title: string; url: string; snippet: string }[]).map((r) => (
          <li key={r.url} className="text-[12.5px]">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              {r.title}
            </a>
            <div className="truncate text-faint">{r.url}</div>
          </li>
        ))}
      </ul>
    );
  }
  if (item.tool === 'data.inspect' && data.profile) {
    const p = data.profile as {
      rowCount: number;
      columnCount: number;
      anomalies: string[];
      columns: { name: string; type: string; missingPct: number }[];
    };
    return (
      <div className="text-[12.5px]">
        <div className="mb-1 text-muted">
          {p.rowCount} lignes × {p.columnCount} colonnes
        </div>
        <div className="flex flex-wrap gap-1">
          {p.columns.slice(0, 40).map((c) => (
            <Badge key={c.name}>
              {c.name} · {c.type}
              {c.missingPct > 0 ? ` · ${c.missingPct}% vides` : ''}
            </Badge>
          ))}
        </div>
        {p.anomalies.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-warn">
            {p.anomalies.slice(0, 10).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-code p-2.5 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap">
      {JSON.stringify(
        { args: item.args, ...(item.result?.data !== undefined ? { result: item.result.data } : {}) },
        null,
        2,
      )}
    </pre>
  );
}

const ToolRow = memo(function ToolRow({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const verb = toolVerb(item.tool);
  const arg = toolArgSummary(item.tool, item.args);
  const atts = item.result?.attachments ?? [];
  const diffs = atts.filter((a) => a.kind === 'diff');
  const inline = atts.filter((a) => a.kind !== 'diff');
  if (item.tool === 'plan.update') return null; // rendered as the checklist
  return (
    <div className="wb-in group">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 rounded-md py-[3px] text-left hover:bg-hover/50"
      >
        <StatusDot status={item.status} />
        <span className="min-w-0 flex-1 text-[13px] leading-[1.6]">
          <span className="font-semibold">{verb}</span>
          {arg && (
            <span className="ml-1.5 break-all font-mono text-[12px] text-muted">
              {arg.length > 160 ? `${arg.slice(0, 160)}…` : arg}
            </span>
          )}
          {item.result && (
            <span
              className={cx(
                'ml-2 text-[12px]',
                item.status === 'error' ? 'text-err' : item.status === 'denied' ? 'text-warn' : 'text-faint',
              )}
            >
              {item.result.summary}
              {item.durationMs !== undefined && item.durationMs > 900
                ? ` · ${fmtDuration(item.durationMs)}`
                : ''}
            </span>
          )}
          {item.status === 'waiting' && (
            <span className="ml-2 text-[12px] text-warn">en attente d'autorisation</span>
          )}
        </span>
        <ChevronRight
          size={14}
          className={cx(
            'mt-1 shrink-0 text-faint opacity-0 transition group-hover:opacity-100',
            open && 'rotate-90 opacity-100',
          )}
        />
      </button>
      {item.status === 'error' && item.result?.error && !open && (
        <div className="ml-4 border-l border-err/40 pl-3 font-mono text-[11.5px] text-err/90 whitespace-pre-wrap">
          {item.result.error.slice(0, 600)}
        </div>
      )}
      {diffs.map((d) =>
        d.kind === 'diff' ? (
          <DiffSummary
            key={d.changeId}
            changeId={d.changeId}
            path={d.path}
            added={d.added}
            removed={d.removed}
            defaultOpen={open}
          />
        ) : null,
      )}
      {inline.length > 0 && (
        <div className="ml-4 mt-1.5 space-y-2 border-l border-line pl-3">
          {inline.map((a) =>
            a.kind === 'image' ? (
              <AuthImage
                key={a.artifactId}
                path={`/api/artifacts/${a.artifactId}/raw`}
                alt={a.name}
                className="max-h-72 cursor-zoom-in rounded-lg border border-line"
              />
            ) : a.kind === 'chart' ? (
              <ArtifactById key={a.artifactId} id={a.artifactId} kind="chart" />
            ) : a.kind === 'artifact' ? (
              <ArtifactById key={a.artifactId} id={a.artifactId} kind="artifact" />
            ) : null,
          )}
        </div>
      )}
      {open && (
        <div className="mb-2 ml-4 mt-1 border-l border-line pl-3">
          <ToolDetails item={item} />
        </div>
      )}
    </div>
  );
});

function DiffSummary({
  changeId,
  path,
  added,
  removed,
  defaultOpen,
}: {
  changeId: string;
  path: string;
  added: number;
  removed: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || added + removed <= 30);
  const openFile = useCode((s) => s.open);
  const setView = useApp((s) => s.setView);
  return (
    <div className="ml-4 mt-1 border-l border-line pl-3">
      <div className="flex items-center gap-2 text-[12px]">
        <CornerDownRight size={12} className="text-faint" />
        <button
          className="font-mono text-muted hover:text-fg hover:underline"
          onClick={() => void openFile(path).then(() => setView('code'))}
        >
          {path}
        </button>
        <span className="text-ok">+{added}</span>
        <span className="text-err">−{removed}</span>
        <button className="text-faint hover:text-fg" onClick={() => setOpen((o) => !o)}>
          {open ? 'masquer' : 'voir le diff'}
        </button>
      </div>
      {open && (
        <div className="mt-1">
          <ChangeDiff changeId={changeId} />
        </div>
      )}
    </div>
  );
}

// ── approval / plan / checklist ────────────────────────────────────────
function ApprovalCard({ item }: { item: Extract<Item, { kind: 'approval' }> }) {
  const approve = useSession((s) => s.approve);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'choose' | 'deny'>('choose');
  const { request, resolved } = item;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!resolved) ref.current?.focus();
  }, [resolved]);
  if (resolved) {
    return (
      <div className="ml-4 flex items-center gap-2 text-[12px] text-faint">
        {resolved === 'approve' ? (
          <Check size={12} className="text-ok" />
        ) : (
          <X size={12} className="text-err" />
        )}
        {resolved === 'approve' ? 'Autorisé' : 'Refusé'} : {request.summary}
      </div>
    );
  }
  const preview = request.preview;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
        if (e.key === '1') void approve(request.approvalId, 'approve');
        if (e.key === '2') void approve(request.approvalId, 'approve', { remember: true });
        if (e.key === '3') setMode('deny');
      }}
      className="wb-in my-2 rounded-xl border border-warn/50 bg-warn/5 p-3 outline-none"
    >
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <ShieldAlert size={15} className="text-warn" />
        {item.agentPath ? `${item.agentPath} demande` : "L'agent demande"} l'autorisation :{' '}
        <span className="font-mono text-[12.5px] font-normal">{request.summary}</span>
      </div>
      {preview?.kind === 'diff' && (
        <div className="mb-2">
          <div className="mb-1 font-mono text-[12px] text-muted">{preview.path}</div>
          <DiffView before={preview.before} after={preview.after} maxLines={200} />
        </div>
      )}
      {preview?.kind === 'command' && (
        <div className="mb-2">
          <CodeBlock code={preview.command} lang="bash" />
          <div className="text-[12px] text-muted">Niveau de risque : {preview.risk}</div>
        </div>
      )}
      {preview?.kind === 'text' && <div className="mb-2 whitespace-pre-wrap text-[13px]">{preview.text}</div>}
      {!preview && <div className="mb-2 text-[12px] text-muted">{request.reason}</div>}
      {mode === 'choose' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => void approve(request.approvalId, 'approve')}>
            <span className="opacity-60">1</span> Oui
          </Button>
          <Button
            size="sm"
            onClick={() => void approve(request.approvalId, 'approve', { remember: true })}
            title="Ne plus demander pour ce type d'action pendant cette session (sauf actions dangereuses)"
          >
            <span className="opacity-60">2</span> Oui, toujours pour cette session
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('deny')}>
            <span className="opacity-60">3</span> Non, et dire quoi faire
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={2}
            placeholder="Que doit faire l'agent à la place ? (optionnel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => void approve(request.approvalId, 'deny', { note: note || undefined })}
            >
              Refuser
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('choose')}>
              Retour
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ item, runId }: { item: Extract<Item, { kind: 'plan' }>; runId: string }) {
  const resolvePlan = useSession((s) => s.resolvePlan);
  const [steps, setSteps] = useState(item.steps.map((s) => s.title));
  const [editing, setEditing] = useState(false);
  return (
    <div
      className={cx(
        'wb-in my-2 rounded-xl border p-3',
        item.resolved ? 'border-line bg-panel/50' : 'border-accent/50 bg-accent-soft',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
        <ListChecks size={15} className="text-accent" /> Plan proposé
        {item.resolved && (
          <Badge tone={item.resolved === 'approve' ? 'ok' : 'neutral'}>
            {item.resolved === 'approve' ? 'approuvé' : 'annulé'}
          </Badge>
        )}
      </div>
      {item.summary && <Markdown text={item.summary} className="mb-2 text-[13px] text-muted" />}
      {editing ? (
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-[12px] text-faint">{i + 1}.</span>
              <input
                value={s}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-7 flex-1 rounded-md border border-line bg-input px-2 text-[13px]"
              />
              <button
                className="text-faint hover:text-err"
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                aria-label="Supprimer l'étape"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSteps([...steps, ''])}>
            + Ajouter une étape
          </Button>
        </div>
      ) : (
        <ol className="list-decimal space-y-0.5 pl-6 text-[13px]">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {!item.resolved && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void resolvePlan(
                runId,
                'approve',
                steps.filter((s) => s.trim()),
              )
            }
          >
            <Check size={14} /> Approuver et exécuter
          </Button>
          <Button size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Terminer la modification' : 'Modifier le plan'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void resolvePlan(runId, 'cancel')}>
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}

export function Checklist({ steps, compact }: { steps: PlanStep[]; compact?: boolean }) {
  return (
    <div className={cx('wb-in', !compact && 'my-1.5 ml-1')}>
      {!compact && (
        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] text-faint">
          <ListChecks size={13} /> Tâches · {steps.filter((s) => s.status === 'done').length}/{steps.length}
        </div>
      )}
      <ul className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-[13px]">
            {s.status === 'done' ? (
              <Check size={14} className="mt-[3px] shrink-0 text-ok" />
            ) : s.status === 'in_progress' ? (
              <CircleDot size={14} className="mt-[3px] shrink-0 text-accent wb-pulse" />
            ) : (
              <Circle size={14} className="mt-[3px] shrink-0 text-faint" />
            )}
            <span
              className={cx(
                s.status === 'done' && 'text-faint line-through',
                s.status === 'in_progress' && 'font-medium',
                s.status === 'skipped' && 'text-faint',
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubagentBlock({ item }: { item: Extract<Item, { kind: 'subagent' }> }) {
  const [open, setOpen] = useState(item.summary === undefined);
  return (
    <div className="my-1.5 rounded-xl border border-line bg-panel/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"
      >
        <Bot size={15} className="text-info" />
        <span className="font-semibold">Sous-agent · {ROLE_LABEL[item.role] ?? item.role}</span>
        <span className="min-w-0 flex-1 truncate text-muted">{item.task}</span>
        {item.summary === undefined ? (
          <Spinner />
        ) : (
          <Badge tone={item.ok ? 'ok' : 'err'}>{item.ok ? 'terminé' : 'échec'}</Badge>
        )}
        <ChevronRight size={14} className={cx('text-faint transition', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <Items items={item.children} runId="" />
          {item.summary && (
            <Markdown text={item.summary} className="mt-2 border-t border-line pt-2 text-[13px]" />
          )}
        </div>
      )}
    </div>
  );
}

// ── items ──────────────────────────────────────────────────────────────
const UserBubble = memo(function UserBubble({ text, attachments }: { text: string; attachments: string[] }) {
  return (
    <div className="wb-in mb-3 mt-6 flex justify-end first:mt-0">
      <div className="max-w-[85%] rounded-2xl bg-hover px-4 py-2.5 text-[14px]">
        <div className="whitespace-pre-wrap break-words">{text}</div>
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {attachments.map((a) => (
              <Badge key={a}>
                <Paperclip size={11} /> {basename(a)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function Items({ items, runId }: { items: Item[]; runId: string }) {
  return (
    <>
      {items.map((it) => {
        switch (it.kind) {
          case 'user':
            return <UserBubble key={it.id} text={it.text} attachments={it.attachments} />;
          case 'text':
            return (
              <div
                key={it.id}
                className={cx('my-2 text-[14px] leading-[1.65]', it.agentPath && 'text-[13px] text-muted')}
              >
                <Markdown text={it.text} className={it.streaming ? 'wb-caret' : undefined} />
              </div>
            );
          case 'tool':
            return <ToolRow key={it.id} item={it} />;
          case 'approval':
            return <ApprovalCard key={it.id} item={it} />;
          case 'plan':
            return <PlanCard key={it.id} item={it} runId={runId} />;
          case 'checklist':
            return <Checklist key={it.id} steps={it.steps} />;
          case 'subagent':
            return <SubagentBlock key={it.id} item={it} />;
          case 'model':
            return null;
          case 'skills':
            return (
              <div key={it.id} className="my-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                <Puzzle size={12} className="text-accent" /> Skills actifs :
                {it.skills.map((s) => (
                  <Badge key={s.name} tone="accent">
                    {s.name}
                    <span className="opacity-70">
                      {' '}
                      ·{' '}
                      {(
                        {
                          auto: 'auto',
                          manual: 'choisi',
                          pinned: 'épinglé',
                          agent: 'agent',
                          model: 'chargé par le modèle',
                        } as Record<string, string>
                      )[s.reason] ?? s.reason}
                      {s.matched?.length ? ` (${s.matched.join(', ')})` : ''}
                    </span>
                  </Badge>
                ))}
              </div>
            );
          case 'fallback':
            return (
              <div key={it.id} className="my-1 flex items-center gap-1.5 text-[12px] text-warn">
                <RotateCcw size={12} /> Repli de {shortModel(it.from)} vers {shortModel(it.to)} —{' '}
                {it.reason.slice(0, 140)}
              </div>
            );
          case 'notice':
            return (
              <div key={it.id} className="my-1 text-center text-[11.5px] text-faint">
                — {it.text} —
              </div>
            );
          case 'error':
            return (
              <div
                key={it.id}
                className="wb-in my-2 flex items-start gap-2 rounded-lg border border-err/40 bg-err/8 px-3 py-2 text-[13px] text-err"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{it.message}</span>
              </div>
            );
        }
      })}
    </>
  );
}

const SPIN = ['✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳'];
function Thinking({ view }: { view: RunView }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 120);
    return () => window.clearInterval(t);
  }, []);
  const elapsed = Math.floor((Date.now() - view.run.startedAt) / 1000);
  const label =
    view.status === 'waiting_approval'
      ? 'En attente de votre autorisation'
      : view.status === 'waiting_plan'
        ? 'En attente de validation du plan'
        : (view.statusText ?? (view.thinking ? 'Réflexion' : 'Travail en cours'));
  return (
    <div className="my-2 flex items-center gap-2 text-[13px]">
      <span className="w-4 text-center text-accent">{SPIN[tick % SPIN.length]}</span>
      <span className="font-medium text-accent">{label}…</span>
      <span className="text-faint">
        ({elapsed} s · ↑ {fmtTokens(view.usage.promptTokens)} · ↓ {fmtTokens(view.usage.completionTokens)} ·{' '}
        {fmtCost(view.usage.cost)}) · <kbd className="font-mono">Échap</kbd> pour interrompre
      </span>
    </div>
  );
}

function RunFooter({ view }: { view: RunView }) {
  const send = useSession((s) => s.send);
  const model = view.items.find((i) => i.kind === 'model') as Extract<Item, { kind: 'model' }> | undefined;
  const failed = view.status === 'failed';
  return (
    <div className="mb-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
      <span className="flex items-center gap-1" title={model?.reason}>
        <Sparkles size={11} /> {shortModel(view.model)}
        {model?.auto && <span className="text-accent">auto</span>}
        {model?.effort && <span>· effort {model.effort}</span>}
      </span>
      <span>{fmtDuration(view.durationMs)}</span>
      <span>
        {fmtTokens(view.usage.promptTokens + view.usage.completionTokens)} tokens · {fmtCost(view.usage.cost)}
      </span>
      {view.status === 'cancelled' && <Badge>interrompu</Badge>}
      {failed && <Badge tone="err">échec</Badge>}
      {(failed || view.status === 'cancelled') && (
        <button
          className="flex items-center gap-1 text-muted hover:text-fg"
          onClick={() => {
            const user = view.items.find((i) => i.kind === 'user') as
              Extract<Item, { kind: 'user' }> | undefined;
            void send({
              text: failed
                ? 'Continue la tâche précédente là où tu t’es arrêté.'
                : (user?.text ?? 'Continue.'),
            });
          }}
        >
          <Undo2 size={11} /> {failed ? 'Continuer' : 'Relancer'}
        </button>
      )}
    </div>
  );
}

const RunBlock = memo(function RunBlock({ view }: { view: RunView }) {
  const active = isActiveStatus(view.status);
  return (
    <div>
      {view.run.role === 'reviewer' && (
        <div className="mb-1 mt-6 flex items-center gap-1.5 text-[12px] font-semibold text-info">
          <FileDiff size={13} /> Revue par un second agent
        </div>
      )}
      <Items items={view.items} runId={view.run.id} />
      {active ? <Thinking view={view} /> : <RunFooter view={view} />}
    </div>
  );
});

export function Transcript({ className }: { className?: string }) {
  const order = useSession((s) => s.order);
  const runs = useSession((s) => s.runs);
  const loading = useSession((s) => s.loading);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = order.length ? runs[order[order.length - 1]!] : undefined;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    stick.current = true;
  }, [order.length]);

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  return (
    <div
      ref={scroller}
      className={cx('min-h-0 flex-1 overflow-y-auto', className)}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="mx-auto w-full max-w-[860px] px-5 pb-6 pt-5">
        {order.map((id) => (runs[id] ? <RunBlock key={id} view={runs[id]} /> : null))}
        {last &&
          !isActiveStatus(last.status) &&
          last.status === 'completed' &&
          last.run.filesChanged > 0 &&
          null}
      </div>
    </div>
  );
}
