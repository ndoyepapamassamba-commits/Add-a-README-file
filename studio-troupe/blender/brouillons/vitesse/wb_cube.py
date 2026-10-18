import bpy, time, sys
s = bpy.context.scene
s.render.engine = 'BLENDER_WORKBENCH'
s.render.resolution_x, s.render.resolution_y = 540, 960
s.render.resolution_percentage = 100
s.display.render_aa = '8'
s.display.shading.light = 'FLAT'
s.render.filepath = '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/vitesse/tests/out/wb_'
s.frame_start, s.frame_end = 1, 5
t = time.time()
for f in range(1, 6):
    s.frame_set(f)
    t0 = time.time()
    s.render.filepath = '/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/vitesse/tests/out/wb_%03d' % f
    bpy.ops.render.render(write_still=True)
    print('FRAME', f, round(time.time() - t0, 3), flush=True)
print('TOTAL', round(time.time() - t, 3))
