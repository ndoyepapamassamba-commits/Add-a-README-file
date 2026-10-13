import { describe, expect, it } from 'vitest';
import { bridgeHealth, bridgeRender, DEFAULT_BRIDGE } from '../../direct/lib/blenderBridge';

type Call = { url: string; init?: RequestInit };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

describe('local Blender bridge client', () => {
  it('health: null when nothing answers, the bridge description when it does', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await bridgeHealth({ fetchFn: down, url: DEFAULT_BRIDGE })).toBeNull();
    const up = (async () => json({ ok: true, mode: 'blender', blender: 'Blender 4.5.3', jobs: 0 })) as unknown as typeof fetch;
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
      return json(polls < 3 ? { status: 'running', frames: polls * 10, total: 48 } : { status: 'done', frames: 48, total: 48, report: { blender: 'bpy 5.0.1', engine: 'CYCLES', resolution: [480, 854], fps: 24, frames: 48, seconds: 2, objects: 10, render_time_s: 12 } });
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    const r = await bridgeRender({ glb: new TextEncoder().encode('glb!'), seconds: 2, orbit: true }, { fetchFn: fake, url: 'http://127.0.0.1:8765', pollMs: 1, onProgress: (f) => progress.push(f) });
    expect(r.report.frames).toBe(48);
    expect(Array.from(r.video!)).toEqual([1, 2, 3]);
    expect(Array.from(r.verify!)).toEqual([9]);
    expect(progress).toEqual([10, 20, 48]);
    expect(calls[0]!.url).toBe('http://127.0.0.1:8765/render');
  });
  it('render: an error of the job surfaces with its log; no input is refused', async () => {
    const fake = (async (url: string) => (url.endsWith('/render') ? json({ id: 'b'.repeat(32) }, 202) : json({ status: 'error', error: 'rendu terminé avec le code 1', log: 'ImportError: bpy' }))) as unknown as typeof fetch;
    await expect(bridgeRender({ script: 'import bpy' }, { fetchFn: fake, url: 'http://x', pollMs: 1 })).rejects.toThrow(/code 1[\s\S]*ImportError/);
    await expect(bridgeRender({}, { fetchFn: fake, url: 'http://x' })).rejects.toThrow(/script bpy ou GLB/);
  });
});
