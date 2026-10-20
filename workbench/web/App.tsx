import { lazy, Suspense, useEffect } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
  Bell,
  Command as CommandIcon,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getConnection, loadConnection } from './lib/api';
import { cx, fmtTokens, shortModel } from './lib/format';
import { useApp } from './store/app';
import { useSession } from './store/session';
import { useActivity, useTerminal } from './store/runtime';
import { ConnectScreen, Logo } from './components/layout/ConnectScreen';
import { CreditsGauge } from './components/layout/CreditsGauge';
import { CommandPalette, VIEWS } from './components/layout/CommandPalette';
import { BottomPanel, RightPanel, SessionList, exportSession } from './components/layout/Panels';
import { MODE_META, EFFORT_LABEL } from './components/chat/Pickers';
import { FileTree } from './components/FileTree';
import { IconButton, Spinner, Dropdown } from './components/ui';
import { ChatView } from './views/ChatView';
import { TerminalView } from './views/TerminalView';
import { BrowserView } from './views/BrowserView';
import { DataView } from './views/DataView';
import { AgentsView } from './views/AgentsView';
import { SkillsView } from './views/SkillsView';
import { PluginsView } from './views/PluginsView';
import { TasksView } from './views/TasksView';
import { ModelsView } from './views/ModelsView';
import { SettingsView } from './views/SettingsView';
import { ProjectsView } from './views/ProjectsView';

// Monaco is large: the Code view is evaluated on first use only.
const CodeView = lazy(() => import('./views/CodeView').then((m) => ({ default: m.CodeView })));

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[60] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'wb-in pointer-events-auto cursor-pointer rounded-xl border px-3.5 py-2.5 text-[13px] shadow-pop',
            t.kind === 'error'
              ? 'border-err/40 bg-elev text-err'
              : t.kind === 'success'
                ? 'border-ok/40 bg-elev'
                : 'border-line bg-elev',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function TopBar() {
  const projects = useApp((s) => s.projects);
  const projectId = useApp((s) => s.projectId);
  const selectProject = useApp((s) => s.selectProject);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const openPalette = useApp((s) => s.openPalette);
  const layout = useApp((s) => s.layout);
  const setLayout = useApp((s) => s.setLayout);
  const sessionId = useApp((s) => s.sessionId);
  const listed = useApp((s) => s.sessions.find((x) => x.id === sessionId)?.title);
  const detailTitle = useSession((s) => s.detail?.session.title);
  const title = listed ?? detailTitle;
  const pending = useActivity((s) => s.pendingApprovals);
  const project = projects.find((p) => p.id === projectId);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-elev px-2.5">
      <Logo size={22} />
      <span className="hidden text-[13px] font-semibold md:inline">MASSAMBA Workbench</span>
      <span className="text-faint">/</span>
      <Dropdown
        trigger={
          <span className="max-w-[180px] truncate rounded-md px-1.5 py-0.5 text-[13px] font-medium hover:bg-hover">
            {project?.name ?? 'Choisir un projet'}
          </span>
        }
        items={projects.map((p) => ({ value: p.id, label: p.name, hint: p.isGit ? 'git' : undefined }))}
        value={projectId ?? undefined}
        onSelect={(id) => void selectProject(id)}
        header="Projets de l'espace de travail"
      />
      {title && (
        <>
          <span className="text-faint">/</span>
          <span className="hidden max-w-[320px] truncate text-[13px] text-muted lg:inline">{title}</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {pending.length > 0 && (
          <button
            className="flex h-8 items-center gap-1.5 rounded-lg bg-warn/15 px-2 text-[12px] font-medium text-warn"
            title={pending.map((p) => p.summary).join('\n')}
            onClick={() => {
              const st = useSession.getState();
              const run = pending[0]!;
              if (!st.runs[run.runId]) void useApp.getState().loadSessions();
              useApp.getState().setView('chat');
            }}
          >
            <Bell size={14} className="wb-pulse" /> {pending.length} autorisation
            {pending.length > 1 ? 's' : ''}
          </button>
        )}
        <CreditsGauge />
        <IconButton
          label="Panneau gauche (Ctrl+B)"
          active={layout.sidebar}
          onClick={() => setLayout({ sidebar: !layout.sidebar })}
        >
          <PanelLeft size={15} />
        </IconButton>
        <IconButton
          label="Panneau du bas (Ctrl+J)"
          active={layout.bottom}
          onClick={() => setLayout({ bottom: !layout.bottom })}
        >
          <PanelBottom size={15} />
        </IconButton>
        <IconButton
          label="Panneau droit (Ctrl+Alt+B)"
          active={layout.right}
          onClick={() => setLayout({ right: !layout.right })}
        >
          <PanelRight size={15} />
        </IconButton>
        <IconButton label="Thème" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
        <button
          onClick={() => openPalette()}
          className="ml-1 hidden h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-[12px] text-muted hover:bg-hover sm:flex"
        >
          <CommandIcon size={13} /> Commandes <kbd className="font-mono text-[11px]">Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}

function Rail() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const isMobile = useApp((s) => s.isMobile);
  const running = useSession((s) => Boolean(s.activeRunId));
  return (
    <nav
      className={cx(
        'flex shrink-0 bg-elev',
        isMobile
          ? 'h-12 w-full items-center justify-around border-t border-line'
          : 'w-[52px] flex-col items-center gap-0.5 border-r border-line py-2',
      )}
    >
      {VIEWS.filter((v) => !isMobile || ['chat', 'code', 'browser', 'data', 'settings'].includes(v.id)).map(
        (v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            title={`${v.label}${v.key ? ` (Alt+${v.key})` : ''}`}
            aria-label={v.label}
            className={cx(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              view === v.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg',
            )}
          >
            {v.icon}
            {v.id === 'chat' && running && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent wb-pulse" />
            )}
          </button>
        ),
      )}
    </nav>
  );
}

function StatusLine() {
  const detail = useSession((s) => s.detail);
  const runs = useSession((s) => s.runs);
  const order = useSession((s) => s.order);
  const prefs = useApp((s) => s.prefs);
  const agents = useApp((s) => s.agents);
  const wsStatus = useApp((s) => s.wsStatus);
  const status = useApp((s) => s.status);
  const running = useTerminal((s) => s.processes.filter((p) => p.status === 'running').length);
  const last = [...order]
    .reverse()
    .map((id) => runs[id])
    .find((r) => r && r.contextLimit > 0);
  const ctxPct = last ? Math.round((last.contextTokens / last.contextLimit) * 100) : null;
  const mode = detail?.session.permissionMode ?? 'normal';
  const role = agents.find((a) => a.id === (detail?.settings.role ?? 'general'));
  const plugins = status?.plugins?.filter((p) => p.status === 'connected').length ?? 0;
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-line bg-elev px-3 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        {wsStatus === 'open' ? (
          <Wifi size={11} className="text-ok" />
        ) : (
          <WifiOff size={11} className="text-err" />
        )}
        {wsStatus === 'open' ? 'connecté' : wsStatus}
      </span>
      <span className="text-accent">◆ {shortModel(detail?.session.model ?? 'auto')}</span>
      <span>effort {EFFORT_LABEL[prefs.effort].toLowerCase()}</span>
      <span className={MODE_META[mode].tone}>{MODE_META[mode].label}</span>
      {prefs.agentMode === 'plan' && <span className="text-accent">mode Plan</span>}
      <span>{role?.label ?? 'Agent'}</span>
      {ctxPct !== null && (
        <span title="Fenêtre de contexte utilisée">
          ctx {fmtTokens(last!.contextTokens)} ({ctxPct} %)
        </span>
      )}
      {(detail?.settings.skills?.length ?? 0) > 0 && (
        <span>🧩 {detail!.settings.skills!.length} skill(s)</span>
      )}
      {plugins > 0 && <span>🔌 {plugins} plugin(s)</span>}
      {status?.jev?.available && <span>Jev ✓</span>}
      {running > 0 && <span>⚙ {running} processus</span>}
      <button className="ml-auto hover:text-fg" onClick={() => void exportSession('md')}>
        exporter
      </button>
    </footer>
  );
}

function MainView() {
  const view = useApp((s) => s.view);
  switch (view) {
    case 'chat':
      return <ChatView />;
    case 'code':
      return (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <CodeView />
        </Suspense>
      );
    case 'terminal':
      return <TerminalView />;
    case 'browser':
      return <BrowserView />;
    case 'data':
      return <DataView />;
    case 'agents':
      return <AgentsView />;
    case 'skills':
      return <SkillsView />;
    case 'plugins':
      return <PluginsView />;
    case 'tasks':
      return <TasksView />;
    case 'models':
      return <ModelsView />;
    case 'settings':
      return <SettingsView />;
    case 'projects':
      return <ProjectsView />;
  }
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const app = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (app.paletteOpen) app.closePalette();
        else app.openPalette('commands');
      } else if (mod && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        app.openPalette('files');
      } else if (mod && e.key.toLowerCase() === 'b' && !e.altKey) {
        e.preventDefault();
        app.setLayout({ sidebar: !app.layout.sidebar });
      } else if (mod && e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        app.setLayout({ right: !app.layout.right });
      } else if (mod && (e.key.toLowerCase() === 'j' || e.key === '`')) {
        e.preventDefault();
        app.setLayout({
          bottom: !app.layout.bottom,
          bottomTab: e.key === '`' ? 'terminal' : app.layout.bottomTab,
        });
      } else if (e.altKey && !mod) {
        const v = VIEWS.find((x) => x.key && x.key === e.key);
        if (v) {
          e.preventDefault();
          app.setView(v.id);
        }
      } else if (e.key === 'Escape' && !app.paletteOpen) {
        const s = useSession.getState();
        const target = e.target as HTMLElement;
        if (
          s.activeRunId &&
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          !target.closest('[role=dialog]')
        )
          void s.cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    const onExport = (e: Event) => void exportSession((e as CustomEvent<string>).detail);
    window.addEventListener('wb:export', onExport);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wb:export', onExport);
    };
  }, []);
}

export function App() {
  const connState = useApp((s) => s.connState);
  const connect = useApp((s) => s.connect);
  const view = useApp((s) => s.view);
  const layout = useApp((s) => s.layout);
  const isMobile = useApp((s) => s.isMobile);
  const sessionId = useApp((s) => s.sessionId);
  useShortcuts();

  useEffect(() => {
    const c = loadConnection() ?? getConnection();
    if (c) void connect(c);
  }, [connect]);
  useEffect(() => {
    if (connState === 'connected') void useSession.getState().load(useApp.getState().sessionId);
  }, [connState]);
  useEffect(() => {
    if (connState === 'connected') void useApp.getState().refreshCredits();
  }, [sessionId, connState]);

  if (connState !== 'connected') {
    return (
      <div className="h-full">
        {connState === 'connecting' && !useApp.getState().connError ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ConnectScreen />
        )}
        <Toasts />
      </div>
    );
  }

  const sidebar =
    view === 'chat' ? <SessionList /> : view === 'code' || view === 'terminal' ? <FileTree /> : null;
  const showSidebar = layout.sidebar && sidebar && !isMobile;
  // The browser view has its own agent/actions side panel.
  const showRight =
    layout.right &&
    !isMobile &&
    !['settings', 'models', 'projects', 'plugins', 'skills', 'browser'].includes(view);
  const showBottom = layout.bottom && !isMobile;

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className={cx('flex min-h-0 flex-1', isMobile && 'flex-col-reverse')}>
        <Rail />
        <Group orientation="horizontal" className="min-h-0 min-w-0 flex-1" id="wb-main">
          {showSidebar && (
            <>
              <Panel id="sidebar" defaultSize="17%" minSize={180} maxSize="35%" className="bg-elev">
                {sidebar}
              </Panel>
              <Separator />
            </>
          )}
          <Panel id="center" minSize="30%">
            <Group orientation="vertical" id="wb-center">
              <Panel id="view" minSize="25%">
                <div className="h-full min-h-0 bg-bg">
                  <MainView />
                </div>
              </Panel>
              {showBottom && (
                <>
                  <Separator />
                  <Panel id="bottom" defaultSize="32%" minSize={120}>
                    <BottomPanel />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {showRight && (
            <>
              <Separator />
              <Panel id="right" defaultSize="25%" minSize={260} maxSize="45%">
                <RightPanel />
              </Panel>
            </>
          )}
        </Group>
      </div>
      {!isMobile && <StatusLine />}
      <CommandPalette />
      <Toasts />
    </div>
  );
}
