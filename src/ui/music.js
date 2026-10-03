// Background music. The game plays the recorded tracks listed in
// data/music.json (files in assets/music/), crossfading between them as the
// mood changes. If a file cannot be loaded (for example when the game file
// was copied without its assets folder), it falls back to music composed for
// this game and played live by the Web Audio API: a lute-like melody in the
// medieval Dorian mode over a drone, with a soft frame drum, which slows and
// darkens during plague phases.
//
// When each song starts and ends (the same in Quick Play and Standard):
//   menu     title screen, setup, lobby, and the prologue and turn order;
//            ends when the first round's opening card appears
//   trade-1  starts with a round's opening card, plays through its cards and
//   trade-2  turns, and ends when that round's plague results appear
//   trade-3  (which of the three depends on the year: see tradeMood)
//   plague   only while a round's plague results are on screen: starts when
//            they open and ends when the last of them is closed
//   ending   starts when the game is over and plays through the final scores;
//            ends on returning to the menu or setup
// Only one song sounds at a time: choosing a mood fades out every other one.
import { DATA } from '../data.js';
import { audioContext, isMusicOn, onAudioSettings } from './sound.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Original melodic phrases, [MIDI note, beats]. Each phrase is 8 beats.
const PHRASES = [
  [[69, 1], [67, 0.5], [65, 0.5], [64, 1], [62, 1], [64, 1], [65, 1], [67, 2]],
  [[69, 1], [72, 1], [71, 0.5], [69, 0.5], [67, 1], [69, 2], [65, 1], [64, 1]],
  [[62, 1], [65, 1], [64, 1], [62, 1], [60, 1], [62, 1], [57, 2]],
  [[65, 0.5], [67, 0.5], [69, 1], [67, 1], [65, 1], [64, 1.5], [62, 0.5], [62, 2]],
  [[74, 1.5], [72, 0.5], [71, 1], [69, 1], [67, 0.5], [69, 0.5], [71, 1], [69, 2]],
  [[62, 0.5], [64, 0.5], [65, 0.5], [67, 0.5], [69, 1], [0, 1], [67, 0.5], [65, 0.5], [64, 1], [62, 2]],
];
// Bass roots for each half of a phrase.
const ROOTS = [[50, 45], [53, 48], [50, 45], [48, 50], [55, 50], [50, 50]];

const MOODS = {
  menu: { tempo: 76, transpose: 0, drum: 0.5, melody: 0.11, dark: false },
  calm: { tempo: 84, transpose: 0, drum: 0.7, melody: 0.1, dark: false },
  plague: { tempo: 62, transpose: -12, drum: 0.35, melody: 0.09, dark: true },
};
// Which generated mood stands in for each recorded track.
const FALLBACK = { menu: 'menu', 'trade-1': 'calm', 'trade-2': 'calm', 'trade-3': 'calm', plague: 'plague', ending: 'menu' };

let state = null; // running sequencer
let mood = 'menu';

function darken(n) {
  // Phrygian colour: lower the 2nd and 6th degrees (E→E♭, B→B♭).
  const pc = ((n % 12) + 12) % 12;
  return pc === 4 || pc === 11 ? n - 1 : n;
}

function pluck(a, out, t, freq, dur, gain) {
  const o1 = a.createOscillator(), o2 = a.createOscillator();
  o1.type = 'triangle'; o1.frequency.value = freq;
  o2.type = 'sine'; o2.frequency.value = freq * 2.003;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(700, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6 + 0.2);
  const g2 = a.createGain();
  g2.gain.value = 0.3;
  o1.connect(f); o2.connect(g2).connect(f);
  f.connect(g).connect(out);
  o1.start(t); o2.start(t);
  o1.stop(t + dur * 1.6 + 0.3); o2.stop(t + dur * 1.6 + 0.3);
}

function drum(a, out, t, gain, low = true) {
  const len = Math.floor(a.sampleRate * 0.25);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = low ? 180 : 420;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(t);
  const o = a.createOscillator();
  o.frequency.setValueAtTime(low ? 95 : 150, t);
  o.frequency.exponentialRampToValueAtTime(low ? 55 : 90, t + 0.15);
  const og = a.createGain();
  og.gain.setValueAtTime(gain * 0.8, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.25);
}

function startDrone(a, out) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 3);
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const lfo = a.createOscillator();
  const lfoGain = a.createGain();
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(f.frequency);
  const oscs = [38, 45, 38.07].map((n) => {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    o.connect(f);
    o.start();
    return o;
  });
  f.connect(g).connect(out);
  lfo.start();
  return { g, oscs, lfo };
}

function start() {
  if (state || !isMusicOn()) return;
  const au = audioContext();
  if (!au) return;
  const a = au.ctx;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(1, a.currentTime + 2);
  out.connect(au.buses.music);
  const drone = startDrone(a, out);
  state = { a, out, drone, next: a.currentTime + 0.3, phrase: 0, note: 0, beat: 0, timer: null, order: [0, 1, 0, 2, 3, 1, 4, 5] };
  state.timer = setInterval(schedule, 60);
}

function stop() {
  if (!state) return;
  const s = state;
  state = null;
  clearInterval(s.timer);
  const t = s.a.currentTime;
  s.out.gain.cancelScheduledValues(t);
  s.out.gain.setValueAtTime(s.out.gain.value || 0.5, t);
  s.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  setTimeout(() => { s.drone.oscs.forEach((o) => o.stop()); s.drone.lfo.stop(); s.out.disconnect(); }, 1400);
}

// Schedules notes a little ahead of time so playback stays smooth.
function schedule() {
  const s = state;
  if (!s) return;
  const m = MOODS[FALLBACK[mood] ?? mood] ?? MOODS.menu;
  const beatLen = 60 / m.tempo;
  while (s.next < s.a.currentTime + 0.35) {
    const phraseIdx = s.order[s.phrase % s.order.length];
    const phrase = PHRASES[phraseIdx];
    const [n, beats] = phrase[s.note];
    if (s.note === 0) {
      // Bass notes on the phrase's two halves, and the drum pattern.
      const [r1, r2] = ROOTS[phraseIdx];
      pluck(s.a, s.out, s.next, midi(m.transpose + r1 - 12), beatLen * 3.5, 0.08);
      pluck(s.a, s.out, s.next + beatLen * 4, midi(m.transpose + r2 - 12), beatLen * 3.5, 0.07);
      for (let b = 0; b < 8; b++) {
        if (b % 4 === 0) drum(s.a, s.out, s.next + b * beatLen, 0.18 * m.drum, true);
        else if (b % 4 === 2 && Math.random() < 0.8) drum(s.a, s.out, s.next + b * beatLen, 0.08 * m.drum, false);
        else if (b % 4 === 3 && Math.random() < 0.35) drum(s.a, s.out, s.next + (b + 0.5) * beatLen, 0.06 * m.drum, false);
      }
    }
    if (n > 0) {
      const note = m.dark ? darken(n + m.transpose) : n + m.transpose;
      // A little human timing and occasional ornament (a quick upper neighbour).
      const t = s.next + (Math.random() - 0.5) * 0.012;
      if (beats >= 1 && Math.random() < 0.12) {
        pluck(s.a, s.out, t, midi(note + 2), beatLen * 0.2, m.melody * 0.6);
        pluck(s.a, s.out, t + beatLen * 0.12, midi(note), beatLen * beats, m.melody);
      } else {
        pluck(s.a, s.out, t, midi(note), beatLen * beats, m.melody);
      }
    }
    s.next += beats * beatLen;
    s.note++;
    if (s.note >= phrase.length) {
      s.note = 0;
      s.phrase++;
      // After a full pass, shuffle the phrase order for variety.
      if (s.phrase % s.order.length === 0) s.order = s.order.map((x) => ({ x, r: Math.random() })).sort((p, q) => p.r - q.r).map((p) => p.x);
      // A breath between phrases, longer in dark moods.
      s.next += beatLen * (m.dark ? 1 : 0.5);
    }
  }
}

// ---------- Recorded tracks ----------
const TRACKS = Object.fromEntries(DATA.music.map((t) => [t.id, t]));
const VOLUME = 0.5;     // recorded music sits under the sound effects
const FADE_MS = 1500;
const players = {};     // track id → <audio>, kept so a track resumes where it paused
const failed = new Set();
let current = null;     // id of the recorded track playing now
let unlocked = false;   // the browser allows sound once the player has clicked or pressed a key
let hushed = false;     // a player's own device in a multi-device game: the big screen plays the music
let primed = false;     // every track has been started once during a click or key press

// On a web server the tracks go through the Web Audio graph, so fades work
// everywhere (iPhones ignore an <audio> element's volume). A page opened
// straight from a file cannot do that, so it fades the element itself.
const useGraph = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

// Phones and tablets get the small versions of the tracks (less data, same
// music); computers get the full-quality files.
export function wantsSmallMusic(nav = typeof navigator !== 'undefined' ? navigator : {}) {
  if (nav.connection?.saveData) return true; // the user asked the browser to save data
  if (nav.userAgentData?.mobile) return true;
  const ua = nav.userAgent ?? '';
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  // iPads report themselves as Macs: a Mac with a touch screen is an iPad.
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}
const small = wantsSmallMusic();

function player(id) {
  if (players[id]) return players[id];
  const el = new Audio();
  el.loop = true;
  el.preload = 'metadata';
  el.volume = useGraph ? 1 : 0;
  // If the small file will not load, try the full one; if that fails too,
  // the generated music takes over.
  el.addEventListener('error', () => {
    if (el.src.endsWith(TRACKS[id].mobileFile)) { el.src = TRACKS[id].file; if (current === id) el.play().then(() => { if (current === id) fade(el, VOLUME); else fadeOut(id); }).catch(() => {}); return; }
    failed.add(id);
    if (current === id) { current = null; apply(); }
  });
  el.src = small ? TRACKS[id].mobileFile : TRACKS[id].file;
  if (useGraph) {
    const au = audioContext();
    if (au) {
      el._gain = au.ctx.createGain();
      el._gain.gain.value = 0;
      au.ctx.createMediaElementSource(el).connect(el._gain).connect(au.buses.master);
    }
  }
  players[id] = el;
  return el;
}

// Moves a track's volume smoothly to `to`, then calls done (unless another fade replaced it).
function fade(el, to, done) {
  clearInterval(el._fade);
  clearTimeout(el._fadeEnd);
  if (el._gain) {
    const g = el._gain.gain, t = el._gain.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + FADE_MS / 1000);
    el._fadeEnd = setTimeout(() => done?.(), FADE_MS + 50);
    return;
  }
  const from = el.volume, t0 = performance.now();
  el._fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / FADE_MS);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) { clearInterval(el._fade); done?.(); }
  }, 50);
}
function fadeOut(id) {
  const el = players[id];
  if (el) fade(el, 0, () => el.pause());
}
// Fades out every recording that is still sounding, except `keep`.
function fadeOutOthers(keep) {
  for (const id of Object.keys(players)) if (id !== keep && (id === current || !players[id].paused)) fadeOut(id);
}

// Plays the track for the current mood (or the generated music instead).
function apply() {
  if (!unlocked) return;
  const on = isMusicOn() && !hushed;
  const id = TRACKS[mood] && !failed.has(mood) ? mood : null;
  if (!on || !id) {
    fadeOutOthers(null);
    current = null;
    if (on) { start(); } else stop();
    return;
  }
  stop(); // the generated music is not needed while a recording plays
  if (current === id) return;
  fadeOutOthers(id);
  current = id;
  const el = player(id);
  // The mood may have moved on before the track started: then it must not fade in
  // (that would cancel its fade-out and leave it playing under the next track).
  el.play().then(() => { if (current === id) fade(el, VOLUME); else fadeOut(id); }).catch(() => { /* not allowed yet, or failed: the error event handles failures */ });
}

// Starting each track once during a click lets it play later (Safari only
// allows sound that starts from a tap or key press).
function prime() {
  if (primed || hushed || !isMusicOn()) return;
  primed = true;
  for (const t of DATA.music) {
    const el = player(t.id);
    el.play().then(() => { if (current !== t.id) el.pause(); }).catch(() => {});
  }
}

// Mood names: menu, trade-1, trade-2, trade-3, plague, ending.
export const music = {
  setMood(m) {
    if (!TRACKS[m] && !MOODS[m]) return;
    mood = m;
    apply();
  },
  // Browsers only allow sound after the player interacts with the page.
  enableOnFirstGesture() {
    const go = () => {
      unlocked = true;
      prime();
      apply();
    };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
  },
  sync() { apply(); },
  // In a multi-device game only the big screen plays music: a player's own
  // device goes quiet while it is in a room (its sound effects still play).
  setHushed(v) {
    if (hushed === !!v) return;
    hushed = !!v;
    if (!hushed && unlocked) prime();
    apply();
  },
  // For tests: which recording is playing (null = none or the generated music).
  status() {
    const el = current && players[current];
    const sounding = Object.keys(players).filter((id) => !players[id].paused && (players[id]._gain ? players[id]._gain.gain.value : players[id].volume) > 0.001);
    return { mood, hushed, sounding, track: current, playing: !!el && !el.paused, time: el ? Math.round(el.currentTime) : 0, file: el ? el.src.split('/').slice(-2).join('/') : null, small, failed: [...failed], generated: !!state };
  },
};

// The trading music darkens as the years go by (round = half-year number).
export function tradeMood(round) {
  return round <= 3 ? 'trade-1' : round <= 7 ? 'trade-2' : 'trade-3';
}
// The song for the game as it stands (the plague song is the one exception:
// the game switches to it while a round's plague results are shown).
export function gameSong(state) {
  if (state.phase === 'ended') return 'ending';
  return state.round >= (state.firstHalf ?? 1) ? tradeMood(state.round) : 'menu';
}
onAudioSettings(() => music.sync());
