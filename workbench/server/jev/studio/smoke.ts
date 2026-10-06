// AI FILM STUDIO SMOKE TEST — runs the pure engines on a synthetic in-memory production.
// No network, no cost, nothing stored. Reports exactly what passed; it never claims a real generation happened.
import { newBlueprint, serialize } from './blueprint';
import { STYLE_PRESETS, dimensionOf } from './style';
import { compileScene } from './genome';
import { autoTimeline } from './timeline';
import { timeSubtitles, toSrt } from './subtitles';
import { buildKit, validateKit } from './kit';
import {
  budgetTier,
  effectiveMode,
  assetGraph,
  restoreVersion,
  snapshotVersion,
  productionPlan,
  videoGate,
} from './film';
import { talkRoutes } from './video';
import { scanValue } from './secrets';
import type { AssetMeta, Blueprint, Scene } from './types';

export interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
}
const scene = (id: string, chars: string[]): Scene => ({
  scene_id: id,
  act: '1',
  beat: 'hook',
  duration: 6,
  location: 'cour de maison à Dakar',
  time: 'jour',
  characters: chars,
  action: 'la belle-mère arrive avec trois valises',
  dialogue: [
    {
      speaker: chars[0]!,
      text: 'Je reste une semaine seulement',
      language: 'fr',
      emotion: 'smug',
      pace: 1,
    } as never,
  ],
  emotion: 'tension',
  camera: 'plan moyen',
  lighting: 'soleil',
  sound: 'porte',
  music: 'afrobeat',
  transition: 'cut',
  visual_prompt: '',
  video_prompt: '',
  voice_prompt: '',
  subtitle_prompt: '',
  status: 'DRAFT',
});
function sample(dim: '2D' | '3D'): Blueprint {
  let bp = newBlueprint({ id: `smoke-${dim}`, idea: 'smoke', dimension: dim, now: 1 });
  bp = {
    ...bp,
    characters: [
      {
        id: 'c1',
        name: 'MAMAN',
        role: 'belle-mère',
        consistency: 'femme élancée, boubou orange',
        poses: {},
        referenceAssetId: 'a-ref',
      } as never,
    ],
    scenes: [scene('S01', ['MAMAN']), scene('S02', ['MAMAN'])],
  };
  return {
    ...bp,
    scenes: bp.scenes.map((s, i) => ({ ...s, imageAssetId: `a-img-${i}` })),
    assets: ['a-ref', 'a-img-0', 'a-img-1'],
  };
}
export function filmSmokeTest(): SmokeResult[] {
  const out: SmokeResult[] = [];
  const t = (name: string, f: () => string | true) => {
    try {
      const r = f();
      out.push({ name, ok: r === true, detail: r === true ? '' : r });
    } catch (e) {
      out.push({ name, ok: false, detail: (e as Error).message });
    }
  };
  const b2 = sample('2D');
  const b3 = sample('3D');
  t('2D et 3D : deux Style DNA verrouillés distincts', () =>
    dimensionOf(b2.styleDNA) === '2D' &&
    dimensionOf(b3.styleDNA) === '3D' &&
    Object.isFrozen(STYLE_PRESETS['3D']) &&
    b2.styleDNA.id !== b3.styleDNA.id
      ? true
      : 'styles confondus',
  );
  const ctx = (b: Blueprint) => ({
    style: b.styleDNA,
    characters: b.characters,
    worlds: [],
    platform: 'TikTok',
    aspect: '9:16',
  });
  t('prompt de scène : même chemin, vocabulaire de la dimension', () => {
    const p2 = compileScene(b2.scenes[0]!, ctx(b2), 'image').text;
    const p3 = compileScene(b3.scenes[0]!, ctx(b3), 'image').text;
    if (!/2D/.test(p2) || /stylised 3D/.test(p2)) return '2D : vocabulaire incorrect';
    if (!/3D/.test(p3) || /high quality 2D/.test(p3)) return '3D : vocabulaire incorrect';
    if (!/flat 2D/.test(b3.styleDNA.negative)) return 'négatifs 3D absents';
    return true;
  });
  t('montage : une piste vidéo par scène, sous-titres synchronisés', () => {
    const tl = autoTimeline(b3);
    const subs = timeSubtitles(b3.scenes);
    return tl.clips.filter((c) => c.track === 'video').length === 2 &&
      subs.length >= 2 &&
      toSrt(subs).includes('-->')
      ? true
      : 'montage incomplet';
  });
  t('kit local 2D valide', () => {
    const v = validateKit(JSON.parse(JSON.stringify(buildKit(b2))));
    return v.ok ? true : v.errors.join(' ; ');
  });
  t('paliers de budget 50 / 80 / 95 / 100 %', () => {
    const ok =
      budgetTier(0.4, 1).tier === 'normal' &&
      budgetTier(0.5, 1).tier === 'optimize' &&
      budgetTier(0.8, 1).tier === 'cheap-first' &&
      budgetTier(0.96, 1).tier === 'stop-premium' &&
      budgetTier(1, 1).tier === 'hard-stop';
    return ok &&
      effectiveMode('PREMIUM', 0.6, 1) === 'BALANCED' &&
      effectiveMode('QUALITY', 0.85, 1) === 'ECO' &&
      effectiveMode('QUALITY', 0.1, 1) === 'QUALITY'
      ? true
      : 'paliers incorrects';
  });
  t('quality gate : validé / à revoir / rejeté', () => {
    const base = {
      providerCompleted: true,
      bytes: 5e6,
      mime: 'video/webm',
      playable: true,
      duration: 5.1,
      width: 720,
      height: 1280,
      expected: { duration: 5, aspect: '9:16' },
    };
    const a = videoGate(base).status;
    const b = videoGate({ ...base, duration: 12 }).status;
    const c = videoGate({ ...base, mime: 'text/html' }).status;
    const d = videoGate({ ...base, bytes: 0 }).status;
    return a === 'VALIDATED' && b === 'NEEDS_REVIEW' && c === 'REJECTED' && d === 'REJECTED'
      ? true
      : `${a}/${b}/${c}/${d}`;
  });
  t('« Fais parler » : route choisie et jamais masquée', () => {
    const i = { videoEnabled: true, hasSceneImage: true, i2v: 1, i2vNative: 0, tts: 1, dialogueLines: 1 };
    const r = [
      talkRoutes({ ...i, i2vNative: 1 }).selected,
      talkRoutes(i).selected,
      talkRoutes({ ...i, tts: 0 }).selected,
      talkRoutes({ ...i, tts: 0, dimension: '3D' }).selected,
    ];
    return r.join('') === 'BCDN' ? true : r.join('');
  });
  t('graphe d’assets : chaîne personnage → image → vidéo', () => {
    const assets: Record<string, AssetMeta> = {};
    for (const id of b3.assets)
      assets[id] = {
        id,
        kind: 'image',
        status: 'GENERATED_ASSET',
        createdAt: 1,
        cost: 0,
        source: 'x',
        tags: [],
        mime: 'image/png',
        bytes: 1,
        name: id,
        parentIds: id === 'a-img-0' ? ['a-ref'] : undefined,
      };
    const g = assetGraph(
      { ...b3, scenes: b3.scenes.map((s, i) => (i === 0 ? { ...s, videoAssetId: 'a-ref' } : s)) },
      assets,
    );
    return g.edges.some((e) => e.from === 'a-ref' && e.to === 'a-img-0' && e.source === 'recorded') &&
      g.chains[0]!.parts.includes('IMAGE')
      ? true
      : 'relations manquantes';
  });
  t('versions : restauration sans effacer les coûts réels', () => {
    const v1 = snapshotVersion(b3, 'V1', 10);
    const spentMore = {
      ...v1,
      title: 'modifié',
      costs: [{ at: 20, kind: 'image', model: 'm', amount: 0.5, certain: true, note: 'réel' }],
    };
    const back = restoreVersion(spentMore, v1.versions![0]!.id, 30);
    return back && back.title === '' && back.costs.length === 1 && back.versions?.length === 1
      ? true
      : 'restauration incorrecte';
  });
  t('plan de production : complet et sans secret', () => {
    const plan = productionPlan(b3);
    const keys = [
      'production',
      'story',
      'characters',
      'locations',
      'style',
      'scenes',
      'dialogues',
      'voices',
      'sound_design',
      'music',
      'subtitles',
      'editing',
      'export',
    ];
    return keys.every((k) => k in plan) && scanValue(plan).length === 0 ? true : 'plan incomplet';
  });
  t('sécurité : un secret dans une production bloque l’export', () => {
    const leaky = { ...b2, title: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789abcdef' };
    return serialize(leaky).ok === false && serialize(b2).ok === true ? true : 'secret non détecté';
  });
  return out;
}
