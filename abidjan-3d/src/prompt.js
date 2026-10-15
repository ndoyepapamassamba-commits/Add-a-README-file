// Interprétation des prompts du studio : texte libre (français) → plan de scène JSON.
//
// Deux interprètes produisent le même plan :
//  - interpretLocal() : analyseur intégré, hors ligne, déterministe (quartiers, catégories, caméra,
//    durées, format, relief, titres entre guillemets, transitions, sortie vidéo ou image) ;
//  - interpretWithClaude() : sur claude.ai, la page demande à Claude (capacité « sample ») de
//    traduire un prompt libre dans le même schéma.
// normalizePlan() valide et borne tout plan (venant d'un interprète ou de l'éditeur).

export const FORMATS = {
  '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16 (TikTok, Reels)' },
  '16:9': { w: 1920, h: 1080, label: 'Paysage 16:9 (YouTube)' },
  '1:1': { w: 1080, h: 1080, label: 'Carré 1:1 (Instagram)' },
  mosaique: { w: 1672, h: 942, label: 'Mosaïque (la planche entière)' },
};

// Mouvements de caméra : valeurs de départ et d'arrivée (yaw, pitch en radians ; zoom = distance
// relative ; panX, panY en fraction de la largeur de l'image). L'intensité amplifie les écarts.
export const MOVES = {
  approche: { label: 'Zoom avant', from: {}, to: { yaw: 0.03, zoom: 0.88 } },
  recul: { label: 'Zoom arrière', from: { zoom: 0.86 }, to: { zoom: 1 } },
  'orbite-droite': { label: 'Orbite vers la droite', from: { yaw: -0.09, zoom: 0.97 }, to: { yaw: 0.09, zoom: 0.97 } },
  'orbite-gauche': { label: 'Orbite vers la gauche', from: { yaw: 0.09, zoom: 0.97 }, to: { yaw: -0.09, zoom: 0.97 } },
  'travelling-droite': { label: 'Travelling vers la droite', from: { panX: -0.05, zoom: 0.93 }, to: { panX: 0.05, zoom: 0.93 } },
  'travelling-gauche': { label: 'Travelling vers la gauche', from: { panX: 0.05, zoom: 0.93 }, to: { panX: -0.05, zoom: 0.93 } },
  plongee: { label: 'Plongée', from: { pitch: 0.07, zoom: 0.96 }, to: { pitch: -0.03, zoom: 0.92 } },
  'contre-plongee': { label: 'Contre-plongée', from: { pitch: -0.07, zoom: 0.96 }, to: { pitch: 0.03, zoom: 0.92 } },
  survol: { label: 'Survol (drone)', from: { pitch: 0.1, panY: 0.03 }, to: { pitch: 0.02, zoom: 0.86, panY: -0.02 } },
  fixe: { label: 'Fixe', from: {}, to: {} },
};
const AUTO_MOVES = ['approche', 'orbite-droite', 'travelling-gauche', 'plongee', 'orbite-gauche', 'recul'];

// Catégories des vignettes (par titre), pour comprendre « les villages », « les marchés »…
const TAGS = {
  'PLATEAU': ['affaires', 'moderne', 'animation'], 'COCODY': ['residentiel', 'moderne'], 'RIVIERA': ['residentiel'],
  'MARCORY': ['commerce', 'animation'], 'TREICHVILLE': ['commerce', 'animation', 'marche'], 'KOUMASSI': ['populaire', 'commerce', 'animation'],
  'YOPOUGON': ['populaire', 'commerce', 'animation'], 'ADJAMÉ': ['marche', 'animation', 'populaire'], 'ATTECOUBÉ': ['populaire', 'transport'],
  'PORT-BOUËT': ['mer', 'commerce'], 'ANYAMA': ['populaire', 'commerce'], 'BINGERVILLE': ['banlieue', 'commerce'],
  'ABOBO': ['populaire', 'transport', 'animation'], 'SONGON': ['populaire', 'banlieue'], 'PLATEAU DOKUI': ['precaire', 'lagune'],
  'BANCO NORD': ['precaire', 'populaire'], 'VRIDI': ['port', 'industrie', 'transport'], 'ZONE 4': ['commerce', 'moderne'],
  'WILLIAMSVILLE': ['residentiel'], 'BIÉTRY': ['affaires', 'moderne'], 'SOCOGI': ['industrie'],
  'RIVIERA PALMERAIE': ['residentiel'], 'PORT DE PÊCHE': ['port', 'mer', 'marche'], 'MARCHÉ DE GROS': ['marche', 'commerce'],
  'MAISON MODESTE': ['populaire'], "BIDONVILLE D'ADJAMÉ": ['precaire', 'populaire'], 'VILLAGE DE SONGON': ['village', 'banlieue'],
  'VILLAGE DE BASSAM': ['village', 'mer'], 'VILLAGE DE JACQUEVILLE': ['village', 'mer'], "VILLAGE D'ASSINIE": ['village', 'mer'],
};
const TAG_WORDS = [
  ['affaires', /\b(affaires?|business|tours?|gratte ciels?|buildings?|immeubles?|cbd)\b/],
  ['moderne', /\b(modernes?|modernite)\b/],
  ['residentiel', /\b(residenti\w*|chics?|huppes?|villas?|riches?)\b/],
  ['marche', /\b(marches|marche (?!de gros)|commercant\w*)\b/],
  ['commerce', /\b(commerces?|commercia\w*|boutiques?|magasins?)\b/],
  ['populaire', /\b(populaires?)\b/],
  ['precaire', /\b(precaires?|bidonvilles?|pauvres?)\b/],
  ['village', /\b(villages|campagnes?|ruraux|rural\w*)\b/],
  ['mer', /\b(mer|plages?|ocean|littoral|bord de mer|cotes?|cotier\w*)\b/],
  ['port', /\b(ports?|portuaires?|bateaux|pirogues?|peche)\b/],
  ['industrie', /\b(industri\w*|usines?)\b/],
  ['lagune', /\b(lagunes?)\b/],
  ['banlieue', /\b(banlieues?|peripheri\w*)\b/],
  ['animation', /\b(animes?|animation|foules?|ambiance)\b/],
];
const DEFAULT_PICK = ['PLATEAU', 'COCODY', 'ADJAMÉ', 'TREICHVILLE', 'PORT DE PÊCHE', "VILLAGE D'ASSINIE"];
const EXTRA_ALIASES = {
  'PORT-BOUËT': ['portbouet'], 'ZONE 4': ['zone4', 'zone quatre'], 'VILLAGE DE BASSAM': ['grand bassam', 'bassam'],
  "VILLAGE D'ASSINIE": ['assinie'], 'VILLAGE DE JACQUEVILLE': ['jacqueville'], "BIDONVILLE D'ADJAMÉ": ['bidonville d adjame', 'bracodi'],
  'PLATEAU DOKUI': ['dokui'], 'RIVIERA PALMERAIE': ['palmeraie'], 'MARCHÉ DE GROS': ['marche de gros'],
};
const NUMBERS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20, trente: 30 };

export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`´\-_/]/g, ' ').replace(/[^a-z0-9:.,«»"“”\s]/g, ' ').replace(/\s+/g, ' ').trim();

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function shuffle(list, seed) {
  const a = list.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Catalogue des images disponibles : vignettes de la planche + images importées. */
export function makeCatalog(meta, uploads = []) {
  return {
    tiles: meta.tiles.map((t) => ({ id: `tile:${t.i}`, title: t.title, subtitle: t.subtitle, tags: TAGS[t.title] || [] })),
    uploads: uploads.map((u, k) => ({ id: `upload:${k}`, title: u.name, subtitle: 'Image importée', tags: ['import'] })),
  };
}

/**
 * Analyseur intégré (hors ligne).
 * @returns {{plan: object, understood: string[]}}
 */
export function interpretLocal(prompt, catalog) {
  const raw = String(prompt || '');
  const quotes = [...raw.matchAll(/[«"“]\s*([^»"”]{1,80}?)\s*[»"”]/g)].map((m) => {
    const before = norm(raw.slice(Math.max(0, m.index - 30), m.index));
    const role = /(fin|termin\w*|conclu\w*|outro|cloture|dernier)\s*:?\s*$/.test(before) ? 'end'
      : /(titre|intro\w*|ouverture|commence\w*|debut)\s*:?\s*$/.test(before) ? 'title' : null;
    return { text: m[1].trim(), role };
  });
  let text = ` ${norm(raw.replace(/[«"“][^»"”]*[»"”]/g, ' '))} `;
  const understood = [];

  // Images importées (avant la détection de la sortie, « mes images » n'est pas une sortie image).
  const wantsUploads = /\b(mes|ma|mon|nos) (images?|photos?)\b|\bimages? importees?\b|\bphotos? importees?\b/.test(text);
  text = text.replace(/\b(mes|ma|mon|nos) (images?|photos?)\b|\b(images?|photos?) importees?\b/g, ' ');

  // Sortie et format.
  const output = /\b(image|photo|affiche|poster|miniature|capture|png|jpe?g|still|visuel fixe)\b/.test(text) && !/\b(video|clip|reel|mp4|film|animation|montage)\b/.test(text) ? 'image' : 'video';
  let format = '9:16';
  if (/\b(mosaique|planche|grille)\b/.test(text)) format = 'mosaique';
  else if (/\b(16 ?[:x] ?9|paysage|horizontal\w*|youtube|ecran large)\b/.test(text)) format = '16:9';
  else if (/\b(1 ?[:x] ?1|carree?s?|instagram post|post instagram)\b/.test(text)) format = '1:1';
  else if (/\b(9 ?[:x] ?16|vertical\w*|tiktok|reels?|shorts?|story|stories)\b/.test(text)) format = '9:16';

  // Intensité et relief.
  let intensity = 1;
  if (/\b(dynamique|rapide|energique|nerveu\w*|punchy|rythme)\b/.test(text)) intensity = 1.4;
  if (/\b(lent\w*|doux|douce\w*|calme|tranquille|cinematique|cinema|contemplati\w*)\b/.test(text)) intensity = 0.7;
  let relief = 0.15;
  if (/\b(sans relief|pas de relief|plat|2d|sans 3d)\b/.test(text)) relief = 0;
  else if (/\b(relief (tres )?(fort|prononce|marque|maximum)|beaucoup de relief|tres 3d|3d (forte|prononcee)|profondeur forte)\b/.test(text)) relief = 0.26;
  else if (/\b(relief (leger|subtil|doux|faible)|leger relief|peu de relief|subtil)\b/.test(text)) relief = 0.08;

  // Sujets : noms cités (dans l'ordre du prompt), sinon catégories, sinon une sélection variée.
  const names = [];
  const entries = catalog.tiles
    .flatMap((t) => [norm(t.title), ...(EXTRA_ALIASES[t.title] || [])].map((alias) => ({ t, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);
  let scan = text;
  for (const { t, alias } of entries) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(scan);
    if (!m) continue;
    if (alias === 'songon' && /village de $/.test(scan.slice(0, m.index))) continue;
    names.push({ id: t.id, pos: m.index });
    scan = scan.slice(0, m.index) + ' '.repeat(m[0].length) + scan.slice(m.index + m[0].length);
  }
  names.sort((a, b) => a.pos - b.pos);
  let ids = [...new Set(names.map((n) => n.id))];

  const tagHits = TAG_WORDS.filter(([, re]) => re.test(scan)).map(([tag]) => tag);
  const all = /\b(tous|toutes|toute la ville|tous les quartiers|les 30|l ensemble|integralite)\b/.test(text);
  const countMatch = /\b(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze|quinze|vingt|trente) (quartiers?|plans?|images?|lieux|endroits|scenes?|vignettes?)\b/.exec(text);
  const count = countMatch ? (NUMBERS[countMatch[1]] ?? +countMatch[1]) : null;
  if (!ids.length) {
    let pool = [];
    if (tagHits.length) {
      // « villages au bord de la mer » : intersection ; « marchés et villages » : union (intersection vide).
      const every = catalog.tiles.filter((t) => tagHits.every((tag) => t.tags.includes(tag)));
      pool = (every.length ? every : catalog.tiles.filter((t) => tagHits.some((tag) => t.tags.includes(tag)))).map((t) => t.id);
    } else if (all) pool = catalog.tiles.map((t) => t.id);
    if (!pool.length && wantsUploads) pool = catalog.uploads.map((u) => u.id);
    if (!pool.length) {
      pool = DEFAULT_PICK.map((title) => catalog.tiles.find((t) => t.title === title)?.id).filter(Boolean);
      if (format !== 'mosaique') understood.push('Aucun lieu précis demandé : sélection variée de la ville.');
    } else if (tagHits.length) {
      understood.push(`Catégories reconnues : ${tagHits.join(', ')}.`);
    }
    ids = pool;
  }
  if (wantsUploads && catalog.uploads.length) ids = [...ids.filter((id) => !id.startsWith('upload:')), ...catalog.uploads.map((u) => u.id)];
  else if (wantsUploads) understood.push('« Mes images » : aucune image importée pour l’instant (bouton « Importer des images »).');
  if (/\b(aleatoire|au hasard|melang\w*|random)\b/.test(text)) ids = shuffle(ids, hash(raw));
  if (count) ids = ids.slice(0, count);
  if (output === 'image') ids = ids.slice(0, 1);

  // Mouvements cités, dans l'ordre.
  const moveWords = [
    ['contre-plongee', /\bcontre plongee\b/g],
    ['plongee', /\b(plongee|vue (du|d en) (haut|ciel))\b/g],
    ['survol', /\b(drone|survol\w*|aerien\w*|vol d oiseau)\b/g],
    ['recul', /\b(zoom arriere|dezoom\w*|recul\w*|s eloigne\w*|eloign\w*|pull out)\b/g],
    ['approche', /\b(zoom avant|zoom\w*|approch\w*|rapproch\w*|avanc\w*|push in|dolly)\b/g],
    ['orbite', /\b(orbite\w*|tourne\w*|tour autour|rotation|pivot\w*)\b/g],
    ['travelling', /\b(travelling|glisse\w*|panoramique|pano|defile\w*|lateral\w*)\b/g],
    ['fixe', /\b(fixe|statique|immobile|sans mouvement)\b/g],
  ];
  const found = [];
  for (const [move, re] of moveWords) {
    for (const m of text.matchAll(re)) {
      if (move === 'approche' && /zoom arriere/.test(text.slice(m.index, m.index + 13))) continue;
      const after = text.slice(m.index, m.index + 40);
      const left = /\b(vers la gauche|a gauche|de droite a gauche)\b/.test(after);
      const name = move === 'orbite' ? (left ? 'orbite-gauche' : 'orbite-droite') : move === 'travelling' ? (left ? 'travelling-gauche' : 'travelling-droite') : move;
      found.push({ name, pos: m.index });
    }
  }
  found.sort((a, b) => a.pos - b.pos);
  const moves = [...new Map(found.map((f) => [f.pos, f.name])).values()].filter((m, i, arr) => m !== arr[i - 1]);

  // Durées.
  const num = (s) => +String(s).replace(',', '.');
  const per = /(\d+(?:[.,]\d+)?) ?(?:s|sec\w*|secondes?) ?(?:par|pour chaque|chacun\w*|a chaque) ?(?:plan|quartier|image|lieu|scene|vignette)?/.exec(text)
    || /(?:par|chaque) (?:plan|quartier|image|lieu|scene) ?(?:de|:|=)? ?(\d+(?:[.,]\d+)?) ?(?:s|sec\w*|secondes?)/.exec(text);
  let total = null;
  const min = /(\d+(?:[.,]\d+)?) ?(?:min\w*)(?: ?(\d{1,2}))?/.exec(text);
  const sec = /(\d+(?:[.,]\d+)?) ?(?:s|sec|secs|secondes?)\b/.exec(text);
  if (min) total = num(min[1]) * 60 + (min[2] ? num(min[2]) : 0);
  else if (sec && !per) total = num(sec[1]);

  const byRole = (role) => quotes.find((q) => q.role === role);
  const free = quotes.filter((q) => !q.role);
  const titleQ = byRole('title') || (byRole('end') ? free[0] : free.shift());
  const endQ = byRole('end') || free.find((q) => q !== titleQ);
  const title = titleQ ? { text: titleQ.text, duration: 2.5 } : null;
  const end = endQ ? { text: endQ.text, duration: 2.5 } : null;
  const showNames = /\b(noms? des? (quartiers?|lieux)|afficher? les noms|avec les noms|titre de chaque|nom de chaque)\b/.test(text);
  const transition = /\b(coupe\w*|cut|sans fondu|enchainement sec|sec)\b/.test(text) ? 'coupe' : 'fondu';
  const camera = /\bvague\b/.test(text) ? 'vague' : /\bsouris\b/.test(text) ? 'souris' : 'respiration';

  const fixed = (title?.duration || 0) + (end?.duration || 0);
  let perShot = per ? num(per[1]) : intensity > 1 ? 2 : intensity < 1 ? 4 : 3;
  if (!per && total && ids.length) perShot = Math.max(0.8, (total - fixed) / ids.length);

  const plan = normalizePlan({
    output, format, intensity, relief, transition, camera, title, end,
    shots: ids.map((image, i) => ({
      image,
      move: moves.length ? moves[i % moves.length] : AUTO_MOVES[i % AUTO_MOVES.length],
      duration: perShot,
      text: showNames ? (catalog.tiles.find((t) => t.id === image)?.title || '') : '',
    })),
  }, catalog);

  understood.unshift(...describePlan(plan, catalog, { moves, intensity, relief }));
  return { plan, understood };
}

/** Valide un plan (bornes, identifiants connus, valeurs par défaut). */
export function normalizePlan(p, catalog) {
  const known = new Set([...catalog.tiles, ...catalog.uploads].map((x) => x.id));
  const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
  const plan = {
    output: p?.output === 'image' ? 'image' : 'video',
    format: FORMATS[p?.format] ? p.format : '9:16',
    intensity: clamp(p?.intensity, 0.3, 2, 1),
    relief: clamp(p?.relief, 0, 0.35, 0.15),
    transition: p?.transition === 'coupe' ? 'coupe' : 'fondu',
    camera: ['respiration', 'vague', 'souris'].includes(p?.camera) ? p.camera : 'respiration',
    title: p?.title?.text ? { text: String(p.title.text).slice(0, 80), duration: clamp(p.title.duration, 1, 8, 2.5) } : null,
    end: p?.end?.text ? { text: String(p.end.text).slice(0, 80), duration: clamp(p.end.duration, 1, 8, 2.5) } : null,
    shots: (Array.isArray(p?.shots) ? p.shots : [])
      .filter((s) => known.has(s?.image))
      .slice(0, 60)
      .map((s, i) => ({
        image: s.image,
        move: MOVES[s.move] ? s.move : AUTO_MOVES[i % AUTO_MOVES.length],
        duration: clamp(s.duration, 0.8, 12, 3),
        text: s.text ? String(s.text).slice(0, 80) : '',
      })),
  };
  if (plan.format === 'mosaique') plan.shots = [];
  else if (!plan.shots.length) {
    plan.shots = [{ image: catalog.tiles[0].id, move: 'approche', duration: 3, text: '' }];
  }
  if (plan.output === 'image' && plan.format !== 'mosaique') {
    // Une image n'a pas de carton : le titre demandé s'affiche sur l'image elle-même.
    plan.shots = plan.shots.slice(0, 1);
    if (plan.title && !plan.shots[0].text) plan.shots[0].text = plan.title.text;
    plan.title = null;
    plan.end = null;
  }
  return plan;
}

export function planDuration(plan) {
  if (plan.format === 'mosaique') return plan.output === 'image' ? 0 : 8;
  return (plan.title?.duration || 0) + plan.shots.reduce((s, x) => s + x.duration, 0) + (plan.end?.duration || 0);
}

export function describePlan(plan, catalog, hints = {}) {
  const name = (id) => [...catalog.tiles, ...catalog.uploads].find((x) => x.id === id)?.title || id;
  const f = FORMATS[plan.format];
  const out = [`Sortie : ${plan.output === 'image' ? 'image PNG' : 'vidéo MP4'} · ${f.label} · ${f.w}×${f.h}`];
  if (plan.format === 'mosaique') {
    out.push(`Mosaïque des 30 quartiers, caméra « ${plan.camera} »${plan.output === 'video' ? ', boucle de 8 s' : ''}.`);
    return out;
  }
  const list = plan.shots.map((s) => name(s.image));
  out.push(`${list.length} plan${list.length > 1 ? 's' : ''} : ${list.slice(0, 8).join(', ')}${list.length > 8 ? `… (+${list.length - 8})` : ''}`);
  const moves = [...new Set(plan.shots.map((s) => MOVES[s.move].label.toLowerCase()))];
  out.push(`Caméra : ${moves.slice(0, 4).join(', ')}${hints.moves?.length ? '' : ' (alternance automatique)'}${plan.intensity > 1 ? ' · rythme dynamique' : plan.intensity < 1 ? ' · rythme doux' : ''}`);
  if (plan.output === 'video') {
    const per = plan.shots[0]?.duration ?? 0;
    out.push(`Durée : ${per.toFixed(1).replace('.', ',')} s par plan, ${planDuration(plan).toFixed(1).replace('.', ',')} s au total · transition ${plan.transition}`);
  }
  out.push(`Relief : ${plan.relief === 0 ? 'aucun' : plan.relief >= 0.24 ? 'fort' : plan.relief <= 0.09 ? 'léger' : 'normal'}`);
  if (plan.title) out.push(`Titre d'ouverture : « ${plan.title.text} »`);
  if (plan.end) out.push(`Carton de fin : « ${plan.end.text} »`);
  if (plan.shots.some((s) => s.text)) out.push('Texte affiché sur les plans.');
  return out;
}

/**
 * Interprétation par Claude (capacité « sample » de claude.ai).
 * @param {Function & {json: Function}} sample  namespace renvoyé par claude.use('sample')
 */
export async function interpretWithClaude(sample, prompt, catalog, { signal } = {}) {
  const images = [...catalog.tiles, ...catalog.uploads].map((x) => `${x.id} | ${x.title} | ${x.subtitle} | ${x.tags.join(', ')}`).join('\n');
  const input = `Tu es l'interprète d'un studio vidéo HTML 3D qui anime des images d'Abidjan en relief.
Traduis le prompt de l'utilisateur en un plan de scène JSON. Réponds uniquement avec ce JSON.

Schéma :
{
  "output": "video" | "image",
  "format": "9:16" | "16:9" | "1:1" | "mosaique",
  "intensity": nombre 0.5 à 1.6 (1 = normal, plus grand = caméra plus ample),
  "relief": nombre 0 à 0.3 (0.15 = normal, 0 = sans relief),
  "transition": "fondu" | "coupe",
  "camera": "respiration" | "vague" | "souris" (seulement pour le format mosaique),
  "title": {"text": "titre d'ouverture", "duration": secondes} ou null,
  "end": {"text": "carton de fin", "duration": secondes} ou null,
  "shots": [{"image": identifiant ci-dessous, "move": mouvement ci-dessous, "duration": secondes 0.8 à 12, "text": "texte affiché sur le plan ou chaîne vide"}],
  "resume": ["3 à 6 phrases très courtes, en français, qui disent ce que tu as compris"]
}

Mouvements possibles : ${Object.keys(MOVES).join(', ')}.
Images disponibles (identifiant | titre | lieu | catégories) :
${images}

Règles : n'utilise que ces identifiants ; format 9:16 si rien n'est précisé ; pour une image, un seul plan ;
varie les mouvements si le prompt n'en impose pas ; respecte la durée totale demandée ; garde le texte
des titres exactement comme l'utilisateur l'a écrit.

Prompt de l'utilisateur :
${String(prompt).slice(0, 4000)}`;
  const raw = await sample.json(input, { modelTier: 'quick', signal });
  const plan = normalizePlan(raw, catalog);
  const resume = Array.isArray(raw?.resume) ? raw.resume.map(String).filter(Boolean).slice(0, 6) : [];
  return { plan, understood: [...describePlan(plan, catalog), ...resume.map((r) => `Claude : ${r}`)] };
}
