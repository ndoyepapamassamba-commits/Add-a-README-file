// Explained routing decision: which model, agent, skills, MCP and tools the
// Intelligence Engine chose, the evidence behind it, why not the premium model,
// the fallback and what would trigger an escalation.
import { useState } from 'react';
import { ChevronRight, Route } from 'lucide-react';
import { Badge } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import { TIER_LABEL } from '../../server/llm/routing';
import type { RoutingDecision, ScoredCandidate } from '../../server/engine/decision';

const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);

function Bar({ label, value, measured }: { label: string; value: number; measured: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="w-[112px] shrink-0 text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <span
          className={cx('block h-full rounded-full', measured ? 'bg-accent' : 'bg-accent/45')}
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </span>
      <span className="w-[54px] text-right tabular-nums">
        {Math.round(value)}
        <span className="text-faint">{measured ? '' : ' est.'}</span>
      </span>
    </div>
  );
}

export function CandidateTable({ rows, chosen }: { rows: ScoredCandidate[]; chosen?: string }) {
  return (
    <table className="mt-1 w-full text-[11.5px]">
      <thead className="text-left text-faint">
        <tr>
          <th className="py-0.5 font-normal">Modèle</th>
          <th className="font-normal">Indice</th>
          <th className="font-normal">Qualité</th>
          <th className="font-normal">Routage</th>
          <th className="font-normal">$/M</th>
          <th className="font-normal">Coût / réussite</th>
          <th className="font-normal">Statut</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr
            key={`${c.tier}-${c.id}`}
            className={cx('border-t border-line', c.id === chosen && 'text-accent')}
          >
            <td className="py-0.5 pr-2">{c.id}</td>
            <td>
              {c.metric} {c.raw.toFixed(1)}
            </td>
            <td>{c.quality.toFixed(0)}</td>
            <td>{c.routing.toFixed(0)}</td>
            <td>{c.price.toFixed(2)}</td>
            <td>{usd(c.costPerSuccess)}</td>
            <td className={c.excluded ? 'text-warn' : ''}>
              {c.id === chosen ? 'choisi' : (c.excluded ?? 'éligible')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RoutingCard({ d, defaultOpen = false }: { d: RoutingDecision; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const c = d.chosen;
  return (
    <div
      className="my-1.5 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[12.5px]"
      data-testid="routing-card"
    >
      <button
        className="flex w-full items-center gap-1.5 text-left font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight size={12} className={cx('text-faint transition-transform', open && 'rotate-90')} />
        <Route size={13} className="text-accent" />
        <span>Décision de routage</span>
        <Badge tone="accent">{TIER_LABEL[d.tier]}</Badge>
        {d.mode !== 'evidence' && (
          <Badge tone="warn">{d.mode === 'tiers' ? 'repli : paliers' : 'modèle par défaut'}</Badge>
        )}
        <span className="ml-auto truncate text-[11.5px] font-normal text-muted">
          {c ? c.id : '—'}
          {c?.estimate ? ` · ${usd(c.estimate.low)}–${usd(c.estimate.high)}` : ''} · confiance{' '}
          {Math.round(d.confidence * 100)} %
        </span>
      </button>
      <div className="mt-1 grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5 text-[12px]">
        <span className="text-faint">Agent</span>
        <span>{d.agent ?? '—'}</span>
        <span className="text-faint">Modèle</span>
        <span>{c ? `${c.name} (${c.provider})` : '—'}</span>
        <span className="text-faint">Skills</span>
        <span>{d.skills?.length ? d.skills.join(', ') : 'aucun'}</span>
        <span className="text-faint">MCP</span>
        <span>{d.mcp?.length ? d.mcp.join(', ') : 'aucun (outils natifs)'}</span>
      </div>
      <div className="mt-1.5 text-[12px]">
        <span className="font-medium">Pourquoi ? </span>
        <span className="text-muted">{d.why.model}</span>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          {c && (
            <div className="space-y-0.5">
              <Bar label="Réussite (prob.)" value={c.dims.success} measured={c.measured.success} />
              <Bar label="Intelligence" value={c.dims.intelligence} measured={c.measured.intelligence} />
              <Bar label="Outils / code" value={c.dims.tooling} measured={c.measured.tooling} />
              <Bar label="Agentique" value={c.dims.agentic} measured={c.measured.agentic} />
              <Bar label="Fiabilité" value={c.dims.reliability} measured={c.measured.reliability} />
              <Bar label="Latence" value={c.dims.latency} measured={c.measured.latency} />
              <Bar label="Efficacité coût" value={c.dims.cost} measured={c.measured.cost} />
              <div className="text-[11px] text-faint">
                Scores MASSAMBA 0–100 (« est. » = estimé, pas encore mesuré). Indice de référence : {c.ref}.
              </div>
            </div>
          )}
          <dl className="grid grid-cols-[150px_1fr] gap-x-2 gap-y-1 text-[12px]">
            <dt className="text-faint">Pourquoi cet agent ?</dt>
            <dd>{d.why.agent || '—'}</dd>
            <dt className="text-faint">Pourquoi ces skills ?</dt>
            <dd>{d.why.skills || '—'}</dd>
            <dt className="text-faint">Pourquoi ces MCP ?</dt>
            <dd>{d.why.mcp || '—'}</dd>
            <dt className="text-faint">Outils</dt>
            <dd>{d.why.tools || '—'}</dd>
            <dt className="text-faint">Pourquoi pas le premium ?</dt>
            <dd>{d.why.notPremium || '—'}</dd>
            <dt className="text-faint">Secours</dt>
            <dd>{d.why.fallback || '—'}</dd>
            <dt className="text-faint">Escalade si…</dt>
            <dd>{d.why.escalation.join(' · ') || '—'}</dd>
            <dt className="text-faint">Budget</dt>
            <dd className={d.budget.ok ? '' : 'text-err'}>{d.budget.note}</dd>
          </dl>
          {d.candidates.length > 0 && <CandidateTable rows={d.candidates} chosen={c?.id} />}
        </div>
      )}
    </div>
  );
}
