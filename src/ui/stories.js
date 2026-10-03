// The story cards (prologue, turn order, round start, Chronicle and Event
// cards, Fortune cards, plague results, shipment results and the like).
// Each one is built from game data alone, so the big screen and every
// player's own device draw exactly the same card: the big screen only sends
// the card's kind and its log entries (plain data, never HTML).
//
// storyCard(state, kind, data, { hints, big, still }) returns
//   { body, button, opts, mount(dialog) }
// body: the card without its buttons · button: the big screen's button label
// opts: openDialog options · mount: the dice animation (big screen only)
// still: draw the finished dice straight away (a device reading the card).
import { DATA, CITIES, FACTS } from '../data.js';
import { C, cardById, fortuneById, severityName, roundInfo, roundNumber, totalRounds, modeOf, difficultyOf, halfInfo } from '../engine/index.js';
import { esc, crestSvg } from './dom.js';
import { dieHtml, rollDice, holdDice } from './dice.js';
import { noteHtml } from './notes.js';
import { THEME_COLORS, coinIcon, heraldicBanner } from './art.js';
import { cardHtml, cityName } from './prompts.js';

export function storyCard(state, kind, data, options = {}) {
  const build = BUILDERS[kind];
  if (!build) return null;
  const card = build(state, data, options);
  return { button: 'Continue', mount: null, ...card, opts: { dismissable: false, ...card.opts } };
}

// A round's Chronicle cards, shared out evenly over pages of at most `per`.
export function chroniclePages(groups, per = 4) {
  const pages = Math.ceil(groups.length / per);
  const size = Math.ceil(groups.length / pages);
  return Array.from({ length: pages }, (_, i) => ({ groups: groups.slice(i * size, (i + 1) * size), page: i + 1, pages }));
}

// Deals `items` out in order over n pages of about equal size.
export function share(items, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(items.slice(Math.round((i * items.length) / n), Math.round(((i + 1) * items.length) / n)));
  return out.filter((part) => part.length);
}
const numbered = (pages) => pages.map((page, i) => ({ ...page, page: i + 1, pages: pages.length }));
const pageOf = (page, pages) => (pages > 1 ? ` <small>(${page} of ${pages})</small>` : '');
const knownFacts = (ids) => [...new Set(ids ?? [])].filter((id) => FACTS[id]);
const factUnits = (ids) => knownFacts(ids).map((fact) => ({ fact }));
const factsIn = (part) => part.filter((u) => u.fact).map((u) => u.fact);

// Long cards can be dealt out over several cards (the big screen does this
// when a card would otherwise have to shrink: see game.js). Returns
//   { units, make(parts), fallback }
// units: the pieces of the card, in order (rows, dice trays, historical
// facts) · make: the card data for pages holding the given lists of units ·
// fallback: the pages where cards can scroll. Null for a card that is always
// one card.
export function splitStory(kind, data, { hints } = {}) {
  if ((kind === 'prologue' && hints) || kind === 'order') {
    const units = kind === 'order' ? ['rolls', 'result'] : ['story', 'how'];
    return { units, make: (parts) => (parts.length < 2 ? [data] : units.map((part) => ({ ...data, part }))), fallback: [data] };
  }
  if (kind === 'round') {
    const [head, ...arrivals] = data.group;
    const units = [...arrivals.map((arrival) => ({ arrival })), ...factUnits([...head.factIds, ...arrivals.flatMap((a) => a.factIds)])];
    return { units, make: (parts) => numbered(parts.map((part) => ({ group: [head, ...part.filter((u) => u.arrival).map((u) => u.arrival)], facts: factsIn(part) }))), fallback: [data] };
  }
  if (kind === 'chronicle') {
    const fallback = chroniclePages(data.groups);
    const units = [...data.groups.map((group) => ({ group })), ...factUnits(fallback.flatMap((p) => chronicleFacts(p.groups)))];
    return { units, make: (parts) => numbered(parts.map((part) => ({ groups: part.filter((u) => u.group).map((u) => u.group), facts: factsIn(part) }))), fallback };
  }
  if (kind === 'plague') {
    const { group } = data;
    const whole = plagueRound(group);
    if (whole.pre) return null;
    // A half-year heading stays with the line that follows it.
    const units = [];
    let heads = [];
    for (const e of group) {
      if (e.type === 'plague') heads.push(e);
      else { units.push({ lines: [...heads, e] }); heads = []; }
    }
    if (heads.length) { if (units.length) units.at(-1).lines.push(...heads); else units.push({ lines: heads }); }
    units.push(...factUnits(plagueFacts(whole)));
    return { units, make: (parts) => numbered(parts.map((part) => ({ group: part.flatMap((u) => u.lines ?? []), facts: factsIn(part), whole }))), fallback: [data] };
  }
  return null;
}
const chronicleFacts = (groups) => groups.flatMap(([e]) => cardById(e.card).factIds).slice(0, 4);
// What every page of a round's plague results needs to know about the whole round.
const plagueRound = (group) => ({
  halves: group.filter((e) => e.type === 'plague').length,
  pre: group.every((e) => e.type !== 'plague' || e.pre),
  rolls: group.some((e) => e.type === 'mortality'),
  deaths: group.some((e) => e.deaths > 0),
});
const plagueFacts = (whole) => (whole.deaths ? ['EC-10', 'DB-01'] : []);

// The whole dialog: the card plus the given buttons.
export function storyHtml(card, actions) {
  return `<div class="frame">${card.body}<div class="dialog-actions">${actions}</div></div>`;
}

const roll = (d) => rollDice(d);

const BUILDERS = {
  prologue(state, { e, part }, { hints }) {
    const how = hints && part !== 'story';
    return {
      body: `${part === 'how' ? '<h2>Before you begin</h2>' : cardHtml({ theme: 'trade', kind: 'Prologue · 1346', title: 'The Siege of Caffa', body: `
      <p class="drop-cap">${esc(e.text)} ${state.preRounds ? `The game begins in ${esc(halfInfo(state.firstHalf).label.split(' ')[1])}, before the plague sails west: use the ${state.preRounds > 1 ? `${state.preRounds} pre-plague rounds` : 'pre-plague round'} to open trading posts while the ports are safe. The plague years begin in the second half of 1347.` : 'The game begins in the second half of 1347, as Italian ships carry the sickness west.'} ${state.mode === 'quick' ? 'In Quick Play each round of the plague years is a year and a half.' : 'Each round is half a year.'} The plague will reach each city on the map when it really did, unless your ships bring it sooner.</p>
      ${noteHtml(e.factIds)}` })}
      ${how ? `<section class="hint" style="margin-top:1rem"><strong>How to play in one minute</strong><ol style="margin:0.3rem 0 0;padding-left:1.2rem">
        <li><strong>Each round</strong>, the plague reaches new cities (the dates are real), and Chronicle and Event cards are read aloud.${state.turnSeconds ? ` Each turn has a <strong>${state.turnSeconds}-second timer</strong> (it stops while cards are shown).` : ''}</li>
        <li><strong>On your turn</strong> you have ${modeOf(state).actionPoints} action points. Most actions take 1; opening a trading post or moving family takes ${C.actionPointCosts.post}. Press <span class="key">1</span> Ship Goods to earn florins; sea routes pay more, but cargo from a Stricken city may be infected.</li>
        <li><strong>Fortune cards:</strong> roll a ${C.fortune.drawOnProfitDie} when shipping, or open a new trading post, and you draw a personal Fortune card.</li>
        <li><strong>Protect your family:</strong> family in a Stricken city rolls for survival at the end of the round. Move them away (<span class="key">3</span>) or prepare your household (<span class="key">4</span>).</li>
        <li><strong>Win</strong> with the highest Legacy in 1353: Wealth + Family + Reputation, plus your weakest one again. Balance beats greed.</li>
      </ol></section>` : ''}`,
      button: part === 'story' ? 'How to play' : 'Roll for turn order',
      opts: { label: part === 'how' ? 'How to play' : 'Prologue' },
    };
  },

  // Each house rolls a die; the highest goes first (ties roll again).
  order(state, { e, part }, { still }) {
    const players = state.players;
    const rows = e.rolls.map((round, r) => `<div style="margin-top:0.6rem"><div class="card-kind" style="color:var(--gold)">${r === 0 ? 'Every house rolls' : 'Tie! These houses roll again'}</div>
      <div class="dice-tray"><div class="dice-row">${round.map((x) => `<div class="die-wrap" style="color:#fbe9c0">${dieHtml(x.die, { gold: true })}<div>${crestSvg(players[x.player], 16)} ${esc(players[x.player].name)}</div></div>`).join('')}</div></div></div>`).join('');
    const order = e.order.map((id, i) => `<div class="order-card ${i === 0 ? 'winner' : ''}" style="--house:${players[id].color}"><div class="place">${['1st', '2nd', '3rd', '4th', '5th', '6th'][i]}</div>
      <div class="order-banner">${heraldicBanner(players[id].color, players[id].crest)}</div><div class="nm">${esc(players[id].name)}</div><small>${esc(CITIES[players[id].home].name)}</small></div>`).join('');
    return {
      body: `<h2 style="text-align:center">Rolling for Turn Order</h2>
      <p style="text-align:center">The highest roll goes first; tied houses roll again. <strong>This order stays the same for the whole game.</strong></p>
      ${part === 'result' ? '' : `<div id="order-rolls">${rows}</div>`}
      ${part === 'rolls' ? '' : `<div class="order-grid" id="order-result" style="visibility:${still || part ? 'visible' : 'hidden'}">${order}</div>`}`,
      button: part === 'rolls' ? 'See the turn order' : state.preRounds ? `Begin the year ${halfInfo(state.firstHalf).label.split(' ')[1]}` : 'Begin the year 1347',
      opts: { wide: true, label: 'Turn order' },
      mount: async (d) => {
        holdDice(d);
        for (const tray of d.querySelectorAll('.dice-tray')) await rollDice(tray);
        const result = d.querySelector('#order-result');
        if (result) result.style.visibility = 'visible';
      },
    };
  },

  round(state, { group, facts, page = 1, pages = 1 }, { big }) {
    const [head, ...arrivals] = group;
    const info = roundInfo(state);
    const half = halfInfo(state.round);
    const years = state.round === state.roundEnd ? half.label : info.label;
    const arrHtml = info.pre
      ? `<p><strong>Before the plague.</strong> Only Caffa and Tana on the Black Sea are Stricken. No Event card and no survival rolls this round, and trading posts cost ${C.prePlague.postDiscount}ƒ less: set up your trade while the ports are safe.</p>`
      : arrivals.length
      ? page > 1 ? arrivals.length === 0 ? '' : `<div class="dice-tray"><div class="choice-list" style="margin:0">${arrivals.map((a, i) => arrivalRow(state, a, i)).join('')}</div></div>`
      : `<h3>The plague arrives${pageOf(page, pages)}</h3>
        <p class="sev-explain">🎲 Each newly struck city rolls the red <strong>severity die</strong> to see how badly the plague hits it: ${severityBands()}.${severityModsText(state)}</p>
        <div class="dice-tray"><div class="choice-list" style="margin:0">${arrivals.map((a, i) => arrivalRow(state, a, i)).join('')}</div></div>`
      : page > 1 ? '' : '<p>No new cities are struck this time.</p>';
    return {
      body: `${page > 1 ? `<h2>${esc(years)}: the plague arrives${pageOf(page, pages)}</h2>` : `<div class="round-banner"><div class="card-kind" style="color:var(--gold)">${info.pre ? 'Before the plague · ' : ''}Round ${roundNumber(state)} of ${totalRounds(state)}</div>
        <div class="year">${esc(years)}</div><div><em>${esc(info.months)}</em> <span class="season" aria-hidden="true">${half.season === 'warm' ? '☀' : '❄'}</span></div>
        <p>${esc(info.headline)}</p></div>`}
      ${arrHtml}
      ${noteHtml(facts ?? [...head.factIds, ...arrivals.flatMap((a) => a.factIds)])}`,
      button: page < pages ? 'More cities' : 'Continue',
      opts: { wide: big && arrivals.length > 4, label: `${info.label}${pages > 1 ? ` (${page} of ${pages})` : ''}` },
      mount: roll,
    };
  },

  card(state, { group }) {
    const [e, ...effects] = group;
    const card = cardById(e.card);
    const kind = e.deck === 'chronicle' ? `Chronicle · ${halfInfo(card.round ?? state.round).label}` : 'Event card';
    const effectTxt = effects.map((x) => `<li>${esc(x.text)}</li>`).join('');
    const decisionHint = ['offer', 'persecution', 'wageLaw'].includes(card.effect.type)
      ? `<p><strong>Each house decides at the start of its own turn.</strong></p>` : '';
    return {
      body: cardHtml({ theme: card.theme, kind: `${esc(kind)} · ${esc(THEME_COLORS[card.theme]?.label ?? card.theme)}`, title: card.title, body: `
        <p>${esc(card.text)}</p>${effectTxt ? `<ul>${effectTxt}</ul>` : ''}${decisionHint}${noteHtml(card.factIds)}` }),
      opts: { label: card.title },
    };
  },

  // Several Chronicle cards of the same round, side by side on one page.
  chronicle(state, { groups, facts, page = 1, pages = 1 }) {
    const cards = groups.map(([e, ...effects]) => {
      const card = cardById(e.card);
      const effectTxt = effects.map((x) => `<li>${esc(x.text)}</li>`).join('');
      const decisionHint = ['offer', 'persecution', 'wageLaw'].includes(card.effect.type) ? '<p><strong>Each house decides at the start of its own turn.</strong></p>' : '';
      return cardHtml({ theme: card.theme, kind: `Chronicle · ${esc(halfInfo(card.round).label)}`, title: card.title, body: `
        <p>${esc(card.text)}</p>${effectTxt ? `<ul>${effectTxt}</ul>` : ''}${decisionHint}` });
    });
    return {
      body: `<h2>The Chronicle${pages > 1 ? ` <small>(${page} of ${pages})</small>` : ''}</h2>
        ${cards.length ? `<div class="chronicle-grid n${cards.length}">${cards.join('')}</div>` : ''}
        ${noteHtml(facts ?? chronicleFacts(groups))}`,
      button: page < pages ? 'More of the chronicle' : 'Continue',
      opts: { wide: true, label: `Chronicle${pages > 1 ? ` ${page} of ${pages}` : ''}` },
    };
  },

  fortune(state, { e }) {
    const card = fortuneById(e.card);
    const p = state.players[e.player];
    const tone = { good: 'Good fortune', bad: 'Misfortune', choice: 'A choice' }[card.tone];
    let extra = '';
    if (e.cities?.length) extra = `<p><strong>Warning:</strong> ${e.cities.map((c) => esc(CITIES[c].name)).join(', ')}.</p>`;
    if (e.die) extra += `<div class="dice-tray"><div class="dice-row">${dieHtml(e.die, { red: true, label: `Survival roll (dies on ${e.severity} or less)` })}</div></div>`;
    return {
      body: cardHtml({ theme: 'fortune', extraClass: 'fortune', kind: `Fortune card · ${esc(p.name)} ${esc(e.reason)} · <span class="tone">${tone}</span>`, title: card.title, body: `
        <p>${esc(card.text)}</p>${e.result ? `<p><strong>${esc(e.result)}</strong></p>` : ''}${extra}${card.effect.type === 'offer' ? '<p><em>You will choose next.</em></p>' : ''}${noteHtml(card.factIds)}` }),
      opts: { label: `Fortune card: ${card.title}` },
      mount: roll,
    };
  },

  plague(state, { group, facts, page = 1, pages = 1, whole = plagueRound(group) }) {
    const last = page === pages;
    let body = '';
    // Runs of dice trays and of Aftermath lines are grouped, so the big screen
    // can show them side by side.
    let trays = [];
    let after = [];
    const flush = () => {
      if (trays.length) body += `<div class="plague-grid">${trays.join('')}</div>`;
      if (after.length) body += `<div class="aftermath-list">${after.join('')}</div>`;
      trays = [];
      after = [];
    };
    group.forEach((e, i) => {
      if (e.type !== 'mortality' && e.type !== 'aftermath') flush();
      if (e.type === 'plague') {
        if (whole.halves > 1) body += `<h3 style="margin-top:0.8rem">${esc(halfInfo(e.half).label)}</h3>`;
        if (e.pre) body += `<p style="margin:0.3rem 0">${esc(e.text)}</p>`;
        return;
      }
      if (e.type === 'aftermath') { after.push(`<p style="margin:0.3rem 0">❦ ${esc(e.text)}</p>`); return; }
      if (e.type !== 'mortality') { body += `<p style="margin:0.3rem 0">📜 ${esc(e.text)}</p>`; return; }
      const p = state.players[e.player];
      const bonus = e.prepared ? C.plague.prepareBonus : 0;
      const dice = e.rolls.map((r, j) => {
        const outcome = r.dies ? 'died' : r.lastHeir ? 'last heir' : r.save >= C.plague.physicianSaveOn ? 'nursed back' : 'lived';
        const math = bonus ? `${r.die} + ${bonus} = ${r.total}` : `rolled ${r.die}`;
        return `<div class="die-wrap">${dieHtml(r.die, { small: true, red: r.dies, id: `m-${i}-${j}` })}<div class="die-math">${math}</div><div class="${r.dies ? 'outcome-dead' : 'outcome-safe'}">${outcome}</div></div>`;
      }).join('');
      trays.push(`<div class="dice-tray"><div style="color:#fbe9c0">${crestSvg(p, 18)} <strong>${esc(p.name)}</strong> in ${esc(CITIES[e.city].name)} (${esc(severityName(e.severity))}): a family member dies if the result is <strong>${e.severity} or less</strong>${bonus ? ` (each roll gets +${bonus} for a prepared household)` : ''}.</div>
        <div class="dice-row" style="justify-content:flex-start;margin-top:0.4rem">${dice}</div><div style="color:#fbe9c0;margin-top:0.3rem">${esc(e.text)}</div></div>`);
    });
    flush();
    const { pre } = whole;
    if (!pre && !whole.rolls && last) body += '<p>No family members were in Stricken cities this round.</p>';
    return {
      body: pre ? `<h2>The Year Turns: ${esc(roundInfo(state)?.label ?? '')}</h2><p>No plague yet: only upkeep is paid.</p>` : `<h2>The Plague Takes Its Toll: ${esc(roundInfo(state).label)}${pageOf(page, pages)}</h2>
      ${page === 1 ? '<p>Every family member in a Stricken city rolls the mortality die.</p>' : ''}
      ${body}
      ${noteHtml(facts ?? plagueFacts(whole), 'Historical Note')}`,
      button: !last ? 'Continue' : state.roundEnd >= C.rounds ? 'Final scoring' : 'Begin the next round',
      opts: { wide: true, label: `${pre ? 'End of the round' : 'Plague results'}${pages > 1 ? ` (${page} of ${pages})` : ''}` },
      mount: roll,
    };
  },

  ship(state, { e }) {
    const parts = e.parts.map((x) => `<li>${esc(x.label)}: ${x.value >= 0 ? '+' : ''}${x.value}</li>`).join('');
    const infectedNote = e.infected && e.offshore ? `<p class="risk">Infected cargo! Profit halved. The ship waited offshore, so the sickness showed before anyone landed: no reputation lost and the plague does not spread.</p>`
      : e.infected ? `<p class="risk">Infected cargo! Profit halved and −${C.penalties.infectedCargoReputation} reputation. ${e.spread === 'early' ? `The plague reaches ${esc(cityName(e.to))} earlier than it really did.` : e.spread === 'worse' ? `The plague in ${esc(cityName(e.to))} grows worse.` : 'The infection dies out this time.'}</p>` : '';
    const who = state.players[e.player];
    return {
      body: `<h2>${esc(cityName(e.from))} → ${esc(cityName(e.to))}</h2>
        ${who ? `<p style="margin-top:-0.3rem">${crestSvg(who, 16)} ${esc(who.name)} ships goods.</p>` : ''}
        <div class="dice-tray"><div class="dice-row">${dieHtml(e.profitDie, { gold: e.profitDie === C.fortune.drawOnProfitDie, label: e.profitDie === C.fortune.drawOnProfitDie ? 'Profit die: Fortune!' : 'Profit die' })}${e.contagionDie !== null ? dieHtml(e.contagionDie, { red: true, label: `Contagion die (infected on ≤${e.contagionRisk})` }) : ''}</div></div>
        <ul>${parts}<li>Profit die: +${e.profitDie}</li></ul>
        <p style="font-size:1.25rem">${coinIcon(24)} Earned <strong>${e.profit}ƒ</strong>.${e.offshore ? ` <small>(Offshore wait: ${e.fee}ƒ paid.)</small>` : ''}</p>${infectedNote}
        ${e.partner != null ? `<p>🤝 Partner ${esc(state.players[e.partner].name)} also earns ${C.gains.dealBonus}ƒ.</p>` : ''}
        ${e.infected || e.offshore ? noteHtml(e.factIds) : ''}`,
      // A clean, ordinary shipment closes by itself once the dice have landed.
      opts: { dismissable: true, label: 'Shipment result', autoClose: e.infected || e.offshore || e.spread === 'early' ? 0 : C.timing.shipResultAutoCloseMs },
      mount: roll,
    };
  },

  spread(state, { arrival }) {
    return {
      body: `<h2>The plague spreads by trade</h2><p>${esc(arrival.text)}</p>
          <div class="dice-tray"><div class="choice-list" style="margin:0">${arrivalRow(state, arrival, 0)}</div></div>${noteHtml(arrival.factIds)}`,
      opts: { dismissable: true, label: 'Plague spreads' },
    };
  },

  physician(state, { e }) {
    const remedy = DATA.remedies.find((r) => r.id === e.remedy);
    return {
      body: cardHtml({ theme: 'medical', kind: 'Remedy of the time', title: remedy.name, body: `<p>${esc(remedy.text)}</p>
        <p><strong>It will not cure the plague.</strong> Only nursing care might help a little: if a family member in ${esc(cityName(e.city))} would die this round, they get one more roll and survive on a ${C.plague.physicianSaveOn}.</p>
        ${noteHtml(e.factIds)}` }),
      opts: { dismissable: true, label: 'Physician' },
    };
  },

  wage(state, { entry }) {
    return {
      body: `<h2>Wage inspection</h2><div class="dice-tray"><div class="dice-row">${dieHtml(entry.die, { label: 'Inspection die' })}</div></div><p>${esc(entry.text)}</p>`,
      opts: { dismissable: true, label: 'Wage inspection' },
      mount: roll,
    };
  },

  reveal(state, { cardId, entry }) {
    const card = cardById(cardId);
    return {
      body: `<h2>${esc(card.title)}</h2><p>${esc(entry.text)}</p>${noteHtml(card.factIds)}`,
      opts: { dismissable: true, label: card.title },
    };
  },
};

// ---------- Severity roll explanations ----------
function severityBands() {
  const bands = {};
  for (const [die, sev] of Object.entries(C.plague.severityTable)) (bands[sev] ||= []).push(Number(die));
  return Object.entries(bands).map(([sev, dice]) => `${dice[0]}–${dice.at(-1)} ${severityName(Number(sev))}`).join(', ');
}
function severityModsText(state) {
  const d = difficultyOf(state).severityMod;
  const diffTxt = d ? ` On ${difficultyOf(state).label} difficulty every roll counts ${d > 0 ? '1 higher' : '1 lower'}.` : '';
  return ` Hard-hit Tuscany and Catalonia add 1; Flanders subtracts 1.${diffTxt}`;
}
function severityCaption(state, a) {
  const base = C.plague.severityTable[String(a.die)];
  const mods = [];
  const cm = CITIES[a.city].severityMod ?? 0;
  const dm = difficultyOf(state).severityMod ?? 0;
  if (cm) mods.push(`${cm > 0 ? '+' : ''}${cm} ${cm > 0 ? 'hard-hit region' : 'lighter region'}`);
  if (dm) mods.push(`${dm > 0 ? '+' : ''}${dm} difficulty`);
  const pips = '●'.repeat(a.severity);
  return `Severity roll: ${a.die}${mods.length && base !== a.severity ? ` (${mods.join(', ')})` : ''} → <strong>${esc(severityName(a.severity))}</strong> <span class="sev-pips" aria-label="${a.severity} of 3">${pips}</span>`;
}
function arrivalRow(state, a, i) {
  const city = CITIES[a.city];
  if (a.type !== 'arrival') {
    return `<div class="choice arrival-row"><span><strong class="arr-city">${esc(city.name)}</strong><span class="sub">${esc(a.text)}</span></span><span>—</span></div>`;
  }
  return `<div class="choice arrival-row">
      <span><strong class="arr-city">${esc(city.name)}</strong><span class="sub">${a.early ? 'Brought early by infected cargo. ' : ''}Historically: ${esc(city.arrival.dateText)}</span></span>
      <span class="sev-roll">${dieHtml(a.die, { red: true, small: true, id: `sev-${i}` })}<span class="sev-caption">${severityCaption(state, a)}</span></span></div>`;
}
