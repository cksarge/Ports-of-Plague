// The round and turn sequence:
//   roundStart → chronicle → event → actions (each player) → plague → next round … → ended
// A round is half a year (Standard) or a whole year (Quick Play: two
// half-years at once). The interface calls advance() after showing each
// phase; players act with performAction(), decide(), and endTurn().
import { DATA } from '../data.js';
import { C, addLog, emptyEffects, currentPlayer, roundInfo, modeOf, difficultyOf } from './state.js';
import { applyCard, resolveDecision } from './events.js';
import { historicalArrivals, mortalityPhase, advanceCities } from './plague.js';
import { scorePlayer, rankPlayers, lastPlaceId } from './scoring.js';
import { shuffle } from './rng.js';

export function actionPointsFor(state, p) {
  let ap = modeOf(state).actionPoints;
  if (state.guildFavor === p.id) ap += C.comeback.guildFavorAP;
  return ap;
}

export function advance(state) {
  switch (state.phase) {
    case 'roundStart':
    case 'plague':
      if (state.phase === 'plague' && state.roundEnd >= C.rounds) return endGame(state);
      return startRound(state);
    case 'chronicle':
      return eventPhase(state);
    case 'event':
      return actionPhase(state);
    case 'actions':
      throw new Error('Players are still taking turns; call endTurn().');
    case 'ended':
      return state;
    default:
      throw new Error(`Unknown phase ${state.phase}`);
  }
}

// Guild's Favor: from the set round, the last-place house gets +1 AP, but
// only if it trails the leader by at least `guildFavorMinGap` Legacy points.
export function guildFavorFor(state) {
  if (state.round < C.comeback.guildFavorFromRound) return null;
  const last = lastPlaceId(state);
  const leader = Math.max(...state.players.map((p) => scorePlayer(p).total));
  return leader - scorePlayer(state.players[last]).total >= (C.comeback.guildFavorMinGap ?? 0) ? last : null;
}

// Half-years covered by the current round.
export function halvesOfRound(state) {
  const out = [];
  for (let h = state.round; h <= state.roundEnd; h++) out.push(h);
  return out;
}

function startRound(state) {
  state.round = state.roundEnd + 1;
  state.roundEnd = Math.min(C.rounds, state.round + (state.span ?? 1) - 1);
  state.effects = emptyEffects();
  state.currentEvent = null;
  state.persecution = null;
  for (const p of state.players) {
    Object.assign(p, { shipped: [], prepared: [], physician: [], free: {}, englishBlocked: false, pending: [], ap: 0, nextShip: null, personalCosts: {} });
  }
  state.guildFavor = guildFavorFor(state);
  // Remember who was last at the halfway point (used to measure comebacks).
  if (halvesOfRound(state).includes(Math.floor(C.rounds / 2) + 1)) state.midLast = lastPlaceId(state);
  const info = roundInfo(state);
  state.phase = 'chronicle';
  addLog(state, { type: 'round', text: `${info.label} (${info.months}): ${info.headline}`, factIds: info.factIds });
  const cards = [];
  for (const h of halvesOfRound(state)) {
    historicalArrivals(state, h);
    cards.push(...DATA.chronicle.filter((c) => c.round === h));
  }
  state.currentChronicle = cards.map((c) => c.id);
  for (const card of cards) applyCard(state, card);
  return state;
}

function eventPhase(state) {
  state.phase = 'event';
  const perRound = difficultyOf(state).eventsPerRound;
  for (let i = 0; i < perRound; i++) {
    if (!state.deck.length) state.deck = shuffle(state, DATA.deck.map((d) => d.id));
    const id = state.deck.shift();
    state.currentEvent = id;
    applyCard(state, DATA.deck.find((d) => d.id === id));
  }
  return state;
}

function actionPhase(state) {
  state.phase = 'actions';
  state.turn = 0;
  beginTurn(state);
  return state;
}

function beginTurn(state) {
  const p = currentPlayer(state);
  p.ap = actionPointsFor(state, p);
  p.charityThisTurn = 0;
  addLog(state, { type: 'turn', player: p.id, text: `${p.name}'s turn (${p.ap} action points${state.guildFavor === p.id ? ', including Guild’s Favor' : ''}).` });
}

// Answer the first pending decision (offer, protect, wage law).
export function decide(state, choice) {
  const p = currentPlayer(state);
  if (!p) return { ok: false, reason: 'It is not a player’s turn.' };
  return resolveDecision(state, p, choice);
}

export function endTurn(state) {
  const p = currentPlayer(state);
  if (!p) return { ok: false, reason: 'It is not a player’s turn.' };
  if (p.pending.length) return { ok: false, reason: 'First answer the card waiting for you.' };
  p.ap = 0;
  state.turn++;
  if (state.turn < state.order.length) {
    beginTurn(state);
    return { ok: true, next: 'turn' };
  }
  plaguePhase(state);
  return { ok: true, next: 'plague' };
}

// Mortality and ageing happen once per half-year: twice per round in Quick Play.
// Turn order never changes.
function plaguePhase(state) {
  state.phase = 'plague';
  for (const h of halvesOfRound(state)) {
    const label = DATA.timeline.rounds[h - 1].label;
    addLog(state, { type: 'plague', half: h, text: `Plague phase (${label}): family members in Stricken cities roll for survival.` });
    mortalityPhase(state);
    advanceCities(state);
  }
}

function endGame(state) {
  state.phase = 'ended';
  state.finalScores = rankPlayers(state);
  state.winner = state.finalScores.filter((r) => r.place === 1).map((r) => r.id);
  const names = state.winner.map((id) => state.players[id].name).join(' and ');
  addLog(state, { type: 'end', text: `The year 1353 ends. ${names} ${state.winner.length > 1 ? 'share' : 'wins'} the game.`, factIds: DATA.timeline.epilogue.factIds });
  return state;
}
