import { useEffect, useRef, useState } from 'react';
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react';
import {
  BookOpen,
  Bug,
  Columns2,
  Download,
  Eye,
  FileCode2,
  FlaskConical,
  Gauge,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
  X,
  MessageSquareText,
  Database,
} from 'lucide-react';
import '../lib/monaco';
import { blobUrl, downloadFile, previewUrl } from '../lib/api';
import { basename, cx, fmtBytes } from '../lib/format';
import { useApp } from '../store/app';
import { useCode, type OpenFile } from '../store/code';
import { AuthImage } from '../components/artifacts';
import { Button, Dropdown, Empty, IconButton } from '../components/ui';

const ASK_ACTIONS = [
  {
    value: 'explain',
    label: 'Expliquer',
    icon: <BookOpen size={14} />,
    prompt: 'Explique clairement ce code (rôle, fonctionnement, points délicats).',
  },
  {
    value: 'fix',
    label: 'Corriger',
    icon: <Bug size={14} />,
    prompt: 'Trouve et corrige les bugs de ce code. Vérifie ensuite (tests/build) si possible.',
  },
  {
    value: 'refactor',
    label: 'Refactorer',
    icon: <Wand2 size={14} />,
    prompt: 'Refactore ce code pour le rendre plus lisible et maintenable, sans changer son comportement.',
  },
  {
    value: 'optimize',
    label: 'Optimiser',
    icon: <Gauge size={14} />,
    prompt: 'Optimise les performances de ce code et explique les gains.',
  },
  {
    value: 'document',
    label: 'Documenter',
    icon: <MessageSquareText size={14} />,
    prompt: 'Ajoute une documentation claire (commentaires/docstrings) à ce code, dans le style du projet.',
  },
  {
    value: 'tests',
    label: 'Générer des tests',
    icon: <FlaskConical size={14} />,
    prompt: 'Écris des tests pour ce code avec le framework du projet, puis exécute-les.',
  },
] as const;

function askAI(
  action: (typeof ASK_ACTIONS)[number]['value'],
  file: OpenFile,
  selection: { text: string; startLine: number; endLine: number } | null,
) {
  const a = ASK_ACTIONS.find((x) => x.value === action)!;
  const app = useApp.getState();
  app.setLayout({ right: true, rightTab: 'agent' });
  const scope = selection?.text
    ? `les lignes ${selection.startLine}-${selection.endLine} de ${file.path}`
    : `le fichier ${file.path}`;
  app.setDraft({
    text: `${a.prompt}\nCible : ${scope}.`,
    attachments: selection?.text ? [] : [file.path],
    send: true,
    role: action === 'tests' ? 'tester' : 'coder',
    ui: { openFile: file.path, selection: selection ?? undefined },
  });
}

function MonacoPane({ file, onFocus }: { file: OpenFile; onFocus: () => void }) {
  const theme = useApp((s) => s.theme);
  const setContent = useCode((s) => s.setContent);
  const save = useCode((s) => s.save);
  const setSelection = useCode((s) => s.setSelection);
  const setProblems = useCode((s) => s.setProblems);
  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save(file.path));
    editor.onDidChangeCursorSelection(() => {
      const sel = editor.getSelection();
      const model = editor.getModel();
      if (!sel || !model) return;
      const text = model.getValueInRange(sel);
      setSelection(text ? { text, startLine: sel.startLineNumber, endLine: sel.endLineNumber } : null);
    });
    editor.onDidFocusEditorText(onFocus);
    for (const a of ASK_ACTIONS) {
      editor.addAction({
        id: `wb-ask-${a.value}`,
        label: `IA : ${a.label}`,
        contextMenuGroupId: '0_ai',
        run: () =>
          askAI(
            a.value,
            useCode.getState().files.find((f) => f.path === file.path) ?? file,
            useCode.getState().selection,
          ),
      });
    }
  };
  return (
    <Editor
      path={file.path}
      language={file.language}
      value={file.content}
      theme={theme === 'dark' ? 'wb-dark' : 'wb-light'}
      onChange={(v) => setContent(file.path, v ?? '')}
      onMount={onMount}
      onValidate={(markers) =>
        setProblems(
          file.path,
          markers.map((m) => ({ line: m.startLineNumber, message: m.message, severity: m.severity })),
        )
      }
      options={{
        fontFamily: 'JetBrains Mono Variable, ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: true, scale: 1 },
        smoothScrolling: true,
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        stickyScroll: { enabled: true },
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 8 },
        readOnly: file.kind !== 'text',
      }}
    />
  );
}

function FileBody({ file, onFocus }: { file: OpenFile; onFocus: () => void }) {
  const projectId = useApp((s) => s.projectId);
  const setView = useApp((s) => s.setView);
  const [pdf, setPdf] = useState<string | null>(null);
  useEffect(() => {
    if (file.path.toLowerCase().endsWith('.pdf') && projectId)
      void blobUrl(`/api/projects/${projectId}/raw`, { path: file.path }).then(setPdf);
  }, [file.path, projectId]);
  if (file.kind === 'text') return <MonacoPane file={file} onFocus={onFocus} />;
  if (file.kind === 'image')
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-bg p-6">
        <AuthImage
          path={`/api/projects/${projectId}/raw`}
          query={{ path: file.path }}
          alt={file.path}
          className="max-h-full max-w-full rounded-lg border border-line"
        />
      </div>
    );
  if (file.kind === 'document')
    return pdf ? (
      <iframe title={file.path} src={pdf} className="h-full w-full bg-white" />
    ) : (
      <MonacoPane file={{ ...file, language: 'plaintext' }} onFocus={onFocus} />
    );
  if (file.kind === 'spreadsheet')
    return (
      <Empty icon={<Database size={32} />} title={basename(file.path)}>
        <div className="mb-3">Classeur de {fmtBytes(file.size)}.</div>
        <Button
          variant="primary"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('wb:open-dataset', { detail: file.path }));
            setView('data');
          }}
        >
          Analyser dans Données
        </Button>
      </Empty>
    );
  return (
    <Empty
      icon={<FileCode2 size={32} />}
      title={file.kind === 'large' ? 'Fichier volumineux' : 'Fichier binaire'}
    >
      {fmtBytes(file.size)} —{' '}
      <button
        className="text-accent hover:underline"
        onClick={() =>
          void downloadFile(`/api/projects/${projectId}/raw`, basename(file.path), {
            path: file.path,
            download: '1',
          })
        }
      >
        télécharger
      </button>
    </Empty>
  );
}

function Preview({ path }: { path: string }) {
  const projectId = useApp((s) => s.projectId);
  const [url, setUrl] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const savedVersion = useCode((s) => s.files.find((f) => f.path === path)?.mtime);
  useEffect(() => {
    if (projectId) void previewUrl({ projectId, path }).then(setUrl);
  }, [projectId, path]);
  useEffect(() => setNonce((n) => n + 1), [savedVersion]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 items-center gap-2 border-b border-line px-2 text-[12px] text-muted">
        <Eye size={13} /> Aperçu en direct — {basename(path)}
        <IconButton label="Rafraîchir" className="ml-auto" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={13} />
        </IconButton>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            ouvrir
          </a>
        )}
      </div>
      {url ? (
        <iframe
          key={nonce}
          title="preview"
          src={url}
          className="min-h-0 flex-1 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        />
      ) : null}
    </div>
  );
}

export function CodeView() {
  const {
    files,
    active,
    split,
    focusSplit,
    diff,
    preview,
    close,
    save,
    setSplit,
    setPreview,
    showDiff,
    reload,
    selection,
  } = useCode();
  const theme = useApp((s) => s.theme);
  const [, force] = useState(0);
  const focusRef = useRef<'main' | 'split'>('main');
  const activeFile = files.find((f) => f.path === active);
  const splitFile = files.find((f) => f.path === split);
  const current = focusSplit ? splitFile : activeFile;
  const isHtml = current && /\.html?$/i.test(current.path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (!files.length && !diff) {
    return (
      <Empty icon={<FileCode2 size={36} />} title="Aucun fichier ouvert">
        Ouvrez un fichier depuis l'explorateur (à gauche) ou avec <kbd className="font-mono">Ctrl+P</kbd>.
        Clic droit dans l'éditeur → actions IA (expliquer, corriger, refactorer, tests…).
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-line">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {files.map((f) => {
            const dirty = f.content !== f.saved;
            const isActive = f.path === (focusSplit ? split : active) && !diff;
            return (
              <div
                key={f.path}
                onClick={() => {
                  useCode.setState({ active: f.path, focusSplit: false, diff: null });
                  force((x) => x + 1);
                }}
                onAuxClick={(e) => e.button === 1 && close(f.path)}
                className={cx(
                  'group flex h-9 shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 text-[12.5px]',
                  isActive ? 'bg-elev text-fg' : 'text-muted hover:bg-hover/50',
                )}
                title={f.path}
              >
                <span className="max-w-[180px] truncate">{basename(f.path)}</span>
                {dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Modifié" />}
                <button
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!dirty || confirm(`${f.path} a des modifications non enregistrées. Fermer ?`))
                      close(f.path);
                  }}
                  aria-label="Fermer"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {diff && (
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-r border-line bg-elev px-3 text-[12.5px]">
              Diff · {basename(diff.path)}
              <button onClick={() => showDiff(null)} aria-label="Fermer le diff">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 px-1.5">
          {current && current.kind === 'text' && (
            <>
              <IconButton
                label="Enregistrer (Ctrl+S)"
                onClick={() => void save()}
                disabled={current.content === current.saved}
              >
                <Save size={14} />
              </IconButton>
              <IconButton
                label="Comparer avec la version enregistrée"
                onClick={() =>
                  showDiff({
                    title: 'Modifications non enregistrées',
                    path: current.path,
                    before: current.saved,
                    after: current.content,
                  })
                }
              >
                <Columns2 size={14} />
              </IconButton>
            </>
          )}
          {current && (
            <IconButton label="Recharger depuis le disque" onClick={() => void reload(current.path)}>
              <RefreshCw size={13} />
            </IconButton>
          )}
          <IconButton
            label={split ? 'Fermer la vue scindée' : 'Scinder (ouvrir à côté)'}
            active={Boolean(split)}
            onClick={() => setSplit(split ? null : (active ?? null))}
          >
            <Columns2 size={14} className="rotate-90" />
          </IconButton>
          {isHtml && (
            <IconButton label="Aperçu en direct" active={preview} onClick={() => setPreview(!preview)}>
              <Eye size={14} />
            </IconButton>
          )}
          {current && current.kind === 'text' && (
            <Dropdown
              trigger={
                <span className="ml-1 inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2 text-[12.5px] font-medium text-accent">
                  <Sparkles size={13} /> Demander à l'IA
                </span>
              }
              items={ASK_ACTIONS.map((a) => ({
                value: a.value,
                label: a.label,
                icon: a.icon,
                hint: selection?.text
                  ? `Sur la sélection (lignes ${selection.startLine}-${selection.endLine})`
                  : 'Sur tout le fichier',
              }))}
              onSelect={(v) => askAI(v, current, selection)}
              align="right"
              width={250}
            />
          )}
          {current && (
            <IconButton
              label="Télécharger"
              onClick={() =>
                void downloadFile(
                  `/api/projects/${useApp.getState().projectId}/raw`,
                  basename(current.path),
                  { path: current.path, download: '1' },
                )
              }
            >
              <Download size={14} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {diff ? (
          <div className="min-w-0 flex-1">
            <DiffEditor
              original={diff.before}
              modified={diff.after}
              language={files.find((f) => f.path === diff.path)?.language}
              theme={theme === 'dark' ? 'wb-dark' : 'wb-light'}
              options={{
                readOnly: true,
                renderSideBySide: true,
                fontFamily: 'JetBrains Mono Variable, monospace',
                fontSize: 13,
                automaticLayout: true,
                minimap: { enabled: false },
              }}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1" onMouseDown={() => (focusRef.current = 'main')}>
              {activeFile && (
                <FileBody
                  key={activeFile.path}
                  file={activeFile}
                  onFocus={() => useCode.setState({ focusSplit: false })}
                />
              )}
            </div>
            {splitFile && (
              <div className="min-w-0 flex-1 border-l border-line">
                <FileBody
                  key={`split-${splitFile.path}`}
                  file={splitFile}
                  onFocus={() => useCode.setState({ focusSplit: true })}
                />
              </div>
            )}
            {preview && isHtml && current && (
              <div className="min-w-0 flex-1 border-l border-line">
                <Preview path={current.path} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
