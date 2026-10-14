// THE COMPOSER — how the model writes a committee dossier: the prompts (role, the closed JSON grammar, the depth rules,
// the figures it may use and nothing else), the tolerant parse of its answer, the « deepen » pass that names what is
// still thin, the verification of every number against the brief, and the rules-only fallback that builds a dossier
// from the brief alone when no model is reachable. Pure: strings and objects in, strings and objects out.
import { briefToMarkdown, checkNarrative, fmtFact, type Brief } from '../reportBrief';
import { DEPTH, checkDepth, fmtInt, fmtPct, normalizeDossier, todayFr, type DepthIssue, type Dossier } from './dossier';
import { briefFigures, briefKpis } from './dossierFromMarkdown';

export interface ResearchNote {
  title: string;
  url?: string;
  author?: string;
  date?: string;
  lesson?: string;
  axis?: string;
}
export interface ComposeInput {
  /** What the dossier must answer (audience, question, decision). */
  focus: string;
  title?: string;
  audience?: string;
  org?: string;
  unit?: string;
  author?: string;
  asOf?: string;
  confidentiality?: string;
  brief?: Brief | null;
  /** Findings the agent already established (Markdown), figures included. */
  notes?: string;
  /** Sources found on the web (web.search / web.fetch), each with what it teaches. */
  research?: ResearchNote[];
  minutes?: number;
  /** The plan JEV judged (dimensions kept as chapters, the lead finding): the model follows it. */
  plan?: { chapters: string[]; lead?: string };
}

const SCHEMA = `{
 "title": "titre d'action (le chiffre qui change la lecture)", "subtitle": "ce que le dossier dit, une phrase", "kicker": "COMITÉ · ARRÊTÉ DU jj/mm/aaaa",
 "thesis": "2 à 4 phrases : le constat chiffré, ce qu'il change, la décision qu'il appelle",
 "kpis": [{"code":"K01","label":"…","value":"104,9 Mds","num":104900000000,"sub":"portée / comparaison","tone":"risk|warn|ok|neutral|info","method":"comment le chiffre est calculé"}],
 "messages": ["message clé chiffré 1", "…"],
 "method": {"steps":[{"n":1,"label":"…","detail":"…"}], "rules":["règle non négociable appliquée"], "research":["ce que la recherche change [R1-01]"]},
 "chapters": [{"title":"sujet", "kicker":"CHAPITRE n · SUJET", "headline":"titre d'action du chapitre",
   "constats":["constat chiffré"], "analyse":["paragraphe : pourquoi, et alors"], "cadre":["texte réglementaire ou étude, avec [Rx-yy]"], "cas":["cas emblématique anonymisé si nécessaire"],
   "figures":[{"kind":"col3d|bar3d|col|bar|doughnut|pie|line","title":"…","categories":["…"],"series":[{"name":"…","values":[1,2]}],"unit":"Mds XOF|%|…","lecture":"Lecture — …"}],
   "tables":[{"title":"…","head":["…"],"rows":[["…"]],"lecture":"…"}],
   "recommandations":[{"priority":"P1|P2|P3","title":"verbe + objet","action":"quoi, comment, pour qui","owner":"responsable","due":"jj/mm/aaaa","kpi":"indicateur de clôture","ground":"fondement [Rx-yy]"}],
   "lecture":"Lecture — la phrase à retenir du chapitre",
   "kpis":[{"code":"A1","label":"…","value":"…","sub":"…","tone":"…"}]}],
 "decisions": ["décision soumise au vote, formulée pour être votée"],
 "hypotheses": [{"title":"…","text":"hypothèse motivée","param":"nom_du_paramètre si réglable"}],
 "dataQuality": {"score": 0-100, "items":[{"item":"source / feuille","note":"constat","score":0-100}]},
 "glossary": [{"term":"…","def":"…"}],
 "sources": [{"id":"R1-01","axis":"R1","title":"…","author":"…","date":"…","url":"…","lesson":"ce que la source enseigne","application":"ce que cela change pour nos données"}],
 "minutes": 30
}`;

/** The role: a committee analyst who writes only from the figures he was given, in the closed grammar. */
export function composeSystemPrompt(): string {
  return (
    `Tu es l'analyste-rédacteur d'un comité de direction (risque de crédit, finance, pilotage). Tu écris en français, dense, précis, sans adjectif creux. ` +
    `Tu produis un DOSSIER STRUCTURÉ au format JSON strict (un seul objet, aucune prose autour), qui sera rendu tel quel en deck, rapport, classeur et mail.\n` +
    `RÈGLES ABSOLUES :\n` +
    `1. Aucun chiffre inventé : chaque nombre vient du brief, des notes ou des sources fournis. Si une donnée manque, dis-le dans « hypotheses » ou « dataQuality », jamais en inventant.\n` +
    `2. Profondeur minimale (le code la vérifie) : thèse de 2 à 4 phrases ; ${DEPTH.kpis} indicateurs au moins (les mêmes partout, code K01…) ; ${DEPTH.messages} messages clés chiffrés ; ${DEPTH.chapters} chapitres au moins, chacun avec ≥ ${DEPTH.constatsPerChapter} constats chiffrés, une analyse rédigée (pourquoi, et alors), une figure ou un tableau, ≥ 1 recommandation complète (responsable, échéance, indicateur) ; ${DEPTH.recos} recommandations au total ; ${DEPTH.hypotheses} hypothèses motivées ; ${DEPTH.sources} sources avec leur enseignement ; ${DEPTH.decisions} décisions soumises au vote ; ${DEPTH.glossary} termes de glossaire.\n` +
    `3. Adapte la STRUCTURE au cas : les chapitres suivent les dimensions qui expliquent la mesure (facteurs, segments, agences, produits, périodes…), pas un plan générique. Un sujet sans chiffre n'est pas un chapitre.\n` +
    `4. Chaque figure porte des valeurs réelles (catégories et séries), un titre et une « Lecture — » d'une phrase. Préfère col3d / bar3d pour les comparaisons, line pour une évolution, doughnut pour une répartition.\n` +
    `5. Les recommandations sont actionnables : verbe + objet, responsable nommé par fonction, échéance datée, indicateur de clôture mesurable, fondement réglementaire ou de recherche quand il existe [Rx-yy].\n` +
    `6. Les décisions sont formulées pour être votées (« Geler… », « Proposer… », « Plafonner… »).\n` +
    `7. Cite les sources par leur identifiant [Rx-yy] (axes : R1 réglementation, R2 normes comptables, R3 supervision, R4 recherche académique, R5 droit des sûretés, R6 marché, R7 macro, R8 données, R9 autres).\n` +
    `8. Formats français : « 104,9 Mds », « 42,0 % », dates jj/mm/aaaa.\n` +
    `SCHÉMA JSON À RESPECTER (clés exactes) :\n${SCHEMA}`
  );
}

export function composeUserPrompt(i: ComposeInput): string {
  const parts: string[] = [];
  parts.push(`DEMANDE : ${i.focus}`);
  if (i.audience) parts.push(`PUBLIC : ${i.audience}`);
  parts.push(`CONTEXTE : ${[i.org, i.unit].filter(Boolean).join(' · ') || 'non précisé'}${i.asOf ? ` · arrêté du ${i.asOf}` : ''}${i.author ? ` · émetteur ${i.author}` : ''}.`);
  if (i.brief) parts.push(`BRIEF D'ANALYSE (chiffres calculés localement sur le fichier — la seule source de chiffres avec les notes) :\n${briefToMarkdown(i.brief)}`);
  if (i.notes) parts.push(`NOTES ET CONSTATS DÉJÀ ÉTABLIS :\n${i.notes.slice(0, 24000)}`);
  if (i.plan?.chapters.length) parts.push(`PLAN JUGÉ (un chapitre par dimension retenue, dans cet ordre) : ${i.plan.chapters.join(' ; ')}${i.plan.lead ? ` — le dossier s'ouvre sur : ${i.plan.lead}` : ''}. Les autres dimensions ne valent qu'une mention.`);
  if (i.research?.length) parts.push(`SOURCES TROUVÉES (à citer par leur identifiant) :\n${i.research.map((r, k) => `[${r.axis ?? 'R1'}-${String(k + 1).padStart(2, '0')}] ${r.title}${r.author ? ` — ${r.author}` : ''}${r.date ? ` (${r.date})` : ''}${r.url ? ` ${r.url}` : ''}${r.lesson ? `\n   Enseignement : ${r.lesson}` : ''}`).join('\n')}`);
  parts.push(`Réponds par le JSON du dossier seulement${i.minutes ? ` (deck de ${i.minutes} minutes)` : ''}.`);
  return parts.join('\n\n');
}

/** The model's text → an object (fences, prose around and trailing commas tolerated); null when unreadable. */
export function parseDossierJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const body = t.slice(a, b + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(body.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

/** The second pass: the same dossier, deeper where the rules found it thin. */
export function deepenPrompt(d: Dossier, issues: DepthIssue[]): string {
  return `Le dossier ci-dessous ne tient pas les règles de profondeur sur ces points :\n${issues.map((x) => `- ${x.where} : ${x.issue}`).join('\n')}\n\nRenvoie le DOSSIER COMPLET corrigé (même schéma JSON, toutes les clés), en gardant tout ce qui était bon et en ajoutant ce qui manque, toujours sans inventer de chiffre (si un chiffre manque, dis-le dans une hypothèse).\n\n${JSON.stringify(d)}`;
}

/** Numbers of the dossier that are not in the brief (to verify, never to keep as they are). */
export function verifyAgainstBrief(d: Dossier, b: Brief): { checked: number; unknown: string[] } {
  const text = [d.thesis, ...d.messages, ...d.chapters.flatMap((c) => [...c.constats, ...c.analyse, c.lecture ?? '', ...c.figures.map((f) => f.lecture ?? '')]), ...d.kpis.map((k) => k.value)].join('\n');
  const r = checkNarrative(text, b);
  return { checked: r.checked, unknown: r.unknown };
}

/** Rules only (no model): a dossier built from the brief — honest, measured, thinner than the model's; the depth rules say so. */
export function dossierFromBrief(i: ComposeInput): Dossier {
  const b = i.brief;
  const kpis = b ? briefKpis(b) : [];
  const figs = b ? briefFigures(b) : [];
  const chapters: Record<string, unknown>[] = [];
  if (b) {
    const dims = b.dims.filter((d) => d.dim !== b.entity).slice(0, 4);
    dims.forEach((dim, k) => {
      const top = dim.top[0];
      chapters.push({
        title: dim.label,
        headline: top ? `${top.key} porte ${Math.round(top.share * 100)} % de ${b.measureLabel.toLowerCase()}` : dim.label,
        constats: [
          top ? `${top.key} : ${fmtFact({ id: '', label: '', value: top.sum, fmt: 'money', method: '' })} (${Math.round(top.share * 100)} % du total, ${top.count} lignes)` : '',
          `Les 3 premières catégories portent ${Math.round(dim.top3Share * 100)} % ; ${dim.n80} catégorie(s) sur ${dim.categories} suffisent pour les quatre cinquièmes du total`,
          `Indice de concentration (HHI) ${dim.hhi.toFixed(2)} ; cette dimension explique ${Math.round(dim.eta2 * 100)} % de la variance (η²)`,
        ].filter(Boolean),
        analyse: [dim.eta2 >= 0.3 ? `La dimension « ${dim.label} » explique une part décisive de la mesure : c'est le levier à piloter en premier.` : `La dimension « ${dim.label} » explique une part limitée de la mesure : la concentration est un fait de structure plus qu'un levier.`],
        cadre: [],
        cas: top ? [`${top.key} — ${top.count} ligne(s), ${fmtFact({ id: '', label: '', value: top.sum, fmt: 'money', method: '' })}`] : [],
        figures: figs[k] ? [figs[k]] : [],
        tables: [],
        recommandations: [{ priority: k === 0 ? 'P1' : 'P2', title: `Revue ciblée des premières catégories de ${dim.label.toLowerCase()}`, action: `Revoir les ${dim.n80} catégorie(s) qui portent les quatre cinquièmes de ${b.measureLabel.toLowerCase()} ; décider pour chacune maintien, plan d'actions ou sortie.`, owner: 'Responsable du périmètre', due: 'À fixer en comité', kpi: `Part des ${dim.n80} premières catégories revues : 100 %` }],
        lecture: top ? `${top.key} concentre ${Math.round(top.share * 100)} % : c'est là que la décision pèse.` : undefined,
      });
    });
    if (b.trend && b.trend.points.length >= 3) chapters.push({ title: 'Évolution', headline: `${b.trend.last} : ${b.trend.delta != null ? `${b.trend.delta >= 0 ? '+' : ''}${Math.round(b.trend.delta * 100)} %` : 'dernière période'} par rapport à la précédente`, constats: [`${b.trend.points.length} périodes observées ; meilleure : ${b.trend.best}, plus faible : ${b.trend.worst}`], analyse: ['La tendance se lit sur la figure : la dernière période est à comparer à la précédente et au pic.'], cadre: [], cas: [], figures: figs.filter((f) => f.kind === 'line'), tables: [], recommandations: [{ priority: 'P2', title: 'Suivi mensuel de la tendance', action: 'Mettre la série sous suivi mensuel avec un seuil d’alerte.', owner: 'Pilotage', due: 'Prochain arrêté', kpi: 'Série publiée chaque mois' }] });
    if (b.quality.length) chapters.push({ title: 'Qualité des données', headline: `${b.quality.filter((q) => q.missingPct > 0.2).length} colonne(s) avec plus d'un cinquième de valeurs manquantes`, constats: [`${b.quality.length} colonne(s) lue(s) ; ${b.quality.filter((q) => q.missingPct > 0).length} avec des valeurs manquantes ; ${b.quality.filter((q) => q.missingPct > 0.2).length} au-delà d'un cinquième`, ...b.quality.filter((q) => q.missingPct > 0).slice(0, 4).map((q) => `${q.col} : ${fmtPct(q.missingPct)} de valeurs manquantes, ${fmtInt(q.distinct)} valeurs distinctes`)], analyse: ['Une donnée manquante n’est pas un zéro : les colonnes incomplètes sont exclues du dénominateur.'], cadre: [], cas: [], figures: [], tables: [{ head: ['Colonne', 'Type', 'Manquant', 'Distinct'], rows: b.quality.slice(0, 15).map((q) => [q.col, q.type, fmtPct(q.missingPct), fmtInt(q.distinct)]) }], recommandations: [{ priority: 'P3', title: 'Compléter les colonnes incomplètes à la source', action: 'Renseigner les champs manquants dans le système source avant le prochain arrêté.', owner: 'Propriétaire de la donnée', due: 'Prochain arrêté', kpi: 'Taux de complétude ≥ 95 %' }] });
  }
  const raw = {
    title: i.title || b?.title || i.focus.slice(0, 80),
    subtitle: i.focus,
    kicker: `${i.audience ?? 'Comité'} · ${i.asOf ? `arrêté du ${i.asOf}` : todayFr()}`.toUpperCase(),
    thesis: b ? `${b.measureLabel} : ${fmtFact(b.kpis[0] ?? { id: '', label: '', value: 0, fmt: 'int', method: '' })} sur ${b.rows.toLocaleString('fr-FR')} lignes. ${chapters[0]?.headline ?? ''}. Les chapitres suivent les dimensions qui expliquent la mesure ; les recommandations ciblent les catégories qui portent les quatre cinquièmes du total.` : i.focus,
    kpis,
    messages: chapters.map((c) => String(c.headline)).filter(Boolean),
    method: { steps: [{ label: 'Lecture du fichier', detail: b ? `${b.rows} lignes, ${b.columns} colonnes` : '' }, { label: 'Brief local', detail: 'mesure, dimensions, concentration, tendance, qualité' }, { label: 'Dossier par règles', detail: 'aucun modèle sollicité' }], rules: ['Aucun chiffre saisi à la main : tout vient du brief', 'Une donnée manquante est exclue du dénominateur'], research: (i.research ?? []).slice(0, 4).map((r, k) => `${r.lesson ?? r.title} [${r.axis ?? 'R1'}-${String(k + 1).padStart(2, '0')}]`) },
    chapters,
    decisions: chapters.slice(0, 3).map((c) => `Valider la revue ciblée proposée pour « ${c.title} » et désigner son responsable.`),
    hypotheses: [
      { title: 'Mesure principale', text: b ? `« ${b.measureLabel} » est la colonne analysée (${b.measure ?? 'choisie par le brief'}).` : 'Non précisée.' },
      { title: 'Dimensions', text: b ? `Dimensions retenues : ${b.dims.map((d) => d.label).join(', ')}.` : 'Non précisées.' },
      { title: 'Valeurs manquantes', text: 'Une cellule vide est « non renseignée », exclue du dénominateur ; un zéro saisi est un zéro.' },
      { title: 'Périmètre', text: b ? `Source : ${b.source}.` : 'Non précisé.' },
      { title: 'Arrêté', text: i.asOf ? `Chiffres arrêtés au ${i.asOf}.` : `Chiffres lus le ${todayFr()}.` },
    ],
    dataQuality: b ? { items: b.quality.slice(0, 10).map((q) => ({ item: q.col, note: `${q.type} · ${fmtPct(q.missingPct)} manquant`, score: Math.round(100 * (1 - q.missingPct)) })) } : undefined,
    glossary: [{ term: 'HHI', def: 'Indice de Herfindahl : somme des parts au carré, 1 = une seule catégorie.' }, { term: 'η²', def: 'Part de la variance de la mesure expliquée par une dimension.' }, { term: 'n80', def: 'Nombre de catégories nécessaires pour atteindre 80 % du total.' }, { term: 'Brief', def: 'Faits calculés localement sur le fichier, avant toute rédaction.' }, { term: 'P1 / P2 / P3', def: 'Priorité d’une recommandation : immédiate, sous trois mois, programme.' }, { term: 'Arrêté', def: 'Date de référence des chiffres.' }],
    sources: (i.research ?? []).map((r, k) => ({ id: `${r.axis ?? 'R1'}-${String(k + 1).padStart(2, '0')}`, axis: r.axis ?? 'R1', title: r.title, author: r.author, date: r.date, url: r.url, lesson: r.lesson ?? '—' })),
    minutes: i.minutes,
  };
  return normalizeDossier(raw, { date: todayFr(), org: i.org, unit: i.unit, author: i.author, audience: i.audience, asOf: i.asOf, confidentiality: i.confidentiality, dataSource: b ? `${b.source} — ${b.rows.toLocaleString('fr-FR')} lignes` : undefined, provenance: 'Dossier construit par règles depuis le brief (aucun modèle) : les indicateurs sont ceux du brief.' });
}

/** Short Markdown preview of a dossier (the chat shows it, the file sits next to the JSON). */
export function dossierSummaryMarkdown(d: Dossier): string {
  const issues = checkDepth(d);
  return [
    `# ${d.title}`,
    d.subtitle ? `_${d.subtitle}_` : '',
    '',
    `**Thèse.** ${d.thesis}`,
    '',
    `## Indicateurs`,
    ...d.kpis.map((k) => `- **${k.code} ${k.label}** : ${k.value}${k.sub ? ` — ${k.sub}` : ''}`),
    '',
    `## Chapitres`,
    ...d.chapters.map((c) => `${c.n}. **${c.title}** — ${c.headline ?? ''} (${c.constats.length} constats, ${c.figures.length} figures, ${c.recommandations.length} recommandations)`),
    '',
    `## Décisions`,
    ...d.decisions.map((x) => `- ${x.code} — ${x.text}`),
    '',
    `${d.hypotheses.length} hypothèses · ${d.sources.length} sources · ${d.glossary.length} termes`,
    issues.length ? `\n> Profondeur : ${issues.length} point(s) encore mince(s) — ${issues.map((x) => `${x.where} (${x.issue})`).join(' ; ')}` : '\n> Profondeur : règles tenues.',
  ].join('\n');
}
