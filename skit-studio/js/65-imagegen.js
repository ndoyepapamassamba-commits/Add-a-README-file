/* =====================================================================
   Skit Studio — 65-imagegen.js
   Génération d'images IA + banque d'images (IndexedDB) + constructeur de
   prompts cohérents (fiches personnages, décors, émotions, plans).
   Fournisseurs : Pollinations classique (gratuit, sans clé, 1 image / 45 s
   par IP), Pollinations avec clé (gen.pollinations.ai, tous modèles dont
   Grok Imagine), API compatible OpenAI (/images/generations), import manuel.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core;

  const ImageGen = {};

  ImageGen.PROVIDERS = [
    { id: 'pollinations', label: 'Pollinations (gratuit, sans clé — 1 image / 45 s)', needsKey: false },
    { id: 'pollinations-key', label: 'Pollinations avec clé (gen.pollinations.ai : Flux, Grok Imagine, GPT Image…)', needsKey: true },
    { id: 'openai', label: 'API compatible OpenAI (/images/generations)', needsKey: true },
    { id: 'none', label: 'Aucune génération (images importées uniquement)', needsKey: false }
  ];

  ImageGen.STYLES = {
    afro3d: { label: '3D dessin animé africain (référence)', prompt: '3D animated cartoon still in the style of a modern African animated feature film, Pixar-Disney quality render, stylized African characters with rich dark skin, big expressive eyes, exaggerated expressive faces, colorful wax-print and boubou outfits, authentic West African setting, soft cinematic lighting, subsurface skin, detailed textures, vibrant saturated colors, shallow depth of field' },
    pixar3d: { label: '3D animé (style Pixar)', prompt: 'high quality 3D animated movie still, Pixar style, expressive big eyes, soft cinematic lighting, subsurface skin, detailed textures, vibrant colors, shallow depth of field' },
    realiste: { label: 'Photo réaliste', prompt: 'cinematic photograph, 35mm, natural skin, soft key light, realistic, shallow depth of field, 8k' },
    anime: { label: 'Anime', prompt: 'anime illustration, clean lineart, cel shading, expressive faces, detailed background' },
    bd: { label: 'Bande dessinée', prompt: 'comic book illustration, bold ink outlines, flat vivid colors, dramatic expressions' },
    argile: { label: 'Pâte à modeler', prompt: 'claymation stop-motion look, handmade clay characters, studio lighting, miniature set' }
  };

  ImageGen.SCENE_PROMPTS = {
    salon: 'cozy African family living room, sofa, framed photos, warm afternoon light',
    chambre: 'bedroom with a bed and window, morning light',
    cuisine: 'home kitchen with pots on the stove, colorful utensils',
    marche: 'busy outdoor African market stall with fruits and fabrics, umbrellas, sunny',
    bureau: 'modern office with desk and computer, daylight',
    rue: 'street in Dakar with colorful houses and a parked taxi, golden hour',
    ecole: 'school classroom with chalkboard and wooden desks',
    boutique: 'small neighbourhood shop with shelves full of products'
  };

  ImageGen.EMOTION_PROMPTS = {
    neutral: 'calm neutral expression', happy: 'joyful smile', angry: 'angry, furious, frowning',
    shocked: 'shocked, eyes wide open, astonished', sad: 'sad, teary eyes', smug: 'smug sly smirk, one eyebrow raised', confused: 'confused, puzzled expression'
  };

  /** Prompt déterministe pour un plan. */
  ImageGen.buildPrompt = function (project, sketch, line) {
    const V = project.visual || {}; const style = ImageGen.STYLES[V.style] || ImageGen.STYLES.pixar3d;
    const chars = project.characters;
    const speaker = chars.find(c => c.id === line.speaker) || chars[0];
    const other = chars.find(c => c.id !== speaker.id) || chars[1] || speaker;
    const scene = ImageGen.SCENE_PROMPTS[sketch.scene] || ImageGen.SCENE_PROMPTS.salon;
    const emo = ImageGen.EMOTION_PROMPTS[line.emotion] || ImageGen.EMOTION_PROMPTS.neutral;
    let body;
    if (line.shot === 'close') {
      body = `extreme close-up portrait of ${speaker.name} (${speaker.look}), ${emo}, lips closed, face centered and fully visible, looking straight at the camera, head and shoulders, background: ${scene}`;
    } else {
      const A = chars[0], B = chars[1] || chars[0];
      body = `two characters facing each other and arguing: on the LEFT ${A.name} (${A.look}); on the RIGHT ${B.name} (${B.look}); ${speaker.name} is ${emo}, ${other.name} listens with a ${ImageGen.EMOTION_PROMPTS.neutral}; both faces clearly visible, lips closed, medium shot, waist up; setting: ${scene}`;
    }
    return `${style.prompt}. ${body}. vertical 9:16 composition, no text, no watermark, no subtitles${V.extra ? ', ' + V.extra : ''}`;
  };

  /** Clé de banque déterministe. */
  ImageGen.keyFor = (prompt, seed, provider, w, h) => 'img_' + Core.hashString([prompt, seed, provider, w, h].join('|')).toString(36);

  /** Plan des images nécessaires à un projet : [{ key, prompt, seed, sketch, line, shot }]. */
  ImageGen.plan = function (project) {
    const V = project.visual || {}; const out = []; const seen = new Set();
    const w = 1080, h = 1920;
    project.sketches.forEach((sk, si) => sk.lines.forEach((ln, li) => {
      if (ln.image) return; // image fournie
      const explicit = ln.shot === 'close' ? sk.imageClose : sk.imageWide; if (explicit) return;
      const prompt = ImageGen.buildPrompt(project, sk, ln);
      const seed = ((V.seed || 1) * 7919 + Core.hashString(prompt) % 1000) % 2147483647;
      const key = ImageGen.keyFor(prompt, seed, V.provider || 'pollinations', w, h);
      if (seen.has(key)) { out.push({ key, prompt, seed, si, li, shot: ln.shot, dup: true }); return; }
      seen.add(key); out.push({ key, prompt, seed, si, li, shot: ln.shot, w, h });
    }));
    return out;
  };

  /* ------------------------------ Banque (IndexedDB) ------------------------------ */
  const mem = new Map(); // key → { blob, url }
  let _db = null;
  function db() {
    if (_db) return Promise.resolve(_db);
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = indexedDB.open('skitstudio', 1);
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'key' }); if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'key' }); };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => resolve(null);
    });
  }
  ImageGen.bankGet = async function (key) {
    if (mem.has(key)) return mem.get(key);
    const d = await db(); if (!d) return null;
    return new Promise((resolve) => { const tx = d.transaction('images', 'readonly'); const r = tx.objectStore('images').get(key); r.onsuccess = () => { const v = r.result; if (!v) return resolve(null); const e = { blob: v.blob, url: URL.createObjectURL(v.blob), prompt: v.prompt, meta: v.meta }; mem.set(key, e); resolve(e); }; r.onerror = () => resolve(null); });
  };
  ImageGen.bankPut = async function (key, blob, prompt, meta) {
    const e = { blob, url: URL.createObjectURL(blob), prompt, meta: meta || {} }; mem.set(key, e);
    const d = await db(); if (d) { try { await new Promise((res, rej) => { const tx = d.transaction('images', 'readwrite'); tx.objectStore('images').put({ key, blob, prompt, meta: e.meta, created: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (err) { console.warn('IndexedDB :', err); } }
    return e;
  };
  ImageGen.bankList = async function () {
    const d = await db(); if (!d) return Array.from(mem.entries()).map(([key, e]) => ({ key, prompt: e.prompt, meta: e.meta, size: e.blob.size }));
    return new Promise((resolve) => { const out = []; const tx = d.transaction('images', 'readonly'); const c = tx.objectStore('images').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: cur.value.key, prompt: cur.value.prompt, meta: cur.value.meta, size: cur.value.blob.size, created: cur.value.created }); cur.continue(); } else resolve(out); }; c.onerror = () => resolve(out); });
  };
  ImageGen.bankDelete = async function (key) {
    mem.delete(key); const d = await db(); if (!d) return; await new Promise((res) => { const tx = d.transaction('images', 'readwrite'); tx.objectStore('images').delete(key); tx.oncomplete = res; tx.onerror = res; });
  };
  ImageGen.bankClear = async function () { mem.clear(); const d = await db(); if (!d) return; await new Promise((res) => { const tx = d.transaction('images', 'readwrite'); tx.objectStore('images').clear(); tx.oncomplete = res; tx.onerror = res; }); };

  /* ------------------------------ Génération ------------------------------ */
  let lastAnon = 0; // horodatage de la dernière requête anonyme Pollinations
  ImageGen.ANON_INTERVAL = 46000;
  ImageGen.nextAnonDelay = () => Math.max(0, lastAnon + ImageGen.ANON_INTERVAL - Date.now());
  const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Annulé')); }, { once: true }); });

  async function fetchPollinationsClassic(prompt, seed, w, h, signal) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&safe=false`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = ImageGen.nextAnonDelay(); if (wait > 0) await sleep(wait, signal);
      lastAnon = Date.now();
      const r = await fetch(url, { signal });
      if (r.status === 402 || r.status === 429) { const ra = parseInt(r.headers.get('Retry-After') || '45', 10); lastAnon = Date.now() + Math.max(0, (isNaN(ra) ? 45 : ra) * 1000 - ImageGen.ANON_INTERVAL); continue; }
      if (!r.ok) throw new Error('Pollinations ' + r.status + ' : ' + (await r.text()).slice(0, 160));
      const blob = await r.blob(); if (!blob.type.startsWith('image/')) throw new Error('Réponse non-image de Pollinations');
      return blob;
    }
    throw new Error('Pollinations : limite de débit atteinte (réessayez ou utilisez une clé)');
  }

  async function fetchPollinationsKey(prompt, seed, w, h, settings, signal) {
    const s = settings.pollinations || {};
    if (!s.apiKey) throw new Error('Clé Pollinations manquante (Réglages)');
    const model = s.imageModel || 'black-forest-labs/flux.1-schnell';
    const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${w}&height=${h}&seed=${seed}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + s.apiKey }, signal });
    if (!r.ok) throw new Error('Pollinations (clé) ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    return r.blob();
  }

  async function fetchOpenAI(prompt, seed, w, h, settings, signal) {
    const s = settings.image || {};
    const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const r = await fetch(base + '/images/generations', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (s.apiKey || '') },
      body: JSON.stringify({ model: s.model || 'gpt-image-1', prompt, n: 1, size: s.size || '1024x1536' }) });
    if (!r.ok) throw new Error('Images ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    const j = await r.json(); const d = j.data && j.data[0];
    if (!d) throw new Error('Réponse images vide');
    if (d.b64_json) { const bin = atob(d.b64_json); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: 'image/png' }); }
    const rr = await fetch(d.url, { signal }); return rr.blob();
  }

  /** Rogne le bas d'une image (filigrane) et renvoie un nouveau Blob. */
  ImageGen.cropBottom = async function (blob, frac) {
    const img = await createImageBitmap(blob);
    const h = Math.round(img.height * (1 - frac));
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, img.width, h, 0, 0, img.width, h);
    return new Promise(res => cv.toBlob(res, 'image/jpeg', 0.93));
  };

  /**
   * Génère (ou récupère de la banque) une image. @returns { blob, url, fromBank }
   */
  ImageGen.getOrGenerate = async function (item, project, settings, signal) {
    const hit = await ImageGen.bankGet(item.key); if (hit) return Object.assign({ fromBank: true }, hit);
    const V = project.visual || {}; const provider = V.provider || 'pollinations';
    let blob;
    if (provider === 'pollinations') { blob = await fetchPollinationsClassic(item.prompt, item.seed, item.w, item.h, signal); if (V.cropWatermark !== false) blob = await ImageGen.cropBottom(blob, 0.055); }
    else if (provider === 'pollinations-key') blob = await fetchPollinationsKey(item.prompt, item.seed, item.w, item.h, settings, signal);
    else if (provider === 'openai') blob = await fetchOpenAI(item.prompt, item.seed, item.w, item.h, settings, signal);
    else throw new Error('Aucun fournisseur d\'images : importez des images ou choisissez un fournisseur');
    const e = await ImageGen.bankPut(item.key, blob, item.prompt, { seed: item.seed, provider, shot: item.shot });
    return Object.assign({ fromBank: false }, e);
  };

  /** Importe un fichier utilisateur dans la banque. @returns { key, url } */
  ImageGen.importFile = async function (file) {
    const key = 'usr_' + Core.hashString(file.name + file.size + file.lastModified).toString(36);
    const e = await ImageGen.bankPut(key, file, 'import : ' + file.name, { provider: 'import' });
    return { key, url: e.url };
  };

  NS.ImageGen = ImageGen;
})(typeof window !== 'undefined' ? window : globalThis);
