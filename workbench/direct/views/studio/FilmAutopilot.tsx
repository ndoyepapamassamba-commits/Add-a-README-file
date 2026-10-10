// FILM AUTOPILOT — the single view: one idea, one « Créer » button, the whole pipeline live
// (IDÉE → HISTOIRE → SCÈNES → IMAGES → ANIMATION → MONTAGE FINAL), a model plan the user can override, and per scene only:
// Accepter · Modifier · Régénérer · Modèle · Valider. The Afrikatoon art direction is locked for every call.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { Badge, Button, Select, Spinner, Toggle } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import { createProductionFromWizard } from '../../lib/studio/film';
import { generateSceneImage, regenerateScene } from '../../lib/studio/actions';
import { buildPlans, runFilm, type FilmResult, type StageState } from '../../lib/studio/filmAutopilot';
import { LOCAL_ANIMATION, PIPELINE, PIPE_LABEL, totalUsd, type DirStage, type PipeStage, type StagePlan } from '../../../server/jev/studio/director';
import { STYLE_PRESETS, dimensionOf, type Dimension } from '../../../server/jev/studio/style';
import { spent } from '../../../server/jev/studio/blueprint';
import { ConfirmHost, Thumb, useActive, useBlobUrl, usd } from './common';
import type { Scene } from '../../../server/jev/studio/types';

interface FilmUi {
  stages: Partial<Record<PipeStage, { st: StageState; note?: string }>>;
  running: boolean;
  error: string | null;
  result: FilmResult | null;
  plans: StagePlan[];
  chosen: Partial<Record<DirStage, string>>;
  confirmEach: boolean;
  waiting: PipeStage | null;
}
const useFilm = create<FilmUi>(() => ({ stages: {}, running: false, error: null, result: null, plans: [], chosen: {}, confirmEach: false, waiting: null }));
let release: (() => void) | null = null;
const ctl = { stop: false };

async function start(projectId: string, from: PipeStage = 'STORY') {
  const f = useFilm.getState();
  if (f.running) return;
  ctl.stop = false;
  useFilm.setState({ running: true, error: null, ...(from === 'STORY' ? { result: null, stages: { IDEA: { st: 'done' } } } : {}) });
  try {
    const r = await runFilm(
      projectId,
      {
        get stop() {
          return ctl.stop;
        },
        chosen: useFilm.getState().chosen,
        confirmEach: useFilm.getState().confirmEach,
        onStage: (s, st, note) => {
          useFilm.setState((x) => ({ stages: { ...x.stages, [s]: { st, note } }, waiting: st === 'waiting' ? s : x.waiting === s ? null : x.waiting }));
          // The model plan is refined as soon as the real number of scenes is known.
          if (s === 'STORY' && st !== 'running') void buildPlans(projectId).then((plans) => useFilm.setState({ plans })).catch(() => undefined);
        },
        validate: () => new Promise<void>((ok) => (release = ok)),
      },
      from,
    );
    if (r) useFilm.setState({ result: r });
  } catch (e) {
    useFilm.setState({ error: (e as Error).message });
  } finally {
    useFilm.setState({ running: false, waiting: null });
  }
}

const TONE: Record<StageState, 'neutral' | 'info' | 'ok' | 'warn' | 'err' | 'accent'> = {
  idle: 'neutral',
  running: 'info',
  done: 'ok',
  warning: 'warn',
  waiting: 'accent',
  failed: 'err',
};
const ICON: Record<StageState, string> = { idle: '○', running: '◐', done: '✓', warning: '!', waiting: '⏸', failed: '✕' };

function IdeaForm({ onCreate }: { onCreate: (idea: string, dim: Dimension, seconds: number, aspect: string) => void }) {
  const [idea, setIdea] = useState('');
  const [dim, setDim] = useState<Dimension>('3D');
  const [sec, setSec] = useState(60);
  const [aspect, setAspect] = useState('9:16');
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-6" data-testid="film-idea">
      <div className="text-center">
        <div className="text-[22px] font-semibold">Une idée. Un film.</div>
        <div className="text-[13px] text-muted">L’Autopilot écrit, met en scène, génère, anime et monte — en style Afrikatoon.</div>
      </div>
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={4}
        data-testid="film-idea-input"
        placeholder="Un jeune garçon africain rêve de devenir inventeur et construit une machine capable de sauver son village."
        className="w-full rounded-xl border border-line bg-input p-3 text-[14px]"
      />
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-muted">Style</span>
        {(['3D', '2D'] as Dimension[]).map((d) => (
          <button key={d} onClick={() => setDim(d)} className={`rounded-full border px-3 py-1 ${dim === d ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
            Afrikatoon {d}
          </button>
        ))}
        <span className="ml-3 text-muted">Durée</span>
        <Select value={String(sec)} onChange={(v) => setSec(Number(v))} options={[30, 60, 90, 180, 300].map((s) => ({ value: String(s), label: s < 60 ? `${s} s` : `${s / 60} min` }))} />
        <span className="ml-3 text-muted">Format</span>
        <Select value={aspect} onChange={setAspect} options={[{ value: '9:16', label: 'Vertical 9:16' }, { value: '16:9', label: 'Paysage 16:9' }, { value: '1:1', label: 'Carré 1:1' }]} />
        <label className="ml-auto flex items-center gap-2">
          <Toggle checked={useFilm((s) => s.confirmEach)} onChange={(v) => useFilm.setState({ confirmEach: v })} />
          Valider chaque étape
        </label>
      </div>
      <div className="text-center">
        <Button variant="primary" className="px-8 py-2 text-[15px]" disabled={idea.trim().length < 8} onClick={() => onCreate(idea.trim(), dim, sec, aspect)} data-testid="film-create">
          🎬 Créer
        </Button>
      </div>
    </div>
  );
}

function Pipeline({ projectId }: { projectId: string }) {
  const { stages, waiting, running } = useFilm();
  return (
    <div className="flex flex-wrap items-stretch gap-1" data-testid="film-pipeline">
      {PIPELINE.map((s, i) => {
        const x = stages[s] ?? { st: 'idle' as StageState };
        return (
          <div key={s} className="flex items-center gap-1">
            <div className={`min-w-[120px] rounded-xl border px-3 py-2 ${x.st === 'running' ? 'border-accent' : 'border-line'}`} data-testid={`pipe-${s}`} data-state={x.st}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                {x.st === 'running' ? <Spinner className="h-3 w-3" /> : <span>{ICON[x.st]}</span>}
                {PIPE_LABEL[s]}
              </div>
              <div className="mt-0.5 max-w-[180px] truncate text-[11px] text-muted" title={x.note}>
                <Badge tone={TONE[x.st]}>{x.st}</Badge> {x.note ?? ''}
              </div>
              {waiting === s && (
                <Button size="sm" variant="primary" className="mt-1" data-testid={`validate-${s}`} onClick={() => release?.()}>
                  Valider → suite
                </Button>
              )}
              {!running && (x.st === 'done' || x.st === 'warning' || x.st === 'failed') && s !== 'IDEA' && (
                <button className="mt-1 text-[11px] text-accent" onClick={() => void start(projectId, s === 'SCENES' ? 'SCENES' : s)}>
                  relancer d’ici
                </button>
              )}
            </div>
            {i < PIPELINE.length - 1 && <span className="text-faint">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function ModelPlan({ capUsd, onCap }: { capUsd: number; onCap: (n: number) => void }) {
  const { plans, chosen, running } = useFilm();
  const vs = useStudio((s) => s.settings);
  if (!plans.length) return <div className="text-[12px] text-muted">Analyse des modèles disponibles…</div>;
  const total = totalUsd(plans, chosen);
  const anim = chosen.animation ?? plans.find((p) => p.stage === 'animation')?.recommended;
  const paidVideo = anim && anim !== LOCAL_ANIMATION;
  return (
    <div className="rounded-xl border border-line p-3" data-testid="film-plan">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
        Orchestrateur de modèles
        <span className="text-[11.5px] font-normal text-muted">recommandation = meilleur équilibre qualité / coût / temps / fidélité Afrikatoon · scores « a priori » tant qu’ils ne sont pas mesurés sur vos films</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-faint">
            <th className="py-1">Étape</th>
            <th>Modèle</th>
            <th>Coût estimé</th>
            <th>Qualité</th>
            <th>Afrikatoon</th>
            <th>Temps</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const id = chosen[p.stage] ?? p.recommended ?? '';
            const o = p.options.find((x) => x.id === id);
            return (
              <tr key={p.stage} className="border-t border-line" data-testid={`plan-${p.stage}`}>
                <td className="py-1 font-medium">{p.label}</td>
                <td>
                  {p.options.length ? (
                    <Select
                      value={id}
                      onChange={(v) => useFilm.setState((x) => ({ chosen: { ...x.chosen, [p.stage]: v } }))}
                      options={p.options.map((x) => ({ value: x.id, label: `${x.id === p.recommended ? '★ ' : ''}${x.name.slice(0, 48)}` }))}
                    />
                  ) : (
                    <span className="text-faint">aucun modèle disponible</span>
                  )}
                </td>
                <td>{o ? `${o.costLabel}${o.stageUsd !== null && o.stageUsd > 0 ? ` (~${usd(o.stageUsd, 3)})` : ''}` : '—'}</td>
                <td>{o ? `${o.quality.toFixed(1)}/10 ${o.qualitySource === 'mesurée' ? '(mesurée)' : ''}` : '—'}</td>
                <td>{o ? `${o.afrikatoon.toFixed(1)}/10` : '—'}</td>
                <td>{o?.speed ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
        <span>
          Coût estimé du film : <b>{usd(total, 3)}</b>
        </span>
        <label className="flex items-center gap-1">
          Budget max du film ($)
          <input type="number" min={0.1} step={0.5} value={capUsd} disabled={running} onChange={(e) => onCap(Math.max(0.1, Number(e.target.value) || 1))} className="w-20 rounded border border-line bg-input px-1" />
        </label>
        {paidVideo && !(vs.videoEnabled && vs.videoBudget > 0) && (
          <label className="flex items-center gap-1 text-warn" data-testid="video-budget">
            Animation vidéo payante : budget vidéo ($)
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={0}
              onBlur={(e) => {
                const b = Number(e.target.value) || 0;
                useStudio.getState().setSettings({ videoEnabled: b > 0, videoBudget: b });
              }}
              className="w-20 rounded border border-line bg-input px-1"
            />
            <span className="text-faint">(0 = animation 2.5D gratuite)</span>
          </label>
        )}
      </div>
    </div>
  );
}

function SceneCard({ projectId, sc, imageModels }: { projectId: string; sc: Scene; imageModels: { id: string; name: string }[] }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [model, setModel] = useState('');
  const [action, setAction] = useState(sc.action);
  const [lines, setLines] = useState(sc.dialogue.map((l) => `${l.speaker}: ${l.text}`).join('\n'));
  const video = useBlobUrl(sc.videoAssetId);
  const chosen = useFilm((s) => s.chosen.images);
  const patchScene = (p: Partial<Scene>) =>
    useStudio.getState().patchProject(projectId, (b) => ({ ...b, scenes: b.scenes.map((x) => (x.scene_id === sc.scene_id ? { ...x, ...p } : x)) }), `scène ${sc.scene_id} modifiée`);
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message.slice(0, 160));
    } finally {
      setBusy(null);
    }
  };
  const regen = () => act('image…', () => generateSceneImage(projectId, sc.scene_id, { regenerate: true, forceModel: model || chosen }));
  return (
    <div className="rounded-xl border border-line p-2" data-testid={`scene-${sc.scene_id}`}>
      <div className="flex gap-2">
        {video ? <video src={video} muted loop autoPlay playsInline className="h-36 w-24 rounded-md object-cover" /> : <Thumb id={sc.imageAssetId} className="h-36 w-24" />}
        <div className="min-w-0 flex-1 text-[12px]">
          <div className="flex items-center gap-1.5">
            <b>{sc.scene_id}</b>
            <Badge tone={sc.status === 'APPROVED' ? 'ok' : sc.status === 'FAILED' ? 'err' : sc.imageAssetId ? 'info' : 'neutral'}>{sc.status === 'APPROVED' ? 'validée' : sc.imageAssetId ? 'proposée' : 'à générer'}</Badge>
            <span className="text-faint">{sc.emotion}</span>
          </div>
          {edit ? (
            <div className="mt-1 space-y-1">
              <textarea value={action} onChange={(e) => setAction(e.target.value)} rows={2} className="w-full rounded border border-line bg-input p-1" />
              <textarea value={lines} onChange={(e) => setLines(e.target.value)} rows={3} className="w-full rounded border border-line bg-input p-1 font-mono text-[11.5px]" />
            </div>
          ) : (
            <>
              <div className="mt-0.5 line-clamp-3 text-muted">{sc.action}</div>
              {sc.dialogue.slice(0, 3).map((l, i) => (
                <div key={i} className="truncate">
                  <b>{l.speaker}</b> : {l.text}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Button size="sm" disabled={Boolean(busy)} onClick={() => patchScene({ status: 'APPROVED' })} data-testid="scene-accept">
          ✅ Accepter
        </Button>
        {edit ? (
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(busy)}
            onClick={() =>
              act('modification…', async () => {
                const dialogue = lines
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l, i) => {
                    const m = /^([^:]{1,40}):\s*(.+)$/.exec(l);
                    const prev = sc.dialogue[i];
                    return { ...(prev ?? { language: 'fr', pace: 1 }), speaker: m ? m[1]!.trim() : (prev?.speaker ?? 'NARRATEUR'), text: m ? m[2]! : l } as Scene['dialogue'][number];
                  });
                patchScene({ action, dialogue, status: 'READY' });
                // The edited scene loses its old voices; the next montage regenerates them.
                useStudio.getState().patchProject(projectId, (b) => ({ ...b, audio: { ...b.audio, voices: Object.fromEntries(Object.entries(b.audio.voices ?? {}).filter(([k]) => !k.startsWith(`${sc.scene_id}:`))) } }));
                setEdit(false);
                await generateSceneImage(projectId, sc.scene_id, { regenerate: true, forceModel: model || chosen });
              })
            }
          >
            Enregistrer et régénérer
          </Button>
        ) : (
          <Button size="sm" disabled={Boolean(busy)} onClick={() => setEdit(true)} data-testid="scene-edit">
            ✏️ Modifier
          </Button>
        )}
        <Button size="sm" disabled={Boolean(busy)} onClick={() => void regen()} data-testid="scene-regen">
          🔄 Régénérer
        </Button>
        <Select value={model} onChange={setModel} options={[{ value: '', label: 'Modèle : plan' }, ...imageModels.map((m) => ({ value: m.id, label: m.name.slice(0, 32) }))]} />
        <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => patchScene({ status: 'APPROVED' })} data-testid="scene-validate">
          Valider
        </Button>
        {edit && (
          <button className="text-[11px] text-accent" disabled={Boolean(busy)} onClick={() => void act('réécriture…', () => regenerateScene(projectId, sc.scene_id, action))}>
            réécrire avec l’IA
          </button>
        )}
        {busy && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Spinner className="h-3 w-3" /> {busy}
          </span>
        )}
      </div>
      {err && <div className="mt-1 text-[11px] text-err">{err}</div>}
    </div>
  );
}

export function FilmAutopilot({ onExpert }: { onExpert: () => void }) {
  const bp = useActive();
  const { running, result, error, plans } = useFilm();
  const [fresh, setFresh] = useState(!bp);
  useEffect(() => {
    if (bp && !plans.length) void buildPlans(bp.project.id).then((p) => useFilm.setState({ plans: p })).catch(() => undefined);
  }, [bp?.project.id]);
  const imageModels = useMemo(() => plans.find((p) => p.stage === 'images')?.options.map((o) => ({ id: o.id, name: o.name })) ?? [], [plans]);
  const create = async (idea: string, dim: Dimension, seconds: number, aspect: string) => {
    const p = createProductionFromWizard({ idea, dimension: dim, duration: seconds, aspect, language: 'fr', platform: aspect === '9:16' ? 'tiktok' : 'youtube' });
    useStudio.getState().setSettings({ activeProjectId: p.project.id });
    setFresh(false);
    useFilm.setState({ plans: [], chosen: {}, stages: {}, result: null });
    const plansNow = await buildPlans(p.project.id).catch(() => [] as StagePlan[]);
    // The recommendation is applied by default: the Autopilot does not wait for the user to choose.
    useFilm.setState({ plans: plansNow, chosen: Object.fromEntries(plansNow.map((x) => [x.stage, x.recommended ?? undefined])) });
    void start(p.project.id);
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="film-autopilot">
      <ConfirmHost />
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <div className="font-semibold">🎬 Film Autopilot</div>
        <Badge tone="accent">Afrikatoon {bp ? dimensionOf(bp.styleDNA) : ''} · direction artistique verrouillée</Badge>
        {bp && (
          <span className="text-[12px] text-muted" data-testid="film-spent">
            dépensé {usd(spent(bp), 3)} / {bp.cap.toFixed(2)} $
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {bp && !fresh && (
            <Button size="sm" disabled={running} onClick={() => setFresh(true)}>
              Nouvelle idée
            </Button>
          )}
          {running && (
            <Button size="sm" onClick={() => (ctl.stop = true)}>
              Arrêter
            </Button>
          )}
          <button className="text-[11.5px] text-faint hover:text-fg" onClick={onExpert} data-testid="film-expert">
            mode expert
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {fresh || !bp ? (
          <IdeaForm onCreate={(...a) => void create(...a)} />
        ) : (
          <>
            <div className="rounded-xl border border-line p-3">
              <div className="text-[11px] uppercase text-faint">Idée</div>
              <div className="text-[13.5px]">{bp.project.idea}</div>
              {bp.story && (
                <div className="mt-1 text-[12.5px]">
                  <b>{bp.title}</b> — <span className="text-muted">{bp.story.logline}</span>
                </div>
              )}
              <div className="mt-1 text-[11px] text-faint">Style verrouillé : {STYLE_PRESETS[dimensionOf(bp.styleDNA)].name}</div>
            </div>
            <Pipeline projectId={bp.project.id} />
            {error && <div className="rounded-lg border border-err p-2 text-[12px] text-err">{error}</div>}
            <ModelPlan capUsd={bp.cap} onCap={(n) => useStudio.getState().patchProject(bp.project.id, (b) => ({ ...b, cap: n }), 'budget du film')} />
            {!running && !useFilm.getState().stages.STORY && (
              <Button variant="primary" onClick={() => void start(bp.project.id)} data-testid="film-start">
                ▶ Lancer l’Autopilot
              </Button>
            )}
            {bp.scenes.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="film-scenes">
                {bp.scenes.map((sc) => (
                  <SceneCard key={sc.scene_id} projectId={bp.project.id} sc={sc} imageModels={imageModels} />
                ))}
              </div>
            )}
            {result && (
              <div className="rounded-xl border border-ok p-3" data-testid="film-final">
                <div className="mb-1 text-[13px] font-semibold">Film final — {Math.round(result.seconds)} s</div>
                <video src={result.url} controls className="max-h-[70vh] rounded-lg" />
                <div className="mt-2 flex gap-2">
                  <a className="rounded-lg border border-line px-3 py-1 text-[12.5px]" href={result.url} download={`${bp.title || 'film'}.${result.mime.includes('mp4') ? 'mp4' : 'webm'}`}>
                    Télécharger
                  </a>
                  <Button size="sm" disabled={running} onClick={() => void start(bp.project.id, 'MONTAGE')}>
                    Remonter le film (après modifications)
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
