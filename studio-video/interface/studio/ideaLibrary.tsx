// BIBLIOTHÈQUE D'IDÉES — sketchs dans le style de vos vidéos, mise à jour par l'actualité, production en masse.
import { useState } from 'react';
import { Badge, Button } from '@workbench/web/components/ui';
import { useStore } from '@workbench/direct/lib/store';
import { Card } from './common';
import { IDEA_FAMILIES, IDEA_LIBRARY, type Idea } from '../../coeur/studio/ideas';
import { loadNewsIdeas, produceBatch, refreshNewsIdeas, type BatchItem } from '../../navigateur/studio/ideaBank';

const stopper = { stop: false };
export function IdeaLibraryPanel() {
  const toast = useStore((x) => x.toast);
  const [news, setNews] = useState<Idea[]>(loadNewsIdeas);
  const [family, setFamily] = useState<string>('Toutes');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const all = [...news, ...IDEA_LIBRARY];
  const shown = all.filter(
    (i) => family === 'Toutes' || i.family === family || (family === 'Actualité' && i.source === 'actualité'),
  );
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Card title={`BIBLIOTHÈQUE D’IDÉES (${all.length})`} testId="idea-library">
      <div className="mb-2 flex flex-wrap gap-1">
        {['Toutes', 'Actualité', ...IDEA_FAMILIES].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFamily(f)}
            className={`rounded-full border px-2 py-0.5 text-[12px] ${family === f ? 'border-accent text-accent' : 'border-line text-muted'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="max-h-72 space-y-1 overflow-auto pr-1 text-[12.5px]" data-testid="idea-list">
        {shown.map((i) => (
          <label
            key={i.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2"
          >
            <input
              type="checkbox"
              checked={picked.has(i.id)}
              onChange={() => toggle(i.id)}
              data-testid={`idea-${i.id}`}
            />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{i.title}</span>{' '}
              {i.source === 'actualité' && <Badge tone="info">actualité {i.date}</Badge>}{' '}
              {i.format === 'compilation' && <Badge tone="accent">compilation</Badge>}{' '}
              {i.format === 'histoire' && <Badge tone="accent">histoire 60 s écrite</Badge>}
              <div className="text-muted">{i.setup}</div>
              <div className="text-faint">Chute : {i.punchline}</div>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          data-testid="idea-news"
          onClick={async () => {
            setBusy(true);
            try {
              const fresh = await refreshNewsIdeas();
              setNews(loadNewsIdeas());
              setFamily('Actualité');
              toast('ok', `${fresh.length} idée(s) tirée(s) de l’actualité`);
            } catch (e) {
              toast('err', (e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Mettre à jour avec l’actualité
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !picked.size}
          data-testid="idea-produce"
          onClick={async () => {
            setBusy(true);
            stopper.stop = false;
            try {
              await produceBatch(
                all.filter((i) => picked.has(i.id)),
                setBatch,
                stopper,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Produire la sélection ({picked.size})
        </Button>
        {busy && batch.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => (stopper.stop = true)}>
            Arrêter le lot
          </Button>
        )}
      </div>
      {batch.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12.5px]" data-testid="idea-batch">
          {batch.map((b, k) => (
            <li key={k}>
              <Badge
                tone={
                  b.status === 'terminé'
                    ? 'ok'
                    : b.status === 'échec'
                      ? 'err'
                      : b.status === 'en cours'
                        ? 'info'
                        : 'neutral'
                }
              >
                {b.status}
              </Badge>{' '}
              {b.idea.title} <span className="text-faint">{b.note}</span>
              {b.result?.url && (
                <a
                  className="ml-1 text-accent underline"
                  href={b.result.url}
                  download={`${b.idea.title}.${b.result.mime.includes('mp4') ? 'mp4' : 'webm'}`}
                >
                  télécharger
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
