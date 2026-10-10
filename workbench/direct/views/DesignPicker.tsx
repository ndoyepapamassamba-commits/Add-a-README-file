// The design gallery shown in the chat BEFORE any deliverable: premium designs as thumbnails (drawn from the same tokens
// the exporters use), the output format(s), « use for this whole chat », and designs found on the Internet.
import { useState } from 'react';
import { Button, Spinner } from '../../web/components/ui';
import { resolveDesign } from '../lib/agent';
import { PREMIUM_DESIGNS, thumbnailDataUrl, type DeliverableKind } from '../../server/services/premiumDesigns';
import { searchDesigns, paletteFromImage } from '../lib/designWeb';
import type { ThemeId, CustomTheme } from '../../server/services/houseDesign';

const KIND_LABEL: Record<DeliverableKind, string> = { excel: 'classeur Excel', document: 'document', slides: 'présentation', web: 'site / application' };
const FORMAT_LABEL: Record<string, string> = { docx: 'Word', pptx: 'PowerPoint', pdf: 'PDF', html: 'HTML', eml: 'Mail Outlook', md: 'Markdown', xlsx: 'Excel', csv: 'CSV', json: 'JSON' };

export function DesignCard({ item }: { item: { id: string; deliverable: DeliverableKind; formats: string[]; chosenFormats?: string[]; resolved?: string } }) {
  const [sel, setSel] = useState<ThemeId | 'custom'>('house');
  const [formats, setFormats] = useState<string[]>(item.chosenFormats ?? []);
  const [remember, setRemember] = useState(true);
  const [web, setWeb] = useState<{ url: string; description: string }[] | null>(null);
  const [webSel, setWebSel] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomTheme | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  if (item.resolved)
    return (
      <div className="my-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12.5px]" data-testid="design-card-done">
        🎨 Design : <b>{item.resolved}</b>
        {item.chosenFormats?.length ? ` · ${item.chosenFormats.map((f) => FORMAT_LABEL[f] ?? f).join(', ')}` : ''}
      </div>
    );
  const kind = item.deliverable;
  const toggleFormat = (f: string) => setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : item.formats.length && (f === 'xlsx' || f === 'csv' || f === 'json') ? [f] : [...p, f]));
  const loadWeb = async () => {
    setBusy('recherche de designs sur Internet…');
    setErr('');
    try {
      setWeb(await searchDesigns(kind));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const pickWeb = async (url: string) => {
    setBusy('lecture du style de l’image…');
    setErr('');
    setWebSel(url);
    try {
      const r = await paletteFromImage(url);
      setCustom(r.theme);
      setSel('custom');
    } catch (e) {
      setErr((e as Error).message);
      setWebSel(null);
    } finally {
      setBusy(null);
    }
  };
  const go = () =>
    resolveDesign(item.id, {
      choice: sel === 'custom' && custom ? { theme: 'custom', colors: custom, source: webSel ?? undefined } : { theme: sel === 'custom' ? 'house' : sel },
      formats: formats.length ? formats : undefined,
      remember,
    });
  return (
    <div className="my-3 rounded-2xl border border-accent/50 bg-panel p-3" data-testid="design-card">
      <div className="mb-2 text-[13.5px] font-semibold">🎨 Choisissez le design de votre {KIND_LABEL[kind]}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="design-gallery">
        {PREMIUM_DESIGNS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSel(d.id)}
            data-testid={`design-${d.id}`}
            className={`rounded-xl border p-1.5 text-left transition ${sel === d.id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-strong'}`}
          >
            <img src={thumbnailDataUrl(d.id, kind)} alt={d.label} className="w-full rounded-lg" />
            <div className="mt-1 truncate text-[12px] font-semibold">{d.label}</div>
            <div className="truncate text-[11px] text-muted">{d.bestFor}</div>
          </button>
        ))}
      </div>
      <div className="mt-2">
        {!web ? (
          <button type="button" className="text-[12px] text-accent" onClick={() => void loadWeb()} data-testid="design-web">
            🌐 Voir des designs sur Internet
          </button>
        ) : (
          <div>
            <div className="mb-1 text-[12px] text-muted">Designs trouvés sur Internet — cliquez pour reprendre leur style (palette et police lues par un modèle vision) :</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="design-web-gallery">
              {web.map((w) => (
                <button key={w.url} type="button" onClick={() => void pickWeb(w.url)} className={`overflow-hidden rounded-lg border ${webSel === w.url ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`} title={w.description}>
                  <img src={w.url} alt={w.description || 'design'} loading="lazy" referrerPolicy="no-referrer" className="h-20 w-full object-cover" />
                </button>
              ))}
              {!web.length && <div className="text-[12px] text-muted">Aucune image trouvée.</div>}
            </div>
            {custom && (
              <div className="mt-1 flex items-center gap-2 text-[12px]" data-testid="design-custom">
                Style repris :
                {[custom.dark, custom.primary, custom.accent].filter(Boolean).map((c) => (
                  <span key={c} className="inline-block h-4 w-6 rounded border border-line" style={{ background: c!.startsWith('#') ? c : `#${c}` }} />
                ))}
                {custom.font && <span className="text-muted">{custom.font}</span>}
              </div>
            )}
          </div>
        )}
      </div>
      {item.formats.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="design-formats">
          <span className="text-muted">Format :</span>
          {item.formats.map((f) => (
            <button key={f} type="button" onClick={() => toggleFormat(f)} className={`rounded-full border px-2.5 py-0.5 ${formats.includes(f) ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
              {FORMAT_LABEL[f] ?? f}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={go} disabled={Boolean(busy) || (item.formats.length > 0 && !formats.length)} data-testid="design-go">
          Générer avec ce design
        </Button>
        <label className="flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Utiliser ce design pour tout ce chat
        </label>
        {busy && (
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Spinner className="h-3 w-3" /> {busy}
          </span>
        )}
      </div>
      {err && <div className="mt-1 text-[12px] text-err">{err}</div>}
    </div>
  );
}
