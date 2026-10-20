// PROMPT STUDIO — the prompting sandbox: structured blocks → one mega-prompt, variables, templates, compiled preview
// with token and cost estimate, the house lint (a secret blocks the run: enforced here), JEV's judgment of the prompt
// (clarity, completeness, invention risk, secret risk, best lever), a run with streaming, « améliorer ce prompt » by
// the model (proposal shown, applied on click), send to chat, versions. Prompts live in this browser (IndexedDB).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Gavel, History, Play, Plus, Send, Square, Trash2, Wand2 } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea } from '../../web/components/ui';
import { fmtCost, shortModel } from '../../web/lib/format';
import { pickFromTier } from '../../server/llm/router';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';
import { callJevQuestions } from '../../server/jev/provider';
import { promptQuestions } from '../../server/services/dossier/dossierJudge';
import { acct } from '../lib/acct';
import { kv } from '../lib/db';
import { getJevKey, jevSettings } from '../lib/jev';
import { complete } from '../lib/llm';
import {
  BLOCKS,
  LEVER_LABELS,
  SCORE_LABELS,
  TEMPLATES,
  compile,
  docVars,
  estimateRunCost,
  improveSystemPrompt,
  lintBlocks,
  lintPrompt,
  newDoc,
  parseImproved,
  promptJudgeState,
  snapshot,
  type BlockId,
  type PromptDoc,
} from '../lib/promptStudio';
import { uid, useStore } from '../lib/store';

const KV_KEY = 'promptStudio.docs';
interface Judgment {
  clarity?: number;
  completeness?: number;
  inventionRisk?: number;
  secretRisk?: number;
  lever?: string;
  leverConf?: number;
  cost: number;
  ms: number;
}

export function PromptStudioView() {
  const models = useStore((s) => s.models);
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const [docs, setDocs] = useState<PromptDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string>('');
  const [template, setTemplate] = useState<string>(TEMPLATES[0]!.id);
  const [right, setRight] = useState<'preview' | 'run' | 'versions'>('preview');
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState<'run' | 'improve' | 'judge' | null>(null);
  const [judge, setJudge] = useState<Judgment | null>(null);
  const [proposal, setProposal] = useState<{ blocks: Partial<Record<BlockId, string>>; changes: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Load once; save (debounced) on every change.
  useEffect(() => {
    void kv.get<PromptDoc[]>(KV_KEY).then((d) => {
      const list = Array.isArray(d) ? d : [];
      setDocs(list);
      setCurrentId(list[0]?.id ?? '');
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => void kv.set(KV_KEY, docs), 400);
    return () => clearTimeout(t);
  }, [docs, loaded]);

  const doc = docs.find((d) => d.id === currentId) ?? null;
  const update = (p: Partial<PromptDoc>) => setDocs((l) => l.map((d) => (d.id === currentId ? { ...d, ...p, updatedAt: Date.now() } : d)));
  const setBlock = (id: BlockId, v: string) => doc && update({ blocks: { ...doc.blocks, [id]: v } });
  const setVar = (k: string, v: string) => doc && update({ vars: { ...doc.vars, [k]: v } });

  const compiled = useMemo(() => (doc ? compile(doc) : null), [doc]);
  const lint = useMemo(() => (doc ? lintPrompt(doc) : []), [doc]);
  const vars = useMemo(() => (doc ? docVars(doc) : []), [doc]);
  const modelId = doc?.model || settings.defaultModel || 'auto';
  const resolvedModel = modelId === 'auto' ? pickFromTier(models, DEFAULT_AUTO_TIERS.balanced, {})?.id ?? pickFromTier(models, DEFAULT_AUTO_TIERS.fast, {})?.id ?? '' : modelId;
  const modelInfo = models.find((m) => m.id === resolvedModel);
  const estimate = compiled ? estimateRunCost(modelInfo, compiled.tokens) : null;
  const modelOptions = useMemo(
    () => [{ value: 'auto', label: 'Auto (équilibré)' }, ...[...models].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ value: m.id, label: `${m.name} · ${shortModel(m.id)}` }))],
    [models],
  );

  const create = (fromTemplate: boolean) => {
    const t = fromTemplate ? TEMPLATES.find((x) => x.id === template) : undefined;
    const d = newDoc(uid(), t);
    setDocs((l) => [d, ...l]);
    setCurrentId(d.id);
    setJudge(null);
    setProposal(null);
    setOutput('');
  };
  const remove = () => {
    if (!doc) return;
    setDocs((l) => l.filter((d) => d.id !== doc.id));
    setCurrentId(docs.find((d) => d.id !== doc.id)?.id ?? '');
  };
  const stop = () => abort.current?.abort();

  const call = async (messages: { role: 'system' | 'user'; content: string }[], o: { maxTokens: number; temperature?: number; onText?: (d: string) => void; purpose: string }) => {
    if (!resolvedModel) throw new Error('Aucun modèle disponible : vérifiez la clé OpenRouter dans Paramètres.');
    const ac = new AbortController();
    abort.current = ac;
    const t0 = Date.now();
    const r = await complete(
      { model: resolvedModel, messages, maxTokens: o.maxTokens, temperature: o.temperature, signal: ac.signal },
      { models, fallbacks: settings.fallbackModel && settings.fallbackModel !== 'auto' ? [settings.fallbackModel] : [], effort: settings.effort, maxRetries: 1, purpose: o.purpose, onText: o.onText, onReset: () => o.onText && setOutput('') },
    );
    useStore.getState().addSpend(r.cost);
    acct.add('prompt-studio', { kind: 'main', step: 0, model: r.model, tokensIn: r.usage.promptTokens, tokensOut: r.usage.completionTokens, cost: r.cost, costSource: r.costSource, ms: Date.now() - t0 });
    return { ...r, ms: Date.now() - t0 };
  };

  const run = async () => {
    if (!doc || !compiled) return;
    if (lintBlocks(lint)) return toast('err', 'Exécution refusée : corrigez les erreurs du contrôle (secret, mission vide).');
    setRunning('run');
    setRight('run');
    setOutput('');
    try {
      const r = await call([{ role: 'user', content: compiled.text }], { maxTokens: 4000, temperature: doc.temperature ?? settings.temperature ?? undefined, onText: (d) => setOutput((o) => o + d), purpose: 'prompt-studio' });
      setOutput(r.content);
      setDocs((l) => l.map((d) => (d.id === doc.id ? snapshot({ ...d, lastRun: { at: Date.now(), model: r.model, text: r.content, cost: r.cost, tokensIn: r.usage.promptTokens, tokensOut: r.usage.completionTokens, ms: r.ms } }, 'exécution') : d)));
      toast('ok', `Réponse de ${shortModel(r.model)} · ${fmtCost(r.cost)} (${r.costSource})`);
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setRunning(null);
    }
  };
  const improve = async () => {
    if (!doc) return;
    setRunning('improve');
    try {
      const r = await call([{ role: 'system', content: improveSystemPrompt() }, { role: 'user', content: JSON.stringify({ blocks: doc.blocks, vars: doc.vars }) }], { maxTokens: 3500, temperature: 0.2, purpose: 'prompt-improve' });
      const p = parseImproved(r.content);
      if (!p) toast('err', 'Le modèle n’a pas renvoyé des blocs lisibles : réessayez ou changez de modèle.');
      else {
        setProposal(p);
        toast('ok', `Proposition de ${shortModel(r.model)} · ${fmtCost(r.cost)} — à appliquer ou à ignorer.`);
      }
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setRunning(null);
    }
  };
  const applyProposal = () => {
    if (!doc || !proposal) return;
    const snap = snapshot(doc, 'avant amélioration');
    setDocs((l) => l.map((d) => (d.id === doc.id ? { ...snap, blocks: { ...snap.blocks, ...proposal.blocks }, updatedAt: Date.now() } : d)));
    setProposal(null);
  };
  const judgePrompt = async () => {
    if (!doc) return;
    const cfg = jevSettings();
    const key = getJevKey();
    if (!key || !cfg.enabled) return toast('info', 'JEV n’est pas configuré (Paramètres → JEV) : le contrôle local reste appliqué.');
    setRunning('judge');
    const t0 = Date.now();
    try {
      const ans = await callJevQuestions(cfg, key, promptJudgeState(doc), promptQuestions(), (u, i) => fetch(u, i));
      acct.add('prompt-studio', { kind: 'jev1', step: 0, model: ans.model, tokensIn: ans.inputTokens, tokensOut: 0, cost: ans.costUsd, costSource: 'calculated', ms: Date.now() - t0 });
      const a = ans.answers;
      setJudge({ clarity: a.clarity?.score, completeness: a.completeness?.score, inventionRisk: a.inventionRisk?.noul, secretRisk: a.secretRisk?.noul, lever: a.bestLever?.choice, leverConf: a.bestLever?.confidence, cost: ans.costUsd, ms: ans.ms });
    } catch (e) {
      toast('err', `JEV injoignable : ${(e as Error).message}`);
    } finally {
      setRunning(null);
    }
  };
  const sendToChat = () => {
    if (!compiled) return;
    if (lintBlocks(lint)) return toast('err', 'Envoi refusé : corrigez les erreurs du contrôle (secret, mission vide).');
    useStore.getState().newSession(true);
    useStore.setState({ draft: compiled.text });
  };
  const copy = () => compiled && void navigator.clipboard?.writeText(compiled.text).then(() => toast('ok', 'Prompt copié.'));
  const restore = (i: number) => {
    if (!doc) return;
    const v = doc.versions[i];
    if (!v) return;
    setDocs((l) => l.map((d) => (d.id === doc.id ? { ...snapshot(d, 'avant restauration'), blocks: { ...v.blocks }, updatedAt: Date.now() } : d)));
    toast('ok', 'Version restaurée.');
  };

  const score = (n?: number) => (typeof n === 'number' ? `${n.toFixed(1)}/4 · ${SCORE_LABELS[Math.max(0, Math.min(4, Math.round(n)))]}` : '—');
  const pct = (n?: number) => (typeof n === 'number' ? `${Math.round(n * 100)} %` : '—');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Prompt Studio — bac à sable de prompting</h1>
          <div className="text-[13px] text-muted">Blocs structurés → un méga-prompt ; variables, gabarits, aperçu compilé, contrôle maison, jugement JEV, exécution, amélioration, versions.</div>
        </div>
        <Select value={template} onChange={setTemplate} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))} title="Gabarit" />
        <Button size="sm" variant="primary" onClick={() => create(true)}>
          <Plus size={14} /> Depuis le gabarit
        </Button>
        <Button size="sm" onClick={() => create(false)}>
          <Plus size={14} /> Vide
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-line p-2">
          {docs.length === 0 && <div className="p-2 text-[12.5px] text-faint">Aucun prompt : créez-en un depuis un gabarit (comité, impayés, provisions, reporting, design) ou à vide.</div>}
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setCurrentId(d.id);
                setJudge(null);
                setProposal(null);
                setOutput(d.lastRun?.text ?? '');
              }}
              className={`mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-[13px] ${d.id === currentId ? 'bg-accent-soft text-accent' : 'hover:bg-hover'}`}
            >
              <div className="truncate font-medium">{d.name}</div>
              <div className="truncate text-[11px] text-faint">
                {new Date(d.updatedAt).toLocaleDateString('fr-FR')} · {d.versions.length} version(s){d.lastRun ? ` · ${fmtCost(d.lastRun.cost)}` : ''}
              </div>
            </button>
          ))}
        </aside>
        {!doc ? (
          <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-muted">Choisissez ou créez un prompt.</div>
        ) : (
          <>
            <section className="flex min-w-0 flex-1 flex-col overflow-auto p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input value={doc.name} onChange={(e) => update({ name: e.target.value })} className="h-8 w-72" placeholder="Nom du prompt" />
                <Select value={modelId} onChange={(v) => update({ model: v })} options={modelOptions} className="max-w-[320px]" title="Modèle d’exécution" />
                <Input type="number" step="0.1" min="0" max="2" value={doc.temperature ?? ''} onChange={(e) => update({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-8 w-20" placeholder="temp." title="Température (vide = réglage par défaut)" />
                <Button size="sm" variant="danger" onClick={remove} title="Supprimer ce prompt">
                  <Trash2 size={14} />
                </Button>
              </div>
              {BLOCKS.map((b) => (
                <div key={b.id} className="mb-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[12.5px] font-semibold">{b.label}</span>
                    <span className="text-[11px] text-faint">{b.hint}</span>
                  </div>
                  <Textarea value={doc.blocks[b.id]} onChange={(e) => setBlock(b.id, e.target.value)} rows={b.id === 'mission' || b.id === 'depth' ? 4 : 3} className="font-mono text-[12.5px]" />
                  {proposal?.blocks[b.id] !== undefined && proposal.blocks[b.id] !== doc.blocks[b.id] && (
                    <div className="mt-1 rounded-lg border border-accent/40 bg-accent-soft/40 p-2 text-[12px]">
                      <div className="mb-1 font-semibold text-accent">Proposition du modèle</div>
                      <div className="whitespace-pre-wrap">{proposal.blocks[b.id]}</div>
                    </div>
                  )}
                </div>
              ))}
              {vars.length > 0 && (
                <div className="mb-3 rounded-xl border border-line bg-panel p-3">
                  <div className="mb-2 text-[12.5px] font-semibold">Variables {'{{…}}'}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {vars.map((k) => (
                      <label key={k} className="block text-[12px]">
                        <span className="font-mono text-faint">{`{{${k}}}`}</span>
                        <Input value={doc.vars[k] ?? ''} onChange={(e) => setVar(k, e.target.value)} className="mt-0.5 h-7" />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {proposal && (
                <div className="mb-3 rounded-xl border border-accent/40 p-3 text-[12.5px]">
                  <div className="mb-1 font-semibold">Amélioration proposée — {proposal.changes.length} changement(s)</div>
                  <ul className="mb-2 list-disc pl-5 text-muted">
                    {proposal.changes.slice(0, 8).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={applyProposal}>
                      Appliquer (l’ancienne version est conservée)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
                      Ignorer
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <aside className="flex w-[440px] shrink-0 flex-col border-l border-line">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-2">
                <Button size="sm" variant="primary" onClick={run} disabled={running !== null || lintBlocks(lint)} title={lintBlocks(lint) ? 'Corrigez d’abord les erreurs du contrôle' : 'Exécuter le prompt compilé'}>
                  <Play size={14} /> Exécuter
                </Button>
                {running && (
                  <Button size="sm" variant="danger" onClick={stop}>
                    <Square size={14} /> Stop
                  </Button>
                )}
                <Button size="sm" onClick={improve} disabled={running !== null} title="Le modèle réécrit les blocs ; vous appliquez ou non">
                  <Wand2 size={14} /> Améliorer
                </Button>
                <Button size="sm" onClick={judgePrompt} disabled={running !== null} title="JEV juge la clarté, la complétude, le risque d’invention, le risque de secret et le meilleur levier">
                  <Gavel size={14} /> Juger (JEV)
                </Button>
                <Button size="sm" onClick={sendToChat} disabled={lintBlocks(lint)} title="Nouveau chat avec le prompt compilé dans la zone de saisie">
                  <Send size={14} /> Au chat
                </Button>
                <Button size="sm" variant="ghost" onClick={copy} title="Copier le prompt compilé">
                  <Copy size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRight('versions')} title="Versions">
                  <History size={14} /> {doc.versions.length}
                </Button>
              </div>
              <div className="flex gap-1 border-b border-line px-2 pt-1 text-[12.5px]">
                {(['preview', 'run', 'versions'] as const).map((t) => (
                  <button key={t} onClick={() => setRight(t)} className={`rounded-t-md px-2 py-1 ${right === t ? 'bg-hover font-semibold' : 'text-muted hover:text-fg'}`}>
                    {t === 'preview' ? 'Aperçu compilé' : t === 'run' ? 'Réponse' : 'Versions'}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-auto p-3 text-[12.5px]">
                {right === 'preview' && compiled && (
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <Badge tone="info">≈ {compiled.tokens.toLocaleString('fr-FR')} jetons</Badge>
                      <Badge tone={estimate == null ? 'neutral' : 'accent'}>{estimate == null ? 'coût : prix non publié' : `≈ ${fmtCost(estimate)} par exécution (${shortModel(resolvedModel)})`}</Badge>
                      <Badge tone="neutral">{compiled.blocksFilled}/{BLOCKS.length} blocs</Badge>
                    </div>
                    {lint.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {lint.map((l) => (
                          <li key={l.code} className={`rounded-md px-2 py-1 ${l.level === 'error' ? 'bg-err/10 text-err' : l.level === 'warn' ? 'bg-warn/10 text-warn' : 'bg-hover text-muted'}`}>
                            {l.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {judge && (
                      <div className="mb-2 rounded-lg border border-line p-2">
                        <div className="mb-1 font-semibold">Jugement JEV · {fmtCost(judge.cost)} · {judge.ms} ms</div>
                        <div>Clarté : {score(judge.clarity)}</div>
                        <div>Complétude : {score(judge.completeness)}</div>
                        <div>Risque d’invention de chiffres : {pct(judge.inventionRisk)}</div>
                        <div>Risque de secret dans le prompt : {pct(judge.secretRisk)}</div>
                        <div>
                          Meilleur levier : <b>{judge.lever ? (LEVER_LABELS[judge.lever] ?? judge.lever) : '—'}</b>
                          {typeof judge.leverConf === 'number' ? ` (confiance ${Math.round(judge.leverConf * 100)} %)` : ''}
                        </div>
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap rounded-lg bg-panel p-2 font-mono text-[12px]">{compiled.text || '— (aucun bloc rempli)'}</pre>
                  </>
                )}
                {right === 'run' && (
                  <>
                    {doc.lastRun && !running && (
                      <div className="mb-2 text-[11.5px] text-faint">
                        {new Date(doc.lastRun.at).toLocaleString('fr-FR')} · {shortModel(doc.lastRun.model)} · {doc.lastRun.tokensIn.toLocaleString('fr-FR')} → {doc.lastRun.tokensOut.toLocaleString('fr-FR')} jetons · {fmtCost(doc.lastRun.cost)} · {(doc.lastRun.ms / 1000).toFixed(1)} s
                      </div>
                    )}
                    <pre className="whitespace-pre-wrap font-sans">{output || (running === 'run' ? '…' : 'Aucune exécution.')}</pre>
                  </>
                )}
                {right === 'versions' &&
                  (doc.versions.length === 0 ? (
                    <div className="text-faint">Aucune version : une version est conservée à chaque exécution, amélioration appliquée ou restauration.</div>
                  ) : (
                    [...doc.versions].reverse().map((v, k) => {
                      const i = doc.versions.length - 1 - k;
                      return (
                        <div key={v.at} className="mb-2 rounded-lg border border-line p-2">
                          <div className="flex items-center justify-between">
                            <span>
                              v{i + 1} · {new Date(v.at).toLocaleString('fr-FR')}
                              {v.note ? ` · ${v.note}` : ''}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => restore(i)}>
                              Restaurer
                            </Button>
                          </div>
                          <div className="truncate text-faint">{v.blocks.mission.slice(0, 120)}</div>
                        </div>
                      );
                    })
                  ))}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
