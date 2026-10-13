#!/usr/bin/env python3
"""Rendu Blender HEADLESS d'un script bpy produit par l'app (Studio 3D → Blender), sans interface : une image de
vérification (verify.png) puis une vidéo MP4 (frames PNG → ffmpeg). Fonctionne avec le module Python `bpy` (Blender
officiel en module, `pip install bpy`) ou avec un Blender installé (`blender -b --python scripts/blender-render.py -- …`).

Usage :
  python3 scripts/blender-render.py <script_bpy.py> --out <dossier> [--seconds 4] [--fps 24] [--width 720] [--height 1280]
                                    [--engine WORKBENCH|BLENDER_EEVEE_NEXT|CYCLES] [--still-only]

Sorties : <dossier>/verify.png, <dossier>/frames/f0001.png…, <dossier>/video.mp4 (si ffmpeg est présent), <dossier>/report.json.
Aucune donnée inventée : le rapport dit ce qui a été rendu (nombre d'images, durée, moteur, résolution, temps).
"""
import argparse, json, os, shutil, subprocess, sys, time


def main() -> int:
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('script')
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
    src = open(a.script, encoding='utf-8').read()
    # Le script de l'app lit `__file__` pour placer verify.png ; on lui donne le dossier de sortie.
    exec(compile(src, a.script, 'exec'), {'__name__': '__main__', '__file__': os.path.join(a.out, 'scene.py')})
    scene = bpy.context.scene
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
