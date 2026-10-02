# Génère le mail couleur bilingue : mail_cv.html (aperçu / copie) et mail_cv.eml (brouillon Outlook, photo intégrée en cid)
import base64, email.utils, pathlib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.application import MIMEApplication
from email.header import Header

HERE = pathlib.Path(__file__).parent
CV = HERE.parent
F = "Segoe UI,Helvetica,Arial,sans-serif"
MARINE, ECO, LIME, LEAF, INK, INK2, TINT = "#00415E", "#005C83", "#8CC63F", "#4E8A2E", "#12333F", "#3E5C6B", "#EEF4F7"

TOOLS = [
  ("#00415E", "Portefeuille ESN · ACTE7", "ESN Portfolio · ACTE7",
   "Classification BCEAO / IFRS 9 de plus de 16&nbsp;000 contrats par arrêté.", "BCEAO / IFRS 9 classification of 16,000+ facilities per closing."),
  ("#0A6F95", "Impairment Data Template", "Impairment Data Template",
   "Remplissage et contrôles automatiques au format Groupe.", "Automatic filling and controls, delivered in the Group template format."),
  ("#4E8A2E", "FODEP & Centrale des Risques", "FODEP & Central Risk Register",
   "Alimentation depuis le portefeuille consolidé, contrôles avant envoi.", "Fed from the consolidated portfolio, checked before filing."),
  ("#8CC63F", "Pilotage COMEX", "Executive reporting",
   "Tableaux de bord PDO / NPL, exports Excel, PowerPoint, Word, Outlook.", "PDO / NPL dashboards, Excel, PowerPoint, Word, Outlook exports."),
]

def tiles(lang):
    i = 1 if lang == "fr" else 2
    rows = ""
    for r in range(0, 4, 2):
        cells = ""
        for c, t in enumerate(TOOLS[r:r+2]):
            pad = "padding:0 6px 12px 0;" if c == 0 else "padding:0 0 12px 6px;"
            cells += f'''<td width="50%" valign="top" height="100%" style="{pad}height:100%;">
<table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="height:100%;background:{TINT};border-left:4px solid {t[0]};">
<tr><td valign="top" style="padding:12px 14px;font-family:{F};">
<div style="font-size:14px;font-weight:bold;color:{MARINE};line-height:1.3;">{t[i]}</div>
<div style="font-size:12.5px;color:{INK2};line-height:1.45;padding-top:4px;">{t[i+2]}</div>
</td></tr></table></td>'''
        rows += f"<tr>{cells}</tr>"
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>'

def button(info):
    name, hint = info
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F8EA;border:1px solid #CFE6B0;">
<tr><td width="52" valign="middle" style="padding:12px 0 12px 14px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="{ECO}" style="background:{ECO};border-radius:6px;padding:8px 7px;font-family:Consolas,monospace;font-size:11px;font-weight:bold;color:#FFFFFF;">HTML</td></tr></table></td>
<td valign="middle" style="padding:12px 14px;font-family:{F};">
<div style="font-family:Consolas,monospace;font-size:13px;font-weight:bold;color:{MARINE};">{name}</div>
<div style="font-size:12.5px;color:{INK2};line-height:1.45;padding-top:3px;">{hint}</div>
</td></tr></table>'''

def section(lang):
    if lang == "fr":
        tag, hello = "VERSION FRANÇAISE", "Bonjour Serge,"
        p1 = "Comme demandé, je vous transmets mon CV en pièce jointe, en français et en anglais."
        p2 = ("Vous y trouverez notamment les automatisations que j'ai réalisées au sein du "
              "Credit Administration Department d'Ecobank Sénégal :")
        p3 = "Je joins également une version interactive du CV, qui présente une démonstration animée de chaque outil :"
        btn, p4, bye = ("CV_NDOYE_Papa_Massamba.html", "Double-cliquez sur la pièce jointe : elle s'ouvre dans votre navigateur (Chrome ou Edge), sans installation ni connexion."), "Je reste à votre disposition pour tout complément d'information.", "Bien cordialement,"
    else:
        tag, hello = "ENGLISH VERSION", "Hello Serge,"
        p1 = "As requested, please find my CV attached, in French and English."
        p2 = "It includes the automations I built within Ecobank Senegal's Credit Administration Department:"
        p3 = "I am also attaching an interactive version of the CV, with an animated demonstration of each tool:"
        btn, p4, bye = ("CV_NDOYE_Papa_Massamba.html", "Double-click the attachment: it opens in your browser (Chrome or Edge), with no installation or internet connection needed."), "Please do not hesitate to contact me should you need any further information.", "Kind regards,"
    P = f"font-family:{F};font-size:15px;line-height:1.6;color:{INK};margin:0 0 14px 0;"
    return f'''<tr><td style="padding:28px 32px 8px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:{F};font-size:11px;font-weight:bold;letter-spacing:2px;color:{ECO};border-bottom:3px solid {LIME};padding-bottom:4px;">{tag}</td></tr></table>
<p style="{P}padding-top:18px;">{hello}</p>
<p style="{P}">{p1}</p>
<p style="{P}">{p2}</p>
{tiles(lang)}
<p style="{P}padding-top:6px;">{p3}</p>
{button(btn)}
<p style="{P}padding-top:18px;">{p4}</p>
<p style="{P}margin-bottom:0;">{bye}</p>
</td></tr>'''

def build(photo_src):
    return f'''<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CV – Papa Massamba NDOYE</title></head>
<body style="margin:0;padding:0;background:#E9F1F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E9F1F6" style="background:#E9F1F6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;max-width:100%;background:#FFFFFF;">

<tr><td bgcolor="{MARINE}" style="background:{MARINE};background-image:linear-gradient(135deg,#0A6F95 0%,{ECO} 40%,{MARINE} 100%);padding:28px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="104" valign="middle" style="padding-right:22px;">
<img src="{photo_src}" width="96" height="96" alt="Papa Massamba NDOYE" style="display:block;width:96px;height:96px;border-radius:48px;border:3px solid {LIME};"></td>
<td valign="middle" style="font-family:{F};">
<div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#A6D867;">ECOBANK SÉNÉGAL · CREDIT ADMINISTRATION</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#FFFFFF;padding-top:6px;">Papa Massamba <b>NDOYE</b></div>
<div style="font-size:14px;line-height:1.45;color:#DDEBF1;padding-top:6px;">Reporting Credit Risk, BCEAO &amp; Groupe · Automatisation<br>
<span style="color:#B9D3DF;">Credit Risk, BCEAO &amp; Group reporting · Automation</span></div>
</td></tr></table></td></tr>
<tr><td height="4" bgcolor="{LIME}" style="background:{LIME};font-size:0;line-height:0;">&nbsp;</td></tr>

{section("fr")}
<tr><td style="padding:22px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#CFE0E7" style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
{section("en")}

<tr><td style="padding:26px 32px 28px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:3px solid {LIME};"><tr>
<td style="padding-top:14px;font-family:{F};">
<div style="font-size:16px;font-weight:bold;color:{MARINE};">Papa Massamba NDOYE</div>
<div style="font-size:13px;color:{INK2};line-height:1.5;">Agent CAD – Reportings réglementaires &amp; Groupe | CAD Officer – Regulatory &amp; Group Reporting<br>Ecobank Sénégal · Dakar</div>
<div style="font-size:13px;color:{ECO};padding-top:6px;white-space:nowrap;">+221 77 659 30 79 &nbsp;|&nbsp; <a href="mailto:pndoye@ecobank.com" style="color:{ECO};text-decoration:none;">pndoye@ecobank.com</a></div>
</td></tr></table></td></tr>

<tr><td bgcolor="{MARINE}" style="background:{MARINE};padding:12px 32px;font-family:{F};font-size:11px;color:#B9D3DF;">
Pièces jointes / Attachments : CV_NDOYE_Papa_Massamba.html · CV_NDOYE_Papa_Massamba_FR.pdf · CV_NDOYE_Papa_Massamba_EN.pdf</td></tr>
</table></td></tr></table></body></html>'''

photo = (CV / "photo.jpg").read_bytes()
# Aperçu / copier-coller : photo en data URI
(HERE / "mail_cv.html").write_text(build("data:image/jpeg;base64," + base64.b64encode(photo).decode()), encoding="utf-8")

# Brouillon Outlook : multipart/mixed > related(html + photo cid) + PDF
msg = MIMEMultipart("mixed")
msg["Subject"] = Header("CV – Papa Massamba NDOYE", "utf-8")
msg["To"] = ""
msg["Date"] = email.utils.formatdate(localtime=True)
msg["X-Unsent"] = "1"
rel = MIMEMultipart("related")
rel.attach(MIMEText(build("cid:photo_pmn"), "html", "utf-8"))
img = MIMEImage(photo, "jpeg"); img.add_header("Content-ID", "<photo_pmn>"); img.add_header("Content-Disposition", "inline", filename="photo.jpg")
rel.attach(img); msg.attach(rel)
h = MIMEText((CV / "CV_NDOYE_Papa_Massamba.html").read_text(encoding="utf-8"), "html", "utf-8")
h.add_header("Content-Disposition", "attachment", filename="CV_NDOYE_Papa_Massamba.html"); msg.attach(h)
for l in ("FR", "EN"):
    n = f"CV_NDOYE_Papa_Massamba_{l}.pdf"
    a = MIMEApplication((CV / n).read_bytes(), "pdf"); a.add_header("Content-Disposition", "attachment", filename=n); msg.attach(a)
(HERE / "mail_cv.eml").write_bytes(msg.as_bytes())
print("ok")
