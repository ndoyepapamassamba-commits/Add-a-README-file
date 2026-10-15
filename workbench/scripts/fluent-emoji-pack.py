import json, os, sys, urllib.request, urllib.parse
from io import BytesIO
from PIL import Image
# emoji → Fluent folder (CLDR short name); skin-tone folders use Default/
NAMES = {
 '🏠':'House','🛡️':'Shield','⏳':'Hourglass not done','🏦':'Bank','⚖️':'Balance scale','💸':'Money with wings','🧮':'Abacus',
 '🔐':'Locked with key','🎯':'Bullseye','🏆':'Trophy','✅':'Check mark button','🗳️':'Ballot box with ballot','🧩':'Puzzle piece',
 '⚙️':'Gear','🔍':'Magnifying glass tilted left','📚':'Books','📘':'Blue book','🗂️':'Card index dividers','⚠️':'Warning',
 '📊':'Bar chart','📈':'Chart increasing','📉':'Chart decreasing','🏭':'Factory','👥':'Busts in silhouette','💼':'Briefcase','💧':'Droplet',
 '🏛️':'Classical building','☂️':'Umbrella','🕵️':'Detective','🧪':'Test tube','⬅️':'Left arrow','➡️':'Right arrow',
 '📂':'Open file folder','🔎':'Magnifying glass tilted right','📁':'File folder','📌':'Pushpin','🧾':'Receipt','💠':'Diamond with a dot',
 '🗃️':'Card file box','🧭':'Compass','📎':'Paperclip','🪙':'Coin','🏷️':'Label','📐':'Triangular ruler','📣':'Megaphone',
 '🔢':'Input numbers','📖':'Open book','📝':'Memo','🎚️':'Level slider','🔒':'Locked','💡':'Light bulb','📄':'Page facing up',
 '🚀':'Rocket','✨':'Sparkles','🧠':'Brain','👁️':'Eye','🎬':'Clapper board','🎨':'Artist palette','🗓️':'Spiral calendar',
 '💬':'Speech balloon','🧰':'Toolbox','🔑':'Key','🗑️':'Wastebasket','💾':'Floppy disk','📥':'Inbox tray','📤':'Outbox tray',
 '🔄':'Counterclockwise arrows button','▶️':'Play button','⏹️':'Stop button','⏸️':'Pause button','✏️':'Pencil','📋':'Clipboard',
 '🔗':'Link','🌐':'Globe with meridians','🖼️':'Framed picture','🎥':'Movie camera','🎙️':'Studio microphone','🔊':'Speaker high volume',
 '❌':'Cross mark','➕':'Plus','🧹':'Broom','📦':'Package','🛠️':'Hammer and wrench','🔬':'Microscope','🤖':'Robot','⭐':'Star',
 '🏁':'Chequered flag','📸':'Camera with flash','🗺️':'World map','🧱':'Brick','🎲':'Game die','💎':'Gem stone','🪄':'Magic wand',
 '🔥':'Fire','⚡':'High voltage','🎉':'Party popper','👀':'Eyes','🙋':'Person raising hand','🧑‍💻':'Technologist','🤝':'Handshake',
 '🗨️':'Left speech bubble','🧬':'Dna','🪟':'Window','🖨️':'Printer','📧':'E-mail','📅':'Calendar','⏱️':'Stopwatch','💰':'Money bag',
 '📮':'Postbox','🧯':'Fire extinguisher','📍':'Round pushpin','🔔':'Bell','🔧':'Wrench','🖥️':'Desktop computer','📱':'Mobile phone',
 '🗄️':'File cabinet','📑':'Bookmark tabs','🧷':'Safety pin','🎛️':'Control knobs','🏗️':'Building construction','🌍':'Globe showing europe-africa',
 '📰':'Newspaper','🎓':'Graduation cap','🧑‍⚖️':'Judge','🏢':'Office building','🚦':'Vertical traffic light','🎁':'Wrapped gift',
}
base='https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/'
out={}; miss=[]
for e,n in NAMES.items():
    slug=n.lower().replace(' ','_').replace('-','_')
    cands=[f'{n}/3D/{slug}_3d.png', f'{n}/Default/3D/{slug}_3d_default.png']
    ok=False
    for c in cands:
        url=base+urllib.parse.quote(c)
        try:
            b=urllib.request.urlopen(url,timeout=20).read()
            im=Image.open(BytesIO(b)).convert('RGBA').resize((72,72),Image.LANCZOS)
            bio=BytesIO(); im.save(bio,'PNG',optimize=True); out[e]=bio.getvalue(); ok=True; break
        except Exception as ex: pass
    if not ok: miss.append((e,n))
import base64
json.dump({e:base64.b64encode(v).decode() for e,v in out.items()}, open('pack.json','w'))
print('ok',len(out),'miss',miss, 'bytes', sum(len(v) for v in out.values()))
