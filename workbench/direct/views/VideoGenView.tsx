// BAC À SABLE · VIDÉO IA — « Image / Idée → Scène 3D → Animation → Vidéo ».
//  · Image → vidéo : profondeur (Depth Anything V2 local), parallaxe 2.5D avec occultations, mouvements eulériens
//    en boucle (eau, nuages, pinceau de mouvement), atmosphère, titre → MP4 image par image.
//  · Idée / texte / storyboard (+ image de référence) → plan de scène compris par le modèle (ou par les règles sans
//    clé) → personnages articulés, décor, caméra → rendu HTML/WebGL (aperçu, MP4, page HTML autonome) et Blender
//    (pont local ou script .py, exports USD / glTF).
//  · Vidéo → scène 3D : pixels d'origine + carte de profondeur par image (VideoSceneMode.tsx).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, FileCode2, Film, ImagePlus, Pause, Play, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '../../web/components/ui';
import { cx, fmtCost, shortModel } from '../../web/lib/format';
import {
  CAMERA_PRESETS,
  DEFAULT_EFFECTS,
  motionField,
  outputSize,
  regionMasks,
  suggestFromPrompt,
  type CameraPreset,
  type Effects,
  type ImageMotionSpec,
  type Stroke,
} from '../../server/jev/videogen/imageMotion';
import { LOOKS, heuristicPlan, parsePlan, pipelineSummary, plannerSystem, type ScenePlan, type VideoFormat } from '../../server/jev/videogen/plan';
import { planToBpy } from '../../server/jev/videogen/bpy';
import { complete } from '../lib/llm';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { bridgeHealth, bridgeRender, BRIDGE_HELP } from '../lib/blenderBridge';
import { estimateDepth, type DepthMap } from '../lib/videogen/depth';
import { ImageAnimator, composeFrame } from '../lib/videogen/imageGL';
import { encodeMp4, type Encoded } from '../lib/videogen/encode';
import { openDirector, planToHtml, renderPlanVideo, sizeOf, type Quality } from '../lib/videogen/htmlVideo';
import { PageHeader } from './PageHeader';
import { VideoToScene } from './VideoSceneMode';
import { projectDepth, projectImages, type ProjectImage } from '../lib/videogen/projectImages';
import { imageSceneHtml } from '../lib/videogen/videoScene3d';

type Mode = 'image' | 'idea' | 'video';
const LOOK_LABELS: Record<(typeof LOOKS)[number], string> = { cinematic: 'Cinéma', cartoon: 'Dessin animé', lowpoly: 'Low poly', clay: 'Pâte à modeler', neon: 'Néon' };
const EFFECT_LABELS: Record<keyof Effects, string> = { clouds: 'Nuages', water: 'Eau', rain: 'Pluie', snow: 'Neige', dust: 'Poussières', fog: 'Brume', rays: 'Rayons', grain: 'Grain', vignette: 'Vignettage', letterbox: 'Bandes cinéma' };
const slugOf = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'video';

function Stages({ items }: { items: { stage: string; detail: string; done: boolean }[] }) {
  return (
    <ol className="space-y-1" data-testid="videogen-stages">
      {items.map((s, i) => (
        <li key={s.stage} className="flex gap-2 text-[12.5px]">
          <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', s.done ? 'bg-ok/20 text-ok' : 'bg-hover text-faint')}>{s.done ? '✓' : i + 1}</span>
          <span>
            <b>{s.stage}</b> <span className="text-muted">{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function VideoGenView() {
  const [mode, setMode] = useState<Mode>('idea');
  return (
    <div className="h-full overflow-auto" data-testid="videogen">
      <div className="mx-auto max-w-[1500px] space-y-3 p-3 sm:p-4">
        <PageHeader
          title="Bac à sable · Vidéo IA"
          subtitle="Image, vidéo, idée, texte ou storyboard → scène 3D → animation → vidéo MP4. Rendu HTML/WebGL image par image (fluide, rapide), Blender pour la haute qualité."
        />
        <div className="flex gap-1" role="tablist" aria-label="Entrée">
          {(
            [
              ['idea', 'Idée / texte / storyboard → 3D'],
              ['image', 'Image → vidéo'],
              ['video', 'Vidéo → scène 3D'],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cx('rounded-lg px-3 py-1.5 text-[13px] font-medium', mode === m ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover')} data-testid={`videogen-mode-${m}`}>
              {l}
            </button>
          ))}
        </div>
        {mode === 'idea' ? <IdeaToVideo /> : mode === 'image' ? <ImageToVideo /> : <VideoToScene />}
      </div>
    </div>
  );
}

// ── Idée → scène 3D ──────────────────────────────────────────────────────────────────────────────────────────────
function IdeaToVideo() {
  const models = useStore((s) => s.models);
  const defaultModel = useStore((s) => s.settings.defaultModel);
  const [text, setText] = useState('Vidéo de 15 secondes : à Dakar au coucher du soleil, Awa et Moussa marchent vers la caméra, se saluent puis célèbrent ; titre « Ecobank 2030 ».');
  const [seconds, setSeconds] = useState(15);
  const [format, setFormat] = useState<VideoFormat>('16:9');
  const [look, setLook] = useState<(typeof LOOKS)[number] | ''>('');
  const [model, setModel] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const [planJson, setPlanJson] = useState('');
  const [busy, setBusy] = useState('');
  const [quality, setQuality] = useState<Quality>('draft');
  const [video, setVideo] = useState<(Encoded & { url: string }) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [cost, setCost] = useState(0);
  const [bridge, setBridge] = useState<boolean | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const dir = useRef<ReturnType<typeof openDirector> | null>(null);
  const frame = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const toast = useStore((s) => s.toast);

  const pickModel = () => model || (defaultModel && defaultModel !== 'auto' ? defaultModel : (models.find((x) => /claude-sonnet|gpt-5|gemini-2\.5-pro|qwen3/i.test(x.id))?.id ?? models[0]?.id ?? ''));
  useEffect(() => {
    void bridgeHealth().then((h) => setBridge(Boolean(h)));
    return () => dir.current?.dispose();
  }, []);

  // Live preview: the HTML director, frame by frame.
  useEffect(() => {
    dir.current?.dispose();
    dir.current = null;
    setRendered(false);
    if (!plan || !host.current) return;
    try {
      const d = openDirector(plan, { fps: 30, quality: 'draft' });
      dir.current = d;
      d.canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000';
      host.current.replaceChildren(d.canvas);
      frame.current = 0;
      d.render(0);
      setRendered(true);
    } catch (e) {
      toast('err', `Aperçu 3D : ${(e as Error).message}`);
    }
  }, [plan, toast]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      const d = dir.current;
      if (!d) return;
      if (ts - last >= 1000 / 30) {
        last = ts;
        frame.current = (frame.current + 1) % d.frames;
        d.render(frame.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const understand = async () => {
    setBusy('compréhension de l’intention');
    setVideo(null);
    const opts = { seconds, format };
    let p: ScenePlan | null = null;
    const m = pickModel();
    if (m) {
      try {
        const content = ref
          ? [{ type: 'text' as const, text: `${text}\n\nDurée : ${seconds} s. Format : ${format}.${look ? ` Look : ${look}.` : ''} Image de référence jointe : reconstruis sa scène et anime-la.` }, { type: 'image_url' as const, image_url: { url: ref } }]
          : `${text}\n\nDurée : ${seconds} s. Format : ${format}.${look ? ` Look : ${look}.` : ''}`;
        const r = await complete({ model: m, messages: [{ role: 'system', content: plannerSystem() }, { role: 'user', content }], maxTokens: 6000, temperature: 0.4 }, { models, fallbacks: [], effort: 'auto', purpose: 'video-plan' });
        setCost((c) => c + r.cost);
        p = parsePlan(r.content, opts);
        if (!p) toast('info', 'Le modèle n’a pas rendu un plan lisible : plan construit par les règles.');
      } catch (e) {
        toast('info', `Modèle indisponible (${(e as Error).message}) : plan construit par les règles.`);
      }
    }
    p ??= heuristicPlan(text, { ...opts, look: look || undefined, kind: ref ? 'image' : /plan \d|sc[eè]ne \d|storyboard/i.test(text) ? 'storyboard' : 'idea' });
    if (look) p = { ...p, style: { ...p.style, look } };
    setPlan(p);
    setPlanJson(JSON.stringify(p, null, 2));
    setBusy('');
  };

  const applyJson = () => {
    try {
      const p = parsePlan(planJson, { seconds, format });
      if (!p) throw new Error('JSON illisible');
      setPlan(p);
      toast('ok', 'Plan appliqué');
    } catch (e) {
      toast('err', `Plan : ${(e as Error).message}`);
    }
  };

  const mp4 = async () => {
    if (!plan) return;
    setPlaying(false);
    setBusy('rendu HTML/WebGL image par image');
    try {
      const r = await renderPlanVideo(plan, { fps: 30, quality, onProgress: (d, t) => setBusy(`rendu image par image ${Math.round((d / t) * 100)} %`) });
      setVideo((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { ...r, url: URL.createObjectURL(r.blob) };
      });
      toast('ok', `MP4 : ${r.frames} images, ${r.seconds.toFixed(1)} s, ${r.width}×${r.height}, rendu en ${(r.ms / 1000).toFixed(1)} s`);
    } catch (e) {
      toast('err', `Vidéo : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const blender = async () => {
    if (!plan) return;
    const [w, h] = sizeOf(plan, quality);
    const script = planToBpy(plan, { fps: 24, exports: ['glb', 'usd'] });
    if (!bridge) {
      download(`${slugOf(plan.title)}.blender.py`, script, 'text/x-python');
      toast('info', 'Pont Blender non détecté : script .py téléchargé (Blender → Scripting → Ouvrir → Exécuter, ou scripts/blender-render.py).');
      return;
    }
    setBusy('rendu Blender');
    try {
      const r = await bridgeRender({ script, name: slugOf(plan.title), seconds: plan.seconds, fps: 24, width: w, height: h, engine: 'EEVEE' }, { onProgress: (f, t, st) => setBusy(`Blender · ${st} ${f}/${t}`), maxWaitMs: 3 * 3600_000 });
      if (r.video) download(`${slugOf(plan.title)}-blender.mp4`, r.video, 'video/mp4');
      toast('ok', `Blender ${r.report.blender} : ${r.report.frames} images en ${r.report.render_time_s} s (${r.report.engine})`);
    } catch (e) {
      toast('err', `Blender : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const stages = useMemo(() => (plan ? pipelineSummary(plan).map((s, i) => ({ ...s, done: i < 6 ? true : Boolean(video) })) : []), [plan, video]);
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(340px,460px)_1fr]">
      <section className="space-y-3">
        <div className="rounded-xl border border-line bg-panel p-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="block w-full resize-y rounded-lg border border-line bg-input px-3 py-2 text-[14px] outline-none focus:border-accent" placeholder="Une idée, un concept, une description ou un storyboard (Plan 1 : … Plan 2 : …)" data-testid="videogen-text" />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            <label className="flex items-center gap-1">
              Durée
              <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Durée">
                {[5, 8, 10, 15, 20, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Format">
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Look
              <select value={look} onChange={(e) => setLook(e.target.value as typeof look)} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Look">
                <option value="">Auto</option>
                {LOOKS.map((l) => (
                  <option key={l} value={l}>
                    {LOOK_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
            <select aria-label="Modèle" value={model} onChange={(e) => setModel(e.target.value)} className="ml-auto h-8 max-w-[200px] rounded-lg border border-line bg-input px-2">
              <option value="">Modèle par défaut ({pickModel() ? shortModel(pickModel()) : 'règles sans clé'})</option>
              {models.slice(0, 300).map((m) => (
                <option key={m.id} value={m.id}>
                  {shortModel(m.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const r = new FileReader();
                r.onload = () => setRef(String(r.result));
                r.readAsDataURL(f);
              }}
            />
            <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
              <ImagePlus size={13} /> Image de référence (facultatif)
            </Button>
            {ref && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-hover px-2 py-0.5 text-[12px]">
                <img src={ref} alt="" className="h-6 w-6 rounded object-cover" /> image jointe
                <button aria-label="Retirer l’image" onClick={() => setRef(null)}>
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!text.trim() || Boolean(busy)} onClick={() => void understand()} data-testid="videogen-plan">
              <Sparkles size={14} /> Comprendre et mettre en scène
            </Button>
          </div>
          {busy && <div className="mt-2 text-[12px] text-accent">{busy}…</div>}
          {cost > 0 && <div className="mt-1 text-[11.5px] text-faint">Coût mesuré : {fmtCost(cost)}</div>}
        </div>
        {plan && (
          <div className="rounded-xl border border-line bg-panel p-3">
            <div className="mb-2 text-[13px] font-semibold">Pipeline de production</div>
            <Stages items={stages} />
            <div className="mt-3 space-y-1 text-[12px]" data-testid="videogen-shots">
              {plan.shots.map((s, i) => (
                <div key={s.id} className="rounded-lg bg-hover/60 px-2 py-1">
                  <b>Plan {i + 1}</b> · {s.start.toFixed(1)}–{(s.start + s.duration).toFixed(1)} s · caméra {s.camera.move} {s.camera.lens} mm → {s.camera.target === 'scene' ? 'ensemble' : (plan.characters.find((c) => c.id === s.camera.target)?.name ?? s.camera.target)}
                  <div className="text-muted">{s.actions.map((a) => `${plan.characters.find((c) => c.id === a.who)?.name ?? a.who} : ${a.action}${a.emotion !== 'neutral' ? ` (${a.emotion})` : ''}`).join(' · ') || 'décor seul'}</div>
                </div>
              ))}
            </div>
            <details className="mt-2 text-[12px]">
              <summary className="cursor-pointer text-muted">Plan détaillé (JSON modifiable)</summary>
              <textarea value={planJson} onChange={(e) => setPlanJson(e.target.value)} rows={12} spellCheck={false} className="mt-2 w-full rounded-lg border border-line bg-code p-2 font-mono text-[11px]" />
              <Button size="sm" onClick={applyJson}>
                <Wand2 size={13} /> Appliquer
              </Button>
            </details>
          </div>
        )}
      </section>
      <section className="flex min-h-[420px] flex-col rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
          <span className="mr-auto px-1 text-[12.5px] font-semibold">{plan ? plan.title : 'Aperçu 3D (HTML/WebGL)'}</span>
          <select aria-label="Qualité" value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className="h-7 rounded-lg border border-line bg-input px-2 text-[12px]">
            <option value="draft">Rapide (½ résolution)</option>
            <option value="final">Final (1080p, occlusion, ombres 4K)</option>
          </select>
          <Button size="sm" variant="ghost" disabled={!rendered} onClick={() => setPlaying((p) => !p)} data-testid="videogen-play">
            {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Lire'}
          </Button>
          <Button size="sm" variant="primary" disabled={!plan || Boolean(busy)} onClick={() => void mp4()} data-testid="videogen-mp4">
            <Film size={13} /> Vidéo MP4
          </Button>
          <Button size="sm" variant="ghost" disabled={!plan} onClick={() => plan && download(`${slugOf(plan.title)}.html`, planToHtml(plan), 'text/html')} title="Page HTML autonome : lecture, curseur, export MP4" data-testid="videogen-html">
            <FileCode2 size={13} /> Page HTML
          </Button>
          <Button size="sm" variant="ghost" disabled={!plan || Boolean(busy)} onClick={() => void blender()} title={bridge ? 'Rendu dans votre Blender (pont local)' : `${BRIDGE_HELP}`} data-testid="videogen-blender">
            <Clapperboard size={13} /> {bridge ? 'Blender HQ' : 'Script Blender'}
          </Button>
        </div>
        <div className="relative min-h-0 flex-1 bg-black" ref={host} data-testid="videogen-preview">
          {!plan && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-faint">Décrivez votre vidéo puis « Comprendre et mettre en scène » : le décor, les personnages et la caméra apparaîtront ici.</div>}
        </div>
        {video && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-2" data-testid="videogen-video">
            <video src={video.url} controls className="h-28 rounded-lg bg-black" />
            <div className="text-[12px] text-muted">
              MP4 {video.codec} · {video.width}×{video.height} · {video.frames} images · {video.seconds.toFixed(1)} s · {(video.blob.size / 1048576).toFixed(1)} Mo · rendu en {(video.ms / 1000).toFixed(1)} s
            </div>
            <a href={video.url} download={`${slugOf(plan?.title ?? 'video')}.mp4`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg" data-testid="videogen-download">
              <Download size={13} /> Télécharger le MP4
            </a>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Image → vidéo ────────────────────────────────────────────────────────────────────────────────────────────────
function ImageToVideo() {
  const toast = useStore((s) => s.toast);
  const [img, setImg] = useState<HTMLCanvasElement | null>(null);
  const [depth, setDepth] = useState<DepthMap | null>(null);
  const [prompt, setPrompt] = useState('Travelling avant lent, nuages qui défilent, lumière du soir');
  const [spec, setSpec] = useState<ImageMotionSpec>({ seconds: 8, fps: 30, format: 'image', preset: 'travelling_avant', intensity: 0.6, effects: { ...DEFAULT_EFFECTS }, loop: 6 });
  const [title, setTitle] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [busy, setBusy] = useState('');
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<(Encoded & { url: string }) | null>(null);
  const [regions, setRegions] = useState<{ sky: number; water: number } | null>(null);
  const [orig, setOrig] = useState<{ blob: Blob; width: number; height: number; name: string } | null>(null);
  const [gallery, setGallery] = useState(false);
  const [gKind, setGKind] = useState<ProjectImage['kind']>('décor');
  const [gFilter, setGFilter] = useState('');
  const project = useMemo(() => projectImages(), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = useRef<ImageAnimator | null>(null);
  const masks = useRef<{ sky: Uint8Array; water: Uint8Array; w: number; h: number } | null>(null);
  const drawing = useRef<[number, number][] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const t0 = useRef(0);
  const full: ImageMotionSpec = { ...spec, title: title ? { text: title, start: 0.6, duration: Math.min(4, spec.seconds - 1) } : undefined };

  const load = async (f: Blob, name = 'image') => {
    const bmp = await createImageBitmap(f);
    setOrig({ blob: f, width: bmp.width, height: bmp.height, name });
    const max = 2048;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    setImg(c);
    setDepth(null);
    setVideo(null);
    setStrokes([]);
    return c;
  };

  // An image of the project: its pixels, and its depth map when the project already has one (instant).
  const pick = async (p: ProjectImage) => {
    setBusy(`chargement de « ${p.name} »`);
    try {
      const blob = await (await fetch(p.src)).blob();
      const c = await load(blob, p.name);
      setGallery(false);
      if (p.depth) await analyse(c, await projectDepth(p.depth));
    } catch (e) {
      toast('err', `Image du projet : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const analyse = async (source: HTMLCanvasElement | null = img, given?: DepthMap) => {
    if (!source) return;
    const img = source;
    setBusy('analyse de l’image');
    const d = given ?? (await estimateDepth(img, { onStatus: (s) => setBusy(s) }));
    setDepth(d);
    // Regions on the depth resolution.
    const c = document.createElement('canvas');
    c.width = d.w;
    c.height = d.h;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, d.w, d.h);
    const rgba = g.getImageData(0, 0, d.w, d.h).data;
    const r = regionMasks(rgba, d.w, d.h, d.data);
    masks.current = { sky: r.sky, water: r.water, w: d.w, h: d.h };
    setRegions({ sky: r.skyShare, water: r.waterShare });
    const s = suggestFromPrompt(prompt);
    setSpec((x) => ({ ...x, preset: s.preset, intensity: s.intensity, effects: { ...x.effects, ...s.effects, clouds: r.skyShare > 0.03 && s.effects.clouds !== false, water: r.waterShare > 0.02 } }));
    setBusy('');
    toast('ok', `Profondeur : ${d.source} (${d.ms} ms) · ciel ${(r.skyShare * 100).toFixed(0)} % · eau ${(r.waterShare * 100).toFixed(0)} %`);
  };

  // (Re)build the GPU animator when the picture, depth, strokes or effects change.
  useEffect(() => {
    if (!img || !depth || !canvas.current) return;
    try {
      anim.current ??= new ImageAnimator(canvas.current);
      const a = anim.current;
      const [W, H] = outputSize(spec.format, img.width, img.height);
      const k = Math.min(1, 1280 / Math.max(W, H));
      a.setSize(Math.round(W * k), Math.round(H * k));
      a.setImage(img);
      a.setDepth(depth);
      const m = masks.current;
      const fw = m?.w ?? 256;
      const fh = m?.h ?? 256;
      a.setFlow({ data: motionField(fw, fh, { sky: m?.sky, water: m?.water, strokes, clouds: spec.effects.clouds, waterOn: spec.effects.water }), w: fw, h: fh });
      a.render(full, 0);
    } catch (e) {
      toast('err', `Moteur GPU : ${(e as Error).message}`);
    }
  }, [img, depth, strokes, spec.format, spec.effects.clouds, spec.effects.water]);

  useEffect(() => {
    if (!playing || !anim.current) return;
    let raf = 0;
    t0.current = performance.now();
    const loop = (ts: number) => {
      const t = ((ts - t0.current) / 1000) % spec.seconds;
      anim.current!.render(full, t, Math.floor(t * 30));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const exportMp4 = async () => {
    if (!img || !depth) return;
    setPlaying(false);
    setBusy('rendu image par image');
    const out = document.createElement('canvas');
    const work = document.createElement('canvas');
    try {
      const a = new ImageAnimator(work);
      const [W, H] = outputSize(spec.format, img.width, img.height);
      a.setSize(W, H);
      a.setImage(img);
      a.setDepth(depth);
      const m = masks.current;
      const fw = m?.w ?? 256;
      const fh = m?.h ?? 256;
      a.setFlow({ data: motionField(fw, fh, { sky: m?.sky, water: m?.water, strokes, clouds: spec.effects.clouds, waterOn: spec.effects.water }), w: fw, h: fh });
      const frames = Math.round(spec.seconds * spec.fps);
      const r = await encodeMp4({
        width: W,
        height: H,
        fps: spec.fps,
        frames,
        draw: (i) => {
          a.render(full, i / spec.fps, i);
          return composeFrame(out, work, full, i / spec.fps);
        },
        onProgress: (d, t) => setBusy(`rendu image par image ${Math.round((d / t) * 100)} %`),
      });
      setVideo((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { ...r, url: URL.createObjectURL(r.blob) };
      });
      toast('ok', `MP4 : ${r.frames} images, ${r.width}×${r.height}, rendu en ${(r.ms / 1000).toFixed(1)} s`);
    } catch (e) {
      toast('err', `Vidéo : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const exportPage = async () => {
    if (!depth || !orig) return;
    setBusy('page HTML 3D autonome');
    try {
      const camera = spec.preset === 'orbite' ? 'orbite' : spec.preset === 'fixe_vivant' ? 'fixe' : 'travelling';
      const html = await imageSceneHtml(orig.blob, orig, depth, {
        title: title || orig.name,
        seconds: spec.seconds,
        look: { style: 'relief', relief: 0.5, cut: 0.12, fog: spec.effects.fog, relight: false, dust: spec.effects.dust, snow: spec.effects.snow, rain: spec.effects.rain },
        camera,
      });
      download(`${slugOf(orig.name)}-scene-3d.html`, html, 'text/html');
      toast('ok', `Page HTML 3D autonome : ${(html.length / 1048576).toFixed(1)} Mo (image d’origine, profondeur, three.js et export MP4 intégrés)`);
    } catch (e) {
      toast('err', `Page HTML : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const stages = [
    { stage: 'Analyse', detail: depth ? `profondeur ${depth.source}${regions ? ` · ciel ${(regions.sky * 100).toFixed(0)} % · eau ${(regions.water * 100).toFixed(0)} %` : ''}` : 'image → profondeur, ciel, eau', done: Boolean(depth) },
    { stage: 'Scène 2.5D', detail: depth ? `${depth.w}×${depth.h} couches de profondeur, occultations` : '—', done: Boolean(depth) },
    { stage: 'Mouvement', detail: `${CAMERA_PRESETS[spec.preset]} · intensité ${Math.round(spec.intensity * 100)} %${strokes.length ? ` · ${strokes.length} flèche(s)` : ''}`, done: Boolean(depth) },
    { stage: 'Effets', detail: (Object.keys(spec.effects) as (keyof Effects)[]).filter((k) => spec.effects[k]).map((k) => EFFECT_LABELS[k]).join(', ') || 'aucun', done: Boolean(depth) },
    { stage: 'Rendu', detail: video ? `MP4 ${video.width}×${video.height}, ${video.frames} images` : `${spec.seconds} s à ${spec.fps} i/s`, done: Boolean(video) },
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(340px,440px)_1fr]">
      <section className="space-y-3">
        <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            data-testid="videogen-image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void load(f, f.name.replace(/\.[a-z0-9]+$/i, ''));
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => file.current?.click()}>
              <ImagePlus size={13} /> Choisir une image
            </Button>
            <Button size="sm" variant="primary" disabled={!img || Boolean(busy)} onClick={() => void analyse()} data-testid="videogen-analyse">
              <Sparkles size={13} /> Analyser et animer
            </Button>
            {project.length > 0 && (
              <Button size="sm" variant={gallery ? 'primary' : 'ghost'} onClick={() => setGallery((g) => !g)} data-testid="videogen-project">
                Images du projet ({project.length})
              </Button>
            )}
          </div>
          {gallery && (
            <div className="space-y-2 rounded-lg border border-line p-2" data-testid="videogen-project-gallery">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['décor', 'personnage', 'galerie'] as const).map((k) => (
                  <button key={k} onClick={() => setGKind(k)} className={cx('rounded-full border px-2 py-0.5 capitalize', gKind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}>
                    {k}s ({project.filter((p) => p.kind === k).length})
                  </button>
                ))}
                <input value={gFilter} onChange={(e) => setGFilter(e.target.value)} placeholder="Chercher (Marché, Plage…)" className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-input px-2" aria-label="Chercher une image du projet" />
              </div>
              <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-auto sm:grid-cols-4">
                {project
                  .filter((p) => p.kind === gKind && p.name.toLowerCase().includes(gFilter.toLowerCase()))
                  .slice(0, 48)
                  .map((p) => (
                    <button key={p.id} onClick={() => void pick(p)} disabled={Boolean(busy)} className="group overflow-hidden rounded-md border border-line text-left hover:border-accent" title={p.name} data-testid="videogen-project-item">
                      <img src={p.src} alt={p.name} loading="lazy" className="aspect-video w-full bg-black object-cover" />
                      <span className="block truncate px-1 py-0.5 text-[11px]">
                        {p.name}
                        {p.depth ? ' · 3D prête' : ''}
                      </span>
                    </button>
                  ))}
              </div>
              <p className="text-faint">Les images de votre projet Vidéo 3D, embarquées dans l’app (jamais publiées). Les décors ont déjà leur carte de profondeur.</p>
            </div>
          )}
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full rounded-lg border border-line bg-input px-2 py-1.5 outline-none focus:border-accent" placeholder="Le mouvement voulu (travelling, orbite, pluie, brume…)" />
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
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1">
              Durée
              <select value={spec.seconds} onChange={(e) => setSpec({ ...spec, seconds: Number(e.target.value) })} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Durée de la vidéo">
                {[4, 6, 8, 10, 15, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} s
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Format
              <select value={spec.format} onChange={(e) => setSpec({ ...spec, format: e.target.value as ImageMotionSpec['format'] })} className="h-8 rounded-lg border border-line bg-input px-2" aria-label="Format de la vidéo">
                <option value="image">Celui de l’image</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EFFECT_LABELS) as (keyof Effects)[]).map((k) => (
              <label key={k} className={cx('flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5', spec.effects[k] ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}>
                <input type="checkbox" className="hidden" checked={spec.effects[k]} onChange={(e) => setSpec({ ...spec, effects: { ...spec.effects, [k]: e.target.checked } })} />
                {EFFECT_LABELS[k]}
              </label>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (facultatif)" className="h-8 w-full rounded-lg border border-line bg-input px-2" />
          <p className="text-faint">Pinceau de mouvement : tracez des flèches sur l’aperçu (ce que vous dessinez se met à couler dans ce sens).{strokes.length > 0 && <button className="ml-1 text-accent" onClick={() => setStrokes([])}>Effacer les flèches</button>}</p>
          {busy && <div className="text-accent">{busy}…</div>}
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <Stages items={stages} />
        </div>
      </section>
      <section className="flex min-h-[420px] flex-col rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
          <span className="mr-auto px-1 text-[12.5px] font-semibold">Aperçu (GPU)</span>
          <Button size="sm" variant="ghost" disabled={!depth} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Lire'}
          </Button>
          <Button size="sm" variant="ghost" disabled={!depth || !orig || Boolean(busy)} onClick={() => void exportPage()} title="Un seul fichier HTML, hors ligne : l’image d’origine, sa profondeur, la caméra à la souris et l’export MP4" data-testid="videogen-image-html">
            <FileCode2 size={13} /> Page HTML 3D
          </Button>
          <Button size="sm" variant="primary" disabled={!depth || Boolean(busy)} onClick={() => void exportMp4()} data-testid="videogen-image-mp4">
            <Film size={13} /> Vidéo MP4
          </Button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2">
          {!img && <div className="text-center text-[13px] text-faint">Choisissez une image : elle sera analysée (profondeur, ciel, eau) puis animée.</div>}
          {img && !depth && <img src={img.toDataURL('image/jpeg', 0.8)} alt="" className="max-h-full max-w-full object-contain" />}
          <canvas
            ref={canvas}
            className={cx('max-h-full max-w-full cursor-crosshair', !depth && 'hidden')}
            onPointerDown={(e) => (drawing.current = [pos(e)])}
            onPointerMove={(e) => drawing.current && drawing.current.push(pos(e))}
            onPointerUp={() => {
              const pts = drawing.current;
              drawing.current = null;
              if (pts && pts.length > 2) setStrokes((s) => [...s, { points: pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1), strength: 1 }]);
            }}
          />
        </div>
        {video && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-2" data-testid="videogen-image-video">
            <video src={video.url} controls className="h-28 rounded-lg bg-black" />
            <div className="text-[12px] text-muted">
              MP4 {video.codec} · {video.width}×{video.height} · {video.frames} images · {(video.blob.size / 1048576).toFixed(1)} Mo
            </div>
            <a href={video.url} download="image-animee.mp4" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg">
              <Download size={13} /> Télécharger le MP4
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
