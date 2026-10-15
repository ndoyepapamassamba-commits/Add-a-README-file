// STUDIO 3D PRO — bac à sable three.js / WebGL isolé, éditeur GLSL, physique cannon-es, génération par IA avec
// auto-correction (erreurs réelles du rendu renvoyées au modèle + documentation locale), export GLB / GLB Draco.
import { useEffect, useRef, useState } from 'react';
import { Lab3D, type RunResult } from '../lib/lab3d/runner';
import { complete } from '../lib/llm';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { BRIDGE_HELP, bridgeHealth, bridgeRender, type BridgeHealth } from '../lib/blenderBridge';
import { VIDEO_3D } from '../lib/features';
import { CINEMATIC_WEBGL_RULES, generateWithCorrection, type Round } from '../../server/jev/lab3d/selfCorrect';
import { eyeProblems } from '../../server/jev/eye';
import { promptItems } from '../../server/jev/realize/realize';
import { jevSeeBlob } from '../lib/jev';
import {
  directStory,
  freeModels,
  parseDirections,
  storyFromLines,
  systemPrompt,
  userPrompt,
  type Story,
} from '../../server/jev/studio/stageDirections';

type Tab = 'code' | 'shader' | 'physics' | 'ai' | 'director';
// LE RÉALISATEUR : « QUI : réplique » → consignes de jeu validées (gestes CMU, énergie, réactions, caméra) pour le
// moteur Blender (scripts/blenderfilm/film.py --story story.directed.json), 0 $ de vidéo. Un modèle texte GRATUIT
// propose, les règles tranchent, le code valide ; sans clé, les règles seules dirigent.
const EX_SCENE = `Modou : Maman, ton tas de tomates là, c’est combien ?
Maman Nounou : Pour toi, mon fils ? Mille francs.
Modou : Mille ?! Hier c’était cinq cents !
Maman Nounou : Hier, tu n’avais pas ces sandales neuves.
Modou : Maman, c’est du vol !
Maman Nounou : Non, mon fils. C’est le marché.`;
const EX_CODE = `// Cubes procéduraux en spirale + sol
helpers.grid(20);
const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
for (let i = 0; i < 120; i++) {
  const a = i * 0.32, r = 0.6 + i * 0.03;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 120, 0.7, 0.55), metalness: 0.3, roughness: 0.4 }));
  m.position.set(Math.cos(a) * r, i * 0.03, Math.sin(a) * r);
  m.castShadow = true;
  scene.add(m);
}
onFrame((dt) => { scene.rotation.y += dt * 0.3; });`;
const EX_VERT = `varying vec2 vUv;
varying vec3 vN;
uniform float uTime;
void main() {
  vUv = uv;
  vN = normal;
  vec3 p = position + normal * 0.08 * sin(uTime * 2.0 + position.y * 6.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const EX_FRAG = `varying vec2 vUv;
varying vec3 vN;
uniform float uTime;
void main() {
  float b = 0.5 + 0.5 * sin(vUv.y * 20.0 - uTime * 3.0);
  vec3 col = mix(vec3(0.1, 0.2, 0.6), vec3(1.0, 0.5, 0.1), b);
  col *= 0.6 + 0.4 * max(dot(normalize(vN), normalize(vec3(1.0, 1.0, 0.5))), 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;
const EX_PHYS = `// Corps rigides + trajectoire cinématique (cannon-es)
physics.ground(0, { restitution: 0.4 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#2b3340' }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
for (let i = 0; i < 25; i++) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 25, 0.8, 0.55) }));
  s.position.set((Math.random() - 0.5) * 3, 3 + i * 0.4, (Math.random() - 0.5) * 3);
  s.castShadow = true; scene.add(s);
  physics.add(s, { mass: 1, restitution: 0.6 });
}
const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), new THREE.MeshStandardMaterial({ color: '#f59e0b' }));
paddle.position.set(0, 0.4, 0); scene.add(paddle);
const body = physics.add(paddle, { kinematic: true });
physics.path(body, [[-2, 0.4, -2], [2, 0.4, -2], [2, 0.4, 2], [-2, 0.4, 2]], 1.5);`;

function Console({ lines }: { lines: { k: string; m: string }[] }) {
  return (
    <div
      data-testid="lab3d-console"
      className="h-32 overflow-auto rounded-lg border border-line bg-black/40 p-2 font-mono text-[11px]"
    >
      {lines.length === 0 && (
        <div className="text-muted">
          Console du bac à sable : erreurs, avertissements et console.log s'affichent ici.
        </div>
      )}
      {lines.map((l, i) => (
        <div
          key={i}
          className={
            l.k === 'error'
              ? 'text-red-400'
              : l.k === 'warn'
                ? 'text-amber-300'
                : l.k === 'ok'
                  ? 'text-emerald-400'
                  : 'text-fg'
          }
        >
          {l.m}
        </div>
      ))}
    </div>
  );
}
const btn =
  'rounded-lg border border-line bg-elev px-3 py-1.5 text-[12.5px] hover:bg-hover disabled:opacity-50';
const btnMain =
  'rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg disabled:opacity-50';

export function Lab3DView() {
  const host = useRef<HTMLDivElement>(null);
  const lab = useRef<Lab3D | null>(null);
  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState(EX_CODE);
  const [vert, setVert] = useState(EX_VERT);
  const [frag, setFrag] = useState(EX_FRAG);
  const [shape, setShape] = useState('sphere');
  const [phys, setPhys] = useState(EX_PHYS);
  const [log, setLog] = useState<{ k: string; m: string }[]>([]);
  const [last, setLast] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState('');
  const models = useStore((s) => s.models);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState(
    'Une forêt low-poly de 200 arbres instanciés sur un terrain vallonné, au coucher du soleil',
  );
  const [rounds, setRounds] = useState<Round[]>([]);
  const [sceneText, setSceneText] = useState(EX_SCENE);
  const [directed, setDirected] = useState<ReturnType<typeof directStory> | null>(null);
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const push = (k: string, m: string) => setLog((l) => [...l.slice(-200), { k, m }]);
  useEffect(() => {
    // The local Blender bridge belongs to the 3D video chain (VIDEO_3D): not probed while that chain is out of the app.
    if (VIDEO_3D) void bridgeHealth().then(setBridge);
  }, []);
  // The WebGL scene → GLB → the user's own Blender (local bridge, GPU) → cinematic rig, orbit, MP4.
  const renderBlender = async () => {
    const h = await bridgeHealth();
    setBridge(h);
    if (!h) return push('error', BRIDGE_HELP);
    setBusy('rendu Blender local');
    try {
      const g = await lab.current!.exportGlb(false);
      if ('error' in g) throw new Error(`export GLB : ${g.error}`);
      push('ok', `GLB ${(g.bytes.byteLength / 1024).toFixed(1)} Ko envoyé au pont Blender (${h.blender ?? h.mode}) : rig cinéma + orbite 4 s`);
      const r = await bridgeRender(
        { glb: g.bytes, name: 'studio3d', seconds: 4, fps: 24, width: 720, height: 1280, engine: h.mode === 'bpy' ? 'CYCLES' : 'EEVEE', orbit: true },
        { onProgress: (f, t, st) => setBusy(`rendu Blender local · ${st} ${f}/${t}`) },
      );
      if (r.video) download('studio3d-blender.mp4', r.video, 'video/mp4');
      if (r.verify) download('studio3d-blender-verify.png', r.verify, 'image/png');
      push('ok', `✓ Blender ${r.report.blender} : ${r.report.frames} images ${r.report.resolution[0]}×${r.report.resolution[1]} @ ${r.report.fps} i/s, ${r.report.engine}, ${r.report.render_time_s} s`);
    } catch (e) {
      push('error', `Blender local : ${(e as Error).message}`);
    }
    setBusy('');
  };
  useEffect(() => {
    const l = new Lab3D(host.current!);
    l.onConsole = (k, m) => push(k, m);
    lab.current = l;
    void l.run(EX_CODE).then((r) => setLast(r));
    return () => l.dispose();
  }, []);
  const run = async (src: string) => {
    setLog([]);
    setBusy('exécution');
    const r = await lab.current!.run(src);
    setLast(r);
    push(
      r.ok ? 'ok' : 'error',
      r.ok
        ? `✓ rendu sans erreur en ${r.ms} ms · ${r.stats.meshes} mesh · ${r.stats.triangles} triangles · ${r.stats.bodies} corps physiques`
        : `✗ ${r.errors.length} erreur(s)`,
    );
    setBusy('');
    return r;
  };
  const shaderCode = () =>
    `helpers.shaderPreview(${JSON.stringify(vert)}, ${JSON.stringify(frag)}, ${JSON.stringify(shape)});`;
  const exportGlb = async (draco: boolean) => {
    setBusy(draco ? 'export GLB + Draco' : 'export GLB');
    const r = await lab.current!.exportGlb(draco);
    setBusy('');
    if ('error' in r) return push('error', `export : ${r.error}`);
    download(draco && r.draco ? 'scene-draco.glb' : 'scene.glb', r.bytes, 'model/gltf-binary');
    push(
      'ok',
      draco
        ? r.draco
          ? `✓ GLB Draco : ${(r.before / 1024).toFixed(1)} Ko → ${(r.bytes.byteLength / 1024).toFixed(1)} Ko`
          : `GLB non compressé (${(r.bytes.byteLength / 1024).toFixed(1)} Ko) : encodeur Draco indisponible (hors-ligne ?)`
        : `✓ GLB : ${(r.bytes.byteLength / 1024).toFixed(1)} Ko`,
    );
  };
  const generate = async () => {
    // A concrete model: the one chosen here, else the app's default, else a strong coder from the catalogue.
    const dflt = useStore.getState().settings.defaultModel;
    const m =
      model ||
      (dflt && dflt !== 'auto'
        ? dflt
        : (models.find((x) => /claude-sonnet|claude-opus|gpt-5|gemini-2\.5-pro/i.test(x.id))?.id ??
          models[0]?.id ??
          ''));
    if (!m)
      return push('error', 'aucun modèle disponible : clé OpenRouter ou fournisseur direct à configurer');
    setRounds([]);
    setBusy('génération IA');
    try {
      const cinematic = useStore.getState().skills.some((k) => k.name === 'blender-cinematic-scene' && k.enabled);
      if (cinematic) push('ok', 'skill blender-cinematic-scene active : éclairage trois points, caméra 50 mm, rendu filmique imposés à la génération');
      const r = await generateWithCorrection({
        prompt,
        rules: cinematic ? CINEMATIC_WEBGL_RULES : undefined,
        maxRounds: 3,
        generate: async (messages) =>
          (
            await complete(
              { model: m, messages, maxTokens: 6000, temperature: 0.4 },
              { models, fallbacks: [], effort: 'auto', purpose: '3d-generation' },
            )
          ).content,
        run: (c) => lab.current!.run(c),
        // The eye of JEV on the rendered canvas: the elements the prompt names must be visible.
        see: async () => {
          const png = await lab.current!.screenshot();
          if (!png) return null;
          const { items, circumstances } = promptItems(prompt);
          if (!items.length) return null;
          // Fitted to the eye's limits (≤ 1568 px a side) before it is sent.
          const v = await jevSeeBlob(await (await fetch(png)).blob(), items.map((i) => ({ name: i.text })), circumstances);
          if (!v) return null;
          push(v.missing.length ? 'warn' : 'ok', `Œil de JEV : ${v.seen.length}/${v.seen.length + v.missing.length} élément(s) vus${v.missing.length ? ` — manque : ${v.missing.map((m) => m.name).join(', ')}` : ''}`);
          return eyeProblems(v);
        },
        onRound: (r) => {
          setRounds((x) => [...x, r]);
          push(
            r.run.ok ? 'ok' : 'warn',
            `Tour ${r.round} : ${r.run.ok ? 'rendu valide' : `${r.run.errors.length} erreur(s) → renvoyées au modèle avec la documentation`}`,
          );
        },
      });
      setCode(r.code);
      push(
        r.ok ? 'ok' : 'error',
        r.ok
          ? `✓ scène générée en ${r.rounds.length} tour(s)`
          : `✗ toujours en erreur après ${r.rounds.length} tours : code laissé dans l'éditeur pour correction manuelle`,
      );
    } catch (e) {
      push('error', `génération : ${(e as Error).message}`);
    }
    setBusy('');
  };
  const direct = async () => {
    const story: Story = storyFromLines(sceneText, 'Scène du bac à sable');
    if (!story.beats.length) return push('error', 'aucune réplique : une ligne par réplique, « QUI : texte »');
    setBusy('réalisateur');
    const free = freeModels(models);
    let raw: unknown[] = [];
    let via = 'règles seules (aucun modèle gratuit joignable)';
    if (free.length) {
      try {
        const r = await complete(
          {
            model: free[0]!.id,
            messages: [
              { role: 'system', content: systemPrompt(story) },
              { role: 'user', content: userPrompt(story) },
            ],
            maxTokens: 1200,
            temperature: 0.3,
          },
          { models, fallbacks: free.slice(1, 3).map((m) => m.id), effort: 'auto', purpose: 'stage-directions' },
        );
        raw = parseDirections(r.content);
        via = raw.length ? `${r.model} (gratuit, 1 requête) + règles` : `${r.model} : réponse illisible → règles seules`;
      } catch (e) {
        via = `règles seules (${(e as Error).message.slice(0, 80)})`;
      }
    }
    const s = directStory(story, raw);
    setDirected(s);
    const gestes = s.beats.filter((b) => (b as { geste?: string }).geste !== 'aucun').length;
    push('ok', `✓ ${s.beats.length} réplique(s) dirigée(s) via ${via} : ${gestes} geste(s) capturé(s), ${s.beats.filter((b) => b.react).length} réaction(s)`);
    setBusy('');
  };
  const tabs: [Tab, string][] = [
    ['code', 'Code three.js'],
    ['shader', 'Shaders GLSL'],
    ['physics', 'Physique'],
    ['ai', 'Génération IA'],
    // The Blender « réalisateur » is part of the 3D video chain, out of the app while VIDEO_3D is off.
    ...(VIDEO_3D ? ([['director', 'Réalisateur']] as [Tab, string][]) : []),
  ];
  return (
    <div data-testid="lab3d" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-semibold">Studio 3D</h1>
        <span className="text-[12px] text-muted">
          bac à sable WebGL isolé · three.js r186 · cannon-es · GLSL · export GLB / Draco
        </span>
        <div className="flex-1" />
        {tabs.map(([id, label]) => (
          <button
            key={id}
            data-testid={`lab3d-tab-${id}`}
            onClick={() => setTab(id)}
            className={id === tab ? btnMain : btn}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="flex min-h-0 flex-col gap-2">
          {tab === 'code' && (
            <>
              <textarea
                data-testid="lab3d-code"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-elev p-2 font-mono text-[12px]"
              />
              <div className="flex gap-2">
                <button
                  data-testid="lab3d-run"
                  disabled={!!busy}
                  onClick={() => void run(code)}
                  className={btnMain}
                >
                  Exécuter
                </button>
              </div>
            </>
          )}
          {tab === 'shader' && (
            <>
              <label className="text-[12px] text-muted">Vertex shader</label>
              <textarea
                data-testid="lab3d-vert"
                spellCheck={false}
                value={vert}
                onChange={(e) => setVert(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-elev p-2 font-mono text-[12px]"
              />
              <label className="text-[12px] text-muted">
                Fragment shader (uniforms fournis : uTime, uResolution)
              </label>
              <textarea
                data-testid="lab3d-frag"
                spellCheck={false}
                value={frag}
                onChange={(e) => setFrag(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-elev p-2 font-mono text-[12px]"
              />
              <div className="flex gap-2">
                <select value={shape} onChange={(e) => setShape(e.target.value)} className={btn}>
                  <option value="sphere">sphère</option>
                  <option value="plane">plan</option>
                  <option value="torus">nœud torique</option>
                </select>
                <button
                  data-testid="lab3d-shader-run"
                  disabled={!!busy}
                  onClick={() => void run(shaderCode())}
                  className={btnMain}
                >
                  Compiler et afficher
                </button>
              </div>
            </>
          )}
          {tab === 'physics' && (
            <>
              <textarea
                data-testid="lab3d-phys"
                spellCheck={false}
                value={phys}
                onChange={(e) => setPhys(e.target.value)}
                className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-elev p-2 font-mono text-[12px]"
              />
              <button
                data-testid="lab3d-phys-run"
                disabled={!!busy}
                onClick={() => void run(phys)}
                className={btnMain}
              >
                Lancer la simulation
              </button>
            </>
          )}
          {tab === 'ai' && (
            <>
              <textarea
                data-testid="lab3d-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="h-24 resize-none rounded-lg border border-line bg-elev p-2 text-[12.5px]"
              />
              <div className="flex gap-2">
                <select
                  data-testid="lab3d-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={`${btn} min-w-0 flex-1`}
                >
                  <option value="">modèle par défaut de l'app</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="lab3d-generate"
                  disabled={!!busy}
                  onClick={() => void generate()}
                  className={btnMain}
                >
                  Générer (auto-correction ×3)
                </button>
              </div>
              <div data-testid="lab3d-rounds" className="min-h-0 flex-1 space-y-2 overflow-auto">
                {rounds.map((r) => (
                  <div key={r.round} className="rounded-lg border border-line p-2 text-[12px]">
                    <b>Tour {r.round}</b> —{' '}
                    {r.run.ok
                      ? '✓ rendu valide'
                      : `✗ ${r.run.errors.map((e) => `[${e.kind}] ${e.msg.slice(0, 160)}`).join(' · ')}`}
                  </div>
                ))}
                {!rounds.length && (
                  <p className="text-[12px] text-muted">
                    Le modèle écrit le code avec la documentation locale (three.js, GLSL, glTF, cannon-es)
                    dans son contexte ; chaque erreur réelle du rendu lui est renvoyée avec les lignes
                    fautives, jusqu'à 3 tours.
                  </p>
                )}
              </div>
            </>
          )}
          {tab === 'director' && (
            <>
              <label className="text-[12px] text-muted">
                Une réplique par ligne, « QUI : texte ». Le réalisateur choisit pour chacune un geste capturé (base CMU),
                l’énergie, la réaction des partenaires et la caméra — rien que ce que le moteur Blender sait jouer.
              </label>
              <textarea
                data-testid="lab3d-scene"
                spellCheck={false}
                value={sceneText}
                onChange={(e) => setSceneText(e.target.value)}
                className="h-40 resize-none rounded-lg border border-line bg-elev p-2 font-mono text-[12px]"
              />
              <div className="flex flex-wrap gap-2">
                <button data-testid="lab3d-direct" disabled={!!busy} onClick={() => void direct()} className={btnMain}>
                  Diriger (modèle gratuit + règles)
                </button>
                <button
                  data-testid="lab3d-direct-download"
                  disabled={!directed}
                  onClick={() => directed && download('story.directed.json', JSON.stringify(directed, null, 1), 'application/json')}
                  className={btn}
                >
                  Télécharger pour le moteur Blender
                </button>
                <span className="text-[12px] text-muted">
                  {freeModels(models).length
                    ? `${freeModels(models).length} modèle(s) gratuit(s) : 50 requêtes/jour sans crédit`
                    : 'aucun modèle gratuit dans le catalogue : règles seules'}
                </span>
              </div>
              <div data-testid="lab3d-directions" className="min-h-0 flex-1 overflow-auto rounded-lg border border-line text-[12px]">
                {directed ? (
                  <table className="w-full">
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="p-1">#</th>
                        <th className="p-1">Qui</th>
                        <th className="p-1">Geste</th>
                        <th className="p-1">Énergie</th>
                        <th className="p-1">Réactions</th>
                        <th className="p-1">Caméra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directed.beats.map((b, i) => {
                        const d = b as { geste?: string; energie?: number; react?: Record<string, string>; move?: string };
                        return (
                          <tr key={i} className="border-t border-line">
                            <td className="p-1">{i + 1}</td>
                            <td className="p-1">{b.who}</td>
                            <td className="p-1">{d.geste}</td>
                            <td className="p-1">{d.energie}</td>
                            <td className="p-1">{Object.entries(d.react ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}</td>
                            <td className="p-1">{d.move ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-2 text-muted">
                    Le fichier téléchargé se donne au moteur : <code>film.py --story story.directed.json</code>. Les gestes sont
                    des clips de capture de mouvement CMU (libres d’usage), joués dans le plan des dessins de la troupe.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <div ref={host} className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="lab3d-glb"
              disabled={!!busy}
              onClick={() => void exportGlb(false)}
              className={btn}
            >
              Export GLB
            </button>
            <button
              data-testid="lab3d-glb-draco"
              disabled={!!busy}
              onClick={() => void exportGlb(true)}
              className={btn}
            >
              Export GLB + Draco
            </button>
            {VIDEO_3D && (
            <button
              data-testid="lab3d-blender"
              disabled={!!busy}
              onClick={() => void renderBlender()}
              className={btn}
              title={bridge ? `Pont Blender local : ${bridge.blender ?? bridge.mode}` : BRIDGE_HELP}
            >
              {bridge ? `Rendre dans Blender local (${bridge.mode === 'bpy' ? 'bpy' : 'GPU'})` : 'Blender local : non détecté'}
            </button>
            )}
            <span data-testid="lab3d-stats" className="text-[12px] text-muted">
              {busy
                ? `${busy}…`
                : last
                  ? `${last.ok ? '✓' : '✗'} ${last.stats.meshes} mesh · ${last.stats.triangles} triangles · ${last.stats.drawCalls} draw calls · ${last.stats.bodies} corps · ${last.ms} ms`
                  : ''}
            </span>
          </div>
          <Console lines={log} />
        </div>
      </div>
    </div>
  );
}
