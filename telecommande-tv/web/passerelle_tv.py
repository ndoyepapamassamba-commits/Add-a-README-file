#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Passerelle Wi-Fi de « Télécommande TV ».

Un navigateur web n'a pas le droit d'ouvrir la connexion TLS à certificat client qu'exige une
Android TV / Google TV (protocole « Android TV Remote v2 », celui de l'appli Google TV).
Ce petit programme tourne sur un ordinateur du même Wi-Fi et fait l'intermédiaire :

    téléphone / ordinateur (page web)  --HTTP-->  passerelle  --TLS 6466/6467-->  télé

Il sert aussi la page TelecommandeTV.html et un relais vidéo pour les chaînes IPTV que le
navigateur refuse de lire directement (CORS, en-têtes Referer / User-Agent).

Aucune installation à part Python 3.7+ : seulement la bibliothèque standard.
Lancement :  python3 passerelle_tv.py   (Windows : double-clic sur Lancer-passerelle-Windows.bat)
"""
import base64
import hashlib
import ipaddress
import json
import os
import re
import secrets
import socket
import ssl
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = '3.0'
CLIENT_NAME = 'Telecommande TV'
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = 'TelecommandeTV.html'
CONF_DIR = os.environ.get('TELECOMMANDE_DIR') or os.path.join(os.path.expanduser('~'), '.telecommande-tv')
# Pour les tests : autres ports que ceux de la télé, hôtes à ajouter au balayage, relais vers le réseau local
_ports = os.environ.get('TELECOMMANDE_TV_PORTS', '6466,6467').split(',')
REMOTE_PORT, PAIR_PORT = int(_ports[0]), int(_ports[1])
SCAN_EXTRA = [h for h in os.environ.get('TELECOMMANDE_SCAN_EXTRA', '').split(',') if h]
PROXY_LOCAL = os.environ.get('TELECOMMANDE_PROXY_LOCAL') == '1'

FEATURES = 1 | 2 | 32 | 64 | 512  # ping, touches, marche/arrêt, volume, liens d'applis
STATUS_OK = 200
DIRECTION_SHORT = 3


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ---------------------------------------------------------------- DER / RSA (sans dépendance)

def der(tag, content):
    n = len(content)
    if n < 0x80:
        head = bytes([tag, n])
    else:
        ln = n.to_bytes((n.bit_length() + 7) // 8, 'big')
        head = bytes([tag, 0x80 | len(ln)]) + ln
    return head + content


def der_int(v):
    return der(0x02, v.to_bytes(v.bit_length() // 8 + 1, 'big'))


def der_children(buf):
    """Éléments (tag, contenu) d'une séquence DER."""
    out, i = [], 0
    while i < len(buf):
        tag, ln = buf[i], buf[i + 1]
        i += 2
        if ln & 0x80:
            k = ln & 0x7F
            ln = int.from_bytes(buf[i:i + k], 'big')
            i += k
        out.append((tag, buf[i:i + ln]))
        i += ln
    return out


def cert_public_key(cert_der):
    """(module, exposant) RSA d'un certificat X.509."""
    tbs = der_children(der_children(der_children(cert_der)[0][1])[0][1])
    if tbs[0][0] == 0xA0:  # version explicite
        tbs = tbs[1:]
    spki = der_children(tbs[5][1])
    bits = spki[1][1][1:]  # BIT STRING : premier octet = bits inutilisés
    n, e = der_children(der_children(bits)[0][1])
    return int.from_bytes(n[1], 'big'), int.from_bytes(e[1], 'big')


def _small_primes(limit=2000):
    sieve = bytearray([1]) * limit
    sieve[0:2] = b'\0\0'
    for i in range(2, int(limit ** 0.5) + 1):
        if sieve[i]:
            sieve[i * i::i] = bytearray(len(sieve[i * i::i]))
    return [i for i in range(limit) if sieve[i]]


SMALL_PRIMES = _small_primes()


def _probable_prime(n, rounds=40):
    for p in SMALL_PRIMES:
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for _ in range(rounds):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _prime(bits, e):
    while True:
        n = secrets.randbits(bits) | (3 << (bits - 2)) | 1
        if (n - 1) % e and _probable_prime(n):
            return n


def _inverse(a, m):
    r0, r1, s0, s1 = m, a % m, 0, 1
    while r1:
        q = r0 // r1
        r0, r1, s0, s1 = r1, r0 - q * r1, s1, s0 - q * s1
    return s0 % m


SHA256_RSA = der(0x30, der(0x06, bytes.fromhex('2a864886f70d01010b')) + der(0x05, b''))
RSA_ENCRYPTION = der(0x30, der(0x06, bytes.fromhex('2a864886f70d010101')) + der(0x05, b''))
SHA256_DIGEST_INFO = bytes.fromhex('3031300d060960864801650304020105000420')


def make_identity(common_name):
    """Clé RSA 2048 et certificat auto-signé (PEM), comme l'appli Google TV."""
    e = 65537
    while True:
        p, q = _prime(1024, e), _prime(1024, e)
        n = p * q
        if p != q and n.bit_length() == 2048:
            break
    d = _inverse(e, (p - 1) * (q - 1))
    key = der(0x30, der_int(0) + der_int(n) + der_int(e) + der_int(d) + der_int(p) + der_int(q)
              + der_int(d % (p - 1)) + der_int(d % (q - 1)) + der_int(_inverse(q, p)))
    name = der(0x30, der(0x31, der(0x30, der(0x06, b'\x55\x04\x03') + der(0x0C, common_name.encode()))))
    now = time.time()
    utc = lambda t: der(0x17, time.strftime('%y%m%d%H%M%SZ', time.gmtime(t)).encode())
    validity = der(0x30, utc(now - 86400) + utc(now + 20 * 365 * 86400))
    spki = der(0x30, RSA_ENCRYPTION + der(0x03, b'\0' + der(0x30, der_int(n) + der_int(e))))
    tbs = der(0x30, der(0xA0, der_int(2)) + der_int(int(now)) + SHA256_RSA + name + validity + name + spki)
    k = 256
    t = SHA256_DIGEST_INFO + hashlib.sha256(tbs).digest()
    em = b'\0\1' + b'\xff' * (k - len(t) - 3) + b'\0' + t
    sig = pow(int.from_bytes(em, 'big'), d, n).to_bytes(k, 'big')
    cert = der(0x30, tbs + SHA256_RSA + der(0x03, b'\0' + sig))
    return pem('RSA PRIVATE KEY', key), pem('CERTIFICATE', cert)


def pem(label, data):
    b = base64.b64encode(data).decode()
    lines = '\n'.join(b[i:i + 64] for i in range(0, len(b), 64))
    return '-----BEGIN %s-----\n%s\n-----END %s-----\n' % (label, lines, label)


def unpem(text):
    return base64.b64decode(''.join(l for l in text.splitlines() if l and not l.startswith('-----')))


# ---------------------------------------------------------------- protobuf minimal

def varint(v):
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


class PB:
    def __init__(self):
        self.b = bytearray()

    def v(self, field, value):
        self.b += varint(field << 3) + varint(value)
        return self

    def s(self, field, data):
        if isinstance(data, str):
            data = data.encode()
        self.b += varint(field << 3 | 2) + varint(len(data)) + data
        return self

    def m(self, field, msg):
        return self.s(field, bytes(msg.b))

    def out(self):
        return bytes(self.b)


def _read_varint(buf, i):
    v = shift = 0
    while True:
        if i >= len(buf):
            raise ValueError('varint tronqué')
        b = buf[i]
        i += 1
        v |= (b & 0x7F) << shift
        if not b & 0x80:
            return v, i
        shift += 7


def fields(buf):
    """Liste (numéro, valeur) : entier pour un varint, octets pour un champ délimité."""
    out, i = [], 0
    while i < len(buf):
        key, i = _read_varint(buf, i)
        wire = key & 7
        if wire == 0:
            val, i = _read_varint(buf, i)
        elif wire == 2:
            ln, i = _read_varint(buf, i)
            if i + ln > len(buf):
                raise ValueError('message tronqué')
            val, i = buf[i:i + ln], i + ln
        elif wire == 1:
            val, i = None, i + 8
        elif wire == 5:
            val, i = None, i + 4
        else:
            raise ValueError('type protobuf inconnu')
        out.append((key >> 3, val))
    return out


def field(buf, num, default=None):
    for f, v in fields(buf):
        if f == num:
            return v
    return default


def write_frame(sock, msg):
    sock.sendall(varint(len(msg)) + msg)


def read_frame(sock):
    ln = shift = 0
    while True:
        b = _recv(sock, 1)[0]
        ln |= (b & 0x7F) << shift
        if not b & 0x80:
            break
        shift += 7
        if shift > 28:
            raise IOError('longueur de message invalide')
    if ln > 1 << 20:
        raise IOError('message trop long')
    return _recv(sock, ln)


def _recv(sock, n):
    buf = b''
    while len(buf) < n:
        d = sock.recv(n - len(buf))
        if not d:
            raise IOError('connexion fermée par la télé')
        buf += d
    return buf


# ---------------------------------------------------------------- Android TV Remote v2

class Identity:
    def __init__(self, directory):
        self.cert = os.path.join(directory, 'cert.pem')
        self.key = os.path.join(directory, 'key.pem')
        if not (os.path.exists(self.cert) and os.path.exists(self.key)):
            log('Création de l\'identité de la télécommande (une seule fois)…')
            key, cert = make_identity(CLIENT_NAME)
            os.makedirs(directory, exist_ok=True)
            with open(self.key, 'w') as f:
                f.write(key)
            try:
                os.chmod(self.key, 0o600)
            except OSError:
                pass
            with open(self.cert, 'w') as f:
                f.write(cert)
        with open(self.cert) as f:
            self.public = cert_public_key(unpem(f.read()))

    def context(self):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # certificat de la télé auto-signé ; le code d'appairage protège
        try:
            ctx.set_ciphers('DEFAULT:@SECLEVEL=1')  # vieilles télés
        except ssl.SSLError:
            pass
        ctx.load_cert_chain(self.cert, self.key)
        return ctx


def open_tls(ident, host, port, timeout=5):
    raw = socket.create_connection((host, port), timeout=timeout)
    raw.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    try:
        return ident.context().wrap_socket(raw)
    except Exception:
        raw.close()
        raise


def unsigned(v):
    return v.to_bytes((v.bit_length() + 7) // 8, 'big')


def outer(num, inner):
    return PB().v(1, 2).v(2, STATUS_OK).m(num, inner).out()


class Pairing:
    """Appairage : start() fait afficher un code sur la télé, finish(code) le valide."""

    def __init__(self, ident, host):
        self.ident = ident
        self.sock = open_tls(ident, host, PAIR_PORT)
        self.tv_name = ''

    def _exchange(self, msg, expected):
        write_frame(self.sock, msg)
        status, found = 0, None
        for f, v in fields(read_frame(self.sock)):
            if f == 2:
                status = v
            if f == expected:
                found = v
        if status != STATUS_OK or found is None:
            raise IOError('la télé a refusé l\'appairage (statut %s)' % status)
        return found

    def start(self):
        ack = self._exchange(outer(10, PB().s(1, 'atvremote').s(2, CLIENT_NAME)), 11)
        name = field(ack, 1, b'')
        self.tv_name = name.decode('utf-8', 'replace') if isinstance(name, bytes) else ''
        enc = PB().v(1, 3).v(2, 6)  # hexadécimal, 6 caractères
        self._exchange(outer(20, PB().m(1, enc).v(3, 1)), 20)
        self._exchange(outer(30, PB().m(1, enc).v(2, 1)), 31)

    def finish(self, code):
        code = code.strip().upper()
        if not re.fullmatch(r'[0-9A-F]{6}', code):
            return 'bad'
        cn, ce = self.ident.public
        sn, se = cert_public_key(self.sock.getpeercert(binary_form=True))
        h = hashlib.sha256(unsigned(cn) + unsigned(ce) + unsigned(sn) + unsigned(se)
                           + bytes.fromhex(code[2:])).digest()
        if h[0] != int(code[:2], 16):
            return 'bad'  # faute de frappe : la session reste ouverte, on peut retaper
        write_frame(self.sock, outer(40, PB().s(1, h)))
        reply = fields(read_frame(self.sock))
        self.close()
        ok = any(f == 2 and v == STATUS_OK for f, v in reply) and any(f == 41 for f, v in reply)
        return 'ok' if ok else 'refused'

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


class TvLink:
    """Session télécommande (port 6466) : touches, liens d'applis, volume signalé par la télé."""

    def __init__(self, ident):
        self.ident = ident
        self.sock = None
        self.lock = threading.Lock()  # écriture
        self.conn_lock = threading.Lock()  # une seule (re)connexion à la fois
        self.features = FEATURES
        self.tv_name = ''
        self.volume = None
        self.host = None

    def connected(self):
        return self.sock is not None

    def connect(self, host):
        with self.conn_lock:
            if self.sock is not None and self.host == host:
                return
            self.disconnect()
            s = open_tls(self.ident, host, REMOTE_PORT)
            ready = threading.Event()
            self.sock, self.host = s, host
            threading.Thread(target=self._reader, args=(s, ready), daemon=True).start()
            if not ready.wait(5) or self.sock is not s:
                self._drop(s)
                raise IOError('la télé ne répond pas (appairage à refaire ?)')
            s.settimeout(None)

    def _reader(self, s, ready):
        try:
            s.settimeout(None)
            while True:
                self._handle(s, read_frame(s), ready)
        except Exception as e:  # noqa: BLE001 — toute erreur coupe la session
            if self.sock is s:
                log('Télé déconnectée :', e)
        finally:
            self._drop(s)
            ready.set()

    def _handle(self, s, msg, ready):
        for f, v in fields(msg):
            if f == 1:  # remote_configure : la télé annonce ses fonctions
                tv_features = field(v, 1, FEATURES)
                info = field(v, 2)
                if isinstance(info, bytes):
                    model = field(info, 1, b'')
                    vendor = field(info, 2, b'')
                    self.tv_name = (vendor.decode('utf-8', 'replace') + ' ' + model.decode('utf-8', 'replace')).strip()
                self.features = FEATURES & tv_features
                me = PB().s(1, CLIENT_NAME).s(2, CLIENT_NAME).v(3, 1).s(4, '1').s(5, 'atvremote').s(6, VERSION)
                self._write(s, PB().m(1, PB().v(1, self.features).m(2, me)).out())
            elif f == 2:  # remote_set_active
                self._write(s, PB().m(2, PB().v(1, self.features)).out())
                ready.set()
            elif f == 8:  # ping
                self._write(s, PB().m(9, PB().v(1, field(v, 1, 0))).out())
            elif f == 40:  # remote_start
                ready.set()
            elif f == 50:  # volume
                self.volume = {'level': field(v, 7, 0), 'max': field(v, 6, 0), 'muted': bool(field(v, 8, 0))}

    def _write(self, s, data):
        with self.lock:
            write_frame(s, data)

    def send(self, data):
        s = self.sock
        if s is None:
            raise IOError('pas connecté')
        try:
            self._write(s, data)
        except OSError:
            self._drop(s)
            raise

    def key(self, code):
        self.send(PB().m(10, PB().v(1, code).v(2, DIRECTION_SHORT)).out())

    def app(self, link):
        self.send(PB().m(90, PB().s(1, link)).out())

    def _drop(self, s):
        if self.sock is s:
            self.sock = None
        try:
            s.close()
        except OSError:
            pass

    def disconnect(self):
        if self.sock is not None:
            self._drop(self.sock)


# ---------------------------------------------------------------- recherche des télés

_ips_cache = [0.0, []]


def local_ips():
    """Adresses IPv4 de l'ordinateur, celle de la route principale (le Wi-Fi, en général) en premier."""
    if time.time() - _ips_cache[0] < 30:
        return _ips_cache[1]
    ips = []
    try:
        u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        u.connect(('10.255.255.255', 1))  # aucun paquet envoyé : choisit juste l'interface
        ips.append(u.getsockname()[0])
        u.close()
    except OSError:
        pass
    try:
        ips += sorted(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    seen = set()
    ips = [ip for ip in ips if not (ip in seen or seen.add(ip)) and not ip.startswith(('127.', '169.254.', '0.'))]
    _ips_cache[:] = [time.time(), ips]
    return ips


def _port_open(host, port, timeout=0.7):
    try:
        socket.create_connection((host, port), timeout=timeout).close()
        return True
    except OSError:
        return False


def _dns_name(buf, i):
    labels, jumped, end = [], False, i
    for _ in range(64):
        ln = buf[i]
        if ln == 0:
            i += 1
            break
        if ln & 0xC0 == 0xC0:
            if not jumped:
                end = i + 2
            i = ((ln & 0x3F) << 8) | buf[i + 1]
            jumped = True
            continue
        labels.append(buf[i + 1:i + 1 + ln].decode('utf-8', 'replace'))
        i += 1 + ln
    return labels, (end if jumped else i)


def mdns_names(timeout=2.5):
    """Noms annoncés en mDNS (_androidtvremote2._tcp) : {ip: nom}."""
    service = '_androidtvremote2._tcp.local'
    q = struct.pack('>HHHHHH', 0, 0, 1, 0, 0, 0)
    q += b''.join(bytes([len(p)]) + p.encode() for p in service.split('.')) + b'\0'
    q += struct.pack('>HH', 12, 0x8001)  # PTR, réponse en unicast
    found = {}
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        s.bind(('', 0))
        for ip in local_ips() or ['']:
            try:
                if ip:
                    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip))
                s.sendto(q, ('224.0.0.251', 5353))
            except OSError:
                pass
    except OSError:
        return found
    end = time.time() + timeout
    while time.time() < end:
        try:
            data, addr = s.recvfrom(9000)
        except socket.timeout:
            continue
        except OSError:
            break
        try:
            qd, an, ns, ar = struct.unpack('>HHHH', data[4:12])
            i = 12
            for _ in range(qd):
                _, i = _dns_name(data, i)
                i += 4
            for _ in range(an + ns + ar):
                labels, i = _dns_name(data, i)
                rtype, _, _, rdlen = struct.unpack('>HHIH', data[i:i + 10])
                i += 10
                if rtype == 12 and '.'.join(labels).lower() == service:
                    target, _ = _dns_name(data, i)
                    if target:
                        found[addr[0]] = target[0]
                i += rdlen
        except (IndexError, struct.error, ValueError):
            continue
    s.close()
    return found


def scan_tvs():
    """Télés du réseau local qui écoutent sur le port de la télécommande Android TV."""
    hosts = list(SCAN_EXTRA)
    mine = local_ips()
    for ip in mine:
        base = ip.rsplit('.', 1)[0]
        hosts += ['%s.%d' % (base, i) for i in range(1, 255) if '%s.%d' % (base, i) != ip]
    with ThreadPoolExecutor(max_workers=2) as two:
        names_f = two.submit(mdns_names)
        with ThreadPoolExecutor(max_workers=64) as pool:
            open_hosts = [h for h, ok in zip(hosts, pool.map(lambda h: _port_open(h, REMOTE_PORT), hosts)) if ok]
        names = names_f.result()
    result, seen = [], set()
    for h in open_hosts + [h for h in names if h not in open_hosts]:
        if h in seen:
            continue
        seen.add(h)
        result.append({'host': h, 'name': names.get(h) or 'Télé Android (%s)' % h})
    return result


# ---------------------------------------------------------------- état de la passerelle

class Bridge:
    def __init__(self):
        self.conf_path = os.path.join(CONF_DIR, 'config.json')
        self.conf = {}
        try:
            with open(self.conf_path) as f:
                self.conf = json.load(f)
        except (OSError, ValueError):
            pass
        self.ident = None
        self.link = None
        self.pairing = None
        self.pairing_host = None
        self.pairing_name = ''
        self.lock = threading.Lock()
        self.error = ''

    def _identity(self):
        if self.ident is None:
            self.ident = Identity(CONF_DIR)
            self.link = TvLink(self.ident)
        return self.ident

    def save(self):
        os.makedirs(CONF_DIR, exist_ok=True)
        with open(self.conf_path, 'w') as f:
            json.dump(self.conf, f, indent=1)

    def state(self):
        link = self.link
        return {
            'bridge': VERSION,
            'paired': bool(self.conf.get('host')),
            'host': self.conf.get('host'),
            'name': (link.tv_name if link and link.tv_name else '') or self.conf.get('name') or '',
            'connected': bool(link and link.connected()),
            'volume': link.volume if link else None,
            'pairing': self.pairing is not None,
            'error': self.error,
            'urls': ['http://%s:%d/' % (ip, HTTP_PORT[0]) for ip in local_ips()],
        }

    def ensure_connected(self):
        host = self.conf.get('host')
        if not host:
            raise IOError('aucune télé appairée')
        self._identity()
        if not self.link.connected():
            self.link.connect(host)
            log('Connecté à la télé', host, self.link.tv_name)
        self.error = ''

    def press(self, action):
        for attempt in range(2):
            try:
                self.ensure_connected()
                action(self.link)
                return
            except OSError as e:
                self.error = str(e) or 'télé injoignable'
                if self.link:
                    self.link.disconnect()
                if attempt:
                    raise

    def pair_start(self, host, name):
        with self.lock:
            if self.pairing:
                self.pairing.close()
                self.pairing = None
            ident = self._identity()
            # Déjà appairée avec cette télé ? On essaie d'abord de se connecter.
            try:
                self.link.disconnect()
                self.link.connect(host)
                self.conf.update(host=host, name=name or self.link.tv_name)
                self.save()
                return 'connected'
            except OSError:
                self.link.disconnect()
            p = Pairing(ident, host)
            try:
                p.start()
            except Exception:
                p.close()
                raise
            self.pairing, self.pairing_host = p, host
            self.pairing_name = name or p.tv_name
            return 'code'

    def pair_finish(self, code):
        with self.lock:
            p = self.pairing
            if p is None:
                raise IOError('appairage expiré, recommence')
            try:
                result = p.finish(code)
            except Exception:
                self.pairing = None
                p.close()
                raise
            if result != 'ok':
                if result == 'refused':
                    self.pairing = None  # la télé a fermé la session : il faut un nouveau code
                return result
            self.pairing = None
            self.conf.update(host=self.pairing_host, name=self.pairing_name)
            self.save()
        time.sleep(0.5)  # la télé enregistre le certificat
        try:
            self.press(lambda l: None)
        except OSError:
            pass  # appairé ; la connexion sera retentée au prochain appui
        return 'ok'

    def forget(self):
        with self.lock:
            if self.link:
                self.link.disconnect()
            self.conf.pop('host', None)
            self.conf.pop('name', None)
            self.save()


BRIDGE = Bridge()
HTTP_PORT = [8765]


# ---------------------------------------------------------------- relais vidéo (IPTV)

UA_DEFAULT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
_insecure = ssl.create_default_context()
_insecure.check_hostname = False
_insecure.verify_mode = ssl.CERT_NONE


class _PublicRedirects(urllib.request.HTTPRedirectHandler):
    """Le relais ne suit pas une redirection vers le réseau local."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not public_url(newurl):
            raise urllib.error.HTTPError(newurl, 403, 'redirection refusée', headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_PublicRedirects)
_INSECURE_OPENER = urllib.request.build_opener(_PublicRedirects, urllib.request.HTTPSHandler(context=_insecure))


def public_url(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.hostname:
        return False
    if PROXY_LOCAL:
        return True
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == 'https' else 80))
    except OSError:
        return True  # l'erreur DNS sera signalée par la requête
    return all(ipaddress.ip_address(i[4][0].split('%')[0]).is_global for i in infos)


def fetch(url, ref=None, ua=None, rng=None, timeout=15):
    headers = {'User-Agent': ua or UA_DEFAULT, 'Accept': '*/*'}
    if ref:
        headers['Referer'] = ref
        o = urllib.parse.urlsplit(ref)
        if o.scheme and o.netloc:
            headers['Origin'] = '%s://%s' % (o.scheme, o.netloc)
    if rng:
        headers['Range'] = rng
    req = urllib.request.Request(url, headers=headers)
    try:
        return _OPENER.open(req, timeout=timeout)
    except urllib.error.URLError as e:
        # Python sans certificats racine (macOS) ou site au certificat expiré : la vidéo n'est pas secrète
        if isinstance(getattr(e, 'reason', None), ssl.SSLError):
            return _INSECURE_OPENER.open(req, timeout=timeout)
        raise


def proxy_link(url, ref, ua):
    q = {'u': url}
    if ref:
        q['r'] = ref
    if ua:
        q['ua'] = ua
    return '/proxy?' + urllib.parse.urlencode(q)


def rewrite_playlist(text, base, ref, ua):
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            out.append('')
        elif s.startswith('#'):
            out.append(re.sub(r'URI="([^"]+)"', lambda m: 'URI="%s"' % proxy_link(
                urllib.parse.urljoin(base, m.group(1)), ref, ua), s))
        else:
            out.append(proxy_link(urllib.parse.urljoin(base, s), ref, ua))
    return '\n'.join(out) + '\n'


def is_playlist(url, ctype, head):
    return 'mpegurl' in (ctype or '').lower() or head.lstrip(b'\xef\xbb\xbf \r\n').startswith(b'#EXTM3U') \
        or urllib.parse.urlsplit(url).path.lower().endswith(('.m3u8', '.m3u'))


# ---------------------------------------------------------------- serveur HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = 'TelecommandeTV/' + VERSION
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, body, ctype='application/json; charset=utf-8', extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        try:
            if url.path in ('/', '/index.html', '/' + PAGE):
                return self.page()
            if url.path == '/api/state':
                return self.reply(200, BRIDGE.state())
            if url.path == '/proxy':
                return self.proxy(q.get('u', ''), q.get('r'), q.get('ua'))
            if url.path == '/api/probe':
                return self.probe(q.get('u', ''), q.get('r'), q.get('ua'))
            self.reply(404, {'error': 'introuvable'})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        # JSON obligatoire : un autre site ne peut pas l'envoyer sans autorisation (CORS)
        if 'application/json' not in (self.headers.get('Content-Type') or ''):
            return self.reply(415, {'error': 'JSON attendu'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            data = json.loads(self.rfile.read(n) or b'{}') if n else {}
        except ValueError:
            return self.reply(400, {'error': 'requête illisible'})
        try:
            if path == '/api/scan':
                return self.reply(200, {'tvs': scan_tvs()})
            if path == '/api/pair':
                host = str(data.get('host', '')).strip()
                if not host:
                    return self.reply(400, {'error': 'adresse manquante'})
                status = BRIDGE.pair_start(host, str(data.get('name', '')))
                return self.reply(200, {'status': status, 'state': BRIDGE.state()})
            if path == '/api/code':
                result = BRIDGE.pair_finish(str(data.get('code', '')))
                return self.reply(200, {'ok': result == 'ok', 'result': result, 'state': BRIDGE.state()})
            if path == '/api/key':
                code = int(data.get('code'))
                BRIDGE.press(lambda l: l.key(code))
                return self.reply(200, {'ok': True})
            if path == '/api/app':
                link = str(data.get('link', ''))
                BRIDGE.press(lambda l: l.app(link))
                return self.reply(200, {'ok': True})
            if path == '/api/connect':
                BRIDGE.press(lambda l: None)
                return self.reply(200, {'ok': True, 'state': BRIDGE.state()})
            if path == '/api/forget':
                BRIDGE.forget()
                return self.reply(200, {'ok': True, 'state': BRIDGE.state()})
            self.reply(404, {'error': 'introuvable'})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except (OSError, ValueError, TypeError) as e:
            msg = str(e) or e.__class__.__name__
            if isinstance(e, (socket.timeout, ConnectionRefusedError)) or 'timed out' in msg:
                msg = 'la télé ne répond pas (allumée ? même Wi-Fi ?)'
            BRIDGE.error = msg
            self.reply(502, {'error': msg, 'state': BRIDGE.state()})
        except Exception as e:  # noqa: BLE001 — réponse lisible plutôt qu'une connexion coupée
            log('Erreur :', repr(e))
            self.reply(500, {'error': 'erreur interne : %s' % e, 'state': BRIDGE.state()})

    def page(self):
        for d in (HERE, os.getcwd()):
            p = os.path.join(d, PAGE)
            if os.path.exists(p):
                with open(p, 'rb') as f:
                    return self.reply(200, f.read(), 'text/html; charset=utf-8')
        self.reply(404, '<meta charset="utf-8"><p>Mets <b>%s</b> dans le même dossier que la passerelle.' % PAGE,
                   'text/html; charset=utf-8')

    def probe(self, url, ref, ua):
        if not public_url(url):
            return self.reply(400, {'ok': False, 'error': 'adresse refusée'})
        try:
            r = fetch(url, ref, ua, timeout=8)
            head = r.read(4096)
            r.close()
            return self.reply(200, {'ok': 200 <= r.status < 400, 'status': r.status,
                                    'playlist': is_playlist(r.geturl(), r.headers.get('Content-Type'), head)})
        except urllib.error.HTTPError as e:
            return self.reply(200, {'ok': False, 'status': e.code})
        except Exception as e:  # noqa: BLE001
            return self.reply(200, {'ok': False, 'status': 0, 'error': str(e)[:200]})

    def proxy(self, url, ref, ua):
        if not public_url(url):
            return self.reply(400, {'error': 'adresse refusée'})
        try:
            r = fetch(url, ref, ua, rng=self.headers.get('Range'))
        except urllib.error.HTTPError as e:
            return self.reply(e.code, b'', 'text/plain')
        except Exception as e:  # noqa: BLE001
            return self.reply(502, str(e)[:200], 'text/plain; charset=utf-8')
        with r:
            ctype = r.headers.get('Content-Type') or 'application/octet-stream'
            length = r.headers.get('Content-Length')
            head = r.read(64 * 1024) if not length or int(length) < 4 * 1024 * 1024 else b''
            if head and is_playlist(r.geturl(), ctype, head):
                text = (head + r.read(2 * 1024 * 1024)).decode('utf-8', 'replace')
                return self.reply(200, rewrite_playlist(text, r.geturl(), ref, ua), 'application/vnd.apple.mpegurl')
            self.send_response(r.status)
            self.send_header('Content-Type', ctype)
            for h in ('Content-Range', 'Accept-Ranges'):
                if r.headers.get(h):
                    self.send_header(h, r.headers[h])
            if length:
                self.send_header('Content-Length', length)
            else:
                self.send_header('Connection', 'close')
                self.close_connection = True
            self.end_headers()
            self.wfile.write(head)
            while True:
                chunk = r.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)


class Server(ThreadingHTTPServer):
    allow_reuse_address = os.name != 'nt'  # sous Windows, réutiliser l'adresse volerait le port d'un autre
    daemon_threads = True

    def handle_error(self, request, client_address):
        e = sys.exc_info()[1]
        if not isinstance(e, (ConnectionError, socket.timeout)):  # le navigateur coupe souvent : normal
            log('Erreur :', repr(e))


def main():
    try:
        sys.stdout.reconfigure(errors='replace')
    except (AttributeError, ValueError):
        pass
    args = sys.argv[1:]
    port = int(args[args.index('--port') + 1]) if '--port' in args else 8765
    server = None
    for p in range(port, port + 10):
        try:
            server = Server(('0.0.0.0', p), Handler)
            break
        except OSError:
            continue
    if server is None:
        print('Impossible d\'ouvrir un port entre %d et %d.' % (port, port + 9))
        sys.exit(1)
    HTTP_PORT[0] = server.server_address[1]
    local = 'http://localhost:%d/' % HTTP_PORT[0]
    print('=' * 60)
    print(' Télécommande TV — passerelle Wi-Fi', VERSION)
    print('=' * 60)
    print(' Sur cet ordinateur :', local)
    for ip in local_ips():
        print(' Sur le téléphone (même Wi-Fi) : http://%s:%d/' % (ip, HTTP_PORT[0]))
    print()
    print(' Laisse cette fenêtre ouverte pendant que tu utilises la télécommande.')
    print(' Si Windows demande l\'autorisation du pare-feu : coche « Réseaux privés » et Autoriser.')
    print(' Pour arrêter : ferme la fenêtre ou Ctrl+C.')
    print('=' * 60, flush=True)
    if '--no-browser' not in args:
        threading.Timer(0.8, lambda: webbrowser.open(local)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('Passerelle arrêtée.')


if __name__ == '__main__':
    main()
