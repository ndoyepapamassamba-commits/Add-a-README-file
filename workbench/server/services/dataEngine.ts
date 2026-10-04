import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { DataCore, type Dataset } from './dataCore';

export * from './dataCore';

/** File-backed data engine with a small LRU cache. */
export class DataEngine extends DataCore {
  private cache = new Map<string, Dataset>();

  async sheetNames(absPath: string): Promise<string[]> {
    return this.sheetNamesOf(absPath, await fsp.readFile(absPath));
  }

  async load(absPath: string, sheet?: string | null): Promise<Dataset> {
    const st = await fsp.stat(absPath);
    const key = `${absPath}|${st.mtimeMs}|${sheet ?? ''}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    if (st.size > 200 * 1024 * 1024) throw new Error('File too large for in-memory analysis (>200 MB)');
    const ds = this.parseBytes(absPath, await fsp.readFile(absPath), sheet ?? null);
    this.cache.set(key, ds);
    while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
    return ds;
  }

  override exportRows(
    columns: string[],
    rows: Record<string, unknown>[],
    format: 'csv' | 'xlsx' | 'json',
  ): Buffer {
    return Buffer.from(super.exportRows(columns, rows, format));
  }

  invalidate(absPath: string): void {
    for (const k of this.cache.keys()) if (k.startsWith(`${absPath}|`)) this.cache.delete(k);
  }
}

export function fileExists(p: string): boolean {
  return fs.existsSync(p);
}
