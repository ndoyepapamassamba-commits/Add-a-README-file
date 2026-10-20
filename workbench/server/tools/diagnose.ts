// Smart terminal: turns a failed command's output into a structured diagnosis
// the agent can act on (ERROR → ANALYSIS → DIAGNOSIS → FIX → REBUILD → TEST).

export interface Diagnosis {
  category: string;
  hints: string[];
  locations: string[];
}

const RULES: [RegExp, string, string][] = [
  [
    /Cannot find module '([^']+)'|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Module not found: .*?'([^']+)'/i,
    'module manquant',
    'Install the missing dependency (npm install <pkg>) or fix the import path.',
  ],
  [
    /command not found|is not recognized as an internal or external command|ENOENT.*spawn/i,
    'commande introuvable',
    'The tool is not installed or not on PATH: install it, use npx, or use an equivalent command.',
  ],
  [
    /EADDRINUSE|address already in use/i,
    'port occupé',
    'A process already listens on this port: stop it (terminal.kill) or use another port.',
  ],
  [
    /error TS\d+/i,
    'erreur TypeScript',
    'Fix the type errors at the reported file:line, then re-run the type check.',
  ],
  [
    /SyntaxError|Unexpected token|Parse error/i,
    'erreur de syntaxe',
    'Open the file at the reported location and fix the syntax.',
  ],
  [
    /ReferenceError|TypeError|is not a function|Cannot read propert/i,
    'erreur d’exécution JavaScript',
    'Read the stack trace top frame inside the project, fix the root cause, re-run.',
  ],
  [
    /(\d+) (failed|failing)|Tests?:\s+\d+ failed|FAIL\s/i,
    'tests en échec',
    'Read each failing assertion, fix the code (not the test) unless the test is wrong, re-run the failing tests then the whole suite.',
  ],
  [
    /npm ERR!|ERESOLVE|peer dep/i,
    'erreur npm',
    'Read the npm error: resolve version conflicts (check package.json), do not use --force unless justified.',
  ],
  [
    /EACCES|permission denied|EPERM/i,
    'permission refusée',
    'Do not escalate privileges; write inside the project or change the target path.',
  ],
  [
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo|network/i,
    'erreur réseau',
    'Check that the service is started and the URL/port is right; retry once; offline resources may be blocked.',
  ],
  [
    /out of memory|heap out of memory|Killed/i,
    'mémoire insuffisante',
    'Process less data at once or raise the memory limit (NODE_OPTIONS=--max-old-space-size).',
  ],
  [
    /Traceback \(most recent call last\)/,
    'exception Python',
    'Read the last frame of the traceback, fix the cause, re-run.',
  ],
  [
    /No such file or directory|ENOENT/i,
    'fichier introuvable',
    'Check the path (relative to the project root) with filesystem.list / filesystem.glob.',
  ],
  [
    /timed out|timeout/i,
    'délai dépassé',
    'The command took too long: run it in background, narrow it, or raise the timeout.',
  ],
];

export function diagnose(output: string, exitCode: number | null): Diagnosis | null {
  if (exitCode === 0) return null;
  const text = output.slice(-20_000);
  const hits = RULES.filter(([re]) => re.test(text));
  const locations = [
    ...new Set(
      [
        ...text.matchAll(
          /([\w./-]+\.(?:[cm]?[jt]sx?|py|vue|svelte|css|html|json|go|rs|java|rb|php))[:(](\d+)(?:[:,](\d+))?/g,
        ),
      ].map((m) => `${m[1]}:${m[2]}`),
    ),
  ]
    .filter((l) => !l.includes('node_modules'))
    .slice(0, 8);
  return {
    category: hits.map(([, c]) => c).join(', ') || 'échec de la commande',
    hints: hits.length
      ? hits.map(([, , h]) => h)
      : [
          'Read the error output carefully, identify the root cause, fix it, then re-run the same command to confirm.',
        ],
    locations,
  };
}

export function formatDiagnosis(d: Diagnosis): string {
  return `\n\n--- SMART TERMINAL ---\nERROR → ANALYSIS: ${d.category}${d.locations.length ? `\nLocations: ${d.locations.join(', ')}` : ''}\nDIAGNOSIS / NEXT: ${d.hints.join(' ')}\nThen FIX → REBUILD → re-run this command → TEST before moving on.`;
}
