"""
RÈGLES DE GÉNÉRATION — ce que le moteur applique AVANT de produire, pour être conforme dès la première exécution.

Le contrôle de conformité (preflight.py) ne corrige pas en boucle : quand un défaut apparaît malgré tout, sa CAUSE
RACINE est identifiée ici, et la règle de génération correspondante est durcie (un écart minimal augmenté, une
interdiction ajoutée). La génération suivante lit ces règles : le même défaut ne revient pas.

  • DEFAULTS      règles d'usine (versionnées avec le code) ;
  • apprises      fichier JSON de l'utilisateur ($MASSAMBA_RULES ou ~/.massamba/blender-rules.json) : valeurs durcies +
                  registre des causes racines (signature, cause, prévention, occurrences, dernière fois) ;
  • learn()       appelé par le preflight : défaut → cause racine → règle ajustée (bornée, jamais au-delà d'un plafond).
"""
import json
import os
import time

DEFAULTS = {
    # Placement (living world): minimal spacing between two animals (screen u / depth) and between two props.
    'animal_spacing_u': 0.14,
    'animal_spacing_depth': 0.30,
    # …and the real distance between two animals where they finally stand (metres, after the relief pull).
    'animal_min_dist': 0.35,
    'prop_spacing': 0.28,
    # Furniture: free margin kept around each piece placed on the floor plan, and every grounded piece rests at z = 0.
    'furniture_clearance': 0.05,
    'snap_to_floor': True,
    # Architecture: walls, floor and ceiling are sealed boxes, never bevelled (no light leak at the joints).
    'shell_bevel': False,
    # Cards of the drawings: no degenerate cell at the clipped border of the image.
    'card_skip_degenerate': True,
    # Lighting: exposure window the generated light must land in (mean luminance of the probe render).
    'exposure_min': 0.18,
    'exposure_max': 0.72,
    # Every box of a generator orders its bounds (random bounds can never produce an inside-out box).
    'box_sorted_bounds': True,
    # Extras and crowd: only the regulars of the place, and only a drawing whose action is possible there.
    'casting_regulars_only': True,
    'casting_drawn_action': True,
    # Cameras: each move is fitted by ray marching so that no edge of the painted set can enter the frame.
    'framing_raycast': True,
    'framing_keep_faces': True,
    # Human laws (plausibility.py): extras stand at Hall's social distance (≥ 1.2 m) from the actors' conversation.
    'extras_min_depth': 1.25,
    'physics_hop': True,
    'style_detail_layer': True,
    # Depth of field: ceiling of the background blur on screen (pixels, for a 1024-px-high image) — faces and
    # expressions in the background stay readable.
    'background_blur_px': 2.0,
}
CAPS = {'extras_min_depth': 2.5, 'animal_min_dist': 0.8, 'animal_spacing_u': 0.4, 'animal_spacing_depth': 0.8, 'prop_spacing': 0.6, 'furniture_clearance': 0.3}
FLOORS = {'background_blur_px': 0.8}

# Defect signature → (root cause, prevention, adjustment). The adjustment hardens a generation rule.
ROOT_CAUSES = {
    'collision-animaux': ('deux animaux tirés au même endroit (écart minimal trop faible pour leur taille et leurs déplacements)',
                          'écart minimal entre animaux augmenté de 25 %', {'animal_spacing_u': 1.25, 'animal_spacing_depth': 1.25, 'animal_min_dist': 1.25}),
    'collision-accessoires': ('deux accessoires posés sur la même place au sol', 'écart minimal entre accessoires augmenté de 25 %', {'prop_spacing': 1.25}),
    'collision-meubles': ('deux meubles du plan de la pièce se chevauchent', 'marge libre autour de chaque meuble augmentée de 50 %', {'furniture_clearance': 1.5}),
    'meuble-flotte': ('un meuble n’est pas posé au sol (hauteur de base non nulle)', 'tout meuble posé est calé à z = 0', {'snap_to_floor': True}),
    'coque-chanfrein': ('les murs étaient chanfreinés : jour aux jointures, la lumière fuit', 'coque jamais chanfreinée', {'shell_bevel': False}),
    'faces-nulles': ('cellules de largeur nulle au bord rogné du dessin', 'cellules dégénérées écartées à la génération des cartes', {'card_skip_degenerate': True}),
    'sous-expose': ('lumière générée trop faible pour le lieu', 'fenêtre d’exposition relevée', {'exposure_min': 1.1}),
    'surexpose': ('lumière générée trop forte pour le lieu', 'fenêtre d’exposition abaissée', {'exposure_max': 0.95}),
    'normales-inversees': ('bornes d’une boîte tirées dans le désordre par un générateur (boîte retournée)', 'toute boîte ordonne ses bornes à la génération', {'box_sorted_bounds': True}),
    'figurant-hors-lieu': ('la foule était tirée parmi des personnages qui ne fréquentent pas le lieu', 'figurants et foule choisis parmi les habitués du lieu (fiche « lieux »)', {'casting_regulars_only': True}),
    'figurant-action-impossible': ('le dessin du figurant montre une action impossible à cet endroit ou pour ce comportement (selfie, sèche-cheveux, assis…)',
                                   'chaque figurant est choisi pour ce que montre son dessin', {'casting_drawn_action': True}),
    'decor-hors-champ': ('la caméra voyait au-delà du décor peint pendant son mouvement (relief vu sous un autre angle)', 'chaque mouvement de caméra est ajusté par lancer de rayons sur le relief', {'framing_raycast': True}),
    'visage-coupe': ('l’ajustement du cadrage déplaçait la caméra sans protéger les visages du plan', 'la caméra se resserre au lieu de couper un visage', {'framing_keep_faces': True}),
    'interlocuteurs-superposes': ('deux personnes qui se parlent étaient placées l’une sur l’autre (écart calculé en fraction d’écran, pas en mètres)',
                                  'groupes de conversation placés à distance de conversation (Hall : 0,75–1,2 m), face à face', {'extras_min_depth': 1.0}),
    'corps-superposes': ('deux personnes au même plan se recouvraient (aucune règle d’impénétrabilité au placement)',
                         'placement par la loi d’impénétrabilité : jamais deux corps au même endroit', {'extras_min_depth': 1.0}),
    'figurant-trop-pres': ('un figurant se tenait dans la zone personnelle de la conversation des acteurs', 'figurants à distance sociale (≥ 1,2 m) des acteurs, distance relevée de 10 %', {'extras_min_depth': 1.1}),
    'gravite': ('un saut durait plus longtemps que la gravité ne le permet (ou les pieds quittaient le sol en marchant)', 'sauts en parabole réelle (g = 9,81 m/s²), balancement de marche ancré aux pieds', {'physics_hop': True}),
    'decor-hors-style': ('le décor 3D était rendu en aplats sans matière, loin du rendu des dessins de la troupe', 'couche de matière sur toute surface + étalonnage mesuré vers la signature de la troupe', {'style_detail_layer': True}),
    'fond-illisible': ('le flou d’arrière-plan dépassait le plafond de lisibilité', 'plafond du flou d’arrière-plan abaissé de 20 %', {'background_blur_px': 0.8}),
}


def path():
    return os.environ.get('MASSAMBA_RULES') or os.path.join(os.path.expanduser('~'), '.massamba', 'blender-rules.json')


def _load_file():
    try:
        return json.load(open(path(), encoding='utf-8'))
    except Exception:
        return {'regles': {}, 'causes': {}}


def load():
    """The rules the generation applies now: factory rules hardened by what was learned."""
    r = dict(DEFAULTS)
    r.update(_load_file().get('regles', {}))
    return r


def get(key):
    return load().get(key, DEFAULTS.get(key))


def signature(issue):
    """The defect signature of a preflight finding (None when it is not a generation defect)."""
    m, c, o = issue.get('message', ''), issue.get('categorie'), (issue.get('objet') or '').lower()
    if c == 'collisions':
        if 'flotte' in m or 'traverse le sol' in m:
            return 'meuble-flotte'
        animals = ('poule', 'pigeon', 'canard', 'chevre', 'chèvre', 'chien', 'chat', 'oiseau', 'margouillat')
        if any(o.startswith(a) for a in animals):
            return 'collision-animaux'
        if o.startswith('prop-'):
            return 'collision-accessoires'
        return 'collision-meubles'
    if c == 'narratif' and 'figurant incohérent' in m:
        return 'figurant-hors-lieu' if 'ne fréquente pas' in m else 'figurant-action-impossible'
    if c == 'image' and 'au-delà du décor' in m:
        return 'decor-hors-champ'
    if c == 'image' and 'hors du style' in m:
        return 'decor-hors-style'
    if c == 'image' and 'trop flou' in m:
        return 'fond-illisible'
    if c == 'physique':
        if 'interlocuteurs' in m:
            return 'interlocuteurs-superposes'
        if 'même endroit' in m or 'même plan' in m:
            return 'corps-superposes'
        if 'zone personnelle' in m:
            return 'figurant-trop-pres'
        if 'gravité' in m:
            return 'gravite'
    if c == 'image' and 'visage de' in m:
        return 'visage-coupe'
    if c == 'eclairage' and 'chanfrein' in m:
        return 'coque-chanfrein'
    if c == 'geometrie' and 'aire nulle' in m:
        return 'faces-nulles'
    if c == 'geometrie' and 'normales' in m:
        return 'normales-inversees'
    if c == 'eclairage' and 'trop sombre' in m:
        return 'sous-expose'
    if c == 'eclairage' and 'surexposée' in m:
        return 'surexpose'
    return None


def learn(issues, fixes=(), subject=''):
    """Root-cause analysis of the defects of one generation: the matching generation rules are hardened and the
    registry remembers it. Returns the causes found (for the conformity report)."""
    data = _load_file()
    regles, causes = data.setdefault('regles', {}), data.setdefault('causes', {})
    found = {}
    for i in issues:
        sig = signature(i)
        if sig and sig in ROOT_CAUSES:
            found.setdefault(sig, []).append(i)
    for f in fixes:
        if 'chanfrein' in f:
            found.setdefault('coque-chanfrein', []).append({'message': f})
        elif 'normales' in f:
            found.setdefault('normales-inversees', []).append({'message': f})
    out = []
    for sig, its in found.items():
        cause, prevention, adj = ROOT_CAUSES[sig]
        applied = {}
        for k, v in adj.items():
            if isinstance(v, bool):
                regles[k] = v
            else:
                cur = regles.get(k, DEFAULTS[k])
                nv = cur * v
                if k in CAPS:
                    nv = min(CAPS[k], nv)
                if k in FLOORS:
                    nv = max(FLOORS[k], nv)
                regles[k] = round(nv, 4)
            applied[k] = regles[k]
        rec = causes.setdefault(sig, {'cause': cause, 'prevention': prevention, 'occurrences': 0})
        rec['occurrences'] += len(its)
        rec['derniere'] = time.strftime('%Y-%m-%d %H:%M')
        rec['dernier_sujet'] = subject
        rec['regle'] = applied
        out.append({'signature': sig, 'cause': cause, 'prevention': prevention, 'regle': applied, 'occurrences': rec['occurrences'], 'constats': len(its)})
    if out:
        try:
            os.makedirs(os.path.dirname(path()), exist_ok=True)
            json.dump(data, open(path(), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        except Exception:
            pass
    return out


def registry():
    """Everything learned so far (shown in the conformity report and the app)."""
    return _load_file().get('causes', {})
