import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  ListChecks,
  Paperclip,
  Puzzle,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  X,
  Gauge as GaugeIcon,
  Rocket,
  Brain,
} from 'lucide-react';
import { RoutingCard } from './RoutingCard';
import { JevTraceCard } from './JevTrace';
import type { EffortSetting } from '@shared/types';
import {
  Button,
  Caret,
  Chip,
  Dropdown,
  Empty,
  Spinner,
  Textarea,
  type MenuItem,
  EditableTitle,
} from '../../web/components/ui';
import { CodeBlock, DiffView, Markdown } from '../../web/components/rich';
import { cx, fmtCost, fmtDuration, fmtPrice, fmtTokens, shortModel } from '../../web/lib/format';
import { resolveApproval, resolvePlan, runAgent, stopAgent } from '../lib/agent';
import { allAgents } from '../lib/roles';
import { useStore } from '../lib/store';
import type { Attachment, Item, PermissionMode, Session } from '../lib/types';
import {
  deliverablesIn,
  deliveryName,
  isSource,
  download,
  downloadFile,
  findFileByRef,
  importBrowserFile,
  isLocalRef,
} from '../lib/vfs';
import { saveToVault } from '../lib/vault';
import { DesignCard } from './DesignPicker';
import { refreshCredits } from '../lib/credits';
import { ArtifactCard } from './Artifacts';
import { ModelLine, PipelineBar, VerdictBadge, VerdictCard } from '../../web/components/mission';
import { analyzeTask, estimateTaskCost, routeModel } from '../../server/llm/routing';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import { FIX_EVERYTHING } from '../../server/agent/mission';

const EFFORTS: { value: EffortSetting; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Rapide' },
  { value: 'medium', label: 'Moyen' },
  { value: 'high', label: 'Élevé' },
  { value: 'xhigh', label: 'Très élevé' },
  { value: 'max', label: 'Maximum' },
];
const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'safe', label: 'SAFE', hint: 'Lecture seule : aucune modification' },
  { value: 'normal', label: 'NORMAL', hint: 'Demande avant d’écrire, supprimer, exécuter' },
  { value: 'auto', label: 'AUTONOME', hint: 'Agit sans demander' },
];

export function ChatView() {
  const session = useStore((s) => s.sessions.find((x) => x.id === s.currentId) ?? null);
  useEffect(() => {
    if (!useStore.getState().currentId) useStore.getState().newSession();
  }, []);
  if (!session) return null;
  return (
    <div className="flex h-full flex-col">
      <SessionHeader session={session} />
      <Transcript session={session} />
      <Composer session={session} />
    </div>
  );
}

function SessionHeader({ session }: { session: Session }) {
  const running = useStore((s) => Boolean(s.running[session.id]));
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 text-[13px]">
      <EditableTitle
        value={session.title}
        className="font-medium"
        onSave={(title) => useStore.getState().patchSession(session.id, { title })}
      />
      {running && <Spinner className="h-3 w-3" />}
      {session.verdict && session.verdict !== 'ERROR' && <VerdictBadge status={session.verdict} />}
      {session.verdict === 'ERROR' && <span className="text-[11.5px] text-err">erreur</span>}
      <span className="ml-auto text-[11.5px] text-faint">
        {fmtTokens(session.tokensIn + session.tokensOut)} tokens · {fmtCost(session.cost)}
      </span>
    </div>
  );
}

const WINDOW = 160;

function Transcript({ session }: { session: Session }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const stick = useRef(true);
  const running = useStore((s) => Boolean(s.running[session.id]));
  const status = useStore((s) => s.status[session.id]);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [session.items]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="min-h-0 flex-1 overflow-auto"
    >
      <div className="mx-auto max-w-[860px] px-5 py-6">
        {!session.items.length && <Welcome />}
        {!showAll && session.items.length > WINDOW && (
          <button
            className="mb-3 w-full rounded-lg border border-line py-1.5 text-[12px] text-muted hover:bg-hover"
            onClick={() => setShowAll(true)}
          >
            Afficher les {session.items.length - WINDOW} éléments précédents
          </button>
        )}
        {(showAll ? session.items : session.items.slice(-WINDOW)).map((it) => (
          <ItemView key={it.id} item={it} sessionId={session.id} />
        ))}
        {running && (
          <div className="flex items-center gap-2 py-2 text-[12.5px] text-muted">
            <Spinner /> {status ?? 'L’agent travaille…'}
            <LiveCall sid={session.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Welcome() {
  const setDraft = (t: string) => useStore.setState({ draft: t });
  const ideas = [
    'Analyse le fichier Excel joint : anomalies, tendances et 3 graphiques clés',
    'Crée une page web de présentation pour ma boutique, prête à publier',
    'Rédige un rapport de synthèse à partir du PDF joint',
    'Recherche les dernières nouveautés de React 19 et résume-les avec sources',
  ];
  return (
    <div className="py-10 text-center">
      <div className="mb-1 text-[20px] font-semibold">Que voulez-vous faire ?</div>
      <div className="mb-6 text-[13px] text-muted">
        Joignez des fichiers (📎 ou glisser-déposer), choisissez un agent et un niveau, puis décrivez la
        tâche.
      </div>
      <div className="mx-auto grid max-w-[640px] gap-2 sm:grid-cols-2">
        {ideas.map((i) => (
          <button
            key={i}
            onClick={() => setDraft(i)}
            className="rounded-xl border border-line bg-panel px-3 py-2.5 text-left text-[13px] text-muted hover:border-line-strong hover:text-fg"
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}

const ItemView = memo(function ItemView({ item, sessionId }: { item: Item; sessionId: string }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="my-4 flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-hover px-4 py-2.5">
            <div className="whitespace-pre-wrap text-[14px]">{item.text}</div>
            {item.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.attachments.map((a) => (
                  <span
                    key={a.path}
                    className="inline-flex items-center gap-1 rounded-md bg-panel px-1.5 py-0.5 text-[11.5px] text-muted"
                  >
                    <FileText size={11} /> {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    case 'assistant':
      return (
        <div className="my-3">
          {item.agent && <div className="mb-1 text-[11.5px] font-medium text-accent">{item.agent}</div>}
          <Markdown text={item.text + (item.streaming ? ' ▍' : '')} fileLink={(h) => resolveFileLink(h, sessionId)} />
          {!item.streaming && <Deliverables text={item.text} />}
          {!item.streaming && item.text.trim().length > 40 && <VaultButton sessionId={sessionId} itemId={item.id} />}
        </div>
      );
    case 'tool':
      return <ToolRow item={item} />;
    case 'approval':
      return <ApprovalCard item={item} />;
    case 'design':
      return <DesignCard item={item} />;
    case 'plan':
      return <PlanCard item={item} />;
    case 'checklist':
      return (
        <div className="my-2 rounded-xl border border-line bg-panel px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-muted">
            <ListChecks size={13} /> Tâches
          </div>
          {item.steps.map((s, i) => (
            <div
              key={i}
              className={cx(
                'flex items-center gap-2 py-0.5 text-[13px]',
                s.status === 'done' && 'text-faint line-through',
              )}
            >
              {s.status === 'done' ? (
                <Check size={13} className="text-ok" />
              ) : s.status === 'in_progress' ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <span className="inline-block h-3 w-3 rounded-full border border-line-strong" />
              )}
              {s.title}
            </div>
          ))}
        </div>
      );
    case 'model':
      return <ModelLine {...item} />;
    case 'pipeline':
      return <PipelineBar current={item.current} done={item.done} />;
    case 'mission':
      return <VerdictCard report={item.report} round={item.round} review={item.review} />;
    case 'skills':
      return (
        <div className="my-1 flex items-center gap-1.5 text-[11.5px] text-faint">
          <Puzzle size={11} /> Skills appliqués : {item.names.join(', ')}
        </div>
      );
    case 'subagent':
      return (
        <div className="my-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[13px]">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-accent" />
            <span className="font-medium">{item.role}</span>
            <span className="text-faint">
              {item.status === 'running' ? 'travaille…' : item.status === 'done' ? 'a terminé' : 'a échoué'}
            </span>
            {item.status === 'running' && <Spinner className="h-3 w-3" />}
          </div>
          <div className="mt-1 line-clamp-2 text-[12px] text-muted">{item.task}</div>
          {item.summary && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[12px] text-faint">Résultat</summary>
              <Markdown text={item.summary} />
            </details>
          )}
        </div>
      );
    case 'error':
      return (
        <div className="my-2 flex items-start gap-2 rounded-xl border border-err/40 bg-err/10 px-3 py-2 text-[13px] text-err">
          <CircleAlert size={15} className="mt-0.5 shrink-0" /> <span>{item.text}</span>
        </div>
      );
    case 'intel':
      return <IntelCard item={item} />;
    case 'routing':
      return <RoutingCard d={item.decision} />;
    case 'jev':
      return (
        <JevTraceCard
          packet={item.packet}
          why={item.why}
          trace={item.trace}
          done={item.done}
          summary={item.summary}
          sessionId={sessionId}
          live={item.live}
        />
      );
    case 'usage':
      return (
        <div className="my-3 border-t border-line pt-1.5 text-[11.5px] text-faint">
          {item.verdict && <VerdictBadge status={item.verdict} className="mr-1.5" />}
          {item.model && (
            <span className="font-medium text-muted">
              {item.model.split(', ').map(shortModel).join(', ')} ·{' '}
            </span>
          )}
          {fmtTokens(item.promptTokens)} → {fmtTokens(item.completionTokens)} tokens · {fmtCost(item.cost)} ·{' '}
          {fmtDuration(item.durationMs)}
          {!!item.fallbacks && <span className="text-warn"> · {item.fallbacks} repli(s) de modèle</span>}
        </div>
      );
    default:
      return sessionId ? null : null;
  }
});

/** Intelligence Engine card: strategy, shadow alert, evidence check, red team, learning. */
function IntelCard({ item }: { item: Extract<Item, { kind: 'intel' }> }) {
  const tone = {
    info: 'border-info/30 bg-info/5 text-info',
    warn: 'border-warn/40 bg-warn/10 text-warn',
    ok: 'border-ok/30 bg-ok/5 text-ok',
    err: 'border-err/40 bg-err/10 text-err',
  }[item.tone];
  return (
    <div className={cx('my-1.5 rounded-xl border px-3 py-1.5 text-[12.5px]', tone)}>
      <div className="flex items-center gap-1.5 font-medium">
        <Brain size={13} /> {item.title}
      </div>
      {item.lines.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 text-[12px] text-muted">
          {item.lines.map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
      )}
      {item.detail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11.5px] text-faint">Détail</summary>
          <div className="mt-1 text-fg">
            <Markdown text={item.detail} />
          </div>
        </details>
      )}
    </div>
  );
}

function ToolRow({ item }: { item: Extract<Item, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] hover:bg-hover"
      >
        <ChevronRight size={12} className={cx('text-faint transition-transform', open && 'rotate-90')} />
        {item.status === 'running' ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <span
            className={cx(
              'h-2 w-2 rounded-full',
              item.status === 'ok' ? 'bg-ok' : item.status === 'denied' ? 'bg-warn' : 'bg-err',
            )}
          />
        )}
        {item.agent && <span className="text-accent">{item.agent} ›</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
        {item.summary && <span className="max-w-[45%] truncate text-faint">{item.summary}</span>}
      </button>
      {open && (
        <div className="ml-6 mt-1 space-y-1">
          <CodeBlock code={JSON.stringify(item.args, null, 2).slice(0, 6000)} lang="json" />
          {item.output && <CodeBlock code={item.output} lang="texte" />}
        </div>
      )}
      {item.artifact && <ArtifactCard id={item.artifact} />}
    </div>
  );
}

function ApprovalCard({ item }: { item: Extract<Item, { kind: 'approval' }> }) {
  const [deny, setDeny] = useState(false);
  const [note, setNote] = useState('');
  if (item.resolved)
    return (
      <div className="my-1 px-2 text-[12px] text-faint">
        {item.resolved === 'approve' ? '✓ Autorisé' : '✕ Refusé'} : {item.label}
      </div>
    );
  return (
    <div
      tabIndex={0}
      ref={(el) => el?.focus()}
      onKeyDown={(e) => {
        if (deny) return;
        if (e.key === '1') resolveApproval(item.id, 'approve');
        if (e.key === '2') resolveApproval(item.id, 'approve', { always: true });
        if (e.key === '3') setDeny(true);
      }}
      className="wb-in my-2 rounded-xl border border-warn/50 bg-warn/5 p-3 outline-none"
    >
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <ShieldAlert size={15} className="text-warn" />{' '}
        {item.agent ? `${item.agent} demande` : 'L’agent demande'} l’autorisation :{' '}
        <span className="font-normal">{item.label}</span>
      </div>
      {item.diff ? (
        <DiffView before={item.diff.before} after={item.diff.after} maxLines={200} />
      ) : (
        <CodeBlock code={item.preview} lang={item.tool === 'code.run' ? 'code' : 'texte'} />
      )}
      {!deny ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => resolveApproval(item.id, 'approve')}>
            <span className="opacity-60">1</span> Oui
          </Button>
          <Button size="sm" onClick={() => resolveApproval(item.id, 'approve', { always: true })}>
            <span className="opacity-60">2</span> Oui, toujours pour cette session
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeny(true)}>
            <span className="opacity-60">3</span> Non, et dire quoi faire
          </Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <Textarea
            autoFocus
            rows={2}
            placeholder="Que doit faire l’agent à la place ? (optionnel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => resolveApproval(item.id, 'deny', { note: note || undefined })}
            >
              Refuser
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeny(false)}>
              Retour
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ item }: { item: Extract<Item, { kind: 'plan' }> }) {
  const [steps, setSteps] = useState(item.steps);
  const [edit, setEdit] = useState(false);
  return (
    <div
      className={cx(
        'wb-in my-2 rounded-xl border p-3',
        item.resolved ? 'border-line bg-panel/50' : 'border-accent/50 bg-accent-soft',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
        <ListChecks size={15} className="text-accent" /> Plan proposé{' '}
        {item.resolved && (
          <span className="font-normal text-faint">
            — {item.resolved === 'approve' ? 'approuvé' : 'annulé'}
          </span>
        )}
      </div>
      <div className="mb-2 text-[13px] text-muted">
        <Markdown text={item.summary} />
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-[13px]">
        {steps.map((s, i) => (
          <li key={i}>
            {edit && !item.resolved ? (
              <div className="flex gap-1">
                <input
                  className="h-7 flex-1 rounded-md border border-line bg-input px-2 text-[13px] outline-none"
                  value={s}
                  onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  aria-label="Retirer l’étape"
                  className="text-faint hover:text-err"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              s
            )}
          </li>
        ))}
      </ol>
      {!item.resolved && (
        <div className="mt-3 flex flex-wrap gap-2">
          {edit && (
            <Button size="sm" variant="ghost" onClick={() => setSteps([...steps, ''])}>
              + Étape
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              resolvePlan(
                item.id,
                'approve',
                steps.filter((s) => s.trim()),
              )
            }
          >
            <Check size={14} /> Approuver et exécuter
          </Button>
          <Button size="sm" onClick={() => setEdit((e) => !e)}>
            {edit ? 'Terminer la modification' : 'Modifier le plan'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resolvePlan(item.id, 'cancel')}>
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}

// ── composer ─────────────────────────────────────────────────────────────

const SLASH = [
  { cmd: '/clear', desc: 'Nouvelle session' },
  { cmd: '/plan', desc: 'Basculer le mode Plan' },
  { cmd: '/mission', desc: 'Basculer le mode Mission autonome' },
  { cmd: '/fix', desc: 'Mission « Répare tout »' },
  { cmd: '/review', desc: 'Faire relire le travail par l’agent Relecteur' },
  { cmd: '/export', desc: 'Exporter la session (Markdown)' },
];

/** A link the model wrote to a local file becomes a real download of the workspace file. */
function resolveFileLink(href: string, sid?: string | null) {
  if (!isLocalRef(href)) return null;
  const f = findFileByRef(href, sid ?? null);
  return f ? { name: deliveryName(f, sid ?? null), save: () => downloadFile(f, sid ?? null) } : null;
}

/** Keeps a well-written / well-executed answer (and its files) in the experience vault. */
function VaultButton({ sessionId, itemId }: { sessionId: string; itemId: string }) {
  const saved = useStore((s) => s.vault.some((v) => v.source === itemId));
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid="vault-save"
      disabled={done || saved}
      onClick={() => {
        const e = saveToVault(sessionId, itemId);
        if (e) setDone(true);
      }}
      className="mt-1 text-[11.5px] text-faint hover:text-accent disabled:text-ok"
      title="Garder cette réponse et ses fichiers comme expérience réutilisable"
    >
      {done || saved ? '★ Dans le coffre d’expérience' : '☆ Garder dans le coffre d’expérience'}
    </button>
  );
}

/**
 * Files the answer talks about, offered as download buttons right in the chat: the DELIVERABLES first (tagged, under
 * the name they download as), then the user's own source files, muted and labelled as such — never confused.
 */
function Deliverables({ text }: { text: string }) {
  const fs = useStore((s) => s.files);
  const sid = useStore((s) => s.currentId);
  const list = useMemo(() => {
    const all = deliverablesIn(text, sid);
    return [...all.filter((f) => !isSource(f)), ...all.filter(isSource)];
  }, [text, fs, sid]);
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2" data-testid="deliverables">
      {list.map((f) => {
        const src = isSource(f);
        return (
          <button
            key={f.path}
            type="button"
            onClick={() => downloadFile(f, sid)}
            data-testid={src ? 'deliverable-source' : 'deliverable-output'}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] hover:bg-hover ${src ? 'border-dashed border-line bg-transparent opacity-70' : 'border-accent/50 bg-panel'}`}
            title={src ? `${f.path} — votre fichier d'origine (pas le livrable)` : f.path}
          >
            <Download size={13} className={src ? 'text-faint' : 'text-accent'} />
            <span className={`rounded px-1 text-[10.5px] font-semibold uppercase ${src ? 'bg-hover text-faint' : 'bg-accent/15 text-accent'}`}>{src ? 'Source (votre fichier)' : 'Livrable'}</span>
            <span className="font-medium">{deliveryName(f, sid)}</span>
            <span className="text-faint">
              {Math.max(1, Math.round((f.binary ? (f.data.length * 3) / 4 : f.data.length) / 1024))} Ko
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function exportMarkdown(s: Session): void {
  const lines = [
    `# ${s.title}`,
    '',
    `_Exporté le ${new Date().toLocaleString('fr-FR')} · coût ${fmtCost(s.cost)}_`,
    '',
  ];
  for (const i of s.items) {
    if (i.kind === 'user')
      lines.push(
        `## 🧑 Vous`,
        '',
        i.text,
        ...(i.attachments.length
          ? ['', `Pièces jointes : ${i.attachments.map((a) => a.name).join(', ')}`]
          : []),
        '',
      );
    if (i.kind === 'assistant' && i.text) lines.push(`## 🤖 ${i.agent ?? 'Agent'}`, '', i.text, '');
    if (i.kind === 'tool') lines.push(`- 🔧 ${i.label} — ${i.status}${i.summary ? ` (${i.summary})` : ''}`);
    if (i.kind === 'error') lines.push(`> ⚠️ ${i.text}`, '');
  }
  download(
    `${s.title.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'session'}.md`,
    lines.join('\n'),
    'text/markdown',
  );
}

function Composer({ session }: { session: Session }) {
  const draft = useStore((s) => s.draft);
  const running = useStore((s) => Boolean(s.running[session.id]));
  const models = useStore((s) => s.models);
  const customAgents = useStore((s) => s.agents);
  const skills = useStore((s) => s.skills);
  const agentMode = useStore((s) => s.agentMode);
  const patch = (p: Partial<Session>) => useStore.getState().patchSession(session.id, p);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  const agents = allAgents(customAgents);
  const agent = agents.find((a) => a.id === session.agent) ?? agents[0]!;
  const modelInfo = models.find((m) => m.id === session.model);
  const health = useStore((s) => s.health);
  const estimateText = useMemo(() => {
    if (!draft.trim() || !models.length) return '';
    const p = analyzeTask({
      text: draft,
      attachmentNames: files.map((f) => f.name),
      mission: agentMode === 'mission',
      historyTokens: JSON.stringify(session.history).length / 3.6,
    });
    const est =
      session.model === 'auto'
        ? routeModel(models, DEFAULT_AUTO_TIERS, p, health)?.estimate
        : estimateTaskCost(modelInfo, p, agentMode === 'mission');
    return est ? `≈ ${fmtCost(est.low)}–${fmtCost(est.high)}` : '';
  }, [draft, models, files, agentMode, session.model, session.history, modelInfo, health]);

  const modelItems: MenuItem[] = useMemo(
    () => [
      {
        value: 'auto',
        label: 'Auto (routage intelligent)',
        hint: 'choisit le meilleur rapport qualité / prix',
        icon: <Sparkles size={13} />,
      },
      ...models
        .filter((m) => m.capabilities.tools)
        .sort((a, b) => b.created - a.created)
        .map((m) => ({
          value: m.id,
          label: shortModel(m.id),
          hint: `${fmtPrice(m.inputPrice)} / ${fmtPrice(m.outputPrice)} · ${Math.round(m.contextLength / 1000)}k${m.capabilities.vision ? ' · vision' : ''}`,
        })),
    ],
    [models],
  );

  const addFiles = async (list: FileList | File[]) => {
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const f of Array.from(list)) {
        if (f.size > 50 * 1024 * 1024) {
          useStore.getState().toast('err', `${f.name} dépasse 50 Mo`);
          continue;
        }
        const v = await importBrowserFile(f, 'uploads', session.id);
        added.push({ path: v.path, name: f.name || v.path, mime: v.mime, size: v.size });
      }
      setFiles((x) => [...x, ...added]);
    } catch (e) {
      useStore.getState().toast('err', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || running) return;
    if (text.startsWith('/')) {
      const cmd = text.split(/\s/)[0];
      if (cmd === '/clear') return void (useStore.getState().newSession(), useStore.setState({ draft: '' }));
      if (cmd === '/plan')
        return void useStore.setState({ agentMode: agentMode === 'plan' ? 'chat' : 'plan', draft: '' });
      if (cmd === '/mission')
        return void useStore.setState({ agentMode: agentMode === 'mission' ? 'chat' : 'mission', draft: '' });
      if (cmd === '/fix') {
        useStore.setState({ agentMode: 'mission', draft: '' });
        void runAgent(
          session.id,
          `${FIX_EVERYTHING}${text.slice(4).trim() ? `\n\nPrécision : ${text.slice(4).trim()}` : ''}`,
          files,
        ).then(refreshCredits);
        setFiles([]);
        return;
      }
      if (cmd === '/export') return void (exportMarkdown(session), useStore.setState({ draft: '' }));
      if (cmd === '/review') {
        useStore.setState({ draft: '' });
        patch({ agent: 'reviewer' });
        void runAgent(
          session.id,
          'Relis tout le travail fait dans cette session (fichiers, résultats, réponses). Liste les problèmes par gravité avec des corrections précises, puis un verdict.',
          [],
        ).then(refreshCredits);
        return;
      }
    }
    const att = files;
    setFiles([]);
    useStore.setState({ draft: '' });
    void runAgent(session.id, text, att).then(refreshCredits);
  };

  return (
    <div
      className="shrink-0 px-5 pb-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <div
        className={cx(
          'mx-auto max-w-[860px] rounded-2xl border bg-panel shadow-pop transition-colors',
          drag ? 'border-accent' : 'border-line',
        )}
      >
        {(files.length > 0 || uploading) && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {files.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1 rounded-lg bg-hover px-2 py-1 text-[12px]"
              >
                <FileText size={12} /> {f.name}
                <button
                  aria-label={`Retirer ${f.name}`}
                  onClick={() => setFiles(files.filter((x) => x.path !== f.path))}
                  className="text-faint hover:text-fg"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {uploading && <Spinner />}
          </div>
        )}
        <textarea
          ref={ta}
          value={draft}
          onChange={(e) => useStore.setState({ draft: e.target.value })}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files);
            if (pasted.length) {
              e.preventDefault();
              void addFiles(
                pasted.map((f, i) =>
                  f.name ? f : new File([f], `collage-${Date.now()}-${i}.png`, { type: f.type }),
                ),
              );
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape' && running) stopAgent(session.id);
            if (e.key === 'Tab' && e.shiftKey) {
              e.preventDefault();
              useStore.setState({ agentMode: agentMode === 'plan' ? 'chat' : 'plan' });
            }
          }}
          rows={Math.min(10, Math.max(2, draft.split('\n').length))}
          placeholder={
            running
              ? 'L’agent travaille… (Échap pour interrompre)'
              : 'Demandez à l’agent…  / commandes · glissez ou collez fichiers, photos, documents'
          }
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[14px] outline-none placeholder:text-faint"
        />
        {draft.startsWith('/') && !draft.includes(' ') && (
          <div className="mx-3 mb-1 rounded-lg border border-line bg-elev p-1">
            {SLASH.filter((c) => c.cmd.startsWith(draft)).map((c) => (
              <button
                key={c.cmd}
                className="flex w-full gap-3 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-hover"
                onClick={() => useStore.setState({ draft: c.cmd })}
              >
                <span className="font-mono text-accent">{c.cmd}</span>{' '}
                <span className="text-muted">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) =>
              e.target.files && void addFiles(e.target.files).then(() => (e.target.value = ''))
            }
          />
          <Chip onClick={() => input.current?.click()} title="Joindre des fichiers, documents, photos">
            <Paperclip size={14} />
          </Chip>
          <Dropdown
            trigger={
              <Chip title="Agent">
                <Bot size={13} /> {agent.name} <Caret />
              </Chip>
            }
            items={agents.map((a) => ({ value: a.id, label: a.name, hint: a.description }))}
            value={session.agent}
            onSelect={(v) => patch({ agent: v })}
            placement="top"
            width={320}
          />
          <Dropdown
            trigger={
              <Chip title="Modèle">
                <Sparkles size={13} /> {session.model === 'auto' ? 'Auto' : shortModel(session.model)}{' '}
                <Caret />
              </Chip>
            }
            items={modelItems}
            value={session.model}
            onSelect={(v) => patch({ model: v, pinnedModel: undefined })}
            placement="top"
            width={420}
            search
          />
          <Dropdown
            trigger={
              <Chip title="Niveau de réflexion (effort)">
                <GaugeIcon size={13} /> {EFFORTS.find((e) => e.value === session.effort)?.label ?? 'Auto'}{' '}
                <Caret />
              </Chip>
            }
            items={EFFORTS.map((e) => ({
              value: e.value,
              label: e.label,
              disabled: e.value !== 'auto' && modelInfo !== undefined && !modelInfo.capabilities.reasoning,
            }))}
            value={session.effort}
            onSelect={(v) => patch({ effort: v as EffortSetting })}
            placement="top"
          />
          <Dropdown
            trigger={
              <Chip title="Mode de permissions">
                <Shield size={13} /> {MODES.find((m) => m.value === session.mode)?.label} <Caret />
              </Chip>
            }
            items={MODES.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))}
            value={session.mode}
            onSelect={(v) => patch({ mode: v as PermissionMode })}
            placement="top"
            width={300}
          />
          <Chip
            title="Mode Plan : l’agent propose un plan à valider avant d’agir (Maj+Tab)"
            active={agentMode === 'plan'}
            onClick={() => useStore.setState({ agentMode: agentMode === 'plan' ? 'chat' : 'plan' })}
          >
            <ListChecks size={13} /> Plan
          </Chip>
          <Chip
            title="Mode Mission : l’IA travaille en autonomie (analyse → plan → exécution → test → review → correction → validation → livraison) jusqu’à un résultat vérifié, avec verdict PASSED / PARTIAL / FAILED"
            active={agentMode === 'mission'}
            onClick={() => useStore.setState({ agentMode: agentMode === 'mission' ? 'chat' : 'mission' })}
          >
            <Rocket size={13} /> Mission
          </Chip>
          {skills.length > 0 && (
            <Dropdown
              trigger={
                <Chip
                  title="Skills épinglés pour cette session (appliqués à chaque message)"
                  active={session.pinnedSkills.length > 0}
                >
                  <Puzzle size={13} />{' '}
                  {session.pinnedSkills.length ? `${session.pinnedSkills.length} skill(s)` : 'Skills'}{' '}
                  <Caret />
                </Chip>
              }
              items={skills
                .filter((s) => s.enabled)
                .map((s) => ({
                  value: s.name,
                  label: `${session.pinnedSkills.includes(s.name) ? '✓ ' : ''}${s.name}`,
                  hint: s.description.slice(0, 90),
                }))}
              onSelect={(v) =>
                patch({
                  pinnedSkills: session.pinnedSkills.includes(v)
                    ? session.pinnedSkills.filter((x) => x !== v)
                    : [...session.pinnedSkills, v],
                })
              }
              placement="top"
              width={360}
              search
            />
          )}
          <div className="flex-1" />
          {estimateText && (
            <span
              className="hidden text-[11px] text-faint sm:inline"
              title="Coût estimé de la tâche (prix réels OpenRouter, nombre d’étapes estimé)"
            >
              {estimateText}
            </span>
          )}
          <span className="hidden text-[11px] text-faint sm:inline">{fmtCost(session.cost)}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportMarkdown(session)}
            title="Exporter la session"
          >
            <Download size={13} />
          </Button>
          {running ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => stopAgent(session.id)}
              title="Interrompre (Échap)"
            >
              <Square size={12} /> Stop
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={send} disabled={!draft.trim()} aria-label="Envoyer">
              <ArrowUp size={14} />
            </Button>
          )}
        </div>
      </div>
      <div className="mx-auto mt-1.5 max-w-[860px] text-center text-[11px] text-faint">
        {session.items.length === 0 && (
          <span>Les réponses de l’IA peuvent contenir des erreurs. Vérifiez les points importants.</span>
        )}
      </div>
    </div>
  );
}

export { Empty };

const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
/** Next to « Réflexion… » : the model running now, time on this call / on the run, and tokens (≈ while streaming). */
function LiveCall({ sid }: { sid: string }) {
  const live = useStore((s) => s.callLive[sid]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 500);
    return () => window.clearInterval(t);
  }, []);
  if (!live) return null;
  const sec = (t: number) => Math.max(0, Math.floor((Date.now() - t) / 1000));
  const out = live.liveOut;
  return (
    <span className="text-faint" data-testid="live-call">
      · <span className="text-fg">{live.model}</span> · {sec(live.callStart)} s (mission {sec(live.runStart)}{' '}
      s) · {out > 0 ? `≈ ${fmtTok(out)} tokens reçus` : 'en attente de la 1ʳᵉ réponse'}
      {live.baseTokens > 0 && ` · ${fmtTok(live.baseTokens)} tokens déjà facturés`}
    </span>
  );
}
