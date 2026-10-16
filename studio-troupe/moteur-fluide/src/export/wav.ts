/**
 * Fichiers WAV (PCM) : écriture 16 bits stéréo et lecture des formats courants (PCM 16 / 24 / 32 bits, flottant
 * 32 bits). Code écrit pour le moteur, sans dépendance. Sert aux bruitages synthétisés (`sfx.ts`) et aux tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Signal audio stéréo en flottants dans [−1, 1]. */
export interface SignalStereo {
  frequence: number;
  gauche: Float32Array;
  droite: Float32Array;
}

/** Encode un signal stéréo en WAV PCM 16 bits (avec écrêtage doux à ±1). */
export function encoderWav(signal: SignalStereo): Buffer {
  const n = Math.min(signal.gauche.length, signal.droite.length);
  const octetsDonnees = n * 4;
  const b = Buffer.alloc(44 + octetsDonnees);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + octetsDonnees, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(2, 22); // stéréo
  b.writeUInt32LE(signal.frequence, 24);
  b.writeUInt32LE(signal.frequence * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(octetsDonnees, 40);
  const ech = (x: number): number => Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, x)) * 32767)));
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(ech(signal.gauche[i]!), 44 + 4 * i);
    b.writeInt16LE(ech(signal.droite[i]!), 46 + 4 * i);
  }
  return b;
}

/** Écrit un signal en WAV PCM 16 bits. */
export function ecrireWav(chemin: string, signal: SignalStereo): void {
  writeFileSync(chemin, encoderWav(signal));
}

/** Décode un WAV PCM (8/16/24/32 bits) ou flottant 32 bits ; les canaux au-delà de 2 sont ignorés. */
export function decoderWav(b: Buffer): SignalStereo {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('WAV : en-tête RIFF/WAVE absent');
  let i = 12;
  let format = 0;
  let canaux = 0;
  let frequence = 0;
  let bits = 0;
  let donnees: Buffer | null = null;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4);
    const taille = b.readUInt32LE(i + 4);
    const debut = i + 8;
    if (id === 'fmt ') {
      format = b.readUInt16LE(debut);
      canaux = b.readUInt16LE(debut + 2);
      frequence = b.readUInt32LE(debut + 4);
      bits = b.readUInt16LE(debut + 14);
      if (format === 0xfffe && taille >= 40) format = b.readUInt16LE(debut + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      donnees = b.subarray(debut, Math.min(b.length, debut + taille));
    }
    i = debut + taille + (taille % 2);
  }
  if (!donnees || canaux === 0) throw new Error('WAV : blocs fmt / data absents');
  const octets = bits / 8;
  const n = Math.floor(donnees.length / (octets * canaux));
  const gauche = new Float32Array(n);
  const droite = new Float32Array(n);
  const lire = (o: number): number => {
    if (format === 3 && bits === 32) return donnees!.readFloatLE(o);
    if (bits === 16) return donnees!.readInt16LE(o) / 32768;
    if (bits === 24) return donnees!.readIntLE(o, 3) / 8388608;
    if (bits === 32) return donnees!.readInt32LE(o) / 2147483648;
    if (bits === 8) return (donnees!.readUInt8(o) - 128) / 128;
    throw new Error(`WAV : ${bits} bits non pris en charge`);
  };
  for (let k = 0; k < n; k++) {
    const o = k * octets * canaux;
    gauche[k] = lire(o);
    droite[k] = canaux > 1 ? lire(o + octets) : gauche[k]!;
  }
  return { frequence, gauche, droite };
}

/** Lit un fichier WAV. */
export function lireWav(chemin: string): SignalStereo {
  return decoderWav(readFileSync(chemin));
}

/** Durée d'un signal (s). */
export function dureeSignal(s: SignalStereo): number {
  return s.gauche.length / s.frequence;
}
