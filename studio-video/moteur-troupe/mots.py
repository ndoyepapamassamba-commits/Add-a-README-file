# COMPARER CE QUI EST DIT À CE QUI EST ÉCRIT (17/10/2026) — Whisper écrit « 500 » ou « 10 000 » là où le texte dit « cinq
# cents » ou « dix mille », et ne connaît pas le parler ivoirien (djê, dêh…) : sans cette normalisation, une voix parfaitement
# comprise était comptée en erreur. Chiffres → lettres (français), mots du lexique ivoirien retirés des deux côtés.
import re, unicodedata

UNITES = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
          'quatorze', 'quinze', 'seize']
DIZAINES = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'}
IVOIRIEN = {'dje', 'deh', 'eh', 'ehh', 'ehhh', 'hein', 'gbess', 'bedou', 'yafor', 'tantie', 'woro', 'gbaka', 'tch', 'tchip'}


def en_lettres(n):
    if n < 17: return UNITES[n]
    if n < 20: return 'dix ' + UNITES[n - 10]
    if n < 100:
        d, u = divmod(n, 10)
        if d in (7, 9): return ('soixante ' if d == 7 else 'quatre vingt ') + en_lettres(10 + u)
        if d == 8: return 'quatre vingts' if u == 0 else 'quatre vingt ' + UNITES[u]
        return DIZAINES[d] + ('' if u == 0 else ' et un' if u == 1 else ' ' + UNITES[u])
    if n < 1000:
        c, r = divmod(n, 100); tete = 'cent' if c == 1 else UNITES[c] + (' cents' if r == 0 else ' cent')
        return tete + ('' if r == 0 else ' ' + en_lettres(r))
    if n < 1_000_000:
        m, r = divmod(n, 1000); tete = 'mille' if m == 1 else en_lettres(m).replace('cents', 'cent') + ' mille'
        return tete + ('' if r == 0 else ' ' + en_lettres(r))
    return str(n)


def normalise(t):
    """minuscules sans accents, chiffres écrits en lettres, mots du parler ivoirien retirés → liste de mots."""
    t = re.sub(r'(\d)[   .](?=\d{3}\b)', r'\1', t)            # 10 000 / 10.000 → 10000
    t = re.sub(r'\d+', lambda m: ' ' + en_lettres(int(m.group(0))) + ' ', t)
    t = unicodedata.normalize('NFKD', t.lower()).encode('ascii', 'ignore').decode()
    return [w for w in re.sub(r"[^a-z0-9 ]", ' ', t).split() if w not in IVOIRIEN]


def erreur_mots(ref, hyp):
    r, h = normalise(ref), normalise(hyp); d = list(range(len(h) + 1))
    for i, x in enumerate(r, 1):
        p = d[:]; d[0] = i
        for j, y in enumerate(h, 1): d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (x != y))
    return d[-1] / max(1, len(r))
