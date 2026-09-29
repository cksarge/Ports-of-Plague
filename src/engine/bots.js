// Computer players: the bot houses in a game (see config.json "bots") and
// the strategies used by the balance simulator (tools/simulate.js).
// They only use information a human player can see on screen: city states,
// "threatened" warnings, scores and the cards in play. They never peek at
// future historical arrival dates.
//
// botMove() chooses ONE move at a time (answer a card, take an action, or
// end the turn), so the game screen can show each move like a human's.
// Skill levels: an easier bot sometimes makes a "mistake" (a random legal
// move) and plays with a simpler personality; a Hard bot plays the
// strongest strategy and never slips.
import { C, ESTATE, currentPlayer, familyAt, familyLocations, familyTotal, isStricken, isThreatened, isAftermath, cost, routesFrom, neighbors, apCost } from './state.js';
import { shipQuote, legalShipments, legalPosts, performAction, checkAction, charityCost } from './actions.js';
import { decide, endTurn, actionPointsFor } from './turn.js';
import { scorePlayer } from './scoring.js';
import { canAccept } from './events.js';
import { nextRandom, pick } from './rng.js';

export const STRATEGIES = ['greedy', 'cautious', 'charitable', 'balanced', 'random'];

function expectedShip(state, p, s) {
  const q = shipQuote(state, p, s.route, s.from, { offshore: !!s.offshore });
  const mean = q.fixed + (C.shipping.profitDie + 1) / 2;
  const pInf = q.contagionRisk / 6;
  const repCost = s.offshore ? 0 : pInf * C.penalties.infectedCargoReputation;
  return { value: mean * (1 - pInf * 0.5) - q.fee, repCost, q };
}

// Legal shipments, plus the "hold offshore" version of each one from a Stricken city.
function shipOptions(state, p) {
  const out = [];
  for (const s of legalShipments(state, p)) {
    out.push(s);
    const held = { ...s, offshore: true };
    if (!checkAction(state, held)) out.push(held);
  }
  return out;
}

function bestShipment(state, p, { avoidRisk = false } = {}) {
  let best = null;
  for (const s of shipOptions(state, p)) {
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

// The answer a bot gives to the first card waiting for it.
function chooseDecision(state, p, strategy) {
  const d = p.pending[0];
  if (d.kind === 'wageLaw') {
    if (strategy === 'random') return nextRandom(state) < 0.5 ? 'obey' : 'pay';
    return strategy === 'charitable' || (strategy === 'balanced' && scoreParts(p).lowest === 'reputation') ? 'obey' : 'pay';
  }
  if (d.kind === 'deal') return (strategy === 'random' ? nextRandom(state) < 0.5 : true) && !canAccept(state, p, d);
  if (d.kind === 'protect') {
    const want = { greedy: false, cautious: false, charitable: true, balanced: scoreParts(p).lowest === 'reputation' || p.florins > 15, random: nextRandom(state) < 0.5 }[strategy];
    return want && !canAccept(state, p, d);
  }
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
  return want && !canAccept(state, p, d);
}

function scoreParts(p) {
  const s = scorePlayer(p);
  const cats = [['wealth', s.wealth], ['family', s.family], ['reputation', s.reputation]];
  cats.sort((a, b) => a[1] - b[1]);
  return { ...s, lowest: cats[0][0] };
}

// The action itself if it is allowed right now, otherwise null.
function legal(state, action) {
  return action && !checkAction(state, action) ? action : null;
}

// Protect family: move people out of danger or prepare them.
function protectFamily(state, p, { willFlee = true, threshold = 1.5 }) {
  let worst = null;
  for (const loc of familyLocations(p)) {
    const d = dangerAt(state, loc);
    if (d >= threshold && (!worst || d > worst.d)) worst = { loc, d };
  }
  if (!worst) return null;
  const n = Math.min(C.limits.moveFamilyMax, familyAt(p, worst.loc));
  // Prefer a safe post (no reputation loss if the city is only threatened), else the estate.
  const safePost = p.posts.find((c) => c !== worst.loc && dangerAt(state, c) === 0);
  const flee = willFlee ? legal(state, { type: 'move', from: worst.loc, to: safePost ?? ESTATE, count: n }) : null;
  return flee ?? (isStricken(state, worst.loc) ? legal(state, { type: 'prepare', city: worst.loc }) : null);
}

function returnFamily(state, p) {
  if (familyAt(p, ESTATE) === 0) return null;
  const safe = p.posts.find((c) => dangerAt(state, c) === 0);
  if (!safe) return null;
  return legal(state, { type: 'move', from: ESTATE, to: safe, count: Math.min(C.limits.moveFamilyMax, familyAt(p, ESTATE)) });
}

function expand(state, p, reserve) {
  if (p.florins < cost(state, 'openPost') + reserve) return null;
  const options = legalPosts(state, p);
  if (!options.length) return null;
  // Prefer cities with valuable routes and no plague nearby.
  options.sort((a, b) => valueOf(state, b.city) - valueOf(state, a.city));
  return legal(state, options[0]);
}

// How attractive a city is for a new post: good routes, no plague nearby.
function valueOf(state, city) {
  return routesValue(city) - dangerAt(state, city) * 2 + (isAftermath(state, city) ? 1 : 0);
}

function routesValue(city) {
  return routesFrom(city).reduce((a, r) => a + r.value, 0) / Math.max(1, routesFrom(city).length) + routesFrom(city).length * 0.3;
}

function giveCharity(state) {
  return legal(state, { type: 'charity', kind: pick(state, ['hospital', 'confraternity', 'church']) });
}

// Any legal action, picked at random (the 'random' strategy, and a bot's "mistakes").
function randomAction(state, p) {
  const options = [
    ...legalShipments(state, p),
    ...legalPosts(state, p),
    { type: 'charity', kind: 'church' },
    ...shipOptions(state, p).filter((a) => a.offshore),
    ...p.posts.flatMap((c) => [{ type: 'marry', city: c }, { type: 'land', city: c }, { type: 'gates', city: c }]),
    { type: 'loan' },
    ...state.players.filter((o) => o !== p).map((o) => ({ type: 'deal', partner: o.id })),
    ...familyLocations(p).map((c) => ({ type: 'prepare', city: c })),
    ...familyLocations(p).map((c) => ({ type: 'physician', city: c })),
    ...familyLocations(p).flatMap((from) => [ESTATE, ...p.posts].filter((to) => to !== from).map((to) => ({ type: 'move', from, to, count: 1 }))),
  ].filter((a) => !checkAction(state, a));
  return options.length ? pick(state, options) : null;
}

// ---------- Balanced: pick the action that most improves the Legacy score ----------
function legacyOf(p, change) {
  const q = {
    florins: Math.max(0, p.florins + (change.florins ?? 0)),
    reputation: Math.max(0, Math.min(C.limits.maxReputation, p.reputation + (change.reputation ?? 0))),
    posts: change.posts ?? p.posts,
    land: change.land ?? p.land,
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
  const out = [...shipOptions(state, p), ...legalPosts(state, p)];
  out.push({ type: 'charity', kind: 'hospital' });
  for (const c of p.posts) out.push({ type: 'marry', city: c }, { type: 'land', city: c });
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
    } else if (a.type === 'marry') {
      change = { florins: -cost(state, 'marriage'), family: C.gains.marriageFamily };
    } else if (a.type === 'land') {
      const halvesLeft = C.rounds - state.roundEnd + 1;
      change = { florins: -cost(state, 'buyLand') - halvesLeft * C.costs.landWage, land: [...p.land, a.city] };
    }
    // Compare value per action point, so a 2-AP action must earn twice as much.
    const value = (legacyOf(p, change) - base) / apCost(a.type);
    if (!best || value > best.value) best = { action: a, value };
  }
  return best && best.value > 0.05 ? best.action : null;
}

// Land is worth buying only if its points beat the price plus the wages still to pay.
function landPaysOff(state) {
  const halvesLeft = C.rounds - state.roundEnd + 1;
  return C.costs.buyLand + halvesLeft * C.costs.landWage < C.scoring.pointsPerLand * C.scoring.florinsPerPoint;
}

// Borrow when a wedding or land purchase is blocked only by a lack of florins.
function borrowFor(state, p) {
  if (checkAction(state, { type: 'loan' })) return null;
  p.florins += C.gains.loan;
  const helps = p.posts.some((c) => !checkAction(state, { type: 'marry', city: c }) || !checkAction(state, { type: 'land', city: c }));
  p.florins -= C.gains.loan;
  return helps ? { type: 'loan' } : null;
}

// Offer a partnership to the house whose posts sit at the ends of our routes.
function proposeDeal(state, p) {
  const reach = new Set(p.posts.flatMap((c) => neighbors(c)));
  let best = null;
  for (const o of state.players) {
    const overlap = o.posts.filter((c) => reach.has(c)).length + p.posts.filter((c) => o.posts.some((x) => neighbors(x).includes(c))).length;
    if (overlap && !checkAction(state, { type: 'deal', partner: o.id }) && (!best || overlap > best.overlap)) best = { o, overlap };
  }
  return best ? { type: 'deal', partner: best.o.id } : null;
}

// The action a bot's strategy wants next, or null when it is done.
function chooseAction(state, p, strategy) {
  if (strategy === 'random') return randomAction(state, p);
  // Partnerships are offered once, at the start of the turn.
  if (p.ap === actionPointsFor(state, p)) {
    const deal = proposeDeal(state, p);
    if (deal) return deal;
  }
  switch (strategy) {
    case 'greedy':
      // Reputation above the soft cap is cheap to spend on shutting rivals out.
      if (!p.gates && p.reputation > C.scoring.reputationSoftCap + 1 && familyAt(p, p.home)) {
        const gates = legal(state, { type: 'gates', city: p.home });
        if (gates) return gates;
      }
      return legal(state, bestShipment(state, p)?.action) ||
        (landPaysOff(state) ? p.posts.map((c) => legal(state, { type: 'land', city: c })).find(Boolean) : null) ||
        expand(state, p, 0);
    case 'cautious':
      return protectFamily(state, p, { willFlee: true, threshold: 0.7 }) ||
        legal(state, bestShipment(state, p, { avoidRisk: true })?.action) ||
        expand(state, p, 4) || returnFamily(state, p);
    case 'charitable':
      return (p.charityThisTurn === 0 && p.reputation < C.limits.maxReputation && p.florins >= charityCost(state, p) ? giveCharity(state) : null) ||
        protectFamily(state, p, { willFlee: false, threshold: 1 }) ||
        legal(state, bestShipment(state, p)?.action) || expand(state, p, 6);
    case 'balanced':
    default:
      return bestByLegacy(state, p) || borrowFor(state, p);
  }
}

// How often a bot of this skill makes a "mistake" (0 = never).
export function mistakeRate(p) {
  return C.bots.skills[p.skill]?.mistakes ?? 0;
}

// The current player's next move:
//   { type: 'decide', choice }  answer the first card waiting for it
//   { type: 'act', action }     take an action
//   { type: 'end' }             end the turn
export function botMove(state) {
  const p = currentPlayer(state);
  const strategy = p.strategy ?? 'balanced';
  const slip = () => nextRandom(state) < mistakeRate(p);
  if (p.pending.length) return { type: 'decide', choice: chooseDecision(state, p, slip() ? 'random' : strategy) };
  if (p.ap <= 0 && !Object.values(p.free).some(Boolean)) return { type: 'end' };
  const action = (slip() ? randomAction(state, p) : null) ?? chooseAction(state, p, strategy);
  return action ? { type: 'act', action } : { type: 'end' };
}

// Answers the first waiting card with the bot's choice; if the engine
// refuses it (it cannot pay, say), declines instead.
export function botDecide(state, choice) {
  const d = currentPlayer(state).pending[0];
  const r = decide(state, choice);
  return r.ok ? r : decide(state, d.kind === 'wageLaw' ? 'pay' : false);
}

// Plays the current player's whole turn at once (simulator and tests).
export function playTurn(state) {
  for (let guard = 0; guard < 40; guard++) {
    const move = botMove(state);
    if (move.type === 'end') break;
    if (move.type === 'decide') botDecide(state, move.choice);
    else if (!performAction(state, move.action).ok) break;
  }
  const p = currentPlayer(state);
  while (p.pending.length) botDecide(state, chooseDecision(state, p, p.strategy ?? 'balanced'));
  return endTurn(state);
}
