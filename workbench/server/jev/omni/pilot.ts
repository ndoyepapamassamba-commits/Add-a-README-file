// JEV PILOT — keeps a long run on its objective. Models drift after many tool steps (the original request scrolls far up
// the context); a short anchor restates the goal, what was already done and what remains. Deterministic, ~120 tokens.
const WRITES = /^(filesystem\.(write|edit)|artifact\.create|data\.export|report\.export|apex\.build_app)$/;
const CHECKS = /^(code\.run|terminal\.execute|browser\.|data\.query|regression\.run)/;

export function pilotAnchor(goal: string, toolsUsed: string[], step: number, maxSteps: number): string {
  const wrote = toolsUsed.some((t) => WRITES.test(t));
  const checked = toolsUsed.some((t) => CHECKS.test(t));
  const left = Math.max(0, maxSteps - step);
  const next = !wrote
    ? 'produce the deliverable now (stop exploring)'
    : !checked
      ? 'verify the deliverable once (run / open / re-read it), then answer'
      : 'answer the user now with what was done and the evidence';
  return [
    `[JEV PILOT — step ${step}] Stay on THIS request only: «${goal.replace(/\s+/g, ' ').trim().slice(0, 400)}»`,
    `Done so far: ${toolsUsed.slice(-10).join(', ') || 'nothing yet'}.`,
    `Next: ${next}. ${left <= 3 ? `Only ${left} step(s) left: finish now.` : 'Do not start anything the request did not ask for; do not repeat a call that already succeeded.'}`,
  ].join('\n');
}
