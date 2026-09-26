// Game state creation and shared helpers. The whole game is one plain
// JSON object, which makes save/restore and testing simple.
import { DATA, CITIES, HOME_CITIES } from '../data.js';
import { seedFrom, shuffle, roll } from './rng.js';

export const C = DATA.config;
export const ESTATE = 'estate';
export const SAVE_VERSION = 1;

export const PLAYER_STYLES = [
  { color: '#0072B2', colorName: 'Lapis blue', crest: 'circle' },
  { color: '#D55E00', colorName: 'Vermilion', crest: 'square' },
  { color: '#009E73', colorName: 'Verdigris green', crest: 'triangle' },
  { color: '#CC79A7', colorName: 'Rose madder', crest: 'diamond' },
  { color: '#56B4E9', colorName: 'Sky blue', crest: 'hexagon' },
  { color: '#E69F00', colorName: 'Saffron', crest: 'star' },
];

const ROUTES_BY_CITY = {};
for (const r of DATA.routes) {
  (ROUTES_BY_CITY[r.a] ||= []).push(r);
  (ROUTES_BY_CITY[r.b] ||= []).push(r);
}
export const ROUTES = Object.fromEntries(DATA.routes.map((r) => [r.id, r]));

export function routesFrom(cityId) {
  return ROUTES_BY_CITY[cityId] ?? [];
}
export function otherEnd(route, cityId) {
  return route.a === cityId ? route.b : route.a;
}
export function neighbors(cityId) {
  return routesFrom(cityId).map((r) => otherEnd(r, cityId));
}

export function validateSetup({ players }) {
  if (!Array.isArray(players) || players.length < C.players.min || players.length > C.players.max) {
    return `Choose between ${C.players.min} and ${C.players.max} players.`;
  }
  const homes = new Set();
  for (const p of players) {
    if (!p.name?.trim()) return 'Every house needs a name.';
    if (!HOME_CITIES.includes(p.home)) return `${p.home} is not one of the home cities.`;
    if (homes.has(p.home)) return `Two houses cannot share ${CITIES[p.home].name} as a home city.`;
    homes.add(p.home);
  }
  return null;
}

export function createGame({ players, difficulty = 'chronicler', mode = 'standard', seed = Date.now() }) {
  const problem = validateSetup({ players });
  if (problem) throw new Error(problem);
  const state = {
    version: SAVE_VERSION,
    title: C.title,
    seed: String(seed),
    rng: seedFrom(seed),
    difficulty,
    mode,
    span: (C.modes[mode] ?? C.modes.standard).span,
    round: 0,
    roundEnd: 0,
    phase: 'roundStart',
    players: [],
    order: [],
    turn: 0,
    cities: {},
    deck: [],
    fortuneDeck: [],
    currentEvent: null,
    currentChronicle: [],
    effects: emptyEffects(),
    persecution: null,
    log: [],
    logSeq: 0,
    journal: [],
    winner: null,
    finalScores: null,
  };
  players.forEach((p, i) => {
    const home = CITIES[p.home].home;
    const style = PLAYER_STYLES[i];
    state.players.push({
      id: i,
      name: p.name.trim(),
      color: p.color ?? style.color,
      colorName: p.colorName ?? style.colorName,
      crest: p.crest ?? style.crest,
      home: p.home,
      strategy: p.strategy ?? null,
      florins: C.start.florins + (mode === 'quick' ? home.quickStartFlorins ?? home.startFlorins ?? 0 : home.startFlorins ?? 0),
      reputation: C.start.reputation + (home.startReputation ?? 0),
      family: { [p.home]: C.start.family },
      posts: [p.home],
      lostFamily: 0,
      offers: {},
      pending: [],
      ap: 0,
      shipped: [],
      prepared: [],
      physician: [],
      charityThisTurn: 0,
      free: {},
      nextShip: null,
      personalCosts: {},
      englishBlocked: false,
      stats: { shipments: 0, infected: 0, earned: 0, fled: 0, protected: 0, charity: 0, spread: 0, fortune: 0 },
    });
  });
  for (const c of DATA.cities) {
    state.cities[c.id] = { state: 'safe', severity: 0, strickenFor: 0, early: false, unrest: 0 };
  }
  state.deck = shuffle(state, DATA.deck.map((d) => d.id));
  state.fortuneDeck = shuffle(state, DATA.fortune.map((d) => d.id));
  // Caffa is already Stricken when the game begins (the siege of 1346).
  for (const c of DATA.cities.filter((c) => c.arrival.round === 0)) {
    Object.assign(state.cities[c.id], { state: 'stricken', severity: 3, strickenFor: 0 });
  }
  addLog(state, { type: 'prologue', text: DATA.timeline.prologue.text, factIds: DATA.timeline.prologue.factIds });
  rollTurnOrder(state);
  return state;
}

// Before the game each house rolls a die: highest goes first; tied houses
// roll again. The order then stays the same for the whole game.
export function rollTurnOrder(state) {
  const rounds = [];
  const place = (ids) => {
    if (ids.length === 1) return ids;
    const rolls = ids.map((id) => ({ player: id, die: roll(state, C.turnOrderDie) }));
    rounds.push(rolls);
    const values = [...new Set(rolls.map((r) => r.die))].sort((a, b) => b - a);
    return values.flatMap((v) => place(rolls.filter((r) => r.die === v).map((r) => r.player)));
  };
  state.order = place(state.players.map((p) => p.id));
  const names = state.order.map((id) => state.players[id].name).join(', ');
  addLog(state, { type: 'orderRoll', rolls: rounds, order: [...state.order], text: `Turn order (fixed for the whole game): ${names}.` });
}

export function emptyEffects() {
  return {
    profit: { all: 0, sea: 0, land: 0 },
    contagion: { all: 0, sea: 0, land: 0 },
    costs: {},
    charityBonus: 0,
    marketBonus: 0,
    noNewPostsNearPlague: false,
    cityProfit: [],
  };
}

export function addLog(state, entry) {
  const e = { seq: ++state.logSeq, round: state.round, ...entry };
  state.log.push(e);
  for (const id of entry.factIds ?? []) if (!state.journal.includes(id)) state.journal.push(id);
  return e;
}

export function currentPlayer(state) {
  if (state.phase !== 'actions') return null;
  return state.players[state.order[state.turn]];
}

export function familyTotal(p) {
  return Object.values(p.family).reduce((a, b) => a + b, 0);
}
export function familyAt(p, loc) {
  return p.family[loc] ?? 0;
}
export function familyLocations(p) {
  return Object.keys(p.family).filter((k) => p.family[k] > 0);
}

export function isStricken(state, cityId) {
  return state.cities[cityId]?.state === 'stricken';
}
export function isAftermath(state, cityId) {
  return state.cities[cityId]?.state === 'aftermath';
}
// A Safe city next to a Stricken one: shown on the map as a warning.
export function isThreatened(state, cityId) {
  return state.cities[cityId].state === 'safe' && neighbors(cityId).some((n) => isStricken(state, n));
}

export function clampReputation(p) {
  p.reputation = Math.max(C.limits.minReputation, Math.min(C.limits.maxReputation, p.reputation));
}

export function cost(state, key, p = null) {
  return Math.max(0, C.costs[key] + (state.effects.costs[key] ?? 0) + (p?.personalCosts?.[key] ?? 0));
}

export function difficultyOf(state) {
  return C.difficulty[state.difficulty] ?? C.difficulty.chronicler;
}
export function modeOf(state) {
  return C.modes[state.mode] ?? C.modes.standard;
}
export function totalRounds(state) {
  return Math.ceil(C.rounds / (state.span ?? 1));
}
export function roundNumber(state) {
  return Math.ceil(state.round / (state.span ?? 1));
}

// Label for the current round. In Quick Play a round covers two half-years.
export function roundInfo(state) {
  const first = DATA.timeline.rounds[state.round - 1];
  if (!first) return null;
  const last = DATA.timeline.rounds[(state.roundEnd || state.round) - 1] ?? first;
  if (last === first) return first;
  const year = (l) => l.label.split(' ')[1];
  return {
    round: first.round,
    label: year(first) === year(last) ? year(first) : `${first.label} – ${last.label}`,
    months: `${first.months.split('–')[0]} ${first.months.split(' ').at(-1)} – ${last.months.split('–')[1]}`,
    headline: `${first.headline} ${last.headline}`,
    factIds: [...first.factIds, ...last.factIds],
  };
}
