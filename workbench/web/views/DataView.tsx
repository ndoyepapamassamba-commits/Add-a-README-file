import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  Save,
  Sparkles,
  Table2,
  Upload,
} from 'lucide-react';
import type { ChartData, ChartSpec } from '@shared/types';
import { api, downloadFile } from '../lib/api';
import { basename, cx } from '../lib/format';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { ChartView, DataTable } from '../components/rich';
import { Badge, Button, Empty, Input, Select, Spinner, Tabs } from '../components/ui';

interface ColumnProfile {
  name: string;
  type: string;
  missing: number;
  missingPct: number;
  unique: number;
  sample: unknown[];
  numeric?: {
    min: number;
    max: number;
    mean: number;
    median: number;
    std: number;
    sum: number;
    outliers: number;
  };
  date?: { min: string; max: string };
  top?: { value: string; count: number }[];
}
interface Profile {
  path: string;
  sheet: string | null;
  sheets: string[];
  rowCount: number;
  columnCount: number;
  duplicateRows: number;
  columns: ColumnProfile[];
  anomalies: string[];
}

const num = (n: number) =>
  Math.abs(n) >= 1e6 ? n.toExponential(2) : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const CHART_TYPES: { value: ChartSpec['type']; label: string }[] = [
  { value: 'bar', label: 'Barres' },
  { value: 'line', label: 'Courbe' },
  { value: 'area', label: 'Aire' },
  { value: 'pie', label: 'Secteurs' },
  { value: 'scatter', label: 'Nuage de points' },
  { value: 'histogram', label: 'Histogramme' },
  { value: 'heatmap', label: 'Carte de chaleur' },
  { value: 'kpi', label: 'Indicateurs (KPI)' },
  { value: 'table', label: 'Tableau' },
];
const AGGS = ['count', 'sum', 'avg', 'min', 'max', 'median', 'count_distinct'] as const;

export function DataView() {
  const projectId = useApp((s) => s.projectId);
  const toast = useApp((s) => s.toast);
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | undefined>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'profile' | 'grid' | 'chart'>('profile');

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setFiles(await api<string[]>(`/api/projects/${projectId}/data/files`).catch(() => []));
  }, [projectId]);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);
  useEffect(() => {
    const onOpen = (e: Event) => {
      setPath((e as CustomEvent<string>).detail);
      setSheet(undefined);
    };
    window.addEventListener('wb:open-dataset', onOpen);
    return () => window.removeEventListener('wb:open-dataset', onOpen);
  }, []);

  useEffect(() => {
    if (!path || !projectId) return;
    setLoading(true);
    api<Profile>(`/api/projects/${projectId}/data/inspect`, { query: { path, sheet } })
      .then(setProfile)
      .catch((err: Error) => {
        toast('error', err.message);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [path, sheet, projectId, toast]);

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.csv,.tsv,.xlsx,.xls,.xlsm,.ods,.json,.jsonl';
    input.onchange = async () => {
      const fd = new FormData();
      for (const f of input.files ?? []) fd.append('file', f, f.name);
      try {
        const saved = await api<{ path: string }[]>(`/api/projects/${projectId}/upload`, {
          body: fd,
          query: { dir: 'data' },
        });
        await loadFiles();
        if (saved[0]) setPath(saved[0].path);
        toast('success', `${saved.length} fichier(s) importé(s)`);
      } catch (err) {
        toast('error', (err as Error).message);
      }
    };
    input.click();
  };

  const ask = (question: string) => {
    if (!path) return;
    const app = useApp.getState();
    app.setLayout({ right: true, rightTab: 'agent' });
    app.setDraft({
      text: question,
      attachments: [path],
      role: 'data_analyst',
      send: true,
      ui: { dataset: path },
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[250px] shrink-0 flex-col border-r border-line bg-elev">
        <div className="flex h-9 items-center justify-between border-b border-line px-3">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">
            Jeux de données
          </span>
          <Button size="sm" variant="ghost" onClick={upload}>
            <Upload size={13} /> Importer
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {files.length === 0 && (
            <div className="p-3 text-[12.5px] text-faint">
              Aucun fichier CSV, Excel ou JSON. Importez-en un ou demandez à l'agent d'en créer.
            </div>
          )}
          {files.map((f) => (
            <button
              key={f}
              onClick={() => {
                setPath(f);
                setSheet(undefined);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-hover',
                f === path && 'bg-accent-soft',
              )}
              title={f}
            >
              <FileSpreadsheet size={14} className="shrink-0 text-ok" />
              <span className="truncate">{f}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {!path ? (
          <Empty icon={<Database size={36} />} title="Data Intelligence">
            Choisissez ou importez un fichier CSV, XLSX, XLSM ou JSON : colonnes, types, statistiques, valeurs
            manquantes, anomalies et graphiques interactifs sont calculés automatiquement.
          </Empty>
        ) : (
          <>
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
              <FileSpreadsheet size={15} className="text-ok" />
              <span className="truncate font-medium">{basename(path)}</span>
              {profile && profile.sheets.length > 1 && (
                <Select
                  value={sheet ?? profile.sheet ?? ''}
                  onChange={(v) => setSheet(v)}
                  options={profile.sheets.map((s) => ({ value: s, label: `Feuille : ${s}` }))}
                  className="h-7"
                />
              )}
              {profile && (
                <span className="text-[12px] text-muted">
                  {profile.rowCount.toLocaleString('fr-FR')} lignes × {profile.columnCount} colonnes
                </span>
              )}
              <AskBox onAsk={ask} />
            </div>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'profile', label: 'Profil' },
                { id: 'grid', label: 'Données' },
                { id: 'chart', label: 'Graphiques' },
              ]}
              right={
                <>
                  {(['csv', 'xlsx', 'json'] as const).map((fmt) => (
                    <Button
                      key={fmt}
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void downloadFile(
                          `/api/projects/${projectId}/data/export`,
                          `${basename(path).replace(/\.\w+$/, '')}.${fmt}`,
                          undefined,
                          { method: 'POST', body: { path, sheet, format: fmt } },
                        )
                      }
                    >
                      <Download size={12} /> {fmt.toUpperCase()}
                    </Button>
                  ))}
                </>
              }
            />
            <div className="min-h-0 flex-1 overflow-auto">
              {loading && (
                <div className="flex h-40 items-center justify-center">
                  <Spinner />
                </div>
              )}
              {!loading && profile && tab === 'profile' && <ProfilePanel profile={profile} />}
              {!loading && profile && tab === 'grid' && (
                <GridPanel path={path} sheet={sheet} columns={profile.columns.map((c) => c.name)} />
              )}
              {!loading && profile && tab === 'chart' && (
                <ChartBuilder path={path} sheet={sheet} profile={profile} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AskBox({ onAsk }: { onAsk: (q: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <form
      className="ml-auto flex w-[380px] items-center gap-1.5 rounded-full border border-line bg-input px-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) onAsk(q.trim());
        setQ('');
      }}
    >
      <Sparkles size={13} className="text-accent" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ex. « Montre l'évolution des impayés par mois »"
        className="h-8 flex-1 bg-transparent text-[12.5px] outline-none"
      />
    </form>
  );
}

function ProfilePanel({ profile }: { profile: Profile }) {
  const missingTotal = profile.columns.reduce((a, c) => a + c.missing, 0);
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ['Lignes', profile.rowCount.toLocaleString('fr-FR')],
          ['Colonnes', String(profile.columnCount)],
          ['Valeurs manquantes', missingTotal.toLocaleString('fr-FR')],
          ['Doublons', String(profile.duplicateRows)],
          ['Anomalies', String(profile.anomalies.length)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-panel p-3">
            <div className="text-[11.5px] text-muted">{l}</div>
            <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {profile.anomalies.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/6 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-warn">
            <AlertTriangle size={14} /> Anomalies détectées
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
            {profile.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-auto rounded-xl border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-hover">
            <tr>
              {['Colonne', 'Type', 'Manquants', 'Uniques', 'Statistiques / valeurs fréquentes'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name} className="border-t border-line/70">
                <td className="px-3 py-1.5 font-medium">{c.name}</td>
                <td className="px-3 py-1.5">
                  <Badge
                    tone={
                      c.type === 'number' || c.type === 'integer'
                        ? 'info'
                        : c.type === 'date'
                          ? 'accent'
                          : c.type === 'mixed'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {c.type}
                  </Badge>
                </td>
                <td className={cx('px-3 py-1.5 tabular-nums', c.missingPct >= 20 && 'text-warn')}>
                  {c.missing} ({c.missingPct}%)
                </td>
                <td className="px-3 py-1.5 tabular-nums">{c.unique}</td>
                <td className="px-3 py-1.5 text-muted">
                  {c.numeric
                    ? `min ${num(c.numeric.min)} · max ${num(c.numeric.max)} · moy ${num(c.numeric.mean)} · méd ${num(c.numeric.median)} · σ ${num(c.numeric.std)} · Σ ${num(c.numeric.sum)}${c.numeric.outliers ? ` · ${c.numeric.outliers} aberrantes` : ''}`
                    : c.date
                      ? `${c.date.min} → ${c.date.max}`
                      : c.top
                          ?.slice(0, 4)
                          .map((t) => `${t.value.slice(0, 24)} (${t.count})`)
                          .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridPanel({ path, sheet, columns }: { path: string; sheet?: string; columns: string[] }) {
  const projectId = useApp((s) => s.projectId);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null);
  const [filter, setFilter] = useState<{ column: string; value: string }>({
    column: columns[0] ?? '',
    value: '',
  });
  const size = 100;
  useEffect(() => {
    const query = {
      limit: size,
      offset: page * size,
      sort: sort ? [sort] : undefined,
      filters: filter.value ? [{ column: filter.column, op: 'contains', value: filter.value }] : undefined,
    };
    void api<{ rows: Record<string, unknown>[]; rowCount: number }>(`/api/projects/${projectId}/data/query`, {
      body: { path, sheet, query },
    }).then((r) => {
      setRows(r.rows);
      setTotal(r.rowCount);
    });
  }, [projectId, path, sheet, page, sort, filter]);
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <Select
          value={filter.column}
          onChange={(column) => setFilter({ ...filter, column })}
          options={columns.map((c) => ({ value: c, label: c }))}
          className="h-7"
        />
        <Input
          className="h-7 w-56"
          placeholder="Filtrer (contient)…"
          value={filter.value}
          onChange={(e) => {
            setFilter({ ...filter, value: e.target.value });
            setPage(0);
          }}
        />
        <Select
          value={sort ? `${sort.column}|${sort.dir}` : ''}
          onChange={(v) =>
            setSort(v ? { column: v.split('|')[0]!, dir: v.split('|')[1] as 'asc' | 'desc' } : null)
          }
          options={[
            { value: '', label: 'Sans tri' },
            ...columns.flatMap((c) => [
              { value: `${c}|asc`, label: `${c} ↑` },
              { value: `${c}|desc`, label: `${c} ↓` },
            ]),
          ]}
          className="h-7"
        />
        <span className="ml-auto text-[12px] text-muted">
          {total.toLocaleString('fr-FR')} lignes · page {page + 1}/{Math.max(1, Math.ceil(total / size))}
        </span>
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={(page + 1) * size >= total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={14} />
        </Button>
      </div>
      <DataTable rows={rows} columns={columns} maxHeight={10_000} />
    </div>
  );
}

function ChartBuilder({ path, sheet, profile }: { path: string; sheet?: string; profile: Profile }) {
  const projectId = useApp((s) => s.projectId);
  const sessionId = useSession((s) => s.sessionId);
  const toast = useApp((s) => s.toast);
  const cols = profile.columns;
  const numeric = cols.filter((c) => c.type === 'number' || c.type === 'integer');
  const dates = cols.filter((c) => c.type === 'date');
  const cats = cols.filter((c) => c.type === 'categorical' || c.type === 'boolean' || c.type === 'text');
  const [type, setType] = useState<ChartSpec['type']>(dates.length && numeric.length ? 'line' : 'bar');
  const [x, setX] = useState(dates[0]?.name ?? cats[0]?.name ?? cols[0]?.name ?? '');
  const [bucket, setBucket] = useState<string>(dates.length ? 'month' : '');
  const [y, setY] = useState(numeric[0]?.name ?? '*');
  const [agg, setAgg] = useState<(typeof AGGS)[number]>(numeric.length ? 'sum' : 'count');
  const [series, setSeries] = useState('');
  const [chart, setChart] = useState<ChartData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const spec = useMemo<ChartSpec>(
    () => ({
      type,
      title: `${agg}(${y === '*' ? 'lignes' : y})${x ? ` par ${x}` : ''}`,
      source: { path, sheet },
      x: x
        ? { column: x, bucket: (bucket || undefined) as NonNullable<ChartSpec['x']>['bucket'] }
        : undefined,
      y: [{ column: y, agg: y === '*' ? 'count' : agg }],
      series: series || undefined,
    }),
    [type, x, bucket, y, agg, series, path, sheet],
  );
  useEffect(() => {
    setErr(null);
    void api<{ chart: ChartData }>(`/api/projects/${projectId}/data/chart`, { body: { spec } })
      .then((r) => setChart(r.chart))
      .catch((e: Error) => {
        setChart(null);
        setErr(e.message);
      });
  }, [spec, projectId]);
  const colOpts = [
    { value: '', label: '—' },
    ...cols.map((c) => ({ value: c.name, label: `${c.name} (${c.type})` })),
  ];
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <BarChart3 size={15} className="text-accent" />
        <Select value={type} onChange={setType} options={CHART_TYPES} className="h-8" />
        <span className="text-muted">X</span>
        <Select value={x} onChange={setX} options={colOpts} className="h-8 max-w-48" />
        <Select
          value={bucket}
          onChange={setBucket}
          options={[
            { value: '', label: 'pas de regroupement temporel' },
            { value: 'day', label: 'par jour' },
            { value: 'week', label: 'par semaine' },
            { value: 'month', label: 'par mois' },
            { value: 'quarter', label: 'par trimestre' },
            { value: 'year', label: 'par année' },
          ]}
          className="h-8"
        />
        <span className="text-muted">Y</span>
        <Select
          value={y}
          onChange={setY}
          options={[
            { value: '*', label: 'Nombre de lignes' },
            ...cols.map((c) => ({ value: c.name, label: c.name })),
          ]}
          className="h-8 max-w-48"
        />
        <Select
          value={agg}
          onChange={setAgg}
          options={AGGS.map((a) => ({ value: a, label: a }))}
          className="h-8"
        />
        <span className="text-muted">Séries</span>
        <Select value={series} onChange={setSeries} options={colOpts} className="h-8 max-w-44" />
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          onClick={async () => {
            try {
              await api(`/api/projects/${projectId}/data/chart`, { body: { spec, save: true, sessionId } });
              toast('success', 'Graphique enregistré dans les artefacts');
              void useSession.getState().refreshSide();
            } catch (e) {
              toast('error', (e as Error).message);
            }
          }}
        >
          <Save size={13} /> Enregistrer
        </Button>
      </div>
      <div className="min-h-[320px] flex-1 rounded-xl border border-line bg-panel p-3">
        {err ? (
          <div className="text-[13px] text-err">{err}</div>
        ) : chart ? (
          <ChartView data={chart} height={Math.max(320, window.innerHeight - 330)} />
        ) : (
          <Spinner />
        )}
      </div>
      {chart && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-faint">
          <Table2 size={12} /> {chart.rowCount.toLocaleString('fr-FR')} lignes utilisées
        </div>
      )}
    </div>
  );
}
