import bpy
s=bpy.context.scene
print("ENGINES", [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items])
print("VIEWS", [e.identifier for e in s.view_settings.bl_rna.properties['view_transform'].enum_items])
print("DISPLAY", [e.identifier for e in s.display_settings.bl_rna.properties['display_device'].enum_items])
print("AA", [e.identifier for e in s.display.bl_rna.properties['render_aa'].enum_items])
m=bpy.data.materials.new('x')
print("MAT", [p.identifier for p in m.bl_rna.properties if 'blend' in p.identifier or 'render_method' in p.identifier or 'thick' in p.identifier or 'shadow' in p.identifier])
print("CYC", [p.identifier for p in s.cycles.bl_rna.properties if 'filter' in p.identifier or 'seed' in p.identifier or 'denois' in p.identifier or 'adaptive' in p.identifier])
a=bpy.data.actions.new('a'); print('has fcurves', hasattr(a,'fcurves'))
print("EEVEE", [p.identifier for p in s.eevee.bl_rna.properties][:80])
