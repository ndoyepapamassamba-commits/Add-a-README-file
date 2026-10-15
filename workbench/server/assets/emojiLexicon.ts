// ÉMOJIS ADAPTATIFS (v64, consigne du 15/10/2026 : « on fera différents reportings, il faut que les émojis suivent —
// pas des émojis statiques, adaptatifs »). Un émoji 3D est choisi pour CHAQUE titre, chiffre ou bouton d'après son sens :
// lexique français / anglais (racines), domaine du dossier détecté (crédit, ventes, RH, santé, énergie, logistique,
// agriculture, immobilier, numérique, secteur public, ESG…) et diversité (deux chapitres n'ont pas le même émoji).
// Pur et hors ligne ; JEV peut affiner le choix entre les meilleurs candidats quand il est joignable.
import { fluentB64 } from './fluentEmoji';

/** Emoji → the stems that evoke it (accents removed, lower case; a stem matches the start of a word). */
const LEX: Record<string, string> = {
  // finance & banque
  '🏦': 'banque bank bancaire etablissement agence guichet domicil',
  '💼': 'credit engagement portefeuille encours pret financement facilite exposition corporate entreprise business',
  '💸': 'impaye arriere retard recouvr creance douteu defaut perte sinistre',
  '🧮': 'provision depreciation ecl calcul comptab ratio formule',
  '💰': 'chiffre affaire revenu recette produit marge benefice profit resultat tresorerie cash epargne',
  '💳': 'carte paiement transaction monetique',
  '💵': 'dollar devise change usd',
  '💶': 'euro eur',
  '🪙': 'fcfa xof cout prix tarif frais commission',
  '🧾': 'facture receipt quittance note frais depense achat',
  '📈': 'croissance hausse progression evolution tendance trend growth augment',
  '📉': 'baisse recul declin chute diminution decline',
  '📊': 'synthese tableau bord dashboard indicateur kpi statistique chiffre analyse repartition',
  '🎯': 'objectif cible concentration target exposition contrepartie budget',
  '🏆': 'top classement palmares meilleur ranking leader performance',
  '🔐': 'garantie surete hypothe nantissement collateral securisation',
  '🛡️': 'assurance protection couverture police insur',
  '⏳': 'echeance deferral differe delai report attente maturite',
  '⚖️': 'reglement norme ifrs bceao umoa prudentiel conformite juridique legal loi contentieux litige',
  '🏛️': 'capital fonds propres solvabilite gouvernance institution etat public administration ministere',
  '💧': 'liquidite lcr nsfr flux',
  '☂️': 'couverture hedging risque marche',
  '🧑‍⚖️': 'juge tribunal justice',
  // pilotage & décisions
  '✅': 'plan action recommand mesure decision valid realise atteint',
  '🗳️': 'vote comite conseil decision',
  '🧩': 'hypothese scenario modele parametr',
  '⚙️': 'parametre reglage processus procedure operation methode',
  '🔍': 'qualite controle audit verification revue',
  '📚': 'source reference bibliograph recherche etude litterature',
  '📘': 'glossaire lexique definition terme',
  '🗂️': 'donnee data base liste fichier registre inventaire',
  '⚠️': 'risque alerte attention vigilance anomalie incident menace',
  '📣': 'message communication annonce cle',
  '💡': 'idee innovation conseil enseignement lecture opportunite',
  '📝': 'analyse commentaire note redaction rapport',
  '🔬': 'diagnostic etude approfondi investigation',
  '🧪': 'test experimentation pilote essai',
  '🧭': 'strategie orientation feuille route direction cap vision',
  '📅': 'calendrier planning agenda periode mois trimestre annee date',
  '⏱️': 'temps duree delai sla rapidite productivite',
  '🚀': 'lancement projet transformation initiative acceleration',
  // commerce & clients
  '🛒': 'vente commerce panier commande retail achat client consommateur',
  '🛍️': 'boutique magasin shopping detail',
  '🏪': 'point vente reseau distribution',
  '👥': 'client tiers beneficiaire population segment clientele usager',
  '🤝': 'partenaire partenariat relation fidel accord contrat negociation',
  '📦': 'stock produit inventaire article colis',
  '🏷️': 'promotion remise prix label marque',
  '📢': 'marketing campagne publicite',
  '🌐': 'digital numerique internet web canal online',
  // RH
  '👔': 'ressource humaine rh effectif personnel salarie employe recrutement',
  '👩‍💼': 'manager cadre collaborateur talent',
  '🎓': 'formation competence diplome education apprentissage universite',
  '💪': 'engagement motivation performance individuelle',
  // santé
  '🏥': 'sante hopital clinique medical patient soin',
  '💊': 'medicament pharmacie traitement',
  '🩺': 'diagnostic medecin consultation',
  '🚑': 'urgence secours',
  '🧬': 'genetique biologie',
  // énergie, environnement, agriculture
  '⚡': 'energie electricite puissance',
  '🔌': 'raccordement reseau electrique',
  '🔋': 'batterie stockage',
  '☀️': 'solaire soleil',
  '🛢️': 'petrole hydrocarbure gaz pipeline',
  '⛽': 'carburant station essence',
  '🌱': 'esg durable climat environnement vert rse impact',
  '♻️': 'recyclage dechet circulaire',
  '🌊': 'eau ocean maritime peche',
  '🌾': 'agricole agriculture recolte cereale campagne filiere',
  '🚜': 'exploitation agricole tracteur mecanisation',
  '🐄': 'elevage betail',
  '🌳': 'foret bois',
  '🌡️': 'temperature chaleur climat',
  // transport & logistique
  '🚚': 'logistique livraison transport fret camion',
  '🚢': 'port navire import export maritime',
  '✈️': 'aerien voyage aeroport vol',
  '🚆': 'ferroviaire train',
  '🚗': 'automobile vehicule auto',
  // immobilier & BTP
  '🏗️': 'construction btp chantier travaux infrastructure',
  '🏡': 'immobilier logement habitat residentiel',
  '🏢': 'bureau siege tertiaire',
  '🏭': 'industrie usine production manufactur',
  '🏙️': 'ville urbain region',
  '🏨': 'hotel tourisme hotellerie',
  '🍽️': 'restauration restaurant alimentation',
  // numérique & télécoms
  '📡': 'telecom operateur antenne',
  '📱': 'mobile smartphone application appli',
  '💻': 'informatique systeme logiciel it numerique',
  '🤖': 'intelligence artificielle ia ai automatisation robot modele',
  '🔒': 'cyber securite confidentiel acces',
  '🧠': 'connaissance memoire apprentissage savoir cognitif',
  // public & divers
  '👮': 'police securite publique',
  '🏫': 'ecole enseignement scolaire',
  '🗺️': 'geographie carte territoire zone pays',
  '🌍': 'afrique international monde mondial',
  '🎨': 'design creation creatif',
  '🎬': 'video film media',
  '📰': 'presse actualite',
  '🔔': 'notification rappel',
  '📮': 'courrier mail',
  '🖨️': 'impression',
};
/** Domains of a report and their emoji (the default when a title has no word of its own). */
const DOMAINS: { id: string; words: string; emojis: string[] }[] = [
  {
    id: 'credit',
    words: 'credit banque engagement impaye provision ifrs bceao covenant garantie encours pret',
    emojis: ['💼', '🏦', '🔐', '💸', '⚖️', '🧮', '🎯'],
  },
  {
    id: 'ventes',
    words: 'vente client commerce chiffre affaire magasin produit marketing',
    emojis: ['🛒', '👥', '💰', '🏪', '📦', '📢', '🏷️'],
  },
  {
    id: 'rh',
    words: 'rh effectif salarie recrutement formation talent personnel',
    emojis: ['👔', '👩‍💼', '🎓', '💪', '👥', '📅'],
  },
  {
    id: 'sante',
    words: 'sante hopital patient medical soin pharmacie',
    emojis: ['🏥', '🩺', '💊', '🚑', '🧬'],
  },
  {
    id: 'energie',
    words: 'energie electricite solaire petrole gaz carburant climat esg',
    emojis: ['⚡', '🔌', '☀️', '🛢️', '🌱', '♻️'],
  },
  {
    id: 'agri',
    words: 'agricole agriculture recolte elevage filiere campagne',
    emojis: ['🌾', '🚜', '🐄', '🌱', '🌳'],
  },
  {
    id: 'logistique',
    words: 'logistique transport livraison fret port stock',
    emojis: ['🚚', '🚢', '📦', '✈️', '🚆'],
  },
  {
    id: 'immobilier',
    words: 'immobilier construction btp chantier logement',
    emojis: ['🏗️', '🏡', '🏢', '🏙️'],
  },
  {
    id: 'numerique',
    words: 'numerique digital informatique telecom application cyber ia',
    emojis: ['💻', '📱', '📡', '🤖', '🔒', '🌐'],
  },
  {
    id: 'public',
    words: 'etat public ministere administration budget collectivite',
    emojis: ['🏛️', '🗳️', '⚖️', '📊'],
  },
];
const GENERIC = ['📊', '🎯', '💡', '🧭', '📌', '🧩', '🔎', '📈', '🗂️', '✅'];

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
const words = (t: string) =>
  fold(t)
    .split(' ')
    .filter((w) => w.length >= 2);
const STEMS: [string, string[]][] = Object.entries(LEX)
  .filter(([e]) => fluentB64(e))
  .map(([e, s]) => [e, s.split(' ').filter(Boolean)]);

/** The candidates of a text, best first, with their score (a longer, rarer stem weighs more). */
export function emojiCandidates(text: string, domain?: string): { emoji: string; score: number }[] {
  const ws = words(text);
  const dom = DOMAINS.find((d) => d.id === domain);
  const out: { emoji: string; score: number }[] = [];
  for (const [e, stems] of STEMS) {
    let s = 0;
    for (const st of stems)
      if (ws.some((w) => w === st || (st.length >= 3 && w.startsWith(st)))) s += 1 + 0.12 * st.length;
    if (s > 0 && dom?.emojis.includes(e)) s += 0.5;
    if (s > 0) out.push({ emoji: e, score: s });
  }
  return out.sort((a, b) => b.score - a.score);
}
/** The domain of a whole report (its title, chapters, figures), or 'general'. */
export function detectDomain(text: string): string {
  const ws = words(text);
  let best = { id: 'general', n: 0 };
  for (const d of DOMAINS) {
    const n = d.words.split(' ').filter((k) => ws.some((w) => w.startsWith(k))).length;
    if (n > best.n) best = { id: d.id, n };
  }
  return best.n >= 2 ? best.id : 'general';
}
/** The emoji of one label in its domain, avoiding the ones already taken; null when no word evokes any. */
export function adaptiveEmoji(
  text: string,
  o: { domain?: string; avoid?: ReadonlySet<string> } = {},
): string | null {
  const c = emojiCandidates(text, o.domain);
  return (c.find((x) => !o.avoid?.has(x.emoji)) ?? c[0])?.emoji ?? null;
}
/** The domain's own emoji (index-rotated, avoiding the taken ones) when a title has no word of its own. */
export function domainEmoji(domain: string, i = 0, avoid?: ReadonlySet<string>): string {
  const list = [...(DOMAINS.find((d) => d.id === domain)?.emojis ?? []), ...GENERIC].filter((e) =>
    fluentB64(e),
  );
  const free = list.filter((e) => !avoid?.has(e));
  return (free.length ? free : list)[Math.abs(i) % (free.length || list.length)]!;
}
/** One emoji per title, all different when possible (chapters of a report), in the report's domain. */
export function assignEmojis(titles: string[], domain: string): string[] {
  const used = new Set<string>();
  return titles.map((t, i) => {
    const e = adaptiveEmoji(t, { domain, avoid: used }) ?? domainEmoji(domain, i, used);
    used.add(e);
    return e;
  });
}
