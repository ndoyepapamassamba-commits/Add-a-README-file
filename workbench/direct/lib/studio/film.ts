// AI Film Studio runtime: measures a real video Blob, runs the quality gate, versions, production diagnostics.
// Everything reported here is read from the provider answers, IndexedDB or the browser — nothing is invented.
import { useStudio } from './store';
import { blobs, blobToDataUrl, quota } from './blobs';
import { hasKey, pollVideo } from './net';
import { loadRegistry } from './actions';
import { runText } from './textModel';
import { modelsWith } from '../../../server/jev/studio/capabilities';
import {
  budgetTier,
  diagSummary,
  restoreVersion,
  snapshotVersion,
  videoGate,
  type DiagItem,
  type GateInput,
} from '../../../server/jev/studio/film';
import { spent } from '../../../server/jev/studio/blueprint';
import { extractJson } from '../../../server/jev/studio/story';
import { dimensionOf, type Dimension, STYLE_PRESETS } from '../../../server/jev/studio/style';
import type { AssetMeta, ProductionOptions } from '../../../server/jev/studio/types';

const S = () => useStudio.getState();

export interface VideoMeasure {
  playable: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
  error?: string;
}
/** Loads the Blob in a detached <video> and reads what the browser really sees. */
export function measureVideo(blob: Blob, timeoutMs = 10_000): Promise<VideoMeasure> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const end = (r: VideoMeasure) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const t = setTimeout(
      () => end({ playable: false, duration: null, width: null, height: null, error: 'délai dépassé' }),
      timeoutMs,
    );
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () =>
      end({
        playable: true,
        duration: Number.isFinite(v.duration) ? v.duration : null,
        width: v.videoWidth || null,
        height: v.videoHeight || null,
      });
    v.onerror = () =>
      end({
        playable: false,
        duration: null,
        width: null,
        height: null,
        error: v.error?.message || 'le navigateur ne lit pas ce fichier',
      });
    v.src = url;
  });
}

/** Technical gate on the stored Blob; the result is stored on the asset (gate) and returned. */
export async function runVideoGate(
  assetId: string,
  o: { expectedDuration?: number; aspect?: string; judge?: GateInput['judge'] } = {},
) {
  const meta = S().assets[assetId];
  const blob = await blobs.get(assetId).catch(() => undefined);
  const m = blob ? await measureVideo(blob) : null;
  const g = videoGate({
    providerCompleted: Boolean(meta),
    bytes: blob?.size ?? 0,
    mime: blob?.type || meta?.mime || '',
    playable: m ? m.playable : false,
    duration: m?.duration ?? null,
    width: m?.width ?? null,
    height: m?.height ?? null,
    expected: { duration: o.expectedDuration, aspect: o.aspect },
    judge: o.judge,
  });
  if (meta)
    S().addAsset({ ...meta, gate: { status: g.status, at: Date.now(), checks: g.checks } } as AssetMeta);
  return g;
}

/** One frame of a stored video, as a PNG blob (for the optional vision judge). */
async function frameOf(blob: Blob): Promise<Blob | null> {
  const v = document.createElement('video');
  const url = URL.createObjectURL(blob);
  try {
    v.muted = true;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('lecture impossible'));
      setTimeout(() => rej(new Error('délai dépassé')), 10_000);
    });
    v.currentTime = Math.min(v.duration / 2 || 0, 3);
    await new Promise<void>((res) => {
      v.onseeked = () => res();
      setTimeout(res, 2000);
    });
    const c = document.createElement('canvas');
    c.width = Math.min(640, v.videoWidth || 640);
    c.height = Math.round((c.width * (v.videoHeight || 360)) / (v.videoWidth || 640));
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** OPT-IN, PAID: a vision model judges one frame of the video against its scene. Never runs by itself. */
export async function judgeVideoFrame(projectId: string, sceneId: string, assetId: string) {
  const bp = S().projects[projectId];
  const sc = bp?.scenes.find((s) => s.scene_id === sceneId);
  const blob = await blobs.get(assetId);
  if (!bp || !sc || !blob) throw new Error('scène ou vidéo introuvable');
  const frame = await frameOf(blob);
  if (!frame) throw new Error('image extraite impossible');
  const chars = bp.characters
    .filter((c) => sc.characters.includes(c.name))
    .map((c) => `${c.name}: ${c.consistency}`)
    .join('\n');
  const r = await runText({
    projectId,
    purpose: 'QA vidéo (une image)',
    vision: true,
    maxTokens: 500,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Juge cette image extraite d’une vidéo ${dimensionOf(bp.styleDNA)} (style : ${bp.styleDNA.renderStyle}).\nScène : ${sc.action}\nPersonnages attendus :\n${chars || '(non précisés)'}\nJSON uniquement : {"promptAdherence":0-100,"character":0-100,"sceneAdherence":0-100,"motion":0-100,"consistency":0-100}. Une seule image : « motion » juge uniquement la plausibilité de la pose. Sois sévère.`,
          },
          { type: 'image_url', image_url: { url: await blobToDataUrl(frame) } },
        ],
      },
    ],
  });
  const j = (extractJson(r.text) ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof j[k] === 'number' ? Math.max(0, Math.min(100, j[k] as number)) : null);
  const vals = {
    promptAdherence: n('promptAdherence'),
    character: n('character'),
    sceneAdherence: n('sceneAdherence'),
    motion: n('motion'),
    consistency: n('consistency'),
  };
  if (Object.values(vals).some((v) => v === null)) throw new Error('le juge n’a pas renvoyé tous les scores');
  return { model: r.model, scores: vals as NonNullable<GateInput['judge']> };
}

// ───────── versions ─────────
export function saveProductionVersion(projectId: string, label: string) {
  const bp = S().projects[projectId];
  if (bp)
    S().patchProject(
      projectId,
      (b) => snapshotVersion(b, label),
      `version « ${label || 'sans nom'} » enregistrée`,
    );
}
export function restoreProductionVersion(projectId: string, versionId: string): boolean {
  const bp = S().projects[projectId];
  const r = bp ? restoreVersion(bp, versionId) : null;
  if (!r) return false;
  S().patchProject(projectId, () => r, 'version restaurée');
  return true;
}

// ───────── production creation with the wizard options ─────────
export interface WizardInput extends Partial<ProductionOptions> {
  idea: string;
  dimension: Dimension;
  duration: number;
  aspect: string;
  language: string;
  platform: string;
}
export function createProductionFromWizard(w: WizardInput) {
  const bp = S().createProject(w.idea, { ...w });
  return bp;
}
export { STYLE_PRESETS };

// ───────── DIAGNOSE PRODUCTION ─────────
export async function diagnoseProduction(projectId: string | null): Promise<DiagItem[]> {
  const out: DiagItem[] = [];
  const add = (id: string, label: string, status: DiagItem['status'], detail: string) =>
    out.push({ id, label, status, detail });
  add(
    'key',
    'API KEY',
    hasKey() ? 'ok' : 'fail',
    hasKey()
      ? 'clé OpenRouter présente (jamais affichée)'
      : 'aucune clé OpenRouter : toute génération payante échouera',
  );
  let reg: Awaited<ReturnType<typeof loadRegistry>> | null = null;
  try {
    reg = await loadRegistry();
    const okSrc = reg.sources.filter((x) => x.ok).length;
    add(
      'net',
      'OPENROUTER',
      okSrc ? 'ok' : 'fail',
      `${okSrc}/${reg.sources.length} catalogue(s) joignable(s)${
        reg.sources.some((x) => !x.ok)
          ? ` — en échec : ${reg.sources
              .filter((x) => !x.ok)
              .map((x) => x.endpoint)
              .join(', ')}`
          : ''
      }`,
    );
  } catch (e) {
    add('net', 'OPENROUTER', 'fail', (e as Error).message);
  }
  if (reg) {
    const n = (k: 'image' | 'video' | 'speech' | 'music') => reg!.models.filter((m) => m.kind === k).length;
    add('img', 'IMAGE MODELS', n('image') ? 'ok' : 'fail', `${n('image')} modèle(s)`);
    const vid = modelsWith(reg, 'video', 'VIDEO_GENERATION');
    add(
      'vid',
      'VIDEO MODEL',
      vid.length ? 'ok' : 'fail',
      `${vid.length} modèle(s) vidéo, dont ${modelsWith(reg, 'video', 'VIDEO_GENERATION', 'IMAGE_TO_VIDEO').length} image→vidéo et ${modelsWith(reg, 'video', 'VIDEO_GENERATION', 'AUDIO').length} avec audio natif`,
    );
    add('spk', 'SPEECH MODELS', n('speech') ? 'ok' : 'warn', `${n('speech')} modèle(s) de synthèse vocale`);
    add(
      'aud',
      'AUDIO / MUSIC MODELS',
      n('music') ? 'ok' : 'na',
      n('music')
        ? `${n('music')} modèle(s)`
        : 'NOT AVAILABLE : aucun modèle audio/musique découvert (la musique locale WebAudio reste disponible)',
    );
  }
  const bp = projectId ? S().projects[projectId] : undefined;
  if (!bp) {
    add('proj', 'PRODUCTION', 'na', 'aucune production active');
  } else {
    const withImg = bp.scenes.filter((s) => s.imageAssetId);
    add(
      'scene',
      'SCENES',
      bp.scenes.length ? 'ok' : 'fail',
      `${bp.scenes.length} scène(s), ${withImg.length} avec image de référence`,
    );
    add(
      'ref',
      'IMAGE REFERENCE',
      withImg.length ? 'ok' : 'warn',
      withImg.length
        ? `${withImg.length} image(s) utilisable(s) en image→vidéo`
        : 'aucune image de scène : seul le texte→vidéo est possible',
    );
    const t = budgetTier(spent(bp), bp.cap);
    add(
      'budget',
      'BUDGET',
      t.tier === 'hard-stop' ? 'fail' : t.tier === 'normal' ? 'ok' : 'warn',
      `${spent(bp).toFixed(4)} $ / ${bp.cap.toFixed(2)} $ — palier ${t.label} : ${t.effect}`,
    );
    const st = S().settings;
    add(
      'vf',
      'VIDEO FACTORY',
      st.videoEnabled ? 'ok' : 'na',
      st.videoEnabled
        ? `activée, budget vidéo ${st.videoBudget.toFixed(2)} $`
        : 'désactivée (par défaut) : aucun appel vidéo ne sera fait',
    );
    const jobs = S().jobs.filter((j) => j.projectId === projectId && j.kind === 'video');
    const running = jobs.filter((j) => j.status === 'RUNNING');
    if (!running.length)
      add('poll', 'POLLING', 'na', `aucun job vidéo en cours (${jobs.length} job(s) au total)`);
    for (const j of running) {
      if (!j.pollingUrl) {
        add(
          `poll-${j.id}`,
          `JOB ${j.id.slice(-6)}`,
          'warn',
          'job RUNNING sans polling URL : jamais soumis au fournisseur',
        );
        continue;
      }
      try {
        const p = await pollVideo(j.pollingUrl);
        add(`poll-${j.id}`, `JOB ${j.id.slice(-6)} POLLING`, 'ok', `fournisseur : ${p.status}`);
      } catch (e) {
        add(`poll-${j.id}`, `JOB ${j.id.slice(-6)} POLLING`, 'fail', (e as Error).message.slice(0, 160));
      }
    }
    const last = jobs
      .filter((j) => j.status === 'COMPLETED' && j.assetId)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
    if (!last) add('last', 'LAST VIDEO', 'na', 'aucune vidéo terminée à vérifier');
    else {
      add(
        'job',
        'JOB',
        'ok',
        `${last.id.slice(-6)} COMPLETED, coût réel ${last.cost === null ? 'non mesuré' : `${last.cost.toFixed(4)} $`}`,
      );
      const asset = S().assets[last.assetId!];
      add(
        'asset',
        'ASSET',
        asset ? 'ok' : 'fail',
        asset ? `${asset.id} (${asset.status})` : 'métadonnées d’asset absentes',
      );
      const blob = await blobs.get(last.assetId!).catch(() => undefined);
      add(
        'blob',
        'BLOB',
        blob ? 'ok' : 'fail',
        blob
          ? `${blob.type || 'MIME inconnu'} · ${(blob.size / 1e6).toFixed(2)} Mo`
          : 'Blob absent d’IndexedDB (données du site effacées ?)',
      );
      if (blob) {
        const m = await measureVideo(blob);
        add(
          'play',
          'PLAYBACK',
          m.playable ? 'ok' : 'fail',
          m.playable
            ? `lisible · ${m.duration?.toFixed(1) ?? '?'} s · ${m.width}×${m.height}`
            : `illisible : ${m.error ?? 'inconnu'}`,
        );
        add(
          'export',
          'EXPORT',
          typeof URL.createObjectURL === 'function' ? 'ok' : 'fail',
          'téléchargement par URL d’objet disponible',
        );
      }
    }
  }
  try {
    const id = `diag-${Date.now().toString(36)}`;
    await blobs.put(id, new Blob(['ok'], { type: 'text/plain' }));
    const back = await blobs.get(id);
    await blobs.del(id);
    const q = await quota();
    add(
      'idb',
      'ASSET STORAGE',
      back ? (q.warn ? 'warn' : 'ok') : 'fail',
      `écriture/lecture IndexedDB ${back ? 'réussies' : 'échouées'}${q.ratio !== null ? ` · quota ${(q.ratio * 100).toFixed(1)} %` : ''}`,
    );
  } catch (e) {
    add('idb', 'ASSET STORAGE', 'fail', (e as Error).message);
  }
  void diagSummary;
  return out;
}
