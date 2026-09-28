// Multi-device play: the messages sent between the big screen (host) and
// the players' devices, plus the checks the host runs on every request.
// No DOM and no network code here, so it can be tested with Node.
import { DATA } from '../data.js';
import { currentPlayer } from '../engine/state.js';

// Phone → host
export const JOIN = 'join';     // { name, home }
export const HELLO = 'hello';   // "I'm here" (on connect, reload or wake): host replies with the latest lobby or state
export const LEAVE = 'leave';
export const PING = 'ping';     // heartbeat, so the host can show who is connected
export const ACT = 'act';       // { action }  an action object for performAction
export const DECIDE = 'decide'; // { choice }  true/false, or 'obey'/'pay' for wage laws
export const END = 'end';       // end my turn
export const NEXT = 'next';     // { id }  press Next on the story card with this id
// Host → phones
export const LOBBY = 'lobby';   // { seats, options }
export const STATE = 'state';   // { rev, state, view, seats }
export const TOAST = 'toast';   // { to, text }
export const REJECT = 'reject'; // { to, reason }  join refused
export const CLOSED = 'closed'; // the host left the room
export const ROLL_CALL = 'roll-call'; // a (re)opened room asks every device to report in
export const BEAT = 'beat';     // the big screen's heartbeat, so devices notice if it disappears
// Host ↔ host: makes sure two big screens never share a room code.
export const PROBE = 'probe';
export const HOST_HERE = 'host-here';

export const PING_EVERY_MS = 8000;
export const OFFLINE_AFTER_MS = 25000;
// A device treats the big screen as gone after this long without a message
// (long enough for a big screen whose tab is briefly in the background).
export const HOST_GONE_AFTER_MS = 60000;

// Room codes are 4 letters and numbers. Letters and digits that are easy to
// mix up (0/O, 1/I/L) are left out, and so are vowels (and Y), so a code never
// spells a word: 27 characters, 531,441 codes.
export const CODE_CHARS = 'BCDFGHJKMNPQRSTVWXZ23456789';
export const CODE_LENGTH = 4;

export function makeRoomCode(random = Math.random) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
}

// What a player typed, tidied up: capitals, no spaces or dashes.
export const normalizeRoomCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isRoomCode = (code) => new RegExp(`^[${CODE_CHARS}]{${CODE_LENGTH}}$`).test(String(code ?? ''));

// A random id for this browser, kept so a device can rejoin its seat.
export function makeClientId(random = Math.random) {
  return Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(random() * 32)]).join('');
}

// The state sent to phones: everything they need to draw their screen, check
// actions and show the Journal, with only the end of the long log (keeps
// messages small).
export const LOG_KEPT = 15;
export function trimState(state) {
  return { ...state, log: state.log.slice(-LOG_KEPT) };
}

const ACTION_TYPES = new Set(DATA.actions.map((a) => a.id));
const CHOICES = [true, false, 'obey', 'pay'];

// Checks a request from a phone. Returns a plain-language reason, or null
// if the host should go ahead. The engine's own checks run afterwards.
// seats: [{ cid }] in player order (seat index = player id).
export function validateIntent(state, seats, msg) {
  if (!msg || typeof msg !== 'object') return 'Unknown message.';
  const seat = seats.findIndex((s) => s.cid === msg.from);
  if (seat < 0) return 'This device has not joined the game.';
  if (msg.t === NEXT) return typeof msg.id === 'number' ? null : 'Unknown card.';
  if (![ACT, DECIDE, END].includes(msg.t)) return 'Unknown message.';
  const p = currentPlayer(state);
  if (!p) return 'It is not a player’s turn.';
  if (p.id !== seat) return `It is ${p.name}'s turn.`;
  if (msg.t === ACT) {
    const a = msg.action;
    if (!a || typeof a !== 'object' || !ACTION_TYPES.has(a.type)) return 'Unknown action.';
    if (p.pending.length) return 'First answer the card waiting for you.';
  }
  if (msg.t === DECIDE) {
    if (!p.pending.length) return 'There is no decision waiting.';
    if (!CHOICES.includes(msg.choice)) return 'Unknown choice.';
  }
  if (msg.t === END && p.pending.length) return 'First answer the card waiting for you.';
  return null;
}

// Checks a join request against the seats already taken.
export function validateJoin(seats, { name, home }, { max, homes }) {
  if (!String(name ?? '').trim()) return 'Every house needs a name.';
  if (String(name).trim().length > 24) return 'House names can be at most 24 letters.';
  if (!homes.includes(home)) return 'Choose one of the home cities.';
  if (seats.length >= max) return `The game is full (${max} houses).`;
  const taken = seats.find((s) => s.home === home);
  if (taken) return `${taken.name} already has that home city. Choose another.`;
  return null;
}
