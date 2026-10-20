// Artifact & image components backed by the local agent's API.
import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FolderInput,
  Image as ImageIcon,
  BarChart3,
} from 'lucide-react';
import type { ChartData } from '@shared/types';
import { api, blobUrl, downloadFile, previewUrl } from '../lib/api';
import { cx, fmtBytes } from '../lib/format';
import type { ArtifactRecord } from '../lib/types';
import { useApp } from '../store/app';
import { ChartView, CodeBlock, Markdown } from './rich';
import { Button, IconButton, Modal, Spinner } from './ui';

export function AuthImage({
  path,
  query,
  alt,
  className,
  onClick,
}: {
  path: string;
  query?: Record<string, string>;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    blobUrl(path, query)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [path, query]);
  if (err) return <div className="text-[12px] text-err">Image indisponible</div>;
  if (!src) return <Spinner />;
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

// ── artifacts ──────────────────────────────────────────────────────────
const TEXT_TYPES = new Set([
  'html',
  'css',
  'js',
  'json',
  'csv',
  'md',
  'txt',
  'svg',
  'py',
  'ts',
  'xml',
  'yaml',
]);

export function ArtifactIcon({ type }: { type: string }) {
  if (type === 'png' || type === 'jpg' || type === 'svg') return <ImageIcon size={15} />;
  if (type === 'chart') return <BarChart3 size={15} />;
  return <FileCode2 size={15} />;
}

export function ArtifactCard({ artifact, compact }: { artifact: ArtifactRecord; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className={cx(
          'flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2',
          compact ? 'text-[12.5px]' : '',
        )}
      >
        <span className="text-accent">
          <ArtifactIcon type={artifact.type} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{artifact.name}</div>
          <div className="text-[11px] text-faint">
            {artifact.type.toUpperCase()} · {fmtBytes(artifact.size)}
          </div>
        </div>
        <IconButton label="Aperçu" onClick={() => setOpen(true)}>
          <Eye size={15} />
        </IconButton>
        <IconButton
          label="Télécharger"
          onClick={() =>
            void downloadFile(
              `/api/artifacts/${artifact.id}/raw`,
              artifact.type === 'chart' ? `${artifact.name}` : artifact.name,
              { download: '1' },
            )
          }
        >
          <Download size={15} />
        </IconButton>
      </div>
      <ArtifactPreview artifact={artifact} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ArtifactPreview({
  artifact,
  open,
  onClose,
}: {
  artifact: ArtifactRecord;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [savePath, setSavePath] = useState(artifact.type === 'chart' ? '' : `livrables/${artifact.name}`);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (!open) return;
    if (artifact.type === 'chart') void api<ChartData>(`/api/artifacts/${artifact.id}/raw`).then(setChart);
    else if (artifact.type === 'html') void previewUrl({ artifactId: artifact.id }).then(setFrame);
    else if (artifact.type === 'pdf') void blobUrl(`/api/artifacts/${artifact.id}/raw`).then(setFrame);
    else if (TEXT_TYPES.has(artifact.type))
      void api<{ text: string | null }>(`/api/artifacts/${artifact.id}/text`).then((r) => setText(r.text));
  }, [open, artifact]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={980}
      title={
        <span className="flex items-center gap-2">
          <ArtifactIcon type={artifact.type} /> {artifact.name}
        </span>
      }
      footer={
        <>
          {artifact.type !== 'chart' && (
            <div className="mr-auto flex items-center gap-2">
              <input
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                className="h-8 w-72 rounded-lg border border-line bg-input px-2 text-[12.5px]"
              />
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const r = await api<{ path: string }>(`/api/artifacts/${artifact.id}/save`, {
                      body: { path: savePath },
                    });
                    toast('success', `Enregistré dans ${r.path}`);
                  } catch (err) {
                    toast('error', (err as Error).message);
                  }
                }}
              >
                <FolderInput size={14} /> Enregistrer dans le projet
              </Button>
            </div>
          )}
          {artifact.type === 'html' && frame && (
            <Button size="sm" onClick={() => window.open(frame, '_blank', 'noopener')}>
              <ExternalLink size={14} /> Ouvrir
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void downloadFile(`/api/artifacts/${artifact.id}/raw`, artifact.name, { download: '1' })
            }
          >
            <Download size={14} /> Télécharger
          </Button>
        </>
      }
    >
      {(artifact.type === 'png' || artifact.type === 'jpg') && (
        <AuthImage
          path={`/api/artifacts/${artifact.id}/raw`}
          alt={artifact.name}
          className="mx-auto max-h-[64vh] rounded-lg border border-line"
        />
      )}
      {artifact.type === 'chart' && (chart ? <ChartView data={chart} height={420} /> : <Spinner />)}
      {artifact.type === 'html' &&
        (frame ? (
          <iframe
            title={artifact.name}
            src={frame}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="h-[64vh] w-full rounded-lg border border-line bg-white"
          />
        ) : (
          <Spinner />
        ))}
      {artifact.type === 'pdf' &&
        (frame ? (
          <iframe
            title={artifact.name}
            src={frame}
            className="h-[64vh] w-full rounded-lg border border-line"
          />
        ) : (
          <Spinner />
        ))}
      {artifact.type === 'md' && text !== null && <Markdown text={text} />}
      {TEXT_TYPES.has(artifact.type) &&
        artifact.type !== 'md' &&
        artifact.type !== 'html' &&
        text !== null && <CodeBlock code={text} lang={artifact.type} />}
      {['xlsx', 'zip'].includes(artifact.type) && (
        <div className="text-muted">
          Fichier {artifact.type.toUpperCase()} ({fmtBytes(artifact.size)}). Téléchargez-le, ou enregistrez-le
          dans le projet pour l'analyser dans la vue Données.
        </div>
      )}
    </Modal>
  );
}
