import { create } from 'zustand';
import { api } from '../lib/api';
import { useApp } from './app';

export type FileKind = 'text' | 'image' | 'spreadsheet' | 'document' | 'binary' | 'large';

export interface OpenFile {
  path: string;
  kind: FileKind;
  language: string;
  content: string;
  saved: string;
  mtime: number;
  size: number;
  pages?: number;
}

export interface DiffTab {
  title: string;
  path: string;
  before: string;
  after: string;
}

interface FileResponse {
  path: string;
  size: number;
  mtime: number;
  language: string;
  kind: FileKind;
  content?: string;
  text?: string;
  pages?: number;
}

interface CodeState {
  files: OpenFile[];
  active: string | null;
  split: string | null;
  focusSplit: boolean;
  diff: DiffTab | null;
  preview: boolean;
  problems: { path: string; errors: number; warnings: number; items: { line: number; message: string; severity: number }[] }[];
  treeVersion: number;
  selection: { text: string; startLine: number; endLine: number } | null;

  open: (path: string, opts?: { split?: boolean }) => Promise<void>;
  close: (path: string) => void;
  setContent: (path: string, content: string) => void;
  save: (path?: string) => Promise<boolean>;
  reload: (path: string) => Promise<void>;
  showDiff: (d: DiffTab | null) => void;
  setSplit: (path: string | null) => void;
  setPreview: (v: boolean) => void;
  setProblems: (path: string, items: { line: number; message: string; severity: number }[]) => void;
  bumpTree: () => void;
  setSelection: (s: CodeState['selection']) => void;
  reset: () => void;
}

export const useCode = create<CodeState>((set, get) => ({
  files: [],
  active: null,
  split: null,
  focusSplit: false,
  diff: null,
  preview: false,
  problems: [],
  treeVersion: 0,
  selection: null,

  async open(path, opts) {
    const projectId = useApp.getState().projectId;
    if (!projectId) return;
    const existing = get().files.find((f) => f.path === path);
    if (!existing) {
      try {
        const r = await api<FileResponse>(`/api/projects/${projectId}/file`, { query: { path } });
        const content = r.content ?? r.text ?? '';
        const file: OpenFile = { path, kind: r.kind, language: r.language, content, saved: content, mtime: r.mtime, size: r.size, pages: r.pages };
        set({ files: [...get().files, file] });
      } catch (err) {
        useApp.getState().toast('error', (err as Error).message);
        return;
      }
    }
    if (opts?.split) set({ split: path, focusSplit: true, diff: null });
    else set({ active: path, focusSplit: false, diff: null });
  },

  close(path) {
    const files = get().files.filter((f) => f.path !== path);
    const idx = get().files.findIndex((f) => f.path === path);
    const active = get().active === path ? (files[Math.max(0, idx - 1)]?.path ?? null) : get().active;
    set({ files, active, split: get().split === path ? null : get().split });
  },

  setContent(path, content) {
    set({ files: get().files.map((f) => (f.path === path ? { ...f, content } : f)) });
  },

  async save(path) {
    const p = path ?? (get().focusSplit ? get().split : get().active);
    const file = get().files.find((f) => f.path === p);
    const projectId = useApp.getState().projectId;
    if (!file || !projectId || file.kind !== 'text') return false;
    try {
      const r = await api<{ mtime: number }>(`/api/projects/${projectId}/file`, { method: 'PUT', body: { path: file.path, content: file.content, expectedMtime: file.mtime } });
      set({ files: get().files.map((f) => (f.path === file.path ? { ...f, saved: f.content, mtime: r.mtime } : f)) });
      useApp.getState().toast('success', `${file.path} enregistré`);
      return true;
    } catch (err) {
      useApp.getState().toast('error', (err as Error).message);
      return false;
    }
  },

  async reload(path) {
    const projectId = useApp.getState().projectId;
    if (!projectId) return;
    try {
      const r = await api<FileResponse>(`/api/projects/${projectId}/file`, { query: { path } });
      const content = r.content ?? r.text ?? '';
      set({ files: get().files.map((f) => (f.path === path ? { ...f, content, saved: content, mtime: r.mtime, size: r.size, kind: r.kind } : f)) });
    } catch {
      get().close(path);
    }
  },

  showDiff(diff) {
    set({ diff });
  },
  setSplit(split) {
    set({ split, focusSplit: Boolean(split) && get().focusSplit });
  },
  setPreview(preview) {
    set({ preview });
  },
  setProblems(path, items) {
    const others = get().problems.filter((p) => p.path !== path);
    const errors = items.filter((i) => i.severity >= 8).length;
    const warnings = items.filter((i) => i.severity === 4).length;
    set({ problems: errors || warnings ? [...others, { path, errors, warnings, items }] : others });
  },
  bumpTree() {
    set({ treeVersion: get().treeVersion + 1 });
  },
  setSelection(selection) {
    set({ selection });
  },
  reset() {
    set({ files: [], active: null, split: null, diff: null, problems: [], selection: null });
  },
}));

// Close editors when switching project; refresh open files the agent modified.
useApp.subscribe((s, prev) => {
  if (s.projectId !== prev.projectId) useCode.getState().reset();
});
