/* =====================================================================
   Skit Studio — 61-sketch.js
   Esquisse de secours (décor + silhouettes) utilisée UNIQUEMENT quand aucune image IA n'est disponible hors ligne. Le pipeline principal anime de vraies images (60-animator.js).
   Personnages style cartoon : grande tête, grands yeux, sourcils et bouche
   pilotés par l'émotion et par l'enveloppe audio (ouverture de bouche).
   Tous les tracés sont exprimés dans un repère 1080×1920 puis mis à l'échelle.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core;

  const Avatars = {};

  /* ------------------------------ Décors ------------------------------ */
  const SCENES = {
    salon: { sky: ['#f7e7cf', '#e6c9a3'], floor: '#8a5a3a', accent: '#c0392b', label: 'Salon' },
    chambre: { sky: ['#dfe9f5', '#b9cde4'], floor: '#6b4a37', accent: '#7c5cbf', label: 'Chambre' },
    cuisine: { sky: ['#fff4d6', '#f6d79b'], floor: '#9c6b4a', accent: '#2e86de', label: 'Cuisine' },
    marche: { sky: ['#ffe5b4', '#ffb15e'], floor: '#b07a4f', accent: '#27ae60', label: 'Marché' },
    bureau: { sky: ['#e8eef7', '#c9d4e6'], floor: '#5d6d7e', accent: '#1f618d', label: 'Bureau' },
    rue: { sky: ['#9ad0ff', '#ffd8a8'], floor: '#777', accent: '#e67e22', label: 'Rue' },
    ecole: { sky: ['#f0f3e0', '#cfd8a8'], floor: '#8d6e4f', accent: '#1e8449', label: 'École' },
    boutique: { sky: ['#ffe9e0', '#ffc9b0'], floor: '#7e5a3c', accent: '#d35400', label: 'Boutique' }
  };
  Avatars.SCENES = SCENES;

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  Avatars.roundRect = rr;

  /**
   * Dessine un décor dans un repère W×H (déjà transformé par l'appelant).
   * @param zoom  1 = plan large ; >1 gros plan (le décor devient flou/sombre)
   */
  Avatars.drawScene = function (ctx, W, H, id, t, zoom) {
    const sc = SCENES[id] || SCENES.salon;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sc.sky[0]); g.addColorStop(1, sc.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const horizon = H * 0.62;
    ctx.save();
    switch (id) {
      case 'rue': {
        // immeubles
        const rng = Core.rng(3);
        for (let i = 0; i < 7; i++) { const bw = W * 0.14, bx = i * bw * 1.05 - W * 0.05, bh = H * (0.2 + rng() * 0.25); ctx.fillStyle = Core.mixHex('#b8c3d0', '#7d8aa0', rng()); ctx.fillRect(bx, horizon - bh, bw, bh); ctx.fillStyle = 'rgba(255,230,150,.7)'; for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) if (rng() > 0.4) ctx.fillRect(bx + 18 + c * bw * 0.45, horizon - bh + 30 + r * bh * 0.17, bw * 0.3, bh * 0.1); }
        ctx.fillStyle = '#6d6d6d'; ctx.fillRect(0, horizon, W, H - horizon);
        ctx.fillStyle = '#f1c40f'; for (let i = 0; i < 6; i++) ctx.fillRect(i * W * 0.2 + W * 0.05, horizon + (H - horizon) * 0.5, W * 0.1, 14);
        break;
      }
      case 'marche': {
        ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon, W, H - horizon);
        const cols = ['#e74c3c', '#f1c40f', '#27ae60', '#2980b9'];
        for (let i = 0; i < 4; i++) { const x = i * W * 0.27 - W * 0.04, y = horizon - H * 0.2; ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * 0.28, y); ctx.lineTo(x + W * 0.25, y + 60); ctx.lineTo(x + 30, y + 60); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#8e5a3b'; ctx.fillRect(x + 40, y + 60, 14, H * 0.2); ctx.fillRect(x + W * 0.28 - 60, y + 60, 14, H * 0.2); ctx.fillStyle = '#c47f4a'; ctx.fillRect(x + 30, y + H * 0.15, W * 0.24, 50); ctx.fillStyle = cols[(i + 1) % 4]; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + 60 + k * 45, y + H * 0.15 - 10, 18, 0, 7); ctx.fill(); } }
        break;
      }
      case 'chambre': {
        ctx.fillStyle = '#e9d8c3'; ctx.fillRect(0, horizon - H * 0.03, W, H);
        ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon + H * 0.08, W, H);
        // fenêtre
        ctx.fillStyle = '#bde3ff'; ctx.fillRect(W * 0.62, H * 0.18, W * 0.28, H * 0.22); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(W * 0.62, H * 0.18, W * 0.28, H * 0.22); ctx.beginPath(); ctx.moveTo(W * 0.76, H * 0.18); ctx.lineTo(W * 0.76, H * 0.4); ctx.stroke();
        // lit
        ctx.fillStyle = sc.accent; rr(ctx, W * 0.05, horizon - H * 0.02, W * 0.55, H * 0.16, 30); ctx.fill(); ctx.fillStyle = '#fff'; rr(ctx, W * 0.08, horizon - H * 0.05, W * 0.2, H * 0.06, 18); ctx.fill();
        ctx.fillStyle = '#5b3b2a'; ctx.fillRect(W * 0.03, horizon - H * 0.12, 24, H * 0.25);
        // lampe
        ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.moveTo(W * 0.3, H * 0.3); ctx.lineTo(W * 0.4, H * 0.3); ctx.lineTo(W * 0.43, H * 0.38); ctx.lineTo(W * 0.27, H * 0.38); ctx.closePath(); ctx.fill();
        break;
      }
      case 'cuisine': {
        ctx.fillStyle = '#fbe9c8'; ctx.fillRect(0, 0, W, horizon); ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon, W, H);
        ctx.fillStyle = '#d6b58b'; for (let i = 0; i < 6; i++) ctx.fillRect(i * W * 0.17 + 10, H * 0.14, W * 0.15, H * 0.12);
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(0, horizon - H * 0.1, W, H * 0.1); ctx.fillStyle = '#2c3e50'; ctx.fillRect(W * 0.1, horizon - H * 0.17, W * 0.3, H * 0.07);
        ctx.fillStyle = sc.accent; ctx.beginPath(); ctx.arc(W * 0.7, horizon - H * 0.13, 55, 0, 7); ctx.fill(); ctx.fillStyle = '#333'; ctx.fillRect(W * 0.7 + 50, horizon - H * 0.14, 90, 14);
        break;
      }
      case 'bureau': {
        ctx.fillStyle = '#e3e8f0'; ctx.fillRect(0, 0, W, horizon); ctx.fillStyle = '#c5ced9'; ctx.fillRect(0, horizon, W, H);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(W * 0.1 + i * W * 0.3, H * 0.15, W * 0.22, H * 0.2);
        ctx.fillStyle = '#5d6d7e'; ctx.fillRect(W * 0.05, horizon - H * 0.06, W * 0.9, H * 0.06); ctx.fillStyle = '#2c3e50'; ctx.fillRect(W * 0.6, horizon - H * 0.2, W * 0.28, H * 0.14); ctx.fillStyle = '#5dade2'; ctx.fillRect(W * 0.62, horizon - H * 0.19, W * 0.24, H * 0.12);
        break;
      }
      case 'ecole': {
        ctx.fillStyle = '#f4f1e1'; ctx.fillRect(0, 0, W, horizon); ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon, W, H);
        ctx.fillStyle = '#1e5631'; ctx.fillRect(W * 0.1, H * 0.12, W * 0.8, H * 0.3); ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 16; ctx.strokeRect(W * 0.1, H * 0.12, W * 0.8, H * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 60px sans-serif'; ctx.fillText('2 + 2 = 5 ?', W * 0.18, H * 0.25); ctx.fillText('a² + b² = c²', W * 0.18, H * 0.34);
        break;
      }
      case 'boutique': {
        ctx.fillStyle = '#f7d9c4'; ctx.fillRect(0, 0, W, horizon); ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon, W, H);
        const cols = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];
        for (let r = 0; r < 3; r++) { ctx.fillStyle = '#8e5a3b'; ctx.fillRect(W * 0.05, H * 0.14 + r * H * 0.13, W * 0.9, 14); for (let c = 0; c < 8; c++) { ctx.fillStyle = cols[(r + c) % 5]; ctx.fillRect(W * 0.07 + c * W * 0.11, H * 0.14 + r * H * 0.13 - 70, W * 0.08, 70); } }
        ctx.fillStyle = '#5b3b2a'; ctx.fillRect(W * 0.1, horizon - H * 0.08, W * 0.8, H * 0.08);
        break;
      }
      default: { // salon
        ctx.fillStyle = '#f3e3cb'; ctx.fillRect(0, 0, W, horizon); ctx.fillStyle = sc.floor; ctx.fillRect(0, horizon, W, H);
        ctx.fillStyle = '#bde3ff'; ctx.fillRect(W * 0.6, H * 0.14, W * 0.3, H * 0.24); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(W * 0.6, H * 0.14, W * 0.3, H * 0.24);
        ctx.fillStyle = '#7d3c98'; ctx.fillRect(W * 0.12, H * 0.2, W * 0.2, H * 0.14); ctx.strokeStyle = '#c9a66b'; ctx.lineWidth = 12; ctx.strokeRect(W * 0.12, H * 0.2, W * 0.2, H * 0.14);
        ctx.fillStyle = sc.accent; rr(ctx, W * 0.08, horizon - H * 0.09, W * 0.84, H * 0.12, 36); ctx.fill(); ctx.fillStyle = Core.mixHex(sc.accent, '#000', 0.2); rr(ctx, W * 0.06, horizon - H * 0.03, W * 0.88, H * 0.07, 30); ctx.fill();
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(W * 0.3, H * 0.78, W * 0.4, 8);
      }
    }
    ctx.restore();
    // vignette + assombrissement en gros plan
    const v = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.3, W / 2, H * 0.45, W * 1.1);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + (0.35 + 0.25 * Math.min(1, (zoom || 1) - 1)) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  };

  /* --------------------------- Personnages --------------------------- */
  const EMO = {
    neutral: { brow: 0, browUp: 0, eye: 1, mouth: 'flat', pupil: 1 },
    happy: { brow: 0.1, browUp: 0.3, eye: 0.85, mouth: 'smile', pupil: 1 },
    angry: { brow: -0.55, browUp: -0.25, eye: 0.8, mouth: 'frown', pupil: 0.85 },
    shocked: { brow: 0.15, browUp: 0.9, eye: 1.35, mouth: 'o', pupil: 0.7 },
    sad: { brow: 0.45, browUp: 0.2, eye: 0.9, mouth: 'frown', pupil: 1.1 },
    smug: { brow: -0.2, browUp: 0.1, eye: 0.65, mouth: 'smirk', pupil: 0.9 },
    confused: { brow: 0.3, browUp: 0.5, eye: 1, mouth: 'wavy', pupil: 1 }
  };
  Avatars.EMOTIONS = EMO;

  /**
   * Dessine un personnage centré en (x, y) (centre de la tête), échelle s (1 = tête de 260 px).
   * state : { emotion, mouth:0..1, blink:0..1, talking:bool, facing:-1|1, t }
   */
  Avatars.drawCharacter = function (ctx, x, y, s, char, state) {
    const av = char.avatar || {}; const e = EMO[state.emotion] || EMO.neutral;
    const skin = av.skin || '#6b3a1e', hair = av.hair || '#1a0d08', outfit = av.outfit || char.color || '#2563eb', fem = av.style === 'f';
    const t = state.t || 0;
    const facing = state.facing || 1;
    const bob = Math.sin(t * 2.2) * 4 + (state.talking ? Math.sin(t * 14) * 3 : 0);
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(s * facing, s);
    const R = 130;
    // Corps / épaules
    ctx.fillStyle = outfit; ctx.beginPath(); ctx.moveTo(-170, R + 90); ctx.quadraticCurveTo(-180, R * 1.1, -70, R * 0.95); ctx.lineTo(70, R * 0.95); ctx.quadraticCurveTo(180, R * 1.1, 170, R + 90); ctx.lineTo(170, R + 420); ctx.lineTo(-170, R + 420); ctx.closePath(); ctx.fill();
    // motif wax
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(-140 + i * 70, R + 130 + j * 60, 12, 0, 7); ctx.fill(); } ctx.restore();
    // cou
    ctx.fillStyle = Core.mixHex(skin, '#000', 0.12); ctx.fillRect(-42, R * 0.7, 84, R * 0.4);
    // oreilles
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(-R * 0.98, 10, 26, 38, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(R * 0.98, 10, 26, 38, 0, 0, 7); ctx.fill();
    if (fem) { ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(-R * 0.98, 50, 16, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(R * 0.98, 50, 16, 0, 7); ctx.fill(); }
    // tête
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 0, R, R * 1.12, 0, 0, 7); ctx.fill();
    // ombre de joues
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.ellipse(0, R * 0.55, R * 0.9, R * 0.45, 0, 0, 7); ctx.fill();
    // cheveux
    ctx.fillStyle = hair;
    if (fem) {
      ctx.beginPath(); ctx.ellipse(0, -R * 0.55, R * 1.08, R * 0.75, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -R * 1.05, R * 0.42, 0, 7); ctx.fill(); // chignon
      ctx.beginPath(); ctx.ellipse(-R * 0.95, -R * 0.2, R * 0.2, R * 0.6, 0.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(R * 0.95, -R * 0.2, R * 0.2, R * 0.6, -0.2, 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(0, -R * 0.62, R * 1.02, R * 0.62, 0, Math.PI, 0); ctx.fill();
      if (av.beard !== false) { ctx.fillStyle = Core.mixHex(hair, skin, 0.35); ctx.beginPath(); ctx.ellipse(0, R * 0.72, R * 0.62, R * 0.42, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, R * 0.55, R * 0.42, R * 0.26, 0, 0, 7); ctx.fill(); }
    }
    // yeux
    const eyeY = -R * 0.08, eyeDX = R * 0.42, ew = R * 0.3, eh = R * 0.36 * e.eye;
    const blink = 1 - (state.blink || 0);
    [-1, 1].forEach(side => {
      const ex = side * eyeDX;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, eyeY, ew, Math.max(2, eh * blink), 0, 0, 7); ctx.fill();
      if (blink > 0.3) {
        const look = (state.look || 0) * 10;
        ctx.fillStyle = '#7a4a12'; ctx.beginPath(); ctx.arc(ex + look + side * 4, eyeY + 6, ew * 0.48 * e.pupil, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + look + side * 4, eyeY + 6, ew * 0.28 * e.pupil, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + look + side * 4 - 8, eyeY - 4, ew * 0.12, 0, 7); ctx.fill();
      }
      // sourcil
      ctx.strokeStyle = hair; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath();
      const by = eyeY - eh - 26 - e.browUp * 26;
      const tilt = e.brow * 22 * side; // angry : intérieur bas
      ctx.moveTo(ex - ew * 0.9, by + (side < 0 ? -tilt : tilt) * -1); ctx.lineTo(ex + ew * 0.9, by + (side < 0 ? tilt : -tilt) * -1); ctx.stroke();
    });
    // nez
    ctx.fillStyle = Core.mixHex(skin, '#000', 0.18); ctx.beginPath(); ctx.ellipse(0, R * 0.3, R * 0.18, R * 0.12, 0, 0, 7); ctx.fill();
    // bouche
    const my = R * 0.62, open = Core.clamp(state.mouth || 0, 0, 1);
    ctx.fillStyle = '#5a1e1e'; ctx.strokeStyle = '#3a1010'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    const mw = R * (e.mouth === 'o' ? 0.36 : 0.5);
    if (open > 0.08) {
      ctx.beginPath(); ctx.ellipse(0, my + open * 18, mw * (0.7 + open * 0.3), 12 + open * R * 0.34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-mw * 0.5, my + open * 18 - 8 - open * R * 0.3, mw, 10 + open * 6);
    } else {
      ctx.beginPath();
      if (e.mouth === 'smile') { ctx.moveTo(-mw, my); ctx.quadraticCurveTo(0, my + 50, mw, my); }
      else if (e.mouth === 'frown') { ctx.moveTo(-mw, my + 20); ctx.quadraticCurveTo(0, my - 25, mw, my + 20); }
      else if (e.mouth === 'smirk') { ctx.moveTo(-mw * 0.8, my + 8); ctx.quadraticCurveTo(mw * 0.3, my + 24, mw, my - 12); }
      else if (e.mouth === 'o') { ctx.ellipse(0, my + 10, mw * 0.6, mw * 0.8, 0, 0, 7); ctx.fill(); }
      else if (e.mouth === 'wavy') { ctx.moveTo(-mw, my); ctx.quadraticCurveTo(-mw * 0.5, my + 20, 0, my); ctx.quadraticCurveTo(mw * 0.5, my - 20, mw, my); }
      else { ctx.moveTo(-mw * 0.8, my + 4); ctx.lineTo(mw * 0.8, my + 4); }
      ctx.stroke();
    }
    // lunettes optionnelles
    if (av.glasses) { ctx.strokeStyle = '#222'; ctx.lineWidth = 8; [-1, 1].forEach(side => { ctx.beginPath(); ctx.ellipse(side * eyeDX, eyeY, ew * 1.25, eh * 1.1, 0, 0, 7); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(-eyeDX + ew * 1.25, eyeY); ctx.lineTo(eyeDX - ew * 1.25, eyeY); ctx.stroke(); }
    ctx.restore();
  };

  /**
   * Compose un plan complet (décor + personnages) dans un repère W×H.
   * @param opts { scene, chars:[A,B], speakerId, shot:'wide'|'close', emotion, mouth, t, blinkA, blinkB }
   */
  Avatars.drawShot = function (ctx, W, H, opts) {
    const A = opts.chars[0], B = opts.chars[1] || opts.chars[0];
    const speaker = opts.chars.find(c => c.id === opts.speakerId) || A;
    const other = opts.chars.find(c => c.id !== speaker.id) || B;
    const isClose = opts.shot === 'close';
    const t = opts.t || 0;
    const zoom = isClose ? 1.9 : 1;
    ctx.save();
    // décor (légèrement zoomé en gros plan)
    ctx.save(); ctx.translate(W / 2, H * 0.45); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H * 0.45);
    Avatars.drawScene(ctx, W, H, opts.scene, t, zoom);
    ctx.restore();
    const blinkOf = (id) => { const ph = (t * 0.9 + Core.hashString(id) % 7) % 4.1; return ph > 3.9 ? Math.sin((ph - 3.9) / 0.2 * Math.PI) : 0; };
    if (isClose) {
      Avatars.drawCharacter(ctx, W / 2, H * 0.47, 2.35 * (W / 1080), speaker, { emotion: opts.emotion, mouth: opts.mouth, blink: blinkOf(speaker.id), talking: true, facing: 1, t, look: Math.sin(t * 1.3) * 0.4 });
    } else {
      const sA = speaker.id === A.id;
      // le locuteur est à gauche ou à droite selon son identité ; les deux se font face
      const left = sA ? speaker : other, right = sA ? other : speaker;
      Avatars.drawCharacter(ctx, W * 0.3, H * 0.47, 1.05 * (W / 1080), left, { emotion: left.id === speaker.id ? opts.emotion : 'neutral', mouth: left.id === speaker.id ? opts.mouth : 0, blink: blinkOf(left.id), talking: left.id === speaker.id, facing: 1, t, look: 0.5 });
      Avatars.drawCharacter(ctx, W * 0.72, H * 0.5, 1.0 * (W / 1080), right, { emotion: right.id === speaker.id ? opts.emotion : 'neutral', mouth: right.id === speaker.id ? opts.mouth : 0, blink: blinkOf(right.id), talking: right.id === speaker.id, facing: -1, t, look: 0.5 });
    }
    ctx.restore();
  };

  NS.Avatars = Avatars;
})(typeof window !== 'undefined' ? window : globalThis);
