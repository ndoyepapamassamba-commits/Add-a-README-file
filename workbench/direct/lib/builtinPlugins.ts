// Built-in plugins of the direct edition: no server, no account. Each one is a
// set of agent tools over a free public API (CORS-enabled, verified) or a
// local engine (3D studio). They can be switched off in Plugins.
import threeCode from 'virtual:three-iife';
import { blenderScript, glbExportHtml, normalizeScene, previewHtml, type SceneSpec } from './studio3dCore';
import { uid, useStore } from './store';
import type { DirectTool, ToolOut } from './tools';
import { bytesOf, getFile, uniquePath, writeBytes, writeText } from './vfs';
import { BRIDGE_HELP, bridgeHealth, bridgeRender } from './blenderBridge';
import { jevSeeBlob } from './jev';
import { keylessPreprints, keylessRead } from './freeEngines';
import { runLibrary } from './library';
import { remember as rememberKnowledge } from '../../server/jev/knowledge/learned';
import { DOMAINS, LIBRARY, type LibDomain } from '../../server/jev/library';
import {
  ecbRates,
  ecbText,
  entitiesText,
  frankfurterUrl,
  pagesText,
  parseWikidata,
  readableUrls,
  wikidataQuery,
  wikidataUrl,
  type PreprintSource,
} from '../../server/jev/web/freeTools';

export interface BuiltinPlugin {
  id: string;
  name: string;
  category: 'Création' | 'Données & recherche' | 'Finance' | 'Utilitaires';
  description: string;
  source: string;
  tools: DirectTool[];
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: 'string', description });
const S = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const ok = (summary: string, forModel: string, extra: Partial<ToolOut> = {}): ToolOut => ({
  ok: true,
  summary,
  forModel,
  ...extra,
});
const ok_ = (r: { groups: { hits: unknown[] }[]; text: string }, n: number): ToolOut =>
  ok(`${n}/${r.groups.length} source(s) · ${r.groups.reduce((a, g) => a + g.hits.length, 0)} résultat(s) · 0 $`, r.text, { output: r.text });
async function getJson<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} (${new URL(url).host})`);
  return (await r.json()) as T;
}
const tool = (
  t: Omit<DirectTool, 'readOnly' | 'risk'> & Partial<Pick<DirectTool, 'readOnly' | 'risk'>>,
): DirectTool => ({
  readOnly: true,
  risk: 'read',
  ...t,
});

/** Builds a .glb in an isolated frame (three.js GLTFExporter) and returns its bytes. */
function exportGlb(s: SceneSpec): Promise<Uint8Array> {
  const token = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.cssText = 'position:fixed;left:-10000px;width:10px;height:10px';
    const done = () => {
      clearTimeout(t);
      window.removeEventListener('message', on);
      f.remove();
    };
    const on = (e: MessageEvent) => {
      const d = e.data as { glb?: string; bytes?: ArrayBuffer; error?: string };
      if (d?.glb !== token || e.source !== f.contentWindow) return;
      done();
      if (d.error || !d.bytes) reject(new Error(d.error ?? 'export .glb impossible'));
      else resolve(new Uint8Array(d.bytes));
    };
    const t = setTimeout(() => {
      done();
      reject(new Error('export .glb : délai dépassé'));
    }, 20_000);
    window.addEventListener('message', on);
    f.srcdoc = glbExportHtml(s, threeCode, token);
    document.body.appendChild(f);
  });
}

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

export const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  {
    id: 'studio3d',
    name: 'Studio 3D → Blender',
    category: 'Création',
    description:
      'Scènes 3D interactives (formes, matériaux, lumières, animation) avec aperçu, export .glb et script Python Blender (bpy) qui reconstruit la scène dans Blender.',
    source: 'three.js (intégré) · Blender bpy',
    tools: [
      tool({
        name: 'blender.scene',
        description:
          'Create a 3D scene: interactive preview (orbit, animation), a .glb file (Blender: File → Import → glTF) and a Blender Python script (Scripting → Run Script) that rebuilds it. Shapes: cube, roundedbox, sphere, icosphere, cylinder, cone, torus, capsule, plane. Y is up; sizes in metres; rotation in degrees; spin in degrees/second.',
        parameters: obj(
          {
            name: str('File base name, e.g. "maquette-agence"'),
            title: str('Scene title'),
            background: str('Background colour #RRGGBB'),
            ground: { type: 'boolean', description: 'Add a ground disc (default true)' },
            objects: {
              type: 'array',
              items: obj(
                {
                  name: str('Object name'),
                  type: {
                    type: 'string',
                    enum: [
                      'cube',
                      'roundedbox',
                      'sphere',
                      'icosphere',
                      'cylinder',
                      'cone',
                      'torus',
                      'capsule',
                      'plane',
                    ],
                  },
                  position: vec3,
                  rotation: vec3,
                  scale: vec3,
                  size: { type: 'number' },
                  color: str('#RRGGBB'),
                  metalness: { type: 'number' },
                  roughness: { type: 'number' },
                  emissive: str('#RRGGBB glow'),
                  opacity: { type: 'number' },
                  spin: vec3,
                  bounce: { type: 'number' },
                },
                ['type'],
              ),
            },
            lights: {
              type: 'array',
              items: obj(
                {
                  type: { type: 'string', enum: ['ambient', 'sun', 'point', 'spot'] },
                  position: vec3,
                  color: str('#RRGGBB'),
                  intensity: { type: 'number' },
                },
                ['type'],
              ),
            },
            camera: obj({ position: vec3, target: vec3, fov: { type: 'number' } }),
            cinematic: { type: 'boolean', description: 'Cinematic rig (blender-cinematic-scene skill): three-point lighting, 50 mm camera with depth of field, filmic view, verification still. Default: on while the skill is enabled.' },
          },
          ['objects'],
        ),
        readOnly: false,
        risk: 'write',
        label: (a) => `Scène 3D ${S(a.name) || ''}`.trim(),
        async run(a, ctx) {
          const skillOn = useStore.getState().skills.some((k) => k.name === 'blender-cinematic-scene' && k.enabled);
          const s = normalizeScene({ ...(a as Record<string, unknown>), cinematic: typeof a.cinematic === 'boolean' ? a.cinematic : skillOn });
          const base = (S(a.name) || 'scene').replace(/[^\w.-]+/g, '-');
          const html = previewHtml(s, threeCode);
          const htmlPath = uniquePath(`3d/${base}.html`);
          writeText(htmlPath, html);
          const pyPath = uniquePath(`3d/${base}_blender.py`);
          writeText(pyPath, blenderScript(s));
          let glbPath = '';
          let glbNote = '';
          try {
            const glb = await exportGlb(s);
            glbPath = uniquePath(`3d/${base}.glb`);
            writeBytes(glbPath, glb, 'model/gltf-binary');
          } catch (e) {
            glbNote = ` (.glb not generated: ${(e as Error).message} — the preview has a .glb button)`;
          }
          const art = {
            id: uid(),
            name: `${base}.html`,
            type: 'html' as const,
            content: html,
            createdAt: Date.now(),
            sessionId: ctx.sessionId,
          };
          useStore.getState().addArtifact(art);
          return ok(
            `${s.objects.length} objet(s) · ${[htmlPath, glbPath, pyPath].filter(Boolean).join(' · ')}`,
            `3D scene "${s.title}" (${s.objects.length} objects). Files: preview ${htmlPath}${glbPath ? `, glTF ${glbPath}` : ''}${glbNote}, Blender script ${pyPath}. Tell the user: in Blender, Scripting tab → Open ${pyPath.split('/').pop()} → Run Script (rebuilds the scene with materials, lights, camera, animation), or File → Import → glTF 2.0 for the .glb.`,
            { artifact: art.id },
          );
        },
      }),
      tool({
        name: 'blender.render',
        description:
          'Render a 3D scene as a video with the user’s OWN Blender through the local bridge (scripts/blender-bridge.py on their machine: GPU, EEVEE, 0 $). Input: the Blender script written by blender.scene (script_path, 3d/<name>_blender.py) or a GLB of the workspace (glb_path: imported with the cinematic rig of the blender-cinematic-scene skill, camera auto-framed). Writes 3d/<name>.mp4 and 3d/<name>-verify.png. Fails with the start-up instructions when no bridge answers.',
        parameters: obj(
          {
            script_path: str('Workspace path of a Blender script (.py) produced by blender.scene'),
            glb_path: str('Workspace path of a .glb to render instead of a script'),
            name: str('Output base name (default: the input file name)'),
            seconds: { type: 'number', description: 'Video length in seconds (default 4)' },
            fps: { type: 'number', description: 'Frames per second (default 24)' },
            width: { type: 'number', description: 'Width in px (default 720)' },
            height: { type: 'number', description: 'Height in px (default 1280, vertical 9:16)' },
            engine: { type: 'string', enum: ['EEVEE', 'WORKBENCH', 'CYCLES'], description: 'Render engine (EEVEE on a GPU; CYCLES when the bridge runs on the bpy module without GPU)' },
            orbit: { type: 'boolean', description: 'Camera orbits the scene over the duration (default true for a GLB)' },
            still_only: { type: 'boolean', description: 'Only the verification still (fast check before a full render)' },
            look_for: str('Elements the render must SHOW, comma-separated (from the user request): the eye of JEV checks the verification still and says what it cannot see'),
          },
          [],
        ),
        readOnly: false,
        risk: 'write',
        label: (a) => `Rendu Blender local ${S(a.name) || S(a.script_path) || S(a.glb_path)}`.trim(),
        async run(a) {
          const health = await bridgeHealth();
          if (!health) throw new Error(BRIDGE_HELP);
          const sp = S(a.script_path);
          const gp = S(a.glb_path);
          if (!sp && !gp) throw new Error('script_path (script Blender de blender.scene) ou glb_path requis');
          const f = getFile(sp || gp);
          if (!f) throw new Error(`Fichier introuvable : ${sp || gp}`);
          const base = (S(a.name) || f.path.split('/').pop()!.replace(/(_blender)?\.(py|glb)$/i, '')).replace(/[^\w.-]+/g, '-');
          const t0 = Date.now();
          let last = '';
          const r = await bridgeRender(
            {
              script: sp ? (f.binary ? new TextDecoder().decode(bytesOf(f)) : f.data) : undefined,
              glb: gp ? bytesOf(f) : undefined,
              name: base,
              seconds: typeof a.seconds === 'number' ? a.seconds : 4,
              fps: typeof a.fps === 'number' ? a.fps : 24,
              width: typeof a.width === 'number' ? a.width : 720,
              height: typeof a.height === 'number' ? a.height : 1280,
              engine: (['EEVEE', 'WORKBENCH', 'CYCLES'].includes(S(a.engine)) ? S(a.engine) : health.mode === 'bpy' ? 'CYCLES' : 'EEVEE') as 'EEVEE' | 'WORKBENCH' | 'CYCLES',
              orbit: typeof a.orbit === 'boolean' ? a.orbit : Boolean(gp),
              stillOnly: a.still_only === true,
            },
            { onProgress: (fr, total, st) => (last = `${st} ${fr}/${total}`) },
          );
          const out: string[] = [];
          if (r.verify) out.push(writeBytes(uniquePath(`3d/${base}-verify.png`), r.verify, 'image/png').path);
          // THE EYE OF JEV on the verification still: are the requested elements (or the script's named objects) VISIBLE?
          let eyeLine = '';
          if (r.verify) {
            const script = sp ? (f.binary ? new TextDecoder().decode(bytesOf(f)) : f.data) : '';
            const wanted = (S(a.look_for) ? S(a.look_for).split(/[,;]+/) : blenderObjectNames(script)).map((x) => x.trim()).filter(Boolean).slice(0, 10);
            if (wanted.length) {
              const v = await jevSeeBlob(new Blob([r.verify as BlobPart], { type: 'image/png' }), wanted.map((name) => ({ name })));
              if (v)
                eyeLine = ` JEV's eye on the verification still: ${v.seen.length}/${wanted.length} element(s) visible${v.missing.length ? `; NOT visible: ${v.missing.map((m: { name: string; p: number }) => `${m.name} (p=${m.p.toFixed(2)})`).join(', ')} — fix the script (camera framing, scale, light, materials) and render again` : ''}${v.finish != null ? `; finish ${v.finish.toFixed(1)}/3` : ''}.`;
            }
          }
          if (r.video) out.push(writeBytes(uniquePath(`3d/${base}.mp4`), r.video, 'video/mp4').path);
          const rep = r.report;
          return ok(
            `${rep.frames ? `${rep.frames} images · ${rep.seconds} s` : 'image de vérification'} · ${rep.engine} · ${Math.round((Date.now() - t0) / 1000)} s`,
            `${eyeLine ? `${eyeLine.trim()} ` : ''}Blender local (${health.blender ?? health.mode}) rendered ${rep.frames} frame(s) at ${rep.resolution[0]}×${rep.resolution[1]} ${rep.fps} fps with ${rep.engine} in ${rep.render_time_s} s (${rep.objects} objects). Files: ${out.join(', ')}. Last status: ${last}. Look at the verification still before delivering the video.`,
          );
        },
      }),
    ],
  },
  {
    id: 'diagrams',
    name: 'Diagrammes (Kroki)',
    category: 'Création',
    description: 'Mermaid, PlantUML, Graphviz, BPMN, C4, D2… rendus en SVG.',
    source: 'kroki.io',
    tools: [
      tool({
        name: 'diagram.render',
        description:
          'Render a diagram to SVG (saved in outputs/ and shown to the user). type: mermaid, plantuml, graphviz, c4plantuml, bpmn, d2, erd, nomnoml, structurizr, vega, vegalite, wavedrom.',
        parameters: obj(
          { type: str('Diagram language'), source: str('Diagram source'), name: str('File base name') },
          ['type', 'source'],
        ),
        readOnly: false,
        risk: 'external',
        label: (a) => `Diagramme ${S(a.type)}`,
        async run(a, ctx) {
          const r = await fetch(`https://kroki.io/${encodeURIComponent(S(a.type))}/svg`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: S(a.source),
          });
          const svg = await r.text();
          if (!r.ok) throw new Error(`Erreur de syntaxe du diagramme : ${svg.slice(0, 500)}`);
          const path = uniquePath(`outputs/${(S(a.name) || 'diagramme').replace(/[^\w.-]+/g, '-')}.svg`);
          writeText(path, svg);
          const art = {
            id: uid(),
            name: path.split('/').pop()!,
            type: 'svg' as const,
            content: svg,
            createdAt: Date.now(),
            sessionId: ctx.sessionId,
          };
          useStore.getState().addArtifact(art);
          return ok(path, `Diagram rendered → ${path} (shown to the user).`, { artifact: art.id });
        },
      }),
    ],
  },
  {
    id: 'images',
    name: 'Images IA (Pollinations)',
    category: 'Création',
    description: 'Génère des images à partir d’une description (illustrations, visuels, maquettes).',
    source: 'pollinations.ai',
    tools: [
      tool({
        name: 'image.generate',
        description:
          'Generate an image from a prompt (English prompts work best). Saved as PNG/JPEG in outputs/images/.',
        parameters: obj(
          {
            prompt: str('Image description'),
            width: { type: 'number' },
            height: { type: 'number' },
            name: str('File base name'),
          },
          ['prompt'],
        ),
        readOnly: false,
        risk: 'external',
        label: (a) => `Image : ${S(a.prompt).slice(0, 50)}`,
        async run(a, ctx) {
          const w = Math.min(2048, Math.max(64, Number(a.width) || 1024));
          const h = Math.min(2048, Math.max(64, Number(a.height) || 768));
          const r = await fetch(
            `https://image.pollinations.ai/prompt/${encodeURIComponent(S(a.prompt))}?width=${w}&height=${h}&nologo=true&seed=${Date.now() % 100000}`,
          );
          if (!r.ok) throw new Error(`Génération impossible (HTTP ${r.status}).`);
          const blob = await r.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const path = uniquePath(
            `outputs/images/${(S(a.name) || 'image').replace(/[^\w.-]+/g, '-')}.${ext}`,
          );
          writeBytes(path, bytes, blob.type);
          if (ctx.vision) {
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
              bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            ctx.pendingImages.push({
              dataUrl: `data:${blob.type};base64,${btoa(bin)}`,
              caption: `Generated image ${path}`,
            });
          }
          return ok(path, `Image saved to ${path} (${w}×${h}, ${bytes.length} bytes).`);
        },
      }),
    ],
  },
  {
    id: 'fx',
    name: 'Taux de change (dont XOF)',
    category: 'Finance',
    description: 'Taux de change quotidiens de 160 devises, dont le franc CFA (XOF, XAF).',
    source: 'open.er-api.com',
    tools: [
      tool({
        name: 'fx.rates',
        description: 'Daily exchange rates. base (e.g. EUR, USD, XOF) and optional symbols list.',
        parameters: obj(
          { base: str('Base currency'), symbols: { type: 'array', items: { type: 'string' } } },
          ['base'],
        ),
        label: (a) => `Taux ${S(a.base)}`,
        async run(a) {
          const j = await getJson<{
            result: string;
            time_last_update_utc: string;
            rates: Record<string, number>;
          }>(`https://open.er-api.com/v6/latest/${encodeURIComponent(S(a.base).toUpperCase())}`);
          if (j.result !== 'success') throw new Error('devise inconnue');
          const syms =
            Array.isArray(a.symbols) && a.symbols.length
              ? a.symbols.map((x) => S(x).toUpperCase())
              : Object.keys(j.rates);
          const rows = syms.filter((k) => j.rates[k] !== undefined).map((k) => `${k}: ${j.rates[k]}`);
          return ok(
            `${rows.length} taux`,
            `Rates for 1 ${S(a.base).toUpperCase()} (updated ${j.time_last_update_utc}, source open.er-api.com):\n${rows.join('\n')}`,
          );
        },
      }),
      tool({
        name: 'fx.ecb',
        description:
          'OFFICIAL ECB reference rates (European Central Bank, via Frankfurter, free, no key): the reference for audit, IFRS conversions and committee files. base EUR, USD, XOF, XAF…; optional symbols; optional date « YYYY-MM-DD » (or a range « YYYY-MM-DD..YYYY-MM-DD », last day returned). XOF / XAF come from the legal fixed parity 1 EUR = 655.957.',
        parameters: obj(
          {
            base: str('Base currency (EUR, USD, XOF…)'),
            symbols: { type: 'array', items: { type: 'string' } },
            date: str('Optional date YYYY-MM-DD (or range start..end)'),
          },
          ['base'],
        ),
        label: (a) => `Taux BCE ${S(a.base)}${a.date ? ` au ${S(a.date)}` : ''}`,
        async run(a) {
          const syms = Array.isArray(a.symbols) ? a.symbols.map(S) : [];
          const j = await getJson(frankfurterUrl(S(a.base), { date: S(a.date) || undefined, symbols: syms }));
          const r = ecbRates(j, S(a.base), syms);
          if (!r) throw new Error(`devise ${S(a.base)} absente des taux BCE`);
          return ok(`${Object.keys(r.rates).length} taux BCE · ${r.date}`, ecbText(r));
        },
      }),
    ],
  },
  {
    id: 'worldbank',
    name: 'Banque mondiale',
    category: 'Données & recherche',
    description:
      'Indicateurs officiels par pays : PIB, inflation, population, crédit, dette… (UEMOA incluse).',
    source: 'api.worldbank.org',
    tools: [
      tool({
        name: 'worldbank.indicator',
        description:
          'World Bank indicator time series. country: ISO code(s) separated by ; (e.g. SN;CI;ML), indicator code (NY.GDP.MKTP.CD GDP, FP.CPI.TOTL.ZG inflation, SP.POP.TOTL population, FS.AST.PRVT.GD.ZS private credit % GDP, GC.DOD.TOTL.GD.ZS debt), years e.g. "2015:2025".',
        parameters: obj(
          {
            country: str('ISO codes'),
            indicator: str('Indicator code'),
            years: str('Range, e.g. 2015:2025'),
          },
          ['country', 'indicator'],
        ),
        label: (a) => `Banque mondiale ${S(a.indicator)} ${S(a.country)}`,
        async run(a) {
          const j = await getJson<
            [
              unknown,
              (
                | {
                    country: { value: string };
                    date: string;
                    value: number | null;
                    indicator: { value: string };
                  }[]
                | null
              ),
            ]
          >(
            `https://api.worldbank.org/v2/country/${encodeURIComponent(S(a.country))}/indicator/${encodeURIComponent(S(a.indicator))}?format=json&per_page=500${a.years ? `&date=${encodeURIComponent(S(a.years))}` : ''}`,
          );
          const rows = (j[1] ?? []).filter((r) => r.value !== null);
          if (!rows.length) return ok('aucune donnée', 'No data for this country / indicator / period.');
          return ok(
            `${rows.length} valeurs`,
            `${rows[0]!.indicator.value} (source: World Bank)\n${rows.map((r) => `${r.country.value} ${r.date}: ${r.value}`).join('\n')}`,
          );
        },
      }),
    ],
  },
  {
    id: 'weather',
    name: 'Météo',
    category: 'Données & recherche',
    description: 'Météo actuelle et prévisions 16 jours pour n’importe quelle ville.',
    source: 'open-meteo.com',
    tools: [
      tool({
        name: 'weather.forecast',
        description: 'Current weather and daily forecast for a place name (or lat/lon).',
        parameters: obj({ place: str('City / place'), days: { type: 'number' } }, ['place']),
        label: (a) => `Météo ${S(a.place)}`,
        async run(a) {
          const g = await getJson<{
            results?: { name: string; country: string; latitude: number; longitude: number }[];
          }>(
            `https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=${encodeURIComponent(S(a.place))}`,
          );
          const p = g.results?.[0];
          if (!p) throw new Error(`Lieu introuvable : ${S(a.place)}`);
          const days = Math.min(16, Math.max(1, Number(a.days) || 7));
          const w = await getJson<{
            current: Record<string, number | string>;
            daily: Record<string, (number | string)[]>;
          }>(
            `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&forecast_days=${days}&timezone=auto`,
          );
          const d = w.daily;
          const lines = (d.time ?? []).map(
            (t, i) =>
              `${t}: ${d.temperature_2m_min![i]}–${d.temperature_2m_max![i]} °C, pluie ${d.precipitation_sum![i]} mm, vent max ${d.wind_speed_10m_max![i]} km/h`,
          );
          return ok(
            `${p.name} ${w.current.temperature_2m} °C`,
            `${p.name} (${p.country}) — now: ${w.current.temperature_2m} °C, humidity ${w.current.relative_humidity_2m} %, wind ${w.current.wind_speed_10m} km/h. Source open-meteo.com\n${lines.join('\n')}`,
          );
        },
      }),
    ],
  },
  {
    id: 'holidays',
    name: 'Jours fériés',
    category: 'Utilitaires',
    description: 'Jours fériés officiels par pays et par année (planification, échéanciers).',
    source: 'date.nager.at',
    tools: [
      tool({
        name: 'holidays.list',
        description: 'Public holidays for a country (ISO code, e.g. SN, FR, CI) and a year.',
        parameters: obj({ country: str('ISO code'), year: { type: 'number' } }, ['country']),
        label: (a) => `Jours fériés ${S(a.country)}`,
        async run(a) {
          const y = Number(a.year) || new Date().getFullYear();
          const j = await getJson<{ date: string; localName: string; name: string }[]>(
            `https://date.nager.at/api/v3/PublicHolidays/${y}/${encodeURIComponent(S(a.country).toUpperCase())}`,
          );
          return ok(
            `${j.length} jours`,
            `Public holidays ${S(a.country).toUpperCase()} ${y} (date.nager.at; religious dates may shift by a day):\n${j.map((h) => `${h.date}: ${h.localName}`).join('\n')}`,
          );
        },
      }),
    ],
  },
  {
    id: 'wikipedia',
    name: 'Wikipédia',
    category: 'Données & recherche',
    description: 'Recherche et lecture d’articles Wikipédia (toutes langues).',
    source: 'wikipedia.org',
    tools: [
      tool({
        name: 'wikipedia.search',
        description:
          'Search Wikipedia and return the intro of the best matching articles. lang: fr (default), en…',
        parameters: obj({ query: str('Search terms'), lang: str('Language code') }, ['query']),
        label: (a) => `Wikipédia : ${S(a.query)}`,
        async run(a) {
          const lang = (S(a.lang) || 'fr').replace(/[^a-z-]/g, '');
          const j = await getJson<{
            query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
          }>(
            `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(S(a.query))}&gsrlimit=3&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*`,
          );
          const pages = Object.values(j.query?.pages ?? {});
          if (!pages.length) return ok('aucun article', 'No article found.');
          return ok(
            `${pages.length} article(s)`,
            pages
              .map((p) => `## ${p.title}\n${(p.extract ?? '').slice(0, 2500)}\n${p.fullurl ?? ''}`)
              .join('\n\n'),
          );
        },
      }),
    ],
  },
  {
    id: 'papers',
    name: 'Publications scientifiques',
    category: 'Données & recherche',
    description: 'Recherche d’articles (Crossref) : titres, auteurs, revues, DOI.',
    source: 'api.crossref.org',
    tools: [
      tool({
        name: 'papers.search',
        description: 'Search scholarly works (Crossref): title, authors, year, journal, DOI.',
        parameters: obj({ query: str('Search terms'), rows: { type: 'number' } }, ['query']),
        label: (a) => `Publications : ${S(a.query)}`,
        async run(a) {
          const j = await getJson<{
            message: {
              items: {
                title?: string[];
                author?: { family?: string }[];
                issued?: { 'date-parts'?: number[][] };
                'container-title'?: string[];
                DOI: string;
              }[];
            };
          }>(
            `https://api.crossref.org/works?rows=${Math.min(20, Number(a.rows) || 8)}&query=${encodeURIComponent(S(a.query))}`,
          );
          const it = j.message.items;
          return ok(
            `${it.length} résultat(s)`,
            it
              .map(
                (w) =>
                  `- ${w.title?.[0] ?? '(sans titre)'} — ${(w.author ?? [])
                    .slice(0, 3)
                    .map((x) => x.family)
                    .join(
                      ', ',
                    )} (${w.issued?.['date-parts']?.[0]?.[0] ?? '?'}), ${w['container-title']?.[0] ?? ''} https://doi.org/${w.DOI}`,
              )
              .join('\n'),
          );
        },
      }),
      tool({
        name: 'papers.preprints',
        description:
          'Working papers and preprints on SSRN (finance, economics, banking, law) and arXiv (quantitative finance, statistics, ML): the most recent research, often before journals. Free, no key. source: ssrn, arxiv or both.',
        parameters: obj(
          {
            query: str('Search terms, English works best (e.g. IFRS 9 expected credit loss Africa)'),
            source: { type: 'string', enum: ['ssrn', 'arxiv', 'both'] },
            max_results: { type: 'integer', description: '1-10 (default 6)' },
          },
          ['query'],
        ),
        label: (a) => `Prépublications : ${S(a.query)}`,
        async run(a, ctx) {
          const src = (['ssrn', 'arxiv', 'both'].includes(S(a.source)) ? S(a.source) : 'both') as PreprintSource;
          const r = await keylessPreprints(S(a.query), src, Math.min(10, Number(a.max_results) || 6), ctx.signal);
          if (!r.hits.length) throw new Error(`Aucune prépublication trouvée (${r.errors.join(' ; ')}).`);
          const text = r.hits.map((h) => `- ${h.title}${h.age ? ` (${h.age})` : ''} — ${h.url}${h.snippet ? `\n  ${h.snippet.slice(0, 400)}` : ''}`).join('\n');
          return ok(`${r.hits.length} prépublication(s) · ${r.via} · 0 $`, `${text}\n\n(web.read lit un article en entier.)`, { output: text });
        },
      }),
    ],
  },
  {
    id: 'library',
    name: 'Bibliothèque mondiale JEV (tous les domaines)',
    category: 'Données & recherche',
    description:
      'Savoirs, sciences, santé, finance et droit, livres et archives, code, nature, alimentation, culture, spiritualité, pays : 19 sources publiques gratuites et sans clé, interrogées en parallèle selon la demande.',
    source: LIBRARY.map((s) => s.label.split(' (')[0]).join(' · '),
    tools: [
      tool({
        name: 'library.search',
        description: `JEV WORLD LIBRARY (free, no key): asks the 2-4 best public sources for the request in parallel and returns titles, links and abstracts. Domains: ${DOMAINS.join(', ')} (auto-detected when omitted). Sources: ${LIBRARY.map((s) => s.id).join(', ')}. Use it for any fact, reference, book, scientific / medical / legal / financial literature, species, food, music, code library, or religious text; then web.read to read a result in full.`,
        parameters: obj(
          {
            query: str('What to look for (keywords work best)'),
            domains: { type: 'array', items: { type: 'string', enum: DOMAINS }, description: 'Optional: 1-2 domains' },
            sources: { type: 'array', items: { type: 'string', enum: LIBRARY.map((s) => s.id) }, description: 'Optional: exact sources' },
            max_results: { type: 'integer', description: 'Per source, 1-8 (default 4)' },
          },
          ['query'],
        ),
        label: (a) => `Bibliothèque : ${S(a.query)}`,
        async run(a, ctx) {
          const r = await runLibrary(
            S(a.query),
            {
              domains: Array.isArray(a.domains) ? (a.domains.map(S).filter((d) => (DOMAINS as string[]).includes(d)) as LibDomain[]) : undefined,
              sources: Array.isArray(a.sources) ? a.sources.map(S) : undefined,
              n: Number(a.max_results) || 4,
            },
            ctx.signal,
          );
          const ok = r.groups.filter((g) => g.hits.length);
          if (!ok.length) throw new Error(`Aucune source n'a répondu (${r.groups.map((g) => `${g.source.label} : ${g.error ?? '0 résultat'}`).join(' ; ')}).`);
          return ok_(r, ok.length);
        },
      }),
    ],
  },
  {
    id: 'reader',
    name: 'Lecture de pages entières (Exa · Parallel · Jina)',
    category: 'Données & recherche',
    description:
      'Lit une page web ou un PDF EN ENTIER (pas seulement l’extrait d’un moteur) : textes officiels, rapports, normes. Gratuit, sans clé.',
    source: 'mcp.exa.ai · search.parallel.ai · r.jina.ai',
    tools: [
      tool({
        name: 'web.read',
        description:
          'Read up to 5 web pages or PDFs IN FULL (clean Markdown, with title and publication date). Use after web.search to quote a regulation, a report or an article precisely, instead of relying on a snippet. Free, no key (Exa, then Parallel, then Jina Reader). focus = what to look for (helps long pages).',
        parameters: obj(
          {
            urls: { type: 'array', items: { type: 'string' }, description: '1-5 http(s) URLs' },
            focus: str('Optional: what you are looking for in these pages'),
          },
          ['urls'],
        ),
        label: (a) => `Lecture : ${readableUrls(a.urls).map((u) => new URL(u).hostname).join(', ') || S(a.urls)}`,
        async run(a, ctx) {
          const urls = readableUrls(a.urls);
          if (!urls.length) throw new Error('Aucune adresse http(s) valide à lire.');
          const r = await keylessRead(urls, S(a.focus), ctx.signal);
          if (!r.pages.length) throw new Error(`Lecture impossible (${r.errors.join(' ; ') || 'aucune réponse'}).`);
          const missed = urls.length - r.pages.length;
          const text = pagesText(r.pages, r.via.join(' + ')) + (missed > 0 ? `\n\n(${missed} page(s) non lue(s) : ${r.errors.join(' ; ')})` : '');
          // What was read feeds JEV's memory (the same page is not read again for the same question).
          const st = useStore.getState();
          st.setKnowledge(
            rememberKnowledge(st.knowledge, {
              query: S(a.focus) || r.pages.map((p) => p.title).join(' · '),
              text: pagesText(r.pages, r.via.join(' + ')).slice(0, 5500),
              sources: r.pages.map((p) => ({ url: p.url, title: p.title })),
              origin: 'search',
            }),
          );
          return ok(`${r.pages.length} page(s) lue(s) · ${r.via.join(' + ')} · 0 $`, text, { output: text });
        },
      }),
    ],
  },
  {
    id: 'entity',
    name: 'Fiche d’entité (Wikidata)',
    category: 'Données & recherche',
    description:
      'Fiche publique d’une banque, d’un groupe, d’une entreprise ou d’un pays : pays, siège, maison mère, secteur, création, effectif, cotation, ISIN.',
    source: 'query.wikidata.org',
    tools: [
      tool({
        name: 'entity.lookup',
        description:
          'Public facts on a company, bank, group, institution or country from Wikidata (free, no key): country, headquarters, parent organisation, industry, inception, employees, stock exchange, ISIN, website. Good to identify a counterparty or a group before an analysis. Declarative data: cross-check with financial statements.',
        parameters: obj({ name: str('Name of the entity (e.g. Ecobank, Sonatel, BOAD)'), lang: str('fr or en (default fr)') }, ['name']),
        label: (a) => `Fiche : ${S(a.name)}`,
        async run(a, ctx) {
          const r = await fetch(wikidataUrl(wikidataQuery(S(a.name), S(a.lang) || 'fr')), {
            headers: { Accept: 'application/sparql-results+json' },
            signal: ctx.signal,
          });
          if (!r.ok) throw new Error(`Wikidata HTTP ${r.status}`);
          const list = parseWikidata(await r.json());
          return ok(`${list.length} entité(s) · Wikidata · 0 $`, entitiesText(list, S(a.name)));
        },
      }),
    ],
  },
  {
    id: 'geo',
    name: 'Géocodage (OpenStreetMap)',
    category: 'Utilitaires',
    description: 'Adresse → coordonnées et coordonnées → adresse.',
    source: 'nominatim.openstreetmap.org',
    tools: [
      tool({
        name: 'geo.search',
        description: 'Find places / addresses (OpenStreetMap): name, coordinates, type.',
        parameters: obj({ query: str('Address or place') }, ['query']),
        label: (a) => `Lieu : ${S(a.query)}`,
        async run(a) {
          const j = await getJson<{ display_name: string; lat: string; lon: string; type: string }[]>(
            `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=fr&q=${encodeURIComponent(S(a.query))}`,
          );
          return ok(
            `${j.length} lieu(x)`,
            j.map((p) => `${p.display_name} — ${p.lat}, ${p.lon} (${p.type})`).join('\n') || 'No result.',
          );
        },
      }),
    ],
  },
  {
    id: 'crypto',
    name: 'Crypto-actifs',
    category: 'Finance',
    description: 'Cours des crypto-actifs (bitcoin, ether…) dans toutes les devises.',
    source: 'api.coingecko.com',
    tools: [
      tool({
        name: 'crypto.price',
        description:
          'Current prices of crypto assets. ids: coingecko ids (bitcoin, ethereum…), vs: currencies (usd, eur, xof).',
        parameters: obj(
          {
            ids: { type: 'array', items: { type: 'string' } },
            vs: { type: 'array', items: { type: 'string' } },
          },
          ['ids'],
        ),
        label: () => 'Cours crypto',
        async run(a) {
          const ids = (Array.isArray(a.ids) ? a.ids : [a.ids]).map(S).join(',');
          const vs = (Array.isArray(a.vs) && a.vs.length ? a.vs : ['usd', 'eur']).map(S).join(',');
          const j = await getJson<Record<string, Record<string, number>>>(
            `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`,
          );
          return ok(
            'cours',
            `Source CoinGecko:\n${Object.entries(j)
              .map(
                ([k, v]) =>
                  `${k}: ${Object.entries(v)
                    .map(([c, p]) => `${p} ${c.toUpperCase()}`)
                    .join(' · ')}`,
              )
              .join('\n')}`,
          );
        },
      }),
    ],
  },
];

/** Tools of the enabled built-in plugins. */
export function builtinTools(disabled: string[] = []): DirectTool[] {
  return BUILTIN_PLUGINS.filter((p) => !disabled.includes(p.id)).flatMap((p) => p.tools);
}
export const builtinToolNames = new Set(BUILTIN_PLUGINS.flatMap((p) => p.tools.map((t) => t.name)));

/** The objects a Blender script names (for the eye of JEV): cameras, lights and empties left out. */
export function blenderObjectNames(script: string): string[] {
  const names = [...script.matchAll(/(?:objects\.new\(|\.name\s*=\s*|name\s*=\s*)["']([^"']{2,40})["']/g)].map((m) => m[1]!);
  return [...new Set(names)].filter((n) => !/^(camera|cam|light|lamp|sun|key|fill|rim|empty|world|scene|collection|material|mat_)/i.test(n)).slice(0, 10);
}
