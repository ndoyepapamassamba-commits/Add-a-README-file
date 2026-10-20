/**
 * FRONTEND DESIGN CHECK — the "tells" of a generated page, as listed by Anthropic's `frontend-design` skill
 * (.claude/skills/frontend-design/SKILL.md, embedded in the app), turned into a check that runs on every HTML page the
 * agent writes (filesystem.write / filesystem.edit on *.html). Pure text analysis, no DOM: the CSS of <style> blocks and
 * inline styles, the visible text, the interactive elements. Findings are advice for the model, in French, never a
 * refusal: the file is written, the model fixes it and writes it again. Blocking findings are the skill's quality floor
 * (mobile, keyboard focus, reduced motion); warnings are the calibration list of generated-page defaults; info points
 * at choices to confirm. No metric is invented: every finding quotes what was found.
 */

export type FindingLevel = 'bloquant' | 'avertissement' | 'info';
export interface DesignFinding {
  code: string;
  level: FindingLevel;
  message: string;
  fix: string;
}

const ORDER: Record<FindingLevel, number> = { bloquant: 0, avertissement: 1, info: 2 };

/** A workspace file the check applies to: an .html document (not a fragment nor a data file). */
export function isHtmlDocument(path: string, content: string): boolean {
  return /\.html?$/i.test(path) && /<(html|body|head|style)\b/i.test(content);
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}
function hexToRgb(hex: string): Rgb | null {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4)
    h = h
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('');
  else if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const dist = (a: Rgb, b: Rgb) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
function hsl(c: Rgb): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s, l };
}

const CREAM = hexToRgb('#F4F1EA')!;
const TERRACOTTA = hexToRgb('#D97757')!;

function cssOf(html: string): string {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]!);
  const inline = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => `x{${m[1]}}`);
  return [...styles, ...inline].join('\n');
}
/** Declaration blocks of the CSS (the text between braces), inner blocks of @media included. */
function blocksOf(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
}
function textOf(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rarr;|&#8594;|&#x2192;/gi, '→')
    .replace(/&middot;|&#183;|&#xb7;/gi, '·')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ');
}

const GENERIC_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'helvetica neue',
  'helvetica',
  'arial',
  'inherit',
  'initial',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'cursive',
  'fantasy',
  'inter',
]);
const DEFAULT_FAMILIES = new Set(['inter', 'roboto', 'arial', 'helvetica', 'helvetica neue', 'segoe ui', 'system-ui', '-apple-system']);

/** The findings of the check, blocking ones first (empty when the page shows none of the tells). */
export function frontendDesignLint(html: string): DesignFinding[] {
  const out: DesignFinding[] = [];
  const add = (code: string, level: FindingLevel, message: string, fix: string) => {
    if (!out.some((f) => f.code === code)) out.push({ code, level, message, fix });
  };
  const css = cssOf(html);
  const blocks = blocksOf(css);
  const text = textOf(html);
  const hasDoc = /<(html|head|body)\b/i.test(html);
  const interactive = /<(a|button|input|select|textarea)\b/i.test(html);

  // ── Quality floor (the skill: "responsive down to mobile, visible keyboard focus, reduced motion respected").
  if (hasDoc && !/<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(html))
    add(
      'viewport-absent',
      'bloquant',
      'Pas de <meta name="viewport"> : la page ne s’adapte pas au mobile.',
      'Ajouter <meta name="viewport" content="width=device-width, initial-scale=1"> dans <head>.',
    );
  const animated = /\b(animation|transition)(-[a-z]+)?\s*:/i.test(css) || /@keyframes/i.test(css);
  if (animated && !/prefers-reduced-motion/i.test(css))
    add(
      'mouvement-reduit-absent',
      'bloquant',
      'Animations ou transitions sans @media (prefers-reduced-motion: reduce).',
      'Ajouter une règle qui neutralise animation et transition quand le lecteur demande moins de mouvement.',
    );
  if (interactive && /outline\s*:\s*(none|0)\b/i.test(css) && !/:focus-visible/i.test(css))
    add(
      'focus-invisible',
      'bloquant',
      'outline supprimé sans style :focus-visible : la navigation au clavier devient invisible.',
      'Garder un anneau de focus visible (:focus-visible { outline: 2px solid …; outline-offset: 2px }).',
    );
  if (/<html\b/i.test(html) && !/<html\b[^>]*\slang\s*=/i.test(html))
    add('lang-absent', 'avertissement', '<html> sans attribut lang.', 'Écrire <html lang="fr"> (ou la langue du contenu).');
  if (hasDoc && css && !/@media/i.test(css) && !/clamp\(/i.test(css) && !/auto-(fit|fill)/i.test(css))
    add(
      'responsive-non-prouve',
      'avertissement',
      'Aucune règle adaptative (media query, clamp, auto-fit) : rien ne prouve le rendu à 360 px.',
      'Vérifier la page à 360 px de large et ajouter les règles nécessaires.',
    );

  // ── Palettes that generated pages cluster around.
  const colours = [...new Set([...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))]
    .map((h) => ({ hex: h, rgb: hexToRgb(h) }))
    .filter((c): c is { hex: string; rgb: Rgb } => c.rgb !== null);
  const cream = colours.find((c) => dist(c.rgb, CREAM) <= 18);
  const terracotta = colours.find((c) => dist(c.rgb, TERRACOTTA) <= 40);
  if (cream && terracotta)
    add(
      'palette-ia-creme-terracotta',
      'avertissement',
      `Fond crème (${cream.hex}) + accent terracotta (${terracotta.hex}) : la palette par défaut des pages générées par IA.`,
      'Repartir du sujet : 4 à 6 couleurs nommées qui viennent de l’univers du produit, pas du modèle.',
    );
  const bgDecl = [...css.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})\b/gi)].map((m) => m[1]!.toLowerCase());
  const nearBlackBg = bgDecl.map(hexToRgb).some((c) => c && Math.max(c.r, c.g, c.b) <= 0x22);
  const acid = colours.find((c) => {
    const { h, s, l } = hsl(c.rgb);
    return (h >= 62 && h <= 112 && s >= 0.75 && l >= 0.4 && l <= 0.72) || (h >= 4 && h <= 20 && s >= 0.8 && l >= 0.45 && l <= 0.6);
  });
  if (nearBlackBg && acid)
    add(
      'noir-acide',
      'avertissement',
      `Fond quasi noir + accent vif unique (${acid.hex}) : deuxième palette par défaut des pages générées.`,
      'Si le brief n’impose pas ce look, choisir une palette qui vient du sujet.',
    );
  const tinted = colours.find((c) => /^#(0b0b0b|111|111111|0a0a0a|121212|0d0d0d|0e0e0e|101010)$/.test(c.hex));
  if (tinted)
    add(
      'noir-teinte',
      'avertissement',
      `Quasi-noir ${tinted.hex} utilisé à la place du noir : chrome de gabarit.`,
      'Choisir un noir, ou une teinte sombre justifiée par le sujet, et l’assumer.',
    );

  // ── Template chrome.
  const eyebrow = blocks.some(
    (b) => /text-transform\s*:\s*uppercase/i.test(b) && /letter-spacing\s*:\s*(0?\.\d+\s*(em|rem)|[1-9](\.\d+)?px|0\.\d+px)/i.test(b),
  );
  if (eyebrow)
    add(
      'eyebrow-capitales',
      'avertissement',
      'Libellés en capitales espacées (text-transform: uppercase + letter-spacing) : le sur-titre au-dessus de chaque titre, tic n° 1 des pages générées.',
      'Supprimer les sur-titres inutiles ; sinon casse de phrase, sans espacement.',
    );
  if (/\S\s·\s\S/.test(text))
    add('points-medians', 'avertissement', 'Métadonnées jointes par des points médians (« A · B · C »).', 'Une phrase, une liste ou une structure réelle.');
  if (/\b[A-ZÀ-Ý]{3,}\s—\s\S/.test(text))
    add('libelle-tiret-cadratin', 'avertissement', 'Libellés « MOT — fragment » avec tiret cadratin espacé.', 'Un titre en casse de phrase.');
  if (/<(a|button)\b[^>]*>(?:(?!<\/(a|button)>)[\s\S])*?(→|&rarr;|&#8594;|&#x2192;)\s*(<\/[a-z]+>\s*)*<\/(a|button)>/i.test(html))
    add(
      'fleche-boutons',
      'avertissement',
      'Flèche « → » ajoutée au texte des liens ou boutons.',
      'Le texte dit ce qui se passe (« Enregistrer les modifications ») ; pas de flèche décorative.',
    );
  const markers = new Set([...text.matchAll(/(?:^|[^\d.,])0([1-9])(?![\d.,:%])/g)].map((m) => m[1]!));
  if (markers.size >= 3)
    add(
      'marqueurs-numerotes',
      'info',
      `Marqueurs numérotés 01 / 02 / 03 (${markers.size} repérés) : à garder seulement si le contenu est vraiment une séquence (étapes, chronologie).`,
      'Vérifier que le contenu est une séquence ; sinon retirer la numérotation.',
    );
  const radii = blocks.map((b) => /border-radius\s*:\s*([^;]+)/i.exec(b)?.[1]?.trim().toLowerCase()).filter(Boolean) as string[];
  const sameRadius = radii.length >= 3 && new Set(radii).size === 1;
  const greyShadow = /box-shadow\s*:[^;]*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.1\s*\)/i.test(css);
  if (sameRadius && greyShadow)
    add(
      'kit-cartes-saas',
      'avertissement',
      `Kit de cartes SaaS : le même border-radius (${radii[0]}) sur ${radii.length} blocs + l’ombre grise rgba(0,0,0,.1).`,
      'Une hiérarchie : un rayon par niveau, l’ombre seulement là où elle informe.',
    );
  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/gi)].map((m) => m[1]!);
  const fadeSlide = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([^@]*?)\}\s*\}/gi)].filter((m) => /translateY\(/i.test(m[2]!) && /opacity\s*:\s*0\b/i.test(m[2]!));
  const uses = (name: string) => blocks.filter((b) => new RegExp(`animation(-name)?\\s*:[^;]*\\b${name}\\b`, 'i').test(b)).length;
  const scattered = keyframes.length >= 3 || fadeSlide.some((m) => uses(m[1]!) >= 2) || blocks.filter((b) => /transition\s*:/i.test(b)).length >= 4;
  if (scattered)
    add(
      'mouvement-disperse',
      'avertissement',
      `Effets dispersés (${keyframes.length} @keyframes, ${blocks.filter((b) => /transition\s*:/i.test(b)).length} transitions) : entrées fondu + glissement ou survols partout, signature des pages générées.`,
      'Un seul moment orchestré (au chargement ou à une action), le reste immobile.',
    );

  // ── Typography.
  const families = [...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
    .map((m) => m[1]!.split(',')[0]!.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter((f) => f && !f.startsWith('var('));
  const distinct = [...new Set(families)].filter((f) => !GENERIC_FAMILIES.has(f) || f === 'inter');
  if (distinct.length > 2)
    add('trop-de-familles', 'avertissement', `Plus de deux familles typographiques (${distinct.join(', ')}).`, 'Une famille, ou deux clairement distinctes (titre / texte).');
  if (families.length && families.every((f) => DEFAULT_FAMILIES.has(f) || GENERIC_FAMILIES.has(f)))
    add(
      'typographie-par-defaut',
      'info',
      `Seulement des familles par défaut (${[...new Set(families)].join(', ')}).`,
      'Choisir la typographie pour ce brief : la police porte la personnalité de la page.',
    );
  const headline = /<h[12]\b[^>]*>((?:(?!<\/h[12]>)[\s\S])*)<\/h[12]>/gi;
  for (const m of html.matchAll(headline)) {
    const inner = m[1]!;
    const accent = /<(span|em|strong|i|b)\b[^>]*>\s*([^\s<]+)\s*<\/\1>/i.exec(inner);
    if (!accent) continue;
    const words = inner.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      add(
        'mot-accentue-titre',
        'avertissement',
        `Un seul mot du titre mis en valeur (« ${accent[2]} ») : tic typographique des pages générées.`,
        'Le titre entier porte le traitement, ou aucun mot.',
      );
      break;
    }
  }
  const paragraphs = (html.match(/<p\b/gi) ?? []).length;
  if (paragraphs >= 3 && !/max-width\s*:\s*\d+(\.\d+)?ch/i.test(css) && !/max-width\s*:\s*([1-7]\d\d)px/i.test(css))
    add(
      'longueur-de-ligne',
      'info',
      `${paragraphs} paragraphes sans largeur de lecture limitée (max-width en ch, ou < 760 px) : lignes probablement > 80 caractères.`,
      'max-width: 65ch sur les blocs de texte (un peu plus pour une serif).',
    );

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/** The report appended to the tool result (what the model reads), in French. */
export function lintReport(findings: DesignFinding[]): string {
  if (!findings.length) return 'Contrôle frontend-design : aucun tic de page générée repéré.';
  const blocking = findings.filter((f) => f.level === 'bloquant').length;
  const lines = findings.map((f) => `- [${f.level}] ${f.code} : ${f.message} → ${f.fix}`);
  return `Contrôle frontend-design (skill Anthropic) : ${findings.length} remarque(s), ${blocking} bloquante(s).\n${lines.join('\n')}\nRègle : corriger les bloquants et réécrire le fichier avant de livrer ; un avertissement est un tic de page générée — ne le garder que s’il est un choix assumé pour ce brief (dis-le).`;
}

/** Short label for the tool line in the chat. */
export function lintSummary(findings: DesignFinding[]): string {
  if (!findings.length) return 'design ✓';
  const blocking = findings.filter((f) => f.level === 'bloquant').length;
  return `design : ${findings.length} remarque(s)${blocking ? `, ${blocking} bloquante(s)` : ''}`;
}
