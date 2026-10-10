import { useMemo, useRef, useState } from 'react';
import { KeyRound, LogOut, RefreshCw, Upload, Download } from 'lucide-react';
import type { EffortSetting } from '@shared/types';
import { Badge, Button, Field, Input, Section, Select, Toggle } from '../../web/components/ui';
import { fmtCost, fmtPrice, shortModel } from '../../web/lib/format';
import { clearKey, getKey, loadCatalog, maskKey, provider, setKey } from '../lib/llm';
import { refreshCredits } from '../lib/credits';
import { kv } from '../lib/db';
import { useStore } from '../lib/store';
import { download } from '../lib/vfs';
import { BenchmarkLab } from '../../web/components/BenchmarkLab';
import { runBenchmark } from '../lib/bench';
import { INTEL_ENDPOINT, parseIntel, type IntelData } from '../../server/llm/modelIntel';
import { DEFAULT_AUTO_TIERS } from '../../server/services/settings';

/** Browser refresh of the scores: works only if OpenRouter allows this origin (CORS). */
async function browserIntel(models: { id: string; slug?: string }[]): Promise<IntelData> {
  const r = await fetch(INTEL_ENDPOINT);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = parseIntel(
    await r.json(),
    models.map((m) => ({ id: m.id, canonical_slug: m.slug })),
  );
  void kv.set('intel', d);
  return d;
}

export function ModelsView() {
  const [tab, setTab] = useState<'bench' | 'catalog'>('bench');
  const models = useStore((s) => s.models);
  const health = useStore((s) => s.health);
  const board = useStore((s) => s.board);
  const bench = useStore((s) => s.bench);
  if (tab === 'bench')
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-[18px] font-semibold">Modèles — priorités et coûts</h1>
            <div className="text-[13px] text-muted">
              {models.length} modèles OpenRouter · le moins cher capable de réussir chaque tâche, puis son
              secours.
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTab('catalog')}>
            Catalogue complet
          </Button>
        </div>
        <BenchmarkLab
          models={models}
          tiers={DEFAULT_AUTO_TIERS}
          health={health}
          board={board}
          refreshIntel={() => browserIntel(models)}
          bench={bench}
          runBench={(m) => runBenchmark(m)}
          onIntelImported={(d) => void kv.set('intel', d)}
          onUse={(id, role) =>
            useStore
              .getState()
              .patchSettings(role === 'default' ? { defaultModel: id } : { fallbackModel: id })
          }
        />
      </div>
    );
  return <CatalogView onBench={() => setTab('bench')} />;
}

function CatalogView({ onBench }: { onBench: () => void }) {
  const models = useStore((s) => s.models);
  const error = useStore((s) => s.modelsError);
  const def = useStore((s) => s.settings.defaultModel);
  const [q, setQ] = useState('');
  const [onlyTools, setOnlyTools] = useState(true);
  const list = useMemo(
    () =>
      models
        .filter(
          (m) =>
            (!onlyTools || m.capabilities.tools) &&
            (!q || `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())),
        )
        .sort((a, b) => b.created - a.created)
        .slice(0, 400),
    [models, q, onlyTools],
  );
  return (
    <div className="mx-auto flex h-full max-w-[1100px] flex-col p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Modèles OpenRouter</h1>
          <div className="text-[13px] text-muted">
            Catalogue en direct : {models.length} modèles. Prix réels en $ par million de tokens (entrée /
            sortie).
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onBench}>
          Priorités & benchmark
        </Button>
        <Toggle checked={onlyTools} onChange={setOnlyTools} label="Compatibles agents (outils)" />
        <Input className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" />
        <Button
          size="sm"
          onClick={() =>
            void loadCatalog(true)
              .then((m) => useStore.setState({ models: m, modelsError: null }))
              .catch((e: Error) => useStore.setState({ modelsError: e.message }))
          }
        >
          <RefreshCw size={13} />
        </Button>
      </div>
      {error && <div className="mb-2 text-[13px] text-err">Catalogue indisponible : {error}</div>}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-elev text-left text-faint">
            <tr>
              <th className="px-3 py-2">Modèle</th>
              <th className="px-3 py-2">Entrée</th>
              <th className="px-3 py-2">Sortie</th>
              <th className="px-3 py-2">Contexte</th>
              <th className="px-3 py-2">Capacités</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="border-t border-line hover:bg-hover/50">
                <td className="px-3 py-1.5">
                  <div className="font-medium">{shortModel(m.id)}</div>
                  <div className="text-[11px] text-faint">{m.provider}</div>
                </td>
                <td className="px-3 py-1.5">{fmtPrice(m.inputPrice)}</td>
                <td className="px-3 py-1.5">{fmtPrice(m.outputPrice)}</td>
                <td className="px-3 py-1.5">{Math.round(m.contextLength / 1000)}k</td>
                <td className="space-x-1 px-3 py-1.5">
                  {m.capabilities.tools && <Badge>outils</Badge>}
                  {m.capabilities.vision && <Badge tone="info">vision</Badge>}
                  {m.capabilities.reasoning && <Badge tone="accent">raisonnement</Badge>}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {def === m.id ? (
                    <Badge tone="ok">par défaut</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => useStore.getState().patchSettings({ defaultModel: m.id })}
                    >
                      Par défaut
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsView({ onLogout }: { onLogout: () => void }) {
  const s = useStore((x) => x.settings);
  const patch = useStore((x) => x.patchSettings);
  const models = useStore((x) => x.models);
  const [newKey, setNewKey] = useState('');
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const modelOptions = [
    { value: 'auto', label: 'Auto (routage intelligent)' },
    ...models
      .filter((m) => m.capabilities.tools)
      .sort((a, b) => b.created - a.created)
      .map((m) => ({ value: m.id, label: shortModel(m.id) })),
  ];

  const exportAll = async () => {
    const keys = await kv.keys();
    const dump: Record<string, unknown> = {};
    for (const k of keys) dump[k] = await kv.get(k);
    download(
      `workbench-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 1, data: dump }),
      'application/json',
    );
  };

  return (
    <div className="mx-auto h-full max-w-[760px] overflow-auto p-6">
      <h1 className="mb-4 text-[18px] font-semibold">Réglages</h1>
      <Section title="Fournisseur IA — OpenRouter">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px]">
            <KeyRound size={14} className="text-faint" /> Clé enregistrée :{' '}
            <span className="font-mono">{maskKey(getKey())}</span>
            <span className="text-faint">
              ({s.rememberKey ? 'mémorisée sur cet ordinateur' : 'oubliée à la fermeture'})
            </span>
          </div>
          <Field label="Remplacer la clé">
            <div className="flex gap-2">
              <Input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="sk-or-v1-…"
              />
              <Button
                disabled={!newKey.trim().startsWith('sk-') || checking}
                onClick={async () => {
                  setChecking(true);
                  const old = getKey();
                  setKey(newKey, s.rememberKey);
                  const st = await provider.keyStatus();
                  setChecking(false);
                  if (!st.connected) {
                    setKey(old, s.rememberKey);
                    useStore.getState().toast('err', `Clé refusée : ${st.error ?? 'erreur'}`);
                    return;
                  }
                  setNewKey('');
                  void refreshCredits();
                  useStore.getState().toast('ok', 'Clé enregistrée');
                }}
              >
                Enregistrer
              </Button>
            </div>
          </Field>
          <Toggle
            checked={s.rememberKey}
            onChange={(v) => {
              const k = getKey();
              patch({ rememberKey: v });
              if (k) setKey(k, v);
            }}
            label="Mémoriser la clé sur cet ordinateur"
          />
          <div className="mt-3">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (!confirm('Supprimer la clé de ce navigateur ?')) return;
                clearKey();
                onLogout();
              }}
            >
              <LogOut size={13} /> Supprimer la clé
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Modèle et agent">
        <div className="grid gap-x-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
          <Field label="Modèle par défaut (nouvelles sessions)">
            <Select
              value={s.defaultModel}
              onChange={(v) => patch({ defaultModel: v })}
              options={modelOptions}
            />
          </Field>
          <Field label="Modèle de secours" hint="Utilisé seulement si « Garder le même modèle » est désactivé">
            <Select
              value={s.fallbackModel}
              onChange={(v) => patch({ fallbackModel: v })}
              options={[{ value: '', label: '— aucun —' }, ...modelOptions.slice(1)]}
            />
          </Field>
          <Field label="Garder le même modèle pendant toute la discussion" hint="Aucun changement automatique de modèle en cours de chat (routage, escalade, repli). « Auto » choisit une seule fois, au premier message.">
            <span data-testid="pin-model">
              <Toggle checked={s.pinModel !== false} onChange={(v) => patch({ pinModel: v })} />
            </span>
          </Field>
          <Field label="Niveau de réflexion par défaut">
            <Select<EffortSetting>
              value={s.effort}
              onChange={(v) => patch({ effort: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'low', label: 'Rapide' },
                { value: 'medium', label: 'Moyen' },
                { value: 'high', label: 'Élevé' },
                { value: 'max', label: 'Maximum' },
              ]}
            />
          </Field>
          <Field label="Étapes maximum par tâche">
            <Input
              type="number"
              min={1}
              max={200}
              value={s.maxSteps}
              onChange={(e) => patch({ maxSteps: Math.max(1, Math.min(200, Number(e.target.value) || 40)) })}
            />
          </Field>
        </div>
      </Section>

      <Section title="Internet (Brave Search) et vision">
        <div className="grid gap-x-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
          <Field label="Clé Brave Search" hint="Offre gratuite Brave (api.search.brave.com). Les résultats vont directement au modèle : aucun appel LLM de synthèse.">
            <Input type="password" value={s.braveKey ?? ''} onChange={(e) => patch({ braveKey: e.target.value.trim() })} placeholder="BSA…" data-testid="brave-key" />
          </Field>
          <Field label="Relais Brave (URL)" hint="Brave bloque les appels directs d’un navigateur : déployez relay/brave-relay (Supabase) et collez son URL.">
            <Input value={s.braveRelay ?? ''} onChange={(e) => patch({ braveRelay: e.target.value.trim() })} placeholder="https://xxxx.supabase.co/functions/v1/brave-relay" />
          </Field>
          <Field label="Si Brave échoue, utiliser la recherche OpenRouter (payante)">
            <Toggle checked={s.braveFallback !== false} onChange={(v) => patch({ braveFallback: v })} />
          </Field>
          <Field label="Pont vision JEV" hint="Un modèle sans vision reçoit la description exacte et l’OCR de l’image, lue une seule fois par un petit modèle vision (cache).">
            <Toggle checked={s.visionBridge !== false} onChange={(v) => patch({ visionBridge: v })} />
          </Field>
          <Field label="Modèle vision du pont" hint="Vide = gratuit d’abord, puis le moins cher">
            <Select
              value={s.visionModel ?? ''}
              onChange={(v) => patch({ visionModel: v })}
              options={[{ value: '', label: 'Automatique (le moins cher)' }, ...models.filter((m) => m.capabilities.vision).map((m) => ({ value: m.id, label: shortModel(m.id) }))]}
            />
          </Field>
        </div>
      </Section>

      <Section title="Budget">
        <div className="grid gap-x-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2">
          <Field label="Par tâche ($, 0 = illimité)">
            <Input
              type="number"
              min={0}
              step={0.1}
              value={s.budgetPerTask}
              onChange={(e) => patch({ budgetPerTask: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field
            label="Par jour ($, 0 = illimité)"
            hint={`Dépensé aujourd’hui : ${fmtCost(useStore.getState().spend[new Date().toISOString().slice(0, 10)] ?? 0)}`}
          >
            <Input
              type="number"
              min={0}
              step={0.5}
              value={s.budgetDaily}
              onChange={(e) => patch({ budgetDaily: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </div>
      </Section>

      <Section title="Données de ce navigateur">
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-panel p-4">
          <Button onClick={() => void exportAll()}>
            <Download size={14} /> Sauvegarder (sessions, fichiers, skills, agents)
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const parsed = JSON.parse(await f.text()) as { data: Record<string, unknown> };
                for (const [k, v] of Object.entries(parsed.data)) await kv.set(k, v);
                location.reload();
              } catch (err) {
                useStore.getState().toast('err', `Sauvegarde invalide : ${(err as Error).message}`);
              }
            }}
          />
          <Button onClick={() => input.current?.click()}>
            <Upload size={14} /> Restaurer une sauvegarde
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm('Effacer toutes les sessions, fichiers, skills et agents de ce navigateur ?'))
                return;
              await kv.clear();
              location.reload();
            }}
          >
            Tout effacer
          </Button>
        </div>
        <div className="mt-2 text-[12px] text-faint">
          La sauvegarde ne contient jamais votre clé OpenRouter.
        </div>
      </Section>
    </div>
  );
}
