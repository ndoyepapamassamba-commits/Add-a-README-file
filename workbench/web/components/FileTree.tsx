import { memo, useCallback, useEffect, useState } from 'react';
import { ChevronRight, Download, File, FilePlus, Folder, FolderOpen, FolderPlus, MessageSquarePlus, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { FileEntry } from '@shared/types';
import { api, downloadFile } from '../lib/api';
import { cx } from '../lib/format';
import { useApp } from '../store/app';
import { useCode } from '../store/code';
import { IconButton } from './ui';

interface MenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
}

const ICON_COLOR: Record<string, string> = {
  ts: 'text-info',
  tsx: 'text-info',
  js: 'text-warn',
  jsx: 'text-warn',
  json: 'text-warn',
  html: 'text-accent',
  css: 'text-info',
  md: 'text-muted',
  py: 'text-ok',
  csv: 'text-ok',
  xlsx: 'text-ok',
  pdf: 'text-err',
};

function Dir({ path, depth, onMenu, version }: { path: string; depth: number; onMenu: (e: React.MouseEvent, entry: FileEntry | null) => void; version: number }) {
  const projectId = useApp((s) => s.projectId);
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    api<FileEntry[]>(`/api/projects/${projectId}/files`, { query: { path } })
      .then((e) => alive && setEntries(e))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [projectId, path, version]);
  if (!entries) return <div className="py-1 text-[12px] text-faint" style={{ paddingLeft: depth * 12 + 22 }}>…</div>;
  return (
    <>
      {entries.map((e) => (
        <Node key={e.path} entry={e} depth={depth} onMenu={onMenu} version={version} />
      ))}
      {entries.length === 0 && depth === 0 && <div className="px-4 py-2 text-[12.5px] text-faint">Projet vide</div>}
    </>
  );
}

const Node = memo(function Node({ entry, depth, onMenu, version }: { entry: FileEntry; depth: number; onMenu: (e: React.MouseEvent, entry: FileEntry | null) => void; version: number }) {
  const [open, setOpen] = useState(false);
  const active = useCode((s) => s.active === entry.path);
  const openFile = useCode((s) => s.open);
  const setView = useApp((s) => s.setView);
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  return (
    <>
      <button
        onClick={() => (entry.type === 'dir' ? setOpen((o) => !o) : void openFile(entry.path).then(() => setView('code')))}
        onContextMenu={(e) => onMenu(e, entry)}
        draggable={entry.type === 'file'}
        onDragStart={(e) => e.dataTransfer.setData('text/x-wb-path', entry.path)}
        className={cx('flex h-[26px] w-full items-center gap-1.5 truncate pr-2 text-left text-[13px] hover:bg-hover', active && 'bg-accent-soft text-fg')}
        style={{ paddingLeft: depth * 12 + 8 }}
        title={entry.path}
      >
        {entry.type === 'dir' ? (
          <>
            <ChevronRight size={13} className={cx('shrink-0 text-faint transition', open && 'rotate-90')} />
            {open ? <FolderOpen size={14} className="shrink-0 text-accent" /> : <Folder size={14} className="shrink-0 text-accent" />}
          </>
        ) : (
          <>
            <span className="w-[13px] shrink-0" />
            <File size={14} className={cx('shrink-0', ICON_COLOR[ext] ?? 'text-faint')} />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && entry.type === 'dir' && <Dir path={entry.path} depth={depth + 1} onMenu={onMenu} version={version} />}
    </>
  );
});

export function FileTree() {
  const projectId = useApp((s) => s.projectId);
  const toast = useApp((s) => s.toast);
  const setDraft = useApp((s) => s.setDraft);
  const setView = useApp((s) => s.setView);
  const version = useCode((s) => s.treeVersion);
  const bump = useCode((s) => s.bumpTree);
  const openFile = useCode((s) => s.open);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const onMenu = useCallback((e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const baseDir = (entry: FileEntry | null) => (entry ? (entry.type === 'dir' ? entry.path : entry.path.split('/').slice(0, -1).join('/')) : '');
  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      bump();
      if (okMsg) toast('success', okMsg);
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };
  const uploadTo = (dir: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      const fd = new FormData();
      for (const f of input.files ?? []) fd.append('file', f, f.name);
      void run(() => api(`/api/projects/${projectId}/upload`, { body: fd, query: { dir: dir || 'uploads' } }), 'Fichiers importés');
    };
    input.click();
  };

  if (!projectId) return <div className="p-4 text-[13px] text-faint">Aucun projet sélectionné</div>;
  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => onMenu(e, null)}>
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-2">
        <span className="flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wide text-faint">Fichiers</span>
        <IconButton label="Nouveau fichier" onClick={() => {
          const name = prompt('Nouveau fichier (chemin relatif) :');
          if (name) void run(() => api(`/api/projects/${projectId}/file`, { method: 'PUT', body: { path: name, content: '' } }).then(() => openFile(name)));
        }}>
          <FilePlus size={14} />
        </IconButton>
        <IconButton label="Nouveau dossier" onClick={() => {
          const name = prompt('Nouveau dossier :');
          if (name) void run(() => api(`/api/projects/${projectId}/files/mkdir`, { body: { path: name } }));
        }}>
          <FolderPlus size={14} />
        </IconButton>
        <IconButton label="Importer des fichiers" onClick={() => uploadTo('uploads')}>
          <Upload size={14} />
        </IconButton>
        <IconButton label="Actualiser" onClick={bump}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = [...e.dataTransfer.files];
          if (!files.length) return;
          const fd = new FormData();
          for (const f of files) fd.append('file', f, f.name);
          void run(() => api(`/api/projects/${projectId}/upload`, { body: fd }), `${files.length} fichier(s) importé(s) dans uploads/`);
        }}
      >
        <Dir path="" depth={0} onMenu={onMenu} version={version} />
      </div>
      {menu && (
        <div className="wb-in fixed z-50 w-56 rounded-xl border border-line bg-elev p-1 text-[13px] shadow-pop" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 280) }} onClick={(e) => e.stopPropagation()}>
          {menu.entry?.type === 'file' && (
            <>
              <MenuBtn icon={<MessageSquarePlus size={14} />} label="Ajouter au chat" onClick={() => {
                setDraft({ attachments: [menu.entry!.path] });
                setView('chat');
                setMenu(null);
              }} />
              <MenuBtn icon={<File size={14} />} label="Ouvrir à côté" onClick={() => void openFile(menu.entry!.path, { split: true }).then(() => { setView('code'); setMenu(null); })} />
              <MenuBtn icon={<Download size={14} />} label="Télécharger" onClick={() => void downloadFile(`/api/projects/${projectId}/raw`, menu.entry!.name, { path: menu.entry!.path, download: '1' }).then(() => setMenu(null))} />
            </>
          )}
          <MenuBtn icon={<FilePlus size={14} />} label="Nouveau fichier ici" onClick={() => {
            const name = prompt('Nom du fichier :');
            const dir = baseDir(menu.entry);
            setMenu(null);
            if (name) void run(() => api(`/api/projects/${projectId}/file`, { method: 'PUT', body: { path: dir ? `${dir}/${name}` : name, content: '' } }));
          }} />
          <MenuBtn icon={<FolderPlus size={14} />} label="Nouveau dossier ici" onClick={() => {
            const name = prompt('Nom du dossier :');
            const dir = baseDir(menu.entry);
            setMenu(null);
            if (name) void run(() => api(`/api/projects/${projectId}/files/mkdir`, { body: { path: dir ? `${dir}/${name}` : name } }));
          }} />
          <MenuBtn icon={<Upload size={14} />} label="Importer ici" onClick={() => {
            uploadTo(baseDir(menu.entry));
            setMenu(null);
          }} />
          {menu.entry && (
            <>
              <MenuBtn icon={<Pencil size={14} />} label="Renommer / déplacer" onClick={() => {
                const to = prompt('Nouveau chemin :', menu.entry!.path);
                const from = menu.entry!.path;
                setMenu(null);
                if (to && to !== from) void run(() => api(`/api/projects/${projectId}/files/move`, { body: { from, to } }), 'Déplacé');
              }} />
              <MenuBtn danger icon={<Trash2 size={14} />} label="Supprimer (corbeille)" onClick={() => {
                const p = menu.entry!.path;
                setMenu(null);
                if (confirm(`Supprimer ${p} ? (récupérable depuis Modifications)`)) void run(() => api(`/api/projects/${projectId}/file`, { method: 'DELETE', query: { path: p } }), 'Supprimé');
              }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-hover', danger && 'text-err')}>
      {icon} {label}
    </button>
  );
}
