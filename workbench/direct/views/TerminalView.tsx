import { useEffect, useRef, useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { diagnose } from '../../server/tools/diagnose';
import { Button } from '../../web/components/ui';
import { userShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { files } from '../lib/vfs';

interface Line {
  kind: 'cmd' | 'out' | 'err' | 'diag';
  text: string;
  cwd?: string;
}

/** Embedded terminal over the browser workspace (pipes, redirections, node / python, curl…). */
export function TerminalView() {
  const [lines, setLines] = useState<Line[]>([
    {
      kind: 'out',
      text: "Terminal MASSAMBA (sans serveur) — tapez help. L'espace de travail est celui de l'onglet Fichiers.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState(-1);
  const [lastFail, setLastFail] = useState<{ cmd: string; out: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [lines]);

  const run = async (cmd: string) => {
    if (!cmd.trim()) return;
    setBusy(true);
    const cwd = userShell.cwd;
    setLines((l) => [...l, { kind: 'cmd', text: cmd, cwd }]);
    const r = await userShell.exec(cmd);
    setBusy(false);
    if (r.out.includes('\u001bc')) {
      setLines([]);
      return;
    }
    const add: Line[] = r.out ? [{ kind: r.code ? 'err' : 'out', text: r.out }] : [];
    const d = diagnose(r.out, r.code);
    if (d && r.code !== 127)
      add.push({
        kind: 'diag',
        text: `ANALYSE : ${d.category}${d.locations.length ? ` — ${d.locations.join(', ')}` : ''}\n${d.hints.join(' ')}`,
      });
    setLastFail(r.code && r.code !== 127 ? { cmd, out: r.out } : null);
    setLines((l) => [...l, ...add]);
    setTimeout(() => field.current?.focus(), 0);
  };
  const complete = () => {
    const parts = input.split(' ');
    const last = parts.pop() ?? '';
    const base = userShell.cwd ? `${userShell.cwd}/` : '';
    const all = Object.keys(files());
    const cands = [
      ...new Set(
        all
          .filter((f) => f.startsWith(base + last))
          .map((f) => {
            const rest = f.slice(base.length + last.length);
            const i = rest.indexOf('/');
            return last + (i >= 0 ? rest.slice(0, i + 1) : rest);
          }),
      ),
    ];
    if (cands.length === 1) setInput([...parts, cands[0]].join(' '));
    else if (cands.length > 1) setLines((l) => [...l, { kind: 'out', text: cands.join('  ') }]);
  };
  const askAgent = () => {
    if (!lastFail) return;
    useStore.setState({
      draft: `La commande suivante échoue dans le terminal. Analyse l'erreur, corrige la cause, puis relance-la pour vérifier.\n\n$ ${lastFail.cmd}\n${lastFail.out.slice(0, 4000)}`,
    });
    useStore.getState().setView('chat');
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f1419] text-[#d6dde3]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[12px] text-[#8aa0ad]">
        <span className="mr-auto">Terminal — espace de travail du navigateur</span>
        {lastFail && (
          <Button size="sm" variant="ghost" onClick={askAgent}>
            <Sparkles size={13} /> Corriger avec l’agent
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setLines([])} title="Effacer">
          <Trash2 size={13} />
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-[1.45]"
        onClick={() => field.current?.focus()}
      >
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            {l.kind === 'cmd' ? (
              <span>
                <span className="text-[#8CC63F]">massamba</span>
                <span className="text-[#5fa8d3]">:/{l.cwd}</span>$ {l.text}
              </span>
            ) : (
              <span
                className={l.kind === 'err' ? 'text-[#ff8f8f]' : l.kind === 'diag' ? 'text-[#f5c26b]' : ''}
              >
                {l.text}
              </span>
            )}
          </div>
        ))}
        <div className="flex items-center" ref={end}>
          <span className="text-[#8CC63F]">massamba</span>
          <span className="text-[#5fa8d3]">:/{userShell.cwd}</span>$&nbsp;
          <input
            ref={field}
            autoFocus
            aria-label="Commande"
            disabled={busy}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              const h = userShell.history;
              if (e.key === 'Enter') {
                const c = input;
                setInput('');
                setHist(-1);
                void run(c);
              } else if (e.key === 'ArrowUp' && h.length) {
                e.preventDefault();
                const i = hist < 0 ? h.length - 1 : Math.max(0, hist - 1);
                setHist(i);
                setInput(h[i] ?? '');
              } else if (e.key === 'ArrowDown' && hist >= 0) {
                e.preventDefault();
                const i = hist + 1;
                setHist(i >= h.length ? -1 : i);
                setInput(i >= h.length ? '' : (h[i] ?? ''));
              } else if (e.key === 'Tab') {
                e.preventDefault();
                complete();
              } else if (e.key === 'l' && e.ctrlKey) {
                e.preventDefault();
                setLines([]);
              }
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-[#d6dde3] outline-none"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
