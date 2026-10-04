import { useMemo, useRef, useState } from 'react';
import { BarChart3, Database, MessageSquare, Upload } from 'lucide-react';
import type { ChartData, ChartSpec } from '@shared/types';
import { Button, Empty, Field, Select, Tabs } from '../../web/components/ui';
import { ChartView, DataTable } from '../../web/components/rich';
import { cx } from '../../web/lib/format';
import { DataCore, isDataFile, type Dataset } from '../../server/services/dataCore';
import { computeChart } from '../../server/services/vizEngine';
import { uid, useStore } from '../lib/store';
import { bytesOf, importBrowserFile } from '../lib/vfs';

const core = new DataCore();
type ChartType = ChartSpec['type'];
type Agg = NonNullable<ChartSpec['y']>[number]['agg'];

export function DataView() {
  const files = useStore((s) => s.files);
  const dataFiles = useMemo(
    () =>
      Object.values(files)
        .filter((f) => isDataFile(f.path))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [files],
  );
  const [path, setPath] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'rows' | 'chart'>('profile');
  const input = useRef<HTMLInputElement>(null);
  const current = path ? files[path] : dataFiles[0];

  const { ds, sheets, error } = useMemo(() => {
    if (!current) return { ds: null, sheets: [] as string[], error: null };
    try {
      const bytes = bytesOf(current);
      return {
        ds: core.parseBytes(current.path, bytes, sheet),
        sheets: core.sheetNamesOf(current.path, bytes),
        error: null,
      };
    } catch (e) {
      return { ds: null, sheets: [] as string[], error: (e as Error).message };
    }
  }, [current, sheet]);
  const profile = useMemo(() => (ds ? core.profile(ds) : null), [ds]);

  return (
    <div className="flex h-full">
      <div className="flex w-64 shrink-0 flex-col border-r border-line">
        <div className="border-b border-line p-2">
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb,.ods,.json,.jsonl"
            onChange={(e) => {
              const fl = e.target.files;
              if (fl)
                void Promise.all(Array.from(fl).map((f) => importBrowserFile(f, 'data'))).then((v) =>
                  setPath(v[0]!.path),
                );
              e.target.value = '';
            }}
          />
          <Button size="sm" className="w-full" onClick={() => input.current?.click()}>
            <Upload size={13} /> Importer CSV / Excel / JSON
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {dataFiles.map((f) => (
            <button
              key={f.path}
              onClick={() => {
                setPath(f.path);
                setSheet(null);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]',
                current?.path === f.path ? 'bg-hover' : 'hover:bg-hover/60',
              )}
            >
              <Database size={13} className="shrink-0 text-faint" />{' '}
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        {!current ? (
          <Empty icon={<Database size={28} />} title="Data Intelligence">
            Importez un fichier CSV, Excel ou JSON : profil des colonnes, anomalies, tableau, graphiques
            interactifs — et demandez l’analyse à l’agent.
          </Empty>
        ) : (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <div className="text-[15px] font-semibold">{current.path}</div>
                {profile && (
                  <div className="text-[12px] text-muted">
                    {profile.rowCount.toLocaleString('fr-FR')} lignes · {profile.columnCount} colonnes ·{' '}
                    {profile.duplicateRows} doublon(s)
                  </div>
                )}
              </div>
              {sheets.length > 1 && (
                <Select
                  value={sheet ?? sheets[0]!}
                  onChange={setSheet}
                  options={sheets.map((s) => ({ value: s, label: s }))}
                />
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const st = useStore.getState();
                  const s = st.newSession();
                  st.patchSession(s.id, { agent: 'data_analyst' });
                  useStore.setState({
                    draft: `Analyse le fichier ${current.path} : qualité des données, chiffres clés, tendances, anomalies, et propose 3 graphiques utiles.`,
                  });
                }}
              >
                <MessageSquare size={13} /> Analyser avec l’agent
              </Button>
            </div>
            {error && (
              <div className="rounded-lg border border-err/40 bg-err/10 p-3 text-[13px] text-err">
                {error}
              </div>
            )}
            {ds && profile && (
              <>
                <Tabs
                  tabs={[
                    { id: 'profile', label: 'Profil' },
                    { id: 'rows', label: 'Données' },
                    { id: 'chart', label: 'Graphiques' },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                <div className="mt-3">
                  {tab === 'profile' && (
                    <>
                      {profile.anomalies.length > 0 && (
                        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/5 p-3 text-[13px]">
                          <div className="mb-1 font-semibold">Anomalies détectées</div>
                          <ul className="list-disc pl-5 text-muted">
                            {profile.anomalies.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <DataTable
                        rows={profile.columns.map((c) => ({
                          colonne: c.name,
                          type: c.type,
                          manquants: `${c.missing} (${c.missingPct}%)`,
                          uniques: c.unique,
                          stats: c.numeric
                            ? `min ${c.numeric.min} · max ${c.numeric.max} · moy ${Math.round(c.numeric.mean * 100) / 100}`
                            : c.date
                              ? `${c.date.min} → ${c.date.max}`
                              : (c.top ?? [])
                                  .slice(0, 4)
                                  .map((t) => `${t.value} (${t.count})`)
                                  .join(', '),
                        }))}
                        maxHeight={600}
                      />
                    </>
                  )}
                  {tab === 'rows' && (
                    <DataTable
                      rows={ds.rows.slice(0, 2000) as Record<string, unknown>[]}
                      columns={ds.columns}
                      maxHeight={640}
                    />
                  )}
                  {tab === 'chart' && <ChartBuilder ds={ds} path={current.path} sheet={sheet} />}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartBuilder({ ds, path, sheet }: { ds: Dataset; path: string; sheet: string | null }) {
  const [type, setType] = useState<ChartType>('bar');
  const [x, setX] = useState(ds.columns[0] ?? '');
  const [y, setY] = useState('*');
  const [agg, setAgg] = useState<Agg>('count');
  const [bucket, setBucket] = useState<'' | 'month' | 'quarter' | 'year' | 'week' | 'day'>('');
  const [series, setSeries] = useState('');
  const { chart, error } = useMemo<{ chart: ChartData | null; error: string | null }>(() => {
    try {
      const spec: ChartSpec = {
        type,
        title: `${agg === 'count' ? 'Nombre' : `${agg} de ${y}`} par ${x}`,
        source: { path, sheet: sheet ?? undefined },
        x: { column: x, bucket: bucket || undefined },
        y: [{ column: agg === 'count' ? '*' : y, agg }],
        series: series || undefined,
        limit: 50,
        sort: type === 'line' || type === 'area' || bucket ? 'x' : 'y_desc',
      };
      return { chart: computeChart(ds, spec), error: null };
    } catch (e) {
      return { chart: null, error: (e as Error).message };
    }
  }, [ds, type, x, y, agg, bucket, series, path, sheet]);
  const cols = ds.columns.map((c) => ({ value: c, label: c }));
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Type">
          <Select<ChartType>
            value={type}
            onChange={setType}
            options={(
              ['bar', 'line', 'area', 'pie', 'scatter', 'histogram', 'heatmap', 'kpi'] as ChartType[]
            ).map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Axe X">
          <Select value={x} onChange={setX} options={cols} />
        </Field>
        <Field label="Regroupement date">
          <Select
            value={bucket}
            onChange={setBucket}
            options={[
              { value: '', label: '—' },
              { value: 'day', label: 'jour' },
              { value: 'week', label: 'semaine' },
              { value: 'month', label: 'mois' },
              { value: 'quarter', label: 'trimestre' },
              { value: 'year', label: 'année' },
            ]}
          />
        </Field>
        <Field label="Mesure">
          <Select<Agg>
            value={agg}
            onChange={setAgg}
            options={(['count', 'sum', 'avg', 'min', 'max', 'median', 'count_distinct'] as Agg[]).map(
              (a) => ({ value: a, label: a }),
            )}
          />
        </Field>
        <Field label="Colonne mesurée">
          <Select value={y} onChange={setY} options={[{ value: '*', label: '(lignes)' }, ...cols]} />
        </Field>
        <Field label={type === 'heatmap' ? 'Axe Y' : 'Séries'}>
          <Select value={series} onChange={setSeries} options={[{ value: '', label: '—' }, ...cols]} />
        </Field>
      </div>
      {error && <div className="mb-2 text-[13px] text-err">{error}</div>}
      {chart && (
        <div className="rounded-xl border border-line bg-panel p-3">
          <ChartView data={chart} height={380} />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                useStore.getState().addArtifact({
                  id: uid(),
                  name: chart.spec.title,
                  type: 'chart',
                  content: JSON.stringify(chart),
                  chart,
                  createdAt: Date.now(),
                  sessionId: '',
                });
                useStore.getState().toast('ok', 'Graphique enregistré dans les artefacts');
              }}
            >
              <BarChart3 size={13} /> Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
