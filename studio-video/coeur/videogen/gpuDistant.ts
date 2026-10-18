// GPU DISTANT GRATUIT (17/10/2026) — idée de l'utilisateur : « simuler une machine locale, mais utiliser un vrai GPU
// distant : quand on clique sur « Animer mon image », l'application transmet l'image et la consigne à un serveur qui
// exécute un modèle vidéo sur un véritable GPU ». Consigne : rien de payant.
// L'appel part DU NAVIGATEUR de l'utilisateur vers un Space Hugging Face ZeroGPU (Wan 2.2 14B Fast : Wan-AI Apache-2.0
// + LoRA Lightx2v) : c'est son quota du jour (2 min sans compte, 5 min avec un compte gratuit, docs ZeroGPU 17/10/2026).
// Mesures du 17/10 :
//   · CORS ouvert à toute origine, y compris une page ouverte en fichier local ;
//   · 3 répliques, routage PAR CONNEXION : un navigateur garde sa connexion HTTP/2, donc l'envoi de l'image, l'entrée en
//     file et le flux du résultat restent sur la même réplique (des connexions séparées → « session_not_found ») ;
//   · quota réservé par clip, lu dans le code du Space : 10 + étapes × 15 × (images × l × h / (81 × 832 × 624))^1,5 s.
// Protocole de file de Gradio (celui de son client JavaScript) : upload → queue/join → queue/data (SSE) → fichier vidéo.
export const SPACE_WAN_FAST = 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space';
export const NEGATIF = 'subtitles, text, watermark, deformed face, extra limbs, morphing, flicker, camera shake, scene cut, static';
const FPS = 16, MIN_IMAGES = 8, MAX_IMAGES = 80, DIM_MAX = 832, DIM_MIN = 480, DIM_CARRE = 640, MULTIPLE = 16;

/** taille de travail du Space pour une image l × h (même règle que son resize_image). */
export function tailleSpace(l: number, h: number): [number, number] {
  if (l === h) return [DIM_CARRE, DIM_CARRE];
  const r = l / h, rMax = DIM_MAX / DIM_MIN, rMin = DIM_MIN / DIM_MAX;
  let tl: number, th: number;
  if (r > rMax) [tl, th] = [DIM_MAX, DIM_MIN];
  else if (r < rMin) [tl, th] = [DIM_MIN, DIM_MAX];
  else if (l > h) [tl, th] = [DIM_MAX, Math.round(DIM_MAX / r)];
  else [tl, th] = [Math.round(DIM_MAX * r), DIM_MAX];
  const borne = (x: number) => Math.max(DIM_MIN, Math.min(DIM_MAX, Math.round(x / MULTIPLE) * MULTIPLE));
  return [borne(tl), borne(th)];
}

/** secondes de GPU réservées sur le quota pour un clip (formule get_duration du Space). */
export function quotaClip(dureeS: number, etapes: number, l = 832, h = 624): number {
  const [w, hh] = tailleSpace(l, h);
  const images = 1 + Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, Math.round(dureeS * FPS)));
  const facteur = (images * w * hh) / (81 * 832 * 624);
  return 10 + etapes * 15 * facteur ** 1.5;
}

/** nombre de clips qu'un quota quotidien (minutes) permet. */
export function clipsParJour(quotaMin: number, dureeS: number, etapes: number, l = 832, h = 624): number {
  return Math.floor((quotaMin * 60) / quotaClip(dureeS, etapes, l, h));
}

export interface EtatGpu { phase: 'envoi' | 'file' | 'calcul' | 'reception' | 'fini'; rang?: number; attenteS?: number; progression?: number; graine?: number }
export interface OptionsGpu {
  space?: string; dureeS?: number; etapes?: number; graine?: number;
  jeton?: string;                       // compte Hugging Face gratuit de l'utilisateur (5 min/jour) ; jamais affiché
  fetchImpl?: typeof fetch; onEtat?: (e: EtatGpu) => void; signal?: AbortSignal;
}

// QUOTA DU JOUR (docs ZeroGPU lues le 18/10/2026) : 2 min sans compte, 5 min avec un compte gratuit ; « included daily
// quota resets exactly 24 hours after your first GPU usage ». REA sur @gradio/client 2.7.1 (17/10) : hors de
// huggingface.co, le client officiel s'identifie par « Authorization: Bearer <jeton> » ; pré-vols CORS vérifiés pour une
// page locale (origine null) sur whoami-v2 et queue/join.
export const QUOTA_JOUR_S = { anonyme: 120, gratuit: 300 } as const;
const JOUR_MS = 24 * 3600 * 1000;

/** quota épuisé : ce que le Space a dit (secondes demandées, secondes restantes), pour recaler le registre local. */
export class ErreurQuotaGpu extends Error {
  constructor(message: string, readonly demandeS?: number, readonly resteS?: number) { super(message); this.name = 'ErreurQuotaGpu'; }
}
/** « You have exceeded your GPU quota (60s requested vs. 12s left) » → { demandeS: 60, resteS: 12 }. */
export function lireQuotaRestant(t: string): { demandeS?: number; resteS?: number } {
  const m = /\((\d+(?:\.\d+)?)\s*s\s+requested\s+vs\.?\s+(\d+(?:\.\d+)?)\s*s\s+left\)/i.exec(t);
  return m ? { demandeS: Number(m[1]), resteS: Number(m[2]) } : {};
}

/** message clair pour l'utilisateur (quota épuisé, file pleine, Space en pause…). */
export function messageErreur(e?: string | null): string {
  const t = String(e ?? '');
  if (/quota/i.test(t)) {
    const q = lireQuotaRestant(t);
    const detail = q.resteS != null ? ` Il reste ${Math.round(q.resteS)} s, ce clip en demande ${Math.round(q.demandeS ?? 0)}.` : '';
    return `Quota GPU gratuit du jour épuisé : il revient 24 h après la première utilisation (5 min/jour avec un compte Hugging Face gratuit).${detail}`;
  }
  if (/sleep|paused|building/i.test(t)) return 'Le GPU distant se réveille : réessayez dans une minute.';
  return t ? `GPU distant : ${t}` : 'GPU distant : erreur sans message.';
}

/** une utilisation du GPU distant enregistrée sur cet appareil : instant (ms) et secondes réservées. */
export interface UsageGpu { t: number; s: number }
/**
 * Bilan du quota du jour selon la règle de ZeroGPU (fenêtre de 24 h ouverte par la première utilisation) : secondes déjà
 * réservées dans la fenêtre en cours et instant de la remise à zéro (null si aucune fenêtre ouverte).
 */
export function bilanQuota(registre: UsageGpu[], maintenant: number): { utiliseS: number; remiseA: number | null } {
  let debut: number | null = null; let utilise = 0;
  for (const u of [...registre].sort((a, b) => a.t - b.t)) {
    if (u.t > maintenant) continue;
    if (debut === null || u.t >= debut + JOUR_MS) { debut = u.t; utilise = 0; }
    utilise += u.s;
  }
  if (debut === null || maintenant >= debut + JOUR_MS) return { utiliseS: 0, remiseA: null };
  return { utiliseS: utilise, remiseA: debut + JOUR_MS };
}
/** clips encore possibles aujourd'hui avec le quota restant. */
export function clipsRestants(quotaJourS: number, utiliseS: number, parClipS: number): number {
  return parClipS > 0 ? Math.max(0, Math.floor((quotaJourS - utiliseS) / parClipS)) : 0;
}

// CONSIGNE DE MOUVEMENT (veille du 18/10/2026, guides Wan 2.2 image → vidéo de VEED, Unifically, Scenario, Cliprise) :
// décrire le MOUVEMENT et non la scène, dans l'ordre action → caméra → rythme, UN SEUL temps par clip, des verbes
// concrets, n'animer que ce qui est dans l'image ; le style vient de l'image. Libellés en français, consigne en anglais.
export const ACTIONS: Record<string, string> = {
  'Parle en souriant': 'The character talks to the camera with a warm smile, lips moving naturally',
  'Salue de la main': 'The character raises one hand and waves hello',
  'Éclate de rire': 'The character bursts out laughing, shoulders shaking',
  'Tourne la tête': 'The character slowly turns their head toward the camera',
  'Hoche la tête': 'The character nods slowly in agreement',
  'Pointe du doigt': 'The character points a finger forward with an outstretched arm',
  'Marche vers la caméra': 'The character walks a few steps toward the camera',
  'Danse sur place': 'The character dances in place with relaxed, rhythmic body movement',
  'Le vent dans le décor': 'A light breeze moves the leaves, clothes and hair; the scene stays still otherwise',
};
export const CAMERAS: Record<string, string> = {
  'Plan fixe': 'Static camera',
  'Zoom avant lent': 'Slow dolly in toward the character',
  'Zoom arrière lent': 'Slow dolly out revealing the scene',
  'Travelling latéral': 'Smooth lateral tracking shot from left to right',
  'Orbite légère': 'Gentle orbital arc around the character',
  // mouvements de cinéma façon préréglages Higgsfield (18/10/2026 ; REA sur leur SDK MIT @higgsfield/client 0.2.6, preuve
  // ev_a6850ae2… : un catalogue /v1/motions + une force 0..1 par mouvement, côté serveur payant) — ici en consignes Wan 2.2
  'Zoom éclair': 'Fast crash zoom in on the character’s face',
  'Effet vertigo': 'Dolly zoom vertigo effect: the camera pulls back while zooming in, the background stretches behind the character',
  'Orbite 360°': 'The camera orbits a full 360 degrees around the character',
  'Grue montante': 'Crane shot rising up, revealing the scene from above',
  'Drone FPV': 'FPV drone shot swooping fast toward the character',
  'Caméra à l’épaule': 'Handheld camera with natural slight shake, documentary style',
  'Panoramique filé': 'Quick whip pan landing on the character',
  'Contre-plongée': 'Low-angle camera slowly tilting up toward the character',
};
/** force du mouvement de caméra (équivalent texte de la force 0..1 des préréglages Higgsfield). */
export const INTENSITES: Record<string, string> = {
  Douce: 'Subtle, gentle',
  Normale: '',
  Forte: 'Strong, dramatic',
};
export const RYTHMES: Record<string, string> = {
  Lent: 'slow, gentle pace',
  Naturel: 'natural, realistic pace',
  Vif: 'lively, energetic pace',
};
/** consigne Wan 2.2 « un seul temps » : action, caméra, rythme, puis le texte libre de l'utilisateur. */
export function consigneWan(c: { action?: string; camera?: string; intensite?: string; rythme?: string; libre?: string }): string {
  let cam = c.camera ? CAMERAS[c.camera] : undefined;
  const force = c.intensite ? INTENSITES[c.intensite] : '';
  if (cam && force && c.camera !== 'Plan fixe') cam = `${force} ${cam.charAt(0).toLowerCase()}${cam.slice(1)}`;
  const parts = [c.action && ACTIONS[c.action], cam, c.rythme && RYTHMES[c.rythme]]
    .filter(Boolean)
    .map((s) => String(s).replace(/\.$/, ''));
  const libre = (c.libre ?? '').trim().replace(/\s+/g, ' ');
  if (libre) parts.push(libre.replace(/\.$/, ''));
  parts.push('Keep the same character, face, clothes and colors as in the image');
  return parts.join('. ') + '.';
}

/** vérifie le jeton Hugging Face de l'utilisateur (whoami-v2) ; ne renvoie jamais le jeton, seulement le compte. */
export async function verifierJetonHf(jeton: string, fetchImpl: typeof fetch = fetch): Promise<{ nom: string; pro: boolean; role?: string }> {
  const r = await fetchImpl('https://huggingface.co/api/whoami-v2', { headers: { Authorization: `Bearer ${jeton.trim()}` } });
  if (r.status === 401) throw new Error('Jeton Hugging Face refusé : recréez-le (type « Read ») sur huggingface.co/settings/tokens.');
  if (!r.ok) throw new Error(`Hugging Face : vérification impossible (${r.status}).`);
  const j = (await r.json()) as { name?: string; isPro?: boolean; auth?: { accessToken?: { role?: string } } };
  if (!j.name) throw new Error('Hugging Face : compte introuvable pour ce jeton.');
  return { nom: j.name, pro: Boolean(j.isPro), role: j.auth?.accessToken?.role };
}

/** lit le flux SSE de la file de Gradio jusqu'au résultat ; renvoie la sortie de generate_video. */
export async function lireFlux(corps: ReadableStream<Uint8Array>, onEtat?: (e: EtatGpu) => void): Promise<{ data: unknown[] }> {
  const lec = corps.getReader(); const dec = new TextDecoder(); let tampon = '';
  for (;;) {
    const { value, done } = await lec.read();
    if (value) tampon += dec.decode(value, { stream: true });
    let i: number;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
      if (!ligne.startsWith('data:')) continue;
      const m = JSON.parse(ligne.slice(5)) as Record<string, any>;
      if (m.msg === 'estimation') onEtat?.({ phase: 'file', rang: m.rank, attenteS: m.rank_eta });
      else if (m.msg === 'process_starts') onEtat?.({ phase: 'calcul' });
      else if (m.msg === 'progress') {
        const p = m.progress_data?.[0];
        if (p && p.length) onEtat?.({ phase: 'calcul', progression: p.index / p.length });
      } else if (m.msg === 'process_completed') {
        if (!m.success) {
          const brut = String(m.output?.error ?? m.output?.title ?? '');
          if (/quota/i.test(brut)) { const q = lireQuotaRestant(brut); throw new ErreurQuotaGpu(messageErreur(brut), q.demandeS, q.resteS); }
          throw new Error(messageErreur(brut));
        }
        return m.output;
      } else if (m.msg === 'unexpected_error') throw new Error(messageErreur(m.message));
    }
    if (done) break;
  }
  throw new Error('GPU distant : flux terminé sans résultat.');
}

/** « Animer mon image » : image + consigne → clip MP4 calculé sur un vrai GPU distant, avec le quota de l'utilisateur. */
export async function animerSurGpuDistant(image: Blob, consigne: string, o: OptionsGpu = {}): Promise<Blob> {
  const f = o.fetchImpl ?? fetch; const racine = (o.space ?? SPACE_WAN_FAST).replace(/\/$/, '');
  const h: Record<string, string> = o.jeton ? { Authorization: `Bearer ${o.jeton}` } : {};
  const cfg = await (await f(`${racine}/config`, { headers: h, signal: o.signal })).json() as { api_prefix?: string; dependencies: { api_name?: string }[] };
  const pre = cfg.api_prefix ?? '/gradio_api';
  const fn = cfg.dependencies.findIndex((d) => d.api_name === 'generate_video');
  if (fn < 0) throw new Error('GPU distant : ce Space n’expose plus generate_video.');
  const session = Math.random().toString(36).slice(2, 13);
  o.onEtat?.({ phase: 'envoi' });
  const fd = new FormData(); fd.append('files', image, 'depart.png');
  const envoi = await f(`${racine}${pre}/upload?upload_id=${session}`, { method: 'POST', body: fd, headers: h, signal: o.signal });
  if (!envoi.ok) throw new Error(messageErreur(`envoi de l’image refusé (${envoi.status})`));
  const chemin = ((await envoi.json()) as string[])[0];
  const data = [{ path: chemin, orig_name: 'depart.png', meta: { _type: 'gradio.FileData' } }, consigne, o.etapes ?? 4, NEGATIF,
    o.dureeS ?? 3, 1, 1, o.graine ?? 42, o.graine == null];
  const file = await f(`${racine}${pre}/queue/join`, {
    method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, signal: o.signal,
    body: JSON.stringify({ data, fn_index: fn, session_hash: session, event_data: null, trigger_id: null }),
  });
  if (!file.ok) throw new Error(messageErreur(`entrée en file refusée (${file.status})`));
  const flux = await f(`${racine}${pre}/queue/data?session_hash=${session}`, { headers: h, signal: o.signal });
  if (!flux.ok || !flux.body) throw new Error(messageErreur(`flux indisponible (${flux.status})`));
  const sortie = await lireFlux(flux.body, o.onEtat);
  const v = sortie.data[0] as { url?: string; video?: { url?: string } } | undefined;
  const url = v?.video?.url ?? v?.url;
  if (!url) throw new Error('GPU distant : réponse sans vidéo.');
  o.onEtat?.({ phase: 'reception' });
  const clip = await f(url, { headers: h, signal: o.signal });
  if (!clip.ok) throw new Error(messageErreur(`téléchargement du clip refusé (${clip.status})`));
  const graine = typeof sortie.data[1] === 'number' ? sortie.data[1] : undefined;   // graine tirée par le Space
  const b = await clip.blob(); o.onEtat?.({ phase: 'fini', graine }); return b;
}
