import bpy, time, sys
s = bpy.context.scene
s.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
s.render.resolution_x, s.render.resolution_y = 540, 960
e = s.eevee
e.taa_render_samples = 1
e.use_shadows = False
e.use_raytracing = False
e.use_gtao = False
e.use_volumetric_shadows = False
s.render.use_motion_blur = False
s.view_settings.view_transform = 'Standard'
# emission-only material on the cube
ob = bpy.data.objects['Cube']
m = bpy.data.materials.new('E'); m.use_nodes = True
nt = m.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
nt.links.new(em.outputs[0], out.inputs[0]); ob.data.materials.clear(); ob.data.materials.append(m)
bpy.data.lights['Light'].energy = 0
print('ENGINE', s.render.engine, flush=True)
t = time.time()
for f in range(1, 4):
    s.frame_set(f)
    t0 = time.time()
    s.render.filepath = sys.argv[-1] + '%03d' % f
    bpy.ops.render.render(write_still=True)
    print('FRAME', f, round(time.time() - t0, 3), flush=True)
print('TOTAL', round(time.time() - t, 3))
