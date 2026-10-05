// GitHub Intelligence Discovery + Security Review (pure; the caller injects the
// HTTP functions, so it runs in the browser, on the server and in tests).
// A repository is NEVER trusted because it exists or because it has stars: the
// review weighs reputation, maintenance, licence, install scripts, binaries,
// declared permissions, secrets, telemetry, known advisories and manipulation
// signals (archived, typosquatting, star farming, malware vocabulary).
export interface RepoFacts {
  fullName: string;
  ownerType: 'Organization' | 'User' | string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string;
  pushedAt: string;
  archived: boolean;
  disabled?: boolean;
  fork?: boolean;
  license: string | null;
  language?: string | null;
  topics?: string[];
  defaultBranch?: string;
  homepage?: string | null;
  /** Deep scan (optional): */
  contributors?: number | null;
  latestRelease?: { tag: string; date: string } | null;
  packageJson?: PackageJsonLite | null;
  pyproject?: string | null;
  readme?: string | null;
  tree?: string[] | null;
  advisories?: { severity: string; summary: string; id: string }[] | null;
  /** When the facts were read. */
  scannedAt?: string;
  deep?: boolean;
}
export interface PackageJsonLite {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: unknown;
}

export type SecurityBand = 'REJECT' | 'HIGH_RISK' | 'REVIEW_REQUIRED' | 'ACCEPTABLE' | 'TRUSTED_CANDIDATE';
export const BAND_LABEL: Record<SecurityBand, string> = {
  REJECT: 'REJET (0–39)',
  HIGH_RISK: 'RISQUE ÉLEVÉ (40–59)',
  REVIEW_REQUIRED: 'REVUE REQUISE (60–74)',
  ACCEPTABLE: 'ACCEPTABLE (75–89)',
  TRUSTED_CANDIDATE: 'CANDIDAT DE CONFIANCE (90–100)',
};
export function bandOf(score: number): SecurityBand {
  return score < 40
    ? 'REJECT'
    : score < 60
      ? 'HIGH_RISK'
      : score < 75
        ? 'REVIEW_REQUIRED'
        : score < 90
          ? 'ACCEPTABLE'
          : 'TRUSTED_CANDIDATE';
}

export interface Finding {
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  label: string;
  detail?: string;
  /** Points added (+) or removed (−) by this finding. */
  delta: number;
}
export interface SecurityReview {
  score: number;
  band: SecurityBand;
  quality: number;
  maintenance: number;
  findings: Finding[];
  permissions: string[];
  secrets: string[];
  abandoned: boolean;
  suspicious: boolean;
  /** "scan profond" (manifest, arborescence, README, avis) or metadata only. */
  depth: 'deep' | 'metadata';
  reviewedAt: string;
}

const PERMISSIVE = /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|0BSD|Unlicense|CC0-1\.0)$/i;
const COPYLEFT = /^(GPL|AGPL|LGPL)/i;
const KNOWN_ORGS = [
  'modelcontextprotocol',
  'microsoft',
  'anthropics',
  'openai',
  'github',
  'google',
  'googleapis',
  'supabase',
  'vercel',
  'upstash',
  'cloudflare',
  'mongodb-js',
  'brave',
  'playwright',
];
const ABANDONED_DEPS = [
  'request',
  'node-uuid',
  'event-stream',
  'left-pad',
  'nomnom',
  'coffee-script',
  'har-validator',
];
const MALWARE_WORDS =
  /\b(stealer|grabber|keylogger|token ?logger|crack(ed)?|keygen|free robux|wallet drainer|rat client|botnet|cookie ?stealer|bypass (av|antivirus)|undetectable)\b/i;
const DAY = 86_400_000;

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

/** Prompt-injection / exfiltration patterns in text an agent would read (SKILL.md, README, tool descriptions). */
export function injectionFindings(text: string): Finding[] {
  const out: Finding[] = [];
  const t = text.slice(0, 400_000);
  const rx: [RegExp, string, Finding['severity'], number][] = [
    [
      /ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts?)/i,
      'Injection de prompt (« ignore previous instructions »)',
      'critical',
      -60,
    ],
    [
      /(do not|don't|never) (tell|inform|show) the user/i,
      'Consigne de dissimulation à l’utilisateur',
      'critical',
      -50,
    ],
    [
      /(send|post|upload|exfiltrat\w*)[^\n]{0,80}(api[_ -]?key|token|password|credential|secret|\.env|ssh)/i,
      'Envoi de secrets vers l’extérieur',
      'critical',
      -60,
    ],
    [/(curl|wget)[^\n|]{0,200}\|\s*(ba)?sh\b/i, 'Téléchargement puis exécution (curl | sh)', 'high', -25],
    [/\b(rm -rf \/|mkfs|dd if=\/dev\/zero|format c:)/i, 'Commande destructrice', 'high', -30],
    [/[\u{E0000}-\u{E007F}‮]/u, 'Caractères Unicode invisibles / de contrôle', 'high', -30],
    [/[A-Za-z0-9+/]{400,}={0,2}/, 'Long bloc base64 (contenu opaque)', 'medium', -10],
    [
      /eval\s*\(\s*(atob|Buffer\.from|unescape)/i,
      'Code obfusqué (eval d’un contenu décodé)',
      'critical',
      -50,
    ],
  ];
  for (const [re, label, severity, delta] of rx) if (re.test(t)) out.push({ severity, label, delta });
  return out;
}

/** Declared capabilities that matter for security, read from README / manifest / description. */
export function declaredPermissions(f: RepoFacts): { permissions: string[]; secrets: string[] } {
  const text = `${f.description} ${(f.topics ?? []).join(' ')} ${f.readme ?? ''} ${JSON.stringify(f.packageJson?.dependencies ?? {})} ${f.pyproject ?? ''}`;
  const p = new Set<string>();
  if (
    /child_process|subprocess|execute (shell |terminal )?commands?|shell access|run commands|\bexec\b/i.test(
      text,
    )
  )
    p.add('shell');
  if (/file ?system|read(s|ing)? (and|&) writ|write files|filesystem|local files/i.test(text))
    p.add('fichiers');
  if (/puppeteer|playwright|selenium|browser automation|headless/i.test(text)) p.add('navigateur');
  if (/fetch|http|web|api|crawl|scrap|search/i.test(text)) p.add('réseau');
  if (/oauth|credential|login|password/i.test(text)) p.add('identifiants');
  if (/docker/i.test(text)) p.add('docker');
  if (/database|sql|mongodb|postgres|supabase|duckdb/i.test(text)) p.add('base de données');
  const secrets = [
    ...new Set(
      [...text.matchAll(/\b([A-Z][A-Z0-9_]{2,}_(?:API_KEY|KEY|TOKEN|SECRET|PASSWORD|PAT))\b/g)].map(
        (m) => m[1]!,
      ),
    ),
  ].slice(0, 8);
  return { permissions: [...p], secrets };
}

/** Security / quality / maintenance review of a repository (0–100 each). */
export function securityReview(f: RepoFacts, now = Date.now()): SecurityReview {
  const findings: Finding[] = [];
  const add = (severity: Finding['severity'], label: string, delta: number, detail?: string) =>
    findings.push({ severity, label, delta, detail });
  let suspicious = false;
  const ageDays = (now - Date.parse(f.pushedAt)) / DAY;
  const createdDays = (now - Date.parse(f.createdAt)) / DAY;
  const owner = f.fullName.split('/')[0]!.toLowerCase();

  // Reputation (capped: stars alone can never make a repository "safe").
  const starPts = Math.min(6, Math.log10(f.stars + 1) * 1.5);
  add('info', `${f.stars.toLocaleString('fr-FR')} étoiles (réputation plafonnée)`, +starPts);
  if (f.ownerType === 'Organization') add('info', 'Publié par une organisation', +4);
  if ((f.contributors ?? 0) >= 10) add('info', `${f.contributors} contributeurs`, +2);
  else if (f.contributors != null && f.contributors <= 1) add('low', 'Un seul contributeur', -3);

  // Maintenance
  const abandoned = f.archived || ageDays > 540;
  if (f.disabled) add('critical', 'Dépôt désactivé par GitHub', -80);
  if (f.archived) add('high', 'Dépôt ARCHIVÉ : plus maintenu, aucun correctif de sécurité', -40);
  else if (ageDays > 540)
    add('high', `Abandonné : aucun commit depuis ${Math.round(ageDays / 30)} mois`, -30);
  else if (ageDays > 365)
    add('medium', `Peu maintenu : dernier commit il y a ${Math.round(ageDays / 30)} mois`, -12);
  else if (ageDays <= 90) add('info', 'Activité récente (< 90 jours)', +6);
  else add('info', 'Activité dans l’année', +2);
  if (f.latestRelease && (now - Date.parse(f.latestRelease.date)) / DAY < 365)
    add('info', `Release ${f.latestRelease.tag} de moins d’un an`, +2);
  if (f.fork) add('low', 'Fork d’un autre dépôt', -5);
  if (f.openIssues > 500 && f.stars < 20_000) add('low', `${f.openIssues} issues ouvertes`, -3);

  // Licence
  if (!f.license) add('high', 'Aucune licence déclarée : réutilisation juridiquement incertaine', -15);
  else if (f.license === 'NOASSERTION')
    add('low', 'Licence non standard (NOASSERTION) : à vérifier par composant', -4);
  else if (PERMISSIVE.test(f.license)) add('info', `Licence ${f.license} (permissive)`, +4);
  else if (COPYLEFT.test(f.license))
    add('low', `Licence ${f.license} (copyleft : contraintes de diffusion)`, -2);

  // Manipulation signals
  for (const org of KNOWN_ORGS) {
    const dist = levenshtein(owner, org);
    if (owner !== org && dist > 0 && dist <= 2 && owner.length >= 5) {
      suspicious = true;
      add('critical', `Nom proche de « ${org} » (typosquatting possible)`, -45);
      break;
    }
  }
  if (createdDays < 60 && f.stars > 2000 && (f.contributors ?? 99) <= 2) {
    suspicious = true;
    add('high', 'Popularité anormale (dépôt récent, beaucoup d’étoiles, très peu de contributeurs)', -20);
  }
  if (MALWARE_WORDS.test(`${f.description} ${f.readme ?? ''}`)) {
    suspicious = true;
    add('critical', 'Vocabulaire de logiciel malveillant dans la description / le README', -70);
  }

  // Manifest: install scripts, dependencies
  const scripts = f.packageJson?.scripts ?? {};
  for (const k of ['preinstall', 'install', 'postinstall'] as const)
    if (scripts[k]) {
      const s = scripts[k]!;
      if (/curl|wget|powershell|bash -c|sh -c|eval|base64|node -e|http/i.test(s)) {
        suspicious = true;
        add('critical', `Script « ${k} » qui télécharge / exécute du code`, -40, s.slice(0, 160));
      } else add('medium', `Script « ${k} » exécuté à l’installation`, -12, s.slice(0, 160));
    }
  const deps = Object.keys(f.packageJson?.dependencies ?? {});
  if (deps.length > 80) add('low', `${deps.length} dépendances directes (surface d’attaque)`, -5);
  for (const d of deps.filter((x) => ABANDONED_DEPS.includes(x)))
    add('medium', `Dépendance abandonnée : ${d}`, -5);

  // Tree: binaries, docker
  const tree = f.tree ?? [];
  const bins = tree.filter(
    (p) => /\.(exe|dll|so|dylib|bin|node|jar|msi|scr|bat|ps1)$/i.test(p) && !/test|fixture/i.test(p),
  );
  if (bins.length)
    add(
      'high',
      `${bins.length} binaire(s) / script(s) système versionné(s)`,
      -12,
      bins.slice(0, 5).join(', '),
    );
  if (tree.some((p) => /(^|\/)Dockerfile$/.test(p)))
    add('info', 'Image Docker fournie (à construire soi-même)', 0);
  const minified = tree.filter((p) => /\.min\.js$/.test(p) && !/(dist|vendor|public|static)\//.test(p));
  if (minified.length)
    add('medium', 'JavaScript minifié hors dossier de build (code difficile à relire)', -6);

  // Text an agent would read
  if (f.readme) findings.push(...injectionFindings(f.readme));
  if (
    findings.some(
      (x) => x.severity === 'critical' && /Injection|dissimulation|secrets|obfusqué/.test(x.label),
    )
  )
    suspicious = true;

  // Declared permissions and secrets
  const { permissions, secrets } = declaredPermissions(f);
  if (permissions.includes('shell')) add('medium', 'Exécute des commandes système', -6);
  if (permissions.includes('fichiers')) add('low', 'Accès au système de fichiers', -3);
  if (permissions.includes('navigateur')) add('low', 'Pilote un navigateur', -3);
  if (secrets.length) add('low', `Secrets requis : ${secrets.join(', ')}`, -Math.min(6, secrets.length * 2));
  if (
    /posthog|mixpanel|segment\.(io|com)|amplitude|telemetry|google-analytics/i.test(
      `${f.readme ?? ''} ${deps.join(' ')}`,
    )
  )
    add('medium', 'Télémétrie / analytics détectée', -5);

  // Known advisories
  for (const a of (f.advisories ?? []).slice(0, 5))
    add(
      /critical|high/i.test(a.severity) ? 'high' : 'medium',
      `Avis de sécurité ${a.id} (${a.severity})`,
      /critical|high/i.test(a.severity) ? -12 : -5,
      a.summary,
    );

  const raw = 70 + findings.reduce((s, x) => s + x.delta, 0);
  let score = Math.round(Math.max(0, Math.min(100, raw)));
  // Hard caps: a suspicious or abandoned repository cannot be approved on popularity.
  if (suspicious) score = Math.min(score, 25);
  else if (f.archived || f.disabled) score = Math.min(score, 35);
  else if (abandoned) score = Math.min(score, 45);
  // Metadata-only reviews cannot reach TRUSTED: the code, manifest and README were not read.
  if (!f.deep) score = Math.min(score, 85);

  const maintenance = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (f.archived
          ? 0
          : ageDays <= 30
            ? 100
            : ageDays <= 90
              ? 90
              : ageDays <= 365
                ? 70
                : ageDays <= 540
                  ? 40
                  : 15) - (f.openIssues > 300 ? 10 : 0),
      ),
    ),
  );
  const quality = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        40 +
          Math.min(30, Math.log10(f.stars + 1) * 7) +
          (f.license && f.license !== 'NOASSERTION' ? 10 : 0) +
          (f.ownerType === 'Organization' ? 10 : 0) +
          maintenance * 0.1 -
          (f.archived ? 30 : 0),
      ),
    ),
  );
  return {
    score,
    band: bandOf(score),
    quality,
    maintenance,
    findings,
    permissions,
    secrets,
    abandoned,
    suspicious,
    depth: f.deep ? 'deep' : 'metadata',
    reviewedAt: new Date(now).toISOString(),
  };
}

// ── HTTP (injected) ────────────────────────────────────────────────────────
export interface GithubHttp {
  /** GET JSON from https://api.github.com/… ; returns null on 404. */
  json: (path: string) => Promise<unknown>;
  /** GET text (raw.githubusercontent.com); null when absent. */
  text: (url: string) => Promise<string | null>;
}

interface ApiRepo {
  full_name: string;
  owner: { type: string; login: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  pushed_at: string;
  archived: boolean;
  disabled?: boolean;
  fork: boolean;
  license: { spdx_id: string } | null;
  language: string | null;
  topics?: string[];
  default_branch: string;
  homepage?: string | null;
}

export function factsFromApi(r: ApiRepo): RepoFacts {
  return {
    fullName: r.full_name,
    ownerType: r.owner.type,
    description: r.description ?? '',
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    archived: r.archived,
    disabled: r.disabled,
    fork: r.fork,
    license: r.license?.spdx_id ?? null,
    language: r.language,
    topics: r.topics ?? [],
    defaultBranch: r.default_branch,
    homepage: r.homepage ?? null,
    scannedAt: new Date().toISOString(),
  };
}

/** Repository search (GitHub search API, 10 requests / min without a token). */
export async function searchRepos(http: GithubHttp, query: string, n = 10): Promise<RepoFacts[]> {
  const r = (await http.json(
    `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${Math.min(30, n)}`,
  )) as { items?: ApiRepo[] } | null;
  return (r?.items ?? []).map(factsFromApi);
}

/** Deep scan: repository, contributors, latest release, manifest, README, file tree, advisories. */
export async function scanRepo(http: GithubHttp, fullName: string): Promise<RepoFacts> {
  const repo = (await http.json(`/repos/${fullName}`)) as ApiRepo | null;
  if (!repo) throw new Error(`Dépôt introuvable : ${fullName}`);
  const f = factsFromApi(repo);
  const raw = (p: string) => `https://raw.githubusercontent.com/${fullName}/${f.defaultBranch}/${p}`;
  const safe = async <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [contrib, rel, pkg, readme, pyproject, tree] = await Promise.all([
    safe(http.json(`/repos/${fullName}/contributors?per_page=100&anon=1`) as Promise<unknown[] | null>),
    safe(
      http.json(`/repos/${fullName}/releases/latest`) as Promise<{
        tag_name: string;
        published_at: string;
      } | null>,
    ),
    safe(http.text(raw('package.json'))),
    safe(http.text(raw('README.md'))),
    safe(http.text(raw('pyproject.toml'))),
    safe(
      http.json(`/repos/${fullName}/git/trees/${f.defaultBranch}?recursive=1`) as Promise<{
        tree?: { path: string }[];
      } | null>,
    ),
  ]);
  f.contributors = Array.isArray(contrib) ? contrib.length : null;
  f.latestRelease = rel ? { tag: rel.tag_name, date: rel.published_at } : null;
  try {
    f.packageJson = pkg ? (JSON.parse(pkg) as PackageJsonLite) : null;
  } catch {
    f.packageJson = null;
  }
  f.readme = readme ? readme.slice(0, 200_000) : null;
  f.pyproject = pyproject;
  f.tree = tree?.tree?.map((t) => t.path).slice(0, 20_000) ?? null;
  const pkgName = f.packageJson?.name;
  if (pkgName) {
    const adv = await safe(
      http.json(`/advisories?ecosystem=npm&affects=${encodeURIComponent(pkgName)}&per_page=20`) as Promise<
        { ghsa_id: string; severity: string; summary: string }[] | null
      >,
    );
    f.advisories = (adv ?? []).map((a) => ({ id: a.ghsa_id, severity: a.severity, summary: a.summary }));
  } else f.advisories = [];
  f.deep = true;
  f.scannedAt = new Date().toISOString();
  return f;
}

/** Searches that feed the discovery screen (capability → GitHub query). */
export const DISCOVERY_QUERIES: { capability: string; query: string }[] = [
  { capability: 'Excel', query: 'mcp server excel in:name,description,topics' },
  { capability: 'PDF', query: 'mcp server pdf in:name,description,topics' },
  { capability: 'Word', query: 'mcp server docx word in:name,description' },
  { capability: 'PowerPoint', query: 'mcp server powerpoint pptx in:name,description' },
  { capability: 'Recherche web', query: 'mcp server web search in:name,description topic:mcp-server' },
  { capability: 'Extraction web', query: 'mcp server scrape crawl in:name,description' },
  { capability: 'Navigateur', query: 'mcp browser automation in:name,description' },
  { capability: 'Données / SQL', query: 'mcp server sql database in:name,description' },
  { capability: 'Visualisation', query: 'mcp server chart visualization in:name,description' },
  { capability: 'OCR', query: 'mcp ocr in:name,description' },
  { capability: 'RAG / vecteurs', query: 'mcp vector search embeddings in:name,description' },
  { capability: 'Agent skills', query: 'agent skills SKILL.md in:readme,description' },
  { capability: 'Finance', query: 'mcp finance in:name,description' },
  { capability: 'Sécurité', query: 'mcp security scanner in:name,description' },
  { capability: 'Observabilité', query: 'mcp observability in:name,description' },
  { capability: 'Tests / QA', query: 'mcp testing qa in:name,description' },
];

/** Discovery that never breaks the app: on any GitHub failure (offline, rate limit) the dated snapshot is used. */
export async function discover(
  http: GithubHttp,
  query: string,
  fallback: RepoFacts[],
  n = 10,
): Promise<{ repos: RepoFacts[]; live: boolean; error: string | null }> {
  try {
    return { repos: await searchRepos(http, query, n), live: true, error: null };
  } catch (e) {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !w.includes(':'));
    const local = fallback.filter((r) =>
      words.some((w) => `${r.fullName} ${r.description}`.toLowerCase().includes(w)),
    );
    return { repos: local, live: false, error: (e as Error).message || String(e) };
  }
}
