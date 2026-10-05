// JEV live execution trace: JEV_PRE → TASK DNA → ROUTING → CONTEXT → TOOLS →
// EXECUTION → QA → CORRECTION → POST → LEARNING, with duration, tokens, cost
// and the decision of each checkpoint; plus "Why JEV chose this".
import { useState } from 'react';
import { ChevronRight, Cpu } from 'lucide-react';
import { Badge } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import type { Checkpoint } from '../../server/jev/metrics';

const LABEL: Record<Checkpoint['name'], string> = {
  JEV_PRE: 'JEV PRE',
  JEV_ROUTE: 'ROUTAGE',
  JEV_CONTEXT: 'CONTEXTE',
  JEV_TOOLS: 'OUTILS / SKILLS',
  JEV_EXECUTION: 'EXÉCUTION LLM',
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
}: {
  packet: Record<string, unknown>;
  why: string[];
  trace: Checkpoint[];
  done?: boolean;
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
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
