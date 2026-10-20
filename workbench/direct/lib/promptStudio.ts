// PROMPT STUDIO — the structured prompt composer (pure: no React, no store). A prompt is a set of BLOCKS (role,
// mission, context & data, depth & method, deliverables & design, constraints, output format) with {{variables}};
// compile() turns it into one mega-prompt; lint() applies the house rules (no invented figure, no secret, a named
// deliverable, a theme…); the view runs it, judges it with JEV (promptQuestions) and keeps versions.
import { THEMES } from '../../server/services/houseDesign';

export const BLOCK_IDS = ['role', 'mission', 'context', 'depth', 'deliverable', 'constraints', 'output'] as const;
export type BlockId = (typeof BLOCK_IDS)[number];
export interface BlockDef {
  id: BlockId;
  label: string;
  hint: string;
  /** Heading written in the compiled prompt. */
  heading: string;
}
export const BLOCKS: BlockDef[] = [
  { id: 'role', label: 'Rôle', heading: 'RÔLE', hint: 'Qui parle : fonction, expertise, exigence (« analyste-rédacteur d’un comité de crédit… »).' },
  { id: 'mission', label: 'Mission', heading: 'MISSION', hint: 'La question posée, la décision attendue, le public ; une phrase par résultat attendu.' },
  { id: 'context', label: 'Contexte & données', heading: 'CONTEXTE ET DONNÉES', hint: 'Fichiers joints, périmètre, date d’arrêté, définitions ; la seule source des chiffres.' },
  { id: 'depth', label: 'Profondeur & méthode', heading: 'PROFONDEUR ET MÉTHODE', hint: 'Analyse par dimension, comparaisons, tendance, cas, cadre réglementaire, hypothèses à documenter.' },
  { id: 'deliverable', label: 'Livrables & design', heading: 'LIVRABLES ET DESIGN', hint: 'Formats (xlsx, pptx, docx, html, mail), thème, graphiques natifs, « Lecture — » sous chaque figure.' },
  { id: 'constraints', label: 'Contraintes', heading: 'CONTRAINTES', hint: 'Aucun chiffre inventé, formats français, confidentialité, longueur, langue.' },
  { id: 'output', label: 'Format de sortie', heading: 'FORMAT DE SORTIE', hint: 'Structure exacte de la réponse (sections, JSON, tableau) ; ce qui doit figurer à la fin.' },
];

export interface PromptVersion {
  at: number;
  blocks: Record<BlockId, string>;
  note?: string;
}
export interface PromptDoc {
  id: string;
  name: string;
  blocks: Record<BlockId, string>;
  vars: Record<string, string>;
  model?: string;
  temperature?: number;
  createdAt: number;
  updatedAt: number;
  versions: PromptVersion[];
  /** The last run (text, model, cost) — kept with the prompt. */
  lastRun?: { at: number; model: string; text: string; cost: number; tokensIn: number; tokensOut: number; ms: number };
}

export const emptyBlocks = (): Record<BlockId, string> => Object.fromEntries(BLOCK_IDS.map((b) => [b, ''])) as Record<BlockId, string>;

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  blocks: Partial<Record<BlockId, string>>;
  vars?: Record<string, string>;
}

const HOUSE_RULES = `Aucun chiffre inventé : chaque nombre vient des données jointes ou d’un calcul montré (data.query) ; un chiffre absent est dit absent, jamais estimé en silence.
Formats français : « 104,9 Mds », « 42,0 % », dates jj/mm/aaaa.
Aucune donnée nominative dans une recherche Internet ; aucune clé, aucun secret dans le prompt ni dans la réponse.`;

export const TEMPLATES: PromptTemplate[] = [
  {
    id: 'comite',
    name: 'Dossier de comité (Watchlist, crédit, risque)',
    description: 'Thèse, 10 indicateurs, chapitres par facteur, recommandations datées, décisions à voter — rendu deck + rapport + classeur.',
    vars: { arrete: '30/09/2026', public: 'Comité Watchlist', fichier: 'uploads/portefeuille.xlsx', theme: 'comite' },
    blocks: {
      role: 'Tu es l’analyste-rédacteur du {{public}} (risque de crédit). Tu écris dense, précis, sans adjectif creux, pour des décideurs qui votent.',
      mission: 'À partir de {{fichier}} (arrêté du {{arrete}}), produire le dossier de comité complet : quels facteurs déclencheurs pèsent, sur quels clients, quelle exposition, quelles décisions.',
      context: 'Données : {{fichier}}. Lance report.analyse (focus = la question du comité) pour obtenir le brief ; toute autre coupe utile par data.query. Date d’arrêté : {{arrete}} ; les statuts sont recalculés à cette date.',
      depth: 'Un chapitre par dimension qui explique la mesure (facteur, segment, agence, produit, gestionnaire), avec constats chiffrés, analyse, cadre réglementaire (BCEAO, IFRS 9, EBA), cas emblématiques anonymisés, figures natives et recommandations (responsable, échéance, indicateur de clôture). Hypothèses numérotées, qualité des données notée, sources citées [Rx-nn].',
      deliverable: 'dossier.compose (brief, notes, sources) puis dossier.export en xlsx + pptx + docx + html, thème « {{theme}} » : mêmes chiffres sur chaque feuille, page et diapositive ; « Lecture — » sous chaque figure ; notes minutées sur 30 minutes.',
      constraints: HOUSE_RULES,
      output: 'Réponds par : 1) la thèse en 3 phrases ; 2) les 10 indicateurs ; 3) la liste des fichiers produits avec leur chemin ; 4) les limites et chiffres à vérifier.',
    },
  },
  {
    id: 'impayes',
    name: 'Note de direction — impayés',
    description: 'Qui porte les impayés, depuis quand, quoi faire : note courte, chiffrée, avec plan d’actions.',
    vars: { fichier: 'uploads/impayes.xlsx', public: 'Direction des Engagements', theme: 'house' },
    blocks: {
      role: 'Tu es le responsable du recouvrement qui rend compte à la {{public}}.',
      mission: 'Dire en une page qui porte les impayés de {{fichier}}, depuis quand, et ce que l’on fait cette semaine.',
      context: 'Données : {{fichier}} (report.analyse, focus « qui porte les impayés et depuis quand »). Un impayé de plus de 90 jours est un déclassement potentiel.',
      depth: 'Concentration par agence, segment, gestionnaire ; ancienneté par tranche (0-30, 31-60, 61-90, > 90 j) ; les dix plus gros dossiers ; tendance sur les derniers mois.',
      deliverable: 'report.export en docx + html, thème « {{theme}} », plus data.export xlsx du tableau des dix plus gros dossiers.',
      constraints: HOUSE_RULES,
      output: 'Note : constat (3 chiffres), analyse (5 lignes), plan d’actions (tableau action / responsable / échéance / indicateur).',
    },
  },
  {
    id: 'provisions',
    name: 'Provisions — IFRS 9 et BCEAO',
    description: 'Stages, ECL, échéancier BCEAO, scénarios, écarts entre référentiels.',
    vars: { fichier: 'uploads/portefeuille.xlsx', arrete: '30/09/2026', theme: 'executive' },
    blocks: {
      role: 'Tu es l’analyste provisions (IFRS 9 et réglementation BCEAO) de la banque.',
      mission: 'Calculer et expliquer les provisions au {{arrete}} à partir de {{fichier}} : par stage, par scénario, et l’écart IFRS 9 / BCEAO.',
      context: 'Données : {{fichier}}. Taux ECL du référentiel interne par stage (à lire dans le fichier ou à documenter comme hypothèse). Échéancier BCEAO : 20 % au déclassement, 50 % à J+90, 100 % à J+270 sur la part non couverte.',
      depth: 'Migration des stages, sensibilité aux taux, trois scénarios (base, adverse, sévère), dix plus grandes contributions, hypothèses numérotées reliées aux paramètres.',
      deliverable: 'dossier.compose puis dossier.export xlsx + docx (thème « {{theme}} ») ; le classeur porte les paramètres modifiables et des formules vivantes.',
      constraints: HOUSE_RULES,
      output: 'Tableau de synthèse par stage et scénario, puis la liste des hypothèses, puis les fichiers.',
    },
  },
  {
    id: 'reporting',
    name: 'Reporting libre sur un fichier',
    description: 'Analyse adaptative d’un fichier quelconque : brief, lecture, livrables au thème choisi.',
    vars: { fichier: 'uploads/donnees.xlsx', question: 'ce que les données disent de plus important', theme: 'house' },
    blocks: {
      role: 'Tu es un analyste de direction, rigoureux, qui écrit à partir des chiffres seulement.',
      mission: 'Répondre à : {{question}}, à partir de {{fichier}}.',
      context: 'Données : {{fichier}} (report.analyse d’abord ; data.query pour toute coupe supplémentaire).',
      depth: 'Mesure principale, dimensions explicatives (η², concentration), tendance, anomalies, qualité des données ; adapte le plan au cas, jamais un plan générique.',
      deliverable: 'report.export docx + html au thème « {{theme}} » ; data.export xlsx si un tableau le mérite.',
      constraints: HOUSE_RULES,
      output: 'Thèse, messages clés chiffrés, chapitres, recommandations, fichiers, limites.',
    },
  },
  {
    id: 'design',
    name: 'Amélioration d’un design (classeur, deck, rapport)',
    description: 'Audit et refonte d’un livrable existant : hiérarchie visuelle, lisibilité, cohérence du thème.',
    vars: { fichier: 'outputs/livrable.xlsx', theme: 'extraordinaire' },
    blocks: {
      role: 'Tu es directeur artistique de livrables financiers : sobriété, hiérarchie, lisibilité, cohérence.',
      mission: 'Auditer {{fichier}} et le refaire au thème « {{theme}} » sans changer un chiffre.',
      context: 'Le fichier existant ; la charte (docs/CHARTE-EXPORT.md) ; les thèmes disponibles.',
      depth: 'Pour chaque feuille / diapositive / page : ce qui gêne la lecture, ce qui manque (titre d’action, lecture, source), ce qui est redondant.',
      deliverable: 'Le même livrable régénéré (dossier.export ou data.export) au thème demandé, plus une liste des changements.',
      constraints: HOUSE_RULES,
      output: 'Tableau avant / après par vue, puis les fichiers.',
    },
  },
];

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
export function extractVars(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1]!);
  return [...out];
}
export function docVars(d: Pick<PromptDoc, 'blocks'>): string[] {
  return extractVars(Object.values(d.blocks).join('\n'));
}

export interface Compiled {
  text: string;
  /** Variables used in the blocks that have no value. */
  missing: string[];
  tokens: number;
  blocksFilled: number;
}
/** Blocks → one mega-prompt (headings in caps, variables substituted, empty blocks skipped). */
export function compile(d: Pick<PromptDoc, 'blocks' | 'vars'>): Compiled {
  const missing = new Set<string>();
  const sub = (t: string) =>
    t.replace(VAR_RE, (_, k: string) => {
      const v = d.vars[k];
      if (v === undefined || v === '') {
        missing.add(k);
        return `{{${k}}}`;
      }
      return v;
    });
  const parts: string[] = [];
  let filled = 0;
  for (const b of BLOCKS) {
    const t = (d.blocks[b.id] ?? '').trim();
    if (!t) continue;
    filled++;
    parts.push(`## ${b.heading}\n${sub(t)}`);
  }
  const text = parts.join('\n\n');
  return { text, missing: [...missing], tokens: estimateTokens(text), blocksFilled: filled };
}
/** chars / 3.6: the same estimate the agent uses for its context budget. */
export const estimateTokens = (t: string): number => Math.ceil(t.length / 3.6);

export interface LintItem {
  level: 'error' | 'warn' | 'info';
  code: string;
  text: string;
}
const SECRET_RE = /\b(sk-[A-Za-z0-9_-]{12,}|sk_[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b|(?:mot de passe|password|api[_ -]?key|secret|token)\s*[:=]\s*\S{6,}/i;
/** The house rules applied to the compiled prompt. An `error` blocks the run (enforced by the view). */
export function lintPrompt(d: Pick<PromptDoc, 'blocks' | 'vars'>): LintItem[] {
  const c = compile(d);
  const out: LintItem[] = [];
  const all = c.text;
  if (SECRET_RE.test(all)) out.push({ level: 'error', code: 'secret', text: 'Le prompt contient ce qui ressemble à une clé, un mot de passe ou un jeton : retirez-le (jamais de secret dans un prompt).' });
  if (!d.blocks.mission.trim()) out.push({ level: 'error', code: 'mission', text: 'La mission est vide : dites la question posée et la décision attendue.' });
  if (c.missing.length) out.push({ level: 'warn', code: 'vars', text: `Variable(s) sans valeur : ${c.missing.map((k) => `{{${k}}}`).join(', ')}.` });
  const mentionsData = /\b(fichier|données|data|xlsx|csv|chiffre|montant|encours|indicateur|kpi)\b/i.test(all);
  if (mentionsData && !/\b(aucun chiffre inventé|n['’]invente|sans inventer|pas de chiffre inventé)/i.test(all))
    out.push({ level: 'warn', code: 'invention', text: 'Des chiffres sont attendus mais la règle « aucun chiffre inventé » n’est pas écrite : ajoutez-la aux contraintes.' });
  if (mentionsData && !d.blocks.context.trim()) out.push({ level: 'warn', code: 'context', text: 'Des données sont attendues mais le bloc « Contexte & données » est vide : nommez le fichier et le périmètre.' });
  if (!d.blocks.deliverable.trim()) out.push({ level: 'warn', code: 'deliverable', text: 'Aucun livrable nommé : dites le format (xlsx, pptx, docx, html, mail) et le thème.' });
  else {
    const themeIds = Object.keys(THEMES);
    const named = themeIds.filter((t) => new RegExp(`«\\s*${t}\\s*»|\\b${t}\\b`, 'i').test(d.blocks.deliverable));
    if (!named.length && !/\{\{\s*theme\s*\}\}/.test(d.blocks.deliverable) && !/thème|theme|style maison/i.test(d.blocks.deliverable))
      out.push({ level: 'info', code: 'theme', text: `Aucun thème nommé : le thème par défaut des réglages s’appliquera (${themeIds.slice(0, 4).join(', ')}…).` });
  }
  if (!d.blocks.output.trim()) out.push({ level: 'info', code: 'output', text: 'Le format de sortie n’est pas fixé : le modèle choisira la structure de sa réponse.' });
  if (c.tokens > 6000) out.push({ level: 'warn', code: 'long', text: `Prompt long (≈ ${c.tokens.toLocaleString('fr-FR')} jetons) : déplacez les données brutes dans un fichier joint.` });
  if (c.blocksFilled && c.blocksFilled < 3) out.push({ level: 'info', code: 'thin', text: `${c.blocksFilled} bloc(s) rempli(s) sur ${BLOCKS.length} : rôle, mission et livrable au minimum.` });
  return out;
}
export const lintBlocks = (items: LintItem[]): boolean => items.some((i) => i.level === 'error');

/** JEV state for promptQuestions(): the compiled text and the goal (the mission). */
export function promptJudgeState(d: Pick<PromptDoc, 'blocks' | 'vars'>): Record<string, unknown> {
  return { prompt: compile(d).text.slice(0, 12000), goal: d.blocks.mission.slice(0, 1000) };
}
export const LEVER_LABELS: Record<string, string> = {
  data: 'joindre ou décrire les données et les chiffres',
  format: 'préciser le livrable et sa structure',
  role: 'préciser le rôle et le niveau d’exigence',
  constraints: 'ajouter les contraintes (pas d’invention, formats, confidentialité)',
  depth: 'dire la profondeur attendue (dimensions, comparaisons, cas)',
  nothing: 'rien de décisif : le prompt est prêt',
};
export const SCORE_LABELS = ['nul', 'faible', 'moyen', 'bon', 'excellent'];

/** The prompt-engineer system prompt: rewrites the blocks, keeps the facts, returns JSON only. */
export function improveSystemPrompt(): string {
  return (
    `Tu es un ingénieur de prompts pour un atelier de reporting bancaire. On te donne les blocs d’un prompt (${BLOCK_IDS.join(', ')}). ` +
    `Réécris chaque bloc pour le rendre plus clair, plus complet et plus exigeant, SANS inventer de fait, de chiffre ni de fichier qui ne sont pas dans les blocs ; garde les variables {{…}} telles quelles ; ` +
    `ajoute les règles maison manquantes (aucun chiffre inventé, formats français, aucun secret) dans « constraints » ; nomme un livrable et un thème dans « deliverable » s’ils manquent ; fixe un format de sortie dans « output ». ` +
    `Réponds UNIQUEMENT par un objet JSON {"blocks": {"role": "...", "mission": "...", "context": "...", "depth": "...", "deliverable": "...", "constraints": "...", "output": "..."}, "changes": ["ce qui a changé, une ligne par bloc"]}.`
  );
}
export function parseImproved(text: string): { blocks: Partial<Record<BlockId, string>>; changes: string[] } | null {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(t.slice(a, b + 1)) as { blocks?: Record<string, unknown>; changes?: unknown[] };
    const blocks: Partial<Record<BlockId, string>> = {};
    for (const id of BLOCK_IDS) if (typeof o.blocks?.[id] === 'string') blocks[id] = o.blocks[id] as string;
    if (!Object.keys(blocks).length) return null;
    return { blocks, changes: Array.isArray(o.changes) ? o.changes.map(String) : [] };
  } catch {
    return null;
  }
}

export function newDoc(id: string, t?: PromptTemplate): PromptDoc {
  const now = Date.now();
  return {
    id,
    name: t ? t.name : 'Nouveau prompt',
    blocks: { ...emptyBlocks(), ...(t?.blocks ?? {}) },
    vars: { ...(t?.vars ?? {}) },
    createdAt: now,
    updatedAt: now,
    versions: [],
  };
}
/** A version is kept when the blocks changed since the last one (at most 30, oldest dropped). */
export function snapshot(d: PromptDoc, note?: string): PromptDoc {
  const last = d.versions[d.versions.length - 1];
  if (last && BLOCK_IDS.every((b) => last.blocks[b] === d.blocks[b])) return d;
  const versions = [...d.versions, { at: Date.now(), blocks: { ...d.blocks }, note }].slice(-30);
  return { ...d, versions };
}
/** Cost estimate of one run from the model's listed prices (null when the provider publishes none). */
export function estimateRunCost(m: { inputPrice: number | null; outputPrice: number | null } | undefined, tokensIn: number, tokensOut = 1200): number | null {
  if (!m || m.inputPrice == null || m.outputPrice == null) return null;
  return (tokensIn * m.inputPrice + tokensOut * m.outputPrice) / 1e6;
}
