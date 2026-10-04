import { useCallback, useEffect, useState } from 'react';
import { BookMarked, FolderGit2, FolderOpen, GitBranch, GitCommitHorizontal, GitFork, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { cx, fmtBytes, fmtRelative } from '../lib/format';
import type { ArtifactRecord } from '../lib/types';
import { useApp } from '../store/app';
import { useCode } from '../store/code';
import { ArtifactCard, CodeBlock } from '../components/rich';
import { Badge, Button, Empty, Field, Input, Modal, Section, Select, Spinner, Tabs, Textarea } from '../components/ui';

interface Analysis {
  fileCount: number;
  totalBytes: number;
  languages: { language: string; files: number }[];
  frameworks: string[];
  packageManagers: string[];
  scripts: Record<string, string>;
  testFrameworks: string[];
  entryPoints: string[];
  notableFiles: string[];
  topLevel: string[];
}
interface GitInfo {
  status: { isRepo: boolean; branch: string | null; ahead: number; behind: number; files: { path: string; status: string }[] };
  branches: { current: string | null; all: string[] };
  log: { hash: string; author: string; date: string; subject: string }[];
}
interface Fact {
  id: string;
  category: string;
  text: string;
}
const CATEGORIES = ['architecture', 'convention', 'important_file', 'decision', 'instruction', 'known_error', 'context'];

function Overview({ projectId }: { projectId: string }) {
  const [a, setA] = useState<Analysis | null>(null);
  const load = useCallback((refresh = false) => void api<Analysis>(`/api/projects/${projectId}/analysis`, { query: { refresh: refresh ? 1 : undefined } }).then(setA), [projectId]);
  useEffect(() => load(), [load]);
  if (!a) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Fichiers', a.fileCount.toLocaleString('fr-FR')],
          ['Taille', fmtBytes(a.totalBytes)],
          ['Langage principal', a.languages[0]?.language ?? '—'],
          ['Frameworks', a.frameworks.join(', ') || '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-panel p-3">
            <div className="text-[11.5px] text-muted">{l}</div>
            <div className="truncate font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <div className="mb-1.5 font-semibold">Langages</div>
          {a.languages.slice(0, 10).map((l) => (
            <div key={l.language} className="flex justify-between">
              <span>{l.language}</span>
              <span className="text-muted">{l.files}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-panel p-3 text-[12.5px]">
          <div className="mb-1.5 font-semibold">Scripts & points d'entrée</div>
          {Object.entries(a.scripts).slice(0, 12).map(([k, v]) => (
            <div key={k} className="truncate font-mono">
              <span className="text-accent">{k}</span> {v}
            </div>
          ))}
          {!Object.keys(a.scripts).length && <div className="text-faint">Aucun script.</div>}
          <div className="mt-2 text-muted">Entrées : {a.entryPoints.join(', ') || '—'}</div>
          <div className="text-muted">Tests : {a.testFrameworks.join(', ') || '—'}</div>
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => load(true)}>
        <RefreshCw size={13} /> Ré-analyser
      </Button>
    </div>
  );
}

function GitPanel({ projectId }: { projectId: string }) {
  const toast = useApp((s) => s.toast);
  const showDiff = useCode((s) => s.showDiff);
  const setView = useApp((s) => s.setView);
  const [g, setG] = useState<GitInfo | null>(null);
  const [msg, setMsg] = useState('');
  const [diff, setDiff] = useState<string | null>(null);
  const load = useCallback(() => void api<GitInfo>(`/api/projects/${projectId}/git`).then(setG), [projectId]);
  useEffect(() => load(), [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast('success', ok);
      load();
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };
  if (!g) return <Spinner />;
  if (!g.status.isRepo)
    return (
      <Empty icon={<FolderGit2 size={30} />} title="Pas de dépôt git">
        <Button variant="primary" onClick={() => void act(() => api(`/api/projects/${projectId}/git/init`, { method: 'POST' }), 'Dépôt initialisé')}>
          Initialiser git
        </Button>
      </Empty>
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={15} className="text-accent" />
        <Select value={g.branches.current ?? ''} onChange={(b) => void act(() => api(`/api/projects/${projectId}/git/checkout`, { body: { branch: b } }), `Branche ${b}`)} options={g.branches.all.map((b) => ({ value: b, label: b }))} />
        <Button size="sm" onClick={() => {
          const name = prompt('Nom de la nouvelle branche :');
          if (name) void act(() => api(`/api/projects/${projectId}/git/branch`, { body: { name } }), `Branche ${name} créée`);
        }}>
          <Plus size={13} /> Branche
        </Button>
        {(g.status.ahead > 0 || g.status.behind > 0) && <Badge tone="info">↑{g.status.ahead} ↓{g.status.behind}</Badge>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={load}>
          <RefreshCw size={13} />
        </Button>
      </div>
      <div className="rounded-xl border border-line">
        <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[12.5px] font-semibold">
          Modifications ({g.status.files.length})
          <button className="text-accent hover:underline" onClick={() => void api<{ diff: string }>(`/api/projects/${projectId}/git/diff`).then((r) => setDiff(r.diff))}>
            voir le diff complet
          </button>
        </div>
        {g.status.files.length === 0 && <div className="px-3 py-2 text-[12.5px] text-faint">Arbre de travail propre.</div>}
        {g.status.files.map((f) => (
          <div key={f.path} className="flex items-center gap-2 border-b border-line/50 px-3 py-1 text-[12.5px]">
            <Badge tone={f.status === 'untracked' || f.status === 'added' ? 'ok' : f.status === 'deleted' ? 'err' : 'warn'}>{f.status}</Badge>
            <button className="truncate font-mono hover:underline" onClick={() => void api<{ diff: string }>(`/api/projects/${projectId}/git/diff`, { query: { path: f.path } }).then((r) => setDiff(r.diff))}>
              {f.path}
            </button>
          </div>
        ))}
        <form
          className="flex gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (msg.trim()) void act(() => api(`/api/projects/${projectId}/git/commit`, { body: { message: msg } }), 'Commit créé').then(() => setMsg(''));
          }}
        >
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message de commit (toutes les modifications)" />
          <Button type="submit" variant="primary" disabled={!msg.trim() || !g.status.files.length}>
            <GitCommitHorizontal size={14} /> Commit
          </Button>
        </form>
        <div className="px-3 pb-2 text-[11.5px] text-faint">Le push vers un dépôt distant n'est jamais effectué automatiquement.</div>
      </div>
      <Section title="Historique">
        <div className="divide-y divide-line rounded-xl border border-line">
          {g.log.map((c) => (
            <div key={c.hash} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
              <span className="font-mono text-accent">{c.hash.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate">{c.subject}</span>
              <span className="text-faint">{c.author}</span>
              <span className="text-faint">{c.date.slice(0, 16)}</span>
            </div>
          ))}
        </div>
      </Section>
      <Modal open={diff !== null} onClose={() => setDiff(null)} width={1000} title="Diff git" footer={
        <Button size="sm" onClick={() => {
          showDiff({ title: 'git diff', path: 'git.diff', before: '', after: diff ?? '' });
          setDiff(null);
          setView('code');
        }}>
          Ouvrir dans l'éditeur
        </Button>
      }>
        {diff ? <CodeBlock code={diff} lang="diff" /> : <div className="text-faint">Aucune différence.</div>}
      </Modal>
    </div>
  );
}

function MemoryPanel({ projectId }: { projectId: string }) {
  const toast = useApp((s) => s.toast);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [context, setContext] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const [cat, setCat] = useState('convention');
  const [text, setText] = useState('');
  const load = useCallback(() => void api<{ facts: Fact[]; context: string }>(`/api/projects/${projectId}/memory`).then((r) => {
    setFacts(r.facts);
    setContext(r.context);
    setEdited(null);
  }), [projectId]);
  useEffect(() => load(), [load]);
  return (
    <div className="space-y-4">
      <Section title="Faits mémorisés (utilisés par l'agent à chaque tâche)">
        <form className="mb-2 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await api(`/api/projects/${projectId}/memory`, { body: { category: cat, text } }).catch((err: Error) => toast('error', err.message));
          setText('');
          load();
        }}>
          <Select value={cat} onChange={setCat} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex. « Les montants sont en FCFA, sans décimales »" />
          <Button type="submit" variant="primary">Ajouter</Button>
        </form>
        <div className="divide-y divide-line rounded-xl border border-line">
          {facts.length === 0 && <div className="px-3 py-2 text-[12.5px] text-faint">Aucun fait. L'agent en ajoute avec memory.add, ou utilisez /init.</div>}
          {facts.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
              <Badge>{f.category}</Badge>
              <span className="flex-1">{f.text}</span>
              <button className="text-faint hover:text-err" onClick={() => void api(`/api/projects/${projectId}/memory/${f.id}`, { method: 'DELETE' }).then(load)} aria-label="Oublier">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="PROJECT_CONTEXT.md" right={edited !== null && <Button size="sm" variant="primary" onClick={() => void api(`/api/projects/${projectId}/context`, { method: 'PUT', body: { content: edited } }).then(() => { toast('success', 'Contexte enregistré'); load(); })}>Enregistrer</Button>}>
        <Textarea rows={16} className="font-mono text-[12.5px]" value={edited ?? context} onChange={(e) => setEdited(e.target.value)} />
      </Section>
    </div>
  );
}

function ArtifactsPanel({ projectId }: { projectId: string }) {
  const [list, setList] = useState<ArtifactRecord[] | null>(null);
  useEffect(() => void api<ArtifactRecord[]>(`/api/projects/${projectId}/artifacts`).then(setList), [projectId]);
  if (!list) return <Spinner />;
  if (!list.length) return <div className="text-[13px] text-faint">Aucun artefact pour ce projet.</div>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {list.map((a) => (
        <ArtifactCard key={a.id} artifact={a} />
      ))}
    </div>
  );
}

export function ProjectsView() {
  const projects = useApp((s) => s.projects);
  const projectId = useApp((s) => s.projectId);
  const selectProject = useApp((s) => s.selectProject);
  const loadProjects = useApp((s) => s.loadProjects);
  const toast = useApp((s) => s.toast);
  const [tab, setTab] = useState<'overview' | 'git' | 'memory' | 'artifacts'>('overview');
  const [modal, setModal] = useState<'create' | 'clone' | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const current = projects.find((p) => p.id === projectId);

  const submit = async () => {
    setBusy(true);
    try {
      const p = modal === 'create' ? await api<{ id: string }>('/api/projects', { body: { name, gitInit: true } }) : await api<{ id: string }>('/api/projects/clone', { body: { url, name: name || undefined } });
      await loadProjects();
      await selectProject(p.id);
      setModal(null);
      setName('');
      setUrl('');
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-line bg-elev">
        <div className="flex gap-1.5 border-b border-line p-3">
          <Button size="sm" variant="primary" onClick={() => setModal('create')}>
            <Plus size={13} /> Nouveau
          </Button>
          <Button size="sm" onClick={() => setModal('clone')}>
            <GitFork size={13} /> Cloner
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {projects.map((p) => (
            <button key={p.id} onClick={() => void selectProject(p.id)} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-hover', p.id === projectId && 'bg-accent-soft')}>
              <FolderOpen size={15} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{p.name}</div>
                <div className="text-[11px] text-faint">
                  {p.isGit ? 'git · ' : ''}
                  {fmtRelative(p.createdAt)}
                </div>
              </div>
            </button>
          ))}
          {!projects.length && <div className="p-3 text-[12.5px] text-faint">Aucun projet : créez-en un ou clonez un dépôt.</div>}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {!current ? (
          <Empty icon={<BookMarked size={36} />} title="Projets">Un projet = un dossier de l'espace de travail. Créez-en un, clonez un dépôt Git ou ajoutez un dossier dans {useApp.getState().status?.workspaceRoot}.</Empty>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-5 py-3">
              <FolderOpen size={18} className="text-accent" />
              <h1 className="text-[17px] font-semibold">{current.name}</h1>
              <span className="truncate font-mono text-[11.5px] text-faint">{current.path}</span>
            </div>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Vue d’ensemble' }, { id: 'git', label: 'Git' }, { id: 'memory', label: 'Mémoire' }, { id: 'artifacts', label: 'Artefacts' }]} />
            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="mx-auto max-w-5xl">
                {tab === 'overview' && <Overview projectId={current.id} />}
                {tab === 'git' && <GitPanel projectId={current.id} />}
                {tab === 'memory' && <MemoryPanel projectId={current.id} />}
                {tab === 'artifacts' && <ArtifactsPanel projectId={current.id} />}
              </div>
            </div>
          </>
        )}
      </div>
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Nouveau projet' : 'Cloner un dépôt Git'}
        width={520}
        footer={
          <Button variant="primary" disabled={busy || (modal === 'create' ? !name.trim() : !url.trim())} onClick={() => void submit()}>
            {busy && <Spinner />} {modal === 'create' ? 'Créer' : 'Cloner'}
          </Button>
        }
      >
        {modal === 'clone' && (
          <Field label="URL du dépôt" hint="https://github.com/… (dépôts publics, ou privés si git est authentifié sur la machine)">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/user/repo.git" autoFocus />
          </Field>
        )}
        <Field label={modal === 'create' ? 'Nom du projet' : 'Nom (optionnel)'}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mon-application" autoFocus={modal === 'create'} />
        </Field>
      </Modal>
    </div>
  );
}
