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
}
CAPS = {'animal_spacing_u': 0.4, 'animal_spacing_depth': 0.8, 'prop_spacing': 0.6, 'furniture_clearance': 0.3}

# Defect signature → (root cause, prevention, adjustment). The adjustment hardens a generation rule.
ROOT_CAUSES = {
    'collision-animaux': ('deux animaux tirés au même endroit (écart minimal trop faible pour leur taille et leurs déplacements)',
                          'écart minimal entre animaux augmenté de 25 %', {'animal_spacing_u': 1.25, 'animal_spacing_depth': 1.25}),
    'collision-accessoires': ('deux accessoires posés sur la même place au sol', 'écart minimal entre accessoires augmenté de 25 %', {'prop_spacing': 1.25}),
    'collision-meubles': ('deux meubles du plan de la pièce se chevauchent', 'marge libre autour de chaque meuble augmentée de 50 %', {'furniture_clearance': 1.5}),
    'meuble-flotte': ('un meuble n’est pas posé au sol (hauteur de base non nulle)', 'tout meuble posé est calé à z = 0', {'snap_to_floor': True}),
    'coque-chanfrein': ('les murs étaient chanfreinés : jour aux jointures, la lumière fuit', 'coque jamais chanfreinée', {'shell_bevel': False}),
    'faces-nulles': ('cellules de largeur nulle au bord rogné du dessin', 'cellules dégénérées écartées à la génération des cartes', {'card_skip_degenerate': True}),
    'sous-expose': ('lumière générée trop faible pour le lieu', 'fenêtre d’exposition relevée', {'exposure_min': 1.1}),
    'surexpose': ('lumière générée trop forte pour le lieu', 'fenêtre d’exposition abaissée', {'exposure_max': 0.95}),
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
    if c == 'eclairage' and 'chanfrein' in m:
        return 'coque-chanfrein'
    if c == 'geometrie' and 'aire nulle' in m:
        return 'faces-nulles'
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
    out = []
    for sig, its in found.items():
        cause, prevention, adj = ROOT_CAUSES[sig]
        applied = {}
        for k, v in adj.items():
            if isinstance(v, bool):
                regles[k] = v
            else:
                cur = regles.get(k, DEFAULTS[k])
                regles[k] = round(min(CAPS.get(k, cur * v), cur * v) if k in CAPS else cur * v, 4)
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
