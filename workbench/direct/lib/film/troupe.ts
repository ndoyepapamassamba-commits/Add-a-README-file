// The new troupe's scenes for the film circuit: each scene image already holds the exact characters in their set
// (moteur V1 library, prep/<scene>/image.png + scene.json). They travel in a separate file next to the app,
// massamba-troupe-film.js (built by scripts/troupe_film_pack.py, never committed: the repository is public), so the
// app stays light and the troupe can be updated without rebuilding it. Any other image can be imported instead.

export interface TroupeScene {
  id: string;
  titre: string;
  acteurs: string[];
  /** JPEG data URL of the scene with its characters. */
  image: string;
}
export interface TroupePack {
  version: string;
  scenes: TroupeScene[];
}

declare global {
  interface Window {
    MASSAMBA_TROUPE_FILM?: TroupePack;
  }
}

export const PACK_FILE = 'massamba-troupe-film.js';

let loading: Promise<TroupePack | null> | null = null;
/** Loads the pack placed next to the app (a script tag: works from a file opened on disk). */
export function loadTroupePack(): Promise<TroupePack | null> {
  if (window.MASSAMBA_TROUPE_FILM) return Promise.resolve(window.MASSAMBA_TROUPE_FILM);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = PACK_FILE;
    s.async = true;
    s.onload = () => resolve(window.MASSAMBA_TROUPE_FILM ?? null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** An imported image becomes a scene; names are typed by the user (« KOFFI, COUMBA »). */
export function importedScene(dataUrl: string, nom: string, acteurs: string): TroupeScene {
  return {
    id: `import-${Date.now()}`,
    titre: nom.trim() || 'Scène importée',
    acteurs: acteurs
      .split(/[,;\n]/)
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean),
    image: dataUrl,
  };
}
