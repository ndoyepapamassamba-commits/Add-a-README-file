// Shared bits of the AI Visual Studio screens.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Badge, Button, Modal, Spinner } from '../../../web/components/ui';
import { useStore } from '../../lib/store';
import { useStudio } from '../../lib/studio/store';
import { blobs } from '../../lib/studio/blobs';
import { BudgetBlocked, setConfirmHandler } from '../../lib/studio/exec';
import { StudioError } from '../../../server/jev/studio/errors';
import type { Blueprint } from '../../../server/jev/studio/types';

/** Active production (or null). */
export function useActive(): Blueprint | null {
  const id = useStudio((s) => s.settings.activeProjectId);
  const bp = useStudio((s) => (id ? s.projects[id] : undefined));
  return bp ?? null;
}
/** Object URL of a stored blob (revoked on change/unmount). */
export function useBlobUrl(assetId?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    setUrl(null);
    if (!assetId) return;
    void blobs
      .get(assetId)
      .then((b) => {
        if (alive && b) {
          u = URL.createObjectURL(b);
          setUrl(u);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [assetId]);
  return url;
}
export function Thumb({
  id,
  className = 'h-28 w-20',
  alt = '',
}: {
  id?: string | null;
  className?: string;
  alt?: string;
}) {
  const url = useBlobUrl(id);
  return url ? (
    <img src={url} alt={alt} className={`${className} rounded-md border border-line object-cover`} />
  ) : (
    <div
      className={`${className} flex items-center justify-center rounded-md border border-dashed border-line text-[10.5px] text-faint`}
    >
      {id ? '…' : 'aucune image'}
    </div>
  );
}
/** Runs an async action, shows a spinner, and turns errors into readable, classified messages. */
export function useRunner() {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ cls: string; message: string } | null>(null);
  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      return r;
    } catch (e) {
      if (e instanceof BudgetBlocked) {
        setError({ cls: 'PLAFOND', message: e.message });
        toast('err', 'Appel bloqué : plafond de budget (voir le message).');
      } else {
        const cls = e instanceof StudioError ? e.cls : 'UNKNOWN';
        const message = (e as Error).message ?? String(e);
        setError({ cls, message });
        toast('err', `${cls} — ${message.slice(0, 160)}`);
      }
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, clear: () => setError(null) };
}
export function ErrorBox({ error }: { error: { cls: string; message: string } | null }) {
  if (!error) return null;
  return (
    <div
      className="mt-2 rounded-lg border border-err/40 bg-err/10 p-2 text-[12.5px] text-err"
      role="alert"
      data-testid="studio-error"
    >
      <Badge tone="err">{error.cls}</Badge> {error.message}
    </div>
  );
}
export function BusyBar({ busy }: { busy: string | null }) {
  return busy ? (
    <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted" data-testid="studio-busy">
      <Spinner /> {busy}
    </div>
  ) : null;
}
/** Budget / uncertain-price confirmation modal (replaces window.confirm so the owner always sees the reason). */
export function ConfirmHost() {
  const [req, setReq] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const ref = useRef(req);
  ref.current = req;
  useEffect(() => {
    setConfirmHandler((msg) => new Promise<boolean>((resolve) => setReq({ msg, resolve })));
  }, []);
  const done = (v: boolean) => {
    ref.current?.resolve(v);
    setReq(null);
  };
  return (
    <Modal
      open={Boolean(req)}
      onClose={() => done(false)}
      title="Confirmation de dépense"
      width={520}
      footer={
        <>
          <Button onClick={() => done(false)} data-testid="confirm-no">
            Annuler
          </Button>
          <Button variant="primary" onClick={() => done(true)} data-testid="confirm-yes">
            Autoriser cet appel
          </Button>
        </>
      }
    >
      <div className="whitespace-pre-wrap text-[13px]" data-testid="confirm-text">
        {req?.msg}
      </div>
    </Modal>
  );
}
export const usd = (x: number | null | undefined, d = 4) =>
  x === null || x === undefined ? 'non mesuré' : `${x.toFixed(d)} $`;
export const NO_DATA = 'Aucune donnée réelle disponible.';
export const NoData = ({ children = NO_DATA }: { children?: ReactNode }) => (
  <div
    className="rounded-lg border border-dashed border-line p-3 text-[12.5px] text-muted"
    data-testid="no-data"
  >
    {children}
  </div>
);
export const Card = ({
  title,
  right,
  children,
  testId,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  testId?: string;
}) => (
  <section className="rounded-xl border border-line bg-elev p-3" data-testid={testId}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);
export const Label = ({ children }: { children: ReactNode }) => (
  <div className="mb-0.5 text-[11.5px] font-medium uppercase tracking-wide text-faint">{children}</div>
);

/** Re-renders every `ms` (live elapsed time). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}
export type PlaybackState = 'loading' | 'loaded' | 'error' | 'no-blob';
/** The player: its src is an object URL of the Blob actually stored in IndexedDB (same store as Asset Library). */
export function VideoBox({
  assetId,
  vref,
  onMeta,
  onState,
  className = 'w-full max-h-[420px] rounded-lg bg-black',
  testId,
}: {
  assetId?: string | null;
  vref?: RefObject<HTMLVideoElement | null>;
  onMeta?: (m: VideoMeta) => void;
  onState?: (s: PlaybackState) => void;
  className?: string;
  testId?: string;
}) {
  const url = useBlobUrl(assetId);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    setTried(false);
    const t = setTimeout(() => setTried(true), 1500);
    return () => clearTimeout(t);
  }, [assetId]);
  useEffect(() => {
    if (url) onState?.('loading');
    else if (tried) onState?.('no-blob');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tried]);
  if (!url)
    return (
      <div className={`${className} flex min-h-[80px] items-center justify-center text-[12px] text-faint`}>
        {tried ? 'Blob vidéo introuvable dans IndexedDB' : 'Chargement du Blob…'}
      </div>
    );
  return (
    <video
      ref={vref}
      src={url}
      controls
      playsInline
      preload="metadata"
      className={className}
      data-testid={testId}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        onMeta?.({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        onState?.('loaded');
      }}
      onError={() => onState?.('error')}
    />
  );
}
/** Opens another studio space (listened to by StudioView). */
export const gotoSpace = (space: string) =>
  window.dispatchEvent(new CustomEvent('studio:goto', { detail: space }));

/** Small muted preview of a stored video; click opens the full player. */
export function VideoReady({ assetId, label = 'VIDEO READY' }: { assetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const url = useBlobUrl(assetId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-2 rounded-lg border border-ok/40 p-1 text-left text-[11.5px] hover:bg-hover"
        data-testid="video-ready"
      >
        {url ? (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            className="h-14 w-10 rounded bg-black object-cover"
          />
        ) : (
          <span className="flex h-14 w-10 items-center justify-center rounded bg-black/30 text-faint">…</span>
        )}
        <span>
          <b className="text-ok">▶ {label}</b>
          <br />
          <span className="text-faint">cliquer pour lire</span>
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Vidéo de la scène" width={560}>
        {open && <VideoBox assetId={assetId} testId="video-ready-player" />}
      </Modal>
    </>
  );
}
