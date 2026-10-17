// SON D'ORIGINE COPIÉ AU BIT PRÈS — mp4box.js (BSD-3-Clause) lit la piste AAC d'un MP4 (échantillons + configuration
// du décodeur) ; mp4-muxer (MIT) les réécrit tels quels dans le MP4 exporté (addAudioChunkRaw). Aucun réencodage,
// aucune perte, et pas besoin d'encodeur AAC dans le navigateur (absent de Chrome sous Linux). Fonctionne dans le
// navigateur comme dans Node (outil en ligne de commande).
import { createFile, MP4BoxBuffer } from 'mp4box';

export interface AacTrack {
  codec: string; // e.g. mp4a.40.2
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig (decoder description). */
  description: Uint8Array;
  /** All samples back to back, and per sample: [byte size, timestamp µs, duration µs]. */
  data: Uint8Array;
  table: [number, number, number][];
}

/** The AAC track of an MP4 file (null when the file is not an MP4 or has no AAC sound). */
export function extractAac(buf: ArrayBuffer): Promise<AacTrack | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: AacTrack | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const f = createFile();
      f.onError = () => finish(null);
      f.onReady = (info) => {
        const a = info.audioTracks.find((t) => /^mp4a\.40\./.test(t.codec));
        if (!a) return finish(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trak: any = f.getTrackById(a.id);
        const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
        // ES descriptor → DecoderConfigDescriptor (tag 4) → DecoderSpecificInfo (tag 5) = AudioSpecificConfig.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dcd = entry?.esds?.esd?.descs?.find((d: any) => d.tag === 4);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dsi = dcd?.descs?.find((d: any) => d.tag === 5);
        if (!dsi?.data) return finish(null);
        const parts: Uint8Array[] = [];
        const table: [number, number, number][] = [];
        let size = 0;
        f.onSamples = (_id, _user, samples) => {
          for (const s of samples) {
            if (!s.data) continue;
            parts.push(s.data);
            size += s.data.length;
            table.push([s.data.length, Math.round((s.cts * 1e6) / s.timescale), Math.round((s.duration * 1e6) / s.timescale)]);
          }
          if (table.length >= a.nb_samples) {
            const data = new Uint8Array(size);
            let off = 0;
            for (const p of parts) {
              data.set(p, off);
              off += p.length;
            }
            finish({ codec: a.codec, sampleRate: a.audio?.sample_rate ?? 44100, channels: a.audio?.channel_count ?? 2, description: new Uint8Array(dsi.data), data, table });
          }
        };
        f.setExtractionOptions(a.id, null, { nbSamples: a.nb_samples });
        f.start();
        f.flush();
      };
      f.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf, 0));
      f.flush();
      // Not an MP4 (onReady never fires): give up quickly.
      setTimeout(() => finish(null), 3000);
    } catch {
      finish(null);
    }
  });
}

/** The samples to copy for a video of `seconds` (those starting before its end, with 50 ms of tolerance so that the
 *  last packet of a sound as long as the picture is kept). */
export function aacUntil(t: AacTrack, seconds: number): number {
  const end = seconds * 1e6 + 50_000;
  let n = 0;
  while (n < t.table.length && t.table[n]![1] < end) n++;
  return n;
}
