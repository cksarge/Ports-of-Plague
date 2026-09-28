// The actions. Every action is checked by `check*` functions that
// return a plain-language reason when a move is illegal; `perform` only
// runs after a successful check.
import { DATA, CITIES } from '../data.js';
import {
  C, ESTATE, ROUTES, addLog, clampReputation, cost, currentPlayer, familyAt, familyTotal, isAftermath,
  isStricken, neighbors, otherEnd, routesFrom, difficultyOf, gatesClosedBy, untilRound,
} from './state.js';
import { drawFortune } from './fortune.js';
import { ENGLISH_CITIES } from './events.js';
import { lastPlaceId } from './scoring.js';
import { roll, pick } from './rng.js';
import { strikeCity, severityName } from './plague.js';

const cityName = (id) => (id === ESTATE ? 'your Country Estate' : CITIES[id].name);

function baseChecks(state, p, apNeeded = 1) {
  if (state.phase !== 'actions') return 'It is not the action phase.';
  if (!p) return 'No player is taking a turn.';
  if (p.pending.length) return 'First answer the card waiting for you.';
  if (p.ap < apNeeded) return 'You have no action points left. End your turn.';
  return null;
}

// ---------- Ship Goods ----------
export function shipQuote(state, p, routeId, from, { offshore = false } = {}) {
  const r = ROUTES[routeId];
  const to = otherEnd(r, from);
  const fx = state.effects;
  let bonus = fx.profit.all + fx.profit[r.type];
  const parts = [{ label: `${r.type === 'sea' ? 'Sea' : 'Land'} route value`, value: r.value }];
  if (familyAt(p, from) > 0) parts.push({ label: 'Family runs the post', value: C.gains.familyAtPostBonus });
  if (isAftermath(state, to)) parts.push({ label: 'High prices at destination (Aftermath)', value: C.gains.aftermathPriceBonus + fx.marketBonus });
  if (isAftermath(state, from)) parts.push({ label: 'Wages at origin (Aftermath)', value: -cost(state, 'wageAftermath') });
  if (state.cities[from].unrest > 0 || state.cities[to].unrest > 0) parts.push({ label: 'Unrest', value: -C.penalties.unrestProfit });
  const partner = dealPartner(state, p);
  if (partner?.posts.includes(to) && C.gains.dealShipperBonus) parts.push({ label: `Partner's agent (${partner.name})`, value: C.gains.dealShipperBonus });
  const gates = gatesClosedBy(state, to, p);
  if (gates) parts.push({ label: `Gates closed by ${gates.name}`, value: -C.penalties.gatesProfit });
  for (const m of fx.cityProfit) {
    for (const c of [from, to]) {
      if (m.cities.includes(c) && (!m.onlyStricken || isStricken(state, c))) {
        parts.push({ label: `Event: ${CITIES[c].name}`, value: m.profit });
      }
    }
  }
  if (bonus) parts.push({ label: 'This round’s event', value: bonus });
  const fixed = parts.reduce((a, b) => a + b.value, 0);
  const safe = !!p.nextShip?.safe;
  const contagionRisk = isStricken(state, from) && !safe
    ? Math.max(0, Math.min(6, state.cities[from].severity + fx.contagion.all + fx.contagion[r.type] + (difficultyOf(state).contagionMod ?? 0)))
    : 0;
  const fee = offshore ? cost(state, 'holdOffshore') : 0;
  return { route: r, from, to, parts, fixed, min: Math.max(0, fixed + 1), max: Math.max(0, fixed + C.shipping.profitDie), contagionRisk, safe: safe && isStricken(state, from), offshore, fee, partner: partner?.posts.includes(to) ? partner : null };
}

// The partner house of a live partnership, if any.
export function dealPartner(state, p) {
  return p.deal ? state.players[p.deal.partner] : null;
}

export function checkShip(state, p, { from, route, offshore = false }) {
  const why = baseChecks(state, p);
  if (why) return why;
  const r = ROUTES[route];
  if (!r) return 'Choose a route.';
  if (!p.posts.includes(from)) return `You have no trading post in ${cityName(from)}.`;
  if (r.a !== from && r.b !== from) return `That route does not leave ${cityName(from)}.`;
  if (p.shipped.includes(from)) return `Your post in ${cityName(from)} has already shipped this round. Each post ships once per round.`;
  if (p.englishBlocked && ENGLISH_CITIES.includes(from)) return `You obeyed the wage law: workers in ${cityName(from)} refuse to work for the old wages this round.`;
  if (offshore) {
    if (!isStricken(state, from)) return `Holding a ship offshore only matters when it sails from a Stricken city.`;
    if (p.florins < cost(state, 'holdOffshore')) return `Holding the ship offshore costs ${cost(state, 'holdOffshore')}ƒ; you have ${p.florins}ƒ.`;
  }
  return null;
}

function doShip(state, p, { from, route, offshore = false }) {
  const q = shipQuote(state, p, route, from, { offshore });
  p.florins -= q.fee;
  if (offshore) p.stats.offshore++;
  const profitDie = roll(state, C.shipping.profitDie);
  let contagionDie = null;
  let infected = false;
  p.nextShip = null; // a Fortune bonus applies to one shipment only
  if (isStricken(state, from) && !q.safe) {
    contagionDie = roll(state, 6);
    infected = contagionDie <= q.contagionRisk;
  }
  let profit = Math.max(0, q.fixed + profitDie);
  let spread = null;
  if (infected && offshore) {
    // The ship waits at anchor: the sickness shows before anyone lands.
    profit = Math.floor(profit * C.shipping.infectedProfitFactor);
    p.stats.infected++;
    spread = { type: 'held' };
  } else if (infected) {
    profit = Math.floor(profit * C.shipping.infectedProfitFactor);
    p.reputation -= C.penalties.infectedCargoReputation;
    clampReputation(p);
    p.stats.infected++;
    const dest = state.cities[q.to];
    const arrivalRound = CITIES[q.to].arrival.round;
    const end = state.roundEnd || state.round;
    if (dest.state === 'safe' && arrivalRound > end && arrivalRound - end <= C.plague.earlyArrivalWindow * (state.span ?? 1)) {
      spread = { type: 'early', entry: strikeCity(state, q.to, { early: true, by: p.id }) };
      p.stats.spread++;
    } else if (dest.state === 'stricken' && dest.severity < C.plague.severityMax) {
      dest.severity++;
      spread = { type: 'worse', severity: dest.severity };
      p.stats.spread++;
    } else {
      spread = { type: 'none' };
    }
  }
  p.florins += profit;
  p.shipped.push(from);
  p.stats.shipments++;
  p.stats.earned += profit;
  if (q.partner) q.partner.florins += C.gains.dealBonus;
  let text = `${p.name} ships from ${cityName(from)} to ${cityName(q.to)}: profit die ${profitDie}, earning ${profit}ƒ.`;
  if (offshore) text += ` The ship waited offshore (${q.fee}ƒ).`;
  if (contagionDie !== null) text += ` Contagion die ${contagionDie} (infected on ${q.contagionRisk} or less): ${infected ? 'INFECTED cargo!' : 'clean cargo.'}`;
  if (spread?.type === 'worse') text += ` The plague in ${cityName(q.to)} grows worse (${severityName(spread.severity)}).`;
  if (spread?.type === 'none') text += ' The infection dies out.';
  if (spread?.type === 'held') text += ' The sickness shows while the ship waits at anchor: no one lands, no reputation is lost and the plague does not spread.';
  if (q.partner) text += ` Partner ${q.partner.name} earns ${C.gains.dealBonus}ƒ.`;
  const factIds = [...(infected && !offshore ? ['TR-05', 'CI-11'] : []), ...(offshore ? ['ME-12', 'ME-14'] : [])];
  const entry = addLog(state, { type: 'ship', player: p.id, from, to: q.to, route, profitDie, contagionDie, contagionRisk: q.contagionRisk, infected, profit, spread: spread?.type ?? null, parts: q.parts, safe: q.safe, offshore, fee: q.fee, partner: q.partner?.id ?? null, text, factIds });
  if (profitDie === C.fortune.drawOnProfitDie) drawFortune(state, p, `rolled a ${profitDie} on the profit die`);
  return entry;
}

// ---------- Open Trading Post ----------
export function checkPost(state, p, { city }) {
  const free = !!p.free.post;
  const why = baseChecks(state, p, free ? 0 : 1);
  if (why) return why;
  if (!CITIES[city]) return 'Choose a city.';
  if (p.posts.includes(city)) return `You already have a trading post in ${cityName(city)}.`;
  if (p.posts.length >= C.limits.maxPosts) return `You already have the maximum of ${C.limits.maxPosts} trading posts.`;
  if (!p.posts.some((own) => neighbors(own).includes(city))) return `${cityName(city)} is not connected by a route to any of your posts.`;
  if (isStricken(state, city)) return `${cityName(city)} is Stricken: its gates are closed to new trading posts.`;
  const gates = gatesClosedBy(state, city, p);
  if (gates) return `${gates.name} has closed the gates of ${cityName(city)} to rival merchants.`;
  if (state.effects.noNewPostsNearPlague && neighbors(city).some((n) => isStricken(state, n))) {
    return `Guards at the gates: ${cityName(city)} is next to a Stricken city and turns strangers away this round.`;
  }
  if (!free && p.florins < cost(state, 'openPost', p)) return `A trading post costs ${cost(state, 'openPost', p)}ƒ; you have ${p.florins}ƒ.`;
  return null;
}

function doPost(state, p, { city }) {
  const free = !!p.free.post;
  const price = free ? 0 : cost(state, 'openPost', p);
  if (free) delete p.free.post;
  p.florins -= price;
  p.posts.push(city);
  const entry = addLog(state, { type: 'post', player: p.id, city, text: `${p.name} opens a trading post in ${cityName(city)}${free ? ' for free (Fortune card)' : ` for ${price}ƒ`}.`, factIds: [] });
  if (C.fortune.drawOnNewPost) drawFortune(state, p, 'opened a new trading post');
  return { entry, free };
}

// ---------- Move Family ----------
export function checkMove(state, p, { from, to, count }) {
  const free = !!(p.free.move || p.free.moveNoPenalty);
  const why = baseChecks(state, p, free ? 0 : 1);
  if (why) return why;
  if (from === to) return 'Choose two different places.';
  const validPlace = (loc) => loc === ESTATE || p.posts.includes(loc);
  if (!validPlace(from) || !validPlace(to)) return 'Family can only live in cities where you have a trading post, or at your Country Estate.';
  if (!Number.isInteger(count) || count < 1) return 'Choose how many family members to move.';
  if (count > C.limits.moveFamilyMax) return `You can move at most ${C.limits.moveFamilyMax} family members per action.`;
  if (familyAt(p, from) < count) return `You have only ${familyAt(p, from)} family member${familyAt(p, from) === 1 ? '' : 's'} in ${cityName(from)}.`;
  return null;
}

function doMove(state, p, { from, to, count }) {
  const noPenalty = !!p.free.moveNoPenalty;
  const usedFree = !!(p.free.move || noPenalty);
  if (noPenalty) delete p.free.moveNoPenalty;
  else if (usedFree) delete p.free.move;
  p.family[from] -= count;
  p.family[to] = (p.family[to] ?? 0) + count;
  if (p.family[from] === 0 && from !== p.home) delete p.family[from];
  const fled = from !== ESTATE && isStricken(state, from);
  if (fled && !noPenalty) {
    p.reputation -= C.penalties.fleeReputation;
    clampReputation(p);
    p.stats.fled++;
  }
  const text = `${p.name} moves ${count} family member${count === 1 ? '' : 's'} from ${cityName(from)} to ${cityName(to)}.` +
    (fled && !noPenalty ? ` Fleeing a Stricken city costs ${C.penalties.fleeReputation} reputation.` : fled ? ' Friends in the countryside take them in: no reputation lost.' : '') +
    (usedFree ? ' (Free action from the event card.)' : '');
  return { entry: addLog(state, { type: 'move', player: p.id, from, to, count, fled, text, factIds: fled ? ['SO-04'] : [] }), free: usedFree };
}

// ---------- Prepare Household ----------
export function checkPrepare(state, p, { city }) {
  const free = !!p.free.prepare;
  const why = baseChecks(state, p, free ? 0 : 1);
  if (why) return why;
  if (!CITIES[city] || familyAt(p, city) < 1) return 'Choose a city where your family lives.';
  if (p.prepared.includes(city)) return `Your household in ${cityName(city)} is already prepared this round.`;
  if (!free && p.florins < cost(state, 'prepareHousehold')) return `Preparing costs ${cost(state, 'prepareHousehold')}ƒ; you have ${p.florins}ƒ.`;
  return null;
}

function doPrepare(state, p, { city }) {
  const usedFree = !!p.free.prepare;
  if (usedFree) delete p.free.prepare;
  else p.florins -= cost(state, 'prepareHousehold');
  p.prepared.push(city);
  return { entry: addLog(state, { type: 'prepare', player: p.id, city, text: `${p.name}'s household in ${cityName(city)} shuts its doors and stockpiles food (+${C.plague.prepareBonus} to survival rolls this round).${usedFree ? ' (Free from the event card.)' : ''}`, factIds: ['SO-05', 'ME-12'] }), free: usedFree };
}

// ---------- Consult Physician ----------
export function checkPhysician(state, p, { city }) {
  const free = !!p.free.physician;
  const why = baseChecks(state, p, free ? 0 : 1);
  if (why) return why;
  if (!CITIES[city] || familyAt(p, city) < 1) return 'Choose a city where your family lives.';
  if (p.physician.includes(city)) return `A physician is already caring for your family in ${cityName(city)} this round.`;
  if (!free && p.florins < cost(state, 'physician')) return `A physician costs ${cost(state, 'physician')}ƒ; you have ${p.florins}ƒ.`;
  return null;
}

function doPhysician(state, p, { city }) {
  const free = !!p.free.physician;
  if (free) delete p.free.physician;
  else p.florins -= cost(state, 'physician');
  p.physician.push(city);
  const remedy = pick(state, DATA.remedies);
  const text = `${p.name} consults a physician in ${cityName(city)}. Remedy: ${remedy.name}. ${remedy.text} It cannot cure the plague, but nursing care gives one family member a slim chance (a ${C.plague.physicianSaveOn}) if they fall ill this round.`;
  return { entry: addLog(state, { type: 'physician', player: p.id, city, remedy: remedy.id, text, factIds: [...remedy.factIds, 'ME-08'] }), free };
}

// ---------- Charity & Piety ----------
export const CHARITY_KINDS = {
  hospital: { label: 'Fund a hospital', factIds: ['CI-05', 'CH-03'] },
  confraternity: { label: 'Endow a confraternity', factIds: ['CH-07'] },
  church: { label: 'Give to your parish church', factIds: ['CH-03', 'CH-06'] },
};

export function charityCost(state, p) {
  const discount = lastPlaceId(state) === p.id ? C.costs.charityDiscountLastPlace : 0;
  return Math.max(0, cost(state, 'charity') - discount);
}

export function checkCharity(state, p, { kind }) {
  const why = baseChecks(state, p);
  if (why) return why;
  if (!CHARITY_KINDS[kind]) return 'Choose where to give.';
  if (p.charityThisTurn >= C.limits.charityPerTurn * (state.span ?? 1)) return state.span > 1 ? 'You have already given charity twice this turn (once per half-year).' : 'You have already given charity this turn.';
  const price = charityCost(state, p);
  if (p.florins < price) return `Charity costs ${price}ƒ; you have ${p.florins}ƒ.`;
  if (p.reputation >= C.limits.maxReputation) return `Your reputation is already at the maximum (${C.limits.maxReputation}).`;
  return null;
}

function doCharity(state, p, { kind }) {
  const price = charityCost(state, p);
  const gain = Math.max(1, C.gains.charityReputation + state.effects.charityBonus);
  p.florins -= price;
  p.reputation += gain;
  clampReputation(p);
  p.charityThisTurn++;
  p.stats.charity++;
  const k = CHARITY_KINDS[kind];
  return addLog(state, { type: 'charity', player: p.id, kind, text: `${p.name}: ${k.label} (${price}ƒ). +${gain} reputation.`, factIds: k.factIds });
}

// ---------- Arrange a Marriage ----------
export function checkMarry(state, p, { city }) {
  const why = baseChecks(state, p);
  if (why) return why;
  if (!CITIES[city] || !p.posts.includes(city)) return 'Choose a city where you have a trading post.';
  if (!isAftermath(state, city)) return `${cityName(city)} is not in Aftermath yet. Weddings wait until the plague has passed.`;
  if (familyAt(p, city) < 1) return `Your family must live in ${cityName(city)} to arrange a marriage there.`;
  if (familyTotal(p) >= C.start.family) return `Your house already has ${C.start.family} family members.`;
  if (p.marriedThisTurn >= C.limits.marriagePerTurn) return 'You have already arranged a marriage this turn.';
  if (p.florins < cost(state, 'marriage')) return `A wedding costs ${cost(state, 'marriage')}ƒ; you have ${p.florins}ƒ.`;
  return null;
}

function doMarry(state, p, { city }) {
  const price = cost(state, 'marriage');
  p.florins -= price;
  p.family[city] += C.gains.marriageFamily;
  p.marriedThisTurn++;
  p.stats.married++;
  return addLog(state, { type: 'marry', player: p.id, city, text: `${p.name} celebrates a wedding in ${cityName(city)} (${price}ƒ). +${C.gains.marriageFamily} family member.`, factIds: ['SO-12'] });
}

// ---------- Buy Abandoned Land ----------
export function checkLand(state, p, { city }) {
  const why = baseChecks(state, p);
  if (why) return why;
  if (!CITIES[city] || !p.posts.includes(city)) return 'Choose a city where you have a trading post.';
  if (!isAftermath(state, city)) return `${cityName(city)} is not in Aftermath yet. Its fields are still being worked.`;
  if (p.land.includes(city)) return `You already own land near ${cityName(city)}.`;
  if (p.florins < cost(state, 'buyLand')) return `The land costs ${cost(state, 'buyLand')}ƒ; you have ${p.florins}ƒ.`;
  return null;
}

function doLand(state, p, { city }) {
  const price = cost(state, 'buyLand');
  p.florins -= price;
  p.land.push(city);
  p.stats.land++;
  return addLog(state, { type: 'land', player: p.id, city, text: `${p.name} buys abandoned fields near ${cityName(city)} for ${price}ƒ. They are worth ${C.scoring.pointsPerLand} Wealth points at the end, but workers must be paid ${cost(state, 'landWage')}ƒ every half-year.`, factIds: ['EC-02', 'EC-10'] });
}

// ---------- Take a Loan (no action point) ----------
export function checkLoan(state, p) {
  const why = baseChecks(state, p, 0);
  if (why) return why;
  if (p.loan) return `You already owe ${p.loan.owed}ƒ. It must be repaid before you borrow again.`;
  if (untilRound(state, 2) > C.rounds) return 'No banker will lend in the final round.';
  return null;
}

function doLoan(state, p) {
  p.florins += C.gains.loan;
  p.loan = { owed: C.costs.loanRepay, due: untilRound(state, 2) };
  p.stats.loans++;
  return { entry: addLog(state, { type: 'loan', player: p.id, text: `${p.name} borrows ${C.gains.loan}ƒ. ${C.costs.loanRepay}ƒ is due in the plague phase of the next round.`, factIds: ['EC-01', 'EC-11'] }), free: true };
}

// ---------- Propose a Partnership (no action point) ----------
export function checkDeal(state, p, { partner }) {
  const why = baseChecks(state, p, 0);
  if (why) return why;
  const other = state.players[partner];
  if (!other || other === p) return 'Choose another house.';
  if (p.proposedThisTurn) return 'You have already proposed a partnership this turn.';
  if (p.deal) return `You already have a partnership with ${state.players[p.deal.partner].name}.`;
  if (other.deal) return `${other.name} already has a partner.`;
  if (other.pending.some((d) => d.kind === 'deal')) return `${other.name} is already considering an offer.`;
  return null;
}

function doDeal(state, p, { partner }) {
  const other = state.players[partner];
  p.proposedThisTurn = true;
  other.pending.push({ kind: 'deal', from: p.id });
  return { entry: addLog(state, { type: 'deal', player: p.id, partner, text: `${p.name} proposes a partnership to ${other.name}, who will answer at the start of their next turn.`, factIds: ['TR-04'] }), free: true };
}

// ---------- Close Your Gates ----------
export function checkGates(state, p, { city }) {
  const why = baseChecks(state, p);
  if (why) return why;
  if (!CITIES[city] || !p.posts.includes(city) || familyAt(p, city) < 1) return 'Choose a city where you have a trading post and family.';
  if (isStricken(state, city)) return `${cityName(city)} is Stricken: it is too late to close the gates.`;
  if (p.gates) return `Your gates in ${cityName(p.gates.city)} are already closed.`;
  const other = gatesClosedBy(state, city, p);
  if (other) return `${other.name} has already closed the gates of ${cityName(city)}.`;
  return null;
}

function doGates(state, p, { city }) {
  p.reputation -= C.penalties.gatesReputation;
  clampReputation(p);
  p.gates = { city, until: untilRound(state, C.limits.gatesRounds) };
  p.stats.gates++;
  return addLog(state, { type: 'gates', player: p.id, city, text: `${p.name} has guards posted at the gates of ${cityName(city)} (−${C.penalties.gatesReputation} reputation). Until the end of next round, rival houses cannot open a post there and earn ${C.penalties.gatesProfit}ƒ less shipping to it.`, factIds: ['SO-11'] });
}

// ---------- Dispatcher ----------
const TABLE = {
  ship: [checkShip, doShip],
  post: [checkPost, doPost],
  move: [checkMove, doMove],
  prepare: [checkPrepare, doPrepare],
  physician: [checkPhysician, doPhysician],
  charity: [checkCharity, doCharity],
  marry: [checkMarry, doMarry],
  land: [checkLand, doLand],
  loan: [checkLoan, doLoan],
  deal: [checkDeal, doDeal],
  gates: [checkGates, doGates],
};

export const ACTION_TYPES = Object.keys(TABLE);

export function checkAction(state, action) {
  const p = currentPlayer(state);
  const row = TABLE[action.type];
  if (!row) return 'Unknown action.';
  return row[0](state, p, action);
}

export function performAction(state, action) {
  const p = currentPlayer(state);
  const reason = checkAction(state, action);
  if (reason) return { ok: false, reason };
  const out = TABLE[action.type][1](state, p, action);
  const entry = out.entry ?? out;
  if (!out.free) p.ap -= 1;
  return { ok: true, entry };
}

// All legal ship moves for the current player (used by the interface and bots).
export function legalShipments(state, p) {
  const out = [];
  for (const from of p.posts) {
    for (const r of routesFrom(from)) {
      if (!checkShip(state, p, { from, route: r.id })) out.push({ type: 'ship', from, route: r.id });
    }
  }
  return out;
}

export function legalPosts(state, p) {
  const seen = new Set();
  const out = [];
  for (const own of p.posts) for (const n of neighbors(own)) {
    if (seen.has(n)) continue;
    seen.add(n);
    if (!checkPost(state, p, { city: n })) out.push({ type: 'post', city: n });
  }
  return out;
}
