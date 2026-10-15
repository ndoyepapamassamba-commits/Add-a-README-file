// Bibliothèques embarquées dans la page HTML 3D autonome (texte brut, encodé en base64 au moment de l'export) :
// three.js (MIT) et mp4-muxer (MIT). Importées en texte par Vite (?raw), donc présentes même hors ligne.
// Chemins de fichiers (le champ « exports » des paquets interdit ces sous-chemins par nom de paquet).
import threeCore from '../../../node_modules/three/build/three.core.js?raw';
import threeModule from '../../../node_modules/three/build/three.module.js?raw';
import muxer from '../../../node_modules/mp4-muxer/build/mp4-muxer.mjs?raw';

/** UTF-8 text → base64 (by chunks: the libraries weigh a few MB). */
export function textB64(s: string): string {
  return bytesB64(new TextEncoder().encode(s));
}
export function bytesB64(u: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function pageLibs(): { threeCoreB64: string; threeB64: string; muxerB64: string } {
  return { threeCoreB64: textB64(threeCore), threeB64: textB64(threeModule), muxerB64: textB64(muxer) };
}
