#!/usr/bin/env python3
"""Fabrique de Teranga Outils : conçoit, construit, VÉRIFIE et dépose chaque jour des outils Excel prêts à vendre.

Chaque produit part d'une fiche JSON (domaine, titre, textes de vente, classeur décrit par feuilles et colonnes). La fiche
est écrite à l'avance (table des fiches en attente) ou par un modèle de langue GRATUIT, appelé par le serveur de la boutique
(GitHub Models a fermé le 30 juillet 2026), ou fournie à la main (--fiches). La fabrique crée aussi des documents sur mesure
(formulaire, consigne de rédaction, exemple) déposés de la même façon.
Le classeur est construit avec openpyxl, recalculé par LibreOffice, puis contrôlé : aucune erreur de formule, exemples
remplis, tableau de bord chiffré, sujets interdits absents, textes complets. Seuls les produits contrôlés sont déposés
(fonction Edge « boutique », jeton OIDC de GitHub : aucun secret). Ils sont publiés 24 h plus tard, sauf refus.

  python3 fabriquer.py --nombre 5 --generateurs 1     # GitHub Actions : fiches par le modèle, dépôt
  python3 fabriquer.py --fiches fiches.json --sortie d # fiches fournies, classeurs écrits dans d, sans dépôt
"""
import argparse, base64, hashlib, json, os, random, re, shutil, subprocess, sys, tempfile, time, unicodedata, urllib.request
from datetime import date

from openpyxl import Workbook, load_workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kits  # noqa: E402  (kits à imprimer : PDF + Word)

API = os.environ.get("BOUTIQUE_API", "https://seegnylaubuularegmku.supabase.co/functions/v1/boutique")
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


# ------------------------------------------------------------------ Fiches écrites par le modèle (gratuit, via le serveur)
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
- Les exemples sont fictifs mais réalistes (prénoms et lieux sénégalais, montants en F CFA, dates de l'année en cours au format AAAA-MM-JJ), sans numéro de téléphone ni e-mail.
- Titres de colonnes en français courant, avec espaces (jamais de tiret bas).
INTERDITS : documents officiels (attestation, certificat, diplôme, fiche de paie), santé et médicaments, jeux d'argent, crypto, finance réglementée, politique, religion, données personnelles réelles.
Écris en français simple, sans faute, sans promesse de gain garanti."""


def extraire_json(texte):
    """L'objet JSON contenu dans la réponse (blocs ```json, texte autour, ou JSON pur)."""
    t = str(texte or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        pass
    debut, fin = t.find("{"), t.rfind("}")
    if debut < 0 or fin <= debut:
        raise ValueError("réponse sans JSON : " + t[:160].replace("\n", " "))
    return json.loads(t[debut:fin + 1])


class SansCle(Exception):
    """Le serveur n'a pas de clé OpenRouter : la rédaction automatique n'est pas encore activée par le propriétaire."""


def modele(messages, essai=0):
    """Un objet JSON écrit par un modèle GRATUIT d'OpenRouter, appelé par la fonction « boutique » (jeton OIDC de la tâche)."""
    corps = {"messages": messages, "json": True, "depart": essai, "temperature": 0.8}
    req = urllib.request.Request(API + "/fabrique/modele", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=170) as r:
            rep = json.loads(r.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:300]
        if e.code == 503:
            raise SansCle(detail)
        raise RuntimeError(f"HTTP {e.code} {detail}")
    return extraire_json(rep.get("contenu") or "")


FICHIER_DEMANDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demandes.json")


SUJETS_FAITS = set()  # sujets de demandes.json déjà traités (produits ou guides), lus sur le serveur
GUIDES_FAITS = set()  # adresses des guides déjà publiés


def pistes(famille, deja, defaut):
    """Sujets à traiter : d'abord la demande réelle étudiée (demandes.json, priorité 1 d'abord, sujets pas encore en vente),
    puis les domaines par défaut. Renvoie une liste de (domaine, idée ou None)."""
    out = []
    try:
        dem = json.load(open(FICHIER_DEMANDES, encoding="utf-8"))
    except Exception:
        dem = []
    pris = {slugifier(t) for t in deja}
    random.seed(time.strftime("%Y-%m-%d") + famille)
    lot = [d for d in dem if isinstance(d, dict) and d.get("famille") == famille and slugifier(d.get("titre_produit", "")) not in pris
           and d.get("sujet") not in SUJETS_FAITS]
    random.shuffle(lot)
    lot.sort(key=lambda d: d.get("priorite", 3))
    for d in lot:
        idee = f"{d.get('titre_produit')} — les gens cherchent : {', '.join((d.get('recherches') or [])[:4])}"
        out.append((d.get("domaine") or d.get("sujet") or "Divers", idee, d.get("sujet")))
    autres = defaut[:]
    random.shuffle(autres)
    return out + [(x, None, None) for x in autres]


def appeler_modele(domaine, deja, essai=0, idee=None):
    piste = f"\nPiste tirée de la demande réelle : {idee}." if idee else ""
    return modele([
        {"role": "system", "content": CONSIGNE},
        {"role": "user", "content": f"Domaine : {domaine}.{piste}\nOutils déjà en vente (ne pas refaire) : {', '.join(deja[-60:]) or 'aucun'}.\nPropose UN outil nouveau, très utile et précis pour ce domaine. Réponds par le seul objet JSON, sans texte autour."},
    ], essai)


# ------------------------------------------------------------------ Documents sur mesure écrits par le modèle
DOMAINES_DOCS = [
    "Commerce et vente en boutique", "Événements familiaux", "Recherche d'emploi", "Associations et groupements", "Écoles et enseignants",
    "Immobilier et location", "Restauration et traiteur", "Tourisme et hébergement", "Artisanat", "Agriculture et élevage",
    "Transport et livraison", "Beauté et coiffure", "Services aux petites entreprises", "Communication et réseaux sociaux",
    "Formation et ateliers", "Vie de quartier", "Sport amateur", "Mode et couture",
]
CONSIGNE_GEN = """Tu conçois des DOCUMENTS RÉDIGÉS SUR MESURE vendus 500 à 3000 F CFA à des particuliers et petites entreprises du Sénégal.
Le client remplit un court formulaire, paie, puis une IA rédige SON document à partir de SES réponses et de TA consigne.
Réponds UNIQUEMENT par un objet JSON avec exactement ces clés :
{"titre": "…(10-90 car., dit clairement le document, se termine par « sur mesure »)", "domaine": "…(3-40 car.)", "accroche": "…(20-220 car.)",
 "description": "…(150-1500 car., texte de vente honnête : à qui il sert, ce qu'on reçoit)", "points": ["3 à 6 bénéfices concrets"],
 "faq": [{"q": "…", "r": "…"}] (3 questions), "prix": entier entre 500 et 3000,
 "formulaire": [{"id": "minuscules_sans_accent", "label": "question claire", "type": "texte|paragraphe|nombre|choix|date", "obligatoire": true, "max": 150, "choix": ["seulement pour le type choix"]}] (4 à 9 champs),
 "consigne": "instructions de rédaction précises (300-1500 car.) : sections attendues dans l'ordre, ton, longueur, et rappel de n'inventer aucun fait absent des réponses",
 "exemple": {"titre": "…", "sections": [{"titre": "…", "paragraphes": ["…"], "puces": ["…"]}]} (le document COMPLET qu'on obtiendrait avec des réponses fictives réalistes)}
INTERDITS : documents officiels ou administratifs (attestation, certificat, diplôme, fiche de paie, contrat, statuts, procuration), santé et médicaments,
conseil juridique ou financier engageant, jeux d'argent, crypto, politique, religion, données personnelles réelles, numéros de téléphone, liens, e-mails.
Bons exemples d'idées : message de remerciement après un événement, programme de cérémonie, plan de communication d'un commerce, présentation d'une
entreprise, lettre de demande de partenariat, règlement d'une tontine, fiche de présentation d'un artisan, publications pour un mois sur les réseaux.
Écris en français simple, sans faute, sans promesse de résultat."""


def validation_document(d):
    if not isinstance(d, dict) or not isinstance(d.get("titre"), str) or not d["titre"].strip() or len(d["titre"]) > 200:
        return "exemple : titre"
    secs = d.get("sections")
    if not isinstance(secs, list) or not 1 <= len(secs) <= 25:
        return "exemple : sections"
    total = len(d["titre"])
    for x in secs:
        if not isinstance(x, dict):
            return "exemple : section"
        for k in ("paragraphes", "puces"):
            if k in x and not (isinstance(x[k], list) and all(isinstance(y, str) for y in x[k])):
                return "exemple : " + k
        if not (x.get("paragraphes") or x.get("puces")):
            return "exemple : section vide"
        total += len(str(x.get("titre") or "")) + len("".join((x.get("paragraphes") or []) + (x.get("puces") or [])))
    return None if 300 <= total <= 30000 else "exemple : longueur"


def controler_generateur(g):
    pb = []
    for k, mn, mx in (("titre", 10, 100), ("domaine", 3, 40), ("accroche", 20, 220), ("description", 150, 2500), ("consigne", 200, 6000)):
        v = g.get(k)
        if not isinstance(v, str) or not (mn <= len(v.strip()) <= mx):
            pb.append(f"{k} : longueur hors de {mn}-{mx}")
    if not isinstance(g.get("prix"), int) or not 500 <= g["prix"] <= 9500:
        pb.append("prix entre 500 et 9500 F")
    if not isinstance(g.get("points"), list) or not 3 <= len(g["points"]) <= 8:
        pb.append("3 à 8 points forts")
    if not isinstance(g.get("faq"), list) or not 2 <= len(g["faq"]) <= 6 or not all(isinstance(x, dict) and x.get("q") and x.get("r") for x in g["faq"]):
        pb.append("2 à 6 questions-réponses {q, r}")
    f = g.get("formulaire")
    if not isinstance(f, list) or not 2 <= len(f) <= 12:
        pb.append("formulaire : 2 à 12 champs")
    else:
        ids = set()
        for c in f:
            if not isinstance(c, dict) or not re.fullmatch(r"[a-z0-9_]{2,30}", str(c.get("id"))) or c.get("id") in ids:
                pb.append("formulaire : identifiant invalide"); break
            ids.add(c["id"])
            if not isinstance(c.get("label"), str) or not 2 <= len(c["label"]) <= 120:
                pb.append("formulaire : libellé invalide"); break
            if c.get("type") not in ("texte", "paragraphe", "nombre", "choix", "date", "image"):
                pb.append("formulaire : type invalide"); break
            if c["type"] == "choix" and not (isinstance(c.get("choix"), list) and 2 <= len(c["choix"]) <= 15 and all(isinstance(x, str) and len(x) <= 80 for x in c["choix"])):
                pb.append("formulaire : choix invalides"); break
        if not any(c.get("obligatoire") for c in f if isinstance(c, dict)):
            pb.append("formulaire : au moins un champ obligatoire")
    e = validation_document(g.get("exemple"))
    if e:
        pb.append(e)
    texte = sans_acc(json.dumps(g, ensure_ascii=False))
    if INTERDITS.search(texte):
        pb.append("sujet interdit : " + INTERDITS.search(texte).group(0))
    if re.search(r"\b(contrat|procuration|religion|politique)\b|\bstatuts\b(?!\s+whatsapp)", sans_acc(" ".join(str(g.get(k, "")) for k in ("titre", "accroche", "description")))):
        pb.append("document officiel, juridique, religieux ou politique")
    if re.search(r"https?://|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b(?:\+?221)?\s?7[05678]\s?\d{3}\s?\d{2}\s?\d{2}\b", texte):
        pb.append("lien, e-mail ou numéro de téléphone dans les textes")
    return pb


def appeler_modele_generateur(domaine, deja, essai=0, idee=None):
    piste = f"\nPiste tirée de la demande réelle : {idee}." if idee else ""
    return modele([
        {"role": "system", "content": CONSIGNE_GEN},
        {"role": "user", "content": f"Domaine : {domaine}.{piste}\nDocuments et outils déjà en vente (ne pas refaire) : {', '.join(deja[-80:]) or 'aucun'}.\nPropose UN document sur mesure nouveau, très utile, pour ce domaine. Réponds par le seul objet JSON."},
    ], essai)


def deposer_generateur(g, fiche_id=None):
    produit = {k: g[k] for k in ("titre", "domaine", "accroche", "description", "points", "faq", "prix", "formulaire", "consigne", "exemple")}
    produit["slug"] = g["slug"]
    if g.get("sortie") in ("document", "image"):
        produit["sortie"] = g["sortie"]
    produit["controle"] = {"ok": True, "outil": "fabriquer.py", "le": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **({"sujet": g["_sujet"]} if g.get("_sujet") else {})}
    corps = {"produit": produit}
    if fiche_id:
        corps["fiche_id"] = fiche_id
    req = urllib.request.Request(API + "/depot-generateur", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"erreur": e.code, "detail": e.read().decode()[:300]}


def jeton_github():
    url, tok = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL"), os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not url or not tok:
        raise SystemExit("Jeton OIDC indisponible : la tâche doit avoir « permissions: id-token: write ».")
    req = urllib.request.Request(url + "&audience=" + AUDIENCE, headers={"Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["value"]


def fiches_en_attente():
    """Fiches écrites à l'avance (table tcv.boutique_fiches) et titres de TOUS les produits (même masqués), jeton OIDC."""
    req = urllib.request.Request(API + "/fabrique/fiches", headers={"Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
            SUJETS_FAITS.update(j.get("sujets", []))
            GUIDES_FAITS.update(j.get("guides", []))
            return j.get("fiches", []), j.get("titres", [])
    except Exception as e:
        print(f"Fiches en attente illisibles : {e}")
        return [], []


def deposer(fiche, chemin, apercu, fiche_id=None):
    b64 = base64.b64encode(open(chemin, "rb").read()).decode()
    produit = {k: fiche[k] for k in ("titre", "domaine", "accroche", "description", "points", "faq", "prix")}
    produit["slug"] = fiche["slug"]
    produit["apercu"] = apercu
    produit["controle"] = {"ok": True, "outil": "fabriquer.py", "le": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **({"sujet": fiche["_sujet"]} if fiche.get("_sujet") else {})}
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


def normaliser_fiche(f):
    """Finitions sans risque : titres de colonnes lisibles (« Quantité_kg » → « Quantité kg »), espaces superflus."""
    renomme = {}
    for fe in (f.get("classeur") or {}).get("feuilles") or []:
        for col in fe.get("colonnes") or []:
            t = re.sub(r"\s+", " ", str(col.get("titre", "")).replace("_", " ")).strip()
            renomme[col.get("titre")] = t
            col["titre"] = t
    g = (f.get("classeur") or {}).get("graphique")
    if isinstance(g, dict):
        for k in ("categories", "valeurs"):
            if g.get(k) in renomme:
                g[k] = renomme[g[k]]
    for k in ("titre", "accroche", "description"):
        if isinstance(f.get(k), str):
            f[k] = re.sub(r"\s+", " ", f[k]).strip()
    return f


def fabriquer_une(fiche, dossier):
    """Construit et vérifie ; renvoie (chemin, aperçu, problèmes)."""
    normaliser_fiche(fiche)
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


def fabriquer_kit(k, dossier):
    """Kit à imprimer : contrôle, Word, PDF par LibreOffice, vérification ; renvoie (chemins, aperçu, problèmes)."""
    for cle in ("titre", "accroche", "description"):
        if isinstance(k.get(cle), str):
            k[cle] = re.sub(r"\s+", " ", k[cle]).strip()
    pb = kits.controler_kit(k)
    if pb:
        return None, None, pb
    k["slug"] = k.get("slug") or slugifier(k["titre"])
    docx = os.path.join(dossier, k["slug"] + ".docx")
    try:
        kits.construire_kit(k, docx)
        pdf = kits.en_pdf(docx, dossier)
    except Exception as e:
        return None, None, [f"construction impossible : {e}"[:300]]
    pb, apercu = kits.verifier_kit(k, docx, pdf)
    return ((pdf, docx) if not pb else None), apercu, pb


def deposer_kit(k, chemins, apercu, fiche_id=None):
    pdf, docx = chemins
    produit = {c: k[c] for c in ("titre", "domaine", "accroche", "description", "points", "faq", "prix")}
    produit["slug"] = k["slug"]
    produit["apercu"] = apercu
    produit["controle"] = {"ok": True, "outil": "fabriquer.py/kits", "le": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **({"sujet": k["_sujet"]} if k.get("_sujet") else {})}
    fichiers = [{"nom": k["slug"][:70] + ".pdf", "mime": "application/pdf", "b64": base64.b64encode(open(pdf, "rb").read()).decode()},
                {"nom": k["slug"][:70] + ".docx", "mime": kits.MIME_DOCX, "b64": base64.b64encode(open(docx, "rb").read()).decode()}]
    corps = {"produit": produit, "fichiers": fichiers}
    if fiche_id:
        corps["fiche_id"] = fiche_id
    req = urllib.request.Request(API + "/depot", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"erreur": e.code, "detail": e.read().decode()[:300]}


def appeler_modele_kit(domaine, deja, essai=0, idee=None):
    piste = f"\nPiste tirée de la demande réelle : {idee}." if idee else ""
    return modele([
        {"role": "system", "content": kits.CONSIGNE_KIT},
        {"role": "user", "content": f"Domaine : {domaine}.{piste}\nProduits déjà en vente (ne pas refaire) : {', '.join(deja[-80:]) or 'aucun'}.\nConçois UN kit à imprimer nouveau, complet et très utile. Réponds par le seul objet JSON."},
    ], essai)


CONSIGNE_GUIDE = """Tu écris des GUIDES PRATIQUES GRATUITS en français pour le site Teranga Outils (Sénégal et Afrique francophone).
Un guide répond vraiment à une recherche que les gens tapent sur Google : méthode concrète, exemples chiffrés en F CFA aux calculs JUSTES,
prénoms et lieux sénégalais fictifs. Il doit être utile même sans rien acheter. Réponds UNIQUEMENT par un objet JSON :
{"titre": "…(30-80 car., la question ou le besoin, mots que les gens tapent)", "description": "…(120-160 car.)", "chapeau": "…(200-450 car.)",
 "sections": [{"titre": "…", "paragraphes": ["…"], "puces": ["…"]}] (5 à 8 sections, 800 à 1600 mots au total),
 "produits": ["adresse d'un produit de la liste fournie, le plus utile"] (0 à 2), "mots_cles": ["4 à 8 recherches réelles"]}
INTERDITS : liens, numéros de téléphone, e-mails, conseil juridique, fiscal, médical ou financier engageant, politique, religion, promesse de gain."""


def controler_guide(g):
    pb = []
    for cle, mn, mx in (("titre", 20, 110), ("description", 80, 200), ("chapeau", 100, 800)):
        v = g.get(cle)
        if not isinstance(v, str) or not (mn <= len(v.strip()) <= mx):
            pb.append(f"{cle} : longueur hors de {mn}-{mx}")
    secs = g.get("sections")
    if not isinstance(secs, list) or not 3 <= len(secs) <= 12:
        return pb + ["3 à 12 sections"]
    mots = len(str(g.get("chapeau", "")).split())
    for s_ in secs:
        if not isinstance(s_, dict) or not str(s_.get("titre", "")).strip() or not (s_.get("paragraphes") or s_.get("puces")):
            pb.append("section incomplète"); break
        mots += len(" ".join(str(x) for x in (s_.get("paragraphes") or []) + (s_.get("puces") or [])).split())
    if not 450 <= mots <= 3500:
        pb.append(f"{mots} mots (450 à 3 500)")
    texte = sans_acc(json.dumps(g, ensure_ascii=False))
    if INTERDITS.search(texte):
        pb.append("sujet interdit : " + INTERDITS.search(texte).group(0))
    if re.search(r"https?://|www\.|@[a-z0-9-]+\.[a-z]{2,}|\b(?:\+?221)?\s?7[05678]\s?\d{3}\s?\d{2}\s?\d{2}\b", texte):
        pb.append("lien, e-mail ou numéro de téléphone")
    return pb


def deposer_guide(g):
    corps = {"guide": {k: g[k] for k in ("slug", "titre", "description", "chapeau", "sections", "produits", "mots_cles") if k in g}}
    if g.get("_sujet"):
        corps["guide"]["sujet"] = g["_sujet"]
    req = urllib.request.Request(API + "/depot-guide", data=json.dumps(corps).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton_github()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"erreur": e.code, "detail": e.read().decode()[:300]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", type=int, default=5)
    ap.add_argument("--essais", type=int, default=3)
    ap.add_argument("--generateurs", type=int, default=1, help="documents sur mesure à créer (modèle gratuit)")
    ap.add_argument("--kits", type=int, default=1, help="kits à imprimer (PDF + Word) à créer (modèle gratuit)")
    ap.add_argument("--guides", type=int, default=1, help="guides gratuits à écrire (attirent les visiteurs des moteurs de recherche)")
    ap.add_argument("--fiches")
    ap.add_argument("--sortie")
    ap.add_argument("--sans-depot", action="store_true", help="essai : fiches du modèle construites et vérifiées, rien n'est déposé")
    a = ap.parse_args()
    dossier = a.sortie or tempfile.mkdtemp(prefix="boutique-")
    os.makedirs(dossier, exist_ok=True)
    rapport = []
    if a.fiches:
        for fiche in json.load(open(a.fiches, encoding="utf-8")):
            if fiche.get("famille") == "kit":
                chemins, apercu, pb = fabriquer_kit(fiche, dossier)
                rapport.append({"titre": fiche.get("titre"), "ok": chemins is not None, "problemes": pb, "pages": (apercu or {}).get("pages")})
                continue
            chemin, apercu, pb = fabriquer_une(fiche, dossier)
            rapport.append({"titre": fiche.get("titre"), "ok": chemin is not None, "problemes": pb})
            if chemin:
                json.dump({"fiche": fiche, "apercu": apercu}, open(chemin[:-5] + ".json", "w", encoding="utf-8"), ensure_ascii=False, default=str)
        print(json.dumps(rapport, ensure_ascii=False, indent=1))
        sys.exit(0 if all(x["ok"] for x in rapport) else 1)
    existants = catalogue()
    attente, titres = ([], []) if a.sans_depot else fiches_en_attente()
    deja = list(dict.fromkeys([p["titre"] for p in existants] + titres))
    # 1. Fiches écrites à l'avance (en plus du quota du jour)
    fiches_ok = 0
    for item in attente:
        fiche = item.get("fiche") or {}
        if fiche.get("formulaire"):  # document sur mesure écrit à l'avance : contrôlé puis déposé tel quel
            pb = controler_generateur(fiche)
            fiche["slug"] = fiche.get("slug") or slugifier(fiche.get("titre", ""))
            if pb:
                rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "problemes": pb[:6]}); continue
            res = deposer_generateur(fiche, fiche_id=item.get("id"))
            rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                fiches_ok += 1
            deja.append(fiche.get("titre", ""))
            continue
        if fiche.get("famille") == "kit":  # kit à imprimer écrit à l'avance
            chemins, apercu, pb = fabriquer_kit(fiche, dossier)
            if not chemins:
                rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "problemes": pb[:6]}); continue
            res = deposer_kit(fiche, chemins, apercu, fiche_id=item.get("id"))
            rapport.append({"fiche": item.get("id"), "titre": fiche.get("titre"), "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                fiches_ok += 1
            deja.append(fiche.get("titre", ""))
            continue
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
    domaines = pistes("excel", deja, [d for d in DOMAINES if d not in recents] or DOMAINES[:])
    deposes = 0
    echecs_modele = 0  # le service de modèles ne répond pas : inutile de parcourir tous les domaines
    sans_cle = False
    for domaine, idee, sujet in domaines:
        if deposes >= a.nombre or echecs_modele >= 4 or sans_cle:
            break
        for essai in range(1, a.essais + 1):
            if echecs_modele >= 4:
                rapport.append({"arret": "4 échecs de suite du service de modèles : arrêt pour aujourd'hui"}); break
            try:
                fiche = appeler_modele(domaine, deja, essai - 1, idee)
                if isinstance(fiche, dict) and sujet:
                    fiche["_sujet"] = sujet
                echecs_modele = 0
            except SansCle as e:
                sans_cle = True
                rapport.append({"arret": f"rédaction automatique pas encore activée par le propriétaire : {e}"[:300]}); break
            except Exception as e:
                echecs_modele += 1
                rapport.append({"domaine": domaine, "essai": essai, "erreur": f"modèle : {e}"[:700]})
                print(f"[fabrique] {domaine} essai {essai} : {e}"[:700], flush=True)
                time.sleep(5)
                continue
            fiche["slug"] = slugifier(fiche.get("titre", ""))
            if any(slugifier(t) == fiche["slug"] for t in deja):
                rapport.append({"domaine": domaine, "essai": essai, "erreur": "déjà en vente"}); continue
            chemin, apercu, pb = fabriquer_une(fiche, dossier)
            if not chemin:
                rapport.append({"domaine": domaine, "essai": essai, "titre": fiche.get("titre"), "problemes": pb[:6]}); continue
            res = {"statut": "brouillon", "essai": chemin} if a.sans_depot else deposer(fiche, chemin, apercu)
            rapport.append({"domaine": domaine, "essai": essai, "titre": fiche["titre"], "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                deposes += 1; deja.append(fiche["titre"])
            break
    # 3. Documents sur mesure écrits par le modèle (masqués aux clients tant que la rédaction n'est pas activée)
    gen_ok = 0
    for domaine, idee, sujet in pistes("generateur", deja, DOMAINES_DOCS):
        if gen_ok >= a.generateurs or sans_cle or echecs_modele >= 4:
            break
        for essai in range(1, a.essais + 1):
            try:
                g = appeler_modele_generateur(domaine, deja, essai - 1, idee)
                if isinstance(g, dict) and sujet:
                    g["_sujet"] = sujet
                echecs_modele = 0
            except SansCle as e:
                sans_cle = True
                rapport.append({"arret": f"rédaction automatique pas encore activée : {e}"[:300]}); break
            except Exception as e:
                echecs_modele += 1
                rapport.append({"document": domaine, "essai": essai, "erreur": f"modèle : {e}"[:500]})
                if echecs_modele >= 4:
                    break
                time.sleep(5); continue
            if not isinstance(g, dict):
                rapport.append({"document": domaine, "essai": essai, "erreur": "réponse sans objet"}); continue
            for k in ("titre", "accroche", "description", "consigne"):
                if isinstance(g.get(k), str):
                    g[k] = re.sub(r"[ \t]+", " ", g[k]).strip()
            pb = controler_generateur(g)
            g["slug"] = slugifier(g.get("titre", ""))
            if not pb and any(slugifier(t) == g["slug"] for t in deja):
                pb = ["déjà en vente"]
            if pb:
                rapport.append({"document": domaine, "essai": essai, "titre": g.get("titre"), "problemes": pb[:6]}); continue
            res = {"statut": "brouillon", "essai": True} if a.sans_depot else deposer_generateur(g)
            rapport.append({"document": domaine, "essai": essai, "titre": g["titre"], "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                gen_ok += 1; deja.append(g["titre"])
            break
    # 4. Kits à imprimer (PDF + Word) écrits par le modèle
    kits_ok = 0
    for domaine, idee, sujet in pistes("kit", deja, DOMAINES + DOMAINES_DOCS):
        if kits_ok >= a.kits or sans_cle or echecs_modele >= 4:
            break
        for essai in range(1, a.essais + 1):
            try:
                k = appeler_modele_kit(domaine, deja, essai - 1, idee)
                if isinstance(k, dict) and sujet:
                    k["_sujet"] = sujet
                echecs_modele = 0
            except SansCle as e:
                sans_cle = True
                rapport.append({"arret": f"rédaction automatique pas encore activée : {e}"[:300]}); break
            except Exception as e:
                echecs_modele += 1
                rapport.append({"kit": domaine, "essai": essai, "erreur": f"modèle : {e}"[:500]})
                if echecs_modele >= 4:
                    break
                time.sleep(5); continue
            if not isinstance(k, dict):
                rapport.append({"kit": domaine, "essai": essai, "erreur": "réponse sans objet"}); continue
            k["slug"] = slugifier(k.get("titre", ""))
            if any(slugifier(t) == k["slug"] for t in deja):
                rapport.append({"kit": domaine, "essai": essai, "erreur": "déjà en vente"}); continue
            chemins, apercu, pb = fabriquer_kit(k, dossier)
            if not chemins:
                rapport.append({"kit": domaine, "essai": essai, "titre": k.get("titre"), "problemes": pb[:6]}); continue
            res = {"statut": "brouillon", "essai": True} if a.sans_depot else deposer_kit(k, chemins, apercu)
            rapport.append({"kit": domaine, "essai": essai, "titre": k["titre"], "pages": apercu.get("pages"), "depot": res})
            if isinstance(res, dict) and res.get("statut") == "brouillon":
                kits_ok += 1; deja.append(k["titre"])
            break
    # 5. Guides gratuits (marketing : réponses utiles aux recherches réelles, reliées aux produits)
    guides_ok = 0
    produits_txt = "; ".join(f"{p.get('slug')} = {p.get('titre')}" for p in existants[:80])
    for domaine, idee, sujet in pistes("guide", deja, [d for d in DOMAINES]):
        if guides_ok >= a.guides or sans_cle or echecs_modele >= 4:
            break
        for essai in range(1, a.essais + 1):
            try:
                g = modele([{"role": "system", "content": CONSIGNE_GUIDE},
                            {"role": "user", "content": f"Domaine : {domaine}." + (f"\nRecherche à satisfaire : {idee}." if idee else "") +
                             f"\nProduits du site (adresse = titre) : {produits_txt}\nGuides déjà publiés (ne pas refaire) : {', '.join(sorted(GUIDES_FAITS))[:2000]}\nÉcris UN guide. Réponds par le seul objet JSON."}], essai - 1)
                echecs_modele = 0
            except SansCle as e:
                sans_cle = True; break
            except Exception as e:
                echecs_modele += 1
                rapport.append({"guide": domaine, "essai": essai, "erreur": f"modèle : {e}"[:400]})
                if echecs_modele >= 4:
                    break
                time.sleep(5); continue
            if not isinstance(g, dict):
                continue
            g["slug"] = slugifier(g.get("titre", ""))[:70]
            g["produits"] = [x for x in (g.get("produits") or []) if any(p.get("slug") == x for p in existants)][:2]
            if sujet:
                g["_sujet"] = sujet
            pb = controler_guide(g)
            if not pb and g["slug"] in GUIDES_FAITS:
                pb = ["déjà publié"]
            if pb:
                rapport.append({"guide": domaine, "essai": essai, "titre": g.get("titre"), "problemes": pb[:6]}); continue
            res = {"statut": "publie", "essai": True} if a.sans_depot else deposer_guide(g)
            rapport.append({"guide": domaine, "essai": essai, "titre": g["titre"], "depot": res})
            if isinstance(res, dict) and res.get("statut") == "publie":
                guides_ok += 1; GUIDES_FAITS.add(g["slug"])
            break
    print(json.dumps(rapport, ensure_ascii=False, indent=1))
    print(f"Fiches déposées : {fiches_ok} · nouveaux outils déposés : {deposes}/{a.nombre} · documents sur mesure : {gen_ok}/{a.generateurs} · kits : {kits_ok}/{a.kits} · guides : {guides_ok}/{a.guides}")
    if sans_cle:
        print("Rédaction automatique pas encore activée : seules les fiches en attente ont été traitées (aucune erreur).")
    sys.exit(0 if (deposes or fiches_ok or gen_ok or kits_ok or guides_ok or sans_cle or (a.nombre == 0 and a.generateurs == 0 and a.kits == 0 and a.guides == 0)) else 1)


if __name__ == "__main__":
    main()
