import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Wallet } from 'lucide-react';
import { cx, fmtCost, fmtTokens, shortModel } from '../../lib/format';
import { useApp } from '../../store/app';
import { Gauge, IconButton } from '../ui';

/** Top-bar credit gauge: OpenRouter balance + consumption (session / today / month / per model). */
export function CreditsGauge() {
  const credits = useApp((s) => s.credits);
  const refresh = useApp((s) => s.refreshCredits);
  const sessionId = useApp((s) => s.sessionId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 60_000);
    const onOpen = () => setOpen(true);
    window.addEventListener('wb:open-credits', onOpen);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('wb:open-credits', onOpen);
    };
  }, [refresh, sessionId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-credits]') && !ref.current?.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const c = credits?.credits;
  const total = c?.keyLimit ?? c?.totalCredits ?? null;
  const remaining = c?.keyLimitRemaining ?? c?.remaining ?? null;
  const used = total !== null && remaining !== null ? total - remaining : null;
  const pct = total ? (remaining ?? 0) / total : null;
  const sessionCost = credits?.session?.cost ?? 0;
  const budget = credits?.budget;
  const r = ref.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-lg px-2 hover:bg-hover"
        title="Crédits OpenRouter et consommation"
      >
        <Wallet
          size={15}
          className={cx(
            pct !== null && pct < 0.1 ? 'text-err' : pct !== null && pct < 0.25 ? 'text-warn' : 'text-muted',
          )}
        />
        <div className="hidden w-24 sm:block">
          <div className="flex justify-between text-[10.5px] leading-3 text-muted">
            <span>{remaining !== null ? fmtCost(remaining, 2) : '—'}</span>
            <span className="text-faint">{total !== null ? `/ ${fmtCost(total, 0)}` : ''}</span>
          </div>
          <Gauge value={remaining ?? 0} max={total ?? 1} tone="accent" className="mt-1" />
        </div>
        <span className="text-[11.5px] tabular-nums text-faint">{fmtCost(sessionCost)}</span>
      </button>
      {open &&
        createPortal(
          <div
            data-credits
            className="wb-in fixed z-50 w-[360px] rounded-xl border border-line bg-elev p-4 shadow-pop"
            style={{
              top: (r?.bottom ?? 40) + 6,
              left: Math.max(8, Math.min(window.innerWidth - 368, (r?.right ?? 360) - 360)),
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Crédits OpenRouter</div>
              <IconButton label="Actualiser" onClick={() => void refresh()}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
            {c?.available || c?.keyLimit !== null ? (
              <div className="mb-4 space-y-2">
                {c?.totalCredits !== null && c?.totalCredits !== undefined && (
                  <Row
                    label="Solde du compte"
                    value={`${fmtCost(c.remaining, 2)} / ${fmtCost(c.totalCredits, 2)}`}
                    gauge={[c.remaining ?? 0, c.totalCredits]}
                  />
                )}
                {c?.keyLimit !== null && c?.keyLimit !== undefined && (
                  <Row
                    label="Limite de la clé"
                    value={`${fmtCost(c.keyLimitRemaining, 2)} restants / ${fmtCost(c.keyLimit, 2)}`}
                    gauge={[c.keyLimitRemaining ?? 0, c.keyLimit]}
                  />
                )}
                {used !== null && (
                  <div className="text-[11.5px] text-faint">Consommé sur la clé : {fmtCost(used, 3)}</div>
                )}
              </div>
            ) : (
              <div className="mb-4 rounded-lg bg-hover p-2.5 text-[12.5px] text-muted">
                Solde indisponible : {c?.error ?? 'configurez OPENROUTER_API_KEY'}.
              </div>
            )}
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <Stat
                label="Session"
                value={fmtCost(credits?.session?.cost ?? 0)}
                sub={`${fmtTokens((credits?.session?.tokensIn ?? 0) + (credits?.session?.tokensOut ?? 0))} tok`}
              />
              <Stat
                label="Aujourd'hui"
                value={fmtCost(credits?.today.cost ?? 0)}
                sub={`${credits?.today.calls ?? 0} appels`}
              />
              <Stat
                label="Ce mois"
                value={fmtCost(credits?.month.cost ?? 0)}
                sub={`${fmtTokens((credits?.month.promptTokens ?? 0) + (credits?.month.completionTokens ?? 0))} tok`}
              />
            </div>
            {budget && (
              <div className="mb-3 space-y-2">
                {budget.daily.limit > 0 && (
                  <Row
                    label="Budget journalier"
                    value={`${fmtCost(budget.daily.spent)} / ${fmtCost(budget.daily.limit, 2)}`}
                    gauge={[budget.daily.spent, budget.daily.limit]}
                    usage
                  />
                )}
                {budget.monthly.limit > 0 && (
                  <Row
                    label="Budget mensuel"
                    value={`${fmtCost(budget.monthly.spent)} / ${fmtCost(budget.monthly.limit, 2)}`}
                    gauge={[budget.monthly.spent, budget.monthly.limit]}
                    usage
                  />
                )}
              </div>
            )}
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
              Aujourd'hui par modèle
            </div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {(credits?.todayByModel ?? []).length === 0 && (
                <div className="text-[12.5px] text-faint">Aucune consommation aujourd'hui.</div>
              )}
              {(credits?.todayByModel ?? []).map((m) => (
                <div key={m.model} className="flex items-center justify-between text-[12.5px]">
                  <span className="truncate" title={m.model}>
                    {shortModel(m.model)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {fmtTokens(m.promptTokens + m.completionTokens)} · {fmtCost(m.cost)}
                  </span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Row({
  label,
  value,
  gauge,
  usage,
}: {
  label: string;
  value: string;
  gauge: [number, number];
  usage?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12.5px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Gauge value={gauge[0]} max={gauge[1]} tone={usage ? 'auto' : 'accent'} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-2">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}
