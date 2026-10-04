import { useState } from 'react';
import { BarChart3, Download, ExternalLink, Eye, FileCode2 } from 'lucide-react';
import { Button, Modal } from '../../web/components/ui';
import { ChartView, CodeBlock, Markdown } from '../../web/components/rich';
import { useStore } from '../lib/store';
import type { ArtifactDef } from '../lib/types';
import { download } from '../lib/vfs';

const MIME: Record<ArtifactDef['type'], string> = {
  html: 'text/html',
  markdown: 'text/markdown',
  svg: 'image/svg+xml',
  chart: 'application/json',
  text: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
};

/** Sandboxed HTML preview: scripts run in an opaque origin (no access to the page or the key). */
export function HtmlFrame({ html, height = 520 }: { html: string; height?: number | string }) {
  return (
    <iframe
      title="Aperçu"
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      srcDoc={html}
      className="w-full rounded-lg border border-line bg-white"
      style={{ height }}
    />
  );
}

export function ArtifactBody({ a, height }: { a: ArtifactDef; height?: number }) {
  if (a.type === 'chart' && a.chart) return <ChartView data={a.chart} height={height ?? 360} />;
  if (a.type === 'html') return <HtmlFrame html={a.content} height={height ?? 520} />;
  if (a.type === 'svg')
    return (
      <img
        alt={a.name}
        className="mx-auto max-h-[520px]"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.content)}`}
      />
    );
  if (a.type === 'markdown')
    return (
      <div className="prose-wb max-h-[60vh] overflow-auto">
        <Markdown text={a.content} />
      </div>
    );
  return <CodeBlock code={a.content.slice(0, 200_000)} lang={a.type} />;
}

export function openInTab(a: ArtifactDef): void {
  const url = URL.createObjectURL(new Blob([a.content], { type: `${MIME[a.type]};charset=utf-8` }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ArtifactCard({ id }: { id: string }) {
  const a = useStore((s) => s.artifacts.find((x) => x.id === id));
  const [open, setOpen] = useState(false);
  if (!a) return null;
  return (
    <>
      <div className="my-2 flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
        <span className="text-accent">
          {a.type === 'chart' ? <BarChart3 size={16} /> : <FileCode2 size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{a.name}</div>
          <div className="text-[11.5px] text-faint">{a.type}</div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Eye size={13} /> Aperçu
        </Button>
        {a.type !== 'chart' && (
          <Button size="sm" variant="ghost" onClick={() => openInTab(a)} title="Ouvrir dans un nouvel onglet">
            <ExternalLink size={13} />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => download(a.type === 'chart' ? `${a.name}.json` : a.name, a.content, MIME[a.type])}
          title="Télécharger"
        >
          <Download size={13} />
        </Button>
      </div>
      {a.type === 'chart' && a.chart && <ChartView data={a.chart} height={300} />}
      <Modal open={open} onClose={() => setOpen(false)} title={a.name} width={1000}>
        <ArtifactBody a={a} />
      </Modal>
    </>
  );
}
