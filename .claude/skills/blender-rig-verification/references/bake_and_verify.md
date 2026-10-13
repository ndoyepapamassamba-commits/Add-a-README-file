# Scripted → baked shape-key pipeline, and how to prove the bake

Goal: a deliverable .blend that plays the full choreography with **no
auto-run Python, no handlers, no MCP connection** — and proof it matches the
scripted source.

## Bake (run after the build/verify passes)

```python
COUNT = 480                       # frames; 24 fps -> 20 s master
apply(0)                          # source choreography at t=0
for obj in dynamic:               # meshes that deform (display, cables, hand)
    if obj.data.shape_keys: obj.shape_key_clear()
for obj in dynamic:
    obj.shape_key_add(name="Basis")

for frame_index, frame in enumerate(range(1, COUNT + 1)):
    scene.frame_set(frame)
    apply((frame - 1) / (COUNT - 1))
    for obj in moving:            # transforms: links, halves, camera, control
        obj.keyframe_insert("location", frame=frame)
        obj.keyframe_insert("rotation_euler", frame=frame)
    scene.camera.data.keyframe_insert("lens", frame=frame)
    control.keyframe_insert(data_path='["fold_degrees"]', frame=frame)
    for obj in dynamic:
        key = obj.shape_key_add(name=f"Frame {frame:03}", from_mix=False)
        for v, co in zip(key.data, obj.data.vertices):
            v.co = co.co
        # 0 -> 1 -> 0 envelope: each shape key owns exactly one frame.
        key.value = 0; key.keyframe_insert("value", frame=frames[frame_index-1] if frame_index else 0)
        key.value = 1; key.keyframe_insert("value", frame=frame)
        key.value = 0; key.keyframe_insert("value", frame=frames[frame_index+1] if frame_index < len(frames)-1 else COUNT+1)

# LINEAR everywhere (CONSTANT for hide_render): the sampled choreography
# already contains its easing. Blender 5: actions have layers -> strips ->
# channelbags -> fcurves.
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for p in fc.keyframe_points:
                        p.interpolation = "LINEAR" if fc.data_path != "hide_render" else "CONSTANT"

# Restore Basis vertex positions, add named chapter markers, record method.
scene["animation_method"] = "Baked transforms and relative shape keys; source choreography in blender/sequence.py"
bpy.ops.wm.save_as_mainfile(filepath="scenes/device-animated.blend", compress=True)
```

## Verify the bake against the source (16 sampled frames, < 0.02 mm)

```python
FRAMES = [1, 37, 73, 121, 165, 173, 207, 245, 293, 317, 349, 351, 397, 433, 477, 480]

# 1. Snapshot EXPECTED state from the scripted choreography.
expected = {}
for frame in FRAMES:
    apply((frame - 1) / 479)
    expected[frame] = snapshot()      # matrices + sampled evaluated verts + lens

# 2. Reopen the BAKED file and CLEAR ALL HANDLERS — otherwise a lingering
#    frame_change handler re-applies the script and the bake verifies itself
#    vacuously.
bpy.ops.wm.open_mainfile(filepath="scenes/device-animated.blend")
bpy.app.handlers.frame_change_pre.clear()
bpy.app.handlers.frame_change_post.clear()

# 3. Compare at each frame: identical visible object sets, lens to 1e-4,
#    matrices to 1e-6, world-vertex error below tolerance.
for frame in FRAMES:
    bpy.context.scene.frame_set(frame)
    actual = snapshot()
    assert actual.keys() == expected[frame].keys()
    # per-object vertex comparison, error in mm ...
    assert max_error < 0.02           # observed: matched within 0.000008 mm
```

The snapshot compares matrices for every MESH/EMPTY/CAMERA and ~24 sampled
world-space vertices per mesh (`step = max(1, len(verts)//24)`), so a rig
that "mostly" matches cannot slip through.

## Independent re-render SSIM

Render one baked pose in a fresh process and SSIM it against the
corresponding scripted render. Observed **0.999209** — the residual is
independent Cycles sampling noise, which is exactly what "identical scene,
different seed" looks like. Do not demand 1.0.

```text
# ffmpeg-style SSIM output from the real comparison:
n:1 R:0.999243 G:0.999248 B:0.999136 All:0.999209
```
