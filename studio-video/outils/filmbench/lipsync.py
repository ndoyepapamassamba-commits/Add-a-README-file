# Lip-sync measured the same way on every film: only pictures where ONE face dominates (close-ups, singles: the face
# on screen is the speaker), mouth opening vs the loudness of the speech band; the score is the correlation at lag 0
# minus the mean correlation at far lags (±0.75–1 s): a real lip-sync peaks at 0, a mouth moving at random does not.
import json, sys, os, wave
import numpy as np
B = os.environ.get('FILMBENCH_DIR', '.filmbench')
FPS = 8
def env(path, n):
    w = wave.open(path); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    x = np.diff(x, prepend=0)
    hop = sr // FPS
    return np.array([np.log(np.sqrt(np.mean(x[i*hop:(i+1)*hop] ** 2)) + 1e-5) if (i+1)*hop <= len(x) else np.log(1e-5) for i in range(n)])
def run(n):
    faces = json.load(open(os.path.join(B, n, 'faces.json')))
    e = env(os.path.join(B, n, 'audio.wav'), len(faces) + 16)
    m = np.full(len(faces), np.nan)
    for i, f in enumerate(faces):
        if not f: continue
        fs = sorted(f, key=lambda q: -q['size'])
        if fs[0]['size'] < 90: continue
        if len(fs) > 1 and fs[1]['size'] > fs[0]['size'] / 1.4: continue
        m[i] = fs[0]['open']
    def corr(lag):
        a, b = [], []
        for i in range(len(faces)):
            j = i + lag
            if np.isnan(m[i]) or j < 0 or j >= len(e): continue
            a.append(m[i]); b.append(e[j])
        if len(a) < 20 or np.std(a) < 1e-6: return np.nan
        return float(np.corrcoef(a, b)[0, 1])
    c0 = corr(0)
    far = np.nanmean([corr(l) for l in (-8, -7, -6, 6, 7, 8)])
    return {'lipsync0': round(c0, 3), 'farLags': round(float(far), 3), 'syncPeak': round(c0 - float(far), 3), 'frames': int(np.sum(~np.isnan(m)))}

# v2: the DARK MOUTH — share of dark pixels (cavity, tongue, teeth shadow) inside the lips box, vs the speech loudness.
from PIL import Image
def dark_mouth(n):
    d = os.path.join(B, n)
    faces = json.load(open(os.path.join(d, 'faces.json')))
    fs = sorted(x for x in os.listdir(d) if x.startswith('f_') and x.endswith('.jpg'))
    e = env(os.path.join(d, 'audio.wav'), len(faces) + 16)
    m = np.full(len(faces), np.nan)
    for i, f in enumerate(faces):
        if not f or i >= len(fs): continue
        q = sorted(f, key=lambda z: -z['size'])
        if q[0]['size'] < 90 or 'lips' not in q[0]: continue
        if len(q) > 1 and q[1]['size'] > q[0]['size'] / 1.4: continue
        (lx, ly), (rx, ry), (tx, ty), (bx, by) = q[0]['lips']
        w = rx - lx
        if w < 12: continue
        x0, x1 = int(lx + 0.12 * w), int(rx - 0.12 * w)
        y0, y1 = int(min(ty, ly, ry) - 0.05 * w), int(max(by, ly, ry) + 0.05 * w)
        g = np.asarray(Image.open(os.path.join(d, fs[i])).convert('L'), dtype=np.float32)
        c = g[max(0, y0):y1, max(0, x0):x1]
        face = g[int(q[0]['box'][1]):int(q[0]['box'][3]), int(q[0]['box'][0]):int(q[0]['box'][2])]
        if c.size < 20 or face.size < 100: continue
        m[i] = float((c < 0.42 * np.median(face)).mean())
    def corr(lag):
        a, b = [], []
        for i in range(len(faces)):
            j = i + lag
            if np.isnan(m[i]) or j < 0 or j >= len(e): continue
            a.append(m[i]); b.append(e[j])
        if len(a) < 20 or np.std(a) < 1e-6: return np.nan
        return float(np.corrcoef(a, b)[0, 1])
    c0 = corr(0)
    far = np.nanmean([corr(l) for l in (-8, -7, -6, 6, 7, 8)])
    return {'darkSync0': round(c0, 3), 'darkFar': round(float(far), 3), 'darkPeak': round(c0 - float(far), 3), 'frames': int(np.sum(~np.isnan(m)))}
if __name__ == '__main__':
    for n in sys.argv[1:]:
        print(n, run(n), dark_mouth(n), flush=True)
