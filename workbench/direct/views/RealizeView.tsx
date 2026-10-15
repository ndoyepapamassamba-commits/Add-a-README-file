// BAC À SABLE · RÉALISATION — « tout prompt devient une réalisation ». Le modèle écrit une page complète, le bac à sable
// isolé l'exécute avec le moteur (esm.sh : React, Chart.js, ECharts, Plotly, Vega, three.js, Pixi, Matter, Tone,
// Leaflet, Mermaid, KaTeX… licences MIT / Apache / BSD), les erreurs réelles reviennent au modèle, trois tours au plus.
// Les données jointes (CSV, Excel, JSON) sont lues ICI et passées à la page (window.DATA) : le modèle ne voit que les
// colonnes et une ligne d'exemple.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Code2,
  Download,
  ExternalLink,
  FileUp,
  Maximize2,
  Play,
  Save,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { Button, Chip } from '../../web/components/ui';
import { cx, fmtCost, shortModel } from '../../web/lib/format';
import { DataCore } from '../../server/services/dataCore';
import {
  KIND_LABELS,
  LIBRARIES,
  describeData,
  detectKind,
  eyeTargets,
  realizeWithCorrection,
  type DataInfo,
  type RealizeKind,
  type RealizeRound,
  type RealizeRun,
  type VideoSpec,
  videoExt,
} from '../../server/jev/realize/realize';
import { eyeProblems, type EyeVerdict } from '../../server/jev/eye';
import { jevSee } from '../lib/jev';
import { complete } from '../lib/llm';
import { Realizer, type Video } from '../lib/realize/runner';
import { useStore } from '../lib/store';
import { download, uniquePath, writeText } from '../lib/vfs';
import { PageHeader } from './PageHeader';

const IDEAS: { label: string; prompt: string }[] = [
  {
    label: 'Tableau de bord des données jointes',
    prompt:
      'Tableau de bord interactif des données jointes : indicateurs clés, filtres par catégorie, graphiques et tableau triable.',
  },
  {
    label: 'Simulateur de crédit',
    prompt:
      'Simulateur de crédit : montant, taux, durée, différé ; mensualité, coût total, tableau d’amortissement et graphique capital / intérêts ; export Excel du tableau.',
  },
  {
    label: 'Système solaire 3D',
    prompt:
      'Système solaire 3D interactif : planètes en orbite à l’échelle relative, étoiles, nom de la planète au survol, vitesse réglable.',
  },
  {
    label: 'Jeu du serpent',
    prompt:
      'Jeu du serpent moderne : commandes clavier et tactiles, score, meilleur score de la partie, vitesse croissante, écran de fin « Rejouer ».',
  },
  {
    label: 'Organigramme',
    prompt: 'Organigramme de la Direction des Engagements (Mermaid) avec légende et export SVG.',
  },
  {
    label: 'Vidéo 3D 15 s',
    prompt:
      'Vidéo 3D de 15 secondes : une banque futuriste au lever du soleil à Dakar, caméra en travelling aérien lent, titre « Ecobank 2030 » qui apparaît puis se dissout.',
  },
  {
    label: 'Graphique animé 10 s',
    prompt:
      'Vidéo de 10 secondes : les ventes par région en barres 3D qui montent une à une, chiffres qui défilent, titre et source en bas.',
  },
  {
    label: 'Quiz IFRS 9',
    prompt: 'Quiz de 10 questions sur IFRS 9 (stages, SICR, ECL) avec correction expliquée et score final.',
  },
];

interface Attached {
  name: string;
  rows: Record<string, unknown>[];
  info: DataInfo;
}
const MAX_ROWS = 20_000;

export function RealizeView() {
  const models = useStore((s) => s.models);
  const defaultModel = useStore((s) => s.settings.defaultModel);
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<RealizeKind | 'auto'>('auto');
  const [model, setModel] = useState('');
  const [rounds, setRounds] = useState<RealizeRound[]>([]);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState('');
  const [last, setLast] = useState<RealizeRun | null>(null);
  const [eye, setEye] = useState<EyeVerdict | null>(null);
  const [log, setLog] = useState<{ level: string; msg: string }[]>([]);
  const [data, setData] = useState<Attached | null>(null);
  const [cost, setCost] = useState(0);
  const [spec, setSpec] = useState<VideoSpec>({ seconds: 15, format: '16:9' });
  const [video, setVideo] = useState<(Video & { url: string }) | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const rz = useRef<Realizer | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = new Realizer(host.current!);
    r.onConsole = (level, msg) => setLog((l) => [...l.slice(-199), { level, msg }]);
    rz.current = r;
    return () => r.dispose();
  }, []);

  const effective: RealizeKind = kind === 'auto' ? detectKind(prompt, Boolean(data)) : kind;
  const coders = useMemo(
    () =>
      models
        .filter(
          (m) => m.capabilities.tools || /claude|gpt|gemini|qwen|deepseek|grok|mistral|kimi|glm/i.test(m.id),
        )
        .slice(0, 400),
    [models],
  );
  const pickModel = () =>
    model ||
    (defaultModel && defaultModel !== 'auto'
      ? defaultModel
      : (models.find((x) => /claude-sonnet|claude-opus|gpt-5|gemini-2\.5-pro|qwen3-coder/i.test(x.id))?.id ??
        models[0]?.id ??
        ''));

  const runPage = async (html: string) => {
    setLog([]);
    const r = await rz.current!.run(html, dataOpts());
    setLast(r);
    return r;
  };

  const realize = async (iterate = false) => {
    const m = pickModel();
    if (!m)
      return useStore
        .getState()
        .toast('err', 'Aucun modèle disponible : clé OpenRouter à configurer dans Paramètres.');
    if (!prompt.trim()) return;
    setRounds([]);
    setEye(null);
    setBusy('le modèle écrit la page');
    let spent = 0;
    try {
      const r = await realizeWithCorrection({
        prompt: prompt.trim(),
        kind: effective,
        data: data?.info ?? null,
        video: effective === 'video' ? spec : undefined,
        base: iterate && code ? code : undefined,
        maxRounds: 3,
        generate: async (messages) => {
          setBusy(
            messages.length > 2
              ? 'le modèle corrige à partir des erreurs réelles'
              : 'le modèle écrit la page',
          );
          const res = await complete(
            { model: m, messages, maxTokens: 16_000, temperature: 0.3 },
            { models, fallbacks: [], effort: 'auto', purpose: 'realize' },
          );
          spent += res.cost;
          setCost(spent);
          setBusy('exécution dans le bac à sable');
          return res.content;
        },
        run: runPage,
        // The eye of JEV: a picture of the rendered canvas, judged by Jev 1.14 (what the request names must be SEEN).
        see: async (run) => {
          const shot = await rz.current!.snapshot(1024);
          if ('error' in shot) return null;
          const t = eyeTargets(prompt.trim(), run);
          setBusy('l’œil de JEV regarde le rendu');
          const v = await jevSee(shot.data, t.elements, t.circumstances);
          if (!v) return null;
          setEye(v);
          return eyeProblems(v);
        },
        onRound: (round) => setRounds((x) => [...x, round]),
      });
      setCode(r.code);
      if (r.ok && effective === 'video') void film(r.code);
      useStore
        .getState()
        .toast(
          r.ok ? 'ok' : 'err',
          r.ok
            ? `Réalisé en ${r.rounds.length} tour(s)`
            : r.network
              ? 'Bibliothèques injoignables (réseau) : vérifiez la connexion à esm.sh puis « Exécuter ». Le modèle n’a pas été relancé pour rien.'
              : `Toujours en erreur après ${r.rounds.length} tours : code laissé pour correction`,
        );
    } catch (e) {
      useStore.getState().toast('err', `Réalisation : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const attach = async (f: File) => {
    try {
      const ds = new DataCore().parseBytes(f.name, new Uint8Array(await f.arrayBuffer()), null);
      const rows = (ds.rows as Record<string, unknown>[]).slice(0, MAX_ROWS);
      setData({ name: f.name, rows, info: describeData(f.name, rows) });
      if (!prompt.trim()) setPrompt(IDEAS[0]!.prompt);
      if (ds.rows.length > MAX_ROWS)
        useStore
          .getState()
          .toast('info', `${ds.rows.length} lignes : les ${MAX_ROWS} premières sont passées à la page.`);
    } catch (e) {
      useStore.getState().toast('err', `Fichier illisible : ${(e as Error).message}`);
    }
  };

  const keepVideo = (v: Video) => {
    setVideo((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { ...v, url: URL.createObjectURL(v.blob) };
    });
    if (!v.mime.startsWith('video/mp4'))
      useStore
        .getState()
        .toast(
          'info',
          'Ce navigateur n’enregistre pas le MP4 : vidéo en WebM (Chrome ou Edge récents enregistrent en MP4).',
        );
  };
  const dataOpts = () =>
    data ? { data: data.rows, meta: { name: data.name, columns: data.info.columns } } : {};
  /** The whole video, from its first image (video kind), else a capture of the current preview. */
  const film = async (html = code) => {
    if (!html) return;
    setBusy(`enregistrement de la vidéo (${spec.seconds} s)`);
    try {
      const r = await rz.current!.renderVideo(html, spec.seconds, dataOpts());
      if ('error' in r) {
        if (r.error !== 'nocanvas') throw new Error(r.error);
        // No canvas (HTML / SVG / CSS page): film the preview as displayed — the browser asks to share this tab.
        useStore
          .getState()
          .toast(
            'info',
            'Page HTML sans canvas : le navigateur va demander l’autorisation de filmer l’aperçu.',
          );
        keepVideo(await rz.current!.recordScreen(spec.seconds * 1000));
      } else keepVideo(r);
    } catch (e) {
      useStore.getState().toast('err', `Vidéo : ${(e as Error).message}`);
    }
    setBusy('');
  };

  const standalone = () =>
    Realizer.standalone(code, data?.rows, data ? { name: data.name, columns: data.info.columns } : undefined);
  const slug = (prompt.trim().slice(0, 40) || 'realisation')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return (
    <div className="h-full overflow-auto" data-testid="realize">
      <div className="mx-auto grid max-w-[1500px] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(340px,440px)_1fr]">
        <div className="xl:col-span-2">
          <PageHeader
            title="Bac à sable · Réalisation"
            subtitle="Décrivez ce que vous voulez : le modèle le réalise, le bac à sable l’exécute et le corrige à partir des erreurs réelles"
          />
        </div>
        <section className="space-y-3">
          <div className="rounded-xl border border-line bg-panel p-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void realize(false);
              }}
              rows={6}
              placeholder="Une application, un tableau de bord, un jeu, une scène 3D, un schéma, une page… (Ctrl+Entrée)"
              className="block w-full resize-y rounded-lg border border-line bg-input px-3 py-2 text-[14px] outline-none focus:border-accent"
              data-testid="realize-prompt"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {IDEAS.map((i) => (
                <Chip key={i.label} onClick={() => setPrompt(i.prompt)}>
                  {i.label}
                </Chip>
              ))}
            </div>
            <div
              className="mt-3 flex flex-wrap items-center gap-1.5"
              role="radiogroup"
              aria-label="Type de réalisation"
            >
              {(['auto', ...Object.keys(KIND_LABELS)] as (RealizeKind | 'auto')[]).map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cx(
                    'rounded-full border px-2.5 py-1 text-[12px]',
                    kind === k
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-muted hover:text-fg',
                  )}
                >
                  {k === 'auto' ? `Auto · ${KIND_LABELS[effective]}` : KIND_LABELS[k]}
                </button>
              ))}
            </div>
            {effective === 'video' && (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]"
                data-testid="realize-video-spec"
              >
                <span className="text-muted">Durée</span>
                <select
                  aria-label="Durée de la vidéo"
                  value={spec.seconds}
                  onChange={(e) => setSpec({ ...spec, seconds: Number(e.target.value) })}
                  className="h-8 rounded-lg border border-line bg-input px-2"
                >
                  {[5, 10, 15, 20, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} s
                    </option>
                  ))}
                </select>
                <span className="text-muted">Format</span>
                <select
                  aria-label="Format de la vidéo"
                  value={spec.format}
                  onChange={(e) => setSpec({ ...spec, format: e.target.value as VideoSpec['format'] })}
                  className="h-8 rounded-lg border border-line bg-input px-2"
                >
                  <option value="16:9">16:9 · 1920×1080</option>
                  <option value="9:16">9:16 · 1080×1920 (réseaux sociaux)</option>
                  <option value="1:1">1:1 · 1080×1080</option>
                </select>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={file}
                type="file"
                hidden
                accept=".csv,.tsv,.xlsx,.xls,.json,.jsonl"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void attach(f);
                }}
                data-testid="realize-file"
              />
              <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
                <FileUp size={13} /> Joindre des données
              </Button>
              {data && (
                <span
                  className="inline-flex items-center gap-1 rounded-lg bg-hover px-2 py-0.5 text-[12px]"
                  data-testid="realize-data"
                >
                  {data.name} · {data.rows.length} lignes · {data.info.columns.length} colonnes
                  <button aria-label="Retirer les données" onClick={() => setData(null)}>
                    <X size={11} />
                  </button>
                </span>
              )}
              <select
                aria-label="Modèle"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="ml-auto h-8 max-w-[220px] rounded-lg border border-line bg-input px-2 text-[12.5px]"
                data-testid="realize-model"
              >
                <option value="">Modèle par défaut ({pickModel() ? shortModel(pickModel()) : '—'})</option>
                {coders.map((m) => (
                  <option key={m.id} value={m.id}>
                    {shortModel(m.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!prompt.trim() || Boolean(busy)}
                onClick={() => void realize(false)}
                data-testid="realize-go"
              >
                <Sparkles size={14} /> Réaliser (auto-correction ×3)
              </Button>
              <Button
                disabled={!prompt.trim() || !code || Boolean(busy)}
                onClick={() => void realize(true)}
                title="Modifier la réalisation actuelle avec la consigne ci-dessus"
              >
                <Wand2 size={14} /> Modifier la réalisation
              </Button>
            </div>
            {busy && (
              <div className="mt-2 text-[12px] text-accent" data-testid="realize-busy">
                {busy}…
              </div>
            )}
          </div>

          {rounds.length > 0 && (
            <div className="space-y-1.5" data-testid="realize-rounds">
              {rounds.map((r) => (
                <details
                  key={r.round}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px]"
                >
                  <summary className="cursor-pointer">
                    <b>Tour {r.round}</b> —{' '}
                    {r.run.ok ? (
                      <span className="text-ok">✓ réalisé sans erreur · {r.run.stats.ms} ms</span>
                    ) : (
                      <span className="text-err">
                        ✗ {r.run.errors.length} erreur(s) réelle(s) → renvoyée(s) au modèle
                      </span>
                    )}
                    {r.run.stats.libs.length > 0 && (
                      <span className="ml-1 text-faint">· {r.run.stats.libs.join(', ')}</span>
                    )}
                  </summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                    {r.run.errors.map((e, i) => (
                      <li key={i}>
                        [{e.kind}] {e.msg}
                        {e.line ? ` (ligne ${e.line})` : ''}
                      </li>
                    ))}
                    {r.run.ok && (
                      <li>
                        {r.run.stats.elements} éléments visibles · {r.run.stats.canvases} canvas ·{' '}
                        {r.run.stats.svgs} SVG
                      </li>
                    )}
                  </ul>
                </details>
              ))}
              {cost > 0 && (
                <div className="text-[11.5px] text-faint">
                  Coût mesuré de la réalisation : {fmtCost(cost)}
                </div>
              )}
            </div>
          )}

          <details className="rounded-xl border border-line bg-panel p-3 text-[12px]">
            <summary className="cursor-pointer font-semibold">
              Moteur embarqué ({LIBRARIES.length} bibliothèques libres + Tailwind)
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {LIBRARIES.map((l) => (
                <li key={l.name} title={l.use}>
                  <b>{l.name}</b>{' '}
                  <span className="text-faint">
                    {l.version} · {l.license}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-faint">
              Chargées à la demande depuis esm.sh (connexion Internet requise). La page tourne dans une iframe
              isolée : aucun accès à l’app, à vos clés ni à vos fichiers ; seuls esm.sh et jsdelivr sont
              joignables.
            </p>
          </details>
        </section>

        <section className="flex min-h-[460px] flex-col rounded-xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
            <span className="mr-auto px-1 text-[12.5px] font-semibold" data-testid="realize-status">
              {last ? (last.ok ? '✓ Aperçu en direct' : `✗ ${last.errors.length} erreur(s)`) : 'Aperçu'}
            </span>
            {eye && (
              <span
                className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted"
                data-testid="realize-eye"
                title={[
                  ...eye.seen.map((x) => `vu : ${x.name} (${x.p.toFixed(2)})`),
                  ...eye.missing.map((x) => `NON vu : ${x.name} (${x.p.toFixed(2)})`),
                  ...eye.unmet.map((x) => `non rendu : ${x.text}`),
                ].join('\n')}
              >
                Œil de JEV · {eye.seen.length}/{eye.seen.length + eye.missing.length} éléments vus
                {eye.finish !== null ? ` · finition ${eye.finish.toFixed(1).replace('.', ',')}/3` : ''} ·{' '}
                {eye.tokens.toLocaleString('fr-FR')} jetons
              </span>
            )}
            <Button size="sm" variant="ghost" disabled={!code} onClick={() => setShowCode((v) => !v)}>
              <Code2 size={13} /> {showCode ? 'Aperçu' : 'Code'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code || Boolean(busy)}
              onClick={() => void runPage(code)}
              title="Réexécuter le code (après modification manuelle)"
            >
              <Play size={13} /> Exécuter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code}
              onClick={() => void rz.current?.frame.requestFullscreen?.()}
            >
              <Maximize2 size={13} /> Plein écran
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code || Boolean(busy)}
              onClick={() => void film()}
              title={`Enregistrer ${spec.seconds} s de la réalisation en vidéo MP4`}
              data-testid="realize-film"
            >
              <Clapperboard size={13} /> Vidéo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code}
              onClick={() => {
                const url = URL.createObjectURL(new Blob([standalone()], { type: 'text/html' }));
                window.open(url, '_blank', 'noopener');
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              }}
            >
              <ExternalLink size={13} /> Onglet
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code}
              onClick={() => download(`${slug}.html`, standalone(), 'text/html')}
              data-testid="realize-download"
            >
              <Download size={13} /> HTML
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!code}
              onClick={() => {
                const f = writeText(uniquePath(`realisations/${slug}.html`), standalone());
                useStore.getState().toast('ok', `Enregistré dans Fichiers : ${f.path}`);
              }}
            >
              <Save size={13} /> Fichiers
            </Button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={host}
              className={cx(
                'absolute inset-0',
                (showCode || (!code && !rounds.length && !busy)) && 'invisible',
              )}
            />
            {showCode && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                className="absolute inset-0 h-full w-full resize-none bg-code p-3 font-mono text-[12px] outline-none"
                data-testid="realize-code"
              />
            )}
            {!code && !busy && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-faint">
                La réalisation s’affichera ici, en direct, dans un bac à sable isolé.
              </div>
            )}
          </div>
          {video && (
            <div
              className="flex flex-wrap items-center gap-3 border-t border-line p-2"
              data-testid="realize-video"
            >
              <video src={video.url} controls className="h-28 rounded-lg bg-black" />
              <div className="text-[12px] text-muted">
                Vidéo {videoExt(video.mime).toUpperCase()} · {(video.blob.size / 1024 / 1024).toFixed(1)} Mo
                {video.width ? ` · ${video.width}×${video.height}` : ''}
              </div>
              <a
                href={video.url}
                download={`${slug}.${videoExt(video.mime)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-fg hover:brightness-110"
                data-testid="realize-video-download"
              >
                <Download size={13} /> Télécharger le {videoExt(video.mime).toUpperCase()}
              </a>
            </div>
          )}
          {log.length > 0 && (
            <div
              className="max-h-28 overflow-auto border-t border-line px-3 py-1.5 font-mono text-[11px]"
              data-testid="realize-console"
            >
              {log.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.level === 'error' ? 'text-err' : l.level === 'warn' ? 'text-warn' : 'text-muted'
                  }
                >
                  {l.msg}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
