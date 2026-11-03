#!/usr/bin/env python3
"""Applications TERANGA : met en vente les pass des applications prêtes dans la boutique (tcv.boutique_produits).

Usage (depuis n'importe où) :
  python3 scripts/apps/passes.py                  # met à jour apps/catalogue.json, fabrique les PDF, écrit le SQL
  python3 scripts/apps/passes.py --applis poulets # seulement ces dossiers (séparés par des virgules)
  python3 scripts/apps/passes.py --verifier       # lit et contrôle tout, n'écrit rien
  python3 scripts/apps/passes.py --psql           # exécute aussi le SQL avec psql "$DATABASE_URL" (si disponible)

Une appli est « prête » quand son dossier apps/<dossier>/ contient index.html ET PRODUIT.md. Pour chacune, le script :
  1. lit PRODUIT.md (bloc JSON, ou rubriques « Slug / Prix / Titre / Accroche / Description / Points / Questions ») ;
  2. met à jour apps/catalogue.json (pret, passes, nom et icône depuis le manifeste) ;
  3. fabrique pour chaque pass un PDF « Mode d'emploi : activer <Appli> » (reportlab, sortie identique d'un passage
     à l'autre) ;
  4. écrit un fichier SQL idempotent : le PDF dans tcv.course_assets sous « bt/<id>/<nom> » (comme boutique_deposer),
     le produit dans tcv.boutique_produits (type 'fichier', source 'applis', statut 'publie', mise à jour par slug).
     Un pass retiré ou refusé par le propriétaire garde son statut.
Le SQL s'exécute avec l'outil execute_sql de Supabase (ou --psql). Aucune donnée personnelle, aucun secret.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
APPS = RACINE / "apps"
CATALOGUE = APPS / "catalogue.json"
SITE = "https://ndoyepapamassamba-commits.github.io/Add-a-README-file/"
BASE_APPS = SITE + "apps/"
BOUTIQUE = SITE + "boutique/"
DOMAINE_DEFAUT = "Applications pour téléphone"
PRIX_MAX = 50000  # contrainte boutique_produits_prix_check pour la source « applis »
MOTS_A_EVITER = ["contrat", "statuts", "procuration", "religion", "politique", "certificat", "attestation", "faux"]


# ---------------------------------------------------------------- Lecture de PRODUIT.md
def sans_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn").lower()


def nettoyer(v):
    v = str(v or "").strip()
    v = re.sub(r"^\*+|\*+$", "", v).strip()
    v = v.strip("`").strip()
    return re.sub(r"\s+", " ", v)


LIBELLES = {
    "slug": ["slug"], "prix": ["prix"], "titre": ["titre"], "accroche": ["accroche"], "duree": ["duree"],
    "description": ["description"], "faq": ["questions frequentes", "faq", "questions"],
    "points": ["points forts", "points", "ce que vous obtenez", "avantages", "atouts"],
}
RE_TITRE = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")
RE_LIBELLE = re.compile(r"^\s*(?:[-*]\s+)?\*\*([^*]+?)\*\*\s*(?:\([^)]*\))?\s*[:：]\s*(.*)$")
RE_LIBELLE_SIMPLE = re.compile(r"^\s*(?:[-*]\s+)?([A-Za-zÀ-ÿ ]{3,30}?)\s*(?:\([^)]*\))?\s*[:：]\s*(.*)$")


def quel_libelle(texte, titre=False):
    """Rubrique désignée par un libellé (« Prix », « Points forts (5) »…) ; pour un titre « ## … », un mot-clé suffit
    (« Ce que vous obtenez (5 points) »)."""
    plein = sans_accents(nettoyer(texte)).strip(" :")
    t = re.sub(r"\s*\(.*?\)\s*$", "", plein).strip(" :")
    for cle, noms in LIBELLES.items():
        if t in noms:
            return cle
    if titre:
        for cle, noms in LIBELLES.items():
            if any(re.search(r"(^|\W)" + re.escape(n) + r"(\W|$)", plein) for n in noms):
                return cle
    return None


def decouper_rubriques(lignes):
    """Rubriques d'une fiche : {cle: (valeur_en_ligne, [lignes suivantes])}. Accepte « ## Titre » puis texte,
    « **Titre** : valeur », « - **Slug** : `x` » et « **Description** (…) : » suivi d'un paragraphe."""
    rub, cle = {}, None
    for l in lignes:
        m = RE_TITRE.match(l)
        if m:
            k = quel_libelle(m.group(1), titre=True)
            cle = k if k and k not in rub else None
            if cle:
                rub[cle] = ["", []]
            continue
        dans_liste = cle in ("points", "faq") and re.match(r"^\s*(?:[-*•]|\d+[.)])\s+", l)
        m = None if dans_liste else (RE_LIBELLE.match(l) or RE_LIBELLE_SIMPLE.match(l))
        k = quel_libelle(m.group(1)) if m else None
        if k and k not in rub:
            cle = k
            rub[cle] = [nettoyer(m.group(2)), []]
            continue
        if l.strip() == "---":
            cle = None
            continue
        if cle:
            rub[cle][1].append(l)
    return rub


def paragraphe(lignes):
    txt, vu = [], False
    for l in lignes:
        if not l.strip():
            if vu:
                break
            continue
        vu = True
        txt.append(l.strip())
    return nettoyer(" ".join(txt))


def liste(lignes):
    out = []
    for l in lignes:
        m = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.*)$", l)
        if m:
            out.append(nettoyer(m.group(1).replace("**", "")))
        elif l.strip() and out and l.startswith("  "):
            out[-1] += " " + nettoyer(l)
    return [x for x in out if x]


def questions(lignes):
    faq, q = [], None
    for l in lignes:
        s = l.strip()
        if not s:
            continue
        # « **Question ?** », « - **Question ?** — réponse », « - *Question ?* réponse », « ### Question ? »
        m = re.match(r"^(?:[-*]\s+)?(\*\*|\*|_)(.+?\?)\1\s*(?:[—–:-]+\s*)?(.*)$", s) or \
            re.match(r"^(?:[-*]\s+)?(\*\*)(.+?)\1\s*(?:[—–:-]+\s*)?(.*)$", s) or re.match(r"^#{3,6}\s+()(.+?)()$", s)
        if m:
            q = {"q": nettoyer(m.group(2)), "r": nettoyer(m.group(3) or "")}
            faq.append(q)
        elif q is not None:
            q["r"] = nettoyer((q["r"] + " " + s).strip())
    return [x for x in faq if x["q"] and x["r"]]


def nombre(v):
    m = re.search(r"\d[\d\s  .]*", str(v or ""))
    return int(re.sub(r"\D", "", m.group(0))) if m else None


def duree_jours(slug, texte_duree, titre):
    """Durée du pass en jours, ou None pour une licence à vie. Lève ValueError si elle est introuvable."""
    for t in (texte_duree, slug.replace("-", " "), titre):
        s = sans_accents(t)
        if not s:
            continue
        if re.search(r"\b(a vie|licence a vie|vie)\b", s) or (t == slug.replace("-", " ") and s.startswith("licence")):
            return None
        m = re.search(r"(\d+)\s*(jours?|mois|ans?)\b", s)
        if m:
            n, u = int(m.group(1)), m.group(2)
            if u.startswith("jour"):
                return n
            if u.startswith("an"):
                return 365 * n
            return 365 * n // 12 if n % 12 == 0 else 30 * n
    raise ValueError("durée introuvable : écrivez « Durée : 30 jours » (ou « à vie ») dans PRODUIT.md")


def lire_produit_md(chemin):
    texte = chemin.read_text(encoding="utf-8")
    fiches = []
    # 1. Bloc JSON (mêmes champs que tcv.boutique_produits) : prioritaire
    for m in re.finditer(r"```json\s*\n(.*?)```", texte, re.S):
        try:
            v = json.loads(m.group(1))
        except json.JSONDecodeError as e:
            raise ValueError(f"{chemin} : bloc JSON illisible ({e})")
        for o in v if isinstance(v, list) else [v]:
            if isinstance(o, dict) and o.get("slug"):
                fiches.append({"slug": o["slug"], "prix": o.get("prix"), "titre": o.get("titre"), "accroche": o.get("accroche"),
                               "description": o.get("description"), "points": o.get("points") or [], "faq": o.get("faq") or [],
                               "duree": o.get("duree") or o.get("duree_jours")})
    if fiches:
        return fiches
    # 2. Une fiche par slug : du titre qui précède le slug jusqu'au titre qui précède le slug suivant
    lignes = texte.splitlines()
    titres = [i for i, l in enumerate(lignes) if RE_TITRE.match(l)]
    slugs = [i for i, l in enumerate(lignes)
             if (RE_LIBELLE.match(l) and quel_libelle(RE_LIBELLE.match(l).group(1)) == "slug")
             or (RE_LIBELLE_SIMPLE.match(l) and quel_libelle(RE_LIBELLE_SIMPLE.match(l).group(1)) == "slug")
             or (RE_TITRE.match(l) and quel_libelle(RE_TITRE.match(l).group(1)) == "slug")]
    if len(slugs) <= 1:
        morceaux = [lignes]
    else:
        debuts = []
        for k, i in enumerate(slugs):
            avant = [t for t in titres if t < i and (k == 0 or t > slugs[k - 1])]
            debuts.append(avant[-1] if avant else i)
        morceaux = [lignes[debuts[k]:(debuts[k + 1] if k + 1 < len(debuts) else len(lignes))] for k in range(len(debuts))]
    for bloc in morceaux:
        r = decouper_rubriques(bloc)
        val = lambda k: (r[k][0] or paragraphe(r[k][1])) if k in r else ""
        fiches.append({"slug": val("slug").strip("`"), "prix": nombre(val("prix")), "titre": val("titre"),
                       "accroche": val("accroche"), "description": val("description"),
                       "points": liste(r["points"][1]) if "points" in r else [],
                       "faq": questions(r["faq"][1]) if "faq" in r else [], "duree": val("duree")})
    return fiches


def controler(f, ou):
    err = []
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", f.get("slug") or "") or len(f["slug"]) > 80:
        err.append("slug")
    if not isinstance(f.get("prix"), int) or not 500 <= f["prix"] <= PRIX_MAX:
        err.append(f"prix (500 à {PRIX_MAX} F)")
    for k, mn, mx in (("titre", 10, 100), ("accroche", 20, 220), ("description", 100, 3000)):
        if not 1 <= mn <= len(f.get(k) or "") <= mx:
            err.append(f"{k} : {mn} à {mx} caractères (actuel {len(f.get(k) or '')})")
    if not 3 <= len(f.get("points") or []) <= 8:
        err.append("3 à 8 points forts")
    if not 1 <= len(f.get("faq") or []) <= 10 or any(not (x.get("q") and x.get("r")) for x in f["faq"]):
        err.append("questions fréquentes (1 à 10, question et réponse)")
    if err:
        raise ValueError(f"{ou} / {f.get('slug')} : " + " ; ".join(err))
    texte = sans_accents(" ".join([f["titre"], f["accroche"], f["description"], *f["points"]]))
    for mot in MOTS_A_EVITER:
        if re.search(r"\b" + mot + r"\b", texte):
            print(f"  attention ({ou} / {f['slug']}) : le mot « {mot} » est à éviter", file=sys.stderr)


# ---------------------------------------------------------------- Catalogue
def manifeste(dossier):
    p = APPS / dossier / "manifest.webmanifest"
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    except json.JSONDecodeError:
        return {}


def activation(dossier):
    """(lien_direct, ecran, serveur) : l'appli lit-elle ?o=…&t=… au démarrage ? Sinon, route de son écran du pass
    (#/pass…). serveur : vrai si elle échange des données avec un serveur (dossiers partagés, IA) ; on ne dit alors
    jamais que « les données restent sur le téléphone »."""
    js = ""
    for f in sorted((APPS / dossier).rglob("*.js")):
        if "vendor" not in f.parts and f.name != "sw.js":
            js += f.read_text(encoding="utf-8", errors="replace")
    direct = "location.search" in js and re.search(r"\.get\(\s*['\"]o['\"]\s*\)", js) is not None
    ecran = next((r for r in ("#/pass", "#/licence", "#/abonnement") if r in js or "\\/" + r[2:] + "$" in js), "")
    serveur = bool(re.search(r"functions/v1/(?!boutique)[a-z]+|/extraire\b", js))
    return direct, ecran, serveur


def titre_court(duree):
    if duree is None:
        return "Licence à vie"
    if duree >= 360 and duree % 365 in (0, 1):
        return f"Pass {round(duree / 365) * 12} mois"
    if duree % 30 == 0 or duree in (31,):
        return f"Pass {max(1, duree // 30)} mois"
    return f"Pass {duree} jours"


def fcfa(n):
    return f"{int(n):,}".replace(",", " ") + " F"


def duree_texte(d):
    return "licence à vie" if d is None else f"valable {d} jours à partir du paiement"


# ---------------------------------------------------------------- PDF « Mode d'emploi »
def pdf_mode_emploi(appli, f):
    from reportlab import rl_config
    rl_config.invariant = 1  # même PDF d'un passage à l'autre (ni date, ni identifiant aléatoire)
    rl_config.useA85 = 0  # flux compressés en binaire : fichier plus petit
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape as x

    vert, gris = colors.HexColor("#0b6e4f"), colors.HexColor("#56625b")
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=11, leading=15.5, alignment=TA_LEFT, spaceAfter=4)
    titre = ParagraphStyle("titre", parent=base, fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=vert, spaceAfter=4)
    sous = ParagraphStyle("sous", parent=base, fontSize=11.5, textColor=gris, spaceAfter=10)
    h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=13.5, leading=18, textColor=vert, spaceBefore=10, spaceAfter=4)
    code = ParagraphStyle("code", parent=base, fontName="Courier", fontSize=9.6, leading=13, textColor=colors.black)
    petit = ParagraphStyle("petit", parent=base, fontSize=9.5, leading=13, textColor=gris)

    nom, url = appli["nom"], BASE_APPS + appli["dossier"] + "/"
    ecran = appli.get("ecran_pass") or "l'écran du pass (Réglages)"
    direct = appli.get("lien_direct", True)
    licence = f["duree_jours"] is None
    mot = "licence" if licence else "pass"

    def puces(items, numeros=True):
        return ListFlowable([ListItem(Paragraph(i, base), leftIndent=14) for i in items],
                            bulletType="1" if numeros else "bullet", start="1" if numeros else None,
                            bulletFontName="Helvetica-Bold", bulletColor=vert, leftIndent=16, bulletFontSize=10.5)

    def encadre(contenu):
        t = Table([[contenu]], colWidths=[170 * mm])
        t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, vert), ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#e7f3ee")),
                               ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                               ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        return t

    h = [
        Paragraph(x(f"Mode d'emploi : activer {nom}"), titre),
        Paragraph(x(f"{f['titre']} · {fcfa(f['prix'])} · {duree_texte(f['duree_jours'])}"), sous),
        Paragraph(x(f"Merci pour votre achat ! Ce guide explique comment installer {nom} sur votre téléphone et activer votre "
                    f"{mot} en deux minutes. " + ("Internet est nécessaire une seule fois, au moment de l'activation ; ensuite "
                    "l'application marche sans connexion et vos données restent sur votre téléphone."
                    if appli.get("hors_ligne") and not appli.get("serveur")
                    else "Il faut une connexion Internet au moment de l'activation.")), base),
        Paragraph("1. Le plus simple : depuis la page de votre commande", h2),
        puces([x("Ouvrez la page de votre commande payée (le lien reçu après votre commande, ou « Mes commandes » dans la boutique)."),
               x("Touchez le grand bouton « Ouvrir l'application et activer »."),
               x(f"{nom} s'ouvre et vérifie votre commande : la version complète est activée. C'est tout.") if direct else
               x(f"Le lien de votre commande est copié et {nom} s'ouvre sur {ecran} : collez le lien dans la case "
                 "« Lien de votre commande » et touchez « Activer ».")]),
        Paragraph("2. Installer l'application sur l'écran d'accueil", h2),
        Paragraph("<b>Sur Android (Chrome)</b>", base),
        puces([f"Ouvrez <font name='Courier'>{x(url)}</font> dans Chrome.",
               x("Touchez « Installer » dans l'application, ou le menu à trois points en haut à droite."),
               x("Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».")], False),
        Paragraph("<b>Sur iPhone (Safari)</b>", base),
        puces([f"Ouvrez <font name='Courier'>{x(url)}</font> dans Safari.",
               x("Touchez le bouton Partager (le carré avec une flèche vers le haut)."),
               x("Choisissez « Sur l'écran d'accueil », puis « Ajouter ».")], False),
        Paragraph("3. Activer dans l'application installée (surtout sur iPhone)", h2),
        Paragraph(x("Sur iPhone, l'application posée sur l'écran d'accueil garde ses propres réglages : activez-la de l'intérieur."), base),
        puces([x("Sur la page de votre commande, touchez « Copier le lien de cette page »."),
               x(f"Ouvrez {nom} depuis l'écran d'accueil, puis allez dans {ecran}."),
               x("Collez le lien et touchez « Activer ».")]),
        KeepTogether([
            Paragraph("4. Le lien d'activation direct" if direct else "4. Le lien de votre commande", h2),
            Paragraph(x("Le lien de votre commande ressemble à ceci :"), base),
            encadre(Paragraph(x(BOUTIQUE + "commande.html?o=TCV-XXXXXXXX&t=VOTRE-JETON"), code)),
            Spacer(1, 5),
        ] + ([
            Paragraph(x(f"Le lien qui ouvre {nom} et active votre {mot} est :"), base),
            encadre(Paragraph(x(url + "?o=TCV-XXXXXXXX&t=VOTRE-JETON"), code)),
            Spacer(1, 4),
            Paragraph(x("Remplacez TCV-XXXXXXXX et VOTRE-JETON par les deux valeurs de votre propre lien de commande. "
                        "Gardez ce lien pour vous : il prouve votre achat et ne doit pas être partagé."), base),
        ] if direct else [
            Paragraph(x(f"C'est ce lien entier (avec TCV-… et le jeton) qu'il faut coller dans {nom}. "
                        "Gardez-le pour vous : il prouve votre achat et ne doit pas être partagé."), base),
        ])),
        Paragraph("5. Nouveau téléphone", h2),
        Paragraph(x("Faites une sauvegarde dans l'application, restaurez-la sur le nouveau téléphone, puis activez à nouveau "
                    "avec le même lien de commande (étape 1 ou 3)."), base),
        Paragraph("6. Durée", h2),
        Paragraph(x("Votre licence est valable à vie : un seul paiement, aucun abonnement." if licence else
                    f"Votre pass est valable {f['duree_jours']} jours à partir du paiement. Rien n'est prélevé automatiquement : "
                    "à la fin, vos données restent sur votre téléphone et vous pouvez reprendre un pass quand vous voulez."), base),
        Paragraph("7. Besoin d'aide ?", h2),
        Paragraph(x("Écrivez-nous sur WhatsApp : sur la page de votre commande, touchez « Aide sur WhatsApp » (c'est le même "
                    "numéro que le numéro Wave que vous avez payé). Indiquez le code de votre commande (TCV-…). "
                    "Ne donnez jamais votre code secret Wave."), base),
        Spacer(1, 10),
        Paragraph(x(f"Teranga Outils · {BOUTIQUE} · Applications : {BASE_APPS}"), petit),
    ]
    tampon = io.BytesIO()
    doc = SimpleDocTemplate(tampon, pagesize=A4, pageCompression=1, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=16 * mm,
                            title=f"Mode d'emploi : activer {nom}", author="Teranga Outils", subject=f["titre"], creator="Teranga Outils")
    doc.build(h)
    return tampon.getvalue()


# ---------------------------------------------------------------- SQL
def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def jb(v):
    return lit(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def apercu(appli, f, nom_pdf):
    url = BASE_APPS + appli["dossier"] + "/"
    return {
        "type": "application", "dossier": appli["dossier"], "nom": appli["nom"], "url": url,
        "icone": BASE_APPS + appli["icone"], "pass": f["titre_court"], "duree_jours": f["duree_jours"],
        "gratuit": appli.get("gratuit") or "", "ecran_pass": appli.get("ecran_pass") or "",
        "etapes": [
            "Commandez et payez par Wave le montant exact affiché.",
            "Sur la page de votre commande, touchez « Ouvrir l'application et activer ».",
            f"{appli['nom']} vérifie votre commande : la version complète est activée"
            + (", et marche ensuite même sans Internet." if appli.get("hors_ligne") and not appli.get("serveur") else "."),
        ],
        "mode_emploi": nom_pdf,
    }


def sql_pass(appli, f, pdf, nom_pdf, domaine, attente=False):
    """attente : appli construite mais pas encore validée (champ « attente » du catalogue) : pass en brouillon, jamais
    publié tout seul (controle.ok = false bloque la publication tacite de la boutique)."""
    pid = "bt_" + f["slug"].replace("-", "_")[:60]
    sha = hashlib.sha256(pdf).hexdigest()
    fichiers = [{"nom": nom_pdf, "mime": "application/pdf", "taille": len(pdf), "sha256": sha}]
    controle = {"ok": not attente, "outil": "scripts/apps/passes.py", "appli": appli["dossier"], "pdf_sha256": sha}
    if attente:
        controle["attente"] = str(appli.get("attente"))[:200]
    statut = "brouillon" if attente else "publie"
    b64 = base64.b64encode(pdf).decode()
    return f"""-- {f['slug']} ({appli['nom']}, {f['prix']} F)
insert into tcv.course_assets (name, mime, bytes, sha256, updated_at)
values ({lit(f'bt/{pid}/{nom_pdf}')}, 'application/pdf', decode({lit(b64)}, 'base64'), {lit(sha)}, now())
on conflict (name) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at
  where tcv.course_assets.sha256 is distinct from excluded.sha256;
insert into tcv.boutique_produits as p (id, slug, titre, domaine, accroche, description, points, faq, prix, fichiers, apercu,
  statut, source, controle, type, cree_le, publier_apres, publie_le, decide_le)
values ({lit(pid)}, {lit(f['slug'])}, {lit(f['titre'])}, {lit(domaine)}, {lit(f['accroche'])}, {lit(f['description'])},
  {jb(f['points'])}, {jb(f['faq'])}, {int(f['prix'])}, {jb(fichiers)}, {jb(apercu(appli, f, nom_pdf))},
  {lit(statut)}, 'applis', {jb(controle)}, 'fichier', now(), now(), {"null" if attente else "now()"}, {"null" if attente else "now()"})
on conflict (slug) do update set titre = excluded.titre, domaine = excluded.domaine, accroche = excluded.accroche,
  description = excluded.description, points = excluded.points, faq = excluded.faq, prix = excluded.prix,
  fichiers = excluded.fichiers, apercu = excluded.apercu, source = 'applis', controle = excluded.controle, type = 'fichier',
  statut = case when p.statut in ('retire', 'refuse') then p.statut else {lit(statut)} end,
  publie_le = case when p.statut in ('retire', 'refuse') or {lit(statut)} = 'brouillon' then p.publie_le else coalesce(p.publie_le, now()) end;
"""


# ---------------------------------------------------------------- Programme
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--applis", help="dossiers à traiter, séparés par des virgules (par défaut : toutes les applis prêtes)")
    ap.add_argument("--sortie", help="dossier où écrire passes.sql et les PDF (par défaut : un dossier temporaire)")
    ap.add_argument("--verifier", action="store_true", help="contrôler seulement, sans rien écrire")
    ap.add_argument("--psql", action="store_true", help='exécuter le SQL avec psql "$DATABASE_URL"')
    a = ap.parse_args()

    cat = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    domaine = cat.get("domaine") or DOMAINE_DEFAUT
    choix = set(a.applis.split(",")) if a.applis else None
    connus = {x["dossier"] for x in cat["applis"]}
    for d in sorted(p.name for p in APPS.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))):
        if d not in connus:  # nouveau dossier : ajouté au registre
            cat["applis"].append({"dossier": d, "nom": manifeste(d).get("name") or d.capitalize(), "accroche": "",
                                  "icone": f"{d}/icons/icon-192.png", "passes": [], "pret": False})
            print(f"+ {d} : nouveau dossier ajouté au catalogue")

    erreurs, blocs, rapport = [], [], []
    for appli in cat["applis"]:
        d = appli["dossier"]
        dossier = APPS / d
        construite = (dossier / "index.html").is_file() and (dossier / "PRODUIT.md").is_file()
        attente = bool(appli.get("attente"))  # mise en vente suspendue par le coordinateur : pass en brouillon
        pret = construite and not attente
        if appli.get("pret") != pret:
            print(f"~ {d} : pret {appli.get('pret')} → {pret}")
        appli["pret"] = pret
        if not construite or (choix and d not in choix):
            continue
        m = manifeste(d)
        if m.get("name"):
            appli["nom"] = m["name"]
        if not appli.get("accroche"):
            appli["accroche"] = (m.get("description") or "").strip()
        if not (APPS / appli.get("icone", "")).is_file():
            icones = sorted(m.get("icons") or [], key=lambda i: abs(int((i.get("sizes") or "0x0").split("x")[0] or 0) - 192))
            appli["icone"] = d + "/" + icones[0]["src"].lstrip("./") if icones else appli.get("icone", "")
        appli["lien_direct"], ecran_url, appli["serveur"] = activation(d)
        appli.setdefault("hors_ligne", not appli["serveur"])  # « s'ouvre sans Internet » : réglable à la main
        if not appli["lien_direct"]:
            appli["ecran_pass_url"] = appli.get("ecran_pass_url") or ecran_url
            print(f"  attention ({d}) : l'appli ne lit pas ?o=…&t= au démarrage ; le bouton de la commande copiera le lien et "
                  f"ouvrira {appli['ecran_pass_url'] or 'l’appli'}", file=sys.stderr)
        else:
            appli.pop("ecran_pass_url", None)
        connues = {p["slug"]: p.get("duree_jours", "?") for p in appli.get("passes", [])}
        try:
            fiches = lire_produit_md(dossier / "PRODUIT.md")
            if not fiches:
                raise ValueError(f"{d}/PRODUIT.md : aucun pass trouvé (il faut au moins un « Slug »)")
            for f in fiches:
                f["prix"] = nombre(f["prix"]) if not isinstance(f["prix"], int) else f["prix"]
                f["titre"], f["accroche"], f["description"] = nettoyer(f["titre"]), nettoyer(f["accroche"]), nettoyer(f["description"])
                f["points"] = [nettoyer(p) for p in f["points"]]
                f["faq"] = [{"q": nettoyer(x.get("q")), "r": nettoyer(x.get("r"))} for x in f["faq"]]
                controler(f, d)
                if isinstance(f["duree"], int) or (f["duree"] or "").strip():
                    dj = f["duree"] if isinstance(f["duree"], int) else duree_jours(f["slug"], f["duree"], f["titre"])
                elif connues.get(f["slug"], "?") != "?":  # durée déjà notée dans catalogue.json pour ce pass
                    dj = connues[f["slug"]]
                else:
                    dj = duree_jours(f["slug"], "", f["titre"])
                f["duree_jours"], f["titre_court"] = dj, titre_court(dj)
        except ValueError as e:
            erreurs.append(str(e))
            print(f"! {e} → appli laissée « pas prête » tant que PRODUIT.md n'est pas corrigé", file=sys.stderr)
            appli["pret"] = False
            continue
        if not appli.get("accroche"):
            appli["accroche"] = fiches[0]["accroche"]
        anciens = {p["slug"] for p in appli.get("passes", [])}
        appli["passes"] = [{"slug": f["slug"], "prix": f["prix"], "duree_jours": f["duree_jours"], "titre": f["titre_court"]} for f in fiches]
        if anciens and anciens != {p["slug"] for p in appli["passes"]}:
            print(f"~ {d} : passes {sorted(anciens)} → {sorted(p['slug'] for p in appli['passes'])} (d'après PRODUIT.md)")
        for f in fiches:
            nom_pdf = f"mode-emploi-{d}.pdf"
            pdf = pdf_mode_emploi(appli, f)
            blocs.append((f, nom_pdf, pdf, sql_pass(appli, f, pdf, nom_pdf, domaine, attente)))
            rapport.append(f"  {f['slug']} : {fcfa(f['prix'])}, {f['titre_court']}, PDF {len(pdf)} octets"
                           + (" — BROUILLON (attente : " + str(appli["attente"]) + ")" if attente else ""))

    print(f"{sum(1 for x in cat['applis'] if x['pret'])} applis prêtes ; {len(blocs)} pass dans le SQL")
    print("\n".join(rapport))
    if a.verifier:
        return 1 if erreurs else 0
    texte = json.dumps(cat, ensure_ascii=False, indent=2) + "\n"
    if CATALOGUE.read_text(encoding="utf-8") != texte:
        CATALOGUE.write_text(texte, encoding="utf-8")
        print(f"apps/catalogue.json mis à jour")
    sortie = Path(a.sortie) if a.sortie else Path(tempfile.mkdtemp(prefix="passes-"))
    sortie.mkdir(parents=True, exist_ok=True)
    for f, nom_pdf, pdf, _ in blocs:
        (sortie / f"{f['slug']}.pdf").write_bytes(pdf)
    sql = "-- Pass des applications TERANGA (scripts/apps/passes.py) : idempotent, mise à jour par slug\nbegin;\n" + \
          "".join(b[3] for b in blocs) + "commit;\n"
    (sortie / "passes.sql").write_text(sql, encoding="utf-8")
    print(f"SQL : {sortie / 'passes.sql'} ({len(sql)} caractères) ; PDF dans {sortie}")
    if a.psql and blocs:
        if not (os.environ.get("DATABASE_URL") and shutil.which("psql")):
            print("! --psql : DATABASE_URL ou psql absent ; exécutez passes.sql avec l'outil execute_sql de Supabase", file=sys.stderr)
            return 1
        subprocess.run(["psql", os.environ["DATABASE_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-f", str(sortie / "passes.sql")], check=True)
        print("SQL exécuté.")
    return 1 if erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
