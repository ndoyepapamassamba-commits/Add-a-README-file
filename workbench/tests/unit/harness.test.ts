import { describe, expect, it } from 'vitest';
import {
  catalogFor,
  commandFromMarkdown,
  evaluateRules,
  expandCommand,
  firstParagraph,
  importClaudeSettings,
  instructionFiles,
  mergePackSkills,
  packSkillToDef,
  parseRule,
  runHooks,
  searchSkills,
  skillFromMarkdown,
  toolNameMatches,
  workspaceCommands,
  type HookDef,
} from '../../direct/lib/harness';
import type { SkillDef } from '../../direct/lib/types';

describe('permission rules (Claude Code syntax, our tool names or theirs)', () => {
  it('parses Tool, Tool(pattern) and the prefix form Bash(npm run:*)', () => {
    expect(parseRule('Read')).toEqual({ tool: 'Read', pattern: null });
    expect(parseRule('Bash(npm run:*)')).toEqual({ tool: 'Bash', pattern: 'npm run*' });
    expect(parseRule('filesystem.write(outputs/**)')).toEqual({
      tool: 'filesystem.write',
      pattern: 'outputs/**',
    });
  });
  it('maps Claude names and mcp__server__tool to the Workbench tools', () => {
    expect(toolNameMatches('Bash', 'terminal.execute')).toBe(true);
    expect(toolNameMatches('Bash', 'mcp.poste.bash')).toBe(true);
    expect(toolNameMatches('Write', 'filesystem.write')).toBe(true);
    expect(toolNameMatches('mcp__rea', 'mcp.rea.inspect_artifact')).toBe(true);
    expect(toolNameMatches('mcp__rea__inspect_artifact', 'mcp.rea.inspect_artifact')).toBe(true);
    expect(toolNameMatches('mcp.*', 'filesystem.read')).toBe(false);
  });
  it('deny beats ask beats allow, the pattern reads the command / the path', () => {
    const rules = {
      allow: ['Bash(git *)', 'filesystem.write(outputs/**)'],
      ask: ['Bash(git push*)'],
      deny: ['Bash(rm -rf*)', 'filesystem.write(.env)'],
    };
    expect(evaluateRules(rules, 'terminal.execute', { command: 'git status' })).toEqual({
      decision: 'allow',
      rule: 'Bash(git *)',
    });
    expect(evaluateRules(rules, 'terminal.execute', { command: 'git push origin main' })?.decision).toBe(
      'ask',
    );
    expect(evaluateRules(rules, 'mcp.poste.bash', { command: 'rm -rf /' })?.decision).toBe('deny');
    expect(evaluateRules(rules, 'filesystem.write', { path: 'outputs/a/b.md', content: 'x' })?.decision).toBe(
      'allow',
    );
    expect(evaluateRules(rules, 'filesystem.write', { path: '.env', content: 'x' })?.decision).toBe('deny');
    expect(evaluateRules(rules, 'filesystem.read', { path: 'a.md' })).toBeNull();
  });
});

describe('hooks', () => {
  const hk = (h: Partial<HookDef>): HookDef => ({
    id: 'h',
    event: 'PreToolUse',
    action: 'deny',
    enabled: true,
    ...h,
  });
  it('declarative hooks: matcher on the tool, when on the arguments, strictest decision wins, contexts add up', async () => {
    const hooks = [
      hk({ id: 'no-secret', matcher: 'Write|Edit', when: '\\.env', message: 'pas de .env' }),
      hk({ id: 'ctx', event: 'UserPromptSubmit', action: 'context', message: 'Répondre en français.' }),
      hk({ id: 'ask-net', matcher: 'web.read', action: 'ask' }),
      hk({ id: 'off', matcher: '*', enabled: false }),
    ];
    const a = await runHooks(hooks, {
      event: 'PreToolUse',
      tool: 'filesystem.write',
      args: { path: '.env' },
      sessionId: 's',
    });
    expect(a.decision).toBe('deny');
    expect(a.reason).toBe('pas de .env');
    const b = await runHooks(hooks, {
      event: 'PreToolUse',
      tool: 'filesystem.write',
      args: { path: 'a.md' },
      sessionId: 's',
    });
    expect(b.decision).toBeUndefined();
    const c = await runHooks(hooks, { event: 'UserPromptSubmit', prompt: 'bonjour', sessionId: 's' });
    expect(c.context).toEqual(['Répondre en français.']);
  });
  it('JavaScript hooks can rewrite the arguments; shell hooks follow the Claude convention (exit 2 blocks)', async () => {
    const js = hk({
      id: 'js',
      action: 'js',
      code: 'return { args: { ...input.args, path: "outputs/" + input.args.path } }',
    });
    const r = await runHooks(
      [js],
      { event: 'PreToolUse', tool: 'filesystem.write', args: { path: 'a.md' }, sessionId: 's' },
      {
        js: async (code, input) => new Function('input', code)(input),
      },
    );
    expect(r.args).toEqual({ path: 'outputs/a.md' });
    const sh = hk({ id: 'sh', action: 'shell', command: 'check.sh' });
    const blocked = await runHooks(
      [sh],
      { event: 'PreToolUse', tool: 'terminal.execute', args: { command: 'x' }, sessionId: 's' },
      {
        shell: async () => ({ code: 2, stdout: '', stderr: 'interdit par check.sh' }),
      },
    );
    expect(blocked).toMatchObject({ decision: 'deny', reason: 'interdit par check.sh' });
    const json = await runHooks(
      [sh],
      { event: 'PreToolUse', tool: 'terminal.execute', args: {}, sessionId: 's' },
      {
        shell: async () => ({
          code: 0,
          stdout: JSON.stringify({
            hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'à confirmer' },
          }),
          stderr: '',
        }),
      },
    );
    expect(json).toMatchObject({ decision: 'ask', reason: 'à confirmer' });
    const none = await runHooks([sh], {
      event: 'PreToolUse',
      tool: 'terminal.execute',
      args: {},
      sessionId: 's',
    });
    expect(none.errors[0]).toContain('pont local absent');
  });
  it('imports the hooks and permissions of a Claude Code settings.json', () => {
    const r = importClaudeSettings({
      permissions: { allow: ['mcp__rea', 'Bash(rea doctor:*)'], deny: ['Read(.env)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './garde.sh' }] }],
        Inconnu: [],
      },
    });
    expect(r.permissions).toEqual({
      allow: ['mcp__rea', 'Bash(rea doctor:*)'],
      ask: [],
      deny: ['Read(.env)'],
    });
    expect(r.hooks).toEqual([
      {
        id: 'claude-PreToolUse-1',
        event: 'PreToolUse',
        matcher: 'Bash',
        action: 'shell',
        command: './garde.sh',
        enabled: true,
      },
    ]);
  });
});

describe('instruction files, commands', () => {
  it('reads MASSAMBA.md / CLAUDE.md / AGENTS.md of the workspace in order', () => {
    const f = instructionFiles([
      { path: 'AGENTS.md', data: 'agents' },
      { path: 'deep/very/CLAUDE.md', data: 'trop profond' },
      { path: 'projet/CLAUDE.md', data: 'claude' },
      { path: 'MASSAMBA.md', data: 'massamba' },
    ]);
    expect(f.map((x) => x.path)).toEqual(['MASSAMBA.md', 'projet/CLAUDE.md', 'AGENTS.md']);
  });
  it('workspace commands, $ARGUMENTS / $1 and @file expansion', () => {
    const cmds = workspaceCommands([
      {
        path: '.claude/commands/git/commit.md',
        data: '---\ndescription: Commit propre\n---\nFais un commit : $ARGUMENTS',
      },
    ]);
    expect(cmds[0]).toMatchObject({ name: 'git:commit', description: 'Commit propre' });
    expect(expandCommand(cmds[0]!.body, 'fix du bug')).toBe('Fais un commit : fix du bug');
    expect(expandCommand('Compare $1 et $2', 'a.csv "b c.csv"')).toBe('Compare a.csv et b c.csv');
    expect(expandCommand('Lis @notes.md', '', (p) => (p === 'notes.md' ? 'contenu' : undefined))).toContain(
      '<file path="notes.md">\ncontenu',
    );
    expect(commandFromMarkdown('Sans en-tête : résume le fichier donné.', 'resume', 'x').description).toBe(
      'Sans en-tête : résume le fichier donné.',
    );
  });
});

describe('skills without format requirement, pack, progressive catalogue', () => {
  it('a SKILL.md without front matter is accepted (name from folder, description from the first paragraph)', () => {
    const s = skillFromMarkdown(
      '# Titre\n\nAnalyse les binaires Mach-O et cite les preuves.\n\n## Étapes',
      'macho',
    );
    expect(s).toMatchObject({
      name: 'macho',
      description: 'Analyse les binaires Mach-O et cite les preuves.',
    });
    expect(firstParagraph('```\ncode\n```\n\nVrai paragraphe ici.')).toBe('Vrai paragraphe ici.');
    const t = skillFromMarkdown(
      '---\nname: x\ndescription: d\nallowed-tools: Bash(git:*) Read\nlicense: MIT\n---\ncorps',
      'y',
    );
    expect(t).toMatchObject({ name: 'x', allowedTools: ['Bash(git:*)', 'Read'], license: 'MIT' });
  });
  it('pack skills keep every file (binaries too) and merge without losing the user on/off choice', () => {
    const def = packSkillToDef({
      name: 'anthropic-skills:canvas',
      source: 'organisation',
      md: '---\ndescription: Dessin\n---\nx',
      files: { 'a.py': 'print(1)' },
      bin: { 'font.ttf': 'AAAA' },
    });
    expect(def).toMatchObject({
      name: 'anthropic-skills:canvas',
      category: 'Organisation',
      files: { 'a.py': 'print(1)' },
      assets: { 'font.ttf': 'AAAA' },
    });
    const cur: SkillDef = {
      name: 'anthropic-skills:canvas',
      description: 'v',
      body: '',
      files: { 'old.md': 'o' },
      triggers: [],
      enabled: false,
    };
    const m = mergePackSkills([cur], [def, { ...def, name: 'z' }]);
    expect(m).toMatchObject({ added: 1, updated: 1 });
    expect(m.skills[0]).toMatchObject({ enabled: false, files: { 'old.md': 'o', 'a.py': 'print(1)' } });
  });
  it('the catalogue keeps the relevant skills only, always-on first; search finds by name and description', () => {
    const many: SkillDef[] = Array.from({ length: 120 }, (_, i) => ({
      name: `plug:s${i}`,
      description: `outil numéro ${i}`,
      body: '',
      files: {},
      triggers: [],
      enabled: true,
    }));
    many.push({
      name: 'rea-d-abord',
      description: 'Rétro-ingénierie rapide REA',
      body: '',
      files: {},
      triggers: ['retro ingenierie'],
      enabled: true,
    });
    many.push({
      name: 'excel-pro',
      description: 'Classeurs Excel premium',
      body: '',
      files: {},
      triggers: ['excel'],
      enabled: true,
    });
    const c = catalogFor('fais-moi un classeur excel', many, 10, ['rea-d-abord']);
    expect(c.length).toBe(10);
    expect(c[0]!.name).toBe('rea-d-abord');
    expect(c.map((s) => s.name)).toContain('excel-pro');
    expect(searchSkills('rétro ingénierie', many)[0]!.name).toBe('rea-d-abord');
  });
});
