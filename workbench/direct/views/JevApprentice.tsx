// JEV APPRENTICE — Control Center. FREE-FIRST, QUALITY-GATED, INTELLIGENCE-OPTIMIZED.
// "JEV-ADAPTED" means INFERENCE-TIME ADAPTATION (Task DNA + skill capsule + validated examples + failure rules);
// no model weights are ever modified here. Every figure comes from the JEV_LOG; no data → N/A / INSUFFICIENT SAMPLE.
import { useMemo, useRef, useState } from 'react';
import { Download, Play, RefreshCw, Square } from 'lucide-react';
import { Badge, Button, Input, Select, Tabs, Toggle } from '../../web/components/ui';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { loadCatalog } from '../lib/llm';
import { apprenticeSettings, refreshProfileVersions } from '../lib/apprentice';
import { runApprenticeDemo } from '../lib/fabricRun';
import { addDistilled } from '../lib/fabric';
import { CF_CATEGORIES, CF_LABEL, cfBenchTasks } from '../../server/jev/fabric/cfbench';
import { freePool } from '../../server/jev/fabric/council';
import { distillSkills } from '../../server/jev/fabric/distill';
import {
  DEFAULT_APPRENTICE,
  DEFAULT_WEIGHTS,
  type ApprenticeSettings,
  type Risk,
} from '../../server/jev/apprentice/types';
import { buildApprenticeRegistry, expertiseRows, SAMPLE_MIN } from '../../server/jev/apprentice/registry';
import {
  STATUS_RANK,
  apprenticeMatrix,
  champions as championsOf,
  sampleLabelOf,
} from '../../server/jev/apprentice/supremacy';
import { LEVELS } from '../../server/jev/apprentice/ladder';
import { SIMULATED_LABEL, runSupremacyDemo } from '../../server/jev/apprentice/demo';
import { failureStats } from '../../server/jev/apprentice/failure';
import {
  apprenticePayback,
  learningGraph,
  learningPayback,
  teacherROI,
} from '../../server/jev/apprentice/payback';
import { capsuleCache, championFor } from '../lib/apprentice';
import { DEFAULT_SUPREMACY, DEFAULT_VALIDATION, type JevStatus } from '../../server/jev/apprentice/types';
import {
  analyzeApprentice,
  perDollar,
  referenceStatement,
  trueTotalCost,
} from '../../server/jev/apprentice/metrics';
import {
  skillStage,
  skillTransfers,
  teacherAllowance,
  teacherValue,
} from '../../server/jev/apprentice/teacher';
import { Empty, NM, Section, Table, fmt } from './fabricUi';
import { Scenario } from './JevChampion';

type Sub = 'center' | 'champions' | 'registry' | 'teacher' | 'payback' | 'bench' | 'trace' | 'demo' | 'cost';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'center', label: 'Apprentice Center' },
  { id: 'champions', label: 'Apprentice Champions' },
  { id: 'registry', label: 'Registre & modèles gratuits' },
  { id: 'teacher', label: 'Teacher & Skills' },
  { id: 'payback', label: 'Payback & Learning Graph' },
  { id: 'bench', label: 'Apprentice Benchmark' },
  { id: 'trace', label: 'Trace & Ladder' },
  { id: 'demo', label: 'Démonstration (simulée)' },
  { id: 'cost', label: 'Coût réel & Intelligence/$' },
];
const STATUS_TONE = {
  FREE: 'neutral',
  ADAPTED: 'info',
  SPECIALIST: 'ok',
  VALIDATED: 'ok',
  DEGRADED: 'err',
} as const;
const pct = (x: number | null | undefined) => fmt.pct(x);
const cheapModels = (models: ReturnType<typeof useStore.getState>['models']) =>
  models
    .filter((m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id))
    .sort((a, b) => (b.inputPrice ?? 0) - (a.inputPrice ?? 0))
    .slice(0, 80);

export function ApprenticePanel() {
  const [sub, setSub] = useState<Sub>('center');
  const s = useStore((x) => x.settings);
  const on = Boolean(s.apprentice?.enabled);
  return (
    <div className="space-y-3" data-testid="apprentice">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={on ? 'ok' : 'neutral'}>
          {on ? 'FREE-FIRST ✓ ACTIVE' : 'FREE-FIRST OFF — routage V5 inchangé'}
        </Badge>
        <span className="text-[12px] text-muted">
          FREE-FIRST · QUALITY-GATED · INTELLIGENCE-OPTIMIZED. « JEV-ADAPTED » = adaptation à l’inférence ;
          aucun poids de modèle n’est modifié.
        </span>
      </div>
      <Tabs tabs={SUBS} value={sub} onChange={setSub} className="overflow-x-auto" />
      {sub === 'center' && <CenterTab />}
      {sub === 'champions' && <ChampionsTab />}
      {sub === 'payback' && <PaybackTab />}
      {sub === 'demo' && <DemoTab />}
      {sub === 'registry' && <RegistryTab />}
      {sub === 'teacher' && <TeacherTab />}
      {sub === 'bench' && <BenchTab />}
      {sub === 'trace' && <TraceTab />}
      {sub === 'cost' && <CostTab />}
    </div>
  );
}

// ───────────────────────── center ─────────────────────────

function CenterTab() {
  const log = useStore((x) => x.jevLog);
  const patch = useStore((x) => x.patchSettings);
  const cur = apprenticeSettings();
  const set = (p: Partial<ApprenticeSettings>) =>
    patch({ apprentice: { ...useStore.getState().settings.apprentice, ...p } });
  const last = useMemo(() => [...log].reverse().find((e) => e.apprentice && !e.fabric), [log]);
  const a = last?.apprentice;
  const tc = last ? trueTotalCost(last) : null;
  const rows: [string, string][] =
    a && last
      ? [
          ['FREE-FIRST', a.active ? '✓ ACTIVE' : 'route gratuite non utilisée'],
          ['APPRENTICE', a.path[0] ?? 'N/A'],
          ['TASK', a.family],
          [
            'JEV ADAPTATION',
            a.adapted
              ? `${a.adaptationMs} ms · ${a.tokensAdded} tokens (estimés) · ${a.skills.length} skill(s) · ${a.experiences} expérience(s) · ${a.toolsExposed} outil(s)${a.contextReduction === null ? '' : ` · contexte −${Math.round(a.contextReduction * 100)} %`}`
              : 'aucune',
          ],
          ['CONFIDENCE', a.confidence],
          ['PREDICTED SUCCESS', a.predictedSuccess === null ? NM : pct(a.predictedSuccess)],
          [
            'ACTUAL QUALITY',
            a.gateScore === null
              ? NM
              : `${Math.round(a.gateScore * 100)} % (seuil ${Math.round(a.threshold * 100)} %)`,
          ],
          ['FALLBACK', a.path.length > 1 ? a.path.join(' → ') : 'aucun'],
          ['TEACHER', a.teacher ? `${a.teacher} (${fmt.usd(a.teacherCost)})` : 'non requis'],
          ['COST (total)', tc ? fmt.usd(tc.total) : NM],
          ['STATUS', a.accepted ? '✓ ACCEPTED' : 'ESCALATED / non accepté'],
          [
            'LEVEL',
            a.level === undefined
              ? 'N/A'
              : `${a.level} — ${LEVELS.find((l) => l.level === a.level)?.name ?? ''}${a.champion ? ' · CHAMPION' : ''}`,
          ],
          ['SUPREMACY SCORE', a.supremacy == null ? 'N/A' : a.supremacy.toFixed(3)],
          [
            'CAPSULE CACHE',
            a.cache
              ? `${a.cache.hit ? 'CACHE HIT' : 'CACHE MISS'} · retrieval ${a.cache.retrievalMs} ms · compilation ${a.cache.compilationMs} ms · ${a.cache.contextBefore} → ${a.cache.contextAfter} tokens`
              : 'N/A',
          ],
          [
            'FAILURE',
            a.failure ? `${a.failure.signature} → ${a.failure.correction} (${a.failure.outcome})` : 'aucun',
          ],
          ['WHY THIS MODEL?', a.why.join(' · ') || 'N/A'],
        ]
      : [];
  const num = (k: Risk) => (
    <label key={k} className="flex items-center gap-1">
      {k}
      <Input
        type="number"
        step="0.01"
        min={0.5}
        max={1}
        value={cur.gates[k]}
        onChange={(e) =>
          set({ gates: { ...cur.gates, [k]: Math.max(0.5, Math.min(1, Number(e.target.value) || 0.9)) } })
        }
        className="w-20"
        aria-label={`Seuil ${k}`}
      />
    </label>
  );
  return (
    <div className="space-y-3" data-testid="apprentice-center">
      <Section
        title="Interrupteur principal"
        hint="Désactivé par défaut. Actif : un modèle gratuit compatible est tenté en premier, validé par une porte qualité stricte, avec repli automatique vers le routage V5 (spécialiste payant → conseil → frontier). Désactivé : le routage V5 décide exactement comme avant."
      >
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <Toggle
            checked={cur.enabled}
            onChange={(v) => set({ enabled: v })}
            label="Activer JEV Apprentice (free-first)"
          />
          <Toggle
            checked={cur.teacher}
            onChange={(v) => set({ teacher: v })}
            label="Autoriser l’apprentissage depuis un Teacher (toujours filtré par le gouverneur de coût)"
          />
        </div>
        <div className="mt-1 text-[11.5px] text-faint">
          Nécessite JEV actif (la porte qualité utilise le contrôle qualité de JEV). Les données CONFIDENTIAL
          et plus ne vont jamais vers un fournisseur gratuit sans politique « sans entraînement ni
          conservation » déclarée (onglet Security).
        </div>
      </Section>
      <Section title="Dernière mission" testId="apprentice-live">
        {rows.length ? (
          <table className="text-[12.5px]">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-4 font-medium text-faint">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Aucune mission traitée par l’Apprentice : rien n’est affiché sans mission réelle.</Empty>
        )}
      </Section>
      <Section
        title="Conditions pour devenir VALIDATED (configurables)"
        hint="Données insuffisantes ⇒ INSUFFICIENT SAMPLE : le modèle ne peut PAS devenir VALIDATED. Réussite et qualité sont pondérées par la récence (demi-vie ci-dessous). HIGH / CRITICAL exigent plus."
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]" data-testid="validation-rules">
          {(
            [
              ['minMissions', 'Missions min.', 1, 1000, 1],
              ['minFormulations', 'Formulations min.', 1, 20, 1],
              ['maxCriticalErrors', 'Erreurs critiques max.', 0, 10, 1],
              ['halfLifeDays', 'Demi-vie récence (jours)', 1, 365, 1],
            ] as const
          ).map(([k, label, mn, mx, st]) => (
            <label key={k} className="flex items-center gap-1">
              {label}
              <Input
                type="number"
                min={mn}
                max={mx}
                step={st}
                value={cur.validation[k]}
                onChange={(e) =>
                  set({
                    validation: {
                      ...cur.validation,
                      [k]: Math.max(mn, Math.min(mx, Number(e.target.value) || mn)),
                    },
                  })
                }
                className="w-20"
                aria-label={label}
              />
            </label>
          ))}
          {(
            [
              ['minSuccess', 'Réussite min.'],
              ['minRecentSuccess', 'Réussite récente min.'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1">
              {label}
              <Input
                type="number"
                step="0.01"
                min={0.5}
                max={1}
                value={cur.validation[k]}
                onChange={(e) =>
                  set({
                    validation: {
                      ...cur.validation,
                      [k]: Math.max(0.5, Math.min(1, Number(e.target.value) || 0.9)),
                    },
                  })
                }
                className="w-20"
                aria-label={label}
              />
            </label>
          ))}
          <label className="flex items-center gap-1">
            Qualité min.
            <Input
              type="number"
              min={50}
              max={100}
              value={cur.validation.minQuality}
              onChange={(e) =>
                set({
                  validation: {
                    ...cur.validation,
                    minQuality: Math.max(50, Math.min(100, Number(e.target.value) || 90)),
                  },
                })
              }
              className="w-20"
              aria-label="Qualité min. validation"
            />
          </label>
          <label className="flex items-center gap-1">
            Confiance min.
            <Select
              value={cur.validation.minConfidence}
              onChange={(v) =>
                set({ validation: { ...cur.validation, minConfidence: v as 'LOW' | 'MEDIUM' | 'HIGH' } })
              }
              options={['LOW', 'MEDIUM', 'HIGH'].map((x) => ({ value: x, label: x }))}
              title="Confiance min."
            />
          </label>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          HIGH : réussite ≥{' '}
          <Input
            type="number"
            step="0.01"
            value={cur.validation.high.success}
            onChange={(e) =>
              set({
                validation: {
                  ...cur.validation,
                  high: { ...cur.validation.high, success: Number(e.target.value) || 0.95 },
                },
              })
            }
            className="w-20"
            aria-label="HIGH réussite"
          />{' '}
          qualité ≥{' '}
          <Input
            type="number"
            value={cur.validation.high.quality}
            onChange={(e) =>
              set({
                validation: {
                  ...cur.validation,
                  high: { ...cur.validation.high, quality: Number(e.target.value) || 93 },
                },
              })
            }
            className="w-16"
            aria-label="HIGH qualité"
          />
          CRITICAL : réussite ≥{' '}
          <Input
            type="number"
            step="0.01"
            value={cur.validation.critical.success}
            onChange={(e) =>
              set({
                validation: {
                  ...cur.validation,
                  critical: { ...cur.validation.critical, success: Number(e.target.value) || 0.98 },
                },
              })
            }
            className="w-20"
            aria-label="CRITICAL réussite"
          />{' '}
          qualité ≥{' '}
          <Input
            type="number"
            value={cur.validation.critical.quality}
            onChange={(e) =>
              set({
                validation: {
                  ...cur.validation,
                  critical: { ...cur.validation.critical, quality: Number(e.target.value) || 97 },
                },
              })
            }
            className="w-16"
            aria-label="CRITICAL qualité"
          />
        </div>
        <div className="mb-1 text-[12px] font-medium">
          ApprenticeSupremacyScore — poids (normalisés ; qualité, réussite, fiabilité et confiance ×1,5 pour
          HIGH / CRITICAL)
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]" data-testid="supremacy-weights">
          {(Object.keys(DEFAULT_SUPREMACY) as (keyof typeof DEFAULT_SUPREMACY)[]).map((k) => (
            <label key={k} className="flex items-center gap-1">
              {k}
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={cur.supremacy[k]}
                onChange={(e) =>
                  set({
                    supremacy: {
                      ...cur.supremacy,
                      [k]: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                    },
                  })
                }
                className="w-16"
                aria-label={`Poids supremacy ${k}`}
              />
            </label>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => set({ validation: DEFAULT_VALIDATION, supremacy: DEFAULT_SUPREMACY })}
          >
            Valeurs par défaut
          </Button>
        </div>
      </Section>
      <Section
        title="Réglages"
        hint="Seuils de la porte qualité par risque, poids de l’ApprenticeScore (normalisés, renforcés pour les tâches high / critical), budget de la capsule."
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]" data-testid="apprentice-gates">
          Porte qualité :{(['low', 'normal', 'high', 'critical'] as Risk[]).map(num)}
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          {(Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).map((k) => (
            <label key={k} className="flex items-center gap-1">
              {k}
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={cur.weights[k]}
                onChange={(e) =>
                  set({
                    weights: { ...cur.weights, [k]: Math.max(0, Math.min(1, Number(e.target.value) || 0)) },
                  })
                }
                className="w-16"
                aria-label={`Poids ${k}`}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Budget capsule (tokens)
            <Input
              type="number"
              min={150}
              max={3000}
              value={cur.capsuleBudget}
              onChange={(e) =>
                set({ capsuleBudget: Math.max(150, Math.min(3000, Number(e.target.value) || 700)) })
              }
              className="w-20"
              aria-label="Budget capsule"
            />
          </label>
          <label className="flex items-center gap-1">
            Confiance min. (critique)
            <Input
              type="number"
              step="0.01"
              min={0.5}
              max={1}
              value={cur.criticalConfidence}
              onChange={(e) =>
                set({ criticalConfidence: Math.max(0.5, Math.min(1, Number(e.target.value) || 0.85)) })
              }
              className="w-20"
              aria-label="Confiance critique"
            />
          </label>
          <label className="flex items-center gap-1">
            Tentatives gratuites max
            <Input
              type="number"
              min={1}
              max={3}
              value={cur.maxFreeAttempts}
              onChange={(e) =>
                set({ maxFreeAttempts: Math.max(1, Math.min(3, Number(e.target.value) || 3)) })
              }
              className="w-16"
              aria-label="Tentatives gratuites"
            />
          </label>
          <Toggle
            checked={cur.tryAllFree}
            onChange={(v) => set({ tryAllFree: v })}
            label="Tester tous les modèles gratuits éligibles avant V5"
          />
          <label className="flex items-center gap-1">
            Valeur d’un point ($)
            <Input
              type="number"
              step="0.001"
              min={0}
              value={cur.valuePerPoint}
              onChange={(e) => set({ valuePerPoint: Math.max(0, Number(e.target.value) || 0) })}
              className="w-20"
              aria-label="Valeur d'un point"
            />
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ apprentice: { ...DEFAULT_APPRENTICE, enabled: cur.enabled } })}
          >
            Réinitialiser
          </Button>
        </div>
      </Section>
    </div>
  );
}

// ───────────────────────── registry ─────────────────────────

function RegistryTab() {
  const models = useStore((x) => x.models);
  const log = useStore((x) => x.jevLog);
  const fab = useStore((x) => x.fabric);
  const setFabric = useStore((x) => x.setFabric);
  const toast = useStore((x) => x.toast);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const pool = useMemo(() => freePool(models), [models]);
  const profiles = useMemo(() => buildApprenticeRegistry(log, pool), [log, pool]);
  // VALIDATED / DEGRADED come only from the validation criteria (never from a flag): best status across the model's domains.
  const rules = apprenticeSettings().validation;
  const matrix = useMemo(() => apprenticeMatrix(log, pool, rules), [log, pool, rules]);
  const statusOf = (model: string): JevStatus => {
    const cells = Object.values(matrix.cells[model] ?? {});
    const best = cells.map((c) => c.status).sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])[0];
    if (cells.some((c) => c.status === 'VALIDATED')) return 'VALIDATED';
    if (cells.some((c) => c.status === 'DEGRADED')) return 'DEGRADED';
    return best ?? profiles.find((p) => p.model === model)?.jevStatus ?? 'FREE';
  };
  const sel = profiles.find((p) => p.model === pick) ?? profiles.find((p) => p.n > 0) ?? profiles[0];
  const policyOf = (provider: string) => fab.providerPolicies.find((p) => p.provider === provider);
  const refresh = async () => {
    setBusy(true);
    try {
      const m = await loadCatalog(true);
      useStore.setState({ models: m });
      toast('ok', `${freePool(m).length} modèle(s) gratuit(s) dans le catalogue actuel`);
    } catch (e) {
      toast('err', `Catalogue indisponible : ${(e as Error).message}`);
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3" data-testid="apprentice-registry">
      <Section
        title="JEV APPRENTICE REGISTRY"
        hint="Une fiche dynamique par modèle gratuit, construite uniquement à partir des missions réellement observées. Aucun score n’est inventé : « N/A » sans données, « INSUFFICIENT SAMPLE » sous 5 missions."
      >
        <div className="mb-2 flex items-center gap-2 text-[12px]">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={13} /> Découvrir / rafraîchir (catalogue en direct)
          </Button>
          <span>
            {pool.length} modèle(s) gratuit(s) découvert(s) — la liste n’est jamais codée en dur : les
            modèles, prix et capacités peuvent changer.
          </span>
        </div>
        {profiles.length ? (
          <Table
            testId="apprentice-profiles"
            head={[
              'Modèle',
              'Statut',
              'JEV status',
              'Missions',
              'Réussite',
              'Qualité',
              'Coût modèle',
              'Coût total moy.',
              'Latence',
              'Tokens',
              'Échecs',
              'Confiance',
              'Échantillon',
              'Dernière validation',
              'Santé',
              'Dégradation',
            ]}
            rows={profiles.slice(0, 40).map((p) => [
              <button key="m" className="text-left underline" onClick={() => setPick(p.model)}>
                {p.model}
              </button>,
              'FREE',
              <Badge key="j" tone={STATUS_TONE[statusOf(p.model)]}>
                {statusOf(p.model) === 'ADAPTED'
                  ? 'JEV-ADAPTED'
                  : statusOf(p.model) === 'SPECIALIST'
                    ? 'JEV SPECIALIST'
                    : statusOf(p.model) === 'VALIDATED'
                      ? 'APPRENTICE SUPREMACY · VALIDATED'
                      : statusOf(p.model) === 'DEGRADED'
                        ? 'DEGRADED'
                        : 'FREE'}
              </Badge>,
              p.n,
              pct(p.successRate),
              fmt.num(p.quality, 1),
              '$0',
              fmt.usd(p.totalCost, 6),
              fmt.ms(p.latencyMs),
              p.tokens === null ? NM : Math.round(p.tokens),
              pct(p.failureRate),
              p.confidence,
              p.sampleLabel,
              p.lastValidated ? new Date(p.lastValidated).toLocaleString('fr-FR') : 'N/A',
              p.health.score === null ? NM : `${p.health.score} / 100`,
              p.degradation.degraded ? (
                <Badge key="d" tone="err">
                  {p.degradation.reasons.join(' ; ')}
                </Badge>
              ) : (
                'non détectée'
              ),
            ])}
          />
        ) : (
          <Empty>Aucun modèle gratuit : chargez le catalogue (Réglages) puis « Découvrir ».</Empty>
        )}
      </Section>
      {sel && (
        <Section
          title={`Expertise de ${sel.model} (par famille de tâches et par dimension)`}
          hint="« Gemma est bon pour X », pas « Gemma est bon » : chaque ligne a son effectif."
        >
          {sel.families.length ? (
            <Table
              head={[
                'Famille',
                'Missions',
                'Réussite',
                'Qualité',
                'Coût total',
                'Latence',
                'Adaptées (n)',
                'Réussite adaptée',
                'Réussite non adaptée',
              ]}
              rows={sel.families.map((f) => [
                f.family,
                f.n,
                pct(f.successRate),
                fmt.num(f.quality, 1),
                fmt.usd(f.totalCost, 6),
                fmt.ms(f.latencyMs),
                f.adaptedN,
                pct(f.adaptedSuccess),
                pct(f.plainSuccess),
              ])}
            />
          ) : (
            <Empty>Aucune mission : N/A.</Empty>
          )}
          {expertiseRows(sel).length > 0 && (
            <Table
              className="mt-2"
              head={['Dimension', 'n', 'Réussite', 'Qualité', 'Échantillon']}
              rows={expertiseRows(sel).map((r) => [
                r.dimension,
                r.n,
                pct(r.successRate),
                fmt.num(r.quality, 1),
                r.label,
              ])}
            />
          )}
        </Section>
      )}
      <Section
        title="FREE MODEL CANDIDATES (catalogue)"
        hint="« $0 » ne signifie pas : meilleur, illimité, privé, fiable ou sans limite de débit. La politique de données n’est pas exposée par le catalogue : NON RENSEIGNÉE tant que vous ne l’avez pas déclarée dans Security."
      >
        {pool.length ? (
          <Table
            head={[
              'Modèle',
              'Fournisseur',
              'Prix',
              'Contexte',
              'Raisonnement',
              'Vision',
              'Outils',
              'Sortie structurée',
              'Multilingue',
              'Latence (mesurée)',
              'Limites de débit (mesurées)',
              'Disponibilité (mesurée)',
              'Politique de données',
              'Fiabilité (santé)',
            ]}
            rows={pool.slice(0, 60).map((m) => {
              const p = profiles.find((x) => x.model === m.id);
              const pol = policyOf(m.provider);
              return [
                m.id,
                m.provider,
                '0 $',
                m.contextLength.toLocaleString('fr-FR'),
                m.reasoning ? 'oui' : 'non',
                m.vision ? 'oui' : 'non',
                m.tools ? 'oui' : 'non',
                m.structuredOutputs ? 'oui' : 'non',
                'NON MESURÉ',
                fmt.ms(p?.latencyMs ?? null),
                p ? p.rateLimited : NM,
                p?.failureRate == null ? NM : pct(1 - p.failureRate),
                pol && pol.source === 'user'
                  ? `déclarée : conservation ${pol.retention}, entraînement ${pol.training}`
                  : 'NON RENSEIGNÉE',
                p?.health.score == null ? NM : `${p.health.score}/100`,
              ];
            })}
          />
        ) : (
          <Empty>Catalogue vide.</Empty>
        )}
      </Section>
      <Section
        title="Versions d’adaptation (Apprentice Profile Version)"
        hint="Gemma-IFRS9-v1 → v2 → v3. Chaque version est évaluée sur ses propres missions (n ≥ 5) ; une régression déclenche un ROLLBACK vers la version précédente."
      >
        <div className="mb-2 flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              const r = refreshProfileVersions();
              toast('ok', `${r.promoted} promue(s), ${r.rolledBack} annulée(s)`);
            }}
          >
            Évaluer maintenant
          </Button>
        </div>
        {fab.profileVersions.length ? (
          <Table
            testId="apprentice-versions"
            head={[
              'Version',
              'Modèle',
              'Famille',
              'Skills',
              'Missions',
              'Réussite',
              'Qualité',
              'État',
              'Note',
              '',
            ]}
            rows={fab.profileVersions
              .slice(-30)
              .reverse()
              .map((v) => [
                v.id,
                v.model,
                v.family,
                v.skills.join(', ') || '—',
                v.benchmark?.n ?? 0,
                pct(v.benchmark?.success ?? null),
                fmt.num(v.benchmark?.quality ?? null, 1),
                <Badge
                  key="s"
                  tone={v.status === 'production' ? 'ok' : v.status === 'rolled_back' ? 'err' : 'info'}
                >
                  {v.status}
                </Badge>,
                v.note,
                <button
                  key="r"
                  className="rounded bg-hover px-1.5"
                  disabled={v.status === 'rolled_back'}
                  onClick={() =>
                    setFabric({
                      profileVersions: fab.profileVersions.map((x) =>
                        x.id === v.id ? { ...x, status: 'rolled_back' as const, note: 'ROLLBACK manuel' } : x,
                      ),
                    })
                  }
                >
                  ROLLBACK
                </button>,
              ])}
          />
        ) : (
          <Empty>Aucune version : elles sont créées par les missions adaptées.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── teacher & skills ─────────────────────────

function TeacherTab() {
  const log = useStore((x) => x.jevLog);
  const skills = useStore((x) => x.fabric.skills);
  const toast = useStore((x) => x.toast);
  const tv = useMemo(() => teacherValue(log), [log]);
  const tr = useMemo(() => skillTransfers(log, skills), [log, skills]);
  const teachers = useMemo(
    () => [
      ...new Set(
        log.filter((e) => e.success && !/:free$/.test(e.model) && e.model !== 'JEV-0').map((e) => e.model),
      ),
    ],
    [log],
  );
  const [teacher, setTeacher] = useState('');
  const t = teacher || teachers[0] || '';
  return (
    <div className="space-y-3" data-testid="apprentice-teacher">
      <Section
        title="TEACHER → APPRENTICE"
        hint="Le Teacher n’est jamais appelé automatiquement : le gouverneur de coût compare gain attendu (qualité, réussite, information) et coût total, puis EXECUTE ou SKIP. Seules les décisions observables sont distillées (stratégie, étapes, outils, critères, erreurs à éviter) — jamais le raisonnement privé."
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
          Teacher
          <Select
            value={t}
            onChange={setTeacher}
            options={teachers.map((m) => ({ value: m, label: m }))}
            title="Teacher"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!t}
            onClick={() => {
              const r = distillSkills(log, skills, t);
              const n = addDistilled(r.candidates);
              toast(n ? 'ok' : 'info', `${n} skill(s) candidate(s) distillée(s) de ${t}`);
            }}
          >
            Distiller en skills candidates
          </Button>
        </div>
        {tv.length ? (
          <Table
            testId="teacher-value"
            head={[
              'Teacher',
              'Appels',
              'Familles enseignées',
              'Valeur mesurée (Δ réussite de l’apprenti)',
              'Politique',
            ]}
            rows={tv.map((v) => {
              const al = teacherAllowance(v);
              return [
                v.teacher,
                v.calls,
                v.families.join(', '),
                v.value === null ? 'INSUFFICIENT SAMPLE' : `${(v.value * 100).toFixed(0)} pts`,
                al.reason,
              ];
            })}
          />
        ) : (
          <Empty>Aucun appel de Teacher enregistré : TeacherValueScore indisponible.</Empty>
        )}
      </Section>
      <Section title="Compétences transférées" testId="transfers">
        {tr.length ? (
          <ul className="text-[12.5px]">
            {tr.map((x) => (
              <li key={x.skill}>
                • <b>{x.skill}</b> — {x.message} ({x.successes} réussite(s))
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune compétence transférée d’un Teacher vers un Apprentice pour l’instant.</Empty>
        )}
      </Section>
      <Section
        title="Cycle de vie des skills : CANDIDATE → VALIDATED → PRODUCTION"
        hint="Une skill n’est jamais prête pour la production automatiquement : règles de répétition + test AVEC / SANS (Skill Lab) + absence de régression (n ≥ 5)."
      >
        {skills.length ? (
          <Table
            head={['Skill', 'Version active', 'Étape']}
            rows={skills.map((s) => [
              s.name,
              s.activeVersion ?? '—',
              <Badge
                key="b"
                tone={
                  skillStage(s) === 'PRODUCTION' ? 'ok' : skillStage(s) === 'VALIDATED' ? 'info' : 'neutral'
                }
              >
                {skillStage(s)}
              </Badge>,
            ])}
          />
        ) : (
          <Empty>Aucune skill : voir Skill Factory.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── benchmark ─────────────────────────

function BenchTab() {
  const models = useStore((x) => x.models);
  const log = useStore((x) => x.jevLog);
  const toast = useStore((x) => x.toast);
  const pool = useMemo(() => freePool(models), [models]);
  const paid = useMemo(() => cheapModels(models), [models]);
  const [free, setFree] = useState('');
  const [ref, setRef] = useState('');
  const [cats, setCats] = useState<string[]>(['simple', 'data']);
  const [per, setPer] = useState(3);
  const [reps, setReps] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef({ stop: false });
  const f = free || pool.find((m) => m.tools)?.id || '';
  const p = ref || paid[0]?.id || '';
  const all = useMemo(() => cfBenchTasks(), []);
  const picked = CF_CATEGORIES.flatMap((c) =>
    all.filter((t) => t.category === c && cats.includes(c)).slice(0, per),
  );
  const runs = picked.length * 5 * reps;
  const r = useMemo(() => analyzeApprentice(log), [log]);
  const go = async () => {
    if (
      !confirm(
        `APPRENTICE DEMO : ${picked.length} tâche(s) × 5 bras × ${reps} = ${runs} exécutions RÉELLES (le modèle de référence est facturé ; les modèles gratuits peuvent être limités en débit). Vous pouvez arrêter à tout moment.`,
      )
    )
      return;
    stop.current.stop = false;
    await runApprenticeDemo(
      { tasks: picked, reps, freeModel: f, paidModel: p },
      (m) => setBusy(m),
      stop.current,
    );
    setBusy(null);
    toast('ok', 'Benchmark Apprentice terminé.');
  };
  const arm = (id: string) => r.arms.find((a) => (a.arm as string) === id);
  return (
    <div className="space-y-3" data-testid="apprentice-bench">
      <Section
        title="JEV APPRENTICE BENCHMARK / DEMO"
        hint="Même tâche (réponse attendue calculée), même espace de travail, ordre mélangé : A free seul · B free + JEV · C + skills · D + skills + expérience · E modèle payant de référence. Lancé uniquement par vous ; aucune donnée fictive."
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Modèle gratuit
            <Select
              value={f}
              onChange={setFree}
              options={pool.map((m) => ({ value: m.id, label: m.id }))}
              title="Modèle gratuit"
            />
          </label>
          <label className="flex items-center gap-1">
            Référence payante
            <Select
              value={p}
              onChange={setRef}
              options={paid.map((m) => ({ value: m.id, label: `${m.id} (${m.inputPrice}$/M)` }))}
              title="Référence payante"
            />
          </label>
          {CF_CATEGORIES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={cats.includes(c)}
                onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))}
                aria-label={`Catégorie ${CF_LABEL[c]}`}
              />
              {CF_LABEL[c]}
            </label>
          ))}
          <label className="flex items-center gap-1">
            Tâches / catégorie
            <Select
              value={String(per)}
              onChange={(v) => setPer(Number(v))}
              options={[2, 3, 5, 10].map((n) => ({ value: String(n), label: String(n) }))}
              title="Tâches par catégorie"
            />
          </label>
          <label className="flex items-center gap-1">
            Répétitions
            <Select
              value={String(reps)}
              onChange={(v) => setReps(Number(v))}
              options={[1, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
              title="Répétitions"
            />
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(busy) || !f || !p || !picked.length}
            onClick={() => void go()}
          >
            <Play size={13} /> Lancer ({runs} exécutions)
          </Button>
          {busy && (
            <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter
            </Button>
          )}
          {busy && <span className="text-info">{busy}</span>}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              download('apprentice-benchmark.json', JSON.stringify(r, null, 2), 'application/json')
            }
          >
            <Download size={13} /> Exporter
          </Button>
        </div>
      </Section>
      {r.groups ? (
        <>
          <Section
            title={`Résultats — ${r.complete} groupe(s) complet(s) sur ${r.groups}, ${r.tasks} tâche(s), benchmark ${r.version}`}
            testId="apprentice-arms"
          >
            <Table
              head={[
                'Bras',
                'n',
                'Réussite',
                'Qualité',
                'Tokens / mission',
                'Coût total / mission',
                'Coût / réussie',
                'Latence',
                'Appels d’outils',
                'Retries',
                'Escalade (non accepté)',
              ]}
              rows={r.arms.map((a) => [
                a.name,
                a.n,
                pct(a.successRate),
                a.quality === null ? NM : a.quality.toFixed(1),
                a.tokens === null ? NM : Math.round(a.tokens),
                fmt.usd(a.cost, 6),
                fmt.usd(a.costPerSuccess, 6),
                fmt.ms(a.latencyMs),
                fmt.num(a.toolCalls, 1),
                fmt.num(a.retries, 1),
                pct(a.escalationRate),
              ])}
            />
            <Table
              testId="apprentice-cmp"
              className="mt-2"
              head={[
                'Comparaison',
                'Paires',
                'Quality gain',
                'Success gain',
                'Cost reduction',
                'Token reduction',
                'Latency reduction',
                'Escalation reduction',
                'Verdict',
              ]}
              rows={r.comparisons.map((c) => [
                `${c.fromName} → ${c.toName}`,
                <span key="n">
                  {c.pairs}{' '}
                  <Badge tone={c.label === 'MEASURED' ? 'ok' : 'neutral'}>
                    {c.label === 'MEASURED' ? 'MEASURED' : 'INSUFFICIENT SAMPLE'}
                  </Badge>
                </span>,
                c.qualityGain === null ? NM : `${c.qualityGain.toFixed(1)} pts`,
                c.successGain === null ? NM : `${(c.successGain * 100).toFixed(0)} pts`,
                c.costReduction === null ? NM : pct(c.costReduction),
                c.tokenReduction === null ? NM : pct(c.tokenReduction),
                c.latencyReduction === null ? NM : pct(c.latencyReduction),
                c.escalationReduction === null ? NM : `${(c.escalationReduction * 100).toFixed(0)} pts`,
                <Badge
                  key="v"
                  tone={c.verdict === 'improves' ? 'ok' : c.verdict === 'worsens' ? 'err' : 'neutral'}
                >
                  {c.verdict}
                </Badge>,
              ])}
            />
            <div
              className="mt-2 rounded-lg border border-line p-2 text-[12.5px]"
              data-testid="apprentice-statement"
            >
              {referenceStatement(r)}
            </div>
            {arm('free_skill_exp')?.quality != null && arm('paid')?.cost != null && (
              <div className="mt-1 text-[11.5px] text-faint">
                QUALITY AT ZERO MODEL COST (D) : {arm('free_skill_exp')!.quality!.toFixed(1)} — coût total par
                mission (JEV inclus) : {fmt.usd(arm('free_skill_exp')!.cost, 6)} · référence payante :{' '}
                {fmt.usd(arm('paid')!.cost, 6)}.
              </div>
            )}
          </Section>
          {r.nonComparable.length > 0 && (
            <Section title="Paires NON COMPARABLES">
              <ul className="text-[12px]">
                {r.nonComparable.slice(0, 10).map((n, i) => (
                  <li key={i}>
                    {n.groupId} ({n.arm}) : {n.reasons.join(' ; ')}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      ) : (
        <Empty>
          Aucun benchmark Apprentice exécuté : « INSUFFICIENT SAMPLE ». Les tests automatisés n’en produisent
          pas.
        </Empty>
      )}
      <Scenario focus="benchmark" />
    </div>
  );
}

// ───────────────────────── trace ─────────────────────────

const FLOW = [
  'JEV PRE',
  'FREE-FIRST',
  'APPRENTICE SELECTION',
  'SKILL RETRIEVAL',
  'MICRO-ADAPTATION',
  'FREE EXECUTION',
  'VALIDATION (quality gate)',
  'SUCCESS / FAILURE',
  'CORRECTION',
  'FALLBACK',
  'TEACHER (gouverneur)',
  'DISTILLATION',
  'LEARNING',
];
function TraceTab() {
  const log = useStore((x) => x.jevLog);
  const last = useMemo(() => [...log].reverse().find((e) => e.apprentice && !e.fabric), [log]);
  const a = last?.apprentice;
  return (
    <div className="space-y-3" data-testid="apprentice-trace">
      <Section
        title="Échelle de routage (LEVEL 0 → 7)"
        hint="Le niveau supérieur n’est utilisé que si le niveau inférieur échoue à la porte qualité ou n’est pas autorisé. L5–L7 = routage V5 existant (spécialiste payant → Model Council si activé dans Policy Engine → frontier)."
      >
        <ol className="text-[12.5px]" data-testid="ladder-levels">
          {LEVELS.map((l) => (
            <li key={l.level}>
              LEVEL {l.level} — {l.name}
            </li>
          ))}
        </ol>
        <div className="mt-1 text-[11.5px] text-faint">
          Règle finale : validatedApprentice.exists ∧ confidence ≥ requis ∧ quality ≥ seuil ∧ health = healthy
          ∧ security = allowed ∧ capabilities = sufficient ∧ riskGate = PASS ⇒ APPRENTI VALIDATED ; sinon
          routage V5 actuel.
        </div>
      </Section>
      <Section
        title="Boucle cœur"
        hint="FREE-FIRST → OBSERVE → CLASSIFY → SELECT APPRENTICE → RETRIEVE SKILLS → MICRO-ADAPT → EXECUTE → VALIDATE → CORRECT → RETRY → ESCALATE IF NECESSARY → TEACH → DISTILL → UPDATE SKILL → BENCHMARK → LEARN → ROUTE BETTER NEXT TIME"
      >
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          {FLOW.map((x, i) => (
            <span key={x} className="flex items-center gap-1">
              <Badge>{x}</Badge>
              {i < FLOW.length - 1 && '→'}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Dernière mission tracée">
        {last && a ? (
          <>
            <div className="mb-1 text-[12.5px]">
              Chemin : {a.path.join(' → ') || 'N/A'} · {a.accepted ? 'ACCEPTÉ' : 'non accepté'} ·{' '}
              {a.why.join(' · ')}
            </div>
            <Table
              head={['Point de contrôle', 'ms', 'Décision']}
              rows={last.checkpoints.map((c) => [c.name, Math.round(c.ms), c.decision])}
            />
          </>
        ) : (
          <Empty>Aucune mission tracée.</Empty>
        )}
      </Section>
      <Scenario focus="trace" />
    </div>
  );
}

// ───────────────────────── real cost ─────────────────────────

function CostTab() {
  const log = useStore((x) => x.jevLog);
  const free = log.filter(
    (e) =>
      e.apprentice?.active && !e.apprentice.arm && e.apprentice.path.length === 1 && /:free$/.test(e.model),
  );
  const escal = log.filter((e) => e.apprentice?.active && !e.apprentice.arm && e.apprentice.path.length > 1);
  const rest = log.filter((e) => !e.apprentice?.active && !e.fabric && e.model !== 'JEV-0');
  const groups: [string, typeof log][] = [
    ['FREE + JEV (réussi sans repli)', free],
    ['Repli vers V5 / Teacher', escal],
    ['Routage V5 (sans Apprentice)', rest],
  ];
  const rows = groups.map(([name, es]) => ({ name, d: perDollar(es), cost: es.map(trueTotalCost) }));
  const sum = (k: 'model' | 'teacher' | 'jev' | 'tools' | 'retries', c: ReturnType<typeof trueTotalCost>[]) =>
    c.reduce((a, x) => a + x[k], 0);
  return (
    <div className="space-y-3" data-testid="apprentice-cost">
      <Section
        title="TRUE TOTAL COST"
        hint="Coût total d’une mission = modèle + Teacher + API JEV + outils + retries (corrections) — pas seulement le coût du modèle."
      >
        <Table
          testId="apprentice-truecost"
          head={['Groupe', 'Missions', 'Modèle', 'Teacher', 'JEV', 'Outils', 'Retries', 'Total']}
          rows={rows.map((r) => [
            r.name,
            r.d.n,
            fmt.usd(sum('model', r.cost), 6),
            fmt.usd(sum('teacher', r.cost), 6),
            fmt.usd(sum('jev', r.cost), 6),
            fmt.usd(sum('tools', r.cost), 6),
            fmt.usd(sum('retries', r.cost), 6),
            fmt.usd(r.d.totalCost, 6),
          ])}
        />
      </Section>
      <Section
        title="INTELLIGENCE / $"
        hint="Jamais de division par zéro : lorsque le coût total est nul, on affiche « QUALITY AT ZERO MODEL COST » (qualité des missions à coût modèle nul, avec leur surcoût JEV / Teacher / outils) au lieu d’un ratio artificiel."
      >
        <Table
          head={[
            'Groupe',
            'n',
            'Qualité',
            'Réussite',
            'QUALITY / $',
            'SUCCESS / $',
            'COST / SUCCESS',
            'QUALITY AT ZERO MODEL COST',
          ]}
          rows={rows.map((r) => [
            r.name,
            r.d.n,
            fmt.num(r.d.quality, 1),
            pct(r.d.successRate),
            r.d.qualityPerDollar === null ? NM : r.d.qualityPerDollar.toFixed(0),
            r.d.successPerDollar === null ? NM : r.d.successPerDollar.toFixed(0),
            fmt.usd(r.d.costPerSuccess, 6),
            r.d.qualityAtZeroModelCost
              ? `${fmt.num(r.d.qualityAtZeroModelCost.quality, 1)} (n=${r.d.qualityAtZeroModelCost.n}, surcoût ${fmt.usd(r.d.qualityAtZeroModelCost.overheadCost, 6)})`
              : 'N/A',
          ])}
        />
        <div className="mt-1 text-[11.5px] text-faint">
          Échantillon minimal pour conclure : {SAMPLE_MIN} missions par groupe.
        </div>
      </Section>
    </div>
  );
}

// ───────────────────────── champions, matrix, routing memory ─────────────────────────

function ChampionsTab() {
  const log = useStore((x) => x.jevLog);
  const models = useStore((x) => x.models);
  const fab = useStore((x) => x.fabric);
  const pool = useMemo(() => freePool(models), [models]);
  const s = apprenticeSettings();
  const ch = useMemo(
    () => championsOf(log, pool, { settings: s, versions: fab.profileVersions }),
    [log, pool, s, fab.profileVersions],
  );
  const matrix = useMemo(() => apprenticeMatrix(log, pool, s.validation), [log, pool, s.validation]);
  const mem = fab.routingMemory ?? {};
  const fails = useMemo(() => failureStats(log), [log]);
  const cs = capsuleCache.stats();
  return (
    <div className="space-y-3" data-testid="apprentice-champions">
      <Section
        title="APPRENTICE CHAMPIONS"
        hint="« CURRENT CHAMPION FOR THIS TASK FAMILY » — jamais « best free model » sans famille, effectif, qualité, réussite, confiance et date. Seul le statut VALIDATED donne APPRENTICE SUPREMACY (priorité n°1 pour la famille)."
      >
        {ch.length ? (
          <Table
            testId="champions-table"
            head={[
              'Task family',
              'Champion',
              'Status',
              'Quality',
              'Success',
              'n',
              'Sample',
              'Confidence',
              'Latency',
              'Total cost / mission',
              'Fallback',
              'Premium reference',
              'Premium delta',
              'Last validation',
            ]}
            rows={ch.map((c) => [
              c.family,
              c.version ? `${c.model} (${c.version})` : c.model,
              <Badge key="s" tone={STATUS_TONE[c.status]}>
                {c.supremacy ? 'VALIDATED · SUPREMACY' : c.status}
              </Badge>,
              c.quality === null ? NM : `${c.quality.toFixed(1)} %`,
              pct(c.success),
              c.n,
              c.sample,
              c.confidence,
              fmt.ms(c.latencyMs),
              `$0 modèle · ${fmt.usd(c.totalCost, 6)} total`,
              c.fallback ?? '—',
              c.premium
                ? `${c.premium.model} (${c.premium.quality === null ? NM : `${c.premium.quality.toFixed(1)} %`}, n=${c.premium.n}, ${c.premium.sample})`
                : 'N/A (aucune mission premium mesurée)',
              c.premiumDelta === null
                ? NM
                : `${c.premiumDelta >= 0 ? '+' : ''}${c.premiumDelta.toFixed(1)} points`,
              c.lastValidation ? new Date(c.lastValidation).toLocaleDateString('fr-FR') : 'N/A',
            ])}
          />
        ) : (
          <Empty>
            Aucun champion : il faut des missions adaptées réelles. Rien n’est affiché sans données.
          </Empty>
        )}
        {ch.some((c) => c.premiumDelta !== null) && (
          <div className="mt-1 text-[11.5px] text-faint">
            Les écarts sont des mesures sur cette famille, pas une équivalence : « meets task quality
            threshold » s’affiche seulement si la porte qualité est atteinte.
          </div>
        )}
      </Section>
      <Section
        title="APPRENTICE EXPERTISE MATRIX"
        hint="Chaque cellule : qualité · réussite · n · confiance · statut (FREE / ADAPTED / SPECIALIST / VALIDATED / DEGRADED)."
      >
        {matrix.models.length ? (
          <Table
            testId="apprentice-matrix"
            head={['Modèle gratuit', ...matrix.domains]}
            rows={matrix.models.map((m) => [
              m,
              ...matrix.domains.map((d) => {
                const c = matrix.cells[m]?.[d];
                return c ? (
                  <span key={d}>
                    {c.quality === null ? NM : c.quality.toFixed(0)} · {pct(c.success)} · n={c.n} ·{' '}
                    {c.confidence} <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </span>
                ) : (
                  '—'
                );
              }),
            ])}
          />
        ) : (
          <Empty>Matrice vide : aucune mission adaptée.</Empty>
        )}
      </Section>
      <Section
        title="MODEL ROUTING MEMORY (persistante)"
        hint="Pour cette famille de tâches, ce modèle est historiquement le meilleur — enregistré après chaque mission."
      >
        {Object.keys(mem).length ? (
          <Table
            head={[
              'Famille',
              'Champion',
              'Statut',
              'Fallback',
              'Référence premium',
              'Qualité',
              'Réussite',
              'n',
              'Mis à jour',
            ]}
            rows={Object.entries(mem).map(([f, m]) => [
              f,
              m.champion,
              m.status,
              m.fallback ?? '—',
              m.premium ?? 'N/A',
              m.quality === null ? NM : m.quality.toFixed(1),
              pct(m.success),
              m.n,
              new Date(m.updatedAt).toLocaleString('fr-FR'),
            ])}
          />
        ) : (
          <Empty>Mémoire de routage vide.</Empty>
        )}
      </Section>
      <Section
        title="Bibliothèque d’échecs de l’Apprentice (FAILURE LEARNING)"
        hint="Chaque échec a une signature, une correction nommée, le modèle qui a repris et l’issue."
      >
        {fails.length ? (
          <Table
            testId="apprentice-failures"
            head={[
              'Signature',
              'Famille',
              'Modèle',
              'Occurrences',
              'Corrigé (même modèle)',
              'Escaladé',
              'Non résolu',
              'Corrections',
            ]}
            rows={fails.map((f) => [
              f.signature,
              f.family,
              f.model,
              f.count,
              f.recovered,
              f.escalated,
              f.unresolved,
              f.corrections.join(', '),
            ])}
          />
        ) : (
          <Empty>Aucun échec enregistré.</Empty>
        )}
      </Section>
      <Section
        title="Cache de capsules"
        hint="family × model × profileVersion × skillHash × contextHash × toolHash. CACHE HIT / MISS comptés réellement."
      >
        <div className="text-[12.5px]" data-testid="apprentice-cache">
          Entrées {cs.entries} · CACHE HIT {cs.hits} · CACHE MISS {cs.misses} · taux{' '}
          {cs.hitRate === null ? NM : pct(cs.hitRate)}
        </div>
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => capsuleCache.clear()}>
          Vider le cache
        </Button>
      </Section>
      <Scenario focus="memory" />
    </div>
  );
}

// ───────────────────────── payback & learning graph ─────────────────────────

function PaybackTab() {
  const log = useStore((x) => x.jevLog);
  const skills = useStore((x) => x.fabric.skills);
  const models = useStore((x) => x.models);
  const fab = useStore((x) => x.fabric);
  const s = apprenticeSettings();
  const pool = useMemo(() => freePool(models), [models]);
  const ch = useMemo(
    () => championsOf(log, pool, { settings: s, versions: fab.profileVersions }),
    [log, pool, s, fab.profileVersions],
  );
  const lp = useMemo(() => learningPayback(log), [log]);
  const g = useMemo(
    () => learningGraph(log, skills as never, ch.filter((c) => c.supremacy).length),
    [log, skills, ch],
  );
  const rows = ch.map((c) => ({ c, p: apprenticePayback(log, c.family, c.model) }));
  const withTeacher = log.filter((e) => e.apprentice?.teacher);
  return (
    <div className="space-y-3" data-testid="apprentice-payback">
      <Section
        title="APPRENTICE LEARNING GRAPH"
        hint="TEACHER → EXPERIENCE → SKILL → APPRENTICE → VALIDATION → CHAMPION → PREMIUM CALLS AVOIDED. Compteurs réels du JEV_LOG."
      >
        <div className="mb-2 flex flex-wrap items-center gap-1 text-[12px]">
          {[
            'TEACHER',
            'EXPERIENCE',
            'SKILL',
            'APPRENTICE',
            'VALIDATION',
            'CHAMPION',
            'PREMIUM CALLS AVOIDED',
          ].map((x, i, a) => (
            <span key={x} className="flex items-center gap-1">
              <Badge>{x}</Badge>
              {i < a.length - 1 && '→'}
            </span>
          ))}
        </div>
        <Table
          testId="learning-graph"
          head={[
            'Teacher calls',
            'Missions learned',
            'Skills learned (from a Teacher)',
            'Champions',
            'Premium calls avoided',
            'Estimated cost avoided',
            'Quality maintained (free, accepted)',
          ]}
          rows={[
            [
              g.teacherCalls,
              g.missionsLearned,
              g.skillsLearned,
              g.champions,
              g.premiumCallsAvoided,
              g.estimatedCostAvoided === null ? 'N/A' : fmt.usd(g.estimatedCostAvoided, 4),
              g.qualityMaintained === null
                ? NM
                : `${g.qualityMaintained.toFixed(1)} (n=${g.qualityN}, ${sampleLabelOf(g.qualityN)})`,
            ],
          ]}
        />
      </Section>
      <Section
        title="LEARNING PAYBACK (Teacher)"
        hint="Teacher cost vs premium calls avoided afterwards. Le coût évité est ESTIMÉ à partir du coût MESURÉ de la référence premium sur la même famille ; sans référence ou sans investissement : N/A."
      >
        <Table
          testId="learning-payback"
          head={[
            'Teacher investment',
            'JEV cost',
            'Benchmark cost',
            'Premium calls avoided',
            'Estimated avoided cost',
            'Net economic benefit',
            'Learning ROI',
          ]}
          rows={[
            [
              fmt.usd(lp.total.teacherInvestment, 4),
              fmt.usd(lp.total.jevCost, 6),
              fmt.usd(lp.total.benchmarkCost, 4),
              lp.total.premiumCallsAvoided,
              lp.total.avoidedCost === null ? 'N/A' : fmt.usd(lp.total.avoidedCost, 4),
              lp.total.netBenefit === null ? 'N/A' : fmt.usd(lp.total.netBenefit, 4),
              lp.total.roi === null ? 'N/A' : `${lp.total.roi.toFixed(1)}x`,
            ],
          ]}
        />
        <div className="mt-1 text-[11.5px] text-faint">{lp.total.note}</div>
      </Section>
      <Section title="APPRENTICE PAYBACK (par champion)">
        {rows.length ? (
          <Table
            head={[
              'Famille',
              'Apprenti',
              'Teacher investment',
              'JEV cost',
              'Benchmark cost',
              'Premium calls avoided',
              'Estimated avoided cost',
              'Net benefit',
              'Note',
            ]}
            rows={rows.map(({ c, p }) => [
              c.family,
              c.model,
              fmt.usd(p.teacherInvestment, 4),
              fmt.usd(p.jevCost, 6),
              fmt.usd(p.benchmarkCost, 4),
              p.premiumCallsAvoided,
              p.avoidedCost === null ? 'N/A' : fmt.usd(p.avoidedCost, 4),
              p.netBenefit === null ? 'N/A' : fmt.usd(p.netBenefit, 4),
              p.note,
            ])}
          />
        ) : (
          <Empty>Aucun champion : payback N/A.</Empty>
        )}
      </Section>
      <Section
        title="Teacher ROI (décisions enregistrées)"
        hint="TEACH si (valeur de réutilisation future + gain immédiat) > coût du Teacher. La valeur future est une PROJECTION fondée sur la fréquence mesurée de la famille ; N/A sans données."
      >
        {withTeacher.length ? (
          <Table
            head={['Date', 'Famille', 'Teacher', 'Coût', 'Issue']}
            rows={withTeacher
              .slice(-10)
              .reverse()
              .map((e) => [
                new Date(e.at).toLocaleString('fr-FR'),
                e.apprentice!.family,
                e.apprentice!.teacher,
                fmt.usd(e.apprentice!.teacherCost, 5),
                e.success ? 'réussi' : 'échec',
              ])}
          />
        ) : (
          <Empty>Aucun appel de Teacher : ROI N/A.</Empty>
        )}
        <TeacherSim />
      </Section>
    </div>
  );
}

/** Interactive Teacher ROI calculator: your own inputs, labelled as a calculation (not a measurement). */
function TeacherSim() {
  const [cost, setCost] = useState(0.08);
  const [gain, setGain] = useState(0.002);
  const [fut, setFut] = useState<number | null>(null);
  const r = teacherROI({ family: 'calcul', immediateGain: gain, teacherCost: cost, futureReuseValue: fut });
  return (
    <div className="mt-2 rounded-lg border border-line p-2 text-[12px]" data-testid="teacher-roi-calc">
      <div className="mb-1 font-medium">Calculateur (vos hypothèses — pas une mesure)</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          Coût Teacher ($)
          <Input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value) || 0)}
            className="w-20"
            aria-label="Coût Teacher"
          />
        </label>
        <label className="flex items-center gap-1">
          Gain immédiat ($)
          <Input
            type="number"
            step="0.001"
            value={gain}
            onChange={(e) => setGain(Number(e.target.value) || 0)}
            className="w-20"
            aria-label="Gain immédiat"
          />
        </label>
        <label className="flex items-center gap-1">
          Valeur future ($, vide = N/A)
          <Input
            type="number"
            step="0.01"
            value={fut ?? ''}
            onChange={(e) => setFut(e.target.value === '' ? null : Number(e.target.value))}
            className="w-24"
            aria-label="Valeur future"
          />
        </label>
      </div>
      <div className="mt-1">
        {r.reason}
        {r.roi !== null ? ` — Learning ROI ${r.roi.toFixed(1)}x` : ''}
      </div>
    </div>
  );
}

// ───────────────────────── demonstration (simulated) ─────────────────────────

function DemoTab() {
  const [steps, setSteps] = useState<ReturnType<typeof runSupremacyDemo> | null>(null);
  const champ = championFor('Calcule la provision ECL IFRS9 du portefeuille');
  return (
    <div className="space-y-3" data-testid="apprentice-demo">
      <Section
        title="Démonstration reproductible : IFRS9_ANALYSIS"
        hint={`${SIMULATED_LABEL} — les missions de cette démonstration sont des enregistrements SYNTHÉTIQUES passés dans les vrais moteurs (validation, champion, échelle de repli, apprentissage des échecs, ROI, payback). Elles ne sont jamais écrites dans le JEV_LOG réel ni présentées comme la mesure d’un vrai modèle. Pour une preuve réelle : onglet Apprentice Benchmark.`}
      >
        <Button size="sm" variant="primary" onClick={() => setSteps(runSupremacyDemo())}>
          <Play size={13} /> Lancer la démonstration (0 appel, 0 $)
        </Button>
        <span className="ml-2 text-[12px] text-faint">
          Champion réel actuel pour cette famille : {champ ? `${champ.model} (${champ.family})` : 'aucun'}
        </span>
        {steps && (
          <ol className="mt-2 space-y-2 text-[12.5px]" data-testid="demo-steps">
            {steps.map((st) => (
              <li key={st.n} className="rounded-lg border border-line p-2">
                <div className="mb-0.5 flex flex-wrap items-center gap-2 font-medium">
                  {st.title}
                  <Badge tone={STATUS_TONE[st.status as JevStatus] ?? 'neutral'}>{st.status}</Badge>
                  {st.champion && <Badge tone="ok">champion : {st.champion}</Badge>}
                  <Badge tone="neutral">{SIMULATED_LABEL}</Badge>
                </div>
                {st.lines.slice(1).map((l, i) => (
                  <div key={i} className="text-muted">
                    {l}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
