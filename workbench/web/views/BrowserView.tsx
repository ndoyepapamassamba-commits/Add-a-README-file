import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, Camera, Globe, Loader2, MousePointerClick, RotateCw, ScanText, User, X } from 'lucide-react';
import { api } from '../lib/api';
import { cx, fmtTime } from '../lib/format';
import { ws } from '../lib/ws';
import { useApp } from '../store/app';
import { useBrowser, type BrowserLogs, type BrowserStateInfo } from '../store/runtime';
import { useSession } from '../store/session';
import { Composer } from '../components/chat/Composer';
import { Badge, Empty, IconButton, Tabs } from '../components/ui';

type SideTab = 'actions' | 'chat' | 'dom' | 'console' | 'network';

interface Snapshot {
  url: string;
  title: string;
  elements: { ref: number; tag: string; role: string; text: string; href?: string; type?: string }[];
}

const KEY_MAP: Record<string, string> = {
  Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
};

export function browserKey(sessionId: string | null, projectId: string | null): string {
  return sessionId ?? `user-${projectId ?? 'default'}`;
}

export function BrowserView() {
  const projectId = useApp((s) => s.projectId);
  const sessionId = useApp((s) => s.sessionId);
  const status = useApp((s) => s.status);
  const toast = useApp((s) => s.toast);
  const key = browserKey(sessionId, projectId);
  const { frame, frameKey, state, actions, reset, setState } = useBrowser();
  const [url, setUrl] = useState('');
  const [tab, setTab] = useState<SideTab>('actions');
  const [logs, setLogs] = useState<BrowserLogs | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const wheelAcc = useRef({ dx: 0, dy: 0, t: 0 });

  useEffect(() => {
    if (frameKey !== key) reset(key);
    const unsub = ws.subscribeBrowser(key);
    void api<{ state: BrowserStateInfo | null; logs: BrowserLogs }>(`/api/browser/${key}/state`).then((r) => {
      if (r.state) setState(r.state);
      setLogs(r.logs);
      if (useBrowser.getState().actions.length === 0) useBrowser.setState({ actions: r.logs.actions });
    });
    return unsub;
  }, [key, frameKey, reset, setState]);

  useEffect(() => {
    if (state?.url) setUrl(state.url);
  }, [state?.url]);

  // console & network refresh while the panel is visible
  useEffect(() => {
    if (tab !== 'console' && tab !== 'network') return;
    const load = () => void api<{ logs: BrowserLogs }>(`/api/browser/${key}/state`).then((r) => setLogs(r.logs)).catch(() => undefined);
    load();
    const t = window.setInterval(load, 2500);
    return () => window.clearInterval(t);
  }, [tab, key]);

  const navigate = useCallback(
    async (target: string) => {
      if (!projectId || !target.trim()) return;
      setBusy(true);
      try {
        await api(`/api/browser/${key}/navigate`, { body: { projectId, url: target.trim() } });
      } catch (err) {
        toast('error', (err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [key, projectId, toast],
  );

  useEffect(() => {
    const onNav = (e: Event) => void navigate((e as CustomEvent<string>).detail);
    window.addEventListener('wb:browser-navigate', onNav);
    return () => window.removeEventListener('wb:browser-navigate', onNav);
  }, [navigate]);

  const action = async (a: 'back' | 'forward' | 'reload' | 'screenshot' | 'extract') => {
    if (!projectId) return;
    try {
      const r = await api<Snapshot & { artifactId?: string }>(`/api/browser/${key}/action`, { body: { projectId, action: a } });
      if (a === 'extract') {
        setSnap(r);
        setTab('dom');
      }
      if (a === 'screenshot') {
        toast('success', 'Capture enregistrée dans les artefacts');
        void useSession.getState().refreshSide();
      }
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  const toViewport = (e: React.MouseEvent) => {
    const img = imgRef.current;
    if (!img || !state) return null;
    const r = img.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * state.viewport.width, y: ((e.clientY - r.top) / r.height) * state.viewport.height };
  };
  const send = (input: Record<string, unknown>) => projectId && ws.send({ type: 'browser_input', key, projectId, input });

  if (status && !status.browser.available) {
    return (
      <Empty icon={<Globe size={36} />} title={`Moteur ${status.browser.engine} non installé`}>
        Installez-le sur la machine de l'agent : <code className="font-mono">npx playwright install {status.browser.engine}</code>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <form
          className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate(url);
          }}
        >
          <IconButton label="Précédent" type="button" onClick={() => void action('back')}>
            <ArrowLeft size={15} />
          </IconButton>
          <IconButton label="Suivant" type="button" onClick={() => void action('forward')}>
            <ArrowRight size={15} />
          </IconButton>
          <IconButton label="Recharger" type="button" onClick={() => void action('reload')}>
            <RotateCw size={14} />
          </IconButton>
          <div className="mx-1 flex h-8 flex-1 items-center gap-2 rounded-full border border-line bg-input px-3 focus-within:border-accent">
            {busy || state?.loading ? <Loader2 size={13} className="wb-spin text-accent" /> : <Globe size={13} className="text-faint" />}
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Saisissez une adresse (https://…) — l'agent et vous pilotez le même navigateur" className="flex-1 bg-transparent text-[13px] outline-none" />
          </div>
          <IconButton label="Capture d'écran" type="button" onClick={() => void action('screenshot')}>
            <Camera size={15} />
          </IconButton>
          <IconButton label="Analyser la page (éléments)" type="button" onClick={() => void action('extract')}>
            <ScanText size={15} />
          </IconButton>
          <IconButton label="Fermer l'onglet" type="button" onClick={() => void api(`/api/browser/${key}/close`, { method: 'POST' }).then(() => reset(key))}>
            <X size={15} />
          </IconButton>
        </form>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-bg p-3">
          {frame ? (
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${frame}`}
              alt={state?.title || 'Page'}
              tabIndex={0}
              draggable={false}
              className="max-h-full max-w-full cursor-pointer rounded-lg border border-line shadow-pop outline-none focus:ring-2 focus:ring-accent"
              onClick={(e) => {
                const p = toViewport(e);
                if (p) send({ kind: 'click', x: p.x, y: p.y });
                (e.target as HTMLElement).focus();
              }}
              onDoubleClick={(e) => {
                const p = toViewport(e);
                if (p) send({ kind: 'click', x: p.x, y: p.y, double: true });
              }}
              onWheel={(e) => {
                const acc = wheelAcc.current;
                acc.dx += e.deltaX;
                acc.dy += e.deltaY;
                if (Date.now() - acc.t > 120) {
                  const p = toViewport(e) ?? { x: 640, y: 400 };
                  send({ kind: 'wheel', x: p.x, y: p.y, dx: acc.dx, dy: acc.dy });
                  acc.dx = 0;
                  acc.dy = 0;
                  acc.t = Date.now();
                }
              }}
              onKeyDown={(e) => {
                if (KEY_MAP[e.key]) {
                  e.preventDefault();
                  send({ kind: 'key', key: KEY_MAP[e.key] });
                } else if ((e.ctrlKey || e.metaKey) && e.key.length === 1) {
                  e.preventDefault();
                  send({ kind: 'key', key: `Control+${e.key.toUpperCase()}` });
                } else if (e.key.length === 1) {
                  e.preventDefault();
                  send({ kind: 'type', text: e.key });
                }
              }}
            />
          ) : (
            <Empty icon={<Globe size={36} />} title="Navigateur prêt">
              Saisissez une adresse ou demandez à l'agent « ouvre … ». La page s'affiche ici en direct ; cliquez, faites défiler et tapez au clavier directement dans la vue.
            </Empty>
          )}
        </div>
        <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-[11.5px] text-faint">
          <span className="truncate">{state?.title || '—'}</span>
          <span className="ml-auto">{state?.engine ?? status?.browser.engine}</span>
          {state && <span>{state.viewport.width}×{state.viewport.height}</span>}
        </div>
      </div>
      <div className="flex w-[380px] shrink-0 flex-col border-l border-line bg-elev">
        <Tabs<SideTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'actions', label: 'Actions', badge: actions.length ? <Badge>{actions.length}</Badge> : undefined },
            { id: 'chat', label: 'Agent' },
            { id: 'dom', label: 'DOM' },
            { id: 'console', label: 'Console', badge: logs?.console.some((c) => c.level === 'error') ? <Badge tone="err">{logs.console.filter((c) => c.level === 'error').length}</Badge> : undefined },
            { id: 'network', label: 'Réseau' },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === 'actions' && (
            <div className="p-2">
              {actions.length === 0 && <div className="p-2 text-[12.5px] text-faint">La chronologie des actions (agent et utilisateur) apparaîtra ici.</div>}
              <ol className="relative ml-2 border-l border-line">
                {[...actions].reverse().map((a) => (
                  <li key={a.id} className="mb-1.5 ml-3">
                    <span className={cx('absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-elev', a.ok ? 'bg-ok' : 'bg-err')} />
                    <div className="flex items-center gap-1.5 text-[12.5px]">
                      {a.origin === 'agent' ? <Bot size={12} className="text-accent" /> : <User size={12} className="text-info" />}
                      <span className="font-semibold capitalize">{a.type}</span>
                      <span className="ml-auto text-[11px] text-faint">{fmtTime(a.ts)}</span>
                    </div>
                    <div className="truncate font-mono text-[11.5px] text-muted" title={a.detail}>
                      {a.detail}
                    </div>
                    {a.error && <div className="text-[11.5px] text-err">{a.error}</div>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {tab === 'chat' && (
            <div className="flex h-full flex-col">
              <div className="p-3 text-[12.5px] text-muted">Demandez à l'agent d'agir sur la page : « connecte-toi », « cherche X », « télécharge le rapport », « compare avec … ».</div>
              <div className="mt-auto">
                <Composer compact autoFocus={false} />
              </div>
            </div>
          )}
          {tab === 'dom' && (
            <div className="p-2">
              {!snap && (
                <button className="m-2 flex items-center gap-1.5 text-[12.5px] text-accent hover:underline" onClick={() => void action('extract')}>
                  <MousePointerClick size={13} /> Analyser les éléments interactifs de la page
                </button>
              )}
              {snap?.elements.map((el) => (
                <div key={el.ref} className="flex items-start gap-2 border-b border-line/50 px-1 py-1 text-[12px]">
                  <span className="w-8 shrink-0 font-mono text-faint">[{el.ref}]</span>
                  <span className="shrink-0 font-mono text-info">{el.tag}</span>
                  <span className="min-w-0 truncate">{el.text || el.href || el.type}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'console' && (
            <div className="font-mono text-[11.5px]">
              {(logs?.console ?? []).length === 0 && <div className="p-3 text-faint">Aucun message.</div>}
              {[...(logs?.console ?? [])].reverse().map((c, i) => (
                <div key={i} className={cx('border-b border-line/50 px-2.5 py-1 whitespace-pre-wrap break-all', c.level === 'error' && 'bg-err/8 text-err', c.level === 'warning' && 'text-warn')}>
                  {c.text}
                </div>
              ))}
            </div>
          )}
          {tab === 'network' && (
            <div className="text-[11.5px]">
              {[...(logs?.network ?? [])].reverse().map((n) => (
                <div key={n.id} className="flex items-center gap-2 border-b border-line/50 px-2.5 py-1">
                  <span className="w-10 shrink-0 font-mono text-faint">{n.method}</span>
                  <span className={cx('w-9 shrink-0 font-mono', n.failure || (n.status ?? 0) >= 400 ? 'text-err' : 'text-ok')}>{n.failure ? 'ERR' : (n.status ?? '…')}</span>
                  <span className="min-w-0 flex-1 truncate font-mono" title={n.url}>
                    {n.url}
                  </span>
                  <span className="shrink-0 text-faint">{n.durationMs !== null ? `${n.durationMs}ms` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
