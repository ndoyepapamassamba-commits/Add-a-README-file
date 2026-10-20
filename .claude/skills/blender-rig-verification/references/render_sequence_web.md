# Scroll-driven render-sequence website

How the baked Blender timeline becomes a fast scroll site — real numbers from
a 480-frame production sequence.

## Assets

- **480 frames at 24 fps** (20 s master film), rendered once in Cycles
  (1280×1000, 48 samples, denoised; ~1,165 s total on an Apple-silicon
  workstation — record per-frame timings and the render source commit).
- **Dual-resolution WebP sets** chosen by viewport: desktop 1280×1000
  (~24.9 MB total), mobile 832×650 (~12.8 MB). The manifest carries
  `template` and `mobileTemplate` with a `{frame}` placeholder; the player
  picks at init (`innerWidth < 700`).
- **anchors.json**: per-frame `world_to_camera_view` projections of component
  points (`[x, 1-y, visible]` per frame) so HTML labels track 3D parts during
  scroll. Lerp between anchor frames client-side.

## Player core (canvas, not <img> swaps)

```ts
// Decode cache: capped ImageBitmap store, farthest-from-target eviction.
let maxCache = innerWidth < 700 ? 12 : 24;      // bitmaps, not frames
function trim() {
  while (bitmaps.size > maxCache) {
    let farthest = -1, distance = -1;
    for (const i of bitmaps.keys())
      if (Math.abs(i - metrics.targetFrame) > distance) {
        farthest = i; distance = Math.abs(i - metrics.targetFrame);
      }
    bitmaps.get(farthest)?.close();             // close() or leak GPU memory
    bitmaps.delete(farthest);
  }
}
// fetch -> blob -> createImageBitmap(blob), inflight-deduped, max 3 retries,
// prefetch current+next plus one in each scroll direction (max 4 inflight).
```

- **Canvas resolution capped**: `d = Math.min(devicePixelRatio || 1, 1.5)`.
  A 1.8 DPR display at full canvas resolution measurably costs; 1.5 is
  visually indistinguishable here.
- **Adjacent-frame cross-blending**: `continuous = pose * (count-1)`;
  draw frame `i`, then frame `i+1` at `globalAlpha = continuous - i`. This
  is what makes 24 rendered poses/second feel continuous on scroll — and
  the honest report says so: "smooth browser presentation does not mean 60
  independently rendered Blender poses per second."
- **Scroll→pose mapping** with an exponential smoother
  (`displayed += (target - displayed) * (1 - exp(-dt/90))`), a snap when
  close, and a rounding guard so fractional CSS scroll can't strand the
  final pose (`raw > 1 - 1/distance ? 1 : raw`).
- **Reduced motion**: `prefers-reduced-motion` selects unblended chapter
  stills instead of the sequence.
- **?qa=1 perf panel**: logs rAF intervals, canvas `draw_ms`, long tasks
  (PerformanceObserver, guarded — Safari doesn't expose it), cache peak,
  failed frames, bytes. Metrics also land on `window.__metrics` for harness
  capture.

## Measured results (real browser, final assets, Apple-silicon laptop)

| Run | Viewport | rAF p50 | rAF p95 | rAF p99 | Max | >33.4 ms |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop | 1020×861 | 8.3 ms | 10.3 ms | 10.4 ms | 10.5 ms | 0 / 5,801 |
| Mobile layout | 374×666 | 8.3 ms | 10.3 ms | 10.4 ms | 10.5 ms | 0 / 5,802 |
| Desktop, recording | 1020×861 | 8.3 ms | 9.3 ms | 9.4 ms | 142.7 ms | 1 / 5,894 |

Report discipline: these are *browser playback measurements with the final
assets*, display ~120 Hz, canvas DPR capped at 1.5; recording overhead
measured separately from normal playback; cold-load over a public network
not claimed; `draw_ms` is CPU canvas submission, not GPU completion. All 480
frames loaded with zero failures; cache peak stayed at 24/12 bitmaps.

## Delivery checklist

- Initial poster + retry/readable fallback for frame-load failures.
- Validate every WebP header after LFS pull; validate MP4 codec/dimensions/
  frame count/duration.
- Chapter stills for reduced motion; timeline chapter markers in Blender
  double as scroll chapters.
- Record asset byte totals and motion-sampling honesty in the perf doc.
