// MARKDOWN → DOSSIER — every report the agent writes in Markdown (report.export) becomes a committee dossier: the
// « # » title, the « ## » chapters, the bullets as measured findings, the paragraphs as the analysis, the tables, the
// recommendations when a list item or a table row names an owner / a deadline, the brief's indicators and figures.
// Nothing is invented: what the Markdown does not say stays empty, and the depth rules report it.
import { fmtFact, type Brief } from '../reportBrief';
import { normalizeDossier, todayFr, type Dossier, type Figure, type Kpi, type Reco } from './dossier';

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim();

/** The brief's KPIs (fact → tile) and its leading figures (dimensions, trend). */
export function briefKpis(b: Brief): Kpi[] {
  return b.kpis.slice(0, 10).map((k, i) => ({ code: `K${String(i + 1).padStart(2, '0')}`, label: k.label, value: fmtFact(k), method: k.method, num: k.value, tone: /anomal|manqu|retard|impay|douteu|risque/i.test(k.label) ? 'warn' : 'neutral' }));
}
export function briefFigures(b: Brief): Figure[] {
  const out: Figure[] = [];
  for (const dim of b.dims.filter((d) => d.dim !== b.entity).slice(0, 3)) {
    if (dim.top.length >= 2) out.push({ kind: dim.top.length > 6 ? 'bar3d' : 'col3d', title: `${b.measureLabel} par ${dim.label}`, categories: dim.top.map((t) => t.key), series: [{ name: b.measureLabel, values: dim.top.map((t) => t.sum) }], lecture: `${dim.top[0]!.key} porte ${Math.round(dim.top[0]!.share * 100)} % du total ; ${dim.n80} catégorie(s) sur ${dim.categories} suffisent pour les quatre cinquièmes du total.` });
  }
  if (b.trend && b.trend.points.length >= 3) out.push({ kind: 'line', title: `Évolution ${b.trend.by === 'month' ? 'mensuelle' : 'annuelle'} — ${b.measureLabel}`, categories: b.trend.points.map((p) => p.period), series: [{ name: b.measureLabel, values: b.trend.points.map((p) => p.sum) }], lecture: b.trend.delta != null ? `Dernière période ${b.trend.last} : ${b.trend.delta >= 0 ? '+' : ''}${Math.round(b.trend.delta * 100)} % par rapport à la précédente.` : undefined });
  if (b.bands.length >= 3) out.push({ kind: 'col3d', title: `Répartition par tranche — ${b.measureLabel}`, categories: b.bands.map((x) => x.label), series: [{ name: 'Nombre', values: b.bands.map((x) => x.count) }], fmt: '0' });
  return out;
}

/** A list item or a table row that names an owner / a deadline is a recommendation. */
function recoFromText(t: string, i: number): Reco | null {
  const m = /^(?:(R-?\d+)\s*[·:—-]\s*)?(?:\[?(P[123])\]?\s*[·:—-]?\s*)?(.+)$/i.exec(t);
  if (!m) return null;
  const text = m[3]!;
  const owner = /(?:responsable|owner)\s*[:—-]\s*([^;·|.]+)/i.exec(text)?.[1]?.trim();
  const due = /(?:échéance|avant le|d'ici le|deadline)\s*[:—-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|[^;·|.]{3,30})/i.exec(text)?.[1]?.trim();
  const kpi = /(?:indicateur|kpi)\s*[:—-]\s*([^;·|]+)/i.exec(text)?.[1]?.trim();
  if (!owner && !due && !m[1] && !m[2]) return null;
  const title = text.split(/[.;:]|—/)[0]!.trim().slice(0, 140);
  return { ref: m[1]?.toUpperCase().replace(/^R(\d)/, 'R-$1') ?? `R-${String(i + 1).padStart(2, '0')}`, priority: (m[2]?.toUpperCase() as Reco['priority']) ?? 'P2', title, action: text, owner: owner ?? 'À désigner', due: due ?? 'À fixer', kpi: kpi ?? 'Indicateur à définir' };
}

export function dossierFromMarkdown(md: string, o: { title?: string; subtitle?: string; brief?: Brief | null; org?: string; unit?: string; author?: string; audience?: string; asOf?: string; confidentiality?: string } = {}): Dossier {
  const lines = md.replace(/\r/g, '').split('\n');
  let title = o.title ?? '';
  const chapters: Record<string, unknown>[] = [];
  let cur: Record<string, unknown> | null = null;
  const intro: string[] = [];
  const messages: string[] = [];
  const decisions: string[] = [];
  const hypotheses: { title: string; text: string }[] = [];
  const glossary: { term: string; def: string }[] = [];
  const sources: { title: string; lesson: string; url?: string }[] = [];
  let mode: 'chapter' | 'decisions' | 'hypotheses' | 'glossary' | 'sources' | 'messages' | 'intro' = 'intro';
  const push = (k: string, v: unknown) => {
    if (!cur) return;
    (cur[k] as unknown[]).push(v);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      const text = clean(h[2]!);
      if (h[1]!.length === 1 && !title) {
        title = text;
        continue;
      }
      const low = text.toLowerCase();
      if (/d[ée]cisions?/.test(low) && h[1]!.length <= 2) {
        mode = 'decisions';
        continue;
      }
      if (/hypoth/.test(low) && h[1]!.length <= 2) {
        mode = 'hypotheses';
        continue;
      }
      if (/glossaire/.test(low) && h[1]!.length <= 2) {
        mode = 'glossary';
        continue;
      }
      if (/sources?|bibliograph|r[ée]f[ée]rences/.test(low) && h[1]!.length <= 2) {
        mode = 'sources';
        continue;
      }
      if (/messages? cl[ée]s|ce qu.il faut retenir|synth[èe]se|r[ée]sum[ée]/.test(low) && h[1]!.length <= 2 && !chapters.length) {
        mode = 'messages';
        continue;
      }
      if (h[1]!.length <= 2) {
        cur = { title: text.replace(/^\d+[.)]\s*/, ''), constats: [], analyse: [], cadre: [], cas: [], figures: [], tables: [], recommandations: [] };
        chapters.push(cur);
        mode = 'chapter';
      } else if (cur) {
        const sub = low;
        (cur as { _sub?: string })._sub = /recommand|action/.test(sub) ? 'reco' : /cadre|r[ée]glement|recherche/.test(sub) ? 'cadre' : /cas\b|exemple/.test(sub) ? 'cas' : /constat|chiffre|faits?/.test(sub) ? 'constat' : 'analyse';
      }
      continue;
    }
    if (!l.trim() || /^```/.test(l)) continue;
    if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((x) => clean(x));
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      if (cur) {
        const hl = head.map((x) => x.toLowerCase());
        const io = hl.findIndex((x) => /responsable|owner/.test(x));
        const id = hl.findIndex((x) => /[ée]ch[ée]ance|date|deadline/.test(x));
        if (io >= 0 || id >= 0) {
          const ir = hl.findIndex((x) => /r[ée]f/.test(x));
          const ip = hl.findIndex((x) => /priorit/.test(x));
          const it = hl.findIndex((x) => /recommand|action|mesure|titre/.test(x));
          const ik = hl.findIndex((x) => /indicateur|kpi/.test(x));
          rows.forEach((r, k) => push('recommandations', { ref: ir >= 0 ? r[ir] : undefined, priority: ip >= 0 ? r[ip] : 'P2', title: it >= 0 ? r[it] : r[0], action: it >= 0 ? r[it] : r.join(' · '), owner: io >= 0 ? r[io] : undefined, due: id >= 0 ? r[id] : undefined, kpi: ik >= 0 ? r[ik] : undefined, _i: k }));
        } else push('tables', { head, rows });
      }
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    const text = clean(li ? li[2]! : l.replace(/^\s*>\s?/, ''));
    if (!text) continue;
    if (mode === 'decisions') {
      decisions.push(text);
      continue;
    }
    if (mode === 'hypotheses') {
      const m = /^(?:H\d+\s*[—:-]\s*)?([^.:—]{3,60})\s*[.:—]\s*(.+)$/.exec(text);
      hypotheses.push(m ? { title: m[1]!.trim(), text: m[2]!.trim() } : { title: text.slice(0, 50), text });
      continue;
    }
    if (mode === 'glossary') {
      const m = /^([^:—]{1,40})\s*[:—]\s*(.+)$/.exec(text);
      if (m) glossary.push({ term: m[1]!.trim(), def: m[2]!.trim() });
      continue;
    }
    if (mode === 'sources') {
      const url = /\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/.exec(l)?.[1] ?? /(https?:\/\/\S+)/.exec(l)?.[1];
      const parts = text.split(/\s[—–-]\s/);
      sources.push({ title: parts[0]!.trim(), lesson: parts.slice(1).join(' — ').trim() || '—', url });
      continue;
    }
    if (mode === 'messages' || (mode === 'intro' && li)) {
      messages.push(text);
      continue;
    }
    if (mode === 'intro') {
      intro.push(text);
      continue;
    }
    if (!cur) continue;
    const sub = (cur as { _sub?: string })._sub ?? (li ? 'constat' : 'analyse');
    if (li) {
      const reco = sub === 'reco' ? recoFromText(text, (cur.recommandations as unknown[]).length) ?? { title: text.slice(0, 140), action: text, priority: 'P2' } : recoFromText(text, (cur.recommandations as unknown[]).length);
      if (reco) push('recommandations', reco);
      else push(sub === 'cadre' ? 'cadre' : sub === 'cas' ? 'cas' : 'constats', text);
    } else push(sub === 'cadre' ? 'cadre' : sub === 'cas' ? 'cas' : 'analyse', text);
  }
  // The brief: indicators on the cover, its figures in the first chapters that have none.
  const b = o.brief ?? null;
  const kpis = b ? briefKpis(b) : [];
  const figs = b ? briefFigures(b) : [];
  chapters.forEach((c) => {
    if (!(c.figures as unknown[]).length && figs.length) (c.figures as unknown[]).push(figs.shift()!);
  });
  if (figs.length && chapters[0]) (chapters[0].figures as unknown[]).push(...figs);
  const thesis = intro.join(' ').trim() || messages.slice(0, 2).join(' ') || '';
  return normalizeDossier(
    { title: title || 'Rapport', subtitle: o.subtitle, thesis, kpis, messages, chapters, decisions, hypotheses, glossary, sources: sources.map((s, i) => ({ ...s, id: `R1-${String(i + 1).padStart(2, '0')}`, axis: 'R1' })) },
    { date: todayFr(), org: o.org, unit: o.unit, author: o.author, audience: o.audience, asOf: o.asOf, confidentiality: o.confidentiality, dataSource: b ? `${b.source} — ${b.rows.toLocaleString('fr-FR')} lignes, ${b.columns} colonnes` : undefined, provenance: b ? 'Les indicateurs sont calculés localement sur les lignes du fichier (brief d’analyse) ; le récit est vérifié contre le brief.' : undefined },
  );
}
