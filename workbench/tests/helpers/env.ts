import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type AppConfig } from '../../server/config';

/** Isolated temp workspace + data dir per test file. */
export function tempEnv(
  name: string,
  overrides: Record<string, string> = {},
): { config: AppConfig; root: string; cleanup: () => void } {
  // Tests talk to a local mock provider: never send a real key there.
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-mock-0000000000000000000000000000000000000000';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `wb-${name}-`));
  const ws = path.join(root, 'workspace');
  const data = path.join(root, 'data');
  fs.mkdirSync(path.join(ws, 'demo'), { recursive: true });
  const config = loadConfig(
    {
      WORKSPACE_ROOT: ws,
      DATA_DIR: data,
      PORT: '0',
      PREVIEW_PORT: '0',
      LOG_LEVEL: 'silent',
      WORKBENCH_AUTH_TOKEN: 'test-token-0123456789abcdef',
      INCLUDE_CLAUDE_SKILLS: 'false',
      ...overrides,
    },
    root,
  );
  return { config, root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export async function waitFor<T>(
  fn: () => T | undefined | null | false | Promise<T | undefined | null | false>,
  timeoutMs = 20_000,
  intervalMs = 50,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
