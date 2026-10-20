import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  FileDiff,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ChangeRecord } from '@shared/types';
import { api, downloadFile } from '../../lib/api';
import { cx, fmtCost, fmtRelative, fmtTime, fmtTokens, shortModel } from '../../lib/format';
import { isActiveStatus } from '../../lib/transcript';
import { useApp } from '../../store/app';
import { useCode } from '../../store/code';
import { useActivity } from '../../store/runtime';
import { useSession } from '../../store/session';
import { Checklist, Transcript } from '../chat/Transcript';
import { Composer } from '../chat/Composer';
import { DiffView } from '../rich';
import { ArtifactCard } from '../artifacts';
import {
  Badge,
  Button,
  Dropdown,
  Empty,
  Gauge,
  IconButton,
  Modal,
  Spinner,
  Tabs,
  EditableTitle,
} from '../ui';
import { TerminalPane } from '../../views/TerminalView';
import { TasksTable } from '../../views/TasksView';

// ── left: sessions ─────────────────────────────────────────────────────
export function SessionList() {
  const [renaming, setRenaming] = useState<string | null>(null);
  const sessions = useApp((s) => s.sessions);
  const sessionId = useApp((s) => s.sessionId);
  const selectSession = useApp((s) => s.selectSession);
  const newSession = useApp((s) => s.newSession);
  const loadSessions = useApp((s) => s.loadSessions);
  const toast = useApp((s) => s.toast);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => sessions.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())),
    [sessions, q],
  );
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-2.5">
        <Button variant="secondary" className="w-full justify-start" onClick={() => void newSession()}>
          <Plus size={14} /> Nouvelle session
        </Button>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-input px-2">
          <Search size={13} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher"
            className="h-7 flex-1 bg-transparent text-[12.5px] outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {list.length === 0 && <div className="p-3 text-[12.5px] text-faint">Aucune session.</div>}
        {list.map((s) => (
          <div
            key={s.id}
            onClick={() => selectSession(s.id)}
            className={cx(
              'group mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 hover:bg-hover',
              s.id === sessionId && 'bg-hover',
            )}
          >
            <div className="flex items-center gap-1.5">
              {s.active && <Loader2 size={12} className="shrink-0 wb-spin text-accent" />}
              <EditableTitle
                value={s.title}
                className="text-[13px]"
                editing={renaming === s.id}
                onDone={() => setRenaming(null)}
                onSave={(title) =>
                  void api(`/api/sessions/${s.id}`, { method: 'PATCH', body: { title } })
                    .then(loadSessions)
                    .catch((err: Error) => toast('error', err.message))
                }
              />
              <button
                className="hidden text-faint hover:text-fg group-hover:block"
                aria-label="Renommer"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(s.id);
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                className="hidden text-faint hover:text-err group-hover:block"
                aria-label="Supprimer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Supprimer la session « ${s.title} » ?`))
                    void api(`/api/sessions/${s.id}`, { method: 'DELETE' })
                      .then(loadSessions)
                      .catch((err: Error) => toast('error', err.message));
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="mt-0.5 flex gap-2 text-[11px] text-faint">
              <span>{fmtRelative(s.updatedAt)}</span>
              <span>{shortModel(s.model)}</span>
              {s.cost > 0 && <span className="ml-auto tabular-nums">{fmtCost(s.cost)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── right panel ────────────────────────────────────────────────────────
function ChangesTab() {
  const changes = useSession((s) => s.changes);
  const sessionId = useSession((s) => s.sessionId);
  const refresh = useSession((s) => s.refreshSide);
  const toast = useApp((s) => s.toast);
  const showDiff = useCode((s) => s.showDiff);
  const setView = useApp((s) => s.setView);
  const [view, setViewChange] = useState<ChangeRecord | null>(null);
  const applied = changes.filter((c) => c.status === 'applied');
  const act = async (id: string, action: 'accept' | 'revert') => {
    try {
      await api(`/api/changes/${id}/${action}`, { method: 'POST' });
      await refresh();
      useCode.getState().bumpTree();
      const c = changes.find((x) => x.id === id);
      if (c && action === 'revert') void useCode.getState().reload(c.path);
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };
  const open = async (c: ChangeRecord) => setViewChange(await api<ChangeRecord>(`/api/changes/${c.id}`));
  if (!changes.length)
    return (
      <Empty icon={<FileDiff size={26} />} title="Aucune modification">
        Les fichiers modifiés par l'agent apparaissent ici : diff, accepter, annuler.
      </Empty>
    );
  return (
    <div className="p-2">
      {applied.length > 0 && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[12px] text-muted">{applied.length} à valider</span>
          <Button
            size="sm"
            onClick={() =>
              void api(`/api/sessions/${sessionId}/changes/accept-all`, { method: 'POST' }).then(refresh)
            }
          >
            <Check size={13} /> Tout accepter
          </Button>
        </div>
      )}
      {[...changes].reverse().map((c) => (
        <div
          key={c.id}
          className="group mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-hover"
        >
          <Badge tone={c.status === 'reverted' ? 'neutral' : c.status === 'accepted' ? 'ok' : 'warn'}>
            {c.op}
          </Badge>
          <button
            className={cx(
              'min-w-0 flex-1 truncate text-left font-mono',
              c.status === 'reverted' && 'line-through text-faint',
            )}
            onClick={() => void open(c)}
            title={c.path}
          >
            {c.path}
          </button>
          <span className="text-ok">+{c.added}</span>
          <span className="text-err">−{c.removed}</span>
          {c.status === 'applied' && (
            <IconButton label="Accepter" onClick={() => void act(c.id, 'accept')}>
              <Check size={13} />
            </IconButton>
          )}
          {c.status !== 'reverted' && (
            <IconButton label="Annuler (revert)" onClick={() => void act(c.id, 'revert')}>
              <Undo2 size={13} />
            </IconButton>
          )}
        </div>
      ))}
      <Modal
        open={Boolean(view)}
        onClose={() => setViewChange(null)}
        width={980}
        title={view ? `${view.op} · ${view.path}` : ''}
        footer={
          view && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  showDiff({
                    title: view.path,
                    path: view.path,
                    before: view.before ?? '',
                    after: view.after ?? '',
                  });
                  setView('code');
                  setViewChange(null);
                }}
              >
                Ouvrir côte à côte
              </Button>
              {view.status === 'applied' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void act(view.id, 'accept').then(() => setViewChange(null))}
                >
                  <Check size={13} /> Accepter
                </Button>
              )}
              {view.status !== 'reverted' && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void act(view.id, 'revert').then(() => setViewChange(null))}
                >
                  <Undo2 size={13} /> Annuler la modification
                </Button>
              )}
            </>
          )
        }
      >
        {view &&
          (view.op === 'move' ? (
            <div>
              Déplacé de {view.before} vers {view.after}
            </div>
          ) : (
            <DiffView before={view.before ?? ''} after={view.after ?? ''} maxLines={2000} />
          ))}
      </Modal>
    </div>
  );
}

function ArtifactsTab() {
  const artifacts = useSession((s) => s.artifacts);
  const showDiff = useCode((s) => s.showDiff);
  const setView = useApp((s) => s.setView);
  const [pick, setPick] = useState<string[]>([]);
  if (!artifacts.length)
    return (
      <Empty title="Aucun artefact">
        Rapports, exports, graphiques, captures et fichiers produits par l'agent apparaissent ici.
      </Empty>
    );
  const textual = artifacts.filter((a) =>
    ['html', 'css', 'js', 'json', 'csv', 'md', 'txt', 'py', 'ts', 'xml', 'yaml', 'svg'].includes(a.type),
  );
  return (
    <div className="space-y-1.5 p-2">
      {textual.length >= 2 && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-muted">Comparer :</span>
          <Dropdown
            trigger={<Badge>{pick[0] ? artifacts.find((a) => a.id === pick[0])?.name : 'A…'}</Badge>}
            items={textual.map((a) => ({ value: a.id, label: a.name }))}
            onSelect={(v) => setPick([v, pick[1] ?? ''])}
          />
          <Dropdown
            trigger={<Badge>{pick[1] ? artifacts.find((a) => a.id === pick[1])?.name : 'B…'}</Badge>}
            items={textual.map((a) => ({ value: a.id, label: a.name }))}
            onSelect={(v) => setPick([pick[0] ?? '', v])}
          />
          <Button
            size="sm"
            disabled={!pick[0] || !pick[1]}
            onClick={async () => {
              const [a, b] = await Promise.all(
                pick.map((id) => api<{ text: string }>(`/api/artifacts/${id}/text`)),
              );
              showDiff({
                title: 'Comparaison',
                path: 'compare',
                before: a?.text ?? '',
                after: b?.text ?? '',
              });
              setView('code');
            }}
          >
            Comparer
          </Button>
        </div>
      )}
      {artifacts.map((a) => (
        <ArtifactCard key={a.id} artifact={a} compact />
      ))}
    </div>
  );
}

function ContextTab() {
  const detail = useSession((s) => s.detail);
  const runs = useSession((s) => s.runs);
  const order = useSession((s) => s.order);
  const status = useApp((s) => s.status);
  const projectId = useApp((s) => s.projectId);
  const [facts, setFacts] = useState<{ id: string; category: string; text: string }[]>([]);
  const last = [...order]
    .reverse()
    .map((id) => runs[id])
    .find((r) => r && r.contextLimit > 0);
  useEffect(() => {
    if (projectId)
      void api<{ facts: { id: string; category: string; text: string }[] }>(
        `/api/projects/${projectId}/memory`,
      )
        .then((r) => setFacts(r.facts))
        .catch(() => undefined);
  }, [projectId, order.length]);
  const skills = [...new Set(order.flatMap((id) => runs[id]?.skills ?? []))];
  return (
    <div className="space-y-4 p-3 text-[12.5px]">
      <div>
        <div className="mb-1 flex justify-between text-muted">
          <span>Fenêtre de contexte</span>
          <span className="tabular-nums">
            {last ? `${fmtTokens(last.contextTokens)} / ${fmtTokens(last.contextLimit)}` : '—'}
          </span>
        </div>
        <Gauge value={last?.contextTokens ?? 0} max={last?.contextLimit || 1} />
        <div className="mt-1 text-[11px] text-faint">
          Compactage automatique au-delà de 70 % (ou /compact).
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-line p-2">
          <div className="text-[11px] text-faint">Tokens session</div>
          <div className="font-semibold tabular-nums">
            {fmtTokens((detail?.session.tokensIn ?? 0) + (detail?.session.tokensOut ?? 0))}
          </div>
        </div>
        <div className="rounded-lg border border-line p-2">
          <div className="text-[11px] text-faint">Coût session</div>
          <div className="font-semibold tabular-nums">{fmtCost(detail?.session.cost ?? 0)}</div>
        </div>
      </div>
      <div>
        <div className="mb-1 font-semibold">Skills utilisés</div>
        {skills.length ? (
          <div className="flex flex-wrap gap-1">
            {skills.map((s) => (
              <Badge key={s} tone="accent">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="text-faint">—</div>
        )}
      </div>
      <div>
        <div className="mb-1 font-semibold">Plugins connectés</div>
        {status?.plugins?.filter((p) => p.status === 'connected').length ? (
          <div className="flex flex-wrap gap-1">
            {status.plugins
              .filter((p) => p.status === 'connected')
              .map((p) => (
                <Badge key={p.name} tone="info">
                  {p.name} · {p.tools}
                </Badge>
              ))}
          </div>
        ) : (
          <div className="text-faint">Aucun (vue Plugins)</div>
        )}
      </div>
      <div>
        <div className="mb-1 font-semibold">Mémoire du projet</div>
        {facts.length === 0 && <div className="text-faint">Vide — essayez /init.</div>}
        <ul className="space-y-1">
          {facts.slice(-15).map((f) => (
            <li key={f.id} className="text-muted">
              <span className="text-faint">[{f.category}]</span> {f.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ActivityTab() {
  const rows = useActivity((s) => s.rows);
  const load = useActivity((s) => s.load);
  useEffect(() => void load(), [load]);
  return (
    <div className="font-mono text-[11.5px]">
      {rows.length === 0 && (
        <div className="p-3 font-sans text-[12.5px] text-faint">
          L'activité des agents (outils, durée, statut) s'affiche ici en direct.
        </div>
      )}
      {rows.slice(0, 300).map((r) => (
        <div key={r.id} className="flex items-center gap-2 border-b border-line/50 px-2.5 py-1">
          <span className="w-16 shrink-0 text-faint">{fmtTime(r.ts)}</span>
          <span
            className={cx(
              'w-1.5 h-1.5 shrink-0 rounded-full',
              r.status === 'success'
                ? 'bg-ok'
                : r.status === 'running'
                  ? 'bg-info'
                  : r.status === 'denied'
                    ? 'bg-warn'
                    : 'bg-err',
            )}
          />
          <span className="w-40 shrink-0 truncate text-accent">{r.tool}</span>
          <span className="min-w-0 flex-1 truncate text-muted" title={r.summary}>
            {r.summary}
          </span>
          <span className="shrink-0 text-faint">{r.durationMs !== null ? `${r.durationMs}ms` : ''}</span>
        </div>
      ))}
    </div>
  );
}

export function RightPanel() {
  const layout = useApp((s) => s.layout);
  const setLayout = useApp((s) => s.setLayout);
  const view = useApp((s) => s.view);
  const changes = useSession((s) => s.changes);
  const artifacts = useSession((s) => s.artifacts);
  const runs = useSession((s) => s.runs);
  const order = useSession((s) => s.order);
  const plan =
    [...order]
      .reverse()
      .map((id) => runs[id])
      .find((r) => r && r.plan.length)?.plan ?? [];
  const pending = changes.filter((c) => c.status === 'applied').length;
  const tabs = [
    ...(view !== 'chat' ? [{ id: 'agent' as const, label: 'Agent' }] : []),
    {
      id: 'plan' as const,
      label: 'Plan',
      badge: plan.length ? (
        <Badge>
          {plan.filter((p) => p.status === 'done').length}/{plan.length}
        </Badge>
      ) : undefined,
    },
    {
      id: 'changes' as const,
      label: 'Modifs',
      badge: pending ? <Badge tone="warn">{pending}</Badge> : undefined,
    },
    {
      id: 'artifacts' as const,
      label: 'Artefacts',
      badge: artifacts.length ? <Badge>{artifacts.length}</Badge> : undefined,
    },
    { id: 'context' as const, label: 'Contexte' },
    { id: 'activity' as const, label: 'Activité' },
  ];
  const tab = layout.rightTab === 'agent' && view === 'chat' ? 'plan' : layout.rightTab;
  return (
    <div className="flex h-full min-h-0 flex-col bg-elev">
      <Tabs value={tab} onChange={(rightTab) => setLayout({ rightTab })} tabs={tabs} />
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'agent' && (
          <div className="flex h-full flex-col">
            <Transcript className="text-[13px]" />
            <Composer compact autoFocus={false} />
          </div>
        )}
        {tab === 'plan' &&
          (plan.length ? (
            <div className="p-3">
              <Checklist steps={plan} compact />
            </div>
          ) : (
            <Empty title="Pas de plan en cours">
              Pour les tâches de plusieurs étapes, l'agent tient ici sa liste de tâches. Activez « Plan » pour
              valider le plan avant exécution.
            </Empty>
          ))}
        {tab === 'changes' && <ChangesTab />}
        {tab === 'artifacts' && <ArtifactsTab />}
        {tab === 'context' && <ContextTab />}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </div>
  );
}

// ── bottom panel ───────────────────────────────────────────────────────
function ProblemsTab() {
  const problems = useCode((s) => s.problems);
  const open = useCode((s) => s.open);
  const setDraft = useApp((s) => s.setDraft);
  const setLayout = useApp((s) => s.setLayout);
  if (!problems.length)
    return (
      <div className="p-3 text-[12.5px] text-faint">Aucun problème détecté dans les fichiers ouverts.</div>
    );
  return (
    <div className="text-[12.5px]">
      {problems.flatMap((p) =>
        p.items.slice(0, 50).map((it, i) => (
          <div key={`${p.path}-${i}`} className="flex items-center gap-2 border-b border-line/50 px-3 py-1">
            <Badge tone={it.severity >= 8 ? 'err' : 'warn'}>{it.severity >= 8 ? 'erreur' : 'alerte'}</Badge>
            <button className="font-mono text-muted hover:underline" onClick={() => void open(p.path)}>
              {p.path}:{it.line}
            </button>
            <span className="min-w-0 flex-1 truncate">{it.message}</span>
            <button
              className="text-[11.5px] text-accent hover:underline"
              onClick={() => {
                setLayout({ right: true, rightTab: 'agent' });
                setDraft({
                  text: `Corrige cette erreur dans ${p.path} ligne ${it.line} : ${it.message}`,
                  attachments: [p.path],
                  send: true,
                  role: 'coder',
                });
              }}
            >
              <MessageSquarePlus size={12} className="inline" /> corriger
            </button>
          </div>
        )),
      )}
    </div>
  );
}

export function BottomPanel() {
  const layout = useApp((s) => s.layout);
  const setLayout = useApp((s) => s.setLayout);
  const problems = useCode((s) => s.problems.reduce((a, p) => a + p.errors + p.warnings, 0));
  return (
    <div className="flex h-full min-h-0 flex-col bg-elev">
      <Tabs
        value={layout.bottomTab}
        onChange={(bottomTab) => setLayout({ bottomTab })}
        tabs={[
          { id: 'terminal', label: 'Terminal' },
          { id: 'activity', label: 'Activité agent' },
          { id: 'tasks', label: 'Tâches' },
          {
            id: 'problems',
            label: 'Problèmes',
            badge: problems ? <Badge tone="warn">{problems}</Badge> : undefined,
          },
        ]}
        right={
          <IconButton label="Fermer le panneau (Ctrl+J)" onClick={() => setLayout({ bottom: false })}>
            ×
          </IconButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {layout.bottomTab === 'terminal' && <TerminalPane compact />}
        {layout.bottomTab === 'activity' && <ActivityTab />}
        {layout.bottomTab === 'tasks' && <TasksTable compact />}
        {layout.bottomTab === 'problems' && <ProblemsTab />}
      </div>
    </div>
  );
}

// ── export helper (used by /export and the palette) ────────────────────
export async function exportSession(format: string): Promise<void> {
  const id = useApp.getState().sessionId;
  const title = useSession.getState().detail?.session.title ?? 'session';
  if (!id) return;
  const fmt = ['md', 'json', 'pdf'].includes(format) ? format : 'md';
  try {
    await downloadFile(
      `/api/sessions/${id}/export`,
      `${title.replace(/[^\w-]+/g, '_').slice(0, 40)}.${fmt}`,
      { format: fmt, include: 'conversation,trace,changes' },
    );
  } catch (err) {
    useApp.getState().toast('error', (err as Error).message);
  }
}

export function ActiveRunIndicator() {
  const active = useSession((s) => (s.activeRunId ? s.runs[s.activeRunId] : undefined));
  if (!active || !isActiveStatus(active.status)) return null;
  return <Spinner className="h-3 w-3" />;
}
