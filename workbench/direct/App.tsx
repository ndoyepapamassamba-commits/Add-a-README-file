import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Database,
  FolderOpen,
  KeyRound,
  MessageSquare,
  Moon,
  Plug,
  Plus,
  Puzzle,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Trash2,
  Wallet,
  LayoutDashboard,
  Pencil,
  Workflow as WorkflowIcon,
  TerminalSquare,
  Globe,
  BrainCircuit,
  Cpu,
} from 'lucide-react';
import {
  Button,
  Field,
  Gauge,
  IconButton,
  Input,
  Spinner,
  Toggle,
  EditableTitle,
} from '../web/components/ui';
import { cx, fmtCost, fmtRelative } from '../web/lib/format';
import { getKey, loadCatalog, maskKey, provider, setKey } from './lib/llm';
import { refreshCredits } from './lib/credits';
import { hydrate, today, useStore } from './lib/store';
import type { View } from './lib/types';
import { ChatView } from './views/ChatView';
import { HomeView } from './views/HomeView';
import { WorkflowsView } from './views/WorkflowsView';
import { FilesView } from './views/FilesView';
import { DataView } from './views/DataView';
import { AgentsView, SkillsView } from './views/LibraryViews';
import { PluginsView } from './views/PluginsView';
import { ModelsView, SettingsView } from './views/SettingsViews';
import { TerminalView } from './views/TerminalView';
import { BrowserView } from './views/BrowserView';
import { IntelligenceView } from './views/IntelligenceView';
import { JevView } from './views/JevView';
import { NAV_ITEMS } from './lib/nav';

const ICONS: Record<View, React.ReactNode> = {
  home: <LayoutDashboard size={17} />,
  chat: <MessageSquare size={17} />,
  files: <FolderOpen size={17} />,
  data: <Database size={17} />,
  terminal: <TerminalSquare size={17} />,
  browser: <Globe size={17} />,
  workflows: <WorkflowIcon size={17} />,
  agents: <Bot size={17} />,
  skills: <Puzzle size={17} />,
  plugins: <Plug size={17} />,
  models: <Sparkles size={17} />,
  intelligence: <BrainCircuit size={17} />,
  jev: <Cpu size={17} />,
  settings: <SettingsIcon size={17} />,
};
const NAV: { id: View; label: string; icon: React.ReactNode }[] = NAV_ITEMS.map((n) => ({
  ...n,
  icon: ICONS[n.id],
}));

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M16 6.5l8.2 9.5-8.2 9.5-8.2-9.5z" fill="var(--accent-fg)" />
      <path d="M16 11.5l4 4.5-4 4.5-4-4.5z" fill="var(--accent)" />
    </svg>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const [hasKey, setHasKey] = useState(() => Boolean(getKey()));

  useEffect(() => {
    void hydrate().then(() => {
      void loadCatalog()
        .then((models) => useStore.setState({ models, modelsError: null }))
        .catch((e: Error) => useStore.setState({ modelsError: e.message }));
      void refreshCredits();
    });
    const t = setInterval(() => void refreshCredits(), 120_000);
    return () => clearInterval(t);
  }, []);

  if (!ready)
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner /> Chargement…
      </div>
    );
  if (!hasKey) return <Onboarding onDone={() => setHasKey(true)} />;
  return <Shell onLogout={() => setHasKey(false)} />;
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [key, setK] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    setKey(key, remember);
    const st = await provider.keyStatus();
    setBusy(false);
    if (!st.connected) {
      setErr(
        st.error === 'Clé absente ou invalide (401)'
          ? 'Clé refusée par OpenRouter. Vérifiez-la sur openrouter.ai/keys.'
          : `Connexion impossible : ${st.error ?? 'erreur'}`,
      );
      return;
    }
    useStore.getState().patchSettings({ rememberKey: remember });
    void refreshCredits();
    onDone();
  };
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="wb-in w-full max-w-[540px]">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <div className="text-[18px] font-semibold">MASSAMBA Workbench</div>
            <div className="text-[13px] text-muted">Accès direct — aucune installation, aucun terminal</div>
          </div>
        </div>
        <form
          className="rounded-2xl border border-line bg-elev p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field
            label="Votre clé API OpenRouter"
            hint="Créez-la sur openrouter.ai/keys. Elle reste dans ce navigateur, sur cet ordinateur, et n'est envoyée qu'à openrouter.ai."
          >
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-faint" />
              <Input
                type="password"
                value={key}
                onChange={(e) => setK(e.target.value)}
                placeholder="sk-or-v1-…"
                autoFocus
              />
            </div>
          </Field>
          <div className="mb-4">
            <Toggle
              checked={remember}
              onChange={setRemember}
              label="Se souvenir de la clé sur cet ordinateur"
            />
            <div className="mt-1 pl-11 text-[11.5px] text-faint">
              Décochez sur un ordinateur partagé : la clé sera oubliée à la fermeture de l'onglet.
            </div>
          </div>
          {err && (
            <div className="mb-3 rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-[13px] text-err">
              {err}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={!key.trim().startsWith('sk-') || busy}
          >
            {busy ? <Spinner /> : null} Commencer
          </Button>
        </form>
        <div className="mt-4 rounded-2xl border border-line bg-panel/60 p-4 text-[12.5px] text-muted">
          Conseil : sur openrouter.ai, fixez une <b>limite de dépenses</b> sur cette clé. Vos sessions,
          fichiers, skills et agents sont enregistrés dans ce navigateur.
        </div>
      </div>
    </div>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.settings.theme);
  const patchSettings = useStore((s) => s.patchSettings);
  const toasts = useStore((s) => s.toasts);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.getState().newSession();
      }
      if (e.altKey && /^[0-9]$/.test(e.key)) {
        const n = e.key === '0' ? 9 : Number(e.key) - 1;
        if (NAV[n]) {
          e.preventDefault();
          setView(NAV[n].id);
        }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setView]);

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-elev px-3">
        <Logo size={22} />
        <span className="text-[13.5px] font-semibold">MASSAMBA Workbench</span>
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent">
          accès direct
        </span>
        <div className="flex-1" />
        <CreditsGauge />
        <IconButton
          label="Thème"
          onClick={() => patchSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-elev py-2">
          {NAV.map((n, i) => (
            <button
              key={n.id}
              aria-label={n.label}
              title={`${n.label} (Alt+${(i + 1) % 10})`}
              onClick={() => setView(n.id)}
              className={cx(
                'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg',
                view === n.id && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
              )}
            >
              {n.icon}
            </button>
          ))}
        </nav>
        {view === 'chat' && <SessionList />}
        <main className="min-w-0 flex-1">
          {view === 'home' && <HomeView />}
          {view === 'chat' && <ChatView />}
          {view === 'workflows' && <WorkflowsView />}
          {view === 'files' && <FilesView />}
          {view === 'data' && <DataView />}
          {view === 'terminal' && <TerminalView />}
          {view === 'browser' && <BrowserView />}
          {view === 'agents' && <AgentsView />}
          {view === 'skills' && <SkillsView />}
          {view === 'plugins' && <PluginsView />}
          {view === 'models' && <ModelsView />}
          {view === 'intelligence' && <IntelligenceView />}
          {view === 'jev' && <JevView />}
          {view === 'settings' && <SettingsView onLogout={onLogout} />}
        </main>
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'wb-in pointer-events-auto max-w-[380px] rounded-xl border px-3 py-2 text-[13px] shadow-pop',
              t.tone === 'err'
                ? 'border-err/40 bg-elev text-err'
                : t.tone === 'ok'
                  ? 'border-ok/40 bg-elev text-fg'
                  : 'border-line bg-elev text-fg',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreditsGauge() {
  const c = useStore((s) => s.credits);
  const spend = useStore((s) => s.spend[today()] ?? 0);
  const budget = useStore((s) => s.settings.budgetDaily);
  const session = useStore((s) => s.sessions.find((x) => x.id === s.currentId));
  const [open, setOpen] = useState(false);
  const remaining = c?.keyLimitRemaining ?? c?.remaining ?? null;
  const total = c?.keyLimit ?? c?.totalCredits ?? null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover"
        title="Crédits OpenRouter et consommation"
      >
        <Wallet size={14} className="text-muted" />
        <div className="w-24">
          <div className="flex justify-between text-[11px]">
            <span className="font-medium">{remaining !== null ? fmtCost(remaining, 2) : '—'}</span>
            {total !== null && <span className="text-faint">/ {fmtCost(total, 0)}</span>}
          </div>
          <Gauge value={total && remaining !== null ? total - remaining : 0} max={total ?? 1} />
        </div>
        <span className="text-[11px] text-muted">{fmtCost(spend)}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-line bg-elev p-3 text-[12.5px] shadow-pop"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="mb-2 font-semibold">Crédits OpenRouter</div>
          <Row
            k="Solde du compte"
            v={
              c?.remaining !== null && c?.remaining !== undefined ? fmtCost(c.remaining, 2) : 'non disponible'
            }
          />
          <Row
            k="Limite de la clé"
            v={
              c?.keyLimit !== null && c?.keyLimit !== undefined
                ? `${fmtCost(c.keyLimitRemaining ?? 0, 2)} restants / ${fmtCost(c.keyLimit, 2)}`
                : 'aucune'
            }
          />
          <div className="my-2 border-t border-line" />
          <Row
            k="Aujourd'hui (ce navigateur)"
            v={`${fmtCost(spend)}${budget ? ` / ${fmtCost(budget, 2)}` : ''}`}
          />
          {budget > 0 && <Gauge value={spend} max={budget} className="my-1" />}
          {session && (
            <Row
              k="Session en cours"
              v={`${fmtCost(session.cost)} · ${(session.tokensIn + session.tokensOut).toLocaleString('fr-FR')} tokens`}
            />
          )}
          <button
            className="mt-2 text-[12px] text-accent hover:underline"
            onClick={() => void refreshCredits()}
          >
            Actualiser
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function SessionList() {
  const sessions = useStore((s) => s.sessions);
  const currentId = useStore((s) => s.currentId);
  const running = useStore((s) => s.running);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const list = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())),
    [sessions, q],
  );
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-elev/60">
      <div className="space-y-2 p-2">
        <Button
          className="w-full justify-start"
          onClick={() => useStore.getState().newSession()}
          title="Ctrl+K"
        >
          <Plus size={14} /> Nouvelle session
        </Button>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-input px-2">
          <Search size={13} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher"
            className="h-7 w-full bg-transparent text-[12.5px] outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
        {list.map((s) => (
          <div
            key={s.id}
            onClick={() => useStore.getState().selectSession(s.id)}
            className={cx(
              'group mb-0.5 cursor-pointer rounded-lg px-2.5 py-2',
              s.id === currentId ? 'bg-hover' : 'hover:bg-hover/60',
            )}
          >
            <div className="flex items-center gap-1.5">
              {running[s.id] && <Spinner className="h-3 w-3" />}
              <EditableTitle
                value={s.title}
                className="text-[13px]"
                editing={renaming === s.id}
                onDone={() => setRenaming(null)}
                onSave={(title) => useStore.getState().patchSession(s.id, { title })}
              />
              <button
                aria-label="Renommer la session"
                className="hidden text-faint hover:text-fg group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(s.id);
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                aria-label="Supprimer la session"
                className="hidden text-faint hover:text-err group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Supprimer « ${s.title} » ?`)) useStore.getState().deleteSession(s.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-0.5 flex gap-2 text-[11px] text-faint">
              <span>{fmtRelative(s.updatedAt)}</span>
              <span>{fmtCost(s.cost)}</span>
            </div>
          </div>
        ))}
        {!list.length && <div className="p-3 text-center text-[12px] text-faint">Aucune session</div>}
      </div>
      <div className="border-t border-line p-2 text-[11px] text-faint">Clé : {maskKey(getKey())}</div>
    </aside>
  );
}
