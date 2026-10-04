import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../src/data.js';
import { playBotGame } from '../src/engine/sim.js';
import { storyCard, storyHtml, chroniclePages, splitStory, share } from '../src/ui/stories.js';
import { housePanelHtml } from '../src/ui/prompts.js';
import { C, createGame, advance, currentPlayer, endTurn, performAction, decide, legalPosts } from '../src/engine/index.js';

const homes = ['venice', 'london', 'lubeck', 'genoa', 'bruges', 'florence'];
const game = (n, mode, seed) => playBotGame({ players: homes.slice(0, n).map((home, i) => ({ name: `House ${i + 1}`, home })), mode, seed }).state;

// The same groups of log entries the big screen shows as one card.
function storiesOf(state) {
  const out = [];
  const log = state.log;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const run = (types) => { const g = [e]; while (i + 1 < log.length && types.includes(log[i + 1].type)) g.push(log[++i]); return g; };
    if (e.type === 'prologue') out.push(['prologue', { e }]);
    else if (e.type === 'orderRoll') out.push(['order', { e }]);
    else if (e.type === 'round') out.push(['round', { group: run(['arrival', 'arrivalAlready']) }]);
    else if (e.type === 'card' && e.deck === 'chronicle') {
      // All of a round's Chronicle cards, in pages (as the big screen shows them).
      const groups = [run(['effect'])];
      while (log[i + 1]?.type === 'card' && log[i + 1].deck === 'chronicle') { i++; groups.push([log[i], ...run(['effect']).slice(1)]); }
      for (const page of chroniclePages(groups)) out.push(['chronicle', page]);
    } else if (e.type === 'card') out.push(['card', { group: run(['effect']) }]);
    else if (e.type === 'plague') out.push(['plague', { group: run(['plague', 'mortality', 'aftermath', 'upkeep', 'loanRepaid', 'loanDefault', 'dealEnd', 'gatesOpen']) }]);
    else if (e.type === 'fortune') out.push(['fortune', { e }]);
    else if (e.type === 'ship') out.push(['ship', { e }]);
    else if (e.type === 'physician') out.push(['physician', { e }]);
    else if (e.type === 'arrival' && e.early) out.push(['spread', { arrival: e }]);
    else if (e.type === 'decision' && e.kind === 'wageLaw' && e.choice === 'pay') out.push(['wage', { entry: e }]);
  }
  return out;
}

test('stories: every card of whole games can be drawn from its data alone (as a device does)', () => {
  const kinds = new Set();
  for (const [n, mode, seed] of [[2, 'standard', 1], [4, 'quick', 2], [6, 'standard', 3], [3, 'quick', 4]]) {
    const state = game(n, mode, seed);
    for (const [kind, data] of storiesOf(state)) {
      // Devices receive the data as JSON, so draw it from a JSON copy.
      const card = storyCard(state, kind, JSON.parse(JSON.stringify(data)), { still: true, hints: true });
      assert.ok(card, kind);
      const html = storyHtml(card, '<button>Close</button>');
      assert.ok(card.body.length > 40, `${kind} has content`);
      assert.ok(card.opts.label, `${kind} has a title`);
      assert.doesNotMatch(html, /undefined|NaN|\[object Object\]/, `${kind} shows no missing values`);
      kinds.add(kind);
    }
  }
  for (const k of ['prologue', 'order', 'round', 'chronicle', 'card', 'plague', 'fortune', 'ship']) assert.ok(kinds.has(k), `tested a ${k} card`);
});

test('stories: a long card deals out over any number of pages without losing or repeating a line', () => {
  const split = new Set();
  for (const [n, mode, seed] of [[6, 'standard', 3], [4, 'quick', 2]]) {
    const state = game(n, mode, seed);
    const whole = [];
    for (const [kind, data] of storiesOf(state)) {
      // The big screen splits a round's Chronicle cards itself, from all of them.
      if (kind === 'chronicle') { if (data.page === 1) whole.push([kind, { groups: [] }]); whole.at(-1)[1].groups.push(...data.groups); } else whole.push([kind, data]);
    }
    for (const [kind, data] of whole) {
      const s = splitStory(kind, data, { hints: true });
      if (!s) continue;
      split.add(kind);
      assert.ok(s.fallback.length >= 1);
      for (let k = 1; k <= s.units.length; k++) {
        const pages = JSON.parse(JSON.stringify(s.make(share(s.units, k))));
        assert.equal(pages.length, k, `${kind} over ${k} pages`);
        const lines = (d) => d.groups ?? d.group ?? [];
        if (kind === 'round') assert.deepEqual(pages.flatMap((p) => p.group.slice(1)), data.group.slice(1));
        else if (kind === 'chronicle' || kind === 'plague') assert.deepEqual(pages.flatMap(lines), lines(data));
        if (pages[0].facts) assert.equal(new Set(pages.flatMap((p) => p.facts)).size, pages.flatMap((p) => p.facts).length, 'no fact twice');
        pages.forEach((page, i) => {
          const card = storyCard(state, kind, page, { still: true, hints: true });
          assert.ok(card.body.length > 40, `${kind} page ${i + 1} of ${k} has content`);
          assert.doesNotMatch(storyHtml(card, ''), /undefined|NaN|\[object Object\]/);
          if (i < k - 1) assert.notEqual(card.button, 'Final scoring');
          if (k > 1 && page.pages) assert.match(card.opts.label, new RegExp(`${i + 1} of ${k}`));
        });
      }
    }
  }
  for (const k of ['prologue', 'order', 'round', 'chronicle', 'plague']) assert.ok(split.has(k), `split a ${k} card`);
});

test('stories: a device shows the turn order result straight away; unknown kinds are ignored', () => {
  const state = game(3, 'quick', 5);
  const e = state.log.find((x) => x.type === 'orderRoll');
  assert.match(storyCard(state, 'order', { e }, { still: true }).body, /visibility:visible/);
  assert.match(storyCard(state, 'order', { e }).body, /visibility:hidden/);
  assert.equal(storyCard(state, 'nonsense', {}), null);
});

test('stories: all twelve kinds of card render, including rare ones', () => {
  const state = game(4, 'standard', 6);
  const stories = new Map(storiesOf(state).map(([k, d]) => [k, d]));
  const arrival = state.log.find((x) => x.type === 'arrival');
  const decision = state.log.find((x) => x.type === 'decision');
  const extra = {
    physician: { e: { type: 'physician', city: 'venice', remedy: DATA.remedies[0].id, factIds: DATA.remedies[0].factIds ?? [] } },
    spread: { arrival: { ...arrival, early: true } },
    wage: { entry: { die: 2, text: 'The inspectors fine your house.' } },
    reveal: { cardId: DATA.deck.find((c) => c.effect.type === 'offer').id, entry: decision },
  };
  const all = ['prologue', 'order', 'round', 'chronicle', 'card', 'fortune', 'plague', 'ship', 'spread', 'physician', 'wage', 'reveal'];
  for (const kind of all) {
    const data = stories.get(kind) ?? extra[kind];
    assert.ok(data, `found data for ${kind}`);
    const card = storyCard(state, kind, JSON.parse(JSON.stringify(data)), { still: true });
    assert.doesNotMatch(storyHtml(card, ''), /undefined|NaN|\[object Object\]/, kind);
  }
});

test('house panel: a partnership or closed gates agreed in the final round still draws (it lasts to the end of the game)', () => {
  for (const mode of ['standard', 'quick']) {
    const state = createGame({ players: homes.slice(0, 3).map((home, i) => ({ name: `House ${i + 1}`, home })), mode, seed: 7 });
    // Play on to the first turn of the final round, declining every card.
    for (let guard = 0; guard < 2000 && !(state.phase === 'actions' && state.roundEnd >= C.rounds); guard++) {
      if (state.phase !== 'actions') { advance(state); continue; }
      const p = currentPlayer(state);
      while (p.pending.length) decide(state, p.pending[0].kind === 'wageLaw' ? 'obey' : false);
      endTurn(state);
    }
    assert.equal(state.phase, 'actions');
    const a = currentPlayer(state);
    while (a.pending.length) decide(state, a.pending[0].kind === 'wageLaw' ? 'obey' : false);
    const b = state.players[state.order[1]];
    assert.ok(performAction(state, { type: 'deal', partner: b.id }).ok);
    a.reputation = C.limits.maxReputation;
    assert.ok(performAction(state, { type: 'gates', city: a.home }).ok, 'gates closed');
    endTurn(state);
    while (b.pending[0]?.kind !== 'deal') decide(state, b.pending[0].kind === 'wageLaw' ? 'obey' : false);
    assert.ok(decide(state, true).ok, 'partnership accepted');
    for (const p of [a, b]) {
      // A device draws from the JSON copy it was sent.
      const copy = JSON.parse(JSON.stringify(state));
      const html = housePanelHtml(copy, copy.players[p.id]);
      assert.match(html, /Partner: .* until the end of the game/);
      assert.doesNotMatch(html, /undefined/);
    }
    assert.match(housePanelHtml(state, a), /Gates closed: .* until the end of the game/);
  }
});
