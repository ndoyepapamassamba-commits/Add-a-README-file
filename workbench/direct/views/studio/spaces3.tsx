// Spaces 11–15: Sound, Music, Subtitles, AI Editor, Social Factory.
import { useRef, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { Badge, Button, Input, Select } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import {
  addLocalMusic,
  addSfx,
  buildEdit,
  compileSubtitles,
  generateSocial,
  importAudio,
  sfxProposals,
  srtOf,
} from '../../lib/studio/actions2';
import { askConfirm } from '../../lib/studio/exec';
import { probeMusic, hasKey } from '../../lib/studio/net';
import { previewSupport, renderPreview } from '../../lib/studio/preview';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import { DEFAULT_MUSIC, type MusicSpec, type SfxLabel } from '../../../server/jev/studio/sound';
import {
  SUBTITLE_STYLES,
  ASPECTS,
  activeAt,
  timeSubtitles,
  type SubtitleStyle,
} from '../../../server/jev/studio/subtitles';
import {
  moveClip,
  removeClip,
  reorderScenes,
  setClip,
  splitClip,
  totalDuration,
  trimClip,
  TRACKS,
  overlaps,
} from '../../../server/jev/studio/timeline';
import { AI_LABEL_REMINDER, PLATFORMS } from '../../../server/jev/studio/social';
import { BusyBar, Card, ErrorBox, Label, NoData, useActive, useBlobUrl, useRunner } from './common';

const Audio = ({ id }: { id?: string }) => {
  const u = useBlobUrl(id);
  return u ? <audio controls src={u} className="h-8" /> : null;
};
const ALL_SFX: SfxLabel[] = [
  'door',
  'phone',
  'crowd',
  'market',
  'impact',
  'surprise',
  'whoosh',
  'steps',
  'slap',
  'laugh',
  'money',
];

// ───────── 11. Sound ─────────
export function SoundView() {
  const bp = useActive();
  const r = useRunner();
  const file = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState('');
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  return (
    <div className="space-y-3" data-testid="studio-sound">
      <Card title="Bruitages par scène">
        <div className="mb-2 text-[12px] text-muted">
          JEV propose les bruitages d’après l’action. Priorité aux sons importés (CC0 : Kenney…) ; à défaut,
          synthèse locale WebAudio gratuite (étiquetée « synthèse locale »).
        </div>
        <input
          ref={file}
          type="file"
          accept="audio/*"
          className="hidden"
          data-testid="sound-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && target) void r.run('Import…', () => importAudio(id, f, 'sfx', target));
            e.target.value = '';
          }}
        />
        {bp.scenes.length === 0 ? (
          <NoData>Aucune scène.</NoData>
        ) : (
          bp.scenes.map((s) => {
            const props = sfxProposals(bp, s.scene_id);
            const mine = bp.audio.sfx.filter((x) => x.sceneId === s.scene_id);
            return (
              <div
                key={s.scene_id}
                className="mb-2 rounded-lg border border-line p-2 text-[12px]"
                data-testid={`sound-${s.scene_id}`}
              >
                <div className="font-medium">
                  {s.scene_id} — {s.sound || s.action.slice(0, 50)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-faint">Proposés :</span>
                  {props.length ? (
                    props.map((l) => (
                      <Button
                        key={l}
                        size="sm"
                        disabled={Boolean(r.busy)}
                        onClick={() => void r.run('Synthèse…', () => addSfx(id, s.scene_id, l))}
                        data-testid={`sfx-${s.scene_id}-${l}`}
                      >
                        + {l}
                      </Button>
                    ))
                  ) : (
                    <span className="text-faint">aucun (action sans bruitage évident)</span>
                  )}
                  <span className="ml-2 text-faint">Autres :</span>
                  <Select
                    value=""
                    onChange={(v) =>
                      v && void r.run('Synthèse…', () => addSfx(id, s.scene_id, v as SfxLabel))
                    }
                    options={[{ value: '', label: '…' }, ...ALL_SFX.map((x) => ({ value: x, label: x }))]}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setTarget(s.scene_id);
                      file.current?.click();
                    }}
                  >
                    Importer…
                  </Button>
                </div>
                {mine.map((x) => (
                  <div key={x.label + (x.assetId ?? '')} className="mt-1 flex items-center gap-2">
                    <Badge tone="neutral">{x.label}</Badge>
                    <Audio id={x.assetId} />
                  </div>
                ))}
              </div>
            );
          })
        )}
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
      </Card>
    </div>
  );
}

// ───────── 12. Music ─────────
export function MusicView() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const file = useRef<HTMLInputElement>(null);
  const [spec, setSpec] = useState<MusicSpec>(DEFAULT_MUSIC);
  const [probeMsg, setProbeMsg] = useState('');
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const music = S.registry ? modelsWith(S.registry, 'music', 'MUSIC_GENERATION') : [];
  const toggleInst = (i: 'balafon' | 'djembe' | 'kora') =>
    setSpec((x) => ({
      ...x,
      instruments: x.instruments.includes(i) ? x.instruments.filter((y) => y !== i) : [...x.instruments, i],
    }));
  const probe = async (model: string) => {
    if (!hasKey()) return setProbeMsg('Clé OpenRouter absente.');
    const ok = await askConfirm(
      `Sonde de ${model} : UN appel de test (payant selon le modèle) pour vérifier le format de sortie audio, qui n’est pas documenté. Autoriser ?`,
    );
    if (!ok) return;
    const x = await r.run('Sonde musique…', () => probeMusic(model));
    if (x) {
      setProbeMsg(
        x.ok
          ? `Format détecté : ${x.shape}`
          : `Pas d’audio exploitable (réponse : ${x.shape}). Capability unavailable in current environment.`,
      );
      S.setSettings({ musicProbe: x.ok ? 'works' : 'unavailable' });
    }
  };
  return (
    <div className="space-y-3" data-testid="studio-music">
      <Card title="Musique — synthèse locale gratuite (balafon · djembé · kora)">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div>
            <Label>Genre</Label>
            <Input value={spec.genre} onChange={(e) => setSpec({ ...spec, genre: e.target.value })} />
          </div>
          <div>
            <Label>Ambiance</Label>
            <Input value={spec.mood} onChange={(e) => setSpec({ ...spec, mood: e.target.value })} />
          </div>
          <div>
            <Label>Tempo (BPM)</Label>
            <Input
              type="number"
              min={60}
              max={180}
              value={spec.tempo}
              onChange={(e) => setSpec({ ...spec, tempo: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Durée (s)</Label>
            <Input
              type="number"
              min={10}
              max={180}
              value={spec.seconds}
              onChange={(e) => setSpec({ ...spec, seconds: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Énergie (0–1)</Label>
            <Input
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={spec.energy}
              onChange={(e) => setSpec({ ...spec, energy: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-3 flex items-end gap-3 text-[12.5px]">
            {(['balafon', 'djembe', 'kora'] as const).map((i) => (
              <label key={i} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={spec.instruments.includes(i)}
                  onChange={() => toggleInst(i)}
                />{' '}
                {i}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={Boolean(r.busy)}
            onClick={() =>
              void r.run('Synthèse de la musique…', () =>
                addLocalMusic(id, { ...spec, seconds: spec.seconds }),
              )
            }
            data-testid="music-generate"
          >
            Générer (local, 0 $)
          </Button>
          <Button onClick={() => file.current?.click()}>Importer une musique</Button>
          <input
            ref={file}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void r.run('Import…', () => importAudio(id, f, 'music'));
              e.target.value = '';
            }}
          />
        </div>
        {bp.audio.music?.assetId && (
          <div className="mt-2 flex items-center gap-2" data-testid="music-player">
            <Badge tone="neutral">musique du projet</Badge>
            <Audio id={bp.audio.music.assetId} />
          </div>
        )}
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
      </Card>
      <Card title="Génération par modèle (Lyria et autres)">
        <div className="text-[12.5px] text-muted">
          Le format de sortie audio de ces modèles n’est pas documenté : tant qu’il n’a pas été vérifié par un
          appel de test explicite et autorisé, la capacité reste <b>indisponible</b> et la musique locale est
          proposée.
        </div>
        <div className="mt-1 text-[12.5px]" data-testid="music-status">
          État :{' '}
          {S.settings.musicProbe === 'works'
            ? 'format vérifié'
            : S.settings.musicProbe === 'unavailable'
              ? 'Capability unavailable in current environment'
              : 'non vérifié — Capability unavailable in current environment'}
        </div>
        {music.length === 0 ? (
          <NoData>Aucun modèle à sortie audio découvert.</NoData>
        ) : (
          <ul className="mt-2 space-y-1 text-[12px]">
            {music.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span>{m.id}</span>
                {m.free && <Badge tone="ok">gratuit annoncé</Badge>}
                <Button size="sm" onClick={() => void probe(m.id)}>
                  Sonder (test payant)
                </Button>
              </li>
            ))}
          </ul>
        )}
        {probeMsg && <div className="mt-2 text-[12.5px]">{probeMsg}</div>}
      </Card>
    </div>
  );
}

// ───────── 13. Subtitles ─────────
export function SubtitlesView() {
  const bp = useActive();
  const S = useStudio();
  const [t, setT] = useState(0);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const style = bp.subtitles.style as SubtitleStyle;
  const lines = timeSubtitles(bp.scenes, {
    voiceSeconds: Object.fromEntries(
      Object.entries(bp.audio.voices ?? {}).reduce<[string, number[]][]>((acc, [k, v]) => {
        const [sid, i] = k.split(':');
        const e = acc.find((x) => x[0] === sid) ?? (acc.push([sid!, []]), acc[acc.length - 1]!);
        e[1][Number(i)] = v.seconds;
        return acc;
      }, []),
    ),
  });
  const end = lines.at(-1)?.end ?? 0;
  const act = activeAt(lines, t);
  const st = SUBTITLE_STYLES[style];
  const hasVoice = Object.keys(bp.audio.voices ?? {}).length > 0;
  const download = () => {
    const blob = new Blob([srtOf(bp)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${bp.title || 'sous-titres'}.srt`;
    a.click();
  };
  return (
    <div className="space-y-3" data-testid="studio-subtitles">
      <Card
        title="Sous-titres"
        right={
          <Badge tone="neutral">
            {hasVoice ? 'timing = durées de voix MESURÉES' : 'timing = estimation (aucune voix générée)'}
          </Badge>
        }
      >
        <div className="grid gap-2 md:grid-cols-4">
          <div>
            <Label>Style</Label>
            <Select
              value={style}
              onChange={(v) => S.patchProject(id, (b) => ({ ...b, subtitles: { ...b.subtitles, style: v } }))}
              options={(Object.keys(SUBTITLE_STYLES) as SubtitleStyle[]).map((x) => ({ value: x, label: x }))}
            />
          </div>
          <div>
            <Label>Format</Label>
            <Select
              value={bp.aspect}
              onChange={(v) =>
                S.patchProject(id, (b) => ({ ...b, aspect: v, timeline: { ...b.timeline, aspect: v } }))
              }
              options={Object.keys(ASPECTS).map((x) => ({
                value: x,
                label: `${x} (${ASPECTS[x]!.join('×')})`,
              }))}
            />
          </div>
          <div className="col-span-2 flex items-end gap-2">
            <Button variant="primary" onClick={() => compileSubtitles(id)} data-testid="subtitles-compute">
              Calculer le timing
            </Button>
            <Button onClick={download} disabled={!lines.length}>
              <Download size={13} /> .srt
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
          <div
            className="relative flex items-end justify-center overflow-hidden rounded-lg bg-black p-2"
            style={{ aspectRatio: bp.aspect.replace(':', '/'), maxHeight: 360 }}
            data-testid="subtitle-preview"
          >
            {act && (
              <div
                className="text-center"
                style={{
                  fontFamily: st.font,
                  fontWeight: st.weight,
                  color: st.fill,
                  fontSize: 18,
                  textShadow: `0 0 3px ${st.stroke}, 0 0 3px ${st.stroke}`,
                }}
              >
                {act.line.emoji}{' '}
                {act.line.words.map((w, i) => (
                  <span key={i} style={{ color: i === act.wordIndex ? st.active : st.fill }}>
                    {st.upper ? w.text.toUpperCase() : w.text}{' '}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Position (s)</Label>
            <input
              type="range"
              min={0}
              max={Math.max(1, end)}
              step={0.1}
              value={t}
              onChange={(e) => setT(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-[12px] text-faint">
              {t.toFixed(1)} s / {end.toFixed(1)} s
            </div>
            {lines.length === 0 ? (
              <NoData>Aucune réplique.</NoData>
            ) : (
              <ol className="mt-2 max-h-60 overflow-auto text-[12px]" data-testid="subtitle-lines">
                {lines.map((l, i) => (
                  <li key={i}>
                    <span className="text-faint">
                      {l.start.toFixed(1)}–{l.end.toFixed(1)}
                    </span>{' '}
                    {l.emoji ?? ''} <b>{l.speaker}</b> {l.text}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-faint">
          Les emojis sont déduits de l’émotion et de l’action, jamais au hasard. Formats 9:16 / 16:9 / 1:1
          pour TikTok, Reels, Shorts, YouTube. Transcription automatique : aucune capacité de transcription
          découverte — timing calculé à partir du texte et de la durée de la voix.
        </div>
      </Card>
    </div>
  );
}

// ───────── 14. AI Editor ─────────
const COL: Record<string, string> = {
  video: 'bg-accent/50',
  dialogue: 'bg-info/40',
  voice: 'bg-ok/40',
  music: 'bg-warn/40',
  sfx: 'bg-err/30',
  subtitles: 'bg-hover',
};
export function EditorView() {
  const bp = useActive();
  const S = useStudio();
  const r = useRunner();
  const [sel, setSel] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [prog, setProg] = useState(0);
  const [out, setOut] = useState<{ url: string; mime: string; seconds: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const id = bp.project.id;
  const tl = bp.timeline;
  const total = Math.max(1, totalDuration(tl));
  const set = (next: typeof tl, note: string) => S.patchProject(id, (b) => ({ ...b, timeline: next }), note);
  const clip = tl.clips.find((c) => c.id === sel);
  const sup = previewSupport();
  const sceneOrder = tl.clips
    .filter((c) => c.track === 'video')
    .sort((a, b) => a.start - b.start)
    .map((c) => c.sceneId!);
  const render = async () => {
    abort.current = new AbortController();
    setOut(null);
    const x = await r.run('Rendu de l’animatic (temps réel)…', () =>
      renderPreview(bp, { onProgress: (p) => setProg(p), signal: abort.current!.signal }),
    );
    if (x) setOut({ url: URL.createObjectURL(x.blob), mime: x.mime, seconds: x.seconds });
  };
  return (
    <div className="space-y-3" data-testid="studio-editor">
      <Card
        title="Timeline"
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => buildEdit(id)} data-testid="editor-auto">
              Montage automatique
            </Button>
          </div>
        }
      >
        {tl.clips.length === 0 ? (
          <NoData>Timeline vide : lancez le montage automatique à partir du storyboard.</NoData>
        ) : (
          <div data-testid="timeline" className="space-y-1">
            {TRACKS.map((tr) => (
              <div key={tr} className="flex items-center gap-2">
                <div className="w-20 shrink-0 text-[11px] uppercase text-faint">
                  {tr === 'video' ? 'vidéo/images' : tr}
                </div>
                <div className="relative h-7 flex-1 rounded bg-panel">
                  {tl.clips
                    .filter((c) => c.track === tr)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSel(c.id)}
                        title={`${c.text ?? c.sceneId ?? tr} · ${c.start.toFixed(1)}s +${c.duration.toFixed(1)}s`}
                        data-testid={`clip-${tr}`}
                        className={`absolute top-0.5 h-6 overflow-hidden whitespace-nowrap rounded px-1 text-left text-[10px] ${COL[tr]} ${sel === c.id ? 'ring-2 ring-accent' : ''}`}
                        style={{
                          left: `${(c.start / total) * 100}%`,
                          width: `${Math.max(0.6, (c.duration / total) * 100)}%`,
                        }}
                      >
                        {c.text ?? c.sceneId ?? ''}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            <div className="text-[11.5px] text-faint">
              Durée {total.toFixed(1)} s · {overlaps(tl).length} chevauchement(s) voix/dialogue
            </div>
          </div>
        )}
      </Card>
      {clip && (
        <Card title={`Clip ${clip.track}${clip.sceneId ? ` · ${clip.sceneId}` : ''}`} testId="clip-panel">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div>
              <Label>Début (s)</Label>
              <Input
                type="number"
                step={0.1}
                value={clip.start.toFixed(1)}
                onChange={(e) => set(moveClip(tl, clip.id, Number(e.target.value)), 'déplacement')}
              />
            </div>
            <div>
              <Label>Gain</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={clip.gain ?? 1}
                onChange={(e) => set(setClip(tl, clip.id, { gain: Number(e.target.value) }), 'niveau')}
              />
            </div>
            <div>
              <Label>Fondu entrée</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                value={clip.fadeIn ?? 0}
                onChange={(e) => set(setClip(tl, clip.id, { fadeIn: Number(e.target.value) }), 'fondu')}
              />
            </div>
            <div>
              <Label>Fondu sortie</Label>
              <Input
                type="number"
                step={0.1}
                min={0}
                value={clip.fadeOut ?? 0}
                onChange={(e) => set(setClip(tl, clip.id, { fadeOut: Number(e.target.value) }), 'fondu')}
              />
            </div>
            <div>
              <Label>Vitesse</Label>
              <Input
                type="number"
                step={0.25}
                value={clip.speed ?? 1}
                onChange={(e) => set(setClip(tl, clip.id, { speed: Number(e.target.value) }), 'vitesse')}
              />
            </div>
            <div>
              <Label>Zoom</Label>
              <Input
                type="number"
                step={0.02}
                value={clip.zoom ?? 1}
                onChange={(e) => set(setClip(tl, clip.id, { zoom: Number(e.target.value) }), 'zoom')}
              />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input
              className="w-24"
              placeholder="couper à (s)"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
            <Button size="sm" onClick={() => set(splitClip(tl, clip.id, Number(at)), 'découpe')}>
              Scinder
            </Button>
            <Button size="sm" onClick={() => set(trimClip(tl, clip.id, { head: 0.3 }), 'rognage')}>
              Rogner −0,3 s (début)
            </Button>
            <Button size="sm" onClick={() => set(trimClip(tl, clip.id, { tail: 0.3 }), 'rognage')}>
              Rogner −0,3 s (fin)
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                set(removeClip(tl, clip.id), 'suppression');
                setSel(null);
              }}
            >
              Supprimer
            </Button>
          </div>
        </Card>
      )}
      {sceneOrder.length > 1 && (
        <Card title="Ordre des scènes">
          <div className="flex flex-wrap gap-1">
            {sceneOrder.map((s, i) => (
              <span key={s} className="flex items-center gap-0.5 rounded border border-line px-1 text-[12px]">
                {s}
                <button
                  aria-label="avancer"
                  disabled={i === 0}
                  onClick={() => {
                    const o = [...sceneOrder];
                    [o[i - 1], o[i]] = [o[i]!, o[i - 1]!];
                    set(reorderScenes(tl, o), 'ordre des scènes');
                  }}
                >
                  ◀
                </button>
                <button
                  aria-label="reculer"
                  disabled={i === sceneOrder.length - 1}
                  onClick={() => {
                    const o = [...sceneOrder];
                    [o[i + 1], o[i]] = [o[i]!, o[i + 1]!];
                    set(reorderScenes(tl, o), 'ordre des scènes');
                  }}
                >
                  ▶
                </button>
              </span>
            ))}
          </div>
        </Card>
      )}
      <Card title="Aperçu (animatic navigateur)">
        <div className="text-[12.5px] text-muted">
          Canvas + WebAudio + MediaRecorder : images du storyboard avec zoom lent, voix réelles, musique,
          bruitages et sous-titres mot à mot. Rendu en temps réel ; ce n’est pas le film final (le rendu 2D
          final se fait avec le moteur local).
        </div>
        {!sup.ok ? (
          <NoData>{sup.reason} Secours : exportez le kit vers le moteur 2D local.</NoData>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="primary"
              disabled={Boolean(r.busy) || !bp.scenes.length}
              onClick={() => void render()}
              data-testid="editor-render"
            >
              <Play size={13} /> Rendre l’aperçu
            </Button>
            {r.busy && <Button onClick={() => abort.current?.abort()}>Arrêter</Button>}
            <span className="text-[12px] text-faint">format {sup.mime}</span>
          </div>
        )}
        {r.busy && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-hover">
            <div className="h-full bg-accent" style={{ width: `${Math.round(prog * 100)}%` }} />
          </div>
        )}
        <ErrorBox error={r.error} />
        {out && (
          <div className="mt-2" data-testid="editor-result">
            <video src={out.url} controls className="max-h-[420px] rounded-lg border border-line" />
            <div className="mt-1 text-[12px] text-faint">
              {out.seconds.toFixed(1)} s · {out.mime}
            </div>
            <a
              href={out.url}
              download={`apercu-${bp.title || 'production'}.${out.mime.includes('mp4') ? 'mp4' : 'webm'}`}
              className="text-[12.5px] text-accent underline"
            >
              Télécharger l’aperçu
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────── 15. Social Factory ─────────
export function SocialView() {
  const bp = useActive();
  const r = useRunner();
  const [platform, setPlatform] = useState<string>('TikTok');
  const [issues, setIssues] = useState<string[]>([]);
  if (!bp) return <NoData>Créez d’abord une production (Control Room).</NoData>;
  const pack = bp.social?.[platform];
  const copy = (t: string) => void navigator.clipboard?.writeText(t);
  return (
    <div className="space-y-3" data-testid="studio-social">
      <Card title="Social Factory">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Plateforme</Label>
            <Select
              value={platform}
              onChange={setPlatform}
              options={PLATFORMS.map((x) => ({ value: x, label: x }))}
            />
          </div>
          <Button
            variant="primary"
            disabled={Boolean(r.busy) || !bp.story}
            onClick={async () => {
              const x = await r.run('Rédaction du pack social…', () =>
                generateSocial(bp.project.id, platform),
              );
              if (x) setIssues(x.issues);
            }}
            data-testid="social-generate"
          >
            Générer le pack
          </Button>
          <Badge tone="warn">{AI_LABEL_REMINDER}</Badge>
        </div>
        <BusyBar busy={r.busy} />
        <ErrorBox error={r.error} />
        {issues.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[12px] text-warn">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </Card>
      {!pack ? (
        <NoData>Aucun pack pour {platform}.</NoData>
      ) : (
        <Card title={`Pack ${platform}`} testId="social-pack">
          <div className="space-y-2 text-[12.5px]">
            <div>
              <Label>Hooks</Label>
              <ul>
                {pack.hooks.map((h, i) => (
                  <li key={i}>
                    • {h}{' '}
                    <Button size="sm" variant="ghost" onClick={() => copy(h)}>
                      copier
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Label>Titre</Label>
              {pack.title}
            </div>
            <div>
              <Label>Description</Label>
              {pack.description}
            </div>
            <div>
              <Label>Légende</Label>
              {pack.caption}{' '}
              <Button size="sm" variant="ghost" onClick={() => copy(pack.caption)}>
                copier
              </Button>
            </div>
            <div>
              <Label>Hashtags</Label>
              {pack.hashtags.map((h) => `#${h}`).join(' ')}
            </div>
            <div>
              <Label>Miniature</Label>
              {pack.thumbnail}
            </div>
            <div>
              <Label>Appel à l’action</Label>
              {pack.cta}
            </div>
            <div>
              <Label>Emojis</Label>
              {pack.emojis.join(' ')}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
