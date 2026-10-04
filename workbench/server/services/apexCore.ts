// APEX Studio core (pure, shared): builds offline single-file HTML apps in the
// house method of "Credit Risk OS APEX" — Excel in, premium dashboard out, with
// Excel / PowerPoint / Word / PDF / colour-mail exports. The proprietary kit
// (shell, 3D visuals, logo, vendor libraries) comes from the user's own skill
// folder: loaded at run time by the server, embedded at build time in the
// direct edition. It is never stored in the repository.

export interface HouseKit {
  /** SKILL.md of the export studio (charte, architecture, export chain, QA). */
  skill: string;
  /** Domain skill + references (credit risk), when present. */
  domain: Record<string, string>;
  shell: string;
  kitJs: string;
  logoB64: string;
  vendor: { xlsx: string; chart: string; zip: string };
  /** Complete commented reference application. */
  example: string;
  source: string;
}

export const APEX_MARKERS = [
  '/*@@VXLSX@@*/',
  '/*@@VCHART@@*/',
  '/*@@VZIP@@*/',
  '/*@@LOGO@@*/',
  '/*@@KIT@@*/',
  '/*@@APP@@*/',
];

/** The method, written so that it applies to any subject (not only credit risk). */
export const APEX_METHOD = `APEX METHOD — how MASSAMBA builds a business application (any subject):
1. DATA FIRST: read the user's real file (data.inspect / data.query). Tolerant reading: find the header row in the first 25 rows, match headers with accent-free regexes, harmonise hand-typed labels (case, accents, typos). Never invent data; state every assumption.
2. ONE OFFLINE FILE: a single .html, 100 % offline (all libraries inlined), opened by double-click on a locked-down bank workstation. No network call, no CDN.
3. SCREEN: a hero specific to the subject (navy gradient block, the key figure very large, the signature visual), KPI cards with a coloured left border, raised cards, navy table headers with lime filet, zebra rows, clickable rows opening a detail drawer, global filters applied to every view AND every export, a mobile layout at 390 px.
4. WRITTEN READING: each synthesis comes with numbered findings in sentences (figures, trend, cause, recommendation), reused in the mail, Word and PowerPoint.
5. MEMORY: successive loads are remembered locally (localStorage in try/catch) to compute day-to-day movements.
6. EXPORT CHAIN, same identity everywhere: Excel (dashboard sheet with tiles + 3D visuals, then one sheet per angle with its chart, conditional formats, drop-down follow-up lists, A4 landscape print, footer INTERNAL USE ONLY), PowerPoint (wide layout, navy cover, band + lime filet + logo badge on each slide, KPI tiles, tables with stage colours, closing slide), Word (navy cover with badge, KPIs, lime-underlined headings, written bullets, styled tables, 15-16.5 cm images), colour mail (680 px Outlook-safe tables, .eml with cid: images, rich copy, .html), PDF (printable HTML).
7. QA BEFORE DELIVERY: syntax check, load a real file, open every tab, no page error, trigger every export and check the files (apex.qa does the automatic part), then report what was verified and what was not.`;

/** Assembles shell + vendor libraries + logo + kit + application code. */
export function assembleApp(kit: HouseKit, appJs: string): string {
  const rep: [string, string][] = [
    ['/*@@VXLSX@@*/', kit.vendor.xlsx],
    ['/*@@VCHART@@*/', kit.vendor.chart],
    ['/*@@VZIP@@*/', kit.vendor.zip],
    ['/*@@LOGO@@*/', kit.logoB64.trim()],
    ['/*@@KIT@@*/', kit.kitJs],
    // A literal "</script>" inside the app code would end the inline script early.
    ['/*@@APP@@*/', appJs.replace(/<\/script/gi, '<\\/script')],
  ];
  let out = kit.shell;
  // split/join: no special "$" patterns as with String.replace.
  for (const [k, v] of rep) out = out.split(k).join(v);
  return out;
}

/** Problems that make an app unusable before running it (markers, KIT, required kit calls). */
export function lintApp(appJs: string): string[] {
  const issues: string[] = [];
  if (!/\bconst\s+KIT\s*=/.test(appJs))
    issues.push(
      'KIT is not defined: declare const KIT={org,unit,app,footer,docTitle,docSubject,keywords} first.',
    );
  if (!/function\s+toast\s*\(|const\s+toast\s*=/.test(appJs))
    issues.push('toast(msg) is not defined (the kit calls it).');
  if (/https?:\/\/(cdn|unpkg|cdnjs)/i.test(appJs))
    issues.push('The app loads a CDN: everything must stay offline.');
  for (const m of APEX_MARKERS)
    if (appJs.includes(m)) issues.push(`The app code must not contain the marker ${m}.`);
  return issues;
}

/** Public API of the house kit, for the agent (names only, from the real source). */
export function kitApi(kit: HouseKit): string {
  const names = [...kit.kitJs.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm)].map(
    (m) => `${m[1]}(${m[2]})`,
  );
  const consts = [...kit.kitJs.matchAll(/^const\s+([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]);
  return `Kit functions: ${names.join(', ')}\nKit constants: ${consts.join(', ')}`;
}

/** Shell DOM ids the application code can rely on. */
export function shellIds(kit: HouseKit): string[] {
  return [...new Set([...kit.shell.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!))];
}

export function apexGuide(kit: HouseKit | null): string {
  if (!kit)
    return `${APEX_METHOD}

The house kit (shell, 3D visual engine, logo, vendor libraries) is NOT installed in this MASSAMBA build, so apex.build_app is unavailable. Fall back on: data.chart + report.export (Word / printable PDF in house style) + data.export (Excel in house style), or write a self-contained HTML artifact without external libraries. Tell the user how to enable the kit: import the "ecobank-god-export-studio" skill folder (Plugins → Kit maison) or rebuild MASSAMBA where the skill is installed.`;
  return `${APEX_METHOD}

HOUSE SKILL (${kit.source}):
${kit.skill.replace(/^---[\s\S]*?---\s*/, '')}

${kitApi(kit)}
Shell element ids available: ${shellIds(kit).join(', ')}

WORKFLOW WITH THE TOOLS:
- apex.reference {part:1..N} — read the complete reference application (a real, working app in this method). Read it before writing a new one; reuse its structure (formats, tolerant reading, normalisations, aggregates, views, exports, mail).
- Write ONLY the application script (what goes in place of /*@@APP@@*/): 'use strict'; const KIT={...}; toast(); data loading; views; exports wired to the kit. Then apex.build_app {name, app_js} assembles the single offline file apps/<name>.html.
- apex.qa {path} runs the app in an isolated frame and reports page errors; fix and rebuild until it is clean.
${Object.keys(kit.domain).length ? `\nDomain references available with apex.reference {doc}: ${Object.keys(kit.domain).join(', ')}` : ''}`;
}

/** Splits the reference app into readable parts (about 18 k characters each). */
export function referencePart(kit: HouseKit, part: number, size = 18_000): { text: string; parts: number } {
  const parts = Math.max(1, Math.ceil(kit.example.length / size));
  const p = Math.min(Math.max(1, Math.floor(part) || 1), parts);
  return { text: kit.example.slice((p - 1) * size, p * size), parts };
}
