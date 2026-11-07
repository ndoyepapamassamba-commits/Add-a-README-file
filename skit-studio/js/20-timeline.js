/* =====================================================================
   Skit Studio — 20-timeline.js
   Transforme un projet + durées audio mesurées en liste de segments datés.
   Structure reproduite de la référence :
     [accroche : sketch 1 sans carte]  réaction → titre → répliques ... → réaction → outro
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core || (typeof require !== 'undefined' ? require('./00-core.js') : null);

  const Timeline = {};

  Timeline.lineKey = (si, li) => `${si}:${li}`;

  /**
   * @param project  projet normalisé
   * @param measured objet { "si:li": { duration:number, buffer?:AudioBuffer } } (facultatif)
   * @returns { segments:[], total:number }
   */
  Timeline.build = function (project, measured) {
    measured = measured || {};
    const T = project.timing;
    const L = project.layout;
    const segs = [];
    let t = 0;
    const push = (s) => { s.start = t; t += s.dur; segs.push(s); return s; };

    project.sketches.forEach((sk, si) => {
      const isFirst = si === 0;
      const cold = isFirst && L.hookFirst;
      if (!cold) {
        if (L.reactionCards && !isFirst) push({ type: 'reaction', dur: T.reaction, sketch: si - 1, emoji: project.sketches[si - 1].emoji });
        if (L.titleCards) push({ type: 'title', dur: T.title, sketch: si, num: si + 1, count: project.sketches.length, title: sk.title, emoji: sk.emoji });
      }
      sk.lines.forEach((ln, li) => {
        const m = measured[Timeline.lineKey(si, li)];
        const ch = project.characters.find(c => c.id === ln.speaker) || project.characters[0];
        const spoken = m && m.duration > 0 ? m.duration : Core.estimateSpeechSeconds(ln.text, ch.voice && ch.voice.rate);
        const isPunch = li === sk.lines.length - 1;
        let dur = Math.max(T.minLine, spoken + T.pad);
        if (isPunch) dur = Math.max(dur, T.closeMin);
        push({ type: 'line', dur, sketch: si, line: li, speaker: ln.speaker, text: ln.text, emoji: ln.emoji, shot: ln.shot, emotion: ln.emotion, spoken, punch: isPunch, audio: m && m.buffer ? m.buffer : null, audioUrl: ln.audioUrl || '' });
      });
    });

    if (project.sketches.length) {
      if (L.reactionCards) { const last = project.sketches[project.sketches.length - 1]; push({ type: 'reaction', dur: T.reaction, sketch: project.sketches.length - 1, emoji: last.emoji }); }
      if (L.outro && L.outro.enabled) push({ type: 'outro', dur: T.outro, line1: L.outro.line1, line2: L.outro.line2, emoji: L.outro.emoji });
    }
    segs.forEach((s, i) => { s.index = i; s.end = s.start + s.dur; });
    return { segments: segs, total: t };
  };

  /** Segment actif à l'instant t (le dernier si t dépasse). */
  Timeline.at = function (segments, t) {
    if (!segments.length) return null;
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segments[mid].end <= t) lo = mid + 1; else hi = mid; }
    return segments[lo];
  };

  /** Liste des "coupes" (débuts de segments) utile pour transitions. */
  Timeline.cuts = (segments) => segments.map(s => s.start);

  NS.Timeline = Timeline;
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
})(typeof window !== 'undefined' ? window : globalThis);
