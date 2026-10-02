"""Moteur 2D « propre » : dessin vectoriel (SVG → cairo), contours épais, ombrages, grosses têtes expressives.

Rapide (≈ 2-4 min par vidéo d'une minute sur CPU), sans aucune API. Même interface que animatic.render_clip.
"""
import io
import math
import subprocess
from pathlib import Path

import cairosvg
from PIL import Image

from . import animatic

W, H, FPS = 1080, 1920, 24
GROUND = 1560
INK = "#2a170c"
OUT = 7  # épaisseur des contours

LOOKS = {
    "MODOU": dict(h=900, body="slim", top="#3f9b4f", top_dark="#2e7a3c", bottom="#7a4f2c", skin="#8a5232",
                  hair="#1a1210", hair_style="short", build=0.85),
    "BAYE": dict(h=880, body="boubou", top="#2349c9", top_dark="#18339a", bottom="#2349c9", skin="#6e3f22",
                 hair="#b9b9b9", hair_style="short", build=1.45, trim="#f2c037", beads=True),
    "TANTIE AWA": dict(h=860, body="dress", top="#f28a1c", top_dark="#c96a0e", bottom="#f7d23a", skin="#7a4527",
                       hair="#f28a1c", hair_style="headwrap", build=1.4, pattern="#f7d23a"),
    "PETIT MAMADOU": dict(h=600, body="kid", top="#ffd21f", top_dark="#e0b400", bottom="#2348a8", skin="#8a5232",
                          hair="#1a1210", hair_style="short", build=0.8, number="10"),
    "COUMBA": dict(h=870, body="dress", top="#e0479b", top_dark="#b4307a", bottom="#7c3fb0", skin="#94593a",
                   hair="#1d1210", hair_style="braids", build=0.9, pattern="#7c3fb0"),
    "TONTON DIENG": dict(h=890, body="shirt", top="#ef7a52", top_dark="#c95a36", bottom="#3b3b48", skin="#7e4a2b",
                         hair="#1a1210", hair_style="cap", build=1.05, cap="#5a4a35"),
    "MAITRE KONE": dict(h=880, body="shirt_plain", top="#7a5232", top_dark="#5c3c22", bottom="#5c3c22", skin="#6e3f22",
                        hair="#1a1210", hair_style="short", build=0.85, glasses=True, chalk=True),
    "DOCTEUR SYLLA": dict(h=870, body="coat", top="#f4f4f4", top_dark="#cfd6dc", bottom="#3b5bb0", skin="#7e4a2b",
                          hair="#1a1210", hair_style="bald", build=1.3, glasses=True, stethoscope=True),
    "FATOU": dict(h=850, body="dress", top="#2fa35b", top_dark="#217a43", bottom="#f2c037", skin="#8a5232",
                  hair="#2fa35b", hair_style="headwrap", build=1.2, pattern="#f2c037", phone=True),
    "ADJOUA": dict(h=880, body="dress", top="#e8213c", top_dark="#b0142a", bottom="#e8213c", skin="#9a5d3c",
                   hair="#f5d36b", hair_style="wig", build=0.9, earrings=True),
    "KOFFI": dict(h=890, body="shirt_plain", top="#f2c037", top_dark="#c99a12", bottom="#2a2a35", skin="#7e4a2b",
                  hair="#1a1210", hair_style="short", build=0.8, sunglasses=True, chain=True),
    "GRAND-PERE NDIAYE": dict(h=820, body="boubou", top="#f2f2ee", top_dark="#cfcfc6", bottom="#f2f2ee",
                              skin="#6e3f22", hair="#f2f2ee", hair_style="bonnet", build=1.0, beard=True, cane=True),
    "MAMIE BINTOU": dict(h=700, body="dress", top="#7c3fb0", top_dark="#5b2b85", bottom="#f2c037", skin="#7a4527",
                         hair="#7c3fb0", hair_style="headwrap", build=1.0, pattern="#f2c037", glasses=True, cane=True),
    "ALIOU": dict(h=880, body="shirt_plain", top="#ffd21f", top_dark="#d9b000", bottom="#3b3b48", skin="#8a5232",
                  hair="#1a1210", hair_style="cap", build=0.95, cap="#1d1d24"),
    "CHEF TRAORE": dict(h=920, body="boubou", top="#8c1d3a", top_dark="#66142a", bottom="#8c1d3a", skin="#6e3f22",
                        hair="#1a1210", hair_style="tall_hat", build=1.5, trim="#f2c037", hat="#f2c037"),
    "AMINATA": dict(h=760, body="shirt_plain", top="#b98cff", top_dark="#8f63d9", bottom="#2a2a35", skin="#94593a",
                    hair="#ff6fb5", hair_style="bun", build=0.85, phone=True),
    "BOUBACAR": dict(h=860, body="shirt_plain", top="#3a6fe0", top_dark="#2851b0", bottom="#3b3b48", skin="#8a5232",
                     hair="#1a1210", hair_style="short", build=1.75, stripes=True, napkin=True),
    "MAMAN NOUNOU": dict(h=860, body="dress", top="#2f6fd6", top_dark="#1f4fa0", bottom="#f4f4f4", skin="#7a4527",
                         hair="#2f6fd6", hair_style="headwrap", build=1.45, pattern="#f4f4f4", basket=True),
}
DEFAULT = dict(h=880, body="slim", top="#c94040", top_dark="#992e2e", bottom="#3b3b48", skin="#7e4a2b",
               hair="#1a1210", hair_style="short", build=1.0)

# bras : (angle épaule, flexion coude) en degrés ; 0 = vers le bas, + = vers l'extérieur
POSES = {
    "neutral": ((12, 8), (12, 8)),
    "smug": ((40, 75), (40, 75)),
    "shock": ((150, 15), (150, 15)),
    "despair": ((155, 95), (155, 95)),
    "unimpressed": ((25, -125), (25, -125)),
    "laugh": ((18, -95), (18, -95)),
    "sweat": ((10, 25), (14, 40)),
    "angry": ((35, -105), (95, -5)),  # main sur la hanche / bras tendu qui pointe
}


def _skin_shade(hex_color, k=0.78):
    c = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{int(v * k):02x}" for v in c)


# --- décors ---------------------------------------------------------------------------------

def background_svg(setting: str, prompt: str) -> str:
    p = prompt.lower()
    sky = {"plage": ("#4fb3ff", "#bfe6ff"), "salon": ("#2b8f8a", "#3aa39d")}.get(setting, ("#58aef5", "#ffe3a8"))
    parts = [f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sky[0]}"/>'
             f'<stop offset="1" stop-color="{sky[1]}"/></linearGradient>'
             '<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b277"/>'
             '<stop offset="1" stop-color="#c98f52"/></linearGradient>'
             '<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/>'
             '<stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient></defs>',
             f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    if setting != "salon":
        parts.append('<circle cx="860" cy="260" r="90" fill="#fff6c8" opacity="0.9"/>')
        for cx, cy, s in ((220, 230, 1.0), (620, 150, 0.7)):
            parts.append(f'<g transform="translate({cx},{cy}) scale({s})" fill="#fff" opacity="0.95">'
                         '<ellipse cx="0" cy="0" rx="90" ry="45"/><ellipse cx="70" cy="-20" rx="70" ry="50"/>'
                         '<ellipse cx="-70" cy="10" rx="60" ry="35"/></g>')
    if setting == "plage":
        parts.append(f'<rect y="{GROUND - 330}" width="{W}" height="330" fill="#1f86c9"/>')
        parts.append(f'<path d="M0 {GROUND - 330} Q270 {GROUND - 350} 540 {GROUND - 330} T1080 {GROUND - 330}" '
                     'stroke="#bfe6ff" stroke-width="10" fill="none"/>')
        for x in (90, 960):
            parts.append(f'<path d="M{x} {GROUND} Q{x + 30} {GROUND - 300} {x + 10} {GROUND - 560}" stroke="{INK}" '
                         'stroke-width="38" fill="none"/>'
                         f'<path d="M{x} {GROUND} Q{x + 30} {GROUND - 300} {x + 10} {GROUND - 560}" stroke="#8a5a2b" '
                         'stroke-width="26" fill="none"/>')
            for a in range(0, 360, 60):
                ex, ey = x + 10 + 190 * math.cos(math.radians(a)), GROUND - 560 + 80 * math.sin(math.radians(a))
                parts.append(f'<path d="M{x + 10} {GROUND - 560} Q{(x + 10 + ex) / 2} {GROUND - 640} {ex:.0f} {ey:.0f}" '
                             f'stroke="#2f8f3a" stroke-width="34" fill="none" stroke-linecap="round"/>')
    elif setting == "village":
        parts.append(f'<ellipse cx="840" cy="{GROUND - 640}" rx="260" ry="190" fill="#3c8f3a" stroke="{INK}" stroke-width="{OUT}"/>'
                     f'<rect x="800" y="{GROUND - 480}" width="80" height="480" fill="#7a5230" stroke="{INK}" stroke-width="{OUT}"/>')
        parts.append(f'<path d="M40 {GROUND - 420} L250 {GROUND - 640} L460 {GROUND - 420} Z" fill="#c9a248" stroke="{INK}" stroke-width="{OUT}"/>'
                     f'<rect x="80" y="{GROUND - 420}" width="340" height="300" fill="#b9733a" stroke="{INK}" stroke-width="{OUT}"/>'
                     f'<rect x="200" y="{GROUND - 330}" width="100" height="210" fill="#4a2c16"/>')
    else:
        wall = {"salon": "#2fa39b", "ceremonie": "#efe9f5", "marche": "#d8673e", "hopital": "#bfe3cf",
                "ecole": "#f0d9a0", "maquis": "#3a2a4a", "taxi": "#e8b04a", "salon_coiffure": "#f7a8c8"}.get(setting, "#d9743a")
        wall_dark = _skin_shade(wall, 0.85)
        top = GROUND - 760
        parts.append(f'<rect y="{top}" width="{W}" height="{GROUND - top}" fill="{wall}"/>'
                     f'<rect y="{top}" width="{W}" height="26" fill="{wall_dark}"/>')
        if setting in ("cour", "marche"):
            for row, y in enumerate(range(top + 40, GROUND, 70)):
                for x in range(-100 if row % 2 else -30, W, 150):
                    parts.append(f'<rect x="{x}" y="{y}" width="140" height="60" rx="10" fill="{wall_dark}" opacity="0.35"/>')
            # porte avec rideau jaune (comme dans les maisons du quartier)
            parts.append(f'<rect x="60" y="{GROUND - 560}" width="230" height="560" fill="#3a2414" stroke="{INK}" stroke-width="{OUT}"/>'
                         f'<path d="M60 {GROUND - 560} h230 v420 q-60 40 -115 0 q-55 40 -115 0 z" fill="#f2c21b" stroke="{INK}" stroke-width="{OUT}"/>'
                         f'<path d="M120 {GROUND - 560} v410 M175 {GROUND - 560} v420 M230 {GROUND - 560} v410" stroke="#d4a40a" stroke-width="6"/>')
            parts.append(f'<path d="M330 {top + 130} Q700 {top + 175} 1060 {top + 120}" stroke="{INK}" stroke-width="5" fill="none"/>')
            for x, c in ((420, "#e8413c"), (560, "#3a6fe0"), (700, "#ffd21f"), (850, "#2fa35b")):
                parts.append(f'<path d="M{x} {top + 150} h110 v120 q-55 20 -110 0 z" fill="{c}" stroke="{INK}" stroke-width="5"/>')
        if setting == "salon":
            parts.append(f'<rect x="90" y="{top + 150}" width="200" height="150" rx="8" fill="#f5e6c8" stroke="#6b4423" stroke-width="14"/>'
                         f'<rect x="760" y="{top + 140}" width="200" height="150" rx="8" fill="#f5e6c8" stroke="#6b4423" stroke-width="14"/>')
            parts.append(f'<rect x="0" y="{GROUND - 330}" width="330" height="330" rx="30" fill="#b03a4a" stroke="{INK}" stroke-width="{OUT}"/>')
        if setting == "hopital":
            parts.append(f'<rect x="700" y="{GROUND - 300}" width="360" height="160" rx="20" fill="#fff" stroke="{INK}" stroke-width="{OUT}"/>'
                         f'<rect x="700" y="{GROUND - 380}" width="40" height="380" fill="#9aa7b0" stroke="{INK}" stroke-width="{OUT}"/>'
                         f'<rect x="60" y="{top + 120}" width="200" height="260" rx="10" fill="#fff" stroke="{INK}" stroke-width="{OUT}"/>'
                         f'<path d="M160 {top + 170} v80 M120 {top + 210} h80" stroke="#e8213c" stroke-width="26"/>')
        if setting == "ecole":
            parts.append(f'<rect x="140" y="{top + 90}" width="800" height="360" rx="12" fill="#1f5a3c" stroke="#7a5230" stroke-width="22"/>'
                         f'<text x="540" y="{top + 230}" font-family="DejaVu Sans" font-size="64" fill="#f4f4f4" text-anchor="middle" opacity="0.85">2 + 2 = ?</text>'
                         f'<text x="540" y="{top + 340}" font-family="DejaVu Sans" font-size="44" fill="#f4f4f4" text-anchor="middle" opacity="0.7">Leçon : le mensonge</text>')
        if setting == "maquis":
            parts.append(f'<path d="M0 {top + 60} Q270 {top + 140} 540 {top + 60} T1080 {top + 60}" stroke="#222" stroke-width="4" fill="none"/>')
            for i in range(12):
                x = 45 + i * 90
                parts.append(f'<circle cx="{x}" cy="{top + 80 + 40 * math.sin(i):.0f}" r="16" fill="{("#ffd21f", "#ff6fb5", "#7fd4ff")[i % 3]}"/>')
            parts.append(f'<rect x="80" y="{GROUND - 220}" width="260" height="20" fill="#e8413c" stroke="{INK}" stroke-width="5"/>'
                         f'<path d="M110 {GROUND - 200} v200 M310 {GROUND - 200} v200" stroke="#e8413c" stroke-width="16"/>'
                         f'<text x="540" y="{top + 300}" font-family="DejaVu Sans" font-weight="bold" font-size="90" fill="#ffd21f" text-anchor="middle">MAQUIS</text>')
        if setting == "taxi":
            parts.append(f'<g transform="translate(560,{GROUND - 320})"><path d="M0 200 L40 70 Q60 20 120 20 H360 Q420 20 440 70 L500 200 Z" fill="#ffd21f" stroke="{INK}" stroke-width="{OUT}"/>'
                         '<rect x="70" y="50" width="160" height="90" rx="10" fill="#bfe6ff" stroke="#2a170c" stroke-width="5"/>'
                         '<rect x="260" y="50" width="160" height="90" rx="10" fill="#bfe6ff" stroke="#2a170c" stroke-width="5"/>'
                         '<rect x="-10" y="190" width="520" height="80" rx="20" fill="#ffd21f" stroke="#2a170c" stroke-width="7"/>'
                         '<circle cx="110" cy="275" r="55" fill="#222" stroke="#2a170c" stroke-width="7"/><circle cx="400" cy="275" r="55" fill="#222" stroke="#2a170c" stroke-width="7"/>'
                         '<rect x="190" y="-20" width="120" height="40" rx="8" fill="#fff" stroke="#2a170c" stroke-width="5"/>'
                         '<text x="250" y="10" font-family="DejaVu Sans" font-weight="bold" font-size="28" text-anchor="middle">TAXI</text></g>')
        if setting == "salon_coiffure":
            for x in (120, 480, 840):
                parts.append(f'<ellipse cx="{x}" cy="{top + 260}" rx="110" ry="150" fill="#dff3ff" stroke="#f2c037" stroke-width="16"/>')
        if setting == "ceremonie":
            parts.append(f'<path d="M0 {top} Q270 {top + 120} 540 {top} Q810 {top + 120} 1080 {top}" fill="#f3c6d9" stroke="{INK}" stroke-width="{OUT}"/>')
    parts.append(f'<rect y="{GROUND}" width="{W}" height="{H - GROUND}" fill="url(#sand)"/>'
                 f'<path d="M0 {GROUND} H{W}" stroke="{INK}" stroke-width="5" opacity="0.6"/>')
    for i in range(40):
        x, y = (i * 263) % W, GROUND + 40 + (i * 97) % (H - GROUND - 60)
        parts.append(f'<ellipse cx="{x}" cy="{y}" rx="9" ry="4" fill="#b37a40" opacity="0.5"/>')
    parts += props_svg(p, setting)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{"".join(parts)}</svg>'


def props_svg(p: str, setting: str) -> list[str]:
    out = []
    if "ram" in p or "mouton" in p or "sheep" in p:
        x, y = 820, GROUND - 40
        out.append(f'<line x1="{x + 170}" y1="{y - 260}" x2="{x + 170}" y2="{y + 40}" stroke="{INK}" stroke-width="22"/>'
                   f'<line x1="{x + 170}" y1="{y - 260}" x2="{x + 170}" y2="{y + 40}" stroke="#7a5230" stroke-width="12"/>')
        for lx in (-70, -20, 40, 90):
            out.append(f'<rect x="{x + lx}" y="{y - 40}" width="22" height="90" rx="8" fill="#3a2a22" stroke="{INK}" stroke-width="5"/>')
        out.append(f'<g stroke="{INK}" stroke-width="{OUT}" fill="#fbf7ee">'
                   + "".join(f'<circle cx="{x + dx}" cy="{y - 110 + dy}" r="62"/>' for dx, dy in
                             ((-80, 10), (-20, -20), (50, 0), (100, 20), (20, 40), (-50, 45)))
                   + '</g>'
                   + "".join(f'<circle cx="{x + dx}" cy="{y - 110 + dy}" r="58" fill="#fbf7ee"/>' for dx, dy in
                             ((-80, 10), (-20, -20), (50, 0), (100, 20), (20, 40), (-50, 45))))
        out.append(f'<ellipse cx="{x - 150}" cy="{y - 170}" rx="55" ry="70" fill="#efe6d8" stroke="{INK}" stroke-width="{OUT}"/>'
                   f'<path d="M{x - 175} {y - 225} q-60 -10 -50 50 q10 40 40 20" fill="none" stroke="#8a6440" stroke-width="18" stroke-linecap="round"/>'
                   f'<path d="M{x - 125} {y - 225} q60 -10 50 50 q-10 40 -40 20" fill="none" stroke="#8a6440" stroke-width="18" stroke-linecap="round"/>'
                   f'<circle cx="{x - 168}" cy="{y - 175}" r="9" fill="{INK}"/><circle cx="{x - 132}" cy="{y - 175}" r="9" fill="{INK}"/>'
                   f'<ellipse cx="{x - 150}" cy="{y - 130}" rx="20" ry="12" fill="#d9a3a0"/>')
        if "ribbon" in p:
            out.append(f'<path d="M{x - 120} {y - 110} l-40 -30 v60 z M{x - 120} {y - 110} l40 -30 v60 z" fill="#e8213c" stroke="{INK}" stroke-width="4"/>')
    if "air conditioner" in p:
        out.append(f'<g transform="translate(60,{GROUND - 250})"><rect width="230" height="230" rx="10" fill="#f1e6cf" stroke="{INK}" stroke-width="{OUT}"/>'
                   f'<path d="M0 60 h230" stroke="{INK}" stroke-width="4"/>'
                   '<text x="115" y="150" font-family="DejaVu Sans" font-weight="bold" font-size="46" fill="#1d4fd1" text-anchor="middle">CLIM</text>'
                   '<text x="115" y="195" font-family="DejaVu Sans" font-size="26" fill="#1d4fd1" text-anchor="middle">NEUVE</text></g>')
    if "chicken" in p or "yassa" in p:
        out.append(f'<g transform="translate(470,{GROUND + 120})"><ellipse rx="150" ry="45" fill="#fff" stroke="{INK}" stroke-width="{OUT}"/>'
                   '<ellipse cy="-20" rx="95" ry="45" fill="#c9782a" stroke="#2a170c" stroke-width="5"/>'
                   '<path d="M-60 -30 q30 -20 60 0 q30 -20 60 0" stroke="#f3e2a0" stroke-width="10" fill="none"/></g>')
    if "tv" in p or "television" in p:
        out.append(f'<g transform="translate(700,{GROUND - 420})"><rect width="300" height="230" rx="20" fill="#2a2a2a" stroke="{INK}" stroke-width="{OUT}"/>'
                   '<rect x="20" y="20" width="260" height="190" rx="10" fill="#2fa84a"/>'
                   '<path d="M150 20 v190" stroke="#fff" stroke-width="5"/><circle cx="150" cy="115" r="38" fill="none" stroke="#fff" stroke-width="5"/>'
                   '<rect x="120" y="230" width="60" height="40" fill="#2a2a2a"/></g>')
    if "cooking pot" in p or "pot" in p.split():
        out.append(f'<g transform="translate(830,{GROUND + 60})"><path d="M-80 0 h160 l-20 80 h-120 z" fill="#555" stroke="{INK}" stroke-width="5"/>'
                   '<ellipse cy="-110" rx="150" ry="40" fill="#7d7d7d" stroke="#2a170c" stroke-width="7"/>'
                   '<path d="M-150 -110 q0 120 150 120 q150 0 150 -120" fill="#8f8f8f" stroke="#2a170c" stroke-width="7"/>'
                   '<ellipse cy="-110" rx="130" ry="28" fill="#b5541c"/></g>')
    return out


# --- personnages ---------------------------------------------------------------------------

def _limb(x0, y0, x1, y1, x2, y2, color, width):
    d = f"M{x0:.1f} {y0:.1f} L{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}"
    return (f'<path d="{d}" stroke="{INK}" stroke-width="{width + 2 * OUT}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" stroke="{color}" stroke-width="{width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')


def character_svg(name, cx, emotion, t, speaking, facing, prompt, frozen=False):
    L = LOOKS.get(name, DEFAULT)
    h, b = L["h"] * 1.22, L["build"]
    skin, skin_d = L["skin"], _skin_shade(L["skin"])
    s = []
    bob = 10 * math.sin(t * 10) if speaking else 4 * math.sin(t * 2.2)
    if emotion == "laugh":
        bob = 14 * abs(math.sin(t * 13))
    if emotion == "shock" and not frozen:
        bob = -6
    base = GROUND + 30
    hr = h * (0.2 if name != "PETIT MAMADOU" else 0.25)       # tête
    torso_h = h * 0.36
    leg_h = h * 0.3
    hip_y = base - leg_h + bob * 0.3
    sh_y = hip_y - torso_h + bob
    bw = h * 0.16 * b                                          # demi-largeur du buste
    head_cy = sh_y - hr * 0.92
    lean = {"angry": 18, "laugh": -14, "shock": -10, "smug": -6}.get(emotion, 0) * facing

    s.append(f'<ellipse cx="{cx}" cy="{base + 10}" rx="{bw * 1.5:.0f}" ry="26" fill="#000" opacity="0.22"/>')

    # jambes + pieds
    if L["body"] in ("slim", "shirt", "kid", "shirt_plain", "coat"):
        for side in (-1, 1):
            x = cx + side * bw * 0.45
            s.append(_limb(x, hip_y, x + side * 4, hip_y + leg_h * 0.5, x + side * 6, base - 16, L["bottom"], bw * 0.42))
            s.append(f'<ellipse cx="{x + side * 6 + facing * 12:.0f}" cy="{base - 6}" rx="{bw * 0.42:.0f}" ry="17" '
                     f'fill="#4a2f22" stroke="{INK}" stroke-width="{OUT - 2}"/>')
    else:
        for side in (-1, 1):
            s.append(f'<ellipse cx="{cx + side * bw * 0.45 + facing * 10:.0f}" cy="{base - 6}" rx="{bw * 0.4:.0f}" ry="16" '
                     f'fill="#4a2f22" stroke="{INK}" stroke-width="{OUT - 2}"/>')

    g_open = f'<g transform="rotate({lean * 0.4:.1f} {cx} {hip_y:.0f})">'
    s.append(g_open)
    # buste / vêtement
    if L["body"] in ("boubou", "dress"):
        top_w, bot_w = bw * 1.0, bw * (1.6 if L["body"] == "boubou" else 1.35)
        d = (f"M{cx - top_w:.0f} {sh_y:.0f} Q{cx - top_w * 1.25:.0f} {(sh_y + base) / 2:.0f} {cx - bot_w:.0f} {base - 20:.0f} "
             f"Q{cx:.0f} {base + 10:.0f} {cx + bot_w:.0f} {base - 20:.0f} Q{cx + top_w * 1.25:.0f} {(sh_y + base) / 2:.0f} {cx + top_w:.0f} {sh_y:.0f} "
             f"Q{cx:.0f} {sh_y - 30:.0f} {cx - top_w:.0f} {sh_y:.0f} Z")
        s.append(f'<path d="{d}" fill="{L["top"]}" stroke="{INK}" stroke-width="{OUT}" stroke-linejoin="round"/>')
        s.append(f'<path d="M{cx + top_w * 0.3:.0f} {sh_y + 20:.0f} Q{cx + bot_w * 0.9:.0f} {(sh_y + base) / 2:.0f} {cx + bot_w * 0.75:.0f} {base - 22:.0f} '
                 f'L{cx + bot_w * 0.98:.0f} {base - 22:.0f} Q{cx + top_w * 1.2:.0f} {(sh_y + base) / 2:.0f} {cx + top_w:.0f} {sh_y:.0f} Z" '
                 f'fill="{L["top_dark"]}" opacity="0.55"/>')
        if L.get("trim"):
            s.append(f'<path d="M{cx - 70} {sh_y - 5:.0f} Q{cx} {sh_y + 150:.0f} {cx + 70} {sh_y - 5:.0f}" fill="none" stroke="{L["trim"]}" stroke-width="16"/>'
                     f'<path d="M{cx} {sh_y + 120:.0f} v220" stroke="{L["trim"]}" stroke-width="10" stroke-dasharray="22 14"/>')
            for k in range(3):
                s.append(f'<circle cx="{cx - 40 + k * 40}" cy="{sh_y + 70 + abs(k - 1) * 25:.0f}" r="9" fill="{L["trim"]}"/>')
        if L.get("pattern"):
            for i in range(14):
                px = cx + ((i * 73) % int(bot_w * 1.6)) - bot_w * 0.8
                py = sh_y + 120 + ((i * 131) % int(base - sh_y - 160))
                s.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="17" fill="none" stroke="{L["pattern"]}" stroke-width="7"/>'
                         f'<circle cx="{px:.0f}" cy="{py:.0f}" r="5" fill="{L["pattern"]}"/>')
    else:
        d = (f"M{cx - bw:.0f} {sh_y + 10:.0f} Q{cx - bw * 1.08:.0f} {(sh_y + hip_y) / 2:.0f} {cx - bw * 0.9:.0f} {hip_y + 20:.0f} "
             f"L{cx + bw * 0.9:.0f} {hip_y + 20:.0f} Q{cx + bw * 1.08:.0f} {(sh_y + hip_y) / 2:.0f} {cx + bw:.0f} {sh_y + 10:.0f} "
             f"Q{cx:.0f} {sh_y - 25:.0f} {cx - bw:.0f} {sh_y + 10:.0f} Z")
        s.append(f'<path d="{d}" fill="{L["top"]}" stroke="{INK}" stroke-width="{OUT}" stroke-linejoin="round"/>')
        s.append(f'<path d="M{cx + bw * 0.35:.0f} {sh_y + 15:.0f} Q{cx + bw:.0f} {(sh_y + hip_y) / 2:.0f} {cx + bw * 0.8:.0f} {hip_y + 18:.0f} '
                 f'L{cx + bw * 0.9:.0f} {hip_y + 18:.0f} Q{cx + bw * 1.06:.0f} {(sh_y + hip_y) / 2:.0f} {cx + bw:.0f} {sh_y + 12:.0f} Z" '
                 f'fill="{L["top_dark"]}" opacity="0.6"/>')
        if L["body"] == "shirt":
            s.append(f'<path d="M{cx - 45} {sh_y:.0f} L{cx} {sh_y + 130:.0f} L{cx + 45} {sh_y:.0f} Z" fill="#fafafa" stroke="{INK}" stroke-width="5"/>')
            for i in range(8):
                fx, fy = cx - bw * 0.75 + (i * 61) % int(bw * 1.5), sh_y + 40 + (i * 89) % int(torso_h - 60)
                s.append(f'<g transform="translate({fx:.0f},{fy:.0f})" fill="#ffe14a">'
                         + "".join(f'<circle cx="{10 * math.cos(a):.0f}" cy="{10 * math.sin(a):.0f}" r="8"/>' for a in (0, 1.26, 2.51, 3.77, 5.03))
                         + '<circle r="6" fill="#e8413c"/></g>')
        if L.get("stripes"):
            for k in range(1, 5):
                yy = sh_y + k * torso_h / 5
                s.append(f'<path d="M{cx - bw * 1.0:.0f} {yy:.0f} H{cx + bw * 1.0:.0f}" stroke="#ffffff" stroke-width="16" opacity="0.8"/>')
        if L["body"] == "coat":
            s.append(f'<path d="M{cx - 30} {sh_y:.0f} L{cx} {sh_y + 90:.0f} L{cx + 30} {sh_y:.0f} Z" fill="#e8413c" stroke="{INK}" stroke-width="4"/>'
                     f'<path d="M{cx} {sh_y + 90:.0f} V{hip_y + 15:.0f}" stroke="{INK}" stroke-width="5"/>')
        if L.get("napkin"):
            s.append(f'<path d="M{cx - 45} {sh_y + 5:.0f} h90 l-45 90 z" fill="#fff" stroke="{INK}" stroke-width="5"/>')
        if L.get("chain"):
            s.append(f'<path d="M{cx - 60} {sh_y + 5:.0f} Q{cx} {sh_y + 140:.0f} {cx + 60} {sh_y + 5:.0f}" fill="none" stroke="#f2c037" stroke-width="12" stroke-dasharray="10 5"/>'
                     f'<circle cx="{cx}" cy="{sh_y + 110:.0f}" r="22" fill="#f2c037" stroke="{INK}" stroke-width="4"/>')
        if L.get("number"):
            s.append(f'<text x="{cx}" y="{sh_y + torso_h * 0.62:.0f}" font-family="DejaVu Sans" font-weight="bold" font-size="{bw * 0.9:.0f}" '
                     f'fill="#2348a8" text-anchor="middle" stroke="{INK}" stroke-width="3">{L["number"]}</text>')

    # bras
    pose = POSES.get(emotion, POSES["neutral"])
    if emotion == "angry" and facing < 0:
        pose = (pose[1], pose[0])
    if emotion == "angry" and facing == 0:
        pose = POSES["neutral"]
    up, fo = h * 0.17, h * 0.16
    arm_w = bw * 0.38
    hands = []
    for side, (a, bend) in zip((-1, 1), pose):
        wig = (6 * math.sin(t * 12) if (speaking and emotion not in ("unimpressed",)) else 0)
        if emotion == "angry" and a > 80:
            wig = 5 * math.sin(t * 18)
        a1 = math.radians(a + wig)
        a2 = math.radians(a + bend + wig)
        x0, y0 = cx + side * bw * 0.92, sh_y + 28
        x1, y1 = x0 + side * up * math.sin(a1), y0 + up * math.cos(a1)
        x2, y2 = x1 + side * fo * math.sin(a2), y1 + fo * math.cos(a2)
        s.append(_limb(x0, y0, x1, y1, x2, y2, L["top"] if L["body"] != "kid" else skin, arm_w))
        if L["body"] in ("slim", "kid", "shirt", "shirt_plain"):
            s.append(_limb(x1, y1, x1 + 0.001, y1 + 0.001, x2, y2, skin, arm_w * 0.8))
        hands.append((x2, y2))
        s.append(f'<circle cx="{x2:.0f}" cy="{y2:.0f}" r="{arm_w * 0.62:.0f}" fill="{skin}" stroke="{INK}" stroke-width="{OUT - 1}"/>')
        if emotion == "angry" and a > 80:
            s.append(f'<path d="M{x2:.0f} {y2:.0f} l{side * 46:.0f} -6" stroke="{INK}" stroke-width="{arm_w * 0.35 + 8:.0f}" stroke-linecap="round"/>'
                     f'<path d="M{x2:.0f} {y2:.0f} l{side * 46:.0f} -6" stroke="{skin}" stroke-width="{arm_w * 0.35:.0f}" stroke-linecap="round"/>')
    if L.get("phone"):
        px, py = hands[0] if facing <= 0 else hands[1]
        s.append(f'<rect x="{px - 26:.0f}" y="{py - 95:.0f}" width="52" height="92" rx="10" fill="#1d1d24" stroke="{INK}" stroke-width="5"/>'
                 f'<rect x="{px - 19:.0f}" y="{py - 86:.0f}" width="38" height="70" rx="4" fill="#7fd4ff"/>'
                 f'<circle cx="{px:.0f}" cy="{py - 52:.0f}" r="9" fill="#e8213c" opacity="{0.9 if int(t * 2) % 2 else 0.3}"/>')
    if L.get("cane"):
        px, py = hands[1] if facing <= 0 else hands[0]
        s.append(f'<path d="M{px:.0f} {py - 20:.0f} L{px + 8:.0f} {base:.0f}" stroke="{INK}" stroke-width="22" stroke-linecap="round"/>'
                 f'<path d="M{px:.0f} {py - 20:.0f} L{px + 8:.0f} {base:.0f}" stroke="#8a5a2b" stroke-width="12" stroke-linecap="round"/>')
    if L.get("chalk"):
        px, py = hands[1] if facing >= 0 else hands[0]
        s.append(f'<rect x="{px - 8:.0f}" y="{py - 45:.0f}" width="16" height="40" rx="5" fill="#fff" stroke="{INK}" stroke-width="3"/>')
    if L.get("beads"):
        hx, hy = hands[1]
        s.append(f'<circle cx="{hx:.0f}" cy="{hy + 45:.0f}" r="34" fill="none" stroke="#6b3412" stroke-width="10" stroke-dasharray="4 10" stroke-linecap="round"/>')
    if name == "PETIT MAMADOU" and "receipt" in prompt.lower():
        hx, hy = hands[0] if facing >= 0 else hands[1]
        s.append(f'<g transform="translate({hx:.0f},{hy - 120:.0f}) rotate({-8 * (facing or 1)})"><rect x="-55" y="-10" width="110" height="140" rx="6" fill="#fffef6" stroke="{INK}" stroke-width="5"/>'
                 '<text x="0" y="30" font-family="DejaVu Sans" font-weight="bold" font-size="24" text-anchor="middle" fill="#d0021b">REÇU</text>'
                 '<path d="M-35 55 h70 M-35 75 h50 M-35 95 h65" stroke="#888" stroke-width="5"/></g>')

    # tête
    hx = cx + lean * 0.8
    tilt = (6 * math.sin(t * 5) if speaking else 0) + (-10 if emotion == "laugh" else 0) * (facing or 1)
    s.append(f'<g transform="rotate({tilt:.1f} {hx:.0f} {head_cy + hr:.0f})">')
    s.append(f'<rect x="{hx - hr * 0.28:.0f}" y="{head_cy + hr * 0.6:.0f}" width="{hr * 0.56:.0f}" height="{hr * 0.6:.0f}" fill="{skin_d}"/>')
    for side in (-1, 1):
        s.append(f'<ellipse cx="{hx + side * hr * 0.98:.0f}" cy="{head_cy + hr * 0.05:.0f}" rx="{hr * 0.2:.0f}" ry="{hr * 0.26:.0f}" fill="{skin}" stroke="{INK}" stroke-width="{OUT - 1}"/>')
    if L["hair_style"] == "braids":  # tresses derrière la tête, qui tombent sur les épaules
        for side in (-1, 1):
            for k in range(4):
                x0 = hx + side * hr * (0.55 + k * 0.14)
                d = f"M{x0:.0f} {head_cy - hr * 0.6:.0f} q{side * hr * 0.25:.0f} {hr * 0.9:.0f} {side * hr * (0.15 + k * 0.08):.0f} {hr * 1.9:.0f}"
                s.append(f'<path d="{d}" stroke="{INK}" stroke-width="24" fill="none" stroke-linecap="round"/>'
                         f'<path d="{d}" stroke="{L["hair"]}" stroke-width="13" fill="none" stroke-linecap="round" stroke-dasharray="14 6"/>')
    s.append(f'<ellipse cx="{hx:.0f}" cy="{head_cy:.0f}" rx="{hr:.0f}" ry="{hr * 1.06:.0f}" fill="{skin}" stroke="{INK}" stroke-width="{OUT}"/>')
    s.append(f'<path d="M{hx + hr * 0.45:.0f} {head_cy - hr * 0.85:.0f} A{hr:.0f} {hr * 1.06:.0f} 0 0 1 {hx + hr * 0.5:.0f} {head_cy + hr * 0.9:.0f} '
             f'Q{hx + hr * 0.95:.0f} {head_cy:.0f} {hx + hr * 0.45:.0f} {head_cy - hr * 0.85:.0f} Z" fill="{skin_d}" opacity="0.45"/>')
    hs = L["hair_style"]
    if hs == "headwrap":
        s.append(f'<path d="M{hx - hr * 1.02:.0f} {head_cy - hr * 0.25:.0f} Q{hx - hr * 1.2:.0f} {head_cy - hr * 1.9:.0f} {hx:.0f} {head_cy - hr * 2.0:.0f} '
                 f'Q{hx + hr * 1.3:.0f} {head_cy - hr * 1.9:.0f} {hx + hr * 1.02:.0f} {head_cy - hr * 0.25:.0f} Q{hx:.0f} {head_cy - hr * 0.7:.0f} {hx - hr * 1.02:.0f} {head_cy - hr * 0.25:.0f} Z" '
                 f'fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT}"/>'
                 f'<path d="M{hx - hr * 0.6:.0f} {head_cy - hr * 1.3:.0f} Q{hx:.0f} {head_cy - hr * 0.9:.0f} {hx + hr * 0.7:.0f} {head_cy - hr * 1.5:.0f}" stroke="{L["pattern"]}" stroke-width="16" fill="none"/>'
                 f'<circle cx="{hx + hr * 0.2:.0f}" cy="{head_cy - hr * 1.65:.0f}" r="{hr * 0.12:.0f}" fill="{L["pattern"]}"/>')
    elif hs == "wig":
        s.append(f'<path d="M{hx - hr * 1.15:.0f} {head_cy + hr * 1.6:.0f} Q{hx - hr * 1.5:.0f} {head_cy - hr * 1.5:.0f} {hx:.0f} {head_cy - hr * 1.25:.0f} '
                 f'Q{hx + hr * 1.5:.0f} {head_cy - hr * 1.5:.0f} {hx + hr * 1.15:.0f} {head_cy + hr * 1.6:.0f} L{hx + hr * 0.75:.0f} {head_cy + hr * 1.5:.0f} '
                 f'Q{hx + hr * 0.95:.0f} {head_cy - hr * 0.3:.0f} {hx:.0f} {head_cy - hr * 0.75:.0f} Q{hx - hr * 0.95:.0f} {head_cy - hr * 0.3:.0f} {hx - hr * 0.75:.0f} {head_cy + hr * 1.5:.0f} Z" '
                 f'fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT - 1}"/>')
    elif hs == "bun":
        s.append(f'<circle cx="{hx:.0f}" cy="{head_cy - hr * 1.25:.0f}" r="{hr * 0.42:.0f}" fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT - 1}"/>'
                 f'<path d="M{hx - hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Q{hx:.0f} {head_cy - hr * 1.5:.0f} {hx + hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Q{hx:.0f} {head_cy - hr * 0.7:.0f} {hx - hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Z" fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT - 1}"/>')
    elif hs == "bonnet":
        s.append(f'<path d="M{hx - hr * 0.95:.0f} {head_cy - hr * 0.45:.0f} Q{hx:.0f} {head_cy - hr * 1.55:.0f} {hx + hr * 0.95:.0f} {head_cy - hr * 0.45:.0f} Z" fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT}"/>'
                 f'<path d="M{hx - hr * 0.7:.0f} {head_cy - hr * 0.75:.0f} H{hx + hr * 0.7:.0f}" stroke="#cfcfc6" stroke-width="6" stroke-dasharray="6 6"/>')
    elif hs == "tall_hat":
        s.append(f'<path d="M{hx - hr * 0.85:.0f} {head_cy - hr * 0.55:.0f} L{hx - hr * 0.7:.0f} {head_cy - hr * 1.9:.0f} Q{hx:.0f} {head_cy - hr * 2.1:.0f} {hx + hr * 0.7:.0f} {head_cy - hr * 1.9:.0f} L{hx + hr * 0.85:.0f} {head_cy - hr * 0.55:.0f} Z" '
                 f'fill="{L["top"]}" stroke="{INK}" stroke-width="{OUT}"/>'
                 f'<path d="M{hx - hr * 0.8:.0f} {head_cy - hr * 0.9:.0f} H{hx + hr * 0.8:.0f} M{hx - hr * 0.75:.0f} {head_cy - hr * 1.4:.0f} H{hx + hr * 0.75:.0f}" stroke="{L["hat"]}" stroke-width="12"/>')
    elif hs == "bald":
        s.append(f'<ellipse cx="{hx - hr * 0.3:.0f}" cy="{head_cy - hr * 0.7:.0f}" rx="{hr * 0.25:.0f}" ry="{hr * 0.1:.0f}" fill="#fff" opacity="0.35"/>'
                 f'<path d="M{hx - hr * 1.0:.0f} {head_cy - hr * 0.05:.0f} q{hr * 0.1:.0f} -{hr * 0.4:.0f} {hr * 0.25:.0f} -{hr * 0.45:.0f} M{hx + hr * 1.0:.0f} {head_cy - hr * 0.05:.0f} q-{hr * 0.1:.0f} -{hr * 0.4:.0f} -{hr * 0.25:.0f} -{hr * 0.45:.0f}" stroke="{L["hair"]}" stroke-width="18" stroke-linecap="round" fill="none"/>')
    elif hs == "cap":
        s.append(f'<path d="M{hx - hr * 1.02:.0f} {head_cy - hr * 0.35:.0f} Q{hx:.0f} {head_cy - hr * 1.45:.0f} {hx + hr * 1.02:.0f} {head_cy - hr * 0.35:.0f} Z" fill="{L["cap"]}" stroke="{INK}" stroke-width="{OUT}"/>'
                 f'<path d="M{hx + (facing or 1) * hr * 0.2:.0f} {head_cy - hr * 0.4:.0f} q{(facing or 1) * hr * 0.9:.0f} 0 {(facing or 1) * hr * 1.05:.0f} {hr * 0.15:.0f} q-{(facing or 1) * hr * 0.5:.0f} {hr * 0.1:.0f} -{(facing or 1) * hr * 1.05:.0f} 0 Z" fill="{L["cap"]}" stroke="{INK}" stroke-width="{OUT - 2}"/>')
    else:
        s.append(f'<path d="M{hx - hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Q{hx - hr * 1.05:.0f} {head_cy - hr * 1.2:.0f} {hx:.0f} {head_cy - hr * 1.12:.0f} '
                 f'Q{hx + hr * 1.05:.0f} {head_cy - hr * 1.2:.0f} {hx + hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Q{hx + hr * 0.6:.0f} {head_cy - hr * 0.62:.0f} {hx:.0f} {head_cy - hr * 0.66:.0f} '
                 f'Q{hx - hr * 0.6:.0f} {head_cy - hr * 0.62:.0f} {hx - hr * 0.98:.0f} {head_cy - hr * 0.1:.0f} Z" fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT - 1}"/>')
        if hs == "braids":
            s.append(f'<circle cx="{hx - hr * 1.0:.0f}" cy="{head_cy + hr * 0.4:.0f}" r="{hr * 0.1:.0f}" fill="#f2c037" stroke="{INK}" stroke-width="3"/>')

    # visage
    fx = hx + facing * hr * 0.14
    big = emotion == "shock"
    ex_r, ey_r = hr * (0.27 if big else 0.21), hr * (0.33 if big else 0.25)
    eye_y = head_cy - hr * 0.08
    blink = (t % 3.3) < 0.12 and not big and not frozen
    for side in (-1, 1):
        ex = fx + side * hr * 0.37
        if emotion == "laugh" or blink:
            s.append(f'<path d="M{ex - ex_r:.0f} {eye_y:.0f} Q{ex:.0f} {eye_y - ey_r * (0.9 if emotion == "laugh" else -0.2):.0f} {ex + ex_r:.0f} {eye_y:.0f}" stroke="{INK}" stroke-width="9" fill="none" stroke-linecap="round"/>')
            continue
        s.append(f'<ellipse cx="{ex:.0f}" cy="{eye_y:.0f}" rx="{ex_r:.0f}" ry="{ey_r:.0f}" fill="#fff" stroke="{INK}" stroke-width="{OUT - 2}"/>')
        pr = ex_r * (0.38 if big else 0.55)
        px = ex + facing * ex_r * 0.35 + (0 if frozen else 0)
        s.append(f'<circle cx="{px:.0f}" cy="{eye_y + ey_r * 0.1:.0f}" r="{pr:.0f}" fill="#1a0f08"/>'
                 f'<circle cx="{px + pr * 0.35:.0f}" cy="{eye_y - pr * 0.3:.0f}" r="{pr * 0.32:.0f}" fill="#fff"/>')
        if emotion in ("smug", "unimpressed", "angry"):
            lid = {"smug": 0.45, "unimpressed": 0.5, "angry": 0.25}[emotion]
            s.append(f'<path d="M{ex - ex_r - 3:.0f} {eye_y - ey_r - 3:.0f} H{ex + ex_r + 3:.0f} V{eye_y - ey_r + ey_r * 2 * lid:.0f} H{ex - ex_r - 3:.0f} Z" fill="{skin}"/>'
                     f'<path d="M{ex - ex_r:.0f} {eye_y - ey_r + ey_r * 2 * lid:.0f} H{ex + ex_r:.0f}" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>')
    # sourcils
    for side in (-1, 1):
        ex = fx + side * hr * 0.37
        by = eye_y - ey_r - hr * (0.2 if big else 0.1)
        inner = {"angry": 26, "despair": -24, "sweat": -18, "shock": -10, "unimpressed": 0}.get(emotion, 0)
        if emotion == "unimpressed" and side == 1:
            by -= hr * 0.12
        x_in, x_out = ex - side * ex_r * 0.9, ex + side * ex_r * 1.1
        s.append(f'<path d="M{x_in:.0f} {by + inner * 0.5:.0f} Q{ex:.0f} {by - 14 - inner * 0.1:.0f} {x_out:.0f} {by - inner * 0.3:.0f}" stroke="{INK}" stroke-width="15" fill="none" stroke-linecap="round"/>')
    if L.get("glasses") or L.get("sunglasses"):
        dark = L.get("sunglasses")
        for side in (-1, 1):
            ex = fx + side * hr * 0.37
            s.append(f'<circle cx="{ex:.0f}" cy="{eye_y:.0f}" r="{ex_r * 1.25:.0f}" fill="{"#111" if dark else "#bfe6ff"}" '
                     f'fill-opacity="{0.92 if dark else 0.25}" stroke="{INK}" stroke-width="8"/>')
        s.append(f'<path d="M{fx - hr * 0.37 + ex_r * 1.25:.0f} {eye_y:.0f} H{fx + hr * 0.37 - ex_r * 1.25:.0f}" stroke="{INK}" stroke-width="8"/>')
        if dark:
            s.append(f'<path d="M{fx - hr * 0.5:.0f} {eye_y - ex_r * 0.6:.0f} l{ex_r * 0.5:.0f} -{ex_r * 0.2:.0f}" stroke="#fff" stroke-width="7" stroke-linecap="round"/>')
    if L.get("beard"):
        s.append(f'<path d="M{hx - hr * 0.8:.0f} {head_cy + hr * 0.25:.0f} Q{hx - hr * 0.7:.0f} {head_cy + hr * 1.7:.0f} {hx:.0f} {head_cy + hr * 1.9:.0f} '
                 f'Q{hx + hr * 0.7:.0f} {head_cy + hr * 1.7:.0f} {hx + hr * 0.8:.0f} {head_cy + hr * 0.25:.0f} Q{hx:.0f} {head_cy + hr * 0.7:.0f} {hx - hr * 0.8:.0f} {head_cy + hr * 0.25:.0f} Z" '
                 f'fill="{L["hair"]}" stroke="{INK}" stroke-width="{OUT - 2}"/>')
    if L.get("earrings"):
        for side in (-1, 1):
            s.append(f'<circle cx="{hx + side * hr * 1.0:.0f}" cy="{head_cy + hr * 0.45:.0f}" r="{hr * 0.2:.0f}" fill="none" stroke="#f2c037" stroke-width="9"/>')
    # nez
    s.append(f'<path d="M{fx - hr * 0.13:.0f} {head_cy + hr * 0.2:.0f} Q{fx:.0f} {head_cy + hr * 0.36:.0f} {fx + hr * 0.13:.0f} {head_cy + hr * 0.2:.0f}" '
             f'stroke="{INK}" stroke-width="7" fill="{skin_d}" stroke-linecap="round"/>')
    # bouche
    my = head_cy + hr * 0.55
    mw = hr * 0.36
    open_amt = (abs(math.sin(t * 15)) * 0.75 + 0.25) if speaking else 0
    if big:
        s.append(f'<ellipse cx="{fx:.0f}" cy="{my + hr * 0.05:.0f}" rx="{mw * 0.55:.0f}" ry="{hr * 0.24:.0f}" fill="#5a0c12" stroke="{INK}" stroke-width="6"/>'
                 f'<ellipse cx="{fx:.0f}" cy="{my + hr * 0.18:.0f}" rx="{mw * 0.3:.0f}" ry="{hr * 0.08:.0f}" fill="#e0606a"/>')
    elif emotion == "laugh" or (speaking and open_amt > 0):
        oh = hr * (0.32 if emotion == "laugh" else 0.06 + 0.22 * open_amt)
        s.append(f'<path d="M{fx - mw:.0f} {my:.0f} Q{fx:.0f} {my + oh * 2:.0f} {fx + mw:.0f} {my:.0f} Z" fill="#5a0c12" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<path d="M{fx - mw * 0.75:.0f} {my + 2:.0f} H{fx + mw * 0.75:.0f} V{my + oh * 0.35:.0f} H{fx - mw * 0.75:.0f} Z" fill="#fff"/>'
                 f'<ellipse cx="{fx:.0f}" cy="{my + oh * 0.95:.0f}" rx="{mw * 0.4:.0f}" ry="{oh * 0.35:.0f}" fill="#e0606a"/>')
    elif emotion == "smug":
        s.append(f'<path d="M{fx - mw:.0f} {my:.0f} Q{fx:.0f} {my + hr * 0.18:.0f} {fx + mw * 1.1:.0f} {my - hr * 0.12:.0f}" stroke="{INK}" stroke-width="9" fill="none" stroke-linecap="round"/>')
    elif emotion == "sweat":
        s.append(f'<rect x="{fx - mw:.0f}" y="{my - hr * 0.05:.0f}" width="{mw * 2:.0f}" height="{hr * 0.16:.0f}" rx="12" fill="#fff" stroke="{INK}" stroke-width="6"/>'
                 f'<path d="M{fx - mw * 0.33:.0f} {my - hr * 0.05:.0f} v{hr * 0.16:.0f} M{fx + mw * 0.33:.0f} {my - hr * 0.05:.0f} v{hr * 0.16:.0f}" stroke="{INK}" stroke-width="4"/>')
    elif emotion in ("angry", "despair", "unimpressed"):
        s.append(f'<path d="M{fx - mw * 0.8:.0f} {my + hr * 0.08:.0f} Q{fx:.0f} {my - hr * 0.1:.0f} {fx + mw * 0.8:.0f} {my + hr * 0.08:.0f}" stroke="{INK}" stroke-width="9" fill="none" stroke-linecap="round"/>')
    else:
        s.append(f'<path d="M{fx - mw * 0.8:.0f} {my:.0f} Q{fx:.0f} {my + hr * 0.15:.0f} {fx + mw * 0.8:.0f} {my:.0f}" stroke="{INK}" stroke-width="9" fill="none" stroke-linecap="round"/>')
    if emotion == "laugh":
        for side in (-1, 1):
            s.append(f'<ellipse cx="{fx + side * hr * 0.6:.0f}" cy="{head_cy + hr * 0.35:.0f}" rx="{hr * 0.16:.0f}" ry="{hr * 0.09:.0f}" fill="#e8607a" opacity="0.55"/>')
    s.append('</g>')  # tête
    s.append('</g>')  # buste

    if L.get("stethoscope"):
        s.append(f'<path d="M{hx - hr * 0.5:.0f} {sh_y - 5:.0f} Q{hx - hr * 0.6:.0f} {sh_y + 160:.0f} {hx:.0f} {sh_y + 170:.0f} Q{hx + hr * 0.6:.0f} {sh_y + 160:.0f} {hx + hr * 0.5:.0f} {sh_y - 5:.0f}" '
                 f'fill="none" stroke="#333" stroke-width="10"/><circle cx="{hx:.0f}" cy="{sh_y + 175:.0f}" r="18" fill="#bbb" stroke="{INK}" stroke-width="5"/>')
    if L.get("basket"):
        top_hy = head_cy - hr * 1.9
        s.append(f'<ellipse cx="{hx:.0f}" cy="{top_hy:.0f}" rx="{hr * 1.1:.0f}" ry="{hr * 0.3:.0f}" fill="#c98f52" stroke="{INK}" stroke-width="{OUT}"/>'
                 + "".join(f'<circle cx="{hx + dx * hr:.0f}" cy="{top_hy - hr * 0.25 - abs(dx) * -hr * 0.1:.0f}" r="{hr * 0.22:.0f}" fill="#e8213c" stroke="{INK}" stroke-width="4"/>'
                           for dx in (-0.6, -0.2, 0.2, 0.6, 0.0)))
    # effets comiques
    top_y = head_cy - hr * (2.1 if hs == "headwrap" else 1.3)
    side_x = hx + (facing or 1) * -hr * 0.9
    if emotion == "sweat" or (emotion == "despair" and speaking):
        for k in range(3):
            yy = head_cy - hr * 0.6 + ((t * 120 + k * 60) % 160)
            xx = hx + (hr * 0.95 if k % 2 else -hr * 1.0)
            s.append(f'<path d="M{xx:.0f} {yy - 22:.0f} q14 22 0 34 q-14 -12 0 -34 Z" fill="#7fc8ff" stroke="{INK}" stroke-width="4"/>')
    if emotion == "angry" and speaking:
        vx, vy = hx + hr * 0.7, head_cy - hr * 0.95
        pop = 1 + 0.18 * abs(math.sin(t * 14))
        s.append(f'<g transform="translate({vx:.0f},{vy:.0f}) scale({pop:.2f})" stroke="#e8213c" stroke-width="10" fill="none" stroke-linecap="round">'
                 '<path d="M-28 -8 q20 0 20 -20 M8 -28 q0 20 20 20 M28 8 q-20 0 -20 20 M-8 28 q0 -20 -20 -20"/></g>'
                 f'<text x="{side_x:.0f}" y="{top_y:.0f}" font-family="DejaVu Sans" font-weight="bold" font-size="{110 * pop:.0f}" fill="#e8213c" stroke="{INK}" stroke-width="5" text-anchor="middle">!!</text>')
    if emotion == "shock":
        pop = 1 + (0.15 * abs(math.sin(t * 10)) if not frozen else 0.1)
        s.append(f'<text x="{hx:.0f}" y="{top_y:.0f}" font-family="DejaVu Sans" font-weight="bold" font-size="{120 * pop:.0f}" fill="#ffd21f" stroke="{INK}" stroke-width="6" text-anchor="middle">?!</text>')
        for k in range(6):
            a = math.radians(200 + k * 28)
            r1, r2 = hr * 1.45, hr * 1.8
            s.append(f'<path d="M{hx + r1 * math.cos(a):.0f} {head_cy + r1 * math.sin(a):.0f} L{hx + r2 * math.cos(a):.0f} {head_cy + r2 * math.sin(a):.0f}" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>')
    return "".join(s), (hx, head_cy, hr)


# --- rendu ----------------------------------------------------------------------------------

def _png(svg: str) -> Image.Image:
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).convert("RGBA")


def render_clip(scene: dict, index: int, dest: Path, setting: str = "cour", is_last: bool = False,
                title: str = "", min_seconds: float = 8.0) -> Path:
    workdir = dest.parent
    lines = scene.get("dialogue") or []
    duration = animatic.needed_duration(lines, workdir, index, min_seconds)
    freeze = 1.6 if is_last else 0
    duration += freeze
    audio = animatic.build_audio(lines, workdir, index, duration)
    events = []
    if scene.get("beat") == "twist":
        events.append(("dun", 0.0))
    if scene.get("beat") == "hook":
        events.append(("whoosh", 0.0))
    if is_last:
        events.append(("boing", duration - freeze))
    audio = animatic.add_sfx(audio, events, workdir / f"audio_fx_{index:02d}.wav", duration)

    bg = _png(background_svg(setting, scene["image_prompt"])).convert("RGB")
    names = scene["characters"][:3]
    xs = {1: [540], 2: [290, 790], 3: [190, 540, 890]}.get(len(names), [])
    emotions = {nm: animatic.emotion_for(nm, scene["image_prompt"]) for nm in names}
    beat = scene.get("beat", "")

    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                             "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(audio), "-c:v", "libx264",
                             "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                             str(dest)], stdin=subprocess.PIPE)
    frames = int(duration * FPS)
    focus = None
    for f in range(frames):
        t = f / FPS
        frozen = is_last and t >= duration - freeze
        line = next((l for l in lines if l.get("start", 0) <= t < l.get("end", 0)), None)
        speaker = line["speaker"] if line else None
        layer, heads = [], {}
        for k, nm in enumerate(names):
            facing = 1 if xs[k] < 540 else -1 if xs[k] > 540 else 0
            emo = emotions[nm]
            if frozen and nm == names[-1]:
                emo, facing = "shock", 0
            svg, heads[nm] = character_svg(nm, xs[k], emo, 0 if frozen else t, speaker == nm and not frozen,
                                           facing, scene["image_prompt"], frozen)
            layer.append(svg)
        img = bg.copy()
        chars = _png(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">{"".join(layer)}</svg>')
        img.paste(chars, (0, 0), mask=chars)
        # caméra
        if frozen:
            focus = focus or heads[names[-1]]
            k = min(1, (t - (duration - freeze)) / 0.2)
            z, fx, fy = 1 + 1.1 * k, focus[0], focus[1] + focus[2] * 0.3
        else:
            z = 1.04 + 0.08 * (t / duration)
            if beat in ("twist", "chute"):
                z += 0.25 * max(0, 1 - t / 0.3)
            fx = heads[speaker][0] * 0.35 + 540 * 0.65 if speaker in heads else 540
            fy = H * 0.55
            if line and "!" in line["text"] and t - line["start"] < 0.45:
                fx += 14 * math.sin(t * 95)
                fy += 10 * math.cos(t * 80)
        cw, ch = W / z, H / z
        x0 = min(max(fx - cw / 2, 0), W - cw)
        y0 = min(max(fy - ch / 2, 0), H - ch)
        frame = img.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
        if frozen and t - (duration - freeze) < 0.1:
            frame = Image.blend(frame, Image.new("RGB", (W, H), (255, 255, 255)), 0.55)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    return dest
