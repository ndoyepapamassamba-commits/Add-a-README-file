// THE PRINTABLE PAGE AND THE MAIL — the Dossier as a standalone HTML page (A4, « Imprimer → PDF ») and as an
// Outlook-safe colour mail (tables and inline styles only). Same grammar as the deck and the report; the figures are
// drawn as inline SVG (no script) so the page prints and the mail renders everywhere.
import { activeDesign, liveColorProxy, type Design } from '../houseDesign';
import { allRecos, type Dossier, type Figure, type Kpi, type Tone } from './dossier';

const C = liveColorProxy((c) => c) as Design['color'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const h = (rgb: string) => `#${rgb}`;
const toneColor = (t?: Tone): string => (t === 'risk' ? C.risk : t === 'warn' ? C.warn : t === 'ok' ? C.green : t === 'info' ? C.cyan : C.blue);
const fmtV = (v: number, unit?: string) => (unit === '%' ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : Math.abs(v) >= 1e9 ? `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mds` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));

/** Inline SVG of a figure: columns (grouped), horizontal bars, a line, or a doughnut — in the palette. */
export function figureSvg(f: Figure, W = 640, H = 300): string {
  const D = activeDesign();
  const pal = D.chartSeries.map(h);
  const n = Math.min(f.categories.length, ...f.series.map((s) => s.values.length));
  const cats = f.categories.slice(0, n);
  const series = f.series.map((s) => ({ name: s.name, values: s.values.slice(0, n) }));
  const max = Math.max(1e-9, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))));
  const font = `font-family="${esc(D.font.ui)}"`;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block" role="img" aria-label="${esc(f.title)}">`];
  out.push(`<text x="${W / 2}" y="18" text-anchor="middle" ${font} font-size="13" font-weight="700" fill="${h(C.navy)}">${esc(f.title)}</text>`);
  const legend = series.length > 1 || f.kind === 'doughnut' || f.kind === 'pie';
  if (f.kind === 'doughnut' || f.kind === 'pie') {
    const vals = series[0]!.values;
    const total = vals.reduce((a, b) => a + Math.abs(b), 0) || 1;
    const cx = W * 0.36;
    const cy = H / 2 + 10;
    const R = Math.min(W * 0.3, H * 0.38);
    const r0 = f.kind === 'doughnut' ? R * 0.58 : 0;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (2 * Math.PI * Math.abs(v)) / total;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, r: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      out.push(`<path d="M${p(a0, R)} A${R},${R} 0 ${big} 1 ${p(a1, R)} L${p(a1, r0)} A${r0},${r0} 0 ${big} 0 ${p(a0, r0)} Z" fill="${pal[i % pal.length]}" stroke="#fff" stroke-width="2"/>`);
      const am = (a0 + a1) / 2;
      const rl = (R + r0) / 2;
      if (Math.abs(v) / total > 0.04) out.push(`<text x="${(cx + rl * Math.cos(am)).toFixed(1)}" y="${(cy + rl * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" ${font} font-size="11" font-weight="700" fill="#fff">${Math.round((100 * Math.abs(v)) / total)} %</text>`);
      a0 = a1;
    });
    cats.forEach((c, i) => out.push(`<rect x="${W * 0.68}" y="${44 + i * 20}" width="12" height="12" rx="2" fill="${pal[i % pal.length]}"/><text x="${W * 0.68 + 18}" y="${54 + i * 20}" ${font} font-size="11" fill="${h(C.text)}">${esc(c)} — ${fmtV(vals[i]!, f.unit)}</text>`));
    out.push('</svg>');
    return out.join('');
  }
  const horizontal = f.kind === 'bar' || f.kind === 'bar3d';
  const left = horizontal ? 150 : 48;
  const top = 32;
  const bottom = H - (legend ? 52 : 36);
  const right = W - 16;
  const pw = right - left;
  const ph = bottom - top;
  // grid
  for (let g = 0; g <= 4; g++) {
    if (horizontal) {
      const x = left + (pw * g) / 4;
      out.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${h(C.line)}" stroke-width="1"/><text x="${x}" y="${bottom + 14}" text-anchor="middle" ${font} font-size="10" fill="${h(C.text2)}">${fmtV((max * g) / 4, f.unit)}</text>`);
    } else {
      const y = bottom - (ph * g) / 4;
      out.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${h(C.line)}" stroke-width="1"/><text x="${left - 6}" y="${y + 4}" text-anchor="end" ${font} font-size="10" fill="${h(C.text2)}">${fmtV((max * g) / 4, f.unit)}</text>`);
    }
  }
  if (f.kind === 'line') {
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => `${(left + (pw * (i + 0.5)) / n).toFixed(1)},${(bottom - (ph * Math.abs(v)) / max).toFixed(1)}`);
      out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${pal[k % pal.length]}" stroke-width="3" stroke-linejoin="round"/>`);
      s.values.forEach((v, i) => out.push(`<circle cx="${(left + (pw * (i + 0.5)) / n).toFixed(1)}" cy="${(bottom - (ph * Math.abs(v)) / max).toFixed(1)}" r="4" fill="${pal[k % pal.length]}" stroke="#fff" stroke-width="1.5"/>${k === 0 ? `<text x="${(left + (pw * (i + 0.5)) / n).toFixed(1)}" y="${(bottom - (ph * Math.abs(v)) / max - 8).toFixed(1)}" text-anchor="middle" ${font} font-size="10" font-weight="700" fill="${h(C.text)}">${fmtV(v, f.unit)}</text>` : ''}`));
    });
    cats.forEach((c, i) => out.push(`<text x="${(left + (pw * (i + 0.5)) / n).toFixed(1)}" y="${bottom + 14}" text-anchor="middle" ${font} font-size="10" fill="${h(C.text2)}">${esc(c)}</text>`));
  } else {
    const groupW = (horizontal ? ph : pw) / n;
    const barW = (groupW * 0.72) / series.length;
    series.forEach((s, k) => {
      s.values.forEach((v, i) => {
        const len = ((horizontal ? pw : ph) * Math.abs(v)) / max;
        const color = series.length === 1 && i === 0 && n > 1 ? h(C.gold) : pal[k % pal.length]!;
        if (horizontal) {
          const y = top + groupW * i + groupW * 0.14 + barW * k;
          out.push(`<rect x="${left}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${barW.toFixed(1)}" rx="2" fill="${color}"/><text x="${(left + len + 4).toFixed(1)}" y="${(y + barW / 2 + 4).toFixed(1)}" ${font} font-size="10" font-weight="700" fill="${h(C.text)}">${fmtV(v, f.unit)}</text>`);
        } else {
          const x = left + groupW * i + groupW * 0.14 + barW * k;
          out.push(`<rect x="${x.toFixed(1)}" y="${(bottom - len).toFixed(1)}" width="${barW.toFixed(1)}" height="${len.toFixed(1)}" rx="2" fill="${color}"/><text x="${(x + barW / 2).toFixed(1)}" y="${(bottom - len - 4).toFixed(1)}" text-anchor="middle" ${font} font-size="10" font-weight="700" fill="${h(C.text)}">${fmtV(v, f.unit)}</text>`);
        }
      });
    });
    cats.forEach((c, i) => {
      if (horizontal) out.push(`<text x="${left - 6}" y="${(top + groupW * i + groupW / 2 + 4).toFixed(1)}" text-anchor="end" ${font} font-size="10" fill="${h(C.text2)}">${esc(c.length > 22 ? `${c.slice(0, 21)}…` : c)}</text>`);
      else out.push(`<text x="${(left + groupW * i + groupW / 2).toFixed(1)}" y="${bottom + 14}" text-anchor="middle" ${font} font-size="10" fill="${h(C.text2)}">${esc(c.length > 14 ? `${c.slice(0, 13)}…` : c)}</text>`);
    });
  }
  if (legend) series.forEach((s, k) => out.push(`<rect x="${left + k * 120}" y="${H - 16}" width="12" height="12" rx="2" fill="${pal[k % pal.length]}"/><text x="${left + k * 120 + 16}" y="${H - 6}" ${font} font-size="11" fill="${h(C.text)}">${esc(s.name)}</text>`));
  out.push('</svg>');
  return out.join('');
}

const kpiTile = (k: Kpi) =>
  `<div class="kpi" style="border-bottom:3px solid ${h(toneColor(k.tone))}"><div class="kpi-l">${esc(k.code)} · ${esc(k.label)}</div><div class="kpi-v">${esc(k.value)}</div><div class="kpi-s" style="color:${h(toneColor(k.tone))}">${esc(k.sub ?? k.method ?? '')}</div></div>`;

export function dossierHtml(d: Dossier, o: { brand?: string } = {}): string {
  const D = activeDesign();
  const recos = allRecos(d);
  const brand = d.org ?? o.brand ?? 'MASSAMBA Workbench';
  const css = `
  :root{--navy:${h(C.navy)};--blue:${h(C.blue)};--gold:${h(C.gold)};--ice:${h(C.ice)};--panel:${h(C.panel)};--line:${h(C.line)};--text:${h(C.text)};--text2:${h(C.text2)};--risk:${h(C.risk)};--warn:${h(C.warn)};--green:${h(C.green)}}
  *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:var(--text);font:10.5pt/1.45 "${esc(D.font.ui)}",Segoe UI,Arial,sans-serif}
  .page{background:#fff;max-width:210mm;margin:16px auto;padding:18mm 16mm;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;padding:12mm 14mm}.break{page-break-before:always}}
  .band{background:var(--navy);color:#fff;padding:10px 14px;border-bottom:4px solid var(--gold);display:flex;justify-content:space-between;align-items:center;border-radius:4px 4px 0 0}
  .kicker{font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);font-weight:700}.unit{font-size:8.5pt;opacity:.85}
  .badge{background:#fff;color:var(--navy);font-weight:700;padding:6px 12px;border-radius:6px;font-size:9pt;box-shadow:0 1px 3px rgba(0,0,0,.2)}
  h1{font-size:24pt;color:var(--navy);margin:18px 0 6px;line-height:1.15}.sub{color:var(--text2);font-size:12pt;margin:0 0 14px}
  h2{font-size:15pt;color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:4px;margin:22px 0 10px}
  h3{font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin:14px 0 6px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin:10px 0}
  .kpi{background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px 10px 6px}
  .kpi-l{font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:var(--text2);font-weight:700;min-height:2.2em}
  .kpi-v{font:700 18pt "${esc(D.font.mono)}",Consolas,monospace;color:var(--navy);margin:2px 0}.kpi-s{font-size:7.5pt;font-style:italic}
  .callout{background:var(--ice);border-left:5px solid var(--gold);padding:8px 12px;margin:10px 0;border-radius:0 4px 4px 0}.callout b{color:var(--navy)}
  .lecture{background:var(--ice);border-left:4px solid var(--gold);padding:6px 10px;font-style:italic;color:var(--text2);margin:6px 0 12px;font-size:9.5pt}
  ul{margin:4px 0 8px 18px;padding:0}li{margin:0 0 4px}li::marker{color:var(--gold)}
  table{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:9pt}th{background:var(--navy);color:#fff;text-align:left;padding:6px 8px;border-bottom:2px solid var(--gold)}td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}tr:nth-child(even) td{background:var(--panel)}td.num{text-align:right;font-family:"${esc(D.font.mono)}",Consolas,monospace}
  .ref{display:inline-block;color:#fff;font:700 8.5pt "${esc(D.font.mono)}",Consolas,monospace;padding:2px 7px;border-radius:10px}
  .fig{margin:10px 0 4px}.figcap{font-size:8.5pt;color:var(--navy);font-weight:700;text-align:center;margin:2px 0 10px}.figcap i{font-weight:400;color:var(--text2)}
  .dec{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.dec .n{background:var(--risk);color:#fff;font-weight:700;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;flex:none;font-size:9pt}
  .vote{margin-left:auto;white-space:nowrap;color:var(--text2);font-size:9pt}
  .meta{font-size:9pt;color:var(--text2)}.meta b{color:var(--navy)}.foot{font-size:8pt;color:var(--text2);border-top:1px solid var(--line);margin-top:24px;padding-top:6px;display:flex;justify-content:space-between}
  .src{margin:0 0 8px 0;font-size:9pt}.src .id{font-family:"${esc(D.font.mono)}",monospace;color:var(--blue);font-weight:700}.src .les{color:var(--text2);font-style:italic;margin-left:14px;display:block}`;
  const chapters = d.chapters
    .map(
      (ch) => `<section class="break"><h2>${ch.n}. ${esc(ch.title)}${ch.headline ? ` : ${esc(ch.headline)}` : ''}</h2>${ch.kpis?.length ? `<div class="kpis">${ch.kpis.slice(0, 4).map(kpiTile).join('')}</div>` : ''}${
        ch.constats.length ? `<h3>Constat chiffré</h3><ul>${ch.constats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''
      }${ch.figures.map((f, i) => `<div class="fig">${figureSvg(f)}</div><div class="figcap">Figure ${i + 1} — ${esc(f.title)}${f.lecture ? ` <i>Lecture — ${esc(f.lecture)}</i>` : ''}</div>`).join('')}${
        ch.analyse.length ? `<h3>Analyse</h3>${ch.analyse.map((a) => `<p>${esc(a)}</p>`).join('')}` : ''
      }${ch.tables.map((t) => `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}<table><thead><tr>${t.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td${/^[-+]?[\d\s\u202f.,]+(%|Mds?|M|k)?$/.test(c.trim()) && /\d/.test(c) ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${t.lecture ? `<div class="lecture">Lecture — ${esc(t.lecture)}</div>` : ''}`).join('')}${
        ch.cadre.length ? `<h3>Cadre réglementaire et recherche</h3><ul>${ch.cadre.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''
      }${ch.cas.length ? `<h3>Cas emblématiques</h3><ul>${ch.cas.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}${
        ch.recommandations.length ? `<h3>Recommandations</h3><table><thead><tr><th>Réf.</th><th>Recommandation et action</th><th>Responsable</th><th>Échéance</th><th>Indicateur</th></tr></thead><tbody>${ch.recommandations.map((r) => `<tr><td><span class="ref" style="background:${h(r.priority === 'P1' ? C.risk : r.priority === 'P2' ? C.warn : C.blue)}">${esc(r.ref)} · ${r.priority}</span></td><td><b style="color:${h(C.navy)}">${esc(r.title)}</b><br>${esc(r.action)}${r.ground ? `<br><i class="meta">Fondement : ${esc(r.ground)}</i>` : ''}</td><td>${esc(r.owner)}</td><td class="num">${esc(r.due)}</td><td><i>${esc(r.kpi)}</i></td></tr>`).join('')}</tbody></table>` : ''
      }${ch.lecture ? `<div class="lecture">Lecture — ${esc(ch.lecture)}</div>` : ''}</section>`,
    )
    .join('');
  const annexes: string[] = [];
  let ax = 0;
  const A = () => String.fromCharCode(65 + ax++);
  if (d.hypotheses.length) annexes.push(`<section class="break"><h2>Annexe ${A()} — Registre des hypothèses</h2>${d.hypotheses.map((x) => `<p><b style="color:${h(C.navy)}">${esc(x.code)} — ${esc(x.title)}.</b> ${esc(x.text)}${x.param ? ` <i class="meta">[paramètre : ${esc(x.param)}]</i>` : ''}</p>`).join('')}</section>`);
  if (d.dataQuality?.items.length) annexes.push(`<section class="break"><h2>Annexe ${A()} — Qualité des données${d.dataQuality.score != null ? ` (indice global ${d.dataQuality.score}/100)` : ''}</h2><table><thead><tr><th>Source</th><th>Constat</th><th>Indice</th></tr></thead><tbody>${d.dataQuality.items.map((it) => `<tr><td>${esc(it.item)}</td><td>${esc(it.note)}</td><td class="num">${it.score ?? '—'}</td></tr>`).join('')}</tbody></table></section>`);
  if (d.method) annexes.push(`<section class="break"><h2>Annexe ${A()} — Méthode et paramètres</h2>${d.method.steps.length ? `<table><thead><tr><th>Étape</th><th>Détail</th></tr></thead><tbody>${d.method.steps.map((s) => `<tr><td>${s.n}. ${esc(s.label)}</td><td>${esc(s.detail ?? '')}</td></tr>`).join('')}</tbody></table>` : ''}<ul>${d.method.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`);
  if (d.glossary.length) annexes.push(`<section class="break"><h2>Annexe ${A()} — Glossaire</h2><table><thead><tr><th>Terme</th><th>Définition</th></tr></thead><tbody>${d.glossary.map((g) => `<tr><td><b>${esc(g.term)}</b></td><td>${esc(g.def)}</td></tr>`).join('')}</tbody></table></section>`);
  if (d.sources.length) annexes.push(`<section class="break"><h2>Annexe ${A()} — Bibliographie (${d.sources.length} sources)</h2>${d.sources.map((s) => `<p class="src"><span class="id">[${esc(s.id)}]</span> <b>${esc(s.title)}</b>${s.author ? ` — ${esc(s.author)}` : ''}${s.date ? ` — ${esc(s.date)}` : ''}${s.url ? ` — <a href="${esc(s.url)}">${esc(s.url)}</a>` : ''}<span class="les">Enseignement : ${esc(s.lesson)}${s.application ? ` · Application : ${esc(s.application)}` : ''}</span></p>`).join('')}</section>`);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title><style>${css}</style></head><body><div class="page">
<div class="band"><div><div class="kicker">${esc(d.kicker ?? `${brand} · ${d.date}`)}</div><div class="unit">${esc([d.org, d.unit].filter(Boolean).join(' · ') || brand)}</div></div><div class="badge">${esc(brand.slice(0, 18))}</div></div>
<h1>${esc(d.title)}</h1>${d.subtitle ? `<p class="sub">${esc(d.subtitle)}</p>` : ''}
<div class="kpis">${d.kpis.slice(0, 4).map(kpiTile).join('')}</div>
<div class="callout"><b>La thèse.</b> <i>${esc(d.thesis)}</i></div>
<p class="meta"><b>Émetteur :</b> ${esc(d.author ?? brand)}${d.audience ? ` · <b>Destinataires :</b> ${esc(d.audience)}` : ''}${d.dataSource ? ` · <b>Sources :</b> ${esc(d.dataSource)}` : ''} · <b>Diffusion :</b> <span style="color:${h(C.risk)};font-weight:700">${esc(d.confidentiality ?? 'Usage interne')}</span> · édité le ${esc(d.date)}</p>
<section class="break"><h2>Ce qu’il faut retenir</h2><div class="kpis">${d.kpis.slice(0, 10).map(kpiTile).join('')}</div>${d.provenance ? `<p class="meta"><i>${esc(d.provenance)}</i></p>` : ''}${d.messages.length ? `<h3>${d.messages.length} messages clés</h3><ol>${d.messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>` : ''}${d.method?.steps.length ? `<h3>Méthode</h3><table><thead><tr><th>Étape</th><th>Ce qui est fait</th></tr></thead><tbody>${d.method.steps.map((s) => `<tr><td>${s.n}. ${esc(s.label)}</td><td>${esc(s.detail ?? '')}</td></tr>`).join('')}</tbody></table>` : ''}${d.method?.research?.length ? `<h3>Ce que la recherche change dans notre lecture</h3><ul>${d.method.research.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</section>
${chapters}
<section class="break"><h2>${d.chapters.length + 1}. Plan d’actions et décisions soumises au comité</h2>${recos.length ? `<p>${recos.length} recommandations, dont ${recos.filter((r) => r.priority === 'P1').length} priorité P1.</p><table><thead><tr><th>Réf.</th><th>Recommandation</th><th>Axe</th><th>Responsable</th><th>Échéance</th><th>Indicateur</th></tr></thead><tbody>${recos.map((r) => `<tr><td><span class="ref" style="background:${h(r.priority === 'P1' ? C.risk : r.priority === 'P2' ? C.warn : C.blue)}">${esc(r.ref)} · ${r.priority}</span></td><td><b>${esc(r.title)}</b></td><td>${esc(r.axis ?? '')}</td><td>${esc(r.owner)}</td><td class="num">${esc(r.due)}</td><td><i>${esc(r.kpi)}</i></td></tr>`).join('')}</tbody></table>` : ''}${d.decisions.length ? `<h3>Décisions soumises au vote</h3>${d.decisions.map((x) => `<div class="dec"><div class="n">${esc(x.code)}</div><div>${esc(x.text)}</div><div class="vote">☐ Pour &nbsp; ☐ Contre</div></div>`).join('')}` : ''}</section>
${annexes.join('')}
<div class="foot"><span>${esc([d.unit, d.audience].filter(Boolean).join(' · ') || brand)}</span><span>${esc(brand)} · ${esc(d.date)}</span></div>
</div></body></html>`;
}

/** The colour mail: 680 px, tables and inline styles only (Outlook-safe), the essentials and the decisions. */
export function dossierMailHtml(d: Dossier, o: { brand?: string } = {}): string {
  const brand = d.org ?? o.brand ?? 'MASSAMBA Workbench';
  const F = `font-family:${esc(activeDesign().font.ui)},Segoe UI,Arial,sans-serif`;
  const tile = (k: Kpi) => `<td style="padding:0 4px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${h(C.line)};border-bottom:3px solid ${h(toneColor(k.tone))};border-radius:6px"><tr><td style="padding:8px 10px;${F};font-size:9px;color:${h(C.text2)};text-transform:uppercase;letter-spacing:.5px"><b>${esc(k.code)} · ${esc(k.label)}</b></td></tr><tr><td style="padding:0 10px 2px;font-family:Consolas,monospace;font-size:20px;font-weight:700;color:${h(C.navy)}">${esc(k.value)}</td></tr><tr><td style="padding:0 10px 8px;${F};font-size:10px;font-style:italic;color:${h(toneColor(k.tone))}">${esc(k.sub ?? '')}</td></tr></table></td>`;
  const recos = allRecos(d).filter((r) => r.priority === 'P1').slice(0, 6);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.title)}</title></head><body style="margin:0;background:#f3f4f6"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6"><tr><td align="center" style="padding:16px"><table role="presentation" cellpadding="0" cellspacing="0" width="680" style="background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:${h(C.navy)};padding:14px 20px;border-bottom:4px solid ${h(C.gold)}"><div style="${F};font-size:10px;letter-spacing:1px;color:${h(C.gold)};text-transform:uppercase"><b>${esc(d.kicker ?? brand)}</b></div><div style="${F};font-size:20px;color:#fff;font-weight:700;margin-top:4px">${esc(d.title)}</div><div style="${F};font-size:11px;color:${h(C.subtle)};margin-top:2px">${esc([d.org, d.unit].filter(Boolean).join(' · ') || brand)}${d.asOf ? ` · arrêté du ${esc(d.asOf)}` : ''}</div></td></tr>
<tr><td style="padding:16px 16px 4px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>${d.kpis.slice(0, 4).map(tile).join('')}</tr></table></td></tr>
<tr><td style="padding:10px 20px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:${h(C.ice)};border-left:5px solid ${h(C.gold)};padding:10px 12px;${F};font-size:13px;color:${h(C.text)}"><b style="color:${h(C.navy)}">La thèse.</b> <i>${esc(d.thesis)}</i></td></tr></table></td></tr>
${d.messages.length ? `<tr><td style="padding:4px 20px;${F};font-size:13px;color:${h(C.text)}"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${h(C.blue)}"><b>Messages clés</b></div><ol style="margin:6px 0 0 18px;padding:0">${d.messages.slice(0, 6).map((m) => `<li style="margin:0 0 4px">${esc(m)}</li>`).join('')}</ol></td></tr>` : ''}
${recos.length ? `<tr><td style="padding:8px 20px"><div style="${F};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${h(C.blue)}"><b>Priorités P1</b></div><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:6px;${F};font-size:12px"><tr><th align="left" style="background:${h(C.navy)};color:#fff;padding:6px 8px">Réf.</th><th align="left" style="background:${h(C.navy)};color:#fff;padding:6px 8px">Recommandation</th><th align="left" style="background:${h(C.navy)};color:#fff;padding:6px 8px">Responsable</th><th align="left" style="background:${h(C.navy)};color:#fff;padding:6px 8px">Échéance</th></tr>${recos.map((r, i) => `<tr style="background:${i % 2 ? h(C.panel) : '#fff'}"><td style="padding:6px 8px;border-bottom:1px solid ${h(C.line)}"><span style="background:${h(C.risk)};color:#fff;font-family:Consolas,monospace;font-size:10px;padding:2px 6px;border-radius:8px">${esc(r.ref)}</span></td><td style="padding:6px 8px;border-bottom:1px solid ${h(C.line)}"><b>${esc(r.title)}</b></td><td style="padding:6px 8px;border-bottom:1px solid ${h(C.line)}">${esc(r.owner)}</td><td style="padding:6px 8px;border-bottom:1px solid ${h(C.line)};font-family:Consolas,monospace">${esc(r.due)}</td></tr>`).join('')}</table></td></tr>` : ''}
${d.decisions.length ? `<tr><td style="padding:8px 20px 16px"><div style="${F};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${h(C.blue)}"><b>Décisions soumises au vote</b></div>${d.decisions.map((x) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:6px"><tr><td width="30" style="background:${h(C.risk)};color:#fff;${F};font-size:11px;font-weight:700;text-align:center;border-radius:14px;padding:5px 0">${esc(x.code)}</td><td style="padding:4px 10px;${F};font-size:12px;color:${h(C.text)}">${esc(x.text)}</td></tr></table>`).join('')}</td></tr>` : ''}
<tr><td style="background:${h(C.ice)};padding:10px 20px;${F};font-size:10px;color:${h(C.text2)}">${esc([d.unit, d.audience].filter(Boolean).join(' · ') || brand)} · ${esc(d.confidentiality ?? 'usage interne')} · édité le ${esc(d.date)} · les livrables complets (classeur, deck, rapport) sont joints.</td></tr>
</table></td></tr></table></body></html>`;
}
