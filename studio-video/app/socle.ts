// Chargé AVANT tout le reste (premier import de main.tsx) : Studio Vidéo a sa propre base dans le navigateur, distincte
// de celle de Workbench — les deux applications n'écrivent jamais l'une chez l'autre.
(globalThis as { __MASSAMBA_DB__?: string }).__MASSAMBA_DB__ = 'massamba-studio-video';
export {};
