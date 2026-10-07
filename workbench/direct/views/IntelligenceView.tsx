// INTELLIGENCE space: how MASSAMBA chooses its own means — model router,
// benchmark fusion, agent × model co-design, GitHub discovery + registry,
// skills, MCP, free-first capabilities, cost optimizer, routing log,
// mission telemetry, security, and the built-in documentation.
import { useMemo, useRef, useState } from 'react';
import { Download, GitBranch, RefreshCw, Search, ShieldCheck, Upload } from 'lucide-react';
import { Badge, Button, Input, Select, Tabs, Textarea } from '../../web/components/ui';
import { cx, fmtCost, fmtDuration, fmtTokens } from '../../web/lib/format';
import { useStore } from '../lib/store';
import { connectedTools } from '../lib/mcp';
import { analyzeTask } from '../../server/llm/routing';
import { intelData } from '../../server/llm/modelIntel';
import { taskDna } from '../../server/agent/intelligence';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import {
  DEFAULT_ENGINE,
  DEFAULT_WEIGHTS,
  QUALITY_FLOOR,
  WEIGHT_LABEL,
  decideRoute,
  type EngineSettings,
  type RoutingWeights,
} from '../../server/engine/decision';
import {
  HALF_LIFE_DAYS,
  KIND_LABEL,
  fuse,
  modelEvidence,
  type ExternalBenchmark,
} from '../../server/engine/evidence';
import { SKILL_REGISTRY, selectSkills } from '../../server/engine/skills';
import { buildLoadout, codesign } from '../../server/engine/loadout';
import {
  CAPABILITIES,
  GITHUB_SNAPSHOT,
  KIND_LABEL as OPT_KIND,
  mcpRegistry,
  optionsFor,
} from '../../server/engine/capabilities';
import { BAND_LABEL, DISCOVERY_QUERIES, securityReview, type RepoFacts } from '../../server/engine/github';
import { STATUS_LABEL, type RegistryResource } from '../../server/engine/registry';
import { metrics, savings } from '../../server/engine/telemetry';
import {
  addToRegistry,
  checkUpdate,
  discoverOnGithub,
  hasGithubToken,
  installResource,
  move,
  reviewResource,
  rollbackResource,
  setEnabled,
  setGithubToken,
} from '../lib/githubRegistry';
import { TOOLS } from '../lib/tools';
import { RoutingCard } from './RoutingCard';
import { download } from '../lib/vfs';

type Tab =
  | 'router'
  | 'benchmarks'
  | 'codesign'
  | 'github'
  | 'skills'
  | 'mcp'
  | 'free'
  | 'costs'
  | 'log'
  | 'telemetry'
  | 'security'
  | 'doc';

const TABS: { id: Tab; label: string }[] = [
  { id: 'router', label: 'Model Router' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'codesign', label: 'Agents × modèles' },
  { id: 'github', label: 'GitHub Discovery' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'free', label: 'Gratuit d’abord' },
  { id: 'costs', label: 'Cost Optimizer' },
  { id: 'log', label: 'Routing Log' },
  { id: 'telemetry', label: 'Télémétrie' },
  { id: 'security', label: 'Sécurité' },
  { id: 'doc', label: 'Documentation' },
];

const bandTone = (s: number) =>
  s < 40 ? 'err' : s < 60 ? 'err' : s < 75 ? 'warn' : s < 90 ? 'ok' : 'accent';
const th = 'py-1 pr-2 text-left font-normal text-faint';
const td = 'py-1 pr-2 align-top';

function useEngine(): [EngineSettings, (p: Partial<EngineSettings>) => void] {
  const settings = useStore((s) => s.settings);
  const patch = useStore((s) => s.patchSettings);
  const eng: EngineSettings = {
    ...DEFAULT_ENGINE,
    ...settings.engine,
    weights: { ...DEFAULT_WEIGHTS, ...settings.engine?.weights },
  };
  return [eng, (p) => patch({ engine: { ...eng, ...p } })];
}

export function IntelligenceView() {
  const [tab, setTab] = useState<Tab>('router');
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-5">
        <h1 className="text-[18px] font-semibold">Intelligence</h1>
        <div className="mb-2 text-[13px] text-muted">
          Comment MASSAMBA choisit ses moyens : modèle, agent, skills, MCP, outils — le moins cher qui atteint
          la qualité requise, avec preuves, sécurité et apprentissage sur vos missions.
        </div>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="overflow-x-auto px-5" />
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {tab === 'router' && <RouterTab />}
        {tab === 'benchmarks' && <BenchmarksTab />}
        {tab === 'codesign' && <CodesignTab />}
        {tab === 'github' && <GithubTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'mcp' && <McpTab />}
        {tab === 'free' && <FreeTab />}
        {tab === 'costs' && <CostsTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'telemetry' && <TelemetryTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'doc' && <DocTab />}
      </div>
    </div>
  );
}

// ── Model Router ───────────────────────────────────────────────────────────
function RouterTab() {
  const { models, health, board, bench, externalBench, mcp, ledger } = useStore();
  const [eng, setEng] = useEngine();
  const [text, setText] = useState('Analyse ce fichier Excel et détecte les anomalies IFRS9.');
  const [att, setAtt] = useState('portefeuille.xlsx');
  const decision = useMemo(() => {
    const names = att
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const p = analyzeTask({ text, attachmentNames: names, mission: true });
    const dna = taskDna(text, names, p);
    const d = decideRoute({
      models,
      tiers: DEFAULT_AUTO_TIERS,
      profile: p,
      dna,
      text,
      health,
      board,
      bench,
      external: externalBench,
      settings: eng,
      mission: true,
    });
    const sel = selectSkills(text, names, {
      model: models.find((m) => m.id === d.chosen?.id),
      tools: TOOLS.map((t) => t.name),
    });
    const lo = buildLoadout({
      agentId: 'omnipotent',
      agentLabel: 'Orchestrateur',
      team: p.team,
      type: p.type,
      selection: sel,
      mcpConnected: mcp.filter((x) => x.enabled).map((x) => x.name),
      tools: TOOLS.map((t) => t.name),
    });
    return {
      ...d,
      agent: lo.agent,
      skills: lo.skills,
      mcp: lo.mcp,
      tools: lo.tools,
      why: {
        ...d.why,
        agent: lo.agentWhy,
        skills: lo.skillsWhy,
        mcp: lo.mcpWhy,
        tools: `${lo.tools.length} outils ; QA : ${lo.qa}`,
      },
    };
  }, [
    text,
    att,
    models,
    health,
    board,
    bench,
    externalBench,
    mcp,
    ledger.entries.length,
    JSON.stringify(eng),
  ]);
  const setW = (k: keyof RoutingWeights, v: number) => setEng({ weights: { ...eng.weights, [k]: v } });
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-2 text-[12.5px] text-muted">
          Décrivez une mission : le moteur montre en direct ce qu’il choisirait et pourquoi (même code que
          pendant une vraie mission).
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          aria-label="Mission à router"
        />
        <Input
          className="mt-2"
          value={att}
          onChange={(e) => setAtt(e.target.value)}
          placeholder="Pièces jointes (noms séparés par des virgules)"
          aria-label="Pièces jointes"
        />
        {!models.length && (
          <div className="mt-2 text-[12.5px] text-warn">
            Catalogue OpenRouter non chargé : le moteur bascule sur le routage par paliers.
          </div>
        )}
        <RoutingCard d={decision} defaultOpen />
      </div>
      <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
        <div className="mb-2 font-medium">Pondérations (configurables)</div>
        {(Object.keys(WEIGHT_LABEL) as (keyof RoutingWeights)[]).map((k) => (
          <label key={k} className="mb-1.5 block">
            <div className="flex justify-between">
              <span>{WEIGHT_LABEL[k]}</span>
              <span className="tabular-nums text-muted">{Math.round(eng.weights[k] * 100)} %</span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              value={Math.round(eng.weights[k] * 100)}
              onChange={(e) => setW(k, Number(e.target.value) / 100)}
              className="w-full accent-[var(--accent)]"
              aria-label={WEIGHT_LABEL[k]}
            />
          </label>
        ))}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label>
            <div className="text-faint">Seuil QA (%)</div>
            <Input
              type="number"
              value={eng.qaThreshold}
              onChange={(e) => setEng({ qaThreshold: Number(e.target.value) || 0 })}
              aria-label="Seuil QA"
            />
          </label>
          <label>
            <div className="text-faint">Escalades max</div>
            <Input
              type="number"
              value={eng.maxEscalations}
              onChange={(e) => setEng({ maxEscalations: Number(e.target.value) || 0 })}
              aria-label="Escalades max"
            />
          </label>
          <label className="col-span-2">
            <div className="text-faint">Plafond de prix ($/M mixte, 0 = aucun)</div>
            <Input
              type="number"
              step="0.1"
              value={eng.maxPricePerM}
              onChange={(e) => setEng({ maxPricePerM: Number(e.target.value) || 0 })}
              aria-label="Plafond de prix"
            />
          </label>
        </div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEng(DEFAULT_ENGINE)}>
          Valeurs par défaut
        </Button>
        <div className="mt-2 text-[11.5px] text-faint">
          Qualité minimale par palier :{' '}
          {Object.entries(QUALITY_FLOOR)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
          . Le plus intelligent n’est pas automatiquement le meilleur : le meilleur est le moins cher qui
          atteint le niveau requis.
        </div>
      </div>
    </div>
  );
}

// ── Benchmarks (fusion) ────────────────────────────────────────────────────
function BenchmarksTab() {
  const { models, board, bench, externalBench, setExternalBench, toast } = useStore();
  const scored = useMemo(
    () =>
      models.filter((m) => modelEvidence(m).some((e) => e.kind === 'benchmark' || e.kind === 'inference')),
    [models],
  );
  const [id, setId] = useState(scored[0]?.id ?? models[0]?.id ?? '');
  const m = models.find((x) => x.id === id);
  const ev = m ? modelEvidence(m, { board, bench, external: externalBench }) : [];
  const input = useRef<HTMLInputElement>(null);
  const onImport = async (f: File) => {
    try {
      const rows = JSON.parse(await f.text()) as ExternalBenchmark[];
      const ok = rows.filter(
        (r) =>
          r && r.model && r.source && r.benchmark && typeof r.score === 'number' && r.date && r.dimension,
      );
      if (!ok.length)
        throw new Error(
          'aucune ligne valide (champs : source, date, model, benchmark, dimension, score, scale?, url?, confidence?)',
        );
      setExternalBench([...externalBench, ...ok]);
      toast('ok', `${ok.length} mesure(s) importée(s) et fusionnée(s).`);
    } catch (e) {
      toast('err', `Import impossible : ${(e as Error).message}`);
    }
  };
  const d = intelData();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={id}
          onChange={setId}
          options={(scored.length ? scored : models).map((x) => ({ value: x.id, label: x.id }))}
          className="max-w-[360px]"
          title="Modèle"
        />
        <Button size="sm" onClick={() => input.current?.click()}>
          <Upload size={13} /> Importer des benchmarks publics (.json)
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
        {externalBench.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setExternalBench([])}>
            Retirer les {externalBench.length} mesures importées
          </Button>
        )}
      </div>
      <div className="mb-3 text-[12px] text-muted">
        Sources : {d.source} (relevé du {d.fetchedAt.slice(0, 10)}), catalogue OpenRouter en direct, vos
        missions et auto-benchmarks, mesures importées. Une donnée perd la moitié de son poids tous les{' '}
        {HALF_LIFE_DAYS} jours. Les scores MASSAMBA et les inférences ne sont jamais présentés comme des
        benchmarks officiels.
      </div>
      {m && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['intelligence', 'coding', 'agentic', 'success'] as const).map((k) => {
              const f = fuse(ev, k);
              return (
                <div key={k} className="rounded-lg border border-line px-3 py-1.5 text-[12px]">
                  <div className="text-faint">{k === 'success' ? 'réussite (vos missions)' : k}</div>
                  <div className="text-[15px] font-semibold tabular-nums">
                    {f.value === null ? '—' : f.value.toFixed(0)}
                  </div>
                  <div className="text-[11px] text-faint">
                    {f.sources} source(s) · confiance {Math.round(f.confidence * 100)} %
                    {f.contradictory && <span className="text-warn"> · contradictoire</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {[
                  'Type',
                  'Source',
                  'Date',
                  'Mesure',
                  'Score',
                  'Normalisé',
                  'Confiance',
                  'Fraîcheur',
                  'Lien',
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ev.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className={td}>
                    <Badge
                      tone={
                        e.kind === 'fact'
                          ? 'neutral'
                          : e.kind === 'benchmark'
                            ? 'info'
                            : e.kind === 'massamba'
                              ? 'accent'
                              : 'warn'
                      }
                    >
                      {KIND_LABEL[e.kind]}
                    </Badge>
                  </td>
                  <td className={td}>{e.source}</td>
                  <td className={td}>{e.date.slice(0, 10)}</td>
                  <td className={td}>
                    {e.benchmark}
                    {e.note && <div className="text-[11px] text-faint">{e.note}</div>}
                  </td>
                  <td className={td}>
                    {e.dimension === 'success'
                      ? `${Math.round(e.score * 100)} %`
                      : Number.isInteger(e.score)
                        ? e.score
                        : e.score.toFixed(2)}
                    {e.n ? ` (n=${e.n})` : ''}
                  </td>
                  <td className={td}>{e.normalized === null ? '—' : e.normalized.toFixed(0)}</td>
                  <td className={td}>{Math.round(e.confidence * 100)} %</td>
                  <td className={td}>{Math.round(e.freshness * 100)} %</td>
                  <td className={td}>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" className="text-accent underline">
                        source
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {!models.length && (
        <div className="text-[12.5px] text-warn">Catalogue non chargé : aucune donnée de modèle.</div>
      )}
    </div>
  );
}

// ── Agents × modèles ───────────────────────────────────────────────────────
function CodesignTab() {
  const { models, health, board } = useStore();
  const [eng] = useEngine();
  const rows = useMemo(
    () => codesign(models, DEFAULT_AUTO_TIERS, { health, board, settings: eng }),
    [models, health, board, eng],
  );
  return (
    <div>
      <div className="mb-3 text-[12.5px] text-muted">
        Le meilleur modèle dépend de l’agent : pour chaque type de travail, le moteur associe modèle + secours
        + skills + MCP + chaîne d’outils + stratégie QA.
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {[
              'Travail',
              'Agent',
              'Meilleur modèle',
              'Secours',
              'Coût estimé',
              'Skills',
              'MCP',
              'Outils',
              'QA',
            ].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className={cx(td, 'font-medium')}>{r.label}</td>
              <td className={td}>{r.agent}</td>
              <td className={td}>
                {r.model ? (
                  <>
                    {r.model.id}
                    <div className="text-[11px] text-faint">
                      {r.model.metric} {r.model.raw.toFixed(1)} · {r.model.price.toFixed(2)} $/M
                    </div>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className={td}>{r.fallback?.id ?? '—'}</td>
              <td className={td}>
                {r.model?.estimate
                  ? `${fmtCost(r.model.estimate.low)}–${fmtCost(r.model.estimate.high)}`
                  : '—'}
              </td>
              <td className={td}>{r.skills.join(', ') || '—'}</td>
              <td className={td}>{r.mcp.join(', ') || 'natif'}</td>
              <td className={td}>{r.tools.join(', ')}</td>
              <td className={cx(td, 'text-muted')}>{r.qa}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── GitHub Discovery + Registry ────────────────────────────────────────────
function GithubTab() {
  const { registry, toast } = useStore();
  const [cap, setCap] = useState(DISCOVERY_QUERIES[0]!.capability);
  const [q, setQ] = useState(DISCOVERY_QUERIES[0]!.query);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<{ repos: RepoFacts[]; live: boolean; error: string | null } | null>(
    null,
  );
  const [cmp, setCmp] = useState<string[]>([]);
  const [tok, setTok] = useState('');
  const run = async () => {
    setBusy('search');
    setResults(await discoverOnGithub(q));
    setBusy(null);
  };
  const act = async (r: RegistryResource, what: string) => {
    setBusy(`${r.id}:${what}`);
    try {
      if (what === 'review') {
        const x = await reviewResource(r);
        toast(
          x.deep ? 'ok' : 'info',
          `${r.name} : ${x.resource.review!.score}/100 (${x.deep ? 'scan profond' : `métadonnées — ${x.error}`})`,
        );
      } else if (what === 'approve') {
        let res = move(r, 'APPROVED');
        if (
          !res.ok &&
          /confirmez/.test(res.error ?? '') &&
          confirm(`${res.error}\n\nApprouver malgré tout ?`)
        )
          res = move(r, 'APPROVED', true);
        if (!res.ok) toast('err', res.error!);
      } else if (what === 'install') {
        const res = await installResource(r);
        toast(res.ok ? 'ok' : 'err', res.ok ? res.note! : res.error!);
      } else if (what === 'enable' || what === 'disable') {
        const res = setEnabled(r, what === 'enable');
        if (!res.ok) toast('err', res.error!);
      } else if (what === 'reject') move(r, 'REJECTED');
      else if (what === 'reopen') move(r, 'DISCOVERED');
      else if (what === 'rollback') {
        const res = rollbackResource(r);
        if (!res.ok) toast('err', res.error!);
      } else if (what === 'update') {
        const v = await checkUpdate(r);
        toast(
          'info',
          v
            ? `Nouvelle version : ${v} (installée : ${r.version}). Refaites la revue avant de l’adopter.`
            : 'À jour.',
        );
      }
    } catch (e) {
      toast('err', (e as Error).message);
    }
    setBusy(null);
  };
  const actions = (r: RegistryResource): [string, string][] => {
    const a: Record<string, [string, string][]> = {
      DISCOVERED: [
        ['review', 'Security review'],
        ['reject', 'Rejeter'],
      ],
      REVIEWED: [
        ['approve', 'Approuver'],
        ['review', 'Re-scanner'],
        ['reject', 'Rejeter'],
      ],
      APPROVED: [
        ['install', 'Installer'],
        ['rollback', 'Annuler'],
        ['reject', 'Rejeter'],
      ],
      INSTALLED: [
        ['enable', 'Activer'],
        ['rollback', 'Rollback'],
        ['update', 'Mise à jour ?'],
      ],
      ENABLED: [
        ['disable', 'Désactiver'],
        ['rollback', 'Rollback'],
        ['update', 'Mise à jour ?'],
      ],
      DISABLED: [
        ['enable', 'Activer'],
        ['rollback', 'Rollback'],
        ['reject', 'Rejeter'],
      ],
      REJECTED: [['reopen', 'Rouvrir']],
    };
    return a[r.status] ?? [];
  };
  const compared = registry.filter((r) => cmp.includes(r.id));
  return (
    <div>
      <div className="mb-2 text-[12.5px] text-muted">
        Découverte sur GitHub de MCP, skills et outils. Rien n’est installé parce qu’il existe : DÉCOUVERT →
        REVUE DE SÉCURITÉ → APPROBATION → INSTALLATION (étape séparée) → ACTIVATION. Les étoiles ne suffisent
        jamais.
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          value={cap}
          onChange={(v) => {
            setCap(v);
            setQ(DISCOVERY_QUERIES.find((d) => d.capability === v)!.query);
          }}
          options={DISCOVERY_QUERIES.map((d) => ({ value: d.capability, label: d.capability }))}
          title="Capacité"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[280px] flex-1"
          aria-label="Requête GitHub"
        />
        <Button size="sm" variant="primary" onClick={() => void run()} disabled={busy === 'search'}>
          <Search size={13} /> Découvrir
        </Button>
        <Input
          type="password"
          value={tok}
          onChange={(e) => setTok(e.target.value)}
          placeholder="Jeton GitHub (optionnel, mémoire seule)"
          className="w-[220px]"
          aria-label="Jeton GitHub"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setGithubToken(tok);
            setTok('');
            toast('ok', 'Jeton gardé en mémoire pour cette session (jamais enregistré).');
          }}
        >
          {hasGithubToken() ? 'Jeton actif' : 'Utiliser'}
        </Button>
      </div>
      {results && (
        <div className="mb-5">
          <div className={cx('mb-1 text-[12px]', results.live ? 'text-muted' : 'text-warn')}>
            {results.live
              ? `${results.repos.length} dépôt(s) trouvés sur GitHub (score de sécurité sur métadonnées : lancez la revue pour un scan profond).`
              : `GitHub indisponible (${results.error}) : résultats du relevé local du ${GITHUB_SNAPSHOT.scannedAt.slice(0, 10)}.`}
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {['Dépôt', 'Description', 'Étoiles', 'Dernier commit', 'Licence', 'Sécurité (méta)', ''].map(
                  (h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {results.repos.map((f) => {
                const rv = securityReview(f);
                const inReg = registry.some((r) => r.id === f.fullName.toLowerCase());
                return (
                  <tr key={f.fullName} className="border-t border-line">
                    <td className={td}>
                      <a
                        className="text-accent underline"
                        href={`https://github.com/${f.fullName}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.fullName}
                      </a>
                      {f.archived && (
                        <Badge tone="err" className="ml-1">
                          archivé
                        </Badge>
                      )}
                    </td>
                    <td className={cx(td, 'max-w-[320px] text-muted')}>{f.description}</td>
                    <td className={td}>{f.stars.toLocaleString('fr-FR')}</td>
                    <td className={td}>{f.pushedAt.slice(0, 10)}</td>
                    <td className={td}>{f.license ?? 'aucune'}</td>
                    <td className={td}>
                      <Badge tone={bandTone(rv.score)}>{rv.score}</Badge>
                    </td>
                    <td className={td}>
                      <Button size="sm" disabled={inReg} onClick={() => addToRegistry(f, cap)}>
                        {inReg ? 'au registre' : 'Ajouter'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">
          GitHub Intelligence Registry ({registry.length})
        </h3>
        {cmp.length > 1 && <Badge tone="accent">comparaison : {cmp.length}</Badge>}
      </div>
      {!registry.length && (
        <div className="text-[12.5px] text-muted">
          Registre vide : lancez une découverte puis ajoutez des dépôts.
        </div>
      )}
      {registry.length > 0 && (
        <table className="w-full text-[12px]" data-testid="registry">
          <thead>
            <tr>
              {[
                '',
                'Ressource',
                'Type',
                'Capacité',
                'Version',
                'Licence',
                'Sécurité',
                'Qualité',
                'Coût',
                'Maintenance',
                'Compatibilité',
                'Statut',
                'Actions',
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registry.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className={td}>
                  <input
                    type="checkbox"
                    checked={cmp.includes(r.id)}
                    onChange={(e) =>
                      setCmp(e.target.checked ? [...cmp, r.id].slice(-3) : cmp.filter((x) => x !== r.id))
                    }
                    aria-label={`comparer ${r.name}`}
                  />
                </td>
                <td className={td}>
                  <a className="text-accent underline" href={r.github} target="_blank" rel="noreferrer">
                    {r.facts.fullName}
                  </a>
                </td>
                <td className={td}>{r.type}</td>
                <td className={td}>{r.capability.join(', ')}</td>
                <td className={td}>{r.version}</td>
                <td className={td}>{r.license}</td>
                <td className={td}>
                  {r.review ? (
                    <Badge tone={bandTone(r.review.score)}>
                      {r.review.score} · {r.review.depth === 'deep' ? 'profond' : 'méta'}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>{r.review?.quality ?? '—'}</td>
                <td className={td}>{r.cost}</td>
                <td className={td}>{r.review?.maintenance ?? '—'}</td>
                <td className={td}>
                  {r.install.kind === 'skill-md'
                    ? 'les deux éditions'
                    : r.install.kind === 'remote-mcp'
                      ? 'navigateur (HTTP)'
                      : r.install.kind === 'stdio-mcp'
                        ? 'édition serveur'
                        : 'aucune'}
                </td>
                <td className={td}>
                  <Badge tone={r.status === 'REJECTED' ? 'err' : r.status === 'ENABLED' ? 'ok' : 'neutral'}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </td>
                <td className={cx(td, 'whitespace-nowrap')}>
                  {actions(r).map(([k, l]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant="ghost"
                      disabled={busy === `${r.id}:${k}`}
                      onClick={() => void act(r, k)}
                    >
                      {l}
                    </Button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {registry.some((r) => r.review) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px]">Constats de sécurité détaillés</summary>
          {registry
            .filter((r) => r.review)
            .map((r) => (
              <div key={r.id} className="mt-2 rounded-lg border border-line p-2 text-[12px]">
                <div className="font-medium">
                  {r.facts.fullName} — {r.review!.score}/100 · {BAND_LABEL[r.review!.band]}
                </div>
                <div className="text-faint">
                  Permissions : {r.review!.permissions.join(', ') || 'aucune déclarée'} · Secrets :{' '}
                  {r.review!.secrets.join(', ') || 'aucun'} · Installation : {r.install.note}
                  {r.install.command ? ` (${r.install.command})` : ''}
                </div>
                <ul className="mt-1">
                  {r.review!.findings.map((f, i) => (
                    <li key={i} className={f.delta < 0 ? 'text-warn' : 'text-muted'}>
                      {f.delta >= 0 ? '+' : ''}
                      {Math.round(f.delta)} · {f.label}
                      {f.detail ? ` — ${f.detail}` : ''}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-faint">
                  Historique :{' '}
                  {r.history.map((h) => `${new Date(h.at).toLocaleDateString('fr-FR')} ${h.to}`).join(' → ')}
                </div>
              </div>
            ))}
        </details>
      )}
      {compared.length > 1 && (
        <div className="mt-4">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">Comparaison</h3>
          <table className="w-full text-[12px]">
            <tbody>
              {(
                [
                  'Étoiles',
                  'Dernier commit',
                  'Licence',
                  'Issues ouvertes',
                  'Sécurité',
                  'Qualité',
                  'Maintenance',
                  'Permissions',
                  'Statut',
                ] as const
              ).map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className={cx(td, 'text-faint')}>{k}</td>
                  {compared.map((r) => (
                    <td key={r.id} className={td}>
                      {k === 'Étoiles'
                        ? r.facts.stars.toLocaleString('fr-FR')
                        : k === 'Dernier commit'
                          ? r.facts.pushedAt.slice(0, 10)
                          : k === 'Licence'
                            ? r.license
                            : k === 'Issues ouvertes'
                              ? r.facts.openIssues
                              : k === 'Sécurité'
                                ? (r.review?.score ?? '—')
                                : k === 'Qualité'
                                  ? (r.review?.quality ?? '—')
                                  : k === 'Maintenance'
                                    ? (r.review?.maintenance ?? '—')
                                    : k === 'Permissions'
                                      ? (r.review?.permissions.join(', ') ?? '—')
                                      : STATUS_LABEL[r.status]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Skills ─────────────────────────────────────────────────────────────────
function SkillsTab() {
  const { models } = useStore();
  const [text, setText] = useState('Analyse ce fichier Excel et détecte les anomalies IFRS9.');
  const sel = selectSkills(text, [], { tools: TOOLS.map((t) => t.name), model: models[0] ?? null });
  return (
    <div>
      <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Mission (skills)" />
      <div className="my-2 text-[12.5px]">
        Skills retenus : <b>{sel.selected.map((m) => m.skill.name).join(', ') || 'aucun'}</b>
        {sel.incompatible.length > 0 && (
          <span className="text-warn">
            {' '}
            · refusés : {sel.incompatible.map((i) => `${i.skill.name} (${i.reason})`).join(', ')}
          </span>
        )}
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {[
              'Skill',
              'Description',
              'Déclencheurs',
              'Outils requis',
              'Modèle recommandé',
              'Incompatible si',
              'Coût',
              'Sécurité',
              'Source / version / licence',
            ].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SKILL_REGISTRY.map((s) => (
            <tr
              key={s.name}
              className={cx(
                'border-t border-line',
                sel.selected.some((m) => m.skill.name === s.name) && 'bg-accent/5',
              )}
            >
              <td className={cx(td, 'font-medium')}>{s.name}</td>
              <td className={cx(td, 'text-muted')}>{s.description}</td>
              <td className={cx(td, 'max-w-[180px] text-faint')}>{s.triggers.slice(0, 4).join(' · ')}</td>
              <td className={td}>{s.required_tools.join(', ') || '—'}</td>
              <td className={td}>
                {s.recommended_models.metric} · {s.recommended_models.tier}
              </td>
              <td className={td}>{s.incompatible_models.join(', ') || '—'}</td>
              <td className={td}>{s.cost_profile}</td>
              <td className={td}>{s.security_profile}</td>
              <td className={cx(td, 'text-faint')}>
                {s.source} · {s.version} · {s.license}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── MCP ────────────────────────────────────────────────────────────────────
function McpTab() {
  const { mcp, registry } = useStore();
  const overrides = Object.fromEntries(
    registry.filter((r) => r.facts.deep).map((r) => [r.facts.fullName.toLowerCase(), r.facts]),
  );
  const rows = mcpRegistry(overrides);
  const connected = new Set(connectedTools(mcp).map((t) => t.server));
  return (
    <div>
      <div className="mb-2 text-[12.5px] text-muted">
        Catalogue des serveurs MCP compatibles. Faits GitHub : relevé du{' '}
        {GITHUB_SNAPSHOT.scannedAt.slice(0, 10)} (ou scan profond du registre). Scores = scores MASSAMBA.
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {[
              'Nom',
              'Dépôt',
              'Auteur',
              'Licence',
              'Version',
              'Dernière MAJ',
              'Catégories',
              'Capacités',
              'Permissions',
              'Secrets',
              'Coût',
              'Sécurité',
              'Qualité',
              'Maintenance',
              'Compatibilité',
              'Statut',
            ].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className={cx(td, 'font-medium')}>
                {r.name}
                {connected.has(r.preset ?? '') && (
                  <Badge tone="ok" className="ml-1">
                    connecté
                  </Badge>
                )}
              </td>
              <td className={td}>
                {r.repo ? (
                  <a
                    className="text-accent underline"
                    href={`https://github.com/${r.repo}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {r.repo}
                  </a>
                ) : (
                  'service hébergé'
                )}
              </td>
              <td className={td}>{r.author}</td>
              <td className={td}>{r.license}</td>
              <td className={td}>{r.version}</td>
              <td className={td}>{r.lastUpdate ?? '—'}</td>
              <td className={td}>{r.categories.join(', ')}</td>
              <td className={cx(td, 'text-muted')}>{r.capabilities.join(', ')}</td>
              <td className={td}>{r.permissions.join(', ')}</td>
              <td className={td}>{r.secrets.join(', ') || '—'}</td>
              <td className={td}>{r.cost}</td>
              <td className={td}>
                {r.review ? (
                  <Badge tone={bandTone(r.review.score)}>{r.review.score}</Badge>
                ) : (
                  <span className="text-faint">{r.declared} décl.</span>
                )}
              </td>
              <td className={td}>{r.review?.quality ?? '—'}</td>
              <td className={td}>{r.review?.maintenance ?? '—'}</td>
              <td className={td}>
                {r.compatibility === 'both'
                  ? 'navigateur + serveur'
                  : r.compatibility === 'server'
                    ? 'édition serveur'
                    : 'navigateur'}
              </td>
              <td className={td}>
                <Badge
                  tone={
                    r.status === 'À ÉVITER'
                      ? 'err'
                      : r.status === 'REVUE REQUISE'
                        ? 'warn'
                        : r.status === 'SERVICE HÉBERGÉ'
                          ? 'neutral'
                          : 'ok'
                  }
                >
                  {r.status}
                </Badge>
                {r.replacedBy && <div className="text-[11px] text-faint">→ {r.replacedBy}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Free first ─────────────────────────────────────────────────────────────
function FreeTab() {
  return (
    <div>
      <div className="mb-2 text-[12.5px] text-muted">
        Ordre de recherche pour chaque capacité : natif → intégré gratuit → open source → API gratuite → MCP
        gratuit → skill gratuit → payant (seulement s’il apporte un gain réel). Valeurs de sécurité / qualité
        : estimations MASSAMBA.
      </div>
      {CAPABILITIES.map((c) => (
        <div key={c} className="mb-4">
          <div className="mb-1 text-[13px] font-medium">{c}</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                {[
                  '#',
                  'Option',
                  'Type',
                  'Coût',
                  'Limite gratuite',
                  'Débit',
                  'Sécurité',
                  'Qualité',
                  'Latence',
                  'Maintenance',
                  'Dépendance',
                  'Édition',
                ].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {optionsFor(c).map((o, i) => (
                <tr key={o.name} className="border-t border-line">
                  <td className={td}>{i + 1}</td>
                  <td className={cx(td, i === 0 && 'font-medium text-accent')}>{o.name}</td>
                  <td className={td}>{OPT_KIND[o.kind]}</td>
                  <td className={td}>{o.cost}</td>
                  <td className={td}>{o.freeLimit}</td>
                  <td className={td}>{o.rateLimit}</td>
                  <td className={td}>{o.security}</td>
                  <td className={td}>{o.quality}</td>
                  <td className={td}>{o.latency}</td>
                  <td className={td}>{o.maintenance}</td>
                  <td className={td}>{o.dependency}</td>
                  <td className={td}>
                    {o.edition === 'both' ? 'les deux' : o.edition === 'direct' ? 'navigateur' : 'serveur'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Cost optimizer ─────────────────────────────────────────────────────────
export function CostsTab() {
  const { ledger, models, health, board } = useStore();
  const [by, setBy] = useState<'model' | 'agent' | 'type' | 'tier'>('model');
  const rows = metrics(ledger.entries, by);
  const premium = useMemo(() => {
    const p = analyzeTask({ text: 'x' });
    p.tier = 'maximum';
    return (
      decideRoute({ models, tiers: DEFAULT_AUTO_TIERS, profile: p, dna: null, text: 'x', health, board })
        .premium?.id ?? null
    );
  }, [models, health, board]);
  const s = savings(ledger.entries, models, premium);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Missions mesurées', String(s.missions)],
          ['Coût réel', fmtCost(s.actual)],
          [`Même tokens en premium`, fmtCost(s.premiumEquivalent)],
          ['Économie estimée', fmtCost(s.saved)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line px-3 py-2">
            <div className="text-[11.5px] text-faint">{k}</div>
            <div className="text-[16px] font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="mb-3 text-[11.5px] text-faint">{s.note}</div>
      <div className="mb-2 flex items-center gap-2 text-[12.5px]">
        Grouper par{' '}
        <Select
          value={by}
          onChange={setBy}
          options={[
            { value: 'model', label: 'modèle' },
            { value: 'agent', label: 'agent' },
            { value: 'type', label: 'type de mission' },
            { value: 'tier', label: 'palier' },
          ]}
        />
      </div>
      {!rows.length ? (
        <div className="text-[12.5px] text-muted">
          Aucune mission enregistrée : les métriques apparaissent après vos premières missions.
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              {[
                'Clé',
                'Missions',
                'Réussites',
                'Coût total',
                'Coût / réussite',
                'Coût / point QA',
                'Qualité / $',
                'Tokens / réussite',
                'Temps / réussite',
                'QA moyen',
                'Escalades',
                'Corrections humaines',
              ].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className={cx(td, 'font-medium')}>{r.key}</td>
                <td className={td}>{r.missions}</td>
                <td className={td}>
                  {r.successes} ({Math.round(r.successRate * 100)} %)
                </td>
                <td className={td}>{fmtCost(r.cost)}</td>
                <td className={td}>{r.costPerSuccess === null ? '—' : fmtCost(r.costPerSuccess)}</td>
                <td className={td}>{r.costPerQuality === null ? '—' : fmtCost(r.costPerQuality, 5)}</td>
                <td className={td}>
                  {r.qualityPerDollar === null ? '—' : Math.round(r.qualityPerDollar).toLocaleString('fr-FR')}
                </td>
                <td className={td}>{r.tokensPerSuccess === null ? '—' : fmtTokens(r.tokensPerSuccess)}</td>
                <td className={td}>{r.timePerSuccessMs === null ? '—' : fmtDuration(r.timePerSuccessMs)}</td>
                <td className={td}>{r.avgQa === null ? '—' : Math.round(r.avgQa)}</td>
                <td className={td}>{r.escalations}</td>
                <td className={td}>{r.corrections}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Routing log ────────────────────────────────────────────────────────────
function LogTab() {
  const log = useStore((s) => s.routingLog);
  if (!log.length)
    return (
      <div className="text-[12.5px] text-muted">
        Aucune décision encore : chaque mission lancée depuis le chat y est enregistrée avec son explication.
      </div>
    );
  return (
    <div>
      {[...log]
        .reverse()
        .slice(0, 60)
        .map((d, i) => (
          <div key={`${d.at}-${i}`} className="mb-2">
            <div className="text-[11.5px] text-faint">
              {new Date(d.at).toLocaleString('fr-FR')} — « {d.mission.slice(0, 120)} »
            </div>
            <RoutingCard d={d} />
          </div>
        ))}
    </div>
  );
}

// ── Telemetry ──────────────────────────────────────────────────────────────
function TelemetryTab() {
  const entries = useStore((s) => s.ledger.entries);
  const cols = [
    'Date',
    'Type',
    'Modèle',
    'Agent',
    'Skills',
    'MCP',
    'Outils',
    'Tokens',
    'Coût',
    'Latence',
    'Itérations',
    'Replis',
    'QA',
    'Escalades',
    'Correction humaine',
    'Résultat',
  ];
  const rows = [...entries]
    .reverse()
    .map((e) => [
      new Date(e.at).toLocaleString('fr-FR'),
      e.dna.type,
      e.model,
      e.agent ?? '—',
      (e.skills ?? []).join(' '),
      (e.mcp ?? []).join(' '),
      (e.tools ?? []).join(' '),
      `${fmtTokens(e.tokensIn ?? 0)} → ${fmtTokens(e.tokensOut ?? 0)}`,
      fmtCost(e.cost),
      fmtDuration(e.durationMs),
      String(e.steps),
      String(e.retries ?? 0),
      e.qa === undefined ? '—' : String(e.qa),
      String(e.escalations ?? 0),
      e.humanCorrection ? 'oui' : 'non',
      e.verdict,
    ]);
  const exportCsv = () =>
    download(
      'massamba-telemetrie.csv',
      [cols, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n'),
      'text/csv',
    );
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="text-[12.5px] text-muted">
          {entries.length} mission(s) enregistrée(s) dans ce navigateur.
        </div>
        {entries.length > 0 && (
          <Button size="sm" onClick={exportCsv}>
            <Download size={13} /> CSV
          </Button>
        )}
      </div>
      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                {cols.map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className={cx(td, 'max-w-[220px] truncate')} title={c}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Security ───────────────────────────────────────────────────────────────
function SecurityTab() {
  const registry = useStore((s) => s.registry);
  const snapshot = GITHUB_SNAPSHOT.repos
    .map((f) => ({ f, rv: securityReview(f) }))
    .sort((a, b) => a.rv.score - b.rv.score);
  return (
    <div className="text-[12.5px]">
      <div className="mb-3 rounded-xl border border-line bg-panel p-3">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <ShieldCheck size={14} className="text-accent" /> Règles actives
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-muted">
          <li>
            Aucun dépôt GitHub n’est installé automatiquement : revue de sécurité, approbation explicite
            (confirmation entre 60 et 74), installation séparée.
          </li>
          <li>
            Score &lt; 40 : rejet automatique ; signaux suspects (typosquatting, scripts d’installation qui
            téléchargent du code, injection de prompt, vocabulaire malveillant) : rejet, approbation
            impossible.
          </li>
          <li>
            Les étoiles ne comptent que pour 6 points au maximum ; un examen sur métadonnées seules plafonne à
            85.
          </li>
          <li>
            Dans le navigateur, seuls des skills texte (après contrôle anti-injection) et des MCP HTTP
            désactivés par défaut peuvent être installés ; aucun code téléchargé n’est exécuté.
          </li>
          <li>
            Les clés (OpenRouter, jeton GitHub) ne sont jamais envoyées à un MCP ; le jeton GitHub reste en
            mémoire.
          </li>
          <li>
            Les commandes destructrices restent confirmées, même en mode autonome ; les fichiers sensibles
            restent protégés.
          </li>
        </ul>
      </div>
      <div className="mb-1 font-medium">
        Relevé GitHub du {GITHUB_SNAPSHOT.scannedAt.slice(0, 10)} (dépôts des préréglages MCP)
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            {['Dépôt', 'Score', 'Bande', 'Principaux constats'].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snapshot.map(({ f, rv }) => (
            <tr key={f.fullName} className="border-t border-line">
              <td className={td}>{f.fullName}</td>
              <td className={td}>
                <Badge tone={bandTone(rv.score)}>{rv.score}</Badge>
              </td>
              <td className={td}>{BAND_LABEL[rv.band]}</td>
              <td className={cx(td, 'text-muted')}>
                {rv.findings
                  .filter((x) => x.delta < 0)
                  .map((x) => x.label)
                  .slice(0, 3)
                  .join(' · ') || 'aucun constat négatif'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {registry.length > 0 && (
        <div className="mt-3 text-muted">
          Registre : {registry.filter((r) => r.status === 'REJECTED').length} rejeté(s),{' '}
          {registry.filter((r) => ['APPROVED', 'INSTALLED', 'ENABLED'].includes(r.status)).length} approuvé(s)
          / installé(s).
        </div>
      )}
    </div>
  );
}

// ── Documentation ──────────────────────────────────────────────────────────
function DocTab() {
  return (
    <div className="max-w-[860px] space-y-3 text-[13px] leading-relaxed">
      <p>
        <b>Pipeline.</b> Mission → Task DNA (type, complexité, criticité, risques) → exigences (indice
        minimal, qualité pondérée minimale, vision, contexte, budget) → candidats (catalogue OpenRouter en
        direct) → fusion des preuves → score de routage pondéré → décision → exécution → QA → cascade →
        télémétrie → apprentissage.
      </p>
      <p>
        <b>Règle de choix.</b> Parmi les modèles qui atteignent l’indice du palier (Intelligence, Coding pour
        le code, Agentique pour le navigateur) et la qualité pondérée minimale, le moins cher par mission
        réussie gagne (coût estimé ÷ probabilité de réussite) ; à ±10 % de coût, le meilleur score l’emporte.
        Le plus intelligent n’est jamais choisi « par défaut ».
      </p>
      <p>
        <b>Score de routage.</b> Somme pondérée (réglable dans Model Router) : réussite 35 %, intelligence 20
        %, outils / code 15 %, agentique 10 %, fiabilité 10 %, latence 5 %, coût 5 %. La probabilité de
        réussite part d’une estimation fondée sur l’indice de la tâche et se met à jour avec vos missions (loi
        bêta). Les dimensions non mesurées sont marquées « est. ».
      </p>
      <p>
        <b>Preuves.</b> Quatre familles séparées : FAITS (catalogue OpenRouter), BENCHMARKS (Artificial
        Analysis via OpenRouter, mesures publiques importées), MASSAMBA (vos missions, auto-benchmarks),
        INFÉRENCES (estimations). Chaque mesure garde source, date, score, confiance, lien et fraîcheur
        (demi-vie {HALF_LIFE_DAYS} jours). Les désaccords de plus de 20 points sont signalés et baissent la
        confiance.
      </p>
      <p>
        <b>Cascade.</b> Le modèle le moins cher suffisant travaille d’abord ; le score QA (contrôles réussis,
        chiffres sans preuve, blocages de la red team, refus du relecteur) décide : accepté, correction,
        escalade vers le palier supérieur (au plus N fois, si le budget le permet) ou arrêt.
      </p>
      <p>
        <b>Skills / MCP / outils.</b> Les skills sont choisis par déclencheurs et pièces jointes, refusés
        s’ils sont incompatibles (vision, outils, contexte). Les MCP connectés pertinents sont utilisés ;
        sinon les outils natifs gratuits. Chaque capacité suit l’ordre « gratuit d’abord ».
      </p>
      <p>
        <b>GitHub.</b> Découverte → revue de sécurité (réputation plafonnée, maintenance, licence, scripts
        d’installation, binaires, permissions, secrets, télémétrie, avis de sécurité, typosquatting) →
        approbation → installation séparée → activation, avec historique et rollback. Hors-ligne, le relevé
        daté intégré prend le relais.
      </p>
      <p>
        <b>Mode dégradé.</b> Sans OpenRouter, GitHub, benchmarks ou MCP, le Workbench continue : routage par
        paliers, relevé local, outils natifs.
      </p>
      <p className="text-faint">
        <GitBranch size={12} className="mr-1 inline" />
        Limites : les scores de sécurité sont des indicateurs, pas un audit de code ; les probabilités de
        réussite sont des estimations tant que vos missions ne les ont pas mesurées.
      </p>
      <Button size="sm" variant="ghost" onClick={() => location.reload()}>
        <RefreshCw size={13} /> Recharger
      </Button>
    </div>
  );
}
