import { useMemo, useRef, useState } from 'react';
import { Download, Eye, FilePlus, FileText, FolderDown, Pencil, Save, Trash2, Upload } from 'lucide-react';
import { Button, Empty, Input } from '../../web/components/ui';
import { CodeBlock, Markdown } from '../../web/components/rich';
import { cx, fmtBytes, fmtRelative } from '../../web/lib/format';
import { isImage } from '../../server/services/documentsCore';
import { useStore } from '../lib/store';
import { dataUrl, downloadFile, downloadZip, importBrowserFile, readAsText, writeText } from '../lib/vfs';
import { HtmlFrame } from './Artifacts';
import { TimeMachinePanel } from './IntelligencePanels';

export function FilesView() {
  const files = useStore((s) => s.files);
  const selected = useStore((s) => s.openFile);
  const select = (p: string | null) => useStore.setState({ openFile: p });
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () =>
      Object.values(files)
        .sort((a, b) => a.path.localeCompare(b.path))
        .filter((f) => !filter || f.path.toLowerCase().includes(filter.toLowerCase())),
    [files, filter],
  );
  const file = selected ? files[selected] : undefined;

  const upload = async (fl: FileList) => {
    for (const f of Array.from(fl)) await importBrowserFile(f);
    useStore.getState().toast('ok', `${fl.length} fichier(s) ajouté(s) dans uploads/`);
  };

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && void upload(e.target.files).then(() => (e.target.value = ''))}
          />
          <Button size="sm" onClick={() => input.current?.click()}>
            <Upload size={13} /> Importer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const name = prompt('Nom du nouveau fichier (ex. notes.md)');
              if (name) {
                try {
                  select(writeText(name, '').path);
                } catch (e) {
                  useStore.getState().toast('err', (e as Error).message);
                }
              }
            }}
          >
            <FilePlus size={13} /> Nouveau
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadZip()}
            disabled={!list.length}
            title="Tout télécharger (.zip)"
          >
            <FolderDown size={13} /> .zip
          </Button>
        </div>
        <div className="p-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          {list.map((f) => (
            <button
              key={f.path}
              onClick={() => select(f.path)}
              className={cx(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]',
                f.path === selected ? 'bg-hover' : 'hover:bg-hover/60',
              )}
            >
              <FileText size={13} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              <span className="shrink-0 text-[11px] text-faint">{fmtBytes(f.size)}</span>
            </button>
          ))}
          {!list.length && (
            <div className="p-4 text-center text-[12px] text-faint">
              Aucun fichier. Importez-en ou demandez à l’agent d’en créer.
            </div>
          )}
        </div>
        <TimeMachinePanel />
      </div>
      <div className="min-w-0 flex-1">
        {file ? (
          <FileEditor key={file.path} path={file.path} />
        ) : (
          <Empty icon={<FileText size={28} />} title="Espace de travail">
            Les fichiers que vous joignez et ceux que l’agent crée apparaissent ici. Tout reste dans ce
            navigateur.
          </Empty>
        )}
      </div>
    </div>
  );
}

function FileEditor({ path }: { path: string }) {
  const f = useStore((s) => s.files[path])!;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.binary ? '' : f.data);
  const [preview, setPreview] = useState(/\.(html?|md|markdown|svg)$/i.test(path));
  const [extracted, setExtracted] = useState<string | null>(null);
  const isHtml = /\.html?$/i.test(path);
  const isMd = /\.(md|markdown)$/i.test(path);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{f.path}</div>
          <div className="text-[11px] text-faint">
            {f.mime} · {fmtBytes(f.size)} · modifié {fmtRelative(f.updatedAt)}
          </div>
        </div>
        {!f.binary && (isHtml || isMd) && (
          <Button size="sm" variant={preview ? 'subtle' : 'ghost'} onClick={() => setPreview((p) => !p)}>
            <Eye size={13} /> Aperçu
          </Button>
        )}
        {!f.binary &&
          (editing ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                writeText(f.path, text);
                setEditing(false);
              }}
            >
              <Save size={13} /> Enregistrer
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setText(f.data);
                setEditing(true);
                setPreview(false);
              }}
            >
              <Pencil size={13} /> Modifier
            </Button>
          ))}
        <Button size="sm" variant="ghost" onClick={() => downloadFile(f)} title="Télécharger">
          <Download size={13} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="Supprimer"
          onClick={() => {
            if (confirm(`Supprimer ${f.path} ?`)) {
              useStore.getState().deleteFile(f.path);
              useStore.setState({ openFile: null });
            }
          }}
        >
          <Trash2 size={13} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="h-full min-h-[400px] w-full resize-none rounded-lg border border-line bg-code p-3 font-mono text-[12.5px] outline-none"
          />
        ) : isImage(f.path) ? (
          <img alt={f.path} src={dataUrl(f)} className="mx-auto max-h-full max-w-full rounded-lg" />
        ) : f.binary ? (
          <div className="space-y-3 text-[13px] text-muted">
            <div>Fichier binaire.</div>
            <Button
              size="sm"
              onClick={() =>
                void readAsText(f.path)
                  .then((r) => setExtracted(r.text))
                  .catch((e: Error) => setExtracted(`(${e.message})`))
              }
            >
              Extraire le texte
            </Button>
            {extracted !== null && <CodeBlock code={extracted.slice(0, 200_000)} lang="texte" />}
          </div>
        ) : preview && isHtml ? (
          <HtmlFrame html={f.data} height="100%" />
        ) : preview && isMd ? (
          <Markdown text={f.data} />
        ) : (
          <CodeBlock code={f.data.slice(0, 400_000)} lang={f.path.split('.').pop()} />
        )}
      </div>
    </div>
  );
}
