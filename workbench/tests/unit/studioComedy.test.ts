import { describe, expect, it } from 'vitest';
import { singleMoment, compileScene } from '../../server/jev/studio/genome';
import { comicDirection, humorBrief } from '../../server/jev/studio/humor';
import { breathing, talkWarp } from '../../server/jev/studio/motion';
import { detectPanels } from '../../server/jev/studio/panels';
import { STYLE_2D_HQ } from '../../server/jev/studio/style';

/** A synthetic picture: busy noise, optionally cut by a white gutter (comic page). */
function picture(w: number, h: number, gutter: 'none' | 'row' | 'col') {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = 7;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = 40 + (s % 160);
    px.set([v, (v * 3) % 255, (v * 7) % 255, 255], i * 4);
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((gutter === 'row' && Math.abs(y - h / 2) < 4) || (gutter === 'col' && Math.abs(x - w / 2) < 4)) px.set([255, 255, 255, 255], (y * w + x) * 4);
    }
  return px;
}

describe('the image generator draws ONE shot, never a comic page', () => {
  it('a gutter across the picture is detected; a single shot is not', () => {
    expect(detectPanels(picture(200, 360, 'row'), 200, 360).multiPanel).toBe(true);
    expect(detectPanels(picture(200, 360, 'col'), 200, 360).multiPanel).toBe(true);
    expect(detectPanels(picture(200, 360, 'none'), 200, 360).multiPanel).toBe(false);
  });
  it('a beat written as a sequence keeps its first moment; the prompt forbids panels and locks the place', () => {
    expect(singleMoment('Moussa entre dans le bureau, puis il renverse le café, puis le chef arrive')).toBe('Moussa entre dans le bureau');
    const sc = { scene_id: 's1', act: 1, beat: 'hook', duration: 4, location: 'Bureau', time: 'jour', characters: [], action: 'Moussa entre, puis il tombe', emotion: 'surprise', camera: 'plan large', lighting: '', sound: '', music: '', transition: 'cut', dialogue: [] } as never;
    const c = compileScene(sc, { style: STYLE_2D_HQ, characters: [], worlds: [] }, 'image', { maxChars: 4000 });
    expect(c.text).toMatch(/ONE single full-frame shot/);
    expect(c.text).toMatch(/comic panels/);
    expect(c.text).toMatch(/every prop belongs to this place/);
  });
});

describe('prompteur rigolo Afrikatoon and talking characters', () => {
  it('the screenwriter gets comic devices, wolof interjections and one-moment actions', () => {
    const b = humorBrief(3);
    expect(b).toMatch(/PROMPTEUR RIGOLO/);
    expect(b).toMatch(/Waaw/);
    expect(b).toMatch(/UN SEUL moment visuel/);
    expect(comicDirection('chute', 'stupeur', 1)).toMatch(/punchline/);
  });
  it('the speaker moves with the voice; silence = no talking deformation', () => {
    const loud = talkWarp(-1, 1, 0.37);
    const silent = talkWarp(-1, 0, 0.37);
    expect(loud.zone.x).toBeLessThan(0.1);
    expect(loud.scaleY).toBeGreaterThan(1);
    expect(silent.scaleY).toBe(1);
    expect(breathing(0.75)).not.toBe(1);
  });
});
