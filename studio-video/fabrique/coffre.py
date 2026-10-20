# COFFRE CHIFFRÉ DE LA FABRIQUE (20/10/2026) — « Je veux qu'elle soit indépendante de la machine Claude ».
# La fabrique tourne sur les machines gratuites de GitHub (dépôt public). Tout ce qui est privé — la bibliothèque de la troupe
# (dessins, visages, décors, histoires, file de la série) et les vidéos — n'y est posé que chiffré.
# CLÉ : une PHRASE choisie par l'utilisateur, qu'il range lui-même dans les secrets du dépôt (FABRIQUE_CLE) et qu'il tape une
# fois dans l'application ; personne d'autre ne la voit, Claude non plus. Chiffrement hybride pour que la bibliothèque puisse
# être scellée SANS connaître la phrase :
#   · la fabrique GitHub crée à sa première marche une paire RSA-4096 ; la clé privée est chiffrée par la phrase
#     (PBKDF2-SHA256, 600 000 tours, puis AES-256-GCM) → cle.priv.json ; la clé publique → cle.pub.pem (publique) ;
#   · chaque fichier est scellé par une clé AES-256-GCM tirée au hasard, enveloppée par la clé publique (RSA-OAEP-SHA256) ;
#   · ouvrir = phrase → clé privée → clé du fichier → contenu. Même schéma dans l'application (WebCrypto du navigateur).
# Format scellé (.msb) : b'MSB1' | u16 longueur de l'enveloppe | enveloppe RSA | nonce (12 o) | contenu chiffré + étiquette (16 o).
# Gros ensembles : archive tar découpée en parts de PART_MO Mo, chaque part scellée à part (fichiers < 100 Mo pour GitHub).
# GREFFE : cryptography (Apache-2.0 / BSD), primitives standard ; aucune cryptographie maison.
#   python3 coffre.py cles DOSSIER                       (FABRIQUE_CLE dans l'environnement) → cle.pub.pem, cle.priv.json
#   python3 coffre.py scelle FICHIER SORTIE.msb CLE.pub.pem
#   python3 coffre.py ouvre FICHIER.msb SORTIE CLE.priv.json   (FABRIQUE_CLE)
#   python3 coffre.py scelle-dossier DOSSIER SORTIE_DIR NOM CLE.pub.pem [--exclure sous-dossier|motif]…
#   python3 coffre.py ouvre-dossier SORTIE_DIR NOM DESTINATION CLE.priv.json   (FABRIQUE_CLE)
import base64, fnmatch, hashlib, io, json, os, struct, sys, tarfile

TOURS = 600_000
PART_MO = 90
MAGIQUE = b'MSB1'


def _b64(b): return base64.b64encode(b).decode()


def cles(dossier, phrase):
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if len(phrase) < 12: raise SystemExit('phrase trop courte (12 caractères au moins)')
    k = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    der = k.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    sel, nonce = os.urandom(16), os.urandom(12)
    cle = hashlib.pbkdf2_hmac('sha256', phrase.encode(), sel, TOURS, 32)
    os.makedirs(dossier, exist_ok=True)
    json.dump({'kdf': 'PBKDF2-SHA256', 'tours': TOURS, 'sel': _b64(sel), 'nonce': _b64(nonce),
               'chiffre': _b64(AESGCM(cle).encrypt(nonce, der, None))}, open(os.path.join(dossier, 'cle.priv.json'), 'w'))
    open(os.path.join(dossier, 'cle.pub.pem'), 'wb').write(k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))


def _pub(chemin):
    from cryptography.hazmat.primitives import serialization
    return serialization.load_pem_public_key(open(chemin, 'rb').read())


def _priv(chemin, phrase):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    J = json.load(open(chemin))
    cle = hashlib.pbkdf2_hmac('sha256', phrase.encode(), base64.b64decode(J['sel']), int(J['tours']), 32)
    der = AESGCM(cle).decrypt(base64.b64decode(J['nonce']), base64.b64decode(J['chiffre']), None)
    return serialization.load_der_private_key(der, password=None)


def _oaep():
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    return padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


def scelle_octets(donnees, pub):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    k, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    env = pub.encrypt(k, _oaep())
    return MAGIQUE + struct.pack('>H', len(env)) + env + nonce + AESGCM(k).encrypt(nonce, donnees, None)


def ouvre_octets(b, priv):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if b[:4] != MAGIQUE: raise ValueError('fichier non scellé par la fabrique')
    n = struct.unpack('>H', b[4:6])[0]; env = b[6:6 + n]; nonce = b[6 + n:18 + n]
    return AESGCM(priv.decrypt(env, _oaep())).decrypt(nonce, b[18 + n:], None)


def scelle_dossier(dossier, sortie, nom, pub, exclure=()):
    """archive tar (sans compression : images et vidéos le sont déjà) découpée en parts scellées ; manifeste NOM.json."""
    os.makedirs(sortie, exist_ok=True)
    for f in os.listdir(sortie):
        if f.startswith(nom + '.') and f.endswith('.msb'): os.remove(os.path.join(sortie, f))
    tampon = io.BytesIO(); parts = []

    def vide(force=False):
        while tampon.tell() >= PART_MO * 1_000_000 or (force and tampon.tell()):
            d = tampon.getvalue(); morceau, reste = d[:PART_MO * 1_000_000], d[PART_MO * 1_000_000:]
            f = f'{nom}.{len(parts):03d}.msb'; open(os.path.join(sortie, f), 'wb').write(scelle_octets(morceau, pub))
            parts.append({'fichier': f, 'octets': len(morceau), 'sha256': hashlib.sha256(morceau).hexdigest()})
            tampon.seek(0); tampon.truncate(); tampon.write(reste)

    class Flux(io.RawIOBase):
        def writable(self): return True
        def write(self, b): tampon.write(b); vide(); return len(b)

    with tarfile.open(fileobj=Flux(), mode='w|', format=tarfile.PAX_FORMAT) as t:
        for racine, dossiers, fichiers in os.walk(dossier):
            dossiers[:] = sorted(d for d in dossiers if not any(os.path.join(racine, d).startswith(os.path.join(dossier, x)) for x in exclure))
            for f in sorted(fichiers):
                p = os.path.join(racine, f); rel = os.path.relpath(p, dossier)
                if any(fnmatch.fnmatch(rel, m) or fnmatch.fnmatch(f, m) for m in exclure if '*' in m): continue
                if os.path.isfile(p) and not os.path.islink(p): t.add(p, arcname=rel, recursive=False)
    vide(force=True)
    json.dump({'nom': nom, 'parts': parts}, open(os.path.join(sortie, f'{nom}.json'), 'w'), indent=1)
    return parts


def ouvre_dossier(sortie, nom, dest, priv):
    M = json.load(open(os.path.join(sortie, f'{nom}.json')))

    class Lecteur(io.RawIOBase):
        def __init__(self): self.i, self.buf = 0, b''
        def readable(self): return True
        def readinto(self, b):
            while not self.buf and self.i < len(M['parts']):
                p = M['parts'][self.i]; d = ouvre_octets(open(os.path.join(sortie, p['fichier']), 'rb').read(), priv)
                if hashlib.sha256(d).hexdigest() != p['sha256']: raise ValueError(f"part {p['fichier']} altérée")
                self.buf = d; self.i += 1
            n = min(len(b), len(self.buf)); b[:n] = self.buf[:n]; self.buf = self.buf[n:]; return n

    os.makedirs(dest, exist_ok=True)
    with tarfile.open(fileobj=io.BufferedReader(Lecteur(), 1 << 20), mode='r|') as t:
        t.extractall(dest, filter='data')


def _phrase():
    p = os.environ.get('FABRIQUE_CLE', '')
    if not p: raise SystemExit('FABRIQUE_CLE absente de l’environnement')
    return p


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'cles': cles(a[1], _phrase())
    elif a[0] == 'scelle': open(a[2], 'wb').write(scelle_octets(open(a[1], 'rb').read(), _pub(a[3])))
    elif a[0] == 'ouvre': open(a[2], 'wb').write(ouvre_octets(open(a[1], 'rb').read(), _priv(a[3], _phrase())))
    elif a[0] == 'scelle-dossier':   # options : --exclure motif (dossier ou motif *.mp4), répétable
        ex = [a[i + 1] for i in range(5, len(a) - 1) if a[i] == '--exclure']
        print(json.dumps(scelle_dossier(a[1], a[2], a[3], _pub(a[4]), exclure=ex), indent=1))
    elif a[0] == 'ouvre-dossier': ouvre_dossier(a[1], a[2], a[3], _priv(a[4], _phrase()))
    else: print(open(__file__, encoding='utf-8').read().split('import base64')[0])
