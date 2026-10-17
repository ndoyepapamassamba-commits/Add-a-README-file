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

export interface EtatGpu { phase: 'envoi' | 'file' | 'calcul' | 'reception' | 'fini'; rang?: number; attenteS?: number; progression?: number }
export interface OptionsGpu {
  space?: string; dureeS?: number; etapes?: number; graine?: number;
  jeton?: string;                       // compte Hugging Face gratuit de l'utilisateur (5 min/jour) ; jamais affiché
  fetchImpl?: typeof fetch; onEtat?: (e: EtatGpu) => void; signal?: AbortSignal;
}

/** message clair pour l'utilisateur (quota épuisé, file pleine, Space en pause…). */
export function messageErreur(e?: string | null): string {
  const t = String(e ?? '');
  if (/quota/i.test(t)) return 'Quota GPU gratuit du jour épuisé : il revient 24 h après la première utilisation (5 min/jour avec un compte Hugging Face gratuit).';
  if (/sleep|paused|building/i.test(t)) return 'Le GPU distant se réveille : réessayez dans une minute.';
  return t ? `GPU distant : ${t}` : 'GPU distant : erreur sans message.';
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
        if (!m.success) throw new Error(messageErreur(m.output?.error ?? m.output?.title));
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
  const b = await clip.blob(); o.onEtat?.({ phase: 'fini' }); return b;
}
