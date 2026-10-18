// Côté navigateur du juge de clip : extraire le milieu et la fin du MP4, composer la planche « départ | milieu | fin »,
// la montrer à l'œil de JEV (clé de l'utilisateur, budget du jour de l'app). null quand JEV ne peut pas regarder.
import { jevSeeBlob } from '@workbench/direct/lib/jev';
import { elementsJuge, lireVerdict, type VerdictClip } from '../../coeur/videogen/jugeClip';

const HAUTEUR = 512;
const MARGE = 8;

function chercher(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((res) => {
    const fini = () => { v.removeEventListener('seeked', fini); res(); };
    v.addEventListener('seeked', fini);
    v.currentTime = t;
    setTimeout(fini, 4000); // décodeur muet : on prend l'image affichée
  });
}

/** images du milieu et de la fin du clip, en toiles. */
export async function imagesDuClip(clip: Blob): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(clip);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('clip illisible par le navigateur'));
    });
    const d = Number.isFinite(v.duration) ? v.duration : 3;
    const out: HTMLCanvasElement[] = [];
    for (const t of [d * 0.5, Math.max(0, d - 0.08)]) {
      await chercher(v, t);
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      out.push(c);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** planche horizontale : image de départ puis les images du clip, même hauteur. */
export async function planche(depart: Blob, images: HTMLCanvasElement[]): Promise<Blob> {
  const bmp = await createImageBitmap(depart);
  const panneaux: (ImageBitmap | HTMLCanvasElement)[] = [bmp, ...images];
  const largeurs = panneaux.map((p) => Math.round(HAUTEUR * (p.width / p.height)));
  const c = document.createElement('canvas');
  c.width = largeurs.reduce((a, b) => a + b, 0) + MARGE * (panneaux.length - 1);
  c.height = HAUTEUR;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  let x = 0;
  panneaux.forEach((p, i) => {
    g.drawImage(p, x, 0, largeurs[i]!, HAUTEUR);
    x += largeurs[i]! + MARGE;
  });
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('planche non produite'))), 'image/jpeg', 0.85));
}

/** JEV juge le clip : identité, mouvement demandé, absence de déformation. */
export async function jugerClip(depart: Blob, clip: Blob, mouvementEn: string): Promise<VerdictClip | null> {
  try {
    const elements = elementsJuge(mouvementEn);
    const v = await jevSeeBlob(await planche(depart, await imagesDuClip(clip)), elements);
    return v ? lireVerdict(v, elements) : null;
  } catch {
    return null;
  }
}
