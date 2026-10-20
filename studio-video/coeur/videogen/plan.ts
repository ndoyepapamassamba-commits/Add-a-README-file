// GÉNÉRATEUR VIDÉO « Image / Idée → Scène 3D → Animation → Vidéo » — le PLAN DE SCÈNE, langage commun entre la
// compréhension (modèle de langage, vision) et les moteurs de rendu (Blender au centre, WebGL en aperçu). Une intention
// créative devient un plan validé : décor, accessoires, personnages riggés, actions et expressions minutées, plans de
// caméra, titres, lumière, durée et format. Pur et déterministe (testé en Node) ; le modèle propose, le code valide et
// répare (durées, identifiants, vocabulaire), jamais l'inverse.
import { z } from 'zod';

export const ENV_PRESETS = ['african_city', 'city', 'night_city', 'bank_lobby', 'office', 'market', 'village', 'beach', 'savanna', 'forest', 'desert', 'stadium', 'studio', 'space'] as const;
export const PROP_KINDS = ['building', 'tree', 'palm', 'baobab', 'hut', 'car', 'bench', 'lamp', 'rock', 'crate', 'desk', 'screen', 'stall', 'flag', 'planet', 'column', 'plant', 'counter'] as const;
export const ACTIONS = ['idle', 'walk', 'run', 'wave', 'jump', 'dance', 'sit', 'talk', 'point', 'celebrate', 'look', 'turn', 'clap', 'bow', 'fall'] as const;
export const EMOTIONS = ['neutral', 'happy', 'sad', 'surprised', 'angry', 'thinking'] as const;
export const CAMERA_MOVES = ['static', 'dolly_in', 'dolly_out', 'orbit', 'crane_up', 'crane_down', 'pan_left', 'pan_right', 'tracking', 'aerial_flyover', 'push_in_low', 'handheld'] as const;
export const LOOKS = ['cinematic', 'cartoon', 'lowpoly', 'clay', 'neon'] as const;
export const TIMES = ['dawn', 'day', 'golden', 'dusk', 'night'] as const;
export const KINDS = ['human', 'child', 'robot', 'animal'] as const;
export type EnvPreset = (typeof ENV_PRESETS)[number];
export type Action = (typeof ACTIONS)[number];
export type CameraMove = (typeof CAMERA_MOVES)[number];
export type VideoFormat = '16:9' | '9:16' | '1:1';
export const FORMAT_SIZE: Record<VideoFormat, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const xz = z.tuple([z.number(), z.number()]);
export const PlanSchema = z.object({
  title: z.string().min(1).max(120),
  logline: z.string().max(400).default(''),
  seconds: z.number().min(2).max(120),
  format: z.enum(['16:9', '9:16', '1:1']),
  style: z.object({
    look: z.enum(LOOKS),
    palette: z.array(hex).min(2).max(6),
    timeOfDay: z.enum(TIMES),
    weather: z.enum(['clear', 'fog', 'rain']).default('clear'),
  }),
  environment: z.object({
    preset: z.enum(ENV_PRESETS),
    ground: hex,
    props: z.array(z.object({ kind: z.enum(PROP_KINDS), count: z.number().int().min(1).max(60), color: hex.optional() })).max(12),
  }),
  characters: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),
        name: z.string().max(40),
        kind: z.enum(KINDS),
        height: z.number().min(0.3).max(3),
        colors: z.object({ skin: hex, top: hex, bottom: hex, accent: hex }),
        start: xz,
        facing: z.number(),
      }),
    )
    .max(8),
  shots: z
    .array(
      z.object({
        id: z.string(),
        start: z.number().min(0),
        duration: z.number().min(0.5),
        camera: z.object({ move: z.enum(CAMERA_MOVES), target: z.string(), lens: z.number().min(14).max(200), height: z.enum(['low', 'eye', 'high', 'aerial']) }),
        actions: z
          .array(
            z.object({
              who: z.string(),
              action: z.enum(ACTIONS),
              at: z.number().min(0).default(0),
              duration: z.number().min(0.2).optional(),
              to: xz.optional(),
              emotion: z.enum(EMOTIONS).default('neutral'),
            }),
          )
          .max(16),
        caption: z.string().max(140).optional(),
      }),
    )
    .min(1)
    .max(16),
  titles: z.array(z.object({ text: z.string().min(1).max(80), start: z.number().min(0), duration: z.number().min(0.5), position: z.enum(['center', 'bottom', 'top']) })).max(6),
  source: z.object({ kind: z.enum(['idea', 'text', 'storyboard', 'image']), note: z.string().max(600).optional() }).default({ kind: 'idea' }),
});
export type ScenePlan = z.infer<typeof PlanSchema>;
export type Shot = ScenePlan['shots'][number];
export type Character = ScenePlan['characters'][number];

// ── vocabulary for the model and for the heuristic understanding ───────────────────────────────────────────────────
const ENV_WORDS: [RegExp, EnvPreset][] = [
  [/espace|galaxie|plan[eè]te|cosmos|fus[ée]e|lune|mars\b/, 'space'],
  [/banque|agence bancaire|guichet|hall/, 'bank_lobby'],
  [/bureau|open space|r[ée]union|entreprise|startup/, 'office'],
  [/\bmarchés?\b|sandaga|souk|\bétals?\b/, 'market'],
  [/village|case|brousse/, 'village'],
  [/plage|mer|oc[ée]an|corniche|vague/, 'beach'],
  [/savane|safari|lion|girafe|z[èe]bre|baobab/, 'savanna'],
  [/for[eê]t|jungle|bois\b/, 'forest'],
  [/d[ée]sert|dune|sahara/, 'desert'],
  [/stade|match|football|foot\b|terrain/, 'stadium'],
  [/studio|plateau|pr[ée]sentation|produit|logo/, 'studio'],
  [/nuit|n[ée]on|cyberpunk|nocturne/, 'night_city'],
  [/dakar|abidjan|lagos|bamako|ville africaine|afrique/, 'african_city'],
  [/ville|rue|cit[ée]|m[ée]gapole|gratte-ciel|immeuble/, 'city'],
];
const ENV_PROPS: Record<EnvPreset, ScenePlan['environment']['props']> = {
  african_city: [{ kind: 'building', count: 14 }, { kind: 'palm', count: 6 }, { kind: 'car', count: 3 }, { kind: 'lamp', count: 4 }],
  city: [{ kind: 'building', count: 18 }, { kind: 'tree', count: 6 }, { kind: 'car', count: 4 }, { kind: 'lamp', count: 6 }],
  night_city: [{ kind: 'building', count: 22 }, { kind: 'lamp', count: 10 }, { kind: 'car', count: 4 }],
  bank_lobby: [{ kind: 'column', count: 6 }, { kind: 'counter', count: 2 }, { kind: 'screen', count: 3 }, { kind: 'plant', count: 4 }, { kind: 'bench', count: 2 }],
  office: [{ kind: 'desk', count: 6 }, { kind: 'screen', count: 6 }, { kind: 'plant', count: 4 }],
  market: [{ kind: 'stall', count: 8 }, { kind: 'crate', count: 10 }, { kind: 'palm', count: 3 }],
  village: [{ kind: 'hut', count: 7 }, { kind: 'baobab', count: 2 }, { kind: 'tree', count: 6 }, { kind: 'rock', count: 5 }],
  beach: [{ kind: 'palm', count: 9 }, { kind: 'rock', count: 6 }, { kind: 'bench', count: 2 }],
  savanna: [{ kind: 'baobab', count: 4 }, { kind: 'tree', count: 8 }, { kind: 'rock', count: 8 }],
  forest: [{ kind: 'tree', count: 40 }, { kind: 'rock', count: 10 }, { kind: 'plant', count: 12 }],
  desert: [{ kind: 'rock', count: 14 }, { kind: 'palm', count: 3 }],
  stadium: [{ kind: 'flag', count: 6 }, { kind: 'lamp', count: 4 }, { kind: 'bench', count: 6 }],
  studio: [{ kind: 'screen', count: 2 }, { kind: 'plant', count: 2 }],
  space: [{ kind: 'planet', count: 5 }, { kind: 'rock', count: 12 }],
};
const ENV_GROUND: Record<EnvPreset, string> = {
  african_city: '#b9906a', city: '#55595f', night_city: '#1d2230', bank_lobby: '#d9d2c5', office: '#c9c4bb', market: '#b48a5c', village: '#a87b4f',
  beach: '#e7d3a1', savanna: '#c2a25a', forest: '#3f5a2c', desert: '#dcb980', stadium: '#3f8f3a', studio: '#202226', space: '#4a4a52',
};
const PALETTES: Record<string, string[]> = {
  cinematic: ['#1b263b', '#e0a458', '#f4f1de', '#c1666b'],
  cartoon: ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff'],
  lowpoly: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261'],
  clay: ['#e8d5b7', '#c97b63', '#7a9e7e', '#f2e8cf'],
  neon: ['#0b0c1e', '#ff2e88', '#00e5ff', '#9d4edd'],
};
const ACTION_WORDS: [RegExp, Action][] = [
  [/danse|dancing|f[eê]te/, 'dance'],
  [/court|cours|sprint|course/, 'run'],
  [/saute|bondit|saut/, 'jump'],
  [/salue|coucou|signe de la main|bonjour/, 'wave'],
  [/parle|discute|explique|pr[ée]sente|dit\b/, 'talk'],
  [/c[ée]l[èe]bre|victoire|gagne|joie|bravo/, 'celebrate'],
  [/applaudi/, 'clap'],
  [/assis|s.assoit|s.assied/, 'sit'],
  [/montre|pointe|indique/, 'point'],
  [/tombe|chute|glisse/, 'fall'],
  [/marche|avance|se prom[eè]ne|arrive|entre/, 'walk'],
];
const PEOPLE: [RegExp, { kind: Character['kind']; name: string; height: number }][] = [
  [/enfant|gar[cç]on|fillette|petit/, { kind: 'child', name: 'Enfant', height: 1.2 }],
  [/robot|androïde|android/, { kind: 'robot', name: 'Robot', height: 1.7 }],
  [/lion|chien|chat|cheval|vache|ch[eè]vre|poule|animal|z[èe]bre|girafe/, { kind: 'animal', name: 'Animal', height: 0.9 }],
  [/femme|dame|cliente|conseill[eè]re|elle\b|maman/, { kind: 'human', name: 'Awa', height: 1.68 }],
  [/homme|monsieur|client|conseiller|banquier|il\b|papa|personnage|h[ée]ros/, { kind: 'human', name: 'Moussa', height: 1.78 }],
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Understanding WITHOUT a model (no key, offline, or as the model's fallback): keywords → a coherent plan. */
export function heuristicPlan(text: string, o: { seconds?: number; format?: VideoFormat; look?: ScenePlan['style']['look']; kind?: ScenePlan['source']['kind'] } = {}): ScenePlan {
  const t = text.toLowerCase();
  const seconds = clamp(o.seconds ?? (Number(/(\d+)\s*(s|sec|secondes)\b/.exec(t)?.[1]) || 15), 2, 120);
  const preset = ENV_WORDS.find(([re]) => re.test(t))?.[1] ?? 'african_city';
  const look = o.look ?? (/cartoon|dessin anim|enfant/.test(t) ? 'cartoon' : /low ?poly/.test(t) ? 'lowpoly' : /p[âa]te|clay/.test(t) ? 'clay' : /n[ée]on|cyber/.test(t) ? 'neon' : 'cinematic');
  const timeOfDay: ScenePlan['style']['timeOfDay'] = /aube|lever du soleil|matin/.test(t) ? 'dawn' : /coucher|cr[ée]puscule|soir/.test(t) ? 'dusk' : /nuit|nocturne|n[ée]on/.test(t) ? 'night' : /dor[ée]e|golden/.test(t) ? 'golden' : preset === 'space' ? 'night' : 'day';
  const found = PEOPLE.filter(([re]) => re.test(t)).map(([, p]) => p);
  const count = Number(/(\d+|deux|trois|quatre)\s+(personnes|personnages|amis|enfants)/.exec(t)?.[1]?.replace('deux', '2').replace('trois', '3').replace('quatre', '4')) || 0;
  const people = found.length ? found : [{ kind: 'human' as const, name: 'Moussa', height: 1.78 }];
  while (people.length < Math.min(count, 6)) people.push({ ...people[people.length % found.length || 0]!, name: `${people[0]!.name} ${people.length + 1}` });
  const pal = PALETTES[look]!;
  const characters: Character[] = people.slice(0, 6).map((p, i) => ({
    id: `c${i + 1}`,
    name: p.name,
    kind: p.kind,
    height: p.height,
    colors: { skin: ['#8d5524', '#c68642', '#5c3a21', '#e0ac69'][i % 4]!, top: ['#1f6feb', '#c1666b', '#2a9d8f', '#e9c46a', '#6d28d9', '#f4f1de'][i % 6]!, bottom: ['#2b2d42', '#3d405b', '#1d3557'][i % 3]!, accent: pal[(i + 2) % pal.length]! },
    start: [round2((i - (people.length - 1) / 2) * 1.6), 0],
    facing: 0,
  }));
  const verbs = ACTION_WORDS.filter(([re]) => re.test(t)).map(([, a]) => a);
  const acts: Action[] = verbs.length ? verbs : ['walk', 'wave', 'celebrate'];
  const nShots = seconds <= 6 ? 2 : seconds <= 15 ? 3 : seconds <= 30 ? 4 : 6;
  const moves: CameraMove[] = preset === 'space' || /a[ée]rien|drone|survol/.test(t) ? ['aerial_flyover', 'orbit', 'dolly_in', 'crane_up'] : ['dolly_in', 'tracking', 'orbit', 'crane_up', 'push_in_low', 'dolly_out'];
  const d = seconds / nShots;
  const shots: Shot[] = Array.from({ length: nShots }, (_, i) => ({
    id: `p${i + 1}`,
    start: round2(i * d),
    duration: round2(d),
    camera: { move: moves[i % moves.length]!, target: i === 0 ? 'scene' : characters[i % characters.length]!.id, lens: i === 0 ? 28 : 50, height: i === 0 ? 'high' : i === nShots - 1 ? 'low' : 'eye' },
    actions: characters.map((c, k) => {
      const a = acts[(i + k) % acts.length]!;
      return { who: c.id, action: a, at: 0, duration: round2(d), emotion: a === 'celebrate' || a === 'dance' ? ('happy' as const) : ('neutral' as const), ...(a === 'walk' || a === 'run' ? { to: [round2(c.start[0] + (k % 2 ? -2 : 2)), round2(-2 - i)] as [number, number] } : {}) };
    }),
    caption: undefined,
  }));
  const quoted = /[«"]\s*([^»"]{2,60})\s*[»"]/.exec(text)?.[1]?.trim();
  const clauses = text.replace(/\s+/g, ' ').trim().split(/[.!?:\n]/).map((x) => x.trim()).filter(Boolean);
  const meaningful = clauses.find((c) => !/^(une?|la|le)?\s*(vid[ée]o|clip|film|animation)\b.*\d+\s*(s|sec|secondes)\b/i.test(c)) ?? clauses[0] ?? '';
  const title = (quoted ?? meaningful.replace(/^(à|a|au|en)\s+/i, '')).slice(0, 60).replace(/^./, (c) => c.toUpperCase()) || 'Ma vidéo';
  return normalizePlan(
    {
      title,
      logline: text.slice(0, 300),
      seconds,
      format: o.format ?? '16:9',
      style: { look, palette: pal, timeOfDay, weather: /brouillard|brume/.test(t) ? 'fog' : /pluie|orage/.test(t) ? 'rain' : 'clear' },
      environment: { preset, ground: ENV_GROUND[preset], props: ENV_PROPS[preset] },
      characters,
      shots,
      titles: quoted || /titre/.test(t) ? [{ text: quoted ?? title, start: round2(Math.min(1, seconds * 0.1)), duration: round2(Math.min(4, seconds * 0.4)), position: 'center' }] : [],
      source: { kind: o.kind ?? 'idea' },
    },
    { seconds, format: o.format },
  );
}

/**
 * Validation and REPAIR of a plan proposed by a model: unknown words → nearest allowed ones, shots laid end to end to
 * cover exactly the duration, actions of unknown characters dropped, ids made safe, colours checked. Throws only when
 * nothing usable remains.
 */
export function normalizePlan(raw: unknown, o: { seconds?: number; format?: VideoFormat } = {}): ScenePlan {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => {
    const s = String(v ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    return (list as readonly string[]).includes(s) ? (s as T) : (list.find((x) => s.includes(x) || x.includes(s)) ?? dflt);
  };
  const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const seconds = clamp(Number(o.seconds ?? r.seconds) || 15, 2, 120);
  const look = pick(r.style?.look, LOOKS, 'cinematic');
  const palette = (Array.isArray(r.style?.palette) ? r.style.palette.filter(isHex) : []).slice(0, 6);
  const preset = pick(r.environment?.preset, ENV_PRESETS, 'african_city');
  const ids = new Map<string, string>();
  const characters: Character[] = (Array.isArray(r.characters) ? r.characters : []).slice(0, 8).map((c: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const id = String(c?.id ?? `c${i + 1}`).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '').slice(0, 24) || `c${i + 1}`;
    const uid = [...ids.values()].includes(id) ? `${id}_${i}` : id;
    ids.set(String(c?.id ?? uid), uid);
    ids.set(String(c?.name ?? uid).toLowerCase(), uid);
    const kind = pick(c?.kind, KINDS, 'human');
    const col = c?.colors ?? {};
    const pal = palette.length >= 2 ? palette : PALETTES[look]!;
    return {
      id: uid,
      name: String(c?.name ?? `Personnage ${i + 1}`).slice(0, 40),
      kind,
      height: clamp(Number(c?.height) || (kind === 'child' ? 1.2 : kind === 'animal' ? 0.9 : 1.75), 0.3, 3),
      colors: { skin: isHex(col.skin) ? col.skin : '#8d5524', top: isHex(col.top) ? col.top : pal[1 % pal.length]!, bottom: isHex(col.bottom) ? col.bottom : pal[0]!, accent: isHex(col.accent) ? col.accent : pal[2 % pal.length]! },
      start: Array.isArray(c?.start) && c.start.length === 2 ? [clamp(Number(c.start[0]) || 0, -20, 20), clamp(Number(c.start[1]) || 0, -20, 20)] : [round2((i - 1) * 1.6), 0],
      facing: Number(c?.facing) || 0,
    };
  });
  const who = (w: unknown) => ids.get(String(w)) ?? ids.get(String(w).toLowerCase()) ?? (characters.some((c) => c.id === w) ? String(w) : null);
  // Shots end to end, scaled to the duration.
  const rawShots: any[] = Array.isArray(r.shots) && r.shots.length ? r.shots.slice(0, 16) : [{}]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const weights = rawShots.map((s) => Math.max(0.5, Number(s?.duration) || seconds / rawShots.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const shots: Shot[] = rawShots.map((s, i) => {
    const duration = round2(i === rawShots.length - 1 ? seconds - cursor : (weights[i]! / total) * seconds);
    const start = round2(cursor);
    cursor = round2(cursor + duration);
    const cam = s?.camera ?? {};
    const target = cam.target === 'scene' ? 'scene' : (who(cam.target) ?? 'scene');
    return {
      id: String(s?.id ?? `p${i + 1}`).slice(0, 24),
      start,
      duration: Math.max(0.5, duration),
      camera: { move: pick(cam.move, CAMERA_MOVES, 'dolly_in'), target, lens: clamp(Number(cam.lens) || 40, 14, 200), height: pick(cam.height, ['low', 'eye', 'high', 'aerial'] as const, 'eye') },
      actions: (Array.isArray(s?.actions) ? s.actions : [])
        .map((a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const id = who(a?.who);
          if (!id) return null;
          const at = clamp(Number(a?.at) || 0, 0, Math.max(0, duration - 0.2));
          return {
            who: id,
            action: pick(a?.action, ACTIONS, 'idle'),
            at,
            duration: round2(clamp(Number(a?.duration) || duration - at, 0.2, duration - at)),
            ...(Array.isArray(a?.to) && a.to.length === 2 ? { to: [clamp(Number(a.to[0]) || 0, -20, 20), clamp(Number(a.to[1]) || 0, -20, 20)] as [number, number] } : {}),
            emotion: pick(a?.emotion, EMOTIONS, 'neutral'),
          };
        })
        .filter(Boolean)
        .slice(0, 16),
      ...(s?.caption ? { caption: String(s.caption).slice(0, 140) } : {}),
    };
  });
  const plan = {
    title: String(r.title ?? 'Ma vidéo').slice(0, 120) || 'Ma vidéo',
    logline: String(r.logline ?? '').slice(0, 400),
    seconds,
    format: (['16:9', '9:16', '1:1'] as const).includes(o.format ?? r.format) ? (o.format ?? r.format) : '16:9',
    style: { look, palette: palette.length >= 2 ? palette : PALETTES[look]!, timeOfDay: pick(r.style?.timeOfDay, TIMES, 'day'), weather: pick(r.style?.weather, ['clear', 'fog', 'rain'] as const, 'clear') },
    environment: {
      preset,
      ground: isHex(r.environment?.ground) ? r.environment.ground : ENV_GROUND[preset],
      props: (Array.isArray(r.environment?.props) && r.environment.props.length ? r.environment.props : ENV_PROPS[preset])
        .slice(0, 12)
        .map((p: any) => ({ kind: pick(p?.kind, PROP_KINDS, 'tree'), count: clamp(Math.round(Number(p?.count) || 3), 1, 60), ...(isHex(p?.color) ? { color: p.color } : {}) })), // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    characters,
    shots,
    titles: (Array.isArray(r.titles) ? r.titles : [])
      .filter((x: any) => x?.text) // eslint-disable-line @typescript-eslint/no-explicit-any
      .slice(0, 6)
      .map((x: any) => ({ text: String(x.text).slice(0, 80), start: clamp(Number(x.start) || 0, 0, seconds - 0.5), duration: clamp(Number(x.duration) || 3, 0.5, seconds), position: pick(x.position, ['center', 'bottom', 'top'] as const, 'center') })), // eslint-disable-line @typescript-eslint/no-explicit-any
    source: { kind: pick(r.source?.kind, ['idea', 'text', 'storyboard', 'image'] as const, 'idea'), ...(r.source?.note ? { note: String(r.source.note).slice(0, 600) } : {}) },
  };
  return PlanSchema.parse(plan);
}

/** The planner's instructions: the model fills the plan, with the closed vocabulary of the engines. */
export function plannerSystem(): string {
  return [
    'Tu es réalisateur et chef décorateur 3D. Tu transformes une intention créative (idée, concept, description, storyboard ou image) en PLAN DE SCÈNE pour un moteur 3D (Blender) qui va construire le décor, rigger et animer les personnages, placer la caméra et rendre la vidéo.',
    'Réponds UNIQUEMENT par un objet JSON (pas de texte autour) de cette forme :',
    '{ "title", "logline", "seconds", "format": "16:9|9:16|1:1", "style": { "look", "palette": ["#hex", …3 à 5], "timeOfDay", "weather" }, "environment": { "preset", "ground": "#hex", "props": [{ "kind", "count", "color"? }] }, "characters": [{ "id", "name", "kind", "height", "colors": { "skin", "top", "bottom", "accent" }, "start": [x, z], "facing" }], "shots": [{ "id", "start", "duration", "camera": { "move", "target": "scene"|id, "lens", "height" }, "actions": [{ "who": id, "action", "at", "duration", "to"?: [x, z], "emotion" }], "caption"? }], "titles": [{ "text", "start", "duration", "position" }], "source": { "kind", "note" } }',
    `Vocabulaire FERMÉ — look : ${LOOKS.join(', ')} · timeOfDay : ${TIMES.join(', ')} · weather : clear, fog, rain · preset : ${ENV_PRESETS.join(', ')} · props.kind : ${PROP_KINDS.join(', ')} · kind : ${KINDS.join(', ')} · action : ${ACTIONS.join(', ')} · emotion : ${EMOTIONS.join(', ')} · camera.move : ${CAMERA_MOVES.join(', ')} · camera.height : low, eye, high, aerial.`,
    'Règles : unités en mètres, le sol est le plan y = 0, x vers la droite, z vers la caméra ; personnages entre −6 et 6 ; plans bout à bout qui couvrent toute la durée ; 1 plan large d’ouverture, des plans rapprochés sur les actions, un plan final mémorable ; actions qui racontent une progression (arrivée, interaction, temps fort, conclusion) ; émotions cohérentes ; caméra : un seul mouvement lent par plan ; palette harmonieuse adaptée à l’ambiance ; titres courts en français.',
    'Image fournie : reconstruis la scène qu’elle montre (lieu → preset et accessoires, personnes → personnages avec leurs couleurs de peau et de vêtements, ambiance → heure et palette) et anime-la ; décris l’image dans source.note.',
  ].join('\n');
}

/** The plan in a model answer (JSON, possibly fenced), repaired; null when no JSON object can be read. */
export function parsePlan(text: string, o: { seconds?: number; format?: VideoFormat } = {}): ScenePlan | null {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (m ? m[1]! : text).trim();
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return normalizePlan(JSON.parse(body.slice(a, b + 1)), o);
  } catch {
    return null;
  }
}

/** The seven stages of the pipeline, with what the plan says for each (shown to the user). */
export function pipelineSummary(p: ScenePlan): { stage: string; detail: string }[] {
  const acts = new Set(p.shots.flatMap((s) => s.actions.map((a) => a.action)));
  const emos = new Set(p.shots.flatMap((s) => s.actions.map((a) => a.emotion)).filter((e) => e !== 'neutral'));
  return [
    { stage: 'Analyse', detail: `${p.source.kind === 'image' ? 'image' : p.source.kind === 'storyboard' ? 'storyboard' : 'intention'} → « ${p.title} »${p.logline ? ` — ${p.logline.slice(0, 120)}` : ''}` },
    { stage: 'Scène 3D', detail: `${p.seconds} s · ${p.format} · ${p.style.look} · ${p.style.timeOfDay}${p.style.weather !== 'clear' ? ` · ${p.style.weather}` : ''}` },
    { stage: 'Décors', detail: `${p.environment.preset} · ${p.environment.props.map((x) => `${x.count} ${x.kind}`).join(', ')}` },
    { stage: 'Personnages', detail: p.characters.length ? p.characters.map((c) => `${c.name} (${c.kind}, ${c.height} m)`).join(', ') + ' · squelette + rig automatiques' : 'aucun (décor seul)' },
    { stage: 'Mouvements', detail: `${[...acts].join(', ') || 'aucun'}${emos.size ? ` · expressions : ${[...emos].join(', ')}` : ''}` },
    { stage: 'Caméra', detail: p.shots.map((s) => `${s.camera.move} ${s.camera.lens} mm`).join(' → ') },
    { stage: 'Rendu', detail: `${FORMAT_SIZE[p.format].join('×')} · ${p.shots.length} plan(s)${p.titles.length ? ` · ${p.titles.length} titre(s)` : ''}` },
  ];
}
