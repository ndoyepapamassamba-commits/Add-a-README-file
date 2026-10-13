import { describe, expect, it } from 'vitest';
import { bridgeFilm, bridgeHealth, bridgeRender, DEFAULT_BRIDGE } from '../../direct/lib/blenderBridge';

type Call = { url: string; init?: RequestInit };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

describe('local Blender bridge client', () => {
  it('health: null when nothing answers, the bridge description when it does', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await bridgeHealth({ fetchFn: down, url: DEFAULT_BRIDGE })).toBeNull();
    const up = (async () =>
      json({ ok: true, mode: 'blender', blender: 'Blender 4.5.3', jobs: 0 })) as unknown as typeof fetch;
    const h = await bridgeHealth({ fetchFn: up, url: 'http://127.0.0.1:8765/' });
    expect(h).toMatchObject({ ok: true, mode: 'blender', blender: 'Blender 4.5.3' });
  });
  it('render: posts the job, polls until done, reports progress and fetches the video and the still', async () => {
    const calls: Call[] = [];
    let polls = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/render')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.glb_base64).toBe(btoa('glb!'));
        expect(body.orbit).toBe(true);
        expect(body.engine).toBe('EEVEE');
        expect(body.seconds).toBe(2);
        return json({ id: 'a'.repeat(32), status: 'queued' }, 202);
      }
      if (url.endsWith('/video')) return new Response(new Uint8Array([1, 2, 3]));
      if (url.endsWith('/verify')) return new Response(new Uint8Array([9]));
      polls++;
      return json(
        polls < 3
          ? { status: 'running', frames: polls * 10, total: 48 }
          : {
              status: 'done',
              frames: 48,
              total: 48,
              report: {
                blender: 'bpy 5.0.1',
                engine: 'CYCLES',
                resolution: [480, 854],
                fps: 24,
                frames: 48,
                seconds: 2,
                objects: 10,
                render_time_s: 12,
              },
            },
      );
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    const r = await bridgeRender(
      { glb: new TextEncoder().encode('glb!'), seconds: 2, orbit: true },
      { fetchFn: fake, url: 'http://127.0.0.1:8765', pollMs: 1, onProgress: (f) => progress.push(f) },
    );
    expect(r.report.frames).toBe(48);
    expect(Array.from(r.video!)).toEqual([1, 2, 3]);
    expect(Array.from(r.verify!)).toEqual([9]);
    expect(progress).toEqual([10, 20, 48]);
    expect(calls[0]!.url).toBe('http://127.0.0.1:8765/render');
  });
  it('render: an error of the job surfaces with its log; no input is refused', async () => {
    const fake = (async (url: string) =>
      url.endsWith('/render')
        ? json({ id: 'b'.repeat(32) }, 202)
        : json({
            status: 'error',
            error: 'rendu terminé avec le code 1',
            log: 'ImportError: bpy',
          })) as unknown as typeof fetch;
    await expect(
      bridgeRender({ script: 'import bpy' }, { fetchFn: fake, url: 'http://x', pollMs: 1 }),
    ).rejects.toThrow(/code 1[\s\S]*ImportError/);
    await expect(bridgeRender({}, { fetchFn: fake, url: 'http://x' })).rejects.toThrow(/script bpy ou GLB/);
  });
  it('film: posts the story, polls, then fetches the creator kit (video, cover, captions, post, gate verdict)', async () => {
    let polls = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/film')) {
        const body = JSON.parse(String(init?.body)) as { story: { title: string }; samples: number };
        expect(body.story.title).toBe('Le poulet');
        expect(body.samples).toBe(10);
        return json({ id: 'c'.repeat(32) }, 202);
      }
      if (url.endsWith('/video')) return new Response(new Uint8Array([4, 5]));
      if (url.endsWith('/cover')) return new Response(new Uint8Array([7]));
      if (url.endsWith('/srt')) return new Response('1\n00:00:00,100 --> 00:00:01,000\nQui ?\n');
      if (url.endsWith('/post')) return new Response('Qui a mangé le poulet ? #afrikatoon');
      if (url.endsWith('/preflight')) return new Response('<html>Preflight QA</html>');
      polls++;
      return json(
        polls < 2
          ? { status: 'running', frames: 100, total: 1700 }
          : {
              status: 'done',
              frames: 1700,
              total: 1700,
              report: {
                frames_expected: 1700,
                frames_encoded: 1700,
                video_s: 68,
                audio_s: 68,
                av_gap_ms: 0,
                shots: 30,
                gate: { passed: true, failed: [] },
                preflight: {
                  score: 94,
                  verdict: 'validé',
                  passed: true,
                  issues: 3,
                  fixes: 1,
                  critiques: [],
                  categories: {},
                },
              },
            },
      );
    }) as unknown as typeof fetch;
    const seen: string[] = [];
    const r = await bridgeFilm(
      { title: 'Le poulet' },
      { fetchFn: fake, url: 'http://x', pollMs: 1, onProgress: (f, t, st) => seen.push(`${st} ${f}/${t}`) },
    );
    expect(seen).toEqual(['running 100/1700', 'done 1700/1700']);
    expect(r.report.gate).toEqual({ passed: true, failed: [] });
    expect(Array.from(r.video!)).toEqual([4, 5]);
    expect(Array.from(r.cover!)).toEqual([7]);
    expect(r.srt).toContain('Qui ?');
    expect(r.post).toContain('#afrikatoon');
    expect(r.report.preflight?.verdict).toBe('validé');
    expect(r.preflightHtml).toContain('Preflight QA');
    const err = (async (url: string) =>
      url.endsWith('/film')
        ? json({ id: 'd'.repeat(32) }, 202)
        : json({
            status: 'error',
            error: 'film.py code 2',
            log: 'KeyError: decor',
          })) as unknown as typeof fetch;
    await expect(bridgeFilm({}, { fetchFn: err, url: 'http://x', pollMs: 1 })).rejects.toThrow(
      /code 2[\s\S]*KeyError/,
    );
  });
});
