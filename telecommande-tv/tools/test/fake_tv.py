"""Fausse Android TV (protocole Android TV Remote v2) pour tester le client Wi-Fi de l'appli.

- port d'appairage (6467) : PairingRequest -> Options -> Configuration -> code 6 hex -> Secret vérifié
- port télécommande (6466) : RemoteConfigure / SetActive / Start / pings, journalise les touches reçues
Les messages sont décodés avec les classes protobuf officielles d'androidtvremote2 (décodage strict).
"""
import hashlib, json, os, secrets, socket, struct, sys, threading, time
from datetime import datetime, timedelta, timezone
from OpenSSL import SSL, crypto
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from androidtvremote2 import polo_pb2
from androidtvremote2.remotemessage_pb2 import RemoteMessage

HOST = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
REMOTE_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 6466
PAIR_PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 6467
WORK = sys.argv[4] if len(sys.argv) > 4 else '.'
LOG = os.path.join(WORK, 'events.jsonl')
CODE_FILE = os.path.join(WORK, 'code.txt')
paired = set()
lock = threading.Lock()

def log(**ev):
    ev['t'] = time.time()
    with lock, open(LOG, 'a') as f:
        f.write(json.dumps(ev) + '\n')

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Fake ELACTRON Android TV')])
now = datetime.now(timezone.utc)
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(4242).not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=365))
        .sign(key, hashes.SHA256()))

def context():
    ctx = SSL.Context(SSL.TLS_SERVER_METHOD)
    ctx.use_privatekey(crypto.PKey.from_cryptography_key(key))
    ctx.use_certificate(crypto.X509.from_cryptography(cert))
    # Comme une vraie Android TV : exige un certificat client, accepte les auto-signés
    ctx.set_verify(SSL.VERIFY_PEER | SSL.VERIFY_FAIL_IF_NO_PEER_CERT, lambda *a: True)
    return ctx

def read_exact(c, n):
    buf = b''
    while len(buf) < n:
        try:
            d = c.recv(n - len(buf))
        except SSL.WantReadError:
            continue
        if not d: raise EOFError
        buf += d
    return buf

def read_msg(c):
    shift = 0; ln = 0
    while True:
        b = read_exact(c, 1)[0]
        ln |= (b & 0x7f) << shift
        if not b & 0x80: break
        shift += 7
    return read_exact(c, ln)

def varint(n):
    out = b''
    while True:
        b = n & 0x7f; n >>= 7
        if n: out += bytes([b | 0x80])
        else: return out + bytes([b])

def send(c, msg):
    data = msg.SerializeToString()
    c.sendall(varint(len(data)) + data)

def modexp(pub):
    n = pub.public_numbers()
    return bytes.fromhex('%X' % n.n), bytes.fromhex('0%X' % n.e)

def outer(**kw):
    m = polo_pb2.OuterMessage(); m.protocol_version = 2; m.status = polo_pb2.OuterMessage.Status.STATUS_OK
    return m

def handle_pair(c):
    client = c.get_peer_certificate().to_cryptography()
    fp = client.fingerprint(hashes.SHA256()).hex()
    step = 'request'
    nonce = None
    while True:
        m = polo_pb2.OuterMessage(); m.ParseFromString(read_msg(c))
        log(port='pair', recv=str(m).replace('\n', ' '))
        assert m.protocol_version == 2 and m.status == 200, 'mauvais en-tête'
        r = outer()
        if step == 'request':
            assert m.HasField('pairing_request') and m.pairing_request.service_name, m
            r.pairing_request_ack.server_name = 'Fake ELACTRON Android TV'
            step = 'options'
        elif step == 'options':
            assert m.HasField('options'), m
            enc = m.options.input_encodings[0]
            assert enc.type == 3 and enc.symbol_length == 6 and m.options.preferred_role == 1, m
            e = r.options.input_encodings.add(); e.type = 3; e.symbol_length = 6
            r.options.preferred_role = 1
            step = 'config'
        elif step == 'config':
            assert m.HasField('configuration'), m
            assert m.configuration.encoding.type == 3 and m.configuration.encoding.symbol_length == 6
            assert m.configuration.client_role == 1
            r.configuration_ack.SetInParent()
            nonce = secrets.token_bytes(2)
            cm, ce = modexp(client.public_key()); sm, se = modexp(cert.public_key())
            expected = hashlib.sha256(cm + ce + sm + se + nonce).digest()
            code = '%02X%s' % (expected[0], nonce.hex().upper())
            open(CODE_FILE, 'w').write(code)
            log(port='pair', code=code)
            step = 'secret'
        elif step == 'secret':
            assert m.HasField('secret'), m
            if m.secret.secret != expected:
                r.status = polo_pb2.OuterMessage.Status.STATUS_BAD_SECRET
                send(c, r); log(port='pair', result='bad_secret'); return
            r.secret_ack.secret = expected
            paired.add(fp)
            send(c, r); log(port='pair', result='paired', client=fp); return
        send(c, r)

def handle_remote(c):
    client = c.get_peer_certificate().to_cryptography()
    fp = client.fingerprint(hashes.SHA256()).hex()
    if fp not in paired:
        log(port='remote', result='refused_not_paired'); return
    r = RemoteMessage()
    r.remote_configure.code1 = 622
    r.remote_configure.device_info.model = 'TS43D31AS'; r.remote_configure.device_info.vendor = 'ELACTRON'
    r.remote_configure.device_info.unknown1 = 1; r.remote_configure.device_info.unknown2 = '1'
    r.remote_configure.device_info.package_name = 'com.google.android.tv.remote.service'
    r.remote_configure.device_info.app_version = '5.2.473254133'
    send(c, r)
    m = RemoteMessage(); m.ParseFromString(read_msg(c))
    assert m.HasField('remote_configure') and m.remote_configure.code1 & 2, m
    log(port='remote', recv='configure', features=m.remote_configure.code1, device=str(m.remote_configure.device_info).replace('\n', ' '))
    r = RemoteMessage(); r.remote_set_active.SetInParent(); send(c, r)
    m = RemoteMessage(); m.ParseFromString(read_msg(c))
    assert m.HasField('remote_set_active'), m
    log(port='remote', recv='set_active', active=m.remote_set_active.active)
    r = RemoteMessage(); r.remote_start.started = True; send(c, r)
    r = RemoteMessage(); r.remote_set_volume_level.volume_max = 100; r.remote_set_volume_level.volume_level = 20; send(c, r)
    ping = [0]
    def pinger():
        while True:
            time.sleep(1.0)
            ping[0] += 1
            p = RemoteMessage(); p.remote_ping_request.val1 = ping[0]; p.remote_ping_request.val2 = 0
            try: send(c, p)
            except Exception: return
    threading.Thread(target=pinger, daemon=True).start()
    while True:
        m = RemoteMessage(); m.ParseFromString(read_msg(c))
        if m.HasField('remote_ping_response'):
            log(port='remote', recv='pong', val1=m.remote_ping_response.val1)
        elif m.HasField('remote_key_inject'):
            log(port='remote', recv='key', key=m.remote_key_inject.key_code, direction=m.remote_key_inject.direction)
        elif m.HasField('remote_app_link_launch_request'):
            log(port='remote', recv='app', link=m.remote_app_link_launch_request.app_link)
        else:
            log(port='remote', recv='other', msg=str(m).replace('\n', ' '))

def serve(port, handler):
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, port)); s.listen(8)
    while True:
        raw, addr = s.accept()
        def run(raw=raw):
            c = SSL.Connection(context(), raw); c.set_accept_state()
            try:
                c.do_handshake(); handler(c)
            except EOFError:
                log(port=port, result='closed_by_client')
            except Exception as e:
                log(port=port, error=repr(e))
            finally:
                try: c.shutdown()
                except Exception: pass
                raw.close()
        threading.Thread(target=run, daemon=True).start()

open(LOG, 'w').close()
threading.Thread(target=serve, args=(PAIR_PORT, handle_pair), daemon=True).start()
threading.Thread(target=serve, args=(REMOTE_PORT, handle_remote), daemon=True).start()
print('fake tv ready', flush=True)
while True: time.sleep(3600)
