// AI Film Studio UI pieces: production wizard (2D/3D), film tools (diagnose, versions, plan, smoke), asset graph, cost
// intelligence, video quality gate. Every figure shown comes from real records; nothing is simulated.
import { useMemo, useState } from 'react';
import { Badge, Button, Input, Select, Textarea, Toggle } from '../../../web/components/ui';
import { useStudio } from '../../lib/studio/store';
import { useStore } from '../../lib/store';
import {
  diagnoseProduction,
  judgeVideoFrame,
  restoreProductionVersion,
  runVideoGate,
  saveProductionVersion,
} from '../../lib/studio/film';
import { Card, Label, NoData, useActive, usd } from './common';
import {
  PRESETS,
  assetGraph,
  budgetTier,
  costLadder,
  diagSummary,
  presetById,
  productionPlan,
  savedVsPremium,
  type DiagItem,
} from '../../../server/jev/studio/film';
import { filmSmokeTest, type SmokeResult } from '../../../server/jev/studio/smoke';
import { spent } from '../../../server/jev/studio/blueprint';
import { STYLE_PRESETS, dimensionOf, styleTag, type Dimension } from '../../../server/jev/studio/style';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import { estimateVideo, estimateImage, type Candidate } from '../../../server/jev/studio/cost';
import { historyFor } from '../../lib/studio/exec';
import type { AssetMeta } from '../../../server/jev/studio/types';

const dlText = (name: string, text: string, mime: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

// ───────── production wizard ─────────
export function ProductionWizard() {
  const S = useStudio();
  const [idea, setIdea] = useState('');
  const [dim, setDim] = useState<Dimension>('2D');
  const [preset, setPreset] = useState('tiktok');
  const p = presetById(preset);
  const [duration, setDuration] = useState(String(p.duration));
  const [aspect, setAspect] = useState(p.aspect);
  const [language, setLanguage] = useState('fr');
  const [audience, setAudience] = useState('');
  const [realism, setRealism] = useState('20');
  const [dialogue, setDialogue] = useState(p.dialogue);
  const [music, setMusic] = useState(true);
  const [sfx, setSfx] = useState(true);
  const [subs, setSubs] = useState(true);
  const [open, setOpen] = useState(false);
  const pick = (id: string) => {
    const x = presetById(id);
    setPreset(id);
    setDuration(String(x.duration));
    setAspect(x.aspect);
    setDialogue(x.dialogue);
  };
  const create = () => {
    if (!idea.trim()) return;
    S.createProject(idea.trim(), {
      dimension: dim,
      duration: Math.max(5, Number(duration) || p.duration),
      aspect,
      language,
      platform: p.platform,
      audience,
      realism: Math.max(0, Math.min(100, Number(realism) || 0)),
      dialogue,
      music,
      sfx,
      subtitles: subs,
      preset: p.label,
    });
    setIdea('');
  };
  return (
    <Card title="START NEW PRODUCTION" testId="studio-wizard">
      <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Dimension">
        <Label>STEP 01 · IDEA</Label>
        <div className="ml-auto flex gap-1">
          {(['2D', '3D'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDim(d)}
              data-testid={`dim-${d}`}
              aria-pressed={dim === d}
              title={STYLE_PRESETS[d].name}
              className={`rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${dim === d ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-hover'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <Textarea
        data-testid="studio-idea"
        rows={3}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Décris ton idée… Ex. : Une vidéo humoristique sénégalaise de 60 s où une belle-mère arrive chez son gendre"
      />
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid="wizard-presets">
        {PRESETS.map((x) => (
          <button
            key={x.id}
            type="button"
            title={x.note}
            onClick={() => pick(x.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${preset === x.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-hover'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <button type="button" className="mt-2 text-[12px] text-accent" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Options (durée, format, langue, public, réalisme, dialogue, musique, SFX,
        sous-titres)
      </button>
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-4" data-testid="wizard-options">
          <div>
            <Label>Durée (s)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div>
            <Label>Format</Label>
            <Select
              value={aspect}
              onChange={setAspect}
              options={['9:16', '16:9', '1:1', '4:5', '21:9'].map((v) => ({ value: v, label: v }))}
            />
          </div>
          <div>
            <Label>Langue</Label>
            <Select
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'fr', label: 'français' },
                { value: 'wo', label: 'wolof' },
                { value: 'en', label: 'anglais' },
                { value: 'fr+wo', label: 'français + wolof' },
              ]}
            />
          </div>
          <div>
            <Label>Réalisme (0 = très stylisé)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={realism}
              onChange={(e) => setRealism(e.target.value)}
            />
          </div>
          <div className="md:col-span-4">
            <Label>Public visé</Label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="ex. : 18-35 ans, Dakar, humour de situation"
            />
          </div>
          <Toggle checked={dialogue} onChange={setDialogue} label="Dialogue" />
          <Toggle checked={music} onChange={setMusic} label="Musique" />
          <Toggle checked={sfx} onChange={setSfx} label="SFX" />
          <Toggle checked={subs} onChange={setSubs} label="Sous-titres" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={create} disabled={!idea.trim()} data-testid="studio-create">
          Créer la production {dim}
        </Button>
        <span className="text-[12px] text-faint">
          Style : {STYLE_PRESETS[dim].name} · {p.label} · {aspect} · {duration} s · plafond{' '}
          {S.settings.cap.toFixed(2)} $ · Video Factory {S.settings.videoEnabled ? 'ACTIVE' : 'désactivée'}
        </span>
      </div>
    </Card>
  );
}

// ───────── DIAGNOSE / versions / plan / smoke ─────────
const TONE = { ok: 'ok', fail: 'err', warn: 'warn', na: 'neutral' } as const;
const ICON = { ok: '✓', fail: '✗', warn: '!', na: '·' } as const;
export function FilmTools() {
  const bp = useActive();
  const S = useStudio();
  const toast = useStore((x) => x.toast);
  const [diag, setDiag] = useState<DiagItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [smoke, setSmoke] = useState<SmokeResult[] | null>(null);
  const [plan, setPlan] = useState(false);
  if (!bp) return null;
  const id = bp.project.id;
  const sum = diag ? diagSummary(diag) : null;
  const tier = budgetTier(spent(bp), bp.cap);
  return (
    <div className="space-y-3" data-testid="film-tools">
      <Card
        title="DIAGNOSE PRODUCTION"
        right={
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setDiag(await diagnoseProduction(id));
              } finally {
                setBusy(false);
              }
            }}
            data-testid="diagnose-run"
          >
            {busy ? 'Vérification…' : 'DIAGNOSE PRODUCTION'}
          </Button>
        }
      >
        {!diag ? (
          <NoData>
            Lance le diagnostic : clé, OpenRouter, modèles, scène, référence, budget, polling, stockage,
            lecture, export. Aucun appel payant.
          </NoData>
        ) : (
          <div data-testid="diagnose-result">
            <div className="mb-1 text-[12px] text-faint">
              {sum!.ok} ok · {sum!.fail} en échec · {sum!.warn} avertissement(s) · {sum!.na} non applicable(s)
            </div>
            <ul className="space-y-0.5 text-[12.5px]">
              {diag.map((d) => (
                <li key={d.id} className="flex flex-wrap items-start gap-2">
                  <Badge tone={TONE[d.status]}>
                    {ICON[d.status]} {d.label}
                  </Badge>
                  <span className="min-w-0 flex-1 text-muted">{d.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card title="Budget Governor" testId="budget-governor">
        <div className="text-[12.5px]">
          <Badge tone={tier.tier === 'normal' ? 'ok' : tier.tier === 'hard-stop' ? 'err' : 'warn'}>
            {tier.label}
          </Badge>{' '}
          {usd(spent(bp))} dépensés sur {bp.cap.toFixed(2)} $ ({(tier.ratio * 100).toFixed(0)} %) —{' '}
          {tier.effect}.
          <div className="mt-1 text-faint">
            &lt; 50 % normal · 50–80 % optimisation · 80–95 % économie · &gt; 95 % premium stoppé · 100 %
            arrêt total.
          </div>
        </div>
      </Card>
      <Card title="Versions de production" testId="film-versions">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="nom de la version"
          />
          <Button
            size="sm"
            onClick={() => {
              saveProductionVersion(id, label);
              setLabel('');
            }}
            data-testid="version-save"
          >
            Enregistrer une version
          </Button>
        </div>
        {!bp.versions?.length ? (
          <div className="mt-2">
            <NoData>Aucune version enregistrée.</NoData>
          </div>
        ) : (
          <ul className="mt-2 space-y-1 text-[12.5px]" data-testid="version-list">
            {[...bp.versions].reverse().map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 rounded border border-line p-1.5">
                <b>{v.label}</b>
                <span className="text-faint">
                  {new Date(v.at).toLocaleString()} · {v.scenes} scène(s) · {v.assets} asset(s) · coût{' '}
                  {usd(v.cost)} · qualité {v.quality ?? 'non mesurée'} · {v.models.length} modèle(s)
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    if (restoreProductionVersion(id, v.id))
                      toast(
                        'ok',
                        `« ${v.label} » restaurée (les coûts réels et les assets générés depuis sont conservés)`,
                      );
                  }}
                >
                  RESTORE VERSION
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card
        title="Plan de production (JSON)"
        right={
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setPlan(!plan)}>
              {plan ? 'Masquer' : 'Afficher'}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                dlText(`plan-${id}.json`, JSON.stringify(productionPlan(bp), null, 2), 'application/json')
              }
            >
              Exporter
            </Button>
          </div>
        }
      >
        {plan ? (
          <pre
            className="max-h-72 overflow-auto rounded-lg border border-line p-2 text-[11px]"
            data-testid="plan-json"
          >
            {JSON.stringify(productionPlan(bp), null, 2)}
          </pre>
        ) : (
          <div className="text-[12px] text-faint">
            Structure complète (production, histoire, personnages, lieux, style, scènes, dialogues, voix, son,
            musique, sous-titres, montage, export) lue dans la production. Style :{' '}
            {STYLE_PRESETS[dimensionOf(bp.styleDNA)].name}.
          </div>
        )}
      </Card>
      <Card
        title="AI FILM STUDIO SMOKE TEST"
        right={
          <Button size="sm" onClick={() => setSmoke(filmSmokeTest())} data-testid="smoke-run">
            Lancer
          </Button>
        }
      >
        {!smoke ? (
          <div className="text-[12px] text-faint">
            Auto-test des moteurs avec une production synthétique en mémoire : aucun appel réseau, aucun coût,
            rien n’est enregistré ni mélangé à vos productions.
          </div>
        ) : (
          <ul className="space-y-0.5 text-[12.5px]" data-testid="smoke-result">
            {smoke.map((r) => (
              <li key={r.name} className={r.ok ? 'text-ok' : 'text-err'}>
                {r.ok ? '✓' : '✗'} {r.name} <span className="text-faint">{r.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="hidden">{S.settings.mode}</div>
    </div>
  );
}

// ───────── asset graph ─────────
export function AssetGraphPanel() {
  const bp = useActive();
  const S = useStudio();
  const g = useMemo(() => (bp ? assetGraph(bp, S.assets) : null), [bp, S.assets]);
  if (!bp || !g) return null;
  return (
    <Card title="ASSET GRAPH" testId="asset-graph">
      <div className="text-[12px] text-faint">
        {g.nodes.length} nœud(s) · {g.edges.length} relation(s) (
        {g.edges.filter((e) => e.source === 'recorded').length} enregistrée(s) à la génération,{' '}
        {g.edges.filter((e) => e.source === 'derived').length} déduite(s) du storyboard).
      </div>
      <ul className="mt-2 space-y-1 text-[12.5px]">
        {g.chains.map((c) => (
          <li key={c.sceneId} className="flex flex-wrap items-center gap-1">
            <b className="mr-1">{c.sceneId}</b>
            {c.parts.map((x, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-faint">→</span>}
                <Badge tone={x.includes('✗') ? 'neutral' : 'ok'}>{x}</Badge>
              </span>
            ))}
          </li>
        ))}
      </ul>
      {g.edges.length > 0 && (
        <details className="mt-2 text-[11.5px] text-muted">
          <summary className="cursor-pointer">Relations</summary>
          <ul className="mt-1 space-y-0.5">
            {g.edges.map((e, i) => (
              <li key={i}>
                {e.from.slice(-14)} → {e.to.slice(-14)} · {e.rel} ·{' '}
                <i>{e.source === 'recorded' ? 'enregistrée' : 'déduite'}</i>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

// ───────── cost intelligence ─────────
export function CostIntelligence() {
  const bp = useActive();
  const S = useStudio();
  const [sceneId, setSceneId] = useState('');
  if (!bp) return null;
  const reg = S.registry;
  const sc = bp.scenes.find((s) => s.scene_id === sceneId) ?? bp.scenes[0];
  const mk = (kind: 'video' | 'image'): Candidate[] => {
    if (!reg || !sc) return [];
    const models =
      kind === 'video'
        ? modelsWith(reg, 'video', 'VIDEO_GENERATION')
        : modelsWith(reg, 'image', 'IMAGE_GENERATION');
    return models.map((m) => ({
      model: m,
      estimate:
        kind === 'video'
          ? estimateVideo(m, {
              duration: Math.min(sc.duration, 8),
              resolution: m.video?.resolutions[0],
              audio: false,
              mode: 'image',
            })
          : estimateImage(m, { n: 1 }),
      history: historyFor(
        {
          kind,
          task: kind === 'video' ? 'I2V' : 'SCENE-IMAGE',
          style: styleTag(bp.styleDNA),
          risk: 'normal',
          contract: bp.aspect,
        },
        m.id,
      ),
    }));
  };
  const rows = (['image', 'video'] as const).map((k) => ({ k, l: costLadder(mk(k)) }));
  const actualVideo = S.jobs
    .filter(
      (j) =>
        j.projectId === bp.project.id && j.kind === 'video' && j.sceneId === sc?.scene_id && j.cost !== null,
    )
    .reduce((a, j) => a + (j.cost ?? 0), 0);
  const failed = S.jobs.filter((j) => j.projectId === bp.project.id && j.status === 'FAILED').length;
  const teacher = bp.costs.filter((c) => c.learning).reduce((a, c) => a + c.amount, 0);
  return (
    <Card title="COST INTELLIGENCE" testId="cost-intel">
      {!reg || !sc ? (
        <NoData>Registre des modèles non chargé ou aucune scène.</NoData>
      ) : (
        <>
          <div className="mb-2 max-w-xs">
            <Select
              value={sc.scene_id}
              onChange={setSceneId}
              options={bp.scenes.map((s) => ({ value: s.scene_id, label: s.scene_id }))}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-faint">
                  <th>Type</th>
                  <th>CHEAPEST CAPABLE</th>
                  <th>BEST VALUE</th>
                  <th>CHAMPION</th>
                  <th>PREMIUM (prix annoncé)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ k, l }) => (
                  <tr key={k} className="border-t border-line align-top">
                    <td className="py-1 font-semibold">{k}</td>
                    <td>
                      {l.cheapestCapable ? `${l.cheapestCapable.model} · ${usd(l.cheapestCapable.usd)}` : '—'}
                    </td>
                    <td>
                      {l.bestValue ? (
                        `${l.bestValue.model} · q ${l.bestValue.quality.toFixed(0)} / ${usd(l.bestValue.usd)}`
                      ) : (
                        <span className="text-faint">{l.bestValueWhy}</span>
                      )}
                    </td>
                    <td>
                      {l.champion ? (
                        `${l.champion.model} · ${usd(l.champion.usd)}`
                      ) : (
                        <span className="text-faint">aucun champion validé</span>
                      )}
                    </td>
                    <td>
                      {l.premium ? `${l.premium.model} · ${usd(l.premium.usd)}` : '—'}
                      {k === 'video' &&
                        l.premium &&
                        actualVideo > 0 &&
                        savedVsPremium(actualVideo, l.premium.usd) !== null && (
                          <div className="text-ok">
                            économisé vs ce prix : {usd(savedVsPremium(actualVideo, l.premium.usd))}
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-[12px] md:grid-cols-4">
            <div>
              <Label>Coût réel vidéo (scène)</Label>
              {usd(actualVideo)}
            </div>
            <div>
              <Label>Jobs en échec (projet)</Label>
              {failed}
            </div>
            <div>
              <Label>Teacher (investissement)</Label>
              {usd(teacher)}
            </div>
            <div>
              <Label>Surcoût JEV</Label>
              {usd(0)} <span className="text-faint">(orchestration locale)</span>
            </div>
          </div>
          <div className="mt-1 text-[11.5px] text-faint">
            {rows[1]!.l.premiumWhy}. Les économies ne sont affichées que lorsque le coût réel ET le prix de
            référence sont connus.
          </div>
        </>
      )}
    </Card>
  );
}

// ───────── video quality gate (inside the video card) ─────────
export function GatePanel({
  asset,
  projectId,
  sceneId,
}: {
  asset?: AssetMeta;
  projectId: string;
  sceneId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!asset) return null;
  const g = asset.gate;
  const tone = !g
    ? 'neutral'
    : g.status === 'VALIDATED'
      ? 'ok'
      : g.status === 'REJECTED'
        ? 'err'
        : g.status === 'NEEDS_REVIEW'
          ? 'warn'
          : 'neutral';
  return (
    <div className="mt-2 rounded-lg border border-line p-2 text-[12px]" data-testid="video-gate">
      <div className="flex flex-wrap items-center gap-2">
        <b>VIDEO QUALITY GATE</b>
        <Badge tone={tone}>{g?.status ?? 'GENERATED'}</Badge>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              await runVideoGate(asset.id, { aspect: useStudio.getState().projects[projectId]?.aspect });
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          data-testid="gate-run"
        >
          Re-tester (gratuit)
        </Button>
        {sceneId && (
          <Button
            size="sm"
            disabled={busy}
            title="Appel payant à un modèle de vision (une image extraite de la vidéo)"
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                const j = await judgeVideoFrame(projectId, sceneId, asset.id);
                await runVideoGate(asset.id, {
                  aspect: useStudio.getState().projects[projectId]?.aspect,
                  judge: j.scores,
                });
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Évaluer la cohérence (payant)
          </Button>
        )}
      </div>
      {g && (
        <ul className="mt-1 grid gap-x-4 md:grid-cols-2">
          {g.checks.map((c) => (
            <li key={c.id} className={c.ok === null ? 'text-faint' : c.ok ? 'text-ok' : 'text-err'}>
              {c.ok === null ? '·' : c.ok ? '✓' : '✗'} {c.id} — {c.detail}
            </li>
          ))}
        </ul>
      )}
      {err && <div className="mt-1 text-err">{err}</div>}
    </div>
  );
}
