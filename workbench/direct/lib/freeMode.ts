// Préférences des modèles gratuits sans clé (v63), gardées dans ce navigateur : démarrer sans clé, modèle intégré au
// navigateur, et l'accord explicite pour envoyer des données personnelles aux services gratuits en ligne (refusé par
// défaut : seul le modèle intégré les traite).
import type { BrowserModel } from '../../server/llm/freeRoute';

export interface FreeOptions {
  /** The app was opened without an OpenRouter key (free models only). */
  started: boolean;
  /** The in-browser model used to close the free chain (null = not enabled). */
  browser: BrowserModel | null;
  /** The user explicitly allows the free online services on conversations carrying their data. */
  allowCloudOnPrivate: boolean;
}
const KEY = 'wbd.free.v1';
const DEFAULTS: FreeOptions = { started: false, browser: null, allowCloudOnPrivate: false };
export function freeOptions(): FreeOptions {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<FreeOptions>) };
  } catch {
    return { ...DEFAULTS };
  }
}
export function setFreeOptions(p: Partial<FreeOptions>): FreeOptions {
  const next = { ...freeOptions(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: kept for this page only */
  }
  return next;
}
