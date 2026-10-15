import { describe, expect, it } from 'vitest';
import { isContinuation, missionOf, resumeText } from '../../server/services/missionResume';
import { compileToolPack } from '../../server/jev/tools';

describe('v62 — « continue » resumes THE SAME mission', () => {
  it('continuation phrases are recognised, real requests are not', () => {
    for (const t of ['continue', 'Continue.', 'continue stp', 'ok continue', 'vas-y', 'poursuis', 'reprends là où tu t’es arrêté', 'termine le travail', 'la suite', 'go', 'Oui continue jusqu’au bout', 'continuer'])
      expect(isContinuation(t), t).toBe(true);
    for (const t of ['continue avec un graphique par région', 'oui, composer', 'fais un rapport word', 'Dans le fichier attaché , donnes moi un fichier excel', ''])
      expect(isContinuation(t), t).toBe(false);
  });
  it('the mission is the last non-continuation turn; the model gets it with what already exists', () => {
    const turns = [{ text: 'Dans le fichier attaché, donnes moi un fichier excel ultra design analysant le top 20 du segment code 8200 Local Corporate' }, { text: 'continue' }, { text: 'vas-y' }];
    expect(missionOf(turns)).toMatch(/top 20 du segment code 8200/);
    expect(missionOf([{ text: 'continue' }])).toBeNull();
    const r = resumeText('continue', missionOf(turns)!, ['outputs/a.xlsx']);
    expect(r).toMatch(/^continue\n\n<mission_resumed>/);
    expect(r).toMatch(/top 20 du segment code 8200/);
    expect(r).toMatch(/Already produced for it .*outputs\/a\.xlsx/);
  });
  it('a data analysis + Excel request gets the data AND deliver tools from the first step', () => {
    const p = compileToolPack({ type: 'chat', text: 'donnes moi un fichier excel ultra design analysant le top 20 du segment 8200 (ESN_Portfolio.xlsb)', available: ['filesystem.read', 'data.query', 'data.export', 'dossier.export', 'report.export', 'tools.request'], mode: 'balanced' });
    expect(p.names).toEqual(expect.arrayContaining(['data.query', 'data.export', 'dossier.export']));
  });
});

import { normalizeDossier } from '../../server/services/dossier/dossier';
describe('v62 — a dossier written with English keys or loose recommendations is not empty', () => {
  it('sections / indicators / top-level recommendations are read', () => {
    const d = normalizeDossier({
      summary: 'Le segment 8200 concentre 34 Md XOF d’exposition nette sur 71 clients ; les 20 premiers en portent l’essentiel.',
      indicators: [{ name: 'Exposition nette', value: '34,2 Md XOF' }, { title: 'Clients', value: 71 }],
      sections: [{ name: 'Concentration', findings: 'Les 20 premiers clients portent 80 % de l’exposition.' }, { heading: 'Qualité', key_findings: ['2 clients NP'] }],
      recommendations: [{ recommendation: 'Plafonner les 5 premières expositions', responsable: 'Direction des risques', deadline: 'T1 2027', axis: 'Concentration' }, 'Revue trimestrielle des NP'],
      decisions_requested: [{ decision: 'Valider la limite de concentration' }],
    });
    expect(d.thesis).toMatch(/segment 8200/);
    expect(d.kpis.map((k) => k.label)).toEqual(['Exposition nette', 'Clients']);
    expect(d.chapters.map((c) => c.title)).toEqual(['Concentration', 'Qualité']);
    expect(d.chapters[0]!.constats).toEqual(['Les 20 premiers clients portent 80 % de l’exposition.']);
    expect(d.chapters[0]!.recommandations[0]).toMatchObject({ title: 'Plafonner les 5 premières expositions', owner: 'Direction des risques', due: 'T1 2027', ref: 'R-01' });
    expect(d.chapters[1]!.recommandations[0]).toMatchObject({ title: 'Revue trimestrielle des NP', ref: 'R-02' });
    expect(d.decisions).toEqual([{ code: 'D1', text: 'Valider la limite de concentration' }]);
  });
});
