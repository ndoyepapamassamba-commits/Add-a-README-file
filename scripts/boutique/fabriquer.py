#!/usr/bin/env python3
"""Fabrique de Teranga Outils : conçoit, construit, VÉRIFIE et dépose chaque jour des outils Excel prêts à vendre.

Chaque produit part d'une fiche JSON (domaine, titre, textes de vente, classeur décrit par feuilles et colonnes). La fiche
est écrite par un modèle de GitHub Models (gratuit, jeton de la tâche GitHub Actions) ou fournie à la main (--fiches).
Le classeur est construit avec openpyxl, recalculé par LibreOffice, puis contrôlé : aucune erreur de formule, exemples
remplis, tableau de bord chiffré, sujets interdits absents, textes complets. Seuls les produits contrôlés sont déposés
(fonction Edge « boutique », jeton OIDC de GitHub : aucun secret). Ils sont publiés 24 h plus tard, sauf refus.

  python3 fabriquer.py --nombre 5                      # GitHub Actions : fiches par le modèle, dépôt
  python3 fabriquer.py --fiches fiches.json --sortie d # fiches fournies, classeurs écrits dans d, sans dépôt
"""
import argparse, base64, hashlib, json, os, random, re, shutil, subprocess, sys, tempfile, time, unicodedata, urllib.request
from datetime import date

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

API = os.environ.get("BOUTIQUE_API", "https://seegnylaubuularegmku.supabase.co/functions/v1/boutique")
MODELES_URL = os.environ.get("MODELES_URL", "https://models.github.ai/inference/chat/completions")
MODELE = os.environ.get("MODELE", "openai/gpt-4.1-mini")
AUDIENCE = "teranga-boutique"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
VERT, VERT_CLAIR, GRIS = "0B6E4F", "E7F3EE", "59635E"

# Domaines variés de la vie et du travail au Sénégal et en Afrique francophone (rotation : jamais deux fois de suite)
DOMAINES = [
    "Commerce de détail (boutique de quartier)", "Restauration et dibiterie", "Maraîchage et agriculture", "Élevage (volaille, moutons)",
    "Pêche et vente de poisson", "Transport (taxi, moto, livraison)", "Bâtiment et chantiers", "Couture et atelier de mode",
    "Coiffure et esthétique", "Location immobilière (loyers)", "Enseignants et écoles privées", "Étudiants et révisions",
    "Tontines et épargne", "Événements familiaux (mariage, baptême)", "Budget du foyer et courses", "Recherche d'emploi",
    "Freelances et prestataires", "Associations et groupements", "Gestion de projet et ONG", "Boulangerie et pâtisserie",
    "Garage et mécanique", "Vente en ligne et réseaux sociaux", "Import et revente de marchandises", "Sport et forme (sans conseil médical)",
    "Voyage et organisation de séjours", "Cantine et traiteur", "Quincaillerie", "Cosmétiques artisanaux", "Agents immobiliers", "Petites entreprises de nettoyage",
]
INTERDITS = re.compile(r"\b(attestation|certificat|diplome|fiche de paie|bulletin de salaire|ordonnance|medicament|diagnostic medical|posologie|casino|paris sportifs?|pari|crypto|bitcoin|forex|arme|adulte|sexe|faux|contrefa)")
ERREURS = re.compile(r"^(#DIV/0!|#REF!|#NAME\?|#VALUE!|#N/A|#NUM!|#NULL!|Err:\d+|#ERR)")
FORMATS = {"montant": '#,##0 "F"', "nombre": "#,##0", "decimal": "#,##0.00", "pourcentage": "0%", "date": "dd/mm/yyyy", "texte": "@", "liste": "@"}


def sans_acc(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()


def slugifier(s):
    s = re.sub(r"[^a-z0-9]+", "-", sans_acc(s)).strip("-")
    return s[:70].rstrip("-")


# ------------------------------------------------------------------ Contrôle de la fiche (avant construction)
def controler_fiche(f):
    pb = []
    for k, mn, mx in (("titre", 10, 100), ("domaine", 3, 40), ("accroche", 20, 220), ("description", 150, 2500)):
        v = f.get(k)
        if not isinstance(v, str) or not (mn <= len(v.strip()) <= mx):
            pb.append(f"{k} : longueur hors de {mn}-{mx}")
    if not isinstance(f.get("prix"), int) or not 500 <= f["prix"] <= 5000:
        pb.append("prix entre 500 et 5000 F")
    if not isinstance(f.get("points"), list) or not 3 <= len(f["points"]) <= 8:
        pb.append("3 à 8 points forts")
    if not isinstance(f.get("faq"), list) or not 2 <= len(f["faq"]) <= 6 or not all(isinstance(x, dict) and x.get("q") and x.get("r") for x in f["faq"]):
        pb.append("2 à 6 questions-réponses {q, r}")
    if not isinstance(f.get("mode_emploi"), list) or not 3 <= len(f["mode_emploi"]) <= 10:
        pb.append("mode d'emploi : 3 à 10 étapes")
    texte = sans_acc(json.dumps(f, ensure_ascii=False))
    if INTERDITS.search(texte):
        pb.append("sujet interdit : " + INTERDITS.search(texte).group(0))
    if re.search(r"https?://|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b(?:\+?221)?\s?7[05678]\s?\d{3}\s?\d{2}\s?\d{2}\b", texte):
        pb.append("lien, e-mail ou numéro de téléphone dans les textes")
    c = f.get("classeur") or {}
    feuilles = c.get("feuilles") or []
    if not 1 <= len(feuilles) <= 4:
        pb.append("1 à 4 feuilles de données")
    noms = set()
    for fe in feuilles:
        nom = str(fe.get("nom", ""))
        if not re.fullmatch(r"[A-Za-zÀ-ÿ0-9 ]{2,28}", nom) or nom in noms or sans_acc(nom) in ("mode d'emploi", "tableau de bord"):
            pb.append(f"nom de feuille invalide : {nom!r}")
        noms.add(nom)
        cols = fe.get("colonnes") or []
        if not 3 <= len(cols) <= 14:
            pb.append(f"{nom} : 3 à 14 colonnes")
        for col in cols:
            if col.get("type") not in FORMATS:
                pb.append(f"{nom} : type de colonne inconnu {col.get('type')!r}")
            fo = col.get("formule")
            if fo and (not str(fo).startswith("=") or "{r}" not in str(fo) or re.search(r"(?i)\b(INDIRECT|HYPERLINK|WEBSERVICE|CALL|EXEC)\b|\[", str(fo))):
                pb.append(f"{nom} : formule refusée {fo!r}")
            if col.get("type") == "liste" and not (isinstance(col.get("choix"), list) and 2 <= len(col["choix"]) <= 12):
                pb.append(f"{nom} : liste sans choix")
        lignes = fe.get("exemples") or []
        if not 3 <= len(lignes) <= 12:
            pb.append(f"{nom} : 3 à 12 lignes d'exemple")
        saisies = [i for i, col in enumerate(cols) if not col.get("formule")]
        for li in lignes:
            if not isinstance(li, list) or len(li) != len(saisies):
                pb.append(f"{nom} : chaque exemple doit donner une valeur par colonne de saisie ({len(saisies)})")
                break
    synth = c.get("synthese") or []
    if not 3 <= len(synth) <= 12:
        pb.append("tableau de bord : 3 à 12 indicateurs")
    for s in synth:
        if not str(s.get("formule", "")).startswith("=") or not s.get("libelle") or s.get("type") not in FORMATS:
            pb.append(f"indicateur invalide : {s!r}"[:120])
    return pb


# ------------------------------------------------------------------ Construction du classeur
def bordure():
    t = Side(style="thin", color="DFE3DE")
    return Border(left=t, right=t, top=t, bottom=t)


def construire(f, chemin, vides=60):
    wb = Workbook()
    me = wb.active
    me.title = "Mode d'emploi"
    me.sheet_view.showGridLines = False
    me.column_dimensions["A"].width = 4
    me.column_dimensions["B"].width = 100
    me["B2"] = f["titre"]; me["B2"].font = Font(size=18, bold=True, color=VERT)
    me["B3"] = f["accroche"]; me["B3"].font = Font(size=12, italic=True, color=GRIS); me["B3"].alignment = Alignment(wrap_text=True)
    me["B5"] = "Comment l'utiliser"; me["B5"].font = Font(size=13, bold=True)
    r = 6
    for i, e in enumerate(f["mode_emploi"], 1):
        me.cell(row=r, column=2, value=f"{i}. {e}").alignment = Alignment(wrap_text=True, vertical="top"); r += 1
    r += 1
    me.cell(row=r, column=2, value="Les cellules vertes pâles se remplissent ; les colonnes calculées et le tableau de bord se mettent à jour seuls.").font = Font(color=GRIS)
    me.cell(row=r + 1, column=2, value="Les lignes d'exemple peuvent être effacées ou remplacées par vos propres données.").font = Font(color=GRIS)
    me.cell(row=r + 3, column=2, value=f"Teranga Outils · usage personnel ou dans votre entreprise · version du {date.today().strftime('%d/%m/%Y')}").font = Font(size=9, color=GRIS)

    plages = {}
    for fe in f["classeur"]["feuilles"]:
        ws = wb.create_sheet(fe["nom"])
        cols = fe["colonnes"]
        lettres = {c["titre"]: get_column_letter(i + 1) for i, c in enumerate(cols)}
        saisies = [i for i, c in enumerate(cols) if not c.get("formule")]
        premiere_saisie = get_column_letter(saisies[0] + 1)
        derniere_saisie = get_column_letter(saisies[-1] + 1)
        for i, c in enumerate(cols, 1):
            h = ws.cell(row=1, column=i, value=c["titre"])
            h.font = Font(bold=True, color="FFFFFF"); h.fill = PatternFill("solid", fgColor=VERT)
            h.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True); h.border = bordure()
            ws.column_dimensions[get_column_letter(i)].width = max(10, min(40, int(c.get("largeur") or len(c["titre"]) + 4)))
        ws.row_dimensions[1].height = 32
        exemples = fe["exemples"]
        n = len(exemples) + vides
        for k in range(n):
            ligne = k + 2
            vals = exemples[k] if k < len(exemples) else None
            j = 0
            for i, c in enumerate(cols, 1):
                cell = ws.cell(row=ligne, column=i)
                if c.get("formule"):
                    expr = c["formule"][1:].replace("{r}", str(ligne))
                    cell.value = f'=IF(COUNTA(${premiere_saisie}{ligne}:${derniere_saisie}{ligne})=0,"",{expr})'
                    cell.fill = PatternFill("solid", fgColor="F4F6F4")
                else:
                    if vals is not None:
                        v = vals[j]
                        if c["type"] == "date" and isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                            v = date.fromisoformat(v)
                        cell.value = v
                    cell.fill = PatternFill("solid", fgColor=VERT_CLAIR)
                    j += 1
                cell.number_format = FORMATS[c["type"]]
                cell.border = bordure()
                if c["type"] == "liste":
                    pass
        for i, c in enumerate(cols, 1):
            if c["type"] == "liste" and not c.get("formule"):
                dv = DataValidation(type="list", formula1='"' + ",".join(str(x).replace(",", " ") for x in c["choix"]) + '"', allow_blank=True)
                ws.add_data_validation(dv)
                dv.add(f"{get_column_letter(i)}2:{get_column_letter(i)}{n + 1}")
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{n + 1}"
        plages[fe["nom"]] = {"lettres": lettres, "fin": n + 1}

    tb = wb.create_sheet("Tableau de bord", 1)
    tb.sheet_view.showGridLines = False
    tb.column_dimensions["A"].width = 4; tb.column_dimensions["B"].width = 46; tb.column_dimensions["C"].width = 22
    tb["B2"] = "Tableau de bord"; tb["B2"].font = Font(size=16, bold=True, color=VERT)
    tb["B3"] = "Calculé automatiquement à partir de vos feuilles."; tb["B3"].font = Font(italic=True, color=GRIS)
    r = 5
    for s in f["classeur"]["synthese"]:
        tb.cell(row=r, column=2, value=s["libelle"]).font = Font(bold=True)
        v = tb.cell(row=r, column=3, value=s["formule"])
        v.number_format = FORMATS[s["type"]]; v.font = Font(bold=True, size=12, color=VERT); v.alignment = Alignment(horizontal="right")
        for col in (2, 3):
            tb.cell(row=r, column=col).border = bordure(); tb.cell(row=r, column=col).fill = PatternFill("solid", fgColor="F7F7F4")
        r += 1
    graph = f["classeur"].get("graphique")
    if graph and graph.get("feuille") in plages:
        p = plages[graph["feuille"]]
        lx, ly = p["lettres"].get(graph.get("categories")), p["lettres"].get(graph.get("valeurs"))
        if lx and ly:
            src = wb[graph["feuille"]]
            ch = BarChart(); ch.title = graph.get("titre") or graph["valeurs"]; ch.style = 10; ch.legend = None
            ch.height, ch.width = 8, 16
            nb = len(next(fe for fe in f["classeur"]["feuilles"] if fe["nom"] == graph["feuille"])["exemples"]) + 6
            ch.add_data(Reference(src, min_col=src[ly + "1"].column, min_row=1, max_row=nb + 1), titles_from_data=True)
            ch.set_categories(Reference(src, min_col=src[lx + "1"].column, min_row=2, max_row=nb + 1))
            ch.series[0].graphicalProperties.solidFill = VERT
            ch.series[0].graphicalProperties.line.solidFill = VERT
            ch.y_axis.majorGridlines = None
            tb.add_chart(ch, f"E{5}")
    wb.properties.creator = "Teranga Outils"
    wb.properties.title = f["titre"]
    wb.save(chemin)


# ------------------------------------------------------------------ Vérification (LibreOffice recalcule tout)
def recalculer(chemin, dossier):
    profil = tempfile.mkdtemp(prefix="lo-")
    try:
        subprocess.run(["soffice", f"-env:UserInstallation=file://{profil}", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", dossier, chemin],
                       check=True, capture_output=True, timeout=180)
    finally:
        shutil.rmtree(profil, ignore_errors=True)
    return os.path.join(dossier, os.path.basename(chemin))


def verifier(f, chemin):
    """Renvoie (problèmes, aperçu). Aperçu : en-têtes et lignes d'exemple calculées, indicateurs du tableau de bord."""
    d = tempfile.mkdtemp(prefix="verif-")
    try:
        calc = recalculer(chemin, d)
        wb = load_workbook(calc, data_only=True)
        pb, apercu = [], {"feuilles": [], "synthese": []}
        for ws in wb.worksheets:
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str) and ERREURS.match(c.value):
                        pb.append(f"{ws.title}!{c.coordinate} : {c.value}")
        tb = wb["Tableau de bord"]
        for i, s in enumerate(f["classeur"]["synthese"]):
            v = tb.cell(row=5 + i, column=3).value
            if v is None or (isinstance(v, str) and not v.strip()):
                pb.append(f"indicateur vide : {s['libelle']}")
            apercu["synthese"].append({"libelle": s["libelle"], "valeur": v if isinstance(v, (int, float, str)) else str(v), "type": s["type"]})
        for fe in f["classeur"]["feuilles"]:
            ws = wb[fe["nom"]]
            cols = [c["titre"] for c in fe["colonnes"]]
            lignes = []
            for k in range(min(5, len(fe["exemples"]))):
                ligne = []
                for i, c in enumerate(fe["colonnes"], 1):
                    v = ws.cell(row=k + 2, column=i).value
                    if c.get("formule") and (v is None or v == ""):
                        pb.append(f"{fe['nom']} ligne {k + 2} : « {c['titre']} » non calculée")
                    if hasattr(v, "strftime"):
                        v = v.strftime("%d/%m/%Y")
                    ligne.append(v)
                lignes.append(ligne)
            apercu["feuilles"].append({"nom": fe["nom"], "colonnes": cols, "types": [c["type"] for c in fe["colonnes"]], "lignes": lignes})
        return pb[:20], apercu
    finally:
        shutil.rmtree(d, ignore_errors=True)


# ------------------------------------------------------------------ Fiches écrites par le modèle (GitHub Models)
CONSIGNE = """Tu conçois des OUTILS EXCEL vendus 500 à 5000 F CFA à des particuliers et petites entreprises du Sénégal et d'Afrique francophone.
Un outil = un classeur concret qui fait gagner du temps ou de l'argent dans UN métier ou UNE situation de la vie réelle.
Réponds UNIQUEMENT par un objet JSON avec exactement ces clés :
{"titre": "…(10-100 car.)", "domaine": "…(3-40 car.)", "accroche": "…(20-220 car.)", "description": "…(150-1500 car., texte de vente honnête : à qui il sert, ce qu'il calcule, ce qu'on obtient)",
 "points": ["3 à 6 bénéfices concrets"], "faq": [{"q": "…", "r": "…"}] (3 questions), "prix": entier entre 500 et 5000,
 "mode_emploi": ["3 à 7 étapes simples"],
 "classeur": {"feuilles": [{"nom": "2-28 caractères, lettres", "colonnes": [{"titre": "…", "type": "texte|montant|nombre|decimal|pourcentage|date|liste", "largeur": 10-40, "choix": ["seulement pour le type liste"], "formule": "=… seulement pour une colonne CALCULÉE"}], "exemples": [[…valeurs des colonnes de SAISIE uniquement, dans l'ordre…], 4 à 8 lignes]}],
              "synthese": [{"libelle": "…", "formule": "=…", "type": "montant|nombre|pourcentage|decimal|texte"}] (4 à 8 indicateurs),
              "graphique": {"feuille": "…", "categories": "titre d'une colonne texte", "valeurs": "titre d'une colonne chiffrée", "titre": "…"}}}
RÈGLES DES FORMULES (sinon l'outil est rejeté) :
- Fonctions Excel en ANGLAIS : SUM, SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGE, IF, IFERROR, MAX, MIN, ROUND, TODAY, DATEDIF, AND, OR.
- Colonne calculée : formule de la ligne avec {r} pour le numéro de ligne, colonnes de LA MÊME feuille par leur lettre (A, B, C… dans l'ordre des colonnes). Ex. "=C{r}*D{r}".
- Indicateurs du tableau de bord : références explicites à une plage de lignes 2 à 100, ex. "=SUM(Ventes!E2:E100)", "=COUNTIF(Ventes!D2:D100,\\"Payé\\")". Noms de feuilles avec espace entre apostrophes.
- Protège les divisions par IFERROR(…;0) écrit IFERROR(…,0). Pas de INDIRECT, pas de liens, pas de macros, pas de références à d'autres fichiers.
- Les exemples sont fictifs mais réalistes (prénoms et lieux sénégalais, montants en F CFA), sans numéro de téléphone ni e-mail.
INTERDITS : documents officiels (attestation, certificat, diplôme, fiche de paie), santé et médicaments, jeux d'argent, crypto, finance réglementée, politique, religion, données personnelles réelles.
Écris en français simple, sans faute, sans promesse de gain garanti."""


def appeler_modele(domaine, deja):
    corps = {
        "model": MODELE, "temperature": 0.8,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": CONSIGNE},
            {"role": "user", "content": f"Domaine : {domaine}.\nOutils déjà en vente (ne pas refaire) : {', '.join(deja[-60:]) or 'aucun'}.\nPropose UN outil nouveau, très utile et précis pour ce domaine."},
        ],
    }
    req = urllib.request.Request(MODELES_URL, data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"]})
    with urllib.request.urlopen(req, timeout=180) as r:
        rep = json.load(r)
    return json.loads(rep["choices"][0]["message"]["content"])


def jeton_github():
    url, tok = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL"), os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not tok:
        raise SystemExit("Jeton OIDC indisponible : la tâche doit avoir « permissions: id-token: write ».")
    req = urllib.request.Request(url + "&audience=" + AUDIENCE, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def fiches_en_attente():
    """Fiches écrites à l'avance (table tcv.boutique_fiches), lues avec le jeton OIDC de la tâche."""
    req = urllib.request.Request(API + "/fabrique/fiches", headers={"Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("fiches", [])
    except Exception as e:
        print(f"Fiches en attente illisibles : {e}")
        return []


def deposer(fiche, chemin, apercu, fiche_id=None):
    b64 = base64.b64encode(open(chemin, "rb").read()).decode()
    produit = {k: fiche[k] for k in ("titre", "domaine", "accroche", "description", "points", "faq", "prix")}
    produit["slug"] = fiche["slug"]
    produit["apercu"] = apercu
    produit["controle"] = {"ok": True, "outil": "fabriquer.py", "le": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    corps = {"produit": produit, "fichiers": [{"nom": fiche["slug"] + ".xlsx", "mime": MIME_XLSX, "b64": b64}]}
    if fiche_id:
        corps["fiche_id"] = fiche_id
    req = urllib.request.Request(API + "/depot", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"erreur": e.code, "detail": e.read().decode()[:300]}


def catalogue():
    try:
        with urllib.request.urlopen(API + "/catalogue", timeout=30) as r:
            return json.load(r).get("produits", [])
    except Exception:
        return []


def fabriquer_une(fiche, dossier):
    """Construit et vérifie ; renvoie (chemin, aperçu, problèmes)."""
    pb = controler_fiche(fiche)
    if pb:
        return None, None, pb
    fiche["slug"] = fiche.get("slug") or slugifier(fiche["titre"])
    chemin = os.path.join(dossier, fiche["slug"] + ".xlsx")
    try:
        construire(fiche, chemin)
    except Exception as e:  # fiche incohérente (colonne absente…)
        return None, None, [f"construction impossible : {e}"]
    pb, apercu = verifier(fiche, chemin)
    return (chemin if not pb else None), apercu, pb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", type=int, default=5)
    ap.add_argument("--essais", type=int, default=3)
    ap.add_argument("--fiches")
    ap.add_argument("--sortie")
    a = ap.parse_args()
    dossier = a.sortie or tempfile.mkdtemp(prefix="boutique-")
    os.makedirs(dossier, exist_ok=True)
    rapport = []
    if a.fiches:
        for fiche in json.load(open(a.fiches, encoding="utf-8")):
            chemin, apercu, pb = fabriquer_une(fiche, dossier)
            rapport.append({"titre": fiche.get("titre"), "ok": chemin is not None, "problemes": pb})
            if chemin:
                json.dump({"fiche": fiche, "apercu": apercu}, open(chemin[:-5] + ".json", "w", encoding="utf-8"), ensure_ascii=False, default=str)
        print(json.dumps(rapport, ensure_ascii=False, indent=1))
        sys.exit(0 if all(x["ok"] for x in rapport) else 1)
    existants = catalogue()
    deja = [p["titre"] for p in existants]
    # 1. Fiches écrites à l'avance (en plus du quota du jour)
    fiches_ok = 0
    for item in fiches_en_attente():
        fiche = item.get("fiche") or {}
        chemin, apercu, pb = fabriquer_une(fiche, dossier)
        if not chemin:
            rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "problemes": pb[:6]}); continue
        res = deposer(fiche, chemin, apercu, fiche_id=item.get("id"))
        rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "depot": res})
        if isinstance(res, dict) and res.get("statut") == "brouillon":
            fiches_ok += 1
        deja.append(fiche.get("titre", ""))
    # 2. Fiches écrites par le modèle
    recents = {p.get("domaine") for p in existants[:10]}
    domaines = [d for d in DOMAINES if d not in recents] or DOMAINES[:]
    random.seed(time.strftime("%Y-%m-%d"))
    random.shuffle(domaines)
    deposes = 0
    for domaine in domaines:
        if deposes >= a.nombre:
            break
        for essai in range(1, a.essais + 1):
            try:
                fiche = appeler_modele(domaine, deja)
            except Exception as e:
                rapport.append({"domaine": domaine, "essai": essai, "erreur": f"modèle : {e}"[:200]})
                time.sleep(20)
                continue
            fiche["slug"] = slugifier(fiche.get("titre", ""))
            if any(slugifier(t) == fiche["slug"] for t in deja):
                rapport.append({"domaine": domaine, "essai": essai, "erreur": "déjà en vente"}); continue
            chemin, apercu, pb = fabriquer_une(fiche, dossier)
            if not chemin:
                rapport.append({"domaine": domaine, "essai": essai, "titre": fiche.get("titre"), "problemes": pb[:6]}); continue
            res = deposer(fiche, chemin, apercu)
            rapport.append({"domaine": domaine, "essai": essai, "titre": fiche["titre"], "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                deposes += 1; deja.append(fiche["titre"])
            break
    print(json.dumps(rapport, ensure_ascii=False, indent=1))
    print(f"Fiches déposées : {fiches_ok} · nouveaux outils déposés : {deposes}/{a.nombre}")
    sys.exit(0 if (deposes or fiches_ok or a.nombre == 0) else 1)


if __name__ == "__main__":
    main()
