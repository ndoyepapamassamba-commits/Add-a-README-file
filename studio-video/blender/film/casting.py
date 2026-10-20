"""
CASTING DES FIGURANTS — qui a le droit d'être dans le fond d'une scène, et pour y faire quoi.

Un figurant de la troupe est un DESSIN : ce qu'il fait est dessiné (selfie, sèche-cheveux, marmite, ordinateur…).
Il n'est donc crédible que si :
  1. il fréquente le lieu (sa fiche « lieux ») — la go du maquis ne fait pas son marché en robe de soirée ;
  2. l'action de son dessin existe à cet endroit (on ne coiffe pas au marché, on ne prend pas la tension à la plage) ;
  3. son dessin se prête au comportement demandé (un dessin assis ou en plein selfie ne traverse pas la foule).

Le même module sert à la génération (world.plan_life choisit avec ces règles) et au contrôle de conformité
(preflight vérifie chaque figurant et chaque membre de la foule) : ce qui est interdit n'est pas généré, et si cela
arrivait malgré tout, le contrôle le signale et la cause racine durcit la règle (rules.py).
"""
import re
import unicodedata


def fold(t):
    return ''.join(c for c in unicodedata.normalize('NFD', (t or '').lower()) if unicodedata.category(c) != 'Mn')


# Actions tied to a place: the drawing shows a tool or a piece of furniture that only exists there.
BOUND = [
    ('coiffure', r'coiff|seche-cheveux|tress|defris', {'Salon de coiffure'}),
    ('soins', r'tension|perfusion|stethoscope|seringue|ausculte', {'Hôpital', 'École'}),
    ('bureautique', r'ordinateur|tamponne|formulaire', {'Bureau', 'Tribunal', 'Douane'}),
    ('platine', r'platine|mixe', {'Maquis', 'Cérémonie', 'Plage'}),
    ('comptoir', r'comptoir', {'Maquis'}),
    ('classe', r'corrige des cahiers|craie au tableau', {'École'}),
    ('vehicule', r'taxi|carrosserie|moteur|volant|voiture', {'Taxi', 'Gare routière', 'Rue'}),
]
# Drawings that cannot cross the scene (seated, behind a counter, busy with a heavy or fixed object).
STATIC = (r'assis|chaise|banc|somnole|derriere (son|sa)|devant une file|coiff|marmite|tension|ordinateur|tamponne|'
          r'corrige des cahiers|mixe|par-dessus le mur|pas de sa porte|telephone pose|preside|sert le the|'
          r'tape sur un moteur|lit le journal|calculatrice|devant une voiture|egrene|balaie')
# Drawings turned towards the camera (selfie, filming): a passer-by or a customer never looks at the audience.
CAMERA = r'selfie|filme|perche|pose devant'
CAMERA_OK = {'travaille', 'regarde', 'attend'}
WALKERS = {'passe', 'foule'}
# Jobs named by a slot and the drawn actions that show them (preferred when the slot is filled).
JOBS = [
    (r'vendeu|marchand', r'vend|etal|billets|prix|bassine|client|hele'),
    (r'coiffeu', r'coiff|tress'),
    (r'serveu', r'sert|bouteille|plateau'),
    (r'cuisinier', r'marmite|cuisin|goute'),
    (r'apprenti', r'destinations|carrosserie'),
    (r'photographe', r'filme|photo|selfie|perche'),
    (r'danseu', r'danse'),
    (r'vigile|agent|policier|gardien', r'ronde|lampe|plaque|carnet|fouille|siffl'),
    (r'collegue', r'dossier|tamponne|ordinateur|calculatrice|formulaire'),
    (r'eleve', r'cahier|revise|ballon'),
    (r'patient', r'tousse|ventre|facture'),
    (r'voyageu', r'valise'),
]


def place_names(place):
    """The names under which a place appears in the sheets (« lieux »): its regular sets plus its own name."""
    return set(place.get('habitues', [])) | ({place['nom']} if place.get('nom') else set())


def verdict(sheet, hab, behavior, name=''):
    """(True, '') when this drawn character can be an extra here with this behaviour; else (False, reason in French)."""
    lieux = set(sheet.get('lieux', []))
    act = sheet.get('activite', '')
    a = fold(act)
    if lieux and hab and not (lieux & set(hab)):
        return False, f"ne fréquente pas ce lieu (ses lieux : {', '.join(sorted(lieux))})"
    for fam, rx, where in BOUND:
        if re.search(rx, a) and not (where & set(hab)):
            return False, f"son dessin le montre en train de « {act} » ({fam}) : action impossible ici"
    if behavior in WALKERS and re.search(STATIC, a):
        return False, f"son dessin est immobile (« {act} ») : il ne peut pas traverser la scène"
    if re.search(CAMERA, a) and behavior not in CAMERA_OK:
        return False, f"son dessin regarde la caméra (« {act} ») : un figurant qui {behavior_fr(behavior)} ne fixe pas le public"
    return True, ''


def behavior_fr(b):
    return {'passe': 'passe', 'foule': 'marche dans la foule', 'discute': 'discute', 'file': 'fait la queue'}.get(b, b)


def role_match(sheet, role):
    """1 when the drawn action shows the job of the slot (a vendor slot gets the one counting bills behind a stall)."""
    r, a = fold(role), fold(sheet.get('activite', ''))
    for rx_role, rx_act in JOBS:
        if re.search(rx_role, r):
            return 1 if re.search(rx_act, a) else 0
    return 0
