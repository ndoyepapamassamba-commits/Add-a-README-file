import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlanSchema, heuristicPlan, normalizePlan, parsePlan, pipelineSummary } from '../../server/jev/videogen/plan';
import { HUMAN_RIG, bake, qJoint } from '../../server/jev/videogen/animate';
import { sceneSpec } from '../../server/jev/videogen/assets';
import { planToBpy } from '../../server/jev/videogen/bpy';
import { cameraState, eulerianSample, heuristicDepth, motionField, outputSize, suggestFromPrompt } from '../../server/jev/videogen/imageMotion';
import {
  DEFAULT_SCENE,
  DepthTracker,
  alignScaleShift,
  blockFlow,
  depthAt,
  keyframeStride,
  outputSizeFor,
  quantize,
  sceneFromPrompt,
  toLuma,
  trackSize,
  warpByFlow,
} from '../../server/jev/videogen/videoDepth';

const PROMPT = 'Deux amis marchent au marché Sandaga à Dakar au coucher du soleil, l’un salue la caméra, 12 secondes, « Le grand marché »';

describe('Générateur vidéo — plan de scène (server/jev/videogen/plan.ts)', () => {
  it('comprend une idée sans modèle : lieu, heure, personnages, actions, titre, durée — et le plan est valide', () => {
    const p = heuristicPlan(PROMPT);
    expect(PlanSchema.safeParse(p).success).toBe(true);
    expect(p.environment.preset).toBe('market');
    expect(p.style.timeOfDay).toBe('dusk');
    expect(p.seconds).toBe(12);
    expect(p.characters.length).toBe(2);
    expect(p.title).toBe('Le grand marché');
    const acts = p.shots.flatMap((s) => s.actions.map((a) => a.action));
    expect(acts).toContain('walk');
    expect(acts).toContain('wave');
    // Shots cover the whole duration without gaps.
    const end = p.shots.at(-1)!;
    expect(end.start + end.duration).toBeCloseTo(12, 1);
  });
  it('« marchent » n’est pas un marché ; le titre n’est pas « Une vidéo de 4 secondes »', () => {
    const p = heuristicPlan('Une vidéo de 4 secondes : des enfants marchent dans la forêt');
    expect(p.environment.preset).toBe('forest');
    expect(p.title).not.toMatch(/^une vid/i);
  });
  it('répare une sortie de modèle imparfaite (normalizePlan / parsePlan) au lieu d’échouer', () => {
    const raw = { title: 'Test', seconds: 500, format: '4:3', style: { look: 'pixar' }, characters: [{ id: 'Bad Id!', kind: 'human' }], shots: [{ camera: { move: 'spin' }, actions: [{ who: 'x', action: 'fly' }] }] };
    const p = normalizePlan(raw, { seconds: 8 });
    expect(PlanSchema.safeParse(p).success).toBe(true);
    const viaText = parsePlan('Voici le plan :\n```json\n' + JSON.stringify(heuristicPlan(PROMPT)) + '\n```');
    expect(viaText?.environment.preset).toBe('market');
    expect(parsePlan('pas de JSON ici')).toBeNull();
    expect(pipelineSummary(p).length).toBe(7);
  });
});

describe('Générateur vidéo — animation et scène partagées WebGL / Blender', () => {
  const plan = heuristicPlan(PROMPT, { seconds: 4 });
  it('bake : une image par 1/fps, chaque personnage a toutes ses articulations (quaternions unitaires), la caméra suit les plans', () => {
    const b = bake(plan, 24);
    expect(b.frames).toBe(96);
    expect(b.cams.length).toBe(96);
    for (const c of plan.characters) {
      const fr = b.chars[c.id]!;
      expect(fr.length).toBe(96);
      const q = fr[40]!.joints;
      expect(Object.keys(q).length).toBe(HUMAN_RIG.length);
      for (const v of Object.values(q)) expect(Math.hypot(...(v as number[]))).toBeCloseTo(1, 3); // stored with 4 decimals
    }
    // Walking moves the character.
    const c1 = b.chars[plan.characters[0]!.id]!;
    const moved = Math.hypot(c1[95]!.pos[0] - c1[0]!.pos[0], c1[95]!.pos[2] - c1[0]!.pos[2]);
    expect(moved).toBeGreaterThan(0.2);
    expect(Math.hypot(...qJoint(0.3, 0.2, 0.1))).toBeCloseTo(1, 6);
  });
  it('sceneSpec est déterministe (même plan → même décor), donc WebGL et Blender montrent la même scène', () => {
    const a = JSON.stringify(sceneSpec(plan));
    const b = JSON.stringify(sceneSpec(structuredClone(plan)));
    expect(a).toBe(b);
    expect(sceneSpec(plan).world.length).toBeGreaterThan(10);
  });
  it('planToBpy produit un script Python syntaxiquement valide (vérifié par ast.parse)', () => {
    const py = planToBpy(plan, { fps: 24, step: 2, exports: ['glb', 'usd'] });
    expect(py).toContain('import bpy');
    const dir = mkdtempSync(join(tmpdir(), 'bpy-'));
    const f = join(dir, 'scene.py');
    writeFileSync(f, py);
    let ok = true;
    try {
      execFileSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read())', f], { stdio: 'pipe' });
    } catch (e) {
      ok = (e as { code?: string }).code === 'ENOENT'; // no Python: nothing to check
      if (!ok) throw e;
    }
    expect(ok).toBe(true);
  });
});

describe('Générateur vidéo — image → vidéo (imageMotion.ts)', () => {
  it('caméras : le travelling avant avance, le plan fixe ne bouge pas', () => {
    expect(cameraState('travelling_avant', 1).dolly!).toBeGreaterThan(cameraState('travelling_avant', 0).dolly ?? 0);
    const f0 = cameraState('fixe_vivant', 0);
    const f1 = cameraState('fixe_vivant', 1);
    expect(f1.ox).toBeCloseTo(f0.ox, 6);
    expect(suggestFromPrompt('orbite autour, pluie').preset).toBe('orbite');
  });
  it('profondeur heuristique : le bas de l’image est plus proche que le haut', () => {
    const w = 32, h = 32;
    const rgba = new Uint8Array(w * h * 4).fill(128);
    const d = heuristicDepth(rgba, w, h);
    expect(d[(h - 2) * w + 16]!).toBeGreaterThan(d[1 * w + 16]!);
  });
  it('boucle eulérienne sans couture : à t = 0 et t = T l’échantillonnage est le même', () => {
    const a = eulerianSample(10, 10, [1, 0], 0, 4);
    const b = eulerianSample(10, 10, [1, 0], 4, 4);
    const pick = (s: typeof a) => (s.mix < 0.5 ? s.a : s.b);
    expect(pick(a)[0]).toBeCloseTo(pick(b)[0], 3);
    const field = motionField(16, 16, { strokes: [{ points: [[0.1, 0.5], [0.9, 0.5]], strength: 1 }] });
    expect(field.length).toBe(16 * 16 * 2);
    expect(outputSize('9:16', 1000, 1000)[1]).toBeGreaterThan(outputSize('9:16', 1000, 1000)[0]);
  });
});

describe('Vidéo → scène 3D (videoDepth.ts) — pixels d’origine + profondeur par image', () => {
  const w = 64, h = 48;
  // A textured picture (so motion can be seen) shifted by `s` pixels to the right.
  const frame = (s: number) => {
    const l = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l[y * w + x] = Math.round(128 + 60 * Math.sin((x - s) * 0.45) + 50 * Math.cos(y * 0.37));
    return l;
  };
  // Depth: a near disc (1) centred at cx on a far background (0.2).
  const disc = (cx: number) => {
    const d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = Math.hypot(x - cx, y - 24) < 10 ? 1 : 0.2;
    return d;
  };
  it('le flot optique par blocs retrouve un déplacement de 3 pixels', () => {
    const f = blockFlow(frame(0), frame(3), w, h, 8, 6);
    const mid = f.dx[Math.floor(f.bh / 2) * f.bw + Math.floor(f.bw / 2)]!;
    expect(mid).toBe(-3); // cur(p) ≈ prev(p − 3)
  });
  it('la profondeur propagée suit le mouvement entre deux images clés', () => {
    const f = blockFlow(frame(0), frame(3), w, h, 8, 6);
    const warped = warpByFlow(disc(30), w, h, f);
    // The near disc is now around x = 33.
    expect(warped[24 * w + 41]!).toBeGreaterThan(0.9);
    expect(warped[24 * w + 19]!).toBeLessThan(0.5);
  });
  it('recalage échelle + décalage par moindres carrés (la profondeur monoculaire est relative)', () => {
    const ref = disc(30);
    const cur = new Float32Array(ref.length);
    for (let i = 0; i < cur.length; i++) cur[i] = (ref[i]! - 0.1) / 2; // s = 2, t = 0.1
    const { s, t } = alignScaleShift(ref, cur, 1);
    expect(s).toBeCloseTo(2, 3);
    expect(t).toBeCloseTo(0.1, 3);
  });
  it('suivi temporel : pas de scintillement quand le modèle renvoie la même scène à une autre échelle', () => {
    const tr = new DepthTracker(w, h);
    const a = Float32Array.from(tr.push(frame(0), disc(30)));
    const noisy = disc(30).map((v) => v * 0.5 + 0.3); // same scene, other scale/shift (per-frame normalisation of a model)
    const b = tr.push(frame(0), noisy);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    expect(diff / a.length).toBeLessThan(0.02);
  });
  it('rythme des images clés tenu au budget mesuré, et lecture d’une piste à n’importe quel instant', () => {
    expect(keyframeStride(450, 100, 45_000)).toBe(1); // 45 s for 450 frames at 100 ms
    expect(keyframeStride(450, 1500, 45_000)).toBe(12); // capped
    expect(keyframeStride(225, 800, 45_000)).toBe(4);
    const track = { frames: [new Uint8Array([0, 100]), new Uint8Array([200, 100])], w: 2, h: 1, fps: 10, source: 'test', keyframes: 2, stride: 1, ms: 0 };
    expect(Array.from(depthAt(track, 0.05))).toEqual([100, 100]);
    expect(Array.from(depthAt(track, 5))).toEqual([200, 100]);
    expect(Array.from(quantize(new Float32Array([0, 0.5, 1, 2])))).toEqual([0, 128, 255, 255]);
  });
  it('tailles : la piste de profondeur garde le format ; la sortie ne grossit jamais les pixels d’origine', () => {
    expect(trackSize(1080, 1920)).toEqual([162, 288]);
    expect(outputSizeFor(1080, 1920, 1080)).toEqual([608, 1080]);
    expect(outputSizeFor(720, 1280, 1920)).toEqual([720, 1280]);
    expect(toLuma(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)[0]).toBeGreaterThan(250);
  });
  it('le prompt règle le style, la caméra et les effets', () => {
    const s = sceneFromPrompt('hologramme en orbite avec de la neige et une brume légère');
    expect(s.style).toBe('holo');
    expect(s.preset).toBe('orbite');
    expect(s.effects.snow && s.effects.fog).toBe(true);
    expect(s.relief).toBe(0.3);
    expect(sceneFromPrompt('nuage de points, travelling avant').style).toBe('nuage');
    expect(DEFAULT_SCENE.audio).toBe(true);
  });
});
