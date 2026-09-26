// Fortune cards: a personal deck. A house draws one when it rolls a 6 on the
// profit die or opens a new trading post, so every player's game differs.
import { DATA, CITIES } from '../data.js';
import { C, addLog, clampReputation, familyAt, familyLocations, familyTotal, isStricken } from './state.js';
import { roll, shuffle } from './rng.js';

export const FORTUNE_EFFECTS = ['gain', 'nextShip', 'extraAP', 'freeAction', 'newFamily', 'omen', 'treaty', 'offer', 'losePercent', 'illness', 'personalCost'];

export function fortuneById(id) {
  return DATA.fortune.find((f) => f.id === id);
}

// Applies a signed gain of florins / reputation to one house.
export function applyGain(p, e) {
  if (e.florins) p.florins = Math.max(0, p.florins + e.florins);
  if (e.reputation) { p.reputation += e.reputation; clampReputation(p); }
}

export function drawFortune(state, p, reason) {
  if (!state.fortuneDeck.length) state.fortuneDeck = shuffle(state, DATA.fortune.map((f) => f.id));
  const card = fortuneById(state.fortuneDeck.shift());
  const e = card.effect;
  let result = '';
  let extra = {};
  switch (e.type) {
    case 'gain':
      applyGain(p, e);
      break;
    case 'nextShip':
      p.nextShip = { profit: (p.nextShip?.profit ?? 0) + (e.profit ?? 0), safe: !!(e.safe || p.nextShip?.safe) };
      break;
    case 'extraAP':
      if (e.ap < 0 && p.ap < 1) result = 'You had no action points left to lose.';
      p.ap = Math.max(0, p.ap + e.ap);
      break;
    case 'freeAction':
      p.free[e.action] = true;
      break;
    case 'newFamily':
      if (familyTotal(p) < C.start.family) p.family[p.home] = (p.family[p.home] ?? 0) + e.gain;
      else result = 'Your house is already at full strength, so the couple settles elsewhere.';
      break;
    case 'omen': {
      const next = state.roundEnd + 1;
      const upto = Math.min(C.rounds, state.roundEnd + (state.span ?? 1));
      const cities = DATA.cities.filter((c) => c.arrival.round >= next && c.arrival.round <= upto && state.cities[c.id].state === 'safe');
      extra.cities = cities.map((c) => c.id);
      result = cities.length
        ? `Next round the plague will reach: ${cities.map((c) => `${c.name} (${c.arrival.dateText})`).join('; ')}.`
        : 'No new cities are struck next round.';
      break;
    }
    case 'treaty': {
      const others = state.players.filter((o) => o.id !== p.id);
      const poorest = others.reduce((a, b) => (b.florins < a.florins ? b : a));
      p.florins += e.florins;
      poorest.florins += e.florins;
      extra.partner = poorest.id;
      result = `${p.name} and ${poorest.name} each gain ${e.florins}ƒ.`;
      break;
    }
    case 'offer':
      p.pending.unshift({ kind: 'offer', card: card.id, offer: e.id, label: e.label, decline: e.decline, cost: e.cost ?? {}, gain: e.gain ?? {}, reveal: null, declinePenalty: e.declinePenalty ?? null, fortune: true });
      break;
    case 'losePercent': {
      const loss = Math.floor((p.florins * e.percent) / 100);
      p.florins -= loss;
      result = `You pay back ${loss}ƒ.`;
      break;
    }
    case 'illness': {
      const locs = familyLocations(p).filter((l) => isStricken(state, l));
      if (!locs.length) { result = 'Your family is not in a Stricken city. The fever passes.'; break; }
      const loc = locs.reduce((a, b) => (state.cities[b].severity > state.cities[a].severity ? b : a));
      const sev = state.cities[loc].severity;
      const die = roll(state, 6);
      let dies = die <= sev;
      if (dies && familyTotal(p) <= 1) { dies = false; extra.lastHeir = true; }
      if (dies) { p.family[loc]--; p.lostFamily++; p.florins += C.gains.inheritance; }
      extra = { ...extra, city: loc, die, severity: sev, dies };
      result = `A family member in ${CITIES[loc].name} rolls ${die} (dies on ${sev} or less): ${dies ? `they die. The house inherits ${C.gains.inheritance}ƒ.` : extra.lastHeir ? 'the last heir survives.' : 'they recover.'}`;
      break;
    }
    case 'personalCost':
      p.personalCosts[e.cost] = (p.personalCosts[e.cost] ?? 0) + e.delta;
      break;
    default:
      throw new Error(`Unknown fortune effect ${e.type}`);
  }
  p.stats.fortune++;
  return addLog(state, { type: 'fortune', player: p.id, card: card.id, reason, result, ...extra, text: `${p.name} draws a Fortune card: ${card.title}. ${result}`.trim(), factIds: card.factIds });
}
