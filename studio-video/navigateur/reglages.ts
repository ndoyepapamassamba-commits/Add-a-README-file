// RÉGLAGES PROPRES À LA VIDÉO (clés des moteurs vidéo, pont Blender) — ils étaient dans les réglages de Workbench jusqu'au
// 16/10/2026 ; Workbench n'en a plus besoin. Gardés dans ce navigateur seulement (stockage local), jamais envoyés ailleurs
// qu'au service concerné. Les anciennes valeurs sont reprises une fois depuis Workbench (app/reprise.ts).
import { create } from 'zustand';

export interface ReglagesVideo {
  /** Clé Pollinations (≈ 0,05 $ le plan de 5 s, Wan 2.2 Fast image → vidéo). */
  pollinationsKey?: string;
  /** Jeton Hugging Face (Space gratuit « Wan 2.2 14B Fast » dans la limite du quota ZeroGPU du compte). */
  hfToken?: string;
  /** Clé fal.ai (acteur 3D → personnage, Wan2.2-Animate). */
  falKey?: string;
  /** Pont Blender local (blender/blender-bridge.py sur la machine de l'utilisateur), défaut http://127.0.0.1:8765. */
  blenderBridgeUrl?: string;
  /** Jeton du pont Blender (s'il a été démarré avec --token). */
  blenderBridgeToken?: string;
}
export const CHAMPS: (keyof ReglagesVideo)[] = ['pollinationsKey', 'hfToken', 'falKey', 'blenderBridgeUrl', 'blenderBridgeToken'];
const CLE = 'sv.reglages';

function lire(): ReglagesVideo {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) ?? '{}') as ReglagesVideo;
    return Object.fromEntries(CHAMPS.filter((k) => typeof v[k] === 'string').map((k) => [k, v[k]])) as ReglagesVideo;
  } catch {
    return {}; // pas de stockage (fenêtre privée, tests) : réglages vides
  }
}

export const useReglages = create<ReglagesVideo & { patch: (p: Partial<ReglagesVideo>) => void }>((set, get) => ({
  ...lire(),
  patch: (p) => {
    set(p);
    const s = get();
    try {
      localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(CHAMPS.map((k) => [k, s[k] ?? '']))));
    } catch {
      /* stockage indisponible : le réglage vaut pour l'onglet */
    }
  },
}));

/** Lecture hors composant React. */
export const reglages = (): ReglagesVideo => useReglages.getState();
