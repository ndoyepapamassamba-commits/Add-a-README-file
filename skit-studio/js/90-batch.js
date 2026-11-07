/* =====================================================================
   Skit Studio — 90-batch.js
   Génération de variantes (combinatoire déterministe) et file d'attente
   de rendu séquentielle (indépendante du DOM).
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core || (typeof require !== 'undefined' ? require('./00-core.js') : null);
  const Script = NS.Script || (typeof require !== 'undefined' ? require('./10-script.js') : null);

  const Batch = {};

  Batch.EMOJI_SETS = {
    classique: ['🤣', '😱', '😂', '😲', '🔥', '😜'],
    feu: ['🔥', '💀', '😭', '🤯', '😤', '🙃'],
    doux: ['😅', '🙈', '😏', '🥲', '😇', '🤭']
  };

  /**
   * Fabrique `count` projets variantes.
   * @param base  projet normalisé (sert de gabarit : personnages, réglages)
   * @param bank  tableau de sketches disponibles (≥ perVideo recommandé)
   * @param opts  { count, perVideo, seed, themes:[ids], emojiSets:[ids], rotateHook, titleTemplate }
   */
  Batch.makeVariants = function (base, bank, opts) {
    opts = Object.assign({ count: 5, perVideo: 5, seed: base.seed || 1, themes: null, emojiSets: ['classique'], rotateHook: true, titleTemplate: '{title} #{n}' }, opts || {});
    const rng = Core.rng(opts.seed);
    const themes = (opts.themes && opts.themes.length ? opts.themes : Script.THEMES.map(t => t.id)).map(id => Script.THEMES.find(t => t.id === id)).filter(Boolean);
    const sets = (opts.emojiSets && opts.emojiSets.length ? opts.emojiSets : ['classique']).map(id => Batch.EMOJI_SETS[id]).filter(Boolean);
    const out = [];
    const seen = new Set();
    const k = Math.max(1, Math.min(opts.perVideo, bank.length));
    let pool = rng.shuffle(bank);
    let cursor = 0;
    for (let n = 0; n < opts.count; n++) {
      // sélection glissante : on parcourt la banque mélangée, puis on remélange
      let chosen = [];
      let attempts = 0;
      do {
        if (cursor + k > pool.length) { pool = rng.shuffle(bank); cursor = 0; }
        chosen = pool.slice(cursor, cursor + k);
        cursor += k;
        attempts++;
        const key = chosen.map(s => s.id || s.title).sort().join('|');
        if (!seen.has(key) || bank.length <= k || attempts > 8) { seen.add(key); break; }
      } while (true);
      if (opts.rotateHook && chosen.length > 1) { const r = n % chosen.length; chosen = chosen.slice(r).concat(chosen.slice(0, r)); }
      const p = Core.deepClone(base);
      p.id = Core.uid('prj');
      p.seed = opts.seed * 1000 + n;
      p.title = opts.titleTemplate.replace('{title}', base.title).replace('{n}', String(n + 1));
      p.theme = Object.assign({}, p.theme, themes[n % themes.length]);
      const set = sets[n % sets.length];
      p.sketches = chosen.map((s, i) => { const c = Core.deepClone(s); c.id = Core.uid('sk'); if (set) c.emoji = set[(i + n) % set.length]; return c; });
      out.push(Script.normalizeProject(p));
    }
    return out;
  };

  /**
   * File d'attente : exécute renderFn(job, progressCb, signal) séquentiellement.
   * Événements : onJob(job), onProgress(job, ratio, msg), onDone(job, result), onError(job, err), onFinish()
   */
  Batch.Queue = class {
    constructor() { this.jobs = []; this.running = false; this.cancelled = false; this.handlers = {}; this.current = null; }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, ...a) { (this.handlers[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
    add(job) { job.status = 'pending'; job.id = job.id || Core.uid('job'); this.jobs.push(job); return job; }
    clear() { if (!this.running) this.jobs = []; }
    cancel() { this.cancelled = true; if (this.current && this.current.abort) this.current.abort.abort(); }
    async run(renderFn) {
      if (this.running) return;
      this.running = true; this.cancelled = false;
      for (const job of this.jobs) {
        if (this.cancelled) { if (job.status === 'pending') job.status = 'cancelled'; continue; }
        if (job.status !== 'pending') continue;
        job.status = 'running'; this.current = job;
        job.abort = (typeof AbortController !== 'undefined') ? new AbortController() : { abort() { this.aborted = true; }, signal: { aborted: false } };
        this.emit('job', job);
        try {
          const res = await renderFn(job, (ratio, msg) => this.emit('progress', job, ratio, msg), job.abort.signal);
          if (this.cancelled) { job.status = 'cancelled'; this.emit('error', job, new Error('Annulé')); }
          else { job.status = 'done'; job.result = res; this.emit('done', job, res); }
        } catch (e) {
          job.status = this.cancelled ? 'cancelled' : 'error'; job.error = e; this.emit('error', job, e);
        }
      }
      this.current = null; this.running = false; this.emit('finish');
    }
  };

  NS.Batch = Batch;
  if (typeof module !== 'undefined' && module.exports) module.exports = Batch;
})(typeof window !== 'undefined' ? window : globalThis);
