// BAC À SABLE · VIDÉO IA — onglet « Vidéo → Scène 3D » (idée de l'utilisateur) : une vidéo (TikTok, téléphone…) garde
// SES pixels et reçoit une carte de profondeur par image ; Three.js en fait une scène 3D (relief, nuage de points,
// hologramme, neige / pluie / poussières dans le volume, brume, re-éclairage) filmée par une caméra virtuelle.
// Sorties : MP4 image par image avec le son d'origine, MP4 RGBD (couleur | profondeur) et page HTML 3D autonome.
// La vidéo ne quitte jamais la machine (seul le modèle de profondeur est téléchargé, une fois).
import { useEffect, useRef, useState } from 'react';
import { Box, Download, FileCode2, Film, Layers, Pause, Play, Sparkles, Video } from 'lucide-react';
import { Button } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import { CAMERA_PRESETS, type CameraPreset } from '../../server/jev/videogen/imageMotion';
import { DEFAULT_SCENE, DEFAULT_SCENE_EFFECTS, SCENE_STYLES, sceneFromPrompt, type DepthTrack, type SceneEffects, type SceneStyle, type VideoSceneSpec } from '../../server/jev/videogen/videoDepth';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import type { Encoded } from '../lib/videogen/encode';
import { analyseClip, camAt, closeClip, lookOf, openClip, openScene, renderRgbdMp4, renderSceneMp4, sceneToHtml, type VideoClip } from '../lib/videogen/videoScene3d';
import { finishFrame } from '../lib/videogen/videoScene';

const FX_LABELS: Record<keyof SceneEffects, string> = { fog: 'Brume', dust: 'Poussières', snow: 'Neige', rain: 'Pluie', relight: 'Re-éclairage', grain: 'Grain', vignette: 'Vignettage', letterbox: 'Bandes cinéma' };
const slugOf = (s: string) => s.replace(/\.[a-z0-9]+$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'video';
type Out = Encoded & { url: string };

export function VideoToScene() {
  const toast = useStore((s) => s.toast);
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [track, setTrack] = useState<DepthTrack | null>(null);
  const [prompt, setPrompt] = useState('Orbite lente autour du sujet, relief marqué');
  const [spec, setSpec] = useState<VideoSceneSpec>({ ...DEFAULT_SCENE, effects: { ...DEFAULT_SCENE_EFFECTS } });
  const [title, setTitle] = useState('');
  const [budget, setBudget] = useState(45);
  const [busy, setBusy] = useState('');
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<Out | null>(null);
  const [rgbd, setRgbd] = useState<Out | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof openScene> | null>(null);
  const drag = useRef({ x: 0, y: 0 });
  const dragStart = useRef<[number, number, number, number] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const full: VideoSceneSpec = { ...spec, title: title ? { text: title, start: 0.4, duration: Math.max(1, Math.min(4, (clip?.duration ?? 5) - 0.5)) } : undefined };
  const fullRef = useRef(full);
  fullRef.current = full;

  const keep = (set: typeof setVideo, r: Encoded) =>
    set((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { ...r, url: URL.createObjectURL(r.blob) };
    });

  const load = async (f: File) => {
    setPlaying(false);
    scene.current?.dispose();
    scene.current = null;
    closeClip(clip);
    setTrack(null);
    setVideo(null);
    setRgbd(null);
    try {
      const c = await openClip(f, f.name);
      if (!c.width || !c.duration) throw new Error('vidéo vide');
      c.el.loop = true;
      setClip(c);
      toast('ok', `Vidéo : ${c.width}×${c.height}, ${c.duration.toFixed(1)} s`);
    } catch (e) {
      toast('err', (e as Error).message);
    }
  };

  const analyse = async () => {
    if (!clip) return;
    setPlaying(false);
    const s = sceneFromPrompt(prompt, spec);
    setSpec(s);
    setBusy('analyse de la profondeur');
    try {
      const tr = await analyseClip(clip, {
        budgetMs: budget * 1000,
        onStatus: (m) => setBusy(m),
        onProgress: (d, t) => setBusy(`profondeur image par image ${Math.round((d / t) * 100)} % (${d}/${t})`),
      });
      setTrack(tr);
      toast('ok', `Profondeur : ${tr.frames.length} cartes (${tr.keyframes} images clés ${tr.source}) en ${(tr.ms / 1000).toFixed(1)} s`);
    } catch (e) {
      toast('err', `Analyse : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const draw = () => {
    const sc = scene.current;
    const c = view.current;
    if (!sc || !c || !clip) return;
    const f = fullRef.current;
    const t = clip.el.currentTime;
    const gl = sc.draw(t, camAt(f, clip.duration ? t / clip.duration : 0, drag.current), lookOf(f));
    finishFrame(c, gl, { title: f.title, vignette: f.effects.vignette, grain: f.effects.grain, letterbox: f.effects.letterbox }, t, Math.round(t * 30));
  };

  useEffect(() => {
    if (!clip || !track) return;
    try {
      scene.current?.dispose();
      scene.current = openScene(clip, track, 720);
      draw();
    } catch (e) {
      toast('err', `Moteur 3D : ${(e as Error).message}`);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [clip, track]);

  useEffect(() => {
    if (!playing || !clip) return;
    let raf = 0;
    void clip.el.play().catch(() => setPlaying(false));
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clip.el.pause();
    };
  }, [playing, clip]);

  // Paused: redraw when a setting changes.
  useEffect(() => {
    if (!playing) draw();
  });

  const exportMp4 = async () => {
    if (!clip || !track) return;
    setPlaying(false);
    setBusy('rendu image par image');
    try {
      const r = await renderSceneMp4(clip, track, full, { onProgress: (d, t) => setBusy(`rendu image par image ${Math.round((d / t) * 100)} %`) });
      keep(setVideo, r);
      toast('ok', `MP4 : ${r.frames} images ${r.width}×${r.height}${r.audio ? `, son ${r.audio}` : ''}, rendu en ${(r.ms / 1000).toFixed(1)} s`);
    } catch (e) {
      toast('err', `Vidéo : ${(e as Error).message}`);
    }
    setBusy('');
    draw();
  };
  const makeRgbd = async (maxSide: number): Promise<Encoded | null> => {
    if (!clip || !track) return null;
    setPlaying(false);
    setBusy('vidéo RGBD (couleur | profondeur)');
    try {
      const r = await renderRgbdMp4(clip, track, { maxSide, audio: spec.audio, onProgress: (d, t) => setBusy(`vidéo RGBD ${Math.round((d / t) * 100)} %`) });
      keep(setRgbd, r);
      return r;
    } catch (e) {
      toast('err', `RGBD : ${(e as Error).message}`);
      return null;
    } finally {
      setBusy('');
      draw();
    }
  };
  const exportHtml = async () => {
    if (!clip || !track) return;
    const r = rgbd ?? (await makeRgbd(720));
    if (!r) return;
    const html = await sceneToHtml(r.blob, { title: title || clip.name.replace(/\.[a-z0-9]+$/i, ''), aspect: clip.width / clip.height, dw: track.w, dh: track.h, spec: full });
    download(`${slugOf(clip.name)}-scene-3d.html`, html, 'text/html');
    toast('ok', `Page HTML 3D : ${(html.length / 1048576).toFixed(1)} Mo (vidéo RGBD intégrée)`);
  };

  const stages = [
    { stage: 'Vidéo', detail: clip ? `${clip.width}×${clip.height} · ${clip.duration.toFixed(1)} s · pixels d’origine conservés` : 'choisir une vidéo (MP4, WebM, MOV)', done: Boolean(clip) },
    { stage: 'Profondeur par image', detail: track ? `${track.frames.length} cartes ${track.w}×${track.h} à ${track.fps} i/s · ${track.keyframes} images clés (${track.source}) · une toutes les ${track.stride} · ${(track.ms / 1000).toFixed(1)} s` : `budget ${budget} s, images clés + flot optique`, done: Boolean(track) },
    { stage: 'Scène 3D', detail: `${SCENE_STYLES[spec.style]} · relief ${Math.round(spec.relief * 100)} %`, done: Boolean(track) },
    { stage: 'Caméra', detail: `${CAMERA_PRESETS[spec.preset]} · intensité ${Math.round(spec.intensity * 100)} % · glisser sur l’aperçu pour la déplacer`, done: Boolean(track) },
    { stage: 'Rendu', detail: video ? `MP4 ${video.width}×${video.height}, ${video.frames} images${video.audio ? `, son ${video.audio}` : ', sans son'}` : '30 i/s image par image, son d’origine', done: Boolean(video) },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(340px,440px)_1fr]">
      <section className="space-y-3">
        <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <input
            ref={file}
            type="file"
            accept="video/*"
            hidden
            data-testid="videogen-video-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void load(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => file.current?.click()}>
              <Video size={13} /> Choisir une vidéo
            </Button>
            <Button size="sm" variant="primary" disabled={!clip || Boolean(busy)} onClick={() => void analyse()} data-testid="videogen-video-analyse">
              <Sparkles size={13} /> Profondeur + scène 3D
            </Button>
          </div>
          <p className="text-faint">La vidéo reste sur votre machine : rien n’est envoyé. Utilisez vos vidéos ou celles dont vous avez les droits.</p>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full rounded-lg border border-line bg-input px-2 py-1.5 outline-none focus:border-accent" placeholder="L’effet voulu (orbite, hologramme, neige, brume, relief marqué…)" />
          <label className="flex items-center gap-2">
            Style
            <select value={spec.style} onChange={(e) => setSpec({ ...spec, style: e.target.value as SceneStyle })} className="h-8 flex-1 rounded-lg border border-line bg-input px-2" aria-label="Style de la scène" data-testid="videogen-video-style">
              {(Object.keys(SCENE_STYLES) as SceneStyle[]).map((k) => (
                <option key={k} value={k}>
                  {SCENE_STYLES[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Caméra
            <select value={spec.preset} onChange={(e) => setSpec({ ...spec, preset: e.target.value as CameraPreset })} className="h-8 flex-1 rounded-lg border border-line bg-input px-2" aria-label="Mouvement de caméra">
              {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((k) => (
                <option key={k} value={k}>
                  {CAMERA_PRESETS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Intensité
            <input type="range" min={0.1} max={1} step={0.05} value={spec.intensity} onChange={(e) => setSpec({ ...spec, intensity: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          </label>
          <label className="flex items-center gap-2">
            Relief
            <input type="range" min={0.05} max={1} step={0.05} value={spec.relief} onChange={(e) => setSpec({ ...spec, relief: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          </label>
          <label className="flex items-center gap-2" title="Saut de profondeur au-delà duquel l’écart entre deux plans est peint avec l’arrière-plan (silhouettes nettes)">
            Bords
            <input type="range" min={0.03} max={0.4} step={0.01} value={spec.cut} onChange={(e) => setSpec({ ...spec, cut: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1">
              Qualité
              <select value={spec.quality} onChange={(e) => setSpec({ ...spec, quality: Number(e.target.value) as VideoSceneSpec['quality'] })} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Qualité de sortie">
                <option value={720}>720p (rapide)</option>
                <option value={1080}>1080p</option>
                <option value={1920}>Originale (≤ 1920)</option>
              </select>
            </label>
            <label className="flex items-center gap-1" title="Temps maximal donné au modèle de profondeur (le rythme des images clés s’y adapte)">
              Budget
              <select value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Budget d’analyse">
                {[15, 30, 45, 90, 180].map((n) => (
                  <option key={n} value={n}>
                    {n} s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={spec.audio} onChange={(e) => setSpec({ ...spec, audio: e.target.checked })} /> Son d’origine
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FX_LABELS) as (keyof SceneEffects)[]).map((k) => (
              <label key={k} className={cx('flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5', spec.effects[k] ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}>
                <input type="checkbox" className="hidden" checked={spec.effects[k]} onChange={(e) => setSpec({ ...spec, effects: { ...spec.effects, [k]: e.target.checked } })} />
                {FX_LABELS[k]}
              </label>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (facultatif)" className="h-8 w-full rounded-lg border border-line bg-input px-2" />
          {busy && (
            <div className="text-accent" data-testid="videogen-video-busy">
              {busy}…
            </div>
          )}
        </div>
        <div className="rounded-xl border border-line bg-panel p-3" data-testid="videogen-video-stages">
          <ol className="space-y-1.5 text-[12.5px]">
            {stages.map((s, i) => (
              <li key={s.stage} className="flex gap-2">
                <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', s.done ? 'bg-accent text-accent-fg' : 'bg-hover text-muted')}>{i + 1}</span>
                <span>
                  <b className="font-semibold">{s.stage}</b> <span className="text-muted">— {s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="flex min-h-[420px] flex-col rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
          <span className="mr-auto px-1 text-[12.5px] font-semibold">Scène 3D (WebGL)</span>
          <Button size="sm" variant="ghost" disabled={!track || Boolean(busy)} onClick={() => setPlaying((p) => !p)} data-testid="videogen-video-play">
            {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Lire'}
          </Button>
          <Button size="sm" variant="ghost" disabled={!track || Boolean(busy)} onClick={() => void makeRgbd(1080)} title="Couleur | profondeur côte à côte dans un seul MP4 (format d’échange pour Blender, Unreal, After Effects)" data-testid="videogen-video-rgbd">
            <Layers size={13} /> MP4 RGBD
          </Button>
          <Button size="sm" variant="ghost" disabled={!track || Boolean(busy)} onClick={() => void exportHtml()} title="Page HTML autonome : la scène 3D se joue dans le navigateur, caméra à la souris" data-testid="videogen-video-html">
            <FileCode2 size={13} /> Page HTML 3D
          </Button>
          <Button size="sm" variant="primary" disabled={!track || Boolean(busy)} onClick={() => void exportMp4()} data-testid="videogen-video-mp4">
            <Film size={13} /> Vidéo MP4
          </Button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2">
          {!clip && (
            <div className="max-w-md text-center text-[13px] text-faint">
              <Box size={28} className="mx-auto mb-2 opacity-60" />
              Choisissez une vidéo : chaque image garde ses pixels et reçoit sa carte de profondeur, puis la scène 3D est filmée par une caméra virtuelle.
            </div>
          )}
          {clip && !track && <div className="text-center text-[13px] text-faint">{busy ? `${busy}…` : 'Lancez « Profondeur + scène 3D ».'}</div>}
          <canvas
            ref={view}
            data-testid="videogen-video-preview"
            className={cx('max-h-[70vh] max-w-full cursor-grab touch-none', !track && 'hidden')}
            onPointerDown={(e) => {
              dragStart.current = [e.clientX, e.clientY, drag.current.x, drag.current.y];
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const s = dragStart.current;
              if (!s) return;
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = { x: s[2] + ((e.clientX - s[0]) / r.width) * 0.12, y: s[3] + ((e.clientY - s[1]) / r.height) * 0.08 };
              if (!playing) draw();
            }}
            onPointerUp={() => (dragStart.current = null)}
            onDoubleClick={() => {
              drag.current = { x: 0, y: 0 };
              if (!playing) draw();
            }}
          />
        </div>
        {(video || rgbd) && (
          <div className="space-y-2 border-t border-line p-2">
            {video && (
              <div className="flex flex-wrap items-center gap-3" data-testid="videogen-video-result">
                <video src={video.url} controls className="h-28 rounded-lg bg-black" />
                <div className="text-[12px] text-muted">
                  MP4 {video.codec}
                  {video.audio ? ` + ${video.audio}` : ''} · {video.width}×{video.height} · {video.frames} images · {(video.blob.size / 1048576).toFixed(1)} Mo · rendu {(video.ms / 1000).toFixed(1)} s
                </div>
                <a href={video.url} download={`${slugOf(clip?.name ?? 'video')}-scene-3d.mp4`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg" data-testid="videogen-video-download">
                  <Download size={13} /> Télécharger le MP4
                </a>
              </div>
            )}
            {rgbd && (
              <div className="flex flex-wrap items-center gap-3" data-testid="videogen-video-rgbd-result">
                <video src={rgbd.url} controls className="h-20 rounded-lg bg-black" />
                <div className="text-[12px] text-muted">
                  RGBD {rgbd.width}×{rgbd.height} (couleur | profondeur) · {(rgbd.blob.size / 1048576).toFixed(1)} Mo
                </div>
                <a href={rgbd.url} download={`${slugOf(clip?.name ?? 'video')}-rgbd.mp4`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px]">
                  <Download size={13} /> RGBD
                </a>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
