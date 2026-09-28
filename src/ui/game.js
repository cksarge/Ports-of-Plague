// The game screen: board, sidebar, turn flow, actions, cards and dice.
// With `room` set (multi-device play) this is the big screen: players make
// their choices on their own devices and the requests arrive here.
import { DATA, CITIES } from '../data.js';
import {
  C, advance, endTurn, decide, currentPlayer, performAction, checkAction,
  scorePlayer, familyTotal, cardById,
  roundInfo, totalRounds, roundNumber, fortuneById,
} from '../engine/index.js';
import { $, $$, esc, openDialog, dialogOpen, toast, announce, crestSvg } from './dom.js';
import { createMap, updateMap, animateShipment, animateStrike, redrawStains, startAmbient, floatText } from './map.js';
import { noteHtml } from './notes.js';
import { showRules, showJournal, showCity } from './panels.js';
import { sfx, isMuted, setMuted, isMusicOn, setMusicOn } from './sound.js';
import { music } from './music.js';
import { saveGame } from './save.js';
import { heraldicBanner } from './art.js';
import { housePanelHtml, actionsPanelHtml, hintFor, quickBlock, actionPrompt, decisionPrompt, endTurnPrompt } from './prompts.js';
import { validateIntent, ACT, DECIDE, END, NEXT } from '../net/protocol.js';
import { JOIN_ADDRESS } from '../net/config.js';
import { zoomToFit, fitsHeight, fitsWidth } from './fit.js';
import { storyCard, storyHtml } from './stories.js';

// Keeps the big screen from going dark during a multi-device game (where the
// browser supports it; the lock is dropped whenever the tab is hidden).
function keepScreenOn() {
  let lock = null;
  let on = true;
  const get = async () => {
    try { if (on && document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed here */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') get(); };
  document.addEventListener('visibilitychange', onVisible);
  get();
  return { release() { on = false; document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); } };
}

export function startGame(app, state, ui, { onExit, onEnd, room = null }) {
  const remote = !!room;
  app.onkeydown = null;
  ui.seenSeq ??= 0;
  ui.lastNote ??= [];
  let svg;
  let busy = false;
  let passing = false;
  let mapSel = {};
  // Story cards open on the big screen; any player's device may press Next.
  let stories = [];
  let storySeq = 0;
  let pushTimer = null;
  let left = false; // this screen was closed (menu or end of game)

  const save = () => { saveGame(state, ui); push(); };
  const player = () => currentPlayer(state);

  // ---------- Layout ----------
  app.innerHTML = `<div class="game ${remote ? 'big' : ''}">
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
      <aside class="sidebar" id="sidebar" aria-label="Game panel">${remote ? '<div class="sidebar-fit"></div>' : ''}</aside>
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
    fitScreen();
  }
  function toggleMusic() {
    setMusicOn(!isMusicOn());
    const b = $('#btn-music', app);
    b.setAttribute('aria-pressed', isMusicOn());
    b.innerHTML = `${isMusicOn() ? 'Music on' : 'Music off'} <span class="key">N</span>`;
    toast(isMusicOn() ? 'Music on' : 'Music off', 1200);
    fitScreen();
  }

  const onKey = (e) => {
    if (dialogOpen() || passing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches?.('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); showRules(); return; }
    if (k === 'j') { e.preventDefault(); showJournal(state.journal); return; }
    if (k === 'm') { e.preventDefault(); toggleMute(); return; }
    if (k === 'n') { e.preventDefault(); toggleMusic(); return; }
    if (state.phase !== 'actions' || busy || remote) return;
    const a = DATA.actions.find((x) => x.key === k);
    if (a) { e.preventDefault(); startAction(a.id); }
    if (k === 'e') { e.preventDefault(); tryEndTurn(); }
  };
  document.addEventListener('keydown', onKey);
  const wake = remote ? keepScreenOn() : null;
  const onResize = () => { fitScreen(); stories.forEach((s) => s.fit?.()); };
  if (remote) {
    document.body.classList.add('big-screen');
    window.addEventListener('resize', onResize);
  }
  const cleanup = () => {
    left = true;
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('big-screen');
    window.removeEventListener('resize', onResize);
    stopAmbient();
    wake?.release();
    if (remote) room.onIntent = room.onChange = () => {};
  };

  // ---------- Multiple devices ----------
  // What the players' devices need besides the state: the story card waiting
  // for Next (if any), and whether the big screen is busy.
  function view() {
    const top = stories.at(-1);
    return { next: top ? { id: top.id, label: top.label, title: top.title, kind: top.kind, data: top.data } : null, busy, hints: !!ui.hints, note: ui.lastNote };
  }
  function push() {
    if (!remote || left) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => room.pushState(state, view()), 60);
  }
  // A story card (see stories.js). On multiple devices, Next on any player's
  // device closes it too, and every device can open the same card to read it.
  function story(kind, data, { after } = {}) {
    const card = storyCard(state, kind, data, { hints: !!ui.hints, big: remote });
    const html = storyHtml(card, `<button class="btn primary" data-value="ok" autofocus>${esc(card.button)}</button>`);
    const mount = (d) => { const done = card.mount?.(d); if (after) Promise.resolve(done).then(after); };
    if (!remote) return openDialog(html, { ...card.opts, onMount: mount });
    const entry = { id: ++storySeq, title: card.opts.label ?? 'Continue', label: card.button, kind, data };
    return openDialog(html, {
      ...card.opts,
      onMount: (d, close) => {
        entry.close = close;
        entry.fit = fitDialog(d);
        stories.push(entry);
        push();
        mount(d);
      },
    }).then((v) => {
      stories = stories.filter((s) => s !== entry);
      push();
      return v;
    });
  }
  // Shrinks a card just enough to show all of it without scrolling.
  function fitDialog(d) {
    const scroll = d.querySelector('.frame-scroll');
    if (!scroll) return null;
    d.classList.add('fitted');
    const inner = document.createElement('div');
    inner.className = 'fit';
    while (scroll.firstChild) inner.appendChild(scroll.firstChild);
    scroll.appendChild(inner);
    // Measured with animations off: a card's opening flip makes it look taller.
    const fit = () => {
      d.classList.add('measuring');
      zoomToFit(inner, fitsHeight(scroll), 0.45);
      d.classList.remove('measuring');
    };
    fit();
    return fit;
  }
  // The big screen: the top bar and the sidebar always fit, with no scrolling.
  // The sidebar first leaves out the oldest chronicle lines, then the
  // chronicle, then the historical note, and only then shrinks.
  function fitScreen() {
    if (!remote || left) return;
    const bar = $('.topbar', app);
    zoomToFit(bar, fitsWidth(bar), 0.6);
    const sb = $('#sidebar', app);
    const inner = $('.sidebar-fit', sb);
    const fits = fitsHeight(sb);
    inner.style.zoom = '';
    const lines = () => $$('.log li', sb);
    while (!fits() && lines().length > 2) lines().at(-1).remove();
    if (!fits()) $('.log-panel', sb)?.remove();
    if (!fits()) $('.note-panel', sb)?.remove();
    zoomToFit(inner, fits, 0.55);
  }
  // A short message on the big screen, and on the current player's device.
  function notify(text, ms) {
    toast(text, ms);
    const p = player();
    if (remote && p) room.toast(p.id, text);
  }
  async function handleRequest(msg) {
    const seat = room.seats.findIndex((s) => s.cid === msg.from);
    const problem = validateIntent(state, room.seats, msg);
    if (problem) { room.toast(seat, problem); return; }
    if (msg.t === NEXT) {
      const top = stories.at(-1);
      if (top?.id === msg.id) top.close('ok');
      return;
    }
    if (busy || passing || stories.length) { room.toast(seat, 'Please wait…'); return; }
    const p = player();
    if (msg.t === ACT) await runAction(p, msg.action);
    else if (msg.t === DECIDE) {
      busy = true;
      try { await applyDecision(p, p.pending[0], msg.choice); } finally { busy = false; }
    } else if (msg.t === END) await finishTurn();
  }
  if (remote) {
    room.onIntent = (msg) => {
      handleRequest(msg).catch((err) => console.error(err)).finally(() => { room.handled(msg); refresh(); });
    };
    room.onChange = () => {
      if (ui.room) ui.room.seats = room.savedSeats();
      refresh();
    };
  }

  // ---------- Rendering ----------
  function refresh() {
    if (left) return;
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
    push();
  }

  function renderSidebar() {
    const p = player();
    const sb = $('#sidebar', app);
    const parts = [];
    if (remote) parts.push(`<div class="room-chip">Room <strong>${esc(room.code)}</strong> <span>· join at ${esc(JOIN_ADDRESS)}</span></div>`);
    if (p) {
      parts.push(housePanelHtml(state, p));
      const hint = remote ? null : hintFor(state, p, ui.hints);
      if (hint) parts.push(`<div class="hint" role="note"><strong>Hint:</strong> ${hint}</div>`);
      if (remote) {
        const seat = room.seats[p.id];
        parts.push(`<section class="panel actions-panel waiting-panel" aria-label="Waiting"><h2>Actions</h2>
          <p><strong>${esc(p.name)}</strong> is choosing on their own device.</p>
          ${seat?.online ? '' : `<p class="error">This device is not connected. Open ${esc(JOIN_ADDRESS)} and join room <strong>${esc(room.code)}</strong> with the house name “${esc(p.name)}”.</p>`}</section>`);
      } else {
        parts.push(actionsPanelHtml(state, p, { busy }));
      }
    } else {
      parts.push(`<section class="panel"><h2>${state.phase === 'plague' ? 'The plague takes its toll' : 'The chronicle unfolds'}</h2><p>${remote ? 'Read the cards as they appear. Anyone can press Next on their device.' : 'Read the cards as they appear.'} Players take turns in the order rolled at the start.</p></section>`);
    }
    if (ui.lastNote.length) parts.push(`<section class="panel note-panel" aria-label="Latest historical note"><h2>Latest Historical Note</h2>${noteHtml(ui.lastNote, 'From the chronicles')}</section>`);
    parts.push(`<section class="panel houses-panel" aria-label="All houses"><h2>Houses (turn order)</h2><div class="houses">
      ${state.order.map((id, i) => {
        const h = state.players[id];
        const sc = scorePlayer(h);
        const link = remote ? `<span class="link-dot ${room.seats[id]?.online ? 'on' : ''}" title="${room.seats[id]?.online ? 'Device connected' : 'Device not connected'}"></span>` : '';
        return `<div class="house-row ${p && p.id === id ? 'current' : ''}" style="--house:${h.color}">${crestSvg(h, 20)}
          <span><strong>${i + 1}. ${esc(h.name)}</strong>${link}<br><small>${h.florins}ƒ · rep ${h.reputation} · family ${familyTotal(h)} · ${h.posts.length} post${h.posts.length > 1 ? 's' : ''}</small></span>
          <span title="Legacy score"><strong>${sc.total}</strong></span></div>`;
      }).join('')}</div></section>`);
    const recent = state.log.filter((e) => e.text && !['turn'].includes(e.type)).slice(-10).reverse();
    parts.push(`<section class="panel log-panel" aria-label="Chronicle log"><h2>Chronicle</h2><ol class="log" reversed>${recent.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ol></section>`);
    if (remote) {
      $('.sidebar-fit', sb).innerHTML = parts.join('');
      fitScreen();
      return;
    }
    sb.innerHTML = parts.join('');
    $$('[data-action]', sb).forEach((b) => (b.onclick = () => startAction(b.dataset.action)));
    const end = $('#end-turn', sb);
    if (end) end.onclick = tryEndTurn;
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
    await story('prologue', { e });
    setNote(e.factIds);
  }

  // Each house rolls a die; the highest goes first (ties roll again).
  async function showTurnOrder(e) {
    sfx.bell();
    await story('order', { e }, { after: () => sfx.fanfare() });
  }

  async function showRoundStart(group) {
    const [head, ...arrivals] = group;
    refresh();
    sfx.bell();
    setTimeout(() => sfx.stamp(), 250);
    if (arrivals.length) setTimeout(() => sfx.plague(), 900);
    await story('round', { group });
    for (const a of arrivals) if (a.type === 'arrival') animateStrike(svg, a.city);
    setNote(head.factIds);
    refresh();
  }

  async function showCard(group) {
    const card = cardById(group[0].card);
    if (card.theme === 'persecution') sfx.knell(); else sfx.page();
    await story('card', { group });
    setNote(card.factIds);
    refresh();
  }

  async function showFortune(e) {
    const card = fortuneById(e.card);
    if (card.tone === 'bad') sfx.misfortune(); else sfx.fortune();
    await story('fortune', { e });
    setNote(card.factIds);
    refresh();
  }

  async function showPlague(group) {
    refresh();
    music.setMood('plague');
    if (group.some((e) => e.deaths > 0)) setTimeout(() => sfx.knell(), 1000); else sfx.low();
    await story('plague', { group });
    music.setMood('calm');
    redrawStains(svg, state);
    refresh();
  }

  // ---------- Pass the device ----------
  function passDevice() {
    const p = player();
    if (remote) {
      // Everyone has their own device: just announce whose turn it is.
      sfx.fanfare();
      announce(`${p.name}'s turn`);
      return Promise.resolve();
    }
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
  // On multiple devices the player's own device asks, and the host waits for
  // its request (see handleRequest).
  async function beginPlayerTurn() {
    refresh();
    if (remote) return;
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
    const pr = decisionPrompt(state, p, d);
    await applyDecision(p, d, pr.parse(await openDialog(pr.html, pr.opts)));
  }

  async function applyDecision(p, d, choice) {
    const r = decide(state, choice);
    if (!r.ok) { notify(r.reason); return; }
    save();
    markSeen(r.entry.seq);
    if (d.kind === 'deal') {
      if (choice) sfx.coin();
      notify(r.entry.text, 4500);
      setNote(['TR-04']);
      return;
    }
    const card = cardById(d.card);
    if (d.kind === 'wageLaw' && choice === 'pay') {
      await story('wage', { entry: r.entry });
    } else if (d.reveal && choice) {
      await story('reveal', { cardId: card.id, entry: r.entry });
    } else {
      notify(r.entry.text, 4000);
    }
    if (choice && d.kind !== 'wageLaw') sfx.coin();
    setNote(card.factIds);
  }

  // ---------- Actions ----------
  async function startAction(id) {
    const p = player();
    if (!p || busy || passing || remote) return;
    const why = quickBlock(state, id, p, busy);
    if (why) { sfx.error(); toast(why); return; }
    busy = true;
    let action;
    try {
      action = await chooseAction(id, p);
    } finally {
      busy = false;
    }
    if (action) await runAction(p, action);
    else { mapSel = {}; refresh(); }
  }

  async function runAction(p, action) {
    busy = true;
    try {
      const reason = checkAction(state, action);
      if (reason) { sfx.error(); notify(reason, 4500); return; }
      const res = performAction(state, action);
      if (!res.ok) { notify(res.reason, 4500); return; }
      save();
      await showActionResult(res.entry, p);
      markSeen(res.entry.seq);
      await presentNew(); // Fortune cards drawn by this action
      if (!remote) await answerPending(p); // Fortune offers must be answered straight away
    } finally {
      busy = false;
      mapSel = {};
      refresh();
      if (!remote && p.ap === 0) $('#end-turn', app)?.focus();
    }
  }

  function chooseAction(id, p) {
    const pr = actionPrompt(state, p, id);
    if (!pr) return null;
    if (pr.selectable) {
      mapSel = { selectable: pr.selectable };
      updateMap(svg, state, mapSel);
    }
    const opts = pr.routes ? { ...pr.opts, onMount: (d) => hoverRoutes(d) } : pr.opts;
    return openDialog(pr.html, opts).then(pr.parse);
  }

  function hoverRoutes(d) {
    const show = (el) => {
      const r = el?.closest('[data-route]')?.dataset.route;
      updateMap(svg, state, { highlightRoutes: r ? [r] : [] });
    };
    d.addEventListener('mouseover', (e) => show(e.target));
    d.addEventListener('focusin', (e) => show(e.target));
  }

  async function showActionResult(e, p) {
    setNote(e.factIds);
    if (e.type === 'ship') {
      refresh();
      if (DATA.routes.find((r) => r.id === e.route)?.type === 'sea') sfx.sail(); else sfx.cart();
      await animateShipment(svg, e.route, e.from, p.color, e.infected);
      floatText(svg, e.to, `+${e.profit}ƒ`, 'gain');
      if (e.infected) floatText(svg, e.from, 'Infected!', 'loss');
      if (e.infected) sfx.plague(); else sfx.coin();
      await story('ship', { e });
      if (e.spread === 'early') {
        animateStrike(svg, e.to);
        const arrival = state.log.find((x) => x.type === 'arrival' && x.city === e.to && x.early);
        if (arrival) await story('spread', { arrival });
      }
      return;
    }
    if (e.type === 'physician') {
      await story('physician', { e });
      return;
    }
    if (e.type === 'post') floatText(svg, e.city, 'New post!', 'gain');
    if (e.type === 'charity') floatText(svg, p.home, '+rep', 'gain');
    if (e.type === 'marry') floatText(svg, e.city, '+1 family', 'gain');
    if (e.type === 'land') floatText(svg, e.city, 'Land!', 'gain');
    if (e.type === 'loan') floatText(svg, p.home, `+${C.gains.loan}ƒ`, 'gain');
    if (e.type === 'gates') floatText(svg, e.city, 'Gates closed', 'loss');
    sfx.coin();
    notify(e.text, 4200);
  }

  async function tryEndTurn() {
    const p = player();
    if (!p || busy || passing || remote) return;
    if (p.pending.length) { toast('Answer the card first.'); return; }
    if (p.ap > 0) {
      const pr = endTurnPrompt(p);
      if (!pr.parse(await openDialog(pr.html, pr.opts))) return;
    }
    await finishTurn();
  }

  async function finishTurn() {
    busy = true;
    const r = endTurn(state);
    save();
    busy = false;
    if (!r.ok) { notify(r.reason); return; }
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
          if (remote) { clearTimeout(pushTimer); room.pushState(state, view()); }
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
