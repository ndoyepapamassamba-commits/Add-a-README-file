/* =====================================================================
   Skit Studio — 40-voices.js
   Fournisseurs de voix : procédurale (blip), Web Speech (aperçu),
   API compatible OpenAI (/audio/speech), ElevenLabs, fichiers importés.
   Mesure des durées + cache pour la timeline.
   ===================================================================== */
(function (root) {
  'use strict';
  const NS = root.SkitStudio = root.SkitStudio || {};
  const Core = NS.Core, Audio = NS.Audio, Timeline = NS.Timeline;

  const Voices = {};
  const cache = new Map(); // clé → AudioBuffer

  Voices.PROVIDERS = [
    { id: 'piper', label: 'Piper neuronal dans le navigateur (gratuit, français, hors ligne après téléchargement)', needsKey: false, exportable: true },
    { id: 'pollinations', label: 'Pollinations avec clé (OpenAI TTS, ElevenLabs, Microsoft, Kokoro…)', needsKey: true, exportable: true },
    { id: 'blip', label: 'Voix « bip » de secours (procédurale)', needsKey: false, exportable: true },
    { id: 'webspeech', label: 'Navigateur (Web Speech) — aperçu seulement', needsKey: false, exportable: false },
    { id: 'openai', label: 'API compatible OpenAI (/audio/speech)', needsKey: true, exportable: true },
    { id: 'elevenlabs', label: 'ElevenLabs', needsKey: true, exportable: true },
    { id: 'file', label: 'Fichiers audio importés par réplique', needsKey: false, exportable: true }
  ];

  Voices.PIPER_VOICES = [
    { id: 'fr_FR-siwis-medium', label: 'Siwis (femme, FR)' },
    { id: 'fr_FR-tom-medium', label: 'Tom (homme, FR)' },
    { id: 'fr_FR-gilles-low', label: 'Gilles (homme, FR, léger)' },
    { id: 'fr_FR-upmc-medium', label: 'UPMC (FR)' },
    { id: 'fr_FR-mls-medium', label: 'MLS (FR)' },
    { id: 'en_US-hfc_female-medium', label: 'HFC (femme, EN)' },
    { id: 'en_US-hfc_male-medium', label: 'HFC (homme, EN)' }
  ];
  Voices.POLLINATIONS_TTS = [
    { model: 'openai/tts-1', voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
    { model: 'openai/tts-1-hd', voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
    { model: 'elevenlabs/eleven-multilingual-v2', voices: ['rachel', 'domi', 'bella', 'charlotte', 'adam', 'antoni', 'josh', 'daniel', 'liam', 'george'] },
    { model: 'microsoft/mai-voice-2.1', voices: ['fr-FR-Grant', 'fr-FR-Harper'] },
    { model: 'hexgrad/kokoro-82m', voices: ['af_heart', 'am_adam', 'ff_siwis'] }
  ];
  Voices.PIPER_VERSION = '1.0.3';
  let _piper = null, _piperLoading = null;
  Voices.loadPiper = function () {
    if (_piper) return Promise.resolve(_piper);
    if (_piperLoading) return _piperLoading;
    _piperLoading = import(`https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@${Voices.PIPER_VERSION}/+esm`).then(m => { _piper = m; return m; });
    _piperLoading.catch(() => { _piperLoading = null; });
    return _piperLoading;
  };
  Voices.piperReady = () => !!_piper;
  Voices.piperDownload = async function (voiceId, onProgress) { const m = await Voices.loadPiper(); return m.download(voiceId, onProgress); };

  /** Ré-échantillonne un buffer (vitesse × hauteur combinées) via OfflineAudioContext. */
  async function resample(buffer, factor) {
    if (!factor || Math.abs(factor - 1) < 0.01) return buffer;
    const len = Math.ceil(buffer.length / factor);
    const off = new OfflineAudioContext(buffer.numberOfChannels, len, buffer.sampleRate);
    const src = off.createBufferSource(); src.buffer = buffer; src.playbackRate.value = factor; src.connect(off.destination); src.start();
    return off.startRendering();
  }

  async function synthPiper(text, voiceCfg) {
    const m = await Voices.loadPiper();
    const wav = await m.predict({ text: Core.stripMarks(text), voiceId: voiceCfg.voiceId || 'fr_FR-siwis-medium' });
    let buf = await Audio.decode(await wav.arrayBuffer());
    buf = await resample(buf, (voiceCfg.rate || 1) * (voiceCfg.pitch || 1));
    return buf;
  }

  async function synthPollinations(text, voiceCfg, settings) {
    const s = settings.pollinations || {};
    if (!s.apiKey) throw new Error('Clé Pollinations manquante (Réglages)');
    const r = await fetch('https://gen.pollinations.ai/v1/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
      body: JSON.stringify({ model: s.ttsModel || 'openai/tts-1', voice: voiceCfg.voiceId || 'nova', input: Core.stripMarks(text), response_format: 'mp3' })
    });
    if (!r.ok) throw new Error('Pollinations TTS ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    let buf = await Audio.decode(await r.arrayBuffer());
    return resample(buf, (voiceCfg.rate || 1) * (voiceCfg.pitch || 1));
  }

  Voices.OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

  Voices.webSpeechVoices = function (lang) {
    if (!root.speechSynthesis) return [];
    const all = root.speechSynthesis.getVoices();
    return lang ? all.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase())).concat(all.filter(v => !v.lang.toLowerCase().startsWith(lang.toLowerCase()))) : all;
  };

  Voices.speakPreview = function (text, voiceCfg, lang) {
    if (!root.speechSynthesis) return;
    root.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(Core.stripMarks(text));
    u.lang = lang || 'fr-FR'; u.rate = voiceCfg.rate || 1; u.pitch = voiceCfg.pitch || 1;
    const v = Voices.webSpeechVoices().find(x => x.name === voiceCfg.voiceId || x.voiceURI === voiceCfg.voiceId);
    if (v) u.voice = v;
    root.speechSynthesis.speak(u);
  };
  Voices.stopPreview = function () { if (root.speechSynthesis) root.speechSynthesis.cancel(); };

  async function synthOpenAI(text, voiceCfg, settings) {
    const s = settings.tts || {};
    const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const r = await fetch(base + '/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.apiKey || '') },
      body: JSON.stringify({ model: s.model || 'gpt-4o-mini-tts', voice: voiceCfg.voiceId || 'alloy', input: Core.stripMarks(text), response_format: 'mp3', speed: voiceCfg.rate || 1 })
    });
    if (!r.ok) throw new Error('TTS ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    return Audio.decode(await r.arrayBuffer());
  }

  async function synthElevenLabs(text, voiceCfg, settings) {
    const s = settings.elevenlabs || {};
    const id = voiceCfg.voiceId || s.defaultVoice || '21m00Tcm4TlvDq8ikWAM';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': s.apiKey || '' },
      body: JSON.stringify({ text: Core.stripMarks(text), model_id: s.model || 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3 } })
    });
    if (!r.ok) throw new Error('ElevenLabs ' + r.status + ' : ' + (await r.text()).slice(0, 200));
    return Audio.decode(await r.arrayBuffer());
  }

  /**
   * Synthétise une réplique. Retourne null si le fournisseur n'est pas exportable (Web Speech).
   */
  Voices.synthLine = async function (line, character, settings) {
    const v = character.voice || { provider: 'blip' };
    const key = [v.provider, v.voiceId, v.rate, v.pitch, line.audioUrl || '', line.text].join('§');
    if (cache.has(key)) return cache.get(key);
    let buf = null;
    switch (v.provider) {
      case 'piper': buf = await synthPiper(line.text, v); break;
      case 'pollinations': buf = await synthPollinations(line.text, v, settings || {}); break;
      case 'blip': buf = await Audio.synthBlipVoice(line.text, { rate: v.rate, pitch: v.pitch }); break;
      case 'openai': buf = await synthOpenAI(line.text, v, settings || {}); break;
      case 'elevenlabs': buf = await synthElevenLabs(line.text, v, settings || {}); break;
      case 'file': buf = line.audioUrl ? await Audio.fetchBuffer(line.audioUrl) : await Audio.synthBlipVoice(line.text, { rate: v.rate, pitch: v.pitch }); break;
      case 'webspeech': default: buf = null;
    }
    cache.set(key, buf);
    return buf;
  };

  /**
   * Mesure/synthétise toutes les répliques d'un projet.
   * @returns { measured:{ "si:li":{duration,buffer} }, errors:[] }
   */
  Voices.prepareProject = async function (project, settings, onProgress, signal) {
    const measured = {}; const errors = [];
    const jobs = [];
    project.sketches.forEach((sk, si) => sk.lines.forEach((ln, li) => jobs.push({ si, li, ln })));
    let done = 0;
    // Piper (CPU local) travaille en série ; les API distantes en parallèle
    const usesPiper = project.characters.some(c => c.voice && c.voice.provider === 'piper');
    const workers = Array.from({ length: usesPiper ? 1 : 3 }, async () => {
      while (jobs.length) {
        if (signal && signal.aborted) throw new Error('Annulé');
        const j = jobs.shift();
        const ch = project.characters.find(c => c.id === j.ln.speaker) || project.characters[0];
        try {
          const buf = await Voices.synthLine(j.ln, ch, settings);
          measured[Timeline.lineKey(j.si, j.li)] = buf ? { duration: buf.duration, buffer: buf } : { duration: 0, buffer: null };
        } catch (e) {
          errors.push({ si: j.si, li: j.li, error: e.message });
          // repli : voix procédurale pour ne pas bloquer le lot
          try { const buf = await Audio.synthBlipVoice(j.ln.text, { rate: ch.voice.rate, pitch: ch.voice.pitch }); measured[Timeline.lineKey(j.si, j.li)] = { duration: buf.duration, buffer: buf }; } catch (e2) { measured[Timeline.lineKey(j.si, j.li)] = { duration: 0, buffer: null }; }
        }
        done++; if (onProgress) onProgress(done / (done + jobs.length), `Voix ${done}`);
      }
    });
    await Promise.all(workers);
    return { measured, errors };
  };

  Voices.clearCache = () => cache.clear();

  NS.Voices = Voices;
})(typeof window !== 'undefined' ? window : globalThis);
