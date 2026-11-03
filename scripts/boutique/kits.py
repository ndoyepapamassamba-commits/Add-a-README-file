"""Kits à imprimer de Teranga Outils : un document complet (guide, check-lists, modèles de lettres, plannings, carnets)
vendu une fois pour tous, livré en PDF (à imprimer) et en Word (modifiable).

La fiche d'un kit : {"famille": "kit", "titre", "domaine", "accroche", "description", "points", "faq", "prix",
 "document": {"titre", "sous_titre"?, "sections": [{"titre", "paragraphes"?, "puces"?, "cases"?, "tableau"?: {"colonnes", "lignes"}}]}}
- "puces" : liste à puces ; "cases" : liste à cocher (☐) ; "tableau" : grille à remplir ou exemple chiffré.
Le Word est construit avec python-docx, le PDF par LibreOffice (même rendu), puis tout est contrôlé avant dépôt.
"""
import json, os, re, shutil, subprocess, tempfile, unicodedata

VERT = "0B6E4F"
INTERDITS = re.compile(r"\b(attestation|certificat|diplome|fiche de paie|bulletin de salaire|ordonnance|medicament|diagnostic medical|posologie|casino|paris sportifs?|pari|crypto|bitcoin|forex|arme|adulte|sexe|faux|contrefa)")
CONTACTS = re.compile(r"https?://|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b(?:\+?221)?\s?7[05678]\s?\d{3}\s?\d{2}\s?\d{2}\b")
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

CONSIGNE_KIT = """Tu conçois des KITS À IMPRIMER vendus 500 à 3000 F CFA à des particuliers et petites entreprises du Sénégal et d'Afrique francophone.
Un kit = un document COMPLET et directement utilisable (guide pratique, check-lists, modèles de lettres ou de messages à recopier, plannings,
carnets de suivi, fiches à remplir), livré en PDF et en Word. Il doit valoir plus que son prix : concret, précis, adapté au contexte local.
Réponds UNIQUEMENT par un objet JSON avec exactement ces clés :
{"titre": "…(10-90 car.)", "domaine": "…(3-40 car.)", "accroche": "…(20-220 car.)", "description": "…(150-1500 car., texte de vente honnête)",
 "points": ["3 à 6 bénéfices concrets"], "faq": [{"q": "…", "r": "…"}] (3 questions), "prix": entier entre 500 et 3000,
 "document": {"titre": "…", "sous_titre": "…", "sections": [
   {"titre": "…", "paragraphes": ["…"], "puces": ["…"], "cases": ["éléments d'une liste à cocher"], "tableau": {"colonnes": ["…"], "lignes": [["…"]]}}
 ] (6 à 14 sections ; chaque section a au moins un paragraphe, une liste ou un tableau ; 1500 à 4000 mots au total)}}
RÈGLES : exemples fictifs mais réalistes (prénoms et lieux sénégalais, montants en F CFA avec calculs JUSTES), aucune donnée personnelle réelle,
aucun numéro de téléphone, lien ou e-mail. Les tableaux à remplir ont des lignes vides ("") pour écrire à la main.
INTERDITS : documents officiels ou administratifs (attestation, certificat, diplôme, fiche de paie, contrat, statuts), santé et médicaments,
conseil juridique ou financier engageant, jeux d'argent, crypto, politique, religion, promesse de gain.
Écris en français simple, sans faute."""


def sans_acc(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()


def texte_document(d):
    morceaux = [d.get("titre", ""), d.get("sous_titre", "")]
    for s in d.get("sections") or []:
        morceaux.append(s.get("titre", ""))
        morceaux += [str(x) for x in (s.get("paragraphes") or []) + (s.get("puces") or []) + (s.get("cases") or [])]
        t = s.get("tableau") or {}
        morceaux += [str(x) for x in t.get("colonnes") or []]
        for li in t.get("lignes") or []:
            morceaux += [str(x) for x in li]
    return " ".join(morceaux)


def controler_kit(k):
    pb = []
    for cle, mn, mx in (("titre", 10, 100), ("domaine", 3, 40), ("accroche", 20, 220), ("description", 150, 2500)):
        v = k.get(cle)
        if not isinstance(v, str) or not (mn <= len(v.strip()) <= mx):
            pb.append(f"{cle} : longueur hors de {mn}-{mx}")
    if not isinstance(k.get("prix"), int) or not 500 <= k["prix"] <= 3000:
        pb.append("prix entre 500 et 3000 F")
    if not isinstance(k.get("points"), list) or not 3 <= len(k["points"]) <= 8:
        pb.append("3 à 8 points forts")
    if not isinstance(k.get("faq"), list) or not 2 <= len(k["faq"]) <= 6 or not all(isinstance(x, dict) and x.get("q") and x.get("r") for x in k["faq"]):
        pb.append("2 à 6 questions-réponses {q, r}")
    d = k.get("document")
    if not isinstance(d, dict) or not isinstance(d.get("titre"), str) or not d["titre"].strip():
        return pb + ["document : titre manquant"]
    secs = d.get("sections")
    if not isinstance(secs, list) or not 4 <= len(secs) <= 20:
        return pb + ["document : 4 à 20 sections"]
    for i, s in enumerate(secs, 1):
        if not isinstance(s, dict) or not isinstance(s.get("titre"), str) or not s["titre"].strip():
            pb.append(f"section {i} : titre manquant"); continue
        for cle in ("paragraphes", "puces", "cases"):
            if cle in s and not (isinstance(s[cle], list) and all(isinstance(x, str) for x in s[cle])):
                pb.append(f"section {i} : {cle} invalide")
        t = s.get("tableau")
        if t is not None:
            cols, lignes = t.get("colonnes") if isinstance(t, dict) else None, t.get("lignes") if isinstance(t, dict) else None
            if not (isinstance(cols, list) and 2 <= len(cols) <= 8 and isinstance(lignes, list) and 1 <= len(lignes) <= 40
                    and all(isinstance(li, list) and len(li) == len(cols) for li in lignes)):
                pb.append(f"section {i} : tableau invalide (2 à 8 colonnes, lignes de même longueur)")
        if not (s.get("paragraphes") or s.get("puces") or s.get("cases") or s.get("tableau")):
            pb.append(f"section {i} : vide")
    mots = len(re.findall(r"\w+", texte_document(d)))
    if not 700 <= mots <= 7000:
        pb.append(f"document : {mots} mots (700 à 7000 attendus)")
    tout = sans_acc(json.dumps(k, ensure_ascii=False))
    if INTERDITS.search(tout):
        pb.append("sujet interdit : " + INTERDITS.search(tout).group(0))
    if re.search(r"\b(contrat|statuts?|procuration|religion|politique)\b", sans_acc(" ".join(str(k.get(c, "")) for c in ("titre", "accroche", "description")))):
        pb.append("document officiel, juridique, religieux ou politique")
    if CONTACTS.search(tout):
        pb.append("lien, e-mail ou numéro de téléphone dans les textes")
    return pb


def _ombrer(cellule, couleur):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    tc = cellule._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd"); sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), couleur)
    tc.append(sh)


def construire_kit(k, chemin_docx):
    """Écrit le Word du kit (page de titre, sections, listes, cases à cocher, tableaux)."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor, Cm
    d = k["document"]
    doc = Document()
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(2); s.top_margin = s.bottom_margin = Cm(1.8)
    st = doc.styles["Normal"]; st.font.name = "Calibri"; st.font.size = Pt(11)
    vert = RGBColor.from_string(VERT)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(d["titre"]); r.bold = True; r.font.size = Pt(24); r.font.color.rgb = vert
    if d.get("sous_titre"):
        p = doc.add_paragraph(); r = p.add_run(d["sous_titre"]); r.italic = True; r.font.size = Pt(13)
    p = doc.add_paragraph(); r = p.add_run(f"{k['domaine']} · Teranga Outils"); r.font.size = Pt(10); r.font.color.rgb = RGBColor(0x59, 0x63, 0x5E)
    for s in d["sections"]:
        h = doc.add_heading(s["titre"], level=1)
        for run in h.runs:
            run.font.color.rgb = vert
        for x in s.get("paragraphes") or []:
            doc.add_paragraph(x)
        for x in s.get("puces") or []:
            doc.add_paragraph(x, style="List Bullet")
        for x in s.get("cases") or []:
            doc.add_paragraph("☐  " + x)
        t = s.get("tableau")
        if t:
            tab = doc.add_table(rows=1 + len(t["lignes"]), cols=len(t["colonnes"]))
            tab.style = "Table Grid"
            for j, c in enumerate(t["colonnes"]):
                cel = tab.rows[0].cells[j]; cel.text = ""
                run = cel.paragraphs[0].add_run(str(c)); run.bold = True; run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                _ombrer(cel, VERT)
            for i, li in enumerate(t["lignes"], 1):
                for j, v in enumerate(li):
                    tab.rows[i].cells[j].text = str(v)
            doc.add_paragraph()
    p = doc.add_paragraph(); r = p.add_run("Kit Teranga Outils. Usage personnel ou dans votre activité ; revente interdite.")
    r.italic = True; r.font.size = Pt(9)
    doc.save(chemin_docx)


def en_pdf(chemin_docx, dossier):
    """PDF par LibreOffice (profil isolé, sans interface)."""
    profil = tempfile.mkdtemp(prefix="lo-kit-")
    try:
        subprocess.run(["soffice", f"-env:UserInstallation=file://{profil}", "--headless", "--convert-to", "pdf", "--outdir", dossier, chemin_docx],
                       check=True, capture_output=True, timeout=180)
    finally:
        shutil.rmtree(profil, ignore_errors=True)
    return os.path.splitext(chemin_docx)[0] + ".pdf"


def pages_pdf(chemin_pdf):
    try:
        out = subprocess.run(["pdfinfo", chemin_pdf], capture_output=True, text=True, timeout=30).stdout
        m = re.search(r"^Pages:\s+(\d+)", out, re.M)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    data = open(chemin_pdf, "rb").read()
    return len(re.findall(rb"/Type\s*/Page[^s]", data))


def verifier_kit(k, chemin_docx, chemin_pdf):
    """Relit le Word, contrôle le PDF ; renvoie (problèmes, aperçu public)."""
    from docx import Document
    pb = []
    try:
        doc = Document(chemin_docx)
        texte = " ".join(p.text for p in doc.paragraphs)
        if len(re.findall(r"\w+", texte)) < 400:
            pb.append("Word : texte trop court après relecture")
    except Exception as e:
        pb.append(f"Word illisible : {e}")
    if not os.path.exists(chemin_pdf) or os.path.getsize(chemin_pdf) < 8000:
        pb.append("PDF absent ou vide")
        return pb, None
    n = pages_pdf(chemin_pdf)
    if n < 2:
        pb.append(f"PDF : {n} page(s), 2 au moins attendues")
    d = k["document"]
    extrait = []
    for s in d["sections"][:2]:
        e = {"titre": s["titre"]}
        if s.get("paragraphes"):
            e["paragraphes"] = [s["paragraphes"][0][:600]]
        liste = (s.get("puces") or s.get("cases") or [])[:5]
        if liste:
            e["puces"] = [x[:200] for x in liste]
        if not e.get("paragraphes") and not e.get("puces") and s.get("tableau"):
            e["paragraphes"] = ["Tableau : " + ", ".join(str(c) for c in s["tableau"]["colonnes"])]
        extrait.append(e)
    apercu = {"type": "document", "titre": d["titre"], "sous_titre": d.get("sous_titre", ""), "pages": n,
              "sections_titres": [s["titre"] for s in d["sections"]], "extrait": extrait}
    return pb, apercu
