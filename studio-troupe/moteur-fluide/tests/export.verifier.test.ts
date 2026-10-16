/**
 * Vérification d'un MP4 sur une vidéo synthétique (mire `testsrc2` de FFmpeg + sinus) : conforme ; puis attentes non
 * tenues (nombre d'images, piste audio, sonie), fichier tronqué, échantillons décalés d'une image.
 */
import { copyFileSync, mkdtempSync, openSync, rmSync, statSync, ftruncateSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffmpeg } from '../src/export/processus';
import { atomesPremierNiveau, psnr, verifierVideo, verificationEnMarkdown, type AttentesVideo } from '../src/export/verifier';

const d = mkdtempSync(join(tmpdir(), 'moteur-fluide-verif-'));
const video = join(d, 'mire.mp4');
const muette = join(d, 'muette.mp4');
const refs: Record<number, string> = {};
const MIRE = 'testsrc2=size=216x384:rate=30:duration=2';
const ENC = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];

beforeAll(async () => {
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', MIRE, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-af', 'volume=0.35', ...ENC, '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', video]);
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', MIRE, ...ENC, '-movflags', '+faststart', muette]);
  for (const n of [9, 10, 11, 40]) {
    refs[n] = join(d, `ref${n}.png`);
    await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', MIRE, '-vf', `select=eq(n\\,${n})`, '-frames:v', '1', refs[n]!]);
  }
}, 60000);
afterAll(() => rmSync(d, { recursive: true, force: true }));

const attentes = (x: Partial<AttentesVideo> = {}): AttentesVideo => ({ largeur: 216, hauteur: 384, fps: 30, images: 60, audio: true, toleranceLufs: 40, ...x });
const echoue = (r: Awaited<ReturnType<typeof verifierVideo>>): string[] => r.controles.filter((c) => !c.ok && c.bloquant).map((c) => c.nom);

describe('vérification du MP4', { timeout: 60000 }, () => {
  it('mire conforme : tous les contrôles passent', async () => {
    const r = await verifierVideo(video, attentes({ references: refs }));
    expect(echoue(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.video!.imagesDecodees).toBe(60);
    expect(r.video!.couleur.matrice).toBe('bt709');
    expect(r.audio!.frequence).toBe(48000);
    expect(r.echantillons).toHaveLength(4);
    expect(r.echantillons.every((e) => e.ok && e.psnr > 35)).toBe(true);
    expect(r.ordreAtomes.indexOf('moov')).toBeLessThan(r.ordreAtomes.indexOf('mdat'));
    expect(r.outils.ffmpeg).toMatch(/ffmpeg version/);
    expect(verificationEnMarkdown(r)).toContain('CONFORME');
  });

  it('nombre d’images attendu différent : échec', async () => {
    const r = await verifierVideo(video, attentes({ images: 61 }));
    expect(r.ok).toBe(false);
    expect(echoue(r)).toContain('images décodées');
    expect(echoue(r)).toContain('durée vidéo');
  });

  it('cadence ou taille différentes : échec', async () => {
    expect(echoue(await verifierVideo(video, attentes({ fps: 60, images: 60 })))).toContain('cadence');
    expect(echoue(await verifierVideo(video, attentes({ largeur: 1080, hauteur: 1920 })))).toContain('dimensions');
  });

  it('piste audio exigée mais absente : échec', async () => {
    const r = await verifierVideo(muette, attentes());
    expect(echoue(r)).toContain('piste audio');
    expect((await verifierVideo(muette, attentes({ audio: false }))).ok).toBe(true);
  });

  it('sonie hors cible : échec (−14 ± 1 LUFS)', async () => {
    // Le sinus de la mire est discret (≈ −31 LUFS) : hors de la cible TikTok.
    const r = await verifierVideo(video, attentes({ toleranceLufs: 1 }));
    expect(echoue(r)).toContain('sonie intégrée');
    expect(r.sonie!.integre).toBeLessThan(-20);
    expect(r.sonie!.integre).toBeGreaterThan(-45);
  });

  it('échantillons décalés d’une image (image perdue ou dupliquée) : échec', async () => {
    // La référence de l'image 10 est présentée comme celle de l'image 9, etc.
    const decales = { 9: refs[10]!, 10: refs[11]!, 40: refs[40]! };
    const r = await verifierVideo(video, attentes({ references: decales }));
    expect(echoue(r)).toContain('échantillons capturés = images du MP4 (ordre et fidélité)');
    const e9 = r.echantillons.find((e) => e.image === 9)!;
    expect(e9.ok).toBe(false);
    expect(r.echantillons.find((e) => e.image === 40)!.ok).toBe(true);
  });

  it('rendu partiel (--de) : les références sont en index absolus', async () => {
    const decal = { 109: refs[9]!, 110: refs[10]!, 111: refs[11]! };
    const r = await verifierVideo(video, attentes({ premiereImage: 100, references: decal }));
    expect(r.echantillons.every((e) => e.ok)).toBe(true);
  });

  it('fichier tronqué : échec (lecture ou décodage)', async () => {
    const t = join(d, 'tronque.mp4');
    copyFileSync(video, t);
    const fd = openSync(t, 'r+');
    ftruncateSync(fd, Math.floor(statSync(t).size * 0.6));
    closeSync(fd);
    const r = await verifierVideo(t, attentes());
    expect(r.ok).toBe(false);
  });

  it('fichier absent : échec sans exception', async () => {
    const r = await verifierVideo(join(d, 'absent.mp4'), attentes());
    expect(r.ok).toBe(false);
    expect(r.controles[0]!.nom).toBe('fichier présent');
  });

  it('PSNR et atomes', () => {
    expect(psnr(new Uint8Array([10, 20, 30]), new Uint8Array([10, 20, 30]))).toBe(99);
    expect(psnr(new Uint8Array([0, 0]), new Uint8Array([255, 255]))).toBeCloseTo(0);
    expect(atomesPremierNiveau(video).slice(0, 2)).toEqual(['ftyp', 'moov']);
  });
});
