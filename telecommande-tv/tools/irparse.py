import os, re, collections

def parse_ir(path):
    """Parse a Flipper .ir file into a list of dict signals."""
    sigs, cur = [], {}
    try:
        text = open(path, encoding='utf-8', errors='replace').read()
    except Exception:
        return sigs
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('#'):
            if cur: sigs.append(cur); cur = {}
            continue
        if ':' not in line: continue
        k, v = line.split(':', 1)
        k = k.strip().lower(); v = v.strip()
        if k == 'name' and 'name' in cur:
            sigs.append(cur); cur = {}
        cur[k] = v
    if cur: sigs.append(cur)
    out = []
    for s in sigs:
        if 'name' not in s or 'type' not in s: continue
        if s['type'] == 'parsed':
            try:
                a = bytes(int(x, 16) for x in s['address'].split())
                c = bytes(int(x, 16) for x in s['command'].split())
            except Exception:
                continue
            s['addr'] = int.from_bytes(a, 'little'); s['cmd'] = int.from_bytes(c, 'little')
            out.append(s)
        elif s['type'] == 'raw':
            try:
                s['freq'] = int(float(s.get('frequency', '38000')))
                s['raw'] = [int(float(x)) for x in s['data'].split()]
            except Exception:
                continue
            if len(s['raw']) < 6: continue
            out.append(s)
    return out

WORDNUM = {'zero':0,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9}

def norm(name):
    n = name.lower().replace('plus', '+').replace('minus', '-')
    n = re.sub(r'[\s_\.]+', '', n)
    # digits
    m = re.fullmatch(r'(?:num|digit|key|btn|n|number)?-?([0-9])', n)
    if m: return 'N' + m.group(1)
    if n in WORDNUM: return 'N%d' % WORDNUM[n]
    table = [
        ('POWER', r'(power|pwr|onoff|on/off|standby|powertoggle|power\(toggle\)|powertog)'),
        ('VOL_UP', r'(vol|volume|v)(\+|up|↑)'),
        ('VOL_DN', r'(vol|volume|v)(-|dn|down|↓)'),
        ('CH_UP', r'(ch|chan|channel|prog|program|p|pg|pr)(\+|up|next|↑)|chnext|channelnext'),
        ('CH_DN', r'(ch|chan|channel|prog|program|p|pg|pr)(-|dn|down|prev|previous|↓)|chprev|channelprev'),
        ('MUTE', r'(mute|mutetoggle|silence)'),
        ('SOURCE', r'(source|input|src|av|tv/av|avtv|tvav|inputselect|inputs|sourceinput)'),
        ('MENU', r'(menu|settings|setup|setting)'),
        ('HOME', r'(home|smart|smarthub|homemenu)'),
        ('UP', r'(up|cursorup|arrowup|navup|dpadup|upkey|keyup|u)'),
        ('DOWN', r'(down|dn|cursordown|arrowdown|navdown|dpaddown|downkey|keydown|d)'),
        ('LEFT', r'(left|cursorleft|arrowleft|navleft|dpadleft|leftkey|keyleft|l)'),
        ('RIGHT', r'(right|cursorright|arrowright|navright|dpadright|rightkey|keyright|r)'),
        ('OK', r'(ok|select|confirm|center|centre|okselect|ok/select|ok/enter|enter/ok)'),
        ('OK2', r'(enter)'),
        ('BACK', r'(back|return|ret|goback|previous|prev)'),
        ('EXIT', r'(exit|quit)'),
        ('INFO', r'(info|display|disp|information)'),
    ]
    for key, rx in table:
        if re.fullmatch(rx, n): return key
    return None
