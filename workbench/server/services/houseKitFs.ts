// Finds and loads the user's house kit (the "ecobank-god-export-studio" skill)
// from disk. Used by the server at run time and by the direct build (Vite).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HouseKit } from './apexCore';

const KIT_SKILL = 'ecobank-god-export-studio';
const DOMAIN_SKILL = 'ecobank-credit-risk-engine';

function findDir(root: string, name: string, depth = 3): string | null {
  if (depth < 0 || !fs.existsSync(root)) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) if (e.isDirectory() && e.name === name) return path.join(root, e.name);
  for (const e of entries)
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      const hit = findDir(path.join(root, e.name), name, depth - 1);
      if (hit) return hit;
    }
  return null;
}

/** HOUSE_KIT_DIR, else the skill folder under ~/.claude/skills (any depth ≤ 3). */
export function findHouseKitDir(): string | null {
  const env = process.env.HOUSE_KIT_DIR;
  if (env) return fs.existsSync(path.join(env, 'assets/template/shell.html')) ? env : null;
  if (process.env.HOUSE_KIT === 'off') return null;
  return findDir(path.join(os.homedir(), '.claude/skills'), KIT_SKILL);
}

export function loadHouseKit(dir: string | null = findHouseKitDir()): HouseKit | null {
  if (!dir) return null;
  const r = (p: string) => fs.readFileSync(path.join(dir, p), 'utf8');
  try {
    const domain: Record<string, string> = {};
    const domainDir = path.join(path.dirname(dir), DOMAIN_SKILL);
    if (fs.existsSync(path.join(domainDir, 'SKILL.md'))) {
      domain['credit-risk'] = fs.readFileSync(path.join(domainDir, 'SKILL.md'), 'utf8');
      const refs = path.join(domainDir, 'references');
      if (fs.existsSync(refs))
        for (const f of fs.readdirSync(refs).filter((x) => x.endsWith('.md')))
          domain[f.replace(/\.md$/, '')] = fs.readFileSync(path.join(refs, f), 'utf8');
    }
    return {
      skill: r('SKILL.md'),
      domain,
      shell: r('assets/template/shell.html'),
      kitJs: `${r('assets/kit/g3_xlsx_kit.js')}\n${r('assets/kit/pipeline_word_mail_ppt_kit.js')}`,
      logoB64: r('assets/kit/logo_ecobank_png.b64'),
      vendor: {
        xlsx: r('assets/vendor/xlsx-js-style.min.js'),
        chart: r('assets/vendor/chart.umd.min.js'),
        zip: r('assets/vendor/jszip-pptxgen.min.js'),
      },
      example: r('references/exemple_deal_pipe_app.js'),
      source: KIT_SKILL,
    };
  } catch {
    return null;
  }
}
