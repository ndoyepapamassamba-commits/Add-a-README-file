/**
 * Capture de bout en bout dans Chromium sans écran (page d'essai minimale, même contrat que la page de rendu) :
 * segments, reprise après interruption, vérification du MP4, fidélité des couleurs (BT.709 étiqueté).
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { argsEncodage, capturerVideo, compterImages, decouperSegments, ENCODAGE_DEFAUT, niveauH264 } from '../src/export/capture';
import { executer, FFMPEG } from '../src/export/processus';
import { cheminsCites, demarrerServeur } from '../src/export/serveur';
import { verifierVideo } from '../src/export/verifier';
import { evaluer, MOTEUR_NEUTRE } from '../src/timeline/evaluer';
import { creerProjetVide } from '../src/timeline/projet';
import type { EtatImage, Projet } from '../src/timeline/types';

const PAGE = fileURLToPath(new URL('./aides/page-essai', import.meta.url));
const travail = mkdtempSync(join(tmpdir(), 'moteur-fluide-capture-'));
afterAll(() => rmSync(travail, { recursive: true, force: true }));

function projet(): Projet {
  const p = creerProjetVide('essai capture', 2, 30);
  p.sortie = { ...p.sortie, largeur: 216, hauteur: 384, sousImages: 2, obturateur: 0.5 };
  return p;
}

/** Pixel RVB décodé d'une image du MP4 (conversion selon les étiquettes du flux). */
async function pixel(fichier: string, image: number, x: number, y: number): Promise<[number, number, number]> {
  const r = await executer(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', '-i', fichier, '-vf', `select=eq(n\\,${image}),format=rgb24`, '-fps_mode', 'passthrough', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const i = (y * 216 + x) * 3;
  return [r.stdout[i]!, r.stdout[i + 1]!, r.stdout[i + 2]!];
}

describe('outils de capture', () => {
  it('découpe en segments alignés', () => {
    expect(decouperSegments(0, 60, 20)).toEqual([
      { debut: 0, fin: 20 },
      { debut: 20, fin: 40 },
      { debut: 40, fin: 60 },
    ]);
    expect(decouperSegments(15, 45, 20)).toEqual([
      { debut: 15, fin: 20 },
      { debut: 20, fin: 40 },
      { debut: 40, fin: 45 },
    ]);
  });

  it('niveau H.264 : 4.1 en 1080×1920 à 30 i/s, 4.2 à 60 i/s', () => {
    expect(niveauH264(1080, 1920, 30)).toBe('4.1');
    expect(niveauH264(1080, 1920, 60)).toBe('4.2');
    const a = argsEncodage({ fps: 30, largeur: 1080, hauteur: 1920, format: 'jpeg', encodage: ENCODAGE_DEFAUT, sortie: 'x.mp4' });
    expect(a.join(' ')).toContain('ispace=bt470bg');
    expect(a.join(' ')).toContain('irange=pc');
    expect(a.join(' ')).toContain('range=tv');
    expect(a).toContain('+faststart');
  });

  it('chemins cités par des ressources : seuls les fichiers existants et absolus', () => {
    const c = cheminsCites({ a: { chemin: PAGE + '/page.html' }, b: ['relatif.png', '/nexiste/pas.png'], n: [1, 2, 3] });
    expect([...c]).toEqual([PAGE + '/page.html']);
  });
});

describe('serveur local', () => {
  it('sert la page et les seules ressources autorisées (lues sur place)', async () => {
    const image = fileURLToPath(new URL('../assets-test/modou-test/modou-test.png', import.meta.url));
    const s = await demarrerServeur(PAGE, [image]);
    try {
      const page = await fetch(`${s.origine}/page.html`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toMatch(/text\/html/);
      const ok = await fetch(`${s.urlRessources}/${encodeURIComponent(image)}`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('image/png');
      expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      const refuse = await fetch(`${s.urlRessources}/${encodeURIComponent('/etc/passwd')}`);
      expect(refuse.status).toBe(404);
      const traversee = await fetch(`${s.origine}/..%2F..%2Fpackage.json`);
      expect(traversee.status).toBe(404);
      expect(s.refusees.length).toBe(2);
    } finally {
      await s.fermer();
    }
  });
});

describe('capture Chromium → MP4', { timeout: 180000 }, () => {
  const dossier = join(travail, 'jpeg');
  const p = projet();
  const base = { projet: p, moteur: MOTEUR_NEUTRE, dossierPage: PAGE, dossierTravail: dossier, premiere: 0, derniere: 60, tailleSegment: 20, echantillons: [9, 10, 11, 30, 31, 32] };

  it('rend 60 images en 3 segments, vérifiées', async () => {
    const r = await capturerVideo(base);
    expect(r.segments).toHaveLength(3);
    expect(r.rendues).toBe(60);
    expect(r.empreintes).toHaveLength(60);
    // Le carré bouge à chaque image (aucun doublon consécutif) ; son mouvement a une période de 50 images
    // (0,6 t modulo 1) : les images 50 à 59 sont identiques au bit près aux images 0 à 9 (rendu déterministe).
    expect(r.empreintes.slice(1).every((h, i) => h !== r.empreintes[i])).toBe(true);
    expect(new Set(r.empreintes).size).toBe(50);
    expect(r.empreintes.slice(50)).toEqual(r.empreintes.slice(0, 10));
    expect(r.navigateur.rendu).toMatch(/SwiftShader|ANGLE|WebKit/i);
    expect(await compterImages(r.video)).toBe(60);
    expect(Object.keys(r.references).map(Number).sort((a, b) => a - b)).toEqual([9, 10, 11, 30, 31, 32]);
    const v = await verifierVideo(r.video, { largeur: 216, hauteur: 384, fps: 30, images: 60, audio: false, references: r.references, empreintes: r.empreintes });
    expect(v.controles.filter((c) => !c.ok)).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.echantillons.every((e) => e.psnr > 35)).toBe(true);
    // Couleur de la pastille rgb(217,130,43) après JPEG → yuv420p BT.709 → décodage étiqueté.
    const [rr, gg, bb] = await pixel(r.video, 5, 30, 30);
    expect(Math.abs(rr - 217)).toBeLessThanOrEqual(4);
    expect(Math.abs(gg - 130)).toBeLessThanOrEqual(4);
    expect(Math.abs(bb - 43)).toBeLessThanOrEqual(4);
  });

  it('reprise : segments valides réutilisés, seul le segment manquant est rendu', async () => {
    const r1 = await capturerVideo(base);
    expect(r1.rendues).toBe(0);
    expect(r1.reutilisees).toBe(60);
    rmSync(join(dossier, 'segments', 'seg-000020-000040.json'));
    const r2 = await capturerVideo(base);
    expect(r2.rendues).toBe(20);
    expect(r2.segments.map((s) => s.reutilise)).toEqual([true, false, true]);
    expect(await compterImages(r2.video)).toBe(60);
  });

  it('un projet modifié invalide les segments (clé de rendu)', async () => {
    const autre = projet();
    autre.sortie.obturateur = 0.25;
    const r = await capturerVideo({ ...base, projet: autre, derniere: 20 });
    expect(r.rendues).toBe(20);
  });

  it('erreur dans la page : la capture échoue, les segments terminés restent', async () => {
    const d = join(travail, 'erreur');
    const etats = (n: number): EtatImage[] => (n >= 25 ? [] : [evaluer(p, n / 30)]);
    await expect(capturerVideo({ ...base, dossierTravail: d, etats })).rejects.toThrow(/aucun état/);
    expect(existsSync(join(d, 'segments', 'seg-000000-000020.mp4'))).toBe(true);
    expect(existsSync(join(d, 'segments', 'seg-000020-000040.mp4'))).toBe(false);
    expect(existsSync(join(d, 'segments', 'seg-000020-000040.tmp.mp4'))).toBe(false);
  });

  it('capture PNG sans perte : couleurs exactes à l’arrondi BT.709 près', async () => {
    const r = await capturerVideo({ ...base, dossierTravail: join(travail, 'png'), format: 'png', derniere: 10, echantillons: [] });
    expect(await compterImages(r.video)).toBe(10);
    const [rr, gg, bb] = await pixel(r.video, 3, 30, 30);
    expect(Math.abs(rr - 217)).toBeLessThanOrEqual(3);
    expect(Math.abs(gg - 130)).toBeLessThanOrEqual(3);
    expect(Math.abs(bb - 43)).toBeLessThanOrEqual(3);
  });

  it('deux navigateurs en parallèle donnent les mêmes images qu’un seul', async () => {
    const r = await capturerVideo({ ...base, dossierTravail: join(travail, 'paralleles'), paralleles: 2, echantillons: [] });
    const seul = await capturerVideo(base);
    expect(r.empreintes).toEqual(seul.empreintes);
  });
});
