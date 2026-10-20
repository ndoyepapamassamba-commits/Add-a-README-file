# Autonomous-build master prompt — the pattern

Distilled from a brief that produced a complete, tested, published game from
an empty folder. Section order matters: identity → non-negotiables → product
spec → feel → process → definition of done. Adapt the product sections;
keep sections 0 and 5 nearly verbatim.

## 0. Non-negotiables (copy these)

1. **Autonomous.** No clarifying questions. If something is ambiguous, pick
   the option that looks best on camera and note it in the README.
2. **Everything runs from the command line.** The engine is driven in batch
   mode (`-batchmode -nographics -executeMethod ...` for setup/builds,
   `-runTests` for tests, a windowed player with flags for self-checks).
   Never assume a human will click in an editor.
3. **Verify visually.** Every milestone ends with the built player
   auto-playing N seconds via a self-check flag and writing real screenshots
   (with HUD) to disk; then you OPEN those screenshots and judge them.
   A screenshot you have not looked at does not count as verification.
4. **Git discipline.** Commit after every working milestone. Push at least
   every hour. The README has a `STATE` block at the top that is always true:
   what is in the build, what is verified, what is open.
5. **Performance floor.** 60 FPS minimum at 1920×1080 on the target machine
   with all effects on. Turn vsync off explicitly (it silently caps you).
   FPS counter in the HUD; log FPS to file in self-check runs.
6. **No placeholder shame.** Grey boxes are fine at hour 1 and unacceptable
   at the end. Every visible thing gets a real material, real lighting, and
   a shadow.

## Process skeleton that worked

1. **Hour 0:** engine project from the CLI, `tools/` with `setup.sh`,
   `test.sh`, `build.sh`, `play.sh`, and a grey-box world with a screenshot
   flag BEFORE anything pretty.
2. **Self-check harness in the player:** flags like
   `-autoStart N -autoFly N -autoKill N -autoRestart N -screenshotAt a,b,c
   -quitAfter N -fpslog`. `-autoKill` must trigger the REAL end path so you
   can screenshot the finale. Add per-feature perf toggles
   (`-noShadows -noPost -noSsao ...`) so you can bisect frame cost.
3. **Milestones, each committed and screenshot-verified:** blockout+movement →
   combat → beauty pass → feel pass → title/intro/ending/restart → audio →
   balance/bugs → **critic pass: open five screenshots from different
   moments, write down what looks bad, fix it.**
4. **Tests:** ≥20 EditMode/PlayMode tests over the core math and state
   machines. Keep it green.
5. **Known traps (paid for already — put them in your brief):**
   - vsync silently capping FPS;
   - runtime-generated textures and shader keyword toggles stripped from
     builds — ship real texture assets and material variants;
   - runtime static batching creating giant grey planes;
   - animation clips with root travel baked into the hips — strip it or the
     character skates/jitters; verify by logging hips local position per
     frame (lateral range < 0.5 m);
   - FBX importer not exposing new animation takes until the importer's clip
     list includes them;
   - `VideoPlayer.frame` being -1 before the first frame;
   - a stale editor process holding the project lock after an interrupted
     batch run.
6. **Final deliverable:** signed/quarantine-stripped build, README with
   accurate STATE block, `shots/` with 8+ verified screenshots covering the
   whole loop, clean git history.

## Definition of done (check every box before stopping)

- [ ] Full loop in ONE built-player run driven by flags, with inspectable
      screenshots: title → start → gameplay → finale → restart that actually
      works in the built player.
- [ ] 60+ FPS at 1080p with everything on, FPS shown in HUD.
- [ ] Controls never fight the player (no camera fighting the mouse, etc.).
- [ ] The world reads as a lived-in place, not a grid of boxes.
- [ ] Audio states + one-shots + procedural beds.
- [ ] Tests green, README STATE accurate, pushed.

Close the brief with: "Do not stop at 'works'."
