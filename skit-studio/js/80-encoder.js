/* =====================================================================
   Skit Studio — 80-encoder.js
   Export vidéo dans le navigateur :
     1) WebCodecs (VideoEncoder/AudioEncoder) + mp4-muxer → MP4 hors temps réel
        codecs : H.264 → VP9 → AV1 ; audio : AAC → Opus
     2) Repli MediaRecorder (temps réel) : MP4 si supporté, sinon WebM
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core, Audio = NS.Audio;

  const Encoder = {};
  Encoder.VIDEO_CODECS = [
    { id: 'avc1.640028', mux: 'avc', label: 'H.264 High 4.0' },
    { id: 'avc1.4d0028', mux: 'avc', label: 'H.264 Main 4.0' },
    { id: 'avc1.42002a', mux: 'avc', label: 'H.264 Baseline 4.2' },
    { id: 'vp09.00.40.08', mux: 'vp9', label: 'VP9' },
    { id: 'av01.0.08M.08', mux: 'av1', label: 'AV1' }
  ];
  Encoder.AUDIO_CODECS = [{ id: 'mp4a.40.2', mux: 'aac', label: 'AAC' }, { id: 'opus', mux: 'opus', label: 'Opus' }];

  Encoder.capabilities = async function (W, H, fps) {
    const out = { webcodecs: !!(root.VideoEncoder && root.AudioEncoder), muxer: !!root.Mp4Muxer, mediaRecorder: !!root.MediaRecorder, video: [], audio: [], recorderTypes: [] };
    if (out.webcodecs) {
      for (const c of Encoder.VIDEO_CODECS) { try { const r = await VideoEncoder.isConfigSupported({ codec: c.id, width: W || 1080, height: H || 1920, bitrate: 8e6, framerate: fps || 30 }); if (r.supported) out.video.push(c); } catch (e) {} }
      for (const c of Encoder.AUDIO_CODECS) { try { const r = await AudioEncoder.isConfigSupported({ codec: c.id, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }); if (r.supported) out.audio.push(c); } catch (e) {} }
    }
    if (out.mediaRecorder) ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].forEach(t => { if (MediaRecorder.isTypeSupported(t)) out.recorderTypes.push(t); });
    return out;
  };

  function yieldUI() { return new Promise(r => setTimeout(r, 0)); }

  /**
   * Rendu WebCodecs. opts : { W, H, fps, total, paint(ctx, t), audioBuffer, onProgress(ratio,msg), signal, bitrate, prefer:'h264'|'vp9'|'av1' }
   * @returns { blob, ext, mime, codec, audioCodec, engine }
   */
  Encoder.renderWebCodecs = async function (opts) {
    const { W, H, fps, total, paint, audioBuffer, onProgress, signal } = opts;
    const caps = await Encoder.capabilities(W, H, fps);
    if (!caps.webcodecs || !caps.muxer) throw new Error('WebCodecs ou mp4-muxer indisponible');
    let vcodec = caps.video[0];
    if (opts.prefer) { const want = caps.video.find(c => c.mux === (opts.prefer === 'h264' ? 'avc' : opts.prefer)); if (want) vcodec = want; }
    if (!vcodec) throw new Error('Aucun codec vidéo WebCodecs supporté');
    const acodec = caps.audio.find(c => c.mux === 'aac') || caps.audio[0];
    const sr = audioBuffer ? audioBuffer.sampleRate : 48000, nch = audioBuffer ? audioBuffer.numberOfChannels : 2;
    const target = new root.Mp4Muxer.ArrayBufferTarget();
    const muxer = new root.Mp4Muxer.Muxer({ target, video: { codec: vcodec.mux, width: W, height: H, frameRate: fps }, audio: acodec && audioBuffer ? { codec: acodec.mux, sampleRate: sr, numberOfChannels: nch } : undefined, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let encErr = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    const vcfg = { codec: vcodec.id, width: W, height: H, bitrate: opts.bitrate || Math.round(W * H * fps * 0.09), framerate: fps, latencyMode: 'quality' };
    if (vcodec.mux === 'avc') vcfg.avc = { format: 'avc' };
    venc.configure(vcfg);
    let aenc = null;
    if (acodec && audioBuffer) {
      aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { encErr = e; } });
      aenc.configure({ codec: acodec.id, sampleRate: sr, numberOfChannels: nch, bitrate: 128000 });
    }
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    const frames = Math.ceil(total * fps);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) { try { venc.close(); if (aenc) aenc.close(); } catch (e) {} throw new Error('Annulé'); }
      if (encErr) throw encErr;
      paint(ctx, i / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (i % 3 === 0) { if (onProgress) { const el = (performance.now() - t0) / 1000; onProgress(i / frames, `Image ${i}/${frames} · ${(i / Math.max(0.01, el)).toFixed(1)} i/s`); } await yieldUI(); }
    }
    if (aenc) {
      const chunk = acodec.mux === 'aac' ? 1024 : 960;
      const planes = []; for (let c = 0; c < nch; c++) planes.push(audioBuffer.getChannelData(c));
      const n = audioBuffer.length;
      for (let pos = 0; pos < n; pos += chunk) {
        const len = Math.min(chunk, n - pos);
        const data = new Float32Array(len * nch);
        for (let c = 0; c < nch; c++) data.set(planes[c].subarray(pos, pos + len), c * len);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: len, numberOfChannels: nch, timestamp: Math.round(pos / sr * 1e6), data });
        aenc.encode(ad); ad.close();
        if (aenc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 2));
      }
      await aenc.flush(); aenc.close();
    }
    await venc.flush(); venc.close();
    if (encErr) throw encErr;
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    return { blob, ext: 'mp4', mime: 'video/mp4', codec: vcodec.label, audioCodec: acodec ? acodec.label : 'aucun', engine: 'webcodecs' };
  };

  /** Rendu temps réel via MediaRecorder (l'onglet doit rester visible). */
  Encoder.renderMediaRecorder = async function (opts) {
    const { W, H, fps, total, paint, audioBuffer, onProgress, signal } = opts;
    if (!root.MediaRecorder) throw new Error('MediaRecorder indisponible');
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    paint(ctx, 0);
    const stream = canvas.captureStream(fps);
    let audioSrc = null;
    if (audioBuffer) { audioSrc = Audio.streamFromBuffer(audioBuffer, 0); audioSrc.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
    const caps = await Encoder.capabilities(W, H, fps);
    const mime = caps.recorderTypes[0] || '';
    const rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: opts.bitrate || Math.round(W * H * fps * 0.1), audioBitsPerSecond: 128000 }, mime ? { mimeType: mime } : {}));
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start(250);
    const start = performance.now(); if (audioSrc) audioSrc.start();
    const vtrack = stream.getVideoTracks()[0];
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal && signal.aborted) { reject(new Error('Annulé')); return; }
        const t = (performance.now() - start) / 1000;
        if (t >= total) { resolve(); return; }
        paint(ctx, t); if (vtrack.requestFrame) vtrack.requestFrame();
        if (onProgress) onProgress(t / total, `Temps réel ${Core.fmtTime(t)} / ${Core.fmtTime(total)}`);
        setTimeout(tick, 1000 / fps);
      };
      tick();
    }).finally(() => { if (audioSrc) audioSrc.stop(); });
    rec.stop(); await done;
    const isMp4 = mime.startsWith('video/mp4');
    const blob = new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
    return { blob, ext: isMp4 ? 'mp4' : 'webm', mime: blob.type, codec: mime || 'défaut', audioCodec: audioBuffer ? 'piste' : 'aucun', engine: 'mediarecorder' };
  };

  /** Choix automatique du moteur. engine : 'auto' | 'webcodecs' | 'mediarecorder' */
  Encoder.render = async function (opts) {
    const engine = opts.engine || 'auto';
    if (engine === 'mediarecorder') return Encoder.renderMediaRecorder(opts);
    try { return await Encoder.renderWebCodecs(opts); }
    catch (e) { if (engine === 'webcodecs' || /Annulé/.test(e.message)) throw e; console.warn('WebCodecs → repli MediaRecorder :', e.message); return Encoder.renderMediaRecorder(opts); }
  };

  NS.Encoder = Encoder;
})(typeof window !== 'undefined' ? window : globalThis);
