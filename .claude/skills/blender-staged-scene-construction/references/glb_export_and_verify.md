# GLB export hygiene + independent re-import verification

## Export (run in the authoring scene, after the final checkpoint)

```python
import bpy, json

S = bpy.context.scene
OUT = "/path/to/outputs"

# 1. Provenance travels inside the .blend itself.
S["Reference"] = "reference/photo.png"
S["Concept"] = "reference/concept.png"
S["Authoring"] = "Authored with Blender MCP. All meshes procedural, no downloaded models."
S["Limitations"] = ("Stylized approximation; no rig. "
                    "GLB lighting differs from Cycles.")

bpy.ops.file.pack_all()                       # textures travel with the .blend
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/Scene.blend")

# 2. Convert CURVE/FONT to evaluated mesh COPIES for export only;
#    the editable sources stay in the .blend.
bpy.ops.object.select_all(action="DESELECT")
deps = bpy.context.evaluated_depsgraph_get()
converted = []
for o in list(S.objects):
    if o.hide_render:
        continue
    if o.type == "MESH":
        o.select_set(True)
    elif o.type in ("CURVE", "FONT"):
        me = bpy.data.meshes.new_from_object(o.evaluated_get(deps), depsgraph=deps)
        cp = bpy.data.objects.new(o.name + " [export mesh]", me)
        S.collection.objects.link(cp)
        cp.matrix_world = o.matrix_world.copy()
        cp.select_set(True)
        converted.append(cp)

# 3. Geometry+materials only. No cameras, no lights (glTF can't carry the
#    Cycles lighting anyway — say so in Limitations).
bpy.ops.export_scene.gltf(
    filepath=OUT + "/Scene.glb", export_format="GLB",
    use_selection=True, export_apply=True,
    export_cameras=False, export_lights=False)

# 4. Delete the export copies; the .blend keeps editable curves/fonts.
for o in converted:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/Scene.blend")
```

## Verify in a SEPARATE background Blender process

Never trust the export call's exit status. Re-import the GLB where the
authoring scene is not loaded:

```sh
blender --factory-startup -b --python verify_glb.py -- /path/to/Scene.glb
```

```python
# verify_glb.py
import bpy, json, sys

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.import_scene.gltf(filepath=path)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
tri = 0
for o in meshes:
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh(); me.calc_loop_triangles()
    tri += len(me.loop_triangles); ev.to_mesh_clear()
report = {
    "glb_reimport_success": True,
    "mesh_objects": len(meshes),
    "triangles": tri,
    "materials": len(bpy.data.materials),
    "all_meshes_have_materials": all(len(o.data.materials) > 0 for o in meshes),
}
open("export-verification.json", "w").write(json.dumps(report, indent=2))
print(json.dumps(report))
```

A real passing report: 446 mesh objects, 657,568 triangles, 33 materials,
all meshes with materials, 14.4 MB GLB.
