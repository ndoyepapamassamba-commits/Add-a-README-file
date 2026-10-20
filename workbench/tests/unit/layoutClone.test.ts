import { describe, expect, it } from 'vitest';
import { dashboardData, excelChart, layoutTheme, parseLayout, renderLayoutHtml } from '../../server/services/layoutClone';

const ANSWER = `Voici : {"dark":true,"navigation":"sidebar","header":"minimal","kpis":{"count":3,"style":"tile"},"charts":[{"type":"donut","span":1},{"type":"area","span":2}],"table":{"style":"lined","position":"bottom"},"columns":3,"radius":18,"shadow":true,"palette":{"bg":"#0B1020","surface":"#141B2D","primary":"#7C3AED","accent":"#22D3EE","text":"#E5E7EB","muted":"#94A3B8","series":["#7C3AED","#22D3EE","#F59E0B"]},"font":"Poppins"}`;
const rows = [
  { agence: 'Dakar', montant: 1250, clients: 40 },
  { agence: 'Thies', montant: 430, clients: 12 },
  { agence: 'Dakar', montant: 300, clients: 5 },
];
describe('layout reproduction', () => {
  it('reads the layout of a design image and validates it', () => {
    const l = parseLayout(ANSWER)!;
    expect(l).toMatchObject({ dark: true, navigation: 'sidebar', kpis: { count: 3, style: 'tile' }, columns: 3, radius: 18, font: 'Poppins' });
    expect(l.charts.map((c) => c.type)).toEqual(['donut', 'area']);
    expect(parseLayout('pas de json')).toBeNull();
    const bad = parseLayout('{"columns":99,"radius":"x","palette":{"primary":"red"},"charts":[{"type":"3d"}]}')!;
    expect(bad.columns).toBe(4);
    expect(bad.radius).toBe(12);
    expect(bad.palette.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(bad.charts[0]!.type).toBe('bar');
  });
  it('fills the layout with the exact processed figures', () => {
    const d = dashboardData('Ventes', ['agence', 'montant', 'clients'], rows, 3);
    expect(d.kpis[0]).toEqual({ label: 'Lignes', value: '3' });
    expect(d.kpis.find((k) => k.label === 'Total montant')!.value).toBe('1 980');
    expect(d.categories).toEqual(['Dakar', 'Thies']);
    expect(d.series[0]).toEqual({ name: 'montant', values: [1550, 430] });
  });
  it('renders a self-contained dashboard reproducing the layout, with the data and no source text', () => {
    const l = parseLayout(ANSWER)!;
    const html = renderLayoutHtml(l, dashboardData('Ventes par agence', ['agence', 'montant', 'clients'], rows, 3), 'example.com');
    expect(html).toContain('<aside class="side">');
    expect(html).toContain('--primary:#7C3AED');
    expect(html).toContain('kpi tile');
    expect(html).toContain('1 980');
    expect(html).toContain('<circle cx="180" cy="130" r="58"'); // donut
    expect(html).toContain('polygon'); // area
    expect(html).toContain('table class="lined"');
    expect(html).toContain('Poppins');
    expect(excelChart(l)).toBe('pie');
    expect(layoutTheme(l).primary).toBe('#7C3AED');
  });
});
