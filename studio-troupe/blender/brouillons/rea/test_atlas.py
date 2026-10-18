# Test : remplacement de bouche par atlas (Mapping.location animé, interpolation CONSTANT), rendu Cycles headless.
import bpy, numpy as np, os, sys
OUT = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
img = bpy.data.images.new("atlas", 8, 1, alpha=True)
px = np.zeros((1, 8, 4), np.float32); px[..., 3] = 1
for i in range(8):
    px[0, i, :3] = (i / 7.0, 1 - i / 7.0, 0.5)          # 8 cases = 8 visèmes (A..H)
img.pixels.foreach_set(px.ravel())
bpy.ops.mesh.primitive_plane_add(size=2, rotation=(1.5708, 0, 0))
ob = bpy.context.active_object
mat = bpy.data.materials.new("bouche"); mat.use_nodes = True; nt = mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Scale"].default_value = (1 / 8, 1, 1)
tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = img; tx.interpolation = 'Closest'
em = nt.nodes.new("ShaderNodeEmission"); o = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(tc.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs[0], tx.inputs["Vector"])
nt.links.new(tx.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], o.inputs["Surface"])
ob.data.materials.append(mat)
loc = mp.inputs["Location"]
for f, case in ((1, 0), (2, 3), (3, 7)):
    loc.default_value[0] = case / 8
    loc.keyframe_insert("default_value", index=0, frame=f)
for fc in nt.animation_data.action.fcurves:
    for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam)
cam.location = (0, -6, 0); cam.rotation_euler = (1.5708, 0, 0); sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.samples = 1; sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = 16
sc.view_settings.view_transform = 'Standard'
sc.frame_start, sc.frame_end = 1, 3
sc.render.filepath = os.path.join(OUT, "atlas_####"); sc.render.image_settings.file_format = 'PNG'
bpy.ops.render.render(animation=True)
