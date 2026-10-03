"""Capacités avancées de TypeSafe (modèle Jev) découvertes et exploitées pour les Impayés.

Toutes restent des jugements : aucune ne produit de montant ni de ratio. Le code assemble,
compare, pondère et décide.

Découvertes vérifiées sur l'API (2026-10-03, jev-1.13.0, 21 commentaires fictifs) :
  - GET /v1/models expose les alias `jev-latest` et `jev-preview` ; la réponse donne la version
    exacte (`model`) et la consommation (`usage`) : conservées pour la piste d'audit.
  - Seuls trois types de questions existent (choice, score, noul) : tout autre type → 400.
  - Instructions en anglais ou en français : 21/21 réponses identiques, confiance équivalente
    (0,914 / 0,916) → le français est fiable sur ce domaine.
  - Ordre des options inversé : 21/21 identiques → contrôle d'ordre conservé sur motif et routage.
  - Un « sel » (identifiant aléatoire) dans l'état fait varier les probabilités de ±0,03 :
    rééchantillonnage utilisé comme mesure de stabilité des dossiers sensibles.
  - Confiance publiée : Choice = (n·pmax − 1)/(n − 1) ; Score = 1 − dispersion/dispersion uniforme.
  - Limites connues (jev-1.13) : dates et calculs en code ; extraction par composants (Choice).
"""
import calendar
import json
import random
from datetime import date, timedelta

MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]


def inverse(q):
    """Même question, options dans l'ordre inverse (contrôle du biais d'ordre)."""
    r = dict(q)
    r["criteria"] = dict(reversed(list(q["criteria"].items())))
    return r


def questions_avancees(Q):
    jours = {f"j{k:02d}": f"Le {k} du mois est cité comme jour de régularisation" for k in range(1, 32)}
    jours["non_precise"] = "Aucun jour précis du mois n'est cité"
    mois = {m: f"Le mois de {m} est cité" for m in MOIS}
    mois.update({"mois_en_cours": "Ce mois-ci, ou la fin du mois en cours", "mois_prochain": "Le mois prochain",
                 "non_precise": "Aucun mois n'est cité"})
    return {
        # extraction de date par composants (jev-1.13 : extraction en Choice, arithmétique en code)
        "date_jour": {"type": "choice", "criteria": jours,
                      "instructions": "Quel jour du mois est cité comme date de régularisation dans `dossier.commentaire_gestionnaire` ?"},
        "date_mois": {"type": "choice", "criteria": mois,
                      "instructions": "Quel mois est cité pour la régularisation dans `dossier.commentaire_gestionnaire` ?"},
        "date_relative": {"type": "choice",
                          "instructions": "Comment l'échéance de régularisation est-elle exprimée dans `dossier.commentaire_gestionnaire` ?",
                          "criteria": {"aucune": "Aucune échéance", "date_precise": "Une date précise (jour et/ou mois)",
                                       "cette_semaine": "Cette semaine", "semaine_prochaine": "La semaine prochaine",
                                       "fin_de_mois": "La fin du mois", "sous_quelques_jours": "Dans un nombre de jours donné"}},
        # conformité : données personnelles sensibles dans le texte libre
        "donnees_sensibles": {"type": "noul",
                              "instructions": "Le commentaire `dossier.commentaire_gestionnaire` contient-il une donnée personnelle sensible : santé, décès, situation familiale, religion ou opinion ?",
                              "criteria": {"true": "Une donnée personnelle sensible est mentionnée", "false": "Aucune donnée personnelle sensible"}},
        # classification hiérarchique avec repli sur la famille quand le motif détaillé est incertain
        "famille_motif": {"type": "choice",
                          "instructions": "De quelle famille relève la cause de l'impayé décrite dans `dossier.commentaire_gestionnaire` ?",
                          "criteria": {"capacite": "La capacité de remboursement du client est atteinte",
                                       "volonte": "Le client pourrait payer mais ne le fait pas ou ne répond pas",
                                       "technique": "Incident technique ou administratif sans difficulté financière",
                                       "externe": "Événement juridique, sanitaire ou extérieur au client",
                                       "indetermine": "Le commentaire ne permet pas de conclure"}},
        # re-classement d'un catalogue d'actions défini par le code
        "action_recommandee": {"type": "choice",
                               "instructions": "Parmi les actions suivantes, laquelle répond le mieux à la situation décrite dans `dossier.commentaire_gestionnaire` ?",
                               "criteria": {"verification_reglement": "Vérifier dans le système le règlement annoncé",
                                            "relance_gestionnaire": "Relance téléphonique ou écrite par le gestionnaire",
                                            "visite_terrain": "Visite du client ou de son activité",
                                            "mise_en_demeure": "Mise en demeure formelle",
                                            "etude_restructuration": "Étude d'un rééchelonnement ou d'une restructuration",
                                            "realisation_garantie": "Mise en jeu ou réalisation de la garantie",
                                            "transfert_contentieux": "Transfert au recouvrement contentieux ou au juridique",
                                            "surveillance_simple": "Surveillance simple, aucune action particulière"}},
        # contrôles du biais d'ordre des options
        "motif_inv": inverse(Q["motif"]),
        "routage_inv": inverse(Q["routage"]),
    }


LIB_FAMILLE = {"capacite": "Capacité de remboursement", "volonte": "Volonté de payer", "technique": "Incident technique",
               "externe": "Événement externe", "indetermine": "Indéterminé"}
LIB_ACTION = {"verification_reglement": "Vérifier le règlement annoncé", "relance_gestionnaire": "Relance du gestionnaire",
              "visite_terrain": "Visite terrain", "mise_en_demeure": "Mise en demeure",
              "etude_restructuration": "Étude de restructuration", "realisation_garantie": "Réalisation de la garantie",
              "transfert_contentieux": "Transfert au contentieux", "surveillance_simple": "Surveillance simple"}


def confiance_choice(probas):
    """Formule publiée par TypeSafe : (n·pmax − 1)/(n − 1)."""
    v = list(probas.values())
    n = len(v)
    return max(0.0, min(1.0, (n * max(v) - 1) / (n - 1))) if n > 1 else 1.0


def marge(probas):
    v = sorted(probas.values(), reverse=True)
    return v[0] - (v[1] if len(v) > 1 else 0)


def date_par_composants(r, arrete, seuil=0.6):
    """Assemble en code la date promise à partir des composants extraits (jour, mois, relatif)."""
    rel = r.get("date_relative")
    if rel and rel["confidence"] >= seuil:
        c = rel["choice"]
        if c == "cette_semaine":
            return arrete + timedelta(days=max(0, 4 - arrete.weekday()))
        if c == "semaine_prochaine":
            return arrete + timedelta(days=7 + 4 - arrete.weekday())
        if c == "fin_de_mois":
            return date(arrete.year, arrete.month, calendar.monthrange(arrete.year, arrete.month)[1])
    j, m = r.get("date_jour"), r.get("date_mois")
    if not j or j["choice"] == "non_precise" or j["confidence"] < seuil:
        return None
    jour = int(j["choice"][1:])
    if m and m["choice"] in MOIS and m["confidence"] >= seuil:
        mo = MOIS.index(m["choice"]) + 1
        an = arrete.year if mo >= arrete.month else arrete.year + 1
    elif m and m["choice"] == "mois_prochain" and m["confidence"] >= seuil:
        mo = arrete.month % 12 + 1
        an = arrete.year + (mo == 1)
    else:
        an, mo = arrete.year, arrete.month
        if jour <= arrete.day:
            mo = mo % 12 + 1
            an += mo == 1
    try:
        return date(an, mo, jour)
    except ValueError:
        return None


def etat_sel(etat):
    """Ajoute un sel aléatoire à l'état : rééchantillonnage du modèle (mesure de stabilité)."""
    e = json.loads(json.dumps(etat))
    e["uid"] = "%08x" % random.getrandbits(32)
    return e


# ---------------- appel « portefeuille » : phrase de lecture et contreparties liées ----------------

def questions_portefeuille(pf):
    q = {}
    for i, ins in enumerate(pf.get("insights", [])):
        q[f"importance_{ins['id']}"] = {"type": "score",
            "instructions": f"Quelle est l'importance du constat `insights[{i}]` pour un Comité des Risques bancaire ?",
            "criteria": ["Anecdotique", "Utile en annexe", "À mentionner", "Important", "Décisif pour le Comité"]}
    if pf.get("insights"):
        q["phrase_lecture"] = {"type": "choice",
            "instructions": "Quel constat doit ouvrir la lecture du Comité des Risques ?",
            "criteria": {ins["id"]: ins["titre"] + " : " + ins["texte"][:240] for ins in pf["insights"]}}
    for i, p in enumerate(pf.get("paires", [])):
        q[f"groupe_{p['id']}"] = {"type": "score",
            "instructions": f"Les deux contreparties de `paires[{i}]` appartiennent-elles au même groupe économique (bénéficiaires liés) ?",
            "criteria": ["Entités distinctes", "Lien possible à vérifier", "Même groupe économique"]}
        q[f"meme_nom_{p['id']}"] = {"type": "noul",
            "instructions": f"Les deux noms de `paires[{i}]` désignent-ils la même raison sociale ou la même famille de sociétés ?"}
    return q


# ---------------- scénarios macro (stress narratif) : exposition jugée, montants calculés en code ----------------
SCENARIOS = {
    "retard_paiements_etat": "Retards prolongés des paiements de l'État, des collectivités et des sociétés publiques (arriérés intérieurs)",
    "campagne_agricole": "Mauvaise campagne agricole (arachide, coton, riz, horticulture) et baisse des revenus ruraux",
    "choc_hydrocarbures": "Report ou baisse des revenus pétroliers et gaziers, ralentissement des grands projets et de leur sous-traitance",
    "hausse_taux": "Hausse des taux directeurs de la BCEAO et renchérissement du crédit",
    "choc_sanitaire": "Crise sanitaire ou épidémie paralysant l'activité et les déplacements",
    "perte_donneur_ordre": "Perte d'un grand donneur d'ordre, d'un contrat principal ou d'un employeur",
    "prix_importation": "Hausse des prix à l'importation, du fret et des intrants, compression des marges",
    "gouvernance_fraude": "Fraude, détournement ou défaillance de gouvernance chez le client",
}


def questions_scenarios():
    return {f"scen_{k}": {"type": "noul",
                          "instructions": {"scenario": v,
                                           "question": "Au vu de `dossier.commentaire_gestionnaire`, `dossier.secteur` et `dossier.segment`, ce dossier est-il directement exposé au `scenario` ?"},
                          "criteria": {"true": "Le scénario toucherait directement les revenus ou la capacité de remboursement de ce client",
                                       "false": "Pas d'exposition directe identifiable"}}
            for k, v in SCENARIOS.items()}


# ---------------- démonstration : situations complexes (fictives) et anonymisation ----------------
# Commentaires fictifs à plusieurs facteurs : ils obligent le moteur à démêler cause, durabilité,
# exposition à plusieurs scénarios macro et cohérence du plan. Aucune donnée réelle.
COMMENTAIRES_COMPLEXES = [
    "Sous-traitant d'un opérateur gazier offshore : le démarrage de la phase 2 est reporté, les factures de "
    "septembre ne sont pas payées et le client a mis 40 % de son personnel en chômage technique.",
    "Importateur de riz : la hausse du fret et du dollar a comprimé la marge, le stock est financé à découvert. "
    "Le client demande un crédit de campagne supplémentaire avant la soudure.",
    "Entreprise de BTP dont 70 % du carnet provient de marchés publics ; trois décomptes visés au Trésor restent "
    "impayés depuis juin. Le client a cessé de payer ses sous-traitants et négocie avec la caisse sociale.",
    "Le commissaire aux comptes a refusé de certifier les comptes 2025 ; des sorties de fonds vers une société "
    "du gérant sont en cours d'analyse. Le gérant reste joignable mais ne fournit pas les relevés demandés.",
    "Transporteur vers le Mali : flux ralentis par la fermeture partielle du corridor et la hausse du gasoil. "
    "Le client demande un report de 30 jours et propose de nantir deux camions.",
    "Clinique privée : la fréquentation a chuté après l'épidémie de dengue et les remboursements des mutuelles "
    "accusent quatre mois de retard. Le promoteur annonce un apport en compte courant le 25/10/2026.",
]
# secteurs fictifs alignés sur COMMENTAIRES_FICTIFS (impayes_typesafe) puis sur COMMENTAIRES_COMPLEXES
SECTEURS_DEMO = [
    "Commerce de gros", "Fournitures aux administrations", "Commerce de détail", "Services aux entreprises",
    "Particulier salarié", "Sous-traitance minière", "Commerce de détail", "Commerce de gros", "Commerce de détail",
    "Agro-industrie (distribution)", "Services aux entreprises", "Services aux entreprises", "Négoce et escompte commercial",
    "Particulier salarié", "Particulier salarié", "Établissement public", "Industrie manufacturière", "Particulier salarié",
    "Holding de participations", "Commerce de détail", "Services aux entreprises", "Commerce de gros",
    "Agriculture (arachide)", "Industrie (groupe régional)",
    "Services pétroliers et gaziers", "Import de denrées alimentaires", "Bâtiment et travaux publics",
    "Commerce de gros", "Transport routier international", "Santé privée",
]


def masquer(texte, noms, alias="[nom masqué]"):
    """Remplace chaque nom cité (du plus long au plus court) : anonymisation avant envoi à l'API."""
    t = texte or ""
    for n in sorted({n for n in noms if n and len(n) > 2}, key=len, reverse=True):
        t = t.replace(n, alias if isinstance(alias, str) else alias.get(n, "[nom masqué]"))
    return t
