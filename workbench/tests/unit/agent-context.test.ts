import { describe, expect, it } from 'vitest';
import type { RunSummary } from '@shared/types';
import {
  buildSystemPrompt,
  elideOldToolOutputs,
  estimateTokens,
  repairHistory,
  turnBoundaries,
} from '../../server/agent/context';
import { ROLES } from '../../server/agent/roles';
import type { ChatMessage } from '../../server/llm/types';
import { applyEvent, emptyRunView } from '../../web/lib/transcript';

describe('history management', () => {
  it('repairs dangling tool calls', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } },
          { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: 'done' },
    ];
    const out = repairHistory(msgs);
    expect(out).toHaveLength(4);
    expect(out[3]).toMatchObject({ role: 'tool', tool_call_id: 'b' });
  });
  it('elides old tool outputs but keeps recent ones', () => {
    const msgs: ChatMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: 'tool' as const,
      tool_call_id: String(i),
      content: 'x'.repeat(2000),
    }));
    const { messages, elided } = elideOldToolOutputs(msgs, 4, 100);
    expect(elided).toBe(8);
    expect((messages[0]!.content as string).length).toBeLessThan(200);
    expect((messages[11]!.content as string).length).toBe(2000);
    expect(estimateTokens(messages)).toBeLessThan(estimateTokens(msgs));
  });
  it('finds turn boundaries', () => {
    expect(
      turnBoundaries([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]),
    ).toEqual([0, 2]);
  });
});

describe('system prompt', () => {
  it('includes mandatory active skills, plugins and the skill catalog', () => {
    const p = buildSystemPrompt({
      role: ROLES.general!,
      permissionMode: 'normal',
      projectName: 'demo',
      contextMd: '# Demo\nMontants en FCFA',
      python: true,
      maxRetries: 3,
      toolNames: ROLES.general!.tools,
      skillsCatalog: [{ name: 'email-drafter', description: 'Rédige des emails' }],
      activeSkills: [
        { name: 'email-drafter', body: 'Toujours proposer un objet.', files: ['references/ton.md'] },
      ],
      plugins: [{ name: 'blender', tools: 12, instructions: 'Use get_scene_info first.' }],
      jev: true,
    });
    expect(p).toContain('ACTIVE SKILLS — MANDATORY');
    expect(p).toContain('<skill name="email-drafter">');
    expect(p).toContain('Toujours proposer un objet.');
    expect(p).toContain('# Plugins (MCP servers connected)');
    expect(p).toContain('Use get_scene_info first.');
    expect(p).toContain('Montants en FCFA');
    expect(p).toContain('jev.judge');
  });
});

describe('UI transcript reducer', () => {
  const run: RunSummary = {
    id: 'r1',
    sessionId: 's',
    projectId: 'p',
    parentRunId: null,
    role: 'general',
    title: 't',
    status: 'running',
    model: 'm',
    mode: 'chat',
    startedAt: 0,
    finishedAt: null,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    filesChanged: 0,
    error: null,
  };
  it('streams text, tool calls, approvals and finishes', () => {
    let v = emptyRunView(run);
    let seq = 0;
    const ev = (e: Parameters<typeof applyEvent>[1]) => (v = applyEvent(v, e, seq++));
    ev({
      type: 'run_started',
      runId: 'r1',
      sessionId: 's',
      role: 'general',
      mode: 'chat',
      title: 't',
      userText: 'bonjour',
      attachments: [],
      permissionMode: 'normal',
    });
    ev({ type: 'text_delta', text: 'Je ' });
    ev({ type: 'text_delta', text: 'regarde.' });
    expect(v.items.at(-1)).toMatchObject({ kind: 'text', text: 'Je regarde.', streaming: true });
    ev({ type: 'assistant_message', text: 'Je regarde.' });
    ev({ type: 'tool_call', callId: 'c1', tool: 'filesystem.write', args: { path: 'a.txt' } });
    ev({
      type: 'approval_required',
      request: { approvalId: 'ap1', tool: 'filesystem.write', summary: 'Write a.txt', reason: 'write' },
    });
    expect(v.status).toBe('waiting_approval');
    expect(v.items.find((i) => i.kind === 'tool')).toMatchObject({ status: 'waiting' });
    ev({ type: 'approval_resolved', approvalId: 'ap1', decision: 'approve' });
    ev({
      type: 'tool_result',
      callId: 'c1',
      tool: 'filesystem.write',
      result: { ok: true, summary: 'Created a.txt' },
      durationMs: 5,
    });
    ev({ type: 'plan_updated', steps: [{ id: '1', title: 'step', status: 'done' }] });
    ev({ type: 'skills_activated', skills: [{ name: 'email-drafter', reason: 'auto' }] });
    ev({
      type: 'usage',
      model: 'm',
      promptTokens: 100,
      completionTokens: 10,
      cost: 0.01,
      contextTokens: 100,
      contextLimit: 1000,
    });
    ev({
      type: 'run_finished',
      status: 'completed',
      usage: { promptTokens: 100, completionTokens: 10, cost: 0.01 },
      durationMs: 1200,
    });
    expect(v.status).toBe('completed');
    expect(v.items.map((i) => i.kind)).toEqual(['user', 'text', 'tool', 'approval', 'checklist', 'skills']);
    expect(v.items.find((i) => i.kind === 'tool')).toMatchObject({ status: 'ok' });
    expect(v.skills).toEqual(['email-drafter']);
    expect(v.contextLimit).toBe(1000);
  });
  it('ignores replayed events', () => {
    let v = emptyRunView(run);
    v = applyEvent(v, { type: 'status', text: 'a' }, 5);
    expect(applyEvent(v, { type: 'status', text: 'b' }, 3)).toBe(v);
  });
});
