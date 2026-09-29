import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, CITIES, HOME_CITIES } from '../src/data.js';
import {
  C, ESTATE, createGame, advance, endTurn, decide, currentPlayer, performAction, checkAction,
  scorePlayer, rankPlayers, mortalityPhase, advanceCities, familyTotal, shipQuote, legalShipments,
  applyCard, cardById, strikeCity, legalPosts, routesFrom, otherEnd,
} from '../src/engine/index.js';
import { playBotGame } from '../src/engine/sim.js';
import { fillTemplate } from '../src/render/template.js';
import { sectionTexts } from '../src/render/usage.js';

const four = () => [
  { name: 'Ada', home: 'venice' },
  { name: 'Bo', home: 'london' },
  { name: 'Cy', home: 'lubeck' },
  { name: 'Di', home: 'genoa' },
];

// Advance to the first player's action phase, answering any decisions.
function toActions(state) {
  while (state.phase !== 'actions') advance(state);
  return state;
}
function clearPending(state) {
  const p = currentPlayer(state);
  while (p.pending.length) decide(state, p.pending[0].kind === 'wageLaw' ? 'pay' : false);
  return p;
}

test('setup: validates player count and home cities', () => {
  assert.throws(() => createGame({ players: [{ name: 'Solo', home: 'venice' }] }), /between 2 and 6/);
  assert.throws(() => createGame({ players: [{ name: 'A', home: 'venice' }, { name: 'B', home: 'venice' }] }), /cannot share/);
  assert.throws(() => createGame({ players: [{ name: 'A', home: 'venice' }, { name: 'B', home: 'caffa' }] }), /not one of the home cities/);
  assert.equal(HOME_CITIES.length, 8);
});

test('setup: starting resources, Caffa stricken, random turn order', () => {
  const s = createGame({ players: four(), seed: 7 });
  for (const p of s.players) {
    const bonus = CITIES[p.home].home;
    assert.equal(p.florins, C.start.florins + bonus.startFlorins);
    assert.equal(familyTotal(p), C.start.family);
    assert.deepEqual(p.posts, [p.home]);
  }
  assert.equal(s.cities.caffa.state, 'stricken');
  assert.deepEqual([...s.order].sort(), [0, 1, 2, 3]);
});

test('timeline: round 1 strikes exactly the cities that historically fell in Late 1347', () => {
  const s = createGame({ players: four(), seed: 3 });
  advance(s);
  assert.equal(s.round, 1);
  const expected = DATA.cities.filter((c) => c.arrival.round <= 1).map((c) => c.id).sort();
  const stricken = Object.entries(s.cities).filter(([, c]) => c.state === 'stricken').map(([id]) => id).sort();
  assert.deepEqual(stricken, expected);
  assert.ok(s.currentChronicle.includes('CHR-messina'));
});

test('timeline: every city is struck no later than its historical round', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { state } = playBotGame({ seed, players: four().map((p) => ({ ...p, strategy: 'greedy' })) });
    for (const c of DATA.cities) {
      assert.notEqual(state.cities[c.id].state, 'safe', `${c.name} should have been struck`);
    }
  }
});

test('turn order: rolled once at the start, then fixed for the whole game', () => {
  const s = createGame({ players: four(), seed: 11 });
  const roll = s.log.find((e) => e.type === 'orderRoll');
  assert.ok(roll && roll.rolls.length >= 1, 'turn-order dice were rolled');
  const first = roll.rolls[0];
  const top = Math.max(...first.map((r) => r.die));
  assert.ok(first.filter((r) => r.die === top).some((r) => r.player === s.order[0]), 'a highest roller goes first');
  const order = [...s.order];
  toActions(s);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const p = clearPending(s);
    seen.push(p.id);
    assert.equal(p.ap, C.modes.standard.actionPoints + (s.guildFavor === p.id ? C.comeback.guildFavorAP : 0));
    assert.ok(endTurn(s).ok);
  }
  assert.deepEqual(seen, order);
  assert.equal(s.phase, 'plague');
  assert.deepEqual(s.order, order, 'order never changes');
});

test('illegal moves are blocked with a reason', () => {
  const s = toActions(createGame({ players: four(), seed: 5 }));
  const p = currentPlayer(s);
  if (p.pending.length) assert.match(checkAction(s, { type: 'charity', kind: 'church' }), /answer the card/);
  clearPending(s);
  // Stricken city: no new posts.
  const stricken = Object.keys(s.cities).find((id) => s.cities[id].state === 'stricken' && !p.posts.includes(id));
  p.posts.push('constantinople'); // make it adjacent for the test
  assert.match(checkAction(s, { type: 'post', city: 'messina' }), /Stricken|gates/);
  assert.ok(stricken);
  // Too many family moved.
  assert.match(checkAction(s, { type: 'move', from: p.home, to: ESTATE, count: 3 }), /at most 2/);
  // Ship twice from the same post.
  const [first] = legalShipments(s, p);
  assert.ok(performAction(s, first).ok);
  assert.match(checkAction(s, first), /already shipped/);
  // Opening a post takes 2 action points; only 1 is left after shipping.
  assert.match(checkAction(s, { type: 'post', city: 'moscow' }), /takes 2 action points/);
  p.ap = 2;
  // Not connected.
  assert.match(checkAction(s, { type: 'post', city: 'moscow' }), /not connected/);
  // Out of money.
  p.florins = 0;
  assert.match(checkAction(s, { type: 'charity', kind: 'church' }), /costs/);
  // Out of action points.
  p.ap = 0;
  assert.match(checkAction(s, { type: 'prepare', city: p.home }), /no action points/);
});

test('shipping: profit follows the published formula', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = toActions(createGame({ players: four(), seed }));
    const p = clearPending(s);
    for (const a of legalShipments(s, p).slice(0, 1)) {
      const q = shipQuote(s, p, a.route, a.from);
      const r = performAction(s, a);
      assert.ok(r.ok);
      const raw = Math.max(0, q.fixed + r.entry.profitDie);
      assert.equal(r.entry.profit, r.entry.infected ? Math.floor(raw * C.shipping.infectedProfitFactor) : raw);
      assert.ok(r.entry.profitDie >= 1 && r.entry.profitDie <= 6);
    }
  }
});

test('contagion: infected cargo brings the plague at most one round early', () => {
  const s = toActions(createGame({ players: four(), seed: 21 }));
  const p = clearPending(s);
  // Round 1: Messina is Stricken; Genoa historically falls in round 2 (one round later).
  p.posts.push('messina');
  s.cities.messina.severity = 3;
  s.effects.contagion.all = 6; // guarantee infection for the test
  const r = performAction(s, { type: 'ship', from: 'messina', route: 'messina-genoa' });
  assert.ok(r.entry.infected);
  assert.equal(s.cities.genoa.state, 'stricken');
  assert.equal(s.cities.genoa.early, true);
  // Tunis falls in round 3: two rounds ahead, so no early spread.
  const r2 = performAction(s, { type: 'ship', from: p.home === 'genoa' ? 'genoa' : 'messina', route: 'messina-tunis' });
  if (r2.ok && r2.entry.infected) assert.equal(s.cities.tunis.state, 'safe');
});

test('survival: mortality rolls, inheritance, and the last heir never dies', () => {
  let deaths = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = createGame({ players: four(), seed });
    const p = s.players[0];
    s.cities[p.home].state = 'stricken';
    s.cities[p.home].severity = 3;
    const before = p.florins;
    mortalityPhase(s);
    const lost = C.start.family - familyTotal(p);
    deaths += lost;
    assert.equal(p.florins, before + lost * C.gains.inheritance);
    assert.ok(familyTotal(p) >= 1);
  }
  // Severity 3 kills on 1-3 of a d6: about half of 5 members = 2.5 per trial.
  assert.ok(deaths / 200 > 1.8 && deaths / 200 < 3.2, `average deaths ${deaths / 200}`);
  // Last heir alone in a Devastating city always survives.
  for (let seed = 1; seed <= 100; seed++) {
    const s = createGame({ players: four(), seed });
    const p = s.players[0];
    p.family = { [p.home]: 1 };
    s.cities[p.home].state = 'stricken';
    s.cities[p.home].severity = 3;
    mortalityPhase(s);
    assert.equal(familyTotal(p), 1);
  }
});

test('preparing improves survival odds', () => {
  const trial = (prepared) => {
    let dead = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = createGame({ players: four(), seed });
      const p = s.players[0];
      s.cities[p.home].state = 'stricken';
      s.cities[p.home].severity = 2;
      if (prepared) p.prepared.push(p.home);
      mortalityPhase(s);
      dead += C.start.family - familyTotal(p);
    }
    return dead;
  };
  assert.ok(trial(true) < trial(false));
});

test('cities move from Stricken to Aftermath after the set number of rounds', () => {
  const s = createGame({ players: four(), seed: 2 });
  strikeCity(s, 'paris');
  for (let i = 0; i < C.plague.strickenRounds - 1; i++) advanceCities(s);
  assert.equal(s.cities.paris.state, 'stricken');
  advanceCities(s);
  assert.equal(s.cities.paris.state, 'aftermath');
});

test('scoring: wealth, family, reputation and the balance bonus', () => {
  const s = createGame({ players: four(), seed: 1 });
  const p = s.players[0];
  p.florins = 62; p.posts = ['venice', 'florence']; p.family = { venice: 4 }; p.reputation = 9;
  let sc = scorePlayer(p);
  assert.equal(sc.wealth, Math.floor(62 / C.scoring.florinsPerPoint) + 2);
  assert.equal(sc.family, 12);
  assert.equal(sc.reputation, 9);
  assert.equal(sc.balance, 9);
  assert.equal(sc.total, sc.wealth + 12 + 9 + 9);
  // Reputation above the soft cap counts at a reduced rate.
  p.reputation = 16;
  sc = scorePlayer(p);
  assert.equal(sc.reputation, C.scoring.reputationSoftCap + Math.floor((16 - C.scoring.reputationSoftCap) / C.scoring.reputationHighRate));
});

test('winning: highest Legacy wins; ties broken by reputation', () => {
  const s = createGame({ players: four(), seed: 1 });
  for (const p of s.players) { p.florins = 0; p.posts = [p.home]; p.family = { [p.home]: 1 }; p.reputation = 1; }
  const [a, b] = s.players;
  a.florins = 3 * C.scoring.florinsPerPoint; a.reputation = 5; // wealth 3+1, family 3, rep 5, balance 3 = 15
  b.florins = 2 * C.scoring.florinsPerPoint; b.reputation = 6; // wealth 2+1, family 3, rep 6, balance 3 = 15
  assert.equal(scorePlayer(a).total, 15);
  assert.equal(scorePlayer(b).total, 15);
  const ranks = rankPlayers(s);
  assert.equal(ranks[0].id, b.id, 'tie goes to higher reputation');
  assert.equal(ranks[1].id, a.id);
  assert.equal(ranks[1].place, 2);
});

test('full games finish with a winner, for 2 to 6 players, in both modes', () => {
  const strategies = ['greedy', 'balanced', 'cautious', 'charitable'];
  const homes = ['venice', 'london', 'lubeck', 'genoa', 'florence', 'bruges'];
  for (const mode of ['standard', 'quick']) {
    for (const n of [2, 3, 4, 5, 6]) {
      for (let seed = 1; seed <= 6; seed++) {
        const players = homes.slice(0, n).map((home, i) => ({ name: `P${i}`, home, strategy: strategies[(i + seed) % 4] }));
        const { state, turns } = playBotGame({ seed, players, mode });
        assert.equal(state.phase, 'ended');
        assert.equal(state.roundEnd, C.rounds);
        assert.equal(turns, (C.rounds / C.modes[mode].span) * n);
        assert.ok(state.winner.length >= 1);
        for (const p of state.players) assert.ok(familyTotal(p) >= 1, 'no house is ever eliminated');
      }
    }
  }
});

test('quick play: 6 rounds of a whole year, two plague rolls per round', () => {
  const s = createGame({ players: four(), seed: 8, mode: 'quick' });
  advance(s);
  assert.equal(s.round, 1);
  assert.equal(s.roundEnd, 2);
  const expected = DATA.cities.filter((c) => c.arrival.round <= 2).map((c) => c.id).sort();
  const stricken = Object.entries(s.cities).filter(([, c]) => c.state === 'stricken').map(([id]) => id).sort();
  assert.deepEqual(stricken, expected, 'both half-years are struck at once');
  toActions(s);
  for (let i = 0; i < 4; i++) { clearPending(s); assert.equal(currentPlayer(s).ap, C.modes.quick.actionPoints + (s.guildFavor === currentPlayer(s).id ? 1 : 0)); endTurn(s); }
  assert.equal(s.log.filter((e) => e.type === 'plague' && e.round === 1).length, 2);
});

test('Great Mortality raises severity and contagion', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = createGame({ players: four(), seed, difficulty: 'mortality' });
    advance(s);
    assert.ok(s.cities.constantinople.severity >= 2, 'no Light outbreaks on Great Mortality');
  }
  const s = toActions(createGame({ players: four(), seed: 3, difficulty: 'mortality' }));
  const p = clearPending(s);
  p.posts.push('messina');
  const q = shipQuote(s, p, 'messina-genoa', 'messina');
  assert.equal(q.contagionRisk, Math.min(6, s.cities.messina.severity + 1));
});

test('fortune cards: rolling a 6 or opening a post draws a personal card', () => {
  let drawn = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = toActions(createGame({ players: four(), seed }));
    const p = clearPending(s);
    for (const a of legalShipments(s, p).slice(0, 1)) {
      const r = performAction(s, a);
      const fortune = s.log.filter((e) => e.type === 'fortune');
      if (r.entry.profitDie === 6) { assert.equal(fortune.length, 1); drawn++; } else assert.equal(fortune.length, 0);
      assert.ok(fortune.every((e) => e.player === p.id), 'only the active house draws');
    }
  }
  assert.ok(drawn > 0);
  assert.equal(DATA.fortune.length >= 20, true);
});

test('fortune: free post costs nothing and gives no AP cost; clean hold skips contagion', () => {
  const s = toActions(createGame({ players: four(), seed: 12 }));
  const p = clearPending(s);
  p.free.post = true;
  const before = { f: p.florins, ap: p.ap };
  const city = legalPosts(s, p)[0].city;
  assert.ok(performAction(s, { type: 'post', city }).ok);
  while (p.pending.length) decide(s, false);
  assert.equal(p.ap, before.ap, 'no action point spent');
  p.posts.push('messina');
  p.nextShip = { profit: 0, safe: true };
  s.effects.contagion.all = 6;
  const r = performAction(s, { type: 'ship', from: 'messina', route: 'messina-genoa' });
  assert.equal(r.entry.contagionDie, null);
  assert.equal(r.entry.infected, false);
});

test('persecution: protecting costs money and a turn action; nobody can profit', () => {
  const s = createGame({ players: four(), seed: 9 });
  while (s.round < 4 || s.phase !== 'event') advance(s), s.phase === 'actions' && [0, 1, 2, 3].forEach(() => { clearPending(s); endTurn(s); });
  assert.equal(s.cities.strasbourg.unrest > 0, true);
  advance(s); // to actions
  const p = currentPlayer(s);
  const before = { f: p.florins, r: p.reputation };
  while (p.pending.length && p.pending[0].kind !== 'protect') decide(s, p.pending[0].kind === 'wageLaw' ? 'pay' : false);
  const ap = p.ap;
  assert.ok(decide(s, true).ok);
  assert.equal(p.ap, ap - 1);
  assert.ok(p.florins <= before.f - C.costs.protectCommunity);
  assert.ok(p.reputation > before.r);
  // Declining gives nothing.
  const card = cardById('CHR-strasbourg');
  assert.equal(card.effect.type, 'persecution');
});

test('wage law: obeying blocks shipping from English posts this round', () => {
  const s = toActions(createGame({ players: four(), seed: 4 }));
  const p = clearPending(s);
  p.posts.push('london');
  p.pending.push({ kind: 'wageLaw', card: 'CHR-ordinance', cities: ['london', 'melcombe'] });
  assert.ok(decide(s, 'obey').ok);
  assert.match(checkAction(s, { type: 'ship', from: 'london', route: 'london-bruges' }), /wage law/);
});

test('remedy seller: buying the cure has no benefit', () => {
  const s = toActions(createGame({ players: four(), seed: 6 }));
  const p = clearPending(s);
  p.florins = 20;
  applyCard(s, cardById('EV-quack'));
  const before = { f: p.florins, r: p.reputation, fam: familyTotal(p) };
  assert.ok(decide(s, true).ok);
  assert.equal(p.florins, before.f - 3);
  assert.equal(p.reputation, before.r);
  assert.equal(familyTotal(p), before.fam);
});

test('save and restore: a saved game continues identically', () => {
  const a = createGame({ players: four(), seed: 42 });
  toActions(a);
  const saved = JSON.stringify(a);
  const b = JSON.parse(saved);
  const run = (s) => {
    clearPending(s);
    for (const act of legalShipments(s, currentPlayer(s)).slice(0, 2)) performAction(s, act);
    return JSON.stringify({ log: s.log.slice(-3), players: s.players });
  };
  assert.equal(run(a), run(b));
});

test('rules text: every placeholder resolves against config.json', () => {
  for (const sec of DATA.rulebook.sections) {
    for (const t of sectionTexts(sec)) assert.doesNotThrow(() => fillTemplate(t, C), `section ${sec.title}`);
  }
});

// ---------- Merchant's Ledger and Hold Offshore ----------

// Ends every remaining turn this round (declining offers), which runs the plague phase.
function finishRound(state) {
  while (state.phase === 'actions') {
    clearPending(state);
    endTurn(state);
  }
}
// Plays on until it is `p`'s turn in the next round.
function nextTurnOf(state, p) {
  finishRound(state);
  toActions(state);
  while (currentPlayer(state) !== p) { clearPending(state); endTurn(state); }
  return clearPending(state);
}

test('hold offshore: infected cargo costs no reputation and does not spread', () => {
  const s = toActions(createGame({ players: four(), seed: 21 }));
  const p = clearPending(s);
  p.posts.push('messina');
  s.cities.messina.severity = 3;
  s.effects.contagion.all = 6; // guarantee infection
  p.florins = 20;
  const rep = p.reputation;
  const r = performAction(s, { type: 'ship', from: 'messina', route: 'messina-genoa', offshore: true });
  assert.ok(r.ok && r.entry.infected);
  assert.equal(s.cities.genoa.state, 'safe', 'the plague did not spread');
  assert.equal(p.reputation, rep, 'no reputation lost');
  assert.equal(p.florins, 20 - C.costs.holdOffshore + r.entry.profit);
  assert.match(checkAction(s, { type: 'ship', from: p.home, route: routesFrom(p.home)[0].id, offshore: true }), /Stricken city/);
});

test('arrange a marriage: only in Aftermath, and never above the starting family', () => {
  const s = toActions(createGame({ players: four(), seed: 4 }));
  const p = clearPending(s);
  p.florins = 20;
  p.family[p.home] = 3;
  assert.match(checkAction(s, { type: 'marry', city: p.home }), /not in Aftermath/);
  s.cities[p.home].state = 'aftermath';
  const ap = p.ap;
  assert.ok(performAction(s, { type: 'marry', city: p.home }).ok);
  assert.equal(p.family[p.home], 4);
  assert.equal(p.florins, 20 - C.costs.marriage);
  assert.equal(p.ap, ap - 1);
  assert.match(checkAction(s, { type: 'marry', city: p.home }), /already arranged a marriage/);
  p.family[p.home] = C.start.family;
  p.marriedThisTurn = 0;
  assert.match(checkAction(s, { type: 'marry', city: p.home }), /already has 5 family/);
});

test('abandoned land: adds Wealth points and charges wages each half-year', () => {
  for (const broke of [false, true]) {
    const s = toActions(createGame({ players: four(), seed: 6 }));
    const p = clearPending(s);
    s.cities[p.home].state = 'aftermath';
    p.florins = 20;
    assert.ok(performAction(s, { type: 'land', city: p.home }).ok);
    assert.equal(scorePlayer(p).wealth, Math.floor(p.florins / C.scoring.florinsPerPoint) + p.posts.length + C.scoring.pointsPerLand);
    assert.match(checkAction(s, { type: 'land', city: p.home }), /already own land/);
    p.family = { [ESTATE]: familyTotal(p) }; // keep inheritance out of the sums
    p.florins = broke ? 0 : 10;
    const rep = p.reputation;
    finishRound(s);
    assert.equal(p.florins, broke ? 0 : 10 - C.costs.landWage);
    assert.equal(p.reputation, broke ? rep - 1 : rep);
  }
});

test('loan: no action point, repaid next round, default costs reputation, settled at the end', () => {
  const s = toActions(createGame({ players: four(), seed: 9 }));
  const p = clearPending(s);
  const f = p.florins, ap = p.ap;
  assert.ok(performAction(s, { type: 'loan' }).ok);
  assert.equal(p.florins, f + C.gains.loan);
  assert.equal(p.ap, ap);
  assert.match(checkAction(s, { type: 'loan' }), /already owe/);
  p.family = { [ESTATE]: familyTotal(p) };
  finishRound(s);
  assert.ok(p.loan, 'not due yet after the first round');
  nextTurnOf(s, p);
  p.family = { [ESTATE]: familyTotal(p) };
  p.florins = 3;
  p.reputation = 10;
  finishRound(s);
  assert.equal(p.loan, null);
  assert.equal(p.florins, 0);
  assert.equal(p.reputation, 10 - C.penalties.loanDefaultReputation);

  s.round = s.roundEnd = C.rounds;
  s.phase = 'actions';
  s.turn = s.order.indexOf(p.id);
  assert.match(checkAction(s, { type: 'loan' }), /final round/);
  p.loan = { owed: C.costs.loanRepay, due: 99 };
  p.florins = 20;
  s.phase = 'plague';
  advance(s);
  assert.equal(s.phase, 'ended');
  assert.equal(p.florins, 20 - C.costs.loanRepay, 'open debts are paid before final scoring');
});

test('partnership: the other house decides, both earn on shared cities, then it ends', () => {
  const s = toActions(createGame({ players: four(), seed: 12 }));
  const a = clearPending(s);
  const b = s.players[s.order[1]];
  assert.ok(performAction(s, { type: 'deal', partner: b.id }).ok);
  assert.match(checkAction(s, { type: 'deal', partner: s.order[2] }), /already proposed/);
  assert.ok(b.pending.some((d) => d.kind === 'deal'));
  endTurn(s);
  while (b.pending.length) decide(s, b.pending[0].kind === 'deal' ? true : b.pending[0].kind === 'wageLaw' ? 'pay' : false);
  assert.equal(a.deal.partner, b.id);
  assert.equal(b.deal.partner, a.id);
  const route = routesFrom(b.home).find((r) => !s.cities[b.home].state.startsWith('strick'));
  const dest = otherEnd(route, b.home);
  a.posts.push(dest);
  const q = shipQuote(s, b, route.id, b.home);
  assert.ok(q.parts.some((x) => x.label.startsWith('Partner') && x.value === C.gains.dealShipperBonus));
  const af = a.florins;
  assert.ok(performAction(s, { type: 'ship', from: b.home, route: route.id }).ok);
  assert.equal(a.florins, af + C.gains.dealBonus);
  finishRound(s);
  assert.ok(a.deal, 'still partners after the first round');
  toActions(s);
  finishRound(s);
  assert.equal(a.deal, null);
  assert.equal(b.deal, null);
});

test('close your gates: rivals cannot open a post there and earn less shipping in', () => {
  const s = toActions(createGame({ players: four(), seed: 14 }));
  const a = clearPending(s);
  const rep = a.reputation;
  assert.ok(performAction(s, { type: 'gates', city: a.home }).ok);
  assert.equal(a.reputation, rep - C.penalties.gatesReputation);
  endTurn(s);
  const b = clearPending(s);
  const route = routesFrom(a.home)[0];
  const near = otherEnd(route, a.home);
  if (!b.posts.includes(near)) b.posts.push(near);
  b.florins = 30;
  assert.match(checkAction(s, { type: 'post', city: a.home }), /closed the gates/);
  const q = shipQuote(s, b, route.id, near);
  assert.ok(q.parts.some((x) => x.label.startsWith('Gates closed') && x.value === -C.penalties.gatesProfit));
  finishRound(s);
  assert.ok(a.gates);
  toActions(s);
  finishRound(s);
  assert.equal(a.gates, null, 'the gates open again after the next round');
});
