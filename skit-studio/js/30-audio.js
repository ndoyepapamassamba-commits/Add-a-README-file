/* =====================================================================
   Skit Studio — 30-audio.js
   Web Audio : décodage, voix procédurale « bip » (style jeu vidéo),
   effets sonores synthétisés, mixage hors ligne (OfflineAudioContext),
   enveloppe d'amplitude par image (pour l'animation de la bouche).
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core;

  const Audio = {};
  Audio.SAMPLE_RATE = 48000;
  let _ctx = null;

  Audio.ctx = function () {
    if (!_ctx) { const AC = root.AudioContext || root.webkitAudioContext; _ctx = new AC({ sampleRate: Audio.SAMPLE_RATE }); }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  };

  Audio.decode = async function (arrayBuffer) {
    const ctx = Audio.ctx();
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  };

  Audio.fetchBuffer = async function (url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Audio introuvable : ' + url);
    return Audio.decode(await r.arrayBuffer());
  };

  Audio.fromFile = async function (file) { return Audio.decode(await file.arrayBuffer()); };

  /* ------------------------------------------------------------------
     Voix procédurale : une note courte par syllabe, timbre filtré,
     hauteur de base par personnage, montée en fin de question.
     ------------------------------------------------------------------ */
  Audio.synthBlipVoice = async function (text, opts) {
    opts = opts || {};
    const rate = Core.clamp(opts.rate || 1, 0.5, 2);
    const pitch = Core.clamp(opts.pitch || 1, 0.5, 2);
    const syl = Core.syllables(text);
    const plain = Core.stripMarks(text);
    const per = 0.11 / rate, gap = 0.035 / rate;
    const dur = Math.max(0.3, syl.length * (per + gap) + 0.15);
    const sr = Audio.SAMPLE_RATE;
    const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
    const rng = Core.rng(Core.hashString(plain));
    const base = 190 * pitch;
    const isQuestion = /\?\s*$/.test(plain);
    const master = off.createGain(); master.gain.value = 0.9; master.connect(off.destination);
    const comp = off.createDynamicsCompressor(); comp.threshold.value = -18; comp.connect(master);
    let t = 0.02;
    syl.forEach((s, i) => {
      const prog = i / Math.max(1, syl.length - 1);
      let f = base * (1 + (rng() - 0.5) * 0.25);
      if (isQuestion) f *= 1 + 0.35 * Math.pow(prog, 3);
      if (/[!]/.test(plain)) f *= 1.05;
      const osc = off.createOscillator();
      osc.type = pitch >= 1 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f * 1.08, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + per * 0.6);
      const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600 + rng() * 900; bp.Q.value = 1.2;
      const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200 * pitch;
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.25, t + per * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + per);
      osc.connect(bp); bp.connect(lp); lp.connect(g); g.connect(comp);
      osc.start(t); osc.stop(t + per + 0.02);
      t += per + gap + (s.index === s.count - 1 ? gap * 0.8 : 0);
    });
    return off.startRendering();
  };

  /* ------------------------------------------------------------------
     Effets sonores synthétisés (aucun fichier requis)
     ------------------------------------------------------------------ */
  function noiseBuffer(ctx, seconds) {
    const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }

  /** Souffle de transition (bruit filtré balayé). */
  Audio.sfxWhoosh = function (ctx, at, vol) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(3000, at + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(at); src.stop(at + 0.5);
  };

  /** « Pop » d'apparition. */
  Audio.sfxPop = function (ctx, at, vol) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900, at); o.frequency.exponentialRampToValueAtTime(300, at + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.16);
  };

  /** « Ding » lumineux (outro, titre). */
  Audio.sfxDing = function (ctx, at, vol) {
    [1046.5, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at + i * 0.07); g.gain.exponentialRampToValueAtTime(vol * 0.6, at + i * 0.07 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.07 + 0.9);
      o.connect(g); g.connect(ctx.destination); o.start(at + i * 0.07); o.stop(at + 1.1);
    });
  };

  /** « Ba-dum-tss » : grosse caisse, caisse claire, cymbale. */
  Audio.sfxRimshot = function (ctx, at, vol) {
    const kick = (t) => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18); const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.22); };
    const snare = (t) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.25); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.8, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 0.25); kick(t); };
    const crash = (t) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 1.2); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000; const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 1.2); };
    kick(at); snare(at + 0.17); crash(at + 0.34);
  };

  /** Rire de foule synthétique (salves de voyelles filtrées, plusieurs voix). */
  Audio.sfxLaugh = function (ctx, at, vol, seed) {
    const rng = Core.rng(seed || 7);
    const voices = 5;
    for (let v = 0; v < voices; v++) {
      const base = 160 + rng() * 220;
      const n = 5 + rng.int(4);
      let t = at + rng() * 0.12;
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const f = base * (1 - i * 0.03) * (1 + (rng() - 0.5) * 0.08);
        o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + rng() * 700; bp.Q.value = 2;
        const g = ctx.createGain(); const a = vol * 0.22 * (1 - i / (n + 2));
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(bp); bp.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.13);
        t += 0.13 + rng() * 0.03;
      }
    }
  };

  /* ------------------------------------------------------------------
     Mixage hors ligne de toute la vidéo
     ------------------------------------------------------------------ */
  /**
   * @param project   projet normalisé
   * @param timeline  { segments, total }
   * @param extra     { music:AudioBuffer|null, laugh:AudioBuffer|null }
   * @returns AudioBuffer stéréo 48 kHz
   */
  Audio.mix = async function (project, timeline, extra) {
    extra = extra || {};
    const sr = Audio.SAMPLE_RATE;
    const total = Math.max(0.5, timeline.total);
    const off = new OfflineAudioContext(2, Math.ceil(total * sr) + sr, sr);
    const sfxOn = project.audio.sfx.enabled;
    const sfxVol = Core.clamp(project.audio.sfx.volume, 0, 1);

    // Voix
    const voiceBus = off.createGain(); voiceBus.gain.value = 1; voiceBus.connect(off.destination);
    for (const s of timeline.segments) {
      if (s.type === 'line' && s.audio) {
        const src = off.createBufferSource(); src.buffer = s.audio; src.connect(voiceBus); src.start(s.start + 0.05);
      }
    }

    // Effets
    if (sfxOn) {
      for (const s of timeline.segments) {
        if (s.type === 'title') { Audio.sfxWhoosh(off, s.start, sfxVol * 0.5); Audio.sfxPop(off, s.start + 0.25, sfxVol * 0.5); }
        else if (s.type === 'reaction') { Audio.sfxPop(off, s.start, sfxVol * 0.6); if (project.audio.laughOnPunchline) { if (extra.laugh) { const l = off.createBufferSource(); l.buffer = extra.laugh; const g = off.createGain(); g.gain.value = sfxVol; l.connect(g); g.connect(off.destination); l.start(s.start + 0.05); l.stop(Math.min(s.end + 0.3, s.start + 0.05 + extra.laugh.duration)); } else Audio.sfxLaugh(off, s.start + 0.05, sfxVol, s.index * 13 + 1); } }
        else if (s.type === 'outro') Audio.sfxDing(off, s.start, sfxVol);
        else if (s.type === 'line' && s.punch) Audio.sfxRimshot(off, Math.max(s.start, s.end - 0.75), sfxVol * 0.7);
        else if (s.type === 'line' && s.line === 0) Audio.sfxWhoosh(off, s.start, sfxVol * 0.25);
      }
    }

    // Musique en boucle avec ducking sous la voix
    if (extra.music && project.audio.music.volume > 0) {
      const mg = off.createGain();
      const base = Core.clamp(project.audio.music.volume, 0, 1);
      const duck = Core.clamp(project.audio.music.duck, 0, 1);
      mg.gain.setValueAtTime(base, 0);
      for (const s of timeline.segments) {
        if (s.type === 'line') {
          mg.gain.setTargetAtTime(base * (1 - duck), s.start, 0.08);
          mg.gain.setTargetAtTime(base, Math.max(s.start, s.end - 0.3), 0.15);
        }
      }
      mg.gain.setTargetAtTime(0.0001, total - 0.6, 0.2);
      mg.connect(off.destination);
      const src = off.createBufferSource(); src.buffer = extra.music; src.loop = true; src.connect(mg); src.start(0); src.stop(total);
    }
    const rendered = await off.startRendering();
    return Audio.trim(rendered, total);
  };

  Audio.trim = function (buffer, seconds) {
    const sr = buffer.sampleRate; const len = Math.min(buffer.length, Math.ceil(seconds * sr));
    const out = new (root.AudioBuffer)({ length: len, numberOfChannels: buffer.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(0, len), c);
    return out;
  };

  /** Enveloppe RMS par image vidéo (Float32Array de longueur frames), normalisée 0..1. */
  Audio.envelope = function (buffer, fps, totalSeconds) {
    const frames = Math.ceil(totalSeconds * fps);
    const out = new Float32Array(frames);
    if (!buffer) return out;
    const sr = buffer.sampleRate, win = Math.floor(sr / fps);
    const ch = buffer.getChannelData(0);
    let max = 1e-6;
    for (let f = 0; f < frames; f++) {
      const s0 = f * win, s1 = Math.min(ch.length, s0 + win); let acc = 0;
      for (let i = s0; i < s1; i++) acc += ch[i] * ch[i];
      const rms = s1 > s0 ? Math.sqrt(acc / (s1 - s0)) : 0;
      out[f] = rms; if (rms > max) max = rms;
    }
    for (let f = 0; f < frames; f++) out[f] = Math.min(1, out[f] / max * 1.4);
    return out;
  };

  /** Enveloppe d'une seule réplique (pour la bouche quand la voix est réelle). */
  Audio.lineEnvelope = function (buffer, fps) {
    return Audio.envelope(buffer, fps, buffer.duration);
  };

  /* ------------------------------------------------------------------
     Lecture d'aperçu
     ------------------------------------------------------------------ */
  let _playing = null;
  Audio.play = function (buffer, offset) {
    Audio.stop();
    const ctx = Audio.ctx();
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination);
    src.start(0, Core.clamp(offset || 0, 0, Math.max(0, buffer.duration - 0.01)));
    _playing = src; return src;
  };
  Audio.stop = function () { if (_playing) { try { _playing.stop(); } catch (e) {} _playing = null; } };

  /** Flux MediaStream d'un AudioBuffer (pour MediaRecorder). */
  Audio.streamFromBuffer = function (buffer, offset) {
    const ctx = Audio.ctx();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(dest);
    return { stream: dest.stream, start: () => src.start(0, offset || 0), stop: () => { try { src.stop(); } catch (e) {} } };
  };

  /** Export WAV 16 bits (debug / piste audio seule). */
  Audio.toWav = function (buffer) {
    const nc = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
    const data = new DataView(new ArrayBuffer(44 + len * nc * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); data.setUint32(4, 36 + len * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
    data.setUint16(22, nc, true); data.setUint32(24, sr, true); data.setUint32(28, sr * nc * 2, true); data.setUint16(32, nc * 2, true); data.setUint16(34, 16, true); ws(36, 'data'); data.setUint32(40, len * nc * 2, true);
    let o = 44; const chans = []; for (let c = 0; c < nc; c++) chans.push(buffer.getChannelData(c));
    for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true); o += 2; }
    return new Blob([data.buffer], { type: 'audio/wav' });
  };

  NS.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
