import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, LogOut, Moon, Shield, Sun, XCircle } from 'lucide-react';
import type { ChartData } from '@shared/types';
import { api, getConnection } from '../lib/api';
import { fmtCost, fmtTime, fmtTokens, shortModel } from '../lib/format';
import type { AppSettings } from '../lib/types';
import { useApp } from '../store/app';
import { useSession } from '../store/session';
import { ModelPicker } from '../components/chat/Pickers';
import { ChartView } from '../components/rich';
import {
  Badge,
  Button,
  Field,
  Input,
  Section,
  Select,
  Spinner,
  Tabs,
  Textarea,
  Toggle,
} from '../components/ui';

type Tab = 'providers' | 'budget' | 'agent' | 'auto' | 'web' | 'usage' | 'security' | 'appearance';

interface KeyStatus {
  configured: boolean;
  connected: boolean;
  label?: string;
  limit?: number | null;
  limitRemaining?: number | null;
  usage?: number;
  isFreeTier?: boolean;
  error?: string;
}

function NumberField({
  label,
  value,
  onSave,
  step = 1,
  hint,
  min = 0,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
  step?: number;
  hint?: string;
  min?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step={step}
        min={min}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => Number(v) !== value && !Number.isNaN(Number(v)) && onSave(Number(v))}
        className="max-w-48"
      />
    </Field>
  );
}

function ProvidersTab({ s, save }: { s: AppSettings; save: (p: Record<string, unknown>) => Promise<void> }) {
  const models = useApp((x) => x.models);
  const toast = useApp((x) => x.toast);
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState('');
  const load = (force = false) =>
    void api<KeyStatus>('/api/provider/status', { query: { force: force ? 1 : undefined } }).then(setStatus);
  useEffect(() => load(), []);
  return (
    <>
      <Section title="OpenRouter">
        <div className="mb-3 rounded-xl border border-line bg-panel p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <KeyRound size={15} />
            <span className="font-medium">Clé API</span>
            {!status ? (
              <Spinner />
            ) : status.connected ? (
              <Badge tone="ok">
                <CheckCircle2 size={11} /> connecté{status.label ? ` · ${status.label}` : ''}
              </Badge>
            ) : (
              <Badge tone="err">
                <XCircle size={11} /> {status.error ?? 'non connecté'}
              </Badge>
            )}
            <Badge>
              {status?.configured ? 'OPENROUTER_API_KEY définie' : 'OPENROUTER_API_KEY absente (proxy ?)'}
            </Badge>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => load(true)}>
              Tester
            </Button>
          </div>
          {status?.connected && (
            <div className="mb-2 text-[12.5px] text-muted">
              {status.limit !== null && status.limit !== undefined
                ? `Limite ${fmtCost(status.limit, 2)} · restant ${fmtCost(status.limitRemaining ?? 0, 2)}`
                : 'Sans limite de clé'}{' '}
              · utilisé {fmtCost(status.usage ?? 0, 3)}
              {status.isFreeTier ? ' · offre gratuite' : ''}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setStatus(await api<KeyStatus>('/api/settings/provider-key', { body: { key } }));
                setKey('');
                toast('success', 'Clé enregistrée côté serveur (.env) — elle ne sera plus affichée');
              } catch (err) {
                toast('error', (err as Error).message);
              }
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk-or-v1-… (enregistrée uniquement dans le .env du serveur)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={key.length < 10}>
              Enregistrer
            </Button>
            {status?.configured && (
              <Button
                type="button"
                variant="danger"
                onClick={async () => {
                  if (!confirm('Retirer la clé du fichier .env ?')) return;
                  await api('/api/settings/provider-key', { method: 'DELETE' });
                  load(true);
                }}
              >
                Retirer
              </Button>
            )}
          </form>
        </div>
      </Section>
      <Section title="Modèles">
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ['defaultModel', 'Modèle par défaut (nouvelles sessions)'],
              ['fallbackModel', 'Repli n°1 (si le modèle échoue)'],
              ['secondFallbackModel', 'Repli n°2'],
              ['reviewModel', 'Modèle de relecture (Review my work)'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-input px-1">
                <ModelPicker
                  value={s[k] || 'auto'}
                  models={models}
                  onChange={(id) => void save({ [k]: id === 'auto' && k !== 'defaultModel' ? '' : id })}
                  placement="bottom"
                />
                {s[k] && k !== 'defaultModel' && (
                  <button
                    className="ml-auto pr-2 text-[11.5px] text-faint hover:text-err"
                    onClick={() => void save({ [k]: '' })}
                  >
                    retirer
                  </button>
                )}
              </div>
            </Field>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField
            label="Température"
            value={s.temperature}
            step={0.1}
            onSave={(v) => void save({ temperature: v })}
          />
          <NumberField
            label="Tokens de sortie max"
            value={s.maxTokens}
            step={1000}
            onSave={(v) => void save({ maxTokens: v })}
            hint="Limité par le maximum du modèle"
          />
        </div>
      </Section>
    </>
  );
}

function UsageTab() {
  const [u, setU] = useState<{
    today: { cost: number; calls: number };
    month: { cost: number; calls: number; promptTokens: number; completionTokens: number };
    byModel: { model: string; cost: number; promptTokens: number; completionTokens: number; calls: number }[];
    byDay: { day: string; cost: number; tokens: number }[];
  } | null>(null);
  useEffect(() => void api<NonNullable<typeof u>>('/api/usage').then(setU), []);
  if (!u) return <Spinner />;
  const chart: ChartData = {
    spec: { type: 'bar', title: 'Coût par jour', source: { path: '' } },
    categories: u.byDay.map((d) => d.day.slice(5)),
    series: [{ name: 'Coût ($)', data: u.byDay.map((d) => Math.round(d.cost * 10000) / 10000) }],
    rowCount: u.byDay.length,
  };
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["Aujourd'hui", fmtCost(u.today.cost), `${u.today.calls} appels`],
          ['Ce mois', fmtCost(u.month.cost), `${u.month.calls} appels`],
          ['Tokens entrée (mois)', fmtTokens(u.month.promptTokens), ''],
          ['Tokens sortie (mois)', fmtTokens(u.month.completionTokens), ''],
        ].map(([l, v, sub]) => (
          <div key={l} className="rounded-xl border border-line bg-panel p-3">
            <div className="text-[11.5px] text-muted">{l}</div>
            <div className="text-[19px] font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-faint">{sub}</div>
          </div>
        ))}
      </div>
      <Section title="30 derniers jours">
        <div className="rounded-xl border border-line bg-panel p-3">
          {u.byDay.length ? (
            <ChartView data={chart} height={220} />
          ) : (
            <div className="text-[13px] text-faint">Aucune donnée.</div>
          )}
        </div>
      </Section>
      <Section title="Par modèle (mois)">
        <div className="divide-y divide-line rounded-xl border border-line">
          {u.byModel.map((m) => (
            <div key={m.model} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate" title={m.model}>
                {shortModel(m.model)}
              </span>
              <span className="text-faint">{m.calls} appels</span>
              <span className="w-24 text-right tabular-nums text-muted">
                {fmtTokens(m.promptTokens + m.completionTokens)}
              </span>
              <span className="w-20 text-right tabular-nums">{fmtCost(m.cost)}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function SecurityTab() {
  const [audit, setAudit] = useState<
    {
      id: number;
      ts: number;
      actor: string;
      action: string;
      target: string | null;
      decision: string | null;
      details: string | null;
    }[]
  >([]);
  const patch = useSession((s) => s.patchSession);
  const detail = useSession((s) => s.detail);
  useEffect(() => void api<typeof audit>('/api/audit', { query: { limit: 400 } }).then(setAudit), []);
  return (
    <>
      <Section title="Session courante">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <Toggle
            checked={Boolean(detail?.settings.autoApproveEdits)}
            onChange={(v) => void patch({ autoApproveEdits: v })}
            label="Accepter automatiquement les modifications de fichiers (mode NORMAL)"
            disabled={!detail}
          />
          <span className="text-muted">
            Autorisations mémorisées : {detail?.settings.grants?.length ?? 0}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!detail?.settings.grants?.length}
            onClick={() => void patch({ resetGrants: true })}
          >
            Réinitialiser
          </Button>
        </div>
        <div className="mt-2 text-[12px] text-faint">
          Protégés en permanence : .env, clés SSH/AWS, *.pem, jetons, .git interne. Commandes destructrices
          bloquées (sudo, rm -rf /, mkfs, curl | sh…) ; git push jamais exécuté sans confirmation.
        </div>
      </Section>
      <Section title="Journal d'audit">
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-line font-mono text-[11.5px]">
          {audit.map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-line/60 px-3 py-1">
              <span className="w-16 shrink-0 text-faint">{fmtTime(a.ts)}</span>
              <span className="w-14 shrink-0">{a.actor}</span>
              <span className="w-44 shrink-0 truncate text-accent">{a.action}</span>
              <span className="w-16 shrink-0 text-muted">{a.decision ?? ''}</span>
              <span className="min-w-0 flex-1 truncate" title={`${a.target ?? ''} ${a.details ?? ''}`}>
                {a.target} {a.details}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

export function SettingsView() {
  const s = useApp((x) => x.settings);
  const saveSettings = useApp((x) => x.saveSettings);
  const theme = useApp((x) => x.theme);
  const setTheme = useApp((x) => x.setTheme);
  const disconnect = useApp((x) => x.disconnect);
  const status = useApp((x) => x.status);
  const [tab, setTab] = useState<Tab>('providers');
  const [tiers, setTiers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (s) setTiers(Object.fromEntries(Object.entries(s.autoTiers).map(([k, v]) => [k, v.join('\n')])));
  }, [s]);
  if (!s) return <Spinner />;
  const save = (p: Record<string, unknown>) => saveSettings(p);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'providers', label: 'Fournisseurs IA' },
          { id: 'budget', label: 'Budget' },
          { id: 'agent', label: 'Agent' },
          { id: 'auto', label: 'Routage AUTO' },
          { id: 'web', label: 'Recherche web' },
          { id: 'usage', label: 'Utilisation' },
          { id: 'security', label: 'Sécurité' },
          { id: 'appearance', label: 'Apparence & connexion' },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-4xl">
          {tab === 'providers' && <ProvidersTab s={s} save={save} />}
          {tab === 'budget' && (
            <Section title="Limites de dépenses (0 = illimité)">
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Budget journalier ($)"
                  value={s.budget.daily}
                  step={0.5}
                  onSave={(v) => void save({ budget: { ...s.budget, daily: v } })}
                />
                <NumberField
                  label="Budget mensuel ($)"
                  value={s.budget.monthly}
                  step={1}
                  onSave={(v) => void save({ budget: { ...s.budget, monthly: v } })}
                />
                <NumberField
                  label="Budget par tâche ($)"
                  value={s.budget.perTask}
                  step={0.1}
                  onSave={(v) => void save({ budget: { ...s.budget, perTask: v } })}
                  hint="L'agent s'arrête proprement s'il dépasse ce montant."
                />
                <NumberField
                  label="Seuil d'alerte (0–1)"
                  value={s.budget.warnAt}
                  step={0.05}
                  onSave={(v) => void save({ budget: { ...s.budget, warnAt: v } })}
                />
              </div>
              <div className="text-[12px] text-faint">
                Les coûts affichés sont ceux renvoyés par OpenRouter pour chaque appel (ou calculés depuis ses
                prix publiés).
              </div>
            </Section>
          )}
          {tab === 'agent' && (
            <Section title="Boucle d'agent">
              <div className="grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Étapes max par tâche"
                  value={s.agent.maxSteps}
                  onSave={(v) => void save({ agent: { ...s.agent, maxSteps: v } })}
                  min={1}
                />
                <NumberField
                  label="Tentatives max (erreurs réseau/modèle)"
                  value={s.agent.maxRetries}
                  onSave={(v) => void save({ agent: { ...s.agent, maxRetries: v } })}
                />
                <NumberField
                  label="Délai par outil (s)"
                  value={s.agent.toolTimeoutSec}
                  onSave={(v) => void save({ agent: { ...s.agent, toolTimeoutSec: v } })}
                  min={5}
                />
                <NumberField
                  label="Profondeur des sous-agents"
                  value={s.agent.maxSubagentDepth}
                  onSave={(v) => void save({ agent: { ...s.agent, maxSubagentDepth: v } })}
                />
                <Field label="Mode de permissions par défaut">
                  <Select
                    value={s.defaultPermissionMode}
                    onChange={(v) => void save({ defaultPermissionMode: v })}
                    options={[
                      { value: 'safe', label: 'SAFE — lecture seule' },
                      { value: 'normal', label: 'NORMAL — demander' },
                      { value: 'autonomous', label: 'AUTONOMOUS — autonome' },
                    ]}
                  />
                </Field>
                <div className="pt-6">
                  <Toggle
                    checked={s.agent.parallelReads}
                    onChange={(v) => void save({ agent: { ...s.agent, parallelReads: v } })}
                    label="Lectures en parallèle (plus rapide)"
                  />
                </div>
                <div className="pt-1">
                  <Toggle
                    checked={s.mcp.autoConnect}
                    onChange={(v) => void save({ mcp: { ...s.mcp, autoConnect: v } })}
                    label="Connecter automatiquement les plugins MCP"
                  />
                </div>
              </div>
            </Section>
          )}
          {tab === 'auto' && (
            <Section title="Familles de modèles par palier (expressions régulières, la plus récente l'emporte)">
              <div className="mb-3 text-[12.5px] text-muted">
                En mode AUTO,{' '}
                {status?.jev?.available
                  ? 'Jev (TypeSafe) classe la demande'
                  : 'des heuristiques classent la demande'}{' '}
                (rapide, équilibré, puissant, raisonnement, vision), puis le modèle le plus récent de la
                première famille disponible est choisi dans le catalogue OpenRouter en direct.
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.keys(tiers).map((k) => (
                  <Field key={k} label={k}>
                    <Textarea
                      rows={4}
                      className="font-mono text-[12px]"
                      value={tiers[k]}
                      onChange={(e) => setTiers({ ...tiers, [k]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <Button
                variant="primary"
                onClick={() =>
                  void save({
                    autoTiers: Object.fromEntries(
                      Object.entries(tiers).map(([k, v]) => [
                        k,
                        v
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      ]),
                    ),
                  })
                }
              >
                Enregistrer les paliers
              </Button>
            </Section>
          )}
          {tab === 'web' && (
            <Section title="web.search">
              <Field
                label="Fournisseur"
                hint="Brave nécessite BRAVE_API_KEY. Le plugin web d'OpenRouter utilise votre clé OpenRouter (facturé par résultat)."
              >
                <Select
                  value={s.webSearchProvider}
                  onChange={(v) => void save({ webSearchProvider: v })}
                  options={[
                    { value: 'auto', label: 'Automatique' },
                    { value: 'openrouter', label: 'OpenRouter (plugin web)' },
                    { value: 'brave', label: 'Brave Search API' },
                  ]}
                />
              </Field>
              <Field
                label="Modèle utilisé pour la recherche OpenRouter"
                hint="Vide = modèle rapide du palier AUTO."
              >
                <Input
                  defaultValue={s.webSearchModel}
                  onBlur={(e) =>
                    e.target.value !== s.webSearchModel &&
                    void save({ webSearchModel: e.target.value.trim() })
                  }
                  placeholder="ex. google/gemini-2.5-flash"
                />
              </Field>
            </Section>
          )}
          {tab === 'usage' && <UsageTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'appearance' && (
            <>
              <Section title="Thème">
                <div className="flex gap-2">
                  <Button
                    variant={theme === 'dark' ? 'primary' : 'secondary'}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon size={14} /> Sombre
                  </Button>
                  <Button
                    variant={theme === 'light' ? 'primary' : 'secondary'}
                    onClick={() => setTheme('light')}
                  >
                    <Sun size={14} /> Clair
                  </Button>
                </div>
              </Section>
              <Section title="Connexion à l'agent local">
                <div className="rounded-xl border border-line bg-panel p-3.5 text-[12.5px]">
                  <div className="mb-1">
                    Serveur : <code className="font-mono">{getConnection()?.baseUrl}</code>
                  </div>
                  <div className="mb-1">
                    Projets : <code className="font-mono">{status?.workspaceRoot}</code>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge tone={status?.browser.available ? 'ok' : 'err'}>
                      navigateur {status?.browser.engine}
                    </Badge>
                    <Badge tone={status?.python ? 'ok' : 'neutral'}>python3</Badge>
                    <Badge tone={status?.ripgrep ? 'ok' : 'neutral'}>ripgrep</Badge>
                    <Badge tone={status?.jev?.available ? 'ok' : 'neutral'}>Jev</Badge>
                    <Badge>aperçu :{status?.previewPort}</Badge>
                  </div>
                  <Button variant="danger" onClick={disconnect}>
                    <LogOut size={14} /> Se déconnecter
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-faint">
                  <Shield size={12} /> Le jeton d'accès reste dans ce navigateur ; la clé OpenRouter ne quitte
                  jamais le serveur.
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
