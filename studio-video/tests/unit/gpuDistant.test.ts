import { describe, expect, it } from 'vitest';
import { animerSurGpuDistant, clipsParJour, lireFlux, messageErreur, quotaClip, tailleSpace } from '../../coeur/videogen/gpuDistant';

const flux = (lignes: string[]) => new ReadableStream<Uint8Array>({
  start(c) { const e = new TextEncoder(); for (const l of lignes) c.enqueue(e.encode(l + '\n')); c.close(); },
});

describe('GPU distant gratuit (Space Wan 2.2 14B Fast, quota de l’utilisateur)', () => {
  it('reprend la règle de taille du Space : 4:3 → 832 × 624, 9:16 → 480 × 832, carré → 640', () => {
    expect(tailleSpace(1152, 896)).toEqual([832, 640]);
    expect(tailleSpace(1080, 1920)).toEqual([480, 832]);
    expect(tailleSpace(1000, 1000)).toEqual([640, 640]);
  });
  it('quota réservé par clip (formule get_duration du Space) et clips par jour', () => {
    expect(quotaClip(3, 4, 832, 624)).toBeCloseTo(38.23, 1);
    expect(quotaClip(3, 4, 1080, 1920)).toBeCloseTo(29.0, 0);
    expect(clipsParJour(5, 3, 4, 1080, 1920)).toBe(10);   // compte gratuit : 5 min/jour → 10 clips TikTok de 3 s
    expect(clipsParJour(2, 3, 4, 1080, 1920)).toBe(4);    // sans compte : 2 min/jour
  });
  it('lit le flux de la file de Gradio jusqu’au résultat et signale les étapes', async () => {
    const etats: string[] = [];
    const out = await lireFlux(flux([
      'data: {"msg":"estimation","rank":2,"rank_eta":30}', 'data: {"msg":"process_starts"}',
      'data: {"msg":"progress","progress_data":[{"index":2,"length":4}]}',
      'data: {"msg":"process_completed","success":true,"output":{"data":[{"video":{"url":"https://x/f.mp4"}},42]}}',
    ]), (e) => etats.push(e.phase + (e.progression != null ? `:${e.progression}` : '')));
    expect(out.data[1]).toBe(42);
    expect(etats).toEqual(['file', 'calcul', 'calcul:0.5']);
  });
  it('quota épuisé : message clair, en français', async () => {
    await expect(lireFlux(flux(['data: {"msg":"process_completed","success":false,"output":{"error":"You have exceeded your GPU quota (60s requested vs. 12s left)."}}'])))
      .rejects.toThrow(/Quota GPU gratuit du jour épuisé/);
    expect(messageErreur(null)).toMatch(/sans message/);
  });
  it('enchaîne config → envoi de l’image → file → flux → clip, sur la même racine', async () => {
    const appels: string[] = [];
    const fauxFetch = (async (url: string, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${url.replace(/\?.*/, '')}`);
      if (url.endsWith('/config')) return new Response(JSON.stringify({ api_prefix: '/gradio_api', dependencies: [{ api_name: 'load' }, { api_name: 'generate_video' }] }));
      if (url.includes('/upload')) return new Response(JSON.stringify(['/tmp/gradio/abc/depart.png']));
      if (url.endsWith('/queue/join')) {
        const b = JSON.parse(String(init?.body));
        expect(b.fn_index).toBe(1); expect(b.data[1]).toBe('la grand-mère pointe du doigt'); expect(b.data[2]).toBe(4); expect(b.data[4]).toBe(3);
        return new Response(JSON.stringify({ event_id: 'e1' }));
      }
      if (url.includes('/queue/data')) return new Response(flux(['data: {"msg":"process_completed","success":true,"output":{"data":[{"video":{"url":"https://s.hf.space/gradio_api/file=/tmp/v.mp4"}},7]}}']));
      if (url.endsWith('/v.mp4')) return new Response(new Blob(['MP4']), { status: 200 });
      return new Response('?', { status: 404 });
    }) as unknown as typeof fetch;
    const clip = await animerSurGpuDistant(new Blob(['png']), 'la grand-mère pointe du doigt', { space: 'https://s.hf.space', fetchImpl: fauxFetch });
    expect(await clip.text()).toBe('MP4');
    expect(appels).toEqual(['GET https://s.hf.space/config', 'POST https://s.hf.space/gradio_api/upload', 'POST https://s.hf.space/gradio_api/queue/join',
      'GET https://s.hf.space/gradio_api/queue/data', 'GET https://s.hf.space/gradio_api/file=/tmp/v.mp4']);
  });
});
