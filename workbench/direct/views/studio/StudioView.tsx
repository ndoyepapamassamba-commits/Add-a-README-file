// AI VISUAL STUDIO — production department of the Workbench (2D film / animation / social content factory), driven by JEV.
// It is the pre-production and control room: it does NOT replace the local `afrikatoon-auto` engine, it feeds it (kit export).
// Disabled → nothing is read from or written to IndexedDB and no request is made.
import { useEffect, useState } from 'react';
import { budgetTier } from '../../../server/jev/studio/film';
import { dimensionOf } from '../../../server/jev/studio/style';
import { Badge, Button, Gauge, Toggle } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import {
  resumeVideoJobs,
  setVideoPollInterval,
  exportKit,
  exportProjectZip,
  reportHtml,
  storyboardHtml,
  promptsText,
  importFinal,
  runQA,
  repairIssue,
  teacherAdvice,
  srtOf,
} from '../../lib/studio/actions2';
import { recoverJobs } from '../../../server/jev/studio/jobs';
import { spent } from '../../../server/jev/studio/blueprint';
import { planRepairs, type Issue } from '../../../server/jev/studio/qa';
import { ConfirmHost, Card, ErrorBox, NoData, useActive, useRunner, usd } from './common';
import { ControlRoom, StoryView, CharacterView, WorldView, StyleView } from './spaces1';
import { SceneDirector, ImageFactory, VideoFactory, DialogueView, VoiceView } from './spaces2';
import { SoundView, MusicView, SubtitlesView, EditorView, SocialView } from './spaces3';
import { GenomeView, AssetLibrary, MemoryView, AnalyticsView, ModelLab } from './spaces4';
import { FilmAutopilot } from './FilmAutopilot';

type Space =
  | 'control'
  | 'story'
  | 'character'
  | 'world'
  | 'style'
  | 'scenes'
  | 'images'
  | 'video'
  | 'dialogue'
  | 'voice'
  | 'sound'
  | 'music'
  | 'subtitles'
  | 'editor'
  | 'social'
  | 'genome'
  | 'assets'
  | 'memory'
  | 'analytics'
  | 'modellab';
export const SPACES: { id: Space; icon: string; label: string }[] = [
  { id: 'control', icon: '🎬', label: 'Production Control Room' },
  { id: 'story', icon: '✍️', label: 'Story' },
  { id: 'character', icon: '👤', label: 'Character' },
  { id: 'world', icon: '🌍', label: 'World' },
  { id: 'style', icon: '🎨', label: 'Style' },
  { id: 'scenes', icon: '🎥', label: 'Scene Director' },
  { id: 'images', icon: '🖼️', label: 'Image Factory' },
  { id: 'video', icon: '🎞️', label: 'Video Factory' },
  { id: 'dialogue', icon: '🗣️', label: 'Dialogue' },
  { id: 'voice', icon: '🎙️', label: 'Voice' },
  { id: 'sound', icon: '🔊', label: 'Sound' },
  { id: 'music', icon: '🎵', label: 'Music' },
  { id: 'subtitles', icon: '💬', label: 'Subtitles' },
  { id: 'editor', icon: '✂️', label: 'AI Editor' },
  { id: 'social', icon: '📱', label: 'Social Factory' },
  { id: 'genome', icon: '🧬', label: 'Prompt Genome' },
  { id: 'assets', icon: '🗂️', label: 'Asset Library' },
  { id: 'memory', icon: '🧠', label: 'Production Memory' },
  { id: 'analytics', icon: '📊', label: 'Production Analytics' },
  { id: 'modellab', icon: '⚙️', label: 'Model Lab' },
];

/** QA, repairs, exports and the bridge with the local engine (shown under the Control Room). */
function Delivery() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const [msg, setMsg] = useState('');
  if (!bp) return null;
  const id = bp.project.id;
  const plan = bp.qa ? planRepairs(bp.qa.issues as Issue[]) : [];
  const dlText = (name: string, text: string, mime: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    a.click();
  };
  return (
    <div className="space-y-3" data-testid="studio-delivery">
      <Card
        title="QA de production"
        right={
          <Button
            size="sm"
            variant="primary"
            disabled={Boolean(r.busy)}
            onClick={() => void r.run('QA…', () => runQA(id))}
            data-testid="qa-run"
          >
            Lancer la QA
          </Button>
        }
      >
        {!bp.qa ? (
          <NoData>QA non exécutée.</NoData>
        ) : (
          <div className="text-[12.5px]" data-testid="qa-report">
            <div className="flex flex-wrap gap-2">
              {Object.entries(bp.qa.scores).map(([k, v]) => (
                <Badge key={k} tone={v === null ? 'neutral' : v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'err'}>
                  {k.toUpperCase()} {v === null ? 'non mesuré' : v}
                </Badge>
              ))}
              <Badge tone="accent">TOTAL {bp.qa.total ?? 'non mesuré'}</Badge>
            </div>
            <div className="mt-1 text-faint">
              Juge visuel :{' '}
              {bp.qa.judge
                ? `${bp.qa.judge} (${bp.qa.judgeConfidence})`
                : 'aucun — scores VISUAL / AUDIO / CONSISTENCY laissés vides (jamais de score par défaut)'}
            </div>
            <ul className="mt-2 space-y-1">
              {plan.length === 0 ? (
                <li className="text-ok">Aucun problème détecté par les contrôles.</li>
              ) : (
                plan.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Badge tone={p.issue.severity === 'error' ? 'err' : 'warn'}>{p.issue.code}</Badge>
                    {p.issue.sceneId} {p.issue.message}
                    {p.repair ? (
                      <Button
                        size="sm"
                        disabled={Boolean(r.busy)}
                        onClick={async () => {
                          const x = await r.run('Correction…', () => repairIssue(id, p.issue));
                          if (x) setMsg(`${p.repair!.label} : ${x.note}`);
                        }}
                      >
                        {p.repair.label}
                      </Button>
                    ) : (
                      <span className="text-faint">revue humaine</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(r.busy)}
                      data-testid="teacher-ask"
                      onClick={async () => {
                        const x = await r.run('Teacher…', () => teacherAdvice(id, p.issue));
                        if (x)
                          setMsg(
                            `TEACHER (${x.model}, ${x.cost.toFixed(4)} $ — LEARNING INVESTMENT) : ${x.advice.slice(0, 300)}`,
                          );
                      }}
                    >
                      Demander au Teacher
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
        {msg && (
          <div className="mt-1 text-[12.5px]" data-testid="repair-msg">
            {msg}
          </div>
        )}
        <ErrorBox error={r.error} />
      </Card>
      <Card title="Exports" testId="studio-exports">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={dimensionOf(bp.styleDNA) === '3D'}
            title={
              dimensionOf(bp.styleDNA) === '3D'
                ? 'NOT AVAILABLE : le moteur local afrikatoon-auto rend uniquement la 2D'
                : undefined
            }
            onClick={async () => {
              const x = await r.run('Kit…', () => exportKit(id));
              if (x)
                setMsg(x.ok ? `Kit exporté (${(x.bytes / 1024).toFixed(0)} Ko)` : `Kit refusé : ${x.error}`);
            }}
            data-testid="export-kit"
          >
            Exporter le kit afrikatoon-auto{dimensionOf(bp.styleDNA) === '3D' ? ' (2D seulement)' : ''}
          </Button>
          <Button
            onClick={async () => {
              const x = await r.run('ZIP…', () => exportProjectZip(id));
              if (x)
                setMsg(
                  x.ok ? `Projet exporté (${(x.bytes / 1024).toFixed(0)} Ko)` : `Export bloqué : ${x.error}`,
                );
            }}
            data-testid="export-zip"
          >
            Projet (ZIP)
          </Button>
          <Button
            onClick={() => dlText('rapport-de-production.html', reportHtml(bp), 'text/html')}
            data-testid="export-report"
          >
            Rapport de production
          </Button>
          <Button onClick={async () => dlText('storyboard.html', await storyboardHtml(bp), 'text/html')}>
            Storyboard imprimable
          </Button>
          <Button onClick={() => dlText('prompts.txt', promptsText(bp), 'text/plain')}>Prompts</Button>
          <Button onClick={() => dlText('sous-titres.srt', srtOf(bp), 'text/plain')}>.srt</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-line px-3 text-[13px]">
            Importer le rendu local (FINAL ASSET)
            <input
              type="file"
              multiple
              className="hidden"
              data-testid="import-final"
              onChange={(e) => {
                const fs = [...(e.target.files ?? [])];
                if (fs.length)
                  void r
                    .run('Import…', () => importFinal(id, fs))
                    .then((n) => setMsg(`${n} fichier(s) importé(s) comme FINAL ASSET (rendu local, 0 $)`));
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="mt-1 text-[12px]" data-testid="export-msg">
          {msg}
        </div>
        <div className="mt-1 text-[11.5px] text-faint">
          Aucun export ne contient de clé ni de jeton : un scan de motifs de secrets bloque l’export si
          nécessaire. Kit : `AFRIKATOON_2D_DIR=characters_2d_ia python run.py run --kit kits/….json --mock
          2d-hq --no-upload`.
        </div>
        {S.settings.enabled && null}
      </Card>
    </div>
  );
}

function Body({ space }: { space: Space }) {
  switch (space) {
    case 'control':
      return (
        <>
          <ControlRoom />
          <div className="mt-3">
            <Delivery />
          </div>
        </>
      );
    case 'story':
      return <StoryView />;
    case 'character':
      return <CharacterView />;
    case 'world':
      return <WorldView />;
    case 'style':
      return <StyleView />;
    case 'scenes':
      return <SceneDirector />;
    case 'images':
      return <ImageFactory />;
    case 'video':
      return <VideoFactory />;
    case 'dialogue':
      return <DialogueView />;
    case 'voice':
      return <VoiceView />;
    case 'sound':
      return <SoundView />;
    case 'music':
      return <MusicView />;
    case 'subtitles':
      return <SubtitlesView />;
    case 'editor':
      return <EditorView />;
    case 'social':
      return <SocialView />;
    case 'genome':
      return <GenomeView />;
    case 'assets':
      return <AssetLibrary />;
    case 'memory':
      return <MemoryView />;
    case 'analytics':
      return <AnalyticsView />;
    case 'modellab':
      return <ModelLab />;
  }
}

/** Test hook (opt-in with localStorage `vs.debug=1`): lets the end-to-end tests shorten the video polling interval. */
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem('vs.debug') === '1')
      (window as unknown as { massambaStudioDebug: unknown }).massambaStudioDebug = { setVideoPollInterval };
  } catch {
    /* storage unavailable */
  }
}

export function StudioView() {
  const S = useStudio();
  const bp = useActive();
  const [space, setSpace] = useState<Space>('control');
  const [expert, setExpert] = useState(() => {
    try {
      return localStorage.getItem('vs.expert') === '1';
    } catch {
      return false;
    }
  });
  const setExpertMode = (v: boolean) => {
    setExpert(v);
    try {
      localStorage.setItem('vs.expert', v ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  const enabled = S.settings.enabled;
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (SPACES.some((x) => x.id === id)) setSpace(id as Space);
    };
    window.addEventListener('studio:goto', on);
    return () => window.removeEventListener('studio:goto', on);
  }, []);
  // Hydration (IndexedDB read) happens only once the studio is opened AND enabled.
  useEffect(() => {
    if (!enabled) return;
    void S.hydrate().then(() => {
      // On reopening, nothing is resubmitted: running video jobs are polled again, orphans are closed.
      const st = useStudio.getState();
      const rec = recoverJobs(st.jobs);
      if (rec.orphaned.length) st.setJobs(() => rec.jobs);
      if (rec.repoll.length) void resumeVideoJobs();
    });
  }, [enabled]);
  if (!enabled)
    return (
      <div className="mx-auto max-w-xl p-8 text-center" data-testid="studio-disabled">
        <div className="mb-2 text-[16px] font-semibold">🎬 MASSAMBA AI FILM STUDIO — désactivé</div>
        <p className="mb-4 text-[13px] text-muted">
          Studio désactivé : aucun appel réseau, aucune lecture ni écriture dans IndexedDB, aucun ajout au
          JEV_LOG. Le Workbench se comporte comme avant.
        </p>
        <Toggle checked={false} onChange={(v) => S.setSettings({ enabled: v })} label="Activer le studio" />
      </div>
    );
  // The SINGLE VIEW (Film Autopilot) is the studio; the former multi-space studio stays available as « mode expert ».
  if (!expert) return <FilmAutopilot onExpert={() => setExpertMode(true)} />;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="studio">
      <ConfirmHost />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <div className="leading-tight">
          <div className="font-semibold">🎬 MASSAMBA AI FILM STUDIO</div>
          <div className="text-[10.5px] text-faint">AI-native audiovisual production system</div>
        </div>
        <Badge tone="accent">2D / 3D · AI FILM · ANIMATION · SOCIAL</Badge>
        {bp && <Badge tone="info">{dimensionOf(bp.styleDNA)}</Badge>}
        {bp && budgetTier(spent(bp), bp.cap).tier !== 'normal' && (
          <Badge tone={budgetTier(spent(bp), bp.cap).tier === 'hard-stop' ? 'err' : 'warn'}>
            BUDGET {budgetTier(spent(bp), bp.cap).label}
          </Badge>
        )}
        <Badge tone="neutral">mode {bp?.mode ?? S.settings.mode}</Badge>
        {bp && (
          <div
            className="flex items-center gap-2 text-[12px]"
            title="Dépense réelle / plafond dur de la production"
            data-testid="studio-budget"
          >
            <span>
              {usd(spent(bp))} / {bp.cap.toFixed(2)} $
            </span>
            <div className="w-28">
              <Gauge value={spent(bp)} max={bp.cap} />
            </div>
          </div>
        )}
        {S.busy && <span className="text-[12px] text-faint">{S.busy}</span>}
        <div className="ml-auto flex items-center gap-3">
          <Button size="sm" variant="primary" onClick={() => setExpertMode(false)} data-testid="back-to-autopilot">
            ← Film Autopilot
          </Button>
          <Toggle checked={enabled} onChange={(v) => S.setSettings({ enabled: v })} label="Studio activé" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          className="w-52 shrink-0 overflow-y-auto border-r border-line p-2"
          aria-label="Espaces du studio"
          data-testid="studio-nav"
        >
          {SPACES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSpace(s.id)}
              data-testid={`space-${s.id}`}
              aria-current={space === s.id}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] ${space === s.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg'}`}
            >
              <span aria-hidden>{s.icon}</span>
              <span className="truncate">
                {i + 1}. {s.label}
              </span>
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-auto p-4" data-testid="studio-main">
          <Body space={space} />
        </main>
      </div>
    </div>
  );
}
