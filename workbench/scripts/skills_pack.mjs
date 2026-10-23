// Builds dist/massamba-skills*.js (23/10/2026, « lui donner tous les skills de cette discussion ») : EVERY skill, slash
// command and agent of the agent environment, so the Workbench carries the same know-how as the agent that builds it.
// Sources, first one wins on a name clash:
//   1. the project skills (<repo>/.claude/skills) — they are also embedded in the app (builtinSkills.ts), the pack adds
//      the files of every format the app embedding leaves out (scripts, YAML, HTML, images…);
//   2. the user skills (~/.claude/skills, the REA / greffe / méthode / zéro-limite rules…);
//   3. the synced organisation skills (~/.claude/skills/synced/*) named « anthropic-skills:<name> » as in the session;
//   4. the plugins (~/.claude/plugins/synced/*/*, ~/.claude/plugins/cache/*/*/*): skills « <plugin>:<name> », their
//      commands/*.md and agents (agents/*.md or agents/<name>/AGENT.md).
// No file-format requirement (« enlève les exigences de format de fichier ») : every file of a skill folder is kept —
// text as text, binaries as base64 — within per-file ceilings; what is left out is listed with its size, never hidden.
// Secrets are scrubbed before writing. The output lands in dist/ (ignored by git: the repository is public, some of
// these skills belong to the user's organisation) and is delivered next to the app, like massamba-troupe-film.js.
//   node scripts/skills_pack.mjs            (extra roots: MASSAMBA_SKILLS_DIRS=dir1:dir2)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const HOME = os.homedir();
const OUT_DIR = path.resolve(HERE, '..', 'dist');
const PART_LIMIT = 26 * 1024 * 1024; // each delivered file stays under 30 MiB
const TEXT_MAX = 2_000_000;
const BIN_MAX = 1_500_000;
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.trash',
  '.cursor',
  'inactive-skills',
]);
const SECRET_RES = [
  /sk-or-v1-[A-Za-z0-9]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9]{32,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bhf_[A-Za-z0-9]{30,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
let scrubbed = 0;

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const ls = (p) => (isDir(p) ? fs.readdirSync(p).sort() : []);
function meta(md) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  try {
    const y = parseYaml(m[1]);
    return y && typeof y === 'object' ? y : {};
  } catch {
    return {};
  }
}
function scrub(text) {
  let out = text;
  for (const re of SECRET_RES)
    out = out.replace(re, () => {
      scrubbed++;
      return '[secret retiré]';
    });
  return out;
}
/** A buffer is text when it has no NUL byte and decodes as UTF-8 without replacement characters. */
function asText(buf) {
  if (buf.subarray(0, 8000).includes(0)) return null;
  const s = buf.toString('utf8');
  return s.includes('�') ? null : s;
}

/** Every file of a skill folder, whatever its format. */
function readFolder(dir, main) {
  const files = {};
  const bin = {};
  const omitted = [];
  const walk = (d, rel) => {
    for (const name of ls(d)) {
      const p = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (isDir(p)) {
        if (!SKIP_DIRS.has(name)) walk(p, r);
        continue;
      }
      if (r === main || name === '.DS_Store') continue;
      const size = fs.statSync(p).size;
      const buf = fs.readFileSync(p);
      const text = asText(buf);
      if (text !== null) {
        if (size > TEXT_MAX) omitted.push({ path: r, size, reason: 'texte trop long' });
        else files[r] = scrub(text);
      } else if (size > BIN_MAX) omitted.push({ path: r, size, reason: 'binaire trop lourd' });
      else bin[r] = buf.toString('base64');
    }
  };
  walk(dir, '');
  return { files, bin, omitted };
}

const skills = [];
const commands = [];
const agents = [];
const seen = new Set();
const clash = [];

function addSkill(dir, name, source, extra = {}) {
  const mdPath = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(mdPath)) return;
  if (seen.has(name)) return void clash.push(`${name} (${source})`);
  seen.add(name);
  const { files, bin, omitted } = readFolder(dir, 'SKILL.md');
  skills.push({ name, source, ...extra, md: scrub(fs.readFileSync(mdPath, 'utf8')), files, bin, omitted });
}
/** A folder of skill folders (or a skill folder itself). */
function addSkillRoot(root, source, prefix = '', extra = {}) {
  if (fs.existsSync(path.join(root, 'SKILL.md'))) {
    const md = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
    const n = String(meta(md).name ?? path.basename(root)).trim();
    return addSkill(root, `${prefix}${n}`, source, extra);
  }
  for (const d of ls(root)) {
    const p = path.join(root, d);
    if (!isDir(p) || SKIP_DIRS.has(d) || d === 'synced') continue;
    if (!fs.existsSync(path.join(p, 'SKILL.md'))) continue;
    const md = fs.readFileSync(path.join(p, 'SKILL.md'), 'utf8');
    const n = String(meta(md).name ?? d).trim() || d;
    addSkill(p, `${prefix}${n}`, source, extra);
  }
}
function addPlugin(dir, source) {
  let pj = {};
  try {
    pj = JSON.parse(fs.readFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
  } catch {
    /* a plugin without manifest takes its folder name */
  }
  const plugin = String(pj.name ?? path.basename(dir).replace(/~g\d+$/, ''));
  const extra = {
    plugin,
    license: fs.existsSync(path.join(dir, 'LICENSE')) ? 'voir LICENSE du plugin' : undefined,
  };
  const roots = pj.skills ? (Array.isArray(pj.skills) ? pj.skills : [pj.skills]) : ['skills'];
  for (const r of roots) addSkillRoot(path.resolve(dir, String(r)), source, `${plugin}:`, extra);
  for (const f of ls(path.join(dir, 'commands')))
    if (f.endsWith('.md'))
      commands.push({
        name: `${plugin}:${f.replace(/\.md$/, '')}`,
        source,
        md: scrub(fs.readFileSync(path.join(dir, 'commands', f), 'utf8')),
      });
  for (const a of ls(path.join(dir, 'agents'))) {
    const p = path.join(dir, 'agents', a);
    const file = isDir(p) ? path.join(p, 'AGENT.md') : a.endsWith('.md') ? p : null;
    if (file && fs.existsSync(file))
      agents.push({
        name: `${plugin}:${a.replace(/\.md$/, '')}`,
        source,
        md: scrub(fs.readFileSync(file, 'utf8')),
      });
  }
}

addSkillRoot(path.join(REPO, '.claude', 'skills'), 'projet');
addSkillRoot(path.join(HOME, '.claude', 'skills'), 'utilisateur');
for (const d of ls(path.join(HOME, '.claude', 'skills', 'synced')))
  addSkillRoot(path.join(HOME, '.claude', 'skills', 'synced', d), 'organisation', 'anthropic-skills:');
for (const org of ls(path.join(HOME, '.claude', 'plugins', 'synced')))
  for (const p of ls(path.join(HOME, '.claude', 'plugins', 'synced', org))) {
    const dir = path.join(HOME, '.claude', 'plugins', 'synced', org, p);
    if (isDir(dir) && !p.startsWith('.')) addPlugin(dir, 'plugin');
  }
for (const market of ls(path.join(HOME, '.claude', 'plugins', 'cache')))
  for (const p of ls(path.join(HOME, '.claude', 'plugins', 'cache', market)))
    for (const v of ls(path.join(HOME, '.claude', 'plugins', 'cache', market, p)))
      addPlugin(path.join(HOME, '.claude', 'plugins', 'cache', market, p, v), 'plugin');
for (const extra of (process.env.MASSAMBA_SKILLS_DIRS ?? '').split(':').filter(Boolean))
  addSkillRoot(extra, 'ajout');
for (const f of ls(path.join(REPO, '.claude', 'commands')))
  if (f.endsWith('.md'))
    commands.push({
      name: f.replace(/\.md$/, ''),
      source: 'projet',
      md: fs.readFileSync(path.join(REPO, '.claude', 'commands', f), 'utf8'),
    });

// Parts under the delivery ceiling: the first part carries the counts, the app loads the others by name.
// Version = fingerprint of the content (not the build time): an unchanged pack keeps its bytes, so « A ENVOYER » only
// lists it when a skill, command or agent really changed, and the app reinstalls it only then.
const version = crypto
  .createHash('sha256')
  .update(JSON.stringify({ skills, commands, agents }))
  .digest('hex')
  .slice(0, 12);
const partName = (i) => (i === 0 ? 'massamba-skills.js' : `massamba-skills-${i + 1}.js`);
const parts = [{ skills: [], commands, agents }];
let size = Buffer.byteLength(JSON.stringify({ commands, agents }));
for (const s of skills) {
  const n = Buffer.byteLength(JSON.stringify(s));
  if (size + n > PART_LIMIT && parts.at(-1).skills.length) {
    parts.push({ skills: [], commands: [], agents: [] });
    size = 0;
  }
  parts.at(-1).skills.push(s);
  size += n;
}
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR))
  if (/^massamba-skills(-\d+)?\.js$/.test(f)) fs.rmSync(path.join(OUT_DIR, f));
parts.forEach((p, i) => {
  const body = { version, part: i + 1, of: parts.length, files: parts.map((_, j) => partName(j)), ...p };
  const js = `(window.MASSAMBA_SKILLS_PARTS=window.MASSAMBA_SKILLS_PARTS||[]).push(${JSON.stringify(body)});\n`;
  fs.writeFileSync(path.join(OUT_DIR, partName(i)), js);
});
const bytes = parts.reduce((a, _, i) => a + fs.statSync(path.join(OUT_DIR, partName(i))).size, 0);
const omitted = skills.flatMap((s) =>
  s.omitted.map((o) => `${s.name}/${o.path} (${(o.size / 1048576).toFixed(1)} Mio, ${o.reason})`),
);
console.log(
  `paquet des compétences → ${parts.map((_, i) => partName(i)).join(', ')} : ${skills.length} compétences, ${commands.length} commandes, ${agents.length} agents, ` +
    `${skills.reduce((a, s) => a + Object.keys(s.files).length + Object.keys(s.bin).length, 0)} fichiers joints, ${(bytes / 1048576).toFixed(1)} Mio` +
    `${scrubbed ? `, ${scrubbed} secret(s) retiré(s)` : ''}${clash.length ? `, ${clash.length} doublon(s) ignoré(s)` : ''}`,
);
if (omitted.length) console.log(`fichiers laissés de côté (taille) : ${omitted.join(' ; ')}`);
