// CHAMPION SCIENCE LAB — Champion ↔ Challenger ↔ Premium-reference scientific lab.
// Every figure comes from the REAL JEV_LOG through the lab engine; with too little data the screen says
// INSUFFICIENT SAMPLE / N/A. The 18-step scenario is SIMULATED, runs in a throw-away state and is never persisted.
import { useMemo, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Badge, Button, Input, Select, Tabs, Toggle } from '../../web/components/ui';
import { useStore } from '../lib/store';
import { apprenticeSettings, decisionCache, labRevision } from '../lib/apprentice';
import { runChampionExperiment } from '../lib/fabricRun';
import { CF_CATEGORIES, CF_LABEL, cfBenchTasks } from '../../server/jev/fabric/cfbench';
import { freePool } from '../../server/jev/fabric/council';
import { DEFAULT_LAB, type ApprenticeSettings, type LabSettings } from '../../server/jev/apprentice/types';
import { EMPTY_LAB, isReal } from '../../server/jev/apprentice/lab';
import {
  chartPoints,
  costIntelligence,
  expertiseCube,
  labKpis,
  labRows,
  type CellStatus,
  type ChartPoint,
} from '../../server/jev/apprentice/labView';
import { runLabScenario, A, B } from '../../server/jev/apprentice/labScenario';
import { detectFailurePatterns } from '../../server/jev/apprentice/failurePatterns';
import { analyzeApprentice } from '../../server/jev/apprentice/metrics';
import { Empty, NM, Section, Table, fmt } from './fabricUi';

type Sub =
  | 'overview'
  | 'experiments'
  | 'cube'
  | 'charts'
  | 'teacher'
  | 'failures'
  | 'history'
  | 'scenario'
  | 'thresholds';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'overview', label: 'Vue d’ensemble' },
  { id: 'experiments', label: 'Expériences' },
  { id: 'cube', label: 'Expertise (cube)' },
  { id: 'charts', label: 'Graphiques scientifiques' },
  { id: 'teacher', label: 'Teacher & coût' },
  { id: 'failures', label: 'Échecs & découverte' },
  { id: 'history', label: 'Historiques' },
  { id: 'scenario', label: 'Scénario IFRS9 (simulé)' },
  { id: 'thresholds', label: 'Seuils' },
];
const CELL_TONE: Record<CellStatus, 'ok' | 'warn' | 'err' | 'neutral' | 'info'> = {
  FREE: 'neutral',
  ADAPTED: 'info',
  SPECIALIST: 'ok',
  VALIDATED: 'ok',
  CHAMPION: 'ok',
  CHALLENGER: 'warn',
  DEGRADED: 'err',
  ROLLED_BACK: 'err',
};
const DEC_TONE = {
  PROMOTE: 'ok',
  KEEP_CHAMPION: 'info',
  REJECT_CHALLENGER: 'err',
  COLLECT_MORE_DATA: 'warn',
  ROLLBACK: 'err',
  CROWN: 'ok',
  NONE: 'neutral',
} as const;
const CONF_TONE = {
  INSUFFICIENT_SAMPLE: 'err',
  INDICATIVE: 'warn',
  ROBUST: 'ok',
  HIGH_CONFIDENCE: 'ok',
} as const;
const when = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : NM);
const sgn = (x: number | null | undefined, d = 1) =>
  x === null || x === undefined ? 'N/A' : `${x > 0 ? '+' : ''}${x.toFixed(d)}`;

export function ChampionSciencePanel() {
  const [sub, setSub] = useState<Sub>('overview');
  const on = useStore((x) => Boolean(x.settings.apprentice?.enabled));
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const log = useStore((x) => x.jevLog);
  const k = useMemo(() => labKpis(lab, log), [lab, log]);
  return (
    <div className="space-y-3" data-testid="champion-science">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={on ? 'ok' : 'neutral'}>
          {on ? 'CHAMPION SCIENCE ✓ ACTIVE' : 'APPRENTICE OFF — routage V5 inchangé'}
        </Badge>
        <Badge tone="info">REAL DATA ONLY</Badge>
        <span className="text-[12px] text-muted">
          Un challenger ne remplace jamais un champion sur un simple score : découverte → éligibilité → test
          contrôlé → comparaison statistique → décision. Le premium est une référence MESURÉE, pas une vérité
          absolue.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6" data-testid="champion-kpis">
        {(
          [
            ['Active Champions', k.activeChampions],
            ['Challengers', k.challengers],
            ['Promotions', k.promotions],
            ['Rollbacks', k.rollbacks],
            ['Degraded Champions', k.degradedChampions],
            ['Premium References', k.premiumReferences],
            ['Premium Calls Avoided', k.premiumCallsAvoided],
            [
              'Estimated Cost Avoided',
              k.estimatedCostAvoided === null ? NM : fmt.usd(k.estimatedCostAvoided),
            ],
            ['Teacher Investments', k.teacherInvestments],
            ['Teacher ROI', k.teacherROI === null ? NM : `${k.teacherROI.toFixed(1)}x`],
            ['Statistical Confidence', k.statisticalConfidence.replace('_', ' ')],
            ['Non-Inferiority Decisions', k.nonInferiorityDecisions],
          ] as [string, string | number][]
        ).map(([l, v]) => (
          <div key={l} className="rounded-lg border border-line p-2">
            <div className="text-[11px] uppercase tracking-wide text-faint">{l}</div>
            <div
              className="text-[15px] font-medium"
              data-testid={`kpi-${l.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      <Tabs tabs={SUBS} value={sub} onChange={setSub} className="overflow-x-auto" />
      {sub === 'overview' && <Overview />}
      {sub === 'experiments' && <Experiments />}
      {sub === 'cube' && <Cube />}
      {sub === 'charts' && <Charts />}
      {sub === 'teacher' && <TeacherCost />}
      {sub === 'failures' && <Failures />}
      {sub === 'history' && <History />}
      {sub === 'scenario' && <Scenario />}
      {sub === 'thresholds' && <LabThresholds />}
    </div>
  );
}

// ───────────────────────── overview ─────────────────────────

function Overview() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const log = useStore((x) => x.jevLog);
  const rows = useMemo(() => labRows(lab, log), [lab, log]);
  return (
    <Section
      title="Champions par famille × risque"
      hint="FAMILY / CHAMPION / CHALLENGER / N / QUALITY / SUCCESS / PREMIUM / DELTA / CONFIDENCE / DECISION / LAST TEST. Aucune ligne n’est inventée : sans champion mesuré, la table est vide."
      testId="champion-overview"
    >
      {rows.length ? (
        <Table
          testId="champion-table"
          head={[
            'FAMILY',
            'CHAMPION',
            'CHALLENGER',
            'N',
            'QUALITY',
            'SUCCESS',
            'PREMIUM',
            'DELTA',
            'CONFIDENCE',
            'DECISION',
            'LAST TEST',
          ]}
          rows={rows.map((r) => [
            <span key="f">
              {r.family} · {r.risk}
              {r.contract ? ` · ${r.contract}` : ''}
            </span>,
            r.champion ? (
              <span key="c">
                {r.champion} {r.championDegraded && <Badge tone="err">DEGRADED</Badge>}
              </span>
            ) : (
              'aucun'
            ),
            r.challenger ?? '—',
            r.n,
            r.quality === null ? NM : r.quality.toFixed(1),
            fmt.pct(r.success),
            r.premium
              ? `${r.premium.model} (${r.premium.quality?.toFixed(1) ?? 'N/A'}, n=${r.premium.n})`
              : 'N/A — non mesuré',
            r.delta === null ? 'N/A' : `${sgn(r.delta)} pts`,
            <Badge key="cf" tone={CONF_TONE[r.confidence]}>
              {r.confidence.replace('_', ' ')}
            </Badge>,
            r.decision ? (
              <span key="d" title={r.decisionReason}>
                <Badge tone={DEC_TONE[r.decision]}>{r.decision.replace(/_/g, ' ')}</Badge>
              </span>
            ) : (
              'N/A'
            ),
            when(r.lastTest),
          ])}
        />
      ) : (
        <Empty>
          Aucun champion : le lab n’a pas encore de modèle gratuit VALIDATED avec un échantillon suffisant.
          Lancez des missions avec JEV Apprentice activé (ou un benchmark) ; le lab tourne après chaque
          mission réelle.
        </Empty>
      )}
    </Section>
  );
}

// ───────────────────────── experiments ─────────────────────────

function Experiments() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const models = useStore((x) => x.models);
  const toast = useStore((x) => x.toast);
  const pool = useMemo(() => freePool(models), [models]);
  const [champ, setChamp] = useState('');
  const [chall, setChall] = useState('');
  const [cat, setCat] = useState<(typeof CF_CATEGORIES)[number]>('data');
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Awaited<ReturnType<typeof runChampionExperiment>> | null>(null);
  const stop = useRef({ stop: false });
  const tasks = useMemo(
    () =>
      cfBenchTasks()
        .filter((t) => t.category === cat)
        .slice(0, 6),
    [cat],
  );
  const recs = Object.values(lab.families)
    .flatMap((f) => f.experiments.map((e) => ({ ...e, family: f.family, risk: f.risk })))
    .sort((a, b) => b.at - a.at);
  const run = async () => {
    if (!champ || !chall || champ === chall)
      return toast('err', 'Choisissez deux modèles gratuits distincts.');
    if (
      !confirm(
        `EXPÉRIENCE RÉELLE : ${tasks.length} tâche(s) × 2 bras = ${tasks.length * 2} exécutions. Les modèles gratuits peuvent être limités en débit.`,
      )
    )
      return;
    stop.current.stop = false;
    setOut(null);
    const r = await runChampionExperiment(
      { tasks, champion: champ, challenger: chall },
      (m) => setBusy(m),
      stop.current,
    );
    setOut(r);
    setBusy(null);
    toast('ok', `Expérience terminée : ${r.status}`);
  };
  return (
    <div className="space-y-3">
      <Section
        title="runChampionChallengerExperiment()"
        hint="Mêmes tâches, même espace de travail, bras champion vs challenger appariés. Tâches non comparables (strates Task DNA différentes) ⇒ NON-COMPARABLE, rien n’est exécuté. Un challenger sans autorisation de sécurité n’est jamais appelé. L’expérience ne promeut jamais : le lab décide avec les seuils d’échantillon."
        testId="champion-experiment"
      >
        <div className="flex flex-wrap items-end gap-2 text-[12px]">
          <label>
            Champion
            <Select
              value={champ}
              onChange={(v) => setChamp(v)}
              options={[{ value: '', label: '—' }, ...pool.map((m) => ({ value: m.id, label: m.id }))]}
            />
          </label>
          <label>
            Challenger
            <Select
              value={chall}
              onChange={(v) => setChall(v)}
              options={[{ value: '', label: '—' }, ...pool.map((m) => ({ value: m.id, label: m.id }))]}
            />
          </label>
          <label>
            Catégorie
            <Select
              value={cat}
              onChange={(v) => setCat(v as typeof cat)}
              options={CF_CATEGORIES.map((c) => ({ value: c, label: CF_LABEL[c] }))}
            />
          </label>
          <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => void run()}>
            <Play size={13} /> Lancer
          </Button>
          {busy && (
            <Button size="sm" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter
            </Button>
          )}
          {busy && <span className="text-faint">{busy}</span>}
        </div>
        {out && (
          <div className="mt-2 space-y-1 text-[12.5px]" data-testid="champion-experiment-result">
            <Badge tone={out.status === 'COMPLETED' ? 'ok' : 'warn'}>{out.status}</Badge>{' '}
            {out.reasons.join(' ; ')}
            {out.evaluation && (
              <div>
                {out.evaluation.phrase} — n appariées = {out.evaluation.pairs}, Δ qualité{' '}
                {out.evaluation.deltaQuality
                  ? `${sgn(out.evaluation.deltaQuality.value)} [${sgn(out.evaluation.deltaQuality.lo)} ; ${sgn(out.evaluation.deltaQuality.hi)}]`
                  : 'N/A'}
                , effet {out.evaluation.effectLabel}, confiance {out.evaluation.confidence.replace('_', ' ')}.
                Décision : <b>{out.decision?.action.replace(/_/g, ' ')}</b> — {out.decision?.reasons[0]}
              </div>
            )}
          </div>
        )}
      </Section>
      <Section title="Expériences enregistrées (réelles)">
        {recs.length ? (
          <Table
            head={[
              'Date',
              'Famille',
              'Champion',
              'Challenger',
              'Premium',
              'Verdict',
              'Paires',
              'Δ qualité',
              'Preuve',
              'Décision',
            ]}
            rows={recs.slice(0, 60).map((e) => [
              when(e.at),
              `${e.family} · ${e.risk}`,
              e.champion,
              e.challenger,
              e.premium ?? 'N/A',
              e.verdict.replace('_', '-'),
              e.pairs,
              e.deltaQuality === null ? 'N/A' : sgn(e.deltaQuality),
              e.evidence,
              <Badge key="d" tone={DEC_TONE[e.decision]}>
                {e.decision.replace(/_/g, ' ')}
              </Badge>,
            ])}
          />
        ) : (
          <Empty>Aucune expérience : il faut au moins un champion et un challenger mesurés.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── cube ─────────────────────────

function Cube() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const log = useStore((x) => x.jevLog);
  const models = useStore((x) => x.models);
  const rows = useMemo(
    () => expertiseCube(log, lab, freePool(models), apprenticeSettings()),
    [log, lab, models],
  );
  return (
    <Section
      title="Matrice d’expertise : MODÈLE × FAMILLE × RISQUE × CONTRAT"
      hint="Statuts : FREE · ADAPTED · SPECIALIST · VALIDATED · CHAMPION · CHALLENGER · DEGRADED · ROLLED BACK. Calculés sur les missions réelles uniquement."
      testId="champion-cube"
    >
      {rows.length ? (
        <Table
          head={[
            'Modèle',
            'Famille',
            'Risque',
            'Contrat',
            'N',
            'Qualité',
            'Réussite',
            'Confiance',
            'Latence',
            'Coût total',
            'Statut',
            'Dégradation',
          ]}
          rows={rows.map((r) => [
            r.model,
            r.family,
            r.risk,
            r.contract,
            r.n,
            r.quality === null ? NM : r.quality.toFixed(1),
            fmt.pct(r.success),
            <Badge key="c" tone={CONF_TONE[r.confidence]}>
              {r.confidence.replace('_', ' ')}
            </Badge>,
            fmt.ms(r.latencyMs),
            fmt.usd(r.totalCost),
            <Badge key="s" tone={CELL_TONE[r.status]}>
              {r.status.replace('_', ' ')}
            </Badge>,
            r.degradation,
          ])}
        />
      ) : (
        <Empty>Aucune mission d’apprenti réelle : la matrice est vide (rien n’est simulé).</Empty>
      )}
    </Section>
  );
}

// ───────────────────────── charts ─────────────────────────

const COL = { Champion: '#2563eb', Challenger: '#d97706', Premium: '#7c3aed' } as const;
function Scatter({
  title,
  pts,
  x,
  y,
  xl,
  yl,
}: {
  title: string;
  pts: ChartPoint[];
  x: (p: ChartPoint) => number | null;
  y: (p: ChartPoint) => number | null;
  xl: string;
  yl: string;
}) {
  const ok = pts.filter((p) => x(p) !== null && y(p) !== null);
  const xs = ok.map((p) => x(p)!);
  const ys = ok.map((p) => y(p)!);
  const pad = (a: number[]) => {
    const lo = Math.min(...a);
    const hi = Math.max(...a);
    const d = hi - lo || Math.abs(hi) * 0.1 || 1;
    return [lo - d * 0.2, hi + d * 0.2] as const;
  };
  const [x0, x1] = pad(xs);
  const [y0, y1] = pad(ys);
  const W = 320;
  const H = 190;
  const px = (v: number) => 40 + ((v - x0) / (x1 - x0)) * (W - 60);
  const py = (v: number) => H - 30 - ((v - y0) / (y1 - y0)) * (H - 50);
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="mb-1 text-[12px] font-medium">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        <line x1={40} y1={H - 30} x2={W - 20} y2={H - 30} stroke="currentColor" opacity={0.3} />
        <line x1={40} y1={20} x2={40} y2={H - 30} stroke="currentColor" opacity={0.3} />
        <text x={W / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.7}>
          {xl}
        </text>
        <text
          x={10}
          y={H / 2}
          fontSize={10}
          fill="currentColor"
          opacity={0.7}
          transform={`rotate(-90 10 ${H / 2})`}
          textAnchor="middle"
        >
          {yl}
        </text>
        {ok.map((p) => (
          <g key={p.label}>
            <circle cx={px(x(p)!)} cy={py(y(p)!)} r={6} fill={COL[p.label]} />
            <text x={px(x(p)!) + 9} y={py(y(p)!) + 3} fontSize={10} fill="currentColor">
              {p.label} (n={p.n})
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function Charts() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const log = useStore((x) => x.jevLog);
  const keys = Object.entries(lab.families).filter(([, f]) => f.champion);
  const [key, setKey] = useState('');
  const cur = key || keys[0]?.[0] || '';
  const r = useMemo(() => (cur ? chartPoints(lab, log, cur) : null), [cur, lab, log]);
  return (
    <Section
      title="Graphiques scientifiques"
      hint="QUALITÉ vs COÛT · RÉUSSITE vs COÛT · LATENCE vs QUALITÉ. Chaque groupe doit avoir n ≥ 5 ; sinon « INSUFFICIENT SAMPLE » remplace le graphique (jamais de courbe trompeuse)."
      testId="champion-charts"
    >
      {!keys.length && <Empty>INSUFFICIENT SAMPLE : aucun champion, donc aucun graphique.</Empty>}
      {keys.length > 0 && (
        <div className="mb-2 text-[12px]">
          <Select
            value={cur}
            onChange={(v) => setKey(v)}
            options={keys.map(([k]) => ({ value: k, label: k }))}
          />
        </div>
      )}
      {r && !r.ok && <Empty>{r.reason}</Empty>}
      {r?.ok && (
        <div className="grid gap-2 md:grid-cols-3">
          <Scatter
            title="QUALITÉ vs COÛT"
            pts={r.points}
            x={(p) => p.cost}
            y={(p) => p.quality}
            xl="coût total / mission ($)"
            yl="qualité"
          />
          <Scatter
            title="RÉUSSITE vs COÛT"
            pts={r.points}
            x={(p) => p.cost}
            y={(p) => (p.success === null ? null : p.success * 100)}
            xl="coût total / mission ($)"
            yl="réussite (%)"
          />
          <Scatter
            title="LATENCE vs QUALITÉ"
            pts={r.points}
            x={(p) => p.latencyMs}
            y={(p) => p.quality}
            xl="latence (ms)"
            yl="qualité"
          />
        </div>
      )}
    </Section>
  );
}

// ───────────────────────── teacher & cost ─────────────────────────

function TeacherCost() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const log = useStore((x) => x.jevLog);
  const ci = useMemo(() => costIntelligence(log), [log]);
  const rep = useMemo(() => analyzeApprentice(log.filter(isReal)), [log]);
  const teach = [...lab.teacherHistory].reverse().slice(0, 30);
  const cache = decisionCache.stats();
  return (
    <div className="space-y-3">
      <Section
        title="Cost Intelligence — jamais « mission à 0 $ »"
        hint="Un modèle gratuit n’est pas une mission gratuite : le total inclut JEV, outils, Teacher et retries (mesurés)."
        testId="champion-cost"
      >
        <Table
          head={[
            'MODEL',
            'JEV',
            'TOOL',
            'TEACHER',
            'RETRY',
            'TOTAL',
            'COÛT / SUCCÈS',
            'COÛT / POINT QUALITÉ',
            'PREMIUM ÉVITÉ',
            'INVESTISSEMENT TEACHER',
          ]}
          rows={[
            [
              fmt.usd(ci.modelCost),
              fmt.usd(ci.jevCost),
              fmt.usd(ci.toolCost),
              fmt.usd(ci.teacherCost),
              fmt.usd(ci.retryCost),
              fmt.usd(ci.totalMissionCost),
              fmt.usd(ci.costPerSuccess),
              fmt.usd(ci.costPerQualityPoint),
              fmt.usd(ci.premiumCostAvoided),
              fmt.usd(ci.teacherInvestment),
            ],
          ]}
        />
        <div className="mt-1 text-[12px] text-faint">
          {ci.n} mission(s) d’apprenti réelles ·{' '}
          {rep.arms.length
            ? `${rep.arms.length} bras mesuré(s) dans le benchmark`
            : 'aucun benchmark Apprentice réel'}
          .
        </div>
      </Section>
      <Section title="Teacher comme investissement (décisions réelles)" testId="champion-teacher">
        {teach.length ? (
          <Table
            head={['Date', 'Famille', 'Modèle', 'Décision / raison']}
            rows={teach.map((e) => [when(e.at), `${e.family} · ${e.risk}`, e.model, e.reason])}
          />
        ) : (
          <Empty>Aucun appel Teacher enregistré par le lab.</Empty>
        )}
      </Section>
      <Section
        title="Caches de décision (mesurés)"
        hint="La clé inclut classification, risque, révision du lab et taille du journal : un cache ne contourne jamais la sécurité, la porte de risque ni une dégradation."
        testId="champion-cache"
      >
        <Table
          head={['Cache', 'Hits', 'Misses', 'Taux', 'Latence hit', 'Latence miss']}
          rows={Object.entries(cache).map(([k, v]) => [
            k,
            v.hits,
            v.misses,
            fmt.pct(v.hitRate),
            fmt.ms(v.hitMs),
            fmt.ms(v.missMs),
          ])}
        />
        <div className="mt-1 text-[12px] text-faint">Révision du lab : {labRevision(lab)}</div>
      </Section>
    </div>
  );
}

// ───────────────────────── failures & discovery ─────────────────────────

function Failures() {
  const log = useStore((x) => x.jevLog);
  const skills = useStore((x) => x.fabric.skills);
  const disc = useStore((x) => x.fabric.discovered) ?? {};
  const patterns = useMemo(() => detectFailurePatterns(log.filter(isReal), skills), [log, skills]);
  return (
    <div className="space-y-3">
      <Section
        title="Failure Patterns"
        hint="Même modèle + même famille + même erreur, au moins 3 fois ⇒ candidat Skill (testé WITH/WITHOUT avant toute promotion)."
        testId="champion-patterns"
      >
        {patterns.length ? (
          <Table
            head={['Modèle', 'Famille', 'Erreur', 'Occurrences', 'Corrections', 'Statut']}
            rows={patterns.map((p) => [
              p.model,
              p.family,
              p.errorType,
              p.count,
              p.corrections.join(', '),
              <Badge key="s" tone={p.status === 'skill_candidate' ? 'ok' : 'warn'}>
                {p.status.replace('_', ' ')}
              </Badge>,
            ])}
          />
        ) : (
          <Empty>Aucun motif d’échec (≥ 3 occurrences identiques) dans les missions réelles.</Empty>
        )}
      </Section>
      <Section
        title="Découverte de challengers"
        hint="DISCOVERED → SECURITY → CAPABILITY → HEALTH → CHALLENGER → BENCHMARK → VALIDATION → PROMOTION. Un modèle sans politique déclarée reste PUBLIC_ONLY : jamais de données sensibles."
        testId="champion-discovery"
      >
        {Object.keys(disc).length ? (
          <Table
            head={['Modèle', 'Étape', 'Périmètre données', 'Capacités', 'Santé']}
            rows={Object.values(disc).map((d) => [
              d.id,
              <Badge key="s" tone={d.stage.startsWith('REJECTED') ? 'err' : 'info'}>
                {d.stage}
              </Badge>,
              d.securityScope,
              d.capability,
              d.health,
            ])}
          />
        ) : (
          <Empty>
            Aucun modèle découvert : le pipeline s’exécute après la première mission réelle avec Apprentice
            activé.
          </Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── history ─────────────────────────

function History() {
  const lab = useStore((x) => x.fabric.lab) ?? EMPTY_LAB;
  const H: [string, typeof lab.championHistory][] = [
    ['championHistory', lab.championHistory],
    ['challengerHistory', lab.challengerHistory],
    ['promotionHistory', lab.promotionHistory],
    ['rollbackHistory', lab.rollbackHistory],
    ['benchmarkHistory', lab.benchmarkHistory],
    ['failureHistory', lab.failureHistory],
    ['teacherHistory', lab.teacherHistory],
  ];
  return (
    <div className="space-y-3" data-testid="champion-history">
      {H.map(([name, evs]) => (
        <Section key={name} title={`${name} (${evs.length})`}>
          {evs.length ? (
            <Table
              head={['Date', 'Événement', 'Clé', 'Modèle', 'De', 'Raison']}
              rows={[...evs]
                .reverse()
                .slice(0, 25)
                .map((e) => [when(e.at), e.kind, e.key, e.model, e.from ?? '—', e.reason])}
            />
          ) : (
            <Empty>Vide.</Empty>
          )}
        </Section>
      ))}
    </div>
  );
}

// ───────────────────────── scenario (SIMULATED) ─────────────────────────

export function Scenario({ focus = 'all' }: { focus?: 'all' | 'benchmark' | 'trace' | 'memory' }) {
  const [res, setRes] = useState<ReturnType<typeof runLabScenario> | null>(null);
  const title = {
    all: 'Scénario IFRS9 en 18 étapes',
    benchmark: 'Cognitive Benchmark — scénario Champion ↔ Challenger IFRS9 (simulé)',
    trace: 'Trace — étapes du moteur sur le scénario IFRS9 (simulé)',
    memory: 'Routing Memory — évolution du champion / repli / premium sur le scénario IFRS9 (simulé)',
  }[focus];
  return (
    <Section
      title={title}
      hint="SIMULATED TEST ONLY — enregistrements SYNTHÉTIQUES (graine fixe) passés dans les vrais moteurs, dans un état jetable : jamais écrits dans le JEV_LOG, jamais persistés, jamais comptés dans les statistiques de production."
      testId={focus === 'all' ? 'champion-scenario' : `champion-scenario-${focus}`}
    >
      <Button size="sm" variant="primary" onClick={() => setRes(runLabScenario())}>
        <Play size={13} /> Lancer le scénario (0 appel, 0 $)
      </Button>
      {res && (
        <>
          <div className="mt-2 text-[12px] text-muted">
            A = {A} · B = {B}. Historique champion :{' '}
            {res.state.championHistory.map((e) => e.kind).join(' → ')}
          </div>
          <ol className="mt-2 space-y-2 text-[12.5px]" data-testid="scenario-steps">
            {res.steps.map((st) => (
              <li key={st.n} className="rounded-lg border border-line p-2">
                <div className="mb-0.5 flex flex-wrap items-center gap-2 font-medium">
                  {st.title}
                  <Badge tone="neutral">SIMULATED TEST ONLY</Badge>
                  <Badge tone={st.champion ? 'ok' : 'neutral'}>champion : {st.champion ?? 'aucun'}</Badge>
                  <Badge tone="info">{st.decision.split(' — ')[0]}</Badge>
                </div>
                {(focus === 'all' || focus === 'benchmark') &&
                  st.lines.slice(1).map((l, i) => (
                    <div key={i} className="text-muted">
                      {l}
                    </div>
                  ))}
                {(focus === 'all' || focus === 'trace') && (
                  <div className="text-faint">Trace : {st.trace.join(' → ')}</div>
                )}
                {(focus === 'all' || focus === 'memory') && (
                  <div className="text-faint">
                    Mémoire de routage :{' '}
                    {st.routingMemory
                      ? `${st.routingMemory.champion ?? '—'} / repli ${st.routingMemory.fallback ?? '—'} / premium ${st.routingMemory.premium ?? '—'}`
                      : '—'}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
  );
}

// ───────────────────────── thresholds ─────────────────────────

export function LabThresholds() {
  const patch = useStore((x) => x.patchSettings);
  const cur = apprenticeSettings().lab;
  const set = (p: Partial<LabSettings>) =>
    patch({
      apprentice: {
        ...useStore.getState().settings.apprentice,
        lab: { ...apprenticeSettings().lab, ...p },
      } as Partial<ApprenticeSettings>,
    });
  const num = (label: string, k: keyof LabSettings, step: number, min: number, max: number) => (
    <label className="flex flex-col gap-0.5 text-[12px]" key={k}>
      {label}
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={cur[k] as number}
        onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<LabSettings>)}
      />
    </label>
  );
  return (
    <Section
      title="Seuils du lab (Policy Engine)"
      hint="Marge de non-infériorité, niveau de confiance, échantillons minimaux par risque, fenêtre de dégradation, cooldown. « Non-inférieur selon la marge configurée » n’est jamais « équivalent »."
      testId="champion-thresholds"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {num('Marge qualité (pts)', 'margin', 0.5, 0, 20)}
        {num('Marge réussite (0–1)', 'successMargin', 0.01, 0, 0.5)}
        {num('Confiance (0.8–0.99)', 'confidence', 0.01, 0.8, 0.99)}
        {num('Fenêtre dégradation', 'window', 1, 3, 100)}
        {num('Chute qualité dégradation (pts)', 'degradeDrop', 1, 1, 50)}
        {num('Cooldown (missions)', 'cooldown', 1, 0, 200)}
        {num('Exploration (0–1)', 'exploration', 0.01, 0, 0.3)}
        {num('Fenêtre de paires', 'pairWindow', 1, 5, 500)}
        {(['low', 'normal', 'high', 'critical'] as const).map((r) => (
          <label key={r} className="flex flex-col gap-0.5 text-[12px]">
            n min · risque {r}
            <Input
              type="number"
              min={5}
              max={500}
              value={cur.minN[r]}
              onChange={(e) => set({ minN: { ...cur.minN, [r]: Number(e.target.value) } })}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px]">
        <Toggle
          checked={cur.continuous}
          onChange={(v) => set({ continuous: v })}
          label="Apprentissage continu : mettre à jour le lab après chaque mission réelle (une mission seule ne promeut jamais)"
        />
        <Button size="sm" onClick={() => set(DEFAULT_LAB)}>
          Valeurs par défaut
        </Button>
      </div>
    </Section>
  );
}
