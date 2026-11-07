/* =====================================================================
   Skit Studio — 70-painter.js
   Peintre de frames : (projet, timeline, ressources, t) → image sur Canvas.
   Plans de dialogue : images IA animées par 60-animator.js ; cartes titre /
   réaction / outro ; sous-titres cinétiques ; emojis 3D ; transitions.
   Déterministe : la même entrée produit la même image (export reproductible).
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core, Timeline = NS.Timeline, Assets = NS.Assets, Animator = NS.Animator, Sketch = NS.Avatars;

  const Painter = {};

  /* ------------------------------ Utilitaires ------------------------------ */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  Painter.drawEmoji = function (ctx, emoji, x, y, size, opts) {
    opts = opts || {};
    const img = Assets.emojiImage(emoji);
    ctx.save();
    ctx.translate(x, y); if (opts.rot) ctx.rotate(opts.rot); if (opts.scale) ctx.scale(opts.scale, opts.scale);
    if (opts.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = size * 0.18; ctx.shadowOffsetY = size * 0.08; }
    if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
    else { ctx.font = `${Math.round(size * 0.86)}px ${Assets.EMOJI_STACK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emoji, 0, size * 0.04); }
    ctx.restore();
  };

  function wrapWords(ctx, words, maxW) {
    const lines = []; let cur = [], w = 0; const sp = ctx.measureText(' ').width;
    for (const wd of words) { const ww = ctx.measureText(wd.text).width; if (cur.length && w + sp + ww > maxW) { lines.push(cur); cur = []; w = 0; } cur.push(Object.assign({ w: ww }, wd)); w += (cur.length > 1 ? sp : 0) + ww; }
    if (cur.length) lines.push(cur);
    return lines;
  }

  /* ------------------------------ Fond thème ------------------------------ */
  function themeBg(ctx, W, H, theme, t) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, theme.bg); g.addColorStop(1, theme.bg2 || Core.mixHex(theme.bg, '#000', 0.3));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // halo doux animé
    const r = ctx.createRadialGradient(W * (0.5 + 0.1 * Math.sin(t * 0.7)), H * 0.45, 0, W * 0.5, H * 0.45, W * 0.9);
    r.addColorStop(0, Core.rgba(theme.accent, 0.18)); r.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }

  function sunburst(ctx, W, H, theme, t, alpha) {
    ctx.save(); ctx.translate(W / 2, H * 0.46); ctx.rotate(t * 0.35); ctx.globalAlpha = alpha == null ? 1 : alpha;
    const n = 18, R = Math.hypot(W, H);
    ctx.fillStyle = theme.accent;
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = a0 + Math.PI / n * 0.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function floatingEmojis(ctx, W, H, emojis, t, seed, count) {
    const rng = Core.rng(seed);
    for (let i = 0; i < count; i++) {
      const x0 = rng() * W, speed = 60 + rng() * 90, size = W * (0.07 + rng() * 0.07), ph = rng() * 10, e = emojis[i % emojis.length];
      const y = ((H + size) - ((t * speed + ph * 100) % (H + size * 2)));
      const x = x0 + Math.sin(t * 1.3 + ph) * W * 0.04;
      Painter.drawEmoji(ctx, e, x, y, size, { rot: Math.sin(t + ph) * 0.4, shadow: true });
    }
  }

  function bigText(ctx, text, x, y, size, color, maxW, weight) {
    ctx.font = `${weight || 900} ${size}px ${Assets.FONT_STACK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = size; while (ctx.measureText(text).width > maxW && fs > 20) { fs -= 4; ctx.font = `${weight || 900} ${fs}px ${Assets.FONT_STACK}`; }
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  /* ------------------------------ Cartes ------------------------------ */
  Painter.drawTitleCard = function (ctx, W, H, project, seg, lt) {
    const th = project.theme; themeBg(ctx, W, H, th, lt);
    const pop = Core.easeOutBack(Core.clamp(lt / 0.45, 0, 1));
    const prefix = `${project.layout.titlePrefix || 'SKETCH'} ${seg.num}/${seg.count}`;
    ctx.save(); ctx.globalAlpha = Core.clamp(lt / 0.2, 0, 1);
    bigText(ctx, prefix, W / 2, H * 0.36, W * 0.075, th.accent, W * 0.9, 800);
    ctx.restore();
    ctx.save(); ctx.translate(W / 2, H * 0.455); ctx.scale(pop, pop);
    bigText(ctx, (seg.title || '').toUpperCase(), 0, 0, W * 0.11, th.text, W * 0.9, 900);
    ctx.restore();
    const bounce = 1 + 0.06 * Math.sin(lt * 6);
    Painter.drawEmoji(ctx, seg.emoji || '🤣', W / 2, H * 0.6, W * 0.26 * pop * bounce, { shadow: true, rot: Math.sin(lt * 2.5) * 0.12 });
  };

  Painter.drawReactionCard = function (ctx, W, H, project, seg, lt) {
    const th = project.theme; themeBg(ctx, W, H, th, lt);
    sunburst(ctx, W, H, th, lt, 0.95);
    const grow = Core.easeOutElastic(Core.clamp(lt / 0.9, 0, 1));
    const pulse = 1 + 0.05 * Math.sin(lt * 7);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.46 + W * 0.22, W * 0.3 * grow, W * 0.07 * grow, 0, 0, 7); ctx.fill(); ctx.restore();
    Painter.drawEmoji(ctx, seg.emoji || '😱', W / 2, H * 0.46, W * 0.62 * grow * pulse, { shadow: true });
    floatingEmojis(ctx, W, H, ['🤣', '🎉', '👏', seg.emoji || '😂'], lt, seg.index * 31 + 7, 9);
  };

  Painter.drawOutro = function (ctx, W, H, project, seg, lt) {
    const th = project.theme; themeBg(ctx, W, H, th, lt);
    sunburst(ctx, W, H, th, lt, 0.25);
    const a = Core.clamp(lt / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    bigText(ctx, (seg.line1 || '').toUpperCase(), W / 2, H * 0.38, W * 0.09, th.text, W * 0.9, 800);
    const pop = Core.easeOutBack(Core.clamp((lt - 0.2) / 0.5, 0, 1));
    ctx.save(); ctx.translate(W / 2, H * 0.47); ctx.scale(pop, pop); bigText(ctx, (seg.line2 || '').toUpperCase(), 0, 0, W * 0.115, th.accent, W * 0.9, 900); ctx.restore();
    Painter.drawEmoji(ctx, seg.emoji || '🎉', W / 2, H * 0.6, W * 0.24 * pop, { shadow: true, rot: Math.sin(lt * 3) * 0.15 });
    ctx.restore();
    floatingEmojis(ctx, W, H, ['🎉', '🤣', '👏'], lt, 99, 7);
  };

  /* ------------------------------ Sous-titres ------------------------------ */
  Painter.drawSubtitle = function (ctx, W, H, project, seg, lt, speakerColor) {
    const S = project.subtitles; const th = project.theme;
    const parsed = Core.parseMarked(seg.text, { highlight: S.highlight === 'marked' ? 'marked' : 'auto', lastN: 2 });
    let words = parsed.words.map(w => ({ text: S.uppercase ? w.text.toUpperCase() : w.text, hl: w.hl }));
    const size = Math.round((S.size || 64) * (W / 1080));
    ctx.font = `900 ${size}px ${Assets.FONT_STACK}`; ctx.textBaseline = 'middle';
    const maxW = W * (S.emojiBadge ? 0.72 : 0.84);
    const lines = wrapWords(ctx, words, maxW);
    const lh = size * 1.18, totalH = lines.length * lh;
    const cy = H * (S.position || 0.78);
    const hlColor = S.speakerColors && speakerColor ? speakerColor : th.accent;
    // progression mot par mot
    const n = words.length; const spoken = Math.max(0.3, seg.spoken);
    const perWord = (i) => Core.clamp((lt - 0.05 - i * spoken / n) / 0.12, 0, 1);
    const pop = S.mode === 'phrase' ? Core.easeOutBack(Core.clamp(lt / 0.22, 0, 1)) : 1;
    let activeIdx = S.mode === 'karaoke' ? Math.min(n - 1, Math.floor(Core.clamp((lt - 0.05) / spoken, 0, 0.999) * n)) : -1;
    ctx.save();
    ctx.translate(W / 2 - (S.emojiBadge ? W * 0.05 : 0), cy); ctx.scale(pop, pop);
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.19; ctx.strokeStyle = 'rgba(0,0,0,.92)';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = size * 0.15; ctx.shadowOffsetY = size * 0.05;
    let idx = 0;
    lines.forEach((ln, li) => {
      const sp = ctx.measureText(' ').width;
      const lineW = ln.reduce((a, w) => a + w.w, 0) + sp * (ln.length - 1);
      let x = -lineW / 2; const y = -totalH / 2 + lh * (li + 0.5);
      ln.forEach(w => {
        let vis = 1, sc = 1;
        if (S.mode === 'words') { vis = perWord(idx); sc = Core.easeOutBack(vis); }
        if (S.mode === 'karaoke' && idx === activeIdx) sc = 1.14;
        if (vis > 0) {
          ctx.save(); ctx.translate(x + w.w / 2, y); ctx.scale(sc, sc); ctx.globalAlpha = vis; ctx.textAlign = 'center';
          ctx.strokeText(w.text, 0, 0);
          ctx.fillStyle = (w.hl || (S.mode === 'karaoke' && idx === activeIdx)) ? hlColor : th.text; ctx.fillText(w.text, 0, 0);
          ctx.restore();
        }
        x += w.w + sp; idx++;
      });
    });
    ctx.restore();
    if (S.emojiBadge && seg.emoji) {
      const bs = W * 0.11; const bx = W / 2 + maxW / 2 + bs * 0.65, by = cy + Math.sin(lt * 5) * bs * 0.08;
      Painter.drawEmoji(ctx, seg.emoji, bx, by, bs * Core.easeOutBack(Core.clamp((lt - 0.1) / 0.35, 0, 1)), { shadow: true, rot: Math.sin(lt * 3) * 0.15 });
    }
  };

  /* ------------------------------ Plan de dialogue ------------------------------ */
  /**
   * resources : { assetFor(seg) → asset Animator | null, imageFor(seg) → HTMLImageElement | null, envFor(seg) → Float32Array|null, visFor(seg) }
   */
  Painter.drawLine = function (ctx, W, H, project, seg, lt, res) {
    const sk = project.sketches[seg.sketch];
    const chars = project.characters; const speaker = chars.find(c => c.id === seg.speaker) || chars[0];
    const speakerIdx = Math.max(0, chars.findIndex(c => c.id === speaker.id));
    // caméra : Ken Burns + coup de zoom à la coupe + secousse sur la punchline
    const cut = Core.easeOutCubic(Core.clamp(lt / 0.3, 0, 1));
    const kb = 1 + 0.05 * Core.clamp(lt / Math.max(0.5, seg.dur), 0, 1) + (seg.punch ? 0.1 * (1 - cut) : 0.04 * (1 - cut));
    const shake = seg.punch && lt < 0.45 ? [Math.sin(lt * 70) * W * 0.012 * (1 - lt / 0.45), Math.cos(lt * 55) * W * 0.008 * (1 - lt / 0.45)] : null;
    const panX = (seg.shot === 'wide' ? (speakerIdx === 0 ? -0.02 : 0.02) : 0) * Core.clamp(lt / seg.dur, 0, 1);
    const asset = res.assetFor(seg);
    if (asset) {
      const speakerFace = asset.faces.length > 1 ? Math.min(speakerIdx, asset.faces.length - 1) : 0;
      const listener = seg.punch ? 'shocked' : 'neutral';
      const states = Animator.statesForLine({ t: lt, seg, asset, speakerFace, listenerEmotion: listener, env: res.envFor(seg), fps: project.fps, vis: res.visFor(seg) });
      const V = project.visual || {};
      Animator.renderShot(ctx, W, H, { asset, states, shake, camera: { zoom: kb, pan: [panX, -0.01 * Core.clamp(lt / seg.dur, 0, 1)], off: [Math.sin(lt * 0.9) * 0.012 + panX * 0.4, Math.cos(lt * 0.7) * 0.008], strength: V.parallax === false ? 0 : (V.strength == null ? 1 : V.strength), dzoom: 0.05 } });
    } else {
      const img = res.imageFor(seg);
      ctx.save(); if (shake) ctx.translate(shake[0], shake[1]);
      if (img) NS.Warp.drawCover(ctx, img, W, H, { zoom: kb, pan: [panX, 0] });
      else if ((project.visual || {}).fallbackSketch !== false && Sketch) {
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(kb, kb); ctx.translate(-W / 2, -H / 2);
        Sketch.drawShot(ctx, W, H, { scene: sk.scene, chars, speakerId: speaker.id, shot: seg.shot, emotion: seg.emotion, mouth: 0.5 + 0.5 * Math.sin(lt * 18), t: lt });
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, W * 0.1, H * 0.08, W * 0.8, H * 0.05, 20); ctx.fill();
        ctx.font = `700 ${Math.round(W * 0.028)}px ${Assets.FONT_STACK}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ESQUISSE — image IA en attente', W / 2, H * 0.105);
      } else { themeBg(ctx, W, H, project.theme, lt); }
      ctx.restore();
    }
    // dégradé bas pour la lisibilité des sous-titres
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
    // étiquette du locuteur (discrète)
    if (project.subtitles.speakerColors) {
      ctx.save(); ctx.globalAlpha = Core.clamp(lt / 0.3, 0, 1);
      ctx.font = `800 ${Math.round(W * 0.03)}px ${Assets.FONT_STACK}`; const name = speaker.name.toUpperCase(); const tw = ctx.measureText(name).width + W * 0.05;
      const bx = W / 2 - tw / 2, by = H * (project.subtitles.position || 0.78) - H * 0.09 - W * 0.02;
      ctx.fillStyle = speaker.color; rr(ctx, bx, by, tw, W * 0.045, W * 0.0225); ctx.fill();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, W / 2, by + W * 0.0225);
      ctx.restore();
    }
    Painter.drawSubtitle(ctx, W, H, project, seg, lt, speaker.color);
  };

  /* ------------------------------ Entrée principale ------------------------------ */
  Painter.paint = function (ctx, W, H, project, timeline, t, res) {
    const seg = Timeline.at(timeline.segments, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!seg) { themeBg(ctx, W, H, project.theme, t); return; }
    const lt = t - seg.start;
    switch (seg.type) {
      case 'title': Painter.drawTitleCard(ctx, W, H, project, seg, lt); break;
      case 'reaction': Painter.drawReactionCard(ctx, W, H, project, seg, lt); break;
      case 'outro': Painter.drawOutro(ctx, W, H, project, seg, lt); break;
      default: Painter.drawLine(ctx, W, H, project, seg, lt, res);
    }
    // fondu d'entrée sur les cartes (coupe franche sur les dialogues, comme la référence)
    if (seg.type !== 'line' && lt < 0.12) { ctx.fillStyle = `rgba(0,0,0,${1 - lt / 0.12})`; ctx.fillRect(0, 0, W, H); }
    if (project.layout.watermark) {
      ctx.save(); ctx.globalAlpha = 0.8; ctx.font = `800 ${Math.round(W * 0.026)}px ${Assets.FONT_STACK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = W * 0.006; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(project.layout.watermark, W / 2, H * 0.03); ctx.fillStyle = '#fff'; ctx.fillText(project.layout.watermark, W / 2, H * 0.03); ctx.restore();
    }
  };

  NS.Painter = Painter;
})(typeof window !== 'undefined' ? window : globalThis);
