// Animated dice. The engine has already rolled; this only shows the result.
import { sleep, reducedMotion } from './dom.js';
import { sfx } from './sound.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieFaces(value) {
  return Array.from({ length: 9 }, (_, i) => (PIPS[value]?.includes(i) ? '<span class="pipdot"></span>' : '<span></span>')).join('');
}

export function dieHtml(value, { red = false, gold = false, small = false, label = '', id = '' } = {}) {
  return `<div class="die-wrap"><div class="die${red ? ' red' : ''}${gold ? ' gold' : ''}${small ? ' small' : ''}" ${id ? `id="${id}"` : ''} role="img" aria-label="${label ? label + ': ' : ''}rolled ${value}" data-final="${value}">${dieFaces(value)}</div>${label ? `<div>${label}</div>` : ''}</div>`;
}

// Tumbles every .die inside root, then shows the final faces.
export async function rollDice(root, ms = 900) {
  const dice = [...root.querySelectorAll('.die')];
  if (!dice.length) return;
  if (reducedMotion()) return;
  sfx.dice();
  dice.forEach((d) => d.classList.add('rolling'));
  const end = performance.now() + ms;
  while (performance.now() < end) {
    for (const d of dice) d.innerHTML = dieFaces(1 + Math.floor(Math.random() * 6));
    await sleep(80);
  }
  for (const d of dice) {
    d.classList.remove('rolling');
    d.classList.add('landed');
    d.innerHTML = dieFaces(Number(d.dataset.final));
  }
}
