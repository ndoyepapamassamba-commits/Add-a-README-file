// MOTEUR DE SCÈNE INSTANTANÉ (v64, consigne du 15/10/2026 : « le bac à sable doit pouvoir répondre à ce genre de prompt
// rapidement et presque gratuitement avec JEV » — une cité médiévale fortifiée, sa vallée, sa rivière, ses forêts au
// coucher du soleil). Au lieu de faire écrire 40 Ko de three.js à un modèle de langage (minutes, dollars, erreurs), le
// prompt est LU (analyseur local à 0 $, affiné par les questions typées de JEV ≈ 0,0001 $) en un cahier des charges de
// scène ; un moteur procédural déjà écrit (sceneRuntime.ts : terrain, instances par milliers, eau, ciel, vent, vols
// d'oiseaux) le construit dans le bac à sable. L'œil de JEV regarde le rendu ; ce qu'il ne voit pas est AGRANDI par le
// moteur lui-même (réglages), sans modèle de langage. Le modèle n'est appelé que pour ce que le moteur ne sait pas dessiner.
// Pur (aucun accès réseau ni DOM) : testable.
import type { JevQuestion } from '../provider';
import {
  fidelityProblems,
  promptItems,
  type RealizeError,
  type RealizeRound,
  type RealizeRun,
} from './realize';
import { sceneMain } from './sceneRuntime';
import { sceneScifi } from './sceneRuntimeScifi';
import { scenePlanet } from './sceneRuntimePlanet';
import { sceneStreet } from './sceneRuntimeStreet';
/** The generator of each universe (each is self-contained and serialized into the page). */
const RUNTIME = (t: SceneTheme) => (t === 'planet' ? scenePlanet : t === 'street' ? sceneStreet : t === 'scifi' || t === 'coastal' ? sceneScifi : sceneMain);

export type SceneComp =
  | 'castle'
  | 'keeps'
  | 'walls'
  | 'towers'
  | 'banners'
  | 'houses'
  | 'square'
  | 'market'
  | 'church'
  | 'streets'
  | 'lanterns'
  | 'fields'
  | 'roads'
  | 'carts'
  | 'river'
  | 'bridge'
  | 'lake'
  | 'forest'
  | 'mountains'
  | 'hill'
  | 'valley'
  | 'sun'
  | 'birds'
  | 'clouds'
  | 'windmill'
  | 'boats'
  | 'crowd'
  // univers « mégapole futuriste »
  | 'skyscrapers'
  | 'holograms'
  | 'flyers'
  | 'monorail'
  | 'icon_tower'
  | 'rain'
  | 'steam'
  | 'neon'
  | 'avenues'
  | 'districts'
  // univers « planète vue de l'espace »
  | 'planet'
  | 'continents'
  | 'oceans'
  | 'atmosphere'
  | 'aurora'
  | 'cities'
  | 'deserts'
  | 'descent'
  // univers « métropole moderne au bord de l'océan »
  | 'glass_towers'
  | 'ocean'
  | 'port'
  | 'ships'
  | 'cranes'
  | 'highways'
  | 'trams'
  | 'palms'
  | 'gardens'
  | 'screens'
  | 'fountains'
  | 'plazas'
  // univers « forêt magique »
  | 'giant_trees'
  | 'god_rays'
  | 'streams'
  | 'waterfalls'
  | 'crystals'
  | 'fireflies'
  | 'moss'
  | 'mist'
  | 'deer'
  | 'creatures'
  // univers « colonie martienne »
  | 'domes'
  | 'red_sky'
  | 'spaceport'
  | 'rockets'
  | 'solar'
  | 'hydroponics'
  | 'rovers'
  | 'tracks'
  | 'dust_storm'
  // univers « rue animée »
  | 'shops'
  | 'traffic'
  | 'taxis'
  | 'buses'
  | 'motos'
  | 'pedestrians'
  | 'vendors'
  | 'market_stalls'
  | 'traffic_lights'
  | 'street_trees'
  | 'signs'
  | 'skyline'
  | 'children'
  | 'dogs'
  | 'cables'
  | 'bus_stop';
export type SceneTheme = 'nature' | 'scifi' | 'planet' | 'coastal' | 'forest' | 'mars' | 'street';
export type SceneTime = 'dawn' | 'day' | 'sunset' | 'night';
export type SceneSeason = 'summer' | 'autumn' | 'winter' | 'spring';
export type SceneCamera = 'panorama' | 'aerial' | 'ground' | 'flythrough' | 'descent';
export type SceneMood = 'epic' | 'calm' | 'dark' | 'fairy';

export interface SceneElement {
  comp: SceneComp;
  /** The element's name in the realize spec (what the eye of JEV looks for). */
  name: string;
  where?: string;
  size?: string;
  /** The request's own words for it (the fidelity check reads them). */
  detail: string;
}
export interface SceneSpec {
  seed: number;
  /** The engine's universe: a landscape / historic town, or a futuristic megacity. */
  theme: SceneTheme;
  /** What the engine draws: the named components and the ones they imply (a city implies houses). */
  comps: SceneComp[];
  /** The named ones, biggest first (the eye judges the first 12). */
  elements: SceneElement[];
  counts: {
    houses: number;
    trees: number;
    keeps: number;
    towers: number;
    birds: number;
    clouds: number;
    carts: number;
    stalls: number;
    people: number;
    wheat: number;
  };
  /** Size / prominence multipliers set by the eye's corrections (1 = designed size). */
  boost: Partial<Record<SceneComp, number>>;
  time: SceneTime;
  season: SceneSeason;
  camera: SceneCamera;
  mood: SceneMood;
  fog: number;
  wind: number;
  light: string;
  view: string;
  /** Parts of the request the engine cannot draw (the language model completes them on demand). */
  missing: string[];
  /** Share of the request's items the engine covers (0–1). */
  coverage: number;
  source: 'local' | 'jev';
}

interface CatalogEntry {
  id: SceneComp;
  /** Name in the spec (French, the request's vocabulary). */
  name: string;
  /** English label for JEV's questions. */
  en: string;
  /** Matched on the folded request (no accents, lower case). */
  re: RegExp;
  where?: string;
  size?: string;
  /** Rank for the eye (big and central first). */
  rank: number;
}
const CATALOG: CatalogEntry[] = [
  { id: 'castle', name: 'château', en: 'a castle or royal fortress', re: /\b(chateau|forteresse|citadelle|palais|castle|fortress)/, where: 'centre', size: 'grand', rank: 1 },
  { id: 'walls', name: 'remparts', en: 'city walls or ramparts', re: /\b(rempart|muraille|enceinte|fortifie|walls?\b|rampart)/, size: 'grand', rank: 2 },
  { id: 'houses', name: 'maisons', en: 'many houses of a town or village', re: /\b(maison|colombage|habitation|chaumiere|demeure|houses?\b)/, rank: 3 },
  { id: 'hill', name: 'colline', en: 'a hill the city stands on', re: /\b(colline|butte|promontoire|eperon|hill)/, rank: 4 },
  { id: 'mountains', name: 'montagnes', en: 'mountains on the horizon', re: /\b(montagne|sommet|massif|cimes?\b|pics?\b|mountain)/, rank: 5 },
  { id: 'river', name: 'rivière', en: 'a river', re: /\b(riviere|fleuve|ruisseau|cours d eau|river|stream)/, rank: 6 },
  { id: 'forest', name: 'forêts', en: 'forests and many trees', re: /\b(foret|bois\b|arbre|sapin|chene|forest|trees?\b)/, rank: 7 },
  { id: 'fields', name: 'champs de blé', en: 'wheat fields', re: /\b(champs?\b|ble\b|bles\b|cereale|moisson|culture|wheat|fields?\b)/, rank: 8 },
  { id: 'sun', name: 'soleil', en: 'the sun or its glow in the sky', re: /\b(soleil|coucher|couchant|crepuscule|aube|aurore|lever du jour|sun)/, where: 'haut', rank: 9 },
  { id: 'lake', name: 'lac', en: 'a lake', re: /\b(lac|etang|lake|pond)\b/, rank: 10 },
  { id: 'church', name: 'église', en: 'a large stone church or cathedral', re: /\b(eglise|cathedrale|chapelle|abbaye|church|cathedral)/, rank: 11 },
  { id: 'bridge', name: 'pont', en: 'a stone bridge over the river', re: /\b(pont|bridge)\b/, rank: 12 },
  { id: 'keeps', name: 'donjons', en: 'castle keeps (tall towers of the castle)', re: /\b(donjon|keep)/, rank: 13 },
  { id: 'towers', name: 'tours de guet', en: 'watchtowers on the walls', re: /\b(tours? de guet|tourelle|watchtower|tours\b)/, rank: 14 },
  { id: 'square', name: 'place centrale', en: 'a central town square', re: /\b(place (centrale|du marche|publique)|grand.place|square|plaza)\b/, rank: 15 },
  { id: 'market', name: 'marché', en: 'a busy market with stalls', re: /\b(marche\b|etals?\b|foire|market)/, rank: 16 },
  { id: 'fields', name: 'champs de blé', en: 'wheat fields', re: /\bprairie/, rank: 8 },
  { id: 'roads', name: 'chemins', en: 'country roads and paths', re: /\b(chemin|route|sentier|roads?\b|paths?\b)/, rank: 17 },
  { id: 'streets', name: 'rues pavées', en: 'paved streets', re: /\b(rue|ruelle|pave|streets?\b)/, rank: 18 },
  { id: 'birds', name: 'oiseaux', en: 'birds flying in the sky', re: /\b(oiseau|corbeau|aigle|mouette|hirondelle|birds?\b)/, where: 'haut', size: 'petit', rank: 19 },
  { id: 'clouds', name: 'nuages', en: 'clouds in the sky', re: /\b(nuage|nuee|clouds?\b)/, where: 'haut', rank: 20 },
  { id: 'banners', name: 'bannières', en: 'banners or flags waving', re: /\b(banniere|drapeau|etendard|oriflamme|fanion|banner|flag)/, size: 'petit', rank: 21 },
  { id: 'lanterns', name: 'lanternes', en: 'lit lanterns along the streets', re: /\b(lanterne|lampadaire|torche|flambeau|lantern|torch)/, size: 'petit', rank: 22 },
  { id: 'carts', name: 'charrettes', en: 'carts on the roads', re: /\b(charrette|chariot|carriole|cart|wagon)/, size: 'petit', rank: 23 },
  { id: 'windmill', name: 'moulin', en: 'a windmill', re: /\b(moulin|windmill)/, rank: 24 },
  { id: 'boats', name: 'barques', en: 'small boats on the water', re: /\b(barque|bateau|navire|voilier|boats?\b)/, size: 'petit', rank: 25 },
  { id: 'crowd', name: 'habitants', en: 'people in the streets', re: /\b(foule|habitant|villageois|passant|marchand|gens\b|people|crowd)/, size: 'petit', rank: 26 },
  { id: 'valley', name: 'vallée', en: 'a wide valley', re: /\b(vallee|plaine|valley)/, rank: 27 },
];
/** The futuristic megacity: its own components (the same engine contract, another generator). */
const SCIFI_CATALOG: CatalogEntry[] = [
  { id: 'icon_tower', name: 'tour iconique', en: 'a gigantic iconic tower lit with blue and purple neon in the centre', re: /\b(tour (iconique|centrale|geante|illumin)|gigantesque tour|immense tour|spire|iconic tower)/, where: 'centre', size: 'grand', rank: 1 },
  { id: 'skyscrapers', name: 'gratte-ciel', en: 'thousands of modern skyscrapers', re: /\b(gratte ciel|immeubles?|buildings?|skyscrapers?|megapole|metropole)/, size: 'grand', rank: 2 },
  { id: 'holograms', name: 'écrans holographiques', en: 'giant holographic screens and glowing advertisements on the facades', re: /\b(hologra|ecrans?|publicit|enseignes?|panneaux|billboards?)/, rank: 3 },
  { id: 'flyers', name: 'véhicules volants', en: 'flying vehicles moving between the towers', re: /\b(vehicules? volants?|voitures? volantes?|circulation aerienne|vaisseaux?|drones?|flying (cars?|vehicles?))/, rank: 4 },
  { id: 'rain', name: 'pluie', en: 'light rain falling', re: /\b(pluie|averse|bruine|pleut|rain)/, rank: 5 },
  { id: 'avenues', name: 'avenues réfléchissantes', en: 'wet reflective avenues', re: /\b(avenues?|boulevards?|rues?|streets?|reflechiss|chaussee)/, rank: 6 },
  { id: 'monorail', name: 'trains suspendus', en: 'suspended monorail trains on elevated tracks', re: /\b(trains? suspendus?|monorails?|metro aerien|trains?|trams?)\b/, rank: 7 },
  { id: 'neon', name: 'néons', en: 'neon lights', re: /\b(neons?|illumin|lumineu)/, rank: 8 },
  { id: 'steam', name: 'vapeur', en: 'steam rising from street vents', re: /\b(vapeur|fumee|steam|bouches? d aeration)/, size: 'petit', rank: 9 },
  { id: 'districts', name: 'quartiers', en: 'distinct districts (financial, residential, industrial)', re: /\b(quartiers?|districts?|financiers?|residentiels?|industriels?)/, rank: 10 },
  { id: 'clouds', name: 'nuages', en: 'clouds', re: /\b(nuage|clouds?)/, where: 'haut', rank: 11 },
];
const SCIFI_RE =
  /\b(futur\w*|cyberpunk|megapole|metropole|gratte ciel|neons?|hologra\w*|science fiction|sci fi|blade runner|vaisseaux?|voitures? volantes?|vehicules? volants?|robots?|androides?|dystop\w*|2[0-9]{3}\b)/;
/** Words of style, framing and mood: part of the request, drawn by the engine's camera and light, not by an object. */
const STYLE =
  /\b(blockbuster|introduction|science|spectacul|horizon|etend|domin|modern|camera|traversant|camer|style|vue|ambiance|cinemat|panoram|epique|film|fantasy|rendu|lumiere|eclair|atmospher|realis|detail|qualite|4k|8k|ultra|photo|cadrage|plan large|grand angle|digne|majestueu|immense|vaste|ville|cite|medieval|village|ciel|vent|lent)/;
/** The components a city / landscape implies even when the request does not name them. */
const IMPLIES: Partial<Record<SceneComp, SceneComp[]>> = {
  castle: ['keeps', 'hill'],
  walls: ['towers'],
  houses: ['streets'],
  market: ['square', 'crowd'],
  square: ['streets'],
  lanterns: ['streets'],
  carts: ['roads'],
  bridge: ['river', 'roads'],
  boats: ['lake'],
  fields: ['roads'],
};
const SCENE_WORDS = /\b(cite|ville|village|bourg|hameau|town|city)\b/;

export const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, quinze: 15, vingt: 20, trente: 30, cinquante: 50, cent: 100, mille: 1000,
};
/** A quantity word before a component's keyword (« des centaines de maisons », « trois tours », « 12 maisons »). */
function quantity(f: string, keyword: RegExp, base: number): number | null {
  const re = new RegExp(`\\b(?!(?:de|des|d|du|la|le|les|avec|et|a|au|aux|sur|sous|par|en)\\s)(\\d+|[a-z]+)\\s+(?:de\\s+|d\\s+)?(?:[a-z]+\\s+)?${keyword.source.replace(/^\\b/, '')}`, 'g');
  for (const m of f.matchAll(re)) {
    const w = m[1]!;
    if (/^\d+$/.test(w)) return Math.min(+w, base * 12);
    if (NUMBERS[w]) return NUMBERS[w]!;
    if (/^milliers?$/.test(w)) return base * 2.2;
    if (/^centaines?$/.test(w)) return base * 1.15;
    if (/^dizaines?$/.test(w)) return Math.max(12, base * 0.12);
    if (/^(nombreux|nombreuses|innombrables|multiples)$/.test(w)) return base * 1.4;
    if (/^(plusieurs)$/.test(w)) return 4;
    if (/^(quelques)$/.test(w)) return Math.max(3, Math.round(base * 0.5));
  }
  return null;
}
const BASE_COUNTS: SceneSpec['counts'] = {
  houses: 380,
  trees: 2600,
  keeps: 3,
  towers: 14,
  birds: 34,
  clouds: 8,
  carts: 7,
  stalls: 22,
  people: 160,
  wheat: 20_000,
};

/** A small, stable hash: the same request always gives the same scene (seeded generator). */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * THE LOCAL READING (0 $, no key, instant): components named by the request (+ the ones they imply), counts, time of
 * day, season, framing, mood; each segment of the request is attached to what draws it, the rest is « missing ».
 */
export function parseSceneLocal(prompt: string, opts: { theme?: SceneTheme } = {}): SceneSpec {
  const f = fold(prompt);
  const themed = opts.theme ? THEMES.find((t) => t.id === opts.theme) : THEMES.find((t) => t.detect(f));
  if (opts.theme === 'nature') return parseNature(prompt, f);
  if (themed) return parseThemed(prompt, f, themed);
  return parseNature(prompt, f);
}
function parseNature(prompt: string, f: string): SceneSpec {
  const named = new Map<SceneComp, CatalogEntry>();
  for (const c of CATALOG) if (c.re.test(f) && !named.has(c.id)) named.set(c.id, c);
  // « tours » alone means the walls' towers only when there are walls or a castle around.
  if (named.has('towers') && !named.has('walls') && !named.has('castle') && !/tours? de guet|tourelle/.test(f))
    named.delete('towers');
  // A city / village with no house named still has its houses.
  if (SCENE_WORDS.test(f) && !named.has('houses')) named.set('houses', CATALOG.find((c) => c.id === 'houses')!);
  const comps = new Set<SceneComp>(named.keys());
  for (const id of [...comps]) for (const x of IMPLIES[id] ?? []) comps.add(x);
  if (comps.has('castle') || comps.has('walls')) comps.add('hill');
  // Every landscape has a sky with its light; the sun is NAMED only when the request speaks of it.
  const { items, circumstances } = promptItems(prompt);
  const segs = [...items.map((i) => i.text), ...circumstances];
  const detail = new Map<SceneComp, string[]>();
  const missing: string[] = [];
  let covered = 0;
  for (const s of segs) {
    const fs = fold(s);
    const hits = [...named.values()].filter((c) => c.re.test(fs));
    if (hits.length) {
      covered++;
      for (const h of hits) detail.set(h.id, [...(detail.get(h.id) ?? []), s]);
    } else if (STYLE.test(fs) || SCENE_WORDS.test(fs)) {
      covered++;
      detail.set('__style' as SceneComp, [...(detail.get('__style' as SceneComp) ?? []), s]);
    } else missing.push(s.trim());
  }
  const elements: SceneElement[] = [...named.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => ({ comp: c.id, name: c.name, where: c.where, size: c.size, detail: (detail.get(c.id) ?? []).join(' · ') }));
  // The framing / mood words go with the main subject (they are drawn by its camera and its light).
  const style = detail.get('__style' as SceneComp);
  if (style?.length && elements[0]) elements[0].detail = [elements[0].detail, ...style].filter(Boolean).join(' · ');

  const counts = { ...BASE_COUNTS };
  const q = (re: RegExp, base: number) => quantity(f, re, base);
  counts.houses = Math.round(q(/\b(maisons?|habitations?|colombages?)/, BASE_COUNTS.houses) ?? (/\b(immense|grande) (cite|ville)/.test(f) ? 460 : /village|hameau/.test(f) ? 120 : BASE_COUNTS.houses));
  counts.trees = Math.round(q(/\b(arbres?|forets?|sapins?)/, BASE_COUNTS.trees) ?? BASE_COUNTS.trees);
  counts.keeps = Math.min(7, Math.round(q(/\bdonjons?/, 3) ?? BASE_COUNTS.keeps));
  counts.towers = Math.min(28, Math.max(8, Math.round(q(/\btours?/, 14) ?? BASE_COUNTS.towers)));
  counts.birds = Math.min(160, Math.round(q(/\boiseaux?/, BASE_COUNTS.birds) ?? BASE_COUNTS.birds));
  counts.clouds = Math.min(24, Math.round(q(/\bnuages?/, BASE_COUNTS.clouds) ?? BASE_COUNTS.clouds));
  counts.carts = Math.min(30, Math.round(q(/\bcharrettes?/, BASE_COUNTS.carts) ?? BASE_COUNTS.carts));
  if (/\banime|bonde|foule|grouill/.test(f)) counts.people = 240;
  if (/\bvaste|immense|a perte de vue/.test(f)) counts.wheat = 26_000;

  const time: SceneTime = /\b(nuit|nocturne|lune|etoile|minuit)/.test(f)
    ? 'night'
    : /\b(coucher|couchant|crepuscule|soir|golden hour|dore)/.test(f)
      ? 'sunset'
      : /\b(aube|aurore|lever du (jour|soleil)|matin)/.test(f)
        ? 'dawn'
        : 'day';
  const season: SceneSeason = /\b(hiver|neige|enneige|givre)/.test(f)
    ? 'winter'
    : /\bautomne|feuilles mortes/.test(f)
      ? 'autumn'
      : /\bprintemps|floraison|fleuri/.test(f)
        ? 'spring'
        : 'summer';
  const camera: SceneCamera = /\b(vue aerienne|vue du ciel|vol d oiseau|drone|survol de la|plongee)/.test(f)
    ? 'aerial'
    : /\b(au sol|depuis la rue|a hauteur d homme|contre.plongee)/.test(f)
      ? 'ground'
      : 'panorama';
  const mood: SceneMood = /\b(sombre|inquietant|orage|menacant|tenebr)/.test(f)
    ? 'dark'
    : /\b(feerique|conte|magique|enchant)/.test(f)
      ? 'fairy'
      : /\b(paisible|calme|serein|tranquille)/.test(f)
        ? 'calm'
        : 'epic';
  const total = segs.length || 1;
  const light =
    {
      sunset: 'coucher de soleil, soleil bas derrière les montagnes, lumière dorée rasante sur les remparts et les toits',
      dawn: 'aube, lumière rose et dorée, brume légère dans la vallée',
      day: 'plein jour, soleil haut, lumière claire',
      night: 'nuit, clair de lune bleuté, fenêtres et lanternes allumées',
    }[time] + (circumstances.length ? ` — ${circumstances.join(' ; ')}` : '');
  const view =
    {
      panorama: 'vue panoramique cinématique depuis la vallée, la cité au centre sur sa colline, montagnes à l’horizon',
      aerial: 'vue aérienne plongeante sur la cité et la vallée',
      ground: 'vue au sol depuis le pont, la cité dominant le cadre',
    }[camera] + (/\bcinemat|film/.test(f) ? ', cadrage de cinéma' : '');
  return {
    seed: seedOf(f),
    theme: 'nature',
    comps: [...comps],
    elements,
    counts,
    boost: {},
    time,
    season,
    camera,
    mood,
    fog: /\b(brume|brouillard|brumeux)/.test(f) ? 0.8 : 0.3,
    wind: /\b(vent|ondul|venteu|tempete|bourrasque|flott)/.test(f) ? 0.85 : 0.4,
    light,
    view,
    missing,
    coverage: covered / total,
    source: 'local',
  };
}

const E = (id: SceneComp, name: string, en: string, re: RegExp, rank: number, o: { where?: string; size?: string } = {}): CatalogEntry => ({ id, name, en, re, rank, ...o });
const PLANET_CATALOG: CatalogEntry[] = [
  E('planet', 'planète', 'a whole planet seen from space', /\b(planete|globe|terre)\b/, 1, { where: 'centre', size: 'grand' }),
  E('oceans', 'océans', 'oceans reflecting the sunlight', /\b(oceans?|mers?)\b/, 2),
  E('continents', 'continents', 'continents', /\bcontinents?\b/, 3),
  E('clouds', 'systèmes nuageux', 'huge swirling cloud systems', /\b(nuag\w*|cyclones?)\b/, 4),
  E('atmosphere', 'atmosphère', 'a thin bluish atmosphere glowing on the edge', /\batmosphere\b/, 5),
  E('aurora', 'aurores boréales', 'auroras near the poles', /\b(aurores?|boreales?)\b/, 6),
  E('cities', 'villes illuminées', 'city lights on the night side', /\b(villes?|cites?)\b/, 7),
  E('mountains', 'chaînes de montagnes', 'mountain ranges', /\b(montagnes?|reliefs?)\b/, 8),
  E('deserts', 'déserts', 'deserts', /\bdeserts?\b/, 9),
  E('forest', 'forêts', 'forests', /\bforets?\b/, 10),
  E('sun', 'rayons du soleil', 'the sun', /\b(soleil|rayons?)\b/, 11),
  E('descent', 'descente', 'a camera descending toward the surface', /\b(descente|s approche|approche|transition|niveau du sol)\b/, 12),
];
const COASTAL_CATALOG: CatalogEntry[] = [
  E('glass_towers', 'tours de verre', 'a skyline of glass and steel towers', /\b(tours?|gratte ciel|skyline|quartier financier|verre et acier|metropole)\b/, 1, { size: 'grand' }),
  E('ocean', 'océan', 'the ocean along the city', /\b(ocean|mer|baie|littoral|cote)\b/, 2),
  E('port', 'port commercial', 'a commercial port with terminals', /\b(port|terminaux|terminal|logistiques?|quais?)\b/, 3),
  E('ships', 'cargos', 'cargo ships', /\b(cargos?|navires?|porte conteneurs|bateaux?)\b/, 4),
  E('cranes', 'grues', 'harbour cranes', /\bgrues?\b/, 5),
  E('highways', 'autoroutes urbaines', 'multi-level urban highways', /\b(autoroutes?|echangeurs?|voies rapides?)\b/, 6),
  E('trams', 'tramways', 'modern trams', /\b(tramways?|trams?)\b/, 7),
  E('palms', 'palmiers', 'palm trees along the avenues', /\b(palmiers?|cocotiers?)\b/, 8),
  E('gardens', 'jardins tropicaux', 'luxury residences with tropical gardens', /\b(jardins?|parcs?|residences?|villas?)\b/, 9),
  E('screens', 'écrans numériques', 'digital screens', /\b(ecrans?|numeriques?)\b/, 10),
  E('fountains', 'fontaines', 'fountains', /\bfontaines?\b/, 11),
  E('plazas', 'places publiques', 'public squares', /\b(places? publiques?|centre ville|esplanades?)\b/, 12),
  E('sun', 'soleil couchant', 'the setting sun', /\b(soleil|couchant|coucher)\b/, 13),
  E('avenues', 'avenues', 'main avenues', /\b(avenues?|boulevards?)\b/, 14),
];
const FOREST_CATALOG: CatalogEntry[] = [
  E('giant_trees', 'arbres géants', 'giant trees', /\b(arbres?|troncs?|forets?|sequoias?)\b/, 1, { size: 'grand' }),
  E('god_rays', 'rayons de lumière', 'volumetric light rays through the canopy', /\b(rayons?|volumetriques?|canopee)\b/, 2),
  E('streams', 'ruisseaux', 'streams', /\b(ruisseaux?|rivieres?)\b/, 3),
  E('waterfalls', 'cascades', 'crystal-clear waterfalls', /\b(cascades?|chutes? d eau)\b/, 4),
  E('crystals', 'cristaux lumineux', 'glowing crystals emerging from the ground', /\b(cristaux|cristal)\b/, 5),
  E('fireflies', 'lucioles', 'glowing fireflies', /\blucioles?\b/, 6, { size: 'petit' }),
  E('moss', 'sol de mousse', 'a moss-covered ground', /\bmousses?\b/, 7),
  E('mist', 'brume', 'morning mist', /\b(brume|brouillard)\b/, 8),
  E('deer', 'cerfs', 'deer', /\b(cerfs?|biches?|daims?)\b/, 9, { size: 'petit' }),
  E('creatures', 'créatures fantastiques', 'fantastic glowing creatures', /\b(creatures?|fees?|esprits?|licornes?)\b/, 10, { size: 'petit' }),
  E('birds', 'oiseaux', 'birds', /\boiseaux?\b/, 11, { size: 'petit' }),
  E('sun', 'lever du soleil', 'the rising sun', /\b(soleil|lever|aube)\b/, 12),
];
const MARS_CATALOG: CatalogEntry[] = [
  E('domes', 'dômes transparents', 'transparent domes sheltering cities', /\b(domes?|coupoles?)\b/, 1, { size: 'grand' }),
  E('mountains', 'montagnes martiennes', 'huge Martian mountains in the distance', /\bmontagnes?\b/, 2),
  E('red_sky', 'ciel rouge', 'a red Martian sky', /\bciel\b/, 3),
  E('spaceport', 'spatioport', 'a central spaceport', /\b(spatioport|astroport|pas de tir)\b/, 4),
  E('rockets', 'fusées', 'rockets taking off', /\bfusees?\b/, 5),
  E('solar', 'panneaux solaires', 'fields of solar panels', /\bsolaires?\b/, 6),
  E('hydroponics', 'fermes hydroponiques', 'hydroponic farms', /\b(fermes?|hydroponi\w*|serres?)\b/, 7),
  E('rovers', 'véhicules autonomes', 'autonomous rovers', /\b(vehicules?|rovers?)\b/, 8, { size: 'petit' }),
  E('tracks', 'pistes rouges', 'red dirt tracks', /\bpistes?\b/, 9),
  E('dust_storm', 'tempêtes de poussière', 'dust storms', /\b(tempetes?|poussieres?)\b/, 10),
  E('valley', 'vallée', 'a valley', /\bvallee\b/, 11),
];
const STREET_CATALOG: CatalogEntry[] = [
  E('shops', 'commerces colorés', 'small colourful shops along the street', /\b(commerces?|boutiques?|epiceries?|magasins?|salons? de coiffure|restaurants?|cafes?|kiosques?|telephonie|facades?)\b/, 1, { size: 'grand' }),
  E('traffic', 'circulation', 'dense traffic in both directions', /\b(circulation|trafic|embouteillages?|vehicules?|voitures?|klaxonn\w*)\b/, 2),
  E('taxis', 'taxis jaunes', 'yellow taxis', /\btaxis?\b/, 3),
  E('buses', 'bus urbains', 'city buses', /\bbus\b/, 4),
  E('motos', 'motos et tricycles', 'motorbikes and tricycles', /\b(motos?|tricycles?|scooters?)\b/, 5),
  E('pedestrians', 'piétons', 'crowded sidewalks with pedestrians', /\b(pietons?|foule|passants?|trottoirs?|clients?|travailleurs?|etudiants?)\b/, 6),
  E('vendors', 'vendeurs ambulants', 'street vendors', /\b(vendeurs?|commercants?|marchands?|ambulants?)\b/, 7, { size: 'petit' }),
  E('market_stalls', 'étals du marché', 'market stalls with parasols and fruit', /\b(etals?|marches?|parasols?|baches?|chaises? en plastique|caisses?)\b/, 8),
  E('traffic_lights', 'feux de circulation', 'traffic lights and pedestrian crossings', /\b(feux|passages? pietons?|intersections?|carrefours?|marquages?)\b/, 9),
  E('street_trees', 'arbres urbains', 'street trees', /\barbres?\b/, 10),
  E('signs', 'enseignes', 'shop signs and billboards', /\b(enseignes?|affiches?|panneaux?|publicit\w*)\b/, 11),
  E('skyline', 'skyline', 'a skyline of modern towers in the distance', /\b(skyline|immeubles?|tours?)\b/, 12),
  E('children', 'enfants', 'children playing', /\benfants?\b/, 13, { size: 'petit' }),
  E('dogs', 'chiens errants', 'stray dogs', /\bchiens?\b/, 14, { size: 'petit' }),
  E('birds', 'oiseaux', 'birds', /\boiseaux?\b/, 15, { size: 'petit' }),
  E('clouds', 'nuages', 'clouds', /\bnuages?\b/, 16),
  E('cables', 'câbles électriques', 'overhead power cables, antennas, air conditioners and street lamps', /\b(cables?|antennes?|climatis\w*|lampadaires?|bornes?|poubelles?|nids? de poule)\b/, 17),
  E('bus_stop', 'arrêt de bus', 'a bus stop', /\barrets? de bus\b/, 18),
  E('sun', 'soleil bas', 'low golden sun and long shadows', /\b(soleil|doree|ombres?|apres midi)\b/, 19),
];
interface ThemeDef {
  id: Exclude<SceneTheme, 'nature'>;
  detect: (f: string) => boolean;
  catalog: CatalogEntry[];
  always: SceneComp[];
  count?: { re: RegExp; base: number; def: number };
  time: (f: string) => SceneTime;
  camera: (f: string) => SceneCamera;
  light: (time: SceneTime, comps: Set<SceneComp>) => string;
  view: string;
}
const sunTime = (f: string, def: SceneTime): SceneTime =>
  /\b(nuit|nocturne)\b/.test(f) ? 'night' : /\b(coucher|couchant|crepuscule|soir)/.test(f) ? 'sunset' : /\b(aube|lever du soleil|matin)/.test(f) ? 'dawn' : def;
/** The universes, in detection order (the most specific first). */
const THEMES: ThemeDef[] = [
  {
    id: 'planet',
    detect: (f) => /\b(depuis l espace|vue de l espace|observee depuis l espace|en orbite|orbite|globe terrestre)\b/.test(f) || (/\bplanete\b/.test(f) && /\b(espace|atmosphere|continents?)\b/.test(f)),
    catalog: PLANET_CATALOG,
    always: ['planet', 'oceans', 'continents', 'atmosphere', 'clouds', 'sun'],
    time: () => 'day',
    camera: () => 'descent',
    light: () => 'lumière du soleil rasante, terminateur jour / nuit, atmosphère bleutée, villes allumées côté nuit',
    view: 'depuis l’orbite, descente continue de la caméra jusqu’à basse altitude',
  },
  {
    id: 'mars',
    detect: (f) => /\b(martien\w*|planete rouge|sur mars|de mars|colonie martienne)\b/.test(f),
    catalog: MARS_CATALOG,
    always: ['domes', 'mountains', 'red_sky', 'tracks', 'valley'],
    count: { re: /\bdomes?/, base: 5, def: 5 },
    time: (f) => sunTime(f, 'day'),
    camera: () => 'panorama',
    light: (t) => (t === 'sunset' ? 'coucher de soleil bleuté de Mars, ciel rouge-ocre' : 'lumière martienne ocre, ciel rouge poussiéreux'),
    view: 'vue panoramique de la vallée martienne, dômes au centre, montagnes au loin',
  },
  {
    id: 'street',
    detect: (f) =>
      /\b(rues?|avenues?|quartiers?|carrefours?|marches?)\b/.test(f) &&
      (/\b(africain\w*|abidjan|dakar|lagos|kinshasa|bamako|douala|accra|cotonou|lome|ouagadougou|yopougon|treichville|adjame|cocody|abobo|marcory)\b/.test(f) || /\brue\w* (tres |ultra |extremement )?(animee|vivante|commercante|bondee)/.test(f)),
    catalog: STREET_CATALOG,
    always: ['shops', 'traffic', 'pedestrians', 'traffic_lights', 'cables', 'skyline'],
    time: (f) => (/\b(fin d apres midi|coucher|doree|soleil bas)/.test(f) ? 'sunset' : sunTime(f, 'day')),
    camera: () => 'flythrough',
    light: (t) => (t === 'sunset' ? 'fin d’après-midi, lumière chaude et dorée, soleil bas, longues ombres sur la chaussée' : 'plein jour tropical'),
    view: 'vue aérienne de la ville puis descente dans la rue principale, suivi de la circulation, remontée sur le quartier',
  },
  {
    id: 'scifi',
    detect: (f) => SCIFI_RE.test(f),
    catalog: SCIFI_CATALOG,
    always: ['skyscrapers', 'neon', 'avenues'],
    count: { re: /\b(gratte ciels?|immeubles?|tours?|buildings?)/, base: 1200, def: 1800 },
    time: (f) => (/\b(jour|journee|midi|plein soleil|matin)\b/.test(f) && !/\bnuit\b/.test(f) ? 'day' : 'night'),
    camera: (f) => (/\b(vue aerienne|plongee)\b/.test(f) ? 'aerial' : 'flythrough'),
    light: (t, c) => (t === 'day' ? 'jour, reflets sur les façades de verre' : 'nuit, néons bleus et violets, écrans holographiques, reflets sur les avenues mouillées' + (c.has('rain') ? ', pluie légère' : '')),
    view: 'caméra volante de cinéma traversant la ville entre les tours, vers la tour iconique au centre',
  },
  {
    id: 'coastal',
    detect: (f) => /\b(bord de l ocean|bord de mer|au bord de l ocean|front de mer|littoral|port commercial|baie)\b/.test(f) && /\b(metropole|ville|cite|capitale|quartiers?|tours?)\b/.test(f),
    catalog: COASTAL_CATALOG,
    always: ['glass_towers', 'ocean', 'avenues'],
    count: { re: /\b(tours?|gratte ciels?|immeubles?)/, base: 700, def: 900 },
    time: (f) => sunTime(f, 'day'),
    camera: () => 'aerial',
    light: (t) => (t === 'sunset' ? 'soleil couchant doré et orange sur la skyline, reflets sur l’océan' : 'lumière tropicale, reflets sur les façades de verre'),
    view: 'vue aérienne de documentaire d’architecture : skyline, port et océan',
  },
  {
    id: 'forest',
    detect: (f) => /\b(foret (magique|enchantee|feerique|immense|primaire|ancienne)|immense foret|sous bois|canopee)\b/.test(f) && !/\b(ville|cite|chateau)\b/.test(f),
    catalog: FOREST_CATALOG,
    always: ['giant_trees', 'moss', 'sun'],
    count: { re: /\b(arbres?|troncs?)/, base: 900, def: 900 },
    time: (f) => sunTime(f, 'dawn'),
    camera: () => 'ground',
    light: (t) => (t === 'dawn' ? 'lever du soleil, rayons dorés à travers la canopée, brume matinale' : 'lumière filtrée par la canopée'),
    view: 'au sol, entre les troncs géants, profondeur de champ',
  },
];
/** The reading of a request in one universe: same contract (segments attached to what draws them, the rest « missing »). */
function parseThemed(prompt: string, f: string, def: ThemeDef): SceneSpec {
  const named = new Map<SceneComp, CatalogEntry>();
  for (const c of def.catalog) if (c.re.test(f) && !named.has(c.id)) named.set(c.id, c);
  const comps = new Set<SceneComp>([...named.keys(), ...def.always]);
  const { items, circumstances } = promptItems(prompt);
  const segs = [...items.map((i) => i.text), ...circumstances];
  const detail = new Map<string, string[]>();
  const missing: string[] = [];
  let covered = 0;
  for (const sgm of segs) {
    const fs = fold(sgm);
    const hits = [...named.values()].filter((c) => c.re.test(fs));
    if (hits.length) {
      covered++;
      for (const h of hits) detail.set(h.id, [...(detail.get(h.id) ?? []), sgm]);
    } else if (STYLE.test(fs) || def.detect(fs) || SCENE_WORDS.test(fs) || fs.split(' ').length <= 2) {
      covered++;
      detail.set('__style', [...(detail.get('__style') ?? []), sgm]);
    } else missing.push(sgm.trim());
  }
  const elements: SceneElement[] = [...named.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => ({ comp: c.id, name: c.name, where: c.where, size: c.size, detail: (detail.get(c.id) ?? []).join(' · ') }));
  const style = detail.get('__style');
  if (style?.length && elements[0]) elements[0].detail = [elements[0].detail, ...style].filter(Boolean).join(' · ');
  const counts = { ...BASE_COUNTS };
  if (def.count) {
    const n = Math.round(quantity(f, def.count.re, def.count.base) ?? def.count.def);
    if (def.id === 'forest') counts.trees = n;
    else counts.houses = n;
  }
  if (/\b(milliers d arbres|des milliers)/.test(f) && def.id === 'forest') counts.trees = Math.max(counts.trees, 1600);
  const time = def.time(f);
  return {
    seed: seedOf(f),
    theme: def.id,
    comps: [...comps],
    elements,
    counts,
    boost: {},
    time,
    season: 'summer',
    camera: def.camera(f),
    mood: /\b(feerique|magique|enchant|contemplati)/.test(f) ? 'fairy' : 'epic',
    fog: /\b(brume|brouillard|smog|poussiere)/.test(f) ? 0.8 : 0.4,
    wind: /\b(vent|tempete)/.test(f) ? 0.8 : 0.4,
    light: def.light(time, comps) + (circumstances.length ? ` — ${circumstances.join(' ; ')}` : ''),
    view: def.view,
    missing,
    coverage: covered / (segs.length || 1),
    source: 'local',
  };
}

/**
 * Is the request a scene the engine can draw by itself? A described place (several of its components named, no data,
 * nothing it cannot draw dominating the request).
 */
export function instantSuited(spec: SceneSpec, hasData = false): boolean {
  const landscape = spec.elements.filter((e) => !['sun', 'birds', 'clouds'].includes(e.comp)).length;
  return !hasData && landscape >= 3 && spec.coverage >= 0.6;
}

// ── JEV : la lecture typée du prompt (≈ 0,0001 $) ────────────────────────────────────────────────────────────────────
/** JEV's questions on a request: one Noul per component, the counts as Scores, time / season / framing / mood as Choices. */
export function jevSceneQuestions(): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {
    scene: {
      type: 'noul',
      instructions:
        'Does `request` describe a landscape, place, town or natural environment to depict as a picture (not an app, a chart, a character portrait, a single object or a game)?',
    },
    other: {
      type: 'noul',
      instructions: `Does \`request\` require important visible elements that are NOT in \`engine_can_draw\` (the sky, light and camera are always drawn)?`,
    },
    houses: {
      type: 'score',
      instructions: 'How many buildings or houses does `request` ask for?',
      criteria: [
        'none: no settlement at all',
        'a hamlet: under twenty houses',
        'a village: a few dozen houses',
        'a town: about a hundred houses',
        'a city: hundreds of houses',
        'a huge city: a sprawling mass of hundreds to thousands of houses',
      ],
    },
    trees: {
      type: 'score',
      instructions: 'How much forest or how many trees does `request` ask for?',
      criteria: [
        'no trees',
        'a few scattered trees',
        'groves and woods',
        'large forests',
        'vast forests with thousands of trees',
      ],
    },
    time: {
      type: 'choice',
      instructions: 'At what time of day is the scene of `request`?',
      criteria: {
        dawn: 'dawn or sunrise, early morning',
        day: 'full daylight, or no time stated',
        sunset: 'sunset, golden hour, dusk or evening',
        night: 'night, moonlight, stars',
      },
    },
    season: {
      type: 'choice',
      instructions: 'In what season is the scene of `request`?',
      criteria: {
        summer: 'summer, or no season stated',
        autumn: 'autumn, orange and red leaves',
        winter: 'winter, snow',
        spring: 'spring, blossoms',
      },
    },
    camera: {
      type: 'choice',
      instructions: 'From what point of view should the scene of `request` be seen?',
      criteria: {
        panorama: 'a wide panoramic or establishing view from a distance, or no view stated',
        aerial: 'an aerial, bird’s-eye or drone view from high above',
        ground: 'a view from the ground, at human height, inside or near the place',
      },
    },
    theme: {
      type: 'choice',
      instructions: 'Which universe does `request` describe?',
      criteria: {
        nature: 'a natural landscape, a village, a historic or medieval town, the countryside, today or in the past',
        scifi: 'a futuristic, science-fiction or cyberpunk city (skyscrapers, neon, holograms, flying vehicles)',
        planet: 'a whole planet seen from space, orbit or a descent from space',
        coastal: 'a modern city of today on the sea or ocean (towers, port, highways)',
        forest: 'a forest, magical or natural, seen from inside',
        mars: 'a colony or landscape on Mars or another planet’s surface',
        street: 'a lively city street seen at human scale (shops, traffic, pedestrians, market)',
      },
    },
    mood: {
      type: 'choice',
      instructions: 'What mood does `request` ask for?',
      criteria: {
        epic: 'epic, grandiose, cinematic, heroic',
        calm: 'peaceful, calm, serene',
        dark: 'dark, threatening, stormy',
        fairy: 'fairy-tale, magical, enchanted',
      },
    },
  };
  const seen = new Set<string>();
  for (const c of [...uniqueCatalog(), ...THEMES.flatMap((t) => t.catalog)])
    if (!seen.has(c.id) && seen.add(c.id)) q[`c_${c.id}`] = { type: 'noul', instructions: `Does \`request\` ask for ${c.en} to be visible in the scene (named or clearly implied)?` };
  return q;
}
const uniqueCatalog = () => CATALOG.filter((c, i) => CATALOG.findIndex((x) => x.id === c.id) === i);
/** The state JEV reads (the request only: never any client data). */
export const jevSceneState = (prompt: string) => ({
  request: prompt.slice(0, 4000),
  engine_can_draw: [...new Set([...uniqueCatalog(), ...THEMES.flatMap((t) => t.catalog)].map((c) => c.en))],
});
type Ans = Record<string, { choice?: string; score?: number; noul?: number }>;
const HOUSES_BY_SCORE = [0, 14, 60, 120, 380, 520];
const TREES_BY_SCORE = [0, 120, 700, 1800, 3600];
/**
 * The local reading refined by JEV: a component JEV is sure of is added (a synonym the lexicon missed), one it is sure
 * is NOT asked is dropped (a word used in another sense); counts from the Scores when the request gave no number.
 */
export function specFromJev(local: SceneSpec, a: Ans, prompt: string): SceneSpec {
  const s: SceneSpec = structuredClone(local);
  s.source = 'jev';
  const has = (id: SceneComp) => s.elements.some((e) => e.comp === id);
  const cat = THEMES.find((t) => t.id === s.theme)?.catalog ?? uniqueCatalog();
  for (const c of cat) {
    const p = a[`c_${c.id}`]?.noul;
    if (p === undefined) continue;
    if (p >= 0.7 && !has(c.id)) {
      s.elements.push({ comp: c.id, name: c.name, where: c.where, size: c.size, detail: '' });
      if (!s.comps.includes(c.id)) s.comps.push(c.id);
      for (const x of IMPLIES[c.id] ?? []) if (!s.comps.includes(x)) s.comps.push(x);
    } else if (p < 0.12 && has(c.id) && !c.re.test(fold(prompt).split(' ').slice(0, 3).join(' '))) {
      s.elements = s.elements.filter((e) => e.comp !== c.id);
    }
  }
  s.elements.sort((x, y) => rankOf(x.comp) - rankOf(y.comp));
  const f = fold(prompt);
  if (a.houses?.score !== undefined && quantity(f, /\b(maisons?|habitations?)/, 380) === null)
    s.counts.houses = HOUSES_BY_SCORE[Math.round(a.houses.score)] ?? s.counts.houses;
  if (a.trees?.score !== undefined && quantity(f, /\b(arbres?|forets?)/, 2600) === null)
    s.counts.trees = TREES_BY_SCORE[Math.round(a.trees.score)] ?? s.counts.trees;
  const pick = <T extends string>(k: string, allowed: readonly T[], cur: T): T => {
    const c = a[k]?.choice as T | undefined;
    return c && allowed.includes(c) ? c : cur;
  };
  s.time = pick('time', ['dawn', 'day', 'sunset', 'night'] as const, s.time);
  s.season = pick('season', ['summer', 'autumn', 'winter', 'spring'] as const, s.season);
  if (s.theme === 'nature') s.camera = pick('camera', ['panorama', 'aerial', 'ground'] as const, s.camera);
  s.mood = pick('mood', ['epic', 'calm', 'dark', 'fairy'] as const, s.mood);
  // JEV says the request needs what the engine cannot draw: keep the local list, or flag it when the lexicon saw nothing.
  if ((a.other?.noul ?? 0) >= 0.6 && !s.missing.length) s.missing.push('éléments hors du moteur de scène (selon JEV)');
  if ((a.scene?.noul ?? 1) < 0.35) s.coverage = Math.min(s.coverage, 0.3);
  return s;
}
const rankOf = (id: SceneComp) => [...CATALOG, ...THEMES.flatMap((t) => t.catalog)].find((c) => c.id === id)?.rank ?? 99;

// ── LA PAGE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const safeJson = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
/** The realize spec of the page (what the fidelity check and the eye of JEV read). */
export function realizeSpecOf(spec: SceneSpec) {
  return {
    elements: spec.elements.map((e) => ({ name: e.name, where: e.where, size: e.size, detail: e.detail })),
    light: spec.light,
    view: spec.view,
    time: spec.time,
  };
}
/**
 * The whole page: a canvas, the realize spec, the engine (sceneMain, type-checked TypeScript serialized as is) and the
 * scene's spec. three.js comes from the sandbox's import map (MIT).
 */
export function sceneHtml(spec: SceneSpec, title = 'Scène'): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title.slice(0, 80))}</title>
<style>html,body{margin:0;height:100%;background:#0b0d14;overflow:hidden;font-family:Inter,system-ui,sans-serif}
#scene{position:fixed;inset:0;width:100%;height:100%;display:block}
.bar{position:fixed;left:0;right:0;height:5.5vh;background:#000;pointer-events:none;z-index:2}.bar.t{top:0}.bar.b{bottom:0}
#cap{position:fixed;left:14px;bottom:calc(5.5vh + 10px);z-index:3;color:#f5e6c8;font-size:11px;letter-spacing:.04em;background:rgba(10,12,20,.42);backdrop-filter:blur(6px);padding:6px 10px;border-radius:999px;opacity:.86}
#load{position:fixed;inset:0;display:grid;place-items:center;color:#e8d9b8;font-size:13px;letter-spacing:.08em;z-index:4;background:#0b0d14;transition:opacity .6s}</style>
<script type="application/json" id="realize-spec">${safeJson(realizeSpecOf(spec))}</script>
</head><body><canvas id="scene" data-element="${esc(spec.elements[0]?.name ?? 'scène')}"></canvas><div class="bar t"></div><div class="bar b"></div><div id="cap"></div><div id="load">JEV construit la scène…</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';${spec.theme === 'scifi' || spec.theme === 'coastal' ? "\nimport { Reflector } from 'three/addons/objects/Reflector.js';" : ''}
const SPEC = ${safeJson(spec)};
// (a transpiler may wrap named functions in __name(): harmless here)
const __name = (f) => f;
(${RUNTIME(spec.theme).toString()})(THREE, OrbitControls, SPEC, { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, GTAOPass${spec.theme === 'scifi' || spec.theme === 'coastal' ? ', Reflector' : ''} });
</script></body></html>`;
}

// ── LA BOUCLE : rendu → fidélité → œil de JEV → réglages du moteur (sans modèle de langage) ──────────────────────────
/** The components whose element the eye did not see get bigger, brighter, closer to the camera's centre. */
export function boostFromEye(spec: SceneSpec, unseen: string[]): SceneSpec {
  const s: SceneSpec = structuredClone(spec);
  for (const name of unseen) {
    const e = s.elements.find((x) => fold(name).includes(fold(x.name)) || fold(x.name).includes(fold(name)));
    if (e) s.boost[e.comp] = Math.min(2.6, (s.boost[e.comp] ?? 1) * 1.6);
  }
  return s;
}
/** The element names quoted in the eye's / fidelity's French problems (« … « rivière » … »). */
export const quotedNames = (problems: string[]) =>
  problems.map((p) => /«\s*([^»]+?)\s*»/.exec(p)?.[1] ?? '').filter(Boolean);

export async function realizeInstant(o: {
  prompt: string;
  spec: SceneSpec;
  run: (html: string) => Promise<RealizeRun>;
  see?: (run: RealizeRun, spec: SceneSpec) => Promise<string[] | null>;
  maxRounds?: number;
  onRound?: (r: RealizeRound) => void;
}): Promise<{ ok: boolean; rounds: RealizeRound[]; code: string; spec: SceneSpec }> {
  const maxRounds = Math.max(1, o.maxRounds ?? 2);
  let spec = o.spec;
  const rounds: RealizeRound[] = [];
  for (let r = 1; r <= maxRounds; r++) {
    const code = sceneHtml(spec, o.prompt.slice(0, 60));
    const run = await o.run(code);
    if (run.ok) {
      const fp: RealizeError[] = fidelityProblems(o.prompt, run);
      if (fp.length) run.warnings.push(...fp.map((e) => `fidélité : ${e.msg}`));
    }
    let unseen: string[] = [];
    if (run.ok && o.see) {
      const seen = await o.see(run, spec).catch(() => null);
      if (seen?.length) {
        unseen = quotedNames(seen);
        if (r < maxRounds && unseen.length) {
          run.ok = false;
          run.errors.push(...seen.map((msg) => ({ kind: 'spec' as const, msg, line: null })));
        } else run.warnings.push(...seen.map((m) => `œil de JEV : ${m}`));
      }
    }
    const feedback = r > 1 ? `réglages du moteur : ${Object.entries(spec.boost).map(([k, v]) => `${k} ×${(v ?? 1).toFixed(2)}`).join(', ')}` : '';
    const round = { round: r, code, run, feedback };
    rounds.push(round);
    o.onRound?.(round);
    if (run.ok) return { ok: true, rounds, code, spec };
    // The page itself failed (network, WebGL): no engine setting would change it.
    if (!unseen.length) return { ok: false, rounds, code, spec };
    spec = boostFromEye(spec, unseen);
  }
  const last = rounds[rounds.length - 1]!;
  return { ok: last.run.ok, rounds, code: last.code, spec };
}

// ── CE QUE JEV APPREND : les réglages qui ont fait voir un élément, par univers (mémoire locale de l'app) ─────────────
export type SceneLessons = Partial<Record<SceneTheme, Partial<Record<SceneComp, number>>>>;
/** The settings learned for this universe start the scene (an element once missed is drawn bigger from the start). */
export function applyLessons(spec: SceneSpec, lessons: SceneLessons | null | undefined): SceneSpec {
  const l = lessons?.[spec.theme];
  if (!l) return spec;
  const s: SceneSpec = structuredClone(spec);
  for (const [k, v] of Object.entries(l)) if (v && s.comps.includes(k as SceneComp)) s.boost[k as SceneComp] = Math.max(s.boost[k as SceneComp] ?? 1, v);
  return s;
}
/** After a run: the boosts of a scene the eye finally saw become lessons (kept at most ×2.6, never lowered). */
export function learnLessons(lessons: SceneLessons, spec: SceneSpec, ok: boolean): SceneLessons {
  if (!ok) return lessons;
  const out: SceneLessons = structuredClone(lessons ?? {});
  const cur = (out[spec.theme] ??= {});
  for (const [k, v] of Object.entries(spec.boost)) if (v && v > 1) cur[k as SceneComp] = Math.min(2.6, Math.max(cur[k as SceneComp] ?? 1, v));
  return out;
}

// ── LE COMPLÉMENT PAR LE MODÈLE : un petit module branché sur la scène (pas une page entière à réécrire) ──────────
/** The system prompt of the add-on: the scene exists, the model only adds what the engine could not draw. */
export function addonSystemPrompt(spec: SceneSpec): string {
  return [
    'Tu complètes une scène three.js DÉJÀ construite et animée dans la page (ne la reconstruis pas).',
    'Réponds par UN seul bloc ```js … ``` : un module ES qui commence par `import * as THREE from "three";` et AJOUTE à la scène les éléments demandés, animés, à l’échelle (1 unité = 1 m).',
    'Disponible : window.__scene = { scene, camera, renderer, heightAt?(x, z) (hauteur du sol, univers nature), made (éléments déjà dessinés) }.',
    'Place les ajouts dans le champ de la caméra (camera.position, camera.getWorldDirection) ; anime-les avec ta propre boucle requestAnimationFrame ; aucune ressource réseau, aucune texture distante (dessine en canvas si besoin).',
    'Termine par : window.REALIZE_ELEMENTS = [...(window.REALIZE_ELEMENTS || []), …noms ajoutés];',
    `Univers : ${spec.theme} ; lumière : ${spec.light} ; cadrage : ${spec.view}.`,
  ].join('\n');
}
export const addonUserPrompt = (missing: string[]) => `Ajoute à la scène : ${missing.map((m) => `« ${m} »`).join(', ')}.`;
/** The page with the add-on module appended (after the engine's own module). */
export function withAddon(html: string, code: string): string {
  const js = code.replace(/^[\s\S]*?```(?:js|javascript)?\s*/i, '').replace(/```[\s\S]*$/, '').trim() || code;
  return html.replace(/<\/body>/i, `<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script></body>`);
}
