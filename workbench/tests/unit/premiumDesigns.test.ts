import { describe, expect, it } from 'vitest';
import { PREMIUM_DESIGNS, applyWebTheme, designThumbnail, kindForTool, thumbnailDataUrl, webThemeCss } from '../../server/services/premiumDesigns';
import { designSignature, DESIGN_LOCK, THEMES } from '../../server/services/houseDesign';

describe('premium design gallery', () => {
  it('14 designs, every one has a theme; the house charter stays intact', () => {
    expect(PREMIUM_DESIGNS).toHaveLength(14);
    for (const d of PREMIUM_DESIGNS) expect(THEMES[d.id]).toBeTruthy();
    expect(designSignature()).toBe(DESIGN_LOCK);
  });
  it('thumbnails are valid SVG drawn from the design tokens, for every deliverable kind', () => {
    for (const k of ['excel', 'document', 'slides', 'web'] as const) {
      const svg = designThumbnail('onyx', k);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('#0B0B0F'); // onyx navy
    }
    expect(designThumbnail('house', 'excel')).toContain('#001B4D');
    expect(thumbnailDataUrl('swiss', 'web')).toMatch(/^data:image\/svg\+xml/);
  });
  it('sites and apps get the premium stylesheet once', () => {
    expect(webThemeCss('emerald')).toContain('--brand:#047857');
    const once = applyWebTheme('<html><head><title>x</title></head><body></body></html>', 'emerald');
    expect(once.match(/data-premium-theme/g)).toHaveLength(1);
    expect(applyWebTheme(once, 'onyx').match(/data-premium-theme/g)).toHaveLength(1);
  });
  it('which deliverable a tool call produces', () => {
    expect(kindForTool('data.export', {})).toBe('excel');
    expect(kindForTool('report.export', { formats: ['pptx'] })).toBe('slides');
    expect(kindForTool('report.export', { formats: ['docx', 'pdf'] })).toBe('document');
    expect(kindForTool('artifact.create', { type: 'html' })).toBe('web');
    expect(kindForTool('artifact.create', { type: 'markdown' })).toBeNull();
  });
});
