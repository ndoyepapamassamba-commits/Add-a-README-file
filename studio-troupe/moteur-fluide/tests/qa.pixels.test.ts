/**
 * Porte qualité sur les pixels : images figées, degré de dynamique, sauts de lumière (hors coupe et hors effet),
 * planche contact sur une vraie vidéo.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ffmpeg, ffprobeJson } from '../src/export/processus';
import { analyserPixels, mesurerLuminances, plancheContact, portePixels } from '../src/qa/pixels';

const T = 108 * 192;
const uni = (v: number): Uint8Array => new Uint8Array(T).fill(v);
/** Image avec un carré clair à la position x. */
const carre = (x: number, fond = 60): Uint8Array => {
  const im = uni(fond);
  for (let y = 80; y < 100; y++) for (let i = x; i < x + 20; i++) im[y * 108 + i] = 220;
  return im;
};

const d = mkdtempSync(join(tmpdir(), 'moteur-fluide-pixels-'));
afterAll(() => rmSync(d, { recursive: true, force: true }));

describe('mesures sur les pixels', () => {
  it('vidéo figée : dynamique nulle, images figées sur toute la durée → FAIL', () => {
    const m = mesurerLuminances(Array.from({ length: 90 }, () => uni(80)), { fps: 30 });
    expect(m.dynamique).toBe(0);
    expect(m.figeMax).toBeCloseTo(3, 1);
    expect(portePixels(m, 30).verdict).toBe('FAIL');
  });

  it('carré qui se déplace : dynamique pleine → PASS', () => {
    const m = mesurerLuminances(Array.from({ length: 90 }, (_, k) => carre(k % 80)), { fps: 30 });
    expect(m.dynamique).toBeGreaterThan(0.95);
    expect(m.figeMax).toBe(0);
    expect(portePixels(m, 30).verdict).toBe('PASS');
  });

  it('gel voulu : les images figées pendant le gel ne comptent pas', () => {
    const images = Array.from({ length: 120 }, (_, k) => (k >= 30 && k < 90 ? carre(30) : carre(k % 80)));
    expect(mesurerLuminances(images, { fps: 30 }).figeMax).toBeGreaterThan(1.9);
    expect(mesurerLuminances(images, { fps: 30, gels: [{ debut: 1, fin: 3 }] }).figeMax).toBeLessThan(0.1);
  });

  it('saut de lumière : détecté hors coupe, ignoré sur une coupe ou un fondu', () => {
    const images = Array.from({ length: 60 }, (_, k) => carre(k % 80, k < 30 ? 60 : 100));
    expect(mesurerLuminances(images, { fps: 30 }).sautsLumiere).toEqual([30]);
    expect(mesurerLuminances(images, { fps: 30, coupes: [30] }).sautsLumiere).toEqual([]);
    expect(mesurerLuminances(images, { fps: 30, effets: [30] }).sautsLumiere).toEqual([]);
    expect(mesurerLuminances(images, { fps: 30, premiereImage: 100, coupes: [130] }).sautsLumiere).toEqual([]);
  });
});

describe('pixels d’un MP4 réel', { timeout: 60000 }, () => {
  it('mire animée : analyse et planche contact 4×3', async () => {
    const v = join(d, 'mire.mp4');
    await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=216x384:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', v]);
    const m = await analyserPixels(v, { fps: 30 });
    expect(m.images).toBe(90);
    expect(m.dynamique).toBeGreaterThan(0.9);
    const planche = join(d, 'planche.png');
    const choix = await plancheContact(v, planche, { fps: 30, images: 90, premiereImage: 10 });
    expect(choix).toHaveLength(12);
    expect(choix[0]).toBe(13);
    expect(existsSync(planche)).toBe(true);
    const j = await ffprobeJson(['-show_entries', 'stream=width,height', planche]);
    const s = (j.streams as Array<{ width: number; height: number }>)[0]!;
    expect(s.width).toBe(4 * 270 + 5 * 6);
    expect(s.height).toBe(3 * 480 + 4 * 6);
  });
});
