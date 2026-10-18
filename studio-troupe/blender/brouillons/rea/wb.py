import bpy, time
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
sc.render.filepath = "/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/rea-blender/out2/wb.png"
t0 = time.perf_counter(); bpy.ops.render.render(write_still=True); print("WB_S", time.perf_counter() - t0)
