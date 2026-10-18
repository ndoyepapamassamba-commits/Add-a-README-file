# UNIVERS « AFRICA TOON TROLL » (18/10/2026) — carte blanche de l'utilisateur : « refaire toute la troupe, vues 360°,
# debout, assis, une vue pour chaque personnage dans tous les coins et recoins », « des personnages clairs, identifiables,
# que tu peux faire parler et bouger », « assez de personnages, de scènes et de paramètres pour aller vers 10 000 vidéos »,
# « raconter toute une vie ». Les planches tirées des photos sont laissées de côté : chaque planche est GÉNÉRÉE ici, et
# conçue pour notre moteur d'animation (rig 2D + visages LivePortrait + regard + paupières + bouche).
#
# RÈGLES D'ANIMABILITÉ (tirées des défauts vus par l'utilisateur sur les films v23 à v35) :
#  · bouche toujours visible : pas de barbe ni de moustache sur les lèvres (« le vieux assis ne parle pas » : barbe de Baye) ;
#  · yeux dégagés, blanc de l'œil visible : pas de lunettes noires sur les yeux (Koffi : ni regard ni clignement lisibles) ;
#  · bras décollés du corps, mains ouvertes, pieds visibles : le squelette 2D plie bras et jambes sans arracher la tenue ;
#  · tenue symétrique, sans texte ni logo : une vue « trois quarts gauche » retournée donne la « trois quarts droite » ;
#  · silhouette et couleur signature propres à chacun : on reconnaît le personnage en ombre chinoise (Pixar, Ladjagaï) ;
#  · personnage SEUL sur fond gris uni : découpe exacte, aucun reste de décor, aucun meuble collé au corps (la chaise de
#    Baye qui bougeait avec lui, le plat de Koffi qui suivait sa main) — meubles et objets sont des planches à part ;
#  · décors VIDES (ni personne ni animal) : plaque propre, parallaxe sans fantôme, place pour jouer et se déplacer.
import hashlib

STYLE = ('3D animated feature film character design in the style of Pixar and Disney, stylized proportions, big expressive eyes '
         'with clearly visible white sclera, soft subsurface skin shading, detailed fabric textures, warm and joyful. ')
PEAU = 'Black West African (Ivorian) {genre} with dark brown skin. '
CONTRAINTES = ('Mouth closed and fully visible, eyes open and unobstructed, arms slightly away from the body with open relaxed hands, '
               'plain flat {fond} studio background, soft even front lighting, no props, no furniture except when asked, no text, no labels, no logo.')
# FOND CONTRASTÉ PAR PERSONNAGE (18/10/2026) : sur fond gris clair, le bonnet blanc de Baye (gris ombré 212 contre un fond à
# 212) était indécoupable — comme un fond vert de studio, le fond prend une couleur que la tenue n'a pas.
def fond(adn):
    t = adn.lower(); blanc = any(w in t for w in ('white', 'grey', 'gray', 'silver')); vert = 'green' in t
    rose = any(w in t for w in ('pink', 'purple', 'magenta', 'violet')); bleu = 'blue' in t
    if not blanc: return 'light grey'
    if not vert: return 'solid saturated chroma green'
    if not rose: return 'solid saturated magenta'
    return 'solid saturated blue' if not bleu else 'solid saturated orange'

# VUES (une planche = une rangée de vues du MÊME personnage : l'identité tient d'une vue à l'autre ; la droite = la gauche retournée)
VUES = {
    'tour':  ('Professional character turnaround model sheet for animation: the SAME character shown four times side by side in one row, '
              'evenly spaced, same height and scale, identical outfit and colors in every view: 1) front view, 2) three-quarter view turned to the left, '
              '3) side profile facing left, 4) back view. Full body from head to feet in every view, relaxed neutral standing pose.', 1408, 704),
    'assis': ('Professional character model sheet for animation: the SAME character shown three times side by side, evenly spaced, identical outfit: '
              '1) sitting on a simple wooden stool, front view, 2) sitting on the stool, three-quarter view turned to the left, '
              '3) sitting on the stool, side profile facing left. Full body visible, hands resting on the knees, feet flat on the floor.', 1408, 704),
    'marche': ('Professional walk cycle sprite sheet for animation: the SAME character shown four times side by side in one row, side profile facing left, '
               'walking: 1) contact pose with the front heel touching the ground, 2) down pose, 3) passing pose with one leg straight under the body, '
               '4) up pose. Full body from head to feet, same scale in every pose.', 1408, 704),
    'face':  ('Full body portrait from head to feet, front view facing the camera, relaxed neutral standing pose.', 832, 1216),
}

# DISTRIBUTION : clé → nom, genre, âge, description fixe (ADN visuel, répétée mot pour mot), taille (cm), signature, ressort comique,
# voix (F0 Hz visée), âges de la vie (variantes du même personnage)
P = {}
def perso(cle, nom, genre, age, adn, taille, couleur, ressort, f0, foyer, ages=()):
    P[cle] = dict(cle=cle, nom=nom, genre=genre, age=age, adn=adn, taille=taille, couleur=couleur, ressort=ressort, f0=f0, foyer=foyer, ages=dict(ages))

# ── FAMILLE DIABATÉ (la cour) : la vie de Petit Mamadou, de la naissance à la vieillesse, est la colonne vertébrale
perso('mamadou', 'PETIT MAMADOU', 'boy', 8, 'an 8-year-old boy, short curly black hair, big curious eyes, big ears, cheeky grin with closed lips, '
      'plain bright yellow football jersey with a green collar and no number, blue shorts, black slides', 128, 'jaune', 'excuses impossibles, logique d’enfant imparable', 280, 'diabate',
      ages={'bebe': 'a 1-year-old baby boy, chubby cheeks, tiny curly hair, big round eyes, yellow onesie with green trim, barefoot',
            'ado': 'a 15-year-old lanky teenage boy, short curly hair with a small side part, big eyes, big ears, yellow jersey with green collar, blue jeans, white sneakers',
            'etudiant': 'a 21-year-old slim young man, short curly hair, big expressive eyes, big ears, yellow polo shirt with green collar, beige chinos, white sneakers, backpack straps',
            'marie': 'a 29-year-old young man, short neat curly hair, big ears, warm smile with closed lips, yellow and green wax print shirt, beige trousers, brown loafers',
            'papa': 'a 40-year-old man with a small round belly, short hair with a receding hairline, big ears, yellow short-sleeved shirt, dark trousers, brown sandals',
            'vieux': 'a 70-year-old man, short white hair, big ears, kind wrinkled face, yellow and green grand boubou, white kufi cap, wooden cane'})
perso('nounou', 'MAMIE NOUNOU', 'woman', 55, 'a plump cheerful woman in her fifties, round face, big warm eyes, golden hoop earrings, red and yellow wax print dress '
      'with big sunflower motifs, tall red headwrap, green gingham apron, black flip-flops', 160, 'rouge', 'accuse tout le monde, gère l’argent de la maison', 200, 'diabate',
      ages={'jeune': 'a 30-year-old plump young mother, round face, big warm eyes, golden hoop earrings, red and yellow wax dress, small red headwrap, black flip-flops',
            'vieille': 'an 80-year-old plump grandmother, round wrinkled face, big warm eyes, white hair under a red headwrap, red and yellow wax dress, walking stick'})
perso('baye', 'BAYE NDIAYE', 'man', 62, 'a round jolly man in his early sixties, clean-shaven round face with full cheeks, short white hair, small white kufi cap, '
      'shiny royal blue grand boubou with gold embroidery on the chest, matching trousers, brown leather sandals', 172, 'bleu roi', 'mauvaise foi innocente', 115, 'diabate',
      ages={'jeune': 'a 35-year-old round man, clean-shaven, short black hair, royal blue shirt with gold embroidery, blue trousers, brown sandals'})
perso('meme', 'MÉMÉ AMA', 'woman', 85, 'a tiny 85-year-old great-grandmother, wrinkled face, big eyes, toothless smile, white and indigo wax wrapper and blouse, '
      'indigo headwrap, wooden walking stick, barefoot', 145, 'indigo', 'sourde quand ça l’arrange, sagesse absurde', 220, 'diabate')
perso('aya', 'BÉBÉ AYA', 'girl', 3, 'a 3-year-old girl, two puffy hair buns, huge round eyes, pink dress with white polka dots, pink sandals', 95, 'rose', 'répète tout au pire moment', 330, 'diabate')

# ── VOISINS DE LA COUR
perso('awa', 'TANTIE AWA', 'woman', 52, 'a strong woman in her early fifties, round face, piercing judging eyes, small pursed mouth, golden hoop earrings, '
      'orange and yellow wax dress with big flowers, matching orange headwrap, black flip-flops', 165, 'orange', 'commère du quartier, sait tout avant tout le monde', 200, 'voisins')
perso('modou', 'MODOU', 'man', 35, 'a skinny lanky man about 35, very short hair, long neck, clean-shaven, expressive tired eyes, faded green T-shirt, '
      'brown cargo trousers rolled at the ankles, black sandals', 185, 'vert', 'chômeur débrouillard, combines ratées', 125, 'voisins')
perso('coumba', 'COUMBA', 'woman', 26, 'a curvy young woman about 26, long thin braids tied in a high ponytail, big almond eyes, golden hoop earrings, '
      'pink and purple wax dress with short puffed sleeves, pink sandals', 168, 'rose et violet', 'influenceuse, tout pour le like', 215, 'voisins')
perso('koffi', 'KOFFI', 'man', 30, 'a slim flashy man about 30, neat short hair with a fade, black sunglasses pushed up on top of his head, clean-shaven, '
      'black shirt under a black and gold baroque pattern jacket, one thin gold chain, slim black trousers, shiny black loafers', 178, 'noir et or', 'faux riche, vrai fauché', 120, 'voisins')
perso('junior', 'JUNIOR', 'boy', 16, 'a 16-year-old show-off teenage boy, high-top fade haircut, big eyes, oversized red hoodie with no print, black joggers, '
      'big white sneakers', 170, 'rouge vif', 'frimeur, vocabulaire de rue', 160, 'voisins')
perso('jumeaux', 'LES JUMEAUX', 'children', 7, 'twin 7-year-old boy and girl standing side by side, identical round faces and big eyes, matching sky blue and white '
      'striped outfits (shirt and shorts for the boy, dress for the girl)', 120, 'bleu ciel', 'finissent les phrases l’un de l’autre', 320, 'voisins')
perso('sekou', 'VIEUX PÈRE SÉKOU', 'man', 72, 'a thin 72-year-old man, white short hair, white bushy eyebrows, clean-shaven, brown wax print shirt, '
      'beige trousers, brown sandals, small transistor radio in one hand', 168, 'brun', 'sage du banc, proverbes à côté de la plaque', 120, 'voisins')

# ── LE QUARTIER (métiers)
perso('mariam', 'TANTIE MARIAM', 'woman', 45, 'a plump woman about 45, wide smile with closed lips, green and yellow wax wrapper and blouse, green headwrap, '
      'cloth roll on top of her head for carrying a tray, black flip-flops', 162, 'vert et jaune', 'vendeuse d’attiéké, crédit interdit', 195, 'quartier')
perso('bakary', 'BAKARY', 'man', 38, 'a stocky muscular man about 38, shaved head, clean-shaven, white sleeveless undershirt, small towel over one shoulder, '
      'dark blue work trousers, plastic sandals', 176, 'blanc et bleu', 'chauffeur de gbaka pressé', 110, 'quartier')
perso('issouf', 'ISSOUF', 'boy', 17, 'a skinny 17-year-old boy, short hair, big loud eyes, open orange shirt over a white T-shirt, faded jeans, plastic sandals', 172, 'orange', 'apprenti gbaka, crie les destinations', 170, 'quartier')
perso('laure', 'TANTINE LAURE', 'woman', 38, 'a stylish woman about 38, voluminous curly wig, big eyelashes, big eyes, purple tunic with a small black apron, '
      'comb tucked in the apron pocket, black slippers', 166, 'violet', 'coiffeuse, radio du quartier', 210, 'quartier')
perso('ibrahim', 'IBRAHIM', 'man', 55, 'a calm man about 55, short grey hair, clean-shaven, light green kaftan, white skullcap, brown sandals', 174, 'vert clair', 'boutiquier, carnet de crédit', 120, 'quartier')
perso('yao', 'SERGENT YAO', 'man', 42, 'a big-bellied police sergeant about 42, clean-shaven round face, khaki police uniform with short sleeves, dark beret, '
      'black boots, whistle on a cord', 180, 'kaki', 'contrôle tout, sauf lui-même', 105, 'quartier')
perso('kante', 'PROFESSEUR KANTÉ', 'man', 50, 'a mysterious man about 50, clean-shaven, white cowrie shell necklace, long white robe with red trim, red cap', 170, 'blanc et rouge', 'marabout charlatan', 110, 'quartier')

# ── L'ÉCOLE, L'HÔPITAL, LE BUREAU, LE VILLAGE
perso('adjoua', 'MAÎTRESSE ADJOUA', 'woman', 40, 'a strict but kind teacher about 40, short natural hair, big round glasses with clear lenses, '
      'navy blue wax print dress, white chalk dust on her hands, flat shoes', 165, 'bleu marine', 'rien ne lui échappe', 205, 'ecole')
perso('kouame', 'M. LE DIRECTEUR', 'man', 55, 'a pompous school principal about 55, clean-shaven, receding hairline, brown suit too tight on the belly, '
      'yellow tie, brown shoes', 170, 'marron', 'discours interminables', 110, 'ecole')
perso('konan', 'DOCTEUR KONAN', 'man', 45, 'a doctor about 45, clean-shaven, short hair, white lab coat over a light blue shirt, stethoscope around the neck, '
      'dark trousers, black shoes', 177, 'blanc', 'diagnostics inquiétants dits calmement', 120, 'hopital')
perso('rose', 'SAGE-FEMME TATA ROSE', 'woman', 50, 'a big-hearted midwife about 50, short hair under a white cap, pink hospital scrubs, white clogs', 163, 'rose clair', 'en a vu d’autres', 195, 'hopital')
perso('kouassi', 'M. KOUASSI', 'man', 56, 'a demanding boss about 56, clean-shaven, grey temples, dark grey three-piece suit, red tie, gold watch, black shoes', 175, 'gris', 'patron radin', 110, 'bureau')
perso('bintou', 'BINTOU', 'woman', 34, 'an office worker about 34, sleek bob haircut, big eyes, turquoise blouse, black pencil skirt, black flats, badge on a lanyard', 167, 'turquoise', 'collègue qui fait semblant de travailler', 210, 'bureau')
perso('fatou', 'FATOU', 'woman', 21, 'a bright young woman about 21, short natural afro, big expressive eyes, light blue wax print blouse, white jeans, white sneakers', 165, 'bleu clair',
      'étudiante brillante, future épouse de Mamadou', 215, 'amour',
      ages={'mariee': 'a 29-year-old bride, short natural afro with a white flower, big eyes, white and gold wax print wedding gown, gold sandals',
            'maman': 'a 40-year-old mother, short natural hair, big eyes, light blue wax print dress, light blue headwrap, sandals',
            'vieille': 'a 70-year-old grandmother, short white afro, big kind eyes, light blue wax print dress, walking stick'})
perso('clementine', 'MAMAN CLÉMENTINE', 'woman', 56, 'a stern mother-in-law about 56, tall purple headwrap, arched eyebrows, purple and gold wax print dress, '
      'gold earrings, handbag on her forearm, gold sandals', 170, 'violet et or', 'belle-mère exigeante, liste de dot sans fin', 190, 'amour')
perso('nanan', 'NANAN', 'man', 82, 'an 82-year-old village chief, clean-shaven, wise wrinkled face, colorful kente cloth draped over one shoulder, '
      'gold crown-like cap, golden staff, sandals', 170, 'kente', 'chef du village, jugements à la Salomon ratés', 110, 'village')

# ── LIEUX (décors VIDES, 9:16, caméra à hauteur d'homme, sol dégagé devant pour jouer et se déplacer)
DECOR = ('3D animated feature film background in the style of Pixar, EMPTY scene with no people and no animals, vertical composition, camera at standing '
         'eye level, flat walkable ground in the foreground with plenty of empty space, no text. ')
L = {
    'cour':      'the sandy shared courtyard of a modest family house in Abidjan: grey cement-block walls, corrugated metal roof, a yellow curtain in an open doorway, laundry line with colorful clothes, a mango tree',
    'salon':     'the living room of a modest Abidjan family: beige walls, an old sofa with crocheted covers, a small TV on a cabinet, family photos, a ceiling fan, tiled floor',
    'chambre':   'a simple bedroom in Abidjan: blue painted walls, a bed with a wax print bedspread, a wardrobe, a window with curtains, tiled floor',
    'cuisine':   'an outdoor kitchen corner of an Abidjan house: charcoal stove, big pots, plastic basins, a water jar, cement floor',
    'maquis':    'an open-air maquis restaurant in Abidjan at dusk: string lights, plastic tables and chairs pushed to the sides, a grill with smoke, a bar counter, cement floor',
    'rue':       'a lively street of the Abobo neighborhood in Abidjan: small colorful shops, hand-painted signs without readable text, electric poles, red earth road',
    'boutique':  'a small neighborhood grocery shop in Abidjan seen from the customer side: counter, shelves of rice bags, oil bottles, canned food, soda crates',
    'salon_coiffure': 'a small hair salon in Abidjan: big mirrors, salon chairs, wigs on stands, posters without readable text, a hood dryer, tiled floor',
    'classe':    'a primary school classroom in Côte d’Ivoire: blackboard, wooden double desks in rows, a teacher desk, map on the wall, open windows',
    'cour_ecole': 'a primary school yard in Côte d’Ivoire: yellow school building with blue doors, a big tree, sandy ground, a flag pole without flag',
    'amphi':     'a university lecture hall in Abidjan: tiered wooden benches, a long desk, a big green board',
    'gbaka':     'the inside of a green and yellow gbaka minibus in Abidjan: rows of worn seats, sliding door open, windows with the city outside',
    'gare':      'a busy bus station in Abidjan without people: parked green minibuses, ticket booths, red earth ground, sun umbrellas',
    'marche':    'an Abidjan market alley: stalls with tomatoes, onions, fish, colorful fabrics, umbrellas, sandy ground',
    'hopital':   'a hospital waiting room in Abidjan: rows of blue plastic chairs, a reception desk, health posters without readable text, white tiled floor',
    'maternite': 'a maternity room in an Abidjan clinic: a hospital bed, a baby crib, a window with sunlight, pale green walls',
    'commissariat': 'a small police station office in Abidjan: a wooden desk with an old computer, filing cabinets, a bench, a ceiling fan',
    'bureau':    'an open-space office in Abidjan Plateau: desks with computers, office chairs, big windows with city towers',
    'bureau_patron': 'a boss office in Abidjan: big wooden desk, leather chair, two visitor chairs, a bookshelf, big window with city view',
    'mairie':    'a town hall wedding room in Abidjan: rows of chairs with white covers, a long table with a green tablecloth, flowers, a sash on a stand',
    'village':   'the central square of a village in Côte d’Ivoire: round mud huts with thatched roofs, a big baobab tree, wooden benches, red earth ground',
    'plage':     'Grand-Bassam beach in Côte d’Ivoire: golden sand, coconut palms, colorful fishing boats, waves, blue sky',
    'terrain':   'a sandy neighborhood football pitch in Abidjan: goals made of wood, painted walls around, red earth',
    'kiosque':   'a mobile money kiosk on an Abidjan street: small booth painted orange and yellow without readable text, a parasol, a plastic stool',
}
MOMENTS = {'jour': 'bright morning sunlight', 'apres_midi': 'late afternoon golden sunlight from the left', 'soir': 'warm dusk light with the first lamps on',
           'nuit': 'night scene lit by warm lamps and moonlight'}

# ── OBJETS (planches à part : ils ne bougent jamais avec un personnage, sauf saisie explicite)
OBJ = ('3D animated feature film prop in the style of Pixar, a single object, three-quarter view, full object visible, '
       'plain flat light grey studio background, soft even lighting, no people, no text. ')
O = {'chaise': 'an empty white plastic garden chair with armrests', 'tabouret': 'an empty low wooden stool', 'banc': 'an empty long wooden bench',
     'table': 'an empty white plastic table', 'fourneau': 'a small round charcoal stove with glowing embers', 'marmite': 'a big black cooking pot with a lid',
     'plat_attieke': 'a plate of attiéké with grilled fish and sliced onions and tomatoes', 'bassine': 'a big colorful plastic basin',
     'telephone': 'a smartphone with a cracked screen', 'radio': 'a small old transistor radio', 'tele': 'a small old television on a wooden cabinet',
     'ventilateur': 'a standing electric fan', 'ballon': 'a worn leather football', 'cartable': 'a red school backpack', 'pupitre': 'a wooden double school desk',
     'valise': 'a big checked travel bag', 'moto': 'a small red motorbike', 'sac_riz': 'a big sack of rice', 'billets': 'a small stack of CFA franc banknotes',
     'poulet': 'a live brown hen standing', 'chien': 'a friendly skinny brown street dog standing'}


def graine(*k):
    return int(hashlib.sha1('|'.join(map(str, k)).encode()).hexdigest()[:8], 16) % 2_000_000_000


def invite_perso(cle, vue='tour', age=None):
    p = P[cle]; adn = p['ages'][age] if age else p['adn']
    g = p['genre'] if not age else ('baby' if age == 'bebe' else p['genre'])
    txt, w, h = VUES[vue]
    return STYLE + PEAU.format(genre=g) + f"{p['nom']}, " + adn + '. ' + txt + ' ' + CONTRAINTES.format(fond=fond(adn)), w, h


def invite_decor(lieu, moment='apres_midi'):
    return DECOR + L[lieu] + ', ' + MOMENTS[moment] + '.', 768, 1344


def invite_objet(o):
    return OBJ + O[o] + '.', 1024, 1024


def catalogue():
    """toutes les planches à produire : (id, invite, largeur, hauteur, graine)."""
    J = []
    for c, p in P.items():
        for age in [None] + list(p['ages']):
            for vue in ('tour', 'assis', 'marche'):
                i = f"perso/{c}{'-' + age if age else ''}-{vue}"; t, w, h = invite_perso(c, vue, age); J.append((i, t, w, h, graine(c, age)))
    for l in L:
        for m in ('apres_midi', 'nuit'):
            i = f'decor/{l}-{m}'; t, w, h = invite_decor(l, m); J.append((i, t, w, h, graine(l)))
    for o in O:
        t, w, h = invite_objet(o); J.append((f'objet/{o}', t, w, h, graine(o)))
    return J


if __name__ == '__main__':
    J = catalogue(); import collections
    print(len(P), 'personnages,', sum(len(p['ages']) for p in P.values()), 'âges en plus,', len(L), 'lieux,', len(O), 'objets →', len(J), 'planches')
    print(collections.Counter(j[0].split('/')[0] for j in J))
