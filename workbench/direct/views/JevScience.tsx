// JEV SCIENTIFIC VALIDATION: paired experiment launcher, measured results, economics,
// decompositions, per-category analysis, verdict and technical report.
// Every figure carries a label (MEASURED / CALCULATED / PROJECTED / INSUFFICIENT_SAMPLE /
// NON_COMPARABLE); a quality that was not measured reads « NON MESURÉ », never 0.
import { useMemo, useRef, useState } from 'react';
import { Copy, Download, FlaskConical, Play, Square } from 'lucide-react';
import { Badge, Button, Input, Select, Toggle } from '../../web/components/ui';
import { cx, fmtCost, fmtDuration, fmtTokens } from '../../web/lib/format';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { jevSettings } from '../lib/jev';
import { BENCH, runBench, type BenchRun } from '../lib/jevBench';
import type { JevVariant } from '../lib/agent';
import {
  CATEGORY_LABEL,
  CES_FORMULA,
  SCIENCE,
  VARIANTS,
  VARIANT_LABEL,
  VERDICT_TEXT,
  analyze,
  explainCost,
  explainTokens,
  reportOf,
  type DataLabel,
  type Desc,
  type Diagnosis,
  type PairedStat,
  type Science,
  type VariantSci,
} from '../../server/jev/science';
import type { JevLogEntry, Variant } from '../../server/jev/metrics';
import { redact } from '../../server/jev/provider';

const th = 'px-2 py-1 text-left text-[11.5px] font-medium text-faint whitespace-nowrap';
const td = 'px-2 py-1 align-top';
const NM = 'NON MESURÉ';

const LABEL_TONE: Record<DataLabel, 'ok' | 'info' | 'warn' | 'err' | 'neutral'> = {
  MEASURED: 'ok',
  CALCULATED: 'info',
  PROJECTED: 'warn',
  INSUFFICIENT_SAMPLE: 'neutral',
  NON_COMPARABLE: 'err',
};
function Tag({ l }: { l: DataLabel }) {
  return <Badge tone={LABEL_TONE[l]}>{l === 'INSUFFICIENT_SAMPLE' ? 'ÉCHANTILLON INSUFFISANT' : l}</Badge>;
}

const num = (x: number | null | undefined, f: (v: number) => string, none = '—') =>
  x === null || x === undefined ? none : f(x);
const pct = (x: number | null | undefined) => num(x, (v) => `${Math.round(v * 100)} %`);
const sgn = (x: number | null | undefined, f: (v: number) => string) =>
  num(x, (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`);
const usd = (x: number | null | undefined, d = 5) => num(x, (v) => `${v.toFixed(d)} $`);
const descCell = (d: Desc, f: (v: number) => string) =>
  d.mean === null
    ? '—'
    : `${f(d.mean)} · méd ${f(d.median!)} · p95 ${f(d.p95!)} · min ${f(d.min!)} · max ${f(d.max!)}${d.sd !== null ? ` · σ ${f(d.sd)}` : ''}`;
const ci = (p: PairedStat, f: (v: number) => string) =>
  p.ci95 ? `IC95 [${f(p.ci95[0])} ; ${f(p.ci95[1])}]${p.significant ? ' ✱' : ''}` : 'IC95 : n < 3';

/** Horizontal bar; hatched = not a measurement. */
function Bar({
  value,
  max,
  tone = 'bg-accent',
  hatched = false,
}: {
  value: number | null;
  max: number;
  tone?: string;
  hatched?: boolean;
}) {
  const w = value === null || max <= 0 ? 0 : Math.max(2, Math.min(100, (Math.abs(value) / max) * 100));
  return (
    <span className="inline-block h-2 w-full overflow-hidden rounded bg-hover align-middle">
      <span
        className={cx('block h-full', tone, hatched && 'opacity-50')}
        style={{
          width: `${w}%`,
          backgroundImage: hatched
            ? 'repeating-linear-gradient(45deg,transparent 0 3px,rgba(255,255,255,.55) 3px 5px)'
            : undefined,
        }}
      />
    </span>
  );
}
const VCOLOR: Record<Variant, string> = { off: 'bg-faint', pre: 'bg-info', live: 'bg-accent', full: 'bg-ok' };

function Chart({
  title,
  rows,
  fmt,
  note,
}: {
  title: string;
  rows: { label: string; v: Variant | null; value: number | null; text?: string; hatched?: boolean }[];
  fmt: (v: number) => string;
  note?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.value ?? 0)));
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="mb-1 text-[12px] font-medium">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[84px_1fr_92px] items-center gap-2 text-[11.5px]">
            <span className="text-faint">{r.label}</span>
            <Bar value={r.value} max={max} tone={r.v ? VCOLOR[r.v] : 'bg-accent'} hatched={r.hatched} />
            <span className="text-right tabular-nums">
              {r.text ?? (r.value === null ? NM : fmt(r.value))}
            </span>
          </div>
        ))}
      </div>
      {note && <div className="mt-1 text-[10.5px] text-faint">{note}</div>}
    </div>
  );
}

function DiagnosisCard({ d }: { d: Diagnosis }) {
  return (
    <div className="rounded-lg border border-line p-2 text-[12px]">
      <div className="mb-1 font-medium">{d.title}</div>
      <ul className="mb-2 space-y-0.5">
        {d.lines.map((l, i) => (
          <li key={i}>• {l}</li>
        ))}
      </ul>
      <table className="w-full text-[11.5px]">
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-0.5 pr-2 whitespace-pre">{r.label}</td>
              <td className="py-0.5 pr-2 text-right tabular-nums">
                {r.label.includes('COST') ? `${r.value.toFixed(6)} $` : r.value.toLocaleString('fr-FR')}
              </td>
              <td className="w-24 py-0.5 pr-2">
                <Bar value={r.share * 100} max={100} hatched={r.tag !== 'MEASURED'} />
              </td>
              <td className="py-0.5 text-right tabular-nums">{Math.round(r.share * 1000) / 10} %</td>
              <td className="py-0.5 pl-2">
                <Tag l={r.tag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScienceTab() {
  const log = useStore((s) => s.jevLog);
  const models = useStore((s) => s.models);
  const setView = useStore((s) => s.setView);
  const toast = useStore((s) => s.toast);
  const sci: Science = useMemo(() => analyze(log), [log]);
  const [sel, setSel] = useState<string[]>(BENCH.map((b) => b.key));
  const [variants, setVariants] = useState<JevVariant[]>(['off', 'pre', 'live', 'full']);
  const [reps, setReps] = useState(3);
  const [protocol, setProtocol] = useState<'fixed-model' | 'free-routing'>('fixed-model');
  const cheap = useMemo(
    () =>
      models
        .filter((m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id))
        .sort((a, b) => (a.inputPrice ?? 0) - (b.inputPrice ?? 0)),
    [models],
  );
  const [model, setModel] = useState('');
  const fixedModel = model || cheap[0]?.id || '';
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<BenchRun[]>([]);
  const stop = useRef({ stop: false });
  const [diagId, setDiagId] = useState('');
  const cfg = jevSettings();
  const setCfg = (p: Record<string, unknown>) =>
    useStore.getState().patchSettings({ jev: { ...useStore.getState().settings.jev, ...p } });

  const runs = sel.length * variants.length * reps;
  const start = async () => {
    if (
      !confirm(
        `Lancer l’expérience appariée : ${sel.length} tâche(s) × ${variants.length} variante(s) × ${reps} répétition(s) = ${runs} exécutions RÉELLES facturées sur votre clé OpenRouter${protocol === 'fixed-model' ? ` (modèle imposé : ${fixedModel})` : ' (routage libre)'}.\n\nLe coût dépend du modèle ; vous pouvez arrêter à tout moment.`,
      )
    )
      return;
    stop.current.stop = false;
    setLast([]);
    try {
      const r = await runBench(sel, (m) => setBusy(m), stop.current, {
        variants,
        reps,
        protocol,
        model: fixedModel,
      });
      setLast(r);
      toast('ok', `Expérience terminée : ${r.length} exécution(s).`);
    } catch (e) {
      toast('err', (e as Error).message);
    }
    setBusy(null);
    setView('jev');
  };

  const present = sci.variantsPresent;
  const V = (v: Variant): VariantSci | undefined => sci.byVariant[v];
  const off = V('off');
  const categories = [...new Set(BENCH.map((b) => b.category))];
  const heavy = [...log].sort((a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut)).slice(0, 40);
  const diagEntry: JevLogEntry | undefined = log.find((e) => e.id === diagId) ?? heavy[0];
  const report = useMemo(() => reportOf(sci), [sci]);
  const obs = sci.observational;
  const obsStat = (jev: boolean) => {
    const es = obs.filter((e) => e.jev === jev);
    return {
      n: es.length,
      tokens: es.length ? es.reduce((a, e) => a + e.tokensIn + e.tokensOut, 0) / es.length : null,
      cost: es.length
        ? es.reduce((a, e) => a + (e.acct?.totalCost ?? e.cost + e.jevCost), 0) / es.length
        : null,
      latency: es.length ? es.reduce((a, e) => a + e.latencyMs, 0) / es.length : null,
    };
  };

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      thresholds: SCIENCE,
      science: { ...sci, observational: undefined },
      runs: log.filter((e) => e.experiment).map((e) => ({ ...e, checkpoints: undefined })),
    };
    download('jev-validation.json', redact(JSON.stringify(payload, null, 2)), 'application/json');
  };

  return (
    <div className="space-y-5" data-testid="science">
      <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
        <div className="mb-1 flex flex-wrap items-center gap-2 font-medium">
          JEV SCIENTIFIC VALIDATION <Tag l="MEASURED" /> <Tag l="CALCULATED" /> <Tag l="PROJECTED" />{' '}
          <Tag l="INSUFFICIENT_SAMPLE" /> <Tag l="NON_COMPARABLE" />
        </div>
        <div className="text-muted">
          Expérience contrôlée : pour chaque tâche et chaque répétition (un <b>benchmark_group_id</b>), le
          même prompt, le même espace de travail, les mêmes outils disponibles et le même protocole de modèle
          sont exécutés en OFF / PRE / LIVE / FULL, dans un ordre mélangé. Aucune économie n’est déduite de
          missions différentes. Le coût de JEV (ses propres appels) est comptabilisé séparément du coût de la
          mission. Conclusions seulement à partir de n ≥ {SCIENCE.minPairs} paires valides.
        </div>
      </div>

      {/* 1 — launcher */}
      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 text-[13px] font-medium">Lancer l’expérience appariée</div>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {VARIANTS.map((v) => (
            <label key={v} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={variants.includes(v)}
                disabled={v === 'off'}
                onChange={(e) =>
                  setVariants(VARIANTS.filter((x) => (x === v ? e.target.checked : variants.includes(x))))
                }
                aria-label={`Variante ${VARIANT_LABEL[v]}`}
              />
              {VARIANT_LABEL[v]}
              {v === 'off' && <span className="text-faint">(référence, obligatoire)</span>}
            </label>
          ))}
          <label className="flex items-center gap-1">
            Répétitions
            <Select
              value={String(reps)}
              onChange={(v) => setReps(Number(v))}
              options={[1, 3, 5, 10].map((n) => ({ value: String(n), label: String(n) }))}
              title="Répétitions par condition"
            />
          </label>
          <label className="flex items-center gap-1">
            Protocole
            <Select
              value={protocol}
              onChange={(v) => setProtocol(v as typeof protocol)}
              options={[
                { value: 'fixed-model', label: 'Modèle imposé (isole l’effet JEV)' },
                { value: 'free-routing', label: 'Routage libre (modèle pouvant différer : NON COMPARABLE)' },
              ]}
              title="Protocole de modèle"
            />
          </label>
          {protocol === 'fixed-model' && (
            <label className="flex items-center gap-1">
              Modèle
              <Select
                value={fixedModel}
                onChange={setModel}
                options={cheap
                  .slice(0, 60)
                  .map((m) => ({ value: m.id, label: `${m.id} (${m.inputPrice}$/M)` }))}
                title="Modèle imposé"
              />
            </label>
          )}
        </div>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
          {BENCH.map((b) => (
            <label key={b.key} className="flex items-center gap-1" title={b.text}>
              <input
                type="checkbox"
                checked={sel.includes(b.key)}
                onChange={(e) => setSel(e.target.checked ? [...sel, b.key] : sel.filter((k) => k !== b.key))}
                aria-label={b.label}
              />
              {b.label} <span className="text-faint">· {CATEGORY_LABEL[b.category]}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(busy) || !sel.length || (!fixedModel && protocol === 'fixed-model')}
            onClick={() => void start()}
          >
            <Play size={13} /> Lancer ({runs} exécutions)
          </Button>
          {busy && (
            <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter après l’exécution
            </Button>
          )}
          {busy && <span className="text-[12px] text-info">{busy}</span>}
          {last.length > 0 && (
            <span className="text-[12px] text-muted">
              Dernier lancement : {last.filter((r) => r.ok).length}/{last.length} réussites.
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-faint">
          Rien ne s’exécute sans ce bouton. Les sessions restent visibles dans le Chat (« [bench …] »).
        </div>
      </div>

      {/* 2 — verdict */}
      <div className="rounded-xl border border-line p-3" data-testid="verdict">
        <div className="mb-1 flex items-center gap-2 text-[13px] font-medium">
          Diagnostic objectif{' '}
          <Badge
            tone={
              sci.verdict === 'A'
                ? 'ok'
                : sci.verdict === 'D'
                  ? 'err'
                  : sci.verdict === 'E'
                    ? 'neutral'
                    : 'warn'
            }
          >
            {VERDICT_TEXT[sci.verdict]}
          </Badge>
        </div>
        <ul className="mb-2 space-y-0.5 text-[12.5px]">
          {sci.verdictWhy.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
          <li>• Recommandation : {sci.recommendation}</li>
        </ul>
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <Toggle
            checked={cfg.adaptivePolicy}
            onChange={(v) => setCfg({ adaptivePolicy: v })}
            label="Politique adaptative : appliquer le niveau recommandé par catégorie (uniquement là où l’échantillon est suffisant)"
          />
          <label className="flex items-center gap-1">
            Seuil de ROI de l’auto-downgrade
            <Input
              type="number"
              step="0.1"
              min={0}
              value={cfg.minRoi}
              onChange={(e) => setCfg({ minRoi: Math.max(0, Number(e.target.value) || 0) })}
              className="w-20"
              aria-label="Seuil de ROI"
            />
          </label>
        </div>
        <div className="mt-1 text-[11px] text-faint">
          Auto-downgrade JEV-3 → 2 → 1 → 0 : un niveau est retiré quand ce que JEV a économisé sur la mission
          (mesuré) est inférieur à son propre coût × ce seuil.
        </div>
      </div>

      {/* 3 — sample */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8" data-testid="sample">
        {[
          ['Expériences', sci.experiments],
          ['Tâches', sci.tasks],
          ['Répétitions', sci.repetitions],
          ['Groupes appariés', sci.groups],
          ['Groupes complets', sci.completeGroups],
          ['Paires valides (n)', sci.validPairs],
          ['Non comparables', sci.nonComparable.length],
          ['Missions réussies', Object.values(sci.byVariant).reduce((a, v) => a + (v?.successes ?? 0), 0)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-line p-2">
            <div className="text-[11px] text-faint">{k}</div>
            <div className="text-[15px] font-medium tabular-nums">{String(v)}</div>
          </div>
        ))}
      </div>

      {/* 4 — main table */}
      <div className="overflow-x-auto" data-testid="sci-main">
        <div className="mb-1 flex items-center gap-2 text-[13px] font-medium">
          METRIC | OFF | PRE | LIVE | FULL{' '}
          <span className="text-[11.5px] font-normal text-faint">
            (missions appariées uniquement ; n par colonne)
          </span>
        </div>
        {!off || off.n === 0 ? (
          <div className="text-[12.5px] text-muted">
            <Tag l="INSUFFICIENT_SAMPLE" /> Aucune expérience appariée enregistrée : lancez-en une ci-dessus.
            Aucun chiffre n’est affiché sans mesure.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className={th}>Métrique</th>
                {present.map((v) => (
                  <th key={v} className={th}>
                    {VARIANT_LABEL[v]} <span className="font-normal">(n = {V(v)?.n ?? 0})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Tokens / mission (JEV inclus)', (x: VariantSci) => descCell(x.tokens, fmtTokens)],
                  [
                    'Coût / mission (JEV inclus)',
                    (x: VariantSci) => descCell(x.cost, (v) => `${v.toFixed(5)}`),
                  ],
                  ['Coût / mission réussie', (x: VariantSci) => usd(x.costPerSuccess)],
                  [
                    'Tokens / mission réussie',
                    (x: VariantSci) => num(x.tokensPerSuccess, (v) => fmtTokens(Math.round(v))),
                  ],
                  ['Latence', (x: VariantSci) => descCell(x.latency, fmtDuration)],
                  [
                    'Qualité (même scorer partout)',
                    (x: VariantSci) =>
                      x.quality.n ? `${x.quality.mean!.toFixed(1)} (n = ${x.quality.n})` : NM,
                  ],
                  [
                    'Taux de réussite',
                    (x: VariantSci) => `${pct(x.successRate)} (${x.successes}/${x.judged})`,
                  ],
                  [
                    'Overhead JEV (part du coût)',
                    (x: VariantSci) =>
                      `${num(x.jevCostShare, (v) => `${(v * 100).toFixed(2)} %`)} · ${x.jevCost.toFixed(6)} $`,
                  ],
                  ['Qualité / $', (x: VariantSci) => num(x.qualityPerUsd, (v) => v.toFixed(0), NM)],
                  [
                    'Qualité / 1 000 tokens',
                    (x: VariantSci) => num(x.qualityPer1kTokens, (v) => v.toFixed(2), NM),
                  ],
                ] as [string, (x: VariantSci) => string][]
              ).map(([label, f]) => (
                <tr key={label} className="border-t border-line">
                  <td className={cx(td, 'font-medium')}>{label}</td>
                  {present.map((v) => (
                    <td key={v} className={td}>
                      {V(v) ? f(V(v)!) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className={cx(td, 'font-medium')}>COGNITIVE EFFICIENCY SCORE (OFF = 100)</td>
                {present.map((v) => (
                  <td key={v} className={td}>
                    {v === 'off' ? '100' : num(sci.deltas[v]?.ces?.score, String, NM)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* 5 — deltas */}
      {off && off.n > 0 && (
        <div className="overflow-x-auto" data-testid="sci-delta">
          <div className="mb-1 text-[13px] font-medium">
            DELTA VS OFF — différences appariées (variante − OFF, même tâche et même répétition)
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className={th}>Variante</th>
                <th className={th}>Paires (n)</th>
                <th className={th}>Δ tokens / mission</th>
                <th className={th}>Δ coût / mission</th>
                <th className={th}>Δ qualité</th>
                <th className={th}>Δ réussite (pts)</th>
                <th className={th}>Δ latence</th>
                <th className={th}>Δ coût / mission réussie</th>
                <th className={th}>Jugement</th>
              </tr>
            </thead>
            <tbody>
              {present
                .filter((v) => v !== 'off')
                .map((v) => {
                  const d = sci.deltas[v];
                  if (!d) return null;
                  const insuff = d.label === 'INSUFFICIENT_SAMPLE';
                  return (
                    <tr key={v} className="border-t border-line">
                      <td className={cx(td, 'font-medium')}>{VARIANT_LABEL[v]}</td>
                      <td className={td}>
                        {d.pairs} <Tag l={d.label} />
                      </td>
                      <td className={td}>
                        {sgn(d.dTokens.meanDelta, (x) => fmtTokens(Math.round(x)))}
                        <div className="text-[10.5px] text-faint">
                          {ci(d.dTokens, (x) => String(Math.round(x)))} · ↓{d.dTokens.lower} ↑
                          {d.dTokens.higher}
                        </div>
                      </td>
                      <td className={td}>
                        {sgn(d.dCost.meanDelta, (x) => `${x.toFixed(5)} $`)}
                        <div className="text-[10.5px] text-faint">{ci(d.dCost, (x) => x.toFixed(5))}</div>
                      </td>
                      <td className={td}>
                        {d.dQuality.n ? sgn(d.dQuality.meanDelta, (x) => x.toFixed(1)) : NM}
                        {d.dQuality.n ? (
                          <div className="text-[10.5px] text-faint">n = {d.dQuality.n}</div>
                        ) : null}
                      </td>
                      <td className={td}>
                        {sgn(d.dSuccess.meanDelta === null ? null : d.dSuccess.meanDelta * 100, (x) =>
                          x.toFixed(0),
                        )}
                      </td>
                      <td className={td}>{sgn(d.dLatency.meanDelta, (x) => fmtDuration(x))}</td>
                      <td className={td}>
                        {insuff
                          ? '—'
                          : sgn(
                              d.costPerSuccessChange === null ? null : d.costPerSuccessChange * 100,
                              (x) => `${x.toFixed(0)} %`,
                            )}
                      </td>
                      <td className={td}>
                        <Badge
                          tone={
                            d.judgement === 'improves' ? 'ok' : d.judgement === 'worsens' ? 'err' : 'neutral'
                          }
                        >
                          {d.judgement === 'improves'
                            ? 'améliore'
                            : d.judgement === 'worsens'
                              ? 'détériore'
                              : d.judgement === 'neutral'
                                ? 'neutre'
                                : 'insuffisant'}
                        </Badge>
                        <div className="text-[10.5px] text-faint">{d.reasons.join(' ; ')}</div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-faint">
            ✱ = l’intervalle de confiance à 95 % de la différence moyenne exclut 0 (Student, paires
            appariées). Seuils : neutre ±{SCIENCE.neutralBand * 100} % du coût / mission réussie ; tolérance
            réussite {SCIENCE.successTolerance * 100} pts ; qualité {SCIENCE.qualityTolerance} pts.
          </div>
        </div>
      )}

      {/* 6 — economics */}
      {present.some((v) => v !== 'off' && sci.deltas[v]?.economics) && (
        <div className="overflow-x-auto" data-testid="sci-econ">
          <div className="mb-1 text-[13px] font-medium">
            Économie : tokens et argent, JEV séparé de la mission (moyennes par mission, paires valides)
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className={th}>Grandeur</th>
                {present
                  .filter((v) => v !== 'off')
                  .map((v) => (
                    <th key={v} className={th}>
                      {VARIANT_LABEL[v]}
                    </th>
                  ))}
                <th className={th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [
                    'TOKENS_BASELINE (OFF)',
                    (e) => num(e.tokensBaseline, (x) => String(Math.round(x))),
                    'MEASURED',
                  ],
                  [
                    'TOKENS_ACTUAL (mission, JEV exclu)',
                    (e) => num(e.tokensActual, (x) => String(Math.round(x))),
                    'MEASURED',
                  ],
                  [
                    'TOKENS_JEV_OVERHEAD (appels JEV + corrections)',
                    (e) => String(Math.round(e.tokensJevOverhead)),
                    'MEASURED',
                  ],
                  [
                    '  dont TOKENS_ROUTING_ADDED (JEV-1/2/3)',
                    (e) => String(Math.round(e.tokensRoutingAdded)),
                    'MEASURED',
                  ],
                  [
                    '  dont TOKENS_CORRECTION_ADDED',
                    (e) => String(Math.round(e.tokensCorrectionAdded)),
                    'MEASURED',
                  ],
                  [
                    'TOKENS_TOOL_SAVED (définitions d’outils)',
                    (e) => sgn(e.toolSaved, (x) => String(Math.round(x))),
                    'CALCULATED',
                  ],
                  [
                    'TOKENS_CONTEXT_SAVED (système + historique + résultats)',
                    (e) => sgn(e.contextSaved, (x) => String(Math.round(x))),
                    'CALCULATED',
                  ],
                  [
                    'NET_TOKEN_SAVING = BASELINE − ACTUAL',
                    (e) => sgn(e.netTokenSaving, (x) => String(Math.round(x))),
                    'MEASURED',
                  ],
                  [
                    'JEV_NET_TOKEN_IMPACT = NET_TOKEN_SAVING − tokens consommés par JEV',
                    (e) => sgn(e.jevNetTokenImpact, (x) => String(Math.round(x))),
                    'MEASURED',
                  ],
                  ['COÛT mission OFF', (e) => usd(e.costBaseline), 'MEASURED'],
                  ['COÛT mission variante (JEV exclu)', (e) => usd(e.costActual), 'MEASURED'],
                  ['JEV_GROSS_COST (coût de JEV lui-même)', (e) => usd(e.jevGrossCost, 6), 'MEASURED'],
                  [
                    'JEV_SAVINGS_VALUE (économie sur la mission)',
                    (e) => sgn(e.jevSavingsValue, (x) => usd(x)),
                    'MEASURED',
                  ],
                  [
                    'JEV_NET_VALUE = SAVINGS − COST OF JEV',
                    (e) => sgn(e.jevNetValue, (x) => usd(x)),
                    'MEASURED',
                  ],
                  [
                    'JEV_ROI = SAVINGS / COST OF JEV',
                    (e) => (e.jevRoi === null ? 'n/a' : e.jevRoi.toFixed(2)),
                    'MEASURED',
                  ],
                ] as [
                  string,
                  (e: NonNullable<Science['deltas'][Variant]>['economics'] & object) => string,
                  DataLabel,
                ][]
              ).map(([label, f, tag]) => (
                <tr key={label} className="border-t border-line">
                  <td className={cx(td, 'whitespace-pre')}>{label}</td>
                  {present
                    .filter((v) => v !== 'off')
                    .map((v) => {
                      const e = sci.deltas[v]?.economics;
                      return (
                        <td key={v} className={td}>
                          {e ? f(e) : '—'}
                        </td>
                      );
                    })}
                  <td className={td}>
                    <Tag l={tag} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className={td}>Lecture du ROI</td>
                {present
                  .filter((v) => v !== 'off')
                  .map((v) => {
                    const e = sci.deltas[v]?.economics;
                    return (
                      <td key={v} className={cx(td, e?.negative && 'text-err')}>
                        {e ? (e.negative ? `⚠ économiquement NÉGATIF — ${e.roiNote}` : e.roiNote) : '—'}
                      </td>
                    );
                  })}
                <td />
              </tr>
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-faint">
            « Économie » = coût OFF − coût de la mission avec la variante, hors appels de JEV ; « coût de JEV
            » = ses seuls appels (JEV-1, JEV-2, JEV-3). Avec le protocole « modèle imposé », la différence ne
            vient pas d’un changement de modèle. TOOL / CONTEXT SAVED sont des estimations (caractères / 3,8)
            : ils ne sont pas additionnés au total mesuré.
          </div>
        </div>
      )}

      {/* 7 — decomposition + charts */}
      {off && off.n > 0 && (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="sci-charts">
          <Chart
            title="Coût moyen par mission (JEV inclus)"
            fmt={(v) => `${v.toFixed(5)} $`}
            rows={present.map((v) => ({ label: VARIANT_LABEL[v], v, value: V(v)?.cost.mean ?? null }))}
          />
          <Chart
            title="Tokens moyens par mission (JEV inclus)"
            fmt={(v) => fmtTokens(Math.round(v))}
            rows={present.map((v) => ({ label: VARIANT_LABEL[v], v, value: V(v)?.tokens.mean ?? null }))}
          />
          <Chart
            title="Qualité mesurée (même scorer partout)"
            fmt={(v) => v.toFixed(1)}
            rows={present.map((v) => ({ label: VARIANT_LABEL[v], v, value: V(v)?.quality.mean ?? null }))}
          />
          <Chart
            title="Coût par mission réussie"
            fmt={(v) => `${v.toFixed(5)} $`}
            rows={present.map((v) => ({ label: VARIANT_LABEL[v], v, value: V(v)?.costPerSuccess ?? null }))}
          />
          <Chart
            title="ROI de JEV (économie / coût de JEV) — n/a si JEV est gratuit"
            fmt={(v) => v.toFixed(2)}
            rows={present
              .filter((v) => v !== 'off')
              .map((v) => ({
                label: VARIANT_LABEL[v],
                v,
                value: sci.deltas[v]?.economics?.jevRoi ?? null,
                text: sci.deltas[v]?.economics?.jevRoi == null ? 'n/a' : undefined,
              }))}
          />
          <Chart
            title="Coût de JEV vs économies générées (par mission)"
            fmt={(v) => `${v.toFixed(5)} $`}
            rows={present
              .filter((v) => v !== 'off')
              .flatMap((v) => [
                {
                  label: `${VARIANT_LABEL[v]} coût JEV`,
                  v: null,
                  value: sci.deltas[v]?.economics?.jevGrossCost ?? null,
                },
                {
                  label: `${VARIANT_LABEL[v]} économie`,
                  v: v as Variant,
                  value: Math.max(0, sci.deltas[v]?.economics?.jevSavingsValue ?? 0),
                },
              ])}
          />
          <Chart
            title="Latence moyenne"
            fmt={(v) => fmtDuration(v)}
            rows={present.map((v) => ({ label: VARIANT_LABEL[v], v, value: V(v)?.latency.mean ?? null }))}
          />
          <div className="rounded-lg border border-line p-2">
            <div className="mb-1 text-[12px] font-medium">
              Décomposition du coût par variante (moyenne / mission)
            </div>
            <table className="w-full text-[11.5px]">
              <thead>
                <tr>
                  <th className={th}>Poste</th>
                  {present.map((v) => (
                    <th key={v} className={th}>
                      {VARIANT_LABEL[v]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['LLM_COST', 'llmCost'],
                    ['JEV_COST', 'jevCost'],
                    ['CORRECTION_COST', 'correctionCost'],
                    ['TOOL_COST', 'toolCost'],
                  ] as const
                ).map(([l, k]) => (
                  <tr key={l} className="border-t border-line">
                    <td className={td}>{l}</td>
                    {present.map((v) => (
                      <td key={v} className={td}>
                        {V(v) && V(v)!.n ? (V(v)![k] / V(v)!.n).toFixed(6) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className={td}>QA_COST</td>
                  {present.map((v) => (
                    <td key={v} className={td}>
                      0 (QA locale)
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-line font-medium">
                  <td className={td}>TOTAL</td>
                  {present.map((v) => (
                    <td key={v} className={td}>
                      {V(v) && V(v)!.n ? (V(v)!.totalCost / V(v)!.n).toFixed(6) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8 — categories */}
      <div className="overflow-x-auto" data-testid="sci-cat">
        <div className="mb-1 text-[13px] font-medium">Analyse par type de tâche</div>
        {!sci.categories.length ? (
          <div className="text-[12.5px] text-muted">
            <Tag l="INSUFFICIENT_SAMPLE" /> Aucune catégorie mesurée.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className={th}>Catégorie</th>
                <th className={th}>Groupes (n)</th>
                {present.map((v) => (
                  <th key={v} className={th}>
                    {VARIANT_LABEL[v]} : coût / réussie · succès · qualité
                  </th>
                ))}
                <th className={th}>Meilleure stratégie</th>
                <th className={th}>ROI JEV</th>
              </tr>
            </thead>
            <tbody>
              {sci.categories.map((c) => (
                <tr key={c.category} className="border-t border-line">
                  <td className={cx(td, 'font-medium')}>{CATEGORY_LABEL[c.category] ?? c.category}</td>
                  <td className={td}>
                    {c.groups} <Tag l={c.label} />
                  </td>
                  {present.map((v) => {
                    const x = c.byVariant[v];
                    return (
                      <td key={v} className={td}>
                        {x
                          ? `${usd(x.costPerSuccess, 5)} · ${pct(x.successRate)} · ${x.quality.n ? x.quality.mean!.toFixed(0) : NM}`
                          : '—'}
                      </td>
                    );
                  })}
                  <td className={td}>
                    {c.best ? (
                      <Badge tone={c.best === 'off' ? 'neutral' : 'ok'}>{VARIANT_LABEL[c.best]}</Badge>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                    <div className="text-[10.5px] text-faint">{c.bestReason}</div>
                  </td>
                  <td className={td}>
                    {Object.entries(c.deltas)
                      .map(
                        ([v, d]) =>
                          `${VARIANT_LABEL[v as Variant]} ${d.roi === null ? 'n/a' : d.roi.toFixed(1)}`,
                      )
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-1 text-[11px] text-faint">
          Catégories couvertes par le benchmark : {categories.map((c) => CATEGORY_LABEL[c]).join(', ')}. Une
          recommandation exige au moins {SCIENCE.minPairs} groupes dans la catégorie.
        </div>
      </div>

      {/* 9 — CES */}
      <div className="rounded-xl border border-line p-3 text-[12px]" data-testid="sci-ces">
        <div className="mb-1 text-[13px] font-medium">
          COGNITIVE EFFICIENCY SCORE — formule visible, composantes consultables
        </div>
        <div className="mb-2 text-muted">{CES_FORMULA}</div>
        <table className="w-full text-[11.5px]">
          <thead>
            <tr>
              <th className={th}>Composante</th>
              <th className={th}>Poids</th>
              {present
                .filter((v) => v !== 'off')
                .map((v) => (
                  <th key={v} className={th}>
                    Ratio {VARIANT_LABEL[v]} (&gt; 1 = mieux que OFF)
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(SCIENCE.ces).map(([k, w]) => (
              <tr key={k} className="border-t border-line">
                <td className={td}>
                  {sci.deltas.pre?.ces?.parts.find((p) => p.key === k)?.label ??
                    sci.deltas.live?.ces?.parts.find((p) => p.key === k)?.label ??
                    sci.deltas.full?.ces?.parts.find((p) => p.key === k)?.label ??
                    k}
                </td>
                <td className={td}>{w}</td>
                {present
                  .filter((v) => v !== 'off')
                  .map((v) => {
                    const p = sci.deltas[v]?.ces?.parts.find((x) => x.key === k);
                    return (
                      <td key={v} className={td}>
                        {p?.ratio == null ? NM : p.ratio.toFixed(3)}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 text-faint">
          Le score global ne remplace jamais les métriques brutes ci-dessus.
        </div>
      </div>

      {/* 10 — diagnostics */}
      <div data-testid="sci-diag">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] font-medium">
          Diagnostic d’une mission : pourquoi ces tokens, pourquoi ce coût ?
          <Select
            value={diagEntry?.id ?? ''}
            onChange={setDiagId}
            options={heavy.map((e) => ({
              value: e.id,
              label: `${(e.tokensIn + e.tokensOut).toLocaleString('fr-FR')} tok · ${(e.acct?.totalCost ?? e.cost + e.jevCost).toFixed(4)} $ · ${e.mission.slice(0, 50)}`,
            }))}
            title="Mission à diagnostiquer"
          />
        </div>
        {diagEntry ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <DiagnosisCard d={explainTokens(diagEntry)} />
            <DiagnosisCard d={explainCost(diagEntry)} />
          </div>
        ) : (
          <div className="text-[12.5px] text-muted">Aucune mission enregistrée.</div>
        )}
      </div>

      {/* 11 — quality of the data */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-line p-2 text-[12px]" data-testid="sci-nc">
          <div className="mb-1 font-medium">
            Paires NON COMPARABLES ({sci.nonComparable.length}) <Tag l="NON_COMPARABLE" />
          </div>
          {sci.nonComparable.length ? (
            <ul className="space-y-0.5">
              {sci.nonComparable.slice(0, 12).map((n, i) => (
                <li key={i}>
                  {n.taskId} {VARIANT_LABEL[n.variant]} : {n.reasons.join(' ; ')}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted">
              Aucune : toutes les variables contrôlées sont identiques entre OFF et les variantes.
            </div>
          )}
        </div>
        <div className="rounded-lg border border-line p-2 text-[12px]">
          <div className="mb-1 font-medium">Dérive économique et anomalies</div>
          {sci.anomalies.length ? (
            <ul className="space-y-0.5">
              {sci.anomalies.map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          ) : (
            <div className="text-muted">Aucune anomalie détectée sur les paires valides.</div>
          )}
        </div>
      </div>

      {/* 12 — observational */}
      <div className="rounded-lg border border-dashed border-line p-2 text-[12px]" data-testid="sci-obs">
        <div className="mb-1 flex items-center gap-2 font-medium">
          Observational Data — missions non appariées <Tag l="NON_COMPARABLE" />
        </div>
        <div className="mb-1 text-muted">
          Ces missions sont des tâches différentes : aucune économie ni variation n’en est déduite. Ce tableau
          décrit seulement ce qui a été exécuté.
        </div>
        <table className="w-full max-w-[640px] text-[11.5px]">
          <thead>
            <tr>
              <th className={th}>Population</th>
              <th className={th}>Missions</th>
              <th className={th}>Tokens moy.</th>
              <th className={th}>Coût moy.</th>
              <th className={th}>Latence moy.</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Sans JEV', obsStat(false)],
              ['Avec JEV', obsStat(true)],
            ].map(([l, x]) => {
              const o = x as ReturnType<typeof obsStat>;
              return (
                <tr key={String(l)} className="border-t border-line">
                  <td className={td}>{String(l)}</td>
                  <td className={td}>{o.n}</td>
                  <td className={td}>{num(o.tokens, (v) => fmtTokens(Math.round(v)))}</td>
                  <td className={td}>{num(o.cost, (v) => fmtCost(v))}</td>
                  <td className={td}>{num(o.latency, (v) => fmtDuration(v))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 13 — report */}
      <div className="rounded-xl border border-line p-3" data-testid="sci-report">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] font-medium">
          <FlaskConical size={14} /> Rapport technique
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(report.join('\n'));
              toast('ok', 'Rapport copié.');
            }}
          >
            <Copy size={13} /> Copier
          </Button>
          <Button size="sm" variant="ghost" onClick={exportJson}>
            <Download size={13} /> Exporter les mesures (JSON)
          </Button>
        </div>
        <ul className="space-y-1 text-[12px]">
          {report.map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
        </ul>
        <div className="mt-1 text-[11px] text-faint">
          L’export ne contient aucune clé API (les clés ne sont jamais écrites dans le journal ; l’export est
          de plus filtré).
        </div>
      </div>
    </div>
  );
}
