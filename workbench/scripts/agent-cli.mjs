import WebSocket from 'ws';
const [, , base, token, sessionId, text, model = 'auto', mode = 'chat'] = process.argv;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const run = await (
  await fetch(`${base}/api/sessions/${sessionId}/runs`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ text, model, agentMode: mode }),
  })
).json();
if (!run.id) {
  console.log(run);
  process.exit(1);
}
const ws = new WebSocket(base.replace('http', 'ws') + '/api/ws');
ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
let deltas = 0;
ws.on('message', async (raw) => {
  const m = JSON.parse(raw);
  if (m.type === 'ready') ws.send(JSON.stringify({ type: 'sub_run', runId: run.id }));
  if (m.type !== 'run_event') return;
  const e = m.event;
  if (e.type === 'text_delta') {
    deltas++;
    return;
  }
  if (e.type === 'tool_call') console.log('→', e.tool, JSON.stringify(e.args).slice(0, 150));
  else if (e.type === 'tool_result')
    console.log('←', e.tool, e.result.ok ? 'OK' : 'ERR', e.result.summary, e.durationMs + 'ms');
  else if (e.type === 'approval_required') {
    console.log('?? approval', e.request.summary, e.request.reason);
    await fetch(`${base}/api/approvals/${e.request.approvalId}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ decision: 'approve' }),
    });
  } else if (e.type === 'plan_proposed') {
    console.log(
      'PLAN',
      e.steps.map((s) => s.title),
    );
    await fetch(`${base}/api/runs/${run.id}/plan`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ decision: 'approve' }),
    });
  } else if (e.type === 'assistant_message') console.log('ASSISTANT:', e.text.slice(0, 1500));
  else if (e.type === 'run_finished') {
    console.log('FINISHED', e.status, JSON.stringify(e.usage), e.durationMs + 'ms', 'deltas', deltas);
    ws.close();
  } else console.log('·', e.type, JSON.stringify(e).slice(0, 220));
});
