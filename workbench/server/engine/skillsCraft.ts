/**
 * CRAFT METHODS of the Intelligence Engine — the installed skills (lots 1 and 2) as engine methods: when a request
 * matches their triggers they are selected like any other skill, their playbook is injected (`<engine_skills>`), and
 * the agent reads the skill body + references with skill.read. Each playbook names the app's own tools and the code
 * hooks that run the skill (see .claude/skills/<name>/MASSAMBA.md), so the method is executable here, not a wish list.
 *
 * Office methods are MASSAMBA's own text (Anthropic's Office skills are proprietary: not copied, not embedded).
 */
import type { EngineSkill } from './skills';

const BASE = { version: '1.0', incompatible_models: ['no-tools'] as EngineSkill['incompatible_models'], cost_profile: 'faible' as const };

export const CRAFT_SKILLS: EngineSkill[] = [
  // ── Office (exports, analyses) ──
  {
    ...BASE,
    name: 'office_xlsx',
    description: 'Classeur Excel professionnel (skill excel-pro) : formules vivantes, zéro erreur, hiérarchie visuelle maison, formats numériques, hypothèses documentées, vérification avant livraison.',
    capabilities: ['formules plutôt que valeurs', 'zéro erreur de formule', 'bande KPI / Sommaire / k‑M / sparklines', 'formats numériques', 'vérification excelStrict + M365'],
    triggers: ['\\bexcel\\b', '\\bxlsx?\\b', '\\bxlsm\\b', 'classeur', 'tableur', 'feuille de calcul', '\\bcsv\\b', 'formule', 'tableau crois', 'mod[èe]le financier', 'kpi excel'],
    required_tools: ['report.export'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['reporting', 'data_analyst'],
    companions: ['excel_analysis', 'documents_validation'],
    source: 'MASSAMBA — skill excel-pro (pratiques inspirées de la skill xlsx d’Anthropic, texte original)',
    license: 'MIT',
    playbook:
      'Follow the excel-pro skill (ACTIVE SKILLS or skill.read excel-pro). Live formulas, never pasted results (SUMIFS, INDEX/MATCH, IFERROR; no XLOOKUP/FILTER/UNIQUE); zero formula errors; the house hierarchy (KPI band, Sommaire sheet, k/M formats, sparklines, frozen header, readable widths, one professional font); thousands separators, % on ratios, the unit in the header; every assumption documented where the reader sees it, source cited; no invented value — a missing figure stays empty and is flagged; an existing file keeps its conventions; the user’s spec is followed literally. Produce with data.inspect → report.analyse → report.export (xlsx, chosen design); designQA and excelStrict run in the app; in the container run the m365-verification script before delivering, and say what was checked.',
  },
  {
    ...BASE,
    name: 'office_pptx',
    description: 'Présentation COMEX (skill pptx-comex) : un message par diapo, graphiques natifs lisibles, narration exécutive, typographie cohérente, contrôle des débordements, QA contenu / fichier / visuel.',
    capabilities: ['titre = message', 'graphiques natifs', 'typographie 2 polices', 'contrôle des débordements', 'QA contenu / fichier / visuel'],
    triggers: ['powerpoint', '\\bpptx?\\b', 'diapo', 'slides?\\b', 'pr[ée]sentation', 'comex', 'comit[ée]', 'pitch', '\\bdeck\\b', 'support de r[ée]union'],
    required_tools: ['report.export'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['reporting'],
    companions: ['presentation_design', 'documents_validation'],
    source: 'MASSAMBA — skill pptx-comex (pratiques inspirées de la skill pptx d’Anthropic, texte original)',
    license: 'MIT',
    playbook:
      'Follow the pptx-comex skill. One message per slide, the title is the message (≤ 12 words); conclusion first, then evidence, then the decision asked; ≤ 6 bullets and ≤ 30 words of body; two typefaces at most, body ≥ 18 pt; every text inside its box with 0.5" margins, nothing outside the 16:9 canvas, no logo/title overlap; native charts with title, value labels, zero-based axis, theme palette; speaker notes. QA before delivery: content (every figure from the data, no invention), file (opens without repair — m365-verification in the container), visual (slide-by-slide preview, nothing clipped). Produce with report.export pptx (premium: cover, agenda, KPI slide, native charts, sections, notes, chosen theme, adaptive logo).',
  },
  {
    ...BASE,
    name: 'office_docx',
    description: 'Document Word éditorial (skill docx-editorial) : mémo, rapport, page de garde, sommaire automatique, tableaux, pagination, en-tête/pied, signature, PDF fidèle.',
    capabilities: ['page de garde + sommaire', 'en-tête/pied + pagination', 'styles et listes réels', 'tableaux à largeurs fixes', 'PDF fidèle vérifié page par page'],
    triggers: ['\\bword\\b', '\\bdocx?\\b', 'm[ée]mo', 'note de synth', 'lettre', 'courrier', 'rapport word', 'page de garde', 'sommaire', 'pagination', 'signature'],
    required_tools: ['report.export'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['reporting'],
    companions: ['document_reporting', 'documents_validation'],
    source: 'MASSAMBA — skill docx-editorial (pratiques inspirées des skills docx/pdf d’Anthropic, texte original)',
    license: 'MIT',
    playbook:
      'Follow the docx-editorial skill. Cover page, automatic table of contents on real heading styles, header/footer with “n / N” page numbers (no header on the cover), executive summary first (≤ 10 lines) then findings then recommendations; real styles and real bullet lists, fixed-width tables that fit the page, images at text width with a caption; figures with thousands separators, unit and period, a source under each table, nothing invented; the chosen theme and imported logo. The PDF reproduces the document (printable HTML of the app or conversion in the container) and is checked page by page. Produce with report.export docx / html; m365-verification in the container.',
  },
  {
    ...BASE,
    name: 'office_pdf',
    description: 'PDF (skill pdf-livrable) : lire et extraire texte et tableaux, fusionner / scinder, remplir un formulaire, produire un PDF imprimable fidèle, vérifier page par page.',
    capabilities: ['extraction texte/tableaux', 'fusion / scission / rotation', 'formulaires', 'PDF imprimable fidèle', 'vérification page par page'],
    triggers: ['\\bpdf\\b', 'fusionn', 'scind', 'd[ée]coupe le pdf', 'extrai.* pdf', 'formulaire pdf', 'imprimable', 'version pdf'],
    required_tools: ['filesystem.read'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['document_analyst', 'reporting'],
    companions: ['pdf_extraction', 'documents_validation'],
    source: 'MASSAMBA — skill pdf-livrable (pratiques inspirées de la skill pdf d’Anthropic, texte original)',
    license: 'MIT',
    playbook:
      'Follow the pdf-livrable skill. Read and extract with the app (data.inspect / filesystem.read; tables re-read against the rendered page; scanned PDF → ocr_vision with its reliability stated); merge, split, rotate, fill forms with code.run (python pypdf in the container, Pyodide in the app) keeping useful metadata; produce a deliverable PDF from a mastered document (printable HTML with the chosen theme, or converted docx): margins, header/footer, page numbers, page break before each level-1 title, tables not cut mid-row; verify page by page before delivering; nothing invented.',
  },
  {
    ...BASE,
    name: 'documents_validation',
    description: 'Validation des livrables Office et PDF (skill documents-validation) : produire → inspecter (rendu page par page) → valider (schéma Open XML, formules, mise en page) → corriger → relancer, avant livraison.',
    capabilities: ['rendu page/feuille/diapo lu', 'validation Open XML (M365)', 'designQA + excelStrict', 'correction de la cause', 'compte rendu de vérification'],
    triggers: ['v[ée]rifie le livrable', 'valide le fichier', 'validation du livrable', 'contr[ôo]le avant livraison', 'erreur [àa] l.ouverture', 'fichier corrompu', 'probl[èe]me dans le contenu', 'qualit[ée] du livrable', 'qa document', 'inspecte le fichier', 'r[ée]par(e|ation) (du|le) fichier'],
    required_tools: ['filesystem.read'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['qa_engineer', 'reporting'],
    companions: ['document_reporting'],
    source: 'MASSAMBA — skill documents-validation (workflow commun des validateurs de l’app + m365-verification)',
    license: 'MIT',
    playbook:
      'Follow the documents-validation skill. 1) Produce with the app’s engine. 2) Inspect: render every sheet / page / slide as an image and read it (#####, clipped text, unreadable table, missing chart, misplaced logo, weak contrast, blank page). 3) Validate: in the app designQA, excelStrict, designGate and the frontend-design check; in the container `bash .claude/skills/m365-verification/scripts/verify.sh <files>` (Open XML SDK, 0 errors). 4) Fix the cause, re-run 2 and 3, then deliver saying what was checked and how, with the limit (LibreOffice render ≈ Microsoft 365). A deliverable that fails a criterion is not delivered; a check is never hidden.',
  },
  // ── Visual QA (frontend) ──
  {
    ...BASE,
    name: 'frontend_visual_qa',
    description: 'QA visuelle du rendu réel (skill frontend-visual-qa) : captures d’écrans réels, débordements, états interactifs, responsive, écarts visuels après modification ; audit avec preuves, puis correction et re-test.',
    capabilities: ['contrat d’audit (cible, état, viewport prouvés)', 'captures et inspection réelles', 'parcours et sorties', 'typographie / débordement / responsive / data-viz', 'rapport → correction → re-test'],
    triggers: ['qa visuel', 'audit visuel', 'v[ée]rifie l.affichage', 'd[ée]bordement', 'texte coup[ée]', 'responsive', 'capture d.[ée]cran', '[ée]tats? interactifs?', '[ée]cart visuel', 'rendu de la page', 'contr[ôo]le visuel'],
    required_tools: ['browser.open'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['product_ux', 'qa_engineer'],
    companions: ['frontend_design', 'visual_regression'],
    source: 'daymade/claude-code-skills frontend-visual-qa (MIT)',
    license: 'MIT',
    playbook:
      'Follow the frontend-visual-qa skill (skill.read frontend-visual-qa; references/journey-and-page-contracts.md, silent-degradation-and-evidence.md). Audit what a person actually sees: establish the audit contract (target, state, viewport, journeys), select the evidence level, prove target / state / viewport before judging, capture and inspect rendered evidence (browser.open, browser.snapshot, browser.click; apex.qa for an HTML app; the Contrôle frontend-design of every written page; visual.compare for before/after), exercise journeys and outputs, report with evidence, fix, re-run until the completion gate passes. Audit-only by default: edit code only when asked.',
  },
  {
    ...BASE,
    name: 'visual_regression',
    description: 'Régression visuelle (skill visual-regression) : comparer les captures avant / après pour détecter les changements involontaires de mise en page, de thème, de composants et de responsive.',
    capabilities: ['baselines', 'rendu déterministe (animations, polices, données)', 'comparaison à seuil', 'points de rupture responsive', 'diff pixel avec zones'],
    triggers: ['r[ée]gression visuelle', 'compar(e|er) les captures', 'avant.apr[èe]s', 'baseline', 'snapshot visuel', 'diff visuel', 'changement involontaire', 'mise en page cass[ée]e', 'capture de r[ée]f[ée]rence'],
    required_tools: ['visual.compare'],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['qa_engineer'],
    companions: ['frontend_visual_qa', 'testing'],
    source: 'PramodDutta/qaskills visual-regression (MIT) — tool visual.compare',
    license: 'MIT',
    playbook:
      'Follow the visual-regression skill. Baselines are the source of truth; make rendering deterministic (disable animations, wait for fonts, mask or replace dynamic content); compare with a threshold, not pixel equality; cover the key breakpoints and both component and page level; update a baseline only for an intended change, and say so. In the app, visual.compare {before, after} reports the changed ratio, the verdict and the changed zones and writes a diff image; in the container use Playwright toHaveScreenshot with maxDiffPixelRatio.',
  },
];
