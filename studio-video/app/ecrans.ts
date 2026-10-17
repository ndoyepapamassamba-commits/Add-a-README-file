// Les écrans de Studio Vidéo, dans l'ordre de la navigation.
export type Ecran = 'film' | 'videogen' | 'realize' | 'lab3d' | 'troupe' | 'reglages';
export const ECRANS: { id: Ecran; label: string; aide: string }[] = [
  { id: 'film', label: 'Film Autopilot', aide: 'Une idée → histoire, scènes, images, animation, montage : le studio de film IA complet.' },
  { id: 'videogen', label: 'Vidéo IA', aide: 'Vidéo → scène 3D, idée → plan → MP4, image → profondeur → animation ; décors de la troupe.' },
  { id: 'realize', label: 'Réalisation', aide: 'Bac à sable : tout prompt devient une réalisation exécutée, corrigée et filmée.' },
  { id: 'lab3d', label: 'Studio 3D', aide: 'Bac à sable three.js : physique, shaders, export GLB, génération IA corrigée, pont Blender.' },
  { id: 'troupe', label: 'Moteur de la troupe', aide: 'La chaîne Python des films de la troupe et ses carnets GPU gratuits.' },
  { id: 'reglages', label: 'Réglages', aide: 'Clés OpenRouter et JEV, clés des moteurs vidéo, pont Blender local.' },
];
