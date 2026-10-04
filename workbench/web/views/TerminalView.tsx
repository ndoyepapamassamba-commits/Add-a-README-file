import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bot, Globe, Play, Square, Trash2, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';
import { cx, fmtDuration } from '../lib/format';
import { useApp } from '../store/app';
import { useTerminal, type ProcessInfo } from '../store/runtime';
import { Badge, Button, IconButton } from '../components/ui';

function ProcessRow({ p }: { p: ProcessInfo }) {
  const setView = useApp((s) => s.setView);
  return (
    <div className="flex items-center gap-2 border-b border-line/60 px-3 py-1.5 text-[12.5px]">
      <span className={cx('h-2 w-2 shrink-0 rounded-full', p.status === 'running' ? 'bg-ok wb-pulse' : p.exitCode === 0 ? 'bg-faint' : 'bg-err')} />
      {p.origin === 'agent' && <Bot size={12} className="shrink-0 text-accent" />}
      <span className="min-w-0 flex-1 truncate font-mono" title={p.command}>
        {p.command}
      </span>
      {p.ports.map((port) => (
        <button
          key={port}
          className="shrink-0 rounded bg-info/15 px-1.5 font-mono text-[11px] text-info hover:underline"
          title="Ouvrir dans le navigateur intégré"
          onClick={() => {
            setView('browser');
            window.dispatchEvent(new CustomEvent('wb:browser-navigate', { detail: `http://127.0.0.1:${port}` }));
          }}
        >
          :{port}
        </button>
      ))}
      <span className="shrink-0 text-faint">{p.status === 'running' ? (p.background ? 'arrière-plan' : 'en cours') : `code ${p.exitCode ?? '—'} · ${fmtDuration(p.durationMs)}`}</span>
      {p.status === 'running' && (
        <IconButton label="Arrêter" onClick={() => void api(`/api/terminal/${p.id}/kill`, { method: 'POST' })}>
          <Square size={12} />
        </IconButton>
      )}
    </div>
  );
}

/** Command runner with live output; used in the Terminal view and the bottom panel. */
export function TerminalPane({ compact = false }: { compact?: boolean }) {
  const projectId = useApp((s) => s.projectId);
  const toast = useApp((s) => s.toast);
  const { lines, processes, history, load, clear, pushHistory } = useTerminal();
  const [cmd, setCmd] = useState('');
  const [cwd, setCwd] = useState('');
  const [stdin, setStdin] = useState('');
  const [hIdx, setHIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const running = processes.filter((p) => p.status === 'running');
  const foreground = running.find((p) => !p.background && p.origin === 'user');

  useEffect(() => {
    void load();
  }, [load]);

  const virt = useVirtualizer({ count: lines.length, getScrollElement: () => scrollRef.current, estimateSize: () => 18, overscan: 30 });
  useEffect(() => {
    if (stick.current && lines.length) virt.scrollToIndex(lines.length - 1, { align: 'end' });
  }, [lines.length, virt]);

  async function run(background = false, confirmed = false) {
    const command = cmd.trim();
    if (!command || !projectId) return;
    try {
      const r = await api<{ processId?: string; needsConfirmation?: boolean; level?: string; reasons?: string[] }>(`/api/projects/${projectId}/terminal`, { body: { command, cwd, background, confirmed } });
      if (r.needsConfirmation) {
        if (confirm(`Commande potentiellement dangereuse (${r.reasons?.join(', ')}).\n\n${command}\n\nExécuter quand même ?`)) await run(background, true);
        return;
      }
      pushHistory(command);
      setCmd('');
      setHIdx(-1);
      stick.current = true;
    } catch (err) {
      toast('error', (err as Error).message);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      {!compact && running.length > 0 && <div className="max-h-40 shrink-0 overflow-auto border-b border-line bg-elev">{running.map((p) => <ProcessRow key={p.id} p={p} />)}</div>}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-[18px]"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {lines.length === 0 && <div className="text-faint">Terminal prêt. Les commandes de l'agent s'affichent aussi ici en direct.</div>}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const l = lines[vi.index]!;
            return (
              <div
                key={l.id}
                className={cx('absolute left-0 right-0 whitespace-pre-wrap break-all', l.stream === 'stderr' && 'text-err', l.stream === 'cmd' && 'mt-1 font-semibold text-accent', l.stream === 'info' && 'text-faint')}
                style={{ transform: `translateY(${vi.start}px)` }}
                ref={virt.measureElement}
                data-index={vi.index}
              >
                {l.text || ' '}
              </div>
            );
          })}
        </div>
      </div>
      {foreground && (
        <form
          className="flex items-center gap-2 border-t border-line px-3 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void api(`/api/terminal/${foreground.id}/stdin`, { body: { data: `${stdin}\n` } });
            setStdin('');
          }}
        >
          <span className="text-[11.5px] text-warn">stdin →</span>
          <input value={stdin} onChange={(e) => setStdin(e.target.value)} className="h-7 flex-1 bg-transparent font-mono text-[12.5px] outline-none" placeholder="Entrée pour le processus en cours" />
          <Button size="sm" variant="ghost" type="button" onClick={() => void api(`/api/terminal/${foreground.id}/stdin`, { body: { data: '', end: true } })}>
            EOF
          </Button>
          <Button size="sm" variant="danger" type="button" onClick={() => void api(`/api/terminal/${foreground.id}/kill`, { method: 'POST' })}>
            Ctrl+C
          </Button>
        </form>
      )}
      <form
        className="flex items-center gap-2 border-t border-line bg-elev px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
      >
        {!compact && <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="./" title="Sous-dossier (cwd)" className="h-7 w-24 rounded-md border border-line bg-input px-2 font-mono text-[12px] outline-none" />}
        <span className="font-mono text-accent">$</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && history.length) {
              e.preventDefault();
              const i = Math.min(history.length - 1, hIdx + 1);
              setHIdx(i);
              setCmd(history[history.length - 1 - i] ?? '');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const i = Math.max(-1, hIdx - 1);
              setHIdx(i);
              setCmd(i < 0 ? '' : (history[history.length - 1 - i] ?? ''));
            } else if (e.key === 'c' && e.ctrlKey && foreground) {
              e.preventDefault();
              void api(`/api/terminal/${foreground.id}/kill`, { method: 'POST' });
            }
          }}
          placeholder="Commande (Entrée = exécuter, ↑ historique) — exécutée dans le projet, sans secrets"
          className="h-7 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:text-faint"
        />
        <IconButton label="Exécuter" type="submit">
          <CornerDownLeft size={14} />
        </IconButton>
        <IconButton label="Lancer en arrière-plan (serveurs, watchers)" type="button" onClick={() => void run(true)}>
          <Play size={13} />
        </IconButton>
        <IconButton label="Effacer" type="button" onClick={clear}>
          <Trash2 size={13} />
        </IconButton>
      </form>
    </div>
  );
}

export function TerminalView() {
  const processes = useTerminal((s) => s.processes);
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <TerminalPane />
      </div>
      <div className="hidden w-[340px] shrink-0 flex-col border-l border-line bg-elev lg:flex">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
          Processus <Badge>{processes.length}</Badge>
          <Globe size={12} className="ml-auto" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {processes.length === 0 && <div className="p-3 text-[12.5px] text-faint">Aucun processus.</div>}
          {processes.map((p) => (
            <ProcessRow key={p.id} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
