// LE MODÈLE INTÉGRÉ AU NAVIGATEUR (v63, lot C — « tout en gratuit sans que je ne mette de clé ») : Qwen3 (Apache-2.0)
// exécuté DANS la page par transformers.js (Apache-2.0, chargé à la demande depuis jsDelivr comme Depth Anything).
// WebGPU si la carte graphique le permet (q4f16), sinon WebAssembly sur le processeur (q8). Téléchargé une seule fois
// (≈ 0,6 Go pour 0,6 B ; ≈ 1,4 Go pour 1,7 B), puis mis en cache : il marche ensuite SANS RÉSEAU, sans clé, et rien ne
// sort de l'ordinateur — c'est le seul modèle qui reçoit les données de l'utilisateur quand aucune clé n'est donnée.
// Limite honnête : un modèle de 0,6 à 1,7 milliard de paramètres est un secours (réponses courtes, un ou deux outils),
// pas un analyste ; la conversation lui est résumée (server/llm/browserPrompt.ts) et la réponse le dit.
import type { ModelInfo } from '@shared/types';
import { forSmallModel, parseQwenOutput } from '../../server/llm/browserPrompt';
import { LLMError, type ChatRequest, type ChatResult, type StreamHandlers } from '../../server/llm/types';

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm';
interface Spec {
  repo: string;
  label: string;
  mb: { webgpu: number; wasm: number };
  dtype: { webgpu: string; wasm: string };
}
export const BROWSER_SPECS: Record<string, Spec> = {
  'qwen3-0.6b': { repo: 'onnx-community/Qwen3-0.6B-ONNX', label: 'Qwen3 0,6 B', mb: { webgpu: 570, wasm: 618 }, dtype: { webgpu: 'q4f16', wasm: 'q8' } },
  'qwen3-1.7b': { repo: 'onnx-community/Qwen3-1.7B-ONNX', label: 'Qwen3 1,7 B', mb: { webgpu: 1426, wasm: 1742 }, dtype: { webgpu: 'q4f16', wasm: 'q8' } },
};

export function browserModelInfo(id: string): ModelInfo {
  const s = BROWSER_SPECS[id];
  return {
    id: `browser:${id}`,
    name: `${s?.label ?? id} — intégré au navigateur (hors ligne, gratuit)`,
    provider: 'Navigateur (local)',
    created: 0,
    contextLength: 32_768,
    maxCompletionTokens: 1024,
    inputPrice: 0,
    outputPrice: 0,
    capabilities: { tools: true, reasoning: false, vision: false, structuredOutputs: false },
    efforts: [],
    defaultEffort: null,
    description: `Exécuté dans cette page (transformers.js), téléchargé une fois (≈ ${s ? (s.mb.webgpu / 1000).toFixed(1) : '?'} Go) : sans clé, sans réseau ensuite, vos données ne sortent pas. Petit modèle : réponses courtes, peu d'outils.`,
  };
}

// ── état du modèle (affiché dans Réglages) ───────────────────────────────────────────────────────────────────────────
export interface LocalState {
  model: string | null;
  phase: 'idle' | 'loading' | 'ready' | 'error';
  device: 'webgpu' | 'wasm' | null;
  progress: number;
  note: string;
}
let st: LocalState = { model: null, phase: 'idle', device: null, progress: 0, note: '' };
const subs = new Set<(s: LocalState) => void>();
const set = (p: Partial<LocalState>) => {
  st = { ...st, ...p };
  subs.forEach((f) => f(st));
};
export const localState = () => st;
export const onLocalState = (f: (s: LocalState) => void) => (subs.add(f), () => void subs.delete(f));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { id: string; tf: any; tok: any; model: any; device: 'webgpu' | 'wasm' };
let loaded: Promise<Loaded> | null = null;

export async function webgpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/** Downloads (once, then cached by the browser) and starts the model. */
export function loadBrowserModel(id: string): Promise<Loaded> {
  const spec = BROWSER_SPECS[id];
  if (!spec) return Promise.reject(new LLMError(`Modèle intégré inconnu : ${id}`, 400, false));
  if (loaded && st.model === id && st.phase !== 'error') return loaded;
  loaded = (async () => {
    set({ model: id, phase: 'loading', progress: 0, note: 'chargement du moteur transformers.js' });
    const tf = await import(/* @vite-ignore */ TRANSFORMERS);
    const device: 'webgpu' | 'wasm' = (await webgpuAvailable()) ? 'webgpu' : 'wasm';
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let a = 0;
        let b = 0;
        for (const f of files.values()) {
          a += f.loaded;
          b += f.total;
        }
        set({ progress: b ? a / b : 0, note: `téléchargement unique de ${spec.label} (${Math.round(b / 1e6)} Mo, mis en cache) — ${device === 'webgpu' ? 'carte graphique (WebGPU)' : 'processeur (WebAssembly)'}` });
      }
    };
    const tok = await tf.AutoTokenizer.from_pretrained(spec.repo, { progress_callback });
    let model: any;
    let dev = device;
    try {
      model = await tf.AutoModelForCausalLM.from_pretrained(spec.repo, { dtype: spec.dtype[device], device, progress_callback });
    } catch (e) {
      if (device !== 'webgpu') throw e;
      // WebGPU announced but unusable (driver, memory): the processor takes over.
      dev = 'wasm';
      set({ note: `WebGPU indisponible (${(e as Error).message.slice(0, 80)}) : passage au processeur` });
      model = await tf.AutoModelForCausalLM.from_pretrained(spec.repo, { dtype: spec.dtype.wasm, device: 'wasm', progress_callback });
    }
    set({ phase: 'ready', device: dev, progress: 1, note: `${spec.label} prêt (${dev === 'webgpu' ? 'carte graphique' : 'processeur'})` });
    return { id, tf, tok, model, device: dev };
  })();
  loaded.catch((e: Error) => {
    set({ phase: 'error', note: e.message.slice(0, 200) });
    loaded = null;
  });
  return loaded;
}

let busy: Promise<unknown> = Promise.resolve();
/** One chat turn on the in-browser model: streaming text, Qwen3 tool calls, measured speed. Calls are queued. */
export function browserChat(id: string, req: ChatRequest, h: StreamHandlers = {}): Promise<ChatResult & { metrics: { ttftMs: number | null; tokensPerS: number | null; totalMs: number } }> {
  const run = busy.then(() => turn(id, req, h));
  busy = run.catch(() => undefined);
  return run;
}

async function turn(id: string, req: ChatRequest, h: StreamHandlers) {
  const t0 = performance.now();
  h.onReasoning?.();
  const L = await loadBrowserModel(id);
  const small = forSmallModel(req.messages, req.toolChoice === 'none' ? [] : (req.tools ?? []));
  const inputs = L.tok.apply_chat_template(small.messages, {
    tools: small.tools.length ? small.tools : undefined,
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false,
  });
  const promptTokens: number = inputs.input_ids.dims.at(-1);
  let first: number | null = null;
  let raw = '';
  let shown = 0;
  let inTool = false;
  const streamer = new L.tf.TextStreamer(L.tok, {
    skip_prompt: true,
    skip_special_tokens: false,
    callback_function: (t: string) => {
      first ??= performance.now();
      raw += t;
      // Stream the visible text, hold back what is inside <tool_call> / <think>.
      if (/<tool_call>|<think>/.test(raw.slice(shown))) inTool = true;
      if (!inTool) {
        const visible = raw.slice(shown).replace(/<\|im_end\|>|<\|endoftext\|>/g, '');
        const cut = visible.lastIndexOf('<');
        const safe = cut >= 0 && cut > visible.length - 12 ? visible.slice(0, cut) : visible;
        if (safe) {
          h.onText?.(safe);
          shown += safe.length;
        }
      }
    },
  });
  const stop = new L.tf.InterruptableStoppingCriteria();
  const onAbort = () => stop.interrupt();
  req.signal?.addEventListener('abort', onAbort);
  let out: any;
  try {
    out = await L.model.generate({
      ...inputs,
      max_new_tokens: Math.min(req.maxTokens ?? 768, 1024),
      do_sample: false,
      repetition_penalty: 1.05,
      streamer,
      stopping_criteria: stop,
    });
  } finally {
    req.signal?.removeEventListener('abort', onAbort);
  }
  if (req.signal?.aborted) throw new LLMError('Cancelled', 499, false, 'cancelled');
  const completionTokens: number = Math.max(0, (out?.dims?.at(-1) ?? promptTokens) - promptTokens);
  const parsed = parseQwenOutput(raw);
  const note = small.trimmed.length ? `\n\n_(Modèle intégré au navigateur, hors ligne : ${small.trimmed.join(', ')}.)_` : '';
  if (note && !parsed.toolCalls.length) h.onText?.(note);
  for (const c of parsed.toolCalls) h.onToolCallStart?.(c.function.name);
  const t1 = performance.now();
  const gen = first !== null ? (t1 - first) / 1000 : 0;
  return {
    content: parsed.toolCalls.length ? parsed.content : `${parsed.content}${note}`,
    toolCalls: parsed.toolCalls,
    finishReason: parsed.toolCalls.length ? 'tool_calls' : 'stop',
    usage: { promptTokens, completionTokens, cachedTokens: 0, cost: 0 },
    model: `browser:${id}`,
    metrics: {
      ttftMs: first !== null ? Math.round(first - t0) : null,
      tokensPerS: gen > 0.05 ? Math.round((completionTokens / gen) * 10) / 10 : null,
      totalMs: Math.round(t1 - t0),
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
