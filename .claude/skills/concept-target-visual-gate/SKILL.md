---
name: concept-target-visual-gate
description: Gate visual work against a concept target with structured concept prompts, independent fresh-context reviewers, honest scoring ledgers, and screenshot-verified milestones — never lowering the target to declare success. Use when building any scene/game/render toward a visual target, when writing an autonomous-build master prompt, when a build "works" but doesn't look right, when reviewing captures vs concept, or when the user says "concept first", "compare against the target", "visual gate", "screenshot or it didn't happen", "autonomous build brief".
category: 3D
upstream: https://github.com/oh-ashen-one/blender-agent-skills
source_license: MIT
triggers:
  - contrôle visuel par référence
  - comparer au concept
  - porte visuelle
  - ressemble à la référence
  - écart avec le concept
---

# Concept-target visual gate

The rule that makes everything else honest: **the concept target is fixed; the build moves toward it; mismatches are recorded, never explained away.**

## The method

1. **Concept first, before any geometry.** Generate (or obtain) a target image and keep both the image and the exact prompt. The concept is a *persistent visual target*, not a deliverable. Label it everywhere as "generated concept, not a render of the model" — a pretty concept is not evidence the scene meets it.

2. **Write the concept prompt with a fixed structure** so it is reviewable and re-usable. Template in `references/concept_prompt_template.md` — fields: use case, asset type, primary request, input images (which image is the sole authority for composition/identity/lighting), scene/backdrop, subject, style/medium, composition/framing (exact aspect ratio and camera height), lighting/mood, color palette, verbatim text, constraints, and an explicit **Avoid:** list (distorted hands, extra fingers, fused bodies, watermark, fantasy drift…).

3. **Build a small playable/renderable version early**, capture actual in-engine screenshots, and inspect them against the concept **at comparable camera angles**. Compare in this order: silhouette → proportion → composition → color → material detail → lighting → atmosphere → small scene details. List concrete differences, fix, capture again. Do not stop at a successful compile or a first render.

4. **Use an independent fresh-context reviewer.** A separate reviewer (agent or human) that has NOT built the scene scores captures against the target on a **gated ladder: composition → light → material → detail**. A low gate blocks higher gates. The reviewer never sees your self-assessment first. Ledger example: `references/visual_review_ledger.md` — a real project plateaued at **3.0/10** across six structural revisions, and the ledger says so, in public, in the release notes.

5. **Never lower the target.** When the score stalls, record the plateau and the remaining issues (e.g. "large planar massing, texture-driven rather than physical wear, insufficient distance separation"), keep the concept unchanged, and ship the release with the limitation stated. "The concept is preserved unchanged; the release is a functional deliverable with this art limitation recorded."

6. **Screenshot-or-it-didn't-happen milestones.** Every milestone ends with real captures (with HUD if a game) written to disk, then *opened and judged*. A screenshot you have not looked at does not count as verification. Self-check flags (`-autoStart N -screenshotAt a,b,c -quitAfter N -fpslog`) make this scriptable.

7. **STATE block in the README that is always true**: what is in the build, what is verified, what is open. Update it at every commit. Push at least hourly during autonomous runs.

8. **If the work is an autonomous build, write the master prompt like `references/autonomous_build_brief.md`**: role + full autonomy, everything from the command line (batch mode only — never assume a human clicks), visual verification non-negotiable, git discipline, performance floor with vsync explicitly off, "no placeholder shame", explicit known-traps list, and a definition-of-done checklist the agent must check before stopping.

9. **Package desktop builds outside cloud-synced folders** and read `references/macos_packaging_pitfalls.md` before shipping a signed macOS app: File Provider metadata silently breaks signatures, and AppKit's window-restoration flush can hitch the main thread — with the A/B/A evidence pattern for proving it.

## LESSONS LEARNED

- **The target can survive the project.** One game shipped fully playable and tested while its visual gate sat at 3.0/10. The honest ledger preserved credibility; pretending closeness would have destroyed it.
- A reviewer that built the scene will rationalize it. Fresh context caught "duplicate older capture submitted as new evidence" and *declined to count unshown changes as failure* — the independence cuts both ways, which is exactly why it is trusted.
- Gated ladders prevent "great lighting!" from masking a broken composition. Score gates in order; a blocked gate caps the verdict.
- Imagegen concepts and engine captures drift apart silently unless you capture at *comparable angles*. "Same idea, different framing" hides 80% of the mismatch.
- In one photo-recreation project the delivered mesh scene was *less* realistic than the generated concept, and the README said exactly that: "The generated concept is more realistic than the delivered mesh scene, and that mismatch remains unresolved." That sentence cost nothing and bought permanent trust.
- Vsync silently caps FPS; runtime-generated textures and shader keyword toggles get stripped from builds; animation clips with root travel baked in make characters skate. These go in the brief's known-traps list so they are paid for once, ever.
- **Never deform geometry to match a still.** A concept seam is "only a visual suggestion" — resolve it with a functioning rig and real clearance, not by pushing meshes through each other until the pixels match.

## FAILURE CATALOG

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Review rounds keep "passing" but the scene still looks wrong | Builder reviewing own work; ungated holistic score | Independent fresh-context reviewer; gated composition→light→material→detail ladder; written ledger |
| "Looks close to concept" claim collapses on side-by-side | Captures at incomparable angles; target quietly weakened | Re-capture at the concept's framing; restore the original target; record mismatch as open |
| Milestone reported done, nothing to look at | Verification claimed without inspected captures | Rule: an unviewed screenshot is not verification; capture with HUD, open it, judge it, then commit |
| Signed macOS app fails codesign or won't launch after copying | Cloud-storage File Provider attaches xattrs (`com.apple.FinderInfo`, File Provider flags) to the bundle | Build in a worktree outside cloud-synced Documents; clear xattrs; re-sign; verify with codesign |
| Recurring long frame at a fixed time in a windowed macOS player | AppKit `NSPersistentUIManager.flushAllChanges` encoding restorable state on the main thread | Set app-local `NSDisablePersistence=true` in the bundle's Info.plist, verify exact bundle ID first, re-sign; A/B/A test; re-check on OS upgrades (undocumented key) |
| FPS "regression" that isn't | Vsync silently capping; recording overhead conflated with playback | Turn vsync off explicitly; measure normal playback separately from recording runs |
| Concept mismatch "fixed" by breaking the model | Deforming geometry to match a still image's suggestion | Treat the still as intent; solve with real mechanism/clearance; keep geometry physically consistent |

## BEST PRACTICES

- Keep concept prompts and chosen images in the repo (`concepts/`, `prompts/`) next to the captures that try to match them.
- Number review rounds in the ledger and give each a one-line cause: what changed, what score, what still blocks.
- Separate evidence types in your claims: source tests, runtime probes, visual review, performance measurement, publication, and user acceptance are different gates — never let one stand in for another.
- When you ship below the gate, ship the ledger with it. "Not passed" is a status, not a failure of process.
