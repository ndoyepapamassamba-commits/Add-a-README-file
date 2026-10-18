import sys, subprocess, numpy as np, cv2, math
from PIL import Image
sys.path.insert(0,'/home/user/Add-a-README-file/studio-troupe/blender/outils')
from mesures import metriques_images
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
n=300
idx=[int(math.floor(i/25*30+1e-6)) for i in range(n)]
def run(name,fn):
    ims=[fn(np.ascontiguousarray(F[k])) for k in idx]
    m=metriques_images(ims,25); m.pop('_details')
    print('%-22s'%name,' '.join('%s=%.3f'%(k[:5],v) for k,v in m.items()))
run('cv_area',lambda a: cv2.resize(a,(180,320),interpolation=cv2.INTER_AREA))
run('cv_linear',lambda a: cv2.resize(a,(180,320),interpolation=cv2.INTER_LINEAR))
run('cv_cubic',lambda a: cv2.resize(a,(180,320),interpolation=cv2.INTER_CUBIC))
run('pil_bilinear',lambda a: np.asarray(Image.fromarray(a).resize((180,320),Image.BILINEAR)))
run('pil_bicubic',lambda a: np.asarray(Image.fromarray(a).resize((180,320),Image.BICUBIC)))
run('pil_lanczos',lambda a: np.asarray(Image.fromarray(a).resize((180,320),Image.LANCZOS)))
run('pil_box',lambda a: np.asarray(Image.fromarray(a).resize((180,320),Image.BOX)))
# chrome-like mipmap: halve with box until < 2x then bilinear
def mip(a):
    b=a
    while b.shape[1]>=2*180*1.0001 or b.shape[0]>=2*320: b=cv2.resize(b,(b.shape[1]//2,b.shape[0]//2),interpolation=cv2.INTER_AREA)
    return cv2.resize(b,(180,320),interpolation=cv2.INTER_LINEAR)
run('mip_linear',mip)
# ffmpeg pipeline fps=25 + scale default (bicubic)
for flags in ['bicubic','bilinear','area','fast_bilinear','lanczos']:
    p=subprocess.run(['ffmpeg','-v','error','-i',W+'/../041701.mp4','-t','12','-vf',f'fps=25,scale=180:320:flags={flags}','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True)
    a=np.frombuffer(p.stdout,np.uint8).reshape(-1,320,180,3)[:300]
    m=metriques_images(list(a),25); m.pop('_details'); print('%-22s'%('ff_'+flags),' '.join('%s=%.3f'%(k[:5],v) for k,v in m.items()), len(a))
print('REF                    sharp=8.83 color=57.55 brigh=105.74 contr=42.33 motio=1.16 jerk=1.97 shotS=6')
