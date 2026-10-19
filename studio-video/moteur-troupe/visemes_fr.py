# VISÈMES FRANÇAIS GREFFÉS DE TALKINGHEAD (19/10/2026, consigne « greffer-par-rea ») — @met4citizen/talkinghead 1.7.0 (MIT),
# démonté par REA (preuve ev_c38b5999…, `rea analyze-javascript-application modules/`) : `lipsync-fr.mjs` l. 324-337 donne la
# table des formes de bouche Oculus du français (aa ← /a ɑ/, E ← /e ɛ ə/, I ← /i y/, O ← /o ɔ/, U ← /u ø œ/, PP ← /p b m/,
# SS ← /s z ʃ ʒ/, DD ← /t d/, FF ← /f v/, kk ← /k g/, nn ← /n l ɲ/, RR ← /ʁ/) et ses durées relatives ; `wordsToVisemes`
# l. 523-572 fusionne deux visèmes identiques qui se suivent. TalkingHead devine les sons depuis l'orthographe ; nous avons
# mieux : les phonèmes que la voix Piper a RÉELLEMENT prononcés, avec leurs durées exactes (voix.phonemes_piper). La table
# greffée les traduit en formes de bouche, rendues dans l'alphabet de Preston Blair (A–H, X) que lit déjà le tournage.
# Lissage façon AccuLips (iClone) : une clé de moins de 40 ms rejoint sa voisine (lèvres moins mécaniques).
IPA_OCULUS = {**{c: 'aa' for c in 'aɑ'}, **{c: 'E' for c in 'eɛə'}, **{c: 'I' for c in 'iyjɥ'}, **{c: 'O' for c in 'oɔ'},
              **{c: 'U' for c in 'uøœw'}, **{c: 'PP' for c in 'pbm'}, **{c: 'SS' for c in 'szʃʒ'}, **{c: 'DD' for c in 'td'},
              **{c: 'FF' for c in 'fv'}, **{c: 'kk' for c in 'kgɡ'}, **{c: 'nn' for c in 'nlɲŋ'}, **{c: 'RR' for c in 'ʁr'}}
# Oculus → Preston Blair (formes de Rhubarb, documentation Rhubarb) : A fermée (m b p), B entrouverte (consonnes), C ouverte
# (é, è), D grande ouverte (a), E arrondie (o), F projetée (ou, u), G lèvre sur les dents (f v), H langue (l), X repos
OCULUS_BLAIR = {'aa': 'D', 'E': 'C', 'I': 'B', 'O': 'E', 'U': 'F', 'PP': 'A', 'SS': 'B', 'DD': 'B', 'FF': 'G', 'kk': 'B',
                'nn': 'H', 'RR': 'B', 'sil': 'X'}
PAUSES = set(' ^$_,.!?;:—…-|')
CLE_MIN = 0.04       # s : une clé plus courte rejoint sa voisine
REPOS_MIN = 0.12     # s : une pause plus courte garde la bouche du son précédent (pas de claquement)


def depuis_piper(ph, dur):
    """[[phonème, t0, t1], …] (voix.phonemes_piper) → repères de bouche [{'value', 'start', 'end'}] comme ceux de Rhubarb."""
    seq = []
    for p, a, b in ph:
        a, b = min(a, dur), min(b, dur)   # la queue retirée du son (voix.synth) peut laisser un « $ » au-delà de la fin
        if b <= a: continue
        if p in PAUSES: v = 'X' if b - a >= REPOS_MIN else (seq[-1][0] if seq else 'X')
        else:
            o = IPA_OCULUS.get(p)
            if o is None: v = seq[-1][0] if seq else 'X'   # signe non phonétique (accent, allongement) : son précédent
            else: v = OCULUS_BLAIR[o]
        if seq and seq[-1][0] == v and abs(seq[-1][2] - a) < 1e-3: seq[-1][2] = b   # même forme : la clé s'allonge (wordsToVisemes)
        else: seq.append([v, a, b])
    # sous-échantillonnage : les clés trop brèves rejoignent la plus longue voisine
    k = 0
    while k < len(seq) and len(seq) > 1:
        v, a, b = seq[k]
        if b - a < CLE_MIN and v != 'A':   # une fermeture m, b, p reste toujours visible
            j = k - 1 if k > 0 and (k + 1 >= len(seq) or seq[k - 1][2] - seq[k - 1][1] >= seq[k + 1][2] - seq[k + 1][1]) else k + 1
            if j < k: seq[j][2] = b
            else: seq[j][1] = a
            del seq[k]; k = max(0, k - 1); continue
        k += 1
    fus = []
    for v, a, b in seq:   # deux formes identiques qui se touchent après le sous-échantillonnage : une seule clé
        if fus and fus[-1][0] == v: fus[-1][2] = b
        else: fus.append([v, a, b])
    seq = fus
    if not seq or seq[0][1] > 0: seq.insert(0, ['X', 0.0, seq[0][1] if seq else dur])
    if seq[-1][2] < dur: seq.append(['X', seq[-1][2], dur])
    return [{'value': v, 'start': round(a, 3), 'end': round(b, 3)} for v, a, b in seq]
