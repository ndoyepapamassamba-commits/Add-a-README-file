import bpy, time, json
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
bpy.data.objects["Plane"].hide_render = True
R = {}
for aa in ('OFF', '5', '8', '16'):
    sc.display.render_aa = aa
    sc.frame_start, sc.frame_end = 1, 6
    sc.render.filepath = f"/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/rea-blender/out2/wb_aa{aa}_####"
    t0 = time.perf_counter(); bpy.ops.render.render(animation=True); R[aa] = round((time.perf_counter() - t0) / 6, 3)
print("WB", json.dumps(R))
