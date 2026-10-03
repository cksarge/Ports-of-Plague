// Sound effects generated live with the Web Audio API: no audio files, so
// nothing to license. Effects and music have separate on/off switches,
// remembered in this browser.
let ctx = null;
let buses = null;
let muted = false;
let musicOff = false;
try {
  muted = localStorage.getItem('ports-of-plague-muted') === '1';
  musicOff = localStorage.getItem('ports-of-plague-music') === '0';
} catch { /* storage blocked */ }

const listeners = new Set();
export const onAudioSettings = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('ports-of-plague-muted', v ? '1' : '0'); } catch { /* ignore */ }
  notify();
}
export const isMusicOn = () => !musicOff;
export function setMusicOn(v) {
  musicOff = !v;
  try { localStorage.setItem('ports-of-plague-music', v ? '1' : '0'); } catch { /* ignore */ }
  notify();
}

// A small generated "stone hall" echo shared by music and effects.
function makeReverb(a) {
  const len = Math.floor(a.sampleRate * 2.4);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = a.createConvolver();
  conv.buffer = buf;
  return conv;
}

// Returns the audio context and mixing buses, creating them on first use.
export function audioContext() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const reverb = makeReverb(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      reverb.connect(wet).connect(master);
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      sfxBus.connect(reverb);
      const musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      musicBus.connect(reverb);
      buses = { master, reverb, sfx: sfxBus, music: musicBus };
    }
    if (ctx.state === 'suspended') ctx.resume();
    return { ctx, buses };
  } catch {
    return null;
  }
}

function fx() {
  if (muted) return null;
  const a = audioContext();
  return a ? { a: a.ctx, out: a.buses.sfx } : null;
}

function noise(a, out, start, dur, { freq = 1000, type = 'bandpass', q = 1, gain = 0.3, sweepTo = null } = {}) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(start);
  src.stop(start + dur + 0.05);
}

export function tone(a, out, start, freq, dur, gain, type = 'sine', { attack = 0.005, filter = null } = {}) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = o;
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// A church-bell strike: inharmonic partials with a long decay.
function bellStrike(a, out, t, base, gain = 0.2, len = 3) {
  for (const [ratio, g] of [[0.5, 0.6], [1, 1], [1.19, 0.5], [1.5, 0.4], [2, 0.35], [2.74, 0.2], [3.76, 0.12]]) {
    tone(a, out, t, base * ratio, len * (ratio < 1.2 ? 1 : 0.7), gain * g, 'sine', { attack: 0.004 });
  }
}

// A brass-like note (sawtooth through a low-pass filter).
function horn(a, out, t, freq, dur, gain = 0.12) {
  tone(a, out, t, freq, dur, gain, 'sawtooth', { attack: 0.04, filter: 1400 });
  tone(a, out, t, freq * 2, dur * 0.8, gain * 0.25, 'sawtooth', { attack: 0.05, filter: 1800 });
}

export const sfx = {
  click() {
    const s = fx(); if (!s) return;
    noise(s.a, s.out, s.a.currentTime, 0.04, { freq: 2600, q: 3, gain: 0.12 });
  },
  dice() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    for (let i = 0; i < 9; i++) noise(s.a, s.out, t + i * 0.065 + Math.random() * 0.03, 0.045, { freq: 1500 + Math.random() * 2000, q: 4, gain: 0.35 });
    noise(s.a, s.out, t + 0.62, 0.08, { freq: 500, q: 2, gain: 0.3 });
  },
  bell() {
    const s = fx(); if (!s) return;
    bellStrike(s.a, s.out, s.a.currentTime, 330, 0.16, 3.2);
  },
  knell() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    bellStrike(s.a, s.out, t, 110, 0.22, 4);
    bellStrike(s.a, s.out, t + 1.6, 110, 0.14, 4);
  },
  page() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    noise(s.a, s.out, t, 0.18, { freq: 1200, sweepTo: 4000, q: 0.8, gain: 0.18 });
    noise(s.a, s.out, t + 0.12, 0.12, { freq: 3000, sweepTo: 800, q: 0.8, gain: 0.12 });
  },
  coin() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.07 + Math.random() * 0.03;
      tone(s.a, s.out, tt, 2200 + Math.random() * 900, 0.18, 0.07, 'triangle');
      tone(s.a, s.out, tt, 3400 + Math.random() * 900, 0.1, 0.04, 'sine');
    }
  },
  sail() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    noise(s.a, s.out, t, 1.4, { freq: 300, type: 'lowpass', sweepTo: 900, gain: 0.2 });
    noise(s.a, s.out, t + 0.5, 1.2, { freq: 900, type: 'lowpass', sweepTo: 250, gain: 0.16 });
    tone(s.a, s.out, t + 0.1, 196, 0.7, 0.05, 'sawtooth', { attack: 0.08, filter: 600 });
  },
  cart() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    for (let i = 0; i < 8; i++) noise(s.a, s.out, t + i * 0.16, 0.08, { freq: 220, q: 2, gain: 0.25 });
  },
  fortune() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    [587, 740, 880, 1175, 1480].forEach((f, i) => tone(s.a, s.out, t + i * 0.09, f, 0.9, 0.09, 'triangle'));
    tone(s.a, s.out, t + 0.45, 1760, 1.2, 0.05, 'sine');
  },
  misfortune() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    [440, 415, 349, 294].forEach((f, i) => tone(s.a, s.out, t + i * 0.14, f, 0.6, 0.08, 'triangle'));
  },
  plague() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    for (const f of [73.4, 77.8, 110]) tone(s.a, s.out, t, f, 2.4, 0.08, 'sawtooth', { attack: 0.5, filter: 380 });
    noise(s.a, s.out, t, 2.2, { freq: 200, type: 'lowpass', gain: 0.12 });
  },
  fanfare() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    horn(s.a, s.out, t, 392, 0.18);
    horn(s.a, s.out, t + 0.2, 392, 0.12);
    horn(s.a, s.out, t + 0.34, 523, 0.55);
  },
  victory() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    [[392, 0.2], [523, 0.2], [659, 0.2], [784, 0.5], [659, 0.18], [784, 0.9]].reduce((tt, [f, d]) => { horn(s.a, s.out, tt, f, d + 0.1); return tt + d; }, t);
    bellStrike(s.a, s.out, t + 1.5, 392, 0.12, 3);
  },
  // A timpani roll that swells, then one deep hit (before the winner is named).
  drumroll(dur = 2.2) {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    const hits = Math.floor(dur * 20);
    for (let i = 0; i < hits; i++) {
      const at = t + (i * dur) / hits;
      const g = 0.03 + 0.13 * (i / hits);
      noise(s.a, s.out, at, 0.08, { freq: 220, type: 'lowpass', gain: g });
      tone(s.a, s.out, at, 72, 0.09, g * 0.6, 'sine');
    }
    tone(s.a, s.out, t + dur, 55, 1.2, 0.4, 'sine');
    noise(s.a, s.out, t + dur, 0.35, { freq: 320, type: 'lowpass', gain: 0.4 });
  },
  stamp() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    tone(s.a, s.out, t, 90, 0.35, 0.35, 'sine');
    noise(s.a, s.out, t, 0.12, { freq: 400, type: 'lowpass', gain: 0.3 });
  },
  error() {
    const s = fx(); if (!s) return;
    const t = s.a.currentTime;
    tone(s.a, s.out, t, 140, 0.18, 0.12, 'square', { filter: 700 });
    tone(s.a, s.out, t + 0.16, 110, 0.22, 0.12, 'square', { filter: 700 });
  },
  low() {
    const s = fx(); if (!s) return;
    tone(s.a, s.out, s.a.currentTime, 110, 1.2, 0.18, 'sine');
  },
};
