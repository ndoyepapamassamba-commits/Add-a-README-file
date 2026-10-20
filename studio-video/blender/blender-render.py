#!/usr/bin/env python3
"""Rendu Blender HEADLESS d'un script bpy produit par l'app (Studio 3D → Blender), sans interface : une image de
vérification (verify.png) puis une vidéo MP4 (frames PNG → ffmpeg). Fonctionne avec le module Python `bpy` (Blender
officiel en module, `pip install bpy`) ou avec un Blender installé (`blender -b --python blender/blender-render.py -- …`).

Usage :
  python3 blender/blender-render.py <script_bpy.py> --out <dossier> [--seconds 4] [--fps 24] [--width 720] [--height 1280]
                                    [--engine EEVEE|WORKBENCH|CYCLES] [--still-only] [--orbit]
  python3 blender/blender-render.py --glb <scene.glb> --out <dossier> [--orbit] …   (GLB du bac à sable WebGL : import, rig
                                    cinéma de la skill blender-cinematic-scene, caméra cadrée automatiquement, orbite)
  blender -b --python blender/blender-render.py -- <mêmes arguments>                 (Blender installé, GPU / EEVEE)

Sorties : <dossier>/verify.png, <dossier>/frames/f0001.png…, <dossier>/video.mp4 (si ffmpeg est présent), <dossier>/report.json.
Aucune donnée inventée : le rapport dit ce qui a été rendu (nombre d'images, durée, moteur, résolution, temps).
"""
import argparse, json, os, shutil, subprocess, sys, time


def scene_bounds(bpy):
    import mathutils
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    n = 0
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ mathutils.Vector(c)
            lo = mathutils.Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = mathutils.Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
            n += 1
    if not n:
        return mathutils.Vector((0, 0, 0)), 2.0
    center = (lo + hi) / 2
    radius = max(0.5, (hi - lo).length / 2)
    return center, radius


def build_from_glb(bpy, path: str) -> None:
    """GLB du bac à sable WebGL → scène Blender : import, monde, rig cinéma (trois points, caméra 50 mm + profondeur de
    champ, vue filmique — skill blender-cinematic-scene), caméra cadrée sur la boîte englobante."""
    import math, mathutils
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Monde')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.06, 0.07, 0.09, 1)
        bg.inputs[1].default_value = 0.6
    center, r = scene_bounds(bpy)
    # Caméra : 50 mm, légère plongée, sujet cadré avec marge.
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = 50
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = 2.8
    cam = bpy.data.objects.new('Camera', cam_data)
    scene.collection.objects.link(cam)
    dist = r * 2.6
    cam.location = center + mathutils.Vector((dist * 0.75, -dist * 0.75, dist * 0.45))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.dof.focus_distance = (center - cam.location).length
    scene.camera = cam
    for name, off, energy, size, color in (
        ('Key', (r * 0.8, -r * 0.9, r * 0.9), 180 * r, r * 0.6, (1.0, 0.96, 0.9)),
        ('Fill', (-r * 1.1, -r * 0.6, r * 0.5), 50 * r, r * 1.2, (0.85, 0.9, 1.0)),
        ('Rim', (-r * 0.3, r * 1.1, r * 1.1), 120 * r, r * 0.4, (1.0, 1.0, 1.0)),
    ):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy, ld.size, ld.color = energy, size, color
        li = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(li)
        li.location = center + mathutils.Vector(off)
        li.rotation_euler = (center - li.location).to_track_quat('-Z', 'Y').to_euler()
    try:
        views = {i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items}
        scene.view_settings.view_transform = 'AgX' if 'AgX' in views else 'Filmic'
    except Exception as e:  # noqa: BLE001
        print('vue filmique non appliquée :', e)
    print(f'GLB importé : {sum(1 for o in scene.objects if o.type == "MESH")} maillage(s), rayon {r:.2f}, centre {tuple(round(v, 2) for v in center)}')


def orbit_camera(bpy, scene, frames: int) -> None:
    """La caméra tourne d'un tour complet autour du centre de la scène sur `frames` images (orbite lente, hauteur constante)."""
    import math, mathutils
    cam = scene.camera
    if cam is None:
        return
    center, _ = scene_bounds(bpy)
    rel = cam.location - center
    radius = math.hypot(rel.x, rel.y)
    a0 = math.atan2(rel.y, rel.x)
    z = cam.location.z
    # Constant speed whatever the Blender version (5.x layered actions expose no plain `fcurves`).
    try:
        bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
    except Exception as e:  # noqa: BLE001
        print('interpolation linéaire non réglée :', e)
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames)
        a = a0 + t * 2 * math.pi
        cam.location = mathutils.Vector((center.x + radius * math.cos(a), center.y + radius * math.sin(a), z))
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.keyframe_insert('location', frame=f)
        cam.keyframe_insert('rotation_euler', frame=f)
    try:
        act = cam.animation_data.action if cam.animation_data else None
        for fc in getattr(act, 'fcurves', []) or []:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    except Exception as e:  # noqa: BLE001
        print('courbes non lissées :', e)


def main() -> int:
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('script', nargs='?', help='script bpy produit par l’app (ou --glb)')
    ap.add_argument('--glb', help='scène GLB à importer (export du bac à sable WebGL)')
    ap.add_argument('--orbit', action='store_true', help='la caméra tourne autour de la scène pendant la durée')
    ap.add_argument('--out', required=True)
    ap.add_argument('--seconds', type=float, default=4.0)
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--width', type=int, default=720)
    ap.add_argument('--height', type=int, default=1280)
    ap.add_argument('--engine', default='WORKBENCH')
    ap.add_argument('--still-only', action='store_true')
    a = ap.parse_args(argv)

    import bpy  # noqa: E402  (module bpy ou Blender lui-même)

    t0 = time.time()
    os.makedirs(os.path.join(a.out, 'frames'), exist_ok=True)
    if a.glb:
        build_from_glb(bpy, a.glb)
    elif a.script:
        src = open(a.script, encoding='utf-8').read()
        # Le script de l'app lit `__file__` pour placer verify.png ; on lui donne le dossier de sortie.
        exec(compile(src, a.script, 'exec'), {'__name__': '__main__', '__file__': os.path.join(a.out, 'scene.py')})
    else:
        ap.error('script bpy ou --glb requis')
    scene = bpy.context.scene
    if a.orbit:
        orbit_camera(bpy, scene, max(1, int(round(a.seconds * a.fps))))
    engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    alias = {'WORKBENCH': ['BLENDER_WORKBENCH', 'WORKBENCH'], 'EEVEE': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'], 'BLENDER_EEVEE_NEXT': ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'], 'CYCLES': ['CYCLES']}
    wanted = [a.engine] + alias.get(a.engine, []) + ['BLENDER_WORKBENCH', 'CYCLES']
    engine = next((e for e in wanted if e in engines), 'CYCLES')
    scene.render.engine = engine
    scene.render.resolution_x, scene.render.resolution_y = a.width, a.height
    scene.render.resolution_percentage = 100
    scene.render.fps = a.fps
    scene.render.image_settings.file_format = 'PNG'
    if engine == 'CYCLES':
        scene.cycles.samples = 32
        scene.cycles.device = 'CPU'
    # Image de vérification (la skill blender-cinematic-scene exige un rendu réel avant tout).
    scene.frame_set(1)
    scene.render.filepath = os.path.join(a.out, 'verify.png')
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as e:  # headless without GPU/GL: fall back to Cycles on CPU
        if engine == 'CYCLES':
            raise
        print('moteur', engine, 'indisponible sans affichage (', e, ') → CYCLES CPU')
        engine = 'CYCLES'
        scene.render.engine = engine
        scene.cycles.samples = 16
        scene.cycles.device = 'CPU'
        bpy.ops.render.render(write_still=True)
    frames = 0
    if not a.still_only:
        n = max(1, int(round(a.seconds * a.fps)))
        scene.frame_start, scene.frame_end = 1, n
        for f in range(1, n + 1):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(a.out, 'frames', f'f{f:04d}.png')
            bpy.ops.render.render(write_still=True)
            frames += 1
    video = ''
    if frames and shutil.which('ffmpeg'):
        video = os.path.join(a.out, 'video.mp4')
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', os.path.join(a.out, 'frames', 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', video],
            check=True,
        )
    report = {
        'blender': bpy.app.version_string,
        'engine': engine,
        'resolution': [a.width, a.height],
        'fps': a.fps,
        'frames': frames,
        'seconds': frames / a.fps if frames else 0,
        'verify': os.path.join(a.out, 'verify.png'),
        'video': video,
        'objects': len(bpy.data.objects),
        'render_time_s': round(time.time() - t0, 1),
    }
    with open(os.path.join(a.out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
