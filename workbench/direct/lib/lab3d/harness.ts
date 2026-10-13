/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
// SANDBOX 3D — the code that runs INSIDE the isolated iframe (opaque origin: no access to the app, its storage or its
// keys). It is serialised with Function.prototype.toString and started after the three.js and cannon-es bundles.
// API given to the generated code:
//   THREE, CANNON, scene, camera, renderer, controls,
//   physics.add(mesh, { mass, kinematic, shape }), physics.ground(y), physics.path(body, points, speed), physics.world,
//   onFrame((dt, t) => …), helpers.shaderPreview(vertex, fragment, shape), helpers.grid().
// Everything that goes wrong is reported to the page: exceptions (with the line in the user code), console.error,
// unhandled promises and the WebGL shader compiler logs (vertex / fragment / link).
declare const THREE: any;
declare const CANNON: any;

export function harnessMain(): void {
  const send = (m: Record<string, unknown>, t: Transferable[] = []) =>
    parent.postMessage({ lab3d: true, ...m }, '*', t);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  let errors: { kind: string; msg: string; line: number | null }[] = [];
  let warnings: string[] = [];
  const report = (kind: string, msg: unknown, line: number | null = null) => {
    const m = String(msg).slice(0, 2000);
    errors.push({ kind, msg: m, line });
    send({ type: 'error', kind, msg: m, line });
  };
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    vs: WebGLShader,
    fs: WebGLShader,
  ) => {
    const v = (gl.getShaderInfoLog(vs) || '').trim();
    const f = (gl.getShaderInfoLog(fs) || '').trim();
    const p = (gl.getProgramInfoLog(program) || '').trim();
    report(
      'shader',
      [v && `VERTEX: ${v}`, f && `FRAGMENT: ${f}`, !v && !f && p && `LINK: ${p}`]
        .filter(Boolean)
        .join('\n') || 'shader invalide',
    );
  };
  // Line in the user code: the Function wrapper adds 4 lines before it (header, « ) { », "use strict", async).
  const lineOf = (e: any): number | null => {
    const m = /<anonymous>:(\d+):\d+/.exec(String(e?.stack ?? ''));
    return m ? Math.max(1, Number(m[1]) - 4) : null;
  };
  window.onerror = (m, _s, _l, _c, err) => {
    report('runtime', (err as Error)?.message ?? m, lineOf(err));
    return true;
  };
  window.onunhandledrejection = (e) => report('runtime', e.reason?.message ?? e.reason, lineOf(e.reason));
  const fmt = (a: unknown[]) =>
    a
      .map((x) =>
        typeof x === 'object'
          ? (() => {
              try {
                return JSON.stringify(x);
              } catch {
                return String(x);
              }
            })()
          : String(x),
      )
      .join(' ');
  const ce = console.error.bind(console);
  const cw = console.warn.bind(console);
  const cl = console.log.bind(console);
  console.error = (...a: unknown[]) => {
    report('console', fmt(a));
    ce(...a);
  };
  console.warn = (...a: unknown[]) => {
    const m = fmt(a).slice(0, 500);
    warnings.push(m);
    send({ type: 'warn', msg: m });
    cw(...a);
  };
  console.log = (...a: unknown[]) => {
    send({ type: 'log', msg: fmt(a).slice(0, 1000) });
    cl(...a);
  };

  let scene: any;
  let camera: any;
  let controls: any;
  let world: any;
  let frameFns: ((dt: number, t: number) => void)[] = [];
  let bodies: { mesh: any; body: any }[] = [];
  let t = 0;
  const clock = new THREE.Clock();
  const size = () => ({ w: canvas.clientWidth || 640, h: canvas.clientHeight || 400 });
  function disposeAll() {
    scene?.traverse((o: any) => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        for (const v of Object.values(m)) if ((v as any)?.isTexture) (v as any).dispose();
        m.dispose?.();
      }
    });
    controls?.dispose?.();
  }
  function reset() {
    disposeAll();
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#15171d');
    const { w, h } = size();
    camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 2000);
    camera.position.set(4, 3, 6);
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight('#dfe8ff', '#30261c', 1.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(5, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    frameFns = [];
    bodies = [];
    errors = [];
    warnings = [];
    t = 0;
    clock.getDelta();
  }
  // ── physics (cannon-es) ──────────────────────────────────────────────────────────────────────────────────────────
  function shapeFor(mesh: any, kind?: string) {
    const g = mesh.geometry;
    const s = mesh.scale;
    const p = g?.parameters ?? {};
    const type = kind ?? g?.type;
    if (type === 'SphereGeometry' || type === 'sphere')
      return new CANNON.Sphere((p.radius ?? 0.5) * Math.max(s.x, s.y, s.z));
    if (type === 'BoxGeometry' || type === 'box')
      return new CANNON.Box(
        new CANNON.Vec3(((p.width ?? 1) * s.x) / 2, ((p.height ?? 1) * s.y) / 2, ((p.depth ?? 1) * s.z) / 2),
      );
    if (type === 'CylinderGeometry' || type === 'cylinder')
      return new CANNON.Cylinder(
        (p.radiusTop ?? 0.5) * s.x,
        (p.radiusBottom ?? 0.5) * s.x,
        (p.height ?? 1) * s.y,
        16,
      );
    // Any other mesh: its bounding box.
    g.computeBoundingBox();
    const b = g.boundingBox;
    return new CANNON.Box(
      new CANNON.Vec3(
        ((b.max.x - b.min.x) * s.x) / 2,
        ((b.max.y - b.min.y) * s.y) / 2,
        ((b.max.z - b.min.z) * s.z) / 2,
      ),
    );
  }
  const physics = {
    get world() {
      return world;
    },
    add(
      mesh: any,
      o: { mass?: number; kinematic?: boolean; shape?: string; restitution?: number; friction?: number } = {},
    ) {
      const body = new CANNON.Body({
        mass: o.kinematic ? 0 : (o.mass ?? 1),
        type: o.kinematic ? CANNON.Body.KINEMATIC : undefined,
        shape: shapeFor(mesh, o.shape),
        position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        quaternion: new CANNON.Quaternion(
          mesh.quaternion.x,
          mesh.quaternion.y,
          mesh.quaternion.z,
          mesh.quaternion.w,
        ),
      });
      if (o.restitution !== undefined || o.friction !== undefined)
        body.material = new CANNON.Material({
          restitution: o.restitution ?? 0.3,
          friction: o.friction ?? 0.4,
        });
      world.addBody(body);
      bodies.push({ mesh, body });
      return body;
    },
    ground(y = 0, o: { restitution?: number } = {}) {
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
      body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      body.position.set(0, y, 0);
      if (o.restitution !== undefined) body.material = new CANNON.Material({ restitution: o.restitution });
      world.addBody(body);
      return body;
    },
    /** Kinematic trajectory: the body follows a smooth curve through the points at `speed` units / s. */
    path(body: any, points: [number, number, number][], speed = 1, closed = true) {
      const curve = new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        closed,
      );
      const len = curve.getLength() || 1;
      frameFns.push((_dt, tt) => {
        const u = ((tt * speed) / len) % 1;
        const p = curve.getPointAt(closed ? u : Math.min(1, (tt * speed) / len));
        const ahead = curve.getPointAt(
          Math.min(0.999, (closed ? u : Math.min(1, (tt * speed) / len)) + 0.001),
        );
        const v = ahead
          .clone()
          .sub(p)
          .multiplyScalar(speed * len * 10);
        body.position.set(p.x, p.y, p.z);
        body.velocity.set(v.x / len, v.y / len, v.z / len);
      });
      return curve;
    },
  };
  const helpers = {
    grid(n = 10) {
      const g = new THREE.GridHelper(n, n, '#4b5563', '#2a2f3a');
      g.userData.helper = true;
      scene.add(g);
      return g;
    },
    /** A mesh with a ShaderMaterial (uTime, uResolution provided) — the GLSL editor's preview. */
    shaderPreview(vertexShader: string, fragmentShader: string, shape = 'sphere') {
      const geo =
        shape === 'plane'
          ? new THREE.PlaneGeometry(4, 4, 128, 128)
          : shape === 'torus'
            ? new THREE.TorusKnotGeometry(1, 0.32, 256, 48)
            : new THREE.SphereGeometry(1.5, 128, 64);
      const { w, h } = size();
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(w, h) } },
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      frameFns.push((_dt, tt) => {
        mat.uniforms.uTime.value = tt;
      });
      return mesh;
    },
  };
  function frame() {
    requestAnimationFrame(frame);
    const { w, h } = size();
    if (
      canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.floor(h * renderer.getPixelRatio())
    ) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    try {
      world.fixedStep(1 / 60, dt);
      for (const { mesh, body } of bodies) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      }
    } catch (e) {
      report('physics', (e as Error).message);
    }
    for (const f of frameFns)
      try {
        f(dt, t);
      } catch (e) {
        report('runtime', (e as Error).message, lineOf(e));
        frameFns = frameFns.filter((x) => x !== f);
      }
    controls.update();
    renderer.render(scene, camera);
  }
  const nextFrames = (n: number) =>
    new Promise<void>((r) => {
      let k = 0;
      const step = () => (++k >= n ? r() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  async function run(id: string, code: string) {
    reset();
    try {
      const fn = new Function(
        'THREE',
        'CANNON',
        'scene',
        'camera',
        'renderer',
        'controls',
        'physics',
        'onFrame',
        'helpers',
        `"use strict";\nreturn (async () => {\n${code}\n})();`,
      );
      // Generated code often never returns (its own requestAnimationFrame loop, an await that never settles): that
      // is NOT an infinite loop of the sandbox — after a grace delay the scene is evaluated as it stands.
      const pending = await Promise.race([
        fn(
          THREE,
          CANNON,
          scene,
          camera,
          renderer,
          controls,
          physics,
          (f: (dt: number, t: number) => void) => frameFns.push(f),
          helpers,
        ).then(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(true), 6000)),
      ]);
      if (pending) warnings.push('le code ne s’est pas terminé en 6 s (boucle d’animation ou attente) : scène évaluée en l’état, rendu en cours');
    } catch (e) {
      report('runtime', (e as Error)?.message ?? e, lineOf(e));
    }
    // A few frames: shaders compile, physics starts, frame callbacks run once.
    await nextFrames(4);
    let meshes = 0;
    scene.traverse((o: any) => o.isMesh && meshes++);
    send({
      type: 'ran',
      id,
      ok: errors.length === 0,
      errors,
      warnings,
      stats: {
        meshes,
        triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls,
        bodies: bodies.length,
        programs: renderer.info.programs?.length ?? 0,
      },
    });
  }
  addEventListener('message', (ev) => {
    const d = ev.data ?? {};
    if (ev.source !== parent || !d.lab3d) return;
    if (d.op === 'run') void run(d.id, d.code);
    else if (d.op === 'export') {
      const ex = new THREE.GLTFExporter();
      const hidden: any[] = [];
      scene.traverse((o: any) => o.userData?.helper && o.visible && (hidden.push(o), (o.visible = false)));
      ex.parse(
        scene,
        (buf: ArrayBuffer) => {
          hidden.forEach((o) => (o.visible = true));
          send({ type: 'glb', id: d.id, buf }, [buf]);
        },
        (err: any) => {
          hidden.forEach((o) => (o.visible = true));
          send({ type: 'glb', id: d.id, error: String(err?.message ?? err) });
        },
        { binary: true, onlyVisible: true },
      );
    } else if (d.op === 'shot') send({ type: 'shot', id: d.id, png: canvas.toDataURL('image/png') });
    else if (d.op === 'load') {
      reset();
      const loader = new THREE.GLTFLoader();
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
      loader.setDRACOLoader(draco);
      loader.parse(
        d.buf,
        '',
        (g: any) => {
          scene.add(g.scene);
          send({ type: 'loaded', id: d.id, ok: true });
        },
        (e: any) => send({ type: 'loaded', id: d.id, ok: false, error: String(e?.message ?? e) }),
      );
    }
  });
  reset();
  frame();
  send({ type: 'ready' });
}
