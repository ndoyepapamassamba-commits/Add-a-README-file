// CIRCUIT VIDÉO (23/10/2026) — a one-minute film of the troupe with the user's own OpenRouter credit:
// scene of the new troupe → script written by a vision model that looks at the scene → one image per plan (image model,
// the scene as reference, 9:16) → every clip at once (Grok Imagine, Seedance, Kling, Veo…: the plan image pinned as the
// first frame, lines spoken in French by the right character) → montage with captions → MP4. Prices are read live
// from OpenRouter, shown before anything is paid, and a HARD cap stops any call that would exceed it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Film, ImagePlus, Play, RefreshCw, Square, Wand2 } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Toggle } from '../../web/components/ui';
import { cx } from '../../web/lib/format';
import { kv, saveLater } from '../lib/db';
import { getKey } from '../lib/llm';
import { refreshCredits } from '../lib/credits';
import { useStore } from '../lib/store';
import { listVideoModels } from '../lib/film/api';
import {
  Budget,
  BudgetError,
  CADRAGES,
  canPinFirstFrame,
  captionCues,
  DIMS,
  estimateFilm,
  fmtUsd,
  IMAGE_MODELS,
  planLayout,
  sortVideoModels,
  WORDS_PER_S,
  type Line,
  type VideoModel,
} from '../lib/film/circuit';
import { montage } from '../lib/film/montage';
import {
  DEFAULT_SETTINGS,
  newProject,
  pendingJobs,
  stepImages,
  stepScript,
  stepShoot,
  type FilmProject,
  type ShotState,
} from '../lib/film/run';
import { importedScene, loadTroupePack, PACK_FILE, type TroupeScene } from '../lib/film/troupe';

const KV = 'film.projet';
const STEP_LABEL: Record<ShotState['step'], string> = {
  attente: 'en attente',
  image: 'image en cours',
  envoi: 'envoi',
  pending: 'dans la file',
  in_progress: 'tournage',
  completed: 'terminé',
  failed: 'échec',
  cancelled: 'annulé',
  expired: 'expiré',
};
const linesToText = (l: Line[]) => l.map((r) => `${r.qui} : ${r.texte}`).join('\n');
const textToLines = (t: string): Line[] =>
  t
    .split('\n')
    .map((x) => /^\s*([^:]{1,40}?)\s*:\s*(.+)$/.exec(x))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ qui: m[1]!.trim().toUpperCase(), texte: m[2]!.trim() }));

interface Confirm {
  label: string;
  usd: number;
  run: () => Promise<void>;
}

function Step({
  n,
  title,
  children,
  right,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-xl border border-line bg-panel p-4" data-testid={`film-step-${n}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[12px] text-accent">
            {n}
          </span>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function FilmCircuitView() {
  const toast = useStore((s) => s.toast);
  const credits = useStore((s) => s.credits);
  const [scenes, setScenes] = useState<TroupeScene[]>([]);
  const [packMissing, setPackMissing] = useState(false);
  const [models, setModels] = useState<VideoModel[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [p, setP] = useState<FilmProject | null>(null);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [mont, setMont] = useState<{ ratio: number; text: string } | null>(null);
  const [filmUrl, setFilmUrl] = useState('');
  const [imp, setImp] = useState({ nom: '', acteurs: '' });
  const abort = useRef<AbortController | null>(null);
  // the project lives in a ref updated synchronously (steps chained in one click read it at once), mirrored in state
  const live = useRef<FilmProject | null>(null);
  const resumed = useRef(false);
  const mut = (fn: (x: FilmProject | null) => FilmProject | null) => {
    live.current = fn(live.current);
    setP(live.current);
  };

  // ── load: troupe pack, live video models, saved project ──
  useEffect(() => {
    void loadTroupePack().then((pack) => {
      if (pack?.scenes.length) setScenes(pack.scenes);
      else setPackMissing(true);
    });
    void listVideoModels()
      .then((l) => setModels(sortVideoModels(l.filter(canPinFirstFrame))))
      .catch((e: Error) => setModelsError(e.message));
    void kv.get<{ project: FilmProject; imported?: TroupeScene[] }>(KV).then((saved) => {
      if (saved?.imported?.length)
        setScenes((s) => [...s, ...saved.imported!.filter((x) => !s.some((y) => y.id === x.id))]);
      if (saved?.project) mut(() => saved.project);
    });
    void refreshCredits();
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!p) return;
    const imported = scenes.filter((s) => s.id.startsWith('import-'));
    saveLater(KV, () => ({ project: live.current, imported }));
  }, [p, scenes]);
  useEffect(() => {
    if (!p?.film) return setFilmUrl('');
    let url = '';
    void kv.get<Blob>(p.film.key).then((b) => {
      if (b) setFilmUrl((url = URL.createObjectURL(b)));
    });
    return () => URL.revokeObjectURL(url);
  }, [p?.film?.key]);

  const scene = scenes.find((s) => s.id === p?.sceneId) ?? null;
  const model = models.find((m) => m.id === p?.settings.videoModel) ?? null;
  // jobs submitted before a reload are followed again at once (polling only: nothing is paid twice)
  useEffect(() => {
    if (resumed.current || !p || !scene || !model || busy) return;
    const todo = pendingJobs(p);
    resumed.current = true;
    if (todo.length) void run('Reprise du tournage', (s) => doShoot(s, todo));
  });
  const set = (patch: Partial<FilmProject['settings']>) =>
    mut((x) => (x ? { ...x, settings: { ...x.settings, ...patch } } : x));
  const shotPatch = (i: number, patch: Partial<ShotState>) =>
    mut((x) => {
      if (!x) return x;
      const shots = [...x.shots];
      shots[i] = { ...(shots[i] ?? { step: 'attente' }), ...patch };
      return { ...x, shots };
    });

  const layout = planLayout(model);
  const plans = p?.script?.plans ?? Array.from({ length: layout.n }, () => ({ duree: layout.duree }));
  const sound = !!p?.settings.sound && model?.audio !== false;
  const est = useMemo(
    () =>
      model && p
        ? estimateFilm(model, {
            resolution: p.settings.resolution,
            plans,
            audio: sound,
            startFrame: true,
            imageUsd: IMAGE_MODELS.find((m) => m.id === p.settings.imageModel)?.usd ?? 0.08,
            nImages: p.settings.useImages ? plans.length : 0,
            script: !p.script,
          })
        : null,
    [model, p, plans, sound],
  );
  const imagesLeft = p?.script ? p.script.plans.filter((_, i) => !p.shots[i]?.image).length : 0;
  const imagesUsd = (IMAGE_MODELS.find((m) => m.id === p?.settings.imageModel)?.usd ?? 0.08) * imagesLeft;
  const clipsLeft = p?.script ? p.script.plans.filter((_, i) => p.shots[i]?.step !== 'completed') : [];
  const clipsUsd = est?.rate ? clipsLeft.reduce((a, pl) => a + est.rate!.usdPerS * pl.duree, 0) : NaN;

  // ── running a step: one at a time, stoppable, money capped ──
  const budgetFor = (x: FilmProject) => {
    const b = new Budget(x.settings.cap);
    b.spent = x.spent;
    return b;
  };
  const ctxFor = (b: Budget, signal: AbortSignal) => ({
    budget: b,
    signal,
    shot: shotPatch,
    paid: (usd: number) => mut((x) => (x ? { ...x, spent: x.spent + usd } : x)),
  });
  async function run(label: string, fn: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    if (!getKey())
      return toast('err', 'Clé OpenRouter absente : enregistrez-la sur l’écran d’accueil de la Workbench.');
    abort.current = new AbortController();
    setBusy(label);
    try {
      await fn(abort.current.signal);
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError')
        toast('err', err instanceof BudgetError ? err.message : `${label} : ${err.message}`);
    } finally {
      setBusy('');
      void refreshCredits();
    }
  }
  const ask = (label: string, usd: number, fn: () => Promise<void>) => setConfirm({ label, usd, run: fn });

  async function doScript(signal: AbortSignal) {
    const x = live.current!;
    const r = await stepScript(x, scene!, model, budgetFor(x), signal);
    mut((y) =>
      y
        ? {
            ...y,
            script: r.script,
            alertes: r.alertes,
            scriptModel: r.model,
            shots: r.script.plans.map(() => ({ step: 'attente' as const })),
            spent: y.spent + r.cost,
          }
        : y,
    );
  }
  const doImages = (signal: AbortSignal, only?: number[]) => {
    const x = live.current!;
    return stepImages(x, scene!, ctxFor(budgetFor(x), signal), only);
  };
  const doShoot = (signal: AbortSignal, only?: number[]) => {
    const x = live.current!;
    return stepShoot(x, scene!, model!, ctxFor(budgetFor(x), signal), only);
  };
  async function doMontage() {
    const x = live.current!;
    const s = x.script!;
    const blobs: Blob[] = [];
    for (let i = 0; i < s.plans.length; i++) {
      const st = x.shots[i];
      if (st?.step !== 'completed' || !st.clip) continue;
      const b = await kv.get<Blob>(st.clip);
      if (b) blobs.push(b);
    }
    if (!blobs.length) throw new Error('Aucun plan tourné à monter.');
    const kept = s.plans.filter((_, i) => x.shots[i]?.step === 'completed' && x.shots[i]?.clip);
    const [w, h] = DIMS[x.settings.resolution] ?? DIMS['720p']!;
    const [W, H] = x.settings.aspect === '9:16' ? [w, h] : [h, w];
    setMont({ ratio: 0, text: 'Ouverture des plans' });
    const r = await montage(blobs, {
      width: W,
      height: H,
      captions: x.settings.captions ? (d) => captionCues(kept, d) : undefined,
      onProgress: (ratio, text) => setMont({ ratio, text }),
    });
    const key = `film.final.${x.id}`;
    await kv.set(key, r.blob);
    mut((y) =>
      y
        ? {
            ...y,
            film: {
              key,
              size: r.blob.size,
              duration: r.duration,
              audio: r.audio,
              at: Date.now(),
              mode: r.mode,
              ext: r.ext,
              srt: r.srt,
              plans: blobs.length,
              of: s.plans.length,
            },
          }
        : y,
    );
    setMont(null);
    toast(
      'ok',
      `Film monté : ${r.duration.toFixed(1).replace('.', ',')} s, ${(r.blob.size / 1048576).toFixed(1).replace('.', ',')} Mo`,
    );
  }
  async function doAll(signal: AbortSignal) {
    if (!live.current!.script) await doScript(signal);
    if (live.current!.settings.useImages) {
      await doImages(signal);
      const missing = live.current!.shots.filter((x) => !x.image).length;
      if (missing)
        throw new Error(`${missing} image(s) de plan manquante(s) : refaites-les (étape 4) puis relancez.`);
    }
    await doShoot(signal);
    // a film is only assembled when EVERY plan is there (no more « validated » films that are a fraction of the script)
    const failed = live.current!.shots.filter((x) => x.step !== 'completed').length;
    if (failed)
      throw new Error(`${failed} plan(s) non tourné(s) : relancez-les (étape 5), le film se monte ensuite.`);
    await doMontage();
  }

  const download = async (key: string, name: string) => {
    const b = await kv.get<Blob>(key);
    if (!b) return toast('err', 'Fichier introuvable dans ce navigateur.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const onImport = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const s = importedScene(String(r.result), imp.nom || f.name.replace(/\.[^.]+$/, ''), imp.acteurs);
      if (!s.acteurs.length)
        return toast('err', 'Indiquez les noms des personnages de l’image (ex. KOFFI, COUMBA).');
      setScenes((l) => [...l, s]);
      mut(() => newProject(s.id, p?.settings ?? DEFAULT_SETTINGS));
    };
    r.readAsDataURL(f);
  };
  const pickScene = (id: string) => {
    if (p?.sceneId === id) return;
    if (
      p?.shots.some((s) => s.job || s.image) &&
      !window.confirm('Changer de scène efface le script et les plans de ce film. Continuer ?')
    )
      return;
    mut(() => newProject(id, p?.settings ?? DEFAULT_SETTINGS));
  };
  const remaining = credits?.remaining ?? credits?.keyLimitRemaining ?? null;

  return (
    <div className="h-full overflow-y-auto" data-testid="film-view">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[19px] font-semibold">
              <Clapperboard size={20} className="text-accent" /> Circuit vidéo
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] text-muted">
              Un film d’une minute avec la troupe, tourné par les meilleurs modèles d’OpenRouter (Grok
              Imagine, Seedance, Kling, Veo…) sur votre crédit. Chaque plan part de l’image exacte de la scène
              : mêmes personnages, même décor, répliques en français.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            {remaining !== null && <Badge>Crédit OpenRouter : {fmtUsd(remaining)}</Badge>}
            {p && (
              <Badge tone={p.spent > p.settings.cap * 0.8 ? 'warn' : undefined}>
                Dépensé pour ce film : {fmtUsd(p.spent)} / plafond {fmtUsd(p.settings.cap)}
              </Badge>
            )}
          </div>
        </header>

        {confirm && (
          <div
            className="mb-5 rounded-xl border border-accent/50 bg-accent-soft p-4"
            data-testid="film-confirm"
          >
            <div className="text-[14px] font-semibold">{confirm.label}</div>
            <div className="mt-1 text-[13px]">
              Dépense estimée : <b>{fmtUsd(confirm.usd)}</b> sur votre crédit OpenRouter (prix lus en direct).
              Plafond de ce film : {fmtUsd(p!.settings.cap)}, déjà dépensé : {fmtUsd(p!.spent)}. Tout appel
              qui dépasserait le plafond est refusé avant envoi.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                data-testid="film-confirm-go"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  void c.run();
                }}
              >
                Confirmer
              </Button>
              <Button onClick={() => setConfirm(null)}>Annuler</Button>
            </div>
          </div>
        )}

        <Step n={1} title="Scène de la troupe">
          {packMissing && !scenes.length && (
            <p className="mb-3 text-[12.5px] text-faint">
              Paquet de la troupe absent : placez <b>{PACK_FILE}</b> dans le même dossier que l’application,
              ou importez une image ci-dessous.
            </p>
          )}
          {/* scene cards are pictures: no decorative emoji pushing the image down */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-no-emoji>
            {scenes.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid="film-scene"
                onClick={() => pickScene(s.id)}
                className={cx(
                  'overflow-hidden rounded-lg border text-left',
                  p?.sceneId === s.id
                    ? 'border-accent ring-2 ring-accent/40'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <img src={s.image} alt={s.titre} className="aspect-[4/3] w-full object-cover" />
                <div className="px-2 py-1.5">
                  <div className="truncate text-[12px] font-medium">{s.titre}</div>
                  <div className="truncate text-[11px] text-faint">{s.acteurs.join(', ')}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2 text-[12.5px]">
            <Input
              placeholder="Nom de la scène"
              value={imp.nom}
              onChange={(e) => setImp({ ...imp, nom: e.target.value })}
              className="w-44"
            />
            <Input
              placeholder="Personnages : KOFFI, COUMBA"
              value={imp.acteurs}
              onChange={(e) => setImp({ ...imp, acteurs: e.target.value })}
              className="w-60"
            />
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 hover:bg-hover">
              <ImagePlus size={14} /> Importer une image de scène
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => onImport(e.target.files?.[0])}
              />
            </label>
          </div>
        </Step>

        {p && scene && (
          <>
            <Step n={2} title="Idée, modèles et devis">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[12.5px] font-medium">Idée du film (facultative)</div>
                  <Textarea
                    rows={3}
                    data-testid="film-idee"
                    value={p.settings.idee}
                    onChange={(e) => set({ idee: e.target.value })}
                    placeholder={`Ex. ${scene.acteurs[0] ?? 'Koffi'} a oublié son porte-monnaie et invente une excuse…`}
                  />
                  <div className="mt-2 mb-1 text-[12.5px] font-medium">Ton</div>
                  <Input value={p.settings.ton} onChange={(e) => set({ ton: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                  <label className="col-span-2">
                    <div className="mb-1 font-medium">Modèle vidéo</div>
                    <Select
                      className="w-full"
                      value={p.settings.videoModel}
                      onChange={(v) => {
                        const m = models.find((x) => x.id === v);
                        set({
                          videoModel: v,
                          resolution: m?.resolutions.includes('720p')
                            ? '720p'
                            : (m?.resolutions[0] ?? '720p'),
                        });
                      }}
                      options={(models.length
                        ? models
                        : [{ id: p.settings.videoModel, name: p.settings.videoModel } as VideoModel]
                      ).map((m) => ({ value: m.id, label: m.name }))}
                    />
                  </label>
                  <label>
                    <div className="mb-1 font-medium">Résolution</div>
                    <Select
                      className="w-full"
                      value={p.settings.resolution}
                      onChange={(v) => set({ resolution: v })}
                      options={(model?.resolutions ?? ['720p']).map((r) => ({ value: r, label: r }))}
                    />
                  </label>
                  <label>
                    <div className="mb-1 font-medium">Format</div>
                    <Select
                      className="w-full"
                      value={p.settings.aspect}
                      onChange={(v) => set({ aspect: v })}
                      options={[
                        { value: '9:16', label: '9:16 (TikTok)' },
                        { value: '16:9', label: '16:9 (YouTube)' },
                      ]}
                    />
                  </label>
                  <label className="col-span-2">
                    <div className="mb-1 font-medium">Générateur d’images des plans</div>
                    <Select
                      className="w-full"
                      value={p.settings.imageModel}
                      onChange={(v) => set({ imageModel: v })}
                      options={IMAGE_MODELS.map((m) => ({
                        value: m.id,
                        label: `${m.name} · ≈ ${fmtUsd(m.usd)}`,
                      }))}
                    />
                  </label>
                  <label>
                    <div className="mb-1 font-medium">Plafond du film ($)</div>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={p.settings.cap}
                      onChange={(e) => set({ cap: Math.max(0.5, Number(e.target.value) || 0) })}
                      data-testid="film-cap"
                    />
                  </label>
                  <div className="flex flex-col justify-end gap-1.5">
                    <Toggle
                      checked={p.settings.useImages}
                      onChange={(v) => set({ useImages: v })}
                      label="Une image par plan"
                    />
                    <Toggle
                      checked={p.settings.sound}
                      onChange={(v) => set({ sound: v })}
                      label="Voix et son"
                    />
                    <Toggle
                      checked={p.settings.captions}
                      onChange={(v) => set({ captions: v })}
                      label="Sous-titres"
                    />
                  </div>
                </div>
              </div>
              {modelsError && (
                <p className="mt-2 text-[12.5px] text-err">
                  Catalogue vidéo d’OpenRouter injoignable : {modelsError}
                </p>
              )}
              {model && est && (
                <div
                  className="mt-3 rounded-lg border border-line bg-elev p-3 text-[12.5px]"
                  data-testid="film-devis"
                >
                  <div className="font-medium">
                    Devis : {plans.length} plans de {plans[0]?.duree ?? layout.duree} s · {model.name} en{' '}
                    {p.settings.resolution}
                  </div>
                  <div className="mt-1 text-muted">
                    Vidéo{' '}
                    {est.rate
                      ? `${est.approx && est.rate.approx ? '≈ ' : ''}${fmtUsd(est.video)} (${fmtUsd(est.rate.usdPerS)}/s)`
                      : 'prix inconnu'}
                    {p.settings.useImages && ` · images ≈ ${fmtUsd(est.images)}`}
                    {!p.script && ` · script ≤ ${fmtUsd(est.script)}`} ·{' '}
                    <b className="text-fg">total ≈ {fmtUsd(est.total)}</b>
                    {est.total > p.settings.cap && (
                      <span className="text-err">
                        {' '}
                        — au-dessus du plafond : relevez-le ou choisissez un modèle moins cher.
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11.5px] text-faint">
                    Prix lus en direct chez OpenRouter (tarif « {est.rate?.basis ?? '—'} »). Le coût réel de
                    chaque appel s’ajoute au compteur dès qu’OpenRouter le communique.
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  data-testid="film-all"
                  disabled={!!busy || !model || !est}
                  onClick={() =>
                    ask('Tourner le film complet (script, images, plans, montage)', est?.total ?? NaN, () =>
                      run('Film complet', doAll),
                    )
                  }
                >
                  <Wand2 size={14} /> Tourner le film complet
                </Button>
                {busy && (
                  <Button onClick={() => abort.current?.abort()} data-testid="film-stop">
                    <Square size={13} /> Arrêter ({busy})
                  </Button>
                )}
              </div>
            </Step>

            <Step
              n={3}
              title="Script"
              right={
                <Button
                  size="sm"
                  disabled={!!busy}
                  data-testid="film-script"
                  onClick={() => void run('Script', doScript)}
                >
                  <RefreshCw size={13} /> {p.script ? 'Réécrire' : 'Écrire le script'}
                </Button>
              }
            >
              {!p.script && (
                <p className="text-[12.5px] text-faint">
                  Le scénariste regarde l’image de la scène, décrit chaque personnage et écrit {layout.n}{' '}
                  plans avec leurs répliques.
                </p>
              )}
              {p.script && (
                <>
                  <div className="mb-2 text-[13px] font-medium">
                    « {p.script.titre} » <span className="text-faint">· écrit par {p.scriptModel}</span>
                  </div>
                  {p.alertes.length > 0 && (
                    <ul className="mb-2 list-disc pl-5 text-[12px] text-warn">
                      {p.alertes.map((a, k) => (
                        <li key={k}>{a}</li>
                      ))}
                    </ul>
                  )}
                  <div className="space-y-2" data-testid="film-plans">
                    {p.script.plans.map((pl, i) => (
                      <div
                        key={i}
                        className="grid gap-2 rounded-lg border border-line p-2 md:grid-cols-[110px_1fr_1fr]"
                      >
                        <div className="text-[12px]">
                          <b>Plan {i + 1}</b> · {pl.duree} s
                          <Select
                            className="mt-1 w-full"
                            value={pl.cadrage}
                            onChange={(v) =>
                              mut((x) =>
                                x && x.script
                                  ? {
                                      ...x,
                                      script: {
                                        ...x.script,
                                        plans: x.script.plans.map((q, k) =>
                                          k === i ? { ...q, cadrage: v } : q,
                                        ),
                                      },
                                    }
                                  : x,
                              )
                            }
                            options={Object.keys(CADRAGES).map((c) => ({ value: c, label: c }))}
                          />
                        </div>
                        <Textarea
                          rows={3}
                          value={pl.action}
                          onChange={(e) =>
                            mut((x) =>
                              x && x.script
                                ? {
                                    ...x,
                                    script: {
                                      ...x.script,
                                      plans: x.script.plans.map((q, k) =>
                                        k === i ? { ...q, action: e.target.value } : q,
                                      ),
                                    },
                                  }
                                : x,
                            )
                          }
                        />
                        <div>
                          <Textarea
                            rows={3}
                            value={linesToText(pl.repliques)}
                            onChange={(e) =>
                              mut((x) =>
                                x && x.script
                                  ? {
                                      ...x,
                                      script: {
                                        ...x.script,
                                        plans: x.script.plans.map((q, k) =>
                                          k === i ? { ...q, repliques: textToLines(e.target.value) } : q,
                                        ),
                                      },
                                    }
                                  : x,
                              )
                            }
                          />
                          <div className="text-[11px] text-faint">
                            {pl.repliques.reduce(
                              (a, r) => a + r.texte.split(/\s+/).filter(Boolean).length,
                              0,
                            )}{' '}
                            mots / {Math.floor(pl.duree * WORDS_PER_S)} au plus · « NOM : réplique » par ligne
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Step>

            {p.script && (
              <Step
                n={4}
                title="Images des plans"
                right={
                  p.settings.useImages && (
                    <Button
                      size="sm"
                      disabled={!!busy || !imagesLeft}
                      data-testid="film-images"
                      onClick={() =>
                        ask(`Générer ${imagesLeft} image(s) de plan`, imagesUsd, () =>
                          run('Images', (s) => doImages(s)),
                        )
                      }
                    >
                      <ImagePlus size={13} /> Générer les images{' '}
                      {imagesLeft ? `(≈ ${fmtUsd(imagesUsd)})` : ''}
                    </Button>
                  )
                }
              >
                {!p.settings.useImages && (
                  <p className="text-[12.5px] text-faint">
                    Chaque plan partira de l’image de la scène telle quelle (format de l’image d’origine).
                  </p>
                )}
                {p.settings.useImages && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {p.script.plans.map((_, i) => {
                      const st = p.shots[i];
                      return (
                        <div
                          key={i}
                          className="overflow-hidden rounded-lg border border-line"
                          data-testid="film-image"
                        >
                          {st?.image ? (
                            <img
                              src={st.image}
                              alt={`plan ${i + 1}`}
                              className={cx(
                                'w-full object-cover',
                                p.settings.aspect === '9:16' ? 'aspect-[9/16]' : 'aspect-video',
                              )}
                            />
                          ) : (
                            <div
                              className={cx(
                                'grid w-full place-items-center bg-elev text-[11px] text-faint',
                                p.settings.aspect === '9:16' ? 'aspect-[9/16]' : 'aspect-video',
                              )}
                            >
                              {st?.step === 'image' ? 'en cours…' : `plan ${i + 1}`}
                            </div>
                          )}
                          <div className="flex items-center justify-between px-1.5 py-1 text-[11px]">
                            <span>Plan {i + 1}</span>
                            {st?.image && st.step !== 'completed' && (
                              <button
                                className="text-accent"
                                disabled={!!busy}
                                onClick={() => run('Image', (s) => doImages(s, [i]))}
                              >
                                refaire
                              </button>
                            )}
                          </div>
                          {st?.error && st.step === 'attente' && (
                            <div className="px-1.5 pb-1 text-[10.5px] text-err">{st.error}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Step>
            )}

            {p.script && (
              <Step
                n={5}
                title="Tournage des plans"
                right={
                  <Button
                    size="sm"
                    variant="primary"
                    data-testid="film-shoot"
                    disabled={
                      !!busy || !model || !clipsLeft.length || (p.settings.useImages && imagesLeft > 0)
                    }
                    onClick={() =>
                      ask(`Tourner ${clipsLeft.length} plan(s) avec ${model?.name ?? ''}`, clipsUsd, () =>
                        run('Tournage', (s) => doShoot(s)),
                      )
                    }
                  >
                    <Play size={13} /> Tourner {clipsLeft.length} plan(s){' '}
                    {Number.isFinite(clipsUsd) ? `(≈ ${fmtUsd(clipsUsd)})` : ''}
                  </Button>
                }
              >
                {p.settings.useImages && imagesLeft > 0 && (
                  <p className="mb-2 text-[12.5px] text-faint">
                    Générez d’abord les images des plans (étape 4).
                  </p>
                )}
                <table className="w-full text-[12.5px]" data-testid="film-shots">
                  <tbody>
                    {p.script.plans.map((pl, i) => {
                      const st = p.shots[i] ?? { step: 'attente' as const };
                      return (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1.5 pr-2 font-medium">Plan {i + 1}</td>
                          <td className="py-1.5 pr-2 text-muted">{pl.action.slice(0, 80)}</td>
                          <td
                            className={cx(
                              'py-1.5 pr-2',
                              st.step === 'completed'
                                ? 'text-ok'
                                : /failed|cancelled|expired/.test(st.step)
                                  ? 'text-err'
                                  : '',
                            )}
                            data-testid="film-shot-state"
                          >
                            {STEP_LABEL[st.step]}
                            {st.ms ? ` · ${Math.round(st.ms / 1000)} s` : ''}
                            {typeof st.cost === 'number' ? ` · ${fmtUsd(st.cost)}` : ''}
                            {st.error && /failed|cancelled|expired/.test(st.step) && (
                              <div className="text-[11px]">{st.error}</div>
                            )}
                          </td>
                          <td className="py-1.5 text-right">
                            {/failed|cancelled|expired/.test(st.step) && (
                              <Button
                                size="sm"
                                disabled={!!busy}
                                onClick={() => run('Tournage', (s) => doShoot(s, [i]))}
                              >
                                Relancer
                              </Button>
                            )}
                            {st.step === 'completed' && st.clip && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void download(st.clip!, `plan-${i + 1}.mp4`)}
                              >
                                <Download size={13} />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Step>
            )}

            {p.script && (
              <Step
                n={6}
                title="Film"
                right={
                  <Button
                    size="sm"
                    data-testid="film-montage"
                    disabled={!!busy || !p.shots.some((s) => s.step === 'completed')}
                    onClick={() => void run('Montage', () => doMontage())}
                  >
                    <Film size={13} /> Monter le film
                  </Button>
                }
              >
                {mont && (
                  <div className="mb-2 text-[12.5px]">
                    Montage : {Math.round(mont.ratio * 100)} % · {mont.text}
                    <div className="mt-1 h-1.5 rounded bg-line">
                      <div
                        className="h-1.5 rounded bg-accent"
                        style={{ width: `${Math.round(mont.ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {p.film && filmUrl ? (
                  <div className="flex flex-wrap items-start gap-4">
                    <video
                      src={filmUrl}
                      controls
                      className={cx(
                        'rounded-lg bg-black',
                        p.settings.aspect === '9:16' ? 'h-[480px]' : 'w-full max-w-xl',
                      )}
                      data-testid="film-video"
                    />
                    <div className="text-[13px]">
                      <div className="font-medium">« {p.script.titre} »</div>
                      <div className="mt-1 text-muted">
                        {p.film.duration.toFixed(1).replace('.', ',')} s ·{' '}
                        {(p.film.size / 1048576).toFixed(1).replace('.', ',')} Mo ·{' '}
                        {p.film.ext === 'webm' ? 'WebM VP9 (ce navigateur n’a pas d’encodeur H.264)' : 'MP4'}
                        {p.film.audio ? ' + son' : ' (sans son)'}
                        {p.film.plans < p.film.of && (
                          <span className="text-warn">
                            {' '}
                            · {p.film.plans} plans sur {p.film.of} (film incomplet)
                          </span>
                        )}
                      </div>
                      {p.film.mode === 'copy' && (
                        <div className="mt-1 max-w-sm text-[12px] text-faint">
                          Plans assemblés sans réencodage (ce navigateur ne décode pas ces vidéos) : les
                          sous-titres sont dans un fichier .srt à part. Dans Chrome ou Edge, ils sont
                          incrustés dans l’image.
                        </div>
                      )}
                      <div className="mt-1 text-muted">Dépensé : {fmtUsd(p.spent)}</div>
                      <Button
                        className="mt-3"
                        variant="primary"
                        data-testid="film-download"
                        onClick={() =>
                          void download(
                            p.film!.key,
                            `${(p.script?.titre || 'film').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50)}.${p.film!.ext ?? 'mp4'}`,
                          )
                        }
                      >
                        <Download size={14} /> Télécharger le film
                      </Button>
                      {p.film.srt && (
                        <Button
                          className="mt-3 ml-2"
                          data-testid="film-srt"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(
                              new Blob([p.film!.srt!], { type: 'application/x-subrip' }),
                            );
                            a.download = 'sous-titres.srt';
                            a.click();
                          }}
                        >
                          Sous-titres (.srt)
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  !mont && (
                    <p className="text-[12.5px] text-faint">
                      Le film se monte dès que les plans sont tournés.
                    </p>
                  )
                )}
              </Step>
            )}
          </>
        )}
      </div>
    </div>
  );
}
