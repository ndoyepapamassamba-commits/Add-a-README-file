// MONÉTISATION SUR TOUTES LES PLATEFORMES (18/10/2026, « créer une rubrique dans l'application qui va gérer la monétisation
// sur toutes ces plateformes-là »). Les seuils des programmes de rémunération, par plateforme, avec leur source ; la
// progression des comptes de l'utilisateur vient d'un BILAN produit sur son poste par les API officielles
// (moteur-troupe/monetisation.py bilan) et importé dans l'app : aucune clé, aucun jeton n'entre dans la page.
// Les sources secondaires divergent sur certains seuils (pays, vues) : chaque programme dit où vérifier la règle à jour.

export type Plateforme = 'tiktok' | 'youtube' | 'facebook' | 'instagram';

export interface Critere {
  cle: string;            // champ du bilan comparé au seuil
  libelle: string;
  seuil: number;
}

export interface Programme {
  plateforme: Plateforme;
  nom: string;
  voies: Critere[][];     // l'éligibilité est atteinte si TOUS les critères d'UNE des voies le sont
  regles: string[];       // règles qui ne se mesurent pas (originalité, durée, pays…)
  verifier: string;       // où lire la règle à jour
  sources: string[];
}

export const PROGRAMMES: Programme[] = [
  {
    plateforme: 'tiktok',
    nom: 'TikTok — Creator Rewards Program',
    voies: [[
      { cle: 'abonnes', libelle: 'abonnés', seuil: 10_000 },
      { cle: 'vues_30j', libelle: 'vues sur 30 jours', seuil: 100_000 },
    ]],
    regles: ['18 ans ou plus, compte personnel en règle, pays éligible', 'vidéos originales de PLUS d’une minute (nos épisodes : ≈ 70 s)', 'duos, collages et publicités exclus', 'compte public (un compte privé coupe la rémunération)'],
    verifier: 'TikTok Studio → Monétisation (les sources divergent sur les pays et les vues)',
    sources: ['https://www.toptal.com/creator/post/how-to-join-the-tiktok-creator-rewards-program', 'https://postfa.st/blog/tiktok-monetization-requirements'],
  },
  {
    plateforme: 'youtube',
    nom: 'YouTube — Programme Partenaire (Shorts)',
    voies: [
      [{ cle: 'abonnes', libelle: 'abonnés', seuil: 1_000 }, { cle: 'vues_shorts_90j', libelle: 'vues de Shorts sur 90 jours', seuil: 10_000_000 }],
      [{ cle: 'abonnes', libelle: 'abonnés', seuil: 1_000 }, { cle: 'heures_12m', libelle: 'heures de visionnage sur 12 mois', seuil: 4_000 }],
    ],
    regles: ['palier « soutien des fans » : 500 abonnés, 3 vidéos en 90 jours, 3 000 heures ou 3 M de vues de Shorts', 'hausse annoncée au 1er février 2027 (20 M de vues de Shorts selon une source)'],
    verifier: 'YouTube Studio → Gagner de l’argent',
    sources: ['https://air.io/en/monetization/youtube-partner-program-requirements-2026-the-complete-guide', 'https://vidiq.com/blog/post/monetize-youtube-guide/'],
  },
  {
    plateforme: 'facebook',
    nom: 'Facebook — monétisation du contenu (Reels)',
    voies: [],
    regles: ['programme sur invitation ou candidature selon le pays', 'page professionnelle reliée, contenu original'],
    verifier: 'Meta Business Suite → Monétisation',
    sources: [],
  },
  {
    plateforme: 'instagram',
    nom: 'Instagram — bonus et abonnements',
    voies: [],
    regles: ['bonus sur invitation, selon le pays', 'compte professionnel (créateur)'],
    verifier: 'Instagram → Tableau de bord professionnel → Monétisation',
    sources: [],
  },
];

export interface Bilan {
  date: string;
  plateformes: Partial<Record<Plateforme, { connecte: boolean; [cle: string]: number | boolean | string | undefined }>>;
}

export interface Etape {
  libelle: string;
  valeur: number | null;
  seuil: number;
  part: number;   // 0..1
  ok: boolean;
}

/** progression d'un compte vers chaque voie d'éligibilité ; null quand la valeur n'est pas dans le bilan. */
export function progression(p: Programme, b: Bilan | null): { voie: Etape[]; eligible: boolean }[] {
  const d = b?.plateformes[p.plateforme];
  return p.voies.map((voie) => {
    const e = voie.map((c) => {
      const v = d && typeof d[c.cle] === 'number' ? (d[c.cle] as number) : null;
      return { libelle: c.libelle, valeur: v, seuil: c.seuil, part: v === null ? 0 : Math.min(1, v / c.seuil), ok: v !== null && v >= c.seuil };
    });
    return { voie: e, eligible: e.every((x) => x.ok) };
  });
}

/** lecture sûre d'un bilan importé (fichier JSON de l'utilisateur) : refuse tout ce qui ressemble à un jeton. */
export function lisBilan(texte: string): Bilan {
  const j = JSON.parse(texte) as Bilan;
  if (!j || typeof j !== 'object' || typeof j.plateformes !== 'object') throw new Error('bilan illisible');
  if (/access_token|refresh_token|client_secret/i.test(texte)) throw new Error('ce fichier contient des jetons : il ne doit pas entrer dans l’app');
  return j;
}

export interface Revenu {
  mois: string;          // AAAA-MM
  plateforme: Plateforme;
  montant: number;
  devise: string;
}

export function totaux(rs: Revenu[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const r of rs) t[`${r.plateforme} ${r.devise}`] = (t[`${r.plateforme} ${r.devise}`] ?? 0) + r.montant;
  return t;
}
