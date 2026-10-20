# Scene bench: the measures the owner's eye caught and the old bench missed — the SAME code for every film.
#  bgLife      : motion of the background itself once the camera move is removed (optical flow, 4-dof fit) — px/s @270 px wide
#  livingArea  : share of the background that moves on its own (residual > 0.35 px/frame)
#  camMotion   : camera move (px/frame @270)
#  sharpGap    : log2(Laplacian variance of the people / of the background) — a cut-out on a blurred photo is high
#  shadow      : how much darker the ground is right under the feet than beside them (contact shadow) — 0 = none
#  popsPerMin  : sudden changes of a silhouette between two pictures of the same shot (mask overlap after the camera move < 0.7)
#  fps         : distinct pictures per second in the file (duplicates removed)
import cv2, numpy as np, os, json, sys
B = os.environ.get('FILMBENCH_DIR', '.filmbench')
FPS = 8
W, H = 270, 480
CAP0, CAP1 = int(H * 0.76), int(H * 0.93)


def frames(n):
    d = os.path.join(B, n)
    fs = sorted(x for x in os.listdir(d) if x.startswith('f_') and x.endswith('.jpg'))
    ms = os.path.join(d, 'mask_pose')
    return d, fs, ms


def analyse(n):
    d, fs, ms = frames(n)
    prev = None
    life, living, cam, pops, sharp, shadow, steps = [], [], [], 0, [], [], 0
    for i, f in enumerate(fs):
        big = cv2.imread(os.path.join(d, f))
        g = cv2.cvtColor(cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        mp = os.path.join(ms, 'm_%05d.png' % (i + 1))
        if not os.path.exists(mp):
            break  # measured over the pictures that have their person mask (the first 40 s by default)
        m = cv2.imread(mp, 0)
        m = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST) > 127
        if i % 4 == 0:
            # sharpness gap and contact shadow on the full-size picture
            gb = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY).astype(np.float32)
            mb = cv2.resize(m.astype(np.uint8), (gb.shape[1], gb.shape[0]), interpolation=cv2.INTER_NEAREST)
            fg = cv2.erode(mb, np.ones((9, 9), np.uint8)) > 0
            bg = cv2.erode(1 - mb, np.ones((25, 25), np.uint8)) > 0
            bg[int(gb.shape[0] * 0.76):int(gb.shape[0] * 0.93)] = False
            lap = cv2.Laplacian(gb, cv2.CV_32F)
            if fg.sum() > 2000 and bg.sum() > 2000:
                sharp.append(float(np.log2((lap[fg].var() + 1) / (lap[bg].var() + 1))))
            n_, lab, st, _ = cv2.connectedComponentsWithStats(mb.astype(np.uint8))
            L = gb
            for k in range(1, n_):
                x, y, w, h, a = st[k]
                if a < 0.005 * mb.size or h < 0.25 * gb.shape[0]:
                    continue
                yb = y + h
                if yb > gb.shape[0] * 0.97 or (gb.shape[0] * 0.76 < yb < gb.shape[0] * 0.95):
                    continue
                rows = slice(yb + 2, min(gb.shape[0], yb + 14))
                below = L[rows, x:x + w]
                left = L[rows, max(0, x - w):x]
                right = L[rows, x + w:min(gb.shape[1], x + 2 * w)]
                side = np.concatenate([left.ravel(), right.ravel()])
                if below.size < 50 or side.size < 50:
                    continue
                shadow.append(float((side.mean() - below.mean()) / (side.mean() + 1)))
        if prev is not None:
            g0, m0 = prev
            dmean = float(np.abs(g.astype(np.float32) - g0.astype(np.float32)).mean())
            h0 = cv2.calcHist([g0], [0], None, [32], [0, 256])
            h1 = cv2.calcHist([g], [0], None, [32], [0, 256])
            if dmean > 28 or cv2.compareHist(h0, h1, cv2.HISTCMP_CORREL) < 0.6:
                prev = (g, m)
                continue
            steps += 1
            flow = cv2.calcOpticalFlowFarneback(g0, g, None, 0.5, 3, 21, 3, 5, 1.1, 0)
            fgAny = cv2.dilate((m0 | m).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            bgm = ~fgAny
            bgm[CAP0:CAP1] = False
            ys, xs = np.mgrid[3:H:6, 3:W:6]
            sel = bgm[ys, xs]
            if sel.sum() > 150:
                p = np.stack([xs[sel], ys[sel]], 1).astype(np.float32)
                fl = flow[ys[sel], xs[sel]]
                A, _ = cv2.estimateAffinePartial2D(p, p + fl, method=cv2.RANSAC, ransacReprojThreshold=1.0)
                if A is not None:
                    pred = p @ A[:, :2].T + A[:, 2]
                    res = np.minimum(5, np.linalg.norm(p + fl - pred, axis=1))
                    life.append(float(res.mean()) * FPS)
                    living.append(float((res > 0.35).mean()))
                    cam.append(float(np.linalg.norm(fl, axis=1).mean()))
                    if m0.sum() > 0.01 * m0.size and m.sum() > 0.01 * m.size:
                        w0 = cv2.warpAffine(m0.astype(np.uint8), A, (W, H), flags=cv2.INTER_NEAREST) > 0
                        iou = (w0 & m).sum() / max(1, (w0 | m).sum())
                        if iou < 0.7:
                            pops += 1
        prev = (g, m)
    mins = max(1, steps) / FPS / 60
    med = lambda v: None if not v else round(float(np.median(v)), 4)
    return {
        'bgLife': med(life), 'livingArea': med(living), 'camMotion': med(cam),
        'sharpGap': med(sharp), 'shadow': med(shadow), 'shadowN': len(shadow),
        'popsPerMin': round(pops / max(1e-6, mins), 2), 'steps': steps,
    }


if __name__ == '__main__':
    res = {}
    for n in sys.argv[1:]:
        res[n] = analyse(n)
        print(n, res[n], flush=True)
    json.dump(res, open(os.path.join(B, 'scene.json'), 'w'), indent=1)
