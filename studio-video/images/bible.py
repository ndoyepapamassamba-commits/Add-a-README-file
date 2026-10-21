# BIBLE DE PRODUCTION DE LA TROUPE (20/10/2026) — « Il faudra créer des dizaines de personnages, des centaines de scènes pour
# que l'ensemble de la production des 10 000 vidéos soit cohérent. »
# Méthode des studios d'animation : une « model sheet » (planche de personnage) et un fond de référence par lieu, dessinés UNE
# fois, validés, puis repris tels quels par chaque plan ; jamais un personnage ou un lieu réinventé à chaque vidéo.
#   personnages : les 54 de la bible comique (moteur-troupe/bible_comique.json : apparence, tenue, posture). Les 7 de la V1
#                 gardent leurs planches (images/troupe/, chiffrées). Les 47 autres — dont l'ancien dessin (caricature) ne
#                 ressemble pas à la V1 (remarque de l'utilisateur, 20/10/2026) — sont REDESSINÉS au style V1 : planche au même
#                 format (5 poses, fond vert), avec comme références la planche V1 la plus proche (âge, genre) ;
#   décors      : 30 lieux du quartier (les 14 de la bible + 16 du quotidien ivoirien) × 4 vues × 2 moments, les ambiances
#                 des lieux joués, et la MAISON de chaque foyer (monde.py) : cour, salon, chambre, cuisine, de jour et de nuit ;
#                 avec l'image de la V1 comme référence de style ; contrôle « style V1 » (style_v1.py) avant d'entrer.
# Chaque tâche reçoit un identifiant stable : la bible se complète sans jamais refaire ce qui est validé.
# Tournage (20/10/2026) : FLUX.2 klein 4B sur les machines GitHub, par parts (bible_tourne.py, bible-v1.yml) ; planches des
# nouveaux personnages en 1280×720 (5 poses de 720 px de haut, assez pour la banque de mouvements en 384×640).
#   python3 bible.py taches [SORTIE.json]   → liste des tâches (personnages, décors) et leurs nombres
import json, os, re, sys, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__))
PERSONNAGES = os.path.join(ICI, '..', 'moteur-troupe', 'bible_comique.json')
sys.path.insert(0, ICI)
import monde
V1 = {'KOFFI', 'COUMBA', 'BAYE NDIAYE', 'MAMAN NOUNOU', 'PETIT MAMADOU', 'TANTIE AWA', 'MODOU'}
LIEUX = {   # lieu → décor décrit pour le générateur (vide de personnages : les acteurs sont posés ensuite)
    'Cour': 'the sunny courtyard of a West African family house, laundry drying on a line, a mango tree, plastic chairs',
    'Marché': 'a busy outdoor market street in Abidjan, stalls of tomatoes, onions, yams and colorful wax fabrics, parasols',
    'Cérémonie': 'a festive neighborhood ceremony under a big tent, decorated chairs, a sound system, colorful fabrics',
    'Maquis': 'an Ivorian street restaurant (maquis) with string lights, a smoking barbecue grill, tables with wax tablecloths',
    'Taxi': 'the inside of an orange Abidjan shared taxi (woro-woro), dashboard, seats, the street seen through the windows',
    'Bureau': 'a small administrative office in Abidjan, a wooden desk piled with files, a ceiling fan, a calendar on the wall',
    'Village': 'a village square in Ivory Coast, mud-brick houses with tin roofs, a big baobab, chickens, dusty red ground',
    'École': 'a primary school classroom in Ivory Coast, wooden benches, a blackboard with chalk writing, open windows',
    'Salon': 'the living room of an Abidjan family house, sofas with lace covers, a big television, family photos on the wall',
    'Plage': 'a beach near Abidjan with palm trees, wooden fishing pirogues, waves, a small beach bar',
    'Hôpital': 'a small neighborhood clinic in Abidjan, an empty waiting room with benches, an unattended reception desk, health posters',
    'Salon de coiffure': 'an Abidjan hair salon, mirrors, hair dryers, posters of hairstyles, shelves of hair products',
    'Douane': 'a border customs post in Ivory Coast, a barrier, a small office booth, parked trucks, the Ivorian flag (vertical orange, white and green stripes)',
    'Tribunal': 'a small courtroom in Ivory Coast, an empty judge desk, wooden benches, a ceiling fan, the Ivorian flag (vertical orange, white and green stripes)',
    'Gare routière': 'a busy bus station in Abidjan, colorful minibuses (gbaka), ticket booths, luggage on the roofs',
    'Pharmacie': 'a neighborhood pharmacy in Abidjan, a green cross sign, glass counter, shelves of medicine boxes',
    'Église': 'the inside of a neighborhood church in Ivory Coast, wooden pews, an altar, colorful windows',
    'Mosquée': 'the courtyard of a neighborhood mosque in West Africa, prayer mats, a minaret, sandals at the entrance',
    'Terrain de foot': 'a dusty neighborhood football pitch in Abidjan, improvised goals, a wall with graffiti, empty wooden benches',
    'Banque': 'a small bank agency in Abidjan, a counter with glass windows, a queue barrier, an air conditioner',
    'Commissariat': 'a neighborhood police station in Abidjan, a front desk, an old typewriter, a bench, wanted posters',
    'Boutique': 'a small neighborhood shop (tablier) in Abidjan, shelves of sugar, rice, soap and phone credit cards',
    'Atelier de couture': 'a tailor workshop in Abidjan, sewing machines, rolls of wax fabric, mannequins, measuring tapes',
    'Garage': 'a roadside car repair garage in Abidjan, old cars, tires, tools, oil stains, a corrugated iron roof',
    'Cuisine': 'a West African outdoor kitchen, big pots on a wood fire, a mortar and pestle, buckets, a small stool',
    'Chambre': 'a modest bedroom in Abidjan, a bed with a colorful wax cover, a wardrobe, a mosquito net, a small fan',
    'Cyber-café': 'an Abidjan cyber cafe and phone shop, old computers, phone accessories, a printer, posters',
    'Chantier': 'a building site in Abidjan, cinder blocks, scaffolding, sand piles, a cement mixer',
    'Rue': 'a lively residential street in Yopougon, Abidjan, street vendors, motorbikes, small shops, power lines',
    'Lagune': 'the Ébrié lagoon in Abidjan at the waterfront, pirogues, the city skyline in the distance',
}
VUES = {'large': 'wide establishing shot', 'champ': 'medium shot facing the main wall',
        'contrechamp': 'reverse angle, opposite side of the place', 'coin': 'medium shot of a corner with props'}
MOMENTS = {'jour': 'daytime, warm sunlight', 'nuit': 'night, warm artificial light'}
AMBIANCES = {'pluie': 'during a tropical rain, wet ground, reflections', 'fete': 'decorated for a celebration, garlands, balloons'}
STYLE = "Pixar-style 3D animated film background in exactly the same rendering style as image 1"
# 20/10/2026 23:20 — premier montage depuis la banque : sur le maquis vide, aucun sol libre (tables et chaises au premier plan), les
# acteurs debout semblaient posés sur les chaises. Chaque décor garde désormais un sol dégagé au premier plan, caméra à hauteur d'homme.
SOL_LIBRE = 'eye-level camera, wide open empty ground in the middle foreground'   # sans nommer de personnage (sinon le modèle en dessine)
POSES = ('five poses side by side of this ONE character only (no other person), on a plain flat bright {fond} background (nothing '
         'else behind them: no wall, no door, no curtain, no furniture, no object on the ground, no text, no speech bubble): neutral '
         'standing, pointing, shocked with hands on cheeks, shrugging with open hands, laughing')
# 21/10 00:55 — Agent Bakary dessiné en uniforme vert sur fond vert : indétourable. Les personnages habillés surtout de vert sont
# dessinés (et animés, banque.py) sur fond BLEU ; tous les autres restent sur le vert validé.
FOND_BLEU = {'AGENT BAKARY', 'MAMAN BRIGITTE', 'COACH DIABATÉ'}
# 21/10 01:30, lot 4 lu à côté des planches V1 : la pose « rire » de la planche de RÉFÉRENCE déteint sur le nouveau personnage
# (Banquier, Yaya, Tonton rient avec la coupe, les lunettes ou la chemise de Koffi ; Mamie Bintou porte la robe et le tablier de
# Maman Nounou). Remède en DEUX ÉTAPES (planche de personnage des studios : un dessin de face validé, puis les poses d'après lui) :
#   1. FICHE : le personnage seul, debout, de face, 448×768, avec pour référence de style la seule pose NEUTRE de la planche V1
#      (images/troupe/<planche>-neutre.msb : plus de pose de rire à recopier) ;
#   2. PLANCHE : les 5 poses avec sa propre fiche comme SEULE référence (aucune autre identité dans l'image 1).
# Fiches texte nettoyées : les répliques entre guillemets (« Refusé ! ») devenaient des bulles de texte, « noué en couronne »
# une vraie couronne, la posture (« assise derrière la caisse ») du mobilier : seules l'apparence et la tenue sont dessinées.
FICHE = ('Full-body character design in exactly the same 3D animated style, realistic proportions, face design and rendering as '
         'image 1 (same Ivorian comedy series), but a NEW character who is not the person of image 1 — {nom}: {apparence} Outfit: '
         '{tenue} Standing in a relaxed neutral pose, front view, the whole body visible from head to shoes, alone on a plain flat '
         'bright {fond} background with nothing else (no wall, no floor line, no object, no text).')
PLANCHE = ('Character model sheet of the character shown in image 1, keeping exactly the same person: same face, same skin tone, same '
           'body shape, same hairstyle, same outfit, same shoes and same accessories, in the same 3D animated style and rendering. '
           'Drawn {poses}. Same face, same hairstyle and same outfit in every pose, no text.')


def texte_dessinable(t):
    """Une fiche texte sans ce que le générateur dessinerait à tort : répliques citées, « en couronne » pris au mot."""
    t = re.sub(r'«[^»]*»|"[^"]*"', '', t or '')
    # 21/10 03:30 : « maillot numéro 23 » → « JECKY 23 » écrit sur la fiche de face mais pas sur les poses (« no text ») :
    # l'inscription apparaîtrait et disparaîtrait d'un geste à l'autre ; aucun numéro ni inscription sur une tenue
    t = re.sub(r'\s*(?:numéro|n°)\s*\d+', '', t)
    return re.sub(r'\s+', ' ', t.replace('en couronne', 'noué haut sur la tête')).strip()


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()).strip('-')


PIECES = {'cour': 'its courtyard', 'cuisine': 'its outdoor kitchen',
          # 20/10 23:50 — lu sur les 30 premières images : « chambre » et « salon » dessinés DEHORS (la description de la maison
          # l'emportait) ; la pièce est désormais nommée comme un intérieur, murs et plafond, avant la maison
          'salon': 'INTERIOR VIEW inside its living room, indoor, walls and ceiling visible, no sky',
          'chambre': 'INTERIOR VIEW inside a bedroom of the house, indoor, walls and ceiling visible, no sky'}
# Version de chaque image : une image refaite (prompt corrigé, défaut vu) prend la version suivante ; bible_tourne.py ne refait
# que les images dont la version a changé. 20/10 23:50 : personne à l'accueil (hôpital), spectateurs (terrain de foot),
# drapeau étranger (douane) ; chambres et salons des maisons (dehors).
REFAIRE = {'decor-hopital-large-jour': 2, 'decor-terrain-de-foot-large-jour': 2, 'decor-douane-large-jour': 2,
           # 21/10 00:35, lu sur les 10 premières planches : mur et rideau derrière Madame Coumba (sa fiche la dit « derrière un
           # rideau »), tresses sur la 5e pose de Tata Prisca (afro sur les 4 autres) → fond vert seul, même coiffure partout
           'perso-madame-coumba': 2, 'perso-tata-prisca': 2,
           # 21/10 00:55, lot 2 : fantôme flou entre deux poses (Sœur Awa), pupitre collé aux poses (Mademoiselle Rosine), porte
           # derrière (Agent Gora), vert sur vert (Agent Bakary) ; les deux autres habillés de vert passent aussi au fond bleu
           'perso-sur-awa': 2, 'perso-mademoiselle-rosine': 2, 'perso-agent-gora': 2, 'perso-agent-bakary': 2,
           'perso-maman-brigitte': 2, 'perso-coach-diabate': 2,
           # 21/10 01:05, lot 3 : second visage (Maître Koné), portes (La Voisine), jarre flottante (Sorcière Mama Dédé), bulle de
           # texte (Fatou), autre enfant sur la 5e pose (Petite Khadija) → un seul personnage, ni texte, ni porte
           'perso-maitre-kone': 2, 'perso-la-voisine': 2, 'perso-sorciere-mama-dede': 2, 'perso-fatou': 2, 'perso-petite-khadija': 2,
           # 21/10 01:30, lot 4 : la pose de rire (ou toute la tenue) reprise de la planche de référence (Yaya, Maître Coulibaly,
           # Banquier, Tonton, Mamie Bintou), bulle « Refusé ! » (Banquier), voiture (Yaya), couronne et caisse (Madame Konan)
           'perso-yaya-lapprenti': 2, 'perso-maitre-coulibaly': 2, 'perso-le-banquier': 2, 'perso-le-tonton': 2,
           'perso-mamie-bintou': 2, 'perso-madame-konan': 2,
           # 21/10 01:35, lot 5 : veste de Koffi (DJ Kevin, Boubacar), comptoir collé aux poses (Patron Séry)
           'perso-dj-kevin': 2, 'perso-boubacar': 2, 'perso-patron-sery': 2,
           # 21/10 01:36, planches déjà acceptées relues avec ce défaut en tête : rire de Koffi (lunettes, visage) sur la dernière pose
           # (Djecky, Général Zongo, Mécano Issa, Monsieur Diarra, Tiékoro), Le Frimeur sosie de Koffi, rire de Baye (Grand-père
           # Ndiaye, Tonton Dieng)
           'perso-djecky': 3, 'perso-general-zongo': 2, 'perso-mecano-issa': 2, 'perso-monsieur-diarra': 2, 'perso-tiekoro': 2,
           'perso-le-frimeur': 2, 'perso-grand-pere-ndiaye': 2, 'perso-tonton-dieng': 2}
# Les corrections sont regroupées en UNE passe : pousser bible/taches.json redémarre les 20 machines (chacune ne perd que l'image
# en cours ; la répartition des tâches entre machines ne bouge pas tant que l'ordre de la liste est gardé — vérifié à chaque passe).


# 21/10 01:50 — PRIORITÉ AUX PERSONNAGES : la banque de mouvements (les gestes des nouveaux personnages, sans lesquels aucune
# vidéo ne les montre) attend derrière la bible sur les 20 machines du compte. Les décors secondaires (autres vues, nuit,
# ambiances : rang 3 et plus) passent à la passe suivante ; chaque machine rend sa place dès ses personnages et ses maisons
# de jour faits. Remettre à False (et pousser bible/taches.json) pour les tourner.
REPORTER_SECONDAIRES = True


GENRES = json.load(open(os.path.join(ICI, '..', 'blender', 'film', 'characters.json'), encoding='utf-8'))
DECENNIES = {'vingtaine': 25, 'trentaine': 35, 'quarantaine': 45, 'cinquantaine': 55, 'soixantaine': 65, 'septantaine': 75}


def age_de(p):
    t = p.get('age', ''); m = re.search(r'(\d+)\s*ans', t)
    return int(m.group(1)) if m else next((v for k, v in DECENNIES.items() if k in t), 35)


def ref_style(p):
    """Planche V1 la plus proche du personnage (âge, genre) : la référence de style qu'il reçoit."""
    a = age_de(p); g = (GENRES.get(p['name']) or {}).get('genre', '')
    femme = g in ('femme', 'fille') or (not g and any(k in p.get('apparence', '').lower() for k in ('femme', 'fille ')))
    if a < 13: return 'petit-mamadou-planche'
    if femme: return 'maman-nounou-planche' if a >= 45 else 'coumba-planche'
    return 'baye-ndiaye-planche' if a >= 50 else 'koffi-planche'


INTERIEURS = ('salon', 'chambre')
MOTS_INTERIEUR = ('room', 'sofa', 'television', 'bed', 'kitchen', 'wardrobe', 'carpet', 'curtain', 'furniture', 'portrait', 'shelf',
                  'book', 'armchair', 'table', 'photo', 'fan', 'lamp', 'medal', 'trophy', 'poster', 'mat')


def interieur(maison):
    """Seuls les éléments d'intérieur de la description de la maison (meubles, télévision, portraits…) : la cour, l'arbre et le
    linge entraînaient le dessin dehors (vu sur les 30 premières images, 20/10 23:50)."""
    morceaux = [m.strip() for m in re.split(r'[,;:]', maison) if any(k in m.lower() for k in MOTS_INTERIEUR)]
    return (', furnished like this family\'s home: ' + ', '.join(morceaux)) if morceaux else ''


def taches():
    B = json.load(open(PERSONNAGES, encoding='utf-8')); M = monde.construit(); T = []
    for p in B['personnages']:
        nom = p['name']
        if nom in V1: continue
        fond = 'blue' if nom in FOND_BLEU else 'green'
        T.append({'id': 'perso-' + slug(nom), 'type': 'personnage', 'nom': nom, 'w': 1280, 'h': 720, 'refs': [],
                  'ref_px': 448 * 768,   # la fiche entière, sans réduction : c'est l'identité à garder
                  'fiche': {'w': 448, 'h': 768, 'refs': [ref_style(p) + '-neutre.msb'], 'ref_px': 448 * 768,
                            'prompt': FICHE.format(nom=nom.title(), apparence=texte_dessinable(p.get('apparence')),
                                                   tenue=texte_dessinable(p.get('tenue')), fond=fond)},
                  'prompt': PLANCHE.format(poses=POSES.format(fond=fond)), **({'fond': 'bleu'} if nom in FOND_BLEU else {})})
    lieux_joues = {r['lieu'] for r in M['figures_du_quartier']} | {l for j in M['journee'] for l in j['lieux']}
    for lieu, desc in LIEUX.items():
        for v, vd in VUES.items():
            for m, md in MOMENTS.items():
                T.append({'id': f'decor-{slug(lieu)}-{v}-{m}', 'type': 'decor', 'lieu': lieu, 'w': 768, 'h': 448, 'refs': ['v1-maquis.msb'],
                          'prompt': f"{STYLE}: {desc}, {vd}, {md}, {SOL_LIBRE}, completely empty, no people."})
        if lieu in lieux_joues:
            for a, ad in AMBIANCES.items():
                T.append({'id': f'decor-{slug(lieu)}-large-{a}', 'type': 'decor', 'lieu': lieu, 'w': 768, 'h': 448, 'refs': ['v1-maquis.msb'],
                          'prompt': f"{STYLE}: {desc}, wide establishing shot, {ad}, {SOL_LIBRE}, completely empty, no people."})
    for f in M['foyers']:   # la maison de chaque famille : toujours la même, pièce par pièce
        for piece, pd in PIECES.items():
            for v in ('large', 'champ'):
                for m, md in MOMENTS.items():
                    T.append({'id': f"maison-{slug(f['foyer'])}-{piece}-{v}-{m}", 'type': 'decor', 'foyer': f['foyer'], 'w': 768, 'h': 448,
                              **({'version': 2} if piece in ('salon', 'chambre') else {}),
                              'refs': ['v1-maquis.msb'],
                              'prompt': (f"{STYLE}: {pd} — {f['maison']}; {VUES[v]}, {md}, {SOL_LIBRE}, completely empty, no people."
                                         if piece not in INTERIEURS else
                                         f"{STYLE}: {pd}{interieur(f['maison'])}; {VUES[v].replace('establishing shot', 'shot of the room')}, {md}, eye-level camera, "
                                         f"open empty floor in the middle foreground, completely empty, no people.")})
    for t in T:
        if t['id'] in REFAIRE: t['version'] = REFAIRE[t['id']]
        if REPORTER_SECONDAIRES and rang(t) >= 3: t['plus_tard'] = True
    return sorted(T, key=rang)


def rang(t):
    """Ordre de tournage : ce dont les premières vidéos ont besoin d'abord (lieux et maisons de jour en plan large, puis les
    personnages, puis les autres vues, la nuit, les ambiances) ; le partage entre machines suit cet ordre."""
    i = t['id']
    if t['type'] == 'personnage': return 2
    nuit, large = i.endswith('-nuit'), '-large-' in i
    if large and not nuit and i.endswith('-jour'): return 0 if i.startswith('decor-') else 1
    if not nuit and i.endswith('-jour'): return 3
    return 4 if nuit else 5


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'taches':
        T = taches(); n = {k: sum(t['type'] == k for t in T) for k in ('personnage', 'decor')}; n['maisons'] = sum(t['id'].startswith('maison-') for t in T)
        if len(a) > 1: json.dump(T, open(a[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(json.dumps({'taches': len(T), **n, 'personnages_v1_gardes': len(V1)}, ensure_ascii=False))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
