import { useCallback, useEffect, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Plug,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import type { McpPreset, McpServerInfo } from '../lib/types';
import { useApp } from '../store/app';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Section,
  Select,
  Spinner,
  Textarea,
  Toggle,
} from '../components/ui';

const STATUS: Record<
  McpServerInfo['status'],
  { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'info' }
> = {
  connected: { label: 'connecté', tone: 'ok' },
  connecting: { label: 'connexion…', tone: 'info' },
  needs_auth: { label: 'autorisation requise', tone: 'warn' },
  error: { label: 'erreur', tone: 'err' },
  disconnected: { label: 'déconnecté', tone: 'neutral' },
  disabled: { label: 'désactivé', tone: 'neutral' },
};

function parsePairs(text: string, sep: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(sep);
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + sep.length).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function ServerCard({ s, reload }: { s: McpServerInfo; reload: () => void }) {
  const toast = useApp((x) => x.toast);
  const [open, setOpen] = useState(false);
  const [testTool, setTestTool] = useState<string | null>(null);
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState<string | null>(null);
  const st = STATUS[s.status];
  const act = async (path: string, body?: unknown) => {
    try {
      await api(`/api/mcp/${encodeURIComponent(s.name)}${path}`, { body: body ?? {} });
    } catch (err) {
      toast('error', (err as Error).message);
    }
    reload();
  };
  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span
          className={cx(
            'h-2.5 w-2.5 rounded-full',
            s.status === 'connected'
              ? 'bg-ok'
              : s.status === 'error'
                ? 'bg-err'
                : s.status === 'needs_auth'
                  ? 'bg-warn'
                  : s.status === 'connecting'
                    ? 'bg-info wb-pulse'
                    : 'bg-faint',
          )}
        />
        <button className="flex items-center gap-1.5 font-semibold" onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={14} className={cx('text-faint transition', open && 'rotate-90')} /> {s.name}
        </button>
        <Badge tone={st.tone}>{st.label}</Badge>
        {s.toolCount > 0 && <Badge tone="info">{s.toolCount} outils</Badge>}
        <span className="truncate text-[12px] text-faint">
          {s.config.url ?? `${s.config.command ?? ''} ${(s.config.args ?? []).join(' ')}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {s.status === 'needs_auth' && s.authUrl && (
            <Button size="sm" variant="primary" onClick={() => window.open(s.authUrl, '_blank', 'noopener')}>
              <KeyRound size={13} /> Autoriser
            </Button>
          )}
          {s.config.enabled && s.status !== 'connected' && s.status !== 'connecting' && (
            <Button size="sm" onClick={() => void act('/connect')}>
              <RefreshCw size={13} /> Connecter
            </Button>
          )}
          {s.status === 'connected' && (
            <Button size="sm" variant="ghost" onClick={() => void act('/disconnect')}>
              Déconnecter
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title={s.config.enabled ? 'Désactiver' : 'Activer'}
            onClick={() => void act('/enabled', { enabled: !s.config.enabled })}
          >
            <Power size={13} className={s.config.enabled ? 'text-ok' : 'text-faint'} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!confirm(`Retirer le plugin ${s.name} ?`)) return;
              await api(`/api/mcp/${encodeURIComponent(s.name)}`, { method: 'DELETE' });
              reload();
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      {s.error && s.status !== 'needs_auth' && (
        <div className="mx-3.5 mb-2 whitespace-pre-wrap rounded-lg bg-err/8 px-2.5 py-1.5 font-mono text-[11.5px] text-err">
          {s.error}
        </div>
      )}
      {open && (
        <div className="space-y-2 border-t border-line px-3.5 py-3">
          <Toggle
            checked={s.config.autoApprove === true}
            onChange={(v) => void act('/auto-approve', { autoApprove: v })}
            label={
              <span className="flex items-center gap-1">
                <ShieldCheck size={13} /> Autoriser tous les outils sans confirmation
              </span>
            }
          />
          {s.instructions && (
            <div className="rounded-lg bg-hover p-2.5 text-[12px] text-muted">
              {s.instructions.slice(0, 800)}
            </div>
          )}
          <div className="divide-y divide-line/70 rounded-lg border border-line">
            {s.tools.map((t) => (
              <div key={t.name} className="px-2.5 py-1.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{t.name}</span>
                  {t.readOnly && <Badge tone="ok">lecture</Badge>}
                  {t.destructive && <Badge tone="err">destructif</Badge>}
                  <button
                    className="ml-auto text-[12px] text-accent hover:underline"
                    onClick={() => {
                      setTestTool(t.name);
                      setArgs('{}');
                      setResult(null);
                    }}
                  >
                    tester
                  </button>
                </div>
                <div className="line-clamp-2 text-[11.5px] text-muted">{t.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Modal
        open={Boolean(testTool)}
        onClose={() => setTestTool(null)}
        title={`Tester ${s.name} › ${testTool}`}
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              try {
                const r = await api(`/api/mcp/${encodeURIComponent(s.name)}/call`, {
                  body: { tool: testTool, args: JSON.parse(args || '{}') },
                });
                setResult(JSON.stringify(r, null, 2));
              } catch (err) {
                setResult(`Erreur : ${(err as Error).message}`);
              }
            }}
          >
            Exécuter
          </Button>
        }
      >
        <Field label="Arguments (JSON)">
          <Textarea
            rows={5}
            className="font-mono text-[12px]"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
          />
        </Field>
        {result && (
          <pre className="max-h-80 overflow-auto rounded-lg border border-line bg-code p-2.5 font-mono text-[11.5px] whitespace-pre-wrap">
            {result}
          </pre>
        )}
      </Modal>
    </div>
  );
}

function JevPanel() {
  const settings = useApp((s) => s.settings);
  const save = useApp((s) => s.saveSettings);
  const [status, setStatus] = useState<{
    ok: boolean;
    model?: string;
    error?: string;
    keyConfigured: boolean;
  } | null>(null);
  const [state, setState] = useState('Bonjour, mes paiements échouent depuis 3 jours, c’est urgent !');
  const [question, setQuestion] = useState('Le message exprime-t-il une urgence ?');
  const [answer, setAnswer] = useState<string | null>(null);
  useEffect(() => {
    void api<typeof status>('/api/jev/status').then(setStatus);
  }, []);
  return (
    <div className="rounded-xl border border-line bg-panel p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <BrainCircuit size={16} className="text-accent" />
        <span className="font-semibold">Jev — TypeSafe System One</span>
        {status ? (
          status.ok ? (
            <Badge tone="ok">
              <CheckCircle2 size={11} /> {status.model}
            </Badge>
          ) : (
            <Badge tone="err">
              <XCircle size={11} /> indisponible
            </Badge>
          )
        ) : (
          <Spinner />
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => void api<typeof status>('/api/jev/status', { query: { force: 1 } }).then(setStatus)}
        >
          <RefreshCw size={13} />
        </Button>
      </div>
      <div className="mb-3 text-[12.5px] text-muted">
        Jugements typés rapides et calibrés (oui/non, choix, score). Utilisé par la plateforme pour le routage
        AUTO des modèles et la détection des skills, et disponible pour les agents via l'outil{' '}
        <code className="font-mono">jev.judge</code>.
        {status && !status.ok && (
          <div className="mt-1 text-err">{status.error} — définissez TYPESAFE_API_KEY dans .env.</div>
        )}
      </div>
      {settings && (
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <Toggle
            checked={settings.jev.enabled}
            onChange={(v) => void save({ jev: { ...settings.jev, enabled: v } })}
            label="Activer Jev"
          />
          <Toggle
            checked={settings.jev.routing}
            onChange={(v) => void save({ jev: { ...settings.jev, routing: v } })}
            label="Routage AUTO des modèles"
          />
          <Toggle
            checked={settings.jev.skills}
            onChange={(v) => void save({ jev: { ...settings.jev, skills: v } })}
            label="Détection des skills"
          />
        </div>
      )}
      <form
        className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api<{ model: string; answers: Record<string, { noul: number }> }>(
              '/api/jev/evaluate',
              { body: { state, questions: { q: { type: 'noul', instructions: question } } } },
            );
            setAnswer(`${r.model} → probabilité « oui » = ${Math.round((r.answers.q?.noul ?? 0) * 100)} %`);
          } catch (err) {
            setAnswer((err as Error).message);
          }
        }}
      >
        <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="État (texte)" />
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question oui/non"
        />
        <Button type="submit">Tester</Button>
      </form>
      {answer && <div className="mt-2 text-[12.5px]">{answer}</div>}
    </div>
  );
}

export function PluginsView() {
  const toast = useApp((s) => s.toast);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [presets, setPresets] = useState<McpPreset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'stdio',
    command: '',
    args: '',
    url: '',
    env: '',
    headers: '',
  });

  const reload = useCallback(() => {
    void api<{ servers: McpServerInfo[]; presets: McpPreset[] }>('/api/mcp').then((r) => {
      setServers(r.servers);
      setPresets(r.presets);
    });
  }, []);
  useEffect(() => reload(), [reload]);
  useEffect(() => {
    if (!servers.some((s) => s.status === 'connecting' || s.status === 'needs_auth')) return;
    const t = window.setInterval(reload, 2000);
    return () => window.clearInterval(t);
  }, [servers, reload]);

  const install = async (p: McpPreset) => {
    setBusy(p.id);
    try {
      const s = await api<McpServerInfo>(`/api/mcp/preset/${p.id}`, { method: 'POST', body: {} });
      if (s.status === 'needs_auth' && s.authUrl) {
        toast('info', `${p.name} : autorisez l'accès dans l'onglet qui s'ouvre`);
        window.open(s.authUrl, '_blank', 'noopener');
      } else if (s.status === 'connected') toast('success', `${p.name} connecté (${s.toolCount} outils)`);
      else toast('error', s.error ?? `${p.name} : ${s.status}`);
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  };

  const categories = [...new Set(presets.map((p) => p.category))];
  const installed = new Set(servers.map((s) => s.name));
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <Plug size={20} className="text-accent" />
          <div>
            <h1 className="text-[18px] font-semibold">Plugins (MCP) & Jev</h1>
            <div className="text-[13px] text-muted">
              Branchez Blender, Canva, Figma et des serveurs MCP gratuits : leurs outils sont disponibles
              automatiquement pour tous les agents (avec confirmation selon le mode de permissions).
            </div>
          </div>
          <Button className="ml-auto" onClick={() => setCustom(true)}>
            <Plus size={14} /> Serveur MCP personnalisé
          </Button>
        </div>
        <Section title={`Installés (${servers.length})`}>
          {servers.length === 0 && (
            <div className="text-[13px] text-faint">Aucun plugin. Choisissez-en ci-dessous.</div>
          )}
          <div className="space-y-2">
            {servers.map((s) => (
              <ServerCard key={s.name} s={s} reload={reload} />
            ))}
          </div>
        </Section>
        {categories.map((cat) => (
          <Section key={cat} title={cat}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presets
                .filter((p) => p.category === cat)
                .map((p) => (
                  <div key={p.id} className="flex flex-col rounded-xl border border-line bg-panel p-3.5">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      {p.free ? <Badge tone="ok">gratuit</Badge> : <Badge>compte requis</Badge>}
                      {installed.has(p.id) && <Badge tone="info">installé</Badge>}
                    </div>
                    <div className="mb-2 flex-1 text-[12.5px] text-muted">{p.description}</div>
                    {p.requires && (
                      <div className="mb-2 text-[11.5px] text-faint">Prérequis : {p.requires}</div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={installed.has(p.id) ? 'secondary' : 'primary'}
                        disabled={busy === p.id}
                        onClick={() => void install(p)}
                      >
                        {busy === p.id ? <Spinner /> : <Plug size={13} />}{' '}
                        {installed.has(p.id) ? 'Reconnecter' : 'Installer'}
                      </Button>
                      <span className="truncate font-mono text-[11px] text-faint">
                        {p.config.url ?? `${p.config.command} ${(p.config.args ?? []).join(' ')}`}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </Section>
        ))}
        <Section title="Jev (TypeSafe)">
          <JevPanel />
        </Section>
        <div className="mb-8 text-[12px] text-faint">
          Configuration compatible Claude Desktop (<code className="font-mono">data/mcp.json</code>). Les
          jetons OAuth et variables secrètes restent sur votre machine et sont masqués dans l'interface et les
          journaux.{' '}
          <a
            className="text-accent hover:underline"
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            Qu'est-ce que MCP ? <ExternalLink size={11} className="inline" />
          </a>
        </div>
      </div>
      <Modal
        open={custom}
        onClose={() => setCustom(false)}
        title="Serveur MCP personnalisé"
        footer={
          <Button
            variant="primary"
            disabled={!form.name || (form.type === 'stdio' ? !form.command : !form.url)}
            onClick={async () => {
              const config =
                form.type === 'stdio'
                  ? {
                      type: 'stdio',
                      command: form.command,
                      args: form.args.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) ?? [],
                      env: parsePairs(form.env, '='),
                      enabled: true,
                    }
                  : { type: form.type, url: form.url, headers: parsePairs(form.headers, ':'), enabled: true };
              try {
                const s = await api<McpServerInfo>('/api/mcp', { body: { name: form.name, config } });
                if (s.status === 'needs_auth' && s.authUrl) window.open(s.authUrl, '_blank', 'noopener');
                setCustom(false);
                reload();
              } catch (err) {
                toast('error', (err as Error).message);
              }
            }}
          >
            Ajouter et connecter
          </Button>
        }
      >
        <div className="grid gap-x-3 md:grid-cols-2">
          <Field label="Nom">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex. mon-serveur"
            />
          </Field>
          <Field label="Transport">
            <Select
              value={form.type}
              onChange={(type) => setForm({ ...form, type })}
              options={[
                { value: 'stdio', label: 'Local (stdio : commande)' },
                { value: 'http', label: 'Distant (HTTP streamable)' },
                { value: 'sse', label: 'Distant (SSE)' },
              ]}
              className="w-full"
            />
          </Field>
        </div>
        {form.type === 'stdio' ? (
          <>
            <Field label="Commande">
              <Input
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="npx, uvx, node, python…"
              />
            </Field>
            <Field label="Arguments">
              <Input
                value={form.args}
                onChange={(e) => setForm({ ...form, args: e.target.value })}
                placeholder="-y @scope/mon-serveur-mcp --option"
              />
            </Field>
            <Field
              label="Variables d'environnement (une par ligne : CLE=valeur)"
              hint="Stockées localement, masquées ensuite."
            >
              <Textarea
                rows={3}
                className="font-mono text-[12px]"
                value={form.env}
                onChange={(e) => setForm({ ...form, env: e.target.value })}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://exemple.com/mcp"
              />
            </Field>
            <Field
              label="En-têtes (une par ligne : Nom: valeur)"
              hint="Ex. Authorization: Bearer … — sinon OAuth est proposé automatiquement si le serveur l'exige."
            >
              <Textarea
                rows={3}
                className="font-mono text-[12px]"
                value={form.headers}
                onChange={(e) => setForm({ ...form, headers: e.target.value })}
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
