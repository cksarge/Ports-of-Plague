// The turn timer. The big screen (or the one shared device) runs the clock;
// players' own devices only show it. The clock stops while a card or the dice
// are on screen, so reading never costs anyone time.
import { esc, crestSvg } from './dom.js';
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

// The clock shown to everyone: a small banner at the top of the screen, kept
// above any open card (the browser's top layer) where popovers are supported.
let pill = null;
export function showClockPill(p, secondsLeft, { paused = false } = {}) {
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'turn-clock';
    pill.setAttribute('role', 'timer');
    pill.setAttribute('aria-live', 'off');
    if (pill.showPopover) pill.popover = 'manual';
    document.body.appendChild(pill);
  }
  const s = Math.ceil(secondsLeft);
  const urgent = s <= C.turnTimer.warnAt;
  pill.classList.toggle('urgent', urgent && !paused);
  pill.classList.toggle('paused', paused);
  pill.style.setProperty('--house', p.color);
  pill.style.setProperty('--frac', String(Math.max(0, Math.min(1, secondsLeft / C.turnTimer.seconds))));
  const html = `${crestSvg(p, 16)} <span class="who">${esc(p.name)}</span> <span class="secs">${paused ? '⏸' : '⏳'} ${s}s</span>`;
  if (pill.dataset.html !== html) { pill.innerHTML = html; pill.dataset.html = html; }
  pill.setAttribute('aria-label', `${p.name}: ${s} seconds left${paused ? ' (paused)' : ''}`);
  raise();
}
export function hideClockPill() {
  if (!pill) return;
  try { pill.hidePopover?.(); } catch { /* not shown */ }
  pill.remove();
  pill = null;
}
// Cards open as modal dialogs in the top layer; showing the popover again
// puts the clock back above the newest one.
let raisedOver = null;
function raise() {
  if (!pill?.showPopover) return;
  const top = [...document.querySelectorAll('dialog[open]')].at(-1) ?? null;
  if (pill.matches(':popover-open') && top === raisedOver) return;
  try { pill.hidePopover(); } catch { /* not shown yet */ }
  try { pill.showPopover(); } catch { /* ignore */ }
  raisedOver = top;
}
