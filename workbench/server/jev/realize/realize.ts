// RÉALISATION — « tout prompt devient une réalisation ». Le modèle écrit une page HTML complète ; l'app l'exécute dans
// une iframe isolée (origine opaque : aucun accès à l'app, à ses clés ni à son stockage) où un PONT relève les erreurs
// réelles (exception avec sa ligne, promesse rejetée, console.error, ressource introuvable, politique de sécurité,
// page vide) ; elles reviennent au modèle avec les lignes fautives ; il corrige ; trois tours au plus.
// Le moteur embarqué : une carte d'imports vers esm.sh (MIT) qui donne accès, sans installation ni compilation, aux
// bibliothèques libres listées ci-dessous (licences MIT, Apache-2.0, BSD seulement — vérifiées le 14/10/2026 sur npm).
// Pur : la génération et l'exécution sont injectées (testé en Node).

export type RealizeKind = 'app' | 'data' | 'game' | 'svg' | '3d' | 'doc' | 'video';

export const KIND_LABELS: Record<RealizeKind, string> = {
  app: 'Application',
  data: 'Données & graphiques',
  game: 'Jeu / animation',
  svg: 'Illustration SVG',
  '3d': 'Scène 3D',
  doc: 'Page / document',
  video: 'Vidéo MP4',
};

/** The kind of realization a prompt asks for (the user can always override it). */
export function detectKind(prompt: string, hasData = false): RealizeKind {
  const p = prompt.toLowerCase();
  if (/vid[ée]o|\bclip\b|\bmp4\b|motion design|intro anim[ée]e|g[ée]n[ée]rique|teaser|bande[- ]annonce|spot (publicitaire|pub)|\d+\s*(s|sec|secondes)\b/.test(p)) return 'video';
  if (/\b3d\b|three\.?js|webgl|en trois dimensions|plan[eè]te|syst[eè]me solaire|galaxie|voxel|sc[eè]ne 3d/.test(p)) return '3d';
  if (/\bjeu\b|\bgame\b|snake|serpent|tetris|pong|casse-briques|morpion|plateforme|flappy|sprite|physique|rebond|particules/.test(p)) return 'game';
  if (hasData || /graphique|tableau de bord|dashboard|courbe|histogramme|camembert|donn[ée]es|statistique|kpi|analyse|visualis/.test(p)) return 'data';
  if (/\bsvg\b|logo|illustration|ic[oô]ne|affiche|dessin|diagramme|sch[ée]ma|organigramme|infographie/.test(p)) return 'svg';
  // A described SCENE (a place, a landscape, a moment of light) is an illustration, not an application.
  if (/paysage|cit[ée] |ville|village|ch[âa]teau|for[êe]t|rivi[èe]re|montagne|[îi]le |plage|coucher de soleil|cr[ée]puscule|aube|d[ée]cor|vue a[ée]rienne|panorama|march[ée] |port |jardin|savane|d[ée]sert/.test(p)) return 'svg';
  if (/rapport|article|cv\b|curriculum|lettre|fiche|documentation|page d.accueil|landing|newsletter|menu de restaurant|invitation/.test(p)) return 'doc';
  return 'app';
}

export interface Lib {
  /** Bare specifier usable in `import … from '<name>'`. */
  name: string;
  version: string;
  license: 'MIT' | 'Apache-2.0' | 'BSD-2-Clause' | 'BSD-3-Clause';
  /** What it is for, in a few words (shown to the model). */
  use: string;
  /** Module URL (esm.sh) — or a classic script for the few libraries that are not modules. */
  url: string;
  css?: string;
  kinds: RealizeKind[];
}
const esm = (p: string) => `https://esm.sh/${p}`;
export const LIBRARIES: Lib[] = [
  { name: 'react', version: '19.3.1', license: 'MIT', use: 'interfaces à composants (avec react-dom/client ; JSX interdit : utiliser htm)', url: esm('react@19.3.1'), kinds: ['app', 'data', 'doc'] },
  { name: 'react-dom/client', version: '19.3.1', license: 'MIT', use: 'createRoot pour React', url: esm('react-dom@19.3.1/client?deps=react@19.3.1'), kinds: ['app', 'data', 'doc'] },
  { name: 'htm', version: '3.1.1', license: 'Apache-2.0', use: 'syntaxe proche du JSX sans compilation : const html = htm.bind(React.createElement)', url: esm('htm@3.1.1'), kinds: ['app', 'data', 'doc'] },
  { name: 'preact', version: '11.0.1', license: 'MIT', use: 'alternative légère à React (h, render)', url: esm('preact@11.0.1'), kinds: ['app', 'game'] },
  { name: 'chart.js/auto', version: '4.5.1', license: 'MIT', use: 'graphiques (barres, courbes, secteurs, radar, mixtes) : import Chart from "chart.js/auto"', url: esm('chart.js@4.5.1/auto'), kinds: ['data', 'app', 'doc', 'video'] },
  { name: 'echarts', version: '6.1.0', license: 'Apache-2.0', use: 'graphiques riches et animés (cartes de chaleur, sankey, jauges, treemap) : import * as echarts from "echarts"', url: esm('echarts@6.1.0'), kinds: ['data', 'app'] },
  { name: 'plotly.js-dist-min', version: '4.1.2', license: 'MIT', use: 'graphiques scientifiques et 3D (surface, nuage 3D, statistiques)', url: esm('plotly.js-dist-min@4.1.2'), kinds: ['data'] },
  { name: 'vega-embed', version: '7.3.0', license: 'BSD-3-Clause', use: 'grammaire de graphiques Vega-Lite déclarative : vegaEmbed(el, spec)', url: esm('vega-embed@7.3.0'), kinds: ['data'] },
  { name: 'papaparse', version: '5.7.0', license: 'MIT', use: 'lecture CSV', url: esm('papaparse@5.7.0'), kinds: ['data', 'app'] },
  { name: 'xlsx', version: '0.18.5', license: 'Apache-2.0', use: 'lecture / écriture Excel (export d’un tableau en .xlsx)', url: esm('xlsx@0.18.5'), kinds: ['data', 'app'] },
  { name: 'dayjs', version: '1.11.23', license: 'MIT', use: 'dates (format, différences, calendrier)', url: esm('dayjs@1.11.23'), kinds: ['app', 'data', 'doc'] },
  { name: 'three', version: '0.186.1', license: 'MIT', use: '3D WebGL (scènes, matériaux, lumières) ; contrôles : import { OrbitControls } from "three/addons/controls/OrbitControls.js"', url: esm('three@0.186.1'), kinds: ['3d', 'game', 'video'] },
  { name: 'three/addons/', version: '0.186.1', license: 'MIT', use: 'compléments three.js (OrbitControls, GLTFLoader, EffectComposer…)', url: esm('three@0.186.1/examples/jsm/'), kinds: ['3d', 'game', 'video'] },
  { name: 'cannon-es', version: '0.20.0', license: 'MIT', use: 'physique 3D (gravité, collisions)', url: esm('cannon-es@0.20.0'), kinds: ['3d', 'game', 'video'] },
  { name: 'matter-js', version: '0.20.0', license: 'MIT', use: 'physique 2D (corps rigides, contraintes)', url: esm('matter-js@0.20.0'), kinds: ['game', 'video'] },
  { name: 'pixi.js', version: '8.22.0', license: 'MIT', use: 'rendu 2D WebGL rapide (sprites, particules, jeux)', url: esm('pixi.js@8.22.0'), kinds: ['game', 'video'] },
  { name: 'animejs', version: '4.5.0', license: 'MIT', use: 'animations (DOM, SVG, CSS) : import { animate } from "animejs"', url: esm('animejs@4.5.0'), kinds: ['svg', 'app', 'game', 'doc', 'video'] },
  { name: 'tone', version: '15.1.22', license: 'MIT', use: 'son et musique synthétisés (après un clic de l’utilisateur)', url: esm('tone@15.1.22'), kinds: ['game', 'app'] },
  { name: 'howler', version: '2.2.4', license: 'MIT', use: 'lecture de sons', url: esm('howler@2.2.4'), kinds: ['game'] },
  { name: 'leaflet', version: '1.9.4', license: 'BSD-2-Clause', use: 'cartes interactives (tuiles OpenStreetMap)', url: esm('leaflet@1.9.4'), css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', kinds: ['app', 'data'] },
  { name: 'mermaid', version: '12.2.0', license: 'MIT', use: 'diagrammes depuis du texte (flux, séquence, Gantt, organigramme)', url: esm('mermaid@12.2.0'), kinds: ['svg', 'doc'] },
  { name: 'katex', version: '0.19.0', license: 'MIT', use: 'formules mathématiques', url: esm('katex@0.19.0'), css: 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css', kinds: ['doc'] },
  { name: 'marked', version: '18.1.1', license: 'MIT', use: 'Markdown → HTML', url: esm('marked@18.1.1'), kinds: ['doc', 'app'] },
  { name: 'alpinejs', version: '3.17.4', license: 'MIT', use: 'interactivité déclarative légère (x-data, x-on)', url: esm('alpinejs@3.17.4'), kinds: ['app', 'doc'] },
];
/** Tailwind (MIT) as a classic script — utility classes without a build. */
export const TAILWIND = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3';
export const CDN_HOSTS = ['https://esm.sh', 'https://cdn.jsdelivr.net'];

export function importMap(): { imports: Record<string, string> } {
  return { imports: Object.fromEntries(LIBRARIES.map((l) => [l.name, l.url])) };
}

export interface VideoSpec {
  seconds: number;
  format: '16:9' | '9:16' | '1:1';
}
export const VIDEO_SIZES: Record<VideoSpec['format'], [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

/** Kinds whose result is a PICTURE of the request (a scene, an illustration, a 3D world, a video): checked element by element. */
export const FIDELITY_KINDS: RealizeKind[] = ['svg', '3d', 'video'];
function fidelityRules(kind: RealizeKind): string[] {
  return [
    'FIDÉLITÉ À LA DEMANDE (contrôlée par le bac à sable, au pixel près) :',
    '- Commence le <body> par <script type="application/json" id="realize-spec"> {"elements":[{"name":"…","where":"centre|gauche|droite|haut|bas|premier plan|arrière-plan|partout","size":"petit|moyen|grand","detail":"…"}],"light":"…","view":"…","style":"…"} </script> : le cahier des charges tiré de la demande, avec CHAQUE élément concret qu’elle nomme (mêmes mots que la demande), sa place, sa taille, ses détails (nombre, densité, couleur, matière), la lumière / l’heure, le point de vue.',
    '- Chaque élément du cahier des charges est RÉELLEMENT dessiné et porte data-element="<name>" sur son groupe (<g>, <div>, <section>…) ; en canvas / three.js, expose window.REALIZE_ELEMENTS = ["<name>", …] avec les éléments effectivement rendus.',
    '- Un élément nommé est VISIBLE et RECONNAISSABLE à sa place (pas caché derrière un autre, pas transparent, pas minuscule) ; « dense », « serré », « nombreux » = beaucoup d’objets rapprochés ; une heure du jour fixe la lumière (fin d’après-midi : soleil bas sur l’horizon, lumière dorée rasante, ombres longues dans le même sens).',
    '- Aucun texte, légende ou titre n’annonce ce qui n’est pas dessiné.',
    ...(kind === 'svg' || kind === '3d' || kind === 'video'
      ? ['- Scène : composition en plans (ciel, lointain, plan moyen, premier plan), perspective cohérente (taille décroissante avec la distance, brume atmosphérique au loin), une seule direction de lumière, détails crédibles (créneaux, toits, fenêtres, reflets) — jamais un assemblage de formes plates posées au hasard.']
      : []),
    '',
  ];
}

export function systemPrompt(kind: RealizeKind, opts: { data?: DataInfo | null; video?: VideoSpec } = {}): string {
  const libs = LIBRARIES.filter((l) => l.kinds.includes(kind));
  const others = LIBRARIES.filter((l) => !l.kinds.includes(kind)).map((l) => l.name);
  return [
    `Tu es un ingénieur front-end et designer d’exception. Tu RÉALISES la demande de l’utilisateur sous la forme d’UNE page HTML complète et autonome, exécutée dans un bac à sable isolé. Type de réalisation : ${KIND_LABELS[kind]}.`,
    'Réponds par un seul bloc ```html … ``` contenant tout le document (<!doctype html> … </html>), sans explication autour.',
    '',
    'MOTEUR DISPONIBLE (déjà branché, ne PAS ajouter de carte d’imports) — dans un <script type="module">, importe par leur nom :',
    ...libs.map((l) => `- "${l.name}" (${l.license}) : ${l.use}`),
    `- Aussi disponibles : ${others.join(', ')}.`,
    `- Tailwind : <script src="${TAILWIND}"></script> dans <head> pour les classes utilitaires (facultatif).`,
    'Aucune autre ressource réseau : pas d’autre CDN, pas d’API externe, pas d’image distante (dessine en SVG / canvas, ou utilise des emoji).',
    '',
    ...(FIDELITY_KINDS.includes(kind) ? fidelityRules(kind) : []),
    'RÈGLES DE RÉALISATION :',
    '- Quelque chose de visible et d’utile s’affiche immédiatement (moins de 2 s), même sans interaction.',
    '- Textes en français, mise en page responsive (mobile → grand écran), design soigné : variables CSS, typographie system-ui, espacements généreux, contrastes lisibles, états hover/focus.',
    '- Fonctionnel de bout en bout : chaque bouton fait ce qu’il annonce ; valeurs par défaut réalistes ; gestion des erreurs visible dans la page.',
    '- Interdits dans le bac à sable : alert/prompt/confirm, localStorage/sessionStorage/cookies (garde l’état en mémoire), window.open, formulaires envoyés (utilise preventDefault).',
    '- JSX interdit (pas de compilation) : avec React, utilise htm (`const html = htm.bind(React.createElement)`).',
    '- Animation : requestAnimationFrame ; jamais de boucle while bloquante.',
    ...(kind === '3d' ? ['- 3D : renderer à la taille de la fenêtre (resize géré), OrbitControls, éclairage trois points, ACESFilmicToneMapping, objets visibles depuis la caméra.'] : []),
    ...(kind === 'data' ? ['- Données : titre, indicateurs clés en tuiles, graphiques lisibles (axes, unités, légende), tableau détaillé triable ; formats français (espaces des milliers, virgule décimale).'] : []),
    ...(kind === 'game' ? ['- Jeu : commandes clavier ET tactiles, score, écran de fin avec « Rejouer », vitesse indépendante du nombre d’images par seconde.'] : []),
    ...(kind === 'video'
      ? (() => {
          const v = opts.video ?? { seconds: 15, format: '16:9' as const };
          const [w, h] = VIDEO_SIZES[v.format];
          return [
            `- VIDÉO : la page EST une vidéo de ${v.seconds} secondes, filmée image par image depuis UN SEUL <canvas> (id="video") de ${w}×${h} pixels (format ${v.format}), affiché en entier (CSS : width/height 100 %, object-fit: contain, fond noir).`,
            '- TOUT est dessiné DANS ce canvas : 3D avec three.js (renderer sur ce canvas, setSize(' + w + ', ' + h + ', false)), titres, sous-titres, textes et graphiques animés dessinés dans la scène ou en Canvas 2D par-dessus (un second canvas n’est PAS filmé : compose dans le même). Aucun élément HTML visible hors du canvas.',
            `- Déroulé : démarre tout seul au chargement, animation pilotée par le temps t = (performance.now() − t0) / 1000, découpée en plans (intro, développement, temps fort, fin) ; à t ≥ ${v.seconds} s, reste figée sur la dernière image ; expose window.VIDEO = { duration: ${v.seconds}, width: ${w}, height: ${h} }.`,
            '- Qualité cinéma : mouvements de caméra lents et fluides (easing), éclairage soigné, couleurs harmonieuses, typographie lisible, pas de texte coupé, 30 images par seconde visées.',
            '- Le temps est PILOTÉ par le moteur, image par image : utilise uniquement requestAnimationFrame et performance.now() (jamais new Date() ni setInterval pour animer) ; ainsi chaque image est calculée à son instant exact et la vidéo est parfaitement fluide.',
            '- Pas de son (la vidéo est muette), pas d’interaction requise.',
          ];
        })()
      : []),
    ...(opts.data
      ? [
          '',
          `DONNÉES DE L’UTILISATEUR — disponibles dans la page sous window.DATA (tableau de ${opts.data.rows} objets) et window.DATA_META (colonnes, nom du fichier). Ne les invente pas, ne les recopie pas dans le code : lis window.DATA.`,
          `Colonnes : ${opts.data.columns.map((c) => `${c.name} (${c.type})`).join(', ')}.`,
          `Exemple de ligne : ${JSON.stringify(opts.data.sample)}`,
        ]
      : []),
  ].join('\n');
}

export interface DataInfo {
  name: string;
  rows: number;
  columns: { name: string; type: 'nombre' | 'date' | 'texte' }[];
  sample: Record<string, unknown>;
}
/** Column types and a sample row of tabular data (what the model sees — never the whole file). */
export function describeData(name: string, rows: Record<string, unknown>[]): DataInfo {
  const cols = rows.length ? Object.keys(rows[0]!) : [];
  const typeOf = (c: string): 'nombre' | 'date' | 'texte' => {
    const vals = rows.slice(0, 50).map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== '');
    if (vals.length && vals.every((v) => typeof v === 'number' || (typeof v === 'string' && /^-?[\d\s.,]+$/.test(v.trim()) && /\d/.test(v)))) return 'nombre';
    if (vals.length && vals.every((v) => v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/.test(v)))) return 'date';
    return 'texte';
  };
  return { name, rows: rows.length, columns: cols.map((c) => ({ name: c, type: typeOf(c) })), sample: rows[0] ?? {} };
}

/**
 * The HTML of the answer: the first ```html block, else the first fenced block, else the text. A fence the model did not
 * close (answer cut at the token limit, or simply forgotten) is stripped too — v62: « ```html » showed at the top of
 * the page. When the text holds a whole document, only <!doctype …> … </html> is kept (no prose around it).
 */
export function extractHtml(text: string): string {
  const m = /```html\s*\n([\s\S]*?)```/i.exec(text) ?? /```[a-z]*\s*\n([\s\S]*?)```/i.exec(text);
  let out = (m ? m[1]! : text).trim();
  // Unclosed fence: drop the opening line (and a lone closing fence at the end).
  out = out.replace(/^```[\w-]*[^\n]*\n/, '').replace(/\n?```\s*$/, '').trim();
  const start = out.search(/<!doctype html|<html[\s>]/i);
  const end = out.toLowerCase().lastIndexOf('</html>');
  if (start >= 0 && end > start) out = out.slice(start, end + 7);
  else if (start > 0) out = out.slice(start);
  return out.trim();
}

/**
 * A VIDEO page must be filmable (v62: a page of HTML controls over a 300×150 canvas gave an empty 0,0 Mo MP4 and a
 * frozen preview): its largest canvas must cover at least half of the frame asked. Null when it does.
 */
export function videoProblem(run: RealizeRun, spec: VideoSpec): RealizeError | null {
  const [w, h] = VIDEO_SIZES[spec.format];
  const c = run.stats.canvas;
  if (!run.stats.canvases)
    return { kind: 'video', msg: `ce n’est pas une vidéo : la page n’a aucun <canvas>. Dessine TOUT dans <canvas id="video" width="${w}" height="${h}"> (titres compris), aucun élément HTML visible autour.`, line: null };
  // At least 640×360 worth of pixels, in the asked orientation (± 15 %): the default 300×150 of an unsized canvas fails.
  if (c && (c.w * c.h < 640 * 360 || Math.abs(c.w / c.h / (w / h) - 1) > 0.15))
    return { kind: 'video', msg: `ce n’est pas une vidéo filmable : le plus grand canvas mesure ${c.w}×${c.h} au lieu de ${w}×${h}. Crée <canvas id="video" width="${w}" height="${h}">, rends la scène DEDANS (three.js : renderer sur ce canvas, setSize(${w}, ${h}, false)), sans boutons ni panneaux HTML (la vidéo démarre seule).`, line: null };
  return null;
}

/** Recording formats, best first: MP4 (H.264) where the browser records it (Chrome / Edge ≥ 126, Safari), WebM otherwise. */
export const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
/** Extension of a recorded video from its mime type. */
export const videoExt = (mime: string) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');

/**
 * The bridge, run first inside the sandbox: forwards every real error (with its line), the console, blocked calls and
 * the final measurements (visible elements, text, canvases, SVG) to the app. Written without « // » comments and with
 * explicit semicolons: it is injected on ONE line.
 */
export const BRIDGE = [
  '(function(){',
  `var VIDEO_TYPES=${JSON.stringify(VIDEO_TYPES)};`,
  'var P=function(m){try{m.t=window.__RZ_TOKEN;parent.postMessage(m,"*",m.bitmap?[m.bitmap]:[]);}catch(e){}};',
  'var RST=window.setTimeout.bind(window);var start=Date.now();',
  'var REC0=window.__RZ_REC;var VT=null;',
  'if(REC0&&REC0.exact){VT={now:0,raf:[],timers:[],id:1};var pn=performance.now.bind(performance);var base=Date.now();performance.now=function(){return VT.now;};Date.now=function(){return base+VT.now;};window.requestAnimationFrame=function(cb){var id=VT.id++;VT.raf.push({id:id,cb:cb});return id;};window.cancelAnimationFrame=function(id){VT.raf=VT.raf.filter(function(r){return r.id!==id;});};var addT=function(cb,ms,every,args){var id=VT.id++;VT.timers.push({id:id,at:VT.now+Math.max(0,ms||0),every:every?Math.max(1,ms||0):0,cb:cb,args:args});return id;};window.setTimeout=function(cb,ms){return addT(cb,ms,false,[].slice.call(arguments,2));};window.setInterval=function(cb,ms){return addT(cb,ms,true,[].slice.call(arguments,2));};window.clearTimeout=window.clearInterval=function(id){VT.timers=VT.timers.filter(function(t){return t.id!==id;});};}',
  'var vstep=function(now){VT.now=now;var guard=0;while(guard++<1000){var due=VT.timers.filter(function(t){return t.at<=VT.now;});if(!due.length){break;}due.sort(function(a,b){return a.at-b.at;});var t=due[0];if(t.every){t.at+=t.every;}else{VT.timers=VT.timers.filter(function(x){return x!==t;});}try{if(typeof t.cb==="function"){t.cb.apply(window,t.args||[]);}}catch(err){P({rz:"err",kind:"runtime",msg:String(err&&err.message||err),line:null});}}var cbs=VT.raf;VT.raf=[];for(var i=0;i<cbs.length;i++){try{cbs[i].cb(VT.now);}catch(err){P({rz:"err",kind:"runtime",msg:String(err&&err.message||err),line:null});}}try{document.getAnimations().forEach(function(a){a.pause();a.currentTime=VT.now;});}catch(_){}};',
  'var bigCanvas=function(){var cs=[].slice.call(document.querySelectorAll("canvas")).filter(function(c){return c.width>10&&c.height>10;}).sort(function(a,b){return b.width*b.height-a.width*a.height;});return cs[0]||null;};',
  'var EXACT=function(ms,fps){var c=bigCanvas();if(!c){P({rz:"video",error:"nocanvas"});return;}var n=Math.max(1,Math.round(ms*fps/1000));var i=0;var next=function(){if(i>=n){P({rz:"video-done",frames:n,width:c.width,height:c.height});return;}vstep(i*1000/fps);var k=i;i++;createImageBitmap(c).then(function(b){P({rz:"frame",i:k,n:n,bitmap:b});}).catch(function(err){P({rz:"video",error:String(err&&err.message||err)});});};window.addEventListener("message",function(e){if(e.data&&e.data.rz==="next"){next();}});next();};',
  'window.addEventListener("error",function(e){var t=e.target;if(t&&t!==window&&t.tagName&&/^(SCRIPT|LINK|IMG|AUDIO|VIDEO)$/.test(t.tagName)){P({rz:"err",kind:"resource",msg:(t.tagName==="SCRIPT"&&!t.src)?"un module importé par un <script type=module> n’a pas pu être chargé (bibliothèque absente du moteur, ou réseau coupé)":"ressource introuvable : "+(t.src||t.href||t.tagName),line:null});return;}P({rz:"err",kind:"runtime",msg:String(e.message||(e.error&&e.error.message)||"erreur"),line:e.lineno||null});},true);',
  'window.addEventListener("unhandledrejection",function(e){var r=e.reason;P({rz:"err",kind:"promise",msg:"promesse rejetée : "+String((r&&r.message)||r),line:null});});',
  'document.addEventListener("securitypolicyviolation",function(e){P({rz:"err",kind:"csp",msg:"Content Security Policy : "+e.violatedDirective+" "+(e.blockedURI||""),line:e.lineNumber||null});});',
  '["error","warn","log","info"].forEach(function(k){var o=console[k];console[k]=function(){try{var a=[].slice.call(arguments).map(function(x){try{return typeof x==="string"?x:((x&&x.stack)||JSON.stringify(x));}catch(_){return String(x);}}).join(" ");P({rz:"console",level:k,msg:a.slice(0,600)});}catch(_){}return o.apply(console,arguments);};});',
  '["alert","confirm","prompt"].forEach(function(k){window[k]=function(){P({rz:"err",kind:"blocked",msg:k+"() est bloqué dans le bac à sable",line:null});return null;};});',
  'var tagged=function(){var out={};var ref=null;var big=0;[].slice.call(document.querySelectorAll("svg,canvas")).forEach(function(x){var r=x.getBoundingClientRect();if(r.width*r.height>big&&!(x.parentElement&&x.parentElement.closest("svg"))){big=r.width*r.height;ref=r;}});var vw=window.innerWidth||1,vh=window.innerHeight||1;if(!ref||big<vw*vh*0.15){ref={left:0,top:0,width:vw,height:vh};}[].slice.call(document.querySelectorAll("[data-element]")).forEach(function(el){var n=(el.getAttribute("data-element")||"").trim();if(!n){return;}var r=el.getBoundingClientRect();var cs=getComputedStyle(el);var op=parseFloat(cs.opacity||"1");if(cs.visibility==="hidden"||cs.display==="none"){op=0;}var x0=Math.max(r.left,ref.left),y0=Math.max(r.top,ref.top),x1=Math.min(r.right,ref.left+ref.width),y1=Math.min(r.bottom,ref.top+ref.height);var a=Math.max(0,x1-x0)*Math.max(0,y1-y0)/(ref.width*ref.height)*Math.min(1,op*1.25);var o=out[n]||(out[n]={name:n,area:0,cx:0,cy:0,w:0});if(a>0){o.cx=(o.cx*o.w+((x0+x1)/2-ref.left)/ref.width*a)/(o.w+a);o.cy=(o.cy*o.w+((y0+y1)/2-ref.top)/ref.height*a)/(o.w+a);o.w+=a;}o.area=Math.min(1,o.area+a);});return Object.keys(out).map(function(k){var o=out[k];return {name:o.name,area:Math.round(o.area*10000)/10000,cx:Math.round(o.cx*100)/100,cy:Math.round(o.cy*100)/100};});};',
  'var measure=function(){var b=document.body;var els=b?b.querySelectorAll("*"):[];var vis=0;for(var i=0;i<els.length&&i<5000;i++){var r=els[i].getBoundingClientRect();if(r.width>2&&r.height>2){vis++;}}P({rz:"stats",elements:vis,text:b?(b.innerText||"").trim().length:0,canvases:document.querySelectorAll("canvas").length,canvas:(function(){var c=bigCanvas();return c?{w:c.width,h:c.height}:null;})(),spec:(function(){var e=document.getElementById("realize-spec");return e?(e.textContent||"").slice(0,4000):null;})(),tagged:(function(){try{return tagged();}catch(_){return [];}})(),declared:(function(){try{var d=window.REALIZE_ELEMENTS;return Array.isArray(d)?d.map(function(x){return String(x&&x.name||x);}).slice(0,60):null;}catch(_){return null;}})(),svgs:document.querySelectorAll("svg").length,ms:Date.now()-start,loading:document.readyState!=="complete"});};',
  'var REC=function(ms,fps){var cs=[].slice.call(document.querySelectorAll("canvas")).filter(function(c){return c.width>10&&c.height>10;}).sort(function(a,b){return b.width*b.height-a.width*a.height;});if(!cs.length){P({rz:"video",error:"nocanvas"});return;}var c=cs[0];var mime="";for(var i=0;i<VIDEO_TYPES.length;i++){if(window.MediaRecorder&&MediaRecorder.isTypeSupported(VIDEO_TYPES[i])){mime=VIDEO_TYPES[i];break;}}if(!mime){P({rz:"video",error:"norecorder"});return;}var rec=new MediaRecorder(c.captureStream(fps||30),{mimeType:mime,videoBitsPerSecond:8000000});var parts=[];rec.ondataavailable=function(ev){if(ev.data&&ev.data.size){parts.push(ev.data);}};rec.onstop=function(){P({rz:"video",blob:new Blob(parts,{type:mime.split(";")[0]}),mime:mime,width:c.width,height:c.height});};rec.start(250);setTimeout(function(){rec.stop();},ms);};',
  'window.addEventListener("message",function(e){if(e.data&&e.data.rz==="measure"){measure();}if(e.data&&e.data.rz==="record"){try{REC(e.data.ms||8000,e.data.fps||30);}catch(err){P({rz:"video",error:String(err&&err.message||err)});}}});',
  'window.addEventListener("load",function(){if(window.__RZ_REC){try{if(window.__RZ_REC.exact){vstep(0);RST(function(){EXACT(window.__RZ_REC.ms,window.__RZ_REC.fps||30);},50);}else{REC(window.__RZ_REC.ms,window.__RZ_REC.fps||30);}}catch(err){P({rz:"video",error:String(err&&err.message||err)});}}RST(measure,1200);});',
  '})();',
].join('');

// ── FIDÉLITÉ : the request's items, the page's spec, what is really visible ─────────────────────────────────────────
const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOPW = new Set(['un', 'une', 'des', 'le', 'la', 'les', 'l', 'du', 'de', 'd', 'avec', 'et', 'ou', 'son', 'sa', 'ses', 'leur', 'leurs', 'au', 'aux', 'en', 'tres', 'plein', 'pleine', 'beaucoup', 'quelques', 'plusieurs', 'petit', 'petite', 'petits', 'petites', 'grand', 'grande', 'grands', 'grandes', 'joli', 'jolie', 'beau', 'belle', 'beaux', 'belles', 'on', 'y', 'voit', 'qui', 'que', 'dont', 'sur', 'sous', 'pres', 'autour']);
const CIRCUM = /^(a|au|aux|en|vers|dans|sous|pendant|par|lors|le soir|le matin|la nuit|de nuit|de jour)\b/;
/** The concrete items a request names (« château central », « rivière »…) and its circumstances (« à la fin d’après-midi »). */
export function promptItems(prompt: string): { items: { text: string; head: string }[]; circumstances: string[] } {
  // The FORMAT words (« une vidéo de 15 secondes », « dessine-moi une illustration de ») are not elements of the scene.
  const body = prompt
    .replace(/^\s*(dessine|fais|cr[ée]e|g[ée]n[èe]re|montre|r[ée]alise|imagine)[- ]?(moi|nous)?\s*/i, '')
    .replace(/\b(une?|la|le)\s+(vid[ée]o|illustration|image|sc[èe]ne|vue|animation|dessin|film|clip|affiche|page)(\s+(3d|anim[ée]e|svg|r[ée]aliste))?(\s+de\s+\d+\s*(secondes?|sec|minutes?|min|s)\b)?\s*(de |d['’]|:|—|-)?/gi, ' ');
  const segs = body.split(/[,;:\n]| et | avec | ainsi que | entour[ée]e? de | o[uù] /i).map((x) => x.trim()).filter(Boolean);
  const items: { text: string; head: string }[] = [];
  const circumstances: string[] = [];
  for (const seg of segs) {
    const f = fold(seg);
    if (!f) continue;
    if (CIRCUM.test(f)) {
      circumstances.push(seg);
      continue;
    }
    const head = f.split(' ').find((w) => w.length >= 3 && !STOPW.has(w));
    if (head && !items.some((i) => i.head === head)) items.push({ text: seg, head });
  }
  return { items: items.slice(0, 16), circumstances };
}
const stem = (w: string) => fold(w).replace(/(x|s)$/, '').replace(/e$/, '');
const mentions = (text: string, head: string) => fold(text).split(' ').some((w) => w.length >= 3 && (stem(w) === stem(head) || (stem(head).length >= 5 && stem(w).startsWith(stem(head).slice(0, 5)))));
type SpecEl = { name: string; where?: string; size?: string };
function parseSpec(raw: string | null | undefined): { elements: SpecEl[]; light: string; view: string } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { elements?: unknown; light?: unknown; view?: unknown; time?: unknown };
    const elements = (Array.isArray(o.elements) ? o.elements : [])
      .map((e) => (typeof e === 'string' ? { name: e } : (e as SpecEl)))
      .filter((e) => e && typeof e.name === 'string' && e.name.trim())
      .slice(0, 40);
    return { elements, light: `${String(o.light ?? '')} ${String(o.time ?? '')}`.trim(), view: String(o.view ?? '') };
  } catch {
    return null;
  }
}
/** Where an element must stand (fractions of the scene): centre, left, right, top, bottom. */
function placeIssue(where: string | undefined, cx: number, cy: number): string | null {
  const w = fold(where ?? '');
  if (!w || /partout|libre/.test(w)) return null;
  if (/centr|milieu/.test(w) && (cx < 0.28 || cx > 0.72 || cy < 0.15 || cy > 0.85)) return 'au centre';
  if (/gauche/.test(w) && cx > 0.55) return 'à gauche';
  if (/droite/.test(w) && cx < 0.45) return 'à droite';
  if (/(haut|ciel)/.test(w) && cy > 0.6) return 'en haut';
  if (/(bas|premier plan|avant plan)/.test(w) && cy < 0.4) return 'en bas / au premier plan';
  return null;
}
/**
 * PRECISION CHECK (v62 — « l’interprétation du prompt doit être encore plus précise »): the page's own spec must cover
 * every item the request names, and every spec element must really be visible at its place. Returns the problems.
 */
export function fidelityProblems(prompt: string, run: RealizeRun): RealizeError[] {
  const out: RealizeError[] = [];
  const spec = parseSpec(run.stats.spec);
  if (!spec || !spec.elements.length) {
    out.push({ kind: 'spec', msg: 'cahier des charges absent : ajoute <script type="application/json" id="realize-spec"> avec chaque élément nommé par la demande, puis data-element sur chacun.', line: null });
    return out;
  }
  const { items, circumstances } = promptItems(prompt);
  for (const it of items)
    if (!spec.elements.some((e) => mentions(e.name, it.head) || mentions(`${e.name} ${(e as { detail?: string }).detail ?? ''}`, it.head)))
      out.push({ kind: 'spec', msg: `la demande nomme « ${it.text} » : aucun élément du cahier des charges ne le représente — ajoute-le et dessine-le.`, line: null });
  for (const c of circumstances) {
    const words = fold(c).split(' ').filter((w) => w.length >= 4 && !STOPW.has(w));
    if (words.length && !words.some((w) => mentions(`${spec.light} ${spec.view}`, w))) out.push({ kind: 'spec', msg: `la demande précise « ${c} » : le cahier des charges (light / view) ne le reprend pas — la lumière et le point de vue doivent le montrer.`, line: null });
  }
  const tagged = run.stats.tagged ?? [];
  const declared = run.stats.declared ?? null;
  const canvasOnly = !tagged.length && (run.stats.canvases ?? 0) > 0;
  for (const e of spec.elements) {
    const t = tagged.find((x) => fold(x.name) === fold(e.name));
    if (canvasOnly) {
      if (!declared?.some((d) => fold(d) === fold(e.name))) out.push({ kind: 'spec', msg: `« ${e.name} » n’est pas déclaré rendu (window.REALIZE_ELEMENTS) : dessine-le dans la scène et déclare-le.`, line: null });
      continue;
    }
    if (!t) {
      out.push({ kind: 'spec', msg: `« ${e.name} » (cahier des charges) n’a aucun élément data-element="${e.name}" dans la page : dessine-le et marque-le.`, line: null });
      continue;
    }
    const min = /petit/.test(fold(e.size ?? '')) ? 0.0008 : /grand/.test(fold(e.size ?? '')) ? 0.03 : 0.004;
    if (t.area < min) out.push({ kind: 'spec', msg: `« ${e.name} » est presque invisible : ${(t.area * 100).toFixed(2)} % de la scène${e.size ? ` alors qu’il est « ${e.size} »` : ''} — agrandis-le, sors-le de derrière les autres, rends-le opaque.`, line: null });
    else {
      const p = placeIssue(e.where, t.cx, t.cy);
      if (p) out.push({ kind: 'spec', msg: `« ${e.name} » doit être ${p} : son centre est à ${Math.round(t.cx * 100)} % de largeur, ${Math.round(t.cy * 100)} % de hauteur.`, line: null });
    }
  }
  return out.slice(0, 10);
}

/** Library names a page imports (for the badges and the telemetry). */
export function librariesUsed(code: string): string[] {
  const specs = [...code.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]!);
  const names = LIBRARIES.map((l) => l.name).sort((a, b) => b.length - a.length); // the most specific first
  const used = new Set<string>();
  for (const s of specs) {
    const hit = names.find((n) => s === n || (n.endsWith('/') ? s.startsWith(n) : s.startsWith(`${n}/`)));
    if (hit) used.add(hit.replace(/\/$/, ''));
  }
  if (code.includes(TAILWIND) || /@tailwindcss\/browser/.test(code)) used.add('tailwind');
  return [...used];
}

/** Verdict of a run from what the bridge reported (pure: the runner only collects). */
export function verdict(errors: RealizeError[], warnings: string[], stats: (Omit<RealizeRun['stats'], 'libs'> & { loading?: boolean }) | null, code: string): RealizeRun {
  const errs = [...errors];
  const warns = [...warnings];
  if (stats?.loading) errs.push({ kind: 'timeout', msg: 'la page chargeait encore ses bibliothèques au moment de la mesure (réseau lent ou bloqué)', line: null });
  const st = stats ?? { elements: 0, text: 0, canvases: 0, svgs: 0, ms: 0 };
  if (!stats) errs.push({ kind: 'timeout', msg: 'la page ne s’est pas chargée à temps (bibliothèque injoignable, réseau coupé ou script bloquant)', line: null });
  // An empty page whose libraries did not arrive is a network failure, not an empty design.
  else if (st.text === 0 && st.canvases === 0 && st.svgs === 0 && st.elements < 2 && !errs.some((e) => e.kind === 'resource' || e.kind === 'timeout'))
    errs.push({ kind: 'empty', msg: 'la page est vide : rien de visible ne s’affiche', line: null });
  // Duplicates (the same error at every frame) are reported once.
  const seen = new Set<string>();
  const unique = errs.filter((e) => {
    const k = `${e.kind}|${e.msg}|${e.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { loading: _loading, ...measures } = st as typeof st & { loading?: boolean };
  return { ok: unique.length === 0, errors: unique, warnings: [...new Set(warns)].slice(0, 10), stats: { ...measures, libs: librariesUsed(code) } };
}

/**
 * The document run in the sandbox: the model's HTML with, injected ON ONE LINE right after <head> (so the line
 * numbers of the model's code are unchanged): the security policy, the import map (merged with one the model may have
 * written), the bridge and the user's data. A fragment without <html> is wrapped first.
 */
export function buildDocument(html: string, o: { bridge?: string; data?: unknown; meta?: unknown; token?: string; record?: { ms: number; fps?: number; exact?: boolean } }): string {
  let doc = html.trim();
  if (!/<html[\s>]/i.test(doc)) doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body>${doc}</body></html>`;
  // A model-written import map is merged into ours (only one map is allowed before the first module).
  const map = importMap();
  doc = doc.replace(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi, (_m, body: string) => {
    try {
      const extra = JSON.parse(body) as { imports?: Record<string, string> };
      for (const [k, v] of Object.entries(extra.imports ?? {})) if (/^https:\/\/(esm\.sh|cdn\.jsdelivr\.net)\//.test(v)) map.imports[k] = v;
    } catch {
      /* invalid map: dropped, ours stays */
    }
    return '';
  });
  if (!/<head[\s>]/i.test(doc)) doc = doc.replace(/<html([^>]*)>/i, '<html$1><head></head>');
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: data: ${CDN_HOSTS.join(' ')}`,
    `style-src 'unsafe-inline' ${CDN_HOSTS.join(' ')}`,
    `font-src data: ${CDN_HOSTS.join(' ')}`,
    'img-src data: blob: https://*.tile.openstreetmap.org',
    `connect-src data: blob: ${CDN_HOSTS.join(' ')}`,
    'media-src data: blob:',
    'worker-src blob:',
  ].join('; ');
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script').replace(/\n/g, ' ');
  const inject =
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<script type="importmap">${safe(JSON.stringify(map))}</script>` +
    `<script>window.__RZ_TOKEN=${JSON.stringify(o.token ?? '')};${o.record ? `window.__RZ_REC=${JSON.stringify(o.record)};` : ''}${o.data !== undefined ? `window.DATA=${safe(JSON.stringify(o.data))};window.DATA_META=${safe(JSON.stringify(o.meta ?? null))};` : ''}</script>` +
    `<script>${safe(o.bridge ?? BRIDGE)}</script>`;
  return doc.replace(/<head([^>]*)>/i, (m) => m + inject);
}

export interface RealizeError {
  kind: 'runtime' | 'promise' | 'console' | 'resource' | 'csp' | 'empty' | 'timeout' | 'blocked' | 'video' | 'spec';
  msg: string;
  line: number | null;
}
export interface RealizeRun {
  ok: boolean;
  errors: RealizeError[];
  warnings: string[];
  stats: {
    elements: number;
    text: number;
    canvases: number;
    svgs: number;
    ms: number;
    libs: string[];
    canvas?: { w: number; h: number } | null;
    /** The page's own spec (realize-spec JSON), as written. */
    spec?: string | null;
    /** Tagged elements measured in the page: visible share of the scene and centre (fractions 0–1). */
    tagged?: { name: string; area: number; cx: number; cy: number }[];
    /** Elements a canvas / three.js page says it rendered (window.REALIZE_ELEMENTS). */
    declared?: string[];
  };
}
export interface RealizeRound {
  round: number;
  code: string;
  run: RealizeRun;
  feedback: string;
}

export function linesAround(code: string, line: number, span = 2): string {
  const ls = code.split('\n');
  const a = Math.max(1, line - span);
  const b = Math.min(ls.length, line + span);
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(`${i === line ? '>>' : '  '} ${String(i).padStart(3)} | ${ls[i - 1]}`);
  return out.join('\n');
}

const HINTS: [RegExp, string][] = [
  [/Failed to resolve module specifier|bare specifier/i, 'Importe seulement les noms du MOTEUR DISPONIBLE (ex. "chart.js/auto", "three", "three/addons/controls/OrbitControls.js").'],
  [/Content Security Policy|Refused to (load|connect|execute)/i, 'Le bac à sable n’autorise que esm.sh et cdn.jsdelivr.net : retire tout autre lien réseau (dessine en SVG/canvas au lieu d’images distantes).'],
  [/localStorage|sessionStorage|document\.cookie|SecurityError/i, 'Le stockage du navigateur est bloqué dans le bac à sable : garde l’état dans des variables JavaScript.'],
  [/alert|confirm|prompt\b|showModal|modal/i, 'alert/confirm/prompt sont bloqués : affiche les messages dans la page.'],
  [/is not defined/i, 'Déclare la variable ou importe le module correspondant dans le <script type="module">.'],
  [/Unexpected token '<'|JSX/i, 'Pas de JSX : utilise htm (`const html = htm.bind(React.createElement)`).'],
  [/Cannot read properties of null|is null/i, 'L’élément visé n’existe pas encore : exécute le script après le HTML (fin de <body>) ou vérifie l’id.'],
];

/** The correction message: every real error, the faulty lines, targeted hints. */
export function realizeFeedback(code: string, run: RealizeRun): string {
  const errs = run.errors.slice(0, 8).map((e, i) => `${i + 1}. [${e.kind}] ${e.msg}${e.line ? `\n${linesAround(code, e.line)}` : ''}`);
  const all = run.errors.map((e) => e.msg).join(' ');
  const hints = HINTS.filter(([re]) => re.test(all)).map(([, h]) => `- ${h}`);
  const fidelity = run.errors.length > 0 && run.errors.every((e) => e.kind === 'spec' || e.kind === 'video');
  return [
    fidelity
      ? 'Ta page s’exécute, mais elle ne réalise pas EXACTEMENT la demande. Écarts mesurés dans la page :'
      : 'Ta page a échoué dans le bac à sable. Erreurs réelles relevées pendant l’exécution :',
    ...errs,
    ...(run.warnings.length ? ['Avertissements :', ...run.warnings.slice(0, 4).map((w) => `- ${w}`)] : []),
    ...(hints.length ? ['Pistes :', ...hints] : []),
    '',
    fidelity
      ? 'Corrige chaque écart (élément ajouté, agrandi, déplacé, rendu visible ; cahier des charges complété) sans rien retirer, et renvoie le document COMPLET dans un seul bloc ```html.'
      : 'Corrige la CAUSE sans retirer de fonctionnalité demandée, et renvoie le document COMPLET corrigé dans un seul bloc ```html.',
  ].join('\n');
}

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

/** A failure that only the network explains (libraries that did not arrive): not a code error to send to the model. */
export function networkOnly(run: RealizeRun, code: string): boolean {
  return (
    !run.ok &&
    run.errors.length > 0 &&
    run.errors.every((e) => e.kind === 'resource' || e.kind === 'timeout') &&
    /\bfrom\s*["'][^"']+["']|import\s*\(|<script[^>]+src=["']https:/.test(code)
  );
}

/** prompt → page → exécution → (erreurs → correction → exécution)… au plus maxRounds exécutions. */
export async function realizeWithCorrection(o: {
  prompt: string;
  kind: RealizeKind;
  data?: DataInfo | null;
  video?: VideoSpec;
  generate: (messages: Msg[]) => Promise<string>;
  run: (html: string) => Promise<RealizeRun>;
  maxRounds?: number;
  onRound?: (r: RealizeRound) => void;
  /** Page to start from (iterating on an existing realization). */
  base?: string;
}): Promise<{ ok: boolean; rounds: RealizeRound[]; code: string; network?: boolean }> {
  const maxRounds = Math.max(1, o.maxRounds ?? 3);
  const messages: Msg[] = [
    { role: 'system', content: systemPrompt(o.kind, { data: o.data, video: o.video }) },
    { role: 'user', content: o.base ? `Page actuelle :\n\`\`\`html\n${o.base}\n\`\`\`\n\nModification demandée : ${o.prompt}` : o.prompt },
  ];
  const rounds: RealizeRound[] = [];
  let feedback = '';
  for (let r = 1; r <= maxRounds; r++) {
    const code = extractHtml(await o.generate(messages));
    const run = await o.run(code);
    // A video page that cannot be filmed is a failure to correct, not a success (it would give an empty MP4).
    const vp = o.kind === 'video' && run.ok && o.video ? videoProblem(run, o.video) : null;
    if (vp) {
      run.ok = false;
      run.errors.push(vp);
    }
    // FIDELITY: what the request names is in the page, visible, at its place (data dashboards are checked by their data).
    if (run.ok && FIDELITY_KINDS.includes(o.kind) && !o.base) {
      const fp = fidelityProblems(o.prompt, run);
      if (fp.length && r < maxRounds) {
        run.ok = false;
        run.errors.push(...fp);
      } else if (fp.length) run.warnings.push(...fp.map((e) => `fidélité : ${e.msg}`));
    }
    const round = { round: r, code, run, feedback };
    rounds.push(round);
    o.onRound?.(round);
    if (run.ok) return { ok: true, rounds, code };
    // The network, not the code: asking the model to « fix » it would cost tokens and change nothing.
    if (networkOnly(run, code)) return { ok: false, rounds, code, network: true };
    feedback = realizeFeedback(code, run);
    messages.push({ role: 'assistant', content: `\`\`\`html\n${code}\n\`\`\`` }, { role: 'user', content: feedback });
  }
  return { ok: false, rounds, code: rounds[rounds.length - 1]!.code };
}
