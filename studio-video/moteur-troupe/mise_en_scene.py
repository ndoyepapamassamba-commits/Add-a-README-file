# MISE EN SCÈNE D'UN PLAN POUR LES MODÈLES VIDÉO (17/10/2026) — commune à toutes les voies (GPU gratuit Modal / Kaggle /
# Hugging Face, et voies payantes désactivées) : qui parle (apparence tirée des fiches de la troupe), comment (consigne de
# jeu de la réplique), réactions des autres, décor vivant, identité gardée, chute jouée.

# apparence de chaque personnage (fiches de la troupe) : le modèle sait QUI parle dans l'image de départ
QUI = {'BAYE NDIAYE': 'the grandfather with grey hair and a grey beard, in a royal-blue embroidered boubou',
       'MAMAN NOUNOU': 'the grandmother with a red head wrap and a green gingham apron over a sunflower-print dress',
       'PETIT MAMADOU': 'the little boy in the yellow number-10 football jersey and blue shorts',
       'KOFFI': 'the young man with sunglasses and a black-and-gold patterned jacket',
       'COUMBA': 'the young woman with a big curly bun and a pink-purple off-shoulder dress',
       'TANTIE AWA': 'the woman with an orange head wrap and an orange sunflower-print dress',
       'MODOU': 'the thin young man in a worn green t-shirt'}
# consigne de jeu de la réplique (timeline : champ « jeu ») → jeu du corps entier
JEU = {'accuse': 'points an accusing finger and leans forward, frowning',
       'camera': 'turns to the camera with a knowing look',
       'choc': 'gasps in shock, eyes wide, both hands up',
       'frime': 'shows off, leaning back with a proud grin and a big hand gesture',
       'innocent': 'plays innocent: shrugs, raises open palms and looks away with a guilty smile',
       'malice': 'speaks with a mischievous grin, eyebrows raised, tilting the head',
       'marchande': 'bargains with lively hand gestures',
       'panique': 'panics, hands on the head, eyes darting',
       'rire': 'bursts out laughing, shoulders shaking, clapping the hands',
       'soupcon': 'squints suspiciously, hands on the hips, leaning in'}
DECOR = {'cachette': ('a sunny West African family courtyard', 'laundry on the line and palm leaves sway in the breeze; '
                      'soft shadows move slightly', 'roosters crowing far away, hens clucking, light wind in the palms'),
         'addition': ('an open-air Ivorian maquis restaurant at dusk', 'grill smoke drifts, string lights sway gently, '
                      'customers move in the background', 'grill sizzling, soft crowd chatter, distant music'),
         'poulet': ('a dusty West African compound with a blue door', 'palm trees sway; chickens wander and peck behind '
                    'them; warm dust floats in the light', 'hens clucking, a rooster far away, light wind')}
NEGATIF = 'subtitles, text, watermark, deformed face, extra limbs, morphing, flicker, camera shake, scene cut'


def consigne(p, son=False):
    """la consigne de mise en scène du plan : décor vivant, qui parle et comment, réactions des autres, identité gardée.
    `son` : le modèle génère lui-même la parole (la réplique est alors écrite dans la consigne)."""
    lieu, vie, ambiance = DECOR.get(p.get('sketch'), ('the same place', 'the background stays alive with gentle natural motion', 'soft ambience'))
    lignes = []
    for L in p.get('repliques', []):
        qui = QUI.get(L['qui'], L['qui'].title()); jeu = JEU.get(L.get('jeu'), 'speaks expressively with natural gestures')
        dit = f' and says in French, with a warm Ivorian accent: "{L["texte"]}"' if son else ', talking with natural lip movement'
        chute = (' Comic timing: a tiny pause before the last words, then the others freeze in surprise.'
                 if str(L.get('role', '')).startswith('chute') else '')
        lignes.append(f'{qui[0].upper() + qui[1:]} {jeu}{dit}.{chute}')
    if not lignes: lignes.append('The characters listen and react to each other.')
    texte = (f'3D animated feature film in Pixar style, West African family comedy, {lieu}. ' + ' '.join(lignes) +
             ' The others listen and react naturally: they blink, nod, raise their eyebrows, smile or frown, and turn their '
             'heads toward whoever speaks. Full-body acting: head, shoulders, arms and hands move with the words, weight '
             f'shifts. Background alive: {vie}. Keep exactly the same characters, faces, outfits, colors and place as the '
             'first frame; steady camera; no cut; no text.')
    if son: texte += f' Ambient sound: {ambiance}.'
    return texte
