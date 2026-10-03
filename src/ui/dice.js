// Animated 3D dice. The engine has already rolled; this only shows the result.
// Each die is a CSS cube with six pipped faces, turned so the rolled number
// faces up, after roll-a-die by ukatama and chukwumaijem (MIT License, see
// assets/licenses/MIT-roll-a-die.txt): https://github.com/chukwumaijem/roll-a-die
// A roll throws the cube onto the felt: it tumbles in from the side, bounces
// twice and settles on the face the engine rolled.
import { reducedMotion } from './dom.js';
import { sfx } from './sound.js';

export const ROLL_MS = 1200;

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// How the cube turns to bring each face to the front (opposite faces add to 7).
const TURN = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
// When the tumbling stops: the die is flat on the felt from its second
// landing on, and only skids round a little after that.
const SETTLE = 0.76;

// The flight, as [time, share of the distance still to go, height in px]:
// a drop, two shrinking bounces, then rest.
const FLIGHT = [[0, 1, 150], [0.36, 0.32, 0], [0.58, 0.14, 38], [0.76, 0.05, 0], [0.88, 0.015, 9], [1, 0, 0]];
const FALL = 'cubic-bezier(.55,0,1,.45)';
const RISE = 'cubic-bezier(0,.55,.45,1)';

export function dieFaces(value) {
  return Array.from({ length: 9 }, (_, i) => (PIPS[value]?.includes(i) ? '<span class="pipdot"></span>' : '<span></span>')).join('');
}

const pose = (x, y, z, [tx, ty]) => `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg) rotateX(${tx}deg) rotateY(${ty}deg)`;

export function dieHtml(value, { red = false, gold = false, small = false, label = '', id = '' } = {}) {
  const sides = [1, 2, 3, 4, 5, 6];
  const core = sides.map((n) => `<div class="die-core f${n}"></div>`).join('');
  const faces = sides.map((n) => `<div class="die-face f${n}">${dieFaces(n)}</div>`).join('');
  const cube = `<div class="die-cube" style="transform:${pose(0, 0, 0, TURN[value] ?? TURN[1])}">${core}${faces}</div>`;
  return `<div class="die-wrap"><div class="die${red ? ' red' : ''}${gold ? ' gold' : ''}${small ? ' small' : ''}" ${id ? `id="${id}"` : ''} role="img" aria-label="${label ? label + ': ' : ''}rolled ${value}" data-final="${value}"><div class="die-shadow"></div><div class="die-body">${cube}</div></div>${label ? `<div>${label}</div>` : ''}</div>`;
}

// Hides the dice inside root until rollDice throws them (for cards that roll
// one tray after another, so later results are not seen early).
export function holdDice(root) {
  if (!reducedMotion()) root.querySelectorAll('.die').forEach((d) => d.classList.add('waiting'));
}

// Throws every .die inside root and resolves once they have all settled.
export async function rollDice(root, ms = ROLL_MS) {
  const dice = [...root.querySelectorAll('.die')];
  dice.forEach((d) => d.classList.remove('waiting'));
  if (!dice.length || reducedMotion()) return;
  sfx.dice(ms);
  // The dice land one after another, but all within ms.
  const gap = dice.length > 1 ? Math.min(70, 240 / (dice.length - 1)) : 0;
  await Promise.all(dice.map((d, i) => throwDie(d, ms - i * gap, i * gap)));
}

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const spins = () => (Math.random() < 0.5 ? -1 : 1) * 360 * (1 + Math.floor(Math.random() * 2));

function throwDie(die, ms, delay) {
  const cube = die.querySelector('.die-cube');
  const body = die.querySelector('.die-body');
  const shadow = die.querySelector('.die-shadow');
  const turn = TURN[die.dataset.final] ?? TURN[1];
  // Comes to rest turned a little on the felt, as a real die does, and stays so.
  const z = Math.round(rand(-14, 14));
  const rest = pose(0, 0, z, turn);
  cube.style.transform = rest;
  const timing = { duration: ms * rand(0.9, 1), delay, fill: 'backwards' };
  // From a random corner of the tray, mostly sideways.
  const angle = rand(0, 2 * Math.PI);
  const dx = Math.cos(angle) * rand(70, 100);
  const dy = Math.sin(angle) * rand(25, 40);
  const frames = (draw) => FLIGHT.map(([offset, k, h]) => ({ offset, easing: h ? FALL : RISE, ...draw(dx * k, dy * k, h) }));
  const runs = [
    cube.animate([
      { offset: 0, transform: pose(spins() + rand(-90, 90), spins() + rand(-90, 90), z + rand(-180, 180), turn), easing: 'cubic-bezier(.25,.6,.4,1)' },
      { offset: SETTLE, transform: pose(0, 0, z + rand(-10, 10), turn), easing: 'ease-out' },
      { offset: 1, transform: rest },
    ], timing),
    body.animate(frames((x, y, h) => ({ transform: `translate3d(${x}px, ${y}px, ${h}px)` })), timing),
    // The shadow stays on the felt: further off and fainter while the die is high.
    shadow.animate(frames((x, y, h) => ({ transform: `translate(${x + h * 0.25}px, ${y + h * 0.35}px) scale(${1 + h / 300})`, opacity: 1 - h / 200 })), timing),
    die.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.12, delay, fill: 'backwards' }),
  ];
  return Promise.all(runs.map((a) => a.finished)).catch(() => {});
}
