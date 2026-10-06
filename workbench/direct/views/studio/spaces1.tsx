// Spaces 1–5: Production Control Room, Story, Character, World, Style.
import { useMemo, useRef, useState } from 'react';
import { Pause, Play, Square, Upload } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import {
  generateStory,
  importCharacterLibrary,
  readDropped,
  filesFromInput,
  redrawCharacter,
  buildConsistency,
  emptyCharacter,
  loadRegistry,
} from '../../lib/studio/actions';
import {
  completeCharacterSheets,
  completeWorldSheets,
  runAutopilot,
  addWorld,
  type AutoCtl,
} from '../../lib/studio/actions2';
import { progress, spent as spentOf, costIsCertain } from '../../../server/jev/studio/blueprint';
import {
  STAGES,
  type CharacterSheet,
  type StageStatus,
  type WorldSheet,
} from '../../../server/jev/studio/types';
import { stats as jobStats } from '../../../server/jev/studio/jobs';
import { hasKey } from '../../lib/studio/net';
import {
  BusyBar,
  Card,
  ErrorBox,
  Label,
  NoData,
  Thumb,
  useActive,
  useRunner,
  usd,
  VideoBox,
  gotoSpace,
  type VideoMeta,
} from './common';
import { videoOutput } from '../../../server/jev/studio/video';

const TONE: Record<StageStatus, 'neutral' | 'ok' | 'warn' | 'err' | 'info'> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'ok',
  WARNING: 'warn',
  FAILED: 'err',
  NEEDS_REVIEW: 'warn',
  DISABLED: 'neutral',
};

// ───────── 1. Production Control Room ─────────
const autoCtl: AutoCtl = { stop: false, pause: false };
export function ControlRoom() {
  const bp = useActive();
  const S = useStudio();
  const [idea, setIdea] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const r = useRunner();
  const jobs = useMemo(
    () => jobStats(S.jobs.filter((j) => j.projectId === bp?.project.id)),
    [S.jobs, bp?.project.id],
  );
  const est = useMemo(() => {
    const js = S.jobs.filter((j) => j.projectId === bp?.project.id);
    const known = js.filter((j) => j.estimate !== null);
    return known.length
      ? {
          usd: known.reduce((a, j) => a + (j.estimate ?? 0), 0),
          certain: known.every((j) => j.estimateCertain),
        }
      : null;
  }, [S.jobs, bp?.project.id]);
  const create = () => {
    if (!idea.trim()) return;
    S.createProject(idea.trim());
    setIdea('');
  };
  const autopilot = async () => {
    if (!bp) return;
    autoCtl.stop = false;
    autoCtl.pause = false;
    autoCtl.onStep = (s) => setLog((l) => [...l.slice(-60), `${s.stage} — ${s.note}`]);
    setRunning(true);
    await r.run('Autopilot…', () => runAutopilot(bp.project.id, autoCtl, { generateStory }));
    setRunning(false);
    setPaused(false);
  };
  return (
    <div className="space-y-3" data-testid="studio-control-room">
      <Card title="Nouvelle production">
        <Textarea
          data-testid="studio-idea"
          rows={3}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Ex. : Crée une vidéo humoristique sénégalaise de 60 s où une belle-mère découvre que son gendre lui a caché quelque chose"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={create} disabled={!idea.trim()} data-testid="studio-create">
            Créer la production
          </Button>
          <span className="text-[12px] text-faint">
            2D uniquement · mode {S.settings.mode} · plafond {S.settings.cap.toFixed(2)} $ par production ·
            Video Factory {S.settings.videoEnabled ? 'ACTIVE' : 'désactivée'}
          </span>
        </div>
      </Card>
      {!bp ? (
        <NoData>Aucune production. Décrivez une idée ci-dessus : JEV en fait un plan de production.</NoData>
      ) : (
        <>
          <Card
            title={bp.title || 'Production sans titre'}
            right={<Badge tone="neutral">{bp.project.status}</Badge>}
            testId="studio-project-card"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] md:grid-cols-4">
              {(
                [
                  ['Format', bp.aspect],
                  ['Langue', bp.language],
                  ['Durée', `${bp.duration} s`],
                  ['Plateforme', bp.platform],
                  ['Style', bp.styleDNA.name],
                  ['Scènes', bp.scenes.length],
                  ['Personnages', bp.characters.length],
                  ['Assets', bp.assets.length],
                  ['Coût estimé', est ? `${usd(est.usd)}${est.certain ? '' : ' (incertain)'}` : 'non estimé'],
                  ['Coût réel', `${usd(spentOf(bp))}${costIsCertain(bp) ? '' : ' (dont estimations)'}`],
                  ['Modèles utilisés', bp.models.length ? bp.models.join(', ') : 'aucun'],
                  [
                    'Régénérations',
                    S.memory.filter((m) => m.projectId === bp.project.id && m.regenerated).length,
                  ],
                  ['Score qualité', bp.qa?.total ?? 'non mesuré'],
                  ['Avancement', `${Math.round(progress(bp) * 100)} %`],
                  ['Jobs', `${jobs.completed} ok · ${jobs.failed} échec · ${jobs.running} en cours`],
                ] as [string, string | number][]
              ).map(([k, v]) => (
                <div key={k}>
                  <Label>{k}</Label>
                  <div className="truncate" title={String(v)}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" data-testid="studio-stages">
              {STAGES.map((st) => (
                <span key={st} data-testid={`stage-${st}`} title={`${st} : ${bp.stages[st]}`}>
                  <Badge tone={TONE[bp.stages[st] as StageStatus] ?? 'neutral'}>
                    {st} · {bp.stages[st]}
                  </Badge>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={running || Boolean(r.busy)}
                onClick={() => void autopilot()}
                data-testid="studio-autopilot"
              >
                <Play size={13} /> Produis cette vidéo (Autopilot)
              </Button>
              {running && (
                <>
                  <Button
                    onClick={() => {
                      autoCtl.pause = !autoCtl.pause;
                      setPaused(autoCtl.pause);
                    }}
                    data-testid="studio-pause"
                  >
                    <Pause size={13} /> {paused ? 'Reprendre' : 'Pause'}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      autoCtl.stop = true;
                    }}
                    data-testid="studio-stop"
                  >
                    <Square size={13} /> Stop
                  </Button>
                </>
              )}
              {!hasKey() && (
                <Badge tone="warn">clé OpenRouter absente : les générations payantes échoueront</Badge>
              )}
            </div>
            <BusyBar busy={r.busy} />
            <ErrorBox error={r.error} />
            {log.length > 0 && (
              <ol
                className="mt-2 max-h-40 overflow-auto rounded-lg border border-line p-2 text-[12px]"
                data-testid="studio-autopilot-log"
              >
                {log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            )}
          </Card>
          <VideoOutput projectId={bp.project.id} />
          <Card title="Historique des décisions JEV">
            {bp.decisions.length ? (
              <ul className="space-y-0.5 text-[12px]">
                {bp.decisions
                  .slice(-12)
                  .reverse()
                  .map((d, i) => (
                    <li key={i}>
                      <span className="text-faint">{new Date(d.at).toISOString().slice(11, 19)}</span>{' '}
                      <b>{d.stage}</b> — {d.text}
                    </li>
                  ))}
              </ul>
            ) : (
              <NoData>Aucune décision enregistrée.</NoData>
            )}
          </Card>
        </>
      )}
      <ProjectList />
    </div>
  );
}
function ProjectList() {
  const S = useStudio();
  const list = Object.values(S.projects).sort((a, b) => b.project.updatedAt - a.project.updatedAt);
  if (!list.length) return null;
  return (
    <Card title={`Productions (${list.length})`}>
      <ul className="space-y-1 text-[12.5px]">
        {list.map((p) => (
          <li key={p.project.id} className="flex items-center justify-between gap-2">
            <button
              className="truncate text-left hover:text-accent"
              onClick={() => S.setSettings({ activeProjectId: p.project.id })}
              data-testid={`project-${p.project.id}`}
            >
              {p.title || p.project.idea.slice(0, 60)}{' '}
              {S.settings.activeProjectId === p.project.id && <Badge tone="accent">active</Badge>}
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => confirm('Supprimer cette production ?') && S.deleteProject(p.project.id)}
            >
              Supprimer
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ───────── 2. Story ─────────
export function StoryView() {
  const bp = useActive();
  const r = useRunner();
  const S = useStudio();
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const set = (p: Partial<typeof bp>) => S.patchProject(bp.project.id, (b) => ({ ...b, ...p }));
  return (
    <div className="space-y-3" data-testid="studio-story">
      <Card title="Paramètres">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div>
            <Label>Durée visée (s)</Label>
            <Input
              type="number"
              min={15}
              max={180}
              value={bp.duration}
              onChange={(e) => set({ duration: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Langue</Label>
            <Select
              value={bp.language}
              onChange={(v) => set({ language: v })}
              options={[
                { value: 'fr', label: 'Français (+ wolof)' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
          <div>
            <Label>Plateforme</Label>
            <Select
              value={bp.platform}
              onChange={(v) => set({ platform: v })}
              options={['TikTok', 'Reels', 'Shorts', 'YouTube', 'Facebook'].map((x) => ({
                value: x,
                label: x,
              }))}
            />
          </div>
          <div>
            <Label>Format</Label>
            <Select
              value={bp.aspect}
              onChange={(v) => set({ aspect: v })}
              options={['9:16', '16:9', '1:1'].map((x) => ({ value: x, label: x }))}
            />
          </div>
        </div>
        <Label>Idée</Label>
        <Textarea
          rows={2}
          value={bp.project.idea}
          onChange={(e) =>
            S.patchProject(bp.project.id, (b) => ({ ...b, project: { ...b.project, idea: e.target.value } }))
          }
        />
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="primary"
            disabled={Boolean(r.busy)}
            onClick={() => void r.run('Écriture de l’histoire…', () => generateStory(bp.project.id))}
            data-testid="story-generate"
          >
            {bp.story ? 'Réécrire l’histoire' : 'Écrire l’histoire et les scènes'}
          </Button>
          <span className="text-[12px] text-faint">
            Texte : routage et Apprentice existants (modèles gratuits validés d’abord).
          </span>
        </div>
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
      </Card>
      {bp.story ? (
        <Card title={bp.story.title} testId="story-card">
          <div className="grid gap-2 text-[12.5px] md:grid-cols-2">
            {(
              [
                ['Logline', bp.story.logline],
                ['Concept', bp.story.concept],
                ['Synopsis', bp.story.synopsis],
                ['Accroche (hook)', bp.story.hook],
                ['Twist', bp.story.twist],
                ['Chute', bp.story.punchline],
                ['Conflit', bp.story.conflict],
                ['Climax', bp.story.climax],
                ['Résolution', bp.story.resolution],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <Label>{k}</Label>
                <div>{v || '—'}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <NoData>Pas encore d’histoire.</NoData>
      )}
      {bp.scenes.length > 0 && (
        <Card title={`Scènes (${bp.scenes.length})`}>
          <ol className="space-y-2 text-[12.5px]" data-testid="story-scenes">
            {bp.scenes.map((s) => (
              <li key={s.scene_id} className="rounded-lg border border-line p-2">
                <div className="font-medium">
                  {s.scene_id} · {s.beat} · {s.duration}s · {s.location} · {s.time}
                </div>
                <div className="text-muted">{s.action}</div>
                {s.dialogue.map((d, i) => (
                  <div key={i}>
                    <b>{d.speaker}</b> : {d.text}{' '}
                    {d.translation && <span className="text-faint">({d.translation})</span>}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

// ───────── 3. Character ─────────
const FIELDS: [keyof CharacterSheet, string][] = [
  ['role', 'Rôle'],
  ['age', 'Âge'],
  ['gender', 'Genre'],
  ['ethnicity', 'Origine'],
  ['skin', 'Peau'],
  ['face', 'Visage'],
  ['hair', 'Cheveux'],
  ['body', 'Corps'],
  ['height', 'Taille'],
  ['clothing', 'Tenue'],
  ['shoes', 'Chaussures'],
  ['accessories', 'Accessoires'],
  ['voice', 'Voix'],
  ['accent', 'Accent'],
  ['personality', 'Personnalité'],
  ['emotionalProfile', 'Profil émotionnel'],
  ['gestures', 'Gestes'],
  ['posture', 'Posture'],
  ['walk', 'Démarche'],
  ['facialExpressions', 'Expressions'],
  ['speakingStyle', 'Style de parole'],
];
export function CharacterView() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const cur = bp.characters.find((c) => c.id === sel) ?? bp.characters[0];
  const upd = (cid: string, p: Partial<CharacterSheet>) =>
    S.patchProject(id, (b) => ({
      ...b,
      characters: b.characters.map((c) => (c.id === cid ? { ...c, ...p } : c)),
    }));
  const doImport = async (files: ReturnType<typeof filesFromInput>) => {
    const res = await r.run('Import de la bibliothèque…', () => importCharacterLibrary(id, files));
    if (res)
      setMsg(
        `${res.characters} personnage(s), ${res.images} image(s) importée(s)${res.skipped ? `, ${res.skipped} fichier(s) ignoré(s)` : ''}.`,
      );
  };
  return (
    <div className="space-y-3" data-testid="studio-character">
      <Card title="Bibliothèque de personnages">
        <div
          className={`rounded-lg border-2 border-dashed p-4 text-center text-[12.5px] ${over ? 'border-accent bg-accent-soft' : 'border-line'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void readDropped(e.dataTransfer).then(doImport);
          }}
          data-testid="character-drop"
        >
          Glissez un dossier <code>NOM/pose.png</code> (+ <code>meta.json</code>) ici, ou
          <Button
            size="sm"
            className="mx-2"
            onClick={() => input.current?.click()}
            data-testid="character-import"
          >
            <Upload size={13} /> choisir un dossier
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            data-testid="character-input"
            // @ts-expect-error non-standard attribute supported by Chromium
            webkitdirectory=""
            onChange={(e) => e.target.files && void doImport(filesFromInput(e.target.files))}
          />
          <div className="mt-1 text-faint">
            Les images importées gardent le statut SOURCE REFERENCE et restent sur cet ordinateur.
          </div>
        </div>
        {msg && (
          <div className="mt-2 text-[12.5px]" data-testid="character-msg">
            {msg}
          </div>
        )}
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              S.patchProject(id, (b) => ({
                ...b,
                characters: [...b.characters, emptyCharacter(`PERSONNAGE ${b.characters.length + 1}`)],
              }))
            }
          >
            + Personnage
          </Button>
          <Button
            size="sm"
            disabled={Boolean(r.busy)}
            onClick={() => void r.run('Fiches personnages…', () => completeCharacterSheets(id))}
          >
            Compléter les fiches (texte)
          </Button>
        </div>
      </Card>
      {bp.characters.length === 0 ? (
        <NoData>Aucun personnage. Importez votre bibliothèque ou écrivez l’histoire.</NoData>
      ) : (
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <ul className="space-y-1" data-testid="character-list">
            {bp.characters.map((c) => (
              <li key={c.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left text-[12.5px] ${cur?.id === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}
                  onClick={() => setSel(c.id)}
                  data-testid={`character-${c.name}`}
                >
                  <Thumb id={c.referenceAssetId ?? Object.values(c.poses)[0]} className="h-12 w-9" />
                  <span>
                    {c.name}
                    <br />
                    <span className="text-faint">{Object.keys(c.poses).length} pose(s)</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {cur && (
            <Card
              title={cur.name}
              testId="character-sheet"
              right={
                <Badge tone={cur.referenceAssetId ? 'ok' : 'neutral'}>
                  {cur.referenceAssetId ? 'référence 2D prête' : 'pas de référence 2D'}
                </Badge>
              }
            >
              <div className="mb-2 flex flex-wrap gap-2" data-testid="character-poses">
                {Object.entries(cur.poses).map(([pose, aid]) => (
                  <div key={pose} className="text-center text-[11px]">
                    <Thumb id={aid} className="h-24 w-16" />
                    <div>{pose}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {FIELDS.map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input
                      value={String(cur[k] ?? '')}
                      onChange={(e) => upd(cur.id, { [k]: e.target.value } as Partial<CharacterSheet>)}
                    />
                  </div>
                ))}
              </div>
              <Label>Consistency Profile (injecté dans tous les prompts)</Label>
              <Textarea
                rows={2}
                value={cur.consistency}
                onChange={(e) => upd(cur.id, { consistency: e.target.value })}
                data-testid="character-consistency"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => upd(cur.id, { consistency: buildConsistency(cur) })}>
                  Régénérer le profil depuis la fiche
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={Boolean(r.busy)}
                  onClick={() =>
                    void r.run(`Redessin 2D de ${cur.name}…`, () => redrawCharacter(id, cur.id, ['neutral']))
                  }
                  data-testid={`character-redraw-${cur.name}`}
                >
                  Redessin 2D HQ (pose neutre)
                </Button>
                <Button
                  size="sm"
                  disabled={Boolean(r.busy) || !cur.referenceAssetId}
                  onClick={() =>
                    void r.run('Autres poses…', () =>
                      redrawCharacter(id, cur.id, ['angry', 'shock', 'smug', 'laugh']),
                    )
                  }
                  title="Une image par pose ; la pose neutre redessinée sert de référence de style."
                >
                  Redessiner les poses émotions
                </Button>
              </div>
              <div className="mt-1 text-[11.5px] text-faint">
                Une image par pose (≈ coût d’un appel image chacune, lu en direct avant l’appel). Visage,
                pose, tenue, motifs et proportions conservés ; fond blanc ; aucun logo.
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ───────── 4. World ─────────
const WFIELDS: [keyof WorldSheet, string][] = [
  ['architecture', 'Architecture'],
  ['palette', 'Palette'],
  ['lighting', 'Lumière'],
  ['weather', 'Météo'],
  ['time', 'Heure'],
  ['textures', 'Textures'],
  ['objects', 'Objets'],
  ['background', 'Arrière-plan'],
  ['cameraAngles', 'Angles de caméra'],
];
export function WorldView() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const [name, setName] = useState('');
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const upd = (wid: string, p: Partial<WorldSheet>) =>
    S.patchProject(id, (b) => ({ ...b, worlds: b.worlds.map((w) => (w.id === wid ? { ...w, ...p } : w)) }));
  return (
    <div className="space-y-3" data-testid="studio-world">
      <Card title="Lieux persistants (World Bible)">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Dakar, marché, salon, cour, bureau, plage…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="world-name"
          />
          <Button
            size="sm"
            onClick={() => {
              if (name.trim()) {
                addWorld(id, name.trim());
                setName('');
              }
            }}
            data-testid="world-add"
          >
            Ajouter
          </Button>
          <Button
            size="sm"
            disabled={Boolean(r.busy)}
            onClick={() => void r.run('Fiches décors…', () => completeWorldSheets(id))}
          >
            Compléter les fiches (texte)
          </Button>
        </div>
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
      </Card>
      {bp.worlds.length === 0 ? (
        <NoData>Aucun lieu.</NoData>
      ) : (
        bp.worlds.map((w) => (
          <Card key={w.id} title={w.name} testId={`world-${w.name}`}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {WFIELDS.map(([k, label]) => (
                <div key={k}>
                  <Label>{label}</Label>
                  <Input
                    value={String(w[k] ?? '')}
                    onChange={(e) => upd(w.id, { [k]: e.target.value } as Partial<WorldSheet>)}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ───────── 5. Style ─────────
export function StyleView() {
  const bp = useActive();
  const S = useStudio();
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const s = bp.styleDNA;
  const dims: [keyof typeof s, string][] = [
    ['color', 'COLOR'],
    ['lighting', 'LIGHTING'],
    ['material', 'MATERIAL'],
    ['camera', 'CAMERA'],
    ['lens', 'LENS'],
    ['depth', 'DEPTH'],
    ['contrast', 'CONTRAST'],
    ['texture', 'TEXTURE'],
    ['characterDesign', 'CHARACTER DESIGN'],
    ['environmentDesign', 'ENVIRONMENT DESIGN'],
    ['animationStyle', 'ANIMATION STYLE'],
    ['renderStyle', 'RENDER STYLE'],
    ['postProcessing', 'POST PROCESSING'],
    ['negative', 'NEGATIVE'],
  ];
  return (
    <div className="space-y-3" data-testid="studio-style">
      <Card
        title={s.name}
        right={
          <Badge tone={s.locked ? 'ok' : 'warn'}>
            {s.locked ? 'VERROUILLÉ — 2D uniquement' : 'variante modifiable'}
          </Badge>
        }
      >
        <div className="mb-2 text-[12.5px] text-muted">
          Le Style DNA est injecté dans toute génération. Le style par défaut (2D HQ franco-africain) est
          verrouillé : il ne change que sur demande explicite.
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {dims.map(([k, label]) => (
            <div key={k}>
              <Label>{label}</Label>
              <Textarea
                rows={2}
                disabled={s.locked}
                value={String(s[k] ?? '')}
                onChange={(e) =>
                  S.patchProject(bp.project.id, (b) => ({
                    ...b,
                    styleDNA: { ...b.styleDNA, [k]: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              S.patchProject(
                bp.project.id,
                (b) => ({ ...b, styleDNA: { ...b.styleDNA, locked: !b.styleDNA.locked } }),
                'verrou du style',
              )
            }
            data-testid="style-lock"
          >
            {s.locked ? 'Déverrouiller (demande explicite)' : 'Reverrouiller'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
export { loadRegistry };

/** VIDEO OUTPUT: shown only when the project really has a COMPLETED video (latest first). */
function VideoOutput({ projectId }: { projectId: string }) {
  const jobs = useStudio((x) => x.jobs);
  const out = useMemo(() => videoOutput(jobs, projectId), [jobs, projectId]);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  if (!out.latest) return null;
  return (
    <Card title="VIDEO OUTPUT" testId="studio-video-output">
      <div className="flex flex-wrap gap-3">
        <div className="w-44 shrink-0">
          <VideoBox
            assetId={out.latest.assetId}
            onMeta={setMeta}
            className="w-full rounded-lg bg-black"
            testId="video-output-player"
          />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] md:grid-cols-4">
          <div>
            <Label>Vidéos</Label>
            {out.count}
          </div>
          <div>
            <Label>Dernière vidéo</Label>
            {out.latest.sceneId ?? '—'} ·{' '}
            {new Date(out.latest.endedAt ?? out.latest.createdAt).toLocaleString()}
          </div>
          <div>
            <Label>Durée</Label>
            {meta ? `${meta.duration.toFixed(1)} s` : '…'}
          </div>
          <div>
            <Label>Coût total vidéo</Label>
            {usd(out.totalCost)}
            {out.costKnown ? '' : ' (dont non mesuré)'}
          </div>
          <div className="col-span-full">
            <Button size="sm" onClick={() => gotoSpace('video')} data-testid="open-video-factory">
              OPEN VIDEO FACTORY
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
