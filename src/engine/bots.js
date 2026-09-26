// Computer strategies used by the balance simulator (tools/simulate.js).
// They only use information a human player can see on screen: city states,
// "threatened" warnings, scores and the cards in play. They never peek at
// future historical arrival dates.
import { C, ESTATE, currentPlayer, familyAt, familyLocations, familyTotal, isStricken, isThreatened, isAftermath, cost, routesFrom } from './state.js';
import { shipQuote, legalShipments, legalPosts, performAction, checkAction, charityCost } from './actions.js';
import { decide, endTurn, actionPointsFor } from './turn.js';
import { scorePlayer } from './scoring.js';
import { canAccept } from './events.js';
import { nextRandom, pick } from './rng.js';

export const STRATEGIES = ['greedy', 'cautious', 'charitable', 'balanced', 'random'];

function expectedShip(state, p, s) {
  const q = shipQuote(state, p, s.route, s.from);
  const mean = q.fixed + (C.shipping.profitDie + 1) / 2;
  const pInf = q.contagionRisk / 6;
  const repCost = pInf * C.penalties.infectedCargoReputation;
  return { value: mean * (1 - pInf * 0.5), repCost, q };
}

function bestShipment(state, p, { avoidRisk = false } = {}) {
  let best = null;
  for (const s of legalShipments(state, p)) {
    const e = expectedShip(state, p, s);
    const score = e.value - (avoidRisk ? e.repCost * 4 : e.repCost);
    if (!best || score > best.score) best = { action: s, score };
  }
  return best;
}

function dangerAt(state, loc) {
  if (loc === ESTATE) return 0;
  if (isStricken(state, loc)) return state.cities[loc].severity;
  if (isThreatened(state, loc)) return 0.7;
  return 0;
}

function decideAll(state, p, strategy) {
  while (p.pending.length) {
    const d = p.pending[0];
    let choice;
    if (d.kind === 'wageLaw') {
      choice = strategy === 'charitable' || (strategy === 'balanced' && scoreParts(p).lowest === 'reputation') ? 'obey' : 'pay';
      if (strategy === 'random') choice = nextRandom(state) < 0.5 ? 'obey' : 'pay';
    } else if (d.kind === 'protect') {
      const want = { greedy: false, cautious: false, charitable: true, balanced: scoreParts(p).lowest === 'reputation' || p.florins > 15, random: nextRandom(state) < 0.5 }[strategy];
      choice = want && !canAccept(state, p, d);
    } else {
      const isTrap = !!d.reveal; // a careful player knows medieval "cures" did nothing
      const rep = d.gain.reputation ?? 0;
      const price = d.cost.florins ?? 0;
      let want;
      if (strategy === 'random') want = nextRandom(state) < 0.5;
      else if (isTrap) want = false;
      else if (strategy === 'greedy') want = false;
      else if (strategy === 'charitable') want = rep > 0;
      else if (strategy === 'balanced') want = rep > 0 && (scoreParts(p).lowest === 'reputation' || price <= 2) && p.florins > price + 4;
      else want = rep >= 2 && p.florins > price + 6;
      // Informed players remember that the Pope banned the flagellants.
      if (d.offer === 'flagellantAlms' && strategy !== 'random' && strategy !== 'charitable') want = false;
      choice = want && !canAccept(state, p, d);
    }
    const r = decide(state, choice);
    if (!r.ok) decide(state, d.kind === 'wageLaw' ? 'pay' : false);
  }
}

function scoreParts(p) {
  const s = scorePlayer(p);
  const cats = [['wealth', s.wealth], ['family', s.family], ['reputation', s.reputation]];
  cats.sort((a, b) => a[1] - b[1]);
  return { ...s, lowest: cats[0][0] };
}

function try_(state, action) {
  if (!action) return false;
  if (checkAction(state, action)) return false;
  return performAction(state, action).ok;
}

// Protect family: move people out of danger or prepare them.
function protectFamily(state, p, { willFlee = true, threshold = 1.5 }) {
  let worst = null;
  for (const loc of familyLocations(p)) {
    const d = dangerAt(state, loc);
    if (d >= threshold && (!worst || d > worst.d)) worst = { loc, d };
  }
  if (!worst) return false;
  const n = Math.min(C.limits.moveFamilyMax, familyAt(p, worst.loc));
  if (willFlee) {
    // Prefer a safe post (no reputation loss if the city is only threatened), else the estate.
    const safePost = p.posts.find((c) => c !== worst.loc && dangerAt(state, c) === 0);
    const dest = safePost ?? ESTATE;
    if (try_(state, { type: 'move', from: worst.loc, to: dest, count: n })) return true;
  }
  if (isStricken(state, worst.loc) && try_(state, { type: 'prepare', city: worst.loc })) return true;
  return false;
}

function returnFamily(state, p) {
  if (familyAt(p, ESTATE) === 0) return false;
  const safe = p.posts.find((c) => dangerAt(state, c) === 0);
  if (!safe) return false;
  return try_(state, { type: 'move', from: ESTATE, to: safe, count: Math.min(C.limits.moveFamilyMax, familyAt(p, ESTATE)) });
}

function expand(state, p, reserve) {
  if (p.florins < cost(state, 'openPost') + reserve) return false;
  const options = legalPosts(state, p);
  if (!options.length) return false;
  // Prefer cities with valuable routes and no plague nearby.
  options.sort((a, b) => valueOf(state, b.city) - valueOf(state, a.city));
  return try_(state, options[0]);
}

// How attractive a city is for a new post: good routes, no plague nearby.
function valueOf(state, city) {
  return routesValue(city) - dangerAt(state, city) * 2 + (isAftermath(state, city) ? 1 : 0);
}

function routesValue(city) {
  return routesFrom(city).reduce((a, r) => a + r.value, 0) / Math.max(1, routesFrom(city).length) + routesFrom(city).length * 0.3;
}

function giveCharity(state, p) {
  return try_(state, { type: 'charity', kind: pick(state, ['hospital', 'confraternity', 'church']) });
}

function randomTurn(state, p) {
  let guard = 0;
  while (p.ap > 0 && guard++ < 20) {
    decideAll(state, p, 'random');
    const options = [
      ...legalShipments(state, p),
      ...legalPosts(state, p),
      { type: 'charity', kind: 'church' },
      ...familyLocations(p).map((c) => ({ type: 'prepare', city: c })),
      ...familyLocations(p).map((c) => ({ type: 'physician', city: c })),
      ...familyLocations(p).flatMap((from) => [ESTATE, ...p.posts].filter((to) => to !== from).map((to) => ({ type: 'move', from, to, count: 1 }))),
    ].filter((a) => !checkAction(state, a));
    if (!options.length) break;
    performAction(state, pick(state, options));
  }
  decideAll(state, p, 'random');
}

// ---------- Balanced: pick the action that most improves the Legacy score ----------
function legacyOf(p, change) {
  const q = {
    florins: Math.max(0, p.florins + (change.florins ?? 0)),
    reputation: Math.max(0, Math.min(C.limits.maxReputation, p.reputation + (change.reputation ?? 0))),
    posts: change.posts ?? p.posts,
    family: { total: familyTotal(p) + (change.family ?? 0) },
  };
  return scorePlayer(q).total;
}

function expectedDeaths(state, p, loc, { prepared = false } = {}) {
  if (loc === ESTATE) return 0;
  const n = familyAt(p, loc);
  const c = state.cities[loc];
  let sev = 0;
  let rounds = 0;
  if (c.state === 'stricken') { sev = c.severity; rounds = C.plague.strickenRounds - c.strickenFor; }
  else if (isThreatened(state, loc)) { sev = 2; rounds = 0.4; }
  const perRoll = Math.max(0, sev - (prepared ? C.plague.prepareBonus : 0)) / 6;
  return n * (1 - Math.pow(1 - perRoll, rounds));
}

function candidateActions(state, p) {
  const out = [...legalShipments(state, p), ...legalPosts(state, p)];
  out.push({ type: 'charity', kind: 'hospital' });
  for (const loc of familyLocations(p)) {
    out.push({ type: 'prepare', city: loc }, { type: 'physician', city: loc });
    for (const to of [ESTATE, ...p.posts]) if (to !== loc) out.push({ type: 'move', from: loc, to, count: Math.min(C.limits.moveFamilyMax, familyAt(p, loc)) });
  }
  return out.filter((a) => !checkAction(state, a));
}

function bestByLegacy(state, p) {
  const base = legacyOf(p, {});
  const roundsLeft = C.rounds - state.round;
  let best = null;
  for (const a of candidateActions(state, p)) {
    let change = {};
    if (a.type === 'ship') {
      const e = expectedShip(state, p, a);
      change = { florins: e.value, reputation: -e.repCost };
    } else if (a.type === 'post') {
      const useful = p.posts.length < actionPointsFor(state, p) ? 7 : 1.5;
      change = { florins: -cost(state, 'openPost') + useful * Math.max(0, roundsLeft - 1), posts: [...p.posts, a.city] };
    } else if (a.type === 'charity') {
      change = { florins: -charityCost(state, p), reputation: Math.max(1, C.gains.charityReputation + state.effects.charityBonus) };
    } else if (a.type === 'prepare') {
      const saved = expectedDeaths(state, p, a.city) - expectedDeaths(state, p, a.city, { prepared: true });
      change = { florins: -cost(state, 'prepareHousehold'), family: saved / Math.max(1, C.plague.strickenRounds) };
    } else if (a.type === 'physician') {
      const risk = expectedDeaths(state, p, a.city);
      change = { florins: -cost(state, 'physician'), family: Math.min(1, risk) * (1 / 6) * 0.5 };
    } else if (a.type === 'move') {
      const before = expectedDeaths(state, p, a.from);
      const share = a.count / familyAt(p, a.from);
      const destRisk = a.to === ESTATE ? 0 : expectedDeaths(state, { ...p, family: { [a.to]: a.count } }, a.to);
      const saved = before * share - destRisk;
      const fled = isStricken(state, a.from);
      const bonusLoss = a.to === ESTATE && familyAt(p, a.from) === a.count ? C.gains.familyAtPostBonus * 2 : 0;
      const bonusGain = a.from === ESTATE ? C.gains.familyAtPostBonus * 2 : 0;
      change = { family: saved, reputation: fled ? -C.penalties.fleeReputation : 0, florins: bonusGain - bonusLoss };
    }
    const value = legacyOf(p, change) - base;
    if (!best || value > best.value) best = { action: a, value };
  }
  return best && best.value > 0.05 ? best.action : null;
}

export function playTurn(state) {
  const p = currentPlayer(state);
  const strategy = p.strategy ?? 'balanced';
  decideAll(state, p, strategy);
  if (strategy === 'random') {
    randomTurn(state, p);
    return endTurn(state);
  }
  let guard = 0;
  while (p.ap > 0 && guard++ < 12) {
    decideAll(state, p, strategy);
    const parts = scoreParts(p);
    let acted = false;
    switch (strategy) {
      case 'greedy':
        acted = try_(state, bestShipment(state, p)?.action) || expand(state, p, 0);
        break;
      case 'cautious':
        acted = protectFamily(state, p, { willFlee: true, threshold: 0.7 }) ||
          try_(state, bestShipment(state, p, { avoidRisk: true })?.action) ||
          expand(state, p, 4) || returnFamily(state, p);
        break;
      case 'charitable':
        acted = (p.charityThisTurn === 0 && p.reputation < C.limits.maxReputation && p.florins >= charityCost(state, p) && giveCharity(state, p)) ||
          protectFamily(state, p, { willFlee: false, threshold: 1 }) ||
          try_(state, bestShipment(state, p)?.action) || expand(state, p, 6);
        break;
      case 'balanced':
      default:
        acted = try_(state, bestByLegacy(state, p));
        break;
    }
    if (!acted) break;
  }
  decideAll(state, p, strategy);
  return endTurn(state);
}
