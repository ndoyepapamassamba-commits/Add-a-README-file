/**
 * BIBLE COMIQUE TIKTOK — les consignes que le PROMPTEUR donne au scénariste (et au générateur d'idées) pour écrire des
 * sketchs de 60 s « à mourir de rire » au format TikTok, avec la troupe de la chaîne. Plus une bibliothèque d'histoires
 * ÉCRITES selon ces règles (répliques complètes, poses, réactions), que l'Autopilot reprend mot pour mot et que le
 * pipeline Blender (scripts/blenderfilm) tourne directement.
 *
 * Mesures de la chaîne (vos 13 TikTok analysés) : 60–70 s, 8 à 16 plans par minute, un plan de 2 à 9 s.
 */

/** Les règles, dans l'ordre où le scénariste doit les appliquer. */
export const TIKTOK_BIBLE: { id: string; rule: string }[] = [
  {
    id: 'hook',
    rule: 'ACCROCHE (0–2 s) : la 1re réplique est DÉJÀ un conflit ou une énormité — une accusation, un aveu, une question piège, une demande absurde. Jamais de « bonjour », jamais de mise en place.',
  },
  {
    id: 'engine',
    rule: 'UN SEUL MOTEUR COMIQUE par film : un mensonge qui grossit, un malentendu, une fierté mal placée, un secret qui fuit, un marchandage qui tourne mal. Tout le film escalade CE moteur.',
  },
  {
    id: 'three',
    rule: 'ESCALADE EN 3 MARCHES (règle de trois) : chaque excuse, chaque mensonge, chaque prix est plus gros ET dit avec plus d’aplomb que le précédent ; la 3e marche est absurde.',
  },
  {
    id: 'density',
    rule: 'UN RIRE TOUTES LES 5 SECONDES : chaque réplique INSTALLE, AGGRAVE ou FRAPPE. Supprime toute réplique qui ne fait aucune des trois (salutations, explications, résumés).',
  },
  {
    id: 'last-word',
    rule: 'LE MOT DRÔLE EN DERNIER : la réplique finit sur le mot qui fait rire ; rien après (pas d’explication, pas de « hein »).',
  },
  {
    id: 'irony',
    rule: 'IRONIE DRAMATIQUE : le public voit ou devine la vérité avant les personnages (la sauce sur le tee-shirt, l’argent dans la chaussure) ; le coupable nie l’évidence avec une mauvaise foi totale.',
  },
  {
    id: 'reversal',
    rule: 'CONTRE-PIED : au moment où on attend A, arrive B — le témoin sauveur accuse le menteur, le riche demande un crédit, l’enfant gagne contre l’adulte, la victime se venge avec la même arme.',
  },
  {
    id: 'reaction',
    rule: 'RÉACTION : après chaque punch, la réaction de l’autre (choc, regard caméra, fou rire) — note-la dans la scène ; elle fait rire autant que la réplique.',
  },
  {
    id: 'punch',
    rule: 'CHUTE ≤ 8 MOTS, de préférence un RAPPEL : la phrase de l’accroche ou une phrase déjà entendue revient avec un autre sens, retournée contre celui qui l’a dite. Puis une seconde de réaction (emoji 😂).',
  },
  {
    id: 'concrete',
    rule: 'DÉTAILS CONCRETS ET LOCAUX : attiéké, garba, sauce graine, gbaka, woro-woro, coupure de courant, maquis, transfert d’argent, crédit téléphonique, dot, bulletin — jamais du générique.',
  },
  {
    id: 'characters',
    rule: 'PERSONNAGES = MOTEURS : chacun garde SON défaut tout le film et le pousse plus loin à chaque scène (le menteur ment plus gros, la tantie dramatise plus fort, l’enfant dit la vérité au pire moment, le frimeur n’a jamais l’argent, le radin négocie même les cadeaux, la go calcule tout, la commerçante marchande tout).',
  },
  {
    id: 'rhythm',
    rule: 'RYTHME TIKTOK : 14 à 18 répliques pour 60 s, chacune ≤ 12 mots ; un nouveau plan toutes les 3 à 5 s ; gros plan sur celui qui ment, plan à deux sur les réactions et sur la chute.',
  },
  {
    id: 'language',
    rule: 'LANGUE : français ivoirien d’Abidjan, oral, compréhensible par tous (« Dêh ! », « Ehhh Dieu ! », « mon môgô », « y a pas drap », « c’est gâté », « laisse ça ») — 1 ou 2 par scène, jamais forcé.',
  },
  {
    id: 'punch-up',
    rule: 'PASSE « PUNCH-UP » AVANT DE RÉPONDRE : relis chaque réplique ; si elle ne ferait pas rire un ado d’Abidjan sur TikTok, réécris-la plus courte, plus précise, plus exagérée ; vérifie que la chute surprend et qu’elle rappelle l’accroche.',
  },
  {
    id: 'taboo',
    rule: 'L’humour vise la SITUATION et le défaut du personnage, jamais un groupe, une ethnie, une religion, un handicap ou une personne réelle.',
  },
];

/** The block given to the writer (story) — the whole bible. */
export function tiktokComedyBrief(): string {
  return [
    'BIBLE COMIQUE TIKTOK (à appliquer à la lettre — le but : éclater de rire du début à la fin, en 60 s) :',
    ...TIKTOK_BIBLE.map((r, i) => `${i + 1}. ${r.rule}`),
  ].join('\n');
}
/** The short form for the idea prompter (ideas of the day from the news). */
export function tiktokIdeaRules(): string {
  return [
    'accroche-conflit dès la 1re réplique',
    'un seul moteur comique escaladé en 3 marches',
    'contre-pied avant la fin',
    'chute ≤ 8 mots qui rappelle l’accroche',
    'détails concrets d’Abidjan',
    'un défaut fixe par personnage',
  ].join(' ; ');
}

import { profileOf } from './actor/characterBible';

// ── HISTOIRES ÉCRITES (60 s, la troupe des planches) ─────────────────────────────────────────────────────────────────
export type Pose = 'neutre' | 'accuse' | 'choc' | 'haussement' | 'rire';
export interface Beat {
  who: string;
  text: string;
  pose: Pose;
  /** The silent reactions of the others on this line. */
  react?: Record<string, Pose>;
  shot?: 'two' | 'mcu' | 'cu';
}
export interface TikTokStory {
  id: string;
  title: string;
  /** The on-screen hook of the first seconds (≤ 6 words, the conflict in one line). */
  hook: string;
  /** Troupe set (name of a set of the kit). */
  decor: string;
  /** The comic engine of the film (bible rule 2). */
  engine: string;
  /** Cast ids → troupe name, height (m), position on the set (m, left < 0), voice. */
  cast: {
    id: string;
    name: string;
    height: number;
    x: number;
    voice: string;
    pitch?: number;
    enter?: number;
  }[];
  beats: Beat[];
  /** Index of the punchline beat (emoji after it). */
  punch: number;
}

/** A cast member: height and voice come from the character's sheet (the knowledge base), never typed twice. */
const CAST = (id: string, name: string, x: number, o: { enter?: number } = {}) => {
  const p = profileOf(name);
  if (!p) throw new Error(`fiche absente : ${name}`);
  return {
    id,
    name: p.name,
    height: p.taille,
    x,
    voice: p.voix.piper,
    ...(p.voix.pitch ? { pitch: p.voix.pitch } : {}),
    ...o,
  };
};
const B = (
  who: string,
  pose: Pose,
  text: string,
  o: { react?: Record<string, Pose>; shot?: Beat['shot'] } = {},
): Beat => ({ who, pose, text, ...o });

export const TIKTOK_STORIES: TikTokStory[] = [
  {
    id: 'poulet',
    hook: 'Qui a mangé le poulet ?',
    title: 'Le poulet de Tantie Awa',
    decor: 'Salon',
    engine: 'un mensonge qui grossit (Modou nie avec la sauce sur le tee-shirt)',
    cast: [
      CAST('awa', 'TANTIE AWA', -0.42),
      CAST('modou', 'MODOU', 0.4),
      CAST('mamadou', 'PETIT MAMADOU', 0.02, { enter: 9 }),
    ],
    beats: [
      B('awa', 'accuse', 'Modou ! Qui a mangé le poulet que j’avais laissé là ?', {
        shot: 'two',
        react: { modou: 'choc' },
      }),
      B('modou', 'choc', 'Moi ? Tantie, je te jure, je dormais depuis midi !'),
      B('awa', 'accuse', 'Tu dormais… avec la sauce sur ton tee-shirt ?'),
      B('modou', 'haussement', 'Ça ? C’est la sauce d’hier, Tantie. Elle est vieille !'),
      B('awa', 'neutre', 'Hier on a mangé du riz blanc. Sans sauce.', { react: { modou: 'choc' } }),
      B('modou', 'haussement', 'Voilà pourquoi j’avais faim aujourd’hui !'),
      B('awa', 'accuse', 'Modou, regarde-moi dans les yeux. Tu as mangé mon poulet ?'),
      B('modou', 'neutre', 'Tantie, je suis un homme honnête. Demande à tout le quartier !'),
      B('awa', 'haussement', 'Tout le quartier dit que tu manges même les os du voisin !', {
        react: { modou: 'choc' },
      }),
      B('mamadou', 'neutre', 'Tantie ! Moi j’ai vu qui a mangé le poulet !', { shot: 'two' }),
      B('awa', 'neutre', 'Parle, mon fils. C’est qui ?'),
      B('mamadou', 'haussement', 'C’est le chat !', { react: { modou: 'rire' } }),
      B('modou', 'rire', 'Voilà ! Le chat ! Je l’ai toujours dit, ce chat est un voleur !'),
      B('awa', 'choc', 'Mais on n’a pas de chat dans cette maison !'),
      B('mamadou', 'accuse', 'Ah bon ? Alors c’est Tonton Modou. Il a les doigts tout jaunes !', {
        shot: 'two',
        react: { modou: 'choc', awa: 'accuse' },
      }),
      B('modou', 'choc', 'Petit traître !', { shot: 'cu' }),
      B('awa', 'accuse', 'Modou ! Viens ici tout de suite !', { shot: 'two', react: { modou: 'choc' } }),
    ],
    punch: 15,
  },
  {
    id: 'transfert',
    hook: 'Il veut l’épouser avec quel argent ?',
    title: 'Le transfert de Koffi',
    decor: 'Cérémonie',
    engine: 'le faux riche qui promet un transfert d’argent qui « voyage »',
    cast: [
      CAST('nounou', 'MAMAN NOUNOU', -0.45),
      CAST('koffi', 'KOFFI', 0.42),
      CAST('coumba', 'COUMBA', 0.0),
    ],
    beats: [
      B('nounou', 'accuse', 'Koffi, tu veux épouser ma fille avec quel argent ?', {
        shot: 'two',
        react: { koffi: 'choc' },
      }),
      B('koffi', 'haussement', 'Maman, l’argent n’est pas un problème. Je suis dans les affaires.'),
      B('nounou', 'accuse', 'Quelles affaires ? Tu portes tes lunettes même la nuit.'),
      B('koffi', 'neutre', 'C’est pour protéger mes yeux… du soleil de ma réussite.'),
      B('coumba', 'rire', 'Maman, il a déjà fait le transfert pour la dot !', { react: { koffi: 'choc' } }),
      B('koffi', 'choc', 'Euh… oui. Le transfert est en route. Il voyage.'),
      B('nounou', 'haussement', 'Il voyage à pied ou en gbaka ?'),
      B('koffi', 'haussement', 'Le réseau est saturé. C’est la coupure de courant.'),
      B('nounou', 'accuse', 'Le courant, c’est pour la lumière, mon fils. Pas pour l’argent.'),
      B('coumba', 'neutre', 'Montre au moins le message de confirmation, chéri.'),
      B('koffi', 'haussement', 'Je l’ai supprimé. Par discrétion. Je suis un homme humble.', {
        react: { nounou: 'choc' },
      }),
      B('nounou', 'neutre', 'Bon. Moi aussi je vais faire un transfert. Donne ta chaîne.', { shot: 'two' }),
      B('koffi', 'choc', 'Maman ! C’est ma chaîne en or !'),
      B('coumba', 'rire', 'Maman, elle n’est même pas en or. Elle rouille !', { react: { koffi: 'choc' } }),
      B('koffi', 'haussement', 'C’est de l’or… vintage.'),
      B('nounou', 'rire', 'Ta chaîne est en route. Elle voyage.', { shot: 'cu' }),
      B('koffi', 'choc', 'Maman, ça, c’est du vol !', { shot: 'two', react: { coumba: 'rire' } }),
    ],
    punch: 15,
  },
  {
    id: 'anniversaire',
    hook: 'Papi radin contre anniversaire',
    title: 'Baye Ndiaye et l’anniversaire',
    decor: 'Village',
    engine: 'le grand-père riche et radin qui négocie même le cadeau de son petit-fils',
    cast: [
      CAST('baye', 'BAYE NDIAYE', 0.4),
      CAST('mamadou', 'PETIT MAMADOU', -0.35),
      CAST('awa', 'TANTIE AWA', -0.75, { enter: 9 }),
    ],
    beats: [
      B('mamadou', 'rire', 'Papi ! Aujourd’hui c’est mon anniversaire !', {
        shot: 'two',
        react: { baye: 'choc' },
      }),
      B('baye', 'choc', 'Encore ? Tu en as déjà eu un l’année dernière !'),
      B('mamadou', 'haussement', 'Papi, tout le monde a un anniversaire chaque année.'),
      B('baye', 'choc', 'Chaque année ?! Qui a signé ce contrat ?'),
      B('mamadou', 'neutre', 'Je veux juste un petit cadeau. Un ballon.'),
      B('baye', 'haussement', 'Un ballon ? Prends une orange. Ça roule aussi.'),
      B('mamadou', 'accuse', 'Une orange ? Papi, tu as trois voitures !'),
      B('baye', 'neutre', 'Les voitures, c’est pour regarder. On ne les use pas.'),
      B('mamadou', 'neutre', 'Bon. Donne-moi juste deux cents francs.'),
      B('baye', 'choc', 'Deux cents ?! Tu veux me ruiner ou me tuer ?', { react: { mamadou: 'choc' } }),
      B('awa', 'accuse', 'Baye ! L’enfant demande juste un cadeau !', { shot: 'two' }),
      B('baye', 'rire', 'D’accord. Je lui offre mon plus beau cadeau : mes conseils.'),
      B('mamadou', 'haussement', 'Les conseils, on peut acheter du pain avec ?'),
      B('baye', 'neutre', 'Conseil numéro un : ne demande jamais d’argent à ton grand-père.'),
      B('mamadou', 'accuse', 'Alors je dis à Mamie où tu caches l’argent ?', { react: { baye: 'choc' } }),
      B('baye', 'choc', 'Quel argent ?! Viens, mon fils, on va acheter le ballon.', { shot: 'two' }),
      B('mamadou', 'rire', 'Deux ballons, Papi. Conseil numéro deux.', { shot: 'cu' }),
    ],
    punch: 16,
  },
  {
    id: 'tomates',
    hook: 'Le marchandage qui coûte cher',
    title: 'Les tomates de Maman Nounou',
    decor: 'Marché',
    engine: 'un marchandage où le prix monte à chaque phrase',
    cast: [CAST('nounou', 'MAMAN NOUNOU', -0.4), CAST('modou', 'MODOU', 0.42)],
    beats: [
      B('modou', 'neutre', 'Maman, ton tas de tomates là, c’est combien ?', { shot: 'two' }),
      B('nounou', 'rire', 'Pour toi, mon fils ? Mille francs.', { react: { modou: 'choc' } }),
      B('modou', 'choc', 'Mille ?! Hier c’était cinq cents !'),
      B('nounou', 'haussement', 'Hier, tu n’avais pas ces sandales neuves.'),
      B('modou', 'accuse', 'Ce sont les sandales de mon grand frère !'),
      B('nounou', 'neutre', 'Alors c’est ton grand frère qui va payer. Mille.'),
      B('modou', 'neutre', 'Je te donne trois cents. Dernier prix.'),
      B('nounou', 'accuse', 'Trois cents ? Tu veux les tomates ou la photo des tomates ?'),
      B('modou', 'rire', 'Quatre cents, et je dis au marché que tu es belle.'),
      B('nounou', 'rire', 'Tout le monde le sait déjà. Mille deux cents.', { react: { modou: 'choc' } }),
      B('modou', 'choc', 'Pourquoi ça monte encore ?!'),
      B('nounou', 'haussement', 'Tu m’as fatiguée. La fatigue, ça se paye.'),
      B('modou', 'accuse', 'J’ai seulement cinq cents. Je prends, ou je pars !', { shot: 'two' }),
      B('nounou', 'neutre', 'Donne les cinq cents.'),
      B('modou', 'neutre', 'Voilà. Et les tomates ?'),
      B('nounou', 'haussement', 'Moi, j’ai pris. Toi, tu pars.', { shot: 'cu', react: { modou: 'choc' } }),
      B('modou', 'choc', 'Maman, c’est du vol !', { shot: 'two' }),
      B('nounou', 'rire', 'Non, mon fils. C’est le marché.', { shot: 'cu' }),
    ],
    punch: 15,
  },
  {
    id: 'garba',
    hook: 'Qui paie le garba l’épouse',
    title: 'Le garba de Coumba',
    decor: 'Maquis',
    engine: 'deux prétendants fauchés qui surenchérissent de fausses promesses',
    cast: [CAST('coumba', 'COUMBA', 0.0), CAST('koffi', 'KOFFI', -0.5), CAST('modou', 'MODOU', 0.5)],
    beats: [
      B('coumba', 'rire', 'Celui qui me paie le garba ce soir, je l’épouse.', {
        shot: 'two',
        react: { koffi: 'choc', modou: 'choc' },
      }),
      B('koffi', 'haussement', 'Moi, je te paie le garba avec du thon de Dubaï.'),
      B('modou', 'accuse', 'Le thon de Dubaï ? Ton thon vient du marché d’Adjamé !'),
      B('koffi', 'neutre', 'Il a pris l’avion. C’est un thon international.'),
      B('modou', 'rire', 'Moi, je te paie le garba ET l’attiéké.'),
      B('coumba', 'neutre', 'Avec quel argent, Modou ?'),
      B('modou', 'haussement', 'L’attiéké est déjà dans ma poche. Il est chaud.', {
        react: { coumba: 'choc' },
      }),
      B('coumba', 'choc', 'Dans ta poche ?! Depuis quand ?'),
      B('modou', 'neutre', 'Depuis hier. Je suis un homme prévoyant.'),
      B('koffi', 'rire', 'Coumba, moi je paie par carte.'),
      B('coumba', 'neutre', 'Quelle carte ?'),
      B('koffi', 'haussement', 'Ma carte… de fidélité. Neuf tampons sur dix !', {
        react: { coumba: 'choc' },
      }),
      B('coumba', 'accuse', 'Bon. Vous allez payer moitié-moitié.', { shot: 'two' }),
      B('modou', 'choc', 'Moitié de quoi ? On a zéro tous les deux !'),
      B('koffi', 'haussement', 'Zéro divisé par deux, ça fait toujours zéro, ma chérie.'),
      B('coumba', 'rire', 'Moi, j’épouse le vendeur de garba.', {
        shot: 'cu',
        react: { koffi: 'choc', modou: 'choc' },
      }),
    ],
    punch: 15,
  },
  {
    id: 'galant',
    hook: 'Papi drague au salon',
    title: 'Le vieux galant',
    decor: 'Salon de coiffure',
    engine: 'le vieux radin qui drague en offrant… sa présence',
    cast: [
      CAST('prisca', 'TATA PRISCA', 0.35),
      CAST('baye', 'BAYE NDIAYE', -0.4),
      CAST('nounou', 'MAMAN NOUNOU', -0.8, { enter: 9 }),
    ],
    beats: [
      B('baye', 'rire', 'Prisca, tu es belle comme un billet de dix mille.', {
        shot: 'two',
        react: { prisca: 'choc' },
      }),
      B('prisca', 'rire', 'Tonton, tu es venu me draguer ou me compter ?'),
      B('baye', 'neutre', 'Les deux. Je suis un homme organisé.'),
      B('prisca', 'neutre', 'Bon. Qu’est-ce que tu m’offres, alors ?'),
      B('baye', 'haussement', 'Je t’offre ma présence. Elle coûte très cher.'),
      B('prisca', 'accuse', 'Moi je veux un téléphone. Le dernier modèle.'),
      B('baye', 'neutre', 'Prends le mien. Il est très dernier : il a dix ans.'),
      B('prisca', 'choc', 'Tonton, ton téléphone a encore une antenne !'),
      B('baye', 'rire', 'C’est pour capter les belles filles.', { react: { prisca: 'rire' } }),
      B('nounou', 'accuse', 'Baye Ndiaye ! Tu captes qui, là ?', { shot: 'two', react: { baye: 'choc' } }),
      B('baye', 'choc', 'Nounou ! Je… je lui demandais le chemin.'),
      B('nounou', 'accuse', 'Le chemin ? Tu habites ce quartier depuis trente ans !'),
      B('baye', 'haussement', 'Justement. Je vérifiais s’il avait changé.'),
      B('prisca', 'haussement', 'Maman Nounou, il m’a offert sa présence. Gratuitement.', {
        react: { nounou: 'choc' },
      }),
      B('nounou', 'rire', 'Gratuitement ? Même moi, il me la fait payer.', {
        shot: 'cu',
        react: { baye: 'choc' },
      }),
    ],
    punch: 14,
  },
  {
    id: 'bulletin',
    hook: 'Le bulletin a eu un accident',
    title: 'Le bulletin de Petit Mamadou',
    decor: 'Salon',
    engine: 'l’excuse impossible (la chèvre a mangé le bulletin) qui finit par piéger le père',
    cast: [
      CAST('awa', 'TANTIE AWA', -0.42),
      CAST('mamadou', 'PETIT MAMADOU', 0.3),
      CAST('modou', 'MODOU', 0.75, { enter: 6 }),
    ],
    beats: [
      B('awa', 'accuse', 'Mamadou ! Ton bulletin. Tout de suite !', {
        shot: 'two',
        react: { mamadou: 'choc' },
      }),
      B('mamadou', 'haussement', 'Tantie, le bulletin a eu un accident.'),
      B('awa', 'neutre', 'Quel accident ?'),
      B('mamadou', 'neutre', 'Il est tombé. Et la chèvre l’a mangé.'),
      B('awa', 'accuse', 'Mais on n’a pas de chèvre !'),
      B('mamadou', 'haussement', 'Elle est venue, elle a mangé, elle est repartie.'),
      B('modou', 'rire', 'Laisse l’enfant. Moi aussi, à son âge, j’étais faible.', {
        shot: 'two',
        react: { awa: 'choc' },
      }),
      B('awa', 'choc', 'Tu vois ? Il a pris ça chez toi !'),
      B('mamadou', 'neutre', 'Tonton Modou, tu avais combien en maths ?'),
      B('modou', 'haussement', 'Moi ? Zéro. Mais un zéro bien rond, propre.'),
      B('awa', 'accuse', 'Mamadou, sors le bulletin de ton sac. Je vois le papier.'),
      B('mamadou', 'neutre', 'D’accord. Mais lis lentement, Tantie. Ça fait mal.'),
      B('awa', 'choc', 'Trois sur vingt ?! En maths ?!', { react: { mamadou: 'haussement' } }),
      B('mamadou', 'rire', 'C’est pas mal, Tantie. Tonton avait zéro.', { react: { modou: 'choc' } }),
      B('modou', 'choc', 'Eh ! On avait dit qu’on était ensemble !'),
      B('awa', 'accuse', 'Toi, va chercher ton bulletin aussi !', { shot: 'two' }),
      B('modou', 'haussement', 'Mon bulletin aussi… la chèvre l’a mangé.', {
        shot: 'cu',
        react: { mamadou: 'rire' },
      }),
    ],
    punch: 16,
  },
  {
    id: 'addition',
    hook: 'Koffi paie tout le maquis ?',
    title: 'L’addition de Koffi',
    decor: 'Plage',
    engine: 'le frimeur qui invite tout le monde et fuit l’addition',
    cast: [
      CAST('koffi', 'KOFFI', -0.4),
      CAST('awa', 'TANTIE AWA', 0.42),
      CAST('mamadou', 'PETIT MAMADOU', 0.05, { enter: 10 }),
    ],
    beats: [
      B('koffi', 'rire', 'Tantie ! Ce soir, c’est moi qui paie tout le maquis !', {
        shot: 'two',
        react: { awa: 'choc' },
      }),
      B('awa', 'rire', 'Ehhh Dieu ! Koffi est devenu riche ?'),
      B('koffi', 'haussement', 'Riche ? Non. Je suis devenu très riche.'),
      B('awa', 'neutre', 'Poisson braisé, attiéké, alloco pour vingt personnes ?'),
      B('koffi', 'rire', 'Pour trente ! Et rajoute les boissons !'),
      B('awa', 'neutre', 'Voilà l’addition : quatre-vingt-cinq mille francs.', { react: { koffi: 'choc' } }),
      B('koffi', 'choc', 'Quatre-vingt… Attends, mon téléphone sonne.'),
      B('awa', 'accuse', 'Ton téléphone ne sonne pas. Il est éteint.'),
      B('koffi', 'haussement', 'C’est un appel silencieux. Pour les gens importants.'),
      B('awa', 'accuse', 'Koffi, paie, ou je garde tes lunettes.'),
      B('mamadou', 'rire', 'Tantie ! J’ai tout filmé. C’est déjà sur TikTok !', {
        shot: 'two',
        react: { koffi: 'choc' },
      }),
      B('koffi', 'choc', 'Quoi ?! Combien de vues ?'),
      B('mamadou', 'haussement', 'Dix mille vues. Et ta maman a commenté.'),
      B('koffi', 'choc', 'Elle a dit quoi ?!'),
      B('mamadou', 'neutre', 'Elle a dit : paie, Koffi. Tu m’as fatiguée.'),
      B('awa', 'rire', 'Paie, ou je fais la partie deux.', { shot: 'cu', react: { koffi: 'choc' } }),
    ],
    punch: 15,
  },
  {
    id: 'facture',
    hook: 'Le docteur facture tout',
    title: 'La facture du Docteur Sylla',
    decor: 'Hôpital',
    engine: 'un médecin qui facture chaque geste, jusqu’au retour de bâton',
    cast: [
      CAST('bouba', 'BOUBACAR', -0.42),
      CAST('sylla', 'DOCTEUR SYLLA', 0.4),
      CAST('soeur', 'SŒUR AWA', 0.02, { enter: 4 }),
    ],
    beats: [
      B('bouba', 'choc', 'Docteur, j’ai mangé trois poulets. Mon ventre va exploser !'),
      B('sylla', 'rire', 'Trois poulets ? Consultation : dix mille francs.', { react: { bouba: 'choc' } }),
      B('bouba', 'choc', 'Tu ne m’as même pas encore touché !'),
      B('sylla', 'neutre', 'Je t’ai regardé. Le regard, c’est cinq mille.'),
      B('soeur', 'haussement', 'Docteur, il faut au moins l’ausculter, non ?', { shot: 'two' }),
      B('sylla', 'accuse', 'Le stéthoscope est froid. Le froid, c’est deux mille.', {
        react: { bouba: 'choc' },
      }),
      B('bouba', 'accuse', 'Tu factures même le froid de ton appareil ?!'),
      B('sylla', 'haussement', 'Et la climatisation. Tu respires mon air depuis tantôt.'),
      B('soeur', 'rire', 'Boubacar, retiens ta respiration. Ça fera moins cher.', {
        react: { bouba: 'choc' },
      }),
      B('bouba', 'neutre', 'Je n’ai pas d’argent. Mais j’ai ça.'),
      B('sylla', 'choc', 'Un poulet ? Dans ton boubou ?!'),
      B('bouba', 'rire', 'Le quatrième. Pour les urgences.'),
      B('sylla', 'rire', 'Accepté ! Le poulet, c’est mon tarif préféré.', { react: { soeur: 'choc' } }),
      B('sylla', 'neutre', 'Hmm… il est bien pimenté, ton poulet.'),
      B('bouba', 'haussement', 'Pimenté ? C’est le poulet d’avant-hier.', { react: { sylla: 'choc' } }),
      B('sylla', 'choc', 'Sœur Awa ! Mon ventre ! Consultation, vite !', { shot: 'two' }),
      B('soeur', 'rire', 'Pour vous, docteur ? Dix mille francs.', { shot: 'cu', react: { sylla: 'choc' } }),
      B('bouba', 'rire', 'Et le regard, c’est cinq mille !', { shot: 'two' }),
    ],
    punch: 16,
  },
  {
    id: 'credit',
    hook: 'Elle drague le banquier',
    title: 'Le crédit du Banquier',
    decor: 'Bureau',
    engine: 'le banquier qui refuse tout… jusqu’à ce qu’il ait besoin d’un crédit',
    cast: [
      CAST('golep', 'LA GO LÉOPARD', -0.42),
      CAST('banq', 'LE BANQUIER', 0.42),
      CAST('dieng', 'TONTON DIENG', 0.0, { enter: 8 }),
    ],
    beats: [
      B('golep', 'rire', 'Monsieur le banquier, vous êtes marié ? Je demande pour un crédit.'),
      B('banq', 'neutre', 'Crédit refusé. Et mariage refusé aussi.', { react: { golep: 'choc' } }),
      B('golep', 'choc', 'Je n’ai même pas dit le montant !'),
      B('banq', 'haussement', 'Je refuse avant. Ça gagne du temps.'),
      B('golep', 'accuse', 'Un petit crédit pour mon commerce. De sacs. Pour moi.'),
      B('banq', 'neutre', 'Garantie ? Maison, voiture, salaire ?'),
      B('golep', 'rire', 'J’ai mon sourire. Il a déjà payé trois loyers.', { react: { banq: 'choc' } }),
      B('banq', 'choc', 'Madame, ici c’est une banque. Pas un maquis.'),
      B('dieng', 'rire', 'Laisse-la ! Moi, j’ai deux villas à Assinie !', { shot: 'two' }),
      B('golep', 'rire', 'Tonton ! Vous êtes marié ? Je demande pour une villa.'),
      B('banq', 'accuse', 'Monsieur Dieng, votre compte est à moins trois mille.', {
        react: { dieng: 'choc' },
      }),
      B('dieng', 'haussement', 'Les villas sont en construction. Dans ma tête.'),
      B('golep', 'choc', 'Dans ta tête ?! Et le terrain ?'),
      B('dieng', 'neutre', 'Le terrain est vaste. Ma tête est grande.'),
      B('golep', 'neutre', 'Et vous, monsieur le banquier, votre compte ?', { react: { banq: 'choc' } }),
      B('banq', 'choc', 'Euh… Madame, vous auriez un petit crédit ?'),
      B('golep', 'rire', 'Crédit refusé. Et mariage refusé aussi.', { shot: 'cu', react: { banq: 'choc' } }),
      B('dieng', 'rire', 'Moi je prête ! Dans ma tête.', { shot: 'two' }),
    ],
    punch: 16,
  },
];

/** A story as the Blender film pipeline reads it (scripts/blenderfilm/plan.py). */
export function blenderStory(s: TikTokStory): Record<string, unknown> {
  return {
    title: s.title,
    hook: s.hook,
    decor: s.decor,
    fps: 25,
    size: [576, 1024],
    music: true,
    cast: s.cast.map((c) => ({
      id: c.id,
      name: c.name,
      voice: c.voice,
      height: c.height,
      x: c.x,
      ...(c.pitch ? { pitch: c.pitch } : {}),
      ...(c.enter !== undefined ? { enter: c.enter } : {}),
    })),
    beats: s.beats.map((b) => ({
      who: b.who,
      pose: b.pose,
      text: b.text,
      ...(b.react ? { react: b.react } : {}),
      ...(b.shot ? { shot: b.shot } : {}),
    })),
    punch: { beat: s.punch, emoji: '😂' },
  };
}
/** A story as the Autopilot's idea: the full script, kept word for word by the writer. */
export function storyScript(s: TikTokStory): string {
  const name = (id: string) => s.cast.find((c) => c.id === id)?.name ?? id.toUpperCase();
  return `${s.title} (lieu : ${s.decor}) — SCRIPT À GARDER MOT POUR MOT :\n${s.beats.map((b) => `${name(b.who)} : [${b.pose}] ${b.text}`).join('\n')}`;
}

/** The narrative history of a character: every written story they play in (their episodes, in order). */
export function episodesOf(name: string): { id: string; title: string; decor: string }[] {
  const n = name.toUpperCase();
  return TIKTOK_STORIES.filter((s) => s.cast.some((c) => c.name === n)).map((s) => ({
    id: s.id,
    title: s.title,
    decor: s.decor,
  }));
}
