import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, createGame, advance, currentPlayer, performAction, validateSetup, botMove } from '../src/engine/index.js';
import { botDecide, mistakeRate } from '../src/engine/bots.js';
import { playBotGame } from '../src/engine/sim.js';
import { validateIntent, ACT } from '../src/net/protocol.js';

const human = { name: 'Ada', home: 'venice' };
const bot = (name, home, skill) => ({ name, home, bot: true, skill });

test('bots: one person can play against bots, but not zero people', () => {
  assert.equal(validateSetup({ players: [human, bot('Bo', 'london', 'easy')] }), null);
  assert.match(validateSetup({ players: [bot('A', 'venice', 'hard'), bot('B', 'london', 'hard')] }), /person/);
  assert.match(validateSetup({ players: [human, bot('Bo', 'london', 'expert')] }), /skill/);
});

test('bots: each bot gets a playing style from its skill level', () => {
  const s = createGame({ seed: 3, players: [human, bot('E', 'london', 'easy'), bot('M', 'genoa', 'medium'), bot('H', 'bruges', 'hard')] });
  const [a, e, m, h] = s.players;
  assert.equal(a.bot, false);
  assert.equal(a.strategy, null);
  for (const p of [e, m, h]) {
    assert.equal(p.bot, true);
    assert.ok(C.bots.skills[p.skill].strategies.includes(p.strategy), `${p.skill} → ${p.strategy}`);
  }
  assert.equal(h.strategy, 'balanced');
  assert.equal(mistakeRate(h), 0);
  assert.ok(mistakeRate(e) > mistakeRate(m));
});

test('bots: a bot turn is a series of legal moves that ends', () => {
  for (const skill of Object.keys(C.bots.skills)) {
    const s = createGame({ seed: `turn-${skill}`, players: [bot('B', 'genoa', skill), human] });
    while (s.phase !== 'actions') advance(s);
    // Make the bot go first whatever the dice said.
    const botId = s.players.find((p) => p.bot).id;
    s.order = [botId, ...s.order.filter((id) => id !== botId)];
    const p = currentPlayer(s);
    let moves = 0;
    for (;;) {
      const move = botMove(s);
      if (move.type === 'end') break;
      if (move.type === 'decide') assert.ok(botDecide(s, move.choice).ok);
      else assert.ok(performAction(s, move.action).ok, JSON.stringify(move.action));
      assert.ok(++moves < 40, 'the turn must end');
    }
    assert.equal(p.pending.length, 0);
  }
});

test('bots: a one-person game against bots of every skill plays to the end', () => {
  const players = [human, bot('E', 'london', 'easy'), bot('M', 'genoa', 'medium'), bot('H', 'bruges', 'hard')];
  const { state } = playBotGame({ seed: 'solo', players, mode: 'quick' });
  assert.equal(state.phase, 'ended');
  assert.ok(state.winner.length >= 1);
});

test('bots: harder bots win more often', () => {
  const wins = { easy: 0, medium: 0, hard: 0 };
  const homes = ['venice', 'london', 'genoa', 'bruges'];
  for (let g = 0; g < 60; g++) {
    const skills = ['easy', 'medium', 'hard'];
    // The person's seat is played by the simulator (at random); only the bots are counted.
    const players = [{ ...human, home: homes[3], strategy: 'random' }, ...skills.map((k, i) => bot(k, homes[(i + g) % 3], k))];
    const { state } = playBotGame({ seed: `skill-${g}`, players, mode: g % 2 ? 'quick' : 'standard' });
    for (const id of state.winner) if (state.players[id].bot) wins[state.players[id].skill] += 1 / state.winner.length;
  }
  assert.ok(wins.hard > wins.medium && wins.medium > wins.easy, JSON.stringify(wins));
});

test('bots: no device can act for a bot house in a multi-device game', () => {
  const s = createGame({ seed: 1, players: [bot('B', 'genoa', 'easy'), human] });
  while (s.phase !== 'actions') advance(s);
  const seats = s.players.map((p) => (p.bot ? { cid: `bot:${p.name}`, bot: true } : { cid: 'phone' }));
  const cur = currentPlayer(s);
  const msg = { t: ACT, from: seats[cur.id].cid, action: { type: 'loan' } };
  if (cur.bot) assert.match(validateIntent(s, seats, msg), /not joined/);
  else assert.equal(validateIntent(s, seats, msg), null);
  assert.match(validateIntent(s, seats, { ...msg, from: `bot:B` }), /not joined/);
});
