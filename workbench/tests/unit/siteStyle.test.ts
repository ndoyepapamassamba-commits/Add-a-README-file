// A REAL website reproduced from its own code: exact colours, fonts, radius, shadows, tokens, navigation.
import { describe, expect, it } from 'vitest';
import { extractSiteTokens, parseColor, siteLayout, stylesheetUrls } from '../../server/services/siteStyle';
import { layoutTheme, renderLayoutHtml, dashboardData } from '../../server/services/layoutClone';

const HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="https://cdn.site.com/theme.css">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap" rel="stylesheet">
<style>.hero{background:#0E7C66;color:#fff}</style></head>
<body><aside class="sidebar">menu</aside><main>content</main></body></html>`;
const CSS = `:root{--color-primary:#0E7C66;--color-accent:#F2994A;--bg:#F7F9F8;--text:#13231F;--radius:14px}
body{background:var(--bg);color:var(--text);font-family:Manrope,system-ui,sans-serif}
h1,h2{font-family:"Playfair Display",Georgia,serif;color:#13231F}
.btn-primary{background:var(--color-primary);color:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.card{background:#FFFFFF;border:1px solid #E3E8E6;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.panel{border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08)}
a{color:var(--color-accent)}
.muted{color:#6B7C77}
@media (min-width:800px){.grid{background:#FFFFFF}}`;

describe('site style extraction', () => {
  it('stylesheet URLs are absolute, de-duplicated, Google Fonts excluded', () => {
    expect(stylesheetUrls(HTML, 'https://www.site.com/fr/')).toEqual(['https://www.site.com/assets/app.css', 'https://cdn.site.com/theme.css']);
  });
  it('colours, fonts, radius, shadows, tokens and navigation come from the code', () => {
    const t = extractSiteTokens(HTML, [CSS]);
    expect(t.bg).toBe('#F7F9F8');
    expect(t.text).toBe('#13231F');
    expect(t.primary).toBe('#0E7C66');
    expect(t.accent).toBe('#F2994A');
    expect(t.muted).toBe('#6B7C77');
    expect(t.border).toBe('#E3E8E6');
    expect(t.dark).toBe(false);
    expect(t.font).toBe('Manrope');
    expect(t.headingFont).toBe('Playfair Display');
    expect(t.fontHref).toContain('family=Manrope');
    expect(t.radius).toBe(14);
    expect(t.shadow).toBe(true);
    expect(t.navigation).toBe('sidebar');
    expect(t.cssVars['--color-primary']).toBe('#0E7C66');
    expect(Object.keys(t.cssVars)[0]).toBe('--color-primary');
  });
  it('a dark site is detected; transparent colours are ignored', () => {
    const t = extractSiteTokens('<html><body></body></html>', ['body{background:#0B0D12;color:#E6E8EE}.btn{background:#7C5CFF}.x{background:rgba(255,0,0,.1)}']);
    expect(t.dark).toBe(true);
    expect(t.primary).toBe('#7C5CFF');
    expect(parseColor('rgba(255,0,0,.1)')).toBeNull();
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
  });
  it('the reproduction uses the exact palette and web font; Office gets an installed font', () => {
    const t = extractSiteTokens(HTML, [CSS]);
    const l = siteLayout(t, null);
    const html = renderLayoutHtml(l, dashboardData('Ventes', ['agence', 'montant'], [{ agence: 'Dakar', montant: 1250 }], 3));
    expect(html).toContain('#0E7C66');
    expect(html).toContain('fonts.googleapis.com/css2?family=Manrope');
    expect(html).toContain('Manrope');
    expect(html).toContain('1 250');
    expect(layoutTheme(l).font).toBe('Segoe UI');
    expect(layoutTheme(l).primary).toBe('#0E7C66');
  });
});
