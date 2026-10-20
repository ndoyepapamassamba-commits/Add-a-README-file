# macOS packaging pitfalls (signed game/app bundles)

Two traps cost real days on a shipped Unity build. Both generalize to any
signed macOS bundle produced by an automated pipeline.

## Trap 1 — File Provider metadata corrupts signed bundles

Symptom: `codesign` fails on a freshly built .app, or signatures break
*after* the build succeeds; startup then times out.

Root cause: the build output lived inside a cloud-synced Documents folder.
macOS File Provider attached `com.apple.FinderInfo` and File Provider
xattrs to the bundle, mutating it after signing. Clearing xattrs and
re-signing worked — then the metadata REAPPEARED.

Fix: **keep build outputs in a dedicated worktree outside any cloud-synced
location** (i.e. not under iCloud Documents/Desktop). Clear xattrs, verify
the bundle ID, sign, verify with codesign — all inside the worktree. Treat
"the folder syncs to the cloud" as a build-breaking property of a path.

## Trap 2 — AppKit window-restoration flush hitches the main thread

Symptom: a recurring long frame at a nearly fixed time on the self-check
clock (~12.5 s into runs). Engine-side stages all measured short; an uncapped
run still showed a ~58 ms between-iteration gap. A graphics-state trace
returned an EMPTY 278-byte collection — *unavailable evidence, not proof of
zero shader compilation* (do not treat a broken probe as a negative result).

Root cause: a native sample caught AppKit's `NSPersistentUIFlushScheduler`
calling `NSPersistentUIManager.flushAllChanges`, synchronously encoding
restorable window state and querying WindowServer on the main thread.

Fix (A/B/A-verified): copy the app, set `NSDisablePersistence=true` in its
own `Contents/Info.plist`, re-sign the copy, rerun. The diagnostic's maximum
frame time dropped to 11.65 ms; reverting brought the hitch back
(~25 ms total, ~23 ms between loops). That copy-modify-recheck A/B/A shape
is what makes the claim credible.

Discipline around the fix:

- **Verify the exact bundle identifier before touching the plist**; refuse to
  configure any other app. Never write machine-wide or user preferences;
  per-bundle only.
- `NSDisablePersistence` is an **undocumented** key. Record that plainly, keep
  the A/B evidence in the repo, and recheck on OS upgrades and before adding
  multiple native windows. (Historical note: Mozilla implemented then removed
  it after multi-window/fullscreen side effects.)
- Implement your own in-app reset (e.g. R to restart) so disabled restoration
  loses nothing.
- Exclude diagnostic runs from sustained acceptance metrics; run the
  acceptance pass as a separate clean package (all effects on, real
  keyboard/mouse play) before claiming the budget is met.
