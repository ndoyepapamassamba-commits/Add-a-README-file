# CONTRÔLE DU TON COMIQUE (18/10/2026) — « analyse bien le ton de l'humour en écrivant des sketchs ».
# Chaque règle vient d'une mesure ou d'une source (veille « Style comique Afrikatoon Ladjagay Gbeze » = [V], bible comique de
# la troupe = [B], relations de la bible = [R]) ; chaque défaut vu par l'utilisateur ou par nous devient une règle :
#   · structure [V][B] : accroche = conflit (« ? » ou « ! ») ; UNE chute, en DERNIÈRE réplique, rien après ; rappel d'un mot de
#     l'accroche dans la chute ;
#   · chute courte [V] : 34 à 37 images à 30 i/s (1,13 à 1,24 s) au débit des références (6,3 à 6,7 syllabes/s) → 9 syllabes
#     au plus (comptage écrit, e muets compris) et 8 mots au plus [B] ;
#   · réaction [V] : un TÉMOIN (pas celui qui dit la chute) se fige en gros plan 2,2 à 4,5 s après la chute ;
#   · durée [V] : sketch de 12 à 22 s (voix au débit mesuré de chaque personnage + 0,26 s par tour + 0,33 s avant la chute
#     + réaction), 4 à 12 répliques ;
#   · mécanique déclarée [V][B] et ressort d'un personnage qui porte la chute (le défaut du personnage, pas une blague hors
#     personnage) ;
#   · adresse juste [R] : Petit Mamadou dit « Papi » et « Mamie » à ses grands-parents (défaut trouvé le 18/10 : « Papa »,
#     « Maman » dans les premiers sketchs de la saison 1) ;
#   · langue [B] : 2 à 4 marques du parler ivoirien, jamais forcé ; aucun mot wolof ni cru (histoires.py) ;
#   · pièges [V] : rien sur le corps, la couleur, un animal comparé à une personne, une ethnie, une religion.
#   python3 ton.py histoire.json      → défauts et mesures de chaque sketch (code de sortie 1 s'il y a un défaut)
import json, os, re, sys, unicodedata
ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(ICI)); sys.path.insert(0, ICI)
from histoires import mots, _contient, MARQUES, WOLOF, CRU

# mécaniques des références (Afrikatoon, Ladjagaï) et de la bible : la chute en applique au moins une
MECANIQUES = {
    'pied de la lettre': 'un mot ou une consigne pris au sens littéral (Afrikatoon, « la mort m’a bipé »)',
    'logique contradictoire': 'la réponse contredit sa propre raison d’être (venir au bureau dire qu’on ne peut pas venir)',
    'ironie dramatique': 'le public voit la vérité avant le personnage (décor, objet, témoin)',
    'croyance au bout': 'une croyance ou une règle poussée jusqu’à l’absurde',
    'mauvaise foi': 'nier l’évidence avec une sérénité totale (Ladjagaï : « c’est les affaires »)',
    'règle absurde': 'un règlement inventé sur-le-champ, avec amende',
    'compliment empoisonné': 'un compliment qui insulte',
    'vantardise contredite': 'la vantardise ou la leçon au cadet retournée par un témoin',
    'contre-pied': 'on attend A, arrive B ; la victime se venge avec la même arme',
    'pince-sans-rire': 'une énormité dite calmement, regard caméra',
    'surenchère': 'chaque marche plus grosse que la précédente, la troisième absurde (règle de trois)',
    'proverbe détourné': 'une sagesse appliquée de travers à une situation moderne',
}
# adresse attendue : univers.ADRESSE (relations de la bible)
from univers import ADRESSE
VOCATIFS = {'papa', 'maman', 'papi', 'mamie', 'tantie', 'tonton', 'mémé'}
# pièges de la veille (animalisation, caricature des corps) et sujets que l'humour de la troupe ne vise jamais
PIEGES = {'gros', 'grosse', 'grosses', 'fesses', 'singe', 'gorille', 'macaque', 'babouin', 'nègre', 'négro', 'noiraud', 'boiteux',
          'aveugle', 'handicapé', 'ethnie', 'tribu', 'sale race'}
DEBIT = {'MAMAN NOUNOU': 5.4, 'TANTIE AWA': 5.4, 'COUMBA': 5.4, 'PETIT MAMADOU': 5.6, 'BAYE NDIAYE': 6.0, 'MODOU': 6.2, 'KOFFI': 6.2}
TOUR, AVANT_CHUTE = 0.26, 0.33


def syllabes(t):
    """syllabes écrites d'une réplique française (groupes de voyelles ; e muet final des mots longs retiré)."""
    n = 0
    for w in mots(t):
        w = w.replace("'", '').replace('-', '')
        g = re.findall(r'[aeiouyàâäéèêëîïôöùûüÿœæ]+', w)
        k = len(g)
        if k > 1 and re.search(r'[^aeiouyàâäéèêëîïôöùûüÿœæ](e|es|ent)$', w): k -= 1
        n += max(1, k) if g else 0
    return n


def racines(t):
    return {w[:5] for w in mots(t) if len(w) > 3}


def controle(s):
    """défauts (liste vide = conforme) et mesures d'un sketch."""
    d = []; R = s.get('repliques') or []; m = {}
    if not R: return ['aucune réplique'], m
    acteurs = set(s.get('acteurs') or {r['qui'] for r in R})
    if not 4 <= len(R) <= 12: d.append(f'{len(R)} répliques (4 à 12)')
    if not R[0]['texte'].rstrip().endswith(('?', '!')): d.append("l'accroche n'est ni une question piège ni une accusation")
    ch = [i for i, r in enumerate(R) if r.get('chute')]
    if len(ch) != 1: d.append(f'{len(ch)} chutes (une seule)'); return d, m
    c = R[ch[0]]
    if ch[0] != len(R) - 1: d.append('la chute n’est pas la dernière réplique')
    m['chute_mots'], m['chute_syllabes'] = len(mots(c['texte'])), syllabes(c['texte'])
    if m['chute_mots'] > 8: d.append(f"chute de {m['chute_mots']} mots (8 au plus)")
    if m['chute_syllabes'] > 9: d.append(f"chute de {m['chute_syllabes']} syllabes (9 au plus, soit ≈ 1,2 s)")
    if not racines(R[0]['texte']) & racines(c['texte']): d.append("la chute ne reprend aucun mot de l'accroche (rappel)")
    rea = s.get('reaction') or {}
    if not rea: d.append('aucune réaction figée après la chute')
    else:
        if rea.get('qui') == c['qui']: d.append('la réaction doit venir d’un témoin, pas de celui qui dit la chute')
        if rea.get('qui') not in acteurs: d.append(f"réaction d'un personnage absent : {rea.get('qui')}")
        if not 2.2 <= float(rea.get('duree_s', 0)) <= 4.5: d.append(f"réaction de {rea.get('duree_s')} s (2,2 à 4,5)")
    if s.get('mecanique') not in MECANIQUES: d.append(f"mécanique inconnue : {s.get('mecanique')}")
    res = s.get('ressort') or {}
    if res.get('qui') not in (c['qui'], rea.get('qui')): d.append('le ressort déclaré ne porte ni la chute ni la réaction')
    # durée : voix au débit de chaque personnage, tours de parole, silence avant la chute, réaction
    parole = sum(syllabes(r['texte']) / DEBIT.get(r['qui'], 5.8) for r in R)
    m['duree_s'] = round(parole + TOUR * (len(R) - 1) + AVANT_CHUTE + float(rea.get('duree_s', 0)), 1)
    m['chute_s'] = round(syllabes(c['texte']) / DEBIT.get(c['qui'], 5.8), 2)
    if not 12 <= m['duree_s'] <= 22: d.append(f"durée estimée {m['duree_s']} s (12 à 22)")
    for r in R:
        voc = set(mots(r['texte'])) & VOCATIFS; ok = ADRESSE.get((r['qui'], r.get('a'))); ok = {ok.lower()} if ok else None
        if ok and voc - ok: d.append(f"{r['qui']} dit « {', '.join(sorted(voc - ok))} » à {r['a']} (attendu : {', '.join(sorted(ok))})")
    tout = ' '.join(r['texte'] for r in R)
    mq = _contient(tout, MARQUES); mq = [x for x in mq if not any(x != y and x in y for y in mq)]; m['marques'] = mq   # « ehhh dieu » compte une fois
    if not 2 <= len(mq) <= 4: d.append(f'{len(mq)} marques du parler ivoirien (2 à 4, jamais forcé)')
    for nom, liste in (('wolof', WOLOF), ('mot cru', CRU), ('piège (corps, animal, groupe)', PIEGES)):
        x = _contient(tout, liste)
        if x: d.append(f"{nom} : {', '.join(x)}")
    return d, m


if __name__ == '__main__':
    H = json.load(open(sys.argv[1], encoding='utf-8')); nd = 0
    for s in H['sketchs']:
        d, m = controle(s); nd += len(d)
        print(f"{s['id']:<14} {'CONFORME' if not d else 'DÉFAUTS'}  durée {m.get('duree_s')} s, chute {m.get('chute_mots')} mots / "
              f"{m.get('chute_syllabes')} syll. ({m.get('chute_s')} s), marques {m.get('marques')}")
        for x in d: print('   ✗', x)
    sys.exit(1 if nd else 0)
