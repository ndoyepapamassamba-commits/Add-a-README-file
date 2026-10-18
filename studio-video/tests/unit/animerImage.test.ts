import { describe, expect, it } from 'vitest';
import {
  ErreurQuotaGpu,
  QUOTA_JOUR_S,
  bilanQuota,
  clipsRestants,
  consigneWan,
  lireFlux,
  lireQuotaRestant,
  messageErreur,
  quotaClip,
  verifierJetonHf,
} from '../../coeur/videogen/gpuDistant';
import { elementsJuge, gpuParClipUtilisable, lireVerdict } from '../../coeur/videogen/jugeClip';

const H = 3600 * 1000;
const flux = (lignes: string[]) => new ReadableStream<Uint8Array>({
  start(c) { const e = new TextEncoder(); for (const l of lignes) c.enqueue(e.encode(l + '\n')); c.close(); },
});

describe('« Animer mon image » : quota du jour (règle ZeroGPU : remise à zéro 24 h après la première utilisation)', () => {
  it('cumule dans la fenêtre ouverte par la première utilisation, puis remet à zéro', () => {
    const t0 = Date.UTC(2026, 9, 18, 8, 0);
    const r = [{ t: t0, s: 30 }, { t: t0 + 2 * H, s: 30 }, { t: t0 + 5 * H, s: 40 }];
    expect(bilanQuota(r, t0 + 6 * H)).toEqual({ utiliseS: 100, remiseA: t0 + 24 * H });
    expect(bilanQuota(r, t0 + 24 * H)).toEqual({ utiliseS: 0, remiseA: null });
    // une utilisation après la remise ouvre une nouvelle fenêtre
    const r2 = [...r, { t: t0 + 25 * H, s: 29 }];
    expect(bilanQuota(r2, t0 + 26 * H)).toEqual({ utiliseS: 29, remiseA: t0 + 49 * H });
    expect(bilanQuota([], t0)).toEqual({ utiliseS: 0, remiseA: null });
  });
  it('clips restants : compte gratuit 5 min, clip TikTok 3 s en 4 étapes ≈ 29 s', () => {
    const parClip = quotaClip(3, 4, 1080, 1920);
    expect(QUOTA_JOUR_S).toEqual({ anonyme: 120, gratuit: 300 });
    expect(clipsRestants(QUOTA_JOUR_S.gratuit, 0, parClip)).toBe(10);
    expect(clipsRestants(QUOTA_JOUR_S.gratuit, 4 * parClip, parClip)).toBe(6);
    expect(clipsRestants(QUOTA_JOUR_S.anonyme, 0, parClip)).toBe(4);
    expect(clipsRestants(QUOTA_JOUR_S.anonyme, 500, parClip)).toBe(0);
  });
  it('lit ce que le GPU dit du quota restant et garde le message en français', async () => {
    const brut = 'You have exceeded your GPU quota (60s requested vs. 12s left). Create a free account to get more usage quota.';
    expect(lireQuotaRestant(brut)).toEqual({ demandeS: 60, resteS: 12 });
    expect(messageErreur(brut)).toMatch(/^Quota GPU gratuit du jour épuisé.*Il reste 12 s, ce clip en demande 60\./);
    const e = await lireFlux(flux([`data: ${JSON.stringify({ msg: 'process_completed', success: false, output: { error: brut } })}`])).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurQuotaGpu);
    expect((e as ErreurQuotaGpu).resteS).toBe(12);
  });
});

describe('consigne Wan 2.2 « un seul temps » (veille du 18/10 : action → caméra → rythme)', () => {
  it('assemble dans l’ordre, en anglais, avec la garde d’identité', () => {
    const c = consigneWan({ action: 'Salue de la main', camera: 'Zoom avant lent', rythme: 'Naturel', libre: 'she holds a calabash' });
    expect(c).toBe('The character raises one hand and waves hello. Slow dolly in toward the character. natural, realistic pace. she holds a calabash. Keep the same character, face, clothes and colors as in the image.');
    expect(consigneWan({})).toBe('Keep the same character, face, clothes and colors as in the image.');
  });
});

describe('jeton Hugging Face : vérifié sans jamais être renvoyé', () => {
  it('renvoie le nom du compte, pas le jeton', async () => {
    let vu = '';
    const faux = (async (url: string, init?: RequestInit) => {
      vu = `${url} ${((init?.headers as Record<string, string>).Authorization ?? '').slice(0, 10)}`;
      return new Response(JSON.stringify({ name: 'massamba', isPro: false, auth: { accessToken: { role: 'read' } } }));
    }) as unknown as typeof fetch;
    const c = await verifierJetonHf(' hf_secret_de_test ', faux);
    expect(c).toEqual({ nom: 'massamba', pro: false, role: 'read' });
    expect(JSON.stringify(c)).not.toMatch(/hf_/);
    expect(vu).toBe('https://huggingface.co/api/whoami-v2 Bearer hf_');
  });
  it('jeton refusé : message clair', async () => {
    const faux = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    await expect(verifierJetonHf('x', faux)).rejects.toThrow(/Jeton Hugging Face refusé/);
  });
});

describe('JEV juge chaque clip : aucune tolérance (chaque probabilité > 0,5)', () => {
  const el = elementsJuge('The character raises one hand and waves hello');
  const verdict = (ps: [number, number, number]) => ({
    seen: el.map((e, i) => ({ name: e.name, p: ps[i]! })).filter((x) => x.p >= 0.5),
    missing: el.map((e, i) => ({ name: e.name, p: ps[i]! })).filter((x) => x.p < 0.5),
    unmet: [], finish: 2.4, fidelity: 0, boxes: {}, tokens: 900, costUsd: 0.0004,
  });
  it('utilisable seulement si les trois dépassent 0,5', () => {
    expect(lireVerdict(verdict([0.91, 0.77, 0.88]), el)).toMatchObject({ identite: 0.91, mouvement: 0.77, proprete: 0.88, conforme: true });
    expect(lireVerdict(verdict([0.91, 0.5, 0.88]), el)?.conforme).toBe(false);   // 0,5 n'est pas « au-dessus »
    expect(lireVerdict(verdict([0.42, 0.9, 0.9]), el)?.conforme).toBe(false);
  });
  it('JEV muet sur une question : pas de verdict inventé', () => {
    const v = verdict([0.9, 0.9, 0.9]);
    v.seen = v.seen.slice(0, 2);
    expect(lireVerdict(v, el)).toBeNull();
  });
  it('secondes de GPU par clip validé', () => {
    expect(gpuParClipUtilisable([{ reserveS: 29, conforme: true }, { reserveS: 29, conforme: false }, { reserveS: 29, conforme: true }])).toBe(43.5);
    expect(gpuParClipUtilisable([{ reserveS: 29, conforme: false }])).toBeNull();
  });
});
