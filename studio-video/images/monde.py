# LE MONDE DE LA SÉRIE (20/10/2026) — « créer les personnages et les scènes suffisants qui vont te permettre de simuler des
# familles, une vue journalière, tenant compte de notre style d'histoire et notre style comique […] des scènes comiques,
# mais qui vont raconter une histoire à long terme sur les 10 000 vidéos. »
# Bâti sur la bible comique du moteur (moteur-troupe/bible_comique.json : 54 personnages décrits, 74 relations, la Cité
# Bonne-Chance), comme une « bible de série » de sitcom :
#   foyers     : familles déduites des liens de parenté de la bible (union des liens époux, père, mère, frère, cousin…),
#                chacune avec SA maison (cour, salon, chambre, cuisine) dessinée une fois ; les autres sont les figures du
#                quartier, rattachées à leur lieu de travail ;
#   journée    : matin, midi, après-midi, soir, nuit — qui est où et fait quoi, pour que chaque sketch tombe au bon endroit ;
#   calendrier : temps « flottant » des sitcoms (les enfants ne vieillissent pas) ; chaque saison = une année du quartier
#                avec ses rendez-vous (rentrée, Noël, Tabaski, CAN, vacances, saison des pluies) ;
#   arcs       : histoires longues tirées des dynamiques de la bible ; chaque vidéo garde un sketch d'arc et deux sketchs
#                de vie quotidienne qui y font écho, si bien que les 10 000 vidéos racontent une histoire suivie.
#   python3 monde.py construit [SORTIE.json]    → foyers, lieux, journée, calendrier, arcs (et leurs nombres)
#   python3 monde.py vidéo N                    → ce que raconte la vidéo n° N (saison, jour, moment, arcs, foyer, lieux)
import json, os, sys

ICI = os.path.dirname(os.path.abspath(__file__))
BIBLE = os.path.join(ICI, '..', 'moteur-troupe', 'bible_comique.json')
PARENTE = ('époux', 'épouse', 'père', 'mère', 'fils', 'fille', 'frère', 'sœur', 'grand-père', 'grand-mère', 'grand-tante',
           'cousin', 'oncle', 'tante', 'neveu', 'nièce')
MAISONS = {   # foyer (nom du chef de famille) → la maison, décrite pour le générateur
    'BAYE NDIAYE': "a modest West African family compound: a sandy courtyard with a mango tree, laundry lines, plastic chairs, "
                   "a rented room with a blue door at the back, a living room with lace-covered sofas and a big old television",
    'GÉNÉRAL ZONGO': "a flashy two-storey villa with a tiled courtyard, a gate with a guard booth, gold-framed portraits, leather sofas",
    'PROFESSEUR SAMBA': "a tidy small house full of books and newspapers, a desk with an old computer, a reading chair on the porch",
    'SŒUR AWA': "a small clean apartment near the clinic, a nurse uniform drying, a calendar with shifts, a child's school bag",
    'MÉCANO ISSA': "a house next to his garage, tires and tools in the courtyard, a football net made of a fishing net",
    'FATOU': "a lively apartment that is also a gossip headquarters, a balcony overlooking the street, a phone always charging",
    'LA VOISINE': "the house next door to the Ndiaye family, separated by a low wall everyone talks over",
}
LIEUX_TRAVAIL = {   # figure du quartier → lieu où on la trouve en journée (lieux de bible.py)
    'KOFFI': 'Maquis', 'MODOU': 'Cour', 'PATRON SÉRY': 'Maquis', 'DJ KÉVIN': 'Maquis', 'TATA PRISCA': 'Salon de coiffure',
    'MAMAN BRIGITTE': 'Marché', 'MAMIE BINTOU': 'Rue', 'MAÎTRE KONÉ': 'École', 'DOCTEUR SYLLA': 'Hôpital', 'AGENT DOUMBIA': 'Rue',
    'AGENT BAKARY': 'Douane', 'AGENT GORA': 'Banque', 'LE BANQUIER': 'Banque', 'CHEF TRAORÉ': 'Bureau', 'IMAM KARIM': 'Mosquée',
    'ALIOU': 'Taxi', 'YAYA L’APPRENTI': 'Gare routière', 'COACH DIABATÉ': 'Terrain de foot', 'MAÎTRE COULIBALY': 'Tribunal',
    'SORCIÈRE MAMA DÉDÉ': 'Rue', 'TANTIE AWA SARR': 'Maquis', 'MADAME KONAN': 'Salon', 'MONSIEUR DIARRA': 'Bureau',
    'MÉCANO ISSA': 'Garage', 'DJECKY': 'Rue', 'TIÉKORO': 'Marché', 'ADJOUA': 'Boutique', 'BOUBACAR': 'Hôpital',
    'SALIF LE PARISIEN': 'Maquis', 'MADEMOISELLE ROSINE': 'Bureau', 'LE FRIMEUR': 'Maquis', 'LA GO LÉOPARD': 'Salon de coiffure',
}
JOURNEE = [   # moment → lieux où se jouent les sketchs, activités typiques (vue journalière du quartier)
    {'moment': 'matin', 'heure': '6h-9h', 'lumiere': 'jour', 'lieux': ['Cour', 'Cuisine', 'Rue', 'Taxi', 'École', 'Gare routière'],
     'activites': "file pour la douche, bouillie et pain, Petit Mamadou en retard à l'école, Aliou contrôlé par Agent Doumbia"},
    {'moment': 'midi', 'heure': '11h-14h', 'lumiere': 'jour', 'lieux': ['Marché', 'Bureau', 'Banque', 'Boutique', 'Maquis', 'Hôpital'],
     'activites': "marchandage au marché, files à la banque et au bureau, attiéké-poisson au maquis, rendez-vous à la clinique"},
    {'moment': 'après-midi', 'heure': '14h-18h', 'lumiere': 'jour', 'lieux': ['Salon de coiffure', 'Terrain de foot', 'Garage', 'Cour', 'Atelier de couture', 'Plage'],
     'activites': "potins au salon de coiffure, entraînement de foot, sieste interrompue, essayage chez le tailleur"},
    {'moment': 'soir', 'heure': '18h-22h', 'lumiere': 'nuit', 'lieux': ['Salon', 'Cour', 'Maquis', 'Rue', 'Cérémonie'],
     'activites': "dîner en famille, télénovela, match à la télé, coupure de courant, maquis et grins de thé"},
    {'moment': 'nuit', 'heure': '22h-6h', 'lumiere': 'nuit', 'lieux': ['Chambre', 'Cour', 'Rue', 'Maquis'],
     'activites': "retours en cachette, ronflements, appels téléphoniques suspects, moustiques, voleur imaginaire"},
]
CALENDRIER = [   # rendez-vous de chaque saison (une année du quartier) : position dans la saison (0 → 1)
    (0.00, 'rentrée des classes'), (0.12, 'saison des pluies et inondations'), (0.25, 'Noël et réveillon du 31'),
    (0.35, 'CAN de football'), (0.45, 'Ramadan puis Korité'), (0.55, 'examens du CEPE'), (0.62, 'Tabaski et son mouton'),
    (0.72, 'grandes vacances, cousins de Paris'), (0.85, 'mariages de la saison sèche'), (0.95, 'élections du chef de quartier'),
]
ARCS = [   # histoires longues : (id, titre, personnages, moteur comique, étapes, longueur en vidéos)
    ('mariage-coumba', 'Le mariage de Coumba', ['COUMBA', 'KOFFI', 'MODOU', 'MAMAN NOUNOU', 'BAYE NDIAYE', 'LE BANQUIER'],
     'chacun croit que Coumba va l’épouser ; la dot grimpe à chaque épisode',
     ['Koffi annonce la demande en mariage', 'Maman Nounou fixe une dot démesurée', 'Modou tente de payer la dot en nature',
      'le banquier entre dans la course', 'Coumba choisit… personne : elle ouvre son propre salon'], 400),
    ('koffi-demasque', 'Koffi le faux riche', ['KOFFI', 'PATRON SÉRY', 'TIÉKORO', 'LA GO LÉOPARD', 'LE FRIMEUR'],
     'un mensonge qui grossit : la voiture louée, la villa d’un cousin, le compte en Suisse',
     ['Koffi paye la tournée avec l’argent de Tiékoro', 'la voiture « à lui » est réclamée par son propriétaire',
      'Patron Séry affiche la liste des dettes', 'Koffi fait semblant d’être ruiné pour fuir les dettes… et personne n’y croit',
      'Koffi gagne vraiment au loto et personne ne le croit'], 300),
    ('loyer-modou', 'Le loyer de Modou', ['MODOU', 'TANTIE AWA', 'BAYE NDIAYE', 'DJECKY'],
     'chaque fin de mois, un nouveau plan pour ne pas payer',
     ['Modou paie avec une poule', 'Modou « garde » Petit Mamadou en échange du loyer', 'Djecky et Modou lancent un business de livraison',
      'Tantie Awa installe un cadenas à la porte de Modou', 'Modou paie enfin… avec l’argent volé à la tirelire de Tantie Awa'], 250),
    ('tontine', 'La tontine de Madame Konan', ['MADAME KONAN', 'MONSIEUR DIARRA', 'MAMAN NOUNOU', 'MAMIE BINTOU', 'FATOU'],
     'la caisse de la tontine disparaît et tout le quartier enquête',
     ['Maman Nounou attend son tour depuis 11 mois', 'Monsieur Diarra le trésorier part « en mission »',
      'Fatou lance une enquête par messages vocaux', 'la caisse est retrouvée… sous le lit de Madame Konan',
      'nouvelle tontine, mêmes membres, même méfiance'], 200),
    ('cepe-mamadou', 'Petit Mamadou et le CEPE', ['PETIT MAMADOU', 'PETIT IBRAHIMA', 'PETIT MOUSSA', 'MAÎTRE KONÉ', 'TANTIE AWA'],
     'l’enfant malin contre l’école : excuses toujours plus énormes',
     ['le devoir mangé par la chèvre', 'Petit Mamadou devient « répétiteur » payant de ses camarades',
      'rivalité avec Petit Ibrahima, le premier de la classe', 'Tantie Awa vient en personne à l’école',
      'résultats du CEPE : tout le quartier attend'], 300),
    ('election-chef', 'L’élection du chef de quartier', ['CHEF TRAORÉ', 'PROFESSEUR SAMBA', 'TONTON DIENG', 'LE PATRIARCHE', 'IMAM KARIM'],
     'campagne électorale de quartier : promesses absurdes et alliances qui changent',
     ['Professeur Samba se présente contre Chef Traoré', 'Tonton Dieng promet l’électricité 24 h sur 24',
      'distribution de t-shirts et de riz', 'le dépouillement à la lampe torche', 'le Patriarche tranche : on recommence l’an prochain'], 200),
    ('bebe-zongo', 'Le bébé du Général', ['GÉNÉRAL ZONGO', 'LA FUTURE MAMAN', 'SORCIÈRE MAMA DÉDÉ', 'DOCTEUR SYLLA', 'PETITE KHADIJA'],
     'le général organise la naissance comme une opération militaire',
     ['la grossesse annoncée au garde-à-vous', 'Mama Dédé vend des remèdes « garantis garçon »', 'fausse alerte à 3 h du matin',
      'le baptême le plus cher du quartier', 'le bébé ne dort qu’en entendant le clairon'], 250),
    ('salif-parisien', 'Salif le Parisien', ['SALIF LE PARISIEN', 'TONTON DIENG', 'AGENT BAKARY', 'KOFFI'],
     'le vacancier qui joue au riche de Paris pendant que sa vraie vie le rattrape',
     ['Salif arrive avec trois valises vides', 'concours de vantardise avec Tonton Dieng', 'Agent Bakary fouille ses valises à la douane',
      'la photo de son « appartement parisien » est une chambre de bonne', 'Salif repart… en empruntant le billet à Koffi'], 150),
    ('maquis-sery', 'Le maquis en danger', ['PATRON SÉRY', 'DJ KÉVIN', 'TANTIE AWA SARR', 'KOFFI', 'AGENT DOUMBIA'],
     'le maquis croule sous les ardoises ; chaque soirée doit le sauver',
     ['les ardoises dépassent le chiffre d’affaires', 'DJ Kévin organise une « soirée de soutien »', 'Tantie Awa Sarr coupe le poisson',
      'contrôle des normes par Agent Doumbia', 'le maquis devient le QG de campagne électorale'], 200),
    ('equipe-diabate', 'L’équipe du quartier', ['COACH DIABATÉ', 'PETIT MAMADOU', 'PETIT MOUSSA', 'MÉCANO ISSA', 'ALIOU'],
     'une équipe de foot nulle qui se croit invincible',
     ['le maillot unique pour onze joueurs', 'le tournoi interquartiers', 'le gardien est remplacé par une poule',
      'finale contre le quartier voisin', 'la coupe est volée… par le coach lui-même pour la montrer à sa mère'], 200),
    ('baye-cachettes', 'Les cachettes de Baye Ndiaye', ['BAYE NDIAYE', 'MAMAN NOUNOU', 'GRAND-PÈRE NDIAYE'],
     'il cache son argent, elle le trouve toujours (running gag de toutes les saisons)',
     ['sous le matelas', 'dans le Coran du salon', 'dans la chaussure du dimanche', 'au fond du poulailler',
      'à la banque — et Maman Nounou devient amie avec le banquier'], 500),
    ('coupures-cie', 'Le courant coupe toujours au mauvais moment', ['BAYE NDIAYE', 'PETIT MAMADOU', 'FATOU', 'TONTON DIENG'],
     'running gag : la coupure tombe pile au moment clé (match, aveu, télénovela)',
     ['pendant le penalty', 'pendant l’aveu de la télénovela', 'pendant le mariage', 'pendant la visite du Général',
      'le courant revient au pire moment'], 500),
]


def foyers(B):
    noms = [p['name'] for p in B['personnages']]; parent = {n: n for n in noms}
    def chef(n):
        while parent[n] != n: parent[n] = parent[parent[n]]; n = parent[n]
        return n
    for r in B['relations']:
        if r['a'] in parent and r['b'] in parent and any(k in r['lien'].lower() for k in PARENTE):
            parent[chef(r['a'])] = chef(r['b'])
    groupes = {}
    for n in noms: groupes.setdefault(chef(n), []).append(n)
    F = []
    for membres in groupes.values():
        if len(membres) < 2: continue
        tete = next((m for m in MAISONS if m in membres), sorted(membres)[0])
        F.append({'foyer': tete, 'membres': sorted(membres), 'maison': MAISONS.get(tete, 'a modest house in the Cité Bonne-Chance')})
    return sorted(F, key=lambda f: -len(f['membres']))


def construit():
    B = json.load(open(BIBLE, encoding='utf-8')); F = foyers(B)
    dans_foyer = {m for f in F for m in f['membres']}
    quartier = [{'nom': p['name'], 'lieu': LIEUX_TRAVAIL.get(p['name'], 'Rue')} for p in B['personnages'] if p['name'] not in dans_foyer]
    return {'quartier': B.get('quartier'), 'foyers': F, 'figures_du_quartier': quartier, 'journee': JOURNEE,
            'calendrier': [{'position': p, 'evenement': e} for p, e in CALENDRIER],
            'arcs': [{'id': a, 'titre': t, 'personnages': ps, 'moteur': mo, 'etapes': et, 'videos': n} for a, t, ps, mo, et, n in ARCS],
            'suites': [{'id': a, 'titre': t, 'apres': ap, 'personnages': ps, 'moteur': mo, 'etapes': et, 'videos': n}
                       for a, t, ap, ps, mo, et, n in SUITES],
            'regle': ("chaque vidéo = 3 sketchs : 1 sketch qui fait avancer un arc actif (étape suivante), 2 sketchs de vie "
                      "quotidienne au moment et au lieu de la journée, qui rappellent l'arc (allusion, conséquence, running gag) ; "
                      "temps flottant : 50 saisons de 200 vidéos, chacune une année du quartier avec son calendrier")}


GAGS = ('baye-cachettes', 'coupures-cie')   # running gags : présents dans toutes les saisons, une allusion par vidéo
SUITES = [   # 2e génération : chaque arc terminé ouvre le suivant (conséquences gardées) ; après elle, le moteur d'histoires
             # écrit les arcs suivants à partir de l'état du quartier, avec les mêmes règles
    ('salon-coumba', 'Le salon de Coumba', 'mariage-coumba', ['COUMBA', 'TATA PRISCA', 'LA GO LÉOPARD', 'MAMAN NOUNOU'],
     'deux salons de coiffure face à face, guerre des prix et des potins',
     ['ouverture avec une seule chaise', 'Tata Prisca crie à la trahison', 'La Go Léopard devient cliente-espionne',
      'Maman Nounou s’impose comme caissière', 'fusion des deux salons'], 200),
    ('koffi-millionnaire', 'Koffi millionnaire (vraiment)', 'koffi-demasque', ['KOFFI', 'PATRON SÉRY', 'LE BANQUIER', 'TIÉKORO'],
     'le seul jour où Koffi est riche, plus personne ne le croit',
     ['le ticket gagnant que personne ne croit', 'tous ses créanciers arrivent en même temps', 'le banquier lui fait la cour',
      'Koffi perd le ticket', 'le ticket retrouvé dans la poche de Tiékoro'], 150),
    ('modou-entrepreneur', 'Modou entrepreneur', 'loyer-modou', ['MODOU', 'DJECKY', 'TANTIE AWA', 'PETIT MAMADOU'],
     'chaque business de Modou finit en catastrophe utile à quelqu’un d’autre',
     ['livraison à vélo sans freins', 'cyber-café dans la chambre louée', 'vente de crédit téléphonique à crédit',
      'Petit Mamadou devient son patron', 'Tantie Awa rachète l’affaire'], 200),
    ('tontine-2', 'La tontine des hommes', 'tontine', ['BAYE NDIAYE', 'TONTON DIENG', 'MONSIEUR DIARRA', 'ALIOU'],
     'les hommes copient la tontine des femmes et font pire',
     ['première réunion au maquis', 'la caisse sert à payer la tournée', 'Monsieur Diarra trésorier… encore',
      'les femmes saisissent la caisse', 'la tontine des hommes devient un grin de thé'], 150),
    ('college-mamadou', 'Petit Mamadou au collège', 'cepe-mamadou', ['PETIT MAMADOU', 'PETIT MOUSSA', 'LA LYCÉENNE', 'PROFESSEUR SAMBA'],
     'le malin de l’école primaire découvre les grands',
     ['l’uniforme trop grand', 'Professeur Samba est son professeur', 'la Lycéenne le prend comme garde du corps',
      'le carnet de notes « perdu »', 'délégué de classe par tricherie électorale'], 200),
    ('mandat-chef', 'Le mandat du nouveau chef', 'election-chef', ['CHEF TRAORÉ', 'PROFESSEUR SAMBA', 'MADEMOISELLE ROSINE', 'TONTON DIENG'],
     'les promesses de campagne rattrapent le quartier',
     ['l’électricité 24 h sur 24 promise', 'le grand projet de caniveau', 'Mademoiselle Rosine dépose 40 plaintes',
      'le budget part en t-shirts', 'inauguration d’un caniveau de 3 mètres'], 150),
]


def video(n, M=None):
    """Vidéo n (1 → 10 000) : 3 voies d'arcs qui avancent en parallèle (une voie par vidéo, à tour de rôle), un running gag,
    le moment de la journée et le rendez-vous de la saison. Les arcs commencent à leur première étape et s'enchaînent."""
    M = M or construit(); saison, rang = divmod(n - 1, 200); pos = rang / 200
    histoires = [a for a in M['arcs'] if a['id'] not in GAGS] + M.get('suites', [])
    voie = (n - 1) % 3; i = (n - 1) // 3; debut = 0; arc = etape = None
    for a in histoires[voie::3]:
        long = max(1, a['videos'] // 3)
        if i < debut + long:
            arc = a; etape = a['etapes'][(i - debut) * len(a['etapes']) // long]; break
        debut += long
    gags = [a for a in M['arcs'] if a['id'] in GAGS]; g = gags[n % len(gags)]
    j = M['journee'][(n - 1) % len(M['journee'])]
    evt = max((c for c in M['calendrier'] if c['position'] <= pos), key=lambda c: c['position'])['evenement']
    return {'video': n, 'saison': saison + 1, 'jour': rang // len(M['journee']) + 1, 'moment': j['moment'], 'lumiere': j['lumiere'], 'periode': evt,
            'arc': {'id': arc['id'], 'titre': arc['titre'], 'etape': etape} if arc else
                   {'id': None, 'titre': 'arc à écrire par le moteur d’histoires', 'etape': 'suite de la voie %d, depuis l’état du quartier' % voie},
            'running_gag': {'id': g['id'], 'allusion': g['etapes'][(n // len(gags)) % len(g['etapes'])]},
            'lieux_possibles': j['lieux'], 'foyer_focal': M['foyers'][n % len(M['foyers'])]['foyer']}


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'construit':
        M = construit()
        if len(a) > 1: json.dump(M, open(a[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(json.dumps({'foyers': [(f['foyer'], len(f['membres'])) for f in M['foyers']], 'figures_du_quartier': len(M['figures_du_quartier']),
                          'moments': len(M['journee']), 'arcs': len(M['arcs']), 'suites': len(M['suites']), 'rendez_vous': len(M['calendrier']),
                          'videos_couvertes_par_arcs_ecrits': 3 * min(sum(a['videos'] // 3 for a in ([x for x in M['arcs'] if x['id'] not in GAGS] + M['suites'])[v::3]) for v in range(3))}, ensure_ascii=False))
    elif a and a[0] == 'vidéo': print(json.dumps(video(int(a[1])), ensure_ascii=False, indent=1))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
