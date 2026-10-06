// Spaces 16–20: Prompt Genome, Asset Library (+ Visual Source Lab), Production Memory, Production Analytics, Model Lab.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Toggle } from '../../../web/components/ui';
import { useStudio, DEFAULT_STUDIO } from '../../lib/studio/store';
import { blobs, quota, type Quota } from '../../lib/studio/blobs';
import { loadRegistry } from '../../lib/studio/actions';
import { cancelVideo, testModel } from '../../lib/studio/actions2';
import {
  compose,
  GENOME_DIMENSIONS,
  MOTIFS,
  TEMPLATES,
  sceneDims,
  withMotifs,
  type Dims,
  type GenomeDimension,
  type TemplateId,
} from '../../../server/jev/studio/genome';
import { analytics, championTable, hints, promptPatterns } from '../../../server/jev/studio/memory';
import { stats as jobStats } from '../../../server/jev/studio/jobs';
import { spent } from '../../../server/jev/studio/blueprint';
import type { AssetKind, AssetStatus, CostMode } from '../../../server/jev/studio/types';
import { AssetGraphPanel } from './film';
import { Card, ErrorBox, Label, NoData, Thumb, useActive, useBlobUrl, useRunner, usd } from './common';

// ───────── 16. Prompt Genome ─────────
const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export function GenomeView() {
  const bp = useActive();
  const S = useStudio();
  const [tpl, setTpl] = useState<TemplateId>('image');
  const [dims, setDims] = useState<Dims>({});
  const [max, setMax] = useState('2400');
  const [inline, setInline] = useState(true);
  const [motifs, setMotifs] = useState<string[]>([]);
  const final = useMemo(() => withMotifs(dims, motifs), [dims, motifs]);
  const c = useMemo(
    () => compose(tpl, final, { maxChars: Number(max) || undefined, negativeInline: inline }),
    [tpl, final, max, inline],
  );
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const load = (sid: string) => {
    const sc = bp.scenes.find((s) => s.scene_id === sid);
    if (sc)
      setDims(
        sceneDims(sc, {
          style: bp.styleDNA,
          characters: bp.characters,
          worlds: bp.worlds,
          platform: bp.platform,
          aspect: bp.aspect,
        }),
      );
  };
  return (
    <div className="space-y-3" data-testid="studio-genome">
      <Card title="Prompt Genome — moteur de composition">
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <Label>Gabarit</Label>
            <Select
              value={tpl}
              onChange={(v) => setTpl(v as TemplateId)}
              options={TEMPLATE_IDS.map((x) => ({ value: x, label: x }))}
            />
          </div>
          <div>
            <Label>Charger une scène</Label>
            <Select
              value=""
              onChange={load}
              options={[
                { value: '', label: '—' },
                ...bp.scenes.map((s) => ({ value: s.scene_id, label: s.scene_id })),
              ]}
            />
          </div>
          <div>
            <Label>Longueur max (caractères)</Label>
            <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
          <div className="pt-4">
            <Toggle checked={inline} onChange={setInline} label="Négatifs dans le prompt" />
          </div>
        </div>
        <Label>Motifs composables</Label>
        <div className="flex flex-wrap gap-2 text-[12px]">
          {Object.entries(MOTIFS).map(([id, m]) => (
            <label key={id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={motifs.includes(id)}
                onChange={(e) =>
                  setMotifs((x) => (e.target.checked ? [...x, id] : x.filter((y) => y !== id)))
                }
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {GENOME_DIMENSIONS.map((d: GenomeDimension) => (
            <div key={d} className={TEMPLATES[tpl].some(([x]) => x === d) ? '' : 'opacity-50'}>
              <Label>{d}</Label>
              <Input value={dims[d] ?? ''} onChange={(e) => setDims({ ...dims, [d]: e.target.value })} />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Prompt compilé" right={<Badge tone="accent">{c.version}</Badge>} testId="genome-output">
        <Textarea readOnly rows={6} value={c.text} data-testid="genome-text" />
        <div className="mt-1 text-[12px] text-faint">
          {c.text.length} caractères · utilisées : {c.used.join(', ') || '—'}
          {c.truncated && ' · tronqué'}
        </div>
        {c.warnings.map((w) => (
          <div key={w} className="text-[12px] text-warn">
            ⚠ {w}
          </div>
        ))}
        <Button
          className="mt-2"
          size="sm"
          onClick={() =>
            S.patchProject(
              bp.project.id,
              (b) => ({
                ...b,
                prompts: [
                  ...b.prompts,
                  {
                    id: `pr-${Date.now().toString(36)}`,
                    version: c.version,
                    kind: tpl,
                    text: c.text,
                    at: Date.now(),
                  },
                ],
              }),
              'prompt enregistré',
            )
          }
        >
          Enregistrer dans le projet
        </Button>
      </Card>
      <Card title={`Prompts du projet (${bp.prompts.length})`}>
        {bp.prompts.length === 0 ? (
          <NoData />
        ) : (
          <ul className="space-y-1 text-[12px]">
            {bp.prompts
              .slice(-20)
              .reverse()
              .map((p) => (
                <li key={p.id}>
                  <Badge tone="neutral">{p.version}</Badge> {p.kind} {p.model ?? ''} — {p.text.slice(0, 140)}
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────── 17. Asset Library + Visual Source Lab ─────────
const KINDS: AssetKind[] = [
  'image',
  'video',
  'audio',
  'voice',
  'music',
  'sfx',
  'character',
  'style',
  'world',
  'scene',
  'prompt',
];
const STATUS_LABEL: Record<AssetStatus, string> = {
  SOURCE_REFERENCE: 'SOURCE REFERENCE',
  GENERATED_ASSET: 'GENERATED ASSET',
  FINAL_ASSET: 'FINAL ASSET',
};
function AssetThumb({ id, kind, mime }: { id: string; kind: AssetKind; mime: string }) {
  const url = useBlobUrl(
    mime.startsWith('audio') || mime.startsWith('video') || mime.startsWith('image') ? id : null,
  );
  if (mime.startsWith('image')) return <Thumb id={id} className="h-24 w-full" />;
  if (!url)
    return (
      <div className="flex h-24 items-center justify-center rounded border border-dashed border-line text-[11px] text-faint">
        {kind}
      </div>
    );
  return mime.startsWith('video') ? (
    <video src={url} controls className="h-24 w-full rounded" />
  ) : (
    <audio src={url} controls className="w-full" />
  );
}
export function AssetLibrary() {
  const S = useStudio();
  const bp = useActive();
  const r = useRunner();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [quotaInfo, setQuota] = useState<Quota | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void quota().then(setQuota);
  }, [S.assets]);
  const list = useMemo(
    () =>
      Object.values(S.assets)
        .filter(
          (a) =>
            (!kind || a.kind === kind) &&
            (!status || a.status === status) &&
            (!q ||
              `${a.name} ${a.model ?? ''} ${a.prompt ?? ''} ${a.tags.join(' ')} ${a.source}`
                .toLowerCase()
                .includes(q.toLowerCase())),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [S.assets, kind, status, q],
  );
  const addRef = async (blob: Blob, name: string, source: string, internet: boolean) => {
    const id = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    await blobs.put(id, blob);
    S.addAsset({
      id,
      kind: blob.type.startsWith('video') ? 'video' : blob.type.startsWith('audio') ? 'audio' : 'image',
      status: 'SOURCE_REFERENCE',
      projectId: bp?.project.id,
      createdAt: Date.now(),
      cost: 0,
      source,
      tags: ['reference', ...(internet ? ['internet'] : [])],
      mime: blob.type || 'image/png',
      bytes: blob.size,
      name,
      rightsNote: internet ? 'Reference asset — verify usage rights before publication' : undefined,
    });
  };
  const fromUrl = () =>
    void r.run('Téléchargement…', async () => {
      if (!/^https:\/\//i.test(url)) throw new Error('URL https:// requise');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await addRef(
        await res.blob(),
        url.split('/').pop() || 'reference',
        `Internet : ${new URL(url).hostname}${note ? ` — ${note}` : ''}`,
        true,
      );
      setUrl('');
    });
  return (
    <div className="space-y-3" data-testid="studio-assets">
      <AssetGraphPanel />
      <Card title="Visual Source Lab — références">
        <div className="text-[12.5px] text-muted">
          Toute référence venue d’Internet porte la mention{' '}
          <b>« Reference asset — verify usage rights before publication »</b> : elle n’est jamais présentée
          comme libre de droits.
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <Label>URL d’une image de référence</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              data-testid="asset-url"
            />
          </div>
          <div className="min-w-[200px]">
            <Label>Note (source / licence)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button disabled={!url || Boolean(r.busy)} onClick={fromUrl}>
            Ajouter
          </Button>
          <Button onClick={() => file.current?.click()}>Importer un fichier local</Button>
          <input
            ref={file}
            type="file"
            multiple
            accept="image/*,audio/*,video/*"
            className="hidden"
            data-testid="asset-file"
            onChange={(e) => {
              for (const f of [...(e.target.files ?? [])]) void addRef(f, f.name, 'import local', false);
              e.target.value = '';
            }}
          />
        </div>
        <ErrorBox error={r.error} />
      </Card>
      <Card
        title={`Asset Library (${list.length}/${Object.keys(S.assets).length})`}
        right={
          quotaInfo?.ratio != null && (
            <Badge tone={quotaInfo.warn ? 'err' : 'neutral'}>
              stockage {(quotaInfo.ratio * 100).toFixed(1)} %{quotaInfo.warn ? ' — ALERTE > 80 %' : ''}
            </Badge>
          )
        }
      >
        <div className="mb-2 grid gap-2 md:grid-cols-4">
          <div>
            <Label>Type</Label>
            <Select
              value={kind}
              onChange={setKind}
              options={[{ value: '', label: 'tous' }, ...KINDS.map((k) => ({ value: k, label: k }))]}
            />
          </div>
          <div>
            <Label>Statut</Label>
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'tous' },
                ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l })),
              ]}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Recherche (nom, modèle, prompt, tags)</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} data-testid="asset-search" />
          </div>
        </div>
        <div className="mb-1 text-[11.5px] text-faint">
          Recherche sémantique : aucune capacité d’embeddings détectée dans le Workbench — filtres textuels
          uniquement.
        </div>
        {list.length === 0 ? (
          <NoData />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="asset-list">
            {list.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-line p-2 text-[11.5px]"
                data-testid={`asset-${a.id}`}
              >
                <AssetThumb id={a.id} kind={a.kind} mime={a.mime} />
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge
                    tone={
                      a.status === 'FINAL_ASSET' ? 'ok' : a.status === 'SOURCE_REFERENCE' ? 'info' : 'neutral'
                    }
                  >
                    {STATUS_LABEL[a.status]}
                  </Badge>
                  <Badge tone="neutral">{a.kind}</Badge>
                </div>
                <div className="truncate" title={a.name}>
                  {a.name}
                </div>
                <div className="text-faint">
                  {a.model ?? a.source} · {new Date(a.createdAt).toISOString().slice(0, 10)} · coût{' '}
                  {a.cost === null ? 'non mesuré' : usd(a.cost)} · qualité {a.quality ?? 'non mesurée'}
                </div>
                {a.rightsNote && <div className="text-warn">{a.rightsNote}</div>}
                <div className="text-faint">
                  {a.projectId ? `projet ${a.projectId.slice(-6)}` : ''} {a.sceneId ?? ''}{' '}
                  {a.characterId ?? ''}
                </div>
                <div className="mt-1 flex gap-1">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const b = await blobs.get(a.id);
                      if (!b) return;
                      const el = document.createElement('a');
                      el.href = URL.createObjectURL(b);
                      el.download = a.name;
                      el.click();
                    }}
                  >
                    <Download size={12} />
                  </Button>
                  {a.status === 'GENERATED_ASSET' && (
                    <Button size="sm" onClick={() => S.addAsset({ ...a, status: 'FINAL_ASSET' })}>
                      → FINAL
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      void blobs.del(a.id);
                      S.removeAsset(a.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────── 18. Production Memory ─────────
export function MemoryView() {
  const S = useStudio();
  const tables = useMemo(() => championTable(S.memory), [S.memory]);
  const pats = useMemo(() => promptPatterns(S.memory), [S.memory]);
  const hs = useMemo(() => hints(S.memory), [S.memory]);
  return (
    <div className="space-y-3" data-testid="studio-memory">
      <Card title="Ce qui a marché et échoué (mémoire de production réelle)">
        <div className="text-[12.5px] text-muted">
          Une réussite isolée ne devient jamais une règle : un champion exige n ≥ 20 et une borne basse de
          réussite élevée ; un motif de prompt devient règle après ≥ 5 essais.
        </div>
        {S.memory.length === 0 ? (
          <div className="mt-2">
            <NoData />
          </div>
        ) : (
          <div className="mt-2 text-[12.5px]" data-testid="memory-summary">
            {S.memory.length} enregistrement(s) · {S.memory.filter((m) => m.success).length} réussite(s) ·{' '}
            {S.memory.filter((m) => !m.success).length} échec(s)
          </div>
        )}
      </Card>
      <Card title="Règles retenues pour les prochaines productions">
        {hs.length ? (
          <ul className="list-disc pl-5 text-[12.5px]">
            {hs.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : (
          <NoData>Aucune règle validée : échantillon insuffisant.</NoData>
        )}
      </Card>
      <Card title="Motifs de prompt (Prompt Genome)">
        {pats.length === 0 ? (
          <NoData />
        ) : (
          <ul className="space-y-0.5 text-[12px]">
            {pats.map((p) => (
              <li key={p.prompt}>
                <Badge tone={p.isRule ? 'ok' : 'neutral'}>{p.isRule ? 'RÈGLE' : 'à confirmer'}</Badge>{' '}
                {p.prompt} — n={p.n}, réussite ≥ {p.success ? (p.success.lo * 100).toFixed(0) : '—'} %
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Échecs récents">
        {S.memory.filter((m) => !m.success).length === 0 ? (
          <NoData>Aucun échec enregistré.</NoData>
        ) : (
          <ul className="space-y-0.5 text-[12px]">
            {S.memory
              .filter((m) => !m.success)
              .slice(-15)
              .reverse()
              .map((m) => (
                <li key={m.id}>
                  {new Date(m.at).toISOString().slice(0, 16)} · {m.kind} {m.task} · {m.model} ·{' '}
                  <Badge tone="err">{m.errorClass ?? 'UNKNOWN'}</Badge>
                </li>
              ))}
          </ul>
        )}
      </Card>
      <ChampTable tables={tables} />
    </div>
  );
}
function ChampTable({ tables }: { tables: ReturnType<typeof championTable> }) {
  return (
    <Card title="Champions et challengers audiovisuels" testId="champ-table">
      {tables.length === 0 ? (
        <NoData />
      ) : (
        tables.map((t) => (
          <div key={t.key} className="mb-3">
            <div className="text-[12.5px] font-medium">
              {t.key} — <span className="text-muted">{t.decision}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-faint">
                    <th>Modèle</th>
                    <th>n</th>
                    <th>Réussite (IC 95 %)</th>
                    <th>Qualité</th>
                    <th>Confiance</th>
                    <th>Coût moy.</th>
                    <th>Latence</th>
                    <th>Récent</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r) => (
                    <tr key={r.model} className="border-t border-line">
                      <td>{r.model}</td>
                      <td>{r.n}</td>
                      <td>
                        {r.success
                          ? `${(r.success.value * 100).toFixed(0)} % [${(r.success.lo * 100).toFixed(0)}–${(r.success.hi * 100).toFixed(0)}]`
                          : '—'}
                      </td>
                      <td>{r.quality ? r.quality.value.toFixed(1) : `non mesurée (n=${r.qualityN})`}</td>
                      <td>{r.confidence.replace('_', ' ')}</td>
                      <td>{usd(r.cost)}</td>
                      <td>{r.latencyMs === null ? 'non mesuré' : `${(r.latencyMs / 1000).toFixed(1)} s`}</td>
                      <td>{r.recentSuccess === null ? '—' : `${(r.recentSuccess * 100).toFixed(0)} %`}</td>
                      <td>
                        {t.champion === r.model ? (
                          <Badge tone="ok">CHAMPION</Badge>
                        ) : t.challenger === r.model ? (
                          <Badge tone="warn">CHALLENGER</Badge>
                        ) : (
                          <Badge tone="neutral">{r.n < 5 ? 'INSUFFICIENT SAMPLE' : 'candidat'}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// ───────── 19. Production Analytics ─────────
const Bar = ({ label, value, max, text }: { label: string; value: number; max: number; text: string }) => (
  <div className="flex items-center gap-2 text-[12px]">
    <div className="w-44 truncate" title={label}>
      {label}
    </div>
    <div className="h-3 flex-1 rounded bg-hover">
      <div className="h-3 rounded bg-accent" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
    <div className="w-24 text-right">{text}</div>
  </div>
);
export function AnalyticsView() {
  const S = useStudio();
  const projects = Object.values(S.projects);
  const a = useMemo(
    () =>
      analytics(S.memory, {
        projects: projects.length,
        scenes: projects.reduce((n, p) => n + p.scenes.length, 0),
      }),
    [S.memory, projects],
  );
  const byModel = useMemo(() => {
    const m = new Map<string, { n: number; cost: number }>();
    for (const r of S.memory)
      m.set(r.model, { n: (m.get(r.model)?.n ?? 0) + 1, cost: (m.get(r.model)?.cost ?? 0) + (r.cost ?? 0) });
    return [...m].sort((x, y) => y[1].cost - x[1].cost);
  }, [S.memory]);
  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of S.memory) m.set(r.kind, (m.get(r.kind) ?? 0) + (r.cost ?? 0));
    return [...m];
  }, [S.memory]);
  if (!a)
    return (
      <div data-testid="studio-analytics">
        <NoData />
      </div>
    );
  const kpis: [string, string][] = [
    ['Productions', String(projects.length)],
    ['Images générées', String(a.images)],
    ['Coût total', usd(a.totalCost)],
    ['Coût / production', usd(a.costPerVideo)],
    ['Coût / scène', usd(a.costPerScene)],
    ['Qualité moyenne', a.qualityMean === null ? 'non mesurée' : a.qualityMean.toFixed(1)],
    ['Taux de réussite', `${(a.successRate! * 100).toFixed(0)} %`],
    ['Taux de régénération', `${(a.regenerationRate! * 100).toFixed(0)} %`],
    ['Taux de secours', `${(a.fallbackRate! * 100).toFixed(0)} %`],
    ['Dépense LEARNING INVESTMENT', usd(a.learningSpend)],
    ['Modèle le plus utilisé', a.topModel ? `${a.topModel.model} (${a.topModel.n})` : '—'],
    ['1ʳᵉ cause d’échec', a.topError ? `${a.topError.cls} (${a.topError.n})` : 'aucun échec'],
  ];
  return (
    <div className="space-y-3" data-testid="studio-analytics">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line p-2">
            <Label>{k}</Label>
            <div className="text-[14px] font-medium">{v}</div>
          </div>
        ))}
      </div>
      <Card title="Coût par type de média">
        {byKind.map(([k, v]) => (
          <Bar key={k} label={k} value={v} max={Math.max(...byKind.map((x) => x[1]), 1e-9)} text={usd(v)} />
        ))}
      </Card>
      <Card title="Coût par modèle">
        {byModel.map(([m, v]) => (
          <Bar
            key={m}
            label={m}
            value={v.cost}
            max={Math.max(...byModel.map((x) => x[1].cost), 1e-9)}
            text={`${usd(v.cost)} · n=${v.n}`}
          />
        ))}
      </Card>
      <div className="text-[11.5px] text-faint">
        Dépense premium évitée : non calculée (aucune référence premium mesurée sur ces tâches). Graphiques
        établis à partir des seules données réelles.
      </div>
    </div>
  );
}

// ───────── 20. Model Lab ─────────
const MODES: CostMode[] = ['ECO', 'BALANCED', 'QUALITY', 'PREMIUM', 'AUTOPILOT'];
export function ModelLab() {
  const S = useStudio();
  const bp = useActive();
  const r = useRunner();
  const [kind, setKind] = useState('image');
  const [q, setQ] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const reg = S.registry;
  const age = reg ? Math.round((Date.now() - reg.at) / 60000) : null;
  const models = useMemo(
    () =>
      (reg?.models ?? []).filter(
        (m) => m.kind === kind && (!q || `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [reg, kind, q],
  );
  const js = jobStats(S.jobs);
  useEffect(() => {
    if (!S.registry) void loadRegistry().catch(() => undefined);
  }, [S.registry]);
  const tables = useMemo(() => championTable(S.memory), [S.memory]);
  return (
    <div className="space-y-3" data-testid="studio-modellab">
      <Card title="Réglages du studio">
        <div className="flex flex-wrap items-end gap-3">
          <Toggle
            checked={S.settings.enabled}
            onChange={(v) => S.setSettings({ enabled: v })}
            label="Studio activé"
          />
          <div>
            <Label>Mode du Cost Governor</Label>
            <Select
              value={bp?.mode ?? S.settings.mode}
              onChange={(v) => {
                S.setSettings({ mode: v as CostMode });
                if (bp) S.patchProject(bp.project.id, (b) => ({ ...b, mode: v as CostMode }));
              }}
              options={MODES.map((m) => ({ value: m, label: m }))}
            />
          </div>
          <div>
            <Label>Plafond dur par production ($)</Label>
            <Input
              className="w-28"
              type="number"
              min={0}
              step={0.1}
              value={bp?.cap ?? S.settings.cap}
              onChange={(e) => {
                const v = Number(e.target.value);
                S.setSettings({ cap: v });
                if (bp) S.patchProject(bp.project.id, (b) => ({ ...b, cap: v }), 'plafond modifié');
              }}
              data-testid="cap-input"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => S.setSettings({ cap: DEFAULT_STUDIO.cap })}>
            Défaut 1 $
          </Button>
          {bp && (
            <div className="text-[12.5px]">
              Dépensé : <b>{usd(spent(bp))}</b> / {bp.cap.toFixed(2)} $
            </div>
          )}
        </div>
        <div className="mt-1 text-[11.5px] text-faint">
          Posez aussi une limite de crédit sur votre clé côté openrouter.ai : le plafond du studio est une
          protection logicielle, pas une garantie bancaire.
        </div>
      </Card>
      <Card
        title="MediaCapabilityRegistry"
        right={
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(S.busy)}
            onClick={() => void r.run('Découverte…', () => loadRegistry(true))}
            data-testid="discover"
          >
            <RefreshCw size={12} /> DISCOVER CAPABILITIES
          </Button>
        }
      >
        {!reg ? (
          <NoData>Registre non construit (découverte en cours ou impossible).</NoData>
        ) : (
          <div className="text-[12.5px]" data-testid="registry-summary">
            Construit il y a {age} min (cache 1 h) · {reg.models.length} modèles ·{' '}
            {reg.sources.map((s) => (
              <Badge key={s.endpoint} tone={s.ok ? 'ok' : 'err'}>
                {s.endpoint} {s.ok ? s.count : 'ÉCHEC'}
              </Badge>
            ))}
            {reg.added.length > 0 && <div>Nouveaux : {reg.added.slice(0, 8).join(', ')}</div>}
            {reg.removed.length > 0 && <div>Retirés (plus jamais proposés) : {reg.removed.join(', ')}</div>}
          </div>
        )}
        <ErrorBox error={r.error} />
        {testMsg && (
          <div className="mt-1 text-[12px]" data-testid="model-test-msg">
            {testMsg}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Select
            value={kind}
            onChange={setKind}
            options={[
              { value: 'image', label: 'images' },
              { value: 'video', label: 'vidéos' },
              { value: 'speech', label: 'voix' },
              { value: 'music', label: 'musique' },
            ]}
          />
          <Input
            className="max-w-xs"
            placeholder="filtrer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {models.length > 0 && (
          <div className="mt-2 max-h-96 overflow-auto">
            <table className="w-full text-[12px]" data-testid="registry-table">
              <thead>
                <tr className="text-left text-faint">
                  <th>Modèle</th>
                  <th>Capacités</th>
                  <th>Paramètres</th>
                  <th>Prix (brut)</th>
                  <th>Latence</th>
                  <th>Test</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td>
                      {m.id}
                      {m.free && <Badge tone="ok">gratuit</Badge>}
                    </td>
                    <td>{m.caps.join(' · ')}</td>
                    <td>
                      {m.image
                        ? `ratios ${m.image.aspectRatios.length} · réf ≤ ${m.image.inputReferences?.max ?? 0}`
                        : m.video
                          ? `durées ${m.video.durations.join(',') || '—'} · ${m.video.resolutions.join('/')}`
                          : m.voices.length
                            ? `${m.voices.length} voix`
                            : '—'}
                    </td>
                    <td
                      className="max-w-[260px] truncate"
                      title={JSON.stringify(m.pricing.skus ?? m.pricing.tokenPrices ?? m.pricing.image ?? {})}
                    >
                      {JSON.stringify(
                        m.pricing.skus ??
                          m.pricing.tokenPrices ??
                          (m.pricing.imageLoaded ? m.pricing.image : 'chargé à la demande'),
                      )}
                    </td>
                    <td>{m.latencyMs === null ? 'non mesurée' : `${m.latencyMs} ms`}</td>
                    <td>
                      {(m.kind === 'image' || m.kind === 'speech') && bp && (
                        <Button
                          size="sm"
                          disabled={Boolean(r.busy)}
                          onClick={() =>
                            void r
                              .run('Test…', () => testModel(bp.project.id, m.id))
                              .then((x) => x && setTestMsg(x))
                          }
                        >
                          Tester (1 appel)
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ChampTable tables={tables} />
      <Card title={`Job Queue (${js.total})`} testId="job-queue">
        <div className="mb-1 text-[12px] text-faint">
          {js.queued} en file · {js.running} en cours · {js.completed} terminés · {js.failed} échecs ·{' '}
          {js.cancelled} annulés. La file survit à la fermeture du navigateur ; à la réouverture les jobs
          vidéo en cours sont réinterrogés, jamais soumis à nouveau.
        </div>
        {S.jobs.length === 0 ? (
          <NoData />
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-faint">
                  <th>ID</th>
                  <th>Modèle</th>
                  <th>Tâche</th>
                  <th>Scène</th>
                  <th>Statut</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Coût</th>
                  <th>Erreur</th>
                  <th>Relances</th>
                </tr>
              </thead>
              <tbody>
                {S.jobs
                  .slice()
                  .reverse()
                  .slice(0, 100)
                  .map((j) => (
                    <tr key={j.id} className="border-t border-line">
                      <td>{j.id.slice(-6)}</td>
                      <td>{j.model}</td>
                      <td>{j.task}</td>
                      <td>{j.sceneId ?? ''}</td>
                      <td>
                        <Badge
                          tone={
                            j.status === 'COMPLETED'
                              ? 'ok'
                              : j.status === 'FAILED'
                                ? 'err'
                                : j.status === 'RUNNING'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {j.status}
                        </Badge>
                      </td>
                      <td>{j.startedAt ? new Date(j.startedAt).toISOString().slice(11, 19) : ''}</td>
                      <td>{j.endedAt ? new Date(j.endedAt).toISOString().slice(11, 19) : ''}</td>
                      <td>{usd(j.cost)}</td>
                      <td title={j.error}>{j.errorClass ?? ''}</td>
                      <td>{j.retries}</td>
                      <td>
                        {j.status === 'RUNNING' && j.kind === 'video' && (
                          <Button size="sm" onClick={() => cancelVideo(j.id)}>
                            CANCEL
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
