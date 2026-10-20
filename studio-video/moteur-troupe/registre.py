# REGISTRE ANTI-RÉPÉTITION (production en série) : chaque réplique écrite est normalisée et gardée ; une réplique déjà
# utilisée dans une vidéo précédente est refusée avant la voix et le tournage.
# python3 registre.py histoire.json registre-repliques.json <id_video>   → ajoute, ou s'arrête sur une répétition
import hashlib, json, os, re, sys, unicodedata
norm = lambda s: re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9 ]", ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())).strip()
H = json.load(open(sys.argv[1])); rp = sys.argv[2]; vid = sys.argv[3]
reg = json.load(open(rp)) if os.path.exists(rp) else {}
dup = []
for S in H['sketchs']:
    for L in S['repliques']:
        k = hashlib.sha1(norm(L['texte']).encode()).hexdigest()[:12]
        if k in reg and reg[k]['video'] != vid and len(norm(L['texte']).split()) > 2: dup.append((L['texte'], reg[k]['video']))
        else: reg[k] = {'texte': L['texte'], 'qui': L['qui'], 'video': vid, 'sketch': S['id'], 'chute': bool(L.get('chute'))}
if dup: sys.exit('répliques déjà utilisées : ' + '; '.join(f'« {t} » ({v})' for t, v in dup))
json.dump(reg, open(rp, 'w'), ensure_ascii=False, indent=1); print(len(reg), 'répliques au registre')
