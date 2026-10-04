// Auto-benchmark: representative tasks with deterministic checkers, run on a
// model; the results feed the personal leaderboard (per task type) and are
// compared with the previous run of the same model (regressions).
import { BENCH_TASKS, benchRegression, type BenchResult } from '../../server/agent/intelligence';
import { complete } from './llm';
import { useStore } from './store';

export async function runBenchmark(
  model: string,
  signal?: AbortSignal,
): Promise<{ result: BenchResult; regression: string | null }> {
  const st = useStore.getState();
  const started = Date.now();
  let cost = 0;
  const details: BenchResult['details'] = [];
  for (const t of BENCH_TASKS) {
    if (signal?.aborted) throw new Error('Benchmark interrompu');
    let ok: boolean;
    try {
      const r = await complete(
        { model, messages: [{ role: 'user', content: t.prompt }], maxTokens: 900, temperature: 0, signal },
        { models: st.models, fallbacks: [], effort: 'auto', maxRetries: 1 },
      );
      cost += r.cost;
      ok = t.check(r.content);
    } catch {
      ok = false;
    }
    details.push({ id: t.id, ok });
    useStore.getState().recordOutcome(model, ok, t.type);
  }
  const result: BenchResult = {
    model,
    at: Date.now(),
    passed: details.filter((d) => d.ok).length,
    total: details.length,
    cost,
    ms: Date.now() - started,
    details,
  };
  const prev = [...useStore.getState().bench].reverse().find((b) => b.model === model);
  useStore.getState().setBench([...useStore.getState().bench, result].slice(-60));
  return { result, regression: benchRegression(prev, result) };
}
