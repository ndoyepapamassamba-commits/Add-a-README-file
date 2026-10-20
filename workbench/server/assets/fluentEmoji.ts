// Microsoft Fluent Emoji 3D (MIT) — lookup helpers over the generated pack (fluentEmoji3d.ts).
import { FLUENT_3D_PNG } from './fluentEmoji3d';

/** The emoji without its variation selector (« ⚠️ » and « ⚠ » are the same key). */
export const emojiKey = (e: string) => e.replace(/️/g, '').trim();
/** Base64 PNG (64 px) of a Fluent 3D emoji, or null when the pack does not have it. */
export function fluentB64(e: string): string | null {
  return FLUENT_3D_PNG[emojiKey(e)] ?? null;
}
/** PNG bytes of a Fluent 3D emoji (Office pictures), or null. */
export function fluentPng(e: string): Uint8Array | null {
  const b = fluentB64(e);
  if (!b) return null;
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** data: URL (app buttons, HTML exports), or null. */
export const fluentDataUrl = (e: string) => {
  const b = fluentB64(e);
  return b ? `data:image/png;base64,${b}` : null;
};
export const FLUENT_EMOJIS = Object.keys(FLUENT_3D_PNG);
/** Office relationship id of an emoji picture (« rIdE_1f6e1 »): the packer finds it in the XML and adds rel + media. */
export const emojiRelId = (e: string) =>
  `rIdE_${[...emojiKey(e)].map((ch) => ch.codePointAt(0)!.toString(16)).join('_')}`;
/** The emoji back from its relationship id. */
export const emojiOfRelId = (id: string) =>
  id
    .slice(5)
    .split('_')
    .map((h) => String.fromCodePoint(parseInt(h, 16)))
    .join('');
/** Relationships (and media files, once per package) of the emoji pictures an Office part uses. */
export function emojiRelsFor(
  xml: string,
  files: Record<string, Uint8Array>,
  mediaDir: string,
  relTarget = '../media',
): string {
  const ids = [...new Set([...xml.matchAll(/r:embed="(rIdE_[0-9a-f_]+)"/g)].map((m) => m[1]!))];
  return ids
    .map((id) => {
      const file = `emoji-${id.slice(5)}.png`;
      if (!files[`${mediaDir}/${file}`]) {
        const png = fluentPng(emojiOfRelId(id));
        if (!png) return '';
        files[`${mediaDir}/${file}`] = png;
      }
      return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relTarget}/${file}"/>`;
    })
    .join('');
}
