// The choices a player makes on their turn: action pickers, decision cards,
// the house panel and the action buttons. Shared by the big screen (one-device
// play) and the players' own devices (multi-device play). Each prompt is
// { html, opts, parse(value) } for openDialog; parse turns the clicked value
// into an engine action or choice (or null for Cancel).
import { DATA, CITIES } from '../data.js';
import {
  C, ESTATE, checkAction, shipQuote, scorePlayer, familyAt, familyTotal, familyLocations, isStricken, isThreatened,
  routesFrom, neighbors, cost, charityCost, CHARITY_KINDS, cardById, canAccept, severityName, actionPointsFor,
  lastPlaceId, legalPosts, isAftermath, untilRound, dealPartner, apCost, halfInfo, roundNumber,
} from '../engine/index.js';
import { esc, crestSvg } from './dom.js';
import { noteHtml } from './notes.js';
import { THEME_COLORS, themeIllustration, coinIcon, laurelIcon, familyIcon, candleIcon } from './art.js';

export const ACTION_ICONS = { ship: '⚓', post: '🏛', move: '🐎', prepare: '🚪', physician: '⚕', charity: '✝', marry: '💍', land: '🌾', loan: '📜', deal: '🤝', gates: '⛨' };
const NO_AP_ACTIONS = ['loan', 'deal'];

export const cityName = (id) => (id === ESTATE ? 'Country Estate' : CITIES[id].name);

// A card with an illustrated, colour-coded top band.
export function cardHtml({ theme, kind, title, body, extraClass = '' }) {
  const t = THEME_COLORS[theme] ?? THEME_COLORS.timeline;
  return `<div class="card ${extraClass}" style="--card:${t.main};--card-light:${t.light}">
    <div class="card-band"><div class="illus">${themeIllustration(theme, 52)}</div>
      <div><div class="card-kind">${kind}</div><h2>${esc(title)}</h2></div></div>
    <div class="card-body">${body}</div></div>`;
}

export function choiceBtn(value, main, sub, why, attrs = '') {
  return `<button class="choice" data-value="${esc(value)}" ${why ? 'disabled' : ''} ${attrs}><span>${main}${sub ? `<span class="sub">${sub}</span>` : ''}${why ? `<span class="why">${esc(why)}</span>` : ''}</span><span aria-hidden="true">${why ? '✕' : '→'}</span></button>`;
}

// ---------- House panel and action buttons ----------
export function housePanelHtml(state, p, { label = 'Current house' } = {}) {
  const sc = scorePlayer(p);
  const apMax = Math.max(p.ap, actionPointsFor(state, p));
  const estate = familyAt(p, ESTATE);
  const total = Math.max(1, sc.total);
  return `<section class="panel house-panel" style="--house:${p.color}" aria-label="${esc(label)}">
        <h2>${crestSvg(p, 22)} ${esc(p.name)}</h2>
        <div style="font-size:0.9rem;color:var(--ink-soft)">Home: ${esc(CITIES[p.home].name)} · Posts: ${p.posts.map((c) => esc(CITIES[c].name)).join(', ')}</div>
        <div class="stats">
          <div class="stat"><b>${coinIcon(20)} ${p.florins}</b><span>Florins</span></div>
          <div class="stat"><b>${laurelIcon(20)} ${p.reputation}</b><span>Reputation</span></div>
          <div class="stat"><b>${familyIcon(20)} ${familyTotal(p)}</b><span>Family${estate ? ` (${estate} at estate)` : ''}</span></div>
        </div>
        <div class="ap" aria-label="${p.ap} action points left">Action points: ${Array.from({ length: apMax }, (_, i) => candleIcon(i < p.ap, 22)).join('')} <span>${p.ap} left${state.guildFavor === p.id ? ' · Guild’s Favor' : ''}</span></div>
        <div class="legacy-bar" aria-hidden="true"><i style="width:${(100 * sc.wealth) / total}%;background:#d9a82b"></i><i style="width:${(100 * sc.family) / total}%;background:#8a3b2a"></i><i style="width:${(100 * sc.reputation) / total}%;background:#3f6b2a"></i><i style="width:${(100 * sc.balance) / total}%;background:#1d4a86"></i></div>
        <div style="font-size:0.9rem">Legacy: Wealth ${sc.wealth} + Family ${sc.family} + Reputation ${sc.reputation} + Balance ${sc.balance} = <strong>${sc.total}</strong></div>
        ${freeNotes(p)}
        ${ledgerNotes(state, p)}
      </section>`;
}

function freeNotes(p) {
  const notes = [];
  if (p.free.post) notes.push('Next trading post is free');
  if (p.free.physician) notes.push('Next physician is free');
  if (p.free.move) notes.push('Next family move is free');
  if (p.free.moveNoPenalty) notes.push('Next family move is free, with no reputation loss');
  if (p.free.prepare) notes.push('Next Prepare Household is free');
  if (p.nextShip?.profit) notes.push(`Next shipment ${p.nextShip.profit > 0 ? '+' : ''}${p.nextShip.profit}ƒ`);
  if (p.nextShip?.safe) notes.push('Next shipment cannot be infected');
  if (p.personalCosts.openPost) notes.push(`Trading posts cost +${p.personalCosts.openPost}ƒ this round`);
  return notes.length ? `<div style="margin-top:0.35rem;font-size:0.88rem">🎡 <strong>Fortune:</strong> ${notes.map(esc).join(' · ')}</div>` : '';
}

// A half-year by name. Something agreed in the final round lasts "until the
// end of next round", which is past the last half-year: the end of the game.
const untilLabel = (h) => halfInfo(h)?.label ?? 'the end of the game';

// Land, debt, partnership and closed gates: the Merchant's Ledger at a glance.
function ledgerNotes(state, p) {
  const notes = [];
  if (p.land.length) notes.push(`🌾 Land: ${p.land.map((c) => esc(CITIES[c].name)).join(', ')} (+${p.land.length * C.scoring.pointsPerLand} Wealth, ${p.land.length * C.costs.landWage}ƒ wages each half-year)`);
  if (p.loan) notes.push(`📜 Debt: ${p.loan.owed}ƒ due ${esc(untilLabel(p.loan.due))}`);
  if (p.deal) notes.push(`🤝 Partner: ${esc(dealPartner(state, p).name)} until ${esc(untilLabel(p.deal.until))}`);
  if (p.gates) notes.push(`⛨ Gates closed: ${esc(CITIES[p.gates.city].name)} until ${esc(untilLabel(p.gates.until))}`);
  return notes.length ? `<div class="ledger-status">${notes.join('<br>')}</div>` : '';
}

function actionCostText(state, id, p) {
  return {
    ship: '1 AP', post: p.free.post ? 'free' : `${apCost('post')} AP · ${cost(state, 'openPost', p)}ƒ`, move: p.free.move || p.free.moveNoPenalty ? 'free' : `${apCost('move')} AP`,
    prepare: p.free.prepare ? 'free' : `1 AP · ${cost(state, 'prepareHousehold')}ƒ`, physician: p.free.physician ? 'free' : `1 AP · ${cost(state, 'physician')}ƒ`,
    charity: `1 AP · ${charityCost(state, p)}ƒ`,
    marry: `1 AP · ${cost(state, 'marriage')}ƒ`, land: `1 AP · ${cost(state, 'buyLand')}ƒ`, loan: 'no AP', deal: 'no AP',
    gates: `1 AP · −${C.penalties.gatesReputation} rep`,
  }[id];
}

// A quick reason why an action is impossible right now (full checks run later).
export function quickBlock(state, id, p, busy = false) {
  if (busy) return 'Please wait…';
  if (p.pending.length) return 'Answer the card first.';
  const free = NO_AP_ACTIONS.includes(id) || (id === 'move' && (p.free.move || p.free.moveNoPenalty)) || (id === 'prepare' && p.free.prepare) || (id === 'post' && p.free.post) || (id === 'physician' && p.free.physician);
  if (p.ap < 1 && !free) return 'No action points left.';
  if (p.ap < apCost(id) && !free) return `Takes ${apCost(id)} action points.`;
  if (id === 'ship' && !p.posts.some((c) => routesFrom(c).some((r) => !checkAction(state, { type: 'ship', from: c, route: r.id })))) return 'All your posts have shipped this round.';
  if (id === 'post' && !p.free.post && p.florins < cost(state, 'openPost', p)) return `Needs ${cost(state, 'openPost', p)}ƒ.`;
  if (id === 'post' && p.posts.length >= C.limits.maxPosts) return 'Maximum number of posts.';
  if (id === 'post' && !legalPosts(state, p).length) return 'No connected city can take a new post right now.';
  if (id === 'charity') return checkAction(state, { type: 'charity', kind: 'church' });
  if ((id === 'prepare' || id === 'physician') && !familyLocations(p).some((l) => l !== ESTATE && !checkAction(state, { type: id, city: l }))) {
    return familyLocations(p).every((l) => l === ESTATE) ? 'All your family is at the estate.' : `Not possible right now (cost ${id === 'prepare' ? cost(state, 'prepareHousehold') : cost(state, 'physician')}ƒ, once per city).`;
  }
  if ((id === 'marry' || id === 'land') && !p.posts.some((c) => isAftermath(state, c))) return 'Opens when one of your cities reaches Aftermath.';
  if (id === 'marry' || id === 'land' || id === 'gates') return firstReason(state, p.posts.map((c) => ({ type: id, city: c })));
  if (id === 'loan') return checkAction(state, { type: 'loan' });
  if (id === 'deal') return firstReason(state, state.players.filter((o) => o !== p).map((o) => ({ type: 'deal', partner: o.id })));
  return null;
}

// null if any of the actions is possible, otherwise the most useful reason why not.
function firstReason(state, actions) {
  const reasons = actions.map((a) => checkAction(state, a));
  if (reasons.some((r) => !r)) return null;
  return reasons.find((r) => !/^Choose/.test(r)) ?? reasons[0] ?? 'Not possible right now.';
}

// The Actions panel: one button per action (with the reason when blocked) and End turn.
export function actionsPanelHtml(state, p, { busy = false } = {}) {
  const actionBtn = (a) => {
    const why = quickBlock(state, a.id, p, busy);
    return `<button class="action-btn" data-action="${a.id}" ${why ? `disabled title="${esc(why)}"` : ''} aria-keyshortcuts="${a.key.toUpperCase()}">
          <span class="icon" aria-hidden="true">${ACTION_ICONS[a.id]}</span>
          <span><span class="name">${esc(a.name)}</span><span class="desc">${esc(why ?? a.short)}</span></span>
          <span><span class="key">${a.key.toUpperCase()}</span><br><small>${actionCostText(state, a.id, p)}</small></span></button>`;
  };
  return `<section class="panel actions-panel" aria-label="Actions"><h2>Actions</h2><div class="actions">
        ${DATA.actions.filter((a) => !a.group).map(actionBtn).join('')}
        <h3 class="ledger-head">Merchant's Ledger</h3>
        ${DATA.actions.filter((a) => a.group === 'ledger').map(actionBtn).join('')}
        <button class="btn primary" id="end-turn" aria-keyshortcuts="E">End turn <span class="key">E</span></button>
      </div></section>`;
}

export function hintFor(state, p, hintsOn) {
  const on = hintsOn && (roundNumber(state) === 1 || state.difficulty === 'apprentice');
  if (!on) return null;
  if (p.pending.length) return 'A card needs your decision first.';
  const danger = familyLocations(p).find((l) => l !== ESTATE && (isStricken(state, l) || isThreatened(state, l)));
  if (p.ap === 0) return 'You are out of action points. Press <span class="key">E</span> to end your turn and pass the device.';
  if (danger && isStricken(state, danger)) {
    const canMove = p.ap >= apCost('move') || p.free.move || p.free.moveNoPenalty;
    return `Your family in ${esc(CITIES[danger].name)} is in a Stricken city. They will roll for survival at the end of the round. Consider ${canMove ? `<span class="key">3</span> Move Family (${apCost('move')} AP; fleeing costs ${C.penalties.fleeReputation} reputation) or ` : ''}<span class="key">4</span> Prepare Household.`;
  }
  if (danger) return `${esc(CITIES[danger].name)} is next to a Stricken city (spinning orange ring). The plague may arrive soon.`;
  if (p.shipped.length === 0) return `Start with <span class="key">1</span> Ship Goods: pick a route from one of your trading posts. Sea routes pay more. Roll a ${C.fortune.drawOnProfitDie} on the profit die and you draw a Fortune card!`;
  if (p.posts.length < 2 && p.florins >= cost(state, 'openPost', p) && p.ap >= apCost('post')) return `A second trading post (<span class="key">2</span>, ${cost(state, 'openPost', p)}ƒ and ${apCost('post')} AP) lets you ship from two places, and opening it draws a Fortune card.`;
  const after = p.posts.find((c) => isAftermath(state, c));
  if (after && !p.land.length && familyTotal(p) < C.start.family) return `${esc(CITIES[after].name)} is in Aftermath: you can now <span class="key">7</span> Arrange a Marriage or <span class="key">8</span> Buy Abandoned Land there.`;
  return 'Tip: click any city on the map to read its history. Your weakest Legacy category counts twice, so keep all three healthy.';
}

// ---------- Choosing an action ----------
// Returns { html, opts, parse, selectable?, routes? }: `selectable` is the set
// of cities to glow on the map, `routes` asks for route highlighting on hover.
export function actionPrompt(state, p, id) {
  if (id === 'ship') {
    const items = [];
    for (const from of p.posts) for (const r of routesFrom(from)) {
      const action = { type: 'ship', from, route: r.id };
      const why = checkAction(state, action);
      const q = shipQuote(state, p, r.id, from);
      const risk = q.safe ? 'Clean hold: no contagion risk (Fortune card)' : q.contagionRisk ? `<span class="risk">Contagion: infected on a roll of ${q.contagionRisk} or less (${Math.round((q.contagionRisk / 6) * 100)}%)</span>` : 'No contagion risk (origin not Stricken)';
      const dest = state.cities[q.to].state === 'stricken' ? ' · destination Stricken' : state.cities[q.to].state === 'aftermath' ? ' · destination in Aftermath (+prices)' : '';
      items.push({ why, html: choiceBtn(`${from}|${r.id}`, `${esc(cityName(from))} → ${esc(cityName(q.to))} <small>(${r.type}, value ${r.value})</small>`, `Earn ${q.min}–${q.max}ƒ${dest} · ${risk}`, why, `data-route="${r.id}"`) });
      if (q.contagionRisk && !why && !checkAction(state, { ...action, offshore: true })) {
        items.push({ why: null, html: choiceBtn(`${from}|${r.id}|offshore`, `…and hold the ship offshore <small>(+${cost(state, 'holdOffshore')}ƒ)</small>`, 'If the cargo is infected: still half profit, but no reputation lost and the plague does not spread', null, `data-route="${r.id}"`) });
      }
    }
    items.sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0));
    const anyOffshore = items.some((x) => x.html.includes('|offshore'));
    return {
      html: `<div class="frame"><h2>⚓ Ship Goods</h2><p>Choose a route from one of your trading posts. Earnings = route value + profit die${p.posts.some((c) => familyAt(p, c)) ? ' + family bonus where your family lives' : ''}. A profit die of ${C.fortune.drawOnProfitDie} draws a Fortune card.</p>
        <div class="choice-list">${items.map((x) => x.html).join('')}</div>${anyOffshore ? noteHtml(['ME-12', 'ME-14']) : ''}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel <span class="key">Esc</span></button></div></div>`,
      opts: { label: 'Ship Goods', side: true },
      routes: true,
      parse: (v) => {
        if (!v) return null;
        const [from, route, held] = v.split('|');
        return held ? { type: 'ship', from, route, offshore: true } : { type: 'ship', from, route };
      },
    };
  }
  if (id === 'post') {
    const seen = new Set();
    const items = [];
    for (const own of p.posts) for (const n of neighbors(own)) {
      if (seen.has(n) || p.posts.includes(n)) continue;
      seen.add(n);
      const why = checkAction(state, { type: 'post', city: n });
      const cs = state.cities[n];
      items.push({ id: n, why, html: choiceBtn(n, esc(CITIES[n].name), `${cs.state === 'aftermath' ? 'Aftermath' : isThreatened(state, n) ? 'Threatened' : cs.state === 'stricken' ? 'Stricken' : 'Safe'} · ${routesFrom(n).length} routes (best value ${Math.max(...routesFrom(n).map((r) => r.value))})`, why) });
    }
    items.sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0));
    return {
      html: `<div class="frame"><h2>🏛 Open Trading Post (${p.free.post ? 'free' : cost(state, 'openPost', p) + 'ƒ'})</h2><p>Choose a city connected by a route to one of your posts (glowing on the map). New posts let you ship from more places, and opening one draws a Fortune card.</p>
        <div class="choice-list">${items.map((x) => x.html).join('') || '<p>No connected cities.</p>'}</div>
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`,
      opts: { label: 'Open Trading Post', side: true },
      selectable: new Set(items.filter((x) => !x.why).map((x) => x.id)),
      parse: (v) => (v ? { type: 'post', city: v } : null),
    };
  }
  if (id === 'move') return movePrompt(state, p);
  if (id === 'prepare' || id === 'physician') {
    const freeNow = id === 'prepare' ? p.free.prepare : p.free.physician;
    const title = id === 'prepare' ? `🚪 Prepare Household (${freeNow ? 'free' : cost(state, 'prepareHousehold') + 'ƒ'})` : `⚕ Consult Physician (${freeNow ? 'free' : cost(state, 'physician') + 'ƒ'})`;
    const explain = id === 'prepare'
      ? `Your household shuts its doors and stockpiles food. This round, survival rolls there get +${C.plague.prepareBonus}.`
      : `Medieval remedies could not cure the plague. Nursing care gives a slim chance: the first family member there who would die this round rolls again and survives on a ${C.plague.physicianSaveOn}.`;
    const items = familyLocations(p).filter((l) => l !== ESTATE).map((l) => {
      const why = checkAction(state, { type: id, city: l });
      const cs = state.cities[l];
      const status = cs.state === 'stricken' ? `<span class="risk">Stricken (${severityName(cs.severity)})</span>` : isThreatened(state, l) ? 'Threatened' : cs.state === 'aftermath' ? 'Aftermath (plague has passed)' : 'Safe';
      return choiceBtn(l, `${esc(CITIES[l].name)}: ${familyAt(p, l)} family`, status, why);
    });
    return {
      html: `<div class="frame"><h2>${title}</h2><p>${explain}</p><div class="choice-list">${items.join('')}</div>
        ${noteHtml(DATA.actions.find((a) => a.id === id).factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`,
      opts: { label: title, side: true },
      parse: (v) => (v ? { type: id, city: v } : null),
    };
  }
  if (id === 'marry' || id === 'land' || id === 'gates') {
    const info = {
      marry: { title: `💍 Arrange a Marriage (${cost(state, 'marriage')}ƒ)`, explain: `With the epidemic over, survivors married and many children were born. Choose a city in Aftermath where your family lives: +${C.gains.marriageFamily} family member there. Your house cannot grow beyond ${C.start.family}.` },
      land: { title: `🌾 Buy Abandoned Land (${cost(state, 'buyLand')}ƒ)`, explain: `So many farmers died that fields lay empty. Land near a city in Aftermath is worth <strong>${C.scoring.pointsPerLand} Wealth points</strong> at the end, but workers were scarce and wages high: you pay ${C.costs.landWage}ƒ per holding every half-year (or lose 1 reputation if you cannot).` },
      gates: { title: `⛨ Close Your Gates (−${C.penalties.gatesReputation} reputation)`, explain: `Frightened towns posted guards and turned strangers away. Until the end of next round, rival houses cannot open a trading post in the city you choose, and their shipments to it earn ${C.penalties.gatesProfit}ƒ less. Choose a city where you have a post and family.` },
    }[id];
    const items = p.posts.map((c) => {
      const why = checkAction(state, { type: id, city: c });
      const cs = state.cities[c];
      const rivals = state.players.filter((o) => o !== p && o.posts.includes(c)).map((o) => o.name);
      const status = `${cs.state === 'aftermath' ? 'Aftermath' : cs.state === 'stricken' ? 'Stricken' : isThreatened(state, c) ? 'Threatened' : 'Safe'} · ${familyAt(p, c)} family${id === 'gates' && rivals.length ? ` · rival posts: ${rivals.map(esc).join(', ')}` : ''}`;
      return { id: c, why, html: choiceBtn(c, esc(CITIES[c].name), status, why) };
    }).sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0));
    return {
      html: `<div class="frame"><h2>${info.title}</h2><p>${info.explain}</p><div class="choice-list">${items.map((x) => x.html).join('')}</div>
        ${noteHtml(DATA.actions.find((a) => a.id === id).factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`,
      opts: { label: info.title, side: true },
      selectable: new Set(items.filter((x) => !x.why).map((x) => x.id)),
      parse: (v) => (v ? { type: id, city: v } : null),
    };
  }
  if (id === 'loan') {
    const due = halfInfo(untilRound(state, 2)).label;
    return {
      html: `<div class="frame"><h2>📜 Take a Loan</h2>
        <p>Florence's great banks had collapsed just before the plague, so lenders were careful. A banker will lend you <strong>${C.gains.loan}ƒ</strong> now. You must repay <strong>${C.costs.loanRepay}ƒ</strong> in the plague phase of the next round (${esc(due)}).</p>
        <p>If you cannot pay in full, you pay everything you have and lose <strong>${C.penalties.loanDefaultReputation} reputation</strong>. Taking a loan costs no action point.</p>
        ${noteHtml(DATA.actions.find((a) => a.id === 'loan').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button><button class="btn primary" data-value="go" autofocus>Borrow ${C.gains.loan}ƒ</button></div></div>`,
      opts: { label: 'Take a Loan', side: true },
      parse: (v) => (v === 'go' ? { type: 'loan' } : null),
    };
  }
  if (id === 'deal') {
    const items = state.players.filter((o) => o !== p).map((o) => {
      const why = checkAction(state, { type: 'deal', partner: o.id });
      return choiceBtn(String(o.id), `${crestSvg(o, 16)} ${esc(o.name)}`, `Posts: ${o.posts.map((c) => esc(CITIES[c].name)).join(', ')}`, why);
    });
    return {
      html: `<div class="frame"><h2>🤝 Propose a Partnership</h2>
        <p>Merchant ships linked the Italian cities with the Hanseatic League of the north. Offer another house a partnership until the end of next round: when either of you ships to a city where the other has a trading post, <strong>both earn ${C.gains.dealBonus}ƒ more</strong>.</p>
        <p>They will accept or decline at the start of their next turn. Proposing costs no action point.</p>
        <div class="choice-list">${items.join('')}</div>${noteHtml(DATA.actions.find((a) => a.id === 'deal').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`,
      opts: { label: 'Propose a Partnership', side: true },
      parse: (v) => (v ? { type: 'deal', partner: Number(v) } : null),
    };
  }
  if (id === 'charity') {
    const price = charityCost(state, p);
    const gain = Math.max(1, C.gains.charityReputation + state.effects.charityBonus);
    const items = Object.entries(CHARITY_KINDS).map(([k, c]) => choiceBtn(k, esc(c.label), `${price}ƒ → +${gain} reputation`, checkAction(state, { type: 'charity', kind: k })));
    return {
      html: `<div class="frame"><h2>✝ Charity &amp; Piety</h2><p>Support your city in its hour of need.${lastPlaceId(state) === p.id ? ' (Your house is in last place, so it costs 1ƒ less.)' : ''}</p>
        <div class="choice-list">${items.join('')}</div>${noteHtml(DATA.actions.find((a) => a.id === 'charity').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`,
      opts: { label: 'Charity and Piety', side: true },
      parse: (v) => (v ? { type: 'charity', kind: v } : null),
    };
  }
  return null;
}

function movePrompt(state, p) {
  const froms = familyLocations(p);
  const places = [ESTATE, ...p.posts];
  let sel = { from: froms[0], to: places.find((x) => x !== froms[0]), count: 1 };
  const noPenalty = !!p.free.moveNoPenalty;
  return {
    html: `<div class="frame"><h2>🐎 Move Family ${p.free.move || noPenalty ? '(free this time)' : ''}</h2>
      <p>Family can live in any city where you have a trading post, or at your Country Estate in the countryside (safe from the plague, but it earns no family bonus). Leaving a <strong>Stricken</strong> city is fleeing and costs ${noPenalty ? 'no reputation this time (Fortune card)' : `${C.penalties.fleeReputation} reputation`}.</p>
      <div class="field"><label for="mv-from">From</label><select id="mv-from">${froms.map((l) => `<option value="${l}">${esc(cityName(l))} (${familyAt(p, l)} family${l !== ESTATE && isStricken(state, l) ? ', Stricken' : ''})</option>`).join('')}</select></div>
      <div class="field"><label for="mv-to">To</label><select id="mv-to">${places.map((l) => `<option value="${l}">${esc(cityName(l))}${l !== ESTATE && isStricken(state, l) ? ' (Stricken!)' : l !== ESTATE && isThreatened(state, l) ? ' (threatened)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="mv-count">How many</label><select id="mv-count">${Array.from({ length: C.limits.moveFamilyMax }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
      <p id="mv-why" class="error" role="alert"></p>
      ${noteHtml(['SO-04'])}
      <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button><button class="btn primary" id="mv-go">Move</button></div></div>`,
    opts: {
      label: 'Move Family',
      side: true,
      onMount: (d, close) => {
        const f = d.querySelector('#mv-from'), t = d.querySelector('#mv-to'), n = d.querySelector('#mv-count'), w = d.querySelector('#mv-why'), go = d.querySelector('#mv-go');
        t.value = sel.to;
        const upd = () => {
          sel = { from: f.value, to: t.value, count: Number(n.value) };
          const why = checkAction(state, { type: 'move', ...sel });
          const flee = !why && !noPenalty && sel.from !== ESTATE && isStricken(state, sel.from) ? `Fleeing ${cityName(sel.from)} will cost ${C.penalties.fleeReputation} reputation.` : '';
          w.textContent = why ?? flee;
          w.style.color = why ? '' : 'var(--warn)';
          go.disabled = !!why;
        };
        [f, t, n].forEach((x) => (x.onchange = upd));
        upd();
        go.onclick = () => close('go');
        f.focus();
      },
    },
    parse: (v) => (v === 'go' ? { type: 'move', ...sel } : null),
  };
}

// ---------- Decisions (offers, protecting the persecuted, wage laws, partnerships) ----------
// parse returns the choice for decide(): true/false, or 'obey'/'pay'.
export function decisionPrompt(state, p, d) {
  if (d.kind === 'deal') return dealPrompt(state, p, d);
  const card = cardById(d.card);
  const isFortune = !!d.fortune;
  let body = '';
  let buttons = '';
  if (d.kind === 'offer') {
    const why = canAccept(state, p, d);
    const gain = [d.gain.reputation ? `+${d.gain.reputation} reputation` : '', d.gain.florins ? `+${d.gain.florins}ƒ` : ''].filter(Boolean).join(', ');
    const penalty = d.declinePenalty ? [d.declinePenalty.reputation ? `−${d.declinePenalty.reputation} reputation` : '', d.declinePenalty.florins ? `−${d.declinePenalty.florins}ƒ` : '', d.declinePenalty.blockHome ? 'home post cannot ship' : ''].filter(Boolean).join(', ') : '';
    body = `<p>${esc(card.text)}</p>`;
    buttons = `<button class="btn" data-value="yes" ${why ? 'disabled' : ''}>${esc(d.label)} (${d.cost.florins ?? 0}ƒ${gain ? ` → ${gain}` : ''})</button>
        <button class="btn primary" data-value="no">${esc(d.decline)}${penalty ? ` (${penalty})` : ''}</button>${why ? `<p class="error">${esc(why)}</p>` : ''}`;
  } else if (d.kind === 'protect') {
    const why = canAccept(state, p, d);
    body = `<p>The Jewish community of ${esc(CITIES[d.city].name)} has been falsely accused of causing the plague. <strong>The accusations were false, and the violence was unjust.</strong></p>
        <p>Your house can use its money and influence to shelter and defend the community. It will cost ${C.costs.protectCommunity}ƒ and 1 action point from this turn, and earns ${C.gains.protectReputation} reputation. Nothing can be gained from persecution.</p>`;
    buttons = `<button class="btn primary" data-value="yes" ${why ? 'disabled' : ''}>Protect the community (${C.costs.protectCommunity}ƒ, 1 AP)</button>
        <button class="btn" data-value="no">Do not intervene</button>${why ? `<p class="error">${esc(why)}</p>` : ''}`;
  } else if (d.kind === 'wageLaw') {
    body = `<p>${esc(card.text)}</p><p>You own a post in ${d.cities.filter((c) => p.posts.includes(c)).map((c) => esc(CITIES[c].name)).join(' and ')}.</p>
        <ul><li><strong>Obey</strong>: +${C.wageLaw.obeyReputation} reputation, but your English posts cannot ship this round (workers refuse the old wages).</li>
        <li><strong>Pay market wages</strong>: roll a die; on 1–${C.wageLaw.fineMaxRoll} you are fined ${C.wageLaw.fine}ƒ.</li></ul>`;
    buttons = `<button class="btn" data-value="obey">Obey the law</button><button class="btn primary" data-value="pay">Pay market wages</button>`;
  }
  const theme = isFortune ? 'fortune' : card.theme;
  return {
    html: `<div class="frame">${cardHtml({ theme, extraClass: isFortune ? 'fortune' : '', kind: `Decision for ${esc(p.name)}`, title: card.title, body: body + noteHtml(card.factIds) })}
      <div class="dialog-actions">${buttons}</div></div>`,
    opts: { dismissable: false, label: `Decision: ${card.title}` },
    parse: (v) => (d.kind === 'wageLaw' ? v : v === 'yes'),
  };
}

function dealPrompt(state, p, d) {
  const from = state.players[d.from];
  const why = canAccept(state, p, d);
  const shared = from.posts.filter((c) => p.posts.some((x) => x === c || neighbors(x).includes(c)));
  return {
    html: `<div class="frame">${cardHtml({ theme: 'trade', kind: `Decision for ${esc(p.name)}`, title: `A Partnership with ${from.name}`, body: `
      <p>${crestSvg(from, 18)} <strong>${esc(from.name)}</strong> of ${esc(CITIES[from.home].name)} proposes a partnership until the end of next round.</p>
      <p>When either house ships to a city where the other has a trading post, <strong>both earn ${C.gains.dealBonus}ƒ more</strong>. Their posts: ${from.posts.map((c) => esc(CITIES[c].name)).join(', ')}.${shared.length ? ` Your routes reach ${shared.map((c) => esc(CITIES[c].name)).join(', ')}.` : ''}</p>
      ${noteHtml(['TR-04'])}` })}
      <div class="dialog-actions"><button class="btn primary" data-value="yes" ${why ? 'disabled' : ''}>Accept the partnership</button><button class="btn" data-value="no">Decline</button>${why ? `<p class="error">${esc(why)}</p>` : ''}</div></div>`,
    opts: { dismissable: false, label: `Partnership offer from ${from.name}` },
    parse: (v) => v === 'yes',
  };
}

// Asked only when action points are left. parse → true to end the turn.
export function endTurnPrompt(p) {
  return {
    html: `<div class="frame"><h2>End your turn?</h2><p>You still have ${p.ap} action point${p.ap > 1 ? 's' : ''}. Unused points are lost.</p>
        <div class="dialog-actions"><button class="btn" data-value="">Keep playing</button><button class="btn primary" data-value="end" autofocus>End turn</button></div></div>`,
    opts: { label: 'End turn?' },
    parse: (v) => v === 'end',
  };
}
