export const TOOL_VERB: Record<string, string> = {
  'filesystem.list': 'List',
  'filesystem.read': 'Read',
  'filesystem.read_many': 'Read',
  'filesystem.write': 'Write',
  'filesystem.edit': 'Edit',
  'filesystem.multi_edit': 'Edit',
  'filesystem.delete': 'Delete',
  'filesystem.move': 'Move',
  'filesystem.search': 'Search',
  'filesystem.glob': 'Glob',
  'terminal.execute': 'Bash',
  'terminal.output': 'Output',
  'terminal.kill': 'Kill',
  'code.run': 'Run',
  'web.search': 'Web Search',
  'web.fetch': 'Fetch',
  'data.inspect': 'Inspect',
  'data.query': 'Query',
  'data.transform': 'Transform',
  'visualization.create': 'Chart',
  'project.analyze': 'Analyze',
  'git.status': 'Git',
  'git.diff': 'Git',
  'git.log': 'Git',
  'git.commit': 'Commit',
  'memory.read': 'Memory',
  'memory.add': 'Remember',
  'memory.remove': 'Forget',
  'artifact.create': 'Artifact',
  'plan.update': 'Todo',
  'plan.propose': 'Plan',
  'agent.delegate': 'Task',
};

export function toolVerb(tool: string): string {
  if (TOOL_VERB[tool]) return TOOL_VERB[tool]!;
  if (tool.startsWith('browser.')) return 'Browser';
  return tool;
}

/** Short argument summary shown next to the verb (like `Read(src/app.ts)`). */
export function toolArgSummary(tool: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  if (tool.startsWith('browser.')) {
    const action = tool.slice(8);
    const target =
      s(a.url) ||
      (a.ref !== undefined ? `[${String(a.ref)}]` : '') ||
      s(a.selector) ||
      s(a.text) ||
      s(a.keys) ||
      '';
    return `${action}${target ? ` ${target}` : ''}`;
  }
  switch (tool) {
    case 'filesystem.read_many':
      return Array.isArray(a.paths) ? (a.paths as string[]).join(', ') : '';
    case 'filesystem.move':
      return `${s(a.from)} → ${s(a.to)}`;
    case 'filesystem.search':
      return `"${s(a.pattern)}"${a.glob ? ` in ${s(a.glob)}` : ''}`;
    case 'filesystem.glob':
      return s(a.pattern);
    case 'terminal.execute':
      return s(a.command);
    case 'code.run':
      return `${s(a.language)} · ${s(a.code).split('\n').length} lignes`;
    case 'web.search':
      return s(a.query);
    case 'web.fetch':
      return s(a.url);
    case 'visualization.create':
      return s((a.spec as Record<string, unknown>)?.title);
    case 'git.commit':
      return s(a.message).split('\n')[0] ?? '';
    case 'git.status':
      return 'status';
    case 'git.diff':
      return `diff${a.path ? ` ${s(a.path)}` : ''}`;
    case 'git.log':
      return 'log';
    case 'memory.add':
      return s(a.text).slice(0, 80);
    case 'artifact.create':
      return `${s(a.name)}.${s(a.type)}`;
    case 'agent.delegate':
      return `${s(a.role)} — ${s(a.task).split('\n')[0]?.slice(0, 80) ?? ''}`;
    case 'data.transform':
      return `${s(a.path)} → ${s(a.output_path)}`;
    default:
      return s(a.path) || s(a.query) || '';
  }
}
