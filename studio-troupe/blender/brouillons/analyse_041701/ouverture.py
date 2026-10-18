"""Ouverture de bouche par 'écart au repos' : région suivie comparée au modèle 'bouche fermée' du même plan."""
import numpy as np, cv2, json
from scipy.io import wavfile
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
P=np.load(W+'/persos.npy',allow_pickle=True).item()
N=301; Y0,Y1=531,1390
SEG=[(0,61),(61,72),(72,130),(130,142),(142,268),(268,277),(277,301)]
# enveloppe audio par image
sr,a=wavfile.read(W+'/audio16k.wav'); a=a.astype(np.float32)/32768
env=np.array([np.sqrt((a[int(i/30*sr):int((i+1)/30*sr)]**2).mean()) for i in range(N)])
env_db=20*np.log10(env+1e-6)
LIG={'V':[(0.0,2.18),(4.38,5.72)],'T':[(2.18,4.38),(5.72,8.92)]}
t=np.arange(N)/30
res={}
for nm in 'VT':
    o=P[nm]; s=0.95*o['tete']; c=o['bouche_c']
    rois=[]
    for i in range(N):
        g=cv2.cvtColor(np.ascontiguousarray(F[i,Y0:Y1]),cv2.COLOR_RGB2GRAY).astype(np.float32)
        cx,cy=c[i]
        x0,x1=int(round(cx-0.5*s)),int(round(cx+0.5*s)); y0,y1=int(round(cy-0.3*s)),int(round(cy+0.75*s))
        x0,y0=max(0,x0),max(0,y0); x1,y1=min(1080,x1),min(859,y1)
        rois.append(cv2.resize(g[y0:y1,x0:x1],(48,48),interpolation=cv2.INTER_AREA))
    rois=np.array(rois)
    act=o['diff']
    ecart=np.zeros(N)
    parle=np.zeros(N,bool)
    for a_,b_ in LIG[nm]: parle|=(t>=a_)&(t<b_)
    for a_,b_ in SEG:
        idx=np.arange(a_,b_)
        # repos = images du plan où le personnage ne parle pas, sinon les 25 % d'activité la plus faible
        rep=idx[~parle[idx]]
        if len(rep)<5:
            rep=idx[np.argsort(act[idx])[:max(3,len(idx)//4)]]
        modele=np.median(rois[rep],0)
        ecart[idx]=np.abs(rois[idx]-modele).mean((1,2))
    res[nm]=ecart
    m=parle
    for nom,serie in [('sombre',o['sombre']),('diff',act),('ecart',ecart),('rtmw',o['ouv_rtmw'])]:
        cc=np.corrcoef(serie[m],env_db[m])[0,1]
        ratio=serie[m].mean()/max(1e-6,serie[~m&(t<8.92)].mean())
        print(nm,'%-7s corr(enveloppe audio, pendant ses répliques)=%.2f  ratio parle/écoute=%.2f'%(nom,cc,ratio))
np.save(W+'/ecart_repos.npy',np.stack([res['V'],res['T']]))
np.save(W+'/enveloppe_audio.npy',env_db)
