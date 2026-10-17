/**
 * MOTEUR NARRATIF — des histoires construites à partir de la base de connaissances (fiches, objectifs, faiblesses,
 * ressorts comiques, historique, relations) et des lieux vivants (objets, animaux, figurants, ambiance).
 *
 * Huit formes : scène de vie, rencontre, conflit, intrigue, événement, cinématique, quête, histoire longue (saison
 * d'épisodes). Déterministe (graine), sans appel payant : chaque plan dit qui veut quoi, ce qui l'en empêche, comment
 * ça monte, et la chute. Le plan devient l'IDÉE donnée au scénariste de Film Autopilot (qui écrit les répliques en
 * gardant chaque personnage fidèle à sa fiche) ou au pipeline Blender.
 */
import {
  PROFILES,
  arcOf,
  profileOf,
  relationsBetween,
  relationsOf,
  type CharacterProfile,
} from './actor/characterBible';
import { universeCharacter } from './actor/universe';
import { placeFor, type Place } from './world/livingWorld';

/** French grammar of the cast and the places: il / elle, le / la, « à l’hôpital », « en brousse », « dans la cour ». */
const fem = (p: CharacterProfile) => ['femme', 'fille'].includes(universeCharacter(p.name)?.gender ?? '');
const il = (p: CharacterProfile) => (fem(p) ? 'elle' : 'il');
const le = (p: CharacterProfile) => (fem(p) ? 'la' : 'le');
const AT: Record<string, string> = {
  salon: 'au salon',
  cour: 'dans la cour',
  marche: 'au marché',
  maquis: 'au maquis',
  restaurant: 'au restaurant',
  'salon-coiffure': 'au salon de coiffure',
  ceremonie: 'à la cérémonie',
  hopital: 'à l’hôpital',
  ecole: 'à l’école',
  bureau: 'au bureau',
  tribunal: 'au tribunal',
  aeroport: 'à l’aéroport',
  gare: 'à la gare routière',
  rue: 'dans la rue',
  'centre-commercial': 'au centre commercial',
  parc: 'au parc',
  plage: 'à la plage',
  village: 'au village',
  chambre: 'dans la chambre',
  ville: 'au Plateau',
  maison: 'devant la maison',
  nature: 'en brousse',
  imaginaire: 'dans le monde imaginaire',
};
const at = (pl: Place) => AT[pl.id] ?? `à ${pl.nom}`;

export type NarrativeKind =
  | 'scene-de-vie'
  | 'rencontre'
  | 'conflit'
  | 'intrigue'
  | 'evenement'
  | 'cinematique'
  | 'quete'
  | 'histoire-longue';
export const NARRATIVE_KINDS: { id: NarrativeKind; label: string }[] = [
  { id: 'scene-de-vie', label: 'Scène de vie' },
  { id: 'rencontre', label: 'Rencontre' },
  { id: 'conflit', label: 'Conflit' },
  { id: 'intrigue', label: 'Intrigue' },
  { id: 'evenement', label: 'Événement' },
  { id: 'cinematique', label: 'Cinématique' },
  { id: 'quete', label: 'Quête' },
  { id: 'histoire-longue', label: 'Histoire longue' },
];

export interface StoryBeat {
  etape: string;
  texte: string;
  personnages: string[];
}
export interface NarrativePlan {
  kind: NarrativeKind;
  titre: string;
  logline: string;
  personnages: string[];
  lieu: string;
  /** What is at stake, and what stands in the way. */
  enjeu: string;
  obstacle: string;
  beats: StoryBeat[];
  chute: string;
  /** Long stories: the season, episode by episode. */
  episodes?: NarrativePlan[];
  /** The idea given to the writer (Film Autopilot) — everything above, in one text. */
  idee: string;
}

// ── Déterminisme ─────────────────────────────────────────────────────────────────────────────────────────────────
function prng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T>(r: R, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const nameOf = (p: CharacterProfile) => p.name;
const drawn = (p: CharacterProfile) => p.dessin === 'planche' || p.dessin === 'galerie';

/** The cast of a story: the given characters, or a protagonist + someone linked to them (a relation drives the plot). */
function castFor(r: R, given: string[], n: number): CharacterProfile[] {
  const out: CharacterProfile[] = given.map((g) => profileOf(g)).filter((p): p is CharacterProfile => !!p);
  if (!out.length) out.push(pick(r, PROFILES.filter(drawn)));
  while (out.length < n) {
    const linked = out
      .flatMap((p) => relationsOf(p.name).map((x) => (x.a === p.name ? x.b : x.a)))
      .map((x) => profileOf(x))
      .filter((p): p is CharacterProfile => !!p && !out.some((o) => o.name === p.name));
    const pool = linked.length
      ? linked
      : PROFILES.filter((p) => drawn(p) && !out.some((o) => o.name === p.name));
    out.push(pick(r, pool));
  }
  return out;
}
/** Where it happens: the given place, else a place both frequent, else the protagonist's. */
function placeOfCast(r: R, cast: CharacterProfile[], given?: string): Place {
  if (given) return placeFor(given);
  const shared = cast[0]!.lieux.filter((l) => cast.slice(1).every((c) => c.lieux.includes(l)));
  return placeFor(pick(r, shared.length ? shared : cast[0]!.lieux));
}
const objectOf = (r: R, pl: Place) => (pl.objets.length ? pick(r, pl.objets) : null);
const animalOf = (r: R, pl: Place) => (pl.animaux.length ? pick(r, pl.animaux) : null);

function finish(p: Omit<NarrativePlan, 'idee'>): NarrativePlan {
  const lines = [
    `${p.titre} — ${p.logline}`,
    `Forme : ${NARRATIVE_KINDS.find((k) => k.id === p.kind)!.label}. Lieu : ${p.lieu}. Personnages : ${p.personnages.join(', ')}.`,
    `Enjeu : ${p.enjeu}. Obstacle : ${p.obstacle}.`,
    ...p.beats.map((b, i) => `${i + 1}. ${b.etape} — ${b.texte}`),
    `Chute : ${p.chute}`,
    ...(p.episodes ? p.episodes.map((e, i) => `Épisode ${i + 1} : ${e.titre} — ${e.logline}`) : []),
  ];
  return { ...p, idee: lines.join('\n') };
}

// ── Les huit formes ──────────────────────────────────────────────────────────────────────────────────────────────
function sceneDeVie(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const a = cast[0]!;
  const obj = objectOf(r, pl);
  const an = animalOf(r, pl);
  const hab = pick(r, a.habitudes);
  return finish({
    kind: 'scene-de-vie',
    titre: `${a.surnom?.split(',')[0] || a.name} ${at(pl)}`,
    logline: `Une journée ordinaire ${at(pl)} : ${a.name} ${low(hab)}, jusqu’à ce que ${obj ? `le ${obj.nom}` : 'un détail'} s’en mêle.`,
    personnages: cast.map(nameOf),
    lieu: pl.nom,
    enjeu: `garder sa petite habitude (${low(hab)})`,
    obstacle: obj
      ? `${obj.nom} : ${obj.interaction}`
      : an
        ? `${an.espece} qui ${an.comportement}`
        : 'le quartier qui s’invite',
    beats: [
      { etape: 'Installation', texte: `${pl.vie}. ${a.name} ${low(hab)}.`, personnages: [a.name] },
      {
        etape: 'Grain de sable',
        texte: obj
          ? `${obj.nom[0]!.toUpperCase() + obj.nom.slice(1)} : ${obj.interaction}.`
          : `${an?.espece ?? 'un voisin'} ${an?.comportement ?? 'débarque'}.`,
        personnages: cast.map(nameOf),
      },
      {
        etape: 'Réaction',
        texte: `${a.name} réagit comme toujours : ${pick(r, a.reactions)}.`,
        personnages: [a.name],
      },
      ...(cast[1]
        ? [
            {
              etape: 'Témoin',
              texte: `${cast[1].name} en rajoute (${pick(r, cast[1].reactions)}).`,
              personnages: [cast[1].name],
            },
          ]
        : []),
    ],
    chute: `Le ressort de ${a.name} va au bout : ${a.moteur}. Dernière réplique : « ${pick(r, a.repliques)} »`,
  });
}

function rencontre(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const [a, b] = [cast[0]!, cast[1]!];
  const common =
    a.interets.find((i) => b.interets.some((j) => j.split(' ')[0] === i.split(' ')[0])) ??
    pick(r, b.interets);
  return finish({
    kind: 'rencontre',
    titre: `Quand ${a.name} croise ${b.name}`,
    logline: `${a.name} et ${b.name} se jaugent ${at(pl)} : premières impressions fausses, point commun inattendu (${common}).`,
    personnages: [a.name, b.name],
    lieu: pl.nom,
    enjeu: `faire bonne impression`,
    obstacle: `${a.name} est ${pick(r, a.traits)}, ${b.name} est ${pick(r, b.traits)}`,
    beats: [
      {
        etape: 'Arrivée',
        texte: `${b.name} entre : ${low(b.apparence.split('.')[0]!)}. ${a.name} ${le(b)} dévisage.`,
        personnages: [a.name, b.name],
      },
      {
        etape: 'Malentendu',
        texte: `${a.name} ${le(b)} prend pour ce qu’${il(b)} n’est pas — ${pick(r, a.situations.public.split(';')).trim()}.`,
        personnages: [a.name],
      },
      {
        etape: 'Point commun',
        texte: `Ils découvrent qu’ils partagent ${common}.`,
        personnages: [a.name, b.name],
      },
    ],
    chute: `${b.name} retourne la situation : « ${pick(r, b.repliques)} »`,
  });
}

function conflit(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const [a, b] = [cast[0]!, cast[1]!];
  const rel = relationsBetween([a.name, b.name])[0];
  const oa = pick(r, arcOf(a.name)?.objectifs ?? a.interets);
  const ob = pick(r, arcOf(b.name)?.objectifs ?? b.interets);
  return finish({
    kind: 'conflit',
    titre: `${a.name} contre ${b.name}`,
    logline: `${a.name} veut ${low(oa)}, ${b.name} veut ${low(ob)}${rel ? ` — ${rel.lien}, et entre eux : ${rel.dynamique}` : ''}.`,
    personnages: [a.name, b.name],
    lieu: pl.nom,
    enjeu: low(oa),
    obstacle: `${b.name} (${low(ob)})`,
    beats: [
      { etape: 'Déclencheur', texte: `${a.name} : ${a.situations.conflit}.`, personnages: [a.name] },
      { etape: 'Escalade', texte: `${b.name} répond : ${b.situations.conflit}.`, personnages: [b.name] },
      {
        etape: 'Point de rupture',
        texte: `Chacun pousse son ressort : ${a.moteur} / ${b.moteur}.`,
        personnages: [a.name, b.name],
      },
      {
        etape: 'Faille',
        texte: `${a.name} craque sur sa faiblesse : ${pick(r, a.faiblesses)}.`,
        personnages: [a.name],
      },
    ],
    chute: `${b.name} gagne la manche… jusqu’à la dernière seconde : « ${pick(r, a.repliques)} »`,
  });
}

function intrigue(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const a = cast[0]!;
  const curious = ['MADAME COUMBA', 'MAMIE BINTOU', 'FATOU', 'TATA PRISCA', 'TANTIE AWA']
    .map((n) => profileOf(n)!)
    .filter((p) => p.name !== a.name);
  const c = cast[1] && curious.some((x) => x.name === cast[1]!.name) ? cast[1] : pick(r, curious);
  const secret = pick(r, arcOf(a.name)?.objectifs ?? a.interets);
  const past = pick(r, arcOf(a.name)?.historique ?? [a.personnalite]);
  return finish({
    kind: 'intrigue',
    titre: `Le secret de ${a.surnom?.split(',')[0] || a.name}`,
    logline: `${a.name} cache qu’${il(a)} veut ${low(secret)} ; ${c.name} flaire quelque chose.`,
    personnages: [a.name, c.name, ...cast.slice(2).map(nameOf)],
    lieu: pl.nom,
    enjeu: `que personne ne sache (${low(secret)})`,
    obstacle: `${c.name} — ${c.moteur}`,
    beats: [
      {
        etape: 'Le secret',
        texte: `${a.name} : ${a.situations.secret}. Rappel du passé : ${past}.`,
        personnages: [a.name],
      },
      {
        etape: 'Soupçon',
        texte: `${c.name} remarque un détail : ${pick(r, c.habitudes)}.`,
        personnages: [c.name],
      },
      { etape: 'Enquête', texte: `${c.name} : ${c.situations.secret}.`, personnages: [c.name] },
      {
        etape: 'Révélation',
        texte: `Tout éclate devant le quartier (${pl.pnj[0]?.role ?? 'les voisins'}).`,
        personnages: [a.name, c.name],
      },
    ],
    chute: `${a.name} nie l’évidence : « ${pick(r, a.repliques)} »`,
  });
}

const EVENTS: [RegExp, string[]][] = [
  [
    /maquis|ceremonie|restaurant/i,
    [
      'la coupure de courant en plein mariage',
      'le DJ qui annonce la mauvaise dédicace',
      'la finale de la CAN sur un seul écran',
    ],
  ],
  [
    /marche|rue|taxi|gare|plateau/i,
    [
      'la pluie torrentielle qui vide le marché',
      'la descente de la mairie contre les étals',
      'la grève des gbakas',
    ],
  ],
  [
    /hopital|ecole|bureau|tribunal|aeroport|douane/i,
    ['l’inspection surprise', 'la panne générale du système', 'le grand jour des résultats'],
  ],
  [
    /.*/,
    [
      'la coupure d’eau du quartier',
      'la visite du chef de quartier',
      'le match de foot des enfants',
      'l’arrivée du cousin de Paris',
    ],
  ],
];
function evenement(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const ev = pick(r, EVENTS.find(([re]) => re.test(pl.id))![1]);
  return finish({
    kind: 'evenement',
    titre: `${ev[0]!.toUpperCase() + ev.slice(1)}`,
    logline: `${at(pl)[0]!.toUpperCase() + at(pl).slice(1)}, ${ev} : chacun réagit selon sa nature, et tout le monde a tort.`,
    personnages: cast.map(nameOf),
    lieu: pl.nom,
    enjeu: 'sauver la face devant tout le quartier',
    obstacle: ev,
    beats: [
      { etape: 'Avant', texte: `${pl.vie}.`, personnages: [] },
      { etape: 'L’événement', texte: `${ev[0]!.toUpperCase() + ev.slice(1)}.`, personnages: [] },
      ...cast.map((c) => ({
        etape: `Réaction de ${c.name}`,
        texte: `${c.situations.public}.`,
        personnages: [c.name],
      })),
      {
        etape: 'Retombée',
        texte: `${cast[0]!.name} : ${cast[0]!.situations.echec}.`,
        personnages: [cast[0]!.name],
      },
    ],
    chute: `${cast[cast.length - 1]!.name} trouve la seule solution absurde : « ${pick(r, cast[cast.length - 1]!.repliques)} »`,
  });
}

function cinematique(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const a = cast[0]!;
  const arc = arcOf(a.name);
  const an = animalOf(r, pl);
  return finish({
    kind: 'cinematique',
    titre: `Entrée de ${a.name}`,
    logline: `Séquence sans dialogue : ${at(pl)}, le lieu s’éveille, ${a.name} entre en scène, un regard dit tout.`,
    personnages: cast.map(nameOf),
    lieu: pl.nom,
    enjeu: 'installer un personnage et un lieu en 15 secondes, sans un mot',
    obstacle: an ? `${an.espece} qui ${an.comportement}` : 'le rythme du lieu',
    beats: [
      {
        etape: 'Plan d’ensemble',
        texte: `Le lieu vit : ${pl.vie} (sons : ${pl.sons.join(', ')}).`,
        personnages: [],
      },
      {
        etape: 'Entrée',
        texte: `${a.name} entre — ${low(a.posture)} Tenue : ${low(a.tenue)}`,
        personnages: [a.name],
      },
      {
        etape: 'Détail',
        texte: an ? `Un(e) ${an.espece} ${an.comportement}.` : `Un objet du lieu attire son regard.`,
        personnages: [],
      },
      {
        etape: 'Gros plan',
        texte: `Visage : ${pick(r, arc?.expressions ?? a.emotions)}.`,
        personnages: [a.name],
      },
    ],
    chute: `Musique coupée net ; ${a.name} se retourne vers la caméra (${pick(r, arc?.expressions ?? a.emotions)}).`,
  });
}

function quete(r: R, cast: CharacterProfile[], pl: Place): NarrativePlan {
  const a = cast[0]!;
  const goal = pick(r, arcOf(a.name)?.objectifs ?? a.interets);
  const helpers = relationsOf(a.name)
    .map((x) => (x.a === a.name ? x.b : x.a))
    .map((n) => profileOf(n))
    .filter((p): p is CharacterProfile => !!p)
    .slice(0, 3);
  const obstacles = cast.slice(1).length ? cast.slice(1) : helpers.slice(0, 2);
  return finish({
    kind: 'quete',
    titre: `${a.name} et la quête de ${low(goal).split(' ').slice(0, 5).join(' ')}`,
    logline: `${a.name} part pour ${low(goal)} ; trois épreuves, des alliés douteux, une récompense inattendue.`,
    personnages: [a.name, ...obstacles.map(nameOf)],
    lieu: pl.nom,
    enjeu: low(goal),
    obstacle: obstacles.map((o) => `${o.name} (${o.moteur})`).join(' ; ') || a.faiblesses[0]!,
    beats: [
      { etape: 'Appel', texte: `${a.name} décide de ${low(goal)}.`, personnages: [a.name] },
      ...obstacles.map((o, i) => ({
        etape: `Épreuve ${i + 1}`,
        texte: `${o.name} se met en travers : ${o.situations.argent}.`,
        personnages: [a.name, o.name],
      })),
      {
        etape: `Épreuve ${obstacles.length + 1}`,
        texte: `${a.name} contre ${fem(a) ? 'elle' : 'lui'}-même : ${pick(r, a.faiblesses)}.`,
        personnages: [a.name],
      },
      {
        etape: 'Aide',
        texte: helpers[0]
          ? `${helpers[0].name} aide… à sa façon (${helpers[0].moteur}).`
          : `Un inconnu aide sans le savoir.`,
        personnages: helpers[0] ? [helpers[0].name] : [],
      },
    ],
    chute: `La récompense n’est pas celle attendue — « ${pick(r, a.repliques)} »`,
  });
}

function histoireLongue(r: R, cast: CharacterProfile[], pl: Place, seed: number): NarrativePlan {
  const a = cast[0]!;
  const goal = pick(r, arcOf(a.name)?.objectifs ?? a.interets);
  const order: NarrativeKind[] = ['scene-de-vie', 'rencontre', 'conflit', 'intrigue', 'evenement', 'quete'];
  const episodes = order.map((k, i) =>
    generateNarrative(k, {
      seed: seed * 31 + i + 1,
      characters: i === 1 ? [a.name] : cast.map(nameOf),
      place: i === 4 ? undefined : pl.nom,
    }),
  );
  const past = pick(r, arcOf(a.name)?.historique ?? [a.personnalite]);
  return finish({
    kind: 'histoire-longue',
    titre: `La saison de ${a.name}`,
    logline: `Six épisodes pour que ${a.name} parvienne à ${low(goal)} — chaque épisode rapproche du but et complique tout.`,
    personnages: [...new Set(episodes.flatMap((e) => e.personnages))],
    lieu: pl.nom,
    enjeu: low(goal),
    obstacle: episodes
      .map((e) => e.obstacle)
      .slice(0, 3)
      .join(' ; '),
    beats: episodes.map((e, i) => ({
      etape: `Épisode ${i + 1}`,
      texte: `${e.titre} : ${e.logline}`,
      personnages: e.personnages,
    })),
    chute: `Final : rappel du passé (${past}) — ${a.name} obtient ${low(goal)}, mais pas comme prévu.`,
    episodes,
  });
}

/** One story plan, from the knowledge base. Same seed + same inputs → same plan. */
export function generateNarrative(
  kind: NarrativeKind,
  o: { seed?: number; characters?: string[]; place?: string } = {},
): NarrativePlan {
  const seed = o.seed ?? 1;
  const r = prng(seed * 2654435761 + kind.length * 97);
  const need =
    kind === 'scene-de-vie' || kind === 'cinematique'
      ? 1
      : kind === 'evenement' || kind === 'histoire-longue'
        ? 3
        : kind === 'quete'
          ? 3
          : 2;
  const cast = castFor(r, o.characters ?? [], need);
  const pl = placeOfCast(r, cast, o.place);
  switch (kind) {
    case 'scene-de-vie':
      return sceneDeVie(r, cast, pl);
    case 'rencontre':
      return rencontre(r, cast, pl);
    case 'conflit':
      return conflit(r, cast, pl);
    case 'intrigue':
      return intrigue(r, cast, pl);
    case 'evenement':
      return evenement(r, cast, pl);
    case 'cinematique':
      return cinematique(r, cast, pl);
    case 'quete':
      return quete(r, cast, pl);
    case 'histoire-longue':
      return histoireLongue(r, cast, pl, seed);
  }
}
