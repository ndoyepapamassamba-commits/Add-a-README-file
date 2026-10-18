# planche de contrôle : une image du film au milieu de chaque réplique (qui parle, texte) → JPEG à regarder
import json, sys, subprocess, numpy as np, cv2
mp4, tl, sortie = sys.argv[1:4]; T = json.load(open(tl)); W, H = 288, 512; cols = 6
imgs = []
for L in T['lines']:
    t = L['t0'] + 0.55 * L['dur']
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', mp4, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    im = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
    cv2.rectangle(im, (0, 0), (W, 34), (0, 0, 0), -1)
    cv2.putText(im, f"{t:5.1f}s {L['qui'][:14]}", (6, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(im, L['texte'][:40], (6, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (180, 255, 180), 1, cv2.LINE_AA)
    imgs.append(im)
while len(imgs) % cols: imgs.append(np.zeros((H, W, 3), np.uint8))
rows = [np.hstack(imgs[k:k + cols]) for k in range(0, len(imgs), cols)]
cv2.imwrite(sortie, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85]); print(sortie, len(T['lines']), 'répliques')
