// PROMPTEUR D'IDÉES AUTOMATIQUE — dans le formulaire « Une idée. Un film. » : l'actualité du jour (GDELT + Wikipédia,
// sans clé) devient des idées de sketchs Afrikatoon, mises à jour toutes les 6 h tant que l'Autopilot est ouvert, plus
// les idées « du jour » de la bibliothèque. Un clic remplit le champ idée.
import { useEffect, useState } from 'react';
import { Badge, Button } from '../../../web/components/ui';
import { IDEA_LIBRARY, ideaText, type Idea } from '../../../server/jev/studio/ideas';
import { dailyPicks, isStale } from '../../../server/jev/studio/news';
import { loadNewsIdeas, loadNewsMeta, refreshNewsIdeas, type NewsMeta } from '../../lib/studio/ideaBank';

let inflight: Promise<unknown> | null = null;
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
};

export function IdeaPrompter({ onPick }: { onPick: (text: string) => void }) {
  const [news, setNews] = useState<Idea[]>(loadNewsIdeas);
  const [meta, setMeta] = useState<NewsMeta | null>(loadNewsMeta);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shift, setShift] = useState(0);
  const refresh = async () => {
    if (inflight) return;
    setBusy(true);
    setErr('');
    inflight = refreshNewsIdeas()
      .then(() => setNews(loadNewsIdeas()))
      .catch((e) => setErr((e as Error).message))
      .finally(() => {
        inflight = null;
        setMeta(loadNewsMeta());
        setBusy(false);
      });
    await inflight;
  };
  // Automatic: on opening when the last update is older than 6 h, then checked every 30 min while the view is open.
  useEffect(() => {
    const tick = () => {
      if (isStale(loadNewsMeta()?.at, Date.now())) void refresh();
    };
    tick();
    const t = setInterval(tick, 30 * 60_000);
    return () => clearInterval(t);
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const fresh = news.slice(0, 40);
  const newsShown = fresh.length
    ? Array.from({ length: Math.min(4, fresh.length) }, (_, k) => fresh[(k + shift * 4) % fresh.length]!)
    : [];
  const libShown = dailyPicks(
    IDEA_LIBRARY.filter((i) => i.format === 'court'),
    `${today}#${shift}`,
    4,
  );
  // The 60-s stories already WRITTEN with the TikTok comedy bible: a click puts the whole script in the idea field.
  const stories = dailyPicks(
    IDEA_LIBRARY.filter((i) => i.format === 'histoire'),
    `${today}#s${shift}`,
    2,
  );
  const card = (i: Idea) => (
    <button
      key={`${i.id}-${shift}`}
      type="button"
      onClick={() => onPick(ideaText(i))}
      data-testid={`prompter-idea-${i.id}`}
      className="rounded-xl border border-line p-2 text-left text-[12px] hover:border-accent"
    >
      <div className="flex items-center gap-1 font-semibold">
        {i.source === 'actualité' ? (
          <Badge tone="info">actu {i.date?.slice(5)}</Badge>
        ) : i.format === 'histoire' ? (
          <Badge tone="accent">histoire 60 s · écrite</Badge>
        ) : (
          <Badge tone="neutral">{i.family}</Badge>
        )}
        <span className="truncate">{i.title}</span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-muted">{i.setup}</div>
      <div className="mt-0.5 line-clamp-1 text-faint">Chute : {i.punchline}</div>
    </button>
  );
  return (
    <div className="rounded-xl border border-line p-3" data-testid="idea-prompter">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold">💡 Prompteur d’idées</span>
        <span className="text-faint" data-testid="prompter-status">
          {busy
            ? 'lecture de l’actualité…'
            : meta
              ? `actualité ${ago(meta.at)}${meta.sources.length ? ` · ${meta.sources.join(', ')}` : ''}${meta.error ? ` · ${meta.error}` : ''}`
              : 'actualité pas encore lue'}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" onClick={() => setShift((s) => s + 1)} data-testid="prompter-more">
            🎲 Autres idées
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void refresh()} data-testid="prompter-refresh">
            ↻ Actualité
          </Button>
        </div>
      </div>
      {err && <div className="mb-1 text-[11px] text-warn">{err}</div>}
      {newsShown.length > 0 && <div className="mb-2 grid gap-2 sm:grid-cols-2">{newsShown.map(card)}</div>}
      {stories.length > 0 && (
        <div className="mb-2 grid gap-2 sm:grid-cols-2" data-testid="prompter-stories">
          {stories.map(card)}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">{libShown.map(card)}</div>
    </div>
  );
}
