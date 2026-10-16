# Client AI Horde (réseau communautaire, usage anonyme sans compte : clé publique 0000000000).
# python3 horde.py "<prompt>" sortie.png [largeur] [hauteur] [modèle] [graine] [pas]
import json, sys, time, urllib.request, base64
API = 'https://aihorde.net/api/v2'
H = {'apikey': '0000000000', 'Content-Type': 'application/json', 'Client-Agent': 'massamba-troupe:1.0:anonymous', 'User-Agent': 'massamba-troupe/1.0 (+anonymous)'}
def call(method, path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, headers=H, method=method)
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
REQ = {'DreamShaper XL': dict(steps=30, cfg=6.0, karras=True), 'AlbedoBase XL (SDXL)': dict(steps=30, cfg=6.0, karras=True), 'Z-Image-Turbo': dict(steps=9, cfg=1.0, karras=False), 'Qwen-Image_fp8': dict(steps=20, cfg=2.5, karras=False), 'Flux.1-Schnell fp8 (Compact)': dict(steps=6, cfg=1.0, karras=True)}
def generate(prompt, out, w=832, h=1216, model='Z-Image-Turbo', seed=None, steps=None, neg='', cfg=None, sampler='k_euler', src=None, strength=None):
    q = REQ.get(model, dict(steps=steps or 20, cfg=cfg or 5.0, karras=False))
    params = {'width': w, 'height': h, 'steps': steps or q['steps'], 'cfg_scale': cfg or q['cfg'], 'sampler_name': sampler, 'n': 1, 'karras': q['karras'], 'scheduler': 'karras' if q['karras'] else 'simple'}
    if 'XL' in model: params['sampler_name'] = 'k_dpmpp_2m'
    if seed is not None: params['seed'] = str(seed)
    if strength is not None: params['denoising_strength'] = strength
    body = {'prompt': prompt + (f' ### {neg}' if neg else ''), 'params': params, 'models': [model], 'nsfw': False, 'censor_nsfw': True, 'r2': True, 'shared': False, 'replacement_filter': True}
    if src: body['source_image'] = base64.b64encode(open(src, 'rb').read()).decode(); body['source_processing'] = 'img2img'
    t0 = time.time(); j = call('POST', '/generate/async', body); jid = j['id']
    print('job', jid, 'kudos', j.get('kudos'), flush=True)
    while True:
        time.sleep(4)
        s = call('GET', f'/generate/check/{jid}')
        if s.get('faulted'): raise SystemExit('faulted')
        if s.get('done'): break
        if time.time() - t0 > 900: raise SystemExit('timeout')
        print(f"  queue {s.get('queue_position')} wait {s.get('wait_time')} proc {s.get('processing')}", flush=True)
    r = call('GET', f'/generate/status/{jid}')
    g = r['generations'][0]
    data = urllib.request.urlopen(g['img'], timeout=120).read() if g['img'].startswith('http') else base64.b64decode(g['img'])
    open(out, 'wb').write(data)
    print('ok', out, g.get('model'), 'seed', g.get('seed'), 'worker', g.get('worker_name'), f'{time.time()-t0:.0f}s', flush=True)
    return g
if __name__ == '__main__':
    a = sys.argv
    generate(a[1], a[2], int(a[3]) if len(a) > 3 else 832, int(a[4]) if len(a) > 4 else 1216, a[5] if len(a) > 5 else 'Z-Image-Turbo', a[6] if len(a) > 6 else None, int(a[7]) if len(a) > 7 else None)
