/**
 * L'UNIVERS de la chaîne — the recurring cast and sets of the account, read on its own character catalogues,
 * sheets and set boards (Pixar-like 3D, warm West-African light). Each character: name, comic role (FR), visual
 * description (EN, copied VERBATIM into every image / video prompt so the character looks the same in every film) and
 * the fields of a character sheet. Each set: the description of the empty décor. The writer gets the cast with the roles;
 * the 3D / sheet actors of the library are built from the same entries.
 */
import type { CharacterSheet } from '../types';
import type { Prop } from './cast3d';

export interface UniverseCharacter extends Partial<CharacterSheet> {
  name: string;
  role: string;
  /** Visual description in English, verbatim in the prompts. */
  visual: string;
  prop?: Prop;
}
const C = (
  name: string,
  role: string,
  gender: string,
  age: string,
  visual: string,
  f: Partial<UniverseCharacter> = {},
): UniverseCharacter => ({ name, role, gender, age, visual, clothing: visual, ...f });

export const UNIVERSE: UniverseCharacter[] = [
  // The family of the account (its most frequent cast).
  C(
    'MAMAN NOUNOU',
    'reine du marchandage, la mère qui gère tout',
    'femme',
    '50 ans',
    'plump West-African woman in her 50s, red and yellow sunflower wax-print dress with matching red wax head-wrap, green-and-white gingham apron, black belt bag stuffed with banknotes, gold hoop earrings, black flip-flops',
    {
      body: 'plump, round',
      hair: 'red wax headwrap',
      accessories: 'red headwrap, gold hoop earrings, belt bag',
      face: 'big warm eyes, loud laugh',
    },
  ),
  C(
    'BAYE NDIAYE',
    'le grand-père riche et radin de mauvaise foi',
    'homme',
    '62 ans',
    'plump grey-haired West-African grandfather, short grey beard, shiny royal-blue boubou with gold embroidery, brown prayer beads, brown leather sandals',
    {
      body: 'plump',
      hair: 'short grey hair',
      accessories: 'prayer beads, grey beard',
      face: 'smug innocent face',
      prop: 'chapelet',
    },
  ),
  C(
    'COUMBA',
    'la fille stratège, reine du regard caméra',
    'femme',
    '26 ans',
    'curvy young West-African woman, long braids, off-shoulder pink-and-purple wax-print fitted long dress with ruffled sleeves and a side slit, gold hoop earrings, thin gold necklace, pink block-heel sandals',
    {
      body: 'curvy',
      hair: 'long braided hair',
      accessories: 'gold hoop earrings',
      face: 'raised eyebrow, unimpressed expression',
    },
  ),
  C(
    'PETIT MAMADOU',
    'l’enfant plus malin que les adultes',
    'garçon',
    '8 ans',
    'small West-African boy around 8, short curly hair, oversized yellow football jersey number 10 with green collar, blue shorts with white stripes, black-and-white slide sandals',
    { hair: 'short curly hair', face: 'big curious eyes, cheeky smile' },
  ),
  C(
    'MODOU',
    'le débrouillard malchanceux',
    'homme',
    '35 ans',
    'thin lanky West-African man, short hair, thin moustache and goatee, faded worn green t-shirt, brown cargo trousers rolled at the ankle, black sandals',
    {
      body: 'thin, lanky',
      hair: 'short hair',
      accessories: 'moustache, goatee',
      face: 'expressive tired eyes',
    },
  ),
  C(
    'TANTIE AWA',
    'la belle-mère / voisine redoutable',
    'femme',
    '52 ans',
    'plump West-African woman in her 50s, orange-and-yellow floral wax dress with ruffled short sleeves and matching orange head-wrap, gold hoop earrings, black flip-flops',
    {
      body: 'large, plump',
      hair: 'orange headwrap',
      accessories: 'orange headwrap, gold hoop earrings',
      face: 'piercing judgmental stare',
    },
  ),
  C(
    'TONTON DIENG',
    'le vantard mythomane',
    'homme',
    '50 ans',
    'middle-aged West-African man, grey stubble, beige flat cap, open red floral shirt over a white vest, blue jeans, gold-tone watch',
    {
      body: 'lanky with a pot belly',
      hair: 'short hair',
      accessories: 'flat cap, gold-tone watch',
      face: 'storytelling grin',
    },
  ),
  // The neighbourhood (character catalogues).
  C(
    'MONSIEUR DIARRA',
    'comptable qui compte tout',
    'homme',
    '45 ans',
    'thin West-African man, cream kufi cap, thin moustache and goatee, beige shirt with a sleeveless vest, holding a calculator and files',
    { body: 'thin', accessories: 'kufi cap, moustache', prop: 'journal' },
  ),
  C(
    'MAÎTRE COULIBALY',
    'avocate qui complique tout',
    'femme',
    '40 ans',
    'West-African woman lawyer, blue-and-yellow wax head-wrap, gold hoop earrings, black lawyer robe with white jabot, holding folders',
    {
      accessories: 'blue and yellow headwrap, gold hoop earrings',
      face: 'stern raised eyebrow',
      prop: 'journal',
    },
  ),
  C(
    'AGENT BAKARY',
    'douanier qui trouve toujours quelque chose',
    'homme',
    '40 ans',
    'West-African customs officer, green cap marked DOUANE, green uniform with epaulettes, short beard, holding a passport',
    { accessories: 'green cap, beard', face: 'suspicious squint' },
  ),
  C(
    'TANTIE AWA SARR',
    'restauratrice qui régale tout le quartier',
    'femme',
    '50 ans',
    'plump West-African woman, red-orange wax head-wrap, yellow wax dress, black apron, stirring a big pot with a wooden spoon',
    {
      body: 'plump',
      accessories: 'red headwrap, gold earrings',
      face: 'big delighted smile',
      prop: 'assiette',
    },
  ),
  C(
    'PROFESSEUR SAMBA',
    'intellectuel qui sait tout (ou presque)',
    'homme',
    '55 ans',
    'thin West-African man, embroidered kufi cap, thin moustache and goatee, purple boubou with gold embroidery, holding a newspaper and a coffee cup',
    { body: 'thin', accessories: 'kufi cap, moustache', face: 'smug knowing look', prop: 'journal' },
  ),
  C(
    'MADAME COUMBA',
    'voisine curieuse et indiscrète',
    'femme',
    '50 ans',
    'plump West-African woman, blue-and-orange floral head-wrap and matching floral wax dress, gold earrings, finger on her lips',
    { body: 'plump', accessories: 'floral headwrap, gold earrings', face: 'sly gossiping eyes' },
  ),
  C(
    'DJECKY',
    'jeune du quartier toujours dans les plans',
    'homme',
    '22 ans',
    'athletic young West-African man, backwards black cap, red basketball jersey number 23, goatee, gold chain, holding a basketball',
    { body: 'athletic', accessories: 'backwards cap, gold chain', face: 'cocky grin' },
  ),
  C(
    'PETIT IBRAHIMA',
    'enfant intelligent qui veut réussir',
    'garçon',
    '9 ans',
    'small West-African schoolboy, short curly hair, white school shirt, navy shorts, backpack, holding a blue notebook with a rocket',
    { face: 'big bright eyes, proud smile' },
  ),
  C(
    'PETITE KHADIJA',
    'enfant rêveuse qui pose mille questions',
    'fille',
    '7 ans',
    'small West-African girl, two afro puffs with pink bows, pink floral dress, books and a pencil',
    { hair: 'two afro puffs with pink bows', face: 'dreamy curious eyes' },
  ),
  C(
    'AGENT GORA',
    'vigile très débrouillard et philosophe de la vie',
    'homme',
    '45 ans',
    'stocky West-African security guard, navy cap marked SÉCURITÉ, light-blue security shirt, short beard, flashlight and a bunch of keys',
    { body: 'stocky', accessories: 'navy cap, beard', face: 'wink and thumbs up' },
  ),
  C(
    'GÉNÉRAL ZONGO',
    'entrepreneur toujours en chantier',
    'homme',
    '45 ans',
    'West-African contractor, yellow hard hat, orange high-visibility vest over a denim shirt, short beard, rolled blueprints and a phone',
    { accessories: 'yellow hard hat, beard', face: 'over-excited grin', prop: 'téléphone' },
  ),
  C(
    'TATA PRISCA',
    'coiffeuse qui sait tout sur tout le monde',
    'femme',
    '35 ans',
    'curvy West-African hairdresser, big afro with a pink headband, pink apron over a black top, gold hoop earrings, hairdryer and brush',
    {
      body: 'curvy',
      hair: 'big afro',
      accessories: 'pink headband, gold hoop earrings',
      face: 'gossip smirk',
    },
  ),
  C(
    'AGENT DOUMBIA',
    'policier qui cherche toujours à « arranger »',
    'homme',
    '45 ans',
    'plump West-African policeman, navy police cap, light-blue police shirt, short beard, writing in a notebook',
    { body: 'plump', accessories: 'navy cap, beard', face: 'shifty sideways look', prop: 'journal' },
  ),
  C(
    'MÉCANO ISSA',
    'mécanicien qui bricole tout même l’impossible',
    'homme',
    '35 ans',
    'West-African mechanic, grey cap worn backwards, greasy blue overalls, holding a wrench',
    { accessories: 'backwards cap', face: 'confident smirk', prop: 'bâton' },
  ),
  C(
    'SŒUR AWA',
    'infirmière au grand cœur mais très directe',
    'femme',
    '35 ans',
    'West-African nurse, braided bun, white-and-pink nurse uniform, stethoscope, tablet',
    { hair: 'braided bun', accessories: 'stethoscope', face: 'kind but stern' },
  ),
  C(
    'TIÉKORO',
    'vendeur de gadgets et roi des bons plans',
    'homme',
    '25 ans',
    'young West-African hustler, red cap worn backwards, red graphic t-shirt, headphones around the neck, selfie stick with a phone, camera',
    { accessories: 'backwards red cap, headphones', face: 'salesman grin', prop: 'téléphone' },
  ),
  C(
    'PETIT MOUSSA',
    'enfant malin et espiègle',
    'garçon',
    '8 ans',
    'small West-African schoolboy, short curly hair, white school shirt, navy shorts, backpack, running',
    { face: 'mischievous grin' },
  ),
  C(
    'PETITE AYA',
    'enfant curieuse qui pose trop de questions',
    'fille',
    '6 ans',
    'small West-African girl, two afro puffs with pink bows, pink floral dress, purple backpack, teddy bear',
    { hair: 'two afro puffs with pink bows', face: 'wide curious eyes' },
  ),
  C(
    'SORCIÈRE MAMA DÉDÉ',
    'vendeuse de remèdes et de solutions miracles',
    'femme',
    '60 ans',
    'older West-African woman, colourful wax head-wrap and wax dress, many bead necklaces, holding herbs and a calabash of potion',
    { accessories: 'headwrap, bead necklaces', face: 'mysterious wink' },
  ),
  C(
    'IMAM KARIM',
    'sage du quartier qui remet tout le monde sur le droit chemin',
    'homme',
    '50 ans',
    'West-African man, white embroidered kufi cap, white boubou with an embroidered stole, short beard, holding a book',
    { accessories: 'white kufi, beard', face: 'calm wise smile', prop: 'journal' },
  ),
  C(
    'MAÎTRE KONÉ',
    'instituteur pédant',
    'homme',
    '58 ans',
    'thin older West-African teacher, glasses, receding hairline, white shirt, blue tie, brown trousers, red book',
    {
      body: 'thin',
      hair: 'receding hairline',
      accessories: 'glasses',
      face: 'pedantic frown',
      prop: 'journal',
    },
  ),
  C(
    'DOCTEUR SYLLA',
    'médecin qui facture tout',
    'homme',
    '45 ans',
    'West-African doctor, glasses, short beard, white coat over a blue shirt and tie, stethoscope, holding an invoice',
    { accessories: 'glasses, stethoscope, beard', face: 'greedy grin', prop: 'journal' },
  ),
  C(
    'FATOU',
    'commère qui filme tout',
    'femme',
    '40 ans',
    'plump West-African woman, purple-and-yellow sunflower wax dress and matching head-wrap, gold hoop earrings, phone on a selfie stick',
    {
      body: 'plump',
      accessories: 'headwrap, gold hoop earrings',
      face: 'thrilled gossip',
      prop: 'téléphone',
    },
  ),
  C(
    'ADJOUA',
    'go qui réclame du crédit',
    'femme',
    '24 ans',
    'curvy young West-African woman, long straight hair, pink crop top, pink trousers, gold hoop earrings, holding a paper « demande de crédit »',
    { body: 'curvy', hair: 'long straight hair', face: 'pouting puppy eyes', prop: 'journal' },
  ),
  C(
    'KOFFI',
    'faux riche fauché',
    'homme',
    '30 ans',
    'West-African man, sunglasses, black shirt under a patterned blazer, gold chains, black trousers, empty pockets turned out',
    { accessories: 'sunglasses, gold chains', face: 'fake confident smirk' },
  ),
  C(
    'GRAND-PÈRE NDIAYE',
    'dur d’oreille',
    'homme',
    '75 ans',
    'old West-African man, white beard, brown kufi cap, blue patterned boubou, walking cane, hand cupped behind his ear',
    { hair: 'white hair', accessories: 'kufi cap, white beard', face: 'confused squint', prop: 'bâton' },
  ),
  C(
    'MAMIE BINTOU',
    'balance tout',
    'femme',
    '65 ans',
    'plump older West-African woman, red glasses, blue-and-orange floral head-wrap and floral wax dress, gold earrings, whispering behind her hand',
    { body: 'plump', accessories: 'red glasses, headwrap', face: 'mischievous gossip' },
  ),
  C(
    'ALIOU',
    'taximan philosophe',
    'homme',
    '40 ans',
    'West-African taxi driver, blue-and-yellow cap, blue-and-yellow floral shirt, leaning out of a yellow taxi',
    { accessories: 'cap', face: 'wise grin' },
  ),
  C(
    'CHEF TRAORÉ',
    'chef de quartier pompeux',
    'homme',
    '60 ans',
    'plump West-African chief, embroidered kufi cap, sunglasses, burgundy boubou with gold embroidery, coral bead necklace, golden scepter',
    {
      body: 'plump',
      accessories: 'sunglasses, coral necklace, kufi cap',
      face: 'pompous pout',
      prop: 'bâton',
    },
  ),
  C(
    'AMINATA',
    'ado influenceuse',
    'fille',
    '16 ans',
    'teenage West-African girl, very long braids, black crop top, ripped jeans, gold hoop earrings, pink phone, peace sign',
    {
      hair: 'very long braids',
      accessories: 'gold hoop earrings',
      face: 'duck-face selfie pout',
      prop: 'téléphone',
    },
  ),
  C(
    'BOUBACAR',
    'gourmand',
    'homme',
    '40 ans',
    'very plump West-African man, short beard, yellow embroidered boubou, eating a chicken leg',
    { body: 'very plump, big belly', accessories: 'beard', face: 'blissful greedy smile', prop: 'assiette' },
  ),
  // Figures of the green galleries of the account that no catalogue names (rôle proposé, à renommer librement).
  C(
    'LE FRIMEUR',
    'frimeur du quartier (rôle proposé)',
    'homme',
    '25 ans',
    'slim young West-African man, short twisted hair, black-and-gold baroque patterned shirt open over a black t-shirt, gold chain, black ripped jeans, black-and-gold sneakers',
    { body: 'slim', accessories: 'gold chain', face: 'cocky grin' },
  ),
  C(
    'LE PATRIARCHE',
    'doyen du quartier (rôle proposé)',
    'homme',
    '80 ans',
    'very old West-African man, long white beard, white embroidered kufi cap, long cream boubou, wooden walking cane, brown sandals',
    { hair: 'white hair', accessories: 'white kufi, long white beard, cane', face: 'toothy delighted laugh' },
  ),
  C(
    'LA LYCÉENNE',
    'lycéenne qui sait tout (rôle proposé)',
    'fille',
    '15 ans',
    'teenage West-African schoolgirl, long braids in a ponytail, white school shirt, navy pleated skirt, white socks, black shoes, backpack, holding a blue notebook',
    { hair: 'long braids in a ponytail', face: 'bright confident smile' },
  ),
  C(
    'LA GO LÉOPARD',
    'go chic qui cherche un mari riche (rôle proposé)',
    'femme',
    '28 ans',
    'glamorous curvy young West-African woman, long wavy hair, leopard-print dress with a high slit, gold sandals, black handbag',
    { body: 'curvy', hair: 'long wavy hair', face: 'flirty smile' },
  ),
  C(
    'LA FUTURE MAMAN',
    'future maman aux envies impossibles (rôle proposé)',
    'femme',
    '30 ans',
    'pregnant West-African woman, orange-and-gold wax head-wrap, long orange-and-yellow floral wax dress, gold earrings, hands on her round belly',
    { body: 'pregnant, round belly', accessories: 'head-wrap, gold earrings', face: 'sweet smile' },
  ),
  C(
    'LE BANQUIER',
    'banquier qui refuse tous les crédits (rôle proposé)',
    'homme',
    '45 ans',
    'bald West-African man with glasses and a thin moustache, black suit, white shirt, black tie, holding a laptop',
    { hair: 'bald', accessories: 'glasses, moustache', face: 'smug smile' },
  ),
  // New roles of the character bible (not drawn yet: written in the stories and the image prompts).
  C(
    'MADAME KONAN',
    'présidente de la tontine qui retarde le tour de chacun',
    'femme',
    '55 ans',
    'imposing West-African woman in her 50s, half-moon reading glasses, purple embroidered bazin boubou with a matching purple head-wrap tied like a crown, holding a big ledger and a padlocked metal cash box',
    {
      body: 'imposing',
      accessories: 'half-moon glasses, purple headwrap',
      face: 'severe appraising look',
      prop: 'journal',
    },
  ),
  C(
    'PATRON SÉRY',
    'patron du maquis qui fait crédit à tous sauf à Koffi',
    'homme',
    '50 ans',
    'stout West-African bar owner, shaved head, thick moustache, towel over the shoulder, checked shirt open over a white vest, canvas trousers, sandals, holding a small chalk slate',
    { body: 'stout', hair: 'shaved head', accessories: 'thick moustache, towel', face: 'commercial smile' },
  ),
  C(
    'MADEMOISELLE ROSINE',
    'agent de mairie pour qui il manque toujours un papier',
    'femme',
    '32 ans',
    'neat young West-African civil servant, tight bun, thin-rimmed glasses, red nail polish, navy skirt suit, white blouse, town-hall badge, holding a rubber stamp over a pile of forms',
    {
      hair: 'tight bun',
      accessories: 'thin glasses, badge',
      face: 'bored unimpressed look',
      prop: 'journal',
    },
  ),
  C(
    'YAYA L’APPRENTI',
    'apprenti gbaka qui n’a jamais la monnaie',
    'homme',
    '19 ans',
    'wiry young West-African minibus conductor, faded football jersey, shorts, slide sandals, whistle around the neck, crumpled banknotes between his fingers, hanging out of a green minibus door',
    { body: 'wiry', face: 'breathless quick grin' },
  ),
  C(
    'SALIF LE PARISIEN',
    'le cousin revenu de Paris qui frime',
    'homme',
    '34 ans',
    'slim West-African man back from Paris, trimmed beard, sunglasses pushed up on the forehead, light puffer jacket and scarf despite the heat, skinny jeans, spotless white sneakers, rolling suitcase',
    { body: 'slim', accessories: 'sunglasses on forehead, scarf', face: 'superior smile' },
  ),
  C(
    'COACH DIABATÉ',
    'coach de foot du quartier, supporter fanatique',
    'homme',
    '50 ans',
    'stocky West-African football coach, orange-and-green tracksuit, cap, whistle in the mouth, stopwatch around the neck, tactics clipboard',
    { body: 'stocky', accessories: 'cap, whistle', face: 'dramatic passionate face' },
  ),
  C(
    'DJ KÉVIN',
    'DJ des mariages qui vend les dédicaces',
    'homme',
    '27 ans',
    'skinny young West-African DJ, neon sunglasses, small bleached mohawk, sequinned shirt, huge headphones around the neck, wireless microphone, portable DJ deck',
    {
      body: 'skinny',
      hair: 'bleached mohawk',
      accessories: 'neon sunglasses, headphones',
      face: 'showman grin',
      prop: 'téléphone',
    },
  ),
  C(
    'MAMAN BRIGITTE',
    'vendeuse d’attiéké, rivale de Maman Nounou',
    'femme',
    '45 ans',
    'sturdy West-African market woman, green-and-yellow wax wrapper and tightly tied head-wrap, white apron, big basin of attiéké balanced on her head',
    { body: 'sturdy', accessories: 'green headwrap', face: 'fierce commercial smile', prop: 'assiette' },
  ),
  // The duo of the reference clip 041701.
  C(
    'LA VOISINE',
    'la voisine qui crie',
    'femme',
    '35 ans',
    'curvy West-African woman, natural twists with a red headband, fitted sleeveless pink long dress, barefoot in flip-flops',
    {
      body: 'curvy with a round belly',
      hair: 'twists',
      accessories: 'red headband',
      face: 'loud wide mouth',
    },
  ),
  C(
    'LE TONTON',
    'le tonton aux bouteilles',
    'homme',
    '45 ans',
    'lanky West-African man with a round pot belly, receding hairline, long face and chin, blue long-sleeve polo, navy trousers, big shoes, a green bottle in each hand',
    {
      body: 'lanky with a pot belly',
      hair: 'receding hairline',
      face: 'long face, prominent chin, sleepy eyes',
      prop: 'bouteille',
    },
  ),
];

export interface UniverseSet {
  name: string;
  /** Words of a scene location that select this set. */
  match: RegExp;
  visual: string;
}
/** The empty sets of the account (verbatim, in the image prompts of a matching location). */
export const UNIVERSE_SETS: UniverseSet[] = [
  // Specific places first (« salon de coiffure » is not the living room).
  {
    name: 'Salon de coiffure',
    match: /\b(coiffure|coiffeuse|salon de beaute)\b/,
    visual: 'pink West-African hair salon, mirrors with bulbs, wig heads on shelves, hair dryers',
  },
  {
    name: 'Maquis',
    match: /\b(maquis|bar|buvette|allocodrome)\b/,
    visual:
      'lively Ivorian maquis at night, string lights, blue plastic tables and chairs, chalkboard menu, football on a big TV, grilled fish and brochettes',
  },
  {
    name: 'Marché',
    match: /\b(marche|market|etal)\b/,
    visual:
      'busy colourful West-African street market, wax fabric stalls, baskets of tomatoes and onions, multicoloured umbrellas, warm sunlight',
  },
  {
    name: 'Cérémonie',
    match: /\b(mariage|ceremonie|bapteme|fete|dot)\b/,
    visual:
      'festive West-African wedding courtyard, white-and-gold draped tents, flower arches, white chairs with gold bows, red carpet',
  },
  {
    name: 'Hôpital',
    match: /\b(hopital|clinique|infirmerie|maternite|centre de sante)\b/,
    visual:
      'small West-African hospital room, mint-green walls, hospital bed with blue sheets, IV stand, monitor, health posters',
  },
  {
    name: 'École',
    match: /\b(ecole|classe|lycee)\b/,
    visual: 'West-African classroom, chalkboard, wooden desks, world map and posters, sunny windows',
  },
  {
    name: 'Tribunal',
    match: /\b(tribunal|proces|juge)\b/,
    visual: 'West-African courtroom, wooden judge bench with scales of justice, wooden benches, flag',
  },
  {
    name: 'Douane',
    match: /\b(douane|frontiere|aeroport)\b/,
    visual: 'West-African customs checkpoint, barrier pole, inspection table with suitcases, containers',
  },
  {
    name: 'Bureau',
    match: /\b(bureau|banque|office|administration)\b/,
    visual:
      'cluttered West-African office, piles of files and folders, old computer, calculator, shelves of binders',
  },
  {
    name: 'Plage',
    match: /\b(plage|beach|mer|lagune)\b/,
    visual:
      'tropical West-African beach, colourful painted wooden pirogues, palm trees, fishermen with nets, turquoise sea',
  },
  {
    name: 'Village',
    match: /\b(village|brousse|case|campagne)\b/,
    visual:
      'West-African village, thatched mud huts, giant baobab tree, red laterite ground, chickens, blue sky',
  },
  {
    name: 'Salon',
    match: /\b(salon|maison|living|sejour)\b/,
    visual:
      'modest West-African living room, teal walls with framed family photos and a wall clock, patterned brown-and-gold sofa, lace tablecloth on a wooden coffee table with a teapot and tea glasses, old CRT television, standing fan, lace curtains, warm evening light',
  },
  {
    name: 'Cour',
    match: /\b(cour|concession|devant)\b/,
    visual:
      'Abidjan courtyard, grey cement-block house with a corrugated roof, yellow curtain in the doorway, wooden shutters, laundry line, plastic chairs, sandy ground',
  },
  {
    name: 'Taxi',
    match: /\b(taxi|gbaka|gare|rue|route|carrefour)\b/,
    visual: 'busy Abidjan street with a yellow taxi, motorbikes, shop signs, palm trees',
  },
];
/** The set of a scene location, if the universe has one. */
export function universeSetOf(location: string): UniverseSet | null {
  const t = location.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return UNIVERSE_SETS.find((s) => s.match.test(t)) ?? null;
}
/** The universe character of a name (any spelling), if any. */
export function universeCharacter(name: string): UniverseCharacter | null {
  const k = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
  return UNIVERSE.find((c) => k(c.name) === k(name)) ?? null;
}
/** The cast block given to the writer: the recurring characters with their comic role. */
export function castBrief(names: string[] = UNIVERSE.map((c) => c.name)): string {
  return names
    .map((n) => universeCharacter(n))
    .filter((c): c is UniverseCharacter => !!c)
    .map((c) => `- ${c.name} : ${c.role}`)
    .join('\n');
}

/**
 * DÉCOR ADAPTÉ — the prompt of an EMPTY set made for the drawn actors: vertical 9:16 (the frame of the film, no
 * stretching), nobody in it, eye-level camera, the floor in the lower part (the actors stand on it), open space in
 * the middle, the whole height of the place; the owner's set picture (when there is one) as the reference of the
 * place and its style. The engine makes it once per set and keeps it in the library.
 */
export function decorPrompt(location: string, withReference: boolean): { name: string; text: string } {
  const u = universeSetOf(location);
  const name = u?.name ?? (location.trim().slice(0, 40) || 'Décor');
  const text = [
    `EMPTY SET for a vertical 9:16 comedy sketch: ${u?.visual ?? location.trim()}.`,
    'Nobody in it: no people, no animals.',
    'Eye-level camera at 1.5 m, straight on; the floor visible in the lower fifth of the picture; the back of the place about 3 m away; open space in the middle where two actors will stand; the whole height of the place visible.',
    `Pixar-like 3D animation render, warm West-African light, soft depth${withReference ? '; the same place, objects, colours and style as the reference picture' : ''}.`,
    'Avoid: people, characters, faces, hands, crowd, text, watermark, borders.',
  ].join(' ');
  return { name, text };
}
