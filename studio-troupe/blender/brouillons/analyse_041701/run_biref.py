import numpy as np, cv2, time, onnxruntime as ort
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
so=ort.SessionOptions(); so.intra_op_num_threads=3; so.enable_cpu_mem_arena=False
s=ort.InferenceSession('/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/modeles/vision/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx',so,providers=['CPUExecutionProvider'])
M=np.array([0.485,0.456,0.406],np.float32); S=np.array([0.229,0.224,0.225],np.float32)
idx=list(range(0,301,6))
out=np.zeros((len(idx),859,1080),np.uint8)
t0=time.time()
for k,i in enumerate(idx):
    band=np.ascontiguousarray(F[i,531:1390])
    x=(cv2.resize(band,(1024,1024),interpolation=cv2.INTER_LINEAR).astype(np.float32)/255-M)/S
    o=s.run(None,{s.get_inputs()[0].name:x.transpose(2,0,1)[None]})[-1]
    o=1/(1+np.exp(-o.reshape(o.shape[-2:])))
    out[k]=(cv2.resize(o,(1080,859))*255).astype(np.uint8)
    print(k,i,round(time.time()-t0,1),flush=True)
    if k%10==9: np.savez_compressed(W+'/masques_biref.npz',idx=np.array(idx[:k+1]),m=out[:k+1])
np.savez_compressed(W+'/masques_biref.npz',idx=np.array(idx),m=out)
print('fini',time.time()-t0)
