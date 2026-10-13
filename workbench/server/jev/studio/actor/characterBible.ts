/**
 * BIBLE DES PERSONNAGES — la base de connaissances PERMANENTE du moteur narratif. Une fiche détaillée par personnage de
 * l'univers (apparence, tenue, âge apparent, posture, personnalité, traits, habitudes, émotions dominantes, réactions
 * typiques, centres d'intérêt, forces, faiblesses, comportement dans 8 situations, répliques typiques, ressort comique,
 * voix et taille pour Blender) + le GRAPHE DES RELATIONS (famille, voisinage, rivalités, amours, dettes).
 *
 * Le moteur s'en sert à chaque écriture : le scénariste reçoit l'identité de toute la distribution et la fiche complète
 * des personnages de l'histoire avec leurs liens ; une scène réécrite reçoit les fiches de ses personnages ; une fiche
 * d'acteur créée pour un personnage de l'univers reprend sa personnalité, sa gestuelle et sa façon de parler ; le
 * pipeline Blender lit leur taille et leur voix. Les apparences décrivent les dessins du propriétaire (planches et
 * galeries fond vert) ; les personnages « à dessiner » n'ont pas encore de dessin (écrits, pas encore tournés).
 */
import { UNIVERSE, universeCharacter } from './universe';
import { FAMILLE } from './profiles/famille';
import { QUARTIER_A } from './profiles/quartierA';
import { QUARTIER_B } from './profiles/quartierB';
import { NOUVEAUX } from './profiles/nouveaux';
import { ARCS, type CharacterArc } from './profiles/arcs';

export type Situation =
  'conflit' | 'argent' | 'famille' | 'seduction' | 'autorite' | 'public' | 'echec' | 'secret';
export const SITUATIONS: Situation[] = [
  'conflit',
  'argent',
  'famille',
  'seduction',
  'autorite',
  'public',
  'echec',
  'secret',
];
export const SITUATION_LABEL: Record<Situation, string> = {
  conflit: 'Dans une dispute',
  argent: 'Face à l’argent',
  famille: 'En famille',
  seduction: 'Amour, séduction, amitié',
  autorite: 'Face à l’autorité',
  public: 'En public, devant la caméra',
  echec: 'Quand il perd / est démasqué',
  secret: 'Quand un secret est en jeu',
};
/** Where the drawing of the character is: a 5-pose sheet, a gallery figure (both cut for Blender), the owner's
 *  catalogue only (not cut yet), or nothing yet (written, to be drawn). */
export type Dessin = 'planche' | 'galerie' | 'catalogue' | 'à dessiner';
export type PiperVoice = 'siwis' | 'tom' | 'gilles' | 'jessica' | 'pierre';

export interface CharacterProfile {
  name: string;
  /** How the others call them (nickname, form of address). */
  surnom?: string;
  dessin: Dessin;
  /** Apparent age, as seen in the drawing. */
  age: string;
  /** Height in metres (the Blender actor is scaled to it). */
  taille: number;
  /** Local French voice (Piper) and pitch (1 = natural; > 1 child / higher). */
  voix: { piper: PiperVoice; pitch?: number };
  apparence: string;
  tenue: string;
  posture: string;
  personnalite: string;
  traits: string[];
  habitudes: string[];
  emotions: string[];
  reactions: string[];
  interets: string[];
  forces: string[];
  faiblesses: string[];
  situations: Record<Situation, string>;
  /** Typical lines / verbal tics (Ivorian French), for the dialogue. */
  repliques: string[];
  /** The comic engine: the flaw that makes people laugh, pushed further in every scene. */
  moteur: string;
  /** The sets (UNIVERSE_SETS names) where they live or work: they appear there as EXTRAS of the living background. */
  lieux: string[];
  /** What they do in the background of those sets (extra's activity). */
  activite: string;
}

export const PROFILES: CharacterProfile[] = [...FAMILLE, ...QUARTIER_A, ...QUARTIER_B, ...NOUVEAUX];

// ── Le graphe des relations ──────────────────────────────────────────────────────────────────────────────────────
export interface Relation {
  a: string;
  b: string;
  /** The link (family, work, neighbours…), from A's side. */
  lien: string;
  /** What happens between them on screen (the comic dynamic). */
  dynamique: string;
}
const R = (a: string, b: string, lien: string, dynamique: string): Relation => ({ a, b, lien, dynamique });
/** The quarter: « la Cité Bonne-Chance », a quarter of Abidjan (fictional) — the courtyard of the Ndiaye family, the
 *  market, the maquis, the hair salon, the clinic, the school, the bank, the town hall, the taxi rank. */
export const QUARTIER = 'la Cité Bonne-Chance, quartier (fictif) d’Abidjan';
export const RELATIONS: Relation[] = [
  // La concession Ndiaye
  R(
    'BAYE NDIAYE',
    'MAMAN NOUNOU',
    'époux depuis 30 ans',
    'il cache son argent, elle le trouve toujours ; il drague, elle surgit',
  ),
  R(
    'BAYE NDIAYE',
    'COUMBA',
    'père',
    'elle obtient de lui ce que personne n’obtient, en le prenant à son propre jeu',
  ),
  R(
    'BAYE NDIAYE',
    'PETIT MAMADOU',
    'grand-père (« Papi »)',
    'l’enfant lui soutire de l’argent en menaçant de révéler ses cachettes',
  ),
  R(
    'BAYE NDIAYE',
    'TANTIE AWA',
    'grand frère',
    'elle lui fait honte devant tout le monde ; il lui doit toujours quelque chose',
  ),
  R(
    'BAYE NDIAYE',
    'GRAND-PÈRE NDIAYE',
    'petit frère',
    'le grand frère sourd comprend tout de travers, surtout quand Baye parle d’argent',
  ),
  R(
    'BAYE NDIAYE',
    'TONTON DIENG',
    'cousin',
    'Dieng lui emprunte pour ses « villas » ; Baye ne prête jamais, il donne des conseils',
  ),
  R(
    'BAYE NDIAYE',
    'MODOU',
    'propriétaire de la chambre que Modou loue',
    'le loyer n’arrive jamais ; Baye le réclame en proverbes',
  ),
  R(
    'MAMAN NOUNOU',
    'COUMBA',
    'mère',
    'complices pour plumer les prétendants ; rivales quand il s’agit de qui a raison',
  ),
  R(
    'MAMAN NOUNOU',
    'PETIT MAMADOU',
    'grand-mère (« Mamie »)',
    'elle le gâte en cachette et le fait travailler au marché',
  ),
  R(
    'MAMAN NOUNOU',
    'MAMAN BRIGITTE',
    'voisine d’étal au marché',
    'guerre des prix permanente, alliance immédiate contre un client',
  ),
  R(
    'MAMAN NOUNOU',
    'MAMIE BINTOU',
    'voisine d’en face, amie d’enfance',
    'elles se racontent tout, et Bintou répète tout',
  ),
  R(
    'COUMBA',
    'KOFFI',
    'prétendant officiel',
    'elle teste sa richesse, il bluffe, elle le démasque en public',
  ),
  R(
    'COUMBA',
    'MODOU',
    'amoureux transi, locataire de la cour',
    'il lui promet tout avec rien ; elle l’utilise comme coursier',
  ),
  R(
    'COUMBA',
    'TATA PRISCA',
    'coiffeuse et confidente',
    'Prisca sait tout de ses plans, et finit par les raconter',
  ),
  R(
    'COUMBA',
    'LA GO LÉOPARD',
    'rivale chic',
    'elles visent les mêmes « bons partis » et se complimentent avec des couteaux',
  ),
  R(
    'TANTIE AWA',
    'PETIT MAMADOU',
    'grand-tante qui l’élève au quotidien',
    'elle traque ses mensonges ; il trouve toujours un coupable plus gros',
  ),
  R(
    'TANTIE AWA',
    'MODOU',
    'logeuse (elle encaisse le loyer)',
    'elle le soupçonne de tout — et elle a souvent raison',
  ),
  R(
    'TANTIE AWA',
    'MADAME COUMBA',
    'voisine',
    'concours de la plus redoutable ; elles s’espionnent par-dessus le mur',
  ),
  R(
    'PETIT MAMADOU',
    'MODOU',
    '« Tonton Modou », le locataire',
    'complices de bêtises ; l’enfant le dénonce dès que ça tourne mal',
  ),
  R(
    'PETIT MAMADOU',
    'PETIT MOUSSA',
    'meilleur ami et complice',
    'Mamadou invente le plan, Moussa se fait attraper',
  ),
  R('PETIT MAMADOU', 'PETIT IBRAHIMA', 'rival de classe', 'Ibrahima a 20/20, Mamadou a des excuses à 20/20'),
  R(
    'KOFFI',
    'MODOU',
    'rival pour Coumba',
    'deux fauchés qui surenchérissent avec de l’argent qu’ils n’ont pas',
  ),
  R('KOFFI', 'PATRON SÉRY', 'client endetté du maquis', 'Séry fait crédit à tout le monde sauf à lui'),
  R('KOFFI', 'TIÉKORO', 'débiteur', 'Koffi a acheté ses lunettes « de luxe » à crédit chez Tiékoro'),
  R('KOFFI', 'LE BANQUIER', 'demandeur de crédit éternel', 'le banquier refuse avant même la question'),
  R(
    'KOFFI',
    'LA GO LÉOPARD',
    'proie supposée riche',
    'elle le croit riche ; il la croit riche ; tous deux sont fauchés',
  ),
  R('MODOU', 'DJECKY', 'copain de galère', 'Djecky a toujours un plan, Modou paie toujours la note'),
  R('MODOU', 'TIÉKORO', 'client de ses bons plans', 'Tiékoro lui vend des gadgets qui ne marchent pas'),
  R(
    'TONTON DIENG',
    'GÉNÉRAL ZONGO',
    'client',
    'Zongo construit sa « villa » depuis sept ans ; aucun des deux n’a vu le terrain',
  ),
  R(
    'TONTON DIENG',
    'SALIF LE PARISIEN',
    'rival de vantardise',
    'chaque histoire de l’un est battue par une histoire plus grosse de l’autre',
  ),
  R('TONTON DIENG', 'ALIOU', 'vieux camarade', 'Aliou le conduit gratuitement contre des histoires'),
  // Le quartier
  R(
    'PROFESSEUR SAMBA',
    'LA LYCÉENNE',
    'père',
    'elle corrige ses fautes en public ; il fait semblant de l’avoir fait exprès',
  ),
  R(
    'PROFESSEUR SAMBA',
    'ALIOU',
    'adversaire de débat au kiosque',
    'le savant des livres contre le savant de la route',
  ),
  R(
    'PROFESSEUR SAMBA',
    'MAÎTRE COULIBALY',
    'rival intellectuel',
    'chacun cite un texte que l’autre ne peut pas vérifier',
  ),
  R(
    'MAÎTRE KONÉ',
    'PETIT MAMADOU',
    'instituteur',
    'Koné connaît toutes les excuses ; Mamadou en invente de nouvelles',
  ),
  R('MAÎTRE KONÉ', 'PETIT IBRAHIMA', 'instituteur', 'son élève modèle… qui le corrige parfois'),
  R(
    'DOCTEUR SYLLA',
    'SŒUR AWA',
    'collègue de la clinique',
    'il facture, elle soigne ; elle le remet à sa place devant les patients',
  ),
  R('DOCTEUR SYLLA', 'BOUBACAR', 'médecin', 'son meilleur client : chaque consultation finit par un poulet'),
  R('SŒUR AWA', 'PETIT IBRAHIMA', 'mère', 'fière de lui, intraitable sur les devoirs'),
  R(
    'LA FUTURE MAMAN',
    'GÉNÉRAL ZONGO',
    'épouse',
    'elle a des envies à minuit ; il est toujours « sur un chantier »',
  ),
  R('LA FUTURE MAMAN', 'PETITE KHADIJA', 'mère', 'Khadija pose mille questions sur le bébé'),
  R('LA FUTURE MAMAN', 'PETITE AYA', 'mère', 'Aya veut savoir si le bébé aura aussi un nounours'),
  R('PETITE KHADIJA', 'PETITE AYA', 'grande sœur', 'Khadija explique le monde de travers, Aya y croit'),
  R('MÉCANO ISSA', 'PETIT MOUSSA', 'père', 'le fils démonte tout ce que le père répare'),
  R(
    'MÉCANO ISSA',
    'ALIOU',
    'mécanicien attitré du taxi',
    'le taxi ne marche que grâce à du fil de fer et des prières',
  ),
  R(
    'MÉCANO ISSA',
    'YAYA L’APPRENTI',
    'mécanicien du gbaka',
    'Yaya ramène le gbaka en morceaux chaque semaine',
  ),
  R(
    'AGENT DOUMBIA',
    'ALIOU',
    'policier qui le contrôle chaque matin',
    'le même contrôle, la même « arrangement », la même philosophie',
  ),
  R(
    'AGENT DOUMBIA',
    'AGENT BAKARY',
    'rival en uniforme',
    'qui trouve le plus d’infractions — et qui « arrange » le mieux',
  ),
  R(
    'AGENT BAKARY',
    'SALIF LE PARISIEN',
    'douanier de l’aéroport',
    'il fouille les valises du Parisien et y trouve de l’attiéké',
  ),
  R('TANTIE AWA SARR', 'BOUBACAR', 'restauratrice', 'il mange comme dix, paie comme un'),
  R(
    'TANTIE AWA SARR',
    'PATRON SÉRY',
    'fournisseuse du maquis',
    'elle cuisine, il revend plus cher ; ils comptent tout deux fois',
  ),
  R('TATA PRISCA', 'MAMIE BINTOU', 'cliente du samedi', 'les ragots du quartier passent par les deux'),
  R('TATA PRISCA', 'FATOU', 'réseau d’informations', 'Prisca entend, Fatou filme, tout le monde sait'),
  R('FATOU', 'AMINATA', 'mère', 'la mère filme tout le monde, la fille se filme elle-même'),
  R(
    'MADAME COUMBA',
    'MAMIE BINTOU',
    'alliée de commérage',
    'elles complètent les histoires l’une de l’autre — en les grossissant',
  ),
  R(
    'CHEF TRAORÉ',
    'LE PATRIARCHE',
    'chef de quartier et doyen',
    'le chef décide ; le doyen rappelle qu’en 1970 on faisait mieux',
  ),
  R('CHEF TRAORÉ', 'IMAM KARIM', 'notables du quartier', 'l’imam apaise ce que le chef a enflammé'),
  R(
    'CHEF TRAORÉ',
    'MADEMOISELLE ROSINE',
    'administré exigeant',
    'même le chef doit apporter « le papier qui manque »',
  ),
  R(
    'LE BANQUIER',
    'AGENT GORA',
    'patron du vigile',
    'Gora philosophe à la porte de la banque et refuse l’entrée aux fauchés',
  ),
  R(
    'LE BANQUIER',
    'LA GO LÉOPARD',
    'cible de séduction',
    'elle demande un crédit avec un sourire ; il refuse avec un sourire',
  ),
  R('LE BANQUIER', 'GÉNÉRAL ZONGO', 'client', 'le crédit du chantier dure plus longtemps que le chantier'),
  R(
    'ADJOUA',
    'DJECKY',
    'cible de « crédit »',
    'elle lui réclame du crédit téléphonique ; il a juste un ballon',
  ),
  R('ADJOUA', 'LA GO LÉOPARD', 'concurrente', 'deux chasseuses, un seul portefeuille dans le quartier'),
  R('LE FRIMEUR', 'DJ KÉVIN', 'roi des soirées', 'Kévin passe la musique, le Frimeur danse pour la caméra'),
  R('LE FRIMEUR', 'KOFFI', 'concurrent de frime', 'le vrai beau gosse fauché contre le faux riche fauché'),
  R(
    'MADAME KONAN',
    'MAMAN NOUNOU',
    'présidente de la tontine',
    'Nounou réclame son tour, Konan trouve toujours un règlement',
  ),
  R(
    'MADAME KONAN',
    'MONSIEUR DIARRA',
    'trésorier de la tontine',
    'il compte, elle recompte, la caisse ne tombe jamais juste',
  ),
  R('PATRON SÉRY', 'DJ KÉVIN', 'DJ du maquis', 'Kévin coupe le son au moment de l’addition'),
  R(
    'COACH DIABATÉ',
    'PETIT MAMADOU',
    'coach de foot',
    'le n° 10 du quartier, qui négocie sa place comme Mamie',
  ),
  R('COACH DIABATÉ', 'PETIT MOUSSA', 'coach de foot', 'gardien de but qui regarde ailleurs'),
  R('YAYA L’APPRENTI', 'ALIOU', 'concurrent de la route', 'gbaka contre taxi : à qui prendra le client'),
  R('LA VOISINE', 'LE TONTON', 'épouse', 'il rentre avec ses bouteilles, elle crie, tout le quartier écoute'),
  R(
    'SORCIÈRE MAMA DÉDÉ',
    'LA FUTURE MAMAN',
    'vendeuse de remèdes',
    'une potion pour chaque envie — aucune ne marche',
  ),
  R('SORCIÈRE MAMA DÉDÉ', 'KOFFI', 'cliente… non, client', 'il achète des « potions de richesse » à crédit'),
];

// ── Lecture ──────────────────────────────────────────────────────────────────────────────────────────────────────
const key = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
/** The profile of a character (any spelling), if any. */
export function profileOf(name: string): CharacterProfile | null {
  const k = key(name);
  return PROFILES.find((p) => key(p.name) === k) ?? null;
}
/** Every relation of a character (both directions, written from the character's side when possible). */
export function relationsOf(name: string): Relation[] {
  const k = key(name);
  return RELATIONS.filter((r) => key(r.a) === k || key(r.b) === k);
}
/** The relations between the given characters only. */
export function relationsBetween(names: string[]): Relation[] {
  const ks = new Set(names.map(key));
  return RELATIONS.filter((r) => ks.has(key(r.a)) && ks.has(key(r.b)));
}
/** The characters of the universe named in a text (an idea, a script): longest names first, a name inside a longer
 *  one (« COUMBA » in « MADAME COUMBA », « TANTIE AWA » in « TANTIE AWA SARR ») counted once. */
export function namesIn(text: string): string[] {
  let t = ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')} `;
  const out: string[] = [];
  const byLength = [...PROFILES].sort((a, b) => b.name.length - a.name.length);
  for (const p of byLength) {
    const n = ` ${p.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()} `;
    if (t.includes(n)) {
      out.push(p.name);
      t = t.split(n).join(' # ');
    }
  }
  return out;
}

// ── Ce que reçoit le moteur narratif ─────────────────────────────────────────────────────────────────────────────
const list = (xs: string[]) => xs.join(' ; ');
/** Face, mood, language, goals and past of a character (the 2nd layer of the sheet: what carries long stories). */
export function arcOf(name: string): CharacterArc | null {
  const p = profileOf(name);
  return p ? (ARCS[p.name] ?? null) : null;
}
/** One line of identity (whole cast for the writer): role, comic engine, a typical line. */
export function castLine(name: string): string {
  const p = profileOf(name);
  const u = universeCharacter(name);
  if (!p) return u ? `- ${u.name} : ${u.role}` : `- ${name}`;
  return `- ${p.name} : ${u?.role ?? ''} — ${p.moteur} ; dit : « ${p.repliques[0]} »${p.dessin === 'à dessiner' ? ' (pas encore dessiné)' : ''}`;
}
/** The recurring cast with each identity (replaces the role-only list given to the writer). */
export function castBriefRich(names: string[] = PROFILES.map((p) => p.name)): string {
  return names.map(castLine).join('\n');
}
/** The FULL sheet of a character, as the writer reads it. */
export function profileBlock(p: CharacterProfile): string {
  const u = universeCharacter(p.name);
  return [
    `■ ${p.name}${p.surnom ? ` (« ${p.surnom} »)` : ''} — ${u?.role ?? ''}, ${p.age}`,
    `Apparence : ${p.apparence} Tenue : ${p.tenue} Posture : ${p.posture}`,
    `Personnalité : ${p.personnalite}`,
    `Traits : ${list(p.traits)}. Habitudes : ${list(p.habitudes)}. Émotions dominantes : ${list(p.emotions)}.`,
    `Réactions typiques : ${list(p.reactions)}.`,
    `Centres d’intérêt : ${list(p.interets)}. Forces : ${list(p.forces)}. Faiblesses : ${list(p.faiblesses)}.`,
    `Comportements : ${(Object.keys(SITUATION_LABEL) as Situation[]).map((s) => `${SITUATION_LABEL[s].toLowerCase()} → ${p.situations[s]}`).join(' | ')}`,
    `Façon de parler : « ${p.repliques.join(' » / « ')} ». Ressort comique : ${p.moteur}.`,
    ...(() => {
      const a = ARCS[p.name];
      return a
        ? [
            `Visage (expressions) : ${list(a.expressions)}. Humeur de fond : ${a.humeur}.`,
            `Langage : ${a.langage}.`,
            `Objectifs : ${list(a.objectifs)}.`,
            `Historique (à ne jamais contredire) : ${list(a.historique)}.`,
          ]
        : [];
    })(),
  ].join('\n');
}
/**
 * The block given to the writer for the characters of THIS story: their full sheets, their relations, and the rule
 * to keep each one true to the sheet. Empty when no character of the universe is involved.
 */
export function bibleFor(names: string[], max = 5): string {
  const seen = new Set<string>();
  const ps = names
    .map(profileOf)
    .filter((p): p is CharacterProfile => !!p && !seen.has(p.name) && !!seen.add(p.name))
    .slice(0, max);
  if (!ps.length) return '';
  const rel = relationsBetween(ps.map((p) => p.name));
  return [
    `FICHES DES PERSONNAGES (base de connaissances de l’univers, ${QUARTIER}) — chaque personnage parle, réagit et agit EXACTEMENT selon sa fiche : son ressort comique pousse chaque scène, ses réactions typiques suivent chaque punch, ses répliques gardent sa façon de parler ; jamais un comportement contraire à sa fiche sans raison montrée.`,
    ...ps.map(profileBlock),
    ...(rel.length
      ? [`LIENS ENTRE EUX : ${rel.map((r) => `${r.a} → ${r.b} : ${r.lien} (${r.dynamique})`).join(' ; ')}`]
      : []),
  ].join('\n\n');
}
/** The fields of an actor sheet of the studio taken from the profile (personality, gestures, way of speaking). */
export function sheetFields(
  name: string,
): { personality: string; gestures: string; speakingStyle: string; voice: string; age: string } | null {
  const p = profileOf(name);
  if (!p) return null;
  return {
    personality: `${p.personnalite} Traits : ${list(p.traits)}.`,
    gestures: p.posture,
    speakingStyle: `${ARCS[p.name] ? `${ARCS[p.name]!.langage}. ` : ''}« ${p.repliques.join(' » / « ')} »`,
    voice: `${p.voix.piper}${p.voix.pitch ? ` (hauteur ${p.voix.pitch})` : ''}`,
    age: p.age,
  };
}
/** The Blender side: height and voice of every character (scripts/blenderfilm/characters.json). */
export function blenderCast(): Record<
  string,
  { height: number; voice: PiperVoice; pitch?: number; dessin: Dessin }
> {
  return Object.fromEntries(
    PROFILES.map((p) => [
      p.name,
      {
        height: p.taille,
        voice: p.voix.piper,
        ...(p.voix.pitch ? { pitch: p.voix.pitch } : {}),
        dessin: p.dessin,
      },
    ]),
  );
}
/** Universe characters without a profile (must stay empty — checked by the tests). */
export function missingProfiles(): string[] {
  return UNIVERSE.filter((u) => !profileOf(u.name)).map((u) => u.name);
}
