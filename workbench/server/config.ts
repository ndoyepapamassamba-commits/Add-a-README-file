import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : !['0', 'false', 'no', 'off', ''].includes(v.toLowerCase()),
  );

const EnvSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  PREVIEW_PORT: z.coerce.number().int().min(0).max(65535).default(8788),
  WORKBENCH_AUTH_TOKEN: z.string().optional(),
  WORKSPACE_ROOT: z.string().default('./workspace'),
  DATA_DIR: z.string().default('./data'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_APP_URL: z.string().default('http://localhost'),
  OPENROUTER_APP_NAME: z.string().default('MASSAMBA Workbench'),
  BRAVE_API_KEY: z.string().optional(),
  BROWSER_ENGINE: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  BROWSER_HEADLESS: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_DIST: z.string().optional(),
  SKILLS_DIRS: z.string().optional(),
  INCLUDE_CLAUDE_SKILLS: bool.default(true),
  /** Public base URL of the preview server when behind port forwarding (e.g. Codespaces). */
  PUBLIC_PREVIEW_URL: z.string().url().optional(),
});

export type AppConfig = {
  host: string;
  port: number;
  previewPort: number;
  publicPreviewUrl: string | undefined;
  authToken: string | undefined;
  workspaceRoot: string;
  dataDir: string;
  openrouterBaseUrl: string;
  appUrl: string;
  appName: string;
  braveApiKey: string | undefined;
  browserEngine: 'chromium' | 'firefox' | 'webkit';
  browserHeadless: boolean;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  webDist: string;
  envFile: string;
  skillsDirs: string[];
  includeClaudeSkills: boolean;
  cwd: string;
};

/** Loads `.env` (if present) then validates the environment. */
export function loadConfig(
  overrides: Partial<Record<keyof z.infer<typeof EnvSchema>, string>> = {},
  cwd = process.cwd(),
): AppConfig {
  const envFile = path.join(cwd, '.env');
  if (fs.existsSync(envFile)) {
    try {
      process.loadEnvFile(envFile);
    } catch (err) {
      console.error(`Could not read ${envFile}:`, err);
    }
  }
  const raw = { ...process.env, ...overrides };
  const env = EnvSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '')));
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.resolve(cwd, p));
  return {
    host: env.HOST,
    port: env.PORT,
    previewPort: env.PREVIEW_PORT,
    publicPreviewUrl: (env.PUBLIC_PREVIEW_URL ?? codespaceUrl(env.PREVIEW_PORT))?.replace(/\/$/, ''),
    authToken: env.WORKBENCH_AUTH_TOKEN || undefined,
    workspaceRoot: abs(env.WORKSPACE_ROOT),
    dataDir: abs(env.DATA_DIR),
    openrouterBaseUrl: env.OPENROUTER_BASE_URL.replace(/\/$/, ''),
    appUrl: env.OPENROUTER_APP_URL,
    appName: env.OPENROUTER_APP_NAME,
    braveApiKey: env.BRAVE_API_KEY || undefined,
    browserEngine: env.BROWSER_ENGINE,
    browserHeadless: env.BROWSER_HEADLESS,
    logLevel: env.LOG_LEVEL,
    webDist: abs(env.WEB_DIST ?? 'dist/web'),
    envFile,
    skillsDirs: (env.SKILLS_DIRS ?? '')
      .split(path.delimiter)
      .map((d) => d.trim())
      .filter(Boolean)
      .map(abs),
    includeClaudeSkills: env.INCLUDE_CLAUDE_SKILLS,
    cwd,
  };
}

export function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(host);
}

/** Forwarded URL of a port when running in GitHub Codespaces (undefined elsewhere). */
export function codespaceUrl(port: number): string | undefined {
  const name = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return name && domain ? `https://${name}-${port}.${domain}` : undefined;
}
