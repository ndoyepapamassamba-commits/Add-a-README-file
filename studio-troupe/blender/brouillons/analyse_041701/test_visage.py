import numpy as np, cv2, sys
sys.path.insert(0,'.')
from reperes_base import mp_visage, rtmw
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
for i,boxes in [(0,{'V':(140,150,380,380),'T':(690,190,900,400)}),(280,{'V':(150,140,360,370),'T':(680,210,850,400)})]:
    band=np.ascontiguousarray(F[i,531:1390])
    vis=band.copy()
    for nm,b in boxes.items():
        P,bl=mp_visage(band,b,taille=512)
        print(i,nm,'MP', None if P is None else P.shape, {k:bl[k] for k in ['jawOpen','mouthClose','mouthFunnel'] if k in bl})
        if P is not None:
            for x,y in P[::3]: cv2.circle(vis,(int(x),int(y)),1,(0,255,0),-1)
            for j in [13,14,61,291]: cv2.circle(vis,tuple(int(v) for v in P[j]),3,(255,0,0),-1)
    for nm,b in {'V':(100,140,460,859),'T':(560,190,1020,859)}.items():
        K=rtmw(band,b)
        face=K[23:91]; print(i,nm,'RTMW face score mean %.2f body %.2f'%(face[:,2].mean(),K[:17,2].mean()))
        for x,y,s in K[:133]:
            if s>0.3: cv2.circle(vis,(int(x),int(y)),2,(255,255,0),-1)
    cv2.imwrite(f'{W}/v_visage_{i}.jpg',cv2.cvtColor(vis,cv2.COLOR_RGB2BGR))
