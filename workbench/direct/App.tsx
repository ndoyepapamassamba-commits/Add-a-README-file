import { useEffect, useMemo, useState } from 'react';
import { startBrain } from './lib/jevBrain';
import { freeOptions, setFreeOptions } from './lib/freeMode';
import {
  Activity,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Library,
  Menu,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Wallet,
  Workflow as WorkflowIcon,
  Wrench,
  X,
} from 'lucide-react';
import {
  Button,
  Field,
  Gauge,
  IconButton,
  Input,
  Kbd,
  Modal,
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
import { PromptStudioView } from './views/PromptStudioView';
import { CockpitView } from './views/CockpitView';
import { WorkflowsView } from './views/WorkflowsView';
import { FilesView } from './views/FilesView';
import { DataView } from './views/DataView';
import { AgentsView, SkillsView } from './views/LibraryViews';
import { PluginsView } from './views/PluginsView';
import { ModelsView, SettingsView } from './views/SettingsViews';
import { ModelCatalogue, Observability, Orchestration } from './views/CockpitView';
import { TerminalView } from './views/TerminalView';
import { BrowserView } from './views/BrowserView';
import { IntelligenceView } from './views/IntelligenceView';
import { JevView } from './views/JevView';
import { CognitiveOS } from './views/CognitiveOS';
import { exportArchive, importArchive, setArchived } from './lib/vault';
import { NAV_GROUPS, groupOf, type Group } from './lib/nav';
import { ProvidersView } from './views/ProvidersView';

const ICONS: Record<Group, React.ReactNode> = {
  cockpit: <LayoutDashboard size={17} />,
  chat: <MessageSquare size={17} />,
  agents: <Bot size={17} />,
  catalogue: <Library size={17} />,
  orchestration: <WorkflowIcon size={17} />,
  workspace: <Layers size={17} />,
  files: <FolderOpen size={17} />,
  tools: <Wrench size={17} />,
  observability: <Activity size={17} />,
  costs: <Wallet size={17} />,
  settings: <SettingsIcon size={17} />,
};
const NAV_COLLAPSED = 'wb.nav.collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(NAV_COLLAPSED) === '1';
  } catch {
    return false;
  }
};

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
  // Without a key the app runs on the free models fed by JEV (v63 — « tout en gratuit sans que je ne mette de clé »).
  const [hasKey, setHasKey] = useState(() => Boolean(getKey()) || freeOptions().started);

  useEffect(() => {
    // JEV's brain on every model call of the app + the perpetual update of its knowledge (v63).
    startBrain();
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
  return <Shell onLogout={() => (setFreeOptions({ started: false }), setHasKey(false))} />;
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
        <Button
          variant="ghost"
          className="mt-3 w-full"
          data-testid="start-free"
          onClick={() => {
            setFreeOptions({ started: true });
            onDone();
          }}
        >
          Utiliser sans clé — modèles gratuits nourris par JEV (0 $)
        </Button>
        <div className="mt-1 text-center text-[11.5px] text-faint">
          LLM7 et Pollinations sans compte ; vos fichiers restent sur l’ordinateur (modèle intégré au navigateur, à activer dans Réglages). Une clé peut être ajoutée plus tard.
        </div>
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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const group = groupOf(view);
  // A screen out of the navigation (the video screens now live in the Studio Vidéo app) falls back to the cockpit.
  const shown: View = group.views.some((v) => v.id === view) ? view : 'home';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.getState().newSession();
        setDrawer(false);
      }
      // Alt+1 … Alt+9, Alt+0: the first ten sections.
      if (e.altKey && !e.shiftKey && /^[0-9]$/.test(e.key)) {
        const g = NAV_GROUPS[e.key === '0' ? 9 : Number(e.key) - 1];
        if (g) {
          e.preventDefault();
          setView(g.views[0]!.id);
        }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setView]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(NAV_COLLAPSED, c ? '0' : '1');
      } catch {
        /* private window: the choice lasts for the tab */
      }
      return !c;
    });

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-elev px-2 sm:px-3">
        <IconButton label="Menu" className="md:hidden" onClick={() => setDrawer(true)}>
          <Menu size={18} />
        </IconButton>
        <Logo size={24} />
        <span className="truncate text-[14px] font-semibold">MASSAMBA Workbench</span>
        <span className="hidden rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent sm:inline">
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
        <aside
          className={cx(
            'hidden shrink-0 border-r border-line bg-elev transition-[width] duration-150 md:flex',
            collapsed ? 'w-[60px]' : 'w-[60px] lg:w-[220px]',
          )}
        >
          <Sidebar
            current={group.id}
            compact={collapsed ? 'always' : 'below-lg'}
            onGo={(id) => setView(id)}
            onHelp={() => setHelp(true)}
            onToggle={toggleCollapsed}
            collapsed={collapsed}
          />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 md:hidden" data-testid="nav-drawer">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
            <aside className="wb-in absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] flex-col overflow-hidden border-r border-line bg-elev shadow-pop">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
                <Logo size={22} />
                <span className="text-[13.5px] font-semibold">Menu</span>
                <IconButton label="Fermer le menu" className="ml-auto" onClick={() => setDrawer(false)}>
                  <X size={16} />
                </IconButton>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                <Sidebar
                  current={group.id}
                  compact="never"
                  onGo={(id) => {
                    setView(id);
                    setDrawer(false);
                  }}
                  onHelp={() => {
                    setDrawer(false);
                    setHelp(true);
                  }}
                />
                {group.id === 'chat' && (
                  <div className="border-t border-line">
                    <SessionList embedded onPicked={() => setDrawer(false)} />
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
        {shown === 'chat' && (
          <div className="hidden md:flex">
            <SessionList />
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          {group.views.length > 1 && (
            <div
              role="tablist"
              aria-label={group.label}
              data-testid="view-tabs"
              className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-elev px-2 sm:px-3"
            >
              {group.views.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={shown === v.id}
                  onClick={() => setView(v.id)}
                  className={cx(
                    'h-7 shrink-0 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
                    shown === v.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1">
            {shown === 'home' && <CockpitView />}
            {shown === 'chat' && <ChatView />}
            {shown === 'prompts' && <PromptStudioView />}
            {shown === 'catalogue' && <ModelCatalogue />}
            {shown === 'models' && <ModelsView />}
            {shown === 'orchestration' && <Orchestration />}
            {shown === 'workflows' && <WorkflowsView />}
            {shown === 'files' && <FilesView />}
            {shown === 'data' && <DataView />}
            {shown === 'terminal' && <TerminalView />}
            {shown === 'browser' && <BrowserView />}
            {shown === 'agents' && <AgentsView />}
            {shown === 'skills' && <SkillsView />}
            {shown === 'plugins' && <PluginsView />}
            {shown === 'observability' && <Observability />}
            {shown === 'intelligence' && <IntelligenceView />}
            {shown === 'jev' && <JevView />}
            {shown === 'cognitive' && <CognitiveOS />}
            {shown === 'providers' && <ProvidersView />}
            {shown === 'settings' && <SettingsView onLogout={onLogout} />}
          </div>
        </main>
      </div>
      <HelpDialog open={help} onClose={() => setHelp(false)} />
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

/** Labelled sidebar of the mockup: « Nouvelle session », twelve sections, « Aide & Docs », current project. */
function Sidebar({
  current,
  compact,
  onGo,
  onHelp,
  onToggle,
  collapsed,
}: {
  current: Group;
  /** When the labels are hidden: always (collapsed), below the lg breakpoint, or never (mobile drawer). */
  compact: 'always' | 'below-lg' | 'never';
  onGo: (v: View) => void;
  onHelp: () => void;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  const session = useStore((s) => s.sessions.find((x) => x.id === s.currentId));
  const running = useStore((s) => s.running);
  const label = compact === 'always' ? 'hidden' : compact === 'below-lg' ? 'hidden lg:inline' : 'inline';
  const row = compact === 'always' ? 'justify-center' : compact === 'below-lg' ? 'justify-center lg:justify-start' : 'justify-start';
  const busy = Object.keys(running).length;
  return (
    <nav className="flex w-full min-w-0 flex-col gap-0.5 p-2" data-testid="main-nav" aria-label="Navigation principale">
      <button
        aria-label="Nouvelle session"
        title="Nouvelle session (Ctrl+K)"
        onClick={() => {
          useStore.getState().newSession();
          onGo('chat');
        }}
        className={cx(
          'mb-2 flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium shadow-sm transition-colors hover:border-accent hover:text-accent',
          row,
        )}
      >
        <Plus size={16} className="shrink-0" />
        <span className={label}>Nouvelle session</span>
      </button>
      {NAV_GROUPS.map((g, i) => (
        <button
          key={g.id}
          aria-label={g.label}
          aria-current={current === g.id ? 'page' : undefined}
          title={`${g.label}${i < 10 ? ` (Alt+${(i + 1) % 10})` : ''} — ${g.hint}`}
          onClick={() => onGo(g.views[0]!.id)}
          className={cx(
            'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
            row,
            current === g.id ? 'bg-accent-soft font-semibold text-fg' : 'text-muted hover:bg-hover hover:text-fg',
          )}
        >
          <span className={cx('shrink-0', current === g.id && 'text-accent')}>{ICONS[g.id]}</span>
          <span className={cx('truncate', label)}>{g.label}</span>
          {g.id === 'chat' && busy > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ok" title={`${busy} session(s) en cours`} />
          )}
        </button>
      ))}
      <div className="min-h-3 flex-1" />
      <button
        aria-label="Aide & Docs"
        title="Aide & Docs — raccourcis, rubriques, bonnes pratiques"
        onClick={onHelp}
        className={cx('flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted hover:bg-hover hover:text-fg', row)}
      >
        <LifeBuoy size={17} className="shrink-0" />
        <span className={label}>Aide & Docs</span>
      </button>
      <button
        aria-label="Projet actuel"
        title={session ? `Projet actuel : ${session.title}` : 'Aucune session ouverte'}
        onClick={() => onGo('chat')}
        className={cx('mt-1 flex items-center gap-2 rounded-lg border border-line bg-panel/60 px-2 py-1.5 text-left hover:bg-hover', row)}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
          {(session?.title ?? 'M').trim().charAt(0).toUpperCase()}
        </span>
        <span className={cx('min-w-0', compact === 'always' ? 'hidden' : compact === 'below-lg' ? 'hidden lg:block' : 'block')}>
          <span className="block text-[10.5px] uppercase tracking-wide text-faint">Projet actuel</span>
          <span className="block truncate text-[12.5px] font-medium">{session?.title ?? 'Aucune session'}</span>
        </span>
      </button>
      {onToggle && (
        <button
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          onClick={onToggle}
          className="mt-1 hidden h-7 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-fg lg:flex"
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
        </button>
      )}
    </nav>
  );
}

/** « Aide & Docs »: shortcuts, what each section is for, good habits. Everything here works offline. */
function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Aide & Docs" width={720}>
      <div className="space-y-4 text-[13px]">
        <section>
          <h3 className="mb-1.5 font-semibold">Raccourcis</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li><Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> nouvelle session</li>
            <li><Kbd>Alt</Kbd> + <Kbd>1</Kbd>…<Kbd>0</Kbd> les dix premières rubriques</li>
            <li><Kbd>Entrée</Kbd> envoyer · <Kbd>Maj</Kbd> + <Kbd>Entrée</Kbd> nouvelle ligne</li>
            <li><Kbd>Échap</Kbd> fermer une fenêtre</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 font-semibold">Rubriques</h3>
          <ul className="space-y-1">
            {NAV_GROUPS.map((g) => (
              <li key={g.id} className="flex gap-2">
                <span className="mt-0.5 text-accent">{ICONS[g.id]}</span>
                <span>
                  <b>{g.label}</b>
                  {g.views.length > 1 && <span className="text-faint"> ({g.views.map((v) => v.label).join(' · ')})</span>} — {g.hint}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 font-semibold">Bien démarrer</h3>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Joignez votre fichier (Excel, CSV, PDF, Word) dans le chat, puis dites ce que vous voulez : « analyse », « rapport », « tableau de bord ».</li>
            <li>Pour un livrable, la galerie de designs s’ouvre d’abord : le design choisi (catalogue ou trouvé sur Internet) s’applique au classeur, au rapport Word et au deck PowerPoint au format comité.</li>
            <li>Le budget par tâche et par jour (Paramètres) est appliqué par l’app : l’IA s’arrête avant de le dépasser.</li>
            <li>Vos clés, sessions et fichiers restent dans ce navigateur. « Paramètres › Données » permet de tout sauvegarder.</li>
          </ul>
        </section>
      </div>
    </Modal>
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

function SessionList({ embedded, onPicked }: { embedded?: boolean; onPicked?: () => void } = {}) {
  const sessions = useStore((s) => s.sessions);
  const currentId = useStore((s) => s.currentId);
  const running = useStore((s) => s.running);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const list = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((s) => Boolean(s.archived) === showArchived)
        .filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())),
    [sessions, q, showArchived],
  );
  const nArchived = sessions.filter((s) => s.archived).length;
  const picked = sel ? [...sel] : [];
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <aside
      className={cx('flex shrink-0 flex-col bg-elev/60', embedded ? 'w-full' : 'w-60 border-r border-line')}
      data-testid="session-list"
    >
      <div className="space-y-2 p-2">
        {embedded && <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Sessions</div>}
        <div className="flex flex-wrap items-center gap-1 text-[11.5px]" data-testid="archive-bar">
          <button
            className={cx('rounded px-1.5 py-0.5', !showArchived ? 'bg-hover text-fg' : 'text-muted')}
            onClick={() => {
              setShowArchived(false);
              setSel(null);
            }}
          >
            Actifs
          </button>
          <button
            className={cx('rounded px-1.5 py-0.5', showArchived ? 'bg-hover text-fg' : 'text-muted')}
            onClick={() => {
              setShowArchived(true);
              setSel(null);
            }}
          >
            Archives ({nArchived})
          </button>
          <button
            className="ml-auto rounded px-1.5 py-0.5 text-muted hover:text-fg"
            onClick={() => setSel(sel ? null : new Set())}
          >
            {sel ? 'Annuler' : 'Sélection'}
          </button>
        </div>
        {sel && (
          <div className="flex flex-wrap gap-1 text-[11.5px]">
            <button
              className="rounded border border-line px-1.5 py-0.5 hover:bg-hover"
              onClick={() => setSel(new Set(list.map((s) => s.id)))}
            >
              Tout
            </button>
            <button
              disabled={!picked.length}
              className="rounded border border-line px-1.5 py-0.5 hover:bg-hover disabled:opacity-40"
              onClick={() => {
                setArchived(picked, !showArchived);
                setSel(null);
              }}
            >
              {showArchived ? 'Désarchiver' : 'Archiver'} ({picked.length})
            </button>
            <button
              disabled={!picked.length}
              className="rounded border border-line px-1.5 py-0.5 hover:bg-hover disabled:opacity-40"
              onClick={() => exportArchive(picked)}
            >
              Exporter
            </button>
          </div>
        )}
        <div className="flex gap-1 text-[11.5px]">
          <button
            className="rounded border border-line px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg"
            title="Archiver tous les chats (rien n’est supprimé)"
            onClick={() => {
              const ids = sessions.filter((s) => !s.archived && !running[s.id]).map((s) => s.id);
              if (ids.length && confirm(`Archiver ${ids.length} chat(s) ?`)) setArchived(ids, true);
            }}
          >
            Tout archiver
          </button>
          <button
            className="rounded border border-line px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg"
            onClick={() => {
              // The file picker is created on demand (no permanent <input type=file> in the page).
              const inp = document.createElement('input');
              inp.type = 'file';
              inp.accept = '.json,application/json';
              inp.onchange = async () => {
                const f = inp.files?.[0];
                if (!f) return;
                try {
                  const n = importArchive(await f.text());
                  alert(`${n} chat(s) restauré(s) dans les archives.`);
                } catch (err) {
                  alert((err as Error).message);
                }
              };
              inp.click();
            }}
          >
            Importer une archive
          </button>
        </div>
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
      <div className={cx('px-1.5 pb-2', embedded ? '' : 'min-h-0 flex-1 overflow-auto')}>
        {list.map((s) => (
          <div
            key={s.id}
            onClick={() => {
              if (sel) toggle(s.id);
              else {
                useStore.getState().selectSession(s.id);
                onPicked?.();
              }
            }}
            className={cx(
              'group mb-0.5 cursor-pointer rounded-lg px-2.5 py-2',
              s.id === currentId ? 'bg-hover' : 'hover:bg-hover/60',
            )}
          >
            <div className="flex items-center gap-1.5">
              {sel && (
                <input
                  type="checkbox"
                  readOnly
                  checked={sel.has(s.id)}
                  className="h-3 w-3"
                  aria-label={`Sélectionner ${s.title}`}
                />
              )}
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
        {!list.length && (
          <div className="p-3 text-center text-[12px] text-faint">
            {showArchived ? 'Aucun chat archivé' : 'Aucune session'}
          </div>
        )}
      </div>
      <div className="border-t border-line p-2 text-[11px] text-faint">Clé : {maskKey(getKey())}</div>
    </aside>
  );
}
