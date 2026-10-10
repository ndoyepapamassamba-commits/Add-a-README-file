// The design gallery shown in the chat BEFORE any deliverable: premium designs as thumbnails (drawn from the same tokens
// the exporters use), the output format(s), « use for this whole chat », and designs found on the Internet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spinner } from '../../web/components/ui';
import { resolveDesign } from '../lib/agent';
import { PREMIUM_DESIGNS, thumbnailDataUrl, type DeliverableKind } from '../../server/services/premiumDesigns';
import { searchDesigns, layoutFromImage, paletteFromImage, siteDesign } from '../lib/designWeb';
import { DESIGN_STYLES, type DesignStyle } from '../../server/jev/web/search';
import { dashboardData, layoutTheme, renderLayoutHtml, type DesignLayout } from '../../server/services/layoutClone';
import type { ThemeId, CustomTheme } from '../../server/services/houseDesign';
import { LOGO_VARIANTS, type LogoVariant } from '../../server/services/logoHarmony';
import { decodeLogo, isLogoFile, logoPalette, renderLogo, type DecodedLogo } from '../lib/logo';
import { useStore } from '../lib/store';
import { filesFor, importBrowserFile, sessionAllow, writeChatBytes } from '../lib/vfs';
import type { DesignChoice } from '../lib/types';

const KIND_LABEL: Record<DeliverableKind, string> = { excel: 'classeur Excel', document: 'document', slides: 'présentation', web: 'site / application' };
const FORMAT_LABEL: Record<string, string> = { docx: 'Word', pptx: 'PowerPoint', pdf: 'PDF', html: 'HTML', eml: 'Mail Outlook', md: 'Markdown', xlsx: 'Excel', csv: 'CSV', json: 'JSON' };

type CardItem = { id: string; deliverable: DeliverableKind; formats: string[]; chosenFormats?: string[]; resolved?: string };
export function DesignCard({ item }: { item: CardItem }) {
  if (item.resolved)
    return (
      <div className="my-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12.5px]" data-testid="design-card-done">
        🎨 Design : <b>{item.resolved}</b>
        {item.chosenFormats?.length ? ` · ${item.chosenFormats.map((f) => FORMAT_LABEL[f] ?? f).join(', ')}` : ''}
      </div>
    );
  return <DesignCardOpen item={item} />;
}

function DesignCardOpen({ item }: { item: CardItem }) {
  const [sel, setSel] = useState<ThemeId | 'custom'>('house');
  const [formats, setFormats] = useState<string[]>(item.chosenFormats ?? []);
  const [remember, setRemember] = useState(true);
  const [web, setWeb] = useState<{ url: string; description: string }[] | null>(null);
  const [webSel, setWebSel] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomTheme | null>(null);
  const [layout, setLayout] = useState<DesignLayout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [style, setStyle] = useState<DesignStyle>('Tous');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const seen = useRef(new Set<string>());
  // ── LOGO: none, an image of this chat, or an imported one — recoloured harmoniously to the chosen palette ──
  const sid = useStore((x) => x.currentId);
  const storeFiles = useStore((x) => x.files);
  const logos = useMemo(
    () => (sid ? Object.values(filesFor(sid, sessionAllow(sid))).filter((f) => isLogoFile(f.path) && !f.path.startsWith('assets/logo-')).sort((a, b) => b.updatedAt - a.updatedAt) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sid, storeFiles],
  );
  const [logoPath, setLogoPath] = useState<string | null>(() => logos.find((f) => /logo/i.test(f.path))?.path ?? null);
  const [variant, setVariant] = useState<LogoVariant>('harmonized');
  const [decoded, setDecoded] = useState<DecodedLogo | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<LogoVariant, string>>>({});
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDecoded(null);
    const f = logoPath ? logos.find((x) => x.path === logoPath) : undefined;
    if (!f) return;
    let live = true;
    decodeLogo(f)
      .then((d) => live && setDecoded(d))
      .catch(() => live && setErr('Ce logo ne peut pas être lu (format non pris en charge).'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoPath]);
  const [siteUrl, setSiteUrl] = useState('');
  const [site, setSite] = useState<{ url: string; font: string; radius: number; vars: number; structure: boolean } | null>(null);
  /** A REAL website: its code gives the exact colours / fonts / radius, its screenshot gives the structure. */
  const pickSite = async () => {
    if (!siteUrl.trim()) return;
    setErr('');
    setSite(null);
    try {
      const r = await siteDesign(siteUrl, (st) => setBusy(st));
      setLayout(r.layout);
      setCustom(layoutTheme(r.layout));
      setWebSel(r.url);
      setSel('custom');
      setSite({ url: r.url, font: r.tokens.font, radius: r.tokens.radius, vars: Object.keys(r.tokens.cssVars).length, structure: Boolean(r.screenshot) });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const kind = item.deliverable;
  const toggleFormat = (f: string) => setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : item.formats.length && (f === 'xlsx' || f === 'csv' || f === 'json') ? [f] : [...p, f]));
  /** First page (new style / search) or the next page appended (« Plus de designs »). */
  const loadWeb = async (opts: { more?: boolean; style?: DesignStyle } = {}) => {
    const st = opts.style ?? style;
    const p = opts.more ? page + 1 : 0;
    if (!opts.more) seen.current = new Set();
    setBusy(opts.more ? 'chargement de designs supplémentaires…' : 'recherche de designs sur Internet…');
    setErr('');
    try {
      const found = await searchDesigns(kind, { page: p, style: st, extra: query.trim(), seen: seen.current });
      setPage(p);
      setWeb((prev) => (opts.more && prev ? [...prev, ...found] : found));
      if (opts.more && !found.length) setErr('Aucun nouveau design sur cette page : changez de style ou précisez la recherche.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const pickWeb = async (url: string) => {
    setBusy('lecture de la mise en page de l’image…');
    setErr('');
    setWebSel(url);
    setLayout(null);
    setCustom(null);
    setSite(null);
    try {
      const r = await layoutFromImage(url);
      setLayout(r.layout);
      setCustom(layoutTheme(r.layout));
      setSel('custom');
    } catch (e) {
      // The full layout could not be read: keep at least the image's palette and font (never fall back silently).
      try {
        setBusy('lecture des couleurs de l’image…');
        const p = await paletteFromImage(url);
        setCustom(p.theme);
        setSel('custom');
        setErr('Mise en page non lisible sur cette image : ses couleurs et sa police seront utilisées.');
      } catch {
        setErr(`${(e as Error).message} Choisissez une autre image ou un design de la galerie.`);
        setWebSel(null);
        setSel('house');
      }
    } finally {
      setBusy(null);
    }
  };
  const selLabel = sel === 'custom' ? (site ? `Site reproduit — ${new URL(site.url).hostname}` : layout ? 'Design Internet (mise en page + couleurs)' : 'Design Internet (couleurs)') : (PREMIUM_DESIGNS.find((d) => d.id === sel)?.label ?? sel);
  // Live previews of every logo variant for the palette being chosen.
  const palette = logoPalette(sel === 'custom' && custom ? 'custom' : (sel as ThemeId), custom, sel === 'custom' ? layout : null);
  const palKey = JSON.stringify(palette);
  useEffect(() => {
    if (!decoded) return setPreviews({});
    let live = true;
    void Promise.all(LOGO_VARIANTS.map(async (v) => [v.id, (await renderLogo(decoded, palette, v.id)).dataUrl] as const)).then((r) => live && setPreviews(Object.fromEntries(r)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded, palKey]);
  const go = async () => {
    const choice: DesignChoice = sel === 'custom' && custom ? { theme: 'custom', colors: custom, source: webSel ?? undefined, layout: layout ?? undefined } : { theme: sel as ThemeId };
    if (decoded && logoPath && sid) {
      setBusy('préparation du logo…');
      const r = await renderLogo(decoded, palette, variant);
      const path = `assets/logo-${variant}.png`;
      writeChatBytes(sid, path, r.png, 'image/png');
      choice.logo = { path, variant, width: r.width, height: r.height, source: logoPath };
      setBusy(null);
    }
    resolveDesign(item.id, { choice, formats: formats.length ? formats : undefined, remember });
  };
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
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid="design-web-styles">
              {DESIGN_STYLES.map((x) => (
                <button
                  key={x}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setStyle(x);
                    void loadWeb({ style: x });
                  }}
                  className={`rounded-full border px-2.5 py-0.5 ${style === x ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                >
                  {x}
                </button>
              ))}
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadWeb();
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="précisez : banque, sombre, luxe…"
                  className="w-44 rounded-full border border-line bg-transparent px-2.5 py-0.5"
                  data-testid="design-web-query"
                />
              </form>
            </div>
            <div className="mb-1 text-[12px] text-muted">
              {web.length} design(s) trouvé(s) sur Internet — cliquez sur une image pour la reproduire (mise en page, couleurs et police lues par un modèle vision) :
            </div>
            <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6" data-testid="design-web-gallery">
              {web.map((w) => (
                <button key={w.url} type="button" onClick={() => void pickWeb(w.url)} className={`overflow-hidden rounded-lg border ${webSel === w.url ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`} title={w.description}>
                  <img src={w.url} alt={w.description || 'design'} loading="lazy" referrerPolicy="no-referrer" className="h-20 w-full object-cover" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')} />
                </button>
              ))}
              {!web.length && <div className="text-[12px] text-muted">Aucune image trouvée.</div>}
            </div>
            <button type="button" className="mt-1 text-[12px] text-accent disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void loadWeb({ more: true })} data-testid="design-web-more">
              ➕ Plus de designs
            </button>
            {layout && (
              <div className="mt-2" data-testid="design-layout-preview">
                <div className="mb-1 text-[12px] text-muted">Aperçu de la reproduction (mise en page du design, avec des données d’exemple — vos vraies données seront utilisées) :</div>
                <div className="h-56 overflow-hidden rounded-lg border border-line">
                  <iframe
                    title="aperçu de la reproduction"
                    sandbox=""
                    className="h-[560px] w-[250%] origin-top-left scale-[0.4]"
                    srcDoc={renderLayoutHtml(layout, dashboardData('Aperçu', ['catégorie', 'montant', 'volume'], [{ catégorie: 'Nord', montant: 1250, volume: 40 }, { catégorie: 'Sud', montant: 820, volume: 31 }, { catégorie: 'Est', montant: 640, volume: 22 }, { catégorie: 'Ouest', montant: 410, volume: 15 }], layout.kpis.count || 4))}
                  />
                </div>
              </div>
            )}
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
      <form
        className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]"
        data-testid="design-site"
        onSubmit={(e) => {
          e.preventDefault();
          void pickSite();
        }}
      >
        <span>🔗 Reproduire un site existant :</span>
        <input
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="ex. stripe.com, linear.app, le site de votre banque…"
          className="min-w-[220px] flex-1 rounded-full border border-line bg-transparent px-2.5 py-0.5"
          data-testid="design-site-url"
        />
        <button type="submit" disabled={Boolean(busy) || !siteUrl.trim()} className="rounded-full border border-accent px-2.5 py-0.5 text-accent disabled:opacity-50" data-testid="design-site-go">
          Analyser le site
        </button>
      </form>
      {site && (
        <div className="mt-1 text-[12px] text-muted" data-testid="design-site-done">
          Style lu dans le code de {new URL(site.url).hostname} : couleurs exactes ({site.vars} variables CSS), police « {site.font} », arrondi {site.radius}px
          {site.structure ? ', structure lue sur la capture d’écran' : ' (structure par défaut : capture indisponible)'}.
        </div>
      )}
      {!web && layout && (
        <div className="mt-2" data-testid="design-layout-preview">
          <div className="mb-1 text-[12px] text-muted">Aperçu de la reproduction (avec des données d’exemple — vos vraies données seront utilisées) :</div>
          <div className="h-56 overflow-hidden rounded-lg border border-line">
            <iframe
              title="aperçu de la reproduction"
              sandbox=""
              className="h-[560px] w-[250%] origin-top-left scale-[0.4]"
              srcDoc={renderLayoutHtml(layout, dashboardData('Aperçu', ['catégorie', 'montant', 'volume'], [{ catégorie: 'Nord', montant: 1250, volume: 40 }, { catégorie: 'Sud', montant: 820, volume: 31 }, { catégorie: 'Est', montant: 640, volume: 22 }, { catégorie: 'Ouest', montant: 410, volume: 15 }], layout.kpis.count || 4))}
            />
          </div>
        </div>
      )}
      <div className="mt-2 rounded-xl border border-line p-2 text-[12px]" data-testid="design-logo">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">Logo :</span>
          <button type="button" onClick={() => setLogoPath(null)} className={`rounded-full border px-2.5 py-0.5 ${!logoPath ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`} data-testid="design-logo-none">
            Sans logo
          </button>
          {logos.slice(0, 8).map((f) => (
            <button key={f.path} type="button" onClick={() => setLogoPath(f.path)} title={f.path} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${logoPath === f.path ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`} data-testid="design-logo-file">
              {f.path.split('/').pop()}
            </button>
          ))}
          <button type="button" onClick={() => logoInput.current?.click()} className="rounded-full border border-dashed border-line px-2.5 py-0.5" data-testid="design-logo-import">
            ＋ Importer un logo
          </button>
          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !sid) return;
              const v = await importBrowserFile(f, 'uploads', sid);
              setLogoPath(v.path);
            }}
          />
        </div>
        {logoPath && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="design-logo-variants">
            {LOGO_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                data-testid={`design-logo-${v.id}`}
                className={`rounded-lg border p-1 text-left ${variant === v.id ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
              >
                <div className={`flex h-14 items-center justify-center rounded ${v.id === 'white' ? 'bg-[#334155]' : 'bg-white'}`}>
                  {previews[v.id] ? <img src={previews[v.id]} alt={v.label} className="max-h-12 max-w-full object-contain" /> : <Spinner className="h-3 w-3" />}
                </div>
                <div className="mt-0.5 truncate text-[11px]">{v.label}</div>
              </button>
            ))}
          </div>
        )}
        {logoPath && <div className="mt-1 text-[11px] text-muted">Le logo prend les couleurs du design choisi (fond → couleur principale, couleurs de marque → accent, blanc conservé si lisible) et sera placé automatiquement dans Excel, Word, PowerPoint et les pages HTML.</div>}
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
        <Button variant="primary" onClick={() => void go()} disabled={Boolean(busy) || (sel === 'custom' && !custom) || (item.formats.length > 0 && !formats.length)} data-testid="design-go">
          Générer avec ce design
        </Button>
        <span className="text-[12px]" data-testid="design-selected">
          Sélection : <b>{selLabel}</b>
        </span>
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
