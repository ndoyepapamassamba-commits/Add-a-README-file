import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Budget,
  BudgetError,
  canPinFirstFrame,
  captionCues,
  clipUsd,
  estimateFilm,
  imagePrompt,
  parseScript,
  planLayout,
  ratePerSecond,
  scriptPrompt,
  sortVideoModels,
  toVideoModel,
  videoPrompt,
  type VideoModel,
} from '../../direct/lib/film/circuit';

// Live catalogue of OpenRouter's video models, saved on 23/10/2026 (GET /api/v1/videos/models).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  fs.readFileSync(path.join(HERE, '../fixtures/openrouter-videos-models-2026-10-23.json'), 'utf8'),
) as { data: unknown[] };
const models = raw.data.map((m) => toVideoModel(m as Parameters<typeof toVideoModel>[0]));
const M = (id: string) => models.find((m) => m.id === id) as VideoModel;

describe('circuit vidéo : prix lus dans le catalogue OpenRouter', () => {
  it('Grok Imagine Video 1.5 : 14 c/s en 720p, 8 c/s en 480p, 1 c par image de départ', () => {
    const g = M('x-ai/grok-imagine-video-1.5');
    expect(ratePerSecond(g, '720p', { audio: true, startFrame: true })).toMatchObject({
      usdPerS: 0.14,
      approx: false,
    });
    expect(ratePerSecond(g, '480p', { audio: true, startFrame: true })!.usdPerS).toBeCloseTo(0.08, 6);
    expect(clipUsd(g, '720p', 10, { audio: true, startFrame: true })).toBeCloseTo(1.41, 6);
  });
  it('Grok Imagine 1.5 Lite : un film d’une minute en 720p ≈ 1,86 $ (60 × 0,03 + 6 images de départ)', () => {
    const g = M('x-ai/grok-imagine-video-1.5-lite');
    const plans = Array.from({ length: 6 }, () => ({ duree: 10 }));
    const e = estimateFilm(g, {
      resolution: '720p',
      plans,
      audio: true,
      startFrame: true,
      imageUsd: 0,
      nImages: 0,
      script: false,
    });
    expect(e.video).toBeCloseTo(1.86, 6);
  });
  it('Kling 3.0 Std : le tarif avec son est choisi quand le son est demandé', () => {
    const k = M('kwaivgi/kling-v3.0-std');
    expect(ratePerSecond(k, '720p', { audio: true, startFrame: true })!.usdPerS).toBeCloseTo(0.126, 6);
    expect(ratePerSecond(k, '720p', { audio: false, startFrame: true })!.usdPerS).toBeCloseTo(0.084, 6);
  });
  it('Seedance 2.0 : prix en jetons vidéo converti en dollars par seconde, marqué approximatif', () => {
    const r = ratePerSecond(M('bytedance/seedance-2.0'), '720p', { audio: true, startFrame: true })!;
    expect(r.approx).toBe(true);
    expect(r.usdPerS).toBeCloseTo((0.000007 * 720 * 1280 * 24) / 1024, 9);
  });
  it('Veo 3.1 Fast : tarif 720p avec son', () => {
    expect(
      ratePerSecond(M('google/veo-3.1-fast'), '720p', { audio: true, startFrame: true })!.usdPerS,
    ).toBeCloseTo(0.1, 6);
  });
  it('un modèle sans image de départ est écarté (la troupe ne serait pas gardée)', () => {
    expect(canPinFirstFrame(M('x-ai/grok-imagine-video-1.5'))).toBe(true);
    expect(canPinFirstFrame(M('runway/aleph-2'))).toBe(false);
    expect(sortVideoModels(models)[0]!.id).toBe('x-ai/grok-imagine-video-1.5');
  });
});

describe('circuit vidéo : découpage d’une minute selon le modèle', () => {
  it('6 plans de 10 s quand le modèle accepte 10 s', () => {
    expect(planLayout(M('x-ai/grok-imagine-video-1.5'))).toEqual({ n: 6, duree: 10 });
    expect(planLayout(M('alibaba/wan-2.6'))).toEqual({ n: 6, duree: 10 });
  });
  it('Veo (4, 6 ou 8 s) : 8 plans de 8 s', () => {
    expect(planLayout(M('google/veo-3.1-fast'))).toEqual({ n: 8, duree: 8 });
  });
});

describe('circuit vidéo : plafond de dépense DUR', () => {
  it('refuse un appel qui ferait dépasser le plafond, avant tout envoi', () => {
    const b = new Budget(2);
    b.hold('a', 1.41);
    expect(() => b.hold('b', 1.41)).toThrow(BudgetError);
    b.settle('a', 1.2);
    expect(b.spent).toBeCloseTo(1.2, 6);
    b.hold('b', 0.79);
    expect(() => b.hold('c', 0.02)).toThrow(/Plafond/);
  });
  it('un échec sans coût est libéré, un succès sans coût rapporté compte la réservation', () => {
    const b = new Budget(1);
    b.hold('x', 0.5);
    b.release('x');
    expect(b.committed).toBe(0);
    b.hold('y', 0.4);
    b.settle('y', null);
    expect(b.spent).toBeCloseTo(0.4, 6);
  });
  it('prix inconnu : appel refusé', () => {
    expect(() => new Budget(10).hold('z', NaN)).toThrow(BudgetError);
  });
});

const scene = { id: 'maquis', titre: 'Le maquis', acteurs: ['KOFFI', 'COUMBA'] };
const reponse = `Voici le script :
{"titre":"L'addition","personnages":[{"nom":"Koffi","apparence":"man on the left, black and gold shirt, sunglasses"},{"nom":"COUMBA","apparence":"woman on the right, purple dress"}],
"plans":[
 {"cadrage":"plan large","dans_le_cadre":["KOFFI","COUMBA"],"action":"Ils s'assoient","visuel_en":"they sit at the table","camera_en":"slow push-in","repliques":[{"qui":"KOFFI","texte":"Ce soir c'est moi qui invite !"}]},
 {"cadrage":"gros plan","dans_le_cadre":["coumba"],"action":"Elle sourit","visuel_en":"she smiles","camera_en":"static","repliques":[{"qui":"Coumba","texte":"Vraiment ?"},{"qui":"MAMAN","texte":"intrus"}]}
]}`;

describe('circuit vidéo : script contrôlé', () => {
  it('noms ramenés à ceux de la scène, réplique d’un absent retirée, plan manquant signalé', () => {
    const { script, alertes } = parseScript(reponse, scene, { n: 3, duree: 10 });
    expect(script.personnages.map((p) => p.nom)).toEqual(['KOFFI', 'COUMBA']);
    expect(script.plans[1]!.dansLeCadre).toEqual(['COUMBA']);
    expect(script.plans[1]!.repliques).toEqual([{ qui: 'COUMBA', texte: 'Vraiment ?' }]);
    expect(alertes.join(' ')).toMatch(/MAMAN/);
    expect(alertes.join(' ')).toMatch(/2 plans reçus, 3 attendus/);
    expect(script.plans.every((p) => p.duree === 10)).toBe(true);
  });
  it('dialogue trop long pour la durée du plan : signalé', () => {
    const long = reponse.replace(
      "Ce soir c'est moi qui invite !",
      Array.from({ length: 40 }, () => 'mot').join(' '),
    );
    expect(parseScript(long, scene, { n: 2, duree: 10 }).alertes.join(' ')).toMatch(/trop long/);
  });
  it('réponse sans JSON : erreur claire', () => {
    expect(() => parseScript('désolé', scene, { n: 2, duree: 10 })).toThrow(/JSON/);
  });
  it('la consigne du scénariste impose les noms exacts et la durée des plans', () => {
    const p = scriptPrompt(scene, 'Koffi a oublié son porte-monnaie', { n: 6, duree: 10 }, '');
    expect(p.system).toMatch(/6 plans de 10 secondes/);
    expect(p.user).toMatch(/KOFFI, COUMBA/);
  });
});

describe('circuit vidéo : consignes qui gardent la troupe', () => {
  const { script } = parseScript(reponse, scene, { n: 2, duree: 10 });
  it('image du plan : mêmes personnages, même décor, 9:16, apparence de chacun', () => {
    const t = imagePrompt(script, script.plans[1]!, '9:16');
    expect(t).toMatch(/identical faces/);
    expect(t).toMatch(/9:16/);
    expect(t).toMatch(/COUMBA \(woman on the right, purple dress\)/);
  });
  it('vidéo : première image imposée, répliques en français attribuées au bon personnage', () => {
    const t = videoPrompt(script, script.plans[0]!, { accent: 'an Ivorian accent', sound: true });
    expect(t).toMatch(/starts exactly on the provided first frame/);
    expect(t).toMatch(
      /KOFFI \(man on the left, black and gold shirt, sunglasses\) says: "Ce soir c'est moi qui invite !"/,
    );
  });
  it('sous-titres : chaque plan réparti entre ses répliques sur sa durée réelle', () => {
    const cues = captionCues(script.plans, [9.5, 10.2]);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.start).toBeGreaterThan(0);
    expect(cues[0]!.end).toBeLessThanOrEqual(9.5);
    expect(cues[1]!.start).toBeGreaterThanOrEqual(9.5);
    expect(cues[1]!.end).toBeLessThanOrEqual(9.5 + 10.2);
  });
});
