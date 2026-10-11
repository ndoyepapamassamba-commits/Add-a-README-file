import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVideoModels } from '../../server/jev/studio/capabilities';
import { priorQuality } from '../../server/jev/studio/director';
import { CIRCUIT, circuitBudget, circuitCap, circuitRate, clipSeconds, clipUsd, pickCircuitModel, planCircuit } from '../../server/jev/studio/circuit';

// The real OpenRouter /videos/models catalogue (public, read 2026-10-11): prices as announced by the providers.
const CATALOG = parseVideoModels(JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/studio/videos-catalog-2026-10.json'), 'utf8')));
const prior = (m: { id: string; name: string }) => priorQuality('video', m.id, m.name);
const scene = (id: string, beat: string, duration: number) => ({ scene_id: id, beat, duration, imageAssetId: `img-${id}` });

describe('CIRCUIT GROK 0,30 $ (prix réels du catalogue OpenRouter)', () => {
  it('caps a film at 0,30 $ up to one minute, 0,30 $ per started minute beyond', () => {
    expect(circuitCap(8)).toBe(0.3);
    expect(circuitCap(60)).toBe(0.3);
    expect(circuitCap(61)).toBe(0.6);
  });
  it('picks Grok Imagine Video 1.5 Lite at 480p: 0,02 $/s + 0,01 $ per first-frame image (certain price)', () => {
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    expect(r.id).toBe('x-ai/grok-imagine-video-1.5-lite');
    expect(r.usdPerS).toBe(0.02);
    expect(r.usdPerClip).toBe(0.01);
    expect(clipUsd(r, 8)).toBe(0.17);
  });
  it('never picks a token-billed model (price unknown before the call) nor a model without first frame', () => {
    const tok = CATALOG.find((m) => m.id === 'bytedance/seedance-2.0-fast')!;
    expect(circuitRate(tok, '9:16')).toBeNull();
    const edit = CATALOG.find((m) => m.id === 'black-forest-labs/flux-video-edit')!;
    expect(circuitRate(edit, '9:16')).toBeNull();
  });
  it('a 60 s film: the hook and the punchline get real motion first, never above the remaining budget', () => {
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    const scenes = [scene('S01', 'hook', 7), scene('S02', 'escalade', 8), scene('S03', 'escalade', 8), scene('S04', 'escalade', 8), scene('S05', 'twist', 8), scene('S06', 'escalade', 7), scene('S07', 'escalade', 7), scene('S08', 'chute', 7)];
    // Measured spend of the other stages so far (writing + 8 images) and the voices to come.
    const budget = circuitBudget(circuitCap(60), 0.06, CIRCUIT.reserveUsd);
    expect(budget).toBe(0.15);
    const p = planCircuit(scenes, r, budget);
    expect(p.usd).toBeLessThanOrEqual(budget);
    expect(p.shots[0]!.sceneId).toBe('S01');
    expect(p.shots.map((s) => s.sceneId)).toEqual(['S01']);
    expect(p.skipped.length).toBe(7);
  });
  it('an 8 s sketch is entirely animated by the generative model within 0,30 $', () => {
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    const p = planCircuit([scene('S01', 'hook', 4), scene('S02', 'chute', 4)], r, circuitBudget(circuitCap(8), 0.03, CIRCUIT.reserveUsd));
    expect(p.shots.length).toBe(2);
    expect(p.seconds).toBe(8);
    expect(p.usd).toBe(0.18);
    // 0,24 $ usable for the video (80 % of the cap), minus the 0,03 $ spent and the 0,03 $ reserve.
    expect(circuitBudget(0.3, 0.03, 0.03)).toBe(0.18);
  });
  it('clip length follows the scene and the durations the model accepts; a spent budget plans nothing', () => {
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    expect(clipSeconds(r, 6.4)).toBe(6);
    expect(clipSeconds(r, 40)).toBe(15);
    expect(planCircuit([scene('S01', 'hook', 5)], r, circuitBudget(0.3, 0.2, 0.03)).shots).toEqual([]);
  });
});

describe('CIRCUIT GROK — format court entièrement animé (prix réels)', () => {
  it('a 9 s sketch of 3 shots: 3 scene pictures + voices, then EVERY shot gets its clip within 0,30 $', async () => {
    const { circuitShort, CIRCUIT_TAIL_USD } = await import('../../server/jev/studio/circuit');
    expect(circuitShort(10)).toBe(true);
    expect(circuitShort(60)).toBe(false);
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    // spent before the video: 3 pictures (Seedream 5 Flash 0,018 $) + writing + voices ≈ 0,058 $
    const spent = 3 * 0.018 + 0.004;
    const p = planCircuit([scene('S01', 'hook', 3), scene('S02', 'escalade', 3), scene('S03', 'chute', 3)], r, circuitBudget(0.3, spent, CIRCUIT_TAIL_USD, 1));
    expect(p.shots.length).toBe(3);
    expect(p.seconds).toBe(9);
    expect(spent + p.usd + CIRCUIT_TAIL_USD).toBeLessThanOrEqual(0.3);
  });
  it('a minute with 7 shots and character sheets: honest — the motion budget covers the hook only', () => {
    const r = pickCircuitModel(CATALOG, '9:16', prior)!;
    const spent = 10 * 0.018 + 0.004;
    const scenes = ['hook', 'escalade', 'escalade', 'escalade', 'twist', 'escalade', 'chute'].map((b, i) => scene(`S0${i + 1}`, b, 4));
    const p = planCircuit(scenes, r, circuitBudget(0.3, spent, 0.006, 1));
    expect(p.shots.map((x) => x.sceneId)).toEqual(['S01']);
    expect(p.seconds).toBe(4);
  });
});
