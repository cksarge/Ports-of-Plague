// The turn timer. The big screen (or the one shared device) runs the clock;
// players' own devices only show it. The clock stops while a card or the dice
// are on screen, so reading never costs anyone time.
import { crestSvg } from './dom.js';
import { C } from '../engine/state.js';

// A countdown that can be paused and resumed.
//   onTick(secondsLeft) about 5 times a second while running
//   onExpire() once, when it reaches 0
export function createClock({ onTick, onExpire }) {
  let left = 0;
  let running = false;
  let since = 0;
  let timer = null;
  const now = () => performance.now();
  const remaining = () => Math.max(0, running ? left - (now() - since) / 1000 : left);
  const tick = () => {
    const l = remaining();
    onTick?.(l);
    if (running && l <= 0) {
      stop();
      onExpire?.();
    }
  };
  function stop() {
    left = remaining();
    running = false;
    clearInterval(timer);
    timer = null;
  }
  return {
    start(seconds) { stop(); left = seconds; this.resume(); },
    pause() { if (running) { stop(); onTick?.(left); } },
    resume() {
      if (running || left <= 0) return;
      running = true;
      since = now();
      timer = setInterval(tick, 200);
      tick();
    },
    stop() { stop(); left = 0; },
    get left() { return remaining(); },
    get running() { return running; },
  };
}

// The clock on screen. It lives in the interface, not on top of it: in every
// [data-clock-slot] (the top bar of the shared screen, the header of a
// player's own device) and, while a choice is open, as a tab on the top edge
// of that dialog so it is never hidden behind it.
// total: the length of a turn in this game (a host may set its own).
function chip(p, secondsLeft, paused, total) {
  const s = Math.ceil(secondsLeft);
  const urgent = s <= C.turnTimer.warnAt && !paused;
  const frac = Math.max(0, Math.min(1, secondsLeft / (total || C.turnTimer.seconds)));
  return {
    cls: `turn-clock${urgent ? ' urgent' : ''}${paused ? ' paused' : ''}`,
    frac: frac.toFixed(3),
    html: `${crestSvg(p, 16)}<span class="secs">${paused ? '⏸' : '⏳'} ${s}s</span>`,
    label: `${p.name}: ${s} seconds left${paused ? ' (paused)' : ''}`,
  };
}
function fill(el, c, extra = '') {
  el.className = c.cls + extra;
  el.style.setProperty('--frac', c.frac);
  if (el.dataset.html !== c.html) { el.innerHTML = c.html; el.dataset.html = c.html; }
  el.setAttribute('aria-label', c.label);
}

export function showClockPill(p, secondsLeft, { paused = false, total = 0 } = {}) {
  const c = chip(p, secondsLeft, paused, total);
  for (const slot of document.querySelectorAll('[data-clock-slot]')) {
    let el = slot.querySelector('.turn-clock');
    if (!el) {
      el = document.createElement('span');
      el.setAttribute('role', 'timer');
      slot.appendChild(el);
    }
    el.style.setProperty('--house', p.color);
    fill(el, c);
  }
  // A choice is open and the clock is running: show it on that dialog too.
  const top = paused ? null : [...document.querySelectorAll('dialog[open]')].at(-1);
  const frame = top?.querySelector(':scope > .frame');
  for (const old of document.querySelectorAll('.turn-clock.in-dialog')) if (old.parentElement !== frame) old.remove();
  if (frame) {
    let el = frame.querySelector(':scope > .turn-clock.in-dialog');
    if (!el) {
      el = document.createElement('span');
      el.setAttribute('role', 'timer');
      frame.appendChild(el);
    }
    el.style.setProperty('--house', p.color);
    fill(el, c, ' in-dialog');
  }
}
export function hideClockPill() {
  document.querySelectorAll('.turn-clock').forEach((el) => el.remove());
}
