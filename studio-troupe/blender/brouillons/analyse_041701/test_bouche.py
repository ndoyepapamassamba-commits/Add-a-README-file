import numpy as np, cv2, sys
sys.path.insert(0,'.')
from reperes_base import mp_visage, rtmw
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
tiles=[]
for i in [int(a) for a in sys.argv[1:]]:
    band=np.ascontiguousarray(F[i,531:1390])
    for nm,b in {'V':(100,140,460,859),'T':(560,190,1020,859)}.items():
        K=rtmw(band,b)
        fc=K[23:91]
        c=fc[:,:2].mean(0); s=max(60,np.ptp(fc[:,0]),np.ptp(fc[:,1]))*1.6
        x0,y0=int(c[0]-s/2),int(c[1]-s/2); x1,y1=int(c[0]+s/2),int(c[1]+s/2)
        P,bl=mp_visage(band,(x0,y0,x1,y1),512)
        crop=cv2.resize(band[max(0,y0):y1,max(0,x0):x1],(256,256),interpolation=cv2.INTER_CUBIC)
        sc=256/(x1-max(0,x0))
        def pt(p): return (int((p[0]-max(0,x0))*sc),int((p[1]-max(0,y0))*sc))
        for j in range(48,68):
            cv2.circle(crop,pt(fc[j]),2,(255,255,0) if j<60 else (255,0,255),-1)
        for j in [62,66]: cv2.circle(crop,pt(fc[j]),4,(255,0,0),1)
        if P is not None:
            for j in [13,14,78,308,61,291]: cv2.circle(crop,pt(P[j]),2,(0,255,0),-1)
        op=np.linalg.norm(fc[62,:2]-fc[66,:2])/max(1,np.linalg.norm(fc[27,:2]-fc[8,:2]))
        cv2.putText(crop,f'{i}{nm} rt{op:.2f} jaw{bl.get("jawOpen",-1):.2f}',(3,15),cv2.FONT_HERSHEY_SIMPLEX,0.45,(255,255,255),1)
        tiles.append(crop)
rows=[np.hstack(tiles[k:k+6]) for k in range(0,len(tiles),6)]
rows=[np.pad(r,((0,0),(0,256*6-r.shape[1]),(0,0))) for r in rows]
cv2.imwrite(W+'/v_bouches.jpg',cv2.cvtColor(np.vstack(rows),cv2.COLOR_RGB2BGR))
