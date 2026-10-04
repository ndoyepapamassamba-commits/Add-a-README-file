import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Bot, Code2, Database, FileText, FolderKanban, Globe, ListTodo, MessageSquare, Moon, Play, Plug, Puzzle, Search, Settings, Shield, Sparkles, SquareTerminal, FileSearch, Download, ListChecks } from 'lucide-react';
import { api } from '../../lib/api';
import { shortModel } from '../../lib/format';
import type { View } from '../../lib/types';
import { useApp } from '../../store/app';
import { useCode } from '../../store/code';
import { useSession } from '../../store/session';
import { exportSession } from './Panels';
import { SLASH_COMMANDS } from '../chat/Composer';

const VIEWS: { id: View; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={14} />, key: '1' },
  { id: 'code', label: 'Code', icon: <Code2 size={14} />, key: '2' },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} />, key: '3' },
  { id: 'browser', label: 'Navigateur', icon: <Globe size={14} />, key: '4' },
  { id: 'data', label: 'Données', icon: <Database size={14} />, key: '5' },
  { id: 'agents', label: 'Agents', icon: <Bot size={14} />, key: '6' },
  { id: 'skills', label: 'Skills', icon: <Puzzle size={14} />, key: '7' },
  { id: 'plugins', label: 'Plugins', icon: <Plug size={14} />, key: '8' },
  { id: 'tasks', label: 'Tâches', icon: <ListTodo size={14} />, key: '9' },
  { id: 'models', label: 'Modèles', icon: <Sparkles size={14} />, key: '' },
  { id: 'projects', label: 'Projets', icon: <FolderKanban size={14} />, key: '0' },
  { id: 'settings', label: 'Réglages', icon: <Settings size={14} />, key: ',' },
];
export { VIEWS };

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const mode = useApp((s) => s.paletteMode);
  const close = useApp((s) => s.closePalette);
  const app = useApp();
  const session = useSession();
  const [files, setFiles] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !app.projectId) return;
    setSearch('');
    void api<string[]>(`/api/projects/${app.projectId}/all-files`).then(setFiles).catch(() => setFiles([]));
  }, [open, app.projectId]);

  if (!open) return null;
  const run = (fn: () => void | Promise<unknown>) => {
    close();
    void fn();
  };
  const fileItems = (search ? files.filter((f) => f.toLowerCase().includes(search.toLowerCase())) : files).slice(0, mode === 'files' ? 200 : 40);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Command className="wb-in w-full max-w-[640px] overflow-hidden rounded-2xl border border-line bg-elev shadow-pop" label="Palette de commandes" shouldFilter={mode !== 'files'} loop>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={15} className="text-faint" />
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            placeholder={mode === 'files' ? 'Rechercher un fichier…' : 'Commande, vue, fichier, modèle…'}
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
        </div>
        <Command.List className="max-h-[56vh] overflow-auto p-1.5">
          <Command.Empty className="p-4 text-center text-[13px] text-faint">Aucun résultat</Command.Empty>
          {mode === 'commands' && (
            <>
              <Command.Group heading="Actions">
                <Item icon={<MessageSquare size={14} />} label="Nouvelle session" hint="/clear" onSelect={() => run(() => app.newSession())} />
                <Item icon={<Play size={14} />} label="Lancer l'agent sur une tâche" onSelect={() => run(() => app.setView('chat'))} />
                <Item icon={<ListChecks size={14} />} label={`Mode Plan : ${app.prefs.agentMode === 'plan' ? 'désactiver' : 'activer'}`} hint="/plan" onSelect={() => run(() => app.setPrefs({ agentMode: app.prefs.agentMode === 'plan' ? 'chat' : 'plan' }))} />
                <Item icon={<FileSearch size={14} />} label="Review my work (second agent)" hint="/review" onSelect={() => run(() => session.review())} />
                <Item icon={<Globe size={14} />} label="Ouvrir le navigateur" onSelect={() => run(() => app.setView('browser'))} />
                <Item icon={<SquareTerminal size={14} />} label="Ouvrir le terminal (panneau)" hint="Ctrl+`" onSelect={() => run(() => app.setLayout({ bottom: true, bottomTab: 'terminal' }))} />
                <Item icon={<Download size={14} />} label="Exporter la session (Markdown)" onSelect={() => run(() => exportSession('md'))} />
                <Item icon={<Download size={14} />} label="Exporter la session (PDF)" onSelect={() => run(() => exportSession('pdf'))} />
                <Item icon={<Download size={14} />} label="Exporter la session (JSON)" onSelect={() => run(() => exportSession('json'))} />
                <Item icon={<Moon size={14} />} label={`Thème ${app.theme === 'dark' ? 'clair' : 'sombre'}`} onSelect={() => run(() => app.setTheme(app.theme === 'dark' ? 'light' : 'dark'))} />
              </Command.Group>
              <Command.Group heading="Vues">
                {VIEWS.map((v) => (
                  <Item key={v.id} icon={v.icon} label={v.label} hint={v.key ? `Alt+${v.key}` : undefined} onSelect={() => run(() => app.setView(v.id))} />
                ))}
              </Command.Group>
              <Command.Group heading="Mode de permissions">
                {(['safe', 'normal', 'autonomous'] as const).map((m) => (
                  <Item key={m} icon={<Shield size={14} />} label={`Mode ${m.toUpperCase()}`} onSelect={() => run(() => session.patchSession({ permissionMode: m }))} />
                ))}
              </Command.Group>
              <Command.Group heading="Agents">
                {app.agents.map((a) => (
                  <Item key={a.id} icon={<Bot size={14} />} label={`Agent : ${a.label}`} onSelect={() => run(() => session.patchSession({ role: a.id }))} />
                ))}
              </Command.Group>
              <Command.Group heading="Modèles">
                <Item icon={<Sparkles size={14} />} label="Modèle : Auto" onSelect={() => run(() => session.patchSession({ model: 'auto' }))} />
                {app.models
                  .filter((m) => m.capabilities.tools)
                  .slice(0, 400)
                  .map((m) => (
                    <Item key={m.id} icon={<Sparkles size={14} />} label={`Modèle : ${shortModel(m.id)}`} value={`modele ${m.id} ${m.name}`} onSelect={() => run(() => session.patchSession({ model: m.id }))} />
                  ))}
              </Command.Group>
              <Command.Group heading="Commandes du chat">
                {SLASH_COMMANDS.map((c) => (
                  <Item key={c.name} icon={<span className="font-mono text-[12px] text-accent">/</span>} label={`/${c.name}`} hint={c.description} onSelect={() => run(() => app.setDraft({ text: `/${c.name}${c.args ? ' ' : ''}` }))} />
                ))}
              </Command.Group>
            </>
          )}
          <Command.Group heading="Fichiers">
            {fileItems.map((f) => (
              <Item key={f} icon={<FileText size={14} />} label={f} value={`fichier ${f}`} onSelect={() => run(() => useCode.getState().open(f).then(() => app.setView('code')))} />
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({ icon, label, hint, onSelect, value }: { icon: React.ReactNode; label: string; hint?: string; onSelect: () => void; value?: string }) {
  return (
    <Command.Item value={value ?? label} onSelect={onSelect} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px]">
      <span className="w-4 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11.5px] text-faint">{hint}</span>}
    </Command.Item>
  );
}
