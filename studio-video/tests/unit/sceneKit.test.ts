// Moteur de scène instantané (v64) : chaque prompt de l'utilisateur est lu dans le bon univers, couvert, et donne une
// page complète (cahier des charges + moteur sérialisé + three.js) ; mémoire des réglages ; complément par le modèle.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addonSystemPrompt,
  applyLessons,
  boostFromEye,
  instantSuited,
  jevSceneQuestions,
  jevSceneState,
  learnLessons,
  parseSceneLocal,
  quotedNames,
  realizeInstant,
  sceneHtml,
  specFromJev,
  withAddon,
} from '../../coeur/realize/sceneKit';
import { detectKind, type RealizeRun } from '../../coeur/realize/realize';

const P = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'scenes', `${n}.txt`), 'utf8').trim();

describe('v64 — moteur de scène : lecture des prompts dans le bon univers', () => {
  const cases: [string, string, string[]][] = [
    ['medieval', 'nature', ['château', 'remparts', 'maisons', 'rivière', 'pont', 'lac', 'forêts', 'champs de blé', 'église', 'oiseaux', 'nuages']],
    ['scifi', 'scifi', ['tour iconique', 'gratte-ciel', 'écrans holographiques', 'véhicules volants', 'pluie', 'trains suspendus', 'vapeur']],
    ['planet', 'planet', ['planète', 'océans', 'continents', 'systèmes nuageux', 'aurores boréales', 'villes illuminées', 'descente']],
    ['forest', 'forest', ['arbres géants', 'rayons de lumière', 'ruisseaux', 'cascades', 'cristaux lumineux', 'lucioles', 'brume', 'cerfs']],
    ['mars', 'mars', ['dômes transparents', 'spatioport', 'fusées', 'panneaux solaires', 'fermes hydroponiques', 'véhicules autonomes', 'tempêtes de poussière']],
    ['street', 'street', ['commerces colorés', 'taxis jaunes', 'bus urbains', 'piétons', 'vendeurs ambulants', 'feux de circulation', 'chiens errants']],
  ];
  for (const [file, theme, names] of cases)
    it(`${file} → univers « ${theme} », éléments nommés, couverture ≥ 0,9, rien d'oublié`, () => {
      const s = parseSceneLocal(P(file));
      expect(s.theme).toBe(theme);
      for (const n of names) expect(s.elements.map((e) => e.name)).toContain(n);
      expect(s.coverage).toBeGreaterThanOrEqual(0.9);
      expect(instantSuited(s)).toBe(true);
    });
  it('quantités lues : « des centaines de maisons », « des milliers d’arbres », « plusieurs donjons », « des milliers de gratte-ciels »', () => {
    const m = parseSceneLocal(P('medieval'));
    expect(m.counts.houses).toBeGreaterThanOrEqual(400);
    expect(m.counts.trees).toBeGreaterThanOrEqual(2600);
    expect(m.counts.keeps).toBe(4);
    expect(parseSceneLocal(P('scifi')).counts.houses).toBeGreaterThanOrEqual(2000);
  });
  it('heure, caméra et lumière : coucher de soleil (cité), nuit (mégapole), aube (forêt), descente (planète)', () => {
    expect(parseSceneLocal(P('medieval')).time).toBe('sunset');
    expect(parseSceneLocal(P('scifi')).time).toBe('night');
    expect(parseSceneLocal(P('forest')).time).toBe('dawn');
    expect(parseSceneLocal(P('planet')).camera).toBe('descent');
    expect(parseSceneLocal(P('street')).time).toBe('sunset');
  });
  it('« serpente » ne fait plus classer la cité en jeu ; une demande d’application ne passe pas par le moteur', () => {
    expect(detectKind(P('medieval'))).not.toBe('game');
    expect(instantSuited(parseSceneLocal('Simulateur de crédit avec tableau d’amortissement et graphique'))).toBe(false);
    expect(instantSuited(parseSceneLocal('Une cité médiévale avec un château, des remparts et une rivière'), true)).toBe(false);
  });
  it('un univers peut être imposé (choix de JEV) et la même demande donne toujours la même scène (graine)', () => {
    expect(parseSceneLocal(P('street'), { theme: 'scifi' }).theme).toBe('scifi');
    expect(parseSceneLocal(P('medieval')).seed).toBe(parseSceneLocal(P('medieval')).seed);
  });
});

describe('v64 — moteur de scène : la page', () => {
  for (const f of ['medieval', 'scifi', 'planet', 'forest', 'mars', 'street'])
    it(`${f} : page complète, cahier des charges lisible, moteur sérialisé, imports three.js, aucune fermeture de script parasite`, () => {
      const spec = parseSceneLocal(P(f));
      const html = sceneHtml(spec, f);
      expect(html).toMatch(/^<!doctype html>/);
      const rs = JSON.parse(/<script type="application\/json" id="realize-spec">([\s\S]*?)<\/script>/.exec(html)![1]!);
      expect(rs.elements.length).toBe(spec.elements.length);
      expect(html).toContain("import * as THREE from 'three'");
      expect(html).toContain('REALIZE_ELEMENTS');
      // une seule fermeture par script ouvert (le code du moteur ne contient pas « </script »)
      expect((html.match(/<\/script>/g) ?? []).length).toBe((html.match(/<script[\s>]/g) ?? []).length);
      expect(html.length).toBeLessThan(200_000);
    });
});

describe('v64 — moteur de scène : JEV, œil, mémoire, complément', () => {
  it('questions typées de JEV : univers, heure, cadrage + un Noul par composant ; état sans donnée client', () => {
    const q = jevSceneQuestions();
    expect(q.theme?.type).toBe('choice');
    expect(q.scene?.type).toBe('noul');
    expect(Object.keys(q).filter((k) => k.startsWith('c_')).length).toBeGreaterThan(40);
    expect(jevSceneState('une forêt').request).toBe('une forêt');
  });
  it('JEV ajoute un composant sûr, retire un composant écarté, fixe heure et saison', () => {
    const local = parseSceneLocal('Une cité médiévale avec un château, des remparts, des maisons et une rivière');
    const s = specFromJev(local, { c_bridge: { noul: 0.92 }, c_river: { noul: 0.05 }, time: { choice: 'night' }, season: { choice: 'winter' } }, 'Une cité médiévale avec un château');
    expect(s.elements.map((e) => e.comp)).toContain('bridge');
    expect(s.time).toBe('night');
    expect(s.season).toBe('winter');
  });
  it('l’œil ne voit pas « rivière » → le moteur l’agrandit (sans modèle de langage) ; le réglage devient une leçon', () => {
    const spec = parseSceneLocal(P('medieval'));
    const names = quotedNames(['l’œil de JEV ne voit pas « rivière » (probabilité 0,21) : …']);
    expect(names).toEqual(['rivière']);
    const b = boostFromEye(spec, names);
    expect(b.boost.river).toBeCloseTo(1.6, 5);
    const lessons = learnLessons({}, b, true);
    expect(lessons.nature?.river).toBeCloseTo(1.6, 5);
    expect(applyLessons(parseSceneLocal(P('medieval')), lessons).boost.river).toBeCloseTo(1.6, 5);
    expect(learnLessons({}, b, false)).toEqual({});
  });
  it('boucle instantanée : 2e passage avec le réglage quand l’œil ne voit pas un élément ; arrêt immédiat si tout est vu', async () => {
    const spec = parseSceneLocal(P('medieval'));
    const okRun = (): RealizeRun => ({ ok: true, errors: [], warnings: [], logs: [], stats: { elements: 10, text: 0, canvases: 1, spec: null } } as unknown as RealizeRun);
    let calls = 0;
    const r = await realizeInstant({ prompt: P('medieval'), spec, run: async () => okRun(), see: async () => (++calls === 1 ? ['l’œil de JEV ne voit pas « pont » (probabilité 0,10)'] : []), maxRounds: 2 });
    expect(r.rounds.length).toBe(2);
    expect(r.spec.boost.bridge).toBeGreaterThan(1);
    expect(r.ok).toBe(true);
    const r2 = await realizeInstant({ prompt: P('forest'), spec: parseSceneLocal(P('forest')), run: async () => okRun(), see: async () => [] });
    expect(r2.rounds.length).toBe(1);
  });
  it('complément par le modèle : consignes courtes (un module, pas une page) et module ajouté après le moteur', () => {
    const spec = parseSceneLocal(P('medieval'));
    expect(addonSystemPrompt(spec)).toContain('window.__scene');
    const page = withAddon('<html><body><canvas></canvas></body></html>', '```js\nimport * as THREE from "three";\nwindow.REALIZE_ELEMENTS = ["moulin"];\n```');
    expect(page).toContain('<script type="module">');
    expect(page).toContain('window.REALIZE_ELEMENTS = ["moulin"]');
    expect(page.indexOf('<script type="module">')).toBeGreaterThan(page.indexOf('<canvas>'));
  });
});
