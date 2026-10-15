// PASSE PHOTO RÉALISTE (15/10/2026, « personnage irréel, voitures irréelles, manque de réalisme »). Des primitives 3D ne
// deviennent jamais des photos : le moteur de scène garde ce qu'il fait bien (composition, perspective, circulation,
// foule, lumière, mouvement continu) et un modèle d'ÉDITION d'image transforme son rendu en photographie — mêmes
// places, mêmes voitures, mêmes passants, mais matières, visages et carrosseries réels. Puis, si on le demande, la photo
// sert d'image de départ à un modèle image → vidéo (Wan 2.2 Fast ≈ 0,01 $/s, Grok Imagine…).
// Appels directs depuis le navigateur avec la clé Pollinations de l'utilisateur (gardée dans ce navigateur, jamais dans
// un prompt ni un fichier). Seule l'image RENDUE par le moteur part chez le fournisseur.
import type { SceneSpec } from '../../../server/jev/realize/sceneKit';
import { pollinationsKey, pollinationsUpload } from './cheapVideo';

/**
 * Modèles d'édition d'image (entrée texte + image) du catalogue Pollinations, prix par image en pollen (≈ USD) lus dans
 * GET /image/models le 15/10/2026. Aucune note de qualité inventée : à juger sur nos propres rendus (œil de JEV).
 */
export const PHOTO_MODELS: { id: string; name: string; pollen: number }[] = [
  { id: 'black-forest-labs/flux.1-kontext-pro', name: 'FLUX.1 Kontext Pro — modèle conçu pour l’édition (≈ 0,03 / image)', pollen: 0.03 },
  { id: 'bytedance/seedream-5.0-flash', name: 'Seedream 5.0 Flash (≈ 0,019 / image)', pollen: 0.019 },
  { id: 'x-ai/grok-imagine-image', name: 'Grok Imagine Image (≈ 0,022 / image)', pollen: 0.022 },
  { id: 'prunaai/p-image-edit', name: 'P-Image Edit (≈ 0,01 / image)', pollen: 0.01 },
  { id: 'black-forest-labs/flux.2-klein-4b', name: 'FLUX.2 klein 4B (≈ 0,005 / image)', pollen: 0.005 },
];
export const DEFAULT_PHOTO_MODEL = PHOTO_MODELS[0]!.id;

const THEME_SKIN: Record<SceneSpec['theme'], string> = {
  street:
    'a real, busy street of a West African city photographed for real: real cars, yellow taxis and minibuses with correct proportions, glossy paint, tinted glass, rubber tyres and chrome; motorbikes with real riders; real African men, women and children with natural faces, skin and hair, wearing wax-print outfits, boubous and modern clothes; street vendors; plastered concrete buildings with sun-faded paint, stains, balconies, air-conditioning units and overhead power cables; real palm trees; asphalt with patches and potholes; dust in the low sun',
  nature:
    'a real landscape photograph: weathered stone walls and towers, real timber and clay-tile houses, ploughed fields and hedges, a real river with reflections, forests of real trees, distant mountains in atmospheric haze',
  scifi:
    'a real night photograph of a futuristic megacity: glass and steel towers with real reflections, wet asphalt, neon light spill, light rain, atmospheric haze, believable vehicles',
  planet:
    'a real orbital photograph of an Earth-like planet as taken from a spacecraft: real cloud systems, ocean sunglint, thin blue atmosphere limb, night-side city lights',
  coastal:
    'a real photograph of a modern African coastal metropolis: glass towers, port cranes and ships, real sea with waves and reflections, palm-lined avenues, real traffic and people',
  forest:
    'a real photograph of an ancient forest at sunrise: gigantic real tree trunks with bark and moss, ferns, a real stream, volumetric god rays through morning mist',
  mars:
    'a real photograph of a colony on Mars: real red regolith and rocks, pressurised glass domes, solar panel fields, rovers with dusty tyres, a launch pad, thin dusty atmosphere',
};
const TIME_LIGHT: Record<string, string> = {
  day: 'bright natural daylight',
  sunset: 'warm low late-afternoon sun with long soft shadows',
  dawn: 'soft cool dawn light',
  night: 'night lighting from street lamps, windows and signs',
};

/**
 * The edit instruction: keep the engine's composition exactly, replace every CGI surface with photographic reality.
 * English (what these models follow best); the scene is described from the SceneSpec, never with client data.
 */
export function photorealPrompt(spec: SceneSpec | null, userPrompt: string): string {
  const skin = spec ? THEME_SKIN[spec.theme] : 'a real-world photograph of the same scene';
  const light = spec ? (TIME_LIGHT[spec.time] ?? 'natural light') : 'natural light';
  const ctx = userPrompt.replace(/\s+/g, ' ').trim().slice(0, 320);
  return [
    'Turn this 3D render into a REAL PHOTOGRAPH.',
    'Keep exactly the same composition, camera position, perspective, horizon and layout: every building, vehicle, tree and person stays at the same place, size and pose.',
    `Make it ${skin}.`,
    `Lighting: ${light}, physically correct shadows and reflections. Shot on a full-frame camera with a 35 mm lens, deep focus, fine natural grain.`,
    'Strictly no cartoon, no CGI or 3D-render look, no plastic, no toy or miniature look, no tilt-shift blur, no real brand logos, no watermark, no garbled text.',
    ctx ? `Scene notes: ${ctx}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Motion prompt for animating the photo (image → video): what moves, how the camera moves, what must not happen. */
export function photoMotionPrompt(spec: SceneSpec | null): string {
  const what: Record<SceneSpec['theme'], string> = {
    street: 'cars, taxis and minibuses drive slowly through the traffic, motorbikes weave between lanes, pedestrians walk naturally on the sidewalks, vendors call customers, palm fronds sway in the breeze',
    nature: 'clouds drift, the river flows, wheat and trees sway in the wind, banners flutter, birds fly over the town',
    scifi: 'flying vehicles glide between the towers, rain falls, holograms flicker, steam rises',
    planet: 'the planet slowly rotates, clouds drift, the camera descends toward the surface',
    coastal: 'waves roll in, ships and cranes move slowly in the port, traffic flows on the avenues, palms sway',
    forest: 'mist drifts between the trunks, light rays shimmer, leaves move in a light breeze, the stream flows',
    mars: 'dust blows over the regolith, rovers drive slowly, a rocket vents steam on the pad',
  };
  return `${spec ? what[spec.theme] : 'natural ambient motion'}; slow cinematic camera push-in; photorealistic, stable architecture, no morphing, no flicker, no new objects.`;
}

/** Photographic version of an engine frame. Throws a clear error without a key; returns the image and its cost. */
export async function photoPass(
  frame: Blob,
  prompt: string,
  opts: { model?: string; width?: number; height?: number; seed?: number; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; usd: number; model: string }> {
  const key = pollinationsKey();
  const model = PHOTO_MODELS.find((m) => m.id === opts.model) ?? PHOTO_MODELS[0]!;
  const ref = await pollinationsUpload(frame, key, opts.signal);
  const q = new URLSearchParams({
    model: model.id,
    image: ref,
    width: String(opts.width ?? 1280),
    height: String(opts.height ?? 720),
    seed: String(opts.seed ?? 7),
  });
  const r = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 1800))}?${q}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: opts.signal,
  });
  if (!r.ok) throw new Error(`Pollinations (photo) : HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const blob = await r.blob();
  if (!/^image\//.test(blob.type) && blob.size < 10_000) throw new Error('Pollinations : la réponse n’est pas une image');
  return { blob, usd: model.pollen, model: model.id };
}
