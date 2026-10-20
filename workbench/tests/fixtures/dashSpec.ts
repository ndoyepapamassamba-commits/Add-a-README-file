import type { DashSpec, Panel } from '../../server/services/dashClone';

/** A dashboard as measured from an image: KPI row with coloured tiles, charts of every kind, a table and a text. */
const panel = (kind: Panel['kind'], box: Panel['box'], extra: Partial<Panel> = {}): Panel => ({
  box, kind, tiles: 1, titleAlign: 'left', valueLabels: true, legend: 'right',
  fill: '#FFFFFF', border: '#E2E8F0', borderWidth: 1, radius: 10, colors: ['#7C3AED', '#22D3EE'], ramp: ['#4C1D95', '#C4B5FD'], text: '#1F2937', sequential: false, ...extra,
});
export const SPEC: DashSpec = {
  version: 1, aspect: 16 / 9, outer: '#0B1020', frame: { color: '#1E293B', width: 0.01, radius: 0.01 }, page: '#F8FAFC',
  pageBox: { x: 0.01, y: 0.01, w: 0.98, h: 0.98 }, title: { box: { x: 0.03, y: 0.02, w: 0.6, h: 0.07 }, color: '#0F172A', align: 'left', fill: null },
  panels: [
    panel('kpi', { x: 0.03, y: 0.11, w: 0.94, h: 0.14 }, { tiles: 4, tileFills: ['#7C3AED', '#22D3EE', '#F59E0B', '#10B981'] }),
    panel('bar', { x: 0.03, y: 0.28, w: 0.45, h: 0.32 }, { sequential: true }),
    panel('donut', { x: 0.52, y: 0.28, w: 0.45, h: 0.32 }),
    panel('line', { x: 0.03, y: 0.63, w: 0.3, h: 0.25 }),
    panel('hbar', { x: 0.35, y: 0.63, w: 0.3, h: 0.34 }),
    panel('table', { x: 0.67, y: 0.63, w: 0.3, h: 0.34 }),
    panel('text', { x: 0.03, y: 0.9, w: 0.2, h: 0.06 }),
  ],
  font: 'Poppins', palette: { primary: '#7C3AED', accent: '#22D3EE', dark: '#0F172A', series: ['#7C3AED', '#22D3EE'] },
};
