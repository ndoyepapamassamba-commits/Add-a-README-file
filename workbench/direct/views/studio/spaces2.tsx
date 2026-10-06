// Spaces 6–10: Scene Director, Image Factory, Video Factory, Dialogue, Voice.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Toggle } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import { useStore } from '../../lib/store';
import {
  generateOne,
  generateSceneImage,
  imageCandidates,
  generateLine,
  lineKey,
  loadRegistry,
  buildConsistency,
} from '../../lib/studio/actions';
import {
  cancelVideo,
  generateSceneVideo,
  makeCharacterTalk,
  videoEnabled,
  videoSpent,
  resumeVideoJobs,
  exportVideo,
  sendVideoToStoryboard,
  videoDiagnostics,
  type TalkResult,
  type VideoDiag,
} from '../../lib/studio/actions2';
import {
  TALK_LABEL,
  completedVideos,
  elapsed,
  ratioOf,
  videoState,
  type VideoState,
} from '../../../server/jev/studio/video';
import { compose } from '../../../server/jev/studio/genome';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import { canAutoRetry } from '../../../server/jev/studio/jobs';
import type { DialogueLine, Scene, VoiceProfile } from '../../../server/jev/studio/types';
import { Trace } from '../../lib/studio/jevlog';
import {
  BusyBar,
  Card,
  ErrorBox,
  Label,
  NoData,
  Thumb,
  useActive,
  useBlobUrl,
  useNow,
  useRunner,
  usd,
  VideoBox,
  VideoReady,
  type PlaybackState,
  type VideoMeta,
} from './common';
import type { Job } from '../../../server/jev/studio/types';
import { hasKey } from '../../lib/studio/net';

// ───────── 6. Scene Director ─────────
const SHOTS = [
  'plan large',
  'plan moyen',
  'plan rapproché',
  'gros plan',
  'insert',
  'plongée',
  'contre-plongée',
  'plan épaule',
];
const LENSES = ['24 mm', '35 mm', '50 mm', '85 mm'];
export function SceneDirector() {
  const bp = useActive();
  const S = useStudio();
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const move = (from: string, to: string) =>
    S.patchProject(
      id,
      (b) => {
        const a = [...b.scenes];
        const i = a.findIndex((s) => s.scene_id === from);
        const j = a.findIndex((s) => s.scene_id === to);
        if (i < 0 || j < 0) return b;
        const [x] = a.splice(i, 1);
        a.splice(j, 0, x!);
        return { ...b, scenes: a };
      },
      'scènes réordonnées',
    );
  const upd = (sid: string, p: Partial<Scene>) =>
    S.patchProject(id, (b) => ({
      ...b,
      scenes: b.scenes.map((s) => (s.scene_id === sid ? { ...s, ...p } : s)),
    }));
  const cur = bp.scenes.find((s) => s.scene_id === sel);
  return (
    <div className="space-y-3" data-testid="studio-scenes">
      <Card
        title={`Storyboard (${bp.scenes.length} scène${bp.scenes.length > 1 ? 's' : ''})`}
        right={
          <Button
            size="sm"
            onClick={() =>
              S.patchProject(id, (b) => ({ ...b, scenes: [...b.scenes, newScene(b.scenes.length + 1)] }))
            }
          >
            + Scène
          </Button>
        }
      >
        {bp.scenes.length === 0 ? (
          <NoData>Aucune scène : écrivez l’histoire ou ajoutez une scène.</NoData>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="storyboard">
            {bp.scenes.map((s, i) => (
              <li
                key={s.scene_id}
                draggable
                onDragStart={() => setDrag(s.scene_id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drag && drag !== s.scene_id && move(drag, s.scene_id)}
                className={`flex gap-2 rounded-xl border p-2 text-[12px] ${sel === s.scene_id ? 'border-accent' : 'border-line'}`}
                data-testid={`card-${s.scene_id}`}
              >
                <div className="shrink-0">
                  <button onClick={() => setSel(s.scene_id)}>
                    <Thumb id={s.imageAssetId} className="h-28 w-20" />
                  </button>
                  {s.videoAssetId && <VideoReady assetId={s.videoAssetId} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <b>
                      {s.scene_id} · {s.beat}
                    </b>
                    <Badge
                      tone={
                        s.status === 'GENERATED' || s.status === 'APPROVED'
                          ? 'ok'
                          : s.status === 'FAILED'
                            ? 'err'
                            : 'neutral'
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <div className="truncate text-muted" title={s.action}>
                    {s.action}
                  </div>
                  <div className="truncate">👥 {s.characters.join(', ') || '—'}</div>
                  <div className="truncate italic" title={s.dialogue.map((d) => d.text).join(' / ')}>
                    💬 {s.dialogue[0]?.text ?? '—'}
                  </div>
                  <div className="truncate text-faint">
                    🎥 {s.camera} · 🔊 {s.sound || '—'} · {s.duration}s
                  </div>
                  <div className="truncate text-faint">
                    modèle {s.model ?? '—'} · qualité {s.quality ?? 'non mesurée'}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === 0}
                      aria-label="Monter"
                      onClick={() => move(s.scene_id, bp.scenes[i - 1]!.scene_id)}
                    >
                      <ArrowUp size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === bp.scenes.length - 1}
                      aria-label="Descendre"
                      onClick={() => move(s.scene_id, bp.scenes[i + 1]!.scene_id)}
                    >
                      <ArrowDown size={12} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        S.patchProject(id, (b) => ({
                          ...b,
                          scenes: b.scenes.filter((x) => x.scene_id !== s.scene_id),
                        }))
                      }
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {cur && (
        <Card title={`Composer ${cur.scene_id}`} testId="scene-composer">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div>
              <Label>Type de plan</Label>
              <Select
                value={cur.camera}
                onChange={(v) => upd(cur.scene_id, { camera: v })}
                options={[...new Set([cur.camera, ...SHOTS])].map((x) => ({ value: x, label: x }))}
              />
            </div>
            <div>
              <Label>Objectif</Label>
              <Select
                value={LENSES.find((l) => cur.transition.includes(l)) ?? ''}
                onChange={(v) =>
                  upd(cur.scene_id, {
                    lighting: cur.lighting,
                    video_prompt: `${cur.video_prompt} ${v}`.trim(),
                  })
                }
                options={[{ value: '', label: '—' }, ...LENSES.map((x) => ({ value: x, label: x }))]}
              />
            </div>
            <div>
              <Label>Durée (s)</Label>
              <Input
                type="number"
                min={2}
                max={30}
                value={cur.duration}
                onChange={(e) => upd(cur.scene_id, { duration: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Transition</Label>
              <Input
                value={cur.transition}
                onChange={(e) => upd(cur.scene_id, { transition: e.target.value })}
              />
            </div>
            <div>
              <Label>Lieu</Label>
              <Input value={cur.location} onChange={(e) => upd(cur.scene_id, { location: e.target.value })} />
            </div>
            <div>
              <Label>Moment</Label>
              <Input value={cur.time} onChange={(e) => upd(cur.scene_id, { time: e.target.value })} />
            </div>
            <div>
              <Label>Lumière</Label>
              <Input value={cur.lighting} onChange={(e) => upd(cur.scene_id, { lighting: e.target.value })} />
            </div>
            <div>
              <Label>Émotion</Label>
              <Input value={cur.emotion} onChange={(e) => upd(cur.scene_id, { emotion: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Personnages (séparés par des virgules)</Label>
              <Input
                value={cur.characters.join(', ')}
                onChange={(e) =>
                  upd(cur.scene_id, {
                    characters: e.target.value
                      .split(',')
                      .map((x) => x.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Bruitages / ambiance</Label>
              <Input value={cur.sound} onChange={(e) => upd(cur.scene_id, { sound: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-4">
              <Label>Action (mouvements des personnages, du visage, de l’environnement)</Label>
              <Textarea
                rows={2}
                value={cur.action}
                onChange={(e) => upd(cur.scene_id, { action: e.target.value })}
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
const newScene = (n: number): Scene => ({
  scene_id: `S${String(n).padStart(2, '0')}`,
  act: '1',
  beat: 'escalade',
  duration: 6,
  location: '',
  time: 'jour',
  characters: [],
  action: '',
  dialogue: [],
  emotion: 'neutral',
  camera: 'plan moyen',
  lighting: '',
  sound: '',
  music: '',
  transition: 'cut',
  visual_prompt: '',
  video_prompt: '',
  voice_prompt: '',
  subtitle_prompt: '',
  status: 'DRAFT',
});

// ───────── 7. Image Factory ─────────
export function ImageFactory() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const [scene, setScene] = useState('');
  const [free, setFree] = useState('');
  const [variants, setVariants] = useState('1');
  const [model, setModel] = useState('');
  const [cands, setCands] = useState<{ id: string; est: string }[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  useEffect(() => {
    if (!bp) return;
    void imageCandidates({ aspect: bp.aspect, references: refs.length })
      .then((c) =>
        setCands(
          c.map((x) => ({
            id: x.model.id,
            est:
              x.estimate.usd === null
                ? 'prix incertain'
                : `${x.estimate.usd.toFixed(4)} $${x.estimate.certain ? '' : ' (≈)'}`,
          })),
        ),
      )
      .catch(() => setCands([]));
  }, [bp, refs.length, S.registry?.at]);
  const assets = useMemo(
    () =>
      Object.values(S.assets)
        .filter(
          (a) =>
            a.projectId === bp?.project.id &&
            (a.kind === 'image' || a.kind === 'scene' || a.kind === 'character'),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [S.assets, bp?.project.id],
  );
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const go = async () => {
    const n = Number(variants);
    if (scene)
      await r.run('Génération…', () =>
        generateSceneImage(id, scene, { variants: n, forceModel: model || undefined }),
      );
    else if (free.trim()) {
      const c = compose(
        'image',
        { STYLE: bp.styleDNA.renderStyle, SUBJECT: free, NEGATIVE: bp.styleDNA.negative, ASPECT: bp.aspect },
        { maxChars: 2000 },
      );
      await r.run('Génération…', async () => {
        for (let i = 0; i < n; i++)
          await generateOne({
            projectId: id,
            compiled: c,
            references: refs,
            task: refs.length ? 'REFERENCE-IMAGE' : 'TEXT-TO-IMAGE',
            mission: 'image libre',
            aspect: bp.aspect,
            forceModel: model || undefined,
            trace: new Trace(),
            tags: ['free'],
          });
      });
    }
  };
  return (
    <div className="space-y-3" data-testid="studio-images">
      <Card title="Image Factory — texte→image, référence→image, variantes, scène">
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <Label>Scène</Label>
            <Select
              value={scene}
              onChange={setScene}
              options={[
                { value: '', label: '— prompt libre —' },
                ...bp.scenes.map((s) => ({
                  value: s.scene_id,
                  label: `${s.scene_id} · ${s.action.slice(0, 30)}`,
                })),
              ]}
            />
          </div>
          <div>
            <Label>Variantes</Label>
            <Select
              value={variants}
              onChange={setVariants}
              options={['1', '4', '8', '16'].map((x) => ({ value: x, label: x }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Modèle (Auto = Cost Governor, mode {bp.mode})</Label>
            <Select
              value={model}
              onChange={setModel}
              options={[
                { value: '', label: 'Auto (JEV)' },
                ...cands.map((c) => ({ value: c.id, label: `${c.id} — ${c.est}` })),
              ]}
            />
          </div>
        </div>
        {!scene && (
          <>
            <Label>Prompt</Label>
            <Textarea
              rows={2}
              value={free}
              onChange={(e) => setFree(e.target.value)}
              data-testid="image-prompt"
              placeholder="décrivez l’image (le Style DNA 2D est ajouté automatiquement)"
            />
          </>
        )}
        <div className="mt-1 text-[12px] text-faint">
          Références : {refs.length ? `${refs.length} sélectionnée(s)` : 'aucune'} (cochez des images
          ci-dessous). {cands.length} modèle(s) compatible(s) découvert(s).
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={Boolean(r.busy) || (!scene && !free.trim())}
            onClick={() => void go()}
            data-testid="image-generate"
          >
            Générer
          </Button>
          {!hasKey() && <Badge tone="warn">clé OpenRouter absente</Badge>}
          <Badge tone="neutral">Agrandissement : aucun modèle d’upscale découvert pour les images</Badge>
        </div>
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
      </Card>
      <Card title={`Résultats (${assets.length})`}>
        {assets.length === 0 ? (
          <NoData />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="image-results">
            {assets.map((a) => {
              const job = S.jobs.find((j) => j.assetId === a.id);
              return (
                <li key={a.id} className="rounded-lg border border-line p-2 text-[11.5px]">
                  <label className="mb-1 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={refs.includes(a.id)}
                      onChange={(e) =>
                        setRefs((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))
                      }
                    />{' '}
                    référence
                  </label>
                  <Thumb id={a.id} className="h-40 w-full" />
                  <div className="mt-1 truncate" title={a.model}>
                    {a.model ?? a.source}
                  </div>
                  <div className="text-faint">
                    coût {a.cost === null ? 'non mesuré' : usd(a.cost)} · latence{' '}
                    {job?.endedAt && job.startedAt
                      ? `${((job.endedAt - job.startedAt) / 1000).toFixed(1)} s`
                      : '—'}{' '}
                    · qualité {a.quality ?? 'non mesurée'}
                  </div>
                  <div className="truncate text-faint" title={a.prompt}>
                    {a.prompt?.slice(0, 80)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {scene && (
                      <Button
                        size="sm"
                        onClick={() =>
                          S.patchProject(
                            id,
                            (b) => ({
                              ...b,
                              scenes: b.scenes.map((s) =>
                                s.scene_id === scene ? { ...s, imageAssetId: a.id, status: 'APPROVED' } : s,
                              ),
                            }),
                            'image choisie',
                          )
                        }
                      >
                        USE
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setRefs([a.id]);
                        setFree(a.prompt ?? '');
                        setScene('');
                      }}
                    >
                      EDIT
                    </Button>
                    <Button
                      size="sm"
                      disabled={Boolean(r.busy)}
                      onClick={() => {
                        setFree(a.prompt ?? '');
                        setScene('');
                      }}
                    >
                      REGENERATE
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        S.patchProject(
                          id,
                          (b) => ({ ...b, styleDNA: { ...b.styleDNA, referenceAssetId: a.id } }),
                          'référence de style',
                        )
                      }
                    >
                      SAVE STYLE
                    </Button>
                    <Button
                      size="sm"
                      disabled={!bp.characters.length}
                      onClick={() =>
                        bp.characters[0] &&
                        S.patchProject(id, (b) => ({
                          ...b,
                          characters: b.characters.map((c, i) =>
                            i === 0
                              ? { ...c, poses: { ...c.poses, [`ia-${Object.keys(c.poses).length}`]: a.id } }
                              : c,
                          ),
                        }))
                      }
                    >
                      SAVE CHARACTER
                    </Button>
                    <Button
                      size="sm"
                      disabled={!scene}
                      onClick={() =>
                        scene &&
                        S.patchProject(id, (b) => ({
                          ...b,
                          scenes: b.scenes.map((s) =>
                            s.scene_id === scene ? { ...s, imageAssetId: a.id } : s,
                          ),
                        }))
                      }
                    >
                      SEND TO STORYBOARD
                    </Button>
                    {S.settings.videoEnabled && (
                      <Button
                        size="sm"
                        disabled={!scene}
                        onClick={() =>
                          void r.run('Vidéo…', () =>
                            generateSceneVideo(id, scene, { mode: 'image', duration: 5 }),
                          )
                        }
                      >
                        SEND TO VIDEO
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────── 8. Video Factory ─────────
export function VideoFactory() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const [budget, setBudget] = useState(String(S.settings.videoBudget || ''));
  const [scene, setScene] = useState('');
  const [mode, setMode] = useState<'text' | 'image'>('image');
  const [dur, setDur] = useState('5');
  const [audio, setAudio] = useState(false);
  const [talk, setTalk] = useState<TalkResult | null>(null);
  const [playback, setPlayback] = useState<Record<string, PlaybackState>>({});
  const [diagJob, setDiagJob] = useState('');
  useEffect(() => {
    void loadRegistry().catch(() => undefined);
  }, []);
  const reg = S.registry;
  const vids = reg ? modelsWith(reg, 'video', 'VIDEO_GENERATION') : [];
  const grok = vids.find((m) => /grok/i.test(m.id) || /grok/i.test(m.name));
  const jobs = S.jobs
    .filter((j) => j.kind === 'video')
    .slice()
    .reverse();
  const on = videoEnabled();
  const done = completedVideos(S.jobs, bp?.project.id);
  return (
    <div className="space-y-3" data-testid="studio-video">
      <Card
        title="Video Factory"
        right={<Badge tone={on ? 'ok' : 'neutral'}>{on ? 'ACTIVE' : 'DÉSACTIVÉE (par défaut)'}</Badge>}
      >
        <div className="text-[12.5px] text-muted">
          Le studio est 2D : la vidéo générée est facultative et désactivée par défaut. Elle ne s’active que
          sur votre décision, avec un budget que vous saisissez. Un job déjà payé n’est jamais relancé
          automatiquement.
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <Label>Budget vidéo ($)</Label>
            <Input
              className="w-28"
              type="number"
              min={0}
              step={0.1}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              data-testid="video-budget"
            />
          </div>
          <Toggle
            checked={S.settings.videoEnabled}
            onChange={(v) => {
              if (v && !(Number(budget) > 0)) {
                r.run('', async () => {
                  throw new Error('Saisissez d’abord un budget vidéo supérieur à 0.');
                });
                return;
              }
              S.setSettings({ videoEnabled: v, videoBudget: Number(budget) || 0 });
            }}
            label="Activer la Video Factory"
          />
          <span className="text-[12px] text-faint">
            Dépensé en vidéo : {usd(videoSpent())} / {S.settings.videoBudget.toFixed(2)} $
          </span>
        </div>
        <ErrorBox error={r.error} />
      </Card>
      <Card title="Modèles vidéo découverts">
        {!reg ? (
          <NoData>Registre non chargé.</NoData>
        ) : vids.length === 0 ? (
          <NoData>Aucun modèle vidéo découvert.</NoData>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="video-models">
              <thead>
                <tr className="text-left text-faint">
                  <th>Modèle</th>
                  <th>Capacités</th>
                  <th>Durées</th>
                  <th>Ratios</th>
                  <th>Audio natif</th>
                </tr>
              </thead>
              <tbody>
                {vids.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td>{m.id}</td>
                    <td>{m.caps.join(' · ')}</td>
                    <td>{m.video!.durations.join(', ') || '—'}</td>
                    <td>{m.video!.aspectRatios.join(', ')}</td>
                    <td>{m.video!.generateAudio ? 'oui' : 'non'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 text-[12px]" data-testid="video-grok">
          Grok Imagine Video :{' '}
          {grok
            ? `découvert (${grok.id}) — audio natif ${grok.video!.generateAudio ? 'annoncé' : 'NON annoncé (generate_audio=false)'}`
            : 'non présent dans le catalogue du jour'}
          . Jamais obligatoire ; comparé aux autres selon les capacités réelles et l’historique.
        </div>
      </Card>
      {on && bp && (
        <Card title="Générer une vidéo de scène">
          <div className="grid gap-2 md:grid-cols-4">
            <div>
              <Label>Scène</Label>
              <Select
                value={scene}
                onChange={setScene}
                options={[
                  { value: '', label: '—' },
                  ...bp.scenes.map((s) => ({ value: s.scene_id, label: s.scene_id })),
                ]}
              />
            </div>
            <div>
              <Label>Mode</Label>
              <Select
                value={mode}
                onChange={(v) => setMode(v as 'text' | 'image')}
                options={[
                  { value: 'image', label: 'image → vidéo (première image)' },
                  { value: 'text', label: 'texte → vidéo' },
                ]}
              />
            </div>
            <div>
              <Label>Durée (s)</Label>
              <Input type="number" value={dur} onChange={(e) => setDur(e.target.value)} />
            </div>
            <div className="pt-4">
              <Toggle checked={audio} onChange={setAudio} label="Audio natif" />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!scene || Boolean(r.busy)}
              onClick={() =>
                void r.run('Soumission vidéo…', () =>
                  generateSceneVideo(bp.project.id, scene, { mode, duration: Number(dur), audio }),
                )
              }
              data-testid="video-generate"
            >
              Générer
            </Button>
            <Button
              disabled={!scene || Boolean(r.busy)}
              onClick={async () => {
                const x = await r.run('Chaîne « Fais parler ce personnage »…', () =>
                  makeCharacterTalk(bp.project.id, scene),
                );
                if (x) setTalk(x);
              }}
              data-testid="video-talk"
            >
              Fais parler ce personnage
            </Button>
            <Button onClick={() => void resumeVideoJobs()}>Reprendre les jobs en cours</Button>
          </div>
          {talk && (
            <div
              className="mt-2 rounded-lg border border-line p-2 text-[12.5px]"
              data-testid="video-talk-result"
            >
              <Label>ROUTE SELECTED</Label>
              <div>
                <b>
                  {talk.route} — {talk.label}
                </b>{' '}
                <Badge tone={talk.aiVideo ? 'ok' : 'warn'}>
                  {talk.aiVideo ? 'vidéo IA générée' : 'aucune vidéo IA générée'}
                </Badge>
              </div>
              <div className="mt-1 text-muted">{talk.reason}</div>
              <div className="mt-1 text-[11.5px] text-faint">
                {(['A', 'B', 'C', 'D'] as const).map((k) => (
                  <span key={k} className="mr-3">
                    {talk.available[k] ? '✓' : '✗'} {k} {TALK_LABEL[k]}
                  </span>
                ))}
              </div>
            </div>
          )}
          <BusyBar busy={r.busy} />
        </Card>
      )}
      {done.length > 0 && (
        <div className="space-y-3" data-testid="video-generated">
          {done.map((j) => (
            <VideoCard
              key={j.id}
              job={j}
              onPlayback={(st) => setPlayback((p) => (p[j.id] === st ? p : { ...p, [j.id]: st }))}
              onRegenerate={() =>
                bp &&
                j.sceneId &&
                void r.run('Régénération vidéo…', () =>
                  generateSceneVideo(bp.project.id, j.sceneId!, {
                    mode: j.task === 'I2V' ? 'image' : 'text',
                    duration: Number(dur),
                    audio,
                  }),
                )
              }
            />
          ))}
        </div>
      )}
      <Card title={`Jobs vidéo (${jobs.length})`}>
        {jobs.length === 0 ? (
          <NoData />
        ) : (
          <ul className="space-y-1.5 text-[12px]" data-testid="video-jobs">
            {jobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                onCancel={() => cancelVideo(j.id)}
                onRetry={() =>
                  bp &&
                  j.sceneId &&
                  void r.run('Nouvelle tentative…', () =>
                    generateSceneVideo(bp.project.id, j.sceneId!, {
                      mode: j.task === 'I2V' ? 'image' : 'text',
                      duration: Number(dur),
                      audio,
                    }),
                  )
                }
              />
            ))}
          </ul>
        )}
      </Card>
      <VideoDiagnostics
        jobs={jobs}
        jobId={diagJob || jobs[0]?.id || ''}
        onPick={setDiagJob}
        playback={playback}
      />
    </div>
  );
}

const STATE_TONE: Record<VideoState, 'ok' | 'err' | 'info' | 'neutral' | 'warn'> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'ok',
  FAILED: 'err',
  CANCELLED: 'neutral',
  EXPIRED: 'warn',
};
/** One row per job: clear rendering of QUEUED / RUNNING / COMPLETED / FAILED / CANCELLED / EXPIRED. */
function JobRow({ job: j, onCancel, onRetry }: { job: Job; onCancel: () => void; onRetry: () => void }) {
  const now = useNow(1000);
  const st = videoState(j, now);
  const cost = `estimé ${j.estimate === null ? 'incertain' : usd(j.estimate)} · réel ${usd(j.cost)}`;
  return (
    <li className="rounded border border-line p-1.5" data-testid={`video-job-${j.status}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATE_TONE[st]}>{st}</Badge>
        {st === 'COMPLETED' && <b className="text-ok">✓ VIDEO READY</b>}
        {st === 'RUNNING' && <b>🎬 GENERATING VIDEO</b>}
        <span>{j.model}</span>
        <span className="text-faint">{j.sceneId ?? ''}</span>
        <span className="text-faint">{cost}</span>
        {j.status === 'RUNNING' && (
          <Button size="sm" onClick={onCancel}>
            CANCEL
          </Button>
        )}
        {j.status === 'FAILED' && (
          <Button
            size="sm"
            disabled={j.paid}
            title={
              j.paid
                ? 'Job déjà payé : jamais relancé automatiquement'
                : canAutoRetry(j)
                  ? ''
                  : 'Relance manuelle'
            }
            onClick={onRetry}
          >
            RETRY
          </Button>
        )}
      </div>
      {(st === 'RUNNING' || st === 'EXPIRED' || st === 'QUEUED') && (
        <div className="mt-1 grid gap-x-4 text-[11.5px] text-muted md:grid-cols-2">
          <span>Job ID : {j.remoteId ?? j.id}</span>
          <span>Temps écoulé : {elapsed(j.startedAt ?? j.createdAt, now)}</span>
          <span>
            Polling :{' '}
            {j.pollingUrl
              ? 'actif (le job est suivi, jamais soumis deux fois)'
              : 'pas encore soumis au fournisseur'}
          </span>
          {st === 'EXPIRED' && (
            <span className="text-warn">En cours depuis plus de 24 h : probablement expiré</span>
          )}
        </div>
      )}
      {j.status === 'FAILED' && (
        <div className="mt-1 text-[11.5px]">
          <span className="text-err">
            {j.errorClass ?? 'UNKNOWN'} — {j.error ?? 'échec'}
          </span>{' '}
          <span className="text-faint">
            · {j.model} · {j.sceneId ?? '—'}
            {j.paid ? ' · job payé : pas de relance automatique' : ''}
          </span>
        </div>
      )}
    </li>
  );
}
/** « VIDEO GENERATED » card: the player reads the Blob stored in IndexedDB (same store as Asset Library). */
function VideoCard({
  job: j,
  onPlayback,
  onRegenerate,
}: {
  job: Job;
  onPlayback: (s: PlaybackState) => void;
  onRegenerate: () => void;
}) {
  const S = useStudio();
  const toast = useStore((x) => x.toast);
  const vref = useRef<HTMLVideoElement>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [note, setNote] = useState('');
  const asset = j.assetId ? S.assets[j.assetId] : undefined;
  const project = S.projects[j.projectId];
  const sent = Boolean(
    j.sceneId && project?.scenes.find((s) => s.scene_id === j.sceneId)?.videoAssetId === j.assetId,
  );
  const fullscreen = async () => {
    const el = vref.current as (HTMLVideoElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const f = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
    if (!el || !f) {
      setNote('Plein écran indisponible sur ce navigateur : utilisez les contrôles du lecteur.');
      return;
    }
    try {
      await f.call(el);
      setNote('');
    } catch (e) {
      setNote(`Plein écran refusé : ${(e as Error).message}`);
    }
  };
  return (
    <section className="rounded-xl border border-ok/40 bg-elev p-3" data-testid="video-card">
      <div className="mb-2 flex items-center justify-between">
        <b className="text-ok">✓ VIDEO GENERATED</b>
        <Badge tone="ok">COMPLETED</Badge>
      </div>
      <VideoBox assetId={j.assetId} vref={vref} onMeta={setMeta} onState={onPlayback} testId="video-player" />
      <div className="mt-2 grid gap-x-4 gap-y-0.5 text-[12px] md:grid-cols-3">
        <span>
          <b>{j.sceneId ?? '—'}</b>
        </span>
        <span>{j.model}</span>
        <span>
          {meta ? `${meta.duration.toFixed(1)} s` : '…'} · {meta ? `${meta.width}×${meta.height}` : '…'} ·{' '}
          {meta ? ratioOf(meta.width, meta.height) : '…'}
        </span>
        <span>Coût réel : {usd(j.cost)}</span>
        <span>{new Date(j.endedAt ?? j.createdAt).toLocaleString()}</span>
        <span className="truncate text-faint" title={j.remoteId ?? j.id}>
          Job ID : {j.remoteId ?? j.id}
        </span>
        {asset && (
          <span className="text-faint">
            {asset.mime} · {(asset.bytes / 1e6).toFixed(2)} Mo
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => void vref.current?.play().catch((e: Error) => setNote(e.message))}
          data-testid="video-play"
        >
          ▶ PLAY
        </Button>
        <Button size="sm" onClick={() => void fullscreen()} data-testid="video-fullscreen">
          ⛶ FULLSCREEN
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const x = await exportVideo(j.assetId!);
            if (x.ok) toast('ok', `Vidéo exportée : ${x.name}`);
            else toast('err', x.error ?? 'export impossible');
          }}
          data-testid="video-export"
        >
          ⬇ EXPORT VIDEO
        </Button>
        <Button
          size="sm"
          disabled={!j.sceneId || sent}
          onClick={() => {
            if (j.sceneId && sendVideoToStoryboard(j.projectId, j.sceneId, j.assetId!))
              toast('ok', `Vidéo associée à ${j.sceneId} (l’image de référence est conservée)`);
          }}
          data-testid="video-storyboard"
        >
          {sent ? '✓ DANS LE STORYBOARD' : '📌 SEND TO STORYBOARD'}
        </Button>
        <Button
          size="sm"
          disabled={!j.sceneId}
          onClick={onRegenerate}
          title="Crée un NOUVEAU job payant (soumis au plafond de budget)"
        >
          🔄 REGENERATE
        </Button>
      </div>
      {note && <div className="mt-1 text-[11.5px] text-warn">{note}</div>}
    </section>
  );
}
/** Real facts only: every line below is read from the job, the asset metadata, IndexedDB or the <video> element. */
function VideoDiagnostics({
  jobs,
  jobId,
  onPick,
  playback,
}: {
  jobs: Job[];
  jobId: string;
  onPick: (id: string) => void;
  playback: Record<string, PlaybackState>;
}) {
  const [d, setD] = useState<VideoDiag | null>(null);
  const job = jobs.find((x) => x.id === jobId);
  useEffect(() => {
    let alive = true;
    setD(null);
    if (jobId)
      void videoDiagnostics(jobId).then((x) => {
        if (alive) setD(x);
      });
    return () => {
      alive = false;
    };
  }, [jobId, job?.status, job?.assetId]);
  const line = (ok: boolean | null, text: string) => (
    <li className={ok === null ? 'text-faint' : ok ? 'text-ok' : 'text-err'}>
      {ok === null ? '·' : ok ? '✓' : '✗'} {text}
    </li>
  );
  const pb = jobId ? playback[jobId] : undefined;
  return (
    <Card title="VIDEO DIAGNOSTICS" testId="video-diagnostics">
      {!job ? (
        <NoData />
      ) : (
        <>
          <div className="mb-2 max-w-sm">
            <Select
              value={jobId}
              onChange={onPick}
              options={jobs.map((x) => ({
                value: x.id,
                label: `${x.sceneId ?? '—'} · ${x.status} · ${x.id.slice(-6)}`,
              }))}
            />
          </div>
          {d && (
            <ul className="space-y-0.5 text-[12px]">
              {line(null, `Job ID : ${d.jobId}${job.remoteId ? ` (distant ${job.remoteId})` : ''}`)}
              {line(
                job.status === 'COMPLETED' ? true : job.status === 'FAILED' ? false : null,
                `Status : ${d.status}`,
              )}
              {line(null, `Polling URL : ${d.pollingUrl ?? 'aucune (jamais soumis)'}`)}
              {line(null, `Model : ${d.model}`)}
              {line(Boolean(d.assetId), `Asset ID : ${d.assetId ?? 'aucun'}`)}
              {job.status === 'COMPLETED' &&
                line(d.assetMeta, d.assetMeta ? 'Asset créé (métadonnées)' : 'Métadonnées d’asset absentes')}
              {d.assetId &&
                line(
                  d.blobExists,
                  d.blobExists
                    ? `Blob stocké · MIME ${d.mime || 'inconnu'} · ${((d.bytes ?? 0) / 1e6).toFixed(2)} Mo`
                    : 'Blob missing from IndexedDB : le fichier vidéo n’est plus dans le navigateur (données du site effacées ?). Relancer exige un NOUVEAU job payant ; un job payé n’est jamais relancé automatiquement.',
                )}
              {line(d.idb.ok, d.idb.message)}
              {d.blobExists &&
                line(
                  pb === 'loaded' ? true : pb === 'error' ? false : null,
                  pb === 'loaded'
                    ? 'Playback URL créée, élément <video> chargé'
                    : pb === 'error'
                      ? 'Élément <video> en erreur : codec ou fichier invalide'
                      : 'Lecture : en attente de la carte vidéo',
                )}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// ───────── 9. Dialogue ─────────
export function DialogueView() {
  const bp = useActive();
  const S = useStudio();
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const upd = (sid: string, i: number, p: Partial<DialogueLine>) =>
    S.patchProject(id, (b) => ({
      ...b,
      scenes: b.scenes.map((s) =>
        s.scene_id === sid ? { ...s, dialogue: s.dialogue.map((d, k) => (k === i ? { ...d, ...p } : d)) } : s,
      ),
    }));
  return (
    <div className="space-y-3" data-testid="studio-dialogue">
      {bp.scenes.length === 0 ? (
        <NoData>Aucune scène.</NoData>
      ) : (
        bp.scenes.map((s) => (
          <Card
            key={s.scene_id}
            title={`${s.scene_id} — ${s.location}`}
            right={
              <Button
                size="sm"
                onClick={() =>
                  S.patchProject(id, (b) => ({
                    ...b,
                    scenes: b.scenes.map((x) =>
                      x.scene_id === s.scene_id
                        ? {
                            ...x,
                            dialogue: [
                              ...x.dialogue,
                              {
                                speaker: x.characters[0] ?? 'NARRATEUR',
                                text: '',
                                language: 'fr',
                                emotion: 'neutral',
                                intensity: 0.6,
                                pace: 1,
                                pauseAfterMs: 250,
                              },
                            ],
                          }
                        : x,
                    ),
                  }))
                }
              >
                + Réplique
              </Button>
            }
          >
            {s.dialogue.length === 0 ? (
              <div className="text-[12px] text-faint">Pas de réplique.</div>
            ) : (
              s.dialogue.map((d, i) => {
                const words = d.text.trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div
                    key={i}
                    className="mb-2 grid gap-1 md:grid-cols-[130px_1fr_90px_70px_70px_80px_80px_auto]"
                  >
                    <Select
                      value={d.speaker}
                      onChange={(v) => upd(s.scene_id, i, { speaker: v })}
                      options={[
                        ...new Set(['NARRATEUR', d.speaker, ...bp.characters.map((c) => c.name)]),
                      ].map((x) => ({ value: x, label: x }))}
                    />
                    <div>
                      <Input value={d.text} onChange={(e) => upd(s.scene_id, i, { text: e.target.value })} />
                      {words > 12 && (
                        <div className="text-[11px] text-warn">
                          {words} mots (&gt; 12 : trop long pour être dit)
                        </div>
                      )}
                      {d.language === 'wo' && !d.translation && (
                        <div className="text-[11px] text-warn">traduction manquante pour les sous-titres</div>
                      )}
                    </div>
                    <Input
                      value={d.emotion}
                      onChange={(e) => upd(s.scene_id, i, { emotion: e.target.value })}
                      aria-label="émotion"
                    />
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      max={1}
                      value={d.intensity}
                      onChange={(e) => upd(s.scene_id, i, { intensity: Number(e.target.value) })}
                      aria-label="intensité"
                    />
                    <Input
                      type="number"
                      step={0.1}
                      min={0.5}
                      max={1.8}
                      value={d.pace}
                      onChange={(e) => upd(s.scene_id, i, { pace: Number(e.target.value) })}
                      aria-label="débit"
                    />
                    <Input
                      type="number"
                      step={50}
                      min={0}
                      value={d.pauseAfterMs}
                      onChange={(e) => upd(s.scene_id, i, { pauseAfterMs: Number(e.target.value) })}
                      aria-label="pause (ms)"
                    />
                    <Select
                      value={d.language}
                      onChange={(v) => upd(s.scene_id, i, { language: v })}
                      options={[
                        { value: 'fr', label: 'français' },
                        { value: 'wo', label: 'wolof' },
                        { value: 'en', label: 'anglais' },
                      ]}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        S.patchProject(id, (b) => ({
                          ...b,
                          scenes: b.scenes.map((x) =>
                            x.scene_id === s.scene_id
                              ? { ...x, dialogue: x.dialogue.filter((_, k) => k !== i) }
                              : x,
                          ),
                        }))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                );
              })
            )}
          </Card>
        ))
      )}
    </div>
  );
}

// ───────── 10. Voice ─────────
function Player({ id }: { id?: string }) {
  const url = useBlobUrl(id);
  return url ? <audio controls src={url} className="h-8" /> : null;
}
export function VoiceView() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  useEffect(() => {
    void loadRegistry().catch(() => undefined);
  }, []);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const speech = S.registry ? modelsWith(S.registry, 'speech', 'SPEECH') : [];
  const profileOf = (cid: string): VoiceProfile =>
    bp.voices.find((v) => v.characterId === cid) ?? {
      id: `vp-${cid}`,
      characterId: cid,
      language: 'fr',
      accent: 'sénégalais',
      gender: '',
      age: '',
      pitch: 'normal',
      speed: 1,
      emotion: 'neutral',
      style: '',
    };
  const saveProfile = (p: VoiceProfile) =>
    S.patchProject(
      id,
      (b) => ({ ...b, voices: [...b.voices.filter((v) => v.characterId !== p.characterId), p] }),
      'profil de voix',
    );
  return (
    <div className="space-y-3" data-testid="studio-voice">
      <Card title="Modèles de synthèse vocale découverts">
        {speech.length === 0 ? (
          <NoData>Aucun modèle de voix découvert (ouvrez Model Lab → Découvrir les capacités).</NoData>
        ) : (
          <div className="text-[12px]" data-testid="voice-models">
            {speech.length} modèle(s) · gratuits :{' '}
            {speech
              .filter((m) => m.free)
              .map((m) => m.id)
              .join(', ') || 'aucun'}{' '}
            · clonage annoncé :{' '}
            {speech
              .filter((m) => m.caps.includes('VOICE_CLONING'))
              .map((m) => m.id)
              .join(', ') || 'aucun'}
          </div>
        )}
        <div className="mt-1 text-[11.5px] text-faint">
          Le clonage depuis un échantillon n’est possible qu’avec votre accord explicite et pour les modèles
          qui l’annoncent. Un profil de voix ne contient jamais de secret.
        </div>
      </Card>
      {bp.characters.length === 0 ? (
        <NoData>Aucun personnage.</NoData>
      ) : (
        bp.characters.map((c) => {
          const p = profileOf(c.name);
          const m = speech.find((x) => x.id === p.model);
          return (
            <Card key={c.id} title={`Voix de ${c.name}`} testId={`voice-${c.name}`}>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div>
                  <Label>Modèle</Label>
                  <Select
                    value={p.model ?? ''}
                    onChange={(v) => saveProfile({ ...p, model: v || undefined, voice: undefined })}
                    options={[
                      { value: '', label: 'Auto (moins cher)' },
                      ...speech.map((x) => ({ value: x.id, label: `${x.id}${x.free ? ' (gratuit)' : ''}` })),
                    ]}
                  />
                </div>
                <div>
                  <Label>Voix</Label>
                  <Select
                    value={p.voice ?? ''}
                    onChange={(v) => saveProfile({ ...p, voice: v || undefined })}
                    options={[
                      { value: '', label: 'défaut' },
                      ...(m?.voices ?? []).map((x) => ({ value: x, label: x })),
                    ]}
                  />
                </div>
                <div>
                  <Label>Langue</Label>
                  <Input
                    value={p.language}
                    onChange={(e) => saveProfile({ ...p, language: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Accent</Label>
                  <Input value={p.accent} onChange={(e) => saveProfile({ ...p, accent: e.target.value })} />
                </div>
                <div>
                  <Label>Genre</Label>
                  <Input value={p.gender} onChange={(e) => saveProfile({ ...p, gender: e.target.value })} />
                </div>
                <div>
                  <Label>Âge</Label>
                  <Input value={p.age} onChange={(e) => saveProfile({ ...p, age: e.target.value })} />
                </div>
                <div>
                  <Label>Vitesse</Label>
                  <Input
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={2}
                    value={p.speed}
                    onChange={(e) => saveProfile({ ...p, speed: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Style</Label>
                  <Input value={p.style} onChange={(e) => saveProfile({ ...p, style: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {bp.scenes
                  .flatMap((s) => s.dialogue.map((d, i) => ({ s, d, i })))
                  .filter((x) => x.d.speaker === c.name)
                  .map(({ s, d, i }) => {
                    const v = bp.audio.voices?.[lineKey(s.scene_id, i)];
                    return (
                      <div
                        key={`${s.scene_id}-${i}`}
                        className="flex flex-wrap items-center gap-2 text-[12px]"
                      >
                        <span className="w-14 text-faint">
                          {s.scene_id}#{i}
                        </span>
                        <span className="flex-1 truncate" title={d.text}>
                          {d.text}
                        </span>
                        {v && (
                          <>
                            <Player id={v.assetId} />
                            <span className="text-faint">
                              {v.seconds.toFixed(1)} s · {v.model}
                            </span>
                          </>
                        )}
                        <Button
                          size="sm"
                          disabled={Boolean(r.busy) || !d.text.trim()}
                          onClick={() =>
                            void r.run('Synthèse vocale…', () =>
                              generateLine(id, s.scene_id, i, { forceModel: p.model, voice: p.voice }),
                            )
                          }
                          data-testid={`voice-gen-${s.scene_id}-${i}`}
                        >
                          {v ? 'REGENERATE' : 'GENERATE'}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </Card>
          );
        })
      )}
      <BusyBar busy={r.busy} />
      <ErrorBox error={r.error} />
    </div>
  );
}
export { buildConsistency };
