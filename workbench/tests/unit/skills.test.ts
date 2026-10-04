import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SkillRegistry,
  extractTriggers,
  mapAgentTools,
  parseFrontmatter,
} from '../../server/services/skills';
import { resolveRole } from '../../server/agent/roles';
import { ALL_TOOLS } from '../../server/tools/registry';

let root: string;
let registry: SkillRegistry;
const known = new Set(ALL_TOOLS.map((t) => t.name));

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-skills-'));
  const skillDir = path.join(root, 'cwd', 'skills', 'email-drafter');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: email-drafter\ndescription: Rédige des emails. Se déclenche aussi avec "écrire un email", "rédiger un mail", "relance client".\n---\n\n# Email Drafter\n\nToujours proposer un objet.\n',
  );
  fs.writeFileSync(path.join(skillDir, 'references', 'ton.md'), 'Ton cordial.');
  const risk = path.join(root, 'cwd', 'skills', 'risk');
  fs.mkdirSync(path.join(risk, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(risk, 'SKILL.md'),
    "---\nname: credit-risk\ndescription: Risque de crédit. Se declenche des que l'utilisateur mentionne IFRS9, BCEAO, NPL, provisions.\n---\nBody",
  );
  fs.writeFileSync(path.join(risk, 'agents', 'auditor.md'), '# Auditeur\n\nVérifie les provisions.');
  fs.mkdirSync(path.join(root, 'data', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'data', 'agents', 'analyste.md'),
    '---\nname: Analyste\ndescription: Analyse de portefeuilles\ntools: Read, Grep, Bash, mcp.*\nmodel: opus\nskills: [credit-risk]\n---\nTu es analyste.',
  );
  registry = new SkillRegistry({
    dataDir: path.join(root, 'data'),
    cwd: path.join(root, 'cwd'),
    extraDirs: [],
    includeClaudeHome: false,
  });
  await registry.scan(true);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('skills', () => {
  it('parses frontmatter', () => {
    const { meta, body } = parseFrontmatter('---\nname: x\ndescription: >\n  long\n  text\n---\nBody');
    expect(meta).toEqual({ name: 'x', description: 'long text\n' });
    expect(body).toBe('Body');
  });
  it('extracts quoted triggers and keyword lists', () => {
    const t = extractTriggers(
      "Se declenche des que l'utilisateur mentionne IFRS9, BCEAO, NPL, provisions.",
      'credit-risk',
    );
    expect(t).toEqual(expect.arrayContaining(['ifrs9', 'bceao', 'npl', 'provisions']));
    expect(extractTriggers('Triggers: "écrire un email", "mail".', 'email')).toEqual(
      expect.arrayContaining(['ecrire un email', 'mail']),
    );
  });
  it('lists skills with bundled files and reads them safely', async () => {
    const list = await registry.list();
    expect(list.map((s) => s.name)).toEqual(['credit-risk', 'email-drafter']);
    expect(await registry.body('email-drafter')).toContain('Toujours proposer un objet');
    expect(await registry.readFile('email-drafter', 'references/ton.md')).toBe('Ton cordial.');
    await expect(registry.readFile('email-drafter', '../../../etc/passwd')).rejects.toThrow();
  });
  it('matches requests to skills (accent-insensitive)', async () => {
    expect((await registry.match('Peux-tu rediger un mail pour le client ?')).map((m) => m.name)).toEqual([
      'email-drafter',
    ]);
    expect((await registry.match('Calcule le ratio NPL et les provisions IFRS9'))[0]!.name).toBe(
      'credit-risk',
    );
    expect(await registry.match('bonjour', [])).toEqual([]);
    expect(await registry.match('ratio NPL', ['credit-risk'])).toEqual([]);
  });
  it('imports skills from a zip into data/skills', async () => {
    const zip = Buffer.from(
      zipSync({
        'pack/my-skill/SKILL.md': strToU8('---\nname: my-skill\ndescription: Test "zippé"\n---\nHello'),
      }),
    );
    expect(await registry.import('pack.zip', zip)).toEqual(['my-skill']);
    expect((await registry.get('my-skill')).source).toBe('imported');
    await registry.remove('my-skill');
    await expect(registry.get('my-skill')).rejects.toThrow();
  });
});

describe('custom agents', () => {
  it('loads agents from data/agents and from skills', async () => {
    const agents = await registry.listAgents();
    expect(agents.map((a) => a.id).sort()).toEqual(['analyste', 'credit-risk/auditor']);
    expect(agents.find((a) => a.id === 'credit-risk/auditor')!.name).toBe('Auditeur');
  });
  it('maps Claude Code tool names to workbench tools', () => {
    expect(mapAgentTools(['Read', 'Grep', 'Bash', 'WebFetch'], known)).toEqual(
      expect.arrayContaining(['filesystem.read', 'filesystem.search', 'terminal.execute', 'web.fetch']),
    );
    expect(mapAgentTools(['filesystem.*'], known)).toContain('filesystem.write');
  });
  it('resolves a custom agent into an enforced profile', async () => {
    const role = await resolveRole('analyste', registry, known);
    expect(role.custom).toBe(true);
    expect(role.prompt).toContain('Tu es analyste.');
    expect(role.tools).toEqual(expect.arrayContaining(['filesystem.read', 'terminal.execute', 'skill.use']));
    expect(role.tools).not.toContain('filesystem.write');
    expect(role.toolPatterns).toContain('mcp.*');
    expect(role.skills).toEqual(['credit-risk']);
    expect(role.tier).toBe('powerful');
  });
  it('saves and deletes editable agents', async () => {
    const a = await registry.saveAgent({
      name: 'Rédacteur',
      description: 'Écrit des rapports',
      prompt: 'Tu écris des rapports clairs.',
      tools: ['Read'],
    });
    expect(a.id).toBe('redacteur');
    expect(a.editable).toBe(true);
    await registry.deleteAgent(a.id);
    expect(await registry.getAgent(a.id)).toBeUndefined();
  });
});
