// Small DOM helpers: escaping, modal dialogs, toasts, announcements.
import { escapeHtml } from '../render/template.js';
import { crestPath } from './art.js';

export const esc = escapeHtml;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let dialogDepth = 0;
export const dialogOpen = () => dialogDepth > 0;

// Builds a <dialog> and adds it to the page, not yet shown.
export function buildDialog(html, { wide = false, side = false, label = 'Dialog' } = {}) {
  const d = document.createElement('dialog');
  if (wide) d.classList.add('wide');
  if (side) d.classList.add('side');
  d.setAttribute('aria-label', label);
  d.innerHTML = html;
  // Keep the decorated border fixed: the content scrolls inside it.
  const frame = d.querySelector(':scope > .frame');
  if (frame) {
    const inner = document.createElement('div');
    inner.className = 'frame-scroll';
    while (frame.firstChild) inner.appendChild(frame.firstChild);
    frame.appendChild(inner);
  }
  document.body.appendChild(d);
  return d;
}

// Opens a modal <dialog>. Any element with [data-value] closes it and
// resolves the promise with that value. Returns a promise.
// options: { wide, dismissable (Esc/backdrop allowed), label, onMount(dialog, close) }
export function openDialog(html, { dismissable = true, onMount, ...look } = {}) {
  return new Promise((resolve) => {
    const d = buildDialog(html, look);
    dialogDepth++;
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      dialogDepth--;
      d.close();
      d.remove();
      resolve(value);
    };
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (dismissable) close(null);
    });
    d.addEventListener('force-close', () => close(null));
    if (dismissable) {
      d.addEventListener('click', (e) => { if (e.target === d) close(null); });
    }
    d.addEventListener('click', (e) => {
      const el = e.target.closest('[data-value]');
      if (el && !el.disabled && d.contains(el)) close(el.dataset.value);
    });
    d.showModal();
    const auto = d.querySelector('[autofocus]') ?? d.querySelector('.btn.primary') ?? d.querySelector('button:not(:disabled)');
    auto?.focus({ preventScroll: true });
    // Always start reading from the top of a card.
    const scroller = d.querySelector('.frame-scroll');
    if (scroller) scroller.scrollTop = 0;
    onMount?.(d, close);
  });
}

// The browser's own "Leave site?" question while a multi-device game is going
// on (closing the tab would drop this device, or the big screen, out of the
// game). Browsers show their own wording, and iPhones never show it.
const askBeforeLeaving = (e) => { e.preventDefault(); e.returnValue = ''; };
let leavingGuarded = false;
export function warnBeforeLeaving(on) {
  if (on === leavingGuarded) return;
  leavingGuarded = on;
  if (on) window.addEventListener('beforeunload', askBeforeLeaving);
  else window.removeEventListener('beforeunload', askBeforeLeaving);
}

// Closes every open dialog as if it was cancelled (for example when the game
// this device was playing has ended).
export function closeAllDialogs() {
  document.querySelectorAll('dialog').forEach((d) => d.dispatchEvent(new Event('force-close')));
}

export function toast(text, ms = 3200) {
  document.querySelectorAll('.toast').forEach((old) => old.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function announce(text) {
  const a = document.getElementById('announcer');
  if (a) { a.textContent = ''; setTimeout(() => (a.textContent = text), 30); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// True while a key press is going into a text box (typing a name or a room
// code), so single-letter shortcuts like R for Rules must not react to it.
export const isTyping = (e) => !!(e.isComposing || e.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// House crest as inline SVG (shape + color, so players can be told apart without color).
export function crestSvg(p, size = 22) {
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><g fill="${p.color}" stroke="#1a1208" stroke-width="1.5">${crestPath(p.crest, size)}</g></svg>`;
}
