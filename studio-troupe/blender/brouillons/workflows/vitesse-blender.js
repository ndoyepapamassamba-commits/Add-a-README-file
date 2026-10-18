export const meta = {
  name: 'vitesse-blender',
  description: 'Find, measure and build the fastest Blender render route on this 4-core CPU-only machine for painted 2.5D cut-outs, with quality checks',
  phases: [
    { title: 'Explorer', detail: 'REA speed research + shared bench scene + GL (Workbench/EEVEE) and Cycles benches' },
    { title: 'Arbitrer et construire', detail: 'back-to-back re-measure of top routes, build rapide.py launcher + VITESSE.md' },
    { title: 'Vérifier', detail: 'timing reproduction + quality skeptic, then one fix round' },
  ],
}
const ROOT = '/home/user/Add-a-README-file'
const SCR = '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad'
const BL = SCR + '/blender/blender-4.5.14-linux-x64/blender'
const PY = SCR + '/venv/bin/python'
const PIPE = ROOT + '/studio-troupe/blender'
const V = PIPE + '/vitesse'
const NOTES = ROOT + "/research_notes/Moteur d'animation fluide"
const CTX = `CONTEXT (read carefully)
- Owner (French TikTok creator, Pixar-like West-African cartoon comedy) asked: "Trouve solution à la rapidité de génération via BLENDER". Goal: make Blender rendering FAST on this machine while keeping his painted look. Notes/docs in French.
- Machine: 4 CPU cores, NO GPU, 15 GB RAM, ~8.5 GB free disk (keep ≥ 3 GB free: delete frame PNGs after measuring). Blender 4.5.14 LTS at ${BL}. Python venv ${PY} (numpy, pillow, torch CPU…; install with: uv pip install --python ${PY} <pkg>). ffmpeg 6.1. Mesa 25.2.8 (llvmpipe) is installed system-wide, Xvfb + xvfb-run exist, libvulkan exists but NO Vulkan ICD (no lavapipe) is installed; apt-get exists (network via proxy).
- ANOTHER WORKFLOW RUNS CONCURRENTLY on the same CPU: it builds the reconstitution of the owner's clip 041701 in ${PIPE}/ (scene.py, personnage.py, mouvement.py, rendu.py, montage.py, outils/, README.md). NEVER edit those files and NEVER kill processes you did not start (no pkill blender / pkill Xvfb). Your code goes ONLY in ${V}/ , ${PIPE}/rapide.py and ${PIPE}/VITESSE.md. Do NOT git commit or push (the coordinator commits).
- Because the CPU is shared, every timing must report: wall-clock, CPU time (user+sys of the child processes, e.g. resource.getrusage(RUSAGE_CHILDREN) or /usr/bin/time -v), /proc/loadavg at start, and steady-state s/frame (exclude process startup and first-frame shader compilation, but report those separately). Compare routes by CPU-s/frame AND by wall-clock measured back-to-back.
- Already measured by the coordinator: Cycles CPU, default scene, 540x960, 32 spp + OIDN ≈ 6 s/frame (3 threads). EEVEE Next with -b and no display: EGL_BAD_MATCH errors, 43 s for one frame. Under "xvfb-run -a -s '-screen 0 1280x1024x24' blender -b …": Workbench, 10 frames of the default cube at 540x960 = 6.1 s TOTAL including startup; EEVEE Next 10 frames = 102 s. (These were under load from the other workflow.)
- CONTENT to render fast: 2.5D painted cut-outs: a static camera; a static painted background plate; 2 characters = painted images (≈1000x2000 px RGBA textures) on meshes built from the alpha (a few thousand vertices) deformed by armatures (~20 bones); contact shadows as soft alpha planes; desirable motion blur (our 2D engine averages 4 sub-frames, shutter 0.5 = "flou exact"). Output: the scene band ≈1080x864 (exact size measured later by the other workflow) and full 1080x1920 frames, 30 fps; the reference clip is 12.3 s = 369 frames. The painted look must be preserved EXACTLY: texel colours unchanged (view transform "Standard", look None, exposure 0, gamma 1 — not AgX/Filmic), clean antialiased alpha edges without dark/white halos (premultiplied vs straight alpha!), no flicker, no texture over-blur.
- Private realistic test assets (NEVER commit, never upload): character textures under ${ROOT}/studio-troupe/sorties/cache/personnages/*/ and ${ROOT}/studio-troupe/.private/personnages/*/ ; set paintings under ${ROOT}/studio-troupe/.private/kit/decors/*/ (src.jpg / plate.jpg). Bench outputs → ${SCR}/vitesse/ .
- Licences: everything free; GPL tools fine for making videos; libraries/models MIT/BSD/Apache.`

const ROUTES = {
  type: 'object',
  properties: {
    routes: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, engine: { type: 'string' }, settings: { type: 'string' },
      works: { type: 'boolean' },
      width: { type: 'number' }, height: { type: 'number' },
      startup_s: { type: 'number' }, wall_s_per_frame: { type: 'number' }, cpu_s_per_frame: { type: 'number' },
      loadavg: { type: 'string' },
      quality: { type: 'string', description: 'PSNR/SSIM vs reference, colour max error on texels, alpha edge, flicker, plus what you SAW on crops' },
      limits: { type: 'string' },
    }, required: ['name', 'engine', 'works', 'settings', 'quality'] } },
    best: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['routes', 'best', 'notes'],
}

phase('Explorer')
const [rea, benches] = await parallel([
  () => agent(`${CTX}

YOUR TASK (REA vitesse — research on the internet + read code): find every way to make Blender 4.5 render this content fast on a CPU-only headless Linux box, and read the relevant code (shallow/sparse clones into ${SCR}/sources/vitesse/, e.g. Blender source: source/blender/draw/engines/workbench/ for how Workbench samples image textures, handles alpha (clip / blended / dithered), colour management and anti-aliasing (render_aa samples); intern/cycles for the cheapest settings). Cover: (1) Workbench as a final renderer for flat painted textures (Flat lighting + Texture colour, transparency and sorting, AA sample counts, outline/shadow off, what it CANNOT do); (2) EEVEE Next on Mesa llvmpipe (LP_NUM_THREADS, GALLIUM_DRIVER, shader compilation cost, shader cache persistence across runs, taa samples, disabling shadows/raytracing) and Vulkan backend with lavapipe (--gpu-backend vulkan in 4.5: state, stability); EGL surfaceless headless without Xvfb (env vars, why EGL_BAD_MATCH happened); (3) Cycles cheapest settings for emission-only flat shading (light paths, transparent bounces, samples, adaptive sampling, filter, OIDN cost on CPU, persistent data, Embree, threads, tiles, BVH options, texture cache/mipmaps); (4) parallelism: one persistent Blender process per frame range (no per-frame startup), N processes × threads, frame splitting add-ons/tools (Flamenco GPL, Loom, Render Burst, CrowdRender — licences, what to learn), in-process bpy batch rendering; (5) architecture tricks: static camera → render background once and only re-render moving layers (film_transparent + crop/border to the characters' bbox), composite in numpy/ffmpeg; sub-frame motion blur by averaging; render at band size only; (6) alternative: Blender only as deformer (export deformed vertices per frame via foreach_get) + an external fast rasterizer (our PixiJS renderer at ~0.2 s/frame, or moderngl MIT/EGL) — cost/benefit. Give numbers you find (benchmarks, issue threads). Write ${NOTES}/22_vitesse_blender.md (French) with a ranked recommendation list and exact settings. Return the key findings with exact settings (concise).`, { label: 'rea:vitesse', phase: 'Explorer' }),
  async () => {
    const setup = await agent(`${CTX}

YOUR TASK (shared bench scene, used by the other bench agents): write in ${V}/ :
(a) scene_banc.py — run as "blender -b --factory-startup --python scene_banc.py -- --moteur {workbench|eevee|cycles} --largeur W --hauteur H --images N [--fichier out.blend]": builds a deterministic representative scene: orthographic camera framing the frame exactly; background = a private set painting on a plane filling the frame (fallback: procedural texture); 2 characters = private character textures (fallback procedural) on meshes built from the alpha (grid cells inside the alpha bbox, keep cells with alpha, ~3-5k verts) with an armature of ~20 bones (spine/neck/head/arms/forearms/hands/legs) and simple automatic or distance-based vertex weights, animated procedurally and deterministically (arm swings, sway, head nods) over N frames; a soft contact-shadow alpha plane under each character. Materials: image texture (straight alpha) → for Cycles/EEVEE an Emission shader mixed with Transparent by alpha; for Workbench: lighting FLAT, color_type TEXTURE. Colour management: view_transform Standard, look None. Expose a function construire(moteur, largeur, hauteur, images) so other scripts can import it, and a function regler(moteur, profil) placeholder.
(b) mesurer.py — a plain-Python harness (run with ${PY}) that launches a Blender render command (optionally under xvfb-run -a) for a frame range, measures wall, CPU (children rusage), loadavg, startup time (time to first frame file) and steady-state s/frame (from frame file mtimes), and computes quality of frames vs reference frames: PSNR, SSIM (own numpy implementation or scikit-image if installed), max/mean abs error on interior texels, an alpha-edge halo metric, and a temporal flicker metric (frame-to-frame diff on static background regions). Write results as JSON lines to ${SCR}/vitesse/resultats.jsonl.
(c) reference: render reference frames 1, 15, 30, 45, 60 of the 1080x864 scene with Cycles at 512 spp, no denoise, filter Box 1 px? (choose the filter that matches the analytic sampling and justify), into ${SCR}/vitesse/reference/ ; and ALSO an analytic numpy reference for frame 1 (rest pose: plate resampled + characters alpha-composited at their exact pixel positions) to validate colour exactness of the reference itself.
Run a smoke test: 3 frames with Workbench under xvfb-run and 3 frames with Cycles 16 spp; LOOK at one frame of each (Read the PNG). Return: exact commands, file paths, the frame size, how to pass engine settings, and smoke-test timings.`, { label: 'banc:scene', phase: 'Explorer' })
    const [gl, cy] = await parallel([
      () => agent(`${CTX}

BENCH SCENE (from the setup agent):
${setup}

YOUR TASK (bench the GL engines under software rendering): using ${V}/scene_banc.py and ${V}/mesurer.py (extend them if needed; keep your bench scripts in ${V}/banc_gl.py), measure on 60-frame animations at 1080x864 (and one run at 1080x1920): (1) Workbench under xvfb-run: render_aa in {FXAA, 5, 8, 16}, texture interpolation Linear/Cubic/Closest, Mesa env knobs (LP_NUM_THREADS 1/2/4, GALLIUM_DRIVER=llvmpipe), ONE persistent process rendering the whole range (bpy.ops.render.render(animation=True) and a Python loop frame_set+render write_still) vs per-frame processes, and 2 or 4 parallel processes each rendering a contiguous sub-range; (2) EEVEE Next under xvfb-run: taa_render_samples {1, 4, 16}, shadows/raytracing off, steady-state vs first frame (shader compile), shader-cache reuse across runs; (3) try headless WITHOUT Xvfb (EGL surfaceless: EGL_PLATFORM=surfaceless, MESA_* env, --gpu-backend opengl) and, if apt-get install -y mesa-vulkan-drivers works quickly, --gpu-backend vulkan with lavapipe (note stability); (4) sub-frame motion blur: render 4 sub-frames per frame (frame_set(f, subframe=s), shutter 0.5) and average in numpy: cost and look. For every route compute quality vs the reference frames (mesurer.py) and LOOK at crops of character edges and a hand at 2x zoom (save side-by-side crops in ${SCR}/vitesse/crops/ and Read them): colour exactness (Standard transform), halos, texture blur, alpha sorting artefacts between overlapping alpha planes (shadow under character, two characters overlapping), flicker. Return structured results.`, { label: 'banc:gl', phase: 'Explorer', schema: ROUTES }),
      () => agent(`${CTX}

BENCH SCENE (from the setup agent):
${setup}

YOUR TASK (bench Cycles CPU at its cheapest for flat emission content): using ${V}/scene_banc.py and ${V}/mesurer.py (your scripts in ${V}/banc_cycles.py), measure on 60-frame animations at 1080x864 (one run at 1080x1920): max_bounces 0 (diffuse/glossy/transmission/volume 0) with transparent_max_bounces 8, samples {1, 2, 4, 8, 16} with and without adaptive sampling, pixel filter (Blackman-Harris 1.5 vs Gaussian vs Box), denoise off vs OIDN (prefilter FAST/ACCURATE), persistent data on/off, threads 4 vs 2 procs × 2 threads vs 4 procs × 1 thread, tile size, use_auto_tile, BVH (static, spatial splits off), caustics off, light tree off, texture limit; motion blur: Cycles native (motion_blur_shutter 0.5) vs sub-frame averaging; architecture trick: render the static background ONCE and only the characters + shadows per frame with film_transparent and a render border cropped to their animated bbox, then composite in numpy over the cached background (measure the total, and check the composite is pixel-identical to a full render within noise). Compute quality vs the reference frames with mesurer.py and LOOK at crops of edges/hands (save side-by-sides in ${SCR}/vitesse/crops/, Read them). Return structured results.`, { label: 'banc:cycles', phase: 'Explorer', schema: ROUTES }),
    ])
    return { setup, gl, cy }
  },
])

phase('Arbitrer et construire')
const SUM = JSON.stringify({ gl: benches && benches.gl, cy: benches && benches.cy })
const build = await agent(`${CTX}

RESEARCH (REA vitesse):
${rea}

BENCH SCENE:
${benches && benches.setup}

BENCH RESULTS (GL and Cycles):
${SUM}

YOUR TASK (arbitrate and build):
1. Re-run the top 3 candidate routes BACK-TO-BACK under identical conditions (same moment, same load, 1080x864, 60 frames, best parallelism for each) to get a fair ranking; include quality metrics. Pick: route "apercu" (fastest acceptable preview), route "final" (fastest route whose quality is indistinguishable from the Cycles reference on the painted content: colours exact, clean edges, no flicker, motion blur), and route "eclaire" (if lit/shadowed 3D look is ever needed).
2. Implement ${PIPE}/rapide.py (our own code, French comments, standard library + numpy/pillow only; runs with ${PY}):
   - a module importable INSIDE Blender (no numpy dependency there unless bundled numpy: Blender ships numpy) with regler(scene, profil) applying the chosen settings for 'apercu' | 'final' | 'eclaire' (engine, AA/samples, colour management Standard, film, texture interpolation, threads);
   - a CLI launcher: python rapide.py --scene <bpy script that builds/loads the scene, or a .blend> [--args ...] --images 1-369 --profil final --procs auto --sortie DIR [--flou 4] [--fond-fixe] [--montage out.mp4 --fps 30 --audio file]: starts N persistent Blender processes (under xvfb-run -a for GL routes), each rendering an interleaved or contiguous frame sub-range in ONE process (no per-frame startup), progress + ETA, resume (skips frames already on disk and valid), optional sub-frame motion blur (renders S sub-frames and averages in linear light), optional static-background caching (renders the background once, the moving layers with transparent film, composites premultiplied-correct), then optional ffmpeg assembly (H.264 High, yuv420p, CRF 18, faststart);
   - automatic choice of N processes and threads from os.cpu_count() and the measured scaling.
3. Tests: ${V}/test_rapide.py (plain asserts or pytest) on a 20-frame bench scene: all frames present and in order, resume works, two renders of the same frame are identical (determinism), composite == full render within tolerance, settings applied.
4. Write ${PIPE}/VITESSE.md (French, simple words for the owner): the measured table (s/frame, CPU-s/frame, quality), the recommended routes, exact commands, the projected time for the 369 frames of 041701 at the band size and at 1080x1920, what each route cannot do and the workaround (e.g. baked/alpha-plane shadows for Workbench), and the next speed-ups to try.
Return: winner routes with s/frame and projected times, commands, test results.`, { label: 'arbitre+rapide', phase: 'Arbitrer et construire' })

phase('Vérifier')
const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'true if any important claim does not hold' },
    issues: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['bloquant', 'important', 'mineur'] },
      claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
    }, required: ['severity', 'claim', 'evidence'] } },
    measurements: { type: 'string' },
  },
  required: ['refuted', 'issues', 'measurements'],
}
const LENSES = [
  { key: 'temps', prompt: `LENS = TIMING & ROBUSTNESS. Independently follow ${PIPE}/VITESSE.md EXACTLY as written (copy-paste its commands) on the bench scene: do the commands work? Reproduce the claimed s/frame (accept ±25 %, account for loadavg). Check the multi-process launcher: all frames present once, correct order, resume after killing YOUR OWN run midway (kill only the PIDs you started), determinism (same frame twice → identical bytes or ≤ 1/255), behaviour when Xvfb display numbers collide with other runs, error reporting when Blender fails, disk usage. Run ${V}/test_rapide.py.` },
  { key: 'qualite', prompt: `LENS = IMAGE QUALITY SKEPTIC. Try to prove the fast "final" route LOSES quality versus the Cycles reference and versus the painted textures: colour exactness (look for double sRGB/gamma, AgX leaking in, 8-bit banding), alpha edges (dark or white fringes from straight/premultiplied mix-ups, aliasing, over-blur), texture filtering (mipmap blur at small scale, nearest-neighbour shimmer), sorting of overlapping transparent planes (shadow plane vs character, character vs character, z-fighting), temporal flicker on static regions, motion-blur correctness (averaging in linear vs sRGB), and the background-caching composite (seams, premultiplication). Render your own test frames with rapide.py, compute metrics, make side-by-side crops at 2-4x in ${SCR}/vitesse/verif/ and LOOK at them (Read).` },
]
const verdicts = await parallel(LENSES.map(l => () => agent(`${CTX}

BUILD REPORT:
${build}

${l.prompt}
Default to refuted=true for any claim you could not confirm. Return the verdict.`, { label: 'verif:' + l.key, phase: 'Vérifier', schema: VERDICT })))
const issues = verdicts.filter(Boolean).flatMap(v => v.issues.filter(i => i.severity !== 'mineur'))
let fix = 'aucune correction nécessaire'
if (issues.length) {
  log(`${issues.length} problème(s) bloquant(s)/important(s) → correction`)
  fix = await agent(`${CTX}

BUILD REPORT:
${build}

VERIFIER ISSUES (bloquant/important):
${JSON.stringify(issues, null, 1)}

YOUR TASK: fix every issue in ${PIPE}/rapide.py / ${V}/ (root cause, not symptoms), re-run ${V}/test_rapide.py and the specific checks that failed (re-measure timings and quality where relevant, LOOK at the crops again), update ${PIPE}/VITESSE.md so every number and command is true. Return what changed and the final measured numbers.`, { label: 'correction', phase: 'Vérifier' })
}
return { rea, setup: benches && benches.setup, gl: benches && benches.gl, cy: benches && benches.cy, build, verdicts, fix }
