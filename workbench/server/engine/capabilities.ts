// MCP Registry + capability catalog with "free first" ordering.
// For each capability the options are ranked: native → built-in free → mature
// open source → free API → free MCP → free skill → paid (only when it adds
// something). Facts on GitHub repositories come from a dated scan
// (githubSnapshot.json) or from a live re-scan; scores are MASSAMBA scores,
// computed by securityReview — never presented as official ratings.
import snapshot from './githubSnapshot.json';
import { securityReview, type RepoFacts, type SecurityReview } from './github';

export const GITHUB_SNAPSHOT = snapshot as { source: string; scannedAt: string; repos: RepoFacts[] };

export type McpCategory =
  | 'WEB'
  | 'SEARCH'
  | 'BROWSER'
  | 'FILES'
  | 'GITHUB'
  | 'DATABASE'
  | 'SQL'
  | 'EXCEL'
  | 'DOCUMENTS'
  | 'PDF'
  | 'DATA'
  | 'VISUALIZATION'
  | 'EMAIL'
  | 'CALENDAR'
  | 'COMMUNICATION'
  | 'RESEARCH'
  | 'CODING'
  | 'DEVOPS'
  | 'SECURITY'
  | 'OBSERVABILITY'
  | 'FINANCE'
  | 'KNOWLEDGE'
  | 'RAG'
  | 'CREATION';

export interface McpEntry {
  id: string;
  name: string;
  categories: McpCategory[];
  repo: string | null;
  author: string;
  capabilities: string[];
  permissions: string[];
  secrets: string[];
  cost: string;
  /** Where it can run: browser (remote HTTP + CORS), server (local process), both. */
  compatibility: 'direct' | 'server' | 'both';
  transport: 'http' | 'stdio';
  /** Preset id in this application (direct name or server preset id). */
  preset?: string;
  endpoint?: string;
}

export const MCP_CATALOG: McpEntry[] = [
  {
    id: 'context7',
    name: 'Context7',
    categories: ['CODING', 'KNOWLEDGE'],
    repo: 'upstash/context7',
    author: 'Upstash',
    capabilities: ['documentation à jour des bibliothèques'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'both',
    transport: 'http',
    preset: 'context7',
    endpoint: 'https://mcp.context7.com/mcp',
  },
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    categories: ['CODING', 'KNOWLEDGE', 'GITHUB'],
    repo: null,
    author: 'Cognition',
    capabilities: ['questions sur un dépôt GitHub public'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'both',
    transport: 'http',
    preset: 'deepwiki',
    endpoint: 'https://mcp.deepwiki.com/mcp',
  },
  {
    id: 'gitmcp',
    name: 'GitMCP',
    categories: ['CODING', 'GITHUB'],
    repo: 'idosal/git-mcp',
    author: 'idosal',
    capabilities: ['documentation de dépôts'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'both',
    transport: 'http',
    preset: 'gitmcp',
  },
  {
    id: 'github',
    name: 'GitHub (officiel)',
    categories: ['GITHUB', 'DEVOPS', 'CODING'],
    repo: 'github/github-mcp-server',
    author: 'GitHub',
    capabilities: ['issues', 'PR', 'code', 'actions'],
    permissions: ['réseau', 'identifiants'],
    secrets: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    cost: 'gratuit (jeton)',
    compatibility: 'both',
    transport: 'http',
    preset: 'github',
  },
  {
    id: 'playwright',
    name: 'Playwright MCP',
    categories: ['BROWSER', 'WEB'],
    repo: 'microsoft/playwright-mcp',
    author: 'Microsoft',
    capabilities: ['navigation', 'clics', 'formulaires', 'captures'],
    permissions: ['navigateur', 'réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'playwright',
  },
  {
    id: 'fetch',
    name: 'Fetch / Filesystem / Git / Memory (référence)',
    categories: ['WEB', 'FILES', 'KNOWLEDGE'],
    repo: 'modelcontextprotocol/servers',
    author: 'Model Context Protocol',
    capabilities: ['lecture web', 'fichiers', 'git', 'mémoire'],
    permissions: ['réseau', 'fichiers', 'shell'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'fetch',
  },
  {
    id: 'markitdown',
    name: 'MarkItDown',
    categories: ['DOCUMENTS', 'PDF'],
    repo: 'microsoft/markitdown',
    author: 'Microsoft',
    capabilities: ['PDF, Word, PowerPoint, Excel → Markdown'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'markitdown',
  },
  {
    id: 'excel',
    name: 'Excel MCP (haris-musa)',
    categories: ['EXCEL', 'DATA'],
    repo: 'haris-musa/excel-mcp-server',
    author: 'haris-musa',
    capabilities: ['classeurs', 'formules', 'graphiques', 'TCD'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'excel',
  },
  {
    id: 'excel-negokaz',
    name: 'Excel MCP (negokaz)',
    categories: ['EXCEL'],
    repo: 'negokaz/excel-mcp-server',
    author: 'negokaz',
    capabilities: ['lecture / écriture Excel'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
  },
  {
    id: 'word',
    name: 'Word MCP (GongRzhe)',
    categories: ['DOCUMENTS'],
    repo: 'GongRzhe/Office-Word-MCP-Server',
    author: 'GongRzhe',
    capabilities: ['documents Word'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'word',
  },
  {
    id: 'powerpoint',
    name: 'PowerPoint MCP (GongRzhe)',
    categories: ['DOCUMENTS'],
    repo: 'GongRzhe/Office-PowerPoint-MCP-Server',
    author: 'GongRzhe',
    capabilities: ['présentations'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'powerpoint',
  },
  {
    id: 'chart',
    name: 'AntV Charts',
    categories: ['VISUALIZATION', 'DATA'],
    repo: 'antvis/mcp-server-chart',
    author: 'AntV (Ant Group)',
    capabilities: ['25+ graphiques'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'antv',
  },
  {
    id: 'duckdb',
    name: 'DuckDB / MotherDuck',
    categories: ['SQL', 'DATABASE', 'DATA'],
    repo: 'motherduckdb/mcp-server-motherduck',
    author: 'MotherDuck',
    capabilities: ['SQL analytique local sur CSV / Parquet'],
    permissions: ['fichiers'],
    secrets: [],
    cost: 'gratuit (local)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'duckdb',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    categories: ['DATABASE'],
    repo: 'mongodb-js/mongodb-mcp-server',
    author: 'MongoDB',
    capabilities: ['requêtes', 'Atlas'],
    permissions: ['réseau', 'identifiants', 'base de données'],
    secrets: ['MDB_MCP_CONNECTION_STRING'],
    cost: 'gratuit (votre base)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'mongodb',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    categories: ['DATABASE', 'SQL', 'DEVOPS'],
    repo: 'supabase/mcp',
    author: 'Supabase',
    capabilities: ['SQL', 'migrations', 'edge functions', 'logs'],
    permissions: ['réseau', 'identifiants', 'base de données'],
    secrets: ['SUPABASE_ACCESS_TOKEN'],
    cost: 'offre gratuite',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'supabase',
  },
  {
    id: 'chroma',
    name: 'Chroma',
    categories: ['RAG', 'KNOWLEDGE'],
    repo: 'chroma-core/chroma-mcp',
    author: 'Chroma',
    capabilities: ['recherche vectorielle'],
    permissions: ['fichiers', 'base de données'],
    secrets: [],
    cost: 'gratuit (local)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'chroma',
  },
  {
    id: 'notion',
    name: 'Notion (officiel)',
    categories: ['KNOWLEDGE', 'COMMUNICATION'],
    repo: 'makenotion/notion-mcp-server',
    author: 'Notion',
    capabilities: ['pages', 'bases'],
    permissions: ['réseau', 'identifiants'],
    secrets: ['NOTION_TOKEN'],
    cost: 'gratuit (jeton)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'notion-token',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    categories: ['SEARCH', 'WEB'],
    repo: 'tavily-ai/tavily-mcp',
    author: 'Tavily',
    capabilities: ['recherche', 'extraction'],
    permissions: ['réseau'],
    secrets: ['TAVILY_API_KEY'],
    cost: 'offre gratuite avec clé',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'tavily',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    categories: ['SEARCH'],
    repo: 'brave/brave-search-mcp-server',
    author: 'Brave',
    capabilities: ['web', 'actualités', 'images'],
    permissions: ['réseau'],
    secrets: ['BRAVE_API_KEY'],
    cost: 'offre gratuite avec clé',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'brave',
  },
  {
    id: 'exa',
    name: 'Exa',
    categories: ['SEARCH', 'RESEARCH'],
    repo: 'exa-labs/exa-mcp-server',
    author: 'Exa',
    capabilities: ['recherche sémantique'],
    permissions: ['réseau'],
    secrets: ['EXA_API_KEY'],
    cost: 'payant (crédits d’essai)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'exa',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    categories: ['WEB', 'SEARCH'],
    repo: 'firecrawl/firecrawl-mcp-server',
    author: 'Firecrawl',
    capabilities: ['scraping', 'crawl'],
    permissions: ['réseau'],
    secrets: ['FIRECRAWL_API_KEY'],
    cost: 'payant (crédits d’essai)',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'firecrawl',
  },
  {
    id: 'blender',
    name: 'Blender MCP',
    categories: ['CREATION'],
    repo: 'ahujasid/mcp-for-blender',
    author: 'ahujasid',
    capabilities: ['scènes 3D', 'rendu', 'scripts bpy'],
    permissions: ['shell', 'réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'blender',
  },
  {
    id: 'ableton',
    name: 'Ableton MCP',
    categories: ['CREATION'],
    repo: 'ahujasid/ableton-mcp',
    author: 'ahujasid',
    capabilities: ['pistes', 'clips'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'server',
    transport: 'stdio',
    preset: 'ableton',
  },
  {
    id: 'jina',
    name: 'Jina (lecture web)',
    categories: ['WEB'],
    repo: null,
    author: 'Jina AI',
    capabilities: ['page web → texte'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit (limite de débit)',
    compatibility: 'both',
    transport: 'http',
    preset: 'jina',
    endpoint: 'https://mcp.jina.ai/v1',
  },
  {
    id: 'mslearn',
    name: 'Microsoft Learn',
    categories: ['KNOWLEDGE', 'CODING'],
    repo: null,
    author: 'Microsoft',
    capabilities: ['documentation Microsoft'],
    permissions: ['réseau'],
    secrets: [],
    cost: 'gratuit',
    compatibility: 'both',
    transport: 'http',
    preset: 'microsoft-learn',
  },
];

export interface McpView extends McpEntry {
  license: string;
  version: string;
  lastUpdate: string | null;
  review: SecurityReview | null;
  /** Score of a hosted service whose code cannot be audited (declared permissions only). */
  declared: number | null;
  status: 'RECOMMANDÉ' | 'ACCEPTABLE' | 'REVUE REQUISE' | 'À ÉVITER' | 'SERVICE HÉBERGÉ';
  replacedBy?: string;
}

/** Score for a hosted service: only its declared permissions are known. */
function declaredScore(e: McpEntry): number {
  return Math.max(40, 74 - e.permissions.length * 4 - e.secrets.length * 4);
}

/** MCP registry rows with facts from the GitHub scan (live scans override the snapshot). */
export function mcpRegistry(overrides: Record<string, RepoFacts> = {}, now = Date.now()): McpView[] {
  const byRepo = new Map(GITHUB_SNAPSHOT.repos.map((r) => [r.fullName.toLowerCase(), r]));
  const views = MCP_CATALOG.map((e): McpView => {
    const f = e.repo ? (overrides[e.repo.toLowerCase()] ?? byRepo.get(e.repo.toLowerCase())) : undefined;
    if (!f)
      return {
        ...e,
        license: e.repo ? 'non scanné' : 'service hébergé',
        version: '—',
        lastUpdate: null,
        review: null,
        declared: declaredScore(e),
        status: 'SERVICE HÉBERGÉ',
      };
    const rv = securityReview(f, now);
    return {
      ...e,
      license: f.license ?? 'aucune',
      version: f.latestRelease?.tag ?? `commit ${f.pushedAt.slice(0, 10)}`,
      lastUpdate: f.pushedAt.slice(0, 10),
      review: rv,
      declared: null,
      status:
        rv.score < 60
          ? 'À ÉVITER'
          : rv.score < 75
            ? 'REVUE REQUISE'
            : rv.score >= 80
              ? 'RECOMMANDÉ'
              : 'ACCEPTABLE',
    };
  });
  // Rejected entries point to the best safe alternative in the same category.
  for (const v of views)
    if (v.status === 'À ÉVITER') {
      const alt = views.find(
        (o) => o !== v && o.status !== 'À ÉVITER' && o.categories.some((c) => v.categories.includes(c)),
      );
      if (alt) v.replacedBy = alt.name;
    }
  return views;
}

// ── Capabilities: free-first options ───────────────────────────────────────
export type OptionKind = 'native' | 'builtin' | 'opensource' | 'free_api' | 'mcp' | 'skill' | 'paid';
export const KIND_ORDER: OptionKind[] = [
  'native',
  'builtin',
  'opensource',
  'free_api',
  'mcp',
  'skill',
  'paid',
];
export const KIND_LABEL: Record<OptionKind, string> = {
  native: 'natif MASSAMBA',
  builtin: 'intégré gratuit',
  opensource: 'open source',
  free_api: 'API gratuite',
  mcp: 'MCP gratuit',
  skill: 'skill gratuit',
  paid: 'payant',
};

export interface CapabilityOption {
  capability: string;
  name: string;
  kind: OptionKind;
  tool?: string;
  cost: string;
  freeLimit: string;
  rateLimit: string;
  /** MASSAMBA estimates 0-100 (declared behaviour, not an audit). */
  security: number;
  quality: number;
  latency: 'immédiate' | 'faible' | 'moyenne' | 'élevée';
  maintenance: string;
  dependency: string;
  edition: 'direct' | 'server' | 'both';
}

const N = (o: Omit<CapabilityOption, 'kind'> & { kind?: OptionKind }): CapabilityOption => ({
  kind: 'native',
  ...o,
});

export const CAPABILITY_OPTIONS: CapabilityOption[] = [
  N({
    capability: 'Excel / CSV',
    name: 'data.inspect / data.query / data.export',
    tool: 'data.query',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 88,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'SheetJS (embarqué)',
    edition: 'both',
  }),
  N({
    capability: 'Excel / CSV',
    name: 'Python pandas (pack hors-ligne)',
    kind: 'builtin',
    tool: 'code.run',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 90,
    latency: 'moyenne',
    maintenance: 'Pyodide',
    dependency: 'pack Python importé ou CDN',
    edition: 'direct',
  }),
  N({
    capability: 'Excel / CSV',
    name: 'Excel MCP (haris-musa)',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 75,
    quality: 80,
    latency: 'faible',
    maintenance: 'communauté',
    dependency: 'uv + Python',
    edition: 'server',
  }),
  N({
    capability: 'PDF',
    name: 'filesystem.read (pdf.js embarqué)',
    tool: 'filesystem.read',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 82,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'pdf.js (embarqué)',
    edition: 'both',
  }),
  N({
    capability: 'PDF',
    name: 'pypdf (pack Python)',
    kind: 'opensource',
    tool: 'code.run',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 80,
    latency: 'moyenne',
    maintenance: 'py-pdf (BSD)',
    dependency: 'pack Python',
    edition: 'direct',
  }),
  N({
    capability: 'PDF',
    name: 'MarkItDown MCP',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 80,
    quality: 85,
    latency: 'faible',
    maintenance: 'Microsoft',
    dependency: 'Python',
    edition: 'server',
  }),
  N({
    capability: 'Word / PowerPoint',
    name: 'report.export (docx / pdf / eml maison)',
    tool: 'report.export',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 85,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'embarqué',
    edition: 'both',
  }),
  N({
    capability: 'Word / PowerPoint',
    name: 'apex.build_app (exports PPT / Word du kit)',
    tool: 'apex.build_app',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 88,
    latency: 'faible',
    maintenance: 'MASSAMBA',
    dependency: 'kit maison',
    edition: 'both',
  }),
  N({
    capability: 'Recherche web',
    name: 'web.search (plugin web OpenRouter)',
    tool: 'web.search',
    kind: 'paid',
    cost: 'facturé par OpenRouter (par résultat web) + modèle',
    freeLimit: 'aucune',
    rateLimit: 'celle d’OpenRouter',
    security: 85,
    quality: 85,
    latency: 'moyenne',
    maintenance: 'OpenRouter',
    dependency: 'clé OpenRouter',
    edition: 'both',
  }),
  N({
    capability: 'Recherche web',
    name: 'wikipedia.search / papers.search',
    tool: 'wikipedia.search',
    kind: 'free_api',
    cost: '0 $',
    freeLimit: 'usage raisonnable',
    rateLimit: 'politesse API',
    security: 92,
    quality: 70,
    latency: 'faible',
    maintenance: 'Wikimedia / Crossref',
    dependency: 'Internet',
    edition: 'direct',
  }),
  N({
    capability: 'Recherche web',
    name: 'Tavily MCP',
    kind: 'paid',
    cost: 'offre gratuite puis payant',
    freeLimit: 'quota mensuel du fournisseur',
    rateLimit: 'fournisseur',
    security: 78,
    quality: 85,
    latency: 'faible',
    maintenance: 'Tavily',
    dependency: 'clé TAVILY_API_KEY',
    edition: 'server',
  }),
  N({
    capability: 'Lecture de page web',
    name: 'browser.open (lecteur r.jina.ai)',
    tool: 'browser.open',
    kind: 'free_api',
    cost: '0 $',
    freeLimit: 'sans clé',
    rateLimit: 'limité par IP (fournisseur)',
    security: 85,
    quality: 78,
    latency: 'moyenne',
    maintenance: 'Jina AI',
    dependency: 'Internet',
    edition: 'direct',
  }),
  N({
    capability: 'Navigateur / tests d’app',
    name: 'browser.* (navigateur intégré)',
    tool: 'browser.snapshot',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 85,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'aucune',
    edition: 'direct',
  }),
  N({
    capability: 'Navigateur / tests d’app',
    name: 'Playwright MCP',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 82,
    quality: 92,
    latency: 'faible',
    maintenance: 'Microsoft',
    dependency: 'Node + Chromium',
    edition: 'server',
  }),
  N({
    capability: 'Exécution de code',
    name: 'code.run / terminal (JavaScript)',
    tool: 'code.run',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 85,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'bac à sable iframe',
    edition: 'direct',
  }),
  N({
    capability: 'Exécution de code',
    name: 'Python (Pyodide)',
    kind: 'builtin',
    tool: 'code.run',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 92,
    quality: 85,
    latency: 'moyenne',
    maintenance: 'Pyodide',
    dependency: 'pack hors-ligne ou CDN',
    edition: 'direct',
  }),
  N({
    capability: 'Graphiques / diagrammes',
    name: 'data.chart',
    tool: 'data.chart',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 80,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'embarqué',
    edition: 'both',
  }),
  N({
    capability: 'Graphiques / diagrammes',
    name: 'diagram.render (Kroki)',
    tool: 'diagram.render',
    kind: 'builtin',
    cost: '0 $',
    freeLimit: 'usage raisonnable',
    rateLimit: 'kroki.io',
    security: 85,
    quality: 82,
    latency: 'faible',
    maintenance: 'Kroki',
    dependency: 'Internet',
    edition: 'direct',
  }),
  N({
    capability: 'Images',
    name: 'image.generate (Pollinations)',
    tool: 'image.generate',
    kind: 'builtin',
    cost: '0 $',
    freeLimit: 'sans clé',
    rateLimit: 'fournisseur',
    security: 78,
    quality: 65,
    latency: 'élevée',
    maintenance: 'Pollinations',
    dependency: 'Internet (prompt envoyé au service)',
    edition: 'direct',
  }),
  N({
    capability: 'Taux de change / macro',
    name: 'fx.rates / worldbank.indicator',
    tool: 'fx.rates',
    kind: 'builtin',
    cost: '0 $',
    freeLimit: 'sans clé',
    rateLimit: 'fournisseur',
    security: 92,
    quality: 85,
    latency: 'faible',
    maintenance: 'Frankfurter / Banque mondiale',
    dependency: 'Internet',
    edition: 'direct',
  }),
  N({
    capability: 'Scénarios / décision',
    name: 'decision.simulate',
    tool: 'decision.simulate',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 98,
    quality: 85,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'aucune',
    edition: 'both',
  }),
  N({
    capability: '3D',
    name: 'blender.scene (Studio 3D)',
    tool: 'blender.scene',
    kind: 'builtin',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 78,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'three.js (embarqué)',
    edition: 'direct',
  }),
  N({
    capability: '3D',
    name: 'Blender MCP',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 70,
    quality: 88,
    latency: 'faible',
    maintenance: 'communauté',
    dependency: 'Blender + add-on + uv',
    edition: 'server',
  }),
  N({
    capability: 'Documentation de code',
    name: 'Context7',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'sans clé',
    rateLimit: 'fournisseur',
    security: 85,
    quality: 85,
    latency: 'faible',
    maintenance: 'Upstash',
    dependency: 'Internet',
    edition: 'both',
  }),
  N({
    capability: 'SQL analytique',
    name: 'data.query (moteur intégré)',
    tool: 'data.query',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 95,
    quality: 82,
    latency: 'immédiate',
    maintenance: 'MASSAMBA',
    dependency: 'aucune',
    edition: 'both',
  }),
  N({
    capability: 'SQL analytique',
    name: 'DuckDB MCP',
    kind: 'mcp',
    cost: '0 $',
    freeLimit: 'illimité',
    rateLimit: '—',
    security: 80,
    quality: 90,
    latency: 'faible',
    maintenance: 'MotherDuck',
    dependency: 'Python',
    edition: 'server',
  }),
];

/** Options for a capability, free and native first, then by quality. */
export function optionsFor(capability: string, edition?: 'direct' | 'server'): CapabilityOption[] {
  return CAPABILITY_OPTIONS.filter(
    (o) => o.capability === capability && (!edition || o.edition === 'both' || o.edition === edition),
  ).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.quality - a.quality);
}
export const CAPABILITIES = [...new Set(CAPABILITY_OPTIONS.map((o) => o.capability))];
