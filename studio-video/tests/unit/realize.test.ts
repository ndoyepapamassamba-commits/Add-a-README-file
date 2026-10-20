import { describe, expect, it } from 'vitest';
import {
  BRIDGE,
  LIBRARIES,
  buildDocument,
  describeData,
  detectKind,
  extractHtml,
  importMap,
  librariesUsed,
  networkOnly,
  realizeFeedback,
  realizeWithCorrection,
  systemPrompt,
  verdict,
  type RealizeRun,
} from '../../coeur/realize/realize';

describe('Réalisation — moteur pur (tout prompt devient une page exécutée et corrigée)', () => {
  it('détecte le type de réalisation (modifiable par l’utilisateur)', () => {
    expect(detectKind('Un système solaire en 3D interactif')).toBe('3d');
    expect(detectKind('Un jeu du serpent pour mobile')).toBe('game');
    expect(detectKind('Tableau de bord des ventes par région')).toBe('data');
    expect(detectKind('fais quelque chose', true)).toBe('data');
    expect(detectKind('Un logo animé en SVG pour une banque')).toBe('svg');
    expect(detectKind('Ma lettre de motivation mise en page')).toBe('doc');
    expect(detectKind('Un simulateur de crédit avec échéancier')).toBe('app');
    expect(detectKind('Une vidéo 3D de 15 secondes sur Dakar')).toBe('video');
    expect(detectKind('Un clip animé pour TikTok')).toBe('video');
  });
  it('le moteur : seulement des licences MIT / Apache-2.0 / BSD, versions exactes, carte d’imports esm.sh', () => {
    for (const l of LIBRARIES) {
      // v64: the only exception is JEV's own scientific library (in-house code, served inline as a data: module).
      if (l.name === 'jev') {
        expect(l.license).toBe('maison');
        expect(l.url).toMatch(/^data:text\/javascript;base64,/);
        continue;
      }
      expect(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause']).toContain(l.license);
      expect(l.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(l.url).toMatch(/^https:\/\/esm\.sh\//);
      expect(l.url).toContain(l.version);
    }
    expect(importMap().imports['chart.js/auto']).toBe('https://esm.sh/chart.js@4.5.1/auto');
    expect(importMap().imports['three/addons/']).toMatch(/examples\/jsm\/$/);
  });
  it('le document injecté garde les numéros de ligne du modèle (injection sur une seule ligne)', () => {
    const html = '<!doctype html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<script>\nboom();\n</script>\n</body>\n</html>';
    const doc = buildDocument(html, { token: 'abc', data: [{ a: 1 }], meta: { name: 'x.csv' } });
    expect(doc.split('\n').length).toBe(html.split('\n').length);
    expect(doc.split('\n')[7]).toBe('boom();');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('"importmap"');
    expect(doc).toContain('window.DATA=[{"a":1}]');
    expect(doc).toContain('window.__RZ_TOKEN="abc"');
    expect(BRIDGE).not.toContain('\n');
    expect(BRIDGE).not.toMatch(/(^|[^:])\/\//); // no « // » comment can swallow the rest of the line
  });
  it('un fragment est enveloppé ; une carte d’imports du modèle est fusionnée (CDN autorisés seulement)', () => {
    const doc = buildDocument('<div id=a>ok</div>', {});
    expect(doc).toMatch(/^<!doctype html><html lang="fr"><head>/);
    const merged = buildDocument(
      '<html><head><script type="importmap">{"imports":{"lodash-es":"https://esm.sh/lodash-es@4.17.21","evil":"https://evil.example/x.js"}}</script></head><body></body></html>',
      {},
    );
    expect((merged.match(/type="importmap"/g) ?? []).length).toBe(1);
    expect(merged).toContain('lodash-es');
    expect(merged).not.toContain('evil.example');
  });
  it('vidéo : un seul canvas filmé à la bonne taille, durée et format imposés ; enregistrement automatique au chargement', () => {
    const sys = systemPrompt('video', { video: { seconds: 15, format: '9:16' } });
    expect(sys).toContain('vidéo de 15 secondes');
    expect(sys).toContain('1080×1920');
    expect(sys).toContain('window.VIDEO');
    expect(sys).toContain('"three"');
    const doc = buildDocument('<canvas id="video"></canvas>', { token: 't', record: { ms: 15000, fps: 30 } });
    expect(doc).toContain('window.__RZ_REC={"ms":15000,"fps":30}');
    expect(BRIDGE).toContain('captureStream');
    expect(BRIDGE).toContain('video/mp4;codecs=avc1');
  });
  it('les données de l’utilisateur : types de colonnes et une ligne d’exemple, jamais le fichier entier', () => {
    const rows = [
      { region: 'Dakar', montant: 1250, date: '2026-01-15' },
      { region: 'Thiès', montant: '430', date: '2026-02-15' },
    ];
    const d = describeData('ventes.csv', rows);
    expect(d.columns).toEqual([
      { name: 'region', type: 'texte' },
      { name: 'montant', type: 'nombre' },
      { name: 'date', type: 'date' },
    ]);
    const sys = systemPrompt('data', { data: d });
    expect(sys).toContain('window.DATA');
    expect(sys).toContain('montant (nombre)');
    expect(sys).not.toContain('Thiès');
  });
  it('verdict : page vide, délai dépassé, doublons ; bibliothèques utilisées', () => {
    const empty = verdict([], [], { elements: 0, text: 0, canvases: 0, svgs: 0, ms: 10 }, '');
    expect(empty.ok).toBe(false);
    expect(empty.errors[0]!.kind).toBe('empty');
    expect(verdict([], [], null, '').errors[0]!.kind).toBe('timeout');
    const dup = verdict(
      [
        { kind: 'runtime', msg: 'x is not defined', line: 4 },
        { kind: 'runtime', msg: 'x is not defined', line: 4 },
      ],
      [],
      { elements: 9, text: 30, canvases: 0, svgs: 0, ms: 10 },
      'import Chart from "chart.js/auto"; import { OrbitControls } from "three/addons/controls/OrbitControls.js";',
    );
    expect(dup.errors).toHaveLength(1);
    expect(dup.stats.libs).toEqual(['chart.js/auto', 'three/addons']);
    expect(librariesUsed('<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>')).toEqual(['tailwind']);
    // A page still loading its libraries is not a success.
    const loading = verdict([], [], { elements: 5, text: 3, canvases: 0, svgs: 0, ms: 30000, loading: true }, 'import x from "three"');
    expect(loading.ok).toBe(false);
    expect(loading.errors[0]!.kind).toBe('timeout');
  });
  it('une panne réseau n’est pas renvoyée au modèle comme une erreur de code (pas de tokens gaspillés)', async () => {
    const code = '<script type="module">import Chart from "chart.js/auto";</script>';
    const net = verdict([{ kind: 'resource', msg: 'module', line: null }], [], { elements: 1, text: 0, canvases: 0, svgs: 0, ms: 9 }, code);
    expect(networkOnly(net, code)).toBe(true);
    expect(networkOnly(net, '<p>sans import</p>')).toBe(false);
    let calls = 0;
    const r = await realizeWithCorrection({ prompt: 'x', kind: 'data', generate: async () => (calls++, '```html\n' + code + '\n```'), run: async () => net });
    expect(r.network).toBe(true);
    expect(calls).toBe(1);
  });
  it('le retour au modèle : erreurs réelles, lignes fautives, pistes ciblées', () => {
    const code = 'a\nb\nlocalStorage.setItem("k", 1)\nd';
    const fb = realizeFeedback(code, {
      ok: false,
      errors: [{ kind: 'runtime', msg: "SecurityError: Failed to read the 'localStorage' property", line: 3 }],
      warnings: [],
      stats: { elements: 0, text: 0, canvases: 0, svgs: 0, ms: 0, libs: [] },
    });
    expect(fb).toContain('>>   3 | localStorage.setItem');
    expect(fb).toContain('stockage du navigateur est bloqué');
    expect(fb).toContain('```html');
  });
  it('boucle : la 1re page casse, l’erreur réelle revient au modèle, la 2e passe', async () => {
    const answers = ['```html\n<body><script>boom()</script></body>\n```', '```html\n<body><h1>Bonjour</h1></body>\n```'];
    const seen: string[] = [];
    const run = async (html: string): Promise<RealizeRun> =>
      html.includes('boom')
        ? verdict([{ kind: 'runtime', msg: 'boom is not defined', line: 1 }], [], { elements: 1, text: 0, canvases: 0, svgs: 0, ms: 5 }, html)
        : verdict([], [], { elements: 2, text: 7, canvases: 0, svgs: 0, ms: 5 }, html);
    const r = await realizeWithCorrection({
      prompt: 'dis bonjour',
      kind: 'app',
      generate: async (m) => {
        seen.push(m.at(-1)!.content);
        return answers.shift()!;
      },
      run,
    });
    expect(r.ok).toBe(true);
    expect(r.rounds).toHaveLength(2);
    expect(seen[1]).toContain('boom is not defined');
    expect(extractHtml(answers[0] ?? '```html\n<p>x</p>\n```')).toBe('<p>x</p>');
  });
});

import { extractHtml as extractHtml62, videoProblem } from '../../coeur/realize/realize';
describe('v62 — sandbox: no stray fence, a video page must be filmable', () => {
  it('an UNCLOSED ```html fence is stripped (it showed at the top of the page)', () => {
    expect(extractHtml62('```html\n<!doctype html><html><body>ok</body></html>')).toBe('<!doctype html><html><body>ok</body></html>');
    expect(extractHtml62('Voici la page :\n```html\n<!doctype html><html><body>ok</body></html>\n```\nBonne lecture')).toBe('<!doctype html><html><body>ok</body></html>');
    expect(extractHtml62('Texte avant <!doctype html><html><body>x</body></html> après')).toBe('<!doctype html><html><body>x</body></html>');
  });
  it('a 300×150 canvas under HTML controls is not a 1920×1080 video → sent back for correction', () => {
    const run = (canvas: { w: number; h: number } | null, canvases = canvas ? 1 : 0) => ({ ok: true, errors: [], warnings: [], stats: { elements: 30, text: 120, canvases, svgs: 0, ms: 900, libs: ['three'], canvas } });
    expect(videoProblem(run({ w: 300, h: 150 }), { seconds: 15, format: '16:9' })?.msg).toMatch(/300×150 au lieu de 1920×1080/);
    expect(videoProblem(run(null), { seconds: 15, format: '16:9' })?.msg).toMatch(/aucun <canvas>/);
    expect(videoProblem(run({ w: 1920, h: 1080 }), { seconds: 15, format: '16:9' })).toBeNull();
    expect(videoProblem(run({ w: 1080, h: 1920 }), { seconds: 10, format: '9:16' })).toBeNull();
    expect(videoProblem(run({ w: 640, h: 360 }), { seconds: 5, format: '16:9' })).toBeNull();
    expect(videoProblem(run({ w: 1920, h: 1080 }), { seconds: 10, format: '9:16' })?.msg).toMatch(/1920×1080 au lieu de 1080×1920/);
  });
});

import { fidelityProblems, promptItems, detectKind as detectKind62 } from '../../coeur/realize/realize';
describe('v62 — FIDÉLITÉ: the request is realised exactly (cité médiévale example)', () => {
  const PROMPT = 'Une cité médiévale fortifiée avec château central, murailles, village serré avec église, champs dorés, rivière et forêt dense, à la fin d’après-midi';
  const base = (spec: unknown, tagged: { name: string; area: number; cx: number; cy: number }[]) => ({ ok: true, errors: [], warnings: [], stats: { elements: 80, text: 200, canvases: 0, svgs: 1, ms: 900, libs: [], spec: spec === null ? null : JSON.stringify(spec), tagged } });
  it('the request is split into its concrete items and its circumstances; a scene is an illustration', () => {
    const r = promptItems(PROMPT);
    expect(r.items.map((i) => i.head)).toEqual(['cite', 'chateau', 'murailles', 'village', 'eglise', 'champs', 'riviere', 'foret']);
    expect(r.circumstances).toEqual(['à la fin d’après-midi']);
    expect(detectKind62(PROMPT)).toBe('svg');
  });
  it('a page without spec, a forgotten village and a hidden church are sent back with measured gaps', () => {
    expect(fidelityProblems(PROMPT, base(null, []))[0]!.msg).toMatch(/cahier des charges absent/);
    const spec = {
      elements: [
        { name: 'cité fortifiée', where: 'centre' }, { name: 'château central', where: 'centre', size: 'grand' }, { name: 'murailles', where: 'centre' },
        { name: 'église', where: 'centre' }, { name: 'champs dorés', where: 'bas' }, { name: 'rivière', where: 'bas' }, { name: 'forêt dense', where: 'arrière-plan' },
      ],
      light: 'fin d’après-midi, soleil bas doré',
      view: 'vue plongeante',
    };
    const tagged = [
      { name: 'cité fortifiée', area: 0.4, cx: 0.5, cy: 0.5 }, { name: 'château central', area: 0.08, cx: 0.5, cy: 0.42 }, { name: 'murailles', area: 0.06, cx: 0.5, cy: 0.62 },
      { name: 'église', area: 0.0005, cx: 0.5, cy: 0.6 }, { name: 'champs dorés', area: 0.2, cx: 0.3, cy: 0.75 }, { name: 'rivière', area: 0.05, cx: 0.5, cy: 0.2 }, { name: 'forêt dense', area: 0.15, cx: 0.5, cy: 0.3 },
    ];
    const msgs = fidelityProblems(PROMPT, base(spec, tagged)).map((e) => e.msg);
    expect(msgs.some((m) => /« village serré »/.test(m))).toBe(true); // named by the request, missing from the spec
    expect(msgs.some((m) => /« église » est presque invisible/.test(m))).toBe(true);
    expect(msgs.some((m) => /« rivière » doit être en bas/.test(m))).toBe(true);
    expect(msgs.some((m) => /château central/.test(m))).toBe(false);
    expect(msgs.some((m) => /fin d’après-midi/.test(m))).toBe(false); // the light says it
  });
  it('a faithful page passes', () => {
    const spec = { elements: ['cité', 'château', 'murailles', 'village', 'église', 'champs', 'rivière', 'forêt'].map((name) => ({ name })), light: 'fin d’après-midi dorée', view: 'vue aérienne' };
    const tagged = spec.elements.map((e) => ({ name: e.name, area: 0.05, cx: 0.5, cy: 0.5 }));
    expect(fidelityProblems(PROMPT, base(spec, tagged))).toEqual([]);
  });
});
