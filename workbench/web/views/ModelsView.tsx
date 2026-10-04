import { useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain, Eye, RefreshCw, Sparkles, Wrench } from 'lucide-react';
import { cx, fmtPrice, fmtTokens } from '../lib/format';
import type { ModelInfo } from '../lib/types';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { sortModels } from '../components/chat/Pickers';
import { Badge, Button, Dropdown, Input, Select, Toggle } from '../components/ui';

type SortKey = 'recommended' | 'newest' | 'price_in' | 'price_out' | 'context';

function resolveTier(models: ModelInfo[], patterns: string[], vision: boolean): ModelInfo | undefined {
  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p);
    } catch {
      continue;
    }
    const hit = models.filter((m) => re.test(m.id) && m.capabilities.tools && (!vision || m.capabilities.vision) && !m.id.endsWith(':free') && !m.id.startsWith('~')).sort((a, b) => b.created - a.created)[0];
    if (hit) return hit;
  }
  return undefined;
}

export function ModelsView() {
  const models = useApp((s) => s.models);
  const settings = useApp((s) => s.settings);
  const save = useApp((s) => s.saveSettings);
  const loadModels = useApp((s) => s.loadModels);
  const modelsError = useApp((s) => s.modelsError);
  const patch = useSession((s) => s.patchSession);
  const sessionModel = useSession((s) => s.detail?.session.model);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('recommended');
  const [tools, setTools] = useState(true);
  const [vision, setVision] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [provider, setProvider] = useState('all');
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))].sort(), [models]);

  const list = useMemo(() => {
    let l = models.filter(
      (m) =>
        (!tools || m.capabilities.tools) &&
        (!vision || m.capabilities.vision) &&
        (!reasoning || m.capabilities.reasoning) &&
        (provider === 'all' || m.provider === provider) &&
        (!q || `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())),
    );
    if (sort === 'recommended') l = sortModels(l);
    else if (sort === 'newest') l = [...l].sort((a, b) => b.created - a.created);
    else if (sort === 'context') l = [...l].sort((a, b) => b.contextLength - a.contextLength);
    else {
      const k = sort === 'price_in' ? 'inputPrice' : 'outputPrice';
      l = [...l].sort((a, b) => (a[k] ?? 1e9) - (b[k] ?? 1e9));
    }
    return l;
  }, [models, q, sort, tools, vision, reasoning, provider]);
  const virt = useVirtualizer({ count: list.length, getScrollElement: () => scroller, estimateSize: () => 52, overscan: 12 });

  const setRole = (key: 'defaultModel' | 'fallbackModel' | 'secondFallbackModel' | 'reviewModel', id: string) => void save({ [key]: id });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-4">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="text-[18px] font-semibold">Modèles</h1>
          <Badge>{models.length} via OpenRouter</Badge>
          <Button size="sm" variant="ghost" onClick={() => void loadModels(true)}>
            <RefreshCw size={13} /> Actualiser le catalogue
          </Button>
          {modelsError && <span className="text-[12px] text-err">{modelsError}</span>}
        </div>
        {settings && (
          <div className="mb-3 grid gap-2 text-[12.5px] md:grid-cols-5">
            {(['fast', 'balanced', 'powerful', 'reasoning', 'vision'] as const).map((tier) => {
              const m = resolveTier(models, settings.autoTiers[tier], tier === 'vision');
              return (
                <div key={tier} className="rounded-lg border border-line bg-panel px-3 py-2" title={settings.autoTiers[tier].join('\n')}>
                  <div className="text-[11px] uppercase tracking-wide text-faint">AUTO · {({ fast: 'rapide', balanced: 'équilibré', powerful: 'puissant', reasoning: 'raisonnement', vision: 'vision' } as const)[tier]}</div>
                  <div className="truncate font-medium">{m?.name.replace(/^[^:]+:\s*/, '') ?? '—'}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Input className="h-8 max-w-xs" placeholder="Rechercher (claude, gpt, gemini, deepseek, glm…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={provider} onChange={setProvider} options={[{ value: 'all', label: 'Tous les fournisseurs' }, ...providers.map((p) => ({ value: p, label: p }))]} />
          <Select value={sort} onChange={setSort} options={[{ value: 'recommended', label: 'Recommandés' }, { value: 'newest', label: 'Plus récents' }, { value: 'price_in', label: 'Prix entrée ↑' }, { value: 'price_out', label: 'Prix sortie ↑' }, { value: 'context', label: 'Contexte ↓' }]} />
          <Toggle checked={tools} onChange={setTools} label="Outils" />
          <Toggle checked={vision} onChange={setVision} label="Vision" />
          <Toggle checked={reasoning} onChange={setReasoning} label="Raisonnement" />
          <span className="ml-auto text-[12px] text-muted">{list.length} modèles</span>
        </div>
      </div>
      <div ref={setScroller} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const m = list[vi.index]!;
            const tags = [settings?.defaultModel === m.id && 'défaut', settings?.fallbackModel === m.id && 'repli 1', settings?.secondFallbackModel === m.id && 'repli 2', settings?.reviewModel === m.id && 'relecture', sessionModel === m.id && 'session'].filter(Boolean) as string[];
            return (
              <div key={m.id} className="absolute left-0 right-0 flex items-center gap-3 border-b border-line/60 px-4 hover:bg-hover/50" style={{ height: 52, transform: `translateY(${vi.start}px)` }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{m.name.replace(/^[^:]+:\s*/, '')}</span>
                    {tags.map((t) => (
                      <Badge key={t} tone="accent">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-faint">{m.id}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-faint">
                  {m.capabilities.tools && <Wrench size={13} aria-label="Outils" />}
                  {m.capabilities.vision && <Eye size={13} aria-label="Vision" />}
                  {m.capabilities.reasoning && <Brain size={13} aria-label="Raisonnement" />}
                </div>
                <div className="w-20 shrink-0 text-right text-[12px] tabular-nums text-muted">{fmtTokens(m.contextLength)}</div>
                <div className="w-36 shrink-0 text-right text-[12px] tabular-nums">
                  {fmtPrice(m.inputPrice)} / {fmtPrice(m.outputPrice)}
                  <div className="text-[10.5px] text-faint">entrée / sortie par M</div>
                </div>
                <Dropdown
                  trigger={<span className={cx('inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[12px] hover:bg-hover')}><Sparkles size={12} /> Utiliser</span>}
                  items={[
                    { value: 'session', label: 'Pour cette session' },
                    { value: 'defaultModel', label: 'Modèle par défaut' },
                    { value: 'fallbackModel', label: 'Repli n°1' },
                    { value: 'secondFallbackModel', label: 'Repli n°2' },
                    { value: 'reviewModel', label: 'Modèle de relecture (Review my work)' },
                  ]}
                  onSelect={(v) => (v === 'session' ? void patch({ model: m.id }) : setRole(v as 'defaultModel', m.id))}
                  align="right"
                  width={260}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
