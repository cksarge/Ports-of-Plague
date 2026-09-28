import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../src/data.js';
import { playBotGame } from '../src/engine/sim.js';
import { storyCard, storyHtml } from '../src/ui/stories.js';

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
    else if (e.type === 'card') out.push(['card', { group: run(['effect']) }]);
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
  for (const k of ['prologue', 'order', 'round', 'card', 'plague', 'fortune', 'ship']) assert.ok(kinds.has(k), `tested a ${k} card`);
});

test('stories: a device shows the turn order result straight away; unknown kinds are ignored', () => {
  const state = game(3, 'quick', 5);
  const e = state.log.find((x) => x.type === 'orderRoll');
  assert.match(storyCard(state, 'order', { e }, { still: true }).body, /visibility:visible/);
  assert.match(storyCard(state, 'order', { e }).body, /visibility:hidden/);
  assert.equal(storyCard(state, 'nonsense', {}), null);
});

test('stories: all eleven kinds of card render, including rare ones', () => {
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
  const all = ['prologue', 'order', 'round', 'card', 'fortune', 'plague', 'ship', 'spread', 'physician', 'wage', 'reveal'];
  for (const kind of all) {
    const data = stories.get(kind) ?? extra[kind];
    assert.ok(data, `found data for ${kind}`);
    const card = storyCard(state, kind, JSON.parse(JSON.stringify(data)), { still: true });
    assert.doesNotMatch(storyHtml(card, ''), /undefined|NaN|\[object Object\]/, kind);
  }
});
