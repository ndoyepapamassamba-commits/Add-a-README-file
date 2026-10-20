import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, Download, Globe, RotateCw } from 'lucide-react';
import { Badge, Button, Input } from '../../web/components/ui';
import { fmtBytes } from '../../web/lib/format';
import { browser } from '../lib/browser';
import { useStore } from '../lib/store';
import { downloadFile, files, getFile } from '../lib/vfs';

/** Embedded browser: workspace apps (fully interactive) and web pages (reader mode). */
export function BrowserView() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [addr, setAddr] = useState(browser.state.url);
  const [err, setErr] = useState<string | null>(null);
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => browser.subscribe(rerender), []);
  useEffect(() => setAddr(browser.state.url), [browser.state.url]);
  // The iframe lives outside React (the agent drives it even when this view is closed):
  // it is positioned over the slot while the view is shown.
  useLayoutEffect(() => {
    const f = browser.ensureFrame();
    const place = () => {
      const r = slot.current?.getBoundingClientRect();
      if (!r) return;
      Object.assign(f.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        zIndex: '5',
      });
    };
    place();
    const ro = new ResizeObserver(place);
    if (slot.current) ro.observe(slot.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      Object.assign(f.style, { left: '-20000px', width: '1280px', height: '800px', zIndex: '' });
    };
  }, []);
  const go = async (t: string) => {
    setErr(null);
    try {
      await browser.open(t);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const s = browser.state;
  const htmlFiles = Object.keys(files())
    .filter((p) => /\.html?$/i.test(p))
    .slice(0, 30);
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void browser.back().catch((e: Error) => setErr(e.message))}
            title="Précédent"
          >
            <ArrowLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void browser.reload().catch((e: Error) => setErr(e.message))}
            title="Recharger"
          >
            <RotateCw size={14} className={s.loading ? 'animate-spin' : ''} />
          </Button>
          <form
            className="flex min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              void go(addr);
            }}
          >
            <Input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="apps/mon-app.html ou https://…"
              aria-label="Adresse"
            />
          </form>
          {s.mode !== 'blank' && (
            <Badge tone={s.mode === 'app' ? 'ok' : 'info'}>
              {s.mode === 'app' ? 'application' : 'lecture'}
            </Badge>
          )}
        </div>
        {err && <div className="border-b border-line px-3 py-1.5 text-[12.5px] text-err">{err}</div>}
        <div ref={slot} className="relative min-h-0 flex-1 bg-white">
          {s.mode === 'blank' && (
            <div className="absolute inset-0 z-10 overflow-auto bg-bg p-6 text-[13px] text-muted">
              <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-fg">
                <Globe size={16} /> Navigateur intégré
              </div>
              <p className="mb-3">
                Ouvrez une application de l’espace de travail (entièrement interactive : l’agent peut cliquer,
                saisir, charger un fichier et récupérer les exports), ou une page web en mode lecture.
              </p>
              {htmlFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {htmlFiles.map((p) => (
                    <Button key={p} size="sm" variant="ghost" onClick={() => void go(p)}>
                      {p}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <aside className="flex w-[290px] shrink-0 flex-col border-l border-line">
        <div className="border-b border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
          Téléchargements ({s.downloads.length})
        </div>
        <div className="max-h-[40%] overflow-auto">
          {s.downloads.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-line/60 px-3 py-1.5 text-[12.5px]"
            >
              <span className="min-w-0 flex-1 truncate" title={d.path}>
                {d.name}
              </span>
              <span className="text-faint">{fmtBytes(d.size)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const f = getFile(d.path);
                  if (f) downloadFile(f);
                }}
                title="Enregistrer"
              >
                <Download size={12} />
              </Button>
            </div>
          ))}
          {!s.downloads.length && (
            <div className="px-3 py-2 text-[12px] text-faint">
              Les exports des applications arrivent ici (et dans downloads/).
            </div>
          )}
        </div>
        <div className="flex items-center border-y border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
          <span className="mr-auto">Console</span>
          <button className="text-[11px] normal-case text-accent" onClick={() => browser.clearConsole()}>
            effacer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11.5px]">
          {s.console.map((c, i) => (
            <div
              key={i}
              className={
                c.startsWith('error') ? 'text-err' : c.startsWith('warn') ? 'text-warn' : 'text-muted'
              }
            >
              {c}
            </div>
          ))}
        </div>
        <div className="border-t border-line px-3 py-2 text-[11.5px] text-faint">
          Isolé du reste de MASSAMBA (origine opaque) : la page n’a accès ni à votre clé ni à vos fichiers.
          <button className="ml-1 text-accent" onClick={() => useStore.getState().setView('files')}>
            Fichiers
          </button>
        </div>
      </aside>
    </div>
  );
}
