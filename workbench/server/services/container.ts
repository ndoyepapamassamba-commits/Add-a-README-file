import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AppConfig } from '../config';
import { openDatabase, type DB } from '../db/database';
import { Repo } from '../db/repo';
import { ModelCatalog } from '../llm/catalog';
import { OpenRouterProvider } from '../llm/openrouter';
import { LLMService } from '../llm/service';
import type { LLMProvider } from '../llm/types';
import { ArtifactService } from './artifacts';
import { BrowserManager } from './browserManager';
import { DataEngine } from './dataEngine';
import { GitService } from './git';
import { MemoryService } from './memory';
import { ProcessManager } from './processManager';
import { ProjectIndex, hasRipgrep } from './projectIndex';
import { SettingsService } from './settings';
import { SkillRegistry } from './skills';
import { McpManager } from './mcp';
import { JevService } from './jev';
import { WebSearchService } from './webSearch';
import { WorkspaceService } from './workspace';

export interface Services {
  config: AppConfig;
  db: DB;
  repo: Repo;
  settings: SettingsService;
  workspace: WorkspaceService;
  processes: ProcessManager;
  git: GitService;
  browser: BrowserManager;
  data: DataEngine;
  memory: MemoryService;
  artifacts: ArtifactService;
  search: WebSearchService;
  index: ProjectIndex;
  provider: LLMProvider;
  catalog: ModelCatalog;
  llm: LLMService;
  skills: SkillRegistry;
  mcp: McpManager;
  jev: JevService;
  capabilities: { python: boolean; ripgrep: boolean };
}

export function createServices(config: AppConfig, overrides: { provider?: LLMProvider } = {}): Services {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(config.dataDir);
  const repo = new Repo(db);
  repo.failOrphanRuns();
  const settings = new SettingsService(repo);
  const workspace = new WorkspaceService(config.workspaceRoot, repo);
  const provider =
    overrides.provider ??
    new OpenRouterProvider({
      baseUrl: config.openrouterBaseUrl,
      appUrl: config.appUrl,
      appName: config.appName,
      getApiKey: () => process.env.OPENROUTER_API_KEY || undefined,
    });
  const catalog = new ModelCatalog(provider, path.join(config.dataDir, 'models-cache.json'));
  const llm = new LLMService(provider, catalog, repo, settings);
  const browser = new BrowserManager({
    engine: config.browserEngine,
    headless: config.browserHeadless,
    blockedPorts: [config.port],
  });
  const python = (() => {
    try {
      return spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0;
    } catch {
      return false;
    }
  })();
  return {
    config,
    db,
    repo,
    settings,
    workspace,
    processes: new ProcessManager(),
    git: new GitService(),
    browser,
    data: new DataEngine(),
    memory: new MemoryService(workspace),
    artifacts: new ArtifactService(repo, workspace, (html) => browser.htmlToPdf(html)),
    search: new WebSearchService(llm, settings, config.braveApiKey),
    index: new ProjectIndex(workspace),
    provider,
    catalog,
    llm,
    mcp: new McpManager({
      dataDir: config.dataDir,
      cwd: config.workspaceRoot,
      callbackBase: () => `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`,
    }),
    jev: new JevService(),
    skills: new SkillRegistry({
      dataDir: config.dataDir,
      cwd: config.cwd,
      extraDirs: config.skillsDirs,
      includeClaudeHome: config.includeClaudeSkills,
    }),
    capabilities: { python, ripgrep: hasRipgrep() },
  };
}
