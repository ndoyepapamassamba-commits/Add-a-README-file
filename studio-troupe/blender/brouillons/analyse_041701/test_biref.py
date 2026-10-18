import numpy as np, cv2, time, onnxruntime as ort, sys
W='/home/user/Add-a-README-file/studio-troupe/.private/references/041701/travail'
F=np.load(W+'/frames_full.npy',mmap_mode='r')
so=ort.SessionOptions(); so.intra_op_num_threads=4; so.enable_cpu_mem_arena=False
s=ort.InferenceSession('/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/modeles/vision/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx',so,providers=['CPUExecutionProvider'])
M=np.array([0.485,0.456,0.406],np.float32); S=np.array([0.229,0.224,0.225],np.float32)
tiles=[]
for i in [int(a) for a in sys.argv[1:]]:
    band=np.ascontiguousarray(F[i,531:1390])
    t=time.time()
    x=(cv2.resize(band,(1024,1024),interpolation=cv2.INTER_LINEAR).astype(np.float32)/255-M)/S
    o=s.run(None,{s.get_inputs()[0].name:x.transpose(2,0,1)[None]})[-1]
    o=1/(1+np.exp(-o.reshape(o.shape[-2:])))
    a=cv2.resize(o,(1080,859))
    print(i,'%.1fs'%(time.time()-t),'cover %.3f'%(a>0.5).mean())
    vis=(band*0.3+np.dstack([a*255]*3)*0.7).astype(np.uint8)
    tiles.append(cv2.resize(vis,(540,430)))
cv2.imwrite(W+'/v_biref.jpg',cv2.cvtColor(np.hstack(tiles),cv2.COLOR_RGB2BGR))
