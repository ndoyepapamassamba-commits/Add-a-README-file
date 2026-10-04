// MASSAMBA Benchmark Lab — the attached "OpenRouter Intelligence Benchmark"
// app rebuilt on the real routing engine: live OpenRouter prices × the
// Artificial Analysis indices published on OpenRouter model pages. Every
// number shown here is the one AUTO routing uses (no separate formula).
import { useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, RefreshCw, Upload } from 'lucide-react';
import type { ModelInfo } from '@shared/types';
import {
  METRIC_LABEL,
  TIER_LABEL,
  TIER_MIN_INTEL,
  analyzeTask,
  blendedPrice,
  categorize,
  rankByValue,
  routeModel,
  taskMatrix,
  type HealthMap,
  type LeaderboardMap,
} from '../../server/llm/routing';
import {
  INTEL_ENDPOINT,
  intelData,
  intelMax,
  intelligenceInfo,
  parseIntel,
  setIntelData,
  type IntelData,
} from '../../server/llm/modelIntel';
import type { AutoTiers } from '../../server/services/settings';
import { cx, fmtCost, fmtPrice, fmtTokens } from '../lib/format';
import { Badge, Button, Input, Select, Tabs, Textarea, Toggle } from './ui';

type Tab = 'tasks' | 'categories' | 'ranking' | 'lab' | 'sources';
type SortKey = 'value' | 'price' | 'intel' | 'coding' | 'agentic' | 'cost' | 'context';

const BOM = String.fromCharCode(0xfeff);
const short = (id: string) => id.replace(/^[^/]+\//, '');
const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1));

function save(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function BenchmarkLab({
  models,
  tiers,
  health = {},
  board = {},
  onUse,
  refreshIntel,
  onIntelImported,
}: {
  models: ModelInfo[];
  tiers: AutoTiers;
  health?: HealthMap;
  board?: LeaderboardMap;
  /** Makes a model the default (or fallback) model. */
  onUse?: (id: string, role: 'default' | 'fallback') => void;
  /** Live refresh of the scores (server fetch, or browser fetch when allowed). */
  refreshIntel?: () => Promise<IntelData>;
  /** Called after a manual import so the caller can persist it. */
  onIntelImported?: (d: IntelData) => void;
}) {
  const [tab, setTab] = useState<Tab>('tasks');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const info = intelData();

  const matrix = useMemo(
    () => taskMatrix(models, tiers, health, board),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after a score refresh
    [models, tiers, health, board, version],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after a score refresh
  const cats = useMemo(() => categorize(models, health, board), [models, health, board, version]);

  const refresh = async () => {
    if (!refreshIntel) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await refreshIntel();
      const n = setIntelData(d);
      setNote(`Scores actualisés : ${n} modèles mesurés (${d.fetchedAt.slice(0, 16).replace('T', ' ')}).`);
      setVersion((v) => v + 1);
    } catch (e) {
      setNote(
        `Actualisation impossible ici (${(e as Error).message}). Ouvrez le lien « Données brutes » ci-dessous dans un onglet, enregistrez la page (.json) puis « Importer ».`,
      );
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as IntelData | { data?: unknown[] };
      const d: IntelData =
        'models' in j && j.models
          ? (j as IntelData)
          : parseIntel(
              j as { data?: never[] },
              models.map((m) => ({ id: m.id, canonical_slug: m.slug })),
            );
      const n = setIntelData(d);
      if (!n) throw new Error('aucun score de modèle dans ce fichier');
      onIntelImported?.(d);
      setNote(`Import réussi : ${n} modèles mesurés.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setNote(`Import impossible : ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        tabs={[
          { id: 'tasks', label: 'Priorités par tâche' },
          { id: 'categories', label: 'Catégories (meilleur + secours)' },
          { id: 'ranking', label: 'Classement complet' },
          { id: 'lab', label: 'Routing Lab' },
          { id: 'sources', label: 'Sources & mise à jour' },
        ]}
        value={tab}
        onChange={setTab}
        right={
          <span className="text-[11.5px] text-faint">
            Scores : {info.source} · {info.fetchedAt.slice(0, 10)}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] text-muted">
          Règle AUTO : pour chaque tâche, MASSAMBA choisit le <b>modèle le moins cher</b> qui atteint le
          niveau requis sur l'indice adapté (Intelligence, Coding pour le code, Agentique pour la navigation),
          avec prix réels OpenRouter (entrée×12 + sortie)/13. À prix égal (±10 %), le plus intelligent gagne.
          Le secours est le suivant de la même liste. Aucun fournisseur n'est favorisé.
        </div>
        {tab === 'tasks' && (
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-faint">
              <tr>
                <th className="py-1.5 pr-3">Tâche</th>
                <th className="pr-3">Palier</th>
                <th className="pr-3">Indice</th>
                <th className="pr-3">Modèle par défaut</th>
                <th className="pr-3">Secours 1 → 2</th>
                <th className="pr-3 text-right">Coût estimé</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-medium">{r.label}</td>
                  <td className="pr-3">
                    <Badge tone={r.tier === 'maximum' ? 'warn' : r.tier === 'quality' ? 'accent' : 'info'}>
                      {TIER_LABEL[r.tier]}
                    </Badge>
                  </td>
                  <td className="pr-3 text-muted">{METRIC_LABEL[r.metric]}</td>
                  <td className="pr-3 font-mono text-[12px]">{r.model ? short(r.model) : '—'}</td>
                  <td className="pr-3 font-mono text-[11.5px] text-muted">
                    {r.fallbacks.map(short).join(' → ') || '—'}
                  </td>
                  <td className="pr-3 text-right tabular-nums">
                    {r.estimate ? `${fmtCost(r.estimate.low)} – ${fmtCost(r.estimate.high)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'categories' && (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {cats.map((c) => (
              <div key={c.key} className="rounded-xl border border-line bg-panel p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[12px] font-semibold tracking-wide">{c.label}</span>
                  <span className="text-[11px] text-faint">{c.rule}</span>
                </div>
                {[c.best, c.backup].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 text-[12.5px]">
                    <Badge tone={i === 0 ? 'ok' : 'neutral'}>{i === 0 ? 'meilleur' : 'secours'}</Badge>
                    {r ? (
                      <>
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={r.ref}>
                          {short(r.m.id)}
                        </span>
                        <span className="tabular-nums text-muted">
                          {METRIC_LABEL[r.metric]} {n1(r.raw)}
                          {r.estimated ? '~' : ''} · {fmtPrice(r.m.inputPrice)}/{fmtPrice(r.m.outputPrice)}
                        </span>
                        {onUse && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onUse(r.m.id, i === 0 ? 'default' : 'fallback')}
                          >
                            Utiliser
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-faint">aucun modèle mesuré ne remplit la règle</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {tab === 'ranking' && <Ranking models={models} health={health} board={board} version={version} />}
        {tab === 'lab' && <RoutingLab models={models} tiers={tiers} health={health} board={board} />}
        {tab === 'sources' && (
          <div className="space-y-3 text-[13px]">
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="font-semibold">Prix — OpenRouter (en direct)</div>
              <div className="text-muted">
                {models.length} modèles au catalogue, prix entrée / sortie publiés par OpenRouter, rechargés à
                chaque actualisation du catalogue. Les nouveaux modèles apparaissent automatiquement.
              </div>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="font-semibold">
                Intelligence — Artificial Analysis, publié sur les pages modèles d'OpenRouter
              </div>
              <div className="text-muted">
                {Object.keys(info.models).length} modèles mesurés (Intelligence, Coding, Agentique, par niveau
                d'effort ; référence = effort « high » quand il est mesuré). Instantané du{' '}
                {info.fetchedAt.slice(0, 10)}. Un modèle ajouté plus tard sans mesure est estimé d'après son
                plus proche parent (marqué « ~ ») ou exclu du routage AUTO tant qu'il n'est pas mesuré.
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {refreshIntel && (
                  <Button size="sm" onClick={() => void refresh()} disabled={busy}>
                    <RefreshCw size={13} className={cx(busy && 'animate-spin')} /> Actualiser les scores
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
                  <Upload size={13} /> Importer (.json)
                </Button>
                <a
                  className="text-[12px] text-accent underline"
                  href={INTEL_ENDPOINT}
                  target="_blank"
                  rel="noreferrer"
                >
                  Données brutes OpenRouter ↗
                </a>
                <a
                  className="text-[12px] text-accent underline"
                  href="https://openrouter.ai/models"
                  target="_blank"
                  rel="noreferrer"
                >
                  openrouter.ai/models ↗
                </a>
                <input
                  ref={file}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {note && <div className="mt-2 text-[12.5px]">{note}</div>}
            </div>
            <Unmeasured models={models} version={version} />
          </div>
        )}
      </div>
    </div>
  );
}

function Ranking({
  models,
  health,
  board,
  version,
}: {
  models: ModelInfo[];
  health: HealthMap;
  board: LeaderboardMap;
  version: number;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [measured, setMeasured] = useState(true);
  const [tin, setTin] = useState(100_000);
  const [tout, setTout] = useState(20_000);
  const pareto = useMemo(
    () =>
      new Set(
        rankByValue(models, { tier: 'cheap', needsVision: false, contextTokens: 0 }, health, board)
          .filter((r) => r.pareto)
          .map((r) => r.m.id),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after a score refresh
    [models, health, board, version],
  );
  const rows = useMemo(() => {
    const maxI = intelMax();
    const list = models
      .filter((m) => !m.id.endsWith(':batch') && !m.id.endsWith(':free') && !m.id.startsWith('~'))
      .map((m) => {
        const s = intelligenceInfo(m.id, m.slug);
        const price = blendedPrice(m);
        const cost =
          m.inputPrice === null || m.outputPrice === null
            ? null
            : (tin * m.inputPrice + tout * m.outputPrice) / 1e6;
        return {
          m,
          s,
          price,
          cost,
          value: s && price ? ((s.score / maxI) * 100) / Math.max(price, 0.001) : null,
        };
      })
      .filter(
        (r) => (!measured || r.s) && (!q || `${r.m.id} ${r.m.name}`.toLowerCase().includes(q.toLowerCase())),
      );
    const k = (r: (typeof list)[number]): number =>
      sort === 'value'
        ? -(r.value ?? -1)
        : sort === 'price'
          ? (r.price ?? 1e9)
          : sort === 'cost'
            ? (r.cost ?? 1e9)
            : sort === 'context'
              ? -r.m.contextLength
              : -((sort === 'intel' ? r.s?.score : sort === 'coding' ? r.s?.coding : r.s?.agentic) ?? -1);
    return list.sort((a, b) => k(a) - k(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after a score refresh
  }, [models, q, sort, measured, tin, tout, version]);

  const csv = () => {
    const h = [
      'Modèle',
      'ID',
      'Entrée $/M',
      'Sortie $/M',
      'Contexte',
      'Intelligence',
      'Coding',
      'Agentique',
      'Estimé',
      'Prix mixte $/M',
      'Coût mission $',
      'Pareto',
    ];
    const d = [
      h,
      ...rows.map((r) => [
        r.m.name,
        r.m.id,
        r.m.inputPrice ?? '',
        r.m.outputPrice ?? '',
        r.m.contextLength,
        r.s?.score ?? '',
        r.s?.coding ?? '',
        r.s?.agentic ?? '',
        r.s?.estimated ? 'oui' : '',
        r.price?.toFixed(4) ?? '',
        r.cost?.toFixed(5) ?? '',
        pareto.has(r.m.id) ? 'oui' : '',
      ]),
    ]
      .map((a) => a.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';'))
      .join('\n');
    save('MASSAMBA_classement_modeles.csv', `${BOM}${d}`, 'text/csv');
  };
  const json = () =>
    save(
      'MASSAMBA_classement_modeles.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scores: { source: intelData().source, date: intelData().fetchedAt },
          rows: rows.map((r) => ({
            id: r.m.id,
            input: r.m.inputPrice,
            output: r.m.outputPrice,
            context: r.m.contextLength,
            ...r.s,
            blended: r.price,
            missionCost: r.cost,
          })),
        },
        null,
        2,
      ),
      'application/json',
    );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          className="h-8 !w-60"
          placeholder="Rechercher un modèle"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          value={sort}
          onChange={setSort}
          options={[
            { value: 'value', label: 'Rapport intelligence / prix' },
            { value: 'price', label: 'Prix mixte ↑' },
            { value: 'cost', label: 'Coût mission ↑' },
            { value: 'intel', label: 'Intelligence ↓' },
            { value: 'coding', label: 'Coding ↓' },
            { value: 'agentic', label: 'Agentique ↓' },
            { value: 'context', label: 'Contexte ↓' },
          ]}
        />
        <Toggle checked={measured} onChange={setMeasured} label="Mesurés seulement" />
        <span className="text-[12px] text-faint">Mission :</span>
        <Input
          className="h-8 !w-24"
          type="number"
          min={0}
          value={tin}
          onChange={(e) => setTin(Math.max(0, +e.target.value))}
          title="Tokens d'entrée"
        />
        <Input
          className="h-8 !w-24"
          type="number"
          min={0}
          value={tout}
          onChange={(e) => setTout(Math.max(0, +e.target.value))}
          title="Tokens de sortie"
        />
        <Button size="sm" variant="ghost" onClick={csv}>
          <Download size={13} /> CSV
        </Button>
        <Button size="sm" variant="ghost" onClick={json}>
          <Download size={13} /> JSON
        </Button>
        <span className="ml-auto text-[12px] text-muted">{rows.length} modèles</span>
      </div>
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-elev text-left text-faint">
          <tr>
            <th className="px-2 py-1.5">#</th>
            <th className="px-2">Modèle</th>
            <th className="px-2 text-right">Entrée/M</th>
            <th className="px-2 text-right">Sortie/M</th>
            <th className="px-2 text-right">Contexte</th>
            <th className="px-2 text-right">Intelligence</th>
            <th className="px-2 text-right">Coding</th>
            <th className="px-2 text-right">Agentique</th>
            <th className="px-2 text-right">Coût mission</th>
            <th className="px-2" />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((r, i) => (
            <tr key={r.m.id} className="border-t border-line hover:bg-hover/50">
              <td className="px-2 py-1 text-faint">{i + 1}</td>
              <td className="px-2">
                <div className="font-mono text-[12px]">{r.m.id}</div>
                {r.s && (
                  <div className="text-[10.5px] text-faint">
                    {r.s.name}
                    {r.s.estimated ? ' — estimé' : ''}
                  </div>
                )}
              </td>
              <td className="px-2 text-right tabular-nums">{fmtPrice(r.m.inputPrice)}</td>
              <td className="px-2 text-right tabular-nums">{fmtPrice(r.m.outputPrice)}</td>
              <td className="px-2 text-right tabular-nums">{fmtTokens(r.m.contextLength)}</td>
              <td className="px-2 text-right tabular-nums font-medium">{n1(r.s?.score)}</td>
              <td className="px-2 text-right tabular-nums">{n1(r.s?.coding)}</td>
              <td className="px-2 text-right tabular-nums">{n1(r.s?.agentic)}</td>
              <td className="px-2 text-right tabular-nums">{r.cost === null ? '—' : fmtCost(r.cost)}</td>
              <td className="space-x-1 px-2 text-right">
                {pareto.has(r.m.id) && <Badge tone="ok">optimal</Badge>}
                {!r.m.capabilities.tools && <Badge tone="warn">sans outils</Badge>}
                {r.m.capabilities.vision && <Badge tone="info">vision</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[11.5px] text-faint">
        « optimal » = aucun autre modèle n'est à la fois moins cher (ou égal) et plus intelligent (front de
        Pareto).
      </div>
    </div>
  );
}

function RoutingLab({
  models,
  tiers,
  health,
  board,
}: {
  models: ModelInfo[];
  tiers: AutoTiers;
  health: HealthMap;
  board: LeaderboardMap;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState('');
  const [images, setImages] = useState(false);
  const [mission, setMission] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof routeModel> | 'none' | null>(null);
  const [profile, setProfile] = useState<ReturnType<typeof analyzeTask> | null>(null);
  const run = () => {
    const p = analyzeTask({
      text,
      attachmentNames: files.split(/[,;\s]+/).filter(Boolean),
      hasImages: images,
      mission,
    });
    setProfile(p);
    setResult(routeModel(models, tiers, p, health, board) ?? 'none');
  };
  return (
    <div className="space-y-2">
      <Textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Décrivez une tâche : analyser un portefeuille, corriger un fichier HTML, produire un rapport COMEX…"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="h-8 !w-72"
          value={files}
          onChange={(e) => setFiles(e.target.value)}
          placeholder="Fichiers joints (ex. portefeuille.xlsb, contrat.pdf)"
        />
        <Toggle checked={images} onChange={setImages} label="Images" />
        <Toggle checked={mission} onChange={setMission} label="Mode mission" />
        <Button size="sm" onClick={run} disabled={!text.trim()}>
          <FlaskConical size={13} /> Calculer la route
        </Button>
      </div>
      {profile && result && (
        <div className="rounded-xl border border-line bg-panel p-3 text-[13px]">
          <div className="mb-1">
            Type <b>{profile.type}</b> · difficulté {Math.round(profile.difficulty * 100)} % · palier{' '}
            <b>{TIER_LABEL[result === 'none' ? profile.tier : result.tier]}</b> (seuil{' '}
            {Math.round(TIER_MIN_INTEL[result === 'none' ? profile.tier : result.tier] * 100)} % du meilleur
            score) · équipe : {profile.team.join(', ')}
          </div>
          {result === 'none' ? (
            <div className="text-err">Aucun modèle du catalogue ne convient (outils, vision, contexte).</div>
          ) : (
            <>
              <div>
                Modèle : <b className="font-mono">{result.model}</b>
                {result.estimate && (
                  <span className="text-muted">
                    {' '}
                    — coût estimé {fmtCost(result.estimate.low)} à {fmtCost(result.estimate.high)}
                  </span>
                )}
              </div>
              <div className="text-muted">Secours : {result.fallbacks.join(' → ') || '—'}</div>
              <div className="text-[12px] text-faint">{result.reason}</div>
              {result.ranking && (
                <ol className="mt-2 list-decimal pl-5 text-[12px]">
                  {result.ranking.map((r) => (
                    <li key={r.id}>
                      <span className="font-mono">{r.id}</span> —{' '}
                      {result.metric ? METRIC_LABEL[result.metric] : 'indice'} {r.score.toFixed(1)} ·{' '}
                      {r.price.toFixed(3)} $/M mixte
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Unmeasured({ models, version }: { models: ModelInfo[]; version: number }) {
  const list = useMemo(
    () =>
      models
        .filter((m) => m.capabilities.tools && !/:(free|batch)$/.test(m.id) && !m.id.startsWith('~'))
        .filter((m) => !intelligenceInfo(m.id, m.slug))
        .sort((a, b) => b.created - a.created),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute after a score refresh
    [models, version],
  );
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="font-semibold">Non mesurés ({list.length}) — exclus du routage AUTO</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {list.slice(0, 80).map((m) => (
          <span key={m.id} className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-muted">
            {m.id}
          </span>
        ))}
      </div>
    </div>
  );
}
