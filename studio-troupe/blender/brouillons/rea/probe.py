import bpy, addon_utils, sys
print("VERSION", bpy.app.version_string)
ops = ["image.import_as_mesh_planes","image.convert_to_mesh_plane","object.grease_pencil_add","grease_pencil.trace_image","gpencil.trace_image","object.parent_set","nla.bake","sound.bake_animation","graph.sound_to_samples","import_anim.bvh","wm.obj_import","object.quadriflow_remesh","mesh.primitive_grid_add"]
for o in ops:
    m, f = o.split(".")
    try:
        getattr(getattr(bpy.ops,m),f).get_rna_type(); ok=True
    except Exception: ok=False
    print("OP", o, ok)
mods = sorted(m.__name__ for m in addon_utils.modules())
print("ADDONS", len(mods), [m for m in mods if any(k in m for k in ("rig","bvh","image","plane","anim","node","mocap","sun"))])
print("ALL", mods)
import cycles
print("OIDN", bpy.app.build_options.openimagedenoise if hasattr(bpy.app.build_options,"openimagedenoise") else "?")
print("MODIFIERS", [i.identifier for i in bpy.types.Modifier.bl_rna.properties['type'].enum_items if i.identifier in ("MESH_DEFORM","SURFACE_DEFORM","LAPLACIANDEFORM","CORRECTIVE_SMOOTH","LATTICE","DISPLACE","CLOTH","SOFT_BODY","NODES","GREASE_PENCIL_ARMATURE")])
print("GP types", [t for t in dir(bpy.types) if t.startswith("GreasePencil")][:15])
