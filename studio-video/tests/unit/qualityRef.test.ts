import { describe, expect, it } from 'vitest';
import { REFERENCE_041701, metricScore, parseHumor, profileFrom, viralityScore, visualFidelity } from '../../coeur/studio/qualityRef';

describe('CONTRÔLE QUALITÉ calé sur 041701 et les vidéos TikTok de référence', () => {
  it('the reference itself scores 100 %; a blurry, grey, jerky video scores low', () => {
    expect(visualFidelity(REFERENCE_041701.target).score).toBe(100);
    const bad = { sharpness: 2, colorfulness: 10, brightness: 40, contrast: 15, motion: 0.05, jerk: 9, shotSeconds: 20 };
    expect(visualFidelity(bad).score).toBeLessThan(30);
    // Fewer jerks than the references is never a fault.
    expect(metricScore('jerk', 0.3, REFERENCE_041701)).toBe(100);
  });
  it('recalibrates on the user’s own videos (target = the first one)', () => {
    const a = { ...REFERENCE_041701.target, sharpness: 20 };
    const p = profileFrom('mes vidéos', [a, REFERENCE_041701.target]);
    expect(p.target.sharpness).toBe(20);
    expect(p.min.sharpness).toBeCloseTo(8.83);
  });
  it('humour degree from the judge’s grid; an incomplete answer is refused (nothing invented)', () => {
    const v = parseHumor('{"scores":{"hook":9,"situation":8,"escalation":8,"punchline":9,"timing":8,"physical":9,"language":8,"callback":6},"best":"la chute","fix":"raccourcir"}')!;
    expect(v.degree).toBeGreaterThan(80);
    expect(v.label).toBe('très drôle');
    expect(parseHumor('{"scores":{"hook":9}}')).toBeNull();
  });
  it('virality follows the measured top formats (8 s sketch with hook + reaction, bilingual captions, humour)', () => {
    const top = viralityScore({ seconds: 8, aspect: '9:16', hookAt: 0.4, reactionInsert: true, bilingualCaptions: true, shotSeconds: 6, humorDegree: 88 });
    const weak = viralityScore({ seconds: 40, aspect: '16:9', hookAt: 4, reactionInsert: false, bilingualCaptions: false, shotSeconds: 15, humorDegree: 40 });
    expect(top.score).toBeGreaterThan(90);
    expect(weak.score).toBeLessThan(45);
  });
});
