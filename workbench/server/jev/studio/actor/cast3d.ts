/**
 * ACTEURS 3D RÉUTILISABLES — pure part (no three.js): a character sheet becomes a 3D actor « look » (skin, outfit
 * colours, hair style, glasses, beard, build, height, age), stored in a LIBRARY keyed by the character's name so the
 * same actor plays in every film (rigged once, reused); the mouth shapes of the lip-sync (visemes of the words being
 * said), the acting layer driven by the voice (beats, nods, laugh) and the procedural set of each location.
 * Nothing here is invented about a character: what the sheet says is used; what it does not say is chosen once,
 * deterministically from the name (same name → same actor), and stored.
 */
import type { CharacterSheet } from '../types';
import { characterGender, speakerKey } from '../motion';

/** Lower case without accents (\b does not see accented letters as word letters). */
export const plain = (s: string) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export type HairStyle = 'court' | 'afro' | 'chauve' | 'dégarni' | 'tresses' | 'twists' | 'chignon' | 'foulard';
export type AgeGroup = 'enfant' | 'ado' | 'adulte' | 'senior';
/** Silhouettes of the @comedyvideos_100 sketches: curvy women, lanky men (often with a pot belly), round uncles / aunties. */
export type BodyShape = 'courbes' | 'élancé' | 'rond' | 'standard';
export type Pattern = 'uni' | 'wax' | 'pois' | 'fleurs' | 'brodé' | 'maillot';
export type Footwear = 'tongs' | 'chaussures' | 'baskets';
export type Sleeves = 'sans' | 'courtes' | 'longues';
export type Prop = 'bouteille' | 'téléphone' | 'balai' | 'sac' | 'assiette' | 'journal' | 'verre' | 'chapelet' | 'valise' | 'bâton';
/** Resting face of the character (its comic signature): eyelids, smile, frown, one eyebrow up, chin, eye size. */
export interface FaceTraits {
  lid: number;
  smile: number;
  angry: number;
  raise: number;
  chin: number;
  eyes: number;
}
export interface ActorLook3D {
  /** Library key = speakerKey(name): « Frère (off) », « FRÈRE » and « frere » are the same actor. */
  key: string;
  name: string;
  /** Short comic role (shown in the casting, given to the writer for recurring actors). */
  role?: string;
  gender: 'm' | 'f';
  age: AgeGroup;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Head-wrap (foulard / gélé) colour when hairStyle = foulard. */
  wrap?: string;
  /** Headband over natural hair (the woman of the reference clip). */
  headband?: string;
  /** Cap / hat. */
  cap?: { kind: 'casquette' | 'chapeau' | 'béret'; color: string };
  top: string;
  bottom: string;
  shoes: string;
  /** Long garment (boubou, robe, pagne long): one piece from the chest to the calves. */
  dress: boolean;
  pattern: Pattern;
  /** Second colour of the outfit (wax motifs, embroidery, dots, tie). */
  accent: string;
  /** Vest / T-shirt worn under an open shirt. */
  inner?: string;
  sleeves: Sleeves;
  feet: Footwear;
  shape: BodyShape;
  glasses: boolean;
  beard: boolean;
  moustache: boolean;
  beads?: boolean;
  watch?: boolean;
  /** Signature prop, held when the scene names none. */
  prop?: Prop;
  face: FaceTraits;
  /** Body scale (child 0.62 … tall adult 1.06). */
  height: number;
  /** Width factor (slim 0.85 … stout 1.3). */
  build: number;
  belly: boolean;
  /** Optional VRM model (asset id of the .vrm blob) that replaces the procedural body. */
  vrmAssetId?: string;
  /**
   * The owner's CHARACTER SHEET (their own art, on a green screen): the cut-out poses play the character in the
   * montage, and the whole sheet is the reference image of the character for the image / video models.
   */
  sheet?: { sourceAssetId: string; poses: SheetPose[] };
  /** Where the look comes from: the character sheet, the troupe, edited by hand, or an imported VRM. */
  source: 'fiche' | 'troupe' | 'manuel' | 'vrm' | 'planche';
  updatedAt?: number;
  /** Films this actor played in (reuse counter, never estimated). */
  films?: number;
}

const COLORS: [RegExp, string][] = [
  [/\b(bleu marine|navy|marine)s?\b/, '#1d2b53'],
  [/\b(bleu ciel|sky blue|light blue|bleu clair)s?\b/, '#5fa8e8'],
  [/\b(turquoise|teal|bleu canard)s?\b/, '#1f9e9a'],
  [/\b(bleu|bleue|blue)s?\b/, '#2456b8'],
  [/\b(bordeaux|burgundy|maroon)s?\b/, '#6e1423'],
  [/\b(rouge|red)s?\b/, '#c62828'],
  [/\b(rose|pink|fuchsia)s?\b/, '#e0559a'],
  [/\b(violet|violette|purple|mauve)s?\b/, '#6a3d9a'],
  [/\b(orange|orangee?)s?\b/, '#ef7d1a'],
  [/\b(jaune|yellow|moutarde|mustard)s?\b/, '#f2c12e'],
  [/\b(dore|doree|gold|golden)s?\b/, '#d4a017'],
  [/\b(vert olive|olive|kaki|khaki)s?\b/, '#6b6b2a'],
  [/\b(vert|verte|green)s?\b/, '#2e8b57'],
  [/\b(beige|creme|cream|ecru)s?\b/, '#e3d3b0'],
  [/\b(marron|brun|brune|brown|chocolat)s?\b/, '#6b4226'],
  [/\b(gris|grise|grey|gray|anthracite)s?\b/, '#6f7378'],
  [/\b(blanc|blanche|white)s?\b/, '#f2f0ea'],
  [/\b(noir|noire|black)s?\b/, '#1c1c1f'],
];
/** First colour named in a text (FR / EN), or null. */
export function colorIn(text: string): string | null {
  return colorsIn(text)[0] ?? null;
}
/** Every colour named in a text, in reading order (« orange-and-yellow wax » → orange, yellow). */
export function colorsIn(text: string): string[] {
  const t = ` ${plain(text)} `;
  const found: { at: number; hex: string }[] = [];
  for (const [re, hex] of COLORS) {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(t))) if (!found.some((f) => Math.abs(f.at - m!.index) < 2)) found.push({ at: m.index, hex });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.hex).filter((h, i, a) => a.indexOf(h) === i);
}
const TOP = /\b(chemise|boubou|t-?shirt|tee-?shirt|costume|veste|blouse|polo|tunique|maillot|chemisier|pull|gilet|haut|tenue|shirt|suit|jacket|blazer|top|sweater|uniforme|uniform|robe|dress|kaftan|caftan|grand boubou|complet|jersey|debardeur|tank top|abacost)\b/;
const BOTTOM = /\b(pantalon|jean|jeans|pagne|jupe|short|shorts|bermuda|trousers|pants|skirt|wrapper)\b/;
const FULL = /\b(costume|suit|boubou|robe|dress|kaftan|caftan|complet|uniforme|uniform|tenue|abacost)\b/;
const LONG = /\b(boubou|robe|dress|kaftan|caftan|pagne long|long wrapper|grand boubou|gandoura|djellaba)\b/;
const SHOE = /\b(chaussures?|sandales?|baskets?|tongs?|babouches?|mocassins?|shoes?|sneakers?|sandals?|boots?|bottes?|flip-?flops?)\b/;
/** A tiny stable hash of the name (same name → same choices, film after film). */
export function nameHash(s: string): number {
  let h = 2166136261;
  for (const c of speakerKey(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const SKINS = ['#4a2614', '#5a3018', '#3d1f10', '#6b3a1e'];
const BRIGHT = ['#e8742a', '#2a9d8f', '#c62828', '#f2c12e', '#2456b8', '#6a3d9a', '#2e8b57', '#e0559a'];
const DARK = ['#1d2b53', '#3b2a1a', '#1c1c1f', '#4a4f57', '#2f4f3a'];
export function skinOf(text: string, h: number): string {
  const t = plain(text);
  if (/(tres fonce|ebene|ebony|very dark|deep dark)/.test(t)) return '#3a1d0e';
  if (/(fonce|dark brown|dark skin|peau noire|noir)/.test(t)) return '#4a2614';
  if (/(caramel|medium brown|chocolat au lait)/.test(t)) return '#7a4a2a';
  if (/(metis|light brown|clair|light skin|olive skin)/.test(t)) return '#a06a45';
  if (/(pale|fair|blanc|white skin|caucas)/.test(t)) return '#e0b896';
  if (/(brun|brown|marron)/.test(t)) return '#5a3018';
  return SKINS[h % SKINS.length]!;
}
export function ageGroupOf(age = '', role = ''): AgeGroup {
  const t = plain(`${age} ${role}`);
  const n = Number(/(\d{1,3})\s*(ans|years|yo|an)?/.exec(age)?.[1] ?? NaN);
  if ((Number.isFinite(n) && n < 13) || /\b(enfant|child|kid|fillette|bebe|petit garcon|petite fille|garcon|boy|girl)\b/.test(t)) return 'enfant';
  if ((Number.isFinite(n) && n < 18) || /\b(ado|adolescent|teen)/.test(t)) return 'ado';
  if ((Number.isFinite(n) && n >= 55) || /\b(vieux|vieille|grand-pere|grand-mere|old|elderly|aine|doyen|mamie|papi)\b/.test(t)) return 'senior';
  return 'adulte';
}
/** Clothing text → top / bottom colours (+ the second colour), long garment, print, shoes. */
export function outfitOf(clothing: string): { top: string | null; bottom: string | null; second: string | null; dress: boolean; pattern: Pattern; shoes: string | null } {
  const t = plain(clothing);
  let top: string | null = null;
  let bottom: string | null = null;
  let second: string | null = null;
  let shoes: string | null = null;
  // One piece per segment: « chemise bleue, pantalon noir et sandales marron » (« orange-and-yellow » stays one piece).
  for (const seg of t.split(/,|;|\bet\b|\bavec\b|\bwith\b|\bsur\b|\bover\b|\+|\band\b(?![- ])/)) {
    const cs = colorsIn(seg);
    if (!cs.length) continue;
    if (SHOE.test(seg)) shoes ??= cs[0]!;
    else if (BOTTOM.test(seg) && !TOP.test(seg)) bottom ??= cs[0]!;
    else if (TOP.test(seg)) {
      if (!top) {
        top = cs[0]!;
        second = cs[1] ?? null;
      }
      if (FULL.test(seg)) bottom ??= cs[0]!;
    }
  }
  // A colour named without a garment (« tenue jaune vif ») dresses the top.
  if (!top) {
    const cs = colorsIn(t.replace(SHOE, ''));
    top = cs[0] ?? null;
    second ??= cs[1] ?? null;
  }
  return { top, bottom, second, dress: LONG.test(t), pattern: patternOf(t), shoes };
}
export function patternOf(clothing: string): Pattern {
  const t = plain(clothing);
  if (/\b(pois|polka|dots?|dotted)\b/.test(t)) return 'pois';
  if (/\b(fleurs?|fleuri|floral|flowers?|hawai\w*)\b/.test(t)) return 'fleurs';
  if (/\b(brode|brodee|embroider\w*|bazin)\b/.test(t)) return 'brodé';
  if (/\b(maillot|jersey|football)\b/.test(t)) return 'maillot';
  if (/\b(wax|kente|bogolan|pagne imprime|imprime|print|batik|motifs?)\b/.test(t)) return 'wax';
  return 'uni';
}
export function hairOf(hair: string, accessories: string, gender: 'm' | 'f', age: AgeGroup, h: number): { style: HairStyle; color: string; wrap?: string } {
  const t = plain(`${hair} ${accessories}`);
  const hp = plain(hair);
  const grey = /\b(gris|grise|grey|gray|blanc|blancs|white|poivre et sel|salt and pepper)\b/.test(hp) || (age === 'senior' && !/\b(noir|black|teint|teints|dyed)\b/.test(hp));
  const color = grey ? '#b9b6b0' : /\b(roux|red hair|auburn)\b/.test(t) ? '#7a2e12' : /\b(blond|blonde)\b/.test(t) ? '#c9a35a' : '#120c08';
  const wrapM = /\b(foulard|gele|headwrap|head wrap|head-wrap|turban|mouchoir de tete)\b[^,;.]*/.exec(t);
  if (wrapM) return { style: 'foulard', color, wrap: colorIn(wrapM[0]) ?? BRIGHT[(h >> 3) % BRIGHT.length]! };
  if (/\b(degarni|receding|calvitie|front degarni|tempes)\b/.test(t)) return { style: 'dégarni', color };
  if (/\b(chauve|bald|crane rase|rase|shaved)\b/.test(t)) return { style: 'chauve', color };
  if (/\b(twists?|locks|dreadlocks|dreads|vanilles|puffs?)\b/.test(t)) return { style: 'twists', color };
  if (/\b(tresses|braids|braided|nattes|cornrows)\b/.test(t)) return { style: 'tresses', color };
  if (/\b(afro)\b/.test(t)) return { style: 'afro', color };
  if (/\b(chignon|bun|attaches|tires|queue de cheval|ponytail)\b/.test(t)) return { style: 'chignon', color };
  if (/\b(court|courts|short|ras|coupe courte)\b/.test(t)) return { style: 'court', color };
  // What the sheet does not say: the looks of the sketches (aunties in head-wraps, young women with twists…).
  if (gender === 'f') {
    if (age === 'senior' || (age === 'adulte' && h % 5 === 0)) return { style: 'foulard', color, wrap: BRIGHT[(h >> 3) % BRIGHT.length]! };
    return { style: (['twists', 'tresses', 'chignon', 'afro'] as const)[h % 4]!, color };
  }
  if (age === 'senior') return { style: h % 2 ? 'dégarni' : 'chauve', color };
  if (age === 'adulte') return { style: h % 7 === 0 ? 'chauve' : h % 4 === 0 ? 'dégarni' : 'court', color };
  return { style: 'court', color };
}
const PROPS: [RegExp, Prop][] = [
  [/\b(bouteilles?|bottles?|biere|beer|sucrerie|soda|vin)\b/, 'bouteille'],
  [/\b(telephone|portable|phone|smartphone|cellulaire)\b/, 'téléphone'],
  [/\b(balai|broom)\b/, 'balai'],
  [/\b(sac|sacoche|bag|handbag|panier)\b/, 'sac'],
  [/\b(assiette|plat|plate|bol|gamelle)\b/, 'assiette'],
  [/\b(journal|newspaper|livre|book|papier|lettre|facture|cahier|bible|coran)\b/, 'journal'],
  [/\b(verre|tasse|gobelet|glass|cup|the|cafe)\b/, 'verre'],
  [/\b(chapelet|prayer beads)\b/, 'chapelet'],
  [/\b(valise|suitcase|bagage)\b/, 'valise'],
  [/\b(baton|canne|stick|cane|chicotte|fouet)\b/, 'bâton'],
];
/** The prop named in a text (scene action, line, sheet), if any. */
export function propOf(text = ''): Prop | null {
  const t = plain(text);
  for (const [re, p] of PROPS) if (re.test(t)) return p;
  return null;
}
/** Resting face from the sheet's words (tired, smug, judgmental, curious, raised eyebrow, grin, long face). */
export function faceOf(text: string, gender: 'm' | 'f', age: AgeGroup): FaceTraits {
  const t = plain(text);
  const f: FaceTraits = { lid: 0.18, smile: 0.1, angry: 0, raise: 0, chin: gender === 'm' && age !== 'enfant' ? 1.15 : 1, eyes: age === 'enfant' ? 1.2 : 1 };
  if (/\b(tired|fatigue|las|epuise|sleepy|endormi|blase)\b/.test(t)) f.lid = 0.45;
  if (/\b(smug|malin|innocent|narquois|satisfait|fier|proud)\b/.test(t)) Object.assign(f, { lid: Math.max(f.lid, 0.35), smile: 0.35 });
  if (/\b(judgmental|judging|severe|stare|piercing|percant|autoritaire|furieux|grincheux|stern|angry|colere)\b/.test(t)) Object.assign(f, { angry: 0.45, lid: Math.max(f.lid, 0.25) });
  if (/\b(curious|curieux|curieuse|big eyes|grands yeux|naif|naive|wide eyes)\b/.test(t)) f.eyes = Math.max(f.eyes, 1.25);
  if (/\b(raised eyebrow|sourcil|unimpressed|sceptique|skeptical|mefiant)\b/.test(t)) f.raise = 0.7;
  if (/\b(grin|smile|sourire|souriant|jovial|rieur|cheeky|espiegle|storytelling|vantard|mytho\w*)\b/.test(t)) f.smile = Math.max(f.smile, 0.45);
  if (/\b(loud|criard|criarde|bavard|bavarde|wide mouth|grande bouche)\b/.test(t)) f.smile = Math.max(f.smile, 0.2);
  if (/\b(long face|visage allonge|prominent chin|menton)\b/.test(t)) f.chin = 1.32;
  return f;
}
/** The 3D actor of a character sheet: what the sheet says first, the silhouettes of the sketches otherwise (stable by name). */
export function lookFromSheet(c: Partial<CharacterSheet> & { name: string; prop?: Prop }): ActorLook3D {
  const h = nameHash(c.name);
  const gender = characterGender(c) === 'f' ? 'f' : 'm';
  const age = ageGroupOf(c.age, `${c.role ?? ''} ${c.gender ?? ''}`);
  const clothing = plain(c.clothing ?? '');
  const outfit = outfitOf(clothing);
  const hair = hairOf(c.hair ?? '', c.accessories ?? '', gender, age, h);
  const body = plain(`${c.body ?? ''} ${c.height ?? ''}`);
  const all = plain(`${c.face ?? ''} ${c.accessories ?? ''} ${c.consistency ?? ''} ${c.hair ?? ''}`);
  const role = plain(c.role ?? '');
  const stout = /\b(gros|grosse|corpulent|corpulente|ventru|bedonnant|ventre|enrobe|enrobee|rondelet|rondelette|chubby|fat|stocky|potbelly|pot belly|big belly|plump|fort|forte|large|ronde|rond)\b/.test(body);
  const curvy = /\b(curvy|courbes|pulpeuse|hanches|voluptueuse)\b/.test(body);
  const slim = /\b(mince|maigre|elance|elancee|svelte|thin|slim|skinny|frele|lanky)\b/.test(body);
  const muscled = /\b(muscle|musclee|athletique|muscular|athletic|costaud)\b/.test(body);
  const tall = /\b(grand|grande|tall|geant)\b/.test(body);
  const short = /\b(petit|petite|courte taille)\b/.test(body);
  const kid = age === 'enfant' || age === 'ado';
  // Silhouettes measured on the account's sketches: curvy women, lanky men (half of them with a pot belly), round aunties / uncles.
  const shape: BodyShape = kid ? 'standard' : gender === 'f' ? (stout && !curvy ? 'rond' : slim ? 'standard' : 'courbes') : slim ? 'élancé' : stout ? 'rond' : muscled ? 'standard' : 'élancé';
  const potBelly = /\b(pot belly|potbelly|ventre|bedonnant|ventru|big belly)\b/.test(body);
  const belly = shape === 'rond' || potBelly || /\b(enceinte|pregnant)\b/.test(`${body} ${role}`) || (shape === 'élancé' && (/\b(tonton|oncle|papa|pere|patron|mari|vieux|chef|commercant)\b/.test(role) || (h >> 9) % 2 === 0));
  const base = age === 'enfant' ? 0.62 : age === 'ado' ? 0.88 : age === 'senior' ? 0.97 : 1;
  const top = outfit.top ?? BRIGHT[h % BRIGHT.length]!;
  const dress = outfit.dress || (gender === 'f' && !kid && !outfit.bottom);
  const sleeves: Sleeves = /\b(debardeur|tank top|sans manches|sleeveless|bretelles|marcel|bustier)\b/.test(clothing.replace(/\b(over|sur)\b.*$/, ''))
    ? 'sans'
    : /\b(manches longues|long sleeves?|long-sleeve|polo|chemise|costume|veste|boubou|blazer|jacket|suit|kaftan|caftan|abacost|complet)\b/.test(clothing)
      ? 'longues'
      : /\b(t-?shirt|tee|maillot|jersey|manches courtes)\b/.test(clothing)
        ? 'courtes'
        : dress && gender === 'f'
          ? 'sans'
          : 'courtes';
  const innerM = /\b(?:over|sur)\s+(?:a\s+|un\s+|une\s+)?([a-z -]*?)(vest|marcel|debardeur|t-?shirt|tank top)\b/.exec(clothing);
  const feetText = `${clothing} ${plain(c.shoes ?? '')}`;
  const feet: Footwear = /\b(tongs?|sandales?|sandals?|flip-?flops?|pieds nus|barefoot|babouches?)\b/.test(feetText)
    ? 'tongs'
    : /\b(baskets?|sneakers?|tennis)\b/.test(feetText)
      ? 'baskets'
      : /\b(chaussures?|shoes?|mocassins?|souliers?|boots?|bottes?)\b/.test(feetText) || (sleeves === 'longues' && outfit.top && outfit.top === outfit.bottom && !dress)
        ? 'chaussures'
        : kid
          ? 'baskets'
          : gender === 'f' || h % 2
            ? 'tongs'
            : 'chaussures';
  const bandM = /\b(bandeau|headband)\b[^,;.]*/.exec(all) ?? /[^,;.]*\b(bandeau|headband)\b/.exec(all);
  const capM = /\b(casquette|flat cap|baseball cap|cap|beret|chapeau|hat|bonnet|straw hat)\b[^,;.]*/.exec(all) ?? /[^,;.]*\b(casquette|cap|beret|chapeau|hat)\b/.exec(all);
  const second = outfit.second ?? (BRIGHT[(h >> 7) % BRIGHT.length]! === top ? BRIGHT[((h >> 7) + 3) % BRIGHT.length]! : BRIGHT[(h >> 7) % BRIGHT.length]!);
  const look: ActorLook3D = {
    key: speakerKey(c.name),
    name: c.name,
    ...(c.role ? { role: c.role } : {}),
    gender,
    age,
    skin: skinOf(`${c.skin ?? ''} ${c.ethnicity ?? ''}`, h),
    hair: hair.color,
    hairStyle: hair.style,
    ...(hair.wrap ? { wrap: hair.wrap } : {}),
    ...(bandM ? { headband: colorIn(bandM[0]) ?? '#c62828' } : hair.style === 'twists' && gender === 'f' && h % 2 === 0 ? { headband: '#c62828' } : {}),
    ...(capM ? { cap: { kind: /chapeau|hat|straw/.test(capM[0]) ? ('chapeau' as const) : /beret|flat cap/.test(capM[0]) ? ('béret' as const) : ('casquette' as const), color: colorIn(capM[0]) ?? (/straw|paille/.test(capM[0]) ? '#d9b45a' : '#3b3b3b') } } : {}),
    top,
    bottom: outfit.bottom ?? (dress ? top : DARK[(h >> 5) % DARK.length]!),
    shoes: outfit.shoes ?? (feet === 'tongs' ? BRIGHT[(h >> 4) % BRIGHT.length]! : feet === 'baskets' ? '#f2f0ea' : h % 2 ? '#2a1a10' : '#1c1c1f'),
    dress,
    pattern: outfit.pattern,
    accent: second,
    ...(innerM ? { inner: colorIn(innerM[1] ?? '') ?? '#f2f0ea' } : {}),
    sleeves,
    feet,
    shape,
    glasses: /\b(lunettes|glasses|spectacles)\b/.test(all),
    beard: gender === 'm' && !kid && /\b(barbe|barbu|beard|bearded|bouc|goatee)\b/.test(all),
    moustache: gender === 'm' && age !== 'enfant' && /\b(moustache|mustache)\b/.test(all),
    ...(/\b(chapelet|prayer beads|collier|necklace|perles|beads)\b/.test(all) ? { beads: true } : {}),
    ...(/\b(montre|watch)\b/.test(all) ? { watch: true } : {}),
    ...(c.prop ? { prop: c.prop } : {}),
    face: faceOf(`${c.face ?? ''} ${c.facialExpressions ?? ''} ${c.personality ?? ''} ${c.body ?? ''}`, gender, age),
    height: Math.round(base * (tall ? 1.06 : short ? 0.93 : 1) * 100) / 100,
    build: shape === 'rond' ? 1.3 : shape === 'courbes' ? 1.08 : shape === 'élancé' ? 0.85 : muscled ? 1.12 : slim ? 0.9 : 1,
    belly,
    source: 'fiche',
  };
  return look;
}

export interface SheetPose {
  kind: import('./sheet').PoseKind;
  assetId: string;
  /** Size of the cut-out (px) and where its mouth is (fractions of the cut-out). */
  w: number;
  h: number;
  mouth: [number, number];
  /** Which way the drawn character looks (−1 left, 1 right, 0 camera), read on the face when the detector is available. */
  facing?: -1 | 0 | 1;
  /** The drawn face measured on the art (lips, chin, eyes): the actor talks and blinks with it. Absent = not measured. */
  face?: import('./face2d').SheetFace;
  /** The skeleton measured on the art (BlazePose): the drawing bends like a puppet around it. Absent = rigid drawing. */
  body?: import('./puppetMotion').SheetBody;
}
export type ActorLibrary = Record<string, ActorLook3D>;
/**
 * Casting of a film: each character takes ITS actor from the library (same actor, same look, film after film); a new
 * character gets an actor built from its sheet, added to the library. Returns the cast (by key) and what changed.
 */
export function castFilm(chars: (Partial<CharacterSheet> & { name: string })[], library: ActorLibrary, now = Date.now()): { cast: ActorLibrary; added: ActorLook3D[]; reused: string[] } {
  const cast: ActorLibrary = {};
  const added: ActorLook3D[] = [];
  const reused: string[] = [];
  for (const c of chars) {
    const key = speakerKey(c.name);
    if (!key || cast[key]) continue;
    const known = library[key];
    if (known) {
      cast[key] = known;
      reused.push(known.name);
    } else {
      const look = { ...lookFromSheet(c), updatedAt: now, films: 0 };
      cast[key] = look;
      added.push(look);
    }
  }
  return { cast, added, reused };
}
/** The actor of a name in a cast (any spelling), or a stable actor built from the name alone. */
export function actorFor(cast: ActorLibrary, name: string): ActorLook3D {
  return cast[speakerKey(name)] ?? lookFromSheet({ name });
}

/** MOUTH SHAPES of the lip-sync: the Preston Blair key of the letter being said → opening, width, roundness. */
export interface MouthShape {
  open: number;
  wide: number;
  round: number;
}
const SHAPES: Record<string, MouthShape> = {
  AI: { open: 1, wide: 0.55, round: 0 },
  E: { open: 0.55, wide: 0.95, round: 0 },
  O: { open: 0.75, wide: 0, round: 0.9 },
  U: { open: 0.4, wide: 0, round: 1 },
  MBP: { open: 0, wide: 0.1, round: 0 },
  FV: { open: 0.15, wide: 0.45, round: 0 },
  L: { open: 0.5, wide: 0.3, round: 0 },
  WQ: { open: 0.35, wide: 0, round: 0.85 },
  etc: { open: 0.4, wide: 0.3, round: 0.1 },
  rest: { open: 0.04, wide: 0, round: 0 },
};
/** Mouth of the word being said, scaled by the voice loudness (a shout opens wider than a whisper). */
export function mouthShape(key: string, energy = 0.5): MouthShape {
  const s = SHAPES[key] ?? SHAPES.etc!;
  const k = key === 'rest' || key === 'MBP' ? 1 : Math.min(1.25, 0.65 + energy * 2.2);
  return { open: Math.min(1, s.open * k), wide: s.wide, round: s.round };
}
/** The same shape as VRM expression weights (aa, ih, ou, ee, oh): the standard lip-sync of every VRM model. */
export function vrmVisemes(m: MouthShape): { aa: number; ih: number; ou: number; ee: number; oh: number } {
  const r = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000;
  const flat = 1 - m.round;
  return { aa: r(m.open * flat * (1 - m.wide * 0.5)), ee: r(m.open * m.wide * flat), ih: r(m.open * 0.4 * m.wide * flat), oh: r(m.open * m.round * 0.9), ou: r(m.round * (1 - m.open) + m.round * 0.3) };
}

/** ACTING LAYER, driven by the voice: offsets (radians) added on top of the skeletal performance. */
export interface ActingInput {
  t: number;
  speaking: boolean;
  /** Voice loudness 0..1 and its accents (attack above the slow average). */
  energy: number;
  beat: number;
  /** Someone else is speaking (the listener reacts). */
  listening: boolean;
  gesture?: string | null;
  emotion?: string;
  /** Seconds since the start of the current line. */
  lineAge?: number;
  /** A per-actor phase so two actors never move in sync. */
  phase?: number;
  /** After the punchline: the listener freezes in SHOCK, the one who said it LAUGHS (the « chute » of the sketches). */
  react?: 'choc' | 'rire' | null;
  reactAge?: number;
  /** Head yaw that makes the actor look into the camera (the shocked face looks at the viewer). */
  toCamera?: number;
}
export interface Acting {
  headPitch: number;
  headYaw: number;
  headRoll: number;
  spinePitch: number;
  spineRoll: number;
  /** Forearm lift of each side (beat gestures of the speaker, hands to the cheeks in shock). */
  armL: number;
  armR: number;
  shoulders: number;
  /** Extra smile / mouth from the laugh. */
  laugh: number;
  /** Cartoon shock: eyes bulging, jaw dropped. */
  shock: number;
  /** Jump of surprise (metres) and squash-and-stretch (scale − 1). */
  hop: number;
  stretch: number;
}
const LAUGH = /\b(laugh|rire|rit|rigole|mdr|haha|ha ha|hihi|explose de rire|eclate de rire)\b/i;
/** Smooth 0 → 1. */
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function actingAt(i: ActingInput): Acting {
  const ph = i.phase ?? 0;
  const t = i.t + ph;
  // Breathing + weight shift: never a frozen body, even silent.
  const breath = Math.sin(t * 1.9) * 0.012;
  const sway = Math.sin(t * 0.7) * 0.02;
  let headPitch = breath * 0.6;
  let headYaw = Math.sin(t * 0.45) * 0.03;
  let headRoll = Math.sin(t * 0.33) * 0.02;
  let spinePitch = breath;
  const spineRoll = sway * 0.5;
  let armL = 0;
  let armR = 0;
  let shoulders = 0;
  let laugh = 0;
  let shock = 0;
  let hop = 0;
  let stretch = 0;
  const laughing = (i.gesture && LAUGH.test(plain(i.gesture))) || i.gesture === 'laugh' || i.emotion === 'rire';
  if (i.speaking) {
    const e = Math.min(1, i.energy * 2.2);
    // Exaggerated cartoon delivery: the head nods hard on the accents, the body leans into the line, the hands beat.
    headPitch += i.beat * 0.22 + Math.sin(t * 7.3) * 0.05 * e;
    headYaw += Math.sin(t * 2.1) * 0.1 * e;
    headRoll += Math.sin(t * 3.4) * 0.07 * e;
    spinePitch += 0.06 * e + i.beat * 0.07;
    const beatHand = (i.beat * 0.75 + e * 0.45) * (0.75 + 0.25 * Math.sin(t * 4.7));
    // Dominant hand beats; the other one joins on loud lines.
    armR = beatHand;
    armL = e > 0.5 ? beatHand * 0.7 : beatHand * 0.2;
    stretch = i.beat * 0.025;
  } else if (i.listening) {
    // The listener nods slowly, sometimes a skeptical tilt.
    headPitch += Math.max(0, Math.sin(t * 1.6)) * 0.06;
    headRoll += Math.sin(t * 0.9) * 0.05;
  }
  if (laughing && i.speaking) {
    const amp = ease((i.lineAge ?? 0) * 3);
    // Head thrown back, shoulders shaking, body bending.
    headPitch -= 0.32 * amp;
    shoulders = Math.abs(Math.sin(t * 22)) * 0.09 * amp;
    spinePitch += (0.1 + Math.sin(t * 22) * 0.04) * amp;
    laugh = amp;
  }
  const ra = i.reactAge ?? 0;
  if (i.react === 'choc') {
    // THE CHUTE: a jump of surprise, eyes popping, jaw on the floor, hands to the cheeks, then the face FREEZES
    // looking into the camera (the account's signature ending).
    const a = ease(ra * 6);
    shock = a;
    hop = 0.09 * Math.max(0, Math.sin(Math.min(1, ra * 3.2) * Math.PI));
    stretch = 0.12 * Math.exp(-ra * 4) * Math.sin(ra * 28);
    headPitch = -0.12 * a + Math.sin(t * 40) * 0.01 * (1 - a);
    headYaw = (i.toCamera ?? 0) * a;
    headRoll = 0;
    spinePitch = -0.08 * a;
    armL = armR = 1.35 * a;
    shoulders = 0.12 * a;
  } else if (i.react === 'rire') {
    // The one who said the punchline laughs so hard they lean backwards.
    const a = ease(ra * 4);
    laugh = a;
    headPitch = -0.38 * a;
    spinePitch = -0.22 * a + Math.sin(t * 20) * 0.04 * a;
    shoulders = Math.abs(Math.sin(t * 20)) * 0.1 * a;
    armL = armR = 0.7 * a;
    stretch = Math.sin(t * 20) * 0.02 * a;
  }
  return { headPitch, headYaw, headRoll, spinePitch, spineRoll, armL, armR, shoulders, laugh, shock, hop, stretch };
}
/** The prop an actor holds in a scene: the clause of the action that names the actor, else its signature prop. */
export function propFor(name: string, action = '', fallback?: Prop): Prop | null {
  const who = plain(name);
  for (const clause of plain(action).split(/[.;,!?]|\bpuis\b|\bet\b|\bpendant que\b|\bwhile\b/)) if (clause.includes(who)) {
    const p = propOf(clause);
    if (p) return p;
  }
  return fallback ?? null;
}

/** PROCEDURAL SET of a location — the sets of the sketches: courtyards in cement blocks or mud bricks with a
 * curtain in the doorway, villages of thatched huts on red earth, modest living rooms, markets, beaches, ceremonies. */
export type SetKind = 'bureau' | 'salon' | 'marché' | 'rue' | 'cour' | 'maquis' | 'école' | 'cuisine' | 'village' | 'plage' | 'cérémonie' | 'neutre';
export type SetProp =
  | 'bureau' | 'chaise' | 'canapé' | 'table' | 'étal' | 'arbre' | 'fenêtre' | 'porte' | 'tableau' | 'plante' | 'comptoir' | 'mur bas'
  | 'rideau' | 'volets' | 'linge' | 'chaises plastique' | 'banc' | 'case' | 'cocotier' | 'télé' | 'photos' | 'tente' | 'marmites' | 'parasol' | 'barque' | 'toit tôle';
export interface SetLook {
  kind: SetKind;
  wall: string;
  floor: string;
  accent: string;
  /** Wall surface: cement blocks, mud bricks, painted, wallpaper — or open sky (village, beach, market). */
  surface: 'parpaings' | 'briques' | 'peint' | 'tapisserie' | 'ciel';
  /** Outdoor: blue sky above the walls, warm sun. */
  outdoor: boolean;
  props: SetProp[];
}
export function setOf(location = ''): SetLook {
  const t = plain(location);
  if (/\b(bureau|office|open.?space|reunion|meeting|banque|administration|guichet)\b/.test(t)) return { kind: 'bureau', wall: '#d9e2ec', floor: '#8a8f99', accent: '#2456b8', surface: 'peint', outdoor: false, props: ['fenêtre', 'bureau', 'chaise', 'plante', 'porte'] };
  if (/\b(cuisine|kitchen)\b/.test(t)) return { kind: 'cuisine', wall: '#f1e3c8', floor: '#9c6b43', accent: '#ef7d1a', surface: 'peint', outdoor: false, props: ['comptoir', 'fenêtre', 'marmites', 'table'] };
  if (/\b(mariage|wedding|ceremonie|bapteme|fete|tente|dot|funerailles)\b/.test(t)) return { kind: 'cérémonie', wall: '#9fd4f5', floor: '#c9a06a', accent: '#e0559a', surface: 'ciel', outdoor: true, props: ['tente', 'chaises plastique', 'marmites', 'arbre'] };
  if (/\b(plage|beach|mer|ocean|lagune|bord de l.eau)\b/.test(t)) return { kind: 'plage', wall: '#8fd0f0', floor: '#ead7a4', accent: '#2a9d8f', surface: 'ciel', outdoor: true, props: ['cocotier', 'barque', 'cocotier'] };
  if (/\b(village|brousse|campagne|case|hameau|champ|plantation)\b/.test(t)) return { kind: 'village', wall: '#9fd4f5', floor: '#b5653a', accent: '#c9a14a', surface: 'ciel', outdoor: true, props: ['case', 'arbre', 'banc', 'case'] };
  const yard = { kind: 'cour' as const, wall: '#a3a29c', floor: '#c8b48e', accent: '#f2c12e', surface: 'parpaings' as const, outdoor: true, props: ['toit tôle', 'rideau', 'volets', 'linge', 'banc', 'chaises plastique'] as SetProp[] };
  if (/\b(cour|jardin|garden|yard|devant)\b/.test(t) && !/\b(concession|terre|banco)\b/.test(t)) return yard;
  if (/\b(salon|maison|living|chambre|appartement|villa|domicile|sejour|canape)\b/.test(t)) return { kind: 'salon', wall: '#3f8f8a', floor: '#9c6b43', accent: '#c62828', surface: 'tapisserie', outdoor: false, props: ['canapé', 'télé', 'photos', 'fenêtre', 'porte', 'plante'] };
  if (/\b(marche|market|etal|boutique|commerce|supermarche|kiosque)\b/.test(t)) return { kind: 'marché', wall: '#9fd4f5', floor: '#b98a5a', accent: '#2e8b57', surface: 'ciel', outdoor: true, props: ['étal', 'parasol', 'étal', 'arbre'] };
  if (/\b(maquis|bar|restaurant|buvette|allocodrome)\b/.test(t)) return { kind: 'maquis', wall: '#e8b06a', floor: '#8b5a2b', accent: '#c62828', surface: 'peint', outdoor: false, props: ['table', 'chaises plastique', 'comptoir', 'plante'] };
  if (/\b(ecole|classe|school|lycee|universite|amphi)\b/.test(t)) return { kind: 'école', wall: '#e9e4c9', floor: '#a07850', accent: '#2e8b57', surface: 'peint', outdoor: false, props: ['tableau', 'table', 'chaise', 'fenêtre'] };
  if (/\b(concession|terre|banco)\b/.test(t)) return { kind: 'cour', wall: '#c98a55', floor: '#c4925e', accent: '#c62828', surface: 'briques', outdoor: true, props: ['toit tôle', 'rideau', 'volets', 'linge', 'chaises plastique', 'arbre'] };
  if (/\b(rue|street|route|carrefour|trottoir|gare|quartier|gbaka|taxi)\b/.test(t)) return { kind: 'rue', wall: '#a3a29c', floor: '#9a8f80', accent: '#f2c12e', surface: 'parpaings', outdoor: true, props: ['toit tôle', 'rideau', 'volets', 'arbre', 'mur bas'] };
  // Courtyard (and default): the set of the reference clip — cement blocks, yellow curtain in the doorway, sandy ground.
  return { ...yard, kind: 'neutre' };
}

/**
 * Blocking of a 3D scene: 1 actor faces the camera; 2 face each other three-quarter (close enough for a vertical
 * 9:16 frame); 3 in an arc, the middle one a step back; 4 on two rows. Positions (x, z) in metres, heading in radians.
 */
export function stagingFor(names: string[], seconds: number, vertical = true): { marks: Record<string, { pos: [number, number]; heading: number }>; seconds: number } {
  const D = Math.PI / 180;
  const n = Math.min(4, names.length);
  const gap = vertical ? 0.5 : 0.7;
  const marks: Record<string, { pos: [number, number]; heading: number }> = {};
  names.slice(0, 4).forEach((name, i) => {
    if (n === 1) marks[name] = { pos: [0, 0.2], heading: 0 };
    else if (n === 2) marks[name] = { pos: [i === 0 ? -gap : gap, 0.2], heading: (i === 0 ? 42 : -42) * D };
    else if (n === 3) marks[name] = { pos: [(i - 1) * gap * 1.6, i === 1 ? -0.25 : 0.2], heading: (i - 1) * -30 * D };
    else marks[name] = { pos: [(i % 2 === 0 ? -1 : 1) * gap * (i < 2 ? 1 : 1.5), i < 2 ? 0.3 : -0.45], heading: (i % 2 === 0 ? 35 : -35) * D };
  });
  return { marks, seconds };
}

/**
 * DÉCOUPAGE (shot plan) of a dialogue scene, like the edited sketches: the exchange in a two-shot (who is where),
 * a close-up every third line of a long scene, the punchline in close-up, and after it the REACTION of the other one
 * (the laugh of the sketch). A change of shot is a hard cut.
 */
export type ShotKind = 'two' | 'close' | 'react' | 'single';
export function shotAt(t: number, lines: { speaker: string; start: number; end: number }[], names: string[]): { kind: ShotKind; who: string | null } {
  if (names.length < 2) return { kind: 'single', who: names[0] ?? null };
  const i = lines.findIndex((l) => t >= l.start - 0.15 && t < l.end + 0.25);
  const last = lines.length - 1;
  if (i < 0) {
    // After the punchline: the listener's reaction.
    const p = lines[last];
    if (p && t >= p.end + 0.25 && t < p.end + 2.5) {
      const other = names.find((n) => speakerKey(n) !== speakerKey(p.speaker));
      return other ? { kind: 'react', who: other } : { kind: 'two', who: null };
    }
    return { kind: 'two', who: null };
  }
  const who = lines[i]!.speaker;
  if (i === 0 && last > 0) return { kind: 'two', who };
  // Calibrated on the owner's sketches (a shot lasts ~5 s, ~11 shots a minute): the exchange stays in the two-shot,
  // a close-up every third line of a long scene, the punchline in close-up, then the reaction.
  if (i === last || (i % 3 === 2 && i < last - 1)) return { kind: 'close', who };
  return { kind: 'two', who };
}
