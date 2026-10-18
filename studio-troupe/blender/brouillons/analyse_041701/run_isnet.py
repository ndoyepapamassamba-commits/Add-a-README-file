import numpy as np, cv2, time, onnxruntime as ort
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
so=ort.SessionOptions(); so.intra_op_num_threads=3
isnet=ort.InferenceSession('/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/modeles/vision/isnet-anime.onnx',so,providers=['CPUExecutionProvider'])
N=301
out=np.zeros((N,859,1080),np.uint8)
t=time.time()
for i in range(N):
    rgb=np.ascontiguousarray(F[i,531:1390])
    hh,ww=rgb.shape[:2]; c=max(hh,ww); ox,oy=(c-ww)//2,(c-hh)//2
    sq=np.full((c,c,3),180,np.uint8); sq[oy:oy+hh,ox:ox+ww]=rgb
    x=cv2.resize(sq,(1024,1024),interpolation=cv2.INTER_LINEAR).astype(np.float32)/255-np.array([0.485,0.456,0.406],np.float32)
    o=isnet.run(None,{isnet.get_inputs()[0].name:x.transpose(2,0,1)[None]})[0]
    o=o.reshape(o.shape[-2:]); o=(o-o.min())/max(1e-6,o.max()-o.min())
    out[i]=(cv2.resize(o,(c,c))[oy:oy+hh,ox:ox+ww]*255).astype(np.uint8)
    if i%50==0: print(i,time.time()-t,flush=True)
np.save(W+'/masques_isnet.npy',out)
print('fini',time.time()-t)
