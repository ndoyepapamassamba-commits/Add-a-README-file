import bpy, time, sys
eng = sys.argv[sys.argv.index('--')+1]
s=bpy.context.scene
s.render.engine=eng
s.render.resolution_x=540; s.render.resolution_y=960
s.frame_start=1; s.frame_end=10
ob=bpy.data.objects.get('Cube')
ob.keyframe_insert('location',frame=1); ob.location.x+=2; ob.keyframe_insert('location',frame=10)
s.render.filepath=f'/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/vitesse/{eng}_'
if eng=='BLENDER_EEVEE_NEXT': s.eevee.taa_render_samples=8
t=time.time(); bpy.ops.render.render(animation=True); print('TOTAL',eng,round(time.time()-t,2))
import gpu; print('GPU', gpu.platform.renderer(), gpu.platform.version())
