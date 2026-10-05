import { useEffect, useReducer, useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import { Package, Plug, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Spinner, Toggle } from '../../web/components/ui';
import { MCP_PRESETS, connect, disconnect, mcpState, onMcpChange } from '../lib/mcp';
import { useStore } from '../lib/store';
import { BUILTIN_PLUGINS } from '../lib/builtinPlugins';
import { embeddedKit, getHouseKit, kitFromZip, setHouseKit } from '../lib/apex';
import {
  getPythonPack,
  importPythonPack,
  removePythonPack,
  type PythonPackManifest,
} from '../lib/pythonPack';
import { resetSandbox } from '../lib/sandbox';
import { kv } from '../lib/db';
import type { McpServerDef } from '../lib/types';

export function PluginsView() {
  const servers = useStore((s) => s.mcp);
  const setMcp = useStore((s) => s.setMcp);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [adding, setAdding] = useState(false);
  const [tokenFor, setTokenFor] = useState<McpServerDef | null>(null);
  const [token, setToken] = useState('');
  useEffect(() => {
    const off = onMcpChange(rerender);
    for (const s of useStore.getState().mcp)
      if (s.enabled && mcpState(s.name).status === 'disconnected') void connect(s);
    return () => void off();
  }, []);

  const upsert = (d: McpServerDef) => {
    setMcp([...servers.filter((s) => s.name !== d.name), d]);
    if (d.enabled) void disconnect(d.name).then(() => connect(d));
  };

  return (
    <div className="mx-auto h-full max-w-[920px] overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold">Plugins (MCP)</h1>
          <div className="text-[13px] text-muted">
            Les plugins connectés sont utilisés automatiquement par les agents. Cette édition sans serveur se
            connecte aux serveurs MCP en ligne (HTTP) qui acceptent les navigateurs.
          </div>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={14} /> Ajouter
        </Button>
      </div>

      <HouseKitCard />
      <PythonPackCard />
      <BuiltinPluginsSection />
      <Modal
        open={Boolean(tokenFor)}
        onClose={() => setTokenFor(null)}
        title={tokenFor ? `${tokenFor.name} — jeton` : ''}
        width={520}
      >
        {tokenFor && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const { needsToken: _n, ...def } = tokenFor;
              upsert({ ...def, headers: { Authorization: `Bearer ${token.trim()}` } });
              setToken('');
              setTokenFor(null);
            }}
          >
            <div className="text-[12.5px] text-muted">{tokenFor.needsToken}</div>
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Jeton"
            />
            <div className="text-[11.5px] text-faint">
              Conservé dans ce navigateur uniquement, envoyé seulement à {new URL(tokenFor.url).host}.
            </div>
            <Button type="submit" variant="primary" disabled={!token.trim()}>
              Installer
            </Button>
          </form>
        )}
      </Modal>

      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
        Gratuits, prêts à l’emploi
      </h2>
      <div className="mb-6 grid gap-2 sm:grid-cols-2">
        {MCP_PRESETS.map((p) => {
          const installed = servers.some((s) => s.name === p.name);
          return (
            <div key={p.name} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <Plug size={14} className="text-accent" />
                <div className="flex-1 text-[13.5px] font-medium">{p.name}</div>
                <Badge tone="ok">gratuit</Badge>
              </div>
              <div className="mt-1 text-[12.5px] text-muted">{p.description}</div>
              <Button
                size="sm"
                className="mt-2"
                disabled={installed}
                onClick={() => (p.needsToken ? setTokenFor(p) : upsert(p))}
              >
                {installed ? 'Installé' : 'Installer'}
              </Button>
            </div>
          );
        })}
      </div>

      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">Mes plugins</h2>
      {!servers.length && (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-faint">
          Aucun plugin. Installez Context7 ou DeepWiki ci-dessus, ou ajoutez l’URL d’un serveur MCP.
        </div>
      )}
      <div className="space-y-2">
        {servers.map((s) => {
          const st = mcpState(s.name);
          return (
            <div key={s.name} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${st.status === 'connected' ? 'bg-ok' : st.status === 'error' ? 'bg-err' : st.status === 'connecting' ? 'bg-warn' : 'bg-faint'}`}
                />
                <div className="text-[13.5px] font-medium">{s.name}</div>
                <div className="min-w-0 flex-1 truncate text-[12px] text-faint">{s.url}</div>
                {st.status === 'connecting' && <Spinner />}
                <Toggle
                  checked={s.autoApprove}
                  onChange={(v) =>
                    setMcp(servers.map((x) => (x.name === s.name ? { ...x, autoApprove: v } : x)))
                  }
                  label={<span className="text-[12px] text-muted">sans demander</span>}
                />
                <Toggle
                  checked={s.enabled}
                  onChange={(v) => {
                    setMcp(servers.map((x) => (x.name === s.name ? { ...x, enabled: v } : x)));
                    if (v) void connect({ ...s, enabled: true });
                    else void disconnect(s.name);
                  }}
                />
                <button
                  aria-label="Reconnecter"
                  className="text-faint hover:text-fg"
                  onClick={() => void disconnect(s.name).then(() => connect(s))}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  aria-label={`Supprimer ${s.name}`}
                  className="text-faint hover:text-err"
                  onClick={() => {
                    void disconnect(s.name);
                    setMcp(servers.filter((x) => x.name !== s.name));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {st.error && <div className="mt-1 text-[12px] text-err">{st.error}</div>}
              {st.status === 'connected' && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {st.tools.map((t) => (
                    <Badge key={t.name}>{t.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-panel/60 p-3 text-[12.5px] text-muted">
        <b>Blender, Canva, Figma (application locale)…</b> : ces plugins ont besoin d’un programme installé
        sur l’ordinateur ou d’une autorisation OAuth, impossible depuis un simple fichier HTML. Ils sont
        disponibles dans l’édition avec agent local (voir README).
      </div>
      {adding && (
        <AddServer
          onClose={() => setAdding(false)}
          onSave={(d) => {
            upsert(d);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddServer({ onClose, onSave }: { onClose: () => void; onSave: (d: McpServerDef) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [header, setHeader] = useState('');
  const valid = /^[\w.-]{1,40}$/.test(name) && /^https:\/\//.test(url);
  return (
    <Modal
      open
      onClose={onClose}
      title="Ajouter un serveur MCP (HTTP)"
      footer={
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              name,
              url: url.trim(),
              enabled: true,
              autoApprove: false,
              headers: header.trim() ? { Authorization: header.trim() } : undefined,
            })
          }
        >
          Ajouter et connecter
        </Button>
      }
    >
      <Field label="Nom" hint="Lettres, chiffres, - _ .">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mon-plugin" />
      </Field>
      <Field label="URL (https)" hint="Point d’accès « Streamable HTTP » ou SSE du serveur MCP">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemple.com/mcp" />
      </Field>
      <Field label="En-tête Authorization (optionnel)" hint="ex. Bearer xxxxx — conservé dans ce navigateur">
        <Input type="password" value={header} onChange={(e) => setHeader(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** APEX Studio house kit: embedded at build time, or imported as a .zip of the skill folder. */
function HouseKitCard() {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const kit = getHouseKit();
  const onFile = async (f: File) => {
    try {
      const k = kitFromZip(unzipSync(new Uint8Array(await f.arrayBuffer())));
      setHouseKit(k);
      await kv.set('houseKit', k);
      setMsg(`Kit « ${k.source} » importé : APEX Studio est opérationnel.`);
      bump();
    } catch (e) {
      setMsg(`Import impossible : ${(e as Error).message}`);
    }
  };
  return (
    <div className="mb-6 rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <Package size={14} className="text-accent" />
        <div className="flex-1 text-[13.5px] font-medium">Kit maison — APEX Studio</div>
        {kit ? (
          <Badge tone="ok">{embeddedKit() ? 'intégré' : 'importé'}</Badge>
        ) : (
          <Badge tone="warn">absent</Badge>
        )}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">
        {kit
          ? `Charte, visuels 3D, logo et chaîne d’exports (Excel, PowerPoint, Word, mail, PDF) de « ${kit.source} » : l’agent APEX Studio construit des applications offline au style maison.`
          : 'Importez le dossier du skill « ecobank-god-export-studio » compressé en .zip pour activer la construction d’applications APEX avec exports maison.'}
      </div>
      {!embeddedKit() && (
        <Button size="sm" className="mt-2" onClick={() => input.current?.click()}>
          <Upload size={13} /> Importer le kit (.zip)
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {msg && <div className="mt-2 text-[12.5px]">{msg}</div>}
    </div>
  );
}

/** Offline Python pack: Pyodide + numpy / pandas / openpyxl / pypdf kept in this browser. */
function PythonPackCard() {
  const [info, setInfo] = useState<PythonPackManifest | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void getPythonPack().then((p) => setInfo(p?.manifest ?? null));
  }, []);
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const m = await importPythonPack(await f.arrayBuffer());
      resetSandbox();
      setInfo(m);
      setMsg(`Pack Python ${m.version} importé et vérifié (SHA-256) : python fonctionne sans réseau.`);
    } catch (e) {
      setMsg(`Import impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-6 rounded-xl border border-line bg-panel p-3" data-testid="python-pack">
      <div className="flex items-center gap-2">
        <Package size={14} className="text-accent" />
        <div className="flex-1 text-[13.5px] font-medium">Python hors-ligne</div>
        {info === undefined ? null : info ? (
          <Badge tone="ok">installé · {info.version}</Badge>
        ) : (
          <Badge tone="warn">CDN (réseau requis)</Badge>
        )}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">
        {info
          ? `Pyodide ${info.version} avec ${info.wheels.map((w) => w.split('-')[0]).join(', ')} — chargé depuis ce navigateur, sans Internet.`
          : 'Sans pack, Python se charge depuis cdn.jsdelivr.net (souvent bloqué sur les réseaux d’entreprise). Importez massamba-python-pack.zip (npm run build:python-pack) pour l’utiliser hors-ligne. JavaScript / node fonctionne toujours, y compris sur les PDF et Excel.'}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Spinner /> : <Upload size={13} />} Importer le pack (.zip)
        </Button>
        {info && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void removePythonPack().then(() => {
                resetSandbox();
                setInfo(null);
                setMsg('Pack retiré.');
              })
            }
          >
            Retirer
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = '';
        }}
      />
      {msg && <div className="mt-2 text-[12.5px]">{msg}</div>}
    </div>
  );
}

/** Built-in plugins: no server, no account — switch them on / off. */
function BuiltinPluginsSection() {
  const disabled = useStore((s) => s.settings.disabledPlugins ?? []);
  const patch = useStore((s) => s.patchSettings);
  const cats = [...new Set(BUILTIN_PLUGINS.map((p) => p.category))];
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
        Intégrés ({BUILTIN_PLUGINS.length - disabled.length}/{BUILTIN_PLUGINS.length} actifs) — sans serveur
        ni compte
      </h2>
      {cats.map((c) => (
        <div key={c} className="mb-3">
          <div className="mb-1 text-[12px] text-muted">{c}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {BUILTIN_PLUGINS.filter((p) => p.category === c).map((p) => {
              const on = !disabled.includes(p.id);
              return (
                <div key={p.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex items-center gap-2">
                    <Plug size={14} className="text-accent" />
                    <div className="flex-1 text-[13.5px] font-medium">{p.name}</div>
                    <Toggle
                      checked={on}
                      onChange={(v) =>
                        patch({
                          disabledPlugins: v ? disabled.filter((d) => d !== p.id) : [...disabled, p.id],
                        })
                      }
                      label=""
                    />
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted">{p.description}</div>
                  <div className="mt-1 font-mono text-[11px] text-faint">
                    {p.tools.map((t) => t.name).join(' · ')} — {p.source}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
