import bpy, os
rna = bpy.ops.image.import_as_mesh_planes.get_rna_type()
for p in rna.properties:
    if p.identifier in ("shader", "emit_strength", "use_transparency", "blend_method", "size_mode", "height", "interpolation", "align_axis", "offset", "use_auto_refresh", "render_method", "use_backface_culling", "shadow_method"):
        items = [i.identifier for i in p.enum_items] if p.type == 'ENUM' else ''
        print("PROP", p.identifier, p.type, items)
d = "/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad/rea-blender/pieces"
r = bpy.ops.image.import_as_mesh_planes(files=[{"name": "piece_tronc.png"}], directory=d, shader='EMISSION')
print("RES", r, [o.name for o in bpy.context.scene.objects], [len(o.data.vertices) for o in bpy.context.scene.objects if o.type == 'MESH'])
