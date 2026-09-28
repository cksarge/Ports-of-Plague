// Chronicle and Event card effects, and the player decisions they create.
import { DATA, CITIES } from '../data.js';
import { C, addLog, clampReputation, familyAt, familyTotal, untilRound } from './state.js';
import { lastPlaceId } from './scoring.js';
import { roll, pick } from './rng.js';
import { applyGain, fortuneById } from './fortune.js';

export const EFFECT_TYPES = [
  'none', 'noNewPostsNearPlague', 'persecution', 'wageLaw', 'offer', 'reputationIfOffer',
  'charityBonus', 'newFamily', 'marketBonus', 'lastPlaceBonus', 'roundModifier', 'costModifier',
  'florinsPerPost', 'loseIfRich', 'freeAction', 'contagionModifier', 'reputationByFlight',
  'postBonus', 'multi', 'cityProfitModifier', 'onePlayer',
];

export const ENGLISH_CITIES = ['london', 'melcombe'];

export function cardById(id) {
  return DATA.chronicle.find((c) => c.id === id) ?? DATA.deck.find((c) => c.id === id) ?? fortuneById(id);
}

// Applies a card. Global effects change this round's modifiers; choices
// become pending decisions each player answers at the start of their turn.
export function applyCard(state, card) {
  const entry = addLog(state, { type: 'card', card: card.id, deck: card.round ? 'chronicle' : 'event', text: card.text, factIds: card.factIds });
  applyEffect(state, card, card.effect);
  return entry;
}

function applyEffect(state, card, e) {
  const fx = state.effects;
  switch (e.type) {
    case 'none':
      break;
    case 'multi':
      for (const sub of e.effects) applyEffect(state, card, sub);
      break;
    case 'noNewPostsNearPlague':
      fx.noNewPostsNearPlague = true;
      break;
    case 'roundModifier':
      fx.profit[e.routeType ?? 'all'] += e.profit;
      break;
    case 'contagionModifier':
      fx.contagion[e.routeType ?? 'all'] += e.delta;
      break;
    case 'costModifier':
      fx.costs[e.cost] = (fx.costs[e.cost] ?? 0) + e.delta;
      break;
    case 'charityBonus':
      fx.charityBonus += e.delta;
      break;
    case 'marketBonus':
      fx.marketBonus += e.delta;
      break;
    case 'onePlayer': {
      const p = pick(state, state.players);
      applyGain(p, e.effect);
      const parts = [];
      if (e.effect.florins) parts.push(`${e.effect.florins > 0 ? 'gains' : 'loses'} ${Math.abs(e.effect.florins)}ƒ`);
      if (e.effect.reputation) parts.push(`${e.effect.reputation > 0 ? 'gains' : 'loses'} ${Math.abs(e.effect.reputation)} reputation`);
      addLog(state, { type: 'effect', player: p.id, text: `The lot falls on ${p.name}, who ${parts.join(' and ')}.` });
      break;
    }
    case 'cityProfitModifier':
      fx.cityProfit.push({ cities: e.cities, onlyStricken: !!e.onlyStricken, profit: e.profit });
      break;
    case 'freeAction':
      for (const p of state.players) p.free[e.action] = true;
      break;
    case 'lastPlaceBonus': {
      const p = state.players[lastPlaceId(state)];
      p.florins += e.florins;
      addLog(state, { type: 'effect', player: p.id, text: `${p.name}, in last place, gains ${e.florins}ƒ.` });
      break;
    }
    case 'florinsPerPost':
      for (const p of state.players) {
        const n = p.posts.filter((c) => state.cities[c].state === e.state).length;
        if (n) {
          p.florins = Math.max(0, p.florins + n * e.florins);
          addLog(state, { type: 'effect', player: p.id, text: `${p.name} ${e.florins < 0 ? 'loses' : 'gains'} ${Math.abs(n * e.florins)}ƒ.` });
        }
      }
      break;
    case 'loseIfRich':
      for (const p of state.players) {
        if (p.florins >= e.threshold) {
          p.florins -= e.florins;
          addLog(state, { type: 'effect', player: p.id, text: `${p.name} pays ${e.florins}ƒ to creditors.` });
        }
      }
      break;
    case 'postBonus':
      for (const p of state.players) {
        if (!p.posts.some((c) => e.cities.includes(c))) continue;
        if (e.florins) p.florins = Math.max(0, p.florins + e.florins);
        if (e.reputation) { p.reputation += e.reputation; clampReputation(p); }
        const parts = [];
        if (e.florins) parts.push(`${e.florins > 0 ? '+' : ''}${e.florins}ƒ`);
        if (e.reputation) parts.push(`${e.reputation > 0 ? '+' : ''}${e.reputation} reputation`);
        addLog(state, { type: 'effect', player: p.id, text: `${p.name}: ${parts.join(', ')}.` });
      }
      break;
    case 'reputationByFlight':
      for (const p of state.players) {
        const fled = familyAt(p, 'estate') > 0;
        p.reputation += fled ? e.fled : e.stayed;
        clampReputation(p);
        addLog(state, { type: 'effect', player: p.id, text: `${p.name} ${fled ? `loses ${-e.fled}` : `gains ${e.stayed}`} reputation.` });
      }
      break;
    case 'reputationIfOffer':
      for (const p of state.players) {
        if (p.offers[e.offer]) {
          p.reputation += e.reputation;
          clampReputation(p);
          addLog(state, { type: 'effect', player: p.id, text: `${p.name} loses ${-e.reputation} reputation.` });
        }
      }
      break;
    case 'newFamily':
      for (const p of state.players) {
        if (p.lostFamily >= e.minLost && familyTotal(p) < C.start.family) {
          p.family[p.home] = (p.family[p.home] ?? 0) + e.gain;
          addLog(state, { type: 'effect', player: p.id, text: `${p.name} welcomes a new family member in ${CITIES[p.home].name}.` });
        }
      }
      break;
    case 'offer':
      for (const p of state.players) {
        p.pending.push({ kind: 'offer', card: card.id, offer: e.id, label: e.label, decline: e.decline, cost: e.cost ?? {}, gain: e.gain ?? {}, reveal: e.reveal ?? null });
      }
      break;
    case 'persecution':
      state.cities[e.city].unrest = C.penalties.unrestRounds;
      state.persecution = { city: e.city, round: state.round, protectors: [] };
      for (const p of state.players) {
        p.pending.push({ kind: 'protect', card: card.id, city: e.city });
      }
      break;
    case 'wageLaw':
      for (const p of state.players) {
        if (p.posts.some((c) => e.cities.includes(c))) {
          p.pending.push({ kind: 'wageLaw', card: card.id, cities: e.cities });
        }
      }
      break;
    default:
      throw new Error(`Unknown card effect ${e.type}`);
  }
}

// Checks whether a player can accept a pending decision.
export function canAccept(state, p, d) {
  if (d.kind === 'offer' && (d.cost.florins ?? 0) > p.florins) return `You need ${d.cost.florins}ƒ to accept.`;
  if (d.kind === 'protect') {
    if (p.florins < C.costs.protectCommunity) return `Protecting the community costs ${C.costs.protectCommunity}ƒ.`;
    if (p.ap < 1) return 'Protecting the community takes 1 action point.';
  }
  if (d.kind === 'deal') {
    const from = state.players[d.from];
    if (p.deal) return `You already have a partnership with ${state.players[p.deal.partner].name}.`;
    if (from.deal) return `${from.name} has found another partner in the meantime.`;
  }
  return null;
}

// Resolves one pending decision. choice: true/false for offers, protect and deals,
// 'obey' or 'pay' for wage laws.
export function resolveDecision(state, p, choice) {
  const d = p.pending[0];
  if (!d) return { ok: false, reason: 'There is no decision waiting.' };
  if (d.kind === 'wageLaw') {
    if (choice !== 'obey' && choice !== 'pay') return { ok: false, reason: 'Choose to obey the law or pay market wages.' };
  } else if (choice === true) {
    const why = canAccept(state, p, d);
    if (why) return { ok: false, reason: why };
  }
  p.pending.shift();
  let text = '';
  let result = {};
  if (d.kind === 'offer') {
    if (choice) {
      p.florins -= d.cost.florins ?? 0;
      p.florins += d.gain.florins ?? 0;
      p.reputation += d.gain.reputation ?? 0;
      clampReputation(p);
      p.offers[d.offer] = true;
      text = `${p.name}: ${d.label}.`;
      if (d.reveal) text += ' ' + d.reveal;
    } else {
      text = `${p.name}: ${d.decline}.`;
      const pen = d.declinePenalty;
      if (pen?.reputation) { p.reputation -= pen.reputation; clampReputation(p); text += ` −${pen.reputation} reputation.`; }
      if (pen?.florins) { p.florins = Math.max(0, p.florins - pen.florins); text += ` −${pen.florins}ƒ.`; }
      if (pen?.blockHome && !p.shipped.includes(p.home)) { p.shipped.push(p.home); text += ` Your post in ${CITIES[p.home].name} cannot ship this round.`; }
    }
  } else if (d.kind === 'protect') {
    const city = CITIES[d.city].name;
    if (choice) {
      p.florins -= C.costs.protectCommunity;
      p.ap -= 1;
      p.reputation += C.gains.protectReputation;
      clampReputation(p);
      p.stats.protected++;
      state.persecution?.protectors.push(p.id);
      text = `${p.name} spends money and influence to shelter and defend the Jewish community of ${city}. In real history, those who tried to protect the community were overruled.`;
    } else {
      text = `${p.name} does not intervene in ${city}.`;
    }
  } else if (d.kind === 'deal') {
    const from = state.players[d.from];
    if (choice) {
      const until = untilRound(state, C.limits.dealRounds);
      p.deal = { partner: from.id, until };
      from.deal = { partner: p.id, until };
      p.stats.deals++;
      from.stats.deals++;
      text = `${p.name} and ${from.name} become partners until the end of next round. When either ships to a city where the other has a post, both earn ${C.gains.dealBonus}ƒ more.`;
    } else {
      text = `${p.name} declines ${from.name}'s partnership.`;
    }
  } else if (d.kind === 'wageLaw') {
    if (choice === 'obey') {
      p.reputation += C.wageLaw.obeyReputation;
      clampReputation(p);
      p.englishBlocked = true;
      text = `${p.name} obeys the wage law. Workers refuse the old wages, so the house's English posts cannot ship this round.`;
    } else {
      const die = roll(state, 6);
      const fined = die <= C.wageLaw.fineMaxRoll;
      if (fined) p.florins = Math.max(0, p.florins - C.wageLaw.fine);
      result = { die, fined };
      text = `${p.name} pays market wages. Inspection die: ${die}. ${fined ? `Fined ${C.wageLaw.fine}ƒ.` : 'No fine.'}`;
    }
  }
  const card = cardById(d.card);
  const factIds = d.kind === 'deal' ? ['TR-04'] : card?.factIds ?? [];
  const entry = addLog(state, { type: 'decision', player: p.id, kind: d.kind, choice, text, factIds, ...result });
  return { ok: true, entry, decision: d };
}
