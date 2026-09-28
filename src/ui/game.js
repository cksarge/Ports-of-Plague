// The game screen: board, sidebar, turn flow, actions, cards and dice.
import { DATA, CITIES } from '../data.js';
import {
  C, ESTATE, advance, endTurn, decide, currentPlayer, performAction, checkAction, shipQuote,
  scorePlayer, familyAt, familyTotal, familyLocations, isStricken, isThreatened, routesFrom,
  neighbors, cost, charityCost, CHARITY_KINDS, cardById, canAccept, severityName,
  roundInfo, actionPointsFor, lastPlaceId, legalPosts, totalRounds, roundNumber, modeOf, fortuneById, difficultyOf,
  isAftermath, untilRound, dealPartner,
} from '../engine/index.js';
import { $, $$, esc, openDialog, dialogOpen, toast, announce, crestSvg } from './dom.js';
import { createMap, updateMap, animateShipment, animateStrike, redrawStains, startAmbient, floatText } from './map.js';
import { dieHtml, rollDice } from './dice.js';
import { noteHtml } from './notes.js';
import { showRules, showJournal, showCity } from './panels.js';
import { sfx, isMuted, setMuted, isMusicOn, setMusicOn } from './sound.js';
import { music } from './music.js';
import { saveGame } from './save.js';
import { THEME_COLORS, themeIllustration, coinIcon, laurelIcon, familyIcon, candleIcon, heraldicBanner } from './art.js';

const ACTION_ICONS = { ship: '⚓', post: '🏛', move: '🐎', prepare: '🚪', physician: '⚕', charity: '✝', marry: '💍', land: '🌾', loan: '📜', deal: '🤝', gates: '⛨' };
const NO_AP_ACTIONS = ['loan', 'deal'];

// A card with an illustrated, colour-coded top band.
function cardHtml({ theme, kind, title, body, extraClass = '' }) {
  const t = THEME_COLORS[theme] ?? THEME_COLORS.timeline;
  return `<div class="card ${extraClass}" style="--card:${t.main};--card-light:${t.light}">
    <div class="card-band"><div class="illus">${themeIllustration(theme, 52)}</div>
      <div><div class="card-kind">${kind}</div><h2>${esc(title)}</h2></div></div>
    <div class="card-body">${body}</div></div>`;
}

export function startGame(app, state, ui, { onExit, onEnd }) {
  app.onkeydown = null;
  ui.seenSeq ??= 0;
  ui.lastNote ??= [];
  let svg;
  let busy = false;
  let passing = false;
  let mapSel = {};

  const save = () => saveGame(state, ui);
  const player = () => currentPlayer(state);
  const cityName = (id) => (id === ESTATE ? 'Country Estate' : CITIES[id].name);

  // ---------- Layout ----------
  app.innerHTML = `<div class="game">
    <header class="topbar">
      <span class="brand" aria-hidden="true">Ports of Plague</span>
      <div class="date-banner" id="date"></div>
      <div class="timeline" id="timeline" aria-hidden="true"></div>
      <div class="turn-indicator" id="turn" aria-live="polite"></div>
      <span class="spacer"></span>
      <div class="tools">
        <button class="btn small" id="btn-rules">Rules <span class="key">R</span></button>
        <button class="btn small" id="btn-journal">Journal <span class="key">J</span></button>
        <button class="btn small" id="btn-mute" aria-pressed="${!isMuted()}">${isMuted() ? 'Sound off' : 'Sound on'} <span class="key">M</span></button>
        <button class="btn small" id="btn-music" aria-pressed="${isMusicOn()}">${isMusicOn() ? 'Music on' : 'Music off'} <span class="key">N</span></button>
        <button class="btn small ghost" id="btn-menu">Save &amp; menu</button>
      </div>
    </header>
    <div class="main">
      <div class="map-wrap"><div class="map-frame" id="map"></div></div>
      <aside class="sidebar" id="sidebar" aria-label="Game panel"></aside>
    </div>
  </div>`;
  svg = createMap($('#map', app), { onCity: (id) => { if (!busy && !passing) showCity(state, id); } });
  redrawStains(svg, state);
  const stopAmbient = startAmbient(svg, { ships: 7, carts: 3, stateRef: () => state });

  $('#btn-rules', app).onclick = () => showRules();
  $('#btn-journal', app).onclick = () => showJournal(state.journal);
  $('#btn-mute', app).onclick = toggleMute;
  $('#btn-music', app).onclick = toggleMusic;
  music.setMood('calm');
  $('#btn-menu', app).onclick = () => { save(); cleanup(); onExit(); };

  function toggleMute() {
    setMuted(!isMuted());
    const b = $('#btn-mute', app);
    b.setAttribute('aria-pressed', !isMuted());
    b.innerHTML = `${isMuted() ? 'Sound off' : 'Sound on'} <span class="key">M</span>`;
    toast(isMuted() ? 'Sound effects off' : 'Sound effects on', 1200);
  }
  function toggleMusic() {
    setMusicOn(!isMusicOn());
    const b = $('#btn-music', app);
    b.setAttribute('aria-pressed', isMusicOn());
    b.innerHTML = `${isMusicOn() ? 'Music on' : 'Music off'} <span class="key">N</span>`;
    toast(isMusicOn() ? 'Music on' : 'Music off', 1200);
  }

  const onKey = (e) => {
    if (dialogOpen() || passing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches?.('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); showRules(); return; }
    if (k === 'j') { e.preventDefault(); showJournal(state.journal); return; }
    if (k === 'm') { e.preventDefault(); toggleMute(); return; }
    if (k === 'n') { e.preventDefault(); toggleMusic(); return; }
    if (state.phase !== 'actions' || busy) return;
    const a = DATA.actions.find((x) => x.key === k);
    if (a) { e.preventDefault(); startAction(a.id); }
    if (k === 'e') { e.preventDefault(); tryEndTurn(); }
  };
  document.addEventListener('keydown', onKey);
  const cleanup = () => { document.removeEventListener('keydown', onKey); stopAmbient(); };

  // ---------- Rendering ----------
  function refresh() {
    const info = roundInfo(state);
    const phaseName = { roundStart: 'Prologue', chronicle: 'Chronicle', event: 'Event', actions: 'Actions', plague: 'Plague & upkeep', ended: 'Game over' }[state.phase];
    $('#date', app).innerHTML = info ? `${esc(info.label)} <small>${esc(info.months)} · Round ${roundNumber(state)} of ${totalRounds(state)} · ${phaseName}</small>` : `1346 <small>Prologue</small>`;
    // One circle per round: 12 half-years, or 6 whole years in Quick Play.
    const span = state.span ?? 1;
    $('#timeline', app).innerHTML = DATA.timeline.rounds.filter((r) => (r.round - 1) % span === 0).map((r) => {
      const last = DATA.timeline.rounds[r.round + span - 2] ?? r;
      const cls = r.round < state.round ? 'done' : r.round === state.round ? 'now' : '';
      const title = span > 1 ? `${r.label} – ${last.label}` : r.label;
      return `<span class="${cls}" title="${esc(title)}">${span > 1 ? '✦' : r.season === 'warm' ? '☀' : '❄'}</span>`;
    }).join('');
    const p = player();
    $('#turn', app).innerHTML = p ? `${crestSvg(p, 20)} ${esc(p.name)}'s turn` : esc(phaseName);
    updateMap(svg, state, mapSel);
    renderSidebar();
  }

  function renderSidebar() {
    const p = player();
    const sb = $('#sidebar', app);
    const parts = [];
    if (p) {
      const sc = scorePlayer(p);
      const apMax = Math.max(p.ap, actionPointsFor(state, p));
      const estate = familyAt(p, ESTATE);
      const total = Math.max(1, sc.total);
      parts.push(`<section class="panel house-panel" style="--house:${p.color}" aria-label="Current house">
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
        ${ledgerNotes(p)}
      </section>`);
      const hint = hintFor(p);
      if (hint) parts.push(`<div class="hint" role="note"><strong>Hint:</strong> ${hint}</div>`);
      const actionBtn = (a) => {
        const why = quickBlock(a.id, p);
        return `<button class="action-btn" data-action="${a.id}" ${why ? `disabled title="${esc(why)}"` : ''} aria-keyshortcuts="${a.key.toUpperCase()}">
          <span class="icon" aria-hidden="true">${ACTION_ICONS[a.id]}</span>
          <span><span class="name">${esc(a.name)}</span><span class="desc">${esc(why ?? a.short)}</span></span>
          <span><span class="key">${a.key.toUpperCase()}</span><br><small>${actionCostText(a.id, p)}</small></span></button>`;
      };
      parts.push(`<section class="panel actions-panel" aria-label="Actions"><h2>Actions</h2><div class="actions">
        ${DATA.actions.filter((a) => !a.group).map(actionBtn).join('')}
        <h3 class="ledger-head">Merchant's Ledger</h3>
        ${DATA.actions.filter((a) => a.group === 'ledger').map(actionBtn).join('')}
        <button class="btn primary" id="end-turn" aria-keyshortcuts="E">End turn <span class="key">E</span></button>
      </div></section>`);
    } else {
      parts.push(`<section class="panel"><h2>${state.phase === 'plague' ? 'The plague takes its toll' : 'The chronicle unfolds'}</h2><p>Read the cards as they appear. Players take turns in the order rolled at the start.</p></section>`);
    }
    if (ui.lastNote.length) parts.push(`<section class="panel note-panel" aria-label="Latest historical note"><h2>Latest Historical Note</h2>${noteHtml(ui.lastNote, 'From the chronicles')}</section>`);
    parts.push(`<section class="panel houses-panel" aria-label="All houses"><h2>Houses (turn order)</h2><div class="houses">
      ${state.order.map((id, i) => {
        const h = state.players[id];
        const sc = scorePlayer(h);
        return `<div class="house-row ${p && p.id === id ? 'current' : ''}" style="--house:${h.color}">${crestSvg(h, 20)}
          <span><strong>${i + 1}. ${esc(h.name)}</strong><br><small>${h.florins}ƒ · rep ${h.reputation} · family ${familyTotal(h)} · ${h.posts.length} post${h.posts.length > 1 ? 's' : ''}</small></span>
          <span title="Legacy score"><strong>${sc.total}</strong></span></div>`;
      }).join('')}</div></section>`);
    const recent = state.log.filter((e) => e.text && !['turn'].includes(e.type)).slice(-10).reverse();
    parts.push(`<section class="panel log-panel" aria-label="Chronicle log"><h2>Chronicle</h2><ol class="log" reversed>${recent.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ol></section>`);
    sb.innerHTML = parts.join('');
    $$('[data-action]', sb).forEach((b) => (b.onclick = () => startAction(b.dataset.action)));
    const end = $('#end-turn', sb);
    if (end) end.onclick = tryEndTurn;
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

  // Land, debt, partnership and closed gates: the Merchant's Ledger at a glance.
  function ledgerNotes(p) {
    const notes = [];
    if (p.land.length) notes.push(`🌾 Land: ${p.land.map((c) => esc(CITIES[c].name)).join(', ')} (+${p.land.length * C.scoring.pointsPerLand} Wealth, ${p.land.length * C.costs.landWage}ƒ wages each half-year)`);
    if (p.loan) notes.push(`📜 Debt: ${p.loan.owed}ƒ due ${esc(DATA.timeline.rounds[p.loan.due - 1].label)}`);
    if (p.deal) notes.push(`🤝 Partner: ${esc(dealPartner(state, p).name)} until ${esc(DATA.timeline.rounds[p.deal.until - 1].label)}`);
    if (p.gates) notes.push(`⛨ Gates closed: ${esc(CITIES[p.gates.city].name)} until ${esc(DATA.timeline.rounds[p.gates.until - 1].label)}`);
    return notes.length ? `<div class="ledger-status">${notes.join('<br>')}</div>` : '';
  }

  function actionCostText(id, p) {
    return {
      ship: '1 AP', post: p.free.post ? 'free' : `1 AP · ${cost(state, 'openPost', p)}ƒ`, move: p.free.move || p.free.moveNoPenalty ? 'free' : '1 AP',
      prepare: p.free.prepare ? 'free' : `1 AP · ${cost(state, 'prepareHousehold')}ƒ`, physician: p.free.physician ? 'free' : `1 AP · ${cost(state, 'physician')}ƒ`,
      charity: `1 AP · ${charityCost(state, p)}ƒ`,
      marry: `1 AP · ${cost(state, 'marriage')}ƒ`, land: `1 AP · ${cost(state, 'buyLand')}ƒ`, loan: 'no AP', deal: 'no AP',
      gates: `1 AP · −${C.penalties.gatesReputation} rep`,
    }[id];
  }

  // A quick reason why an action is impossible right now (full checks run later).
  function quickBlock(id, p) {
    if (busy) return 'Please wait…';
    if (p.pending.length) return 'Answer the card first.';
    const free = NO_AP_ACTIONS.includes(id) || (id === 'move' && (p.free.move || p.free.moveNoPenalty)) || (id === 'prepare' && p.free.prepare) || (id === 'post' && p.free.post) || (id === 'physician' && p.free.physician);
    if (p.ap < 1 && !free) return 'No action points left.';
    if (id === 'ship' && !p.posts.some((c) => routesFrom(c).some((r) => !checkAction(state, { type: 'ship', from: c, route: r.id })))) return 'All your posts have shipped this round.';
    if (id === 'post' && !p.free.post && p.florins < cost(state, 'openPost', p)) return `Needs ${cost(state, 'openPost', p)}ƒ.`;
    if (id === 'post' && p.posts.length >= C.limits.maxPosts) return 'Maximum number of posts.';
    if (id === 'post' && !legalPosts(state, p).length) return 'No connected city can take a new post right now.';
    if (id === 'charity') return checkAction(state, { type: 'charity', kind: 'church' });
    if ((id === 'prepare' || id === 'physician') && !familyLocations(p).some((l) => l !== ESTATE && !checkAction(state, { type: id, city: l }))) {
      return familyLocations(p).every((l) => l === ESTATE) ? 'All your family is at the estate.' : `Not possible right now (cost ${id === 'prepare' ? cost(state, 'prepareHousehold') : cost(state, 'physician')}ƒ, once per city).`;
    }
    if ((id === 'marry' || id === 'land') && !p.posts.some((c) => isAftermath(state, c))) return 'Opens when one of your cities reaches Aftermath.';
    if (id === 'marry' || id === 'land' || id === 'gates') return firstReason(p.posts.map((c) => ({ type: id, city: c })));
    if (id === 'loan') return checkAction(state, { type: 'loan' });
    if (id === 'deal') return firstReason(state.players.filter((o) => o !== p).map((o) => ({ type: 'deal', partner: o.id })));
    return null;
  }

  // null if any of the actions is possible, otherwise the most useful reason why not.
  function firstReason(actions) {
    const reasons = actions.map((a) => checkAction(state, a));
    if (reasons.some((r) => !r)) return null;
    return reasons.find((r) => !/^Choose/.test(r)) ?? reasons[0] ?? 'Not possible right now.';
  }

  function hintFor(p) {
    const on = ui.hints && (state.round === 1 || state.difficulty === 'apprentice');
    if (!on) return null;
    if (p.pending.length) return 'A card needs your decision first.';
    const danger = familyLocations(p).find((l) => l !== ESTATE && (isStricken(state, l) || isThreatened(state, l)));
    if (p.ap === 0) return 'You are out of action points. Press <span class="key">E</span> to end your turn and pass the device.';
    if (danger && isStricken(state, danger)) return `Your family in ${esc(CITIES[danger].name)} is in a Stricken city. They will roll for survival at the end of the round. Consider <span class="key">3</span> Move Family (fleeing costs ${C.penalties.fleeReputation} reputation) or <span class="key">4</span> Prepare Household.`;
    if (danger) return `${esc(CITIES[danger].name)} is next to a Stricken city (spinning orange ring). The plague may arrive soon.`;
    if (p.shipped.length === 0) return `Start with <span class="key">1</span> Ship Goods: pick a route from one of your trading posts. Sea routes pay more. Roll a ${C.fortune.drawOnProfitDie} on the profit die and you draw a Fortune card!`;
    if (p.posts.length < 2 && p.florins >= cost(state, 'openPost', p)) return `A second trading post (<span class="key">2</span>, ${cost(state, 'openPost', p)}ƒ) lets you ship from two places, and opening it draws a Fortune card.`;
    const after = p.posts.find((c) => isAftermath(state, c));
    if (after && !p.land.length && familyTotal(p) < C.start.family) return `${esc(CITIES[after].name)} is in Aftermath: you can now <span class="key">7</span> Arrange a Marriage or <span class="key">8</span> Buy Abandoned Land there.`;
    return 'Tip: click any city on the map to read its history. Your weakest Legacy category counts twice, so keep all three healthy.';
  }

  // ---------- Presenting engine log entries ----------
  async function presentNew() {
    while (true) {
      const next = state.log.find((e) => e.seq > ui.seenSeq);
      if (!next) return;
      const idx = state.log.indexOf(next);
      if (next.type === 'prologue') {
        await showPrologue(next);
        markSeen(next.seq);
      } else if (next.type === 'orderRoll') {
        await showTurnOrder(next);
        markSeen(next.seq);
      } else if (next.type === 'round') {
        const group = [next];
        for (let i = idx + 1; i < state.log.length && ['arrival', 'arrivalAlready'].includes(state.log[i].type); i++) group.push(state.log[i]);
        await showRoundStart(group);
        markSeen(group.at(-1).seq);
      } else if (next.type === 'card') {
        const group = [next];
        for (let i = idx + 1; i < state.log.length && state.log[i].type === 'effect'; i++) group.push(state.log[i]);
        await showCard(group);
        markSeen(group.at(-1).seq);
      } else if (next.type === 'plague') {
        // All plague phases of this round (two in Quick Play) are shown together.
        const group = [];
        let i = idx;
        while (i < state.log.length && ['plague', 'mortality', 'aftermath', 'upkeep', 'loanRepaid', 'loanDefault', 'dealEnd', 'gatesOpen'].includes(state.log[i].type)) group.push(state.log[i++]);
        await showPlague(group);
        markSeen(group.at(-1).seq);
      } else if (next.type === 'fortune') {
        await showFortune(next);
        markSeen(next.seq);
      } else {
        markSeen(next.seq);
      }
    }
  }
  function markSeen(seq) { ui.seenSeq = Math.max(ui.seenSeq, seq); save(); }
  function setNote(ids) { if (ids?.length) ui.lastNote = [...new Set(ids)].slice(0, 3); }

  async function showPrologue(e) {
    refresh();
    sfx.bell();
    await openDialog(`<div class="frame">${cardHtml({ theme: 'trade', kind: 'Prologue · 1346', title: 'The Siege of Caffa', body: `
      <p class="drop-cap">${esc(e.text)} The game begins in the second half of 1347, as Italian ships carry the sickness west. ${state.mode === 'quick' ? 'In Quick Play each round is a whole year.' : 'Each round is half a year.'} The plague will reach each city on the map when it really did, unless your ships bring it sooner.</p>
      ${noteHtml(e.factIds)}` })}
      ${ui.hints ? `<section class="hint" style="margin-top:1rem"><strong>How to play in one minute</strong><ol style="margin:0.3rem 0 0;padding-left:1.2rem">
        <li><strong>Each round</strong>, the plague reaches new cities (the dates are real), and Chronicle and Event cards are read aloud.</li>
        <li><strong>On your turn</strong> you have ${modeOf(state).actionPoints} action points. Press <span class="key">1</span> Ship Goods to earn florins; sea routes pay more, but cargo from a Stricken city may be infected.</li>
        <li><strong>Fortune cards:</strong> roll a ${C.fortune.drawOnProfitDie} when shipping, or open a new trading post, and you draw a personal Fortune card.</li>
        <li><strong>Protect your family:</strong> family in a Stricken city rolls for survival at the end of the round. Move them away (<span class="key">3</span>) or prepare your household (<span class="key">4</span>).</li>
        <li><strong>Win</strong> with the highest Legacy in 1353: Wealth + Family + Reputation, plus your weakest one again. Balance beats greed.</li>
      </ol></section>` : ''}
      <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Roll for turn order</button></div></div>`, { dismissable: false, label: 'Prologue' });
    setNote(e.factIds);
  }

  // Each house rolls a die; the highest goes first (ties roll again).
  async function showTurnOrder(e) {
    sfx.bell();
    const players = state.players;
    const rows = e.rolls.map((round, r) => `<div style="margin-top:0.6rem"><div class="card-kind" style="color:var(--gold)">${r === 0 ? 'Every house rolls' : 'Tie! These houses roll again'}</div>
      <div class="dice-tray"><div class="dice-row">${round.map((x) => `<div class="die-wrap" style="color:#fbe9c0">${dieHtml(x.die, { gold: true })}<div>${crestSvg(players[x.player], 16)} ${esc(players[x.player].name)}</div></div>`).join('')}</div></div></div>`).join('');
    const order = e.order.map((id, i) => `<div class="order-card ${i === 0 ? 'winner' : ''}" style="--house:${players[id].color}"><div class="place">${['1st', '2nd', '3rd', '4th', '5th', '6th'][i]}</div>
      <div class="order-banner">${heraldicBanner(players[id].color, players[id].crest)}</div><div class="nm">${esc(players[id].name)}</div><small>${esc(CITIES[players[id].home].name)}</small></div>`).join('');
    await openDialog(`<div class="frame"><h2 style="text-align:center">Rolling for Turn Order</h2>
      <p style="text-align:center">The highest roll goes first; tied houses roll again. <strong>This order stays the same for the whole game.</strong></p>
      <div id="order-rolls">${rows}</div>
      <div class="order-grid" id="order-result" style="visibility:hidden">${order}</div>
      <div class="dialog-actions"><button class="btn primary" data-value="ok" id="order-go" autofocus>Begin the year 1347</button></div></div>`,
      { dismissable: false, wide: true, label: 'Turn order', onMount: async (d) => {
        for (const tray of d.querySelectorAll('.dice-tray')) await rollDice(tray, 1000);
        d.querySelector('#order-result').style.visibility = 'visible';
        sfx.fanfare();
      } });
  }


  // ---------- Severity roll explanations ----------
  function severityBands() {
    const bands = {};
    for (const [die, sev] of Object.entries(C.plague.severityTable)) (bands[sev] ||= []).push(Number(die));
    return Object.entries(bands).map(([sev, dice]) => `${dice[0]}–${dice.at(-1)} ${severityName(Number(sev))}`).join(', ');
  }
  function severityModsText() {
    const d = difficultyOf(state).severityMod;
    const diffTxt = d ? ` On ${difficultyOf(state).label} difficulty every roll counts ${d > 0 ? '1 higher' : '1 lower'}.` : '';
    return ` Hard-hit Tuscany and Catalonia add 1; Flanders subtracts 1.${diffTxt}`;
  }
  function severityCaption(a) {
    const base = C.plague.severityTable[String(a.die)];
    const mods = [];
    const cm = CITIES[a.city].severityMod ?? 0;
    const dm = difficultyOf(state).severityMod ?? 0;
    if (cm) mods.push(`${cm > 0 ? '+' : ''}${cm} ${cm > 0 ? 'hard-hit region' : 'lighter region'}`);
    if (dm) mods.push(`${dm > 0 ? '+' : ''}${dm} difficulty`);
    const pips = '●'.repeat(a.severity);
    return `Severity roll: ${a.die}${mods.length && base !== a.severity ? ` (${mods.join(', ')})` : ''} → <strong>${esc(severityName(a.severity))}</strong> <span class="sev-pips" aria-label="${a.severity} of 3">${pips}</span>`;
  }
  function arrivalRow(a, i) {
    const city = CITIES[a.city];
    if (a.type !== 'arrival') {
      return `<div class="choice arrival-row"><span><strong class="arr-city">${esc(city.name)}</strong><span class="sub">${esc(a.text)}</span></span><span>—</span></div>`;
    }
    return `<div class="choice arrival-row">
      <span><strong class="arr-city">${esc(city.name)}</strong><span class="sub">${a.early ? 'Brought early by infected cargo. ' : ''}Historically: ${esc(city.arrival.dateText)}</span></span>
      <span class="sev-roll">${dieHtml(a.die, { red: true, small: true, id: `sev-${i}` })}<span class="sev-caption">${severityCaption(a)}</span></span></div>`;
  }

  async function showRoundStart(group) {
    const [head, ...arrivals] = group;
    const info = roundInfo(state);
    refresh();
    sfx.bell();
    setTimeout(() => sfx.stamp(), 250);
    if (arrivals.length) setTimeout(() => sfx.plague(), 900);
    const halfInfo = DATA.timeline.rounds[state.round - 1];
    const years = state.round === state.roundEnd ? halfInfo.label : info.label;
    const arrHtml = arrivals.length
      ? `<h3>The plague arrives</h3>
        <p class="sev-explain">🎲 Each newly struck city rolls the red <strong>severity die</strong> to see how badly the plague hits it: ${severityBands()}.${severityModsText()}</p>
        <div class="dice-tray"><div class="choice-list" style="margin:0">${arrivals.map((a, i) => arrivalRow(a, i)).join('')}</div></div>`
      : '<p>No new cities are struck this time.</p>';
    await openDialog(`<div class="frame">
      <div class="round-banner"><div class="card-kind" style="color:var(--gold)">Round ${roundNumber(state)} of ${totalRounds(state)}</div>
        <div class="year">${esc(years)}</div><div><em>${esc(info.months)}</em> <span class="season" aria-hidden="true">${halfInfo.season === 'warm' ? '☀' : '❄'}</span></div>
        <p>${esc(info.headline)}</p></div>
      ${arrHtml}
      ${noteHtml([...head.factIds, ...arrivals.flatMap((a) => a.factIds)])}
      <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`,
      { dismissable: false, label: info.label, onMount: (d) => { rollDice(d, 800); } });
    for (const a of arrivals) if (a.type === 'arrival') animateStrike(svg, a.city);
    setNote(head.factIds);
    refresh();
  }

  async function showCard(group) {
    const [e, ...effects] = group;
    const card = cardById(e.card);
    const kind = e.deck === 'chronicle' ? `Chronicle · ${DATA.timeline.rounds[(card.round ?? state.round) - 1].label}` : 'Event card';
    const effectTxt = effects.map((x) => `<li>${esc(x.text)}</li>`).join('');
    const decisionHint = ['offer', 'persecution', 'wageLaw'].includes(card.effect.type)
      ? `<p><strong>Each house decides at the start of its own turn.</strong></p>` : '';
    if (card.theme === 'persecution') sfx.knell(); else sfx.page();
    await openDialog(`<div class="frame">${cardHtml({ theme: card.theme, kind: `${esc(kind)} · ${esc(THEME_COLORS[card.theme]?.label ?? card.theme)}`, title: card.title, body: `
        <p>${esc(card.text)}</p>${effectTxt ? `<ul>${effectTxt}</ul>` : ''}${decisionHint}${noteHtml(card.factIds)}` })}
      <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`, { dismissable: false, label: card.title });
    setNote(card.factIds);
    refresh();
  }

  async function showFortune(e) {
    const card = fortuneById(e.card);
    const p = state.players[e.player];
    const tone = { good: 'Good fortune', bad: 'Misfortune', choice: 'A choice' }[card.tone];
    if (card.tone === 'bad') sfx.misfortune(); else sfx.fortune();
    let extra = '';
    if (e.cities?.length) extra = `<p><strong>Warning:</strong> ${e.cities.map((c) => esc(CITIES[c].name)).join(', ')}.</p>`;
    if (e.die) extra += `<div class="dice-tray"><div class="dice-row">${dieHtml(e.die, { red: true, label: `Survival roll (dies on ${e.severity} or less)` })}</div></div>`;
    await openDialog(`<div class="frame">${cardHtml({ theme: 'fortune', extraClass: 'fortune', kind: `Fortune card · ${esc(p.name)} ${esc(e.reason)} · <span class="tone">${tone}</span>`, title: card.title, body: `
        <p>${esc(card.text)}</p>${e.result ? `<p><strong>${esc(e.result)}</strong></p>` : ''}${extra}${card.effect.type === 'offer' ? '<p><em>You will choose next.</em></p>' : ''}${noteHtml(card.factIds)}` })}
      <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`,
      { dismissable: false, label: `Fortune card: ${card.title}`, onMount: (d) => rollDice(d, 700) });
    setNote(card.factIds);
    refresh();
  }

  async function showPlague(group) {
    refresh();
    music.setMood('plague');
    if (group.some((e) => e.deaths > 0)) setTimeout(() => sfx.knell(), 1000); else sfx.low();
    let body = '';
    let anyDeaths = false;
    group.forEach((e, i) => {
      if (e.type === 'plague') {
        if (state.span > 1) body += `<h3 style="margin-top:0.8rem">${esc(DATA.timeline.rounds[e.half - 1].label)}</h3>`;
        return;
      }
      if (e.type === 'aftermath') { body += `<p style="margin:0.3rem 0">❦ ${esc(e.text)}</p>`; return; }
      if (e.type !== 'mortality') { body += `<p style="margin:0.3rem 0">📜 ${esc(e.text)}</p>`; return; }
      anyDeaths ||= e.deaths > 0;
      const p = state.players[e.player];
      const bonus = e.prepared ? C.plague.prepareBonus : 0;
      const dice = e.rolls.map((r, j) => {
        const outcome = r.dies ? 'died' : r.lastHeir ? 'last heir' : r.save >= C.plague.physicianSaveOn ? 'nursed back' : 'lived';
        const math = bonus ? `${r.die} + ${bonus} = ${r.total}` : `rolled ${r.die}`;
        return `<div class="die-wrap">${dieHtml(r.die, { small: true, red: r.dies, id: `m-${i}-${j}` })}<div class="die-math">${math}</div><div class="${r.dies ? 'outcome-dead' : 'outcome-safe'}">${outcome}</div></div>`;
      }).join('');
      body += `<div class="dice-tray"><div style="color:#fbe9c0">${crestSvg(p, 18)} <strong>${esc(p.name)}</strong> in ${esc(CITIES[e.city].name)} (${esc(severityName(e.severity))}): a family member dies if the result is <strong>${e.severity} or less</strong>${bonus ? ` (each roll gets +${bonus} for a prepared household)` : ''}.</div>
        <div class="dice-row" style="justify-content:flex-start;margin-top:0.4rem">${dice}</div><div style="color:#fbe9c0;margin-top:0.3rem">${esc(e.text)}</div></div>`;
    });
    if (!group.some((e) => e.type === 'mortality')) body += '<p>No family members were in Stricken cities this round.</p>';
    const lastRound = state.roundEnd >= C.rounds;
    await openDialog(`<div class="frame"><h2>The Plague Takes Its Toll: ${esc(roundInfo(state).label)}</h2>
      <p>Every family member in a Stricken city rolls the mortality die.</p>
      ${body}
      ${anyDeaths ? noteHtml(['EC-10', 'DB-01'], 'Historical Note') : ''}
      <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>${lastRound ? 'Final scoring' : 'Begin the next round'}</button></div></div>`,
      { dismissable: false, wide: true, label: 'Plague results', onMount: (d) => rollDice(d, 900) });
    music.setMood('calm');
    redrawStains(svg, state);
    refresh();
  }

  // ---------- Pass the device ----------
  function passDevice() {
    const p = player();
    passing = true;
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'pass';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'pass-title');
      sfx.fanfare();
      el.innerHTML = `<div><div class="pass-banner">${heraldicBanner(p.color, p.crest)}</div>
        <h2 id="pass-title">Pass the device to ${esc(p.name)}</h2>
        <p>${esc(roundInfo(state).label)}. ${esc(p.name)} of ${esc(CITIES[p.home].name)}: take the device, then start your turn.${state.guildFavor === p.id ? ' You receive Guild’s Favor this round: +1 action point.' : ''}</p>
        <button class="btn gold" id="pass-go">I am ${esc(p.name)}: start my turn <span class="key">Enter</span></button></div>`;
      document.body.appendChild(el);
      const btn = el.querySelector('#pass-go');
      btn.focus();
      const go = () => { passing = false; el.remove(); announce(`${p.name}'s turn`); resolve(); };
      btn.onclick = go;
      el.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); btn.focus(); } });
    });
  }

  // ---------- Turn start: decisions ----------
  async function beginPlayerTurn() {
    refresh();
    const p = player();
    await answerPending(p);
    refresh();
    $('#sidebar [data-action="ship"]:not(:disabled), #end-turn', app)?.focus();
  }

  async function answerPending(p) {
    while (p.pending.length) {
      await askDecision(p, p.pending[0]);
      refresh();
    }
  }

  async function askDecision(p, d) {
    if (d.kind === 'deal') return askDeal(p, d);
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
    const html = `<div class="frame">${cardHtml({ theme, extraClass: isFortune ? 'fortune' : '', kind: `Decision for ${esc(p.name)}`, title: card.title, body: body + noteHtml(card.factIds) })}
      <div class="dialog-actions">${buttons}</div></div>`;
    const v = await openDialog(html, { dismissable: false, label: `Decision: ${card.title}` });
    const choice = d.kind === 'wageLaw' ? v : v === 'yes';
    const r = decide(state, choice);
    if (!r.ok) { toast(r.reason); return; }
    save();
    markSeen(r.entry.seq);
    if (d.kind === 'wageLaw' && choice === 'pay') {
      await openDialog(`<div class="frame"><h2>Wage inspection</h2><div class="dice-tray"><div class="dice-row">${dieHtml(r.entry.die, { label: 'Inspection die' })}</div></div><p>${esc(r.entry.text)}</p>
        <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`, { label: 'Wage inspection', onMount: (dd) => rollDice(dd) });
    } else if (d.reveal && choice) {
      await openDialog(`<div class="frame"><h2>${esc(card.title)}</h2><p>${esc(r.entry.text)}</p>${noteHtml(card.factIds)}
        <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`, { label: card.title });
    } else {
      toast(r.entry.text, 4000);
    }
    if (choice && d.kind !== 'wageLaw') sfx.coin();
    setNote(card.factIds);
  }

  async function askDeal(p, d) {
    const from = state.players[d.from];
    const why = canAccept(state, p, d);
    const shared = from.posts.filter((c) => p.posts.some((x) => x === c || neighbors(x).includes(c)));
    const html = `<div class="frame">${cardHtml({ theme: 'trade', kind: `Decision for ${esc(p.name)}`, title: `A Partnership with ${from.name}`, body: `
      <p>${crestSvg(from, 18)} <strong>${esc(from.name)}</strong> of ${esc(CITIES[from.home].name)} proposes a partnership until the end of next round.</p>
      <p>When either house ships to a city where the other has a trading post, <strong>both earn ${C.gains.dealBonus}ƒ more</strong>. Their posts: ${from.posts.map((c) => esc(CITIES[c].name)).join(', ')}.${shared.length ? ` Your routes reach ${shared.map((c) => esc(CITIES[c].name)).join(', ')}.` : ''}</p>
      ${noteHtml(['TR-04'])}` })}
      <div class="dialog-actions"><button class="btn primary" data-value="yes" ${why ? 'disabled' : ''}>Accept the partnership</button><button class="btn" data-value="no">Decline</button>${why ? `<p class="error">${esc(why)}</p>` : ''}</div></div>`;
    const v = await openDialog(html, { dismissable: false, label: `Partnership offer from ${from.name}` });
    const r = decide(state, v === 'yes');
    if (!r.ok) { toast(r.reason); return; }
    save();
    markSeen(r.entry.seq);
    if (v === 'yes') sfx.coin();
    toast(r.entry.text, 4500);
    setNote(['TR-04']);
  }

  // ---------- Actions ----------
  async function startAction(id) {
    const p = player();
    if (!p || busy || passing) return;
    const why = quickBlock(id, p);
    if (why) { sfx.error(); toast(why); return; }
    busy = true;
    try {
      const action = await chooseAction(id, p);
      if (!action) return;
      const reason = checkAction(state, action);
      if (reason) { sfx.error(); toast(reason, 4500); return; }
      const res = performAction(state, action);
      if (!res.ok) { toast(res.reason, 4500); return; }
      save();
      await showActionResult(res.entry, p);
      markSeen(res.entry.seq);
      await presentNew(); // Fortune cards drawn by this action
      await answerPending(p); // Fortune offers must be answered straight away
    } finally {
      busy = false;
      mapSel = {};
      refresh();
      if (p.ap === 0) $('#end-turn', app)?.focus();
    }
  }

  function choiceBtn(value, main, sub, why, attrs = '') {
    return `<button class="choice" data-value="${esc(value)}" ${why ? 'disabled' : ''} ${attrs}><span>${main}${sub ? `<span class="sub">${sub}</span>` : ''}${why ? `<span class="why">${esc(why)}</span>` : ''}</span><span aria-hidden="true">${why ? '✕' : '→'}</span></button>`;
  }

  async function chooseAction(id, p) {
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
      const v = await openDialog(`<div class="frame"><h2>⚓ Ship Goods</h2><p>Choose a route from one of your trading posts. Earnings = route value + profit die${p.posts.some((c) => familyAt(p, c)) ? ' + family bonus where your family lives' : ''}. A profit die of ${C.fortune.drawOnProfitDie} draws a Fortune card.</p>
        <div class="choice-list">${items.map((x) => x.html).join('')}</div>${anyOffshore ? noteHtml(['ME-12', 'ME-14']) : ''}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel <span class="key">Esc</span></button></div></div>`,
        { label: 'Ship Goods', onMount: (d) => hoverRoutes(d), side: true });
      if (!v) return null;
      const [from, route, held] = v.split('|');
      return held ? { type: 'ship', from, route, offshore: true } : { type: 'ship', from, route };
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
      mapSel = { selectable: new Set(items.filter((x) => !x.why).map((x) => x.id)) };
      updateMap(svg, state, mapSel);
      const v = await openDialog(`<div class="frame"><h2>🏛 Open Trading Post (${p.free.post ? 'free' : cost(state, 'openPost', p) + 'ƒ'})</h2><p>Choose a city connected by a route to one of your posts (glowing on the map). New posts let you ship from more places, and opening one draws a Fortune card.</p>
        <div class="choice-list">${items.map((x) => x.html).join('') || '<p>No connected cities.</p>'}</div>
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`, { label: 'Open Trading Post', side: true });
      return v ? { type: 'post', city: v } : null;
    }
    if (id === 'move') return chooseMove(p);
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
      const v = await openDialog(`<div class="frame"><h2>${title}</h2><p>${explain}</p><div class="choice-list">${items.join('')}</div>
        ${noteHtml(DATA.actions.find((a) => a.id === id).factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`, { label: title, side: true });
      return v ? { type: id, city: v } : null;
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
      mapSel = { selectable: new Set(items.filter((x) => !x.why).map((x) => x.id)) };
      updateMap(svg, state, mapSel);
      const v = await openDialog(`<div class="frame"><h2>${info.title}</h2><p>${info.explain}</p><div class="choice-list">${items.map((x) => x.html).join('')}</div>
        ${noteHtml(DATA.actions.find((a) => a.id === id).factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`, { label: info.title, side: true });
      return v ? { type: id, city: v } : null;
    }
    if (id === 'loan') {
      const due = DATA.timeline.rounds[untilRound(state, 2) - 1].label;
      const v = await openDialog(`<div class="frame"><h2>📜 Take a Loan</h2>
        <p>Florence's great banks had collapsed just before the plague, so lenders were careful. A banker will lend you <strong>${C.gains.loan}ƒ</strong> now. You must repay <strong>${C.costs.loanRepay}ƒ</strong> in the plague phase of the next round (${esc(due)}).</p>
        <p>If you cannot pay in full, you pay everything you have and lose <strong>${C.penalties.loanDefaultReputation} reputation</strong>. Taking a loan costs no action point.</p>
        ${noteHtml(DATA.actions.find((a) => a.id === 'loan').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button><button class="btn primary" data-value="go" autofocus>Borrow ${C.gains.loan}ƒ</button></div></div>`, { label: 'Take a Loan', side: true });
      return v === 'go' ? { type: 'loan' } : null;
    }
    if (id === 'deal') {
      const items = state.players.filter((o) => o !== p).map((o) => {
        const why = checkAction(state, { type: 'deal', partner: o.id });
        return choiceBtn(String(o.id), `${crestSvg(o, 16)} ${esc(o.name)}`, `Posts: ${o.posts.map((c) => esc(CITIES[c].name)).join(', ')}`, why);
      });
      const v = await openDialog(`<div class="frame"><h2>🤝 Propose a Partnership</h2>
        <p>Merchant ships linked the Italian cities with the Hanseatic League of the north. Offer another house a partnership until the end of next round: when either of you ships to a city where the other has a trading post, <strong>both earn ${C.gains.dealBonus}ƒ more</strong>.</p>
        <p>They will accept or decline at the start of their next turn. Proposing costs no action point.</p>
        <div class="choice-list">${items.join('')}</div>${noteHtml(DATA.actions.find((a) => a.id === 'deal').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`, { label: 'Propose a Partnership', side: true });
      return v ? { type: 'deal', partner: Number(v) } : null;
    }
    if (id === 'charity') {
      const price = charityCost(state, p);
      const gain = Math.max(1, C.gains.charityReputation + state.effects.charityBonus);
      const items = Object.entries(CHARITY_KINDS).map(([k, c]) => choiceBtn(k, esc(c.label), `${price}ƒ → +${gain} reputation`, checkAction(state, { type: 'charity', kind: k })));
      const v = await openDialog(`<div class="frame"><h2>✝ Charity &amp; Piety</h2><p>Support your city in its hour of need.${lastPlaceId(state) === p.id ? ' (Your house is in last place, so it costs 1ƒ less.)' : ''}</p>
        <div class="choice-list">${items.join('')}</div>${noteHtml(DATA.actions.find((a) => a.id === 'charity').factIds)}
        <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button></div></div>`, { label: 'Charity and Piety', side: true });
      return v ? { type: 'charity', kind: v } : null;
    }
    return null;
  }

  function hoverRoutes(d) {
    const show = (el) => {
      const r = el?.closest('[data-route]')?.dataset.route;
      updateMap(svg, state, { highlightRoutes: r ? [r] : [] });
    };
    d.addEventListener('mouseover', (e) => show(e.target));
    d.addEventListener('focusin', (e) => show(e.target));
  }

  function chooseMove(p) {
    const froms = familyLocations(p);
    const places = [ESTATE, ...p.posts];
    let sel = { from: froms[0], to: places.find((x) => x !== froms[0]), count: 1 };
    const noPenalty = !!p.free.moveNoPenalty;
    return openDialog(`<div class="frame"><h2>🐎 Move Family ${p.free.move || noPenalty ? '(free this time)' : ''}</h2>
      <p>Family can live in any city where you have a trading post, or at your Country Estate in the countryside (safe from the plague, but it earns no family bonus). Leaving a <strong>Stricken</strong> city is fleeing and costs ${noPenalty ? 'no reputation this time (Fortune card)' : `${C.penalties.fleeReputation} reputation`}.</p>
      <div class="field"><label for="mv-from">From</label><select id="mv-from">${froms.map((l) => `<option value="${l}">${esc(cityName(l))} (${familyAt(p, l)} family${l !== ESTATE && isStricken(state, l) ? ', Stricken' : ''})</option>`).join('')}</select></div>
      <div class="field"><label for="mv-to">To</label><select id="mv-to">${places.map((l) => `<option value="${l}">${esc(cityName(l))}${l !== ESTATE && isStricken(state, l) ? ' (Stricken!)' : l !== ESTATE && isThreatened(state, l) ? ' (threatened)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="mv-count">How many</label><select id="mv-count">${Array.from({ length: C.limits.moveFamilyMax }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
      <p id="mv-why" class="error" role="alert"></p>
      ${noteHtml(['SO-04'])}
      <div class="dialog-actions"><button class="btn ghost" data-value="">Cancel</button><button class="btn primary" id="mv-go">Move</button></div></div>`,
      {
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
      }).then((v) => (v === 'go' ? { type: 'move', ...sel } : null));
  }

  async function showActionResult(e, p) {
    setNote(e.factIds);
    if (e.type === 'ship') {
      refresh();
      if (DATA.routes.find((r) => r.id === e.route)?.type === 'sea') sfx.sail(); else sfx.cart();
      await animateShipment(svg, e.route, e.from, p.color, e.infected);
      floatText(svg, e.to, `+${e.profit}ƒ`, 'gain');
      if (e.infected) floatText(svg, e.from, 'Infected!', 'loss');
      const parts = e.parts.map((x) => `<li>${esc(x.label)}: ${x.value >= 0 ? '+' : ''}${x.value}</li>`).join('');
      const infectedNote = e.infected && e.offshore ? `<p class="risk">Infected cargo! Profit halved. The ship waited offshore, so the sickness showed before anyone landed: no reputation lost and the plague does not spread.</p>`
        : e.infected ? `<p class="risk">Infected cargo! Profit halved and −${C.penalties.infectedCargoReputation} reputation. ${e.spread === 'early' ? `The plague reaches ${esc(cityName(e.to))} earlier than it really did.` : e.spread === 'worse' ? `The plague in ${esc(cityName(e.to))} grows worse.` : 'The infection dies out this time.'}</p>` : '';
      if (e.infected) sfx.plague(); else sfx.coin();
      await openDialog(`<div class="frame"><h2>${esc(cityName(e.from))} → ${esc(cityName(e.to))}</h2>
        <div class="dice-tray"><div class="dice-row">${dieHtml(e.profitDie, { gold: e.profitDie === C.fortune.drawOnProfitDie, label: e.profitDie === C.fortune.drawOnProfitDie ? 'Profit die: Fortune!' : 'Profit die' })}${e.contagionDie !== null ? dieHtml(e.contagionDie, { red: true, label: `Contagion die (infected on ≤${e.contagionRisk})` }) : ''}</div></div>
        <ul>${parts}<li>Profit die: +${e.profitDie}</li></ul>
        <p style="font-size:1.25rem">${coinIcon(24)} Earned <strong>${e.profit}ƒ</strong>.${e.offshore ? ` <small>(Offshore wait: ${e.fee}ƒ paid.)</small>` : ''}</p>${infectedNote}
        ${e.partner != null ? `<p>🤝 Your partner ${esc(state.players[e.partner].name)} also earns ${C.gains.dealBonus}ƒ.</p>` : ''}
        ${e.infected || e.offshore ? noteHtml(e.factIds) : ''}
        <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`,
        { label: 'Shipment result', onMount: (d) => rollDice(d, 800) });
      if (e.spread === 'early') {
        animateStrike(svg, e.to);
        const arrival = state.log.find((x) => x.type === 'arrival' && x.city === e.to && x.early);
        if (arrival) await openDialog(`<div class="frame"><h2>The plague spreads by trade</h2><p>${esc(arrival.text)}</p>
          <div class="dice-tray"><div class="choice-list" style="margin:0">${arrivalRow(arrival, 0)}</div></div>${noteHtml(arrival.factIds)}
          <div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`, { label: 'Plague spreads' });
      }
      return;
    }
    if (e.type === 'physician') {
      const remedy = DATA.remedies.find((r) => r.id === e.remedy);
      await openDialog(`<div class="frame">${cardHtml({ theme: 'medical', kind: 'Remedy of the time', title: remedy.name, body: `<p>${esc(remedy.text)}</p>
        <p><strong>It will not cure the plague.</strong> Only nursing care might help a little: if a family member in ${esc(cityName(e.city))} would die this round, they get one more roll and survive on a ${C.plague.physicianSaveOn}.</p>
        ${noteHtml(e.factIds)}` })}<div class="dialog-actions"><button class="btn primary" data-value="ok" autofocus>Continue</button></div></div>`, { label: 'Physician' });
      return;
    }
    if (e.type === 'post') floatText(svg, e.city, 'New post!', 'gain');
    if (e.type === 'charity') floatText(svg, p.home, '+rep', 'gain');
    if (e.type === 'marry') floatText(svg, e.city, '+1 family', 'gain');
    if (e.type === 'land') floatText(svg, e.city, 'Land!', 'gain');
    if (e.type === 'loan') floatText(svg, p.home, `+${C.gains.loan}ƒ`, 'gain');
    if (e.type === 'gates') floatText(svg, e.city, 'Gates closed', 'loss');
    sfx.coin();
    toast(e.text, 4200);
  }

  async function tryEndTurn() {
    const p = player();
    if (!p || busy || passing) return;
    if (p.pending.length) { toast('Answer the card first.'); return; }
    if (p.ap > 0) {
      const v = await openDialog(`<div class="frame"><h2>End your turn?</h2><p>You still have ${p.ap} action point${p.ap > 1 ? 's' : ''}. Unused points are lost.</p>
        <div class="dialog-actions"><button class="btn" data-value="">Keep playing</button><button class="btn primary" data-value="end" autofocus>End turn</button></div></div>`, { label: 'End turn?' });
      if (v !== 'end') return;
    }
    busy = true;
    const r = endTurn(state);
    save();
    busy = false;
    if (!r.ok) { toast(r.reason); return; }
    if (r.next === 'turn') {
      refresh();
      await passDevice();
      await beginPlayerTurn();
    } else {
      await flow();
    }
  }

  // ---------- Main flow between phases ----------
  async function flow() {
    while (true) {
      refresh();
      await presentNew();
      switch (state.phase) {
        case 'roundStart':
        case 'chronicle':
          advance(state);
          save();
          continue;
        case 'event':
          advance(state);
          save();
          refresh();
          await passDevice();
          await beginPlayerTurn();
          return;
        case 'actions':
          refresh();
          await passDevice();
          await beginPlayerTurn();
          return;
        case 'plague':
          advance(state);
          save();
          continue;
        case 'ended':
          music.setMood('menu');
          cleanup();
          onEnd(state);
          return;
        default:
          return;
      }
    }
  }

  refresh();
  flow();
}
