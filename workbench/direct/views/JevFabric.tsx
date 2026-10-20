// JEV COGNITIVE CONTROL CENTER — part 1: mission view, model council, expertise matrix,
// capability fabric, skill factory, skill lab, experience memory, failure replay.
// Every figure is read from the JEV_LOG / the registry; empty data says so, nothing is invented.
import { useMemo, useRef, useState } from 'react';
import { Play, RefreshCw, Square } from 'lucide-react';
import { Badge, Button, Input, Select, Toggle } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { setGithubToken, hasGithubToken } from '../lib/githubRegistry';
import {
  cognitiveCache,
  fabricSettings,
  mineSkillsNow,
  previewCouncil,
  refreshRegistry,
  registry,
  runCouncil,
  skillActions,
  type CouncilRun,
} from '../lib/fabric';
import { runSkillTest } from '../lib/fabricRun';
import { cfBenchTasks } from '../../server/jev/fabric/cfbench';
import {
  DIMENSIONS,
  MASSAMBA_MODEL_EXPERTISE_MATRIX,
  preferredModels,
  rankByDimension,
  type Dimension,
} from '../../server/jev/fabric/learning';
import {
  configKeyOf,
  failureLibrary,
  findSimilar,
  memories,
  qualityOfEntry,
  strategiesFor,
} from '../../server/jev/fabric/memory';
import {
  explainSelection,
  requirementsOf,
  selectCapabilities,
  type Selection,
} from '../../server/jev/fabric/registry';
import {
  compareVersions,
  promotionDecision,
  skillTestStats,
  type FabricSkill,
} from '../../server/jev/fabric/skills';
import type { CapabilityType } from '../../server/jev/fabric/types';
import type { JevLogEntry } from '../../server/jev/metrics';
import { Empty, NM, Section, StatusBadge, Table, fmt } from './fabricUi';

const lastOf = (log: JevLogEntry[]) => [...log].reverse().find((e) => e.config && !e.fabric);

// ───────────────────────── cognitive mission view ─────────────────────────

export function MissionPanel() {
  const log = useStore((s) => s.jevLog);
  const runs = log
    .filter((e) => e.config && !e.fabric)
    .slice(-30)
    .reverse();
  const [sel, setSel] = useState('');
  const e = runs.find((x) => x.id === sel) ?? lastOf(log);
  const fx = useMemo(
    () =>
      e
        ? findSimilar(
            log.filter((x) => x.id !== e.id),
            e.instruction ?? e.mission,
            { taskType: e.task, k: 3 },
          )
        : null,
    [log, e],
  );
  if (!e)
    return (
      <Empty>
        Aucune mission avec configuration cognitive enregistrée : envoyez une demande dans le Chat.
      </Empty>
    );
  const c = e.config!;
  const lib = failureLibrary(log);
  const next = strategiesFor(lib.strategies, { taskType: e.task, text: e.instruction ?? e.mission });
  const pref = preferredModels(log, e.task, 3);
  const q = qualityOfEntry(e);
  const step = (title: string, body: React.ReactNode) => (
    <div className="rounded-lg border border-line p-2">
      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">{title}</div>
      <div className="text-[12.5px]">{body}</div>
    </div>
  );
  return (
    <div className="space-y-3" data-testid="mission-view">
      <label className="flex items-center gap-2 text-[12px]">
        Mission
        <Select
          value={e.id}
          onChange={setSel}
          options={runs.map((r) => ({
            value: r.id,
            label: `${new Date(r.at).toLocaleTimeString('fr-FR')} · ${r.mission.slice(0, 60)}`,
          }))}
          title="Mission affichée"
        />
      </label>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {step('MISSION', e.mission)}
        {step(
          'TASK DNA',
          `${e.task} · difficulté ${e.experiment?.difficulty ?? NM} · risque ${e.experiment?.risk ?? NM} · données ${e.classification ?? 'PUBLIC'}`,
        )}
        {step(
          'COGNITIVE CONFIGURATION',
          <>
            <div>{c.model}</div>
            <div className="text-faint">
              stratégie {c.strategy} · JEV {c.jev} · Fabric {c.fabric ? 'actif' : 'inactif'} · conseil{' '}
              {c.councilSize} · évaluateur {c.evaluator}
            </div>
          </>,
        )}
        {step(
          'MODEL',
          <>
            {c.model}
            {c.explored && <Badge tone="warn">exploration</Badge>}
            <div className="text-faint">
              {pref.length
                ? `Mesurés pour « ${e.task} » : ${pref
                    .slice(0, 4)
                    .map((p) => `${p.model} (${Math.round(p.successRate * 100)} %, n=${p.n})`)
                    .join(' · ')}`
                : 'aucun modèle encore mesuré pour ce type de tâche'}
            </div>
          </>,
        )}
        {step('SKILLS', c.skills.length ? c.skills.join(', ') : 'aucune skill injectée')}
        {step(
          'TOOLS',
          <>
            {c.capabilities.length} exposé(s), {c.tools.length} utilisé(s)
            <div className="text-faint">{c.tools.slice(0, 8).join(', ') || '—'}</div>
          </>,
        )}
        {step('MEMORY', fx ? `${fx.summary}${fx.advice[0] ? ` — ${fx.advice[0]}` : ''}` : '—')}
        {step(
          'EXECUTION',
          `${e.acct?.modelCalls ?? e.calls} appel(s) · ${(e.tokensIn + e.tokensOut).toLocaleString('fr-FR')} tokens · ${fmt.usd(e.acct?.totalCost ?? e.cost + e.jevCost)} · ${fmt.ms(e.latencyMs)}`,
        )}
        {step(
          'EVALUATION',
          `qualité ${q === null ? NM : q} · ${e.success === null ? 'non jugé' : e.success ? 'réussi' : 'échec'} · ${e.corrections} correction(s) · ${e.escalations} escalade(s)`,
        )}
        {step(
          'LEARNING',
          <>
            {e.success === false
              ? `signature d’échec enregistrée (${lib.signatures.length} au total)`
              : 'expérience ajoutée à la mémoire'}
            <div className="text-faint">
              Ce qui changera la prochaine fois :{' '}
              {next.matched.length
                ? `${next.matched.length} stratégie(s) corrective(s) (${[...next.promptHints].slice(0, 1).join('')}${next.avoidModels.length ? `, éviter ${next.avoidModels.join(', ')}` : ''})`
                : 'rien de nouveau (aucune stratégie correctrice applicable)'}
            </div>
          </>,
        )}
      </div>
      <Section
        title="Pourquoi ?"
        hint="Décisions enregistrées pour cette mission (modèle, skills, outils, politiques, échecs passés)."
      >
        {c.why.length ? (
          <ul className="space-y-0.5 text-[12.5px]">
            {c.why.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        ) : (
          <Empty>
            Le Fabric n’était pas actif pour cette mission : aucune décision supplémentaire n’a été prise
            (comportement V5).
          </Empty>
        )}
        <div className="mt-2 text-[12px] text-muted">
          Pourquoi pas un autre modèle ?{' '}
          {pref.length > 1
            ? `Parmi les modèles mesurés (${pref.map((p) => p.model).join(', ')}), le choix suit la réussite puis le coût.`
            : 'Il n’y a pas assez de mesures pour comparer (≥ 5 missions par modèle).'}
        </div>
      </Section>
    </div>
  );
}

// ───────────────────────── model council ─────────────────────────

export function CouncilPanel() {
  const models = useStore((s) => s.models);
  const log = useStore((s) => s.jevLog);
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<'eco' | 'balanced' | 'performance' | 'max'>('balanced');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<CouncilRun | null>(null);
  const [plan, setPlan] = useState<ReturnType<typeof previewCouncil> | null>(null);
  const [err, setErr] = useState('');
  const toast = useStore((s) => s.toast);
  const cheap = useMemo(
    () =>
      models
        .filter((m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id))
        .sort((a, b) => (a.inputPrice ?? 0) - (b.inputPrice ?? 0))
        .slice(0, 80),
    [models],
  );
  const matrix = useMemo(() => MASSAMBA_MODEL_EXPERTISE_MATRIX(log), [log]);
  const doPlan = () => {
    setErr('');
    try {
      setPlan(previewCouncil(task, { mode, models: chosen.length ? chosen : undefined }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const go = async () => {
    if (
      !confirm(
        `Lancer le conseil : appels RÉELS facturés sur votre clé OpenRouter (${plan?.plan.size ?? chosen.length} modèle(s), plus un juge éventuel).`,
      )
    )
      return;
    setBusy(true);
    setErr('');
    try {
      const r = await runCouncil(task, {
        mode,
        models: chosen.length ? chosen : undefined,
        preview: plan ?? undefined,
      });
      setRun(r);
      toast('ok', `Conseil terminé : ${r.totalCost.toFixed(5)} $`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const cell = (model: string) => {
    const cells = Object.entries(matrix[model] ?? {}) as [
      Dimension,
      NonNullable<(typeof matrix)[string][Dimension]>,
    ][];
    const good = cells.filter(([, c]) => c.n >= 3 && (c.successRate ?? 0) >= 0.8).map(([d]) => d);
    const bad = cells.filter(([, c]) => c.n >= 3 && (c.successRate ?? 1) <= 0.5).map(([d]) => d);
    const n = cells.reduce((a, [, c]) => a + c.n, 0);
    return { good, bad, n };
  };
  const councils = log
    .filter((e) => e.fabric?.kind === 'council' && e.fabric.arm === 'council')
    .slice(-8)
    .reverse();
  return (
    <div className="space-y-3" data-testid="council">
      <Section
        title="Conseil de modèles"
        hint="JEV décide combien de modèles sont nécessaires (1 simple, 2 ambigu, 3+ critique) ; chaque modèle supplémentaire doit passer le gouverneur économique ; l’évaluateur est d’abord déterministe, un juge payant ne regarde que le point contesté."
      >
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          placeholder="Tâche à une seule étape (sans outil)…"
          className="mb-2 w-full rounded-lg border border-line bg-panel p-2 text-[12.5px]"
          aria-label="Tâche du conseil"
        />
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1">
            Mode
            <Select
              value={mode}
              onChange={(v) => setMode(v as typeof mode)}
              options={['eco', 'balanced', 'performance', 'max'].map((m) => ({
                value: m,
                label: m.toUpperCase(),
              }))}
              title="Mode du conseil"
            />
          </label>
          <label className="flex items-center gap-1">
            Modèles imposés (optionnel)
            <Select
              value=""
              onChange={(v) => v && setChosen((c) => (c.includes(v) ? c : [...c, v].slice(0, 4)))}
              options={[
                { value: '', label: 'ajouter…' },
                ...cheap.map((m) => ({ value: m.id, label: `${m.id} (${m.inputPrice}$/M)` })),
              ]}
              title="Ajouter un modèle"
            />
          </label>
          {chosen.map((m) => (
            <button
              key={m}
              className="rounded bg-hover px-1.5 py-0.5"
              onClick={() => setChosen((c) => c.filter((x) => x !== m))}
              title="Retirer"
            >
              {m} ✕
            </button>
          ))}
          <Button size="sm" disabled={!task.trim()} onClick={doPlan}>
            Planifier (aucun appel)
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!task.trim() || busy || !plan}
            onClick={() => void go()}
          >
            <Play size={13} /> Lancer le conseil
          </Button>
        </div>
        {err && <div className="mb-2 text-[12px] text-err">{err}</div>}
        {plan && (
          <div className="mb-2 rounded-lg border border-line p-2 text-[12px]" data-testid="council-plan">
            <div className="font-medium">
              Plan : {plan.plan.size} modèle(s) sur {plan.plan.wanted} souhaité(s) · évaluateur{' '}
              {plan.plan.evaluator}
            </div>
            <div className="text-muted">{plan.plan.reason}</div>
            <ul className="mt-1 space-y-0.5">
              {plan.plan.members.map((m) => (
                <li key={m.id}>
                  • {m.id} (≈ {fmt.usd(m.estCost)}
                  {m.free ? ', prix 0 $' : ''})
                </li>
              ))}
              {plan.plan.decisions.map((d, i) => (
                <li key={i} className={d.use ? '' : 'text-warn'}>
                  {d.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {run && (
          <div data-testid="council-result">
            <Table
              head={[
                'MODEL',
                'QUALITY',
                'SUCCESS',
                'COST',
                'LATENCY',
                'STRENGTHS',
                'WEAKNESSES',
                'TASK FIT',
                'CONFIDENCE',
                '',
              ]}
              rows={run.evaluation.members.map((m) => {
                const c = cell(m.model);
                return [
                  m.model,
                  m.qa ? m.qa.score : NM,
                  m.expected === null
                    ? m.ok
                      ? 'non jugé (pas de vérité terrain)'
                      : 'échec'
                    : m.expected
                      ? '✓'
                      : '✗',
                  fmt.usd(m.cost),
                  fmt.ms(m.ms),
                  c.good.join(', ') || NM,
                  c.bad.join(', ') || NM,
                  m.qa ? `${m.qa.score}/100 sur cette tâche` : NM,
                  fmt.num(c.n / (c.n + 10), 2),
                  run.winner?.model === m.model ? <Badge tone="ok">WINNER</Badge> : '',
                ];
              })}
            />
            <div className="mt-1 text-[12px]">
              WHY : {run.why}
              {run.judge ? ` · juge ${run.judge.model} (${fmt.usd(run.judge.cost)})` : ''} · coût total du
              conseil {fmt.usd(run.totalCost)}
            </div>
          </div>
        )}
      </Section>
      <Section title="Conseils passés (mesurés)">
        {councils.length ? (
          <Table
            head={['Quand', 'Gagnant', 'Taille', 'Qualité', 'Coût total', 'Pourquoi']}
            rows={councils.map((e) => [
              new Date(e.at).toLocaleString('fr-FR'),
              e.model,
              e.config?.councilSize ?? 1,
              e.qualityMeasured ?? NM,
              fmt.usd(e.acct?.totalCost),
              e.config?.why?.[1] ?? '',
            ])}
          />
        ) : (
          <Empty>Aucun conseil lancé : rien n’est affiché sans exécution réelle.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── expertise matrix ─────────────────────────

export function ExpertisePanel() {
  const log = useStore((s) => s.jevLog);
  const m = useMemo(() => MASSAMBA_MODEL_EXPERTISE_MATRIX(log), [log]);
  const [dim, setDim] = useState<Dimension>('CODING');
  const models = Object.keys(m);
  const rank = rankByDimension(m, dim, 3);
  return (
    <div className="space-y-3" data-testid="expertise">
      <Section
        title="MASSAMBA_MODEL_EXPERTISE_MATRIX"
        hint="Alimentée progressivement par les missions réelles du JEV_LOG, les tournois et les conseils. Une cellule vide = aucune mesure (jamais un score par défaut). Cellule : réussite · qualité · (n)."
      >
        {models.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr>
                    <th className="px-1 py-1 text-left text-faint">Modèle</th>
                    {DIMENSIONS.map((d) => (
                      <th key={d} className="px-1 py-1 text-left font-normal text-faint">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((mod) => (
                    <tr key={mod} className="border-t border-line">
                      <td className="whitespace-nowrap px-1 py-1 font-medium">{mod}</td>
                      {DIMENSIONS.map((d) => {
                        const c = m[mod]![d];
                        return (
                          <td
                            key={d}
                            className={cx('px-1 py-1 whitespace-nowrap', c && c.n < 3 && 'text-faint')}
                            title={
                              c
                                ? `n=${c.n}, coût ${fmt.usd(c.cost)}, latence ${fmt.ms(c.latencyMs)}, robustesse ${fmt.pct(c.robustness)}, outils ${fmt.pct(c.toolAccuracy)}, confiance ${c.confidence}`
                                : NM
                            }
                          >
                            {c
                              ? `${fmt.pct(c.successRate)} · ${c.quality === null ? NM : Math.round(c.quality)} (${c.n})`
                              : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[12px]">
              Classement
              <Select
                value={dim}
                onChange={(v) => setDim(v as Dimension)}
                options={DIMENSIONS.map((d) => ({ value: d, label: d }))}
                title="Dimension"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  download(
                    'massamba-model-expertise-matrix.json',
                    JSON.stringify(m, null, 2),
                    'application/json',
                  )
                }
              >
                Exporter la matrice (JSON)
              </Button>
            </div>
            {rank.length ? (
              <Table
                head={[
                  '#',
                  'Modèle',
                  'Réussite',
                  'Qualité',
                  'Coût',
                  'Latence',
                  'Robustesse',
                  'Valeur / $',
                  'Confiance',
                ]}
                rows={rank.map((r) => [
                  r.rank,
                  r.model,
                  fmt.pct(r.cell.successRate),
                  fmt.num(r.cell.quality, 0),
                  fmt.usd(r.cell.cost),
                  fmt.ms(r.cell.latencyMs),
                  fmt.pct(r.cell.robustness),
                  fmt.num(r.valuePerDollar, 0),
                  fmt.num(r.cell.confidence, 2),
                ])}
                className="mt-1"
              />
            ) : (
              <Empty>Moins de 3 observations par modèle pour {dim} : pas de classement.</Empty>
            )}
          </>
        ) : (
          <Empty>La matrice est vide : elle se remplit avec les missions, tournois et conseils réels.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── capability fabric ─────────────────────────

const FILTERS: { id: string; label: string; types?: CapabilityType[] }[] = [
  { id: 'ALL', label: 'ALL' },
  {
    id: 'TOOLS',
    label: 'TOOLS',
    types: ['tool', 'filesystem', 'spreadsheet', 'document', 'web', 'terminal', 'image'],
  },
  { id: 'PLUGINS', label: 'PLUGINS', types: ['plugin'] },
  { id: 'CONNECTORS', label: 'CONNECTORS', types: ['connector', 'github', 'mcp'] },
  { id: 'MCP', label: 'MCP', types: ['mcp'] },
  { id: 'GITHUB', label: 'GITHUB', types: ['github'] },
  { id: 'DATA', label: 'DATA', types: ['data', 'spreadsheet'] },
  { id: 'BROWSER', label: 'BROWSER', types: ['browser'] },
  { id: 'CODE', label: 'CODE', types: ['code', 'terminal'] },
  { id: 'MEMORY', label: 'MEMORY', types: ['memory'] },
  { id: 'SKILLS', label: 'SKILLS', types: ['skill'] },
  { id: 'MODELS', label: 'MODELS', types: ['model'] },
];

export function CapabilityPanel() {
  const [, bump] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [mission, setMission] = useState('Analyse ce fichier Excel et identifie les anomalies IFRS9');
  const [sel, setSel] = useState<Selection | null>(null);
  useStore((s) => s.jevLog);
  const f = FILTERS.find((x) => x.id === filter)!;
  const caps = registry.list({ types: f.types }).slice(0, 400);
  const refresh = async (h: boolean) => {
    setBusy(true);
    await refreshRegistry(h);
    setBusy(false);
    bump((x) => x + 1);
  };
  const adapters = registry.adaptersList();
  const gh = registry.list({ types: ['github'] });
  const ghStatus = gh.find((c) => c.id === 'github:search_repositories')?.status ?? 'UNAVAILABLE';
  const simulate = () => {
    const req = requirementsOf('data', mission, /\b(fichier|excel|xlsx|csv)\b/i.test(mission));
    setSel(selectCapabilities(registry, req, { max: fabricSettings().maxCapabilities }));
  };
  return (
    <div className="space-y-3" data-testid="capabilities">
      <Section
        title={`Capability Fabric — ${registry.size} capacité(s) découverte(s)`}
        hint="Le registre peut contenir des centaines de capacités ; le sélecteur n’expose au modèle que le minimum nécessaire. Une nouvelle capacité apparaît dès qu’un adaptateur la déclare."
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
          <Button size="sm" disabled={busy} onClick={() => void refresh(false)}>
            <RefreshCw size={13} /> Découvrir
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void refresh(true)}
            title="Vérifie la santé de chaque adaptateur (GitHub : appel réseau réel)"
          >
            Vérifier la santé
          </Button>
          {FILTERS.map((x) => (
            <button
              key={x.id}
              onClick={() => setFilter(x.id)}
              className={cx(
                'rounded px-1.5 py-0.5 text-[11.5px]',
                filter === x.id ? 'bg-accent/20 text-accent' : 'bg-hover text-muted',
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <Table
          head={['Adaptateur', 'Fournisseur', 'État', 'Détail']}
          rows={adapters.map((a) => {
            const h = registry.healthOf(a.id);
            return [
              a.id,
              a.provider,
              h ? <StatusBadge key="s" s={h.status} /> : <Badge key="s">non vérifié</Badge>,
              h?.detail ?? 'cliquez « Vérifier la santé »',
            ];
          })}
          className="mb-2"
        />
        {caps.length ? (
          <Table
            testId="cap-table"
            head={['NAME', 'TYPE', 'STATUS', 'PERMISSIONS', 'RISK', 'SUCCESS', 'COST', 'LATENCY', 'USED BY']}
            rows={caps.map((c) => [
              c.name,
              c.type,
              <StatusBadge key="s" s={c.status} />,
              c.permissions.join(', ') + (c.approvalRequired ? ' · approbation' : ''),
              c.risk,
              c.samples ? `${fmt.pct(c.successRate)} (n=${c.samples})` : NM,
              c.cost === null ? NM : fmt.usd(c.cost),
              fmt.ms(c.latency),
              c.usedBy.join(', ') || '—',
            ])}
          />
        ) : (
          <Empty>Aucune capacité chargée : cliquez « Découvrir ».</Empty>
        )}
      </Section>
      <Section
        title="GitHub — GitHubCapabilityAdapter"
        hint="CONNECTED (jeton présent) / PARTIAL (lecture publique sans jeton) / UNAVAILABLE. Aucun jeton n’entre dans un prompt, un log, un export ou une mémoire ; il reste en mémoire vive de cet onglet. Les écritures (fichier, PR) sont préparées, jamais exécutées sans approbation explicite."
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]" data-testid="github-status">
          <StatusBadge s={ghStatus} />
          <span>{hasGithubToken() ? 'jeton présent (masqué)' : 'aucun jeton'}</span>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Jeton GitHub (optionnel, mémoire vive)"
            autoComplete="off"
            aria-label="Jeton GitHub"
            className="w-72"
          />
          <Button
            size="sm"
            disabled={!token.trim()}
            onClick={() => {
              setGithubToken(token);
              setToken('');
              void refresh(true);
            }}
          >
            Utiliser
          </Button>
        </div>
      </Section>
      <Section
        title="Sélection minimale : quelles capacités pour cette mission ?"
        hint="Calcul réel du sélecteur sur le registre courant (aucun appel de modèle)."
      >
        <div className="mb-2 flex gap-2">
          <Input
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            aria-label="Mission à analyser"
          />
          <Button size="sm" onClick={simulate} disabled={!registry.size}>
            Sélectionner
          </Button>
        </div>
        {sel ? (
          <div className="text-[12px]" data-testid="cap-selection">
            <ul className="mb-1 space-y-0.5">
              {explainSelection(sel).map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
            <Table
              head={['Retenue', 'Score', 'Pourquoi']}
              rows={sel.selected.map((x) => [x.cap.name, x.score, x.why])}
            />
            <details className="mt-1">
              <summary className="cursor-pointer text-faint">{sel.rejected.length} écartée(s)</summary>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
                {sel.rejected.slice(0, 120).map((x, i) => (
                  <li key={i}>
                    {x.cap.name} — {x.why}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <Empty>Saisissez une mission puis « Sélectionner ».</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── skill factory ─────────────────────────

export function SkillFactoryPanel() {
  const skills = useStore((s) => s.fabric.skills);
  const log = useStore((s) => s.jevLog);
  const [rep, setRep] = useState<{ added: number; rejected: { key: string; reason: string }[] } | null>(null);
  const [cmp, setCmp] = useState<{ id: string; a: string; b: string } | null>(null);
  const toast = useStore((s) => s.toast);
  const groups: [string, FabricSkill[]][] = [
    ['Candidate Skills', skills.filter((s) => s.status === 'candidate')],
    ['Validated Skills', skills.filter((s) => s.status === 'validated')],
    ['Deprecated Skills', skills.filter((s) => s.status === 'deprecated')],
    ['Failed Skills', skills.filter((s) => s.status === 'failed')],
  ];
  const mine = () => {
    const r = mineSkillsNow();
    setRep({ added: r.candidates.length, rejected: r.rejected.slice(0, 12) });
    toast(r.candidates.length ? 'ok' : 'info', `${r.candidates.length} skill(s) candidate(s) créée(s)`);
  };
  return (
    <div className="space-y-3" data-testid="skill-factory">
      <Section
        title="Skill Factory"
        hint="MISSION → EXÉCUTION → ÉVALUATION → DÉTECTION DE MOTIFS → GÉNÉRALISATION → SKILL CANDIDATE → TEST → VALIDATION. Une réponse unique ne devient jamais une skill : il faut ≥ 3 réussites de qualité, sur ≥ 2 consignes différentes, ≥ 80 % de réussite du groupe, puis un test WITH / WITHOUT concluant."
      >
        <div className="mb-2 flex items-center gap-2">
          <Button size="sm" variant="primary" onClick={mine}>
            Extraire des skills candidates ({log.length} mission(s) en mémoire)
          </Button>
          <Badge>{skills.length} skill(s)</Badge>
        </div>
        {rep && (
          <div className="mb-2 text-[12px]" data-testid="mine-report">
            <div>{rep.added} candidate(s) créée(s).</div>
            {rep.rejected.length > 0 && (
              <details>
                <summary className="cursor-pointer text-faint">
                  Groupes non retenus (pourquoi une réussite isolée n’est pas une skill)
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {rep.rejected.map((r, i) => (
                    <li key={i}>
                      {r.key} — {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {groups.map(([title, list]) => (
          <div key={title} className="mb-3">
            <div className="mb-1 text-[12.5px] font-medium">
              {title} ({list.length})
            </div>
            {list.length ? (
              <Table
                head={[
                  'Skill',
                  'Version',
                  'Domaine',
                  'Impact (qualité)',
                  'Coût / réussie',
                  'Échantillon',
                  'Confiance',
                  'Actions',
                ]}
                rows={list.map((s) => {
                  const v = s.versions.find((x) => x.version === (s.activeVersion ?? s.currentVersion))!;
                  const b = v.benchmark;
                  return [
                    <span key="n" title={v.promptTemplate}>
                      {s.name}
                    </span>,
                    `${s.currentVersion}${s.activeVersion ? ` (active ${s.activeVersion})` : ''}`,
                    s.domain,
                    b?.deltaQuality == null
                      ? NM
                      : `${b.deltaQuality >= 0 ? '+' : ''}${b.deltaQuality.toFixed(1)}`,
                    b?.deltaCostPerSuccess == null ? NM : `${(b.deltaCostPerSuccess * 100).toFixed(0)} %`,
                    b ? `n=${b.n}` : 'non testée',
                    fmt.num(v.confidence, 2),
                    <div key="a" className="flex flex-wrap gap-1">
                      <button
                        className="rounded bg-hover px-1.5"
                        disabled={!v.benchmark || s.status === 'validated'}
                        title={v.benchmark ? 'Promouvoir cette version' : 'Test WITH / WITHOUT requis'}
                        onClick={() => {
                          try {
                            skillActions.promote(s.id, s.currentVersion);
                          } catch (e) {
                            toast('err', (e as Error).message);
                          }
                        }}
                      >
                        PROMOTE
                      </button>
                      <button className="rounded bg-hover px-1.5" onClick={() => skillActions.rollback(s.id)}>
                        ROLLBACK
                      </button>
                      <button
                        className="rounded bg-hover px-1.5"
                        onClick={() => skillActions.deprecate(s.id)}
                      >
                        DEPRECATE
                      </button>
                      <button
                        className="rounded bg-hover px-1.5"
                        onClick={() => {
                          const n = prompt('Nom de la copie', `${s.name}_COPIE`);
                          if (n) skillActions.clone(s.id, n);
                        }}
                      >
                        CLONE
                      </button>
                      <button
                        className="rounded bg-hover px-1.5"
                        disabled={s.versions.length < 2}
                        onClick={() =>
                          setCmp({ id: s.id, a: s.versions[0]!.version, b: s.versions.at(-1)!.version })
                        }
                      >
                        COMPARE
                      </button>
                    </div>,
                  ];
                })}
              />
            ) : (
              <Empty>Aucune.</Empty>
            )}
          </div>
        ))}
        {cmp &&
          (() => {
            const s = skills.find((x) => x.id === cmp.id)!;
            return (
              <div className="rounded-lg border border-line p-2 text-[12px]">
                <div className="mb-1 font-medium">
                  Comparaison {s.name} : v{cmp.a} ↔ v{cmp.b}
                </div>
                <Table
                  head={['Champ', `v${cmp.a}`, `v${cmp.b}`]}
                  rows={compareVersions(s, cmp.a, cmp.b).map((c) => [
                    c.field,
                    c.a.slice(0, 160),
                    c.b.slice(0, 160),
                  ])}
                />
                <details className="mt-1">
                  <summary className="cursor-pointer text-faint">Historique des versions</summary>
                  <ul>
                    {s.versions.map((v) => (
                      <li key={v.version}>
                        v{v.version} — {v.status} — {v.reason}
                        {v.regressions.length ? ` — régressions : ${v.regressions.join(' ; ')}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            );
          })()}
      </Section>
    </div>
  );
}

// ───────────────────────── skill lab ─────────────────────────

export function SkillLabPanel() {
  const skills = useStore((s) => s.fabric.skills);
  const log = useStore((s) => s.jevLog);
  const models = useStore((s) => s.models);
  const toast = useStore((s) => s.toast);
  const [sid, setSid] = useState('');
  const [reps, setReps] = useState(5);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const stop = useRef({ stop: false });
  const skill = skills.find((s) => s.id === sid) ?? skills[0];
  const cheap = useMemo(
    () =>
      models
        .filter((m) => m.capabilities.tools && (m.inputPrice ?? 0) > 0 && !/:(free|batch)$/.test(m.id))
        .sort((a, b) => (a.inputPrice ?? 0) - (b.inputPrice ?? 0))
        .slice(0, 80),
    [models],
  );
  const fixed = model || cheap[0]?.id || '';
  if (!skill)
    return <Empty>Aucune skill à tester : extrayez d’abord des candidates dans « Skill Factory ».</Empty>;
  const v = skill.versions.find((x) => x.version === skill.currentVersion)!;
  const catMap: Record<string, string[]> = {
    data: ['data', 'complex'],
    code: ['coding'],
    research: ['simple'],
    document: ['document'],
    writing: ['simple'],
    chat: ['simple'],
    browser: ['multitool'],
    review: ['coding'],
  };
  const cats = catMap[skill.domain] ?? ['simple'];
  const tasks = cfBenchTasks()
    .filter((t) => cats.includes(t.category))
    .slice(0, 10);
  const st = skillTestStats(log, skill.id, v.version);
  const dec = promotionDecision(st);
  const run = async () => {
    if (
      !confirm(
        `Test WITH / WITHOUT : ${tasks.length} tâche(s) × 2 bras × ${reps} répétition(s) = ${tasks.length * 2 * reps} exécutions RÉELLES facturées (modèle ${fixed}).`,
      )
    )
      return;
    stop.current.stop = false;
    await runSkillTest({ skill, version: v, tasks, reps, model: fixed }, (m) => setBusy(m), stop.current);
    setBusy(null);
    toast('ok', 'Test terminé : consultez la décision.');
  };
  return (
    <div className="space-y-3" data-testid="skill-lab">
      <Section
        title="Skill Test Lab — WITHOUT SKILL vs WITH SKILL"
        hint="Même tâche, même modèle imposé, même niveau JEV ; la skill n’est injectée que dans le bras WITH. Une skill n’est promue que si la qualité ou le coût / mission réussie s’améliore sans régression (n ≥ 5 paires)."
      >
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px]">
          <Select
            value={skill.id}
            onChange={setSid}
            options={skills.map((s) => ({ value: s.id, label: `${s.name} (${s.status})` }))}
            title="Skill à tester"
          />
          <label className="flex items-center gap-1">
            Répétitions
            <Select
              value={String(reps)}
              onChange={(x) => setReps(Number(x))}
              options={[3, 5, 10].map((n) => ({ value: String(n), label: String(n) }))}
              title="Répétitions"
            />
          </label>
          <label className="flex items-center gap-1">
            Modèle
            <Select
              value={fixed}
              onChange={setModel}
              options={cheap.map((m) => ({ value: m.id, label: `${m.id} (${m.inputPrice}$/M)` }))}
              title="Modèle imposé"
            />
          </label>
          <Button size="sm" variant="primary" disabled={Boolean(busy) || !fixed} onClick={() => void run()}>
            <Play size={13} /> Lancer ({tasks.length * 2 * reps})
          </Button>
          {busy && (
            <Button size="sm" variant="ghost" onClick={() => (stop.current.stop = true)}>
              <Square size={13} /> Arrêter
            </Button>
          )}
          {busy && <span className="text-info">{busy}</span>}
        </div>
        <div className="mb-2 text-[12px] text-muted">
          Cas de test : {tasks.map((t) => t.key).join(', ')} (catégories du benchmark cognitif :{' '}
          {cats.join(', ')}). La skill testée : {v.name} v{v.version}.
        </div>
        <div data-testid="skill-decision">
          <Table
            head={['Mesure', 'AVEC skill', 'SANS skill', 'Δ']}
            rows={[
              ['Paires (n)', st.pairs, st.pairs, ''],
              [
                'Taux de réussite',
                fmt.pct(st.successWith),
                fmt.pct(st.successWithout),
                st.success.n ? `${((st.success.meanDelta ?? 0) * 100).toFixed(0)} pts` : NM,
              ],
              ['Qualité', '', '', st.quality.n ? `${st.quality.meanDelta!.toFixed(1)} pts` : NM],
              [
                'Coût / mission réussie',
                fmt.usd(st.costPerSuccessWith),
                fmt.usd(st.costPerSuccessWithout),
                st.costPerSuccessChange === null ? NM : `${(st.costPerSuccessChange * 100).toFixed(0)} %`,
              ],
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
            Décision :{' '}
            <Badge tone={dec.verdict === 'promote' ? 'ok' : dec.verdict === 'fail' ? 'err' : 'neutral'}>
              {dec.verdict === 'promote'
                ? 'PROMOUVOIR'
                : dec.verdict === 'fail'
                  ? 'ÉCHEC'
                  : 'RESTE CANDIDATE'}
            </Badge>
            <span className="text-muted">{dec.reasons.join(' ; ')}</span>
            <Button
              size="sm"
              disabled={!dec.benchmark}
              onClick={() => skillActions.recordTest(skill.id, v.version, dec)}
            >
              Enregistrer le résultat dans la skill
            </Button>
            <Button
              size="sm"
              disabled={dec.verdict !== 'promote'}
              onClick={() => {
                skillActions.recordTest(skill.id, v.version, dec);
                skillActions.promote(skill.id, v.version);
                toast('ok', 'Skill promue.');
              }}
            >
              Promouvoir
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ───────────────────────── experience memory ─────────────────────────

export function MemoryPanel() {
  const log = useStore((s) => s.jevLog);
  const m = useMemo(() => memories(log), [log]);
  const [q, setQ] = useState('');
  const ans = q.trim() ? findSimilar(log, q) : null;
  const card = (k: string, v: number) => (
    <div key={k} className="rounded-lg border border-line p-2">
      <div className="text-[11px] text-faint">{k}</div>
      <div className="text-[15px] font-medium tabular-nums">{v}</div>
    </div>
  );
  return (
    <div className="space-y-3" data-testid="memory">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        {[
          ['SUCCESS', m.success.length],
          ['FAILURE', m.failure.length],
          ['NEAR-MISS', m.nearMiss.length],
          ['CORRECTION', m.correction.length],
          ['TOOL', m.tool.length],
          ['MODEL', m.model.length],
          ['SKILL', m.skill.length],
          ['ROUTING', m.routing.length],
        ].map(([k, v]) => card(String(k), Number(v)))}
      </div>
      <Section
        title="Ai-je déjà rencontré ce problème ?"
        hint="Recherche dans la mémoire d’expérience (similarité de mots-clés sur les consignes enregistrées, redactées)."
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Décrivez le problème…"
          aria-label="Recherche dans la mémoire"
        />
        {ans && (
          <div className="mt-2 text-[12.5px]" data-testid="memory-answer">
            <div className="font-medium">{ans.summary}</div>
            {ans.advice.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {ans.advice.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            )}
            {ans.matches.length > 0 && (
              <Table
                head={['Similarité', 'Tâche', 'Modèle', 'Résultat', 'Qualité', 'Coût', 'Cause']}
                rows={ans.matches.map((x) => [
                  fmt.num(x.similarity, 2),
                  x.exp.task,
                  x.exp.model,
                  x.exp.success === null ? 'non jugé' : x.exp.success ? 'réussi' : 'échec',
                  x.exp.quality ?? NM,
                  fmt.usd(x.exp.cost),
                  x.exp.cause ?? '—',
                ])}
                className="mt-1"
              />
            )}
          </div>
        )}
      </Section>
      <Section title="Mémoire des modèles, outils et routage (mesurée)">
        {log.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <Table
              head={['Modèle', 'Missions', 'Réussite', 'Qualité', 'Coût']}
              rows={m.model.map((x) => [
                x.model,
                x.runs,
                fmt.pct(x.successRate),
                fmt.num(x.quality, 0),
                fmt.usd(x.cost),
              ])}
            />
            <Table
              head={['Outil', 'Usages', 'Échecs', 'Réussite des missions']}
              rows={m.tool.slice(0, 20).map((x) => [x.tool, x.uses, x.failures, fmt.pct(x.successRate)])}
            />
            <Table
              head={['Tâche', 'Modèle', 'Missions', 'Réussite', 'Escalades']}
              rows={m.routing
                .slice(0, 20)
                .map((x) => [x.taskType, x.model, x.runs, fmt.pct(x.successRate), x.escalations])}
            />
          </div>
        ) : (
          <Empty>Aucune expérience enregistrée.</Empty>
        )}
      </Section>
    </div>
  );
}

// ───────────────────────── failure replay ─────────────────────────

export function ReplayPanel() {
  const log = useStore((s) => s.jevLog);
  const lib = useMemo(() => failureLibrary(log), [log]);
  const bad = log
    .filter((e) => e.success === false || e.corrections > 0 || e.retries > 0)
    .slice(-40)
    .reverse();
  const [sel, setSel] = useState('');
  const e = bad.find((x) => x.id === sel) ?? bad[0];
  const sig = e
    ? lib.signatures.find(
        (s) =>
          lib.strategies.some((t) => t.signatureId === s.id) && s.taskType === e.task && s.model === e.model,
      )
    : undefined;
  const hints = e
    ? strategiesFor(lib.strategies, { taskType: e.task, text: e.instruction ?? e.mission })
    : null;
  return (
    <div className="space-y-3" data-testid="replay">
      <Section
        title="Failure Replay"
        hint="Pourquoi, à quelle étape, quel modèle, quel outil, quelle skill, quelle décision JEV — puis une signature d’échec et une stratégie corrective que la prochaine mission similaire exploite."
      >
        {e ? (
          <>
            <label className="mb-2 flex items-center gap-2 text-[12px]">
              Mission en échec / corrigée
              <Select
                value={e.id}
                onChange={setSel}
                options={bad.map((x) => ({
                  value: x.id,
                  label: `${new Date(x.at).toLocaleTimeString('fr-FR')} · ${x.success === false ? 'échec' : 'retouche'} · ${x.mission.slice(0, 50)}`,
                }))}
                title="Mission à rejouer"
              />
            </label>
            <div className="mb-2 grid gap-2 md:grid-cols-3 text-[12px]">
              <div className="rounded-lg border border-line p-2">
                Modèle : {e.model}
                <br />
                Configuration : {configKeyOf(e)}
                <br />
                Skills : {e.skillsUsed?.join(', ') || '—'}
              </div>
              <div className="rounded-lg border border-line p-2">
                Outils : {e.toolsUsed?.join(', ') || '—'}
                <br />
                Erreurs d’outils : {e.toolErrors?.join(' | ') || '—'}
                <br />
                Arrêt : {e.stopReason ?? '—'}
              </div>
              <div className="rounded-lg border border-line p-2">
                Cause : {sig?.cause ?? '—'}
                <br />
                Étape : {sig?.stage ?? '—'}
                <br />
                {sig?.hypothesis ?? 'pas de signature (mission non défaillante)'}
              </div>
            </div>
            <div className="mb-1 text-[12.5px] font-medium">Rejeu des décisions JEV</div>
            {e.checkpoints.length ? (
              <ol
                className="mb-2 space-y-0.5 border-l border-line pl-3 text-[11.5px]"
                data-testid="replay-trail"
              >
                {e.checkpoints.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span>{' '}
                    <span className="text-muted">{c.decision}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>Aucun checkpoint enregistré.</Empty>
            )}
            <div className="text-[12.5px] font-medium">Ce que la prochaine mission similaire fera</div>
            {hints && hints.matched.length ? (
              <ul className="space-y-0.5 text-[12px]" data-testid="replay-next">
                {hints.matched.map((m) => (
                  <li key={m.id}>
                    • {m.rationale} Actions :{' '}
                    {m.actions.map((a) => a.kind + (a.value ? `(${a.value.slice(0, 40)})` : '')).join(', ')}{' '}
                    (confiance {m.confidence})
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                Pas encore de stratégie corrective applicable à cette mission (il faut des échecs répétés de
                même signature).
              </Empty>
            )}
          </>
        ) : (
          <Empty>Aucun échec ni correction enregistré.</Empty>
        )}
      </Section>
      <Section
        title={`Bibliothèque de signatures (${lib.signatures.length}) et stratégies correctives (${lib.strategies.length})`}
      >
        {lib.strategies.length ? (
          <Table
            head={['Tâche', 'Cause', 'Occurrences', 'Confiance', 'Actions', 'Mots-clés']}
            rows={lib.strategies.map((s) => [
              s.taskType,
              lib.signatures.find((x) => x.id === s.signatureId)?.cause ?? '',
              s.occurrences,
              s.confidence,
              s.actions.map((a) => a.kind).join(', '),
              s.keywords.slice(0, 5).join(', '),
            ])}
          />
        ) : (
          <Empty>Aucune signature : elles se créent à partir des échecs réels.</Empty>
        )}
      </Section>
    </div>
  );
}

export { Toggle, cognitiveCache };
