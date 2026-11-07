/* =====================================================================
   Skit Studio — 00-core.js
   Espace de noms global, utilitaires purs (sans DOM), RNG à graine,
   fonctions d'interpolation, analyse des mots-clés *marqués*.
   Chaque module expose SkitStudio.<Nom> (navigateur) et module.exports (Node).
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};

  const Core = {};

  Core.VERSION = '1.0.0';

  /** Identifiant court unique (suffisant pour des objets locaux). */
  Core.uid = function (prefix) {
    const s = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    return (prefix ? prefix + '_' : '') + s;
  };

  Core.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  Core.lerp = (a, b, t) => a + (b - a) * t;
  Core.easeOutCubic = (t) => 1 - Math.pow(1 - Core.clamp(t, 0, 1), 3);
  Core.easeInOutQuad = (t) => { t = Core.clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  Core.easeOutBack = (t) => { t = Core.clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  Core.easeOutElastic = (t) => { t = Core.clamp(t, 0, 1); if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1; };

  /** Générateur pseudo-aléatoire déterministe (mulberry32). */
  Core.rng = function (seed) {
    let a = (typeof seed === 'string') ? Core.hashString(seed) : (seed >>> 0);
    const fn = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    fn.int = (n) => Math.floor(fn() * n);
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.shuffle = (arr) => { const c = arr.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(fn() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
    return fn;
  };

  Core.hashString = function (s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  Core.deepClone = (o) => JSON.parse(JSON.stringify(o));

  Core.hexToRgb = function (hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  };
  Core.rgba = (hex, a) => { const [r, g, b] = Core.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  Core.mixHex = function (h1, h2, t) {
    const a = Core.hexToRgb(h1), b = Core.hexToRgb(h2);
    const c = a.map((v, i) => Math.round(Core.lerp(v, b[i], t)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  };

  /**
   * Analyse un texte avec marqueurs *mot* → tableau de tokens.
   * Retour : { words:[{text, hl:boolean}], plain:string }
   * Si aucun marqueur et highlight='last', les N derniers mots sont surlignés.
   */
  Core.parseMarked = function (text, opts) {
    opts = opts || {};
    const mode = opts.highlight || 'auto';
    const lastN = opts.lastN == null ? 2 : opts.lastN;
    const raw = String(text || '').trim();
    const words = [];
    let hasMark = false;
    // Découpe en conservant les groupes *...*
    const re = /\*([^*]+)\*([.,;:…]*)|(\S+)/g;
    let m;
    while ((m = re.exec(raw))) {
      if (m[1] != null) {
        hasMark = true;
        const ws = m[1].trim().split(/\s+/);
        ws.forEach((w, i) => words.push({ text: w + (i === ws.length - 1 ? (m[2] || '') : ''), hl: true }));
      } else if (m[3] != null) {
        words.push({ text: m[3], hl: false });
      }
    }
    if (!hasMark && (mode === 'auto' || mode === 'last') && words.length) {
      // surligne les derniers mots en évitant de surligner une simple ponctuation
      let n = Math.min(lastN, words.length);
      // Ne pas surligner toute une phrase courte de 2 mots
      if (words.length <= 2) n = 1;
      for (let i = words.length - n; i < words.length; i++) words[i].hl = true;
    }
    return { words, plain: words.map(w => w.text).join(' ') };
  };

  Core.stripMarks = (text) => String(text || '').replace(/\*([^*]+)\*/g, '$1');

  /** Estimation de durée de parole (s) pour une réplique sans audio mesuré. */
  Core.estimateSpeechSeconds = function (text, rate) {
    const plain = Core.stripMarks(text);
    const chars = plain.replace(/\s+/g, ' ').trim().length;
    const r = rate || 1;
    return (0.065 * chars + 0.4) / r;
  };

  /** Découpe approximative en syllabes (pour la voix procédurale et la bouche). */
  Core.syllables = function (text) {
    const plain = Core.stripMarks(text).toLowerCase();
    const out = [];
    const words = plain.split(/\s+/).filter(Boolean);
    for (const w of words) {
      const groups = w.match(/[aeiouyàâäéèêëîïôöùûüœ]+/g);
      const n = Math.max(1, groups ? groups.length : 1);
      for (let i = 0; i < n; i++) out.push({ word: w, index: i, count: n });
    }
    return out;
  };

  Core.pad2 = (n) => String(n).padStart(2, '0');
  Core.fmtTime = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${Core.pad2(Math.floor(r))}.${Math.floor((r % 1) * 10)}`; };

  Core.slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48) || 'video';

  NS.Core = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
