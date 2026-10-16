/**
 * Essai de fumée et banc de mesure de la page de rendu dans Chromium sans écran (SwiftShader, WebGL 2) :
 * construit la page, sert la page et les ressources (lues SUR PLACE : kit privé, images des rigs), charge un projet,
 * rend quelques images avec et sans flou de bougé, mesure le temps par image et enregistre des PNG de contrôle
 * dans `studio-troupe/sorties/rendu-fumee/` (dossier ignoré par git).
 *
 * Utilisation (au plus 3 cœurs) :
 *   taskset -c 0-2 npx tsx scripts/fumee-rendu.ts [projet.json] [--images 0,30,93] [--rig rig.json] [--sortie dossier]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { chargerRig } from '../src/rig/charger';
import { enrichirRessources } from '../src/scene/analyse';
import { DOSSIER_SORTIES, MANIFESTE_DECORS_DEFAUT, RACINE_MOTEUR, chargerDecors } from '../src/outils/kit';
import { validerProjet } from '../src/timeline/projet';
import type { CharacterRig, InfoDecor, Projet } from '../src/timeline/types';
// Déclarations globales de la page (`window.moteur`, `window.moteurFluide`) pour les rappels de `page.evaluate`.
import type {} from '../src/rendu/page';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    images: { type: 'string' },
    rig: { type: 'string' },
    sortie: { type: 'string' },
    mesures: { type: 'string' },
    'sans-node': { type: 'boolean' },
  },
});

const cheminProjet = resolve(positionals[0] ?? join(RACINE_MOTEUR, 'exemples', 'pilote.projet.json'));
const cheminRig = resolve(values.rig ?? join(RACINE_MOTEUR, 'assets-test', 'modou-test', 'rig.json'));
const dossierSortie = resolve(values.sortie ?? join(DOSSIER_SORTIES, 'rendu-fumee'));
mkdirSync(dossierSortie, { recursive: true });

// 1. Page.
execFileSync(process.execPath, [join(RACINE_MOTEUR, 'scripts', 'construire-page.mjs')], { stdio: 'inherit' });

// 2. Projet et ressources (rigs du projet → rig de test s'ils manquent).
const v = validerProjet(JSON.parse(readFileSync(cheminProjet, 'utf8')));
if (!v.ok || !v.projet) throw new Error(`Projet invalide : ${v.erreurs.join(' ; ')}`);
const projet: Projet = v.projet;
const rigTest = chargerRig(cheminRig).rig;
const rigs: Record<string, CharacterRig> = {};
for (const d of projet.personnages) rigs[d.rig] = { ...rigTest, id: d.rig };
const kit = chargerDecors(MANIFESTE_DECORS_DEFAUT);
const decors: Record<string, InfoDecor> = {};
for (const p of projet.plans) if (kit.decors[p.decor]) decors[p.decor] = kit.decors[p.decor]!;
const ressources = values['sans-node'] ? { rigs, decors } : enrichirRessources({ rigs, decors }, Object.keys(decors));

// Fichiers autorisés : ceux des ressources, rien d'autre.
const autorises = new Set<string>();
for (const r of Object.values(ressources.rigs)) autorises.add(r.image.chemin);
for (const d of Object.values(ressources.decors)) for (const f of Object.values(d.fichiers)) if (f) autorises.add(f);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const ORIGINE = 'http://moteur.local';

async function principal(): Promise<void> {
  const navigateur = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'],
  });
  const page = await navigateur.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const erreurs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') erreurs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => erreurs.push(`[pageerror] ${e.message}`));
  await page.route(`${ORIGINE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/fichiers/')) {
      const chemin = decodeURIComponent(url.pathname.slice('/fichiers/'.length));
      if (!autorises.has(chemin) || !existsSync(chemin)) return route.fulfill({ status: 404, body: 'interdit' });
      return route.fulfill({ status: 200, body: readFileSync(chemin), contentType: TYPES[extname(chemin).toLowerCase()] ?? 'application/octet-stream' });
    }
    const f = join(RACINE_MOTEUR, 'dist', url.pathname.replace(/^\/+/, '') || 'page.html');
    if (!existsSync(f)) return route.fulfill({ status: 404, body: 'absent' });
    return route.fulfill({ status: 200, body: readFileSync(f), contentType: TYPES[extname(f)] ?? 'application/octet-stream' });
  });
  // tsx/esbuild nomme les fonctions fléchées (`__name`) : on fournit l'aide dans la page.
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.goto(`${ORIGINE}/page.html`);
  await page.waitForFunction(() => !!window.moteur);

  const info = await page.evaluate(
    async ({ projet, ressources }) => window.moteur!.charger(projet, { ressources, urlRessources: '/fichiers', flouAdaptatif: false }),
    { projet, ressources },
  );
  console.log('Chargement :', JSON.stringify(info));

  const images = values.images ? values.images.split(',').map(Number) : [0, 15, 45, 75, 93, 96, 100, 110, 125, 140, 160];
  const mesures: Array<Record<string, number | string>> = [];
  for (const mode of ['flou-plein', 'flou-adaptatif', 'sans-flou'] as const) {
    const p2: Projet = { ...projet, sortie: { ...projet.sortie, sousImages: mode === 'sans-flou' ? 1 : projet.sortie.sousImages } };
    const adaptatif = mode === 'flou-adaptatif';
    await page.evaluate(async ({ p, a }) => window.moteur!.charger(p, { flouAdaptatif: a }), { p: p2, a: adaptatif });
    // Une image de chauffe (compilation des shaders, envoi des textures).
    await page.evaluate(async () => window.moteur!.rendreImage(0));
    for (const i of images) {
      const r = await page.evaluate(async (n) => {
        const t0 = performance.now();
        await window.moteur!.rendreImage(n);
        const tRendu = performance.now() - t0;
        const t1 = performance.now();
        const url = await window.moteurFluide!.capturer('jpeg', 0.92);
        const tCapture = performance.now() - t1;
        return { mesure: window.moteur!.derniereMesure!, tRendu, tCapture, url };
      }, i);
      const m = r.mesure;
      mesures.push({
        mode,
        image: i,
        sousImages: m.sousImages,
        rendues: m.sousImagesRendues,
        evaluation: +m.msEvaluation.toFixed(1),
        preparation: +m.msPreparation.toFixed(1),
        rendu: +m.msRendu.toFixed(1),
        total: +r.tRendu.toFixed(1),
        capture: +r.tCapture.toFixed(1),
      });
      if (mode === 'flou-plein') {
        writeFileSync(join(dossierSortie, `image-${String(i).padStart(4, '0')}.jpg`), Buffer.from(r.url.split(',')[1]!, 'base64'));
      }
    }
  }
  await navigateur.close();
  console.table(mesures);
  const moyenne = (mode: string, cle: string) => {
    const l = mesures.filter((m) => m.mode === mode).map((m) => Number(m[cle]));
    return l.reduce((s, x) => s + x, 0) / Math.max(1, l.length);
  };
  const bilan = {
    projet: cheminProjet,
    largeur: projet.sortie.largeur,
    hauteur: projet.sortie.hauteur,
    sousImages: projet.sortie.sousImages,
    msParImageFlouPlein: +moyenne('flou-plein', 'total').toFixed(1),
    msParImageFlouAdaptatif: +moyenne('flou-adaptatif', 'total').toFixed(1),
    msParImageSansFlou: +moyenne('sans-flou', 'total').toFixed(1),
    msCaptureJpeg: +moyenne('flou-plein', 'capture').toFixed(1),
    chargeMachine: (await import('node:os')).loadavg().map((x) => +x.toFixed(2)),
    erreursConsole: erreurs,
  };
  console.log(JSON.stringify(bilan, null, 2));
  if (values.mesures) {
    mkdirSync(dirname(resolve(values.mesures)), { recursive: true });
    writeFileSync(resolve(values.mesures), JSON.stringify({ bilan, mesures }, null, 2));
  }
  if (erreurs.length > 0) process.exitCode = 2;
}

principal().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
