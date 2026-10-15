// BACKGROUND THREAD for the heavy, pure computations (workbook export, live dashboard, restyle): the page keeps
// rendering while they run — two chats exporting at the same time no longer freeze the interface.
import { houseXlsx } from '../../server/services/houseStyle';
import { setActiveTheme, type Design } from '../../server/services/houseDesign';
import { addLiveDashboard } from '../../server/services/liveDash';
import { restyleWorkbook } from '../../server/services/officeRestyle';
import { maisonBand, refreshSommaire } from '../../server/services/maisonBand';
import { designQA } from '../../server/services/designQA';
import { addImageSheet } from '../../server/services/officeLogo';
import { dossierXlsx } from '../../server/services/dossier/dossierXlsx';

// The committee workbook too (5 000 rows froze the page ≈ 1 s on the page thread).
const FNS = { houseXlsx, addLiveDashboard, restyleWorkbook, maisonBand, refreshSommaire, designQA, addImageSheet, dossierXlsx } as const;
export type HeavyFn = keyof typeof FNS;

self.onmessage = (e: MessageEvent<{ id: number; fn: HeavyFn; args: unknown[]; theme?: Design }>) => {
  const { id, fn, args, theme } = e.data;
  try {
    // The page's ACTIVE design (chosen model, image colours…): the exporters read it — the same here as on the page.
    if (theme) setActiveTheme(theme);
    const r = (FNS[fn] as (...a: unknown[]) => unknown)(...args);
    const x = r as { bytes?: unknown; data?: unknown } | null;
    const bytes = r instanceof Uint8Array ? r : x?.bytes instanceof Uint8Array ? x.bytes : x?.data;
    (self as unknown as Worker).postMessage({ id, r }, bytes instanceof Uint8Array ? [bytes.buffer] : []);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message ?? String(err) });
  }
};
