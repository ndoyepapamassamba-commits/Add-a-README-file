# Proof bench: lip-sync, face stability, sharpness for each film of the bench (frames 8 fps 540x960 + audio 16 kHz).
import json, sys, wave, os
import numpy as np
from PIL import Image, ImageFilter
B=os.environ.get('FILMBENCH_DIR', '.filmbench')
FPS=8
def audio_env(path, n):
    w=wave.open(path); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
    # speech band: remove the bass of the music (difference = high-pass)
    x=np.diff(x, prepend=0)
    hop=sr//FPS
    env=np.array([np.sqrt(np.mean(x[i*hop:(i+1)*hop]**2)) if (i+1)*hop<=len(x) else 0 for i in range(n)])
    return np.log(env+1e-5)
def lipsync(faces, env):
    m=[]; e=[]
    for i,f in enumerate(faces):
        if not f or i>=len(env): continue
        m.append(max(x['open'] for x in f)); e.append(env[i])
    if len(m)<20: return None, len(m)
    m=np.array(m); e=np.array(e)
    if m.std()<1e-6: return 0.0, len(m)
    return float(np.corrcoef(m,e)[0,1]), len(m)
def lipsync_best(faces, env):
    # same, best of the lags -1..+1 frame (±125 ms) for every film alike
    best=None
    for lag in (-1,0,1):
        m=[]; e=[]
        for i,f in enumerate(faces):
            j=i+lag
            if not f or j<0 or j>=len(env): continue
            m.append(max(x['open'] for x in f)); e.append(env[j])
        if len(m)<20: continue
        m=np.array(m); e=np.array(e)
        if m.std()<1e-6: continue
        c=float(np.corrcoef(m,e)[0,1]); best=c if best is None else max(best,c)
    return best
def tracks_of(faces, W=540):
    tracks=[]; active=[]
    for i,f in enumerate(faces):
        nxt=[]; used=set()
        for t in active:
            last=t[-1][1]; best=None; bd=1e9
            for j,x in enumerate(f):
                if j in used: continue
                d=np.hypot(x['cx']-last['cx'], x['cy']-last['cy'])
                if d<bd and d<0.12*W and abs(x['size']-last['size'])<0.35*last['size']: bd=d; best=j
            if best is not None: used.add(best); t.append((i,f[best])); nxt.append(t)
            else: tracks.append(t)
        for j,x in enumerate(f):
            if j not in used: nxt.append([(i,x)])
        active=nxt
    return tracks+active
def upper_crop(im, x):
    # the upper face (eyes, brows, forehead, nose) aligned on the eyes: 64x40, eye distance = 32 px; the crop stops at
    # the nose (16 px under the eyes) so a talking mouth never enters it — on a cartoon face with big eyes the mouth sits
    # less than one eye distance under them, and it was read as a drifting identity (v11)
    (lx,ly),(rx,ry)=x['pts'][0],x['pts'][1]
    ex,ey=(lx+rx)/2,(ly+ry)/2
    dist=max(1e-3,np.hypot(rx-lx,ry-ly)); a=np.arctan2(ry-ly,rx-lx); s=dist/32.0
    ca,sa=np.cos(a)*s,np.sin(a)*s
    # output (u,v) -> input: centre of the crop (32,24) on the eye midpoint
    A=(ca,-sa,ex-ca*32+sa*24, sa,ca,ey-sa*32-ca*24)
    c=np.asarray(im.transform((64,40),Image.AFFINE,A,resample=Image.BILINEAR),dtype=np.float32)
    c=c-c.mean(); n=np.linalg.norm(c)
    return c/n if n>1e-6 else None
JUMP=0.35
def identity_drift(d, faces):
    # how far each tracked face drifts from its own reference picture (1 - correlation of the aligned upper face):
    # the SLOW deformation of a face (a warp eating the drawing, a model morphing). A JUMP between two consecutive
    # pictures (> JUMP: a new drawing of the character — the laugh, the shock — or a cut) opens a new segment with its
    # own reference and is not drift: jumps are counted by popsPerMin.
    fs=sorted(x for x in os.listdir(d) if x.endswith('.jpg'))
    cache={}
    def img(i):
        if i not in cache: cache[i]=Image.open(os.path.join(d,fs[i])).convert('L')
        return cache[i]
    out=[]
    for t in tracks_of(faces):
        if len(t)<6 or 'pts' not in t[0][1]: continue
        if np.hypot(t[0][1]['pts'][1][0]-t[0][1]['pts'][0][0], t[0][1]['pts'][1][1]-t[0][1]['pts'][0][1])<14: continue
        ref=upper_crop(img(t[0][0]), t[0][1])
        if ref is None: continue
        prev=ref
        v=[]
        for i,x in t[1:]:
            c=upper_crop(img(i), x)
            if c is None: continue
            if 1-float((prev*c).sum())>JUMP:
                ref=c
            else:
                v.append(1-float((ref*c).sum()))
            prev=c
        if v: out.append(float(np.median(v)))
    return (float(np.median(out)) if out else None), len(out)
def stability(faces, W=540):
    tracks=[]; active=[]
    for f in faces:
        nxt=[]
        used=set()
        for t in active:
            last=t[-1]
            best=None; bd=1e9
            for j,x in enumerate(f):
                if j in used: continue
                d=np.hypot(x['cx']-last['cx'], x['cy']-last['cy'])
                if d<bd and d<0.12*W and abs(x['size']-last['size'])<0.35*last['size']: bd=d; best=j
            if best is not None: used.add(best); t.append(f[best]); nxt.append(t)
            else: tracks.append(t)
        for j,x in enumerate(f):
            if j not in used: nxt.append([x])
        active=nxt
    tracks+=active
    cvs=[]
    for t in tracks:
        if len(t)<6: continue
        g=np.array([x['u'] for x in t])
        cv=(g.std(axis=0)/np.maximum(1e-6,g.mean(axis=0)))
        cvs.append(float(cv.mean()))
    return (float(np.median(cvs)) if cvs else None), len(cvs)
def sharpness(d):
    fs=sorted(x for x in os.listdir(d) if x.endswith('.jpg'))[::4]
    v=[]
    for f in fs:
        im=np.asarray(Image.open(os.path.join(d,f)).convert('L'),dtype=np.float32)
        lap=im[1:-1,1:-1]*4-im[:-2,1:-1]-im[2:,1:-1]-im[1:-1,:-2]-im[1:-1,2:]
        v.append(lap.var())
    return float(np.median(v))
def face_sharpness(d, faces):
    # Laplacian variance inside the detected faces only (the subject's crispness, whatever the background blur)
    fs=sorted(x for x in os.listdir(d) if x.endswith('.jpg'))
    v=[]
    for i,f in enumerate(faces):
        if not f or i>=len(fs) or i%2: continue
        im=None
        for x in f:
            if 'box' not in x: continue
            x0,y0,x1,y1=x['box']
            if x1-x0<24: continue
            if im is None: im=np.asarray(Image.open(os.path.join(d,fs[i])).convert('L'),dtype=np.float32)
            c=im[max(0,y0):y1, max(0,x0):x1]
            if c.shape[0]<8 or c.shape[1]<8: continue
            # same scale for every face: resample to 96 px wide
            c=np.asarray(Image.fromarray(c.astype(np.uint8)).resize((96,max(8,int(96*c.shape[0]/c.shape[1])))),dtype=np.float32)
            lap=c[1:-1,1:-1]*4-c[:-2,1:-1]-c[2:,1:-1]-c[1:-1,:-2]-c[1:-1,2:]
            v.append(lap.var())
    return (float(np.median(v)) if v else None), len(v)
if __name__ == '__main__':
    res={}
    for n in sys.argv[1:]:
        d=os.path.join(B,n)
        faces=json.load(open(os.path.join(d,'faces.json')))
        env=audio_env(os.path.join(d,'audio.wav'), len(faces))
        ls,nls=lipsync(faces, env)
        st,nst=stability(faces)
        sh=sharpness(d)
        fsh,nfs=face_sharpness(d, faces)
        idr,nid=identity_drift(d, faces)
        lb=lipsync_best(faces, env)
        res[n]={'lipsync':None if ls is None else round(ls,3),'lipsyncBestLag':None if lb is None else round(lb,3),'framesWithFaces':nls,'faceDeform':None if st is None else round(st,4),'tracks':nst,'sharpness':round(sh,1),'faceSharpness':None if fsh is None else round(fsh,1),'facesMeasured':nfs,'identityDrift':None if idr is None else round(idr,4),'idTracks':nid}
        print(n, res[n])
    json.dump(res,open(os.path.join(B,'analysis.json'),'w'),indent=1)
