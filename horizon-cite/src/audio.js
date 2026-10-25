// Sons synthétisés (Web Audio) : interface, construction, démolition, ambiance urbaine, oiseaux.
import { G } from './state.js';
import { clamp } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
    this.last = {};
    try {
      this.muted = localStorage.getItem('hc-mute') === '1';
      const v = parseFloat(localStorage.getItem('hc-volume'));
      if (!isNaN(v)) this.volume = v;
    } catch (e) {
      /* stockage indisponible */
    }
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.birdT = 3;
  }

  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(c.destination);
    // ambiance : bruit brun filtré
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.ambGain = c.createGain();
    this.ambGain.gain.value = 0;
    src.connect(lp).connect(this.ambGain).connect(this.master);
    src.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    try {
      localStorage.setItem('hc-mute', m ? '1' : '0');
    } catch (e) {
      /* stockage indisponible */
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.value = v;
    try {
      localStorage.setItem('hc-volume', String(v));
    } catch (e) {
      /* stockage indisponible */
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.3, freq = 800, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const minGap = { zone: 70, plant: 90, click: 40 }[name] || 30;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'click':
        this.tone(900, 0.05, 'triangle', 0.06);
        break;
      case 'open':
        this.tone(520, 0.07, 'triangle', 0.07);
        this.tone(780, 0.08, 'triangle', 0.05, 0, 0.05);
        break;
      case 'build':
        this.noise(0.18, 0.35, 420);
        this.tone(140, 0.22, 'sine', 0.25, -60);
        this.tone(1200, 0.05, 'triangle', 0.05, 0, 0.02);
        break;
      case 'demolish':
        this.noise(0.5, 0.45, 900);
        this.tone(90, 0.35, 'sawtooth', 0.08, -40);
        break;
      case 'zone':
        this.tone(660 + Math.random() * 60, 0.06, 'sine', 0.05);
        break;
      case 'plant':
        this.tone(1200 + Math.random() * 300, 0.06, 'sine', 0.05, 300);
        break;
      case 'error':
        this.tone(180, 0.16, 'square', 0.06);
        this.tone(140, 0.2, 'square', 0.05, 0, 0.1);
        break;
      case 'milestone':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, 0, i * 0.11));
        break;
      case 'chirp':
        this.tone(2400, 0.07, 'sine', 0.05, 900);
        this.tone(2900, 0.06, 'sine', 0.04, 700, 0.09);
        break;
      case 'coin':
        this.tone(1320, 0.08, 'square', 0.04);
        this.tone(1760, 0.12, 'square', 0.04, 0, 0.07);
        break;
    }
  }

  update(dt) {
    if (!this.ctx || !this.ambGain) return;
    const d = G.cam ? G.cam.cur.dist : 500;
    const pop = G.sim ? G.sim.stats.pop : 0;
    const near = clamp(1 - (d - 60) / 900, 0, 1);
    const city = clamp(pop / 3000, 0.05, 1);
    const target = (G.running && !(G.sim && G.sim.paused) ? 1 : 0.35) * near * city * 0.09;
    const g = this.ambGain.gain;
    g.value += (target - g.value) * Math.min(1, dt * 2);
    // oiseaux le jour quand on est proche du sol
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 2 + Math.random() * 6;
      if (G.env && G.env.night < 0.3 && d < 350 && !this.muted && G.running) {
        const f = 2600 + Math.random() * 1400;
        this.tone(f, 0.06, 'sine', 0.025, 600);
        this.tone(f * 1.1, 0.05, 'sine', 0.02, -400, 0.08);
      }
    }
  }
}
