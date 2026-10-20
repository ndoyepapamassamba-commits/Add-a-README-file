# Lance plusieurs générations AI Horde en parallèle (anonyme) puis les attend toutes.
# python3 lot.py lot.json   — lot.json : [{"out": "...png", "prompt": "...", "w": 832, "h": 1216, "seed": 7, "model": "Z-Image-Turbo"}, ...]
import json, sys, time, threading, os
sys.path.insert(0, os.path.dirname(__file__))
import horde
jobs = json.load(open(sys.argv[1]))
res = {}
def run(j):
    for attempt in range(3):
        try:
            if os.path.exists(j['out']): res[j['out']] = 'déjà'; return
            horde.generate(j['prompt'], j['out'], j.get('w', 832), j.get('h', 1216), j.get('model', 'Z-Image-Turbo'), j.get('seed'))
            res[j['out']] = 'ok'; return
        except SystemExit as e: res[j['out']] = f'échec {e}'
        except Exception as e: res[j['out']] = f'erreur {e}'; time.sleep(10)
ts = [threading.Thread(target=run, args=(j,)) for j in jobs]
for t in ts: t.start(); time.sleep(1.5)
for t in ts: t.join()
print(json.dumps(res, ensure_ascii=False, indent=1))
