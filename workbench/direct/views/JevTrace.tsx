// JEV live execution trace: JEV_PRE → TASK DNA → ROUTING → CONTEXT → TOOLS →
// EXECUTION → QA → CORRECTION → POST → LEARNING, with duration, tokens, cost
// and the decision of each checkpoint; plus "Why JEV chose this".
import { useState } from 'react';
import { ChevronRight, Cpu, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import type { Checkpoint } from '../../server/jev/metrics';
import type { JevLiveSnapshot } from '../lib/store';
import { useStore } from '../lib/store';
import { feedback as jevFeedback } from '../lib/jev';

const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`;

/** LIVE COGNITIVE TRACE: mission state + the live decisions taken so far (measured). */
export function LiveTree({ snap, running }: { snap: JevLiveSnapshot; running: boolean }) {
  const s = snap.state;
  const status = running
    ? 'en cours'
    : s.status === 'running'
      ? 'interrompue'
      : s.status === 'done'
        ? 'terminée'
        : s.status;
  const bar = (v: number, tone: string) => (
    <span className="inline-block h-1.5 w-16 overflow-hidden rounded bg-hover align-middle">
      <span
        className={cx('block h-full', tone)}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` }}
      />
    </span>
  );
  return (
    <div className="text-[11.5px]" data-testid="jev-live">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={running ? 'info' : s.status === 'done' ? 'ok' : 'warn'}>JEV LIVE · {status}</Badge>
        <span>étape {s.step}</span>
        <span>modèle {s.model.split('/').pop()}</span>
        <span>
          progrès {bar(s.progress, 'bg-accent')} {pct(s.progress)}
        </span>
        <span>
          budget B{s.budgetStage}{' '}
          {bar(s.budgetTokens ? 1 - s.budgetLeftTokens / s.budgetTokens : 0, 'bg-warn')} {s.tokens}/
          {s.budgetTokens} tok
        </span>
        <span>qualité {s.quality ?? '—'}</span>
        <span>dérive {pct(s.drift)}</span>
        <span>effort {s.effort}</span>
        <span>JEV-{s.level}</span>
        <span>économisé ≈ {s.savedTokens} tok</span>
      </div>
      <ul className="space-y-0.5 border-l border-line pl-3">
        <li>
          <span className="font-medium">MISSION</span>{' '}
          <span className="text-muted">{s.goal.slice(0, 140)}</span>
        </li>
        {snap.checkpoints.map((c, i) => (
          <li key={i}>
            <span className="text-faint">
              étape {c.step} · {c.kind}
            </span>{' '}
            {c.decisions.map((d, j) => (
              <span key={j} className="mr-2">
                <span
                  className={cx(
                    'font-medium',
                    d.action === 'STOP' ? 'text-warn' : d.action === 'CONTINUE' ? 'text-muted' : 'text-info',
                  )}
                >
                  {d.action}
                </span>
                {d.tool ? ` ${d.tool}` : ''}
                {d.model ? ` → ${d.model}` : ''} <span className="text-muted">— {d.reason}</span>
              </span>
            ))}
          </li>
        ))}
        {!snap.checkpoints.length && (
          <li className="text-faint">aucune décision : CONTINUE à chaque checkpoint</li>
        )}
      </ul>
    </div>
  );
}

const LABEL: Record<Checkpoint['name'], string> = {
  JEV_PRE: 'JEV PRE',
  JEV_ROUTE: 'ROUTAGE',
  JEV_CONTEXT: 'CONTEXTE',
  JEV_TOOLS: 'OUTILS / SKILLS',
  JEV_EXECUTION: 'EXÉCUTION LLM',
  JEV_CHECKPOINT: 'JEV CHECKPOINT',
  JEV_MODEL_SWITCH: 'MODEL SWITCH',
  JEV_QA: 'QA',
  JEV_CORRECTION: 'CORRECTION',
  JEV_ESCALATION: 'ESCALADE',
  JEV_POST: 'FINAL',
  JEV_LEARNING: 'APPRENTISSAGE',
};

export function TraceTimeline({ trace }: { trace: Checkpoint[] }) {
  return (
    <ol className="mt-1 space-y-0.5 border-l border-line pl-3 text-[11.5px]">
      {trace.map((c, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[16.5px] top-[5px] h-2 w-2 rounded-full bg-accent" />
          <span className="font-medium">{LABEL[c.name] ?? c.name}</span>
          <span className="text-faint">
            {' '}
            · {c.ms < 1 ? '<1' : Math.round(c.ms)} ms{c.tokens ? ` · ${c.tokens} tok` : ''}
            {c.cost ? ` · $${c.cost.toFixed(5)}` : ''}
          </span>
          <div className="text-muted">{c.decision}</div>
        </li>
      ))}
    </ol>
  );
}

export function JevTraceCard({
  packet,
  why,
  trace,
  done,
  summary,
  sessionId,
  live,
}: {
  packet: Record<string, unknown>;
  why: string[];
  trace: Checkpoint[];
  done?: boolean;
  summary?: string;
  sessionId?: string;
  live?: JevLiveSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState<'good' | 'bad' | null>(null);
  const snap = useStore((st) => (sessionId ? st.jevLive[sessionId] : undefined));
  const running = useStore((st) => Boolean(sessionId && st.running[sessionId]));
  const p = packet as {
    task_type?: string;
    agent_strategy?: string;
    level?: number;
    decided_by?: string;
    tools_required?: string[];
    selected_model?: string;
    token_budget?: number;
  };
  return (
    <div
      className="my-1.5 rounded-xl border border-info/30 bg-info/5 px-3 py-2 text-[12.5px]"
      data-testid="jev-trace"
    >
      <button
        className="flex w-full items-center gap-1.5 text-left font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight size={12} className={cx('text-faint transition-transform', open && 'rotate-90')} />
        <Cpu size={13} className="text-info" />
        <span>JEV</span>
        <Badge tone="info">{p.decided_by ?? 'JEV-0'}</Badge>
        <Badge>L{p.level ?? 0}</Badge>
        <span className="truncate text-[11.5px] font-normal text-muted">
          {p.task_type} · {p.agent_strategy} · {p.tools_required?.length ?? 0} outils · budget{' '}
          {p.token_budget} tok
        </span>
        <span className="ml-auto text-[11.5px] font-normal text-faint">{done ? summary : 'en cours…'}</span>
      </button>
      {(done ? live && open : snap) && (
        <div className="mt-1.5">
          <LiveTree snap={(done ? live : snap)!} running={running && !done} />
        </div>
      )}
      {done && sessionId && (
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-faint">
          Retour sur cette réponse (apprentissage JEV) :
          {(['good', 'bad'] as const).map((v) => (
            <button
              key={v}
              className={cx(
                'rounded p-0.5 hover:bg-hover',
                voted === v && (v === 'good' ? 'text-ok' : 'text-err'),
              )}
              title={v === 'good' ? 'Parfait' : 'C’est mauvais'}
              aria-label={v === 'good' ? 'Bonne réponse' : 'Mauvaise réponse'}
              onClick={() => {
                if (jevFeedback(sessionId, v)) setVoted(v);
              }}
            >
              {v === 'good' ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
            </button>
          ))}
          {voted && <span>{voted === 'good' ? 'noté : réussite' : 'noté : échec (routage ajusté)'}</span>}
        </div>
      )}
      {open && (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[11.5px] font-medium text-faint">Pourquoi JEV a choisi cela</div>
            <ul className="space-y-0.5 text-[12px]">
              {why.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11.5px] text-faint">Execution Packet (JSON)</summary>
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-panel p-2 text-[11px]">
                {JSON.stringify(packet, null, 2)}
              </pre>
            </details>
          </div>
          <div>
            <div className="mb-1 text-[11.5px] font-medium text-faint">Trace d’exécution</div>
            <TraceTimeline trace={trace} />
          </div>
        </div>
      )}
    </div>
  );
}
