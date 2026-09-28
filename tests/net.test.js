import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_CITIES } from '../src/data.js';
import { C, createGame, advance, currentPlayer, decide } from '../src/engine/index.js';
import { playBotGame } from '../src/engine/sim.js';
import { makeRoomCode, isRoomCode, normalizeRoomCode, CODE_CHARS, makeClientId, trimState, validateIntent, validateJoin, LOG_KEPT, ACT, DECIDE, END, NEXT } from '../src/net/protocol.js';

const two = () => [{ name: 'Ada', home: 'venice' }, { name: 'Bo', home: 'london' }];
const seats = [{ cid: 'aaa' }, { cid: 'bbb' }];

function toActions(state) {
  while (state.phase !== 'actions') advance(state);
  return state;
}

test('net: room codes are 4 letters and numbers, without look-alikes or vowels', () => {
  assert.equal(makeRoomCode(() => 0), 'BBBB');
  assert.equal(makeRoomCode(() => 0.99999), '9999');
  assert.ok(!/[AEIOU01L]/.test(CODE_CHARS));
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const c = makeRoomCode(); assert.ok(isRoomCode(c), c); seen.add(c); }
  assert.ok(seen.size > 490, 'codes are spread out');
  assert.ok([...seen].some((c) => /[A-Z]/.test(c)) && [...seen].some((c) => /\d/.test(c)), 'codes mix letters and numbers');
  assert.equal(normalizeRoomCode(' b7-kx '), 'B7KX');
  assert.ok(isRoomCode(normalizeRoomCode('b7kx')));
  assert.ok(!isRoomCode('B7K') && !isRoomCode('B7KXX') && !isRoomCode('BOKX') && !isRoomCode('b7kx') && !isRoomCode(null));
  assert.match(makeClientId(), /^[a-z0-9]{12}$/);
});

test('net: trimmed state keeps the journal and the recent log, and stays small', () => {
  const s = toActions(createGame({ players: [...two(), { name: 'Cy', home: 'lubeck' }, { name: 'Di', home: 'genoa' }], seed: 5 }));
  const t = trimState(s);
  assert.deepEqual(t.journal, s.journal);
  assert.ok(t.log.length <= LOG_KEPT);
  assert.deepEqual(t.log.at(-1), s.log.at(-1));
  assert.deepEqual(t.players, s.players);
  assert.equal(currentPlayer(t).id, currentPlayer(s).id);
  // The largest message: a finished 6-player standard game.
  const homes = ['venice', 'london', 'lubeck', 'genoa', 'bruges', 'florence'];
  const { state: big } = playBotGame({ players: homes.map((home, i) => ({ name: `House ${i + 1}`, home })), seed: 9 });
  const tb = trimState(big);
  assert.equal(tb.log.length, LOG_KEPT);
  assert.ok(big.log.length > LOG_KEPT, 'the original state is not changed');
  assert.ok(JSON.stringify(tb).length < 60000, `trimmed state is ${JSON.stringify(tb).length} bytes`);
});

test('net: only the current player’s device may act, decide or end the turn', () => {
  const s = toActions(createGame({ players: two(), seed: 3 }));
  const p = currentPlayer(s);
  while (p.pending.length) decide(s, p.pending[0].kind === 'wageLaw' ? 'pay' : false);
  const mine = seats[p.id].cid;
  const other = seats[1 - p.id].cid;
  assert.equal(validateIntent(s, seats, { t: END, from: mine }), null);
  assert.equal(validateIntent(s, seats, { t: ACT, from: mine, action: { type: 'loan' } }), null);
  assert.match(validateIntent(s, seats, { t: END, from: other }), /turn/);
  assert.match(validateIntent(s, seats, { t: END, from: 'zzz' }), /not joined/);
  assert.match(validateIntent(s, seats, { t: ACT, from: mine, action: { type: 'steal' } }), /Unknown action/);
  assert.match(validateIntent(s, seats, { t: ACT, from: mine }), /Unknown action/);
  assert.match(validateIntent(s, seats, { t: DECIDE, from: mine, choice: true }), /no decision/);
  assert.match(validateIntent(s, seats, { t: 'cheat', from: mine }), /Unknown message/);
  assert.match(validateIntent(s, seats, null), /Unknown message/);
});

test('net: any seated device may press Next; decisions need a valid choice', () => {
  const s = createGame({ players: two(), seed: 3 });
  assert.equal(validateIntent(s, seats, { t: NEXT, from: 'bbb', id: 1 }), null);
  assert.match(validateIntent(s, seats, { t: NEXT, from: 'zzz', id: 1 }), /not joined/);
  assert.match(validateIntent(s, seats, { t: END, from: 'aaa' }), /not a player/);
  toActions(s);
  const p = currentPlayer(s);
  p.pending.push({ kind: 'wageLaw', card: 'x', cities: [] });
  assert.match(validateIntent(s, seats, { t: DECIDE, from: seats[p.id].cid, choice: 'bribe' }), /Unknown choice/);
  assert.equal(validateIntent(s, seats, { t: DECIDE, from: seats[p.id].cid, choice: 'pay' }), null);
  assert.match(validateIntent(s, seats, { t: END, from: seats[p.id].cid }), /answer the card/);
});

test('net: joining checks names, home cities and the player limit', () => {
  const rules = { max: C.players.max, homes: HOME_CITIES };
  const taken = [{ name: 'Ada', home: 'venice' }];
  assert.equal(validateJoin(taken, { name: 'Bo', home: 'london' }, rules), null);
  assert.match(validateJoin(taken, { name: ' ', home: 'london' }, rules), /name/);
  assert.match(validateJoin(taken, { name: 'Bo', home: 'venice' }, rules), /Ada already/);
  assert.match(validateJoin(taken, { name: 'Bo', home: 'caffa' }, rules), /home cities/);
  assert.match(validateJoin(taken, { name: 'x'.repeat(25), home: 'london' }, rules), /24/);
  const full = HOME_CITIES.slice(0, C.players.max).map((h, i) => ({ name: `H${i}`, home: h }));
  assert.match(validateJoin(full, { name: 'Late', home: HOME_CITIES.at(-1) }, rules), /full/);
});
